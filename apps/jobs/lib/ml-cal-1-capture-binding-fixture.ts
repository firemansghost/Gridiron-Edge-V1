/**
 * G3 fixture-first capture ↔ binding wiring.
 *
 * Calls the accepted G2 orchestrator from the capture planner using the
 * forecast-used ratings map and snapshotReferenceTime. Fixture mode only.
 * A rejected integration leaves lifecycle null and does not call the
 * receipt qualifier as a fallback.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  verifyBindingThenQualifyCaptureLifecycle,
  type MlCal1CaptureBindingIntegrationInput,
  type MlCal1CaptureBindingIntegrationResult,
} from './ml-cal-1-capture-binding-integration';
import {
  planMlCal1Capture,
  type MlCal1FixtureInput,
  type MlCal1PlanOptions,
  type MlCal1PlanResult,
  type MlCal1TrustedAcceptanceRecord,
} from './ml-cal-1-capture';
import type { MlCal1LifecycleBindingVerifyInput } from './ml-cal-1-lifecycle-binding';

export interface MlCal1BindingFixtureRequest {
  binding: MlCal1LifecycleBindingVerifyInput;
  /** Independently supplied. Never assigned from the adapted digest. */
  trustedAcceptance: MlCal1TrustedAcceptanceRecord | null;
  approvedDerivedCoreDigest?: string | null;
}

export interface MlCal1BindingFixturePlanResult extends MlCal1PlanResult {
  bindingIntegration: MlCal1CaptureBindingIntegrationResult | null;
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

  return { ...planned, bindingIntegration };
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
