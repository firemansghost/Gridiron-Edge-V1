#!/usr/bin/env node
/**
 * Phase 2C-2H-5 — Read-only Balanced V1 historical parity forensic.
 *
 * Usage:
 *   npx tsx apps/jobs/audit-balanced-v1-historical-parity.ts --comparison-season 2025
 *
 * SELECT-only DB. No CFBD. No Odds. No ratings writes.
 * Does not run compute_ratings_balanced.ts (writer).
 *
 * Input SELECTs mirror historical writer loadTeamMetrics semantics.
 */

import { PrismaClient } from '@prisma/client';
import {
  COMPARISON_SEASON,
  buildBalancedV1HistoricalParityAudit,
  formatBalancedV1HistoricalParityReport,
  parseBalancedV1HistoricalParityArgs,
  sanitizeBalancedV1HistoricalParityError,
  type PersistedV1RatingRow,
} from './src/preseason/balanced-v1-historical-parity-audit';
import type {
  BalancedEpaStatRow,
  BalancedGameRow,
  BalancedTalentRow,
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
export interface BalancedV1HistoricalParityReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadPersistedV1Ratings(season: number): Promise<PersistedV1RatingRow[]>;
  loadTalentRows(
    season: number,
    fbsTeamIds: string[]
  ): Promise<BalancedTalentRow[]>;
  loadFinalGames(
    season: number,
    fbsTeamIds: string[]
  ): Promise<BalancedGameRow[]>;
  loadEpaStatRows(
    season: number,
    fbsTeamIds: string[]
  ): Promise<BalancedEpaStatRow[]>;
}

export function createPrismaBalancedV1HistoricalParityReadStore(
  prisma: PrismaClient
): BalancedV1HistoricalParityReadStore {
  return {
    async loadFbsTeamIds(season) {
      // Mirror writer: TeamMembership season + level='fbs'
      const rows = await prisma.teamMembership.findMany({
        where: { season, level: 'fbs' },
        select: { teamId: true },
      });
      return rows.map((r) => r.teamId).sort();
    },
    async loadPersistedV1Ratings(season) {
      const rows = await prisma.teamSeasonRating.findMany({
        where: { season, modelVersion: 'v1' },
        select: {
          teamId: true,
          season: true,
          modelVersion: true,
          powerRating: true,
          confidence: true,
          dataSource: true,
          games: true,
          offenseRating: true,
          defenseRating: true,
        },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        season: r.season,
        modelVersion: r.modelVersion,
        powerRating: decimalToNumber(r.powerRating),
        confidence: decimalToNumber(r.confidence),
        dataSource: r.dataSource,
        games: r.games,
        offenseRating: decimalToNumber(r.offenseRating),
        defenseRating: decimalToNumber(r.defenseRating),
      }));
    },
    async loadTalentRows(season, fbsTeamIds) {
      // Mirror writer: season + teamId in FBS IDs
      const rows = await prisma.teamSeasonTalent.findMany({
        where: {
          season,
          teamId: { in: fbsTeamIds },
        },
        select: { teamId: true, talentComposite: true },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        talentComposite: decimalToNumber(r.talentComposite),
      }));
    },
    async loadFinalGames(season, fbsTeamIds) {
      // Mirror writer: season + status=final + OR FBS participant
      // Do NOT require non-null scores (historical || 0 in aggregation)
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
      return rows.map((r) => ({
        homeTeamId: r.homeTeamId,
        awayTeamId: r.awayTeamId,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
      }));
    },
    async loadEpaStatRows(season, fbsTeamIds) {
      // Mirror writer: season + teamId in FBS + game.status=final
      const rows = await prisma.teamGameStat.findMany({
        where: {
          season,
          teamId: { in: fbsTeamIds },
          game: {
            status: 'final',
          },
        },
        select: {
          teamId: true,
          epaOff: true,
          epaDef: true,
        },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        epaOff: decimalToNumber(r.epaOff),
        epaDef: decimalToNumber(r.epaDef),
      }));
    },
  };
}

export async function runBalancedV1HistoricalParityAudit(options: {
  comparisonSeason: number;
  store: BalancedV1HistoricalParityReadStore;
}): Promise<{ exitCode: number }> {
  if (options.comparisonSeason !== COMPARISON_SEASON) {
    console.error(
      `[balanced-v1-parity] comparisonSeason must be ${COMPARISON_SEASON}`
    );
    return { exitCode: 1 };
  }

  console.log('mode=READ_ONLY');
  console.log(`comparisonSeason=${options.comparisonSeason}`);
  console.log('providersInvoked=false');
  console.log('mutationsInvoked=false');
  console.log('ratingsPersistenceInvoked=false');
  console.log('Odds=false');
  console.log('CFBD_API_KEY=not provided');
  console.log('ODDS_API_KEY=not provided');
  console.log('ratingsWriteAuthorized=false');
  console.log('modelChangeAuthorized=false');
  console.log('writerInvoked=false');
  console.log('compute_ratings_balanced=not run');

  try {
    const fbsIds = await options.store.loadFbsTeamIds(COMPARISON_SEASON);
    const fbsIdsLower = fbsIds.map((id) => id.toLowerCase());
    const persistedV1Rows = await options.store.loadPersistedV1Ratings(
      COMPARISON_SEASON
    );
    const talentRows = await options.store.loadTalentRows(
      COMPARISON_SEASON,
      fbsIdsLower
    );
    const finalGames = await options.store.loadFinalGames(
      COMPARISON_SEASON,
      fbsIdsLower
    );
    const epaStatRows = await options.store.loadEpaStatRows(
      COMPARISON_SEASON,
      fbsIdsLower
    );

    const result = buildBalancedV1HistoricalParityAudit({
      comparisonSeason: COMPARISON_SEASON,
      fbsIds,
      persistedV1Rows,
      talentRows,
      finalGames,
      epaStatRows,
    });

    console.log(formatBalancedV1HistoricalParityReport(result));
    if (!result.ok) {
      console.error(
        '[balanced-v1-parity] FAILED — structural gates not met; parity not presented as valid'
      );
      return { exitCode: 1 };
    }
    console.log(
      '[balanced-v1-parity] COMPLETE — read-only forensic finished; no writes; modelChangeAuthorized=false'
    );
    console.log(
      `[balanced-v1-parity] balancedHistoricalParity=${result.balancedHistoricalParity} balancedCurrentFormulaReproducesPersisted2025=${result.balancedCurrentFormulaReproducesPersisted2025}`
    );
    return { exitCode: 0 };
  } catch (err) {
    console.error(
      `[balanced-v1-parity] ${sanitizeBalancedV1HistoricalParityError(err)}`
    );
    return { exitCode: 1 };
  }
}

async function main(): Promise<void> {
  const parsed = parseBalancedV1HistoricalParityArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) console.error(`[balanced-v1-parity] ${e}`);
    console.error(
      'Usage: npx tsx apps/jobs/audit-balanced-v1-historical-parity.ts --comparison-season 2025'
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const { exitCode } = await runBalancedV1HistoricalParityAudit({
      comparisonSeason: parsed.comparisonSeason,
      store: createPrismaBalancedV1HistoricalParityReadStore(prisma),
    });
    process.exit(exitCode);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[balanced-v1-parity] ${sanitizeBalancedV1HistoricalParityError(err)}`
    );
    process.exit(1);
  });
}
