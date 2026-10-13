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
  sha256Utf8Bytes,
  stableStringify,
  verifyLifecycleBindingSidecar,
  type MlCal1LifecycleBindingVerifyInput,
  type MlCal1LifecycleBindingVerifyResult,
} from './ml-cal-1-lifecycle-binding';
import { isSafeG4ObservationId } from './ml-cal-1-lifecycle-binding-observer';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ML_CAL_1_G5_INVENTORY_SCHEMA =
  'ml-cal-1-lifecycle-binding-lineage-inventory-v1' as const;

export const ML_CAL_1_G5_LISTING_PAGE_SCHEMA =
  'ml-cal-1-g5-retained-listing-page-v1' as const;

export const ML_CAL_1_G5_DESIGN_ON_DISK_SHA256 =
  'bc292e06ce78531b7290833922abe4add9be3af854fe15c599d9bcd1dc1c7a8b' as const;

export const ML_CAL_1_G5_BASE_G4_TIP =
  '6c2b31069b8805c7f2d171da1e04bf47885f237d' as const;

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
  nextPageToken: string | null;
  emptyResult?: boolean;
  candidates: MlCal1G5RetainedListingCandidate[];
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
   * Whole-package approval remains disabled until independently reviewed.
   * Default false — claiming approval without external pin fails closed.
   */
  wholePackageApprovalEnabled?: boolean;
  /**
   * When true, require independently supplied registry + attestation digest
   * anchors (qualification path). Default false for retrieval/inventory-only.
   */
  requireQualificationAnchors?: boolean;
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
      nextPageToken: o.nextPageToken as string | null,
      emptyResult: o.emptyResult === true,
      candidates,
    },
  };
}

/**
 * Inclusive window + overlap membership (§6.2.1).
 * A listed lifecycle candidate enters the derived set when it overlaps the window.
 */
export function candidateOverlapsSearchWindow(input: {
  candidate: MlCal1G5RetainedListingCandidate;
  searchWindowStartInclusiveMs: number;
  checkedThroughTimeMs: number;
}): boolean {
  const { candidate: c, searchWindowStartInclusiveMs: start, checkedThroughTimeMs: end } =
    input;
  const writeMs = parseIsoMs(c.commitOrWriteTime);
  if (writeMs != null && writeMs >= start && writeMs <= end) {
    return true;
  }
  const runStart = parseIsoMs(c.runStartedAt);
  const runEnd = parseIsoMs(c.runEndedAt);
  if (runStart != null && runStart <= end) {
    if (c.runEndedAt == null || c.runEndedAt === '') {
      // Still active at inventory time — overlapping if started by checkedThrough.
      return true;
    }
    if (runEnd != null && runEnd >= start) {
      return true;
    }
  }
  // Availability-only does not establish window membership for derivation of writes,
  // but deleted markers still surface as candidates when listed with keys.
  if (c.deletedOrExpired === true) {
    return true;
  }
  return false;
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

export function deriveCandidatesFromRetainedPages(input: {
  pageDigests: string[];
  retainDir: string;
  searchWindowStartInclusive: string;
  searchWindowEndInclusive: string;
}): {
  ok: boolean;
  reasons: string[];
  derivedKeys: string[];
  byKey: Map<string, { candidate: MlCal1G5RetainedListingCandidate; listingPageDigest: string }>;
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
    { candidate: MlCal1G5RetainedListingCandidate; listingPageDigest: string }
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
    // Pagination chain completeness is checked at source level; here extract.
    for (const c of page.candidates) {
      if (!isSeasonModelRelevant(c)) continue;
      if (
        !candidateOverlapsSearchWindow({
          candidate: c,
          searchWindowStartInclusiveMs: start,
          checkedThroughTimeMs: end,
        })
      ) {
        continue;
      }
      if (!byKey.has(c.candidateKey)) {
        byKey.set(c.candidateKey, { candidate: c, listingPageDigest: digest });
      }
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
// Disposition evidence gates (§5.4.1)
// ---------------------------------------------------------------------------

export function evaluateDispositionEvidence(input: {
  disposition: MlCal1G5ResolvedDisposition;
  candidateContentsDigest: string | null;
  independentEffectEvidenceDigest: string | null;
  deletionNoticeDigest: string | null;
  commitOrWriteTime: string | null;
  retainDir: string;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const hasContents =
    typeof input.candidateContentsDigest === 'string' &&
    HEX64.test(input.candidateContentsDigest) &&
    loadRetainedBytesByDigest({
      retainDir: input.retainDir,
      digest: input.candidateContentsDigest,
    }) != null;
  const hasEffect =
    typeof input.independentEffectEvidenceDigest === 'string' &&
    HEX64.test(input.independentEffectEvidenceDigest) &&
    loadRetainedBytesByDigest({
      retainDir: input.retainDir,
      digest: input.independentEffectEvidenceDigest,
    }) != null;
  const noticeOnly =
    typeof input.deletionNoticeDigest === 'string' &&
    HEX64.test(input.deletionNoticeDigest) &&
    !hasContents &&
    !hasEffect;

  if (input.disposition === 'not_invalidating') {
    if (!hasContents && !hasEffect) {
      reasons.push(
        noticeOnly
          ? 'lineage_deleted_candidate_unresolved'
          : 'lineage_candidate_unresolved'
      );
    }
  }
  if (input.disposition === 'unresolved') {
    reasons.push(
      noticeOnly
        ? 'lineage_deleted_candidate_unresolved'
        : 'lineage_candidate_unresolved'
    );
  }
  // Ambiguous write time without non-effect proof → unresolved for none_found.
  if (
    input.disposition !== 'invalidating' &&
    (input.commitOrWriteTime == null ||
      parseIsoMs(input.commitOrWriteTime) == null) &&
    !hasEffect
  ) {
    // Only force when disposition claims not_invalidating or when write is required.
    if (input.disposition === 'not_invalidating') {
      reasons.push('lineage_candidate_unresolved');
    }
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
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

  // Required members (report basename is dynamic — require at least one non-listed member or known report).
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

  const sidecarPath = path.join(dir, 'binding-sidecar.json');
  let sidecarDigest: string | null = null;
  if (fs.existsSync(sidecarPath)) {
    sidecarDigest = sha256Hex(fs.readFileSync(sidecarPath));
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

    // Fixture mode detection from sidecar when PROVENANCE absent.
    try {
      const sc = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) as Record<
        string,
        unknown
      >;
      if (
        sc.mode === 'fixture_hypothetical' ||
        sc.readMode === 'fixture_injected'
      ) {
        fixtureProvenanceRetained = true;
        if (!hasProvenance) {
          reasons.push('package_member_missing'); // PROVENANCE required for fixture-mode
        }
      }
    } catch {
      reasons.push('package_member_digest_mismatch');
    }
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

  const approvalClaimed =
    typeof input.claimedApprovedObservationPackageDigest === 'string' &&
    input.claimedApprovedObservationPackageDigest.length > 0;
  if (approvalClaimed) {
    if (input.wholePackageApprovalEnabled !== true) {
      reasons.push('observation_package_approval_disabled');
    }
    const pin = input.pinDefinedPackageIdentityDigest;
    const claimed = input.claimedApprovedObservationPackageDigest!.toLowerCase();
    if (typeof pin !== 'string' || !HEX64.test(pin)) {
      reasons.push('observation_package_approval_anchor_missing');
    } else if (pin.toLowerCase() !== claimed) {
      reasons.push('observation_package_digest_mismatch_vs_approval_anchor');
    } else if (packageIdentityDigest !== claimed) {
      reasons.push('observation_package_digest_mismatch_vs_approval_anchor');
    }
  }

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
  if (p.pagesRetrieved < 1) {
    reasons.push('lineage_search_incomplete');
  }
  if (p.nextPageToken != null) {
    reasons.push('lineage_search_incomplete');
  }
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
  }
  // Declaration mirror must match recompute.
  const recomputed =
    reasons.length === 0 &&
    p.nextPageToken == null &&
    p.pagesRetrieved >= 1 &&
    p.pageDigests.length === p.pagesRetrieved;
  if (p.complete !== recomputed) {
    reasons.push('lineage_inventory_declaration_mismatch');
  }
  return { complete: reasons.length === 0 && recomputed, reasons: [...new Set(reasons)] };
}

export function recomputeInventoryCompleteness(input: {
  inventory: MlCal1G5LineageInventory;
  retainDir: string;
  attestationCheckedThroughTime?: string | null;
  bindingSnapshotReferenceTime?: string | null;
  observationEndTime?: string | null;
  nowCeiling: string;
  workflowRunCompletedAt: string;
  artifactCreatedAt: string;
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

  const snap = parseIsoMs(input.bindingSnapshotReferenceTime ?? null);
  const obsEnd = parseIsoMs(input.observationEndTime ?? null);
  if (endMs != null && snap != null && endMs < snap) {
    reasons.push('lineage_checked_through_too_early');
  }
  if (endMs != null && obsEnd != null && endMs < obsEnd) {
    reasons.push('lineage_checked_through_too_early');
  }

  const assembled = parseIsoMs(inv.inventoryAssembledAt);
  const ceiling = parseIsoMs(input.nowCeiling);
  if (assembled == null || ceiling == null || assembled > ceiling) {
    reasons.push('lineage_inventory_assembled_after_ceiling');
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

    const ev = evaluateDispositionEvidence({
      disposition: c.resolvedDisposition,
      candidateContentsDigest: c.candidateContentsDigest,
      independentEffectEvidenceDigest: c.independentEffectEvidenceDigest,
      deletionNoticeDigest: c.deletionNoticeDigest,
      commitOrWriteTime: c.commitOrWriteTime,
      retainDir: input.retainDir,
    });
    if (c.resolvedDisposition === 'invalidating') {
      hasInvalidating = true;
    }
    if (c.resolvedDisposition === 'unresolved' || !ev.ok) {
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
    uniqueReasons.filter((r) =>
      [
        'lineage_search_incomplete',
        'lineage_candidate_omitted_from_inventory',
        'lineage_candidate_not_in_retained_listings',
        'lineage_inventory_declaration_mismatch',
        'lineage_search_window_end_mismatch',
        'lineage_search_window_start_mismatch',
        'archive_chronology_missing',
      ].includes(r) || r.startsWith('listing_')
    ).length === 0;

  const recomputedNoneFoundPermitted =
    structuralComplete &&
    unresolvedCandidateKeys.length === 0 &&
    !hasInvalidating &&
    !uniqueReasons.includes('lineage_deleted_candidate_unresolved') &&
    !uniqueReasons.includes('lineage_candidate_unresolved') &&
    !uniqueReasons.includes('lineage_week_alone_supersession_forbidden') &&
    !uniqueReasons.includes('lineage_checked_through_too_early');

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

  // Reject self-assignment pattern: claiming approved* equal to just-computed without
  // presenting it as an external anchor object class. Structural self-hash alone ≠ approval.
  if (
    input.claimedApprovedObservationPackageDigest != null &&
    input.wholePackageApprovalEnabled !== true &&
    input.pinDefinedPackageIdentityDigest == null
  ) {
    reasons.push('observation_package_approval_self_hash_rejected');
  }

  const parsed = parseLineageInventory(input.inventoryBytes);
  let recomputedSearchComplete = false;
  let recomputedNoneFoundPermitted = false;
  let derivedCandidateCount = 0;
  let unresolvedCandidateKeys: string[] = [];

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

    const complete = recomputeInventoryCompleteness({
      inventory: parsed.inventory,
      retainDir: input.searchEvidenceRetainDir,
      attestationCheckedThroughTime: input.attestationCheckedThroughTime,
      bindingSnapshotReferenceTime: input.bindingSnapshotReferenceTime,
      observationEndTime: input.observationEndTime,
      nowCeiling: input.nowCeiling,
      workflowRunCompletedAt: input.workflowRunCompletedAt,
      artifactCreatedAt: input.artifactCreatedAt,
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
    // Production target path is out of scope for this offline PR — refuse silently
    // inventing production eligibility.
    return {
      invokedVerifier: false,
      verifyResult: null,
      liveAccepted: false,
      reasons: ['prospective_target_unapproved'],
      ok: false,
    };
  }
  if (input.verifyInput.prospectiveTargetWeek !== input.prospectiveTargetWeek) {
    reasons.push('prospective_target_week_mismatch');
  }

  const verifyResult = verifyLifecycleBindingSidecar(input.verifyInput);
  if (input.g5Pre.fixtureProvenanceRetained) {
    reasons.push('fixture_provenance_blocks_portable_live_acceptance');
  }
  // Detect self-assigned trustedAcceptance receipt (caller must not mint).
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

  const ok =
    verifyResult.structuralConsistencyVerified &&
    reasons.filter((r) => r === 'receipt_approval_self_assigned').length === 0;

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
