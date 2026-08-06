#!/usr/bin/env node
/**
 * Phase 2C-1C — Read-only 2026 production schedule inventory audit CLI.
 *
 * Usage:
 *   npx tsx apps/jobs/audit-schedule-inventory.ts --season 2026
 *
 * Does not call CFBD, Odds API, ratings, schedule write CLIs, or monolithic ingest.
 * Prisma is used for SELECT-only loads. No mutations are invoked.
 */

import { PrismaClient } from '@prisma/client';
import {
  AUDIT_SEASON,
  EXPECTED_2026_TOTAL,
  EXPECTED_2026_WEEKLY_BASELINE,
  EXPECTED_ABSENT_WEEKS_2026,
  auditScheduleInventory,
  formatAuditReport,
  parseAuditScheduleArgs,
  type InventoryAuditReadStore,
  type InventoryGameRow,
} from './src/preseason/schedule-inventory-audit';

/**
 * Audit-local error sanitizer. Never prints connection URLs, credentials,
 * DIRECT_URL, DATABASE_URL, password/token fields, or any thrown-error metadata.
 * The unused parameter is retained so call sites can pass the caught value.
 */
export function sanitizeAuditRuntimeError(_err?: unknown): string {
  return 'Database read failed; connection details suppressed';
}

function createPrismaInventoryReadStore(
  prisma: PrismaClient
): InventoryAuditReadStore {
  return {
    async loadGamesForSeason(season: number): Promise<InventoryGameRow[]> {
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
          venue: true,
          city: true,
          neutralSite: true,
          conferenceGame: true,
        },
        orderBy: [{ week: 'asc' }, { date: 'asc' }, { id: 'asc' }],
      });
      return rows.map((r) => ({
        id: r.id,
        season: r.season,
        week: r.week,
        date: r.date,
        status: r.status,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        homeTeamId: r.homeTeamId,
        awayTeamId: r.awayTeamId,
        venue: r.venue,
        city: r.city,
        neutralSite: r.neutralSite,
        conferenceGame: r.conferenceGame,
      }));
    },
  };
}

export interface RunInventoryAuditOptions {
  season: number;
  store?: InventoryAuditReadStore;
  prisma?: PrismaClient;
}

export async function runScheduleInventoryAudit(
  options: RunInventoryAuditOptions
): Promise<{ exitCode: number }> {
  const { season } = options;
  if (season !== AUDIT_SEASON) {
    console.error(
      `[schedule-inventory-audit] season must be ${AUDIT_SEASON} (got ${season})`
    );
    return { exitCode: 1 };
  }

  console.log('[schedule-inventory-audit] mode=READ_ONLY');
  console.log(`[schedule-inventory-audit] season=${season}`);
  console.log(
    '[schedule-inventory-audit] providers/ratings/odds/bets/scores/writes: not invoked'
  );

  const ownsPrisma = !options.prisma && !options.store;
  const prisma = options.prisma ?? (options.store ? undefined : new PrismaClient());
  const store =
    options.store ??
    (prisma ? createPrismaInventoryReadStore(prisma) : undefined);

  if (!store) {
    console.error('[schedule-inventory-audit] No read store available');
    return { exitCode: 1 };
  }

  try {
    const rows = await store.loadGamesForSeason(season);
    console.log(
      `[schedule-inventory-audit] loaded ${rows.length} Game rows for season ${season}`
    );

    const result = auditScheduleInventory({
      season,
      rows,
      expectedWeeklyBaseline: EXPECTED_2026_WEEKLY_BASELINE,
      expectedTotal: EXPECTED_2026_TOTAL,
      expectedAbsentWeeks: EXPECTED_ABSENT_WEEKS_2026,
    });

    console.log(formatAuditReport(result));

    if (result.ok) {
      console.log(
        '[schedule-inventory-audit] SUCCESS — 2026 production schedule inventory verified'
      );
      return { exitCode: 0 };
    }

    console.error(
      '[schedule-inventory-audit] FAILED — read-only findings require operator review; no repair attempted'
    );
    return { exitCode: 1 };
  } catch (err) {
    console.error(
      `[schedule-inventory-audit] ${sanitizeAuditRuntimeError(err)}`
    );
    console.error(
      '[schedule-inventory-audit] FAILED — read-only findings require operator review; no repair attempted'
    );
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) {
      await prisma.$disconnect();
    }
  }
}

async function main(): Promise<void> {
  const parsed = parseAuditScheduleArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[schedule-inventory-audit] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/audit-schedule-inventory.ts --season 2026'
    );
    process.exit(1);
  }

  const { exitCode } = await runScheduleInventoryAudit({
    season: parsed.season,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[schedule-inventory-audit] ${sanitizeAuditRuntimeError(err)}`
    );
    console.error(
      '[schedule-inventory-audit] FAILED — read-only findings require operator review; no repair attempted'
    );
    process.exit(1);
  });
}
