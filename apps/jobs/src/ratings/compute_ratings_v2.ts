/**
 * Ratings v2 Computation Job
 * 
 * Enhanced ratings with Strength of Schedule (SoS) adjustments and shrinkage regularization.
 * 
 * Key improvements over v1:
 * - Opponent-adjusted features (SoS): Features adjusted by opponent strength
 * - Shrinkage: Stabilize early-season volatility by shrinking toward priors
 * - Enhanced HFA: Conference and distance-based HFA (fallback to v1 default)
 * 
 * Usage:
 *   node apps/jobs/dist/src/ratings/compute_ratings_v2.js --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { FeatureLoader, TeamFeatures } from './feature-loader';
import { TeamResolver } from '../../adapters/TeamResolver';
import { getModelConfig } from '../config/model-weights';
import * as fs from 'fs';
import * as path from 'path';
// Re-use functions from v1
import { 
  calculateZScores, 
  getZScore, 
  ZScoreStats,
  computeOffensiveIndex, 
  computeDefensiveIndex,
  calculateConfidence,
  getDataSourceString,
  calculateTalentComponent,
} from './compute_ratings_v1';

const prisma = new PrismaClient();

// Re-export types for compatibility
export type { TeamFeatures, ZScoreStats };

// ============================================================================
// PHASE 1: INSTRUMENTATION & GATES
// ============================================================================

interface StageStats {
  stage: string;
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  zeros: number;
  zeroPct: number;
  timestamp: string;
}

const stageStats: StageStats[] = [];

function computeStats(ratings: number[], stageName: string): StageStats {
  const validRatings = ratings.filter(r => isFinite(r) && !isNaN(r));
  const count = validRatings.length;
  const mean = count > 0 ? validRatings.reduce((a, b) => a + b, 0) / count : 0;
  const variance = count > 0 
    ? validRatings.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count 
    : 0;
  const std = Math.sqrt(variance);
  const min = count > 0 ? Math.min(...validRatings) : 0;
  const max = count > 0 ? Math.max(...validRatings) : 0;
  const zeros = validRatings.filter(r => r === 0).length;
  const zeroPct = count > 0 ? (zeros / count) * 100 : 0;
  
  return {
    stage: stageName,
    count,
    mean,
    std,
    min,
    max,
    zeros,
    zeroPct,
    timestamp: new Date().toISOString(),
  };
}

function logStageStats(ratings: number[], stageName: string) {
  const stats = computeStats(ratings, stageName);
  stageStats.push(stats);
  console.log(`\n📊 ${stageName} Stats:`);
  console.log(`   Count: ${stats.count}, Mean: ${stats.mean.toFixed(4)}, Std: ${stats.std.toFixed(4)}`);
  console.log(`   Range: [${stats.min.toFixed(4)}, ${stats.max.toFixed(4)}]`);
  console.log(`   Zeros: ${stats.zeros} (${stats.zeroPct.toFixed(2)}%)`);
  return stats;
}

function saveStageStats(season: number, modelVersion: string) {
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const csvPath = path.join(reportsDir, 'v2_stage_stats.csv');
  
  const header = 'stage,count,mean,std,min,max,zeros,zero_pct,timestamp,season,model_version\n';
  const rows = stageStats.map(s => 
    `${s.stage},${s.count},${s.mean.toFixed(4)},${s.std.toFixed(4)},${s.min.toFixed(4)},${s.max.toFixed(4)},${s.zeros},${s.zeroPct.toFixed(2)},${s.timestamp},${season},${modelVersion}`
  ).join('\n');
  
  fs.writeFileSync(csvPath, header + rows);
  console.log(`\n💾 Saved stage stats to ${csvPath}`);
}

function checkSanityGates(finalRatings: number[], modelVersion: string): { passed: boolean; failures: string[] } {
  const stats = computeStats(finalRatings, 'final');
  const failures: string[] = [];
  
  // Gate A: stddev ≥ 2.0
  if (stats.std < 2.0) {
    failures.push(`Gate A FAIL: stddev ${stats.std.toFixed(4)} < 2.0`);
  }
  
  // Gate B: ≤2% zeros
  if (stats.zeroPct > 2.0) {
    failures.push(`Gate B FAIL: ${stats.zeroPct.toFixed(2)}% zeros > 2.0%`);
  }
  
  // Dump top 10 offenders if gates fail
  if (failures.length > 0) {
    const sorted = [...finalRatings].sort((a, b) => Math.abs(a) - Math.abs(b));
    const topOffenders = sorted.slice(0, 10);
    console.log(`\n⚠️  Top 10 offenders (by absolute value):`);
    topOffenders.forEach((val, idx) => {
      console.log(`   ${idx + 1}. ${val.toFixed(4)}`);
    });
  }
  
  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Strength of Schedule Adjustment
 * 
 * Adjusts raw features by opponent strength to normalize for schedule difficulty.
 * 
 * Logic:
 * - Query all games for this team in the season
 * - For each opponent, get their defensive/offensive ratings
 * - Calculate average opponent strength
 * - Adjust offensive features based on opponent defensive strength
 * - Adjust defensive features based on opponent offensive strength
 * 
 * @param features - Raw team features
 * @param season - Season for context
 * @param allTeamRatings - Current ratings map for opponent strength lookup
 * @param prisma - Prisma client for database queries
 * @returns Adjusted features with SoS corrections applied
 */
async function applyStrengthOfSchedule(
  features: TeamFeatures,
  season: number,
  allTeamRatings: Map<string, { offenseRating: number; defenseRating: number }>,
  prisma: PrismaClient,
  sosWeight: number = 0.05 // SoS weight percentage (default 5%)
): Promise<TeamFeatures> {
  try {
    // Query all games for this team in the season
    const games = await prisma.game.findMany({
      where: {
        season,
        OR: [
          { homeTeamId: features.teamId },
          { awayTeamId: features.teamId }
        ]
      },
      select: {
        homeTeamId: true,
        awayTeamId: true,
      }
    });

    if (games.length === 0) {
      // No games played yet, return features unchanged
      return features;
    }

    // Collect opponent ratings
    const opponentDefensiveRatings: number[] = [];
    const opponentOffensiveRatings: number[] = [];
    const leagueAvgDefense = 0.0; // League average (z-score mean)
    const leagueAvgOffense = 0.0; // League average (z-score mean)

    for (const game of games) {
      const opponentId = game.homeTeamId === features.teamId 
        ? game.awayTeamId 
        : game.homeTeamId;

      const opponentRating = allTeamRatings.get(opponentId);
      if (opponentRating) {
        // Opponent's defensive rating tells us how strong their defense is
        // Higher defensive rating (less negative) = weaker defense = easier for offense
        // Lower defensive rating (more negative) = stronger defense = harder for offense
        opponentDefensiveRatings.push(opponentRating.defenseRating);
        
        // Opponent's offensive rating tells us how strong their offense is
        // Higher offensive rating = stronger offense = harder for defense
        // Lower offensive rating = weaker offense = easier for defense
        opponentOffensiveRatings.push(opponentRating.offenseRating);
      }
    }

    if (opponentDefensiveRatings.length === 0 || opponentOffensiveRatings.length === 0) {
      // No opponent ratings available, return features unchanged
      return features;
    }

    // Calculate average opponent strength (relative to league average)
    const avgOpponentDefense = opponentDefensiveRatings.reduce((sum, r) => sum + r, 0) / opponentDefensiveRatings.length;
    const avgOpponentOffense = opponentOffensiveRatings.reduce((sum, r) => sum + r, 0) / opponentOffensiveRatings.length;

    // SoS factor: How much harder/easier was the schedule than average?
    // For offense: stronger opponent defenses (more negative ratings) = harder schedule
    // For defense: stronger opponent offenses (more positive ratings) = harder schedule
    // Positive SoS = harder schedule (need to boost stats)
    // Negative SoS = easier schedule (need to reduce stats)
    const offensiveSoS = leagueAvgDefense - avgOpponentDefense; // More negative opponent defense = positive SoS = harder
    const defensiveSoS = avgOpponentOffense - leagueAvgOffense; // More positive opponent offense = positive SoS = harder

    // Adjust features proportionally
    // For offense: if schedule was harder (positive SoS), raw stats underestimate true ability - boost them
    // For defense: if schedule was harder (positive SoS), raw stats make defense look worse - boost them
    // Use configurable SoS weight (default 5% per point of SoS)
    const offensiveAdjustmentFactor = 1.0 + (offensiveSoS * sosWeight);
    const defensiveAdjustmentFactor = 1.0 + (defensiveSoS * sosWeight);

    // Apply adjustments to offensive features
    const adjustedFeatures: TeamFeatures = {
      ...features,
      yppOff: features.yppOff !== null ? features.yppOff * offensiveAdjustmentFactor : null,
      passYpaOff: features.passYpaOff !== null ? features.passYpaOff * offensiveAdjustmentFactor : null,
      rushYpcOff: features.rushYpcOff !== null ? features.rushYpcOff * offensiveAdjustmentFactor : null,
      successOff: features.successOff !== null ? features.successOff * offensiveAdjustmentFactor : null,
      epaOff: features.epaOff !== null ? features.epaOff * offensiveAdjustmentFactor : null,
      
      // For defensive features, invert the logic:
      // If opponents had strong offenses, our defense looks worse than it is
      // So we adjust upward (defensive stats are inverted - lower is better)
      yppDef: features.yppDef !== null ? features.yppDef * defensiveAdjustmentFactor : null,
      passYpaDef: features.passYpaDef !== null ? features.passYpaDef * defensiveAdjustmentFactor : null,
      rushYpcDef: features.rushYpcDef !== null ? features.rushYpcDef * defensiveAdjustmentFactor : null,
      successDef: features.successDef !== null ? features.successDef * defensiveAdjustmentFactor : null,
      epaDef: features.epaDef !== null ? features.epaDef * defensiveAdjustmentFactor : null,
    };

    return adjustedFeatures;

  } catch (error) {
    console.error(`   [SoS] Error adjusting features for ${features.teamId}:`, error);
    // Return unchanged features on error
    return features;
  }
}

/**
 * Shrinkage Regularization
 * 
 * Shrinks ratings toward a prior (e.g., league average or historical mean)
 * to reduce volatility in early-season when sample size is small.
 * 
 * Shrinkage factor: shrinks toward prior based on data quality and sample size
 * - High confidence + many games = minimal shrinkage (trust the data)
 * - Low confidence + few games = more shrinkage (trust the prior)
 * 
 * @param rawRating - Unadjusted rating from feature computation
 * @param prior - Prior rating to shrink toward (e.g., 0.0 or historical mean)
 * @param shrinkageFactor - How much to shrink (0.0 = no shrinkage, 1.0 = full prior)
 * @returns Shrunk rating
 */
function applyShrinkage(
  rawRating: number,
  prior: number,
  shrinkageFactor: number
): number {
  if (shrinkageFactor <= 0) {
    return rawRating; // No shrinkage
  }
  
  if (shrinkageFactor >= 1.0) {
    return prior; // Full shrinkage to prior
  }
  
  // Linear interpolation: (1 - λ) * raw + λ * prior
  return (1 - shrinkageFactor) * rawRating + shrinkageFactor * prior;
}

/**
 * Calculate shrinkage factor based on data quality and sample size
 * 
 * @param features - Team features with confidence and game count
 * @param modelConfig - Model configuration with shrinkage parameters
 * @returns Shrinkage factor (0.0 to 1.0)
 */
function calculateShrinkageFactor(
  features: TeamFeatures,
  modelConfig: ReturnType<typeof getModelConfig>
): number {
  // Use shrinkage config if available (v2), otherwise no shrinkage
  const shrinkageConfig = modelConfig.shrinkage;
  if (!shrinkageConfig) {
    return 0.0; // No shrinkage if not configured
  }
  
  // Stage 0 Rehab: Target 28-34% mid-season, hard bounds 18-42%
  // Breakdown:
  // - base_factor: 0.12
  // - confidence_multiplier: scaled 0-0.15 (cap at 0.15)
  // - games_multiplier: by games played
  //   - <3 games: 0.18
  //   - 3-4 games: 0.12
  //   - 5-7 games: 0.06
  //   - ≥8 games: 0.00
  
  const baseShrinkage = shrinkageConfig.base_factor || 0.12;
  
  // Confidence multiplier: (1 - confidence) * scale, capped at 0.15
  const confidenceScale = shrinkageConfig.confidence_weight || 0.5;
  const confidenceMultiplier = Math.min(0.15, (1.0 - (features.confidence || 0.5)) * confidenceScale);
  
  // Games multiplier: step function based on games played
  let gamesMultiplier = 0.0;
  const gamesCount = features.gamesCount || 0;
  if (gamesCount < 3) {
    gamesMultiplier = 0.18;
  } else if (gamesCount >= 3 && gamesCount <= 4) {
    gamesMultiplier = 0.12;
  } else if (gamesCount >= 5 && gamesCount <= 7) {
    gamesMultiplier = 0.06;
  } else {
    gamesMultiplier = 0.00; // ≥8 games
  }
  
  // Total shrinkage with hard bounds: 18% ≤ total ≤ 42%
  const totalShrinkage = baseShrinkage + confidenceMultiplier + gamesMultiplier;
  return Math.max(0.18, Math.min(0.42, totalShrinkage));
}

async function main() {
  try {
    const yargs = require('yargs/yargs');
    const argv = yargs(process.argv.slice(2))
      .option('season', { type: 'number', demandOption: true })
      .option('sos-weight', { type: 'number', description: 'SoS weight percentage (override config)' })
      .option('shrinkage-base', { type: 'number', description: 'Base shrinkage factor (override config)' })
      .option('calibration-factor', { type: 'number', description: 'Calibration factor (override config)' })
      .option('model-version', { type: 'string', default: 'v2', description: 'Model version to write (default: v2)' })
      .parse();
    
    const season = Number(argv.season);
    
    if (isNaN(season) || season < 2000 || season > 2030) {
      throw new Error('Invalid season. Must be between 2000 and 2030');
    }

    console.log(`🚀 Starting Ratings v2 computation for season=${season}...`);
    console.log(`   Enhanced with SoS adjustments and shrinkage regularization`);

    // Load model configuration
    const modelConfig = getModelConfig('v2');
    
    // Apply command-line overrides
    if (argv['sos-weight'] !== undefined) {
      if (!modelConfig.sos) modelConfig.sos = { enabled: true, iterations: 3, convergence_threshold: 0.01 };
      (modelConfig.sos as any).weight = Number(argv['sos-weight']);
      console.log(`   ⚙️  Override: SoS weight = ${argv['sos-weight']}`);
    }
    if (argv['shrinkage-base'] !== undefined) {
      if (!modelConfig.shrinkage) modelConfig.shrinkage = { base_factor: 0.1, confidence_weight: 0.5, games_weight: 0.3 };
      modelConfig.shrinkage.base_factor = Number(argv['shrinkage-base']);
      console.log(`   ⚙️  Override: Shrinkage base = ${argv['shrinkage-base']}`);
    }
    if (argv['calibration-factor'] !== undefined) {
      modelConfig.calibration_factor = Number(argv['calibration-factor']);
      console.log(`   ⚙️  Override: Calibration factor = ${argv['calibration-factor']}`);
    }
    
    const modelVersion = argv['model-version'] || 'v2';
    console.log(`⚙️  Using model config: ${modelConfig.name}`);
    console.log(`   HFA: ${modelConfig.hfa} pts, Min Edge: ${modelConfig.min_edge_threshold} pts`);
    console.log(`   Calibration Factor: ${modelConfig.calibration_factor || 'NOT SET (will default to 1.0)'} ⚠️`);
    
    // Check SoS status
    const sosStatus = modelConfig.sos?.enabled ? 'ENABLED' : 'DISABLED';
    console.log(`   SoS: ${sosStatus} (${modelConfig.sos?.iterations || 0} iterations, threshold: ${modelConfig.sos?.convergence_threshold || 0.01})`);

    // Load FBS teams for this season
    const teamResolver = new TeamResolver();
    const fbsTeamIds = await teamResolver.loadFBSTeamsForSeason(season);
    console.log(`📋 Loaded ${fbsTeamIds.size} FBS teams for season ${season}`);
    
    // PHASE 1: FBS Coverage Gate
    const expectedFBS = 130; // Typical FBS count (tune if needed)
    const fbsCoveragePct = (fbsTeamIds.size / expectedFBS) * 100;
    console.log(`\n🔍 FBS Coverage Gate: ${fbsTeamIds.size} / ${expectedFBS} expected = ${fbsCoveragePct.toFixed(1)}%`);
    
    if (fbsCoveragePct < 95) {
      const errorMsg = `❌ FBS Coverage Gate FAIL: ${fbsCoveragePct.toFixed(1)}% < 95%`;
      console.error(errorMsg);
      console.error(`   Expected ≥95% FBS teams. Check team_membership table for season ${season}.`);
      throw new Error(errorMsg);
    }
    console.log(`   ✅ FBS Coverage Gate PASS (≥95%)`);

    // Load features for all FBS teams
    const loader = new FeatureLoader(prisma);
    const allFeatures: TeamFeatures[] = [];
    
    console.log(`\n📊 Loading features for ${fbsTeamIds.size} teams...`);
    let loaded = 0;
    for (const teamId of fbsTeamIds) {
      const features = await loader.loadTeamFeatures(teamId, season);
      allFeatures.push(features);
      loaded++;
      if (loaded % 20 === 0) {
        console.log(`   Loaded ${loaded}/${fbsTeamIds.size} teams...`);
      }
    }

    console.log(`\n✅ Loaded features for ${allFeatures.length} teams`);

    // Calculate z-score statistics across all teams (on raw features for now)
    console.log(`\n📈 Calculating z-score statistics...`);
    const zStats = {
      yppOff: calculateZScores(allFeatures, f => f.yppOff),
      passYpaOff: calculateZScores(allFeatures, f => f.passYpaOff),
      rushYpcOff: calculateZScores(allFeatures, f => f.rushYpcOff),
      successOff: calculateZScores(allFeatures, f => f.successOff),
      epaOff: calculateZScores(allFeatures, f => f.epaOff),
      yppDef: calculateZScores(allFeatures, f => f.yppDef),
      passYpaDef: calculateZScores(allFeatures, f => f.passYpaDef),
      rushYpcDef: calculateZScores(allFeatures, f => f.rushYpcDef),
      successDef: calculateZScores(allFeatures, f => f.successDef),
      epaDef: calculateZScores(allFeatures, f => f.epaDef),
      // Talent z-scores (Phase 3)
      talentComposite: calculateZScores(allFeatures, f => f.talentComposite),
      blueChipsPct: calculateZScores(allFeatures, f => f.blueChipsPct),
      commitsSignal: calculateZScores(allFeatures, f => f.commitsSignal),
    };

    // Check if SoS is enabled
    const sosEnabled = modelConfig.sos?.enabled ?? false;
    const maxSoSIterations = modelConfig.sos?.iterations ?? 3;
    const sosConvergenceThreshold = modelConfig.sos?.convergence_threshold ?? 0.01;

    let currentFeatures = allFeatures;
    let currentRatings: Array<{ teamId: string; offenseRating: number; defenseRating: number; powerRating: number }> = [];
    let previousRatings: Array<{ teamId: string; powerRating: number }> = [];

    // Talent z-scores are calculated once and don't change during SoS iterations (season-level data)
    const talentZStats: {
      talentComposite: ZScoreStats;
      blueChipsPct: ZScoreStats;
      commitsSignal: ZScoreStats;
    } = {
      talentComposite: zStats.talentComposite,
      blueChipsPct: zStats.blueChipsPct,
      commitsSignal: zStats.commitsSignal,
    };

    // Iterative SoS adjustment loop
    for (let iteration = 0; iteration <= maxSoSIterations; iteration++) {
      if (iteration === 0) {
        // Initial pass: compute ratings without SoS
        console.log(`\n🧮 Computing initial ratings (iteration ${iteration + 1}/${maxSoSIterations + 1})...`);
      } else if (sosEnabled) {
        // SoS iterations: adjust features and recompute
        console.log(`\n📊 SoS iteration ${iteration}/${maxSoSIterations}...`);
        
        // Build ratings map from previous iteration
        const ratingsMap = new Map(
          currentRatings.map(r => [r.teamId, { offenseRating: r.offenseRating, defenseRating: r.defenseRating }])
        );

        // Apply SoS adjustments to all features
        const adjustedFeaturesPromises = currentFeatures.map(f => 
          applyStrengthOfSchedule(f, season, ratingsMap, prisma, (modelConfig.sos as any)?.weight || 0.05)
        );
        currentFeatures = await Promise.all(adjustedFeaturesPromises);

        // Recalculate z-scores on SoS-adjusted features
        console.log(`   Recalculating z-scores on SoS-adjusted features...`);
        zStats.yppOff = calculateZScores(currentFeatures, f => f.yppOff);
        zStats.passYpaOff = calculateZScores(currentFeatures, f => f.passYpaOff);
        zStats.rushYpcOff = calculateZScores(currentFeatures, f => f.rushYpcOff);
        zStats.successOff = calculateZScores(currentFeatures, f => f.successOff);
        zStats.epaOff = calculateZScores(currentFeatures, f => f.epaOff);
        zStats.yppDef = calculateZScores(currentFeatures, f => f.yppDef);
        zStats.passYpaDef = calculateZScores(currentFeatures, f => f.passYpaDef);
        zStats.rushYpcDef = calculateZScores(currentFeatures, f => f.rushYpcDef);
        zStats.successDef = calculateZScores(currentFeatures, f => f.successDef);
        zStats.epaDef = calculateZScores(currentFeatures, f => f.epaDef);
        // Talent z-scores don't need recalculation (they're season-level, not game-adjusted)
      } else {
        // SoS disabled, skip iterations
        break;
      }

      // Compute ratings with current features and z-stats
      // PHASE 1: Instrumentation - Stage A: Raw Baseline
      if (iteration === 0) {
        console.log(`\n📊 Stage A: Computing raw baseline ratings...`);
      }
      
      currentRatings = currentFeatures.map(features => {
        const offenseRating = computeOffensiveIndex(features, {
          yppOff: zStats.yppOff,
          passYpaOff: zStats.passYpaOff,
          rushYpcOff: zStats.rushYpcOff,
          successOff: zStats.successOff,
          epaOff: zStats.epaOff,
        }, modelConfig);

        const defenseRating = computeDefensiveIndex(features, {
          yppDef: zStats.yppDef,
          passYpaDef: zStats.passYpaDef,
          rushYpcDef: zStats.rushYpcDef,
          successDef: zStats.successDef,
          epaDef: zStats.epaDef,
        }, modelConfig);

        // Calculate talent component (Phase 3) - same as v1
        const talentComponent = calculateTalentComponent(features, talentZStats, modelConfig);

        // Base = Offense + Defense composite
        const base = offenseRating + defenseRating;

        // Early-season fallback: If base features are missing, use talent only
        const hasBaseFeatures = features.dataSource !== 'missing' && 
                                 (features.yppOff !== null || features.yppDef !== null ||
                                  features.successOff !== null || features.successDef !== null);
        
        // Score = Base + TalentComponent (HFA added later in matchup calculation)
        const powerRating = hasBaseFeatures 
          ? base + talentComponent 
          : talentComponent; // Early-season: talent-only fallback

        return {
          teamId: features.teamId,
          offenseRating,
          defenseRating,
          powerRating,
        };
      });
      
      // PHASE 1: Instrumentation - Log Stage A (raw baseline) or Stage B (SoS-adjusted)
      if (iteration === 0) {
        const rawRatings = currentRatings.map(r => r.powerRating);
        logStageStats(rawRatings, 'A_raw_baseline');
      } else if (sosEnabled) {
        const sosRatings = currentRatings.map(r => r.powerRating);
        logStageStats(sosRatings, `B_sos_iteration_${iteration}`);
      }

      // Check convergence (if not first iteration and SoS enabled)
      if (iteration > 0 && sosEnabled) {
        const maxChange = Math.max(
          ...currentRatings.map((curr, idx) => {
            const prev = previousRatings.find(p => p.teamId === curr.teamId);
            if (!prev) return Infinity;
            return Math.abs(curr.powerRating - prev.powerRating);
          }).filter(v => isFinite(v))
        );

        console.log(`   Max rating change: ${maxChange.toFixed(4)} (threshold: ${sosConvergenceThreshold})`);

        if (maxChange < sosConvergenceThreshold) {
          console.log(`   ✅ SoS converged after ${iteration} iterations`);
          break;
        }
      }

      // Store ratings for next iteration comparison
      previousRatings = currentRatings.map(r => ({ teamId: r.teamId, powerRating: r.powerRating }));
    }

    if (sosEnabled) {
      console.log(`\n✅ Completed SoS adjustment iterations`);
    }

    // Compute final ratings with shrinkage
    console.log(`\n🔧 Applying shrinkage regularization...`);
    
    // PHASE 1: Instrumentation - Stage C: Pre-shrinkage
    const preShrinkageRatings = currentRatings.map(r => r.powerRating);
    logStageStats(preShrinkageRatings, 'C_pre_shrinkage');
    
    const finalRatings = currentFeatures.map((features) => {
      const currentRating = currentRatings.find(r => r.teamId === features.teamId);
      if (!currentRating) {
        // Fallback if rating not found (shouldn't happen)
        return {
          season,
          teamId: features.teamId,
          offenseRating: 0,
          defenseRating: 0,
          powerRating: 0,
          confidence: calculateConfidence(features),
          dataSource: getDataSourceString(features),
          shrinkageFactor: 0,
        };
      }
      
      // Calculate shrinkage factor
      const shrinkageFactor = calculateShrinkageFactor(features, modelConfig);
      
      // Shrink toward zero (league average for power ratings)
      const shrunkOffenseRating = applyShrinkage(
        currentRating.offenseRating,
        0.0, // Prior: league average offense
        shrinkageFactor
      );
      
      const shrunkDefenseRating = applyShrinkage(
        currentRating.defenseRating,
        0.0, // Prior: league average defense
        shrinkageFactor
      );

      // Calculate talent component (Phase 3) - applies after shrinkage
      const talentComponent = calculateTalentComponent(features, talentZStats, modelConfig);

      // Base = Offense + Defense (after shrinkage)
      const base = shrunkOffenseRating + shrunkDefenseRating;

      // Early-season fallback: If base features are missing, use talent only
      const hasBaseFeatures = features.dataSource !== 'missing' && 
                               (features.yppOff !== null || features.yppDef !== null ||
                                features.successOff !== null || features.successDef !== null);
      
      // Score = Base + TalentComponent (HFA added later in matchup calculation)
      const rawScore = hasBaseFeatures 
        ? base + talentComponent 
        : talentComponent; // Early-season: talent-only fallback
      
      // Apply calibration factor to scale z-scores to point-spread equivalent
      const calibrationFactor = modelConfig.calibration_factor || 1.0; // Default 1.0 for backward compat
      const powerRating = rawScore * calibrationFactor;
      
      const confidence = calculateConfidence(features);
      const dataSource = getDataSourceString(features);
      
      // PHASE 1: Track pre-calibration for instrumentation
      return {
        season,
        teamId: features.teamId,
        offenseRating: shrunkOffenseRating,
        defenseRating: shrunkDefenseRating,
        powerRating,
        preCalibrationRating: rawScore, // Track before calibration factor
        confidence,
        dataSource,
        shrinkageFactor,
      };
    });
    
    // PHASE 1: Instrumentation - Stage D: Post-shrinkage (before calibration)
    const postShrinkageRatings = finalRatings.map(r => (r as any).preCalibrationRating || 0);
    logStageStats(postShrinkageRatings, 'D_post_shrinkage');
    
    // PHASE 1: Instrumentation - Stage E: Post-calibration
    const postCalibrationRatings = finalRatings.map(r => r.powerRating);
    logStageStats(postCalibrationRatings, 'E_post_calibration');

    // Upsert ratings to database
    console.log(`\n💾 Persisting ratings to database (modelVersion='${modelVersion}')...`);
    let upserted = 0;
    let errors = 0;

    for (const rating of finalRatings) {
      try {
        await prisma.teamSeasonRating.upsert({
          where: {
            season_teamId_modelVersion: {
              season: rating.season,
              teamId: rating.teamId,
              modelVersion: modelVersion,
            },
          },
          update: {
            offenseRating: rating.offenseRating,
            defenseRating: rating.defenseRating,
            rating: rating.powerRating, // Keep legacy field
            powerRating: rating.powerRating,
            confidence: rating.confidence,
            dataSource: rating.dataSource,
            updatedAt: new Date(),
          },
          create: {
            season: rating.season,
            teamId: rating.teamId,
            modelVersion: modelVersion,
            games: 0, // Will be filled by other jobs if needed
            offenseRating: rating.offenseRating,
            defenseRating: rating.defenseRating,
            rating: rating.powerRating,
            powerRating: rating.powerRating,
            confidence: rating.confidence,
            dataSource: rating.dataSource,
          },
        });
        upserted++;
      } catch (error: any) {
        console.error(`   ⚠️  Failed to upsert rating for ${rating.teamId}:`, error.message);
        errors++;
      }
    }
    
    // PHASE 1: Gate C - Read-after-write version integrity check
    console.log(`\n🔍 Gate C: Read-after-write version integrity check...`);
    const readbackRatings = await prisma.teamSeasonRating.findMany({
      where: {
        season,
        modelVersion,
      },
      select: { powerRating: true },
    });
    
    const readbackValues = readbackRatings
      .map(r => r.powerRating !== null ? Number(r.powerRating) : 0)
      .filter(r => isFinite(r) && !isNaN(r));
    
    const readbackStats = computeStats(readbackValues, 'F_readback');
    logStageStats(readbackValues, 'F_readback');
    
    const writtenStats = computeStats(postCalibrationRatings, 'E_post_calibration');
    const varianceMatch = Math.abs(readbackStats.std - writtenStats.std) < 0.1;
    
    if (!varianceMatch) {
      const errorMsg = `❌ Gate C FAIL: Variance mismatch. Written std=${writtenStats.std.toFixed(4)}, Readback std=${readbackStats.std.toFixed(4)}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    console.log(`   ✅ Gate C PASS: Variance matches (std=${readbackStats.std.toFixed(4)})`);
    
    // PHASE 1: Sanity Gates A & B
    console.log(`\n🔍 Sanity Gates A & B: Checking final ratings...`);
    const gateResult = checkSanityGates(readbackValues, modelVersion);
    
    if (!gateResult.passed) {
      console.error(`\n❌ SANITY GATES FAILED:`);
      gateResult.failures.forEach(f => console.error(`   ${f}`));
      throw new Error(`Sanity gates failed: ${gateResult.failures.join('; ')}`);
    }
    console.log(`   ✅ Gate A PASS: stddev ${readbackStats.std.toFixed(4)} ≥ 2.0`);
    console.log(`   ✅ Gate B PASS: ${readbackStats.zeroPct.toFixed(2)}% zeros ≤ 2.0%`);
    
    // Save stage stats
    saveStageStats(season, modelVersion);

    // Summary
    console.log(`\n✅ Ratings v2 computation complete!`);
    console.log(`   Upserted: ${upserted}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Data source breakdown:`);
    
    const dataSourceBreakdown = finalRatings.reduce((acc, r) => {
      acc[r.dataSource] = (acc[r.dataSource] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [source, count] of Object.entries(dataSourceBreakdown)) {
      console.log(`     ${source}: ${count}`);
    }

    const avgConfidence = finalRatings.reduce((sum, r) => sum + r.confidence, 0) / finalRatings.length;
    const avgPowerRating = finalRatings.reduce((sum, r) => sum + r.powerRating, 0) / finalRatings.length;
    const avgShrinkage = finalRatings.reduce((sum, r) => sum + (r.shrinkageFactor || 0), 0) / finalRatings.length;
    
    console.log(`\n   Average power rating: ${avgPowerRating.toFixed(2)}`);
    console.log(`   Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`   Average shrinkage factor: ${(avgShrinkage * 100).toFixed(1)}%`);
    
    if (sosEnabled) {
      console.log(`\n✅ SoS adjustments applied successfully`);
    }

  } catch (error) {
    console.error('❌ Error computing ratings v2:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

