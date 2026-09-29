/**
 * Betting Ticket Odds Refresh V1 — production read-only planner CLI.
 *
 * Reads:
 * - active-week Game rows
 * - recent MarketLine coverage
 *
 * Writes:
 * - JSON report file only
 * - GitHub step outputs when GITHUB_OUTPUT is present
 *
 * Provider calls: 0
 * DB writes: 0
 */

import * as fs from 'fs';
import * as path from 'path';
import { LineType, PrismaClient } from '@prisma/client';
import {
  BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES,
  planBettingTicketOddsRefresh,
  type BettingTicketOddsRefreshFrame,
} from './src/betting-ticket-odds-refresh-v1';

interface Args {
  season: number;
  week: number;
  reportPath: string;
}

function parseArgs(argv: string[]): Args {
  let season = NaN;
  let week = NaN;
  let reportPath = '';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--season') season = Number(argv[++i]);
    else if (arg === '--week') week = Number(argv[++i]);
    else if (arg === '--report') reportPath = argv[++i] ?? '';
  }

  if (!Number.isInteger(season) || season !== 2026) {
    throw new Error('season must equal 2026');
  }
  if (!Number.isInteger(week) || week < 1) {
    throw new Error('week must be a positive integer');
  }
  if (!reportPath) {
    reportPath = path.join(
      process.cwd(),
      'reports',
      `betting-ticket-odds-refresh-v1-2026-week-${week}-PLAN.json`
    );
  }

  return { season, week, reportPath };
}

function writeGithubOutputs(values: Record<string, string>): void {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(target, `${lines.join('\n')}\n`, 'utf8');
}

function writeReport(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2), 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error('DIRECT_URL required');

  console.log('============================================================');
  console.log('BETTING TICKET ODDS REFRESH V1 — PLAN');
  console.log('============================================================');
  console.log(`season=${args.season} week=${args.week}`);
  console.log(`staleAfterMinutes=${BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES}`);
  console.log('providerCalls=0 databaseWrites=false');
  console.log('ODDS_API_KEY: not provided');

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const now = new Date();
    const recentCutoff = new Date(
      now.getTime() - BETTING_TICKET_ODDS_REFRESH_STALE_MINUTES * 60_000
    );

    const games = await prisma.game.findMany({
      where: {
        season: args.season,
        week: args.week,
        status: 'scheduled',
        date: { gt: now },
      },
      select: {
        id: true,
        date: true,
        status: true,
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    const gameIds = games.map((game) => game.id);

    const recentLines =
      gameIds.length === 0
        ? []
        : await prisma.marketLine.findMany({
            where: {
              gameId: { in: gameIds },
              timestamp: { gte: recentCutoff },
              lineType: { in: [LineType.spread, LineType.total, LineType.moneyline] },
            },
            select: {
              gameId: true,
              lineType: true,
            },
          });

    const recentByGame = new Map<string, Set<string>>();
    for (const row of recentLines) {
      const markets = recentByGame.get(row.gameId) ?? new Set<string>();
      markets.add(String(row.lineType));
      recentByGame.set(row.gameId, markets);
    }

    const frames: BettingTicketOddsRefreshFrame[] = games.map((game) => ({
      gameId: game.id,
      kickoffIso: game.date.toISOString(),
      status: String(game.status),
      recentMarketTypes: [...(recentByGame.get(game.id) ?? new Set<string>())],
    }));

    const plan = planBettingTicketOddsRefresh({ now, frames });
    const report = {
      capability: 'betting_ticket_odds_refresh_v1',
      stage: 'PLAN',
      season: args.season,
      week: args.week,
      repoCommitSha: process.env.GITHUB_SHA ?? null,
      githubRef: process.env.GITHUB_REF ?? null,
      ...plan,
      providerCallsAttempted: 0,
      providerCallsSucceeded: 0,
      databaseReads: true,
      databaseWrites: false,
      betWrites: false,
      modelWrites: false,
      marketLineWrites: false,
      t30Writes: false,
      prismaMigrateInvoked: false,
    };

    writeReport(args.reportPath, report);
    writeGithubOutputs({
      should_refresh: plan.shouldRefresh ? 'true' : 'false',
      outcome: plan.outcome,
      write_safe: plan.writeSafe ? 'true' : 'false',
      future_games: String(plan.futureScheduledGameCount),
      stale_games: String(plan.staleGameIds.length),
      handoff_games: String(plan.handoffGameIds.length),
    });

    console.log(
      `outcome=${plan.outcome} shouldRefresh=${plan.shouldRefresh} futureGames=${plan.futureScheduledGameCount} staleGames=${plan.staleGameIds.length} handoffGames=${plan.handoffGameIds.length}`
    );
    if (plan.staleGameIds.length > 0) {
      console.log(`staleGameIds=${plan.staleGameIds.join(',')}`);
    }
    if (plan.handoffGameIds.length > 0) {
      console.log(`t30HandoffGameIds=${plan.handoffGameIds.join(',')}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
