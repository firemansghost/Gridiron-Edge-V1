/**
 * CLI — Guarded 2026 CFBD weekly schedule rollover PREVIEW/COMMIT.
 *
 * PREVIEW: DB read + CFBD /games (and optional /venues); zero mutations.
 * COMMIT: Serializable transaction creating missing Game rows and updating
 * schedule metadata only. Verification runs inside the transaction.
 *
 * NOT AUTHORIZED merely by merge. Replaces ingest-2026-schedules.yml.
 * Does NOT call Odds/SGO/weather. Does NOT write scores, status, MarketLine,
 * Bet, TeamGameStat, ratings, or grading.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  collectProviderTeamNames,
  createPrismaReadOnlyScheduleStore,
  loadCfbdTeamAliases,
  redactSecretLike,
  resolveAllTeams,
  teamLookupFromStore,
} from './src/preseason/cfbd-schedule-ingest';
import {
  buildFailedCommitExecution,
  buildPreviewExecution,
  buildRolledBackExecution,
  buildSuccessfulCommitExecution,
  commitEligible,
  executeAtomicScheduleRolloverCommit,
  expectedScheduleRolloverConfirmation,
  fetchGuardedCfbdScheduleWeek,
  finalizeScheduleRolloverReport,
  parseScheduleRolloverCliArgs,
  planScheduleRollover,
  resolvePreviewExitCode,
  type DbScheduleGameRow,
  type ScheduleRolloverExecutionState,
  type ScheduleRolloverPlan,
  type ScheduleRolloverPostWriteVerification,
} from './src/preseason/cfbd-schedule-rollover-2026';

function defaultReportPath(season: number, week: number, mode: string): string {
  return path.join(
    process.cwd(),
    'reports',
    `cfbd-schedules-2026-week-${week}-${mode.toLowerCase()}.json`
  );
}

function writeReport(
  reportPath: string,
  plan: ScheduleRolloverPlan,
  execution: ScheduleRolloverExecutionState,
  verification: ScheduleRolloverPostWriteVerification | null,
  meta: Record<string, unknown> = {}
): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = finalizeScheduleRolloverReport({
    plan,
    execution,
    verification,
    meta,
  });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
}

export function mapScheduleGameRows(
  rows: Array<{
    id: string;
    season: number;
    week: number;
    homeTeamId: string;
    awayTeamId: string;
    date: Date;
    venue: string;
    city: string;
    neutralSite: boolean;
    conferenceGame: boolean;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
  }>
): DbScheduleGameRow[] {
  return rows.map((r) => ({
    id: r.id,
    season: r.season,
    week: r.week,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    date: r.date,
    venue: r.venue,
    city: r.city,
    neutralSite: r.neutralSite,
    conferenceGame: r.conferenceGame,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    status: r.status,
  }));
}

const GAME_SELECT = {
  id: true,
  season: true,
  week: true,
  homeTeamId: true,
  awayTeamId: true,
  date: true,
  venue: true,
  city: true,
  neutralSite: true,
  conferenceGame: true,
  homeScore: true,
  awayScore: true,
  status: true,
} as const;

async function main(): Promise<void> {
  const parsed = parseScheduleRolloverCliArgs(process.argv.slice(2));
  if (!parsed.ok || !parsed.args) {
    for (const e of parsed.errors) console.error(e);
    process.exitCode = 1;
    return;
  }
  const args = parsed.args;
  const reportPath =
    args.reportPath ?? defaultReportPath(args.season, args.week, args.mode);

  console.log('============================================================');
  console.log('GUARDED 2026 CFBD SCHEDULE ROLLOVER');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(
    `expectedConfirmation=${expectedScheduleRolloverConfirmation(args.week)} (value not echoed from input)`
  );
  console.log('PREVIEW IS DATABASE READ-ONLY except CFBD schedule endpoints');
  console.log(
    'COMMIT mutations: Game create + schedule metadata update only (no delete/upsert/skipDuplicates)'
  );
  console.log('legacy ingest-2026-schedules.yml / write-schedules.ts: not invoked');

  if (args.mode === 'COMMIT') {
    if (args.confirmation !== expectedScheduleRolloverConfirmation(args.week)) {
      console.error('COMMIT confirmation invalid — provider call skipped');
      process.exitCode = 1;
      return;
    }
  }

  const apiKey = process.env.CFBD_API_KEY ?? '';
  if (!apiKey.trim()) {
    console.error('CFBD_API_KEY is missing or empty');
    process.exitCode = 1;
    return;
  }

  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL required');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  let execution: ScheduleRolloverExecutionState = buildPreviewExecution(0);
  let verification: ScheduleRolloverPostWriteVerification | null = null;
  let plan: ScheduleRolloverPlan | null = null;

  try {
    const memberships = await prisma.teamMembership.findMany({
      where: { season: args.season, level: 'fbs' },
      select: { teamId: true },
    });
    const fbsTeamIds = memberships.map((m) => m.teamId);

    const existingGames = mapScheduleGameRows(
      await prisma.game.findMany({
        where: { season: args.season, week: args.week },
        select: GAME_SELECT,
      })
    );

    const fetched = await fetchGuardedCfbdScheduleWeek({
      season: args.season,
      week: args.week,
      apiKey,
      baseUrl: process.env.CFBD_BASE_URL,
    });

    const store = createPrismaReadOnlyScheduleStore(prisma);
    const lookup = teamLookupFromStore(store);
    const aliases = loadCfbdTeamAliases();
    const names = collectProviderTeamNames(fetched.games);
    const teamResolutions = await resolveAllTeams(names, lookup, aliases);

    plan = planScheduleRollover({
      season: args.season,
      week: args.week,
      mode: args.mode,
      confirmation: args.confirmation,
      providerGames: fetched.games,
      venueCityByName: fetched.venueCityByName,
      providerHttpStatus: fetched.providerHttpStatus,
      providerVenueHttpStatus: fetched.providerVenueHttpStatus,
      providerCalls: fetched.providerCalls,
      fbsTeamIds,
      existingGames,
      teamResolutions,
    });

    console.log(
      `writeSafe=${plan.writeSafe} normalized=${plan.normalizedFbsVsFbsCount} creates=${plan.proposedCreates} updates=${plan.proposedMetadataUpdates} dbOnly=${plan.dbOnlyRowCount} blockers=${plan.blockers.length} providerCalls=${plan.providerCalls}`
    );
    if (plan.blockers.length) {
      console.log(`blockers=${plan.blockers.join(' | ')}`);
    }

    if (args.mode === 'PREVIEW') {
      execution = buildPreviewExecution(plan.providerCalls);
      writeReport(reportPath, plan, execution, null, {});
      process.exitCode = resolvePreviewExitCode(plan.writeSafe);
      return;
    }

    if (!commitEligible(plan)) {
      execution = buildFailedCommitExecution({
        providerCalls: plan.providerCalls,
        error: `COMMIT blocked: writeSafe=${plan.writeSafe} confirmationValid=${plan.confirmationValid}`,
      });
      writeReport(reportPath, plan, execution, null, {});
      process.exitCode = 1;
      return;
    }

    let createCount = 0;
    let updateCount = 0;
    let txMutations = 0;
    const providerGames = fetched.games;
    const venueCityByName = fetched.venueCityByName;

    try {
      const txResult = await prisma.$transaction(
        async (tx) => {
          const result = await executeAtomicScheduleRolloverCommit({
            plan: plan!,
            providerGames,
            venueCityByName,
            teamResolutions,
            reReadFbsTeamIds: async () => {
              const rows = await tx.teamMembership.findMany({
                where: { season: args.season, level: 'fbs' },
                select: { teamId: true },
              });
              return rows.map((m) => m.teamId);
            },
            reReadGames: async () =>
              mapScheduleGameRows(
                await tx.game.findMany({
                  where: { season: args.season, week: args.week },
                  select: GAME_SELECT,
                })
              ),
            createRow: async (row) => {
              txMutations += 1;
              await tx.game.create({
                data: {
                  id: row.row.id,
                  season: row.row.season,
                  week: row.row.week,
                  date: row.row.date,
                  status: 'scheduled',
                  venue: row.row.venue,
                  city: row.row.city,
                  neutralSite: row.row.neutralSite,
                  conferenceGame: row.row.conferenceGame,
                  homeScore: null,
                  awayScore: null,
                  homeTeam: { connect: { id: row.row.homeTeamId } },
                  awayTeam: { connect: { id: row.row.awayTeamId } },
                },
              });
            },
            updateRow: async (row) => {
              txMutations += 1;
              await tx.game.update({
                where: { id: row.id },
                data: {
                  date: row.fields.date,
                  venue: row.fields.venue,
                  city: row.fields.city,
                  neutralSite: row.fields.neutralSite,
                  conferenceGame: row.fields.conferenceGame,
                },
              });
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      createCount = txResult.createCount;
      updateCount = txResult.updateCount;
      plan = txResult.rePlan;
      verification = txResult.verification;
    } catch (err) {
      const msg = redactSecretLike(
        err instanceof Error ? err.message : String(err)
      );
      const verificationFailed = /post-write verification failed/i.test(msg);
      execution = buildRolledBackExecution({
        providerCalls: plan.providerCalls,
        error: msg,
        mutationsInvoked: txMutations > 0,
        postWriteVerificationSucceeded: verificationFailed ? false : null,
      });
      writeReport(reportPath, plan, execution, verification, {
        rolledBack: true,
        isolationLevel: 'Serializable',
        transactionalVerificationFailed: verificationFailed,
      });
      throw err;
    }

    execution = buildSuccessfulCommitExecution({
      providerCalls: plan.providerCalls,
      createCount,
      updateCount,
    });
    writeReport(reportPath, plan, execution, verification, {
      isolationLevel: 'Serializable',
      transactionalVerification: true,
    });
    console.log(
      `COMMIT succeeded: createCount=${createCount} updateCount=${updateCount} verification=${verification?.ok === true}`
    );
  } catch (err) {
    const msg = redactSecretLike(
      err instanceof Error ? err.message : String(err)
    );
    console.error(msg);
    if (plan) {
      if (!execution.commitAttempted) {
        execution = {
          ...buildPreviewExecution(plan.providerCalls),
          error: msg,
        };
      }
      writeReport(reportPath, plan, execution, verification, { fatal: true });
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(
    redactSecretLike(err instanceof Error ? err.message : String(err))
  );
  process.exit(1);
});
