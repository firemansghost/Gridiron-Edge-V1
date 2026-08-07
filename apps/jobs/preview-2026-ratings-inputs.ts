#!/usr/bin/env node
/**
 * Phase 2C-2C — Read-only 2026 ratings-input / provider preview.
 *
 * Usage:
 *   npx tsx apps/jobs/preview-2026-ratings-inputs.ts --season 2026 --preview
 *
 * Calls CFBD once per data family (talent + recruiting/teams). Never mutates DB.
 * Never calls Odds. Never computes/persists ratings.
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import {
  TARGET_SEASON,
  buildRatingsInputPreview,
  formatRatingsInputPreviewReport,
  parsePreviewRatingsInputArgs,
  sanitizeRatingsInputPreviewError,
  type RawCommitsRow,
  type RawTalentRow,
} from './src/preseason/ratings-input-provider-preview';

export interface RatingsInputReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadTeamConferences(
    teamIds: string[]
  ): Promise<Array<{ id: string; conference: string | null }>>;
}

export interface RatingsInputProviderClient {
  fetchTalent(season: number): Promise<{
    rows: RawTalentRow[];
    endpoint: string;
  }>;
  fetchRecruitingTeams(season: number): Promise<{
    rows: RawCommitsRow[];
    endpoint: string;
  }>;
}

export function createPrismaRatingsInputReadStore(
  prisma: PrismaClient
): RatingsInputReadStore {
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
    async loadTeamConferences(teamIds) {
      return prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, conference: true },
      });
    },
  };
}

async function cfbdGetJson(
  path: string,
  season: number
): Promise<{ body: unknown; endpoint: string }> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }
  const baseUrl =
    process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('year', String(season));
  const endpoint = `${path}?year=${season}`;

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

export function createCfbdRatingsInputProvider(): RatingsInputProviderClient {
  return {
    async fetchTalent(season) {
      const { body, endpoint } = await cfbdGetJson('/talent', season);
      if (!Array.isArray(body)) {
        throw new Error('CFBD /talent returned non-array');
      }
      return { rows: body as RawTalentRow[], endpoint };
    },
    async fetchRecruitingTeams(season) {
      const { body, endpoint } = await cfbdGetJson('/recruiting/teams', season);
      if (!Array.isArray(body)) {
        throw new Error('CFBD /recruiting/teams returned non-array');
      }
      return { rows: body as RawCommitsRow[], endpoint };
    },
  };
}

export async function runRatingsInputPreview(options: {
  season: number;
  store?: RatingsInputReadStore;
  provider?: RatingsInputProviderClient;
  resolveTeamId?: (name: string) => string | null;
  prisma?: PrismaClient;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(
      `[ratings-input-preview] season must be ${TARGET_SEASON}`
    );
    return { exitCode: 1 };
  }

  console.log('[ratings-input-preview] mode=READ_ONLY');
  console.log(`[ratings-input-preview] season=${options.season}`);
  console.log(
    '[ratings-input-preview] DB mutations=false ratings=false odds=false talentWrites=false commitWrites=false unitGradeWrites=false statsWrites=false'
  );

  const ownsPrisma = !options.prisma && !options.store;
  const prisma =
    options.prisma ?? (options.store ? undefined : new PrismaClient());
  const store =
    options.store ??
    (prisma ? createPrismaRatingsInputReadStore(prisma) : undefined);
  const provider = options.provider ?? createCfbdRatingsInputProvider();

  if (!store) {
    console.error('[ratings-input-preview] Missing read store');
    return { exitCode: 1 };
  }

  const resolver =
    options.resolveTeamId ??
    ((name: string) => {
      const teamResolver = new TeamResolver();
      return teamResolver.resolveTeam(name, 'college-football', {
        provider: 'cfbd',
      });
    });

  try {
    const fbsIds = await store.loadFbsTeamIds(TARGET_SEASON);
    const teams = await store.loadTeamConferences(fbsIds);
    const conferenceByTeamId: Record<string, string | null> = {};
    for (const t of teams) {
      conferenceByTeamId[t.id] = t.conference;
    }

    let providerRequestCount = 0;
    const endpoints: string[] = [];

    const talentResp = await provider.fetchTalent(TARGET_SEASON);
    providerRequestCount += 1;
    endpoints.push(talentResp.endpoint);

    const commitsResp = await provider.fetchRecruitingTeams(TARGET_SEASON);
    providerRequestCount += 1;
    endpoints.push(commitsResp.endpoint);

    console.log(
      `[ratings-input-preview] providers invoked: CFBD requestCount=${providerRequestCount}`
    );
    console.log(
      `[ratings-input-preview] endpoints: ${endpoints.join(', ')}`
    );

    const result = buildRatingsInputPreview({
      fbsIds,
      talentRaw: talentResp.rows,
      commitsRaw: commitsResp.rows,
      resolveTeamId: resolver,
      conferenceByTeamId,
      providerRequestCount,
      providerEndpoints: endpoints,
      requestedSeason: TARGET_SEASON,
    });

    console.log(formatRatingsInputPreviewReport(result));
    console.log(
      '[ratings-input-preview] COMPLETE — 2026 ratings inputs previewed; no writes authorized'
    );
    return { exitCode: result.ok ? 0 : 1 };
  } catch (err) {
    console.error(
      `[ratings-input-preview] ${sanitizeRatingsInputPreviewError(err)}`
    );
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parsePreviewRatingsInputArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[ratings-input-preview] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/preview-2026-ratings-inputs.ts --season 2026 --preview'
    );
    process.exit(1);
  }
  const { exitCode } = await runRatingsInputPreview({ season: parsed.season });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[ratings-input-preview] ${sanitizeRatingsInputPreviewError(err)}`
    );
    process.exit(1);
  });
}
