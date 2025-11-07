#!/usr/bin/env node

/**
 * Minimal TypeScript version for CI
 * Focuses only on OddsApiAdapter historical backfill
 */

import { PrismaClient } from '@prisma/client';
import { OddsApiAdapter } from './adapters/OddsApiAdapter.js';

const prisma = new PrismaClient();

// Safe error message helper
const errMsg = (e: any) => (e && e instanceof Error) ? e.message : String(e);

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
    const options: any = {
      adapter: null,
      season: null,
      weeks: [],
      dryRun: false,
      historical: false,
      historicalStrict: false,
      markets: 'spreads,totals,h2h',
      regions: 'us',
      creditsLimit: 3000,
      maxEvents: null
    };

  // Debug logging
  console.log('Debug: Raw args:', args);

  // First, find the adapter (first non-flag argument)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      options.adapter = arg;
      console.log('Debug: Found adapter:', arg);
      break;
    }
  }

  // Then process flags
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--season' && i + 1 < args.length) {
      options.season = parseInt(args[++i]);
    } else if (arg === '--weeks' && i + 1 < args.length) {
      const weekStr = args[++i];
      if (weekStr.includes('-')) {
        const [start, end] = weekStr.split('-').map(Number);
        options.weeks = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      } else {
        options.weeks = weekStr.split(',').map(Number);
      }
    } else if (arg === '--dry-run' || arg.startsWith('--dry-run=')) {
      if (arg.includes('=')) {
        options.dryRun = arg.split('=')[1] === 'true';
      } else {
        options.dryRun = true;
      }
    } else if (arg === '--historical' || arg.startsWith('--historical=')) {
      if (arg.includes('=')) {
        options.historical = arg.split('=')[1] === 'true';
      } else {
        options.historical = true;
      }
    } else if (arg === '--historical-strict' || arg.startsWith('--historical-strict=')) {
      if (arg.includes('=')) {
        options.historicalStrict = arg.split('=')[1] === 'true';
      } else {
        options.historicalStrict = true;
      }
    } else if (arg === '--markets' && i + 1 < args.length) {
      options.markets = args[++i];
    } else if (arg === '--regions' && i + 1 < args.length) {
      options.regions = args[++i];
    } else if (arg === '--credits-limit' && i + 1 < args.length) {
      options.creditsLimit = parseInt(args[++i]);
    } else if (arg === '--max-events' && i + 1 < args.length) {
      options.maxEvents = parseInt(args[++i]);
    }
  }

  // Debug logging
  console.log('Debug: Parsed options:', {
    adapter: options.adapter,
    season: options.season,
    weeks: options.weeks,
    dryRun: options.dryRun,
    historical: options.historical,
    historicalStrict: options.historicalStrict
  });

  return options;
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (!options.adapter) {
    console.log('Usage: node ingest-minimal.js <adapter> [options]');
    process.exit(1);
  }

  console.log('🚀 M5 Data Ingestion CLI (Minimal)');
  console.log(`📊 Adapter: ${options.adapter}`);
  console.log(`📅 Season: ${options.season}`);
  console.log(`📆 Weeks: ${options.weeks.join(', ')}`);
  console.log(`🔍 Dry Run: ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`📚 Historical: ${options.historical ? 'YES' : 'NO'}`);
  console.log(`🔒 Historical Strict: ${options.historicalStrict ? 'YES' : 'NO'}`);
  console.log(`💰 Markets: ${options.markets}`);
  console.log(`🌍 Regions: ${options.regions}`);
  console.log(`💳 Credits Limit: ${options.creditsLimit}`);
  console.log('');

  // DB safety echo
  const url = process.env.DATABASE_URL || '';
  const redacted = url.replace(/:\/\/[^@]+@/, '://****:****@').replace(/\?.*$/, '');
  console.log('[DB] Prisma target:', redacted);
  console.log('[DB] NODE_ENV:', process.env.NODE_ENV || 'not set');
  console.log('');

  try {
    // Set environment variables
    if (options.historicalStrict) {
      process.env.HISTORICAL_STRICT = 'true';
    }
    if (options.season) {
      process.env.HISTORICAL_ALLOWED_SEASON = options.season.toString();
    }
    if (options.weeks.length > 0) {
      const minWeek = Math.min(...options.weeks);
      const maxWeek = Math.max(...options.weeks);
      process.env.HISTORICAL_ALLOWED_WEEKS = `${minWeek}-${maxWeek}`;
    }
    process.env.CREDITS_LIMIT = options.creditsLimit.toString();

    // Create adapter (only OddsApiAdapter for now)
    if (options.adapter !== 'oddsapi') {
      console.error(`❌ Only 'oddsapi' adapter supported in minimal version`);
      process.exit(1);
    }

    const adapter = new OddsApiAdapter({
      baseUrl: 'https://api.the-odds-api.com/v4',
      timeoutMs: 30000,
      markets: options.markets.split(',')
    });

    // Fetch market lines
    console.log('📥 Fetching market lines...');
    console.log(`🔍 Pipeline: Starting historical backfill for ${options.season} Week ${options.weeks.join(',')}`);
    
    const marketLines = await adapter.getMarketLines(options.season, options.weeks);

    console.log(`✅ Found ${marketLines.length} market lines`);
    
    // Log pipeline stages
    if (marketLines.length > 0) {
      const spreads = marketLines.filter((line: any) => line.line_type === 'spread').length;
      const totals = marketLines.filter((line: any) => line.line_type === 'total').length;
      const moneylines = marketLines.filter((line: any) => line.line_type === 'moneyline').length;
      
      console.log(`📊 Pipeline stages completed:`);
      console.log(`   • Fetched historical events: ${marketLines.length > 0 ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   • Mapped events to games: ${marketLines.length > 0 ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   • Parsed spreads: ${spreads}, totals: ${totals}, moneylines: ${moneylines}`);
      console.log(`   • Prepared to insert: ${marketLines.length} rows`);
    } else {
      console.log(`❌ Pipeline failed: No market lines found`);
    }

    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No database writes');
      console.log(`📊 Market lines: ${marketLines.length}`);
      console.log('✅ Dry run completed successfully');
      return;
    }

    // Process market lines - REAL DATABASE WRITES
    console.log('💾 Processing market lines...');
    console.log('[DB] Write gate check:', { dryRun: options.dryRun });
    console.log('[DB] rowsToInsert:', marketLines.length);
    
    // Group by game_id for stats
    const gameGroups: any = {};
    marketLines.forEach((line: any) => {
      if (!gameGroups[line.gameId]) {
        gameGroups[line.gameId] = [];
      }
      gameGroups[line.gameId].push(line);
    });

    // Calculate statistics
    const uniqueGames = Object.keys(gameGroups).length;
    const spreads = marketLines.filter((l: any) => l.lineType === 'spread').length;
    const totals = marketLines.filter((l: any) => l.lineType === 'total').length;
    const moneylines = marketLines.filter((l: any) => l.lineType === 'moneyline').length;
    
    // Count lines with teamId
    const spreadsWithTeamId = marketLines.filter((l: any) => l.lineType === 'spread' && l.teamId).length;
    const moneylinesWithTeamId = marketLines.filter((l: any) => l.lineType === 'moneyline' && l.teamId).length;
    
    // Count games with complete moneyline coverage (both teams)
    const gamesWithBothMoneylines = Object.values(gameGroups).filter((gameLines: any) => {
      const mlLines = gameLines.filter((l: any) => l.lineType === 'moneyline' && l.teamId);
      const uniqueTeamIds = new Set(mlLines.map((l: any) => l.teamId));
      return uniqueTeamIds.size >= 2;
    }).length;

    console.log(`\n📊 INGESTION SUMMARY:`);
    console.log(`   Games processed: ${uniqueGames} (ALL games, not a sample)`);
    console.log(`   Total market lines: ${marketLines.length}`);
    console.log(`   Breakdown:`);
    console.log(`     • Spreads: ${spreads} (${spreadsWithTeamId} with teamId)`);
    console.log(`     • Totals: ${totals}`);
    console.log(`     • Moneylines: ${moneylines} (${moneylinesWithTeamId} with teamId)`);
    console.log(`   Moneyline coverage: ${gamesWithBothMoneylines}/${uniqueGames} games have both teams' moneylines with teamId`);
    console.log(`   Lines per game: ${(marketLines.length / uniqueGames).toFixed(1)} average`);
    
    // Prepare rows for database
    const rowsToInsert = marketLines.map((line: any) => ({
      season: line.season,
      week: line.week,
      gameId: line.gameId,
      lineType: line.lineType,
      lineValue: line.lineValue,
      closingLine: line.price || line.closingLine || 0,
      bookName: line.bookName,
      source: line.source || 'oddsapi',
      timestamp: new Date(line.timestamp),
      teamId: line.teamId || null // CRITICAL: Include teamId for spreads and moneylines
    }));
    
    // Log first 2 rows for inspection
    if (rowsToInsert.length > 0) {
      console.log('[DB] Sample rows (first 2):');
      console.log(JSON.stringify(rowsToInsert.slice(0, 2), null, 2));
    }
    
    // DEBUG: Log LSU @ Alabama moneyline rows
    const lsuMoneylines = rowsToInsert.filter((r: any) => 
      r.gameId === '2025-wk11-lsu-alabama' && r.lineType === 'moneyline'
    );
    if (lsuMoneylines.length > 0) {
      console.log(`[DEBUG-LSU-DB] Found ${lsuMoneylines.length} moneyline rows for LSU @ Alabama in rowsToInsert:`);
      console.log(JSON.stringify(lsuMoneylines.slice(0, 4), null, 2));
      
      const alabamaRows = lsuMoneylines.filter((r: any) => r.teamId === 'alabama');
      const lsuRows = lsuMoneylines.filter((r: any) => r.teamId === 'lsu');
      const nullRows = lsuMoneylines.filter((r: any) => r.teamId === null);
      
      console.log(`[DEBUG-LSU-DB] Breakdown: Alabama=${alabamaRows.length}, LSU=${lsuRows.length}, NULL=${nullRows.length}`);
    }
    
    // REAL DATABASE WRITE
    if (!options.dryRun && rowsToInsert.length > 0) {
      // WORKAROUND: Delete existing market lines for this week first to avoid Prisma skipDuplicates bug with NULL teamId
      console.log(`[DB] Deleting existing market lines for ${options.season} Week ${options.weeks[0]}...`);
      const deleteResult = await prisma.marketLine.deleteMany({
        where: {
          season: options.season,
          week: options.weeks[0],
          source: 'oddsapi'
        }
      });
      console.log(`[DB] Deleted ${deleteResult.count} existing rows`);
      
      console.log('[DB] Executing createMany...');
      let insertResult;
      try {
        insertResult = await prisma.marketLine.createMany({
          data: rowsToInsert,
          skipDuplicates: false, // Changed: No longer needed since we deleted first
        });
        console.log('[DB] createMany result:', insertResult);
        
        // Verify all rows inserted
        const expectedInserts = rowsToInsert.length;
        const actualInserts = insertResult.count;
        
        if (actualInserts === expectedInserts) {
          console.log(`[DB] ✅ All ${actualInserts} rows inserted successfully`);
        } else {
          console.error(`[DB] ❌ Mismatch: Expected ${expectedInserts} inserts, got ${actualInserts}`);
        }
      } catch (error) {
        console.error('[DB] ❌ createMany failed:', error);
        throw error;
      }
      
      // Same-process verification
      const verifyResult = await prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::int AS count
        FROM market_lines
        WHERE season = ${options.season} AND week = ${options.weeks[0]}
      `);
      const postCount = verifyResult[0]?.count || 0;
      console.log(`[DB] Post-write count (${options.season} W${options.weeks[0]}):`, postCount);
      
      if (postCount === 0) {
        throw new Error('createMany returned but DB count is 0 — check DATABASE_URL or column mapping.');
      }
      
      // Final summary line (for parsing/automation)
      console.log(`\n[SUMMARY] mapped_games=${uniqueGames} parsed_spreads=${spreads} parsed_totals=${totals} parsed_moneylines=${moneylines} toInsert=${rowsToInsert.length} inserted=${insertResult.count} postCount=${postCount}`);
      
    } else if (options.dryRun) {
      console.log('[DB] Skipped createMany (dryRun mode)');
    } else {
      console.log('[DB] Skipped createMany (0 rows)');
    }
    
    // Fail-fast guard if zero rows
    if (!options.dryRun && marketLines.length === 0) {
      console.error('❌ Historical backfill wrote 0 rows; check event mapping and snapshot.');
      process.exit(2);
    }
    
    // Print unmatched teams summary (if file exists)
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const unmatchedFile = path.join(process.cwd(), 'reports', 'historical', `unmatched_oddsapi_${options.season}_w${options.weeks[0]}.json`);
      
      try {
        const unmatchedData = await fs.readFile(unmatchedFile, 'utf-8');
        const unmatchedReport = JSON.parse(unmatchedData);
        
        if (unmatchedReport.totalUnmatched > 0) {
          console.log('\n📋 Unmatched Events Summary:');
          console.log(`   Total unmatched events: ${unmatchedReport.totalUnmatched}`);
          
          if (unmatchedReport.reasonBreakdown) {
            console.log(`   Reason breakdown:`);
            Object.entries(unmatchedReport.reasonBreakdown).forEach(([reason, count]) => {
              console.log(`     • ${reason}: ${count}`);
            });
          }
          
          console.log(`   Unique unmatched team names (${unmatchedReport.uniqueUnmatchedTeams.length}):`);
          unmatchedReport.uniqueUnmatchedTeams.forEach((team: string) => {
            console.log(`     - ${team}`);
          });
          console.log(`   📁 Full report: ${unmatchedFile}`);
        }
      } catch (readError) {
        // File doesn't exist or can't be read - that's okay
      }
    } catch (importError) {
      // Can't import fs - that's okay
    }
    
    console.log('✅ Ingestion completed successfully');

  } catch (error) {
    console.error('❌ Error during ingestion:', errMsg(error));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', errMsg(error));
    process.exit(1);
  });
}

export { main };
