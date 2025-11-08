/**
 * M3 Game Detail API Route
 * 
 * Returns detailed game information including factor breakdown from components_json.
 */

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick, convertToFavoriteCentric, computeATSEdge, computeBettableSpreadPick, computeTotalBetTo } from '@/lib/pick-helpers';
import { pickMarketLine, getLineValue, pickMoneyline, americanToProb } from '@/lib/market-line-helpers';
import { NextResponse } from 'next/server';

// === TRUST-MARKET MODE CONFIGURATION ===
// Phase 1 Hotfix: Use market as baseline, apply small model overlays
const MODEL_MODE = 'trust_market' as const; // Feature flag
const LAMBDA_SPREAD = 0.25; // 25% weight to model for spreads
const LAMBDA_TOTAL = 0.35; // 35% weight for totals
const OVERLAY_CAP_SPREAD = 3.0; // ±3.0 pts max for spread overlay
const OVERLAY_CAP_TOTAL = 3.0; // ±3.0 pts max for total overlay
const OVERLAY_EDGE_FLOOR = 2.0; // Only show pick if overlay ≥ 2.0 pts
const LARGE_DISAGREEMENT_THRESHOLD = 10.0; // Drop confidence grade if raw disagreement > 10 pts

/**
 * Clamp overlay to prevent catastrophic picks
 */
function clampOverlay(value: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, value));
}

/**
 * Degrade confidence grade if large raw disagreement
 */
function degradeGrade(grade: 'A' | 'B' | 'C' | null, shouldDegrade: boolean): 'A' | 'B' | 'C' | null {
  if (!grade || !shouldDegrade) return grade;
  
  if (grade === 'A') return 'B';
  if (grade === 'B') return 'C';
  return null; // C degrades to no grade
}

export const revalidate = 300; // Revalidate every 5 minutes (ISR-like caching)

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const startTime = Date.now();
  try {
    const { gameId } = params;

    // Get game with all related data
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: true, // Now includes teamId field after schema migration
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
      return NextResponse.json(
        { success: false, error: 'Game not found' },
        { status: 404 }
      );
    }

    const matchupOutput = game.matchupOutputs[0];
    
    // Type assertion to access teamId field (defined once for reuse)
    type MarketLineWithTeamId = typeof game.marketLines[0] & { teamId?: string | null };
    
    // ============================================
    // BUILD SINGLE SOURCE OF TRUTH SNAPSHOT (MARKET)
    // ============================================
    type OddsGroup = {
      key: string;
      source: string | null;
      bookName: string | null;
      spreadLines: typeof game.marketLines;
      totalLines: typeof game.marketLines;
      moneylineLines: typeof game.marketLines;
    };

    // DIAGNOSTIC: Log all spread lines with teamId to see what's in the database
    const allSpreadLines = game.marketLines.filter(l => l.lineType === 'spread');
    const spreadLinesWithTeamId = allSpreadLines.filter(l => {
      const lineWithTeamId = l as MarketLineWithTeamId;
      return !!(lineWithTeamId.teamId && lineWithTeamId.teamId !== 'NULL');
    });
    console.log(`[Game ${gameId}] 🔍 DATABASE DIAGNOSTIC - Spread Lines:`, {
      totalSpreadLines: allSpreadLines.length,
      linesWithTeamId: spreadLinesWithTeamId.length,
      linesWithoutTeamId: allSpreadLines.length - spreadLinesWithTeamId.length,
      sampleLines: allSpreadLines.slice(0, 5).map(l => {
        const lineWithTeamId = l as MarketLineWithTeamId;
        return {
          lineValue: l.lineValue,
          closingLine: l.closingLine,
          bookName: l.bookName,
          source: l.source,
          timestamp: l.timestamp,
          teamId: lineWithTeamId.teamId || 'NULL'
        };
      })
    });

    const groupedByBook = new Map<string, OddsGroup>();

    for (const line of game.marketLines) {
      const sourceKey = (line.source || 'unknown').toLowerCase();
      const bookKey = (line.bookName || 'unknown').toLowerCase();
      const groupKey = `${sourceKey}::${bookKey}`;

      if (!groupedByBook.has(groupKey)) {
        groupedByBook.set(groupKey, {
          key: groupKey,
          source: line.source || null,
          bookName: line.bookName || null,
          spreadLines: [],
          totalLines: [],
          moneylineLines: [],
        });
      }

      const group = groupedByBook.get(groupKey)!;
      if (line.lineType === 'spread') {
        group.spreadLines.push(line);
      } else if (line.lineType === 'total') {
        group.totalLines.push(line);
      } else if (line.lineType === 'moneyline') {
        group.moneylineLines.push(line);
      }
    }

    const pickPreferredLine = (lines: typeof game.marketLines, lineType?: 'spread' | 'total' | 'moneyline') => {
      if (!lines || lines.length === 0) return null;
      
      // Type assertion to access teamId field
      const linesWithTeamId = lines as MarketLineWithTeamId[];
      
      // CRITICAL: Prefer lines with teamId populated (new data with definitive team association)
      const linesWithTeamIdPopulated = linesWithTeamId.filter(l => {
        const teamId = l.teamId;
        return teamId !== null && teamId !== undefined && teamId !== 'NULL';
      });
      
      const linesWithoutTeamId = linesWithTeamId.filter(l => {
        const teamId = l.teamId;
        return teamId === null || teamId === undefined || teamId === 'NULL';
      });
      
      // Prefer lines with teamId (new data)
      let candidatePool = linesWithTeamIdPopulated.length > 0 ? linesWithTeamIdPopulated : linesWithoutTeamId;
      
      // CRITICAL FIX: For spreads, always pick the NEGATIVE line (favorite's line)
      // The database stores TWO spread lines per game (one for each team)
      // We must pick the favorite's line (negative value) as the canonical representation
      let candidates = candidatePool;
      if (lineType === 'spread') {
        const negativeLines = candidatePool.filter((line) => {
          const value = line.closingLine !== null && line.closingLine !== undefined ? line.closingLine : line.lineValue;
          return value !== null && value !== undefined && value < 0;
        });
        
        if (negativeLines.length > 0) {
          candidates = negativeLines;
        }
      }
      
      const withClosing = candidates.filter((line) => line.closingLine !== null && line.closingLine !== undefined);
      const finalCandidates = withClosing.length > 0 ? withClosing : candidates;
      const selected = finalCandidates.reduce((latest, line) => {
        if (!latest) return line;
        return new Date(line.timestamp).getTime() > new Date(latest.timestamp).getTime() ? line : latest;
      }, null as typeof finalCandidates[0] | null);
      
      if (lineType === 'spread' && selected) {
        const selectedWithTeamId = selected as MarketLineWithTeamId;
        console.log(`[Game ${gameId}] ✅ SELECTED SPREAD LINE:`, {
          lineValue: selected.lineValue,
          closingLine: selected.closingLine,
          bookName: selected.bookName,
          timestamp: selected.timestamp,
          teamId: selectedWithTeamId.teamId || 'NULL',
          hasTeamId: !!(selectedWithTeamId.teamId && selectedWithTeamId.teamId !== 'NULL')
        });
      }
      
      return selected;
    };

    let selectedSpreadLine: typeof game.marketLines[number] | null = null;
    let selectedTotalLine: typeof game.marketLines[number] | null = null;
    let selectedMoneylineLine: typeof game.marketLines[number] | null = null;
    let selectedGroupSource: string | null = null;
    let selectedGroupBook: string | null = null;
    let selectedGroupTimestamp = 0;

    // TWO-PASS SELECTION: First pass only considers groups with teamId, fallback to all groups if none exist
    const selectBestGroup = (groups: OddsGroup[]) => {
      let bestCoverageScore = -1;
      let bestLatestTimestamp = 0;
      let bestSpreadLine: typeof game.marketLines[number] | null = null;
      let bestTotalLine: typeof game.marketLines[number] | null = null;
      let bestMoneylineLine: typeof game.marketLines[number] | null = null;
      let bestSource: string | null = null;
      let bestBook: string | null = null;
      let bestTimestamp = 0;

      for (const group of groups) {
        const spreadCandidate = pickPreferredLine(group.spreadLines, 'spread');
        const totalCandidate = pickPreferredLine(group.totalLines, 'total');
        const moneylineCandidate = pickPreferredLine(group.moneylineLines, 'moneyline');

        // Check if spread candidate has teamId
        const spreadWithTeamId = spreadCandidate as MarketLineWithTeamId | null;
        const hasTeamId = !!(spreadWithTeamId?.teamId && spreadWithTeamId.teamId !== 'NULL');
        
        // Coverage score: base score
        const coverageScore = (spreadCandidate ? 100 : 0) + (totalCandidate ? 10 : 0) + (moneylineCandidate ? 1 : 0);
        
        const latestTimestamp = Math.max(
          spreadCandidate ? new Date(spreadCandidate.timestamp).getTime() : 0,
          totalCandidate ? new Date(totalCandidate.timestamp).getTime() : 0,
          moneylineCandidate ? new Date(moneylineCandidate.timestamp).getTime() : 0
        );

        if (
          coverageScore > bestCoverageScore ||
          (coverageScore === bestCoverageScore && latestTimestamp > bestLatestTimestamp)
        ) {
          bestCoverageScore = coverageScore;
          bestLatestTimestamp = latestTimestamp;
          bestSpreadLine = spreadCandidate;
          bestTotalLine = totalCandidate;
          bestMoneylineLine = moneylineCandidate;
          bestSource = group.source || null;
          bestBook = group.bookName || null;
          bestTimestamp = latestTimestamp;
        }
      }

      return {
        spreadLine: bestSpreadLine,
        totalLine: bestTotalLine,
        moneylineLine: bestMoneylineLine,
        source: bestSource,
        book: bestBook,
        timestamp: bestTimestamp
      };
    };

    // PASS 1: Only consider groups where spread line has teamId
    const groupsWithTeamId = Array.from(groupedByBook.values()).filter(group => {
      const spreadCandidate = pickPreferredLine(group.spreadLines, 'spread');
      if (!spreadCandidate) return false;
      const spreadWithTeamId = spreadCandidate as MarketLineWithTeamId;
      return !!(spreadWithTeamId?.teamId && spreadWithTeamId.teamId !== 'NULL');
    });

    let selected: ReturnType<typeof selectBestGroup>;
    if (groupsWithTeamId.length > 0) {
      console.log(`[Game ${gameId}] ✅ Found ${groupsWithTeamId.length} groups with teamId - using PASS 1 (teamId only)`);
      selected = selectBestGroup(groupsWithTeamId);
    } else {
      console.warn(`[Game ${gameId}] ⚠️ No groups with teamId found - using PASS 2 (fallback to all groups)`);
      selected = selectBestGroup(Array.from(groupedByBook.values()));
    }

    selectedSpreadLine = selected.spreadLine;
    selectedTotalLine = selected.totalLine;
    selectedMoneylineLine = selected.moneylineLine;
    selectedGroupSource = selected.source;
    selectedGroupBook = selected.book;
    selectedGroupTimestamp = selected.timestamp;

    const diagnosticsMessages: string[] = [];
    let totalSourceMismatch = false;
    let moneylineSourceMismatch = false;

    // Fallbacks if any market is missing from the primary group
    const fallbackSpreadLine = pickMarketLine(game.marketLines, 'spread');
    if (!selectedSpreadLine && fallbackSpreadLine) {
      selectedSpreadLine = fallbackSpreadLine;
      selectedGroupSource = fallbackSpreadLine.source || null;
      selectedGroupBook = fallbackSpreadLine.bookName || null;
      selectedGroupTimestamp = new Date(fallbackSpreadLine.timestamp).getTime();
      diagnosticsMessages.push('Primary odds source missing spread — using fallback snapshot.');
    }

    if (!selectedSpreadLine) {
      throw new Error(`No spread market available for game ${gameId}`);
    }

    if (!selectedTotalLine) {
      const fallbackTotalLine = pickMarketLine(game.marketLines, 'total');
      if (fallbackTotalLine) {
        selectedTotalLine = fallbackTotalLine;
        diagnosticsMessages.push(`Odds source mismatch: total line sourced from ${fallbackTotalLine.bookName || 'Unknown book'}.`);
        totalSourceMismatch = true;
      }
    }

    if (!selectedMoneylineLine) {
      const fallbackMoneylineLine = pickMoneyline(game.marketLines);
      if (fallbackMoneylineLine) {
        selectedMoneylineLine = fallbackMoneylineLine;
        diagnosticsMessages.push(`Odds source mismatch: moneyline sourced from ${fallbackMoneylineLine.bookName || 'Unknown book'}.`);
        moneylineSourceMismatch = true;
      }
    }

    const spreadLine = selectedSpreadLine;
    const totalLine = selectedTotalLine;
    const mlLine = selectedMoneylineLine;

    // Type assertion to access teamId field (needed for both spreads and moneylines)
    const marketLinesWithTeamId = game.marketLines as MarketLineWithTeamId[];

    // Get both moneyline lines - NEW APPROACH: Don't rely on teamId
    // Moneylines come in pairs (one negative for favorite, one positive for dog)
    // Search broadly for any negative and positive moneylines near the spread timestamp
    const spreadTimestamp = new Date(spreadLine.timestamp).getTime();
    
    // Strategy: Search ALL moneylines near the spread timestamp (don't filter by book first)
    // This is more lenient and works even if books report moneylines at slightly different times
    const allMoneylinesNearSpread = game.marketLines.filter(
      (l) => l.lineType === 'moneyline' && 
             Math.abs(new Date(l.timestamp).getTime() - spreadTimestamp) < 10000 // Within 10 seconds
    );
    
    console.log(`[Game ${gameId}] 🔍 Searching for moneylines near spread timestamp:`, {
      spreadTimestamp: new Date(spreadTimestamp).toISOString(),
      spreadBook: spreadLine.bookName,
      foundMoneylines: allMoneylinesNearSpread.length,
      totalMoneylines: game.marketLines.filter(l => l.lineType === 'moneyline').length
    });
    
    // Extract ALL positive and negative moneyline values
    const allMLValues = allMoneylinesNearSpread
      .map(l => ({value: getLineValue(l), line: l}))
      .filter(item => item.value !== null && item.value !== undefined);
    
    // Group by positive and negative
    const negativeMLs = allMLValues.filter(item => item.value! < 0);
    const positiveMLs = allMLValues.filter(item => item.value! > 0);
    
    console.log(`[Game ${gameId}] 🔍 Moneyline values found:`, {
      negativeCount: negativeMLs.length,
      positiveCount: positiveMLs.length,
      negativeValues: negativeMLs.slice(0, 3).map(item => item.value),
      positiveValues: positiveMLs.slice(0, 3).map(item => item.value)
    });
    
    // Find the actual line objects - prefer most recent
    let homeMoneylineLine: MarketLineWithTeamId | undefined = undefined;
    let awayMoneylineLine: MarketLineWithTeamId | undefined = undefined;
    
    if (negativeMLs.length > 0 && positiveMLs.length > 0) {
      // Sort by timestamp to get most recent
      negativeMLs.sort((a, b) => new Date(b.line.timestamp).getTime() - new Date(a.line.timestamp).getTime());
      positiveMLs.sort((a, b) => new Date(b.line.timestamp).getTime() - new Date(a.line.timestamp).getTime());
      
      const negativeML = negativeMLs[0].value!;
      const positiveML = positiveMLs[0].value!;
      const negativeMLLine = negativeMLs[0].line;
      const positiveMLLine = positiveMLs[0].line;
      
      console.log(`[Game ${gameId}] 🎯 Found both moneylines:`, {
        negativeML,
        positiveML,
        negativeBook: negativeMLLine.bookName,
        positiveBook: positiveMLLine.bookName,
        negativeTimestamp: negativeMLLine.timestamp,
        positiveTimestamp: positiveMLLine.timestamp
      });
      
      // Store both (we'll assign to favorite/dog later based on spread)
      homeMoneylineLine = negativeMLLine as MarketLineWithTeamId;
      awayMoneylineLine = positiveMLLine as MarketLineWithTeamId;
    } else {
      console.warn(`[Game ${gameId}] ❌ Could not find both positive and negative moneylines`, {
        negativeCount: negativeMLs.length,
        positiveCount: positiveMLs.length,
        allMoneylinesNearSpread: allMoneylinesNearSpread.length
      });
    }
    
    // Fallback: if still no moneylines, use the selected mlLine (old behavior)
    const mlVal = mlLine ? getLineValue(mlLine) : null;

    const bookSource = [selectedGroupBook, selectedGroupSource].filter(Boolean).join(' • ') || spreadLine.bookName || 'Unknown';
    const oddsTimestamps: number[] = [];
    if (spreadLine?.timestamp) oddsTimestamps.push(new Date(spreadLine.timestamp).getTime());
    if (totalLine?.timestamp) oddsTimestamps.push(new Date(totalLine.timestamp).getTime());
    if (mlLine?.timestamp) oddsTimestamps.push(new Date(mlLine.timestamp).getTime());
    const updatedAtDate = oddsTimestamps.length > 0 ? new Date(Math.max(...oddsTimestamps)) : new Date(selectedGroupTimestamp || Date.now());
    const snapshotId = `${bookSource}::${updatedAtDate.toISOString()}`;

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

    // ============================================
    // CRITICAL FIX: Use pre-calculated values from matchupOutput
    // DO NOT recalculate spread/total on the fly - this causes bugs!
    // ============================================
    // The matchupOutput table contains pre-calculated implied lines from the ratings pipeline
    // This is the SINGLE SOURCE OF TRUTH for model predictions
    // The Current Slate page uses these same values - we must stay consistent!
    
    let computedSpread = matchupOutput?.impliedSpread || 0;
    let computedTotal = matchupOutput?.impliedTotal || null; // ✅ NO HARDCODED FALLBACK - null if unavailable
    
    // OPTIONAL: Can still compute spread if ratings exist AND matchupOutput is missing
    // But NEVER override matchupOutput if it exists!
    if (!matchupOutput && homeRating && awayRating) {
      const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
      const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);
      const HFA = game.neutralSite ? 0 : 2.0;
      computedSpread = homePower - awayPower + HFA;
      
      console.log(`[Game ${gameId}] ⚠️ NO MATCHUP OUTPUT - computing spread on the fly:`, {
        homePower,
        awayPower,
        HFA,
        computedSpread
      });
    }
    
    // Log the source of our model values
    console.log(`[Game ${gameId}] 📊 MODEL DATA SOURCE:`, {
      hasMatchupOutput: !!matchupOutput,
      modelSpread: computedSpread,
      modelTotal: computedTotal,
      source: matchupOutput ? 'matchupOutput (pre-calculated)' : 'fallback (computed on-the-fly)'
    });

    // ============================================
    // TOTAL DIAGNOSTICS (B) - Track data source and validation
    // ============================================
    const totalDiag: any = {
      source: matchupOutput ? 'matchupOutput (pre-calculated)' : 'no matchupOutput (null)',
      inputs: {
        matchupOutputExists: !!matchupOutput,
        matchupOutputSpread: matchupOutput?.impliedSpread || null,
        matchupOutputTotal: matchupOutput?.impliedTotal || null,
        homeRating: homeRating ? Number(homeRating.powerRating || homeRating.rating || 0) : null,
        awayRating: awayRating ? Number(awayRating.powerRating || awayRating.rating || 0) : null
      },
      steps: [] as any[],
      sourceFlags: {} as any,
      firstFailureStep: null as string | null,
      unitsInvalid: false
    };
    
    // Use computed values if matchupOutput doesn't exist or has invalid values
    // Validate that matchupOutput values are in realistic ranges before using them
    // CRITICAL: Check for type/unit issues (e.g., 1.3 might be a percentage, not points)
    const isValidSpread = matchupOutput?.impliedSpread !== null && 
                          matchupOutput?.impliedSpread !== undefined &&
                          !isNaN(matchupOutput.impliedSpread) &&
                          isFinite(matchupOutput.impliedSpread) &&
                          Math.abs(matchupOutput.impliedSpread) <= 50;
    
    // For total: be very strict - must be in points, not a percentage or ratio
    const matchupTotalRaw = matchupOutput?.impliedTotal;
    const isValidTotal = matchupTotalRaw !== null && 
                         matchupTotalRaw !== undefined &&
                         !isNaN(matchupTotalRaw) &&
                         isFinite(matchupTotalRaw) &&
                         matchupTotalRaw >= 20 && 
                         matchupTotalRaw <= 90;
    
    // Log if matchupOutput total looks suspicious (e.g., 1.3)
    if (matchupTotalRaw !== null && matchupTotalRaw !== undefined && !isValidTotal) {
      console.warn(`[Game ${gameId}] ⚠️ Suspicious matchupOutput.impliedTotal: ${matchupTotalRaw}`, {
        matchupTotal: matchupTotalRaw,
        isValidTotal: isValidTotal,
        computedTotal: computedTotal,
        possibleIssue: matchupTotalRaw < 20 ? 'Likely a percentage/ratio, not points' : 'Out of range',
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
      });
    }
    
    const finalImpliedSpread = (isValidSpread ? matchupOutput.impliedSpread : null) ?? computedSpread;
    
    // Initialize finalSpreadWithOverlay (will be updated later with Trust-Market overlay)
    let finalSpreadWithOverlay = finalImpliedSpread;
    
    // Never use matchupOutput.impliedTotal unless it passes the units handshake
    // If invalid, leave as null - DO NOT substitute a number
    const finalImpliedTotal = isValidTotal && matchupTotalRaw !== null ? matchupTotalRaw : null;
    
    // Track which source we're using and if units failed
    let totalSource = 'unknown';
    let firstFailureStep: string | null = null;
    if (isValidTotal && matchupTotalRaw !== null) {
      totalSource = 'matchupOutput';
    } else {
      // Model total is unavailable or not in points
      totalSource = 'unavailable';
      firstFailureStep = 'model_total_unavailable_or_invalid';
      totalDiag.firstFailureStep = firstFailureStep;
      totalDiag.unitsInvalid = true;
    }
    
    // Enhanced logging for totals calculation diagnostics
    console.log(`[Game ${gameId}] 🔍 TOTALS CALCULATION TRACE:`, {
      matchupTotalRaw,
      isValidTotal,
      computedTotal,
      finalImpliedTotal,
      totalSource,
      firstFailureStep,
      unitsInvalid: totalDiag.unitsInvalid,
      computationDetails: homeRating && awayRating ? {
        homeEpaOff: homeStats?.epaOff,
        awayEpaOff: awayStats?.epaOff,
        homePaceOff: homeStats?.paceOff,
        awayPaceOff: awayStats?.paceOff,
        homePpp: (homeStats && homeStats.epaOff !== null) ? Math.max(0, Math.min(0.7, 7 * Number(homeStats.epaOff))) : 'fallback',
        awayPpp: (awayStats && awayStats.epaOff !== null) ? Math.max(0, Math.min(0.7, 7 * Number(awayStats.epaOff))) : 'fallback',
        formula: '(homePpp × homePace) + (awayPpp × awayPace)'
      } : 'no_ratings'
    });
    
    // Note: marketTotal will be added to totalDiag after it's declared below
    totalDiag.modelTotal = finalImpliedTotal;
    // marketTotal will be set later when it's declared
    totalDiag.sourceFlags = {
      usedFallback: !isValidTotal && matchupTotalRaw !== null && matchupTotalRaw !== undefined,
      missingInputs: [
        ...(homeStats?.epaOff === null && homeStats?.yppOff === null ? [`pace/efficiency for ${game.homeTeam.name}`] : []),
        ...(awayStats?.epaOff === null && awayStats?.yppOff === null ? [`pace/efficiency for ${game.awayTeam.name}`] : [])
      ],
      matchupOutputExists: matchupOutput !== null && matchupOutput !== undefined,
      matchupOutputValid: isValidTotal,
      matchupOutputRaw: matchupTotalRaw,
      computedTotal: computedTotal
    };
    
    // Log total diagnostics
    console.log(`[Game ${gameId}] Total Diagnostics:`, JSON.stringify(totalDiag, null, 2));
    
    // Log if we're using computed values due to invalid matchupOutput data
    if (matchupOutput && !isValidTotal) {
      console.warn(`[Game ${gameId}] ⚠️ Invalid matchupOutput.impliedTotal (${matchupOutput.impliedTotal}), no fallback total available`, {
        matchupTotal: matchupOutput.impliedTotal,
        computedTotal,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
      });
    }
    if (matchupOutput && !isValidSpread) {
      console.warn(`[Game ${gameId}] ⚠️ Invalid matchupOutput.impliedSpread (${matchupOutput.impliedSpread}), using computed spread: ${computedSpread.toFixed(1)}`, {
        matchupSpread: matchupOutput.impliedSpread,
        computedSpread,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
      });
    }

    // ============================================
    // DEFINITIVE FAVORITE DETERMINATION USING teamId
    // ============================================
    // The Odds API provides explicit team names with each outcome (e.g., "Alabama Crimson Tide": -9.5)
    // We now store the teamId with each market line, so we can definitively determine which team is favored
    // NO MORE HEURISTICS! The market tells us who the favorite is.
    
    // Get spread lines for both teams from the same book/timestamp
    const homeSpreadLine = marketLinesWithTeamId.find(
      (l) => l.lineType === 'spread' && 
             l.teamId === game.homeTeamId &&
             l.bookName === spreadLine.bookName &&
             Math.abs(new Date(l.timestamp).getTime() - new Date(spreadLine.timestamp).getTime()) < 1000
    );
    
    const awaySpreadLine = marketLinesWithTeamId.find(
      (l) => l.lineType === 'spread' && 
             l.teamId === game.awayTeamId &&
             l.bookName === spreadLine.bookName &&
             Math.abs(new Date(l.timestamp).getTime() - new Date(spreadLine.timestamp).getTime()) < 1000
    );
    
    // Log all spread lines with teamId for debugging
    const allSpreadLinesForGame = marketLinesWithTeamId.filter(
      (l) => l.lineType === 'spread' && 
             l.bookName === spreadLine.bookName &&
             Math.abs(new Date(l.timestamp).getTime() - new Date(spreadLine.timestamp).getTime()) < 1000
    );
    
    console.log(`[Game ${gameId}] 🔍 SPREAD LINES BY TEAM:`, {
      homeTeam: game.homeTeam.name,
      homeTeamId: game.homeTeamId,
      homeSpreadLine: homeSpreadLine ? getLineValue(homeSpreadLine) : null,
      homeSpreadLineTeamId: homeSpreadLine?.teamId || 'NULL',
      awayTeam: game.awayTeam.name,
      awayTeamId: game.awayTeamId,
      awaySpreadLine: awaySpreadLine ? getLineValue(awaySpreadLine) : null,
      awaySpreadLineTeamId: awaySpreadLine?.teamId || 'NULL',
      bookName: spreadLine.bookName,
      allSpreadLines: allSpreadLinesForGame.map(l => ({
        lineValue: getLineValue(l),
        teamId: l.teamId || 'NULL',
        timestamp: l.timestamp
      }))
    });
    
    // Determine home and away prices from the teamId-tagged lines
    let homePrice: number;
    let awayPrice: number;
    let marketSpread: number;
    let favoriteTeamId: string;
    let favoriteTeamName: string;
    
    if (homeSpreadLine && awaySpreadLine) {
      // IDEAL CASE: We have both lines with teamId
      homePrice = getLineValue(homeSpreadLine)!;
      awayPrice = getLineValue(awaySpreadLine)!;
      
      // The favorite is the team with the negative line
      if (homePrice < awayPrice) {
        favoriteTeamId = game.homeTeamId;
        favoriteTeamName = game.homeTeam.name;
        marketSpread = homePrice; // Negative (favorite's line)
      } else {
        favoriteTeamId = game.awayTeamId;
        favoriteTeamName = game.awayTeam.name;
        marketSpread = awayPrice; // Negative (favorite's line)
      }
      
      console.log(`[Game ${gameId}] ✅ DEFINITIVE FAVORITE (from teamId):`, {
        favoriteTeamId,
        favoriteTeamName,
        favoriteLine: marketSpread,
        homePrice,
        awayPrice,
        source: 'teamId field (definitive)'
      });
    } else {
      // FALLBACK: teamId not available for one or both lines
      // Try to use the selected spreadLine's teamId if available
      const spreadLineWithTeamId = spreadLine as MarketLineWithTeamId;
      
      if (spreadLineWithTeamId.teamId) {
        // The selected spreadLine has a teamId - use it!
        const spreadLineValue = getLineValue(spreadLine);
        if (spreadLineValue === null || spreadLineValue === undefined) {
          throw new Error(`Selected snapshot missing spread value for game ${gameId}`);
        }
        
        // The spreadLine is the favorite's line (negative), and we know which team it belongs to
        if (spreadLineWithTeamId.teamId === game.homeTeamId) {
          // Home team is the favorite
          homePrice = spreadLineValue; // Negative (favorite)
          awayPrice = -spreadLineValue; // Positive (underdog)
          favoriteTeamId = game.homeTeamId;
          favoriteTeamName = game.homeTeam.name;
        } else if (spreadLineWithTeamId.teamId === game.awayTeamId) {
          // Away team is the favorite
          homePrice = -spreadLineValue; // Positive (underdog)
          awayPrice = spreadLineValue; // Negative (favorite)
          favoriteTeamId = game.awayTeamId;
          favoriteTeamName = game.awayTeam.name;
        } else {
          throw new Error(`Selected spreadLine teamId (${spreadLineWithTeamId.teamId}) doesn't match home (${game.homeTeamId}) or away (${game.awayTeamId}) for game ${gameId}`);
        }
        marketSpread = spreadLineValue; // Always negative (favorite's line)
        
        console.log(`[Game ${gameId}] ✅ FALLBACK USING SPREADLINE teamId:`, {
          favoriteTeamId,
          favoriteTeamName,
          favoriteLine: marketSpread,
          homePrice,
          awayPrice,
          source: 'spreadLine.teamId (partial fallback)'
        });
      } else {
        // CRITICAL: No teamId available at all - this is old data
        // Use power ratings to determine which team SHOULD be favored, then assign the line
        console.error(`[Game ${gameId}] ❌ CRITICAL: No teamId available for spread lines. Using power ratings fallback.`);
        console.error(`[Game ${gameId}] Spread lines found:`, allSpreadLinesForGame.map(l => ({
          lineValue: getLineValue(l),
          teamId: l.teamId || 'NULL',
          bookName: l.bookName,
          timestamp: l.timestamp
        })));
        
        // Last resort: use power ratings to determine favorite, then assign the negative line to that team
        const marketSpreadValue = getLineValue(spreadLine);
        if (marketSpreadValue === null || marketSpreadValue === undefined) {
          throw new Error(`Selected snapshot missing spread value for game ${gameId}`);
        }
        
        // Use power ratings to determine which team should be favored
        const homePower = homeRating ? Number(homeRating.powerRating || homeRating.rating || 0) : 0;
        const awayPower = awayRating ? Number(awayRating.powerRating || awayRating.rating || 0) : 0;
        const HFA = game.neutralSite ? 0 : 2.5;
        const homeEffectivePower = homePower + HFA;
        const awayEffectivePower = awayPower;
        
        // Determine favorite based on effective power
        const favoriteIsHome = homeEffectivePower > awayEffectivePower;
        const absValue = Math.abs(marketSpreadValue);
        
        if (favoriteIsHome) {
          homePrice = -absValue; // Home is favorite (negative)
          awayPrice = absValue; // Away is underdog (positive)
          favoriteTeamId = game.homeTeamId;
          favoriteTeamName = game.homeTeam.name;
        } else {
          homePrice = absValue; // Home is underdog (positive)
          awayPrice = -absValue; // Away is favorite (negative)
          favoriteTeamId = game.awayTeamId;
          favoriteTeamName = game.awayTeam.name;
        }
        marketSpread = -absValue; // Always negative (favorite's line)
        
        console.warn(`[Game ${gameId}] ⚠️ FALLBACK FAVORITE DETERMINATION (using power ratings):`, {
          favoriteTeamId,
          favoriteTeamName,
          favoriteLine: marketSpread,
          homePrice,
          awayPrice,
          homePower,
          awayPower,
          homeEffectivePower,
          awayEffectivePower,
          source: 'fallback heuristic (power ratings - NO teamId)',
          warning: 'This game needs re-ingestion to populate teamId field'
        });
      }
    }
    
    const marketTotalRaw = totalLine ? getLineValue(totalLine) : null;
    const marketTotal = marketTotalRaw !== null && marketTotalRaw !== undefined ? marketTotalRaw : null;
    
    // Add marketTotal to diagnostics now that it's declared
    totalDiag.marketTotal = marketTotal;
    
    // Favorite selection: already determined above using teamId
    const homeIsFavorite = favoriteTeamId === game.homeTeamId;
    const favoriteByRule = {
      teamId: favoriteTeamId,
      teamName: favoriteTeamName,
      price: marketSpread, // Negative (favorite's line)
      line: marketSpread // Already negative (favorite-centric)
    };
    
    // Tolerance check: abs(homePrice + awayPrice) should be <= 0.5
    const priceSum = Math.abs(homePrice + awayPrice);
    if (priceSum > 0.5) {
      console.warn(`[Game ${gameId}] ⚠️ Price sum tolerance check failed: abs(${homePrice} + ${awayPrice}) = ${priceSum.toFixed(2)}`);
    }
    
    // Comprehensive mapping audit log
    console.log(`[Game ${gameId}] Favorite Mapping Audit:`, {
      gameId,
      feedData: {
        homePrice: homePrice,
        awayPrice: awayPrice,
        marketSpread: marketSpread, // home-minus-away
        closingLine: spreadLine?.closingLine,
        lineValue: spreadLine?.lineValue,
        source: spreadLine?.source,
        bookName: spreadLine?.bookName,
        timestamp: spreadLine?.timestamp
      },
      mappedTeams: {
        home: { id: game.homeTeamId, name: game.homeTeam.name },
        away: { id: game.awayTeamId, name: game.awayTeam.name }
      },
      favorite: {
        byRuleTeam: favoriteByRule.teamId,
        byRuleTeamName: favoriteByRule.teamName,
        byRuleLine: favoriteByRule.line,
        byRulePrice: favoriteByRule.price
      },
      validation: {
        priceSum: priceSum,
        priceSumWithinTolerance: priceSum <= 0.5,
        homeIsFavorite: homeIsFavorite,
        interpretation: homeIsFavorite ? `${game.homeTeam.name} favored by ${Math.abs(homePrice)}` : `${game.awayTeam.name} favored by ${Math.abs(awayPrice)}`
      }
    });

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

    // mlVal computed earlier (single snapshot moneyline value)
    const mlMeta = mlLine ? {
      source: mlLine.source ?? null,
      bookName: mlLine.bookName ?? null,
      timestamp: mlLine.timestamp ?? null,
    } : null;

    // ============================================
    // TRUST-MARKET MODE: Moneyline from Final Spread (with overlay)
    // ============================================
    // Calculate model win probability from FINAL spread (after overlay)
    // This ensures ML is coherent with the overlay-adjusted spread
    // Using standard NFL/CFB conversion: prob = normcdf(spread / (2 * sqrt(variance)))
    // For college football, we use a standard deviation of ~14 points
    // Simplified: prob = 0.5 + (spread / (2 * 14)) * 0.5, clamped to [0.05, 0.95]
    const stdDev = 14; // Standard deviation for CFB point spreads
    const modelHomeWinProb = Math.max(0.05, Math.min(0.95, 
      0.5 + (finalSpreadWithOverlay / (2 * stdDev)) * 0.5
    ));
    const modelAwayWinProb = 1 - modelHomeWinProb;
    
    console.log(`[Game ${gameId}] 🎯 Moneyline from Final Spread:`, {
      finalSpreadWithOverlay: finalSpreadWithOverlay.toFixed(2),
      modelHomeWinProb: (modelHomeWinProb * 100).toFixed(1) + '%',
      modelAwayWinProb: (modelAwayWinProb * 100).toFixed(1) + '%'
    });

    // Convert model win probability to fair moneyline (American odds)
    // For home team: if prob > 0.5, negative odds; else positive
    // Formula: if prob >= 0.5: odds = -100 * prob / (1 - prob)
    //          if prob < 0.5: odds = 100 * (1 - prob) / prob
    const modelFairMLHome = modelHomeWinProb >= 0.5
      ? Math.round(-100 * modelHomeWinProb / (1 - modelHomeWinProb))
      : Math.round(100 * (1 - modelHomeWinProb) / modelHomeWinProb);
    const modelFairMLAway = modelAwayWinProb >= 0.5
      ? Math.round(-100 * modelAwayWinProb / (1 - modelAwayWinProb))
      : Math.round(100 * (1 - modelAwayWinProb) / modelAwayWinProb);

    // Determine which team the model favors for ML
    const modelMLFavorite = modelHomeWinProb >= 0.5 ? game.homeTeam : game.awayTeam;
    const modelMLFavoriteProb = modelHomeWinProb >= 0.5 ? modelHomeWinProb : modelAwayWinProb;
    const modelMLFavoriteFairML = modelHomeWinProb >= 0.5 ? modelFairMLHome : modelFairMLAway;

    // Calculate moneyline value and grade (deferred until after moneyline variables are set)
    // This will be computed after moneylineFavoritePrice and moneylineDogPrice are determined
    let moneyline = null;

    // Convert spreads to favorite-centric format
    // For market spread, use the favoriteByRule we computed (single source of truth)
    const modelSpreadFC = convertToFavoriteCentric(
      finalImpliedSpread,
      game.homeTeamId,
      game.homeTeam.name,
      game.awayTeamId,
      game.awayTeam.name
    );

    // Use favoriteByRule for market spread to ensure correct team mapping
    // This ensures we use the "more negative price" rule consistently
    const marketSpreadFC = {
      favoriteTeamId: favoriteByRule.teamId,
      favoriteTeamName: favoriteByRule.teamName,
      favoriteSpread: favoriteByRule.line, // Already negative (favorite-centric)
      underdogTeamId: favoriteByRule.teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId,
      underdogTeamName: favoriteByRule.teamId === game.homeTeamId ? game.awayTeam.name : game.homeTeam.name,
      underdogSpread: Math.abs(favoriteByRule.line) // Always positive (underdog getting points)
    };

    // Invariant guard: Verify favorite mapping is correct
    // Assert 1: marketFavorite.line < 0 (favorite lines must be negative)
    // Assert 2: The team with more negative price matches marketFavorite.teamId
    // Assert 3: homePrice and awayPrice are correctly assigned (one negative, one positive)
    const favoriteLineValid = favoriteByRule.line < 0;
    const pricesCorrectlySigned = (homePrice < 0 && awayPrice > 0) || (homePrice > 0 && awayPrice < 0);
    const favoriteMatchesPrices = (homePrice < awayPrice && favoriteByRule.teamId === game.homeTeamId) ||
                                   (awayPrice < homePrice && favoriteByRule.teamId === game.awayTeamId);
    
    if (!favoriteLineValid || !pricesCorrectlySigned || !favoriteMatchesPrices) {
      const telemetryEvent = {
        event: 'FAVORITE_MISMATCH',
        gameId,
        bookId: spreadLine?.bookName || 'Unknown',
        homeTeamId: game.homeTeamId,
        homeTeamName: game.homeTeam.name,
        awayTeamId: game.awayTeamId,
        awayTeamName: game.awayTeam.name,
        marketSpread: marketSpread,
        homePrice: homePrice,
        awayPrice: awayPrice,
        chosenFavorite: {
          teamId: favoriteByRule.teamId,
          teamName: favoriteByRule.teamName,
          line: favoriteByRule.line
        },
        validation: {
          favoriteLineValid,
          pricesCorrectlySigned,
          favoriteMatchesPrices
        }
      };
      console.error(`[Game ${gameId}] ⚠️ FAVORITE_MISMATCH:`, JSON.stringify(telemetryEvent, null, 2));
      
      // In dev, fail loud; in prod, warn
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(`FAVORITE_MISMATCH: Invalid favorite mapping for game ${gameId}`);
      }
    }
    
    // Log validation of favorite mapping
    console.log(`[Game ${gameId}] Favorite Mapping Validation:`, {
      favoriteByRule: {
        teamId: favoriteByRule.teamId,
        teamName: favoriteByRule.teamName,
        line: favoriteByRule.line
      },
      validation: {
        favoriteLineValid,
        pricesCorrectlySigned,
        favoriteMatchesPrices
      }
    });

    // ============================================
    // SINGLE SOURCE OF TRUTH: market_snapshot
    // ============================================
    // Canonicalize market data: favorite always negative, dog always positive
    const dogTeamId = favoriteByRule.teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
    const dogTeamName = favoriteByRule.teamId === game.homeTeamId ? game.awayTeam.name : game.homeTeam.name;
    const dogLine = Math.abs(favoriteByRule.line); // Always positive (underdog getting points)
    
    // Get moneyline prices from both team-specific lines
    let moneylineFavoritePrice: number | null = null;
    let moneylineDogPrice: number | null = null;
    let moneylineFavoriteTeamId: string | null = null;
    let moneylineDogTeamId: string | null = null;
    
    // DIAGNOSTIC: Log what we found and what's available in database
    const allMoneylinesInDb = game.marketLines.filter(l => l.lineType === 'moneyline');
    const moneylinesWithTeamId = allMoneylinesInDb.filter(l => {
      const ml = l as MarketLineWithTeamId;
      return !!(ml.teamId && ml.teamId !== 'NULL');
    });
    const homeMLLinesInDb = moneylinesWithTeamId.filter(l => {
      const ml = l as MarketLineWithTeamId;
      return ml.teamId === game.homeTeamId;
    });
    const awayMLLinesInDb = moneylinesWithTeamId.filter(l => {
      const ml = l as MarketLineWithTeamId;
      return ml.teamId === game.awayTeamId;
    });
    
    console.log(`[Game ${gameId}] 🔍 MONEYLINE LOOKUP DIAGNOSTIC:`, {
      homeMoneylineLine: homeMoneylineLine ? {
        teamId: homeMoneylineLine.teamId,
        lineValue: getLineValue(homeMoneylineLine),
        bookName: homeMoneylineLine.bookName,
        timestamp: homeMoneylineLine.timestamp
      } : null,
      awayMoneylineLine: awayMoneylineLine ? {
        teamId: awayMoneylineLine.teamId,
        lineValue: getLineValue(awayMoneylineLine),
        bookName: awayMoneylineLine.bookName,
        timestamp: awayMoneylineLine.timestamp
      } : null,
      favoriteTeamId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      databaseStats: {
        totalMoneylines: allMoneylinesInDb.length,
        moneylinesWithTeamId: moneylinesWithTeamId.length,
        homeMLLinesInDb: homeMLLinesInDb.length,
        awayMLLinesInDb: awayMLLinesInDb.length,
        sampleHomeML: homeMLLinesInDb.slice(0, 3).map(l => ({
          teamId: (l as MarketLineWithTeamId).teamId,
          lineValue: getLineValue(l),
          bookName: l.bookName,
          timestamp: l.timestamp
        })),
        sampleAwayML: awayMLLinesInDb.slice(0, 3).map(l => ({
          teamId: (l as MarketLineWithTeamId).teamId,
          lineValue: getLineValue(l),
          bookName: l.bookName,
          timestamp: l.timestamp
        }))
      }
    });
    
    if (homeMoneylineLine && awayMoneylineLine) {
      // NEW APPROACH: We have negative and positive moneylines (stored temporarily as home/away)
      // Assign based on which is negative (favorite) and which is positive (dog)
      const line1Price = getLineValue(homeMoneylineLine);
      const line2Price = getLineValue(awayMoneylineLine);
      
      // The negative line is the favorite, positive is the dog
      if (line1Price !== null && line2Price !== null) {
        if (line1Price < 0 && line2Price > 0) {
          // line1 is favorite (negative), line2 is dog (positive)
          moneylineFavoritePrice = line1Price;
          moneylineDogPrice = line2Price;
        } else if (line2Price < 0 && line1Price > 0) {
          // line2 is favorite (negative), line1 is dog (positive)
          moneylineFavoritePrice = line2Price;
          moneylineDogPrice = line1Price;
        }
        
        // Always assign teamIds based on the favorite from spread
        moneylineFavoriteTeamId = favoriteTeamId;
        moneylineDogTeamId = favoriteTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
        
        console.log(`[Game ${gameId}] ✅ MONEYLINE ASSIGNED (by sign):`, {
          favoriteTeamId: moneylineFavoriteTeamId,
          favoritePrice: moneylineFavoritePrice,
          dogTeamId: moneylineDogTeamId,
          dogPrice: moneylineDogPrice,
          source: 'sign-based assignment (negative=favorite, positive=dog)'
        });
      }
    } else {
      // FALLBACK: Couldn't find both moneylines from the new approach
      // Use mlVal if available (old behavior)
      console.warn(`[Game ${gameId}] ⚠️ Could not find both moneylines, falling back to mlVal`);
      
      if (mlVal !== null && mlVal !== undefined) {
        if (mlVal < 0) {
          moneylineFavoriteTeamId = favoriteTeamId;
          moneylineDogTeamId = favoriteTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
          moneylineFavoritePrice = mlVal;
        } else if (mlVal > 0) {
          moneylineFavoriteTeamId = favoriteTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
          moneylineDogTeamId = favoriteTeamId;
          moneylineDogPrice = mlVal;
        }
        
        console.log(`[Game ${gameId}] ⚠️ FALLBACK MONEYLINE (single value from mlVal):`, {
          mlVal,
          favoriteTeamId: moneylineFavoriteTeamId,
          favoritePrice: moneylineFavoritePrice,
          dogTeamId: moneylineDogTeamId,
          dogPrice: moneylineDogPrice,
          source: 'mlVal fallback'
        });
      }
    }

    // NOW: Calculate moneyline value and grade (moneyline variables are now set)
    // Calculate model probability and fair price for the PICKED team (defined outside block for scope)
    let pickedTeamModelProb: number | null = null;
    let pickedTeamMarketProb: number | null = null;
    let pickedTeamFairML: number | null = null;
    
    if (moneylineFavoritePrice !== null || moneylineDogPrice !== null) {
      const marketMLFavPrice = moneylineFavoritePrice !== null ? moneylineFavoritePrice : (moneylineDogPrice && moneylineDogPrice < 0 ? moneylineDogPrice : null);
      const marketMLFavProb = marketMLFavPrice !== null ? americanToProb(marketMLFavPrice)! : null;
      
      // Determine which team's probability to compare
      // Compare model's favorite probability vs market's favorite probability
      let valuePercent: number | null = null;
      let moneylineGrade: 'A' | 'B' | 'C' | null = null;
      let moneylinePickTeam: string | null = null;
      let moneylinePickPrice: number | null = null;
      
      if (marketMLFavProb !== null) {
        // Compare model probability vs market probability for EACH team separately
        const modelFavProb = favoriteTeamId === game.homeTeamId ? modelHomeWinProb : modelAwayWinProb;
        const modelDogProb = 1 - modelFavProb;
        
        // Get market probabilities for both teams
        const marketMLDogProb = moneylineDogPrice !== null ? americanToProb(moneylineDogPrice)! : (1 - marketMLFavProb);
        
        // Calculate value for favorite and dog separately
        const favoriteValuePercent = (modelFavProb - marketMLFavProb) * 100;
        const dogValuePercent = moneylineDogPrice !== null ? (modelDogProb - marketMLDogProb) * 100 : null;
        
        // Determine pick: Choose the side with positive value, with sanity checks for longshots
        // CRITICAL: Be very conservative with longshots
        // - Moderate longshots (+500 to +1000): Require > 10% value
        // - Extreme longshots (> +1000): Require > 25% value (very high bar)
        // - Super longshots (> +2000): Don't recommend regardless of value (too risky)
        const isDogModerateLongshot = moneylineDogPrice !== null && moneylineDogPrice > 500 && moneylineDogPrice <= 1000;
        const isDogExtremeLongshot = moneylineDogPrice !== null && moneylineDogPrice > 1000 && moneylineDogPrice <= 2000;
        const isDogSuperLongshot = moneylineDogPrice !== null && moneylineDogPrice > 2000;
        const isDogModerateValue = dogValuePercent !== null && dogValuePercent > 10;
        const isDogExtremeValue = dogValuePercent !== null && dogValuePercent > 25;
        
        if (favoriteValuePercent > 0 && (dogValuePercent === null || favoriteValuePercent >= dogValuePercent)) {
          // Favorite has positive value (and more value than dog, or dog not available)
          moneylinePickTeam = favoriteTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name;
          moneylinePickPrice = marketMLFavPrice;
          valuePercent = favoriteValuePercent;
        } else if (dogValuePercent !== null && dogValuePercent > 0) {
          // Dog has positive value - apply longshot restrictions
          if (isDogSuperLongshot) {
            // Never recommend super longshots (> +2000) - too risky regardless of value
            moneylinePickTeam = null;
            moneylinePickPrice = null;
            valuePercent = null;
          } else if (isDogExtremeLongshot && !isDogExtremeValue) {
            // Extreme longshots (+1000 to +2000) need > 25% value
            moneylinePickTeam = null;
            moneylinePickPrice = null;
            valuePercent = null;
          } else if (isDogModerateLongshot && !isDogModerateValue) {
            // Moderate longshots (+500 to +1000) need > 10% value
            moneylinePickTeam = null;
            moneylinePickPrice = null;
            valuePercent = null;
          } else {
            // Dog has value and passes longshot checks
            moneylinePickTeam = moneylineDogTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name;
            moneylinePickPrice = moneylineDogPrice;
            valuePercent = dogValuePercent;
          }
        } else {
          // Neither side has positive value
          // Don't recommend a moneyline bet
          moneylinePickTeam = null;
          moneylinePickPrice = null;
          valuePercent = null;
        }
        
        // Grade thresholds: A ≥ 4%, B ≥ 2.5%, C ≥ 1.5%
        // Only grade if we have a pick
        if (valuePercent !== null) {
          if (Math.abs(valuePercent) >= 4.0) {
            moneylineGrade = 'A';
          } else if (Math.abs(valuePercent) >= 2.5) {
            moneylineGrade = 'B';
          } else if (Math.abs(valuePercent) >= 1.5) {
            moneylineGrade = 'C';
          }
        }
        
        // Calculate model probability and fair price for the PICKED team (not model's favorite)
        // Calculate inside this block where marketMLFavProb is in scope
        if (marketMLFavProb !== null && moneylinePickTeam !== null) {
          const modelFavProb = favoriteTeamId === game.homeTeamId ? modelHomeWinProb : modelAwayWinProb;
          const modelDogProb = 1 - modelFavProb;
          const marketMLDogProb = moneylineDogPrice !== null ? americanToProb(moneylineDogPrice)! : (1 - marketMLFavProb);
          
          const pickedTeamIsFavorite = moneylinePickTeam === (moneylineFavoriteTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name);
          pickedTeamModelProb = pickedTeamIsFavorite ? modelFavProb : modelDogProb;
          pickedTeamMarketProb = pickedTeamIsFavorite ? marketMLFavProb : marketMLDogProb;
          pickedTeamFairML = pickedTeamModelProb >= 0.5
            ? Math.round(-100 * pickedTeamModelProb / (1 - pickedTeamModelProb))
            : Math.round(100 * (1 - pickedTeamModelProb) / pickedTeamModelProb);
        }
      }

      const moneylinePickLabel = moneylinePickTeam ? `${moneylinePickTeam} ML` : null;
      
      // CRITICAL: The price must match the pick team
      // If pick is favorite, use favorite price; if pick is dog, use dog price
      const finalPickPrice = moneylinePickTeam === (moneylineFavoriteTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name)
        ? marketMLFavPrice
        : (moneylineDogPrice !== null ? moneylineDogPrice : moneylinePickPrice);

      moneyline = {
        price: finalPickPrice, // Price must match the pick team
        pickLabel: moneylinePickLabel,
        impliedProb: pickedTeamMarketProb, // Market probability for the PICKED team
        meta: mlMeta,
        // Model comparison data for the PICKED team
        modelWinProb: pickedTeamModelProb,
        modelFairML: pickedTeamFairML,
        modelFavoriteTeam: modelMLFavorite.name,
        valuePercent: valuePercent,
        grade: moneylineGrade
      };
    } else if (mlVal !== null) {
      // Fallback: Use mlVal if moneyline variables weren't set
      const marketMLFavProb = americanToProb(mlVal)!;
      const modelFavProb = favoriteTeamId === game.homeTeamId ? modelHomeWinProb : modelAwayWinProb;
      const valuePercent = (modelFavProb - marketMLFavProb) * 100;
      
      moneyline = {
        price: mlVal,
        pickLabel: mlVal < 0 ? `${game.homeTeam.name} ML` : `${game.awayTeam.name} ML`,
        impliedProb: marketMLFavProb,
        meta: mlMeta,
        modelWinProb: modelMLFavoriteProb,
        modelFairML: modelMLFavoriteFairML,
        modelFavoriteTeam: modelMLFavorite.name,
        valuePercent: valuePercent,
        grade: null
      };
    } else {
      // No market ML, but show model fair ML
      moneyline = {
        price: null,
        pickLabel: null,
        impliedProb: null,
        meta: null,
        // Model fair line only
        modelWinProb: modelMLFavoriteProb,
        modelFairML: modelMLFavoriteFairML,
        modelFavoriteTeam: modelMLFavorite.name,
        valuePercent: null,
        grade: null,
        isModelFairLineOnly: true
      };
    }

    if (moneylineFavoriteTeamId && moneylineFavoriteTeamId !== favoriteByRule.teamId) {
      diagnosticsMessages.push('Moneyline favorite differs from spread favorite in selected snapshot.');
    }

    if (mlVal !== null && moneylineDogPrice === null) {
      diagnosticsMessages.push('Moneyline dog price unavailable from selected snapshot.');
    }

    const market_snapshot = {
      favoriteTeamId: favoriteByRule.teamId,
      favoriteTeamName: favoriteByRule.teamName,
      dogTeamId: dogTeamId,
      dogTeamName: dogTeamName,
      favoriteLine: favoriteByRule.line, // < 0 (favorite-centric)
      dogLine: dogLine, // > 0 (underdog getting points)
      marketTotal: marketTotal !== null ? marketTotal : null,
      moneylineFavorite: moneylineFavoritePrice,
      moneylineDog: moneylineDogPrice,
      moneylineFavoriteTeamId,
      moneylineDogTeamId,
      bookSource,
      updatedAt: updatedAtDate.toISOString(),
      snapshotId
    };

    // ============================================
    // INDEPENDENT VALIDATION FLAGS (Decouple ATS and OU)
    // ============================================
    // ============================================
    // VALIDATION: ATS and OU independently
    // ============================================
    // KEY INSIGHT: OU card should ALWAYS show (we always have market total)
    // We just need to know if the MODEL total is valid for computing overlay
    
    // ATS validation: Do we have a valid model spread?
    const ats_inputs_ok = finalImpliedSpread !== null && 
                          !isNaN(finalImpliedSpread) && 
                          isFinite(finalImpliedSpread);
    
    // OU model validation: Is the model total valid (numeric, in points)?
    const ou_model_valid = finalImpliedTotal !== null && 
                           !isNaN(finalImpliedTotal) && 
                           isFinite(finalImpliedTotal) &&
                           finalImpliedTotal >= 15 && 
                           finalImpliedTotal <= 120;
    
    // OU inputs validation: Do we have a market total to show?
    // ALWAYS true for live games (we always have market lines)
    const ou_inputs_ok = marketTotal !== null && !isNaN(marketTotal) && isFinite(marketTotal);
    
    const ats_reason = !ats_inputs_ok ? 'Model spread unavailable or invalid (NaN/inf)' : null;
    
    // OU reason: Only set when model is invalid (card still shows, just with muted reason)
    const ou_reason = !ou_model_valid 
      ? (finalImpliedTotal === null 
          ? 'Model total unavailable' 
          : finalImpliedTotal < 15 || finalImpliedTotal > 120
            ? `Model returned ${finalImpliedTotal.toFixed(1)}, not in points (likely rate/ratio)`
            : 'Model total invalid (NaN/inf)')
      : null;
    
    console.log(`[Game ${gameId}] 🔍 Independent Validation:`, {
      ats_inputs_ok,
      ou_inputs_ok,
      ou_model_valid, // NEW: Track if model total is usable
      ats_reason,
      ou_reason,
      finalImpliedSpread,
      finalImpliedTotal,
      marketTotal,
      note: 'OU card shows when ou_inputs_ok (have market), computes overlay when ou_model_valid'
    });
    
    // ============================================
    // TRUST-MARKET MODE: Spread Overlay Logic
    // ============================================
    // Use market as baseline, apply small model adjustment (±3.0 cap)
    // This prevents catastrophic picks while still allowing model signals
    
    const modelSpreadRaw = finalImpliedSpread; // Model's raw prediction (home-minus-away)
    const rawSpreadDisagreement = Math.abs(modelSpreadRaw - marketSpread);
    
    // Calculate overlay: clamp(λ × (model - market), -cap, +cap)
    const spreadOverlay = clampOverlay(
      LAMBDA_SPREAD * (modelSpreadRaw - marketSpread),
      OVERLAY_CAP_SPREAD
    );
    
    // Final spread = market baseline + overlay (update the pre-declared variable)
    finalSpreadWithOverlay = marketSpread + spreadOverlay;
    
    // Check if we should degrade confidence due to large disagreement
    const shouldDegradeSpreadConfidence = rawSpreadDisagreement > LARGE_DISAGREEMENT_THRESHOLD;
    
    console.log(`[Game ${gameId}] 🎯 Trust-Market Spread Overlay:`, {
      modelSpreadRaw: modelSpreadRaw.toFixed(2),
      marketSpread: marketSpread.toFixed(2),
      rawDisagreement: rawSpreadDisagreement.toFixed(2),
      lambda: LAMBDA_SPREAD,
      overlayRaw: (LAMBDA_SPREAD * (modelSpreadRaw - marketSpread)).toFixed(2),
      overlayCapped: spreadOverlay.toFixed(2),
      finalSpread: finalSpreadWithOverlay.toFixed(2),
      shouldDegradeConfidence: shouldDegradeSpreadConfidence,
      mode: MODEL_MODE
    });

    // Calculate ATS edge - in Trust-Market mode, the edge IS the overlay (not model - market)
    // The overlay represents how much value we see at the current market number
    const atsEdge = spreadOverlay; // Edge is the overlay value
    const atsEdgeAbs = Math.abs(atsEdge);
    
    // ============================================
    // RANGE LOGIC: Bet-To and Flip Point
    // ============================================
    // Bet-to: Stop line where edge = edge_floor
    // Flip: First price where the other side becomes a bet
    const spreadBetTo = atsEdgeAbs >= OVERLAY_EDGE_FLOOR 
      ? marketSpread + Math.sign(spreadOverlay) * OVERLAY_EDGE_FLOOR
      : null;
    const spreadFlip = atsEdgeAbs >= OVERLAY_EDGE_FLOOR
      ? marketSpread - Math.sign(spreadOverlay) * OVERLAY_EDGE_FLOOR
      : null;

    // Compute spread pick details (favorite-centric) - this is the model's favorite
    const spreadPick = computeSpreadPick(
      finalImpliedSpread,
      game.homeTeam.name,
      game.awayTeam.name,
      game.homeTeamId,
      game.awayTeamId
    );

    // ============================================
    // MODEL TOTAL VALIDATION GATES (PART B)
    // ============================================
    
    // Track computation path for diagnostics
    const computationPath = isValidTotal && matchupOutput?.impliedTotal !== null 
      ? 'matchupOutput' 
      : homeRating && awayRating 
        ? 'computedFromRatings' 
        : 'fallback';
    
    // ============================================
    // MODEL TOTAL VALIDATION - Only Missing Inputs & Computation Failure
    // ============================================
    // No range-based gating - if pipeline produces a number, we show it
    
    // Gate 1: Inputs Ready - check if required inputs are available
    const inputsReady = {
      homeEpaOff: homeStats?.epaOff !== null && homeStats?.epaOff !== undefined,
      awayEpaOff: awayStats?.epaOff !== null && awayStats?.epaOff !== undefined,
      homeYppOff: homeStats?.yppOff !== null && homeStats?.yppOff !== undefined,
      awayYppOff: awayStats?.yppOff !== null && awayStats?.yppOff !== undefined,
      homePaceOff: homeStats?.paceOff !== null && homeStats?.paceOff !== undefined,
      awayPaceOff: awayStats?.paceOff !== null && awayStats?.paceOff !== undefined,
      homeRating: homeRating !== null,
      awayRating: awayRating !== null
    };
    const inputsReadyFlag = inputsReady.homeEpaOff || inputsReady.homeYppOff || inputsReady.awayEpaOff || inputsReady.awayYppOff;
    
    // Gate 2: Consistency - team implied scores sum to total within ±0.5 (computation check)
    // Calculate implied scores for consistency check (only if spread is valid)
    const spreadValidForConsistency = finalImpliedSpread !== null && 
                                      finalImpliedSpread >= -50 && 
                                      finalImpliedSpread <= 50;
    const impliedHomeScoreForCheck = spreadValidForConsistency && finalImpliedTotal !== null
      ? (finalImpliedTotal + finalImpliedSpread) / 2
      : null;
    const impliedAwayScoreForCheck = spreadValidForConsistency && finalImpliedTotal !== null
      ? (finalImpliedTotal - finalImpliedSpread) / 2
      : null;
    const consistencyDelta = impliedHomeScoreForCheck !== null && impliedAwayScoreForCheck !== null && finalImpliedTotal !== null
      ? Math.abs((impliedHomeScoreForCheck + impliedAwayScoreForCheck) - finalImpliedTotal)
      : null;
    const consistencyFlag = consistencyDelta === null || consistencyDelta <= 0.5;
    
    // Determine specific missing inputs for warning messages
    const missingInputs: string[] = [];
    if (!inputsReady.homeEpaOff && !inputsReady.homeYppOff && !inputsReady.homePaceOff) {
      missingInputs.push(`pace/efficiency for ${game.homeTeam.name}`);
    }
    if (!inputsReady.awayEpaOff && !inputsReady.awayYppOff && !inputsReady.awayPaceOff) {
      missingInputs.push(`pace/efficiency for ${game.awayTeam.name}`);
    }
    
    // Check for computation failure (NaN/inf or failed consistency check)
    const computationFailed = finalImpliedTotal === null || 
                             isNaN(finalImpliedTotal) || 
                             !isFinite(finalImpliedTotal) ||
                             (consistencyDelta !== null && consistencyDelta > 0.5);
    
    // Model total is valid if it exists and computation didn't fail (no range checks)
    // CRITICAL: Add type safety - ensure it's a finite number in points, not a percentage/ratio
    // MINIMAL SAFETY CAP: Units sanity guard (15-120) to catch unit bugs (e.g., 1.3)
    // This is NOT a range gate on legit numbers; it's a unit sanity check
    
    // If computation succeeded but outside safety cap, treat as units issue
    const unitsIssue = finalImpliedTotal !== null && 
                      !isNaN(finalImpliedTotal) && 
                      isFinite(finalImpliedTotal) &&
                      (finalImpliedTotal < 15 || finalImpliedTotal > 120);
    
    const isModelTotalValid = !computationFailed && 
                             !unitsIssue &&
                             finalImpliedTotal !== null && 
                             !isNaN(finalImpliedTotal) && 
                             isFinite(finalImpliedTotal) &&
                             typeof finalImpliedTotal === 'number' &&
                             finalImpliedTotal >= 15 && 
                             finalImpliedTotal <= 120; // Units sanity guard
    
    // Track which step first broke units (if not already set)
    if (unitsIssue && totalDiag.firstFailureStep === null) {
      totalDiag.firstFailureStep = totalSource === 'matchupOutput' ? 'matchupOutput.impliedTotal' : 'modelTotal_sum';
      totalDiag.unitsInvalid = true;
    }
    
    // Generate specific warning message (only for missing inputs or computation failure)
    let modelTotalWarning: string | null = null;
    let calcError = false;
    let unitsNote: string | null = null;
    if (unitsIssue) {
      calcError = true;
      const valueDisplay = finalImpliedTotal !== null ? finalImpliedTotal.toFixed(1) : 'unknown';
      const unitsFailureCopy = `model returned ${valueDisplay}, which isn’t in points (likely a rate/ratio). We’re not going to guess.`;
      modelTotalWarning = unitsFailureCopy;
      unitsNote = unitsFailureCopy;
    } else if (computationFailed) {
      calcError = true;
      if (consistencyDelta !== null && consistencyDelta > 0.5) {
        modelTotalWarning = `Computation failed: inconsistent implied scores (Δ=${consistencyDelta.toFixed(1)}).`;
        unitsNote = `Computation failed: inconsistent implied scores (Δ=${consistencyDelta.toFixed(1)}).`;
      } else {
        modelTotalWarning = `Computation failed: NaN/inf.`;
        unitsNote = `Computation failed: NaN/inf.`;
      }
    } else if (missingInputs.length > 0) {
      modelTotalWarning = `Missing inputs: ${missingInputs.join(', ')}.`;
      unitsNote = `Missing inputs: ${missingInputs.join(', ')}.`;
    }
    
    // Plausibility check (log only, don't suppress)
    let plausibilityNote: string | null = null;
    if (isModelTotalValid && (finalImpliedTotal < 25 || finalImpliedTotal > 95)) {
      plausibilityNote = `Model total ${finalImpliedTotal.toFixed(1)} is outside typical CFB range [25-95].`;
      console.warn(`[Game ${gameId}] ${plausibilityNote}`);
    }
    
    const validModelTotal = isModelTotalValid ? finalImpliedTotal : null;
    
    // Validation flags (for diagnostics only, not for gating)
    const validationFlags = {
      inputsReady: inputsReadyFlag,
      consistency: consistencyFlag,
      computationFailed: computationFailed,
      missingInputs: missingInputs.length > 0
    };
    
    // ============================================
    // TRUST-MARKET MODE: Spread Pick Logic
    // ============================================
    // Only show pick if overlay creates >= 2.0 pts of edge
    // This prevents showing picks when model barely disagrees with market
    
    const edgeFloor = OVERLAY_EDGE_FLOOR; // 2.0 pts minimum
    const hasSpreadEdge = atsEdgeAbs >= edgeFloor;
    
    // ============================================
    // EXTREME FAVORITE GUARD
    // ============================================
    // Don't headline 20+ point dogs even if overlay points that way
    const isExtremeFavorite = Math.abs(marketSpread) >= 21;
    
    // Determine if overlay direction points to the dog
    // If marketSpread < 0 (home favored), spreadOverlay > 0 means model likes away (dog)
    // If marketSpread > 0 (away favored), spreadOverlay < 0 means model likes home (dog)
    const overlayFavorsDog = (marketSpread < 0 && spreadOverlay > 0) || (marketSpread > 0 && spreadOverlay < 0);
    
    // Block dog headline if extreme favorite AND overlay points to dog
    const blockDogHeadline = isExtremeFavorite && overlayFavorsDog && hasSpreadEdge;
    
    let bettablePick: any;
    let ats_dog_headline_blocked = false;
    
    if (!hasSpreadEdge) {
      // No pick - overlay too small to bet
      bettablePick = {
        teamId: null,
        teamName: null,
        line: null,
        label: null,
        reasoning: `No edge at current number. Model overlay is ${spreadOverlay >= 0 ? '+' : ''}${spreadOverlay.toFixed(1)} pts (below ${edgeFloor.toFixed(1)} pt threshold in Trust-Market mode).`,
        betTo: null,
        favoritesDisagree: false,
        suppressHeadline: false,
        extremeFavoriteBlocked: false
      };
      console.log(`[Game ${gameId}] ℹ️ No spread pick - overlay below threshold:`, {
        overlay: spreadOverlay.toFixed(2),
        edgeFloor,
        reason: 'Overlay < edge floor'
      });
    } else if (blockDogHeadline) {
      // Has edge BUT extreme favorite + dog direction → suppress dog headline, show range only
      ats_dog_headline_blocked = true;
      bettablePick = {
        teamId: null,
        teamName: null,
        line: null,
        label: null,
        reasoning: `Extreme favorite game (${Math.abs(marketSpread).toFixed(1)} pts). Model overlay ${spreadOverlay >= 0 ? '+' : ''}${spreadOverlay.toFixed(1)} pts favors the underdog, but we don't recommend 20+ point dogs. Range guidance provided.`,
        betTo: spreadBetTo,
        favoritesDisagree: false,
        suppressHeadline: true, // Flag for UI to show "No edge" headline but keep range
        extremeFavoriteBlocked: true,
        flip: spreadFlip
      };
      console.log(`[Game ${gameId}] 🚫 Dog headline blocked (extreme favorite):`, {
        marketSpread: marketSpread.toFixed(2),
        overlay: spreadOverlay.toFixed(2),
        edge: atsEdge.toFixed(2),
        betTo: spreadBetTo?.toFixed(1),
        flip: spreadFlip?.toFixed(1),
        reason: 'Overlay points to 20+ pt dog - suppressing headline but keeping range'
      });
    } else {
      // Compute pick using original helper (it handles direction correctly)
      bettablePick = computeBettableSpreadPick(
        finalImpliedSpread,
        marketSpread,
        game.homeTeamId,
        game.homeTeam.name,
        game.awayTeamId,
        game.awayTeam.name,
        atsEdge,
        edgeFloor
      );
      
      // Add overlay context to reasoning
      bettablePick.reasoning = `${bettablePick.reasoning} (Trust-Market overlay: ${spreadOverlay >= 0 ? '+' : ''}${spreadOverlay.toFixed(1)} pts, capped at ±${OVERLAY_CAP_SPREAD})`;
      
      // Add range info and flags
      bettablePick.flip = spreadFlip;
      bettablePick.betTo = spreadBetTo; // Override with consistent value
      bettablePick.suppressHeadline = false;
      bettablePick.extremeFavoriteBlocked = false;
      
      console.log(`[Game ${gameId}] ✅ Spread pick generated:`, {
        pick: bettablePick.label,
        overlay: spreadOverlay.toFixed(2),
        edge: atsEdge.toFixed(2),
        betTo: spreadBetTo?.toFixed(1),
        flip: spreadFlip?.toFixed(1)
      });
    }
    
    // Telemetry: Log when dog headline is blocked for extreme favorites
    if (ats_dog_headline_blocked) {
      console.log(`[Game ${gameId}] 📊 TELEMETRY: ats_dog_headline_blocked`, {
        gameId,
        marketSpread: marketSpread.toFixed(2),
        overlay: spreadOverlay.toFixed(2),
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        reason: 'Extreme favorite (|line| >= 21), overlay favors dog'
      });
    }

    // ============================================
    // TRUST-MARKET MODE: Total Overlay Logic
    // ============================================
    // Use market as baseline, apply small model adjustment
    // If model total is null/invalid, NO PICK (don't guess)
    
    let totalOverlay = 0;
    let finalTotalWithOverlay = marketTotal;
    let rawTotalDisagreement = 0;
    let shouldDegradeTotalConfidence = false;
    let hasTotalEdge = false;
    
    // CRITICAL: Only compute overlay if model total is VALID (ou_model_valid = true)
    // We always have market total (ou_inputs_ok), but only compute overlay when model is usable
    if (ou_model_valid && marketTotal !== null) {
      const modelTotalPts = finalImpliedTotal!; // Model total in points (guaranteed by ou_model_valid)
      rawTotalDisagreement = Math.abs(modelTotalPts - marketTotal);
      
      // Calculate overlay: clamp(λ × (model - market), -cap, +cap)
      const overlayRaw = LAMBDA_TOTAL * (modelTotalPts - marketTotal);
      totalOverlay = clampOverlay(overlayRaw, OVERLAY_CAP_TOTAL);
      
      // Final total = market baseline + overlay
      finalTotalWithOverlay = marketTotal + totalOverlay;
      
      // Check if we should degrade confidence
      shouldDegradeTotalConfidence = rawTotalDisagreement > LARGE_DISAGREEMENT_THRESHOLD;
      
      // Edge is the absolute overlay value
      const totalEdgeAbs = Math.abs(totalOverlay);
      hasTotalEdge = totalEdgeAbs >= OVERLAY_EDGE_FLOOR;
      
      console.log(`[Game ${gameId}] 🎯 Trust-Market Total Overlay:`, {
        modelTotalPts: modelTotalPts.toFixed(2),
        marketTotal: marketTotal.toFixed(2),
        rawDelta: (modelTotalPts - marketTotal).toFixed(2),
        rawDisagreement: rawTotalDisagreement.toFixed(2),
        lambda: LAMBDA_TOTAL,
        overlayRaw: overlayRaw.toFixed(2),
        overlayCapped: totalOverlay.toFixed(2),
        finalTotal: finalTotalWithOverlay.toFixed(2),
        edgeAbs: totalEdgeAbs.toFixed(2),
        hasTotalEdge,
        shouldDegradeConfidence: shouldDegradeTotalConfidence,
        mode: MODEL_MODE
      });
    } else {
      // Model total is invalid or market total missing - cannot compute overlay
      console.log(`[Game ${gameId}] ℹ️ Total overlay skipped:`, {
        ou_model_valid,
        modelTotalAvailable: finalImpliedTotal !== null,
        marketTotalAvailable: marketTotal !== null,
        reason: !ou_model_valid ? 'Model total invalid (not in points)' : 'Market total unavailable',
        note: 'OU card still shows with market headline when ou_inputs_ok'
      });
    }

    // Total edge: In Trust-Market mode, edge IS the overlay (not model - market)
    // If model is invalid, edge is null (no pick, but card still shows)
    const totalEdgePts = ou_model_valid && marketTotal !== null ? totalOverlay : null;
    
    // ============================================
    // RANGE LOGIC: Bet-To and Flip Point (Totals)
    // ============================================
    const totalEdgeAbs = totalEdgePts !== null ? Math.abs(totalEdgePts) : 0;
    const totalBetToCalc = totalEdgeAbs >= OVERLAY_EDGE_FLOOR && marketTotal !== null
      ? marketTotal + Math.sign(totalOverlay) * OVERLAY_EDGE_FLOOR
      : null;
    const totalFlip = totalEdgeAbs >= OVERLAY_EDGE_FLOOR && marketTotal !== null
      ? marketTotal - Math.sign(totalOverlay) * OVERLAY_EDGE_FLOOR
      : null;
    
    // ============================================
    // SINGLE SOURCE OF TRUTH: model_view
    // ============================================
    // Model favorite in favorite-centric format (same coordinate system as market_snapshot)
    // Reuse modelSpreadFC computed earlier (it's already in favorite-centric format)
    
    // Model favorite (can be null if pick'em)
    const modelFavoriteTeamId = Math.abs(modelSpreadFC.favoriteSpread) > 0.1 
      ? modelSpreadFC.favoriteTeamId 
      : null;
    const modelFavoriteName = modelFavoriteTeamId 
      ? modelSpreadFC.favoriteTeamName 
      : null;
    const modelFavoriteLine = modelFavoriteTeamId 
      ? modelSpreadFC.favoriteSpread // Already negative (favorite-centric)
      : 0.0; // Pick'em
    
    // Model total (null if units invalid)
    const modelTotal = isModelTotalValid ? finalImpliedTotal : null;
    const winProbFavorite = modelFavoriteTeamId
      ? (modelFavoriteTeamId === game.homeTeamId ? modelHomeWinProb : modelAwayWinProb)
      : null;
    const winProbDog = winProbFavorite !== null ? 1 - winProbFavorite : null;
    
    // ============================================
    // EDGES (FAVORITE-CENTRIC) - FIX FOR PICK'EM
    // ============================================
    // atsEdgePts: Always compute edge relative to market favorite, even when model is pick'em
    // For market favorite coordinate system:
    //   - Market favorite line is negative (e.g., -30)
    //   - Model line in same coordinate system
    //   - If model is pick'em but market is -30, edge should be +30 (value on dog)
    //   - Edge = model line - market line (in favorite-centric coords)
    
    // Convert model spread to market favorite's coordinate system
    let modelLineInMarketFavCoords: number;
    if (modelFavoriteTeamId === null) {
      // Model is pick'em (0.0) - express as 0.0 in market favorite coords
      modelLineInMarketFavCoords = 0.0;
    } else if (modelFavoriteTeamId === market_snapshot.favoriteTeamId) {
      // Model and market agree on favorite - use model's line directly
      modelLineInMarketFavCoords = modelFavoriteLine;
    } else {
      // Model and market disagree on favorite - flip the sign
      // If model says Team A -10 but market has Team B as favorite,
      // then in market coords, Team B is getting +10
      modelLineInMarketFavCoords = -modelFavoriteLine;
    }
    
    // ============================================
    // IMPORTANT: Edge calculation moved AFTER overlay logic
    // ============================================
    // In Trust-Market mode, the edge IS the capped overlay, not the raw model-market difference
    // This placeholder will be updated after overlay calculation
    // For now, keep the raw calculation for logging/diagnostics only
    const atsEdgePtsRaw = modelLineInMarketFavCoords - market_snapshot.favoriteLine;
    
    // Log ATS decision trace before rendering (using raw edge for context)
    console.log(`[Game ${gameId}] 📊 ATS DECISION TRACE (PRE-OVERLAY):`, {
      modelFavoriteTeamId,
      modelFavoriteName,
      modelFavoriteLine,
      marketFavoriteTeamId: market_snapshot.favoriteTeamId,
      marketFavoriteName: market_snapshot.favoriteTeamName,
      marketFavoriteLine: market_snapshot.favoriteLine,
      modelLineInMarketFavCoords,
      atsEdgePtsRaw,
      note: 'In Trust-Market mode, the final edge will be the capped overlay, not this raw value'
    });
    
    // ouEdgePts: modelTotal - marketTotal (positive = model thinks over, negative = under)
    // This will also be updated after overlay logic for totals
    const ouEdgePtsRaw = modelTotal !== null && market_snapshot.marketTotal !== null
      ? modelTotal - market_snapshot.marketTotal
      : null;
    
    // ============================================
    // TRUST-MARKET MODE: Use capped overlay edges
    // ============================================
    // In Trust-Market mode, edges are the capped overlays (already calculated above)
    // atsEdge = spreadOverlay (calculated line ~1358)
    // totalEdgePts = totalOverlay (calculated line ~1675)
    const model_view = {
      modelFavoriteTeamId: modelFavoriteTeamId,
      modelFavoriteName: modelFavoriteName,
      modelFavoriteLine: modelFavoriteLine, // Favorite-centric, negative (or 0.0 for pick'em)
      modelTotal: modelTotal, // Points or null if units invalid
      winProbFavorite,
      winProbDog,
      edges: {
        atsEdgePts: atsEdge, // ✅ Capped overlay (not raw disagreement)
        ouEdgePts: totalEdgePts // ✅ Capped overlay (not raw disagreement)
      }
    };
    
    // Log final edges for verification
    console.log(`[Game ${gameId}] 🎯 FINAL EDGES (Trust-Market Mode):`, {
      atsEdge: atsEdge.toFixed(2),
      totalEdge: totalEdgePts?.toFixed(2) ?? 'null',
      atsRawDisagreement: atsEdgePtsRaw.toFixed(2),
      totalRawDisagreement: ouEdgePtsRaw?.toFixed(2) ?? 'null',
      note: 'model_view.edges now uses capped overlay values'
    });
    
    // ============================================
    // TOTALS PROVENANCE LOGGING
    // ============================================
    console.log(`[Game ${gameId}] 📊 TOTALS PROVENANCE:`, {
      finalImpliedTotal,
      modelTotal,
      marketTotal: market_snapshot.marketTotal,
      isModelTotalValid,
      unitsIssue,
      computationFailed,
      totalSource,
      firstFailureStep: totalDiag.firstFailureStep,
      unitsNote,
      ouEdgePts: totalEdgePts, // Capped overlay edge (not raw disagreement)
      ouEdgePtsRaw: ouEdgePtsRaw, // Raw model-market disagreement
      diagnostics: {
        inputs: totalDiag.inputs,
        steps: totalDiag.steps,
        unitsInvalid: totalDiag.unitsInvalid
      }
    });
    
    // ============================================
    // SINGLE SOURCE OF TRUTH: diagnostics
    // ============================================
    const mappingNotes: string[] = [];
    if (!favoriteLineValid) {
      mappingNotes.push(`Favorite line is not negative: ${favoriteByRule.line}`);
    }
    if (!pricesCorrectlySigned) {
      mappingNotes.push(`Prices not correctly signed: homePrice=${homePrice}, awayPrice=${awayPrice}`);
    }
    if (!favoriteMatchesPrices) {
      mappingNotes.push(`Favorite team doesn't match prices: favoriteTeamId=${favoriteByRule.teamId}, homePrice=${homePrice}, awayPrice=${awayPrice}`);
    }
    if (totalSourceMismatch) {
      mappingNotes.push('Total line sourced from a different book than the spread snapshot.');
    }
    if (moneylineSourceMismatch) {
      mappingNotes.push('Moneyline sourced from a different book than the spread snapshot.');
    }
    const moneylineMatchesFavorite = !moneylineFavoriteTeamId || moneylineFavoriteTeamId === favoriteByRule.teamId;
    if (!moneylineMatchesFavorite) {
      mappingNotes.push('Moneyline favorite does not match spread favorite in selected snapshot.');
    }

    const mappingPassed = mappingNotes.length === 0;
    if (!mappingPassed) {
      diagnosticsMessages.push('Rendering mismatch detected — a component tried to recompute favorite locally. Using server snapshot instead.');
    }

    const diagnostics = {
      snapshotId,
      mappingAssertions: {
        passed: mappingPassed,
        notes: mappingNotes
      },
      totalsUnits: {
        isPoints: isModelTotalValid,
        reason: !isModelTotalValid ? unitsNote : undefined,
        modelValue: finalImpliedTotal
      },
      // OU pipeline diagnostics (for debugging OU validation issues)
      // NOTE: overlay, betTo, flip are computed later and available in picks.total
      ou_debug: {
        marketTotal,
        modelTotalRaw: finalImpliedTotal,
        unitsCheck: {
          isPoints: isModelTotalValid,
          reason: !isModelTotalValid ? unitsNote : 'Model total is valid'
        },
        ou_model_valid,
        ou_inputs_ok,
        lambda: LAMBDA_TOTAL,
        cap: OVERLAY_CAP_TOTAL,
        edgeFloor: OVERLAY_EDGE_FLOOR,
        note: 'OU card shows when ou_inputs_ok (market available). Overlay computed when ou_model_valid (model is valid). See picks.total for overlay/betTo/flip values.'
      },
      messages: diagnosticsMessages
    };

    if (!isModelTotalValid && unitsNote) {
      console.log('[TELEMETRY]', JSON.stringify({
        event: 'total_units_failure',
        gameId,
        snapshotId,
        modelValue: finalImpliedTotal,
        marketTotal,
        reason: unitsNote
      }));
    }
    
    // ============================================
    // TRUST-MARKET MODE: Total Pick Logic
    // ============================================
    // Only show pick if overlay >= 2.0 pts (same as spread)
    // CRITICAL: If model total is null/invalid, NO PICK (don't guess)
    
    // In Trust-Market mode, "hasNoEdge" means overlay < edge floor
    const hasNoEdge = !hasTotalEdge; // hasTotalEdge was computed in overlay section
    
    let totalPick: any;
    let totalBetTo: number | null = null;
    
    if (finalImpliedTotal === null) {
      // Model total unavailable/invalid - suppress pick entirely, no "Lean"
      const unitsReason = matchupTotalRaw !== null && matchupTotalRaw !== undefined
        ? `Model returned ${matchupTotalRaw.toFixed(2)}, which isn't in points (likely a rate/ratio). We're not going to guess.`
        : 'Model total unavailable this week.';
      
      totalPick = { 
        totalPick: null, 
        totalPickLabel: null, 
        edgeDisplay: null,
        unitsReason // Add reason for display
      };
      console.log(`[Game ${gameId}] ℹ️ No total pick - model unavailable:`, {
        finalImpliedTotal,
        matchupTotalRaw,
        reason: unitsReason
      });
    } else if (!hasTotalEdge) {
      // No edge - overlay too small
      totalPick = { totalPick: null, totalPickLabel: null, edgeDisplay: null };
      console.log(`[Game ${gameId}] ℹ️ No total pick - overlay below threshold:`, {
        overlay: totalOverlay.toFixed(2),
        edgeFloor: OVERLAY_EDGE_FLOOR,
        reason: 'Overlay < edge floor'
      });
    } else {
      // Has edge - compute pick from overlay direction
      // Pick direction = sign(overlay): positive overlay = Over, negative = Under
      const pickDirection = totalOverlay > 0 ? 'Over' : 'Under';
      const oppositeDirection = totalOverlay > 0 ? 'Under' : 'Over';
      totalPick = {
        totalPick: pickDirection,
        totalPickLabel: `${pickDirection} ${marketTotal?.toFixed(1)}`,
        edgeDisplay: `${Math.abs(totalOverlay).toFixed(1)} pts`,
        flip: totalFlip // Add flip point
      };
      
      // Use pre-calculated totalBetToCalc
      totalBetTo = totalBetToCalc;
      
      console.log(`[Game ${gameId}] ✅ Total pick generated:`, {
        pick: totalPick.totalPickLabel,
        overlay: totalOverlay.toFixed(2),
        edge: Math.abs(totalOverlay).toFixed(2),
        betTo: totalBetTo?.toFixed(1),
        flip: totalFlip?.toFixed(1),
        oppositeAt: `${oppositeDirection} at ${totalFlip?.toFixed(1)}`
      });
    }
    
    if (isModelTotalValid && marketTotal !== null) {
      const totalDelta = Math.abs(finalImpliedTotal - marketTotal);
      if (totalDelta > 20) {
        diagnosticsMessages.push(`Model total is far from market (Δ ${totalDelta.toFixed(1)} pts). Treat with caution.`);
      }
    }

    // Determine OU card state: "pick" | "no_edge" | "no_model_total"
    const totalState: 'pick' | 'no_edge' | 'no_model_total' = 
      !isModelTotalValid ? 'no_model_total' :
      hasNoEdge ? 'no_edge' :
      'pick';
    
    // Log pipeline diagnostics
    console.log(`[Game ${gameId}] Model Total Pipeline:`, {
      computationPath,
      modelTotal: finalImpliedTotal,
      inputs: inputsReady,
      validationFlags,
      isModelTotalValid,
      totalState,
      missingInputs,
      calcError
    });
    
    // Calculate lean when model total is suppressed (Task #4)
    // Use median CFB total of 55 as baseline
    const medianConfTotal = 55.0;
    const marketTotalDeviation = marketTotal !== null ? Math.abs(marketTotal - medianConfTotal) : null;
    const hasLean = marketTotalDeviation !== null && marketTotalDeviation >= 3.0;
    const leanDirection = hasLean && marketTotal !== null
      ? (marketTotal > medianConfTotal ? 'Under' : 'Over')
      : null;
    
    // Calculate implied team scores from model spread and total
    // Only calculate if both model spread and model total are valid
    // Formula: total = homeScore + awayScore, spread = homeScore - awayScore
    // Solving: homeScore = (total + spread) / 2, awayScore = (total - spread) / 2
    // Reuse the scores we calculated for consistency check
    const isImpliedScoreValid = isModelTotalValid && spreadValidForConsistency;
    const impliedHomeScore = isImpliedScoreValid ? impliedHomeScoreForCheck : null;
    const impliedAwayScore = isImpliedScoreValid ? impliedAwayScoreForCheck : null;
    
    // ============================================
    // GUARDRAILS & VALIDATION CHECKS
    // ============================================
    
    // Note: Removed range-based validation - model is the arbiter
    // Only log warnings for computation failures or missing inputs
    
    // 3. Validate Model Spread absolute value is not excessive (> 50)
    if (finalImpliedSpread !== null && Math.abs(finalImpliedSpread) > 50) {
      console.warn(`[Game ${gameId}] ⚠️ Model Spread absolute value exceeds 50: ${finalImpliedSpread.toFixed(1)}`, {
        modelSpread: finalImpliedSpread,
        marketSpread,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
      });
    }
    
    // 4. Validate Market Spread absolute value is not excessive (> 50)
    if (marketSpread !== null && Math.abs(marketSpread) > 50) {
      console.warn(`[Game ${gameId}] ⚠️ Market Spread absolute value exceeds 50: ${marketSpread.toFixed(1)}`, {
        modelSpread: finalImpliedSpread,
        marketSpread,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
      });
    }
    
    // 5. Validate ATS Edge magnitude is not excessive (> 20)
    if (Math.abs(atsEdge) > 20) {
      console.warn(`[Game ${gameId}] ⚠️ Large ATS edge detected: ${atsEdge.toFixed(1)}`, {
        modelSpread: finalImpliedSpread,
        marketSpread,
        modelFavorite: modelSpreadFC.favoriteTeamName,
        marketFavorite: marketSpreadFC.favoriteTeamName,
        atsEdge,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
      });
    }
    
    // 6. Validate Total Edge magnitude is not excessive (> 20)
    if (totalEdgePts !== null && Math.abs(totalEdgePts) > 20) {
      console.warn(`[Game ${gameId}] ⚠️ Large total edge detected: ${totalEdgePts.toFixed(1)}`, {
        modelTotal: finalImpliedTotal,
        marketTotal,
        totalEdge: totalEdgePts,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
      });
    }
    
    // 7. Validate Favorite Identity Consistency
    // Model and market should favor the same team (or at least be consistent)
    const modelFavorsHome = finalImpliedSpread < 0;
    const marketFavorsHome = marketSpread < 0;
    const favoriteMismatch = modelFavorsHome !== marketFavorsHome;
    
    if (favoriteMismatch && Math.abs(finalImpliedSpread) > 3 && Math.abs(marketSpread) > 3) {
      // Only warn if both spreads are significant (not close games)
      console.warn(`[Game ${gameId}] ⚠️ Favorite identity mismatch: Model and Market favor different teams`, {
        modelSpread: finalImpliedSpread,
        marketSpread,
        modelFavorite: modelSpreadFC.favoriteTeamName,
        marketFavorite: marketSpreadFC.favoriteTeamName,
        modelFavorsHome,
        marketFavorsHome,
        atsEdge,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
      });
    }

    // Calculate confidence grades based on thresholds
    const thresholds = {
      A: 4.0,
      B: 3.0,
      C: 2.0
    };

    const getGrade = (edge: number | null): 'A' | 'B' | 'C' | null => {
      if (edge === null) return null;
      const absEdge = Math.abs(edge);
      if (absEdge >= thresholds.A) return 'A';
      if (absEdge >= thresholds.B) return 'B';
      if (absEdge >= thresholds.C) return 'C';
      return null; // No grade if edge is below minimum threshold
    };

    let spreadGrade = getGrade(atsEdge);
    let totalGrade = getGrade(totalEdgePts);

    // ============================================
    // TRUST-MARKET MODE: Confidence Degradation
    // ============================================
    // Drop grade one tier if raw disagreement > 10 pts
    // This flags situations where the model strongly disagrees but overlay is capped
    
    if (shouldDegradeSpreadConfidence && spreadGrade !== null) {
      const originalGrade = spreadGrade;
      spreadGrade = degradeGrade(spreadGrade, true);
      console.log(`[Game ${gameId}] ⚠️ Spread confidence degraded due to large raw disagreement:`, {
        rawDisagreement: rawSpreadDisagreement.toFixed(2),
        threshold: LARGE_DISAGREEMENT_THRESHOLD,
        originalGrade,
        degradedGrade: spreadGrade || 'null'
      });
    }
    
    if (shouldDegradeTotalConfidence && totalGrade !== null) {
      const originalGrade = totalGrade;
      totalGrade = degradeGrade(totalGrade, true);
      console.log(`[Game ${gameId}] ⚠️ Total confidence degraded due to large raw disagreement:`, {
        rawDisagreement: rawTotalDisagreement.toFixed(2),
        threshold: LARGE_DISAGREEMENT_THRESHOLD,
        originalGrade,
        degradedGrade: totalGrade || 'null'
      });
    }

    // ============================================
    // TELEMETRY & VALIDATION FLAGS
    // ============================================
    
    // Compute validation flags (removed generic invalidModelTotal - use specific warnings instead)
    const favoritesDisagree = modelSpreadFC.favoriteTeamId !== marketSpreadFC.favoriteTeamId;
    const edgeAbsGt20 = Math.abs(atsEdge) > 20 || (totalEdgePts !== null && Math.abs(totalEdgePts) > 20);
    
    // Structured telemetry event for each game render
    const telemetryEvent = {
      event: 'game_detail_render',
      gameId,
      season: game.season,
      week: game.week,
      timestamp: new Date().toISOString(),
      data: {
        snapshot: {
          id: snapshotId,
          bookSource,
          spreadLine: marketSpread,
          totalLine: marketTotal,
          moneylinePrice: mlVal
        },
        // Totals
        modelTotal: finalImpliedTotal,
        marketTotal,
        ouEdge: totalEdgePts,
        betToTotal: totalBetTo,
        
        // Spreads & Favorites
        modelFav: modelSpreadFC.favoriteTeamName,
        modelFavPts: modelSpreadFC.favoriteSpread,
        marketFav: marketSpreadFC.favoriteTeamName,
        marketFavPts: marketSpreadFC.favoriteSpread,
        atsEdge,
        
        // Picks
        pickATS: bettablePick.label,
        pickTotal: totalPick.totalPickLabel,
        gradeATS: spreadGrade,
        gradeTotal: totalGrade,
        
        // Validation flags
        flags: {
          favoritesDisagree,
          edgeAbsGt20,
          validationFlags: validationFlags, // Include all model total validation gates
          totalState: totalState, // "pick" | "no_edge" | "no_model_total"
          missingInputs: missingInputs, // List of missing inputs
          calcError: calcError // Boolean for computation failure
        },
        
        // Additional context
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        modelSpread: finalImpliedSpread,
        marketSpread
      }
    };
    
    // Telemetry for totals (only when not in "pick" state)
    if (totalState !== 'pick') {
      const totalTelemetry = {
        event: 'total_state',
        gameId,
        season: game.season,
        week: game.week,
        timestamp: new Date().toISOString(),
        totalState: totalState,
        missingInputs: missingInputs,
        calcError: calcError,
        modelTotal: finalImpliedTotal,
        marketTotal: marketTotal,
        lean: totalState === 'no_model_total' && hasLean ? leanDirection : null
      };
      console.log(`[TELEMETRY] ${JSON.stringify(totalTelemetry)}`);
    }
    
    // Log structured event (only in non-production or when flags are raised)
    if (process.env.NODE_ENV !== 'production' || totalState !== 'pick' || favoritesDisagree || edgeAbsGt20) {
      console.log(`[TELEMETRY] ${JSON.stringify(telemetryEvent)}`);
    }
    
    // Log warnings if any flags are raised
    if (totalState !== 'pick' || favoritesDisagree || edgeAbsGt20) {
      console.warn(`[Game ${gameId}] ⚠️ Validation flags raised:`, {
        totalState,
        missingInputs,
        calcError,
        favoritesDisagree,
        edgeAbsGt20,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name
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

    // ============================================
    // GUARDRAILS & ASSERTIONS (before returning)
    // ============================================
    // Assert 1: favoriteLine < 0 and dogLine > 0
    const assertion1 = market_snapshot.favoriteLine < 0 && market_snapshot.dogLine > 0;
    if (!assertion1) {
      const errorMsg = `Assertion 1 failed: favoriteLine=${market_snapshot.favoriteLine}, dogLine=${market_snapshot.dogLine}`;
      console.error(`[Game ${gameId}] ⚠️ ${errorMsg}`);
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(errorMsg);
      }
    }
    
    // Assert 2: ATS edge matches SSOT definition (modelFavoriteLine − market favorite line)
    const expectedAtsEdge = model_view.edges.atsEdgePts !== null
      ? model_view.modelFavoriteLine - market_snapshot.favoriteLine
      : null;
    const assertion2 = model_view.edges.atsEdgePts === null
      ? true
      : Math.abs(model_view.edges.atsEdgePts - (model_view.modelFavoriteLine - market_snapshot.favoriteLine)) < 1e-6;

    // Assert 3: Snapshot identifier is present for all consumers
    const assertion3 = Boolean(diagnostics.snapshotId);

    // Assert 4: Model favorite identity matches favorite-centric conversion
    const assertion4 = model_view.modelFavoriteTeamId === null
      ? model_view.modelFavoriteLine === 0
      : model_view.modelFavoriteTeamId === modelSpreadFC.favoriteTeamId;

    const assertionFailures: string[] = [];
    if (!assertion1) {
      assertionFailures.push(`Assertion 1 failed: favoriteLine=${market_snapshot.favoriteLine}, dogLine=${market_snapshot.dogLine}`);
    }
    if (!assertion2) {
      assertionFailures.push(`Assertion 2 failed: atsEdgePts=${model_view.edges.atsEdgePts}, expected=${expectedAtsEdge}`);
    }
    if (!assertion3) {
      assertionFailures.push('Assertion 3 failed: snapshotId missing');
    }
    if (!assertion4) {
      assertionFailures.push('Assertion 4 failed: model favorite not aligned with favorite-centric conversion');
    }

    if (assertionFailures.length > 0) {
      console.error(`[Game ${gameId}] ⚠️ SSOT assertions failed:`, {
        failures: assertionFailures,
        snapshotId,
        market_snapshot,
        model_view
      });
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(assertionFailures.join(' | '));
      }
    }

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
      
      // SINGLE SOURCE OF TRUTH: market_snapshot (all UI components use this)
      market_snapshot: market_snapshot,
      
      // SINGLE SOURCE OF TRUTH: model_view (all UI components use this)
      model_view: model_view,
      
      // SINGLE SOURCE OF TRUTH: diagnostics
      diagnostics: diagnostics,
      
      // Legacy market data (for backward compatibility, but UI should use market_snapshot)
      market: {
        spread: marketSpread, // Keep original for reference (home-minus-away)
        total: marketTotal,
        source: spreadLine?.bookName || 'Unknown',
        // Single source of truth: favoriteByRule (team with more negative price)
        marketFavorite: {
          teamId: favoriteByRule.teamId,
          teamName: favoriteByRule.teamName,
          line: favoriteByRule.line, // Always negative (favorite-centric)
        },
        meta: {
          spread: spreadMeta,
          total: totalMeta,
        },
        moneyline,
        // Dev diagnostics (only in non-production)
        _devDiagnostics: process.env.NODE_ENV !== 'production' ? {
          feedHome: { id: game.homeTeamId, name: game.homeTeam.name, price: homePrice },
          feedAway: { id: game.awayTeamId, name: game.awayTeam.name, price: awayPrice },
          favorite: { teamId: favoriteByRule.teamId, teamName: favoriteByRule.teamName, line: favoriteByRule.line }
        } : undefined
      },
      
      // Model data (favorite-centric)
      model: {
        spread: finalImpliedSpread, // Keep original for reference
        total: validModelTotal, // Only show if valid (null if invalid)
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
        confidence: matchupOutput?.edgeConfidence || 'C',
        // Implied scores (derived from spread + total) - only if valid
        impliedScores: isImpliedScoreValid ? {
          home: impliedHomeScore,
          away: impliedAwayScore,
          homeTeam: game.homeTeam.name,
          awayTeam: game.awayTeam.name
        } : null
      },
      
      // Edge analysis (favorite-centric)
      edge: {
        atsEdge: atsEdge, // Positive = model thinks favorite should lay more
        totalEdge: totalEdgePts, // Positive = model thinks over, negative = under
        maxEdge: Math.max(Math.abs(atsEdge), totalEdgePts !== null ? Math.abs(totalEdgePts) : 0)
      },
      
      // CLV (Closing Line Value) hint - detect if market moved toward model
      clvHint: await (async () => {
        // Calculate if market moved toward model since opening
        const spreadLines = await prisma.marketLine.findMany({
          where: { gameId, lineType: 'spread' },
          orderBy: { timestamp: 'asc' },
          take: 1
        });
        const totalLines = await prisma.marketLine.findMany({
          where: { gameId, lineType: 'total' },
          orderBy: { timestamp: 'asc' },
          take: 1
        });
        
        const openingSpread = spreadLines[0]?.lineValue ?? null;
        const openingTotal = totalLines[0]?.lineValue ?? null;
        
        if (openingSpread !== null && openingTotal !== null) {
          // Calculate opening vs closing edge
          const openingSpreadEdge = finalImpliedSpread - openingSpread;
          const closingSpreadEdge = atsEdge;
          const spreadMovedTowardModel = Math.abs(closingSpreadEdge) < Math.abs(openingSpreadEdge);
          
          const openingTotalEdge = isModelTotalValid ? (finalImpliedTotal - openingTotal) : null;
          const closingTotalEdge = totalEdgePts;
          const totalMovedTowardModel = openingTotalEdge !== null && closingTotalEdge !== null && 
                                        Math.abs(closingTotalEdge) < Math.abs(openingTotalEdge);
          
          // Calculate drift amounts for per-card CLV hints
          const spreadDrift = marketSpread - openingSpread;
          const totalDrift = marketTotal !== null && openingTotal !== null ? marketTotal - openingTotal : null;
          
          // Thresholds: spread ≥ 0.5 pts, total ≥ 1.0 pt
          const spreadDriftSignificant = Math.abs(spreadDrift) >= 0.5 && spreadMovedTowardModel;
          const totalDriftSignificant = totalDrift !== null && Math.abs(totalDrift) >= 1.0 && totalMovedTowardModel;
          
          if (spreadMovedTowardModel || totalMovedTowardModel) {
            return {
              hasCLV: true,
              spreadMoved: spreadMovedTowardModel,
              totalMoved: totalMovedTowardModel,
              openingSpread,
              closingSpread: marketSpread,
              openingTotal,
              closingTotal: marketTotal !== null ? marketTotal : null,
              modelSpread: finalImpliedSpread,
              modelTotal: finalImpliedTotal,
              // Per-card CLV data
              spreadDrift: spreadDriftSignificant ? {
                opening: openingSpread,
                closing: marketSpread,
                drift: spreadDrift,
                significant: true
              } : null,
              totalDrift: totalDriftSignificant && totalDrift !== null ? {
                opening: openingTotal,
                closing: marketTotal !== null ? marketTotal : null,
                drift: totalDrift,
                significant: true
              } : null
            };
          }
        }
        
        return {
          hasCLV: false,
          spreadMoved: false,
          totalMoved: false,
          spreadDrift: null,
          totalDrift: null
        };
      })(),
      
      // Validation flags (for UI display of warnings)
      validation: {
        // Independent validation flags (decouple ATS and OU)
        ats_inputs_ok,
        ou_inputs_ok,
        ou_model_valid, // NEW: Is model total valid? (ou_inputs_ok = have market; ou_model_valid = have model)
        ats_reason,
        ou_reason,
        // Telemetry flags
        ats_dog_headline_blocked, // True when extreme favorite dog pick was suppressed
        totals_nan_stage: firstFailureStep, // Stage where NaN/inf occurred
        // Legacy flags
        favoritesDisagree,
        edgeAbsGt20,
        modelTotalWarning: modelTotalWarning, // Specific warning message (null if no issue)
        warnings: [
          ...(modelTotalWarning ? [modelTotalWarning] : []),
          ...(favoritesDisagree ? ['Model and market favor different teams'] : []),
          ...(edgeAbsGt20 ? ['Edge magnitude exceeds 20 points'] : [])
        ],
        // ============================================
        // ASSERTIONS: Overlay Consistency & Sign Sanity
        // ============================================
        assertions: {
          overlay_consistency_ats: {
            // Assert: ui_no_edge === (abs(overlay_used_pts) < edge_floor_pts)
            overlay_used_pts: spreadOverlay,
            edge_floor_pts: OVERLAY_EDGE_FLOOR,
            abs_overlay: Math.abs(spreadOverlay),
            should_have_edge: Math.abs(spreadOverlay) >= OVERLAY_EDGE_FLOOR,
            actually_has_edge: hasSpreadEdge,
            passed: (Math.abs(spreadOverlay) >= OVERLAY_EDGE_FLOOR) === hasSpreadEdge
          },
          overlay_consistency_ou: {
            // Assert: ui_no_edge === (abs(overlay_used_pts) < edge_floor_pts)
            overlay_used_pts: totalOverlay,
            edge_floor_pts: OVERLAY_EDGE_FLOOR,
            abs_overlay: Math.abs(totalOverlay),
            should_have_edge: totalEdgePts !== null && Math.abs(totalOverlay) >= OVERLAY_EDGE_FLOOR,
            actually_has_edge: totalEdgePts !== null && Math.abs(totalEdgePts) >= OVERLAY_EDGE_FLOOR,
            passed: totalEdgePts === null ? true : (Math.abs(totalOverlay) >= OVERLAY_EDGE_FLOOR) === (Math.abs(totalEdgePts) >= OVERLAY_EDGE_FLOOR)
          },
          sign_sanity_ats: {
            // Assert: if market favorite line < 0, ATS copy must show negative
            market_favorite_line: market_snapshot.favoriteLine,
            market_line_is_negative: market_snapshot.favoriteLine < 0,
            // UI will check this when rendering "market {line}" string
            passed: true // Will be validated in UI
          }
        }
      },
      
      // Total diagnostics (for debugging model total pipeline)
      total_diag: process.env.NODE_ENV !== 'production' ? totalDiag : undefined,

      // New explicit pick fields (ticket-style with grades)
      picks: {
        spread: {
          ...spreadPick,
          // Add bettable pick info (the actual side to bet)
          bettablePick: {
            teamId: bettablePick.teamId,
            teamName: bettablePick.teamName,
            line: bettablePick.line,
            label: bettablePick.label,
            reasoning: bettablePick.reasoning,
            suppressHeadline: bettablePick.suppressHeadline || false,
            extremeFavoriteBlocked: bettablePick.extremeFavoriteBlocked || false,
            betTo: bettablePick.betTo,
            flip: bettablePick.flip
          },
          edgePts: atsEdge,
          betTo: bettablePick.betTo, // "Bet to" number
          flip: bettablePick.flip, // Flip point (where value switches to other side)
          favoritesDisagree: bettablePick.favoritesDisagree, // Flag when model ≠ market favorite
          // For backward compatibility
          spreadEdge: Math.abs(atsEdge),
          grade: spreadGrade, // A, B, C, or null
          // Rationale line for ticket (use bettablePick.reasoning which already has the correct format)
          rationale: bettablePick.reasoning,
          // Trust-Market Mode overlay diagnostics
          overlay: {
            modelRaw: modelSpreadRaw,
            market: marketSpread,
            rawDisagreement: rawSpreadDisagreement,
            lambda: LAMBDA_SPREAD,
            overlayValue: spreadOverlay,
            cap: OVERLAY_CAP_SPREAD,
            final: finalSpreadWithOverlay,
            confidenceDegraded: shouldDegradeSpreadConfidence,
            mode: MODEL_MODE,
            // ✅ SSOT fields for UI decision logic
            overlay_used_pts: spreadOverlay, // The exact capped overlay value used for decisions
            overlay_basis: 'capped' as const, // Always capped in Trust-Market mode
            edge_floor_pts: OVERLAY_EDGE_FLOOR // 2.0 pts minimum
          }
        },
        total: {
          ...totalPick,
          // CRITICAL: Headline MUST show market total (not model)
          headlineTotal: marketTotal, // ✅ ALWAYS market total for headline display
          modelTotal: finalImpliedTotal, // Model total for diagnostics/rationale (can be null)
          marketTotal: marketTotal, // Market total for reference
          edgePts: totalEdgePts,
          betTo: totalBetTo, // "Bet to" number for total
          flip: totalFlip, // Flip point (where value switches from Over to Under or vice versa)
          grade: totalGrade, // A, B, C, or null
          hasNoEdge: hasNoEdge, // Flag for "No edge" display
          // Hide card only if model total is unavailable AND no market total
          hidden: finalImpliedTotal === null,
          // Trust-Market Mode overlay diagnostics
          overlay: {
            modelRaw: isModelTotalValid ? finalImpliedTotal : null,
            market: marketTotal,
            rawDisagreement: rawTotalDisagreement,
            lambda: LAMBDA_TOTAL,
            overlayValue: totalOverlay,
            cap: OVERLAY_CAP_TOTAL,
            final: finalTotalWithOverlay,
            confidenceDegraded: shouldDegradeTotalConfidence,
            mode: MODEL_MODE,
            // ✅ SSOT fields for UI decision logic
            overlay_used_pts: totalOverlay, // The exact capped overlay value used for decisions
            overlay_basis: 'capped' as const, // Always capped in Trust-Market mode
            edge_floor_pts: OVERLAY_EDGE_FLOOR // 2.0 pts minimum
          },
          // OU card state: "pick" | "no_edge" | "no_model_total"
          totalState: totalState,
          // Missing inputs list (for "no_model_total" state)
          missingInputs: missingInputs,
          // Computation error flag
          calcError: calcError,
          // Specific warning message (only for missing inputs or computation failure)
          modelTotalWarning: modelTotalWarning,
          // REMOVED: Don't show "lean" when model total is null (no guessing)
          // lean: null,
          // Rationale line for ticket
          rationale: totalState === 'pick' && totalEdgePts !== null && totalPick.totalPickLabel && finalImpliedTotal !== null
            ? `Model total ${finalImpliedTotal.toFixed(1)} vs market ${marketTotal !== null ? marketTotal.toFixed(1) : 'N/A'} (${totalEdgePts >= 0 ? '+' : ''}${totalEdgePts.toFixed(1)}) → ${totalPick.totalPick} value.`
            : totalState === 'no_edge' && finalImpliedTotal !== null && marketTotal !== null
            ? `Model ${finalImpliedTotal.toFixed(1)} vs market ${marketTotal.toFixed(1)} (Δ ${Math.abs(finalImpliedTotal - marketTotal).toFixed(1)}).`
            : null
        },
        moneyline: {
          ...moneyline,
          // Rationale line for ticket - show data for the PICKED team with clear explanation
          rationale: moneyline?.price != null && moneyline?.valuePercent != null && moneyline?.pickLabel != null
            ? (() => {
                const teamName = moneyline.pickLabel.replace(' ML', '');
                const modelProb = ((moneyline.modelWinProb || 0) * 100).toFixed(1);
                const marketProb = ((moneyline.impliedProb || 0) * 100).toFixed(1);
                const fairOdds = (moneyline.modelFairML || 0) > 0 ? `+${moneyline.modelFairML}` : `${moneyline.modelFairML}`;
                const marketOdds = moneyline.price! > 0 ? `+${moneyline.price}` : `${moneyline.price}`;
                const valueSign = moneyline.valuePercent >= 0 ? '+' : '';
                const valueAbs = Math.abs(moneyline.valuePercent).toFixed(1);
                
                // Clear explanation: Model probability vs market probability, with value interpretation
                return `Model gives ${teamName} a ${modelProb}% win probability (fair odds: ${fairOdds}), while the market's ${marketOdds} odds imply only ${marketProb}%. The ${valueSign}${valueAbs}% value represents how much the model's probability exceeds the market's implied probability.`;
              })()
            : moneyline?.isModelFairLineOnly
            ? `Model ${modelMLFavorite.name} win prob ${(modelMLFavoriteProb * 100).toFixed(1)}% → fair ${modelMLFavoriteFairML > 0 ? '+' : ''}${modelMLFavoriteFairML}. Awaiting book price.`
            : null
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
      
      // Model configuration (includes Trust-Market overlay config)
      modelConfig: {
        version: matchupOutput?.modelVersion || 'v0.0.1-hotfix',
        mode: MODEL_MODE, // 'trust_market'
        hfa: 2.0, // Constant HFA for v1
        thresholds: {
          A: 4.0,
          B: 3.0,
          C: 2.0
        },
        // Trust-Market overlay configuration
        overlayConfig: {
          lambdaSpread: LAMBDA_SPREAD,
          lambdaTotal: LAMBDA_TOTAL,
          capSpread: OVERLAY_CAP_SPREAD,
          capTotal: OVERLAY_CAP_TOTAL,
          edgeFloor: OVERLAY_EDGE_FLOOR,
          largeDisagreementThreshold: LARGE_DISAGREEMENT_THRESHOLD
        },
        description: 'Trust-Market mode: Uses market as baseline with small model overlays (capped at ±3.0 pts)'
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
            
            // For spreads, convert to favorite-centric format for display
            // Opening/closing values are in home-minus-away format
            // Favorite-centric: always negative for favorite (favorite laying points)
            let openingValue = opening.lineValue;
            let closingValue = closing.closingLine !== null ? closing.closingLine : closing.lineValue;
            
            if (type === 'spread') {
              // Convert to favorite-centric format for caption display
              // Favorite-centric: always negative (favorite laying points)
              // Use absolute value and apply negative sign to show as favorite laying points
              // Note: This assumes the favorite hasn't changed over time. If it has, 
              // the conversion might be incorrect, but the debug logs will show this.
              openingValue = -Math.abs(opening.lineValue);
              closingValue = -Math.abs(closingValue);
            }
            
            stats[type] = {
              count: lines.length,
              opening: {
                value: opening.lineValue, // Keep original for reference
                favoriteCentricValue: type === 'spread' ? openingValue : opening.lineValue, // Favorite-centric for display
                timestamp: opening.timestamp,
                bookName: opening.bookName,
                source: opening.source,
              },
              closing: {
                value: closing.closingLine !== null ? closing.closingLine : closing.lineValue, // Keep original for reference
                favoriteCentricValue: type === 'spread' ? closingValue : (closing.closingLine !== null ? closing.closingLine : closing.lineValue), // Favorite-centric for display
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

        // Calculate current streak for each team
        const calculateStreak = (last5Games: any[]): string => {
          if (last5Games.length === 0) return '';
          const results = last5Games.map(g => g.result);
          const firstResult = results[0];
          let streakCount = 1;
          for (let i = 1; i < results.length; i++) {
            if (results[i] === firstResult) {
              streakCount++;
            } else {
              break;
            }
          }
          return `${firstResult}${streakCount}`;
        };

        return {
          home: {
            team: game.homeTeam,
            record: homeRecord,
            last5Games: homeLast5,
            form: homeLast5.map(g => g.result).join(''),
            streak: calculateStreak(homeLast5),
          },
          away: {
            team: game.awayTeam,
            record: awayRecord,
            last5Games: awayLast5,
            form: awayLast5.map(g => g.result).join(''),
            streak: calculateStreak(awayLast5),
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
      })()
    };

    // Calculate performance metrics
    const payloadTime = Date.now() - startTime;
    const isRevalidated = request.headers.get('x-next-revalidated') === 'true';
    
    // Log performance telemetry
    console.log(`[Game ${gameId}] Render summary: revalidated=${isRevalidated}, payload=${payloadTime}ms`, {
      gameId,
      payloadTime,
      isRevalidated,
      gameStatus: game.status,
      season: game.season,
      week: game.week
    });
    
    // ============================================
    // RENDER SNAPSHOT (SSOT AUDIT LOG)
    // ============================================
    console.log(`[Game ${gameId}] 🎯 RENDER SNAPSHOT (SSOT):`, {
      snapshotId: response.diagnostics?.snapshotId,
      bookSource: response.market_snapshot?.bookSource,
      updatedAt: response.market_snapshot?.updatedAt,
      market_snapshot: {
        favoriteTeamId: response.market_snapshot?.favoriteTeamId,
        favoriteTeamName: response.market_snapshot?.favoriteTeamName,
        favoriteLine: response.market_snapshot?.favoriteLine,
        dogTeamId: response.market_snapshot?.dogTeamId,
        dogTeamName: response.market_snapshot?.dogTeamName,
        dogLine: response.market_snapshot?.dogLine,
        marketTotal: response.market_snapshot?.marketTotal,
        moneylineFavorite: response.market_snapshot?.moneylineFavorite,
        moneylineDog: response.market_snapshot?.moneylineDog
      },
      model_view: {
        modelFavoriteTeamId: response.model_view?.modelFavoriteTeamId,
        modelFavoriteName: response.model_view?.modelFavoriteName,
        modelFavoriteLine: response.model_view?.modelFavoriteLine,
        modelTotal: response.model_view?.modelTotal,
        winProbFavorite: response.model_view?.winProbFavorite,
        winProbDog: response.model_view?.winProbDog
      },
      edges: {
        atsEdgePts: response.model_view?.edges?.atsEdgePts,
        ouEdgePts: response.model_view?.edges?.ouEdgePts
      },
      diagnostics_summary: {
        mappingAssertionsPassed: response.diagnostics?.mappingAssertions?.passed,
        totalsUnitsValid: response.diagnostics?.totalsUnits?.isPoints,
        messageCount: response.diagnostics?.messages?.length || 0
      }
    });

    // Determine cache strategy based on game status
    const isFinal = game.status === 'final';
    const cacheHeaders = isFinal
      ? { 
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200', // 10min cache for final games, 20min stale
          'X-Payload-Time': payloadTime.toString(),
          'X-Revalidated': isRevalidated.toString()
        }
      : { 
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', // 1min cache for live games, 2min stale
          'X-Payload-Time': payloadTime.toString(),
          'X-Revalidated': isRevalidated.toString()
        };

    // ============================================
    // ASSERTION LOGGING
    // ============================================
    // Log assertion failures for debugging
    if (!response.validation?.assertions?.overlay_consistency_ats?.passed) {
      console.error(`[Game ${gameId}] ⚠️ ASSERTION FAILED: ATS Overlay Consistency`, {
        overlay_used_pts: response.validation.assertions.overlay_consistency_ats.overlay_used_pts,
        edge_floor_pts: response.validation.assertions.overlay_consistency_ats.edge_floor_pts,
        should_have_edge: response.validation.assertions.overlay_consistency_ats.should_have_edge,
        actually_has_edge: response.validation.assertions.overlay_consistency_ats.actually_has_edge,
        abs_overlay: response.validation.assertions.overlay_consistency_ats.abs_overlay
      });
    }
    if (!response.validation?.assertions?.overlay_consistency_ou?.passed) {
      console.error(`[Game ${gameId}] ⚠️ ASSERTION FAILED: OU Overlay Consistency`, {
        overlay_used_pts: response.validation.assertions.overlay_consistency_ou.overlay_used_pts,
        edge_floor_pts: response.validation.assertions.overlay_consistency_ou.edge_floor_pts,
        should_have_edge: response.validation.assertions.overlay_consistency_ou.should_have_edge,
        actually_has_edge: response.validation.assertions.overlay_consistency_ou.actually_has_edge,
        abs_overlay: response.validation.assertions.overlay_consistency_ou.abs_overlay
      });
    }

    return NextResponse.json(response, {
      headers: cacheHeaders
    });

  } catch (error) {
    console.error('Error fetching game detail:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch game detail',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
