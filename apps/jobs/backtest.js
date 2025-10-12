/**
 * M7 Backtesting CLI
 * 
 * Walk-forward backtest with adjustable parameters and detailed reporting.
 * 
 * Usage:
 *   npm run backtest -- --season 2024 --weeks 1-1 --minEdge 2.0 --confidence A,B --bet spread,total --price -110 --kelly 0.5
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    season: '2024',
    weeks: '1-1',
    market: 'closing',
    minEdge: 2.0,
    confidence: ['A', 'B', 'C'],
    bet: ['spread', 'total'],
    price: -110,
    kelly: 0,
    injuries: false,
    weather: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--season':
        params.season = nextArg;
        i++;
        break;
      case '--weeks':
        params.weeks = nextArg;
        i++;
        break;
      case '--market':
        params.market = nextArg;
        i++;
        break;
      case '--minEdge':
        params.minEdge = parseFloat(nextArg);
        i++;
        break;
      case '--confidence':
        params.confidence = nextArg.split(',').map(c => c.trim().toUpperCase());
        i++;
        break;
      case '--bet':
        params.bet = nextArg.split(',').map(b => b.trim().toLowerCase());
        i++;
        break;
      case '--price':
        params.price = parseInt(nextArg);
        i++;
        break;
      case '--kelly':
        params.kelly = parseFloat(nextArg);
        i++;
        break;
      case '--injuries':
        params.injuries = nextArg === 'on';
        i++;
        break;
      case '--weather':
        params.weather = nextArg === 'on';
        i++;
        break;
    }
  }

  return params;
}

/**
 * Parse season range (e.g., "2024" or "2022-2024")
 */
function parseSeasonRange(seasonStr) {
  if (seasonStr.includes('-')) {
    const [start, end] = seasonStr.split('-').map(s => parseInt(s));
    const seasons = [];
    for (let s = start; s <= end; s++) {
      seasons.push(s);
    }
    return seasons;
  }
  return [parseInt(seasonStr)];
}

/**
 * Parse week range (e.g., "1-13" or "1,3,6")
 */
function parseWeekRange(weeksStr) {
  if (weeksStr.includes('-')) {
    const [start, end] = weeksStr.split('-').map(w => parseInt(w));
    const weeks = [];
    for (let w = start; w <= end; w++) {
      weeks.push(w);
    }
    return weeks;
  }
  return weeksStr.split(',').map(w => parseInt(w.trim()));
}

/**
 * Calculate Kelly stake
 */
function calculateKellyStake(edge, price, kellyFraction) {
  if (kellyFraction === 0) {
    return 1.0; // Flat 1 unit
  }

  // Convert American odds to decimal
  const decimalOdds = price < 0 ? 1 + (100 / Math.abs(price)) : 1 + (price / 100);
  const prob = edge; // Simplified: using edge as edge probability
  const b = decimalOdds - 1; // Net odds

  // Kelly formula: f = (bp - q) / b
  // where p = win prob, q = lose prob = 1-p
  // For simplicity, we'll use a conservative approach
  const kellyPct = Math.min(edge / 100, 0.1); // Cap at 10% of bankroll
  const stake = kellyPct * kellyFraction * 10; // Scale to reasonable units

  return Math.max(0.1, Math.min(stake, 5.0)); // Cap between 0.1 and 5 units
}

/**
 * Determine bet result
 */
function determineBetResult(betType, teamSide, line, homeScore, awayScore) {
  if (homeScore === null || awayScore === null) {
    return { result: 'PENDING', pnl: 0 };
  }

  if (betType === 'spread') {
    // teamSide is 'home' or 'away'
    // line is the spread for that team
    const actualSpread = homeScore - awayScore; // home perspective
    const coverMargin = teamSide === 'home' 
      ? actualSpread - (-line) // home covers if actual > expected
      : -actualSpread - (-line); // away covers if away beats expected

    if (Math.abs(coverMargin) < 0.5) {
      return { result: 'PUSH', pnl: 0 };
    }
    
    const win = coverMargin > 0;
    return { result: win ? 'WIN' : 'LOSS', pnl: win ? 1 : -1 };
  } else if (betType === 'total') {
    // teamSide is 'over' or 'under'
    const actualTotal = homeScore + awayScore;
    const diff = actualTotal - line;

    if (Math.abs(diff) < 0.5) {
      return { result: 'PUSH', pnl: 0 };
    }

    const win = (teamSide === 'over' && diff > 0) || (teamSide === 'under' && diff < 0);
    return { result: win ? 'WIN' : 'LOSS', pnl: win ? 1 : -1 };
  }

  return { result: 'UNKNOWN', pnl: 0 };
}

/**
 * Run backtest
 */
async function runBacktest(params) {
  console.log('🎯 Starting Backtest...');
  console.log('Parameters:', JSON.stringify(params, null, 2));

  const seasons = parseSeasonRange(params.season);
  const weeks = parseWeekRange(params.weeks);
  
  const bets = [];
  const weeklyStats = {};

  // Walk forward through each season-week combination
  for (const season of seasons) {
    for (const week of weeks) {
      console.log(`\n📊 Processing ${season} Week ${week}...`);

      // Fetch games for this week
      const games = await prisma.game.findMany({
        where: { season, week },
        include: {
          homeTeam: true,
          awayTeam: true,
          marketLines: true,
          matchupOutputs: {
            where: { modelVersion: 'v0.0.1' },
          },
        },
        orderBy: { date: 'asc' },
      });

      console.log(`   Found ${games.length} games`);

      // Process each game
      for (const game of games) {
        const matchupOutput = game.matchupOutputs[0];
        if (!matchupOutput) continue;

        const spreadLine = game.marketLines.find(l => l.lineType === 'spread');
        const totalLine = game.marketLines.find(l => l.lineType === 'total');

        const impliedSpread = matchupOutput.impliedSpread || 0;
        const impliedTotal = matchupOutput.impliedTotal || 45;
        const marketSpread = spreadLine?.closingLine || 0;
        const marketTotal = totalLine?.closingLine || 45;

        // Calculate edges
        const spreadEdge = Math.abs(impliedSpread - marketSpread);
        const totalEdge = Math.abs(impliedTotal - marketTotal);

        // Check confidence filter
        if (!params.confidence.includes(matchupOutput.edgeConfidence)) {
          continue;
        }

        // Check spread bet
        if (params.bet.includes('spread') && spreadEdge >= params.minEdge) {
          const favoredSide = impliedSpread < 0 ? 'home' : 'away';
          const favoredTeam = favoredSide === 'home' ? game.homeTeam.name : game.awayTeam.name;
          const line = Math.abs(impliedSpread);
          
          const stake = calculateKellyStake(spreadEdge, params.price, params.kelly);
          const betResult = determineBetResult('spread', favoredSide, line, game.homeScore, game.awayScore);
          const pnl = betResult.pnl * stake;
          const clv = spreadEdge; // Simplified CLV

          bets.push({
            gameId: game.id,
            season,
            week,
            matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
            betType: 'spread',
            pickLabel: `${favoredTeam} ${impliedSpread > 0 ? '+' : ''}${impliedSpread.toFixed(1)}`,
            line: impliedSpread,
            marketLine: marketSpread,
            price: params.price,
            stake,
            edge: spreadEdge,
            confidence: matchupOutput.edgeConfidence,
            clv,
            result: betResult.result,
            pnl,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
          });
        }

        // Check total bet
        if (params.bet.includes('total') && totalEdge >= params.minEdge) {
          const overUnder = impliedTotal > marketTotal ? 'over' : 'under';
          const line = impliedTotal;
          
          const stake = calculateKellyStake(totalEdge, params.price, params.kelly);
          const betResult = determineBetResult('total', overUnder, marketTotal, game.homeScore, game.awayScore);
          const pnl = betResult.pnl * stake;
          const clv = totalEdge;

          bets.push({
            gameId: game.id,
            season,
            week,
            matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
            betType: 'total',
            pickLabel: `${overUnder.charAt(0).toUpperCase() + overUnder.slice(1)} ${line.toFixed(1)}`,
            line: impliedTotal,
            marketLine: marketTotal,
            price: params.price,
            stake,
            edge: totalEdge,
            confidence: matchupOutput.edgeConfidence,
            clv,
            result: betResult.result,
            pnl,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
          });
        }
      }
    }
  }

  console.log(`\n✅ Processed ${bets.length} total bets`);

  // Calculate summary statistics
  const completedBets = bets.filter(b => b.result !== 'PENDING');
  const wins = completedBets.filter(b => b.result === 'WIN').length;
  const losses = completedBets.filter(b => b.result === 'LOSS').length;
  const pushes = completedBets.filter(b => b.result === 'PUSH').length;
  
  const totalRisked = completedBets.reduce((sum, b) => sum + b.stake, 0);
  const totalProfit = completedBets.reduce((sum, b) => sum + b.pnl, 0);
  const roi = totalRisked > 0 ? (totalProfit / totalRisked) * 100 : 0;
  const hitRate = completedBets.length > 0 ? (wins / completedBets.length) * 100 : 0;
  const avgClv = bets.length > 0 ? bets.reduce((sum, b) => sum + b.clv, 0) / bets.length : 0;
  const avgStake = bets.length > 0 ? bets.reduce((sum, b) => sum + b.stake, 0) / bets.length : 0;

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let cumPnl = 0;
  
  for (const bet of completedBets) {
    cumPnl += bet.pnl;
    if (cumPnl > peak) peak = cumPnl;
    const drawdown = peak - cumPnl;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Confidence breakdown
  const confidenceBreakdown = {
    A: bets.filter(b => b.confidence === 'A').length,
    B: bets.filter(b => b.confidence === 'B').length,
    C: bets.filter(b => b.confidence === 'C').length,
  };

  const summary = {
    parameters: params,
    totalBets: bets.length,
    completedBets: completedBets.length,
    pendingBets: bets.length - completedBets.length,
    wins,
    losses,
    pushes,
    hitRate: hitRate.toFixed(2) + '%',
    totalRisked: totalRisked.toFixed(2),
    totalProfit: totalProfit.toFixed(2),
    roi: roi.toFixed(2) + '%',
    avgClv: avgClv.toFixed(2),
    avgStake: avgStake.toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    confidenceBreakdown,
    timestamp: new Date().toISOString(),
  };

  return { bets, summary };
}

/**
 * Write CSV report
 */
function writeCSV(bets, filename) {
  const headers = [
    'season', 'week', 'gameId', 'matchup', 'betType', 'pickLabel',
    'line', 'marketLine', 'edge', 'confidence', 'price', 'stake',
    'result', 'pnl', 'clv', 'homeScore', 'awayScore'
  ];

  const rows = bets.map(bet => [
    bet.season,
    bet.week,
    bet.gameId,
    bet.matchup,
    bet.betType,
    bet.pickLabel,
    bet.line.toFixed(1),
    bet.marketLine.toFixed(1),
    bet.edge.toFixed(2),
    bet.confidence,
    bet.price,
    bet.stake.toFixed(2),
    bet.result,
    bet.pnl.toFixed(2),
    bet.clv.toFixed(2),
    bet.homeScore || '',
    bet.awayScore || '',
  ]);

  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  fs.writeFileSync(filename, csv);
  console.log(`📄 CSV report written: ${filename}`);
}

/**
 * Write JSON summary
 */
function writeSummaryJSON(summary, filename) {
  fs.writeFileSync(filename, JSON.stringify(summary, null, 2));
  console.log(`📋 Summary JSON written: ${filename}`);
}

/**
 * Generate simple text-based "chart" (placeholder for actual charts)
 */
function generateTextCharts(bets, reportsDir, basename) {
  const completedBets = bets.filter(b => b.result !== 'PENDING');
  
  // Equity curve data
  let cumPnl = 0;
  const equityData = completedBets.map((bet, idx) => {
    cumPnl += bet.pnl;
    return { x: idx + 1, y: cumPnl.toFixed(2) };
  });

  // Write equity data as JSON (for future charting)
  const equityFile = path.join(reportsDir, `${basename}_equity.json`);
  fs.writeFileSync(equityFile, JSON.stringify({ data: equityData }, null, 2));
  console.log(`📈 Equity data written: ${equityFile}`);

  // Drawdown data
  let peak = 0;
  const drawdownData = completedBets.map((bet, idx) => {
    const pnl = equityData[idx].y;
    if (pnl > peak) peak = pnl;
    const drawdown = peak - pnl;
    return { x: idx + 1, y: drawdown.toFixed(2) };
  });

  const drawdownFile = path.join(reportsDir, `${basename}_drawdown.json`);
  fs.writeFileSync(drawdownFile, JSON.stringify({ data: drawdownData }, null, 2));
  console.log(`📉 Drawdown data written: ${drawdownFile}`);

  // Edge histogram data
  const edgeBuckets = {};
  bets.forEach(bet => {
    const bucket = Math.floor(bet.edge);
    edgeBuckets[bucket] = (edgeBuckets[bucket] || 0) + 1;
  });

  const histFile = path.join(reportsDir, `${basename}_edge_hist.json`);
  fs.writeFileSync(histFile, JSON.stringify({ data: edgeBuckets }, null, 2));
  console.log(`📊 Edge histogram data written: ${histFile}`);
}

/**
 * Main execution
 */
async function main() {
  try {
    const params = parseArgs();
    
    // Run backtest
    const { bets, summary } = await runBacktest(params);

    // Create reports directory
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Generate filenames
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const basename = `backtest_${timestamp}`;
    
    const csvFile = path.join(reportsDir, `${basename}.csv`);
    const summaryFile = path.join(reportsDir, `${basename}_summary.json`);

    // Write reports
    writeCSV(bets, csvFile);
    writeSummaryJSON(summary, summaryFile);
    generateTextCharts(bets, reportsDir, basename);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKTEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Bets:        ${summary.totalBets}`);
    console.log(`Completed:         ${summary.completedBets}`);
    console.log(`Pending:           ${summary.pendingBets}`);
    console.log(`Hit Rate:          ${summary.hitRate}`);
    console.log(`ROI:               ${summary.roi}`);
    console.log(`Total Profit:      ${summary.totalProfit} units`);
    console.log(`Avg CLV:           ${summary.avgClv} pts`);
    console.log(`Max Drawdown:      ${summary.maxDrawdown} units`);
    console.log(`Avg Stake:         ${summary.avgStake} units`);
    console.log(`Confidence Mix:    A=${summary.confidenceBreakdown.A}, B=${summary.confidenceBreakdown.B}, C=${summary.confidenceBreakdown.C}`);
    console.log('='.repeat(60));

    console.log(`\n✅ Backtest complete! Reports saved to ${reportsDir}`);
  } catch (error) {
    console.error('❌ Error running backtest:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
