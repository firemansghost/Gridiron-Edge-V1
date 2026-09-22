#!/usr/bin/env node

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import {
  CFBD_ENDPOINT,
  CFBD_OPENAPI_VERSION,
  TARGET_SEASON,
  VERSION,
  buildExternalEloPriorDiscovery,
  type RawCfbdEloRow,
} from './src/research/candidate-b/external-elo-prior-discovery-v1';

export const CONFIRMATION =
  'CAPTURE_2026_CFBD_PRESEASON_ELO_DISCOVERY' as const;

interface Args {
  season: number;
  confirm: string;
  rawPath: string;
  reportPath: string;
}

interface CaptureMetadata {
  version: typeof VERSION;
  season: number;
  endpoint: typeof CFBD_ENDPOINT;
  documentedOpenApiVersion: typeof CFBD_OPENAPI_VERSION;
  retrievedAtIso: string;
  httpStatus: number;
  rawByteCount: number;
  rawSha256: string;
  providerCalls: 1;
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
  const rawPath = values.get('--raw-path') ?? '';
  const reportPath = values.get('--report') ?? '';
  if (season !== TARGET_SEASON) throw new Error('season must equal 2026');
  if (confirm !== CONFIRMATION) throw new Error('exact confirmation is required');
  if (!rawPath) throw new Error('--raw-path is required');
  if (!reportPath) throw new Error('--report is required');
  return { season, confirm, rawPath, reportPath };
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeExclusive(filePath: string, data: string | Buffer): void {
  ensureParent(filePath);
  fs.writeFileSync(filePath, data, { flag: 'wx' });
}

async function fetchCfbdPreseasonElo(season: number): Promise<{
  rawBytes: Buffer;
  metadata: CaptureMetadata;
}> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) throw new Error('CFBD_API_KEY is required');

  const baseUrl =
    process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(baseUrl + '/ratings/elo');
  url.searchParams.set('year', String(season));
  url.searchParams.set('preseason', 'true');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        Accept: 'application/json',
        'User-Agent': 'gridiron-edge-jobs/1.0',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error('CFBD redirect refused');
    }
    const rawBytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      throw new Error('CFBD HTTP ' + response.status);
    }
    const retrievedAtIso = new Date().toISOString();
    const rawSha256 = crypto
      .createHash('sha256')
      .update(rawBytes)
      .digest('hex');
    return {
      rawBytes,
      metadata: {
        version: VERSION,
        season,
        endpoint: CFBD_ENDPOINT,
        documentedOpenApiVersion: CFBD_OPENAPI_VERSION,
        retrievedAtIso,
        httpStatus: response.status,
        rawByteCount: rawBytes.length,
        rawSha256,
        providerCalls: 1,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function failureReport(
  metadata: CaptureMetadata | null,
  errorCode: string
): Record<string, unknown> {
  return {
    ok: false,
    qaPass: false,
    metadata,
    errorCode,
    execution: {
      providerCalls: metadata ? 1 : 0,
      databaseReads: metadata ? true : false,
      mutationsInvoked: false,
      mutationTargetsInvoked: [],
      prismaTransactionInvoked: false,
      oddsProviderInvoked: false,
      sgoProviderInvoked: false,
      weatherProviderInvoked: false,
      ratingsWrites: false,
      shadowPredictionWrites: false,
      betWrites: false,
      hybridWrites: false,
      matchupOutputWrites: false,
      lifecycleWrites: false,
      migrationsInvoked: false,
    },
  };
}

function sanitizedErrorCode(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/season must equal/i.test(msg)) return 'invalid_season';
  if (/confirmation/i.test(msg)) return 'invalid_confirmation';
  if (/CFBD_API_KEY/i.test(msg)) return 'missing_cfbd_api_key';
  if (/redirect/i.test(msg)) return 'cfbd_redirect_refused';
  if (/CFBD HTTP/i.test(msg)) return 'cfbd_http_error';
  if (/JSON|Unexpected token|array/i.test(msg)) return 'invalid_provider_payload';
  if (/EEXIST/i.test(msg)) return 'evidence_path_already_exists';
  return 'external_elo_discovery_failed';
}

export async function runExternalEloDiscovery(args: Args): Promise<number> {
  let prisma: PrismaClient | null = null;
  let metadata: CaptureMetadata | null = null;
  let rawCaptured = false;

  try {
    const provider = await fetchCfbdPreseasonElo(args.season);
    metadata = provider.metadata;

    // Evidence-first contract: exact HTTP response bytes are persisted before
    // JSON parsing, team resolution, database reads, or statistical analysis.
    writeExclusive(args.rawPath, provider.rawBytes);
    rawCaptured = true;

    const parsed = JSON.parse(provider.rawBytes.toString('utf8')) as unknown;
    if (!Array.isArray(parsed)) throw new Error('CFBD Elo response is not an array');

    prisma = new PrismaClient();
    const memberships = await prisma.teamMembership.findMany({
      where: { season: args.season, level: 'fbs' },
      select: { teamId: true, conference: true },
      orderBy: { teamId: 'asc' },
    });
    const fbsIds = memberships.map(row => row.teamId);
    const talentRows = await prisma.teamSeasonTalent.findMany({
      where: { season: args.season, teamId: { in: fbsIds } },
      select: { teamId: true, talentComposite: true },
      orderBy: { teamId: 'asc' },
    });

    const resolver = new TeamResolver();
    const analysis = buildExternalEloPriorDiscovery({
      season: args.season,
      rawRows: parsed as RawCfbdEloRow[],
      memberships,
      talentRows,
      resolveTeam: providerTeam =>
        resolver.resolveTeamDetailed(providerTeam, 'college-football', {
          provider: 'cfbd',
          strictFullIdentity: true,
        }),
    });

    const report = {
      ok: analysis.qaPass,
      qaPass: analysis.qaPass,
      metadata,
      analysis,
      execution: {
        providerCalls: 1,
        databaseReads: true,
        mutationsInvoked: false,
        mutationTargetsInvoked: [],
        prismaTransactionInvoked: false,
        oddsProviderInvoked: false,
        sgoProviderInvoked: false,
        weatherProviderInvoked: false,
        ratingsWrites: false,
        shadowPredictionWrites: false,
        betWrites: false,
        hybridWrites: false,
        matchupOutputWrites: false,
        lifecycleWrites: false,
        migrationsInvoked: false,
      },
    };
    writeExclusive(args.reportPath, JSON.stringify(report, null, 2) + '\n');

    console.log(JSON.stringify({
      ok: analysis.qaPass,
      qaPass: analysis.qaPass,
      providerCalls: 1,
      rawSha256: metadata.rawSha256,
      rawRows: analysis.raw.rowCount,
      resolvedFbs: analysis.resolution.uniqueResolvedFbsCount,
      usableFbsElo: analysis.resolution.usableFbsEloCount,
      missingFbs: analysis.resolution.missingCanonicalTeamIds.length,
      unexpectedProviderRows: analysis.resolution.unexpectedProviderRows.length,
      comparedCount: analysis.comparison.comparedCount,
      pearsonEloVsTalentZ: analysis.comparison.pearsonEloVsTalentZ,
      spearmanEloVsTalentZ: analysis.comparison.spearmanEloVsTalentZ,
      mutationsInvoked: false,
      reportPath: args.reportPath,
      rawPath: args.rawPath,
    }, null, 2));

    return analysis.qaPass ? 0 : 2;
  } catch (err) {
    const code = sanitizedErrorCode(err);
    console.error('[external-elo-discovery] ' + code);
    if (rawCaptured && metadata && !fs.existsSync(args.reportPath)) {
      try {
        writeExclusive(
          args.reportPath,
          JSON.stringify(failureReport(metadata, code), null, 2) + '\n'
        );
      } catch {
        console.error('[external-elo-discovery] failure_report_write_failed');
      }
    }
    return 1;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error('[external-elo-discovery] ' + sanitizedErrorCode(err));
    process.exit(1);
    return;
  }
  process.exit(await runExternalEloDiscovery(args));
}

if (require.main === module) {
  main().catch(() => {
    console.error('[external-elo-discovery] unhandled_failure');
    process.exit(1);
  });
}
