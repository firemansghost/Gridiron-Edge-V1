#!/usr/bin/env node
/**
 * Current-season 2026 unit-grade SOURCE readiness CLI (SELECT-only).
 *
 * Usage:
 *   npx tsx apps/jobs/audit-2026-unit-grade-source-readiness.ts --season 2026 --report reports/out.json
 *
 * SELECT-only. No providers. No CFBD. No Odds. No writes.
 * Does not run compute_unit_grades.ts.
 * Does not ingest CFBD features.
 * Does not write TeamUnitGrades or cfbd_* rows.
 * Does not run Shadow PREVIEW/COMMIT.
 * Does not run Prisma migrate.
 *
 * Prisma is constructed with DIRECT_URL only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  TARGET_SEASON,
  buildUnitGradeSourceReadinessReport,
  formatUnitGradeSourceReadinessReport,
  parseUnitGradeSourceReadinessArgs,
  sanitizeUnitGradeSourceReadinessError,
  type CfbdGameRow,
  type EffTeamGameRow,
  type EffTeamSeasonRow,
  type PpaTeamGameRow,
  type UnitGradeInventoryRow,
  type UnitGradeSourceReadinessInput,
} from './src/v2/unit-grade-source-readiness';

export interface UnitGradeSourceReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadTeamUnitGrades(season: number): Promise<UnitGradeInventoryRow[]>;
  loadCfbdGames(season: number): Promise<CfbdGameRow[]>;
  loadEffTeamGames(gameIds: string[]): Promise<EffTeamGameRow[]>;
  loadPpaTeamGames(gameIds: string[]): Promise<PpaTeamGameRow[]>;
  loadEffTeamSeasons(season: number): Promise<EffTeamSeasonRow[]>;
  countPriorsTeamSeason(season: number): Promise<number>;
}

function prismaNumeric(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    try {
      return (value as { toNumber: () => number }).toNumber();
    } catch {
      return Number.NaN;
    }
  }
  return value;
}

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

export function createPrismaStore(prisma: PrismaClient): UnitGradeSourceReadStore {
  return {
    async loadFbsTeamIds(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season, level: 'fbs' },
        select: { teamId: true },
        orderBy: { teamId: 'asc' },
      });
      return rows.map((r) => r.teamId);
    },
    async loadTeamUnitGrades(season) {
      const rows = await prisma.teamUnitGrades.findMany({
        where: { season },
        select: { teamId: true },
        orderBy: { teamId: 'asc' },
      });
      return rows.map((r) => ({ teamId: r.teamId }));
    },
    async loadCfbdGames(season) {
      const rows = await prisma.cfbdGame.findMany({
        where: { season },
        select: {
          gameIdCfbd: true,
          homeTeamIdInternal: true,
          awayTeamIdInternal: true,
        },
        orderBy: { gameIdCfbd: 'asc' },
      });
      return rows.map((r) => ({
        gameIdCfbd: r.gameIdCfbd,
        homeTeamIdInternal: r.homeTeamIdInternal,
        awayTeamIdInternal: r.awayTeamIdInternal,
      }));
    },
    async loadEffTeamGames(gameIds) {
      if (gameIds.length === 0) return [];
      const rows = await prisma.cfbdEffTeamGame.findMany({
        where: { gameIdCfbd: { in: gameIds } },
        select: {
          gameIdCfbd: true,
          teamIdInternal: true,
          lineYardsOff: true,
          runEpa: true,
          passEpa: true,
          passSr: true,
          defSr: true,
          isoPppOff: true,
          isoPppDef: true,
        },
        orderBy: [{ gameIdCfbd: 'asc' }, { teamIdInternal: 'asc' }],
      });
      return rows.map((r) => ({
        gameIdCfbd: r.gameIdCfbd,
        teamIdInternal: r.teamIdInternal,
        lineYardsOff: prismaNumeric(r.lineYardsOff),
        runEpa: prismaNumeric(r.runEpa),
        passEpa: prismaNumeric(r.passEpa),
        passSr: prismaNumeric(r.passSr),
        defSr: prismaNumeric(r.defSr),
        isoPppOff: prismaNumeric(r.isoPppOff),
        isoPppDef: prismaNumeric(r.isoPppDef),
      }));
    },
    async loadPpaTeamGames(gameIds) {
      if (gameIds.length === 0) return [];
      const rows = await prisma.cfbdPpaTeamGame.findMany({
        where: { gameIdCfbd: { in: gameIds } },
        select: {
          gameIdCfbd: true,
          teamIdInternal: true,
          ppaOffense: true,
          ppaDefense: true,
        },
        orderBy: [{ gameIdCfbd: 'asc' }, { teamIdInternal: 'asc' }],
      });
      return rows.map((r) => ({
        gameIdCfbd: r.gameIdCfbd,
        teamIdInternal: r.teamIdInternal,
        ppaOffense: prismaNumeric(r.ppaOffense),
        ppaDefense: prismaNumeric(r.ppaDefense),
      }));
    },
    async loadEffTeamSeasons(season) {
      const rows = await prisma.cfbdEffTeamSeason.findMany({
        where: { season },
        select: {
          teamIdInternal: true,
          stuffRate: true,
          havocOff: true,
          havocDef: true,
        },
        orderBy: { teamIdInternal: 'asc' },
      });
      return rows.map((r) => ({
        teamIdInternal: r.teamIdInternal,
        stuffRate: prismaNumeric(r.stuffRate),
        havocOff: prismaNumeric(r.havocOff),
        havocDef: prismaNumeric(r.havocDef),
      }));
    },
    async countPriorsTeamSeason(season) {
      return prisma.cfbdPriorsTeamSeason.count({ where: { season } });
    },
  };
}

export async function runUnitGradeSourceReadinessAudit(
  store: UnitGradeSourceReadStore,
  args: { season: number; repoCommitSha: string; observedAt: string }
) {
  const fbsTeamIds = await store.loadFbsTeamIds(args.season);
  const teamUnitGrades = await store.loadTeamUnitGrades(args.season);
  const cfbdGames = await store.loadCfbdGames(args.season);
  const gameIds = cfbdGames.map((g) => g.gameIdCfbd);
  const [effTeamGames, ppaTeamGames, effTeamSeasons, priorsTeamSeasonCount] =
    await Promise.all([
      store.loadEffTeamGames(gameIds),
      store.loadPpaTeamGames(gameIds),
      store.loadEffTeamSeasons(args.season),
      store.countPriorsTeamSeason(args.season),
    ]);

  const input: UnitGradeSourceReadinessInput = {
    season: args.season,
    repoCommitSha: args.repoCommitSha,
    observedAt: args.observedAt,
    fbsTeamIds,
    cfbdGames,
    effTeamGames,
    ppaTeamGames,
    effTeamSeasons,
    teamUnitGrades,
    priorsTeamSeasonCount,
  };
  return buildUnitGradeSourceReadinessReport(input);
}

function defaultReportPath(): string {
  return path.join(
    process.cwd(),
    'reports',
    'unit-grade-source-readiness-2026.json'
  );
}

async function main() {
  const parsed = parseUnitGradeSourceReadinessArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    process.exit(1);
  }

  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL required');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const store = createPrismaStore(prisma);
    const report = await runUnitGradeSourceReadinessAudit(store, {
      season: parsed.season,
      repoCommitSha: readRepoCommitSha(),
      observedAt: new Date().toISOString(),
    });
    const text = formatUnitGradeSourceReadinessReport(report);
    console.log(text);

    const reportPath = parsed.reportPath || defaultReportPath();
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${text}\n`, 'utf8');

    process.exit(report.auditOk ? 0 : 1);
  } catch (err) {
    console.error(sanitizeUnitGradeSourceReadinessError(err));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void TARGET_SEASON;

if (require.main === module) {
  void main();
}
