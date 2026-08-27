#!/usr/bin/env node
/**
 * Phase 2C-2H-2 — Guarded one-time 2026 TeamSeasonTalent initializer.
 *
 * Preview (default):
 *   npx tsx apps/jobs/initialize-2026-team-talent.ts --season 2026 --mode PREVIEW
 *
 * Commit (exact confirmation required):
 *   npx tsx apps/jobs/initialize-2026-team-talent.ts --season 2026 --mode COMMIT --confirm WRITE_2026_TALENT
 *
 * Exactly 1 CFBD call: GET /talent?year=2026.
 * No recruiting. No Odds. No ratings. No Prisma Migrate.
 * Does not use the legacy cfbd_team_roster_talent writer.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import type { RawTalentRow } from './src/preseason/ratings-input-provider-preview';
import {
  EXPECTED_FBS_COUNT,
  PROVIDER_BUDGET,
  PROVIDER_ENDPOINT,
  TARGET_SEASON,
  WRITE_CONFIRM_PHRASE,
  assessTalentInitialization,
  formatTalentInitReport,
  parseTalentInitArgs,
  sanitizeTalentInitError,
  writeTeamTalent,
  type ExistingTalentRow,
  type TalentCandidateRow,
  type TalentInitWriteDeps,
} from './src/preseason/initialize-2026-team-talent';

export interface TalentInitReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadExistingTalent(season: number): Promise<ExistingTalentRow[]>;
}

export interface TalentInitProviderClient {
  fetchTalent(season: number): Promise<{
    rows: RawTalentRow[];
    endpoint: string;
  }>;
}

function mapStoredRow(r: {
  season: number;
  teamId: string;
  talentComposite: number;
  blueChipsPct: number | null;
  sourceUpdatedAt: Date | null;
  fiveStar: number;
  fourStar: number;
  threeStar: number;
  unrated: number;
}): ExistingTalentRow {
  return {
    season: r.season,
    teamId: r.teamId,
    talentComposite: r.talentComposite,
    blueChipsPct: r.blueChipsPct,
    sourceUpdatedAt: r.sourceUpdatedAt,
    fiveStar: r.fiveStar,
    fourStar: r.fourStar,
    threeStar: r.threeStar,
    unrated: r.unrated,
  };
}

export function createPrismaTalentInitReadStore(
  prisma: PrismaClient
): TalentInitReadStore {
  return {
    async loadFbsTeamIds(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season },
        select: { teamId: true, level: true },
      });
      return rows
        .filter((r) => r.level.toLowerCase() === 'fbs')
        .map((r) => r.teamId)
        .sort();
    },
    async loadExistingTalent(season) {
      const rows = await prisma.teamSeasonTalent.findMany({
        where: { season },
        select: {
          season: true,
          teamId: true,
          talentComposite: true,
          blueChipsPct: true,
          sourceUpdatedAt: true,
          fiveStar: true,
          fourStar: true,
          threeStar: true,
          unrated: true,
        },
        orderBy: { teamId: 'asc' },
      });
      return rows.map(mapStoredRow);
    },
  };
}

export function createPrismaTalentInitWriteDeps(
  prisma: PrismaClient
): TalentInitWriteDeps {
  return {
    async transaction(fn) {
      return prisma.$transaction(
        async (tx) => {
          const txStore = {
            async loadFbsTeamIds(season: number) {
              const rows = await tx.teamMembership.findMany({
                where: { season },
                select: { teamId: true, level: true },
              });
              return rows
                .filter((r) => r.level.toLowerCase() === 'fbs')
                .map((r) => r.teamId)
                .sort();
            },
            async loadExistingTalent(season: number) {
              const rows = await tx.teamSeasonTalent.findMany({
                where: { season },
                select: {
                  season: true,
                  teamId: true,
                  talentComposite: true,
                  blueChipsPct: true,
                  sourceUpdatedAt: true,
                  fiveStar: true,
                  fourStar: true,
                  threeStar: true,
                  unrated: true,
                },
                orderBy: { teamId: 'asc' as const },
              });
              return rows.map(mapStoredRow);
            },
            async insertTalentRow(row: TalentCandidateRow) {
              await tx.teamSeasonTalent.create({
                data: {
                  season: row.season,
                  teamId: row.teamId,
                  talentComposite: row.talentComposite,
                  blueChipsPct: null,
                  sourceUpdatedAt: null,
                  // fiveStar/fourStar/threeStar/unrated omitted → schema defaults 0
                },
              });
              return 1;
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
    async loadExistingTalent(season) {
      const rows = await prisma.teamSeasonTalent.findMany({
        where: { season },
        select: {
          season: true,
          teamId: true,
          talentComposite: true,
          blueChipsPct: true,
          sourceUpdatedAt: true,
          fiveStar: true,
          fourStar: true,
          threeStar: true,
          unrated: true,
        },
        orderBy: { teamId: 'asc' },
      });
      return rows.map(mapStoredRow);
    },
    async loadFbsTeamIds(season) {
      const rows = await prisma.teamMembership.findMany({
        where: { season },
        select: { teamId: true, level: true },
      });
      return rows
        .filter((r) => r.level.toLowerCase() === 'fbs')
        .map((r) => r.teamId)
        .sort();
    },
  };
}

async function cfbdGetTalent(
  season: number
): Promise<{ body: unknown; endpoint: string }> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }
  const baseUrl =
    process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}/talent`);
  url.searchParams.set('year', String(season));
  const endpoint = `/talent?year=${season}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'gridiron-edge-jobs/1.0',
      },
    });
    clearTimeout(timeout);
    if (response.status === 301 || response.status === 302) {
      throw new Error(`CFBD redirected: ${response.status}`);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`CFBD HTTP ${response.status}`);
    }
    return { body: JSON.parse(text), endpoint };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export function createCfbdTalentInitProvider(): TalentInitProviderClient {
  return {
    async fetchTalent(season) {
      const { body, endpoint } = await cfbdGetTalent(season);
      if (!Array.isArray(body)) {
        throw new Error('CFBD /talent returned non-array');
      }
      return { rows: body as RawTalentRow[], endpoint };
    },
  };
}

export async function runTalentInitializer(options: {
  season: number;
  mode: 'PREVIEW' | 'COMMIT';
  confirm?: string;
  store?: TalentInitReadStore;
  provider?: TalentInitProviderClient;
  writeDeps?: TalentInitWriteDeps;
  resolveTeamId?: (name: string) => string | null;
  prisma?: PrismaClient;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(`[talent-init] season must be ${TARGET_SEASON}`);
    return { exitCode: 1 };
  }

  const confirmationValid =
    options.mode === 'COMMIT'
      ? options.confirm === WRITE_CONFIRM_PHRASE
      : true;

  if (options.mode === 'COMMIT' && !confirmationValid) {
    console.error(
      `[talent-init] COMMIT requires confirm=${WRITE_CONFIRM_PHRASE}`
    );
    return { exitCode: 1 };
  }

  console.log(`mode=${options.mode}`);
  console.log(`targetSeason=${options.season}`);
  console.log('table=team_season_talent');
  console.log(`expectedRows=${EXPECTED_FBS_COUNT}`);
  console.log('ratingsCompute=false');
  console.log('recruitingWrite=false');
  console.log('Odds=false');
  console.log(`provider=${PROVIDER_ENDPOINT}`);
  console.log(`providerBudget=${PROVIDER_BUDGET}`);

  const ownsPrisma =
    !options.prisma &&
    !options.store &&
    !(options.mode === 'COMMIT' && options.writeDeps);

  const prisma =
    options.prisma ?? (ownsPrisma ? new PrismaClient() : undefined);

  const store =
    options.store ??
    (prisma ? createPrismaTalentInitReadStore(prisma) : undefined);
  const provider = options.provider ?? createCfbdTalentInitProvider();
  const writeDeps =
    options.mode === 'COMMIT'
      ? options.writeDeps ??
        (prisma ? createPrismaTalentInitWriteDeps(prisma) : undefined)
      : undefined;

  if (!store) {
    console.error('[talent-init] Missing read store');
    return { exitCode: 1 };
  }
  if (options.mode === 'COMMIT' && !writeDeps) {
    console.error('[talent-init] Missing write deps for COMMIT');
    return { exitCode: 1 };
  }

  const sharedResolver = options.resolveTeamId ? null : new TeamResolver();
  const resolveTeamId =
    options.resolveTeamId ??
    ((name: string) =>
      sharedResolver!.resolveTeam(name, 'college-football', {
        provider: 'cfbd',
      }));

  try {
    const fbsIds = await store.loadFbsTeamIds(TARGET_SEASON);
    const existingTalent = await store.loadExistingTalent(TARGET_SEASON);

    const talentResp = await provider.fetchTalent(TARGET_SEASON);
    const providerRequestCount = 1;
    if (providerRequestCount > PROVIDER_BUDGET) {
      console.error('[talent-init] Provider budget exceeded');
      return { exitCode: 1 };
    }
    console.log(`providerRequestCount=${providerRequestCount}`);

    const assessment = assessTalentInitialization({
      fbsIds,
      talentRaw: talentResp.rows,
      resolveTeamId,
      existingTalent,
      providerRequestCount,
      commitRequested: options.mode === 'COMMIT',
      confirmationValid,
    });

    if (options.mode === 'PREVIEW') {
      console.log(
        formatTalentInitReport({
          mode: 'PREVIEW',
          dbFbsCount: fbsIds.length,
          assessment,
          providerRequestCount,
          endpoint: talentResp.endpoint,
          confirmationValid: true,
          mutationsInvoked: false,
        })
      );
      console.log(
        '[talent-init] COMPLETE — PREVIEW only; no talent writes; ratings not authorized'
      );
      return { exitCode: assessment.structurallyComplete ? 0 : 1 };
    }

    // COMMIT path
    if (!assessment.commitEligible) {
      console.log(
        formatTalentInitReport({
          mode: 'COMMIT',
          dbFbsCount: fbsIds.length,
          assessment,
          providerRequestCount,
          endpoint: talentResp.endpoint,
          confirmationValid,
          mutationsInvoked: false,
          writeCommitted: false,
        })
      );
      console.error(
        '[talent-init] COMMIT refused — not commitEligible (fail closed)'
      );
      return { exitCode: 1 };
    }

    const writeResult = await writeTeamTalent({
      candidates: assessment.candidates,
      expectedFbsIds: fbsIds,
      deps: writeDeps!,
    });

    console.log(
      formatTalentInitReport({
        mode: 'COMMIT',
        dbFbsCount: fbsIds.length,
        assessment,
        providerRequestCount,
        endpoint: talentResp.endpoint,
        confirmationValid: true,
        mutationsInvoked: true,
        rowsInserted: writeResult.rowsInserted,
        writeCommitted: true,
        transactionVerificationExact:
          writeResult.verification.verificationExact,
        postCommit: writeResult.postCommit,
      })
    );
    console.log(
      '[talent-init] COMPLETE — 138 talentComposite rows committed; ratings still not authorized'
    );
    return { exitCode: 0 };
  } catch (err) {
    console.error(`[talent-init] ${sanitizeTalentInitError(err)}`);
    if (err instanceof Error && err.message) {
      console.error(`[talent-init] detail=${err.message}`);
    }
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parseTalentInitArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[talent-init] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/initialize-2026-team-talent.ts --season 2026 --mode PREVIEW'
    );
    console.error(
      '   or: npx tsx apps/jobs/initialize-2026-team-talent.ts --season 2026 --mode COMMIT --confirm WRITE_2026_TALENT'
    );
    process.exit(1);
  }
  const { exitCode } = await runTalentInitializer({
    season: parsed.season,
    mode: parsed.mode,
    confirm: parsed.confirm,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[talent-init] ${sanitizeTalentInitError(err)}`);
    process.exit(1);
  });
}
