#!/usr/bin/env node

/**
 * Historical Research Snapshot V1 — PREVIEW / artifact-only capture.
 *
 * This job:
 * - makes CFBD provider reads only;
 * - writes immutable raw response bytes + audit artifacts to the Actions workspace;
 * - makes zero database connections and zero production mutations;
 * - hard-caps provider calls;
 * - does not declare historical market or Elo rows predictive-safe.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS,
  HISTORICAL_SNAPSHOT_VERSION,
  assertHistoricalSnapshotSeason,
  historicalSnapshotConfirmation,
  historicalSnapshotSeasonRole,
  buildCfbdUrl,
  buildHistoricalGamesRequest,
  buildHistoricalSnapshotPlan,
  countCompletedFbsVsFbsRegularGames,
  countRowsWhere,
  isCompletedFbsVsFbsRegularGame,
  isFbsVsFbsRegularGame,
  sha256Bytes,
  uniqueNumericIds,
  type HistoricalGameLike,
  type HistoricalSnapshotRequest,
} from './src/research/historical-research-snapshot-v1';

interface Args {
  season: number;
  confirm: string;
  outputDir: string;
}

interface ArtifactDigest {
  file: string;
  bytes: number;
  sha256: string;
}

interface ProviderCallRecord {
  sequence: number;
  requestId: string;
  endpoint: string;
  query: Record<string, string>;
  httpStatus: number | null;
  ok: boolean;
  rowCount: number | null;
  rawFile: string | null;
  rawBytes: number | null;
  rawSha256: string | null;
  rateLimitLimit: string | null;
  rateLimitRemaining: string | null;
  errorCode: string | null;
}

interface FetchCapture {
  call: ProviderCallRecord;
  rows: unknown[];
  artifact: ArtifactDigest;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error('unexpected positional argument');
    const value = argv[++i];
    if (value === undefined) throw new Error('missing value for ' + key);
    values.set(key, value);
  }

  const season = Number(values.get('--season'));
  const confirm = values.get('--confirm') ?? '';
  const outputDir = values.get('--output-dir') ?? '';

  assertHistoricalSnapshotSeason(season);
  if (confirm !== historicalSnapshotConfirmation(season)) {
    throw new Error('exact historical snapshot confirmation is required');
  }
  if (!outputDir) throw new Error('--output-dir is required');

  return { season, confirm, outputDir };
}

function repoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('invalid git HEAD sha');
  }
  return sha;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeExclusive(filePath: string, data: string | Buffer): ArtifactDigest {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data, { flag: 'wx' });
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  return {
    file: filePath,
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function writeJsonExclusive(filePath: string, value: unknown): ArtifactDigest {
  return writeExclusive(filePath, JSON.stringify(value, null, 2) + '\n');
}

function safeId(id: string): string {
  return id.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/CFBD_API_KEY/i.test(message)) return 'missing_cfbd_api_key';
  if (/redirect/i.test(message)) return 'cfbd_redirect_refused';
  if (/HTTP/i.test(message)) return 'cfbd_http_error';
  if (/provider call budget/i.test(message)) return 'provider_call_budget_exceeded';
  if (/array/i.test(message)) return 'provider_payload_not_array';
  if (/confirmation/i.test(message)) return 'invalid_confirmation';
  if (/historical snapshot v1 season must/i.test(message)) return 'invalid_season';
  if (/EEXIST/i.test(message)) return 'artifact_path_already_exists';
  return 'historical_snapshot_capture_failed';
}

function rowObject(row: unknown): Record<string, unknown> | null {
  return row !== null && typeof row === 'object' && !Array.isArray(row)
    ? (row as Record<string, unknown>)
    : null;
}

function canonicalFbsGameIds(
  rows: HistoricalGameLike[],
  season: number
): Set<number> {
  return new Set(
    rows
      .filter((row) => isCompletedFbsVsFbsRegularGame(row, season))
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0)
  );
}

function canonicalFbsTeamNames(
  rows: HistoricalGameLike[],
  season: number
): Set<string> {
  const teams = new Set<string>();
  for (const row of rows) {
    if (!isCompletedFbsVsFbsRegularGame(row, season)) continue;
    const obj = rowObject(row);
    if (!obj) continue;
    for (const key of ['homeTeam', 'awayTeam']) {
      const value = obj[key];
      if (typeof value === 'string' && value.trim()) teams.add(value.trim());
    }
  }
  return teams;
}

function rowsForCanonicalGames(
  rows: unknown[],
  gameIds: Set<number>,
  gameIdKey: string
): unknown[] {
  return rows.filter((row) => {
    const obj = rowObject(row);
    if (!obj) return false;
    const gameId = Number(obj[gameIdKey]);
    return Number.isInteger(gameId) && gameIds.has(gameId);
  });
}

function namedTeamCoverage(
  rows: unknown[],
  canonicalTeams: Set<string>,
  key = 'team'
): {
  matchedTeams: number;
  missingTeams: string[];
} {
  const observed = new Set<string>();
  for (const row of rows) {
    const obj = rowObject(row);
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) observed.add(value.trim());
  }
  const missingTeams = [...canonicalTeams]
    .filter((team) => !observed.has(team))
    .sort();
  return {
    matchedTeams: canonicalTeams.size - missingTeams.length,
    missingTeams,
  };
}

function recruitingCanonicalCoverage(
  captures: Map<string, FetchCapture>,
  canonicalTeams: Set<string>
): Record<string, { matchedTeams: number; missingTeams: string[] }> {
  const result: Record<
    string,
    { matchedTeams: number; missingTeams: string[] }
  > = {};
  for (const [id, capture] of captures) {
    if (!id.startsWith('recruiting-teams-')) continue;
    result[id.replace('recruiting-teams-', '')] = namedTeamCoverage(
      capture.rows,
      canonicalTeams
    );
  }
  return result;
}

async function captureRequest(
  baseUrl: string,
  apiKey: string,
  outputDir: string,
  sequence: number,
  requestSpec: HistoricalSnapshotRequest
): Promise<FetchCapture> {
  if (sequence > HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS) {
    throw new Error('provider call budget exceeded');
  }

  const url = buildCfbdUrl(baseUrl, requestSpec);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  let response: Response | null = null;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'gridiron-edge-historical-research-snapshot-v1/1.0',
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response) {
    throw new Error('CFBD request failed before response');
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error('CFBD redirect refused');
  }

  const rawBytes = Buffer.from(await response.arrayBuffer());
  const rawRelative = path.join(
    'raw',
    `${String(sequence).padStart(3, '0')}-${safeId(requestSpec.id)}.json`
  );
  const rawPath = path.join(outputDir, rawRelative);
  const artifact = writeExclusive(rawPath, rawBytes);

  const baseCall: Omit<ProviderCallRecord, 'ok' | 'rowCount' | 'errorCode'> = {
    sequence,
    requestId: requestSpec.id,
    endpoint: requestSpec.endpoint,
    query: requestSpec.query,
    httpStatus: response.status,
    rawFile: rawRelative,
    rawBytes: rawBytes.length,
    rawSha256: artifact.sha256,
    rateLimitLimit: response.headers.get('x-ratelimit-limit'),
    rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
  };

  if (!response.ok) {
    return {
      call: {
        ...baseCall,
        ok: false,
        rowCount: null,
        errorCode: 'cfbd_http_error',
      },
      rows: [],
      artifact: {
        ...artifact,
        file: rawRelative,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBytes.toString('utf8'));
  } catch {
    throw new Error('provider payload is not valid JSON array');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('provider payload is not an array');
  }

  return {
    call: {
      ...baseCall,
      ok: true,
      rowCount: parsed.length,
      errorCode: null,
    },
    rows: parsed,
    artifact: {
      ...artifact,
      file: rawRelative,
    },
  };
}

function requestRows(
  captures: Map<string, FetchCapture>,
  requestId: string
): unknown[] {
  return captures.get(requestId)?.rows ?? [];
}

function fbsLineGameCount(rows: unknown[]): number {
  return countRowsWhere(
    rows,
    (row) =>
      String(row.homeClassification ?? '').toLowerCase() === 'fbs' &&
      String(row.awayClassification ?? '').toLowerCase() === 'fbs'
  );
}

function recruitingCounts(captures: Map<string, FetchCapture>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [id, capture] of captures) {
    if (id.startsWith('recruiting-teams-')) {
      result[id.replace('recruiting-teams-', '')] = capture.rows.length;
    }
  }
  return result;
}

function weeklyEloCounts(captures: Map<string, FetchCapture>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [id, capture] of captures) {
    if (id.startsWith('elo-week-')) {
      result[String(Number(id.replace('elo-week-', '')))] = capture.rows.length;
    }
  }
  return result;
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error('[historical-snapshot] ' + sanitizeError(error));
    process.exit(1);
    return;
  }

  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    console.error('[historical-snapshot] missing_cfbd_api_key');
    process.exit(1);
    return;
  }

  const baseUrl =
    process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const observedAtStart = new Date().toISOString();
  const commitSha = repoCommitSha();
  const captures = new Map<string, FetchCapture>();
  const calls: ProviderCallRecord[] = [];
  const artifacts: ArtifactDigest[] = [];
  let providerCallsAttempted = 0;
  let lastAttemptedRequestId: string | null = null;

  ensureDir(args.outputDir);

  try {
    // Games is the first provider call because it defines the observed regular
    // FBS-vs-FBS week universe used to construct the remainder of the plan.
    const gamesRequest = buildHistoricalGamesRequest(args.season);
    providerCallsAttempted += 1;
    lastAttemptedRequestId = gamesRequest.id;
    const gamesCapture = await captureRequest(
      baseUrl,
      apiKey,
      args.outputDir,
      providerCallsAttempted,
      gamesRequest
    );
    captures.set(gamesRequest.id, gamesCapture);
    calls.push(gamesCapture.call);
    artifacts.push(gamesCapture.artifact);
    if (!gamesCapture.call.ok) {
      throw new Error(`CFBD HTTP ${gamesCapture.call.httpStatus ?? 'unknown'}`);
    }

    const gamesRows = gamesCapture.rows as HistoricalGameLike[];
    const plan = buildHistoricalSnapshotPlan(args.season, gamesRows);

    for (let index = 1; index < plan.requests.length; index += 1) {
      const requestSpec = plan.requests[index];
      providerCallsAttempted += 1;
      lastAttemptedRequestId = requestSpec.id;
      const capture = await captureRequest(
        baseUrl,
        apiKey,
        args.outputDir,
        providerCallsAttempted,
        requestSpec
      );
      captures.set(requestSpec.id, capture);
      calls.push(capture.call);
      artifacts.push(capture.artifact);
      if (!capture.call.ok) {
        throw new Error(`CFBD HTTP ${capture.call.httpStatus ?? 'unknown'}`);
      }

      // Be deliberately gentle even though the monthly call budget is large.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const fbsGames = gamesRows.filter((row) =>
      isFbsVsFbsRegularGame(row, args.season)
    );
    const canonicalGameIds = canonicalFbsGameIds(gamesRows, args.season);
    const canonicalTeams = canonicalFbsTeamNames(gamesRows, args.season);
    const advancedRows = requestRows(captures, 'advanced-game-stats');
    const ppaRows = requestRows(captures, 'ppa-games');
    const lineRows = requestRows(captures, 'lines');
    const advancedCanonicalRows = rowsForCanonicalGames(
      advancedRows,
      canonicalGameIds,
      'gameId'
    );
    const ppaCanonicalRows = rowsForCanonicalGames(
      ppaRows,
      canonicalGameIds,
      'gameId'
    );
    const talentRows = requestRows(captures, 'talent');
    const returningRows = requestRows(captures, 'returning-production');
    const preseasonEloRows = requestRows(captures, 'elo-preseason');

    const coverage = {
      providerGamesRows: gamesRows.length,
      fbsVsFbsRegularGames: fbsGames.length,
      completedFbsVsFbsRegularGames: countCompletedFbsVsFbsRegularGames(
        gamesRows,
        args.season
      ),
      canonicalFbsTeamCount: canonicalTeams.size,
      observedFbsVsFbsRegularWeeks: plan.observedFbsVsFbsRegularWeeks,
      historicalLinesRows: lineRows.length,
      fbsVsFbsHistoricalLineGames: fbsLineGameCount(lineRows),
      advancedProviderRows: advancedRows.length,
      advancedProviderUniqueGames: uniqueNumericIds(
        advancedRows,
        'gameId'
      ).length,
      advancedCanonicalTeamGameRows: advancedCanonicalRows.length,
      advancedCanonicalUniqueGames: uniqueNumericIds(
        advancedCanonicalRows,
        'gameId'
      ).length,
      ppaProviderRows: ppaRows.length,
      ppaProviderUniqueGames: uniqueNumericIds(ppaRows, 'gameId').length,
      ppaCanonicalTeamGameRows: ppaCanonicalRows.length,
      ppaCanonicalUniqueGames: uniqueNumericIds(
        ppaCanonicalRows,
        'gameId'
      ).length,
      talentRows: talentRows.length,
      talentCanonicalCoverage: namedTeamCoverage(
        talentRows,
        canonicalTeams
      ),
      returningProductionRows: returningRows.length,
      returningProductionCanonicalCoverage: namedTeamCoverage(
        returningRows,
        canonicalTeams
      ),
      transferPortalRows: requestRows(captures, 'transfer-portal').length,
      recruitingTeamRowsByClass: recruitingCounts(captures),
      recruitingCanonicalCoverageByClass: recruitingCanonicalCoverage(
        captures,
        canonicalTeams
      ),
      eloPreseasonRows: preseasonEloRows.length,
      eloPreseasonCanonicalCoverage: namedTeamCoverage(
        preseasonEloRows,
        canonicalTeams
      ),
      eloWeeklyRowsByWeek: weeklyEloCounts(captures),
    };

    const qaFindings: string[] = [];
    if (
      calls.length !== plan.providerCallCount ||
      providerCallsAttempted !== plan.providerCallCount
    ) {
      qaFindings.push('provider_call_count_mismatch');
    }
    if (providerCallsAttempted > HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS) {
      qaFindings.push('provider_call_budget_exceeded');
    }
    if (coverage.fbsVsFbsRegularGames === 0) {
      qaFindings.push('no_fbs_vs_fbs_regular_games');
    }
    if (coverage.fbsVsFbsHistoricalLineGames === 0) {
      qaFindings.push('no_fbs_vs_fbs_historical_lines');
    }
    if (
      coverage.advancedCanonicalUniqueGames !==
        coverage.completedFbsVsFbsRegularGames ||
      coverage.advancedCanonicalTeamGameRows !==
        coverage.completedFbsVsFbsRegularGames * 2
    ) {
      qaFindings.push('incomplete_canonical_advanced_game_coverage');
    }
    if (
      coverage.ppaCanonicalUniqueGames !==
        coverage.completedFbsVsFbsRegularGames ||
      coverage.ppaCanonicalTeamGameRows !==
        coverage.completedFbsVsFbsRegularGames * 2
    ) {
      qaFindings.push('incomplete_canonical_ppa_game_coverage');
    }
    if (coverage.eloPreseasonRows === 0) {
      qaFindings.push('no_preseason_elo');
    }

    const report = {
      version: HISTORICAL_SNAPSHOT_VERSION,
      mode: 'RESEARCH_PREVIEW_ARTIFACT_ONLY',
      season: args.season,
      seasonType: 'regular',
      repoCommitSha: commitSha,
      observedAtStart,
      observedAtEnd: new Date().toISOString(),
      qaPass: qaFindings.length === 0,
      qaFindings,
      provider: {
        name: 'CFBD',
        callsAttempted: providerCallsAttempted,
        callsSucceeded: calls.filter((call) => call.ok).length,
        hardCallCeiling: HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS,
        calls,
      },
      plan: {
        observedFbsVsFbsRegularWeeks: plan.observedFbsVsFbsRegularWeeks,
        providerCallCount: plan.providerCallCount,
        requestIds: plan.requests.map((requestSpec) => requestSpec.id),
      },
      coverage,
      leakageBoundaries: {
        historicalBettingLines:
          'EVALUATION_ONLY_NOT_PREDICTIVE_FEATURES_UNTIL_SEPARATE_POINT_IN_TIME_CONTRACT',
        gameScoresAndPostgameFields:
          'OUTCOME_ONLY_NOT_PREDICTIVE_FEATURES',
        weeklyElo:
          'ARCHIVED_FOR_SEMANTIC_VALIDATION_NOT_POINT_IN_TIME_SAFE_BY_THIS_CAPTURE',
        retrospectiveCoreRatings:
          'NOT_CAPTURED_NOT_PROSPECTIVE_EVIDENCE',
        seasonRole: historicalSnapshotSeasonRole(args.season),
      },
      execution: {
        databaseReads: false,
        databaseWrites: false,
        prismaClientInstantiated: false,
        prismaGenerateInvoked: false,
        mutationsInvoked: false,
        mutationTargetsInvoked: [],
        oddsApiInvoked: false,
        sgoInvoked: false,
        weatherInvoked: false,
        ratingsWrites: false,
        shadowWrites: false,
        betWrites: false,
        gameWrites: false,
        lifecycleWrites: false,
        migrationsInvoked: false,
      },
    };

    const reportArtifact = writeJsonExclusive(
      path.join(args.outputDir, 'report.json'),
      report
    );
    artifacts.push({ ...reportArtifact, file: 'report.json' });

    const manifest = {
      version: HISTORICAL_SNAPSHOT_VERSION,
      season: args.season,
      repoCommitSha: commitSha,
      generatedAt: new Date().toISOString(),
      providerCalls: providerCallsAttempted,
      artifacts,
    };
    writeJsonExclusive(path.join(args.outputDir, 'manifest.json'), manifest);

    console.log(
      JSON.stringify(
        {
          qaPass: report.qaPass,
          qaFindings,
          season: args.season,
          repoCommitSha: commitSha,
          providerCalls: providerCallsAttempted,
          hardCallCeiling: HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS,
          fbsVsFbsRegularGames: coverage.fbsVsFbsRegularGames,
          completedFbsVsFbsRegularGames:
            coverage.completedFbsVsFbsRegularGames,
          observedWeeks: plan.observedFbsVsFbsRegularWeeks,
          fbsVsFbsHistoricalLineGames:
            coverage.fbsVsFbsHistoricalLineGames,
          advancedCanonicalUniqueGames:
            coverage.advancedCanonicalUniqueGames,
          ppaCanonicalUniqueGames: coverage.ppaCanonicalUniqueGames,
          talentRows: coverage.talentRows,
          returningProductionRows: coverage.returningProductionRows,
          transferPortalRows: coverage.transferPortalRows,
          eloPreseasonRows: coverage.eloPreseasonRows,
          databaseWrites: false,
          outputDir: args.outputDir,
        },
        null,
        2
      )
    );

    process.exit(report.qaPass ? 0 : 2);
  } catch (error) {
    const errorCode = sanitizeError(error);
    console.error('[historical-snapshot] ' + errorCode);

    const failureReport = {
      version: HISTORICAL_SNAPSHOT_VERSION,
      mode: 'RESEARCH_PREVIEW_ARTIFACT_ONLY',
      season: args.season,
      repoCommitSha: commitSha,
      observedAtStart,
      observedAtEnd: new Date().toISOString(),
      qaPass: false,
      qaFindings: [errorCode],
      provider: {
        name: 'CFBD',
        callsAttempted: providerCallsAttempted,
        callsSucceeded: calls.filter((call) => call.ok).length,
        hardCallCeiling: HISTORICAL_SNAPSHOT_MAX_PROVIDER_CALLS,
        lastAttemptedRequestId,
        calls,
      },
      execution: {
        databaseReads: false,
        databaseWrites: false,
        prismaClientInstantiated: false,
        prismaGenerateInvoked: false,
        mutationsInvoked: false,
        mutationTargetsInvoked: [],
        migrationsInvoked: false,
      },
    };

    try {
      const reportArtifact = writeJsonExclusive(
        path.join(args.outputDir, 'report.json'),
        failureReport
      );
      artifacts.push({ ...reportArtifact, file: 'report.json' });
      writeJsonExclusive(path.join(args.outputDir, 'manifest.json'), {
        version: HISTORICAL_SNAPSHOT_VERSION,
        season: args.season,
        repoCommitSha: commitSha,
        generatedAt: new Date().toISOString(),
        providerCalls: providerCallsAttempted,
        artifacts,
      });
    } catch {
      console.error('[historical-snapshot] failure_artifact_write_failed');
    }

    process.exit(1);
  }
}

if (require.main === module) {
  void main();
}
