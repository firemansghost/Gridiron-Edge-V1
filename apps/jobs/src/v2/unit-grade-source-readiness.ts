/**
 * Current-season 2026 unit-grade SOURCE readiness (SELECT-shaped, pure).
 *
 * Inventory only. Does not compute TeamUnitGrades. Does not authorize
 * compute_unit_grades.ts, CFBD ingest, Hybrid activation, or Shadow capture.
 *
 * Legacy-compute-compatible coverage reproduces the EXISTING
 * compute_unit_grades.ts input/fallback SHAPE for diagnostics only.
 * LEGACY COMPATIBILITY IS NOT METHODOLOGY AUTHORIZATION.
 *
 * Do not call those fallback rules "frozen."
 */

export const TARGET_SEASON = 2026 as const;
export const EXPECTED_FBS_COUNT = 138 as const;
export const LEGACY_COMPATIBILITY_DISCLAIMER =
  'LEGACY COMPATIBILITY IS NOT METHODOLOGY AUTHORIZATION.';
export const SAFE_TO_RUN_EXISTING_COMPUTE = false as const;

export const RAW_GAME_METRICS = [
  'lineYardsOff',
  'runEpa',
  'passEpa',
  'passSr',
  'defSr',
  'isoPppOff',
  'isoPppDef',
] as const;

export const RAW_PPA_METRICS = ['ppaOffense', 'ppaDefense'] as const;

export const RAW_SEASON_METRICS = ['stuffRate', 'havocOff', 'havocDef'] as const;

export const RAW_METRICS = [
  ...RAW_GAME_METRICS,
  ...RAW_PPA_METRICS,
  ...RAW_SEASON_METRICS,
] as const;

export type RawMetric = (typeof RAW_METRICS)[number];

export const RAW_METRIC_DEFINITIONS: Record<RawMetric, string> = {
  lineYardsOff:
    'finite CfbdEffTeamGame.lineYardsOff on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  runEpa:
    'finite CfbdEffTeamGame.runEpa on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  passEpa:
    'finite CfbdEffTeamGame.passEpa on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  passSr:
    'finite CfbdEffTeamGame.passSr on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  defSr:
    'finite CfbdEffTeamGame.defSr on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  isoPppOff:
    'finite CfbdEffTeamGame.isoPppOff on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  isoPppDef:
    'finite CfbdEffTeamGame.isoPppDef on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  ppaOffense:
    'finite CfbdPpaTeamGame.ppaOffense on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  ppaDefense:
    'finite CfbdPpaTeamGame.ppaDefense on a row whose gameIdCfbd exists on a 2026 CfbdGame',
  stuffRate: 'finite CfbdEffTeamSeason.stuffRate where season = 2026',
  havocOff: 'finite CfbdEffTeamSeason.havocOff where season = 2026',
  havocDef: 'finite CfbdEffTeamSeason.havocDef where season = 2026',
};

export const LEGACY_CATEGORIES = [
  'offRun',
  'defRun',
  'offPass',
  'defPass',
  'offExplosiveness',
  'defExplosiveness',
] as const;

export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

/**
 * Diagnostic compatibility with existing compute_unit_grades.ts availability
 * shape only. Not methodology authorization. Not frozen.
 */
export const LEGACY_CATEGORY_DEFINITIONS: Record<LegacyCategory, string> = {
  offRun:
    'legacy_compute_compatible: finite lineYardsOff OR runEpa OR ppaOffense (PPA is a fallback, not a raw run metric)',
  defRun:
    'legacy_compute_compatible: finite stuffRate OR ppaDefense (PPA is a fallback, not a raw stuffRate metric)',
  offPass:
    'legacy_compute_compatible: finite passEpa OR passSr OR ppaOffense (PPA is a fallback, not a raw pass metric)',
  defPass:
    'legacy_compute_compatible: finite defSr OR ppaDefense (PPA is a fallback, not a raw defSr metric)',
  offExplosiveness:
    'legacy_compute_compatible: finite isoPppOff only (no PPA fallback)',
  defExplosiveness:
    'legacy_compute_compatible: finite isoPppDef only (no PPA fallback)',
};

export type SourceReadinessStatus =
  | 'SOURCE_EMPTY'
  | 'SOURCE_PARTIAL'
  | 'SOURCE_COMPLETE_FOR_LEGACY_COMPUTE'
  | 'UNIT_GRADES_ALREADY_PRESENT_UNEXPECTEDLY'
  | 'FRAME_INVALID';

export interface CfbdGameRow {
  gameIdCfbd: string;
  homeTeamIdInternal: string;
  awayTeamIdInternal: string;
}

export interface EffTeamGameRow {
  gameIdCfbd: string;
  teamIdInternal: string;
  lineYardsOff: unknown;
  runEpa: unknown;
  passEpa: unknown;
  passSr: unknown;
  defSr: unknown;
  isoPppOff: unknown;
  isoPppDef: unknown;
}

export interface PpaTeamGameRow {
  gameIdCfbd: string;
  teamIdInternal: string;
  ppaOffense: unknown;
  ppaDefense: unknown;
}

export interface EffTeamSeasonRow {
  teamIdInternal: string;
  stuffRate: unknown;
  havocOff: unknown;
  havocDef: unknown;
}

export interface UnitGradeInventoryRow {
  teamId: string;
}

export interface UnitGradeSourceReadinessInput {
  season: number;
  repoCommitSha: string;
  observedAt: string;
  fbsTeamIds: string[];
  cfbdGames: CfbdGameRow[];
  effTeamGames: EffTeamGameRow[];
  ppaTeamGames: PpaTeamGameRow[];
  effTeamSeasons: EffTeamSeasonRow[];
  teamUnitGrades: UnitGradeInventoryRow[];
  /** Inventory only. Not a required Hybrid unit-grade source. */
  priorsTeamSeasonCount: number;
}

export interface MetricCoverage {
  definition: string;
  finiteRows: number;
  distinctTeams: number;
  missingTeamIds: string[];
  pct: number;
}

export interface LegacyCategoryCoverage {
  definition: string;
  coveredTeamCount: number;
  missingTeamIds: string[];
  pct: number;
}

export type PerTeamRawEvidence = { teamId: string } & Record<RawMetric, boolean>;

export interface UnitGradeSourceReadinessReport {
  season: number;
  repoCommitSha: string;
  observedAt: string;
  providersInvoked: false;
  mutationsInvoked: false;
  providerCalls: 0;
  mutationCount: 0;
  status: SourceReadinessStatus;
  legacyCompatibilityDisclaimer: typeof LEGACY_COMPATIBILITY_DISCLAIMER;
  fbs: {
    expected: typeof EXPECTED_FBS_COUNT;
    actual: number;
    unique: number;
    teamIds: string[];
  };
  teamUnitGrades: {
    rows: number;
    distinctTeams: number;
    teamIds: string[];
  };
  cfbdSourceInventory: {
    cfbdGames: number;
    distinctGameIds: number;
    effTeamGameRows: number;
    effTeamGameTeams: number;
    ppaTeamGameRows: number;
    ppaTeamGameTeams: number;
    effTeamSeasonRows: number;
    effTeamSeasonTeams: number;
    priorsTeamSeasonRows: number;
    priorsNote: string;
  };
  rawMetricCoverage: Record<RawMetric, MetricCoverage>;
  perTeamRawEvidence: PerTeamRawEvidence[];
  legacyComputeCompatibleCoverage: Record<LegacyCategory, LegacyCategoryCoverage>;
  readiness: {
    sourcePopulationComplete: boolean;
    rawMetricCoverageComplete: boolean;
    legacyComputeCompatibleCoverageComplete: boolean;
    teamUnitGradesPresent: boolean;
    safeToRunExistingCompute: false;
    computeUnitGradesAuthorized: false;
    unitGradeWriteAuthorized: false;
    cfbdIngestAuthorized: false;
    shadowPreviewAuthorized: false;
    shadowCommitAuthorized: false;
  };
  blockers: string[];
  warnings: string[];
  auditOk: boolean;
}

export function isFiniteNumber(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n);
}

export function coveragePct(covered: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.round((covered * 1000) / expected) / 10;
}

export function uniqueSorted(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort();
  return out;
}

function identityKey(gameId: string, teamId: string): string {
  return `${gameId}\u0000${teamId}`;
}

function duplicateNonempty(ids: string[]): { empty: boolean; duplicate: boolean } {
  const seen = new Set<string>();
  let empty = false;
  let duplicate = false;
  for (const raw of ids) {
    const id = String(raw ?? '').trim();
    if (!id) {
      empty = true;
      continue;
    }
    const key = id.toLowerCase();
    if (seen.has(key)) duplicate = true;
    else seen.add(key);
  }
  return { empty, duplicate };
}

export function parseUnitGradeSourceReadinessArgs(argv: string[]):
  | { ok: true; season: number; reportPath: string | null }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let reportPath: string | null = null;

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
    } else if (a === '--report') {
      reportPath = String(argv[++i] ?? '').trim() || null;
    } else if (a.startsWith('--report=')) {
      reportPath = a.slice('--report='.length).trim() || null;
    } else if (a === '--week' || a.startsWith('--week=')) {
      errors.push('week is not an input for this current-season source audit');
    } else {
      errors.push(`unknown arg: ${a}`);
    }
  }

  if (season === null) season = TARGET_SEASON;
  if (season !== TARGET_SEASON) errors.push(`season must be ${TARGET_SEASON}`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, season, reportPath };
}

export function sanitizeUnitGradeSourceReadinessError(_err?: unknown): string {
  return '2026 unit-grade source readiness audit failed; connection and secret details suppressed';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(src).sort();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      out[k] = sortKeys(src[k]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export function formatUnitGradeSourceReadinessReport(
  report: UnitGradeSourceReadinessReport
): string {
  const lines = [
    '============================================',
    '2026 UNIT-GRADE SOURCE READINESS (READ ONLY)',
    '============================================',
    `status: ${report.status}`,
    `season: ${report.season}`,
    `repoCommitSha: ${report.repoCommitSha}`,
    `fbs: ${report.fbs.actual}/${report.fbs.expected} unique=${report.fbs.unique}`,
    `teamUnitGrades: rows=${report.teamUnitGrades.rows} teams=${report.teamUnitGrades.distinctTeams}`,
    `cfbdGames: ${report.cfbdSourceInventory.cfbdGames}`,
    `rawMetricCoverageComplete: ${report.readiness.rawMetricCoverageComplete}`,
    `legacyComputeCompatibleCoverageComplete: ${report.readiness.legacyComputeCompatibleCoverageComplete}`,
    `safeToRunExistingCompute: ${report.readiness.safeToRunExistingCompute}`,
    report.legacyCompatibilityDisclaimer,
    `providersInvoked: ${report.providersInvoked}`,
    `mutationsInvoked: ${report.mutationsInvoked}`,
    `auditOk: ${report.auditOk}`,
    '============================================',
    stableStringify(report).trimEnd(),
  ];
  return lines.join('\n');
}

export function buildUnitGradeSourceReadinessReport(
  input: UnitGradeSourceReadinessInput
): UnitGradeSourceReadinessReport {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const fbsRaw = input.fbsTeamIds
    .map((id) =>
      String(id ?? '')
        .trim()
        .toLowerCase()
    )
    .filter((id) => id.length > 0);
  const fbs = uniqueSorted(input.fbsTeamIds);
  if (fbsRaw.length !== fbs.length) {
    blockers.push('duplicate_fbs_team_membership');
  }
  if (fbs.length !== EXPECTED_FBS_COUNT) {
    blockers.push('fbs_population_not_138');
  }
  const fbsSet = new Set(fbs);

  const gameIdRaw = input.cfbdGames.map((g) => String(g.gameIdCfbd ?? '').trim());
  const gameDup = duplicateNonempty(gameIdRaw);
  if (gameDup.empty) blockers.push('cfbd_game_missing_id');
  if (gameDup.duplicate) blockers.push('duplicate_cfbd_game_id');
  const uniqueGameIds = uniqueSorted(gameIdRaw);
  const gameIdSet = new Set(uniqueGameIds);

  const effKeys: string[] = [];
  for (const row of input.effTeamGames) {
    const gid = String(row.gameIdCfbd ?? '').trim().toLowerCase();
    const tid = String(row.teamIdInternal ?? '').trim().toLowerCase();
    if (!gid || !tid) {
      blockers.push('eff_team_game_missing_identity');
      continue;
    }
    if (!gameIdSet.has(gid)) {
      blockers.push('eff_team_game_unlinked_game_id');
    }
    effKeys.push(identityKey(gid, tid));
  }
  const effDup = duplicateNonempty(effKeys);
  if (effDup.duplicate) blockers.push('duplicate_eff_team_game_identity');

  const ppaKeys: string[] = [];
  for (const row of input.ppaTeamGames) {
    const gid = String(row.gameIdCfbd ?? '').trim().toLowerCase();
    const tid = String(row.teamIdInternal ?? '').trim().toLowerCase();
    if (!gid || !tid) {
      blockers.push('ppa_team_game_missing_identity');
      continue;
    }
    if (!gameIdSet.has(gid)) {
      blockers.push('ppa_team_game_unlinked_game_id');
    }
    ppaKeys.push(identityKey(gid, tid));
  }
  const ppaDup = duplicateNonempty(ppaKeys);
  if (ppaDup.duplicate) blockers.push('duplicate_ppa_team_game_identity');

  const seasonTeams = input.effTeamSeasons.map((r) =>
    String(r.teamIdInternal ?? '').trim().toLowerCase()
  );
  const seasonDup = duplicateNonempty(seasonTeams);
  if (seasonDup.empty) blockers.push('eff_team_season_missing_team');
  if (seasonDup.duplicate) blockers.push('duplicate_eff_team_season_team');

  const gradeIds = uniqueSorted(input.teamUnitGrades.map((r) => r.teamId));
  const teamUnitGradesPresent = input.teamUnitGrades.length > 0;
  if (teamUnitGradesPresent) {
    blockers.push('team_unit_grades_present_without_authorized_compute_path');
  }

  const rawTeams: Record<RawMetric, Set<string>> = {
    lineYardsOff: new Set(),
    runEpa: new Set(),
    passEpa: new Set(),
    passSr: new Set(),
    defSr: new Set(),
    isoPppOff: new Set(),
    isoPppDef: new Set(),
    ppaOffense: new Set(),
    ppaDefense: new Set(),
    stuffRate: new Set(),
    havocOff: new Set(),
    havocDef: new Set(),
  };
  const rawRows: Record<RawMetric, number> = {
    lineYardsOff: 0,
    runEpa: 0,
    passEpa: 0,
    passSr: 0,
    defSr: 0,
    isoPppOff: 0,
    isoPppDef: 0,
    ppaOffense: 0,
    ppaDefense: 0,
    stuffRate: 0,
    havocOff: 0,
    havocDef: 0,
  };

  const mark = (metric: RawMetric, teamId: string, value: unknown) => {
    if (!isFiniteNumber(value)) return;
    const id = teamId.toLowerCase();
    if (!fbsSet.has(id)) return;
    rawRows[metric] += 1;
    rawTeams[metric].add(id);
  };

  for (const row of input.effTeamGames) {
    const gid = String(row.gameIdCfbd ?? '').trim().toLowerCase();
    if (!gameIdSet.has(gid)) continue;
    const tid = String(row.teamIdInternal ?? '').trim().toLowerCase();
    mark('lineYardsOff', tid, row.lineYardsOff);
    mark('runEpa', tid, row.runEpa);
    mark('passEpa', tid, row.passEpa);
    mark('passSr', tid, row.passSr);
    mark('defSr', tid, row.defSr);
    mark('isoPppOff', tid, row.isoPppOff);
    mark('isoPppDef', tid, row.isoPppDef);
  }

  for (const row of input.ppaTeamGames) {
    const gid = String(row.gameIdCfbd ?? '').trim().toLowerCase();
    if (!gameIdSet.has(gid)) continue;
    const tid = String(row.teamIdInternal ?? '').trim().toLowerCase();
    mark('ppaOffense', tid, row.ppaOffense);
    mark('ppaDefense', tid, row.ppaDefense);
  }

  for (const row of input.effTeamSeasons) {
    const tid = String(row.teamIdInternal ?? '').trim().toLowerCase();
    mark('stuffRate', tid, row.stuffRate);
    mark('havocOff', tid, row.havocOff);
    mark('havocDef', tid, row.havocDef);
  }

  const expected = EXPECTED_FBS_COUNT;
  const rawMetricCoverage = {} as Record<RawMetric, MetricCoverage>;
  for (const metric of RAW_METRICS) {
    const teams = uniqueSorted(Array.from(rawTeams[metric]));
    const missing = fbs.filter((id) => rawTeams[metric].has(id) === false);
    rawMetricCoverage[metric] = {
      definition: RAW_METRIC_DEFINITIONS[metric],
      finiteRows: rawRows[metric],
      distinctTeams: teams.length,
      missingTeamIds: missing,
      pct: coveragePct(teams.length, expected),
    };
  }

  const perTeamRawEvidence: PerTeamRawEvidence[] = [];
  for (const id of fbs) {
    const row = { teamId: id } as PerTeamRawEvidence;
    for (const metric of RAW_METRICS) {
      row[metric] = rawTeams[metric].has(id);
    }
    perTeamRawEvidence.push(row);
  }

  const legacyCovered: Record<LegacyCategory, Set<string>> = {
    offRun: new Set(),
    defRun: new Set(),
    offPass: new Set(),
    defPass: new Set(),
    offExplosiveness: new Set(),
    defExplosiveness: new Set(),
  };
  for (const id of fbs) {
    const line = rawTeams.lineYardsOff.has(id);
    const runEpa = rawTeams.runEpa.has(id);
    const ppaOff = rawTeams.ppaOffense.has(id);
    const ppaDef = rawTeams.ppaDefense.has(id);
    const passEpa = rawTeams.passEpa.has(id);
    const passSr = rawTeams.passSr.has(id);
    const defSr = rawTeams.defSr.has(id);
    const stuff = rawTeams.stuffRate.has(id);
    const isoOff = rawTeams.isoPppOff.has(id);
    const isoDef = rawTeams.isoPppDef.has(id);
    if (line || runEpa || ppaOff) legacyCovered.offRun.add(id);
    if (stuff || ppaDef) legacyCovered.defRun.add(id);
    if (passEpa || passSr || ppaOff) legacyCovered.offPass.add(id);
    if (defSr || ppaDef) legacyCovered.defPass.add(id);
    if (isoOff) legacyCovered.offExplosiveness.add(id);
    if (isoDef) legacyCovered.defExplosiveness.add(id);
  }

  const legacyComputeCompatibleCoverage = {} as Record<
    LegacyCategory,
    LegacyCategoryCoverage
  >;
  for (const cat of LEGACY_CATEGORIES) {
    const covered = uniqueSorted(Array.from(legacyCovered[cat]));
    legacyComputeCompatibleCoverage[cat] = {
      definition: LEGACY_CATEGORY_DEFINITIONS[cat],
      coveredTeamCount: covered.length,
      missingTeamIds: fbs.filter((id) => legacyCovered[cat].has(id) === false),
      pct: coveragePct(covered.length, expected),
    };
  }

  const teamsOnGames = new Set<string>();
  for (const g of input.cfbdGames) {
    const home = String(g.homeTeamIdInternal ?? '').trim().toLowerCase();
    const away = String(g.awayTeamIdInternal ?? '').trim().toLowerCase();
    if (fbsSet.has(home)) teamsOnGames.add(home);
    if (fbsSet.has(away)) teamsOnGames.add(away);
  }

  const sourcePopulationComplete =
    fbs.length === expected &&
    fbsRaw.length === fbs.length &&
    uniqueGameIds.length > 0 &&
    teamsOnGames.size === expected;

  const rawMetricCoverageComplete =
    fbs.length === expected &&
    RAW_METRICS.every((m) => rawMetricCoverage[m].distinctTeams === expected);

  const legacyComputeCompatibleCoverageComplete =
    fbs.length === expected &&
    LEGACY_CATEGORIES.every(
      (c) => legacyComputeCompatibleCoverage[c].coveredTeamCount === expected
    );

  const sourceRowTotal =
    uniqueGameIds.length +
    input.effTeamGames.length +
    input.ppaTeamGames.length +
    input.effTeamSeasons.length;

  let status: SourceReadinessStatus;
  if (teamUnitGradesPresent) {
    status = 'UNIT_GRADES_ALREADY_PRESENT_UNEXPECTEDLY';
  } else if (
    uniqueSorted(blockers).filter(
      (b) => b !== 'team_unit_grades_present_without_authorized_compute_path'
    ).length > 0
  ) {
    status = 'FRAME_INVALID';
  } else if (sourceRowTotal === 0) {
    status = 'SOURCE_EMPTY';
  } else if (legacyComputeCompatibleCoverageComplete) {
    status = 'SOURCE_COMPLETE_FOR_LEGACY_COMPUTE';
  } else {
    status = 'SOURCE_PARTIAL';
  }

  if (status === 'SOURCE_EMPTY') {
    warnings.push('source_empty_expected_until_guarded_2026_cfbd_ingest');
  } else if (status === 'SOURCE_PARTIAL') {
    warnings.push('source_coverage_incomplete');
  }
  if (legacyComputeCompatibleCoverageComplete && !rawMetricCoverageComplete) {
    warnings.push(
      'legacy_compute_compatible_via_fallback_does_not_authorize_methodology'
    );
  }
  warnings.push('safe_to_run_existing_compute_is_always_false');
  warnings.push(
    'existing_compute_unit_grades_would_manufacture_zero_grade_rows_on_empty_inputs'
  );

  const uniqueBlockers = uniqueSorted(blockers);

  const effTeams = uniqueSorted(
    input.effTeamGames.map((r) => String(r.teamIdInternal ?? ''))
  ).filter((id) => fbsSet.has(id));
  const ppaTeams = uniqueSorted(
    input.ppaTeamGames.map((r) => String(r.teamIdInternal ?? ''))
  ).filter((id) => fbsSet.has(id));
  const seasonTeamIds = uniqueSorted(seasonTeams).filter((id) => fbsSet.has(id));

  return {
    season: input.season,
    repoCommitSha: input.repoCommitSha,
    observedAt: input.observedAt,
    providersInvoked: false,
    mutationsInvoked: false,
    providerCalls: 0,
    mutationCount: 0,
    status,
    legacyCompatibilityDisclaimer: LEGACY_COMPATIBILITY_DISCLAIMER,
    fbs: {
      expected: EXPECTED_FBS_COUNT,
      actual: input.fbsTeamIds.length,
      unique: fbs.length,
      teamIds: fbs,
    },
    teamUnitGrades: {
      rows: input.teamUnitGrades.length,
      distinctTeams: gradeIds.length,
      teamIds: gradeIds,
    },
    cfbdSourceInventory: {
      cfbdGames: input.cfbdGames.length,
      distinctGameIds: uniqueGameIds.length,
      effTeamGameRows: input.effTeamGames.length,
      effTeamGameTeams: effTeams.length,
      ppaTeamGameRows: input.ppaTeamGames.length,
      ppaTeamGameTeams: ppaTeams.length,
      effTeamSeasonRows: input.effTeamSeasons.length,
      effTeamSeasonTeams: seasonTeamIds.length,
      priorsTeamSeasonRows: input.priorsTeamSeasonCount,
      priorsNote:
        'CfbdPriorsTeamSeason is inventory only and is NOT a required Hybrid unit-grade source',
    },
    rawMetricCoverage,
    perTeamRawEvidence,
    legacyComputeCompatibleCoverage,
    readiness: {
      sourcePopulationComplete,
      rawMetricCoverageComplete,
      legacyComputeCompatibleCoverageComplete,
      teamUnitGradesPresent,
      safeToRunExistingCompute: SAFE_TO_RUN_EXISTING_COMPUTE,
      computeUnitGradesAuthorized: false,
      unitGradeWriteAuthorized: false,
      cfbdIngestAuthorized: false,
      shadowPreviewAuthorized: false,
      shadowCommitAuthorized: false,
    },
    blockers: uniqueBlockers,
    warnings: uniqueSorted(warnings),
    auditOk: uniqueBlockers.length === 0,
  };
}
