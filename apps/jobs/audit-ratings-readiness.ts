#!/usr/bin/env node
/**
 * Phase 2C-2A — Read-only 2026 ratings-input readiness audit CLI.
 *
 * Usage:
 *   npx tsx apps/jobs/audit-ratings-readiness.ts --season 2026
 *
 * Does not compute or persist ratings. Does not call providers.
 * Prisma is used for SELECT-only loads via a narrow read-store.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import {
  AUDIT_SEASON,
  COMPARISON_SEASON,
  DEFAULT_WORKFLOW_RISK_FINDINGS,
  auditRatingsReadiness,
  formatRatingsReadinessReport,
  parseRatingsReadinessArgs,
  type RatingsReadinessReadStore,
} from './src/preseason/ratings-readiness-audit';

/**
 * Hardened sanitizer — never emits thrown metadata or connection details.
 */
export function sanitizeRatingsReadinessRuntimeError(_err?: unknown): string {
  return 'Database read failed; connection details suppressed';
}

/**
 * Preserve non-finite Decimal/number values for structural detection.
 * Do not convert NaN/Infinity to null — that would hide invalid stored values.
 */
export function decimalToAuditNumber(
  value: Prisma.Decimal | number | null | undefined
): number | null {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

function createPrismaRatingsReadinessStore(
  prisma: PrismaClient
): RatingsReadinessReadStore {
  return {
    async loadTeams() {
      return prisma.team.findMany({
        select: { id: true, name: true, conference: true },
        orderBy: { id: 'asc' },
      });
    },
    async loadMemberships(seasons) {
      return prisma.teamMembership.findMany({
        where: { season: { in: [...seasons] } },
        select: { season: true, teamId: true, level: true },
        orderBy: [{ season: 'asc' }, { teamId: 'asc' }],
      });
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
          homeScore: true,
          awayScore: true,
          homeTeamId: true,
          awayTeamId: true,
        },
        orderBy: [{ week: 'asc' }, { date: 'asc' }, { id: 'asc' }],
      });
      return rows;
    },
    async loadTalent(seasons) {
      const rows = await prisma.teamSeasonTalent.findMany({
        where: { season: { in: [...seasons] } },
        select: {
          season: true,
          teamId: true,
          talentComposite: true,
          blueChipsPct: true,
          sourceUpdatedAt: true,
        },
      });
      return rows.map((r) => ({
        season: r.season,
        teamId: r.teamId,
        talentComposite: r.talentComposite,
        blueChipsPct: r.blueChipsPct,
        sourceUpdatedAt: r.sourceUpdatedAt,
      }));
    },
    async loadCommits(seasons) {
      return prisma.teamClassCommits.findMany({
        where: { season: { in: [...seasons] } },
        select: {
          season: true,
          teamId: true,
          commitsTotal: true,
          classRank: true,
          avgCommitRating: true,
          sourceUpdatedAt: true,
        },
      });
    },
    async loadSeasonStats(seasons) {
      const rows = await prisma.teamSeasonStat.findMany({
        where: { season: { in: [...seasons] } },
        select: {
          season: true,
          teamId: true,
          yppOff: true,
          successOff: true,
          epaOff: true,
          yppDef: true,
          successDef: true,
          epaDef: true,
          createdAt: true,
        },
      });
      return rows.map((r) => ({
        season: r.season,
        teamId: r.teamId,
        yppOff: decimalToAuditNumber(r.yppOff),
        successOff: decimalToAuditNumber(r.successOff),
        epaOff: decimalToAuditNumber(r.epaOff),
        yppDef: decimalToAuditNumber(r.yppDef),
        successDef: decimalToAuditNumber(r.successDef),
        epaDef: decimalToAuditNumber(r.epaDef),
        createdAt: r.createdAt,
      }));
    },
    async loadGameStats(seasons) {
      return prisma.teamGameStat.findMany({
        where: { season: { in: [...seasons] } },
        select: {
          season: true,
          teamId: true,
          week: true,
          yppOff: true,
          successOff: true,
          epaOff: true,
          yppDef: true,
          successDef: true,
          epaDef: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    },
    async loadSeasonRatings(seasons) {
      const rows = await prisma.teamSeasonRating.findMany({
        where: { season: { in: [...seasons] } },
        select: {
          season: true,
          teamId: true,
          modelVersion: true,
          games: true,
          rating: true,
          powerRating: true,
          confidence: true,
          dataSource: true,
        },
      });
      return rows.map((r) => ({
        season: r.season,
        teamId: r.teamId,
        modelVersion: r.modelVersion,
        games: r.games,
        rating: decimalToAuditNumber(r.rating),
        powerRating: decimalToAuditNumber(r.powerRating),
        confidence: decimalToAuditNumber(r.confidence),
        dataSource: r.dataSource,
      }));
    },
    async loadPowerRatings(season) {
      return prisma.powerRating.findMany({
        where: { season },
        select: {
          id: true,
          teamId: true,
          season: true,
          week: true,
          rating: true,
          modelVersion: true,
          confidence: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    },
    async loadUnitGrades(seasons) {
      return prisma.teamUnitGrades.findMany({
        where: { season: { in: [...seasons] } },
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
    },
  };
}

export interface RunRatingsReadinessAuditOptions {
  season: number;
  store?: RatingsReadinessReadStore;
  prisma?: PrismaClient;
  asOf?: Date;
}

export async function runRatingsReadinessAudit(
  options: RunRatingsReadinessAuditOptions
): Promise<{ exitCode: number }> {
  const { season } = options;
  if (season !== AUDIT_SEASON) {
    console.error(
      `[ratings-readiness-audit] season must be ${AUDIT_SEASON} (got ${season})`
    );
    return { exitCode: 1 };
  }

  console.log('[ratings-readiness-audit] mode=READ_ONLY');
  console.log(`[ratings-readiness-audit] season=${season}`);
  console.log(
    '[ratings-readiness-audit] providers/ratings-compute/persist/writes: not invoked'
  );

  const ownsPrisma = !options.prisma && !options.store;
  const prisma =
    options.prisma ?? (options.store ? undefined : new PrismaClient());
  const store =
    options.store ??
    (prisma ? createPrismaRatingsReadinessStore(prisma) : undefined);

  if (!store) {
    console.error('[ratings-readiness-audit] No read store available');
    return { exitCode: 1 };
  }

  try {
    const seasons = [season, COMPARISON_SEASON];
    const [
      teams,
      memberships,
      games,
      talent,
      commits,
      seasonStats,
      gameStats,
      seasonRatings,
      powerRatings,
      unitGrades,
    ] = await Promise.all([
      store.loadTeams(),
      store.loadMemberships(seasons),
      store.loadGames(season),
      store.loadTalent(seasons),
      store.loadCommits(seasons),
      store.loadSeasonStats(seasons),
      store.loadGameStats(seasons),
      store.loadSeasonRatings(seasons),
      store.loadPowerRatings(season),
      store.loadUnitGrades(seasons),
    ]);

    const result = auditRatingsReadiness({
      season,
      comparisonSeason: COMPARISON_SEASON,
      asOf: options.asOf ?? new Date(),
      teams,
      memberships,
      games,
      talent,
      commits,
      seasonStats,
      gameStats,
      seasonRatings,
      powerRatings,
      unitGrades,
      workflowRiskFindings: DEFAULT_WORKFLOW_RISK_FINDINGS,
    });

    console.log(formatRatingsReadinessReport(result));

    if (result.structuralOk) {
      console.log(
        '[ratings-readiness-audit] COMPLETE — 2026 ratings inputs inventoried; no ratings write authorized'
      );
      return { exitCode: 0 };
    }

    console.error(
      '[ratings-readiness-audit] FAILED — read-only findings require operator review; no repair attempted'
    );
    return { exitCode: 1 };
  } catch (err) {
    console.error(
      `[ratings-readiness-audit] ${sanitizeRatingsReadinessRuntimeError(err)}`
    );
    console.error(
      '[ratings-readiness-audit] FAILED — read-only findings require operator review; no repair attempted'
    );
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) {
      await prisma.$disconnect();
    }
  }
}

async function main(): Promise<void> {
  const parsed = parseRatingsReadinessArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[ratings-readiness-audit] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/audit-ratings-readiness.ts --season 2026'
    );
    process.exit(1);
  }

  const { exitCode } = await runRatingsReadinessAudit({
    season: parsed.season,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[ratings-readiness-audit] ${sanitizeRatingsReadinessRuntimeError(err)}`
    );
    console.error(
      '[ratings-readiness-audit] FAILED — read-only findings require operator review; no repair attempted'
    );
    process.exit(1);
  });
}
