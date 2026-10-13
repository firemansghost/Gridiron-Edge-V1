/**
 * ML-CAL-1 G5-PRE — Offline trusted retrieval / binding-window lineage pre-check.
 *
 * Additive inventory + package structural checks only. Does not amend accepted
 * verifyLifecycleBindingSidecar. No live HTTP/DB adapters, credentials, providers,
 * pooler preflight, prospective registration, calibration, or 2025 access.
 *
 * Design pin: research/moneyline/ML_CAL_1_TRUSTED_RETRIEVAL_LINEAGE_G5_DESIGN.md
 * Accepted design SHA-256: bc292e06ce78531b7290833922abe4add9be3af854fe15c599d9bcd1dc1c7a8b
 * Accepted G4 dependency: 6c2b31069b8805c7f2d171da1e04bf47885f237d
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  buildRatingFingerprint,
  exportRatingInput,
  reconstructRawRatingRow,
  sha256Utf8Bytes,
  stableStringify,
  verifyLifecycleBindingSidecar,
  type MlCal1BindingObservedRatingRow,
  type MlCal1LifecycleBindingVerifyInput,
  type MlCal1LifecycleBindingVerifyResult,
} from './ml-cal-1-lifecycle-binding';
import {
  isSafeG4ObservationId,
  ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256,
  ML_CAL_1_G4_BASE_G3_TIP,
  ML_CAL_1_G4_DESIGN_ON_DISK_SHA256,
  ML_CAL_1_G4_OBSERVER_PACKAGE_SCHEMA,
} from './ml-cal-1-lifecycle-binding-observer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ML_CAL_1_G5_INVENTORY_SCHEMA =
  'ml-cal-1-lifecycle-binding-lineage-inventory-v1' as const;

export const ML_CAL_1_G5_LISTING_PAGE_SCHEMA =
  'ml-cal-1-g5-retained-listing-page-v1' as const;

export const ML_CAL_1_G5_EFFECT_EVIDENCE_SCHEMA =
  'ml-cal-1-g5-independent-effect-evidence-v1' as const;

/** Legacy boolean-declaration envelope — not proof (R2-A regressions). */
export const ML_CAL_1_G5_CANDIDATE_CONTENTS_SCHEMA =
  'ml-cal-1-g5-candidate-contents-v1' as const;

/**
 * Supported retained candidate artifact / write-effect bytes for derivation (R2-A).
 * Affect is derived against the bound sidecar cohort/snapshot — not declared.
 */
export const ML_CAL_1_G5_WRITE_EFFECT_ARTIFACT_SCHEMA =
  'ml-cal-1-g5-candidate-artifact-write-effect-v1' as const;

export const ML_CAL_1_G5_DESIGN_ON_DISK_SHA256 =
  'bc292e06ce78531b7290833922abe4add9be3af854fe15c599d9bcd1dc1c7a8b' as const;

export const ML_CAL_1_G5_BASE_G4_TIP =
  '6c2b31069b8805c7f2d171da1e04bf47885f237d' as const;

export const ML_CAL_1_G5_DISPOSITIONS = [
  'not_invalidating',
  'invalidating',
  'unresolved',
] as const;

/** Required source catalog (§5.2). Extension only by design revision. */
export const ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG = [
  'github-actions-lifecycle-artifacts',
  'local-evidence-retain-store',
  'lifecycle-report-index',
  'rating-revision-probe',
] as const;

export type MlCal1G5RequiredSourceId =
  (typeof ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG)[number];

export const ML_CAL_1_G5_REQUIRED_PACKAGE_MEMBERS = [
  'archive.zip',
  'binding-sidecar.json',
  'observer-run-metadata.json',
  'design-correspondence.json',
  'PACKAGE_MANIFEST.json',
  'PACKAGE_MANIFEST.sha256',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MlCal1G5ResolvedDisposition =
  | 'not_invalidating'
  | 'invalidating'
  | 'unresolved';

export interface MlCal1G5RetainedListingCandidate {
  candidateKey: string;
  workflowRunId?: string | null;
  zipSha256?: string | null;
  completedThroughWeek?: number | null;
  season?: number | null;
  modelVersion?: string | null;
  commitOrWriteTime?: string | null;
  artifactAvailableAt?: string | null;
  runStartedAt?: string | null;
  runEndedAt?: string | null;
  eventKind?: string | null;
  /** When true, page marks candidate as deleted/expired (notice may be separate). */
  deletedOrExpired?: boolean;
}

export interface MlCal1G5RetainedListingPage {
  schemaVersion: typeof ML_CAL_1_G5_LISTING_PAGE_SCHEMA;
  kind: 'g5-retained-listing-page';
  sourceId: string;
  pageIndex: number;
  /** Stable token for this page; prior page nextPageToken must equal this when chained. */
  pageToken: string;
  nextPageToken: string | null;
  emptyResult?: boolean;
  candidates: MlCal1G5RetainedListingCandidate[];
}

/**
 * Reviewed independent-effect conclusion. Matching booleans are not proof —
 * a separately supplied external approval digest for these exact bytes is
 * required (R2-A). Self-hash / envelope-copied digests cannot approve.
 */
export interface MlCal1G5IndependentEffectEvidence {
  schemaVersion: typeof ML_CAL_1_G5_EFFECT_EVIDENCE_SCHEMA;
  kind: 'independent-effect-evidence';
  candidateKey: string;
  season: 2026;
  modelVersion: 'v1';
  /** Reviewed conclusion — accepted only with external approval + bindings. */
  affectsBoundRatings: boolean;
  /** Required true when used to support not_invalidating. */
  provesNonEffect: boolean;
  /** Must equal the PRE-bound sidecar digest. */
  boundSidecarDigest: string;
  /** Must equal the rating fingerprint derived from the bound sidecar rows. */
  boundRatingFingerprint: string;
  /** Reviewed evidence interval (must cover the search / observation window). */
  intervalStartInclusive: string;
  intervalEndInclusive: string;
  note?: string;
}

/** Supported artifact bytes; affect is derived, not declared as disposition proof. */
export interface MlCal1G5WriteEffectArtifact {
  schemaVersion: typeof ML_CAL_1_G5_WRITE_EFFECT_ARTIFACT_SCHEMA;
  kind: 'candidate-artifact-write-effect';
  candidateKey: string;
  season: 2026;
  modelVersion: 'v1';
  workflowRunId: string | null;
  zipSha256: string | null;
  commitOrWriteTime: string | null;
  artifactAvailableAt: string | null;
  /** Factual: whether this artifact wrote team-season ratings. */
  writesTeamSeasonRatings: boolean;
  writtenSeason: number | null;
  writtenModelVersion: string | null;
  /** Required when writesTeamSeasonRatings — fingerprint of written ratings. */
  writtenRatingFingerprint: string | null;
  completedThroughWeek: number | null;
}

/** Bound context used to derive / bind disposition proof (R2-A). */
export interface MlCal1G5BoundEffectContext {
  sidecarDigest: string;
  ratingFingerprint: string;
  season: number;
  modelVersion: string;
  observationStartTime: string | null;
  observationEndTime: string;
  bindingSnapshotReferenceTime: string;
  searchWindowStartInclusive: string;
  searchWindowEndInclusive: string;
  candidate: {
    workflowRunId?: string | null;
    zipSha256?: string | null;
    commitOrWriteTime: string | null;
    artifactAvailableAt: string | null;
    completedThroughWeek?: number | null;
  };
}

export interface MlCal1G5InventorySourceSearched {
  sourceId: string;
  locator: string;
  query: object | string;
  timeBounds: { startInclusive: string; endInclusive: string };
  pagination: {
    strategy: 'page' | 'cursor' | 'none';
    pagesRetrieved: number;
    pageDigests: string[];
    nextPageToken: string | null;
    complete: boolean;
  };
  resultCount: number;
  failed: boolean;
  failureReason: string | null;
  unavailable: boolean;
  retainedEvidenceDigests: string[];
}

export interface MlCal1G5InventoryCandidate {
  candidateKey: string;
  workflowRunId?: string | null;
  zipSha256?: string | null;
  completedThroughWeek?: number | null;
  commitOrWriteTime: string | null;
  artifactAvailableAt: string | null;
  runStartedAt: string | null;
  runEndedAt: string | null;
  eventKind?: string | null;
  sourceId: string;
  listingPageDigest: string;
  candidateContentsDigest: string | null;
  independentEffectEvidenceDigest: string | null;
  deletionNoticeDigest: string | null;
  resolvedDisposition: MlCal1G5ResolvedDisposition;
}

export interface MlCal1G5LineageInventory {
  schemaVersion: typeof ML_CAL_1_G5_INVENTORY_SCHEMA;
  kind: 'lifecycle-binding-lineage-inventory';
  season: number;
  modelVersion: 'v1';
  selectedPolicy: string;
  completedThroughWeekObserved: number;
  lifecycleProducerSha: string;
  bindingObserverSha: string;
  observationId: string;
  approvedSidecarDigest: string;
  registryId: string;
  registrySha256: string;
  searchWindowStartInclusive: string;
  searchWindowEndInclusive: string;
  inventoryAssembledAt: string;
  requiredSourceCatalog: string[];
  sourcesSearched: MlCal1G5InventorySourceSearched[];
  searchComplete: boolean;
  noneFoundPermitted: boolean;
  incompleteReasons: string[];
  expiredOrDeletedArtifacts: Array<{
    sourceId: string;
    locator: string;
    notedAt: string;
    note: string;
    deletionNoticeDigest: string | null;
    candidateContentsDigest: string | null;
    independentEffectEvidenceDigest: string | null;
  }>;
  invalidatingCandidateArtifacts: MlCal1G5InventoryCandidate[];
  failedSearches: Array<{
    sourceId: string;
    failureReason: string;
    retainedEvidenceDigest: string | null;
  }>;
}

export interface MlCal1G5RetrievedObject {
  objectClass: string;
  locator: string;
  byteCount: number;
  sha256: string;
  retrievedAt: string;
  bytes: Buffer;
}

export interface MlCal1G5ExternalAnchors {
  /** Independently supplied — never assigned from just-computed digests. */
  approvedLineageInventorySha256?: string | null;
  approvedLineageAttestationDigest?: string | null;
  approvedRegistryDocumentDigest?: string | null;
  approvedObservationPackageDigest?: string | null;
  approvedSidecarDigest?: string | null;
  /**
   * Map: sha256(independent-effect-evidence bytes) → separately supplied
   * approval digest. Value must not equal the evidence digest (no self-hash).
   * Fixture-only synthetic approvals are test-scoped.
   */
  approvedIndependentEffectEvidenceDigests?: Record<string, string> | null;
}

export interface MlCal1G5PreInput {
  observationId: string;
  packageDir: string;
  /** Retained search-evidence root (listing pages, notices, contents, effect proofs). */
  searchEvidenceRetainDir: string;
  inventoryBytes: Buffer;
  /** External anchors compared to computed digests (may be partial for structural-only). */
  externalAnchors: MlCal1G5ExternalAnchors;
  /**
   * When claiming package-level approval, pin-defined identity digest over package
   * (caller supplies definition; helper only compares). Absence ⇒ no approval claim.
   */
  claimedApprovedObservationPackageDigest?: string | null;
  /** Pin-defined package identity digest computed outside this helper (optional). */
  pinDefinedPackageIdentityDigest?: string | null;
  /**
   * Attestation searchOutcome mirror for G5-PRE gate on none_found permission.
   * When 'none_found' and recomputedNoneFoundPermitted is false → fail.
   */
  attestationSearchOutcome?: 'none_found' | 'superseded' | null;
  /**
   * Attestation checkedThroughTime used for window-end agreement when provided.
   * Inventory searchWindowEndInclusive must equal this when present.
   */
  attestationCheckedThroughTime?: string | null;
  bindingSnapshotReferenceTime?: string | null;
  observationEndTime?: string | null;
  nowCeiling: string;
  /** Bound archive chronology (mandatory for window start). */
  workflowRunCompletedAt: string;
  artifactCreatedAt: string;
  /**
   * Whole-package approval remains disabled until its digest profile is
   * independently reviewed. Any claim is rejected regardless of this flag.
   */
  wholePackageApprovalEnabled?: boolean;
  /**
   * When true, require independently supplied registry + attestation digest
   * anchors (qualification path). Default false for retrieval/inventory-only.
   */
  requireQualificationAnchors?: boolean;
}

export interface MlCal1G5BoundPackageEvidence {
  observationId: string;
  packageDir: string;
  zipSha256: string | null;
  reportMemberSha256: string | null;
  reportMemberName: string | null;
  sidecarDigest: string | null;
  sidecarObservationEndTime: string | null;
  sidecarBindingSnapshotReferenceTime: string | null;
  sidecarWorkflowRunCompletedAt: string | null;
  sidecarArtifactCreatedAt: string | null;
  sidecarLifecycleProducerSha: string | null;
  sidecarBindingObserverSha: string | null;
  sidecarSeason: number | null;
  sidecarModelVersion: string | null;
  sidecarReportMemberPath: string | null;
  sidecarZipSha256: string | null;
  sidecarReportMemberSha256: string | null;
  sidecarReportByteCount: number | null;
}

/** Anchors validated during G5-PRE for R4 verify binding. */
export interface MlCal1G5ValidatedAnchors {
  inventorySha256: string;
  approvedLineageInventorySha256: string | null;
  approvedLineageAttestationDigest: string | null;
  approvedRegistryDocumentDigest: string | null;
}

export interface MlCal1G5PreResult {
  ok: boolean;
  reasons: string[];
  recomputedSearchComplete: boolean;
  recomputedNoneFoundPermitted: boolean;
  derivedCandidateCount: number;
  unresolvedCandidateKeys: string[];
  fixtureProvenanceRetained: boolean;
  packageStructuralOk: boolean;
  inventorySha256: string;
  sidecarDigest: string | null;
  /** Bound retained package identities for G5-VERIFY cross-check (F6). */
  boundEvidence: MlCal1G5BoundPackageEvidence;
  /** Inventory/attestation/registry anchors validated by PRE (R4). */
  validatedAnchors: MlCal1G5ValidatedAnchors;
  /** Eligibility claims are always false on G5-PRE path. */
  prospectiveOk: false;
  fullWeightEligible: false;
  liveQualifying: false;
  liveAccepted: false;
  retrieved: {
    inventory: Omit<MlCal1G5RetrievedObject, 'bytes'>;
    packageMembers: Array<Omit<MlCal1G5RetrievedObject, 'bytes'>>;
  };
  notes: string[];
}

export interface MlCal1G5VerifyInput {
  g5Pre: MlCal1G5PreResult;
  /**
   * Required when invoking accepted verifier. Must be an independently approved
   * production target OR an explicit fixture-only integer. Never invent production week.
   */
  prospectiveTargetWeek: number;
  fixtureOnlyTarget: boolean;
  verifyInput: MlCal1LifecycleBindingVerifyInput;
}

export interface MlCal1G5VerifyResult {
  invokedVerifier: boolean;
  verifyResult: MlCal1LifecycleBindingVerifyResult | null;
  liveAccepted: false;
  reasons: string[];
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Path / time helpers
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const GIT_SHA40 = /^[0-9a-f]{40}$/;

export function isSafeG5PackageMemberName(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
    return false;
  }
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    return false;
  }
  if (name === '..' || name.includes('..')) {
    return false;
  }
  // Disallow leading-dot names except the concrete required filenames (none lead with .).
  if (name.startsWith('.')) {
    return false;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
}

function parseIsoMs(value: unknown): number | null {
  if (value == null || typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function sha256Hex(bytes: Buffer): string {
  return sha256Utf8Bytes(bytes);
}

function catalogEquals(actual: string[]): boolean {
  if (actual.length !== ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG.length) {
    return false;
  }
  for (let i = 0; i < ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG.length; i++) {
    if (actual[i] !== ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG[i]) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Retained listing adapters (offline — parse retained page bytes only)
// ---------------------------------------------------------------------------

export function parseRetainedListingPage(
  bytes: Buffer
): { ok: true; page: MlCal1G5RetainedListingPage } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, reason: 'listing_page_json_invalid' };
  }
  if (parsed == null || typeof parsed !== 'object') {
    return { ok: false, reason: 'listing_page_not_object' };
  }
  const o = parsed as Record<string, unknown>;
  if (o.schemaVersion !== ML_CAL_1_G5_LISTING_PAGE_SCHEMA) {
    return { ok: false, reason: 'listing_page_schema_mismatch' };
  }
  if (o.kind !== 'g5-retained-listing-page') {
    return { ok: false, reason: 'listing_page_kind_mismatch' };
  }
  if (typeof o.sourceId !== 'string' || o.sourceId.trim() === '') {
    return { ok: false, reason: 'listing_page_source_missing' };
  }
  if (typeof o.pageIndex !== 'number' || !Number.isInteger(o.pageIndex) || o.pageIndex < 0) {
    return { ok: false, reason: 'listing_page_index_invalid' };
  }
  if (typeof o.pageToken !== 'string' || o.pageToken.trim() === '') {
    return { ok: false, reason: 'listing_page_token_missing' };
  }
  if (!(o.nextPageToken === null || typeof o.nextPageToken === 'string')) {
    return { ok: false, reason: 'listing_page_next_token_invalid' };
  }
  if (!Array.isArray(o.candidates)) {
    return { ok: false, reason: 'listing_page_candidates_missing' };
  }
  const candidates: MlCal1G5RetainedListingCandidate[] = [];
  for (const c of o.candidates) {
    if (c == null || typeof c !== 'object') {
      return { ok: false, reason: 'listing_candidate_invalid' };
    }
    const row = c as Record<string, unknown>;
    if (typeof row.candidateKey !== 'string' || row.candidateKey.trim() === '') {
      return { ok: false, reason: 'listing_candidate_key_missing' };
    }
    candidates.push({
      candidateKey: row.candidateKey,
      workflowRunId:
        typeof row.workflowRunId === 'string' ? row.workflowRunId : null,
      zipSha256: typeof row.zipSha256 === 'string' ? row.zipSha256 : null,
      completedThroughWeek:
        typeof row.completedThroughWeek === 'number'
          ? row.completedThroughWeek
          : null,
      season: typeof row.season === 'number' ? row.season : null,
      modelVersion:
        typeof row.modelVersion === 'string' ? row.modelVersion : null,
      commitOrWriteTime:
        typeof row.commitOrWriteTime === 'string' ? row.commitOrWriteTime : null,
      artifactAvailableAt:
        typeof row.artifactAvailableAt === 'string'
          ? row.artifactAvailableAt
          : null,
      runStartedAt:
        typeof row.runStartedAt === 'string' ? row.runStartedAt : null,
      runEndedAt: typeof row.runEndedAt === 'string' ? row.runEndedAt : null,
      eventKind: typeof row.eventKind === 'string' ? row.eventKind : null,
      deletedOrExpired: row.deletedOrExpired === true,
    });
  }
  return {
    ok: true,
    page: {
      schemaVersion: ML_CAL_1_G5_LISTING_PAGE_SCHEMA,
      kind: 'g5-retained-listing-page',
      sourceId: o.sourceId,
      pageIndex: o.pageIndex,
      pageToken: o.pageToken as string,
      nextPageToken: o.nextPageToken as string | null,
      emptyResult: o.emptyResult === true,
      candidates,
    },
  };
}

/**
 * Derivation membership (F4):
 * - in_window: known overlap with inclusive search window
 * - uncertain: season/model-relevant but write/run timing unknown/ambiguous — RETAIN
 * - out: proven outside window or irrelevant season/model
 */
export function candidateDerivationMembership(input: {
  candidate: MlCal1G5RetainedListingCandidate;
  searchWindowStartInclusiveMs: number;
  checkedThroughTimeMs: number;
}): 'in_window' | 'uncertain' | 'out' {
  const { candidate: c, searchWindowStartInclusiveMs: start, checkedThroughTimeMs: end } =
    input;
  if (!isSeasonModelRelevant(c)) return 'out';

  const writeMs = parseIsoMs(c.commitOrWriteTime);
  if (writeMs != null) {
    if (writeMs >= start && writeMs <= end) return 'in_window';
    // Known write outside window — still check run overlap before excluding.
  } else if (c.commitOrWriteTime != null && c.commitOrWriteTime !== '') {
    // Present but unparseable → uncertain (retain).
    return 'uncertain';
  }

  const runStart = parseIsoMs(c.runStartedAt);
  const runEnd = parseIsoMs(c.runEndedAt);
  if (c.runStartedAt != null && c.runStartedAt !== '' && runStart == null) {
    return 'uncertain';
  }
  if (c.runEndedAt != null && c.runEndedAt !== '' && runEnd == null) {
    return 'uncertain';
  }
  if (runStart != null && runStart <= end) {
    if (c.runEndedAt == null || c.runEndedAt === '') return 'in_window';
    if (runEnd != null && runEnd >= start) return 'in_window';
  }

  if (c.deletedOrExpired === true) return 'in_window';

  // Availability-only is not write-time proof; retain as uncertain when listed.
  if (
    writeMs == null &&
    runStart == null &&
    (c.artifactAvailableAt != null || c.workflowRunId != null || c.zipSha256 != null)
  ) {
    return 'uncertain';
  }

  if (writeMs != null && (writeMs < start || writeMs > end)) {
    // No overlapping run → out.
    return 'out';
  }
  // No usable timing at all but still listed under relevant season/model → retain.
  return 'uncertain';
}

/** @deprecated Prefer candidateDerivationMembership; true only for in_window. */
export function candidateOverlapsSearchWindow(input: {
  candidate: MlCal1G5RetainedListingCandidate;
  searchWindowStartInclusiveMs: number;
  checkedThroughTimeMs: number;
}): boolean {
  return candidateDerivationMembership(input) === 'in_window';
}

export function isSeasonModelRelevant(
  c: MlCal1G5RetainedListingCandidate
): boolean {
  if (c.season != null && c.season !== 2026) return false;
  if (c.modelVersion != null && c.modelVersion !== 'v1') return false;
  return true;
}

export function loadRetainedBytesByDigest(input: {
  retainDir: string;
  digest: string;
}): Buffer | null {
  if (!HEX64.test(input.digest)) return null;
  const byDigest = path.join(input.retainDir, 'by-digest', `${input.digest}.bin`);
  if (fs.existsSync(byDigest)) {
    const bytes = fs.readFileSync(byDigest);
    if (sha256Hex(bytes) === input.digest) return bytes;
    return null;
  }
  // Also allow flat files named <digest>.json / .bin at retain root.
  for (const ext of ['.bin', '.json', '']) {
    const p = path.join(input.retainDir, `${input.digest}${ext}`);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      const bytes = fs.readFileSync(p);
      if (sha256Hex(bytes) === input.digest) return bytes;
    }
  }
  return null;
}

function candidateFingerprint(c: MlCal1G5RetainedListingCandidate): string {
  return stableStringify({
    candidateKey: c.candidateKey,
    workflowRunId: c.workflowRunId ?? null,
    zipSha256: c.zipSha256 ?? null,
    completedThroughWeek: c.completedThroughWeek ?? null,
    season: c.season ?? null,
    modelVersion: c.modelVersion ?? null,
    commitOrWriteTime: c.commitOrWriteTime ?? null,
    artifactAvailableAt: c.artifactAvailableAt ?? null,
    runStartedAt: c.runStartedAt ?? null,
    runEndedAt: c.runEndedAt ?? null,
    eventKind: c.eventKind ?? null,
    deletedOrExpired: c.deletedOrExpired === true,
  });
}

export function deriveCandidatesFromRetainedPages(input: {
  pageDigests: string[];
  retainDir: string;
  searchWindowStartInclusive: string;
  searchWindowEndInclusive: string;
}): {
  ok: boolean;
  reasons: string[];
  derivedKeys: string[];
  byKey: Map<
    string,
    {
      candidate: MlCal1G5RetainedListingCandidate;
      listingPageDigest: string;
      membership: 'in_window' | 'uncertain';
    }
  >;
} {
  const reasons: string[] = [];
  const start = parseIsoMs(input.searchWindowStartInclusive);
  const end = parseIsoMs(input.searchWindowEndInclusive);
  if (start == null || end == null) {
    return {
      ok: false,
      reasons: ['lineage_search_window_unparseable'],
      derivedKeys: [],
      byKey: new Map(),
    };
  }
  const byKey = new Map<
    string,
    {
      candidate: MlCal1G5RetainedListingCandidate;
      listingPageDigest: string;
      membership: 'in_window' | 'uncertain';
    }
  >();
  for (const digest of input.pageDigests) {
    const bytes = loadRetainedBytesByDigest({
      retainDir: input.retainDir,
      digest,
    });
    if (!bytes) {
      reasons.push(`listing_page_bytes_missing:${digest.slice(0, 12)}`);
      continue;
    }
    const parsed = parseRetainedListingPage(bytes);
    if (parsed.ok === false) {
      reasons.push(parsed.reason);
      continue;
    }
    const page = parsed.page;
    for (const c of page.candidates) {
      const membership = candidateDerivationMembership({
        candidate: c,
        searchWindowStartInclusiveMs: start,
        checkedThroughTimeMs: end,
      });
      if (membership === 'out') continue;
      const existing = byKey.get(c.candidateKey);
      if (existing) {
        if (candidateFingerprint(existing.candidate) !== candidateFingerprint(c)) {
          reasons.push('lineage_candidate_contradictory_duplicate');
        }
        if (membership === 'in_window') {
          existing.membership = 'in_window';
        }
        continue;
      }
      byKey.set(c.candidateKey, {
        candidate: c,
        listingPageDigest: digest,
        membership,
      });
    }
  }
  const derivedKeys = [...byKey.keys()].sort();
  return {
    ok: reasons.length === 0,
    reasons,
    derivedKeys,
    byKey,
  };
}

// ---------------------------------------------------------------------------
// Disposition evidence gates (§5.4.1) — typed schemas (F3)
// ---------------------------------------------------------------------------

export function isValidG5Disposition(
  value: unknown
): value is MlCal1G5ResolvedDisposition {
  return (
    typeof value === 'string' &&
    (ML_CAL_1_G5_DISPOSITIONS as readonly string[]).includes(value)
  );
}

export function parseIndependentEffectEvidence(
  bytes: Buffer,
  expectedCandidateKey: string
):
  | { ok: true; evidence: MlCal1G5IndependentEffectEvidence }
  | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, reason: 'effect_evidence_json_invalid' };
  }
  if (parsed == null || typeof parsed !== 'object') {
    return { ok: false, reason: 'effect_evidence_not_object' };
  }
  const o = parsed as Record<string, unknown>;
  if (o.schemaVersion !== ML_CAL_1_G5_EFFECT_EVIDENCE_SCHEMA) {
    return { ok: false, reason: 'effect_evidence_schema_mismatch' };
  }
  if (o.kind !== 'independent-effect-evidence') {
    return { ok: false, reason: 'effect_evidence_kind_mismatch' };
  }
  if (o.candidateKey !== expectedCandidateKey) {
    return { ok: false, reason: 'effect_evidence_candidate_mismatch' };
  }
  if (o.season !== 2026 || o.modelVersion !== 'v1') {
    return { ok: false, reason: 'effect_evidence_binding_mismatch' };
  }
  if (typeof o.affectsBoundRatings !== 'boolean') {
    return { ok: false, reason: 'effect_evidence_affects_missing' };
  }
  if (typeof o.provesNonEffect !== 'boolean') {
    return { ok: false, reason: 'effect_evidence_proves_non_effect_missing' };
  }
  if (o.provesNonEffect === true && o.affectsBoundRatings === true) {
    return { ok: false, reason: 'effect_evidence_boolean_contradiction' };
  }
  // Reviewed conclusions without sidecar/fingerprint/interval bindings are
  // boolean-only declaration layers — not proof (R2-A).
  if (
    typeof o.boundSidecarDigest !== 'string' ||
    !HEX64.test(o.boundSidecarDigest) ||
    typeof o.boundRatingFingerprint !== 'string' ||
    !HEX64.test(o.boundRatingFingerprint) ||
    typeof o.intervalStartInclusive !== 'string' ||
    parseIsoMs(o.intervalStartInclusive) == null ||
    typeof o.intervalEndInclusive !== 'string' ||
    parseIsoMs(o.intervalEndInclusive) == null
  ) {
    return { ok: false, reason: 'effect_evidence_boolean_only' };
  }
  return {
    ok: true,
    evidence: {
      schemaVersion: ML_CAL_1_G5_EFFECT_EVIDENCE_SCHEMA,
      kind: 'independent-effect-evidence',
      candidateKey: expectedCandidateKey,
      season: 2026,
      modelVersion: 'v1',
      affectsBoundRatings: o.affectsBoundRatings,
      provesNonEffect: o.provesNonEffect,
      boundSidecarDigest: o.boundSidecarDigest.toLowerCase(),
      boundRatingFingerprint: o.boundRatingFingerprint.toLowerCase(),
      intervalStartInclusive: o.intervalStartInclusive,
      intervalEndInclusive: o.intervalEndInclusive,
      note: typeof o.note === 'string' ? o.note : undefined,
    },
  };
}

export function parseWriteEffectArtifact(
  bytes: Buffer,
  expectedCandidateKey: string
):
  | { ok: true; artifact: MlCal1G5WriteEffectArtifact }
  | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, reason: 'candidate_contents_unparseable' };
  }
  if (parsed == null || typeof parsed !== 'object') {
    return { ok: false, reason: 'candidate_contents_unparseable' };
  }
  const o = parsed as Record<string, unknown>;
  // Legacy boolean-only contents envelopes are not proof.
  if (
    o.schemaVersion === ML_CAL_1_G5_CANDIDATE_CONTENTS_SCHEMA ||
    o.kind === 'candidate-contents' ||
    o.kind === 'anchored-candidate-contents'
  ) {
    return { ok: false, reason: 'candidate_contents_boolean_only' };
  }
  if (o.schemaVersion !== ML_CAL_1_G5_WRITE_EFFECT_ARTIFACT_SCHEMA) {
    return { ok: false, reason: 'candidate_contents_unsupported' };
  }
  if (o.kind !== 'candidate-artifact-write-effect') {
    return { ok: false, reason: 'candidate_contents_unsupported' };
  }
  if (o.candidateKey !== expectedCandidateKey) {
    return { ok: false, reason: 'candidate_contents_candidate_mismatch' };
  }
  if (o.season !== 2026 || o.modelVersion !== 'v1') {
    return { ok: false, reason: 'candidate_contents_scope_mismatch' };
  }
  if (typeof o.writesTeamSeasonRatings !== 'boolean') {
    return { ok: false, reason: 'candidate_contents_write_flag_missing' };
  }
  if (o.writesTeamSeasonRatings === true) {
    if (typeof o.writtenSeason !== 'number' || typeof o.writtenModelVersion !== 'string') {
      return { ok: false, reason: 'candidate_contents_written_scope_missing' };
    }
    if (
      typeof o.writtenRatingFingerprint !== 'string' ||
      !HEX64.test(o.writtenRatingFingerprint)
    ) {
      return { ok: false, reason: 'candidate_contents_fingerprint_missing' };
    }
  }
  return {
    ok: true,
    artifact: {
      schemaVersion: ML_CAL_1_G5_WRITE_EFFECT_ARTIFACT_SCHEMA,
      kind: 'candidate-artifact-write-effect',
      candidateKey: expectedCandidateKey,
      season: 2026,
      modelVersion: 'v1',
      workflowRunId:
        typeof o.workflowRunId === 'string' ? o.workflowRunId : null,
      zipSha256: typeof o.zipSha256 === 'string' ? o.zipSha256 : null,
      commitOrWriteTime:
        typeof o.commitOrWriteTime === 'string' ? o.commitOrWriteTime : null,
      artifactAvailableAt:
        typeof o.artifactAvailableAt === 'string' ? o.artifactAvailableAt : null,
      writesTeamSeasonRatings: o.writesTeamSeasonRatings,
      writtenSeason: typeof o.writtenSeason === 'number' ? o.writtenSeason : null,
      writtenModelVersion:
        typeof o.writtenModelVersion === 'string' ? o.writtenModelVersion : null,
      writtenRatingFingerprint:
        typeof o.writtenRatingFingerprint === 'string'
          ? o.writtenRatingFingerprint.toLowerCase()
          : null,
      completedThroughWeek:
        typeof o.completedThroughWeek === 'number'
          ? o.completedThroughWeek
          : null,
    },
  };
}

/** Derive whether artifact affects the bound rating cohort/snapshot. */
export function deriveAffectsBoundRatingsFromArtifact(
  artifact: MlCal1G5WriteEffectArtifact,
  bound: MlCal1G5BoundEffectContext
): { ok: true; affects: boolean } | { ok: false; reason: string } {
  // Bind artifact identity to listed candidate (key alone insufficient).
  const c = bound.candidate;
  if (
    c.workflowRunId != null &&
    artifact.workflowRunId != null &&
    c.workflowRunId !== artifact.workflowRunId
  ) {
    return { ok: false, reason: 'candidate_contents_identity_mismatch' };
  }
  if (
    c.zipSha256 != null &&
    artifact.zipSha256 != null &&
    c.zipSha256.toLowerCase() !== artifact.zipSha256.toLowerCase()
  ) {
    return { ok: false, reason: 'candidate_contents_identity_mismatch' };
  }
  if (
    c.commitOrWriteTime != null &&
    artifact.commitOrWriteTime != null &&
    c.commitOrWriteTime !== artifact.commitOrWriteTime
  ) {
    return { ok: false, reason: 'candidate_contents_timing_mismatch' };
  }
  if (
    c.artifactAvailableAt != null &&
    artifact.artifactAvailableAt != null &&
    c.artifactAvailableAt !== artifact.artifactAvailableAt
  ) {
    return { ok: false, reason: 'candidate_contents_timing_mismatch' };
  }
  // Listing identity present → artifact must carry matching facts.
  if (c.workflowRunId != null && artifact.workflowRunId !== c.workflowRunId) {
    return { ok: false, reason: 'candidate_contents_identity_mismatch' };
  }
  if (
    c.zipSha256 != null &&
    (artifact.zipSha256 == null ||
      artifact.zipSha256.toLowerCase() !== c.zipSha256.toLowerCase())
  ) {
    return { ok: false, reason: 'candidate_contents_identity_mismatch' };
  }

  if (!artifact.writesTeamSeasonRatings) {
    return { ok: true, affects: false };
  }
  if (
    artifact.writtenSeason !== bound.season ||
    artifact.writtenModelVersion !== bound.modelVersion
  ) {
    // Writes a different cohort — does not affect the bound snapshot.
    return { ok: true, affects: false };
  }
  if (
    artifact.writtenRatingFingerprint == null ||
    !HEX64.test(artifact.writtenRatingFingerprint)
  ) {
    return { ok: false, reason: 'candidate_contents_fingerprint_missing' };
  }
  // Same fingerprint ⇒ same bound snapshot (non-effect). Different ⇒ affects.
  return {
    ok: true,
    affects:
      artifact.writtenRatingFingerprint.toLowerCase() !==
      bound.ratingFingerprint.toLowerCase(),
  };
}

function validateExternalEffectApproval(input: {
  evidenceDigest: string;
  evidenceBytes: Buffer;
  evidence: MlCal1G5IndependentEffectEvidence;
  approvedDigests: Record<string, string> | null | undefined;
}): { ok: true } | { ok: false; reason: string } {
  const map = input.approvedDigests ?? null;
  if (map == null || typeof map !== 'object') {
    return { ok: false, reason: 'effect_evidence_approval_missing' };
  }
  const approval = map[input.evidenceDigest] ?? map[input.evidenceDigest.toLowerCase()];
  if (typeof approval !== 'string' || !HEX64.test(approval)) {
    return { ok: false, reason: 'effect_evidence_approval_missing' };
  }
  const approvalLc = approval.toLowerCase();
  // Self-hash cannot approve.
  if (approvalLc === input.evidenceDigest.toLowerCase()) {
    return { ok: false, reason: 'effect_evidence_approval_self_hash' };
  }
  // Digest copied from the evidence envelope cannot approve.
  const envelopeText = input.evidenceBytes.toString('utf8');
  if (envelopeText.toLowerCase().includes(approvalLc)) {
    return { ok: false, reason: 'effect_evidence_approval_from_envelope' };
  }
  void input.evidence;
  return { ok: true };
}

function bindReviewedEffectEvidence(
  evidence: MlCal1G5IndependentEffectEvidence,
  bound: MlCal1G5BoundEffectContext
): { ok: true } | { ok: false; reason: string } {
  if (evidence.boundSidecarDigest !== bound.sidecarDigest.toLowerCase()) {
    return { ok: false, reason: 'effect_evidence_sidecar_mismatch' };
  }
  if (
    evidence.boundRatingFingerprint !== bound.ratingFingerprint.toLowerCase()
  ) {
    return { ok: false, reason: 'effect_evidence_fingerprint_mismatch' };
  }
  const evStart = parseIsoMs(evidence.intervalStartInclusive);
  const evEnd = parseIsoMs(evidence.intervalEndInclusive);
  const winStart = parseIsoMs(bound.searchWindowStartInclusive);
  const winEnd = parseIsoMs(bound.searchWindowEndInclusive);
  if (evStart == null || evEnd == null || winStart == null || winEnd == null) {
    return { ok: false, reason: 'effect_evidence_interval_missing' };
  }
  if (evStart > evEnd) {
    return { ok: false, reason: 'effect_evidence_interval_reversed' };
  }
  // Reviewed interval must cover the inventory search window.
  if (evStart > winStart || evEnd < winEnd) {
    return { ok: false, reason: 'effect_evidence_interval_mismatch' };
  }
  return { ok: true };
}

export function evaluateDispositionEvidence(input: {
  disposition: unknown;
  candidateKey: string;
  candidateContentsDigest: string | null;
  independentEffectEvidenceDigest: string | null;
  deletionNoticeDigest: string | null;
  commitOrWriteTime: string | null;
  retainDir: string;
  bound: MlCal1G5BoundEffectContext;
  approvedIndependentEffectEvidenceDigests?: Record<string, string> | null;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isValidG5Disposition(input.disposition)) {
    return { ok: false, reasons: ['lineage_disposition_enum_invalid'] };
  }
  const disposition = input.disposition;

  let contentsOk = false;
  let contentsAffects: boolean | null = null;
  if (
    typeof input.candidateContentsDigest === 'string' &&
    HEX64.test(input.candidateContentsDigest)
  ) {
    const bytes = loadRetainedBytesByDigest({
      retainDir: input.retainDir,
      digest: input.candidateContentsDigest,
    });
    if (!bytes) {
      reasons.push('lineage_candidate_unresolved');
    } else {
      const parsed = parseWriteEffectArtifact(bytes, input.candidateKey);
      if (parsed.ok === false) {
        reasons.push(parsed.reason);
        reasons.push('lineage_candidate_unresolved');
      } else {
        const derived = deriveAffectsBoundRatingsFromArtifact(
          parsed.artifact,
          input.bound
        );
        if (derived.ok === false) {
          reasons.push(derived.reason);
          reasons.push('lineage_candidate_unresolved');
        } else {
          contentsOk = true;
          contentsAffects = derived.affects;
        }
      }
    }
  }

  let effectOk = false;
  let effect: MlCal1G5IndependentEffectEvidence | null = null;
  if (
    typeof input.independentEffectEvidenceDigest === 'string' &&
    HEX64.test(input.independentEffectEvidenceDigest)
  ) {
    const bytes = loadRetainedBytesByDigest({
      retainDir: input.retainDir,
      digest: input.independentEffectEvidenceDigest,
    });
    if (!bytes) {
      reasons.push('lineage_candidate_unresolved');
    } else {
      const evidenceDigest = sha256Hex(bytes);
      const parsed = parseIndependentEffectEvidence(bytes, input.candidateKey);
      if (parsed.ok === false) {
        reasons.push(parsed.reason);
        reasons.push('lineage_candidate_unresolved');
      } else {
        const approval = validateExternalEffectApproval({
          evidenceDigest,
          evidenceBytes: bytes,
          evidence: parsed.evidence,
          approvedDigests: input.approvedIndependentEffectEvidenceDigests,
        });
        if (approval.ok === false) {
          reasons.push(approval.reason);
          reasons.push('lineage_candidate_unresolved');
        } else {
          const boundCheck = bindReviewedEffectEvidence(
            parsed.evidence,
            input.bound
          );
          if (boundCheck.ok === false) {
            reasons.push(boundCheck.reason);
            reasons.push('lineage_candidate_unresolved');
          } else {
            effectOk = true;
            effect = parsed.evidence;
          }
        }
      }
    }
  }

  // Contradictory derived contents vs reviewed effect → unresolved.
  if (
    contentsOk &&
    effectOk &&
    contentsAffects != null &&
    effect != null &&
    contentsAffects !== effect.affectsBoundRatings
  ) {
    reasons.push('lineage_disposition_evidence_contradiction');
    reasons.push('lineage_candidate_unresolved');
    return { ok: false, reasons: [...new Set(reasons)] };
  }

  const noticeOnly =
    typeof input.deletionNoticeDigest === 'string' &&
    HEX64.test(input.deletionNoticeDigest) &&
    !contentsOk &&
    !effectOk;

  if (disposition === 'not_invalidating') {
    const provedNonEffectByContents =
      contentsOk && contentsAffects === false;
    const provedNonEffectByEffect =
      effectOk &&
      effect != null &&
      effect.provesNonEffect === true &&
      effect.affectsBoundRatings === false;
    if (
      (contentsOk && contentsAffects === true) ||
      (effectOk && effect != null && effect.affectsBoundRatings === true)
    ) {
      reasons.push('lineage_disposition_evidence_contradiction');
      reasons.push('lineage_candidate_unresolved');
    } else if (!provedNonEffectByContents && !provedNonEffectByEffect) {
      reasons.push(
        noticeOnly
          ? 'lineage_deleted_candidate_unresolved'
          : 'lineage_candidate_unresolved'
      );
    }
  } else if (disposition === 'invalidating') {
    const provedAffect =
      (contentsOk && contentsAffects === true) ||
      (effectOk && effect != null && effect.affectsBoundRatings === true);
    if (
      (contentsOk && contentsAffects === false) ||
      (effectOk &&
        effect != null &&
        effect.affectsBoundRatings === false &&
        effect.provesNonEffect === true)
    ) {
      reasons.push('lineage_disposition_evidence_contradiction');
      reasons.push('lineage_candidate_unresolved');
    } else if (!provedAffect) {
      reasons.push('lineage_candidate_unresolved');
    }
  } else if (disposition === 'unresolved') {
    reasons.push(
      noticeOnly
        ? 'lineage_deleted_candidate_unresolved'
        : 'lineage_candidate_unresolved'
    );
  }

  if (
    disposition === 'not_invalidating' &&
    (input.commitOrWriteTime == null ||
      parseIsoMs(input.commitOrWriteTime) == null) &&
    !(
      effectOk &&
      effect != null &&
      effect.provesNonEffect === true &&
      effect.affectsBoundRatings === false
    ) &&
    !(contentsOk && contentsAffects === false)
  ) {
    reasons.push('lineage_candidate_unresolved');
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Compute bound rating fingerprint from sidecar observed rows. */
export function computeSidecarRatingFingerprint(
  packageDir: string
): string | null {
  const sidecarPath = path.join(packageDir, 'binding-sidecar.json');
  if (!fs.existsSync(sidecarPath)) return null;
  try {
    const sc = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as {
      bindingObservation?: { rows?: MlCal1BindingObservedRatingRow[] };
    };
    const rows = sc.bindingObservation?.rows;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const exportedByTeam: Record<
      string,
      ReturnType<typeof exportRatingInput>
    > = {};
    for (const row of rows) {
      const exported = exportRatingInput(reconstructRawRatingRow(row));
      exportedByTeam[row.teamId] = exported;
    }
    return buildRatingFingerprint(exportedByTeam);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Package structural validation (§2)
// ---------------------------------------------------------------------------

export function validateG5PackageStructural(input: {
  observationId: string;
  packageDir: string;
  claimedApprovedObservationPackageDigest?: string | null;
  pinDefinedPackageIdentityDigest?: string | null;
  wholePackageApprovalEnabled?: boolean;
}): {
  ok: boolean;
  reasons: string[];
  fixtureProvenanceRetained: boolean;
  sidecarDigest: string | null;
  manifest: Record<string, unknown> | null;
  memberRecords: Array<Omit<MlCal1G5RetrievedObject, 'bytes'>>;
  packageIdentityDigest: string | null;
} {
  const reasons: string[] = [];
  const memberRecords: Array<Omit<MlCal1G5RetrievedObject, 'bytes'>> = [];
  if (!isSafeG4ObservationId(input.observationId)) {
    return {
      ok: false,
      reasons: ['unsafe_observation_id'],
      fixtureProvenanceRetained: false,
      sidecarDigest: null,
      manifest: null,
      memberRecords,
      packageIdentityDigest: null,
    };
  }
  const dir = path.resolve(input.packageDir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return {
      ok: false,
      reasons: ['package_dir_missing'],
      fixtureProvenanceRetained: false,
      sidecarDigest: null,
      manifest: null,
      memberRecords,
      packageIdentityDigest: null,
    };
  }
  const baseName = path.basename(dir);
  if (baseName !== input.observationId) {
    reasons.push('observation_id_dirname_mismatch');
  }

  const manifestPath = path.join(dir, 'PACKAGE_MANIFEST.json');
  const manifestShaPath = path.join(dir, 'PACKAGE_MANIFEST.sha256');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(manifestShaPath)) {
    reasons.push('package_member_missing');
    return {
      ok: false,
      reasons,
      fixtureProvenanceRetained: false,
      sidecarDigest: null,
      manifest: null,
      memberRecords,
      packageIdentityDigest: null,
    };
  }
  const manifestBytes = fs.readFileSync(manifestPath);
  const declaredManifestSha = fs
    .readFileSync(manifestShaPath, 'utf8')
    .trim()
    .toLowerCase();
  const computedManifestSha = sha256Hex(manifestBytes);
  if (declaredManifestSha !== computedManifestSha) {
    reasons.push('package_member_digest_mismatch');
  }
  memberRecords.push({
    objectClass: 'package_manifest',
    locator: manifestPath,
    byteCount: manifestBytes.length,
    sha256: computedManifestSha,
    retrievedAt: new Date(0).toISOString(),
  });

  let manifest: Record<string, unknown> | null = null;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    reasons.push('package_manifest_json_invalid');
    return {
      ok: false,
      reasons,
      fixtureProvenanceRetained: false,
      sidecarDigest: null,
      manifest: null,
      memberRecords,
      packageIdentityDigest: null,
    };
  }

  if (manifest.observationId !== input.observationId) {
    reasons.push('observation_id_manifest_mismatch');
  }
  if (manifest.liveAccepted === true || manifest.approved === true) {
    reasons.push('package_approval_flag_tampered');
  }
  if (manifest.credentialsPresent === true) {
    reasons.push('package_credentials_present');
  }

  const memberDigests = manifest.memberDigests as
    | Record<string, { sha256?: string; byteCount?: number }>
    | undefined;
  if (memberDigests == null || typeof memberDigests !== 'object') {
    reasons.push('package_member_digests_missing');
    return {
      ok: false,
      reasons,
      fixtureProvenanceRetained: false,
      sidecarDigest: null,
      manifest,
      memberRecords,
      packageIdentityDigest: null,
    };
  }

  for (const name of Object.keys(memberDigests)) {
    if (!isSafeG5PackageMemberName(name)) {
      reasons.push('unsafe_package_member_path');
    }
  }

  const namesOnDisk = fs
    .readdirSync(dir)
    .filter((n) => fs.statSync(path.join(dir, n)).isFile());
  for (const name of namesOnDisk) {
    if (
      name !== 'PACKAGE_MANIFEST.json' &&
      name !== 'PACKAGE_MANIFEST.sha256' &&
      !isSafeG5PackageMemberName(name)
    ) {
      reasons.push('unsafe_package_member_path');
    }
  }

  let fixtureProvenanceRetained = false;
  let hasProvenance = false;
  for (const [name, meta] of Object.entries(memberDigests)) {
    if (!isSafeG5PackageMemberName(name)) continue;
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) {
      reasons.push('package_member_missing');
      continue;
    }
    const bytes = fs.readFileSync(p);
    const digest = sha256Hex(bytes);
    if (typeof meta.byteCount !== 'number' || meta.byteCount !== bytes.length) {
      reasons.push('package_member_bytecount_mismatch');
    }
    if (typeof meta.sha256 !== 'string' || meta.sha256.toLowerCase() !== digest) {
      reasons.push('package_member_digest_mismatch');
    }
    memberRecords.push({
      objectClass: 'package_member',
      locator: p,
      byteCount: bytes.length,
      sha256: digest,
      retrievedAt: new Date(0).toISOString(),
    });
    if (name === 'PROVENANCE.json') {
      hasProvenance = true;
      fixtureProvenanceRetained = true;
    }
  }

  // Required members (report basename resolved from sidecar — R5).
  for (const req of [
    'archive.zip',
    'binding-sidecar.json',
    'observer-run-metadata.json',
    'design-correspondence.json',
  ]) {
    if (!(req in memberDigests)) {
      reasons.push('package_member_missing');
    }
  }

  // R5: package schema + design/acceptance/base identity correspondence.
  if (manifest.schemaVersion !== ML_CAL_1_G4_OBSERVER_PACKAGE_SCHEMA) {
    reasons.push('package_schema_mismatch');
  }
  if (manifest.kind !== 'lifecycle-binding-observer-package') {
    reasons.push('package_schema_mismatch');
  }
  if (manifest.designOnDiskSha256 !== ML_CAL_1_G4_DESIGN_ON_DISK_SHA256) {
    reasons.push('package_design_identity_mismatch');
  }
  if (manifest.acceptanceUploadSha256 !== ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256) {
    reasons.push('package_design_identity_mismatch');
  }
  if (manifest.baseG3Tip !== ML_CAL_1_G4_BASE_G3_TIP) {
    reasons.push('package_design_identity_mismatch');
  }
  // Missing required identity fields must reject (not skip).
  for (const field of [
    'schemaVersion',
    'kind',
    'designOnDiskSha256',
    'acceptanceUploadSha256',
    'baseG3Tip',
    'sidecarDigest',
  ]) {
    if (manifest[field] == null || manifest[field] === '') {
      reasons.push('package_required_field_missing');
    }
  }

  const sidecarPath = path.join(dir, 'binding-sidecar.json');
  let sidecarDigest: string | null = null;
  if (fs.existsSync(sidecarPath)) {
    const sidecarBytes = fs.readFileSync(sidecarPath);
    sidecarDigest = sha256Hex(sidecarBytes);
    if (
      typeof manifest.sidecarDigest === 'string' &&
      manifest.sidecarDigest.toLowerCase() !== sidecarDigest
    ) {
      reasons.push('package_member_digest_mismatch');
    }
    const md = memberDigests['binding-sidecar.json'];
    if (md && typeof md.sha256 === 'string' && md.sha256.toLowerCase() !== sidecarDigest) {
      reasons.push('package_member_digest_mismatch');
    }

    try {
      const sc = JSON.parse(sidecarBytes.toString('utf8')) as Record<
        string,
        unknown
      >;
      const archive = sc.acceptedArchive as
        | {
            github?: {
              reportMemberPath?: string;
              zipSha256?: string;
              reportMemberSha256?: string;
              reportByteCount?: number;
              workflowRunCompletedAt?: string | null;
              artifactCreatedAt?: string | null;
            };
            lifecycleProducerSha?: string;
          }
        | undefined;
      const obs = sc.bindingObservation as
        | {
            observationEndTime?: string;
            bindingSnapshotReferenceTime?: string;
            bindingObserverSha?: string;
            season?: number;
            modelVersion?: string;
            readMode?: string;
          }
        | undefined;

      // R5: required sidecar fields — missing rejects.
      if (
        !archive?.github?.reportMemberPath ||
        !archive.github.zipSha256 ||
        !archive.github.reportMemberSha256 ||
        typeof archive.github.reportByteCount !== 'number' ||
        !archive.github.workflowRunCompletedAt ||
        !archive.github.artifactCreatedAt ||
        !archive.lifecycleProducerSha ||
        !obs?.observationEndTime ||
        !obs.bindingSnapshotReferenceTime ||
        !obs.bindingObserverSha ||
        obs.season == null ||
        !obs.modelVersion
      ) {
        reasons.push('package_required_field_missing');
      } else {
        const reportName = path.basename(archive.github.reportMemberPath);
        if (!(reportName in memberDigests)) {
          reasons.push('package_member_missing');
        } else {
          const reportPath = path.join(dir, reportName);
          if (!fs.existsSync(reportPath)) {
            reasons.push('package_member_missing');
          } else {
            const reportBytes = fs.readFileSync(reportPath);
            const reportSha = sha256Hex(reportBytes);
            if (reportSha !== archive.github.reportMemberSha256.toLowerCase()) {
              reasons.push('package_archive_sidecar_identity_mismatch');
            }
            if (reportBytes.length !== archive.github.reportByteCount) {
              reasons.push('package_archive_sidecar_identity_mismatch');
            }
            const declared = memberDigests[reportName];
            if (
              declared &&
              (declared.sha256?.toLowerCase() !== reportSha ||
                declared.byteCount !== reportBytes.length)
            ) {
              reasons.push('package_member_digest_mismatch');
            }
          }
        }
        const zipPath = path.join(dir, 'archive.zip');
        if (fs.existsSync(zipPath)) {
          const zipSha = sha256Hex(fs.readFileSync(zipPath));
          if (zipSha !== archive.github.zipSha256.toLowerCase()) {
            reasons.push('package_archive_sidecar_identity_mismatch');
          }
        }
      }

      // R5-A: observer-run-metadata + design-correspondence required identities.
      const metaPath = path.join(dir, 'observer-run-metadata.json');
      const corrPath = path.join(dir, 'design-correspondence.json');
      if (!fs.existsSync(metaPath) || !fs.existsSync(corrPath)) {
        reasons.push('package_member_missing');
      } else {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Record<
            string,
            unknown
          >;
          const corr = JSON.parse(fs.readFileSync(corrPath, 'utf8')) as Record<
            string,
            unknown
          >;
          if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
            reasons.push('package_required_field_missing');
          } else if (Object.keys(meta).length === 0) {
            reasons.push('package_observer_metadata_empty');
          } else {
            // Required correspondence with retained sidecar — missing rejects.
            if (
              typeof meta.observationEndTime !== 'string' ||
              meta.observationEndTime.length === 0
            ) {
              reasons.push('package_required_field_missing');
            } else if (
              obs?.observationEndTime != null &&
              meta.observationEndTime !== obs.observationEndTime
            ) {
              reasons.push('package_observer_metadata_sidecar_mismatch');
            }
            if (
              typeof meta.bindingSnapshotReferenceTime === 'string' &&
              obs?.bindingSnapshotReferenceTime != null &&
              meta.bindingSnapshotReferenceTime !==
                obs.bindingSnapshotReferenceTime
            ) {
              reasons.push('package_observer_metadata_sidecar_mismatch');
            }
            if (
              typeof meta.bindingObserverSha === 'string' &&
              obs?.bindingObserverSha != null &&
              meta.bindingObserverSha !== obs.bindingObserverSha
            ) {
              reasons.push('package_observer_metadata_sidecar_mismatch');
            }
            if (
              typeof meta.lifecycleProducerSha === 'string' &&
              archive?.lifecycleProducerSha != null &&
              meta.lifecycleProducerSha !== archive.lifecycleProducerSha
            ) {
              reasons.push('package_observer_metadata_sidecar_mismatch');
            }
            if (
              typeof meta.observationId === 'string' &&
              meta.observationId !== input.observationId
            ) {
              reasons.push('package_observer_metadata_sidecar_mismatch');
            }
            if (
              typeof meta.season === 'number' &&
              obs?.season != null &&
              meta.season !== obs.season
            ) {
              reasons.push('package_observer_metadata_sidecar_mismatch');
            }
            if (
              typeof meta.modelVersion === 'string' &&
              obs?.modelVersion != null &&
              meta.modelVersion !== obs.modelVersion
            ) {
              reasons.push('package_observer_metadata_sidecar_mismatch');
            }
          }

          // Supported correspondence formats (G5 or accepted G4): require design
          // pin AND base tip together — base-only or design-only is incomplete.
          if (corr == null || typeof corr !== 'object' || Array.isArray(corr)) {
            reasons.push('package_required_field_missing');
          } else {
            const designPin =
              typeof corr.designSha256 === 'string' && corr.designSha256.length > 0
                ? corr.designSha256
                : typeof corr.onDiskDesignSha256 === 'string' &&
                    corr.onDiskDesignSha256.length > 0
                  ? corr.onDiskDesignSha256
                  : null;
            const baseTip =
              typeof corr.baseG4Tip === 'string' && corr.baseG4Tip.length > 0
                ? { kind: 'g4' as const, value: corr.baseG4Tip }
                : typeof corr.baseG3Tip === 'string' && corr.baseG3Tip.length > 0
                  ? { kind: 'g3' as const, value: corr.baseG3Tip }
                  : null;

            if (designPin == null || baseTip == null) {
              reasons.push('package_design_correspondence_incomplete');
            } else {
              if (
                designPin !== ML_CAL_1_G5_DESIGN_ON_DISK_SHA256 &&
                designPin !== ML_CAL_1_G4_DESIGN_ON_DISK_SHA256
              ) {
                reasons.push('package_design_identity_mismatch');
              }
              if (
                baseTip.kind === 'g4' &&
                baseTip.value !== ML_CAL_1_G5_BASE_G4_TIP
              ) {
                reasons.push('package_design_identity_mismatch');
              }
              if (
                baseTip.kind === 'g3' &&
                baseTip.value !== ML_CAL_1_G4_BASE_G3_TIP
              ) {
                reasons.push('package_design_identity_mismatch');
              }
            }
            if (
              typeof corr.acceptanceUploadSha256 === 'string' &&
              corr.acceptanceUploadSha256 !==
                ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256
            ) {
              reasons.push('package_design_identity_mismatch');
            }
          }
        } catch {
          reasons.push('package_required_field_missing');
        }
      }

      if (
        sc.mode === 'fixture_hypothetical' ||
        obs?.readMode === 'fixture_injected'
      ) {
        fixtureProvenanceRetained = true;
        if (!hasProvenance) {
          reasons.push('package_member_missing');
        }
      }
    } catch {
      reasons.push('package_member_digest_mismatch');
    }
  } else {
    reasons.push('package_member_missing');
  }

  // Structural package identity (for compare only — not approval).
  const identityPayload = Buffer.from(
    `${stableStringify({
      observationId: input.observationId,
      memberDigests,
      sidecarDigest,
      manifestSha256: computedManifestSha,
    })}\n`,
    'utf8'
  );
  const packageIdentityDigest = sha256Hex(identityPayload);

  // F5: whole-package approval remains unavailable until independently reviewed.
  // Any claim (including matching self-hash / pin) is rejected.
  const approvalClaimed =
    typeof input.claimedApprovedObservationPackageDigest === 'string' &&
    input.claimedApprovedObservationPackageDigest.length > 0;
  if (approvalClaimed || input.wholePackageApprovalEnabled === true) {
    reasons.push('observation_package_approval_disabled');
    if (approvalClaimed && input.pinDefinedPackageIdentityDigest == null) {
      reasons.push('observation_package_approval_self_hash_rejected');
    }
  }
  void packageIdentityDigest;

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    fixtureProvenanceRetained,
    sidecarDigest,
    manifest,
    memberRecords,
    packageIdentityDigest,
  };
}

// ---------------------------------------------------------------------------
// Inventory parse + completeness recompute
// ---------------------------------------------------------------------------

export function parseLineageInventory(
  bytes: Buffer
):
  | { ok: true; inventory: MlCal1G5LineageInventory }
  | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, reason: 'inventory_json_invalid' };
  }
  if (parsed == null || typeof parsed !== 'object') {
    return { ok: false, reason: 'inventory_not_object' };
  }
  const o = parsed as MlCal1G5LineageInventory;
  if (o.schemaVersion !== ML_CAL_1_G5_INVENTORY_SCHEMA) {
    return { ok: false, reason: 'inventory_schema_mismatch' };
  }
  if (o.kind !== 'lifecycle-binding-lineage-inventory') {
    return { ok: false, reason: 'inventory_kind_mismatch' };
  }
  if (!Array.isArray(o.sourcesSearched) || !Array.isArray(o.requiredSourceCatalog)) {
    return { ok: false, reason: 'inventory_sources_missing' };
  }
  if (!Array.isArray(o.invalidatingCandidateArtifacts)) {
    return { ok: false, reason: 'inventory_candidates_missing' };
  }
  return { ok: true, inventory: o };
}

function recomputePaginationComplete(input: {
  source: MlCal1G5InventorySourceSearched;
  retainDir: string;
}): { complete: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const p = input.source.pagination;
  if (input.source.failed || input.source.unavailable) {
    return { complete: false, reasons: ['lineage_search_incomplete'] };
  }
  if (!Array.isArray(p.pageDigests) || p.pageDigests.length !== p.pagesRetrieved) {
    reasons.push('lineage_search_incomplete');
  }
  if (p.pagesRetrieved < 1 || (p.pageDigests?.length ?? 0) < 1) {
    reasons.push('lineage_search_incomplete');
  }

  const pages: Array<{ digest: string; page: MlCal1G5RetainedListingPage }> = [];
  for (const d of p.pageDigests ?? []) {
    const bytes = loadRetainedBytesByDigest({
      retainDir: input.retainDir,
      digest: d,
    });
    if (!bytes) {
      reasons.push('lineage_search_incomplete');
      continue;
    }
    const parsed = parseRetainedListingPage(bytes);
    if (parsed.ok === false) {
      reasons.push(parsed.reason);
      continue;
    }
    if (parsed.page.sourceId !== input.source.sourceId) {
      reasons.push('lineage_search_incomplete');
    }
    // Declared emptyResult must match candidate count (F2).
    if (parsed.page.emptyResult === true && parsed.page.candidates.length > 0) {
      reasons.push('lineage_pagination_empty_result_mismatch');
    }
    if (
      parsed.page.emptyResult !== true &&
      parsed.page.candidates.length === 0 &&
      p.pagesRetrieved === 1
    ) {
      // Single empty page must declare emptyResult.
      reasons.push('lineage_pagination_empty_result_mismatch');
    }
    pages.push({ digest: d, page: parsed.page });
  }

  // Sequence + continuation chain from retained page content (F2).
  pages.sort((a, b) => a.page.pageIndex - b.page.pageIndex);
  if (pages.length > 0) {
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].page.pageIndex !== i) {
        reasons.push('lineage_pagination_sequence_gap');
      }
    }
    for (let i = 0; i < pages.length - 1; i++) {
      const cur = pages[i].page;
      const next = pages[i + 1].page;
      if (cur.nextPageToken == null || cur.nextPageToken !== next.pageToken) {
        reasons.push('lineage_pagination_chain_broken');
      }
    }
    const last = pages[pages.length - 1].page;
    if (last.nextPageToken != null) {
      reasons.push('lineage_search_incomplete');
    }
    // Declared source-level nextPageToken must agree with last retained page.
    if (p.nextPageToken !== last.nextPageToken) {
      reasons.push('lineage_pagination_declared_token_mismatch');
    }
  } else if (p.nextPageToken != null) {
    reasons.push('lineage_search_incomplete');
  }

  // Declared resultCount must equal sum of retained page candidates when complete.
  if (pages.length === p.pagesRetrieved && pages.length > 0) {
    const sum = pages.reduce((n, x) => n + x.page.candidates.length, 0);
    if (input.source.resultCount !== sum) {
      reasons.push('lineage_pagination_result_count_mismatch');
    }
  }

  const recomputed =
    reasons.length === 0 &&
    p.nextPageToken == null &&
    p.pagesRetrieved >= 1 &&
    p.pageDigests.length === p.pagesRetrieved &&
    pages.length === p.pagesRetrieved;
  if (p.complete !== recomputed) {
    reasons.push('lineage_inventory_declaration_mismatch');
  }
  return {
    complete: reasons.length === 0 && recomputed,
    reasons: [...new Set(reasons)],
  };
}

export function recomputeInventoryCompleteness(input: {
  inventory: MlCal1G5LineageInventory;
  retainDir: string;
  attestationCheckedThroughTime?: string | null;
  bindingSnapshotReferenceTime?: string | null;
  observationEndTime?: string | null;
  observationStartTime?: string | null;
  nowCeiling: string;
  workflowRunCompletedAt: string;
  artifactCreatedAt: string;
  /** Required for R2-A derivation / reviewed-effect binding. */
  boundSidecarDigest: string | null;
  boundRatingFingerprint: string | null;
  approvedIndependentEffectEvidenceDigests?: Record<string, string> | null;
}): {
  recomputedSearchComplete: boolean;
  recomputedNoneFoundPermitted: boolean;
  reasons: string[];
  derivedCandidateCount: number;
  unresolvedCandidateKeys: string[];
} {
  const reasons: string[] = [];
  const unresolvedCandidateKeys: string[] = [];
  const inv = input.inventory;

  const runDone = parseIsoMs(input.workflowRunCompletedAt);
  const artCreated = parseIsoMs(input.artifactCreatedAt);
  if (runDone == null || artCreated == null) {
    reasons.push('archive_chronology_missing');
  }
  const expectedStartMs =
    runDone != null && artCreated != null ? Math.min(runDone, artCreated) : null;
  const declaredStart = parseIsoMs(inv.searchWindowStartInclusive);
  if (
    expectedStartMs != null &&
    declaredStart != null &&
    declaredStart !== expectedStartMs
  ) {
    reasons.push('lineage_search_window_start_mismatch');
  }

  const endMs = parseIsoMs(inv.searchWindowEndInclusive);
  if (endMs == null) {
    reasons.push('lineage_search_window_unparseable');
  }
  if (
    input.attestationCheckedThroughTime != null &&
    inv.searchWindowEndInclusive !== input.attestationCheckedThroughTime
  ) {
    reasons.push('lineage_search_window_end_mismatch');
  }

  // F1: coverage times are required (not optional skips).
  const snap = parseIsoMs(input.bindingSnapshotReferenceTime ?? null);
  const obsEnd = parseIsoMs(input.observationEndTime ?? null);
  if (input.bindingSnapshotReferenceTime == null || snap == null) {
    reasons.push('lineage_coverage_time_missing');
  }
  if (input.observationEndTime == null || obsEnd == null) {
    reasons.push('lineage_coverage_time_missing');
  }
  if (
    input.attestationCheckedThroughTime == null ||
    parseIsoMs(input.attestationCheckedThroughTime) == null
  ) {
    reasons.push('lineage_coverage_time_missing');
  }
  if (endMs != null && snap != null && endMs < snap) {
    reasons.push('lineage_checked_through_too_early');
  }
  if (endMs != null && obsEnd != null && endMs < obsEnd) {
    reasons.push('lineage_checked_through_too_early');
  }

  const assembled = parseIsoMs(inv.inventoryAssembledAt);
  const ceiling = parseIsoMs(input.nowCeiling);
  if (assembled == null || ceiling == null) {
    reasons.push('lineage_coverage_time_missing');
  }
  if (assembled != null && ceiling != null && assembled > ceiling) {
    reasons.push('lineage_inventory_assembled_after_ceiling');
  }

  // R1: chronology through coverage end and nowCeiling; no future coverage /
  // reversed chronology beyond retained assembly evidence.
  if (declaredStart != null && endMs != null && declaredStart > endMs) {
    reasons.push('lineage_chronology_reversed');
  }
  if (endMs != null && ceiling != null && endMs > ceiling) {
    reasons.push('lineage_coverage_after_ceiling');
  }
  if (
    input.attestationCheckedThroughTime != null &&
    parseIsoMs(input.attestationCheckedThroughTime) != null &&
    ceiling != null &&
    parseIsoMs(input.attestationCheckedThroughTime)! > ceiling
  ) {
    reasons.push('lineage_coverage_after_ceiling');
  }
  if (endMs != null && assembled != null && endMs > assembled) {
    reasons.push('lineage_coverage_beyond_inventory_evidence');
  }
  if (declaredStart != null && assembled != null && declaredStart > assembled) {
    reasons.push('lineage_chronology_reversed');
  }
  if (snap != null && obsEnd != null && snap > obsEnd) {
    // Snapshot after observation end is reversed coverage chronology.
    reasons.push('lineage_chronology_reversed');
  }

  if (!catalogEquals(inv.requiredSourceCatalog)) {
    reasons.push('lineage_search_incomplete');
  }
  if (!Array.isArray(inv.sourcesSearched) || inv.sourcesSearched.length === 0) {
    reasons.push('lineage_search_incomplete');
  }

  const bySource = new Map<string, MlCal1G5InventorySourceSearched>();
  for (const s of inv.sourcesSearched ?? []) {
    if (bySource.has(s.sourceId)) {
      reasons.push('lineage_search_incomplete');
    }
    bySource.set(s.sourceId, s);
  }
  for (const id of ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG) {
    if (!bySource.has(id)) {
      reasons.push('lineage_search_incomplete');
    }
  }
  for (const id of bySource.keys()) {
    if (
      !(ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG as readonly string[]).includes(id)
    ) {
      reasons.push('lineage_search_incomplete');
    }
  }

  if (Array.isArray(inv.failedSearches) && inv.failedSearches.length > 0) {
    reasons.push('lineage_search_incomplete');
  }

  const allPageDigests: string[] = [];
  for (const s of inv.sourcesSearched ?? []) {
    if (
      s.timeBounds?.endInclusive !== inv.searchWindowEndInclusive ||
      s.timeBounds?.startInclusive !== inv.searchWindowStartInclusive
    ) {
      reasons.push('lineage_search_window_end_mismatch');
    }
    const pageCheck = recomputePaginationComplete({
      source: s,
      retainDir: input.retainDir,
    });
    if (!pageCheck.complete) {
      reasons.push(...pageCheck.reasons);
    }
    allPageDigests.push(...(s.pagination?.pageDigests ?? []));
  }

  const derived = deriveCandidatesFromRetainedPages({
    pageDigests: allPageDigests,
    retainDir: input.retainDir,
    searchWindowStartInclusive: inv.searchWindowStartInclusive,
    searchWindowEndInclusive: inv.searchWindowEndInclusive,
  });
  if (!derived.ok) {
    reasons.push(...derived.reasons);
  }

  const inventoryKeys = new Set(
    (inv.invalidatingCandidateArtifacts ?? []).map((c) => c.candidateKey)
  );
  const derivedSet = new Set(derived.derivedKeys);

  for (const key of derivedSet) {
    if (!inventoryKeys.has(key)) {
      reasons.push('lineage_candidate_omitted_from_inventory');
    }
  }
  for (const key of inventoryKeys) {
    if (!derivedSet.has(key)) {
      reasons.push('lineage_candidate_not_in_retained_listings');
    }
  }

  let hasInvalidating = false;
  for (const c of inv.invalidatingCandidateArtifacts ?? []) {
    // Late upload must not drop in-window write — if write in window, candidate must stay.
    const writeMs = parseIsoMs(c.commitOrWriteTime);
    const availMs = parseIsoMs(c.artifactAvailableAt);
    if (
      writeMs != null &&
      endMs != null &&
      declaredStart != null &&
      writeMs >= declaredStart &&
      writeMs <= endMs &&
      availMs != null &&
      availMs > endMs &&
      !derivedSet.has(c.candidateKey)
    ) {
      reasons.push('lineage_candidate_omitted_from_inventory');
    }

    // R3: reconcile inventory facts against authoritative retained listing
    // (source/page, run ID, ZIP, timing) — candidateKey alone is insufficient.
    const listed = derived.byKey.get(c.candidateKey);
    if (listed) {
      if (c.listingPageDigest !== listed.listingPageDigest) {
        reasons.push('lineage_candidate_listing_provenance_mismatch');
      }
      if (c.sourceId) {
        const pageBytes = loadRetainedBytesByDigest({
          retainDir: input.retainDir,
          digest: listed.listingPageDigest,
        });
        if (pageBytes) {
          const pageParsed = parseRetainedListingPage(pageBytes);
          if (
            pageParsed.ok &&
            pageParsed.page.sourceId !== c.sourceId
          ) {
            reasons.push('lineage_candidate_listing_provenance_mismatch');
          }
        }
      }
      const lc = listed.candidate;
      // Listing is authoritative: inventory must carry matching facts (key alone insufficient).
      const fieldMismatch =
        (lc.workflowRunId != null && c.workflowRunId !== lc.workflowRunId) ||
        (lc.zipSha256 != null && c.zipSha256 !== lc.zipSha256) ||
        (lc.completedThroughWeek != null &&
          c.completedThroughWeek !== lc.completedThroughWeek) ||
        (lc.commitOrWriteTime != null &&
          c.commitOrWriteTime !== lc.commitOrWriteTime) ||
        (lc.artifactAvailableAt != null &&
          c.artifactAvailableAt !== lc.artifactAvailableAt) ||
        (lc.runStartedAt != null && c.runStartedAt !== lc.runStartedAt) ||
        (lc.runEndedAt != null && c.runEndedAt !== lc.runEndedAt) ||
        (c.workflowRunId != null &&
          lc.workflowRunId != null &&
          c.workflowRunId !== lc.workflowRunId) ||
        (c.zipSha256 != null &&
          lc.zipSha256 != null &&
          c.zipSha256 !== lc.zipSha256);
      if (fieldMismatch) {
        reasons.push('lineage_candidate_listing_fact_mismatch');
      }
    }

    if (
      input.boundSidecarDigest == null ||
      input.boundRatingFingerprint == null ||
      input.observationEndTime == null ||
      input.bindingSnapshotReferenceTime == null
    ) {
      reasons.push('lineage_bound_effect_context_missing');
      unresolvedCandidateKeys.push(c.candidateKey);
      continue;
    }
    const ev = evaluateDispositionEvidence({
      disposition: c.resolvedDisposition,
      candidateKey: c.candidateKey,
      candidateContentsDigest: c.candidateContentsDigest,
      independentEffectEvidenceDigest: c.independentEffectEvidenceDigest,
      deletionNoticeDigest: c.deletionNoticeDigest,
      commitOrWriteTime: c.commitOrWriteTime,
      retainDir: input.retainDir,
      bound: {
        sidecarDigest: input.boundSidecarDigest,
        ratingFingerprint: input.boundRatingFingerprint,
        season: inv.season,
        modelVersion: inv.modelVersion,
        observationStartTime: input.observationStartTime ?? null,
        observationEndTime: input.observationEndTime,
        bindingSnapshotReferenceTime: input.bindingSnapshotReferenceTime,
        searchWindowStartInclusive: inv.searchWindowStartInclusive,
        searchWindowEndInclusive: inv.searchWindowEndInclusive,
        candidate: {
          workflowRunId: c.workflowRunId,
          zipSha256: c.zipSha256,
          commitOrWriteTime: c.commitOrWriteTime,
          artifactAvailableAt: c.artifactAvailableAt,
          completedThroughWeek: c.completedThroughWeek,
        },
      },
      approvedIndependentEffectEvidenceDigests:
        input.approvedIndependentEffectEvidenceDigests,
    });
    if (c.resolvedDisposition === 'invalidating' && ev.ok) {
      hasInvalidating = true;
    }
    if (
      !isValidG5Disposition(c.resolvedDisposition) ||
      c.resolvedDisposition === 'unresolved' ||
      !ev.ok
    ) {
      unresolvedCandidateKeys.push(c.candidateKey);
      reasons.push(...ev.reasons);
    }
    // Higher week alone must not be treated as automatic supersession without disposition evidence.
    if (
      c.eventKind === 'week_alone_supersession' ||
      c.eventKind === 'higher_week_alone'
    ) {
      reasons.push('lineage_week_alone_supersession_forbidden');
      unresolvedCandidateKeys.push(c.candidateKey);
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const recomputedSearchComplete =
    uniqueReasons.filter(
      (r) =>
        r === 'lineage_search_incomplete' ||
        r === 'lineage_candidate_omitted_from_inventory' ||
        r === 'lineage_candidate_not_in_retained_listings' ||
        r === 'lineage_inventory_declaration_mismatch' ||
        r === 'lineage_search_window_end_mismatch' ||
        r === 'lineage_search_window_start_mismatch' ||
        r === 'archive_chronology_missing' ||
        r === 'listing_page_bytes_missing' ||
        r.startsWith('listing_')
    ).length === 0 &&
    unresolvedCandidateKeys.length === 0 &&
    catalogEquals(inv.requiredSourceCatalog) &&
    (inv.failedSearches?.length ?? 0) === 0;

  // Completeness for none_found also requires no unresolved and no invalidating.
  const structuralComplete =
    uniqueReasons.filter(
      (r) =>
        [
          'lineage_search_incomplete',
          'lineage_candidate_omitted_from_inventory',
          'lineage_candidate_not_in_retained_listings',
          'lineage_inventory_declaration_mismatch',
          'lineage_search_window_end_mismatch',
          'lineage_search_window_start_mismatch',
          'archive_chronology_missing',
          'lineage_coverage_time_missing',
          'lineage_candidate_contradictory_duplicate',
          'lineage_candidate_listing_fact_mismatch',
          'lineage_candidate_listing_provenance_mismatch',
          'lineage_chronology_reversed',
          'lineage_coverage_after_ceiling',
          'lineage_coverage_beyond_inventory_evidence',
          'lineage_inventory_assembled_after_ceiling',
          'lineage_pagination_sequence_gap',
          'lineage_pagination_chain_broken',
          'lineage_pagination_declared_token_mismatch',
          'lineage_pagination_result_count_mismatch',
          'lineage_pagination_empty_result_mismatch',
        ].includes(r) ||
        r.startsWith('listing_') ||
        r.startsWith('lineage_pagination_')
    ).length === 0;

  const recomputedNoneFoundPermitted =
    structuralComplete &&
    unresolvedCandidateKeys.length === 0 &&
    !hasInvalidating &&
    !uniqueReasons.includes('lineage_deleted_candidate_unresolved') &&
    !uniqueReasons.includes('lineage_candidate_unresolved') &&
    !uniqueReasons.includes('lineage_disposition_evidence_contradiction') &&
    !uniqueReasons.includes('lineage_week_alone_supersession_forbidden') &&
    !uniqueReasons.includes('lineage_checked_through_too_early') &&
    !uniqueReasons.includes('lineage_chronology_reversed') &&
    !uniqueReasons.includes('lineage_coverage_after_ceiling') &&
    !uniqueReasons.includes('lineage_coverage_beyond_inventory_evidence') &&
    !uniqueReasons.includes('lineage_candidate_listing_fact_mismatch') &&
    !uniqueReasons.includes('lineage_candidate_listing_provenance_mismatch');

  if (inv.searchComplete !== structuralComplete) {
    uniqueReasons.push('lineage_inventory_declaration_mismatch');
  }
  if (inv.noneFoundPermitted !== recomputedNoneFoundPermitted) {
    uniqueReasons.push('lineage_inventory_declaration_mismatch');
  }

  return {
    recomputedSearchComplete: structuralComplete && unresolvedCandidateKeys.length === 0,
    recomputedNoneFoundPermitted,
    reasons: [...new Set(uniqueReasons)],
    derivedCandidateCount: derived.derivedKeys.length,
    unresolvedCandidateKeys: [...new Set(unresolvedCandidateKeys)].sort(),
  };
}

// ---------------------------------------------------------------------------
// G5-PRE entry
// ---------------------------------------------------------------------------

function extractBoundPackageEvidence(input: {
  observationId: string;
  packageDir: string;
  sidecarDigest: string | null;
  memberRecords: Array<Omit<MlCal1G5RetrievedObject, 'bytes'>>;
}): MlCal1G5BoundPackageEvidence {
  const bound: MlCal1G5BoundPackageEvidence = {
    observationId: input.observationId,
    packageDir: path.resolve(input.packageDir),
    zipSha256: null,
    reportMemberSha256: null,
    reportMemberName: null,
    sidecarDigest: input.sidecarDigest,
    sidecarObservationEndTime: null,
    sidecarBindingSnapshotReferenceTime: null,
    sidecarWorkflowRunCompletedAt: null,
    sidecarArtifactCreatedAt: null,
    sidecarLifecycleProducerSha: null,
    sidecarBindingObserverSha: null,
    sidecarSeason: null,
    sidecarModelVersion: null,
    sidecarReportMemberPath: null,
    sidecarZipSha256: null,
    sidecarReportMemberSha256: null,
    sidecarReportByteCount: null,
  };
  for (const m of input.memberRecords) {
    const base = path.basename(m.locator);
    if (base === 'archive.zip') bound.zipSha256 = m.sha256;
    if (base === 'binding-sidecar.json') bound.sidecarDigest = m.sha256;
    if (base.endsWith('.json') && base.startsWith('core-v1-lifecycle-')) {
      bound.reportMemberSha256 = m.sha256;
      bound.reportMemberName = base;
    }
  }
  const sidecarPath = path.join(input.packageDir, 'binding-sidecar.json');
  if (fs.existsSync(sidecarPath)) {
    try {
      const sc = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as {
        acceptedArchive?: {
          github?: {
            workflowRunCompletedAt?: string | null;
            artifactCreatedAt?: string | null;
            reportMemberPath?: string;
            zipSha256?: string;
            reportMemberSha256?: string;
            reportByteCount?: number;
          };
          lifecycleProducerSha?: string;
        };
        bindingObservation?: {
          observationEndTime?: string;
          bindingSnapshotReferenceTime?: string;
          bindingObserverSha?: string;
          season?: number;
          modelVersion?: string;
          readMode?: string;
        };
        mode?: string;
      };
      bound.sidecarObservationEndTime =
        sc.bindingObservation?.observationEndTime ?? null;
      bound.sidecarBindingSnapshotReferenceTime =
        sc.bindingObservation?.bindingSnapshotReferenceTime ?? null;
      bound.sidecarWorkflowRunCompletedAt =
        sc.acceptedArchive?.github?.workflowRunCompletedAt ?? null;
      bound.sidecarArtifactCreatedAt =
        sc.acceptedArchive?.github?.artifactCreatedAt ?? null;
      bound.sidecarLifecycleProducerSha =
        sc.acceptedArchive?.lifecycleProducerSha ?? null;
      bound.sidecarBindingObserverSha =
        sc.bindingObservation?.bindingObserverSha ?? null;
      bound.sidecarSeason = sc.bindingObservation?.season ?? null;
      bound.sidecarModelVersion = sc.bindingObservation?.modelVersion ?? null;
      bound.sidecarReportMemberPath =
        sc.acceptedArchive?.github?.reportMemberPath ?? null;
      bound.sidecarZipSha256 = sc.acceptedArchive?.github?.zipSha256 ?? null;
      bound.sidecarReportMemberSha256 =
        sc.acceptedArchive?.github?.reportMemberSha256 ?? null;
      bound.sidecarReportByteCount =
        sc.acceptedArchive?.github?.reportByteCount ?? null;
      if (bound.sidecarReportMemberPath) {
        const reportName = path.basename(bound.sidecarReportMemberPath);
        bound.reportMemberName = reportName;
        for (const m of input.memberRecords) {
          if (path.basename(m.locator) === reportName) {
            bound.reportMemberSha256 = m.sha256;
          }
        }
      }
    } catch {
      // leave nulls; F1 cross-bind will fail closed
    }
  }
  return bound;
}

function crossBindCoverageAndIdentities(input: {
  bound: MlCal1G5BoundPackageEvidence;
  inventory: MlCal1G5LineageInventory | null;
  workflowRunCompletedAt: string;
  artifactCreatedAt: string;
  bindingSnapshotReferenceTime?: string | null;
  observationEndTime?: string | null;
  attestationCheckedThroughTime?: string | null;
}): string[] {
  const reasons: string[] = [];
  const b = input.bound;
  if (
    b.sidecarObservationEndTime == null ||
    parseIsoMs(b.sidecarObservationEndTime) == null ||
    b.sidecarBindingSnapshotReferenceTime == null ||
    parseIsoMs(b.sidecarBindingSnapshotReferenceTime) == null
  ) {
    reasons.push('lineage_coverage_time_missing');
  }
  if (
    input.observationEndTime != null &&
    b.sidecarObservationEndTime != null &&
    input.observationEndTime !== b.sidecarObservationEndTime
  ) {
    reasons.push('lineage_coverage_time_package_mismatch');
  }
  if (
    input.bindingSnapshotReferenceTime != null &&
    b.sidecarBindingSnapshotReferenceTime != null &&
    input.bindingSnapshotReferenceTime !== b.sidecarBindingSnapshotReferenceTime
  ) {
    reasons.push('lineage_coverage_time_package_mismatch');
  }
  if (
    b.sidecarWorkflowRunCompletedAt != null &&
    input.workflowRunCompletedAt !== b.sidecarWorkflowRunCompletedAt
  ) {
    reasons.push('lineage_archive_chronology_package_mismatch');
  }
  if (
    b.sidecarArtifactCreatedAt != null &&
    input.artifactCreatedAt !== b.sidecarArtifactCreatedAt
  ) {
    reasons.push('lineage_archive_chronology_package_mismatch');
  }
  if (input.inventory) {
    const inv = input.inventory;
    if (
      b.sidecarDigest != null &&
      inv.approvedSidecarDigest.toLowerCase() !== b.sidecarDigest
    ) {
      reasons.push('lineage_identity_package_mismatch');
    }
    if (
      b.sidecarLifecycleProducerSha != null &&
      inv.lifecycleProducerSha !== b.sidecarLifecycleProducerSha
    ) {
      reasons.push('lineage_identity_package_mismatch');
    }
    if (
      b.sidecarBindingObserverSha != null &&
      inv.bindingObserverSha !== b.sidecarBindingObserverSha
    ) {
      reasons.push('lineage_identity_package_mismatch');
    }
    if (b.sidecarSeason != null && inv.season !== b.sidecarSeason) {
      reasons.push('lineage_identity_package_mismatch');
    }
    if (
      b.sidecarModelVersion != null &&
      inv.modelVersion !== b.sidecarModelVersion
    ) {
      reasons.push('lineage_identity_package_mismatch');
    }
    if (inv.observationId !== b.observationId) {
      reasons.push('observation_id_inventory_mismatch');
    }
  }
  return reasons;
}

export function runG5Pre(input: MlCal1G5PreInput): MlCal1G5PreResult {
  const notes: string[] = [
    'g5_pre_retrieval_inventory_only',
    'whole_package_approval_disabled_until_independent_review',
    `design_sha256:${ML_CAL_1_G5_DESIGN_ON_DISK_SHA256}`,
    `base_g4_tip:${ML_CAL_1_G5_BASE_G4_TIP}`,
  ];
  const inventorySha256 = sha256Hex(input.inventoryBytes);
  const packageCheck = validateG5PackageStructural({
    observationId: input.observationId,
    packageDir: input.packageDir,
    claimedApprovedObservationPackageDigest:
      input.claimedApprovedObservationPackageDigest,
    pinDefinedPackageIdentityDigest: input.pinDefinedPackageIdentityDigest,
    wholePackageApprovalEnabled: input.wholePackageApprovalEnabled === true,
  });

  const boundEvidence = extractBoundPackageEvidence({
    observationId: input.observationId,
    packageDir: input.packageDir,
    sidecarDigest: packageCheck.sidecarDigest,
    memberRecords: packageCheck.memberRecords,
  });

  const reasons = [...packageCheck.reasons];

  if (input.requireQualificationAnchors === true) {
    if (
      typeof input.externalAnchors.approvedRegistryDocumentDigest !== 'string' ||
      !HEX64.test(input.externalAnchors.approvedRegistryDocumentDigest)
    ) {
      reasons.push('registry_approval_anchor_missing');
    }
    if (
      typeof input.externalAnchors.approvedLineageAttestationDigest !==
        'string' ||
      !HEX64.test(input.externalAnchors.approvedLineageAttestationDigest)
    ) {
      reasons.push('lineage_attestation_approval_anchor_missing');
    }
    if (
      typeof input.externalAnchors.approvedLineageInventorySha256 !== 'string' ||
      !HEX64.test(input.externalAnchors.approvedLineageInventorySha256)
    ) {
      reasons.push('lineage_inventory_approval_anchor_missing');
    }
  }

  // External inventory anchor compare (when supplied).
  if (
    typeof input.externalAnchors.approvedLineageInventorySha256 === 'string' &&
    input.externalAnchors.approvedLineageInventorySha256.length > 0
  ) {
    if (
      input.externalAnchors.approvedLineageInventorySha256.toLowerCase() !==
      inventorySha256
    ) {
      reasons.push('lineage_inventory_digest_mismatch');
    }
  }

  if (
    typeof input.externalAnchors.approvedSidecarDigest === 'string' &&
    packageCheck.sidecarDigest != null &&
    input.externalAnchors.approvedSidecarDigest.toLowerCase() !==
      packageCheck.sidecarDigest
  ) {
    reasons.push('sidecar_digest_mismatch_vs_approval_anchor');
  }

  // Prefer package-bound coverage times when caller omits them (still cross-checked).
  const effectiveObsEnd =
    input.observationEndTime ?? boundEvidence.sidecarObservationEndTime;
  const effectiveSnap =
    input.bindingSnapshotReferenceTime ??
    boundEvidence.sidecarBindingSnapshotReferenceTime;
  const effectiveChecked =
    input.attestationCheckedThroughTime ?? effectiveObsEnd;

  const parsed = parseLineageInventory(input.inventoryBytes);
  let recomputedSearchComplete = false;
  let recomputedNoneFoundPermitted = false;
  let derivedCandidateCount = 0;
  let unresolvedCandidateKeys: string[] = [];

  reasons.push(
    ...crossBindCoverageAndIdentities({
      bound: boundEvidence,
      inventory: parsed.ok ? parsed.inventory : null,
      workflowRunCompletedAt: input.workflowRunCompletedAt,
      artifactCreatedAt: input.artifactCreatedAt,
      bindingSnapshotReferenceTime: effectiveSnap,
      observationEndTime: effectiveObsEnd,
      attestationCheckedThroughTime: effectiveChecked,
    })
  );

  if (parsed.ok === false) {
    reasons.push(parsed.reason);
  } else {
    if (parsed.inventory.observationId !== input.observationId) {
      reasons.push('observation_id_inventory_mismatch');
    }
    if (
      packageCheck.sidecarDigest != null &&
      typeof parsed.inventory.approvedSidecarDigest === 'string' &&
      parsed.inventory.approvedSidecarDigest.toLowerCase() !==
        packageCheck.sidecarDigest
    ) {
      reasons.push('sidecar_digest_mismatch_vs_approval_anchor');
    }
    if (
      !GIT_SHA40.test(parsed.inventory.lifecycleProducerSha) ||
      !GIT_SHA40.test(parsed.inventory.bindingObserverSha)
    ) {
      reasons.push('producer_sha_invalid');
    }

    const boundRatingFingerprint = computeSidecarRatingFingerprint(
      input.packageDir
    );
    if (
      packageCheck.sidecarDigest == null ||
      boundRatingFingerprint == null ||
      effectiveObsEnd == null ||
      effectiveSnap == null
    ) {
      reasons.push('lineage_bound_effect_context_missing');
    }
    // Prefer sidecar observationStartTime when present on bound evidence package.
    let observationStartTime: string | null = null;
    try {
      const scPath = path.join(input.packageDir, 'binding-sidecar.json');
      if (fs.existsSync(scPath)) {
        const sc = JSON.parse(fs.readFileSync(scPath, 'utf8')) as {
          bindingObservation?: { observationStartTime?: string };
        };
        observationStartTime =
          sc.bindingObservation?.observationStartTime ?? null;
      }
    } catch {
      observationStartTime = null;
    }
    const complete = recomputeInventoryCompleteness({
      inventory: parsed.inventory,
      retainDir: input.searchEvidenceRetainDir,
      attestationCheckedThroughTime: effectiveChecked,
      bindingSnapshotReferenceTime: effectiveSnap,
      observationEndTime: effectiveObsEnd,
      observationStartTime,
      nowCeiling: input.nowCeiling,
      workflowRunCompletedAt: input.workflowRunCompletedAt,
      artifactCreatedAt: input.artifactCreatedAt,
      boundSidecarDigest: packageCheck.sidecarDigest,
      boundRatingFingerprint,
      approvedIndependentEffectEvidenceDigests:
        input.externalAnchors.approvedIndependentEffectEvidenceDigests ?? null,
    });
    recomputedSearchComplete = complete.recomputedSearchComplete;
    recomputedNoneFoundPermitted = complete.recomputedNoneFoundPermitted;
    derivedCandidateCount = complete.derivedCandidateCount;
    unresolvedCandidateKeys = complete.unresolvedCandidateKeys;
    reasons.push(...complete.reasons);

    if (
      input.attestationSearchOutcome === 'none_found' &&
      !recomputedNoneFoundPermitted
    ) {
      reasons.push('lineage_search_incomplete');
    }
  }

  // Capture-as-of claim at G5 without capture artifact.
  // Detected when notes/caller sets a reserved claim flag via inventory incompleteReasons.
  if (
    parsed.ok &&
    Array.isArray(parsed.inventory.incompleteReasons) &&
    parsed.inventory.incompleteReasons.includes('capture_as_of_claim_at_g5')
  ) {
    reasons.push('capture_as_of_out_of_gate');
  }

  const uniqueReasons = [...new Set(reasons)];
  const ok =
    packageCheck.ok &&
    parsed.ok &&
    uniqueReasons.length === 0 &&
    (input.attestationSearchOutcome !== 'none_found' ||
      recomputedNoneFoundPermitted);

  // Fixture non-escalation: always force liveAccepted false.
  if (packageCheck.fixtureProvenanceRetained) {
    notes.push('fixture_provenance_retained');
  }

  const validatedAnchors: MlCal1G5ValidatedAnchors = {
    inventorySha256,
    approvedLineageInventorySha256:
      typeof input.externalAnchors.approvedLineageInventorySha256 === 'string' &&
      HEX64.test(input.externalAnchors.approvedLineageInventorySha256)
        ? input.externalAnchors.approvedLineageInventorySha256.toLowerCase()
        : null,
    approvedLineageAttestationDigest:
      typeof input.externalAnchors.approvedLineageAttestationDigest ===
        'string' &&
      HEX64.test(input.externalAnchors.approvedLineageAttestationDigest)
        ? input.externalAnchors.approvedLineageAttestationDigest.toLowerCase()
        : null,
    approvedRegistryDocumentDigest:
      typeof input.externalAnchors.approvedRegistryDocumentDigest === 'string' &&
      HEX64.test(input.externalAnchors.approvedRegistryDocumentDigest)
        ? input.externalAnchors.approvedRegistryDocumentDigest.toLowerCase()
        : null,
  };

  return {
    ok,
    reasons: uniqueReasons,
    recomputedSearchComplete,
    recomputedNoneFoundPermitted,
    derivedCandidateCount,
    unresolvedCandidateKeys,
    fixtureProvenanceRetained: packageCheck.fixtureProvenanceRetained,
    packageStructuralOk: packageCheck.ok,
    inventorySha256,
    sidecarDigest: packageCheck.sidecarDigest,
    boundEvidence,
    validatedAnchors,
    prospectiveOk: false,
    fullWeightEligible: false,
    liveQualifying: false,
    liveAccepted: false,
    retrieved: {
      inventory: {
        objectClass: 'lineage_inventory',
        locator: 'caller-supplied-inventory-bytes',
        byteCount: input.inventoryBytes.length,
        sha256: inventorySha256,
        retrievedAt: new Date(0).toISOString(),
      },
      packageMembers: packageCheck.memberRecords,
    },
    notes,
  };
}

/**
 * Optional G5-VERIFY: calls accepted verifier only when prospectiveTargetWeek is
 * supplied as approved or explicit fixture-only. Never invents a production week.
 * G5-PRE without target must not call this.
 * F6: verification inputs must bind to validated PRE retained evidence; any
 * target/evidence mismatch stops qualification (ok=false, verifier not invoked).
 */
export function runG5Verify(input: MlCal1G5VerifyInput): MlCal1G5VerifyResult {
  const reasons: string[] = [];
  if (!input.g5Pre.ok) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['g5_pre_not_ok', ...input.g5Pre.reasons],
      ok: false,
    };
  }
  if (typeof input.prospectiveTargetWeek !== 'number') {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['prospective_target_week_required'],
      ok: false,
    };
  }
  if (!input.fixtureOnlyTarget) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['prospective_target_unapproved'],
      ok: false,
    };
  }
  if (input.verifyInput.prospectiveTargetWeek !== input.prospectiveTargetWeek) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['prospective_target_week_mismatch'],
      ok: false,
    };
  }

  const bound = input.g5Pre.boundEvidence;
  const zipSha = sha256Hex(input.verifyInput.zipBytes);
  if (bound.zipSha256 == null || zipSha !== bound.zipSha256) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['g5_verify_zip_evidence_mismatch'],
      ok: false,
    };
  }
  const sidecarDigest = sha256Hex(
    Buffer.from(input.verifyInput.sidecarBytes, 'utf8')
  );
  if (
    bound.sidecarDigest == null ||
    sidecarDigest !== bound.sidecarDigest ||
    input.g5Pre.sidecarDigest !== bound.sidecarDigest
  ) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['g5_verify_sidecar_evidence_mismatch'],
      ok: false,
    };
  }
  if (input.verifyInput.reportMemberBytes) {
    const reportSha = sha256Hex(input.verifyInput.reportMemberBytes);
    if (
      bound.reportMemberSha256 == null ||
      reportSha !== bound.reportMemberSha256
    ) {
      return {
        invokedVerifier: false,
        verifyResult: null,
        liveAccepted: false,
        reasons: ['g5_verify_report_evidence_mismatch'],
        ok: false,
      };
    }
  }
  if (
    typeof input.verifyInput.expectedZipSha256 === 'string' &&
    input.verifyInput.expectedZipSha256.toLowerCase() !== zipSha
  ) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['g5_verify_zip_evidence_mismatch'],
      ok: false,
    };
  }

  // R4: before accepted verifier, bind inventory/attestation/registry evidence
  // to PRE-validated anchors — reject substituted evidence.
  const va = input.g5Pre.validatedAnchors;
  const verifyInv = input.verifyInput.approvedLineageInventorySha256;
  if (typeof verifyInv === 'string' && verifyInv.length > 0) {
    const expectedInv =
      va.approvedLineageInventorySha256 ?? va.inventorySha256;
    if (verifyInv.toLowerCase() !== expectedInv.toLowerCase()) {
      return {
        invokedVerifier: false,
        verifyResult: null,
        liveAccepted: false,
        reasons: ['g5_verify_inventory_anchor_mismatch'],
        ok: false,
      };
    }
  } else if (va.approvedLineageInventorySha256 != null) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['g5_verify_inventory_anchor_mismatch'],
      ok: false,
    };
  }

  const verifyAtt = input.verifyInput.approvedLineageAttestationDigest;
  if (typeof verifyAtt === 'string' && verifyAtt.length > 0) {
    if (
      va.approvedLineageAttestationDigest == null ||
      verifyAtt.toLowerCase() !== va.approvedLineageAttestationDigest
    ) {
      return {
        invokedVerifier: false,
        verifyResult: null,
        liveAccepted: false,
        reasons: ['g5_verify_attestation_anchor_mismatch'],
        ok: false,
      };
    }
    if (typeof input.verifyInput.lineageAttestationBytes === 'string') {
      const attDigest = sha256Hex(
        Buffer.from(input.verifyInput.lineageAttestationBytes, 'utf8')
      );
      if (attDigest !== va.approvedLineageAttestationDigest) {
        return {
          invokedVerifier: false,
          verifyResult: null,
          liveAccepted: false,
          reasons: ['g5_verify_attestation_evidence_mismatch'],
          ok: false,
        };
      }
    }
  } else if (va.approvedLineageAttestationDigest != null) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['g5_verify_attestation_anchor_mismatch'],
      ok: false,
    };
  }

  const verifyReg = input.verifyInput.approvedRegistryDocumentDigest;
  if (typeof verifyReg === 'string' && verifyReg.length > 0) {
    if (
      va.approvedRegistryDocumentDigest == null ||
      verifyReg.toLowerCase() !== va.approvedRegistryDocumentDigest
    ) {
      return {
        invokedVerifier: false,
        verifyResult: null,
        liveAccepted: false,
        reasons: ['g5_verify_registry_anchor_mismatch'],
        ok: false,
      };
    }
    if (typeof input.verifyInput.registryDocumentBytes === 'string') {
      const regDigest = sha256Hex(
        Buffer.from(input.verifyInput.registryDocumentBytes, 'utf8')
      );
      if (regDigest !== va.approvedRegistryDocumentDigest) {
        return {
          invokedVerifier: false,
          verifyResult: null,
          liveAccepted: false,
          reasons: ['g5_verify_registry_evidence_mismatch'],
          ok: false,
        };
      }
    }
  } else if (va.approvedRegistryDocumentDigest != null) {
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['g5_verify_registry_anchor_mismatch'],
      ok: false,
    };
  }

  const verifyResult = verifyLifecycleBindingSidecar(input.verifyInput);
  if (input.g5Pre.fixtureProvenanceRetained) {
    reasons.push('fixture_provenance_blocks_portable_live_acceptance');
  }
  const ta = (
    input.verifyInput as MlCal1LifecycleBindingVerifyInput & {
      trustedAcceptance?: { approvedReceiptDigest?: string };
      _justComputedAdaptedReceiptDigest?: string;
    }
  ).trustedAcceptance;
  const justComputed = (
    input.verifyInput as {
      _justComputedAdaptedReceiptDigest?: string;
    }
  )._justComputedAdaptedReceiptDigest;
  if (
    ta?.approvedReceiptDigest &&
    justComputed &&
    ta.approvedReceiptDigest === justComputed
  ) {
    reasons.push('receipt_approval_self_assigned');
  }

  const blocking = reasons.filter(
    (r) =>
      r === 'receipt_approval_self_assigned' ||
      r === 'g5_verify_zip_evidence_mismatch' ||
      r === 'g5_verify_sidecar_evidence_mismatch' ||
      r === 'g5_verify_report_evidence_mismatch' ||
      r === 'prospective_target_week_mismatch'
  );
  const ok =
    verifyResult.structuralConsistencyVerified && blocking.length === 0;

  return {
    invokedVerifier: true,
    verifyResult,
    liveAccepted: false,
    reasons: [...reasons, ...verifyResult.reasons],
    ok,
  };
}

/** Serialize inventory with trailing newline (stable for fixtures). */
export function serializeG5Inventory(inventory: MlCal1G5LineageInventory): Buffer {
  return Buffer.from(`${stableStringify(inventory)}\n`, 'utf8');
}

export function serializeG5ListingPage(page: MlCal1G5RetainedListingPage): Buffer {
  return Buffer.from(`${stableStringify(page)}\n`, 'utf8');
}

/** Persist bytes under retainDir/by-digest/<sha256>.bin and return digest. */
export function retainBytesByDigest(retainDir: string, bytes: Buffer): string {
  const digest = sha256Hex(bytes);
  const dir = path.join(retainDir, 'by-digest');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${digest}.bin`);
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, bytes);
  }
  return digest;
}

export function computePackageIdentityDigest(input: {
  observationId: string;
  memberDigests: Record<string, { sha256: string; byteCount: number }>;
  sidecarDigest: string;
  manifestSha256: string;
}): string {
  return sha256Hex(
    Buffer.from(
      `${stableStringify({
        observationId: input.observationId,
        memberDigests: input.memberDigests,
        sidecarDigest: input.sidecarDigest,
        manifestSha256: input.manifestSha256,
      })}\n`,
      'utf8'
    )
  );
}
