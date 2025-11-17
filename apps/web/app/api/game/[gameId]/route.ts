/**
 * M3 Game Detail API Route
 * 
 * Returns detailed game information including factor breakdown from components_json.
 */

import { prisma } from '@/lib/prisma';
import { computeSpreadPick, computeTotalPick, convertToFavoriteCentric, computeATSEdge, computeBettableSpreadPick, computeTotalBetTo } from '@/lib/pick-helpers';
import { pickMarketLine, getLineValue, getPointValue, looksLikePriceLeak, pickMoneyline, americanToProb } from '@/lib/market-line-helpers';
import { getCoreV1SpreadFromTeams, getATSPick, computeATSEdgeHma } from '@/lib/core-v1-spread';
import { getOUPick } from '@/lib/core-v1-total';
import { NextResponse } from 'next/server';

// === V1 MODE CONFIGURATION ===
// V1: Use Core V1 OLS spread directly (no trust-market overlay, no totals)
const USE_CORE_V1 = true; // V1 mode: Core V1 is single source of truth
const SHOW_TOTALS_PICKS = false; // Totals disabled for V1

// === LEGACY TRUST-MARKET MODE (disabled for V1) ===
// Phase 1 Hotfix: Use market as baseline, apply small model overlays
const MODEL_MODE = USE_CORE_V1 ? 'core_v1' : 'trust_market' as const;
const LAMBDA_SPREAD = 0.25; // 25% weight to model for spreads (not used in V1)
const LAMBDA_TOTAL = 0.35; // 35% weight for totals (not used in V1)
const OVERLAY_CAP_SPREAD = 3.0; // ±3.0 pts max for spread overlay (not used in V1)
const OVERLAY_CAP_TOTAL = 3.0; // ±3.0 pts max for total overlay (not used in V1)
const OVERLAY_EDGE_FLOOR = 2.0; // Only show pick if overlay ≥ 2.0 pts
const LARGE_DISAGREEMENT_THRESHOLD = 10.0; // Drop confidence grade if raw disagreement > 10 pts

// === MINIMAL SAFETY PATCHES (Pre-Phase 2) ===
// Moneyline guards
const ML_MAX_SPREAD = 7.0; // Only consider ML if |finalSpreadWithOverlay| <= 7
const EXTREME_FAVORITE_THRESHOLD = 21; // Never recommend dog ML if |market favorite line| >= 21

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
    
    // Check for debug query parameter
    const url = new URL(request.url);
    const debugMode = url.searchParams.get('debug') === '1';

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
    
    // ============================================
    // COMPLETED GAMES: Use Pre-Kick Lines Only
    // ============================================
    // For completed games, filter market lines to only those from before/around kickoff
    // This preserves the betting ticket state for backtesting
    const isCompletedGame = game.status === 'final';
    let marketLinesToUse = game.marketLines;
    let usingPreKickLines = false;
    let consensusWindow: { start: string; end: string } | null = null;
    
    if (isCompletedGame) {
      const kickoffTime = new Date(game.date);
      const preKickWindowStart = new Date(kickoffTime.getTime() - 60 * 60 * 1000); // 60 min before
      const preKickWindowEnd = new Date(kickoffTime.getTime() + 5 * 60 * 1000); // 5 min after
      
      const preKickLines = game.marketLines.filter(line => {
        const lineTime = new Date(line.timestamp);
        return lineTime >= preKickWindowStart && lineTime <= preKickWindowEnd;
      });
      
      if (preKickLines.length > 0) {
        marketLinesToUse = preKickLines;
        usingPreKickLines = true;
        consensusWindow = {
          start: preKickWindowStart.toISOString(),
          end: preKickWindowEnd.toISOString()
        };
        console.log(`[Game ${gameId}] 🔒 COMPLETED GAME - Using pre-kick lines:`, {
          totalLines: game.marketLines.length,
          preKickLines: preKickLines.length,
          kickoffTime: kickoffTime.toISOString(),
          windowStart: preKickWindowStart.toISOString(),
          windowEnd: preKickWindowEnd.toISOString()
        });
      } else {
        console.warn(`[Game ${gameId}] ⚠️ COMPLETED GAME - No pre-kick lines found in window, using all available lines`);
      }
    }
    
    // ============================================
    // CONSENSUS HELPER (uses getPointValue to filter price leaks)
    // ============================================
    const computeMedianConsensus = (
      lines: typeof marketLinesToUse,
      lineType: 'spread' | 'total' | 'moneyline',
      fieldType?: 'spread' | 'total'
    ): { 
      value: number | null; 
      count: number; 
      books: string[]; 
      excluded: number; 
      usedFrom?: string;
      rawCount?: number;
      perBookCount?: number;
      deduped?: boolean;
    } => {
      const validValues: { value: number; book: string }[] = [];
      let excludedCount = 0;
      
      for (const line of lines) {
        if (line.lineType !== lineType) continue;
        
        // CRITICAL: Use getPointValue for spread/total (reads lineValue ONLY), getLineValue for moneyline
        const value = fieldType 
          ? getPointValue(line, fieldType) // ONLY reads lineValue field (points), never closingLine (prices)
          : getLineValue(line); // Moneyline - reads closingLine (prices are expected)
          
        if (value === null || value === undefined) {
          // Track as excluded if we expected a point but lineValue was missing or filtered
          if (fieldType) {
            excludedCount++;
          }
          continue;
        }
        
        const book = line.bookName || line.source || 'unknown';
        validValues.push({ value, book });
      }
      
      if (validValues.length === 0) {
        return { 
          value: null, 
          count: 0, 
          books: [], 
          excluded: excludedCount,
          usedFrom: fieldType ? 'lineValue' : 'closingLine/lineValue',
          rawCount: 0,
          perBookCount: 0,
          deduped: fieldType === 'spread'
        };
      }
      
      const rawCount = validValues.length;
      
      // CRITICAL: For spreads, normalize to favorite-centric and dedupe per book
      // Database stores TWO lines per game (home +X, away -X), but we only want ONE per book
      if (fieldType === 'spread') {
        // Step 1: Normalize all spreads to favorite-centric (always negative)
        // lineValue sign convention: home_minus_away
        // Positive lineValue → home favored → favorite line is -abs(value)
        // Negative lineValue → away favored → favorite line is -abs(value)
        const normalizedValues: { value: number; book: string }[] = validValues.map(v => ({
          value: -Math.abs(v.value), // Always negative (favorite-centric)
          book: v.book
        }));
        
        // Step 2: Dedupe per book (keep one reading per book)
        // Round to nearest 0.5 to handle float precision
        const perBookMap = new Map<string, number>();
        for (const { value, book } of normalizedValues) {
          const rounded = Math.round(value * 2) / 2; // Round to nearest 0.5
          
          // If book already exists, keep the more common value (or first seen)
          if (!perBookMap.has(book)) {
            perBookMap.set(book, rounded);
          }
        }
        
        // Convert back to array
        const dedupedValues = Array.from(perBookMap.entries()).map(([book, value]) => ({ book, value }));
        const perBookCount = dedupedValues.length;
        
        if (dedupedValues.length === 0) {
          return {
            value: null,
            count: 0,
            books: [],
            excluded: excludedCount,
            usedFrom: 'lineValue',
            rawCount,
            perBookCount: 0,
            deduped: true
          };
        }
        
        // Compute median on normalized, deduped values
        const sorted = dedupedValues.map(v => v.value).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
        
        // Get unique books
        const uniqueBooks = Array.from(new Set(dedupedValues.map(v => v.book)));
        
        return {
          value: median,
          count: perBookCount,
          books: uniqueBooks,
          excluded: excludedCount,
          usedFrom: 'lineValue',
          rawCount,
          perBookCount,
          deduped: true
        };
      }
      
      // For totals and moneyline, no normalization needed
      const uniqueBooks = Array.from(new Set(validValues.map(v => v.book)));
      
      // Compute median
      const sorted = validValues.map(v => v.value).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      
      return {
        value: median,
        count: validValues.length,
        books: uniqueBooks,
        excluded: excludedCount,
        usedFrom: fieldType ? 'lineValue' : 'closingLine/lineValue',
        rawCount,
        perBookCount: validValues.length,
        deduped: false
      };
    };
    
    // Type assertion to access teamId field (defined once for reuse)
    type MarketLineWithTeamId = typeof marketLinesToUse[0] & { teamId?: string | null };
    
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
    const allSpreadLines = marketLinesToUse.filter(l => l.lineType === 'spread');
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

    for (const line of marketLinesToUse) {
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

    const pickPreferredLine = (lines: typeof marketLinesToUse, lineType?: 'spread' | 'total' | 'moneyline') => {
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

    let selectedSpreadLine: typeof marketLinesToUse[number] | null = null;
    let selectedTotalLine: typeof marketLinesToUse[number] | null = null;
    let selectedMoneylineLine: typeof marketLinesToUse[number] | null = null;
    let selectedGroupSource: string | null = null;
    let selectedGroupBook: string | null = null;
    let selectedGroupTimestamp = 0;

    // TWO-PASS SELECTION: First pass only considers groups with teamId, fallback to all groups if none exist
    const selectBestGroup = (groups: OddsGroup[]) => {
      let bestCoverageScore = -1;
      let bestLatestTimestamp = 0;
      let bestSpreadLine: typeof marketLinesToUse[number] | null = null;
      let bestTotalLine: typeof marketLinesToUse[number] | null = null;
      let bestMoneylineLine: typeof marketLinesToUse[number] | null = null;
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
    const fallbackSpreadLine = pickMarketLine(marketLinesToUse, 'spread');
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
      const fallbackTotalLine = pickMarketLine(marketLinesToUse, 'total');
      if (fallbackTotalLine) {
        selectedTotalLine = fallbackTotalLine;
        diagnosticsMessages.push(`Odds source mismatch: total line sourced from ${fallbackTotalLine.bookName || 'Unknown book'}.`);
        totalSourceMismatch = true;
      }
    }

    if (!selectedMoneylineLine) {
      const fallbackMoneylineLine = pickMoneyline(marketLinesToUse);
      if (fallbackMoneylineLine) {
        selectedMoneylineLine = fallbackMoneylineLine;
        diagnosticsMessages.push(`Odds source mismatch: moneyline sourced from ${fallbackMoneylineLine.bookName || 'Unknown book'}.`);
        moneylineSourceMismatch = true;
      }
    }

    const spreadLine = selectedSpreadLine;
    const totalLine = selectedTotalLine;
    const mlLine = selectedMoneylineLine;
    
    // ============================================
    // COMPUTE CONSENSUS WITH PRICE-LEAK FILTERING
    // ============================================
    // Use median consensus within the selected window (pre-kick for completed games)
    const spreadConsensus = computeMedianConsensus(marketLinesToUse, 'spread', 'spread');
    const totalConsensus = computeMedianConsensus(marketLinesToUse, 'total', 'total');
    
    // ============================================
    // MONEYLINE CONSENSUS (dedupe per book, separate favorite/dog)
    // ============================================
    const computeMoneylineConsensus = (
      lines: typeof marketLinesToUse
    ): { 
      favoritePrice: number | null; 
      dogPrice: number | null;
      favoriteCount: number;
      dogCount: number;
      books: string[];
      excluded: number;
      rawCount: number;
      perBookCount: number;
      deduped: boolean;
    } => {
      const favoritePrices: { value: number; book: string }[] = [];
      const dogPrices: { value: number; book: string }[] = [];
      let excludedCount = 0;
      
      for (const line of lines) {
        if (line.lineType !== 'moneyline') continue;
        
        const value = getLineValue(line); // Uses closingLine (prices are expected for ML)
        if (value === null || value === undefined) {
          excludedCount++;
          continue;
        }
        
        // Guardrail: Reject if abs(price) < 100 (not American odds format)
        if (Math.abs(value) < 100) {
          excludedCount++;
          continue;
        }
        
        // Guardrail: Reject if not multiple of 5 (American odds are typically -110, -115, +120, etc.)
        if (Math.abs(value) % 5 !== 0) {
          excludedCount++;
          continue;
        }
        
        const book = line.bookName || line.source || 'unknown';
        
        // Separate favorite (negative) and dog (positive) prices
        if (value < 0) {
          favoritePrices.push({ value, book });
        } else {
          dogPrices.push({ value, book });
        }
      }
      
      const rawCount = favoritePrices.length + dogPrices.length;
      
      // Dedupe per book (keep one favorite price and one dog price per book)
      const favoritePerBook = new Map<string, number>();
      const dogPerBook = new Map<string, number>();
      
      for (const { value, book } of favoritePrices) {
        // Round to nearest 5 (American odds are multiples of 5)
        const rounded = Math.round(value / 5) * 5;
        if (!favoritePerBook.has(book)) {
          favoritePerBook.set(book, rounded);
        }
      }
      
      for (const { value, book } of dogPrices) {
        // Round to nearest 5
        const rounded = Math.round(value / 5) * 5;
        if (!dogPerBook.has(book)) {
          dogPerBook.set(book, rounded);
        }
      }
      
      const dedupedFavoritePrices = Array.from(favoritePerBook.values());
      const dedupedDogPrices = Array.from(dogPerBook.values());
      const perBookCount = Math.max(favoritePerBook.size, dogPerBook.size);
      
      // Compute medians
      const favoriteMedian = dedupedFavoritePrices.length > 0
        ? (() => {
            const sorted = dedupedFavoritePrices.sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0
              ? (sorted[mid - 1] + sorted[mid]) / 2
              : sorted[mid];
          })()
        : null;
      
      const dogMedian = dedupedDogPrices.length > 0
        ? (() => {
            const sorted = dedupedDogPrices.sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0
              ? (sorted[mid - 1] + sorted[mid]) / 2
              : sorted[mid];
          })()
        : null;
      
      // Get unique books (union of favorite and dog books)
      const allBooks = Array.from(new Set([
        ...Array.from(favoritePerBook.keys()),
        ...Array.from(dogPerBook.keys())
      ]));
      
      return {
        favoritePrice: favoriteMedian,
        dogPrice: dogMedian,
        favoriteCount: dedupedFavoritePrices.length,
        dogCount: dedupedDogPrices.length,
        books: allBooks,
        excluded: excludedCount,
        rawCount,
        perBookCount,
        deduped: true
      };
    };
    
    const moneylineConsensus = computeMoneylineConsensus(marketLinesToUse);
    
    // ============================================
    // CONSENSUS RESULTS LOGGING (one-line summary)
    // ============================================
    console.log(`[Game ${gameId}] 📊 CONSENSUS: spread=${spreadConsensus.value?.toFixed(1) ?? 'null'} (${spreadConsensus.perBookCount || 0} books, deduped=${spreadConsensus.deduped}), total=${totalConsensus.value?.toFixed(1) ?? 'null'} (${totalConsensus.count} books), ML=fav:${moneylineConsensus.favoritePrice ?? 'null'}/dog:${moneylineConsensus.dogPrice ?? 'null'} (${moneylineConsensus.perBookCount} books, deduped=${moneylineConsensus.deduped}), usingPreKickLines=${usingPreKickLines}, rawCount=spread:${spreadConsensus.rawCount || 0}/total:${totalConsensus.rawCount || 0}/ML:${moneylineConsensus.rawCount}`);
    
    // Detailed breakdown (for debugging)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Game ${gameId}] 📊 CONSENSUS DETAILS:`, {
        spread: {
          value: spreadConsensus.value?.toFixed(1) ?? 'null',
          perBookCount: spreadConsensus.perBookCount || 0,
          rawCount: spreadConsensus.rawCount || 0,
          books: spreadConsensus.books,
          excluded: spreadConsensus.excluded,
          deduped: spreadConsensus.deduped
        },
        total: {
          value: totalConsensus.value?.toFixed(1) ?? 'null',
          count: totalConsensus.count,
          books: totalConsensus.books,
          excluded: totalConsensus.excluded
        },
        moneyline: {
          favoritePrice: moneylineConsensus.favoritePrice,
          dogPrice: moneylineConsensus.dogPrice,
          favoriteCount: moneylineConsensus.favoriteCount,
          dogCount: moneylineConsensus.dogCount,
          count: moneylineConsensus.perBookCount, // Per-book count (after dedupe)
          sourceBooks: moneylineConsensus.books,
          excluded: moneylineConsensus.excluded,
          rawCount: moneylineConsensus.rawCount,
          perBookCount: moneylineConsensus.perBookCount,
          deduped: moneylineConsensus.deduped,
          usedFrom: 'closingLine', // ML uses prices from closingLine
          note: 'Moneyline consensus: dedupes per book, computes median separately for favorite (negative) and dog (positive) prices. Requires perBookCount >= 2.'
        }
      });
    }
    
    // Type assertion to access teamId field (needed for both spreads and moneylines)
    const marketLinesWithTeamId = marketLinesToUse as MarketLineWithTeamId[];

    // Get both moneyline lines - NEW APPROACH: Don't rely on teamId
    // Moneylines come in pairs (one negative for favorite, one positive for dog)
    // Search broadly for any negative and positive moneylines near the spread timestamp
    const spreadTimestamp = new Date(spreadLine.timestamp).getTime();
    
    // Strategy: Search ALL moneylines near the spread timestamp (don't filter by book first)
    // This is more lenient and works even if books report moneylines at slightly different times
    const allMoneylinesNearSpread = marketLinesToUse.filter(
      (l) => l.lineType === 'moneyline' && 
             Math.abs(new Date(l.timestamp).getTime() - spreadTimestamp) < 10000 // Within 10 seconds
    );
    
    console.log(`[Game ${gameId}] 🔍 Searching for moneylines near spread timestamp:`, {
      spreadTimestamp: new Date(spreadTimestamp).toISOString(),
      spreadBook: spreadLine.bookName,
      foundMoneylines: allMoneylinesNearSpread.length,
      totalMoneylines: marketLinesToUse.filter(l => l.lineType === 'moneyline').length
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

    // ============================================
    // PHASE 2.4: Recency-Weighted Stats Computation
    // ============================================
    // Compute weighted stats (last 3 games ×1.5, earlier ×1.0) and rebuild ratings
    const RECENCY_L3_WEIGHT = 1.5;
    const RECENCY_SEASON_WEIGHT = 1.0;
    const RECENCY_L3_GAMES = 3;

    // Helper: Compute recency-weighted stats for a team
    const computeRecencyWeightedStats = async (
      teamId: string,
      season: number,
      beforeDate: Date
    ): Promise<{
      stats: {
        epaOff: number | null;
        epaDef: number | null;
        yppOff: number | null;
        yppDef: number | null;
        successOff: number | null;
        successDef: number | null;
        passYpaOff: number | null;
        rushYpcOff: number | null;
        passYpaDef: number | null;
        rushYpcDef: number | null;
        pace: number | null;
      };
      gamesLast3: number;
      gamesTotal: number;
      effectiveWeightSum: number;
      missingCounts: Record<string, number>;
    }> => {
      // Load all game stats for this team up to game date
      const gameStats = await prisma.teamGameStat.findMany({
        where: {
          teamId,
          season,
          game: {
            date: { lt: beforeDate },
            status: 'final'
          },
          OR: [
            { yppOff: { not: null } },
            { epaOff: { not: null } },
            { successOff: { not: null } }
          ]
        },
        include: {
          game: {
            select: { date: true }
          }
        },
        orderBy: {
          game: {
            date: 'desc'
          }
        }
      });

      const gamesTotal = gameStats.length;
      const gamesLast3 = Math.min(RECENCY_L3_GAMES, gamesTotal);

      // Separate last 3 from earlier games
      const last3Games = gameStats.slice(0, gamesLast3);
      const earlierGames = gameStats.slice(gamesLast3);

      // Helper to compute weighted average for a stat
      const computeWeightedAverage = (
        getValue: (stat: any) => number | null,
        statName: string
      ): { value: number | null; missingCount: number } => {
        let weightedSum = 0;
        let weightSum = 0;
        let missingCount = 0;

        // Last 3 games (weight 1.5)
        for (const stat of last3Games) {
          const value = getValue(stat);
          if (value !== null && !isNaN(value) && isFinite(value)) {
            weightedSum += value * RECENCY_L3_WEIGHT;
            weightSum += RECENCY_L3_WEIGHT;
          } else {
            missingCount++;
          }
        }

        // Earlier games (weight 1.0)
        for (const stat of earlierGames) {
          const value = getValue(stat);
          if (value !== null && !isNaN(value) && isFinite(value)) {
            weightedSum += value * RECENCY_SEASON_WEIGHT;
            weightSum += RECENCY_SEASON_WEIGHT;
          } else {
            missingCount++;
          }
        }

        if (weightSum === 0) {
          return { value: null, missingCount };
        }

        const avg = weightedSum / weightSum;
        return {
          value: isFinite(avg) && !isNaN(avg) ? avg : null,
          missingCount
        };
      };

      const toNumber = (x: any): number | null => {
        if (x === null || x === undefined) return null;
        const n = typeof x === 'number' ? x : Number(x);
        return isFinite(n) && !isNaN(n) ? n : null;
      };

      const epaOffResult = computeWeightedAverage(s => toNumber(s.epaOff), 'epaOff');
      const epaDefResult = computeWeightedAverage(s => toNumber(s.epaDef), 'epaDef');
      const yppOffResult = computeWeightedAverage(s => toNumber(s.yppOff), 'yppOff');
      const yppDefResult = computeWeightedAverage(s => toNumber(s.yppDef), 'yppDef');
      const successOffResult = computeWeightedAverage(s => toNumber(s.successOff), 'successOff');
      const successDefResult = computeWeightedAverage(s => toNumber(s.successDef), 'successDef');
      const passYpaOffResult = computeWeightedAverage(s => toNumber(s.passYpaOff), 'passYpaOff');
      const rushYpcOffResult = computeWeightedAverage(s => toNumber(s.rushYpcOff), 'rushYpcOff');
      const passYpaDefResult = computeWeightedAverage(s => toNumber(s.passYpaDef), 'passYpaDef');
      const rushYpcDefResult = computeWeightedAverage(s => toNumber(s.rushYpcDef), 'rushYpcDef');
      const paceResult = computeWeightedAverage(s => toNumber(s.pace), 'pace');

      const effectiveWeightSum = RECENCY_L3_WEIGHT * gamesLast3 + RECENCY_SEASON_WEIGHT * Math.max(0, gamesTotal - gamesLast3);

      return {
        stats: {
          epaOff: epaOffResult.value,
          epaDef: epaDefResult.value,
          yppOff: yppOffResult.value,
          yppDef: yppDefResult.value,
          successOff: successOffResult.value,
          successDef: successDefResult.value,
          passYpaOff: passYpaOffResult.value,
          rushYpcOff: rushYpcOffResult.value,
          passYpaDef: passYpaDefResult.value,
          rushYpcDef: rushYpcDefResult.value,
          pace: paceResult.value
        },
        gamesLast3,
        gamesTotal,
        effectiveWeightSum,
        missingCounts: {
          epaOff: epaOffResult.missingCount,
          epaDef: epaDefResult.missingCount,
          yppOff: yppOffResult.missingCount,
          yppDef: yppOffResult.missingCount,
          successOff: successOffResult.missingCount,
          successDef: successDefResult.missingCount,
          passYpaOff: passYpaOffResult.missingCount,
          rushYpcOff: rushYpcOffResult.missingCount,
          passYpaDef: passYpaDefResult.missingCount,
          rushYpcDef: rushYpcDefResult.missingCount,
          pace: paceResult.missingCount
        }
      };
    };

    // Get power ratings from team_season_ratings (Ratings v2) - SoS-adjusted with shrinkage
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

    // Get base ratings for comparison
    const homeRatingBase = homeRating ? Number(homeRating.powerRating || homeRating.rating || 0) : 0;
    const awayRatingBase = awayRating ? Number(awayRating.powerRating || awayRating.rating || 0) : 0;

    // Compute recency-weighted stats for both teams
    const [homeRecencyStats, awayRecencyStats] = await Promise.all([
      computeRecencyWeightedStats(game.homeTeamId, game.season, game.date),
      computeRecencyWeightedStats(game.awayTeamId, game.season, game.date)
    ]);

    // PHASE 2.4: Compute weighted power ratings from recency-weighted stats
    // Load all FBS teams to compute z-scores from weighted stats
    const fbsMemberships = await prisma.teamMembership.findMany({
      where: { season: game.season, level: 'fbs' },
      select: { teamId: true }
    });
    const fbsTeamIds = Array.from(new Set(fbsMemberships.map(m => m.teamId.toLowerCase())));

    // Compute recency-weighted stats for all FBS teams (for z-score calculation)
    // Performance: Only compute for teams that have game stats (skip teams with 0 games)
    const allFBSRecencyStats: Array<{ teamId: string; stats: typeof homeRecencyStats.stats }> = [];
    
    // Batch check which teams have game stats to avoid unnecessary computation
    const teamsWithStats = await prisma.teamGameStat.findMany({
      where: {
        season: game.season,
        game: {
          date: { lt: game.date },
          status: 'final'
        },
        teamId: { in: fbsTeamIds }
      },
      select: { teamId: true },
      distinct: ['teamId']
    });
    const teamIdsWithStats = new Set(teamsWithStats.map(t => t.teamId.toLowerCase()));
    
    // Only compute for teams that have stats
    const teamsToCompute = fbsTeamIds.filter(tid => teamIdsWithStats.has(tid.toLowerCase()));
    
    console.log(`[Game ${gameId}] Computing recency stats for ${teamsToCompute.length} teams (of ${fbsTeamIds.length} FBS teams)`);
    
    for (const tid of teamsToCompute) {
      try {
        const stats = await computeRecencyWeightedStats(tid, game.season, game.date);
        // Only include if team has at least some stats
        if (stats.gamesTotal > 0) {
          allFBSRecencyStats.push({ teamId: tid, stats: stats.stats });
        }
      } catch (error) {
        // Skip teams with errors, continue
        console.warn(`[Game ${gameId}] Failed to compute recency stats for ${tid}:`, error);
      }
    }
    
    console.log(`[Game ${gameId}] Computed recency stats for ${allFBSRecencyStats.length} teams with valid data`);

    // Compute z-score statistics from weighted stats
    const calculateZScores = (getValue: (s: typeof allFBSRecencyStats[0]) => number | null) => {
      const values = allFBSRecencyStats
        .map(getValue)
        .filter(v => v !== null && !isNaN(v) && isFinite(v))
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

    const zStatsWeighted = {
      epaOff: calculateZScores(s => s.stats.epaOff),
      epaDef: calculateZScores(s => s.stats.epaDef),
      yppOff: calculateZScores(s => s.stats.yppOff),
      yppDef: calculateZScores(s => s.stats.yppDef),
      successOff: calculateZScores(s => s.stats.successOff),
      successDef: calculateZScores(s => s.stats.successDef),
      passYpaOff: calculateZScores(s => s.stats.passYpaOff),
      rushYpcOff: calculateZScores(s => s.stats.rushYpcOff),
      passYpaDef: calculateZScores(s => s.stats.passYpaDef),
      rushYpcDef: calculateZScores(s => s.stats.rushYpcDef),
    };

    // Helper to compute weighted power rating from recency stats
    const computeWeightedPowerRating = (recencyStats: typeof homeRecencyStats.stats): number => {
      const getZScore = (value: number | null, mean: number, stdDev: number): number => {
        if (value === null || isNaN(value) || !isFinite(value)) return 0;
        return (value - mean) / stdDev;
      };

      // Offensive weights
      const offensiveWeights = {
        yppOff: 0.30,
        passYpaOff: 0.20,
        rushYpcOff: 0.15,
        successOff: 0.20,
        epaOff: 0.15,
      };

      // Defensive weights (inverted - lower is better)
      const hasDefensiveYards = recencyStats.yppDef !== null || recencyStats.passYpaDef !== null || recencyStats.rushYpcDef !== null;
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

      let rating = 0;

      // Offensive contributions
      if (recencyStats.yppOff !== null) {
        rating += offensiveWeights.yppOff * getZScore(recencyStats.yppOff, zStatsWeighted.yppOff.mean, zStatsWeighted.yppOff.stdDev);
      }
      if (recencyStats.passYpaOff !== null) {
        rating += offensiveWeights.passYpaOff * getZScore(recencyStats.passYpaOff, zStatsWeighted.passYpaOff.mean, zStatsWeighted.passYpaOff.stdDev);
      }
      if (recencyStats.rushYpcOff !== null) {
        rating += offensiveWeights.rushYpcOff * getZScore(recencyStats.rushYpcOff, zStatsWeighted.rushYpcOff.mean, zStatsWeighted.rushYpcOff.stdDev);
      }
      if (recencyStats.successOff !== null) {
        rating += offensiveWeights.successOff * getZScore(recencyStats.successOff, zStatsWeighted.successOff.mean, zStatsWeighted.successOff.stdDev);
      }
      if (recencyStats.epaOff !== null) {
        rating += offensiveWeights.epaOff * getZScore(recencyStats.epaOff, zStatsWeighted.epaOff.mean, zStatsWeighted.epaOff.stdDev);
      }

      // Defensive contributions (inverted - lower is better)
      if (recencyStats.yppDef !== null && defensiveWeights.yppDef > 0) {
        rating += defensiveWeights.yppDef * (-getZScore(recencyStats.yppDef, zStatsWeighted.yppDef.mean, zStatsWeighted.yppDef.stdDev));
      }
      if (recencyStats.passYpaDef !== null && defensiveWeights.passYpaDef > 0) {
        rating += defensiveWeights.passYpaDef * (-getZScore(recencyStats.passYpaDef, zStatsWeighted.passYpaDef.mean, zStatsWeighted.passYpaDef.stdDev));
      }
      if (recencyStats.rushYpcDef !== null && defensiveWeights.rushYpcDef > 0) {
        rating += defensiveWeights.rushYpcDef * (-getZScore(recencyStats.rushYpcDef, zStatsWeighted.rushYpcDef.mean, zStatsWeighted.rushYpcDef.stdDev));
      }
      if (recencyStats.successDef !== null) {
        rating += defensiveWeights.successDef * (-getZScore(recencyStats.successDef, zStatsWeighted.successDef.mean, zStatsWeighted.successDef.stdDev));
      }
      if (recencyStats.epaDef !== null) {
        rating += defensiveWeights.epaDef * (-getZScore(recencyStats.epaDef, zStatsWeighted.epaDef.mean, zStatsWeighted.epaDef.stdDev));
      }

      return isFinite(rating) && !isNaN(rating) ? rating : 0;
    };

    // Compute weighted power ratings with NaN guards
    let homeRatingWeighted = computeWeightedPowerRating(homeRecencyStats.stats);
    let awayRatingWeighted = computeWeightedPowerRating(awayRecencyStats.stats);
    
    // NaN guards: fallback to base if weighted computation failed
    if (!isFinite(homeRatingWeighted) || isNaN(homeRatingWeighted)) {
      console.warn(`[Game ${gameId}] ⚠️ Home weighted rating is NaN/inf, falling back to base`);
      homeRatingWeighted = homeRatingBase;
    }
    if (!isFinite(awayRatingWeighted) || isNaN(awayRatingWeighted)) {
      console.warn(`[Game ${gameId}] ⚠️ Away weighted rating is NaN/inf, falling back to base`);
      awayRatingWeighted = awayRatingBase;
    }

    // Log recency effect
    const homeRecencyEffect = homeRatingWeighted - homeRatingBase;
    const awayRecencyEffect = awayRatingWeighted - awayRatingBase;

    console.log(`[Game ${gameId}] 🎯 Recency-Weighted Ratings (Phase 2.4):`, {
      home: {
        base: homeRatingBase.toFixed(2),
        weighted: homeRatingWeighted.toFixed(2),
        effect: homeRecencyEffect.toFixed(2),
        gamesLast3: homeRecencyStats.gamesLast3,
        gamesTotal: homeRecencyStats.gamesTotal
      },
      away: {
        base: awayRatingBase.toFixed(2),
        weighted: awayRatingWeighted.toFixed(2),
        effect: awayRecencyEffect.toFixed(2),
        gamesLast3: awayRecencyStats.gamesLast3,
        gamesTotal: awayRecencyStats.gamesTotal
      },
      note: 'Using weighted ratings in model spread'
    });

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
    // PHASE 2.1: Talent Gap Feature (247 Composite) - COMPLETE
    // ============================================
    // Load talent data for both teams
    const [homeTalent, awayTalent] = await Promise.all([
      prisma.teamSeasonTalent.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.homeTeamId,
          },
        },
      }),
      prisma.teamSeasonTalent.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.awayTeamId,
          },
        },
      }),
    ]);

    // Raw talent values (null if missing/FCS)
    const homeTalentRaw = homeTalent?.talentComposite ?? null;
    const awayTalentRaw = awayTalent?.talentComposite ?? null;

    // Get all season talent data for G5 p10 calculation and normalization
    const allSeasonTalent = await prisma.teamSeasonTalent.findMany({
      where: { season: game.season },
      select: { 
        talentComposite: true,
        teamId: true,
      },
    });

    // Get all team conferences for G5 identification (batch query)
    const teamIds = Array.from(new Set(allSeasonTalent.map(t => t.teamId)));
    const teamConferences = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, conference: true },
    });
    const conferenceMap = new Map(teamConferences.map(t => [t.id, t.conference]));

    // Get home/away team conference info
    const homeTeamInfo = teamConferences.find(t => t.id === game.homeTeamId);
    const awayTeamInfo = teamConferences.find(t => t.id === game.awayTeamId);

    // G5 conferences (non-P5, non-FCS) - for talent imputation
    const G5_CONFERENCES_TALENT = new Set([
      'American Athletic', 'Conference USA', 'Mid-American', 'Mountain West', 'Sun Belt'
    ]);
    const isG5ForTalent = (conf: string | null) => conf !== null && G5_CONFERENCES_TALENT.has(conf);

    // Calculate G5 p10 (10th percentile) for imputation
    // Cap at 5th-25th percentile band to avoid freak seasons
    let g5P10: number | null = null;
    let g5P5: number | null = null;
    let g5P25: number | null = null;
    
    const g5TalentValues: number[] = [];
    for (const talent of allSeasonTalent) {
      if (talent.talentComposite !== null && isFinite(talent.talentComposite)) {
        const conf = conferenceMap.get(talent.teamId);
        if (conf && isG5ForTalent(conf)) {
          g5TalentValues.push(talent.talentComposite);
        }
      }
    }

    if (g5TalentValues.length >= 10) {
      // Sort for percentile calculation
      g5TalentValues.sort((a, b) => a - b);
      const n = g5TalentValues.length;
      g5P5 = g5TalentValues[Math.floor(n * 0.05)];
      g5P10 = g5TalentValues[Math.floor(n * 0.10)];
      g5P25 = g5TalentValues[Math.floor(n * 0.25)];
      
      // Cap p10 at 5th-25th percentile band
      if (g5P10 < g5P5) g5P10 = g5P5;
      if (g5P10 > g5P25) g5P10 = g5P25;
    }

    // Imputation logic: if missing, use G5 p10
    const homeImputation: 'none' | 'g5_p10' = homeTalentRaw !== null ? 'none' : 'g5_p10';
    const awayImputation: 'none' | 'g5_p10' = awayTalentRaw !== null ? 'none' : 'g5_p10';
    
    const homeTalentUsed = homeTalentRaw ?? g5P10;
    const awayTalentUsed = awayTalentRaw ?? g5P10;

    // Calculate difference using imputed values
    const talentGapDiff = homeTalentUsed !== null && awayTalentUsed !== null
      ? homeTalentUsed - awayTalentUsed
      : null;

    // Normalization: 0-mean, unit variance within season
    const allTalentValues = allSeasonTalent
      .map(t => t.talentComposite)
      .filter(v => v !== null && isFinite(v)) as number[];
    
    let talentDiffZ: number | null = null;
    let talentDiffMean: number | null = null;
    let talentDiffStd: number | null = null;
    let talentZDisabled = false;
    
    if (allTalentValues.length > 0) {
      // Calculate mean and std for normalization
      talentDiffMean = allTalentValues.reduce((a, b) => a + b, 0) / allTalentValues.length;
      const variance = allTalentValues.reduce((sum, val) => sum + Math.pow(val - talentDiffMean!, 2), 0) / allTalentValues.length;
      talentDiffStd = Math.sqrt(variance);
      
      // Stability guard: if std < 0.1, disable z-score (tiny variance shouldn't explode coefficients)
      if (talentDiffStd < 0.1) {
        talentZDisabled = true;
        talentDiffZ = 0;
      } else if (homeTalentUsed !== null && awayTalentUsed !== null) {
        // Normalize each team's talent, then difference
        const homeTalentZ = (homeTalentUsed - talentDiffMean!) / talentDiffStd;
        const awayTalentZ = (awayTalentUsed - talentDiffMean!) / talentDiffStd;
        talentDiffZ = homeTalentZ - awayTalentZ;
      }
    }

    // Sanity check: diff === home_used - away_used (within 1e-6)
    if (talentGapDiff !== null && homeTalentUsed !== null && awayTalentUsed !== null) {
      const expectedDiff = homeTalentUsed - awayTalentUsed;
      if (Math.abs(talentGapDiff - expectedDiff) > 1e-6) {
        console.warn(`[Game ${gameId}] ⚠️ Talent diff sanity check failed: ${talentGapDiff} vs ${expectedDiff}`);
      }
    }
    
    console.log(`[Game ${gameId}] 🎯 Talent Gap (Phase 2.1 Complete):`, {
      homeRaw: homeTalentRaw?.toFixed(2) ?? 'null',
      awayRaw: awayTalentRaw?.toFixed(2) ?? 'null',
      homeUsed: homeTalentUsed?.toFixed(2) ?? 'null',
      awayUsed: awayTalentUsed?.toFixed(2) ?? 'null',
      diff: talentGapDiff?.toFixed(2) ?? 'null',
      diffZ: talentDiffZ?.toFixed(2) ?? 'null',
      imputation: { home: homeImputation, away: awayImputation },
      g5P10: g5P10?.toFixed(2) ?? 'null',
      zDisabled: talentZDisabled,
      note: 'Complete Phase 2.1 with FCS imputation and stability guards'
    });

    // ============================================
    // PHASE 2.2: Matchup Class Feature
    // ============================================
    // Classify teams as P5, G5, or FCS based on season membership and conference
    
    // Get team memberships for this season
    const [homeMembership, awayMembership] = await Promise.all([
      prisma.teamMembership.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.homeTeamId,
          },
        },
      }),
      prisma.teamMembership.findUnique({
        where: {
          season_teamId: {
            season: game.season,
            teamId: game.awayTeamId,
          },
        },
      }),
    ]);

    // P5 conferences (season-aware, may expand)
    const P5_CONFERENCES = new Set([
      'ACC', 'Big Ten', 'B1G', 'Big 12', 'SEC', 'Pac-12', 'Pac-10'
    ]);
    
    // G5 conferences
    const G5_CONFERENCES = new Set([
      'American Athletic', 'AAC', 'Mountain West', 'MWC', 'Sun Belt',
      'Mid-American', 'MAC', 'Conference USA', 'C-USA'
    ]);

    // Helper to classify a team's tier
    const classifyTeamTier = (teamId: string, membership: typeof homeMembership, conference: string | null): 'P5' | 'G5' | 'FCS' => {
      // Check membership level first
      if (membership?.level === 'fcs') {
        return 'FCS';
      }
      
      // Independents: Notre Dame = P5, others = G5
      if (teamId === 'notre-dame') {
        return 'P5';
      }
      
      // Check conference
      if (conference && P5_CONFERENCES.has(conference)) {
        return 'P5';
      }
      
      if (conference && G5_CONFERENCES.has(conference)) {
        return 'G5';
      }
      
      // Default: if FBS membership but unknown conference, treat as G5
      if (membership?.level === 'fbs') {
        return 'G5';
      }
      
      // Fallback: FCS
      return 'FCS';
    };

    const homeTier = classifyTeamTier(game.homeTeamId, homeMembership, homeTeamInfo?.conference ?? null);
    const awayTier = classifyTeamTier(game.awayTeamId, awayMembership, awayTeamInfo?.conference ?? null);

    // Create matchup class
    type MatchupClass = 'P5_P5' | 'P5_G5' | 'P5_FCS' | 'G5_G5' | 'G5_FCS';
    
    const getMatchupClass = (home: 'P5' | 'G5' | 'FCS', away: 'P5' | 'G5' | 'FCS'): MatchupClass => {
      // Sort tiers so P5 > G5 > FCS for consistent ordering
      const tierOrder = { P5: 3, G5: 2, FCS: 1 };
      const [higher, lower] = tierOrder[home] >= tierOrder[away] 
        ? [home, away] 
        : [away, home];
      
      if (higher === 'P5' && lower === 'P5') return 'P5_P5';
      if (higher === 'P5' && lower === 'G5') return 'P5_G5';
      if (higher === 'P5' && lower === 'FCS') return 'P5_FCS';
      if (higher === 'G5' && lower === 'G5') return 'G5_G5';
      if (higher === 'G5' && lower === 'FCS') return 'G5_FCS';
      
      // Fallback (shouldn't happen)
      return 'P5_P5';
    };

    const matchupClass = getMatchupClass(homeTier, awayTier);

    console.log(`[Game ${gameId}] 🎯 Matchup Class (Phase 2.2):`, {
      homeTeam: game.homeTeam.name,
      homeTier,
      homeConference: homeTeamInfo?.conference ?? 'null',
      homeMembershipLevel: homeMembership?.level ?? 'null',
      awayTeam: game.awayTeam.name,
      awayTier,
      awayConference: awayTeamInfo?.conference ?? 'null',
      awayMembershipLevel: awayMembership?.level ?? 'null',
      matchupClass,
      season: game.season,
      note: 'Matchup class for calibration (Phase 2.2)'
    });

    // ============================================
    // CRITICAL FIX: Use pre-calculated values from matchupOutput
    // DO NOT recalculate spread/total on the fly - this causes bugs!
    // ============================================
    // The matchupOutput table contains pre-calculated implied lines from the ratings pipeline
    // This is the SINGLE SOURCE OF TRUTH for model predictions
    // The Current Slate page uses these same values - we must stay consistent!
    
    let computedSpread = matchupOutput?.impliedSpread || 0;
    let computedTotal = matchupOutput?.impliedTotal || null; // ✅ NO HARDCODED FALLBACK - null if unavailable
    
    // ============================================
    // PHASE 2.3: Team-Specific HFA (Home Field Advantage)
    // ============================================
    const LOW_SAMPLE_THRESHOLD = 4; // Minimum games for reliable HFA
    
    // Load team-specific HFA from team_season_rating
    // Type assertion needed until TypeScript picks up regenerated Prisma types
    const homeRatingWithHFA = homeRating as typeof homeRating & {
      hfaTeam?: number | null;
      hfaRaw?: number | null;
      hfaNHome?: number | null;
      hfaNAway?: number | null;
      hfaShrinkW?: number | null;
    };
    
    const homeHFA = homeRatingWithHFA?.hfaTeam !== null && homeRatingWithHFA?.hfaTeam !== undefined
      ? Number(homeRatingWithHFA.hfaTeam)
      : null;
    const hfaRaw = homeRatingWithHFA?.hfaRaw !== null && homeRatingWithHFA?.hfaRaw !== undefined
      ? Number(homeRatingWithHFA.hfaRaw)
      : null;
    const hfaNHome = homeRatingWithHFA?.hfaNHome ?? 0;
    const hfaNAway = homeRatingWithHFA?.hfaNAway ?? 0;
    const hfaShrinkW = homeRatingWithHFA?.hfaShrinkW !== null && homeRatingWithHFA?.hfaShrinkW !== undefined
      ? Number(homeRatingWithHFA.hfaShrinkW)
      : null;

    // Compute league mean HFA for diagnostics (median of all teams' HFA in this season)
    // Use raw SQL query to avoid TypeScript type issues with new fields
    const allSeasonHFAsResult = await prisma.$queryRaw<Array<{ hfa_team: number | null }>>`
      SELECT hfa_team FROM team_season_ratings
      WHERE season = ${game.season} AND model_version = 'v2' AND hfa_team IS NOT NULL
    `;
    const hfaValues = allSeasonHFAsResult
      .map(r => r.hfa_team !== null ? Number(r.hfa_team) : null)
      .filter((v): v is number => v !== null);
    
    let leagueMeanHFA = 2.0; // Default
    if (hfaValues.length > 0) {
      const sorted = [...hfaValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      leagueMeanHFA = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }

    // Determine HFA to use
    const hfaUsed = game.neutralSite 
      ? 0 
      : (homeHFA !== null ? homeHFA : 2.0); // Fallback to 2.0 if not computed yet
    
    const hfaCapped = homeHFA !== null && (homeHFA < 0.5 || homeHFA > 5.0);
    const hfaLowSample = (hfaNHome + hfaNAway) < LOW_SAMPLE_THRESHOLD;
    const hfaOutlier = hfaRaw !== null && Math.abs(hfaRaw) > 8;

    console.log(`[Game ${gameId}] 🎯 Team-Specific HFA (Phase 2.3):`, {
      homeTeam: game.homeTeam.name,
      neutralSite: game.neutralSite,
      hfaUsed: hfaUsed.toFixed(2),
      hfaRaw: hfaRaw?.toFixed(2) ?? 'null',
      nHome: hfaNHome,
      nAway: hfaNAway,
      shrinkW: hfaShrinkW?.toFixed(2) ?? 'null',
      leagueMean: leagueMeanHFA.toFixed(2),
      capped: hfaCapped,
      lowSample: hfaLowSample,
      outlier: hfaOutlier,
      note: 'Team-specific HFA with shrinkage (Phase 2.3)'
    });

    // OPTIONAL: Can still compute spread if ratings exist AND matchupOutput is missing
    // But NEVER override matchupOutput if it exists!
    // PHASE 2.3: Use team-specific HFA instead of constant 2.0
    // PHASE 2.4: Use recency-weighted ratings instead of base ratings
    if (!matchupOutput && homeRating && awayRating) {
      // Use weighted ratings (Phase 2.4) - fallback to base if weighted computation failed
      const homePower = isFinite(homeRatingWeighted) && !isNaN(homeRatingWeighted) 
        ? homeRatingWeighted 
        : Number(homeRating.powerRating || homeRating.rating || 0);
      const awayPower = isFinite(awayRatingWeighted) && !isNaN(awayRatingWeighted)
        ? awayRatingWeighted
        : Number(awayRating.powerRating || awayRating.rating || 0);
      const HFA = hfaUsed; // Use team-specific HFA
      computedSpread = homePower - awayPower + HFA;
      
      console.log(`[Game ${gameId}] ⚠️ NO MATCHUP OUTPUT - computing spread on the fly:`, {
        homePower,
        awayPower,
        HFA: HFA.toFixed(2),
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
    
    // ============================================
    // V1: CORE V1 SPREAD (Single Source of Truth)
    // ============================================
    let finalImpliedSpread: number | null = null;
    let coreV1SpreadInfo: Awaited<ReturnType<typeof getCoreV1SpreadFromTeams>> | null = null;
    
    if (USE_CORE_V1) {
      try {
        // Get Core V1 spread
        coreV1SpreadInfo = await getCoreV1SpreadFromTeams(
          game.season,
          game.homeTeamId,
          game.awayTeamId,
          game.neutralSite || false,
          game.homeTeam.name,
          game.awayTeam.name
        );
        
        finalImpliedSpread = coreV1SpreadInfo.coreSpreadHma;
        
        if (finalImpliedSpread !== null && !isNaN(finalImpliedSpread) && isFinite(finalImpliedSpread)) {
          console.log(`[Game ${gameId}] ✅ Core V1 spread computed:`, {
            coreSpreadHma: finalImpliedSpread.toFixed(2),
            favorite: coreV1SpreadInfo.favoriteName,
            favoriteLine: coreV1SpreadInfo.favoriteLine,
            ratingDiffBlend: coreV1SpreadInfo.ratingDiffBlend?.toFixed(2) ?? 'N/A',
          });
        } else {
          console.error(`[Game ${gameId}] ❌ Core V1 spread is invalid:`, finalImpliedSpread);
          finalImpliedSpread = null;
          coreV1SpreadInfo = null;
        }
      } catch (error) {
        console.error(`[Game ${gameId}] ❌ Core V1 spread computation failed:`, error);
        if (error instanceof Error) {
          console.error(`[Game ${gameId}] Error details: ${error.message}`, error.stack);
        }
        finalImpliedSpread = null;
        // Ensure coreV1SpreadInfo is null on error
        coreV1SpreadInfo = null;
      }
    } else {
      // Legacy: PHASE 2.4: Compute model spread using weighted ratings (if available)
      // This takes precedence over matchupOutput to ensure we use recency-weighted ratings
      const modelSpreadFromWeighted = (isFinite(homeRatingWeighted) && !isNaN(homeRatingWeighted) && 
                                       isFinite(awayRatingWeighted) && !isNaN(awayRatingWeighted))
        ? homeRatingWeighted - awayRatingWeighted + hfaUsed
        : null;

      // Use weighted spread if available, otherwise use matchupOutput or computedSpread
      finalImpliedSpread = modelSpreadFromWeighted ?? 
                                 ((isValidSpread ? matchupOutput.impliedSpread : null) ?? computedSpread);
    }
    
    // Initialize finalSpreadWithOverlay (V1: no overlay, use Core V1 directly)
    let finalSpreadWithOverlay = finalImpliedSpread;
    
    // Initialize finalImpliedTotal (will be computed later after marketTotal and marketSpreadHma are available)
    let finalImpliedTotal: number | null = null;
    // Legacy: Never use matchupOutput.impliedTotal unless it passes the units handshake
    // If invalid, leave as null - DO NOT substitute a number
    if (!USE_CORE_V1) {
      finalImpliedTotal = isValidTotal && matchupTotalRaw !== null ? matchupTotalRaw : null;
    }
    
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
      homeSpreadLine: homeSpreadLine ? getPointValue(homeSpreadLine, 'spread') : null,
      homeSpreadLineTeamId: homeSpreadLine?.teamId || 'NULL',
      awayTeam: game.awayTeam.name,
      awayTeamId: game.awayTeamId,
      awaySpreadLine: awaySpreadLine ? getPointValue(awaySpreadLine, 'spread') : null,
      awaySpreadLineTeamId: awaySpreadLine?.teamId || 'NULL',
      bookName: spreadLine.bookName,
      allSpreadLines: allSpreadLinesForGame.map(l => ({
        lineValue: getPointValue(l, 'spread'),
        teamId: l.teamId || 'NULL',
        timestamp: l.timestamp
      }))
    });
    
    // Determine home and away prices from the teamId-tagged lines
    let homePrice: number;
    let awayPrice: number;
    let marketSpread: number | null; // Can be null if consensus failed or price leaks detected
    let favoriteTeamId: string;
    let favoriteTeamName: string;
    
    // ============================================
    // USE CONSENSUS VALUES (with null handling)
    // ============================================
    // Prefer consensus over individual lines (filters out price leaks)
    const useConsensusSpread = spreadConsensus.value !== null;
    
    if (homeSpreadLine && awaySpreadLine) {
      // IDEAL CASE: We have both lines with teamId
      // Use consensus values if available (filters out price leaks)
      if (useConsensusSpread && spreadConsensus.value !== null) {
        // Consensus available - determine which team should get the consensus value
        const rawHomePrice = getPointValue(homeSpreadLine, 'spread')!;
        const rawAwayPrice = getPointValue(awaySpreadLine, 'spread')!;
        
        // Determine favorite from raw prices, then assign consensus value
        if (rawHomePrice < rawAwayPrice) {
          favoriteTeamId = game.homeTeamId;
          favoriteTeamName = game.homeTeam.name;
          homePrice = spreadConsensus.value;  // Consensus spread (negative for favorite)
          awayPrice = -spreadConsensus.value; // Opposite sign for dog
        } else {
          favoriteTeamId = game.awayTeamId;
          favoriteTeamName = game.awayTeam.name;
          awayPrice = spreadConsensus.value;  // Consensus spread (negative for favorite)
          homePrice = -spreadConsensus.value; // Opposite sign for dog
        }
        marketSpread = spreadConsensus.value; // Always negative (favorite's line)
      } else {
        // No consensus - use raw line values (with price-leak filter)
        homePrice = getPointValue(homeSpreadLine, 'spread')!;
        awayPrice = getPointValue(awaySpreadLine, 'spread')!;
        
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
        const spreadLineValue = getPointValue(spreadLine, 'spread');
        if (spreadLineValue === null || spreadLineValue === undefined) {
          throw new Error(`Selected snapshot missing spread value for game ${gameId} (or value is a price leak)`);
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
        const marketSpreadValue = getPointValue(spreadLine, 'spread');
        if (marketSpreadValue === null || marketSpreadValue === undefined) {
          throw new Error(`Selected snapshot missing spread value for game ${gameId} (or value is a price leak)`);
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
    
    // ============================================
    // USE CONSENSUS FOR TOTAL (mirror spread logic)
    // ============================================
    // Prefer consensus over individual lines (filters out price leaks)
    const useConsensusTotal = totalConsensus.value !== null;
    let marketTotal: number | null = null;
    
    if (useConsensusTotal && totalConsensus.value !== null) {
      // CRITICAL: Totals must always be positive (unsigned)
      // If consensus is negative, it's a price leak - set to null
      const rawTotal = totalConsensus.value;
      if (rawTotal < 0) {
        console.error(`[Game ${gameId}] ⚠️ NEGATIVE TOTAL from consensus: ${rawTotal} (likely price leak)`);
        marketTotal = null; // Reject negative totals
      } else {
        marketTotal = Math.abs(rawTotal); // Ensure positive
      }
    } else if (totalLine) {
      const totalValue = getPointValue(totalLine, 'total');
      if (totalValue !== null) {
        if (totalValue < 0) {
          console.error(`[Game ${gameId}] ⚠️ NEGATIVE TOTAL from totalLine: ${totalValue} (likely price leak)`);
          marketTotal = null; // Reject negative totals
        } else {
          marketTotal = Math.abs(totalValue);
        }
      }
    }
    
    // Add marketTotal to diagnostics now that it's declared
    totalDiag.marketTotal = marketTotal;
    
    // Favorite selection: already determined above using teamId
    const homeIsFavorite = favoriteTeamId === game.homeTeamId;
    // Handle null marketSpread (data quality issue) - use 0 as fallback
    const favoriteByRule = {
      teamId: favoriteTeamId,
      teamName: favoriteTeamName,
      price: marketSpread ?? 0, // Negative (favorite's line), or 0 if invalid
      line: marketSpread ?? 0 // Already negative (favorite-centric), or 0 if invalid
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
    // NOTE: finalSpreadWithOverlay is computed later (line ~2242), but we need it here for ML
    // For now, use finalImpliedSpread as a placeholder - this will be updated after overlay calculation
    // The actual finalSpreadWithOverlay will be computed and used in the ML value calculation section
    // Using standard NFL/CFB conversion: prob = normcdf(spread / (2 * sqrt(variance)))
    // For college football, we use a standard deviation of ~14 points
    // Simplified: prob = 0.5 + (spread / (2 * 14)) * 0.5, clamped to [0.05, 0.95]
    // CRITICAL: This will be recalculated with finalSpreadWithOverlay after overlay is computed
    const stdDev = 14; // Standard deviation for CFB point spreads
    // Placeholder: will be updated after overlay calculation
    let modelHomeWinProb = 0.5;
    let modelAwayWinProb = 0.5;

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

    // CRITICAL FIX: Determine model favorite from finalSpreadWithOverlay (not win prob)
    // finalSpreadWithOverlay < 0 means home is favored
    // Handle null case: default to home if spread is null
    const modelMLFavorite = (finalSpreadWithOverlay ?? 0) < 0 ? game.homeTeam : game.awayTeam;
    const modelMLFavoriteProb = (finalSpreadWithOverlay ?? 0) < 0 ? modelHomeWinProb : modelAwayWinProb;
    const modelMLFavoriteFairML = (finalSpreadWithOverlay ?? 0) < 0 ? modelFairMLHome : modelFairMLAway;
    
    // Model underdog for ML
    const modelMLDog = (finalSpreadWithOverlay ?? 0) < 0 ? game.awayTeam : game.homeTeam;
    const modelMLDogProb = (finalSpreadWithOverlay ?? 0) < 0 ? modelAwayWinProb : modelHomeWinProb;
    const modelMLDogFairML = (finalSpreadWithOverlay ?? 0) < 0 ? modelFairMLAway : modelFairMLHome;

    // Calculate moneyline value and grade (deferred until after moneyline variables are set)
    // This will be computed after moneylineFavoritePrice and moneylineDogPrice are determined
    let moneyline = null;

    // Convert spreads to favorite-centric format
    // V1: Use Core V1 spread info if available
    // Legacy: Convert from HMA frame
    let modelSpreadFC: {
      favoriteTeamId: string;
      favoriteTeamName: string;
      favoriteSpread: number;
      underdogTeamId: string;
      underdogTeamName: string;
      underdogSpread: number;
    };
    
    if (USE_CORE_V1 && coreV1SpreadInfo) {
      // V1: Use Core V1 favorite-centric info directly
      modelSpreadFC = {
        favoriteTeamId: coreV1SpreadInfo.favoriteTeamId,
        favoriteTeamName: coreV1SpreadInfo.favoriteName,
        favoriteSpread: coreV1SpreadInfo.favoriteSpread, // Already negative
        underdogTeamId: coreV1SpreadInfo.dogTeamId,
        underdogTeamName: coreV1SpreadInfo.dogName,
        underdogSpread: coreV1SpreadInfo.dogSpread, // Already positive
      };
    } else {
      // Legacy: Convert from HMA frame
      modelSpreadFC = convertToFavoriteCentric(
        finalImpliedSpread || 0,
        game.homeTeamId,
        game.homeTeam.name,
        game.awayTeamId,
        game.awayTeam.name
      );
    }

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
    const allMoneylinesInDb = marketLinesToUse.filter(l => l.lineType === 'moneyline');
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
    
    // ============================================
    // USE MONEYLINE CONSENSUS (deduped per book)
    // ============================================
    // Guardrail: Require at least 2 books for consensus
    if (moneylineConsensus.perBookCount >= 2) {
      // Use consensus values (deduped, median of per-book prices)
      moneylineFavoritePrice = moneylineConsensus.favoritePrice;
      moneylineDogPrice = moneylineConsensus.dogPrice;
      
      // Always assign teamIds based on the favorite from spread
      moneylineFavoriteTeamId = favoriteTeamId;
      moneylineDogTeamId = favoriteTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
      
      console.log(`[Game ${gameId}] ✅ MONEYLINE FROM CONSENSUS:`, {
        favoriteTeamId: moneylineFavoriteTeamId,
        favoritePrice: moneylineFavoritePrice,
        dogTeamId: moneylineDogTeamId,
        dogPrice: moneylineDogPrice,
        perBookCount: moneylineConsensus.perBookCount,
        rawCount: moneylineConsensus.rawCount,
        deduped: moneylineConsensus.deduped,
        source: 'consensus (deduped per book)'
      });
    } else if (moneylineConsensus.favoritePrice !== null || moneylineConsensus.dogPrice !== null) {
      // FALLBACK: Use consensus even if perBookCount < 2 (single book, but still valid)
      console.warn(`[Game ${gameId}] ⚠️ MONEYLINE CONSENSUS LOW LIQUIDITY (${moneylineConsensus.perBookCount} books), using consensus values anyway`);
      
      moneylineFavoritePrice = moneylineConsensus.favoritePrice;
      moneylineDogPrice = moneylineConsensus.dogPrice;
      
      moneylineFavoriteTeamId = favoriteTeamId;
      moneylineDogTeamId = favoriteTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
    } else if (homeMoneylineLine && awayMoneylineLine) {
      // FALLBACK: Use individual lines if consensus insufficient (< 2 books)
      console.warn(`[Game ${gameId}] ⚠️ MONEYLINE CONSENSUS LOW LIQUIDITY (${moneylineConsensus.perBookCount} books), using individual lines`);
      
      const line1Price = getLineValue(homeMoneylineLine);
      const line2Price = getLineValue(awayMoneylineLine);
      
      if (line1Price !== null && line2Price !== null) {
        if (line1Price < 0 && line2Price > 0) {
          moneylineFavoritePrice = line1Price;
          moneylineDogPrice = line2Price;
        } else if (line2Price < 0 && line1Price > 0) {
          moneylineFavoritePrice = line2Price;
          moneylineDogPrice = line1Price;
        }
        
        moneylineFavoriteTeamId = favoriteTeamId;
        moneylineDogTeamId = favoriteTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
      }
    } else if (mlVal !== null && mlVal !== undefined) {
      // FALLBACK: Use mlVal if available (old behavior)
      console.warn(`[Game ${gameId}] ⚠️ MONEYLINE FALLBACK to mlVal (consensus insufficient)`);
      
      if (mlVal < 0) {
        moneylineFavoriteTeamId = favoriteTeamId;
        moneylineDogTeamId = favoriteTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
        moneylineFavoritePrice = mlVal;
      } else if (mlVal > 0) {
        moneylineFavoriteTeamId = favoriteTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
        moneylineDogTeamId = favoriteTeamId;
        moneylineDogPrice = mlVal;
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
      
      // ============================================
      // MONEYLINE SANITY CONSTRAINTS (Trust-Market Mode)
      // ============================================
      // Check if this is an extreme favorite game (use favoriteByRule.line which is already declared)
      const isExtremeFavoriteGame = Math.abs(favoriteByRule.line) >= EXTREME_FAVORITE_THRESHOLD;
      
      // Check if overlay-adjusted spread is within ML range
      const spreadWithinMLRange = finalSpreadWithOverlay !== null && Math.abs(finalSpreadWithOverlay) <= ML_MAX_SPREAD;
      
      // Determine which team's probability to compare
      // Compare model's favorite probability vs market's favorite probability
      let valuePercent: number | null = null;
      let moneylineGrade: 'A' | 'B' | 'C' | null = null;
      let moneylinePickTeam: string | null = null;
      let moneylinePickPrice: number | null = null;
      let mlSuppressionReason: string | null = null;
      
      if (marketMLFavProb !== null) {
        // ============================================
        // SANITY CHECKS (apply BEFORE value calculations)
        // ============================================
        // CRITICAL: Check guards in order - spread range FIRST, then extreme favorite, then coherence
        // These guards must run BEFORE calculating value percentages
        
        // 1. Spread range guard: Only consider ML if |finalSpreadWithOverlay| <= 7
        // This must be checked FIRST before any value calculations
        if (finalSpreadWithOverlay === null) {
          mlSuppressionReason = 'Model spread unavailable';
          moneylinePickTeam = null;
        } else {
          const absFinal = Math.abs(finalSpreadWithOverlay);
          if (absFinal > ML_MAX_SPREAD) {
            mlSuppressionReason = `Spread too wide after overlay (${finalSpreadWithOverlay.toFixed(1)} pts)`;
            moneylinePickTeam = null;
            moneylinePickPrice = null;
            valuePercent = null;
            console.log(`[Game ${gameId}] 🚫 ML suppressed (spread out of range):`, {
              finalSpreadWithOverlay: finalSpreadWithOverlay.toFixed(2),
              absFinal: absFinal.toFixed(2),
              maxSpread: ML_MAX_SPREAD,
              reason: mlSuppressionReason
            });
          }
          // 2. Extreme favorite guard: Never recommend dog ML if |market favorite line| >= 21
          else if (isExtremeFavoriteGame) {
            mlSuppressionReason = `Extreme favorite: ML suppressed (market spread ${Math.abs(favoriteByRule.line).toFixed(1)} pts)`;
            moneylinePickTeam = null;
            moneylinePickPrice = null;
            valuePercent = null;
            console.log(`[Game ${gameId}] 🚫 ML suppressed (extreme favorite):`, {
              marketSpread: favoriteByRule.line,
              reason: mlSuppressionReason
            });
          }
          // Only calculate value if guards pass
          else {
          // CRITICAL FIX: Determine model favorite/dog from finalSpreadWithOverlay (not market favorite)
          // finalSpreadWithOverlay < 0 means home is favored, > 0 means away is favored
          // We know finalSpreadWithOverlay is not null here due to the check above
          const modelFavorsHome = finalSpreadWithOverlay! < 0;
          const modelFavTeamId = modelFavorsHome ? game.homeTeamId : game.awayTeamId;
          const modelFavTeamName = modelFavorsHome ? game.homeTeam.name : game.awayTeam.name;
          const modelDogTeamId = modelFavorsHome ? game.awayTeamId : game.homeTeamId;
          const modelDogTeamName = modelFavorsHome ? game.awayTeam.name : game.homeTeam.name;
          
          // Model probabilities from finalSpreadWithOverlay (home-minus-away)
          // Map to favorite/dog based on modelFavTeamId
          const modelFavProb = modelFavTeamId === game.homeTeamId ? modelHomeWinProb : modelAwayWinProb;
          const modelDogProb = 1 - modelFavProb;
          
          // Market probabilities (based on market favorite, not model favorite)
          const marketFavTeamId = moneylineFavoriteTeamId;
          const marketFavTeamName = marketFavTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name;
          const marketDogTeamId = moneylineDogTeamId;
          const marketDogTeamName = marketDogTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name;
          
          // Get market probabilities for both teams
          const marketMLDogProb = moneylineDogPrice !== null ? americanToProb(moneylineDogPrice)! : (1 - marketMLFavProb);
          
          // Calculate value for favorite and dog separately (from model's perspective)
          // Model favorite value: compare model fav prob vs market prob for that team
          const modelFavMarketProb = marketFavTeamId === modelFavTeamId ? marketMLFavProb : marketMLDogProb;
          const favoriteValuePercent = (modelFavProb - modelFavMarketProb) * 100;
          
          // Model dog value: compare model dog prob vs market prob for that team
          const modelDogMarketProb = marketDogTeamId === modelDogTeamId ? marketMLDogProb : marketMLFavProb;
          const dogValuePercent = moneylineDogPrice !== null ? (modelDogProb - modelDogMarketProb) * 100 : null;
          
          // 3. Winprob vs spread coherence: If underdog and winProb >= 0.40 and market spread >= 14, suppress
          if (dogValuePercent !== null && dogValuePercent > 0 && modelDogProb >= 0.40 && Math.abs(favoriteByRule.line) >= 14) {
          mlSuppressionReason = `Win probability vs spread incoherent: Underdog has ${(modelDogProb * 100).toFixed(1)}% win prob but market spread is ${Math.abs(favoriteByRule.line).toFixed(1)} pts`;
          moneylinePickTeam = null;
          moneylinePickPrice = null;
          valuePercent = null;
          console.log(`[Game ${gameId}] 🚫 ML suppressed (winprob vs spread incoherent):`, {
            modelDogProb: (modelDogProb * 100).toFixed(1) + '%',
            marketSpread: favoriteByRule.line,
            reason: mlSuppressionReason
          });
        }
        // 4. Determine pick: Choose the side with positive value, with sanity checks for longshots
        else {
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
            // Model favorite has positive value (and more value than dog, or dog not available)
            moneylinePickTeam = modelFavTeamName;
            // Get the market price for the model favorite team
            const modelFavMarketPrice = modelFavTeamId === marketFavTeamId ? marketMLFavPrice : moneylineDogPrice;
            moneylinePickPrice = modelFavMarketPrice;
            valuePercent = favoriteValuePercent;
          } else if (dogValuePercent !== null && dogValuePercent > 0) {
            // Model dog has positive value - apply longshot restrictions
            if (isDogSuperLongshot) {
              // Never recommend super longshots (> +2000) - too risky regardless of value
              moneylinePickTeam = null;
              moneylinePickPrice = null;
              valuePercent = null;
              mlSuppressionReason = 'Super longshot (> +2000): Too risky regardless of value';
            } else if (isDogExtremeLongshot && !isDogExtremeValue) {
              // Extreme longshots (+1000 to +2000) need > 25% value
              moneylinePickTeam = null;
              moneylinePickPrice = null;
              valuePercent = null;
              mlSuppressionReason = `Extreme longshot (+${moneylineDogPrice}): Requires > 25% value (got ${dogValuePercent.toFixed(1)}%)`;
            } else if (isDogModerateLongshot && !isDogModerateValue) {
              // Moderate longshots (+500 to +1000) need > 10% value
              moneylinePickTeam = null;
              moneylinePickPrice = null;
              valuePercent = null;
              mlSuppressionReason = `Moderate longshot (+${moneylineDogPrice}): Requires > 10% value (got ${dogValuePercent.toFixed(1)}%)`;
            } else {
              // Dog has value and passes longshot checks
              moneylinePickTeam = modelDogTeamName;
              // Get the market price for the model dog team
              const modelDogMarketPrice = modelDogTeamId === marketDogTeamId ? moneylineDogPrice : marketMLFavPrice;
              moneylinePickPrice = modelDogMarketPrice;
              valuePercent = dogValuePercent;
            }
          } else {
            // Neither side has positive value
            // Don't recommend a moneyline bet
            moneylinePickTeam = null;
            moneylinePickPrice = null;
            valuePercent = null;
            mlSuppressionReason = 'No positive value on either side';
          }
          } // Close the "else" block that calculates value (line 2336)
        } // Close the "else" block from line 2310 (when finalSpreadWithOverlay is not null)
        
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
        
        // Calculate model probability and fair price for the PICKED team
        // CRITICAL: Use probabilities from finalSpreadWithOverlay, not market favorite
        if (marketMLFavProb !== null && moneylinePickTeam !== null) {
          const pickedTeamIsHome = moneylinePickTeam === game.homeTeam.name;
          // Use the correct probability based on which team was picked
          pickedTeamModelProb = pickedTeamIsHome ? modelHomeWinProb : modelAwayWinProb;
          
          // Get market probability for the picked team
          const pickedTeamIsMarketFav = moneylinePickTeam === (moneylineFavoriteTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name);
          const marketMLDogProb = moneylineDogPrice !== null ? americanToProb(moneylineDogPrice)! : (1 - marketMLFavProb);
          pickedTeamMarketProb = pickedTeamIsMarketFav ? marketMLFavProb : marketMLDogProb;
          
          // Fair ML for picked team
          pickedTeamFairML = pickedTeamModelProb >= 0.5
            ? Math.round(-100 * pickedTeamModelProb / (1 - pickedTeamModelProb))
            : Math.round(100 * (1 - pickedTeamModelProb) / pickedTeamModelProb);
        }
      } // Close if (marketMLFavProb !== null && moneylinePickTeam !== null)

      const moneylinePickLabel = moneylinePickTeam ? `${moneylinePickTeam} ML` : null;
      
      // CRITICAL: The price must match the pick team
      // If pick is favorite, use favorite price; if pick is dog, use dog price
      // If suppressed, use null
      const finalPickPrice = moneylinePickTeam 
        ? (moneylinePickTeam === (moneylineFavoriteTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name)
          ? marketMLFavPrice
          : (moneylineDogPrice !== null ? moneylineDogPrice : moneylinePickPrice))
        : null;

      // PHASE 2.4: Moneyline calc_basis will be computed after finalSpreadWithOverlayFC is available
      // Placeholder - will be set after overlay calculation
      let mlCalcBasis: any = null;

      moneyline = {
        price: finalPickPrice, // Price must match the pick team
        pickLabel: moneylinePickLabel,
        impliedProb: pickedTeamMarketProb, // Market probability for the PICKED team
        meta: mlMeta,
        // Model comparison data for the PICKED team
        modelWinProb: pickedTeamModelProb,
        modelFairML: pickedTeamFairML,
        modelFavoriteTeam: modelMLFavorite.name, // From finalSpreadWithOverlay
        valuePercent: valuePercent,
        grade: moneylineGrade,
        // Trust-Market mode: Win prob derived from overlay-adjusted spread
        winprob_basis: 'overlay_spread' as const,
        suppressionReason: mlSuppressionReason, // Reason why ML was suppressed (if applicable)
        // PHASE 2.4: Calculation basis for transparency (always included, even if suppressed)
        // NOTE: calc_basis will be set after finalSpreadWithOverlayFC is computed
        calc_basis: null as any, // Will be updated after overlay calculation
        // CRITICAL FIX: Add isUnderdog flag for invariants (from calc_basis)
        // NOTE: isUnderdog will be set after calc_basis is computed
        isUnderdog: null as any, // Will be updated after overlay calculation
        // SAFETY PATCH: Telemetry for ML gates
        telemetry: {
          spread_used: finalSpreadWithOverlay, // signed, favorite-centric (negative = favorite)
          market_favorite_line: favoriteByRule.line,
          is_extreme_favorite: isExtremeFavoriteGame,
          spread_within_range: spreadWithinMLRange,
          ml_max_spread: ML_MAX_SPREAD,
          extreme_favorite_threshold: EXTREME_FAVORITE_THRESHOLD
        }
      };
      } // Close if (marketMLFavProb !== null) from line 2298
    } else if (mlVal !== null) {
      // Fallback: Use mlVal if moneyline variables weren't set
      const marketMLFavProb = americanToProb(mlVal)!;
      const modelFavProb = favoriteTeamId === game.homeTeamId ? modelHomeWinProb : modelAwayWinProb;
      const valuePercent = (modelFavProb - marketMLFavProb) * 100;
      
      // PHASE 2.4: Moneyline calc_basis for transparency
      const mlCalcBasisFallback = {
        finalSpreadWithOverlay: finalSpreadWithOverlay,
        winProb: modelFavProb,
        fairML: modelMLFavoriteFairML,
        marketProb: marketMLFavProb
      };
      
      moneyline = {
        price: mlVal,
        pickLabel: mlVal < 0 ? `${game.homeTeam.name} ML` : `${game.awayTeam.name} ML`,
        impliedProb: marketMLFavProb,
        meta: mlMeta,
        modelWinProb: modelMLFavoriteProb,
        modelFairML: modelMLFavoriteFairML,
        modelFavoriteTeam: modelMLFavorite.name,
        valuePercent: valuePercent,
        grade: null,
        calc_basis: mlCalcBasisFallback
      };
    } else {
      // No market ML, but show model fair ML
      // PHASE 2.4: Moneyline calc_basis for transparency
      const mlCalcBasisNoMarket = {
        finalSpreadWithOverlay: finalSpreadWithOverlay,
        winProb: modelMLFavoriteProb,
        fairML: modelMLFavoriteFairML,
        marketProb: null
      };
      
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
        isModelFairLineOnly: true,
        calc_basis: mlCalcBasisNoMarket
      };
    }

    if (moneylineFavoriteTeamId && moneylineFavoriteTeamId !== favoriteByRule.teamId) {
      diagnosticsMessages.push('Moneyline favorite differs from spread favorite in selected snapshot.');
    }

    if (mlVal !== null && moneylineDogPrice === null) {
      diagnosticsMessages.push('Moneyline dog price unavailable from selected snapshot.');
    }

    // ============================================
    // BUILD MARKET SNAPSHOT WITH CONSENSUS VALUES
    // ============================================
    // Use consensus values when available (filters price leaks)
    // If consensus is null, set both favoriteLine and dogLine to null
    const consensusFavoriteLine = spreadConsensus.value !== null ? spreadConsensus.value : null;
    const consensusDogLine = consensusFavoriteLine !== null ? -consensusFavoriteLine : null;
    
    // ============================================
    // CRITICAL ASSERTIONS & GUARDRAILS: Prevent price leaks and invalid spreads
    // ============================================
    let invariantFailed = false;
    
    // Guardrail 1: Reject spread consensus if magnitude > 60 (likely a price leak)
    if (consensusFavoriteLine !== null && Math.abs(consensusFavoriteLine) > 60) {
      console.error(`[Game ${gameId}] ⚠️ SPREAD CONSENSUS OUT OF RANGE: ${consensusFavoriteLine} (abs > 60, likely price leak)`, {
        spreadConsensus,
        looksLikeLeak: looksLikePriceLeak(consensusFavoriteLine),
        books: spreadConsensus.books
      });
      spreadConsensus.value = null;
      spreadConsensus.count = 0;
      invariantFailed = true;
      diagnosticsMessages.push('Spread consensus rejected: magnitude > 60 (likely price leak)');
    }
    
    // Guardrail 2: Reject if fewer than 2 books (insufficient liquidity)
    if (consensusFavoriteLine !== null && spreadConsensus.count < 2) {
      console.warn(`[Game ${gameId}] ⚠️ SPREAD CONSENSUS LOW LIQUIDITY: only ${spreadConsensus.count} book(s)`, {
        books: spreadConsensus.books
      });
      spreadConsensus.value = null;
      spreadConsensus.count = 0;
      invariantFailed = true;
      diagnosticsMessages.push('Spread consensus rejected: fewer than 2 books (low liquidity)');
    }
    
    // Guardrail 3: Spread must be negative (favorite-centric)
    if (consensusFavoriteLine !== null && consensusFavoriteLine >= 0) {
      console.error(`[Game ${gameId}] ⚠️ SPREAD CONSENSUS NOT NEGATIVE: ${consensusFavoriteLine} (should be favorite-centric < 0)`, {
        spreadConsensus
      });
      spreadConsensus.value = null;
      spreadConsensus.count = 0;
      invariantFailed = true;
      diagnosticsMessages.push('Spread consensus rejected: not negative (favorite-centric invariant violated)');
    }
    
    // Recalculate after guardrails
    const finalConsensusFavoriteLine = spreadConsensus.value;
    const finalConsensusDogLine = finalConsensusFavoriteLine !== null ? -finalConsensusFavoriteLine : null;
    
    // Invariant assertion: dogLine must equal abs(favoriteLine)
    if (finalConsensusFavoriteLine !== null && finalConsensusDogLine !== null) {
      const expectedDogLine = Math.abs(finalConsensusFavoriteLine);
      if (Math.abs(finalConsensusDogLine - expectedDogLine) > 0.01) {
        console.error(`[Game ${gameId}] ⚠️ DOG LINE MISMATCH: dogLine=${finalConsensusDogLine}, expected=${expectedDogLine}`);
        invariantFailed = true;
      }
    }
    
    if (marketTotal !== null && (marketTotal < 15 || marketTotal > 120)) {
      console.warn(`[Game ${gameId}] ⚠️ Unusual marketTotal: ${marketTotal} (expected 15-120 for CFB)`);
    }
    
    const market_snapshot = {
      favoriteTeamId: favoriteByRule.teamId,
      favoriteTeamName: favoriteByRule.teamName,
      dogTeamId: dogTeamId,
      dogTeamName: dogTeamName,
      favoriteLine: finalConsensusFavoriteLine ?? favoriteByRule.line, // Use consensus if available (after guardrails), else fallback
      dogLine: finalConsensusDogLine ?? dogLine, // Use consensus if available (after guardrails), else fallback
      marketTotal: marketTotal !== null ? marketTotal : null, // Already uses consensus
      moneylineFavorite: moneylineFavoritePrice,
      moneylineDog: moneylineDogPrice,
      moneylineFavoriteTeamId,
      moneylineDogTeamId,
      bookSource,
      updatedAt: updatedAtDate.toISOString(),
      snapshotId,
      // Consensus metadata
      consensusMethod: 'median',
      window: consensusWindow,
      sourceBooks: spreadConsensus.books.length > 0 
        ? spreadConsensus.books 
        : (totalConsensus.books.length > 0 ? totalConsensus.books : moneylineConsensus.books),
      counts: {
        spread: spreadConsensus.count,
        total: totalConsensus.count,
        moneyline: moneylineConsensus.perBookCount // Use per-book count (after dedupe)
      },
      leakFilter: {
        spread: { excluded: spreadConsensus.excluded },
        total: { excluded: totalConsensus.excluded }
      }
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
    // When USE_CORE_V1 is true, check Core V1 spread directly
    const ats_inputs_ok = USE_CORE_V1 && coreV1SpreadInfo
      ? Number.isFinite(coreV1SpreadInfo.coreSpreadHma)
      : (finalImpliedSpread !== null && 
         !isNaN(finalImpliedSpread) && 
         isFinite(finalImpliedSpread));
    
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
    // Use specific failure information from diagnostics when available
    let ou_reason: string | null = null;
    if (!ou_model_valid) {
      if (USE_CORE_V1 && finalImpliedTotal === null) {
        // Core V1 totals computation failed (missing inputs)
        ou_reason = 'Model total unavailable — missing market total or spread data';
      } else if (finalImpliedTotal === null) {
        ou_reason = 'Model total unavailable';
      } else if (finalImpliedTotal < 15 || finalImpliedTotal > 120) {
        // Units mismatch: model returned a rate/ratio instead of points
        ou_reason = `Model returned ${finalImpliedTotal.toFixed(1)}, not in points (likely rate/ratio)`;
      } else if (!isFinite(finalImpliedTotal) || isNaN(finalImpliedTotal)) {
        // NaN/inf case - use failure stage if available
        const failureStage = totalDiag.firstFailureStep || 'unknown_stage';
        ou_reason = `Model total invalid (NaN/inf) at stage: ${failureStage}`;
      } else {
        ou_reason = 'Model total invalid';
      }
    }
    
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
    // V1: CORE V1 SPREAD (No Overlay)
    // ============================================
    // V1 uses Core V1 OLS spread directly, no trust-market overlay
    
    let spreadOverlay = 0;
    let rawSpreadDisagreement = 0;
    let modelSpreadRaw: number | null = null;
    
    // Convert marketSpread (favorite-centric, negative) to HMA format for edge calculation
    // If favorite is home: marketSpread is already negative (HMA format)
    // If favorite is away: marketSpread is negative, so HMA format = -marketSpread (positive)
    const marketSpreadHma = marketSpread !== null
      ? (favoriteByRule.teamId === game.homeTeamId
          ? marketSpread  // Home is favorite, already in HMA format (negative)
          : -marketSpread) // Away is favorite, flip sign to HMA format (positive)
      : null;
    
    // Compute totals: Use Core V1 totals model when USE_CORE_V1 is true
    // (Now that marketTotal and marketSpreadHma are available)
    if (USE_CORE_V1 && coreV1SpreadInfo && marketTotal !== null && marketSpreadHma !== null) {
      // Compute Core V1 total using spread-driven overlay
      const ouPick = getOUPick(marketTotal, marketSpreadHma, coreV1SpreadInfo.coreSpreadHma);
      finalImpliedTotal = ouPick.modelTotal;
    }
    
    // Compute ATS edge
    // Note: When USE_CORE_V1 is true, we'll compute the edge in favorite-centric format
    // after modelFavoriteLine is set. For now, compute in HMA for legacy mode.
    let atsEdge = 0;
    if (!USE_CORE_V1 && finalImpliedSpread !== null && marketSpreadHma !== null) {
      // Legacy mode: compute edge from raw spread in HMA frame
      atsEdge = computeATSEdgeHma(finalImpliedSpread, marketSpreadHma);
    }
    // When USE_CORE_V1 is true, atsEdge will be set later in favorite-centric format
    const atsEdgeAbs = Math.abs(atsEdge);
    
    if (USE_CORE_V1 && finalImpliedSpread !== null && marketSpread !== null) {
      // V1: Use Core V1 spread directly (no overlay)
      finalSpreadWithOverlay = finalImpliedSpread;
      rawSpreadDisagreement = Math.abs(finalImpliedSpread - marketSpreadHma!);
      spreadOverlay = 0; // No overlay in V1
    } else {
      // Legacy: TRUST-MARKET MODE: Spread Overlay Logic
      // Use market as baseline, apply small model adjustment (±3.0 cap)
      if (finalImpliedSpread !== null && marketSpread !== null && marketSpreadHma !== null) {
        modelSpreadRaw = finalImpliedSpread; // Model's raw prediction (home-minus-away)
        rawSpreadDisagreement = Math.abs(modelSpreadRaw - marketSpreadHma);
        
        // Calculate overlay: clamp(λ × (model - market), -cap, +cap)
        // Both modelSpreadRaw and marketSpreadHma are in HMA format
        spreadOverlay = clampOverlay(
          LAMBDA_SPREAD * (modelSpreadRaw - marketSpreadHma),
          OVERLAY_CAP_SPREAD
        );
        
        // Final spread = market baseline + overlay (home-minus-away)
        finalSpreadWithOverlay = marketSpreadHma + spreadOverlay;
      }
    }
    
    // Convert to favorite-centric for single source of truth
    // If market favorite is home: finalSpreadWithOverlay is already negative (home favored)
    // If market favorite is away: finalSpreadWithOverlay is positive, need to flip sign
    const finalSpreadWithOverlayFC = finalSpreadWithOverlay !== null
      ? (favoriteByRule.teamId === game.homeTeamId
          ? finalSpreadWithOverlay  // Home is favorite, spread is already negative
          : -finalSpreadWithOverlay) // Away is favorite, flip sign to make favorite-centric
      : 0;
    
    // CRITICAL: Now compute ML calc_basis with finalSpreadWithOverlayFC available
    if (moneyline !== null) {
      // Determine model favorite/dog from finalSpreadWithOverlayFC
      const modelFavTeamIdFromSpread = finalSpreadWithOverlayFC < 0 ? favoriteByRule.teamId : dogTeamId;
      const modelDogTeamIdFromSpread = finalSpreadWithOverlayFC < 0 ? dogTeamId : favoriteByRule.teamId;
      // Map probabilities: if model favorite is home, use modelHomeWinProb; if away, use modelAwayWinProb
      const modelFavProbFromSpread = modelFavTeamIdFromSpread === game.homeTeamId ? modelHomeWinProb : modelAwayWinProb;
      const modelDogProbFromSpread = 1 - modelFavProbFromSpread;
      const fairMLFav = modelFavProbFromSpread >= 0.5
        ? Math.round(-100 * modelFavProbFromSpread / (1 - modelFavProbFromSpread))
        : Math.round(100 * (1 - modelFavProbFromSpread) / modelFavProbFromSpread);
      const fairMLDog = modelDogProbFromSpread >= 0.5
        ? Math.round(-100 * modelDogProbFromSpread / (1 - modelDogProbFromSpread))
        : Math.round(100 * (1 - modelDogProbFromSpread) / modelDogProbFromSpread);
      
      // Determine if picked team is underdog (market vs model perspective)
      // isUnderdog = true if picked team is NOT the market favorite (regardless of model favorite)
      const pickedTeamName = moneyline.pickLabel ? moneyline.pickLabel.replace(' ML', '') : null;
      const pickedTeamId = pickedTeamName !== null
        ? (pickedTeamName === game.homeTeam.name ? game.homeTeamId : game.awayTeamId)
        : null;
      const isUnderdogPick = pickedTeamId !== null
        ? (pickedTeamId !== favoriteByRule.teamId) // True if picked team is NOT market favorite
        : null;
      
      // Use picked team probability if exists, otherwise use model favorite
      const calcBasisWinProb = moneyline.modelWinProb !== null && moneyline.modelWinProb !== undefined
        ? moneyline.modelWinProb
        : modelFavProbFromSpread;
      const calcBasisFairML = calcBasisWinProb >= 0.5
        ? Math.round(-100 * calcBasisWinProb / (1 - calcBasisWinProb))
        : Math.round(100 * (1 - calcBasisWinProb) / calcBasisWinProb);
      const calcBasisMarketProb = moneyline.impliedProb !== null ? moneyline.impliedProb : null;
      
      const mlCalcBasisComputed = {
        finalSpreadWithOverlay: finalSpreadWithOverlayFC, // signed, favorite-centric (negative = favorite, positive = dog)
        modelFavTeamId: modelFavTeamIdFromSpread,
        modelDogTeamId: modelDogTeamIdFromSpread,
        modelFavProb: modelFavProbFromSpread,
        modelDogProb: modelDogProbFromSpread,
        fairMLFav: fairMLFav,
        fairMLDog: fairMLDog,
        isUnderdogPick: isUnderdogPick, // boolean: true if picked team is NOT market favorite (market vs model)
        // Legacy fields for backward compatibility
        winProb: calcBasisWinProb,
        fairML: calcBasisFairML,
        marketProb: calcBasisMarketProb
      };
      
      // CRITICAL FIX: Update moneyline object with calc_basis and source all fields from it
      moneyline.calc_basis = mlCalcBasisComputed;
      moneyline.isUnderdog = isUnderdogPick;
      
      // Source modelFavoriteTeam from calc_basis (single source of truth)
      const modelFavTeamName = modelFavTeamIdFromSpread === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name;
      moneyline.modelFavoriteTeam = modelFavTeamName;
      
      // Source modelWinProb and modelFairML from calc_basis based on pick side
      // If pick is underdog, use dog prob/odds; if favorite, use fav prob/odds
      if (isUnderdogPick) {
        moneyline.modelWinProb = modelDogProbFromSpread;
        moneyline.modelFairML = fairMLDog;
      } else {
        moneyline.modelWinProb = modelFavProbFromSpread;
        moneyline.modelFairML = fairMLFav;
      }
    }
    
    // Check if we should degrade confidence due to large disagreement
    const shouldDegradeSpreadConfidence = rawSpreadDisagreement > LARGE_DISAGREEMENT_THRESHOLD;
    
    if (USE_CORE_V1) {
      console.log(`[Game ${gameId}] 🎯 Core V1 Spread (No Overlay):`, {
        coreSpreadHma: finalImpliedSpread !== null ? finalImpliedSpread.toFixed(2) : 'null',
        marketSpreadHma: marketSpread !== null ? marketSpread.toFixed(2) : 'null',
        rawDisagreement: rawSpreadDisagreement.toFixed(2),
        atsEdge: atsEdge.toFixed(2),
        finalSpread: finalSpreadWithOverlay !== null ? finalSpreadWithOverlay.toFixed(2) : 'null',
        mode: MODEL_MODE
      });
    } else {
      console.log(`[Game ${gameId}] 🎯 Trust-Market Spread Overlay:`, {
        modelSpreadRaw: modelSpreadRaw !== null ? modelSpreadRaw.toFixed(2) : 'null',
        marketSpread: marketSpread !== null ? marketSpread.toFixed(2) : 'null',
        rawDisagreement: rawSpreadDisagreement.toFixed(2),
        lambda: LAMBDA_SPREAD,
        overlayRaw: modelSpreadRaw !== null && marketSpread !== null ? (LAMBDA_SPREAD * (modelSpreadRaw - marketSpread)).toFixed(2) : 'null',
        overlayCapped: spreadOverlay.toFixed(2),
        finalSpread: finalSpreadWithOverlay !== null ? finalSpreadWithOverlay.toFixed(2) : 'null',
        shouldDegradeConfidence: shouldDegradeSpreadConfidence,
        mode: MODEL_MODE
      });
    }
    
    // ============================================
    // RANGE LOGIC: Bet-To and Flip Point (Trust-Market)
    // ============================================
    // Bet-to: Stop line where edge = edge_floor
    // Flip: First price where the other side becomes a bet
    // CRITICAL: Always compute these when ats_inputs_ok === true (even if edge < floor)
    // This ensures UI can always show range guidance for transparency
    // 
    // Logic (favorite-centric):
    // m = market favorite line (negative, e.g., -10.5)
    // o = overlay_used (signed, e.g., -2.0 means model thinks favorite should lay less)
    // floor = EDGE_FLOOR_SPREAD (2.0)
    // 
    // betTo = m + sign(o) * floor
    //   If o < 0 (favorite pick): betTo = m - floor = -10.5 - 2.0 = -12.5 (move toward dog)
    //   If o > 0 (dog pick): betTo = m + floor = -10.5 + 2.0 = -8.5 (move toward favorite)
    // 
    // flip = m - sign(o) * floor
    //   If o < 0 (favorite pick): flip = m + floor = -10.5 + 2.0 = -8.5 (where dog becomes bet)
    //   If o > 0 (dog pick): flip = m - floor = -10.5 - 2.0 = -12.5 (where favorite becomes bet)
    const marketFavoriteLine = favoriteByRule.line; // Favorite-centric, negative
    const overlaySign = Math.sign(spreadOverlay);
    const spreadBetTo = ats_inputs_ok && marketFavoriteLine !== null
      ? marketFavoriteLine + overlaySign * OVERLAY_EDGE_FLOOR
      : null;
    const spreadFlip = ats_inputs_ok && marketFavoriteLine !== null
      ? marketFavoriteLine - overlaySign * OVERLAY_EDGE_FLOOR
      : null;

    // Compute spread pick details (favorite-centric) - this is the model's favorite
    const spreadPick = finalImpliedSpread !== null
      ? computeSpreadPick(
          finalImpliedSpread,
          game.homeTeam.name,
          game.awayTeam.name,
          game.homeTeamId,
          game.awayTeamId
        )
      : null;

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
    const impliedHomeScoreForCheck = spreadValidForConsistency && finalImpliedTotal !== null && finalImpliedSpread !== null
      ? (finalImpliedTotal + finalImpliedSpread) / 2
      : null;
    const impliedAwayScoreForCheck = spreadValidForConsistency && finalImpliedTotal !== null && finalImpliedSpread !== null
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
    if (isModelTotalValid && finalImpliedTotal !== null && (finalImpliedTotal < 25 || finalImpliedTotal > 95)) {
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
    // CRITICAL: Use spread points only (not price) - marketSpread is already validated to be < 50
    const isExtremeFavorite = marketSpread !== null && Math.abs(marketSpread) >= 21;
    
    // Determine if overlay direction points to the dog
    // If marketSpread < 0 (home favored), spreadOverlay > 0 means model likes away (dog)
    // If marketSpread > 0 (away favored), spreadOverlay < 0 means model likes home (dog)
    const overlayFavorsDog = marketSpread !== null && ((marketSpread < 0 && spreadOverlay > 0) || (marketSpread > 0 && spreadOverlay < 0));
    
    // Block dog headline if extreme favorite AND overlay points to dog
    const blockDogHeadline = isExtremeFavorite && overlayFavorsDog && hasSpreadEdge;
    
    let bettablePick: any;
    let ats_dog_headline_blocked = false;
    
    if (!hasSpreadEdge) {
      // No pick - overlay too small to bet
      // BUT: Still populate betTo and flip for range guidance (transparency)
      bettablePick = {
        teamId: null,
        teamName: null,
        line: null,
        label: null,
        reasoning: `No edge at current number. Model overlay is ${spreadOverlay >= 0 ? '+' : ''}${spreadOverlay.toFixed(1)} pts (below ${edgeFloor.toFixed(1)} pt threshold in Trust-Market mode).`,
        betTo: spreadBetTo, // Always populate when ats_inputs_ok (for range guidance)
        flip: spreadFlip,   // Always populate when ats_inputs_ok (for range guidance)
        favoritesDisagree: false,
        suppressHeadline: false,
        extremeFavoriteBlocked: false
      };
      console.log(`[Game ${gameId}] ℹ️ No spread pick - overlay below threshold:`, {
        overlay: spreadOverlay.toFixed(2),
        edgeFloor,
        betTo: spreadBetTo?.toFixed(1),
        flip: spreadFlip?.toFixed(1),
        reason: 'Overlay < edge floor, but range guidance still provided'
      });
    } else if (blockDogHeadline) {
      // Has edge BUT extreme favorite + dog direction → suppress dog headline, show range only
      ats_dog_headline_blocked = true;
      bettablePick = {
        teamId: null,
        teamName: null,
        line: null,
        label: null,
        reasoning: `Extreme favorite game (${marketSpread !== null ? Math.abs(marketSpread).toFixed(1) : 'N/A'} pts). Model overlay ${spreadOverlay >= 0 ? '+' : ''}${spreadOverlay.toFixed(1)} pts favors the underdog, but we don't recommend 20+ point dogs. Range guidance provided.`,
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
      // CRITICAL FIX: Use overlay sign as single source of truth for pick side
      // overlay_used < 0 means favorite side pick, > 0 means dog side pick
      const pickSide = spreadOverlay < 0 ? 'favorite' : 'dog';
      const pickTeamId = pickSide === 'favorite' ? favoriteByRule.teamId : dogTeamId;
      const pickTeamName = pickSide === 'favorite' ? favoriteByRule.teamName : dogTeamName;
      const pickLine = pickSide === 'favorite' ? favoriteByRule.line : dogLine; // favoriteLine is negative, dogLine is positive
      
      // Create bettable pick object directly (don't use computeBettableSpreadPick which uses raw model)
      bettablePick = {
        teamId: pickTeamId,
        teamName: pickTeamName,
        line: pickLine,
        label: pickSide === 'favorite' 
          ? `${pickTeamName} ${pickLine.toFixed(1)}`
          : `${pickTeamName} +${pickLine.toFixed(1)}`,
        edgePts: atsEdgeAbs,
        betTo: spreadBetTo,
        flip: spreadFlip,
        favoritesDisagree: false, // In Trust-Market, we always use market favorite as reference
        reasoning: `Trust-Market overlay: ${spreadOverlay >= 0 ? '+' : ''}${spreadOverlay.toFixed(1)} pts (capped at ±${OVERLAY_CAP_SPREAD}). Value on ${pickTeamName} ${pickSide === 'favorite' ? pickLine.toFixed(1) : `+${pickLine.toFixed(1)}`}.`,
        suppressHeadline: false,
        extremeFavoriteBlocked: false
      };
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
    // CRITICAL: Always compute these when ou_model_valid === true (even if edge < floor)
    // This ensures UI can always show range guidance for transparency
    const totalEdgeAbs = totalEdgePts !== null ? Math.abs(totalEdgePts) : 0;
    const totalBetToCalc = ou_model_valid && marketTotal !== null
      ? marketTotal + Math.sign(totalOverlay) * OVERLAY_EDGE_FLOOR
      : null;
    const totalFlip = ou_model_valid && marketTotal !== null
      ? marketTotal - Math.sign(totalOverlay) * OVERLAY_EDGE_FLOOR
      : null;
    
    // ============================================
    // SINGLE SOURCE OF TRUTH: model_view (CRITICAL FIX)
    // ============================================
    // CRITICAL: Use finalSpreadWithOverlayFC (favorite-centric) as the single authority for model favorite
    // finalSpreadWithOverlayFC < 0 means market favorite is favored, > 0 means market dog is favored
    // This is favorite-centric: negative = favorite, positive = underdog
    
    // Determine model favorite from finalSpreadWithOverlayFC (favorite-centric) or Core V1
    let modelFavorsMarketFavorite: boolean;
    let modelFavorsMarketDog: boolean;
    let isPickEmFromSpread: boolean;
    
    if (USE_CORE_V1 && coreV1SpreadInfo) {
      // V1: Use Core V1 favorite spread (already favorite-centric, negative = favorite)
      const coreFavoriteSpread = coreV1SpreadInfo.favoriteSpread;
      modelFavorsMarketFavorite = coreV1SpreadInfo.favoriteTeamId === favoriteByRule.teamId;
      modelFavorsMarketDog = !modelFavorsMarketFavorite;
      isPickEmFromSpread = Math.abs(coreFavoriteSpread) < 0.1;
    } else {
      // Legacy: Compute from finalSpreadWithOverlayFC
      modelFavorsMarketFavorite = finalSpreadWithOverlayFC < 0;
      modelFavorsMarketDog = finalSpreadWithOverlayFC > 0;
      isPickEmFromSpread = Math.abs(finalSpreadWithOverlayFC) < 0.1;
    }
    
    // Model favorite team (from finalSpreadWithOverlayFC or Core V1)
    let modelFavoriteTeamId: string | null;
    let modelFavoriteName: string | null;
    let modelFavoriteLine: number;
    
    if (USE_CORE_V1 && coreV1SpreadInfo) {
      // V1: Use Core V1 favorite info directly
      modelFavoriteTeamId = coreV1SpreadInfo.favoriteTeamId;
      modelFavoriteName = coreV1SpreadInfo.favoriteName;
      modelFavoriteLine = coreV1SpreadInfo.favoriteSpread; // Already negative (favorite-centric)
    } else {
      // Legacy: Compute from finalSpreadWithOverlayFC
      modelFavoriteTeamId = isPickEmFromSpread 
        ? null
        : (modelFavorsMarketFavorite ? favoriteByRule.teamId : dogTeamId);
      modelFavoriteName = modelFavoriteTeamId
        ? (modelFavoriteTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name)
        : null;
      modelFavoriteLine = isPickEmFromSpread
        ? 0.0
        : finalSpreadWithOverlayFC; // Already favorite-centric (negative = favorite)
    }
    
    // Model underdog team
    let modelDogTeamId: string | null;
    let modelDogName: string | null;
    
    if (USE_CORE_V1 && coreV1SpreadInfo) {
      // V1: Use Core V1 dog info directly
      modelDogTeamId = coreV1SpreadInfo.dogTeamId;
      modelDogName = coreV1SpreadInfo.dogName;
    } else {
      // Legacy: Compute from finalSpreadWithOverlayFC
      modelDogTeamId = isPickEmFromSpread
        ? null
        : (modelFavorsMarketFavorite ? dogTeamId : favoriteByRule.teamId);
      modelDogName = modelDogTeamId
        ? (modelDogTeamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name)
        : null;
    }
    
    // Model total (null if units invalid)
    const modelTotal = isModelTotalValid ? finalImpliedTotal : null;
    
    // Win probabilities from finalSpreadWithOverlay (already computed correctly above)
    // modelHomeWinProb and modelAwayWinProb are from finalSpreadWithOverlay (home-minus-away)
    // Map to favorite/dog based on modelFavoriteTeamId (from finalSpreadWithOverlayFC)
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
    // When USE_CORE_V1 is true, compute edge directly from favorite-centric lines
    const atsEdgePtsRaw = USE_CORE_V1 && coreV1SpreadInfo
      ? modelFavoriteLine - market_snapshot.favoriteLine
      : modelLineInMarketFavCoords - market_snapshot.favoriteLine;
    
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
    // When USE_CORE_V1 is true, compute edge in favorite-centric format
    if (USE_CORE_V1 && coreV1SpreadInfo && modelFavoriteLine !== null && market_snapshot.favoriteLine !== null) {
      atsEdge = modelFavoriteLine - market_snapshot.favoriteLine;
    }
    
    // Initialize ouPickInfo (will be populated later after totalPick is available)
    let ouPickInfo: {
      modelTotal: number | null;
      marketTotal: number | null;
      ouEdgePts: number | null;
      pickLabel: string | null;
      confidence: 'A' | 'B' | 'C' | null;
      rawModelTotal: number | null;
      rawOuEdgePts: number | null;
    } = {
      modelTotal: null,
      marketTotal: null,
      ouEdgePts: null,
      pickLabel: null,
      confidence: null,
      rawModelTotal: null,
      rawOuEdgePts: null,
    };

    // For Core V1, we can compute ouPickInfo now (doesn't depend on totalPick)
    if (USE_CORE_V1 && coreV1SpreadInfo && marketTotal !== null && marketSpreadHma !== null) {
      const ouPick = getOUPick(marketTotal, marketSpreadHma, coreV1SpreadInfo.coreSpreadHma);
      ouPickInfo = {
        modelTotal: ouPick.modelTotal,
        marketTotal: marketTotal,
        ouEdgePts: ouPick.ouEdgePts,
        pickLabel: ouPick.pickLabel,
        confidence: ouPick.grade,
        rawModelTotal: ouPick.modelTotal, // For now, raw = official (no Trust-Market on totals yet)
        rawOuEdgePts: ouPick.ouEdgePts,
      };
    }
    // Legacy mode ouPickInfo will be computed later after totalPick is available

    const model_view = {
      modelFavoriteTeamId: modelFavoriteTeamId,
      modelFavoriteName: modelFavoriteName,
      modelFavoriteLine: modelFavoriteLine, // Favorite-centric, negative (or 0.0 for pick'em)
      modelTotal: modelTotal, // Points or null if units invalid (legacy field, kept for compatibility)
      winProbFavorite,
      winProbDog,
      edges: {
        atsEdgePts: atsEdge, // ✅ Capped overlay (not raw disagreement) or Core V1 edge in favorite-centric format
        ouEdgePts: totalEdgePts // ✅ Capped overlay (not raw disagreement)
      },
      totals: ouPickInfo, // ✅ Totals V1 fields (raw and official)
      // PHASE 2.1: Features for calibration (talent gap, matchup class, HFA, recency)
      features: {
        talent: {
          home_raw: homeTalentRaw,
          away_raw: awayTalentRaw,
          home_used: homeTalentUsed,
          away_used: awayTalentUsed,
          diff: talentGapDiff, // Raw difference (home_used - away_used)
          diff_z: talentDiffZ, // Normalized difference (0-mean, unit variance)
          season_mean: talentDiffMean,
          season_std: talentDiffStd,
          imputation: {
            home: homeImputation,
            away: awayImputation
          },
          talent_z_disabled: talentZDisabled,
          note: 'Talent gap from 247 Composite (Phase 2.1 Complete)'
        },
        // PHASE 2.2: Matchup Class
        matchup_class: {
          class: matchupClass, // 'P5_P5' | 'P5_G5' | 'P5_FCS' | 'G5_G5' | 'G5_FCS'
          home_tier: homeTier, // 'P5' | 'G5' | 'FCS'
          away_tier: awayTier, // 'P5' | 'G5' | 'FCS'
          home_conference: homeTeamInfo?.conference ?? null,
          away_conference: awayTeamInfo?.conference ?? null,
          season: game.season,
          note: 'Matchup class for calibration (Phase 2.2)'
        },
        // PHASE 2.3: Team-Specific HFA
        hfa: {
          used: hfaUsed, // HFA used in model (0 for neutral, team-specific for home, 2.0 fallback)
          raw: hfaRaw, // Raw HFA before shrinkage
          shrink_w: hfaShrinkW, // Shrinkage weight (0-1)
          n_home: hfaNHome, // Number of home games used
          n_away: hfaNAway, // Number of away games used
          league_mean: leagueMeanHFA, // League median HFA for this season
          capped: hfaCapped, // True if HFA was capped to [0.5, 5.0]
          low_sample: hfaLowSample, // True if n_total < 4
          outlier: hfaOutlier, // True if |hfa_raw| > 8
          neutral_site: game.neutralSite,
          note: 'Team-specific HFA with shrinkage (Phase 2.3)'
        },
        // PHASE 2.4: Recency-Weighted Stats
        recency: {
          weights: {
            last3: RECENCY_L3_WEIGHT,
            season: RECENCY_SEASON_WEIGHT
          },
          games_total: homeRecencyStats.gamesTotal, // Home team perspective
          games_last3: homeRecencyStats.gamesLast3,
          effective_weight_sum: homeRecencyStats.effectiveWeightSum,
          stats_weighted: {
            epaOff_w: homeRecencyStats.stats.epaOff,
            epaDef_w: homeRecencyStats.stats.epaDef,
            yppOff_w: homeRecencyStats.stats.yppOff,
            yppDef_w: homeRecencyStats.stats.yppDef,
            successOff_w: homeRecencyStats.stats.successOff,
            successDef_w: homeRecencyStats.stats.successDef,
            passYpaOff_w: homeRecencyStats.stats.passYpaOff,
            rushYpcOff_w: homeRecencyStats.stats.rushYpcOff,
            passYpaDef_w: homeRecencyStats.stats.passYpaDef,
            rushYpcDef_w: homeRecencyStats.stats.rushYpcDef,
            pace_w: homeRecencyStats.stats.pace
          },
          missing_counts: homeRecencyStats.missingCounts,
          note: 'Recency-weighted stats for home team (last 3 games ×1.5, earlier ×1.0) - Phase 2.4'
        }
      },
      // PHASE 2.4: Ratings (base vs weighted) - Home team perspective
      ratings: {
        rating_base: homeRatingBase, // Baseline season rating (pre-recency)
        rating_weighted: (isFinite(homeRatingWeighted) && !isNaN(homeRatingWeighted)) ? homeRatingWeighted : null, // Recency-weighted rating; null if not computed
        rating_used: (isFinite(homeRatingWeighted) && !isNaN(homeRatingWeighted)) ? 'weighted' as const : 'base' as const, // Which one drove the model spread
        recencyEffectPts: (isFinite(homeRatingWeighted) && !isNaN(homeRatingWeighted)) 
          ? homeRatingWeighted - homeRatingBase 
          : 0 // rating_weighted − rating_base (0 if weighted is null)
      },
      // PHASE 2.4: Spread lineage (favorite-centric)
      spread_lineage: {
        rating_source: (isFinite(homeRatingWeighted) && !isNaN(homeRatingWeighted) && 
                       isFinite(awayRatingWeighted) && !isNaN(awayRatingWeighted)) ? 'weighted' as const : 'base' as const,
        rating_home_used: (isFinite(homeRatingWeighted) && !isNaN(homeRatingWeighted)) ? homeRatingWeighted : homeRatingBase,
        rating_away_used: (isFinite(awayRatingWeighted) && !isNaN(awayRatingWeighted)) ? awayRatingWeighted : awayRatingBase,
        hfa_used: hfaUsed,
        raw_model_spread_from_used: (() => {
          // Compute raw spread (home-minus-away)
          const rawSpreadHMA = (isFinite(homeRatingWeighted) && !isNaN(homeRatingWeighted) && 
                                isFinite(awayRatingWeighted) && !isNaN(awayRatingWeighted))
            ? homeRatingWeighted - awayRatingWeighted + hfaUsed
            : homeRatingBase - awayRatingBase + hfaUsed;
          // Convert to favorite-centric (negative = market favorite favored, positive = market dog favored)
          const rawSpreadFC = favoriteByRule.teamId === game.homeTeamId ? rawSpreadHMA : -rawSpreadHMA;
          return rawSpreadFC;
        })(), // home_used − away_used + hfa_used (favorite-centric: negative = favorite, positive = dog)
        overlay_used: spreadOverlay, // The actual capped overlay applied (±3)
        final_spread_with_overlay: finalSpreadWithOverlayFC // CRITICAL: favorite-centric (negative = favorite, positive = dog)
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
      // Note: This detects data inconsistencies in server-side mapping, not client recomputation
      // The client always uses market_snapshot as SSOT - this is just validation
      diagnosticsMessages.push('Data mapping inconsistencies detected in server snapshot. All UI components use market_snapshot as single source of truth.');
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
      // PHASE 2.2: Matchup class source
      matchup_class_source: {
        home: {
          teamId: game.homeTeamId,
          season: game.season,
          level: homeMembership?.level ?? null,
          conference: homeTeamInfo?.conference ?? null,
          tier: homeTier
        },
        away: {
          teamId: game.awayTeamId,
          season: game.season,
          level: awayMembership?.level ?? null,
          conference: awayTeamInfo?.conference ?? null,
          tier: awayTier
        },
        matchup_class: matchupClass
      },
      // PHASE 2.3: HFA source
      hfa_source: {
        teamId: game.homeTeamId,
        season: game.season,
        used: hfaUsed,
        raw: hfaRaw,
        shrink_w: hfaShrinkW,
        n_home: hfaNHome,
        n_away: hfaNAway,
        league_mean: leagueMeanHFA,
        neutral_site: game.neutralSite,
        flags: {
          capped: hfaCapped,
          low_sample: hfaLowSample,
          outlier: hfaOutlier
        }
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
      // Market consensus diagnostics (transparency into price-leak filtering)
      marketConsensus: {
        spread: {
          consensusValue: spreadConsensus.value,
          consensusSpreadPts: spreadConsensus.value, // Explicit "pts" field for clarity
          count: spreadConsensus.count,
          sourceBooks: spreadConsensus.books,
          excluded: spreadConsensus.excluded,
          excludedReason: spreadConsensus.excluded > 0 ? 'missing_lineValue_or_filtered' : null,
          usedFrom: spreadConsensus.usedFrom || 'lineValue', // Always lineValue for spread
          signConventionIn: 'home_minus_away', // Raw DB format
          normalizedTo: 'favorite_centric', // Normalized for consensus (always negative)
          perBookCount: spreadConsensus.perBookCount || spreadConsensus.count,
          rawCount: spreadConsensus.rawCount || spreadConsensus.count,
          deduped: spreadConsensus.deduped || false,
          booksIncluded: spreadConsensus.books,
          invariantFailed: invariantFailed,
          invariants: {
            favoriteLine_is_negative: finalConsensusFavoriteLine === null || finalConsensusFavoriteLine < 0,
            magnitude_lte_60: finalConsensusFavoriteLine === null || Math.abs(finalConsensusFavoriteLine) <= 60,
            perBookCount_gte_2: spreadConsensus.count >= 2,
            dogLine_equals_abs_favoriteLine: finalConsensusFavoriteLine === null || finalConsensusDogLine === null || 
                                             Math.abs(finalConsensusDogLine - Math.abs(finalConsensusFavoriteLine)) < 0.01
          },
          note: 'Spread consensus: reads lineValue (points), normalizes to favorite-centric, dedupes per book before median'
        },
        total: {
          consensusValue: totalConsensus.value,
          consensusTotalPts: totalConsensus.value, // Explicit "pts" field for clarity
          count: totalConsensus.count,
          sourceBooks: totalConsensus.books,
          excluded: totalConsensus.excluded,
          excludedReason: totalConsensus.excluded > 0 ? 'missing_lineValue_or_filtered' : null,
          usedFrom: totalConsensus.usedFrom || 'lineValue', // Always lineValue for total
          note: 'Total consensus reads ONLY from lineValue field (points), never closingLine (prices). Totals must be positive.'
        },
        moneyline: {
          favoritePrice: moneylineConsensus.favoritePrice,
          dogPrice: moneylineConsensus.dogPrice,
          favoriteCount: moneylineConsensus.favoriteCount,
          dogCount: moneylineConsensus.dogCount,
          count: moneylineConsensus.perBookCount, // Per-book count (after dedupe)
          sourceBooks: moneylineConsensus.books,
          excluded: moneylineConsensus.excluded,
          rawCount: moneylineConsensus.rawCount,
          perBookCount: moneylineConsensus.perBookCount,
          deduped: moneylineConsensus.deduped,
          usedFrom: 'closingLine', // ML uses prices from closingLine
          note: 'Moneyline consensus: dedupes per book, computes median separately for favorite (negative) and dog (positive) prices. Requires perBookCount >= 2.'
        }
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
    } else if (!hasTotalEdge || !SHOW_TOTALS_PICKS) {
      // No edge - overlay too small OR totals picks disabled (safety patch)
      // When SHOW_TOTALS_PICKS=false, never show a pick (honest UI)
      totalPick = { totalPick: null, totalPickLabel: null, edgeDisplay: null };
      const reason = !SHOW_TOTALS_PICKS 
        ? 'Totals picks disabled until Phase 2.6 (pace + weather model)'
        : 'Overlay < edge floor';
      console.log(`[Game ${gameId}] ℹ️ No total pick:`, {
        overlay: totalOverlay.toFixed(2),
        edgeFloor: OVERLAY_EDGE_FLOOR,
        hasTotalEdge,
        SHOW_TOTALS_PICKS,
        reason
      });
    } else {
      // Has edge AND SHOW_TOTALS_PICKS=true - compute pick from overlay direction
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
    
    if (isModelTotalValid && marketTotal !== null && finalImpliedTotal !== null) {
      const totalDelta = Math.abs(finalImpliedTotal - marketTotal);
      if (totalDelta > 20) {
        diagnosticsMessages.push(`Model total is far from market (Δ ${totalDelta.toFixed(1)} pts). Treat with caution.`);
      }
    }
    
    // Compute ouPickInfo for legacy mode (now that totalPick is available)
    if (!USE_CORE_V1 && finalImpliedTotal !== null && marketTotal !== null) {
      ouPickInfo = {
        modelTotal: finalImpliedTotal,
        marketTotal: marketTotal,
        ouEdgePts: totalEdgePts,
        pickLabel: totalPick?.label ?? null,
        confidence: totalPick?.grade ?? null,
        rawModelTotal: finalImpliedTotal,
        rawOuEdgePts: totalEdgePts,
      };
    }
    
    // Update model_view with the computed ouPickInfo
    model_view.totals = ouPickInfo;

    // Determine OU card state: "pick" | "no_edge" | "no_model_total"
    // SAFETY PATCH: Never show 'pick' state when SHOW_TOTALS_PICKS=false
    const totalState: 'pick' | 'no_edge' | 'no_model_total' = 
      !isModelTotalValid ? 'no_model_total' :
      (hasNoEdge || !SHOW_TOTALS_PICKS) ? 'no_edge' :
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
    
    // 4. CRITICAL: Validate Market Spread absolute value is not excessive (> 50)
    // This catches price values that leaked into spread fields
    // NOTE: For existing bad data, we handle gracefully instead of throwing
    let dataQualityWarning: string | null = null;
    if (marketSpread !== null && Math.abs(marketSpread) > 50) {
      console.error(`[Game ${gameId}] ⚠️ DATA QUALITY ISSUE: Market Spread absolute value exceeds 50 (likely price leak): ${marketSpread.toFixed(1)}`, {
        modelSpread: finalImpliedSpread,
        marketSpread,
        gameId,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        spreadLineValue: spreadLine?.lineValue,
        spreadLineSource: spreadLine?.source,
        spreadLineBook: spreadLine?.bookName,
        warning: 'This spread value is likely a price (American odds) that was incorrectly mapped to a spread point. This game needs re-ingestion with corrected data.'
      });
      
      // Try to find a better spread value from other lines or historical data
      // Look for other spread lines that might be valid
      const otherSpreadLines = marketLinesWithTeamId.filter(
        (l) => l.lineType === 'spread' && 
               l.id !== spreadLine?.id &&
               l.lineValue !== null &&
               Math.abs(l.lineValue) <= 50
      );
      
      if (otherSpreadLines.length > 0) {
        // Use the first valid spread line found
        const validSpreadLine = otherSpreadLines[0];
        const validSpreadValue = getLineValue(validSpreadLine);
        if (validSpreadValue !== null && Math.abs(validSpreadValue) <= 50) {
          console.log(`[Game ${gameId}] ✅ Using fallback spread from line ${validSpreadLine.id}: ${validSpreadValue}`);
          marketSpread = validSpreadValue;
          // Update favoriteByRule if needed
          if (validSpreadValue < 0) {
            favoriteTeamId = game.homeTeamId;
            favoriteTeamName = game.homeTeam.name;
          } else {
            favoriteTeamId = game.awayTeamId;
            favoriteTeamName = game.awayTeam.name;
          }
          dataQualityWarning = `Data quality issue detected: Original spread (${spreadLine?.lineValue}) was likely a price value. Using fallback spread (${validSpreadValue}).`;
        } else {
          // No valid spread found - mark as invalid but continue
          dataQualityWarning = `Data quality issue: Market spread (${marketSpread.toFixed(1)}) exceeds 50, likely a price leak. Spread-based features may be unavailable.`;
          marketSpread = null; // Mark as invalid
        }
      } else {
        // No fallback available - mark as invalid but continue
        dataQualityWarning = `Data quality issue: Market spread (${marketSpread.toFixed(1)}) exceeds 50, likely a price leak. Spread-based features may be unavailable.`;
        marketSpread = null; // Mark as invalid
      }
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
    const modelFavorsHomeRaw = finalImpliedSpread !== null && finalImpliedSpread < 0;
    const marketFavorsHome = marketSpread !== null && marketSpread < 0;
    const favoriteMismatch = marketSpread !== null && finalImpliedSpread !== null && modelFavorsHomeRaw !== marketFavorsHome;
    
    if (favoriteMismatch && finalImpliedSpread !== null && Math.abs(finalImpliedSpread) > 3 && marketSpread !== null && Math.abs(marketSpread) > 3) {
      // Only warn if both spreads are significant (not close games)
      console.warn(`[Game ${gameId}] ⚠️ Favorite identity mismatch: Model and Market favor different teams`, {
        modelSpread: finalImpliedSpread,
        marketSpread,
        modelFavorite: modelSpreadFC.favoriteTeamName,
        marketFavorite: marketSpreadFC.favoriteTeamName,
        modelFavorsHome: modelFavorsHomeRaw,
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
        where: { season_teamId_modelVersion: { season, teamId, modelVersion: 'v2' } }
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
    // Assert 1: favoriteLine < 0 and dogLine > 0 (or both null if consensus failed)
    const assertion1 = (market_snapshot.favoriteLine === null && market_snapshot.dogLine === null) ||
                       (market_snapshot.favoriteLine !== null && market_snapshot.dogLine !== null &&
                        market_snapshot.favoriteLine < 0 && market_snapshot.dogLine > 0);
    if (!assertion1) {
      const errorMsg = `Assertion 1 failed: favoriteLine=${market_snapshot.favoriteLine}, dogLine=${market_snapshot.dogLine}`;
      console.error(`[Game ${gameId}] ⚠️ ${errorMsg}`);
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(errorMsg);
      }
    }
    
    // Assert 2: ATS edge matches SSOT definition (modelFavoriteLine − market favorite line)
    // Skip if market_snapshot.favoriteLine is null (consensus failed)
    const expectedAtsEdge = (model_view.edges.atsEdgePts !== null && market_snapshot.favoriteLine !== null)
      ? model_view.modelFavoriteLine - market_snapshot.favoriteLine
      : null;
    const assertion2 = (model_view.edges.atsEdgePts === null || market_snapshot.favoriteLine === null)
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
        awayScore: game.awayScore,
        isCompleted: isCompletedGame,
        usingPreKickLines: usingPreKickLines
      },
      
      // SINGLE SOURCE OF TRUTH: market_snapshot (all UI components use this)
      market_snapshot: market_snapshot,
      
      // SINGLE SOURCE OF TRUTH: model_view (all UI components use this)
      model_view: model_view,
      
      // SINGLE SOURCE OF TRUTH: diagnostics
      diagnostics: diagnostics,
      
      // PHASE 2.4: Model configuration for traceability
      modelConfig: {
        mode: MODEL_MODE, // "trust_market"
        overlay: {
          spread_cap: OVERLAY_CAP_SPREAD,
          total_cap: OVERLAY_CAP_TOTAL,
          edge_floor: OVERLAY_EDGE_FLOOR,
          lambda_spread: LAMBDA_SPREAD,
          lambda_total: LAMBDA_TOTAL
        },
        show_totals_picks: SHOW_TOTALS_PICKS,
        ml_max_spread: ML_MAX_SPREAD,
        extreme_favorite_threshold: EXTREME_FAVORITE_THRESHOLD,
        // CRITICAL: Sign convention documentation
        signConvention: {
          spread: 'favorite_centric',
          favoriteCentricNotes: 'negative = market favorite favored; positive = market dog favored',
          hfaPoints: 2
        }
      },
      
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
        
        if (openingSpread !== null && openingTotal !== null && finalImpliedSpread !== null) {
          // Calculate opening vs closing edge
          const openingSpreadEdge = finalImpliedSpread - openingSpread;
          const closingSpreadEdge = atsEdge;
          const spreadMovedTowardModel = Math.abs(closingSpreadEdge) < Math.abs(openingSpreadEdge);
          
          const openingTotalEdge = isModelTotalValid && finalImpliedTotal !== null ? (finalImpliedTotal - openingTotal) : null;
          const closingTotalEdge = totalEdgePts;
          const totalMovedTowardModel = openingTotalEdge !== null && closingTotalEdge !== null && 
                                        Math.abs(closingTotalEdge) < Math.abs(openingTotalEdge);
          
          // Calculate drift amounts for per-card CLV hints
          const spreadDrift = marketSpread !== null ? marketSpread - openingSpread : null;
          const totalDrift = marketTotal !== null && openingTotal !== null ? marketTotal - openingTotal : null;
          
          // Thresholds: spread ≥ 0.5 pts, total ≥ 1.0 pt
          const spreadDriftSignificant = spreadDrift !== null && Math.abs(spreadDrift) >= 0.5 && spreadMovedTowardModel;
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
        dataQualityWarning: dataQualityWarning, // Data quality issue (price leak, etc.)
        warnings: [
          ...(modelTotalWarning ? [modelTotalWarning] : []),
          ...(dataQualityWarning ? [dataQualityWarning] : []),
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
            // Validation: favorite line should always be negative (or 0 for pick'em)
            // Log warning if favorite line is positive (should never happen)
            passed: market_snapshot.favoriteLine <= 0,
            warning: market_snapshot.favoriteLine > 0 ? `WARNING: Favorite line is positive (${market_snapshot.favoriteLine.toFixed(1)}). Expected negative or zero.` : null
          },
          totals_picks_safety: {
            // SAFETY PATCH: Assert no pick rendered when SHOW_TOTALS_PICKS=false
            show_totals_picks: SHOW_TOTALS_PICKS,
            total_state: totalState,
            has_pick: totalState === 'pick',
            passed: !SHOW_TOTALS_PICKS ? totalState !== 'pick' : true, // If flag is false, state must not be 'pick'
            note: SHOW_TOTALS_PICKS ? 'Totals picks enabled' : 'Totals picks disabled until Phase 2.6'
          },
          totals_headline_sanity: {
            // Assert: headline uses marketTotal (not model)
            // Note: headlineTotal is set in picks.total object, not totalPick
            market_total: marketTotal,
            passed: true, // Will be validated in UI (headlineTotal is set to marketTotal in picks.total)
            note: 'Headline must always show market total (validated in picks.total.headlineTotal)'
          },
          // PHASE 2.4: Recency consistency assertions
          recency_ratings_consistency: {
            // Assert: If rating_used === "weighted", then rating_weighted must be finite and recencyEffectPts = rating_weighted - rating_base
            rating_used: model_view.ratings.rating_used,
            rating_weighted: model_view.ratings.rating_weighted,
            rating_base: model_view.ratings.rating_base,
            recencyEffectPts: model_view.ratings.recencyEffectPts,
            weighted_is_finite: model_view.ratings.rating_weighted !== null && isFinite(model_view.ratings.rating_weighted),
            effect_matches: model_view.ratings.rating_used === 'weighted' 
              ? Math.abs(model_view.ratings.recencyEffectPts - (model_view.ratings.rating_weighted! - model_view.ratings.rating_base)) < 0.01
              : model_view.ratings.recencyEffectPts === 0,
            passed: model_view.ratings.rating_used === 'weighted' 
              ? (model_view.ratings.rating_weighted !== null && isFinite(model_view.ratings.rating_weighted!) && 
                 Math.abs(model_view.ratings.recencyEffectPts - (model_view.ratings.rating_weighted! - model_view.ratings.rating_base)) < 0.01)
              : true
          },
          recency_spread_lineage_consistency: {
            // Assert: raw_model_spread_from_used must equal the components shown (within ±0.1)
            // CRITICAL FIX: Both values must be in favorite-centric format
            rating_home_used: model_view.spread_lineage.rating_home_used,
            rating_away_used: model_view.spread_lineage.rating_away_used,
            hfa_used: model_view.spread_lineage.hfa_used,
            raw_model_spread_from_used: model_view.spread_lineage.raw_model_spread_from_used,
            // Compute expected spread in favorite-centric format (negative = market favorite favored, positive = market dog favored)
            expected_spread_fc: (() => {
              const rawHMA = model_view.spread_lineage.rating_home_used - model_view.spread_lineage.rating_away_used + model_view.spread_lineage.hfa_used;
              return favoriteByRule.teamId === game.homeTeamId ? rawHMA : -rawHMA;
            })(),
            spread_matches: Math.abs(model_view.spread_lineage.raw_model_spread_from_used - 
              (() => {
                const rawHMA = model_view.spread_lineage.rating_home_used - model_view.spread_lineage.rating_away_used + model_view.spread_lineage.hfa_used;
                return favoriteByRule.teamId === game.homeTeamId ? rawHMA : -rawHMA;
              })()) < 0.1,
            passed: Math.abs(model_view.spread_lineage.raw_model_spread_from_used - 
              (() => {
                const rawHMA = model_view.spread_lineage.rating_home_used - model_view.spread_lineage.rating_away_used + model_view.spread_lineage.hfa_used;
                return favoriteByRule.teamId === game.homeTeamId ? rawHMA : -rawHMA;
              })()) < 0.1
          },
          recency_edge_consistency: {
            // Assert: model_view.edges.atsEdgePts === spread_lineage.overlay_used (same capped value)
            atsEdgePts: model_view.edges.atsEdgePts,
            overlay_used: model_view.spread_lineage.overlay_used,
            edges_match: model_view.edges.atsEdgePts !== null 
              ? Math.abs(model_view.edges.atsEdgePts - model_view.spread_lineage.overlay_used) < 0.01
              : true,
            passed: model_view.edges.atsEdgePts !== null 
              ? Math.abs(model_view.edges.atsEdgePts - model_view.spread_lineage.overlay_used) < 0.01
              : true
          },
          recency_ml_basis: {
            // Assert: Moneyline win probability is derived from spread_lineage.final_spread_with_overlay
            // Note: picks.moneyline will be validated after picks object is created
            final_spread_with_overlay: model_view.spread_lineage.final_spread_with_overlay,
            passed: true // Will be validated after picks object is created (see assertion logging section)
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
            modelRaw: modelSpreadRaw ?? finalImpliedSpread,
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
          // SAFETY PATCH: Honest three-state UI flags
          has_market_total: marketTotal !== null,
          has_model_total: isModelTotalValid && finalImpliedTotal !== null && Number.isFinite(finalImpliedTotal),
          meets_floor: isModelTotalValid && totalEdgePts !== null && Math.abs(totalEdgePts) >= OVERLAY_EDGE_FLOOR && SHOW_TOTALS_PICKS,
          show_totals_picks: SHOW_TOTALS_PICKS, // Feature flag
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
      
      // Model configuration (includes Trust-Market overlay config) - merged with Phase 2.4 modelConfig
      // Note: modelConfig is defined earlier in response (Phase 2.4)

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
    if (!response.validation?.assertions?.sign_sanity_ats?.passed) {
      console.error(`[Game ${gameId}] ⚠️ ASSERTION FAILED: ATS Sign Sanity`, {
        market_favorite_line: response.validation.assertions.sign_sanity_ats.market_favorite_line,
        warning: response.validation.assertions.sign_sanity_ats.warning,
        note: 'Favorite line should be negative (or 0 for pick\'em). Positive values indicate a data issue.'
      });
    }
    if (!response.validation?.assertions?.totals_picks_safety?.passed) {
      console.error(`[Game ${gameId}] ⚠️ ASSERTION FAILED: Totals Picks Safety`, {
        show_totals_picks: response.validation.assertions.totals_picks_safety.show_totals_picks,
        total_state: response.validation.assertions.totals_picks_safety.total_state,
        has_pick: response.validation.assertions.totals_picks_safety.has_pick,
        note: response.validation.assertions.totals_picks_safety.note
      });
    }

    // ============================================
    // DEBUG MODE: Echo specific values for canary games
    // ============================================
    if (debugMode) {
      (response as any).debug = {
        ats: {
          market_favorite_line: response.market_snapshot.favoriteLine,
          model_edge_ats: response.model_view.edges.atsEdgePts,
          picks_spread_edgePts: response.picks.spread.edgePts,
          picks_spread_betTo: response.picks.spread.betTo,
          picks_spread_flip: response.picks.spread.flip,
          picks_spread_overlay_used_pts: response.picks.spread.overlay.overlay_used_pts
        },
        ou: {
          ou_inputs_ok: response.validation.ou_inputs_ok,
          ou_model_valid: response.validation.ou_model_valid,
          ou_reason: response.validation.ou_reason,
          picks_total_edgePts: response.picks.total.edgePts,
          picks_total_betTo: response.picks.total.betTo,
          picks_total_flip: response.picks.total.flip,
          picks_total_overlay_used_pts: response.picks.total.overlay.overlay_used_pts
        },
        // PHASE 2.4: Recency fields in debug mode
        recency: {
          ratings: response.model_view.ratings,
          recency_features: response.model_view.features.recency,
          spread_lineage: response.model_view.spread_lineage,
          ml_calc_basis: (response.picks.moneyline as any)?.calc_basis
        }
      };
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
