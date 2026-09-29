#!/usr/bin/env node

import * as crypto from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  HISTORICAL_V3_WEEK_QUERY_ENDPOINT,
  HISTORICAL_V3_WEEK_QUERY_MAX_PROVIDER_CALLS,
  HISTORICAL_V3_WEEK_QUERY_RESOLUTION_VERSION,
  buildHistoricalV3QualificationRequests,
  buildHistoricalV3RecoveryRequests,
  collectHistoricalV3RecoveryRows,
  compareHistoricalV3QualificationGame,
  selectHistoricalV3CalibrationGames,
  summarizeHistoricalV3Qualification,
  type HistoricalV3CalibrationGame,
  type HistoricalV3WeekQueryRequest,
} from './src/research/historical-v3-week-query-resolution';

const CONFIRMATION =
  'RUN_HISTORICAL_V3_WEEK_QUERY_QUALIFICATION_RECOVERY';

const FROZEN_CORPUS = {
  runId: 36479515332,
  artifactId: 10997010171,
  artifactName: 'historical-development-corpus-v1-36479515332',
  zipSha256:
    'cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d',
  builderRepoSha: '3d553b0925f55321d53c3048544aa16a047e41c8',
} as const;

const FROZEN_2024_SNAPSHOT = {
  runId: 36508377627,
  artifactId: 11008470975,
  artifactName: 'historical-research-snapshot-v1-2024-36508377627',
  zipSha256:
    'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
  sourceRepoSha: 'e1b27f6c5681f6ab4f8d24e50f88e387c64657a7',
  providerCalls: 28,
} as const;

const CORPUS_PATHS = {
  manifest: 'manifest.json',
  report: 'report.json',
  provenance: 'source_provenance.json',
  gameFrames: 'predictive/game_frames.json',
  advancedHistory: 'predictive/history_advanced.json',
} as const;

type JsonObject = Record<string, unknown>;

interface Args {
  corpusZip: string;
  snapshotZip: string;
  outputDir: string;
  confirm: string;
}

interface ArtifactDigest {
  file: string;
  bytes: number;
  sha256: string;
}

interface ProviderCallRecord {
  sequence: number;
  phase: 'QUALIFICATION' | 'RECOVERY';
  season: number;
  week: number;
  endpoint: typeof HISTORICAL_V3_WEEK_QUERY_ENDPOINT;
  query: Record<string, string>;
  httpStatus: number;
  rowCount: number;
  rawFile: string;
  rawBytes: number;
  rawSha256: string;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('unexpected_positional_argument');
    const value = argv[++index];
    if (value === undefined) throw new Error(`missing_value:${key}`);
    values.set(key, value);
  }

  const corpusZip = values.get('--corpus-zip') ?? '';
  const snapshotZip = values.get('--snapshot-zip') ?? '';
  const outputDir = values.get('--output-dir') ?? '';
  const confirm = values.get('--confirm') ?? '';

  if (!corpusZip) throw new Error('corpus_zip_required');
  if (!snapshotZip) throw new Error('snapshot_zip_required');
  if (!outputDir) throw new Error('output_dir_required');
  if (confirm !== CONFIRMATION) throw new Error('invalid_confirmation');

  return { corpusZip, snapshotZip, outputDir, confirm };
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sha256Bytes(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
}

function repoCommitSha(): string {
  const value = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(value)) throw new Error('invalid_git_head_sha');
  return value;
}

function archiveEntries(zipPath: string): string[] {
  try {
    return execFileSync('unzip', ['-Z1', zipPath], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  } catch {
    throw new Error('archive_list_failed');
  }
}

function findArchiveRoot(zipPath: string): string {
  const manifests = archiveEntries(zipPath).filter(
    (entry) => entry === 'manifest.json' || entry.endsWith('/manifest.json')
  );
  if (manifests.length !== 1) throw new Error('archive_root_ambiguous');
  const dir = path.posix.dirname(manifests[0]);
  return dir === '.' ? '' : dir;
}

function archiveRead(zipPath: string, rootDir: string, member: string): Buffer {
  const fullMember = rootDir ? `${rootDir}/${member}` : member;
  try {
    return execFileSync('unzip', ['-p', zipPath, fullMember], {
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    throw new Error(`archive_member_read_failed:${member}`);
  }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`invalid_json:${label}`);
  }
}

function jsonObject(bytes: Buffer, label: string): JsonObject {
  const value = asObject(parseJson(bytes, label));
  if (!value) throw new Error(`json_object_required:${label}`);
  return value;
}

function jsonArray(bytes: Buffer, label: string): unknown[] {
  const value = parseJson(bytes, label);
  if (!Array.isArray(value)) throw new Error(`json_array_required:${label}`);
  return value;
}

function manifestEntries(manifest: JsonObject): Map<string, JsonObject> {
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error('manifest_artifacts_required');
  }
  const result = new Map<string, JsonObject>();
  for (const raw of manifest.artifacts) {
    const entry = asObject(raw);
    const file = entry ? stringValue(entry.file) : null;
    if (!entry || !file || result.has(file)) {
      throw new Error('invalid_manifest_artifact');
    }
    result.set(file, entry);
  }
  return result;
}

function verifyManifestedBytes(
  entries: Map<string, JsonObject>,
  member: string,
  bytes: Buffer
): void {
  const entry = entries.get(member);
  if (!entry) throw new Error(`manifest_entry_missing:${member}`);
  const expectedBytes = integer(entry.bytes);
  const expectedSha =
    typeof entry.sha256 === 'string' ? entry.sha256.toLowerCase() : '';
  if (
    expectedBytes === null ||
    expectedBytes !== bytes.length ||
    !/^[0-9a-f]{64}$/.test(expectedSha) ||
    sha256Bytes(bytes) !== expectedSha
  ) {
    throw new Error(`manifest_member_mismatch:${member}`);
  }
}

function safeOutputPath(rootDir: string, relativePath: string): string {
  if (
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]+/).includes('..')
  ) {
    throw new Error('unsafe_v3_week_query_artifact_path');
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('unsafe_v3_week_query_artifact_path');
  }
  return resolved;
}

function writeBytesExclusive(
  outputDir: string,
  relativePath: string,
  bytes: Buffer
): ArtifactDigest {
  const fullPath = safeOutputPath(outputDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, bytes, { flag: 'wx' });
  return {
    file: relativePath.replace(/\\/g, '/'),
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function writeJsonExclusive(
  outputDir: string,
  relativePath: string,
  value: unknown
): ArtifactDigest {
  return writeBytesExclusive(
    outputDir,
    relativePath,
    Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8')
  );
}

function assertZip(
  filePath: string,
  expectedSha: string,
  missingCode: string,
  hashCode: string
): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(missingCode);
  }
  if (sha256File(filePath) !== expectedSha) throw new Error(hashCode);
}

function snapshotCallById(report: JsonObject): Map<string, JsonObject> {
  const provider = asObject(report.provider);
  if (
    !provider ||
    provider.name !== 'CFBD' ||
    provider.callsAttempted !== FROZEN_2024_SNAPSHOT.providerCalls ||
    provider.callsSucceeded !== FROZEN_2024_SNAPSHOT.providerCalls ||
    !Array.isArray(provider.calls)
  ) {
    throw new Error('snapshot_provider_identity_mismatch');
  }

  const result = new Map<string, JsonObject>();
  for (const raw of provider.calls) {
    const call = asObject(raw);
    const requestId = call ? stringValue(call.requestId) : null;
    if (!call || !requestId || result.has(requestId)) {
      throw new Error('snapshot_provider_call_invalid');
    }
    if (call.ok !== true || call.httpStatus !== 200) {
      throw new Error(`snapshot_provider_call_not_successful:${requestId}`);
    }
    result.set(requestId, call);
  }
  return result;
}

function snapshotRawMember(call: JsonObject): string {
  const rawFile = stringValue(call.rawFile);
  if (
    !rawFile ||
    path.posix.isAbsolute(rawFile) ||
    rawFile.split('/').includes('..')
  ) {
    throw new Error('snapshot_raw_member_invalid');
  }
  return rawFile;
}

async function fetchWeek(
  requestSpec: HistoricalV3WeekQueryRequest,
  apiKey: string,
  sequence: number,
  outputDir: string
): Promise<{
  rows: unknown[];
  call: ProviderCallRecord;
  artifact: ArtifactDigest;
}> {
  if (sequence > HISTORICAL_V3_WEEK_QUERY_MAX_PROVIDER_CALLS) {
    throw new Error('v3_week_query_provider_call_budget_exceeded');
  }

  const url = new URL(
    HISTORICAL_V3_WEEK_QUERY_ENDPOINT,
    'https://api.collegefootballdata.com'
  );
  for (const [key, value] of Object.entries(requestSpec.query)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent':
          'gridiron-edge-historical-v3-week-query-resolution/1.0',
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error('cfbd_redirect_refused');
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const relative = path.posix.join(
    'raw',
    `${String(sequence).padStart(3, '0')}-${requestSpec.phase.toLowerCase()}-${requestSpec.season}-w${String(requestSpec.week).padStart(2, '0')}.json`
  );
  const artifact = writeBytesExclusive(outputDir, relative, bytes);

  if (!response.ok) {
    throw new Error(`cfbd_http_error:${response.status}`);
  }

  const parsed = parseJson(
    bytes,
    `${requestSpec.phase}:${requestSpec.season}:W${requestSpec.week}`
  );
  if (!Array.isArray(parsed)) {
    throw new Error('cfbd_week_payload_not_array');
  }

  return {
    rows: parsed,
    artifact,
    call: {
      sequence,
      phase: requestSpec.phase,
      season: requestSpec.season,
      week: requestSpec.week,
      endpoint: HISTORICAL_V3_WEEK_QUERY_ENDPOINT,
      query: requestSpec.query,
      httpStatus: response.status,
      rowCount: parsed.length,
      rawFile: relative,
      rawBytes: bytes.length,
      rawSha256: artifact.sha256,
    },
  };
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const exact = new Set([
    'invalid_confirmation',
    'corpus_zip_required',
    'snapshot_zip_required',
    'output_dir_required',
    'corpus_zip_missing',
    'snapshot_zip_missing',
    'corpus_zip_hash_mismatch',
    'snapshot_zip_hash_mismatch',
    'output_dir_already_exists',
    'missing_cfbd_api_key',
    'invalid_git_head_sha',
    'archive_list_failed',
    'archive_root_ambiguous',
    'v3_week_query_provider_call_budget_exceeded',
    'cfbd_redirect_refused',
    'cfbd_week_payload_not_array',
  ]);
  if (exact.has(message)) return message;

  for (const prefix of [
    'archive_',
    'manifest_',
    'corpus_',
    'snapshot_',
    'v3_week_query_',
    'cfbd_http_error',
    'invalid_',
    'json_',
  ]) {
    if (message.startsWith(prefix)) return message.replace(/:.*/, '');
  }
  return 'historical_v3_week_query_resolution_failed';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const corpusZip = path.resolve(args.corpusZip);
  const snapshotZip = path.resolve(args.snapshotZip);
  const outputDir = path.resolve(args.outputDir);
  const apiKey = process.env.CFBD_API_KEY ?? '';

  assertZip(
    corpusZip,
    FROZEN_CORPUS.zipSha256,
    'corpus_zip_missing',
    'corpus_zip_hash_mismatch'
  );
  assertZip(
    snapshotZip,
    FROZEN_2024_SNAPSHOT.zipSha256,
    'snapshot_zip_missing',
    'snapshot_zip_hash_mismatch'
  );
  if (!apiKey) throw new Error('missing_cfbd_api_key');
  if (fs.existsSync(outputDir)) throw new Error('output_dir_already_exists');
  fs.mkdirSync(outputDir, { recursive: true });

  const repoSha = repoCommitSha();
  const artifacts: ArtifactDigest[] = [];
  const providerCalls: ProviderCallRecord[] = [];
  const sourceReads: Record<string, number> = {};
  const countRead = (name: string): void => {
    sourceReads[name] = (sourceReads[name] ?? 0) + 1;
  };

  const corpusRoot = findArchiveRoot(corpusZip);
  const corpusRead = (member: string): Buffer => {
    const allowed = new Set(Object.values(CORPUS_PATHS));
    if (!allowed.has(member as never)) {
      throw new Error(`corpus_forbidden_member_read:${member}`);
    }
    countRead(`corpus:${member}`);
    return archiveRead(corpusZip, corpusRoot, member);
  };

  const corpusManifestBytes = corpusRead(CORPUS_PATHS.manifest);
  const corpusReportBytes = corpusRead(CORPUS_PATHS.report);
  const corpusProvenanceBytes = corpusRead(CORPUS_PATHS.provenance);
  const gameFramesBytes = corpusRead(CORPUS_PATHS.gameFrames);
  const advancedHistoryBytes = corpusRead(CORPUS_PATHS.advancedHistory);

  const corpusManifest = jsonObject(
    corpusManifestBytes,
    CORPUS_PATHS.manifest
  );
  const corpusReport = jsonObject(corpusReportBytes, CORPUS_PATHS.report);
  const corpusProvenance = jsonObject(
    corpusProvenanceBytes,
    CORPUS_PATHS.provenance
  );

  if (
    corpusManifest.version !== 'historical_development_corpus_v1' ||
    corpusManifest.builderRepoSha !== FROZEN_CORPUS.builderRepoSha ||
    corpusReport.version !== 'historical_development_corpus_v1' ||
    corpusReport.qaPass !== true ||
    corpusProvenance.version !== 'historical_development_corpus_v1'
  ) {
    throw new Error('corpus_identity_mismatch');
  }

  const corpusEntries = manifestEntries(corpusManifest);
  verifyManifestedBytes(corpusEntries, CORPUS_PATHS.report, corpusReportBytes);
  verifyManifestedBytes(
    corpusEntries,
    CORPUS_PATHS.provenance,
    corpusProvenanceBytes
  );
  verifyManifestedBytes(
    corpusEntries,
    CORPUS_PATHS.gameFrames,
    gameFramesBytes
  );
  verifyManifestedBytes(
    corpusEntries,
    CORPUS_PATHS.advancedHistory,
    advancedHistoryBytes
  );

  const gameFrames = jsonArray(gameFramesBytes, CORPUS_PATHS.gameFrames);
  const advancedHistory = jsonArray(
    advancedHistoryBytes,
    CORPUS_PATHS.advancedHistory
  );
  const calibrationGames = selectHistoricalV3CalibrationGames(gameFrames);
  const qualificationRequests =
    buildHistoricalV3QualificationRequests(calibrationGames);

  artifacts.push(
    writeJsonExclusive(
      outputDir,
      'qualification/calibration_cohort.json',
      calibrationGames
    )
  );
  artifacts.push(
    writeJsonExclusive(
      outputDir,
      'qualification/request_plan.json',
      qualificationRequests
    )
  );

  const snapshotRoot = findArchiveRoot(snapshotZip);
  const snapshotRead = (member: string): Buffer => {
    countRead(`snapshot:${member}`);
    return archiveRead(snapshotZip, snapshotRoot, member);
  };

  const snapshotManifestBytes = snapshotRead('manifest.json');
  const snapshotReportBytes = snapshotRead('report.json');
  const snapshotManifest = jsonObject(
    snapshotManifestBytes,
    'snapshot:manifest'
  );
  const snapshotReport = jsonObject(snapshotReportBytes, 'snapshot:report');

  if (
    snapshotManifest.version !== 'historical_research_snapshot_v1' ||
    snapshotManifest.season !== 2024 ||
    snapshotManifest.repoCommitSha !== FROZEN_2024_SNAPSHOT.sourceRepoSha ||
    snapshotManifest.providerCalls !== FROZEN_2024_SNAPSHOT.providerCalls ||
    snapshotReport.version !== 'historical_research_snapshot_v1' ||
    snapshotReport.season !== 2024 ||
    snapshotReport.repoCommitSha !== FROZEN_2024_SNAPSHOT.sourceRepoSha
  ) {
    throw new Error('snapshot_identity_mismatch');
  }

  const snapshotEntries = manifestEntries(snapshotManifest);
  verifyManifestedBytes(
    snapshotEntries,
    'report.json',
    snapshotReportBytes
  );
  const callsById = snapshotCallById(snapshotReport);
  const gamesCall = callsById.get('games');
  const advancedCall = callsById.get('advanced-game-stats');
  if (!gamesCall || !advancedCall) {
    throw new Error('snapshot_required_call_missing');
  }

  const gamesMember = snapshotRawMember(gamesCall);
  const advancedMember = snapshotRawMember(advancedCall);
  const games2024Bytes = snapshotRead(gamesMember);
  const advanced2024Bytes = snapshotRead(advancedMember);
  verifyManifestedBytes(snapshotEntries, gamesMember, games2024Bytes);
  verifyManifestedBytes(snapshotEntries, advancedMember, advanced2024Bytes);

  const games2024 = jsonArray(games2024Bytes, 'snapshot:games');
  const advanced2024 = jsonArray(advanced2024Bytes, 'snapshot:advanced');

  const qualificationResults = [];
  let sequence = 0;

  for (const requestSpec of qualificationRequests) {
    sequence += 1;
    const fetched = await fetchWeek(
      requestSpec,
      apiKey,
      sequence,
      outputDir
    );
    providerCalls.push(fetched.call);
    artifacts.push(fetched.artifact);

    const game = calibrationGames.find(
      (candidate) =>
        candidate.season === requestSpec.season &&
        candidate.week === requestSpec.week
    );
    if (!game) {
      throw new Error('v3_week_query_calibration_request_unmapped');
    }

    qualificationResults.push(
      compareHistoricalV3QualificationGame(
        advancedHistory,
        fetched.rows,
        game
      )
    );
  }

  const qualification =
    summarizeHistoricalV3Qualification(qualificationResults);
  artifacts.push(
    writeJsonExclusive(
      outputDir,
      'qualification/equivalence.json',
      qualification
    )
  );

  const recoveryRequests = buildHistoricalV3RecoveryRequests(
    qualification.status
  );
  artifacts.push(
    writeJsonExclusive(
      outputDir,
      'recovery/request_plan.json',
      recoveryRequests
    )
  );

  const recoveryWeekPayloads: Record<number, unknown[]> = {};
  for (const requestSpec of recoveryRequests) {
    sequence += 1;
    const fetched = await fetchWeek(
      requestSpec,
      apiKey,
      sequence,
      outputDir
    );
    providerCalls.push(fetched.call);
    artifacts.push(fetched.artifact);
    recoveryWeekPayloads[requestSpec.week] = fetched.rows;
  }

  if (
    qualification.status === 'HISTORICAL_V3_WEEK_QUERY_REJECTED' &&
    recoveryRequests.length !== 0
  ) {
    throw new Error('v3_week_query_recovery_after_rejection');
  }
  if (providerCalls.length > HISTORICAL_V3_WEEK_QUERY_MAX_PROVIDER_CALLS) {
    throw new Error('v3_week_query_provider_call_budget_exceeded');
  }

  const recovery = collectHistoricalV3RecoveryRows({
    qualificationStatus: qualification.status,
    gamesRows: games2024,
    fullSeasonBulkRows: advanced2024,
    weekPayloads: recoveryWeekPayloads,
  });

  artifacts.push(
    writeJsonExclusive(
      outputDir,
      'recovery/accepted_advanced_rows.json',
      recovery.acceptedRows
    )
  );
  artifacts.push(
    writeJsonExclusive(outputDir, 'recovery/report.json', {
      qualificationStatus: recovery.qualificationStatus,
      recoveryAttempted: recovery.recoveryAttempted,
      recoveryCompleteness: recovery.recoveryCompleteness,
      acceptedRowCount: recovery.acceptedRows.length,
      recoveredGameIds: recovery.recoveredGameIds,
      unresolvedGameIds: recovery.unresolvedGameIds,
      suppliedWeekRows: recovery.suppliedWeekRows,
    })
  );

  const provenance = {
    version: HISTORICAL_V3_WEEK_QUERY_RESOLUTION_VERSION,
    builderRepoSha: repoSha,
    developmentCorpus: FROZEN_CORPUS,
    observed2024Snapshot: FROZEN_2024_SNAPSHOT,
    endpoint: HISTORICAL_V3_WEEK_QUERY_ENDPOINT,
    queryShape:
      '/stats/game/advanced?year=Y&week=W&seasonType=regular',
    qualificationTolerance: 1e-12,
    maxProviderCalls: HISTORICAL_V3_WEEK_QUERY_MAX_PROVIDER_CALLS,
    qualificationGames: calibrationGames,
    recoveryWeeks: [4, 12, 14],
  };
  artifacts.push(
    writeJsonExclusive(outputDir, 'source_provenance.json', provenance)
  );

  const report = {
    version: HISTORICAL_V3_WEEK_QUERY_RESOLUTION_VERSION,
    mode: 'SAME_ENDPOINT_WEEK_QUERY_QUALIFICATION_RECOVERY_RESEARCH_ONLY',
    builderRepoSha: repoSha,
    status: qualification.status,
    qualification: {
      calibrationGames: qualification.calibrationGames,
      scalarComparisons: qualification.scalarComparisons,
      passingComparisons: qualification.passingComparisons,
      maxAbsoluteDifference: qualification.maxAbsoluteDifference,
    },
    recovery: {
      attempted: recovery.recoveryAttempted,
      completeness: recovery.recoveryCompleteness,
      acceptedRows: recovery.acceptedRows.length,
      recoveredGameIds: recovery.recoveredGameIds,
      unresolvedGameIds: recovery.unresolvedGameIds,
    },
    provider: {
      name: 'CFBD',
      endpoint: HISTORICAL_V3_WEEK_QUERY_ENDPOINT,
      callsAttempted: providerCalls.length,
      maxCalls: HISTORICAL_V3_WEEK_QUERY_MAX_PROVIDER_CALLS,
      qualificationCalls: providerCalls.filter(
        (call) => call.phase === 'QUALIFICATION'
      ).length,
      recoveryCalls: providerCalls.filter(
        (call) => call.phase === 'RECOVERY'
      ).length,
      calls: providerCalls,
    },
    sourceReads,
    boundaries: {
      databaseReads: false,
      databaseWrites: false,
      prismaInvoked: false,
      marketReads: 0,
      ppaSidecarReads: 0,
      outcomeFieldsUsed: false,
      outcomeScoringReads: 0,
      modelFit: false,
      modelScore2024: false,
      holdout2025Reads: 0,
      alternateAdvancedEndpointReads: 0,
      playByPlayReads: 0,
      driveReads: 0,
    },
  };
  artifacts.push(writeJsonExclusive(outputDir, 'report.json', report));

  artifacts.sort((left, right) => left.file.localeCompare(right.file));
  writeJsonExclusive(outputDir, 'manifest.json', {
    version: HISTORICAL_V3_WEEK_QUERY_RESOLUTION_VERSION,
    builderRepoSha: repoSha,
    status: qualification.status,
    artifacts,
  });

  console.log(
    JSON.stringify(
      {
        status: qualification.status,
        calibrationGames: qualification.calibrationGames,
        scalarComparisons: qualification.scalarComparisons,
        passingComparisons: qualification.passingComparisons,
        providerCalls: providerCalls.length,
        qualificationCalls: providerCalls.filter(
          (call) => call.phase === 'QUALIFICATION'
        ).length,
        recoveryCalls: providerCalls.filter(
          (call) => call.phase === 'RECOVERY'
        ).length,
        recoveryCompleteness: recovery.recoveryCompleteness,
        recoveryRows: recovery.acceptedRows.length,
        marketReads: 0,
        outcomeScoringReads: 0,
        holdout2025Reads: 0,
        databaseReads: false,
        databaseWrites: false,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    '[historical-v3-week-query] ' + sanitizeError(error)
  );
  process.exitCode = 1;
});
