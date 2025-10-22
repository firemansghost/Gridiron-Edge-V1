#!/usr/bin/env node

/**
 * Week 9 Repoll Script
 * 
 * One-shot script to repoll odds for 2025 Week 9
 * Includes diagnostics and verification
 */

const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔄 Starting Week 9 repoll...');
    
    // Pre-flight check
    console.log('\n🔍 Pre-flight checks:');
    const gameCount = await prisma.game.count({
      where: { season: 2025, week: 9 }
    });
    console.log(`📊 Games for 2025 Week 9: ${gameCount}`);
    
    if (gameCount === 0) {
      console.log('❌ No games found for 2025 Week 9 - aborting');
      process.exit(1);
    }
    
    // Check current odds coverage
    const currentOdds = await prisma.marketLine.count({
      where: { season: 2025, week: 9 }
    });
    console.log(`📈 Current odds rows for Week 9: ${currentOdds}`);
    
    // Run the repoll
    console.log('\n📈 Running odds repoll...');
    console.log('🔧 Parameters: season=2025, week=9, region=us, markets=spreads,totals,h2h');
    
    try {
      execSync('node apps/jobs/ingest-simple.js oddsapi --season 2025 --weeks 9', {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      console.log('✅ Repoll completed successfully');
    } catch (error) {
      console.error('❌ Repoll failed:', error.message);
      process.exit(1);
    }
    
    // Post-poll verification
    console.log('\n🔍 Post-poll verification:');
    const newOdds = await prisma.marketLine.count({
      where: { season: 2025, week: 9 }
    });
    const rowsAdded = newOdds - currentOdds;
    console.log(`📈 New odds rows: ${newOdds} (added ${rowsAdded})`);
    
    if (rowsAdded === 0) {
      console.log('⚠️  No new rows added - check provider response');
    } else {
      console.log('✅ Odds successfully repolled');
    }
    
    // Show diagnostics table
    console.log('\n📊 Coverage breakdown:');
    const coverage = await prisma.$queryRaw`
      SELECT 
        ml.book_name,
        ml.line_type,
        COUNT(*) AS rows,
        MAX(ml.timestamp) AS last_timestamp
      FROM market_lines ml
      JOIN games g ON g.id = ml.game_id
      WHERE g.season = 2025 AND g.week = 9
      GROUP BY ml.book_name, ml.line_type
      ORDER BY ml.book_name, ml.line_type
    `;
    
    console.table(coverage);
    
    console.log('\n🎉 Week 9 repoll completed!');
    
  } catch (error) {
    console.error('❌ Error during repoll:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
