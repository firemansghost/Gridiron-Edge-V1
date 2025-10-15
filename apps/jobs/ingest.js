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

// Safe error message helper for JS runtime (no TypeScript casts)
const errMsg = (e) => (e && e instanceof Error) ? e.message : String(e);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    adapter: null,
    season: null,
    weeks: [],
    startDate: null,
    endDate: null,
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
    } else if (arg === '--startDate') {
      options.startDate = args[++i];
    } else if (arg === '--endDate') {
      options.endDate = args[++i];
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
  cfbd             CollegeFootballData API (schedules only, requires CFBD_API_KEY)
  sgo              SportsGameOdds API (odds only, requires SGO_API_KEY)
  weatherVc        Visual Crossing Weather API (logs only, requires VISUALCROSSING_API_KEY)
  espn             ESPN API (not yet implemented)
  oddsApi          Odds API (not yet implemented)
  sportsReference  Sports Reference (not yet implemented)

Notes:
  - CFBD adapter provides real schedules with venue/city details
  - SGO adapter only provides odds/lines, not schedules or teams
  - Weather adapters only log data, do not write to database (no weather table yet)
  - For full ingestion, run cfbd adapter first, then sgo for odds, then weatherVc
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
  let deduplicated = 0;
  const teamIds = new Set();

  // Step 1: In-memory de-duplication
  const dedupMap = new Map();
  
  for (const team of teams) {
    const teamId = normalizeId(team.id);
    teamIds.add(teamId);
    
    // Create dedup key: id
    const dedupKey = teamId;
    
    // Keep only the latest record per key (if duplicates appear)
    const existing = dedupMap.get(dedupKey);
    if (!existing || new Date(team.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      dedupMap.set(dedupKey, {
        id: teamId,
        name: team.name,
        conference: team.conference,
        division: team.division || null,
        logoUrl: team.logoUrl || null,
        primaryColor: team.primaryColor || null,
        secondaryColor: team.secondaryColor || null,
        mascot: team.mascot || null,
        city: team.city || null,
        state: team.state || null
      });
    } else {
      deduplicated++;
    }
  }

  console.log(`   [DEDUP] Removed ${deduplicated} duplicate teams, ${dedupMap.size} unique teams remaining`);

  // Step 2: Chunked upserts (500 records per batch)
  const chunkSize = 500;
  const uniqueTeams = Array.from(dedupMap.values());
  
  for (let i = 0; i < uniqueTeams.length; i += chunkSize) {
    const chunk = uniqueTeams.slice(i, i + chunkSize);
    
    try {
      await prisma.team.createMany({
        data: chunk,
        skipDuplicates: true // Skip duplicates at DB level
      });
      upserted += chunk.length;
    } catch (error) {
      // If chunk fails, try individual records to identify problematic ones
      console.warn(`   ⚠️  Team chunk upsert failed, trying individual records...`);
      
      for (const team of chunk) {
        try {
          await prisma.team.create({
            data: team
          });
          upserted++;
        } catch (teamError) {
          console.warn(`   ⚠️  Skipped team due to error: ${errMsg(teamError)}`);
        }
      }
    }
  }

  // Step 3: Light update pass for mutable fields (small batches)
  const updateChunkSize = 100;
  for (let i = 0; i < uniqueTeams.length; i += updateChunkSize) {
    const updateChunk = uniqueTeams.slice(i, i + updateChunkSize);
    
    for (const team of updateChunk) {
      try {
        await prisma.team.updateMany({
          where: { id: team.id },
          data: {
            name: team.name,
            conference: team.conference,
            division: team.division,
            city: team.city,
            state: team.state,
            mascot: team.mascot,
            logoUrl: team.logoUrl,
            primaryColor: team.primaryColor,
            secondaryColor: team.secondaryColor
          }
        });
      } catch (error) {
        // Skip update errors gracefully
      }
    }
  }

  console.log(`   ✅ Upserted ${upserted} teams in chunks of ${chunkSize}`);
  return { upserted, teamIds };
}

/**
 * Upsert games from adapter data
 */
async function upsertGames(games, existingTeamIds) {
  let upserted = 0;
  let deduplicated = 0;

  // Step 1: In-memory de-duplication
  const dedupMap = new Map();
  
  for (const game of games) {
    const gameId = normalizeId(game.id);
    const homeId = normalizeId(game.homeTeamId);
    const awayId = normalizeId(game.awayTeamId);
    
    // Create dedup key: id
    const dedupKey = gameId;
    
    // Keep only the latest record per key (if duplicates appear)
    const existing = dedupMap.get(dedupKey);
    if (!existing || new Date(game.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
      dedupMap.set(dedupKey, {
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
      });
    } else {
      deduplicated++;
    }
  }

  console.log(`   [DEDUP] Removed ${deduplicated} duplicate games, ${dedupMap.size} unique games remaining`);

  // Step 2: Ensure teams exist (create stubs if needed)
  const teamsToCreate = new Set();
  const uniqueGames = Array.from(dedupMap.values());
  
  for (const game of uniqueGames) {
    if (!existingTeamIds.has(game.homeTeamId)) {
      teamsToCreate.add(game.homeTeamId);
    }
    if (!existingTeamIds.has(game.awayTeamId)) {
      teamsToCreate.add(game.awayTeamId);
    }
  }

  // Create missing teams in chunks
  if (teamsToCreate.size > 0) {
    const teamChunks = Array.from(teamsToCreate).reduce((chunks, teamId, index) => {
      const chunkIndex = Math.floor(index / 100);
      if (!chunks[chunkIndex]) chunks[chunkIndex] = [];
      chunks[chunkIndex].push({
        id: teamId,
        name: teamId.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' '),
        conference: 'Independent',
        division: null,
        logoUrl: null,
        primaryColor: null,
        secondaryColor: null
      });
      return chunks;
    }, []);

    for (const teamChunk of teamChunks) {
      try {
        await prisma.team.createMany({
          data: teamChunk,
          skipDuplicates: true
        });
        teamChunk.forEach(team => existingTeamIds.add(team.id));
      } catch (error) {
        console.warn(`   ⚠️  Team creation chunk failed: ${errMsg(error)}`);
      }
    }
  }

  // Step 3: Chunked upserts for games (500 records per batch)
  const chunkSize = 500;
  
  for (let i = 0; i < uniqueGames.length; i += chunkSize) {
    const chunk = uniqueGames.slice(i, i + chunkSize);
    
    try {
      await prisma.game.createMany({
        data: chunk,
        skipDuplicates: true // Skip duplicates at DB level
      });
      upserted += chunk.length;
    } catch (error) {
      // If chunk fails, try individual records to identify problematic ones
      console.warn(`   ⚠️  Game chunk upsert failed, trying individual records...`);
      
      for (const game of chunk) {
        try {
          await prisma.game.create({
            data: game
          });
          upserted++;
        } catch (gameError) {
          console.warn(`   ⚠️  Skipped game due to error: ${errMsg(gameError)}`);
        }
      }
    }
  }

  // Step 4: Light update pass for mutable fields (small batches)
  const updateChunkSize = 100;
  for (let i = 0; i < uniqueGames.length; i += updateChunkSize) {
    const updateChunk = uniqueGames.slice(i, i + updateChunkSize);
    
    for (const game of updateChunk) {
      try {
        await prisma.game.updateMany({
          where: { id: game.id },
          data: {
            date: game.date,
            venue: game.venue,
            neutralSite: game.neutralSite,
            conferenceGame: game.conferenceGame,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            status: game.status
          }
        });
      } catch (error) {
        // Skip update errors gracefully
      }
    }
  }

  console.log(`   ✅ Upserted ${upserted} games in chunks of ${chunkSize}`);
  return upserted;
}

/**
 * Upsert market lines from adapter data
 */
async function upsertMarketLines(marketLines) {
  let upserted = 0;
  let skipped = 0;
  let deduplicated = 0;

  // Step 1: In-memory de-duplication
  const dedupMap = new Map();
  
  for (const line of marketLines) {
    const gameId = normalizeId(line.gameId);
    
    // Create dedup key: gameId + lineType + bookName + source + timestamp
    const dedupKey = `${gameId}|${line.lineType}|${line.bookName || ''}|${line.source || ''}|${line.timestamp || ''}`;
    
    // Keep only the latest record per key (if duplicates appear)
    const existing = dedupMap.get(dedupKey);
    if (!existing || new Date(line.timestamp) > new Date(existing.timestamp)) {
      dedupMap.set(dedupKey, {
        gameId,
        season: line.season || 2024,
        week: line.week || 1,
        lineType: line.lineType,
        lineValue: line.lineValue !== undefined ? line.lineValue : line.openingLine,
        closingLine: line.closingLine,
        timestamp: line.timestamp,
        source: line.source || line.bookName,
        bookName: line.bookName
      });
    } else {
      deduplicated++;
    }
  }

  console.log(`   [DEDUP] Removed ${deduplicated} duplicate lines, ${dedupMap.size} unique lines remaining`);

  // Step 2: Chunked upserts (500 records per batch)
  const chunkSize = 500;
  const uniqueLines = Array.from(dedupMap.values());
  
  for (let i = 0; i < uniqueLines.length; i += chunkSize) {
    const chunk = uniqueLines.slice(i, i + chunkSize);
    
    try {
      await prisma.marketLine.createMany({
        data: chunk,
        skipDuplicates: true // Skip duplicates at DB level
      });
      upserted += chunk.length;
    } catch (error) {
      // If chunk fails, try individual records to identify problematic ones
      console.warn(`   ⚠️  Chunk upsert failed, trying individual records...`);
      
      for (const line of chunk) {
        try {
          await prisma.marketLine.create({
            data: line
          });
          upserted++;
        } catch (lineError) {
          // Skip lines for games that don't exist (foreign key constraint)
          if (errMsg(lineError).includes('Foreign key constraint')) {
            skipped++;
          } else {
            console.warn(`   ⚠️  Skipped line due to error: ${errMsg(lineError)}`);
            skipped++;
          }
        }
      }
    }
  }

  if (skipped > 0) {
    console.log(`   ⚠️  Skipped ${skipped} lines (game not found in database)`);
  }

  console.log(`   ✅ Upserted ${upserted} market lines in chunks of ${chunkSize}`);
  return upserted;
}

/**
 * Upsert team branding data
 */
async function upsertTeamBranding(teamBranding) {
  let upserted = 0;

  for (const branding of teamBranding) {
    const teamId = normalizeId(branding.id);

    // Only update non-null fields
    const updateData = {};
    if (branding.name) updateData.name = branding.name;
    if (branding.conference) updateData.conference = branding.conference;
    if (branding.division !== null) updateData.division = branding.division;
    if (branding.city) updateData.city = branding.city;
    if (branding.state) updateData.state = branding.state;
    if (branding.mascot) updateData.mascot = branding.mascot;
    if (branding.logoUrl) updateData.logoUrl = branding.logoUrl;
    if (branding.primaryColor) updateData.primaryColor = branding.primaryColor;
    if (branding.secondaryColor) updateData.secondaryColor = branding.secondaryColor;

    await prisma.team.upsert({
      where: { id: teamId },
      update: updateData,
      create: {
        id: teamId,
        name: branding.name || titleCase(teamId),
        conference: branding.conference || 'Independent',
        division: branding.division,
        city: branding.city,
        state: branding.state,
        mascot: branding.mascot,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor
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

    // CI safety guard: trim excessive week ranges in GitHub Actions
    if (process.env.GITHUB_ACTIONS === 'true' && options.weeks.length > 2) {
      console.warn(`[CI GUARD] Too many weeks requested in CI (${options.weeks.length}); trimming to first week only: ${options.weeks[0]}`);
      options.weeks = [options.weeks[0]];
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

    // Special handling for weather adapters (they don't follow standard flow)
    if (options.adapter === 'weatherVc' || adapter.getName() === 'VisualCrossing') {
      if (typeof adapter.fetchWeatherForGames === 'function') {
        await adapter.fetchWeatherForGames(options.season, options.weeks);
        console.log('✅ Weather fetch completed!');
        return; // Skip standard ingestion flow
      }
    }

    // Fetch data from adapter
    console.log('📥 Fetching teams...');
    const teams = await adapter.getTeams(options.season);
    console.log(`   Found ${teams.length} teams`);

    console.log('📥 Fetching schedules...');
    const games = await adapter.getSchedules(options.season, options.weeks);
    console.log(`   Found ${games.length} games`);

    console.log('📥 Fetching market lines...');
    const dateOptions = {};
    if (options.startDate) dateOptions.startDate = options.startDate;
    if (options.endDate) dateOptions.endDate = options.endDate;
    const marketLines = await adapter.getMarketLines(options.season, options.weeks, Object.keys(dateOptions).length > 0 ? dateOptions : undefined);
    console.log(`   Found ${marketLines.length} market lines`);
    
    // Check if SGO returned zero lines
    if (options.adapter === 'sgo' && marketLines.length === 0) {
      console.warn('[SGO] No odds inserted. Will rely on fallback (if configured).');
    }

    // Upsert data to database
    console.log('💾 Upserting teams...');
    const { upserted: teamsUpserted, teamIds } = await upsertTeams(teams);
    console.log(`   Upserted ${teamsUpserted} teams`);

    console.log('💾 Upserting games...');
    const gamesUpserted = await upsertGames(games, teamIds);
    console.log(`   Upserted ${gamesUpserted} games`);

    console.log('💾 Upserting market lines...');
    let marketLinesUpserted = await upsertMarketLines(marketLines);
    console.log(`   Upserted ${marketLinesUpserted} market lines`);
    
    // Automatic fallback: Odds API → SGO (for live 2025 data)
    if (options.adapter === 'oddsapi' && marketLinesUpserted === 0 && process.env.SGO_API_KEY) {
      console.warn('⚠️  Odds API returned 0 market lines. Engaging SGO fallback...');
      
      try {
        const sgoFactory = new AdapterFactory();
        const sgoAdapter = await sgoFactory.createAdapter('sgo');
        
        console.log('📥 Fetching market lines from SGO...');
        const fallbackMarketLines = await sgoAdapter.getMarketLines(options.season, options.weeks, Object.keys(dateOptions).length > 0 ? dateOptions : undefined);
        console.log(`   Found ${fallbackMarketLines.length} market lines (sgo)`);
        
        console.log('💾 Upserting fallback market lines...');
        const fallbackUpserted = await upsertMarketLines(fallbackMarketLines);
        console.log(`   Upserted ${fallbackUpserted} fallback market lines (sgo)`);
        marketLinesUpserted += fallbackUpserted;
      } catch (error) {
        console.error('   ❌ SGO fallback failed:', errMsg(error));
      }
    }
    
    // Also support SGO → Odds API fallback (for historical data or if SGO is primary)
    if (options.adapter === 'sgo' && marketLinesUpserted === 0 && process.env.ODDS_API_KEY) {
      console.warn('⚠️  SGO returned 0 market lines. Engaging Odds API fallback...');
      
      try {
        const oddsApiFactory = new AdapterFactory();
        const oddsApiAdapter = await oddsApiFactory.createAdapter('oddsapi');
        
        console.log('📥 Fetching market lines from Odds API...');
        const fallbackMarketLines = await oddsApiAdapter.getMarketLines(options.season, options.weeks, Object.keys(dateOptions).length > 0 ? dateOptions : undefined);
        console.log(`   Found ${fallbackMarketLines.length} market lines (oddsapi)`);
        
        console.log('💾 Upserting fallback market lines...');
        const fallbackUpserted = await upsertMarketLines(fallbackMarketLines);
        console.log(`   Upserted ${fallbackUpserted} fallback market lines (oddsapi)`);
        marketLinesUpserted += fallbackUpserted;
      } catch (error) {
        console.error('   ❌ Odds API fallback failed:', errMsg(error));
      }
    }

    // Branding (optional)
    if (typeof adapter.getTeamBranding === 'function') {
      console.log('📥 Fetching team branding...');
      const teamBranding = await adapter.getTeamBranding();
      console.log(`   Found ${teamBranding.length} team branding entries`);
      
      console.log('💾 Upserting team branding...');
      let brandingCount = 0;
      for (const b of teamBranding) {
        try {
          await prisma.team.update({
            where: { id: b.id },
            data: {
              name: b.name ?? undefined,
              conference: b.conference ?? undefined,
              division: b.division ?? undefined,
              mascot: b.mascot ?? undefined,
              city: b.city ?? undefined,
              state: b.state ?? undefined,
              logoUrl: b.logoUrl ?? null,
              primaryColor: b.primaryColor ?? null,
              secondaryColor: b.secondaryColor ?? null,
            },
          });
          brandingCount++;
        } catch (err) {
          // Ignore missing teams
        }
      }
      console.log(`   Upserted ${brandingCount} team branding entries`);
    } else {
      console.log('⏭️  Adapter has no getTeamBranding(); skipping branding step.');
    }

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
