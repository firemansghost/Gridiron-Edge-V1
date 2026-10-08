/**
 * G3 fixture-first capture/binding wiring.
 * Exercises the planner, artifact writer, and terminal reader.
 * Fixture provenance only; liveAccepted must stay false.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { planFixtureCaptureWithBindingIntegration } from '../lib/ml-cal-1-capture-binding-fixture';
import { verifyBindingThenQualifyCaptureLifecycle } from '../lib/ml-cal-1-capture-binding-integration';
import {
  buildRatingFingerprint,
  exportRatingInput,
  readCaptureTerminalResult,
  sha256Utf8Bytes,
  stableStringify,
  writeCaptureArtifactsAtomic,
  type MlCal1FixtureInput,
  type MlCal1RawRatingRow,
} from '../lib/ml-cal-1-capture';
import { runMlCal1Cli } from '../capture-ml-cal-1-2026';
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
  reconstructRawRatingRow,
  serializeLineageAttestation,
  serializeSidecar,
  type MlCal1BindingObservedRatingRow,
  type MlCal1LifecycleBindingRegistryPin,
  type MlCal1LifecycleBindingVerifyInput,
} from '../lib/ml-cal-1-lifecycle-binding';

const WEEK5_ROOT = path.join(
  __dirname,
  'fixtures',
  'packages',
  'ml-cal-1-lifecycle-binding-week5-commit'
);
const WEEK5_MEMBER = fs.readFileSync(
  path.join(WEEK5_ROOT, 'core-v1-lifecycle-2026-through-week-5-COMMIT.json')
);
const WEEK5_ZIP = fs.readFileSync(path.join(WEEK5_ROOT, 'archive.zip'));

const OBSERVER_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CAPTURE_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PRODUCER_SHA = ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.lifecycleProducerSha;
const T_ROW = '2026-10-05T16:00:00.000Z';
const T_SNAP = '2026-10-07T18:00:00.000Z';
const T_START = '2026-10-07T17:59:00.000Z';
const T_KICK = '2026-10-07T23:00:00.000Z';
const T_MARKET = '2026-10-07T17:50:00.000Z';
const T_PUB = '2026-10-07T18:05:00.000Z';
const T_ATTEST = '2026-10-07T18:05:00.000Z';
const NOW_CEILING = '2026-10-08T00:00:00.000Z';
const T_CHECKED = '2026-10-07T18:00:00.000Z';
const INVENTORY = sha256Utf8Bytes('g3-fixture-inventory\n');

function week6Member(mutate?: (row: Record<string, unknown>) => void): Buffer {
  const report = JSON.parse(WEEK5_MEMBER.toString('utf8')) as Record<string, unknown>;
  report.completedThroughWeek = 6;
  report.canonicalWeight = 1;
  report.rows = (report.rows as Array<Record<string, unknown>>).map((row) => {
    const next = { ...row, canonicalWeight: 1 };
    if (mutate) mutate(next);
    return next;
  });
  return Buffer.from(`${JSON.stringify(report)}\n`, 'utf8');
}

function bundleFromMember(
  memberBytes: Buffer,
  options?: { checkedThrough?: string; dropRegistry?: boolean }
) {
  const memberPath = 'core-v1-lifecycle-2026-through-week-6-COMMIT.json';
  const zipBytes = buildStoreZip(memberPath, memberBytes);
  const report = parseLifecycleReport(memberBytes);
  const rows = buildObservedRowsFromReport(report, {
    createdAt: T_ROW,
    updatedAt: T_ROW,
  });
  const sidecar = {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA,
    kind: 'lifecycle-binding-sidecar' as const,
    mode: 'fixture_hypothetical' as const,
    acceptedArchive: {
      github: {
        workflowRunId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.workflowRunId,
        artifactId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactId,
        artifactName: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactName,
        workflowRunCompletedAt: '2026-10-05T15:50:00.000Z',
        artifactCreatedAt: '2026-10-05T15:56:00.000Z',
        zipSha256: sha256Utf8Bytes(zipBytes),
        reportMemberPath: memberPath,
        reportMemberSha256: sha256Utf8Bytes(memberBytes),
        reportByteCount: memberBytes.length,
      },
      lifecycleProducerSha: PRODUCER_SHA,
      declaredSeason: report.season,
      declaredCompletedThroughWeek: report.completedThroughWeek,
      declaredSelectedPolicy: report.selectedPolicy,
      declaredCanonicalWeight: report.canonicalWeight,
    },
    bindingObservation: {
      observationStartTime: '2026-10-06T12:00:00.000Z',
      observationEndTime: '2026-10-06T12:00:20.000Z',
      bindingSnapshotReferenceTime: '2026-10-06T12:00:10.000Z',
      dbTransactionTime: '2026-10-06T12:00:05.000Z',
      dbTransactionTimeUnavailableReason: null,
      bindingObserverSha: OBSERVER_SHA,
      readMode: 'fixture_injected' as const,
      season: report.season,
      modelVersion: 'v1' as const,
      rows,
      rowCreatedAtMin: T_ROW,
      rowCreatedAtMax: T_ROW,
      rowUpdatedAtMin: T_ROW,
      rowUpdatedAtMax: T_ROW,
    },
    fingerprintComputedFromLaterReadback: true as const,
    readbackWasNotExportedAtCommit: true as const,
    sidecarSelfAccepted: false as const,
    providerCalls: 0 as const,
    businessDataWrites: 0 as const,
  };
  const sidecarBytes = serializeSidecar(sidecar);
  const ratings = rows.map((row) => reconstructRawRatingRow(row));
  const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
  for (const row of ratings) by[row.teamId] = exportRatingInput(row);
  const fingerprint = buildRatingFingerprint(by);
  const approved = {
    approvedSidecarDigest: sha256Utf8Bytes(sidecarBytes),
    approvedZipSha256: sha256Utf8Bytes(zipBytes),
    approvedReportMemberSha256: sha256Utf8Bytes(memberBytes),
    approvedLifecycleProducerSha: PRODUCER_SHA,
    approvedBindingObserverSha: OBSERVER_SHA,
    approvedRatingFingerprint: fingerprint,
    approvedSeason: 2026,
    approvedCompletedThroughWeek: report.completedThroughWeek,
    approvedSelectedPolicy: ML_CAL_1_BINDING_POLICY,
    approvedCanonicalWeight: report.canonicalWeight,
    approvedProspectiveTargetWeek: 7,
  };
  const registryDoc = {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_REGISTRY_DOCUMENT_SCHEMA,
    kind: 'lifecycle-binding-registry-document' as const,
    provenance: 'test-only' as const,
    note: 'g3-test-only',
    ...approved,
  };
  const registryBytes = canonicalReceiptBytes(registryDoc);
  const registryDigest = sha256Utf8Bytes(registryBytes);
  const pin: MlCal1LifecycleBindingRegistryPin = {
    pinProvenance: {
      registryId: 'fixture-registry://ml-cal-1-g3',
      registrySha256: registryDigest,
      reviewedAt: T_ATTEST,
      reviewer: 'fixture-reviewer-g3',
    },
    ...approved,
  };
  const attestation = {
    schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_LINEAGE_ATTESTATION_SCHEMA,
    kind: 'lifecycle-binding-lineage-attestation' as const,
    approvedSidecarDigest: sha256Utf8Bytes(sidecarBytes),
    checkedThroughTime: options?.checkedThrough ?? T_CHECKED,
    attestationTime: T_ATTEST,
    season: 2026,
    modelVersion: 'v1' as const,
    lineageEvidenceInventorySha256: INVENTORY,
    searchOutcome: 'none_found' as const,
    supersedingArtifacts: [],
    pinProvenance: pin.pinProvenance,
  };
  const lineageBytes = serializeLineageAttestation(attestation);
  const binding: MlCal1LifecycleBindingVerifyInput = {
    zipBytes,
    reportMemberBytes: memberBytes,
    sidecarBytes,
    prospectiveTargetWeek: 7,
    expectedZipSha256: sha256Utf8Bytes(zipBytes),
    expectedReportMemberSha256: sha256Utf8Bytes(memberBytes),
    expectedLifecycleProducerSha: PRODUCER_SHA,
    expectedReportMemberPath: memberPath,
    lineageAttestationBytes: lineageBytes,
    approvedLineageAttestationDigest: sha256Utf8Bytes(lineageBytes),
    approvedLineageInventorySha256: INVENTORY,
    registryPin: options?.dropRegistry ? null : pin,
    registryDocumentBytes: options?.dropRegistry ? null : registryBytes,
    approvedRegistryDocumentDigest: options?.dropRegistry ? null : registryDigest,
    nowCeiling: NOW_CEILING,
  };
  return { binding, rows, ratings, fingerprint, sidecarBytes };
}

function qualifyingReceipt(fingerprint: string) {
  const core = {
    sourceSha: PRODUCER_SHA,
    completedThroughWeek: 6,
    selectedPolicy: ML_CAL_1_BINDING_POLICY,
    canonicalWeight: 1,
    season: 2026,
    acceptedImmutable: true as const,
    ratingFingerprint: fingerprint,
  };
  const receiptBytes = `${stableStringify(core)}\n`;
  const digest = sha256Utf8Bytes(receiptBytes);
  return {
    receiptBytes,
    pinnedReceiptDigest: digest,
    lifecycleReceipt: { ...core, receiptDigest: digest },
  };
}

function captureInput(
  ratings: MlCal1RawRatingRow[],
  rows: MlCal1BindingObservedRatingRow[],
  fingerprint: string,
  extra?: Partial<MlCal1FixtureInput>
): MlCal1FixtureInput {
  const home = rows[0].teamId;
  const away = rows[1].teamId;
  const receipt = qualifyingReceipt(fingerprint);
  return {
    captureId: 'g3-fixture-capture',
    season: 2026,
    week: 7,
    repositorySha: CAPTURE_SHA,
    captureStartTime: T_START,
    snapshotReferenceTime: T_SNAP,
    games: [
      {
        gameId: 'g3-game-1',
        season: 2026,
        week: 7,
        homeTeamId: home,
        awayTeamId: away,
        homeTeamName: home,
        awayTeamName: away,
        kickoffAsKnown: T_KICK,
        neutralSite: false,
      },
    ],
    fbsTeamIds: rows.map((row) => row.teamId),
    ratings,
    marketLines: [
      {
        id: 'g3-ml-home',
        gameId: 'g3-game-1',
        lineType: 'moneyline',
        lineValue: -150,
        bookName: 'BetRivers',
        timestamp: T_MARKET,
        createdAt: T_MARKET,
        updatedAt: T_MARKET,
        teamId: home,
        source: 'oddsapi',
      },
      {
        id: 'g3-ml-away',
        gameId: 'g3-game-1',
        lineType: 'moneyline',
        lineValue: 130,
        bookName: 'BetRivers',
        timestamp: T_MARKET,
        createdAt: T_MARKET,
        updatedAt: T_MARKET,
        teamId: away,
        source: 'oddsapi',
      },
    ],
    lifecycleMode: 'fixture_hypothetical',
    ...receipt,
    ...extra,
  };
}

function externalTrust(binding: MlCal1LifecycleBindingVerifyInput, ratings: MlCal1RawRatingRow[], fingerprint: string) {
  const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
  for (const row of ratings) {
    if (row.modelVersion === 'v1' && row.season === 2026) by[row.teamId] = exportRatingInput(row);
  }
  const probe = verifyBindingThenQualifyCaptureLifecycle({
    binding,
    captureInputs: { ratingFingerprint: fingerprint, ratingsByTeamId: by },
    captureSnapshotReferenceTime: T_SNAP,
    trustedAcceptance: {
      approvedReceiptDigest: '0'.repeat(64),
      season: 2026,
      selectedPolicy: ML_CAL_1_BINDING_POLICY,
      completedThroughWeek: 6,
      canonicalWeight: 1,
      ratingFingerprint: fingerprint,
      lifecycleSourceSha: PRODUCER_SHA,
    },
    captureProducerSha: CAPTURE_SHA,
    lifecycleMode: 'fixture_hypothetical',
    expectedSeason: 2026,
    prospectiveWeek: 7,
  });
  if (!probe.adapted) throw new Error('probe_adapted_missing');
  return {
    approvedReceiptDigest: probe.adapted.pinnedReceiptDigest,
    season: 2026,
    selectedPolicy: ML_CAL_1_BINDING_POLICY,
    completedThroughWeek: 6,
    canonicalWeight: 1,
    ratingFingerprint: fingerprint,
    lifecycleSourceSha: PRODUCER_SHA,
  };
}

function planWith(
  built: ReturnType<typeof bundleFromMember>,
  trustDigest: string,
  inputExtra?: Partial<MlCal1FixtureInput>,
  trustExtra?: Partial<ReturnType<typeof externalTrust>>
) {
  const trust = {
    ...externalTrust(built.binding, built.ratings, built.fingerprint),
    approvedReceiptDigest: trustDigest,
    ...trustExtra,
  };
  return planFixtureCaptureWithBindingIntegration(
    captureInput(built.ratings, built.rows, built.fingerprint, inputExtra),
    { binding: built.binding, trustedAcceptance: trust },
    { now: () => new Date(T_PUB), publicationTime: T_PUB }
  );
}

describe('G3 fixture capture/binding wiring', () => {
  const built = bundleFromMember(week6Member());
  const trust = externalTrust(built.binding, built.ratings, built.fingerprint);

  it('synthetic parity qualifies through planner with liveAccepted false', () => {
    const planned = planFixtureCaptureWithBindingIntegration(
      captureInput(built.ratings, built.rows, built.fingerprint),
      { binding: built.binding, trustedAcceptance: trust },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(planned.bindingIntegration?.ok).toBe(true);
    expect(planned.lifecycle).not.toBeNull();
    expect(planned.lifecycle?.qualified).toBe(true);
    expect(planned.lifecycle?.liveAccepted).toBe(false);
    expect(planned.bindingIntegration?.liveAccepted).toBe(false);
    expect(planned.bundle.envelope.lifecycleQualification.liveAccepted).toBe(false);
    expect(planned.bundle.envelope.providerCalls).toBe(0);
    expect(planned.bundle.envelope.businessDataWrites).toBe(0);
    expect(planned.bundle.inputs.ratingFingerprint).toBe(built.fingerprint);
    expect(planned.bindingIntegration?.fingerprints.captureRecomputed).toBe(
      planned.bundle.inputs.ratingFingerprint
    );
    expect(planned.bindingIntegration?.producers.lifecycleProducerSha).toBe(PRODUCER_SHA);
    expect(planned.bindingIntegration?.producers.bindingObserverSha).toBe(OBSERVER_SHA);
    expect(planned.bindingIntegration?.producers.captureProducerSha).toBe(CAPTURE_SHA);
    expect(planned.bundle.forecasts.rows[0].forecastAvailable).toBe(true);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g3-seal-'));
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'g3-fixture-capture',
      bundle: planned.bundle,
      dependencyHashes: { gitByteHashes: {}, dirty: [] },
      now: () => new Date(T_PUB),
    });
    const validated = readCaptureTerminalResult({
      rootDir: root,
      captureId: 'g3-fixture-capture',
      expectedManifestSha256: written.manifestSha256,
      expectedTerminalSha256: written.terminalSha256,
      expectedInvalidationSha256: written.invalidationSha256,
      expectedPackageChecksumsSha256: written.packageChecksumsSha256,
    });
    expect(validated.structuralConsistencyVerified).toBe(true);
    expect(validated.independentlyVerifiedIntegrity).toBe(true);
    expect(validated.sealedCounts.availableForecasts).toBe(1);
    const sealed = JSON.parse(
      fs.readFileSync(path.join(written.captureDir, 'envelope.json'), 'utf8')
    );
    expect(sealed.lifecycleQualification.liveAccepted).toBe(false);
    expect(sealed.providerCalls).toBe(0);
    expect(sealed.businessDataWrites).toBe(0);
  });

  it('does not qualify when the approved receipt digest differs', () => {
    const planned = planWith(built, 'f'.repeat(64));
    expect(planned.lifecycle).toBeNull();
    expect(planned.bindingIntegration?.ok).toBe(false);
    expect(planned.bindingIntegration?.lifecycle).toBeNull();
    expect(planned.bundle.envelope.lifecycleQualification.qualified).toBe(false);
    expect(planned.bundle.envelope.lifecycleQualification.liveAccepted).toBe(false);
  });

  it('missing registry anchor cannot be bypassed by a qualifying receipt', () => {
    const dropped = bundleFromMember(week6Member(), { dropRegistry: true });
    const planned = planFixtureCaptureWithBindingIntegration(
      captureInput(dropped.ratings, dropped.rows, dropped.fingerprint),
      {
        binding: dropped.binding,
        trustedAcceptance: externalTrust(built.binding, built.ratings, built.fingerprint),
      },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(planned.lifecycle).toBeNull();
    expect(planned.bindingIntegration?.lifecycle).toBeNull();
    expect(planned.bundle.envelope.lifecycleQualification.reasons).toContain(
      'binding_integration_lifecycle_null'
    );
  });

  it('rejects unparseable capture time and short lineage', () => {
    const short = bundleFromMember(week6Member(), {
      checkedThrough: '2026-10-06T12:00:20.000Z',
    });
    const shortPlan = planFixtureCaptureWithBindingIntegration(
      captureInput(short.ratings, short.rows, short.fingerprint),
      {
        binding: short.binding,
        trustedAcceptance: externalTrust(short.binding, short.ratings, short.fingerprint),
      },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(shortPlan.lifecycle).toBeNull();
    expect(shortPlan.bindingIntegration?.reasons).toContain('lineage_does_not_cover_capture');

    expect(() =>
      planFixtureCaptureWithBindingIntegration(
        captureInput(built.ratings, built.rows, built.fingerprint, {
          snapshotReferenceTime: 'not-a-timestamp',
        }),
        { binding: built.binding, trustedAcceptance: trust },
        { now: () => new Date(T_PUB) }
      )
    ).toThrow(/invalid_timestamp/);
    const afterCeiling = planFixtureCaptureWithBindingIntegration(
      captureInput(built.ratings, built.rows, built.fingerprint, {
        captureStartTime: '2026-10-08T01:00:00.000Z',
        snapshotReferenceTime: '2026-10-08T02:00:00.000Z',
      }),
      { binding: built.binding, trustedAcceptance: trust },
      { now: () => new Date('2026-10-08T02:05:00.000Z'), publicationTime: '2026-10-08T02:05:00.000Z' }
    );
    expect(afterCeiling.lifecycle).toBeNull();
    expect(afterCeiling.bindingIntegration?.reasons).toContain(
      'capture_snapshot_reference_time_after_ceiling'
    );
  });

  it('rejects wrong trusted season and prospective week via capture week', () => {
    const wrongTrust = planFixtureCaptureWithBindingIntegration(
      captureInput(built.ratings, built.rows, built.fingerprint),
      {
        binding: built.binding,
        trustedAcceptance: { ...trust, season: 2025 },
      },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(wrongTrust.lifecycle).toBeNull();
    expect(wrongTrust.bindingIntegration?.reasons).toContain(
      'trusted_acceptance_season_mismatch'
    );

    const wrongWeek = planFixtureCaptureWithBindingIntegration(
      captureInput(built.ratings, built.rows, built.fingerprint, { week: 8 }),
      { binding: built.binding, trustedAcceptance: trust },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(wrongWeek.lifecycle).toBeNull();
    expect(wrongWeek.bindingIntegration?.reasons).toContain('prospective_week_mismatch');
  });

  it('changed forecast rating and cohort mismatch fail closed', () => {
    const ratings = built.ratings.map((row, index) =>
      index === 0 ? { ...row, powerRating: { toString: () => '999' } } : row
    );
    const changed = planFixtureCaptureWithBindingIntegration(
      captureInput(ratings, built.rows, built.fingerprint),
      { binding: built.binding, trustedAcceptance: trust },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(changed.lifecycle).toBeNull();
    expect(
      changed.bindingIntegration?.reasons.some((r) => r.includes('fingerprint'))
    ).toBe(true);

    const cohort = planFixtureCaptureWithBindingIntegration(
      captureInput(built.ratings.slice(0, 10), built.rows, built.fingerprint),
      { binding: built.binding, trustedAcceptance: trust },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(cohort.lifecycle).toBeNull();
    expect(cohort.bindingIntegration?.reasons).toContain('fingerprint_cohort_mismatch');
  });

  it('stale exported hash is rejected by the same helper the planner calls', () => {
    const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const row of built.ratings) by[row.teamId] = exportRatingInput(row);
    const teamId = built.rows[0].teamId;
    by[teamId] = { ...by[teamId], ratingRaw: '999' };
    const result = verifyBindingThenQualifyCaptureLifecycle({
      binding: built.binding,
      captureInputs: { ratingFingerprint: built.fingerprint, ratingsByTeamId: by },
      captureSnapshotReferenceTime: T_SNAP,
      trustedAcceptance: trust,
      captureProducerSha: CAPTURE_SHA,
      lifecycleMode: 'fixture_hypothetical',
      expectedSeason: 2026,
      prospectiveWeek: 7,
    });
    expect(result.ok).toBe(false);
    expect(result.lifecycle).toBeNull();
    expect(result.reasons).toContain('exported_row_content_hash_mismatch');
  });

  it('Decimal zero remains usable in the wired planner map', () => {
    let zeroTeam = '';
    const member = week6Member((row) => {
      if (!zeroTeam) {
        zeroTeam = String(row.teamId);
        row.finalPowerRating = 0;
      }
    });
    const zeroBuilt = bundleFromMember(member);
    const zeroTrust = externalTrust(zeroBuilt.binding, zeroBuilt.ratings, zeroBuilt.fingerprint);
    const planned = planFixtureCaptureWithBindingIntegration(
      captureInput(zeroBuilt.ratings, zeroBuilt.rows, zeroBuilt.fingerprint),
      { binding: zeroBuilt.binding, trustedAcceptance: zeroTrust },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(planned.lifecycle?.qualified).toBe(true);
    expect(planned.lifecycle?.liveAccepted).toBe(false);
    expect(planned.bundle.inputs.ratingsByTeamId[zeroTeam].valueUsed).toBe(0);
    expect(planned.bundle.inputs.ratingsByTeamId[zeroTeam].inputUsable).toBe(true);
  });

  it('authentic Week 5 stays full-weight-ineligible', () => {
    const report = parseLifecycleReport(WEEK5_MEMBER);
    const rows = buildObservedRowsFromReport(report, { createdAt: T_ROW, updatedAt: T_ROW });
    const sidecarBytes = serializeSidecar({
      schemaVersion: ML_CAL_1_LIFECYCLE_BINDING_SIDECAR_SCHEMA,
      kind: 'lifecycle-binding-sidecar',
      mode: 'fixture_hypothetical',
      acceptedArchive: {
        github: {
          workflowRunId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.workflowRunId,
          artifactId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactId,
          artifactName: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactName,
          workflowRunCompletedAt: '2026-10-05T15:50:00.000Z',
          artifactCreatedAt: '2026-10-05T15:56:00.000Z',
          zipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
          reportMemberPath: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberPath,
          reportMemberSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
          reportByteCount: WEEK5_MEMBER.length,
        },
        lifecycleProducerSha: PRODUCER_SHA,
        declaredSeason: 2026,
        declaredCompletedThroughWeek: 5,
        declaredSelectedPolicy: ML_CAL_1_BINDING_POLICY,
        declaredCanonicalWeight: 0.75,
      },
      bindingObservation: {
        observationStartTime: '2026-10-06T12:00:00.000Z',
        observationEndTime: '2026-10-06T12:00:20.000Z',
        bindingSnapshotReferenceTime: '2026-10-06T12:00:10.000Z',
        dbTransactionTime: null,
        dbTransactionTimeUnavailableReason: 'fixture',
        bindingObserverSha: OBSERVER_SHA,
        readMode: 'fixture_injected',
        season: 2026,
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
    });
    const ratings = rows.map((row) => reconstructRawRatingRow(row));
    const by: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const row of ratings) by[row.teamId] = exportRatingInput(row);
    const fingerprint = buildRatingFingerprint(by);
    const planned = planFixtureCaptureWithBindingIntegration(
      captureInput(ratings, rows, fingerprint),
      {
        binding: {
          zipBytes: WEEK5_ZIP,
          reportMemberBytes: WEEK5_MEMBER,
          sidecarBytes,
          prospectiveTargetWeek: 7,
          expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
          expectedReportMemberSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
          expectedLifecycleProducerSha: PRODUCER_SHA,
          expectedReportMemberPath: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberPath,
          nowCeiling: NOW_CEILING,
        },
        trustedAcceptance: null,
      },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(planned.lifecycle).toBeNull();
    expect(planned.bindingIntegration?.binding.fullWeightEligible).toBe(false);
    expect(planned.bindingIntegration?.binding.recomputed.canonicalWeight).toBe(0.75);
    expect(planned.bindingIntegration?.binding.archiveIntegrityVerified).toBe(true);
  });

  it('stale markets and late publication stay blocked', () => {
    const stale = planFixtureCaptureWithBindingIntegration(
      captureInput(built.ratings, built.rows, built.fingerprint, {
        marketLines: captureInput(built.ratings, built.rows, built.fingerprint).marketLines.map(
          (line) => ({ ...line, timestamp: '2026-10-07T16:00:00.000Z' })
        ),
      }),
      { binding: built.binding, trustedAcceptance: trust },
      { now: () => new Date(T_PUB), publicationTime: T_PUB }
    );
    expect(stale.lifecycle?.qualified).toBe(true);
    expect(stale.bundle.forecasts.rows[0].forecastAvailable).toBe(true);
    expect(stale.bundle.markets.moneyline[0].available).toBe(false);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g3-late-'));
    const written = writeCaptureArtifactsAtomic({
      rootDir: root,
      captureId: 'g3-fixture-capture',
      bundle: planFixtureCaptureWithBindingIntegration(
        captureInput(built.ratings, built.rows, built.fingerprint),
        { binding: built.binding, trustedAcceptance: trust },
        { now: () => new Date(T_PUB), publicationTime: T_PUB }
      ).bundle,
      dependencyHashes: { gitByteHashes: {}, dirty: [] },
      now: () => new Date('2026-10-07T22:40:00.000Z'),
    });
    const validated = readCaptureTerminalResult({
      rootDir: root,
      captureId: 'g3-fixture-capture',
      expectedManifestSha256: written.manifestSha256,
      expectedTerminalSha256: written.terminalSha256,
      expectedInvalidationSha256: written.invalidationSha256,
      expectedPackageChecksumsSha256: written.packageChecksumsSha256,
    });
    expect(validated.effectiveCounts.availableForecasts).toBe(0);
    expect(validated.sealedCounts.availableForecasts).toBe(0);
    const lateEnv = JSON.parse(
      fs.readFileSync(path.join(written.captureDir, 'envelope.json'), 'utf8')
    );
    expect(lateEnv.publicationDowngradedGameIds).toContain('g3-game-1');
    expect(lateEnv.lifecycleQualification.liveAccepted).toBe(false);
  });

  it('live binding invocation is rejected before a database client is used', async () => {
    let dbCalls = 0;
    const code = await runMlCal1Cli(
      ['--season', '2026', '--week', '7', '--enable-live-db-read', '--binding-integration-dir', 'x'],
      {
        loadLiveSnapshot: async () => {
          dbCalls += 1;
          throw new Error('db_should_not_open');
        },
        stderr: () => undefined,
      }
    );
    expect(code).not.toBe(0);
    expect(dbCalls).toBe(0);
  });
});
