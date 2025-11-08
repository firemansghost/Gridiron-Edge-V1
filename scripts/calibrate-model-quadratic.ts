/**
 * Non-linear Model Calibration
 * 
 * Formula: market_spread ≈ α + β₁ × rating_diff + β₂ × rating_diff²
 * 
 * The quadratic term allows large rating differences to produce
 * even larger spreads (e.g., elite vs. bad = blowout).
 */

import { prisma } from '../apps/web/lib/prisma';

const HFA = 2.0;

const WEIGHTS = {
  successOff: 0.20,
  successDef: 0.25,
  epaOff: 0.15,
  epaDef: 0.20,
  yppOff: 0.30,
  yppDef: 0.20
};

function calcMeanStdDev(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stddev = Math.sqrt(variance);
  return { mean, stddev };
}

function calculatePowerRating(stats: any, leagueMetrics: any): number {
  const zScores: any = {};
  
  zScores.epaOff = (Number(stats.epaOff || 0) - leagueMetrics.epaOff.mean) / leagueMetrics.epaOff.stddev;
  zScores.yppOff = (Number(stats.yppOff || 0) - leagueMetrics.yppOff.mean) / leagueMetrics.yppOff.stddev;
  zScores.successOff = (Number(stats.successOff || 0) - leagueMetrics.successOff.mean) / leagueMetrics.successOff.stddev;
  
  zScores.epaDef = -(Number(stats.epaDef || 0) - leagueMetrics.epaDef.mean) / leagueMetrics.epaDef.stddev;
  zScores.yppDef = -(Number(stats.yppDef || 0) - leagueMetrics.yppDef.mean) / leagueMetrics.yppDef.stddev;
  zScores.successDef = -(Number(stats.successDef || 0) - leagueMetrics.successDef.mean) / leagueMetrics.successDef.stddev;
  
  return (
    WEIGHTS.epaOff * zScores.epaOff +
    WEIGHTS.epaDef * zScores.epaDef +
    WEIGHTS.yppOff * zScores.yppOff +
    WEIGHTS.yppDef * zScores.yppDef +
    WEIGHTS.successOff * zScores.successOff +
    WEIGHTS.successDef * zScores.successDef
  );
}

/**
 * Multiple linear regression with quadratic term
 * Y = α + β₁×X₁ + β₂×X₂
 */
function multipleRegression(
  X1: number[], // rating_diff
  X2: number[], // rating_diff²
  Y: number[]   // market_spread
): { alpha: number; beta1: number; beta2: number; rsquared: number } {
  const n = X1.length;
  
  // Use matrix approach (simplified)
  // For now, use iterative approach
  
  let alpha = 0;
  let beta1 = 1;
  let beta2 = 0;
  let learningRate = 0.01;
  const iterations = 1000;
  
  for (let iter = 0; iter < iterations; iter++) {
    let gradAlpha = 0;
    let gradBeta1 = 0;
    let gradBeta2 = 0;
    
    for (let i = 0; i < n; i++) {
      const predicted = alpha + beta1 * X1[i] + beta2 * X2[i];
      const error = predicted - Y[i];
      
      gradAlpha += error;
      gradBeta1 += error * X1[i];
      gradBeta2 += error * X2[i];
    }
    
    alpha -= learningRate * gradAlpha / n;
    beta1 -= learningRate * gradBeta1 / n;
    beta2 -= learningRate * gradBeta2 / n;
  }
  
  // Calculate R²
  const meanY = Y.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  
  for (let i = 0; i < n; i++) {
    const predicted = alpha + beta1 * X1[i] + beta2 * X2[i];
    ssRes += (Y[i] - predicted) ** 2;
    ssTot += (Y[i] - meanY) ** 2;
  }
  
  const rsquared = 1 - (ssRes / ssTot);
  
  return { alpha, beta1, beta2, rsquared };
}

async function calibrateQuadratic(season: number, weeks: number[]) {
  console.log(`\n📊 Quadratic Calibration for ${season} Weeks ${weeks.join(', ')}...\n`);
  
  // Get league stats
  const allStats = await prisma.teamSeasonStat.findMany({ where: { season } });
  
  const leagueMetrics = {
    epaOff: calcMeanStdDev(allStats.map(s => Number(s.epaOff || 0))),
    epaDef: calcMeanStdDev(allStats.map(s => Number(s.epaDef || 0))),
    yppOff: calcMeanStdDev(allStats.map(s => Number(s.yppOff || 0))),
    yppDef: calcMeanStdDev(allStats.map(s => Number(s.yppDef || 0))),
    successOff: calcMeanStdDev(allStats.map(s => Number(s.successOff || 0))),
    successDef: calcMeanStdDev(allStats.map(s => Number(s.successDef || 0)))
  };
  
  // Collect data points
  const points: any[] = [];
  
  // Get all talent data for the season (for G5 p10 calculation)
  const allSeasonTalent = await prisma.teamSeasonTalent.findMany({
    where: { season },
    select: { talentComposite: true, teamId: true },
  });
  
  // Get team conferences for G5 identification
  const teamIds = Array.from(new Set(allSeasonTalent.map(t => t.teamId)));
  const teamConferences = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, conference: true },
  });
  const conferenceMap = new Map(teamConferences.map(t => [t.id, t.conference]));
  
  const G5_CONFERENCES = new Set([
    'American Athletic', 'Conference USA', 'Mid-American', 'Mountain West', 'Sun Belt'
  ]);
  const isG5 = (conf: string | null) => conf !== null && G5_CONFERENCES.has(conf);
  
  // Calculate G5 p10 for imputation
  const g5TalentValues: number[] = [];
  for (const talent of allSeasonTalent) {
    if (talent.talentComposite !== null && isFinite(talent.talentComposite)) {
      const conf = conferenceMap.get(talent.teamId);
      if (conf && isG5(conf)) {
        g5TalentValues.push(talent.talentComposite);
      }
    }
  }
  
  let g5P10: number | null = null;
  if (g5TalentValues.length >= 10) {
    g5TalentValues.sort((a, b) => a - b);
    const n = g5TalentValues.length;
    const p5 = g5TalentValues[Math.floor(n * 0.05)];
    const p10 = g5TalentValues[Math.floor(n * 0.10)];
    const p25 = g5TalentValues[Math.floor(n * 0.25)];
    g5P10 = p10;
    if (g5P10 < p5) g5P10 = p5;
    if (g5P10 > p25) g5P10 = p25;
  }
  
  // Get all talent for normalization
  const allTalentValues = allSeasonTalent
    .map(t => t.talentComposite)
    .filter(v => v !== null && isFinite(v)) as number[];
  const talentMean = allTalentValues.length > 0 
    ? allTalentValues.reduce((a, b) => a + b, 0) / allTalentValues.length 
    : null;
  const talentVariance = talentMean !== null
    ? allTalentValues.reduce((sum, val) => sum + Math.pow(val - talentMean, 2), 0) / allTalentValues.length
    : 0;
  const talentStd = Math.sqrt(talentVariance);
  
  for (const week of weeks) {
    const games = await prisma.game.findMany({
      where: { season, week, status: 'final' },
      include: {
        homeTeam: true,
        awayTeam: true,
        marketLines: {
          where: { lineType: 'spread' },
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    });
    
    const gameTeamIds = Array.from(new Set(games.flatMap(g => [g.homeTeamId, g.awayTeamId])));
    const stats = await prisma.teamSeasonStat.findMany({
      where: { season, teamId: { in: gameTeamIds } }
    });
    const statsMap = new Map(stats.map(s => [s.teamId, s]));
    
    // Get ratings (with HFA) for these games
    const ratings = await prisma.teamSeasonRating.findMany({
      where: { season, teamId: { in: gameTeamIds }, modelVersion: 'v1' }
    });
    const ratingsMap = new Map(ratings.map(r => [r.teamId, r]));
    
    // Get talent data for these games
    const talentData = await prisma.teamSeasonTalent.findMany({
      where: { season, teamId: { in: gameTeamIds } }
    });
    const talentMap = new Map(talentData.map(t => [t.teamId, t]));
    
    for (const game of games) {
      const homeStats = statsMap.get(game.homeTeamId);
      const awayStats = statsMap.get(game.awayTeamId);
      const marketLine = game.marketLines[0];
      
      if (!homeStats || !awayStats || !marketLine) continue;
      
      // Calculate power ratings (for model spread, not for HFA lookup)
      const homeRatingCalc = calculatePowerRating(homeStats, leagueMetrics);
      const awayRatingCalc = calculatePowerRating(awayStats, leagueMetrics);
      const ratingDiff = homeRatingCalc - awayRatingCalc;
      
      // PHASE 2.1: Talent gap feature
      const homeTalentRaw = talentMap.get(game.homeTeamId)?.talentComposite ?? null;
      const awayTalentRaw = talentMap.get(game.awayTeamId)?.talentComposite ?? null;
      const homeTalentUsed = homeTalentRaw ?? g5P10;
      const awayTalentUsed = awayTalentRaw ?? g5P10;
      const talentDiff = homeTalentUsed !== null && awayTalentUsed !== null
        ? homeTalentUsed - awayTalentUsed
        : null;
      
      // Normalize talent diff
      let talentDiffZ: number | null = null;
      if (talentDiff !== null && talentStd > 0.1 && homeTalentUsed !== null && awayTalentUsed !== null && talentMean !== null) {
        const homeTalentZ = (homeTalentUsed - talentMean) / talentStd;
        const awayTalentZ = (awayTalentUsed - talentMean) / talentStd;
        talentDiffZ = homeTalentZ - awayTalentZ;
      }
      
      // PHASE 2.2: Matchup class feature
      const [homeMembership, awayMembership] = await Promise.all([
        prisma.teamMembership.findUnique({
          where: { season_teamId: { season, teamId: game.homeTeamId } }
        }),
        prisma.teamMembership.findUnique({
          where: { season_teamId: { season, teamId: game.awayTeamId } }
        })
      ]);
      
      const P5_CONFERENCES = new Set(['ACC', 'Big Ten', 'B1G', 'Big 12', 'SEC', 'Pac-12', 'Pac-10']);
      const G5_CONFERENCES = new Set(['American Athletic', 'AAC', 'Mountain West', 'MWC', 'Sun Belt', 'Mid-American', 'MAC', 'Conference USA', 'C-USA']);
      
      const classifyTier = (teamId: string, membership: typeof homeMembership, conf: string | null): 'P5' | 'G5' | 'FCS' => {
        if (membership?.level === 'fcs') return 'FCS';
        if (teamId === 'notre-dame') return 'P5';
        if (conf && P5_CONFERENCES.has(conf)) return 'P5';
        if (conf && G5_CONFERENCES.has(conf)) return 'G5';
        if (membership?.level === 'fbs') return 'G5';
        return 'FCS';
      };
      
      const homeTier = classifyTier(game.homeTeamId, homeMembership, game.homeTeam.conference);
      const awayTier = classifyTier(game.awayTeamId, awayMembership, game.awayTeam.conference);
      
      const tierOrder = { P5: 3, G5: 2, FCS: 1 };
      const [higher, lower] = tierOrder[homeTier] >= tierOrder[awayTier] ? [homeTier, awayTier] : [awayTier, homeTier];
      
      let matchupClass: 'P5_P5' | 'P5_G5' | 'P5_FCS' | 'G5_G5' | 'G5_FCS' = 'P5_P5';
      if (higher === 'P5' && lower === 'P5') matchupClass = 'P5_P5';
      else if (higher === 'P5' && lower === 'G5') matchupClass = 'P5_G5';
      else if (higher === 'P5' && lower === 'FCS') matchupClass = 'P5_FCS';
      else if (higher === 'G5' && lower === 'G5') matchupClass = 'G5_G5';
      else if (higher === 'G5' && lower === 'FCS') matchupClass = 'G5_FCS';
      
      // One-hot dummies (P5_P5 is baseline, omitted)
      const isP5_G5 = matchupClass === 'P5_G5' ? 1 : 0;
      const isP5_FCS = matchupClass === 'P5_FCS' ? 1 : 0;
      const isG5_G5 = matchupClass === 'G5_G5' ? 1 : 0;
      const isG5_FCS = matchupClass === 'G5_FCS' ? 1 : 0;
      
      // PHASE 2.3: Team-specific HFA
      const homeRatingRecord = ratingsMap.get(game.homeTeamId);
      // Type assertion for HFA fields until Prisma types update
      const homeRatingWithHFA = homeRatingRecord as typeof homeRatingRecord & {
        hfaTeam?: number | null;
      };
      const homeHFA = homeRatingWithHFA && homeRatingWithHFA.hfaTeam !== null && homeRatingWithHFA.hfaTeam !== undefined
        ? Number(homeRatingWithHFA.hfaTeam)
        : (game.neutralSite ? 0 : 2.0); // Fallback to 2.0 if not computed
      
      points.push({
        gameId: game.id,
        homeTeam: game.homeTeam.name,
        awayTeam: game.awayTeam.name,
        ratingDiff,
        marketSpread: Number(marketLine.lineValue),
        talentDiff, // Raw difference
        talentDiffZ, // Normalized difference
        matchupClass,
        isP5_G5,
        isP5_FCS,
        isG5_G5,
        isG5_FCS,
        hfaTeamHome: homeHFA // PHASE 2.3: Team-specific HFA
      });
    }
  }
  
  console.log(`   ✅ ${points.length} games collected\n`);
  
  // Prepare regression
  const X1 = points.map(p => p.ratingDiff); // Linear term
  const X2 = points.map(p => p.ratingDiff * p.ratingDiff); // Quadratic term
  const Y = points.map(p => p.marketSpread);
  
  console.log(`📐 Fitting quadratic model...\n`);
  
  const { alpha, beta1, beta2, rsquared } = multipleRegression(X1, X2, Y);
  
  // Calculate RMSE
  let sumSqError = 0;
  for (let i = 0; i < points.length; i++) {
    const predicted = alpha + beta1 * X1[i] + beta2 * X2[i];
    sumSqError += (predicted - Y[i]) ** 2;
  }
  const rmse = Math.sqrt(sumSqError / points.length);
  
  console.log(`${'='.repeat(70)}`);
  console.log(`📊 QUADRATIC CALIBRATION RESULTS`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`📋 PARAMETERS:`);
  console.log(`   α: ${alpha.toFixed(4)}`);
  console.log(`   β₁ (linear): ${beta1.toFixed(4)}`);
  console.log(`   β₂ (quadratic): ${beta2.toFixed(4)}`);
  console.log(`   HFA: ${HFA.toFixed(1)}\n`);
  
  console.log(`📈 FIT QUALITY:`);
  console.log(`   R²: ${rsquared.toFixed(4)} (${(rsquared * 100).toFixed(1)}%)`);
  console.log(`   ${rsquared > 0.3 ? '✅ Good fit' : '⚠️ Poor fit'}`);
  console.log(`   RMSE: ${rmse.toFixed(2)} points\n`);
  
  // PHASE 2.1: Talent gap correlation
  const talentDiffs = points.map(p => p.talentDiff).filter(v => v !== null) as number[];
  const marketSpreads = points.map(p => p.marketSpread);
  const validIndices = points.map((p, i) => p.talentDiff !== null ? i : -1).filter(i => i >= 0);
  
  if (talentDiffs.length > 0) {
    // Calculate Pearson correlation
    const talentMean = talentDiffs.reduce((a, b) => a + b, 0) / talentDiffs.length;
    const marketMean = marketSpreads.reduce((a, b) => a + b, 0) / marketSpreads.length;
    
    let numerator = 0;
    let denomTalent = 0;
    let denomMarket = 0;
    
    for (const i of validIndices) {
      const talentDev = talentDiffs[validIndices.indexOf(i)] - talentMean;
      const marketDev = marketSpreads[i] - marketMean;
      numerator += talentDev * marketDev;
      denomTalent += talentDev * talentDev;
      denomMarket += marketDev * marketDev;
    }
    
    const correlation = denomTalent > 0 && denomMarket > 0
      ? numerator / Math.sqrt(denomTalent * denomMarket)
      : 0;
    
    console.log(`🎯 TALENT GAP CORRELATION (Phase 2.1):`);
    console.log(`   Pearson r (talent_diff vs market_spread): ${correlation.toFixed(4)}`);
    console.log(`   Sample size: ${talentDiffs.length} games\n`);
  }
  
  // PHASE 2.2: Matchup class incremental R²
  // Fit model with just rating_diff (baseline)
  const X1Baseline = points.map(p => p.ratingDiff);
  const X2Baseline = points.map(p => p.ratingDiff * p.ratingDiff);
  const YBaseline = points.map(p => p.marketSpread);
  const { rsquared: rsquaredBaseline } = multipleRegression(X1Baseline, X2Baseline, YBaseline);
  
  // Fit model with rating_diff + matchup class dummies
  // For simplicity, we'll use a linear approximation with class intercepts
  // In practice, you'd use a proper multiple regression with all features
  console.log(`🎯 MATCHUP CLASS INCREMENTAL R² (Phase 2.2):`);
  console.log(`   Baseline R² (rating_diff only): ${rsquaredBaseline.toFixed(4)}`);
  console.log(`   Note: Full regression with class dummies requires matrix solver`);
  console.log(`   Matchup class distribution:`);
  const classCounts = points.reduce((acc, p) => {
    acc[p.matchupClass] = (acc[p.matchupClass] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  Object.entries(classCounts).forEach(([cls, count]) => {
    console.log(`     ${cls}: ${count} games`);
  });
  console.log(`   ΔR² calculation: Run full regression with class dummies to see lift\n`);
  
  // PHASE 2.3: HFA incremental R²
  // Fit model with rating_diff + HFA
  // Simplified: add HFA as a feature and compare R²
  console.log(`🎯 HFA INCREMENTAL R² (Phase 2.3):`);
  console.log(`   Baseline R² (rating_diff only): ${rsquaredBaseline.toFixed(4)}`);
  console.log(`   HFA statistics:`);
  const hfaValues = points.map(p => p.hfaTeamHome).filter(v => v !== null && v !== undefined) as number[];
  if (hfaValues.length > 0) {
    const hfaMean = hfaValues.reduce((a, b) => a + b, 0) / hfaValues.length;
    const hfaMin = Math.min(...hfaValues);
    const hfaMax = Math.max(...hfaValues);
    console.log(`     Mean: ${hfaMean.toFixed(2)} pts`);
    console.log(`     Range: [${hfaMin.toFixed(2)}, ${hfaMax.toFixed(2)}] pts`);
    console.log(`     Sample size: ${hfaValues.length} games`);
  }
  console.log(`   Note: Full regression with HFA requires matrix solver`);
  console.log(`   Expected: β4 (HFA coefficient) should be positive ~1-3\n`);
  
  console.log(`🎯 FORMULA:`);
  console.log(`   spread = ${alpha.toFixed(4)} + ${beta1.toFixed(4)}×RD + ${beta2.toFixed(4)}×RD² + HFA`);
  console.log(`   where RD = rating_diff (home - away)\n`);
  
  // CSV dump for later regression (includes talent_diff_z, matchup class dummies, and HFA)
  console.log(`📄 CSV HEADER (for regression):`);
  console.log(`   gameId,homeTeam,awayTeam,ratingDiff,ratingDiffSq,talentDiff,talentDiffZ,matchupClass,isP5_G5,isP5_FCS,isG5_G5,isG5_FCS,hfaTeamHome,marketSpread\n`);
  
  // Test on OSU if possible
  console.log(`📝 Example: OSU (rating 2.64) @ Purdue (rating -0.53):`);
  const osuRatingDiff = 2.64 - (-0.53);
  const osuPredicted = alpha + beta1 * osuRatingDiff + beta2 * (osuRatingDiff ** 2) + HFA;
  console.log(`   Rating diff: ${osuRatingDiff.toFixed(2)}`);
  console.log(`   Predicted spread: ${osuPredicted.toFixed(1)}`);
  console.log(`   Market spread: -29.5`);
  console.log(`   Error: ${Math.abs(osuPredicted - (-29.5)).toFixed(1)} points\n`);
  
  console.log(`${'='.repeat(70)}\n`);
  
  await prisma.$disconnect();
}

function parseWeeks(weekStr: string): number[] {
  if (weekStr.includes('-')) {
    const [start, end] = weekStr.split('-').map(Number);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  return [parseInt(weekStr)];
}

const season = parseInt(process.argv[2] || '2025', 10);
const weekStr = process.argv[3] || '8-11';
const weeks = parseWeeks(weekStr);

calibrateQuadratic(season, weeks).catch(console.error);

