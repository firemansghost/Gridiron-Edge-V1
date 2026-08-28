#!/usr/bin/env node
/**
 * Phase 2C-2I-1 — Hybrid V2 preseason readiness audit CLI (SELECT-only).
 *
 * Usage:
 *   npx tsx apps/jobs/audit-hybrid-v2-preseason-readiness.ts --season 2026 --week 1
 *
 * No providers. No Odds. No writes. Does not run compute_unit_grades.
 * Current week comes from production getCurrentSeasonWeek(prisma).
 */

import { PrismaClient } from '@prisma/client';
import { getCurrentSeasonWeek } from '../web/lib/current-week';
import {
  PRIOR_GRADE_SEASON,
  TARGET_SEASON,
  TARGET_WEEK,
  buildHybridPreseasonReadinessEvaluation,
  formatHybridPreseasonReadinessReport,
  parseHybridPreseasonReadinessArgs,
  sanitizeHybridPreseasonReadinessError,
  type CfbdSourceCounts,
  type HybridPreseasonGameRow,
  type SameSeasonTeamSourceSignals,
  type UnitGradeRow,
  type V1RatingRow,
} from './src/preseason/hybrid-v2-preseason-readiness';

export interface HybridPreseasonReadStore {
  loadCurrentSeasonWeek(): Promise<{ season: number; week: number }>;
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadGames(season: number): Promise<HybridPreseasonGameRow[]>;
  loadV1Ratings(season: number): Promise<V1RatingRow[]>;
  loadUnitGrades(season: number, teamIds: string[]): Promise<UnitGradeRow[]>;
  countUnitGrades(season: number): Promise<number>;
  loadCfbdSourceCounts(season: number): Promise<CfbdSourceCounts>;
  loadSameSeasonTeamSources(
    season: number,
    fbsIds: string[]
  ): Promise<SameSeasonTeamSourceSignals[]>;
}

function emptySignals(teamId: string): SameSeasonTeamSourceSignals {
  return {
    teamId,
    hasLineYardsOff: false,
    hasRunEpa: false,
    hasPpaOffense: false,
    hasStuffRate: false,
    hasPpaDefense: false,
    hasPassEpa: false,
    hasPassSr: false,
    hasDefSr: false,
    hasIsoPppOff: false,
    hasIsoPppDef: false,
    hasHavocOff: false,
    hasHavocDef: false,
  };
}

function isFiniteNum(v: unknown): boolean {
  if (v == null) return false;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n);
}

function createPrismaStore(prisma: PrismaClient): HybridPreseasonReadStore {
  return {
    async loadCurrentSeasonWeek() {
      return getCurrentSeasonWeek(prisma);
    },
    async loadFbsTeamIds(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season, level: 'fbs' },
        select: { teamId: true },
        orderBy: { teamId: 'asc' },
      });
      return rows.map((r) => r.teamId);
    },
    async loadGames(season) {
      const rows = await prisma.game.findMany({
        where: { season },
        select: {
          id: true,
          season: true,
          week: true,
          date: true,
          status: true,
          homeTeamId: true,
          awayTeamId: true,
          neutralSite: true,
        },
        orderBy: [{ week: 'asc' }, { date: 'asc' }, { id: 'asc' }],
      });
      return rows.map((r) => ({
        gameId: r.id,
        season: r.season,
        week: r.week,
        date: r.date.toISOString(),
        status: String(r.status),
        homeTeamId: r.homeTeamId,
        awayTeamId: r.awayTeamId,
        neutralSite: Boolean(r.neutralSite),
      }));
    },
    async loadV1Ratings(season) {
      const rows = await prisma.teamSeasonRating.findMany({
        where: { season, modelVersion: 'v1' },
        select: {
          teamId: true,
          powerRating: true,
          rating: true,
        },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        powerRating:
          r.powerRating == null ? null : Number(r.powerRating),
        rating: r.rating == null ? null : Number(r.rating),
      }));
    },
    async loadUnitGrades(season, teamIds) {
      const rows = await prisma.teamUnitGrades.findMany({
        where: {
          season,
          teamId: { in: teamIds },
        },
        select: {
          teamId: true,
          season: true,
          offRunGrade: true,
          defRunGrade: true,
          offPassGrade: true,
          defPassGrade: true,
          offExplosiveness: true,
          defExplosiveness: true,
          havocGrade: true,
        },
      });
      return rows.map((r) => ({
        teamId: r.teamId,
        season: r.season,
        offRunGrade: Number(r.offRunGrade),
        defRunGrade: Number(r.defRunGrade),
        offPassGrade: Number(r.offPassGrade),
        defPassGrade: Number(r.defPassGrade),
        offExplosiveness: Number(r.offExplosiveness),
        defExplosiveness: Number(r.defExplosiveness),
        havocGrade: Number(r.havocGrade),
      }));
    },
    async countUnitGrades(season) {
      return prisma.teamUnitGrades.count({ where: { season } });
    },
    async loadCfbdSourceCounts(season) {
      const cfbdGames = await prisma.cfbdGame.count({ where: { season } });
      const seasonGameIds = (
        await prisma.cfbdGame.findMany({
          where: { season },
          select: { gameIdCfbd: true },
        })
      ).map((g) => g.gameIdCfbd);

      const [cfbdEffTeamGame, cfbdPpaTeamGame, cfbdEffTeamSeason, cfbdPriorsTeamSeason] =
        await Promise.all([
          seasonGameIds.length === 0
            ? Promise.resolve(0)
            : prisma.cfbdEffTeamGame.count({
                where: { gameIdCfbd: { in: seasonGameIds } },
              }),
          seasonGameIds.length === 0
            ? Promise.resolve(0)
            : prisma.cfbdPpaTeamGame.count({
                where: { gameIdCfbd: { in: seasonGameIds } },
              }),
          prisma.cfbdEffTeamSeason.count({ where: { season } }),
          prisma.cfbdPriorsTeamSeason.count({ where: { season } }),
        ]);
      return {
        cfbdGames,
        cfbdEffTeamGame,
        cfbdPpaTeamGame,
        cfbdEffTeamSeason,
        cfbdPriorsTeamSeason,
      };
    },
    async loadSameSeasonTeamSources(season, fbsIds) {
      const fbsLower = fbsIds.map((id) => id.toLowerCase());
      const fbsSet = new Set(fbsLower);
      const byTeam = new Map<string, SameSeasonTeamSourceSignals>();
      for (const id of fbsLower) byTeam.set(id, emptySignals(id));

      const seasonGames = await prisma.cfbdGame.findMany({
        where: { season },
        select: { gameIdCfbd: true },
      });
      const gameIds = seasonGames.map((g) => g.gameIdCfbd);

      if (gameIds.length > 0) {
        const [effRows, ppaRows] = await Promise.all([
          prisma.cfbdEffTeamGame.findMany({
            where: { gameIdCfbd: { in: gameIds } },
            select: {
              teamIdInternal: true,
              lineYardsOff: true,
              runEpa: true,
              passEpa: true,
              passSr: true,
              defSr: true,
              isoPppOff: true,
              isoPppDef: true,
            },
          }),
          prisma.cfbdPpaTeamGame.findMany({
            where: { gameIdCfbd: { in: gameIds } },
            select: {
              teamIdInternal: true,
              ppaOffense: true,
              ppaDefense: true,
            },
          }),
        ]);

        for (const row of effRows) {
          const id = row.teamIdInternal.toLowerCase();
          if (!fbsSet.has(id)) continue;
          const s = byTeam.get(id)!;
          if (isFiniteNum(row.lineYardsOff)) s.hasLineYardsOff = true;
          if (isFiniteNum(row.runEpa)) s.hasRunEpa = true;
          if (isFiniteNum(row.passEpa)) s.hasPassEpa = true;
          if (isFiniteNum(row.passSr)) s.hasPassSr = true;
          if (isFiniteNum(row.defSr)) s.hasDefSr = true;
          if (isFiniteNum(row.isoPppOff)) s.hasIsoPppOff = true;
          if (isFiniteNum(row.isoPppDef)) s.hasIsoPppDef = true;
        }

        for (const row of ppaRows) {
          const id = row.teamIdInternal.toLowerCase();
          if (!fbsSet.has(id)) continue;
          const s = byTeam.get(id)!;
          if (isFiniteNum(row.ppaOffense)) s.hasPpaOffense = true;
          if (isFiniteNum(row.ppaDefense)) s.hasPpaDefense = true;
        }
      }

      const seasonStats = await prisma.cfbdEffTeamSeason.findMany({
        where: { season },
        select: {
          teamIdInternal: true,
          stuffRate: true,
          havocOff: true,
          havocDef: true,
        },
      });
      for (const row of seasonStats) {
        const id = row.teamIdInternal.toLowerCase();
        if (!fbsSet.has(id)) continue;
        const s = byTeam.get(id)!;
        if (isFiniteNum(row.stuffRate)) s.hasStuffRate = true;
        if (isFiniteNum(row.havocOff)) s.hasHavocOff = true;
        if (isFiniteNum(row.havocDef)) s.hasHavocDef = true;
      }

      return [...byTeam.values()].sort((a, b) =>
        a.teamId.localeCompare(b.teamId)
      );
    },
  };
}

export async function runHybridPreseasonReadinessAudit(
  store: HybridPreseasonReadStore,
  args: { season: number; week: number }
) {
  const current = await store.loadCurrentSeasonWeek();
  const fbsIds = await store.loadFbsTeamIds(args.season);
  const games = await store.loadGames(args.season);
  const v1Ratings2026 = await store.loadV1Ratings(args.season);
  const unitGrades2026 = await store.loadUnitGrades(args.season, fbsIds);
  const unitGradesPrior = await store.loadUnitGrades(
    PRIOR_GRADE_SEASON,
    fbsIds
  );
  const [
    cfbdSourceCounts2026,
    unitGradeRows2024,
    cfbdSourceCounts2024,
    sameSeasonTeamSources,
  ] = await Promise.all([
    store.loadCfbdSourceCounts(args.season),
    store.countUnitGrades(2024),
    store.loadCfbdSourceCounts(2024),
    store.loadSameSeasonTeamSources(args.season, fbsIds),
  ]);

  return buildHybridPreseasonReadinessEvaluation({
    season: args.season,
    week: args.week,
    detectedSeason: current.season,
    detectedWeek: current.week,
    fbsIds,
    games,
    v1Ratings2026,
    unitGrades2026,
    unitGradesPrior,
    cfbdSourceCounts2026,
    sameSeasonTeamSources,
    unitGradeRows2024,
    cfbdSourceCounts2024,
  });
}

async function main() {
  const parsed = parseHybridPreseasonReadinessArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const store = createPrismaStore(prisma);
    const result = await runHybridPreseasonReadinessAudit(store, {
      season: parsed.season,
      week: parsed.week,
    });
    console.log(formatHybridPreseasonReadinessReport(result));
    process.exit(result.auditOk ? 0 : 1);
  } catch (err) {
    console.error(sanitizeHybridPreseasonReadinessError(err));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}

void TARGET_SEASON;
void TARGET_WEEK;
