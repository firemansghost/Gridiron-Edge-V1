/**
 * Ratings v4 Computation Job
 * 
 * SP+/FEI-inspired spread ratings using:
 * - Success Rate (offense/defense)
 * - Explosiveness/IsoPPP (offense/defense)
 * - Finishing Drives (points per scoring opportunity)
 * - Available Yards % (fraction of field gained per drive)
 * 
 * Usage:
 *   npx tsx apps/jobs/src/ratings/compute_ratings_v4.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { Command } from 'commander';

const prisma = new PrismaClient();

/**
 * Drive stats structure from TeamSeasonStat.rawJson.drive_stats
 */
interface DriveStats {
  // V3 fields (not used in V4, but may be present)
  tempo?: number;
  qualityDrives?: number;
  qualityDriveRate?: number;
  
  // V4 Phase 1: Finishing Drives
  finishingDrives?: {
    off: {
      scoringOpps: number;
      pointsOnOpps: number;
      pointsPerOpp: number;
    };
    def: {
      scoringOpps: number;
      pointsOnOpps: number;
      pointsPerOpp: number;
    };
  };
  
  // V4 Phase 1: Available Yards
  availableYards?: {
    off: {
      drives: number;
      avgAvailableYards: number;
      avgYardsGained: number;
      avgAvailableYardsPct: number;
    };
    def: {
      drives: number;
      avgAvailableYards: number;
      avgYardsGained: number;
      avgAvailableYardsPct: number;
    };
  };
}

/**
 * Raw features extracted for a team
 */
interface TeamV4Features {
  teamId: string;
  teamName: string;
  
  // Season stats (from TeamSeasonStat)
  offSuccess: number | null;
  defSuccess: number | null;
  
  // Explosiveness (from TeamUnitGrades)
  offIso: number | null;
  defIso: number | null;
  
  // Drive stats (from TeamSeasonStat.rawJson.drive_stats)
  offFinishing: number | null; // pointsPerOpp
  defFinishing: number | null; // pointsPerOpp (defensive perspective)
  offAvailPct: number | null; // avgAvailableYardsPct
  defAvailPct: number | null; // avgAvailableYardsPct (defensive perspective)
}

/**
 * Z-score statistics for a metric
 */
interface ZScoreStats {
  mean: number;
  stdDev: number;
}

/**
 * Calculate z-score statistics for a metric across all teams
 */
function calculateZScoreStats(
  features: TeamV4Features[],
  getValue: (f: TeamV4Features) => number | null
): ZScoreStats {
  const values = features
    .map(f => getValue(f))
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
  
  if (values.length === 0) {
    return { mean: 0, stdDev: 1 };
  }
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance) || 1; // Avoid division by zero
  
  return { mean, stdDev };
}

/**
 * Get z-score for a value
 */
function getZScore(value: number | null, stats: ZScoreStats): number {
  if (value === null || value === undefined || isNaN(value)) {
    return 0; // Treat missing as mean (z=0)
  }
  return (value - stats.mean) / stats.stdDev;
}

/**
 * Load V4 features for all FBS teams in a season
 */
async function loadV4Features(season: number): Promise<TeamV4Features[]> {
  console.log(`\n📊 Loading V4 features for season ${season}...`);
  
  // Get all FBS teams for the season
  const fbsMemberships = await prisma.teamMembership.findMany({
    where: {
      season,
      conference: {
        not: null,
      },
    },
    include: {
      team: true,
    },
  });
  
  console.log(`   Found ${fbsMemberships.length} FBS teams`);
  
  const features: TeamV4Features[] = [];
  
  for (const membership of fbsMemberships) {
    const teamId = membership.teamId;
    const teamName = membership.team.name;
    
    // Load season stats
    const seasonStat = await prisma.teamSeasonStat.findUnique({
      where: {
        season_teamId: {
          season,
          teamId,
        },
      },
    });
    
    // Load unit grades (for explosiveness)
    const unitGrades = await prisma.teamUnitGrades.findUnique({
      where: {
        teamId_season: {
          teamId,
          season,
        },
      },
    });
    
    // Extract drive stats from rawJson
    const rawJson = seasonStat?.rawJson as any;
    const driveStats = rawJson?.drive_stats as DriveStats | undefined;
    
    // Extract features
    const offSuccess = seasonStat?.successOff ? Number(seasonStat.successOff) : null;
    const defSuccess = seasonStat?.successDef ? Number(seasonStat.successDef) : null;
    
    const offIso = unitGrades?.offExplosiveness ?? null;
    const defIso = unitGrades?.defExplosiveness ?? null;
    
    const offFinishing = driveStats?.finishingDrives?.off.pointsPerOpp ?? null;
    const defFinishing = driveStats?.finishingDrives?.def.pointsPerOpp ?? null;
    const offAvailPct = driveStats?.availableYards?.off.avgAvailableYardsPct ?? null;
    const defAvailPct = driveStats?.availableYards?.def.avgAvailableYardsPct ?? null;
    
    features.push({
      teamId,
      teamName,
      offSuccess,
      defSuccess,
      offIso,
      defIso,
      offFinishing,
      defFinishing,
      offAvailPct,
      defAvailPct,
    });
  }
  
  // Log feature coverage
  const coverage = {
    offSuccess: features.filter(f => f.offSuccess !== null).length,
    defSuccess: features.filter(f => f.defSuccess !== null).length,
    offIso: features.filter(f => f.offIso !== null).length,
    defIso: features.filter(f => f.defIso !== null).length,
    offFinishing: features.filter(f => f.offFinishing !== null).length,
    defFinishing: features.filter(f => f.defFinishing !== null).length,
    offAvailPct: features.filter(f => f.offAvailPct !== null).length,
    defAvailPct: features.filter(f => f.defAvailPct !== null).length,
  };
  
  console.log(`\n   Feature Coverage:`);
  console.log(`     Off Success: ${coverage.offSuccess}/${features.length}`);
  console.log(`     Def Success: ${coverage.defSuccess}/${features.length}`);
  console.log(`     Off IsoPPP: ${coverage.offIso}/${features.length}`);
  console.log(`     Def IsoPPP: ${coverage.defIso}/${features.length}`);
  console.log(`     Off Finishing: ${coverage.offFinishing}/${features.length}`);
  console.log(`     Def Finishing: ${coverage.defFinishing}/${features.length}`);
  console.log(`     Off Avail %: ${coverage.offAvailPct}/${features.length}`);
  console.log(`     Def Avail %: ${coverage.defAvailPct}/${features.length}`);
  
  return features;
}

/**
 * Compute V4 ratings for all teams
 */
async function computeV4Ratings(season: number): Promise<void> {
  console.log(`\n🧮 Computing V4 ratings for season ${season}...`);
  
  // Load features
  const features = await loadV4Features(season);
  
  if (features.length === 0) {
    console.error('❌ No teams found for this season');
    return;
  }
  
  // Calculate z-score statistics for each metric
  console.log(`\n📈 Computing z-score statistics...`);
  
  const zStats = {
    offSuccess: calculateZScoreStats(features, f => f.offSuccess),
    defSuccess: calculateZScoreStats(features, f => f.defSuccess),
    offIso: calculateZScoreStats(features, f => f.offIso),
    defIso: calculateZScoreStats(features, f => f.defIso),
    offFinishing: calculateZScoreStats(features, f => f.offFinishing),
    defFinishing: calculateZScoreStats(features, f => f.defFinishing),
    offAvailPct: calculateZScoreStats(features, f => f.offAvailPct),
    defAvailPct: calculateZScoreStats(features, f => f.defAvailPct),
  };
  
  // Compute V4 ratings for each team
  console.log(`\n⚖️  Computing V4 offense/defense ratings...`);
  
  interface V4Rating {
    teamId: string;
    teamName: string;
    offenseRating: number;
    defenseRating: number;
    rating: number; // Net rating (offense - defense, scaled)
  }
  
  const ratings: V4Rating[] = [];
  
  for (const feature of features) {
    // Calculate z-scores
    const zOffSuccess = getZScore(feature.offSuccess, zStats.offSuccess);
    const zDefSuccess = -1 * getZScore(feature.defSuccess, zStats.defSuccess); // Invert: lower is better for defense
    const zOffIso = getZScore(feature.offIso, zStats.offIso);
    const zDefIso = -1 * getZScore(feature.defIso, zStats.defIso); // Invert: lower is better for defense
    const zOffFinishing = getZScore(feature.offFinishing, zStats.offFinishing);
    const zDefFinishing = -1 * getZScore(feature.defFinishing, zStats.defFinishing); // Invert: lower is better for defense
    const zOffAvail = getZScore(feature.offAvailPct, zStats.offAvailPct);
    const zDefAvail = -1 * getZScore(feature.defAvailPct, zStats.defAvailPct); // Invert: lower is better for defense
    
    // V4 Offense Rating (SP+/FEI-inspired weights)
    // Success Rate ~ 50%, Explosiveness ~ 25%, Finishing ~ 15%, Available Yards ~ 10%
    const offV4 =
      0.50 * zOffSuccess +
      0.25 * zOffIso +
      0.15 * zOffFinishing +
      0.10 * zOffAvail;
    
    // V4 Defense Rating (inverted z-scores so higher = better)
    const defV4 =
      0.50 * zDefSuccess +
      0.25 * zDefIso +
      0.15 * zDefFinishing +
      0.10 * zDefAvail;
    
    ratings.push({
      teamId: feature.teamId,
      teamName: feature.teamName,
      offenseRating: offV4,
      defenseRating: defV4,
      rating: 0, // Will be computed after net calculation
    });
  }
  
  // Calculate net ratings and scale
  const netRatings = ratings.map(r => r.offenseRating - r.defenseRating);
  const meanNet = netRatings.reduce((sum, r) => sum + r, 0) / netRatings.length;
  const varianceNet = netRatings.reduce((sum, r) => sum + Math.pow(r - meanNet, 2), 0) / netRatings.length;
  const stdDevNet = Math.sqrt(varianceNet) || 1;
  
  // Scale to SP+-ish range (target std dev ~10 points)
  const SCALE = 10;
  
  // Apply scaling and update ratings
  for (let i = 0; i < ratings.length; i++) {
    const netV4 = netRatings[i];
    ratings[i].rating = (netV4 - meanNet) * SCALE;
    // Also scale offense/defense components for storage
    ratings[i].offenseRating = ratings[i].offenseRating * SCALE;
    ratings[i].defenseRating = ratings[i].defenseRating * SCALE;
  }
  
  // Persist to database
  console.log(`\n💾 Persisting V4 ratings to database...`);
  let upserted = 0;
  let errors = 0;
  
  for (const rating of ratings) {
    try {
      await prisma.teamSeasonRating.upsert({
        where: {
          season_teamId_modelVersion: {
            season,
            teamId: rating.teamId,
            modelVersion: 'v4',
          },
        },
        update: {
          rating: rating.rating,
          powerRating: rating.rating, // Alias for compatibility
          offenseRating: rating.offenseRating,
          defenseRating: rating.defenseRating,
          updatedAt: new Date(),
        },
        create: {
          season,
          teamId: rating.teamId,
          modelVersion: 'v4',
          rating: rating.rating,
          powerRating: rating.rating,
          offenseRating: rating.offenseRating,
          defenseRating: rating.defenseRating,
          games: 0, // Not tracking games count in V4
        },
      });
      upserted++;
    } catch (error: any) {
      console.error(`   ⚠️  Failed to upsert rating for ${rating.teamId}:`, error.message);
      errors++;
    }
  }
  
  // Summary
  console.log(`\n✅ V4 ratings computation complete!`);
  console.log(`   Upserted: ${upserted}`);
  console.log(`   Errors: ${errors}`);
  
  // Sort by rating and show top 10
  const sortedRatings = [...ratings].sort((a, b) => b.rating - a.rating);
  const top10 = sortedRatings.slice(0, 10);
  
  console.log(`\n🏆 Top 10 V4 Ratings:`);
  for (let i = 0; i < top10.length; i++) {
    const r = top10[i];
    const ratingStr = r.rating.toFixed(1).padStart(6);
    const offStr = r.offenseRating.toFixed(1).padStart(6);
    const defStr = r.defenseRating.toFixed(1).padStart(6);
    console.log(`   ${i + 1}) ${r.teamName.padEnd(20)} rating=${ratingStr}  off=${offStr}  def=${defStr}`);
  }
  
  // Statistics
  const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
  const minRating = Math.min(...ratings.map(r => r.rating));
  const maxRating = Math.max(...ratings.map(r => r.rating));
  const stdDevRating = Math.sqrt(
    ratings.reduce((sum, r) => sum + Math.pow(r.rating - avgRating, 2), 0) / ratings.length
  );
  
  console.log(`\n📊 V4 Rating Statistics:`);
  console.log(`   Mean: ${avgRating.toFixed(2)}`);
  console.log(`   Std Dev: ${stdDevRating.toFixed(2)}`);
  console.log(`   Range: [${minRating.toFixed(2)}, ${maxRating.toFixed(2)}]`);
}

/**
 * Main entry point
 */
async function main() {
  const program = new Command();
  
  program
    .option('--season <year>', 'Season to compute ratings for', parseInt)
    .action(async (options) => {
      const season = options.season || 2025;
      
      try {
        await computeV4Ratings(season);
      } catch (error) {
        console.error('❌ Error computing V4 ratings:', error);
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
    });
  
  program.parse(process.argv);
}

main();

