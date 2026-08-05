#!/usr/bin/env node
/**
 * Phase 2C-1A2 PREVIEW-ONLY CFBD schedule CLI.
 *
 * Usage:
 *   npx tsx apps/jobs/ingest-schedules.ts --season 2026 --week 0 --preview
 *
 * --preview is REQUIRED. Production schedule writes are disabled until Phase 2C-1B.
 * This executable never imports or calls writeValidatedScheduleBatch.
 */

import { PrismaClient } from '@prisma/client';
import {
  PREVIEW_ONLY_WRITE_DISABLED_MESSAGE,
  collectProviderTeamNames,
  compareToExistingDb,
  createPrismaReadOnlyScheduleStore,
  fetchCfbdScheduleWeek,
  filterAndNormalizeProviderGames,
  loadCfbdTeamAliases,
  parseScheduleOnlyArgs,
  redactSecretLike,
  resolveAllTeams,
  sampleNormalizedGames,
  summarizeProviderGames,
  summarizeTeamResolutions,
  teamLookupFromStore,
  teamResolutionFailed,
  validateNormalizedBatch,
  type ReadOnlyScheduleStore,
} from './src/preseason/cfbd-schedule-ingest';

export interface RunSchedulePreviewOptions {
  season: number;
  week: number;
  apiKey?: string;
  store?: ReadOnlyScheduleStore;
  /** When store is omitted, a Prisma client is created for read-only adapter binding only. */
  prisma?: PrismaClient;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * Preview-only runner. Accepts ReadOnlyScheduleStore — never a mutation API.
 * Does not import writeValidatedScheduleBatch.
 */
export async function runSchedulePreview(
  options: RunSchedulePreviewOptions
): Promise<{ exitCode: number }> {
  const { season, week } = options;
  const apiKey = options.apiKey ?? process.env.CFBD_API_KEY ?? '';
  if (!apiKey) {
    console.error('[schedule-preview] CFBD_API_KEY is missing or empty');
    return { exitCode: 1 };
  }

  // Environment variables cannot enable writes — there is no write branch.
  if (
    process.env.SCHEDULE_ALLOW_WRITE ||
    process.env.ALLOW_SCHEDULE_WRITE ||
    process.env.SCHEDULE_WRITE
  ) {
    console.warn(
      '[schedule-preview] Ignoring schedule-write environment variable — writes are disabled for Phase 2C-1A2'
    );
  }

  console.log('[schedule-preview] mode=PREVIEW (read-only)');
  console.log(`[schedule-preview] season=${season} week=${week}`);
  console.log(
    '[schedule-preview] ratings/odds/weather/injuries/bets/scores/writes: not invoked'
  );

  let ownsPrisma = false;
  let prisma: PrismaClient | null = null;
  let store: ReadOnlyScheduleStore;

  if (options.store) {
    store = options.store;
  } else {
    prisma = options.prisma ?? new PrismaClient();
    ownsPrisma = !options.prisma;
    store = createPrismaReadOnlyScheduleStore(prisma);
  }

  try {
    const lookup = teamLookupFromStore(store);
    const aliases = loadCfbdTeamAliases();

    const fetched = await fetchCfbdScheduleWeek({
      season,
      week,
      apiKey,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
    });
    console.log(`[schedule-preview] CFBD HTTP ${fetched.httpStatus}`);
    console.log(
      `[schedule-preview] estimated CFBD calls=${fetched.estimatedCfbdCalls}`
    );

    const providerSummary = summarizeProviderGames(fetched.games, season, week);
    console.log(
      '[schedule-preview] provider summary:',
      JSON.stringify(providerSummary)
    );

    if (fetched.games.length === 0) {
      console.error('[schedule-preview] Provider returned zero games');
      return { exitCode: 1 };
    }

    const names = collectProviderTeamNames(fetched.games);
    const resolutions = await resolveAllTeams(names, lookup, aliases);
    const resolutionList = [...resolutions.values()];
    const teamSummary = summarizeTeamResolutions(resolutionList);
    console.log(
      '[schedule-preview] team resolution:',
      JSON.stringify({
        distinctIncomingTeams: teamSummary.distinctIncomingTeams,
        exactCanonicalMatches: teamSummary.exactCanonicalMatches,
        recognizedAliases: teamSummary.recognizedAliases,
        missingCount: teamSummary.missingTeams.length,
        ambiguousCount: teamSummary.ambiguousTeams.length,
        conflictingCount: teamSummary.conflictingTeams.length,
        unresolved: teamSummary.unresolved.map((u) => ({
          name: u.providerName,
          kind: u.kind,
          detail: u.detail,
        })),
      })
    );

    if (teamResolutionFailed(resolutionList)) {
      console.error(
        '[schedule-preview] Team resolution failed — aborting (zero writes)'
      );
      return { exitCode: 1 };
    }

    const { games: normalized, skippedNonFbs, kickoffIssues } =
      filterAndNormalizeProviderGames(
        fetched.games,
        season,
        week,
        resolutions,
        fetched.venueCityByName
      );
    console.log(
      `[schedule-preview] normalized=${normalized.length} skippedNonFbs=${skippedNonFbs}`
    );

    const validation = validateNormalizedBatch(normalized, season, week, {
      source: 'cfbd',
      extraIssues: kickoffIssues,
    });
    if (!validation.ok) {
      console.error('[schedule-preview] Batch validation failed:');
      for (const issue of validation.issues) {
        console.error(`  - ${issue.code}: ${issue.message}`);
      }
      return { exitCode: 1 };
    }

    const existing = await store.findGamesForSeasonWeek(season, week);
    const comparison = compareToExistingDb(normalized, existing);
    console.log(
      '[schedule-preview] DB comparison (read-only):',
      JSON.stringify({
        existingCount: comparison.existingCount,
        wouldInsert: comparison.wouldInsertIds.length,
        wouldUpdate: comparison.wouldUpdateIds.length,
        dbOnlyAbsentFromProvider: comparison.dbOnlyIds.length,
        note: 'db-only rows are reported only; no automatic delete',
      })
    );

    console.log(
      '[schedule-preview] first5:',
      JSON.stringify(sampleNormalizedGames(normalized.slice(0, 5)))
    );
    console.log(
      '[schedule-preview] last5:',
      JSON.stringify(sampleNormalizedGames(normalized.slice(-5)))
    );

    console.log(
      '[schedule-preview] PREVIEW complete — no inserts/updates/deletes performed'
    );
    return { exitCode: 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[schedule-preview] ${redactSecretLike(message)}`);
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) {
      await prisma.$disconnect();
    }
  }
}

/** @deprecated Name retained for preview script import — always preview-only. */
export async function runScheduleOnly(options: {
  season: number;
  week: number;
  preview?: boolean;
  apiKey?: string;
  store?: ReadOnlyScheduleStore;
  prisma?: PrismaClient;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): Promise<{ exitCode: number }> {
  if (options.preview === false) {
    console.error(`[schedule-preview] ${PREVIEW_ONLY_WRITE_DISABLED_MESSAGE}`);
    return { exitCode: 1 };
  }
  return runSchedulePreview(options);
}

async function main(): Promise<void> {
  const parsed = parseScheduleOnlyArgs(process.argv.slice(2));
  if (!parsed.ok || !parsed.args) {
    for (const err of parsed.errors) {
      console.error(`[schedule-preview] ${err}`);
    }
    process.exit(1);
  }
  const { exitCode } = await runSchedulePreview({
    season: parsed.args.season,
    week: parsed.args.week,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  void main();
}

export { main };
