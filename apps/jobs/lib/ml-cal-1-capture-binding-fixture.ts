/**
 * G3 fixture-first capture ↔ binding wiring.
 *
 * Calls the accepted G2 orchestrator from the capture planner using the
 * forecast-used ratings map and snapshotReferenceTime. Fixture mode only.
 * A rejected integration leaves lifecycle null and does not call the
 * receipt qualifier as a fallback.
 *
 * Successful and rejected captures seal versioned binding-integration
 * evidence as a manifested member for offline audit / correspondence checks.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ML_CAL_1_CAPTURE_BINDING_INTEGRATION_SCHEMA,
  verifyBindingThenQualifyCaptureLifecycle,
  type MlCal1CaptureBindingIntegrationInput,
  type MlCal1CaptureBindingIntegrationResult,
  type MlCal1ProducerIdentities,
} from './ml-cal-1-capture-binding-integration';
import {
  planMlCal1Capture,
  sha256Utf8Bytes,
  type MlCal1ArtifactBundle,
  type MlCal1CaptureEnvelope,
  type MlCal1FixtureInput,
  type MlCal1PlanOptions,
  type MlCal1PlanResult,
  type MlCal1TrustedAcceptanceRecord,
} from './ml-cal-1-capture';
import type { MlCal1LifecycleBindingVerifyInput } from './ml-cal-1-lifecycle-binding';

export const ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA =
  'ml-cal-1-binding-integration-evidence-v1' as const;
export const ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_MEMBER =
  'binding-integration-evidence.json' as const;

export interface MlCal1BindingFixtureRequest {
  binding: MlCal1LifecycleBindingVerifyInput;
  /** Independently supplied. Never assigned from the adapted digest. */
  trustedAcceptance: MlCal1TrustedAcceptanceRecord | null;
  approvedDerivedCoreDigest?: string | null;
}

export interface MlCal1BindingEvidenceBytePin {
  sha256: string;
  byteCount: number;
  /** How a reviewer retrieves the exact bytes for re-hash. */
  retrieval: string;
}

export interface MlCal1BindingIntegrationEvidenceV1 {
  schemaVersion: typeof ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA;
  kind: 'binding-integration-evidence';
  integrationSchemaVersion: typeof ML_CAL_1_CAPTURE_BINDING_INTEGRATION_SCHEMA;
  captureId: string;
  season: number;
  week: number;
  /** Capture authoritative as-of (T_capture). */
  snapshotReferenceTime: string;
  fixtureProvenanceRetained: true;
  liveAccepted: false;
  ok: boolean;
  reasons: string[];
  notes: string[];
  producers: MlCal1ProducerIdentities;
  fingerprints: MlCal1CaptureBindingIntegrationResult['fingerprints'];
  lineage: MlCal1CaptureBindingIntegrationResult['lineage'];
  approvalAnchors: {
    approvedRegistryDocumentDigest: string | null;
    approvedLineageAttestationDigest: string | null;
    approvedLineageInventorySha256: string | null;
    approvedReceiptDigest: string | null;
    approvedDerivedCoreDigest: string | null;
    expectedZipSha256: string;
    expectedReportMemberSha256: string;
    expectedLifecycleProducerSha: string;
    expectedReportMemberPath: string;
  };
  /**
   * Exact verification bytes for small artifacts, plus pinned retrieval
   * references for large ZIP / report member blobs.
   */
  evidenceBytes: {
    zipSha256: string;
    reportMemberSha256: string;
    sidecarSha256: string;
    registryDocumentSha256: string | null;
    lineageAttestationSha256: string | null;
    adaptedReceiptSha256: string | null;
    sidecarUtf8: string;
    registryDocumentUtf8: string | null;
    lineageAttestationUtf8: string | null;
    adaptedReceiptUtf8: string | null;
    zipBytesPin: MlCal1BindingEvidenceBytePin;
    reportMemberBytesPin: MlCal1BindingEvidenceBytePin;
  };
  binding: {
    liveQualifying: boolean;
    fullWeightEligible: boolean;
    archiveIntegrityVerified: boolean;
    fixtureProvenanceRetained: boolean;
    liveAccepted: boolean;
    sidecarDigest: string | null;
    ratingFingerprint: string | null;
    reasons: string[];
    notes: string[];
  };
  adapted: MlCal1CaptureBindingIntegrationResult['adapted'];
  lifecycle: {
    qualified: boolean;
    liveAccepted: boolean;
    mode: string;
    fixtureHypothetical: boolean;
    receiptIntegrityVerified: boolean;
    reasons: string[];
    notes: string[];
    verifiedReceiptDigest: string | null;
    lifecycleSourceSha: string | null;
  } | null;
}

export interface MlCal1BindingFixturePlanResult extends MlCal1PlanResult {
  bindingIntegration: MlCal1CaptureBindingIntegrationResult | null;
  bindingIntegrationEvidence: MlCal1BindingIntegrationEvidenceV1;
}

export function planFixtureCaptureWithBindingIntegration(
  input: MlCal1FixtureInput,
  request: MlCal1BindingFixtureRequest,
  options: Omit<MlCal1PlanOptions, 'resolveLifecycle'> = {}
): MlCal1BindingFixturePlanResult {
  let bindingIntegration: MlCal1CaptureBindingIntegrationResult | null = null;

  const planned = planMlCal1Capture(input, {
    ...options,
    resolveLifecycle: (ctx) => {
      const mode = input.lifecycleMode ?? 'fixture_hypothetical';
      if (mode !== 'fixture_hypothetical') {
        return {
          lifecycle: null,
          blockReasons: ['g3_binding_integration_rejects_live_mode'],
        };
      }
      const integrationInput: MlCal1CaptureBindingIntegrationInput = {
        binding: request.binding,
        captureInputs: {
          ratingFingerprint: ctx.ratingFingerprint,
          ratingsByTeamId: ctx.ratingsByTeamId,
        },
        captureSnapshotReferenceTime: ctx.snapshotReferenceTime,
        trustedAcceptance: request.trustedAcceptance,
        captureProducerSha: input.repositorySha,
        lifecycleMode: 'fixture_hypothetical',
        expectedSeason: input.season,
        prospectiveWeek: input.week,
        approvedDerivedCoreDigest: request.approvedDerivedCoreDigest ?? null,
      };
      bindingIntegration = verifyBindingThenQualifyCaptureLifecycle(integrationInput);
      const rejected =
        !bindingIntegration.ok ||
        bindingIntegration.lifecycle == null ||
        bindingIntegration.liveAccepted ||
        bindingIntegration.lifecycle.liveAccepted;
      if (rejected) {
        return {
          lifecycle: null,
          blockReasons: [
            'binding_integration_lifecycle_null',
            ...bindingIntegration.reasons.map((r) => `binding_integration:${r}`),
          ],
        };
      }
      return { lifecycle: bindingIntegration.lifecycle, blockReasons: [] };
    },
  });

  const envelopeQualified =
    planned.bundle.envelope.lifecycleQualification.qualified === true &&
    planned.bundle.envelope.lifecycleQualification.liveAccepted === false;
  const evidence = buildBindingIntegrationEvidence({
    captureId: planned.bundle.envelope.captureId,
    season: planned.bundle.envelope.season,
    week: planned.bundle.envelope.week,
    snapshotReferenceTime: planned.bundle.envelope.snapshotReferenceTime,
    request,
    bindingIntegration,
    captureProducerSha: input.repositorySha,
    outcomeOk:
      envelopeQualified &&
      bindingIntegration?.ok === true &&
      bindingIntegration.lifecycle != null &&
      !bindingIntegration.liveAccepted &&
      !bindingIntegration.lifecycle.liveAccepted,
    earlyRejectReasons: planned.bundle.envelope.primaryBlockReasons.filter(
      (r) =>
        r.startsWith('g3_binding_integration') ||
        r === 'binding_integration_lifecycle_null' ||
        r.startsWith('binding_integration:')
    ),
  });
  const bundle = attachBindingIntegrationEvidence(planned.bundle, evidence);

  return {
    ...planned,
    bundle,
    bindingIntegration,
    bindingIntegrationEvidence: evidence,
  };
}

export function buildBindingIntegrationEvidence(options: {
  captureId: string;
  season: number;
  week: number;
  snapshotReferenceTime: string;
  request: MlCal1BindingFixtureRequest;
  bindingIntegration: MlCal1CaptureBindingIntegrationResult | null;
  captureProducerSha: string;
  /** Authoritative planner outcome (never invent acceptance from partial orchestrator fields). */
  outcomeOk?: boolean;
  earlyRejectReasons?: string[];
}): MlCal1BindingIntegrationEvidenceV1 {
  const { binding, trustedAcceptance, approvedDerivedCoreDigest } = options.request;
  const zipSha256 = sha256Utf8Bytes(binding.zipBytes);
  const reportMemberBytes = binding.reportMemberBytes ?? Buffer.alloc(0);
  const reportMemberSha256 = sha256Utf8Bytes(reportMemberBytes);
  const sidecarSha256 = sha256Utf8Bytes(binding.sidecarBytes);
  const registryDocumentUtf8 =
    typeof binding.registryDocumentBytes === 'string' ? binding.registryDocumentBytes : null;
  const lineageAttestationUtf8 =
    typeof binding.lineageAttestationBytes === 'string' ? binding.lineageAttestationBytes : null;
  const registryDocumentSha256 = registryDocumentUtf8
    ? sha256Utf8Bytes(registryDocumentUtf8)
    : null;
  const lineageAttestationSha256 = lineageAttestationUtf8
    ? sha256Utf8Bytes(lineageAttestationUtf8)
    : null;

  const integration = options.bindingIntegration;
  const adaptedReceiptUtf8 = integration?.adapted?.receiptBytes ?? null;
  const adaptedReceiptSha256 = adaptedReceiptUtf8
    ? sha256Utf8Bytes(adaptedReceiptUtf8)
    : null;

  const early = options.earlyRejectReasons ?? [];
  const ok =
    options.outcomeOk ??
    (integration?.ok === true &&
      integration.lifecycle != null &&
      !integration.liveAccepted &&
      !integration.lifecycle.liveAccepted);
  const reasons = [
    ...(integration?.reasons ?? []),
    ...early.filter((r) => !(integration?.reasons ?? []).includes(r)),
  ];
  if (!ok && reasons.length === 0) {
    reasons.push('binding_integration_rejected');
  }
  const notes = integration
    ? [...integration.notes]
    : ['binding_integration_not_executed_or_rejected_before_orchestrator'];

  const producers: MlCal1ProducerIdentities = integration?.producers ?? {
    lifecycleProducerSha: binding.expectedLifecycleProducerSha ?? null,
    bindingObserverSha: null,
    captureProducerSha: options.captureProducerSha,
  };

  const bindingSummary = integration?.binding
    ? {
        liveQualifying: integration.binding.liveQualifying,
        fullWeightEligible: integration.binding.fullWeightEligible,
        archiveIntegrityVerified: integration.binding.archiveIntegrityVerified,
        fixtureProvenanceRetained: integration.binding.fixtureProvenanceRetained,
        liveAccepted: integration.binding.liveAccepted,
        sidecarDigest: integration.binding.sidecarDigest,
        ratingFingerprint: integration.binding.ratingFingerprint,
        reasons: [...integration.binding.reasons],
        notes: [...integration.binding.notes],
      }
    : {
        liveQualifying: false,
        fullWeightEligible: false,
        archiveIntegrityVerified: false,
        fixtureProvenanceRetained: true,
        liveAccepted: false,
        sidecarDigest: sidecarSha256,
        ratingFingerprint: null,
        reasons: [...reasons],
        notes: [...notes],
      };

  const lifecycle =
    integration?.lifecycle == null
      ? null
      : {
          qualified: integration.lifecycle.qualified,
          liveAccepted: integration.lifecycle.liveAccepted,
          mode: integration.lifecycle.mode,
          fixtureHypothetical: integration.lifecycle.fixtureHypothetical,
          receiptIntegrityVerified: integration.lifecycle.receiptIntegrityVerified,
          reasons: [...integration.lifecycle.reasons],
          notes: [...integration.lifecycle.notes],
          verifiedReceiptDigest: integration.lifecycle.verifiedReceiptDigest,
          lifecycleSourceSha: integration.lifecycle.lifecycleSourceSha,
        };

  return {
    schemaVersion: ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA,
    kind: 'binding-integration-evidence',
    integrationSchemaVersion: ML_CAL_1_CAPTURE_BINDING_INTEGRATION_SCHEMA,
    captureId: options.captureId,
    season: options.season,
    week: options.week,
    snapshotReferenceTime: options.snapshotReferenceTime,
    fixtureProvenanceRetained: true,
    liveAccepted: false,
    ok,
    reasons,
    notes,
    producers,
    fingerprints: integration?.fingerprints ?? {
      captureRecomputed: null,
      declaredBundleInputs: null,
      binding: null,
      registryPin: null,
      adaptedClaim: null,
      qualifierExpectation: null,
    },
    lineage: integration?.lineage ?? {
      checkedThroughTime: null,
      bindingSnapshotReferenceTime: null,
      observationEndTime: null,
      captureSnapshotReferenceTime: options.snapshotReferenceTime,
      requiredThroughTime: options.snapshotReferenceTime,
      coversCaptureAsOf: null,
    },
    approvalAnchors: {
      approvedRegistryDocumentDigest: binding.approvedRegistryDocumentDigest ?? null,
      approvedLineageAttestationDigest: binding.approvedLineageAttestationDigest ?? null,
      approvedLineageInventorySha256: binding.approvedLineageInventorySha256 ?? null,
      approvedReceiptDigest: trustedAcceptance?.approvedReceiptDigest ?? null,
      approvedDerivedCoreDigest: approvedDerivedCoreDigest ?? null,
      expectedZipSha256: binding.expectedZipSha256,
      expectedReportMemberSha256: binding.expectedReportMemberSha256,
      expectedLifecycleProducerSha: binding.expectedLifecycleProducerSha,
      expectedReportMemberPath: binding.expectedReportMemberPath,
    },
    evidenceBytes: {
      zipSha256,
      reportMemberSha256,
      sidecarSha256,
      registryDocumentSha256,
      lineageAttestationSha256,
      adaptedReceiptSha256,
      sidecarUtf8: binding.sidecarBytes,
      registryDocumentUtf8,
      lineageAttestationUtf8,
      adaptedReceiptUtf8,
      zipBytesPin: {
        sha256: zipSha256,
        byteCount: binding.zipBytes.byteLength,
        retrieval: 'binding-fixture-package:archive.zip',
      },
      reportMemberBytesPin: {
        sha256: reportMemberSha256,
        byteCount: reportMemberBytes.byteLength,
        retrieval: `binding-fixture-package:${binding.expectedReportMemberPath}`,
      },
    },
    binding: bindingSummary,
    adapted: integration?.adapted ?? null,
    lifecycle,
  };
}

/** Stamp envelope audit marker and attach manifested evidence member payload. */
export function attachBindingIntegrationEvidence(
  bundle: MlCal1ArtifactBundle,
  evidence: MlCal1BindingIntegrationEvidenceV1
): MlCal1ArtifactBundle {
  const next: MlCal1ArtifactBundle = {
    ...bundle,
    envelope: {
      ...bundle.envelope,
      bindingIntegrationAudit: {
        schemaVersion: ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA,
        used: true,
        evidenceMember: ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_MEMBER,
        outcome: evidence.ok ? 'accepted' : 'rejected',
      },
    },
    bindingIntegrationEvidence: evidence as unknown as Record<string, unknown>,
  };
  return next;
}

/**
 * Fail-closed correspondence + embedded-byte integrity checks.
 * Throws on missing/tampered/mismatched evidence when the capture claims
 * binding-integration audit use.
 */
export function assertBindingIntegrationEvidenceCorrespondence(options: {
  envelope: MlCal1CaptureEnvelope;
  ratingFingerprint: string;
  evidence: MlCal1BindingIntegrationEvidenceV1 | null | undefined;
}): void {
  const audit = options.envelope.bindingIntegrationAudit;
  const used = audit?.used === true;
  if (!used && options.evidence == null) return;
  if (used && options.evidence == null) {
    throw new Error('binding_integration_evidence_missing');
  }
  if (!used && options.evidence != null) {
    throw new Error('binding_integration_evidence_unexpected_without_audit');
  }
  const evidence = options.evidence!;
  if (evidence.schemaVersion !== ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA) {
    throw new Error('binding_integration_evidence_schema_mismatch');
  }
  if (evidence.kind !== 'binding-integration-evidence') {
    throw new Error('binding_integration_evidence_kind_invalid');
  }
  if (audit?.evidenceMember !== ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_MEMBER) {
    throw new Error('binding_integration_evidence_member_name_mismatch');
  }
  if (audit?.schemaVersion !== ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA) {
    throw new Error('binding_integration_audit_schema_mismatch');
  }
  if ((audit?.outcome === 'accepted') !== evidence.ok) {
    throw new Error('binding_integration_audit_outcome_mismatch');
  }
  if (evidence.captureId !== options.envelope.captureId) {
    throw new Error('binding_integration_evidence_capture_id_mismatch');
  }
  if (evidence.season !== options.envelope.season || evidence.week !== options.envelope.week) {
    throw new Error('binding_integration_evidence_season_week_mismatch');
  }
  if (evidence.snapshotReferenceTime !== options.envelope.snapshotReferenceTime) {
    throw new Error('binding_integration_evidence_as_of_mismatch');
  }
  if (evidence.producers.captureProducerSha !== options.envelope.producerRepositorySha) {
    throw new Error('binding_integration_evidence_capture_producer_mismatch');
  }
  if (evidence.liveAccepted !== false || evidence.fixtureProvenanceRetained !== true) {
    throw new Error('binding_integration_evidence_fixture_provenance_violation');
  }
  if (options.envelope.lifecycleQualification.liveAccepted !== false) {
    throw new Error('binding_integration_evidence_envelope_live_accepted_violation');
  }

  // Embedded byte integrity (exact verification bytes).
  const eb = evidence.evidenceBytes;
  if (sha256Utf8Bytes(eb.sidecarUtf8) !== eb.sidecarSha256) {
    throw new Error('binding_integration_evidence_sidecar_bytes_digest_mismatch');
  }
  if (eb.registryDocumentUtf8 != null) {
    if (sha256Utf8Bytes(eb.registryDocumentUtf8) !== eb.registryDocumentSha256) {
      throw new Error('binding_integration_evidence_registry_bytes_digest_mismatch');
    }
  } else if (eb.registryDocumentSha256 != null) {
    throw new Error('binding_integration_evidence_registry_bytes_missing');
  }
  if (eb.lineageAttestationUtf8 != null) {
    if (sha256Utf8Bytes(eb.lineageAttestationUtf8) !== eb.lineageAttestationSha256) {
      throw new Error('binding_integration_evidence_lineage_bytes_digest_mismatch');
    }
  } else if (eb.lineageAttestationSha256 != null) {
    throw new Error('binding_integration_evidence_lineage_bytes_missing');
  }
  if (eb.adaptedReceiptUtf8 != null) {
    if (sha256Utf8Bytes(eb.adaptedReceiptUtf8) !== eb.adaptedReceiptSha256) {
      throw new Error('binding_integration_evidence_adapted_receipt_bytes_digest_mismatch');
    }
  } else if (eb.adaptedReceiptSha256 != null) {
    throw new Error('binding_integration_evidence_adapted_receipt_bytes_missing');
  }
  if (eb.zipBytesPin.sha256 !== eb.zipSha256 || eb.zipBytesPin.byteCount < 1) {
    throw new Error('binding_integration_evidence_zip_pin_invalid');
  }
  if (
    eb.reportMemberBytesPin.sha256 !== eb.reportMemberSha256 ||
    eb.reportMemberBytesPin.byteCount < 1
  ) {
    throw new Error('binding_integration_evidence_report_pin_invalid');
  }
  if (eb.sidecarSha256 !== evidence.binding.sidecarDigest && evidence.binding.sidecarDigest != null) {
    throw new Error('binding_integration_evidence_sidecar_digest_disagreement');
  }

  // Approval anchor pins must agree with embedded digests when present.
  const anchors = evidence.approvalAnchors;
  if (
    anchors.approvedRegistryDocumentDigest != null &&
    eb.registryDocumentSha256 != null &&
    anchors.approvedRegistryDocumentDigest !== eb.registryDocumentSha256
  ) {
    throw new Error('binding_integration_evidence_registry_anchor_mismatch');
  }
  if (
    anchors.approvedLineageAttestationDigest != null &&
    eb.lineageAttestationSha256 != null &&
    anchors.approvedLineageAttestationDigest !== eb.lineageAttestationSha256
  ) {
    throw new Error('binding_integration_evidence_lineage_anchor_mismatch');
  }
  if (anchors.expectedZipSha256 !== eb.zipSha256) {
    throw new Error('binding_integration_evidence_zip_anchor_mismatch');
  }
  if (anchors.expectedReportMemberSha256 !== eb.reportMemberSha256) {
    throw new Error('binding_integration_evidence_report_anchor_mismatch');
  }

  // Fingerprint correspondence to sealed inputs.
  // Declared bundle inputs must always match the sealed member when recorded.
  // Recomputed may intentionally disagree on rejected captures (retained as audit).
  if (
    evidence.fingerprints.declaredBundleInputs != null &&
    evidence.fingerprints.declaredBundleInputs !== options.ratingFingerprint
  ) {
    throw new Error('binding_integration_evidence_fingerprint_inputs_mismatch');
  }

  // Lifecycle correspondence.
  const lq = options.envelope.lifecycleQualification;
  if (evidence.ok) {
    if (!lq.qualified) {
      throw new Error('binding_integration_evidence_ok_but_envelope_unqualified');
    }
    if (evidence.lifecycle == null || !evidence.lifecycle.qualified) {
      throw new Error('binding_integration_evidence_ok_but_nested_lifecycle_unqualified');
    }
    if (evidence.lifecycle.liveAccepted) {
      throw new Error('binding_integration_evidence_nested_live_accepted_violation');
    }
    if (
      evidence.fingerprints.captureRecomputed != null &&
      evidence.fingerprints.captureRecomputed !== options.ratingFingerprint
    ) {
      throw new Error('binding_integration_evidence_fingerprint_recomputed_mismatch');
    }
    if (
      evidence.producers.lifecycleProducerSha == null ||
      evidence.producers.bindingObserverSha == null
    ) {
      throw new Error('binding_integration_evidence_producer_identities_incomplete');
    }
    if (options.envelope.lifecycleSourceSha !== evidence.producers.lifecycleProducerSha) {
      throw new Error('binding_integration_evidence_lifecycle_source_sha_mismatch');
    }
  } else {
    if (lq.qualified) {
      throw new Error('binding_integration_evidence_rejected_but_envelope_qualified');
    }
    if (evidence.lifecycle != null && evidence.lifecycle.qualified) {
      throw new Error('binding_integration_evidence_rejected_but_nested_lifecycle_qualified');
    }
  }
}

export interface MlCal1BindingFixtureAnchors {
  expectedZipSha256: string;
  expectedReportMemberSha256: string;
  expectedLifecycleProducerSha: string;
  expectedReportMemberPath: string;
  prospectiveTargetWeek: number;
  nowCeiling: string;
  approvedRegistryDocumentDigest: string;
  approvedLineageAttestationDigest: string;
  approvedLineageInventorySha256: string;
  approvedDerivedCoreDigest?: string | null;
  reportMemberFile: string;
}

/** Load separately supplied fixture bytes. Does not invent approval digests. */
export function loadBindingFixturePackage(dir: string): MlCal1BindingFixtureRequest {
  const anchors = JSON.parse(
    fs.readFileSync(path.join(dir, 'anchors.json'), 'utf8')
  ) as MlCal1BindingFixtureAnchors;
  const registryPin = JSON.parse(
    fs.readFileSync(path.join(dir, 'registry-pin.json'), 'utf8')
  ) as MlCal1LifecycleBindingVerifyInput['registryPin'];
  const trustedAcceptance = JSON.parse(
    fs.readFileSync(path.join(dir, 'trusted-acceptance.json'), 'utf8')
  ) as MlCal1TrustedAcceptanceRecord;
  return {
    approvedDerivedCoreDigest: anchors.approvedDerivedCoreDigest ?? null,
    trustedAcceptance,
    binding: {
      zipBytes: fs.readFileSync(path.join(dir, 'archive.zip')),
      reportMemberBytes: fs.readFileSync(path.join(dir, anchors.reportMemberFile)),
      sidecarBytes: fs.readFileSync(path.join(dir, 'sidecar.json'), 'utf8'),
      prospectiveTargetWeek: anchors.prospectiveTargetWeek,
      expectedZipSha256: anchors.expectedZipSha256,
      expectedReportMemberSha256: anchors.expectedReportMemberSha256,
      expectedLifecycleProducerSha: anchors.expectedLifecycleProducerSha,
      expectedReportMemberPath: anchors.expectedReportMemberPath,
      lineageAttestationBytes: fs.readFileSync(
        path.join(dir, 'lineage-attestation.json'),
        'utf8'
      ),
      approvedLineageAttestationDigest: anchors.approvedLineageAttestationDigest,
      approvedLineageInventorySha256: anchors.approvedLineageInventorySha256,
      registryPin,
      registryDocumentBytes: fs.readFileSync(
        path.join(dir, 'registry-document.json'),
        'utf8'
      ),
      approvedRegistryDocumentDigest: anchors.approvedRegistryDocumentDigest,
      nowCeiling: anchors.nowCeiling,
    },
  };
}

/** Materialize a binding fixture package directory for CLI regressions. */
export function writeBindingFixturePackage(
  dir: string,
  request: MlCal1BindingFixtureRequest,
  options?: { reportMemberFile?: string }
): void {
  fs.mkdirSync(dir, { recursive: true });
  const reportMemberFile =
    options?.reportMemberFile ??
    path.basename(request.binding.expectedReportMemberPath);
  const reportBytes =
    request.binding.reportMemberBytes ??
    Buffer.from('', 'utf8');
  fs.writeFileSync(path.join(dir, 'archive.zip'), request.binding.zipBytes);
  fs.writeFileSync(path.join(dir, reportMemberFile), reportBytes);
  fs.writeFileSync(path.join(dir, 'sidecar.json'), request.binding.sidecarBytes, 'utf8');
  if (request.binding.lineageAttestationBytes == null) {
    throw new Error('write_binding_fixture_requires_lineage_attestation');
  }
  fs.writeFileSync(
    path.join(dir, 'lineage-attestation.json'),
    request.binding.lineageAttestationBytes,
    'utf8'
  );
  if (request.binding.registryDocumentBytes == null || request.binding.registryPin == null) {
    throw new Error('write_binding_fixture_requires_registry');
  }
  fs.writeFileSync(
    path.join(dir, 'registry-document.json'),
    request.binding.registryDocumentBytes,
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'registry-pin.json'),
    `${JSON.stringify(request.binding.registryPin, null, 2)}\n`,
    'utf8'
  );
  if (request.trustedAcceptance == null) {
    throw new Error('write_binding_fixture_requires_trusted_acceptance');
  }
  fs.writeFileSync(
    path.join(dir, 'trusted-acceptance.json'),
    `${JSON.stringify(request.trustedAcceptance, null, 2)}\n`,
    'utf8'
  );
  const anchors: MlCal1BindingFixtureAnchors = {
    expectedZipSha256: request.binding.expectedZipSha256,
    expectedReportMemberSha256: request.binding.expectedReportMemberSha256,
    expectedLifecycleProducerSha: request.binding.expectedLifecycleProducerSha,
    expectedReportMemberPath: request.binding.expectedReportMemberPath,
    prospectiveTargetWeek: request.binding.prospectiveTargetWeek,
    nowCeiling: request.binding.nowCeiling,
    approvedRegistryDocumentDigest: request.binding.approvedRegistryDocumentDigest as string,
    approvedLineageAttestationDigest: request.binding.approvedLineageAttestationDigest as string,
    approvedLineageInventorySha256: request.binding.approvedLineageInventorySha256 as string,
    approvedDerivedCoreDigest: request.approvedDerivedCoreDigest ?? null,
    reportMemberFile,
  };
  fs.writeFileSync(
    path.join(dir, 'anchors.json'),
    `${JSON.stringify(anchors, null, 2)}\n`,
    'utf8'
  );
}
