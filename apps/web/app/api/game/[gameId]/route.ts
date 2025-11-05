/**
 * M3 Game Detail API Route
 * 
 * Returns detailed game information including factor breakdown from components_json.
 */

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick, convertToFavoriteCentric, computeATSEdge, computeBettableSpreadPick, computeTotalBetTo } from '@/lib/pick-helpers';
import { pickMarketLine, getLineValue, pickMoneyline, americanToProb } from '@/lib/market-line-helpers';
import { NextResponse } from 'next/server';

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
      return NextResponse.json(
        { success: false, error: 'Game not found' },
        { status: 404 }
      );
    }

    const matchupOutput = game.matchupOutputs[0];
    
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
      
      // CRITICAL FIX: For spreads, always pick the NEGATIVE line (favorite's line)
      // The database stores TWO spread lines per game (one for each team)
      // We must pick the favorite's line (negative value) as the canonical representation
      let candidates = lines;
      if (lineType === 'spread') {
        // Log all spread lines for debugging
        console.log(`[Game ${gameId}] 🔍 SPREAD LINE SELECTION:`, {
          totalLines: lines.length,
          allValues: lines.map(l => ({
            lineValue: l.lineValue,
            closingLine: l.closingLine,
            timestamp: l.timestamp,
            bookName: l.bookName
          }))
        });
        
        const negativeLines = lines.filter((line) => {
          const value = line.closingLine !== null && line.closingLine !== undefined ? line.closingLine : line.lineValue;
          return value !== null && value !== undefined && value < 0;
        });
        
        console.log(`[Game ${gameId}] 🔍 NEGATIVE LINES FILTERED:`, {
          negativeCount: negativeLines.length,
          negativeValues: negativeLines.map(l => ({
            lineValue: l.lineValue,
            closingLine: l.closingLine,
            timestamp: l.timestamp
          }))
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
        console.log(`[Game ${gameId}] ✅ SELECTED SPREAD LINE:`, {
          lineValue: selected.lineValue,
          closingLine: selected.closingLine,
          bookName: selected.bookName,
          timestamp: selected.timestamp
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

    let bestCoverageScore = -1;
    let bestLatestTimestamp = 0;

    groupedByBook.forEach((group) => {
      const spreadCandidate = pickPreferredLine(group.spreadLines, 'spread');
      const totalCandidate = pickPreferredLine(group.totalLines, 'total');
      const moneylineCandidate = pickPreferredLine(group.moneylineLines, 'moneyline');

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
        selectedSpreadLine = spreadCandidate;
        selectedTotalLine = totalCandidate;
        selectedMoneylineLine = moneylineCandidate;
        selectedGroupSource = group.source || null;
        selectedGroupBook = group.bookName || null;
        selectedGroupTimestamp = latestTimestamp;
      }
    });

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
    let computedTotal = matchupOutput?.impliedTotal || 45;
    
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
      source: matchupOutput ? 'matchupOutput (pre-calculated)' : 'fallback (default 45)',
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
    
    // Never use matchupOutput.impliedTotal unless it passes the units handshake
    // Only use computedTotal if matchupOutput fails validation
    const finalImpliedTotal = (isValidTotal ? matchupTotalRaw : null) ?? computedTotal;
    
    // Track which source we're using and if units failed
    let totalSource = 'unknown';
    let firstFailureStep: string | null = null;
    if (isValidTotal && matchupTotalRaw !== null) {
      totalSource = 'matchupOutput';
    } else if (computedTotal !== null && !isNaN(computedTotal) && isFinite(computedTotal)) {
      totalSource = 'computed';
      // Check if computedTotal passes units validation
      if (computedTotal < 15 || computedTotal > 120) {
        firstFailureStep = 'modelTotal_sum';
        totalDiag.firstFailureStep = firstFailureStep;
        totalDiag.unitsInvalid = true;
      }
    } else {
      firstFailureStep = 'all';
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
      console.warn(`[Game ${gameId}] ⚠️ Invalid matchupOutput.impliedTotal (${matchupOutput.impliedTotal}), using computed total: ${computedTotal.toFixed(1)}`, {
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

    // CRITICAL FIX: The database stores BOTH spread lines (one for each team)
    // but doesn't track which team each line belongs to.
    // We need to use power ratings to determine which team SHOULD be favored,
    // then assign the negative line to that team.
    
    // Get all spread lines for this game from the same book/timestamp
    const allSpreadLines = game.marketLines.filter(
      (l) => l.lineType === 'spread' && 
             l.bookName === spreadLine.bookName &&
             Math.abs(new Date(l.timestamp).getTime() - new Date(spreadLine.timestamp).getTime()) < 1000
    );
    
    // Find the negative line (favorite) and positive line (underdog)
    const spreadValues = allSpreadLines.map(l => getLineValue(l)).filter(v => v !== null) as number[];
    const negativeValue = spreadValues.find(v => v < 0);
    const positiveValue = spreadValues.find(v => v > 0);
    
    console.log(`[Game ${gameId}] 🔍 SPREAD LINES ANALYSIS:`, {
      allValues: spreadValues,
      negativeValue,
      positiveValue,
      homeTeam: game.homeTeam.name,
      awayTeam: game.awayTeam.name
    });
    
    // Determine which team SHOULD be favored using multiple signals
    // Priority: 1) AP Rankings, 2) Power Ratings + HFA, 3) Home team default
    
    // Fetch AP rankings for both teams
    const [homeRanking, awayRanking] = await Promise.all([
      prisma.teamRanking.findFirst({
        where: {
          season: game.season,
          week: game.week,
          pollType: 'AP',
          teamId: game.homeTeamId
        }
      }),
      prisma.teamRanking.findFirst({
        where: {
          season: game.season,
          week: game.week,
          pollType: 'AP',
          teamId: game.awayTeamId
        }
      })
    ]);
    
    const homePower = homeRating ? Number(homeRating.powerRating || homeRating.rating || 0) : 0;
    const awayPower = awayRating ? Number(awayRating.powerRating || awayRating.rating || 0) : 0;
    
    // CRITICAL: Add home field advantage (HFA) to home team's effective power
    // Standard HFA in college football is ~2-3 points
    const HFA = game.neutralSite ? 0 : 2.5;
    const homeEffectivePower = homePower + HFA;
    const awayEffectivePower = awayPower;
    
    console.log(`[Game ${gameId}] 🔍 FAVORITE DETERMINATION SIGNALS:`, {
      homeTeam: game.homeTeam.name,
      awayTeam: game.awayTeam.name,
      homeAPRank: homeRanking?.rank || 'unranked',
      awayAPRank: awayRanking?.rank || 'unranked',
      homePower,
      awayPower,
      HFA,
      homeEffectivePower,
      awayEffectivePower,
      neutralSite: game.neutralSite
    });
    
    // Determine which team is favored using the following logic:
    // 1. If only one team is ranked, they're the favorite
    // 2. If both are ranked, lower rank number (better) is favorite
    // 3. If neither is ranked, use effective power ratings (including HFA)
    // 4. If no power ratings, default to home team
    let favoriteIsHome: boolean;
    let favoriteReason: string;
    
    if (homeRanking && !awayRanking) {
      favoriteIsHome = true;
      favoriteReason = `home ranked #${homeRanking.rank}, away unranked`;
    } else if (awayRanking && !homeRanking) {
      favoriteIsHome = false;
      favoriteReason = `away ranked #${awayRanking.rank}, home unranked`;
    } else if (homeRanking && awayRanking) {
      // Both ranked - lower number (better rank) is favorite
      favoriteIsHome = homeRanking.rank < awayRanking.rank;
      favoriteReason = `both ranked: home #${homeRanking.rank} vs away #${awayRanking.rank}`;
    } else if (homePower !== 0 || awayPower !== 0) {
      // Use power ratings with HFA
      favoriteIsHome = homeEffectivePower > awayEffectivePower;
      favoriteReason = `power ratings: home ${homeEffectivePower.toFixed(1)} vs away ${awayEffectivePower.toFixed(1)}`;
    } else {
      // Default to home team
      favoriteIsHome = true;
      favoriteReason = 'default to home team (no rankings or power ratings)';
    }
    
    console.log(`[Game ${gameId}] 🎯 FAVORITE DETERMINATION:`, {
      favoriteIsHome,
      favoriteTeam: favoriteIsHome ? game.homeTeam.name : game.awayTeam.name,
      reason: favoriteReason
    });
    
    // Assign the negative line to the favorite and positive line to the underdog
    let homePrice: number;
    let awayPrice: number;
    let marketSpread: number;
    
    if (negativeValue !== undefined && positiveValue !== undefined) {
      // We have both lines - ideal case
      if (favoriteIsHome) {
        homePrice = negativeValue; // Home is favorite (negative)
        awayPrice = positiveValue; // Away is underdog (positive)
      } else {
        homePrice = positiveValue; // Home is underdog (positive)
        awayPrice = negativeValue; // Away is favorite (negative)
      }
      marketSpread = negativeValue; // Always use the favorite's line (negative)
    } else {
      // Fallback: only one line available
      console.warn(`[Game ${gameId}] ⚠️ Only one spread line found, using fallback logic`);
      const marketSpreadValue = getLineValue(spreadLine);
      if (marketSpreadValue === null || marketSpreadValue === undefined) {
        throw new Error(`Selected snapshot missing spread value for game ${gameId}`);
      }
      
      // Use power ratings to determine which team should have which line
      const absValue = Math.abs(marketSpreadValue);
      if (favoriteIsHome) {
        homePrice = -absValue; // Home is favorite (negative)
        awayPrice = absValue; // Away is underdog (positive)
      } else {
        homePrice = absValue; // Home is underdog (positive)
        awayPrice = -absValue; // Away is favorite (negative)
      }
      marketSpread = -absValue; // Always negative for favorite
    }
    
    const marketTotalRaw = totalLine ? getLineValue(totalLine) : null;
    const marketTotal = marketTotalRaw !== null && marketTotalRaw !== undefined ? marketTotalRaw : null;
    
    // Add marketTotal to diagnostics now that it's declared
    totalDiag.marketTotal = marketTotal;
    
    // Favorite selection rule: team with more negative price (always the favorite)
    const homeIsFavorite = homePrice < awayPrice;
    const favoriteByRule = homeIsFavorite ? {
      teamId: game.homeTeamId,
      teamName: game.homeTeam.name,
      price: homePrice,
      line: homePrice // Already negative (favorite-centric)
    } : {
      teamId: game.awayTeamId,
      teamName: game.awayTeam.name,
      price: awayPrice,
      line: awayPrice // Already negative (favorite-centric)
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

    // Calculate model win probability from model spread
    // Using standard NFL/CFB conversion: prob = normcdf(spread / (2 * sqrt(variance)))
    // For college football, we use a standard deviation of ~14 points
    // Simplified: prob = 0.5 + (spread / (2 * 14)) * 0.5, clamped to [0.05, 0.95]
    const stdDev = 14; // Standard deviation for CFB point spreads
    const modelHomeWinProb = Math.max(0.05, Math.min(0.95, 
      0.5 + (finalImpliedSpread / (2 * stdDev)) * 0.5
    ));
    const modelAwayWinProb = 1 - modelHomeWinProb;

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

    // Calculate moneyline value and grade (if market ML exists)
    let moneyline = null;
    if (mlVal != null) {
      // Determine moneyline pick label
      const marketFav = mlVal < 0 ? game.homeTeam.name : game.awayTeam.name;
      const marketMLFavProb = americanToProb(mlVal)!;
      
      // Determine which team's probability to compare
      // If market favors home and model favors home, compare home probs
      // If they disagree, compare the model's favorite vs market's favorite
      let valuePercent: number | null = null;
      let moneylineGrade: 'A' | 'B' | 'C' | null = null;
      
      if (mlVal < 0) {
        // Market favors home
        valuePercent = (modelHomeWinProb - marketMLFavProb) * 100;
      } else {
        // Market favors away
        valuePercent = (modelAwayWinProb - marketMLFavProb) * 100;
      }
      
      // Grade thresholds: A ≥ 4%, B ≥ 2.5%, C ≥ 1.5%
      if (valuePercent >= 4.0) {
        moneylineGrade = 'A';
      } else if (valuePercent >= 2.5) {
        moneylineGrade = 'B';
      } else if (valuePercent >= 1.5) {
        moneylineGrade = 'C';
      }

      const moneylinePickLabel = `${marketFav} ML`;

      moneyline = {
        price: mlVal,
        pickLabel: moneylinePickLabel,
        impliedProb: marketMLFavProb,
        meta: mlMeta,
        // Model comparison data
        modelWinProb: modelMLFavoriteProb,
        modelFairML: modelMLFavoriteFairML,
        modelFavoriteTeam: modelMLFavorite.name,
        valuePercent: valuePercent,
        grade: moneylineGrade
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
    
    // NEW: Verify that the favorite determined by power ratings matches the favorite determined by prices
    const expectedFavoriteFromPowerRatings = favoriteIsHome ? game.homeTeamId : game.awayTeamId;
    const favoriteMatchesPowerRatings = favoriteByRule.teamId === expectedFavoriteFromPowerRatings;
    
    if (!favoriteLineValid || !pricesCorrectlySigned || !favoriteMatchesPrices || !favoriteMatchesPowerRatings) {
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
        homePower: homePower,
        awayPower: awayPower,
        chosenFavorite: {
          teamId: favoriteByRule.teamId,
          teamName: favoriteByRule.teamName,
          line: favoriteByRule.line
        },
        expectedFavoriteFromPowerRatings: expectedFavoriteFromPowerRatings,
        validation: {
          favoriteLineValid,
          pricesCorrectlySigned,
          favoriteMatchesPrices,
          favoriteMatchesPowerRatings
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
        favoriteMatchesPrices,
        favoriteMatchesPowerRatings
      }
    });

    // ============================================
    // SINGLE SOURCE OF TRUTH: market_snapshot
    // ============================================
    // Canonicalize market data: favorite always negative, dog always positive
    const dogTeamId = favoriteByRule.teamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
    const dogTeamName = favoriteByRule.teamId === game.homeTeamId ? game.awayTeam.name : game.homeTeam.name;
    const dogLine = Math.abs(favoriteByRule.line); // Always positive (underdog getting points)
    
    let moneylineFavoritePrice: number | null = null;
    let moneylineDogPrice: number | null = null;
    let moneylineFavoriteTeamId: string | null = null;
    let moneylineDogTeamId: string | null = null;
    if (mlVal !== null && mlVal !== undefined) {
      if (mlVal < 0) {
        moneylineFavoriteTeamId = game.homeTeamId;
        moneylineDogTeamId = game.awayTeamId;
        moneylineFavoritePrice = mlVal;
      } else if (mlVal > 0) {
        moneylineFavoriteTeamId = game.awayTeamId;
        moneylineDogTeamId = game.homeTeamId;
        moneylineDogPrice = mlVal;
      }
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

    // Calculate ATS edge (favorite-centric): positive means model thinks favorite should lay more
    const atsEdge = computeATSEdge(
      finalImpliedSpread,
      marketSpread,
      game.homeTeamId,
      game.awayTeamId
    );

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
    const consistencyDelta = impliedHomeScoreForCheck !== null && impliedAwayScoreForCheck !== null
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
    
    // Compute the actual bettable pick based on edge (handles model/market disagreement)
    const edgeFloor = 2.0; // Minimum edge threshold
    const bettablePick = computeBettableSpreadPick(
      finalImpliedSpread,
      marketSpread,
      game.homeTeamId,
      game.homeTeam.name,
      game.awayTeamId,
      game.awayTeam.name,
      atsEdge,
      edgeFloor
    );

    // Total edge: Model Total - Market Total (positive = model thinks over, negative = under)
    // Compute if model total exists (no range checks)
    const totalEdgePts = isModelTotalValid && marketTotal !== null ? (finalImpliedTotal - marketTotal) : null;
    
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
    
    const atsEdgePts = modelLineInMarketFavCoords - market_snapshot.favoriteLine;
    
    // Log ATS decision trace before rendering
    console.log(`[Game ${gameId}] 📊 ATS DECISION TRACE:`, {
      modelFavoriteTeamId,
      modelFavoriteName,
      modelFavoriteLine,
      marketFavoriteTeamId: market_snapshot.favoriteTeamId,
      marketFavoriteName: market_snapshot.favoriteTeamName,
      marketFavoriteLine: market_snapshot.favoriteLine,
      modelLineInMarketFavCoords,
      atsEdgePts,
      edgeFloor: 2.0,
      expectedHeadline: atsEdgePts > 0.5 
        ? `${market_snapshot.dogTeamName} +${market_snapshot.dogLine.toFixed(1)}` 
        : atsEdgePts < -0.5 
          ? `${market_snapshot.favoriteTeamName} ${market_snapshot.favoriteLine.toFixed(1)}`
          : 'No edge at current number'
    });
    
    // ouEdgePts: modelTotal - marketTotal (positive = model thinks over, negative = under)
    const ouEdgePts = modelTotal !== null && market_snapshot.marketTotal !== null
      ? modelTotal - market_snapshot.marketTotal
      : null;
    
    const model_view = {
      modelFavoriteTeamId: modelFavoriteTeamId,
      modelFavoriteName: modelFavoriteName,
      modelFavoriteLine: modelFavoriteLine, // Favorite-centric, negative (or 0.0 for pick'em)
      modelTotal: modelTotal, // Points or null if units invalid
      winProbFavorite,
      winProbDog,
      edges: {
        atsEdgePts: atsEdgePts, // Favorite-centric edge
        ouEdgePts: ouEdgePts // Over/Under edge
      }
    };
    
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
      ouEdgePts,
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
    if (!favoriteMatchesPowerRatings) {
      mappingNotes.push(`Favorite team mismatch with power ratings: expected ${expectedFavoriteFromPowerRatings}, got ${favoriteByRule.teamId}`);
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
    
    // Determine "No edge" condition: edge < 2.0 OR model total ≈ market total within 0.5
    const hasNoEdge = isModelTotalValid && totalEdgePts !== null && marketTotal !== null && 
                      (Math.abs(totalEdgePts) < edgeFloor || Math.abs(finalImpliedTotal - marketTotal) < 0.5);
    
    // Compute total pick details (only if model total is valid and has edge)
    const totalPick = isModelTotalValid && !hasNoEdge && marketTotal !== null
      ? computeTotalPick(finalImpliedTotal, marketTotal)
      : { totalPick: null, totalPickLabel: null, edgeDisplay: null };
    
    // Compute "Bet to" for total (only if valid and has edge)
    const totalBetTo = isModelTotalValid && totalEdgePts !== null && Math.abs(totalEdgePts) >= edgeFloor && !hasNoEdge && marketTotal !== null
      ? computeTotalBetTo(finalImpliedTotal, marketTotal, edgeFloor)
      : null;
    
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

    const spreadGrade = getGrade(atsEdge);
    const totalGrade = getGrade(totalEdgePts);

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
        favoritesDisagree,
        edgeAbsGt20,
        modelTotalWarning: modelTotalWarning, // Specific warning message (null if no issue)
        warnings: [
          ...(modelTotalWarning ? [modelTotalWarning] : []),
          ...(favoritesDisagree ? ['Model and market favor different teams'] : []),
          ...(edgeAbsGt20 ? ['Edge magnitude exceeds 20 points'] : [])
        ]
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
            reasoning: bettablePick.reasoning
          },
          edgePts: atsEdge,
          betTo: bettablePick.betTo, // "Bet to" number
          favoritesDisagree: bettablePick.favoritesDisagree, // Flag when model ≠ market favorite
          // For backward compatibility
          spreadEdge: Math.abs(atsEdge),
          grade: spreadGrade, // A, B, C, or null
          // Rationale line for ticket (use bettablePick.reasoning which already has the correct format)
          rationale: bettablePick.reasoning
        },
        total: {
          ...totalPick,
          modelTotal: isModelTotalValid ? finalImpliedTotal : null, // Model total for headline
          marketTotal: marketTotal, // Market total for rationale
          edgePts: totalEdgePts,
          betTo: totalBetTo, // "Bet to" number for total
          grade: totalGrade, // A, B, C, or null
          hasNoEdge: hasNoEdge, // Flag for "No edge" display
          // Hide only if model total is truly invalid (NaN/null/inf)
          hidden: !isModelTotalValid,
          // OU card state: "pick" | "no_edge" | "no_model_total"
          totalState: totalState,
          // Missing inputs list (for "no_model_total" state)
          missingInputs: missingInputs,
          // Computation error flag
          calcError: calcError,
          // Specific warning message (only for missing inputs or computation failure)
          modelTotalWarning: modelTotalWarning,
          // Lean when model total is unavailable
          lean: totalState === 'no_model_total' && hasLean ? {
            direction: leanDirection,
            marketTotal: marketTotal,
            medianTotal: medianConfTotal
          } : null,
          // Rationale line for ticket
          rationale: totalState === 'pick' && totalEdgePts !== null && totalPick.totalPickLabel
            ? `Model total ${finalImpliedTotal.toFixed(1)} vs market ${marketTotal !== null ? marketTotal.toFixed(1) : 'N/A'} (${totalEdgePts >= 0 ? '+' : ''}${totalEdgePts.toFixed(1)}) → ${totalPick.totalPick} value.`
            : totalState === 'no_edge' && isModelTotalValid && marketTotal !== null
            ? `Model ${finalImpliedTotal.toFixed(1)} vs market ${marketTotal.toFixed(1)} (Δ ${Math.abs(finalImpliedTotal - marketTotal).toFixed(1)}).`
            : null
        },
        moneyline: {
          ...moneyline,
          // Rationale line for ticket
          rationale: moneyline?.price != null && moneyline?.valuePercent != null
            ? `Model ${modelMLFavorite.name} win prob ${(modelMLFavoriteProb * 100).toFixed(1)}% vs market ${(moneyline.impliedProb! * 100).toFixed(1)}% → fair ${modelMLFavoriteFairML > 0 ? '+' : ''}${modelMLFavoriteFairML} vs market ${mlVal! > 0 ? '+' : ''}${mlVal!} (${moneyline.valuePercent >= 0 ? '+' : ''}${moneyline.valuePercent.toFixed(1)}% value).`
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
      })(),
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
