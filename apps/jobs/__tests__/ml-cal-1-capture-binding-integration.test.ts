/**
 * Offline G2 integration tests: binding verify → derived adapt → capture qualify.
 * Fixture provenance is test-only; every result must have liveAccepted=false.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildCaptureRatingsByTeamIdFromObservedRows,
  compareBindingAndCaptureFingerprintParity,
  recomputeCaptureRatingFingerprintFromPlannerMap,
  verifyBindingThenQualifyCaptureLifecycle,
  type MlCal1CaptureBindingIntegrationInput,
} from '../lib/ml-cal-1-capture-binding-integration';
import {
  ML_CAL_1_BINDING_POLICY,
  ML_CAL_1_LIFECYCLE_BINDING_LINEAGE_ATTESTATION_SCHEMA,
  ML_CAL_1_LIFECYCLE_BINDING_REGISTRY_DOCUMENT_SCHEMA,
  ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA,
  ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS,
  buildObservedRowsFromReport,
  buildStoreZip,
  canonicalReceiptBytes,
  parseLifecycleReport,
  serializeLineageAttestation,
  serializeSidecar,
  sha256Utf8Bytes,
  type MlCal1LifecycleBindingLineageAttestation,
  type MlCal1LifecycleBindingRegistryApprovedClaims,
  type MlCal1LifecycleBindingRegistryPin,
  type MlCal1LifecycleBindingSidecarV1,
  type MlCal1LifecycleBindingVerifyInput,
  type MlCal1LifecycleReportParsed,
} from '../lib/ml-cal-1-lifecycle-binding';
import {
  planMlCal1Capture,
  type MlCal1TrustedAcceptanceRecord,
} from '../lib/ml-cal-1-capture';

const WEEK5_ROOT = path.join(
  __dirname,
  'fixtures',
  'packages',
  'ml-cal-1-lifecycle-binding-week5-commit'
);
const SYNTHETIC_ROOT = path.join(
  __dirname,
  'fixtures',
  'packages',
  'ml-cal-1-capture-binding-integration-synthetic-w6'
);

const WEEK5_ZIP = fs.readFileSync(path.join(WEEK5_ROOT, 'archive.zip'));
const WEEK5_MEMBER = fs.readFileSync(
  path.join(WEEK5_ROOT, 'core-v1-lifecycle-2026-through-week-5-COMMIT.json')
);

const OBSERVER_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CAPTURE_PRODUCER_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PRODUCER_SHA = ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.lifecycleProducerSha;

const T_RUN = '2026-10-05T15:50:00.000Z';
const T_ART = '2026-10-05T15:56:00.000Z';
const T_OBS0 = '2026-10-06T12:00:00.000Z';
const T_DB = '2026-10-06T12:00:05.000Z';
const T_SNAP = '2026-10-06T12:00:10.000Z';
const T_OBS1 = '2026-10-06T12:00:20.000Z';
const T_ROW = '2026-10-05T16:00:00.000Z';
const NOW_CEILING = '2026-10-08T00:00:00.000Z';
/** Binding-window checked-through (covers snap/obs end; short of T_CAPTURE). */
const T_CHECKED = '2026-10-06T12:00:20.000Z';
/** Capture as-of after binding observation end — requires extended lineage. */
const T_CAPTURE = '2026-10-07T18:00:00.000Z';
const T_CHECKED_COVERS_CAPTURE = '2026-10-07T18:00:00.000Z';
/** Attestation time must be >= checkedThroughTime (binding verifier). */
const T_ATTEST = '2026-10-07T18:05:00.000Z';

const FIXTURE_INVENTORY_DIGEST = sha256Utf8Bytes('fixture-inventory-g2-v1\n');

function week5Report(): MlCal1LifecycleReportParsed {
  return parseLifecycleReport(WEEK5_MEMBER);
}

function baseSidecar(options?: {
  mode?: MlCal1LifecycleBindingSidecarV1['mode'];
  report?: MlCal1LifecycleReportParsed;
  zipSha256?: string;
  memberSha256?: string;
  memberBytes?: Buffer;
  zipBytes?: Buffer;
  rows?: ReturnType<typeof buildObservedRowsFromReport>;
  observationEndTime?: string;
  bindingSnapshotReferenceTime?: string;
}): MlCal1LifecycleBindingSidecarV1 {
  const report = options?.report ?? week5Report();
  const memberBytes = options?.memberBytes ?? WEEK5_MEMBER;
  const zipBytes = options?.zipBytes ?? WEEK5_ZIP;
  const rows =
    options?.rows ??
    buildObservedRowsFromReport(report, {
      createdAt: T_ROW,
      updatedAt: T_ROW,
    });
  return {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA,
    kind: 'lifecycle-binding-sidecar',
    mode: options?.mode ?? 'fixture_hypothetical',
    acceptedArchive: {
      github: {
        workflowRunId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.workflowRunId,
        artifactId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactId,
        artifactName: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactName,
        workflowRunCompletedAt: T_RUN,
        artifactCreatedAt: T_ART,
        zipSha256: options?.zipSha256 ?? sha256Utf8Bytes(zipBytes),
        reportMemberPath: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberPath,
        reportMemberSha256: options?.memberSha256 ?? sha256Utf8Bytes(memberBytes),
        reportByteCount: memberBytes.length,
      },
      lifecycleProducerSha: PRODUCER_SHA,
      declaredSeason: report.season,
      declaredCompletedThroughWeek: report.completedThroughWeek,
      declaredSelectedPolicy: report.selectedPolicy,
      declaredCanonicalWeight: report.canonicalWeight,
    },
    bindingObservation: {
      observationStartTime: T_OBS0,
      observationEndTime: options?.observationEndTime ?? T_OBS1,
      bindingSnapshotReferenceTime:
        options?.bindingSnapshotReferenceTime ?? T_SNAP,
      dbTransactionTime: T_DB,
      dbTransactionTimeUnavailableReason: null,
      bindingObserverSha: OBSERVER_SHA,
      readMode: 'fixture_injected',
      season: report.season,
      modelVersion: 'v1',
      rows,
      rowCreatedAtMin: T_ROW,
      rowCreatedAtMax: T_ROW,
      rowUpdatedAtMin: T_ROW,
      rowUpdatedAtMax: T_ROW,
    },
    fingerprintComputedFromLaterReadback: true,
    readbackWasNotExportedAtCommit: true,
    sidecarSelfAccepted: false,
    providerCalls: 0,
    businessDataWrites: 0,
  };
}

function makeRegistryDoc(
  claims: MlCal1LifecycleBindingRegistryApprovedClaims & { note?: string }
): {
  bytes: string;
  digest: string;
  pin: MlCal1LifecycleBindingRegistryPin;
  approvedRegistryDocumentDigest: string;
} {
  const { note = 'test-only', ...approved } = claims;
  const doc = {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_REGISTRY_DOCUMENT_SCHEMA,
    kind: 'lifecycle-binding-registry-document' as const,
    provenance: 'test-only' as const,
    note,
    ...approved,
  };
  const bytes = canonicalReceiptBytes(doc);
  const digest = sha256Utf8Bytes(bytes);
  const pin: MlCal1LifecycleBindingRegistryPin = {
    pinProvenance: {
      registryId: 'fixture-registry://ml-cal-1-capture-binding-integration-g2',
      registrySha256: digest,
      reviewedAt: T_ATTEST,
      reviewer: 'fixture-reviewer-g2',
    },
    ...approved,
  };
  return {
    bytes,
    digest,
    pin,
    approvedRegistryDocumentDigest: digest,
  };
}

function makeAttestation(options: {
  sidecarDigest: string;
  registrySha256: string;
  checkedThroughTime?: string;
}): {
  bytes: string;
  attestation: MlCal1LifecycleBindingLineageAttestation;
  approvedLineageAttestationDigest: string;
  approvedLineageInventorySha256: string;
} {
  const attestation = {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_LINEAGE_ATTESTATION_SCHEMA,
    kind: 'lifecycle-binding-lineage-attestation',
    approvedSidecarDigest: options.sidecarDigest,
    checkedThroughTime: options.checkedThroughTime ?? T_CHECKED,
    attestationTime: T_ATTEST,
    season: 2026,
    modelVersion: 'v1',
    lineageEvidenceInventorySha256: FIXTURE_INVENTORY_DIGEST,
    searchOutcome: 'none_found' as const,
    supersedingArtifacts: [],
    pinProvenance: {
      registryId: 'fixture-registry://ml-cal-1-capture-binding-integration-g2',
      registrySha256: options.registrySha256,
      reviewedAt: T_ATTEST,
      reviewer: 'fixture-reviewer-g2',
    },
  } as MlCal1LifecycleBindingLineageAttestation;
  const bytes = serializeLineageAttestation(attestation);
  return {
    bytes,
    attestation,
    approvedLineageAttestationDigest: sha256Utf8Bytes(bytes),
    approvedLineageInventorySha256: FIXTURE_INVENTORY_DIGEST,
  };
}

function buildWeek6HypotheticalArchive(): {
  report: MlCal1LifecycleReportParsed;
  memberBytes: Buffer;
  zipBytes: Buffer;
  zipSha256: string;
  memberSha256: string;
  memberPath: string;
} {
  const reportObj = JSON.parse(WEEK5_MEMBER.toString('utf8')) as Record<
    string,
    unknown
  >;
  reportObj.completedThroughWeek = 6;
  reportObj.canonicalWeight = 1;
  reportObj.expectedConfirmation = 'WRITE_2026_CORE_V1_THROUGH_WEEK_6';
  const rows = (reportObj.rows as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    canonicalWeight: 1,
  }));
  reportObj.rows = rows;
  const memberText = `${JSON.stringify(reportObj)}\n`;
  const memberBytes = Buffer.from(memberText, 'utf8');
  const memberPath = 'core-v1-lifecycle-2026-through-week-6-COMMIT.json';
  const zipBytes = buildStoreZip(memberPath, memberBytes);
  return {
    report: parseLifecycleReport(memberBytes),
    memberBytes,
    zipBytes,
    zipSha256: sha256Utf8Bytes(zipBytes),
    memberSha256: sha256Utf8Bytes(memberBytes),
    memberPath,
  };
}

function buildSyntheticFullWeightBundle(options?: {
  checkedThroughTime?: string;
  omitRegistryAnchor?: boolean;
  omitLineageAnchor?: boolean;
  tamperRegistryBytes?: boolean;
}) {
  const archive = buildWeek6HypotheticalArchive();
  const sidecar = baseSidecar({
    mode: 'fixture_hypothetical',
    report: archive.report,
    zipBytes: archive.zipBytes,
    memberBytes: archive.memberBytes,
    zipSha256: archive.zipSha256,
    memberSha256: archive.memberSha256,
  });
  sidecar.acceptedArchive.github.reportMemberPath = archive.memberPath;
  const sidecarBytes = serializeSidecar(sidecar);
  const sidecarDigest = sha256Utf8Bytes(sidecarBytes);
  const ratingsByTeamId = buildCaptureRatingsByTeamIdFromObservedRows(
    sidecar.bindingObservation.rows
  );
  const captureFp = recomputeCaptureRatingFingerprintFromPlannerMap(
    ratingsByTeamId
  );

  const registry = makeRegistryDoc({
    note: 'test-only-g2-synthetic-w6',
    approvedSidecarDigest: sidecarDigest,
    approvedZipSha256: archive.zipSha256,
    approvedReportMemberSha256: archive.memberSha256,
    approvedLifecycleProducerSha: PRODUCER_SHA,
    approvedBindingObserverSha: OBSERVER_SHA,
    approvedRatingFingerprint: captureFp,
    approvedSeason: 2026,
    approvedCompletedThroughWeek: 6,
    approvedSelectedPolicy: ML_CAL_1_BINDING_POLICY,
    approvedCanonicalWeight: 1,
    approvedProspectiveTargetWeek: 7,
  });

  let registryBytes = registry.bytes;
  let approvedRegistryDocumentDigest = registry.approvedRegistryDocumentDigest;
  let pin = registry.pin;
  if (options?.tamperRegistryBytes) {
    registryBytes = registryBytes.replace('"note":', '"noteX":');
    // Keep pin digest pointing at original — document bytes no longer match anchor.
  }

  const att = makeAttestation({
    sidecarDigest,
    registrySha256: registry.digest,
    checkedThroughTime: options?.checkedThroughTime ?? T_CHECKED_COVERS_CAPTURE,
  });

  const verifyInput: MlCal1LifecycleBindingVerifyInput = {
    zipBytes: archive.zipBytes,
    reportMemberBytes: archive.memberBytes,
    sidecarBytes,
    prospectiveTargetWeek: 7,
    expectedZipSha256: archive.zipSha256,
    expectedReportMemberSha256: archive.memberSha256,
    expectedLifecycleProducerSha: PRODUCER_SHA,
    expectedReportMemberPath: archive.memberPath,
    lineageAttestationBytes: options?.omitLineageAnchor ? null : att.bytes,
    approvedLineageAttestationDigest: options?.omitLineageAnchor
      ? null
      : att.approvedLineageAttestationDigest,
    approvedLineageInventorySha256: options?.omitLineageAnchor
      ? null
      : att.approvedLineageInventorySha256,
    registryPin: options?.omitRegistryAnchor ? null : pin,
    registryDocumentBytes: options?.omitRegistryAnchor ? null : registryBytes,
    approvedRegistryDocumentDigest: options?.omitRegistryAnchor
      ? null
      : approvedRegistryDocumentDigest,
    nowCeiling: NOW_CEILING,
  };

  return {
    archive,
    sidecar,
    sidecarBytes,
    registry,
    att,
    verifyInput,
    ratingsByTeamId,
    captureFp,
  };
}

/**
 * Probe adapted digest by running orchestration once with a placeholder trust
 * record, then rebuild trust from the computed digest as *external* evidence.
 * The helper under test never copies adapted → approvedReceiptDigest.
 */
function externalTrustFromProbe(
  bundle: ReturnType<typeof buildSyntheticFullWeightBundle>,
  overrides: Partial<MlCal1TrustedAcceptanceRecord> = {}
): MlCal1TrustedAcceptanceRecord {
  const probe = verifyBindingThenQualifyCaptureLifecycle({
    binding: bundle.verifyInput,
    captureInputs: {
      ratingFingerprint: bundle.captureFp,
      ratingsByTeamId: bundle.ratingsByTeamId,
    },
    captureSnapshotReferenceTime: T_CAPTURE,
    trustedAcceptance: {
      approvedReceiptDigest: '0'.repeat(64),
      season: 2026,
      selectedPolicy: ML_CAL_1_BINDING_POLICY,
      completedThroughWeek: 6,
      canonicalWeight: 1,
      ratingFingerprint: bundle.captureFp,
      lifecycleSourceSha: PRODUCER_SHA,
    },
    captureProducerSha: CAPTURE_PRODUCER_SHA,
    lifecycleMode: 'fixture_hypothetical',
    expectedSeason: 2026,
    prospectiveWeek: 7,
  });
  if (!probe.adapted) {
    throw new Error('probe_adapted_unavailable');
  }
  return {
    approvedReceiptDigest: probe.adapted.pinnedReceiptDigest,
    season: 2026,
    selectedPolicy: ML_CAL_1_BINDING_POLICY,
    completedThroughWeek: 6,
    canonicalWeight: 1,
    ratingFingerprint: bundle.captureFp,
    lifecycleSourceSha: PRODUCER_SHA,
    ...overrides,
  };
}

function integrationInput(
  bundle: ReturnType<typeof buildSyntheticFullWeightBundle>,
  extra?: {
    trustOverrides?: Partial<MlCal1TrustedAcceptanceRecord>;
    forgedBundleFingerprint?: string;
    captureSnapshotReferenceTime?: string | null;
    trustedAcceptance?: MlCal1TrustedAcceptanceRecord | null;
    binding?: MlCal1LifecycleBindingVerifyInput;
  }
): MlCal1CaptureBindingIntegrationInput {
  const trust =
    extra?.trustedAcceptance === null
      ? null
      : extra?.trustedAcceptance ??
        externalTrustFromProbe(bundle, extra?.trustOverrides);
  return {
    binding: extra?.binding ?? bundle.verifyInput,
    captureInputs: {
      ratingFingerprint:
        extra?.forgedBundleFingerprint ?? bundle.captureFp,
      ratingsByTeamId: bundle.ratingsByTeamId,
    },
    captureSnapshotReferenceTime:
      extra && 'captureSnapshotReferenceTime' in extra
        ? extra.captureSnapshotReferenceTime
        : T_CAPTURE,
    trustedAcceptance: trust,
    captureProducerSha: CAPTURE_PRODUCER_SHA,
    lifecycleMode: 'fixture_hypothetical',
    expectedSeason: 2026,
    prospectiveWeek: 7,
  };
}

describe('ml-cal-1-capture-binding-integration G2 (offline)', () => {
  describe('authentic Week 5 package pins', () => {
    it('preserves published ZIP and member digests', () => {
      expect(sha256Utf8Bytes(WEEK5_ZIP)).toBe(
        ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256
      );
      expect(sha256Utf8Bytes(WEEK5_MEMBER)).toBe(
        ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256
      );
    });

    it('integrity-positive / full-weight-negative through orchestration', () => {
      const sidecar = baseSidecar();
      const sidecarBytes = serializeSidecar(sidecar);
      const ratingsByTeamId = buildCaptureRatingsByTeamIdFromObservedRows(
        sidecar.bindingObservation.rows
      );
      const fp = recomputeCaptureRatingFingerprintFromPlannerMap(
        ratingsByTeamId
      );
      const registry = makeRegistryDoc({
        note: 'test-only-week5',
        approvedSidecarDigest: sha256Utf8Bytes(sidecarBytes),
        approvedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        approvedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        approvedLifecycleProducerSha: PRODUCER_SHA,
        approvedBindingObserverSha: OBSERVER_SHA,
        approvedRatingFingerprint: fp,
        approvedSeason: 2026,
        approvedCompletedThroughWeek: 5,
        approvedSelectedPolicy: ML_CAL_1_BINDING_POLICY,
        approvedCanonicalWeight: 0.75,
        approvedProspectiveTargetWeek: 7,
      });
      const att = makeAttestation({
        sidecarDigest: sha256Utf8Bytes(sidecarBytes),
        registrySha256: registry.digest,
        checkedThroughTime: T_CHECKED_COVERS_CAPTURE,
      });
      const result = verifyBindingThenQualifyCaptureLifecycle({
        binding: {
          zipBytes: WEEK5_ZIP,
          reportMemberBytes: WEEK5_MEMBER,
          sidecarBytes,
          prospectiveTargetWeek: 7,
          expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
          expectedReportMemberSha256:
            ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
          expectedLifecycleProducerSha: PRODUCER_SHA,
          expectedReportMemberPath:
            ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberPath,
          lineageAttestationBytes: att.bytes,
          approvedLineageAttestationDigest: att.approvedLineageAttestationDigest,
          approvedLineageInventorySha256: att.approvedLineageInventorySha256,
          registryPin: registry.pin,
          registryDocumentBytes: registry.bytes,
          approvedRegistryDocumentDigest: registry.approvedRegistryDocumentDigest,
          nowCeiling: NOW_CEILING,
        },
        captureInputs: { ratingFingerprint: fp, ratingsByTeamId },
        captureSnapshotReferenceTime: T_CAPTURE,
        trustedAcceptance: {
          approvedReceiptDigest: '0'.repeat(64),
          season: 2026,
          selectedPolicy: ML_CAL_1_BINDING_POLICY,
          completedThroughWeek: 5,
          canonicalWeight: 0.75,
          ratingFingerprint: fp,
          lifecycleSourceSha: PRODUCER_SHA,
        },
        captureProducerSha: CAPTURE_PRODUCER_SHA,
        lifecycleMode: 'fixture_hypothetical',
        expectedSeason: 2026,
        prospectiveWeek: 7,
      });

      expect(result.binding.archiveIntegrityVerified).toBe(true);
      expect(result.binding.recomputed.canonicalWeight).toBe(0.75);
      expect(result.binding.fullWeightEligible).toBe(false);
      expect(result.binding.liveQualifying).toBe(false);
      expect(result.liveAccepted).toBe(false);
      expect(result.fixtureProvenanceRetained).toBe(true);
      expect(result.ok).toBe(false);
    });
  });

  describe('synthetic full-weight integration', () => {
    it('qualifies through actual capture qualifier with liveAccepted=false', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle)
      );
      expect(result.binding.fullWeightEligible).toBe(true);
      expect(result.binding.liveQualifying).toBe(true);
      expect(result.adapted).not.toBeNull();
      expect(result.lifecycle).not.toBeNull();
      expect(result.lifecycle!.qualified).toBe(true);
      expect(result.lifecycle!.liveAccepted).toBe(false);
      expect(result.liveAccepted).toBe(false);
      expect(result.fixtureProvenanceRetained).toBe(true);
      expect(result.ok).toBe(true);
      expect(result.lineage.coversCaptureAsOf).toBe(true);
      expect(result.fingerprints.captureRecomputed).toBe(bundle.captureFp);
      expect(result.fingerprints.declaredBundleInputs).toBe(bundle.captureFp);
      expect(result.fingerprints.binding).toBe(bundle.captureFp);
      expect(result.fingerprints.registryPin).toBe(bundle.captureFp);
      expect(result.fingerprints.adaptedClaim).toBe(bundle.captureFp);
    });

    it('drives planMlCal1Capture fingerprint field (not sha256 of inputs.json)', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const teams = Object.keys(bundle.ratingsByTeamId).slice(0, 2);
      const rawRatings = teams.map((teamId) => {
        const exp = bundle.ratingsByTeamId[teamId];
        return {
          season: 2026,
          teamId,
          modelVersion: 'v1' as const,
          powerRating: { toString: () => exp.powerRatingRaw ?? '0' },
          rating: exp.ratingRaw
            ? { toString: () => exp.ratingRaw as string }
            : null,
          games: exp.games,
          dataSource: exp.dataSource,
          createdAt: exp.createdAt,
          updatedAt: exp.updatedAt,
        };
      });
      // Use a tiny fixture plan only to assert inputs.ratingFingerprint identity.
      const planned = planMlCal1Capture(
        {
          captureId: 'g2-fp-probe',
          season: 2026,
          week: 7,
          repositorySha: CAPTURE_PRODUCER_SHA,
          captureStartTime: '2026-10-07T17:00:00.000Z',
          snapshotReferenceTime: T_CAPTURE,
          games: [
            {
              gameId: 'g2-game-1',
              season: 2026,
              week: 7,
              homeTeamId: teams[0],
              awayTeamId: teams[1],
              homeTeamName: teams[0],
              awayTeamName: teams[1],
              kickoffAsKnown: '2026-10-07T23:00:00.000Z',
              neutralSite: false,
            },
          ],
          fbsTeamIds: teams,
          ratings: rawRatings,
          marketLines: [],
          lifecycleMode: 'fixture_hypothetical',
          lifecycleReceipt: null,
        },
        { now: () => new Date(T_CAPTURE), publicationTime: T_CAPTURE }
      );
      const fromPlannerMap = recomputeCaptureRatingFingerprintFromPlannerMap(
        planned.bundle.inputs.ratingsByTeamId
      );
      expect(planned.bundle.inputs.ratingFingerprint).toBe(fromPlannerMap);
      const inputsJsonSha = crypto
        .createHash('sha256')
        .update(JSON.stringify(planned.bundle.inputs), 'utf8')
        .digest('hex');
      expect(planned.bundle.inputs.ratingFingerprint).not.toBe(inputsJsonSha);
    });
  });

  describe('approval anchors and receipt trust', () => {
    it('fails closed when approval anchors are missing', () => {
      const bundle = buildSyntheticFullWeightBundle({
        omitRegistryAnchor: true,
        omitLineageAnchor: true,
      });
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle)
      );
      expect(result.ok).toBe(false);
      expect(result.liveAccepted).toBe(false);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          'registry_approval_anchor_missing',
          'lineage_attestation_approval_anchor_missing',
        ])
      );
      expect(result.lifecycle).toBeNull();
    });

    it('fails closed when registry evidence is tampered', () => {
      const bundle = buildSyntheticFullWeightBundle({
        tamperRegistryBytes: true,
      });
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle)
      );
      expect(result.ok).toBe(false);
      expect(result.liveAccepted).toBe(false);
      expect(
        result.reasons.some(
          (r) =>
            r.includes('registry') ||
            r.includes('pin') ||
            r.includes('digest')
        )
      ).toBe(true);
    });

    it('fails when approvedReceiptDigest differs from computed adapted digest', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle, {
          trustOverrides: { approvedReceiptDigest: 'f'.repeat(64) },
        })
      );
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('receipt_approval_digest_mismatch');
      expect(result.liveAccepted).toBe(false);
      expect(result.lifecycle).toBeNull();
      // Helper must not have rewritten trust to match adapted.
      expect(result.adapted).not.toBeNull();
      expect(result.adapted!.pinnedReceiptDigest).not.toBe('f'.repeat(64));
    });
  });

  describe('fingerprint mismatches', () => {
    it('detects forged bundle.inputs.ratingFingerprint field', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const forged = 'e'.repeat(64);
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle, { forgedBundleFingerprint: forged })
      );
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('fingerprint_mismatch_vs_capture_export');
      expect(result.liveAccepted).toBe(false);
      expect(result.lifecycle).toBeNull();
      expect(result.fingerprints.captureRecomputed).toBe(bundle.captureFp);
      expect(result.fingerprints.declaredBundleInputs).toBe(forged);
    });
  });

  describe('capture-as-of lineage', () => {
    it('fails when lineage covers binding observation but not capture as-of', () => {
      const bundle = buildSyntheticFullWeightBundle({
        // Covers binding snap/obs end (T_CHECKED) but not T_CAPTURE.
        checkedThroughTime: T_CHECKED,
      });
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle)
      );
      expect(result.ok).toBe(false);
      expect(result.lineage.coversCaptureAsOf).toBe(false);
      expect(result.reasons).toContain('lineage_does_not_cover_capture');
      expect(result.liveAccepted).toBe(false);
    });

    it('missing capture time retains fixture provenance and no live acceptance', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle, { captureSnapshotReferenceTime: null })
      );
      expect(result.liveAccepted).toBe(false);
      expect(result.fixtureProvenanceRetained).toBe(true);
      expect(result.reasons).toContain('capture_snapshot_reference_time_missing');
      expect(result.ok).toBe(false);
      expect(result.lifecycle).toBeNull();
      expect(result.lineage.coversCaptureAsOf).toBe(false);
    });
  });

  describe('provenance and producer identities', () => {
    it('retains fixture provenance through orchestration outputs', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle)
      );
      expect(result.fixtureProvenanceRetained).toBe(true);
      expect(result.binding.fixtureProvenanceRetained).toBe(true);
      expect(result.liveAccepted).toBe(false);
      expect(result.lifecycle!.liveAccepted).toBe(false);
    });

    it('keeps lifecycle, observer, and capture producer SHAs distinct', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle)
      );
      expect(result.producers.lifecycleProducerSha).toBe(PRODUCER_SHA);
      expect(result.producers.bindingObserverSha).toBe(OBSERVER_SHA);
      expect(result.producers.captureProducerSha).toBe(CAPTURE_PRODUCER_SHA);
      expect(result.producers.lifecycleProducerSha).not.toBe(
        result.producers.captureProducerSha
      );
      expect(result.producers.bindingObserverSha).not.toBe(
        result.producers.captureProducerSha
      );
      expect(result.producers.lifecycleProducerSha).not.toBe(
        result.producers.bindingObserverSha
      );
    });
  });

  describe('Decimal zero and export/fingerprint parity', () => {
    it('binding vs capture exportRatingInput/buildRatingFingerprint parity', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const parity = compareBindingAndCaptureFingerprintParity(
        bundle.sidecar.bindingObservation.rows
      );
      expect(parity.equal).toBe(true);
      expect(parity.captureFingerprint).toBe(bundle.captureFp);
      expect(parity.bindingFingerprint).toBe(bundle.captureFp);
    });

    it('Decimal-like zero remains usable in capture export path', () => {
      const rows = [
        {
          season: 2026,
          teamId: 'zero-team',
          modelVersion: 'v1',
          powerRatingRaw: '0',
          ratingRaw: null,
          games: 6,
          dataSource: 'fixture',
          createdAt: T_ROW,
          updatedAt: T_ROW,
        },
      ];
      const map = buildCaptureRatingsByTeamIdFromObservedRows(rows);
      expect(map['zero-team'].inputUsable).toBe(true);
      expect(map['zero-team'].valueUsed).toBe(0);
      expect(map['zero-team'].powerRatingRaw).toBe('0');
      const fp = recomputeCaptureRatingFingerprintFromPlannerMap(map);
      expect(fp).toMatch(HEX64_RE);
    });
  });

  describe('F1–F4 whole-orchestrator regressions', () => {
    it('F1: unparseable capture time fails and does not inherit binding coverage', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle, {
          captureSnapshotReferenceTime: 'not-a-timestamp',
        })
      );
      expect(result.ok).toBe(false);
      expect(result.liveAccepted).toBe(false);
      expect(result.fixtureProvenanceRetained).toBe(true);
      expect(result.lineage.coversCaptureAsOf).toBe(false);
      expect(result.lineage.requiredThroughTime).toBeNull();
      expect(result.reasons).toContain(
        'capture_snapshot_reference_time_unparseable'
      );
      expect(result.lifecycle).toBeNull();
    });

    it('F2: fixture evidence with lifecycleMode=live does not export nested liveAccepted', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const input = integrationInput(bundle);
      input.lifecycleMode = 'live';
      const result = verifyBindingThenQualifyCaptureLifecycle(input);
      expect(result.ok).toBe(false);
      expect(result.fixtureProvenanceRetained).toBe(true);
      expect(result.liveAccepted).toBe(false);
      expect(result.reasons).toContain('g2_live_mode_rejected');
      expect(result.lifecycle).toBeNull();
    });

    it('F3: wrong trusted season and lifecycle source fail in fixture mode', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const result = verifyBindingThenQualifyCaptureLifecycle(
        integrationInput(bundle, {
          trustOverrides: {
            season: 2025,
            lifecycleSourceSha: 'cccccccccccccccccccccccccccccccccccccccc',
          },
        })
      );
      expect(result.ok).toBe(false);
      expect(result.lifecycle).toBeNull();
      expect(result.liveAccepted).toBe(false);
      expect(result.reasons).toContain('trusted_acceptance_season_mismatch');
      expect(result.reasons).toContain(
        'trusted_acceptance_lifecycle_source_mismatch'
      );
      expect(result.producers.lifecycleProducerSha).not.toBe(
        result.producers.captureProducerSha
      );
      expect(result.producers.bindingObserverSha).not.toBe(
        result.producers.lifecycleProducerSha
      );
    });

    it('F3: prospective week must match binding target and registry target', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const input = integrationInput(bundle);
      input.prospectiveWeek = 8;
      const result = verifyBindingThenQualifyCaptureLifecycle(input);
      expect(result.ok).toBe(false);
      expect(result.lifecycle).toBeNull();
      expect(result.reasons).toContain('prospective_week_mismatch');
      expect(result.liveAccepted).toBe(false);
    });

    it('F4: stale rowContentHash after raw rating change is rejected', () => {
      const bundle = buildSyntheticFullWeightBundle();
      const input = integrationInput(bundle);
      const teamId = Object.keys(input.captureInputs.ratingsByTeamId)[0];
      const row = input.captureInputs.ratingsByTeamId[teamId];
      input.captureInputs = {
        ratingFingerprint: bundle.captureFp,
        ratingsByTeamId: {
          ...input.captureInputs.ratingsByTeamId,
          [teamId]: { ...row, ratingRaw: '999' },
        },
      };
      const result = verifyBindingThenQualifyCaptureLifecycle(input);
      expect(result.ok).toBe(false);
      expect(result.lifecycle).toBeNull();
      expect(result.liveAccepted).toBe(false);
      expect(result.reasons).toContain('exported_row_content_hash_mismatch');
      expect(result.fingerprints.captureRecomputed).toBeNull();
    });
  });

  describe('synthetic package on disk', () => {
    it('PACKAGE_INDEX is present and digests match committed synthetic bytes', () => {
      const indexPath = path.join(SYNTHETIC_ROOT, 'PACKAGE_INDEX.json');
      expect(fs.existsSync(indexPath)).toBe(true);
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as {
        provenance: string;
        liveAccepted: boolean;
        files: Record<string, string>;
      };
      expect(index.provenance).toBe('test-only');
      expect(index.liveAccepted).toBe(false);
      expect(Object.keys(index.files).length).toBeGreaterThan(0);
      for (const [name, digest] of Object.entries(index.files)) {
        const filePath = path.join(SYNTHETIC_ROOT, name);
        expect(fs.existsSync(filePath)).toBe(true);
        const bytes = fs.readFileSync(filePath);
        expect(sha256Utf8Bytes(bytes)).toBe(digest);
      }
    });
  });
});

const HEX64_RE = /^[0-9a-f]{64}$/;
