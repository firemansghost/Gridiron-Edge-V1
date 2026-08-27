/**
 * Compute Balanced Ratings for CFB teams
 * 
 * Formula: 25% Talent + 25% EPA + 25% Net Points/Game + 25% Win Percentage
 * Then apply calibration factor to convert z-scores to spread points
 * 
 * Formula calculation is extracted to compute_balanced_v1.ts (pure, shared with forensic).
 * Persistence behavior is intentionally unchanged:
 * - UPSERT modelVersion='v1'
 * - On UPDATE: only powerRating, rating, games
 * - offenseRating, defenseRating, confidence, dataSource are NOT updated on existing rows
 */

import { PrismaClient } from '@prisma/client';
import {
  BALANCED_MODEL_VERSION,
  BALANCED_V1_CALIBRATION_FACTOR,
  aggregateBalancedEpa,
  aggregateBalancedGameStats,
  buildBalancedTeamMetrics,
  computeBalancedV1Ratings,
} from './compute_balanced_v1';

const prisma = new PrismaClient();

const CALIBRATION_FACTOR = BALANCED_V1_CALIBRATION_FACTOR; // ~14 points stddev for CFB

interface TeamMetrics {
  teamId: string;
  teamName: string;
  talentScore: number;
  epaOverall: number; // EPA_Off - EPA_Def
  netPointsPerGame: number;
  winPct: number;
  gamesPlayed: number;
}

interface ComputedRating {
  teamId: string;
  teamName: string;
  powerRating: number;
  games: number;
  components: {
    talentZ: number;
    epaZ: number;
    netPointsZ: number;
    winPctZ: number;
    zComposite: number;
  };
}

async function computeBalancedRatings(season: number): Promise<{
  ratings: ComputedRating[];
  metrics: TeamMetrics[];
}> {
  console.log(`\n=== Computing Balanced Ratings for ${season} ===\n`);
  console.log(`Calibration Factor: ${CALIBRATION_FACTOR}`);
  console.log(`Formula: 25% Talent + 25% EPA + 25% Net Pts/G + 25% Win%\n`);

  // Get all FBS teams
  const fbsTeams = await prisma.team.findMany({
    where: { classification: 'fbs' },
    select: { id: true, name: true },
  });
  const fbsTeamIds = new Set(fbsTeams.map(t => t.id.toLowerCase()));
  console.log(`FBS Teams: ${fbsTeams.length}`);

  // Get talent scores
  const talents = await prisma.teamSeasonTalent.findMany({
    where: { season },
    select: { teamId: true, talentComposite: true },
  });
  console.log(`Talent scores: ${talents.length}`);

  // Get all FINAL games for the season (completed games only)
  const games = await prisma.game.findMany({
    where: {
      season,
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
  });
  console.log(`Final games: ${games.length}`);

  // Calculate team stats from games (only FBS vs FBS)
  const teamStats = aggregateBalancedGameStats(games, fbsTeamIds);

  // Get EPA data from TeamGameStat
  const gameStats = await prisma.teamGameStat.findMany({
    where: {
      game: { season },
    },
    select: {
      teamId: true,
      epaOff: true,
      epaDef: true,
    },
  });
  console.log(`Team game stats (EPA): ${gameStats.length}`);

  // Aggregate EPA by team
  const epaByTeam = aggregateBalancedEpa(gameStats);

  // Build metrics for each FBS team (shared pure path)
  const nameById = new Map(
    fbsTeams.map((t) => [t.id.toLowerCase(), t.name] as const)
  );
  const built = buildBalancedTeamMetrics({
    fbsTeamIds: [...fbsTeamIds],
    teamNameById: nameById,
    talentRows: talents,
    gameAggregates: teamStats,
    epaByTeam,
  });
  const metrics: TeamMetrics[] = built.metrics.map((m) => ({
    teamId: m.teamId,
    teamName: m.teamName,
    talentScore: m.talentScore,
    epaOverall: m.epaOverall,
    netPointsPerGame: m.netPointsPerGame,
    winPct: m.winPct,
    gamesPlayed: m.gamesPlayed,
  }));

  console.log(`Teams with metrics: ${metrics.length}`);

  // Calculate ratings using shared pure Balanced V1 formula
  const computed = computeBalancedV1Ratings(built.metrics);
  const ratings: ComputedRating[] = computed.map((r) => ({
    teamId: r.teamId,
    teamName: r.teamName,
    powerRating: r.powerRating,
    games: r.games,
    components: {
      talentZ: r.talentZ,
      epaZ: r.epaZ,
      netPointsZ: r.netPointsZ,
      winPctZ: r.winPctZ,
      zComposite: r.zComposite,
    },
  }));

  return { ratings, metrics };
}

async function persistRatings(
  season: number,
  ratings: ComputedRating[]
): Promise<void> {
  console.log(`\n=== Persisting ${ratings.length} ratings for ${season} ===\n`);

  let created = 0;
  let updated = 0;

  for (const rating of ratings) {
    // Check if rating exists
    const existing = await prisma.teamSeasonRating.findUnique({
      where: {
        teamId_season_modelVersion: {
          teamId: rating.teamId,
          season,
          modelVersion: BALANCED_MODEL_VERSION,
        },
      },
    });

    if (existing) {
      // Update — intentionally only powerRating, rating, games
      // (offenseRating, defenseRating, confidence, dataSource left unchanged)
      await prisma.teamSeasonRating.update({
        where: { id: existing.id },
        data: {
          powerRating: rating.powerRating,
          rating: rating.powerRating, // Same as powerRating for V1
          games: rating.games,
        },
      });
      updated++;
    } else {
      // Create
      await prisma.teamSeasonRating.create({
        data: {
          teamId: rating.teamId,
          season,
          modelVersion: BALANCED_MODEL_VERSION,
          powerRating: rating.powerRating,
          rating: rating.powerRating,
          offenseRating: 0, // Not computed separately in balanced model
          defenseRating: 0,
          games: rating.games,
          confidence: 0.5, // Medium confidence
          dataSource: 'balanced',
        },
      });
      created++;
    }
  }

  console.log(`Created: ${created}, Updated: ${updated}`);
}

async function printTopBottom(
  ratings: ComputedRating[],
  metrics: TeamMetrics[],
  n: number = 10
): Promise<void> {
  const sorted = [...ratings].sort((a, b) => b.powerRating - a.powerRating);
  const metricsMap = new Map(metrics.map(m => [m.teamId, m]));

  console.log(`\n=== TOP ${n} TEAMS ===\n`);
  console.log('Rank | Team                  | Rating  | Talent | EPA    | NetPts | Win%');
  console.log('-----|-----------------------|---------|--------|--------|--------|------');
  
  for (let i = 0; i < Math.min(n, sorted.length); i++) {
    const r = sorted[i];
    const m = metricsMap.get(r.teamId);
    console.log(
      `${String(i + 1).padStart(4)} | ${r.teamName.padEnd(21)} | ${r.powerRating.toFixed(2).padStart(7)} | ` +
      `${(m?.talentScore || 0).toFixed(0).padStart(6)} | ${(m?.epaOverall || 0).toFixed(3).padStart(6)} | ` +
      `${(m?.netPointsPerGame || 0).toFixed(1).padStart(6)} | ${((m?.winPct || 0) * 100).toFixed(0).padStart(4)}%`
    );
  }

  console.log(`\n=== BOTTOM ${n} TEAMS ===\n`);
  console.log('Rank | Team                  | Rating  | Talent | EPA    | NetPts | Win%');
  console.log('-----|-----------------------|---------|--------|--------|--------|------');
  
  for (let i = sorted.length - 1; i >= Math.max(0, sorted.length - n); i--) {
    const r = sorted[i];
    const m = metricsMap.get(r.teamId);
    const rank = i + 1;
    console.log(
      `${String(rank).padStart(4)} | ${r.teamName.padEnd(21)} | ${r.powerRating.toFixed(2).padStart(7)} | ` +
      `${(m?.talentScore || 0).toFixed(0).padStart(6)} | ${(m?.epaOverall || 0).toFixed(3).padStart(6)} | ` +
      `${(m?.netPointsPerGame || 0).toFixed(1).padStart(6)} | ${((m?.winPct || 0) * 100).toFixed(0).padStart(4)}%`
    );
  }

  // Print stats
  const values = ratings.map(r => r.powerRating);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  console.log(`\n=== DISTRIBUTION ===`);
  console.log(`Count: ${values.length}`);
  console.log(`Mean: ${mean.toFixed(2)}`);
  console.log(`StdDev: ${stdDev.toFixed(2)}`);
  console.log(`Min: ${min.toFixed(2)}`);
  console.log(`Max: ${max.toFixed(2)}`);
  console.log(`Range: ${(max - min).toFixed(2)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const seasonArg = args.find(a => a.startsWith('--season='));
  const season = seasonArg ? parseInt(seasonArg.split('=')[1], 10) : 2025;
  const dryRun = args.includes('--dry-run');
  const persist = args.includes('--persist');

  console.log(`Season: ${season}`);
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Persist: ${persist}`);

  try {
    const { ratings, metrics } = await computeBalancedRatings(season);
    
    await printTopBottom(ratings, metrics, 15);

    if (persist && !dryRun) {
      await persistRatings(season, ratings);
      console.log('\n✅ Ratings persisted successfully');
    } else if (dryRun) {
      console.log('\n🔍 DRY RUN - No changes made');
    } else {
      console.log('\n⚠️  Use --persist to save ratings to database');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
