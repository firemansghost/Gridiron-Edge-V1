/**
 * Weeks Slate API Route
 * Returns games for a specific week with closing lines and scores
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCoreV1SpreadFromTeams, getATSPick, computeATSEdgeHma } from '@/lib/core-v1-spread';
import {
  indexGameMarketSelections,
  type MarketLineObservation,
} from '@/lib/market-line-snapshot';
import { getOUPick } from '@/lib/core-v1-total';
import { americanToProb } from '@/lib/market-line-helpers';
import {
  buildHybridActivationOverrideMeta,
  buildSlateResponseMeta,
  resolveSlateModelParam,
  shouldLoadCoreHybridComparisonMetadata,
} from '@/lib/config/slate-model';
import {
  deriveHybridConflictType,
  deriveHybridSpreadSide,
  deriveHybridTierFields,
  tryComputeHybridSpreadHma,
  type HybridConflictType,
  type HybridSpreadInputs,
  type TeamUnitGradesRow,
} from '@/lib/slate-hybrid-spread';
import { resolveBetSideClosePrice } from '@/lib/game-detail-market';

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
  /** Primary display market: current (scheduled) or closing (final). value = HMA for spreads. */
  closingSpread: {
    value: number;
    book: string;
    timestamp: string;
    homeLine?: number;
    awayLine?: number;
    marketSpreadHma?: number;
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
      isDog?: boolean | null;
      isLowContinuityDog?: boolean;
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
  // Validation flags
  favoritesDisagree?: boolean;
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
    const requestedModel = url.searchParams.get('model');
    const {
      activeModel,
      preferredModel,
      invalidRequest: invalidModelFallback,
      activationHold,
    } = resolveSlateModelParam(requestedModel, season, week);

    if (!season || !week) {
      return NextResponse.json(
        { error: 'Invalid season or week parameter' },
        { status: 400 }
      );
    }

    console.log(
      `📅 Fetching slate for ${season} Week ${week} (model=${activeModel}${activationHold ? `; preferred=${preferredModel}; activationHold` : ''})${limitDates > 0 ? ` (limitDates: ${limitDates})` : ''}${afterDate ? ` (afterDate: ${afterDate})` : ''}`
    );

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

    // Append-only snapshot selection: latest coherent per book (current or closing)
    const allMarketRows: MarketLineObservation[] = [
      ...spreadLines,
      ...totalLines,
      ...moneylineLines,
    ].map((line) => ({
      id: line.id,
      gameId: line.gameId,
      lineType: line.lineType,
      lineValue: Number(line.lineValue),
      closingLine:
        line.closingLine !== null && line.closingLine !== undefined
          ? Number(line.closingLine)
          : null,
      bookName: line.bookName,
      timestamp: line.timestamp,
      teamId: (line as { teamId?: string | null }).teamId ?? null,
      source: line.source ?? null,
    }));

    const marketByGame = indexGameMarketSelections({
      rows: allMarketRows,
      games: finalGamesToInclude.map((g) => ({
        gameId: g.id,
        homeTeamId: g.homeTeam.id,
        awayTeamId: g.awayTeam.id,
        kickoff: g.date,
        status: g.status,
      })),
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

      const marketSel = marketByGame.get(game.id);
      const displaySpread = marketSel?.displaySpread ?? null;
      const displayTotal = marketSel?.displayTotal ?? null;

      // value = canonical HMA (positive = home favored). Provenance via home/away lines.
      const closingSpread = displaySpread
        ? {
            value: displaySpread.marketSpreadHma,
            book: displaySpread.bookName,
            timestamp: displaySpread.timestamp,
            homeLine: displaySpread.homeLine,
            awayLine: displaySpread.awayLine,
            marketSpreadHma: displaySpread.marketSpreadHma,
          }
        : null;

      const closingTotal = displayTotal
        ? {
            value: displayTotal.total,
            book: displayTotal.bookName,
            timestamp: displayTotal.timestamp,
          }
        : null;
      
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

    // Explicit Core V1 only: persisted Hybrid V2 bets for comparison metadata.
    // Authorization-held Hybrid requests must NOT load/attach Hybrid comparison fields.
    const allowCoreHybridComparisonMetadata =
      shouldLoadCoreHybridComparisonMetadata(activeModel, activationHold);
    const hybridBets = allowCoreHybridComparisonMetadata
      ? await prisma.bet.findMany({
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
        })
      : [];

    const hybridBetMap = new Map<string, (typeof hybridBets)[0]>();
    for (const bet of hybridBets) {
      hybridBetMap.set(bet.gameId, bet);
    }

    if (allowCoreHybridComparisonMetadata) {
      console.log(`   Found ${hybridBets.length} Hybrid V2 spread bets for conflict/tier lookup`);
    }

    // Hybrid V2 path: runtime spread inputs + V4 bets for conflict labeling
    const hybridInputsByGame = new Map<string, HybridSpreadInputs>();
    const v4BetSideByGame = new Map<string, 'home' | 'away'>();
    let hybridFallbackGames = 0;

    if (activeModel === 'hybrid_v2') {
      const allTeamIds = Array.from(
        new Set(slateGames.flatMap((g) => [g.homeTeamId, g.awayTeamId]))
      );

      const [teamRatings, teamGrades, v4Bets] = await Promise.all([
        prisma.teamSeasonRating.findMany({
          where: {
            season,
            teamId: { in: allTeamIds },
            modelVersion: 'v1',
          },
          select: {
            teamId: true,
            powerRating: true,
            rating: true,
          },
        }),
        prisma.teamUnitGrades.findMany({
          where: {
            season,
            teamId: { in: allTeamIds },
          },
        }),
        prisma.bet.findMany({
          where: {
            season,
            week,
            strategyTag: 'v4_labs',
            marketType: 'spread',
          },
          select: {
            gameId: true,
            side: true,
          },
        }),
      ]);

      const ratingsMap = new Map<string, number>();
      for (const row of teamRatings) {
        const value =
          row.powerRating !== null
            ? Number(row.powerRating)
            : row.rating !== null
              ? Number(row.rating)
              : null;
        if (value !== null && Number.isFinite(value)) {
          ratingsMap.set(row.teamId, value);
        }
      }

      const gradesMap = new Map<string, TeamUnitGradesRow>();
      for (const row of teamGrades) {
        gradesMap.set(row.teamId, {
          offRunGrade: row.offRunGrade,
          defRunGrade: row.defRunGrade,
          offPassGrade: row.offPassGrade,
          defPassGrade: row.defPassGrade,
          offExplosiveness: row.offExplosiveness,
          defExplosiveness: row.defExplosiveness,
        });
      }

      for (const game of slateGames) {
        const homeRating = ratingsMap.get(game.homeTeamId);
        const awayRating = ratingsMap.get(game.awayTeamId);
        const homeGrades = gradesMap.get(game.homeTeamId);
        const awayGrades = gradesMap.get(game.awayTeamId);

        if (
          homeRating !== undefined &&
          awayRating !== undefined &&
          homeGrades &&
          awayGrades
        ) {
          hybridInputsByGame.set(game.gameId, {
            homeRating,
            awayRating,
            homeGrades,
            awayGrades,
          });
        }
      }

      for (const bet of v4Bets) {
        if (bet.side === 'home' || bet.side === 'away') {
          v4BetSideByGame.set(bet.gameId, bet.side);
        }
      }

      console.log(
        `   Hybrid V2 runtime inputs ready for ${hybridInputsByGame.size}/${slateGames.length} games; V4 conflict refs: ${v4Bets.length}`
      );
    }

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

    // Compute projections: Core V1 always for totals/ML; spread model selected by `model` param
    console.log(
      `   Computing slate projections for ${slateGames.length} games (spread=${activeModel}, totals/ML=current)...`
    );
    
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

        const coreSpreadHma = coreSpreadInfo.coreSpreadHma;

        // Validate Core V1 result (required for totals/ML and Core V1 spread path)
        if (!Number.isFinite(coreSpreadHma)) {
          const errorMsg = `Core V1 returned non-finite spread: ${coreSpreadHma}`;
          console.error(`[Slate API] ${errorMsg} for game ${game.gameId}`);
          if (debug) {
            game.coreV1Debug!.errorMessage = errorMsg;
          }
          continue;
        }

        let spreadModelHma = coreSpreadHma;
        if (activeModel === 'hybrid_v2') {
          const hybridInputs = hybridInputsByGame.get(game.gameId) ?? null;
          const hybridSpreadHma = tryComputeHybridSpreadHma(
            hybridInputs,
            fullGame.neutralSite || false,
            game.homeTeamId,
            game.awayTeamId
          );

          if (hybridSpreadHma !== null && Number.isFinite(hybridSpreadHma)) {
            spreadModelHma = hybridSpreadHma;
          } else {
            spreadModelHma = coreSpreadHma;
            hybridFallbackGames++;
          }
        }

        const modelSpread = Math.round(spreadModelHma * 10) / 10;

        // Get market spread — already canonical HMA from append-only snapshot selection
        const marketSpreadRaw = game.closingSpread?.value ?? null;
        const marketSpreadHma =
          game.closingSpread?.marketSpreadHma ??
          (marketSpreadRaw !== null && Number.isFinite(marketSpreadRaw)
            ? marketSpreadRaw
            : null);

        // Compute favoritesDisagree: Check if model and market favor different teams
        // Model favorite: positive HMA = home favorite, negative = away favorite
        // Market favorite: positive HMA = home favorite, negative = away favorite
        let favoritesDisagree = false;
        if (spreadModelHma !== null && Number.isFinite(spreadModelHma) && 
            marketSpreadHma !== null && Number.isFinite(marketSpreadHma)) {
          const modelFavoriteIsHome = spreadModelHma > 0;
          const marketFavoriteIsHome = marketSpreadHma > 0;
          favoritesDisagree = modelFavoriteIsHome !== marketFavoriteIsHome;
        }

        // Compute ATS edge and pick
        let spreadPick: string | null = null;
        let spreadEdgePts: number | null = null;
        let maxEdge: number | null = null;
        let edgeHma: number | null = null;

        if (marketSpreadHma !== null && Number.isFinite(marketSpreadHma)) {
          // Compute raw edge in HMA frame (model - market)
          edgeHma = spreadModelHma - marketSpreadHma;
          
          const atsPick = getATSPick(
            spreadModelHma,
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
            modelSpreadHma: spreadModelHma.toFixed(2),
            marketSpreadRaw: marketSpreadRaw?.toFixed(2),
            marketSpreadHma: marketSpreadHma.toFixed(2),
            edgeHma: edgeHma.toFixed(2),
            spreadEdgePts: spreadEdgePts?.toFixed(2),
            pickLabel: spreadPick
          });
        }

        // Totals: Compute using Core V1 totals model
        const marketTotal = game.closingTotal?.value ?? null;
        const ouPick = getOUPick(marketTotal, marketSpreadHma, coreSpreadHma);
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
        
        // Get moneyline prices from coherent latest (or closing) book snapshot
        const mlSnap = marketByGame.get(game.gameId)?.displayMoneyline ?? null;
        const homeMLPrice = mlSnap?.homePrice ?? null;
        const awayMLPrice = mlSnap?.awayPrice ?? null;
        
        if (coreSpreadHma !== null && Number.isFinite(coreSpreadHma) && Math.abs(coreSpreadHma) <= 24.0) {
          // Calculate win probabilities from spread using sigmoid (Core V1 / current logic)
          const spreadForHome = -coreSpreadHma; // Flip sign: positive HMA = home favored
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
        
        // Spread conflict/tier fields (Hybrid runtime for hybrid_v2; persisted bets for core_v1)
        let hybridConflictType: string | null = null;
        let betClv: number | null = null;
        let tierBucket: string = 'none';
        let isSuperTierA: boolean = false;
        let betTeamContinuity: number | null = null;
        let oppContinuity: number | null = null;
        let continuityDiff: number | null = null;
        let isDog: boolean | null = null;
        let isLowContinuityDog: boolean = false;

        if (spreadPick && spreadEdgePts !== null && edgeHma !== null) {
          const betTeamId = edgeHma > 0 ? game.homeTeamId : game.awayTeamId;
          const oppTeamId = edgeHma > 0 ? game.awayTeamId : game.homeTeamId;

          betTeamContinuity = continuityMap.get(betTeamId) ?? null;
          oppContinuity = continuityMap.get(oppTeamId) ?? null;

          if (betTeamContinuity !== null && oppContinuity !== null) {
            continuityDiff = betTeamContinuity - oppContinuity;
          }

          if (activeModel === 'hybrid_v2') {
            const hybridSide = deriveHybridSpreadSide(edgeHma);
            hybridConflictType = deriveHybridConflictType(
              hybridSide,
              v4BetSideByGame.get(game.gameId)
            );

            const closePrice = resolveBetSideClosePrice({
              betTeamId,
              homeTeamId: game.homeTeamId,
              awayTeamId: game.awayTeamId,
              homeLine: game.closingSpread?.homeLine ?? null,
              awayLine: game.closingSpread?.awayLine ?? null,
              fallbackHma: game.closingSpread?.marketSpreadHma ?? game.closingSpread?.value ?? null,
            });

            const tierFields = deriveHybridTierFields(
              spreadEdgePts,
              hybridConflictType as HybridConflictType | null,
              closePrice
            );
            tierBucket = tierFields.tierBucket;
            isSuperTierA = tierFields.isSuperTierA;
            isDog = tierFields.isDog;
          } else if (!activationHold) {
            // Explicit Core V1: optional persisted Hybrid comparison metadata
            const hybridBet = hybridBetMap.get(game.gameId);

            if (hybridBet) {
              hybridConflictType = hybridBet.hybridConflictType;
              betClv = hybridBet.clv ? Number(hybridBet.clv) : null;

              if (hybridBet.closePrice !== null) {
                const closePriceNum = Number(hybridBet.closePrice);
                isDog = closePriceNum >= 0;
              }

              const betEdge =
                hybridBet.modelPrice && hybridBet.closePrice
                  ? Math.abs(Number(hybridBet.modelPrice) - Number(hybridBet.closePrice))
                  : Math.abs(spreadEdgePts);

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
              const absEdge = Math.abs(spreadEdgePts);
              if (absEdge >= 4.0) {
                tierBucket = 'tier_a';
              } else if (absEdge >= 3.0) {
                tierBucket = 'tier_a';
              } else if (absEdge >= 2.0) {
                tierBucket = 'tier_b';
              }
            }
          }
          // activationHold: leave Hybrid conflict/tier/clv fields neutral (null/'none'/false)

          if (betTeamContinuity !== null && isDog === true && betTeamContinuity < 0.60) {
            isLowContinuityDog = true;
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
            isDog,
            isLowContinuityDog,
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
        
        // Add favoritesDisagree flag
        game.favoritesDisagree = favoritesDisagree;
        
        // Populate debug block on success
        if (debug) {
          game.coreV1Debug!.success = true;
          game.coreV1Debug!.modelSpreadHma = spreadModelHma;
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
    
    console.log(`   ✅ Computed slate projections for ${gamesWithModelData} of ${slateGames.length} games`);
    if (gamesWithErrors > 0) {
      console.warn(`   ⚠️  ${gamesWithErrors} games had errors during slate computation`);
    }

    const slateMeta = buildSlateResponseMeta({
      activeModel,
      requestedModel,
      invalidModelFallback,
      activationOverride: activationHold
        ? buildHybridActivationOverrideMeta()
        : undefined,
      fallback:
        activeModel === 'hybrid_v2' && hybridFallbackGames > 0
          ? {
              used: true,
              from: 'hybrid_v2',
              to: 'core_v1',
              reason:
                'Hybrid V2 spread inputs unavailable for one or more games; Core V1 spread used with explicit fallback metadata',
              gamesAffected: hybridFallbackGames,
            }
          : undefined,
    });

    // Determine cache headers based on game status
    const hasFinalGames = slateGames.some(g => g.status === 'final');
    const cacheHeaders = hasFinalGames 
      ? { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } // 10min cache for final games
      : { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }; // 1min cache for live games

    return NextResponse.json(
      {
        games: slateGames,
        meta: slateMeta,
      },
      { headers: cacheHeaders }
    );

  } catch (error) {
    console.error('Slate API error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
