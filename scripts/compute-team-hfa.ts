/**
 * Phase 2.3: Compute Team-Specific HFA (Home Field Advantage)
 * 
 * Computes HFA_raw per team-season, applies empirical-Bayes shrinkage,
 * and persists to team_season_ratings.hfa_team.
 */

import { prisma } from '../apps/web/lib/prisma';

const LEAGUE_MEAN_HFA = 2.0; // Default league mean
const SHRINKAGE_K = 8; // Prior strength
const HFA_MIN = 0.5;
const HFA_MAX = 5.0;
const LOW_SAMPLE_THRESHOLD = 4;
const LOW_SAMPLE_MAX_W = 0.4;

interface HFAComputation {
  teamId: string;
  season: number;
  hfaRaw: number;
  hfaShrunk: number;
  nHome: number;
  nAway: number;
  nTotal: number;
  shrinkW: number;
  leagueMean: number;
  capped: boolean;
  lowSample: boolean;
  outlier: boolean;
}

async function computeTeamHFARaw(teamId: string, season: number): Promise<{ hfaRaw: number; nHome: number; nAway: number; nTotal: number } | null> {
  // Get team's games for this season (regular season only, exclude bowls/CFP/neutral)
  const games = await prisma.game.findMany({
    where: {
      season,
      status: 'final',
      OR: [
        { homeTeamId: teamId },
        { awayTeamId: teamId }
      ],
      neutralSite: false, // Exclude neutral sites
      // Exclude bowls/CFP (week >= 15 typically)
      week: { lt: 15 }
    },
    include: {
      homeTeam: true,
      awayTeam: true
    }
  });

  if (games.length === 0) {
    return null;
  }

  // Get ratings for all teams in this season
  const allRatings = await prisma.teamSeasonRating.findMany({
    where: { season, modelVersion: 'v1' }
  });
  const ratingsMap = new Map(allRatings.map(r => [r.teamId, Number(r.powerRating || r.rating || 0)]));

  // Get team's own rating
  const teamRating = ratingsMap.get(teamId) || 0;

  // Compute residuals for each game
  const homeResiduals: number[] = [];
  const awayResiduals: number[] = [];

  for (const game of games) {
    if (!game.homeScore || !game.awayScore) continue;

    const isHome = game.homeTeamId === teamId;
    const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
    const opponentRating = ratingsMap.get(opponentId) || 0;

    // Expected margin (from team's perspective)
    const expectedMargin = isHome
      ? teamRating - opponentRating + LEAGUE_MEAN_HFA
      : opponentRating - teamRating + LEAGUE_MEAN_HFA;

    // Observed margin (from team's perspective)
    const observedMargin = isHome
      ? game.homeScore - game.awayScore
      : game.awayScore - game.homeScore;

    // Residual = observed - expected
    const residual = observedMargin - expectedMargin;

    if (isHome) {
      homeResiduals.push(residual);
    } else {
      // For away games, flip sign to measure "home boost" when playing away
      awayResiduals.push(-residual);
    }
  }

  const nHome = homeResiduals.length;
  const nAway = awayResiduals.length;
  const nTotal = nHome + nAway;

  if (nTotal === 0) {
    return null;
  }

  // Compute HFA_raw: weighted average of home and away residuals
  const homeMean = nHome > 0 ? homeResiduals.reduce((a, b) => a + b, 0) / nHome : 0;
  const awayMean = nAway > 0 ? awayResiduals.reduce((a, b) => a + b, 0) / nAway : 0;
  
  // Weight by game counts
  const hfaRaw = nTotal > 0
    ? (nHome * homeMean + nAway * awayMean) / nTotal
    : 0;

  return { hfaRaw, nHome, nAway, nTotal };
}

function computeLeagueMeanHFA(hfaValues: number[]): number {
  if (hfaValues.length === 0) {
    return LEAGUE_MEAN_HFA;
  }
  
  // Filter out extreme outliers (|hfa| > 20) before computing median
  // These are likely data quality issues (missing scores, wrong teams, etc.)
  const filtered = hfaValues.filter(v => Math.abs(v) <= 20);
  
  if (filtered.length === 0) {
    // If all values are outliers, use default
    return LEAGUE_MEAN_HFA;
  }
  
  // Use median (more robust to outliers)
  const sorted = [...filtered].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  
  // Cap the league mean to reasonable bounds [1.0, 4.0]
  // This prevents extreme league means from affecting shrinkage
  return Math.max(1.0, Math.min(4.0, median));
}

async function computeAndPersistHFA(season: number) {
  console.log(`\n📊 Computing Team-Specific HFA for ${season}...\n`);

  // Get all teams with ratings for this season
  const teams = await prisma.teamSeasonRating.findMany({
    where: { season, modelVersion: 'v1' },
    select: { teamId: true }
  });

  const teamIds = [...new Set(teams.map(t => t.teamId))];
  console.log(`   Found ${teamIds.length} teams with ratings\n`);

  // First pass: compute all HFA_raw values
  const hfaRawData = new Map<string, { hfaRaw: number; nHome: number; nAway: number; nTotal: number }>();
  
  for (const teamId of teamIds) {
    try {
      const result = await computeTeamHFARaw(teamId, season);
      if (result) {
        hfaRawData.set(teamId, result);
      }
    } catch (error: any) {
      console.error(`   Error computing HFA_raw for ${teamId}:`, error.message);
    }
  }

  // Compute league mean from all HFA_raw values
  const allHFARaw = Array.from(hfaRawData.values()).map(d => d.hfaRaw);
  const leagueMean = computeLeagueMeanHFA(allHFARaw);
  console.log(`   League mean HFA: ${leagueMean.toFixed(2)} pts (from ${allHFARaw.length} teams)\n`);

  // Second pass: apply shrinkage and persist
  let computed = 0;
  let skipped = 0;
  let errors = 0;

  for (const teamId of teamIds) {
    try {
      const rawData = hfaRawData.get(teamId);
      if (!rawData) {
        skipped++;
        continue;
      }

      const { hfaRaw, nHome, nAway, nTotal } = rawData;

      // Check for outliers
      const outlier = Math.abs(hfaRaw) > 8;

      // Shrinkage: w = n_total / (n_total + k)
      let shrinkW = nTotal / (nTotal + SHRINKAGE_K);
      
      // Low-sample rescue
      const lowSample = nTotal < LOW_SAMPLE_THRESHOLD;
      if (lowSample) {
        shrinkW = Math.min(shrinkW, LOW_SAMPLE_MAX_W);
      }

      // If no valid games, use league mean
      let hfaUsed: number;
      let capped = false;
      
      if (nTotal < 2) {
        hfaUsed = leagueMean;
        shrinkW = 0;
      } else {
        // Apply shrinkage
        const hfaShrunk = shrinkW * hfaRaw + (1 - shrinkW) * leagueMean;
        
        // Cap to [0.5, 5.0]
        hfaUsed = Math.max(HFA_MIN, Math.min(HFA_MAX, hfaShrunk));
        capped = hfaShrunk !== hfaUsed;
      }

      // Persist to database
      await prisma.teamSeasonRating.update({
        where: {
          season_teamId_modelVersion: {
            season,
            teamId,
            modelVersion: 'v1'
          }
        },
        data: {
          hfaTeam: hfaUsed,
          hfaRaw: hfaRaw,
          hfaNHome: nHome,
          hfaNAway: nAway,
          hfaShrinkW: shrinkW
        }
      });

      computed++;
      
      if (outlier || capped || lowSample) {
        console.log(`   ⚠️  ${teamId}: raw=${hfaRaw.toFixed(2)}, used=${hfaUsed.toFixed(2)}, n=${nTotal} (${nHome}H/${nAway}A), w=${shrinkW.toFixed(2)} ${outlier ? '[OUTLIER]' : ''} ${capped ? '[CAPPED]' : ''} ${lowSample ? '[LOW_SAMPLE]' : ''}`);
      }
    } catch (error: any) {
      console.error(`   Error persisting HFA for ${teamId}:`, error.message);
      errors++;
    }
  }

  console.log(`\n✅ Complete: ${computed} computed, ${skipped} skipped, ${errors} errors\n`);
}

const season = parseInt(process.argv[2] || '2025', 10);
computeAndPersistHFA(season)
  .then(() => prisma.$disconnect())
  .catch(console.error);
