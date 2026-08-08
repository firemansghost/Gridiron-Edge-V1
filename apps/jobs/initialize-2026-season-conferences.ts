#!/usr/bin/env node
/**
 * Phase 2C-2G-3 — Guarded 2026 TeamMembership.conference initializer.
 *
 * Preview (default):
 *   npx tsx apps/jobs/initialize-2026-season-conferences.ts --season 2026
 *
 * Commit (exact confirmation required):
 *   npx tsx apps/jobs/initialize-2026-season-conferences.ts --season 2026 --commit --confirm WRITE_2026_CONFERENCES
 *
 * Exactly 1 CFBD call: /teams/fbs. No /talent. No recruiting. No Odds.
 * No Team.conference mutation. No ratings. No Prisma Migrate.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import {
  TARGET_SEASON,
  buildSeasonConferencePreview,
  formatSeasonConferencePreviewReport,
} from './src/preseason/season-conference-preview';
import type { RawTeamsFbsRow } from './src/preseason/conference-recruiting-diagnostic';
import {
  PROVIDER_BUDGET,
  WRITE_CONFIRM_PHRASE,
  assessSeasonConferenceCommit,
  formatSeasonConferenceInitReport,
  parseSeasonConferenceInitArgs,
  sanitizeSeasonConferenceInitError,
  writeSeasonConferences,
  type MembershipConferenceRow,
  type SeasonConferenceWriteDeps,
} from './src/preseason/season-conference-writer';
import {
  createCfbdSeasonConferenceProvider,
  createPrismaSeasonConferenceReadStore,
  type SeasonConferenceProviderClient,
  type SeasonConferenceReadStore,
} from './preview-2026-season-conferences';

export interface SeasonConferenceMembershipStore {
  loadFbsMembershipWithConference(
    season: number
  ): Promise<MembershipConferenceRow[]>;
}

export function createPrismaSeasonConferenceMembershipStore(
  prisma: PrismaClient
): SeasonConferenceMembershipStore {
  return {
    async loadFbsMembershipWithConference(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season },
        select: {
          season: true,
          teamId: true,
          level: true,
          conference: true,
        },
        orderBy: { teamId: 'asc' },
      });
      return rows.filter((r) => r.level.toLowerCase() === 'fbs');
    },
  };
}

export function createPrismaSeasonConferenceWriteDeps(
  prisma: PrismaClient
): SeasonConferenceWriteDeps {
  return {
    async transaction(fn) {
      return prisma.$transaction(
        async (tx) => {
          const txStore = {
            async loadFbsMembershipWithConference(season: number) {
              const rows = await tx.teamMembership.findMany({
                where: { season },
                select: {
                  season: true,
                  teamId: true,
                  level: true,
                  conference: true,
                },
                orderBy: { teamId: 'asc' as const },
              });
              return rows.filter((r) => r.level.toLowerCase() === 'fbs');
            },
            async updateConferenceIfNull(options: {
              season: number;
              teamId: string;
              conference: string;
            }) {
              const result = await tx.teamMembership.updateMany({
                where: {
                  season: options.season,
                  teamId: options.teamId,
                  level: 'fbs',
                  conference: null,
                },
                data: { conference: options.conference },
              });
              return result.count;
            },
          };
          return fn(txStore);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 60000,
        }
      );
    },
    async loadFbsMembershipWithConference(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season },
        select: {
          season: true,
          teamId: true,
          level: true,
          conference: true,
        },
        orderBy: { teamId: 'asc' },
      });
      return rows.filter((r) => r.level.toLowerCase() === 'fbs');
    },
  };
}

export async function runSeasonConferenceInitializer(options: {
  season: number;
  mode: 'READ_ONLY' | 'COMMIT';
  confirm?: string;
  store?: SeasonConferenceReadStore;
  membershipStore?: SeasonConferenceMembershipStore;
  provider?: SeasonConferenceProviderClient;
  writeDeps?: SeasonConferenceWriteDeps;
  resolveTeamId?: (name: string) => string | null;
  prisma?: PrismaClient;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(
      `[season-conference-init] season must be ${TARGET_SEASON}`
    );
    return { exitCode: 1 };
  }

  if (options.mode === 'COMMIT' && options.confirm !== WRITE_CONFIRM_PHRASE) {
    console.error(
      `[season-conference-init] COMMIT requires confirm=${WRITE_CONFIRM_PHRASE}`
    );
    return { exitCode: 1 };
  }

  console.log(`mode=${options.mode}`);
  console.log(`targetSeason=${options.season}`);
  console.log('table=team_membership');
  console.log('column=conference');
  console.log('expectedRows=138');
  console.log('staticTeamConferenceMutation=false');
  console.log('ratingsCompute=false');
  console.log('talentWrite=false');
  console.log('recruitingWrite=false');
  console.log('Odds=false');
  console.log('provider=/teams/fbs?year=2026');
  console.log(`providerBudget=${PROVIDER_BUDGET}`);

  const ownsPrisma =
    !options.prisma &&
    !options.store &&
    !options.membershipStore &&
    !(options.mode === 'COMMIT' && options.writeDeps);

  const prisma =
    options.prisma ??
    (ownsPrisma ? new PrismaClient() : undefined);

  const store =
    options.store ??
    (prisma ? createPrismaSeasonConferenceReadStore(prisma) : undefined);
  const membershipStore =
    options.membershipStore ??
    (prisma
      ? createPrismaSeasonConferenceMembershipStore(prisma)
      : undefined);
  const provider = options.provider ?? createCfbdSeasonConferenceProvider();
  const writeDeps =
    options.mode === 'COMMIT'
      ? options.writeDeps ??
        (prisma ? createPrismaSeasonConferenceWriteDeps(prisma) : undefined)
      : undefined;

  if (!store || !membershipStore) {
    console.error('[season-conference-init] Missing read stores');
    return { exitCode: 1 };
  }
  if (options.mode === 'COMMIT' && !writeDeps) {
    console.error('[season-conference-init] Missing write deps for COMMIT');
    return { exitCode: 1 };
  }

  const teamResolver = options.resolveTeamId ? null : new TeamResolver();
  const resolveTeamId =
    options.resolveTeamId ??
    ((name: string) =>
      teamResolver!.resolveTeam(name, 'college-football', {
        provider: 'cfbd',
      }));

  try {
    const fbsIds = await store.loadFbsTeamIds(TARGET_SEASON);
    const teams = await store.loadTeamConferences(fbsIds);
    const conferenceByTeamId: Record<string, string | null> = {};
    for (const t of teams) conferenceByTeamId[t.id] = t.conference;

    const membershipRows =
      await membershipStore.loadFbsMembershipWithConference(TARGET_SEASON);
    const populated = membershipRows.filter(
      (r) =>
        r.conference !== null && String(r.conference).trim() !== ''
    ).length;

    const fbsResp = await provider.fetchTeamsFbs(TARGET_SEASON);
    const providerRequestCount = 1;
    if (providerRequestCount > PROVIDER_BUDGET) {
      console.error('[season-conference-init] Provider budget exceeded');
      return { exitCode: 1 };
    }
    console.log(`providerRequestCount=${providerRequestCount}`);

    const preview = buildSeasonConferencePreview({
      fbsIds,
      teamsFbsRaw: fbsResp.rows,
      conferenceByTeamId,
      resolveTeamId,
      providerRequestCount,
      providerEndpoints: [fbsResp.endpoint],
      existingTargetSeasonConferenceDataCount: populated,
    });

    console.log(formatSeasonConferencePreviewReport(preview));

    const assessment = assessSeasonConferenceCommit({
      preview,
      membershipRows,
    });

    if (options.mode === 'READ_ONLY') {
      console.log(
        formatSeasonConferenceInitReport({
          mode: 'READ_ONLY',
          preview,
          assessment,
          mutationsInvoked: false,
          writeCommitted: false,
          rowsUpdated: 0,
        })
      );
      console.log('mutationsInvoked=false');
      console.log('writeCommitted=false');
      console.log('rowsUpdated=0');
      return { exitCode: preview.ok && assessment.target.fbsCount === 138 ? 0 : 1 };
    }

    const result = await writeSeasonConferences({
      preview,
      membershipRows,
      deps: writeDeps!,
    });

    console.log(
      formatSeasonConferenceInitReport({
        mode: 'COMMIT',
        preview,
        assessment: result.assessment,
        mutationsInvoked: result.mutationsInvoked,
        writeCommitted: result.writeCommitted,
        rowsUpdated: result.rowsUpdated,
        verification: result.verification,
      })
    );
    console.log(`mutationsInvoked=${result.mutationsInvoked}`);
    console.log(`writeCommitted=${result.writeCommitted}`);
    console.log(`rowsUpdated=${result.rowsUpdated}`);

    if (!result.ok) {
      if (!result.mutationsInvoked) {
        console.error(
          '[season-conference-init] COMMIT refused — preconditions not met; zero writes'
        );
      } else {
        console.error(
          '[season-conference-init] INCONSISTENCY after transaction — exit nonzero; no automatic repair'
        );
      }
      return { exitCode: 1 };
    }

    console.log(
      '[season-conference-init] SUCCESS — 138 season conferences written and verified; ratings still unauthorized'
    );
    return { exitCode: 0 };
  } catch (err) {
    console.error(
      `[season-conference-init] ${sanitizeSeasonConferenceInitError(err)}`
    );
    if (err instanceof Error && err.message) {
      // Non-secret operational messages (rollback reasons) are useful in CI
      if (
        /rolling back|pristine|affected|verification|transaction/i.test(
          err.message
        )
      ) {
        console.error(`[season-conference-init] detail=${err.message}`);
      }
    }
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parseSeasonConferenceInitArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[season-conference-init] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/initialize-2026-season-conferences.ts --season 2026 [--commit --confirm WRITE_2026_CONFERENCES]'
    );
    process.exit(1);
  }
  const { exitCode } = await runSeasonConferenceInitializer({
    season: parsed.season,
    mode: parsed.mode,
    confirm: parsed.mode === 'COMMIT' ? parsed.confirm : undefined,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[season-conference-init] ${sanitizeSeasonConferenceInitError(err)}`
    );
    process.exit(1);
  });
}
