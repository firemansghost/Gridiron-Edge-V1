/**
 * ML-CAL-1 Capture V1.1 — pure evidence planner + artifact helpers.
 *
 * Read-only artifact capture for prospective Core V1 moneyline calibration.
 * Does NOT write bets/ratings/markets, call providers, read scores/outcomes,
 * or freeze the draft evaluation protocol (PR 243 remains draft).
 *
 * Timing rule (frozen for adapters):
 *   captureStartTime      - diagnostic only; never used for as-of/age/known-at.
 *   snapshotReferenceTime - end of the DB/fixture snapshot reads. This IS the
 *                           predictionReferenceTime. Market observation age,
 *                           observation timestamp and known-at (createdAt /
 *                           updatedAt) are evaluated against this value ONLY.
 *   computationTime       - when forecast planning ran (diagnostic).
 *   publicationTime       - seal/publish boundary. Taken by the artifact writer
 *                           immediately before eligibility is finalized.
 *   Available forecasts require:
 *     publicationTime <= kickoff - 30 minutes AND publicationTime < kickoff.
 *   A later timestamp is never used to salvage a stale market.
 */

import { createHash, randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { computeEffectiveHfa } from '../../web/lib/core-v1-spread';
import hfaConfigJson from '../../web/lib/data/core_v1_hfa_config.json';
import {
  HARD_MIN_ML_VALUE,
  ML_MAX_ABS_SPREAD,
  modelWinProbsFromCoreSpreadHma,
  selectCoreV1MoneylinePick,
  type CoreV1MoneylinePick,
} from '../../web/lib/core-v1-moneyline';
import { americanToProb } from '../../web/lib/market-line-helpers';
import {
  selectGameMarketSnapshots,
  type MarketLineObservation,
} from '../../web/lib/market-line-snapshot';
import { b1CanonicalWeight } from '../src/preseason/balanced-v1-transition-blend-eval';

export const ML_CAL_1_CAPTURE_SCHEMA_VERSION = 'ml-cal-1-capture-artifact-v1';
export const ML_CAL_1_CAPTURE_PRODUCER_VERSION = 'ml-cal-1-capture-v1.1.0';
export const ML_CAL_1_SUPPORTED_SEASON = 2026;
export const ML_CAL_1_MODEL_VERSION = 'v1';
export const ML_CAL_1_LIVE_ODDS_SOURCE = 'oddsapi';
export const ML_CAL_1_MAX_MARKET_AGE_SECONDS = 1800;
export const ML_CAL_1_MIN_PRE_KICKOFF_MS = 30 * 60 * 1000;
export const ML_CAL_1_LIFECYCLE_POLICY = 'GLOBAL_BLEND_W3_W6';
export const ML_CAL_1_FULL_WEIGHT = 1;
export const ML_CAL_1_FULL_WEIGHT_MIN_COMPLETED_WEEK = 6;

/** Canonical Git blob byte hashes (SHA-256 of `git show <ref>:<path>` bytes, LF as committed). */
export const ML_CAL_1_CANONICAL_GIT_BYTE_HASHES = {
  'apps/web/lib/core-v1-moneyline.ts':
    'c47c8faad10a6cfec2cb38fa329216233f80c3a2cfb1efd8faf4a9aa1dfab853',
  'apps/web/lib/core-v1-weekly-card.ts':
    '68f29f7c7588aeb16afa0588d0ac9c5b1b87f55b6e2310a62145b5331528ee91',
  'apps/web/lib/market-line-snapshot.ts':
    'd4b274154d588e5a262f0f2e63ebe58e9eab1c70f4fd8dbd322ee56e7d3dc7d2',
  'apps/web/lib/market-line-helpers.ts':
    'd0ebc1776a8342b8eaf5f444db90152f6f093cff04c23b25969930861ce975eb',
  'apps/web/lib/core-v1-spread.ts':
    '54c07653cef67f93d69df9835a5aac8759feefd11e457107b249196f1614e98c',
  'apps/web/lib/data/core_v1_hfa_config.json':
    'c6f90be8d51127078e18213120529a6d04e5f20ef8a91e0f06d359285451f59d',
} as const;

/** Capture runner + planner are hashed from Git bytes but are not pinned (they change with the PR). */
export const ML_CAL_1_CAPTURE_SELF_PATHS = [
  'apps/jobs/capture-ml-cal-1-2026.ts',
  'apps/jobs/lib/ml-cal-1-capture.ts',
] as const;

/**
 * Behavior dependency for lifecycle week→weight consistency.
 * Live mode requires this path clean vs Git bytes; fixture mode may be dirty in development.
 */
export const ML_CAL_1_LIFECYCLE_WEIGHT_PATH =
  'apps/jobs/src/preseason/balanced-v1-transition-blend-eval.ts' as const;

/** All paths that must be clean before live DB access. */
export const ML_CAL_1_LIVE_EXECUTABLE_PATHS = [
  ...Object.keys(ML_CAL_1_CANONICAL_GIT_BYTE_HASHES),
  ...ML_CAL_1_CAPTURE_SELF_PATHS,
  ML_CAL_1_LIFECYCLE_WEIGHT_PATH,
] as const;

export type MlCal1TerminalStatus =
  | 'EVIDENCE_CAPTURED'
  | 'PRIMARY_READINESS_BLOCKED'
  | 'PUBLICATION_INVALIDATED'
  | 'INFRASTRUCTURE_ERROR';

/** Forbidden Game select fields — scores/outcomes must never be projected. */
export const ML_CAL_1_FORBIDDEN_GAME_FIELDS = [
  'homeScore',
  'awayScore',
  'home_score',
  'away_score',
] as const;

export const ML_CAL_1_FORBIDDEN_MODELS = [
  'bet',
  'teamGameStat',
  'teamGameStats',
  'matchupOutput',
] as const;

/** Keys that must never appear in any select/include/where/orderBy. */
const FORBIDDEN_KEY_PATTERN = /score|pnl|result|clv/i;

export type MlCal1CaptureStatus =
  | 'EVIDENCE_CAPTURED'
  | 'PRIMARY_READINESS_BLOCKED'
  | 'INFRASTRUCTURE_ERROR';

export type MlCal1LifecycleMode = 'fixture_hypothetical' | 'live';

export type MlCal1DecimalLike = { toString(): string } | number | string | null | undefined;

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
  /** null when the row would have been defaulted to zero by `|| 0` or is non-finite. */
  valueUsed: number | null;
  games: number;
  dataSource: string | null;
  createdAt: string;
  updatedAt: string;
  rowContentHash: string;
  unavailableReasons: string[];
  /**
   * True only when modelVersion==='v1', no unavailable reasons, valueUsed is finite
   * (legitimate Decimal(0) included) and chosenField is powerRating|rating.
   */
  inputUsable: boolean;
}

export interface MlCal1HfaBreakdown {
  homeTeamId: string;
  neutralSite: boolean;
  hfaConfigHash: string;
  baseHfa: number;
  teamAdjustment: number;
  rawHfa: number;
  clipMin: number;
  clipMax: number;
  effectiveHfa: number;
}

export interface MlCal1GameMeta {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAsKnown: Date | string;
  neutralSite: boolean;
  status?: string | null;
}

export interface MlCal1MarketLineCandidate {
  id: string;
  gameId: string;
  lineType: string;
  lineValue: number;
  bookName: string;
  timestamp: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
  teamId: string | null;
  source: string | null;
  season?: number;
  week?: number;
}

export interface MlCal1LifecycleReceipt {
  sourceSha: string;
  completedThroughWeek: number;
  selectedPolicy: string;
  canonicalWeight: number;
  receiptDigest: string;
  /** SHA-256 of canonical exported rating readback identity used at lifecycle write. */
  ratingFingerprint: string;
  acceptedImmutable: boolean;
  /**
   * Season binding. Fixture mode requires this field; live mode may omit it only when
   * an independently reviewed trustedAcceptance supplies the season binding.
   */
  season?: number;
}

/**
 * Separately reviewed immutable trust record for live acceptance.
 * Matching caller-supplied bytes to a caller-supplied digest is integrity only —
 * it does NOT create this trust record.
 */
export interface MlCal1TrustedAcceptanceRecord {
  /** Approved digest of the accepted lifecycle receipt artifact. */
  approvedReceiptDigest: string;
  season: number;
  selectedPolicy: string;
  completedThroughWeek: number;
  canonicalWeight: number;
  ratingFingerprint: string;
  /** Lifecycle producer / source lineage SHA (not the capture producer SHA). */
  lifecycleSourceSha: string;
}

export interface MlCal1LifecycleVerificationInput {
  mode: MlCal1LifecycleMode;
  /** Exact UTF-8 bytes of the claimed accepted receipt artifact (JSON text). */
  receiptBytes: string | null;
  /** Digest expected to match sha256(receiptBytes) — integrity pin only. */
  pinnedReceiptDigest: string | null;
  /** Parsed claims. `claims.receiptDigest` must equal sha256(receiptBytes). */
  claims: MlCal1LifecycleReceipt | null;
  expectedRatingFingerprint: string;
  /** Capture producer repository SHA — recorded separately; NOT required equal to claims.sourceSha. */
  captureProducerSha: string;
  expectedSeason: number;
  prospectiveWeek: number;
  /**
   * Live acceptance trust record. Required for liveAccepted / live primary qualification.
   * Fixture mode ignores this for hypothetical qualification.
   */
  trustedAcceptance?: MlCal1TrustedAcceptanceRecord | null;
}

export interface MlCal1LifecycleVerificationResult {
  /** Primary-eligibility qualification (fixture may qualify hypothetically; live needs trust). */
  qualified: boolean;
  reasons: string[];
  mode: MlCal1LifecycleMode;
  /** True when verification ran in fixture_hypothetical mode (never live-accepted). */
  fixtureHypothetical: boolean;
  /** Bytes hash matched the integrity pin and internal claims consistency. */
  receiptIntegrityVerified: boolean;
  /**
   * True only when mode==='live' AND integrity verified AND trustedAcceptance
   * independently binds the approved digest/season/policy/week/fingerprint/source.
   */
  liveAccepted: boolean;
  /** Claims actually evaluated (parsed from receiptBytes when available). */
  receipt: MlCal1LifecycleReceipt | null;
  /** sha256(receiptBytes) when bytes were provided. */
  verifiedReceiptDigest: string | null;
  lifecycleSourceSha: string | null;
  producerRepositorySha: string;
  /** Non-blocking informational notes (e.g. fixture without receipt bytes). */
  notes: string[];
}

export interface MlCal1DependencyHashes {
  gitByteHashes: Record<string, string>;
  checkoutRawHashes?: Record<string, string>;
  dirty: string[];
}

export interface MlCal1UniverseRow {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAsKnown: string;
  neutralSite: boolean;
  bothFbs: boolean;
  membershipReasons: string[];
  tracked: boolean;
  exclusionReasons: string[];
}

export interface MlCal1ForecastRow {
  gameId: string;
  /** Equals snapshotReferenceTime (market as-of reference). */
  predictionTime: string;
  snapshotReferenceTime: string;
  publicationTime: string;
  kickoffAsKnown: string;
  homeTeamId: string;
  awayTeamId: string;
  neutralSite: boolean;
  forecastAvailable: boolean;
  unavailableReasons: string[];
  /** True when publicationTime > kickoff - 30 minutes. */
  lateCapture: boolean;
  coreSpreadHma: number | null;
  modelHomeWinProb: number | null;
  modelAwayWinProb: number | null;
  absSpreadWithinGate: boolean | null;
  inGateForecast: boolean;
  ratingDiff: number | null;
  hfa: MlCal1HfaBreakdown | null;
  homeRatingInput: MlCal1ExportedRatingInput | null;
  awayRatingInput: MlCal1ExportedRatingInput | null;
  selectionStatus:
    | 'SELECTED'
    | 'NO_SELECTION'
    | 'LARGE_SPREAD_SUPPRESSED'
    | 'MARKET_UNAVAILABLE'
    | 'FORECAST_UNAVAILABLE';
  selection: CoreV1MoneylinePick | null;
  selectionReasons: string[];
  primaryEligibleCandidate: boolean;
  primaryEligibilityReasons: string[];
  modelOnlyEligible: boolean;
}

export interface MlCal1PairedMarketEvidence {
  gameId: string;
  available: boolean;
  rejectionReasons: string[];
  observationAgeSeconds: number | null;
  bookName: string | null;
  source: string | null;
  observationTimestamp: string | null;
  homeRowId: string | null;
  awayRowId: string | null;
  homePrice: number | null;
  awayPrice: number | null;
  homeCreatedAt: string | null;
  awayCreatedAt: string | null;
  homeUpdatedAt: string | null;
  awayUpdatedAt: string | null;
  rawImpliedHome: number | null;
  rawImpliedAway: number | null;
  overround: number | null;
  deVigHome: number | null;
  deVigAway: number | null;
}

export interface MlCal1SpreadMarketEvidence {
  gameId: string;
  available: boolean;
  rejectionReasons: string[];
  observationAgeSeconds: number | null;
  bookName: string | null;
  source: string | null;
  observationTimestamp: string | null;
  homeRowId: string | null;
  awayRowId: string | null;
  homeLine: number | null;
  awayLine: number | null;
  marketSpreadHma: number | null;
  homeCreatedAt: string | null;
  awayCreatedAt: string | null;
  homeUpdatedAt: string | null;
  awayUpdatedAt: string | null;
}

export interface MlCal1RejectionLedgerEntry {
  gameId: string;
  rowId: string;
  reasons: string[];
  lineType: string;
  lineValue: number;
  bookName: string;
  source: string | null;
  teamId: string | null;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

export interface MlCal1CaptureEnvelope {
  schemaVersion: typeof ML_CAL_1_CAPTURE_SCHEMA_VERSION;
  producerVersion: typeof ML_CAL_1_CAPTURE_PRODUCER_VERSION;
  captureId: string;
  season: number;
  week: number;
  /** Repository SHA of the capture producer (git rev-parse HEAD in live mode). */
  producerRepositorySha: string;
  /** Deprecated alias of producerRepositorySha. */
  repositorySha: string;
  /** Source SHA claimed by the lifecycle receipt (separate from the producer SHA). */
  lifecycleSourceSha: string | null;
  captureStartTime: string;
  /** End of DB/fixture snapshot reads. */
  snapshotReferenceTime: string;
  /** Deprecated alias of snapshotReferenceTime. */
  captureEndTime: string;
  /** Equals snapshotReferenceTime. */
  predictionReferenceTime: string;
  computationTime: string;
  /** Seal/publish boundary. Provisional until publicationFinalized===true. */
  publicationTime: string;
  publicationFinalized: boolean;
  publicationDowngradedGameIds: string[];
  status: MlCal1CaptureStatus;
  primaryReadinessBlocked: boolean;
  primaryBlockReasons: string[];
  providerCalls: 0;
  businessDataWrites: 0;
  dependencyHashes: MlCal1DependencyHashes;
  timingRule: {
    captureStartTime: string;
    snapshotReferenceTime: string;
    predictionReferenceTimeEquals: 'snapshotReferenceTime';
    captureEndTimeIsAliasOf: 'snapshotReferenceTime';
    marketAsOfUses: 'snapshotReferenceTime';
    marketAgeUses: 'snapshotReferenceTime';
    knownAtUses: 'snapshotReferenceTime';
    computationTime: string;
    publicationTime: string;
    availableForecastRequires: string;
    laterTimestampsNeverSalvageStaleMarkets: true;
    minPreKickoffMs: typeof ML_CAL_1_MIN_PRE_KICKOFF_MS;
    maxMarketAgeSecondsInclusive: typeof ML_CAL_1_MAX_MARKET_AGE_SECONDS;
  };
  lifecycleQualification: {
    qualified: boolean;
    mode: MlCal1LifecycleMode;
    /** True when verified only against fixture claims. Never described as live-accepted. */
    fixtureHypothetical: boolean;
    /** Bytes matched the integrity pin (not live acceptance). */
    receiptIntegrityVerified: boolean;
    liveAccepted: boolean;
    reasons: string[];
    notes: string[];
    receipt: MlCal1LifecycleReceipt | null;
    verifiedReceiptDigest: string | null;
    expectedRatingFingerprint: string | null;
  };
  counts: MlCal1Counts;
}

export interface MlCal1Counts {
  universeGames: number;
  trackedGames: number;
  availableForecasts: number;
  inGateForecasts: number;
  pairedMarkets: number;
  missingMarkets: number;
  selectedBets: number;
  noSelection: number;
  primaryEligibleCandidates: number;
  modelOnlyEligible: number;
}

export interface MlCal1ArtifactBundle {
  envelope: MlCal1CaptureEnvelope;
  universe: {
    rows: MlCal1UniverseRow[];
    duplicateOrConflictReasons: string[];
  };
  inputs: {
    hfaConfigHash: string;
    ratingsByTeamId: Record<string, MlCal1ExportedRatingInput>;
    ratingFingerprint: string;
  };
  forecasts: { rows: MlCal1ForecastRow[] };
  markets: {
    moneyline: MlCal1PairedMarketEvidence[];
    spread: MlCal1SpreadMarketEvidence[];
    candidateRejectionLedger: MlCal1RejectionLedgerEntry[];
  };
}

export interface MlCal1FixtureInput {
  captureId: string;
  season: number;
  week: number;
  /** Producer repository SHA (fixture value, or git rev-parse HEAD in live mode). */
  repositorySha: string;
  captureStartTime: string;
  /** End of snapshot reads. Provide this OR captureEndTime (alias); if both, they must match. */
  snapshotReferenceTime?: string;
  /** Alias of snapshotReferenceTime kept for fixture backward compatibility. */
  captureEndTime?: string;
  games: MlCal1GameMeta[];
  fbsTeamIds: string[];
  ratings: MlCal1RawRatingRow[];
  marketLines: MlCal1MarketLineCandidate[];
  /** Parsed lifecycle claims. */
  lifecycleReceipt: MlCal1LifecycleReceipt | null;
  /** Exact bytes of the claimed receipt artifact. */
  receiptBytes?: string | null;
  /** Integrity pin for receiptBytes (not a live trust record). */
  pinnedReceiptDigest?: string | null;
  /** Defaults to 'fixture_hypothetical'. */
  lifecycleMode?: MlCal1LifecycleMode;
  /**
   * Independently reviewed live trust record. Required for liveAccepted.
   * Fixture hypothetical qualification does not require this.
   */
  trustedAcceptance?: MlCal1TrustedAcceptanceRecord | null;
}

export interface MlCal1PlanOptions {
  /** Clock used for computationTime (and default provisional publicationTime). */
  now?: () => Date;
  /** Provisional publication boundary; the artifact writer re-takes it at seal time. */
  publicationTime?: string;
}

export interface MlCal1PlanResult {
  status: MlCal1CaptureStatus;
  primaryReadinessBlocked: boolean;
  primaryBlockReasons: string[];
  lifecycle: MlCal1LifecycleVerificationResult;
  bundle: MlCal1ArtifactBundle;
}

function toIso(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`invalid_timestamp:${String(value)}`);
  }
  return d.toISOString();
}

function toMs(value: Date | string): number {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`invalid_timestamp:${String(value)}`);
  }
  return d.getTime();
}

function safeMs(value: unknown): number {
  if (value == null) return Number.NaN;
  const d = value instanceof Date ? value : new Date(value as string);
  return d.getTime();
}

function safeIso(value: unknown): string {
  const ms = safeMs(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : `invalid:${String(value)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function sha256Utf8Bytes(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
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

export function sha256Canonical(value: unknown): string {
  return sha256Utf8Bytes(stableStringify(value));
}

export function hashFileUtf8(filePath: string): string {
  return sha256Utf8Bytes(fs.readFileSync(filePath));
}

export function getActiveHfaConfigHash(): string {
  return sha256Canonical(hfaConfigJson);
}

// ---------------------------------------------------------------------------
// R6: redaction and capture-id / path safety
// ---------------------------------------------------------------------------

const SAFE_CAPTURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function assertSafeCaptureId(id: string): void {
  if (typeof id !== 'string' || !SAFE_CAPTURE_ID.test(id)) {
    throw new Error('invalid_capture_id');
  }
}

/** Resolve the capture directory and prove it stays inside rootDir. */
export function resolveCaptureDir(rootDir: string, captureId: string): string {
  assertSafeCaptureId(captureId);
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, captureId);
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('capture_dir_escapes_root');
  }
  return resolved;
}

export function redactSensitive(text: string): string {
  let out = String(text);
  const patterns: RegExp[] = [
    /postgres(?:ql)?:\/\/[^\s"'`<>]+/gi,
    /[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>/:@]+:[^\s"'`<>@]+@[^\s"'`<>]+/gi,
    /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi,
    /\b(?:database_url|direct_url|connection[_-]?string)\s*[=:]\s*[^\s"'`&;,]+/gi,
    /\bpass(?:word|wd)?\s*[=:]\s*[^\s"'`&;,]+/gi,
    /\b(?:x-)?api[_-]?key\s*[=:]\s*[^\s"'`&;,]+/gi,
    /\b(?:secret|token)\s*[=:]\s*[^\s"'`&;,]+/gi,
  ];
  for (const p of patterns) {
    out = out.replace(p, '[REDACTED]');
  }
  return out;
}

// ---------------------------------------------------------------------------
// R1: ratings
// ---------------------------------------------------------------------------

/**
 * Preserve production field precedence from the official Core V1 spread helper:
 *   Number(powerRating || rating || 0)
 * Truthiness is evaluated on the Decimal/object BEFORE Number().
 * Prisma Decimal(0) objects are truthy (valid zero); numeric 0 / null are falsy.
 * When production would default via `|| 0`, this capture path does NOT impute a
 * zero: value is null, chosenField is 'default_zero' and the rating is unusable.
 * This capture path never invokes the Prisma-backed team spread helper.
 */
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

  // Production would evaluate `|| 0` here; never turn that into an available forecast.
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
  // Reject unsupported runtime types that are truthy but not numeric ratings.
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
    // Whitespace-only / blank Decimal-like text must not become Number('') === 0.
    reasons.push('blank_or_whitespace_rating_value');
    return { chosenField, raw, value: null, reasons };
  }

  const trimmed = text.trim();
  const value = Number(trimmed);
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
  if (row.modelVersion !== ML_CAL_1_MODEL_VERSION) {
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
    row.modelVersion === ML_CAL_1_MODEL_VERSION &&
    unavailableReasons.length === 0 &&
    chosen.value != null &&
    Number.isFinite(chosen.value) &&
    (chosen.chosenField === 'powerRating' || chosen.chosenField === 'rating');

  const rowContentHash = sha256Canonical(base);
  return {
    ...base,
    rowContentHash,
    unavailableReasons,
    inputUsable,
  };
}

export function computeDirectV1Margin(options: {
  homeValue: number;
  awayValue: number;
  homeTeamId: string;
  neutralSite: boolean;
}): {
  ratingDiff: number;
  coreSpreadHma: number;
  hfa: MlCal1HfaBreakdown;
} {
  const hfaInfo = computeEffectiveHfa(options.homeTeamId, options.neutralSite);
  const clipRange = (hfaConfigJson as { clipRange: number[] }).clipRange;
  const hfa: MlCal1HfaBreakdown = {
    homeTeamId: options.homeTeamId,
    neutralSite: options.neutralSite,
    hfaConfigHash: getActiveHfaConfigHash(),
    baseHfa: hfaInfo.baseHfa,
    teamAdjustment: hfaInfo.teamAdjustment,
    rawHfa: hfaInfo.rawHfa,
    clipMin: clipRange[0],
    clipMax: clipRange[1],
    effectiveHfa: hfaInfo.effectiveHfa,
  };
  const ratingDiff = options.homeValue - options.awayValue;
  return {
    ratingDiff,
    coreSpreadHma: ratingDiff + hfa.effectiveHfa,
    hfa,
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

// ---------------------------------------------------------------------------
// R3: lifecycle verification
// ---------------------------------------------------------------------------

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/i;

function omitReceiptDigest(value: unknown): unknown {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return value;
  const { receiptDigest: _ignored, ...rest } = value as Record<string, unknown>;
  return rest;
}

/**
 * Verify a lifecycle receipt.
 *
 * Integrity (bytes ↔ digest) is separate from live acceptance. CLI bytes plus a
 * matching caller digest never create a trust record. Live acceptance requires an
 * independently reviewed `trustedAcceptance` binding. Until that exists, live
 * primary qualification remains blocked even when hashing succeeds. Fixture mode
 * may qualify hypothetically (liveAccepted=false) after integrity + policy checks.
 *
 * Note on `receiptDigest`: a receipt cannot contain the hash of its own bytes, so
 * canonical comparison between claims and parsed bytes ignores the `receiptDigest`
 * field; `claims.receiptDigest` must instead equal sha256(receiptBytes), which in
 * turn must equal the integrity pin.
 */
export function qualifyLifecycleReceipt(
  input: MlCal1LifecycleVerificationInput
): MlCal1LifecycleVerificationResult {
  const reasons: string[] = [];
  const notes: string[] = [];
  const mode = input.mode;
  let receiptIntegrityVerified = false;

  const finish = (
    receipt: MlCal1LifecycleReceipt | null,
    verifiedReceiptDigest: string | null,
    opts?: { forceUnqualified?: boolean }
  ): MlCal1LifecycleVerificationResult => {
    // Snapshot policy/integrity reasons before live-trust appends.
    const policyAndIntegrityOk = reasons.length === 0 && receiptIntegrityVerified;
    let qualified = false;
    let liveAccepted = false;

    if (!opts?.forceUnqualified) {
      if (mode === 'fixture_hypothetical') {
        // Offline hypothetical may qualify for primary study prep; never liveAccepted.
        qualified = policyAndIntegrityOk;
      } else if (mode === 'live') {
        const trust = input.trustedAcceptance ?? null;
        if (!trust) {
          reasons.push('lifecycle_trusted_acceptance_missing');
          notes.push(
            'receipt_integrity_is_not_live_acceptance:supply_independently_reviewed_trust_record'
          );
          qualified = false;
        } else if (!policyAndIntegrityOk || !receipt || !verifiedReceiptDigest) {
          if (policyAndIntegrityOk && (!receipt || !verifiedReceiptDigest)) {
            reasons.push('lifecycle_trust_requires_verified_receipt');
          }
          qualified = false;
        } else {
          const trustReasons = matchTrustedAcceptance(
            trust,
            receipt,
            verifiedReceiptDigest,
            input
          );
          if (trustReasons.length > 0) {
            reasons.push(...trustReasons);
            qualified = false;
          } else {
            qualified = true;
            liveAccepted = true;
          }
        }
      }
    }

    return {
      qualified,
      reasons: uniq(reasons),
      mode,
      fixtureHypothetical: mode === 'fixture_hypothetical',
      receiptIntegrityVerified,
      liveAccepted,
      receipt,
      verifiedReceiptDigest,
      lifecycleSourceSha: receipt?.sourceSha ?? null,
      producerRepositorySha: input.captureProducerSha,
      notes,
    };
  };

  if (mode !== 'live' && mode !== 'fixture_hypothetical') {
    reasons.push('lifecycle_mode_invalid');
    return finish(null, null, { forceUnqualified: true });
  }

  const hasBytes = typeof input.receiptBytes === 'string' && input.receiptBytes.length > 0;
  const hasPinned =
    typeof input.pinnedReceiptDigest === 'string' && input.pinnedReceiptDigest.length > 0;

  if (!hasBytes || !hasPinned) {
    reasons.push(
      mode === 'live'
        ? 'lifecycle_verification_unavailable'
        : 'lifecycle_fixture_receipt_bytes_or_pin_missing'
    );
    return finish(input.claims, null, { forceUnqualified: true });
  }

  let claims: MlCal1LifecycleReceipt | null = input.claims;
  let verifiedDigest: string | null = null;
  let integrityReasonsBeforePolicy = 0;

  const actualDigest = sha256Utf8Bytes(Buffer.from(input.receiptBytes as string, 'utf8'));
  verifiedDigest = actualDigest;

  const pinned = String(input.pinnedReceiptDigest).toLowerCase();
  if (!HEX64.test(pinned) || pinned !== actualDigest) {
    reasons.push('lifecycle_receipt_digest_pinned_mismatch');
  }

  if (input.claims) {
    const claimed = String(input.claims.receiptDigest ?? '').toLowerCase();
    if (claimed !== actualDigest) {
      reasons.push('lifecycle_receipt_digest_claim_mismatch');
    }
  }

  let parsed: unknown = null;
  let parsedOk = false;
  try {
    parsed = JSON.parse(input.receiptBytes as string);
    parsedOk = parsed != null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    parsedOk = false;
  }

  if (!parsedOk) {
    reasons.push('lifecycle_receipt_bytes_unparseable');
  } else {
    if (input.claims) {
      if (
        stableStringify(omitReceiptDigest(parsed)) !==
        stableStringify(omitReceiptDigest(input.claims))
      ) {
        reasons.push('lifecycle_claims_do_not_match_receipt_bytes');
      }
    }
    claims = {
      ...(parsed as MlCal1LifecycleReceipt),
      receiptDigest: actualDigest,
    };
  }

  integrityReasonsBeforePolicy = reasons.length;
  // Integrity means digest+parse+claim consistency only (policy checked next).
  const digestIntegrityOk =
    reasons.filter((r) =>
      [
        'lifecycle_receipt_digest_pinned_mismatch',
        'lifecycle_receipt_digest_claim_mismatch',
        'lifecycle_receipt_bytes_unparseable',
        'lifecycle_claims_do_not_match_receipt_bytes',
      ].includes(r)
    ).length === 0;

  if (!claims) {
    if (!reasons.includes('lifecycle_receipt_bytes_unparseable')) {
      reasons.push('lifecycle_receipt_missing');
    }
    return finish(null, verifiedDigest, { forceUnqualified: true });
  }

  const r = claims;
  if (r.acceptedImmutable !== true) {
    reasons.push('lifecycle_receipt_not_accepted_immutable');
  }
  if (r.selectedPolicy !== ML_CAL_1_LIFECYCLE_POLICY) {
    reasons.push('lifecycle_policy_mismatch');
  }

  const weekValid = Number.isInteger(r.completedThroughWeek) && r.completedThroughWeek >= 0;
  if (!weekValid) {
    reasons.push('lifecycle_completed_through_week_invalid');
  } else {
    if (r.canonicalWeight !== b1CanonicalWeight(r.completedThroughWeek)) {
      reasons.push('lifecycle_canonical_weight_inconsistent_with_week');
    }
    if (r.completedThroughWeek >= input.prospectiveWeek) {
      reasons.push('lifecycle_completed_through_week_not_before_prospective_week');
    }
    if (r.completedThroughWeek < ML_CAL_1_FULL_WEIGHT_MIN_COMPLETED_WEEK) {
      reasons.push('lifecycle_completed_through_week_below_full_weight_week');
    }
  }
  if (r.canonicalWeight !== ML_CAL_1_FULL_WEIGHT) {
    reasons.push('lifecycle_weight_not_full');
  }

  if (r.ratingFingerprint !== input.expectedRatingFingerprint) {
    reasons.push('lifecycle_rating_fingerprint_mismatch');
  }

  // Season: explicit on receipt must match; missing season requires external trust binding.
  if (r.season == null) {
    if (mode === 'fixture_hypothetical') {
      reasons.push('lifecycle_season_binding_missing');
    } else {
      // Live: trustedAcceptance must supply season; checked in finish().
      notes.push('lifecycle_receipt_season_absent_requires_external_trust_binding');
    }
  } else if (r.season !== input.expectedSeason) {
    reasons.push('lifecycle_season_mismatch');
  }

  if (!r.receiptDigest || !HEX64.test(String(r.receiptDigest).toLowerCase())) {
    reasons.push('lifecycle_receipt_digest_invalid');
  }
  if (typeof r.sourceSha !== 'string' || !HEX40.test(r.sourceSha)) {
    reasons.push('lifecycle_source_sha_invalid');
  }

  // receiptIntegrityVerified = digest match succeeded (even if policy later fails).
  receiptIntegrityVerified = digestIntegrityOk;
  void integrityReasonsBeforePolicy;

  return finish(r, verifiedDigest);
}

function matchTrustedAcceptance(
  trust: MlCal1TrustedAcceptanceRecord,
  receipt: MlCal1LifecycleReceipt,
  verifiedDigest: string,
  input: MlCal1LifecycleVerificationInput
): string[] {
  const reasons: string[] = [];
  const approved = String(trust.approvedReceiptDigest).toLowerCase();
  if (!HEX64.test(approved) || approved !== verifiedDigest.toLowerCase()) {
    reasons.push('lifecycle_trust_digest_mismatch');
  }
  if (trust.season !== input.expectedSeason) {
    reasons.push('lifecycle_trust_season_mismatch');
  }
  if (receipt.season != null && trust.season !== receipt.season) {
    reasons.push('lifecycle_trust_season_disagrees_with_receipt');
  }
  if (receipt.season == null && trust.season !== input.expectedSeason) {
    reasons.push('lifecycle_trust_season_binding_invalid');
  }
  if (trust.selectedPolicy !== ML_CAL_1_LIFECYCLE_POLICY) {
    reasons.push('lifecycle_trust_policy_mismatch');
  }
  if (trust.selectedPolicy !== receipt.selectedPolicy) {
    reasons.push('lifecycle_trust_policy_disagrees_with_receipt');
  }
  if (trust.completedThroughWeek !== receipt.completedThroughWeek) {
    reasons.push('lifecycle_trust_week_disagrees_with_receipt');
  }
  if (trust.canonicalWeight !== receipt.canonicalWeight) {
    reasons.push('lifecycle_trust_weight_disagrees_with_receipt');
  }
  if (trust.ratingFingerprint !== receipt.ratingFingerprint) {
    reasons.push('lifecycle_trust_fingerprint_disagrees_with_receipt');
  }
  if (trust.ratingFingerprint !== input.expectedRatingFingerprint) {
    reasons.push('lifecycle_trust_fingerprint_mismatch');
  }
  if (
    typeof trust.lifecycleSourceSha !== 'string' ||
    !HEX40.test(trust.lifecycleSourceSha) ||
    trust.lifecycleSourceSha !== receipt.sourceSha
  ) {
    reasons.push('lifecycle_trust_source_sha_mismatch');
  }
  return reasons;
}

export const verifyLifecycleReceipt = qualifyLifecycleReceipt;

// ---------------------------------------------------------------------------
// R4: canonical Git-byte hashes
// ---------------------------------------------------------------------------

export function hashGitBlobContent(bytes: Buffer | string): string {
  return sha256Utf8Bytes(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes);
}

export function containsCrlf(bytes: Buffer | string): boolean {
  const s = typeof bytes === 'string' ? bytes : bytes.toString('latin1');
  return s.includes('\r\n');
}

export function normalizeNewlinesToLf(bytes: string): string;
export function normalizeNewlinesToLf(bytes: Buffer): Buffer;
export function normalizeNewlinesToLf(bytes: Buffer | string): Buffer | string {
  if (typeof bytes === 'string') return bytes.replace(/\r\n/g, '\n');
  return Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

function assertSafeGitArgs(repoRelPath: string, ref: string): void {
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(ref) || ref.startsWith('-')) {
    throw new Error(`invalid_git_ref:${ref}`);
  }
  if (
    repoRelPath.length === 0 ||
    repoRelPath.startsWith('-') ||
    repoRelPath.startsWith('/') ||
    repoRelPath.includes('..') ||
    repoRelPath.includes('\\') ||
    repoRelPath.includes(':')
  ) {
    throw new Error(`invalid_git_path:${repoRelPath}`);
  }
}

/** Exact committed bytes of `relPath` at `ref` (no checkout/autocrlf conversion). */
export function readGitShowBytes(repoRoot: string, relPath: string, ref = 'HEAD'): Buffer {
  assertSafeGitArgs(relPath, ref);
  return execFileSync('git', ['show', `${ref}:${relPath}`], {
    cwd: repoRoot,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Hash the six pinned dependencies (plus capture runner + planner) from Git bytes.
 * Throws when any pinned dependency differs from its canonical hash.
 * `dirty` lists paths whose working-tree content (LF-normalized) differs from Git bytes.
 */
export function resolveCanonicalDependencyHashes(
  repoRoot: string,
  ref = 'HEAD'
): MlCal1DependencyHashes {
  const gitByteHashes: Record<string, string> = {};
  const checkoutRawHashes: Record<string, string> = {};
  const dirty: string[] = [];
  const mismatches: string[] = [];

  const pinnedPaths = Object.keys(ML_CAL_1_CANONICAL_GIT_BYTE_HASHES);
  const allPaths = [
    ...pinnedPaths,
    ...ML_CAL_1_CAPTURE_SELF_PATHS,
    ML_CAL_1_LIFECYCLE_WEIGHT_PATH,
  ];

  for (const rel of allPaths) {
    const checkoutPath = path.join(repoRoot, rel);
    const pinned = (ML_CAL_1_CANONICAL_GIT_BYTE_HASHES as Record<string, string>)[rel];
    const isPinned = pinned !== undefined;

    let gitBytes: Buffer | null = null;
    try {
      gitBytes = readGitShowBytes(repoRoot, rel, ref);
    } catch {
      // Self-paths may be new/uncommitted on the PR branch; pinned paths must exist.
      if (isPinned) {
        mismatches.push(`${rel}:git_show_failed`);
        continue;
      }
      dirty.push(rel);
      if (fs.existsSync(checkoutPath)) {
        const checkoutBytes = fs.readFileSync(checkoutPath);
        checkoutRawHashes[rel] = hashGitBlobContent(checkoutBytes);
        gitByteHashes[rel] = checkoutRawHashes[rel];
      }
      continue;
    }

    const gitHash = hashGitBlobContent(gitBytes);
    gitByteHashes[rel] = gitHash;

    if (isPinned && pinned !== gitHash) {
      mismatches.push(`${rel}:expected=${pinned}:actual=${gitHash}`);
    }

    if (!fs.existsSync(checkoutPath)) {
      dirty.push(rel);
      continue;
    }
    const checkoutBytes = fs.readFileSync(checkoutPath);
    checkoutRawHashes[rel] = hashGitBlobContent(checkoutBytes);
    if (
      hashGitBlobContent(normalizeNewlinesToLf(checkoutBytes)) !==
      hashGitBlobContent(normalizeNewlinesToLf(gitBytes))
    ) {
      dirty.push(rel);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`dependency_git_byte_hash_mismatch:${mismatches.join(',')}`);
  }

  return { gitByteHashes, checkoutRawHashes, dirty };
}

// ---------------------------------------------------------------------------
// Market evidence
// ---------------------------------------------------------------------------

function validateMarketCandidate(
  row: MlCal1MarketLineCandidate,
  snapshotReferenceTime: Date | string,
  expectedGameId: string
): string[] {
  const reasons: string[] = [];
  if (row.gameId !== expectedGameId) reasons.push('game_id_mismatch');
  if (row.source !== ML_CAL_1_LIVE_ODDS_SOURCE) reasons.push('source_mismatch');

  const obsMs = safeMs(row.timestamp);
  const knownAtMs = safeMs(row.createdAt);
  const updatedMs = safeMs(row.updatedAt);
  const refMs = safeMs(snapshotReferenceTime);

  if (
    !Number.isFinite(obsMs) ||
    !Number.isFinite(knownAtMs) ||
    !Number.isFinite(updatedMs) ||
    !Number.isFinite(refMs)
  ) {
    reasons.push('invalid_timestamp');
    return reasons;
  }

  if (obsMs > refMs) reasons.push('observation_timestamp_after_reference');
  if (knownAtMs > refMs) reasons.push('known_at_after_reference');
  if (updatedMs > refMs) {
    // Post-reference revision without accepted immutable capture-time proof.
    reasons.push('updated_at_after_reference_without_immutable_proof');
  }
  if (obsMs < 0 || knownAtMs < 0) reasons.push('invalid_timestamp');

  const ageSec = (refMs - obsMs) / 1000;
  if (ageSec < 0) reasons.push('negative_observation_age');
  if (ageSec > ML_CAL_1_MAX_MARKET_AGE_SECONDS) reasons.push('observation_stale_above_1800s');

  if (!Number.isFinite(row.lineValue) || row.lineValue === 0) {
    reasons.push('invalid_or_zero_price');
  }
  return reasons;
}

function ledgerEntry(
  row: MlCal1MarketLineCandidate,
  gameId: string,
  reasons: string[]
): MlCal1RejectionLedgerEntry {
  return {
    gameId,
    rowId: row.id,
    reasons,
    lineType: row.lineType,
    lineValue: row.lineValue,
    bookName: row.bookName,
    source: row.source ?? null,
    teamId: row.teamId ?? null,
    timestamp: safeIso(row.timestamp),
    createdAt: safeIso(row.createdAt),
    updatedAt: safeIso(row.updatedAt),
  };
}

function emptyPairedEvidence(
  gameId: string,
  overrides: Partial<MlCal1PairedMarketEvidence>
): MlCal1PairedMarketEvidence {
  return {
    gameId,
    available: false,
    rejectionReasons: [],
    observationAgeSeconds: null,
    bookName: null,
    source: null,
    observationTimestamp: null,
    homeRowId: null,
    awayRowId: null,
    homePrice: null,
    awayPrice: null,
    homeCreatedAt: null,
    awayCreatedAt: null,
    homeUpdatedAt: null,
    awayUpdatedAt: null,
    rawImpliedHome: null,
    rawImpliedAway: null,
    overround: null,
    deVigHome: null,
    deVigAway: null,
    ...overrides,
  };
}

function toObservation(r: MlCal1MarketLineCandidate): MarketLineObservation {
  return {
    id: r.id,
    gameId: r.gameId,
    lineType: r.lineType,
    lineValue: r.lineValue,
    bookName: r.bookName,
    timestamp: r.timestamp,
    teamId: r.teamId,
    source: r.source,
  };
}

/**
 * `predictionReferenceTime` here is the snapshotReferenceTime. Never pass a later
 * (computation/publication) timestamp to salvage stale markets.
 */
export function selectAsOfMoneylineEvidence(options: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  predictionReferenceTime: Date | string;
  candidates: MlCal1MarketLineCandidate[];
}): {
  evidence: MlCal1PairedMarketEvidence;
  rejectionLedger: MlCal1RejectionLedgerEntry[];
} {
  const rejectionLedger: MlCal1RejectionLedgerEntry[] = [];
  const eligible: MlCal1MarketLineCandidate[] = [];

  for (const row of options.candidates) {
    if (row.gameId !== options.gameId) continue;
    if (row.lineType !== 'moneyline') continue;
    const reasons = validateMarketCandidate(
      row,
      options.predictionReferenceTime,
      options.gameId
    );
    if (reasons.length > 0) {
      rejectionLedger.push(ledgerEntry(row, options.gameId, reasons));
      continue;
    }
    eligible.push(row);
  }

  // Ambiguity: same book+timestamp+team with multiple rows after filters.
  const frameKeys = new Map<string, string[]>();
  for (const row of eligible) {
    const key = `${row.bookName}|${toIso(row.timestamp)}|${row.teamId ?? ''}|${row.source}`;
    if (!frameKeys.has(key)) frameKeys.set(key, []);
    frameKeys.get(key)!.push(row.id);
  }
  const ambiguousIds = new Set<string>();
  for (const [key, ids] of Array.from(frameKeys.entries())) {
    if (ids.length > 1) {
      for (const id of ids) {
        ambiguousIds.add(id);
        const row = eligible.find((r) => r.id === id)!;
        rejectionLedger.push(
          ledgerEntry(row, options.gameId, [`ambiguous_same_frame:${key}`])
        );
      }
    }
  }
  const clean = eligible.filter((r) => !ambiguousIds.has(r.id));

  const selection = selectGameMarketSnapshots({
    rows: clean.map(toObservation),
    homeTeamId: options.homeTeamId,
    awayTeamId: options.awayTeamId,
    mode: 'current',
  });

  const display = selection.displayMoneyline;
  if (!display) {
    const reasons = ['no_coherent_moneyline_pair'];
    if (selection.incoherentMoneylines.length > 0) {
      reasons.push(
        ...selection.incoherentMoneylines.map((x) => `incoherent:${x.reason}`)
      );
    }
    return {
      evidence: emptyPairedEvidence(options.gameId, { rejectionReasons: reasons }),
      rejectionLedger,
    };
  }

  const homeRow = clean.find((r) => r.id === display.homeRowId);
  const awayRow = clean.find((r) => r.id === display.awayRowId);
  if (!homeRow || !awayRow) {
    return {
      evidence: emptyPairedEvidence(options.gameId, {
        rejectionReasons: ['selected_pair_rows_missing_from_eligible_set'],
        bookName: display.bookName,
        observationTimestamp: display.timestamp,
        homeRowId: display.homeRowId,
        awayRowId: display.awayRowId,
        homePrice: display.homePrice,
        awayPrice: display.awayPrice,
      }),
      rejectionLedger,
    };
  }

  const pairBase: Partial<MlCal1PairedMarketEvidence> = {
    bookName: display.bookName,
    source: homeRow.source,
    observationTimestamp: display.timestamp,
    homeRowId: display.homeRowId,
    awayRowId: display.awayRowId,
    homePrice: display.homePrice,
    awayPrice: display.awayPrice,
    homeCreatedAt: toIso(homeRow.createdAt),
    awayCreatedAt: toIso(awayRow.createdAt),
    homeUpdatedAt: toIso(homeRow.updatedAt),
    awayUpdatedAt: toIso(awayRow.updatedAt),
  };

  // Require same provider/source on both selected rows.
  if (homeRow.source !== awayRow.source || homeRow.source !== ML_CAL_1_LIVE_ODDS_SOURCE) {
    return {
      evidence: emptyPairedEvidence(options.gameId, {
        ...pairBase,
        rejectionReasons: ['provider_or_source_mismatch_on_pair'],
      }),
      rejectionLedger,
    };
  }

  if (homeRow.teamId !== options.homeTeamId || awayRow.teamId !== options.awayTeamId) {
    return {
      evidence: emptyPairedEvidence(options.gameId, {
        ...pairBase,
        rejectionReasons: ['team_orientation_mismatch'],
      }),
      rejectionLedger,
    };
  }

  const ageSec =
    (toMs(options.predictionReferenceTime) - toMs(display.timestamp)) / 1000;
  const rawImpliedHome = americanToProb(display.homePrice);
  const rawImpliedAway = americanToProb(display.awayPrice);
  if (rawImpliedHome == null || rawImpliedAway == null) {
    return {
      evidence: emptyPairedEvidence(options.gameId, {
        ...pairBase,
        rejectionReasons: ['implied_probability_null'],
        observationAgeSeconds: ageSec,
        rawImpliedHome,
        rawImpliedAway,
      }),
      rejectionLedger,
    };
  }

  const overround = rawImpliedHome + rawImpliedAway - 1;
  const sum = rawImpliedHome + rawImpliedAway;
  const deVigHome = sum > 0 ? rawImpliedHome / sum : null;
  const deVigAway = sum > 0 ? rawImpliedAway / sum : null;

  return {
    evidence: emptyPairedEvidence(options.gameId, {
      ...pairBase,
      available: true,
      rejectionReasons: [],
      observationAgeSeconds: ageSec,
      rawImpliedHome,
      rawImpliedAway,
      overround,
      deVigHome,
      deVigAway,
    }),
    rejectionLedger,
  };
}

export function selectAsOfSpreadEvidenceWithLedger(options: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  predictionReferenceTime: Date | string;
  candidates: MlCal1MarketLineCandidate[];
}): {
  evidence: MlCal1SpreadMarketEvidence;
  rejectionLedger: MlCal1RejectionLedgerEntry[];
} {
  const eligible: MlCal1MarketLineCandidate[] = [];
  const rejectionReasons: string[] = [];
  const rejectionLedger: MlCal1RejectionLedgerEntry[] = [];

  for (const row of options.candidates) {
    if (row.gameId !== options.gameId || row.lineType !== 'spread') continue;
    const reasons = validateMarketCandidate(
      row,
      options.predictionReferenceTime,
      options.gameId
    ).filter((r) => r !== 'invalid_or_zero_price'); // spreads may be 0
    // Re-validate finite (0 allowed for pick'em)
    if (!Number.isFinite(row.lineValue)) {
      reasons.push('invalid_spread_value');
    }
    if (reasons.length > 0) {
      rejectionReasons.push(...reasons.map((r) => `${row.id}:${r}`));
      rejectionLedger.push(ledgerEntry(row, options.gameId, reasons));
      continue;
    }
    eligible.push(row);
  }

  const selection = selectGameMarketSnapshots({
    rows: eligible.map(toObservation),
    homeTeamId: options.homeTeamId,
    awayTeamId: options.awayTeamId,
    mode: 'current',
  });

  const display = selection.displaySpread;
  if (!display) {
    return {
      evidence: {
        gameId: options.gameId,
        available: false,
        rejectionReasons:
          rejectionReasons.length > 0 ? rejectionReasons : ['no_coherent_spread_pair'],
        observationAgeSeconds: null,
        bookName: null,
        source: null,
        observationTimestamp: null,
        homeRowId: null,
        awayRowId: null,
        homeLine: null,
        awayLine: null,
        marketSpreadHma: null,
        homeCreatedAt: null,
        awayCreatedAt: null,
        homeUpdatedAt: null,
        awayUpdatedAt: null,
      },
      rejectionLedger,
    };
  }

  const homeRow = eligible.find((r) => r.id === display.homeRowId);
  const awayRow = eligible.find((r) => r.id === display.awayRowId);
  const ageSec =
    (toMs(options.predictionReferenceTime) - toMs(display.timestamp)) / 1000;

  return {
    evidence: {
      gameId: options.gameId,
      available: true,
      rejectionReasons: [],
      observationAgeSeconds: ageSec,
      bookName: display.bookName,
      source: homeRow?.source ?? null,
      observationTimestamp: display.timestamp,
      homeRowId: display.homeRowId,
      awayRowId: display.awayRowId,
      homeLine: display.homeLine,
      awayLine: display.awayLine,
      marketSpreadHma: display.marketSpreadHma,
      homeCreatedAt: homeRow ? toIso(homeRow.createdAt) : null,
      awayCreatedAt: awayRow ? toIso(awayRow.createdAt) : null,
      homeUpdatedAt: homeRow ? toIso(homeRow.updatedAt) : null,
      awayUpdatedAt: awayRow ? toIso(awayRow.updatedAt) : null,
    },
    rejectionLedger,
  };
}

export function selectAsOfSpreadEvidence(options: {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  predictionReferenceTime: Date | string;
  candidates: MlCal1MarketLineCandidate[];
}): MlCal1SpreadMarketEvidence {
  return selectAsOfSpreadEvidenceWithLedger(options).evidence;
}

// ---------------------------------------------------------------------------
// Universe + identity validation
// ---------------------------------------------------------------------------

export function validateGameIdentity(
  games: MlCal1GameMeta[],
  season: number,
  week: number
): Array<{ index: number; gameId: string; reasons: string[] }> {
  const out: Array<{ index: number; gameId: string; reasons: string[] }> = [];
  games.forEach((g, index) => {
    const reasons: string[] = [];
    const label = g.gameId ? g.gameId : `index_${index}`;
    if (typeof g.gameId !== 'string' || g.gameId.length === 0) {
      reasons.push(`game_id_empty:${label}`);
    }
    if (
      typeof g.homeTeamId !== 'string' ||
      g.homeTeamId.length === 0 ||
      typeof g.awayTeamId !== 'string' ||
      g.awayTeamId.length === 0
    ) {
      reasons.push(`team_id_empty:${label}`);
    }
    if (g.homeTeamId && g.homeTeamId === g.awayTeamId) {
      reasons.push(`home_equals_away:${label}`);
    }
    if (g.season !== season) {
      reasons.push(`game_season_mismatch:${label}:${String(g.season)}`);
    }
    if (g.week !== week) {
      reasons.push(`game_week_mismatch:${label}:${String(g.week)}`);
    }
    if (reasons.length > 0) out.push({ index, gameId: g.gameId, reasons });
  });
  return out;
}

export function buildUniverse(options: {
  games: MlCal1GameMeta[];
  fbsTeamIds: Set<string>;
  predictionReferenceTime: Date | string;
}): {
  rows: MlCal1UniverseRow[];
  duplicateOrConflictReasons: string[];
} {
  const duplicateOrConflictReasons: string[] = [];
  const seen = new Map<string, MlCal1GameMeta>();
  const orientationKeys = new Map<string, string[]>();

  for (const g of options.games) {
    if (seen.has(g.gameId)) {
      duplicateOrConflictReasons.push(`duplicate_game_id:${g.gameId}`);
    }
    seen.set(g.gameId, g);
    const orient = [g.homeTeamId, g.awayTeamId].sort().join('|');
    if (!orientationKeys.has(orient)) orientationKeys.set(orient, []);
    orientationKeys.get(orient)!.push(g.gameId);
  }

  for (const [orient, ids] of Array.from(orientationKeys.entries())) {
    if (ids.length > 1) {
      duplicateOrConflictReasons.push(
        `conflicting_or_duplicate_matchup_frame:${orient}:${ids.join(',')}`
      );
    }
  }

  const refMs = toMs(options.predictionReferenceTime);
  const rows: MlCal1UniverseRow[] = options.games.map((g) => {
    const membershipReasons: string[] = [];
    const homeFbs = options.fbsTeamIds.has(g.homeTeamId);
    const awayFbs = options.fbsTeamIds.has(g.awayTeamId);
    if (!homeFbs) membershipReasons.push('home_not_fbs');
    if (!awayFbs) membershipReasons.push('away_not_fbs');
    const bothFbs = homeFbs && awayFbs;

    const exclusionReasons: string[] = [];
    const kickMs = toMs(g.kickoffAsKnown);
    if (kickMs <= refMs) {
      exclusionReasons.push('kickoff_at_or_before_prediction_reference');
    }
    if (!bothFbs) {
      exclusionReasons.push('non_fbs_matchup');
    }

    const tracked = bothFbs; // ledger keeps all; tracked marks FBS/FBS primary universe membership
    return {
      gameId: g.gameId,
      season: g.season,
      week: g.week,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeTeamName: g.homeTeamName,
      awayTeamName: g.awayTeamName,
      kickoffAsKnown: toIso(g.kickoffAsKnown),
      neutralSite: g.neutralSite,
      bothFbs,
      membershipReasons,
      tracked,
      exclusionReasons,
    };
  });

  return { rows, duplicateOrConflictReasons };
}

// ---------------------------------------------------------------------------
// R2: publication eligibility
// ---------------------------------------------------------------------------

function publicationReasons(kickMs: number, publicationMs: number, snapshotMs: number): string[] {
  const reasons: string[] = [];
  if (publicationMs < snapshotMs) reasons.push('publication_before_snapshot_reference');
  if (publicationMs > kickMs - ML_CAL_1_MIN_PRE_KICKOFF_MS) {
    reasons.push('publication_within_30m_of_kickoff_or_later');
  }
  if (publicationMs >= kickMs) reasons.push('publication_at_or_after_kickoff');
  return reasons;
}

function computeCounts(
  universeRows: MlCal1UniverseRow[],
  forecasts: MlCal1ForecastRow[],
  marketsMl: MlCal1PairedMarketEvidence[]
): MlCal1Counts {
  return {
    universeGames: universeRows.length,
    trackedGames: universeRows.filter((r) => r.tracked).length,
    availableForecasts: forecasts.filter((f) => f.forecastAvailable).length,
    inGateForecasts: forecasts.filter((f) => f.inGateForecast).length,
    pairedMarkets: marketsMl.filter((m) => m.available).length,
    missingMarkets: marketsMl.filter((m) => !m.available).length,
    selectedBets: forecasts.filter((f) => f.selectionStatus === 'SELECTED').length,
    noSelection: forecasts.filter((f) => f.selectionStatus === 'NO_SELECTION').length,
    primaryEligibleCandidates: forecasts.filter((f) => f.primaryEligibleCandidate).length,
    modelOnlyEligible: forecasts.filter((f) => f.modelOnlyEligible).length,
  };
}

/**
 * Pure. Re-evaluates every game against the seal/publication boundary and only ever
 * downgrades: clears forecastAvailable / primaryEligibleCandidate / modelOnlyEligible
 * (and model outputs) when publication crossed kickoff - 30 minutes. Returns a new bundle.
 */
export function finalizePublicationEligibility(
  bundle: MlCal1ArtifactBundle,
  publicationTime: Date | string
): MlCal1ArtifactBundle {
  const pubMs = toMs(publicationTime);
  const pubIso = new Date(pubMs).toISOString();
  const out = cloneJson(bundle);
  const snapMs = toMs(out.envelope.snapshotReferenceTime);
  const downgraded: string[] = [];
  const extraBlocks: string[] = [];

  for (const f of out.forecasts.rows) {
    f.publicationTime = pubIso;
    const reasons = publicationReasons(toMs(f.kickoffAsKnown), pubMs, snapMs);
    if (reasons.length === 0) continue;

    if (reasons.includes('publication_before_snapshot_reference')) {
      extraBlocks.push('publication_before_snapshot_reference');
    }
    if (f.forecastAvailable || f.primaryEligibleCandidate || f.modelOnlyEligible) {
      downgraded.push(f.gameId);
    }
    f.lateCapture =
      f.lateCapture ||
      reasons.includes('publication_within_30m_of_kickoff_or_later') ||
      reasons.includes('publication_at_or_after_kickoff');
    f.forecastAvailable = false;
    f.inGateForecast = false;
    f.primaryEligibleCandidate = false;
    f.modelOnlyEligible = false;
    f.coreSpreadHma = null;
    f.modelHomeWinProb = null;
    f.modelAwayWinProb = null;
    f.absSpreadWithinGate = null;
    f.ratingDiff = null;
    f.hfa = null;
    f.selection = null;
    f.selectionStatus = 'FORECAST_UNAVAILABLE';
    f.unavailableReasons = uniq([...f.unavailableReasons, ...reasons]);
    f.selectionReasons = [...f.unavailableReasons];
    f.primaryEligibilityReasons = uniq([
      ...f.primaryEligibilityReasons,
      'forecast_unavailable',
      'not_in_gate',
      'publication_timing_ineligible',
    ]);
  }

  const env = out.envelope;
  env.publicationTime = pubIso;
  env.publicationFinalized = true;
  env.publicationDowngradedGameIds = uniq([...env.publicationDowngradedGameIds, ...downgraded]);
  env.timingRule.publicationTime =
    'seal boundary taken by the artifact writer immediately before eligibility is finalized';
  if (extraBlocks.length > 0) {
    env.primaryBlockReasons = uniq([...env.primaryBlockReasons, ...extraBlocks]);
    env.primaryReadinessBlocked = true;
    env.status = 'PRIMARY_READINESS_BLOCKED';
  }
  env.counts = computeCounts(out.universe.rows, out.forecasts.rows, out.markets.moneyline);
  return out;
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

function resolveSnapshotReferenceTime(input: MlCal1FixtureInput): string {
  const snap = input.snapshotReferenceTime;
  const alias = input.captureEndTime;
  if (snap == null && alias == null) {
    throw new Error('snapshot_reference_time_required');
  }
  if (snap != null && alias != null && toMs(snap) !== toMs(alias)) {
    throw new Error('snapshot_reference_time_capture_end_time_mismatch');
  }
  return toIso((snap ?? alias) as string);
}

export function planMlCal1Capture(
  input: MlCal1FixtureInput,
  options: MlCal1PlanOptions = {}
): MlCal1PlanResult {
  const primaryBlockReasons: string[] = [];
  const identityBlockReasons: string[] = [];

  if (input.season !== ML_CAL_1_SUPPORTED_SEASON) {
    throw new Error(`unsupported_season:${input.season}`);
  }
  if (!Number.isInteger(input.week) || input.week < 1) {
    throw new Error(`invalid_week:${input.week}`);
  }

  const snapshotReferenceTime = resolveSnapshotReferenceTime(input);
  const snapshotMs = toMs(snapshotReferenceTime);
  const captureStartTime = toIso(input.captureStartTime);
  // Reject forged backdated production clocks relative to start.
  if (snapshotMs < toMs(captureStartTime)) {
    throw new Error('snapshot_reference_before_capture_start');
  }

  const now = options.now ?? (() => new Date());
  const computationTime = toIso(now());
  const publicationTime = toIso(options.publicationTime ?? computationTime);
  const publicationMs = toMs(publicationTime);
  if (publicationMs < snapshotMs) {
    primaryBlockReasons.push('publication_before_snapshot_reference');
  }

  const fbsSet = new Set(input.fbsTeamIds);
  const universe = buildUniverse({
    games: input.games,
    fbsTeamIds: fbsSet,
    predictionReferenceTime: snapshotReferenceTime,
  });
  identityBlockReasons.push(...universe.duplicateOrConflictReasons);

  const invalidIdentities = validateGameIdentity(input.games, input.season, input.week);
  const invalidIdentityByIndex = new Map<number, string[]>();
  for (const item of invalidIdentities) {
    invalidIdentityByIndex.set(item.index, item.reasons);
    identityBlockReasons.push(...item.reasons.map((r) => `invalid_game_identity:${r}`));
  }

  // Index ratings; detect duplicates for same composite key.
  const ratingsByKey = new Map<string, MlCal1RawRatingRow[]>();
  for (const r of input.ratings) {
    const key = `${r.season}|${r.teamId}|${r.modelVersion}`;
    if (!ratingsByKey.has(key)) ratingsByKey.set(key, []);
    ratingsByKey.get(key)!.push(r);
  }
  for (const [key, rows] of Array.from(ratingsByKey.entries())) {
    if (rows.length > 1) {
      const relevant =
        rows[0].modelVersion === ML_CAL_1_MODEL_VERSION && rows[0].season === input.season;
      // Duplicates of the rating rows this capture consumes are identity blockers;
      // duplicates of unrelated (other season/model) rows only block primary readiness.
      (relevant ? identityBlockReasons : primaryBlockReasons).push(
        `duplicate_rating_rows:${key}`
      );
    }
  }

  const ratingsByTeamId: Record<string, MlCal1ExportedRatingInput> = {};
  const duplicateRatingTeams = new Set<string>();
  for (const r of input.ratings) {
    if (r.modelVersion !== ML_CAL_1_MODEL_VERSION) continue;
    if (r.season !== input.season) continue;
    const exported = exportRatingInput(r);
    if (ratingsByTeamId[r.teamId]) {
      identityBlockReasons.push(`duplicate_v1_rating_team:${r.teamId}`);
      duplicateRatingTeams.add(r.teamId);
      continue;
    }
    ratingsByTeamId[r.teamId] = exported;
  }
  for (const teamId of Array.from(duplicateRatingTeams)) {
    const entry = ratingsByTeamId[teamId];
    ratingsByTeamId[teamId] = {
      ...entry,
      inputUsable: false,
      unavailableReasons: uniq([...entry.unavailableReasons, 'duplicate_v1_rating_rows']),
    };
  }

  const ratingFingerprint = buildRatingFingerprint(ratingsByTeamId);
  const lifecycleMode: MlCal1LifecycleMode = input.lifecycleMode ?? 'fixture_hypothetical';
  const lifecycle = qualifyLifecycleReceipt({
    mode: lifecycleMode,
    receiptBytes: input.receiptBytes ?? null,
    pinnedReceiptDigest: input.pinnedReceiptDigest ?? null,
    claims: input.lifecycleReceipt,
    expectedRatingFingerprint: ratingFingerprint,
    captureProducerSha: input.repositorySha,
    expectedSeason: input.season,
    prospectiveWeek: input.week,
    trustedAcceptance: input.trustedAcceptance ?? null,
  });
  if (!lifecycle.qualified) {
    primaryBlockReasons.push(...lifecycle.reasons.map((r) => `lifecycle:${r}`));
  }

  const identityBlocked = identityBlockReasons.length > 0;
  primaryBlockReasons.push(...identityBlockReasons);

  const marketsMl: MlCal1PairedMarketEvidence[] = [];
  const marketsSp: MlCal1SpreadMarketEvidence[] = [];
  const candidateRejectionLedger: MlCal1RejectionLedgerEntry[] = [];
  const forecasts: MlCal1ForecastRow[] = [];

  input.games.forEach((game, index) => {
    const urow = universe.rows[index];
    const homeRating = ratingsByTeamId[game.homeTeamId] ?? null;
    const awayRating = ratingsByTeamId[game.awayTeamId] ?? null;

    const unavailableReasons: string[] = [];
    const identityReasons = invalidIdentityByIndex.get(index);
    if (identityReasons) {
      unavailableReasons.push(...identityReasons.map((r) => `invalid_game_identity:${r}`));
    }
    if (!urow.bothFbs) unavailableReasons.push('non_fbs_matchup');
    if (!homeRating) unavailableReasons.push('missing_home_v1_rating');
    if (!awayRating) unavailableReasons.push('missing_away_v1_rating');
    if (homeRating) {
      unavailableReasons.push(...homeRating.unavailableReasons.map((r) => `home:${r}`));
      if (!homeRating.inputUsable && homeRating.unavailableReasons.length === 0) {
        unavailableReasons.push('home:input_not_usable');
      }
    }
    if (awayRating) {
      unavailableReasons.push(...awayRating.unavailableReasons.map((r) => `away:${r}`));
      if (!awayRating.inputUsable && awayRating.unavailableReasons.length === 0) {
        unavailableReasons.push('away:input_not_usable');
      }
    }

    const kickMs = toMs(game.kickoffAsKnown);
    const pubReasons = publicationReasons(kickMs, publicationMs, snapshotMs);
    unavailableReasons.push(...pubReasons);
    const lateCapture = publicationMs > kickMs - ML_CAL_1_MIN_PRE_KICKOFF_MS;

    let coreSpreadHma: number | null = null;
    let ratingDiff: number | null = null;
    let hfa: MlCal1HfaBreakdown | null = null;
    let modelHomeWinProb: number | null = null;
    let modelAwayWinProb: number | null = null;
    let forecastAvailable = false;

    if (
      homeRating?.inputUsable === true &&
      awayRating?.inputUsable === true &&
      homeRating.valueUsed != null &&
      awayRating.valueUsed != null &&
      unavailableReasons.length === 0 &&
      urow.bothFbs
    ) {
      const computed = computeDirectV1Margin({
        homeValue: homeRating.valueUsed,
        awayValue: awayRating.valueUsed,
        homeTeamId: game.homeTeamId,
        neutralSite: game.neutralSite,
      });
      coreSpreadHma = computed.coreSpreadHma;
      ratingDiff = computed.ratingDiff;
      hfa = computed.hfa;
      const probs = modelWinProbsFromCoreSpreadHma(coreSpreadHma);
      modelHomeWinProb = probs.modelHomeWinProb;
      modelAwayWinProb = probs.modelAwayWinProb;
      forecastAvailable = true;
    } else if (unavailableReasons.length === 0) {
      unavailableReasons.push('forecast_inputs_incomplete');
    }

    // Market as-of / age / known-at use snapshotReferenceTime ONLY.
    const mlResult = selectAsOfMoneylineEvidence({
      gameId: game.gameId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      predictionReferenceTime: snapshotReferenceTime,
      candidates: input.marketLines,
    });
    marketsMl.push(mlResult.evidence);
    candidateRejectionLedger.push(...mlResult.rejectionLedger);

    const spResult = selectAsOfSpreadEvidenceWithLedger({
      gameId: game.gameId,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      predictionReferenceTime: snapshotReferenceTime,
      candidates: input.marketLines,
    });
    marketsSp.push(spResult.evidence);
    candidateRejectionLedger.push(...spResult.rejectionLedger);

    const absWithin =
      coreSpreadHma != null ? Math.abs(coreSpreadHma) <= ML_MAX_ABS_SPREAD : null;
    const inGateForecast =
      forecastAvailable && absWithin === true && coreSpreadHma != null;

    const selectionReasons: string[] = [];
    let selectionStatus: MlCal1ForecastRow['selectionStatus'] = 'FORECAST_UNAVAILABLE';
    let selection: CoreV1MoneylinePick | null = null;

    if (!forecastAvailable || coreSpreadHma == null) {
      selectionStatus = 'FORECAST_UNAVAILABLE';
      selectionReasons.push(...unavailableReasons);
    } else if (Math.abs(coreSpreadHma) > ML_MAX_ABS_SPREAD) {
      selectionStatus = 'LARGE_SPREAD_SUPPRESSED';
      selectionReasons.push('abs_spread_above_24');
    } else if (!mlResult.evidence.available) {
      selectionStatus = 'MARKET_UNAVAILABLE';
      selectionReasons.push(...mlResult.evidence.rejectionReasons);
    } else {
      selection = selectCoreV1MoneylinePick({
        coreSpreadHma,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        homeTeamName: game.homeTeamName,
        awayTeamName: game.awayTeamName,
        homeAmericanPrice: mlResult.evidence.homePrice!,
        awayAmericanPrice: mlResult.evidence.awayPrice!,
      });
      if (selection) {
        selectionStatus = 'SELECTED';
      } else {
        selectionStatus = 'NO_SELECTION';
        selectionReasons.push('no_qualifying_value_or_gate');
      }
    }

    const primaryEligibilityReasons: string[] = [];
    if (!lifecycle.qualified) {
      primaryEligibilityReasons.push('lifecycle_not_qualified');
    }
    if (!forecastAvailable) {
      primaryEligibilityReasons.push('forecast_unavailable');
    }
    if (!inGateForecast) {
      primaryEligibilityReasons.push('not_in_gate');
    }
    if (!mlResult.evidence.available) {
      primaryEligibilityReasons.push('paired_market_unavailable');
    }
    if (identityBlocked) {
      primaryEligibilityReasons.push('identity_blocker');
    }
    if (universe.duplicateOrConflictReasons.length > 0) {
      primaryEligibilityReasons.push('universe_frame_conflict');
    }

    const primaryEligibleCandidate =
      !identityBlocked &&
      lifecycle.qualified &&
      forecastAvailable &&
      inGateForecast &&
      mlResult.evidence.available;

    const modelOnlyEligible =
      !identityBlocked && forecastAvailable && inGateForecast && lifecycle.qualified;

    forecasts.push({
      gameId: game.gameId,
      predictionTime: snapshotReferenceTime,
      snapshotReferenceTime,
      publicationTime,
      kickoffAsKnown: toIso(game.kickoffAsKnown),
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      neutralSite: game.neutralSite,
      forecastAvailable,
      unavailableReasons: uniq(unavailableReasons),
      lateCapture,
      coreSpreadHma,
      modelHomeWinProb,
      modelAwayWinProb,
      absSpreadWithinGate: absWithin,
      inGateForecast,
      ratingDiff,
      hfa,
      homeRatingInput: homeRating,
      awayRatingInput: awayRating,
      selectionStatus,
      selection,
      selectionReasons,
      primaryEligibleCandidate,
      primaryEligibilityReasons,
      modelOnlyEligible,
    });
  });

  // Independent reproduction check: exported inputs -> margins.
  for (const f of forecasts) {
    if (!f.forecastAvailable || f.coreSpreadHma == null) continue;
    if (f.homeRatingInput?.valueUsed == null || f.awayRatingInput?.valueUsed == null) {
      primaryBlockReasons.push(`input_reproduction_missing:${f.gameId}`);
      continue;
    }
    const repro = computeDirectV1Margin({
      homeValue: f.homeRatingInput.valueUsed,
      awayValue: f.awayRatingInput.valueUsed,
      homeTeamId: f.homeTeamId,
      neutralSite: f.neutralSite,
    });
    if (repro.coreSpreadHma !== f.coreSpreadHma) {
      primaryBlockReasons.push(`input_reproduction_mismatch:${f.gameId}`);
    }
  }

  // Capture success is evidence emission; primary readiness is separate.
  if (!lifecycle.qualified) {
    primaryBlockReasons.push('primary_blocked_lifecycle');
  }

  const uniqueBlocks = uniq(primaryBlockReasons);
  const primaryReadinessBlocked = uniqueBlocks.length > 0;
  const status: MlCal1CaptureStatus = primaryReadinessBlocked
    ? 'PRIMARY_READINESS_BLOCKED'
    : 'EVIDENCE_CAPTURED';

  const envelope: MlCal1CaptureEnvelope = {
    schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
    producerVersion: ML_CAL_1_CAPTURE_PRODUCER_VERSION,
    captureId: input.captureId,
    season: input.season,
    week: input.week,
    producerRepositorySha: input.repositorySha,
    repositorySha: input.repositorySha,
    lifecycleSourceSha: lifecycle.lifecycleSourceSha,
    captureStartTime,
    snapshotReferenceTime,
    captureEndTime: snapshotReferenceTime,
    predictionReferenceTime: snapshotReferenceTime,
    computationTime,
    publicationTime,
    publicationFinalized: false,
    publicationDowngradedGameIds: [],
    status,
    primaryReadinessBlocked,
    primaryBlockReasons: uniqueBlocks,
    providerCalls: 0,
    businessDataWrites: 0,
    dependencyHashes: { gitByteHashes: {}, dirty: [] }, // filled by runner/writer
    timingRule: {
      captureStartTime:
        'diagnostic only; never used for market as-of, age, or known-at checks',
      snapshotReferenceTime:
        'end of the DB/fixture snapshot reads; this is the predictionReferenceTime',
      predictionReferenceTimeEquals: 'snapshotReferenceTime',
      captureEndTimeIsAliasOf: 'snapshotReferenceTime',
      marketAsOfUses: 'snapshotReferenceTime',
      marketAgeUses: 'snapshotReferenceTime',
      knownAtUses: 'snapshotReferenceTime',
      computationTime: 'when forecast planning ran; diagnostic, not used for market evidence',
      publicationTime:
        'seal boundary taken by the artifact writer immediately before eligibility is finalized (provisional until publicationFinalized)',
      availableForecastRequires:
        'publicationTime <= kickoff - 30 minutes AND publicationTime < kickoff',
      laterTimestampsNeverSalvageStaleMarkets: true,
      minPreKickoffMs: ML_CAL_1_MIN_PRE_KICKOFF_MS,
      maxMarketAgeSecondsInclusive: ML_CAL_1_MAX_MARKET_AGE_SECONDS,
    },
    lifecycleQualification: {
      qualified: lifecycle.qualified,
      mode: lifecycle.mode,
      fixtureHypothetical: lifecycle.fixtureHypothetical,
      receiptIntegrityVerified: lifecycle.receiptIntegrityVerified,
      liveAccepted: lifecycle.liveAccepted,
      reasons: lifecycle.reasons,
      notes: lifecycle.notes,
      receipt: lifecycle.receipt,
      verifiedReceiptDigest: lifecycle.verifiedReceiptDigest,
      expectedRatingFingerprint: ratingFingerprint,
    },
    counts: computeCounts(universe.rows, forecasts, marketsMl),
  };

  return {
    status,
    primaryReadinessBlocked,
    primaryBlockReasons: uniqueBlocks,
    lifecycle,
    bundle: {
      envelope,
      universe: {
        rows: universe.rows,
        duplicateOrConflictReasons: universe.duplicateOrConflictReasons,
      },
      inputs: {
        hfaConfigHash: getActiveHfaConfigHash(),
        ratingsByTeamId,
        ratingFingerprint,
      },
      forecasts: { rows: forecasts },
      markets: {
        moneyline: marketsMl,
        spread: marketsSp,
        candidateRejectionLedger,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Artifact members / manifest / atomic write
// ---------------------------------------------------------------------------

export const ML_CAL_1_BLOCKED_RECEIPT_MEMBER = 'primary-readiness-blocked.json';

export function buildPrimaryReadinessBlockedReceiptBody(bundle: MlCal1ArtifactBundle): string {
  const env = bundle.envelope;
  return `${stableStringify({
    schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
    captureId: env.captureId,
    status: env.status,
    primaryReadinessBlocked: env.primaryReadinessBlocked,
    reasons: env.primaryBlockReasons.map((r) => redactSensitive(r)),
    counts: env.counts,
    snapshotReferenceTime: env.snapshotReferenceTime,
    publicationTime: env.publicationTime,
    providerCalls: 0,
    businessDataWrites: 0,
  })}\n`;
}

/**
 * Members of the sealed capture directory (excluding manifest.json).
 * When primary readiness is blocked, the blocked receipt is a manifested member.
 */
export function buildArtifactMembers(bundle: MlCal1ArtifactBundle): Record<string, string> {
  const members: Record<string, string> = {
    'envelope.json': `${stableStringify(bundle.envelope)}\n`,
    'universe.json': `${stableStringify(bundle.universe)}\n`,
    'inputs.json': `${stableStringify(bundle.inputs)}\n`,
    'forecasts.json': `${stableStringify(bundle.forecasts)}\n`,
    'markets.json': `${stableStringify(bundle.markets)}\n`,
  };
  if (bundle.envelope.primaryReadinessBlocked) {
    members[ML_CAL_1_BLOCKED_RECEIPT_MEMBER] = buildPrimaryReadinessBlockedReceiptBody(bundle);
  }
  return members;
}

export function buildManifest(options: {
  captureId: string;
  members: Record<string, string>;
  dependencyHashes: MlCal1DependencyHashes;
  repositorySha: string;
  producerVersion: string;
  lifecycleSourceSha?: string | null;
  snapshotReferenceTime?: string;
  publicationTime?: string;
}): {
  manifestJson: string;
  manifest: Record<string, unknown>;
  memberDigests: Record<string, { sha256: string; byteCount: number }>;
} {
  const memberDigests: Record<string, { sha256: string; byteCount: number }> = {};
  for (const [name, body] of Object.entries(options.members)) {
    const buf = Buffer.from(body, 'utf8');
    memberDigests[name] = {
      sha256: sha256Utf8Bytes(buf),
      byteCount: buf.byteLength,
    };
  }

  const manifest: Record<string, unknown> = {
    schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
    captureId: options.captureId,
    repositorySha: options.repositorySha,
    producerRepositorySha: options.repositorySha,
    lifecycleSourceSha: options.lifecycleSourceSha ?? null,
    producerVersion: options.producerVersion,
    snapshotReferenceTime: options.snapshotReferenceTime ?? null,
    publicationTime: options.publicationTime ?? null,
    dependencyHashes: options.dependencyHashes,
    members: memberDigests,
    // Explicitly no self-hash field.
  };

  return {
    manifest,
    manifestJson: `${stableStringify(manifest)}\n`,
    memberDigests,
  };
}

/** Effective counts after applying terminal invalidation (sealed bytes unchanged). */
export function computeEffectiveCountsAfterInvalidation(
  bundle: MlCal1ArtifactBundle,
  invalidatedGameIds: string[]
): MlCal1Counts {
  const invalidated = new Set(invalidatedGameIds);
  const forecasts = bundle.forecasts.rows.map((f) => {
    if (!invalidated.has(f.gameId)) return f;
    return {
      ...f,
      forecastAvailable: false,
      lateCapture: true,
      primaryEligibleCandidate: false,
      modelOnlyEligible: false,
      inGateForecast: false,
      unavailableReasons: uniq([
        ...f.unavailableReasons,
        'terminal_publication_invalidated_after_rename',
      ]),
      primaryEligibilityReasons: uniq([
        ...f.primaryEligibilityReasons,
        'terminal_publication_invalidated_after_rename',
      ]),
    };
  });
  return computeCounts(bundle.universe.rows, forecasts, bundle.markets.moneyline);
}

export const ML_CAL_1_TERMINAL_COMPLETION_SUFFIX = '.terminal-completion.json';
export const ML_CAL_1_PUBLICATION_INVALIDATION_SUFFIX =
  '.publication-invalidation.json';

export function terminalCompletionPath(rootDir: string, captureId: string): string {
  return path.join(path.resolve(rootDir), `${captureId}${ML_CAL_1_TERMINAL_COMPLETION_SUFFIX}`);
}

export function publicationInvalidationPathFor(
  rootDir: string,
  captureId: string
): string {
  return path.join(
    path.resolve(rootDir),
    `${captureId}${ML_CAL_1_PUBLICATION_INVALIDATION_SUFFIX}`
  );
}

/**
 * Offline reader: a naked capture directory without a verified terminal completion
 * receipt must fail closed. Returns effective terminal status/counts.
 */
export function readCaptureTerminalResult(options: {
  rootDir: string;
  captureId: string;
}): {
  terminalStatus: MlCal1TerminalStatus;
  manifestSha256: string;
  sealedCounts: MlCal1Counts;
  effectiveCounts: MlCal1Counts;
  invalidatedGameIds: string[];
  terminalReceiptPath: string;
  publicationInvalidationPath: string | null;
} {
  const captureDir = resolveCaptureDir(options.rootDir, options.captureId);
  const terminalPath = terminalCompletionPath(options.rootDir, options.captureId);
  if (!fs.existsSync(terminalPath)) {
    throw new Error('terminal_completion_receipt_missing');
  }
  const terminalRaw = fs.readFileSync(terminalPath, 'utf8');
  let terminal: any;
  try {
    terminal = JSON.parse(terminalRaw);
  } catch {
    throw new Error('terminal_completion_receipt_unparseable');
  }
  if (terminal?.kind !== 'terminal-completion' || terminal?.captureId !== options.captureId) {
    throw new Error('terminal_completion_receipt_invalid');
  }
  const manifestPath = path.join(captureDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('sealed_manifest_missing');
  }
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifestSha = sha256Utf8Bytes(manifestBytes);
  if (terminal.manifestSha256 !== manifestSha) {
    throw new Error('terminal_completion_manifest_digest_mismatch');
  }
  const envelope = JSON.parse(
    fs.readFileSync(path.join(captureDir, 'envelope.json'), 'utf8')
  );
  const sealedCounts = envelope.counts as MlCal1Counts;
  const invalidatedGameIds: string[] = Array.isArray(terminal.invalidatedGameIds)
    ? terminal.invalidatedGameIds
    : [];
  let publicationInvalidationPath: string | null = null;
  if (invalidatedGameIds.length > 0) {
    publicationInvalidationPath = publicationInvalidationPathFor(
      options.rootDir,
      options.captureId
    );
    if (!fs.existsSync(publicationInvalidationPath)) {
      throw new Error('publication_invalidation_receipt_missing');
    }
    const inv = JSON.parse(fs.readFileSync(publicationInvalidationPath, 'utf8'));
    if (inv.manifestSha256 !== manifestSha) {
      throw new Error('publication_invalidation_manifest_digest_mismatch');
    }
  }
  return {
    terminalStatus: terminal.terminalStatus as MlCal1TerminalStatus,
    manifestSha256: manifestSha,
    sealedCounts,
    effectiveCounts: terminal.effectiveCounts as MlCal1Counts,
    invalidatedGameIds,
    terminalReceiptPath: terminalPath,
    publicationInvalidationPath,
  };
}

export function writeCaptureArtifactsAtomic(options: {
  rootDir: string;
  captureId: string;
  bundle: MlCal1ArtifactBundle;
  dependencyHashes: MlCal1DependencyHashes;
  /** Clock for publicationTime (taken first) and the post-rename check. */
  now?: () => Date;
  /** Test hook simulating delay between publicationTime and rename. */
  beforeRename?: () => void;
  /** Test hook: force failure writing the external invalidation receipt. */
  failInvalidationWrite?: boolean;
  /** Test hook: force failure writing the terminal receipt after rename. */
  failTerminalWrite?: boolean;
}): {
  captureDir: string;
  manifestPath: string;
  memberDigests: Record<string, { sha256: string; byteCount: number }>;
  manifestSha256: string;
  publicationTime: string;
  /** Sealed (immutable) bundle — historical evidence; may still show pre-invalidation eligibility. */
  bundle: MlCal1ArtifactBundle;
  publicationInvalidationPath: string | null;
  terminalReceiptPath: string;
  invalidatedGameIds: string[];
  terminalStatus: MlCal1TerminalStatus;
  /** Effective counts after terminal invalidation (use these for CLI success reporting). */
  effectiveCounts: MlCal1Counts;
  primaryReadinessBlockedEffective: boolean;
} {
  const now = options.now ?? (() => new Date());
  const captureDir = resolveCaptureDir(options.rootDir, options.captureId);
  if (fs.existsSync(captureDir)) {
    throw new Error(`capture_directory_exists:${captureDir}`);
  }
  fs.mkdirSync(path.resolve(options.rootDir), { recursive: true });

  // 1. Take publicationTime BEFORE finalizing eligibility.
  const publicationTime = now();

  // 2. Pure finalization against the seal boundary.
  const finalized = finalizePublicationEligibility(options.bundle, publicationTime);
  finalized.envelope.dependencyHashes = options.dependencyHashes;

  // 3. All members (including the blocked receipt when blocked) enter the manifest.
  const members = buildArtifactMembers(finalized);
  const { manifestJson, memberDigests } = buildManifest({
    captureId: options.captureId,
    members,
    dependencyHashes: options.dependencyHashes,
    repositorySha: finalized.envelope.producerRepositorySha,
    producerVersion: finalized.envelope.producerVersion,
    lifecycleSourceSha: finalized.envelope.lifecycleSourceSha,
    snapshotReferenceTime: finalized.envelope.snapshotReferenceTime,
    publicationTime: finalized.envelope.publicationTime,
  });
  const manifestSha256 = sha256Utf8Bytes(Buffer.from(manifestJson, 'utf8'));

  const tmpDir = path.join(
    path.resolve(options.rootDir),
    `.tmp-${options.captureId}-${randomUUID()}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    for (const [name, body] of Object.entries(members)) {
      fs.writeFileSync(path.join(tmpDir, name), body, { encoding: 'utf8', flag: 'wx' });
    }
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), manifestJson, {
      encoding: 'utf8',
      flag: 'wx',
    });

    if (options.beforeRename) options.beforeRename();

    // Never overwrite an existing destination (POSIX rename would replace an empty dir).
    if (fs.existsSync(captureDir)) {
      throw new Error(`capture_directory_exists:${captureDir}`);
    }
    fs.renameSync(tmpDir, captureDir);
  } catch (err) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
    throw err;
  }

  // 4. Post-rename check. Sealed members are never extended; invalidation is external.
  const postCheckTime = now();
  const postMs = postCheckTime.getTime();
  const invalidatedGameIds = finalized.forecasts.rows
    .filter((f) => {
      if (!f.forecastAvailable) return false;
      const kickMs = toMs(f.kickoffAsKnown);
      return postMs > kickMs - ML_CAL_1_MIN_PRE_KICKOFF_MS || postMs >= kickMs;
    })
    .map((f) => f.gameId);

  let publicationInvalidationPath: string | null = null;
  if (invalidatedGameIds.length > 0) {
    publicationInvalidationPath = publicationInvalidationPathFor(
      options.rootDir,
      options.captureId
    );
    if (options.failInvalidationWrite) {
      throw new Error('publication_invalidation_write_forced_failure');
    }
    const invBody = `${stableStringify({
      schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
      kind: 'publication-invalidation',
      captureId: options.captureId,
      manifestSha256,
      publicationTime: finalized.envelope.publicationTime,
      postRenameCheckTime: postCheckTime.toISOString(),
      invalidatedGameIds,
      reasons: [
        'post_rename_check_after_kickoff_minus_30m_for_published_available_forecast',
      ],
      sealedMembersUnchanged: true,
      providerCalls: 0,
      businessDataWrites: 0,
    })}\n`;
    fs.writeFileSync(publicationInvalidationPath, invBody, {
      encoding: 'utf8',
      flag: 'wx',
    });
  }

  const effectiveCounts = computeEffectiveCountsAfterInvalidation(
    finalized,
    invalidatedGameIds
  );
  const terminalStatus: MlCal1TerminalStatus =
    invalidatedGameIds.length > 0
      ? 'PUBLICATION_INVALIDATED'
      : finalized.envelope.primaryReadinessBlocked
        ? 'PRIMARY_READINESS_BLOCKED'
        : 'EVIDENCE_CAPTURED';

  const terminalReceiptPath = terminalCompletionPath(options.rootDir, options.captureId);
  if (options.failTerminalWrite) {
    throw new Error('terminal_completion_write_forced_failure');
  }
  const terminalBody = `${stableStringify({
    schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
    kind: 'terminal-completion',
    captureId: options.captureId,
    manifestSha256,
    publicationTime: finalized.envelope.publicationTime,
    postRenameCheckTime: postCheckTime.toISOString(),
    terminalStatus,
    sealedStatus: finalized.envelope.status,
    sealedPrimaryReadinessBlocked: finalized.envelope.primaryReadinessBlocked,
    sealedCounts: finalized.envelope.counts,
    effectiveCounts,
    invalidatedGameIds,
    publicationInvalidationPath,
    sealedMembersUnchanged: true,
    providerCalls: 0,
    businessDataWrites: 0,
  })}\n`;
  fs.writeFileSync(terminalReceiptPath, terminalBody, {
    encoding: 'utf8',
    flag: 'wx',
  });

  return {
    captureDir,
    manifestPath: path.join(captureDir, 'manifest.json'),
    memberDigests,
    manifestSha256,
    publicationTime: finalized.envelope.publicationTime,
    bundle: finalized,
    publicationInvalidationPath,
    terminalReceiptPath,
    invalidatedGameIds,
    terminalStatus,
    effectiveCounts,
    primaryReadinessBlockedEffective:
      terminalStatus === 'PRIMARY_READINESS_BLOCKED' ||
      terminalStatus === 'PUBLICATION_INVALIDATED',
  };
}

/** Standalone receipt (outside any sealed capture dir), e.g. infrastructure errors. */
export function writeBlockedReasonReceipt(options: {
  path: string;
  captureId: string;
  status: MlCal1CaptureStatus;
  reasons: string[];
  redacted?: Record<string, unknown>;
}): void {
  const body = `${stableStringify({
    schemaVersion: ML_CAL_1_CAPTURE_SCHEMA_VERSION,
    captureId: options.captureId,
    status: options.status,
    reasons: options.reasons.map((r) => redactSensitive(r)),
    redacted: options.redacted ?? {},
    providerCalls: 0,
    businessDataWrites: 0,
  })}\n`;
  fs.writeFileSync(options.path, body, { encoding: 'utf8', flag: 'wx' });
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/** CLI arg validation before any DB access. */
export function parseMlCal1CliArgs(argv: string[]): {
  season: number;
  week: number;
  fixturePath?: string;
  outDir?: string;
  captureId?: string;
  repositorySha?: string;
  lifecycleReceiptPath?: string;
  pinnedLifecycleDigest?: string;
  enableLiveDbRead: boolean;
} {
  let season: number | undefined;
  let week: number | undefined;
  let fixturePath: string | undefined;
  let outDir: string | undefined;
  let captureId: string | undefined;
  let repositorySha: string | undefined;
  let lifecycleReceiptPath: string | undefined;
  let pinnedLifecycleDigest: string | undefined;
  let enableLiveDbRead = false;

  const takeValue = (name: string, inline: string | undefined, i: number): [string, number] => {
    if (inline !== undefined) return [inline, i];
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`missing_value_for_flag:${name}`);
    }
    return [next, i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const a = eq > 0 ? raw.slice(0, eq) : raw;
    const inline = eq > 0 ? raw.slice(eq + 1) : undefined;
    let value: string;

    if (a === '--season') {
      [value, i] = takeValue(a, inline, i);
      season = Number(value);
    } else if (a === '--week') {
      [value, i] = takeValue(a, inline, i);
      week = Number(value);
    } else if (a === '--fixture') {
      [value, i] = takeValue(a, inline, i);
      fixturePath = value;
    } else if (a === '--out') {
      [value, i] = takeValue(a, inline, i);
      outDir = value;
    } else if (a === '--capture-id') {
      [value, i] = takeValue(a, inline, i);
      captureId = value;
    } else if (a === '--repository-sha') {
      [value, i] = takeValue(a, inline, i);
      repositorySha = value;
    } else if (a === '--lifecycle-receipt') {
      [value, i] = takeValue(a, inline, i);
      lifecycleReceiptPath = value;
    } else if (a === '--pinned-lifecycle-digest') {
      [value, i] = takeValue(a, inline, i);
      pinnedLifecycleDigest = value;
    } else if (a === '--enable-live-db-read') {
      enableLiveDbRead = true;
    } else if (
      a === '--mode' ||
      a === '--confirm' ||
      a === '--confirmation' ||
      a === '--commit' ||
      a === '--apply'
    ) {
      throw new Error(
        `unsupported_cli_flag:${a}:ml-cal-1-capture-has-no-commit-mode`
      );
    } else if (a.startsWith('--')) {
      throw new Error(`unsupported_cli_flag:${a}`);
    }
  }

  if (season === undefined) {
    throw new Error('season_required');
  }
  if (season !== ML_CAL_1_SUPPORTED_SEASON) {
    throw new Error(`unsupported_season:${season}`);
  }
  if (week === undefined || !Number.isInteger(week) || week < 1) {
    throw new Error(`invalid_week:${String(week)}`);
  }

  // Live mode derives the producer SHA from git rev-parse HEAD only.
  if (repositorySha !== undefined && !fixturePath) {
    throw new Error('repository_sha_not_allowed_in_live_mode:--repository-sha_requires_--fixture');
  }
  if (repositorySha !== undefined && !HEX40.test(repositorySha)) {
    throw new Error('invalid_repository_sha');
  }
  if (fixturePath && enableLiveDbRead) {
    throw new Error('fixture_and_live_db_read_conflict');
  }
  if (captureId !== undefined) {
    assertSafeCaptureId(captureId);
  }
  if (pinnedLifecycleDigest !== undefined && !HEX64.test(pinnedLifecycleDigest.toLowerCase())) {
    throw new Error('invalid_pinned_lifecycle_digest');
  }

  return {
    season,
    week,
    fixturePath,
    outDir,
    captureId,
    repositorySha,
    lifecycleReceiptPath,
    pinnedLifecycleDigest,
    enableLiveDbRead,
  };
}

// ---------------------------------------------------------------------------
// R5: instrumented read client
// ---------------------------------------------------------------------------

type ReadModel = 'game' | 'teamMembership' | 'teamSeasonRating' | 'marketLine';

interface ModelSelectAllowlist {
  scalars: readonly string[];
  relations: Record<string, readonly string[]>;
}

export const ML_CAL_1_SELECT_ALLOWLIST: Record<ReadModel, ModelSelectAllowlist> = {
  game: {
    scalars: [
      'id',
      'season',
      'week',
      'homeTeamId',
      'awayTeamId',
      'date',
      'neutralSite',
      'status',
    ],
    relations: {
      homeTeam: ['id', 'name'],
      awayTeam: ['id', 'name'],
    },
  },
  teamMembership: {
    scalars: ['teamId', 'level', 'season'],
    relations: {},
  },
  teamSeasonRating: {
    scalars: [
      'season',
      'teamId',
      'modelVersion',
      'powerRating',
      'rating',
      'games',
      'dataSource',
      'createdAt',
      'updatedAt',
    ],
    relations: {},
  },
  marketLine: {
    scalars: [
      'id',
      'gameId',
      'lineType',
      'lineValue',
      'bookName',
      'timestamp',
      'createdAt',
      'updatedAt',
      'teamId',
      'source',
      'season',
      'week',
    ],
    relations: {},
  },
};

const ALLOWED_FIND_MANY_ARGS = ['where', 'select', 'orderBy', 'take', 'skip'];
const MUTATION_METHODS = [
  'create',
  'createMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
];

function assertForbiddenKeyFree(model: string, where: string, key: string): void {
  if (
    (ML_CAL_1_FORBIDDEN_GAME_FIELDS as readonly string[]).includes(key) ||
    FORBIDDEN_KEY_PATTERN.test(key)
  ) {
    throw new Error(`forbidden_${model}_${where}_field:${key}`);
  }
}

function validateSelect(
  model: string,
  select: unknown,
  scalars: readonly string[],
  relations: Record<string, readonly string[]>
): void {
  if (select == null || typeof select !== 'object' || Array.isArray(select)) {
    throw new Error(`select_required:${model}`);
  }
  for (const [key, val] of Object.entries(select as Record<string, unknown>)) {
    assertForbiddenKeyFree(model, 'select', key);
    if (key === 'include') {
      throw new Error(`forbidden_${model}_include`);
    }
    if (scalars.includes(key)) {
      if (val !== true) throw new Error(`invalid_${model}_select_value:${key}`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(relations, key)) {
      if (val == null || typeof val !== 'object' || Array.isArray(val)) {
        throw new Error(`relation_requires_explicit_select:${model}.${key}`);
      }
      const nested = val as Record<string, unknown>;
      for (const nk of Object.keys(nested)) {
        if (nk !== 'select') throw new Error(`forbidden_${model}_relation_arg:${key}.${nk}`);
      }
      validateSelect(`${model}.${key}`, nested.select, relations[key], {});
      continue;
    }
    throw new Error(`unknown_${model}_select_field:${key}`);
  }
}

function collectKeys(node: unknown, visit: (key: string, value: unknown) => void): void {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectKeys(item, visit);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    visit(key, value);
    collectKeys(value, visit);
  }
}

function validateWhere(
  model: ReadModel,
  where: unknown,
  allowedSeason: number,
  allowedWeek: number | undefined
): void {
  if (where == null || typeof where !== 'object' || Array.isArray(where)) {
    throw new Error(`missing_where:${model}`);
  }
  const w = where as Record<string, unknown>;

  collectKeys(w, (key, value) => {
    if (key === 'OR' || key === 'NOT') {
      throw new Error(`forbidden_where_operator:${model}:${key}`);
    }
    assertForbiddenKeyFree(model, 'where', key);
    if (key === 'season' && value !== allowedSeason) {
      throw new Error(`forbidden_season_read:${model}:${JSON.stringify(value)}`);
    }
  });

  if (!('season' in w) || w.season === undefined) {
    throw new Error(`missing_season_filter:${model}`);
  }
  if (w.season !== allowedSeason) {
    throw new Error(`forbidden_season_read:${model}:${JSON.stringify(w.season)}`);
  }

  if (model === 'game' && allowedWeek !== undefined && w.week !== allowedWeek) {
    throw new Error(`forbidden_week_read:game:${JSON.stringify(w.week)}`);
  }

  if (model === 'marketLine') {
    const weekOk = allowedWeek !== undefined && w.week === allowedWeek;
    if (w.week !== undefined && allowedWeek !== undefined && w.week !== allowedWeek) {
      throw new Error(`forbidden_week_read:marketLine:${JSON.stringify(w.week)}`);
    }
    const gid = w.gameId as { in?: unknown } | undefined;
    const gameIdsOk =
      gid != null &&
      typeof gid === 'object' &&
      Array.isArray(gid.in) &&
      gid.in.length > 0 &&
      gid.in.every((x) => typeof x === 'string' && x.length > 0);
    if (!weekOk && !gameIdsOk) {
      throw new Error('marketLine_where_requires_week_or_gameId_in');
    }
  }
}

function validateOrderBy(model: ReadModel, orderBy: unknown): void {
  if (orderBy == null) return;
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  const allowed = ML_CAL_1_SELECT_ALLOWLIST[model].scalars;
  for (const entry of entries) {
    if (entry == null || typeof entry !== 'object') {
      throw new Error(`invalid_orderBy:${model}`);
    }
    for (const key of Object.keys(entry as Record<string, unknown>)) {
      assertForbiddenKeyFree(model, 'orderBy', key);
      if (!allowed.includes(key)) {
        throw new Error(`unknown_${model}_orderBy_field:${key}`);
      }
    }
  }
}

function validateFindManyArgs(
  model: ReadModel,
  args: any,
  allowedSeason: number,
  allowedWeek: number | undefined
): void {
  if (args == null || typeof args !== 'object') {
    throw new Error(`findMany_args_required:${model}`);
  }
  for (const key of Object.keys(args)) {
    if (key === 'include') throw new Error(`forbidden_${model}_include`);
    if (!ALLOWED_FIND_MANY_ARGS.includes(key)) {
      throw new Error(`forbidden_findMany_arg:${model}:${key}`);
    }
  }
  if (args.select === undefined) {
    throw new Error(`select_required:${model}`);
  }
  const allow = ML_CAL_1_SELECT_ALLOWLIST[model];
  validateSelect(model, args.select, allow.scalars, allow.relations);
  validateWhere(model, args.where, allowedSeason, allowedWeek);
  validateOrderBy(model, args.orderBy);
}

export function assertNoForbiddenGameSelect(select: Record<string, unknown>): void {
  collectKeys(select, (key) => {
    assertForbiddenKeyFree('game', 'select', key);
  });
}

export interface MlCal1FindManyDelegate {
  findMany: (args: any) => Promise<unknown>;
}

export interface MlCal1ReadDelegates {
  game: MlCal1FindManyDelegate;
  teamMembership: MlCal1FindManyDelegate;
  teamSeasonRating: MlCal1FindManyDelegate;
  marketLine: MlCal1FindManyDelegate;
}

export interface MlCal1InstrumentedReadClient extends MlCal1ReadDelegates {
  mutations: string[];
  /** Validated findMany calls in order (model + args). */
  reads: Array<{ model: string; args: unknown }>;
  providerCalls: 0;
  [model: string]: any;
}

export function createInstrumentedReadClient(options: {
  allowedSeason: number;
  allowedWeek?: number;
  delegate: MlCal1ReadDelegates;
}): MlCal1InstrumentedReadClient {
  const mutations: string[] = [];
  const reads: Array<{ model: string; args: unknown }> = [];

  const wrapMutation = (model: string, method: string) => {
    return async () => {
      mutations.push(`${model}.${method}`);
      throw new Error(`forbidden_mutation:${model}.${method}`);
    };
  };

  const mutationStubs = (model: string): Record<string, () => Promise<never>> => {
    const stubs: Record<string, () => Promise<never>> = {};
    for (const m of MUTATION_METHODS) stubs[m] = wrapMutation(model, m);
    return stubs;
  };

  const readModel = (model: ReadModel) => ({
    findMany: async (args: any) => {
      validateFindManyArgs(model, args, options.allowedSeason, options.allowedWeek);
      reads.push({ model, args });
      return options.delegate[model].findMany(args);
    },
    ...mutationStubs(model),
  });

  const forbiddenModel = (model: string, readMessage: string) => ({
    findMany: async () => {
      throw new Error(readMessage);
    },
    findFirst: async () => {
      throw new Error(readMessage);
    },
    findUnique: async () => {
      throw new Error(readMessage);
    },
    ...mutationStubs(model),
  });

  return {
    mutations,
    reads,
    providerCalls: 0,
    game: readModel('game'),
    teamMembership: readModel('teamMembership'),
    teamSeasonRating: readModel('teamSeasonRating'),
    marketLine: readModel('marketLine'),
    bet: forbiddenModel('bet', 'forbidden_bet_read'),
    teamGameStat: forbiddenModel('teamGameStat', 'forbidden_team_game_stat_read'),
  } as MlCal1InstrumentedReadClient;
}

export interface MlCal1LiveSnapshotReadResult {
  games: MlCal1GameMeta[];
  fbsTeamIds: string[];
  ratings: MlCal1RawRatingRow[];
  marketLines: MlCal1MarketLineCandidate[];
}

export const ML_CAL_1_GAME_SELECT = {
  id: true,
  season: true,
  week: true,
  homeTeamId: true,
  awayTeamId: true,
  date: true,
  neutralSite: true,
  status: true,
  homeTeam: { select: { id: true, name: true } },
  awayTeam: { select: { id: true, name: true } },
} as const;

export const ML_CAL_1_MEMBERSHIP_SELECT = {
  teamId: true,
  level: true,
  season: true,
} as const;

export const ML_CAL_1_RATING_SELECT = {
  season: true,
  teamId: true,
  modelVersion: true,
  powerRating: true,
  rating: true,
  games: true,
  dataSource: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const ML_CAL_1_MARKET_LINE_SELECT = {
  id: true,
  gameId: true,
  lineType: true,
  lineValue: true,
  bookName: true,
  timestamp: true,
  createdAt: true,
  updatedAt: true,
  teamId: true,
  source: true,
  season: true,
  week: true,
} as const;

/**
 * Pure read helper used by the CLI loader. Accepts any client exposing
 * `findMany` per model (instrumented client or a test fake) and issues the
 * exact production selects.
 */
export async function runMlCal1LiveSnapshotReads(
  client: MlCal1ReadDelegates,
  options: { season: number; week: number }
): Promise<MlCal1LiveSnapshotReadResult> {
  const { season, week } = options;

  const gameRows = (await client.game.findMany({
    where: { season, week },
    select: ML_CAL_1_GAME_SELECT,
    orderBy: { date: 'asc' },
  })) as Array<{
    id: string;
    season: number;
    week: number;
    homeTeamId: string;
    awayTeamId: string;
    date: Date | string;
    neutralSite: boolean;
    status: string | null;
    homeTeam?: { id: string; name: string } | null;
    awayTeam?: { id: string; name: string } | null;
  }>;

  const games: MlCal1GameMeta[] = gameRows.map((g) => ({
    gameId: g.id,
    season: g.season,
    week: g.week,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeTeamName: g.homeTeam?.name ?? '',
    awayTeamName: g.awayTeam?.name ?? '',
    kickoffAsKnown: g.date,
    neutralSite: g.neutralSite,
    status: g.status,
  }));

  const invalid = validateGameIdentity(games, season, week);
  if (invalid.length > 0) {
    throw new Error(
      `invalid_game_identity:${invalid.map((x) => x.reasons.join('|')).join(',')}`
    );
  }

  const memberships = (await client.teamMembership.findMany({
    where: { season, level: 'fbs' },
    select: ML_CAL_1_MEMBERSHIP_SELECT,
  })) as Array<{ teamId: string }>;

  const ratings = (await client.teamSeasonRating.findMany({
    where: { season, modelVersion: ML_CAL_1_MODEL_VERSION },
    select: ML_CAL_1_RATING_SELECT,
  })) as MlCal1RawRatingRow[];

  const gameIds = games.map((g) => g.gameId);
  const marketLines =
    gameIds.length === 0
      ? []
      : ((await client.marketLine.findMany({
          where: {
            season,
            gameId: { in: gameIds },
            source: ML_CAL_1_LIVE_ODDS_SOURCE,
            lineType: { in: ['moneyline', 'spread'] },
          },
          select: ML_CAL_1_MARKET_LINE_SELECT,
        })) as MlCal1MarketLineCandidate[]);

  return {
    games,
    fbsTeamIds: memberships.map((m) => m.teamId),
    ratings,
    marketLines,
  };
}

export { HARD_MIN_ML_VALUE, ML_MAX_ABS_SPREAD, modelWinProbsFromCoreSpreadHma };
