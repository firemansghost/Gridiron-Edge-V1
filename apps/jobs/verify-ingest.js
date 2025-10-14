#!/usr/bin/env node

/**
 * Verify Ingest Script
 * 
 * Prints counts and samples from market_lines table to verify data ingestion.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('\n📊 MARKET LINES VERIFICATION\n');
    console.log('============================================\n');

    // Get counts by lineType and source for season 2024, week 1
    console.log('📈 Counts for Season 2024, Week 1:\n');

    const linesBySeason = await prisma.marketLine.groupBy({
      by: ['lineType', 'source'],
      where: {
        game: {
          season: 2024,
          week: 1
        }
      },
      _count: {
        id: true
      },
      orderBy: [
        { lineType: 'asc' },
        { source: 'asc' }
      ]
    });

    if (linesBySeason.length === 0) {
      console.log('⚠️  No market lines found for 2024 Week 1\n');
    } else {
      console.log('Line Type       Source          Count');
      console.log('─────────────────────────────────────────');
      
      let totalCount = 0;
      for (const group of linesBySeason) {
        const lineType = (group.lineType || 'unknown').padEnd(15);
        const source = (group.source || 'unknown').padEnd(15);
        const count = group._count.id;
        totalCount += count;
        console.log(`${lineType} ${source} ${count}`);
      }
      console.log('─────────────────────────────────────────');
      console.log(`Total: ${totalCount} lines\n`);
    }

    // Get total counts across all seasons/weeks
    console.log('📊 Total Counts (All Seasons/Weeks):\n');

    const allLines = await prisma.marketLine.groupBy({
      by: ['lineType', 'source'],
      _count: {
        id: true
      },
      orderBy: [
        { lineType: 'asc' },
        { source: 'asc' }
      ]
    });

    if (allLines.length > 0) {
      console.log('Line Type       Source          Count');
      console.log('─────────────────────────────────────────');
      
      let grandTotal = 0;
      for (const group of allLines) {
        const lineType = (group.lineType || 'unknown').padEnd(15);
        const source = (group.source || 'unknown').padEnd(15);
        const count = group._count.id;
        grandTotal += count;
        console.log(`${lineType} ${source} ${count}`);
      }
      console.log('─────────────────────────────────────────');
      console.log(`Total: ${grandTotal} lines\n`);
    }

    // Get 10 most recent rows
    console.log('🕒 10 Most Recent Market Lines:\n');

    const recentLines = await prisma.marketLine.findMany({
      take: 10,
      orderBy: {
        timestamp: 'desc'
      },
      select: {
        gameId: true,
        lineType: true,
        lineValue: true,
        closingLine: true,
        bookName: true,
        source: true,
        timestamp: true
      }
    });

    if (recentLines.length === 0) {
      console.log('⚠️  No market lines found\n');
    } else {
      console.log('Game ID                  Type       Value  Closing  Book            Source    Timestamp');
      console.log('────────────────────────────────────────────────────────────────────────────────────────────');
      
      for (const line of recentLines) {
        const gameId = (line.gameId || '').padEnd(24);
        const lineType = (line.lineType || '').padEnd(10);
        const lineValue = String(line.lineValue || 0).padStart(6);
        const closing = String(line.closingLine || 0).padStart(7);
        const book = (line.bookName || '').padEnd(15);
        const source = (line.source || '').padEnd(9);
        const timestamp = line.timestamp ? new Date(line.timestamp).toISOString().slice(0, 19).replace('T', ' ') : 'unknown';
        
        console.log(`${gameId} ${lineType} ${lineValue} ${closing}  ${book} ${source} ${timestamp}`);
      }
      console.log('\n');
    }

    console.log('============================================\n');
    console.log('✅ Verification complete!\n');

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    console.error(error);
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

