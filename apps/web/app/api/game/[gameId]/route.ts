/**
 * M3 Game Detail API Route
 * 
 * Returns detailed game information including factor breakdown from components_json.
 */

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick, convertToFavoriteCentric, computeATSEdge } from '@/lib/pick-helpers';
import { pickMarketLine, getLineValue, pickMoneyline, americanToProb } from '@/lib/market-line-helpers';

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  try {
    const { gameId } = params;

    // Get game with all related data
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true,
        weather: true,
        injuries: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        },
        matchupOutputs: {
          where: {
            modelVersion: 'v0.0.1'
          }
        },
        teamGameStats: {
          include: {
            team: true
          }
        }
      }
    });

    if (!game) {
      return Response.json(
        { success: false, error: 'Game not found' },
        { status: 404 }
      );
    }

    const matchupOutput = game.matchupOutputs[0];
    
    // Use helper to pick best market lines (prefers SGO, then latest)
    const spreadLine = pickMarketLine(game.marketLines, 'spread');
    const totalLine = pickMarketLine(game.marketLines, 'total');

    // Get power ratings from team_season_ratings (Ratings v1)
    const [homeRating, awayRating] = await Promise.all([
      prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season: game.season,
            teamId: game.homeTeamId,
            modelVersion: 'v1',
          },
        },
      }),
      prisma.teamSeasonRating.findUnique({
        where: {
          season_teamId_modelVersion: {
            season: game.season,
            teamId: game.awayTeamId,
            modelVersion: 'v1',
          },
        },
      }),
    ]);

    // Load team stats for pace/EPA calculations
    const [homeStats, awayStats] = await Promise.all([
      prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.homeTeamId,
          },
        },
      }),
      prisma.teamSeasonStat.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.awayTeamId,
          },
        },
      }),
    ]);

    // Get initial values from matchupOutput if available
    const initialSpread = matchupOutput?.impliedSpread || 0;
    const initialTotal = matchupOutput?.impliedTotal || 45;
    
    // Compute model spread and total if ratings are available
    let computedSpread = initialSpread;
    let computedTotal = initialTotal;
    
    if (homeRating && awayRating) {
      const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
      const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);
      const HFA = game.neutralSite ? 0 : 2.0;
      computedSpread = homePower - awayPower + HFA;

      // Compute total using pace + efficiency
      // Formula: Total Points = (Home Points Per Play × Home Pace) + (Away Points Per Play × Away Pace)
      // Where Points Per Play is derived from EPA (Expected Points Added) or YPP (Yards Per Play)
      const homeEpaOff = homeStats?.epaOff ? Number(homeStats.epaOff) : null;
      const awayEpaOff = awayStats?.epaOff ? Number(awayStats.epaOff) : null;
      const homeYppOff = homeStats?.yppOff ? Number(homeStats.yppOff) : null;
      const awayYppOff = awayStats?.yppOff ? Number(awayStats.yppOff) : null;
      
      // Default pace: ~70 plays per game for college football
      const homePaceOff = homeStats?.paceOff ? Number(homeStats.paceOff) : 70;
      const awayPaceOff = awayStats?.paceOff ? Number(awayStats.paceOff) : 70;

      // Convert EPA to Points Per Play (PPP)
      // EPA range is typically -0.5 to +0.5, so 7 * EPA gives us ~0-3.5 PPP range
      // Cap at 0.7 PPP max (realistic upper bound for elite offenses)
      const homePpp = homeEpaOff !== null 
        ? Math.max(0, Math.min(0.7, 7 * homeEpaOff))
        : homeYppOff !== null 
          ? Math.min(0.7, 0.8 * homeYppOff) // YPP to PPP proxy (capped)
          : 0.4; // Default: average team scores ~0.4 points per play
      
      const awayPpp = awayEpaOff !== null
        ? Math.max(0, Math.min(0.7, 7 * awayEpaOff))
        : awayYppOff !== null
          ? Math.min(0.7, 0.8 * awayYppOff)
          : 0.4;

      // Calculate total points: (Home PPP × Home Pace) + (Away PPP × Away Pace)
      computedTotal = (homePpp * homePaceOff) + (awayPpp * awayPaceOff);
      
      // Validation: Ensure total is in realistic range (20-90 points)
      // Flag outliers but don't cap them (they might be legitimate for extreme matchups)
      if (computedTotal < 20 || computedTotal > 90) {
        console.warn(`[Game ${gameId}] Total calculation produced outlier: ${computedTotal.toFixed(1)}`, {
          homePpp,
          homePaceOff,
          awayPpp,
          awayPaceOff,
          homeEpaOff,
          awayEpaOff
        });
      }
    }

    // Use computed values if matchupOutput doesn't exist
    const finalImpliedSpread = matchupOutput?.impliedSpread ?? computedSpread;
    const finalImpliedTotal = matchupOutput?.impliedTotal ?? computedTotal;

    // Get line values (prefers closingLine, falls back to lineValue)
    const marketSpread = getLineValue(spreadLine) ?? 0;
    const marketTotal = getLineValue(totalLine) ?? 45;

    // Extract market metadata for source badges
    const spreadMeta = spreadLine ? {
      source: spreadLine.source ?? null,
      bookName: spreadLine.bookName ?? null,
      timestamp: spreadLine.timestamp ?? null,
    } : null;

    const totalMeta = totalLine ? {
      source: totalLine.source ?? null,
      bookName: totalLine.bookName ?? null,
      timestamp: totalLine.timestamp ?? null,
    } : null;

    // Pick moneyline and extract metadata
    const mlLine = pickMoneyline(game.marketLines);
    const mlVal = getLineValue(mlLine); // American odds (negative favorite, positive dog)
    const mlMeta = mlLine ? {
      source: mlLine.source ?? null,
      bookName: mlLine.bookName ?? null,
      timestamp: mlLine.timestamp ?? null,
    } : null;

    // Only create moneyline object if we have actual moneyline data
    let moneyline = null;
    if (mlVal != null) {
      // Determine moneyline pick label
      const fav = mlVal < 0 ? game.homeTeam.name : game.awayTeam.name;
      const moneylinePickLabel = `${fav} ML`;

      moneyline = {
        price: mlVal,
        pickLabel: moneylinePickLabel,
        impliedProb: americanToProb(mlVal),
        meta: mlMeta
      };
    }

    // Convert spreads to favorite-centric format
    const modelSpreadFC = convertToFavoriteCentric(
      finalImpliedSpread,
      game.homeTeamId,
      game.homeTeam.name,
      game.awayTeamId,
      game.awayTeam.name
    );

    const marketSpreadFC = convertToFavoriteCentric(
      marketSpread,
      game.homeTeamId,
      game.homeTeam.name,
      game.awayTeamId,
      game.awayTeam.name
    );

    // Compute spread pick details (favorite-centric)
    const spreadPick = computeSpreadPick(
      finalImpliedSpread,
      game.homeTeam.name,
      game.awayTeam.name,
      game.homeTeamId,
      game.awayTeamId
    );

    // Compute total pick details
    const totalPick = computeTotalPick(finalImpliedTotal, marketTotal);

    // Calculate ATS edge (favorite-centric): positive means model thinks favorite should lay more
    const atsEdge = computeATSEdge(
      finalImpliedSpread,
      marketSpread,
      game.homeTeamId,
      game.awayTeamId
    );

    // Total edge: Model Total - Market Total (positive = model thinks over, negative = under)
    const totalEdgePts = finalImpliedTotal - marketTotal;
    
    // Validation: Flag unrealistic total edge magnitudes
    if (Math.abs(totalEdgePts) > 20) {
      console.warn(`[Game ${gameId}] Large total edge detected: ${totalEdgePts.toFixed(1)}`, {
        modelTotal: finalImpliedTotal,
        marketTotal,
        gameId
      });
    }

    // Convert date to America/Chicago timezone
    const kickoffTime = new Date(game.date).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Helper to convert Prisma Decimal to number
    const toNumber = (value: any): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value);
      if (value && typeof value.toNumber === 'function') return value.toNumber();
      return null;
    };

      // Load talent features (roster talent and recruiting commits)
    const loadTalentFeatures = async (teamId: string, season: number): Promise<any> => {
      try {
        // Load roster talent
        const talent = await prisma.teamSeasonTalent.findUnique({
          where: { season_teamId: { season, teamId } }
        });

        // Load recruiting commits
        const commits = await prisma.teamClassCommits.findUnique({
          where: { season_teamId: { season, teamId } }
        });

        // Calculate weeks played (count final games)
        const gamesPlayed = await prisma.game.count({
          where: {
            season,
            status: 'final',
            OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }]
          }
        });

        // Calculate commits signal (weighted star mix: 5*=5, 4*=4, 3*=3)
        let commitsSignal: number | null = null;
        if (commits) {
          const weightedStars = (commits.fiveStarCommits || 0) * 5 +
                               (commits.fourStarCommits || 0) * 4 +
                               (commits.threeStarCommits || 0) * 3;
          const totalCommits = commits.commitsTotal || 0;
          commitsSignal = totalCommits > 0 ? weightedStars / totalCommits : null;
        }

        return {
          talentComposite: talent ? toNumber(talent.talentComposite) : null,
          blueChipsPct: talent ? toNumber(talent.blueChipsPct) : null,
          commitsSignal,
          weeksPlayed: gamesPlayed,
        };
      } catch (error) {
        console.warn(`Failed to load talent features for ${teamId}:`, error);
        return {
          talentComposite: null,
          blueChipsPct: null,
          commitsSignal: null,
          weeksPlayed: 0,
        };
      }
    };

    // Load team features with fallback hierarchy (replicating FeatureLoader logic)
    const loadTeamFeatures = async (teamId: string, season: number): Promise<any> => {
      // Try game-level features first
      const gameStats = await prisma.teamGameStat.findMany({
        where: {
          teamId,
          season,
          OR: [
            { yppOff: { not: null } },
            { yppDef: { not: null } },
            { successOff: { not: null } },
            { successDef: { not: null } },
          ]
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      });

      if (gameStats.length > 0) {
        const validStats = gameStats.filter(s => s.yppOff !== null || s.successOff !== null);
        if (validStats.length > 0) {
          const sums = validStats.reduce((acc, stat) => ({
            yppOff: acc.yppOff + (toNumber(stat.yppOff) || 0),
            passYpaOff: acc.passYpaOff + (toNumber(stat.passYpaOff) || 0),
            rushYpcOff: acc.rushYpcOff + (toNumber(stat.rushYpcOff) || 0),
            successOff: acc.successOff + (toNumber(stat.successOff) || 0),
            epaOff: acc.epaOff + (toNumber(stat.epaOff) || 0),
            paceOff: acc.paceOff + (toNumber(stat.pace) || 0),
            yppDef: acc.yppDef + (toNumber(stat.yppDef) || 0),
            passYpaDef: acc.passYpaDef + (toNumber(stat.passYpaDef) || 0),
            rushYpcDef: acc.rushYpcDef + (toNumber(stat.rushYpcDef) || 0),
            successDef: acc.successDef + (toNumber(stat.successDef) || 0),
            epaDef: acc.epaDef + (toNumber(stat.epaDef) || 0),
          }), { yppOff: 0, passYpaOff: 0, rushYpcOff: 0, successOff: 0, epaOff: 0, paceOff: 0, yppDef: 0, passYpaDef: 0, rushYpcDef: 0, successDef: 0, epaDef: 0 });
          
          const count = validStats.length;
          const talentFeatures = await loadTalentFeatures(teamId, season);
          return {
            teamId,
            season,
            yppOff: sums.yppOff / count,
            passYpaOff: sums.passYpaOff / count,
            rushYpcOff: sums.rushYpcOff / count,
            successOff: sums.successOff / count,
            epaOff: sums.epaOff / count,
            paceOff: sums.paceOff / count,
            yppDef: sums.yppDef / count,
            passYpaDef: sums.passYpaDef / count,
            rushYpcDef: sums.rushYpcDef / count,
            successDef: sums.successDef / count,
            epaDef: sums.epaDef / count,
            ...talentFeatures,
            dataSource: 'game',
            confidence: Math.min(1.0, count / 8),
            gamesCount: count,
            lastUpdated: validStats[0]?.updatedAt || null,
          };
        }
      }

      // Fallback to season-level features
      const seasonStats = await prisma.teamSeasonStat.findUnique({
        where: { season_teamId: { season, teamId } }
      });

      if (seasonStats) {
        const talentFeatures = await loadTalentFeatures(teamId, season);
        return {
          teamId,
          season,
          yppOff: toNumber(seasonStats.yppOff),
          passYpaOff: toNumber(seasonStats.passYpaOff),
          rushYpcOff: toNumber(seasonStats.rushYpcOff),
          successOff: toNumber(seasonStats.successOff),
          epaOff: toNumber(seasonStats.epaOff),
          paceOff: toNumber(seasonStats.paceOff),
          yppDef: toNumber(seasonStats.yppDef),
          passYpaDef: toNumber(seasonStats.passYpaDef),
          rushYpcDef: toNumber(seasonStats.rushYpcDef),
          successDef: toNumber(seasonStats.successDef),
          epaDef: toNumber(seasonStats.epaDef),
          ...talentFeatures,
          dataSource: 'season',
          confidence: 0.7,
          gamesCount: 0,
          lastUpdated: seasonStats.createdAt,
        };
      }

      // Last resort: baseline ratings
      const baselineRating = await prisma.teamSeasonRating.findUnique({
        where: { season_teamId_modelVersion: { season, teamId, modelVersion: 'v1' } }
      });

      if (baselineRating) {
        const offenseRating = toNumber(baselineRating.offenseRating) || 0;
        const defenseRating = toNumber(baselineRating.defenseRating) || 0;
        const talentFeatures = await loadTalentFeatures(teamId, season);
        return {
          teamId,
          season,
          yppOff: offenseRating > 0 ? offenseRating / 10 : null,
          successOff: null,
          epaOff: offenseRating > 0 ? offenseRating / 20 : null,
          paceOff: null,
          passYpaOff: null,
          rushYpcOff: null,
          yppDef: defenseRating > 0 ? defenseRating / 10 : null,
          successDef: null,
          epaDef: defenseRating > 0 ? defenseRating / 20 : null,
          paceDef: null,
          passYpaDef: null,
          rushYpcDef: null,
          ...talentFeatures,
          dataSource: 'baseline',
          confidence: 0.3,
          gamesCount: 0,
          lastUpdated: baselineRating.createdAt,
        };
      }

      // No data available - but still load talent (for early-season fallback)
      const talentFeatures = await loadTalentFeatures(teamId, season);
      return {
        teamId,
        season,
        yppOff: null,
        successOff: null,
        epaOff: null,
        paceOff: null,
        passYpaOff: null,
        rushYpcOff: null,
        yppDef: null,
        successDef: null,
        epaDef: null,
        paceDef: null,
        passYpaDef: null,
        rushYpcDef: null,
        ...talentFeatures,
        dataSource: 'missing',
        confidence: 0,
        gamesCount: 0,
        lastUpdated: null,
      };
    };

    // Compute Top Factors for each team
    const computeTopFactors = async (teamId: string, season: number): Promise<Array<{factor: string; contribution: number; weight: number; zScore: number}>> => {
      try {
        // Load all FBS teams for the season
        const fbsMemberships = await prisma.teamMembership.findMany({
          where: { season, level: 'fbs' },
          select: { teamId: true }
        });
        const fbsTeamIds = Array.from(new Set(fbsMemberships.map(m => m.teamId.toLowerCase())));

        // Load features for all FBS teams
        const allFeatures: any[] = [];
        for (const tid of fbsTeamIds) {
          const features = await loadTeamFeatures(tid, season);
          allFeatures.push(features);
        }

        // Calculate z-score statistics across all teams
        const calculateZScores = (features: any[], getValue: (f: any) => number | null) => {
          const values = features
            .map(f => getValue(f))
            .filter(v => v !== null && v !== undefined && !isNaN(v))
            .map(v => v!);
          
          if (values.length === 0) {
            return { mean: 0, stdDev: 1 };
          }
          
          const sum = values.reduce((acc, v) => acc + v, 0);
          const mean = sum / values.length;
          const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance) || 1;
          
          return { mean, stdDev };
        };

        const getZScore = (value: number | null, mean: number, stdDev: number): number => {
          if (value === null || value === undefined || isNaN(value)) return 0;
          return (value - mean) / stdDev;
        };

        const zStats = {
          yppOff: calculateZScores(allFeatures, f => f.yppOff ?? null),
          passYpaOff: calculateZScores(allFeatures, f => f.passYpaOff ?? null),
          rushYpcOff: calculateZScores(allFeatures, f => f.rushYpcOff ?? null),
          successOff: calculateZScores(allFeatures, f => f.successOff ?? null),
          epaOff: calculateZScores(allFeatures, f => f.epaOff ?? null),
          yppDef: calculateZScores(allFeatures, f => f.yppDef ?? null),
          passYpaDef: calculateZScores(allFeatures, f => f.passYpaDef ?? null),
          rushYpcDef: calculateZScores(allFeatures, f => f.rushYpcDef ?? null),
          successDef: calculateZScores(allFeatures, f => f.successDef ?? null),
          epaDef: calculateZScores(allFeatures, f => f.epaDef ?? null),
          // Talent z-scores (Phase 3)
          talentComposite: calculateZScores(allFeatures, f => f.talentComposite ?? null),
          blueChipsPct: calculateZScores(allFeatures, f => f.blueChipsPct ?? null),
          commitsSignal: calculateZScores(allFeatures, f => f.commitsSignal ?? null),
        };

        // Load features for the specific team
        const teamFeatures = await loadTeamFeatures(teamId, season);

        // Define weights (matching compute_ratings_v1.ts)
        const offensiveWeights = {
          yppOff: 0.30,
          passYpaOff: 0.20,
          rushYpcOff: 0.15,
          successOff: 0.20,
          epaOff: 0.15,
        };

        const hasDefensiveYards = teamFeatures.yppDef !== null || teamFeatures.passYpaDef !== null || teamFeatures.rushYpcDef !== null;
        const defensiveWeights = hasDefensiveYards ? {
          yppDef: 0.20,
          passYpaDef: 0.20,
          rushYpcDef: 0.15,
          successDef: 0.25,
          epaDef: 0.20,
        } : {
          successDef: 0.25 / (0.25 + 0.20),
          epaDef: 0.20 / (0.25 + 0.20),
          yppDef: 0,
          passYpaDef: 0,
          rushYpcDef: 0,
        };

        // Calculate contributions for all features
        const factors: Array<{factor: string; contribution: number; weight: number; zScore: number}> = [];

        // Offensive factors
        for (const [factor, weight] of Object.entries(offensiveWeights)) {
          if (weight > 0) {
            const value = teamFeatures[factor as keyof typeof teamFeatures] as number | null | undefined;
            const stats = zStats[factor as keyof typeof zStats];
            const zScore = getZScore(value ?? null, stats.mean, stats.stdDev);
            const contribution = weight * zScore;
            factors.push({ factor, contribution, weight, zScore });
          }
        }

        // Defensive factors (contribution is inverted for defense)
        for (const [factor, weight] of Object.entries(defensiveWeights)) {
          if (weight > 0) {
            const value = teamFeatures[factor as keyof typeof teamFeatures] as number | null | undefined;
            const stats = zStats[factor as keyof typeof zStats];
            const zScore = getZScore(value ?? null, stats.mean, stats.stdDev);
            // For defense, lower is better, so invert the contribution
            const contribution = -weight * zScore;
            factors.push({ factor, contribution, weight, zScore });
          }
        }

        // Talent factors (Phase 3)
        const talentWeights = { w_talent: 1.0, w_blue: 0.3, w_commits: 0.15 };
        const weeksPlayed = teamFeatures.weeksPlayed || 0;
        const decay = Math.max(0, 1 - weeksPlayed / 8); // Decay factor
        
        if (teamFeatures.talentComposite !== null) {
          const talentZ = getZScore(teamFeatures.talentComposite, zStats.talentComposite.mean, zStats.talentComposite.stdDev);
          const contribution = decay * talentZ * talentWeights.w_talent;
          factors.push({ 
            factor: 'talent_composite', 
            contribution, 
            weight: talentWeights.w_talent * decay, 
            zScore: talentZ 
          });
        }

        if (teamFeatures.blueChipsPct !== null) {
          const blueZ = getZScore(teamFeatures.blueChipsPct, zStats.blueChipsPct.mean, zStats.blueChipsPct.stdDev);
          const contribution = decay * blueZ * talentWeights.w_blue;
          factors.push({ 
            factor: 'blue_chips_pct', 
            contribution, 
            weight: talentWeights.w_blue * decay, 
            zScore: blueZ 
          });
        }

        if (teamFeatures.commitsSignal !== null) {
          const commitsZ = getZScore(teamFeatures.commitsSignal, zStats.commitsSignal.mean, zStats.commitsSignal.stdDev);
          const cappedCommitsSignal = commitsZ * 0.15; // Cap at 15% of roster signal
          const contribution = decay * cappedCommitsSignal * talentWeights.w_commits;
          factors.push({ 
            factor: 'commits_signal', 
            contribution, 
            weight: talentWeights.w_commits * decay * 0.15, 
            zScore: commitsZ 
          });
        }

        // Sort by absolute contribution and return top 5
        return factors
          .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
          .slice(0, 5);
      } catch (error) {
        console.error(`Error computing top factors for team ${teamId}:`, error);
        return [];
      }
    };

    // Compute top factors for both teams
    const [homeFactors, awayFactors] = await Promise.all([
      computeTopFactors(game.homeTeamId, game.season),
      computeTopFactors(game.awayTeamId, game.season)
    ]);

    // Calculate talent differential (Phase 3)
    const calculateTalentDifferential = async (homeId: string, awayId: string, season: number) => {
      try {
        const [homeFeatures, awayFeatures] = await Promise.all([
          loadTeamFeatures(homeId, season),
          loadTeamFeatures(awayId, season)
        ]);

        // Load all FBS teams for z-score calculation
        const fbsMemberships = await prisma.teamMembership.findMany({
          where: { season, level: 'fbs' },
          select: { teamId: true }
        });
        const fbsTeamIds = Array.from(new Set(fbsMemberships.map(m => m.teamId.toLowerCase())));
        const allFeatures: any[] = [];
        for (const tid of fbsTeamIds) {
          const features = await loadTeamFeatures(tid, season);
          allFeatures.push(features);
        }

        const calculateZScores = (features: any[], getValue: (f: any) => number | null) => {
          const values = features
            .map(f => getValue(f))
            .filter(v => v !== null && v !== undefined && !isNaN(v))
            .map(v => v!);
          
          if (values.length === 0) {
            return { mean: 0, stdDev: 1 };
          }
          
          const sum = values.reduce((acc, v) => acc + v, 0);
          const mean = sum / values.length;
          const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
          const stdDev = Math.sqrt(variance) || 1;
          
          return { mean, stdDev };
        };

        const getZScore = (value: number | null, mean: number, stdDev: number): number => {
          if (value === null || value === undefined || isNaN(value)) return 0;
          return (value - mean) / stdDev;
        };

        const zStats = {
          talentComposite: calculateZScores(allFeatures, f => f.talentComposite ?? null),
          blueChipsPct: calculateZScores(allFeatures, f => f.blueChipsPct ?? null),
          commitsSignal: calculateZScores(allFeatures, f => f.commitsSignal ?? null),
        };

        const talentWeights = { w_talent: 1.0, w_blue: 0.3, w_commits: 0.15 };
        
        // Home talent component
        const homeWeeksPlayed = homeFeatures.weeksPlayed || 0;
        const homeDecay = Math.max(0, 1 - homeWeeksPlayed / 8);
        const homeTalentZ = getZScore(homeFeatures.talentComposite, zStats.talentComposite.mean, zStats.talentComposite.stdDev);
        const homeBlueZ = getZScore(homeFeatures.blueChipsPct, zStats.blueChipsPct.mean, zStats.blueChipsPct.stdDev);
        const homeCommitsZ = getZScore(homeFeatures.commitsSignal, zStats.commitsSignal.mean, zStats.commitsSignal.stdDev);
        const homeTalentPrior = homeTalentZ * talentWeights.w_talent + 
                                homeBlueZ * talentWeights.w_blue + 
                                (homeCommitsZ * 0.15) * talentWeights.w_commits;
        const homeTalentComponent = homeDecay * homeTalentPrior;

        // Away talent component
        const awayWeeksPlayed = awayFeatures.weeksPlayed || 0;
        const awayDecay = Math.max(0, 1 - awayWeeksPlayed / 8);
        const awayTalentZ = getZScore(awayFeatures.talentComposite, zStats.talentComposite.mean, zStats.talentComposite.stdDev);
        const awayBlueZ = getZScore(awayFeatures.blueChipsPct, zStats.blueChipsPct.mean, zStats.blueChipsPct.stdDev);
        const awayCommitsZ = getZScore(awayFeatures.commitsSignal, zStats.commitsSignal.mean, zStats.commitsSignal.stdDev);
        const awayTalentPrior = awayTalentZ * talentWeights.w_talent + 
                                awayBlueZ * talentWeights.w_blue + 
                                (awayCommitsZ * 0.15) * talentWeights.w_commits;
        const awayTalentComponent = awayDecay * awayTalentPrior;

        // Talent differential (home - away, in points)
        const talentDifferential = homeTalentComponent - awayTalentComponent;

        return {
          talentDifferential: Math.round(talentDifferential * 10) / 10,
          homeTalentComponent: Math.round(homeTalentComponent * 10) / 10,
          awayTalentComponent: Math.round(awayTalentComponent * 10) / 10,
          homeDecay: Math.round(homeDecay * 100) / 100,
          awayDecay: Math.round(awayDecay * 100) / 100,
        };
      } catch (error) {
        console.warn('Failed to calculate talent differential:', error);
        return {
          talentDifferential: null,
          homeTalentComponent: null,
          awayTalentComponent: null,
          homeDecay: null,
          awayDecay: null,
        };
      }
    };

    const talentDiff = await calculateTalentDifferential(game.homeTeamId, game.awayTeamId, game.season);

    const response = {
      success: true,
      game: {
        id: game.id,
        matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
        kickoff: kickoffTime,
        venue: game.venue,
        city: game.city,
        neutralSite: game.neutralSite,
        conferenceGame: game.conferenceGame,
        status: game.status,
        homeScore: game.homeScore,
        awayScore: game.awayScore
      },
      
      // Market data (favorite-centric)
      market: {
        spread: marketSpread, // Keep original for reference
        total: marketTotal,
        source: spreadLine?.bookName || 'Unknown',
        favorite: {
          teamId: marketSpreadFC.favoriteTeamId,
          teamName: marketSpreadFC.favoriteTeamName,
          spread: marketSpreadFC.favoriteSpread, // Always negative
        },
        underdog: {
          teamId: marketSpreadFC.underdogTeamId,
          teamName: marketSpreadFC.underdogTeamName,
          spread: marketSpreadFC.underdogSpread, // Always positive
        },
        meta: {
          spread: spreadMeta,
          total: totalMeta,
        },
        moneyline
      },
      
      // Model data (favorite-centric)
      model: {
        spread: finalImpliedSpread, // Keep original for reference
        total: finalImpliedTotal,
        favorite: {
          teamId: modelSpreadFC.favoriteTeamId,
          teamName: modelSpreadFC.favoriteTeamName,
          spread: modelSpreadFC.favoriteSpread, // Always negative
        },
        underdog: {
          teamId: modelSpreadFC.underdogTeamId,
          teamName: modelSpreadFC.underdogTeamName,
          spread: modelSpreadFC.underdogSpread, // Always positive
        },
        confidence: matchupOutput?.edgeConfidence || 'C'
      },
      
      // Edge analysis (favorite-centric)
      edge: {
        atsEdge: atsEdge, // Positive = model thinks favorite should lay more
        totalEdge: totalEdgePts, // Positive = model thinks over, negative = under
        maxEdge: Math.max(Math.abs(atsEdge), Math.abs(totalEdgePts))
      },

      // New explicit pick fields
      picks: {
        spread: {
          ...spreadPick,
          edgePts: atsEdge,
          // For backward compatibility
          spreadEdge: Math.abs(atsEdge),
        },
        total: {
          ...totalPick,
          edgePts: totalEdgePts
        }
      },
      
      // Power ratings (from team_season_ratings)
      ratings: {
        home: {
          team: game.homeTeam.name,
          rating: homeRating ? Number(homeRating.powerRating || homeRating.rating || 0) : 0,
          confidence: homeRating ? Number(homeRating.confidence || 0) : 0,
          factors: homeFactors,
          talentComponent: talentDiff.homeTalentComponent,
          decay: talentDiff.homeDecay,
        },
        away: {
          team: game.awayTeam.name,
          rating: awayRating ? Number(awayRating.powerRating || awayRating.rating || 0) : 0,
          confidence: awayRating ? Number(awayRating.confidence || 0) : 0,
          factors: awayFactors,
          talentComponent: talentDiff.awayTalentComponent,
          decay: talentDiff.awayDecay,
        },
        talentDifferential: talentDiff.talentDifferential, // Home - Away talent advantage (in points)
      },
      
      // Model configuration
      modelConfig: {
        version: matchupOutput?.modelVersion || 'v0.0.1',
        hfa: 2.0, // Constant HFA for v1
        thresholds: {
          A: 4.0,
          B: 3.0,
          C: 2.0
        }
      },

      // Sign convention
      signConvention: {
        spread: 'home_minus_away',
        hfaPoints: 2.0
      },

      // Weather data (if available)
      weather: game.weather ? {
        temperature: game.weather.temperature,
        windSpeed: game.weather.windSpeed,
        precipitationProb: game.weather.precipitationProb,
        humidity: game.weather.humidity,
        conditions: game.weather.conditions,
        source: game.weather.source,
        forecastTime: game.weather.forecastTime,
      } : null,

      // Injury data (if available)
      injuries: game.injuries.map(injury => ({
        id: injury.id,
        teamId: injury.teamId,
        teamName: injury.team.name,
        playerName: injury.playerName,
        position: injury.position,
        severity: injury.severity,
        bodyPart: injury.bodyPart,
        injuryType: injury.injuryType,
        status: injury.status,
        reportedAt: injury.reportedAt,
        source: injury.source,
      })),

      // Line history (pre-computed for client)
      lineHistory: await (async () => {
        // Fetch all market lines for this game
        const allLines = await prisma.marketLine.findMany({
          where: { gameId },
          orderBy: { timestamp: 'asc' },
          select: {
            id: true,
            lineType: true,
            lineValue: true,
            closingLine: true,
            timestamp: true,
            source: true,
            bookName: true,
            createdAt: true,
          }
        });

        // Group by lineType
        const grouped = allLines.reduce((acc, line) => {
          if (!acc[line.lineType]) {
            acc[line.lineType] = [];
          }
          acc[line.lineType].push({
            id: line.id,
            lineValue: line.lineValue,
            closingLine: line.closingLine,
            timestamp: line.timestamp.toISOString(),
            source: line.source,
            bookName: line.bookName,
            createdAt: line.createdAt.toISOString(),
          });
          return acc;
        }, {} as Record<string, any[]>);

        // Calculate statistics for each line type
        const stats: Record<string, any> = {};
        for (const [type, lines] of Object.entries(grouped)) {
          if (lines.length > 0) {
            const values = lines.map(l => l.lineValue);
            const opening = lines[0];
            const closing = lines[lines.length - 1];
            
            stats[type] = {
              count: lines.length,
              opening: {
                value: opening.lineValue,
                timestamp: opening.timestamp,
                bookName: opening.bookName,
                source: opening.source,
              },
              closing: {
                value: closing.closingLine !== null ? closing.closingLine : closing.lineValue,
                timestamp: closing.timestamp,
                bookName: closing.bookName,
                source: closing.source,
              },
              movement: closing.closingLine !== null 
                ? closing.closingLine - opening.lineValue
                : closing.lineValue - opening.lineValue,
              min: Math.min(...values),
              max: Math.max(...values),
              range: Math.max(...values) - Math.min(...values),
            };
          }
        }

        return {
          history: grouped,
          statistics: stats,
          totalLines: allLines.length,
        };
      })(),

      // Team records and form (pre-computed for client)
      teams: await (async () => {
        // Calculate records for both teams (season-to-date, up to current week)
        const calculateTeamRecord = async (teamId: string, season: number, maxWeek: number) => {
          const completedGames = await prisma.game.findMany({
            where: {
              season,
              week: { lte: maxWeek },
              status: 'final',
              OR: [
                { homeTeamId: teamId },
                { awayTeamId: teamId }
              ]
            },
            select: {
              homeTeamId: true,
              awayTeamId: true,
              homeScore: true,
              awayScore: true,
            }
          });

          let wins = 0;
          let losses = 0;
          
          for (const game of completedGames) {
            const isHome = game.homeTeamId === teamId;
            const teamScore = isHome ? game.homeScore : game.awayScore;
            const opponentScore = isHome ? game.awayScore : game.homeScore;
            
            if (teamScore !== null && opponentScore !== null) {
              if (teamScore > opponentScore) wins++;
              else if (teamScore < opponentScore) losses++;
            }
          }

          return { wins, losses, total: wins + losses };
        };

        // Get last 5 games for each team (most recent completed games)
        const getLast5Games = async (teamId: string, season: number) => {
          const recentGames = await prisma.game.findMany({
            where: {
              season,
              status: 'final',
              OR: [
                { homeTeamId: teamId },
                { awayTeamId: teamId }
              ]
            },
            orderBy: { date: 'desc' },
            take: 5,
            include: {
              homeTeam: { select: { id: true, name: true } },
              awayTeam: { select: { id: true, name: true } },
            }
          });

          return recentGames.map(game => {
            const isHome = game.homeTeamId === teamId;
            const opponent = isHome ? game.awayTeam : game.homeTeam;
            const teamScore = isHome ? game.homeScore : game.awayScore;
            const opponentScore = isHome ? game.awayScore : game.homeScore;
            
            let result: 'W' | 'L' | 'T' = 'T';
            if (teamScore !== null && opponentScore !== null) {
              result = teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'T';
            }

            return {
              gameId: game.id,
              date: game.date.toISOString(),
              opponent: opponent.name,
              opponentId: opponent.id,
              home: isHome,
              teamScore,
              opponentScore,
              result,
            };
          });
        };

        const [homeRecord, awayRecord, homeLast5, awayLast5] = await Promise.all([
          calculateTeamRecord(game.homeTeamId, game.season, game.week),
          calculateTeamRecord(game.awayTeamId, game.season, game.week),
          getLast5Games(game.homeTeamId, game.season),
          getLast5Games(game.awayTeamId, game.season),
        ]);

        return {
          home: {
            team: game.homeTeam,
            record: homeRecord,
            last5Games: homeLast5,
            form: homeLast5.map(g => g.result).join(''),
          },
          away: {
            team: game.awayTeam,
            record: awayRecord,
            last5Games: awayLast5,
            form: awayLast5.map(g => g.result).join(''),
          },
        };
      })(),

      // Rankings (pre-computed for client)
      rankings: await (async () => {
        // Fetch rankings for both teams for the current week
        const [homeRankings, awayRankings] = await Promise.all([
          prisma.teamRanking.findMany({
            where: {
              season: game.season,
              week: game.week,
              teamId: game.homeTeamId,
            },
            select: {
              pollType: true,
              rank: true,
              points: true,
            },
          }),
          prisma.teamRanking.findMany({
            where: {
              season: game.season,
              week: game.week,
              teamId: game.awayTeamId,
            },
            select: {
              pollType: true,
              rank: true,
              points: true,
            },
          }),
        ]);

        // Format rankings as { AP: 10, COACHES: 12, CFP: 11 } or null if not ranked
        const formatRankings = (rankings: any[]) => {
          const result: Record<string, { rank: number; points?: number | null } | null> = {
            AP: null,
            COACHES: null,
            CFP: null,
          };
          
          for (const ranking of rankings) {
            result[ranking.pollType] = {
              rank: ranking.rank,
              points: ranking.points,
            };
          }
          
          return result;
        };

        return {
          home: formatRankings(homeRankings),
          away: formatRankings(awayRankings),
        };
      })(),
    };

    return Response.json(response);

  } catch (error) {
    console.error('Error fetching game detail:', error);
    return Response.json(
      { 
        success: false, 
        error: 'Failed to fetch game detail',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
