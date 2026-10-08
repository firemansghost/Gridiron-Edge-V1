/**
 * Offline fixture matrix for ML-CAL-1 G4 lifecycle binding observer.
 * No DATABASE_URL, credentials, providers, or pooler preflight.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildObservedRowsFromReport,
  parseLifecycleReport,
  serializeSidecar,
  sha256Utf8Bytes,
  verifyLifecycleBindingSidecar,
  type MlCal1LifecycleReportParsed,
} from '../lib/ml-cal-1-lifecycle-binding';
import {
  buildRatingFingerprint,
  computeProspectiveOk,
  createMockRepeatableReadAdapter,
  evaluateG4ArchivePrerequisites,
  evaluateG4CohortAndNumeric,
  evaluateG4ObservationTiming,
  evaluatePreAdapterChronology,
  exportRatingInput,
  ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256,
  ML_CAL_1_G4_DESIGN_ON_DISK_SHA256,
  ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS,
  ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS,
  observedRowsFromRaw,
  rawRowsFromObserved,
  reconstructRawRatingRow,
  runG4ObserverAttempt,
  sealG4ObservationPackage,
  validateObservedRowTimestamps,
  verifyExactTeamSeasonRatingAllowlist,
  type MlCal1G4ArchivePins,
  type MlCal1G4RawRatingRow,
} from '../lib/ml-cal-1-lifecycle-binding-observer';

const FIXTURE_ROOT = path.join(
  __dirname,
  'fixtures',
  'packages',
  'ml-cal-1-g4-observer'
);
const WEEK5_DIR = path.join(FIXTURE_ROOT, 'week5-commit');
const W6_DIR = path.join(FIXTURE_ROOT, 'synthetic-w6');

const WEEK5_ZIP = fs.readFileSync(path.join(WEEK5_DIR, 'archive.zip'));
const WEEK5_MEMBER = fs.readFileSync(
  path.join(WEEK5_DIR, 'core-v1-lifecycle-2026-through-week-5-COMMIT.json')
);
const W6_ZIP = fs.readFileSync(path.join(W6_DIR, 'archive.zip'));
const W6_MEMBER = fs.readFileSync(
  path.join(W6_DIR, 'core-v1-lifecycle-2026-through-week-6-COMMIT.json')
);
const W6_PROVENANCE = fs.readFileSync(path.join(W6_DIR, 'PROVENANCE.json'));

const OBSERVER_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PRODUCER_W6 = 'cccccccccccccccccccccccccccccccccccccccc';
const T_RUN = '2026-10-05T15:50:00.000Z';
const T_ART = '2026-10-05T15:56:00.000Z';
const T_OBS0 = '2026-10-06T12:00:00.000Z';
const T_DB = '2026-10-06T12:00:05.000Z';
const T_SNAP = '2026-10-06T12:00:10.000Z';
const T_OBS1 = '2026-10-06T12:00:20.000Z';
const T_ROW = '2026-10-05T16:00:00.000Z';
const NOW_CEILING = '2026-10-07T00:00:00.000Z';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ml-cal-1-g4-'));
}

function week5Pins(): MlCal1G4ArchivePins {
  return {
    expectedZipSha256: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.zipSha256,
    expectedReportMemberSha256:
      ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberSha256,
    expectedLifecycleProducerSha:
      ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.lifecycleProducerSha,
    workflowRunId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.workflowRunId,
    artifactId: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactId,
    artifactName: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.artifactName,
    reportMemberPath: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.reportMemberPath,
    workflowRunCompletedAt: T_RUN,
    artifactCreatedAt: T_ART,
  };
}

function w6Pins(overrides?: Partial<MlCal1G4ArchivePins>): MlCal1G4ArchivePins {
  return {
    expectedZipSha256: sha256Utf8Bytes(W6_ZIP),
    expectedReportMemberSha256: sha256Utf8Bytes(W6_MEMBER),
    expectedLifecycleProducerSha: PRODUCER_W6,
    workflowRunId: 'fixture-synthetic-w6',
    artifactId: 'fixture-artifact-w6',
    artifactName: 'core-v1-lifecycle-2026-through-w6-COMMIT-fixture',
    reportMemberPath: 'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
    workflowRunCompletedAt: T_RUN,
    artifactCreatedAt: T_ART,
    ...overrides,
  };
}

function w6Report(): MlCal1LifecycleReportParsed {
  return parseLifecycleReport(W6_MEMBER);
}

function w6RawRows(
  report?: MlCal1LifecycleReportParsed,
  mut?: (rows: MlCal1G4RawRatingRow[]) => MlCal1G4RawRatingRow[]
): MlCal1G4RawRatingRow[] {
  const r = report ?? w6Report();
  const observed = buildObservedRowsFromReport(r, {
    createdAt: T_ROW,
    updatedAt: T_ROW,
  });
  const raw = rawRowsFromObserved(observed);
  return mut ? mut(raw) : raw;
}

function clockSequence(isos: string[]): () => Date {
  let i = 0;
  return () => {
    const v = isos[Math.min(i, isos.length - 1)];
    i += 1;
    return new Date(v);
  };
}

describe('ML-CAL-1 G4 observer — design correspondence', () => {
  it('pins on-disk design and acceptance upload digests without relabeling', () => {
    expect(ML_CAL_1_G4_DESIGN_ON_DISK_SHA256).toBe(
      '53d8906c2caa3b68658c6596d74f28e1ec2367fa026991013dadb210aca922bc'
    );
    expect(ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256).toBe(
      'e61ffd3cb7563fea1d616969df64d760bfe7e931cf654074ab2e9f5146dc3215'
    );
    expect(ML_CAL_1_G4_DESIGN_ON_DISK_SHA256).not.toBe(
      ML_CAL_1_G4_ACCEPTANCE_UPLOAD_SHA256
    );
  });
});

describe('ML-CAL-1 G4 observer — archive prerequisites', () => {
  it('G4-N1: Week 5 authentic pins are full-weight-ineligible', () => {
    const r = evaluateG4ArchivePrerequisites({
      zipBytes: WEEK5_ZIP,
      pins: week5Pins(),
    });
    expect(r.fullWeightByPolicy).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(
      expect.arrayContaining(['fullWeightByPolicy_false'])
    );
    expect(r.report?.completedThroughWeek).toBe(5);
    expect(r.report?.canonicalWeight).toBe(0.75);
  });

  it('G4-N2: missing / wrong ZIP pin fails closed', () => {
    const r = evaluateG4ArchivePrerequisites({
      zipBytes: W6_ZIP,
      pins: w6Pins({ expectedZipSha256: '0'.repeat(64) }),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(
      expect.arrayContaining(['archive_pin_mismatch:zip'])
    );
  });

  it('G4-P10: Week 5 planned rows lack modelVersion; report.modelVersion is v1', () => {
    const report = parseLifecycleReport(WEEK5_MEMBER);
    expect(report.modelVersion).toBe('v1');
    expect(report.rows[0]).not.toHaveProperty('modelVersion');
    expect(Object.keys(report.rows[0]).sort()).toEqual(
      [
        'candidateA',
        'canonicalRating',
        'canonicalWeight',
        'finalPowerRating',
        'games',
        'teamId',
      ].sort()
    );
  });

  it('synthetic Week 6 passes fullWeightByPolicy', () => {
    const r = evaluateG4ArchivePrerequisites({
      zipBytes: W6_ZIP,
      pins: w6Pins(),
    });
    expect(r.ok).toBe(true);
    expect(r.fullWeightByPolicy).toBe(true);
    expect(r.report?.completedThroughWeek).toBe(6);
  });
});

describe('ML-CAL-1 G4 observer — prospective polarity (F1)', () => {
  it('G4-P5: completed=6 target=7 → prospectiveOk true', () => {
    expect(
      computeProspectiveOk({ completedThroughWeek: 6, prospectiveTargetWeek: 7 })
    ).toBe(true);
  });
  it('G4-N23: completed=7 target=7 → false', () => {
    expect(
      computeProspectiveOk({ completedThroughWeek: 7, prospectiveTargetWeek: 7 })
    ).toBe(false);
  });
  it('G4-N24: completed=8 target=7 → false', () => {
    expect(
      computeProspectiveOk({ completedThroughWeek: 8, prospectiveTargetWeek: 7 })
    ).toBe(false);
  });
  it('G4-P6 / G4-N22: missing target → null (no eligibility invent)', () => {
    expect(
      computeProspectiveOk({
        completedThroughWeek: 6,
        prospectiveTargetWeek: null,
      })
    ).toBeNull();
  });
});

describe('ML-CAL-1 G4 observer — allowlist / Decimal / fingerprint', () => {
  it('G4-N3: allowlist length/order violations fail', () => {
    expect(
      verifyExactTeamSeasonRatingAllowlist([
        ...ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS,
        'extra',
      ]).ok
    ).toBe(false);
    expect(
      verifyExactTeamSeasonRatingAllowlist(
        ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS.slice().reverse()
      ).ok
    ).toBe(false);
  });

  it('G4-N6 / G4-P2 / G4-P4: Decimal zero raw + fingerprint parity', () => {
    const rows = w6RawRows(undefined, (rs) => {
      const copy = rs.map((r) => ({ ...r }));
      copy[0] = {
        ...copy[0],
        powerRating: { toString: () => '0' },
        rating: { toString: () => '0' },
      };
      // Keep report agreement only for fingerprint helper path on reconstructed zero row
      return copy;
    });
    const obs = observedRowsFromRaw([rows[0]]);
    expect(obs[0].powerRatingRaw).toBe('0');
    const exported = exportRatingInput(reconstructRawRatingRow(obs[0]));
    expect(exported.powerRatingRaw).toBe('0');
    expect(exported.chosenField).toBe('powerRating');
    expect(exported.inputUsable).toBe(true);

    const allObs = observedRowsFromRaw(w6RawRows());
    const map: Record<string, ReturnType<typeof exportRatingInput>> = {};
    for (const row of allObs) {
      map[row.teamId] = exportRatingInput(reconstructRawRatingRow(row));
    }
    const fp = buildRatingFingerprint(map);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('G4-N7: blank power/rating not usable', () => {
    const exported = exportRatingInput(
      reconstructRawRatingRow({
        season: 2026,
        teamId: 'x',
        modelVersion: 'v1',
        powerRatingRaw: ' ',
        ratingRaw: ' ',
        games: 1,
        dataSource: null,
        createdAt: T_ROW,
        updatedAt: T_ROW,
      })
    );
    expect(exported.inputUsable).toBe(false);
  });
});

describe('ML-CAL-1 G4 observer — timing', () => {
  const baseTiming = {
    observationStartTime: T_OBS0,
    observationEndTime: T_OBS1,
    bindingSnapshotReferenceTime: T_SNAP,
    dbTransactionTime: T_DB,
    dbTransactionTimeRequired: true,
    workflowRunCompletedAt: T_RUN,
    artifactCreatedAt: T_ART,
    nowCeiling: NOW_CEILING,
    rowCreatedAtMin: T_ROW,
    rowCreatedAtMax: T_ROW,
    rowUpdatedAtMin: T_ROW,
    rowUpdatedAtMax: T_ROW,
  };

  it('accepts valid host/DB/archive ordering', () => {
    expect(evaluateG4ObservationTiming(baseTiming).ok).toBe(true);
  });

  it('G4-N26: dbTransactionTime before observationStart', () => {
    const r = evaluateG4ObservationTiming({
      ...baseTiming,
      dbTransactionTime: '2026-10-06T11:59:59.000Z',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('observation_time_order_invalid');
  });

  it('G4-N27: dbTransactionTime after observationEnd', () => {
    const r = evaluateG4ObservationTiming({
      ...baseTiming,
      dbTransactionTime: '2026-10-06T12:00:21.000Z',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('observation_time_order_invalid');
  });

  it('G4-N20: missing db time on live path', () => {
    const r = evaluateG4ObservationTiming({
      ...baseTiming,
      dbTransactionTime: null,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('db_transaction_time_missing');
  });

  it('G4-N29: missing workflowRunCompletedAt', () => {
    const r = evaluateG4ObservationTiming({
      ...baseTiming,
      workflowRunCompletedAt: '',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('archive_chronology_missing');
  });

  it('G4-N30: missing artifactCreatedAt', () => {
    const r = evaluateG4ObservationTiming({
      ...baseTiming,
      artifactCreatedAt: 'not-a-date',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('archive_chronology_missing');
  });

  it('G4-N31: archive after observation start', () => {
    const r = evaluateG4ObservationTiming({
      ...baseTiming,
      workflowRunCompletedAt: '2026-10-06T13:00:00.000Z',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('observation_predates_archive');
  });

  it('G4-N32: archive after nowCeiling', () => {
    const r = evaluateG4ObservationTiming({
      ...baseTiming,
      workflowRunCompletedAt: '2026-10-08T00:00:00.000Z',
      artifactCreatedAt: '2026-10-08T00:01:00.000Z',
      observationStartTime: '2026-10-08T01:00:00.000Z',
      bindingSnapshotReferenceTime: '2026-10-08T01:00:10.000Z',
      observationEndTime: '2026-10-08T01:00:20.000Z',
      dbTransactionTime: '2026-10-08T01:00:05.000Z',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('archive_time_after_ceiling');
  });

  it('G4-N9: row updated after binding snapshot', () => {
    const r = evaluateG4ObservationTiming({
      ...baseTiming,
      rowUpdatedAtMax: '2026-10-06T12:00:11.000Z',
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('row_updated_after_binding_snapshot');
  });
});

describe('ML-CAL-1 G4 observer — end-to-end fixture attempts', () => {
  it('G4-P1/P7/P9: synthetic W6 fixture emission seals unapproved package', async () => {
    const root = tmpRoot();
    const rows = w6RawRows();
    const adapter = createMockRepeatableReadAdapter({
      rows,
      transactionTimestamp: T_DB,
    });
    const result = await runG4ObserverAttempt({
      observationId: 'g4p1-synthetic-w6',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: adapter,
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      prospectiveTargetWeek: null,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(true);
    expect(result.fullWeightByPolicy).toBe(true);
    expect(result.prospectiveOk).toBeNull();
    expect(result.fullWeightEligibleClaimed).toBe(false);
    expect(result.liveAccepted).toBe(false);
    expect(result.packageDir).toBeTruthy();
    expect(result.packageManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(result.packageDir!, 'PACKAGE_MANIFEST.json'),
        'utf8'
      )
    );
    expect(manifest.liveAccepted).toBe(false);
    expect(manifest.approved).toBe(false);
    expect(manifest.credentialsPresent).toBe(false);
    expect(manifest.designOnDiskSha256).toBe(ML_CAL_1_G4_DESIGN_ON_DISK_SHA256);
    // no overwrite
    await expect(
      runG4ObserverAttempt({
        observationId: 'g4p1-synthetic-w6',
        bindingObserverSha: OBSERVER_SHA,
        lifecycleProducerSha: PRODUCER_W6,
        archivePins: w6Pins(),
        zipBytes: W6_ZIP,
        txAdapter: adapter,
        now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
        nowCeiling: NOW_CEILING,
        fixtureProvenanceBytes: W6_PROVENANCE,
        fixtureMode: true,
        packageRootDir: root,
      })
    ).resolves.toMatchObject({ ok: false });
  });

  it('G4-N1 e2e: Week 5 attempt aborts (diagnostic receipt, not success sidecar)', async () => {
    const root = tmpRoot();
    const report = parseLifecycleReport(WEEK5_MEMBER);
    const rows = rawRowsFromObserved(
      buildObservedRowsFromReport(report, { createdAt: T_ROW, updatedAt: T_ROW })
    );
    const result = await runG4ObserverAttempt({
      observationId: 'g4n1-week5',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: ML_CAL_1_WEEK5_COMMIT_ARCHIVE_PINS.lifecycleProducerSha,
      archivePins: week5Pins(),
      zipBytes: WEEK5_ZIP,
      txAdapter: createMockRepeatableReadAdapter({ rows }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.fullWeightByPolicy).toBe(false);
    expect(result.packageDir).toBeNull();
    expect(result.diagnosticFailureReceiptPath).toBeTruthy();
    const receipt = JSON.parse(
      fs.readFileSync(result.diagnosticFailureReceiptPath!, 'utf8')
    );
    expect(receipt.successfulObserverSidecar).toBe(false);
  });

  it('G4-N17: wrong isolation aborts', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n17-isolation',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        isolation: 'read committed',
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/transaction_isolation_invalid/);
  });

  it('G4-N17b: read_only off aborts', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n17-readonly',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        readOnly: 'off',
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/transaction_read_only_invalid/);
  });

  it('G4-N18: lost TX mid-read aborts without package', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n18-lost-tx',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        loseTransactionAfterMetadata: true,
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.packageDir).toBeNull();
    expect(result.reasons.join('\n')).toMatch(/transaction_lost/);
  });

  it('G4-N3 e2e: forceSelectScalars expands allowlist → fail', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n3-allowlist',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        forceSelectScalars: [...ML_CAL_1_G4_TEAM_SEASON_RATING_SCALARS, 'id'],
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/allowlist/);
  });

  it('G4-N4: observed modelVersion drift fails cohort/scope', async () => {
    const root = tmpRoot();
    const rows = w6RawRows(undefined, (rs) => {
      const copy = rs.map((r) => ({ ...r }));
      copy[0] = { ...copy[0], modelVersion: 'v0' };
      return copy;
    });
    const result = await runG4ObserverAttempt({
      observationId: 'g4n4-scope',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows,
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/observation_scope_mismatch/);
  });

  it('G4-N5: cohort shrink fails', async () => {
    const root = tmpRoot();
    const rows = w6RawRows().slice(0, 100);
    const result = await runG4ObserverAttempt({
      observationId: 'g4n5-cohort',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows,
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/binding_cohort_mismatch/);
  });

  it('G4-N11: rating numeric mismatch fails', async () => {
    const root = tmpRoot();
    const rows = w6RawRows(undefined, (rs) => {
      const copy = rs.map((r) => ({ ...r }));
      copy[0] = {
        ...copy[0],
        powerRating: { toString: () => '999' },
        rating: { toString: () => '999' },
      };
      return copy;
    });
    const result = await runG4ObserverAttempt({
      observationId: 'g4n11-numeric',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows,
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/powerRating_mismatch/);
  });

  it('G4-N11b: games inequality fails exact integer check', async () => {
    const root = tmpRoot();
    const rows = w6RawRows(undefined, (rs) => {
      const copy = rs.map((r) => ({ ...r }));
      copy[0] = { ...copy[0], games: copy[0].games + 1 };
      return copy;
    });
    const result = await runG4ObserverAttempt({
      observationId: 'g4n11b-games',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows,
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(/games_mismatch/);
  });

  it('G4-N26 e2e: DB time before start → diagnostic only', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n26-db-early',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: '2026-10-06T11:00:00.000Z',
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.packageDir).toBeNull();
    expect(result.reasons).toContain('observation_time_order_invalid');
    expect(result.diagnosticFailureReceiptPath).toBeTruthy();
  });

  it('G4-P3: role fields tracked separately (distinct SHA example)', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4p3-roles',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(true);
    const sidecar = JSON.parse(
      fs.readFileSync(
        path.join(result.packageDir!, 'binding-sidecar.json'),
        'utf8'
      )
    );
    expect(sidecar.acceptedArchive.lifecycleProducerSha).toBe(PRODUCER_W6);
    expect(sidecar.bindingObservation.bindingObserverSha).toBe(OBSERVER_SHA);
    expect(sidecar.acceptedArchive.lifecycleProducerSha).not.toBe(
      sidecar.bindingObservation.bindingObserverSha
    );
    expect(sidecar).not.toHaveProperty('captureProducerSha');
  });

  it('G4-P5 e2e: fixture prospective target 7 with week 6 → prospectiveOk true still not eligible claim', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4p5-prospective',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      prospectiveTargetWeek: 7,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(true);
    expect(result.prospectiveOk).toBe(true);
    expect(result.fullWeightEligibleClaimed).toBe(false);
    expect(result.liveAccepted).toBe(false);
  });

  it('G4-N12: fixture mode retains fixture_injected / hypothetical', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n12-fixture-mode',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    const sidecar = JSON.parse(
      fs.readFileSync(
        path.join(result.packageDir!, 'binding-sidecar.json'),
        'utf8'
      )
    );
    expect(sidecar.mode).toBe('fixture_hypothetical');
    expect(sidecar.bindingObservation.readMode).toBe('fixture_injected');
    expect(result.liveAccepted).toBe(false);
  });

  it('G4-N8: observation predates archive chronology on pins', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n8-predate',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins({
        workflowRunCompletedAt: '2026-10-06T13:00:00.000Z',
        artifactCreatedAt: '2026-10-06T13:01:00.000Z',
      }),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('observation_predates_archive');
  });

  it('G4-N28: unparseable dbTransactionTime fails closed', () => {
    const r = evaluateG4ObservationTiming({
      observationStartTime: T_OBS0,
      observationEndTime: T_OBS1,
      bindingSnapshotReferenceTime: T_SNAP,
      dbTransactionTime: 'not-comparable',
      dbTransactionTimeRequired: true,
      workflowRunCompletedAt: T_RUN,
      artifactCreatedAt: T_ART,
      nowCeiling: NOW_CEILING,
      rowCreatedAtMin: T_ROW,
      rowCreatedAtMax: T_ROW,
      rowUpdatedAtMin: T_ROW,
      rowUpdatedAtMax: T_ROW,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('db_transaction_time_invalid');
  });

  it('G4-N16 / businessDataWrites: successful package records zero writes/providers', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n16-zero-writes',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    const meta = JSON.parse(
      fs.readFileSync(
        path.join(result.packageDir!, 'observer-run-metadata.json'),
        'utf8'
      )
    );
    expect(meta.businessDataWrites).toBe(0);
    expect(meta.providerCalls).toBe(0);
  });

  it('G4-N25: emission succeeds without G5 lineage/registry anchors', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n25-no-g5-anchors',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(true);
    const names = fs.readdirSync(result.packageDir!);
    expect(names).not.toContain('lineage-attestation.json');
    expect(names).not.toContain('registry-document.json');
  });

  it('G4-N10: declaredEcho fingerprint must equal recomputed (package echo)', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4n10-echo',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    const sidecar = JSON.parse(
      fs.readFileSync(
        path.join(result.packageDir!, 'binding-sidecar.json'),
        'utf8'
      )
    );
    expect(sidecar.declaredEcho.ratingFingerprint).toBe(result.ratingFingerprint);
    expect(sidecar.declaredEcho.fullWeightEligible).toBeUndefined();
  });
});

describe('ML-CAL-1 G4 observer — F1–F5 repair regressions', () => {
  it('F1: null/blank/whitespace ratingRaw rejected even when powerRating is Decimal zero', () => {
    const report = w6Report();
    const base = buildObservedRowsFromReport(report, {
      createdAt: T_ROW,
      updatedAt: T_ROW,
    });
    for (const bad of [null, '', '   '] as const) {
      const rows = base.map((r, i) =>
        i === 0
          ? {
              ...r,
              powerRatingRaw: '0',
              ratingRaw: bad as string | null,
              // Force planned power 0 on first team for this case by mutating report copy
            }
          : r
      );
      const reportZero = {
        ...report,
        rows: report.rows.map((r, i) =>
          i === 0 ? { ...r, finalPowerRating: 0 } : r
        ),
      };
      const result = evaluateG4CohortAndNumeric({
        report: reportZero,
        rows,
      });
      expect(result.ok).toBe(false);
      expect(result.reasons.join('\n')).toMatch(/rating_mismatch/);
    }
  });

  it('F1: planned finalPowerRating null rejected', () => {
    const report = w6Report();
    const rows = buildObservedRowsFromReport(report, {
      createdAt: T_ROW,
      updatedAt: T_ROW,
    });
    const badReport = {
      ...report,
      rows: report.rows.map((r, i) =>
        i === 0 ? { ...r, finalPowerRating: null as unknown as number } : r
      ),
    };
    const result = evaluateG4CohortAndNumeric({
      report: badReport,
      rows: rows.map((r, i) =>
        i === 0 ? { ...r, powerRatingRaw: '0', ratingRaw: '0' } : r
      ),
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join('\n')).toMatch(
      /planned_finalPowerRating_invalid/
    );
  });

  it('F2: createdAt > updatedAt fails per-row validation', () => {
    const rows = buildObservedRowsFromReport(w6Report(), {
      createdAt: T_ROW,
      updatedAt: T_ROW,
    }).map((r, i) =>
      i === 0
        ? {
            ...r,
            createdAt: '2026-10-05T18:00:00.000Z',
            updatedAt: '2026-10-05T16:00:00.000Z',
          }
        : r
    );
    const v = validateObservedRowTimestamps({
      rows,
      bindingSnapshotReferenceTime: T_SNAP,
      nowCeiling: NOW_CEILING,
    });
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/row_created_after_updated/);
  });

  it('F2: offset timezone extrema use epoch ms not string sort', () => {
    const rows = buildObservedRowsFromReport(w6Report(), {
      createdAt: '2026-10-06T11:00:00+00:00',
      updatedAt: '2026-10-06T11:00:00+00:00',
    }).map((r, i) =>
      i === 0
        ? {
            ...r,
            createdAt: '2026-10-06T10:00:00-05:00',
            updatedAt: '2026-10-06T10:00:00-05:00',
          }
        : r
    );
    const v = validateObservedRowTimestamps({
      rows,
      bindingSnapshotReferenceTime: T_SNAP,
      nowCeiling: NOW_CEILING,
    });
    // 10:00-05:00 == 15:00Z > snap 12:00:10Z → fail
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/row_updated_after_binding_snapshot/);
  });

  it('F2: invalid timestamp yields structured failure not throw', () => {
    const rows = buildObservedRowsFromReport(w6Report(), {
      createdAt: T_ROW,
      updatedAt: T_ROW,
    }).map((r, i) =>
      i === 1
        ? { ...r, createdAt: 'not-a-timestamp', updatedAt: T_ROW }
        : r
    );
    const v = validateObservedRowTimestamps({
      rows,
      bindingSnapshotReferenceTime: T_SNAP,
      nowCeiling: NOW_CEILING,
    });
    expect(v.ok).toBe(false);
    expect(v.reasons.join('\n')).toMatch(/row_timestamp_invalid/);
  });

  it('F3: fixtureMode false/omitted cannot erase provenance', async () => {
    const root = tmpRoot();
    for (const mode of [false, undefined] as const) {
      let enters = 0;
      const result = await runG4ObserverAttempt({
        observationId: `g4-f3-mode-${String(mode)}`,
        bindingObserverSha: OBSERVER_SHA,
        lifecycleProducerSha: PRODUCER_W6,
        archivePins: w6Pins(),
        zipBytes: W6_ZIP,
        txAdapter: createMockRepeatableReadAdapter({
          rows: w6RawRows(),
          transactionTimestamp: T_DB,
        }),
        now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
        nowCeiling: NOW_CEILING,
        fixtureMode: mode as boolean | undefined,
        fixtureProvenanceBytes: W6_PROVENANCE,
        packageRootDir: root,
        onAdapterEnter: () => {
          enters += 1;
        },
      });
      expect(result.ok).toBe(false);
      expect(result.reasons).toContain('nonfixture_execution_not_authorized');
      expect(enters).toBe(0);
    }
  });

  it('F3: sealed package retains PROVENANCE.json bytes', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4-f3-provenance-retain',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(true);
    const copied = fs.readFileSync(
      path.join(result.packageDir!, 'PROVENANCE.json')
    );
    expect(sha256Utf8Bytes(copied)).toBe(sha256Utf8Bytes(W6_PROVENANCE));
    const sidecar = JSON.parse(
      fs.readFileSync(
        path.join(result.packageDir!, 'binding-sidecar.json'),
        'utf8'
      )
    );
    expect(sidecar.mode).toBe('fixture_hypothetical');
    expect(sidecar.bindingObservation.readMode).toBe('fixture_injected');
  });

  it('F4: archive after observation start fails with zero adapter enters', async () => {
    const root = tmpRoot();
    let enters = 0;
    const result = await runG4ObserverAttempt({
      observationId: 'g4-f4-pre-adapter-chrono',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins({
        workflowRunCompletedAt: '2026-10-06T13:00:00.000Z',
        artifactCreatedAt: '2026-10-06T13:01:00.000Z',
      }),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
      onAdapterEnter: () => {
        enters += 1;
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('observation_predates_archive');
    expect(enters).toBe(0);
  });

  it('F4: empty identity fields fail before adapter', async () => {
    const root = tmpRoot();
    let enters = 0;
    const result = await runG4ObserverAttempt({
      observationId: 'g4-f4-empty-identity',
      bindingObserverSha: '',
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins({
        workflowRunId: '',
        artifactId: '',
        artifactName: '',
      }),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
      onAdapterEnter: () => {
        enters += 1;
      },
    });
    expect(result.ok).toBe(false);
    expect(enters).toBe(0);
    expect(result.reasons.join('\n')).toMatch(
      /observer_identity_missing|archive_identity_missing/
    );
  });

  it('F4 helper: pre-adapter chronology matches accepted bounds', () => {
    expect(
      evaluatePreAdapterChronology({
        observationStartTime: T_OBS0,
        workflowRunCompletedAt: T_RUN,
        artifactCreatedAt: T_ART,
        nowCeiling: NOW_CEILING,
      }).ok
    ).toBe(true);
  });

  it('F5: sealed package omits fullWeightEligible echo and replays binding verifier', async () => {
    const root = tmpRoot();
    const result = await runG4ObserverAttempt({
      observationId: 'g4-f5-replay',
      bindingObserverSha: OBSERVER_SHA,
      lifecycleProducerSha: PRODUCER_W6,
      archivePins: w6Pins(),
      zipBytes: W6_ZIP,
      txAdapter: createMockRepeatableReadAdapter({
        rows: w6RawRows(),
        transactionTimestamp: T_DB,
      }),
      now: clockSequence([T_OBS0, T_SNAP, T_OBS1]),
      nowCeiling: NOW_CEILING,
      prospectiveTargetWeek: 7,
      fixtureProvenanceBytes: W6_PROVENANCE,
      fixtureMode: true,
      packageRootDir: root,
    });
    expect(result.ok).toBe(true);
    expect(result.prospectiveOk).toBe(true);
    expect(result.fullWeightEligibleClaimed).toBe(false);
    expect(result.liveAccepted).toBe(false);

    const sidecarPath = path.join(result.packageDir!, 'binding-sidecar.json');
    const sidecarBytes = fs.readFileSync(sidecarPath);
    const sidecar = JSON.parse(sidecarBytes.toString('utf8'));
    expect(sidecar.declaredEcho.fullWeightEligible).toBeUndefined();

    const copyRoot = tmpRoot();
    const copyDir = path.join(copyRoot, 'copy-away');
    fs.cpSync(result.packageDir!, copyDir, { recursive: true });
    const copiedSidecar = fs.readFileSync(
      path.join(copyDir, 'binding-sidecar.json')
    );
    const copiedZip = fs.readFileSync(path.join(copyDir, 'archive.zip'));
    const copiedProvenance = fs.readFileSync(
      path.join(copyDir, 'PROVENANCE.json')
    );
    expect(sha256Utf8Bytes(copiedProvenance)).toBe(
      sha256Utf8Bytes(W6_PROVENANCE)
    );

    const verify = verifyLifecycleBindingSidecar({
      zipBytes: copiedZip,
      sidecarBytes: copiedSidecar.toString('utf8'),
      expectedZipSha256: sha256Utf8Bytes(copiedZip),
      expectedReportMemberSha256: sha256Utf8Bytes(W6_MEMBER),
      expectedLifecycleProducerSha: PRODUCER_W6,
      expectedReportMemberPath:
        'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
      prospectiveTargetWeek: 7,
      nowCeiling: NOW_CEILING,
    });
    expect(verify.reasons).not.toContain('declared_fullWeightEligible_mismatch');
    expect(verify.structuralConsistencyVerified).toBe(true);
    expect(verify.liveAccepted).toBe(false);
    // Missing registry/lineage continues to block live qualification.
    expect(verify.liveQualifying).toBe(false);
  });

  it('F5 negative: contradictory declaredEcho fingerprint is not asserted by emitter', async () => {
    // Emitter only writes matching echo; contradictory echo would fail binding verifier.
    const report = w6Report();
    const rows = buildObservedRowsFromReport(report, {
      createdAt: T_ROW,
      updatedAt: T_ROW,
    });
    const fp = buildRatingFingerprint(
      Object.fromEntries(
        rows.map((r) => [r.teamId, exportRatingInput(reconstructRawRatingRow(r))])
      )
    );
    const sidecar = {
      schemaVersion: 'ml-cal-1-lifecycle-binding-sidecar-v1' as const,
      kind: 'lifecycle-binding-sidecar' as const,
      mode: 'fixture_hypothetical' as const,
      acceptedArchive: {
        github: {
          workflowRunId: 'fixture-synthetic-w6',
          artifactId: 'fixture-artifact-w6',
          artifactName: 'core-v1-lifecycle-2026-through-w6-COMMIT-fixture',
          workflowRunCompletedAt: T_RUN,
          artifactCreatedAt: T_ART,
          zipSha256: sha256Utf8Bytes(W6_ZIP),
          reportMemberPath: 'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
          reportMemberSha256: sha256Utf8Bytes(W6_MEMBER),
          reportByteCount: W6_MEMBER.length,
        },
        lifecycleProducerSha: PRODUCER_W6,
      },
      bindingObservation: {
        observationStartTime: T_OBS0,
        observationEndTime: T_OBS1,
        bindingSnapshotReferenceTime: T_SNAP,
        dbTransactionTime: T_DB,
        dbTransactionTimeUnavailableReason: null,
        bindingObserverSha: OBSERVER_SHA,
        readMode: 'fixture_injected' as const,
        season: 2026 as const,
        modelVersion: 'v1' as const,
        rows,
        rowCreatedAtMin: T_ROW,
        rowCreatedAtMax: T_ROW,
        rowUpdatedAtMin: T_ROW,
        rowUpdatedAtMax: T_ROW,
      },
      declaredEcho: {
        ratingFingerprint: '0'.repeat(64),
        usableRowCount: 138,
        plannedNumericAgreementOk: true,
        archiveIntegrityVerified: true,
      },
      fingerprintComputedFromLaterReadback: true as const,
      readbackWasNotExportedAtCommit: true as const,
      sidecarSelfAccepted: false as const,
      providerCalls: 0 as const,
      businessDataWrites: 0 as const,
    };
    const verify = verifyLifecycleBindingSidecar({
      zipBytes: W6_ZIP,
      sidecarBytes: serializeSidecar(sidecar),
      expectedZipSha256: sha256Utf8Bytes(W6_ZIP),
      expectedReportMemberSha256: sha256Utf8Bytes(W6_MEMBER),
      expectedLifecycleProducerSha: PRODUCER_W6,
      expectedReportMemberPath:
        'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
      prospectiveTargetWeek: 7,
      nowCeiling: NOW_CEILING,
    });
    expect(verify.structuralConsistencyVerified).toBe(false);
    expect(verify.reasons.join('\n')).toMatch(
      /declared_ratingFingerprint_mismatch|declared_/
    );
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ML-CAL-1 G4 observer — package seal invariants', () => {
  it('refuses overwrite and omits credentials', () => {
    const root = tmpRoot();
    const report = w6Report();
    const rows = buildObservedRowsFromReport(report, {
      createdAt: T_ROW,
      updatedAt: T_ROW,
    });
    const sidecar = {
      schemaVersion: 'ml-cal-1-lifecycle-binding-sidecar-v1' as const,
      kind: 'lifecycle-binding-sidecar' as const,
      mode: 'fixture_hypothetical' as const,
      acceptedArchive: {
        github: {
          workflowRunId: 'x',
          artifactId: 'y',
          artifactName: 'z',
          workflowRunCompletedAt: T_RUN,
          artifactCreatedAt: T_ART,
          zipSha256: sha256Utf8Bytes(W6_ZIP),
          reportMemberPath: 'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
          reportMemberSha256: sha256Utf8Bytes(W6_MEMBER),
          reportByteCount: W6_MEMBER.length,
        },
        lifecycleProducerSha: PRODUCER_W6,
      },
      bindingObservation: {
        observationStartTime: T_OBS0,
        observationEndTime: T_OBS1,
        bindingSnapshotReferenceTime: T_SNAP,
        dbTransactionTime: T_DB,
        dbTransactionTimeUnavailableReason: null,
        bindingObserverSha: OBSERVER_SHA,
        readMode: 'fixture_injected' as const,
        season: 2026 as const,
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
    sealG4ObservationPackage({
      rootDir: root,
      observationId: 'seal-once',
      zipBytes: W6_ZIP,
      reportMemberBytes: W6_MEMBER,
      reportMemberPath: 'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
      sidecar,
      fixtureProvenanceBytes: W6_PROVENANCE,
      runMetadata: { observationEndTime: T_OBS1 },
      designCorrespondence: { note: 'test' },
    });
    expect(() =>
      sealG4ObservationPackage({
        rootDir: root,
        observationId: 'seal-once',
        zipBytes: W6_ZIP,
        reportMemberBytes: W6_MEMBER,
        reportMemberPath: 'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
        sidecar,
        fixtureProvenanceBytes: W6_PROVENANCE,
        runMetadata: { observationEndTime: T_OBS1 },
        designCorrespondence: { note: 'test' },
      })
    ).toThrow(/observation_package_exists/);
  });
});
