#!/usr/bin/env node
/**
 * 2026 prospective V4 comparator source-readiness audit.
 *
 * SELECT-only. No providers. No model computation. No writes.
 *
 * Usage:
 *   npx tsx apps/jobs/audit-v4-comparator-source-readiness-2026.ts \
 *     --season 2026 \
 *     --comparison-season 2025 \
 *     --report reports/v4-comparator-source-readiness-2026.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import {
  buildV4ComparatorSourceReadinessReport,
  parseV4ComparatorSourceReadinessArgs,
  sanitizeV4ComparatorReadinessError,
  type V4ReadinessTeamGameRow,
  type V4ReadinessTeamSeasonRow,
} from './src/research/v4-comparator-source-readiness';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nestedNumber(value: unknown, keys: string[]): number | null {
  let current: unknown = value;
  for (const key of keys) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current)
    ) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return toNumber(current);
}

function repoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must come from git rev-parse HEAD');
  }
  return sha;
}

async function loadFbsTeamIds(prisma: PrismaClient, season: number) {
  const rows = await prisma.teamMembership.findMany({
    where: { season, level: 'fbs' },
    select: { teamId: true },
    orderBy: { teamId: 'asc' },
  });
  return rows.map((row) => row.teamId);
}

async function loadTeamSeasonRows(
  prisma: PrismaClient,
  season: number
): Promise<V4ReadinessTeamSeasonRow[]> {
  const rows = await prisma.teamSeasonStat.findMany({
    where: { season },
    select: {
      teamId: true,
      successOff: true,
      successDef: true,
      rawJson: true,
    },
    orderBy: { teamId: 'asc' },
  });

  return rows.map((row) => ({
    teamId: row.teamId,
    successOff: toNumber(row.successOff),
    successDef: toNumber(row.successDef),
    offFinishing: nestedNumber(row.rawJson, [
      'drive_stats',
      'finishingDrives',
      'off',
      'pointsPerOpp',
    ]),
    defFinishing: nestedNumber(row.rawJson, [
      'drive_stats',
      'finishingDrives',
      'def',
      'pointsPerOpp',
    ]),
    offAvailableYardsPct: nestedNumber(row.rawJson, [
      'drive_stats',
      'availableYards',
      'off',
      'avgAvailableYardsPct',
    ]),
    defAvailableYardsPct: nestedNumber(row.rawJson, [
      'drive_stats',
      'availableYards',
      'def',
      'avgAvailableYardsPct',
    ]),
  }));
}

async function loadTeamGameRows(
  prisma: PrismaClient,
  season: number
): Promise<V4ReadinessTeamGameRow[]> {
  const rows = await prisma.teamGameStat.findMany({
    where: { season },
    select: {
      gameId: true,
      teamId: true,
      week: true,
      successOff: true,
      successDef: true,
      rawJson: true,
    },
    orderBy: [{ week: 'asc' }, { gameId: 'asc' }, { teamId: 'asc' }],
  });

  return rows.map((row) => ({
    gameId: row.gameId,
    teamId: row.teamId,
    week: row.week,
    successOff: toNumber(row.successOff),
    successDef: toNumber(row.successDef),
    offensePlays: nestedNumber(row.rawJson, ['offense', 'plays']),
    defensePlays: nestedNumber(row.rawJson, ['defense', 'plays']),
  }));
}

async function main() {
  const parsed = parseV4ComparatorSourceReadinessArgs(
    process.argv.slice(2)
  );
  if (!parsed.ok) {
    console.error(parsed.errors.join('\n'));
    process.exit(1);
  }

  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    console.error('DIRECT_URL required');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: directUrl } },
  });

  try {
    const [
      targetFbsTeamIds,
      comparisonFbsTeamIds,
      targetUnitGrades,
      targetTeamSeasonRows,
      comparisonTeamSeasonRows,
      targetTeamGameRows,
      comparisonTeamGameRows,
      targetV4Ratings,
      targetV4BetCount,
    ] = await Promise.all([
      loadFbsTeamIds(prisma, parsed.targetSeason),
      loadFbsTeamIds(prisma, parsed.comparisonSeason),
      prisma.teamUnitGrades.findMany({
        where: { season: parsed.targetSeason },
        select: {
          teamId: true,
          offExplosiveness: true,
          defExplosiveness: true,
        },
        orderBy: { teamId: 'asc' },
      }),
      loadTeamSeasonRows(prisma, parsed.targetSeason),
      loadTeamSeasonRows(prisma, parsed.comparisonSeason),
      loadTeamGameRows(prisma, parsed.targetSeason),
      loadTeamGameRows(prisma, parsed.comparisonSeason),
      prisma.teamSeasonRating.findMany({
        where: {
          season: parsed.targetSeason,
          modelVersion: 'v4',
        },
        select: { teamId: true },
        orderBy: { teamId: 'asc' },
      }),
      prisma.bet.count({
        where: {
          season: parsed.targetSeason,
          strategyTag: 'v4_labs',
          marketType: 'spread',
        },
      }),
    ]);

    const report = buildV4ComparatorSourceReadinessReport({
      targetSeason: parsed.targetSeason,
      comparisonSeason: parsed.comparisonSeason,
      repoCommitSha: repoCommitSha(),
      observedAt: new Date().toISOString(),
      targetFbsTeamIds,
      comparisonFbsTeamIds,
      targetUnitGradeTeamIds: targetUnitGrades.map((row) => row.teamId),
      targetExplosivenessCompleteTeamIds: targetUnitGrades
        .filter(
          (row) =>
            Number.isFinite(row.offExplosiveness) &&
            Number.isFinite(row.defExplosiveness)
        )
        .map((row) => row.teamId),
      targetTeamSeasonRows,
      comparisonTeamSeasonRows,
      targetTeamGameRows,
      comparisonTeamGameRows,
      targetV4RatingTeamIds: targetV4Ratings.map((row) => row.teamId),
      targetV4BetCount,
    });

    const output = JSON.stringify(report, null, 2);
    console.log(output);

    const reportPath =
      parsed.reportPath ??
      path.join(
        process.cwd(),
        'reports',
        'v4-comparator-source-readiness-2026.json'
      );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${output}\n`, 'utf8');
  } catch (err) {
    console.error(sanitizeV4ComparatorReadinessError(err));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
