/**
 * ML-CAL-1 Capture ↔ Lifecycle Binding Integration G2 (offline).
 *
 * Pure orchestration: verify binding bytes with external approval anchors,
 * build/adapt a derived receipt, compare independently supplied
 * trustedAcceptance.approvedReceiptDigest (never copy the computed digest),
 * recompute capture ratingFingerprint from planner-used ratingsByTeamId,
 * require capture-as-of lineage coverage, then call the accepted capture
 * qualifier. Fixture provenance is retained; portable liveAccepted is never
 * manufactured by this helper.
 *
 * Not wired into live CLI, DB adapter, or production capture workflow.
 */

import {
  adaptDerivedReceiptToCaptureLifecycleInput,
  buildDerivedReceiptCore,
  buildDerivedReceiptEnvelope,
  buildRatingFingerprint as bindingBuildRatingFingerprint,
  exportRatingInput as bindingExportRatingInput,
  reconstructRawRatingRow,
  sha256Utf8Bytes,
  verifyLifecycleBindingSidecar,
  type MlCal1BindingObservedRatingRow,
  type MlCal1LifecycleBindingDerivedReceiptEnvelopeV1,
  type MlCal1LifecycleBindingSidecarV1,
  type MlCal1LifecycleBindingVerifyInput,
  type MlCal1LifecycleBindingVerifyResult,
  type MlCal1RawRatingRow as BindingRawRatingRow,
} from './ml-cal-1-lifecycle-binding';
import {
  buildRatingFingerprint as captureBuildRatingFingerprint,
  exportRatingInput as captureExportRatingInput,
  qualifyLifecycleReceipt,
  type MlCal1ExportedRatingInput,
  type MlCal1LifecycleMode,
  type MlCal1LifecycleVerificationResult,
  type MlCal1RawRatingRow as CaptureRawRatingRow,
  type MlCal1TrustedAcceptanceRecord,
} from './ml-cal-1-capture';

export const ML_CAL_1_CAPTURE_BINDING_INTEGRATION_SCHEMA =
  'ml-cal-1-capture-binding-integration-g2-v1' as const;

const HEX64 = /^[0-9a-f]{64}$/;

export interface MlCal1CaptureBundleFingerprintInputs {
  /**
   * Exact field from capture planner output / sealed inputs:
   * `bundle.inputs.ratingFingerprint`.
   * Never confuse with sha256(inputs.json member bytes).
   */
  ratingFingerprint: string;
  /**
   * The ratingsByTeamId map actually used to build forecasts in the capture
   * plan (exportRatingInput → map → buildRatingFingerprint).
   */
  ratingsByTeamId: Record<string, MlCal1ExportedRatingInput>;
}

export interface MlCal1CaptureBindingIntegrationInput {
  /** Passthrough to accepted binding verifier (external anchors required). */
  binding: MlCal1LifecycleBindingVerifyInput;
  /**
   * Capture planner fingerprint identity (§5).
   * Recomputation uses ratingsByTeamId; declared field must match.
   */
  captureInputs: MlCal1CaptureBundleFingerprintInputs;
  /**
   * Capture authoritative as-of (`T_capture` = snapshotReferenceTime).
   * When missing, fixture provenance is retained and liveAccepted forced false.
   */
  captureSnapshotReferenceTime?: string | null;
  /**
   * Independently reviewed trust record. approvedReceiptDigest must be supplied
   * externally — never assigned from adapted.pinnedReceiptDigest inside this helper.
   */
  trustedAcceptance: MlCal1TrustedAcceptanceRecord | null;
  /** Capture runner SHA — not required equal to lifecycle or observer SHAs. */
  captureProducerSha: string;
  lifecycleMode: MlCal1LifecycleMode;
  expectedSeason: number;
  prospectiveWeek: number;
  /** Optional independently reviewed digest of derived envelope coreBytes. */
  approvedDerivedCoreDigest?: string | null;
}

export interface MlCal1ProducerIdentities {
  lifecycleProducerSha: string | null;
  bindingObserverSha: string | null;
  captureProducerSha: string;
}

export interface MlCal1CaptureBindingIntegrationResult {
  schemaVersion: typeof ML_CAL_1_CAPTURE_BINDING_INTEGRATION_SCHEMA;
  ok: boolean;
  reasons: string[];
  notes: string[];
  binding: MlCal1LifecycleBindingVerifyResult;
  adapted: {
    receiptBytes: string;
    pinnedReceiptDigest: string;
    claims: {
      sourceSha: string;
      completedThroughWeek: number;
      selectedPolicy: string;
      canonicalWeight: number;
      season?: number;
      acceptedImmutable: boolean;
      ratingFingerprint: string;
      receiptDigest: string;
    };
  } | null;
  derivedEnvelope: MlCal1LifecycleBindingDerivedReceiptEnvelopeV1 | null;
  fingerprints: {
    captureRecomputed: string | null;
    declaredBundleInputs: string | null;
    binding: string | null;
    registryPin: string | null;
    adaptedClaim: string | null;
    qualifierExpectation: string | null;
  };
  lineage: {
    checkedThroughTime: string | null;
    bindingSnapshotReferenceTime: string | null;
    observationEndTime: string | null;
    captureSnapshotReferenceTime: string | null;
    requiredThroughTime: string | null;
    coversCaptureAsOf: boolean | null;
  };
  producers: MlCal1ProducerIdentities;
  fixtureProvenanceRetained: boolean;
  /**
   * Always false for G2 fixture paths. Never set true by copying computed digests
   * or by ignoring fixture provenance.
   */
  liveAccepted: boolean;
  lifecycle: MlCal1LifecycleVerificationResult | null;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function maxIso(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    const ms = parseIsoMs(v);
    if (ms == null) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = v as string;
    }
  }
  return best;
}

function parseSidecar(
  sidecarBytes: string
): MlCal1LifecycleBindingSidecarV1 | null {
  try {
    const parsed = JSON.parse(sidecarBytes) as MlCal1LifecycleBindingSidecarV1;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseAttestationCheckedThrough(
  lineageAttestationBytes: string | null | undefined
): string | null {
  if (typeof lineageAttestationBytes !== 'string' || !lineageAttestationBytes) {
    return null;
  }
  try {
    const parsed = JSON.parse(lineageAttestationBytes) as {
      checkedThroughTime?: unknown;
    };
    return typeof parsed.checkedThroughTime === 'string'
      ? parsed.checkedThroughTime
      : null;
  } catch {
    return null;
  }
}

/**
 * Recompute ratingFingerprint from the capture planner's ratingsByTeamId map
 * using the accepted capture buildRatingFingerprint. Does not hash inputs.json.
 */
export function recomputeCaptureRatingFingerprintFromPlannerMap(
  ratingsByTeamId: Record<string, MlCal1ExportedRatingInput>
): string {
  return captureBuildRatingFingerprint(ratingsByTeamId);
}

/**
 * Build a capture-compatible ratingsByTeamId from binding observed rows via
 * the accepted capture exportRatingInput path (same semantic as planner).
 */
export function buildCaptureRatingsByTeamIdFromObservedRows(
  rows: MlCal1BindingObservedRatingRow[]
): Record<string, MlCal1ExportedRatingInput> {
  const out: Record<string, MlCal1ExportedRatingInput> = {};
  for (const row of rows) {
    const raw = reconstructRawRatingRow(row) as CaptureRawRatingRow;
    const exported = captureExportRatingInput(raw);
    if (out[row.teamId]) {
      out[row.teamId] = {
        ...exported,
        inputUsable: false,
        unavailableReasons: uniq([
          ...exported.unavailableReasons,
          'duplicate_v1_rating_rows',
        ]),
      };
      continue;
    }
    out[row.teamId] = exported;
  }
  return out;
}

/**
 * Parity probe: binding vs capture exportRatingInput / buildRatingFingerprint
 * on identical reconstructed rows. Used by G2 tests; not a production wire.
 */
export function compareBindingAndCaptureFingerprintParity(
  rows: MlCal1BindingObservedRatingRow[]
): {
  bindingFingerprint: string;
  captureFingerprint: string;
  equal: boolean;
} {
  const bindingMap: Record<string, ReturnType<typeof bindingExportRatingInput>> =
    {};
  const captureMap: Record<string, MlCal1ExportedRatingInput> = {};
  for (const row of rows) {
    const bindingRaw = reconstructRawRatingRow(row) as BindingRawRatingRow;
    bindingMap[row.teamId] = bindingExportRatingInput(bindingRaw);
    captureMap[row.teamId] = captureExportRatingInput(
      reconstructRawRatingRow(row) as CaptureRawRatingRow
    );
  }
  const bindingFingerprint = bindingBuildRatingFingerprint(bindingMap);
  const captureFingerprint = captureBuildRatingFingerprint(captureMap);
  return {
    bindingFingerprint,
    captureFingerprint,
    equal: bindingFingerprint === captureFingerprint,
  };
}

function missingApprovalAnchors(
  binding: MlCal1LifecycleBindingVerifyInput
): string[] {
  const missing: string[] = [];
  if (
    binding.approvedRegistryDocumentDigest == null ||
    binding.approvedRegistryDocumentDigest === ''
  ) {
    missing.push('registry_approval_anchor_missing');
  }
  if (
    binding.registryDocumentBytes == null ||
    binding.registryDocumentBytes === ''
  ) {
    missing.push('registry_document_bytes_missing');
  }
  if (binding.registryPin == null) {
    missing.push('registry_pin_missing');
  }
  if (
    binding.lineageAttestationBytes == null ||
    binding.lineageAttestationBytes === ''
  ) {
    missing.push('lineage_attestation_bytes_missing');
  }
  if (
    binding.approvedLineageAttestationDigest == null ||
    binding.approvedLineageAttestationDigest === ''
  ) {
    missing.push('lineage_attestation_approval_anchor_missing');
  }
  if (
    binding.approvedLineageInventorySha256 == null ||
    binding.approvedLineageInventorySha256 === ''
  ) {
    missing.push('lineage_inventory_approval_anchor_missing');
  }
  return missing;
}

/**
 * Offline G2 orchestration (design §4.2 / §8 / §9 compare-only trust).
 */
export function verifyBindingThenQualifyCaptureLifecycle(
  input: MlCal1CaptureBindingIntegrationInput
): MlCal1CaptureBindingIntegrationResult {
  const reasons: string[] = [];
  const notes: string[] = [];

  const finish = (partial: {
    binding: MlCal1LifecycleBindingVerifyResult;
    adapted: MlCal1CaptureBindingIntegrationResult['adapted'];
    derivedEnvelope: MlCal1LifecycleBindingDerivedReceiptEnvelopeV1 | null;
    fingerprints: MlCal1CaptureBindingIntegrationResult['fingerprints'];
    lineage: MlCal1CaptureBindingIntegrationResult['lineage'];
    producers: MlCal1ProducerIdentities;
    fixtureProvenanceRetained: boolean;
    lifecycle: MlCal1LifecycleVerificationResult | null;
    liveAccepted: boolean;
    ok: boolean;
  }): MlCal1CaptureBindingIntegrationResult => {
    // G2 invariant: fixture / offline orchestration never exports portable liveAccepted.
    const fixtureRetained =
      partial.fixtureProvenanceRetained ||
      input.lifecycleMode === 'fixture_hypothetical' ||
      Boolean(partial.binding.fixtureProvenanceRetained);
    const liveAccepted = false;
    if (partial.liveAccepted && fixtureRetained) {
      notes.push('g2_fixture_provenance_forces_liveAccepted_false');
    } else if (partial.liveAccepted) {
      // Even if capture qualifier said liveAccepted, G2 helper does not authorize
      // portable live acceptance (no live wiring; holdings).
      notes.push('g2_offline_helper_never_exports_liveAccepted');
    }
    return {
      schemaVersion: ML_CAL_1_CAPTURE_BINDING_INTEGRATION_SCHEMA,
      ok: partial.ok && reasons.length === 0,
      reasons: uniq(reasons),
      notes: uniq([...partial.binding.notes, ...notes]),
      binding: partial.binding,
      adapted: partial.adapted,
      derivedEnvelope: partial.derivedEnvelope,
      fingerprints: partial.fingerprints,
      lineage: partial.lineage,
      producers: partial.producers,
      fixtureProvenanceRetained: fixtureRetained,
      liveAccepted,
      lifecycle: partial.lifecycle,
    };
  };

  const emptyFingerprints = {
    captureRecomputed: null,
    declaredBundleInputs: null,
    binding: null,
    registryPin: null,
    adaptedClaim: null,
    qualifierExpectation: null,
  };
  const emptyLineage = {
    checkedThroughTime: null,
    bindingSnapshotReferenceTime: null,
    observationEndTime: null,
    captureSnapshotReferenceTime:
      input.captureSnapshotReferenceTime ?? null,
    requiredThroughTime: null,
    coversCaptureAsOf: null,
  };

  const anchorGaps = missingApprovalAnchors(input.binding);
  if (anchorGaps.length > 0) {
    reasons.push(...anchorGaps);
  }

  const bindingResult = verifyLifecycleBindingSidecar(input.binding);
  reasons.push(...bindingResult.reasons.map((r) => `binding:${r}`));

  const sidecar = parseSidecar(input.binding.sidecarBytes);
  const lifecycleProducerSha =
    sidecar?.acceptedArchive.lifecycleProducerSha ??
    input.binding.expectedLifecycleProducerSha ??
    null;
  const bindingObserverSha =
    sidecar?.bindingObservation.bindingObserverSha ?? null;
  const producers: MlCal1ProducerIdentities = {
    lifecycleProducerSha,
    bindingObserverSha,
    captureProducerSha: input.captureProducerSha,
  };

  const bindingSnap =
    sidecar?.bindingObservation.bindingSnapshotReferenceTime ?? null;
  const obsEnd = sidecar?.bindingObservation.observationEndTime ?? null;
  const checkedThrough = parseAttestationCheckedThrough(
    input.binding.lineageAttestationBytes
  );
  const tCapture = input.captureSnapshotReferenceTime ?? null;

  let fixtureProvenanceRetained =
    bindingResult.fixtureProvenanceRetained ||
    input.lifecycleMode === 'fixture_hypothetical';

  if (tCapture == null || String(tCapture).trim() === '') {
    fixtureProvenanceRetained = true;
    reasons.push('capture_snapshot_reference_time_missing');
    notes.push('missing_capture_time_retains_fixture_provenance');
  }

  const requiredThrough = maxIso(bindingSnap, obsEnd, tCapture);
  let coversCaptureAsOf: boolean | null = null;
  if (tCapture != null && String(tCapture).trim() !== '') {
    const checkedMs = parseIsoMs(checkedThrough);
    const requiredMs = parseIsoMs(requiredThrough);
    if (checkedMs == null || requiredMs == null) {
      coversCaptureAsOf = false;
      reasons.push('lineage_does_not_cover_capture');
    } else if (checkedMs < requiredMs) {
      coversCaptureAsOf = false;
      reasons.push('lineage_does_not_cover_capture');
      reasons.push('lineage_checked_through_too_early');
    } else {
      coversCaptureAsOf = true;
    }
  }

  const lineage = {
    checkedThroughTime: checkedThrough,
    bindingSnapshotReferenceTime: bindingSnap,
    observationEndTime: obsEnd,
    captureSnapshotReferenceTime: tCapture,
    requiredThroughTime: requiredThrough,
    coversCaptureAsOf,
  };

  if (
    !bindingResult.structuralConsistencyVerified ||
    !bindingResult.archiveIntegrityVerified ||
    !bindingResult.plannedNumericAgreementOk
  ) {
    return finish({
      binding: bindingResult,
      adapted: null,
      derivedEnvelope: null,
      fingerprints: {
        ...emptyFingerprints,
        binding: bindingResult.ratingFingerprint,
        registryPin: input.binding.registryPin?.approvedRatingFingerprint ?? null,
        declaredBundleInputs: input.captureInputs.ratingFingerprint,
      },
      lineage,
      producers,
      fixtureProvenanceRetained,
      lifecycle: null,
      liveAccepted: false,
      ok: false,
    });
  }

  if (!sidecar || !bindingResult.report || !bindingResult.sidecarDigest) {
    reasons.push('binding_sidecar_or_report_unavailable');
    return finish({
      binding: bindingResult,
      adapted: null,
      derivedEnvelope: null,
      fingerprints: {
        ...emptyFingerprints,
        binding: bindingResult.ratingFingerprint,
        declaredBundleInputs: input.captureInputs.ratingFingerprint,
      },
      lineage,
      producers,
      fixtureProvenanceRetained,
      lifecycle: null,
      liveAccepted: false,
      ok: false,
    });
  }

  if (!bindingResult.ratingFingerprint) {
    reasons.push('binding_rating_fingerprint_missing');
  }

  // §5: recompute from planner-used ratingsByTeamId (capture path).
  let captureRecomputed: string | null = null;
  try {
    captureRecomputed = recomputeCaptureRatingFingerprintFromPlannerMap(
      input.captureInputs.ratingsByTeamId
    );
  } catch {
    reasons.push('capture_fingerprint_recompute_failed');
  }

  const declared = input.captureInputs.ratingFingerprint;
  if (typeof declared !== 'string' || !HEX64.test(declared)) {
    reasons.push('bundle_inputs_ratingFingerprint_invalid');
  }
  if (
    captureRecomputed != null &&
    declared !== captureRecomputed
  ) {
    reasons.push('fingerprint_mismatch_vs_capture_export');
  }
  if (
    bindingResult.ratingFingerprint != null &&
    captureRecomputed != null &&
    bindingResult.ratingFingerprint !== captureRecomputed
  ) {
    reasons.push('fingerprint_mismatch_vs_binding');
  }
  const pinFp = input.binding.registryPin?.approvedRatingFingerprint ?? null;
  if (pinFp != null && captureRecomputed != null && pinFp !== captureRecomputed) {
    reasons.push('fingerprint_mismatch_vs_registry_pin');
  }

  const report = bindingResult.report;
  const lineageDigest =
    typeof input.binding.lineageAttestationBytes === 'string'
      ? sha256Utf8Bytes(input.binding.lineageAttestationBytes)
      : '';

  let derivedEnvelope: MlCal1LifecycleBindingDerivedReceiptEnvelopeV1 | null =
    null;
  let adapted: MlCal1CaptureBindingIntegrationResult['adapted'] = null;

  try {
    const core = buildDerivedReceiptCore({
      zipSha256: sidecar.acceptedArchive.github.zipSha256,
      reportMemberSha256: sidecar.acceptedArchive.github.reportMemberSha256,
      reportByteCount: sidecar.acceptedArchive.github.reportByteCount,
      lifecycleProducerSha: sidecar.acceptedArchive.lifecycleProducerSha,
      githubRunId: sidecar.acceptedArchive.github.workflowRunId,
      githubArtifactId: sidecar.acceptedArchive.github.artifactId,
      sidecarDigest: bindingResult.sidecarDigest,
      captureClaim: {
        sourceSha: sidecar.acceptedArchive.lifecycleProducerSha,
        completedThroughWeek: report.completedThroughWeek,
        selectedPolicy: report.selectedPolicy,
        canonicalWeight: report.canonicalWeight,
        season: report.season,
        acceptedImmutable: true,
        ratingFingerprint:
          captureRecomputed ?? bindingResult.ratingFingerprint ?? '',
      },
      bindingObserverSha: sidecar.bindingObservation.bindingObserverSha,
      lineageAttestationDigest: lineageDigest,
      lineageCheckedThroughTime: checkedThrough ?? '',
    });
    derivedEnvelope = buildDerivedReceiptEnvelope(core);

    if (
      input.approvedDerivedCoreDigest != null &&
      input.approvedDerivedCoreDigest !== ''
    ) {
      if (derivedEnvelope.coreDigest !== input.approvedDerivedCoreDigest) {
        reasons.push('derived_core_approval_digest_mismatch');
      }
    }

    adapted = adaptDerivedReceiptToCaptureLifecycleInput(derivedEnvelope);
  } catch (err) {
    reasons.push(
      `derived_receipt_build_failed:${
        err instanceof Error ? err.message : 'unknown'
      }`
    );
  }

  const adaptedClaimFp = adapted?.claims.ratingFingerprint ?? null;
  if (
    adaptedClaimFp != null &&
    captureRecomputed != null &&
    adaptedClaimFp !== captureRecomputed
  ) {
    reasons.push('fingerprint_mismatch_vs_adapted_claim');
  }

  // §4 step 8–9: compare only — never assign approvedReceiptDigest from adapted.
  const trust = input.trustedAcceptance;
  if (!trust) {
    reasons.push('trusted_acceptance_missing');
  } else {
    if (
      typeof trust.approvedReceiptDigest !== 'string' ||
      !HEX64.test(trust.approvedReceiptDigest)
    ) {
      reasons.push('trusted_acceptance_approvedReceiptDigest_invalid');
    } else if (adapted) {
      if (trust.approvedReceiptDigest !== adapted.pinnedReceiptDigest) {
        reasons.push('receipt_approval_digest_mismatch');
      }
      if (trust.ratingFingerprint !== adapted.claims.ratingFingerprint) {
        reasons.push('trusted_acceptance_fingerprint_mismatch');
      }
      if (
        captureRecomputed != null &&
        trust.ratingFingerprint !== captureRecomputed
      ) {
        reasons.push('trusted_acceptance_fingerprint_vs_capture_export');
      }
    }
  }

  const fingerprints = {
    captureRecomputed,
    declaredBundleInputs: declared,
    binding: bindingResult.ratingFingerprint,
    registryPin: pinFp,
    adaptedClaim: adaptedClaimFp,
    qualifierExpectation: captureRecomputed,
  };

  if (!adapted || !trust) {
    return finish({
      binding: bindingResult,
      adapted,
      derivedEnvelope,
      fingerprints,
      lineage,
      producers,
      fixtureProvenanceRetained,
      lifecycle: null,
      liveAccepted: false,
      ok: false,
    });
  }

  // Capture-specific lineage must pass before final qualification when T_capture set.
  if (coversCaptureAsOf === false) {
    return finish({
      binding: bindingResult,
      adapted,
      derivedEnvelope,
      fingerprints,
      lineage,
      producers,
      fixtureProvenanceRetained,
      lifecycle: null,
      liveAccepted: false,
      ok: false,
    });
  }

  const lifecycle = qualifyLifecycleReceipt({
    mode: input.lifecycleMode,
    receiptBytes: adapted.receiptBytes,
    pinnedReceiptDigest: adapted.pinnedReceiptDigest,
    claims: adapted.claims,
    expectedRatingFingerprint:
      captureRecomputed ?? input.captureInputs.ratingFingerprint,
    captureProducerSha: input.captureProducerSha,
    expectedSeason: input.expectedSeason,
    prospectiveWeek: input.prospectiveWeek,
    // Pass through the independently supplied record — do not mutate approvedReceiptDigest.
    trustedAcceptance: trust,
  });

  if (!lifecycle.qualified) {
    reasons.push(...lifecycle.reasons.map((r) => `lifecycle:${r}`));
  }

  // Producer identity invariant: record separately; never require equality.
  if (
    producers.lifecycleProducerSha &&
    producers.captureProducerSha &&
    producers.lifecycleProducerSha === producers.captureProducerSha
  ) {
    notes.push('producer_shas_happen_to_equal_but_remain_distinct_roles');
  }
  if (
    producers.bindingObserverSha &&
    producers.lifecycleProducerSha &&
    producers.bindingObserverSha === producers.lifecycleProducerSha
  ) {
    notes.push('observer_and_lifecycle_sha_happen_to_equal_but_remain_distinct_roles');
  }

  const integrationOk =
    reasons.length === 0 &&
    lifecycle.qualified &&
    (coversCaptureAsOf === true || tCapture == null);

  // When capture time missing we already pushed a reason — ok stays false.
  return finish({
    binding: bindingResult,
    adapted,
    derivedEnvelope,
    fingerprints,
    lineage,
    producers,
    fixtureProvenanceRetained,
    lifecycle,
    liveAccepted: false,
    ok: integrationOk && coversCaptureAsOf === true,
  });
}
