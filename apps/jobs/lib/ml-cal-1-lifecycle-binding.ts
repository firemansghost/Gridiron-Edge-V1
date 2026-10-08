/**
 * ML-CAL-1 Lifecycle Binding Sidecar V1 — offline verification helpers.
 *
 * Pure / fixture-capable. No DB, provider, workflow dispatch, or live capture path.
 * Does not amend PR #244 capture wiring; the capture-claim adapter produces the
 * shape later integration will pass to qualifyLifecycleReceipt.
 *
 * Rating export / fingerprint helpers mirror the accepted capture semantics from
 * PR #244 (exportRatingInput / buildRatingFingerprint). Until capture lands on
 * main, this module owns an offline-compatible copy; do not diverge.
 *
 * Design: research/moneyline/ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_V1_DESIGN.md
 */

import { createHash } from 'crypto';
import { inflateRawSync as zlibInflateRawSync } from 'zlib';
import { b1CanonicalWeight } from '../src/preseason/balanced-v1-transition-blend-eval';
import {
  decimalLikeToNumber,
  EXPECTED_FBS_COUNT,
} from '../src/ratings/core-v1-lifecycle';

// ---------------------------------------------------------------------------
// Schema / pin constants
// ---------------------------------------------------------------------------

export const ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA =
  'ml-cal-1-lifecycle-binding-sidecar-v1' as const;
export const ML_CAL_1_LIFECYCLE_BINDING_LINEAGE_ATTESTATION_SCHEMA =
  'ml-cal-1-lifecycle-binding-lineage-attestation-v1' as const;
export const ML_CAL_1_LIFECYCLE_BINDING_DERIVED_CORE_SCHEMA =
  'ml-cal-1-lifecycle-binding-derived-receipt-v1' as const;
export const ML_CAL_1_LIFECYCLE_BINDING_DERIVED_ENVELOPE_SCHEMA =
  'ml-cal-1-lifecycle-binding-derived-receipt-envelope-v1' as const;

export const ML_CAL_1_BINDING_MODEL_VERSION = 'v1' as const;
export const ML_CAL_1_BINDING_POLICY = 'GLOBAL_BLEND_W3_W6' as const;
export const ML_CAL_1_BINDING_RATING_EPS = 1e-9;
export const ML_CAL_1_BINDING_EXPECTED_FBS_COUNT = EXPECTED_FBS_COUNT;
export const ML_CAL_1_BINDING_FULL_WEIGHT = 1;
export const ML_CAL_1_BINDING_FULL_WEIGHT_MIN_WEEK = 6;

/** Real Week 5 COMMIT archive pins (integrity-positive / full-weight-negative). */
export const ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS = {
  workflowRunId: '37336589699',
  artifactId: '11356512878',
  artifactName: 'core-v1-lifecycle-2026-through-w5-COMMIT',
  reportMemberPath: 'core-v1-lifecycle-2026-through-week-5-COMMIT.json',
  zipSha256:
    'b0177de089237876c2e258fb97d84af3803ef7d1e7402cae853670ee8a6cd316',
  reportMemberSha256:
    'c20b789ce45b58362a23b2ab2a69184fda2a39377c99d58db6268376b79a2e1e',
  lifecycleProducerSha: 'ee436b910177bbf2120b9ab6bf2551197d739129',
  season: 2026,
  completedThroughWeek: 5,
  selectedPolicy: ML_CAL_1_BINDING_POLICY,
  canonicalWeight: 0.75,
} as const;

// ---------------------------------------------------------------------------
// Shared hashing / stringify (capture-compatible)
// ---------------------------------------------------------------------------

export function sha256Utf8Bytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    const v = rec[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}

/** Capture-compatible: JSON.stringify(canonicalize(value)) with no trailing newline. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value: unknown): string {
  return sha256Utf8Bytes(stableStringify(value));
}

/** Canonical claim / core bytes for digests: stableStringify + trailing newline. */
export function canonicalReceiptBytes(value: unknown): string {
  return `${stableStringify(value)}\n`;
}

// ---------------------------------------------------------------------------
// Rating export / fingerprint (semantic mirror of PR #244 capture helpers)
// ---------------------------------------------------------------------------

export type MlCal1DecimalLike =
  | { toString(): string }
  | number
  | string
  | null
  | undefined;

export interface MlCal1RawRatingRow {
  season: number;
  teamId: string;
  modelVersion: string;
  powerRating: MlCal1DecimalLike;
  rating: MlCal1DecimalLike;
  games: number;
  dataSource: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface MlCal1ExportedRatingInput {
  season: number;
  teamId: string;
  modelVersion: string;
  powerRatingRaw: string | null;
  ratingRaw: string | null;
  chosenField: 'powerRating' | 'rating' | 'default_zero';
  valueUsed: number | null;
  games: number;
  dataSource: string | null;
  createdAt: string;
  updatedAt: string;
  rowContentHash: string;
  unavailableReasons: string[];
  inputUsable: boolean;
}

function toIso(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`invalid_timestamp:${String(value)}`);
  }
  return d.toISOString();
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function chooseRatingField(row: {
  powerRating: MlCal1DecimalLike;
  rating: MlCal1DecimalLike;
}): {
  chosenField: 'powerRating' | 'rating' | 'default_zero';
  raw: MlCal1DecimalLike;
  value: number | null;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (row.powerRating) {
    return finishChosen('powerRating', row.powerRating, reasons);
  }
  if (row.rating) {
    return finishChosen('rating', row.rating, reasons);
  }
  if (row.powerRating == null && row.rating == null) {
    reasons.push('missing_rating_fields');
  } else {
    reasons.push('falsy_rating_fields_defaulted_zero');
  }
  return { chosenField: 'default_zero', raw: null, value: null, reasons };
}

function finishChosen(
  chosenField: 'powerRating' | 'rating',
  raw: MlCal1DecimalLike,
  reasons: string[]
): {
  chosenField: 'powerRating' | 'rating';
  raw: MlCal1DecimalLike;
  value: number | null;
  reasons: string[];
} {
  if (typeof raw === 'boolean' || Array.isArray(raw)) {
    reasons.push('unsupported_rating_value_type');
    return { chosenField, raw, value: null, reasons };
  }
  if (raw != null && typeof raw === 'object' && !('toString' in raw)) {
    reasons.push('unsupported_rating_value_type');
    return { chosenField, raw, value: null, reasons };
  }

  let text: string;
  if (typeof raw === 'object' && raw !== null && 'toString' in raw) {
    text = raw.toString();
  } else if (typeof raw === 'number' || typeof raw === 'string') {
    text = String(raw);
  } else {
    reasons.push('unsupported_rating_value_type');
    return { chosenField, raw, value: null, reasons };
  }

  if (typeof text !== 'string' || text.trim() === '') {
    reasons.push('blank_or_whitespace_rating_value');
    return { chosenField, raw, value: null, reasons };
  }

  const value = Number(text.trim());
  if (!Number.isFinite(value)) {
    reasons.push('nonfinite_rating_value');
    return { chosenField, raw, value: null, reasons };
  }
  return { chosenField, raw, value, reasons };
}

function decimalToRawString(value: MlCal1DecimalLike): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return value.toString();
  }
  return String(value);
}

export function exportRatingInput(row: MlCal1RawRatingRow): MlCal1ExportedRatingInput {
  const unavailableReasons: string[] = [];
  if (row.modelVersion !== ML_CAL_1_BINDING_MODEL_VERSION) {
    unavailableReasons.push('incorrect_model_version');
  }
  const chosen = chooseRatingField(row);
  unavailableReasons.push(...chosen.reasons);

  const powerRatingRaw = decimalToRawString(row.powerRating);
  const ratingRaw = decimalToRawString(row.rating);
  const createdAt = toIso(row.createdAt);
  const updatedAt = toIso(row.updatedAt);

  const base = {
    season: row.season,
    teamId: row.teamId,
    modelVersion: row.modelVersion,
    powerRatingRaw,
    ratingRaw,
    chosenField: chosen.chosenField,
    valueUsed: chosen.value,
    games: row.games,
    dataSource: row.dataSource,
    createdAt,
    updatedAt,
  };

  const inputUsable =
    row.modelVersion === ML_CAL_1_BINDING_MODEL_VERSION &&
    unavailableReasons.length === 0 &&
    chosen.value != null &&
    Number.isFinite(chosen.value) &&
    (chosen.chosenField === 'powerRating' || chosen.chosenField === 'rating');

  return {
    ...base,
    rowContentHash: sha256Canonical(base),
    unavailableReasons,
    inputUsable,
  };
}

export function buildRatingFingerprint(
  ratingsByTeamId: Record<string, MlCal1ExportedRatingInput>
): string {
  const entries = Object.keys(ratingsByTeamId)
    .sort()
    .map((teamId) => {
      const r = ratingsByTeamId[teamId];
      return {
        season: r.season,
        teamId: r.teamId,
        modelVersion: r.modelVersion,
        valueUsed: r.valueUsed,
        chosenField: r.chosenField,
        inputUsable: r.inputUsable,
        games: r.games,
        dataSource: r.dataSource,
        rowContentHash: r.rowContentHash,
      };
    });
  return sha256Canonical(entries);
}

export interface MlCal1BindingObservedRatingRow {
  season: number;
  teamId: string;
  modelVersion: string;
  powerRatingRaw: string | null;
  ratingRaw: string | null;
  games: number;
  dataSource: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Preserve Decimal-like truthiness: string '0' must remain a truthy object via toString,
 * never coerced to numeric 0 before exportRatingInput.
 */
export function reconstructRawRatingRow(
  obs: MlCal1BindingObservedRatingRow
): MlCal1RawRatingRow {
  return {
    season: obs.season,
    teamId: obs.teamId,
    modelVersion: obs.modelVersion,
    powerRating:
      obs.powerRatingRaw == null
        ? null
        : { toString: () => obs.powerRatingRaw as string },
    rating:
      obs.ratingRaw == null ? null : { toString: () => obs.ratingRaw as string },
    games: obs.games,
    dataSource: obs.dataSource,
    createdAt: obs.createdAt,
    updatedAt: obs.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Minimal ZIP single-member extract (store / deflate)
// ---------------------------------------------------------------------------

export function extractSingleUtf8MemberFromZip(zipBytes: Buffer): {
  memberPath: string;
  memberBytes: Buffer;
} {
  if (zipBytes.length < 30 || zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
    throw new Error('invalid_zip_magic');
  }
  // Prefer central-directory sizes: GitHub artifact ZIPs often set local
  // compressed/uncompressed sizes to 0 and use general-purpose bit 3.
  let eocd = -1;
  for (let i = zipBytes.length - 22; i >= 0; i--) {
    if (zipBytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('zip_eocd_missing');
  }
  const entryCount = zipBytes.readUInt16LE(eocd + 8);
  if (entryCount !== 1) {
    throw new Error(`zip_expected_single_member:${entryCount}`);
  }
  const cdOffset = zipBytes.readUInt32LE(eocd + 16);
  if (zipBytes.readUInt32LE(cdOffset) !== 0x02014b50) {
    throw new Error('zip_central_directory_missing');
  }
  const compression = zipBytes.readUInt16LE(cdOffset + 10);
  const compressedSize = zipBytes.readUInt32LE(cdOffset + 20);
  const uncompressedSize = zipBytes.readUInt32LE(cdOffset + 24);
  const cdNameLen = zipBytes.readUInt16LE(cdOffset + 28);
  const localHeaderOffset = zipBytes.readUInt32LE(cdOffset + 42);
  if (zipBytes.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error('zip_local_header_missing');
  }
  const localNameLen = zipBytes.readUInt16LE(localHeaderOffset + 26);
  const localExtraLen = zipBytes.readUInt16LE(localHeaderOffset + 28);
  const memberPath = zipBytes
    .subarray(cdOffset + 46, cdOffset + 46 + cdNameLen)
    .toString('utf8');
  const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > zipBytes.length) {
    throw new Error('zip_truncated');
  }
  const compressed = zipBytes.subarray(dataStart, dataEnd);
  let memberBytes: Buffer;
  if (compression === 0) {
    memberBytes = Buffer.from(compressed);
  } else if (compression === 8) {
    memberBytes = zlibInflateRawSync(compressed);
  } else {
    throw new Error(`unsupported_zip_compression:${compression}`);
  }
  if (uncompressedSize > 0 && memberBytes.length !== uncompressedSize) {
    throw new Error(
      `zip_uncompressed_size_mismatch:${memberBytes.length}!=${uncompressedSize}`
    );
  }
  return { memberPath, memberBytes };
}

/** Build a single-entry ZIP using store (method 0) — fixture helper. */
export function buildStoreZip(memberPath: string, memberBytes: Buffer): Buffer {
  const name = Buffer.from(memberPath, 'utf8');
  const crc = crc32(memberBytes);
  const local = Buffer.alloc(30 + name.length + memberBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc >>> 0, 14);
  local.writeUInt32LE(memberBytes.length, 18);
  local.writeUInt32LE(memberBytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  name.copy(local, 30);
  memberBytes.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc >>> 0, 16);
  central.writeUInt32LE(memberBytes.length, 20);
  central.writeUInt32LE(memberBytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  name.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, central, end]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Report / sidecar / attestation / pin types
// ---------------------------------------------------------------------------

export interface MlCal1LifecycleReportRow {
  teamId: string;
  finalPowerRating: number;
  games: number;
  [key: string]: unknown;
}

export interface MlCal1LifecycleReportParsed {
  season: number;
  completedThroughWeek: number;
  selectedPolicy: string;
  canonicalWeight: number;
  modelVersion: string;
  rows: MlCal1LifecycleReportRow[];
  execution: {
    commitSucceeded?: boolean;
    postWriteVerificationSucceeded?: boolean | null;
    [key: string]: unknown;
  };
  verification: {
    ok?: boolean;
    afterRows?: number;
    verifiedTeams?: number;
    reasons?: string[];
    [key: string]: unknown;
  };
}

export interface MlCal1LifecycleBindingSidecarV1 {
  schemaVersion: typeof ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA;
  kind: 'lifecycle-binding-sidecar';
  mode: 'fixture_hypothetical' | 'binding_observation';
  acceptedArchive: {
    github: {
      workflowRunId: string;
      artifactId: string;
      artifactName: string;
      workflowRunCompletedAt: string | null;
      artifactCreatedAt: string | null;
      zipSha256: string;
      reportMemberPath: string;
      reportMemberSha256: string;
      reportByteCount: number;
    };
    lifecycleProducerSha: string;
    declaredSeason?: number;
    declaredCompletedThroughWeek?: number;
    declaredSelectedPolicy?: string;
    declaredCanonicalWeight?: number;
  };
  bindingObservation: {
    observationStartTime: string;
    observationEndTime: string;
    bindingSnapshotReferenceTime: string;
    dbTransactionTime: string | null;
    dbTransactionTimeUnavailableReason: string | null;
    bindingObserverSha: string;
    readMode: 'repeatable_read_readonly' | 'fixture_injected';
    season: number;
    modelVersion: 'v1';
    rows: MlCal1BindingObservedRatingRow[];
    rowCreatedAtMin: string;
    rowCreatedAtMax: string;
    rowUpdatedAtMin: string;
    rowUpdatedAtMax: string;
  };
  declaredEcho?: {
    ratingFingerprint?: string;
    usableRowCount?: number;
    plannedNumericAgreementOk?: boolean;
    fullWeightEligible?: boolean;
    archiveIntegrityVerified?: boolean;
  };
  fingerprintComputedFromLaterReadback: true;
  readbackWasNotExportedAtCommit: true;
  sidecarSelfAccepted: false;
  lineageEcho?: {
    priorApprovedBindingDigest: string | null;
    note: string;
    /** Forbidden as decision input; ignored if present. */
    lineageEvidenceStatus?: string;
  };
  providerCalls: 0;
  businessDataWrites: 0;
}

export interface MlCal1LifecycleBindingLineageAttestation {
  schemaVersion: typeof ML_CAL_1_LIFECYCLE_BINDING_LINEAGE_ATTESTATION_SCHEMA;
  kind: 'lifecycle-binding-lineage-attestation';
  approvedSidecarDigest: string;
  checkedThroughTime: string;
  attestationTime: string;
  season: number;
  modelVersion: 'v1';
  lineageEvidenceInventorySha256: string;
  searchOutcome: 'none_found' | 'superseded';
  supersedingArtifacts: Array<{
    workflowRunId: string;
    zipSha256: string;
    completedThroughWeek: number;
    artifactCreatedAt: string | null;
  }>;
  pinProvenance: {
    registryId: string;
    registrySha256: string;
    reviewedAt: string;
    reviewer: string;
  };
}

export interface MlCal1LifecycleBindingRegistryPin {
  pinProvenance: {
    registryId: string;
    registrySha256: string;
    reviewedAt: string;
    reviewer: string;
  };
  approvedSidecarDigest: string;
  approvedZipSha256: string;
  approvedReportMemberSha256: string;
  approvedLifecycleProducerSha: string;
  approvedBindingObserverSha: string;
  approvedRatingFingerprint: string;
  approvedSeason: number;
  approvedCompletedThroughWeek: number;
  approvedSelectedPolicy: typeof ML_CAL_1_BINDING_POLICY;
  approvedCanonicalWeight: number;
  approvedProspectiveTargetWeek: number;
}

export interface MlCal1LifecycleBindingDerivedReceiptCoreV1 {
  schemaVersion: typeof ML_CAL_1_LIFECYCLE_BINDING_DERIVED_CORE_SCHEMA;
  kind: 'lifecycle-binding-derived-receipt-core';
  bindingObservationDeclared: true;
  readbackWasNotExportedAtCommit: true;
  originalArchive: {
    zipSha256: string;
    reportMemberSha256: string;
    reportByteCount: number;
    lifecycleProducerSha: string;
    githubRunId: string;
    githubArtifactId: string;
  };
  sidecarDigest: string;
  captureClaim: {
    sourceSha: string;
    completedThroughWeek: number;
    selectedPolicy: string;
    canonicalWeight: number;
    season: number;
    acceptedImmutable: true;
    ratingFingerprint: string;
  };
  bindingObserverSha: string;
  lineageAttestationDigest: string;
  lineageCheckedThroughTime: string;
}

export interface MlCal1LifecycleBindingDerivedReceiptEnvelopeV1 {
  schemaVersion: typeof ML_CAL_1_LIFECYCLE_BINDING_DERIVED_ENVELOPE_SCHEMA;
  kind: 'lifecycle-binding-derived-receipt-envelope';
  coreBytes: string;
  coreDigest: string;
}

/** Capture-compatible claim surface (PR #244). */
export interface MlCal1LifecycleReceipt {
  sourceSha: string;
  completedThroughWeek: number;
  selectedPolicy: string;
  canonicalWeight: number;
  receiptDigest: string;
  ratingFingerprint: string;
  acceptedImmutable: boolean;
  season?: number;
}

export interface MlCal1LifecycleBindingVerifyResult {
  structuralConsistencyVerified: boolean;
  archiveIntegrityVerified: boolean;
  plannedNumericAgreementOk: boolean;
  ratingFingerprint: string | null;
  usableRowCount: number;
  fullWeightEligible: boolean;
  independentlyPinned: boolean;
  liveQualifying: boolean;
  liveAccepted: boolean;
  reasons: string[];
  notes: string[];
  recomputed: {
    season: number | null;
    completedThroughWeek: number | null;
    selectedPolicy: string | null;
    canonicalWeight: number | null;
    recomputedWeight: number | null;
    fullWeightByPolicy: boolean;
    prospectiveOk: boolean;
    lineageOk: boolean;
  };
  sidecarDigest: string | null;
  report: MlCal1LifecycleReportParsed | null;
}

export interface MlCal1LifecycleBindingVerifyInput {
  zipBytes: Buffer;
  /** Optional; when omitted, extracted from zipBytes. */
  reportMemberBytes?: Buffer;
  sidecarBytes: string;
  prospectiveTargetWeek: number;
  expectedZipSha256: string;
  expectedReportMemberSha256: string;
  expectedLifecycleProducerSha: string;
  /** External lineage attestation JSON bytes (UTF-8). Required for live qualification. */
  lineageAttestationBytes?: string | null;
  /** Separately reviewed registry pin. Required for live qualification. */
  registryPin?: MlCal1LifecycleBindingRegistryPin | null;
  /** Exact registry document bytes whose digest must match pin.pinProvenance.registrySha256. */
  registryDocumentBytes?: string | null;
  /** Injected verifier wall-clock ceiling (ISO). */
  nowCeiling: string;
}

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

export function parseLifecycleReport(
  memberBytes: Buffer | string
): MlCal1LifecycleReportParsed {
  const text =
    typeof memberBytes === 'string' ? memberBytes : memberBytes.toString('utf8');
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('report_parse_failed');
  }
  const rows = Array.isArray(parsed.rows)
    ? (parsed.rows as MlCal1LifecycleReportRow[])
    : [];
  return {
    season: Number(parsed.season),
    completedThroughWeek: Number(parsed.completedThroughWeek),
    selectedPolicy: String(parsed.selectedPolicy ?? ''),
    canonicalWeight: Number(parsed.canonicalWeight),
    modelVersion: String(parsed.modelVersion ?? ''),
    rows,
    execution: (parsed.execution as MlCal1LifecycleReportParsed['execution']) ?? {},
    verification:
      (parsed.verification as MlCal1LifecycleReportParsed['verification']) ?? {},
  };
}

export function buildObservedRowsFromReport(
  report: MlCal1LifecycleReportParsed,
  options: {
    createdAt: string;
    updatedAt: string;
    dataSource?: string | null;
  }
): MlCal1BindingObservedRatingRow[] {
  return report.rows.map((r) => ({
    season: report.season,
    teamId: r.teamId,
    modelVersion: ML_CAL_1_BINDING_MODEL_VERSION,
    // Preserve exact text via toString of the planned scalar (fixture-safe).
    powerRatingRaw: String(r.finalPowerRating),
    ratingRaw: String(r.finalPowerRating),
    games: r.games,
    dataSource: options.dataSource ?? 'core-v1-lifecycle',
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
  }));
}

export function serializeSidecar(sidecar: MlCal1LifecycleBindingSidecarV1): string {
  return canonicalReceiptBytes(sidecar);
}

export function serializeLineageAttestation(
  attestation: MlCal1LifecycleBindingLineageAttestation
): string {
  return canonicalReceiptBytes(attestation);
}

export function buildDerivedReceiptCore(input: {
  zipSha256: string;
  reportMemberSha256: string;
  reportByteCount: number;
  lifecycleProducerSha: string;
  githubRunId: string;
  githubArtifactId: string;
  sidecarDigest: string;
  captureClaim: MlCal1LifecycleBindingDerivedReceiptCoreV1['captureClaim'];
  bindingObserverSha: string;
  lineageAttestationDigest: string;
  lineageCheckedThroughTime: string;
}): MlCal1LifecycleBindingDerivedReceiptCoreV1 {
  if ('receiptDigest' in (input.captureClaim as object)) {
    throw new Error('self_referencing_digest');
  }
  return {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_DERIVED_CORE_SCHEMA,
    kind: 'lifecycle-binding-derived-receipt-core',
    bindingObservationDeclared: true,
    readbackWasNotExportedAtCommit: true,
    originalArchive: {
      zipSha256: input.zipSha256,
      reportMemberSha256: input.reportMemberSha256,
      reportByteCount: input.reportByteCount,
      lifecycleProducerSha: input.lifecycleProducerSha,
      githubRunId: input.githubRunId,
      githubArtifactId: input.githubArtifactId,
    },
    sidecarDigest: input.sidecarDigest,
    captureClaim: { ...input.captureClaim },
    bindingObserverSha: input.bindingObserverSha,
    lineageAttestationDigest: input.lineageAttestationDigest,
    lineageCheckedThroughTime: input.lineageCheckedThroughTime,
  };
}

export function buildDerivedReceiptEnvelope(
  core: MlCal1LifecycleBindingDerivedReceiptCoreV1
): MlCal1LifecycleBindingDerivedReceiptEnvelopeV1 {
  if (
    core.captureClaim &&
    Object.prototype.hasOwnProperty.call(core.captureClaim, 'receiptDigest')
  ) {
    throw new Error('self_referencing_digest');
  }
  const coreBytes = canonicalReceiptBytes(core);
  return {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_DERIVED_ENVELOPE_SCHEMA,
    kind: 'lifecycle-binding-derived-receipt-envelope',
    coreBytes,
    coreDigest: sha256Utf8Bytes(coreBytes),
  };
}

/**
 * Adapter: derived envelope → capture qualifyLifecycleReceipt input shape.
 * Digests are computed from claim body bytes; receiptDigest is set only after hashing.
 */
export function adaptDerivedReceiptToCaptureLifecycleInput(
  envelope: MlCal1LifecycleBindingDerivedReceiptEnvelopeV1
): {
  receiptBytes: string;
  pinnedReceiptDigest: string;
  claims: MlCal1LifecycleReceipt;
} {
  const recomputed = sha256Utf8Bytes(envelope.coreBytes);
  if (recomputed !== envelope.coreDigest) {
    throw new Error('derived_core_digest_mismatch');
  }
  const core = JSON.parse(
    envelope.coreBytes
  ) as MlCal1LifecycleBindingDerivedReceiptCoreV1;
  if (
    core.captureClaim &&
    Object.prototype.hasOwnProperty.call(core.captureClaim, 'receiptDigest')
  ) {
    throw new Error('self_referencing_digest');
  }

  const claimBody = {
    sourceSha: core.captureClaim.sourceSha,
    completedThroughWeek: core.captureClaim.completedThroughWeek,
    selectedPolicy: core.captureClaim.selectedPolicy,
    canonicalWeight: core.captureClaim.canonicalWeight,
    season: core.captureClaim.season,
    acceptedImmutable: core.captureClaim.acceptedImmutable,
    ratingFingerprint: core.captureClaim.ratingFingerprint,
  };
  const receiptBytes = canonicalReceiptBytes(claimBody);
  const pinnedReceiptDigest = sha256Utf8Bytes(receiptBytes);
  const claims: MlCal1LifecycleReceipt = {
    ...claimBody,
    receiptDigest: pinnedReceiptDigest,
  };
  if (claims.receiptDigest !== sha256Utf8Bytes(receiptBytes)) {
    throw new Error('adapter_receipt_digest_mismatch');
  }
  return { receiptBytes, pinnedReceiptDigest, claims };
}

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

function uniqReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons));
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map((x) => x.toLowerCase()).sort();
  const sb = [...b].map((x) => x.toLowerCase()).sort();
  return sa.every((v, i) => v === sb[i]);
}

export function verifyLifecycleBindingSidecar(
  input: MlCal1LifecycleBindingVerifyInput
): MlCal1LifecycleBindingVerifyResult {
  const reasons: string[] = [];
  const notes: string[] = [];

  const empty = (
    extra?: Partial<MlCal1LifecycleBindingVerifyResult>
  ): MlCal1LifecycleBindingVerifyResult => ({
    structuralConsistencyVerified: false,
    archiveIntegrityVerified: false,
    plannedNumericAgreementOk: false,
    ratingFingerprint: null,
    usableRowCount: 0,
    fullWeightEligible: false,
    independentlyPinned: false,
    liveQualifying: false,
    liveAccepted: false,
    reasons: uniqReasons(reasons),
    notes: uniqReasons(notes),
    recomputed: {
      season: null,
      completedThroughWeek: null,
      selectedPolicy: null,
      canonicalWeight: null,
      recomputedWeight: null,
      fullWeightByPolicy: false,
      prospectiveOk: false,
      lineageOk: false,
    },
    sidecarDigest: null,
    report: null,
    ...extra,
  });

  // --- A1 ZIP digest ---
  const zipDigest = sha256Utf8Bytes(input.zipBytes);
  if (zipDigest !== input.expectedZipSha256.toLowerCase()) {
    reasons.push('archive_zip_digest_mismatch');
    return empty();
  }

  // --- A2 member ---
  let memberBytes: Buffer;
  let memberPathFromZip: string | null = null;
  try {
    const extracted = extractSingleUtf8MemberFromZip(input.zipBytes);
    memberPathFromZip = extracted.memberPath;
    memberBytes = input.reportMemberBytes ?? extracted.memberBytes;
    if (
      input.reportMemberBytes &&
      !input.reportMemberBytes.equals(extracted.memberBytes)
    ) {
      reasons.push('report_member_bytes_mismatch_vs_zip');
      return empty();
    }
  } catch (err) {
    if (input.reportMemberBytes) {
      memberBytes = input.reportMemberBytes;
      notes.push(`zip_extract_fallback:${(err as Error).message}`);
    } else {
      reasons.push(`zip_extract_failed:${(err as Error).message}`);
      return empty();
    }
  }

  const memberDigest = sha256Utf8Bytes(memberBytes);
  if (memberDigest !== input.expectedReportMemberSha256.toLowerCase()) {
    reasons.push('archive_report_member_digest_mismatch');
    return empty();
  }

  let report: MlCal1LifecycleReportParsed;
  try {
    report = parseLifecycleReport(memberBytes);
  } catch {
    reasons.push('report_parse_failed');
    return empty();
  }

  // --- A3 execution / verification flags ---
  if (report.execution.commitSucceeded !== true) {
    reasons.push('execution_commit_not_succeeded');
  }
  if (report.execution.postWriteVerificationSucceeded !== true) {
    reasons.push('execution_post_write_verification_not_succeeded');
  }
  if (report.verification.ok !== true) {
    reasons.push('verification_ok_false');
  }

  // --- A4 cohort / season / model / weight ---
  const plannedIds = report.rows.map((r) => r.teamId.toLowerCase());
  const plannedUnique = Array.from(new Set(plannedIds));
  if (plannedIds.length !== plannedUnique.length) {
    const seen = new Set<string>();
    for (const id of plannedIds) {
      if (seen.has(id)) reasons.push(`duplicate_planned:${id}`);
      seen.add(id);
    }
  }
  if (plannedUnique.length !== ML_CAL_1_BINDING_EXPECTED_FBS_COUNT) {
    reasons.push(`planned_count_mismatch:${plannedUnique.length}`);
  }
  if (report.modelVersion !== ML_CAL_1_BINDING_MODEL_VERSION) {
    reasons.push('report_model_version_mismatch');
  }
  const recomputedWeight = b1CanonicalWeight(report.completedThroughWeek);
  if (report.canonicalWeight !== recomputedWeight) {
    reasons.push(
      `canonical_weight_mismatch:declared=${report.canonicalWeight},recomputed=${recomputedWeight}`
    );
  }
  if (report.selectedPolicy !== ML_CAL_1_BINDING_POLICY) {
    reasons.push('selected_policy_mismatch');
  }

  const archiveIntegrityVerified = reasons.length === 0;

  // --- Sidecar parse ---
  let sidecar: MlCal1LifecycleBindingSidecarV1;
  let sidecarDigest: string;
  try {
    sidecar = JSON.parse(input.sidecarBytes) as MlCal1LifecycleBindingSidecarV1;
    sidecarDigest = sha256Utf8Bytes(input.sidecarBytes);
  } catch {
    reasons.push('sidecar_parse_failed');
    return empty({
      archiveIntegrityVerified,
      report,
      recomputed: {
        season: report.season,
        completedThroughWeek: report.completedThroughWeek,
        selectedPolicy: report.selectedPolicy,
        canonicalWeight: report.canonicalWeight,
        recomputedWeight,
        fullWeightByPolicy: false,
        prospectiveOk: false,
        lineageOk: false,
      },
    });
  }

  if (sidecar.schemaVersion !== ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA) {
    reasons.push('sidecar_schema_mismatch');
  }
  if (sidecar.kind !== 'lifecycle-binding-sidecar') {
    reasons.push('sidecar_kind_mismatch');
  }

  const obs = sidecar.bindingObservation;
  if (
    !obs ||
    !obs.observationStartTime ||
    !obs.observationEndTime ||
    !obs.bindingSnapshotReferenceTime ||
    !obs.bindingObserverSha
  ) {
    reasons.push('observation_provenance_missing');
  }

  // Archive pins echoed on sidecar must match independently hashed digests
  if (sidecar.acceptedArchive?.github?.zipSha256 !== zipDigest) {
    reasons.push('sidecar_declared_zip_digest_mismatch');
  }
  if (sidecar.acceptedArchive?.github?.reportMemberSha256 !== memberDigest) {
    reasons.push('sidecar_declared_member_digest_mismatch');
  }
  if (
    sidecar.acceptedArchive?.lifecycleProducerSha !==
    input.expectedLifecycleProducerSha
  ) {
    reasons.push('lifecycle_producer_sha_mismatch');
  }
  if (
    sidecar.acceptedArchive?.github?.reportByteCount !== memberBytes.length
  ) {
    reasons.push('report_byte_count_mismatch');
  }
  if (
    memberPathFromZip &&
    sidecar.acceptedArchive?.github?.reportMemberPath &&
    memberPathFromZip !== sidecar.acceptedArchive.github.reportMemberPath
  ) {
    notes.push('report_member_path_differs_from_zip_entry');
  }

  // --- O1 / O2 timing ---
  const tObs0 = parseIsoMs(obs?.observationStartTime);
  const tSnap = parseIsoMs(obs?.bindingSnapshotReferenceTime);
  const tObs1 = parseIsoMs(obs?.observationEndTime);
  const tDb = parseIsoMs(obs?.dbTransactionTime ?? null);
  const tRun = parseIsoMs(sidecar.acceptedArchive?.github?.workflowRunCompletedAt);
  const tArt = parseIsoMs(sidecar.acceptedArchive?.github?.artifactCreatedAt);
  const nowCeiling = parseIsoMs(input.nowCeiling);
  const uMax = parseIsoMs(obs?.rowUpdatedAtMax);
  const cMax = parseIsoMs(obs?.rowCreatedAtMax);

  if (tObs0 == null || tSnap == null || tObs1 == null || nowCeiling == null) {
    reasons.push('observation_time_order_invalid');
  } else {
    if (!(tObs0 <= tSnap && tSnap <= tObs1)) {
      reasons.push('observation_time_order_invalid');
    }
    if (tDb != null && !(tObs0 <= tDb && tDb <= tObs1)) {
      reasons.push('observation_time_order_invalid');
    }
    if (tRun != null && tRun > tObs0) {
      reasons.push('observation_predates_archive');
    }
    if (tArt != null && tArt > tObs0) {
      reasons.push('observation_predates_archive');
    }
    if (uMax != null && uMax > tSnap) {
      reasons.push('row_updated_after_binding_snapshot');
    }
    if (cMax != null && cMax > tSnap) {
      reasons.push('row_updated_after_binding_snapshot');
    }
  }

  const rows = obs?.rows ?? [];
  for (const row of rows) {
    const c = parseIsoMs(row.createdAt);
    const u = parseIsoMs(row.updatedAt);
    if (c == null || u == null) {
      reasons.push(`row_timestamp_invalid:${row.teamId}`);
      continue;
    }
    if (c > u) {
      reasons.push(`row_created_after_updated:${row.teamId}`);
    }
    if (nowCeiling != null && (c > nowCeiling || u > nowCeiling)) {
      reasons.push(`row_timestamp_in_future:${row.teamId}`);
    }
    if (
      row.season !== report.season ||
      row.modelVersion !== ML_CAL_1_BINDING_MODEL_VERSION
    ) {
      reasons.push(`observation_scope_mismatch:${row.teamId}`);
    }
  }

  // --- O3 reconstruct → export → fingerprint ---
  const exportedByTeam: Record<string, MlCal1ExportedRatingInput> = {};
  let usableRowCount = 0;
  try {
    for (const row of rows) {
      const exported = exportRatingInput(reconstructRawRatingRow(row));
      exportedByTeam[row.teamId] = exported;
      if (exported.inputUsable) usableRowCount += 1;
    }
  } catch (err) {
    reasons.push(`export_rating_failed:${(err as Error).message}`);
  }
  const ratingFingerprint =
    Object.keys(exportedByTeam).length > 0
      ? buildRatingFingerprint(exportedByTeam)
      : null;

  if (sidecar.declaredEcho?.ratingFingerprint != null && ratingFingerprint != null) {
    if (sidecar.declaredEcho.ratingFingerprint !== ratingFingerprint) {
      reasons.push('declared_ratingFingerprint_mismatch');
    }
  }
  if (
    sidecar.declaredEcho?.usableRowCount != null &&
    sidecar.declaredEcho.usableRowCount !== usableRowCount
  ) {
    reasons.push('declared_usableRowCount_mismatch');
  }

  // --- N1 numeric agreement vs finalPowerRating ---
  const numericReasons: string[] = [];
  const observedIds = rows.map((r) => r.teamId.toLowerCase());
  const observedUnique = Array.from(new Set(observedIds));
  if (observedIds.length !== observedUnique.length) {
    const seen = new Set<string>();
    for (const id of observedIds) {
      if (seen.has(id)) numericReasons.push(`duplicate_after_write:${id}`);
      seen.add(id);
    }
  }
  if (!setsEqual(observedUnique, plannedUnique)) {
    numericReasons.push('after_write_team_set_mismatch');
  }
  if (observedUnique.length !== ML_CAL_1_BINDING_EXPECTED_FBS_COUNT) {
    numericReasons.push(`after_count_mismatch:${observedUnique.length}`);
  }

  const plannedByTeam = new Map(
    report.rows.map((r) => [r.teamId.toLowerCase(), r] as const)
  );
  const observedByTeam = new Map(
    rows.map((r) => [r.teamId.toLowerCase(), r] as const)
  );

  for (const id of plannedUnique) {
    const planned = plannedByTeam.get(id);
    const observed = observedByTeam.get(id);
    if (!planned || !observed) {
      numericReasons.push(`missing_after_write:${id}`);
      continue;
    }
    // Compare from preserved raw text (design §2.4 / §3.1). Do not rely on
    // decimalLikeToNumber({toString}) — that helper only accepts Prisma-like
    // toNumber()/number/string values.
    const power =
      observed.powerRatingRaw == null || observed.powerRatingRaw.trim() === ''
        ? null
        : Number(observed.powerRatingRaw.trim());
    const rating =
      observed.ratingRaw == null || observed.ratingRaw.trim() === ''
        ? null
        : Number(observed.ratingRaw.trim());
    const games = decimalLikeToNumber(observed.games);
    if (
      power === null ||
      Math.abs(power - planned.finalPowerRating) > ML_CAL_1_BINDING_RATING_EPS
    ) {
      numericReasons.push(`powerRating_mismatch:${id}`);
      continue;
    }
    if (
      rating === null ||
      Math.abs(rating - planned.finalPowerRating) > ML_CAL_1_BINDING_RATING_EPS
    ) {
      numericReasons.push(`rating_mismatch:${id}`);
      continue;
    }
    if (
      games === null ||
      Math.abs(games - planned.games) > ML_CAL_1_BINDING_RATING_EPS
    ) {
      numericReasons.push(`games_mismatch:${id}`);
    }
  }

  const plannedNumericAgreementOk = numericReasons.length === 0;
  if (!plannedNumericAgreementOk) {
    reasons.push(...numericReasons);
  }

  // --- Q1 full weight ---
  const fullWeightByPolicy =
    report.completedThroughWeek >= ML_CAL_1_BINDING_FULL_WEIGHT_MIN_WEEK &&
    recomputedWeight === ML_CAL_1_BINDING_FULL_WEIGHT;
  const prospectiveOk =
    report.completedThroughWeek < input.prospectiveTargetWeek;
  const observationOk =
    !reasons.includes('observation_provenance_missing') &&
    !reasons.includes('observation_time_order_invalid') &&
    !reasons.includes('observation_predates_archive') &&
    !reasons.some((r) => r.startsWith('row_timestamp'));

  const structuralConsistencyVerified =
    archiveIntegrityVerified &&
    observationOk &&
    plannedNumericAgreementOk &&
    ratingFingerprint != null &&
    !reasons.some((r) => r.startsWith('declared_'));

  const fullWeightEligible =
    fullWeightByPolicy &&
    prospectiveOk &&
    archiveIntegrityVerified &&
    observationOk &&
    plannedNumericAgreementOk;

  if (sidecar.declaredEcho?.fullWeightEligible === true && !fullWeightEligible) {
    reasons.push('declared_fullWeightEligible_mismatch');
    notes.push('self_declared_fullWeightEligible_ignored');
  }
  if (
    sidecar.declaredEcho?.archiveIntegrityVerified === true &&
    !archiveIntegrityVerified
  ) {
    reasons.push('declared_archiveIntegrityVerified_mismatch');
  }
  if (
    sidecar.declaredEcho?.plannedNumericAgreementOk != null &&
    sidecar.declaredEcho.plannedNumericAgreementOk !== plannedNumericAgreementOk
  ) {
    reasons.push('declared_plannedNumericAgreementOk_mismatch');
  }

  // --- L1 / L2 lineage attestation (external) ---
  // L2: lineageEcho / self-declared present is NEVER a decision input.
  if (sidecar.lineageEcho?.lineageEvidenceStatus === 'present') {
    notes.push('lineage_echo_ignored_for_decisions');
  }

  let lineageOk = false;
  const attestationBytes = input.lineageAttestationBytes ?? null;
  if (!attestationBytes) {
    reasons.push('lineage_attestation_missing');
    notes.push('lineage_revision_evidence_unavailable');
  } else {
    try {
      const attestation = JSON.parse(
        attestationBytes
      ) as MlCal1LifecycleBindingLineageAttestation;
      if (
        attestation.schemaVersion !==
        ML_CAL_1_LIFECYCLE_BINDING_LINEAGE_ATTESTATION_SCHEMA
      ) {
        reasons.push('lineage_attestation_schema_mismatch');
      }
      if (attestation.approvedSidecarDigest !== sidecarDigest) {
        reasons.push('lineage_attestation_sidecar_digest_mismatch');
      }
      const checkedThrough = parseIsoMs(attestation.checkedThroughTime);
      const attestationTime = parseIsoMs(attestation.attestationTime);
      if (checkedThrough == null || attestationTime == null) {
        reasons.push('lineage_attestation_time_invalid');
      } else if (attestationTime < checkedThrough) {
        reasons.push('lineage_attestation_time_invalid');
      } else if (tSnap != null && checkedThrough < tSnap) {
        reasons.push('lineage_checked_through_too_early');
      } else if (tObs1 != null && checkedThrough < tObs1) {
        // Prefer coverage through observationEndTime; treat shortfall as too early.
        reasons.push('lineage_checked_through_too_early');
      }

      if (
        !attestation.pinProvenance?.registryId ||
        !attestation.pinProvenance?.registrySha256 ||
        !attestation.pinProvenance?.reviewedAt ||
        !attestation.pinProvenance?.reviewer
      ) {
        reasons.push('lineage_attestation_pin_provenance_missing');
      }

      if (attestation.searchOutcome === 'superseded') {
        reasons.push('binding_invalidated_by_later_lifecycle');
      } else if (attestation.searchOutcome !== 'none_found') {
        reasons.push('lineage_search_outcome_invalid');
      }
      if (
        attestation.searchOutcome === 'none_found' &&
        attestation.supersedingArtifacts?.length > 0
      ) {
        reasons.push('binding_invalidated_by_later_lifecycle');
      }

      lineageOk =
        attestation.searchOutcome === 'none_found' &&
        (attestation.supersedingArtifacts?.length ?? 0) === 0 &&
        attestation.approvedSidecarDigest === sidecarDigest &&
        checkedThrough != null &&
        attestationTime != null &&
        attestationTime >= checkedThrough &&
        tSnap != null &&
        checkedThrough >= tSnap &&
        (tObs1 == null || checkedThrough >= tObs1) &&
        Boolean(attestation.pinProvenance?.registrySha256);
    } catch {
      reasons.push('lineage_attestation_parse_failed');
    }
  }

  // --- T1 registry pin ---
  let independentlyPinned = false;
  const pin = input.registryPin ?? null;
  if (pin) {
    if (
      !pin.pinProvenance?.registryId ||
      !pin.pinProvenance?.registrySha256 ||
      !pin.pinProvenance?.reviewedAt ||
      !pin.pinProvenance?.reviewer
    ) {
      reasons.push('registry_pin_provenance_missing');
    } else if (input.registryDocumentBytes == null) {
      reasons.push('registry_pin_provenance_missing');
      notes.push('registry_document_bytes_required');
    } else {
      const registryDigest = sha256Utf8Bytes(input.registryDocumentBytes);
      if (registryDigest !== pin.pinProvenance.registrySha256) {
        reasons.push('registry_digest_mismatch');
      }
    }

    if (pin.approvedSidecarDigest !== sidecarDigest) {
      reasons.push('sidecar_digest_mismatch_vs_registry');
    }
    if (
      pin.approvedZipSha256 !== zipDigest ||
      pin.approvedReportMemberSha256 !== memberDigest ||
      pin.approvedLifecycleProducerSha !== input.expectedLifecycleProducerSha
    ) {
      reasons.push('archive_pin_mismatch');
    }
    if (
      ratingFingerprint != null &&
      pin.approvedRatingFingerprint !== ratingFingerprint
    ) {
      reasons.push('fingerprint_mismatch_vs_registry');
    }
    if (pin.approvedBindingObserverSha !== obs?.bindingObserverSha) {
      reasons.push('observer_sha_mismatch_vs_registry');
    }
    if (
      pin.approvedSeason !== report.season ||
      pin.approvedCompletedThroughWeek !== report.completedThroughWeek ||
      pin.approvedSelectedPolicy !== report.selectedPolicy ||
      pin.approvedCanonicalWeight !== recomputedWeight ||
      pin.approvedProspectiveTargetWeek !== input.prospectiveTargetWeek
    ) {
      reasons.push('archive_claims_mismatch_vs_registry');
    }

    independentlyPinned =
      !reasons.includes('registry_pin_provenance_missing') &&
      !reasons.includes('registry_digest_mismatch') &&
      !reasons.includes('sidecar_digest_mismatch_vs_registry') &&
      !reasons.includes('archive_pin_mismatch') &&
      !reasons.includes('fingerprint_mismatch_vs_registry') &&
      !reasons.includes('observer_sha_mismatch_vs_registry') &&
      !reasons.includes('archive_claims_mismatch_vs_registry');
  }

  // --- Live qualification ---
  const mode = sidecar.mode;
  const liveQualifying =
    structuralConsistencyVerified &&
    fullWeightEligible &&
    lineageOk &&
    independentlyPinned &&
    archiveIntegrityVerified &&
    plannedNumericAgreementOk;

  // T2: fixture_hypothetical can never liveAccept
  const liveAccepted =
    liveQualifying && mode !== 'fixture_hypothetical';

  if (mode === 'fixture_hypothetical' && liveQualifying) {
    notes.push('fixture_hypothetical_cannot_live_accept');
  }

  return {
    structuralConsistencyVerified,
    archiveIntegrityVerified,
    plannedNumericAgreementOk,
    ratingFingerprint,
    usableRowCount,
    fullWeightEligible,
    independentlyPinned,
    liveQualifying,
    liveAccepted,
    reasons: uniqReasons(reasons),
    notes: uniqReasons(notes),
    recomputed: {
      season: report.season,
      completedThroughWeek: report.completedThroughWeek,
      selectedPolicy: report.selectedPolicy,
      canonicalWeight: report.canonicalWeight,
      recomputedWeight,
      fullWeightByPolicy,
      prospectiveOk,
      lineageOk,
    },
    sidecarDigest,
    report,
  };
}
