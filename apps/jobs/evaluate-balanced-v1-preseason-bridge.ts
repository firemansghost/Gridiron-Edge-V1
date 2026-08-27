#!/usr/bin/env node
/**
 * Phase 2C-2H-6 — Read-only Balanced V1 preseason bridge evaluation.
 *
 * Usage:
 *   npx tsx apps/jobs/evaluate-balanced-v1-preseason-bridge.ts --season 2026
 *
 * SELECT-only. No CFBD. No Odds. No ratings writes.
 * Does not run compute_ratings_balanced.ts or compute_ratings_v1.ts.
 * Does not authorize a preseason bridge policy.
 */

import { PrismaClient } from '@prisma/client';
import {
  BENCHMARK_SEASON,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  TARGET_SEASON,
  buildBalancedV1PreseasonBridgeEvaluation,
  formatBalancedV1PreseasonBridgeReport,
  parseBalancedV1PreseasonBridgeArgs,
  sanitizeBalancedV1PreseasonBridgeError,
} from './src/preseason/balanced-v1-preseason-bridge-eval';
import {
  aggregateBalancedEpa,
  aggregateBalancedGameStats,
} from './src/ratings/compute_balanced_v1';

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    const n = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Read-only store — SELECT only; no mutation methods. */
export interface BalancedV1PreseasonBridgeReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadTalentRows(
    season: number,
    fbsTeamIds: string[]
  ): Promise<Array<{ teamId: string; talentComposite: number | null }>>;
  loadPersistedV1Targets(
    season: number
  ): Promise<Array<{ teamId: string; powerRating: number | null }>>;
  countFinalFbsVsFbsGames(season: number, fbsTeamIds: string[]): Promise<number>;
  countUsableEpaTeams(season: number, fbsTeamIds: string[]): Promise<number>;
  countTeamsWithNetPointsOrWins(
    season: number,
    fbsTeamIds: string[]
  ): Promise<{ netPointsTeams: number; winPctTeams: number }>;
  countExistingV1FbsRows(season: number, fbsTeamIds: string[]): Promise<number>;
}

export function createPrismaBalancedV1PreseasonBridgeReadStore(
  prisma: PrismaClient
): BalancedV1PreseasonBridgeReadStore {
  return {
    async loadFbsTeamIds(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season, level: 'fbs' },
        select: { teamId: true },
      });
      return rows.map((r) => r.teamId).sort();
    },
    async loadTalentRows(season, fbsTeamIds) {
      const rows = await prisma.teamSeasonTalent.findMany({
        where: { season, teamId: { in: fbsTeamIds } },
        select: { teamId: true, talentComposite: true },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        talentComposite: decimalToNumber(r.talentComposite),
      }));
    },
    async loadPersistedV1Targets(season) {
      const rows = await prisma.teamSeasonRating.findMany({
        where: { season, modelVersion: 'v1' },
        select: { teamId: true, powerRating: true },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        powerRating: decimalToNumber(r.powerRating),
      }));
    },
    async countFinalFbsVsFbsGames(season, fbsTeamIds) {
      const fbs = new Set(fbsTeamIds.map((id) => id.toLowerCase()));
      const rows = await prisma.game.findMany({
        where: {
          season,
          status: 'final',
          OR: [
            { homeTeamId: { in: fbsTeamIds } },
            { awayTeamId: { in: fbsTeamIds } },
          ],
        },
        select: {
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
        },
      });
      // Count FBS-vs-FBS only (same filter as Balanced aggregation)
      let count = 0;
      for (const g of rows) {
        if (
          fbs.has(g.homeTeamId.toLowerCase()) &&
          fbs.has(g.awayTeamId.toLowerCase())
        ) {
          count++;
        }
      }
      return count;
    },
    async countUsableEpaTeams(season, fbsTeamIds) {
      const rows = await prisma.teamGameStat.findMany({
        where: {
          season,
          teamId: { in: fbsTeamIds },
          game: { status: 'final' },
        },
        select: { teamId: true, epaOff: true, epaDef: true },
      });
      const epaByTeam = aggregateBalancedEpa(rows);
      let usable = 0;
      for (const id of fbsTeamIds) {
        const epa = epaByTeam.get(id.toLowerCase());
        if (epa && (epa.epaOff.length > 0 || epa.epaDef.length > 0)) usable++;
      }
      return usable;
    },
    async countTeamsWithNetPointsOrWins(season, fbsTeamIds) {
      const fbs = new Set(fbsTeamIds.map((id) => id.toLowerCase()));
      const rows = await prisma.game.findMany({
        where: {
          season,
          status: 'final',
          OR: [
            { homeTeamId: { in: fbsTeamIds } },
            { awayTeamId: { in: fbsTeamIds } },
          ],
        },
        select: {
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
        },
      });
      const agg = aggregateBalancedGameStats(rows, fbs);
      let netPointsTeams = 0;
      let winPctTeams = 0;
      for (const [, s] of agg) {
        if (s.games > 0) {
          netPointsTeams++;
          winPctTeams++;
        }
      }
      return { netPointsTeams, winPctTeams };
    },
    async countExistingV1FbsRows(season, fbsTeamIds) {
      const fbs = new Set(fbsTeamIds.map((id) => id.toLowerCase()));
      const rows = await prisma.teamSeasonRating.findMany({
        where: { season, modelVersion: 'v1' },
        select: { teamId: true },
      });
      return rows.filter((r) => fbs.has(r.teamId.toLowerCase())).length;
    },
  };
}

export async function runBalancedV1PreseasonBridgeEvaluation(options: {
  season: number;
  store: BalancedV1PreseasonBridgeReadStore;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(
      `[balanced-preseason-bridge] season must be ${TARGET_SEASON}`
    );
    return { exitCode: 1 };
  }

  console.log('mode=READ_ONLY');
  console.log(`season=${options.season}`);
  console.log('providersInvoked=false');
  console.log('mutationsInvoked=false');
  console.log('ratingsPersistenceInvoked=false');
  console.log('Odds=false');
  console.log('CFBD_API_KEY=not provided');
  console.log('ODDS_API_KEY=not provided');
  console.log('preseasonBridgeAuthorized=false');
  console.log('ratingsWriteAuthorized=false');
  console.log('modelChangeAuthorized=false');
  console.log('transitionPolicyDefined=false');
  console.log('purePreseasonState=required-zero-coverage');
  console.log('writerInvoked=false');
  console.log('compute_ratings_balanced=not run');
  console.log('compute_ratings_v1=not run');

  try {
    const fbsIds2026 = await options.store.loadFbsTeamIds(TARGET_SEASON);
    const fbsLower2026 = fbsIds2026.map((id) => id.toLowerCase());
    const talent2026 = await options.store.loadTalentRows(
      TARGET_SEASON,
      fbsLower2026
    );
    const finalFbsVsFbsGames2026 = await options.store.countFinalFbsVsFbsGames(
      TARGET_SEASON,
      fbsLower2026
    );
    const usableEpaTeams2026 = await options.store.countUsableEpaTeams(
      TARGET_SEASON,
      fbsLower2026
    );
    const { netPointsTeams, winPctTeams } =
      await options.store.countTeamsWithNetPointsOrWins(
        TARGET_SEASON,
        fbsLower2026
      );
    const existingV1FbsRows2026 = await options.store.countExistingV1FbsRows(
      TARGET_SEASON,
      fbsLower2026
    );

    const fbsIds2025 = await options.store.loadFbsTeamIds(BENCHMARK_SEASON);
    const fbsLower2025 = fbsIds2025.map((id) => id.toLowerCase());
    const talent2025 = await options.store.loadTalentRows(
      BENCHMARK_SEASON,
      fbsLower2025
    );
    const persistedRaw = await options.store.loadPersistedV1Targets(
      BENCHMARK_SEASON
    );
    const fbs25Set = new Set(fbsLower2025);
    const persistedV1Targets2025 = persistedRaw
      .filter(
        (r) =>
          fbs25Set.has(r.teamId.toLowerCase()) &&
          r.powerRating !== null &&
          Number.isFinite(r.powerRating)
      )
      .map((r) => ({
        teamId: r.teamId,
        powerRating: r.powerRating as number,
      }));

    const result = buildBalancedV1PreseasonBridgeEvaluation({
      season: TARGET_SEASON,
      fbsIds2026,
      talent2026,
      finalFbsVsFbsGames2026,
      usableEpaTeams2026,
      netPointsTeams2026: netPointsTeams,
      winPctTeams2026: winPctTeams,
      existingV1FbsRows2026,
      fbsIds2025,
      talent2025,
      persistedV1Targets2025,
      historicalCutoffIso: HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
    });

    console.log(formatBalancedV1PreseasonBridgeReport(result));
    if (!result.ok) {
      console.error(
        '[balanced-preseason-bridge] FAILED — structural gates not met'
      );
      return { exitCode: 1 };
    }
    console.log(
      '[balanced-preseason-bridge] COMPLETE — diagnostic only; no policy authorized; no writes'
    );
    return { exitCode: 0 };
  } catch (err) {
    console.error(
      `[balanced-preseason-bridge] ${sanitizeBalancedV1PreseasonBridgeError(err)}`
    );
    return { exitCode: 1 };
  }
}

async function main(): Promise<void> {
  const parsed = parseBalancedV1PreseasonBridgeArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[balanced-preseason-bridge] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/evaluate-balanced-v1-preseason-bridge.ts --season 2026'
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const { exitCode } = await runBalancedV1PreseasonBridgeEvaluation({
      season: parsed.season,
      store: createPrismaBalancedV1PreseasonBridgeReadStore(prisma),
    });
    process.exit(exitCode);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[balanced-preseason-bridge] ${sanitizeBalancedV1PreseasonBridgeError(err)}`
    );
    process.exit(1);
  });
}
