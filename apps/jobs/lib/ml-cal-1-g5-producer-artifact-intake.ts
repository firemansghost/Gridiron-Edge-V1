/**
 * Offline intake classification for one retained producer artifact.
 * This stage records that a lifecycle COMMIT report lacks rating-export
 * fields. It does not derive a rating effect, mint an approval pin, or
 * emit a lineage disposition.
 */

import { createHash } from 'crypto';

export const PRODUCER_ARTIFACT_INTAKE_SCHEMA =
  'ml-cal-1-g5-producer-artifact-intake-v1' as const;

export const ABSENT_RATING_EXPORT_FIELDS = [
  'powerRatingRaw',
  'ratingRaw',
  'dataSource',
  'createdAt',
  'updatedAt',
  'modelVersion',
] as const;

const WRITE_EFFECT_SCHEMA = 'ml-cal-1-g5-candidate-artifact-write-effect-v1';
const CONTENTS_SCHEMA = 'ml-cal-1-g5-candidate-contents-v1';
const HEX64 = /^[0-9a-f]{64}$/i;

export type ProducerArtifactIntakeStatus =
  | 'insufficient'
  | 'unavailable'
  | 'conflicting'
  | 'refused';

export type ProducerArtifactMemberIntegrity = 'match' | 'mismatch' | 'not_supplied';

export type ProducerArtifactClass =
  | 'core-v1-lifecycle-commit-json'
  | 'g5-summary-refused'
  | 'unrecognized'
  | 'unavailable';

export interface ProducerArtifactExpectedIdentity {
  season?: number;
  modelVersion?: string;
  completedThroughWeek?: number;
  selectedPolicy?: string;
}

export interface ProducerArtifactIntakeInput {
  candidateKey?: string | null;
  locator?: string | null;
  artifactBytes?: Buffer | Uint8Array | null;
  expectedMemberSha256?: string | null;
  listingPresent?: boolean | null;
  expectedIdentity?: ProducerArtifactExpectedIdentity | null;
  listingCommitOrWriteTime?: string | null;
  otherArtifactBytes?: Buffer | Uint8Array | null;
  approvalPin?: string | null;
  requestLiveLabel?: boolean | null;
  requestRatingEffect?: boolean | null;
  requestWholePackageApproval?: boolean | null;
}

export interface ProducerArtifactIntakeResult {
  schemaVersion: typeof PRODUCER_ARTIFACT_INTAKE_SCHEMA;
  kind: 'producer-artifact-intake';
  status: ProducerArtifactIntakeStatus;
  reason: string;
  ratingEffect: null;
  approvalStatus: 'unverified';
  memberIntegrity: ProducerArtifactMemberIntegrity;
  producerBytesSha256: string | null;
  candidateKey: string | null;
  locator: string | null;
  artifactClass: ProducerArtifactClass;
  fixtureProvenanceRetained: boolean;
  approvalPinSupplied: boolean;
  absentFingerprintFields: string[];
}

interface Draft {
  status: ProducerArtifactIntakeStatus;
  reason: string;
  memberIntegrity: ProducerArtifactMemberIntegrity;
  producerBytesSha256: string | null;
  candidateKey: string | null;
  locator: string | null;
  artifactClass: ProducerArtifactClass;
  fixtureProvenanceRetained: boolean;
  approvalPinSupplied: boolean;
  absentFingerprintFields: string[];
}

export function classifyProducerArtifactIntake(
  input: ProducerArtifactIntakeInput
): ProducerArtifactIntakeResult {
  const candidateKey = presentText(input.candidateKey);
  const locator = presentText(input.locator);
  const bytes = asBuffer(input.artifactBytes);
  const producerBytesSha256 = bytes == null ? null : sha256Hex(bytes);
  const memberIntegrity = memberIntegrityFor(bytes, input.expectedMemberSha256);
  const approvalPinSupplied = presentText(input.approvalPin) != null;
  const base: Omit<Draft, 'status' | 'reason' | 'artifactClass' | 'absentFingerprintFields'> = {
    memberIntegrity,
    producerBytesSha256,
    candidateKey,
    locator,
    fixtureProvenanceRetained: false,
    approvalPinSupplied,
  };

  const refuse = (
    reason: string,
    artifactClass: ProducerArtifactClass = 'unrecognized',
    extra: Partial<Draft> = {}
  ): ProducerArtifactIntakeResult =>
    freeze({
      ...base,
      status: 'refused',
      reason,
      artifactClass,
      absentFingerprintFields: [],
      ...extra,
    });
  const unavailable = (reason: string): ProducerArtifactIntakeResult =>
    freeze({
      ...base,
      status: 'unavailable',
      reason,
      artifactClass: 'unavailable',
      absentFingerprintFields: [],
    });
  const conflict = (
    reason: string,
    extra: Partial<Draft> = {}
  ): ProducerArtifactIntakeResult =>
    freeze({
      ...base,
      status: 'conflicting',
      reason,
      artifactClass: 'core-v1-lifecycle-commit-json',
      absentFingerprintFields: [],
      ...extra,
    });

  if (input.requestRatingEffect === true) {
    return refuse('producer_effect_derivation_not_authorized');
  }
  if (input.requestWholePackageApproval === true) {
    return refuse('whole_package_approval_disabled_until_independent_review');
  }
  if (bytes == null) {
    return unavailable('producer_artifact_missing');
  }
  if (locator == null) {
    return unavailable('producer_artifact_locator_missing');
  }
  if (candidateKey == null) {
    return unavailable('producer_candidate_key_missing');
  }
  if (input.listingPresent !== true) {
    return unavailable('lineage_candidate_not_in_retained_listings');
  }
  if (memberIntegrity === 'mismatch') {
    return refuse('package_member_digest_mismatch');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return unavailable('producer_artifact_unparseable');
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return unavailable('producer_artifact_unparseable');
  }
  const record = parsed as Record<string, unknown>;
  const fixtureProvenanceRetained = hasFixtureProvenance(record);
  const withFixture = { fixtureProvenanceRetained };

  const schemaVersion = record.schemaVersion;
  const kind = record.kind;
  if (
    schemaVersion === WRITE_EFFECT_SCHEMA ||
    kind === 'candidate-artifact-write-effect'
  ) {
    return refuse('candidate_contents_unsupported_summary', 'g5-summary-refused', withFixture);
  }
  if (
    schemaVersion === CONTENTS_SCHEMA ||
    kind === 'candidate-contents' ||
    kind === 'anchored-candidate-contents'
  ) {
    return refuse('candidate_contents_boolean_only', 'g5-summary-refused', withFixture);
  }
  if (schemaVersion != null) {
    return refuse('candidate_contents_unsupported', 'unrecognized', withFixture);
  }

  if (record.mode !== 'COMMIT') {
    return refuse('producer_artifact_mode_unsupported', 'unrecognized', withFixture);
  }
  if (!hasLifecycleIdentity(record)) {
    return refuse('producer_artifact_identity_missing', 'unrecognized', withFixture);
  }
  if (input.requestLiveLabel === true && fixtureProvenanceRetained) {
    return refuse(
      'fixture_provenance_mislabeled_live',
      'core-v1-lifecycle-commit-json',
      withFixture
    );
  }

  const other = asBuffer(input.otherArtifactBytes);
  if (other != null && sha256Hex(other) !== producerBytesSha256) {
    return conflict('producer_artifact_version_conflict', withFixture);
  }
  if (identityConflicts(record, input.expectedIdentity)) {
    return conflict('producer_artifact_identity_mismatch', withFixture);
  }
  const artifactWriteTime = presentText(
    typeof record.commitOrWriteTime === 'string' ? record.commitOrWriteTime : null
  );
  const listingWriteTime = presentText(input.listingCommitOrWriteTime);
  if (
    artifactWriteTime != null &&
    listingWriteTime != null &&
    artifactWriteTime !== listingWriteTime
  ) {
    return conflict('candidate_contents_timing_mismatch', withFixture);
  }

  if (!Array.isArray(record.rows)) {
    return freeze({
      ...base,
      ...withFixture,
      status: 'insufficient',
      reason: 'producer_artifact_rows_missing',
      artifactClass: 'core-v1-lifecycle-commit-json',
      absentFingerprintFields: [],
    });
  }
  if (record.rows.length === 0) {
    return freeze({
      ...base,
      ...withFixture,
      status: 'insufficient',
      reason: 'producer_artifact_rows_empty',
      artifactClass: 'core-v1-lifecycle-commit-json',
      absentFingerprintFields: [],
    });
  }

  const seen = new Set<string>();
  for (const row of record.rows) {
    if (!isLifecycleRow(row)) {
      return refuse('producer_artifact_row_malformed', 'core-v1-lifecycle-commit-json', withFixture);
    }
    if (seen.has(row.teamId)) {
      return conflict('producer_artifact_duplicate_rows', withFixture);
    }
    seen.add(row.teamId);
    if (ABSENT_RATING_EXPORT_FIELDS.some((field) => field in row)) {
      return refuse(
        'producer_effect_derivation_not_authorized',
        'core-v1-lifecycle-commit-json',
        withFixture
      );
    }
  }

  return freeze({
    ...base,
    ...withFixture,
    status: 'insufficient',
    reason: 'producer_rating_export_fields_absent',
    artifactClass: 'core-v1-lifecycle-commit-json',
    absentFingerprintFields: [...ABSENT_RATING_EXPORT_FIELDS],
  });
}

function freeze(draft: Draft): ProducerArtifactIntakeResult {
  return {
    schemaVersion: PRODUCER_ARTIFACT_INTAKE_SCHEMA,
    kind: 'producer-artifact-intake',
    status: draft.status,
    reason: draft.reason,
    ratingEffect: null,
    approvalStatus: 'unverified',
    memberIntegrity: draft.memberIntegrity,
    producerBytesSha256: draft.producerBytesSha256,
    candidateKey: draft.candidateKey,
    locator: draft.locator,
    artifactClass: draft.artifactClass,
    fixtureProvenanceRetained: draft.fixtureProvenanceRetained,
    approvalPinSupplied: draft.approvalPinSupplied,
    absentFingerprintFields: draft.absentFingerprintFields,
  };
}

function asBuffer(value: Buffer | Uint8Array | null | undefined): Buffer | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return null;
}

function presentText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : value;
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function memberIntegrityFor(
  bytes: Buffer | null,
  expected: string | null | undefined
): ProducerArtifactMemberIntegrity {
  if (bytes == null || presentText(expected) == null) return 'not_supplied';
  const supplied = expected.trim().toLowerCase();
  if (!HEX64.test(supplied) || supplied !== sha256Hex(bytes)) return 'mismatch';
  return 'match';
}

function hasFixtureProvenance(record: Record<string, unknown>): boolean {
  const provenance = record.g2FixtureProvenance;
  return provenance != null && typeof provenance === 'object';
}

function hasLifecycleIdentity(record: Record<string, unknown>): boolean {
  return (
    typeof record.season === 'number' &&
    Number.isFinite(record.season) &&
    typeof record.modelVersion === 'string' &&
    record.modelVersion.trim() !== '' &&
    Number.isInteger(record.completedThroughWeek) &&
    typeof record.selectedPolicy === 'string' &&
    record.selectedPolicy.trim() !== '' &&
    typeof record.phase === 'string' &&
    record.phase.trim() !== ''
  );
}

function identityConflicts(
  record: Record<string, unknown>,
  expected: ProducerArtifactExpectedIdentity | null | undefined
): boolean {
  if (expected == null) return false;
  if (expected.season !== undefined && expected.season !== record.season) return true;
  if (
    expected.modelVersion !== undefined &&
    expected.modelVersion !== record.modelVersion
  ) {
    return true;
  }
  if (
    expected.completedThroughWeek !== undefined &&
    expected.completedThroughWeek !== record.completedThroughWeek
  ) {
    return true;
  }
  if (
    expected.selectedPolicy !== undefined &&
    expected.selectedPolicy !== record.selectedPolicy
  ) {
    return true;
  }
  return false;
}

function isLifecycleRow(
  value: unknown
): value is { teamId: string; games: number } {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.teamId === 'string' &&
    row.teamId.trim() !== '' &&
    typeof row.games === 'number' &&
    Number.isFinite(row.games)
  );
}
