#!/usr/bin/env node
/**
 * Phase 2C-2H-8 — Read-only Balanced V1 transition blend evaluation.
 *
 * Usage:
 *   npx tsx apps/jobs/evaluate-balanced-v1-transition-blends.ts --study-season 2025
 *
 * SELECT-only. No CFBD. No Odds. No ratings writes.
 * Does not authorize blend/transition/bridge/persistence.
 */

import { PrismaClient } from '@prisma/client';
import {
  CONFIRM_SEASON_2026,
  HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
  STUDY_SEASON_2025,
  buildBalancedV1TransitionBlendEvaluation,
  formatBalancedV1TransitionBlendReport,
  parseBalancedV1TransitionBlendArgs,
  sanitizeBalancedV1TransitionBlendError,
} from './src/preseason/balanced-v1-transition-blend-eval';

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
export interface BalancedV1TransitionBlendReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadTalentRows(
    season: number,
    fbsTeamIds: string[]
  ): Promise<Array<{ teamId: string; talentComposite: number | null }>>;
  loadPersistedV1Targets(
    season: number
  ): Promise<Array<{ teamId: string; powerRating: number | null }>>;
  loadFinalGames(season: number): Promise<
    Array<{
      gameId: string;
      week: number;
      date: Date;
      status: string;
      homeTeamId: string;
      awayTeamId: string;
      homeScore: number | null;
      awayScore: number | null;
    }>
  >;
  loadEpaRows(season: number, fbsTeamIds: string[]): Promise<
    Array<{
      gameId: string;
      week: number;
      teamId: string;
      epaOff: number | null;
      epaDef: number | null;
    }>
  >;
  countExistingV1FbsRows(season: number, fbsTeamIds: string[]): Promise<number>;
}

export function createPrismaBalancedV1TransitionBlendReadStore(
  prisma: PrismaClient
): BalancedV1TransitionBlendReadStore {
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
    async loadFinalGames(season) {
      const rows = await prisma.game.findMany({
        where: {
          season,
          status: 'final',
        },
        select: {
          id: true,
          week: true,
          date: true,
          status: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
        },
      });
      return rows.map((r) => ({
        gameId: r.id,
        week: r.week,
        date: r.date,
        status: String(r.status),
        homeTeamId: r.homeTeamId,
        awayTeamId: r.awayTeamId,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
      }));
    },
    async loadEpaRows(season, fbsTeamIds) {
      const rows = await prisma.teamGameStat.findMany({
        where: {
          season,
          teamId: { in: fbsTeamIds },
          game: { status: 'final' },
        },
        select: {
          gameId: true,
          week: true,
          teamId: true,
          epaOff: true,
          epaDef: true,
        },
      });
      return rows.map((r) => ({
        gameId: r.gameId,
        week: r.week,
        teamId: r.teamId,
        epaOff: decimalToNumber(r.epaOff),
        epaDef: decimalToNumber(r.epaDef),
      }));
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

export async function runBalancedV1TransitionBlendEvaluation(options: {
  studySeason: number;
  store: BalancedV1TransitionBlendReadStore;
}): Promise<{ exitCode: number }> {
  if (options.studySeason !== STUDY_SEASON_2025) {
    console.error(
      `[balanced-blend] studySeason must be ${STUDY_SEASON_2025}`
    );
    return { exitCode: 1 };
  }

  console.log('mode=READ_ONLY');
  console.log(`studySeason=${options.studySeason}`);
  console.log('providersInvoked=false');
  console.log('mutationsInvoked=false');
  console.log('ratingsPersistenceInvoked=false');
  console.log('Odds=false');
  console.log('CFBD_API_KEY=not provided');
  console.log('ODDS_API_KEY=not provided');
  console.log('transitionPolicyAuthorized=false');
  console.log('preseasonBridgeAuthorized=false');
  console.log('ratingsWriteAuthorized=false');
  console.log('modelChangeAuthorized=false');
  console.log('mixedPolicyAuthorized=false');
  console.log('compute_ratings_balanced=not run');
  console.log('compute_ratings_v1=not run');

  try {
    const fbsIds2025 = await options.store.loadFbsTeamIds(STUDY_SEASON_2025);
    const fbsLower2025 = fbsIds2025.map((id) => id.toLowerCase());
    const talent2025 = await options.store.loadTalentRows(
      STUDY_SEASON_2025,
      fbsLower2025
    );
    const persistedRaw = await options.store.loadPersistedV1Targets(
      STUDY_SEASON_2025
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

    const gamesRaw = await options.store.loadFinalGames(STUDY_SEASON_2025);
    const games2025 = gamesRaw.map((g) => ({
      gameId: g.gameId,
      week: g.week,
      date: g.date.toISOString(),
      status: g.status,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
    }));
    const epa2025 = await options.store.loadEpaRows(
      STUDY_SEASON_2025,
      fbsLower2025
    );

    const fbsIds2026 = await options.store.loadFbsTeamIds(CONFIRM_SEASON_2026);
    const fbsLower2026 = fbsIds2026.map((id) => id.toLowerCase());
    const talent2026 = await options.store.loadTalentRows(
      CONFIRM_SEASON_2026,
      fbsLower2026
    );
    const games2026 = await options.store.loadFinalGames(CONFIRM_SEASON_2026);
    let finalFbsVsFbsGames2026 = 0;
    for (const g of games2026) {
      if (
        fbsLower2026.includes(g.homeTeamId.toLowerCase()) &&
        fbsLower2026.includes(g.awayTeamId.toLowerCase())
      ) {
        finalFbsVsFbsGames2026++;
      }
    }
    const existingV1FbsRows2026 = await options.store.countExistingV1FbsRows(
      CONFIRM_SEASON_2026,
      fbsLower2026
    );

    const result = buildBalancedV1TransitionBlendEvaluation({
      fbsIds2025,
      talent2025,
      games2025,
      epa2025,
      persistedV1Targets2025,
      historicalCutoffIso: HISTORICAL_BALANCED_SNAPSHOT_CUTOFF_ISO,
      fbsIds2026,
      talent2026,
      finalFbsVsFbsGames2026,
      existingV1FbsRows2026,
    });

    console.log(formatBalancedV1TransitionBlendReport(result));
    if (!result.ok) {
      console.error(
        '[balanced-blend] FAILED — structural gates not met'
      );
      return { exitCode: 1 };
    }
    console.log(
      '[balanced-blend] COMPLETE — diagnostic only; transitionPolicyAuthorized=false; blendPolicyCandidate=INCONCLUSIVE; no writes'
    );
    return { exitCode: 0 };
  } catch (err) {
    console.error(
      `[balanced-blend] ${sanitizeBalancedV1TransitionBlendError(err)}`
    );
    return { exitCode: 1 };
  }
}

async function main(): Promise<void> {
  const parsed = parseBalancedV1TransitionBlendArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[balanced-blend] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/evaluate-balanced-v1-transition-blends.ts --study-season 2025'
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const { exitCode } = await runBalancedV1TransitionBlendEvaluation({
      studySeason: parsed.studySeason,
      store: createPrismaBalancedV1TransitionBlendReadStore(prisma),
    });
    process.exit(exitCode);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[balanced-blend] ${sanitizeBalancedV1TransitionBlendError(err)}`
    );
    process.exit(1);
  });
}
