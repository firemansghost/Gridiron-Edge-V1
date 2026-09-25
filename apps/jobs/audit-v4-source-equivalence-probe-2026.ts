#!/usr/bin/env node
/**
 * 2026 V4 comparator source-equivalence provider probe.
 *
 * READ ONLY:
 * - SELECTs persisted TeamGameStat sample evidence.
 * - Makes exactly the preregistered CFBD provider calls (max 9).
 * - Writes artifacts only to the local Actions workspace.
 * - Never mutates production data.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  V4_EQUIVALENCE_ENDPOINTS,
  V4_EQUIVALENCE_PROVIDER_CALL_BUDGET,
  V4_EQUIVALENCE_SAMPLE,
  V4_EQUIVALENCE_SEASON,
  V4_EQUIVALENCE_WEEKS,
  buildV4SourceEquivalenceReport,
  filterSampleRows,
  type AdvancedRow,
  type DriveRow,
  type PersistedSampleRow,
  type PlayRow,
  type ProviderCallRecord,
} from './src/research/v4-source-equivalence-probe';

interface FetchResult<T> {
  call: ProviderCallRecord;
  data: T[];
}

function repoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must come from git rev-parse HEAD');
  }
  return sha;
}

function parseArgs(argv: string[]) {
  let season = V4_EQUIVALENCE_SEASON;
  let outputDir = path.join(
    process.cwd(),
    'reports',
    'v4-source-equivalence-probe-2026'
  );
  const errors: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--season' && next) {
      season = Number(next);
      i += 1;
    } else if (arg === '--output-dir' && next) {
      outputDir = next;
      i += 1;
    } else {
      errors.push(`unknown or incomplete argument: ${arg}`);
    }
  }

  if (season !== V4_EQUIVALENCE_SEASON) {
    errors.push(`season must equal ${V4_EQUIVALENCE_SEASON}`);
  }

  return { ok: errors.length === 0, season, outputDir, errors };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedText(
  value: unknown,
  keys: string[]
): string | null {
  let current: unknown = value;
  for (const key of keys) {
    const obj = asObject(current);
    if (!obj) return null;
    current = obj[key];
  }
  if (typeof current !== 'string' && typeof current !== 'number') {
    return null;
  }
  const text = String(current).trim();
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[DATABASE_URL_REDACTED]')
    .slice(0, 400);
}

async function fetchCfbdJson<T>(
  baseUrl: string,
  apiKey: string,
  endpoint: string,
  week: number
): Promise<FetchResult<T>> {
  const url = new URL(`${baseUrl}${endpoint}`);
  url.searchParams.set('year', String(V4_EQUIVALENCE_SEASON));
  url.searchParams.set('week', String(week));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'gridiron-edge-v4-equivalence-research/1.0',
      },
    });

    const status = response.status;
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok) {
      const body = await response.text();
      return {
        call: {
          endpoint,
          week,
          attempted: true,
          status,
          ok: false,
          error: `HTTP ${status}: ${body.slice(0, 200)}`,
          rowCount: null,
        },
        data: [],
      };
    }

    if (!contentType.includes('application/json')) {
      const body = await response.text();
      return {
        call: {
          endpoint,
          week,
          attempted: true,
          status,
          ok: false,
          error: `non-JSON response: ${contentType} ${body.slice(0, 120)}`,
          rowCount: null,
        },
        data: [],
      };
    }

    const parsed = (await response.json()) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        call: {
          endpoint,
          week,
          attempted: true,
          status,
          ok: false,
          error: 'expected JSON array response',
          rowCount: null,
        },
        data: [],
      };
    }

    return {
      call: {
        endpoint,
        week,
        attempted: true,
        status,
        ok: true,
        error: null,
        rowCount: parsed.length,
      },
      data: parsed as T[],
    };
  } catch (error) {
    return {
      call: {
        endpoint,
        week,
        attempted: true,
        status: null,
        ok: false,
        error: sanitizeError(error),
        rowCount: null,
      },
      data: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function writeJson(outputDir: string, fileName: string, value: unknown) {
  const text = stringifyJson(value);
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, text, 'utf8');
  return {
    fileName,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}

async function loadPersistedSample(
  prisma: PrismaClient
): Promise<PersistedSampleRow[]> {
  const internalIds = V4_EQUIVALENCE_SAMPLE.map((g) => g.internalGameId);
  const rows = await prisma.teamGameStat.findMany({
    where: {
      season: V4_EQUIVALENCE_SEASON,
      gameId: { in: internalIds },
    },
    select: {
      gameId: true,
      teamId: true,
      successOff: true,
      successDef: true,
      rawJson: true,
    },
    orderBy: [{ gameId: 'asc' }, { teamId: 'asc' }],
  });

  return rows.map((row) => ({
    gameId: row.gameId,
    teamId: row.teamId,
    cfbdGameId: nestedText(row.rawJson, ['gameId']),
    providerTeam: nestedText(row.rawJson, ['team']),
    successOff: toNumber(row.successOff),
    successDef: toNumber(row.successDef),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.errors.join('\n'));
    process.exit(1);
  }

  const directUrl = process.env.DIRECT_URL;
  const apiKey = process.env.CFBD_API_KEY;
  const baseUrl =
    process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';

  if (!directUrl) {
    console.error('DIRECT_URL required');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('CFBD_API_KEY required');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: directUrl } },
  });

  try {
    fs.mkdirSync(args.outputDir, { recursive: true });

    const persistedRows = await loadPersistedSample(prisma);
    if (persistedRows.length !== V4_EQUIVALENCE_SAMPLE.length * 2) {
      throw new Error(
        `expected ${V4_EQUIVALENCE_SAMPLE.length * 2} persisted TeamGameStat rows, found ${persistedRows.length}`
      );
    }

    const calls: ProviderCallRecord[] = [];
    const advancedRows: AdvancedRow[] = [];
    const driveRows: DriveRow[] = [];
    const playRows: PlayRow[] = [];

    for (const week of V4_EQUIVALENCE_WEEKS) {
      for (const endpoint of V4_EQUIVALENCE_ENDPOINTS) {
        if (calls.length >= V4_EQUIVALENCE_PROVIDER_CALL_BUDGET) {
          throw new Error('provider call budget exceeded');
        }

        if (endpoint === '/stats/game/advanced') {
          const result = await fetchCfbdJson<AdvancedRow>(
            baseUrl,
            apiKey,
            endpoint,
            week
          );
          calls.push(result.call);
          advancedRows.push(...result.data);
        } else if (endpoint === '/drives') {
          const result = await fetchCfbdJson<DriveRow>(
            baseUrl,
            apiKey,
            endpoint,
            week
          );
          calls.push(result.call);
          driveRows.push(...result.data);
        } else {
          const result = await fetchCfbdJson<PlayRow>(
            baseUrl,
            apiKey,
            endpoint,
            week
          );
          calls.push(result.call);
          playRows.push(...result.data);
        }
      }
    }

    const advancedSample = filterSampleRows(advancedRows);
    const driveSample = filterSampleRows(driveRows);
    const playSample = filterSampleRows(playRows);

    const persistedFile = writeJson(
      args.outputDir,
      'persisted-team-game-stat-sample.json',
      persistedRows
    );
    const advancedFile = writeJson(
      args.outputDir,
      'cfbd-advanced-sample.json',
      advancedSample
    );
    const drivesFile = writeJson(
      args.outputDir,
      'cfbd-drives-sample.json',
      driveSample
    );
    const playsFile = writeJson(
      args.outputDir,
      'cfbd-plays-sample.json',
      playSample
    );
    const callsFile = writeJson(
      args.outputDir,
      'provider-calls.json',
      calls
    );

    const payloadDigests: Record<string, string> = {
      [persistedFile.fileName]: persistedFile.sha256,
      [advancedFile.fileName]: advancedFile.sha256,
      [drivesFile.fileName]: drivesFile.sha256,
      [playsFile.fileName]: playsFile.sha256,
      [callsFile.fileName]: callsFile.sha256,
    };

    const report = buildV4SourceEquivalenceReport({
      repoCommitSha: repoCommitSha(),
      observedAt: new Date().toISOString(),
      providerCalls: calls,
      persistedRows,
      advancedRows,
      driveRows,
      playRows,
      payloadDigests,
    });

    const reportFile = writeJson(args.outputDir, 'report.json', report);

    console.log(
      stringifyJson({
        report,
        reportArtifact: reportFile,
        files: [
          persistedFile,
          advancedFile,
          drivesFile,
          playsFile,
          callsFile,
        ],
      })
    );
  } catch (error) {
    console.error(sanitizeError(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
