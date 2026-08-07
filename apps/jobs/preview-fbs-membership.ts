#!/usr/bin/env node
/**
 * Phase 2C-2B — Read-only 2026 FBS TeamMembership preview.
 *
 * Usage:
 *   npx tsx apps/jobs/preview-fbs-membership.ts --season 2026 --preview
 *
 * Never mutates. Never calls providers.
 */

import { PrismaClient } from '@prisma/client';
import {
  APPROVED_2026_ADDITIONS,
  BASE_SEASON,
  TARGET_SEASON,
  collectScheduleTeamIds,
  formatMembershipPreviewReport,
  parsePreviewMembershipArgs,
  previewFbsMembership,
  type FbsMembershipReadStore,
  type MembershipInitSnapshot,
} from './src/preseason/fbs-membership-init';

export function sanitizeMembershipRuntimeError(_err?: unknown): string {
  return 'Database read failed; connection details suppressed';
}

export function createPrismaMembershipReadStore(
  prisma: PrismaClient
): FbsMembershipReadStore {
  return {
    async loadFbsMembership(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season },
        select: { season: true, teamId: true, level: true },
        orderBy: { teamId: 'asc' },
      });
      return rows.filter((r) => r.level.toLowerCase() === 'fbs');
    },
    async loadAllMembership(season) {
      return prisma.teamMembership.findMany({
        where: { season },
        select: { season: true, teamId: true, level: true },
        orderBy: { teamId: 'asc' },
      });
    },
    async loadScheduleTeamIds(season) {
      return prisma.game.findMany({
        where: { season },
        select: { homeTeamId: true, awayTeamId: true },
      });
    },
    async loadTeamsByIds(ids) {
      return prisma.team.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
    },
  };
}

export async function loadMembershipSnapshot(
  store: FbsMembershipReadStore
): Promise<MembershipInitSnapshot> {
  const [baseFbs, existingTarget, scheduleGames] = await Promise.all([
    store.loadFbsMembership(BASE_SEASON),
    store.loadAllMembership(TARGET_SEASON),
    store.loadScheduleTeamIds(TARGET_SEASON),
  ]);
  const baseFbsIds = baseFbs.map((m) => m.teamId);
  const scheduleTeamIds = collectScheduleTeamIds(scheduleGames);
  const candidateProbe = [
    ...new Set([...baseFbsIds, ...APPROVED_2026_ADDITIONS]),
  ];
  const teams = await store.loadTeamsByIds(candidateProbe);
  return {
    baseFbsIds,
    approvedAdditions: [...APPROVED_2026_ADDITIONS],
    candidateIds: candidateProbe.sort(),
    scheduleTeamIds,
    existingTargetMembership: existingTarget,
    teamIdsPresent: teams.map((t) => t.id),
  };
}

export async function runMembershipPreview(options: {
  season: number;
  store?: FbsMembershipReadStore;
  prisma?: PrismaClient;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(
      `[fbs-membership-preview] season must be ${TARGET_SEASON}`
    );
    return { exitCode: 1 };
  }

  console.log('[fbs-membership-preview] mode=READ_ONLY');
  console.log(`[fbs-membership-preview] season=${options.season}`);
  console.log(
    '[fbs-membership-preview] providers/ratings/talent/stats/writes: not invoked'
  );

  const ownsPrisma = !options.prisma && !options.store;
  const prisma =
    options.prisma ?? (options.store ? undefined : new PrismaClient());
  const store =
    options.store ??
    (prisma ? createPrismaMembershipReadStore(prisma) : undefined);
  if (!store) {
    console.error('[fbs-membership-preview] No read store available');
    return { exitCode: 1 };
  }

  try {
    const snapshot = await loadMembershipSnapshot(store);
    const result = previewFbsMembership(snapshot);
    console.log(formatMembershipPreviewReport(result));
    if (result.ok && result.writeEligible) {
      console.log(
        '[fbs-membership-preview] SUCCESS — candidate set validated; mutationsInvoked=false'
      );
      return { exitCode: 0 };
    }
    console.error(
      '[fbs-membership-preview] FAILED — read-only findings require operator review; no repair attempted'
    );
    return { exitCode: 1 };
  } catch (err) {
    console.error(
      `[fbs-membership-preview] ${sanitizeMembershipRuntimeError(err)}`
    );
    console.error(
      '[fbs-membership-preview] FAILED — read-only findings require operator review; no repair attempted'
    );
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parsePreviewMembershipArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[fbs-membership-preview] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/preview-fbs-membership.ts --season 2026 --preview'
    );
    process.exit(1);
  }
  const { exitCode } = await runMembershipPreview({ season: parsed.season });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[fbs-membership-preview] ${sanitizeMembershipRuntimeError(err)}`
    );
    process.exit(1);
  });
}
