import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface TrainingRow {
  gameId: string;
  season: number;
  week: number;
  sourceWindow: 'pre_kick' | 'closing';
  quality: 'pre_kick' | 'closing_fallback';
  books: number;
  snapshotWindow: string;
  featureVersion: string;
  weight: number;
  included: boolean;
  dataset: 'A' | 'B' | 'C' | null;
}

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let includeClosingFallback = process.env.INCLUDE_CLOSING_FALLBACK === 'true';
  let featureVersion = process.env.FEATURE_VERSION || 'v1.0';
  
  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--include-closing-fallback') {
      includeClosingFallback = true;
    } else if (args[i] === '--feature-version' && args[i + 1]) {
      featureVersion = args[i + 1];
      i++;
    }
  }
  
  console.log('\n======================================================================');
  console.log('📊 ASSEMBLING TRAINING DATASETS');
  console.log('======================================================================\n');
  console.log(`   Season: ${season}`);
  console.log(`   Feature Version: ${featureVersion}`);
  console.log(`   Include Closing Fallback: ${includeClosingFallback}\n`);
  
  const allRows: TrainingRow[] = [];
  
  // Get all final games for the season
  const games = await prisma.game.findMany({
    where: {
      season,
      week: { in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      status: 'final',
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
  });
  
  console.log(`   Total games: ${games.length}\n`);
  
  // Process each game
  for (const game of games) {
    if (!game.date) continue;
    
    const windowStart = new Date(new Date(game.date).getTime() - 60 * 60 * 1000); // T-60
    const windowEnd = new Date(new Date(game.date).getTime() + 5 * 60 * 1000); // T+5
    
    // Check for pre-kick lines
    const preKickLines = await prisma.marketLine.findMany({
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
    
    // Check for closing lines (fallback)
    const closingLines = includeClosingFallback
      ? await prisma.marketLine.findMany({
          where: {
            gameId: game.id,
            lineType: 'spread',
            source: 'oddsapi',
            timestamp: {
              gt: windowEnd, // After pre-kick window
            },
          },
          orderBy: {
            timestamp: 'desc',
          },
          take: 1, // Just check if any exist
        })
      : [];
    
    // Determine quality and dataset
    let quality: 'pre_kick' | 'closing_fallback' | null = null;
    let dataset: 'A' | 'B' | 'C' | null = null;
    let weight = 0;
    let included = false;
    let sourceWindow: 'pre_kick' | 'closing' = 'pre_kick';
    let snapshotWindow = '';
    let books = 0;
    
    if (preKickLines.length > 0) {
      // Pre-kick data
      quality = 'pre_kick';
      sourceWindow = 'pre_kick';
      snapshotWindow = `T-60→T+5`;
      
      const uniqueBooks = new Set(preKickLines.map(l => l.bookName)).size;
      books = uniqueBooks;
      
      if (game.week >= 8 && game.week <= 11) {
        // Set A (Core)
        dataset = 'A';
        weight = 1.0;
        included = true;
      } else if (game.week >= 1 && game.week <= 7) {
        // Set B (Extended)
        dataset = 'B';
        weight = 0.6;
        included = true;
      }
    } else if (closingLines.length > 0 && includeClosingFallback) {
      // Closing fallback
      quality = 'closing_fallback';
      sourceWindow = 'closing';
      snapshotWindow = `closing`;
      
      const uniqueBooks = new Set(closingLines.map(l => l.bookName)).size;
      books = uniqueBooks;
      
      // Set C (Aux)
      dataset = 'C';
      weight = 0.25;
      included = true;
    }
    
    if (quality) {
      allRows.push({
        gameId: game.id,
        season: game.season,
        week: game.week,
        sourceWindow,
        quality,
        books,
        snapshotWindow,
        featureVersion,
        weight,
        included,
        dataset,
      });
    }
  }
  
  // Generate summary
  const setA = allRows.filter(r => r.dataset === 'A' && r.included);
  const setB = allRows.filter(r => r.dataset === 'B' && r.included);
  const setC = allRows.filter(r => r.dataset === 'C' && r.included);
  
  console.log('======================================================================');
  console.log('📊 DATASET SUMMARY');
  console.log('======================================================================\n');
  console.log(`   Set A (Core): ${setA.length} rows (Weeks 8-11, pre-kick, weight=1.0)`);
  console.log(`   Set B (Extended): ${setB.length} rows (Weeks 1-7, pre-kick, weight=0.6)`);
  console.log(`   Set C (Aux): ${setC.length} rows (All weeks, closing-fallback, weight=0.25)`);
  console.log(`   Total included: ${setA.length + setB.length + setC.length} rows\n`);
  
  // Generate detailed summary by week × quality
  const summary: Record<string, { preKick: number; closing: number; total: number }> = {};
  
  for (const row of allRows) {
    const key = `Week ${row.week}`;
    if (!summary[key]) {
      summary[key] = { preKick: 0, closing: 0, total: 0 };
    }
    if (row.quality === 'pre_kick') {
      summary[key].preKick++;
    } else {
      summary[key].closing++;
    }
    summary[key].total++;
  }
  
  // Save summary CSV
  const summaryRows: string[] = [];
  summaryRows.push('week,quality,dataset,count,weight,median_books');
  
  for (let week = 1; week <= 11; week++) {
    const weekRows = allRows.filter(r => r.week === week);
    const preKickRows = weekRows.filter(r => r.quality === 'pre_kick' && r.included);
    const closingRows = weekRows.filter(r => r.quality === 'closing_fallback' && r.included);
    
    if (preKickRows.length > 0) {
      const dataset = week >= 8 ? 'A' : 'B';
      const weight = week >= 8 ? 1.0 : 0.6;
      const medianBooks = preKickRows.length > 0
        ? preKickRows.map(r => r.books).sort((a, b) => a - b)[Math.floor(preKickRows.length / 2)]
        : 0;
      summaryRows.push(`${week},pre_kick,${dataset},${preKickRows.length},${weight},${medianBooks}`);
    }
    
    if (closingRows.length > 0) {
      const medianBooks = closingRows.length > 0
        ? closingRows.map(r => r.books).sort((a, b) => a - b)[Math.floor(closingRows.length / 2)]
        : 0;
      summaryRows.push(`${week},closing_fallback,C,${closingRows.length},0.25,${medianBooks}`);
    }
  }
  
  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(reportsDir, 'train_rows_summary.csv'),
    summaryRows.join('\n')
  );
  
  // Save full dataset
  const datasetRows: string[] = [];
  datasetRows.push('game_id,season,week,source_window,quality,books,snapshot_window,feature_version,weight,included,dataset');
  
  for (const row of allRows) {
    datasetRows.push(
      `${row.gameId},${row.season},${row.week},${row.sourceWindow},${row.quality},${row.books},${row.snapshotWindow},${row.featureVersion},${row.weight},${row.included},${row.dataset || ''}`
    );
  }
  
  fs.writeFileSync(
    path.join(reportsDir, 'train_rows_full.csv'),
    datasetRows.join('\n')
  );
  
  console.log('✅ Saved reports/train_rows_summary.csv');
  console.log('✅ Saved reports/train_rows_full.csv');
  console.log(`\n   One-liner: Set A: ${setA.length}, Set B: ${setB.length}, Aux: ${setC.length}\n`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

