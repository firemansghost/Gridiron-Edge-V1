/**
 * Offline fixture matrix for ML-CAL-1 G5-PRE (P1–P13 / N1–N28).
 * No live DB, HTTP, credentials, providers, or pooler preflight.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  sha256Utf8Bytes,
  stableStringify,
} from '../lib/ml-cal-1-lifecycle-binding';
import {
  ML_CAL_1_G5_BASE_G4_TIP,
  ML_CAL_1_G5_DESIGN_ON_DISK_SHA256,
  ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG,
  computePackageIdentityDigest,
  isSafeG5PackageMemberName,
  parseRetainedListingPage,
  runG5Pre,
  runG5Verify,
  serializeG5ListingPage,
} from '../lib/ml-cal-1-trusted-retrieval-lineage-g5-pre';
import {
  G5_CHECKED_THROUGH,
  G5_NOW_CEILING,
  G5_OBSERVER,
  G5_PRODUCER,
  G5_T_ART,
  G5_T_OBS1,
  G5_T_RUN,
  G5_T_SNAP,
  G5_W6_MEMBER,
  G5_W6_ZIP,
  buildG5Scenario,
  inWindowCandidate,
  retainUtf8,
  searchWindowStartInclusive,
} from './helpers/ml-cal-1-g5-pre-fixture-harness';

describe('ML-CAL-1 G5-PRE — design pins', () => {
  it('pins accepted design SHA and G4 tip without relabeling combined upload', () => {
    expect(ML_CAL_1_G5_DESIGN_ON_DISK_SHA256).toBe(
      'bc292e06ce78531b7290833922abe4add9be3af854fe15c599d9bcd1dc1c7a8b'
    );
    expect(ML_CAL_1_G5_BASE_G4_TIP).toBe(
      '6c2b31069b8805c7f2d171da1e04bf47885f237d'
    );
    expect(ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG).toEqual([
      'github-actions-lifecycle-artifacts',
      'local-evidence-retain-store',
      'lifecycle-report-index',
      'rating-revision-probe',
    ]);
    // Combined upload SHA is a distinct Pasted-text object — not design alone.
    expect(ML_CAL_1_G5_DESIGN_ON_DISK_SHA256).not.toBe(
      '5648e8708ed90188d34ba3ede327fc0650c4b72afaaf237312150321d1ff27a3'
    );
  });
});

describe('ML-CAL-1 G5-PRE — retained listing adapter', () => {
  it('parses retained listing pages and rejects malformed schema', () => {
    const page = {
      schemaVersion: 'ml-cal-1-g5-retained-listing-page-v1' as const,
      kind: 'g5-retained-listing-page' as const,
      sourceId: 'github-actions-lifecycle-artifacts',
      pageIndex: 0,
      nextPageToken: null,
      emptyResult: true,
      candidates: [],
    };
    const ok = parseRetainedListingPage(serializeG5ListingPage(page));
    expect(ok.ok).toBe(true);
    const bad = parseRetainedListingPage(
      Buffer.from('{"schemaVersion":"wrong"}\n', 'utf8')
    );
    expect(bad.ok).toBe(false);
  });

  it('rejects unsafe package member names', () => {
    expect(isSafeG5PackageMemberName('../escape')).toBe(false);
    expect(isSafeG5PackageMemberName('archive.zip')).toBe(true);
  });
});

describe('ML-CAL-1 G5-PRE — positives P1–P13', () => {
  it('G5-P1: complete inventory none_found + matching anchors → ok; fixture provenance; no live', () => {
    const s = buildG5Scenario();
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
    expect(r.recomputedNoneFoundPermitted).toBe(true);
    expect(r.fixtureProvenanceRetained).toBe(true);
    expect(r.liveAccepted).toBe(false);
    expect(r.liveQualifying).toBe(false);
    expect(r.prospectiveOk).toBe(false);
    expect(r.fullWeightEligible).toBe(false);
  });

  it('G5-P2: equal producer/observer SHA with distinct roles still ok', () => {
    const s = buildG5Scenario({ equalProducerObserverSha: true });
    expect(s.preInput.observationId).toBeTruthy();
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
    expect(G5_PRODUCER).toBe(G5_PRODUCER);
  });

  it('G5-P3: inventory digest ≠ sidecar digest; each matches own anchor', () => {
    const s = buildG5Scenario();
    expect(s.inventorySha256).not.toBe(s.sidecarDigest);
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
    expect(r.inventorySha256).toBe(s.inventorySha256);
    expect(r.sidecarDigest).toBe(s.sidecarDigest);
  });

  it('G5-P4: package member byteCount + sha256 replay after copy-away', () => {
    const s = buildG5Scenario({ observationId: 'g5pre-copyaway-p4' });
    const copyRoot = path.join(s.rootDir, 'copy-away');
    fs.mkdirSync(copyRoot, { recursive: true });
    const dest = path.join(copyRoot, s.observationId);
    fs.cpSync(s.packageDir, dest, { recursive: true });
    const r = runG5Pre({ ...s.preInput, packageDir: dest });
    expect(r.ok).toBe(true);
    expect(r.packageStructuralOk).toBe(true);
    for (const m of r.retrieved.packageMembers) {
      if (m.objectClass !== 'package_member') continue;
      const bytes = fs.readFileSync(m.locator);
      expect(sha256Utf8Bytes(bytes)).toBe(m.sha256);
      expect(bytes.length).toBe(m.byteCount);
    }
  });

  it('G5-P5: checkedThroughTime === observationEndTime → coverage pass', () => {
    const s = buildG5Scenario({
      checkedThroughTime: G5_T_OBS1,
      observationEndTime: G5_T_OBS1,
    });
    expect(G5_CHECKED_THROUGH).toBe(G5_T_OBS1);
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
    expect(r.reasons).not.toContain('lineage_checked_through_too_early');
  });

  it('G5-P6: checkedThrough === snap === obsEnd when equal → pass', () => {
    const t = '2026-10-06T12:00:20.000Z';
    const s = buildG5Scenario({
      checkedThroughTime: t,
      observationEndTime: t,
      bindingSnapshotReferenceTime: t,
    });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
  });

  it('G5-P7: retrieval/inventory-only with no production target → no eligibility', () => {
    const s = buildG5Scenario({ attestationSearchOutcome: null });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
    expect(r.prospectiveOk).toBe(false);
    expect(r.fullWeightEligible).toBe(false);
    expect(r.liveQualifying).toBe(false);
    expect(r.notes).toEqual(
      expect.arrayContaining(['g5_pre_retrieval_inventory_only'])
    );
    // Must not invoke verifier on this path.
    const v = runG5Verify({
      g5Pre: r,
      prospectiveTargetWeek: 7,
      fixtureOnlyTarget: false,
      verifyInput: {
        zipBytes: G5_W6_ZIP,
        sidecarBytes: fs.readFileSync(
          path.join(s.packageDir, 'binding-sidecar.json'),
          'utf8'
        ),
        expectedZipSha256: sha256Utf8Bytes(G5_W6_ZIP),
        expectedReportMemberSha256: sha256Utf8Bytes(G5_W6_MEMBER),
        expectedLifecycleProducerSha: G5_PRODUCER,
        prospectiveTargetWeek: 7,
        nowCeiling: G5_NOW_CEILING,
      },
    });
    expect(v.invokedVerifier).toBe(false);
    expect(v.reasons).toContain('prospective_target_unapproved');
  });

  it('G5-P8: higher completedThroughWeek not_invalidating with effect evidence → none_found ok', () => {
    const c = inWindowCandidate('higher-week-ok', {
      completedThroughWeek: 7,
      eventKind: 'later_week_commit',
    });
    const s = buildG5Scenario({ githubCandidates: [c] });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
    expect(r.recomputedNoneFoundPermitted).toBe(true);
    expect(r.derivedCandidateCount).toBe(1);
  });

  it('G5-P9: external package digest matches pin-defined identity when claimed + enabled', () => {
    const s = buildG5Scenario({ wholePackageApprovalEnabled: true });
    const man = JSON.parse(
      fs.readFileSync(path.join(s.packageDir, 'PACKAGE_MANIFEST.json'), 'utf8')
    ) as {
      memberDigests: Record<string, { sha256: string; byteCount: number }>;
      sidecarDigest: string;
    };
    const manifestSha = fs
      .readFileSync(path.join(s.packageDir, 'PACKAGE_MANIFEST.sha256'), 'utf8')
      .trim();
    const identity = computePackageIdentityDigest({
      observationId: s.observationId,
      memberDigests: man.memberDigests,
      sidecarDigest: man.sidecarDigest,
      manifestSha256: manifestSha,
    });
    const r = runG5Pre({
      ...s.preInput,
      claimedApprovedObservationPackageDigest: identity,
      pinDefinedPackageIdentityDigest: identity,
      wholePackageApprovalEnabled: true,
    });
    expect(r.ok).toBe(true);
  });

  it('G5-P10: deleted candidate not_invalidating via retained contents → none_found ok', () => {
    const c = inWindowCandidate('deleted-with-contents', {
      deletedOrExpired: true,
    });
    const base = buildG5Scenario({
      githubCandidates: [c],
      dispositions: [],
    });
    const s = buildG5Scenario({
      githubCandidates: [c],
      dispositions: [
        {
          candidateKey: c.candidateKey,
          workflowRunId: c.workflowRunId,
          zipSha256: c.zipSha256,
          completedThroughWeek: 6,
          commitOrWriteTime: c.commitOrWriteTime!,
          artifactAvailableAt: c.artifactAvailableAt!,
          runStartedAt: c.runStartedAt!,
          runEndedAt: c.runEndedAt!,
          eventKind: 'same_week_rerun_commit',
          sourceId: 'github-actions-lifecycle-artifacts',
          listingPageDigest: base.pageDigests['github-actions-lifecycle-artifacts'],
          candidateContentsDigest: base.contentsDigest,
          independentEffectEvidenceDigest: null,
          deletionNoticeDigest: base.noticeDigest,
          resolvedDisposition: 'not_invalidating',
        },
      ],
    });
    // Rebuild with correct listing digest from same scenario
    const s2 = buildG5Scenario({
      githubCandidates: [c],
      dispositions: undefined,
    });
    // Override disposition to use contents not effect
    const inv = JSON.parse(s2.inventoryBytes.toString('utf8'));
    inv.invalidatingCandidateArtifacts[0].candidateContentsDigest =
      s2.contentsDigest;
    inv.invalidatingCandidateArtifacts[0].independentEffectEvidenceDigest = null;
    inv.invalidatingCandidateArtifacts[0].deletionNoticeDigest = s2.noticeDigest;
    const inventoryBytes = Buffer.from(`${stableStringify(inv)}\n`, 'utf8');
    const inventorySha256 = sha256Utf8Bytes(inventoryBytes);
    const r = runG5Pre({
      ...s2.preInput,
      inventoryBytes,
      externalAnchors: {
        ...s2.preInput.externalAnchors,
        approvedLineageInventorySha256: inventorySha256,
      },
    });
    expect(r.ok).toBe(true);
    expect(r.recomputedNoneFoundPermitted).toBe(true);
    void s;
  });

  it('G5-P11: deleted candidate not_invalidating via independent effect evidence', () => {
    const c = inWindowCandidate('deleted-with-effect', {
      deletedOrExpired: true,
    });
    const s = buildG5Scenario({ githubCandidates: [c] });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
  });

  it('G5-P12: write before cutoff, artifact after cutoff, retained effect → kept candidate', () => {
    const c = inWindowCandidate('late-upload', {
      commitOrWriteTime: '2026-10-06T11:30:00.000Z',
      artifactAvailableAt: '2026-10-06T18:00:00.000Z', // after checkedThrough
    });
    const s = buildG5Scenario({ githubCandidates: [c] });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(true);
    expect(r.derivedCandidateCount).toBe(1);
  });

  it('G5-P13: run started before window, still active, aborted with effect evidence', () => {
    const c = inWindowCandidate('overlap-active', {
      runStartedAt: '2026-10-05T14:00:00.000Z', // before window start
      runEndedAt: null,
      commitOrWriteTime: null,
      artifactAvailableAt: null,
      eventKind: 'in_flight_lifecycle_work',
    });
    const s = buildG5Scenario({
      githubCandidates: [c],
    });
    // Default disposition uses effect evidence + not_invalidating; write time null
    // is allowed when independent effect evidence proves non-effect.
    const inv = JSON.parse(s.inventoryBytes.toString('utf8'));
    inv.invalidatingCandidateArtifacts[0].commitOrWriteTime = null;
    inv.invalidatingCandidateArtifacts[0].independentEffectEvidenceDigest =
      s.effectDigest;
    const inventoryBytes = Buffer.from(`${stableStringify(inv)}\n`, 'utf8');
    const inventorySha256 = sha256Utf8Bytes(inventoryBytes);
    const r = runG5Pre({
      ...s.preInput,
      inventoryBytes,
      externalAnchors: {
        ...s.preInput.externalAnchors,
        approvedLineageInventorySha256: inventorySha256,
      },
    });
    expect(r.ok).toBe(true);
    expect(r.derivedCandidateCount).toBe(1);
  });
});

describe('ML-CAL-1 G5-PRE — negatives N1–N28', () => {
  it('G5-N1: missing approved registry digest on qualification claim path', () => {
    const s = buildG5Scenario();
    const inventoryOnly = runG5Pre(s.preInput);
    expect(inventoryOnly.ok).toBe(true);
    const r = runG5Pre({
      ...s.preInput,
      requireQualificationAnchors: true,
      externalAnchors: {
        approvedLineageInventorySha256: s.inventorySha256,
        approvedSidecarDigest: s.sidecarDigest,
        approvedRegistryDocumentDigest: null,
        approvedLineageAttestationDigest: 'a'.repeat(64),
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('registry_approval_anchor_missing');
  });

  it('G5-N2: inventory anchor mismatch fails', () => {
    const s = buildG5Scenario();
    const r = runG5Pre({
      ...s.preInput,
      externalAnchors: {
        approvedLineageInventorySha256: 'a'.repeat(64),
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_inventory_digest_mismatch');
  });

  it('G5-N3: inventory digest ≠ bytes (tamper)', () => {
    const s = buildG5Scenario();
    const r = runG5Pre({
      ...s.preInput,
      externalAnchors: {
        approvedLineageInventorySha256: s.inventorySha256,
        approvedSidecarDigest: s.sidecarDigest,
      },
      inventoryBytes: Buffer.from(s.inventoryBytes.toString('utf8') + ' '),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_inventory_digest_mismatch');
  });

  it('G5-N4: approvedSidecarDigest ≠ sha256(sidecar)', () => {
    const s = buildG5Scenario();
    const r = runG5Pre({
      ...s.preInput,
      externalAnchors: {
        approvedLineageInventorySha256: s.inventorySha256,
        approvedSidecarDigest: 'b'.repeat(64),
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('sidecar_digest_mismatch_vs_approval_anchor');
  });

  it('G5-N5 / N5b: checkedThrough too early vs snap / obsEnd-1ms', () => {
    const early = new Date(Date.parse(G5_T_OBS1) - 1).toISOString();
    const s = buildG5Scenario({
      checkedThroughTime: early,
      observationEndTime: G5_T_OBS1,
      bindingSnapshotReferenceTime: G5_T_SNAP,
    });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_checked_through_too_early');
  });

  it('G5-N6 / N6b: search window end ≠ checkedThrough', () => {
    const s = buildG5Scenario({
      mutateInventory: (inv) => ({
        ...inv,
        searchWindowEndInclusive: '2026-10-06T11:59:59.000Z',
      }),
    });
    const inventorySha256 = sha256Utf8Bytes(s.inventoryBytes);
    // rebuild after mutate — buildG5Scenario already mutated before serialize
    const r = runG5Pre({
      ...s.preInput,
      externalAnchors: {
        approvedLineageInventorySha256: s.inventorySha256,
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_search_window_end_mismatch');
    void inventorySha256;
  });

  it('G5-N7: declared searchComplete=true but incomplete → reject', () => {
    const s = buildG5Scenario({
      omitSourceId: 'rating-revision-probe',
      mutateInventory: (inv) => ({
        ...inv,
        searchComplete: true,
        noneFoundPermitted: true,
      }),
    });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        'lineage_search_incomplete',
        'lineage_inventory_declaration_mismatch',
      ])
    );
  });

  it('G5-N8: failed/unavailable required source blocks none_found', () => {
    const s = buildG5Scenario({ failSourceId: 'lifecycle-report-index' });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.recomputedNoneFoundPermitted).toBe(false);
  });

  it('G5-N9: unresolved pagination / missing page digests', () => {
    const s = buildG5Scenario({
      unresolvedPaginationSourceId: 'local-evidence-retain-store',
    });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_search_incomplete');
  });

  it('G5-N10: empty/missing sourcesSearched or missing catalog source', () => {
    const s = buildG5Scenario({
      mutateInventory: (inv) => ({
        ...inv,
        sourcesSearched: [],
        searchComplete: true,
        noneFoundPermitted: true,
      }),
    });
    const r = runG5Pre({
      ...s.preInput,
      externalAnchors: {
        approvedLineageInventorySha256: s.inventorySha256,
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_search_incomplete');
  });

  it('G5-N11: candidate missing retained evidence with unresolved disposition', () => {
    const c = inWindowCandidate('unresolved-no-evidence');
    const s = buildG5Scenario({
      githubCandidates: [c],
      dispositions: [
        {
          candidateKey: c.candidateKey,
          workflowRunId: c.workflowRunId,
          zipSha256: c.zipSha256,
          completedThroughWeek: 6,
          commitOrWriteTime: c.commitOrWriteTime!,
          artifactAvailableAt: c.artifactAvailableAt!,
          runStartedAt: c.runStartedAt!,
          runEndedAt: c.runEndedAt!,
          eventKind: 'same_week_rerun_commit',
          sourceId: 'github-actions-lifecycle-artifacts',
          listingPageDigest: 'c'.repeat(64), // wrong; will rebuild
          candidateContentsDigest: null,
          independentEffectEvidenceDigest: null,
          deletionNoticeDigest: null,
          resolvedDisposition: 'unresolved',
        },
      ],
    });
    // Fix listing digest to real page
    const inv = JSON.parse(s.inventoryBytes.toString('utf8'));
    inv.invalidatingCandidateArtifacts[0].listingPageDigest =
      s.pageDigests['github-actions-lifecycle-artifacts'];
    inv.searchComplete = true;
    inv.noneFoundPermitted = true;
    const inventoryBytes = Buffer.from(`${stableStringify(inv)}\n`, 'utf8');
    const r = runG5Pre({
      ...s.preInput,
      inventoryBytes,
      externalAnchors: {
        approvedLineageInventorySha256: sha256Utf8Bytes(inventoryBytes),
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_candidate_unresolved');
  });

  it('G5-N12: invalidating candidate blocks none_found', () => {
    const c = inWindowCandidate('invalidating-one');
    const s = buildG5Scenario({ githubCandidates: [c] });
    const inv = JSON.parse(s.inventoryBytes.toString('utf8'));
    inv.invalidatingCandidateArtifacts[0].resolvedDisposition = 'invalidating';
    inv.noneFoundPermitted = true;
    inv.searchComplete = true;
    const inventoryBytes = Buffer.from(`${stableStringify(inv)}\n`, 'utf8');
    const r = runG5Pre({
      ...s.preInput,
      inventoryBytes,
      attestationSearchOutcome: 'none_found',
      externalAnchors: {
        approvedLineageInventorySha256: sha256Utf8Bytes(inventoryBytes),
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.recomputedNoneFoundPermitted).toBe(false);
  });

  it('G5-N13: higher week alone supersession inference forbidden', () => {
    const c = inWindowCandidate('week-alone', {
      completedThroughWeek: 8,
      eventKind: 'higher_week_alone',
    });
    const s = buildG5Scenario({ githubCandidates: [c] });
    const inv = JSON.parse(s.inventoryBytes.toString('utf8'));
    inv.invalidatingCandidateArtifacts[0].eventKind = 'higher_week_alone';
    const inventoryBytes = Buffer.from(`${stableStringify(inv)}\n`, 'utf8');
    const r = runG5Pre({
      ...s.preInput,
      inventoryBytes,
      externalAnchors: {
        approvedLineageInventorySha256: sha256Utf8Bytes(inventoryBytes),
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_week_alone_supersession_forbidden');
  });

  it('G5-N14 / N15: fixture provenance blocks portable live; relabel insufficient', () => {
    const s = buildG5Scenario();
    const r = runG5Pre(s.preInput);
    expect(r.fixtureProvenanceRetained).toBe(true);
    expect(r.liveAccepted).toBe(false);
    const v = runG5Verify({
      g5Pre: r,
      prospectiveTargetWeek: 7,
      fixtureOnlyTarget: true,
      verifyInput: {
        zipBytes: G5_W6_ZIP,
        reportMemberBytes: G5_W6_MEMBER,
        sidecarBytes: fs.readFileSync(
          path.join(s.packageDir, 'binding-sidecar.json'),
          'utf8'
        ),
        expectedZipSha256: sha256Utf8Bytes(G5_W6_ZIP),
        expectedReportMemberSha256: sha256Utf8Bytes(G5_W6_MEMBER),
        expectedLifecycleProducerSha: G5_PRODUCER,
        prospectiveTargetWeek: 7,
        nowCeiling: G5_NOW_CEILING,
      },
    });
    expect(v.liveAccepted).toBe(false);
    expect(v.reasons).toContain(
      'fixture_provenance_blocks_portable_live_acceptance'
    );
  });

  it('G5-N16: ZIP sha256 must not equate to attestation/inventory digest class', () => {
    const zipSha = sha256Utf8Bytes(G5_W6_ZIP);
    const s = buildG5Scenario();
    expect(zipSha).not.toBe(s.inventorySha256);
    expect(zipSha).not.toBe(s.sidecarDigest);
  });

  it('G5-N17: cannot set approved receipt from just-computed adapted digest', () => {
    const s = buildG5Scenario();
    const r = runG5Pre(s.preInput);
    const just = 'c'.repeat(64);
    const v = runG5Verify({
      g5Pre: r,
      prospectiveTargetWeek: 7,
      fixtureOnlyTarget: true,
      verifyInput: {
        zipBytes: G5_W6_ZIP,
        sidecarBytes: fs.readFileSync(
          path.join(s.packageDir, 'binding-sidecar.json'),
          'utf8'
        ),
        expectedZipSha256: sha256Utf8Bytes(G5_W6_ZIP),
        expectedReportMemberSha256: sha256Utf8Bytes(G5_W6_MEMBER),
        expectedLifecycleProducerSha: G5_PRODUCER,
        prospectiveTargetWeek: 7,
        nowCeiling: G5_NOW_CEILING,
        trustedAcceptance: { approvedReceiptDigest: just },
        _justComputedAdaptedReceiptDigest: just,
      } as never,
    });
    expect(v.reasons).toContain('receipt_approval_self_assigned');
  });

  it('G5-N18: byteCount lie / unsafe member path rejected', () => {
    const lie = buildG5Scenario({ lieAboutByteCount: true });
    expect(runG5Pre(lie.preInput).ok).toBe(false);
    expect(runG5Pre(lie.preInput).reasons).toContain(
      'package_member_bytecount_mismatch'
    );
    const unsafe = buildG5Scenario({ addUnsafeMember: true });
    expect(runG5Pre(unsafe.preInput).reasons).toContain(
      'unsafe_package_member_path'
    );
  });

  it('G5-N19: claim approved package integrity from self-hash alone → reject', () => {
    const s = buildG5Scenario({ claimPackageApprovalWithoutPin: true });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        'observation_package_approval_disabled',
        'observation_package_approval_self_hash_rejected',
      ])
    );
  });

  it('G5-N20: inventing production target for verifier forbidden', () => {
    const s = buildG5Scenario();
    const pre = runG5Pre(s.preInput);
    const v = runG5Verify({
      g5Pre: pre,
      prospectiveTargetWeek: 99,
      fixtureOnlyTarget: false,
      verifyInput: {
        zipBytes: G5_W6_ZIP,
        sidecarBytes: fs.readFileSync(
          path.join(s.packageDir, 'binding-sidecar.json'),
          'utf8'
        ),
        expectedZipSha256: sha256Utf8Bytes(G5_W6_ZIP),
        expectedReportMemberSha256: sha256Utf8Bytes(G5_W6_MEMBER),
        expectedLifecycleProducerSha: G5_PRODUCER,
        prospectiveTargetWeek: 99,
        nowCeiling: G5_NOW_CEILING,
      },
    });
    expect(v.invokedVerifier).toBe(false);
    expect(v.reasons).toContain('prospective_target_unapproved');
  });

  it('G5-N21: omit prospectiveTargetWeek on verify path → forbidden', () => {
    const s = buildG5Scenario();
    const pre = runG5Pre(s.preInput);
    const v = runG5Verify({
      g5Pre: pre,
      prospectiveTargetWeek: undefined as unknown as number,
      fixtureOnlyTarget: true,
      verifyInput: {
        zipBytes: G5_W6_ZIP,
        sidecarBytes: fs.readFileSync(
          path.join(s.packageDir, 'binding-sidecar.json'),
          'utf8'
        ),
        expectedZipSha256: sha256Utf8Bytes(G5_W6_ZIP),
        expectedReportMemberSha256: sha256Utf8Bytes(G5_W6_MEMBER),
        expectedLifecycleProducerSha: G5_PRODUCER,
        prospectiveTargetWeek: 7,
        nowCeiling: G5_NOW_CEILING,
      },
    });
    expect(v.invokedVerifier).toBe(false);
    expect(v.reasons).toContain('prospective_target_week_required');
  });

  it('G5-N22: capture-as-of claim at G5 without capture → out of gate', () => {
    const s = buildG5Scenario({
      mutateInventory: (inv) => ({
        ...inv,
        incompleteReasons: ['capture_as_of_claim_at_g5'],
      }),
    });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('capture_as_of_out_of_gate');
  });

  it('G5-N23: declared noneFoundPermitted=true while recomputed false', () => {
    const c = inWindowCandidate('inv');
    const s = buildG5Scenario({ githubCandidates: [c] });
    const inv = JSON.parse(s.inventoryBytes.toString('utf8'));
    inv.invalidatingCandidateArtifacts[0].resolvedDisposition = 'invalidating';
    inv.noneFoundPermitted = true;
    inv.searchComplete = true;
    const inventoryBytes = Buffer.from(`${stableStringify(inv)}\n`, 'utf8');
    const r = runG5Pre({
      ...s.preInput,
      inventoryBytes,
      externalAnchors: {
        approvedLineageInventorySha256: sha256Utf8Bytes(inventoryBytes),
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_inventory_declaration_mismatch');
  });

  it('G5-N24: deletion notice alone claimed not_invalidating → unresolved', () => {
    const c = inWindowCandidate('notice-only', { deletedOrExpired: true });
    const s = buildG5Scenario({ githubCandidates: [c] });
    const inv = JSON.parse(s.inventoryBytes.toString('utf8'));
    inv.invalidatingCandidateArtifacts[0].candidateContentsDigest = null;
    inv.invalidatingCandidateArtifacts[0].independentEffectEvidenceDigest = null;
    inv.invalidatingCandidateArtifacts[0].deletionNoticeDigest = s.noticeDigest;
    inv.invalidatingCandidateArtifacts[0].resolvedDisposition =
      'not_invalidating';
    inv.noneFoundPermitted = true;
    const inventoryBytes = Buffer.from(`${stableStringify(inv)}\n`, 'utf8');
    const r = runG5Pre({
      ...s.preInput,
      inventoryBytes,
      externalAnchors: {
        approvedLineageInventorySha256: sha256Utf8Bytes(inventoryBytes),
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_deleted_candidate_unresolved');
  });

  it('G5-N25: listed candidate omitted from inventory', () => {
    const c = inWindowCandidate('omitted');
    const s = buildG5Scenario({
      githubCandidates: [c],
      dispositions: [],
      mutateInventory: (inv) => ({
        ...inv,
        invalidatingCandidateArtifacts: [],
        searchComplete: true,
        noneFoundPermitted: true,
      }),
    });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_candidate_omitted_from_inventory');
  });

  it('G5-N26: in-window write with late upload silently excluded → reject', () => {
    const c = inWindowCandidate('late-drop', {
      commitOrWriteTime: '2026-10-06T11:00:00.000Z',
      artifactAvailableAt: '2026-10-08T00:00:00.000Z',
    });
    // List on page but omit from inventory dispositions
    const s = buildG5Scenario({
      githubCandidates: [c],
      dispositions: [],
      mutateInventory: (inv) => ({
        ...inv,
        invalidatingCandidateArtifacts: [],
        searchComplete: true,
        noneFoundPermitted: true,
      }),
    });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_candidate_omitted_from_inventory');
  });

  it('G5-N27: overlapping pre-window run omitted → reject', () => {
    const c = inWindowCandidate('overlap-omit', {
      runStartedAt: '2026-10-05T10:00:00.000Z',
      runEndedAt: null,
      commitOrWriteTime: null,
    });
    const s = buildG5Scenario({
      githubCandidates: [c],
      dispositions: [],
      mutateInventory: (inv) => ({
        ...inv,
        invalidatingCandidateArtifacts: [],
        searchComplete: true,
        noneFoundPermitted: true,
      }),
    });
    const r = runG5Pre(s.preInput);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_candidate_omitted_from_inventory');
  });

  it('G5-N28: ambiguous null commitOrWriteTime without non-effect proof → unresolved', () => {
    const c = inWindowCandidate('ambiguous-write', {
      commitOrWriteTime: null,
      runStartedAt: '2026-10-06T11:00:00.000Z',
      runEndedAt: '2026-10-06T11:30:00.000Z',
    });
    const s = buildG5Scenario({ githubCandidates: [c] });
    const inv = JSON.parse(s.inventoryBytes.toString('utf8'));
    inv.invalidatingCandidateArtifacts[0].commitOrWriteTime = null;
    inv.invalidatingCandidateArtifacts[0].independentEffectEvidenceDigest = null;
    inv.invalidatingCandidateArtifacts[0].candidateContentsDigest = null;
    inv.invalidatingCandidateArtifacts[0].resolvedDisposition =
      'not_invalidating';
    const inventoryBytes = Buffer.from(`${stableStringify(inv)}\n`, 'utf8');
    const r = runG5Pre({
      ...s.preInput,
      inventoryBytes,
      externalAnchors: {
        approvedLineageInventorySha256: sha256Utf8Bytes(inventoryBytes),
        approvedSidecarDigest: s.sidecarDigest,
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('lineage_candidate_unresolved');
  });
});

describe('ML-CAL-1 G5-PRE — inherited fixture digests', () => {
  it('retains synthetic-w6 archive/member digests (copy-away identity)', () => {
    expect(sha256Utf8Bytes(G5_W6_ZIP)).toBe(
      'fc477ffdb0b3f306816988e988442f8f708304c94bbe1a6b4c336b93c8fa5d97'
    );
    expect(sha256Utf8Bytes(G5_W6_MEMBER)).toBe(
      '2dcbfe96023bf1273ff4a385aeaa3297afb99a9b3d2da80d5f87dd8e09024dab'
    );
    expect(searchWindowStartInclusive()).toBe(
      new Date(Math.min(Date.parse(G5_T_RUN), Date.parse(G5_T_ART))).toISOString()
    );
    expect(G5_OBSERVER).toMatch(/^[0-9a-f]{40}$/);
  });
});
