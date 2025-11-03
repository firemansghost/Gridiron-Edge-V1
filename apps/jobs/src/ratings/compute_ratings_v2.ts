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
// Re-use z-score functions from v1
import { 
  calculateZScores, 
  getZScore, 
  computeOffensiveIndex, 
  computeDefensiveIndex,
  calculateConfidence,
  getDataSourceString,
  type ZScoreStats
} from './compute_ratings_v1';

const prisma = new PrismaClient();

// Re-export types for compatibility
export type { TeamFeatures, ZScoreStats };

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
  prisma: PrismaClient
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
    // Use 5% adjustment per point of SoS (conservative)
    const offensiveAdjustmentFactor = 1.0 + (offensiveSoS * 0.05); // 5% adjustment per point of SoS
    const defensiveAdjustmentFactor = 1.0 + (defensiveSoS * 0.05); // Same for defense

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
  // TODO: Implement dynamic shrinkage based on:
  // - Confidence level (lower confidence = more shrinkage)
  // - Number of games (fewer games = more shrinkage)
  // - Data source quality (baseline-only = more shrinkage)
  
  // Use shrinkage config if available (v2), otherwise no shrinkage
  const shrinkageConfig = modelConfig.shrinkage;
  if (!shrinkageConfig) {
    return 0.0; // No shrinkage if not configured
  }
  
  // Calculate dynamic shrinkage based on data quality
  const baseShrinkage = shrinkageConfig.base_factor || 0.0;
  const confidenceMultiplier = (1.0 - (features.confidence || 0.5)) * (shrinkageConfig.confidence_weight || 0.5);
  const gamesMultiplier = features.gamesCount 
    ? Math.max(0, 1 - (features.gamesCount / 8)) * (shrinkageConfig.games_weight || 0.3)
    : 1.0; // Fewer games = more shrinkage
  
  return Math.min(1.0, baseShrinkage + confidenceMultiplier + gamesMultiplier);
}

async function main() {
  try {
    const yargs = require('yargs/yargs');
    const argv = yargs(process.argv.slice(2))
      .option('season', { type: 'number', demandOption: true })
      .parse();
    
    const season = Number(argv.season);
    
    if (isNaN(season) || season < 2000 || season > 2030) {
      throw new Error('Invalid season. Must be between 2000 and 2030');
    }

    console.log(`🚀 Starting Ratings v2 computation for season=${season}...`);
    console.log(`   Enhanced with SoS adjustments and shrinkage regularization`);

    // Load model configuration
    const modelConfig = getModelConfig('v2');
    console.log(`⚙️  Using model config: ${modelConfig.name}`);
    console.log(`   HFA: ${modelConfig.hfa} pts, Min Edge: ${modelConfig.min_edge_threshold} pts`);
    
    // Check SoS status
    const sosStatus = modelConfig.sos?.enabled ? 'ENABLED' : 'DISABLED';
    console.log(`   SoS: ${sosStatus} (${modelConfig.sos?.iterations || 0} iterations, threshold: ${modelConfig.sos?.convergence_threshold || 0.01})`);

    // Load FBS teams for this season
    const teamResolver = new TeamResolver();
    const fbsTeamIds = await teamResolver.loadFBSTeamsForSeason(season);
    console.log(`📋 Loaded ${fbsTeamIds.size} FBS teams for season ${season}`);

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
    };

    // Check if SoS is enabled
    const sosEnabled = modelConfig.sos?.enabled ?? false;
    const maxSoSIterations = modelConfig.sos?.iterations ?? 3;
    const sosConvergenceThreshold = modelConfig.sos?.convergence_threshold ?? 0.01;

    let currentFeatures = allFeatures;
    let currentRatings: Array<{ teamId: string; offenseRating: number; defenseRating: number; powerRating: number }> = [];
    let previousRatings: Array<{ teamId: string; powerRating: number }> = [];

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
          applyStrengthOfSchedule(f, season, ratingsMap, prisma)
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
      } else {
        // SoS disabled, skip iterations
        break;
      }

      // Compute ratings with current features and z-stats
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

        return {
          teamId: features.teamId,
          offenseRating,
          defenseRating,
          powerRating: offenseRating + defenseRating,
        };
      });

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

      const powerRating = shrunkOffenseRating + shrunkDefenseRating;
      const confidence = calculateConfidence(features);
      const dataSource = getDataSourceString(features);

      return {
        season,
        teamId: features.teamId,
        offenseRating: shrunkOffenseRating,
        defenseRating: shrunkDefenseRating,
        powerRating,
        confidence,
        dataSource,
        shrinkageFactor, // Store for analysis
      };
    });

    // Upsert ratings to database with modelVersion='v2'
    console.log(`\n💾 Persisting ratings to database (modelVersion='v2')...`);
    let upserted = 0;
    let errors = 0;

    for (const rating of finalRatings) {
      try {
        await prisma.teamSeasonRating.upsert({
          where: {
            season_teamId_modelVersion: {
              season: rating.season,
              teamId: rating.teamId,
              modelVersion: 'v2',
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
            modelVersion: 'v2',
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

