/**
 * V2 Matchup Weights Optimization (Enhanced)
 * 
 * Tests:
 * 1. Optimal scaling factor for V2 unit grades (8.0 to 20.0)
 * 2. Hybrid V1+V2 models (blending composite ratings with matchup adjustments)
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

interface V1Rating {
  teamId: string;
  powerRating: number;
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

interface ScaleTestResult {
  scale: number;
  mae: number;
  rmse: number;
}

interface HybridTestResult {
  v1Weight: number;
  v2Weight: number;
  scale: number;
  mae: number;
  rmse: number;
}

const HFA = 2.5; // Home Field Advantage
const BEST_SCENARIO: Scenario = {
  name: 'Balanced Matchup',
  wRun: 0.40,
  wPass: 0.40,
  wExplo: 0.20,
};

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
 * Fetch V1 Power Ratings for all teams
 */
async function fetchV1Ratings(season: number): Promise<Map<string, V1Rating>> {
  // Fetch from TeamSeasonRating table (V1 model)
  const ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion: 'v1',
    },
    select: {
      teamId: true,
      powerRating: true,
      rating: true, // Fallback if powerRating is null
    },
  });

  const ratingsMap = new Map<string, V1Rating>();
  
  for (const rating of ratings) {
    // Use powerRating if available, otherwise fall back to rating field
    const value = rating.powerRating !== null 
      ? Number(rating.powerRating) 
      : (rating.rating !== null ? Number(rating.rating) : null);
    
    if (value !== null) {
      ratingsMap.set(rating.teamId, {
        teamId: rating.teamId,
        powerRating: value,
      });
    }
  }

  return ratingsMap;
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
 * Predict V2 margin using matchup weights and scale
 */
function predictV2Margin(
  matchups: { netRunAdv: number; netPassAdv: number; netExploAdv: number },
  scenario: Scenario,
  scale: number
): number {
  const compositeZ =
    matchups.netRunAdv * scenario.wRun +
    matchups.netPassAdv * scenario.wPass +
    matchups.netExploAdv * scenario.wExplo;

  const predictedMargin = compositeZ * scale + HFA;
  return predictedMargin;
}

/**
 * Predict V1 margin using power ratings
 */
function predictV1Margin(
  homeRating: number,
  awayRating: number
): number {
  return homeRating - awayRating + HFA;
}

/**
 * Test different scale factors for V2
 */
function testScaleFactors(
  games: GameResult[],
  gradesMap: Map<string, UnitGrades>,
  scenario: Scenario
): ScaleTestResult[] {
  const results: ScaleTestResult[] = [];
  const scaleRange = Array.from({ length: 13 }, (_, i) => 8.0 + i * 1.0); // 8.0 to 20.0

  for (const scale of scaleRange) {
    const errors: number[] = [];
    let validPredictions = 0;

    for (const game of games) {
      const homeGrades = gradesMap.get(game.homeTeamId);
      const awayGrades = gradesMap.get(game.awayTeamId);

      if (!homeGrades || !awayGrades) {
        continue;
      }

      const matchups = calculateMatchups(homeGrades, awayGrades);
      const predictedMargin = predictV2Margin(matchups, scenario, scale);
      const error = Math.abs(predictedMargin - game.actualMargin);

      errors.push(error);
      validPredictions++;
    }

    if (validPredictions === 0) continue;

    const mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    const meanError = mae;
    const variance =
      errors.reduce((sum, e) => sum + Math.pow(e - meanError, 2), 0) / errors.length;
    const rmse = Math.sqrt(variance);

    results.push({
      scale,
      mae,
      rmse,
    });
  }

  return results;
}

/**
 * Test hybrid V1+V2 models
 */
function testHybridModels(
  games: GameResult[],
  gradesMap: Map<string, UnitGrades>,
  v1RatingsMap: Map<string, V1Rating>,
  scenario: Scenario,
  bestScale: number
): HybridTestResult[] {
  const results: HybridTestResult[] = [];
  const v2Weights = Array.from({ length: 11 }, (_, i) => i * 0.1); // 0.0 to 1.0 in 0.1 steps

  for (const v2Weight of v2Weights) {
    const v1Weight = 1.0 - v2Weight;
    const errors: number[] = [];
    let validPredictions = 0;

    for (const game of games) {
      const homeGrades = gradesMap.get(game.homeTeamId);
      const awayGrades = gradesMap.get(game.awayTeamId);
      const homeV1 = v1RatingsMap.get(game.homeTeamId);
      const awayV1 = v1RatingsMap.get(game.awayTeamId);

      if (!homeGrades || !awayGrades || !homeV1 || !awayV1) {
        continue;
      }

      // Calculate V1 prediction
      const v1Margin = predictV1Margin(homeV1.powerRating, awayV1.powerRating);

      // Calculate V2 prediction
      const matchups = calculateMatchups(homeGrades, awayGrades);
      const v2Margin = predictV2Margin(matchups, scenario, bestScale);

      // Hybrid prediction
      const hybridMargin = v1Margin * v1Weight + v2Margin * v2Weight;
      const error = Math.abs(hybridMargin - game.actualMargin);

      errors.push(error);
      validPredictions++;
    }

    if (validPredictions === 0) continue;

    const mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    const meanError = mae;
    const variance =
      errors.reduce((sum, e) => sum + Math.pow(e - meanError, 2), 0) / errors.length;
    const rmse = Math.sqrt(variance);

    results.push({
      v1Weight,
      v2Weight,
      scale: bestScale,
      mae,
      rmse,
    });
  }

  return results;
}

/**
 * Main optimization function
 */
async function optimizeV2Weights(season: number, weeks: number[]): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎯 V2 SCALING & HYBRID MODEL OPTIMIZATION`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);

  // Fetch data
  console.log('📊 Fetching unit grades...');
  const gradesMap = await fetchUnitGrades(season);
  console.log(`   ✅ Loaded grades for ${gradesMap.size} teams\n`);

  console.log('📊 Fetching V1 power ratings...');
  const v1RatingsMap = await fetchV1Ratings(season);
  console.log(`   ✅ Loaded V1 ratings for ${v1RatingsMap.size} teams\n`);

  console.log('📅 Fetching completed games...');
  const games = await fetchCompletedGames(season, weeks);
  console.log(`   ✅ Found ${games.length} completed games\n`);

  if (games.length === 0) {
    console.log('   ⚠️  No completed games found. Exiting.');
    return;
  }

  const V1_BASELINE = 10.8;

  // Step 1: Find optimal scale factor for V2
  console.log('🔍 Step 1: Finding optimal V2 scale factor...\n');
  const scaleResults = testScaleFactors(games, gradesMap, BEST_SCENARIO);
  scaleResults.sort((a, b) => a.mae - b.mae);
  const bestScaleResult = scaleResults[0];

  console.log('Scale Factor'.padEnd(15) + 'MAE'.padEnd(12) + 'RMSE');
  console.log('-'.repeat(40));
  for (const result of scaleResults.slice(0, 5)) {
    console.log(
      result.scale.toFixed(1).padEnd(15) +
        result.mae.toFixed(2).padEnd(12) +
        result.rmse.toFixed(2)
    );
  }
  console.log(`\n🏆 Best Scale: ${bestScaleResult.scale.toFixed(1)} (MAE: ${bestScaleResult.mae.toFixed(2)})\n`);

  // Step 2: Test hybrid models
  console.log('🔍 Step 2: Testing Hybrid V1+V2 Models...\n');
  const hybridResults = testHybridModels(
    games,
    gradesMap,
    v1RatingsMap,
    BEST_SCENARIO,
    bestScaleResult.scale
  );
  hybridResults.sort((a, b) => a.mae - b.mae);
  const bestHybrid = hybridResults[0];

  console.log('V1 Weight'.padEnd(12) + 'V2 Weight'.padEnd(12) + 'MAE'.padEnd(12) + 'RMSE');
  console.log('-'.repeat(50));
  for (const result of hybridResults) {
    const v1Pct = (result.v1Weight * 100).toFixed(0);
    const v2Pct = (result.v2Weight * 100).toFixed(0);
    console.log(
      `${v1Pct}%`.padEnd(12) +
        `${v2Pct}%`.padEnd(12) +
        result.mae.toFixed(2).padEnd(12) +
        result.rmse.toFixed(2)
    );
  }

  console.log('\n' + '-'.repeat(70));

  // Final comparison
  console.log(`\n📊 FINAL RESULTS:\n`);
  console.log(`V1 Baseline:        ${V1_BASELINE.toFixed(2)} MAE`);
  console.log(`Pure V2 (scale ${bestScaleResult.scale.toFixed(1)}): ${bestScaleResult.mae.toFixed(2)} MAE`);
  console.log(`Best Hybrid:       ${bestHybrid.mae.toFixed(2)} MAE`);
  console.log(`   Blend: ${(bestHybrid.v1Weight * 100).toFixed(0)}% V1 + ${(bestHybrid.v2Weight * 100).toFixed(0)}% V2`);
  console.log(`   Scale: ${bestHybrid.scale.toFixed(1)}\n`);

  if (bestHybrid.mae < V1_BASELINE) {
    const improvement = ((V1_BASELINE - bestHybrid.mae) / V1_BASELINE) * 100;
    console.log(`✅ Hybrid model BEATS V1 baseline by ${improvement.toFixed(1)}%`);
    console.log(`   Improvement: ${(V1_BASELINE - bestHybrid.mae).toFixed(2)} points\n`);
  } else {
    const degradation = ((bestHybrid.mae - V1_BASELINE) / V1_BASELINE) * 100;
    console.log(`⚠️  Hybrid model underperforms V1 by ${degradation.toFixed(1)}%`);
    console.log(`   Difference: ${(bestHybrid.mae - V1_BASELINE).toFixed(2)} points\n`);
  }

  // Show top 5 hybrid configurations
  console.log('🏆 Top 5 Hybrid Configurations:\n');
  for (let i = 0; i < Math.min(5, hybridResults.length); i++) {
    const result = hybridResults[i];
    const v1Pct = (result.v1Weight * 100).toFixed(0);
    const v2Pct = (result.v2Weight * 100).toFixed(0);
    console.log(
      `${i + 1}. ${v1Pct}% V1 + ${v2Pct}% V2 (Scale: ${result.scale.toFixed(1)}) - MAE: ${result.mae.toFixed(2)}`
    );
  }

  console.log(`\n${'='.repeat(70)}\n`);
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
