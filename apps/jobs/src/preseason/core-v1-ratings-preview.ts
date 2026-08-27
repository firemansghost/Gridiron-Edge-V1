/**
 * Phase 2C-2H-3 — Read-only 2026 Core V1 preseason ratings preview (pure logic).
 *
 * Reuses computeV1SeasonRatings — no second formula implementation.
 * No Prisma/network. Never authorizes persistence.
 */

import {
  CONFERENCE_ADJUSTMENTS,
  calculateDecayFactor,
  computeV1SeasonRatings,
  getZScore,
  type TeamFeatures,
  type V1ComputedTeamRating,
} from '../ratings/compute_ratings_v1';
import type { getModelConfig } from '../config/model-weights';
import { EXPECTED_FBS_COUNT } from './season-conference-preview';

export const TARGET_SEASON = 2026 as const;
export { EXPECTED_FBS_COUNT };

export type PreviewMode = 'READ_ONLY';

export interface CoreV1PreviewGatesInput {
  season: number;
  fbsIds: string[];
  scheduleTeamIds: string[];
  conferenceByTeamId: Record<string, string>;
  conferenceMissingCount: number;
  conferenceUnrecognizedCount: number;
  legacyConferenceFallback: boolean;
  talentRows: Array<{
    teamId: string;
    talentComposite: number | null;
    blueChipsPct?: number | null;
  }>;
  existingTeamSeasonRatingCount: number;
  existingPowerRatingCount: number;
}

export interface CoreV1PreviewAuxiliaryInput {
  blueChipsPctNonNullCount: number;
  commitsNonNullCount: number;
  seasonStatsTeamCount: number;
  gameStatsTeamCount: number;
  unitGradesTeamCount: number;
}

export interface ConferenceSummaryRow {
  conference: string;
  teamCount: number;
  avgTalentComposite: number | null;
  avgTalentZ: number;
  avgConferenceAdjustment: number;
  avgFinalPowerRating: number;
  minFinalPowerRating: number;
  maxFinalPowerRating: number;
}

export interface CoreV1RatingsPreviewResult {
  ok: boolean;
  mode: PreviewMode;
  structuralOk: boolean;
  findings: string[];
  targetSeason: number;
  dbFbsCount: number;
  distinctFbsIds: number;
  scheduleTeamCount: number;
  scheduleFbsExact: boolean;
  conferenceExpected: number;
  conferenceLoaded: number;
  conferenceMissing: number;
  conferenceUnrecognized: number;
  legacyConferenceFallback: boolean;
  talentRows: number;
  talentDistinctTeams: number;
  talentFbsCovered: number;
  talentMissing: number;
  talentCompositeFinite: number;
  existingTeamSeasonRatings2026: number;
  existingWeeklyPowerRatings2026: number;
  blueChipsPctAvailable: string;
  blueChipsPctTreatment: 'NEUTRAL_ZSCORE_ZERO';
  commitsAvailable: string;
  commitsTreatment: 'NEUTRAL_ZSCORE_ZERO';
  seasonStatsAvailable: string;
  gameStatsAvailable: string;
  baseFeatureTeams: number;
  talentOnlyFallbackTeams: number;
  unitGradesAvailable: string;
  unitGradesRequiredByCoreV1: false;
  modelVersion: 'v1';
  calibrationFactor: number;
  talentWeight: number;
  blueChipWeight: number;
  commitsWeight: number;
  conferenceAdjustments: Array<{
    conference: string;
    rawAdjustment: number;
    effectiveAfterCalibration: number;
  }>;
  conferenceAdjustmentScaledByCalibration: true;
  ratings: V1ComputedTeamRating[];
  ratingCount: number;
  finiteRatingCount: number;
  nonFiniteRatingCount: number;
  powerRatingMin: number | null;
  powerRatingAvg: number | null;
  powerRatingMedian: number | null;
  powerRatingMax: number | null;
  powerRatingStdDev: number | null;
  confidenceMin: number | null;
  confidenceAvg: number | null;
  confidenceMax: number | null;
  zeroConfidenceCount: number;
  dataSourceBreakdown: Record<string, number>;
  offenseRatingMin: number | null;
  offenseRatingAvg: number | null;
  offenseRatingMax: number | null;
  defenseRatingMin: number | null;
  defenseRatingAvg: number | null;
  defenseRatingMax: number | null;
  talentComponentMin: number | null;
  talentComponentAvg: number | null;
  talentComponentMax: number | null;
  conferenceAdjustmentMin: number | null;
  conferenceAdjustmentAvg: number | null;
  conferenceAdjustmentMax: number | null;
  maxAbsPowerRating: number | null;
  ratingRange: number | null;
  conferenceContributionRangeAfterCalibration: number | null;
  top15: V1ComputedTeamRating[];
  bottom15: V1ComputedTeamRating[];
  byConference: ConferenceSummaryRow[];
  featureVectorCount: number;
  featureVectorUniqueTeams: number;
  featureVectorExactFbsSet: boolean;
  featureSeasonMismatchCount: number;
  featureTalentCompositeFinite: number;
  featureTalentCompositeMatchesPersisted: string;
  featureBlueChipsPctMatchesPersisted: string;
  featureCommitsSignalNonNull: number;
  featureIntegrityOk: boolean;
  providersInvoked: false;
  mutationsInvoked: false;
  ratingsPersistenceInvoked: false;
  teamSeasonRatingWrites: false;
  powerRatingWrites: false;
  oddsInvoked: false;
}

function sortedUnique(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
}

function setsEqual(a: string[], b: string[]): boolean {
  const aa = sortedUnique(a);
  const bb = sortedUnique(b);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}

function numericStats(values: number[]): {
  min: number | null;
  avg: number | null;
  max: number | null;
  median: number | null;
  stdDev: number | null;
} {
  if (values.length === 0) {
    return { min: null, avg: null, max: null, median: null, stdDev: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length;
  return { min, avg, max, median, stdDev: Math.sqrt(variance) };
}

export function assessCoreV1PreviewGates(
  input: CoreV1PreviewGatesInput
): { ok: boolean; findings: string[] } {
  const findings: string[] = [];
  const fbsIds = sortedUnique(input.fbsIds);
  const scheduleIds = sortedUnique(input.scheduleTeamIds);

  if (input.season !== TARGET_SEASON) {
    findings.push(`season must be ${TARGET_SEASON}`);
  }
  if (fbsIds.length !== EXPECTED_FBS_COUNT) {
    findings.push(`dbFbsCount ${fbsIds.length} != ${EXPECTED_FBS_COUNT}`);
  }
  if (fbsIds.length !== new Set(fbsIds).size) {
    findings.push('distinctFbsIds mismatch vs dbFbsCount');
  }
  if (scheduleIds.length !== EXPECTED_FBS_COUNT) {
    findings.push(
      `scheduleTeamCount ${scheduleIds.length} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (!setsEqual(scheduleIds, fbsIds)) {
    findings.push('schedule/FBS set not exact');
  }

  const confLoaded = Object.keys(input.conferenceByTeamId).length;
  if (confLoaded !== EXPECTED_FBS_COUNT) {
    findings.push(
      `conferenceLoaded ${confLoaded} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (input.conferenceMissingCount !== 0) {
    findings.push(
      `conferenceMissing ${input.conferenceMissingCount} != 0`
    );
  }
  if (input.conferenceUnrecognizedCount !== 0) {
    findings.push(
      `conferenceUnrecognized ${input.conferenceUnrecognizedCount} != 0`
    );
  }
  if (input.legacyConferenceFallback) {
    findings.push('legacyConferenceFallback must be false for 2026');
  }

  const talentDistinct = sortedUnique(input.talentRows.map((r) => r.teamId));
  const talentFinite = input.talentRows.filter(
    (r) => r.talentComposite !== null && Number.isFinite(r.talentComposite)
  );
  const talentFbs = talentFinite.filter((r) => fbsIds.includes(r.teamId));
  if (input.talentRows.length !== EXPECTED_FBS_COUNT) {
    findings.push(
      `talentRows ${input.talentRows.length} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (talentDistinct.length !== EXPECTED_FBS_COUNT) {
    findings.push(
      `talentDistinctTeams ${talentDistinct.length} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (talentFbs.length !== EXPECTED_FBS_COUNT) {
    findings.push(
      `talentFbsCovered ${talentFbs.length} != ${EXPECTED_FBS_COUNT}`
    );
  }
  const missingTalent = fbsIds.filter(
    (id) =>
      !talentFinite.some(
        (r) => r.teamId === id && Number.isFinite(r.talentComposite as number)
      )
  );
  if (missingTalent.length !== 0) {
    findings.push(`talentMissing ${missingTalent.length} != 0`);
  }
  if (talentFinite.length !== EXPECTED_FBS_COUNT) {
    findings.push(
      `talentCompositeFinite ${talentFinite.length} != ${EXPECTED_FBS_COUNT}`
    );
  }

  if (input.existingTeamSeasonRatingCount !== 0) {
    findings.push(
      `existingTeamSeasonRatings2026 ${input.existingTeamSeasonRatingCount} != 0 (output collision)`
    );
  }
  if (input.existingPowerRatingCount !== 0) {
    findings.push(
      `existingWeeklyPowerRatings2026 ${input.existingPowerRatingCount} != 0 (output collision)`
    );
  }

  return { ok: findings.length === 0, findings };
}

/** Same hasBaseFeatures rule as computeV1SeasonRatings (pre-compute). */
export function featureHasBaseFeatures(features: TeamFeatures): boolean {
  return (
    features.dataSource !== 'missing' &&
    (features.yppOff !== null ||
      features.yppDef !== null ||
      features.successOff !== null ||
      features.successDef !== null)
  );
}

const TALENT_FLOAT_TOLERANCE = 1e-9;

function nullableScalarsMatch(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  const aa = a === undefined ? null : a;
  const bb = b === undefined ? null : b;
  if (aa === null && bb === null) return true;
  if (aa === null || bb === null) return false;
  if (aa === bb) return true;
  return Math.abs(aa - bb) < TALENT_FLOAT_TOLERANCE;
}

export interface FeatureVectorIntegrityAssessment {
  featureVectorCount: number;
  featureVectorUniqueTeams: number;
  featureVectorExactFbsSet: boolean;
  featureSeasonMismatchCount: number;
  featureTalentCompositeFinite: number;
  featureTalentCompositeMatchesPersisted: number;
  featureBlueChipsPctMatchesPersisted: number;
  featureCommitsSignalNonNull: number;
  featureBaseFeatureTeams: number;
  featureTalentOnlyFallbackTeams: number;
  featureIntegrityOk: boolean;
  findings: string[];
}

/**
 * Cross-check the actual compute feature vector against structural gates /
 * persisted TeamSeasonTalent before calling computeV1SeasonRatings.
 */
export function assessFeatureVectorIntegrity(options: {
  fbsIds: string[];
  season: number;
  allFeatures: TeamFeatures[];
  persistedTalent: Array<{
    teamId: string;
    talentComposite: number | null;
    blueChipsPct?: number | null;
  }>;
  commitsNonNullCount: number;
  seasonStatsTeamCount: number;
  gameStatsTeamCount: number;
  existingTeamSeasonRatingCount: number;
}): FeatureVectorIntegrityAssessment {
  const findings: string[] = [];
  const fbsIds = sortedUnique(options.fbsIds);
  const features = options.allFeatures;
  const featureIds = features.map((f) => f.teamId);
  const uniqueFeatureIds = sortedUnique(featureIds);
  const featureVectorCount = features.length;
  const featureVectorUniqueTeams = uniqueFeatureIds.length;
  const featureVectorExactFbsSet =
    featureVectorCount === fbsIds.length &&
    featureVectorUniqueTeams === fbsIds.length &&
    setsEqual(featureIds, fbsIds);

  if (featureVectorCount !== EXPECTED_FBS_COUNT) {
    findings.push(
      `featureVectorCount ${featureVectorCount} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (featureVectorUniqueTeams !== EXPECTED_FBS_COUNT) {
    findings.push(
      `featureVectorUniqueTeams ${featureVectorUniqueTeams} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (!featureVectorExactFbsSet) {
    findings.push('featureVectorExactFbsSet=false');
  }
  if (featureIds.length !== uniqueFeatureIds.length) {
    findings.push('feature vector contains duplicate teamId');
  }

  const persistedById = new Map(
    options.persistedTalent.map((r) => [r.teamId, r])
  );

  let featureSeasonMismatchCount = 0;
  let featureTalentCompositeFinite = 0;
  let featureTalentCompositeMatchesPersisted = 0;
  let featureBlueChipsPctMatchesPersisted = 0;
  let featureCommitsSignalNonNull = 0;

  for (const id of fbsIds) {
    const matches = features.filter((f) => f.teamId === id);
    if (matches.length !== 1) {
      if (matches.length === 0) {
        findings.push(`feature missing for teamId=${id}`);
      }
      continue;
    }
    const f = matches[0];
    if (f.season !== options.season) {
      featureSeasonMismatchCount += 1;
    }
    const persisted = persistedById.get(id);
    const talent = f.talentComposite ?? null;
    if (talent !== null && Number.isFinite(talent)) {
      featureTalentCompositeFinite += 1;
    }
    if (
      persisted &&
      talent !== null &&
      Number.isFinite(talent) &&
      persisted.talentComposite !== null &&
      Number.isFinite(persisted.talentComposite) &&
      nullableScalarsMatch(talent, persisted.talentComposite)
    ) {
      featureTalentCompositeMatchesPersisted += 1;
    }
    if (
      persisted &&
      nullableScalarsMatch(f.blueChipsPct, persisted.blueChipsPct ?? null)
    ) {
      featureBlueChipsPctMatchesPersisted += 1;
    }
    if (f.commitsSignal !== null && f.commitsSignal !== undefined) {
      featureCommitsSignalNonNull += 1;
    }
  }

  const featureBaseFeatureTeams = features.filter((f) =>
    featureHasBaseFeatures(f)
  ).length;
  const featureTalentOnlyFallbackTeams = features.filter(
    (f) => !featureHasBaseFeatures(f)
  ).length;

  if (featureSeasonMismatchCount !== 0) {
    findings.push(
      `featureSeasonMismatchCount ${featureSeasonMismatchCount} != 0`
    );
  }
  if (featureTalentCompositeFinite !== EXPECTED_FBS_COUNT) {
    findings.push(
      `featureTalentCompositeFinite ${featureTalentCompositeFinite} != ${EXPECTED_FBS_COUNT}`
    );
  }
  if (featureTalentCompositeMatchesPersisted !== EXPECTED_FBS_COUNT) {
    findings.push(
      `featureTalentCompositeMatchesPersisted ${featureTalentCompositeMatchesPersisted}/${EXPECTED_FBS_COUNT} != ${EXPECTED_FBS_COUNT}/${EXPECTED_FBS_COUNT}`
    );
  }
  if (featureBlueChipsPctMatchesPersisted !== EXPECTED_FBS_COUNT) {
    findings.push(
      `featureBlueChipsPctMatchesPersisted ${featureBlueChipsPctMatchesPersisted}/${EXPECTED_FBS_COUNT} != ${EXPECTED_FBS_COUNT}/${EXPECTED_FBS_COUNT}`
    );
  }
  if (
    options.commitsNonNullCount === 0 &&
    featureCommitsSignalNonNull !== 0
  ) {
    findings.push(
      `featureCommitsSignalNonNull ${featureCommitsSignalNonNull} != 0 while commits row count=0`
    );
  }
  if (
    options.seasonStatsTeamCount === 0 &&
    options.gameStatsTeamCount === 0 &&
    options.existingTeamSeasonRatingCount === 0
  ) {
    if (featureBaseFeatureTeams !== 0) {
      findings.push(
        `preseason fallback: baseFeatureTeams ${featureBaseFeatureTeams} != 0`
      );
    }
    if (featureTalentOnlyFallbackTeams !== EXPECTED_FBS_COUNT) {
      findings.push(
        `preseason fallback: talentOnlyFallbackTeams ${featureTalentOnlyFallbackTeams} != ${EXPECTED_FBS_COUNT}`
      );
    }
  }

  return {
    featureVectorCount,
    featureVectorUniqueTeams,
    featureVectorExactFbsSet,
    featureSeasonMismatchCount,
    featureTalentCompositeFinite,
    featureTalentCompositeMatchesPersisted,
    featureBlueChipsPctMatchesPersisted,
    featureCommitsSignalNonNull,
    featureBaseFeatureTeams,
    featureTalentOnlyFallbackTeams,
    featureIntegrityOk: findings.length === 0,
    findings,
  };
}

export function buildCoreV1RatingsPreview(options: {
  gates: CoreV1PreviewGatesInput;
  auxiliary: CoreV1PreviewAuxiliaryInput;
  allFeatures: TeamFeatures[];
  conferenceMap: Map<string, string | null>;
  modelConfig: ReturnType<typeof getModelConfig>;
}): CoreV1RatingsPreviewResult {
  const gate = assessCoreV1PreviewGates(options.gates);
  const fbsIds = sortedUnique(options.gates.fbsIds);
  const scheduleIds = sortedUnique(options.gates.scheduleTeamIds);
  const talentFinite = options.gates.talentRows.filter(
    (r) => r.talentComposite !== null && Number.isFinite(r.talentComposite)
  );
  const talentDistinct = sortedUnique(
    options.gates.talentRows.map((r) => r.teamId)
  );
  const talentMissing = fbsIds.filter(
    (id) => !talentFinite.some((r) => r.teamId === id)
  );

  const integrity = assessFeatureVectorIntegrity({
    fbsIds,
    season: options.gates.season,
    allFeatures: options.allFeatures,
    persistedTalent: options.gates.talentRows,
    commitsNonNullCount: options.auxiliary.commitsNonNullCount,
    seasonStatsTeamCount: options.auxiliary.seasonStatsTeamCount,
    gameStatsTeamCount: options.auxiliary.gameStatsTeamCount,
    existingTeamSeasonRatingCount:
      options.gates.existingTeamSeasonRatingCount,
  });

  const findings = [...gate.findings, ...integrity.findings];
  const ok = gate.ok && integrity.featureIntegrityOk;

  const tw = options.modelConfig.talent_weights || {
    w_talent: 1.0,
    w_blue: 0.3,
    w_commits: 0.15,
  };
  const calibrationFactor = options.modelConfig.calibration_factor || 1.0;

  // Canonical conference keys for operator report (aliases omitted)
  const canonicalConfs = [
    'SEC',
    'Big Ten',
    'ACC',
    'Big 12',
    'Pac-12',
    'American Athletic',
    'Mountain West',
    'Sun Belt',
    'Mid-American',
    'Conference USA',
    'Independent',
    'Unknown',
  ];
  const conferenceAdjustmentsReport = canonicalConfs.map((conference) => {
    const rawAdjustment = CONFERENCE_ADJUSTMENTS[conference] ?? -5.0;
    return {
      conference,
      rawAdjustment,
      effectiveAfterCalibration: rawAdjustment * calibrationFactor,
    };
  });

  let ratings: V1ComputedTeamRating[] = [];
  if (ok) {
    ratings = computeV1SeasonRatings({
      season: TARGET_SEASON,
      allFeatures: options.allFeatures,
      conferenceMap: options.conferenceMap,
      modelConfig: options.modelConfig,
    });
  }

  const powers = ratings
    .map((r) => r.powerRating)
    .filter((v) => Number.isFinite(v));
  const confidences = ratings
    .map((r) => r.confidence)
    .filter((v) => Number.isFinite(v));
  const offenses = ratings
    .map((r) => r.offenseRating)
    .filter((v) => Number.isFinite(v));
  const defenses = ratings
    .map((r) => r.defenseRating)
    .filter((v) => Number.isFinite(v));
  const talents = ratings
    .map((r) => r.talentComponent)
    .filter((v) => Number.isFinite(v));
  const confAdj = ratings
    .map((r) => r.conferenceAdjustment)
    .filter((v) => Number.isFinite(v));

  const powerStats = numericStats(powers);
  const confStats = numericStats(confidences);
  const offStats = numericStats(offenses);
  const defStats = numericStats(defenses);
  const talStats = numericStats(talents);
  const adjStats = numericStats(confAdj);

  const dataSourceBreakdown: Record<string, number> = {};
  for (const r of ratings) {
    dataSourceBreakdown[r.dataSource] =
      (dataSourceBreakdown[r.dataSource] ?? 0) + 1;
  }

  const sortedByPower = [...ratings].sort(
    (a, b) => b.powerRating - a.powerRating
  );
  const top15 = sortedByPower.slice(0, 15);
  const bottom15 = [...sortedByPower].reverse().slice(0, 15);

  const byConfMap = new Map<string, V1ComputedTeamRating[]>();
  for (const r of ratings) {
    const key = r.conference ?? 'Unknown';
    const list = byConfMap.get(key) ?? [];
    list.push(r);
    byConfMap.set(key, list);
  }
  const byConference: ConferenceSummaryRow[] = [...byConfMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([conference, rows]) => {
      const tComp = rows
        .map((r) => r.talentComposite)
        .filter((v): v is number => v !== null && Number.isFinite(v));
      const powersC = rows.map((r) => r.powerRating);
      return {
        conference,
        teamCount: rows.length,
        avgTalentComposite:
          tComp.length === 0
            ? null
            : tComp.reduce((a, b) => a + b, 0) / tComp.length,
        avgTalentZ:
          rows.reduce((a, r) => a + r.talentZ, 0) / Math.max(rows.length, 1),
        avgConferenceAdjustment:
          rows.reduce((a, r) => a + r.conferenceAdjustment, 0) /
          Math.max(rows.length, 1),
        avgFinalPowerRating:
          powersC.reduce((a, b) => a + b, 0) / Math.max(powersC.length, 1),
        minFinalPowerRating: Math.min(...powersC),
        maxFinalPowerRating: Math.max(...powersC),
      };
    });

  const baseFeatureTeams = ok
    ? ratings.filter((r) => r.hasBaseFeatures).length
    : integrity.featureBaseFeatureTeams;
  const talentOnlyFallbackTeams = ok
    ? ratings.filter((r) => !r.hasBaseFeatures).length
    : integrity.featureTalentOnlyFallbackTeams;

  const scaledAdj = conferenceAdjustmentsReport.map(
    (c) => c.effectiveAfterCalibration
  );
  const scaledRange =
    scaledAdj.length === 0
      ? null
      : Math.max(...scaledAdj) - Math.min(...scaledAdj);

  const aux = options.auxiliary;
  const n = EXPECTED_FBS_COUNT;

  return {
    ok,
    mode: 'READ_ONLY',
    structuralOk: gate.ok,
    findings,
    targetSeason: options.gates.season,
    dbFbsCount: fbsIds.length,
    distinctFbsIds: fbsIds.length,
    scheduleTeamCount: scheduleIds.length,
    scheduleFbsExact: setsEqual(scheduleIds, fbsIds),
    conferenceExpected: EXPECTED_FBS_COUNT,
    conferenceLoaded: Object.keys(options.gates.conferenceByTeamId).length,
    conferenceMissing: options.gates.conferenceMissingCount,
    conferenceUnrecognized: options.gates.conferenceUnrecognizedCount,
    legacyConferenceFallback: options.gates.legacyConferenceFallback,
    talentRows: options.gates.talentRows.length,
    talentDistinctTeams: talentDistinct.length,
    talentFbsCovered: talentFinite.filter((r) => fbsIds.includes(r.teamId))
      .length,
    talentMissing: talentMissing.length,
    talentCompositeFinite: talentFinite.length,
    existingTeamSeasonRatings2026:
      options.gates.existingTeamSeasonRatingCount,
    existingWeeklyPowerRatings2026: options.gates.existingPowerRatingCount,
    blueChipsPctAvailable: `${aux.blueChipsPctNonNullCount}/${n}`,
    blueChipsPctTreatment: 'NEUTRAL_ZSCORE_ZERO',
    commitsAvailable: `${aux.commitsNonNullCount}/${n}`,
    commitsTreatment: 'NEUTRAL_ZSCORE_ZERO',
    seasonStatsAvailable: `${aux.seasonStatsTeamCount}/${n}`,
    gameStatsAvailable: `${aux.gameStatsTeamCount}/${n}`,
    baseFeatureTeams,
    talentOnlyFallbackTeams,
    unitGradesAvailable: `${aux.unitGradesTeamCount}/${n}`,
    unitGradesRequiredByCoreV1: false,
    modelVersion: 'v1',
    calibrationFactor,
    talentWeight: tw.w_talent,
    blueChipWeight: tw.w_blue,
    commitsWeight: tw.w_commits,
    conferenceAdjustments: conferenceAdjustmentsReport,
    conferenceAdjustmentScaledByCalibration: true,
    ratings,
    ratingCount: ratings.length,
    finiteRatingCount: powers.length,
    nonFiniteRatingCount: ratings.length - powers.length,
    powerRatingMin: powerStats.min,
    powerRatingAvg: powerStats.avg,
    powerRatingMedian: powerStats.median,
    powerRatingMax: powerStats.max,
    powerRatingStdDev: powerStats.stdDev,
    confidenceMin: confStats.min,
    confidenceAvg: confStats.avg,
    confidenceMax: confStats.max,
    zeroConfidenceCount: ratings.filter((r) => r.confidence === 0).length,
    dataSourceBreakdown,
    offenseRatingMin: offStats.min,
    offenseRatingAvg: offStats.avg,
    offenseRatingMax: offStats.max,
    defenseRatingMin: defStats.min,
    defenseRatingAvg: defStats.avg,
    defenseRatingMax: defStats.max,
    talentComponentMin: talStats.min,
    talentComponentAvg: talStats.avg,
    talentComponentMax: talStats.max,
    conferenceAdjustmentMin: adjStats.min,
    conferenceAdjustmentAvg: adjStats.avg,
    conferenceAdjustmentMax: adjStats.max,
    maxAbsPowerRating:
      powers.length === 0
        ? null
        : Math.max(...powers.map((p) => Math.abs(p))),
    ratingRange:
      powerStats.min === null || powerStats.max === null
        ? null
        : powerStats.max - powerStats.min,
    conferenceContributionRangeAfterCalibration: scaledRange,
    top15,
    bottom15,
    byConference,
    featureVectorCount: integrity.featureVectorCount,
    featureVectorUniqueTeams: integrity.featureVectorUniqueTeams,
    featureVectorExactFbsSet: integrity.featureVectorExactFbsSet,
    featureSeasonMismatchCount: integrity.featureSeasonMismatchCount,
    featureTalentCompositeFinite: integrity.featureTalentCompositeFinite,
    featureTalentCompositeMatchesPersisted: `${integrity.featureTalentCompositeMatchesPersisted}/${n}`,
    featureBlueChipsPctMatchesPersisted: `${integrity.featureBlueChipsPctMatchesPersisted}/${n}`,
    featureCommitsSignalNonNull: integrity.featureCommitsSignalNonNull,
    featureIntegrityOk: integrity.featureIntegrityOk,
    providersInvoked: false,
    mutationsInvoked: false,
    ratingsPersistenceInvoked: false,
    teamSeasonRatingWrites: false,
    powerRatingWrites: false,
    oddsInvoked: false,
  };
}

/** Build missing-stats TeamFeatures for preseason talent-only fixtures. */
export function buildMissingStatsFeatures(options: {
  teamId: string;
  season: number;
  talentComposite: number | null;
  blueChipsPct?: number | null;
  commitsSignal?: number | null;
  weeksPlayed?: number;
}): TeamFeatures {
  return {
    teamId: options.teamId,
    season: options.season,
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
    talentComposite: options.talentComposite,
    blueChipsPct: options.blueChipsPct ?? null,
    commitsSignal: options.commitsSignal ?? null,
    weeksPlayed: options.weeksPlayed ?? 0,
    dataSource: 'missing',
    confidence: 0,
    gamesCount: 0,
    lastUpdated: null,
  };
}

export function parseCoreV1RatingsPreviewArgs(
  argv: string[]
):
  | { ok: true; season: number; preview: true }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  let season: number | null = null;
  let preview = false;
  const WRITE_FLAGS = new Set([
    '--write',
    '--execute',
    '--upsert',
    '--persist',
    '--force',
    '--commit',
    '--confirm',
    '--confirm-write',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (WRITE_FLAGS.has(a)) {
      errors.push(`Write flag rejected: ${a}`);
      continue;
    }
    if (a === '--preview') {
      preview = true;
      continue;
    }
    if (a === '--season') {
      if (season !== null) {
        errors.push('--season specified more than once');
        continue;
      }
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isInteger(n)) errors.push(`--season requires integer`);
      else season = n;
      continue;
    }
    errors.push(`Unknown argument: ${a}`);
  }
  if (season === null) errors.push('--season is required');
  else if (season !== TARGET_SEASON) {
    errors.push(`--season must be ${TARGET_SEASON}`);
  }
  if (!preview) errors.push('--preview is required');
  if (errors.length) return { ok: false, errors };
  return { ok: true, season: TARGET_SEASON, preview: true };
}

export function sanitizeCoreV1RatingsPreviewError(_err?: unknown): string {
  return 'Core V1 ratings preview failed; connection and secret details suppressed';
}

export function formatCoreV1RatingsPreviewReport(
  result: CoreV1RatingsPreviewResult
): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const fmt = (v: number | null, d = 4) =>
    v === null || !Number.isFinite(v) ? 'n/a' : v.toFixed(d);

  push('============================================');
  push('2026 CORE V1 RATINGS PREVIEW (READ ONLY)');
  push('============================================');
  push(`mode=${result.mode}`);
  push(`ok=${result.ok}`);
  push(`structuralOk=${result.structuralOk}`);
  push(`targetSeason=${result.targetSeason}`);
  push(`dbFbsCount=${result.dbFbsCount}`);
  push(`distinctFbsIds=${result.distinctFbsIds}`);
  push(`scheduleTeamCount=${result.scheduleTeamCount}`);
  push(`scheduleFbsExact=${result.scheduleFbsExact}`);
  push(`conferenceExpected=${result.conferenceExpected}`);
  push(`conferenceLoaded=${result.conferenceLoaded}`);
  push(`conferenceMissing=${result.conferenceMissing}`);
  push(`conferenceUnrecognized=${result.conferenceUnrecognized}`);
  push(`legacyConferenceFallback=${result.legacyConferenceFallback}`);
  push(`talentRows=${result.talentRows}`);
  push(`talentDistinctTeams=${result.talentDistinctTeams}`);
  push(`talentFbsCovered=${result.talentFbsCovered}`);
  push(`talentMissing=${result.talentMissing}`);
  push(`talentCompositeFinite=${result.talentCompositeFinite}`);
  push(
    `existingTeamSeasonRatings2026=${result.existingTeamSeasonRatings2026}`
  );
  push(
    `existingWeeklyPowerRatings2026=${result.existingWeeklyPowerRatings2026}`
  );
  push(`featureVectorCount=${result.featureVectorCount}`);
  push(`featureVectorUniqueTeams=${result.featureVectorUniqueTeams}`);
  push(`featureVectorExactFbsSet=${result.featureVectorExactFbsSet}`);
  push(`featureSeasonMismatchCount=${result.featureSeasonMismatchCount}`);
  push(
    `featureTalentCompositeFinite=${result.featureTalentCompositeFinite}`
  );
  push(
    `featureTalentCompositeMatchesPersisted=${result.featureTalentCompositeMatchesPersisted}`
  );
  push(
    `featureBlueChipsPctMatchesPersisted=${result.featureBlueChipsPctMatchesPersisted}`
  );
  push(
    `featureCommitsSignalNonNull=${result.featureCommitsSignalNonNull}`
  );
  push(`featureIntegrityOk=${result.featureIntegrityOk}`);
  push(`blueChipsPctAvailable=${result.blueChipsPctAvailable}`);
  push(`blueChipsPctTreatment=${result.blueChipsPctTreatment}`);
  push(`commitsAvailable=${result.commitsAvailable}`);
  push(`commitsTreatment=${result.commitsTreatment}`);
  push(`seasonStatsAvailable=${result.seasonStatsAvailable}`);
  push(`gameStatsAvailable=${result.gameStatsAvailable}`);
  push(`baseFeatureTeams=${result.baseFeatureTeams}`);
  push(`talentOnlyFallbackTeams=${result.talentOnlyFallbackTeams}`);
  push(`unitGradesAvailable=${result.unitGradesAvailable}`);
  push(
    `unitGradesRequiredByCoreV1=${result.unitGradesRequiredByCoreV1}`
  );
  push(`modelVersion=${result.modelVersion}`);
  push(`calibrationFactor=${result.calibrationFactor}`);
  push(`talentWeight=${result.talentWeight}`);
  push(`blueChipWeight=${result.blueChipWeight}`);
  push(`commitsWeight=${result.commitsWeight}`);
  push(
    `conferenceAdjustmentScaledByCalibration=${result.conferenceAdjustmentScaledByCalibration}`
  );
  push('conferenceAdjustments (raw → effective after calibration):');
  for (const c of result.conferenceAdjustments) {
    push(
      `  ${c.conference}: ${c.rawAdjustment} → ${c.effectiveAfterCalibration}`
    );
  }
  push(`ratingCount=${result.ratingCount}`);
  push(`finiteRatingCount=${result.finiteRatingCount}`);
  push(`nonFiniteRatingCount=${result.nonFiniteRatingCount}`);
  push(
    `powerRating min/avg/median/max/stddev=${fmt(result.powerRatingMin)}/${fmt(result.powerRatingAvg)}/${fmt(result.powerRatingMedian)}/${fmt(result.powerRatingMax)}/${fmt(result.powerRatingStdDev)}`
  );
  push(
    `confidence min/avg/max=${fmt(result.confidenceMin)}/${fmt(result.confidenceAvg)}/${fmt(result.confidenceMax)}`
  );
  push(`zeroConfidenceCount=${result.zeroConfidenceCount}`);
  push(
    `dataSourceBreakdown=${JSON.stringify(result.dataSourceBreakdown)}`
  );
  push(
    `offenseRating min/avg/max=${fmt(result.offenseRatingMin)}/${fmt(result.offenseRatingAvg)}/${fmt(result.offenseRatingMax)}`
  );
  push(
    `defenseRating min/avg/max=${fmt(result.defenseRatingMin)}/${fmt(result.defenseRatingAvg)}/${fmt(result.defenseRatingMax)}`
  );
  push(
    `talentComponent min/avg/max=${fmt(result.talentComponentMin)}/${fmt(result.talentComponentAvg)}/${fmt(result.talentComponentMax)}`
  );
  push(
    `conferenceAdjustment min/avg/max=${fmt(result.conferenceAdjustmentMin)}/${fmt(result.conferenceAdjustmentAvg)}/${fmt(result.conferenceAdjustmentMax)}`
  );
  push(`maxAbsPowerRating=${fmt(result.maxAbsPowerRating)}`);
  push(`ratingRange=${fmt(result.ratingRange)}`);
  push(
    `conferenceContributionRangeAfterCalibration=${fmt(result.conferenceContributionRangeAfterCalibration)}`
  );
  push('top15 by powerRating:');
  for (const r of result.top15) {
    push(
      `  ${r.teamId} conf=${r.conference} talent=${r.talentComposite} talentZ=${fmt(r.talentZ)} blueZ=${fmt(r.blueChipZ)} commitsZ=${fmt(r.commitsZ)} prior=${fmt(r.talentPrior)} decay=${fmt(r.decay)} talentComp=${fmt(r.talentComponent)} off=${fmt(r.offenseRating)} def=${fmt(r.defenseRating)} hasBase=${r.hasBaseFeatures} confAdj=${fmt(r.conferenceAdjustment)} raw=${fmt(r.rawScore)} adj=${fmt(r.adjustedScore)} cal=${r.calibrationFactor} power=${fmt(r.powerRating)} confScore=${fmt(r.confidence)} src=${r.dataSource}`
    );
  }
  push('bottom15 by powerRating:');
  for (const r of result.bottom15) {
    push(
      `  ${r.teamId} conf=${r.conference} talent=${r.talentComposite} talentZ=${fmt(r.talentZ)} blueZ=${fmt(r.blueChipZ)} commitsZ=${fmt(r.commitsZ)} prior=${fmt(r.talentPrior)} decay=${fmt(r.decay)} talentComp=${fmt(r.talentComponent)} off=${fmt(r.offenseRating)} def=${fmt(r.defenseRating)} hasBase=${r.hasBaseFeatures} confAdj=${fmt(r.conferenceAdjustment)} raw=${fmt(r.rawScore)} adj=${fmt(r.adjustedScore)} cal=${r.calibrationFactor} power=${fmt(r.powerRating)} confScore=${fmt(r.confidence)} src=${r.dataSource}`
    );
  }
  push('byConference:');
  for (const c of result.byConference) {
    push(
      `  ${c.conference}: n=${c.teamCount} avgTalent=${fmt(c.avgTalentComposite)} avgTalentZ=${fmt(c.avgTalentZ)} avgConfAdj=${fmt(c.avgConferenceAdjustment)} avgPower=${fmt(c.avgFinalPowerRating)} minPower=${fmt(c.minFinalPowerRating)} maxPower=${fmt(c.maxFinalPowerRating)}`
    );
  }
  push(`providersInvoked=${result.providersInvoked}`);
  push(`mutationsInvoked=${result.mutationsInvoked}`);
  push(`ratingsPersistenceInvoked=${result.ratingsPersistenceInvoked}`);
  push(`teamSeasonRatingWrites=${result.teamSeasonRatingWrites}`);
  push(`powerRatingWrites=${result.powerRatingWrites}`);
  push(`Odds=${result.oddsInvoked}`);
  if (result.findings.length) {
    push('findings:');
    for (const f of result.findings) push(`  - ${f}`);
  }
  push('============================================');
  return lines.join('\n');
}

// Re-export helpers used by tests for formula parity assertions
export { calculateDecayFactor, getZScore, computeV1SeasonRatings };
