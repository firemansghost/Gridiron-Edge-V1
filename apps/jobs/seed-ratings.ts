#!/usr/bin/env node

/**
 * M3 Seed Ratings Job
 * 
 * Computes linear power ratings from seed data and generates implied lines.
 * Uses simple z-scoring and constant HFA for v1.
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// M3 Constants
const MODEL_VERSION = 'v0.0.1';
const HFA = 2.0; // Home field advantage in points
const CONFIDENCE_THRESHOLDS = {
  A: 4.0, // ≥ 4.0 pts edge
  B: 3.0, // ≥ 3.0 pts edge  
  C: 2.0  // ≥ 2.0 pts edge
};

/**
 * Normalize team ID to handle mismatches
 */
function normalizeId(str) {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
}

/**
 * Title case a string for display names
 */
function titleCase(str) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Upsert game scores
 */
async function upsertScores(scores) {
  let scoresUpdated = 0;
  
  for (const score of scores) {
    const gameId = normalizeId(score.game_id);
    
    await prisma.game.updateMany({
      where: { id: gameId },
      data: {
        homeScore: score.home_score,
        awayScore: score.away_score,
        status: 'final'
      }
    });
    
    scoresUpdated++;
  }
  
  return scoresUpdated;
}

/**
 * Load seed data from JSON files
 */
function loadSeedData() {
  const seedDir = path.join(process.cwd(), 'seed');
  
  const teams = JSON.parse(fs.readFileSync(path.join(seedDir, 'teams.json'), 'utf8')).teams;
  const games = JSON.parse(fs.readFileSync(path.join(seedDir, 'games.json'), 'utf8')).games;
  const teamGameStats = JSON.parse(fs.readFileSync(path.join(seedDir, 'team_game_stats.json'), 'utf8')).team_game_stats;
  const marketLines = JSON.parse(fs.readFileSync(path.join(seedDir, 'market_lines.json'), 'utf8')).market_lines;
  
  // Load scores if available
  let scores = null;
  try {
    scores = JSON.parse(fs.readFileSync(path.join(seedDir, 'scores.json'), 'utf8'));
  } catch (error) {
    console.log('No scores file found, skipping score updates');
  }
  
  return { teams, games, teamGameStats, marketLines, scores };
}

/**
 * Compute z-scores for a dataset
 */
function computeZScores(values) {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return values.map(val => stdDev === 0 ? 0 : (val - mean) / stdDev);
}

/**
 * Extract team features from game stats
 */
function extractTeamFeatures(teamId, teamGameStats) {
  const teamStats = teamGameStats.filter(stat => stat.team_id === teamId);
  
  if (teamStats.length === 0) {
    return {
      ypp_off: 0,
      ypp_def: 0,
      success_off: 0,
      success_def: 0,
      pace: 0,
      talent_index: 0
    };
  }
  
  const stats = teamStats[0];
  const off = stats.offensive_stats;
  const def = stats.defensive_stats;
  
  // Calculate yards per play (YPP)
  const totalPlays = (off.passing_yards + off.rushing_yards) / 4.5; // Rough estimate
  const ypp_off = totalPlays > 0 ? off.total_yards / totalPlays : 0;
  const ypp_def = totalPlays > 0 ? def.yards_allowed / totalPlays : 0;
  
  // Calculate success rate (simplified)
  const success_off = off.third_down_conversions / Math.max(off.third_down_attempts, 1);
  const success_def = 1 - (def.third_down_conversions || 0) / Math.max(def.third_down_attempts || 1, 1);
  
  // Calculate pace (plays per game estimate)
  const pace = totalPlays || 60; // Default to 60 plays
  
  return {
    ypp_off,
    ypp_def: -ypp_def, // Defensive YPP enters negatively
    success_off,
    success_def,
    pace,
    talent_index: 0 // Default for seed mode
  };
}

/**
 * Compute linear power ratings
 */
function computePowerRatings(teams, teamGameStats) {
  console.log('Computing power ratings...');
  
  // Extract features for all teams
  const teamFeatures = {};
  teams.forEach(team => {
    teamFeatures[team.team_id] = extractTeamFeatures(team.team_id, teamGameStats);
  });
  
  // Collect all feature values for z-scoring
  const featureArrays = {
    ypp_off: [],
    ypp_def: [],
    success_off: [],
    success_def: [],
    pace: [],
    talent_index: []
  };
  
  Object.values(teamFeatures).forEach(features => {
    Object.keys(featureArrays).forEach(key => {
      featureArrays[key].push(features[key]);
    });
  });
  
  // Compute z-scores for each feature
  const zScores = {};
  Object.keys(featureArrays).forEach(feature => {
    zScores[feature] = computeZScores(featureArrays[feature]);
  });
  
  // Create team-to-zscore mapping
  const teamZScores = {};
  const teamIds = Object.keys(teamFeatures);
  teamIds.forEach((teamId, index) => {
    teamZScores[teamId] = {};
    Object.keys(zScores).forEach(feature => {
      teamZScores[teamId][feature] = zScores[feature][index];
    });
  });
  
  // Compute ratings using simple linear combination
  const weights = {
    ypp_off: 0.3,
    ypp_def: 0.3,
    success_off: 0.2,
    success_def: 0.2,
    pace: 0.0, // Not used in v1
    talent_index: 0.0 // Not used in v1
  };
  
  const ratings = {};
  Object.keys(teamZScores).forEach(teamId => {
    let rating = 0;
    const components = {};
    
    Object.keys(weights).forEach(feature => {
      const contribution = teamZScores[teamId][feature] * weights[feature];
      rating += contribution;
      components[feature] = {
        z_score: teamZScores[teamId][feature],
        weight: weights[feature],
        contribution
      };
    });
    
    ratings[teamId] = {
      rating,
      components
    };
  });
  
  return ratings;
}

/**
 * Compute implied lines for games
 */
function computeImpliedLines(games, ratings, marketLines) {
  console.log('Computing implied lines...');
  
  const impliedLines = [];
  
  games.forEach(game => {
    const homeRating = ratings[game.home_team_id]?.rating || 0;
    const awayRating = ratings[game.away_team_id]?.rating || 0;
    
    const ratingDiff = homeRating - awayRating;
    const impliedSpread = ratingDiff + (game.neutral_site ? 0 : HFA);
    
    // Simple total calculation (pace + efficiency proxy)
    const homePace = ratings[game.home_team_id]?.components?.pace?.z_score || 0;
    const awayPace = ratings[game.away_team_id]?.components?.pace?.z_score || 0;
    const impliedTotal = 45 + (homePace + awayPace) * 2; // Base 45 + pace adjustment
    
    // Find market lines for this game
    const gameMarketLines = marketLines.filter(line => line.game_id === game.game_id);
    const spreadLine = gameMarketLines.find(line => line.line_type === 'spread');
    const totalLine = gameMarketLines.find(line => line.line_type === 'total');
    
    const marketSpread = spreadLine?.closing_line || 0;
    const marketTotal = totalLine?.closing_line || 45;
    
    // Compute edge and confidence
    const spreadEdge = Math.abs(impliedSpread - marketSpread);
    const totalEdge = Math.abs(impliedTotal - marketTotal);
    const maxEdge = Math.max(spreadEdge, totalEdge);
    
    let confidence = 'C';
    if (maxEdge >= CONFIDENCE_THRESHOLDS.A) confidence = 'A';
    else if (maxEdge >= CONFIDENCE_THRESHOLDS.B) confidence = 'B';
    
    impliedLines.push({
      gameId: game.game_id,
      season: game.season,
      week: game.week,
      impliedSpread,
      impliedTotal,
      marketSpread,
      marketTotal,
      edgeConfidence: confidence,
      modelVersion: MODEL_VERSION
    });
  });
  
  return impliedLines;
}

/**
 * Upsert teams from seed data
 */
async function upsertTeams(teams) {
  console.log('Upserting teams...');
  let teamsInserted = 0;
  const teamIds = new Set();
  
  for (const team of teams) {
    const normalizedId = normalizeId(team.team_id || team.id || team.name);
    if (!normalizedId) continue;
    
    teamIds.add(normalizedId);
    
    await prisma.team.upsert({
      where: { id: normalizedId },
      update: {
        name: team.name,
        conference: team.conference,
        division: team.division || null,
        logoUrl: team.logo_url || null,
        primaryColor: team.primary_color || null,
        secondaryColor: team.secondary_color || null,
        mascot: team.mascot || null,
        city: team.city || null,
        state: team.state || null
      },
      create: {
        id: normalizedId,
        name: team.name,
        conference: team.conference,
        division: team.division || null,
        logoUrl: team.logo_url || null,
        primaryColor: team.primary_color || null,
        secondaryColor: team.secondary_color || null,
        mascot: team.mascot || null,
        city: team.city || null,
        state: team.state || null
      }
    });
    teamsInserted++;
  }
  
  console.log(`✅ Upserted ${teamsInserted} teams`);
  return { teamsInserted, teamIds };
}

/**
 * Upsert games from seed data
 */
async function upsertGames(games, existingTeamIds) {
  console.log('Upserting games...');
  let gamesInserted = 0;
  
  for (const game of games) {
    const homeId = normalizeId(game.home_team_id);
    const awayId = normalizeId(game.away_team_id);
    
    // Check if teams exist, auto-stub if missing
    if (!existingTeamIds.has(homeId)) {
      console.log(`[Stubbed] Inserted missing team: ${homeId}`);
      await prisma.team.upsert({
        where: { id: homeId },
        update: {},
        create: {
          id: homeId,
          name: titleCase(homeId),
          conference: 'Independent',
          division: null,
          logoUrl: null,
          primaryColor: null,
          secondaryColor: null,
          mascot: null,
          city: null,
          state: null
        }
      });
      existingTeamIds.add(homeId);
    }
    
    if (!existingTeamIds.has(awayId)) {
      console.log(`[Stubbed] Inserted missing team: ${awayId}`);
      await prisma.team.upsert({
        where: { id: awayId },
        update: {},
        create: {
          id: awayId,
          name: titleCase(awayId),
          conference: 'Independent',
          division: null,
          logoUrl: null,
          primaryColor: null,
          secondaryColor: null,
          mascot: null,
          city: null,
          state: null
        }
      });
      existingTeamIds.add(awayId);
    }
    
    await prisma.game.upsert({
      where: { id: game.game_id },
      update: {
        homeTeamId: homeId,
        awayTeamId: awayId,
        season: game.season,
        week: game.week,
        date: new Date(game.date),
        status: game.status || 'scheduled',
        homeScore: game.home_score || null,
        awayScore: game.away_score || null,
        venue: game.venue || 'TBD',
        city: game.city || 'TBD',
        neutralSite: game.neutral_site || false,
        conferenceGame: game.conference_game || false
      },
      create: {
        id: game.game_id,
        homeTeamId: homeId,
        awayTeamId: awayId,
        season: game.season,
        week: game.week,
        date: new Date(game.date),
        status: game.status || 'scheduled',
        homeScore: game.home_score || null,
        awayScore: game.away_score || null,
        venue: game.venue || 'TBD',
        city: game.city || 'TBD',
        neutralSite: game.neutral_site || false,
        conferenceGame: game.conference_game || false
      }
    });
    gamesInserted++;
  }
  
  console.log(`✅ Upserted ${gamesInserted} games`);
  return gamesInserted;
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('Starting M3 seed ratings job...');
    
    // Load seed data
    const { teams, games, teamGameStats, marketLines, scores } = loadSeedData();
    console.log(`Loaded ${teams.length} teams, ${games.length} games`);
    
    // Step 1: Upsert teams first (required for foreign keys)
    const { teamsInserted, teamIds } = await upsertTeams(teams);
    
    // Step 2: Upsert games (requires teams to exist)
    const gamesInserted = await upsertGames(games, teamIds);
    
    // Step 2.5: Upsert scores (requires games to exist)
    const scoresUpdated = scores ? await upsertScores(scores) : 0;
    
    // Step 3: Compute power ratings
    const ratings = computePowerRatings(teams, teamGameStats);
    
    // Step 4: Compute implied lines
    const impliedLines = computeImpliedLines(games, ratings, marketLines);
    
    // Step 5: Upsert power ratings
    console.log('Upserting power ratings...');
    for (const [teamId, ratingData] of Object.entries(ratings)) {
      const team = teams.find(t => t.team_id === teamId);
      if (!team) continue;
      
      await prisma.powerRating.upsert({
        where: {
          teamId_season_week_modelVersion: {
            teamId,
            season: 2024,
            week: 1,
            modelVersion: MODEL_VERSION
          }
        },
        update: {
          rating: ratingData.rating,
          features: ratingData.components,
          confidence: Math.abs(ratingData.rating)
        },
        create: {
          teamId,
          season: 2024,
          week: 1,
          rating: ratingData.rating,
          modelVersion: MODEL_VERSION,
          features: ratingData.components,
          confidence: Math.abs(ratingData.rating)
        }
      });
    }
    
    // Step 6: Upsert matchup outputs (requires games to exist)
    console.log('Upserting matchup outputs...');
    for (const line of impliedLines) {
      await prisma.matchupOutput.upsert({
        where: {
          gameId_modelVersion: {
            gameId: line.gameId,
            modelVersion: MODEL_VERSION
          }
        },
        update: {
          season: line.season,
          week: line.week,
          impliedSpread: line.impliedSpread,
          impliedTotal: line.impliedTotal,
          marketSpread: line.marketSpread,
          marketTotal: line.marketTotal,
          edgeConfidence: line.edgeConfidence
        },
        create: {
          gameId: line.gameId,
          season: line.season,
          week: line.week,
          impliedSpread: line.impliedSpread,
          impliedTotal: line.impliedTotal,
          marketSpread: line.marketSpread,
          marketTotal: line.marketTotal,
          edgeConfidence: line.edgeConfidence,
          modelVersion: MODEL_VERSION
        }
      });
    }
    
    console.log('✅ M3 seed ratings job completed successfully!');
    console.log(`- Upserted ${teamsInserted} teams`);
    console.log(`- Upserted ${gamesInserted} games`);
    console.log(`- Updated ${scoresUpdated} game scores`);
    console.log(`- Generated ${Object.keys(ratings).length} power ratings`);
    console.log(`- Generated ${impliedLines.length} implied lines`);
    console.log(`- Model version: ${MODEL_VERSION}`);
    
  } catch (error) {
    console.error('❌ Error in seed ratings job:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, computeZScores, computePowerRatings, computeImpliedLines };
