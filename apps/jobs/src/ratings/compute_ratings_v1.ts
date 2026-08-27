/**
 * Ratings v1 Computation Job
 * 
 * Computes team power ratings from season/advanced stats using z-scores and weighted indices.
 * 
 * Usage:
 *   node apps/jobs/dist/src/ratings/compute_ratings_v1.js --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { FeatureLoader, TeamFeatures } from './feature-loader';
import { TeamResolver } from '../../adapters/TeamResolver';
import { getModelConfig } from '../config/model-weights';
import {
  createPrismaV1ConferenceStore,
  formatV1ConferenceLoadFailure,
  loadV1ConferenceMap,
} from './v1-conference-loader';
import { getConferenceAdjustment } from './conference-adjustments';

export {
  CONFERENCE_ADJUSTMENTS,
  getConferenceAdjustment,
} from './conference-adjustments';

const prisma = new PrismaClient();

// Export types and interfaces for testing
export type { TeamFeatures };
export interface ZScoreStats {
  mean: number;
  stdDev: number;
  values: Array<{ teamId: string; value: number }>;
}

/**
 * Calculate z-scores for a feature across all teams
 */
export function calculateZScores(features: TeamFeatures[], getValue: (f: TeamFeatures) => number | null): ZScoreStats {
  const values = features
    .map(f => ({ teamId: f.teamId, value: getValue(f) }))
    .filter(v => v.value !== null && v.value !== undefined && !isNaN(v.value))
    .map(v => ({ teamId: v.teamId, value: v.value! }));

  if (values.length === 0) {
    return { mean: 0, stdDev: 1, values: [] };
  }

  const sum = values.reduce((acc, v) => acc + v.value, 0);
  const mean = sum / values.length;
  
  const variance = values.reduce((acc, v) => acc + Math.pow(v.value - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance) || 1; // Avoid division by zero

  return { mean, stdDev, values };
}

/**
 * Get z-score for a value
 */
export function getZScore(value: number | null, stats: ZScoreStats): number {
  if (value === null || value === undefined || isNaN(value)) return 0;
  return (value - stats.mean) / stats.stdDev;
}

/**
 * Compute offensive index from features
 */
export function computeOffensiveIndex(features: TeamFeatures, zStats: {
  yppOff: ZScoreStats;
  passYpaOff: ZScoreStats;
  rushYpcOff: ZScoreStats;
  successOff: ZScoreStats;
  epaOff: ZScoreStats;
}, modelConfig?: ReturnType<typeof getModelConfig>): number {
  // Use provided config or load default v1 config
  const config = modelConfig || getModelConfig('v1');
  const weights = {
    yppOff: config.offensive_weights.ypp_off,
    passYpaOff: config.offensive_weights.pass_ypa_off,
    rushYpcOff: config.offensive_weights.rush_ypc_off,
    successOff: config.offensive_weights.success_off,
    epaOff: config.offensive_weights.epa_off,
  };

  const zScores = {
    yppOff: getZScore(features.yppOff, zStats.yppOff),
    passYpaOff: getZScore(features.passYpaOff, zStats.passYpaOff),
    rushYpcOff: getZScore(features.rushYpcOff, zStats.rushYpcOff),
    successOff: getZScore(features.successOff, zStats.successOff),
    epaOff: getZScore(features.epaOff, zStats.epaOff),
  };

  return (
    zScores.yppOff * weights.yppOff +
    zScores.passYpaOff * weights.passYpaOff +
    zScores.rushYpcOff * weights.rushYpcOff +
    zScores.successOff * weights.successOff +
    zScores.epaOff * weights.epaOff
  );
}

/**
 * Compute defensive index from features (inverted - lower is better for defense)
 */
export function computeDefensiveIndex(features: TeamFeatures, zStats: {
  yppDef: ZScoreStats;
  passYpaDef: ZScoreStats;
  rushYpcDef: ZScoreStats;
  successDef: ZScoreStats;
  epaDef: ZScoreStats;
}, modelConfig?: ReturnType<typeof getModelConfig>): number {
  // Use provided config or load default v1 config
  const config = modelConfig || getModelConfig('v1');
  
  // If we don't have defensive ypp/ypa/ypc, use only success/EPA
  const hasDefensiveYards = features.yppDef !== null || features.passYpaDef !== null || features.rushYpcDef !== null;
  
  let weights: { [key: string]: number };
  
  if (hasDefensiveYards) {
    weights = {
      yppDef: config.defensive_weights.ypp_def,
      passYpaDef: config.defensive_weights.pass_ypa_def,
      rushYpcDef: config.defensive_weights.rush_ypc_def,
      successDef: config.defensive_weights.success_def,
      epaDef: config.defensive_weights.epa_def,
    };
  } else {
    // Renormalize to use only success/EPA
    const total = config.defensive_weights.success_def + config.defensive_weights.epa_def;
    weights = {
      successDef: config.defensive_weights.success_def / total,
      epaDef: config.defensive_weights.epa_def / total,
      yppDef: 0,
      passYpaDef: 0,
      rushYpcDef: 0,
    };
  }

  const zScores = {
    yppDef: getZScore(features.yppDef, zStats.yppDef),
    passYpaDef: getZScore(features.passYpaDef, zStats.passYpaDef),
    rushYpcDef: getZScore(features.rushYpcDef, zStats.rushYpcDef),
    successDef: getZScore(features.successDef, zStats.successDef),
    epaDef: getZScore(features.epaDef, zStats.epaDef),
  };

  const rawIndex = (
    zScores.yppDef * weights.yppDef +
    zScores.passYpaDef * weights.passYpaDef +
    zScores.rushYpcDef * weights.rushYpcDef +
    zScores.successDef * weights.successDef +
    zScores.epaDef * weights.epaDef
  );

  // Invert: lower is better for defense, so multiply by -1
  return -rawIndex;
}

/**
 * Calculate talent prior from talent features
 * TalentPrior = w_talent * talent_z + w_blue * blue_chip_z + w_commits * commits_signal
 */
export function calculateTalentPrior(
  features: TeamFeatures,
  zStats: {
    talentComposite: ZScoreStats;
    blueChipsPct: ZScoreStats;
    commitsSignal: ZScoreStats;
  },
  modelConfig: ReturnType<typeof getModelConfig>
): number {
  const talentWeights = modelConfig.talent_weights || {
    w_talent: 1.0,
    w_blue: 0.3,
    w_commits: 0.15,
  };

  const talentZ = getZScore(features.talentComposite, zStats.talentComposite);
  const blueChipZ = getZScore(features.blueChipsPct, zStats.blueChipsPct);
  const commitsSignal = getZScore(features.commitsSignal, zStats.commitsSignal);

  // Cap commits signal at 15% of roster signal (as per spec)
  const cappedCommitsSignal = commitsSignal * 0.15;

  return (
    talentZ * talentWeights.w_talent +
    blueChipZ * talentWeights.w_blue +
    cappedCommitsSignal * talentWeights.w_commits
  );
}

/**
 * Calculate seasonal decay factor
 * decay = max(0, 1 - weeks_played / 8)
 * Returns 1.0 at week 0, 0.0 at week 8+
 */
export function calculateDecayFactor(weeksPlayed: number): number {
  return Math.max(0, 1 - (weeksPlayed || 0) / 8);
}

/**
 * Calculate talent component with seasonal decay
 * TalentComponent = decay * TalentPrior
 */
export function calculateTalentComponent(
  features: TeamFeatures,
  zStats: {
    talentComposite: ZScoreStats;
    blueChipsPct: ZScoreStats;
    commitsSignal: ZScoreStats;
  },
  modelConfig: ReturnType<typeof getModelConfig>
): number {
  const talentPrior = calculateTalentPrior(features, zStats, modelConfig);
  const decay = calculateDecayFactor(features.weeksPlayed || 0);
  return decay * talentPrior;
}

/**
 * Calculate confidence score (0-1)
 */
export function calculateConfidence(features: TeamFeatures): number {
  const requiredFeatures = [
    features.yppOff,
    features.passYpaOff,
    features.rushYpcOff,
    features.successOff,
    features.epaOff,
    features.yppDef,
    features.successDef,
    features.epaDef,
  ];

  const presentFeatures = requiredFeatures.filter(f => f !== null && f !== undefined && !isNaN(f)).length;
  const featureCoverage = presentFeatures / requiredFeatures.length;

  // Data source quality multiplier
  const dataSourceQuality = features.dataSource === 'game' ? 1.0 :
                             features.dataSource === 'season' ? 0.9 :
                             features.dataSource === 'baseline' ? 0.7 : 0.3;

  return featureCoverage * dataSourceQuality;
}

/**
 * Get data source string for storage
 */
export function getDataSourceString(features: TeamFeatures): string {
  if (features.successOff !== null && features.epaOff !== null) {
    return features.dataSource === 'game' ? 'game+season' : 'season_only';
  }
  return features.dataSource === 'baseline' ? 'baseline' : 'season_only';
}

/** Detailed per-team Core V1 result (shared by writer + read-only preview). */
export interface V1ComputedTeamRating {
  season: number;
  teamId: string;
  offenseRating: number;
  defenseRating: number;
  powerRating: number;
  confidence: number;
  dataSource: string;
  games: number;
  conference: string | null;
  talentComposite: number | null;
  talentZ: number;
  blueChipZ: number;
  commitsZ: number;
  talentPrior: number;
  decay: number;
  talentComponent: number;
  hasBaseFeatures: boolean;
  conferenceAdjustment: number;
  rawScore: number;
  adjustedScore: number;
  calibrationFactor: number;
}

/**
 * Pure Core V1 season ratings computation.
 * Formula order matches historical main(): offense/defense → talent → rawScore
 * → conferenceAdjustment → * calibrationFactor.
 * Does not load DB or persist.
 */
export function computeV1SeasonRatings(options: {
  season: number;
  allFeatures: TeamFeatures[];
  conferenceMap: Map<string, string | null>;
  modelConfig: ReturnType<typeof getModelConfig>;
}): V1ComputedTeamRating[] {
  const { season, allFeatures, conferenceMap, modelConfig } = options;
  const calibrationFactor = modelConfig.calibration_factor || 1.0;

  const zStats = {
    yppOff: calculateZScores(allFeatures, (f) => f.yppOff ?? null),
    passYpaOff: calculateZScores(allFeatures, (f) => f.passYpaOff ?? null),
    rushYpcOff: calculateZScores(allFeatures, (f) => f.rushYpcOff ?? null),
    successOff: calculateZScores(allFeatures, (f) => f.successOff ?? null),
    epaOff: calculateZScores(allFeatures, (f) => f.epaOff ?? null),
    yppDef: calculateZScores(allFeatures, (f) => f.yppDef ?? null),
    passYpaDef: calculateZScores(allFeatures, (f) => f.passYpaDef ?? null),
    rushYpcDef: calculateZScores(allFeatures, (f) => f.rushYpcDef ?? null),
    successDef: calculateZScores(allFeatures, (f) => f.successDef ?? null),
    epaDef: calculateZScores(allFeatures, (f) => f.epaDef ?? null),
    talentComposite: calculateZScores(
      allFeatures,
      (f) => f.talentComposite ?? null
    ),
    blueChipsPct: calculateZScores(allFeatures, (f) => f.blueChipsPct ?? null),
    commitsSignal: calculateZScores(
      allFeatures,
      (f) => f.commitsSignal ?? null
    ),
  };

  return allFeatures.map((features) => {
    const offenseRating = computeOffensiveIndex(
      features,
      {
        yppOff: zStats.yppOff,
        passYpaOff: zStats.passYpaOff,
        rushYpcOff: zStats.rushYpcOff,
        successOff: zStats.successOff,
        epaOff: zStats.epaOff,
      },
      modelConfig
    );

    const defenseRating = computeDefensiveIndex(
      features,
      {
        yppDef: zStats.yppDef,
        passYpaDef: zStats.passYpaDef,
        rushYpcDef: zStats.rushYpcDef,
        successDef: zStats.successDef,
        epaDef: zStats.epaDef,
      },
      modelConfig
    );

    const talentZ = getZScore(
      features.talentComposite ?? null,
      zStats.talentComposite
    );
    const blueChipZ = getZScore(
      features.blueChipsPct ?? null,
      zStats.blueChipsPct
    );
    const commitsZ = getZScore(
      features.commitsSignal ?? null,
      zStats.commitsSignal
    );
    const talentPrior = calculateTalentPrior(
      features,
      {
        talentComposite: zStats.talentComposite,
        blueChipsPct: zStats.blueChipsPct,
        commitsSignal: zStats.commitsSignal,
      },
      modelConfig
    );
    const decay = calculateDecayFactor(features.weeksPlayed || 0);
    const talentComponent = decay * talentPrior;

    const base = offenseRating + defenseRating;
    const hasBaseFeatures =
      features.dataSource !== 'missing' &&
      (features.yppOff !== null ||
        features.yppDef !== null ||
        features.successOff !== null ||
        features.successDef !== null);

    const rawScore = hasBaseFeatures
      ? base + talentComponent
      : talentComponent;

    const conference =
      conferenceMap.get(features.teamId.toLowerCase()) ?? null;
    const conferenceAdjustment = getConferenceAdjustment(conference);
    const adjustedScore = rawScore + conferenceAdjustment;
    const powerRating = adjustedScore * calibrationFactor;

    return {
      season,
      teamId: features.teamId,
      offenseRating,
      defenseRating,
      powerRating,
      confidence: calculateConfidence(features),
      dataSource: getDataSourceString(features),
      games: features.weeksPlayed || 0,
      conference,
      talentComposite: features.talentComposite ?? null,
      talentZ,
      blueChipZ,
      commitsZ,
      talentPrior,
      decay,
      talentComponent,
      hasBaseFeatures,
      conferenceAdjustment,
      rawScore,
      adjustedScore,
      calibrationFactor,
    };
  });
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

    console.log(`🚀 Starting Ratings v1 computation for season=${season}...`);

    // Load model configuration
    const modelConfig = getModelConfig('v1');
    console.log(`⚙️  Using model config: ${modelConfig.name}`);
    console.log(`   HFA: ${modelConfig.hfa} pts, Min Edge: ${modelConfig.min_edge_threshold} pts`);
    console.log(`   Calibration Factor: ${modelConfig.calibration_factor || 'NOT SET (will default to 1.0)'} ⚠️`);

    // Load FBS teams for this season
    const teamResolver = new TeamResolver();
    const fbsTeamIds = await teamResolver.loadFBSTeamsForSeason(season);
    console.log(`📋 Loaded ${fbsTeamIds.size} FBS teams for season ${season}`);

    // Conference source: 2026+ → TeamMembership.conference (fail closed);
    // <2026 → legacy Team.conference. Fail before ratings calc/persist.
    const expectedFbsIds = Array.from(fbsTeamIds);
    console.log(`\n🏈 Loading V1 conference map for season=${season}...`);
    const conferenceLoad = await loadV1ConferenceMap({
      season,
      expectedFbsIds,
      store: createPrismaV1ConferenceStore(prisma),
    });
    if (conferenceLoad.legacyConferenceMode) {
      console.log(`   conferenceSource=Team.conference`);
      console.log(`   conferenceSeason=${season}`);
      console.log(`   legacyConferenceMode=true`);
    } else {
      console.log(`   conferenceSource=TeamMembership.conference`);
      console.log(`   conferenceSeason=${season}`);
      console.log(`   conferenceExpected=${conferenceLoad.expectedFbsCount}`);
      console.log(`   conferenceLoaded=${conferenceLoad.loadedConferenceCount}`);
      console.log(`   legacyFallback=false`);
    }
    if (!conferenceLoad.ok) {
      throw new Error(formatV1ConferenceLoadFailure(conferenceLoad));
    }
    const conferenceMap = conferenceLoad.conferenceMap;

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

    console.log(`\n🧮 Computing ratings...`);
    const computed = computeV1SeasonRatings({
      season,
      allFeatures,
      conferenceMap,
      modelConfig,
    });
    const ratings = computed.map((r) => ({
      season: r.season,
      teamId: r.teamId,
      offenseRating: r.offenseRating,
      defenseRating: r.defenseRating,
      powerRating: r.powerRating,
      confidence: r.confidence,
      dataSource: r.dataSource,
      games: r.games,
    }));

    // Upsert ratings to database
    console.log(`\n💾 Persisting ratings to database...`);
    let upserted = 0;
    let errors = 0;

    for (const rating of ratings) {
      try {
        await prisma.teamSeasonRating.upsert({
          where: {
            season_teamId_modelVersion: {
              season: rating.season,
              teamId: rating.teamId,
              modelVersion: 'v1',
            },
          },
          update: {
            games: rating.games, // Update games count from FeatureLoader
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
            modelVersion: 'v1',
            games: rating.games, // Count of final games from FeatureLoader
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
    console.log(`\n✅ Ratings computation complete!`);
    console.log(`   Upserted: ${upserted}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Data source breakdown:`);
    
    const dataSourceBreakdown = ratings.reduce((acc, r) => {
      acc[r.dataSource] = (acc[r.dataSource] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    for (const [source, count] of Object.entries(dataSourceBreakdown)) {
      console.log(`     ${source}: ${count}`);
    }

    const avgConfidence = ratings.reduce((sum, r) => sum + r.confidence, 0) / ratings.length;
    const avgPowerRating = ratings.reduce((sum, r) => sum + r.powerRating, 0) / ratings.length;
    
    console.log(`\n   Average power rating: ${avgPowerRating.toFixed(2)}`);
    console.log(`   Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Error computing ratings:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

