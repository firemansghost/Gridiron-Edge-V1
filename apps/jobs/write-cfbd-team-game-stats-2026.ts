/**
 * CLI — Guarded 2026 CFBD TeamGameStat PREVIEW/COMMIT (Phase 2C-2J-6D-1).
 *
 * PREVIEW: DB read + one CFBD /stats/game/advanced call; zero mutations.
 * COMMIT: Serializable transaction creating/updating TeamGameStat only.
 *
 * Does NOT call Odds/SGO/weather. Does NOT grade. Does NOT write Game/MarketLine/Bet/ratings/cfbdEff*.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import {
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
  collectProviderTeamNamesFromStats,
  commitEligible,
  executeAtomicTeamGameStatCommit,
  expectedTeamGameStatConfirmation,
  fetchCfbdAdvancedGameStatsWeek,
  finalizeTeamGameStatReport,
  naturalKey,
  parseTeamGameStatCliArgs,
  planTeamGameStats,
  resolvePreviewExitCode,
  verifyTeamGameStatPostWrite,
  type DbGameRowForStats,
  type DbTeamGameStatRow,
  type ManagedTeamGameStatFields,
  type TeamGameStatExecutionState,
  type TeamGameStatPlan,
  type TeamGameStatPostWriteVerification,
} from './src/stats/cfbd-team-game-stats-2026';

function defaultReportPath(season: number, week: number, mode: string): string {
  return path.join(
    process.cwd(),
    'reports',
    `cfbd-team-game-stats-2026-${season}-week-${week}-${mode.toLowerCase()}.json`
  );
}

function writeReport(
  reportPath: string,
  plan: TeamGameStatPlan,
  execution: TeamGameStatExecutionState,
  verification: TeamGameStatPostWriteVerification | null,
  meta: Record<string, unknown> = {}
): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = finalizeTeamGameStatReport({
    plan,
    execution,
    verification,
    meta,
  });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`report=${reportPath}`);
}

function mapGameRows(
  rows: Array<{
    id: string;
    season: number;
    week: number;
    homeTeamId: string;
    awayTeamId: string;
    status: string;
  }>
): DbGameRowForStats[] {
  return rows.map((r) => ({
    id: r.id,
    season: r.season,
    week: r.week,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    status: r.status,
  }));
}

function mapStatRows(
  rows: Array<{
    id: string;
    gameId: string;
    teamId: string;
    season: number;
    week: number;
    yppOff: number | null;
    successOff: number | null;
    epaOff: number | null;
    pace: number | null;
    passYpaOff: number | null;
    rushYpcOff: number | null;
    yppDef: number | null;
    successDef: number | null;
    epaDef: number | null;
    passYpaDef: number | null;
    rushYpcDef: number | null;
    offensive_stats: unknown;
    defensive_stats: unknown;
    special_teams: unknown;
    rawJson: unknown;
  }>
): DbTeamGameStatRow[] {
  return rows.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    teamId: r.teamId,
    season: r.season,
    week: r.week,
    yppOff: r.yppOff,
    successOff: r.successOff,
    epaOff: r.epaOff,
    pace: r.pace,
    passYpaOff: r.passYpaOff,
    rushYpcOff: r.rushYpcOff,
    yppDef: r.yppDef,
    successDef: r.successDef,
    epaDef: r.epaDef,
    passYpaDef: r.passYpaDef,
    rushYpcDef: r.rushYpcDef,
    offensive_stats: (r.offensive_stats ?? {}) as Record<string, unknown>,
    defensive_stats: (r.defensive_stats ?? {}) as Record<string, unknown>,
    special_teams: (r.special_teams ?? {}) as Record<string, unknown>,
    rawJson: (r.rawJson ?? {}) as Record<string, unknown>,
  }));
}

function prismaCreateData(
  season: number,
  week: number,
  row: { gameId: string; teamId: string; fields: ManagedTeamGameStatFields }
) {
  const f = row.fields;
  return {
    gameId: row.gameId,
    teamId: row.teamId,
    season,
    week,
    offensive_stats: f.offensive_stats,
    defensive_stats: f.defensive_stats,
    special_teams: f.special_teams,
    yppOff: f.yppOff,
    successOff: f.successOff,
    epaOff: f.epaOff,
    pace: f.pace,
    passYpaOff: f.passYpaOff,
    rushYpcOff: f.rushYpcOff,
    yppDef: f.yppDef,
    successDef: f.successDef,
    epaDef: f.epaDef,
    passYpaDef: f.passYpaDef,
    rushYpcDef: f.rushYpcDef,
    rawJson: f.rawJson,
  };
}

function prismaUpdateData(fields: ManagedTeamGameStatFields) {
  return {
    offensive_stats: fields.offensive_stats,
    defensive_stats: fields.defensive_stats,
    special_teams: fields.special_teams,
    yppOff: fields.yppOff,
    successOff: fields.successOff,
    epaOff: fields.epaOff,
    pace: fields.pace,
    passYpaOff: fields.passYpaOff,
    rushYpcOff: fields.rushYpcOff,
    yppDef: fields.yppDef,
    successDef: fields.successDef,
    epaDef: fields.epaDef,
    passYpaDef: fields.passYpaDef,
    rushYpcDef: fields.rushYpcDef,
    rawJson: fields.rawJson,
  };
}

async function main(): Promise<void> {
  const parsed = parseTeamGameStatCliArgs(process.argv.slice(2));
  if (!parsed.ok || !parsed.args) {
    for (const e of parsed.errors) console.error(e);
    process.exitCode = 1;
    return;
  }
  const args = parsed.args;
  const reportPath =
    args.reportPath ?? defaultReportPath(args.season, args.week, args.mode);

  console.log('============================================================');
  console.log('GUARDED 2026 CFBD TEAM GAME STAT WRITER (2C-2J-6D-1)');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week} mode=${args.mode}`);
  console.log(
    `expectedConfirmation=${expectedTeamGameStatConfirmation(args.week)} (value not echoed from input)`
  );
  console.log('PREVIEW IS DATABASE READ-ONLY except CFBD provider read');
  console.log('mutations: TeamGameStat create/update only');

  if (args.mode === 'COMMIT') {
    if (args.confirmation !== expectedTeamGameStatConfirmation(args.week)) {
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
  let execution: TeamGameStatExecutionState = buildPreviewExecution(0);
  let verification: TeamGameStatPostWriteVerification | null = null;
  let plan: TeamGameStatPlan | null = null;

  try {
    const memberships = await prisma.teamMembership.findMany({
      where: { season: args.season, level: 'fbs' },
      select: { teamId: true },
    });
    const fbsTeamIds = memberships.map((m) => m.teamId);

    const dbGames = mapGameRows(
      await prisma.game.findMany({
        where: { season: args.season, week: args.week },
        select: {
          id: true,
          season: true,
          week: true,
          homeTeamId: true,
          awayTeamId: true,
          status: true,
        },
      })
    );

    const existingStats = mapStatRows(
      await prisma.teamGameStat.findMany({
        where: { season: args.season, week: args.week },
        select: {
          id: true,
          gameId: true,
          teamId: true,
          season: true,
          week: true,
          yppOff: true,
          successOff: true,
          epaOff: true,
          pace: true,
          passYpaOff: true,
          rushYpcOff: true,
          yppDef: true,
          successDef: true,
          epaDef: true,
          passYpaDef: true,
          rushYpcDef: true,
          offensive_stats: true,
          defensive_stats: true,
          special_teams: true,
          rawJson: true,
        },
      })
    );

    const fetchResult = await fetchCfbdAdvancedGameStatsWeek({
      season: args.season,
      week: args.week,
      apiKey,
      baseUrl: process.env.CFBD_BASE_URL,
    });

    const store = createPrismaReadOnlyScheduleStore(prisma);
    const lookup = teamLookupFromStore(store);
    const aliases = loadCfbdTeamAliases();
    const names = collectProviderTeamNamesFromStats(fetchResult.rows);
    const teamResolutions = await resolveAllTeams(names, lookup, aliases);

    plan = planTeamGameStats({
      season: args.season,
      week: args.week,
      mode: args.mode,
      confirmation: args.confirmation,
      providerRows: fetchResult.rows,
      providerHttpStatus: fetchResult.httpStatus,
      providerCalls: fetchResult.providerCalls,
      dbGames,
      existingStats,
      fbsTeamIds,
      teamResolutions,
    });

    console.log(
      `writeSafe=${plan.writeSafe} expected=${plan.counts.expectedFbsParticipantRows} creates=${plan.counts.proposedCreates} updates=${plan.counts.proposedUpdates} blockers=${plan.blockers.length}`
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
    let unchangedCount = 0;
    let txMutationAttempts = 0;
    const providerRows = fetchResult.rows;

    try {
      const txResult = await prisma.$transaction(
        async (tx) => {
          const result = await executeAtomicTeamGameStatCommit({
            plan: plan!,
            providerRows,
            fbsTeamIds,
            teamResolutions,
            reReadExisting: async () =>
              mapStatRows(
                await tx.teamGameStat.findMany({
                  where: { season: args.season, week: args.week },
                  select: {
                    id: true,
                    gameId: true,
                    teamId: true,
                    season: true,
                    week: true,
                    yppOff: true,
                    successOff: true,
                    epaOff: true,
                    pace: true,
                    passYpaOff: true,
                    rushYpcOff: true,
                    yppDef: true,
                    successDef: true,
                    epaDef: true,
                    passYpaDef: true,
                    rushYpcDef: true,
                    offensive_stats: true,
                    defensive_stats: true,
                    special_teams: true,
                    rawJson: true,
                  },
                })
              ),
            reReadGames: async () =>
              mapGameRows(
                await tx.game.findMany({
                  where: { season: args.season, week: args.week },
                  select: {
                    id: true,
                    season: true,
                    week: true,
                    homeTeamId: true,
                    awayTeamId: true,
                    status: true,
                  },
                })
              ),
            createRow: async (row) => {
              txMutationAttempts += 1;
              await tx.teamGameStat.create({
                data: prismaCreateData(args.season, args.week, row),
              });
            },
            updateRow: async (row) => {
              if (!row.id) {
                throw new Error(
                  `planned update missing id for ${naturalKey(row.gameId, row.teamId)}`
                );
              }
              txMutationAttempts += 1;
              await tx.teamGameStat.update({
                where: { id: row.id },
                data: prismaUpdateData(row.fields),
              });
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      createCount = txResult.createCount;
      updateCount = txResult.updateCount;
      unchangedCount = txResult.unchangedCount;
      plan = txResult.rePlan;
    } catch (err) {
      const msg = redactSecretLike(
        err instanceof Error ? err.message : String(err)
      );
      execution = buildRolledBackExecution({
        providerCalls: plan.providerCalls,
        mutationAttempts: txMutationAttempts,
        error: msg,
      });
      writeReport(reportPath, plan, execution, null, {
        rolledBack: true,
        isolationLevel: 'Serializable',
      });
      throw err;
    }

    const afterRows = mapStatRows(
      await prisma.teamGameStat.findMany({
        where: { season: args.season, week: args.week },
        select: {
          id: true,
          gameId: true,
          teamId: true,
          season: true,
          week: true,
          yppOff: true,
          successOff: true,
          epaOff: true,
          pace: true,
          passYpaOff: true,
          rushYpcOff: true,
          yppDef: true,
          successDef: true,
          epaDef: true,
          passYpaDef: true,
          rushYpcDef: true,
          offensive_stats: true,
          defensive_stats: true,
          special_teams: true,
          rawJson: true,
        },
      })
    );

    const plannedByKey = new Map<string, ManagedTeamGameStatFields>(
      Object.entries(plan.plannedByKey)
    );

    verification = verifyTeamGameStatPostWrite({
      expectedKeys: plan.expectedKeys,
      plannedByKey,
      afterRows,
      expectedCreateCount: createCount,
      expectedUpdateCount: updateCount,
      createCount,
      updateCount,
    });

    if (!verification.ok) {
      execution = buildSuccessfulCommitExecution({
        providerCalls: plan.providerCalls,
        createCount,
        updateCount,
        unchangedCount,
        postWriteVerificationSucceeded: false,
        error: `post-write verification failed: ${verification.reasons.join('; ')}`,
      });
      writeReport(reportPath, plan, execution, verification, {
        verificationFailed: true,
      });
      process.exitCode = 1;
      return;
    }

    execution = buildSuccessfulCommitExecution({
      providerCalls: plan.providerCalls,
      createCount,
      updateCount,
      unchangedCount,
      postWriteVerificationSucceeded: true,
    });
    writeReport(reportPath, plan, execution, verification, {
      isolationLevel: 'Serializable',
    });
    console.log(
      `COMMIT succeeded: createCount=${createCount} updateCount=${updateCount} unchangedCount=${unchangedCount}`
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
