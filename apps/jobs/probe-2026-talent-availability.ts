#!/usr/bin/env node
/**
 * Phase 2C-2H-1 — Read-only 2026 talent availability probe.
 *
 * Usage:
 *   npx tsx apps/jobs/probe-2026-talent-availability.ts --season 2026 --preview
 *
 * Provider budget: exactly 1 CFBD call — GET /talent?year=2026.
 * No recruiting call. No /teams/fbs. No Odds. No writes. No ratings.
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import {
  TARGET_SEASON,
  type RawTalentRow,
} from './src/preseason/ratings-input-provider-preview';
import {
  buildTalentAvailabilityProbe,
  formatTalentAvailabilityProbeReport,
  parseTalentAvailabilityProbeArgs,
  sanitizeTalentAvailabilityProbeError,
} from './src/preseason/talent-availability-probe';

export interface TalentProbeReadStore {
  loadFbsTeamIds(season: number): Promise<string[]>;
}

export interface TalentProbeProviderClient {
  fetchTalent(season: number): Promise<{
    rows: RawTalentRow[];
    endpoint: string;
  }>;
}

export function createPrismaTalentProbeReadStore(
  prisma: PrismaClient
): TalentProbeReadStore {
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

export function createCfbdTalentProbeProvider(): TalentProbeProviderClient {
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

export async function runTalentAvailabilityProbe(options: {
  season: number;
  store?: TalentProbeReadStore;
  provider?: TalentProbeProviderClient;
  resolveTeamId?: (name: string) => string | null;
  prisma?: PrismaClient;
}): Promise<{ exitCode: number }> {
  if (options.season !== TARGET_SEASON) {
    console.error(
      `[talent-availability-probe] season must be ${TARGET_SEASON}`
    );
    return { exitCode: 1 };
  }

  console.log('[talent-availability-probe] mode=READ_ONLY');
  console.log(`[talent-availability-probe] season=${options.season}`);
  console.log(
    '[talent-availability-probe] providerBudget=1 endpoint=/talent?year=2026 mutations=false ratings=false odds=false'
  );

  const ownsPrisma = !options.prisma && !options.store;
  const prisma =
    options.prisma ?? (options.store ? undefined : new PrismaClient());
  const store =
    options.store ??
    (prisma ? createPrismaTalentProbeReadStore(prisma) : undefined);
  const provider = options.provider ?? createCfbdTalentProbeProvider();

  if (!store) {
    console.error('[talent-availability-probe] Missing read store');
    return { exitCode: 1 };
  }

  const sharedResolver = options.resolveTeamId ? null : new TeamResolver();
  const resolver =
    options.resolveTeamId ??
    ((name: string) =>
      sharedResolver!.resolveTeam(name, 'college-football', {
        provider: 'cfbd',
      }));

  try {
    const fbsIds = await store.loadFbsTeamIds(TARGET_SEASON);

    const talentResp = await provider.fetchTalent(TARGET_SEASON);
    const providerRequestCount = 1;

    console.log(
      `[talent-availability-probe] CFBD requestCount=${providerRequestCount} endpoint=${talentResp.endpoint}`
    );

    const result = buildTalentAvailabilityProbe({
      fbsIds,
      talentRaw: talentResp.rows,
      resolveTeamId: resolver,
      providerRequestCount,
      endpoint: talentResp.endpoint,
      requestedSeason: TARGET_SEASON,
    });

    console.log(formatTalentAvailabilityProbeReport(result));
    console.log(
      '[talent-availability-probe] COMPLETE — talent availability probed; persistence/ratings not authorized'
    );
    return { exitCode: 0 };
  } catch (err) {
    console.error(
      `[talent-availability-probe] ${sanitizeTalentAvailabilityProbeError(err)}`
    );
    return { exitCode: 1 };
  } finally {
    if (ownsPrisma && prisma) await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const parsed = parseTalentAvailabilityProbeArgs(process.argv.slice(2));
  if (parsed.ok === false) {
    for (const e of parsed.errors) {
      console.error(`[talent-availability-probe] ${e}`);
    }
    console.error(
      'Usage: npx tsx apps/jobs/probe-2026-talent-availability.ts --season 2026 --preview'
    );
    process.exit(1);
  }
  const { exitCode } = await runTalentAvailabilityProbe({
    season: parsed.season,
  });
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(
      `[talent-availability-probe] ${sanitizeTalentAvailabilityProbeError(err)}`
    );
    process.exit(1);
  });
}
