#!/usr/bin/env node

/**
 * Odds API Historical Backfill Script
 * 
 * Fetches historical odds data from The Odds API for past seasons.
 * Requires ODDS_API_KEY with historical data access (paid tier).
 * 
 * Usage:
 *   npm run backfill:oddsapi -- --seasons 2023-2024 --weeks 1-15
 *   npm run backfill:oddsapi -- --seasons 2024 --weeks 1 --dryRun
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Safe error message helper
const errMsg = (e) => (e && e instanceof Error) ? e.message : String(e);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    seasons: [],
    weeks: [],
    rateLimitPerMin: 55,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--seasons') {
      const seasonStr = args[++i];
      if (seasonStr.includes('-')) {
        const [start, end] = seasonStr.split('-').map(Number);
        options.seasons = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      } else {
        options.seasons = seasonStr.split(',').map(Number);
      }
    } else if (arg === '--weeks') {
      const weekStr = args[++i];
      if (weekStr.includes('-')) {
        const [start, end] = weekStr.split('-').map(Number);
        options.weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      } else {
        options.weeks = weekStr.split(',').map(Number);
      }
    } else if (arg === '--rateLimitPerMin') {
      options.rateLimitPerMin = parseInt(args[++i]);
    } else if (arg === '--dryRun') {
      options.dryRun = true;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Odds API Historical Backfill Script

Usage: npm run backfill:oddsapi -- --seasons <years> --weeks <weeks> [options]

Arguments:
  --seasons <years>      Season years (e.g., 2023-2024, 2024)
  --weeks <weeks>        Week range (e.g., 1-15, 1,3,5)
  --rateLimitPerMin <n>  Rate limit per minute (default: 55)
  --dryRun              Don't write to database
  --help, -h            Show this help message

Examples:
  npm run backfill:oddsapi -- --seasons 2023-2024 --weeks 1-15
  npm run backfill:oddsapi -- --seasons 2024 --weeks 1 --dryRun
  npm run backfill:oddsapi -- --seasons 2023 --weeks 1-15 --rateLimitPerMin 50

Requirements:
  - ODDS_API_KEY environment variable with historical data access
  - Paid tier subscription to access historical endpoints

Note: This script uses The Odds API historical endpoint which requires
a paid subscription. Cost is ~10 requests per week per season.
`);
}

/**
 * Get date range for a specific season and week
 */
function getWeekDateRange(season, week) {
  // NCAAF 2023 started Aug 26, 2024 started Aug 24, 2025 starts Aug 30
  const seasonStarts = {
    2023: new Date('2023-08-26'),
    2024: new Date('2024-08-24'),
    2025: new Date('2025-08-30')
  };

  const startDate = seasonStarts[season] || new Date(`${season}-08-28`);
  
  // Add (week - 1) * 7 days to get the week start
  const weekStart = new Date(startDate);
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  return {
    startDate: weekStart.toISOString().split('T')[0],
    endDate: weekEnd.toISOString().split('T')[0]
  };
}

/**
 * Fetch historical odds for a specific date
 */
async function fetchHistoricalOdds(date, apiKey) {
  const baseUrl = process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4';
  const markets = 'h2h,spreads,totals';
  const url = `${baseUrl}/sports/americanfootball_ncaaf/odds?apiKey=${apiKey}&regions=us&markets=${markets}&oddsFormat=american&date=${date}T12:00:00Z`;
  
  console.log(`   [ODDSAPI] Fetching odds for ${date}...`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`   [ODDSAPI] ERROR ${response.status} ${response.statusText}`);
      console.error(errorBody.slice(0, 800));
      throw new Error(`Odds API error: ${response.status} ${response.statusText}`);
    }

    const events = await response.json();
    return events;
  } catch (error) {
    if (errMsg(error).includes('timeout')) {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * Parse event odds into market line objects
 */
function parseEventOdds(event, season, week) {
  const lines = [];

  for (const bookmaker of event.bookmakers || []) {
    const bookName = bookmaker.title || bookmaker.key;
    const timestamp = new Date(bookmaker.last_update);

    for (const market of bookmaker.markets || []) {
      if (market.key === 'h2h') {
        // Moneyline
        for (const outcome of market.outcomes || []) {
          if (outcome.price !== undefined) {
            lines.push({
              season,
              week,
              lineType: 'moneyline',
              lineValue: outcome.price,
              closingLine: outcome.price,
              bookName,
              source: 'oddsapi',
              timestamp,
            });
          }
        }
      } else if (market.key === 'spreads') {
        // Spread
        for (const outcome of market.outcomes || []) {
          if (outcome.point !== undefined) {
            lines.push({
              season,
              week,
              lineType: 'spread',
              lineValue: outcome.point,
              closingLine: outcome.point,
              bookName,
              source: 'oddsapi',
              timestamp,
            });
          }
        }
      } else if (market.key === 'totals') {
        // Total
        for (const outcome of market.outcomes || []) {
          if (outcome.point !== undefined) {
            lines.push({
              season,
              week,
              lineType: 'total',
              lineValue: outcome.point,
              closingLine: outcome.point,
              bookName,
              source: 'oddsapi',
              timestamp,
            });
          }
        }
      }
    }
  }

  return lines;
}

/**
 * Upsert market lines to database
 */
async function upsertMarketLines(marketLines, dryRun = false) {
  let upserted = 0;

  for (const line of marketLines) {
    if (dryRun) {
      console.log(`   [DRY RUN] Would upsert: ${line.lineType} ${line.lineValue} (${line.bookName})`);
      upserted++;
      continue;
    }

    try {
      await prisma.marketLine.create({
        data: {
          gameId: 'temp-game-id', // This would need proper game matching
          season: line.season,
          week: line.week,
          lineType: line.lineType,
          lineValue: line.lineValue,
          closingLine: line.closingLine,
          timestamp: line.timestamp,
          source: line.source,
          bookName: line.bookName
        }
      });
      upserted++;
    } catch (error) {
      console.error(`   ⚠️  Failed to upsert line: ${errMsg(error)}`);
    }
  }

  return upserted;
}

/**
 * Sleep for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main backfill function
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Validate arguments
  if (options.seasons.length === 0) {
    console.error('Error: --seasons is required');
    showHelp();
    process.exit(1);
  }

  if (options.weeks.length === 0) {
    console.error('Error: --weeks is required');
    showHelp();
    process.exit(1);
  }

  // Check for API key
  const apiKey = process.env.ODDS_API_KEY || '';
  if (!apiKey) {
    console.error('Error: ODDS_API_KEY environment variable is required');
    process.exit(1);
  }

  console.log(`
🔄 ODDS API HISTORICAL BACKFILL
================================
Seasons: ${options.seasons.join(', ')}
Weeks: ${options.weeks.join(', ')}
Rate Limit: ${options.rateLimitPerMin} requests/min
Dry Run: ${options.dryRun ? 'YES' : 'NO'}
================================
`);

  const msPerRequest = (60 * 1000) / options.rateLimitPerMin;
  let totalLines = 0;
  let totalRequests = 0;

  try {
    for (const season of options.seasons) {
      console.log(`\n📅 Processing season ${season}...`);
      
      for (const week of options.weeks) {
        console.log(`\n   Week ${week}:`);
        
        const { startDate, endDate } = getWeekDateRange(season, week);
        console.log(`   Date range: ${startDate} to ${endDate}`);
        
        // Sample mid-week for historical data
        const midDate = startDate; // Could also sample multiple days
        
        try {
          const events = await fetchHistoricalOdds(midDate, apiKey);
          totalRequests++;
          
          console.log(`   Found ${events.length} events on ${midDate}`);
          
          let weekLines = 0;
          for (const event of events) {
            const lines = parseEventOdds(event, season, week);
            weekLines += lines.length;
            totalLines += lines.length;
            
            // Note: Proper implementation would match events to games in DB
            // For now, just count the lines we would insert
          }
          
          console.log(`   ✅ Parsed ${weekLines} market lines for week ${week}`);
          
          // Rate limiting
          if (totalRequests < options.seasons.length * options.weeks.length) {
            console.log(`   ⏱️  Rate limiting... (${Math.round(msPerRequest)}ms)`);
            await sleep(msPerRequest);
          }
          
        } catch (error) {
          console.error(`   ❌ Error fetching week ${week}: ${errMsg(error)}`);
        }
      }
    }

    console.log(`
================================
✅ BACKFILL COMPLETE
Total Requests: ${totalRequests}
Total Lines Found: ${totalLines}
${options.dryRun ? '(DRY RUN - No data written)' : ''}
================================
`);

  } catch (error) {
    console.error('\n❌ Backfill failed:', errMsg(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };

