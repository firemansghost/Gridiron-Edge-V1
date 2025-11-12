import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const week = 2;
  
  console.log(`\n🔍 Diagnosing Zero Spreads (Week ${week}, Season ${season})\n`);
  console.log('='.repeat(70));
  
  const games = await prisma.game.findMany({
    where: { season, week, status: 'final' },
    include: { homeTeam: true, awayTeam: true },
  });
  
  let zeroSpreadGames = 0;
  const samples: Array<{ game: string; rawValues: number[]; consensus: number; normalized: number }> = [];
  
  for (const game of games.slice(0, 20)) { // Check first 20 games
    if (!game.date) continue;
    
    const windowStart = new Date(new Date(game.date).getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(new Date(game.date).getTime() + 5 * 60 * 1000);
    
    const lines = await prisma.marketLine.findMany({
      where: {
        gameId: game.id,
        lineType: 'spread',
        source: 'oddsapi',
        timestamp: { gte: windowStart, lte: windowEnd },
      },
    });
    
    if (lines.length === 0) continue;
    
    // Current logic (no normalization)
    const byBook = new Map<string, number[]>();
    for (const line of lines) {
      const book = line.bookName || 'unknown';
      const value = line.lineValue !== null ? Number(line.lineValue) : null;
      if (value === null || !isFinite(value)) continue;
      if (!byBook.has(book)) byBook.set(book, []);
      byBook.get(book)!.push(value);
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
      const consensus = sorted.length % 2 === 0
        ? (sorted[consensusMid - 1] + sorted[consensusMid]) / 2
        : sorted[consensusMid];
      
      // Normalized to favorite-centric (like other scripts)
      const normalized = -Math.abs(consensus);
      
      if (Math.abs(consensus) < 0.1) {
        zeroSpreadGames++;
        if (samples.length < 5) {
          samples.push({
            game: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
            rawValues: deduped,
            consensus,
            normalized,
          });
        }
      }
    }
  }
  
  console.log(`Found ${zeroSpreadGames} games with consensus ≈ 0.0\n`);
  
  if (samples.length > 0) {
    console.log('Sample games with zero spreads:');
    for (const sample of samples) {
      console.log(`\n  ${sample.game}:`);
      console.log(`    Raw values (per-book medians): [${sample.rawValues.map(v => v.toFixed(1)).join(', ')}]`);
      console.log(`    Consensus (HMA frame): ${sample.consensus.toFixed(2)}`);
      console.log(`    Normalized (favorite-centric): ${sample.normalized.toFixed(2)}`);
      console.log(`    ${Math.abs(sample.consensus) < 0.1 ? '⚠️  This is a pick\'em game (legitimate 0.0)' : '✅ Not actually zero'}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('\n💡 Issue:');
  console.log('   The gate check uses raw lineValue (home_minus_away frame).');
  console.log('   Pick\'em games legitimately have consensus ≈ 0.0 in HMA frame.');
  console.log('   But we should normalize to favorite-centric (always negative) for consistency.');
  console.log('\n   Fix: Normalize to favorite-centric before checking for zero.');
  
  await prisma.$disconnect();
}

main().catch(console.error);

