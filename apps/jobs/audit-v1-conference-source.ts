#!/usr/bin/env node
/**
 * Phase 2C-2G-4 — Read-only audit of Core V1 conference source.
 *
 * Usage:
 *   npx tsx apps/jobs/audit-v1-conference-source.ts --season 2026
 *
 * Uses the same loadV1ConferenceMap path as compute_ratings_v1.
 * No CFBD. No Odds. No ratings compute/persist. No writes.
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import {
  createPrismaV1ConferenceStore,
  loadV1ConferenceMap,
  type V1ConferenceLoadResult,
} from './src/ratings/v1-conference-loader';

function parseArgs(argv: string[]): { ok: true; season: number } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | undefined;
  let seasonSeen = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--season') {
      if (seasonSeen) {
        errors.push('--season may be provided exactly once');
        i += 1;
        continue;
      }
      seasonSeen = true;
      const raw = argv[++i];
      if (raw === undefined || raw === '') {
        errors.push('--season requires an integer value');
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || Number.isNaN(n)) {
        errors.push(`--season must be an integer (got ${raw})`);
        continue;
      }
      season = n;
      continue;
    }
    if (arg.startsWith('-')) {
      errors.push(`Unknown flag: ${arg}`);
      continue;
    }
    errors.push(`Unexpected positional argument: ${arg}`);
  }

  if (season === undefined) {
    errors.push('--season is required');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season: season! };
}

function formatAuditReport(
  season: number,
  expectedFbsCount: number,
  result: V1ConferenceLoadResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  push('============================================');
  push('V1 SEASON CONFERENCE SOURCE AUDIT (READ ONLY)');
  push('============================================');
  push('mode=READ_ONLY');
  push(`targetSeason=${season}`);
  push(`conferenceSource=${result.conferenceSource}`);
  push(`expectedFbsCount=${expectedFbsCount}`);
  push(`loadedConferenceCount=${result.loadedConferenceCount}`);
  push(`loadedMembershipRowCount=${result.loadedMembershipRowCount}`);
  push(`missingConferenceCount=${result.missingTeamIds.length}`);
  push(`unrecognizedConferenceCount=${result.unrecognizedTeamIds.length}`);
  push(`legacyFallback=${result.usedLegacyFallback}`);
  push(`legacyConferenceMode=${result.legacyConferenceMode}`);
  push(`ok=${result.ok}`);
  push('ratingsCompute=false');
  push('mutationsInvoked=false');
  push('providers=false');
  push('Odds=false');
  if (Object.keys(result.distribution).length > 0) {
    push('distribution:');
    for (const k of Object.keys(result.distribution).sort()) {
      push(`  ${k}: ${result.distribution[k]}`);
    }
  }
  push(
    `north-dakota-state=${result.conferenceMap.get('north-dakota-state') ?? '(missing)'}`
  );
  push(
    `sacramento-state=${result.conferenceMap.get('sacramento-state') ?? '(missing)'}`
  );
  if (result.missingTeamIds.length > 0) {
    push(`missingTeamIds: ${result.missingTeamIds.join(', ')}`);
  }
  if (result.unrecognizedTeamIds.length > 0) {
    push(`unrecognizedTeamIds: ${result.unrecognizedTeamIds.join(', ')}`);
  }
  if (result.error) {
    push(`error=${result.error}`);
  }
  push('============================================');
  return lines.join('\n');
}

export async function runV1ConferenceSourceAudit(options: {
  season: number;
  prisma?: PrismaClient;
}): Promise<{ exitCode: number }> {
  console.log('READ_ONLY=true');
  console.log('providers=false');
  console.log('ratingsCompute=false');
  console.log('ratingsWrite=false');
  console.log('mutationsInvoked=false');

  const ownsPrisma = !options.prisma;
  const prisma = options.prisma ?? new PrismaClient();

  try {
    const teamResolver = new TeamResolver();
    const fbsSet = await teamResolver.loadFBSTeamsForSeason(options.season);
    const expectedFbsIds = Array.from(fbsSet).sort();

    const result = await loadV1ConferenceMap({
      season: options.season,
      expectedFbsIds,
      store: createPrismaV1ConferenceStore(prisma),
    });

    console.log(formatAuditReport(options.season, expectedFbsIds.length, result));
    return { exitCode: result.ok ? 0 : 1 };
  } catch (err) {
    console.error(
      '[v1-conference-audit] Audit failed; connection and secret details suppressed'
    );
    if (err instanceof Error && /season-aware|TeamMembership|expected FBS/i.test(err.message)) {
      console.error(`[v1-conference-audit] detail=${err.message}`);
    }
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[v1-conference-audit] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/audit-v1-conference-source.ts --season 2026'
    );
    process.exit(1);
  }
  const { exitCode } = await runV1ConferenceSourceAudit({ season: parsed.season });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch(() => {
    console.error(
      '[v1-conference-audit] Audit failed; connection and secret details suppressed'
    );
    process.exit(1);
  });
}
