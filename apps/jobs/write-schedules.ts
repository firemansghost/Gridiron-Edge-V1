#!/usr/bin/env node
/**
 * Phase 2C-1B one-week CFBD schedule WRITE CLI.
 *
 * Separate from preview-only ingest-schedules.ts.
 *
 * Usage:
 *   npx tsx apps/jobs/write-schedules.ts --season 2026 --week 1 --confirm-write WRITE_2026_WEEK_1
 *
 * Does not import monolithic ingest.ts, seed-ratings, odds, or mock adapters.
 * Do not run against production without explicit operator approval.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import {
  assertProviderWeeksMatch,
  buildWriteConfirmPhrase,
  collectProviderTeamNames,
  compareToExistingDb,
  createPrismaReadOnlyScheduleStore,
  fetchCfbdScheduleWeek,
  filterAndNormalizeProviderGames,
  findProtectedUpdateTargets,
  kickoffRangeIso,
  loadCfbdTeamAliases,
  parseWriteScheduleArgs,
  redactSecretLike,
  resolveAllTeams,
  sampleNormalizedGames,
  summarizeProviderGames,
  summarizeTeamResolutions,
  teamLookupFromStore,
  teamResolutionFailed,
  toScheduleInsertRow,
  validateNormalizedBatch,
  verifyPostWriteSchedule,
  writeValidatedScheduleBatch,
  type DbGameRow,
  type NormalizedScheduleGame,
  type ScheduleWriteDeps,
} from './src/preseason/cfbd-schedule-ingest';

export interface RunScheduleWriteOptions {
  season: number;
  week: number;
  confirmWrite: string;
  apiKey?: string;
  prisma?: PrismaClient;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

function createWriteDeps(prisma: PrismaClient): ScheduleWriteDeps {
  return {
    async loadExistingForWeek(season, week) {
      return prisma.game.findMany({
        where: { season, week },
        select: {
          id: true,
          season: true,
          week: true,
          homeTeamId: true,
          awayTeamId: true,
          date: true,
          homeScore: true,
          awayScore: true,
          status: true,
        },
      });
    },
    async createMany(rows) {
      const result = await prisma.game.createMany({
        data: rows as Prisma.GameCreateManyInput[],
        skipDuplicates: true,
      });
      return result.count;
    },
    async updateScheduleFields(id, data) {
      await prisma.game.updateMany({
        where: { id },
        data,
      });
    },
    async transaction(fn) {
      return prisma.$transaction(async () => fn());
    },
  };
}

export async function runScheduleWrite(
  options: RunScheduleWriteOptions
): Promise<{ exitCode: number }> {
  const { season, week, confirmWrite } = options;
  const expectedPhrase = buildWriteConfirmPhrase(week);
  if (confirmWrite !== expectedPhrase) {
    console.error(
      `[schedule-write] Confirmation mismatch: expected ${expectedPhrase}`
    );
    return { exitCode: 1 };
  }

  if (
    process.env.SCHEDULE_ALLOW_WRITE ||
    process.env.ALLOW_SCHEDULE_WRITE ||
    process.env.SCHEDULE_WRITE
  ) {
    console.warn(
      '[schedule-write] Ignoring schedule-write env vars — confirmation phrase is mandatory'
    );
  }

  const apiKey = options.apiKey ?? process.env.CFBD_API_KEY ?? '';
  if (!apiKey) {
    console.error('[schedule-write] CFBD_API_KEY is missing or empty');
    return { exitCode: 1 };
  }

  const ownsPrisma = !options.prisma;
  const prisma = options.prisma ?? new PrismaClient();
  const readStore = createPrismaReadOnlyScheduleStore(prisma);

  console.log('[schedule-write] mode=WRITE (one week, guarded)');
  console.log(`[schedule-write] season=${season} week=${week}`);
  console.log(`[schedule-write] confirm_write=${confirmWrite}`);
  console.log(
    '[schedule-write] ratings/odds/weather/injuries/bets/scores/mock: not invoked'
  );

  try {
    const lookup = teamLookupFromStore(readStore);
    const aliases = loadCfbdTeamAliases();

    const fetched = await fetchCfbdScheduleWeek({
      season,
      week,
      apiKey,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
    });
    console.log(`[schedule-write] CFBD HTTP ${fetched.httpStatus}`);
    console.log(
      `[schedule-write] estimated CFBD calls=${fetched.estimatedCfbdCalls}`
    );

    const providerSummary = summarizeProviderGames(fetched.games, season, week);
    console.log(
      '[schedule-write] provider summary:',
      JSON.stringify(providerSummary)
    );

    const weekIssues = assertProviderWeeksMatch(fetched.games, week);
    if (weekIssues.length) {
      console.error('[schedule-write] Unexpected provider weeks — aborting');
      for (const issue of weekIssues) {
        console.error(`  - ${issue.code}: ${issue.message}`);
      }
      return { exitCode: 1 };
    }

    if (fetched.games.length === 0) {
      console.error('[schedule-write] Provider returned zero games');
      return { exitCode: 1 };
    }

    const names = collectProviderTeamNames(fetched.games);
    const resolutions = await resolveAllTeams(names, lookup, aliases);
    const resolutionList = [...resolutions.values()];
    const teamSummary = summarizeTeamResolutions(resolutionList);
    console.log(
      '[schedule-write] team resolution:',
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
        '[schedule-write] Team resolution failed — zero writes performed'
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

    const validation = validateNormalizedBatch(normalized, season, week, {
      source: 'cfbd',
      extraIssues: [...weekIssues, ...kickoffIssues],
    });
    if (!validation.ok) {
      console.error('[schedule-write] Batch validation failed:');
      for (const issue of validation.issues) {
        console.error(`  - ${issue.code}: ${issue.message}`);
      }
      return { exitCode: 1 };
    }

    const existing = await readStore.findGamesForSeasonWeek(season, week);
    const comparison = compareToExistingDb(normalized, existing);
    const protectedRows = findProtectedUpdateTargets(
      comparison.wouldUpdateIds,
      existing
    );
    if (protectedRows.length) {
      console.error(
        '[schedule-write] Protected existing games (scores/completed) — refusing write:'
      );
      for (const row of protectedRows) {
        console.error(
          `  - ${row.id} status=${row.status} scores=${row.homeScore}-${row.awayScore}`
        );
      }
      return { exitCode: 1 };
    }

    const providerRange = {
      earliest: providerSummary.earliestKickoff,
      latest: providerSummary.latestKickoff,
    };
    const normalizedRange = kickoffRangeIso(normalized);

    console.log(
      '[schedule-write] PRE-WRITE SUMMARY:',
      JSON.stringify({
        season,
        week,
        providerRowCount: fetched.games.length,
        normalizedFbsGameCount: normalized.length,
        skippedNonFbs,
        providerKickoffRange: providerRange,
        normalizedKickoffRange: normalizedRange,
        teamResolution: {
          exact: teamSummary.exactCanonicalMatches,
          alias: teamSummary.recognizedAliases,
          missing: teamSummary.missingTeams.length,
          ambiguous: teamSummary.ambiguousTeams.length,
          conflicting: teamSummary.conflictingTeams.length,
        },
        unresolvedTeams: teamSummary.unresolved.map((u) => u.providerName),
        existingDbCount: comparison.existingCount,
        rowsToInsert: comparison.wouldInsertIds.length,
        rowsToUpdate: comparison.wouldUpdateIds.length,
        dbOnlyAbsentFromProvider: comparison.dbOnlyIds.length,
        confirmWrite,
        note: 'DB-only rows will NOT be deleted',
      })
    );

    const writeResult = await writeValidatedScheduleBatch(
      normalized,
      createWriteDeps(prisma),
      { season, week }
    );

    console.log(
      '[schedule-write] WRITE RESULT:',
      JSON.stringify({
        inserted: writeResult.inserted,
        updated: writeResult.updated,
        retainedDbOnly: writeResult.dbOnlyIds.length,
      })
    );

    const actualRows: DbGameRow[] = await prisma.game.findMany({
      where: { season, week },
      select: {
        id: true,
        season: true,
        week: true,
        homeTeamId: true,
        awayTeamId: true,
        date: true,
        homeScore: true,
        awayScore: true,
        status: true,
      },
      orderBy: { date: 'asc' },
    });

    const verification = verifyPostWriteSchedule({
      season,
      week,
      normalized,
      writeResult,
      actualRows,
      preWriteComparison: comparison,
    });

    console.log(
      '[schedule-write] POST-WRITE VERIFICATION:',
      JSON.stringify({
        ok: verification.ok,
        expectedNormalizedCount: verification.expectedNormalizedCount,
        actualDbCount: verification.actualDbCount,
        insertedCount: verification.insertedCount,
        updatedCount: verification.updatedCount,
        missingExpectedIds: verification.missingExpectedIds,
        unexpectedDbOnlyIds: verification.unexpectedDbOnlyIds,
        retainedDbOnlyIds: verification.retainedDbOnlyIds,
        issues: verification.issues,
        first5: sampleNormalizedGames(
          actualRowsToSample(actualRows.slice(0, 5), normalized)
        ),
        last5: sampleNormalizedGames(
          actualRowsToSample(actualRows.slice(-5), normalized)
        ),
      })
    );

    if (!verification.ok) {
      console.error(
        '[schedule-write] Post-write verification FAILED — no automatic repair'
      );
      return { exitCode: 1 };
    }

    console.log('[schedule-write] SUCCESS — one-week schedule write verified');
    return { exitCode: 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[schedule-write] ${redactSecretLike(message)}`);
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma) {
      await prisma.$disconnect();
    }
  }
}

function actualRowsToSample(
  rows: DbGameRow[],
  normalized: NormalizedScheduleGame[]
): NormalizedScheduleGame[] {
  const byId = new Map(normalized.map((g) => [g.id, g]));
  return rows.map((r) => {
    const n = byId.get(r.id);
    if (n) return n;
    return {
      id: r.id,
      season: r.season,
      week: r.week,
      homeTeamId: r.homeTeamId,
      awayTeamId: r.awayTeamId,
      date: r.date,
      rawKickoff: r.date.toISOString(),
      providerWeek: r.week,
      venue: '',
      city: '',
      neutralSite: false,
      conferenceGame: false,
      providerHomeName: r.homeTeamId,
      providerAwayName: r.awayTeamId,
    };
  });
}

async function main(): Promise<void> {
  const parsed = parseWriteScheduleArgs(process.argv.slice(2));
  if (!parsed.ok || !parsed.args) {
    for (const err of parsed.errors) {
      console.error(`[schedule-write] ${err}`);
    }
    process.exit(1);
  }
  const { exitCode } = await runScheduleWrite(parsed.args);
  process.exit(exitCode);
}

if (require.main === module) {
  void main();
}

export { main };
