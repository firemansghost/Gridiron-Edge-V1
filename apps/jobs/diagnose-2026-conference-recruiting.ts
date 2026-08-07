#!/usr/bin/env node
/**
 * Phase 2C-2D — Read-only 2026 conference + recruiting-mapping diagnostic.
 *
 * Usage:
 *   npx tsx apps/jobs/diagnose-2026-conference-recruiting.ts --season 2026 --preview
 *
 * Exactly 2 CFBD calls: /teams/fbs and /recruiting/teams. No /talent. No Odds. No writes.
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import {
  TARGET_SEASON,
  buildConferenceRecruitingDiagnostic,
  formatConferenceRecruitingDiagnosticReport,
  parseConferenceRecruitingDiagnosticArgs,
  sanitizeConferenceRecruitingDiagnosticError,
  type RawRecruitingRow,
  type RawTeamsFbsRow,
} from './src/preseason/conference-recruiting-diagnostic';

export interface DiagnosticReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
  loadTeamConferences(
    teamIds: string[]
  ): Promise<Array<{ id: string; conference: string | null }>>;
}

export interface DiagnosticProviderClient {
  fetchTeamsFbs(season: number): Promise<{ rows: RawTeamsFbsRow[]; endpoint: string }>;
  fetchRecruitingTeams(
    season: number
  ): Promise<{ rows: RawRecruitingRow[]; endpoint: string }>;
}

export function createPrismaDiagnosticReadStore(
  prisma: PrismaClient
): DiagnosticReadStore {
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

export function createCfbdDiagnosticProvider(): DiagnosticProviderClient {
  return {
    async fetchTeamsFbs(season) {
      const { body, endpoint } = await cfbdGetJson('/teams/fbs', season);
      if (!Array.isArray(body)) {
        throw new Error('CFBD /teams/fbs returned non-array');
      }
      return { rows: body as RawTeamsFbsRow[], endpoint };
    },
    async fetchRecruitingTeams(season) {
      const { body, endpoint } = await cfbdGetJson('/recruiting/teams', season);
      if (!Array.isArray(body)) {
        throw new Error('CFBD /recruiting/teams returned non-array');
      }
      return { rows: body as RawRecruitingRow[], endpoint };
    },
  };
}

export async function runConferenceRecruitingDiagnostic(options: {
  season: number;
  store?: DiagnosticReadStore;
  provider?: DiagnosticProviderClient;
  resolveTeamId?: (name: string) => string | null;
  prisma?: PrismaClient;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(
      `[conference-recruiting-diagnostic] season must be ${TARGET_SEASON}`
    );
    return { exitCode: 1 };
  }

  console.log('[conference-recruiting-diagnostic] mode=READ_ONLY');
  console.log(
    `[conference-recruiting-diagnostic] season=${options.season}`
  );
  console.log(
    '[conference-recruiting-diagnostic] provider calls=2 (/teams/fbs, /recruiting/teams); /talent not called'
  );
  console.log(
    '[conference-recruiting-diagnostic] mutations=false ratingsCompute=false ratingsPersist=false talentWrites=false commitWrites=false TeamWrites=false membershipWrites=false Odds=false'
  );

  const ownsPrisma = !options.prisma && !options.store;
  const prisma =
    options.prisma ?? (options.store ? undefined : new PrismaClient());
  const store =
    options.store ??
    (prisma ? createPrismaDiagnosticReadStore(prisma) : undefined);
  const provider = options.provider ?? createCfbdDiagnosticProvider();

  if (!store) {
    console.error('[conference-recruiting-diagnostic] Missing read store');
    return { exitCode: 1 };
  }

  // Construct exactly one TeamResolver for the entire run (alias/config load once).
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

    let providerRequestCount = 0;
    const endpoints: string[] = [];

    const fbsResp = await provider.fetchTeamsFbs(TARGET_SEASON);
    providerRequestCount += 1;
    endpoints.push(fbsResp.endpoint);

    const recruitingResp = await provider.fetchRecruitingTeams(TARGET_SEASON);
    providerRequestCount += 1;
    endpoints.push(recruitingResp.endpoint);

    console.log(
      `[conference-recruiting-diagnostic] CFBD requestCount=${providerRequestCount}`
    );

    const result = buildConferenceRecruitingDiagnostic({
      fbsIds,
      teamsFbsRaw: fbsResp.rows,
      recruitingRaw: recruitingResp.rows,
      conferenceByTeamId,
      resolveTeamId,
      providerRequestCount,
      providerEndpoints: endpoints,
    });

    console.log(formatConferenceRecruitingDiagnosticReport(result));
    console.log(
      '[conference-recruiting-diagnostic] COMPLETE — no writes authorized; ratingsComputeAuthorized=false'
    );
    return { exitCode: result.ok ? 0 : 1 };
  } catch (err) {
    console.error(
      `[conference-recruiting-diagnostic] ${sanitizeConferenceRecruitingDiagnosticError(err)}`
    );
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parseConferenceRecruitingDiagnosticArgs(
    process.argv.slice(2)
  );
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[conference-recruiting-diagnostic] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/diagnose-2026-conference-recruiting.ts --season 2026 --preview'
    );
    process.exit(1);
  }
  const { exitCode } = await runConferenceRecruitingDiagnostic({
    season: parsed.season,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[conference-recruiting-diagnostic] ${sanitizeConferenceRecruitingDiagnosticError(err)}`
    );
    process.exit(1);
  });
}
