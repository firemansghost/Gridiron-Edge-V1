import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && args[i + 1]) {
      weeks = args[i + 1].split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
      i++;
    }
  }
  
  console.log('\n======================================================================');
  console.log('🚦 ODDS BACKFILL GATES CHECK');
  console.log('======================================================================\n');
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);
  
  const gates: Array<{ name: string; passed: boolean; message: string }> = [];
  
  // Get games
  const games = await prisma.game.findMany({
    where: {
      season,
      week: { in: weeks },
      status: 'final',
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });
  
  let preKickCount = 0;
  const bookCounts: number[] = [];
  let zeroSpreadCount = 0;
  
  for (const game of games) {
    if (!game.date) continue;
    
    const windowStart = new Date(new Date(game.date).getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(new Date(game.date).getTime() + 5 * 60 * 1000);
    
    const lines = await prisma.marketLine.findMany({
      where: {
        gameId: game.id,
        lineType: 'spread',
        source: 'oddsapi',
        timestamp: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
    });
    
    if (lines.length > 0) {
      preKickCount++;
      const uniqueBooks = new Set(lines.map(l => l.bookName)).size;
      bookCounts.push(uniqueBooks);
      
      // Check for zero spread (deduped per book, then median, normalized to favorite-centric)
      const byBook = new Map<string, number[]>();
      for (const line of lines) {
        const book = line.bookName || 'unknown';
        const value = line.lineValue !== null ? Number(line.lineValue) : null;
        if (value === null || !isFinite(value)) continue;
        
        // Normalize to favorite-centric (always negative)
        // lineValue is in home_minus_away frame, normalize to favorite-centric
        const fcValue = -Math.abs(value);
        
        if (!byBook.has(book)) byBook.set(book, []);
        byBook.get(book)!.push(fcValue);
      }
      
      const deduped: number[] = [];
      for (const [book, values] of byBook.entries()) {
        if (values.length === 0) continue;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
        deduped.push(median);
      }
      
      if (deduped.length > 0) {
        const sorted = [...deduped].sort((a, b) => a - b);
        const consensusMid = Math.floor(sorted.length / 2);
        const consensusFC = sorted.length % 2 === 0
          ? (sorted[consensusMid - 1] + sorted[consensusMid]) / 2
          : sorted[consensusMid];
        
        // In favorite-centric frame, consensus should always be negative
        // Check for exactly 0.0 (which shouldn't happen after normalization)
        // or very close to 0 (which might indicate a data issue)
        if (Math.abs(consensusFC) < 0.1) {
          zeroSpreadCount++;
        }
      }
    }
  }
  
  const preKickPct = games.length > 0 ? (preKickCount / games.length) * 100 : 0;
  const medianBooks = bookCounts.length > 0
    ? bookCounts.sort((a, b) => a - b)[Math.floor(bookCounts.length / 2)]
    : 0;
  
  gates.push({
    name: 'Pre-kick coverage',
    passed: preKickPct >= 80,
    message: `${preKickPct.toFixed(1)}% (${preKickCount}/${games.length}) - Target: ≥80%`,
  });
  
  gates.push({
    name: 'Median unique books',
    passed: medianBooks >= 5,
    message: `${medianBooks} books per game - Target: ≥5`,
  });
  
  gates.push({
    name: 'Zero consensus spreads',
    passed: zeroSpreadCount === 0,
    message: `${zeroSpreadCount} games with consensus = 0.0 - Target: 0`,
  });
  
  // Report results
  console.log('GATES:\n');
  let allPassed = true;
  for (const gate of gates) {
    const status = gate.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${status}: ${gate.name}`);
    console.log(`      ${gate.message}\n`);
    if (!gate.passed) allPassed = false;
  }
  
  console.log('======================================================================');
  console.log(`OVERALL: ${allPassed ? '✅ ALL GATES PASSED' : '❌ GATES FAILED'}`);
  console.log('======================================================================\n');
  
  await prisma.$disconnect();
  
  if (!allPassed) {
    process.exit(1);
  }
}

main();

