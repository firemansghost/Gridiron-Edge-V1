#!/usr/bin/env node

/**
 * Manual Week 9 Odds Insertion Script
 * 
 * This script fetches odds from the Odds API and inserts them into the database
 * by looking up the actual game IDs from the database instead of generating them.
 */

const { PrismaClient } = require('@prisma/client');
const https = require('https');

const prisma = new PrismaClient();

async function fetchOddsFromAPI() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('ODDS_API_KEY environment variable is required');
  }

  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds?apiKey=${apiKey}&regions=us&markets=spreads,totals&oddsFormat=american`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('🚀 Manual Week 9 Odds Insertion');
  console.log('================================\n');

  // Fetch odds from API
  console.log('📥 Fetching odds from Odds API...');
  const events = await fetchOddsFromAPI();
  console.log(`✅ Fetched ${events.length} events\n`);

  // Get all Week 9 games from database
  console.log('📊 Loading Week 9 games from database...');
  const games = await prisma.game.findMany({
    where: { season: 2025, week: 9 },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } }
    }
  });
  console.log(`✅ Found ${games.length} games in database\n`);

  // Create a lookup map
  const gameMap = new Map();
  games.forEach(game => {
    const key = `${game.awayTeamId}|${game.homeTeamId}`;
    gameMap.set(key, game);
  });

  // Process events and match to games
  const marketLines = [];
  let matchedGames = 0;
  let unmatchedEvents = 0;

  for (const event of events) {
    // Try to match by team names (simplified matching)
    const awaySlug = event.away_team.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const homeSlug = event.home_team.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    
    // Try to find matching game
    let matchedGame = null;
    for (const [key, game] of gameMap.entries()) {
      const [dbAway, dbHome] = key.split('|');
      if (dbAway.includes(awaySlug.split('-')[0]) && dbHome.includes(homeSlug.split('-')[0])) {
        matchedGame = game;
        break;
      }
    }

    if (!matchedGame) {
      console.log(`⚠️  No match: ${event.away_team} @ ${event.home_team}`);
      unmatchedEvents++;
      continue;
    }

    matchedGames++;

    // Extract odds
    for (const bookmaker of event.bookmakers) {
      const bookName = bookmaker.title;
      const timestamp = new Date(bookmaker.last_update);

      for (const market of bookmaker.markets) {
        if (market.key === 'spreads') {
          for (const outcome of market.outcomes) {
            marketLines.push({
              gameId: matchedGame.id,
              season: 2025,
              week: 9,
              lineType: 'spread',
              lineValue: outcome.point,
              closingLine: outcome.point,
              bookName,
              source: 'oddsapi',
              timestamp
            });
          }
        } else if (market.key === 'totals') {
          for (const outcome of market.outcomes) {
            marketLines.push({
              gameId: matchedGame.id,
              season: 2025,
              week: 9,
              lineType: 'total',
              lineValue: outcome.point,
              closingLine: outcome.point,
              bookName,
              source: 'oddsapi',
              timestamp
            });
          }
        }
      }
    }
  }

  console.log(`\n📊 Matching results:`);
  console.log(`   Matched: ${matchedGames} games`);
  console.log(`   Unmatched: ${unmatchedEvents} events`);
  console.log(`   Market lines: ${marketLines.length}\n`);

  if (marketLines.length === 0) {
    console.log('❌ No market lines to insert');
    return;
  }

  // Insert into database
  console.log('💾 Inserting market lines into database...');
  const result = await prisma.marketLine.createMany({
    data: marketLines,
    skipDuplicates: true
  });

  console.log(`✅ Inserted ${result.count} market lines\n`);

  // Verify
  const count = await prisma.marketLine.count({
    where: { season: 2025, week: 9 }
  });
  console.log(`📊 Total Week 9 odds rows in database: ${count}`);
  console.log('\n🎉 Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

