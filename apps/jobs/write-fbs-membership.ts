#!/usr/bin/env node
/**
 * Phase 2C-2B — Guarded one-time write of 2026 FBS TeamMembership.
 *
 * Usage:
 *   npx tsx apps/jobs/write-fbs-membership.ts --season 2026 --confirm-write WRITE_2026_FBS_MEMBERSHIP
 *
 * Inserts exactly 138 TeamMembership rows. No Team updates. No deletes. No providers.
 */

import { PrismaClient } from '@prisma/client';
import {
  TARGET_SEASON,
  WRITE_CONFIRM_PHRASE,
  formatMembershipPreviewReport,
  parseWriteMembershipArgs,
  writeFbsMembership,
  type FbsMembershipWriteDeps,
} from './src/preseason/fbs-membership-init';
import {
  createPrismaMembershipReadStore,
  loadMembershipSnapshot,
  sanitizeMembershipRuntimeError,
} from './preview-fbs-membership';

export function createPrismaMembershipWriteDeps(
  prisma: PrismaClient
): FbsMembershipWriteDeps {
  return {
    async transaction(fn) {
      // Interactive transaction: mutation-path ops MUST use `tx`, not outer prisma
      return prisma.$transaction(async (tx) => {
        const txStore = {
          async loadAllMembership(season: number) {
            return tx.teamMembership.findMany({
              where: { season },
              select: { season: true, teamId: true, level: true },
              orderBy: { teamId: 'asc' as const },
            });
          },
          async createMembershipRows(
            rows: Array<{ season: number; teamId: string; level: string }>
          ) {
            // Exact insert count — do not use skipDuplicates (would conceal preexisting rows)
            const result = await tx.teamMembership.createMany({
              data: rows,
            });
            return result.count;
          },
        };
        return fn(txStore);
      });
    },
    /** Fresh post-commit verification read only — not used inside the transaction callback. */
    async loadAllMembership(season) {
      return prisma.teamMembership.findMany({
        where: { season },
        select: { season: true, teamId: true, level: true },
        orderBy: { teamId: 'asc' },
      });
    },
  };
}

export async function runMembershipWrite(options: {
  season: number;
  confirmWrite: string;
  prisma?: PrismaClient;
  writeDeps?: FbsMembershipWriteDeps;
}): Promise<{ exitCode: number }> {
  if (options.confirmWrite !== WRITE_CONFIRM_PHRASE) {
    console.error(
      `[fbs-membership-write] Confirmation mismatch: expected ${WRITE_CONFIRM_PHRASE}`
    );
    return { exitCode: 1 };
  }
  if (options.season !== TARGET_SEASON) {
    console.error(`[fbs-membership-write] season must be ${TARGET_SEASON}`);
    return { exitCode: 1 };
  }

  console.log('[fbs-membership-write] mode=GUARDED_WRITE');
  console.log(`[fbs-membership-write] season=${options.season}`);
  console.log(
    `[fbs-membership-write] confirm=${WRITE_CONFIRM_PHRASE}`
  );
  console.log(
    '[fbs-membership-write] providers/ratings/talent/stats/Team-updates: not invoked'
  );

  const ownsPrisma = !options.prisma && !options.writeDeps;
  const prisma =
    options.prisma ?? (options.writeDeps ? undefined : new PrismaClient());
  const readStore = prisma
    ? createPrismaMembershipReadStore(prisma)
    : undefined;
  const writeDeps =
    options.writeDeps ??
    (prisma ? createPrismaMembershipWriteDeps(prisma) : undefined);

  if (!readStore || !writeDeps) {
    console.error('[fbs-membership-write] Missing read store or write deps');
    return { exitCode: 1 };
  }

  try {
    const snapshot = await loadMembershipSnapshot(readStore);
    const result = await writeFbsMembership({ snapshot, deps: writeDeps });
    console.log(formatMembershipPreviewReport(result.preview));
    console.log(
      `[fbs-membership-write] inserted=${result.inserted} ok=${result.ok}`
    );
    if (result.verification) {
      console.log(
        `[fbs-membership-write] verification: ${JSON.stringify({
          ok: result.verification.ok,
          targetFbsCount: result.verification.targetFbsCount,
          distinctTargetFbsIds: result.verification.distinctTargetFbsIds,
          exactMatchCandidate: result.verification.exactMatchCandidate,
          exactMatchSchedule: result.verification.exactMatchSchedule,
          findings: result.verification.findings,
        })}`
      );
    }

    if (result.ok) {
      console.log(
        '[fbs-membership-write] SUCCESS — 2026 FBS membership initialized and verified'
      );
      return { exitCode: 0 };
    }

    console.error(
      '[fbs-membership-write] FAILED — read-only findings require operator review; no repair attempted'
    );
    return { exitCode: 1 };
  } catch (err) {
    console.error(
      `[fbs-membership-write] ${sanitizeMembershipRuntimeError(err)}`
    );
    console.error(
      '[fbs-membership-write] FAILED — read-only findings require operator review; no repair attempted'
    );
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parseWriteMembershipArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[fbs-membership-write] ${e}`);
    }
    console.error(
      `Usage: npx tsx apps/jobs/write-fbs-membership.ts --season 2026 --confirm-write ${WRITE_CONFIRM_PHRASE}`
    );
    process.exit(1);
  }
  const { exitCode } = await runMembershipWrite({
    season: parsed.season,
    confirmWrite: parsed.confirmWrite,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[fbs-membership-write] ${sanitizeMembershipRuntimeError(err)}`
    );
    process.exit(1);
  });
}
