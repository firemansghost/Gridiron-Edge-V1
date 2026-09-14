/**
 * Candidate B V1 immutable derived team-feature snapshot — pure derivation.
 *
 * No Prisma. No provider/fetch. Reuses Generic Shadow sha256CanonicalJson.
 */

import { createHash } from 'crypto';
import { sha256CanonicalJson } from '../../../../web/lib/shadow-model-capture-v1';

export const CANDIDATE_B_SEASON = 2026 as const;
export const CANDIDATE_B_EXPECTED_TEAM_COUNT = 138 as const;
export const CANDIDATE_B_EXPECTED_COMPLETE_VECTOR_COUNT = 103 as const;
export const CANDIDATE_B_EXPECTED_UNAVAILABLE_VECTOR_COUNT = 35 as const;
export const CANDIDATE_B_EXPECTED_PORTAL_AVAILABLE_COUNT = 104 as const;
export const CANDIDATE_B_EXPECTED_PRIOR_CORE_N = 136 as const;
export const CANDIDATE_B_EXPECTED_TALENT_N = 138 as const;
export const CANDIDATE_B_EXPECTED_RETURNING_N = 136 as const;
export const CANDIDATE_B_EXPECTED_PORTAL_N = 104 as const;

export const SNAPSHOT_KIND = 'IMMUTABLE_DERIVED_TEAM_FEATURES_V1';
export const MODEL_FAMILY = 'candidate_b_roster_prior';
export const MODEL_DEFINITION_ID = 'candidate_b_roster_prior_v1';
export const FEATURE_DEFINITION_ID = 'candidate_b_roster_prior_features_v1';
export const FEATURE_DEFINITION_VERSION = 'v1';
export const DERIVATION_DEFINITION_ID = 'candidate_b_roster_prior_derivation_v1';

export const FROZEN_CORE_SHA256 =
  'd1b80a1b98518355bc6a887d08610a4ce5cf592efeaadb4c7a40f266184e0aae';
export const FROZEN_RETURNING_SHA256 =
  'fedfbe805fb628452fdfe9d5ea97da917a4f591b5320c8af448abcca38751449';
export const FROZEN_PORTAL_SHA256 =
  '8ba75badc9f7e8c106e49fa489f2c3f4989a14019ff5f8e720b44f7384003e77';
export const MU_PORTAL_PARITY_EXPECTED = 0.8533690393918453;
export const PORTAL_COVERAGE_GATE = 0.5;
export const COMPOSITE_WEIGHT = 0.25;
export const RATING_SCALE = 3.5;
export const POPULATION_SD_DIVISOR = 'N';

export const CORE_SNAPSHOT_ID = 'cfbd-2025-core-prior-freeze-20260914T061114Z';
export const OPENING_SNAPSHOT_ID = 'cfbd-2026-w01-seed-partial-20260901T153731Z';
export const OPENING_WEEK_DESIGNATION = 'ONE_TIME_OPENING_WEEK_BASELINE';

export const DEFAULT_CORE_SNAPSHOT_DIR =
  '.research-data/cfbd-pit/2025/2026-09-14/cfbd-2025-core-prior-freeze-20260914T061114Z';
export const DEFAULT_OPENING_SNAPSHOT_DIR =
  '.research-data/cfbd-pit/2026/2026-09-01/cfbd-2026-w01-seed-partial-20260901T153731Z';
export const CORE_RAW_RELATIVE = 'raw/ratings_core_2025.json';
export const RETURNING_RAW_RELATIVE = 'raw/player_returning.json';
export const PORTAL_RAW_RELATIVE = 'raw/player_portal.json';

export const CONFIRMATION_PREFIX = 'INGEST_2026_CANDIDATE_B_V1_FEATURE_SNAPSHOT_';

export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';
export type DirectionStatus =
  | 'NO_TRANSFERS'
  | 'SUFFICIENT_RATED_COVERAGE'
  | 'INSUFFICIENT_RATED_COVERAGE';
export type UnavailableReason =
  | 'PRIOR_SEASON_CORE_UNAVAILABLE'
  | 'CURRENT_TALENT_UNAVAILABLE'
  | 'RETURNING_PRODUCTION_UNAVAILABLE'
  | 'PORTAL_FEATURE_UNAVAILABLE'
  | 'TEAM_FEATURE_VECTOR_UNAVAILABLE';
export type ExistingSnapshotState =
  | 'ABSENT'
  | 'EXACT_EXISTING'
  | 'PROVENANCE_ONLY_DIFFERENCE'
  | 'SEMANTIC_CONFLICT'
  | 'CORRUPT_EXISTING';
export type IngestMode = 'PREVIEW' | 'COMMIT';

export const FEATURE_DEFINITION_MANIFEST = {
  featureDefinitionId: FEATURE_DEFINITION_ID,
  featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
  completeVectorRequired: true,
  unavailableNumericEncoding: 'json_null',
  neverZeroFillUnavailable: true,
  incompleteVectorReason: 'TEAM_FEATURE_VECTOR_UNAVAILABLE',
  features: {
    priorCore: {
      concept: 'prior_season_quality',
      source: '2025 CFBD CORE overall',
      field: 'overall',
      year: 2025,
      unavailableIfMissing: true,
      neverZeroFill: true,
      unavailableReason: 'PRIOR_SEASON_CORE_UNAVAILABLE',
    },
    talent: {
      concept: 'current_talent',
      source: '2026 TeamSeasonTalent talentComposite frozen at ingestion',
      field: 'talentComposite',
      season: 2026,
      unavailableIfMissing: true,
      neverZeroFill: true,
      unavailableReason: 'CURRENT_TALENT_UNAVAILABLE',
    },
    returning: {
      concept: 'returning_production',
      source: 'Sep 1 percentPPA opening-week baseline',
      field: 'percentPPA',
      designation: OPENING_WEEK_DESIGNATION,
      unavailableIfMissing: true,
      neverZeroFill: true,
      unavailableReason: 'RETURNING_PRODUCTION_UNAVAILABLE',
    },
    portal: {
      concept: 'portal_rated_mean_quality_delta',
      metric: 'PORTAL_RATED_MEAN_QUALITY_DELTA_V1',
      source: 'Sep 1 portal rated-mean quality delta',
      designation: OPENING_WEEK_DESIGNATION,
      neverStarsFallback: true,
      neverZeroUnknownRatings: true,
      directionAvailabilitySemantics: [
        'INSUFFICIENT_RATED_COVERAGE',
        'NO_TRANSFERS',
        'SUFFICIENT_RATED_COVERAGE',
      ],
      unavailableReason: 'PORTAL_FEATURE_UNAVAILABLE',
    },
  },
} as const;

export const DERIVATION_DEFINITION_MANIFEST = {
  derivationDefinitionId: DERIVATION_DEFINITION_ID,
  hashing: {
    algorithm: 'sha256CanonicalJson',
    source: 'apps/web/lib/shadow-model-capture-v1.ts',
    unavailableReasonsSortedLexicographically: true,
    teamIdsSortedLexicographically: true,
    explicitJsonNulls: true,
    timestampsMustBeIsoStringOrNull: true,
  },
  portal: {
    muPortal: 'arithmetic_mean_of_all_finite_rating_values_in_entire_frozen_portal_payload',
    transferCountZero: {
      directionStatus: 'NO_TRANSFERS',
      centeredDirectionalQuality: 0,
      coverage: null,
      meanRating: null,
    },
    transferCountPositive: {
      ratedCoverage: 'finiteRated / total',
      coverageGate: PORTAL_COVERAGE_GATE,
      coverageExactlyHalfIsAvailable: true,
      insufficientStatus: 'INSUFFICIENT_RATED_COVERAGE',
      sufficientStatus: 'SUFFICIENT_RATED_COVERAGE',
      sufficientQuality: 'mean(finite directional ratings) - muPortal',
    },
    portalRaw: 'inboundCenteredQuality - outboundCenteredQuality',
    neverStarsFallback: true,
    neverInventRatings: true,
  },
  normalization: {
    method: 'population_z_score',
    divisor: POPULATION_SD_DIVISOR,
    eachFeatureOverOwnAvailablePopulation: true,
    requireFinitePopulationSdGreaterThanZero: true,
    noZeroFill: true,
    noMeanImputation: true,
    noClipping: true,
    noWinsorization: true,
  },
  composite: {
    zCore: COMPOSITE_WEIGHT,
    zTalent: COMPOSITE_WEIGHT,
    zReturning: COMPOSITE_WEIGHT,
    zPortal: COMPOSITE_WEIGHT,
  },
  completeVector: {
    requiredFeatures: ['priorCore', 'talent', 'returning', 'portal'],
    otherwise: 'TEAM_FEATURE_VECTOR_UNAVAILABLE',
  },
  secondStage: {
    method: 'population_z_score_of_rawComposite_among_complete_teams',
    divisor: POPULATION_SD_DIVISOR,
  },
  scale: {
    teamRatingPoints: 'compositeZ * 3.5',
    ratingScale: RATING_SCALE,
  },
  nullUnavailableSemantics: 'json_null_never_zero',
} as const;

export const FEATURE_DEFINITION_HASH = sha256CanonicalJson(FEATURE_DEFINITION_MANIFEST);
export const DERIVATION_DEFINITION_HASH = sha256CanonicalJson(DERIVATION_DEFINITION_MANIFEST);

export const TEAM_RESOLUTION_POLICY_ID = 'candidate_b_v1_team_resolution_policy_v1' as const;

export const TEAM_RESOLUTION_POLICY_MANIFEST = {
  policyId: TEAM_RESOLUTION_POLICY_ID,
  provider: 'cfbd',
  authoritativePopulation: {
    source: 'TeamMembership',
    season: 2026,
    level: 'FBS',
    expectedUniqueCount: 138,
  },
  preNormalization: {
    trim: true,
    unicodeDiacriticNormalization: true,
    normalizeAandMToken: true,
    preserveParentheticalQualifier: true,
  },
  acceptedResolutionClasses: [
    'FULL_STRING_GUARD',
    'FULL_STRING_CFBD_ALIAS',
    'FULL_STRING_GENERAL_EXACT_ALIAS',
  ],
  rejectedResolutionClasses: [
    'FUZZY',
    'NORMALIZED_ALIAS',
    'PARENTHETICAL_STRIPPING_ALIAS',
    'SILENT_NON_FBS_TO_FBS_INFERENCE',
    'INVENTED_ALIAS',
    'MANUAL_DERIVATION_REMAP',
  ],
  parentheticalRule: 'IDENTITY_BEARING_UNLESS_EXPLICIT_FULL_STRING_ALIAS_OR_GUARD',
  teamLevelSources: {
    priorCore: {
      requireEverySourceRowResolved: true,
      expectedSourceRows: 136,
      requireUniqueTargetTeamIds: true,
    },
    returning: {
      requireEverySourceRowResolved: true,
      expectedSourceRows: 136,
      requireUniqueTargetTeamIds: true,
    },
  },
  portal: {
    resolveOriginAndDestinationIndependently: true,
    unresolvedCounterpartyAllowed: true,
    retainValidFbsSideWhenCounterpartyUnresolved: true,
    bothSidesRequired: false,
  },
  knownDisposition: {
    'California (PA)': 'UNRESOLVED_NON_FBS',
    'Miami (OH)': 'EXPLICIT_FULL_IDENTITY_RESOLUTION_ALLOWED',
  },
} as const;

export const TEAM_RESOLUTION_POLICY_HASH = sha256CanonicalJson(TEAM_RESOLUTION_POLICY_MANIFEST);
export const FROZEN_TEAM_RESOLUTION_POLICY_HASH =
  'de627563f2c4c2b1e195182bcd6b66dd3226daf9800e209e5f55244f94ea0efe';

if (TEAM_RESOLUTION_POLICY_HASH !== FROZEN_TEAM_RESOLUTION_POLICY_HASH) {
  throw new Error(
    `team_resolution_policy_hash_mismatch:${TEAM_RESOLUTION_POLICY_HASH}!=${FROZEN_TEAM_RESOLUTION_POLICY_HASH}`
  );
}

export const PERSISTENCE_ENCODING_CONTRACT_ID = 'candidate_b_v1_exact_float8_text_encoding_v1' as const;

export const PERSISTENCE_ENCODING_CONTRACT_MANIFEST = {
  contractId: PERSISTENCE_ENCODING_CONTRACT_ID,
  semanticRole: 'NON_SEMANTIC_PERSISTENCE_TRANSPORT',
  targetDatabaseType: 'POSTGRESQL_DOUBLE_PRECISION',
  sourceNumericType: 'JAVASCRIPT_NUMBER_BINARY64',
  finiteRequired: true,
  negativeZeroEncoding: 'POSITIVE_ZERO',
  nullEncoding: 'SQL_NULL',
  decimalTextEncoding: 'JSON_STRINGIFY_FINITE_NUMBER',
  sqlParameterType: 'TEXT',
  postgresConversion: 'EXPLICIT_TEXT_TO_DOUBLE_PRECISION_CAST',
  postReadRepresentation: 'PRISMA_NUMBER',
  integrityRequirement: 'EXACT_BINARY64_EQUALITY',
  rowHashVerification: 'EXACT_138_OF_138',
  snapshotHashVerification: 'EXACT',
  schemaMigrationRequired: false,
} as const;

export const FROZEN_PERSISTENCE_ENCODING_CONTRACT_HASH =
  '644f51274d1630746e579f861ebd22f4e82921be7adb8372cf2fef9d9dbcd343';

export const PERSISTENCE_ENCODING_CONTRACT_HASH = sha256CanonicalJson(PERSISTENCE_ENCODING_CONTRACT_MANIFEST);

if (PERSISTENCE_ENCODING_CONTRACT_HASH !== FROZEN_PERSISTENCE_ENCODING_CONTRACT_HASH) {
  throw new Error(
    `persistence_encoding_contract_hash_mismatch:${PERSISTENCE_ENCODING_CONTRACT_HASH}!=${FROZEN_PERSISTENCE_ENCODING_CONTRACT_HASH}`
  );
}

export const CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS = [
  'priorCoreRaw',
  'talentRaw',
  'returningRaw',
  'portalRaw',
  'zCore',
  'zTalent',
  'zReturning',
  'zPortal',
  'candidateBRawComposite',
  'candidateBCompositeZ',
  'candidateBTeamRatingPoints',
  'inboundRatedCoverage',
  'inboundMeanRating',
  'outboundRatedCoverage',
  'outboundMeanRating',
] as const;

export type CandidateBFloat8TransportField = (typeof CANDIDATE_B_FLOAT8_TRANSPORT_FIELDS)[number];

export function candidateBFloat8StorageText(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('non_finite_float8_storage_value');
  }
  if (Object.is(value, -0)) {
    return '0';
  }
  const text = JSON.stringify(value);
  if (typeof text !== 'string') {
    throw new Error('float8_storage_text_generation_failed');
  }
  return text;
}

export function candidateBNullableFloat8StorageText(value: number | null): string | null {
  if (value === null) return null;
  return candidateBFloat8StorageText(value);
}

export const CANDIDATE_B_ACCEPTED_TEAM_RESOLUTION_METHODS = [
  'guard',
  'cfbd_alias',
  'alias',
] as const;

export type CandidateBAcceptedTeamResolutionMethod =
  (typeof CANDIDATE_B_ACCEPTED_TEAM_RESOLUTION_METHODS)[number];

export function isCandidateBAcceptedTeamResolutionMethod(
  method: string | null
): method is CandidateBAcceptedTeamResolutionMethod {
  return (
    method === 'guard' ||
    method === 'cfbd_alias' ||
    method === 'alias'
  );
}

export interface CandidateBTeamResolveDetailed {
  resolveTeamDetailed(
    providerName: string,
    providerSport: string,
    options?: { provider?: string; strictFullIdentity?: boolean }
  ): { teamId: string | null; method: string | null };
}

export function applyCandidateBCfbdResolutionAcceptance(
  result: { teamId: string | null; method: string | null },
  authoritativeTeamIds: ReadonlySet<string> | readonly string[]
): string | null {
  const allowed =
    authoritativeTeamIds instanceof Set ? authoritativeTeamIds : new Set(authoritativeTeamIds);
  if (!result.teamId || !isCandidateBAcceptedTeamResolutionMethod(result.method)) {
    return null;
  }
  return allowed.has(result.teamId) ? result.teamId : null;
}

export function createCandidateBCfbdFbsResolver(
  resolver: CandidateBTeamResolveDetailed,
  authoritativeTeamIds: string[]
): CfbdTeamResolver {
  const allowed = new Set(authoritativeTeamIds);
  return (providerName: string) => {
    const result = resolver.resolveTeamDetailed(providerName, 'NCAAF', {
      provider: 'cfbd',
      strictFullIdentity: true,
    });
    return applyCandidateBCfbdResolutionAcceptance(result, allowed);
  };
}

export function hasExpectedTeamResolutionPolicyPin(sourceManifest: unknown): boolean {
  if (sourceManifest == null || typeof sourceManifest !== 'object' || Array.isArray(sourceManifest)) {
    return false;
  }
  const teamResolution = (sourceManifest as Record<string, unknown>).teamResolution;
  if (teamResolution == null || typeof teamResolution !== 'object' || Array.isArray(teamResolution)) {
    return false;
  }
  const pin = teamResolution as Record<string, unknown>;
  return (
    pin.policyId === TEAM_RESOLUTION_POLICY_ID &&
    pin.policyHash === TEAM_RESOLUTION_POLICY_HASH &&
    pin.policyHash === FROZEN_TEAM_RESOLUTION_POLICY_HASH
  );
}

const CORE_KEYS = [
  'year',
  'throughSeasonType',
  'throughWeek',
  'team',
  'conference',
  'overall',
  'offense',
  'defense',
  'offensePlays',
  'defensePlays',
  'modelVersion',
] as const;

const RETURNING_KEYS = [
  'season',
  'team',
  'conference',
  'totalPPA',
  'totalPassingPPA',
  'totalReceivingPPA',
  'totalRushingPPA',
  'percentPPA',
  'percentPassingPPA',
  'percentReceivingPPA',
  'percentRushingPPA',
  'usage',
  'passingUsage',
  'receivingUsage',
  'rushingUsage',
] as const;

const PORTAL_KEYS = [
  'season',
  'firstName',
  'lastName',
  'position',
  'origin',
  'destination',
  'transferDate',
  'rating',
  'stars',
  'eligibility',
] as const;

export interface ParsedCoreRow {
  teamName: string;
  overall: number;
}

export interface ParsedReturningRow {
  teamName: string;
  percentPPA: number;
}

export interface ParsedPortalRow {
  originName: string;
  destinationName: string | null;
  rating: number | null;
}

export interface ResolvedPortalTransfer {
  originTeamId: string | null;
  destinationTeamId: string | null;
  rating: number | null;
}

export interface TalentSourceRow {
  teamId: string;
  season: number;
  talentComposite: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  sourceUpdatedAt: Date | string | null;
}

export interface PortalDirectionAggregate {
  transferCount: number;
  ratedCount: number;
  ratedCoverage: number | null;
  directionStatus: DirectionStatus;
  meanRating: number | null;
  centeredQuality: number | null;
}

export interface TeamFeatureRow {
  teamId: string;
  season: number;
  availabilityStatus: AvailabilityStatus;
  unavailableReasons: UnavailableReason[];
  priorCoreRaw: number | null;
  talentRaw: number | null;
  returningRaw: number | null;
  portalRaw: number | null;
  zCore: number | null;
  zTalent: number | null;
  zReturning: number | null;
  zPortal: number | null;
  candidateBRawComposite: number | null;
  candidateBCompositeZ: number | null;
  candidateBTeamRatingPoints: number | null;
  inboundTransferCount: number;
  inboundRatedCount: number;
  inboundRatedCoverage: number | null;
  inboundDirectionStatus: DirectionStatus;
  inboundMeanRating: number | null;
  outboundTransferCount: number;
  outboundRatedCount: number;
  outboundRatedCoverage: number | null;
  outboundDirectionStatus: DirectionStatus;
  outboundMeanRating: number | null;
  rowHash: string;
}

export interface FeaturePopulationStats {
  n: number;
  populationMean: number;
  populationSD: number;
  divisor: typeof POPULATION_SD_DIVISOR;
  min: number;
  max: number;
  unavailableCount: number;
}

export interface NormalizationManifest {
  priorCore: FeaturePopulationStats;
  talent: FeaturePopulationStats;
  returning: FeaturePopulationStats;
  portal: FeaturePopulationStats;
  completeN: number;
  rawCompositePopulationMean: number;
  rawCompositePopulationSD: number;
  divisor: typeof POPULATION_SD_DIVISOR;
  ratingScale: number;
  muPortal: number;
  muPortalParityExpected: number;
}

export interface PopulationManifest {
  season: number;
  authoritativeFbsCount: number;
  teamIds: string[];
  completeVectorCount: number;
  unavailableVectorCount: number;
  portalAvailableCount: number;
}

export interface DerivedSnapshot {
  season: number;
  snapshotKind: typeof SNAPSHOT_KIND;
  modelFamily: typeof MODEL_FAMILY;
  modelDefinitionId: typeof MODEL_DEFINITION_ID;
  featureDefinitionId: typeof FEATURE_DEFINITION_ID;
  featureDefinitionVersion: typeof FEATURE_DEFINITION_VERSION;
  featureDefinitionManifest: typeof FEATURE_DEFINITION_MANIFEST;
  featureDefinitionHash: string;
  derivationDefinitionId: typeof DERIVATION_DEFINITION_ID;
  derivationDefinitionManifest: typeof DERIVATION_DEFINITION_MANIFEST;
  derivationDefinitionHash: string;
  sourceManifest: Record<string, unknown>;
  sourceManifestHash: string;
  sourceProvenanceManifest: Record<string, unknown>;
  sourceProvenanceManifestHash: string;
  normalizationManifest: NormalizationManifest;
  normalizationManifestHash: string;
  populationManifest: PopulationManifest;
  populationManifestHash: string;
  expectedTeamCount: number;
  rowCount: number;
  completeVectorCount: number;
  unavailableVectorCount: number;
  portalAvailableCount: number;
  snapshotHash: string;
  teams: TeamFeatureRow[];
  talentValueHash: string;
  talentProvenanceHash: string;
  muPortal: number;
}

export interface PersistedTeamRow {
  teamId: string;
  season: number;
  availabilityStatus: string;
  unavailableReasons: string[];
  priorCoreRaw: number | null;
  talentRaw: number | null;
  returningRaw: number | null;
  portalRaw: number | null;
  zCore: number | null;
  zTalent: number | null;
  zReturning: number | null;
  zPortal: number | null;
  candidateBRawComposite: number | null;
  candidateBCompositeZ: number | null;
  candidateBTeamRatingPoints: number | null;
  inboundTransferCount: number;
  inboundRatedCount: number;
  inboundRatedCoverage: number | null;
  inboundDirectionStatus: string;
  inboundMeanRating: number | null;
  outboundTransferCount: number;
  outboundRatedCount: number;
  outboundRatedCoverage: number | null;
  outboundDirectionStatus: string;
  outboundMeanRating: number | null;
  rowHash: string;
}

export interface PersistedSnapshot {
  id: string;
  season: number;
  snapshotKind: string;
  modelFamily: string;
  modelDefinitionId: string;
  featureDefinitionId: string;
  featureDefinitionVersion: string;
  featureDefinitionHash: string;
  featureDefinitionManifest: unknown;
  derivationDefinitionId: string;
  derivationDefinitionHash: string;
  derivationDefinitionManifest: unknown;
  sourceManifest: unknown;
  sourceManifestHash: string;
  sourceProvenanceManifest: unknown;
  sourceProvenanceManifestHash: string;
  normalizationManifest: unknown;
  normalizationManifestHash: string;
  populationManifest: unknown;
  populationManifestHash: string;
  expectedTeamCount: number;
  rowCount: number;
  completeVectorCount: number;
  unavailableVectorCount: number;
  portalAvailableCount: number;
  snapshotHash: string;
  teams: PersistedTeamRow[];
}

export interface CandidateBFeatureSnapshotTx {
  loadExistingByStableIdentity(): Promise<PersistedSnapshot | null>;
  insertSnapshot(snapshot: DerivedSnapshot, repoCommitSha: string, derivedAt: Date): Promise<void>;
}

export interface CandidateBFeatureSnapshotStore {
  loadAuthoritativeFbsMembership(season: number): Promise<Array<{ teamId: string; level: string }>>;
  loadTalent(season: number, teamIds: string[]): Promise<TalentSourceRow[]>;
  loadExistingByStableIdentity(): Promise<PersistedSnapshot | null>;
  runSerializable<T>(fn: (tx: CandidateBFeatureSnapshotTx) => Promise<T>): Promise<T>;
}

export type CfbdTeamResolver = (providerName: string) => string | null;

export interface IngestReport {
  mode: IngestMode;
  season: number;
  providerCalls: 0;
  repoCommitSha: string;
  sourceHashVerification: {
    core: string;
    returning: string;
    portal: string;
  };
  talentValueHash: string;
  talentProvenanceHash: string;
  featureDefinitionHash: string;
  derivationDefinitionHash: string;
  sourceManifestHash: string;
  sourceProvenanceManifestHash: string;
  normalizationManifestHash: string;
  populationManifestHash: string;
  snapshotHash: string;
  expectedConfirmation: string;
  authoritativeTeamCount: number;
  rowCount: number;
  portalAvailableCount: number;
  completeVectorCount: number;
  unavailableVectorCount: number;
  featurePopulationStats: NormalizationManifest;
  unavailableTeams: Array<{ teamId: string; unavailableReasons: UnavailableReason[] }>;
  existingState: ExistingSnapshotState;
  blockers: string[];
  writeSafe: boolean;
  commitEligible: boolean;
  commitSucceeded: boolean;
  persistenceCommitted: boolean;
  alreadyPresent: boolean;
  postWriteVerificationOk: boolean | null;
  provenanceOnlyDifference: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function assertExactKeys(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}_not_object`);
  }
  const rec = value as Record<string, unknown>;
  const actual = Object.keys(rec).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
    throw new Error(`${label}_schema_mismatch`);
  }
  return rec;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label}_not_string`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}_not_finite_number`);
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw new Error(`${label}_not_string_or_null`);
}

function requireNullableNumber(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'number') throw new Error(`${label}_not_finite_number`);
  throw new Error(`${label}_not_number_or_null`);
}

export function sha256RawBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function parseVerifiedFrozenJson(
  bytes: Buffer,
  expectedSha256: string,
  label: string
): { bytes: Buffer; sha256: string; json: unknown } {
  const sha256 = sha256RawBytes(bytes);
  if (sha256 !== expectedSha256) {
    throw new Error(`${label}_sha_mismatch:${sha256}`);
  }
  return { bytes, sha256, json: JSON.parse(bytes.toString('utf8')) };
}

export function toIsoStringOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function expectedCandidateBFeatureSnapshotConfirmation(snapshotHash: string): string {
  if (!/^[0-9a-f]{64}$/.test(snapshotHash)) {
    throw new Error('snapshot_hash_not_64_char_hex');
  }
  return `${CONFIRMATION_PREFIX}${snapshotHash}`;
}

export function sortReasons(reasons: string[]): string[] {
  return [...reasons].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function assertAuthoritativeFbsPopulation(
  rows: Array<{ teamId: string; level: string }>,
  expectedCount: number = CANDIDATE_B_EXPECTED_TEAM_COUNT
): string[] {
  const fbs = rows.filter((r) => String(r.level).toLowerCase() === 'fbs');
  const seen = new Map<string, number>();
  for (const row of fbs) {
    const id = String(row.teamId ?? '').trim();
    if (!id) throw new Error('authoritative_team_id_blank');
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id).sort();
  if (duplicates.length > 0) {
    throw new Error(`duplicate_fbs_membership:${duplicates.join(',')}`);
  }
  if (seen.size !== expectedCount) {
    throw new Error(`authoritative_fbs_count_mismatch:${seen.size}!=${expectedCount}`);
  }
  return [...seen.keys()].sort();
}

export function parseFrozenCorePayload(json: unknown): ParsedCoreRow[] {
  if (!Array.isArray(json)) throw new Error('core_payload_not_array');
  const rows: ParsedCoreRow[] = [];
  const names = new Set<string>();
  for (const item of json) {
    const rec = assertExactKeys(item, CORE_KEYS, 'core_row');
    if (rec.year !== 2025) throw new Error('core_year_not_2025');
    if (rec.modelVersion !== 'core-v1') throw new Error('core_model_version_not_core-v1');
    requireString(rec.throughSeasonType, 'core.throughSeasonType');
    requireNumber(rec.throughWeek, 'core.throughWeek');
    requireString(rec.conference, 'core.conference');
    requireNumber(rec.offense, 'core.offense');
    requireNumber(rec.defense, 'core.defense');
    requireNumber(rec.offensePlays, 'core.offensePlays');
    requireNumber(rec.defensePlays, 'core.defensePlays');
    const teamName = requireString(rec.team, 'core.team');
    if (names.has(teamName)) throw new Error(`core_duplicate_team_name:${teamName}`);
    names.add(teamName);
    rows.push({ teamName, overall: requireNumber(rec.overall, 'core.overall') });
  }
  return rows;
}

export function parseFrozenReturningPayload(json: unknown): ParsedReturningRow[] {
  if (!Array.isArray(json)) throw new Error('returning_payload_not_array');
  const rows: ParsedReturningRow[] = [];
  const names = new Set<string>();
  for (const item of json) {
    const rec = assertExactKeys(item, RETURNING_KEYS, 'returning_row');
    if (rec.season !== 2026) throw new Error('returning_season_not_2026');
    requireString(rec.conference, 'returning.conference');
    requireNumber(rec.totalPPA, 'returning.totalPPA');
    requireNumber(rec.totalPassingPPA, 'returning.totalPassingPPA');
    requireNumber(rec.totalReceivingPPA, 'returning.totalReceivingPPA');
    requireNumber(rec.totalRushingPPA, 'returning.totalRushingPPA');
    requireNumber(rec.percentPassingPPA, 'returning.percentPassingPPA');
    requireNumber(rec.percentReceivingPPA, 'returning.percentReceivingPPA');
    requireNumber(rec.percentRushingPPA, 'returning.percentRushingPPA');
    requireNumber(rec.usage, 'returning.usage');
    requireNumber(rec.passingUsage, 'returning.passingUsage');
    requireNumber(rec.receivingUsage, 'returning.receivingUsage');
    requireNumber(rec.rushingUsage, 'returning.rushingUsage');
    const teamName = requireString(rec.team, 'returning.team');
    if (names.has(teamName)) throw new Error(`returning_duplicate_team_name:${teamName}`);
    names.add(teamName);
    rows.push({
      teamName,
      percentPPA: requireNumber(rec.percentPPA, 'returning.percentPPA'),
    });
  }
  return rows;
}

export function parseFrozenPortalPayload(json: unknown): ParsedPortalRow[] {
  if (!Array.isArray(json)) throw new Error('portal_payload_not_array');
  const rows: ParsedPortalRow[] = [];
  for (const item of json) {
    const rec = assertExactKeys(item, PORTAL_KEYS, 'portal_row');
    if (rec.season !== 2026) throw new Error('portal_season_not_2026');
    requireString(rec.firstName, 'portal.firstName');
    requireString(rec.lastName, 'portal.lastName');
    requireString(rec.position, 'portal.position');
    requireString(rec.transferDate, 'portal.transferDate');
    requireString(rec.eligibility, 'portal.eligibility');
    requireNullableNumber(rec.stars, 'portal.stars');
    rows.push({
      originName: requireString(rec.origin, 'portal.origin'),
      destinationName: requireNullableString(rec.destination, 'portal.destination'),
      rating: requireNullableNumber(rec.rating, 'portal.rating'),
    });
  }
  return rows;
}

export function calculateMuPortal(rows: Array<{ rating: number | null }>): number {
  const finite = rows.map((r) => r.rating).filter(isFiniteNumber);
  if (finite.length === 0) throw new Error('mu_portal_no_finite_ratings');
  // Compensated summation keeps payload order and matches the frozen audit mean.
  let sum = 0;
  let compensation = 0;
  for (const value of finite) {
    const y = value - compensation;
    const t = sum + y;
    compensation = t - sum - y;
    sum = t;
  }
  return sum / finite.length;
}

export function assertMuPortalParity(muPortal: number): void {
  if (muPortal !== MU_PORTAL_PARITY_EXPECTED) {
    throw new Error(`mu_portal_parity_mismatch:${muPortal}!=${MU_PORTAL_PARITY_EXPECTED}`);
  }
}

export function resolveNamedTeamsToFbs(
  names: string[],
  resolve: CfbdTeamResolver,
  authoritativeTeamIds: string[],
  label: string
): Map<string, string> {
  const authoritative = new Set(authoritativeTeamIds);
  const out = new Map<string, string>();
  const used = new Map<string, string>();
  for (const name of names) {
    const resolved = resolve(name);
    if (!resolved || !authoritative.has(resolved)) {
      throw new Error(`${label}_unresolved_or_non_fbs:${name}`);
    }
    const prior = used.get(resolved);
    if (prior && prior !== name) {
      throw new Error(`${label}_duplicate_resolved_team:${resolved}`);
    }
    used.set(resolved, name);
    out.set(name, resolved);
  }
  return out;
}

export function resolvePortalCounterpart(
  name: string | null,
  resolve: CfbdTeamResolver,
  authoritativeTeamIds: string[]
): string | null {
  if (name == null || name === '') return null;
  const resolved = resolve(name);
  if (!resolved) return null;
  return authoritativeTeamIds.includes(resolved) ? resolved : null;
}

export function populationStats(values: number[]): Omit<FeaturePopulationStats, 'unavailableCount' | 'divisor'> & {
  divisor: typeof POPULATION_SD_DIVISOR;
} {
  const n = values.length;
  if (n === 0) throw new Error('population_empty');
  const populationMean = values.reduce((sum, x) => sum + x, 0) / n;
  const populationVariance =
    values.reduce((sum, x) => sum + (x - populationMean) * (x - populationMean), 0) / n;
  const populationSD = Math.sqrt(populationVariance);
  if (!(populationSD > 0) || !Number.isFinite(populationSD)) {
    throw new Error('population_sd_not_finite_positive');
  }
  return {
    n,
    populationMean,
    populationSD,
    divisor: POPULATION_SD_DIVISOR,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function zScore(value: number, mean: number, sd: number): number {
  return (value - mean) / sd;
}

export function hashTalentValues(rows: Array<{ teamId: string; season: number; talentComposite: number }>): string {
  const sorted = [...rows].sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  return sha256CanonicalJson(
    sorted.map((r) => ({
      teamId: r.teamId,
      season: r.season,
      talentComposite: r.talentComposite,
    }))
  );
}

export function hashTalentProvenance(
  rows: Array<{
    teamId: string;
    season: number;
    createdAt: Date | string | null;
    updatedAt: Date | string | null;
    sourceUpdatedAt: Date | string | null;
  }>
): string {
  const sorted = [...rows].sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  return sha256CanonicalJson(
    sorted.map((r) => ({
      teamId: r.teamId,
      season: r.season,
      createdAt: toIsoStringOrNull(r.createdAt),
      updatedAt: toIsoStringOrNull(r.updatedAt),
      sourceUpdatedAt: toIsoStringOrNull(r.sourceUpdatedAt),
    }))
  );
}

export function assertTalentPopulation(
  rows: TalentSourceRow[],
  teamIds: string[]
): TalentSourceRow[] {
  if (rows.length !== teamIds.length) {
    throw new Error(`talent_row_count_mismatch:${rows.length}!=${teamIds.length}`);
  }
  const byId = new Map<string, TalentSourceRow>();
  for (const row of rows) {
    if (row.season !== CANDIDATE_B_SEASON) throw new Error('talent_season_not_2026');
    if (!isFiniteNumber(row.talentComposite)) throw new Error(`talent_not_finite:${row.teamId}`);
    if (byId.has(row.teamId)) throw new Error(`talent_duplicate:${row.teamId}`);
    byId.set(row.teamId, row);
  }
  for (const id of teamIds) {
    if (!byId.has(id)) throw new Error(`talent_missing:${id}`);
  }
  if (byId.size !== teamIds.length) throw new Error('talent_membership_mismatch');
  return teamIds.map((id) => byId.get(id)!);
}

export function emptyDirection(): PortalDirectionAggregate {
  return {
    transferCount: 0,
    ratedCount: 0,
    ratedCoverage: null,
    directionStatus: 'NO_TRANSFERS',
    meanRating: null,
    centeredQuality: 0,
  };
}

export function aggregatePortalDirection(
  ratings: Array<number | null>,
  muPortal: number
): PortalDirectionAggregate {
  const transferCount = ratings.length;
  if (transferCount === 0) return emptyDirection();
  const finite = ratings.filter(isFiniteNumber);
  const ratedCount = finite.length;
  const ratedCoverage = ratedCount / transferCount;
  if (ratedCoverage < PORTAL_COVERAGE_GATE) {
    return {
      transferCount,
      ratedCount,
      ratedCoverage,
      directionStatus: 'INSUFFICIENT_RATED_COVERAGE',
      meanRating: null,
      centeredQuality: null,
    };
  }
  const meanRating = finite.reduce((sum, n) => sum + n, 0) / finite.length;
  return {
    transferCount,
    ratedCount,
    ratedCoverage,
    directionStatus: 'SUFFICIENT_RATED_COVERAGE',
    meanRating,
    centeredQuality: meanRating - muPortal,
  };
}

export function aggregatePortalByTeam(
  teamIds: string[],
  transfers: ResolvedPortalTransfer[],
  muPortal: number
): Map<string, { inbound: PortalDirectionAggregate; outbound: PortalDirectionAggregate; portalRaw: number | null }> {
  const inbound = new Map<string, Array<number | null>>();
  const outbound = new Map<string, Array<number | null>>();
  for (const id of teamIds) {
    inbound.set(id, []);
    outbound.set(id, []);
  }
  for (const row of transfers) {
    if (row.originTeamId && outbound.has(row.originTeamId)) {
      outbound.get(row.originTeamId)!.push(row.rating);
    }
    if (row.destinationTeamId && inbound.has(row.destinationTeamId)) {
      inbound.get(row.destinationTeamId)!.push(row.rating);
    }
  }
  const out = new Map<
    string,
    { inbound: PortalDirectionAggregate; outbound: PortalDirectionAggregate; portalRaw: number | null }
  >();
  for (const id of teamIds) {
    const inAgg = aggregatePortalDirection(inbound.get(id)!, muPortal);
    const outAgg = aggregatePortalDirection(outbound.get(id)!, muPortal);
    const bothAvailable =
      (inAgg.directionStatus === 'NO_TRANSFERS' || inAgg.directionStatus === 'SUFFICIENT_RATED_COVERAGE') &&
      (outAgg.directionStatus === 'NO_TRANSFERS' || outAgg.directionStatus === 'SUFFICIENT_RATED_COVERAGE');
    const portalRaw =
      bothAvailable && inAgg.centeredQuality != null && outAgg.centeredQuality != null
        ? inAgg.centeredQuality - outAgg.centeredQuality
        : null;
    out.set(id, { inbound: inAgg, outbound: outAgg, portalRaw });
  }
  return out;
}

export function teamRowHashPayload(row: Omit<TeamFeatureRow, 'rowHash'>): Record<string, unknown> {
  return {
    teamId: row.teamId,
    season: row.season,
    availabilityStatus: row.availabilityStatus,
    unavailableReasons: sortReasons(row.unavailableReasons),
    priorCoreRaw: row.priorCoreRaw,
    talentRaw: row.talentRaw,
    returningRaw: row.returningRaw,
    portalRaw: row.portalRaw,
    zCore: row.zCore,
    zTalent: row.zTalent,
    zReturning: row.zReturning,
    zPortal: row.zPortal,
    candidateBRawComposite: row.candidateBRawComposite,
    candidateBCompositeZ: row.candidateBCompositeZ,
    candidateBTeamRatingPoints: row.candidateBTeamRatingPoints,
    inboundTransferCount: row.inboundTransferCount,
    inboundRatedCount: row.inboundRatedCount,
    inboundRatedCoverage: row.inboundRatedCoverage,
    inboundDirectionStatus: row.inboundDirectionStatus,
    inboundMeanRating: row.inboundMeanRating,
    outboundTransferCount: row.outboundTransferCount,
    outboundRatedCount: row.outboundRatedCount,
    outboundRatedCoverage: row.outboundRatedCoverage,
    outboundDirectionStatus: row.outboundDirectionStatus,
    outboundMeanRating: row.outboundMeanRating,
  };
}

export function computeRowHash(row: Omit<TeamFeatureRow, 'rowHash'>): string {
  return sha256CanonicalJson(teamRowHashPayload(row));
}

export function computeSnapshotHash(input: {
  season: number;
  snapshotKind: string;
  modelFamily: string;
  modelDefinitionId: string;
  featureDefinitionId: string;
  featureDefinitionVersion: string;
  featureDefinitionHash: string;
  derivationDefinitionId: string;
  derivationDefinitionHash: string;
  sourceManifestHash: string;
  normalizationManifestHash: string;
  populationManifestHash: string;
  expectedTeamCount: number;
  rowCount: number;
  completeVectorCount: number;
  unavailableVectorCount: number;
  portalAvailableCount: number;
  teams: Array<{ teamId: string; rowHash: string }>;
}): string {
  const teamRowHashes = [...input.teams]
    .map((t) => ({ teamId: t.teamId, rowHash: t.rowHash }))
    .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  return sha256CanonicalJson({
    season: input.season,
    snapshotKind: input.snapshotKind,
    modelFamily: input.modelFamily,
    modelDefinitionId: input.modelDefinitionId,
    featureDefinitionId: input.featureDefinitionId,
    featureDefinitionVersion: input.featureDefinitionVersion,
    featureDefinitionHash: input.featureDefinitionHash,
    derivationDefinitionId: input.derivationDefinitionId,
    derivationDefinitionHash: input.derivationDefinitionHash,
    sourceManifestHash: input.sourceManifestHash,
    normalizationManifestHash: input.normalizationManifestHash,
    populationManifestHash: input.populationManifestHash,
    expectedTeamCount: input.expectedTeamCount,
    rowCount: input.rowCount,
    completeVectorCount: input.completeVectorCount,
    unavailableVectorCount: input.unavailableVectorCount,
    portalAvailableCount: input.portalAvailableCount,
    teamRowHashes,
  });
}

function featureStats(values: Array<number | null>, teamCount: number): FeaturePopulationStats {
  const available = values.filter(isFiniteNumber);
  const stats = populationStats(available);
  return { ...stats, unavailableCount: teamCount - available.length };
}

export function deriveCandidateBSnapshot(input: {
  teamIds: string[];
  priorCoreByTeamId: Map<string, number>;
  talentByTeamId: Map<string, number>;
  returningByTeamId: Map<string, number>;
  portalByTeamId: Map<
    string,
    { inbound: PortalDirectionAggregate; outbound: PortalDirectionAggregate; portalRaw: number | null }
  >;
  muPortal: number;
  sourceManifest: Record<string, unknown>;
  sourceProvenanceManifest: Record<string, unknown>;
  talentValueHash: string;
  talentProvenanceHash: string;
}): DerivedSnapshot {
  const teamIds = [...input.teamIds].sort();
  const priorValues = teamIds.map((id) => input.priorCoreByTeamId.get(id) ?? null);
  const talentValues = teamIds.map((id) => input.talentByTeamId.get(id) ?? null);
  const returningValues = teamIds.map((id) => input.returningByTeamId.get(id) ?? null);
  const portalValues = teamIds.map((id) => input.portalByTeamId.get(id)?.portalRaw ?? null);

  const priorStats = featureStats(priorValues, teamIds.length);
  const talentStats = featureStats(talentValues, teamIds.length);
  const returningStats = featureStats(returningValues, teamIds.length);
  const portalStats = featureStats(portalValues, teamIds.length);

  const zCoreById = new Map<string, number | null>();
  const zTalentById = new Map<string, number | null>();
  const zReturningById = new Map<string, number | null>();
  const zPortalById = new Map<string, number | null>();

  for (let i = 0; i < teamIds.length; i++) {
    const id = teamIds[i];
    zCoreById.set(
      id,
      priorValues[i] == null ? null : zScore(priorValues[i]!, priorStats.populationMean, priorStats.populationSD)
    );
    zTalentById.set(
      id,
      talentValues[i] == null ? null : zScore(talentValues[i]!, talentStats.populationMean, talentStats.populationSD)
    );
    zReturningById.set(
      id,
      returningValues[i] == null
        ? null
        : zScore(returningValues[i]!, returningStats.populationMean, returningStats.populationSD)
    );
    zPortalById.set(
      id,
      portalValues[i] == null ? null : zScore(portalValues[i]!, portalStats.populationMean, portalStats.populationSD)
    );
  }

  const rawComposites: Array<{ teamId: string; raw: number }> = [];
  for (const id of teamIds) {
    const zCore = zCoreById.get(id);
    const zTalent = zTalentById.get(id);
    const zReturning = zReturningById.get(id);
    const zPortal = zPortalById.get(id);
    if (zCore != null && zTalent != null && zReturning != null && zPortal != null) {
      rawComposites.push({
        teamId: id,
        raw: COMPOSITE_WEIGHT * zCore + COMPOSITE_WEIGHT * zTalent + COMPOSITE_WEIGHT * zReturning + COMPOSITE_WEIGHT * zPortal,
      });
    }
  }
  const compositeStats = rawComposites.length > 0 ? populationStats(rawComposites.map((r) => r.raw)) : null;
  const rawById = new Map(rawComposites.map((r) => [r.teamId, r.raw]));

  const teams: TeamFeatureRow[] = teamIds.map((id) => {
    const portal = input.portalByTeamId.get(id) ?? {
      inbound: emptyDirection(),
      outbound: emptyDirection(),
      portalRaw: null,
    };
    const reasons: UnavailableReason[] = [];
    const priorCoreRaw = input.priorCoreByTeamId.has(id) ? input.priorCoreByTeamId.get(id)! : null;
    const talentRaw = input.talentByTeamId.has(id) ? input.talentByTeamId.get(id)! : null;
    const returningRaw = input.returningByTeamId.has(id) ? input.returningByTeamId.get(id)! : null;
    const portalRaw = portal.portalRaw;
    if (priorCoreRaw == null) reasons.push('PRIOR_SEASON_CORE_UNAVAILABLE');
    if (talentRaw == null) reasons.push('CURRENT_TALENT_UNAVAILABLE');
    if (returningRaw == null) reasons.push('RETURNING_PRODUCTION_UNAVAILABLE');
    if (portalRaw == null) reasons.push('PORTAL_FEATURE_UNAVAILABLE');
    const complete = reasons.length === 0;
    if (!complete) reasons.push('TEAM_FEATURE_VECTOR_UNAVAILABLE');
    const rawComposite = complete ? rawById.get(id)! : null;
    const compositeZ =
      complete && compositeStats
        ? zScore(rawComposite!, compositeStats.populationMean, compositeStats.populationSD)
        : null;
    const withoutHash: Omit<TeamFeatureRow, 'rowHash'> = {
      teamId: id,
      season: CANDIDATE_B_SEASON,
      availabilityStatus: complete ? 'AVAILABLE' : 'UNAVAILABLE',
      unavailableReasons: sortReasons(reasons) as UnavailableReason[],
      priorCoreRaw,
      talentRaw,
      returningRaw,
      portalRaw,
      zCore: zCoreById.get(id) ?? null,
      zTalent: zTalentById.get(id) ?? null,
      zReturning: zReturningById.get(id) ?? null,
      zPortal: zPortalById.get(id) ?? null,
      candidateBRawComposite: rawComposite,
      candidateBCompositeZ: compositeZ,
      candidateBTeamRatingPoints: compositeZ == null ? null : compositeZ * RATING_SCALE,
      inboundTransferCount: portal.inbound.transferCount,
      inboundRatedCount: portal.inbound.ratedCount,
      inboundRatedCoverage: portal.inbound.ratedCoverage,
      inboundDirectionStatus: portal.inbound.directionStatus,
      inboundMeanRating: portal.inbound.meanRating,
      outboundTransferCount: portal.outbound.transferCount,
      outboundRatedCount: portal.outbound.ratedCount,
      outboundRatedCoverage: portal.outbound.ratedCoverage,
      outboundDirectionStatus: portal.outbound.directionStatus,
      outboundMeanRating: portal.outbound.meanRating,
    };
    return { ...withoutHash, rowHash: computeRowHash(withoutHash) };
  });

  const completeVectorCount = teams.filter((t) => t.availabilityStatus === 'AVAILABLE').length;
  const portalAvailableCount = teams.filter((t) => t.portalRaw != null).length;
  const unavailableVectorCount = teams.length - completeVectorCount;

  if (!compositeStats) throw new Error('complete_composite_population_empty');

  const normalizationManifest: NormalizationManifest = {
    priorCore: priorStats,
    talent: talentStats,
    returning: returningStats,
    portal: portalStats,
    completeN: completeVectorCount,
    rawCompositePopulationMean: compositeStats.populationMean,
    rawCompositePopulationSD: compositeStats.populationSD,
    divisor: POPULATION_SD_DIVISOR,
    ratingScale: RATING_SCALE,
    muPortal: input.muPortal,
    muPortalParityExpected: MU_PORTAL_PARITY_EXPECTED,
  };
  const populationManifest: PopulationManifest = {
    season: CANDIDATE_B_SEASON,
    authoritativeFbsCount: teamIds.length,
    teamIds,
    completeVectorCount,
    unavailableVectorCount,
    portalAvailableCount,
  };
  const sourceManifestHash = sha256CanonicalJson(input.sourceManifest);
  const sourceProvenanceManifestHash = sha256CanonicalJson(input.sourceProvenanceManifest);
  const normalizationManifestHash = sha256CanonicalJson(normalizationManifest);
  const populationManifestHash = sha256CanonicalJson(populationManifest);
  const snapshotHash = computeSnapshotHash({
    season: CANDIDATE_B_SEASON,
    snapshotKind: SNAPSHOT_KIND,
    modelFamily: MODEL_FAMILY,
    modelDefinitionId: MODEL_DEFINITION_ID,
    featureDefinitionId: FEATURE_DEFINITION_ID,
    featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
    featureDefinitionHash: FEATURE_DEFINITION_HASH,
    derivationDefinitionId: DERIVATION_DEFINITION_ID,
    derivationDefinitionHash: DERIVATION_DEFINITION_HASH,
    sourceManifestHash,
    normalizationManifestHash,
    populationManifestHash,
    expectedTeamCount: teamIds.length,
    rowCount: teams.length,
    completeVectorCount,
    unavailableVectorCount,
    portalAvailableCount,
    teams,
  });

  return {
    season: CANDIDATE_B_SEASON,
    snapshotKind: SNAPSHOT_KIND,
    modelFamily: MODEL_FAMILY,
    modelDefinitionId: MODEL_DEFINITION_ID,
    featureDefinitionId: FEATURE_DEFINITION_ID,
    featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
    featureDefinitionManifest: FEATURE_DEFINITION_MANIFEST,
    featureDefinitionHash: FEATURE_DEFINITION_HASH,
    derivationDefinitionId: DERIVATION_DEFINITION_ID,
    derivationDefinitionManifest: DERIVATION_DEFINITION_MANIFEST,
    derivationDefinitionHash: DERIVATION_DEFINITION_HASH,
    sourceManifest: input.sourceManifest,
    sourceManifestHash,
    sourceProvenanceManifest: input.sourceProvenanceManifest,
    sourceProvenanceManifestHash,
    normalizationManifest,
    normalizationManifestHash,
    populationManifest,
    populationManifestHash,
    expectedTeamCount: teamIds.length,
    rowCount: teams.length,
    completeVectorCount,
    unavailableVectorCount,
    portalAvailableCount,
    snapshotHash,
    teams,
    talentValueHash: input.talentValueHash,
    talentProvenanceHash: input.talentProvenanceHash,
    muPortal: input.muPortal,
  };
}

export function assessCandidateBV1Invariants(snapshot: DerivedSnapshot, options?: { requireFrozenCounts?: boolean }): string[] {
  const blockers: string[] = [];
  if (snapshot.featureDefinitionHash !== FEATURE_DEFINITION_HASH) {
    blockers.push('feature_definition_hash_mismatch');
  }
  if (snapshot.derivationDefinitionHash !== DERIVATION_DEFINITION_HASH) {
    blockers.push('derivation_definition_hash_mismatch');
  }
  if (!hasExpectedTeamResolutionPolicyPin(snapshot.sourceManifest)) {
    blockers.push('team_resolution_policy_mismatch');
  }
  if (snapshot.rowCount !== snapshot.teams.length) blockers.push('row_count_mismatch');
  if (snapshot.teams.length !== snapshot.expectedTeamCount) blockers.push('team_count_mismatch');
  if (new Set(snapshot.teams.map((t) => t.teamId)).size !== snapshot.teams.length) {
    blockers.push('duplicate_team_rows');
  }
  if (options?.requireFrozenCounts !== false) {
    if (snapshot.expectedTeamCount !== CANDIDATE_B_EXPECTED_TEAM_COUNT) {
      blockers.push(`authoritative_count:${snapshot.expectedTeamCount}`);
    }
    if (snapshot.completeVectorCount !== CANDIDATE_B_EXPECTED_COMPLETE_VECTOR_COUNT) {
      blockers.push(`complete_count:${snapshot.completeVectorCount}`);
    }
    if (snapshot.unavailableVectorCount !== CANDIDATE_B_EXPECTED_UNAVAILABLE_VECTOR_COUNT) {
      blockers.push(`unavailable_count:${snapshot.unavailableVectorCount}`);
    }
    if (snapshot.portalAvailableCount !== CANDIDATE_B_EXPECTED_PORTAL_AVAILABLE_COUNT) {
      blockers.push(`portal_available_count:${snapshot.portalAvailableCount}`);
    }
    if (snapshot.normalizationManifest.priorCore.n !== CANDIDATE_B_EXPECTED_PRIOR_CORE_N) {
      blockers.push(`prior_core_n:${snapshot.normalizationManifest.priorCore.n}`);
    }
    if (snapshot.normalizationManifest.talent.n !== CANDIDATE_B_EXPECTED_TALENT_N) {
      blockers.push(`talent_n:${snapshot.normalizationManifest.talent.n}`);
    }
    if (snapshot.normalizationManifest.returning.n !== CANDIDATE_B_EXPECTED_RETURNING_N) {
      blockers.push(`returning_n:${snapshot.normalizationManifest.returning.n}`);
    }
    if (snapshot.normalizationManifest.portal.n !== CANDIDATE_B_EXPECTED_PORTAL_N) {
      blockers.push(`portal_n:${snapshot.normalizationManifest.portal.n}`);
    }
    if (snapshot.muPortal !== MU_PORTAL_PARITY_EXPECTED) blockers.push('mu_portal_parity');
  }
  const ratingPoints = snapshot.teams
    .map((t) => t.candidateBTeamRatingPoints)
    .filter(isFiniteNumber);
  if (ratingPoints.length > 0) {
    const ratingStats = populationStats(ratingPoints);
    if (Math.abs(ratingStats.populationSD - RATING_SCALE) > 1e-9) {
      blockers.push(`rating_population_sd:${ratingStats.populationSD}`);
    }
  }
  return blockers;
}

function persistedTeamSemantics(row: PersistedTeamRow): Omit<TeamFeatureRow, 'rowHash'> {
  return {
    teamId: row.teamId,
    season: row.season,
    availabilityStatus: row.availabilityStatus as AvailabilityStatus,
    unavailableReasons: sortReasons(row.unavailableReasons) as UnavailableReason[],
    priorCoreRaw: row.priorCoreRaw,
    talentRaw: row.talentRaw,
    returningRaw: row.returningRaw,
    portalRaw: row.portalRaw,
    zCore: row.zCore,
    zTalent: row.zTalent,
    zReturning: row.zReturning,
    zPortal: row.zPortal,
    candidateBRawComposite: row.candidateBRawComposite,
    candidateBCompositeZ: row.candidateBCompositeZ,
    candidateBTeamRatingPoints: row.candidateBTeamRatingPoints,
    inboundTransferCount: row.inboundTransferCount,
    inboundRatedCount: row.inboundRatedCount,
    inboundRatedCoverage: row.inboundRatedCoverage,
    inboundDirectionStatus: row.inboundDirectionStatus as DirectionStatus,
    inboundMeanRating: row.inboundMeanRating,
    outboundTransferCount: row.outboundTransferCount,
    outboundRatedCount: row.outboundRatedCount,
    outboundRatedCoverage: row.outboundRatedCoverage,
    outboundDirectionStatus: row.outboundDirectionStatus as DirectionStatus,
    outboundMeanRating: row.outboundMeanRating,
  };
}

export function verifyPersistedSnapshotIntegrity(
  existing: PersistedSnapshot,
  options?: { expectedTeamCount?: number }
): boolean {
  const requiredTeamCount = options?.expectedTeamCount ?? CANDIDATE_B_EXPECTED_TEAM_COUNT;
  if (existing.season !== CANDIDATE_B_SEASON) return false;
  if (existing.snapshotKind !== SNAPSHOT_KIND) return false;
  if (existing.modelFamily !== MODEL_FAMILY) return false;
  if (existing.modelDefinitionId !== MODEL_DEFINITION_ID) return false;
  if (existing.featureDefinitionId !== FEATURE_DEFINITION_ID) return false;
  if (existing.featureDefinitionVersion !== FEATURE_DEFINITION_VERSION) return false;
  if (existing.featureDefinitionHash !== FEATURE_DEFINITION_HASH) return false;
  if (existing.derivationDefinitionId !== DERIVATION_DEFINITION_ID) return false;
  if (existing.derivationDefinitionHash !== DERIVATION_DEFINITION_HASH) return false;

  if (sha256CanonicalJson(existing.featureDefinitionManifest) !== existing.featureDefinitionHash) {
    return false;
  }
  if (sha256CanonicalJson(existing.derivationDefinitionManifest) !== existing.derivationDefinitionHash) {
    return false;
  }
  if (sha256CanonicalJson(existing.sourceManifest) !== existing.sourceManifestHash) return false;
  if (!hasExpectedTeamResolutionPolicyPin(existing.sourceManifest)) return false;
  if (sha256CanonicalJson(existing.sourceProvenanceManifest) !== existing.sourceProvenanceManifestHash) {
    return false;
  }
  if (sha256CanonicalJson(existing.normalizationManifest) !== existing.normalizationManifestHash) {
    return false;
  }
  if (sha256CanonicalJson(existing.populationManifest) !== existing.populationManifestHash) return false;

  if (existing.expectedTeamCount !== requiredTeamCount) return false;
  if (existing.expectedTeamCount !== existing.rowCount) return false;
  if (existing.rowCount !== existing.teams.length) return false;
  if (existing.completeVectorCount + existing.unavailableVectorCount !== existing.rowCount) {
    return false;
  }
  const ids = existing.teams.map((t) => t.teamId);
  if (new Set(ids).size !== ids.length) return false;
  for (const team of existing.teams) {
    if (team.season !== CANDIDATE_B_SEASON) return false;
    if (computeRowHash(persistedTeamSemantics(team)) !== team.rowHash) return false;
  }

  const recomputed = computeSnapshotHash({
    season: existing.season,
    snapshotKind: existing.snapshotKind,
    modelFamily: existing.modelFamily,
    modelDefinitionId: existing.modelDefinitionId,
    featureDefinitionId: existing.featureDefinitionId,
    featureDefinitionVersion: existing.featureDefinitionVersion,
    featureDefinitionHash: existing.featureDefinitionHash,
    derivationDefinitionId: existing.derivationDefinitionId,
    derivationDefinitionHash: existing.derivationDefinitionHash,
    sourceManifestHash: existing.sourceManifestHash,
    normalizationManifestHash: existing.normalizationManifestHash,
    populationManifestHash: existing.populationManifestHash,
    expectedTeamCount: existing.expectedTeamCount,
    rowCount: existing.rowCount,
    completeVectorCount: existing.completeVectorCount,
    unavailableVectorCount: existing.unavailableVectorCount,
    portalAvailableCount: existing.portalAvailableCount,
    teams: existing.teams,
  });
  return recomputed === existing.snapshotHash;
}

export function classifyExistingSnapshot(
  existing: PersistedSnapshot | null,
  computed: DerivedSnapshot,
  options?: { expectedTeamCount?: number }
): ExistingSnapshotState {
  if (!existing) return 'ABSENT';
  if (
    !verifyPersistedSnapshotIntegrity(existing, {
      expectedTeamCount: options?.expectedTeamCount ?? computed.expectedTeamCount,
    })
  ) {
    return 'CORRUPT_EXISTING';
  }
  const existingRowHashes = [...existing.teams]
    .map((t) => ({ teamId: t.teamId, rowHash: t.rowHash }))
    .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  const computedRowHashes = [...computed.teams]
    .map((t) => ({ teamId: t.teamId, rowHash: t.rowHash }))
    .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  const semanticMatch =
    existing.featureDefinitionHash === computed.featureDefinitionHash &&
    existing.derivationDefinitionHash === computed.derivationDefinitionHash &&
    existing.sourceManifestHash === computed.sourceManifestHash &&
    existing.normalizationManifestHash === computed.normalizationManifestHash &&
    existing.populationManifestHash === computed.populationManifestHash &&
    existing.snapshotHash === computed.snapshotHash &&
    existing.rowCount === computed.rowCount &&
    existing.completeVectorCount === computed.completeVectorCount &&
    existing.unavailableVectorCount === computed.unavailableVectorCount &&
    existing.portalAvailableCount === computed.portalAvailableCount &&
    JSON.stringify(existingRowHashes) === JSON.stringify(computedRowHashes);
  if (!semanticMatch) return 'SEMANTIC_CONFLICT';
  if (existing.sourceProvenanceManifestHash !== computed.sourceProvenanceManifestHash) {
    return 'PROVENANCE_ONLY_DIFFERENCE';
  }
  return 'EXACT_EXISTING';
}

export function buildSourceManifest(input: {
  coreSha256: string;
  returningSha256: string;
  portalSha256: string;
  muPortal: number;
  talentValueHash: string;
}): Record<string, unknown> {
  return {
    priorCore: {
      provider: 'CFBD',
      endpoint: '/ratings/core',
      year: 2025,
      field: 'overall',
      frozenPrivateSnapshotId: CORE_SNAPSHOT_ID,
      rawPayloadSha256: input.coreSha256,
    },
    returning: {
      provider: 'CFBD',
      endpoint: '/player/returning',
      designation: OPENING_WEEK_DESIGNATION,
      frozenPrivateSnapshotId: OPENING_SNAPSHOT_ID,
      field: 'percentPPA',
      rawPayloadSha256: input.returningSha256,
    },
    portal: {
      provider: 'CFBD',
      endpoint: '/player/portal',
      designation: OPENING_WEEK_DESIGNATION,
      frozenPrivateSnapshotId: OPENING_SNAPSHOT_ID,
      rawPayloadSha256: input.portalSha256,
      muPortal: input.muPortal,
      muPortalParityExpected: MU_PORTAL_PARITY_EXPECTED,
    },
    talent: {
      source: 'team_season_talent',
      season: 2026,
      field: 'talentComposite',
      n: 138,
      talentValueHash: input.talentValueHash,
    },
    teamResolution: {
      policyId: TEAM_RESOLUTION_POLICY_ID,
      policyHash: TEAM_RESOLUTION_POLICY_HASH,
    },
  };
}

export function buildSourceProvenanceManifest(input: {
  coreRetrievedAt: string | null;
  returningRetrievedAt: string | null;
  portalRetrievedAt: string | null;
  coreRelativePath: string;
  returningRelativePath: string;
  portalRelativePath: string;
  talentProvenanceHash: string;
}): Record<string, unknown> {
  return {
    priorCore: {
      retrievedAt: input.coreRetrievedAt,
      privateSnapshotId: CORE_SNAPSHOT_ID,
      relativePath: input.coreRelativePath,
    },
    returning: {
      retrievedAt: input.returningRetrievedAt,
      privateSnapshotId: OPENING_SNAPSHOT_ID,
      relativePath: input.returningRelativePath,
    },
    portal: {
      retrievedAt: input.portalRetrievedAt,
      privateSnapshotId: OPENING_SNAPSHOT_ID,
      relativePath: input.portalRelativePath,
    },
    talent: {
      talentProvenanceHash: input.talentProvenanceHash,
      timestampFields: {
        createdAt: 'TeamSeasonTalent.createdAt',
        updatedAt: 'TeamSeasonTalent.updatedAt',
        sourceUpdatedAt: 'TeamSeasonTalent.sourceUpdatedAt',
      },
    },
  };
}

export function buildIngestReport(input: {
  mode: IngestMode;
  repoCommitSha: string;
  snapshot: DerivedSnapshot;
  existingState: ExistingSnapshotState;
  blockers: string[];
  commitSucceeded?: boolean;
  persistenceCommitted?: boolean;
  postWriteVerificationOk?: boolean | null;
}): IngestReport {
  const noop =
    input.existingState === 'EXACT_EXISTING' || input.existingState === 'PROVENANCE_ONLY_DIFFERENCE';
  const writeSafe =
    input.blockers.length === 0 &&
    (input.existingState === 'ABSENT' || noop);
  return {
    mode: input.mode,
    season: CANDIDATE_B_SEASON,
    providerCalls: 0,
    repoCommitSha: input.repoCommitSha,
    sourceHashVerification: {
      core: String((input.snapshot.sourceManifest as any).priorCore.rawPayloadSha256),
      returning: String((input.snapshot.sourceManifest as any).returning.rawPayloadSha256),
      portal: String((input.snapshot.sourceManifest as any).portal.rawPayloadSha256),
    },
    talentValueHash: input.snapshot.talentValueHash,
    talentProvenanceHash: input.snapshot.talentProvenanceHash,
    featureDefinitionHash: input.snapshot.featureDefinitionHash,
    derivationDefinitionHash: input.snapshot.derivationDefinitionHash,
    sourceManifestHash: input.snapshot.sourceManifestHash,
    sourceProvenanceManifestHash: input.snapshot.sourceProvenanceManifestHash,
    normalizationManifestHash: input.snapshot.normalizationManifestHash,
    populationManifestHash: input.snapshot.populationManifestHash,
    snapshotHash: input.snapshot.snapshotHash,
    expectedConfirmation: expectedCandidateBFeatureSnapshotConfirmation(input.snapshot.snapshotHash),
    authoritativeTeamCount: input.snapshot.expectedTeamCount,
    rowCount: input.snapshot.rowCount,
    portalAvailableCount: input.snapshot.portalAvailableCount,
    completeVectorCount: input.snapshot.completeVectorCount,
    unavailableVectorCount: input.snapshot.unavailableVectorCount,
    featurePopulationStats: input.snapshot.normalizationManifest,
    unavailableTeams: input.snapshot.teams
      .filter((t) => t.availabilityStatus === 'UNAVAILABLE')
      .map((t) => ({ teamId: t.teamId, unavailableReasons: t.unavailableReasons })),
    existingState: input.existingState,
    blockers: input.blockers,
    writeSafe,
    commitEligible: writeSafe,
    commitSucceeded: input.commitSucceeded === true,
    persistenceCommitted: input.persistenceCommitted === true,
    alreadyPresent: noop,
    postWriteVerificationOk: input.postWriteVerificationOk ?? null,
    provenanceOnlyDifference: input.existingState === 'PROVENANCE_ONLY_DIFFERENCE',
  };
}

export async function executeCandidateBFeatureSnapshotIngest(input: {
  mode: IngestMode;
  confirmation?: string;
  snapshot: DerivedSnapshot;
  store: Pick<CandidateBFeatureSnapshotStore, 'loadExistingByStableIdentity' | 'runSerializable'>;
  repoCommitSha: string;
  derivedAt: Date;
  requireFrozenCounts?: boolean;
}): Promise<{ report: IngestReport; snapshot: DerivedSnapshot }> {
  const invariantBlockers = assessCandidateBV1Invariants(input.snapshot, {
    requireFrozenCounts: input.requireFrozenCounts,
  });
  const requiredTeamCount =
    input.requireFrozenCounts === false
      ? input.snapshot.expectedTeamCount
      : CANDIDATE_B_EXPECTED_TEAM_COUNT;
  const existing = await input.store.loadExistingByStableIdentity();
  const existingState = classifyExistingSnapshot(existing, input.snapshot, {
    expectedTeamCount: requiredTeamCount,
  });
  const blockers = [...invariantBlockers];
  if (existingState === 'SEMANTIC_CONFLICT') blockers.push('semantic_conflict');
  if (existingState === 'CORRUPT_EXISTING') blockers.push('corrupt_existing');

  if (input.mode === 'PREVIEW') {
    return {
      snapshot: input.snapshot,
      report: buildIngestReport({
        mode: 'PREVIEW',
        repoCommitSha: input.repoCommitSha,
        snapshot: input.snapshot,
        existingState,
        blockers,
        commitSucceeded: false,
        persistenceCommitted: false,
        postWriteVerificationOk: null,
      }),
    };
  }

  if (input.mode !== 'COMMIT') throw new Error('mode_invalid');
  const expected = expectedCandidateBFeatureSnapshotConfirmation(input.snapshot.snapshotHash);
  if (input.confirmation !== expected) {
    throw new Error('confirmation_mismatch');
  }
  if (blockers.length > 0) throw new Error(`commit_blocked:${blockers.join(',')}`);

  const result = await input.store.runSerializable(async (tx) => {
    const txExisting = await tx.loadExistingByStableIdentity();
    const txState = classifyExistingSnapshot(txExisting, input.snapshot, {
      expectedTeamCount: requiredTeamCount,
    });
    if (txState === 'EXACT_EXISTING' || txState === 'PROVENANCE_ONLY_DIFFERENCE') {
      return { state: txState, persisted: txExisting!, inserted: false };
    }
    if (txState === 'SEMANTIC_CONFLICT') throw new Error('semantic_conflict');
    if (txState === 'CORRUPT_EXISTING') throw new Error('corrupt_existing');
    await tx.insertSnapshot(input.snapshot, input.repoCommitSha, input.derivedAt);
    const persisted = await tx.loadExistingByStableIdentity();
    if (!persisted) throw new Error('post_write_missing_snapshot');
    if (!verifyPersistedSnapshotIntegrity(persisted, { expectedTeamCount: requiredTeamCount })) {
      throw new Error('post_write_integrity_failed');
    }
    if (
      classifyExistingSnapshot(persisted, input.snapshot, {
        expectedTeamCount: requiredTeamCount,
      }) !== 'EXACT_EXISTING'
    ) {
      throw new Error('post_write_hash_mismatch');
    }
    return { state: 'ABSENT' as ExistingSnapshotState, persisted, inserted: true };
  });

  return {
    snapshot: input.snapshot,
    report: buildIngestReport({
      mode: 'COMMIT',
      repoCommitSha: input.repoCommitSha,
      snapshot: input.snapshot,
      existingState: result.inserted ? 'ABSENT' : result.state,
      blockers: [],
      commitSucceeded: result.inserted,
      persistenceCommitted: result.inserted,
      postWriteVerificationOk: true,
    }),
  };
}
