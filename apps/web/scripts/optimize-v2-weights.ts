/**
 * V2 Matchup Weights Optimization
 * 
 * Backtests different "Matchup Philosophies" against actual 2025 game results
 * to determine optimal weights for Run/Pass/Explosiveness matchups.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/optimize-v2-weights.ts --season 2025 --weeks 8,9,10,11,12
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface UnitGrades {
  teamId: string;
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
}

interface GameResult {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  actualMargin: number; // Home - Away
}

interface Scenario {
  name: string;
  wRun: number;
  wPass: number;
  wExplo: number;
}

interface PredictionResult {
  scenario: string;
  predictions: number;
  mae: number;
  rmse: number;
  meanError: number;
  stdError: number;
}

const HFA = 2.5; // Home Field Advantage
const SCALE = 14.0; // Z-score to points conversion

/**
 * Fetch unit grades for all teams in the season
 */
async function fetchUnitGrades(season: number): Promise<Map<string, UnitGrades>> {
  const grades = await prisma.teamUnitGrades.findMany({
    where: { season },
    include: {
      team: {
        select: { id: true, name: true },
      },
    },
  });

  const gradesMap = new Map<string, UnitGrades>();
  for (const grade of grades) {
    gradesMap.set(grade.teamId, {
      teamId: grade.teamId,
      offRunGrade: grade.offRunGrade,
      defRunGrade: grade.defRunGrade,
      offPassGrade: grade.offPassGrade,
      defPassGrade: grade.defPassGrade,
      offExplosiveness: grade.offExplosiveness,
      defExplosiveness: grade.defExplosiveness,
    });
  }

  return gradesMap;
}

/**
 * Fetch completed games for the specified weeks
 */
async function fetchCompletedGames(season: number, weeks: number[]): Promise<GameResult[]> {
  const games = await prisma.game.findMany({
    where: {
      season,
      week: { in: weeks },
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
  });

  return games
    .filter(g => g.homeScore !== null && g.awayScore !== null)
    .map(g => ({
      gameId: g.id,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: g.homeScore!,
      awayScore: g.awayScore!,
      actualMargin: g.homeScore! - g.awayScore!,
    }));
}

/**
 * Calculate matchup advantages for a game
 */
function calculateMatchups(
  homeGrades: UnitGrades,
  awayGrades: UnitGrades
): {
  netRunAdv: number;
  netPassAdv: number;
  netExploAdv: number;
} {
  // Run Matchup
  const homeRunAdv = homeGrades.offRunGrade - awayGrades.defRunGrade;
  const awayRunAdv = awayGrades.offRunGrade - homeGrades.defRunGrade;
  const netRunAdv = homeRunAdv - awayRunAdv;

  // Pass Matchup
  const homePassAdv = homeGrades.offPassGrade - awayGrades.defPassGrade;
  const awayPassAdv = awayGrades.offPassGrade - homeGrades.defPassGrade;
  const netPassAdv = homePassAdv - awayPassAdv;

  // Explosiveness Matchup
  const homeExploAdv = homeGrades.offExplosiveness - awayGrades.defExplosiveness;
  const awayExploAdv = awayGrades.offExplosiveness - homeGrades.defExplosiveness;
  const netExploAdv = homeExploAdv - awayExploAdv;

  return {
    netRunAdv,
    netPassAdv,
    netExploAdv,
  };
}

/**
 * Predict game margin using matchup weights
 */
function predictMargin(
  matchups: { netRunAdv: number; netPassAdv: number; netExploAdv: number },
  scenario: Scenario
): number {
  const compositeZ =
    matchups.netRunAdv * scenario.wRun +
    matchups.netPassAdv * scenario.wPass +
    matchups.netExploAdv * scenario.wExplo;

  const predictedMargin = compositeZ * SCALE + HFA;
  return predictedMargin;
}

/**
 * Evaluate a scenario against actual game results
 */
function evaluateScenario(
  scenario: Scenario,
  games: GameResult[],
  gradesMap: Map<string, UnitGrades>
): PredictionResult {
  const errors: number[] = [];
  let validPredictions = 0;

  for (const game of games) {
    const homeGrades = gradesMap.get(game.homeTeamId);
    const awayGrades = gradesMap.get(game.awayTeamId);

    if (!homeGrades || !awayGrades) {
      continue; // Skip games where we don't have unit grades
    }

    const matchups = calculateMatchups(homeGrades, awayGrades);
    const predictedMargin = predictMargin(matchups, scenario);
    const error = Math.abs(predictedMargin - game.actualMargin);

    errors.push(error);
    validPredictions++;
  }

  if (validPredictions === 0) {
    return {
      scenario: scenario.name,
      predictions: 0,
      mae: Infinity,
      rmse: Infinity,
      meanError: 0,
      stdError: 0,
    };
  }

  const mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  const meanError = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  const variance =
    errors.reduce((sum, e) => sum + Math.pow(e - meanError, 2), 0) / errors.length;
  const rmse = Math.sqrt(variance);
  const stdError = Math.sqrt(variance);

  return {
    scenario: scenario.name,
    predictions: validPredictions,
    mae,
    rmse,
    meanError,
    stdError,
  };
}

/**
 * Main optimization function
 */
async function optimizeV2Weights(season: number, weeks: number[]): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎯 V2 MATCHUP WEIGHTS OPTIMIZATION`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);

  // Fetch data
  console.log('📊 Fetching unit grades...');
  const gradesMap = await fetchUnitGrades(season);
  console.log(`   ✅ Loaded grades for ${gradesMap.size} teams\n`);

  console.log('📅 Fetching completed games...');
  const games = await fetchCompletedGames(season, weeks);
  console.log(`   ✅ Found ${games.length} completed games\n`);

  if (games.length === 0) {
    console.log('   ⚠️  No completed games found. Exiting.');
    return;
  }

  // Define scenarios to test
  const scenarios: Scenario[] = [
    {
      name: 'Trench Warfare',
      wRun: 0.50,
      wPass: 0.30,
      wExplo: 0.20,
    },
    {
      name: 'Modern Air Raid',
      wRun: 0.20,
      wPass: 0.60,
      wExplo: 0.20,
    },
    {
      name: 'Balanced Matchup',
      wRun: 0.40,
      wPass: 0.40,
      wExplo: 0.20,
    },
  ];

  console.log('🧪 Testing scenarios...\n');

  // Evaluate each scenario
  const results: PredictionResult[] = [];
  for (const scenario of scenarios) {
    const result = evaluateScenario(scenario, games, gradesMap);
    results.push(result);
  }

  // Sort by MAE (lower is better)
  results.sort((a, b) => a.mae - b.mae);

  // Display results
  console.log('📊 RESULTS:\n');
  console.log('Scenario'.padEnd(25) + 'MAE'.padEnd(12) + 'RMSE'.padEnd(12) + 'Games');
  console.log('-'.repeat(70));

  for (const result of results) {
    const maeStr = result.mae.toFixed(2);
    const rmseStr = result.rmse.toFixed(2);
    console.log(
      result.scenario.padEnd(25) +
        maeStr.padEnd(12) +
        rmseStr.padEnd(12) +
        result.predictions.toString()
    );
  }

  console.log('\n' + '-'.repeat(70));

  // Compare to V1 baseline
  const V1_BASELINE = 10.8;
  const winner = results[0];

  console.log(`\n🏆 Winner: ${winner.scenario}`);
  console.log(`   MAE: ${winner.mae.toFixed(2)} points`);
  console.log(`   RMSE: ${winner.rmse.toFixed(2)} points`);
  console.log(`   Predictions: ${winner.predictions} games\n`);

  console.log(`📈 Comparison to V1 Baseline (${V1_BASELINE} MAE):`);
  if (winner.mae < V1_BASELINE) {
    const improvement = ((V1_BASELINE - winner.mae) / V1_BASELINE) * 100;
    console.log(
      `   ✅ V2 ${winner.scenario} outperforms V1 by ${improvement.toFixed(1)}%`
    );
    console.log(`   Improvement: ${(V1_BASELINE - winner.mae).toFixed(2)} points\n`);
  } else {
    const degradation = ((winner.mae - V1_BASELINE) / V1_BASELINE) * 100;
    console.log(
      `   ⚠️  V2 ${winner.scenario} underperforms V1 by ${degradation.toFixed(1)}%`
    );
    console.log(`   Difference: ${(winner.mae - V1_BASELINE).toFixed(2)} points\n`);
  }

  // Show scenario details
  console.log('📋 Scenario Details:\n');
  for (const scenario of scenarios) {
    const result = results.find(r => r.scenario === scenario.name)!;
    console.log(`${scenario.name}:`);
    console.log(`   Weights: Run ${(scenario.wRun * 100).toFixed(0)}%, Pass ${(scenario.wPass * 100).toFixed(0)}%, Explo ${(scenario.wExplo * 100).toFixed(0)}%`);
    console.log(`   MAE: ${result.mae.toFixed(2)} points`);
    console.log(`   RMSE: ${result.rmse.toFixed(2)} points\n`);
  }

  console.log(`${'='.repeat(70)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  let season = 2025;
  let weeks: number[] = [8, 9, 10, 11, 12];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--weeks' && args[i + 1]) {
      weeks = args[i + 1]
        .split(',')
        .map(w => parseInt(w.trim(), 10))
        .filter(w => !isNaN(w));
      i++;
    }
  }

  try {
    await optimizeV2Weights(season, weeks);
  } catch (error) {
    console.error('❌ Optimization failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

