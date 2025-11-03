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
 * TODO: Implement opponent-adjusted feature calculation
 * - For each team, calculate average opponent strength for each metric
 * - Adjust features by opponent average (higher opponent strength = harder schedule)
 * - Return adjusted features for z-score calculation
 * 
 * @param features - Raw team features
 * @param season - Season for context
 * @param allTeamRatings - Current ratings map for opponent strength lookup
 * @returns Adjusted features with SoS corrections applied
 */
function applyStrengthOfSchedule(
  features: TeamFeatures,
  season: number,
  allTeamRatings: Map<string, { offenseRating: number; defenseRating: number }>
): TeamFeatures {
  // TODO: Implement SoS adjustment
  // For now, return features unchanged (identity function)
  // Future: Query game results, calculate opponent averages, adjust features
  
  console.log(`   [SoS] Placeholder: SoS adjustment not yet implemented for ${features.teamId}`);
  
  return features;
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

    // Compute initial ratings (without SoS for first pass)
    console.log(`\n🧮 Computing initial ratings (v1-style)...`);
    const initialRatings = allFeatures.map(features => {
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

    // Build ratings map for SoS lookup (using initial ratings)
    const ratingsMap = new Map(
      initialRatings.map(r => [r.teamId, { offenseRating: r.offenseRating, defenseRating: r.defenseRating }])
    );

    // TODO: Iterative SoS adjustment
    // For now, we'll use the initial ratings
    // Future: Iterate to converge SoS-adjusted ratings
    console.log(`\n📊 Applying SoS adjustments (placeholder)...`);
    const sosAdjustedFeatures = allFeatures.map(f => 
      applyStrengthOfSchedule(f, season, ratingsMap)
    );

    // Recalculate z-scores on SoS-adjusted features
    // TODO: When SoS is implemented, recalculate z-stats here
    // const sosZStats = { ... }; // Recalculate on adjusted features

    // Compute final ratings with shrinkage
    console.log(`\n🔧 Applying shrinkage regularization...`);
    const finalRatings = allFeatures.map((features, idx) => {
      const initial = initialRatings[idx];
      
      // Calculate shrinkage factor
      const shrinkageFactor = calculateShrinkageFactor(features, modelConfig);
      
      // Shrink toward zero (league average for power ratings)
      const shrunkOffenseRating = applyShrinkage(
        initial.offenseRating,
        0.0, // Prior: league average offense
        shrinkageFactor
      );
      
      const shrunkDefenseRating = applyShrinkage(
        initial.defenseRating,
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
    
    console.log(`\n⚠️  Note: SoS adjustments are currently placeholders and will be implemented in a future update.`);

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

