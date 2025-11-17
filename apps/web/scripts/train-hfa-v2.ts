/**
 * HFA v2 Training Script
 * 
 * Computes team-specific HFA adjustments from historical game data.
 * 
 * Methodology:
 * - For each team, compute average home ATS margin residual vs closing spread
 * - Compute average away ATS margin residual
 * - Estimate team-specific HFA ≈ (home residual - away residual) / 2
 * - Clip to reasonable range (0.5 - 3.5 pts)
 * - Output config file with baseHfaPoints, teamAdjustments, and diagnostics
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { selectClosingLine } from '../lib/closing-line-helpers';
import { getCoreV1SpreadFromTeams } from '../lib/core-v1-spread';
import * as fs from 'fs';
import * as path from 'path';

interface TeamHfaStats {
  teamId: string;
  teamName: string;
  homeGames: number;
  awayGames: number;
  homeResidualSum: number;
  awayResidualSum: number;
  homeResidualMean: number;
  awayResidualMean: number;
  estimatedHfa: number;
  clippedHfa: number;
}

interface HfaConfig {
  baseHfaPoints: number;
  teamAdjustments: Record<string, number>;
  neutralSiteOverrides: Record<string, number>;
  clipRange: {
    min: number;
    max: number;
  };
  version: string;
  timestamp: string;
  diagnostics: {
    totalGames: number;
    teamsWithData: number;
    meanTeamHfa: number;
    medianTeamHfa: number;
    stdDevTeamHfa: number;
    sampleSize: {
      min: number;
      max: number;
      mean: number;
    };
  };
  note?: string;
}

const MIN_GAMES_PER_TEAM = 4; // Minimum home + away games for reliable HFA estimate
const CLIP_MIN = 0.5;
const CLIP_MAX = 3.5;
const BASE_HFA = 2.0;

async function main() {
  console.log('🏈 HFA v2 Training Script');
  console.log('==========================\n');

  // Load historical games (last 3 seasons for sample size)
  const currentSeason = 2025;
  const seasons = [currentSeason - 2, currentSeason - 1, currentSeason];
  
  console.log(`Loading games from seasons: ${seasons.join(', ')}...`);
  
  const games = await prisma.game.findMany({
    where: {
      season: { in: seasons },
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: [
      { season: 'desc' },
      { week: 'desc' },
    ],
  });

  console.log(`Found ${games.length} completed games\n`);

  // Compute team-specific HFA stats
  const teamStats = new Map<string, TeamHfaStats>();

  let processedGames = 0;
  let skippedGames = 0;

  for (const game of games) {
    try {
      // Get closing spread
      const closingSpread = await selectClosingLine(game.id, 'spread');
      if (closingSpread === null) {
        skippedGames++;
        continue;
      }

      // Get Core V1 model spread (using current HFA = 2.0 for consistency)
      // Note: This uses the current model, so HFA estimates are relative to base 2.0
      const coreSpreadInfo = await getCoreV1SpreadFromTeams(
        game.season,
        game.homeTeamId,
        game.awayTeamId,
        game.neutralSite || false,
        game.homeTeam.name,
        game.awayTeam.name
      );

      // Actual margin (home - away)
      const actualMargin = (game.homeScore || 0) - (game.awayScore || 0);
      
      // Model prediction in HMA frame
      const modelSpreadHma = coreSpreadInfo.coreSpreadHma;
      
      // Residual = actual - model
      const residual = actualMargin - modelSpreadHma;

      // Update home team stats
      if (!game.neutralSite) {
        const homeStats = teamStats.get(game.homeTeamId) || {
          teamId: game.homeTeamId,
          teamName: game.homeTeam.name,
          homeGames: 0,
          awayGames: 0,
          homeResidualSum: 0,
          awayResidualSum: 0,
          homeResidualMean: 0,
          awayResidualMean: 0,
          estimatedHfa: 0,
          clippedHfa: 0,
        };
        homeStats.homeGames++;
        homeStats.homeResidualSum += residual;
        teamStats.set(game.homeTeamId, homeStats);
      }

      // Update away team stats
      const awayStats = teamStats.get(game.awayTeamId) || {
        teamId: game.awayTeamId,
        teamName: game.awayTeam.name,
        homeGames: 0,
        awayGames: 0,
        homeResidualSum: 0,
        awayResidualSum: 0,
        homeResidualMean: 0,
        awayResidualMean: 0,
        estimatedHfa: 0,
        clippedHfa: 0,
      };
      awayStats.awayGames++;
      awayStats.awayResidualSum += residual;
      teamStats.set(game.awayTeamId, awayStats);

      processedGames++;
      if (processedGames % 100 === 0) {
        console.log(`Processed ${processedGames} games...`);
      }
    } catch (error) {
      console.error(`Error processing game ${game.id}:`, error);
      skippedGames++;
    }
  }

  console.log(`\nProcessed ${processedGames} games, skipped ${skippedGames} games\n`);

  // Compute team-specific HFA adjustments
  const teamAdjustments: Record<string, number> = {};
  const hfaValues: number[] = [];

  for (const [teamId, stats] of Array.from(teamStats.entries())) {
    if (stats.homeGames === 0 || stats.awayGames === 0) {
      continue;
    }

    stats.homeResidualMean = stats.homeResidualSum / stats.homeGames;
    stats.awayResidualMean = stats.awayResidualSum / stats.awayGames;

    // HFA estimate = (home residual - away residual) / 2
    // This represents how much better the team performs at home vs away
    stats.estimatedHfa = (stats.homeResidualMean - stats.awayResidualMean) / 2;

    // Clip to range
    stats.clippedHfa = Math.max(CLIP_MIN, Math.min(CLIP_MAX, stats.estimatedHfa));

    // Team adjustment = clipped HFA - base HFA
    // (since base is 2.0, adjustment can be negative or positive)
    const totalGames = stats.homeGames + stats.awayGames;
    if (totalGames >= MIN_GAMES_PER_TEAM) {
      const adjustment = stats.clippedHfa - BASE_HFA;
      teamAdjustments[teamId] = adjustment;
      hfaValues.push(stats.clippedHfa);
    }
  }

  // Compute diagnostics
  const sortedHfa = [...hfaValues].sort((a, b) => a - b);
  const meanHfa = hfaValues.length > 0
    ? hfaValues.reduce((sum, val) => sum + val, 0) / hfaValues.length
    : BASE_HFA;
  const medianHfa = sortedHfa.length > 0
    ? (sortedHfa.length % 2 === 0
        ? (sortedHfa[sortedHfa.length / 2 - 1] + sortedHfa[sortedHfa.length / 2]) / 2
        : sortedHfa[Math.floor(sortedHfa.length / 2)])
    : BASE_HFA;
  const variance = hfaValues.length > 0
    ? hfaValues.reduce((sum, val) => sum + Math.pow(val - meanHfa, 2), 0) / hfaValues.length
    : 0;
  const stdDevHfa = Math.sqrt(variance);

  const sampleSizes = Array.from(teamStats.values())
    .filter((s: TeamHfaStats) => s.homeGames + s.awayGames >= MIN_GAMES_PER_TEAM)
    .map((s: TeamHfaStats) => s.homeGames + s.awayGames);
  const minSample = sampleSizes.length > 0 ? Math.min(...sampleSizes) : 0;
  const maxSample = sampleSizes.length > 0 ? Math.max(...sampleSizes) : 0;
  const meanSample = sampleSizes.length > 0
    ? sampleSizes.reduce((sum, val) => sum + val, 0) / sampleSizes.length
    : 0;

  // Build config
  const config: HfaConfig = {
    baseHfaPoints: BASE_HFA,
    teamAdjustments,
    neutralSiteOverrides: {}, // Reserved for future use
    clipRange: {
      min: CLIP_MIN,
      max: CLIP_MAX,
    },
    version: 'v2',
    timestamp: new Date().toISOString(),
    diagnostics: {
      totalGames: processedGames,
      teamsWithData: Object.keys(teamAdjustments).length,
      meanTeamHfa: meanHfa,
      medianTeamHfa: medianHfa,
      stdDevTeamHfa: stdDevHfa,
      sampleSize: {
        min: minSample,
        max: maxSample,
        mean: meanSample,
      },
    },
    note: `HFA v2 trained on ${processedGames} games from seasons ${seasons.join(', ')}. Minimum ${MIN_GAMES_PER_TEAM} games per team.`,
  };

  // Write config file
  const configPath = path.join(__dirname, '../lib/data/core_v1_hfa_config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('✅ HFA v2 config written to:', configPath);
  console.log('\n📊 Diagnostics:');
  console.log(`  Total games processed: ${processedGames}`);
  console.log(`  Teams with sufficient data: ${config.diagnostics.teamsWithData}`);
  console.log(`  Mean team HFA: ${meanHfa.toFixed(2)} pts`);
  console.log(`  Median team HFA: ${medianHfa.toFixed(2)} pts`);
  console.log(`  Std dev: ${stdDevHfa.toFixed(2)} pts`);
  console.log(`  Sample size range: ${minSample}-${maxSample} games (mean: ${meanSample.toFixed(1)})`);
  console.log('\n🎯 Top 5 teams by HFA adjustment:');
  
  const topAdjustments = Object.entries(teamAdjustments)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  
  for (const [teamId, adjustment] of topAdjustments) {
    const stats = teamStats.get(teamId);
    if (stats) {
      console.log(`  ${stats.teamName}: +${adjustment.toFixed(2)} pts (${stats.homeGames}H/${stats.awayGames}A)`);
    }
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

