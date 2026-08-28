/**
 * Phase 2C-2I-1 — Hybrid V2 preseason readiness audit (pure, SELECT-shaped).
 *
 * READ ONLY. Does NOT authorize prior-year grade bridge, Hybrid activation,
 * unit-grade writes, Odds, CFBD, or model changes.
 *
 * Reuses exact existing calculateHybridSpread() — does not duplicate Hybrid math.
 */

import { calculateHybridSpread } from '../../../web/lib/core-v2-spread';
import {
  numericSummary,
  type NumericSummary,
} from './balanced-v1-preseason-bridge-eval';

export const TARGET_SEASON = 2026 as const;
export const TARGET_WEEK = 1 as const;
export const EXPECTED_WEEK1_GAME_COUNT = 51 as const;
export const EXPECTED_FBS_COUNT = 138 as const;
export const PRIOR_GRADE_SEASON = 2025 as const;
export const HIGHLIGHT_ALL_ZERO_TEAM_IDS = [
  'north-dakota-state',
  'sacramento-state',
] as const;

/** Frozen Hybrid contract (must match apps/web/lib/core-v2-spread.ts). */
export const HYBRID_V1_WEIGHT = 0.7 as const;
export const HYBRID_V2_WEIGHT = 0.3 as const;
export const HYBRID_V2_SCALE = 9.0 as const;
export const HYBRID_W_RUN = 0.4 as const;
export const HYBRID_W_PASS = 0.4 as const;
export const HYBRID_W_EXPLO = 0.2 as const;
export const HYBRID_HFA = 2.5 as const;

export interface HybridPreseasonGameRow {
  gameId: string;
  season: number;
  week: number;
  date: string;
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  neutralSite: boolean;
}

export interface V1RatingRow {
  teamId: string;
  powerRating: number | null;
  rating: number | null;
}

/** Six Hybrid-used fields + havoc (reported, unused by calculateHybridSpread). */
export interface UnitGradeRow {
  teamId: string;
  season: number;
  offRunGrade: number;
  defRunGrade: number;
  offPassGrade: number;
  defPassGrade: number;
  offExplosiveness: number;
  defExplosiveness: number;
  havocGrade: number;
}

export interface CfbdSourceCounts {
  cfbdGames: number;
  cfbdEffTeamGame: number;
  cfbdPpaTeamGame: number;
  cfbdEffTeamSeason: number;
  cfbdPriorsTeamSeason: number;
}

/**
 * Per-team finite source signals aligned to compute_unit_grades.ts inputs/fallbacks.
 * Presence = at least one finite observation for that metric for the team/season.
 */
export interface SameSeasonTeamSourceSignals {
  teamId: string;
  hasLineYardsOff: boolean;
  hasRunEpa: boolean;
  hasPpaOffense: boolean;
  hasStuffRate: boolean;
  hasPpaDefense: boolean;
  hasPassEpa: boolean;
  hasPassSr: boolean;
  hasDefSr: boolean;
  hasIsoPppOff: boolean;
  hasIsoPppDef: boolean;
  /** Reported separately; not required for Hybrid spread readiness. */
  hasHavocOff: boolean;
  hasHavocDef: boolean;
}

export interface SameSeasonUnitGradeSourceCoverage {
  teamsWithOffRunSource: number;
  teamsWithDefRunSource: number;
  teamsWithOffPassSource: number;
  teamsWithDefPassSource: number;
  teamsWithOffExplosivenessSource: number;
  teamsWithDefExplosivenessSource: number;
  teamsWithHavocSource: number;
  missingOffRunTeamIds: string[];
  missingDefRunTeamIds: string[];
  missingOffPassTeamIds: string[];
  missingDefPassTeamIds: string[];
  missingOffExplosivenessTeamIds: string[];
  missingDefExplosivenessTeamIds: string[];
  sameSeasonUnitGradeSourceReady: boolean;
}

export interface HybridPreseasonReadinessInput {
  season: number;
  week: number;
  /**
   * Production current-week resolution from getCurrentSeasonWeek(prisma).
   * Pure evaluator compares these to TARGET_SEASON / TARGET_WEEK only.
   */
  detectedSeason: number;
  detectedWeek: number;
  fbsIds: string[];
  /** Season Game rows scoped to the audit season (Week1 slate). */
  games: HybridPreseasonGameRow[];
  v1Ratings2026: V1RatingRow[];
  unitGrades2026: UnitGradeRow[];
  /** Prior-year grades loaded for authoritative 2026 FBS IDs. */
  unitGradesPrior: UnitGradeRow[];
  cfbdSourceCounts2026: CfbdSourceCounts;
  /** Per-FBS same-season CFBD feature presence for unit-grade categories. */
  sameSeasonTeamSources: SameSeasonTeamSourceSignals[];
  /** Retained 2024 TeamUnitGrades count (inventory only; not a validation gate). */
  unitGradeRows2024: number;
  cfbdSourceCounts2024: CfbdSourceCounts;
}

export interface PriorGradeCoverage {
  priorGradeRowsFor2026Fbs: number;
  priorGradeDistinctTeams: number;
  duplicateTeamIds: number;
  exactTeamSet: boolean;
  finiteOffRun: number;
  finiteDefRun: number;
  finiteOffPass: number;
  finiteDefPass: number;
  finiteOffExplosiveness: number;
  finiteDefExplosiveness: number;
  finiteHavoc: number;
  allZeroHybridGradeRows: number;
  allZeroHybridTeamIds: string[];
}

export interface Week1DiagnosticGame {
  gameId: string;
  away: string;
  home: string;
  neutralSite: boolean;
  home2026V1: number;
  away2026V1: number;
  v1ComponentHma: number;
  v2ComponentHma: number;
  priorGradeHybridHma: number;
  hybridMinusV1: number;
  absHybridMinusV1: number;
  v1Favorite: string;
  hybridFavorite: string;
  favoriteFlipped: boolean;
  homePriorGradeSeason: typeof PRIOR_GRADE_SEASON;
  awayPriorGradeSeason: typeof PRIOR_GRADE_SEASON;
  homeAllZeroPriorGrade: boolean;
  awayAllZeroPriorGrade: boolean;
}

export interface AbsDeltaSummary {
  mean: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  max: number | null;
  over2: number;
  over3: number;
  over5: number;
  over7: number;
  over10: number;
}

export interface HybridPreseasonReadinessResult {
  auditOk: boolean;
  findings: string[];
  season: number;
  week: number;
  detectedSeason: number | null;
  detectedWeek: number | null;
  earliestWeek1Kickoff: string | null;
  latestWeek1Kickoff: string | null;
  week1GameCount: number;
  currentWeekResolutionOk: boolean;
  totalGames: number;
  fbsVsFbsGames: number;
  uniqueTeams: number;
  gamesWithBothV1: number;
  gamesMissingHomeV1: number;
  gamesMissingAwayV1: number;
  nonfiniteV1Ratings: number;
  missingTeamMembership: number;
  coreV1Week1OperationalReady: boolean;
  teamUnitGradeRows2026: number;
  distinctUnitGradeTeams2026: number;
  gamesWithCurrentHybridInputs: number;
  gamesMissingCurrentHybridInputs: number;
  gamesThatWouldFallbackToCoreV1: number;
  currentHybridOperationalReady: boolean;
  cfbdSourceCounts2026: CfbdSourceCounts;
  sameSeasonUnitGradeSourceCoverage: SameSeasonUnitGradeSourceCoverage;
  sameSeasonUnitGradeSourceReady: boolean;
  priorGradeCoverage: PriorGradeCoverage;
  priorYearGradeBridgeStructurallyAvailable: boolean;
  historicalPriorYearBridgeValidationAvailable: false;
  priorYearGradeBridgeHistoricallyValidated: false;
  week1Diagnostics: Week1DiagnosticGame[];
  hybridSpreadSummary: NumericSummary;
  absHybridMinusV1: AbsDeltaSummary;
  favoriteFlipCount: number;
  top20AbsDeltas: Week1DiagnosticGame[];
  highlightTeamGames: Week1DiagnosticGame[];
  priorYearGradeBridgeAuthorized: false;
  productionHybridBridgeAuthorized: false;
  productionHybridActivationAuthorized: false;
  oddsIngestionAuthorized: false;
  betsWriteAuthorized: false;
  unitGradeWriteAuthorized: false;
  modelChangeAuthorized: false;
  week1SpreadModelDecisionRequired: true;
  providersInvoked: false;
  Odds: false;
  mutationsInvoked: false;
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort();
}

function setsEqual(a: string[], b: string[]): boolean {
  const aa = sortedUnique(a);
  const bb = sortedUnique(b);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}

function percentileSorted(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function absDeltaSummary(values: number[]): AbsDeltaSummary {
  if (values.length === 0) {
    return {
      mean: null,
      median: null,
      p75: null,
      p90: null,
      p95: null,
      max: null,
      over2: 0,
      over3: 0,
      over5: 0,
      over7: 0,
      over10: 0,
    };
  }
  const abs = [...values].map(Math.abs).sort((a, b) => a - b);
  const mean = abs.reduce((s, v) => s + v, 0) / abs.length;
  const mid = Math.floor(abs.length / 2);
  const median =
    abs.length % 2 === 0 ? (abs[mid - 1] + abs[mid]) / 2 : abs[mid];
  return {
    mean,
    median,
    p75: percentileSorted(abs, 75),
    p90: percentileSorted(abs, 90),
    p95: percentileSorted(abs, 95),
    max: abs[abs.length - 1],
    over2: abs.filter((v) => v > 2).length,
    over3: abs.filter((v) => v > 3).length,
    over5: abs.filter((v) => v > 5).length,
    over7: abs.filter((v) => v > 7).length,
    over10: abs.filter((v) => v > 10).length,
  };
}

function v1Value(row: V1RatingRow | undefined): number | null {
  if (!row) return null;
  const v = row.powerRating ?? row.rating;
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

function isAllZeroHybridGrades(g: UnitGradeRow): boolean {
  return (
    g.offRunGrade === 0 &&
    g.defRunGrade === 0 &&
    g.offPassGrade === 0 &&
    g.defPassGrade === 0 &&
    g.offExplosiveness === 0 &&
    g.defExplosiveness === 0
  );
}

function hybridSixFinite(g: UnitGradeRow): boolean {
  return (
    Number.isFinite(g.offRunGrade) &&
    Number.isFinite(g.defRunGrade) &&
    Number.isFinite(g.offPassGrade) &&
    Number.isFinite(g.defPassGrade) &&
    Number.isFinite(g.offExplosiveness) &&
    Number.isFinite(g.defExplosiveness)
  );
}

function favoriteFromHma(
  hma: number,
  homeTeamId: string,
  awayTeamId: string
): string {
  // Matches calculateHybridSpread: HMA > 0 → home favorite.
  return hma > 0 ? homeTeamId : awayTeamId;
}

/**
 * Conservative FBS team-level same-season unit-grade source coverage.
 * Matches compute_unit_grades.ts input/fallback semantics for Hybrid-used categories.
 *
 * OFF RUN: lineYardsOff OR runEpa OR ppaOffense
 * DEF RUN: stuffRate OR ppaDefense
 * OFF PASS: passEpa OR passSr OR ppaOffense
 * DEF PASS: defSr OR ppaDefense
 * OFF EXPLOSIVENESS: isoPppOff
 * DEF EXPLOSIVENESS: isoPppDef
 *
 * Ready only when all six categories have meaningful source for all 138 FBS teams.
 */
export function evaluateSameSeasonUnitGradeSourceCoverage(
  fbsIds: string[],
  teamSources: SameSeasonTeamSourceSignals[]
): SameSeasonUnitGradeSourceCoverage {
  const fbs = sortedUnique(fbsIds);
  const byTeam = new Map<string, SameSeasonTeamSourceSignals>();
  for (const row of teamSources) {
    const id = row.teamId.toLowerCase();
    if (!byTeam.has(id)) byTeam.set(id, { ...row, teamId: id });
  }

  const missingOffRunTeamIds: string[] = [];
  const missingDefRunTeamIds: string[] = [];
  const missingOffPassTeamIds: string[] = [];
  const missingDefPassTeamIds: string[] = [];
  const missingOffExplosivenessTeamIds: string[] = [];
  const missingDefExplosivenessTeamIds: string[] = [];
  let teamsWithOffRunSource = 0;
  let teamsWithDefRunSource = 0;
  let teamsWithOffPassSource = 0;
  let teamsWithDefPassSource = 0;
  let teamsWithOffExplosivenessSource = 0;
  let teamsWithDefExplosivenessSource = 0;
  let teamsWithHavocSource = 0;

  for (const id of fbs) {
    const s = byTeam.get(id);
    const offRun =
      !!s && (s.hasLineYardsOff || s.hasRunEpa || s.hasPpaOffense);
    const defRun = !!s && (s.hasStuffRate || s.hasPpaDefense);
    const offPass =
      !!s && (s.hasPassEpa || s.hasPassSr || s.hasPpaOffense);
    const defPass = !!s && (s.hasDefSr || s.hasPpaDefense);
    const offExplo = !!s && s.hasIsoPppOff;
    const defExplo = !!s && s.hasIsoPppDef;
    const havoc = !!s && (s.hasHavocOff || s.hasHavocDef);

    if (offRun) teamsWithOffRunSource++;
    else missingOffRunTeamIds.push(id);
    if (defRun) teamsWithDefRunSource++;
    else missingDefRunTeamIds.push(id);
    if (offPass) teamsWithOffPassSource++;
    else missingOffPassTeamIds.push(id);
    if (defPass) teamsWithDefPassSource++;
    else missingDefPassTeamIds.push(id);
    if (offExplo) teamsWithOffExplosivenessSource++;
    else missingOffExplosivenessTeamIds.push(id);
    if (defExplo) teamsWithDefExplosivenessSource++;
    else missingDefExplosivenessTeamIds.push(id);
    if (havoc) teamsWithHavocSource++;
  }

  const sameSeasonUnitGradeSourceReady =
    fbs.length === EXPECTED_FBS_COUNT &&
    teamsWithOffRunSource === EXPECTED_FBS_COUNT &&
    teamsWithDefRunSource === EXPECTED_FBS_COUNT &&
    teamsWithOffPassSource === EXPECTED_FBS_COUNT &&
    teamsWithDefPassSource === EXPECTED_FBS_COUNT &&
    teamsWithOffExplosivenessSource === EXPECTED_FBS_COUNT &&
    teamsWithDefExplosivenessSource === EXPECTED_FBS_COUNT;

  return {
    teamsWithOffRunSource,
    teamsWithDefRunSource,
    teamsWithOffPassSource,
    teamsWithDefPassSource,
    teamsWithOffExplosivenessSource,
    teamsWithDefExplosivenessSource,
    teamsWithHavocSource,
    missingOffRunTeamIds,
    missingDefRunTeamIds,
    missingOffPassTeamIds,
    missingDefPassTeamIds,
    missingOffExplosivenessTeamIds,
    missingDefExplosivenessTeamIds,
    sameSeasonUnitGradeSourceReady,
  };
}

export function parseHybridPreseasonReadinessArgs(argv: string[]):
  | { ok: true; season: number; week: number }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let week: number | null = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${argv[i]}`);
      else season = n;
    } else if (a.startsWith('--season=')) {
      const n = Number(a.split('=')[1]);
      if (!Number.isInteger(n)) errors.push(`invalid season: ${a}`);
      else season = n;
    } else if (a === '--week') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n)) errors.push(`invalid week: ${argv[i]}`);
      else week = n;
    } else if (a.startsWith('--week=')) {
      const n = Number(a.split('=')[1]);
      if (!Number.isInteger(n)) errors.push(`invalid week: ${a}`);
      else week = n;
    } else {
      errors.push(`unknown arg: ${a}`);
    }
  }

  if (season === null) season = TARGET_SEASON;
  if (week === null) week = TARGET_WEEK;
  if (season !== TARGET_SEASON) errors.push(`season must be ${TARGET_SEASON}`);
  if (week !== TARGET_WEEK) errors.push(`week must be ${TARGET_WEEK}`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season, week };
}

export function buildHybridPreseasonReadinessEvaluation(
  input: HybridPreseasonReadinessInput
): HybridPreseasonReadinessResult {
  const findings: string[] = [];
  const fbs = sortedUnique(input.fbsIds);
  const fbsSet = new Set(fbs);

  if (input.season !== TARGET_SEASON) {
    findings.push(`season must be ${TARGET_SEASON}`);
  }
  if (input.week !== TARGET_WEEK) {
    findings.push(`week must be ${TARGET_WEEK}`);
  }
  if (fbs.length !== input.fbsIds.length) {
    findings.push('FBS IDs contain duplicates (membership identity malformed)');
  }
  if (fbs.length !== EXPECTED_FBS_COUNT) {
    findings.push(`FBS count ${fbs.length} != ${EXPECTED_FBS_COUNT}`);
  }

  const detectedSeason = input.detectedSeason;
  const detectedWeek = input.detectedWeek;
  const currentWeekResolutionOk =
    detectedSeason === TARGET_SEASON && detectedWeek === TARGET_WEEK;
  if (!currentWeekResolutionOk) {
    findings.push(
      `current week resolution expected ${TARGET_SEASON}/W${TARGET_WEEK} (got ${detectedSeason}/W${detectedWeek})`
    );
  }

  const week1Games = input.games.filter(
    (g) => g.season === TARGET_SEASON && g.week === TARGET_WEEK
  );
  const week1GameCount = week1Games.length;
  const kickoffs = week1Games
    .map((g) => new Date(g.date))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const earliestWeek1Kickoff =
    kickoffs.length > 0 ? kickoffs[0].toISOString() : null;
  const latestWeek1Kickoff =
    kickoffs.length > 0
      ? kickoffs[kickoffs.length - 1].toISOString()
      : null;

  if (week1GameCount !== EXPECTED_WEEK1_GAME_COUNT) {
    findings.push(
      `Week1 game count ${week1GameCount} != ${EXPECTED_WEEK1_GAME_COUNT}`
    );
  }

  let fbsVsFbsGames = 0;
  const uniqueTeamSet = new Set<string>();
  for (const g of week1Games) {
    const home = g.homeTeamId.toLowerCase();
    const away = g.awayTeamId.toLowerCase();
    uniqueTeamSet.add(home);
    uniqueTeamSet.add(away);
    if (fbsSet.has(home) && fbsSet.has(away)) fbsVsFbsGames++;
  }
  if (fbsVsFbsGames !== EXPECTED_WEEK1_GAME_COUNT) {
    findings.push(
      `Week1 FBS-vs-FBS ${fbsVsFbsGames} != ${EXPECTED_WEEK1_GAME_COUNT}`
    );
  }

  let missingTeamMembership = 0;
  for (const g of week1Games) {
    if (!fbsSet.has(g.homeTeamId.toLowerCase())) missingTeamMembership++;
    if (!fbsSet.has(g.awayTeamId.toLowerCase())) missingTeamMembership++;
  }
  if (missingTeamMembership !== 0) {
    findings.push(`missingTeamMembership=${missingTeamMembership}`);
  }

  // V1 ratings — fail on duplicates among FBS
  const v1ByTeam = new Map<string, V1RatingRow>();
  let v1Dup = 0;
  for (const r of input.v1Ratings2026) {
    const id = r.teamId.toLowerCase();
    if (!fbsSet.has(id)) continue;
    if (v1ByTeam.has(id)) v1Dup++;
    else v1ByTeam.set(id, r);
  }
  if (v1Dup > 0) {
    findings.push(
      `duplicate 2026 V1 rating rows for FBS teams=${v1Dup} (coverage ambiguous)`
    );
  }

  let gamesWithBothV1 = 0;
  let gamesMissingHomeV1 = 0;
  let gamesMissingAwayV1 = 0;
  let nonfiniteV1Ratings = 0;
  for (const g of week1Games) {
    const hr = v1ByTeam.get(g.homeTeamId.toLowerCase());
    const ar = v1ByTeam.get(g.awayTeamId.toLowerCase());
    const hv = v1Value(hr);
    const av = v1Value(ar);
    if (hv === null) gamesMissingHomeV1++;
    if (av === null) gamesMissingAwayV1++;
    if (hv !== null && av !== null) gamesWithBothV1++;
    for (const row of [hr, ar]) {
      if (!row) continue;
      const raw = row.powerRating ?? row.rating;
      if (raw != null && !Number.isFinite(Number(raw))) nonfiniteV1Ratings++;
    }
  }

  if (gamesWithBothV1 !== EXPECTED_WEEK1_GAME_COUNT) {
    findings.push(
      `games with both 2026 V1 ratings ${gamesWithBothV1} != ${EXPECTED_WEEK1_GAME_COUNT}`
    );
  }
  if (nonfiniteV1Ratings !== 0) {
    findings.push(`nonfinite V1 ratings on Week1=${nonfiniteV1Ratings}`);
  }

  const coreV1Week1OperationalReady =
    week1GameCount === EXPECTED_WEEK1_GAME_COUNT &&
    fbsVsFbsGames === EXPECTED_WEEK1_GAME_COUNT &&
    gamesWithBothV1 === EXPECTED_WEEK1_GAME_COUNT &&
    gamesMissingHomeV1 === 0 &&
    gamesMissingAwayV1 === 0 &&
    nonfiniteV1Ratings === 0 &&
    missingTeamMembership === 0 &&
    v1Dup === 0 &&
    currentWeekResolutionOk &&
    input.season === TARGET_SEASON &&
    input.week === TARGET_WEEK;

  // Current-season unit grades
  const grades2026ByTeam = new Map<string, UnitGradeRow>();
  let g2026Dup = 0;
  for (const g of input.unitGrades2026) {
    const id = g.teamId.toLowerCase();
    if (grades2026ByTeam.has(id)) g2026Dup++;
    else grades2026ByTeam.set(id, g);
  }
  if (g2026Dup > 0) {
    findings.push(
      `duplicate 2026 TeamUnitGrades rows=${g2026Dup} (coverage ambiguous)`
    );
  }
  const teamUnitGradeRows2026 = input.unitGrades2026.length;
  const distinctUnitGradeTeams2026 = grades2026ByTeam.size;

  let gamesWithCurrentHybridInputs = 0;
  let gamesMissingCurrentHybridInputs = 0;
  for (const g of week1Games) {
    const hv = v1Value(v1ByTeam.get(g.homeTeamId.toLowerCase()));
    const av = v1Value(v1ByTeam.get(g.awayTeamId.toLowerCase()));
    const hg = grades2026ByTeam.get(g.homeTeamId.toLowerCase());
    const ag = grades2026ByTeam.get(g.awayTeamId.toLowerCase());
    const gradesOk =
      !!hg &&
      !!ag &&
      hybridSixFinite(hg) &&
      hybridSixFinite(ag);
    if (hv !== null && av !== null && gradesOk) {
      gamesWithCurrentHybridInputs++;
    } else {
      gamesMissingCurrentHybridInputs++;
    }
  }
  const gamesThatWouldFallbackToCoreV1 = gamesMissingCurrentHybridInputs;
  const currentHybridOperationalReady =
    week1GameCount === EXPECTED_WEEK1_GAME_COUNT &&
    gamesWithCurrentHybridInputs === EXPECTED_WEEK1_GAME_COUNT &&
    gamesMissingCurrentHybridInputs === 0;

  // Same-season CFBD source readiness (inventory + conservative team coverage).
  // Do NOT run compute_unit_grades.ts.
  const src = input.cfbdSourceCounts2026;
  const sameSeasonUnitGradeSourceCoverage =
    evaluateSameSeasonUnitGradeSourceCoverage(fbs, input.sameSeasonTeamSources);
  const sameSeasonUnitGradeSourceReady =
    sameSeasonUnitGradeSourceCoverage.sameSeasonUnitGradeSourceReady;

  // Prior-year grades for 2026 FBS
  const priorRows = input.unitGradesPrior.filter((r) =>
    fbsSet.has(r.teamId.toLowerCase())
  );
  const priorByTeam = new Map<string, UnitGradeRow>();
  let priorDup = 0;
  for (const r of priorRows) {
    const id = r.teamId.toLowerCase();
    if (priorByTeam.has(id)) priorDup++;
    else priorByTeam.set(id, r);
  }
  if (priorDup > 0) {
    findings.push(
      `duplicate prior-year TeamUnitGrades rows for 2026 FBS teams=${priorDup} (coverage ambiguous)`
    );
  }

  let finiteOffRun = 0;
  let finiteDefRun = 0;
  let finiteOffPass = 0;
  let finiteDefPass = 0;
  let finiteOffExplosiveness = 0;
  let finiteDefExplosiveness = 0;
  let finiteHavoc = 0;
  const allZeroHybridTeamIds: string[] = [];
  for (const r of priorByTeam.values()) {
    if (Number.isFinite(r.offRunGrade)) finiteOffRun++;
    if (Number.isFinite(r.defRunGrade)) finiteDefRun++;
    if (Number.isFinite(r.offPassGrade)) finiteOffPass++;
    if (Number.isFinite(r.defPassGrade)) finiteDefPass++;
    if (Number.isFinite(r.offExplosiveness)) finiteOffExplosiveness++;
    if (Number.isFinite(r.defExplosiveness)) finiteDefExplosiveness++;
    if (Number.isFinite(r.havocGrade)) finiteHavoc++;
    if (isAllZeroHybridGrades(r)) {
      allZeroHybridTeamIds.push(r.teamId.toLowerCase());
    }
  }
  allZeroHybridTeamIds.sort();

  const priorGradeDistinctTeams = priorByTeam.size;
  const exactTeamSet = setsEqual([...priorByTeam.keys()], fbs);
  const priorGradeCoverage: PriorGradeCoverage = {
    priorGradeRowsFor2026Fbs: priorRows.length,
    priorGradeDistinctTeams,
    duplicateTeamIds: priorDup,
    exactTeamSet,
    finiteOffRun,
    finiteDefRun,
    finiteOffPass,
    finiteDefPass,
    finiteOffExplosiveness,
    finiteDefExplosiveness,
    finiteHavoc,
    allZeroHybridGradeRows: allZeroHybridTeamIds.length,
    allZeroHybridTeamIds,
  };

  const allSixFiniteExact =
    finiteOffRun === EXPECTED_FBS_COUNT &&
    finiteDefRun === EXPECTED_FBS_COUNT &&
    finiteOffPass === EXPECTED_FBS_COUNT &&
    finiteDefPass === EXPECTED_FBS_COUNT &&
    finiteOffExplosiveness === EXPECTED_FBS_COUNT &&
    finiteDefExplosiveness === EXPECTED_FBS_COUNT;

  const priorYearGradeBridgeStructurallyAvailable =
    priorRows.length === EXPECTED_FBS_COUNT &&
    priorGradeDistinctTeams === EXPECTED_FBS_COUNT &&
    priorDup === 0 &&
    exactTeamSet &&
    allSixFiniteExact;

  // Do not fail audit merely because NDSU/Sac are all-zero — report only.
  // Structural availability still true when zeros are finite.

  // Phase 2C-2I-1 does not implement a complete 2024→2025 Week1 historical
  // bridge study. Partial inventory must NOT claim validation availability.
  const historicalPriorYearBridgeValidationAvailable = false as const;

  // Week1 prior-grade Hybrid diagnostic
  const week1Diagnostics: Week1DiagnosticGame[] = [];
  let diagnosticNonfinite = 0;
  for (const g of week1Games) {
    const home = g.homeTeamId.toLowerCase();
    const away = g.awayTeamId.toLowerCase();
    const hv = v1Value(v1ByTeam.get(home));
    const av = v1Value(v1ByTeam.get(away));
    const hg = priorByTeam.get(home);
    const ag = priorByTeam.get(away);
    if (hv === null || av === null || !hg || !ag) {
      diagnosticNonfinite++;
      findings.push(
        `diagnostic inputs incomplete for game ${g.gameId} (${away}@${home})`
      );
      continue;
    }
    if (!hybridSixFinite(hg) || !hybridSixFinite(ag)) {
      diagnosticNonfinite++;
      findings.push(`nonfinite prior grades for game ${g.gameId}`);
      continue;
    }

    const result = calculateHybridSpread(
      hv,
      av,
      {
        offRunGrade: hg.offRunGrade,
        defRunGrade: hg.defRunGrade,
        offPassGrade: hg.offPassGrade,
        defPassGrade: hg.defPassGrade,
        offExplosiveness: hg.offExplosiveness,
        defExplosiveness: hg.defExplosiveness,
      },
      {
        offRunGrade: ag.offRunGrade,
        defRunGrade: ag.defRunGrade,
        offPassGrade: ag.offPassGrade,
        defPassGrade: ag.defPassGrade,
        offExplosiveness: ag.offExplosiveness,
        defExplosiveness: ag.defExplosiveness,
      },
      g.neutralSite,
      home,
      away,
      null
    );

    const v1ComponentHma = result.v1SpreadHma;
    const v2ComponentHma = result.v2SpreadHma;
    const priorGradeHybridHma = result.hybridSpreadHma;
    if (
      !Number.isFinite(v1ComponentHma) ||
      !Number.isFinite(v2ComponentHma) ||
      !Number.isFinite(priorGradeHybridHma)
    ) {
      diagnosticNonfinite++;
      findings.push(`nonfinite Hybrid diagnostic for game ${g.gameId}`);
      continue;
    }

    const hybridMinusV1 = priorGradeHybridHma - v1ComponentHma;
    const v1Favorite = favoriteFromHma(v1ComponentHma, home, away);
    const hybridFavorite = favoriteFromHma(priorGradeHybridHma, home, away);

    week1Diagnostics.push({
      gameId: g.gameId,
      away,
      home,
      neutralSite: g.neutralSite,
      home2026V1: hv,
      away2026V1: av,
      v1ComponentHma,
      v2ComponentHma,
      priorGradeHybridHma,
      hybridMinusV1,
      absHybridMinusV1: Math.abs(hybridMinusV1),
      v1Favorite,
      hybridFavorite,
      favoriteFlipped: v1Favorite !== hybridFavorite,
      homePriorGradeSeason: PRIOR_GRADE_SEASON,
      awayPriorGradeSeason: PRIOR_GRADE_SEASON,
      homeAllZeroPriorGrade: isAllZeroHybridGrades(hg),
      awayAllZeroPriorGrade: isAllZeroHybridGrades(ag),
    });
  }

  if (
    week1GameCount === EXPECTED_WEEK1_GAME_COUNT &&
    diagnosticNonfinite === 0 &&
    week1Diagnostics.length !== EXPECTED_WEEK1_GAME_COUNT
  ) {
    findings.push(
      `diagnostic game count ${week1Diagnostics.length} != ${EXPECTED_WEEK1_GAME_COUNT}`
    );
  }
  if (diagnosticNonfinite > 0) {
    findings.push(
      `diagnostic calculation nonfinite/incomplete games=${diagnosticNonfinite}`
    );
  }

  week1Diagnostics.sort((a, b) => a.gameId.localeCompare(b.gameId));

  const hybridSpreadSummary = numericSummary(
    week1Diagnostics.map((d) => d.priorGradeHybridHma)
  );
  const absHybridMinusV1 = absDeltaSummary(
    week1Diagnostics.map((d) => d.absHybridMinusV1)
  );
  const favoriteFlipCount = week1Diagnostics.filter(
    (d) => d.favoriteFlipped
  ).length;

  const top20AbsDeltas = [...week1Diagnostics]
    .sort((a, b) => {
      if (b.absHybridMinusV1 !== a.absHybridMinusV1) {
        return b.absHybridMinusV1 - a.absHybridMinusV1;
      }
      return a.gameId.localeCompare(b.gameId);
    })
    .slice(0, 20);

  const highlightSet = new Set<string>(HIGHLIGHT_ALL_ZERO_TEAM_IDS);
  const highlightTeamGames = week1Diagnostics.filter(
    (d) => highlightSet.has(d.home) || highlightSet.has(d.away)
  );

  // Fail-closed for auditOk — missing 2026 grades / unauthorized bridge do NOT fail.
  // Duplicate required rows DO fail.
  const auditOk =
    findings.length === 0 &&
    input.season === TARGET_SEASON &&
    input.week === TARGET_WEEK &&
    currentWeekResolutionOk &&
    week1GameCount === EXPECTED_WEEK1_GAME_COUNT &&
    fbsVsFbsGames === EXPECTED_WEEK1_GAME_COUNT &&
    gamesWithBothV1 === EXPECTED_WEEK1_GAME_COUNT &&
    nonfiniteV1Ratings === 0 &&
    missingTeamMembership === 0 &&
    v1Dup === 0 &&
    g2026Dup === 0 &&
    priorDup === 0 &&
    diagnosticNonfinite === 0 &&
    week1Diagnostics.length === EXPECTED_WEEK1_GAME_COUNT &&
    week1Diagnostics.every(
      (d) =>
        Number.isFinite(d.priorGradeHybridHma) &&
        Number.isFinite(d.v1ComponentHma) &&
        Number.isFinite(d.v2ComponentHma)
    );

  return {
    auditOk,
    findings,
    season: input.season,
    week: input.week,
    detectedSeason,
    detectedWeek,
    earliestWeek1Kickoff,
    latestWeek1Kickoff,
    week1GameCount,
    currentWeekResolutionOk,
    totalGames: week1GameCount,
    fbsVsFbsGames,
    uniqueTeams: uniqueTeamSet.size,
    gamesWithBothV1,
    gamesMissingHomeV1,
    gamesMissingAwayV1,
    nonfiniteV1Ratings,
    missingTeamMembership,
    coreV1Week1OperationalReady,
    teamUnitGradeRows2026,
    distinctUnitGradeTeams2026,
    gamesWithCurrentHybridInputs,
    gamesMissingCurrentHybridInputs,
    gamesThatWouldFallbackToCoreV1,
    currentHybridOperationalReady,
    cfbdSourceCounts2026: { ...src },
    sameSeasonUnitGradeSourceCoverage,
    sameSeasonUnitGradeSourceReady,
    priorGradeCoverage,
    priorYearGradeBridgeStructurallyAvailable,
    historicalPriorYearBridgeValidationAvailable,
    priorYearGradeBridgeHistoricallyValidated: false,
    week1Diagnostics,
    hybridSpreadSummary,
    absHybridMinusV1,
    favoriteFlipCount,
    top20AbsDeltas,
    highlightTeamGames,
    priorYearGradeBridgeAuthorized: false,
    productionHybridBridgeAuthorized: false,
    productionHybridActivationAuthorized: false,
    oddsIngestionAuthorized: false,
    betsWriteAuthorized: false,
    unitGradeWriteAuthorized: false,
    modelChangeAuthorized: false,
    week1SpreadModelDecisionRequired: true,
    providersInvoked: false,
    Odds: false,
    mutationsInvoked: false,
  };
}

function fmt(n: number | null | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

export function formatHybridPreseasonReadinessReport(
  result: HybridPreseasonReadinessResult
): string {
  const lines: string[] = [];
  lines.push('=== Hybrid V2 Preseason Readiness Audit (READ ONLY) ===');
  lines.push(`auditOk=${result.auditOk}`);
  lines.push(
    `season=${result.season} week=${result.week} detectedSeason=${result.detectedSeason} detectedWeek=${result.detectedWeek} currentWeekResolutionOk=${result.currentWeekResolutionOk}`
  );
  lines.push(
    `week1GameCount=${result.week1GameCount} earliest=${result.earliestWeek1Kickoff ?? 'n/a'} latest=${result.latestWeek1Kickoff ?? 'n/a'}`
  );
  lines.push(
    `coreV1Week1OperationalReady=${result.coreV1Week1OperationalReady} fbsVsFbs=${result.fbsVsFbsGames} bothV1=${result.gamesWithBothV1} missingHomeV1=${result.gamesMissingHomeV1} missingAwayV1=${result.gamesMissingAwayV1} nonfiniteV1=${result.nonfiniteV1Ratings} missingMembership=${result.missingTeamMembership}`
  );
  lines.push(
    `currentHybridOperationalReady=${result.currentHybridOperationalReady} unitGradeRows2026=${result.teamUnitGradeRows2026} distinct2026=${result.distinctUnitGradeTeams2026} hybridInputs=${result.gamesWithCurrentHybridInputs} missingHybrid=${result.gamesMissingCurrentHybridInputs} fallbackToCoreV1=${result.gamesThatWouldFallbackToCoreV1}`
  );
  const s = result.cfbdSourceCounts2026;
  lines.push(
    `sameSeasonUnitGradeSourceReady=${result.sameSeasonUnitGradeSourceReady} cfbd_games=${s.cfbdGames} cfbd_eff_team_game=${s.cfbdEffTeamGame} cfbd_ppa_team_game=${s.cfbdPpaTeamGame} cfbd_eff_team_season=${s.cfbdEffTeamSeason} cfbd_priors_team_season=${s.cfbdPriorsTeamSeason}`
  );
  const sc = result.sameSeasonUnitGradeSourceCoverage;
  lines.push(
    `sameSeasonCoverage offRun=${sc.teamsWithOffRunSource} defRun=${sc.teamsWithDefRunSource} offPass=${sc.teamsWithOffPassSource} defPass=${sc.teamsWithDefPassSource} offExplo=${sc.teamsWithOffExplosivenessSource} defExplo=${sc.teamsWithDefExplosivenessSource} havoc=${sc.teamsWithHavocSource}`
  );
  lines.push(
    `sameSeasonMissing offRun=${sc.missingOffRunTeamIds.length} defRun=${sc.missingDefRunTeamIds.length} offPass=${sc.missingOffPassTeamIds.length} defPass=${sc.missingDefPassTeamIds.length} offExplo=${sc.missingOffExplosivenessTeamIds.length} defExplo=${sc.missingDefExplosivenessTeamIds.length}`
  );
  const p = result.priorGradeCoverage;
  lines.push(
    `priorYearGradeBridgeStructurallyAvailable=${result.priorYearGradeBridgeStructurallyAvailable} priorRows=${p.priorGradeRowsFor2026Fbs} distinct=${p.priorGradeDistinctTeams} dup=${p.duplicateTeamIds} exact=${p.exactTeamSet} allZeroHybrid=${p.allZeroHybridGradeRows} [${p.allZeroHybridTeamIds.join(',')}]`
  );
  lines.push(
    `finite prior: offRun=${p.finiteOffRun} defRun=${p.finiteDefRun} offPass=${p.finiteOffPass} defPass=${p.finiteDefPass} offExplo=${p.finiteOffExplosiveness} defExplo=${p.finiteDefExplosiveness} havoc=${p.finiteHavoc}`
  );
  lines.push(
    `historicalPriorYearBridgeValidationAvailable=${result.historicalPriorYearBridgeValidationAvailable} priorYearGradeBridgeHistoricallyValidated=${result.priorYearGradeBridgeHistoricallyValidated}`
  );
  lines.push(
    `hybridSpread min=${fmt(result.hybridSpreadSummary.min)} avg=${fmt(result.hybridSpreadSummary.avg)} median=${fmt(result.hybridSpreadSummary.median)} max=${fmt(result.hybridSpreadSummary.max)} std=${fmt(result.hybridSpreadSummary.stdDev)} range=${fmt(result.hybridSpreadSummary.range)}`
  );
  const d = result.absHybridMinusV1;
  lines.push(
    `|Hybrid-V1| mean=${fmt(d.mean)} median=${fmt(d.median)} p75=${fmt(d.p75)} p90=${fmt(d.p90)} p95=${fmt(d.p95)} max=${fmt(d.max)} >2=${d.over2} >3=${d.over3} >5=${d.over5} >7=${d.over7} >10=${d.over10}`
  );
  lines.push(`favoriteFlipCount=${result.favoriteFlipCount}`);
  lines.push('top20AbsDeltas:');
  for (const g of result.top20AbsDeltas) {
    lines.push(
      `  ${g.away}@${g.home} v1=${fmt(g.v1ComponentHma)} v2=${fmt(g.v2ComponentHma)} hybrid=${fmt(g.priorGradeHybridHma)} delta=${fmt(g.hybridMinusV1)} abs=${fmt(g.absHybridMinusV1)} flip=${g.favoriteFlipped}`
    );
  }
  lines.push('highlightTeams (NDSU / Sacramento State):');
  for (const g of result.highlightTeamGames) {
    lines.push(
      `  ${g.away}@${g.home} hybrid=${fmt(g.priorGradeHybridHma)} homeZero=${g.homeAllZeroPriorGrade} awayZero=${g.awayAllZeroPriorGrade}`
    );
  }
  lines.push('allWeek1Diagnostics:');
  for (const g of result.week1Diagnostics) {
    lines.push(
      `  ${g.gameId} ${g.away}@${g.home} neutral=${g.neutralSite} homeV1=${fmt(g.home2026V1)} awayV1=${fmt(g.away2026V1)} v1=${fmt(g.v1ComponentHma)} v2=${fmt(g.v2ComponentHma)} hybrid=${fmt(g.priorGradeHybridHma)} delta=${fmt(g.hybridMinusV1)} flip=${g.favoriteFlipped} homeZero=${g.homeAllZeroPriorGrade} awayZero=${g.awayAllZeroPriorGrade}`
    );
  }
  lines.push(
    `auth: priorBridge=${result.priorYearGradeBridgeAuthorized} productionBridge=${result.productionHybridBridgeAuthorized} hybridActivation=${result.productionHybridActivationAuthorized} odds=${result.oddsIngestionAuthorized} bets=${result.betsWriteAuthorized} unitGradeWrite=${result.unitGradeWriteAuthorized} modelChange=${result.modelChangeAuthorized} week1DecisionRequired=${result.week1SpreadModelDecisionRequired}`
  );
  lines.push(
    `providersInvoked=${result.providersInvoked} Odds=${result.Odds} mutationsInvoked=${result.mutationsInvoked}`
  );
  if (result.findings.length > 0) {
    lines.push('findings:');
    for (const f of result.findings) lines.push(`  - ${f}`);
  }
  return lines.join('\n');
}

export function sanitizeHybridPreseasonReadinessError(_err?: unknown): string {
  return 'Hybrid V2 preseason readiness audit failed; connection and secret details suppressed';
}
