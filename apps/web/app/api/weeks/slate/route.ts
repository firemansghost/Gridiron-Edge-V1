/**
 * Weeks Slate API Route
 * Returns games for a specific week with closing lines and scores
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { selectClosingLine } from '@/lib/closing-line-helpers';
import { getCoreV1SpreadFromTeams, getATSPick, computeATSEdgeHma } from '@/lib/core-v1-spread';
import { getOUPick } from '@/lib/core-v1-total';
import { americanToProb } from '@/lib/market-line-helpers';

interface SlateGame {
  gameId: string;
  date: string;
  kickoffLocal: string;
  status: 'final' | 'scheduled' | 'in_progress';
  awayTeamId: string;
  awayTeamName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayScore: number | null;
  homeScore: number | null;
  closingSpread: {
    value: number;
    book: string;
    timestamp: string;
  } | null;
  closingTotal: {
    value: number;
    book: string;
    timestamp: string;
  } | null;
  hasOdds?: boolean; // Indicates if game has any market lines
  // Advanced columns (optional)
  modelSpread?: number | null;
  modelTotal?: number | null;
  pickSpread?: string | null;
  pickTotal?: string | null;
  pickMoneyline?: string | null;
  maxEdge?: number | null;
  confidence?: string | null;
  // Individual market picks with grades
  picks?: {
    spread?: {
      label: string | null;
      edge: number | null;
      grade: string | null;
      // 2026 playbook fields
      hybridConflictType?: string | null;
      tierBucket?: string;
      isSuperTierA?: boolean;
      clv?: number | null;
      betTeamContinuity?: number | null;
      oppContinuity?: number | null;
      continuityDiff?: number | null;
    };
    total?: {
      label: string | null;
      edge: number | null;
      grade: string | null;
    };
    moneyline?: {
      label: string | null;
      value: number | null;
      grade: string | null;
    };
  };
  // Debug info (only when debug=1 query param is present)
  coreV1Debug?: {
    attempted: boolean;
    success: boolean;
    modelSpreadHma?: number | null;
    edgeHma?: number | null;
    errorMessage?: string | null;
  };
}


export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const season = parseInt(url.searchParams.get('season') || '2025', 10);
    const week = parseInt(url.searchParams.get('week') || '9', 10);
    
    // Query parameters for performance optimization
    const limitDates = parseInt(url.searchParams.get('limitDates') || '0', 10);
    const afterDate = url.searchParams.get('afterDate');
    const includeAdvanced = url.searchParams.get('includeAdvanced') === 'true';
    const debug = url.searchParams.get('debug') === '1' || url.searchParams.get('debug') === 'true';

    if (!season || !week) {
      return NextResponse.json(
        { error: 'Invalid season or week parameter' },
        { status: 400 }
      );
    }

    console.log(`📅 Fetching slate for ${season} Week ${week}${limitDates > 0 ? ` (limitDates: ${limitDates})` : ''}${afterDate ? ` (afterDate: ${afterDate})` : ''}`);

    // Build where clause with date filtering
    const whereClause: any = { season, week };
    
    if (afterDate) {
      whereClause.date = { gt: new Date(afterDate) };
    }

    // Get games with team info
    const games = await prisma.game.findMany({
      where: whereClause,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } }
      },
      orderBy: { date: 'asc' }
    });

    // Apply date limiting if requested
    let filteredGames = games;
    if (limitDates > 0) {
      const uniqueDates = Array.from(new Set(games.map(g => g.date.toISOString().split('T')[0])));
      const limitedDates = uniqueDates.slice(0, limitDates);
      filteredGames = games.filter(g => 
        limitedDates.includes(g.date.toISOString().split('T')[0])
      );
    }

    console.log(`   Found ${filteredGames.length} games for ${season} Week ${week}`);

    // Show ALL games (for backtesting and to identify which games need odds)
    // Query market lines by season/week to populate odds data for games that have it
    const [spreadLines, totalLines, moneylineLines] = await Promise.all([
      prisma.marketLine.findMany({
        where: {
          season: season,
          week: week,
          lineType: 'spread'
        },
        orderBy: { timestamp: 'desc' }
      }),
      prisma.marketLine.findMany({
        where: {
          season: season,
          week: week,
          lineType: 'total'
        },
        orderBy: { timestamp: 'desc' }
      }),
      prisma.marketLine.findMany({
        where: {
          season: season,
          week: week,
          lineType: 'moneyline'
        },
        orderBy: { timestamp: 'desc' }
      })
    ]);

    // Track which games have odds (for reference, but we'll show all games)
    const gamesWithOdds = new Set([
      ...spreadLines.map(l => l.gameId),
      ...totalLines.map(l => l.gameId),
      ...moneylineLines.map(l => l.gameId)
    ]);

    console.log(`   Found ${spreadLines.length} spread lines, ${totalLines.length} total lines, ${moneylineLines.length} moneyline lines`);
    console.log(`   ${gamesWithOdds.size} unique games have odds out of ${filteredGames.length} total games`);

    // Show ALL games, not just those with odds
    // This helps identify which games need odds ingestion
    let finalGamesToInclude = filteredGames;
    
    // Apply date limiting if requested
    if (limitDates > 0) {
      // Helper function to get date key for timezone conversion
      const getDateKey = (dateString: string): string => {
        try {
          const d = new Date(dateString);
          const localDateStr = d.toLocaleDateString('en-US', { 
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          const [month, day, year] = localDateStr.split('/');
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } catch {
          return 'unknown';
        }
      };
      
      const uniqueDates = Array.from(new Set(finalGamesToInclude.map(g => getDateKey(g.date.toISOString()))));
      const limitedDates = uniqueDates.slice(0, limitDates);
      finalGamesToInclude = finalGamesToInclude.filter(g => {
        const dateKey = getDateKey(g.date.toISOString());
        return limitedDates.includes(dateKey);
      });
      console.log(`   After date limiting: ${finalGamesToInclude.length} games`);
    }

    // Create lookup maps for closing lines
    const spreadMap = new Map<string, any>();
    const totalMap = new Map<string, any>();
    const moneylineMap = new Map<string, any[]>();
    
    spreadLines.forEach(line => {
      if (!spreadMap.has(line.gameId)) {
        spreadMap.set(line.gameId, line);
      }
    });
    
    totalLines.forEach(line => {
      if (!totalMap.has(line.gameId)) {
        totalMap.set(line.gameId, line);
      }
    });
    
    moneylineLines.forEach(line => {
      if (!moneylineMap.has(line.gameId)) {
        moneylineMap.set(line.gameId, []);
      }
      moneylineMap.get(line.gameId)!.push(line);
    });

    // Process each game
    const slateGames: SlateGame[] = [];
    
    for (const game of finalGamesToInclude) {
      // Determine status
      let status: 'final' | 'scheduled' | 'in_progress' = 'scheduled';
      if (game.status === 'final') {
        status = 'final';
      } else if (game.status === 'in_progress') {
        status = 'in_progress';
      }

      // Get closing lines from batch data (may be null if game doesn't have odds yet)
      const spreadLine = spreadMap.get(game.id);
      const totalLine = totalMap.get(game.id);
      
      const closingSpread = spreadLine ? {
        value: Number(spreadLine.lineValue),
        book: spreadLine.bookName,
        timestamp: spreadLine.timestamp.toISOString()
      } : null;
      
      const closingTotal = totalLine ? {
        value: Number(totalLine.lineValue),
        book: totalLine.bookName,
        timestamp: totalLine.timestamp.toISOString()
      } : null;
      
      // Track if this game has odds (for UI indication)
      const hasOdds = gamesWithOdds.has(game.id);

      // Format kickoff time - just use the ISO string, frontend will format with correct timezone
      // The date from Prisma is already in UTC, we'll let the frontend convert it properly
      const kickoffLocal = game.date.toISOString();

      const slateGame: SlateGame = {
        gameId: game.id,
        date: game.date.toISOString(),
        kickoffLocal,
        status,
        awayTeamId: game.awayTeam.id,
        awayTeamName: game.awayTeam.name,
        homeTeamId: game.homeTeam.id,
        homeTeamName: game.homeTeam.name,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        closingSpread,
        closingTotal,
        hasOdds, // Indicate if this game has odds data
        // Initialize model fields to null (will be populated by Core V1 computation)
        modelSpread: null,
        modelTotal: null,
        pickSpread: null,
        pickTotal: null,
        maxEdge: null,
        confidence: null,
      };

      slateGames.push(slateGame);
    }

    console.log(`   Processed ${slateGames.length} games with closing lines`);

    // Fetch all Hybrid V2 bets for this week to look up conflict types and tiers
    const hybridBets = await prisma.bet.findMany({
      where: {
        season,
        week,
        strategyTag: 'hybrid_v2',
        marketType: 'spread',
      },
      select: {
        gameId: true,
        hybridConflictType: true,
        modelPrice: true,
        closePrice: true,
        clv: true,
      },
    });

    // Create lookup map by gameId
    const hybridBetMap = new Map<string, typeof hybridBets[0]>();
    for (const bet of hybridBets) {
      hybridBetMap.set(bet.gameId, bet);
    }

    console.log(`   Found ${hybridBets.length} Hybrid V2 spread bets for conflict/tier lookup`);

    // Fetch continuity scores for all teams in the slate
    const allTeamIds = Array.from(new Set([
      ...slateGames.map(g => g.homeTeamId),
      ...slateGames.map(g => g.awayTeamId),
    ]));

    const teamSeasons = await prisma.teamSeasonStat.findMany({
      where: {
        season,
        teamId: { in: allTeamIds },
      },
      select: {
        teamId: true,
        rawJson: true,
      },
    });

    const continuityMap = new Map<string, number>();
    for (const ts of teamSeasons) {
      const rawJson = (ts.rawJson as any) || {};
      const portalMeta = rawJson.portal_meta;
      if (portalMeta && typeof portalMeta.continuityScore === 'number') {
        continuityMap.set(ts.teamId, portalMeta.continuityScore);
      }
    }

    console.log(`   Found ${continuityMap.size} teams with continuity scores`);

    // Fetch model projections using Core V1
    // ALWAYS compute Core V1 - no query parameter gates
    console.log(`   Computing Core V1 projections for ${slateGames.length} games...`);
    
    let gamesWithModelData = 0;
    let gamesWithErrors = 0;
    
    // Compute Core V1 projections for each game
    for (const game of slateGames) {
      // Initialize debug block if debug mode is enabled
      if (debug) {
        game.coreV1Debug = {
          attempted: true,
          success: false,
          modelSpreadHma: null,
          edgeHma: null,
          errorMessage: null,
        };
      }
      
      try {
        // Get full game info for team names and neutral site
        const fullGame = finalGamesToInclude.find(g => g.id === game.gameId);
        if (!fullGame) {
          const errorMsg = `Game ${game.gameId} not found in finalGamesToInclude`;
          console.warn(`[Slate API] ${errorMsg}, skipping Core V1 computation`);
          if (debug) {
            game.coreV1Debug!.errorMessage = errorMsg;
          }
          continue;
        }

        // Get Core V1 spread
        const coreSpreadInfo = await getCoreV1SpreadFromTeams(
          season,
          game.homeTeamId,
          game.awayTeamId,
          fullGame.neutralSite || false,
          fullGame.homeTeam.name,
          fullGame.awayTeam.name
        );

        const modelSpreadHma = coreSpreadInfo.coreSpreadHma;
        
        // Validate Core V1 result
        if (!Number.isFinite(modelSpreadHma)) {
          const errorMsg = `Core V1 returned non-finite spread: ${modelSpreadHma}`;
          console.error(`[Slate API] ${errorMsg} for game ${game.gameId}`);
          if (debug) {
            game.coreV1Debug!.errorMessage = errorMsg;
          }
          continue;
        }
        
        const modelSpread = Math.round(modelSpreadHma * 10) / 10;

        // Get market spread and convert to HMA frame
        // CRITICAL FIX: closingSpread.value is in favorite-centric format (negative for favorite)
        // We need to convert it to HMA format (positive = home favored, negative = away favored)
        const marketSpreadRaw = game.closingSpread?.value ?? null;
        let marketSpreadHma: number | null = null;
        
        if (marketSpreadRaw !== null && Number.isFinite(marketSpreadRaw)) {
          // Find the spread line to check which team it's for
          const spreadLine = spreadMap.get(game.gameId);
          if (spreadLine && spreadLine.teamId) {
            // Spread is team-specific - convert from favorite-centric to HMA format
            const isHomeTeam = spreadLine.teamId === game.homeTeamId;
            // lineValue is in favorite-centric format (negative = favorite)
            // If home team is the favorite: lineValue is negative, HMA should be positive (home favored)
            // If away team is the favorite: lineValue is negative, HMA should be negative (away favored)
            // So: if home team, flip sign; if away team, keep negative (or flip if positive)
            // Actually: if home team and lineValue is negative, HMA = -lineValue (positive)
            //          if away team and lineValue is negative, HMA = lineValue (negative, but we want to keep it negative)
            // Wait, let me think: if lineValue is -31.5 and it's for home team, that means home is favored by 31.5
            // In HMA format: +31.5 (home wins by 31.5)
            // So: HMA = -lineValue when home team
            // If lineValue is -31.5 and it's for away team, that means away is favored by 31.5
            // In HMA format: -31.5 (away wins by 31.5, so home loses by 31.5)
            // So: HMA = lineValue when away team (already negative)
            marketSpreadHma = isHomeTeam ? -marketSpreadRaw : marketSpreadRaw;
          } else {
            // No teamId - use heuristic: assume negative means favorite-centric
            // If model says home is favorite (positive HMA) and market is negative, likely home is market favorite
            // So convert: HMA = -marketSpreadRaw
            const isModelHomeFavorite = modelSpreadHma > 0;
            marketSpreadHma = isModelHomeFavorite ? -marketSpreadRaw : marketSpreadRaw;
            console.warn(`[Slate API] Game ${game.gameId}: No teamId for spread line, using heuristic conversion`);
          }
        }

        // Compute ATS edge and pick
        let spreadPick: string | null = null;
        let spreadEdgePts: number | null = null;
        let maxEdge: number | null = null;
        let edgeHma: number | null = null;

        if (marketSpreadHma !== null && Number.isFinite(marketSpreadHma)) {
          // Compute raw edge in HMA frame (model - market)
          edgeHma = modelSpreadHma - marketSpreadHma;
          
          const atsPick = getATSPick(
            modelSpreadHma,
            marketSpreadHma,
            fullGame.homeTeam.name,
            fullGame.awayTeam.name,
            game.homeTeamId,
            game.awayTeamId,
            0.1 // edgeFloor (raw model, minimal threshold)
          );
          
          spreadPick = atsPick.pickLabel;
          spreadEdgePts = atsPick.edgePts;
          maxEdge = spreadEdgePts;
          
          console.log(`[Slate API] Game ${game.gameId} Edge Calculation:`, {
            modelSpreadHma: modelSpreadHma.toFixed(2),
            marketSpreadRaw: marketSpreadRaw?.toFixed(2),
            marketSpreadHma: marketSpreadHma.toFixed(2),
            edgeHma: edgeHma.toFixed(2),
            spreadEdgePts: spreadEdgePts?.toFixed(2),
            pickLabel: spreadPick
          });
        }

        // Totals: Compute using Core V1 totals model
        const marketTotal = game.closingTotal?.value ?? null;
        const ouPick = getOUPick(marketTotal, marketSpreadHma, modelSpreadHma);
        const modelTotal = ouPick.modelTotal !== null ? Math.round(ouPick.modelTotal * 10) / 10 : null;
        const totalPick = ouPick.pickLabel;
        const totalEdgePts = ouPick.ouEdgePts !== null ? Math.round(ouPick.ouEdgePts * 10) / 10 : null;
        
        // Calculate Totals grade
        let totalGrade: string | null = null;
        if (totalEdgePts !== null && Number.isFinite(totalEdgePts) && totalEdgePts >= 0.1) {
          if (totalEdgePts >= 4.0) totalGrade = 'A';
          else if (totalEdgePts >= 3.0) totalGrade = 'B';
          else if (totalEdgePts >= 0.1) totalGrade = 'C';
        }

        // Moneyline: Calculate win probabilities and value
        let moneylinePick: string | null = null;
        let moneylineValue: number | null = null;
        let moneylineGrade: string | null = null;
        
        // Get moneyline prices from market
        const gameMoneylineLines = moneylineMap.get(game.gameId) || [];
        const homeMLPrice = gameMoneylineLines.find((ml: any) => ml.teamId === game.homeTeamId)?.lineValue ?? null;
        const awayMLPrice = gameMoneylineLines.find((ml: any) => ml.teamId === game.awayTeamId)?.lineValue ?? null;
        
        if (modelSpreadHma !== null && Number.isFinite(modelSpreadHma) && Math.abs(modelSpreadHma) <= 24.0) {
          // Calculate win probabilities from spread using sigmoid
          const spreadForHome = -modelSpreadHma; // Flip sign: positive HMA = home favored
          const homeProbRaw = 1 / (1 + Math.pow(10, spreadForHome / 14.5));
          const modelHomeWinProb = Math.max(0.01, Math.min(0.99, homeProbRaw));
          const modelAwayWinProb = 1 - modelHomeWinProb;
          
          // Calculate value for both sides
          const impliedHome = homeMLPrice !== null ? americanToProb(homeMLPrice)! : null;
          const impliedAway = awayMLPrice !== null ? americanToProb(awayMLPrice)! : null;
          
          const homeValue = impliedHome !== null ? (modelHomeWinProb - impliedHome) : null;
          const awayValue = impliedAway !== null ? (modelAwayWinProb - impliedAway) : null;
          const homeValuePercent = homeValue !== null ? homeValue * 100 : null;
          const awayValuePercent = awayValue !== null ? awayValue * 100 : null;
          
          // Select the side with highest positive value (minimum 1% threshold)
          const HARD_MIN_ML_VALUE = 0.01; // 1% minimum value threshold
          let selectedSide: 'home' | 'away' | null = null;
          let selectedValuePercent: number | null = null;
          let selectedTeamName: string | null = null;
          let selectedPrice: number | null = null;
          
          if (homeValuePercent !== null && homeValuePercent > HARD_MIN_ML_VALUE * 100) {
            if (awayValuePercent === null || homeValuePercent >= awayValuePercent) {
              selectedSide = 'home';
              selectedValuePercent = homeValuePercent;
              selectedTeamName = fullGame.homeTeam.name;
              selectedPrice = homeMLPrice;
            }
          }
          
          if (awayValuePercent !== null && awayValuePercent > HARD_MIN_ML_VALUE * 100) {
            if (selectedSide === null || awayValuePercent > selectedValuePercent!) {
              selectedSide = 'away';
              selectedValuePercent = awayValuePercent;
              selectedTeamName = fullGame.awayTeam.name;
              selectedPrice = awayMLPrice;
            }
          }
          
          if (selectedSide !== null && selectedValuePercent !== null) {
            // Format moneyline pick
            const priceStr = selectedPrice! < 0 ? selectedPrice!.toString() : `+${selectedPrice!}`;
            moneylinePick = `${selectedTeamName} ${priceStr}`;
            moneylineValue = selectedValuePercent;
            
            // Calculate Moneyline grade
            if (selectedValuePercent >= 10.0) moneylineGrade = 'A';
            else if (selectedValuePercent >= 5.0) moneylineGrade = 'B';
            else if (selectedValuePercent >= 1.0) moneylineGrade = 'C';
          }
        }
        
        // Calculate Spread grade
        let spreadGrade: string | null = null;
        if (spreadEdgePts !== null && Number.isFinite(spreadEdgePts) && spreadEdgePts >= 0.1) {
          if (spreadEdgePts >= 4.0) spreadGrade = 'A';
          else if (spreadEdgePts >= 3.0) spreadGrade = 'B';
          else if (spreadEdgePts >= 0.1) spreadGrade = 'C';
        }

        // Game confidence: Highest grade among all active picks
        let gameConfidence: string | null = null;
        const grades = [spreadGrade, totalGrade, moneylineGrade].filter(g => g !== null) as string[];
        if (grades.length > 0) {
          // A > B > C
          if (grades.includes('A')) gameConfidence = 'A';
          else if (grades.includes('B')) gameConfidence = 'B';
          else if (grades.includes('C')) gameConfidence = 'C';
        }
        
        // Max edge: Highest edge among all markets
        const allEdges = [
          spreadEdgePts,
          totalEdgePts,
          moneylineValue
        ].filter(e => e !== null && Number.isFinite(e)) as number[];
        const gameMaxEdge = allEdges.length > 0 ? Math.max(...allEdges) : null;

        // Assign to game - CRITICAL: Always assign, even if some fields are null
        game.modelSpread = modelSpread;
        game.modelTotal = modelTotal;
        game.pickSpread = spreadPick;
        game.pickTotal = totalPick;
        game.pickMoneyline = moneylinePick;
        game.maxEdge = gameMaxEdge !== null && Number.isFinite(gameMaxEdge) ? Math.round(gameMaxEdge * 10) / 10 : null;
        game.confidence = gameConfidence;
        
        // Look up Hybrid V2 bet for conflict type and tier info
        let hybridConflictType: string | null = null;
        let betEdge: number | null = null;
        let betClv: number | null = null;
        let tierBucket: string = 'none';
        let isSuperTierA: boolean = false;
        let betTeamContinuity: number | null = null;
        let oppContinuity: number | null = null;
        let continuityDiff: number | null = null;

        if (spreadPick && spreadEdgePts !== null && edgeHma !== null) {
          // Determine bet team and opponent for continuity lookup
          // If edgeHma > 0, model thinks home should be more favored than market → bet home
          // If edgeHma < 0, model thinks away should be more favored than market → bet away
          const betTeamId = edgeHma > 0 ? game.homeTeamId : game.awayTeamId;
          const oppTeamId = edgeHma > 0 ? game.awayTeamId : game.homeTeamId;
          
          betTeamContinuity = continuityMap.get(betTeamId) ?? null;
          oppContinuity = continuityMap.get(oppTeamId) ?? null;
          
          if (betTeamContinuity !== null && oppContinuity !== null) {
            continuityDiff = betTeamContinuity - oppContinuity;
          }
          // Look up from pre-fetched map
          const hybridBet = hybridBetMap.get(game.gameId);

          if (hybridBet) {
            hybridConflictType = hybridBet.hybridConflictType;
            betClv = hybridBet.clv ? Number(hybridBet.clv) : null;
            
            // Calculate edge from bet if available, otherwise use computed edge
            if (hybridBet.modelPrice && hybridBet.closePrice) {
              const modelPriceNum = Number(hybridBet.modelPrice);
              const closePriceNum = Number(hybridBet.closePrice);
              betEdge = Math.abs(modelPriceNum - closePriceNum);
            } else {
              betEdge = Math.abs(spreadEdgePts);
            }

            // Determine tier bucket
            const absEdge = betEdge;
            if (hybridConflictType === 'hybrid_strong') {
              if (absEdge >= 4.0) {
                tierBucket = 'super_tier_a';
                isSuperTierA = true;
              } else if (absEdge >= 3.0) {
                tierBucket = 'tier_a';
              } else if (absEdge >= 2.0) {
                tierBucket = 'tier_b';
              }
            }
          } else {
            // No bet found, use computed edge for tier (but no conflict type)
            betEdge = Math.abs(spreadEdgePts);
            const absEdge = betEdge;
            if (absEdge >= 4.0) {
              tierBucket = 'tier_a'; // Can't be super tier without conflict type
            } else if (absEdge >= 3.0) {
              tierBucket = 'tier_a';
            } else if (absEdge >= 2.0) {
              tierBucket = 'tier_b';
            }
          }
        }

        // Add picks object with individual market data
        game.picks = {
          spread: {
            label: spreadPick,
            edge: spreadEdgePts,
            grade: spreadGrade,
            hybridConflictType,
            tierBucket,
            isSuperTierA,
            clv: betClv,
            betTeamContinuity,
            oppContinuity,
            continuityDiff,
          },
          total: {
            label: totalPick,
            edge: totalEdgePts,
            grade: totalGrade
          },
          moneyline: {
            label: moneylinePick,
            value: moneylineValue,
            grade: moneylineGrade
          }
        };
        
        // Populate debug block on success
        if (debug) {
          game.coreV1Debug!.success = true;
          game.coreV1Debug!.modelSpreadHma = modelSpreadHma;
          game.coreV1Debug!.edgeHma = edgeHma;
          game.coreV1Debug!.errorMessage = null;
        }
        
        if (game.modelSpread !== null) {
          gamesWithModelData++;
        }
      } catch (error) {
        gamesWithErrors++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Slate API] Error computing Core V1 spread for game ${game.gameId}:`, error);
        if (error instanceof Error) {
          console.error(`[Slate API] Error details: ${error.message}`, error.stack);
        }
        
        // Populate debug block on error
        if (debug) {
          game.coreV1Debug!.success = false;
          game.coreV1Debug!.errorMessage = errorMsg;
        }
        // Fields are already initialized to null, so we don't need to set them again
        // But log the error for debugging
      }
    }
    
    console.log(`   ✅ Computed Core V1 projections for ${gamesWithModelData} of ${slateGames.length} games`);
    if (gamesWithErrors > 0) {
      console.warn(`   ⚠️  ${gamesWithErrors} games had errors during Core V1 computation`);
    }

    // Determine cache headers based on game status
    const hasFinalGames = slateGames.some(g => g.status === 'final');
    const cacheHeaders = hasFinalGames 
      ? { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } // 10min cache for final games
      : { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }; // 1min cache for live games

    return NextResponse.json(slateGames, { headers: cacheHeaders });

  } catch (error) {
    console.error('Slate API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
