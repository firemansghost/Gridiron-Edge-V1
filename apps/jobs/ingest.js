#!/usr/bin/env node

/**
 * M5 Data Ingestion CLI
 * 
 * Command: npm run ingest -- <adapter> --season 2024 --weeks 1-2
 * 
 * Ingests data from specified adapter and populates database.
 * Then runs ratings + implied lines on the ingested data.
 */

const { PrismaClient } = require('@prisma/client');
const { AdapterFactory } = require('./adapters/AdapterFactory');
const { main: runRatings } = require('./seed-ratings');

const prisma = new PrismaClient();

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    adapter: null,
    season: null,
    weeks: [],
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--season') {
      options.season = parseInt(args[++i]);
    } else if (arg === '--weeks') {
      const weekStr = args[++i];
      if (weekStr.includes('-')) {
        const [start, end] = weekStr.split('-').map(Number);
        options.weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      } else {
        options.weeks = weekStr.split(',').map(Number);
      }
    } else if (!arg.startsWith('--')) {
      options.adapter = arg;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
M5 Data Ingestion CLI

Usage: npm run ingest -- <adapter> --season <year> --weeks <week-range>

Arguments:
  adapter          Data source adapter to use (mock, espn, etc.)
  --season <year>  Season year (e.g., 2024)
  --weeks <range>  Week range (e.g., 1-2, 1,3,5)
  --help, -h       Show this help message

Examples:
  npm run ingest -- mock --season 2024 --weeks 1-2
  npm run ingest -- mock --season 2024 --weeks 1,3,5
  npm run ingest -- mock --season 2024 --weeks 1

Available adapters:
  mock             Mock data source (reads from /data/ directory)
  espn             ESPN API (not yet implemented)
  odds-api         Odds API (not yet implemented)
`);
}

/**
 * Normalize team ID for consistency
 */
function normalizeId(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Upsert teams from adapter data
 */
async function upsertTeams(teams) {
  let upserted = 0;
  const teamIds = new Set();

  for (const team of teams) {
    const teamId = normalizeId(team.id);
    teamIds.add(teamId);

    await prisma.team.upsert({
      where: { id: teamId },
      update: {
        name: team.name,
        conference: team.conference,
        division: team.division || null,
        logoUrl: team.logoUrl || null,
        primaryColor: team.primaryColor || null,
        secondaryColor: team.secondaryColor || null
      },
      create: {
        id: teamId,
        name: team.name,
        conference: team.conference,
        division: team.division || null,
        logoUrl: team.logoUrl || null,
        primaryColor: team.primaryColor || null,
        secondaryColor: team.secondaryColor || null
      }
    });

    upserted++;
  }

  return { upserted, teamIds };
}

/**
 * Upsert games from adapter data
 */
async function upsertGames(games, existingTeamIds) {
  let upserted = 0;

  for (const game of games) {
    const gameId = normalizeId(game.id);
    const homeId = normalizeId(game.homeTeamId);
    const awayId = normalizeId(game.awayTeamId);

    // Check if teams exist, create stubs if needed
    if (!existingTeamIds.has(homeId)) {
      await prisma.team.upsert({
        where: { id: homeId },
        update: {},
        create: {
          id: homeId,
          name: homeId.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' '),
          conference: 'Independent',
          division: null,
          logoUrl: null,
          primaryColor: null,
          secondaryColor: null
        }
      });
      existingTeamIds.add(homeId);
    }

    if (!existingTeamIds.has(awayId)) {
      await prisma.team.upsert({
        where: { id: awayId },
        update: {},
        create: {
          id: awayId,
          name: awayId.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' '),
          conference: 'Independent',
          division: null,
          logoUrl: null,
          primaryColor: null,
          secondaryColor: null
        }
      });
      existingTeamIds.add(awayId);
    }

    await prisma.game.upsert({
      where: { id: gameId },
      update: {
        homeTeamId: homeId,
        awayTeamId: awayId,
        season: game.season,
        week: game.week,
        date: game.date,
        status: game.status,
        venue: game.venue,
        city: game.city,
        neutralSite: game.neutralSite,
        conferenceGame: game.conferenceGame,
        homeScore: game.homeScore || null,
        awayScore: game.awayScore || null
      },
      create: {
        id: gameId,
        homeTeamId: homeId,
        awayTeamId: awayId,
        season: game.season,
        week: game.week,
        date: game.date,
        status: game.status,
        venue: game.venue,
        city: game.city,
        neutralSite: game.neutralSite,
        conferenceGame: game.conferenceGame,
        homeScore: game.homeScore || null,
        awayScore: game.awayScore || null
      }
    });

    upserted++;
  }

  return upserted;
}

/**
 * Upsert market lines from adapter data
 */
async function upsertMarketLines(marketLines) {
  let upserted = 0;

  for (const line of marketLines) {
    const gameId = normalizeId(line.gameId);

    await prisma.marketLine.upsert({
      where: {
        gameId_lineType: {
          gameId,
          lineType: line.lineType
        }
      },
      update: {
        season: line.season || 2024,
        week: line.week || 1,
        openingLine: line.openingLine,
        closingLine: line.closingLine,
        timestamp: line.timestamp,
        bookName: line.bookName
      },
      create: {
        gameId,
        season: line.season || 2024,
        week: line.week || 1,
        lineType: line.lineType,
        openingLine: line.openingLine,
        closingLine: line.closingLine,
        timestamp: line.timestamp,
        bookName: line.bookName
      }
    });

    upserted++;
  }

  return upserted;
}

/**
 * Main ingestion function
 */
async function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      return;
    }

    // Validate arguments
    if (!options.adapter) {
      console.error('Error: Adapter name is required');
      showHelp();
      process.exit(1);
    }

    if (!options.season) {
      console.error('Error: Season is required');
      showHelp();
      process.exit(1);
    }

    if (options.weeks.length === 0) {
      console.error('Error: Weeks are required');
      showHelp();
      process.exit(1);
    }

    console.log(`🚀 Starting data ingestion...`);
    console.log(`   Adapter: ${options.adapter}`);
    console.log(`   Season: ${options.season}`);
    console.log(`   Weeks: ${options.weeks.join(', ')}`);

    // Create adapter
    const factory = new AdapterFactory();
    const adapter = await factory.createAdapter(options.adapter);

    console.log(`✅ Using adapter: ${adapter.getName()}`);

    // Check if adapter is available
    if (!(await adapter.isAvailable())) {
      throw new Error(`Adapter '${options.adapter}' is not available`);
    }

    // Fetch data from adapter
    console.log('📥 Fetching teams...');
    const teams = await adapter.getTeams(options.season);
    console.log(`   Found ${teams.length} teams`);

    console.log('📥 Fetching schedules...');
    const games = await adapter.getSchedules(options.season, options.weeks);
    console.log(`   Found ${games.length} games`);

    console.log('📥 Fetching market lines...');
    const marketLines = await adapter.getMarketLines(options.season, options.weeks);
    console.log(`   Found ${marketLines.length} market lines`);

    // Upsert data to database
    console.log('💾 Upserting teams...');
    const { upserted: teamsUpserted, teamIds } = await upsertTeams(teams);
    console.log(`   Upserted ${teamsUpserted} teams`);

    console.log('💾 Upserting games...');
    const gamesUpserted = await upsertGames(games, teamIds);
    console.log(`   Upserted ${gamesUpserted} games`);

    console.log('💾 Upserting market lines...');
    const marketLinesUpserted = await upsertMarketLines(marketLines);
    console.log(`   Upserted ${marketLinesUpserted} market lines`);

    console.log('✅ Data ingestion completed successfully!');

    // Run ratings and implied lines on the ingested data
    console.log('🧮 Running ratings and implied lines...');
    await runRatings();

    console.log('🎉 Ingestion and processing completed!');

  } catch (error) {
    console.error('❌ Error during ingestion:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
