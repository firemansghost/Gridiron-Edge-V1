/**
 * Core V2 Hybrid Spread Helper
 * 
 * Implements the optimized Hybrid Model: 70% V1 Composite + 30% V2 Matchup
 * 
 * V1 Component: Uses power ratings (composite of Talent, Efficiency, Scoring, Record)
 * V2 Component: Uses unit grades (Run/Pass/Explosiveness matchups)
 * 
 * Optimized weights from backtesting:
 * - V1 Weight: 70%
 * - V2 Weight: 30%
 * - V2 Scale: 9.0 (optimal from optimization script)
 * - V2 Matchup Weights: 40% Run, 40% Pass, 20% Explosiveness
 */

interface UnitGrades {
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
}

interface HybridSpreadResult {
  v1SpreadHma: number; // V1 composite spread (Home - Away)
  v2SpreadHma: number; // V2 matchup spread (Home - Away)
  hybridSpreadHma: number; // Final blended spread (Home - Away)
  v1FavoriteSpread: number; // V1 favorite-centric (negative)
  v2FavoriteSpread: number; // V2 favorite-centric (negative)
  hybridFavoriteSpread: number; // Hybrid favorite-centric (negative)
  favoriteTeamId: string | null; // Team ID of favorite (based on hybrid)
  dogTeamId: string | null; // Team ID of underdog (based on hybrid)
}

const V1_WEIGHT = 0.7;
const V2_WEIGHT = 0.3;
const V2_SCALE = 9.0; // Optimal scale from optimization
const HFA = 2.5; // Home field advantage

// V2 Matchup weights (from optimization: Balanced Matchup scenario)
const W_RUN = 0.4;
const W_PASS = 0.4;
const W_EXPLO = 0.2;

/**
 * Calculate V2 matchup advantages
 * 
 * @param homeGrades - Home team unit grades
 * @param awayGrades - Away team unit grades
 * @returns Net advantages in each category (positive = home advantage)
 */
function calculateMatchups(
  homeGrades: UnitGrades,
  awayGrades: UnitGrades
): {
  netRunAdv: number;
  netPassAdv: number;
  netExploAdv: number;
} {
  // Run Matchup: Home Offense vs Away Defense, Away Offense vs Home Defense
  const homeRunAdv = homeGrades.offRunGrade - awayGrades.defRunGrade;
  const awayRunAdv = awayGrades.offRunGrade - homeGrades.defRunGrade;
  const netRunAdv = homeRunAdv - awayRunAdv;

  // Pass Matchup
  const homePassAdv = homeGrades.offPassGrade - awayGrades.defPassGrade;
  const awayPassAdv = awayGrades.offPassGrade - homeGrades.defPassGrade;
  const netPassAdv = homePassAdv - awayPassAdv;

  // Explosiveness Matchup
  const homeExploAdv = homeGrades.offExplosiveness - awayGrades.defExplosiveness;
  const awayExploAdv = awayGrades.offExplosiveness - homeGrades.defExplosiveness;
  const netExploAdv = homeExploAdv - awayExploAdv;

  return {
    netRunAdv,
    netPassAdv,
    netExploAdv,
  };
}

/**
 * Calculate V2 spread from unit grades
 * 
 * @param homeGrades - Home team unit grades
 * @param awayGrades - Away team unit grades
 * @param neutralSite - Whether game is at neutral site
 * @returns V2 spread in HMA frame
 */
export function calculateV2Spread(
  homeGrades: UnitGrades,
  awayGrades: UnitGrades,
  neutralSite: boolean = false
): number {
  const matchups = calculateMatchups(homeGrades, awayGrades);
  
  // Composite Z-score from matchup advantages
  const compositeZ =
    matchups.netRunAdv * W_RUN +
    matchups.netPassAdv * W_PASS +
    matchups.netExploAdv * W_EXPLO;

  // Convert to points using optimal scale
  const hfaPoints = neutralSite ? 0 : HFA;
  const v2SpreadHma = compositeZ * V2_SCALE + hfaPoints;

  return v2SpreadHma;
}

/**
 * Calculate V1 spread from power ratings
 * 
 * @param homeRating - Home team V1 power rating
 * @param awayRating - Away team V1 power rating
 * @param neutralSite - Whether game is at neutral site
 * @returns V1 spread in HMA frame
 */
export function calculateV1Spread(
  homeRating: number,
  awayRating: number,
  neutralSite: boolean = false
): number {
  const hfaPoints = neutralSite ? 0 : HFA;
  const v1SpreadHma = homeRating - awayRating + hfaPoints;
  return v1SpreadHma;
}

/**
 * Calculate Hybrid spread (70% V1 + 30% V2)
 * 
 * @param homeRating - Home team V1 power rating
 * @param awayRating - Away team V1 power rating
 * @param homeGrades - Home team unit grades
 * @param awayGrades - Away team unit grades
 * @param neutralSite - Whether game is at neutral site
 * @param homeTeamId - Home team ID (for favorite determination)
 * @param awayTeamId - Away team ID (for favorite determination)
 * @returns Hybrid spread result with all three components
 */
export function calculateHybridSpread(
  homeRating: number,
  awayRating: number,
  homeGrades: UnitGrades,
  awayGrades: UnitGrades,
  neutralSite: boolean = false,
  homeTeamId: string,
  awayTeamId: string
): HybridSpreadResult {
  // Calculate V1 component
  const v1SpreadHma = calculateV1Spread(homeRating, awayRating, neutralSite);

  // Calculate V2 component
  const v2SpreadHma = calculateV2Spread(homeGrades, awayGrades, neutralSite);

  // Blend: 70% V1 + 30% V2
  const hybridSpreadHma = v1SpreadHma * V1_WEIGHT + v2SpreadHma * V2_WEIGHT;

  // Convert to favorite-centric format
  const isHomeFavorite = hybridSpreadHma > 0;
  const favoriteTeamId = isHomeFavorite ? homeTeamId : awayTeamId;
  const dogTeamId = isHomeFavorite ? awayTeamId : homeTeamId;

  // Favorite-centric spreads (always negative for favorite)
  const v1FavoriteSpread = v1SpreadHma > 0 ? -Math.abs(v1SpreadHma) : Math.abs(v1SpreadHma);
  const v2FavoriteSpread = v2SpreadHma > 0 ? -Math.abs(v2SpreadHma) : Math.abs(v2SpreadHma);
  const hybridFavoriteSpread = hybridSpreadHma > 0 ? -Math.abs(hybridSpreadHma) : Math.abs(hybridSpreadHma);

  return {
    v1SpreadHma,
    v2SpreadHma,
    hybridSpreadHma,
    v1FavoriteSpread,
    v2FavoriteSpread,
    hybridFavoriteSpread,
    favoriteTeamId,
    dogTeamId,
  };
}

/**
 * Get matchup breakdown for debugging/display
 * 
 * @param homeGrades - Home team unit grades
 * @param awayGrades - Away team unit grades
 * @returns Detailed matchup breakdown
 */
export function getMatchupBreakdown(
  homeGrades: UnitGrades,
  awayGrades: UnitGrades
): {
  runAdv: { home: number; away: number; net: number };
  passAdv: { home: number; away: number; net: number };
  exploAdv: { home: number; away: number; net: number };
  compositeZ: number;
} {
  const matchups = calculateMatchups(homeGrades, awayGrades);
  
  const homeRunAdv = homeGrades.offRunGrade - awayGrades.defRunGrade;
  const awayRunAdv = awayGrades.offRunGrade - homeGrades.defRunGrade;
  
  const homePassAdv = homeGrades.offPassGrade - awayGrades.defPassGrade;
  const awayPassAdv = awayGrades.offPassGrade - homeGrades.defPassGrade;
  
  const homeExploAdv = homeGrades.offExplosiveness - awayGrades.defExplosiveness;
  const awayExploAdv = awayGrades.offExplosiveness - homeGrades.defExplosiveness;

  const compositeZ =
    matchups.netRunAdv * W_RUN +
    matchups.netPassAdv * W_PASS +
    matchups.netExploAdv * W_EXPLO;

  return {
    runAdv: {
      home: homeRunAdv,
      away: awayRunAdv,
      net: matchups.netRunAdv,
    },
    passAdv: {
      home: homePassAdv,
      away: awayPassAdv,
      net: matchups.netPassAdv,
    },
    exploAdv: {
      home: homeExploAdv,
      away: awayExploAdv,
      net: matchups.netExploAdv,
    },
    compositeZ,
  };
}

