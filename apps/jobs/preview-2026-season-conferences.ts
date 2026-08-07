#!/usr/bin/env node
/**
 * Phase 2C-2F — Read-only 2026 season-aware conference persistence preview.
 *
 * Usage:
 *   npx tsx apps/jobs/preview-2026-season-conferences.ts --season 2026 --preview
 *
 * Exactly 1 CFBD call: /teams/fbs. No /talent. No recruiting. No Odds. No writes.
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import {
  TARGET_SEASON,
  buildSeasonConferencePreview,
  formatSeasonConferencePreviewReport,
  parseSeasonConferencePreviewArgs,
  sanitizeSeasonConferencePreviewError,
} from './src/preseason/season-conference-preview';
import type { RawTeamsFbsRow } from './src/preseason/conference-recruiting-diagnostic';

export interface SeasonConferenceReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadTeamConferences(
    teamIds: string[]
  ): Promise<Array<{ id: string; conference: string | null }>>;
}

export interface SeasonConferenceProviderClient {
  fetchTeamsFbs(season: number): Promise<{ rows: RawTeamsFbsRow[]; endpoint: string }>;
}

export function createPrismaSeasonConferenceReadStore(
  prisma: PrismaClient
): SeasonConferenceReadStore {
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

export function createCfbdSeasonConferenceProvider(): SeasonConferenceProviderClient {
  return {
    async fetchTeamsFbs(season) {
      const { body, endpoint } = await cfbdGetJson('/teams/fbs', season);
      if (!Array.isArray(body)) {
        throw new Error('CFBD /teams/fbs returned non-array');
      }
      return { rows: body as RawTeamsFbsRow[], endpoint };
    },
  };
}

export async function runSeasonConferencePreview(options: {
  season: number;
  store?: SeasonConferenceReadStore;
  provider?: SeasonConferenceProviderClient;
  resolveTeamId?: (name: string) => string | null;
  prisma?: PrismaClient;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(
      `[season-conference-preview] season must be ${TARGET_SEASON}`
    );
    return { exitCode: 1 };
  }

  console.log('[season-conference-preview] mode=READ_ONLY');
  console.log(`[season-conference-preview] season=${options.season}`);
  console.log(
    '[season-conference-preview] provider calls=1 (/teams/fbs); /talent and /recruiting/teams not called'
  );
  console.log(
    '[season-conference-preview] mutations=false ratingsCompute=false Team.conference writes=false TeamMembership writes=false Odds=false schemaChanged=false'
  );
  console.log(
    '[season-conference-preview] proposedStorage=TeamMembership.conference (deferred — no migration in this phase)'
  );

  const ownsPrisma = !options.prisma && !options.store;
  const prisma =
    options.prisma ?? (options.store ? undefined : new PrismaClient());
  const store =
    options.store ??
    (prisma ? createPrismaSeasonConferenceReadStore(prisma) : undefined);
  const provider = options.provider ?? createCfbdSeasonConferenceProvider();

  if (!store) {
    console.error('[season-conference-preview] Missing read store');
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

    const fbsResp = await provider.fetchTeamsFbs(TARGET_SEASON);
    const providerRequestCount = 1;
    const endpoints = [fbsResp.endpoint];

    console.log(
      `[season-conference-preview] CFBD requestCount=${providerRequestCount}`
    );

    const result = buildSeasonConferencePreview({
      fbsIds,
      teamsFbsRaw: fbsResp.rows,
      conferenceByTeamId,
      resolveTeamId,
      providerRequestCount,
      providerEndpoints: endpoints,
      // TeamMembership.conference does not exist yet — always 0 in this phase
      existingTargetSeasonConferenceDataCount: 0,
    });

    console.log(formatSeasonConferencePreviewReport(result));
    console.log(
      '[season-conference-preview] COMPLETE — no writes; writeEligible is classification only; ratingsComputeAuthorized=false'
    );
    return { exitCode: result.ok ? 0 : 1 };
  } catch (err) {
    console.error(
      `[season-conference-preview] ${sanitizeSeasonConferencePreviewError(err)}`
    );
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parseSeasonConferencePreviewArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[season-conference-preview] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/preview-2026-season-conferences.ts --season 2026 --preview'
    );
    process.exit(1);
  }
  const { exitCode } = await runSeasonConferencePreview({
    season: parsed.season,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[season-conference-preview] ${sanitizeSeasonConferencePreviewError(err)}`
    );
    process.exit(1);
  });
}
