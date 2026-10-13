/**
 * Offline fixture harness for ML-CAL-1 G5-PRE.
 * Builds retained listing pages + inventory + sealed G4 package in temp dirs.
 * No live HTTP/DB. Fixture provenance always retained.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildObservedRowsFromReport,
  parseLifecycleReport,
  sha256Utf8Bytes,
  stableStringify,
  type MlCal1LifecycleBindingSidecarV1,
} from '../../lib/ml-cal-1-lifecycle-binding';
import {
  sealG4ObservationPackage,
} from '../../lib/ml-cal-1-lifecycle-binding-observer';
import {
  ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG,
  retainBytesByDigest,
  serializeG5Inventory,
  serializeG5ListingPage,
  type MlCal1G5InventoryCandidate,
  type MlCal1G5LineageInventory,
  type MlCal1G5PreInput,
  type MlCal1G5RetainedListingCandidate,
  type MlCal1G5RetainedListingPage,
} from '../../lib/ml-cal-1-trusted-retrieval-lineage-g5-pre';

export const G5_FIXTURE_W6_DIR = path.join(
  __dirname,
  '..',
  'fixtures',
  'packages',
  'ml-cal-1-g4-observer',
  'synthetic-w6'
);

export const G5_W6_ZIP = fs.readFileSync(path.join(G5_FIXTURE_W6_DIR, 'archive.zip'));
export const G5_W6_MEMBER = fs.readFileSync(
  path.join(G5_FIXTURE_W6_DIR, 'core-v1-lifecycle-2026-through-week-6-COMMIT.json')
);
export const G5_W6_PROVENANCE = fs.readFileSync(
  path.join(G5_FIXTURE_W6_DIR, 'PROVENANCE.json')
);

export const G5_PRODUCER = 'cccccccccccccccccccccccccccccccccccccccc';
export const G5_OBSERVER = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const G5_T_RUN = '2026-10-05T15:50:00.000Z';
export const G5_T_ART = '2026-10-05T15:56:00.000Z';
export const G5_T_OBS0 = '2026-10-06T12:00:00.000Z';
export const G5_T_DB = '2026-10-06T12:00:05.000Z';
export const G5_T_SNAP = '2026-10-06T12:00:10.000Z';
export const G5_T_OBS1 = '2026-10-06T12:00:20.000Z';
export const G5_T_ROW = '2026-10-05T16:00:00.000Z';
export const G5_NOW_CEILING = '2026-10-07T00:00:00.000Z';
/** Inclusive search end / checkedThrough — equals observation end for P5 boundary. */
export const G5_CHECKED_THROUGH = G5_T_OBS1;

export function g5TmpRoot(prefix = 'ml-cal-1-g5-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function searchWindowStartInclusive(): string {
  return new Date(
    Math.min(Date.parse(G5_T_RUN), Date.parse(G5_T_ART))
  ).toISOString();
}

export function buildFixtureSidecar(opts?: {
  observerSha?: string;
  producerSha?: string;
  observationEndTime?: string;
  bindingSnapshotReferenceTime?: string;
}): MlCal1LifecycleBindingSidecarV1 {
  const report = parseLifecycleReport(G5_W6_MEMBER);
  const rows = buildObservedRowsFromReport(report, {
    createdAt: G5_T_ROW,
    updatedAt: G5_T_ROW,
  });
  return {
    schemaVersion: 'ml-cal-1-lifecycle-binding-sidecar-v1',
    kind: 'lifecycle-binding-sidecar',
    mode: 'fixture_hypothetical',
    acceptedArchive: {
      github: {
        workflowRunId: 'fixture-synthetic-w6',
        artifactId: 'fixture-artifact-w6',
        artifactName: 'core-v1-lifecycle-2026-through-w6-COMMIT-fixture',
        workflowRunCompletedAt: G5_T_RUN,
        artifactCreatedAt: G5_T_ART,
        zipSha256: sha256Utf8Bytes(G5_W6_ZIP),
        reportMemberPath: 'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
        reportMemberSha256: sha256Utf8Bytes(G5_W6_MEMBER),
        reportByteCount: G5_W6_MEMBER.length,
      },
      lifecycleProducerSha: opts?.producerSha ?? G5_PRODUCER,
    },
    bindingObservation: {
      observationStartTime: G5_T_OBS0,
      observationEndTime: opts?.observationEndTime ?? G5_T_OBS1,
      bindingSnapshotReferenceTime:
        opts?.bindingSnapshotReferenceTime ?? G5_T_SNAP,
      dbTransactionTime: G5_T_DB,
      dbTransactionTimeUnavailableReason: null,
      bindingObserverSha: opts?.observerSha ?? G5_OBSERVER,
      readMode: 'fixture_injected',
      season: 2026,
      modelVersion: 'v1',
      rows,
      rowCreatedAtMin: G5_T_ROW,
      rowCreatedAtMax: G5_T_ROW,
      rowUpdatedAtMin: G5_T_ROW,
      rowUpdatedAtMax: G5_T_ROW,
    },
    fingerprintComputedFromLaterReadback: true,
    readbackWasNotExportedAtCommit: true,
    sidecarSelfAccepted: false,
    providerCalls: 0,
    businessDataWrites: 0,
  };
}

export function sealFixturePackage(input: {
  rootDir: string;
  observationId: string;
  sidecar?: MlCal1LifecycleBindingSidecarV1;
}): { packageDir: string; sidecarDigest: string; manifestSha256: string } {
  const sidecar = input.sidecar ?? buildFixtureSidecar();
  const sealed = sealG4ObservationPackage({
    rootDir: input.rootDir,
    observationId: input.observationId,
    zipBytes: G5_W6_ZIP,
    reportMemberBytes: G5_W6_MEMBER,
    reportMemberPath: 'core-v1-lifecycle-2026-through-week-6-COMMIT.json',
    sidecar,
    runMetadata: {
      observationEndTime: sidecar.bindingObservation.observationEndTime,
      fixture: true,
    },
    designCorrespondence: {
      gate: 'G5-PRE',
      baseG4Tip: '6c2b31069b8805c7f2d171da1e04bf47885f237d',
      designSha256:
        'bc292e06ce78531b7290833922abe4add9be3af854fe15c599d9bcd1dc1c7a8b',
    },
    fixtureProvenanceBytes: G5_W6_PROVENANCE,
  });
  return {
    packageDir: sealed.packageDir,
    sidecarDigest: sealed.sidecarDigest,
    manifestSha256: sealed.manifestSha256,
  };
}

export function emptyListingPage(
  sourceId: string,
  pageIndex = 0
): MlCal1G5RetainedListingPage {
  return {
    schemaVersion: 'ml-cal-1-g5-retained-listing-page-v1',
    kind: 'g5-retained-listing-page',
    sourceId,
    pageIndex,
    nextPageToken: null,
    emptyResult: true,
    candidates: [],
  };
}

export function listingPage(
  sourceId: string,
  candidates: MlCal1G5RetainedListingCandidate[],
  opts?: { pageIndex?: number; nextPageToken?: string | null }
): MlCal1G5RetainedListingPage {
  return {
    schemaVersion: 'ml-cal-1-g5-retained-listing-page-v1',
    kind: 'g5-retained-listing-page',
    sourceId,
    pageIndex: opts?.pageIndex ?? 0,
    nextPageToken: opts?.nextPageToken ?? null,
    emptyResult: candidates.length === 0,
    candidates,
  };
}

export function retainPage(
  retainDir: string,
  page: MlCal1G5RetainedListingPage
): string {
  return retainBytesByDigest(retainDir, serializeG5ListingPage(page));
}

export function retainUtf8(retainDir: string, text: string): string {
  return retainBytesByDigest(retainDir, Buffer.from(text, 'utf8'));
}

export interface G5ScenarioOptions {
  observationId?: string;
  /** Extra candidates listed on github-actions source (default none). */
  githubCandidates?: MlCal1G5RetainedListingCandidate[];
  /** Inventory dispositions; default reconciles to derived keys with not_invalidating + effect evidence. */
  dispositions?: MlCal1G5InventoryCandidate[];
  /** Override inventory fields after build. */
  mutateInventory?: (inv: MlCal1G5LineageInventory) => MlCal1G5LineageInventory;
  /** Omit a required source from pages. */
  omitSourceId?: string;
  /** Leave pagination unresolved on a source. */
  unresolvedPaginationSourceId?: string;
  /** Mark a source failed/unavailable. */
  failSourceId?: string;
  checkedThroughTime?: string;
  observationEndTime?: string;
  bindingSnapshotReferenceTime?: string;
  equalProducerObserverSha?: boolean;
  attestationSearchOutcome?: 'none_found' | 'superseded' | null;
  skipExternalInventoryAnchor?: boolean;
  claimPackageApprovalWithoutPin?: boolean;
  wholePackageApprovalEnabled?: boolean;
  /** Missing PROVENANCE by deleting after seal. */
  stripProvenance?: boolean;
  /** Corrupt a member digest declaration. */
  lieAboutByteCount?: boolean;
  /** Add unsafe member file. */
  addUnsafeMember?: boolean;
}

export interface G5Scenario {
  rootDir: string;
  packageDir: string;
  retainDir: string;
  observationId: string;
  sidecarDigest: string;
  inventoryBytes: Buffer;
  inventorySha256: string;
  pageDigests: Record<string, string>;
  preInput: MlCal1G5PreInput;
  effectDigest: string;
  contentsDigest: string;
  noticeDigest: string;
}

export function buildG5Scenario(opts: G5ScenarioOptions = {}): G5Scenario {
  const rootDir = g5TmpRoot();
  const observationId = opts.observationId ?? 'g5pre-fixture-obs-001';
  const retainDir = path.join(rootDir, 'search-evidence');
  fs.mkdirSync(retainDir, { recursive: true });

  const observerSha = opts.equalProducerObserverSha ? G5_PRODUCER : G5_OBSERVER;
  const obsEnd = opts.observationEndTime ?? G5_T_OBS1;
  const snap = opts.bindingSnapshotReferenceTime ?? G5_T_SNAP;
  const checked = opts.checkedThroughTime ?? obsEnd;
  const winStart = searchWindowStartInclusive();

  const sealed = sealFixturePackage({
    rootDir: path.join(rootDir, 'packages'),
    observationId,
    sidecar: buildFixtureSidecar({
      observerSha,
      observationEndTime: obsEnd,
      bindingSnapshotReferenceTime: snap,
    }),
  });

  if (opts.stripProvenance) {
    fs.unlinkSync(path.join(sealed.packageDir, 'PROVENANCE.json'));
    const manPath = path.join(sealed.packageDir, 'PACKAGE_MANIFEST.json');
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8')) as {
      memberDigests: Record<string, unknown>;
      sidecarDigest: string;
    };
    delete man.memberDigests['PROVENANCE.json'];
    const manBytes = Buffer.from(`${stableStringify(man)}\n`, 'utf8');
    const dig = sha256Utf8Bytes(manBytes);
    fs.writeFileSync(manPath, manBytes);
    fs.writeFileSync(
      path.join(sealed.packageDir, 'PACKAGE_MANIFEST.sha256'),
      `${dig}\n`
    );
  }

  if (opts.lieAboutByteCount) {
    const manPath = path.join(sealed.packageDir, 'PACKAGE_MANIFEST.json');
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8')) as {
      memberDigests: Record<string, { sha256: string; byteCount: number }>;
      sidecarDigest: string;
    };
    man.memberDigests['archive.zip'].byteCount += 1;
    const manBytes = Buffer.from(`${stableStringify(man)}\n`, 'utf8');
    const dig = sha256Utf8Bytes(manBytes);
    fs.writeFileSync(manPath, manBytes);
    fs.writeFileSync(
      path.join(sealed.packageDir, 'PACKAGE_MANIFEST.sha256'),
      `${dig}\n`
    );
  }

  if (opts.addUnsafeMember) {
    const manPath = path.join(sealed.packageDir, 'PACKAGE_MANIFEST.json');
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8')) as {
      memberDigests: Record<string, { sha256: string; byteCount: number }>;
      sidecarDigest: string;
    };
    man.memberDigests['../escape'] = {
      sha256: 'f'.repeat(64),
      byteCount: 1,
    };
    const manBytes = Buffer.from(`${stableStringify(man)}\n`, 'utf8');
    const dig = sha256Utf8Bytes(manBytes);
    fs.writeFileSync(manPath, manBytes);
    fs.writeFileSync(
      path.join(sealed.packageDir, 'PACKAGE_MANIFEST.sha256'),
      `${dig}\n`
    );
  }

  const effectDigest = retainUtf8(
    retainDir,
    JSON.stringify({
      kind: 'independent-effect-evidence',
      proves: 'non_effect_on_bound_ratings',
      season: 2026,
      modelVersion: 'v1',
    })
  );
  const contentsDigest = retainUtf8(
    retainDir,
    JSON.stringify({
      kind: 'candidate-contents',
      zipSha256: 'a'.repeat(64),
      note: 'retained body sufficient to evaluate non-effect',
    })
  );
  const noticeDigest = retainUtf8(
    retainDir,
    JSON.stringify({ kind: 'deletion-notice', note: 'artifact expired' })
  );

  const githubCandidates = opts.githubCandidates ?? [];
  const pageDigests: Record<string, string> = {};

  for (const sourceId of ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG) {
    if (opts.omitSourceId === sourceId) continue;
    const cands =
      sourceId === 'github-actions-lifecycle-artifacts' ? githubCandidates : [];
    let page = listingPage(sourceId, cands);
    if (opts.unresolvedPaginationSourceId === sourceId) {
      page = { ...page, nextPageToken: 'more' };
    }
    pageDigests[sourceId] = retainPage(retainDir, page);
  }

  // Default dispositions: reconcile every github candidate as not_invalidating via effect evidence.
  let dispositions: MlCal1G5InventoryCandidate[] =
    opts.dispositions ??
    githubCandidates.map((c) => ({
      candidateKey: c.candidateKey,
      workflowRunId: c.workflowRunId ?? null,
      zipSha256: c.zipSha256 ?? null,
      completedThroughWeek: c.completedThroughWeek ?? null,
      commitOrWriteTime: c.commitOrWriteTime ?? null,
      artifactAvailableAt: c.artifactAvailableAt ?? null,
      runStartedAt: c.runStartedAt ?? null,
      runEndedAt: c.runEndedAt ?? null,
      eventKind: c.eventKind ?? 'same_week_rerun_commit',
      sourceId: 'github-actions-lifecycle-artifacts',
      listingPageDigest: pageDigests['github-actions-lifecycle-artifacts'],
      candidateContentsDigest: null,
      independentEffectEvidenceDigest: effectDigest,
      deletionNoticeDigest: c.deletedOrExpired ? noticeDigest : null,
      resolvedDisposition: 'not_invalidating',
    }));

  const sourcesSearched = ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG.filter(
    (id) => opts.omitSourceId !== id
  ).map((sourceId) => {
    const digest = pageDigests[sourceId];
    const failed = opts.failSourceId === sourceId;
    const unresolved = opts.unresolvedPaginationSourceId === sourceId;
    return {
      sourceId,
      locator: `fixture://retain/${sourceId}`,
      query: { season: 2026, modelVersion: 'v1' },
      timeBounds: {
        startInclusive: winStart,
        endInclusive: checked,
      },
      pagination: {
        strategy: 'page' as const,
        pagesRetrieved: digest ? 1 : 0,
        pageDigests: digest ? [digest] : [],
        nextPageToken: unresolved ? 'more' : null,
        complete: !failed && !unresolved && !!digest,
      },
      resultCount:
        sourceId === 'github-actions-lifecycle-artifacts'
          ? githubCandidates.length
          : 0,
      failed,
      failureReason: failed ? 'fixture_source_failed' : null,
      unavailable: failed,
      retainedEvidenceDigests: digest ? [digest] : [],
    };
  });

  // Compute whether complete for mirrors — harness sets mirrors to match intended recompute for positives.
  const intendedComplete =
    !opts.omitSourceId &&
    !opts.failSourceId &&
    !opts.unresolvedPaginationSourceId &&
    dispositions.every((d) => d.resolvedDisposition !== 'unresolved');

  let inventory: MlCal1G5LineageInventory = {
    schemaVersion: 'ml-cal-1-lifecycle-binding-lineage-inventory-v1',
    kind: 'lifecycle-binding-lineage-inventory',
    season: 2026,
    modelVersion: 'v1',
    selectedPolicy: 'GLOBAL_BLEND_W3_W6',
    completedThroughWeekObserved: 6,
    lifecycleProducerSha: G5_PRODUCER,
    bindingObserverSha: observerSha,
    observationId,
    approvedSidecarDigest: sealed.sidecarDigest,
    registryId: 'fixture-registry://g5-pre-test',
    registrySha256: 'd'.repeat(64),
    searchWindowStartInclusive: winStart,
    searchWindowEndInclusive: checked,
    inventoryAssembledAt: checked,
    requiredSourceCatalog: [...ML_CAL_1_G5_REQUIRED_SOURCE_CATALOG],
    sourcesSearched,
    searchComplete: intendedComplete,
    noneFoundPermitted:
      intendedComplete &&
      dispositions.every((d) => d.resolvedDisposition === 'not_invalidating'),
    incompleteReasons: [],
    expiredOrDeletedArtifacts: [],
    invalidatingCandidateArtifacts: dispositions,
    failedSearches: opts.failSourceId
      ? [
          {
            sourceId: opts.failSourceId,
            failureReason: 'fixture_source_failed',
            retainedEvidenceDigest: null,
          },
        ]
      : [],
  };

  if (opts.mutateInventory) {
    inventory = opts.mutateInventory(inventory);
  }

  const inventoryBytes = serializeG5Inventory(inventory);
  const inventorySha256 = sha256Utf8Bytes(inventoryBytes);

  const preInput: MlCal1G5PreInput = {
    observationId,
    packageDir: sealed.packageDir,
    searchEvidenceRetainDir: retainDir,
    inventoryBytes,
    externalAnchors: {
      approvedLineageInventorySha256: opts.skipExternalInventoryAnchor
        ? null
        : inventorySha256,
      approvedSidecarDigest: sealed.sidecarDigest,
    },
    claimedApprovedObservationPackageDigest: opts.claimPackageApprovalWithoutPin
      ? inventorySha256
      : null,
    pinDefinedPackageIdentityDigest: null,
    wholePackageApprovalEnabled: opts.wholePackageApprovalEnabled === true,
    attestationSearchOutcome:
      opts.attestationSearchOutcome === undefined
        ? 'none_found'
        : opts.attestationSearchOutcome,
    attestationCheckedThroughTime: checked,
    bindingSnapshotReferenceTime: snap,
    observationEndTime: obsEnd,
    nowCeiling: G5_NOW_CEILING,
    workflowRunCompletedAt: G5_T_RUN,
    artifactCreatedAt: G5_T_ART,
  };

  return {
    rootDir,
    packageDir: sealed.packageDir,
    retainDir,
    observationId,
    sidecarDigest: sealed.sidecarDigest,
    inventoryBytes,
    inventorySha256,
    pageDigests,
    preInput,
    effectDigest,
    contentsDigest,
    noticeDigest,
  };
}

/** In-window candidate helper. */
export function inWindowCandidate(
  key: string,
  overrides?: Partial<MlCal1G5RetainedListingCandidate>
): MlCal1G5RetainedListingCandidate {
  return {
    candidateKey: key,
    workflowRunId: `run-${key}`,
    zipSha256: 'e'.repeat(64),
    completedThroughWeek: 6,
    season: 2026,
    modelVersion: 'v1',
    commitOrWriteTime: '2026-10-06T11:00:00.000Z',
    artifactAvailableAt: '2026-10-06T11:05:00.000Z',
    runStartedAt: '2026-10-06T10:50:00.000Z',
    runEndedAt: '2026-10-06T11:10:00.000Z',
    eventKind: 'same_week_rerun_commit',
    ...overrides,
  };
}
