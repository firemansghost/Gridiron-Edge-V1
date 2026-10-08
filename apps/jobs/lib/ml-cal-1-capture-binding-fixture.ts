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
  ML_CAL_1_BINDING_ARCHIVE_EMBEDDED_RETRIEVAL,
  ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_MEMBER,
  ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA,
  ML_CAL_1_BINDING_REPORT_EMBEDDED_RETRIEVAL,
  assertBindingIntegrationEvidenceCorrespondence,
  planMlCal1Capture,
  readCaptureTerminalResult,
  resolveEmbeddedBindingArchiveBytes,
  sha256Utf8Bytes,
  type MlCal1ArtifactBundle,
  type MlCal1ExportedRatingInput,
  type MlCal1CaptureEnvelope,
  type MlCal1FixtureInput,
  type MlCal1PlanOptions,
  type MlCal1PlanResult,
  type MlCal1TerminalReadOptions,
  type MlCal1TerminalReadResult,
  type MlCal1TrustedAcceptanceRecord,
} from './ml-cal-1-capture';
import type { MlCal1LifecycleBindingVerifyInput } from './ml-cal-1-lifecycle-binding';

export {
  ML_CAL_1_BINDING_ARCHIVE_EMBEDDED_RETRIEVAL,
  ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_MEMBER,
  ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA,
  ML_CAL_1_BINDING_REPORT_EMBEDDED_RETRIEVAL,
  assertBindingIntegrationEvidenceCorrespondence,
  resolveEmbeddedBindingArchiveBytes,
};

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
   * Exact verification bytes retained in the manifested evidence member.
   * Archive/report use embedded base64 with declared digests so a copied
   * sealed package remains independently verifiable without the original
   * temporary binding-fixture directory.
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
    /** Exact ZIP bytes (base64) for offline archive replay. */
    zipBytesBase64: string;
    /** Exact report member bytes (base64) for offline archive replay. */
    reportMemberBytesBase64: string;
    /** Exact registry pin JSON retained for verifier replay. */
    registryPinUtf8: string | null;
    registryPinSha256: string | null;
    /** Verifier controls required to rebuild binding verify input. */
    prospectiveTargetWeek: number;
    nowCeiling: string;
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
  /**
   * Complete separately supplied trust / orchestration context required to
   * replay accepted G2 verification. Approval digests are retained as supplied
   * — never generated from computed receipt bytes.
   */
  replay: {
    trustedAcceptance: MlCal1TrustedAcceptanceRecord | null;
    approvedDerivedCoreDigest: string | null;
    captureProducerSha: string;
    lifecycleMode: 'fixture_hypothetical';
    expectedSeason: number;
    prospectiveWeek: number;
  };
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
  const registryPinUtf8 =
    binding.registryPin != null ? `${JSON.stringify(binding.registryPin)}\n` : null;
  const registryDocumentSha256 = registryDocumentUtf8
    ? sha256Utf8Bytes(registryDocumentUtf8)
    : null;
  const lineageAttestationSha256 = lineageAttestationUtf8
    ? sha256Utf8Bytes(lineageAttestationUtf8)
    : null;
  const registryPinSha256 = registryPinUtf8 ? sha256Utf8Bytes(registryPinUtf8) : null;

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
      zipBytesBase64: binding.zipBytes.toString('base64'),
      reportMemberBytesBase64: reportMemberBytes.toString('base64'),
      registryPinUtf8,
      registryPinSha256,
      prospectiveTargetWeek: binding.prospectiveTargetWeek,
      nowCeiling: binding.nowCeiling,
      zipBytesPin: {
        sha256: zipSha256,
        byteCount: binding.zipBytes.byteLength,
        retrieval: ML_CAL_1_BINDING_ARCHIVE_EMBEDDED_RETRIEVAL,
      },
      reportMemberBytesPin: {
        sha256: reportMemberSha256,
        byteCount: reportMemberBytes.byteLength,
        retrieval: ML_CAL_1_BINDING_REPORT_EMBEDDED_RETRIEVAL,
      },
    },
    binding: bindingSummary,
    adapted: integration?.adapted ?? null,
    lifecycle,
    replay: {
      trustedAcceptance: trustedAcceptance
        ? {
            approvedReceiptDigest: trustedAcceptance.approvedReceiptDigest,
            season: trustedAcceptance.season,
            selectedPolicy: trustedAcceptance.selectedPolicy,
            completedThroughWeek: trustedAcceptance.completedThroughWeek,
            canonicalWeight: trustedAcceptance.canonicalWeight,
            ratingFingerprint: trustedAcceptance.ratingFingerprint,
            lifecycleSourceSha: trustedAcceptance.lifecycleSourceSha,
          }
        : null,
      approvedDerivedCoreDigest: approvedDerivedCoreDigest ?? null,
      captureProducerSha: options.captureProducerSha,
      lifecycleMode: 'fixture_hypothetical',
      expectedSeason: options.season,
      prospectiveWeek: options.week,
    },
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

/**
 * Full accepted binding/G2 replay against retained evidence + sealed capture
 * inputs. Reuses verifyBindingThenQualifyCaptureLifecycle — not a partial
 * checklist. Stored evidence.ok / envelope.qualified are never treated as proof.
 */
export function evaluateBindingEvidenceAcceptance(options: {
  envelope: MlCal1CaptureEnvelope;
  ratingsByTeamId: Record<string, MlCal1ExportedRatingInput>;
  ratingFingerprint: string;
  evidence: Record<string, unknown> | null | undefined;
}): {
  accepted: boolean;
  reasons: string[];
  replay: MlCal1CaptureBindingIntegrationResult | null;
} {
  if (options.evidence == null) {
    return {
      accepted: false,
      reasons: ['binding_integration_evidence_missing'],
      replay: null,
    };
  }
  if (options.envelope.bindingIntegrationAudit?.used !== true) {
    return {
      accepted: false,
      reasons: ['binding_integration_audit_not_used'],
      replay: null,
    };
  }
  const evidence = options.evidence as unknown as MlCal1BindingIntegrationEvidenceV1;
  if (evidence.schemaVersion !== ML_CAL_1_BINDING_INTEGRATION_EVIDENCE_SCHEMA) {
    return {
      accepted: false,
      reasons: ['binding_integration_evidence_unknown_schema'],
      replay: null,
    };
  }
  if (evidence.kind !== 'binding-integration-evidence') {
    return {
      accepted: false,
      reasons: ['binding_integration_evidence_kind_invalid'],
      replay: null,
    };
  }
  if (evidence.integrationSchemaVersion !== ML_CAL_1_CAPTURE_BINDING_INTEGRATION_SCHEMA) {
    return {
      accepted: false,
      reasons: ['binding_integration_unknown_integration_schema'],
      replay: null,
    };
  }
  if (evidence.liveAccepted !== false || evidence.fixtureProvenanceRetained !== true) {
    return {
      accepted: false,
      reasons: ['binding_integration_evidence_fixture_provenance_violation'],
      replay: null,
    };
  }
  if (options.envelope.lifecycleQualification.liveAccepted !== false) {
    return {
      accepted: false,
      reasons: ['envelope_live_accepted_violation'],
      replay: null,
    };
  }
  if (
    evidence.captureId !== options.envelope.captureId ||
    evidence.season !== options.envelope.season ||
    evidence.week !== options.envelope.week ||
    evidence.snapshotReferenceTime !== options.envelope.snapshotReferenceTime
  ) {
    return {
      accepted: false,
      reasons: ['binding_integration_evidence_scope_mismatch'],
      replay: null,
    };
  }

  const replayCtx = evidence.replay;
  if (
    replayCtx == null ||
    typeof replayCtx !== 'object' ||
    replayCtx.lifecycleMode !== 'fixture_hypothetical' ||
    typeof replayCtx.captureProducerSha !== 'string' ||
    typeof replayCtx.expectedSeason !== 'number' ||
    typeof replayCtx.prospectiveWeek !== 'number'
  ) {
    return {
      accepted: false,
      reasons: ['binding_integration_replay_context_missing'],
      replay: null,
    };
  }
  if (replayCtx.captureProducerSha !== options.envelope.producerRepositorySha) {
    return {
      accepted: false,
      reasons: ['binding_integration_replay_capture_producer_mismatch'],
      replay: null,
    };
  }
  if (replayCtx.trustedAcceptance == null) {
    return {
      accepted: false,
      reasons: ['binding_integration_trusted_acceptance_missing'],
      replay: null,
    };
  }
  // Approval digest must remain the separately retained anchor — compared, not minted.
  if (
    evidence.approvalAnchors?.approvedReceiptDigest == null ||
    replayCtx.trustedAcceptance.approvedReceiptDigest !==
      evidence.approvalAnchors.approvedReceiptDigest
  ) {
    return {
      accepted: false,
      reasons: ['binding_integration_trusted_acceptance_anchor_mismatch'],
      replay: null,
    };
  }

  let bindingInput: MlCal1LifecycleBindingVerifyInput;
  try {
    bindingInput = buildBindingVerifyInputFromSealedEvidence(evidence);
  } catch (err) {
    return {
      accepted: false,
      reasons: [
        err instanceof Error
          ? err.message
          : 'binding_integration_verifier_input_rebuild_failed',
      ],
      replay: null,
    };
  }

  const integrationInput: MlCal1CaptureBindingIntegrationInput = {
    binding: bindingInput,
    captureInputs: {
      ratingFingerprint: options.ratingFingerprint,
      ratingsByTeamId: options.ratingsByTeamId,
    },
    captureSnapshotReferenceTime: options.envelope.snapshotReferenceTime,
    trustedAcceptance: replayCtx.trustedAcceptance,
    captureProducerSha: replayCtx.captureProducerSha,
    lifecycleMode: 'fixture_hypothetical',
    expectedSeason: replayCtx.expectedSeason,
    prospectiveWeek: replayCtx.prospectiveWeek,
    approvedDerivedCoreDigest: replayCtx.approvedDerivedCoreDigest ?? null,
  };

  let result: MlCal1CaptureBindingIntegrationResult;
  try {
    result = verifyBindingThenQualifyCaptureLifecycle(integrationInput);
  } catch (err) {
    return {
      accepted: false,
      reasons: [
        err instanceof Error ? err.message : 'binding_integration_replay_threw',
      ],
      replay: null,
    };
  }

  const accepted =
    result.ok === true &&
    result.lifecycle != null &&
    result.lifecycle.qualified === true &&
    result.liveAccepted === false &&
    result.lifecycle.liveAccepted === false &&
    result.fixtureProvenanceRetained === true &&
    options.envelope.lifecycleQualification.liveAccepted === false;

  const reasons = accepted
    ? []
    : Array.from(
        new Set([
          ...result.reasons,
          ...(result.lifecycle == null ? ['binding_integration_lifecycle_null'] : []),
          ...(result.ok ? [] : ['binding_integration_replay_not_ok']),
        ])
      );

  return { accepted, reasons, replay: result };
}

/** Reader entry that always supplies the authoritative G2 replay evaluator. */
export function readCaptureTerminalResultWithBindingReplay(
  options: Omit<MlCal1TerminalReadOptions, 'evaluateBindingEvidence'>
): MlCal1TerminalReadResult {
  return readCaptureTerminalResult({
    ...options,
    evaluateBindingEvidence: evaluateBindingEvidenceAcceptance,
  });
}

/**
 * Rebuild verifier inputs solely from sealed evidence bytes (copy-away replay).
 * External approval anchors come from evidence.approvalAnchors — never from
 * recomputing a self-hash and treating it as approved.
 */
export function buildBindingVerifyInputFromSealedEvidence(
  evidence: MlCal1BindingIntegrationEvidenceV1
): MlCal1LifecycleBindingVerifyInput {
  const eb = evidence.evidenceBytes;
  const { zipBytes, reportMemberBytes } = resolveEmbeddedBindingArchiveBytes(
    eb as unknown as Record<string, any>
  );
  const anchors = evidence.approvalAnchors;
  if (
    anchors.approvedRegistryDocumentDigest == null ||
    anchors.approvedLineageAttestationDigest == null ||
    anchors.approvedLineageInventorySha256 == null ||
    eb.registryDocumentUtf8 == null ||
    eb.lineageAttestationUtf8 == null ||
    eb.registryPinUtf8 == null
  ) {
    throw new Error('sealed_evidence_missing_verifier_inputs');
  }
  if (
    eb.registryPinSha256 != null &&
    sha256Utf8Bytes(eb.registryPinUtf8) !== eb.registryPinSha256
  ) {
    throw new Error('sealed_evidence_registry_pin_digest_mismatch');
  }
  let registryPin: MlCal1LifecycleBindingVerifyInput['registryPin'];
  try {
    registryPin = JSON.parse(eb.registryPinUtf8) as NonNullable<
      MlCal1LifecycleBindingVerifyInput['registryPin']
    >;
  } catch {
    throw new Error('sealed_evidence_registry_pin_unparseable');
  }
  return {
    zipBytes,
    reportMemberBytes,
    sidecarBytes: eb.sidecarUtf8,
    prospectiveTargetWeek: eb.prospectiveTargetWeek,
    expectedZipSha256: anchors.expectedZipSha256,
    expectedReportMemberSha256: anchors.expectedReportMemberSha256,
    expectedLifecycleProducerSha: anchors.expectedLifecycleProducerSha,
    expectedReportMemberPath: anchors.expectedReportMemberPath,
    lineageAttestationBytes: eb.lineageAttestationUtf8,
    approvedLineageAttestationDigest: anchors.approvedLineageAttestationDigest,
    approvedLineageInventorySha256: anchors.approvedLineageInventorySha256,
    registryPin,
    registryDocumentBytes: eb.registryDocumentUtf8,
    approvedRegistryDocumentDigest: anchors.approvedRegistryDocumentDigest,
    nowCeiling: eb.nowCeiling,
  };
}
