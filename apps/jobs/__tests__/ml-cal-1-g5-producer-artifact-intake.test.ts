import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ABSENT_RATING_EXPORT_FIELDS,
  classifyProducerArtifactIntake,
  ProducerArtifactIntakeInput,
  ProducerArtifactIntakeResult,
} from '../lib/ml-cal-1-g5-producer-artifact-intake';

const ROOT = path.resolve(__dirname, '../../..');
const FIXTURE = path.join(
  ROOT,
  'apps/jobs/__tests__/fixtures/packages/ml-cal-1-g4-observer/synthetic-w6/core-v1-lifecycle-2026-through-week-6-COMMIT.json'
);
const FIXTURE_SHA256 =
  '2dcbfe96023bf1273ff4a385aeaa3297afb99a9b3d2da80d5f87dd8e09024dab';
const LOCATOR =
  'apps/jobs/__tests__/fixtures/packages/ml-cal-1-g4-observer/synthetic-w6/core-v1-lifecycle-2026-through-week-6-COMMIT.json';

const fixtureBytes = fs.readFileSync(FIXTURE);

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function acceptedInput(
  overrides: Partial<ProducerArtifactIntakeInput> = {}
): ProducerArtifactIntakeInput {
  return {
    candidateKey: 'synthetic-w6-lifecycle-commit',
    locator: LOCATOR,
    artifactBytes: fixtureBytes,
    expectedMemberSha256: FIXTURE_SHA256,
    listingPresent: true,
    ...overrides,
  };
}

function expectFrozen(result: ProducerArtifactIntakeResult): void {
  expect(result.schemaVersion).toBe('ml-cal-1-g5-producer-artifact-intake-v1');
  expect(result.kind).toBe('producer-artifact-intake');
  expect(result.ratingEffect).toBeNull();
  expect(result.approvalStatus).toBe('unverified');
  expect(result).not.toHaveProperty('affectsBoundRatings');
  expect(result).not.toHaveProperty('liveAccepted');
  expect(result).not.toHaveProperty('not_invalidating');
  expect(result).not.toHaveProperty('invalidating');
  expect(result).not.toHaveProperty('none_found');
  const encoded = JSON.stringify(result);
  expect(encoded).not.toContain('not_invalidating');
  expect(encoded).not.toContain('none_found');
  expect(encoded).not.toContain('"invalidating"');
  expect(encoded).not.toContain('"liveAccepted":true');
  expect(encoded).not.toContain('"ratingEffect":true');
  expect(encoded).not.toContain('"ratingEffect":false');
}

function editedFixture(mutate: (value: Record<string, unknown>) => void): Buffer {
  const value = JSON.parse(fixtureBytes.toString('utf8')) as Record<string, unknown>;
  mutate(value);
  return Buffer.from(JSON.stringify(value), 'utf8');
}

describe('ML-CAL-1 G5 producer artifact intake', () => {
  test('recognized synthetic Week 6 COMMIT report is insufficient', () => {
    expect(sha256(fixtureBytes)).toBe(FIXTURE_SHA256);
    const result = classifyProducerArtifactIntake(acceptedInput());
    expectFrozen(result);
    expect(result.status).toBe('insufficient');
    expect(result.reason).toBe('producer_rating_export_fields_absent');
    expect(result.memberIntegrity).toBe('match');
    expect(result.producerBytesSha256).toBe(FIXTURE_SHA256);
    expect(result.fixtureProvenanceRetained).toBe(true);
    expect(result.artifactClass).toBe('core-v1-lifecycle-commit-json');
    expect(result.absentFingerprintFields).toEqual([...ABSENT_RATING_EXPORT_FIELDS]);
    expect(result.approvalPinSupplied).toBe(false);
  });

  test('altered bytes without an expected digest keep the new byte identity', () => {
    const altered = editedFixture((value) => {
      value.phase = `${value.phase}-altered`;
    });
    const result = classifyProducerArtifactIntake(
      acceptedInput({ artifactBytes: altered, expectedMemberSha256: null })
    );
    expectFrozen(result);
    expect(result.status).toBe('insufficient');
    expect(result.reason).toBe('producer_rating_export_fields_absent');
    expect(result.memberIntegrity).toBe('not_supplied');
    expect(result.producerBytesSha256).toBe(sha256(altered));
    expect(result.producerBytesSha256).not.toBe(FIXTURE_SHA256);
  });

  test('altered bytes with the original member digest fail integrity', () => {
    const altered = editedFixture((value) => {
      value.phase = `${value.phase}-altered`;
    });
    const result = classifyProducerArtifactIntake(
      acceptedInput({ artifactBytes: altered, expectedMemberSha256: FIXTURE_SHA256 })
    );
    expectFrozen(result);
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('package_member_digest_mismatch');
    expect(result.memberIntegrity).toBe('mismatch');
    expect(result.reason).not.toContain('approval');
  });

  test('a wrong package-member digest is an integrity refusal', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({ expectedMemberSha256: 'a'.repeat(64) })
    );
    expectFrozen(result);
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('package_member_digest_mismatch');
    expect(result.memberIntegrity).toBe('mismatch');
  });

  test('integrity mismatch outranks an otherwise insufficient report', () => {
    const altered = editedFixture((value) => {
      value.rows = [];
    });
    const result = classifyProducerArtifactIntake(
      acceptedInput({ artifactBytes: altered, expectedMemberSha256: FIXTURE_SHA256 })
    );
    expectFrozen(result);
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('package_member_digest_mismatch');
  });

  test('missing retained listing is unavailable', () => {
    const result = classifyProducerArtifactIntake(acceptedInput({ listingPresent: false }));
    expectFrozen(result);
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('lineage_candidate_not_in_retained_listings');
  });

  test('missing candidate key is unavailable', () => {
    const result = classifyProducerArtifactIntake(acceptedInput({ candidateKey: '   ' }));
    expectFrozen(result);
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('producer_candidate_key_missing');
  });

  test('missing bytes and locator are unavailable', () => {
    const missingBytes = classifyProducerArtifactIntake(acceptedInput({ artifactBytes: null }));
    const missingLocator = classifyProducerArtifactIntake(acceptedInput({ locator: '' }));
    expectFrozen(missingBytes);
    expectFrozen(missingLocator);
    expect(missingBytes.reason).toBe('producer_artifact_missing');
    expect(missingLocator.reason).toBe('producer_artifact_locator_missing');
    expect(missingBytes.memberIntegrity).toBe('not_supplied');
  });

  test('unparseable JSON is unavailable', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({ artifactBytes: Buffer.from('{', 'utf8'), expectedMemberSha256: null })
    );
    expectFrozen(result);
    expect(result.status).toBe('unavailable');
    expect(result.reason).toBe('producer_artifact_unparseable');
  });

  test('write-effect summaries and boolean contents stay refused', () => {
    const summary = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: Buffer.from(
          JSON.stringify({
            schemaVersion: 'ml-cal-1-g5-candidate-artifact-write-effect-v1',
            kind: 'candidate-artifact-write-effect',
            writesTeamSeasonRatings: false,
          }),
          'utf8'
        ),
        expectedMemberSha256: null,
      })
    );
    const booleanContents = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: Buffer.from(
          JSON.stringify({
            schemaVersion: 'ml-cal-1-g5-candidate-contents-v1',
            kind: 'candidate-contents',
            wroteRatings: false,
          }),
          'utf8'
        ),
        expectedMemberSha256: null,
      })
    );
    expectFrozen(summary);
    expectFrozen(booleanContents);
    expect(summary.reason).toBe('candidate_contents_unsupported_summary');
    expect(booleanContents.reason).toBe('candidate_contents_boolean_only');
    expect(summary.artifactClass).toBe('g5-summary-refused');
  });

  test('an unknown schema version is refused', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: Buffer.from(
          JSON.stringify({ schemaVersion: 'some-other-schema', season: 2026 }),
          'utf8'
        ),
        expectedMemberSha256: null,
      })
    );
    expectFrozen(result);
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('candidate_contents_unsupported');
  });

  test('missing producer identity is not filled from the caller', () => {
    const bytes = editedFixture((value) => {
      delete value.season;
    });
    const result = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: bytes,
        expectedMemberSha256: null,
        expectedIdentity: { season: 2026 },
      })
    );
    expectFrozen(result);
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('producer_artifact_identity_missing');
  });

  test('a non-COMMIT mode is refused', () => {
    const bytes = editedFixture((value) => {
      value.mode = 'PREVIEW';
    });
    const result = classifyProducerArtifactIntake(
      acceptedInput({ artifactBytes: bytes, expectedMemberSha256: null })
    );
    expectFrozen(result);
    expect(result.reason).toBe('producer_artifact_mode_unsupported');
  });

  test('a missing rows field stays insufficient', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: editedFixture((value) => {
          delete value.rows;
        }),
        expectedMemberSha256: null,
      })
    );
    expectFrozen(result);
    expect(result.status).toBe('insufficient');
    expect(result.reason).toBe('producer_artifact_rows_missing');
  });

  test('empty, malformed, and duplicate rows fail closed', () => {
    const empty = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: editedFixture((value) => {
          value.rows = [];
        }),
        expectedMemberSha256: null,
      })
    );
    const malformed = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: editedFixture((value) => {
          value.rows = [{ teamId: 'A', games: '1' }];
        }),
        expectedMemberSha256: null,
      })
    );
    const duplicate = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: editedFixture((value) => {
          value.rows = [
            { teamId: 'A', games: 1 },
            { teamId: 'A', games: 2 },
          ];
        }),
        expectedMemberSha256: null,
      })
    );
    expectFrozen(empty);
    expectFrozen(malformed);
    expectFrozen(duplicate);
    expect(empty.status).toBe('insufficient');
    expect(empty.reason).toBe('producer_artifact_rows_empty');
    expect(malformed.reason).toBe('producer_artifact_row_malformed');
    expect(duplicate.status).toBe('conflicting');
    expect(duplicate.reason).toBe('producer_artifact_duplicate_rows');
  });

  test('caller identity that disagrees with the report conflicts', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({ expectedIdentity: { season: 1999 } })
    );
    expectFrozen(result);
    expect(result.status).toBe('conflicting');
    expect(result.reason).toBe('producer_artifact_identity_mismatch');
  });

  test('contradictory timestamps conflict only when both sides have one', () => {
    const unchanged = classifyProducerArtifactIntake(
      acceptedInput({ listingCommitOrWriteTime: '2026-10-01T00:00:00Z' })
    );
    const stamped = editedFixture((value) => {
      value.commitOrWriteTime = '2026-10-02T00:00:00Z';
    });
    const conflict = classifyProducerArtifactIntake(
      acceptedInput({
        artifactBytes: stamped,
        expectedMemberSha256: null,
        listingCommitOrWriteTime: '2026-10-01T00:00:00Z',
      })
    );
    expectFrozen(unchanged);
    expectFrozen(conflict);
    expect(unchanged.reason).toBe('producer_rating_export_fields_absent');
    expect(conflict.reason).toBe('candidate_contents_timing_mismatch');
  });

  test('two different buffers for one candidate conflict', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({ otherArtifactBytes: Buffer.from('{"other":true}', 'utf8') })
    );
    expectFrozen(result);
    expect(result.status).toBe('conflicting');
    expect(result.reason).toBe('producer_artifact_version_conflict');
  });

  test('a supplied matching approval digest stays unverified', () => {
    const withoutPin = classifyProducerArtifactIntake(acceptedInput());
    const withPin = classifyProducerArtifactIntake(
      acceptedInput({ approvalPin: FIXTURE_SHA256 })
    );
    expectFrozen(withPin);
    expect(withPin.approvalStatus).toBe('unverified');
    expect(withPin.approvalPinSupplied).toBe(true);
    expect(withPin.status).toBe(withoutPin.status);
    expect(withPin.reason).toBe(withoutPin.reason);
    expect(withPin.ratingEffect).toBeNull();
  });

  test('fixture provenance cannot be relabeled live', () => {
    const result = classifyProducerArtifactIntake(acceptedInput({ requestLiveLabel: true }));
    expectFrozen(result);
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('fixture_provenance_mislabeled_live');
  });

  test('a requested rating effect is refused and stays null', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({ requestRatingEffect: true })
    );
    expectFrozen(result);
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('producer_effect_derivation_not_authorized');
    expect(result.ratingEffect).toBeNull();
  });

  test('a forbidden effect request outranks a member digest mismatch', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({
        requestRatingEffect: true,
        expectedMemberSha256: 'b'.repeat(64),
      })
    );
    expectFrozen(result);
    expect(result.reason).toBe('producer_effect_derivation_not_authorized');
    expect(result.memberIntegrity).toBe('mismatch');
  });

  test('whole-package approval remains disabled', () => {
    const result = classifyProducerArtifactIntake(
      acceptedInput({ requestWholePackageApproval: true })
    );
    expectFrozen(result);
    expect(result.reason).toBe('whole_package_approval_disabled_until_independent_review');
  });

  test('present rating-export fields do not become a derived effect', () => {
    const bytes = editedFixture((value) => {
      const rows = value.rows as Array<Record<string, unknown>>;
      rows[0].powerRatingRaw = '1';
    });
    const result = classifyProducerArtifactIntake(
      acceptedInput({ artifactBytes: bytes, expectedMemberSha256: null })
    );
    expectFrozen(result);
    expect(result.status).toBe('refused');
    expect(result.reason).toBe('producer_effect_derivation_not_authorized');
    expect(result.absentFingerprintFields).toEqual([]);
  });

  test('intake source does not reach G5-PRE disposition and protected blobs stay fixed', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/lib/ml-cal-1-g5-producer-artifact-intake.ts'),
      'utf8'
    );
    expect(source).not.toContain('deriveAffectsBoundRatingsFromArtifact');
    expect(source).not.toContain('evaluateDispositionEvidence');
    expect(source).not.toContain('runG5Pre');
    expect(source).not.toContain('runG5Verify');
    expect(source).not.toContain('ml-cal-1-trusted-retrieval-lineage-g5-pre');
    expect(source).not.toContain('buildRatingFingerprint');
    expect(source).not.toContain('PrismaClient');
    const blob = (file: string) =>
      execFileSync('git', ['rev-parse', `HEAD:${file}`], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
    expect(blob('apps/jobs/lib/ml-cal-1-trusted-retrieval-lineage-g5-pre.ts')).toBe(
      'c75fb25635e36a2b55902a08df6826e148911c4d'
    );
    expect(blob('.github/workflows/test-ml-cal-1-trusted-retrieval-lineage-g5-pre-v1.yml')).toBe(
      'fbf435edd6e1af90909100e5aab68a667ad61939'
    );
  });
});
