/**
 * HFA v2 Training Script
 * 
 * Computes team-specific HFA adjustments from historical game data.
 * 
 * Methodology:
 * - Use FBS games only
 * - Use all available seasons/weeks from game_training_rows (dynamically discovered)
 * - Regular season, non-neutral-site games only
 * - For each game, compute residual = actualMargin - (modelFairSpreadWithoutHfa + baseHfaPoints)
 * - Per-team aggregation with shrinkage toward 0
 * - Clip to ensure baseHfaPoints + adjustment stays in [0.5, 3.5]
 */

import { prisma } from '../lib/prisma';
import {
  computeCoreV1Spread,
  computeRatingDiffBlend,
} from '../lib/core-v1-spread';
import * as fs from 'fs';
import * as path from 'path';

interface TeamAdjustment {
  adjustment: number;
  sampleSize: number;
  meanResidual: number;
  stdevResidual: number;
}

interface HfaConfig {
  baseHfaPoints: number;
  clipRange: [number, number];
  teamAdjustments: Record<string, TeamAdjustment>;
}

const BASE_HFA = 2.0;
const CLIP_MIN = 0.5;
const CLIP_MAX = 3.5;
const SHRINKAGE_CONSTANT = 20; // Shrinkage toward 0 for small samples

/**
 * Get FBS team IDs for a season
 */
async function getFBSTeams(season: number): Promise<Set<string>> {
  const memberships = await prisma.teamMembership.findMany({
    where: {
      season,
      level: 'fbs',
    },
    select: { teamId: true },
  });
  
  return new Set(memberships.map((m) => m.teamId));
}

/**
 * Check if a week is regular season (exclude bowls, conference title games)
 * Typically weeks 1-14 are regular season, but we'll be conservative
 */
function isRegularSeason(week: number): boolean {
  // Exclude bowls (typically week 15+) and conference championships (week 14-15)
  // Keep weeks 1-13 as regular season
  return week >= 1 && week <= 13;
}

async function main() {
  console.log('🏈 HFA v2 Training Script');
  console.log('==========================\n');

  // Dynamically discover available seasons and weeks from game_training_rows
  const seasonWeekData = await prisma.gameTrainingRow.groupBy({
    by: ['season'],
    _min: { week: true },
    _max: { week: true },
    _count: { gameId: true },
  });

  if (seasonWeekData.length === 0) {
    throw new Error('No training rows found in game_training_rows table');
  }

  const availableSeasons = seasonWeekData
    .map((s) => s.season)
    .sort((a, b) => b - a);

  console.log(`Discovered ${availableSeasons.length} season(s) in game_training_rows:`);
  seasonWeekData.forEach((s) => {
    console.log(`  Season ${s.season}: weeks ${s._min.week}-${s._max.week} (${s._count.gameId} rows)`);
  });
  console.log(`Using all available seasons: ${availableSeasons.join(', ')}\n`);

  // Load FBS teams for all seasons (union)
  const fbsTeamsBySeason = new Map<number, Set<string>>();
  for (const season of availableSeasons) {
    const fbsTeams = await getFBSTeams(season);
    fbsTeamsBySeason.set(season, fbsTeams);
    console.log(`  Season ${season}: ${fbsTeams.size} FBS teams`);
  }

  // Load training rows: non-neutral, regular season
  // Then join with games table to get scores and team info
  const trainingRows = await prisma.gameTrainingRow.findMany({
    where: {
      season: { in: availableSeasons },
      neutralSite: false,
      week: { lte: 13 }, // Regular season only
    },
    include: {
      game: {
        include: {
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [
      { season: 'desc' },
      { week: 'desc' },
    ],
  });

  // Filter to games that have scores and are FBS
  const gamesWithScores = trainingRows
    .filter((row) => {
      const game = row.game;
      if (!game || game.status !== 'final' || game.homeScore === null || game.awayScore === null) {
        return false;
      }
      const seasonFbs = fbsTeamsBySeason.get(row.season);
      return (
        seasonFbs?.has(game.homeTeamId) &&
        seasonFbs?.has(game.awayTeamId) &&
        isRegularSeason(row.week)
      );
    })
    .map((row) => ({
      id: row.gameId,
      season: row.season,
      week: row.week,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      homeScore: row.game!.homeScore!,
      awayScore: row.game!.awayScore!,
      homeTeam: row.game!.homeTeam,
      awayTeam: row.game!.awayTeam,
    }));

  console.log(`\nFound ${gamesWithScores.length} FBS regular-season non-neutral games with scores\n`);

  // Collect residuals per team (home games only)
  const teamResiduals = new Map<string, number[]>();
  const teamNames = new Map<string, string>();

  let processed = 0;
  let skipped = 0;

  for (const game of gamesWithScores) {
    try {
      // Load V2 ratings directly to compute spread without HFA
      // This avoids using the current HFA config (which might have adjustments)
      const [homeRating, awayRating] = await Promise.all([
        prisma.teamSeasonRating.findUnique({
          where: {
            season_teamId_modelVersion: {
              season: game.season,
              teamId: game.homeTeamId,
              modelVersion: 'v2',
            },
          },
        }),
        prisma.teamSeasonRating.findUnique({
          where: {
            season_teamId_modelVersion: {
              season: game.season,
              teamId: game.awayTeamId,
              modelVersion: 'v2',
            },
          },
        }),
      ]);

      if (!homeRating || !awayRating) {
        skipped++;
        continue;
      }

      const homeV2 = Number(homeRating.powerRating || homeRating.rating || 0);
      const awayV2 = Number(awayRating.powerRating || awayRating.rating || 0);

      // Compute ratingDiffBlend
      const ratingDiffBlend = computeRatingDiffBlend(
        game.homeTeamId,
        game.awayTeamId,
        homeV2,
        awayV2
      );

      // Compute what the spread would be without HFA (HFA = 0)
      // This is the model's fair line before applying any HFA
      const spreadWithoutHfa = computeCoreV1Spread(ratingDiffBlend, 0.0);

      // Actual margin
      const actualMargin = game.homeScore - game.awayScore;

      // Residual = actualMargin - (modelFairSpreadWithoutHfa + baseHfaPoints)
      // This represents how much extra home edge this team had vs the base 2.0 pts
      const residual = actualMargin - (spreadWithoutHfa + BASE_HFA);

      // Store residual for home team
      if (!teamResiduals.has(game.homeTeamId)) {
        teamResiduals.set(game.homeTeamId, []);
        teamNames.set(game.homeTeamId, game.homeTeam.name);
      }
      teamResiduals.get(game.homeTeamId)!.push(residual);

      processed++;
      if (processed % 100 === 0) {
        console.log(`  Processed ${processed} games...`);
      }
    } catch (error) {
      console.error(`  Error processing game ${game.id}:`, error);
      skipped++;
    }
  }

  console.log(`\nProcessed ${processed} games, skipped ${skipped} games\n`);

  // Compute per-team adjustments
  const teamAdjustments: Record<string, TeamAdjustment> = {};
  const effectiveHfas: number[] = [];

  for (const [teamId, residuals] of Array.from(teamResiduals.entries())) {
    const sampleSize = residuals.length;
    
    // Compute mean and stdev
    const meanResidual = residuals.reduce((sum: number, r: number) => sum + r, 0) / sampleSize;
    const variance =
      residuals.reduce((sum: number, r: number) => sum + Math.pow(r - meanResidual, 2), 0) /
      sampleSize;
    const stdevResidual = Math.sqrt(variance);

    // Apply shrinkage: adj = meanResidual * sampleSize / (sampleSize + SHRINKAGE_CONSTANT)
    const rawAdjustment = (meanResidual * sampleSize) / (sampleSize + SHRINKAGE_CONSTANT);

    // Clip adjustment so that baseHfaPoints + adjustment stays in [CLIP_MIN, CLIP_MAX]
    // maxAdjustment = CLIP_MAX - BASE_HFA
    // minAdjustment = CLIP_MIN - BASE_HFA
    const maxAdjustment = CLIP_MAX - BASE_HFA;
    const minAdjustment = CLIP_MIN - BASE_HFA;
    const adjustment = Math.max(minAdjustment, Math.min(maxAdjustment, rawAdjustment));

    teamAdjustments[teamId] = {
      adjustment,
      sampleSize,
      meanResidual,
      stdevResidual,
    };

    // Track effective HFA for diagnostics
    const effectiveHfa = BASE_HFA + adjustment;
    effectiveHfas.push(effectiveHfa);
  }

  // Build config
  const config: HfaConfig = {
    baseHfaPoints: BASE_HFA,
    clipRange: [CLIP_MIN, CLIP_MAX],
    teamAdjustments,
  };

  // Write config file
  const configPath = path.join(__dirname, '../lib/data/core_v1_hfa_config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('✅ HFA v2 config written to:', configPath);

  // Print summary
  const sortedByEffectiveHfa = Object.entries(teamAdjustments)
    .map(([teamId, adj]) => ({
      teamId,
      teamName: teamNames.get(teamId) || teamId,
      effectiveHfa: BASE_HFA + adj.adjustment,
      adjustment: adj.adjustment,
      sampleSize: adj.sampleSize,
    }))
    .sort((a, b) => b.effectiveHfa - a.effectiveHfa);

  console.log('\n📊 Summary:');
  console.log(`  Teams with adjustments: ${Object.keys(teamAdjustments).length}`);
  console.log(`  Min effective HFA: ${Math.min(...effectiveHfas).toFixed(2)} pts`);
  console.log(`  Median effective HFA: ${effectiveHfas.sort((a, b) => a - b)[Math.floor(effectiveHfas.length / 2)].toFixed(2)} pts`);
  console.log(`  Max effective HFA: ${Math.max(...effectiveHfas).toFixed(2)} pts`);

  console.log('\n🏆 Top 10 teams by effective HFA:');
  sortedByEffectiveHfa.slice(0, 10).forEach((team, i) => {
    console.log(
      `  ${i + 1}. ${team.teamName}: ${team.effectiveHfa.toFixed(2)} pts (adj: ${team.adjustment > 0 ? '+' : ''}${team.adjustment.toFixed(2)}, n=${team.sampleSize})`
    );
  });

  console.log('\n📉 Bottom 10 teams by effective HFA:');
  sortedByEffectiveHfa.slice(-10).reverse().forEach((team, i) => {
    console.log(
      `  ${i + 1}. ${team.teamName}: ${team.effectiveHfa.toFixed(2)} pts (adj: ${team.adjustment > 0 ? '+' : ''}${team.adjustment.toFixed(2)}, n=${team.sampleSize})`
    );
  });

  // Flag low sample size teams
  const lowSampleTeams = sortedByEffectiveHfa.filter((t) => t.sampleSize < 10);
  if (lowSampleTeams.length > 0) {
    console.log(`\n⚠️  Low sample size teams (n < 10): ${lowSampleTeams.length}`);
    lowSampleTeams.slice(0, 10).forEach((team) => {
      console.log(`  ${team.teamName}: n=${team.sampleSize}`);
    });
  }

  console.log('\n✅ Training complete!');
}

main()
  .catch((error) => {
    console.error('❌ Training failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
