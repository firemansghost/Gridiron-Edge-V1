/**
 * Offline fixture tests for ML-CAL-1 Lifecycle Binding Sidecar V1.
 * Fixture provenance is test-only; never export as live-accepted evidence.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  adaptDerivedReceiptToCaptureLifecycleInput,
  buildDerivedReceiptCore,
  buildDerivedReceiptEnvelope,
  buildObservedRowsFromReport,
  buildRatingFingerprint,
  buildStoreZip,
  canonicalReceiptBytes,
  exportRatingInput,
  extractSingleUtf8MemberFromZip,
  ML_CAL_1_BINDING_POLICY,
  ML_CAL_1_LIFECYCLE_BINDING_DERIVED_CORE_SCHEMA,
  ML_CAL_1_LIFECYCLE_BINDING_LINEAGE_ATTESTATION_SCHEMA,
  ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA,
  ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS,
  parseLifecycleReport,
  reconstructRawRatingRow,
  serializeLineageAttestation,
  serializeSidecar,
  sha256Utf8Bytes,
  verifyLifecycleBindingSidecar,
  type MlCal1LifecycleBindingLineageAttestation,
  type MlCal1LifecycleBindingRegistryPin,
  type MlCal1LifecycleBindingSidecarV1,
  type MlCal1LifecycleReportParsed,
} from '../lib/ml-cal-1-lifecycle-binding';

const FIXTURE_ROOT = path.join(
  __dirname,
  'fixtures',
  'packages',
  'ml-cal-1-lifecycle-binding-week5-commit'
);

const WEEK5_ZIP = fs.readFileSync(path.join(FIXTURE_ROOT, 'archive.zip'));
const WEEK5_MEMBER = fs.readFileSync(
  path.join(FIXTURE_ROOT, 'core-v1-lifecycle-2026-through-week-5-COMMIT.json')
);

const OBSERVER_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PRODUCER_SHA = ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.lifecycleProducerSha;

const T_RUN = '2026-10-05T15:50:00.000Z';
const T_ART = '2026-10-05T15:56:00.000Z';
const T_OBS0 = '2026-10-06T12:00:00.000Z';
const T_DB = '2026-10-06T12:00:05.000Z';
const T_SNAP = '2026-10-06T12:00:10.000Z';
const T_OBS1 = '2026-10-06T12:00:20.000Z';
const T_ROW = '2026-10-05T16:00:00.000Z';
const NOW_CEILING = '2026-10-07T00:00:00.000Z';
const T_CHECKED = '2026-10-06T12:00:20.000Z';
const T_ATTEST = '2026-10-06T12:05:00.000Z';

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
  declaredEcho?: MlCal1LifecycleBindingSidecarV1['declaredEcho'];
  lineageEcho?: MlCal1LifecycleBindingSidecarV1['lineageEcho'];
  observationStartTime?: string;
  bindingSnapshotReferenceTime?: string;
  observationEndTime?: string;
  workflowRunCompletedAt?: string | null;
  artifactCreatedAt?: string | null;
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
        workflowRunCompletedAt: options?.workflowRunCompletedAt ?? T_RUN,
        artifactCreatedAt: options?.artifactCreatedAt ?? T_ART,
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
      observationStartTime: options?.observationStartTime ?? T_OBS0,
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
    declaredEcho: options?.declaredEcho,
    fingerprintComputedFromLaterReadback: true,
    readbackWasNotExportedAtCommit: true,
    sidecarSelfAccepted: false,
    lineageEcho: options?.lineageEcho,
    providerCalls: 0,
    businessDataWrites: 0,
  };
}

function fingerprintForSidecar(sidecar: MlCal1LifecycleBindingSidecarV1): string {
  const exported: Record<string, ReturnType<typeof exportRatingInput>> = {};
  for (const row of sidecar.bindingObservation.rows) {
    exported[row.teamId] = exportRatingInput(reconstructRawRatingRow(row));
  }
  return buildRatingFingerprint(exported);
}

function makeRegistryDoc(pinBody: Omit<MlCal1LifecycleBindingRegistryPin, 'pinProvenance'> & {
  note: string;
}): { bytes: string; digest: string; pin: MlCal1LifecycleBindingRegistryPin } {
  const bytes = canonicalReceiptBytes(pinBody);
  const digest = sha256Utf8Bytes(bytes);
  const pin: MlCal1LifecycleBindingRegistryPin = {
    pinProvenance: {
      registryId: 'fixture-registry://ml-cal-1-lifecycle-binding-v1',
      registrySha256: digest,
      reviewedAt: T_ATTEST,
      reviewer: 'fixture-reviewer',
    },
    ...pinBody,
  };
  return { bytes, digest, pin };
}

function makeAttestation(options: {
  sidecarDigest: string;
  searchOutcome?: 'none_found' | 'superseded';
  checkedThroughTime?: string;
  registrySha256: string;
}): { bytes: string; attestation: MlCal1LifecycleBindingLineageAttestation } {
  const attestation: MlCal1LifecycleBindingLineageAttestation = {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_LINEAGE_ATTESTATION_SCHEMA,
    kind: 'lifecycle-binding-lineage-attestation',
    approvedSidecarDigest: options.sidecarDigest,
    checkedThroughTime: options.checkedThroughTime ?? T_CHECKED,
    attestationTime: T_ATTEST,
    season: 2026,
    modelVersion: 'v1',
    lineageEvidenceInventorySha256: sha256Utf8Bytes('fixture-inventory-v1\n'),
    searchOutcome: options.searchOutcome ?? 'none_found',
    supersedingArtifacts:
      options.searchOutcome === 'superseded'
        ? [
            {
              workflowRunId: '999',
              zipSha256: 'f'.repeat(64),
              completedThroughWeek: 6,
              artifactCreatedAt: T_ART,
            },
          ]
        : [],
    pinProvenance: {
      registryId: 'fixture-registry://ml-cal-1-lifecycle-binding-v1',
      registrySha256: options.registrySha256,
      reviewedAt: T_ATTEST,
      reviewer: 'fixture-reviewer',
    },
  };
  return { bytes: serializeLineageAttestation(attestation), attestation };
}

function buildWeek6HypotheticalArchive(): {
  report: MlCal1LifecycleReportParsed;
  memberBytes: Buffer;
  zipBytes: Buffer;
  zipSha256: string;
  memberSha256: string;
} {
  const base = week5Report();
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
  };
}

describe('ml-cal-1-lifecycle-binding (offline)', () => {
  describe('fixture package digests', () => {
    it('matches published Week 5 COMMIT pins', () => {
      expect(sha256Utf8Bytes(WEEK5_ZIP)).toBe(
        ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256
      );
      expect(sha256Utf8Bytes(WEEK5_MEMBER)).toBe(
        ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256
      );
      const extracted = extractSingleUtf8MemberFromZip(WEEK5_ZIP);
      expect(extracted.memberPath).toBe(
        ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberPath
      );
      expect(sha256Utf8Bytes(extracted.memberBytes)).toBe(
        ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256
      );
    });
  });

  describe('Decimal reconstruction (§3.4)', () => {
    it('N8: valid Decimal zero string remains usable', () => {
      const exported = exportRatingInput(
        reconstructRawRatingRow({
          season: 2026,
          teamId: 'test-zero',
          modelVersion: 'v1',
          powerRatingRaw: '0',
          ratingRaw: null,
          games: 1,
          dataSource: 'fixture',
          createdAt: T_ROW,
          updatedAt: T_ROW,
        })
      );
      expect(exported.chosenField).toBe('powerRating');
      expect(exported.valueUsed).toBe(0);
      expect(exported.inputUsable).toBe(true);
      expect(exported.powerRatingRaw).toBe('0');
    });

    it('falls back to rating when powerRatingRaw is null', () => {
      const exported = exportRatingInput(
        reconstructRawRatingRow({
          season: 2026,
          teamId: 'test-rating',
          modelVersion: 'v1',
          powerRatingRaw: null,
          ratingRaw: '4.25',
          games: 1,
          dataSource: 'fixture',
          createdAt: T_ROW,
          updatedAt: T_ROW,
        })
      );
      expect(exported.chosenField).toBe('rating');
      expect(exported.valueUsed).toBe(4.25);
      expect(exported.inputUsable).toBe(true);
    });

    it('rejects whitespace-only raw (no zero forecast)', () => {
      const exported = exportRatingInput(
        reconstructRawRatingRow({
          season: 2026,
          teamId: 'test-blank',
          modelVersion: 'v1',
          powerRatingRaw: ' ',
          ratingRaw: null,
          games: 1,
          dataSource: 'fixture',
          createdAt: T_ROW,
          updatedAt: T_ROW,
        })
      );
      expect(exported.inputUsable).toBe(false);
      expect(exported.unavailableReasons).toContain(
        'blank_or_whitespace_rating_value'
      );
    });

    it('null/null → default_zero / unusable', () => {
      const exported = exportRatingInput(
        reconstructRawRatingRow({
          season: 2026,
          teamId: 'test-null',
          modelVersion: 'v1',
          powerRatingRaw: null,
          ratingRaw: null,
          games: 1,
          dataSource: 'fixture',
          createdAt: T_ROW,
          updatedAt: T_ROW,
        })
      );
      expect(exported.chosenField).toBe('default_zero');
      expect(exported.inputUsable).toBe(false);
    });
  });

  describe('N1 real Week 5 full-weight negative', () => {
    it('archive integrity PASS; weight 0.75; fullWeightEligible=false', () => {
      const sidecar = baseSidecar();
      const sidecarBytes = serializeSidecar(sidecar);
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes,
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.archiveIntegrityVerified).toBe(true);
      expect(result.plannedNumericAgreementOk).toBe(true);
      expect(result.recomputed.canonicalWeight).toBe(0.75);
      expect(result.recomputed.recomputedWeight).toBe(0.75);
      expect(result.recomputed.fullWeightByPolicy).toBe(false);
      expect(result.fullWeightEligible).toBe(false);
      expect(result.liveQualifying).toBe(false);
      expect(result.liveAccepted).toBe(false);
      expect(result.reasons).toContain('lineage_attestation_missing');
    });
  });

  describe('N2 self-declared full-weight echo ignored', () => {
    it('ignores declaredEcho.fullWeightEligible=true on Week 5', () => {
      const sidecar = baseSidecar({
        declaredEcho: {
          fullWeightEligible: true,
          archiveIntegrityVerified: true,
        },
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.fullWeightEligible).toBe(false);
      expect(result.reasons).toContain('declared_fullWeightEligible_mismatch');
      expect(result.notes).toContain('self_declared_fullWeightEligible_ignored');
    });
  });

  describe('N3 prospective target week', () => {
    it('week 6 archive with targetWeek=6 → prospectiveOk=false', () => {
      const archive = buildWeek6HypotheticalArchive();
      const sidecar = baseSidecar({
        mode: 'fixture_hypothetical',
        report: archive.report,
        zipBytes: archive.zipBytes,
        memberBytes: archive.memberBytes,
        zipSha256: archive.zipSha256,
        memberSha256: archive.memberSha256,
      });
      sidecar.acceptedArchive.github.reportMemberPath =
        'core-v1-lifecycle-2026-through-week-6-COMMIT.json';
      const result = verifyLifecycleBindingSidecar({
        zipBytes: archive.zipBytes,
        reportMemberBytes: archive.memberBytes,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 6,
        expectedZipSha256: archive.zipSha256,
        expectedReportMemberSha256: archive.memberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.recomputed.fullWeightByPolicy).toBe(true);
      expect(result.recomputed.prospectiveOk).toBe(false);
      expect(result.fullWeightEligible).toBe(false);
    });
  });

  describe('N4 observation provenance / timing', () => {
    it('fails when observation predates artifact', () => {
      const sidecar = baseSidecar({
        observationStartTime: '2026-10-05T15:00:00.000Z',
        bindingSnapshotReferenceTime: '2026-10-05T15:00:05.000Z',
        observationEndTime: '2026-10-05T15:00:10.000Z',
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.reasons).toContain('observation_predates_archive');
    });

    it('N6a: missing observation provenance', () => {
      const sidecar = baseSidecar();
      (sidecar.bindingObservation as { observationStartTime?: string }).observationStartTime =
        undefined;
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.reasons).toContain('observation_provenance_missing');
    });
  });

  describe('N5 / N6 registry pin negatives', () => {
    it('N5: sidecar digest ≠ registry approvedSidecarDigest', () => {
      const sidecar = baseSidecar({ mode: 'binding_observation' });
      const sidecarBytes = serializeSidecar(sidecar);
      const fp = fingerprintForSidecar(sidecar);
      const { bytes, pin } = makeRegistryDoc({
        note: 'fixture',
        approvedSidecarDigest: '0'.repeat(64),
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
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes,
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        registryPin: pin,
        registryDocumentBytes: bytes,
        nowCeiling: NOW_CEILING,
      });
      expect(result.reasons).toContain('sidecar_digest_mismatch_vs_registry');
      expect(result.independentlyPinned).toBe(false);
    });

    it('N6e/N9: trusted-like pin without provenance cannot bootstrap', () => {
      const sidecar = baseSidecar();
      const fp = fingerprintForSidecar(sidecar);
      const pin = {
        pinProvenance: {
          registryId: '',
          registrySha256: '',
          reviewedAt: '',
          reviewer: '',
        },
        approvedSidecarDigest: sha256Utf8Bytes(serializeSidecar(sidecar)),
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
      } as MlCal1LifecycleBindingRegistryPin;
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        registryPin: pin,
        nowCeiling: NOW_CEILING,
      });
      expect(result.reasons).toContain('registry_pin_provenance_missing');
      expect(result.liveQualifying).toBe(false);
    });

    it('N6d: fixture_hypothetical never liveAccepted', () => {
      const archive = buildWeek6HypotheticalArchive();
      const sidecar = baseSidecar({
        mode: 'fixture_hypothetical',
        report: archive.report,
        zipBytes: archive.zipBytes,
        memberBytes: archive.memberBytes,
        zipSha256: archive.zipSha256,
        memberSha256: archive.memberSha256,
      });
      sidecar.acceptedArchive.github.reportMemberPath =
        'core-v1-lifecycle-2026-through-week-6-COMMIT.json';
      const sidecarBytes = serializeSidecar(sidecar);
      const fp = fingerprintForSidecar(sidecar);
      const { bytes, pin } = makeRegistryDoc({
        note: 'fixture-week6',
        approvedSidecarDigest: sha256Utf8Bytes(sidecarBytes),
        approvedZipSha256: archive.zipSha256,
        approvedReportMemberSha256: archive.memberSha256,
        approvedLifecycleProducerSha: PRODUCER_SHA,
        approvedBindingObserverSha: OBSERVER_SHA,
        approvedRatingFingerprint: fp,
        approvedSeason: 2026,
        approvedCompletedThroughWeek: 6,
        approvedSelectedPolicy: ML_CAL_1_BINDING_POLICY,
        approvedCanonicalWeight: 1,
        approvedProspectiveTargetWeek: 7,
      });
      const { bytes: attBytes } = makeAttestation({
        sidecarDigest: sha256Utf8Bytes(sidecarBytes),
        registrySha256: pin.pinProvenance.registrySha256,
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: archive.zipBytes,
        reportMemberBytes: archive.memberBytes,
        sidecarBytes,
        prospectiveTargetWeek: 7,
        expectedZipSha256: archive.zipSha256,
        expectedReportMemberSha256: archive.memberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        lineageAttestationBytes: attBytes,
        registryPin: pin,
        registryDocumentBytes: bytes,
        nowCeiling: NOW_CEILING,
      });
      expect(result.fullWeightEligible).toBe(true);
      expect(result.liveQualifying).toBe(true);
      expect(result.liveAccepted).toBe(false);
      expect(result.notes).toContain('fixture_hypothetical_cannot_live_accept');
    });
  });

  describe('N7 metadata / fingerprint mismatch', () => {
    it('changed dataSource → fingerprint mismatch vs registry', () => {
      const sidecar = baseSidecar({ mode: 'binding_observation' });
      const goodFp = fingerprintForSidecar(sidecar);
      sidecar.bindingObservation.rows = sidecar.bindingObservation.rows.map(
        (r) => ({ ...r, dataSource: 'tampered-source' })
      );
      const sidecarBytes = serializeSidecar(sidecar);
      const { bytes, pin } = makeRegistryDoc({
        note: 'fp-mismatch',
        approvedSidecarDigest: sha256Utf8Bytes(sidecarBytes),
        approvedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        approvedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        approvedLifecycleProducerSha: PRODUCER_SHA,
        approvedBindingObserverSha: OBSERVER_SHA,
        approvedRatingFingerprint: goodFp,
        approvedSeason: 2026,
        approvedCompletedThroughWeek: 5,
        approvedSelectedPolicy: ML_CAL_1_BINDING_POLICY,
        approvedCanonicalWeight: 0.75,
        approvedProspectiveTargetWeek: 7,
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes,
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        registryPin: pin,
        registryDocumentBytes: bytes,
        nowCeiling: NOW_CEILING,
      });
      expect(result.reasons).toContain('fingerprint_mismatch_vs_registry');
    });
  });

  describe('N10–N13 lineage attestation', () => {
    it('N10: numeric pass but lineage missing → liveQualifying=false', () => {
      const sidecar = baseSidecar();
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.plannedNumericAgreementOk).toBe(true);
      expect(result.reasons).toContain('lineage_attestation_missing');
      expect(result.notes).toContain('lineage_revision_evidence_unavailable');
      expect(result.liveQualifying).toBe(false);
    });

    it('N11: searchOutcome=superseded blocks', () => {
      const sidecar = baseSidecar();
      const sidecarBytes = serializeSidecar(sidecar);
      const { bytes: attBytes } = makeAttestation({
        sidecarDigest: sha256Utf8Bytes(sidecarBytes),
        searchOutcome: 'superseded',
        registrySha256: 'a'.repeat(64),
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes,
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        lineageAttestationBytes: attBytes,
        nowCeiling: NOW_CEILING,
      });
      expect(result.reasons).toContain('binding_invalidated_by_later_lifecycle');
      expect(result.recomputed.lineageOk).toBe(false);
    });

    it('N12: lineageEcho present without external attestation is ignored', () => {
      const sidecar = baseSidecar({
        lineageEcho: {
          priorApprovedBindingDigest: null,
          note: 'self-declared',
          lineageEvidenceStatus: 'present',
        },
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.notes).toContain('lineage_echo_ignored_for_decisions');
      expect(result.reasons).toContain('lineage_attestation_missing');
      expect(result.liveQualifying).toBe(false);
    });

    it('N13: checkedThroughTime < bindingSnapshotReferenceTime', () => {
      const sidecar = baseSidecar();
      const sidecarBytes = serializeSidecar(sidecar);
      const { bytes: attBytes } = makeAttestation({
        sidecarDigest: sha256Utf8Bytes(sidecarBytes),
        checkedThroughTime: '2026-10-06T11:59:00.000Z',
        registrySha256: 'b'.repeat(64),
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes,
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        lineageAttestationBytes: attBytes,
        nowCeiling: NOW_CEILING,
      });
      expect(result.reasons).toContain('lineage_checked_through_too_early');
    });
  });

  describe('N14–N16 derived receipt / adapter', () => {
    it('N14: forbids self-referencing receiptDigest in captureClaim', () => {
      expect(() =>
        buildDerivedReceiptCore({
          zipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
          reportMemberSha256:
            ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
          reportByteCount: WEEK5_MEMBER.length,
          lifecycleProducerSha: PRODUCER_SHA,
          githubRunId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.workflowRunId,
          githubArtifactId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactId,
          sidecarDigest: 'c'.repeat(64),
          captureClaim: {
            sourceSha: PRODUCER_SHA,
            completedThroughWeek: 5,
            selectedPolicy: ML_CAL_1_BINDING_POLICY,
            canonicalWeight: 0.75,
            season: 2026,
            acceptedImmutable: true,
            ratingFingerprint: 'd'.repeat(64),
            // @ts-expect-error intentional self-digest
            receiptDigest: 'e'.repeat(64),
          },
          bindingObserverSha: OBSERVER_SHA,
          lineageAttestationDigest: 'f'.repeat(64),
          lineageCheckedThroughTime: T_CHECKED,
        })
      ).toThrow(/self_referencing_digest/);
    });

    it('N15: envelope coreDigest must equal sha256(coreBytes)', () => {
      const core = buildDerivedReceiptCore({
        zipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        reportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        reportByteCount: WEEK5_MEMBER.length,
        lifecycleProducerSha: PRODUCER_SHA,
        githubRunId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.workflowRunId,
        githubArtifactId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactId,
        sidecarDigest: 'c'.repeat(64),
        captureClaim: {
          sourceSha: PRODUCER_SHA,
          completedThroughWeek: 5,
          selectedPolicy: ML_CAL_1_BINDING_POLICY,
          canonicalWeight: 0.75,
          season: 2026,
          acceptedImmutable: true,
          ratingFingerprint: 'd'.repeat(64),
        },
        bindingObserverSha: OBSERVER_SHA,
        lineageAttestationDigest: 'f'.repeat(64),
        lineageCheckedThroughTime: T_CHECKED,
      });
      expect(core.schemaVersion).toBe(ML_CAL_1_LIFECYCLE_BINDING_DERIVED_CORE_SCHEMA);
      const envelope = buildDerivedReceiptEnvelope(core);
      expect(envelope.coreDigest).toBe(sha256Utf8Bytes(envelope.coreBytes));
      expect(() =>
        adaptDerivedReceiptToCaptureLifecycleInput({
          ...envelope,
          coreDigest: '0'.repeat(64),
        })
      ).toThrow(/derived_core_digest_mismatch/);
    });

    it('N16: adapter hashes claim body then sets receiptDigest; tamper fails pin', () => {
      const core = buildDerivedReceiptCore({
        zipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        reportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        reportByteCount: WEEK5_MEMBER.length,
        lifecycleProducerSha: PRODUCER_SHA,
        githubRunId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.workflowRunId,
        githubArtifactId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactId,
        sidecarDigest: 'c'.repeat(64),
        captureClaim: {
          sourceSha: PRODUCER_SHA,
          completedThroughWeek: 5,
          selectedPolicy: ML_CAL_1_BINDING_POLICY,
          canonicalWeight: 0.75,
          season: 2026,
          acceptedImmutable: true,
          ratingFingerprint: 'd'.repeat(64),
        },
        bindingObserverSha: OBSERVER_SHA,
        lineageAttestationDigest: 'f'.repeat(64),
        lineageCheckedThroughTime: T_CHECKED,
      });
      const envelope = buildDerivedReceiptEnvelope(core);
      const adapted = adaptDerivedReceiptToCaptureLifecycleInput(envelope);
      expect(adapted.claims.receiptDigest).toBe(
        sha256Utf8Bytes(adapted.receiptBytes)
      );
      expect(adapted.pinnedReceiptDigest).toBe(adapted.claims.receiptDigest);
      expect(JSON.parse(adapted.receiptBytes)).not.toHaveProperty(
        'receiptDigest'
      );

      const tamperedBytes = adapted.receiptBytes.replace(
        '"completedThroughWeek":5',
        '"completedThroughWeek":6'
      );
      expect(sha256Utf8Bytes(tamperedBytes)).not.toBe(
        adapted.pinnedReceiptDigest
      );
    });
  });

  describe('member tamper / wrong pins / cohort', () => {
    it('forged ZIP digest fails closed', () => {
      const sidecar = baseSidecar();
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: '0'.repeat(64),
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.archiveIntegrityVerified).toBe(false);
      expect(result.reasons).toContain('archive_zip_digest_mismatch');
    });

    it('duplicate team in observation fails numeric agreement', () => {
      const sidecar = baseSidecar();
      const dup = { ...sidecar.bindingObservation.rows[0] };
      sidecar.bindingObservation.rows = [
        ...sidecar.bindingObservation.rows,
        dup,
      ];
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.plannedNumericAgreementOk).toBe(false);
      expect(
        result.reasons.some((r) => r.startsWith('duplicate_after_write:'))
      ).toBe(true);
    });

    it('missing team fails numeric agreement', () => {
      const sidecar = baseSidecar();
      sidecar.bindingObservation.rows = sidecar.bindingObservation.rows.slice(
        0,
        137
      );
      const result = verifyLifecycleBindingSidecar({
        zipBytes: WEEK5_ZIP,
        reportMemberBytes: WEEK5_MEMBER,
        sidecarBytes: serializeSidecar(sidecar),
        prospectiveTargetWeek: 7,
        expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
        expectedReportMemberSha256:
          ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        nowCeiling: NOW_CEILING,
      });
      expect(result.plannedNumericAgreementOk).toBe(false);
      expect(result.reasons).toContain('after_write_team_set_mismatch');
    });
  });

  describe('P1 / P2 positive offline hypothetical', () => {
    it('P1: week6 fixture_hypothetical may be fullWeightEligible; liveAccepted=false', () => {
      const archive = buildWeek6HypotheticalArchive();
      const sidecar = baseSidecar({
        mode: 'fixture_hypothetical',
        report: archive.report,
        zipBytes: archive.zipBytes,
        memberBytes: archive.memberBytes,
        zipSha256: archive.zipSha256,
        memberSha256: archive.memberSha256,
      });
      sidecar.acceptedArchive.github.reportMemberPath =
        'core-v1-lifecycle-2026-through-week-6-COMMIT.json';
      const sidecarBytes = serializeSidecar(sidecar);
      const fp = fingerprintForSidecar(sidecar);
      const { bytes, pin } = makeRegistryDoc({
        note: 'P1',
        approvedSidecarDigest: sha256Utf8Bytes(sidecarBytes),
        approvedZipSha256: archive.zipSha256,
        approvedReportMemberSha256: archive.memberSha256,
        approvedLifecycleProducerSha: PRODUCER_SHA,
        approvedBindingObserverSha: OBSERVER_SHA,
        approvedRatingFingerprint: fp,
        approvedSeason: 2026,
        approvedCompletedThroughWeek: 6,
        approvedSelectedPolicy: ML_CAL_1_BINDING_POLICY,
        approvedCanonicalWeight: 1,
        approvedProspectiveTargetWeek: 7,
      });
      const { bytes: attBytes } = makeAttestation({
        sidecarDigest: sha256Utf8Bytes(sidecarBytes),
        registrySha256: pin.pinProvenance.registrySha256,
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: archive.zipBytes,
        reportMemberBytes: archive.memberBytes,
        sidecarBytes,
        prospectiveTargetWeek: 7,
        expectedZipSha256: archive.zipSha256,
        expectedReportMemberSha256: archive.memberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        lineageAttestationBytes: attBytes,
        registryPin: pin,
        registryDocumentBytes: bytes,
        nowCeiling: NOW_CEILING,
      });
      expect(result.archiveIntegrityVerified).toBe(true);
      expect(result.plannedNumericAgreementOk).toBe(true);
      expect(result.fullWeightEligible).toBe(true);
      expect(result.liveQualifying).toBe(true);
      expect(result.liveAccepted).toBe(false);
    });

    it('P2: binding_observation + test registry may liveAccepted inside harness only', () => {
      const archive = buildWeek6HypotheticalArchive();
      const sidecar = baseSidecar({
        mode: 'binding_observation',
        report: archive.report,
        zipBytes: archive.zipBytes,
        memberBytes: archive.memberBytes,
        zipSha256: archive.zipSha256,
        memberSha256: archive.memberSha256,
      });
      sidecar.acceptedArchive.github.reportMemberPath =
        'core-v1-lifecycle-2026-through-week-6-COMMIT.json';
      const sidecarBytes = serializeSidecar(sidecar);
      const fp = fingerprintForSidecar(sidecar);
      const { bytes, pin } = makeRegistryDoc({
        note: 'P2-test-registry-only',
        approvedSidecarDigest: sha256Utf8Bytes(sidecarBytes),
        approvedZipSha256: archive.zipSha256,
        approvedReportMemberSha256: archive.memberSha256,
        approvedLifecycleProducerSha: PRODUCER_SHA,
        approvedBindingObserverSha: OBSERVER_SHA,
        approvedRatingFingerprint: fp,
        approvedSeason: 2026,
        approvedCompletedThroughWeek: 6,
        approvedSelectedPolicy: ML_CAL_1_BINDING_POLICY,
        approvedCanonicalWeight: 1,
        approvedProspectiveTargetWeek: 7,
      });
      const { bytes: attBytes } = makeAttestation({
        sidecarDigest: sha256Utf8Bytes(sidecarBytes),
        registrySha256: pin.pinProvenance.registrySha256,
      });
      const result = verifyLifecycleBindingSidecar({
        zipBytes: archive.zipBytes,
        reportMemberBytes: archive.memberBytes,
        sidecarBytes,
        prospectiveTargetWeek: 7,
        expectedZipSha256: archive.zipSha256,
        expectedReportMemberSha256: archive.memberSha256,
        expectedLifecycleProducerSha: PRODUCER_SHA,
        lineageAttestationBytes: attBytes,
        registryPin: pin,
        registryDocumentBytes: bytes,
        nowCeiling: NOW_CEILING,
      });
      expect(result.liveQualifying).toBe(true);
      expect(result.liveAccepted).toBe(true);
      // Explicit: this is harness-only synthetic trust, not production authority.
      expect(pin.pinProvenance.registryId).toContain('fixture-registry');
    });
  });
});
