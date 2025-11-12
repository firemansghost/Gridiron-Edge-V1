/**
 * Phase 1 Forensic Audit
 * 
 * Edge checks: Sign agreement, Pearson r, slope on pred vs market
 * Returns: forensic_audit_summary.txt with PASS/FAIL per gate
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ============================================================================
// CORRELATION HELPERS
// ============================================================================

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;
  
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  let num = 0;
  let denX = 0;
  let denY = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

function signAgreement(x: number[], y: number[]): number {
  if (x.length === 0 || x.length !== y.length) return 0;
  
  let agrees = 0;
  for (let i = 0; i < x.length; i++) {
    if (Math.sign(x[i]) === Math.sign(y[i])) {
      agrees++;
    }
  }
  
  return agrees / x.length;
}

function simpleOLS(x: number[], y: number[]): { slope: number; intercept: number; rmse: number; r2: number } {
  const n = x.length;
  if (n === 0 || n !== y.length) {
    return { slope: 0, intercept: 0, rmse: 0, r2: 0 };
  }
  
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  let num = 0;
  let den = 0;
  
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    den += dx * dx;
  }
  
  const slope = den !== 0 ? num / den : 0;
  const intercept = meanY - slope * meanX;
  
  // RMSE and R²
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * x[i] + intercept;
    const residual = y[i] - pred;
    sse += residual * residual;
    sst += (y[i] - meanY) * (y[i] - meanY);
  }
  
  const rmse = Math.sqrt(sse / n);
  const r2 = sst !== 0 ? 1 - (sse / sst) : 0;
  
  return { slope, intercept, rmse, r2 };
}

// ============================================================================
// MAIN AUDIT
// ============================================================================

async function runForensicAudit(season: number, modelVersion: string, weeks: number[] = [8, 9, 10, 11]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 PHASE 1 FORENSIC AUDIT`);
  console.log(`${'='.repeat(70)}`);
  console.log(`   Season: ${season}`);
  console.log(`   Model Version: ${modelVersion}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);
  
  const rows: Array<{
    gameId: string;
    week: number;
    marketSpreadHMA: number;
    ratingDiff: number;
    hfa: number;
  }> = [];
  
  for (const week of weeks) {
    const games = await prisma.game.findMany({
      where: {
        season,
        week,
        status: 'final',
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          where: {
            lineType: 'spread',
            source: 'oddsapi',
          },
        },
      },
    });
    
    // Get ratings
    const teamIds = [...new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId]))];
    const ratings = await prisma.teamSeasonRating.findMany({
      where: {
        season,
        teamId: { in: teamIds },
        modelVersion,
      },
    });
    
    const ratingsMap = new Map(ratings.map(r => [r.teamId, r]));
    
    for (const game of games) {
      const homeRatingRecord = ratingsMap.get(game.homeTeamId);
      const awayRatingRecord = ratingsMap.get(game.awayTeamId);
      
      if (!homeRatingRecord || !awayRatingRecord) continue;
      
      const homeRating = homeRatingRecord.powerRating !== null && homeRatingRecord.powerRating !== undefined
        ? Number(homeRatingRecord.powerRating)
        : (homeRatingRecord.rating !== null && homeRatingRecord.rating !== undefined
          ? Number(homeRatingRecord.rating)
          : null);
      const awayRating = awayRatingRecord.powerRating !== null && awayRatingRecord.powerRating !== undefined
        ? Number(awayRatingRecord.powerRating)
        : (awayRatingRecord.rating !== null && awayRatingRecord.rating !== undefined
          ? Number(awayRatingRecord.rating)
          : null);
      
      if (homeRating === null || awayRating === null || isNaN(homeRating) || isNaN(awayRating)) {
        continue;
      }
      
      // Pre-kick window
      const kickoff = game.date ? new Date(game.date) : null;
      if (!kickoff) continue;
      
      const windowStart = new Date(kickoff.getTime() - 60 * 60 * 1000);
      const windowEnd = new Date(kickoff.getTime() + 5 * 60 * 1000);
      
      const linesToUse = game.marketLines.filter(line => {
        if (!line.timestamp) return false;
        const ts = new Date(line.timestamp);
        return ts >= windowStart && ts <= windowEnd;
      });
      
      if (linesToUse.length === 0) continue;
      
      // Consensus
      const spreadsByBook = new Map<string, number[]>();
      for (const line of linesToUse) {
        const book = line.bookName || 'unknown';
        const value = line.lineValue !== null && line.lineValue !== undefined ? Number(line.lineValue) : null;
        if (value === null || !isFinite(value)) continue;
        const fcValue = value < 0 ? value : -Math.abs(value);
        if (!spreadsByBook.has(book)) {
          spreadsByBook.set(book, []);
        }
        spreadsByBook.get(book)!.push(fcValue);
      }
      
      const dedupedSpreads: number[] = [];
      for (const [book, values] of spreadsByBook.entries()) {
        if (values.length === 0) continue;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
        dedupedSpreads.push(median);
      }
      
      if (dedupedSpreads.length < 3) continue;
      
      const sortedSpreads = [...dedupedSpreads].sort((a, b) => a - b);
      const mid = Math.floor(sortedSpreads.length / 2);
      const consensusSpreadFC = sortedSpreads.length % 2 === 0
        ? (sortedSpreads[mid - 1] + sortedSpreads[mid]) / 2
        : sortedSpreads[mid];
      
      if (Math.abs(consensusSpreadFC) > 60) continue;
      
      const marketFavIsHome = consensusSpreadFC < 0;
      const marketSpreadHMA = marketFavIsHome ? -consensusSpreadFC : consensusSpreadFC;
      
      // HFA
      let hfa = 0;
      if (!game.neutralSite) {
        hfa = (homeRatingRecord as any).hfaTeam !== null && (homeRatingRecord as any).hfaTeam !== undefined
          ? Number((homeRatingRecord as any).hfaTeam)
          : 2.0;
        hfa = Math.max(-7, Math.min(7, hfa));
      }
      
      // FBS filter
      const homeMembership = await prisma.teamMembership.findUnique({
        where: { season_teamId: { season, teamId: game.homeTeamId } },
      });
      const awayMembership = await prisma.teamMembership.findUnique({
        where: { season_teamId: { season, teamId: game.awayTeamId } },
      });
      
      const homeIsFBS = homeMembership && homeMembership.level === 'fbs';
      const awayIsFBS = awayMembership && awayMembership.level === 'fbs';
      
      if (!homeIsFBS || !awayIsFBS) continue;
      
      const ratingDiff = homeRating - awayRating;
      
      rows.push({
        gameId: game.id,
        week,
        marketSpreadHMA,
        ratingDiff,
        hfa,
      });
    }
  }
  
  if (rows.length === 0) {
    console.error(`❌ No data loaded. Aborting audit.`);
    return;
  }
  
  console.log(`✅ Loaded ${rows.length} audit rows\n`);
  
  // Compute metrics
  const ratingDiffs = rows.map(r => r.ratingDiff);
  const marketSpreads = rows.map(r => r.marketSpreadHMA);
  const hfas = rows.map(r => r.hfa);
  
  const signAgree = signAgreement(ratingDiffs, marketSpreads);
  const pearsonR = pearsonCorrelation(ratingDiffs, marketSpreads);
  
  // Simple OLS: market ~ rating_diff + hfa
  const X = ratingDiffs.map((rd, i) => [rd, hfas[i]]);
  const y = marketSpreads;
  
  // Manual OLS with 2 features
  const n = rows.length;
  const meanRD = ratingDiffs.reduce((a, b) => a + b, 0) / n;
  const meanHFA = hfas.reduce((a, b) => a + b, 0) / n;
  const meanY = marketSpreads.reduce((a, b) => a + b, 0) / n;
  
  // Build design matrix
  const XCentered = X.map(([rd, hfa]) => [rd - meanRD, hfa - meanHFA]);
  const yCentered = y.map(val => val - meanY);
  
  // Normal equations: (X'X)β = X'y
  let XtX_00 = 0, XtX_01 = 0, XtX_10 = 0, XtX_11 = 0;
  let Xty_0 = 0, Xty_1 = 0;
  
  for (let i = 0; i < n; i++) {
    const [x0, x1] = XCentered[i];
    const yi = yCentered[i];
    
    XtX_00 += x0 * x0;
    XtX_01 += x0 * x1;
    XtX_10 += x1 * x0;
    XtX_11 += x1 * x1;
    
    Xty_0 += x0 * yi;
    Xty_1 += x1 * yi;
  }
  
  // Solve: β = (X'X)^(-1) X'y
  const det = XtX_00 * XtX_11 - XtX_01 * XtX_10;
  
  let slope = 0;
  let hfaCoeff = 0;
  let rmse = 0;
  let r2 = 0;
  
  if (Math.abs(det) > 1e-10) {
    const inv00 = XtX_11 / det;
    const inv01 = -XtX_01 / det;
    const inv10 = -XtX_10 / det;
    const inv11 = XtX_00 / det;
    
    slope = inv00 * Xty_0 + inv01 * Xty_1;
    hfaCoeff = inv10 * Xty_0 + inv11 * Xty_1;
    
    const intercept = meanY - slope * meanRD - hfaCoeff * meanHFA;
    
    // RMSE and R²
    let sse = 0;
    let sst = 0;
    for (let i = 0; i < n; i++) {
      const pred = slope * ratingDiffs[i] + hfaCoeff * hfas[i] + intercept;
      const residual = marketSpreads[i] - pred;
      sse += residual * residual;
      sst += (marketSpreads[i] - meanY) * (marketSpreads[i] - meanY);
    }
    
    rmse = Math.sqrt(sse / n);
    r2 = sst !== 0 ? 1 - (sse / sst) : 0;
  }
  
  // Gates
  const gateSign = signAgree >= 0.70;
  const gatePearson = pearsonR >= 0.30;
  const gateSlope = slope >= 0.9 && slope <= 1.1;
  
  // Generate summary
  const summary = [
    `${'='.repeat(70)}`,
    `PHASE 1 FORENSIC AUDIT SUMMARY`,
    `${'='.repeat(70)}`,
    ``,
    `Season: ${season}`,
    `Model Version: ${modelVersion}`,
    `Weeks: ${weeks.join(', ')}`,
    `Sample Size: ${rows.length} games`,
    ``,
    `${'─'.repeat(70)}`,
    `METRICS`,
    `${'─'.repeat(70)}`,
    `Sign Agreement: ${(signAgree * 100).toFixed(1)}% (target: ≥70%)`,
    `Pearson r: ${pearsonR.toFixed(4)} (target: ≥0.30)`,
    `OLS Slope: ${slope.toFixed(4)} (target: 0.9-1.1)`,
    `OLS HFA Coeff: ${hfaCoeff.toFixed(4)}`,
    `RMSE: ${rmse.toFixed(3)}`,
    `R²: ${r2.toFixed(4)}`,
    ``,
    `${'─'.repeat(70)}`,
    `GATES`,
    `${'─'.repeat(70)}`,
    `Gate 1 (Sign Agreement ≥70%): ${gateSign ? '✅ PASS' : '❌ FAIL'} (${(signAgree * 100).toFixed(1)}%)`,
    `Gate 2 (Pearson r ≥0.30): ${gatePearson ? '✅ PASS' : '❌ FAIL'} (${pearsonR.toFixed(4)})`,
    `Gate 3 (Slope 0.9-1.1): ${gateSlope ? '✅ PASS' : '❌ FAIL'} (${slope.toFixed(4)})`,
    ``,
    `${'─'.repeat(70)}`,
    `OVERALL`,
    `${'─'.repeat(70)}`,
    `Status: ${gateSign && gatePearson && gateSlope ? '✅ PASS' : '❌ FAIL'}`,
    ``,
    `${'='.repeat(70)}`,
  ].join('\n');
  
  console.log(summary);
  
  // Save to file
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const summaryPath = path.join(reportsDir, 'forensic_audit_summary.txt');
  fs.writeFileSync(summaryPath, summary);
  console.log(`\n💾 Saved summary to ${summaryPath}`);
  
  // Return pass/fail
  return {
    passed: gateSign && gatePearson && gateSlope,
    signAgree,
    pearsonR,
    slope,
    rmse,
    r2,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npx tsx scripts/phase1-forensic-audit.ts <season> <modelVersion> [weeks...]');
    process.exit(1);
  }
  
  const season = parseInt(args[0], 10);
  const modelVersion = args[1];
  const weeks = args.length > 2 ? args.slice(2).map(w => parseInt(w, 10)) : [8, 9, 10, 11];
  
  await runForensicAudit(season, modelVersion, weeks);
  await prisma.$disconnect();
}

main().catch(console.error);

