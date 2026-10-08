/**
 * ML-CAL-1 G4 — Read-only lifecycle binding observer (offline / fixture-first).
 *
 * Injectable transaction adapter only. No live DB connection strings, providers,
 * pooler preflight, workflow enablement, registration, calibration, or 2025 access.
 *
 * Design pin: research/moneyline/ML_CAL_1_LIFECYCLE_BINDING_OBSERVER_G4_DESIGN.md
 * Acceptance: research/moneyline/G4_OBSERVER_DESIGN_ACCEPTANCE_20261008.md
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { b1CanonicalWeight } from '../src/preseason/balanced-v1-transition-blend-eval';
import {
  buildRatingFingerprint,
  buildStoreZip,
  exportRatingInput,
  extractSingleUtf8MemberFromZip,
  ML_CAL_1_BINDING_EXPECTED_FBS_COUNT,
  ML_CAL_1_BINDING_FULL_WEIGHT,
  ML_CAL_1_BINDING_FULL_WEIGHT_MIN_WEEK,
  ML_CAL_1_BINDING_MODEL_VERSION,
  ML_CAL_1_BINDING_POLICY,
  ML_CAL_1_BINDING_RATING_EPS,
  ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA,
  ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS,
  parseFiniteNumber,
  parseLifecycleReport,
  reconstructRawRatingRow,
  serializeSidecar,
  sha256Utf8Bytes,
  stableStringify,
  type MlCal1BindingObservedRatingRow,
  type MlCal1LifecycleBindingSidecarV1,
  type MlCal1LifecycleReportParsed,
} from './ml-cal-1-lifecycle-binding';

// ---------------------------------------------------------------------------
// Constants / allowlist (exact capture parity — nine TeamSeasonRating scalars)
// ---------------------------------------------------------------------------

export const ML_CAL_1_G4_OBSERVER_PACKAGE_SCHEMA =
  'ml-cal-1-lifecycle-binding-observer-package-v1' as const;

export const ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS = [
  'season',
  'teamId',
  'modelVersion',
  'powerRating',
  'rating',
  'games',
  'dataSource',
  'createdAt',
  'updatedAt',
] as const;

export type MlCal1G4TeamSeasonRatingScalar =
  (typeof ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS)[number];

export const ML_CAL_1_G4_DESIGN_ON_DISK_SHA256 =
  '53d8906c2caa3b68658c6596d74f28e1ec2367fa026991013dadb210aca922bc' as const;
export const ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256 =
  'e61ffd3cb7563fea1d616969df64d760bfe7e931cf654074ab2e9f5146dc3215' as const;
export const ML_CAL_1_G4_BASE_G3_TIP =
  '955cb46bad0ccca40d073a10d2c0aea3adf236a2' as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MlCal1G4ArchivePins {
  expectedZipSha256: string;
  expectedReportMemberSha256: string;
  expectedLifecycleProducerSha: string;
  workflowRunId: string;
  artifactId: string;
  artifactName: string;
  reportMemberPath: string;
  workflowRunCompletedAt: string;
  artifactCreatedAt: string;
}

export interface MlCal1G4RawRatingRow {
  season: number;
  teamId: string;
  modelVersion: string;
  /** Exact Decimal/text — never Number()-coerced for storage. */
  powerRating: { toString(): string } | string | null;
  rating: { toString(): string } | string | null;
  games: number;
  dataSource: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface MlCal1G4TxMetadata {
  transactionIsolation: string;
  transactionReadOnly: string;
  transactionTimestamp: string;
  serverClockDiagnostics: Record<string, string>;
}

export interface MlCal1G4ObserverTxClient {
  setTransactionReadOnly(): Promise<void>;
  queryTransactionMetadata(): Promise<MlCal1G4TxMetadata>;
  selectTeamSeasonRatings(args: {
    season: number;
    modelVersion: 'v1';
    scalars: readonly MlCal1G4TeamSeasonRatingScalar[];
  }): Promise<MlCal1G4RawRatingRow[]>;
}

export interface MlCal1G4ObserverTxAdapter {
  /**
   * Bounded interactive transaction at RepeatableRead.
   * Implementations must not use a live DB unless separately authorized later.
   */
  withRepeatableReadTransaction<T>(
    fn: (client: MlCal1G4ObserverTxClient) => Promise<T>
  ): Promise<T>;
}

export interface MlCal1G4ArchivePrerequisiteResult {
  ok: boolean;
  reasons: string[];
  report: MlCal1LifecycleReportParsed | null;
  zipSha256: string;
  reportMemberSha256: string;
  reportByteCount: number;
  fullWeightByPolicy: boolean;
  memberPath: string;
  memberBytes: Buffer | null;
}

export interface MlCal1G4ObserverAttemptInput {
  observationId: string;
  bindingObserverSha: string;
  lifecycleProducerSha: string;
  archivePins: MlCal1G4ArchivePins;
  zipBytes: Buffer;
  txAdapter: MlCal1G4ObserverTxAdapter;
  /** Host wall clock. */
  now: () => Date;
  nowCeiling: string;
  /**
   * Fixture-only prospective target. Omit / null in production G4 emission —
   * never invent eligibility. When supplied, computes prospectiveOk only.
   */
  prospectiveTargetWeek?: number | null;
  /**
   * Offline G4 PR is fixture-only. Must be explicitly `true`.
   * `false` / omitted → fail closed (`nonfixture_execution_not_authorized`).
   */
  fixtureMode?: boolean;
  /** Optional synthetic / test-only provenance bytes retained in the sealed package. */
  fixtureProvenanceBytes?: Buffer | null;
  packageRootDir: string;
  /** Optional spy: incremented each time the TX adapter is entered. */
  onAdapterEnter?: () => void;
}

export interface MlCal1G4ObserverAttemptResult {
  ok: boolean;
  reasons: string[];
  notes: string[];
  observationId: string;
  fullWeightByPolicy: boolean;
  prospectiveOk: boolean | null;
  /** Never claimed without approved target + all gates; fixtures keep false. */
  fullWeightEligibleClaimed: false;
  liveAccepted: false;
  ratingFingerprint: string | null;
  usableRowCount: number | null;
  numericOk: boolean;
  cohortOk: boolean;
  timingOk: boolean;
  packageDir: string | null;
  packageManifestSha256: string | null;
  memberDigests: Record<string, { sha256: string; byteCount: number }> | null;
  sidecarDigest: string | null;
  diagnosticFailureReceiptPath: string | null;
  observationStartTime: string | null;
  observationEndTime: string | null;
  bindingSnapshotReferenceTime: string | null;
  dbTransactionTime: string | null;
  readMode: 'repeatable_read_readonly' | 'fixture_injected' | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(d: Date | string): string {
  if (typeof d === 'string') return d;
  return d.toISOString();
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (value == null || typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isNonEmptyIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Serialize timestamp consistently for sidecar extrema (UTC ISO). */
function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Validate every observed row's timestamps; compute extrema by epoch ms
 * (not lexical string sort). Fail closed on createdAt > updatedAt, unparseable,
 * or timestamps after binding snapshot / ceiling.
 */
export function validateObservedRowTimestamps(input: {
  rows: MlCal1BindingObservedRatingRow[];
  bindingSnapshotReferenceTime: string;
  nowCeiling: string;
}): {
  ok: boolean;
  reasons: string[];
  rowCreatedAtMin: string | null;
  rowCreatedAtMax: string | null;
  rowUpdatedAtMin: string | null;
  rowUpdatedAtMax: string | null;
} {
  const reasons: string[] = [];
  const tSnap = parseIsoMs(input.bindingSnapshotReferenceTime);
  const nowCeiling = parseIsoMs(input.nowCeiling);
  if (tSnap == null || nowCeiling == null) {
    return {
      ok: false,
      reasons: ['observation_time_order_invalid'],
      rowCreatedAtMin: null,
      rowCreatedAtMax: null,
      rowUpdatedAtMin: null,
      rowUpdatedAtMax: null,
    };
  }
  if (input.rows.length === 0) {
    return {
      ok: false,
      reasons: ['row_timestamp_empty_set'],
      rowCreatedAtMin: null,
      rowCreatedAtMax: null,
      rowUpdatedAtMin: null,
      rowUpdatedAtMax: null,
    };
  }

  let cMin = Number.POSITIVE_INFINITY;
  let cMax = Number.NEGATIVE_INFINITY;
  let uMin = Number.POSITIVE_INFINITY;
  let uMax = Number.NEGATIVE_INFINITY;

  for (const row of input.rows) {
    const c = parseIsoMs(row.createdAt);
    const u = parseIsoMs(row.updatedAt);
    if (c == null || u == null) {
      reasons.push(`row_timestamp_invalid:${row.teamId}`);
      continue;
    }
    if (c > u) {
      reasons.push(`row_created_after_updated:${row.teamId}`);
    }
    if (c > tSnap || u > tSnap) {
      reasons.push(`row_updated_after_binding_snapshot:${row.teamId}`);
    }
    if (c > nowCeiling || u > nowCeiling) {
      reasons.push(`row_timestamp_in_future:${row.teamId}`);
    }
    if (c < cMin) cMin = c;
    if (c > cMax) cMax = c;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
  }

  if (reasons.length > 0 || !Number.isFinite(cMin) || !Number.isFinite(uMax)) {
    return {
      ok: false,
      reasons:
        reasons.length > 0 ? reasons : ['row_timestamp_extrema_unavailable'],
      rowCreatedAtMin: null,
      rowCreatedAtMax: null,
      rowUpdatedAtMin: null,
      rowUpdatedAtMax: null,
    };
  }

  return {
    ok: true,
    reasons: [],
    rowCreatedAtMin: isoFromMs(cMin),
    rowCreatedAtMax: isoFromMs(cMax),
    rowUpdatedAtMin: isoFromMs(uMin),
    rowUpdatedAtMax: isoFromMs(uMax),
  };
}

export function evaluatePreAdapterChronology(input: {
  observationStartTime: string;
  workflowRunCompletedAt: string;
  artifactCreatedAt: string;
  nowCeiling: string;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const tObs0 = parseIsoMs(input.observationStartTime);
  const tRun = parseIsoMs(input.workflowRunCompletedAt);
  const tArt = parseIsoMs(input.artifactCreatedAt);
  const nowCeiling = parseIsoMs(input.nowCeiling);
  if (tObs0 == null || nowCeiling == null) {
    reasons.push('observation_time_order_invalid');
    return { ok: false, reasons };
  }
  if (tRun == null || tArt == null) {
    reasons.push('archive_chronology_missing');
    return { ok: false, reasons };
  }
  if (tRun > tObs0 || tArt > tObs0) {
    reasons.push('observation_predates_archive');
  }
  if (tRun > nowCeiling || tArt > nowCeiling) {
    reasons.push('archive_time_after_ceiling');
  }
  if (tObs0 > nowCeiling) {
    reasons.push('observation_time_after_ceiling');
  }
  return { ok: reasons.length === 0, reasons };
}

function decimalRaw(value: MlCal1G4RawRatingRow['powerRating']): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value.toString();
}

function assertAllowlist(
  scalars: readonly string[]
): asserts scalars is readonly MlCal1G4TeamSeasonRatingScalar[] {
  const expected = ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS;
  if (scalars.length !== expected.length) {
    throw new Error(`allowlist_length_mismatch:${scalars.length}`);
  }
  for (let i = 0; i < expected.length; i++) {
    if (scalars[i] !== expected[i]) {
      throw new Error(`allowlist_scalar_mismatch:${scalars[i]}!=${expected[i]}`);
    }
  }
}

export function verifyExactTeamSeasonRatingAllowlist(
  scalars: readonly string[]
): { ok: boolean; reasons: string[] } {
  try {
    assertAllowlist(scalars);
    return { ok: true, reasons: [] };
  } catch (e) {
    return {
      ok: false,
      reasons: [e instanceof Error ? e.message : 'allowlist_invalid'],
    };
  }
}

// ---------------------------------------------------------------------------
// Archive prerequisites (§2)
// ---------------------------------------------------------------------------

export function evaluateG4ArchivePrerequisites(input: {
  zipBytes: Buffer;
  pins: MlCal1G4ArchivePins;
}): MlCal1G4ArchivePrerequisiteResult {
  const reasons: string[] = [];
  const zipSha256 = sha256Utf8Bytes(input.zipBytes);
  if (zipSha256 !== input.pins.expectedZipSha256) {
    reasons.push('archive_pin_mismatch:zip');
  }

  let memberPath = '';
  let memberBytes: Buffer | null = null;
  let report: MlCal1LifecycleReportParsed | null = null;
  let reportMemberSha256 = '';
  try {
    const extracted = extractSingleUtf8MemberFromZip(input.zipBytes);
    memberPath = extracted.memberPath;
    memberBytes = extracted.memberBytes;
    reportMemberSha256 = sha256Utf8Bytes(memberBytes);
    if (reportMemberSha256 !== input.pins.expectedReportMemberSha256) {
      reasons.push('archive_pin_mismatch:member');
    }
    if (memberPath !== input.pins.reportMemberPath) {
      reasons.push('archive_member_path_mismatch');
    }
    report = parseLifecycleReport(memberBytes);
  } catch (e) {
    reasons.push(
      `archive_extract_or_parse_failed:${e instanceof Error ? e.message : 'unknown'}`
    );
  }

  if (input.pins.expectedLifecycleProducerSha.trim() === '') {
    reasons.push('archive_pin_mismatch:producer_missing');
  }
  if (!isNonEmptyIdentity(input.pins.workflowRunId)) {
    reasons.push('archive_identity_missing:workflowRunId');
  }
  if (!isNonEmptyIdentity(input.pins.artifactId)) {
    reasons.push('archive_identity_missing:artifactId');
  }
  if (!isNonEmptyIdentity(input.pins.artifactName)) {
    reasons.push('archive_identity_missing:artifactName');
  }
  if (!isNonEmptyIdentity(input.pins.reportMemberPath)) {
    reasons.push('archive_identity_missing:reportMemberPath');
  }

  const tRun = parseIsoMs(input.pins.workflowRunCompletedAt);
  const tArt = parseIsoMs(input.pins.artifactCreatedAt);
  if (tRun == null || tArt == null) {
    reasons.push('archive_chronology_missing');
  }

  let fullWeightByPolicy = false;
  if (report) {
    if (report.season !== 2026) reasons.push('archive_season_not_2026');
    if (report.modelVersion !== ML_CAL_1_BINDING_MODEL_VERSION) {
      reasons.push('archive_modelVersion_mismatch');
    }
    if (report.selectedPolicy !== ML_CAL_1_BINDING_POLICY) {
      reasons.push('archive_policy_mismatch');
    }
    if (report.execution?.commitSucceeded !== true) {
      reasons.push('archive_commit_not_succeeded');
    }
    if (report.execution?.postWriteVerificationSucceeded !== true) {
      reasons.push('archive_post_write_verification_failed');
    }
    const v = report.verification ?? {};
    if (v.ok !== true) reasons.push('archive_verification_not_ok');
    const reasonsArr = Array.isArray(v.reasons) ? v.reasons : null;
    if (reasonsArr == null || reasonsArr.length !== 0) {
      reasons.push('archive_verification_reasons_nonempty');
    }
    if (v.afterRows !== ML_CAL_1_BINDING_EXPECTED_FBS_COUNT) {
      reasons.push('archive_verification_afterRows_mismatch');
    }
    if (v.verifiedTeams !== ML_CAL_1_BINDING_EXPECTED_FBS_COUNT) {
      reasons.push('archive_verification_verifiedTeams_mismatch');
    }
    if (
      !Number.isInteger(report.completedThroughWeek) ||
      report.completedThroughWeek < ML_CAL_1_BINDING_FULL_WEIGHT_MIN_WEEK
    ) {
      reasons.push('archive_completedThroughWeek_below_full_weight');
    }
    const recomputedWeight = b1CanonicalWeight(report.completedThroughWeek);
    if (report.canonicalWeight !== recomputedWeight) {
      reasons.push('archive_canonicalWeight_mismatch');
    }
    fullWeightByPolicy =
      report.completedThroughWeek >= ML_CAL_1_BINDING_FULL_WEIGHT_MIN_WEEK &&
      recomputedWeight === ML_CAL_1_BINDING_FULL_WEIGHT;
    if (!fullWeightByPolicy) {
      reasons.push('fullWeightByPolicy_false');
    }
    const ids = report.rows.map((r) => r.teamId);
    const unique = new Set(ids);
    if (unique.size !== ML_CAL_1_BINDING_EXPECTED_FBS_COUNT) {
      reasons.push('archive_planned_cohort_count_mismatch');
    }
    if (ids.length !== unique.size) {
      reasons.push('archive_planned_duplicate_teamId');
    }
    for (const row of report.rows) {
      if (parseFiniteNumber(row.finalPowerRating) === null) {
        reasons.push(`planned_finalPowerRating_invalid:${row.teamId}`);
      }
      if (
        !Number.isInteger(row.games) ||
        row.games < 0 ||
        parseFiniteNumber(row.games) === null
      ) {
        reasons.push(`planned_games_invalid:${row.teamId}`);
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    report,
    zipSha256,
    reportMemberSha256,
    reportByteCount: memberBytes?.length ?? 0,
    fullWeightByPolicy,
    memberPath,
    memberBytes,
  };
}

// ---------------------------------------------------------------------------
// Timing / cohort / numeric (accepted verifier semantics)
// ---------------------------------------------------------------------------

export function evaluateG4ObservationTiming(input: {
  observationStartTime: string;
  observationEndTime: string;
  bindingSnapshotReferenceTime: string;
  dbTransactionTime: string | null;
  dbTransactionTimeRequired: boolean;
  workflowRunCompletedAt: string;
  artifactCreatedAt: string;
  nowCeiling: string;
  rowCreatedAtMin: string;
  rowCreatedAtMax: string;
  rowUpdatedAtMin: string;
  rowUpdatedAtMax: string;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const tObs0 = parseIsoMs(input.observationStartTime);
  const tSnap = parseIsoMs(input.bindingSnapshotReferenceTime);
  const tObs1 = parseIsoMs(input.observationEndTime);
  const tDb = parseIsoMs(input.dbTransactionTime);
  const tRun = parseIsoMs(input.workflowRunCompletedAt);
  const tArt = parseIsoMs(input.artifactCreatedAt);
  const nowCeiling = parseIsoMs(input.nowCeiling);
  const cMin = parseIsoMs(input.rowCreatedAtMin);
  const cMax = parseIsoMs(input.rowCreatedAtMax);
  const uMin = parseIsoMs(input.rowUpdatedAtMin);
  const uMax = parseIsoMs(input.rowUpdatedAtMax);

  if (tObs0 == null || tSnap == null || tObs1 == null || nowCeiling == null) {
    reasons.push('observation_time_order_invalid');
  } else {
    if (!(tObs0 <= tSnap && tSnap <= tObs1)) {
      reasons.push('observation_time_order_invalid');
    }
    if (tObs0 > nowCeiling || tSnap > nowCeiling || tObs1 > nowCeiling) {
      reasons.push('observation_time_after_ceiling');
    }
  }

  if (tRun == null || tArt == null) {
    reasons.push('archive_chronology_missing');
  } else if (tObs0 != null && nowCeiling != null) {
    if (tRun > tObs0 || tArt > tObs0) {
      reasons.push('observation_predates_archive');
    }
    if (tRun > nowCeiling || tArt > nowCeiling) {
      reasons.push('archive_time_after_ceiling');
    }
  }

  if (input.dbTransactionTimeRequired) {
    if (input.dbTransactionTime == null) {
      reasons.push('db_transaction_time_missing');
    } else if (tDb == null) {
      reasons.push('db_transaction_time_invalid');
    } else if (tObs0 != null && tObs1 != null && !(tObs0 <= tDb && tDb <= tObs1)) {
      reasons.push('observation_time_order_invalid');
    }
  } else if (input.dbTransactionTime != null) {
    if (tDb == null) {
      reasons.push('db_transaction_time_invalid');
    } else if (tObs0 != null && tObs1 != null && !(tObs0 <= tDb && tDb <= tObs1)) {
      reasons.push('observation_time_order_invalid');
    }
  }

  if (cMin == null || cMax == null || uMin == null || uMax == null) {
    reasons.push('row_timestamp_invalid');
  } else if (tSnap != null) {
    if (cMax > tSnap || uMax > tSnap) {
      reasons.push('row_updated_after_binding_snapshot');
    }
    if (nowCeiling != null && (cMax > nowCeiling || uMax > nowCeiling)) {
      reasons.push('row_timestamp_in_future');
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function evaluateG4CohortAndNumeric(input: {
  report: MlCal1LifecycleReportParsed;
  rows: MlCal1BindingObservedRatingRow[];
}): {
  ok: boolean;
  reasons: string[];
  ratingFingerprint: string | null;
  usableRowCount: number;
  numericOk: boolean;
  cohortOk: boolean;
} {
  const reasons: string[] = [];
  const plannedIds = input.report.rows.map((r) => r.teamId);
  const plannedUnique = [...new Set(plannedIds)].sort();
  const observedIds = input.rows.map((r) => r.teamId);
  const observedUnique = [...new Set(observedIds)].sort();

  let cohortOk = true;
  if (plannedUnique.length !== ML_CAL_1_BINDING_EXPECTED_FBS_COUNT) {
    reasons.push('binding_cohort_mismatch:planned');
    cohortOk = false;
  }
  if (observedUnique.length !== ML_CAL_1_BINDING_EXPECTED_FBS_COUNT) {
    reasons.push('binding_cohort_mismatch:observed');
    cohortOk = false;
  }
  if (observedIds.length !== observedUnique.length) {
    reasons.push('binding_cohort_mismatch:duplicate_observed');
    cohortOk = false;
  }
  if (plannedUnique.join('\0') !== observedUnique.join('\0')) {
    reasons.push('binding_cohort_mismatch:set');
    cohortOk = false;
  }

  for (const row of input.rows) {
    if (row.season !== input.report.season || row.modelVersion !== 'v1') {
      reasons.push(`observation_scope_mismatch:${row.teamId}`);
      cohortOk = false;
    }
  }

  const plannedByTeam = new Map(
    input.report.rows.map((r) => [r.teamId, r] as const)
  );
  const exportedByTeam: Record<
    string,
    ReturnType<typeof exportRatingInput>
  > = {};
  let usableRowCount = 0;
  const numericReasons: string[] = [];

  for (const id of plannedUnique) {
    const planned = plannedByTeam.get(id);
    const observed = input.rows.find((r) => r.teamId === id);
    if (!planned || !observed) {
      numericReasons.push(`missing_after_write:${id}`);
      continue;
    }

    let exported: ReturnType<typeof exportRatingInput>;
    try {
      exported = exportRatingInput(reconstructRawRatingRow(observed));
    } catch (e) {
      numericReasons.push(
        `export_rating_failed:${id}:${e instanceof Error ? e.message : 'unknown'}`
      );
      continue;
    }
    exportedByTeam[id] = exported;
    if (exported.inputUsable) usableRowCount += 1;

    // Accepted strict finite parser — rejects null/blank/whitespace/nonfinite.
    const plannedPower = parseFiniteNumber(planned.finalPowerRating);
    const plannedGames = parseFiniteNumber(planned.games);
    if (plannedPower === null) {
      numericReasons.push(`planned_finalPowerRating_invalid:${id}`);
      continue;
    }
    if (plannedGames === null || !Number.isInteger(plannedGames)) {
      numericReasons.push(`planned_games_invalid:${id}`);
      continue;
    }
    const power = parseFiniteNumber(observed.powerRatingRaw);
    const rating = parseFiniteNumber(observed.ratingRaw);
    const games = parseFiniteNumber(observed.games);
    if (power === null) {
      numericReasons.push(`powerRating_mismatch:${id}`);
      continue;
    }
    if (rating === null) {
      numericReasons.push(`rating_mismatch:${id}`);
      continue;
    }
    if (games === null || !Number.isInteger(games)) {
      numericReasons.push(`games_mismatch:${id}`);
      continue;
    }
    if (Math.abs(power - plannedPower) > ML_CAL_1_BINDING_RATING_EPS) {
      numericReasons.push(`powerRating_mismatch:${id}`);
      continue;
    }
    if (Math.abs(rating - plannedPower) > ML_CAL_1_BINDING_RATING_EPS) {
      numericReasons.push(`rating_mismatch:${id}`);
      continue;
    }
    if (games !== plannedGames) {
      numericReasons.push(`games_mismatch:${id}`);
    }
  }

  reasons.push(...numericReasons);
  const numericOk =
    numericReasons.length === 0 &&
    usableRowCount === ML_CAL_1_BINDING_EXPECTED_FBS_COUNT;
  const ratingFingerprint =
    Object.keys(exportedByTeam).length === plannedUnique.length
      ? buildRatingFingerprint(exportedByTeam)
      : null;

  return {
    ok: cohortOk && numericOk,
    reasons,
    ratingFingerprint,
    usableRowCount,
    numericOk,
    cohortOk,
  };
}

export function computeProspectiveOk(input: {
  completedThroughWeek: number;
  prospectiveTargetWeek: number | null | undefined;
}): boolean | null {
  if (
    input.prospectiveTargetWeek == null ||
    !Number.isInteger(input.prospectiveTargetWeek)
  ) {
    return null;
  }
  return input.completedThroughWeek < input.prospectiveTargetWeek;
}

// ---------------------------------------------------------------------------
// Atomic package seal (self-contained, no credentials, no overwrite)
// ---------------------------------------------------------------------------

export interface MlCal1G4PackageSealInput {
  rootDir: string;
  observationId: string;
  zipBytes: Buffer;
  reportMemberBytes: Buffer;
  reportMemberPath: string;
  sidecar: MlCal1LifecycleBindingSidecarV1;
  runMetadata: Record<string, unknown>;
  designCorrespondence: Record<string, unknown>;
  /** Explicit test-only / synthetic provenance bytes (required for fixture packages). */
  fixtureProvenanceBytes?: Buffer | null;
}

export interface MlCal1G4PackageSealResult {
  packageDir: string;
  manifestSha256: string;
  memberDigests: Record<string, { sha256: string; byteCount: number }>;
  sidecarDigest: string;
}

function safeObservationId(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(id)) {
    throw new Error(`unsafe_observation_id:${id}`);
  }
  return id;
}

export function sealG4ObservationPackage(
  input: MlCal1G4PackageSealInput
): MlCal1G4PackageSealResult {
  const observationId = safeObservationId(input.observationId);
  const root = path.resolve(input.rootDir);
  fs.mkdirSync(root, { recursive: true });
  const packageDir = path.join(root, observationId);
  if (fs.existsSync(packageDir)) {
    throw new Error(`observation_package_exists:${packageDir}`);
  }

  const sidecarBytes = Buffer.from(serializeSidecar(input.sidecar), 'utf8');
  const sidecarDigest = sha256Utf8Bytes(sidecarBytes);
  const runMetaBytes = Buffer.from(
    `${stableStringify(input.runMetadata)}\n`,
    'utf8'
  );
  const corrBytes = Buffer.from(
    `${stableStringify(input.designCorrespondence)}\n`,
    'utf8'
  );

  const members: Record<string, Buffer> = {
    'archive.zip': input.zipBytes,
    [path.basename(input.reportMemberPath)]: input.reportMemberBytes,
    'binding-sidecar.json': sidecarBytes,
    'observer-run-metadata.json': runMetaBytes,
    'design-correspondence.json': corrBytes,
  };
  if (input.fixtureProvenanceBytes && input.fixtureProvenanceBytes.length > 0) {
    members['PROVENANCE.json'] = Buffer.from(input.fixtureProvenanceBytes);
  }

  const memberDigests: Record<string, { sha256: string; byteCount: number }> =
    {};
  for (const [name, bytes] of Object.entries(members)) {
    memberDigests[name] = {
      sha256: sha256Utf8Bytes(bytes),
      byteCount: bytes.length,
    };
  }

  const manifest = {
    schemaVersion: ML_CAL_1_G4_OBSERVER_PACKAGE_SCHEMA,
    kind: 'lifecycle-binding-observer-package',
    observationId,
    sealedAt: new Date(0).toISOString(), // overwritten below with caller time via runMetadata
    liveAccepted: false as const,
    approved: false as const,
    credentialsPresent: false as const,
    memberDigests,
    sidecarDigest,
    designOnDiskSha256: ML_CAL_1_G4_DESIGN_ON_DISK_SHA256,
    acceptanceUploadSha256: ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256,
    baseG3Tip: ML_CAL_1_G4_BASE_G3_TIP,
  };
  // Prefer runMetadata.observationEndTime as seal clock when present.
  const sealedAt =
    typeof input.runMetadata.observationEndTime === 'string'
      ? input.runMetadata.observationEndTime
      : new Date().toISOString();
  const manifestWithTime = { ...manifest, sealedAt };
  const manifestBytes = Buffer.from(
    `${stableStringify(manifestWithTime)}\n`,
    'utf8'
  );
  const manifestSha256 = sha256Utf8Bytes(manifestBytes);

  const tmpDir = path.join(root, `.tmp-${observationId}-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    for (const [name, bytes] of Object.entries(members)) {
      fs.writeFileSync(path.join(tmpDir, name), bytes);
    }
    fs.writeFileSync(path.join(tmpDir, 'PACKAGE_MANIFEST.json'), manifestBytes);
    fs.writeFileSync(
      path.join(tmpDir, 'PACKAGE_MANIFEST.sha256'),
      `${manifestSha256}\n`,
      'utf8'
    );
    // Atomic publish: rename temp → final (fails if destination exists).
    fs.renameSync(tmpDir, packageDir);
  } catch (e) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
    throw e;
  }

  return {
    packageDir,
    manifestSha256,
    memberDigests: {
      ...memberDigests,
      'PACKAGE_MANIFEST.json': {
        sha256: manifestSha256,
        byteCount: manifestBytes.length,
      },
    },
    sidecarDigest,
  };
}

export function writeG4DiagnosticFailureReceipt(input: {
  rootDir: string;
  observationId: string;
  reasons: string[];
  notes: string[];
  evidence: Record<string, unknown>;
}): string {
  const observationId = safeObservationId(input.observationId);
  const root = path.resolve(input.rootDir);
  fs.mkdirSync(root, { recursive: true });
  const receiptPath = path.join(
    root,
    `${observationId}.diagnostic-failure.json`
  );
  if (fs.existsSync(receiptPath)) {
    throw new Error(`diagnostic_receipt_exists:${receiptPath}`);
  }
  const body = {
    kind: 'ml-cal-1-g4-observer-diagnostic-failure',
    successfulObserverSidecar: false as const,
    liveAccepted: false as const,
    observationId,
    reasons: input.reasons,
    notes: input.notes,
    evidence: input.evidence,
  };
  fs.writeFileSync(receiptPath, `${stableStringify(body)}\n`, 'utf8');
  return receiptPath;
}

// ---------------------------------------------------------------------------
// Mock / injectable RepeatableRead adapter (fixture)
// ---------------------------------------------------------------------------

export interface MlCal1G4MockTxConfig {
  rows: MlCal1G4RawRatingRow[];
  isolation?: string;
  readOnly?: string;
  transactionTimestamp?: string;
  serverClockDiagnostics?: Record<string, string>;
  failOnSetReadOnly?: boolean;
  failOnMetadata?: boolean;
  failOnSelect?: boolean;
  loseTransactionAfterMetadata?: boolean;
  /** If provided, select uses these scalars instead of requested (allowlist test). */
  forceSelectScalars?: string[];
  mutateRowsAfterFirstRead?: boolean;
}

export function createMockRepeatableReadAdapter(
  config: MlCal1G4MockTxConfig
): MlCal1G4ObserverTxAdapter {
  return {
    async withRepeatableReadTransaction(fn) {
      let readOnlySet = false;
      let metadataQueried = false;
      let aborted = false;
      const client: MlCal1G4ObserverTxClient = {
        async setTransactionReadOnly() {
          if (config.failOnSetReadOnly) {
            aborted = true;
            throw new Error('set_transaction_read_only_failed');
          }
          readOnlySet = true;
        },
        async queryTransactionMetadata() {
          if (aborted) throw new Error('transaction_lost');
          if (!readOnlySet) {
            throw new Error('read_only_not_set_before_metadata');
          }
          if (config.failOnMetadata) {
            aborted = true;
            throw new Error('transaction_metadata_failed');
          }
          metadataQueried = true;
          if (config.loseTransactionAfterMetadata) {
            aborted = true;
          }
          return {
            transactionIsolation: config.isolation ?? 'repeatable read',
            transactionReadOnly: config.readOnly ?? 'on',
            transactionTimestamp:
              config.transactionTimestamp ?? '2026-10-06T12:00:05.000Z',
            serverClockDiagnostics: config.serverClockDiagnostics ?? {
              clock_timestamp: config.transactionTimestamp ?? '2026-10-06T12:00:05.000Z',
            },
          };
        },
        async selectTeamSeasonRatings(args) {
          if (aborted) throw new Error('transaction_lost');
          if (!readOnlySet || !metadataQueried) {
            throw new Error('select_before_metadata_or_readonly');
          }
          if (config.failOnSelect) {
            aborted = true;
            throw new Error('select_failed');
          }
          const scalars = config.forceSelectScalars ?? args.scalars;
          const allow = verifyExactTeamSeasonRatingAllowlist(scalars);
          if (!allow.ok) {
            throw new Error(allow.reasons[0] ?? 'allowlist_invalid');
          }
          if (args.season !== 2026 || args.modelVersion !== 'v1') {
            throw new Error('observation_scope_mismatch');
          }
          return config.rows.map((r) => ({ ...r }));
        },
      };
      return fn(client);
    },
  };
}

export function observedRowsFromRaw(
  rows: MlCal1G4RawRatingRow[]
): MlCal1BindingObservedRatingRow[] {
  return rows.map((r) => ({
    season: r.season,
    teamId: r.teamId,
    modelVersion: r.modelVersion,
    powerRatingRaw: decimalRaw(r.powerRating),
    ratingRaw: decimalRaw(r.rating),
    games: r.games,
    dataSource: r.dataSource,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }));
}

export function rawRowsFromObserved(
  rows: MlCal1BindingObservedRatingRow[]
): MlCal1G4RawRatingRow[] {
  return rows.map((r) => ({
    season: r.season,
    teamId: r.teamId,
    modelVersion: r.modelVersion,
    powerRating:
      r.powerRatingRaw == null
        ? null
        : { toString: () => r.powerRatingRaw as string },
    rating:
      r.ratingRaw == null ? null : { toString: () => r.ratingRaw as string },
    games: r.games,
    dataSource: r.dataSource,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

// ---------------------------------------------------------------------------
// Main observer attempt (fixture-capable)
// ---------------------------------------------------------------------------

export async function runG4ObserverAttempt(
  input: MlCal1G4ObserverAttemptInput
): Promise<MlCal1G4ObserverAttemptResult> {
  const notes: string[] = [];
  const reasons: string[] = [];
  let observationStartTime: string | null = null;
  let observationEndTime: string | null = null;
  let bindingSnapshotReferenceTime: string | null = null;
  let dbTransactionTime: string | null = null;
  let readMode: 'repeatable_read_readonly' | 'fixture_injected' | null = null;
  let ratingFingerprint: string | null = null;
  let usableRowCount: number | null = null;
  let numericOk = false;
  let cohortOk = false;
  let timingOk = false;
  let fullWeightByPolicy = false;
  let prospectiveOk: boolean | null = null;
  let packageDir: string | null = null;
  let packageManifestSha256: string | null = null;
  let memberDigests: Record<
    string,
    { sha256: string; byteCount: number }
  > | null = null;
  let sidecarDigest: string | null = null;
  let diagnosticFailureReceiptPath: string | null = null;

  const fail = (extra: string[], note?: string): MlCal1G4ObserverAttemptResult => {
    const allReasons = [...reasons, ...extra];
    if (note) notes.push(note);
    try {
      diagnosticFailureReceiptPath = writeG4DiagnosticFailureReceipt({
        rootDir: input.packageRootDir,
        observationId: input.observationId,
        reasons: allReasons,
        notes,
        evidence: {
          observationStartTime,
          observationEndTime,
          bindingSnapshotReferenceTime,
          dbTransactionTime,
          fullWeightByPolicy,
          prospectiveOk,
        },
      });
    } catch (e) {
      notes.push(
        `diagnostic_receipt_write_failed:${e instanceof Error ? e.message : 'unknown'}`
      );
    }
    observationEndTime = observationEndTime ?? toIso(input.now());
    return {
      ok: false,
      reasons: allReasons,
      notes,
      observationId: input.observationId,
      fullWeightByPolicy,
      prospectiveOk,
      fullWeightEligibleClaimed: false,
      liveAccepted: false,
      ratingFingerprint,
      usableRowCount,
      numericOk,
      cohortOk,
      timingOk,
      packageDir: null,
      packageManifestSha256: null,
      memberDigests: null,
      sidecarDigest: null,
      diagnosticFailureReceiptPath,
      observationStartTime,
      observationEndTime,
      bindingSnapshotReferenceTime,
      dbTransactionTime,
      readMode,
    };
  };

  // F3: this offline PR is fixture-only. Caller boolean cannot manufacture live evidence.
  if (input.fixtureMode !== true) {
    return fail(
      ['nonfixture_execution_not_authorized'],
      'fixture_only_orchestration'
    );
  }
  readMode = 'fixture_injected';

  if (!isNonEmptyIdentity(input.bindingObserverSha)) {
    return fail(['observer_identity_missing:bindingObserverSha']);
  }
  if (!isNonEmptyIdentity(input.lifecycleProducerSha)) {
    return fail(['observer_identity_missing:lifecycleProducerSha']);
  }
  if (!isNonEmptyIdentity(input.observationId)) {
    return fail(['observer_identity_missing:observationId']);
  }
  if (
    !input.fixtureProvenanceBytes ||
    input.fixtureProvenanceBytes.length === 0
  ) {
    return fail(['fixture_provenance_bytes_required']);
  }

  // §9: record observationStartTime BEFORE opening the transaction.
  observationStartTime = toIso(input.now());

  // F4: archive + identity + chronology vs observation start BEFORE adapter.
  const archive = evaluateG4ArchivePrerequisites({
    zipBytes: input.zipBytes,
    pins: input.archivePins,
  });
  fullWeightByPolicy = archive.fullWeightByPolicy;
  reasons.push(
    ...archive.reasons.filter((r) => r !== 'fullWeightByPolicy_false')
  );
  if (archive.reasons.includes('fullWeightByPolicy_false')) {
    reasons.push('fullWeightByPolicy_false');
  }
  if (!archive.ok || !archive.report || !archive.memberBytes) {
    return fail([], 'archive_prerequisites_failed');
  }

  if (input.lifecycleProducerSha !== input.archivePins.expectedLifecycleProducerSha) {
    return fail(['lifecycleProducerSha_mismatch_vs_pin']);
  }

  const preChronology = evaluatePreAdapterChronology({
    observationStartTime,
    workflowRunCompletedAt: input.archivePins.workflowRunCompletedAt,
    artifactCreatedAt: input.archivePins.artifactCreatedAt,
    nowCeiling: input.nowCeiling,
  });
  if (!preChronology.ok) {
    return fail(preChronology.reasons, 'pre_adapter_chronology_failed');
  }

  // Fixture-only prospective target (never invents production registration).
  prospectiveOk = computeProspectiveOk({
    completedThroughWeek: archive.report.completedThroughWeek,
    prospectiveTargetWeek: input.prospectiveTargetWeek,
  });
  if (prospectiveOk === null) {
    notes.push('prospective_target_absent_no_eligibility_claim');
  } else {
    notes.push('prospectiveOk_fixture_target_only');
  }

  let rawRows: MlCal1G4RawRatingRow[] = [];
  let metadata: MlCal1G4TxMetadata | null = null;

  try {
    input.onAdapterEnter?.();
    await input.txAdapter.withRepeatableReadTransaction(async (client) => {
      await client.setTransactionReadOnly();
      metadata = await client.queryTransactionMetadata();
      const iso = (metadata.transactionIsolation || '').toLowerCase();
      const ro = (metadata.transactionReadOnly || '').toLowerCase();
      if (iso !== 'repeatable read') {
        throw new Error(
          `transaction_isolation_invalid:${metadata.transactionIsolation}`
        );
      }
      if (ro !== 'on') {
        throw new Error(
          `transaction_read_only_invalid:${metadata.transactionReadOnly}`
        );
      }
      dbTransactionTime = metadata.transactionTimestamp;
      rawRows = await client.selectTeamSeasonRatings({
        season: 2026,
        modelVersion: 'v1',
        scalars: ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS,
      });
    });
  } catch (e) {
    return fail(
      [`transaction_failed:${e instanceof Error ? e.message : 'unknown'}`],
      'tx_or_select_aborted'
    );
  }

  bindingSnapshotReferenceTime = toIso(input.now());

  let observed: MlCal1BindingObservedRatingRow[];
  try {
    observed = observedRowsFromRaw(rawRows);
  } catch (e) {
    return fail(
      [
        `row_conversion_failed:${e instanceof Error ? e.message : 'unknown'}`,
      ],
      'row_conversion_failed'
    );
  }

  const rowTimes = validateObservedRowTimestamps({
    rows: observed,
    bindingSnapshotReferenceTime,
    nowCeiling: input.nowCeiling,
  });
  if (!rowTimes.ok) {
    return fail(rowTimes.reasons, 'row_timestamp_validation_failed');
  }
  const rowCreatedAtMin = rowTimes.rowCreatedAtMin!;
  const rowCreatedAtMax = rowTimes.rowCreatedAtMax!;
  const rowUpdatedAtMin = rowTimes.rowUpdatedAtMin!;
  const rowUpdatedAtMax = rowTimes.rowUpdatedAtMax!;

  observationEndTime = toIso(input.now());

  // Post-read timing (still required). Fixture path: db time optional if present must bound.
  const timing = evaluateG4ObservationTiming({
    observationStartTime,
    observationEndTime,
    bindingSnapshotReferenceTime,
    dbTransactionTime,
    dbTransactionTimeRequired: false,
    workflowRunCompletedAt: input.archivePins.workflowRunCompletedAt,
    artifactCreatedAt: input.archivePins.artifactCreatedAt,
    nowCeiling: input.nowCeiling,
    rowCreatedAtMin,
    rowCreatedAtMax,
    rowUpdatedAtMin,
    rowUpdatedAtMax,
  });
  timingOk = timing.ok;
  if (!timing.ok) {
    return fail(timing.reasons, 'timing_failed');
  }

  const cohortNumeric = evaluateG4CohortAndNumeric({
    report: archive.report,
    rows: observed,
  });
  cohortOk = cohortNumeric.cohortOk;
  numericOk = cohortNumeric.numericOk;
  ratingFingerprint = cohortNumeric.ratingFingerprint;
  usableRowCount = cohortNumeric.usableRowCount;
  if (!cohortNumeric.ok) {
    return fail(cohortNumeric.reasons, 'cohort_or_numeric_failed');
  }

  // F5: omit eligibility echoes the G4 emitter is not authorized to assert.
  const sidecar: MlCal1LifecycleBindingSidecarV1 = {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA,
    kind: 'lifecycle-binding-sidecar',
    mode: 'fixture_hypothetical',
    acceptedArchive: {
      github: {
        workflowRunId: input.archivePins.workflowRunId,
        artifactId: input.archivePins.artifactId,
        artifactName: input.archivePins.artifactName,
        workflowRunCompletedAt: input.archivePins.workflowRunCompletedAt,
        artifactCreatedAt: input.archivePins.artifactCreatedAt,
        zipSha256: archive.zipSha256,
        reportMemberPath: input.archivePins.reportMemberPath,
        reportMemberSha256: archive.reportMemberSha256,
        reportByteCount: archive.reportByteCount,
      },
      lifecycleProducerSha: input.lifecycleProducerSha,
      declaredSeason: archive.report.season,
      declaredCompletedThroughWeek: archive.report.completedThroughWeek,
      declaredSelectedPolicy: archive.report.selectedPolicy,
      declaredCanonicalWeight: archive.report.canonicalWeight,
    },
    bindingObservation: {
      observationStartTime,
      observationEndTime,
      bindingSnapshotReferenceTime,
      dbTransactionTime,
      dbTransactionTimeUnavailableReason: dbTransactionTime
        ? null
        : 'fixture_injected',
      bindingObserverSha: input.bindingObserverSha,
      readMode: 'fixture_injected',
      season: 2026,
      modelVersion: 'v1',
      rows: observed,
      rowCreatedAtMin,
      rowCreatedAtMax,
      rowUpdatedAtMin,
      rowUpdatedAtMax,
    },
    declaredEcho: {
      ratingFingerprint: ratingFingerprint!,
      usableRowCount: usableRowCount!,
      plannedNumericAgreementOk: numericOk,
      archiveIntegrityVerified: true,
      // fullWeightEligible intentionally omitted (F5)
    },
    fingerprintComputedFromLaterReadback: true,
    readbackWasNotExportedAtCommit: true,
    sidecarSelfAccepted: false,
    providerCalls: 0,
    businessDataWrites: 0,
  };

  try {
    const sealed = sealG4ObservationPackage({
      rootDir: input.packageRootDir,
      observationId: input.observationId,
      zipBytes: input.zipBytes,
      reportMemberBytes: archive.memberBytes,
      reportMemberPath: input.archivePins.reportMemberPath,
      sidecar,
      fixtureProvenanceBytes: input.fixtureProvenanceBytes,
      runMetadata: {
        observationId: input.observationId,
        bindingObserverSha: input.bindingObserverSha,
        lifecycleProducerSha: input.lifecycleProducerSha,
        observationStartTime,
        observationEndTime,
        bindingSnapshotReferenceTime,
        dbTransactionTime,
        readMode: 'fixture_injected',
        mode: 'fixture_hypothetical',
        fullWeightByPolicy,
        prospectiveOk,
        fullWeightEligibleClaimed: false,
        liveAccepted: false,
        approved: false,
        providerCalls: 0,
        businessDataWrites: 0,
        fixtureProvenanceRetained: true,
        txMetadata: metadata,
        allowlist: ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS,
        ratingFingerprint,
        usableRowCount,
      },
      designCorrespondence: {
        onDiskDesignSha256: ML_CAL_1_G4_DESIGN_ON_DISK_SHA256,
        acceptanceUploadSha256: ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256,
        baseG3Tip: ML_CAL_1_G4_BASE_G3_TIP,
        note:
          'Acceptance PASS pinned to upload digest; on-disk design is the F3-corrected working specification with matching normative content.',
      },
    });
    packageDir = sealed.packageDir;
    packageManifestSha256 = sealed.manifestSha256;
    memberDigests = sealed.memberDigests;
    sidecarDigest = sealed.sidecarDigest;
  } catch (e) {
    return fail(
      [`package_seal_failed:${e instanceof Error ? e.message : 'unknown'}`],
      'seal_failed'
    );
  }

  return {
    ok: true,
    reasons: [],
    notes,
    observationId: input.observationId,
    fullWeightByPolicy,
    prospectiveOk,
    fullWeightEligibleClaimed: false,
    liveAccepted: false,
    ratingFingerprint,
    usableRowCount,
    numericOk,
    cohortOk,
    timingOk,
    packageDir,
    packageManifestSha256,
    memberDigests,
    sidecarDigest,
    diagnosticFailureReceiptPath: null,
    observationStartTime,
    observationEndTime,
    bindingSnapshotReferenceTime,
    dbTransactionTime,
    readMode,
  };
}

// Re-export Week5 pins + zip builder for fixtures
export {
  ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS,
  buildStoreZip,
  buildRatingFingerprint,
  exportRatingInput,
  reconstructRawRatingRow,
};
