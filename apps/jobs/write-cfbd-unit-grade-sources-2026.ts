#!/usr/bin/env node
/**
 * CLI — Guarded 2026 CFBD unit-grade SOURCE ingest PREVIEW/COMMIT.
 *
 * PREVIEW: CFBD reads + DB SELECTs; zero mutations.
 * COMMIT: Serializable upsert of cfbd_games / cfbd_eff_team_game /
 * cfbd_ppa_team_game / cfbd_eff_team_season only after full planning.
 *
 * Does NOT write TeamUnitGrades, priors, Shadow, Bet, or MatchupOutput.
 * Does NOT run compute_unit_grades.ts.
 * Does NOT invoke ingest-cfbd-features.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createPrismaReadOnlyScheduleStore,
  loadCfbdTeamAliases,
  redactSecretLike,
  resolveAllTeams,
  teamLookupFromStore,
} from './src/preseason/cfbd-schedule-ingest';
import {
  TARGET_SEASON,
  UNIT_GRADE_SOURCE_CONFIRMATION,
  SequentialJsonFetcher,
  collectProviderNamesFromPayloads,
  fetchUnitGradeSourcePayloads,
  mutationTelemetryAfterCommitAttempt,
  parseUnitGradeSourceIngestArgs,
  pickEffMetricFields,
  planUnitGradeSourceIngest,
  snapshotProviderTelemetry,
  type EffMetricFields,
  type ExistingCfbdGameRow,
  type ExistingEffTeamGameRow,
  type ExistingEffTeamSeasonRow,
  type ExistingPpaTeamGameRow,
  type MembershipRow,
  type PlannedEffGameRow,
  type PlannedEffSeasonRow,
  type PlannedGameRow,
  type PlannedPpaGameRow,
  type UnitGradeSourceIngestPlan,
} from './src/v2/cfbd-unit-grade-source-ingest-2026';

function defaultReportPath(mode: string): string {
  return path.join(
    process.cwd(),
    'reports',
    `cfbd-unit-grade-sources-2026-${mode.toLowerCase()}.json`
  );
}

function writeJson(reportPath: string, report: object): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`report=${reportPath}`);
}

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

function prismaNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    try {
      return (value as { toNumber: () => number }).toNumber();
    } catch {
      return null;
    }
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const EFF_SELECT = {
  offEpa: true,
  offSr: true,
  isoPppOff: true,
  ppoOff: true,
  lineYardsOff: true,
  havocOff: true,
  havocFront7Off: true,
  havocDbOff: true,
  defEpa: true,
  defSr: true,
  isoPppDef: true,
  ppoDef: true,
  stuffRate: true,
  powerSuccess: true,
  havocDef: true,
  havocFront7Def: true,
  havocDbDef: true,
  runEpa: true,
  passEpa: true,
  runSr: true,
  passSr: true,
  earlyDownEpa: true,
  lateDownEpa: true,
  avgFieldPosition: true,
} as const;

function mapEff(row: Record<string, unknown>): EffMetricFields {
  return {
    offEpa: prismaNumeric(row.offEpa),
    offSr: prismaNumeric(row.offSr),
    isoPppOff: prismaNumeric(row.isoPppOff),
    ppoOff: prismaNumeric(row.ppoOff),
    lineYardsOff: prismaNumeric(row.lineYardsOff),
    havocOff: prismaNumeric(row.havocOff),
    havocFront7Off: prismaNumeric(row.havocFront7Off),
    havocDbOff: prismaNumeric(row.havocDbOff),
    defEpa: prismaNumeric(row.defEpa),
    defSr: prismaNumeric(row.defSr),
    isoPppDef: prismaNumeric(row.isoPppDef),
    ppoDef: prismaNumeric(row.ppoDef),
    stuffRate: prismaNumeric(row.stuffRate),
    powerSuccess: prismaNumeric(row.powerSuccess),
    havocDef: prismaNumeric(row.havocDef),
    havocFront7Def: prismaNumeric(row.havocFront7Def),
    havocDbDef: prismaNumeric(row.havocDbDef),
    runEpa: prismaNumeric(row.runEpa),
    passEpa: prismaNumeric(row.passEpa),
    runSr: prismaNumeric(row.runSr),
    passSr: prismaNumeric(row.passSr),
    earlyDownEpa: prismaNumeric(row.earlyDownEpa),
    lateDownEpa: prismaNumeric(row.lateDownEpa),
    avgFieldPosition: prismaNumeric(row.avgFieldPosition),
  };
}

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return redactSecretLike(msg);
}

function buildReport(options: {
  plan: UnitGradeSourceIngestPlan | null;
  repoCommitSha: string;
  observedAt: string;
  mode: string;
  providerCalls: number;
  endpointsInvoked: string[];
  responseRowCounts: Record<string, number> | { status: 'partial_unavailable' };
  mutationsInvoked: boolean;
  commitSucceeded: boolean;
  transactionRolledBack: boolean;
  committed?: Record<string, number> | null;
  postWrite?: Record<string, number> | null;
  error?: string;
}): object {
  const plan = options.plan;
  const persistedWrites = options.mutationsInvoked && options.commitSucceeded && !options.transactionRolledBack;
  return {
    season: TARGET_SEASON,
    requestedWeeks: plan ? plan.requestedWeeks : [],
    repoCommitSha: options.repoCommitSha,
    observedAt: options.observedAt,
    mode: options.mode,
    providerEndpointsInvoked: options.endpointsInvoked,
    providerCallCounts: options.providerCalls,
    responseRowCounts: options.responseRowCounts,
    teamMappingCounts: plan
      ? {
          providerTeamNamesEncountered: plan.providerTeamNamesEncountered.length,
          mappedProviderTeamCount: plan.mappedProviderTeamCount,
          distinctMappedInternalIds: plan.distinctMappedInternalIds.length,
          unmappedProviderTeams: plan.unmappedProviderTeams.length,
        }
      : null,
    providerTeamNamesEncountered: plan ? plan.providerTeamNamesEncountered : [],
    mappedProviderTeamCount: plan ? plan.mappedProviderTeamCount : 0,
    distinctMappedInternalIds: plan ? plan.distinctMappedInternalIds : [],
    unmappedTeams: plan ? plan.unmappedProviderTeams : [],
    gameCounts: plan ? plan.gameCounts : null,
    effGameCounts: plan ? plan.effGameCounts : null,
    ppaGameCounts: plan ? plan.ppaGameCounts : null,
    effSeasonCounts: plan ? plan.effSeasonCounts : null,
    proposedSourceCoverage: plan ? plan.proposedSourceCoverage : null,
    skipped: plan ? plan.skipped : [],
    warnings: plan ? plan.warnings : [],
    blockers: plan ? plan.blockers : [],
    writeSafe: plan ? plan.writeSafe : false,
    mutationsInvoked: options.mutationsInvoked,
    commitSucceeded: options.commitSucceeded,
    transactionRolledBack: options.transactionRolledBack,
    persistedWrites,
    teamUnitGradesWrites: false,
    shadowWrites: false,
    priorsWrites: false,
    committed: persistedWrites ? options.committed ?? null : null,
    postWriteSelect: persistedWrites ? options.postWrite ?? null : null,
    cfbdLeaseSemantics: plan ? plan.cfbdLeaseSemantics : null,
    processMaxConcurrency: plan ? plan.processMaxConcurrency : 1,
    error: options.error ?? null,
  };
}

function emptyMutationTelemetry() {
  return mutationTelemetryAfterCommitAttempt({
    commitReached: false,
    commitSucceeded: false,
  });
}

async function commitPlan(
  prisma: PrismaClient,
  plan: UnitGradeSourceIngestPlan,
  asOf: Date
): Promise<{ committed: Record<string, number> }> {
  const games = plan.games.filter((g) => g.kind !== 'NO_CHANGE');
  const effGames = plan.effGames.filter((g) => g.kind !== 'NO_CHANGE');
  const ppaGames = plan.ppaGames.filter((g) => g.kind !== 'NO_CHANGE');
  const seasons = plan.effSeasons.filter((g) => g.kind !== 'NO_CHANGE');

  await prisma.$transaction(
    async (tx) => {
      for (const g of games) {
        await upsertGame(tx, g, asOf);
      }
      for (const r of effGames) {
        await upsertEffGame(tx, r, asOf);
      }
      for (const r of ppaGames) {
        await upsertPpaGame(tx, r, asOf);
      }
      for (const r of seasons) {
        await upsertEffSeason(tx, r, asOf);
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  return {
    committed: {
      games: games.length,
      effGames: effGames.length,
      ppaGames: ppaGames.length,
      effSeasons: seasons.length,
    },
  };
}

async function upsertGame(
  tx: Prisma.TransactionClient,
  g: PlannedGameRow,
  asOf: Date
): Promise<void> {
  await tx.cfbdGame.upsert({
    where: { gameIdCfbd: g.gameIdCfbd },
    update: {
      season: g.season,
      week: g.week,
      date: new Date(g.dateIso),
      homeTeamIdInternal: g.homeTeamIdInternal,
      awayTeamIdInternal: g.awayTeamIdInternal,
      neutralSite: g.neutralSite,
      venue: g.venue,
      homeConference: g.homeConference,
      awayConference: g.awayConference,
      source: 'cfbd',
      asOf,
    },
    create: {
      gameIdCfbd: g.gameIdCfbd,
      season: g.season,
      week: g.week,
      date: new Date(g.dateIso),
      homeTeamIdInternal: g.homeTeamIdInternal,
      awayTeamIdInternal: g.awayTeamIdInternal,
      neutralSite: g.neutralSite,
      venue: g.venue,
      homeConference: g.homeConference,
      awayConference: g.awayConference,
      source: 'cfbd',
      asOf,
    },
  });
}

async function upsertEffGame(
  tx: Prisma.TransactionClient,
  r: PlannedEffGameRow,
  asOf: Date
): Promise<void> {
  await tx.cfbdEffTeamGame.upsert({
    where: {
      gameIdCfbd_teamIdInternal: {
        gameIdCfbd: r.gameIdCfbd,
        teamIdInternal: r.teamIdInternal,
      },
    },
    update: { ...pickEffMetricFields(r), source: 'cfbd', asOf },
    create: {
      gameIdCfbd: r.gameIdCfbd,
      teamIdInternal: r.teamIdInternal,
      ...pickEffMetricFields(r),
      source: 'cfbd',
      asOf,
    },
  });
}

async function upsertPpaGame(
  tx: Prisma.TransactionClient,
  r: PlannedPpaGameRow,
  asOf: Date
): Promise<void> {
  await tx.cfbdPpaTeamGame.upsert({
    where: {
      gameIdCfbd_teamIdInternal: {
        gameIdCfbd: r.gameIdCfbd,
        teamIdInternal: r.teamIdInternal,
      },
    },
    update: {
      ppaOffense: r.ppaOffense,
      ppaDefense: r.ppaDefense,
      ppaOverall: r.ppaOverall,
      source: 'cfbd',
      asOf,
    },
    create: {
      gameIdCfbd: r.gameIdCfbd,
      teamIdInternal: r.teamIdInternal,
      ppaOffense: r.ppaOffense,
      ppaDefense: r.ppaDefense,
      ppaOverall: r.ppaOverall,
      source: 'cfbd',
      asOf,
    },
  });
}

async function upsertEffSeason(
  tx: Prisma.TransactionClient,
  r: PlannedEffSeasonRow,
  asOf: Date
): Promise<void> {
  await tx.cfbdEffTeamSeason.upsert({
    where: {
      season_teamIdInternal: {
        season: r.season,
        teamIdInternal: r.teamIdInternal,
      },
    },
    update: { ...pickEffMetricFields(r), source: 'cfbd', asOf },
    create: {
      season: r.season,
      teamIdInternal: r.teamIdInternal,
      ...pickEffMetricFields(r),
      source: 'cfbd',
      asOf,
    },
  });
}

async function loadExisting(prisma: PrismaClient, season: number): Promise<{
  memberships: MembershipRow[];
  games: ExistingCfbdGameRow[];
  effGames: ExistingEffTeamGameRow[];
  ppaGames: ExistingPpaTeamGameRow[];
  seasons: ExistingEffTeamSeasonRow[];
}> {
  const memberships = await prisma.teamMembership.findMany({
    where: { season },
    select: { teamId: true, level: true },
    orderBy: { teamId: 'asc' },
  });
  const games = await prisma.cfbdGame.findMany({
    where: { season },
    select: {
      gameIdCfbd: true,
      season: true,
      week: true,
      date: true,
      homeTeamIdInternal: true,
      awayTeamIdInternal: true,
      neutralSite: true,
      venue: true,
      homeConference: true,
      awayConference: true,
    },
  });
  const seasonGameIds = games.map((g) => g.gameIdCfbd);
  const [effGames, ppaGames, seasons] = await Promise.all([
    seasonGameIds.length === 0
      ? Promise.resolve([])
      : prisma.cfbdEffTeamGame.findMany({
          where: { gameIdCfbd: { in: seasonGameIds } },
          select: { gameIdCfbd: true, teamIdInternal: true, ...EFF_SELECT },
        }),
    seasonGameIds.length === 0
      ? Promise.resolve([])
      : prisma.cfbdPpaTeamGame.findMany({
          where: { gameIdCfbd: { in: seasonGameIds } },
          select: {
            gameIdCfbd: true,
            teamIdInternal: true,
            ppaOffense: true,
            ppaDefense: true,
            ppaOverall: true,
          },
        }),
    prisma.cfbdEffTeamSeason.findMany({
      where: { season },
      select: { season: true, teamIdInternal: true, ...EFF_SELECT },
    }),
  ]);
  return {
    memberships,
    games,
    effGames: effGames.map((r) => ({
      gameIdCfbd: r.gameIdCfbd,
      teamIdInternal: r.teamIdInternal,
      ...mapEff(r as unknown as Record<string, unknown>),
    })),
    ppaGames: ppaGames.map((r) => ({
      gameIdCfbd: r.gameIdCfbd,
      teamIdInternal: r.teamIdInternal,
      ppaOffense: prismaNumeric(r.ppaOffense),
      ppaDefense: prismaNumeric(r.ppaDefense),
      ppaOverall: prismaNumeric(r.ppaOverall),
    })),
    seasons: seasons.map((r) => ({
      season: r.season,
      teamIdInternal: r.teamIdInternal,
      ...mapEff(r as unknown as Record<string, unknown>),
    })),
  };
}

async function postWriteCounts(prisma: PrismaClient, season: number) {
  const games = await prisma.cfbdGame.count({ where: { season } });
  const gameIds = (
    await prisma.cfbdGame.findMany({
      where: { season },
      select: { gameIdCfbd: true },
    })
  ).map((g) => g.gameIdCfbd);
  const [effGames, ppaGames, seasons, unitGrades, shadowRuns] = await Promise.all([
    gameIds.length === 0
      ? Promise.resolve(0)
      : prisma.cfbdEffTeamGame.count({ where: { gameIdCfbd: { in: gameIds } } }),
    gameIds.length === 0
      ? Promise.resolve(0)
      : prisma.cfbdPpaTeamGame.count({ where: { gameIdCfbd: { in: gameIds } } }),
    prisma.cfbdEffTeamSeason.count({ where: { season } }),
    prisma.teamUnitGrades.count({ where: { season } }),
    prisma.shadowCaptureRun.count(),
  ]);
  return {
    cfbdGames: games,
    cfbdEffTeamGame: effGames,
    cfbdPpaTeamGame: ppaGames,
    cfbdEffTeamSeason: seasons,
    teamUnitGrades: unitGrades,
    shadowCaptureRuns: shadowRuns,
  };
}

async function main() {
  const parsed = parseUnitGradeSourceIngestArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    process.exit(1);
  }
  const args = parsed.args;
  const reportPath = args.reportPath || defaultReportPath(args.mode);
  const observedAt = new Date().toISOString();
  let repoCommitSha = 'unknown';
  try {
    repoCommitSha = readRepoCommitSha();
  } catch (err) {
    console.error(sanitizeError(err));
    process.exit(1);
  }

  const url = process.env.DIRECT_URL;
  const apiKey = process.env.CFBD_API_KEY || '';
  const idleMutation = emptyMutationTelemetry();
  if (!url) {
    writeJson(
      reportPath,
      buildReport({
        plan: null,
        repoCommitSha,
        observedAt,
        mode: args.mode,
        providerCalls: 0,
        endpointsInvoked: [],
        responseRowCounts: { status: 'partial_unavailable' },
        ...idleMutation,
        error: 'DIRECT_URL required',
      })
    );
    process.exit(1);
  }
  if (!apiKey.trim()) {
    writeJson(
      reportPath,
      buildReport({
        plan: null,
        repoCommitSha,
        observedAt,
        mode: args.mode,
        providerCalls: 0,
        endpointsInvoked: [],
        responseRowCounts: { status: 'partial_unavailable' },
        ...idleMutation,
        error: 'CFBD_API_KEY is missing or empty',
      })
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  const fetcher = new SequentialJsonFetcher();
  let plan: UnitGradeSourceIngestPlan | null = null;
  let mutationState = emptyMutationTelemetry();
  try {
    const existing = await loadExisting(prisma, args.season);
    const payloads = await fetchUnitGradeSourcePayloads({
      season: args.season,
      weeks: args.weeks,
      apiKey,
      fetcher,
    });
    const store = createPrismaReadOnlyScheduleStore(prisma);
    const lookup = teamLookupFromStore(store);
    const aliases = loadCfbdTeamAliases();
    const names = collectProviderNamesFromPayloads(payloads);
    const teamResolutions = await resolveAllTeams(names, lookup, aliases);
    plan = planUnitGradeSourceIngest({
      season: args.season,
      weeks: args.weeks,
      mode: args.mode,
      confirmation: args.confirmation,
      memberships: existing.memberships,
      teamResolutions,
      existingGames: existing.games,
      existingEffGames: existing.effGames,
      existingPpaGames: existing.ppaGames,
      existingEffSeasons: existing.seasons,
      gamesByWeek: payloads.gamesByWeek,
      advancedGameByWeek: payloads.advancedGameByWeek,
      ppaGameByWeek: payloads.ppaGameByWeek,
      advancedSeason: payloads.advancedSeason,
      coverageRepoCommitSha: repoCommitSha,
      coverageObservedAt: observedAt,
    });

    if (!plan.writeSafe) {
      writeJson(
        reportPath,
        buildReport({
          plan,
          repoCommitSha,
          observedAt,
          mode: args.mode,
          providerCalls: payloads.providerCalls,
          endpointsInvoked: payloads.endpointsInvoked,
          responseRowCounts: payloads.responseRowCounts,
          ...idleMutation,
        })
      );
      process.exit(1);
    }

    if (args.mode === 'PREVIEW') {
      writeJson(
        reportPath,
        buildReport({
          plan,
          repoCommitSha,
          observedAt,
          mode: args.mode,
          providerCalls: payloads.providerCalls,
          endpointsInvoked: payloads.endpointsInvoked,
          responseRowCounts: payloads.responseRowCounts,
          ...idleMutation,
        })
      );
      process.exit(0);
    }

    mutationState = mutationTelemetryAfterCommitAttempt({
      commitReached: true,
      commitSucceeded: false,
    });
    const { committed } = await commitPlan(prisma, plan, new Date(observedAt));
    mutationState = mutationTelemetryAfterCommitAttempt({
      commitReached: true,
      commitSucceeded: true,
    });
    const postWrite = await postWriteCounts(prisma, args.season);
    writeJson(
      reportPath,
      buildReport({
        plan,
        repoCommitSha,
        observedAt,
        mode: args.mode,
        providerCalls: payloads.providerCalls,
        endpointsInvoked: payloads.endpointsInvoked,
        responseRowCounts: payloads.responseRowCounts,
        ...mutationState,
        committed,
        postWrite,
      })
    );
    process.exit(0);
  } catch (err) {
    if (mutationState.mutationsInvoked && !mutationState.commitSucceeded) {
      mutationState = mutationTelemetryAfterCommitAttempt({
        commitReached: true,
        commitSucceeded: false,
      });
    }
    const tel = snapshotProviderTelemetry(fetcher);
    writeJson(
      reportPath,
      buildReport({
        plan,
        repoCommitSha,
        observedAt,
        mode: args.mode,
        providerCalls: tel.providerCalls,
        endpointsInvoked: tel.endpointsInvoked,
        responseRowCounts: tel.responseRowCounts,
        ...mutationState,
        committed: null,
        error: sanitizeError(err),
      })
    );
    console.error(sanitizeError(err));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void UNIT_GRADE_SOURCE_CONFIRMATION;

if (require.main === module) {
  void main();
}
