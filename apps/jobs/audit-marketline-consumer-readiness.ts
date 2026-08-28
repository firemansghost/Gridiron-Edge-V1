/**
 * READ-ONLY audit: 2026 MarketLine consumer readiness (append-only snapshots).
 * SELECT only. No Odds / CFBD / SGO keys. No writes.
 *
 * Usage:
 *   npx tsx apps/jobs/audit-marketline-consumer-readiness.ts --season 2026 --week 1
 */

import { PrismaClient } from '@prisma/client';
import {
  indexGameMarketSelections,
  type MarketLineObservation,
} from '../web/lib/market-line-snapshot';
import { evaluateMarketlineConsumerReadiness } from '../web/lib/marketline-consumer-readiness';

function parseArgs(argv: string[]): { season: number; week: number } {
  let season = 2026;
  let week = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--season' && argv[i + 1]) season = Number(argv[++i]);
    if (argv[i] === '--week' && argv[i + 1]) week = Number(argv[++i]);
  }
  if (!Number.isFinite(season) || !Number.isFinite(week)) {
    throw new Error('Invalid --season / --week');
  }
  return { season, week };
}

async function main() {
  const { season, week } = parseArgs(process.argv.slice(2));
  const url = process.env.DIRECT_URL;
  if (!url) {
    console.error('DIRECT_URL required (read-only SELECT)');
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const games = await prisma.game.findMany({
      where: { season, week },
      select: {
        id: true,
        date: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    });

    const lines = await prisma.marketLine.findMany({
      where: { season, week },
      select: {
        id: true,
        gameId: true,
        lineType: true,
        lineValue: true,
        closingLine: true,
        bookName: true,
        timestamp: true,
        teamId: true,
        source: true,
      },
    });

    const books = new Set(lines.map((l) => l.bookName));
    const byType = {
      spread: lines.filter((l) => l.lineType === 'spread').length,
      total: lines.filter((l) => l.lineType === 'total').length,
      moneyline: lines.filter((l) => l.lineType === 'moneyline').length,
    };

    const observations: MarketLineObservation[] = lines.map((l) => ({
      id: l.id,
      gameId: l.gameId,
      lineType: l.lineType,
      lineValue: Number(l.lineValue),
      closingLine:
        l.closingLine !== null && l.closingLine !== undefined
          ? Number(l.closingLine)
          : null,
      bookName: l.bookName,
      timestamp: l.timestamp,
      teamId: l.teamId ?? null,
      source: l.source ?? null,
    }));

    const selections = indexGameMarketSelections({
      rows: observations,
      games: games.map((g) => ({
        gameId: g.id,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        kickoff: g.date,
        status: g.status,
      })),
    });

    const readiness = evaluateMarketlineConsumerReadiness(
      games.map((g) => ({
        gameId: g.id,
        selection: selections.get(g.id),
      }))
    );

    let incoherentPairs = 0;
    let sameTsTies = 0;
    const gameReports: Array<Record<string, unknown>> = [];

    for (const g of games) {
      const sel = selections.get(g.id);
      const gate = readiness.gameResults.find((r) => r.gameId === g.id);
      if (!sel || !gate) {
        gameReports.push({
          gameId: g.id,
          matchup: `${g.awayTeam.name} @ ${g.homeTeam.name}`,
          error: 'no selection',
          structurallySelectable: false,
        });
        continue;
      }

      incoherentPairs +=
        sel.incoherentSpreads.length + sel.incoherentMoneylines.length;
      sameTsTies += sel.sameTimestampTies;

      gameReports.push({
        gameId: g.id,
        matchup: `${g.awayTeam.name} @ ${g.homeTeam.name}`,
        status: g.status,
        mode: sel.mode,
        spreadBooks: sel.spreadByBook.length,
        totalBooks: sel.totalByBook.length,
        mlBooks: sel.moneylineByBook.length,
        displaySpreadHma: sel.displaySpread?.marketSpreadHma ?? null,
        displaySpreadBook: sel.displaySpread?.bookName ?? null,
        displayTotal: sel.displayTotal?.total ?? null,
        spreadConsensusHma: sel.spreadConsensus.value,
        totalConsensus: sel.totalConsensus.value,
        incoherentSpreads: sel.incoherentSpreads.length,
        incoherentMoneylines: sel.incoherentMoneylines.length,
        sameTimestampTies: sel.sameTimestampTies,
        hasRequiredMarkets: gate.hasRequiredMarkets,
        structurallySelectable: gate.structurallySelectable,
      });
    }

    const summary = {
      audit: '2026 MarketLine Consumer Readiness',
      readOnly: true,
      providerCalls: 0,
      writes: 0,
      season,
      week,
      games: games.length,
      rows: lines.length,
      books: books.size,
      byType,
      selectableGames: readiness.selectableGames,
      gamesMissingCoherentSpread: readiness.gamesMissingCoherentSpread,
      gamesMissingCoherentTotal: readiness.gamesMissingCoherentTotal,
      gamesMissingCoherentMl: readiness.gamesMissingCoherentMl,
      allGamesHaveCoherentSpread: readiness.allGamesHaveCoherentSpread,
      allGamesHaveTotal: readiness.allGamesHaveTotal,
      allGamesHaveCoherentMoneyline: readiness.allGamesHaveCoherentMoneyline,
      incoherentPairs,
      sameTimestampTies: sameTsTies,
      allGamesStructurallySelectable: readiness.allGamesStructurallySelectable,
      pass: readiness.pass,
      week1Expected:
        season === 2026 && week === 1
          ? {
              expectedGames: 51,
              expectedRows: 2281,
              expectedBooks: 11,
              matchGames: games.length === 51,
              matchRows: lines.length === 2281,
              matchBooks: books.size === 11,
            }
          : null,
    };

    console.log(JSON.stringify({ summary, games: gameReports }, null, 2));

    if (!readiness.pass) {
      console.error(
        `Consumer readiness FAIL: selectable=${readiness.selectableGames}/${games.length}; ` +
          `missingSpread=${readiness.gamesMissingCoherentSpread} ` +
          `missingTotal=${readiness.gamesMissingCoherentTotal} ` +
          `missingMl=${readiness.gamesMissingCoherentMl}`
      );
      process.exitCode = 2;
    }

    if (season === 2026 && week === 1) {
      if (games.length !== 51 || lines.length !== 2281 || books.size !== 11) {
        console.error(
          `Week1 inventory mismatch: games=${games.length} rows=${lines.length} books=${books.size} (expected 51/2281/11)`
        );
        process.exitCode = 2;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
