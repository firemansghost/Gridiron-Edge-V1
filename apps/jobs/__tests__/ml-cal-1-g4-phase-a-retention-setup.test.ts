/**
 * Phase A retention setup — temp-directory validation only (F1–F5).
 * Never hard-codes or mutates the proposed operator destination.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  ML_CAL_1_G4_PHASE_A_COMPLETION_MEMBER,
  ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER,
  ML_CAL_1_G4_PHASE_A_REQUIRED_PROBE_MEMBERS,
  ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL,
  canonicalizePathForCompare,
  evaluatePhaseASetupReceiptForTerminalSuccess,
  g4EvidenceBaseFromOperatorUserRoot,
  invalidateRetainedProbe,
  phaseASetupReceiptFinalEvidencePath,
  phaseASetupReceiptPath,
  requireAbsoluteDestination,
  runG4PhaseARetentionSetup,
  runnerRetainRootFromOperatorUserRoot,
  validateExistingAncestors,
  validatePhaseAFinalEvidenceObject,
  validatePhaseAProvisionalReceiptObject,
  verifyProbePackageMembers,
} from '../lib/ml-cal-1-g4-phase-a-retention-setup';
import {
  mainFromArgv,
  runPhaseARetentionSetupCli,
} from '../run-ml-cal-1-g4-phase-a-retention-setup';

function tmpOperatorDouble(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'g4-phase-a-op-'));
}

function listTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, prefix: string) => {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) out.push(`${rel}@link`);
      else if (st.isDirectory()) {
        out.push(`${rel}/`);
        walk(full, rel);
      } else out.push(rel);
    }
  };
  walk(dir, '');
  return out;
}

function baseInput(
  root: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    enabled: true as unknown,
    confirmSetup: true as unknown,
    mode: 'temp' as const,
    expectedOperatorUserRoot: root,
    actualOperatorUserRoot: root,
    probeId: 'phasea-probe-001',
    handoffId: 'phasea-handoff-001',
    now: () => new Date('2026-10-14T18:00:00.000Z'),
    ...overrides,
  };
}

describe('Phase A path binding', () => {
  it('runner retainRoot is g4 base, not operator user root', () => {
    const user = path.join(os.tmpdir(), 'binding-user-root');
    expect(runnerRetainRootFromOperatorUserRoot(user)).toBe(
      g4EvidenceBaseFromOperatorUserRoot(user)
    );
    expect(
      canonicalizePathForCompare(ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL)
    ).toContain('gridironresearchevidence');
  });
});

describe('opt-in zero effects', () => {
  it('disabled/malformed: zero FS and zero clock', () => {
    let clocks = 0;
    const root = tmpOperatorDouble();
    const before = listTree(root);
    for (const enabled of [false, undefined, 'true', 1] as unknown[]) {
      const r = runG4PhaseARetentionSetup(
        baseInput(root, {
          enabled,
          now: () => {
            clocks += 1;
            return new Date();
          },
        })
      );
      expect(r.ok).toBe(false);
      expect(r.reasons).toContain('phase_a_setup_disabled');
    }
    expect(clocks).toBe(0);
    expect(listTree(root)).toEqual(before);
    expect(runPhaseARetentionSetupCli({}).filesystemMutations).toBe(false);
    expect(mainFromArgv(['--help']).usagePrinted).toBe(true);
  });
});

describe('happy path', () => {
  it('temp setup completes with exclusive verified receipt', () => {
    const root = tmpOperatorDouble();
    const outside = tmpOperatorDouble();
    fs.writeFileSync(path.join(outside, 'SENTINEL.txt'), 'keep\n');
    const beforeOutside = listTree(outside);
    let n = 0;
    const times = [
      '2026-10-14T18:00:00.000Z',
      '2026-10-14T18:00:05.000Z',
    ];
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-happy',
        handoffId: 'phasea-handoff-happy',
        now: () => new Date(times[Math.min(n++, times.length - 1)]!),
      })
    );
    expect(r.ok).toBe(true);
    expect(r.setupCompleted).toBe(true);
    expect(r.liveAccepted).toBe(false);
    expect(r.usabilityChecks.memberDigestVerify).toBe(true);
    expect(r.usabilityChecks.copyAwayManifestVerify).toBe(true);
    expect(r.usabilityChecks.exclusiveReceipt).toBe(true);
    expect(r.usabilityChecks.receiptByteVerify).toBe(true);
    expect(r.usabilityChecks.publicationCompletion).toBe(true);
    expect(r.setupReceiptSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.setupReceiptByteCount).toBeGreaterThan(0);
    const retained = fs.readFileSync(r.setupReceiptPath!);
    expect(retained.length).toBe(r.setupReceiptByteCount);
    const { createHash } = require('crypto') as typeof import('crypto');
    expect(createHash('sha256').update(retained).digest('hex')).toBe(
      r.setupReceiptSha256
    );
    expect(r.receiptPostWriteVerification?.performed).toBe(true);
    expect(r.receiptPostWriteVerification?.byteCountMatch).toBe(true);
    expect(r.receiptPostWriteVerification?.digestMatch).toBe(true);
    expect(r.finalEvidencePath).toBeTruthy();
    expect(
      evaluatePhaseASetupReceiptForTerminalSuccess({
        receiptPath: r.setupReceiptPath!,
        finalEvidencePath: r.finalEvidencePath,
      }).ok
    ).toBe(true);
    expect(listTree(outside)).toEqual(beforeOutside);
  });
});

describe('F1 ancestor validation before mutation', () => {
  it('rejects relative destination with zero FS', () => {
    const rel = requireAbsoluteDestination('relative\\path');
    expect(rel.ok).toBe(false);
    expect(rel).toEqual(
      expect.objectContaining({
        ok: false,
        reason: 'destination_not_absolute',
      })
    );
    const root = tmpOperatorDouble();
    const before = listTree(root);
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        expectedOperatorUserRoot: 'not-absolute',
        actualOperatorUserRoot: 'not-absolute',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes('not_absolute'))).toBe(true);
    expect(listTree(root)).toEqual(before);
  });

  it('symlink ancestor rejected without creating layout', () => {
    const parent = tmpOperatorDouble();
    const outside = tmpOperatorDouble();
    fs.writeFileSync(path.join(outside, 'SENTINEL.txt'), 'keep\n');
    const beforeOutside = listTree(outside);
    const linkName = path.join(parent, 'linked-child');
    let linked = false;
    try {
      fs.symlinkSync(outside, linkName, 'junction');
      linked = true;
    } catch {
      try {
        fs.symlinkSync(outside, linkName, 'dir');
        linked = true;
      } catch {
        linked = false;
      }
    }
    if (!linked) {
      expect(validateExistingAncestors(parent).ok).toBe(true);
      return;
    }
    const dest = path.join(linkName, 'operator-root');
    const anc = validateExistingAncestors(dest);
    expect(anc.ok).toBe(false);
    const r = runG4PhaseARetentionSetup(
      baseInput(dest, {
        expectedOperatorUserRoot: dest,
        actualOperatorUserRoot: dest,
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.startsWith('ancestor_symlink:'))).toBe(
      true
    );
    expect(fs.existsSync(path.join(dest, 'ml-cal-1'))).toBe(false);
    expect(listTree(outside)).toEqual(beforeOutside);
  });
});

describe('F2 exclusive receipt + retained bytes', () => {
  it('refuses overwrite of existing receipt', () => {
    const root = tmpOperatorDouble();
    const first = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-rcpt',
        handoffId: 'phasea-handoff-rcpt',
        now: (() => {
          let i = 0;
          const t = [
            '2026-10-14T18:00:00.000Z',
            '2026-10-14T18:00:01.000Z',
          ];
          return () => new Date(t[Math.min(i++, t.length - 1)]!);
        })(),
      })
    );
    expect(first.ok).toBe(true);
    const second = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-rcpt',
        handoffId: 'phasea-handoff-rcpt-2',
        now: (() => {
          let i = 0;
          const t = [
            '2026-10-14T18:01:00.000Z',
            '2026-10-14T18:01:01.000Z',
          ];
          return () => new Date(t[Math.min(i++, t.length - 1)]!);
        })(),
      })
    );
    expect(second.ok).toBe(false);
    expect(second.reasons).toContain('setup_receipt_exists');
    expect(second.setupCompleted).toBe(false);
  });

  it('successful evidence correspondence: sealed receipt vs post-write verify', () => {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-corr',
        handoffId: 'phasea-handoff-corr',
        now: (() => {
          let i = 0;
          return () =>
            new Date(
              i++ === 0
                ? '2026-10-14T18:00:00.000Z'
                : '2026-10-14T18:00:02.000Z'
            );
        })(),
      })
    );
    expect(r.ok).toBe(true);
    const retained = fs.readFileSync(r.setupReceiptPath!);
    const { createHash } = require('crypto') as typeof import('crypto');
    const retainedSha = createHash('sha256').update(retained).digest('hex');
    expect(retainedSha).toBe(r.setupReceiptSha256);
    expect(retained.length).toBe(r.setupReceiptByteCount);
    expect(r.receiptPostWriteVerification).toEqual(
      expect.objectContaining({
        performed: true,
        byteCountMatch: true,
        digestMatch: true,
        retainedSha256: retainedSha,
        retainedByteCount: retained.length,
        expectedSha256: r.setupReceiptSha256,
        expectedByteCount: r.setupReceiptByteCount,
      })
    );
    const sealed = JSON.parse(retained.toString('utf8')) as {
      usabilityChecks: Record<string, boolean>;
      setupCompleted: boolean;
      provisional: boolean;
      terminalSuccess: boolean;
    };
    // Sealed content is provisional; post-write verify flags stay out of receipt.
    expect(sealed.provisional).toBe(true);
    expect(sealed.setupCompleted).toBe(false);
    expect(sealed.terminalSuccess).toBe(false);
    expect(sealed.usabilityChecks.receiptByteVerify).toBeUndefined();
    expect(sealed.usabilityChecks.exclusiveReceipt).toBeUndefined();
    expect(r.usabilityChecks.receiptByteVerify).toBe(true);
    expect(r.usabilityChecks.exclusiveReceipt).toBe(true);
    expect(r.finalEvidencePath).toBeTruthy();
    expect(r.finalEvidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    const alone = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: r.setupReceiptPath!,
      finalEvidencePath: null,
    });
    expect(alone.ok).toBe(false);
    expect(alone.reasons).toContain('final_evidence_missing');
    const withFinal = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: r.setupReceiptPath!,
      finalEvidencePath: r.finalEvidencePath,
    });
    expect(withFinal.ok).toBe(true);
    expect(withFinal.terminalSuccess).toBe(true);
    expect(withFinal.internallyConsistent).toBe(true);
    expect(withFinal.receiptSha256).toBe(r.setupReceiptSha256);
    expect(withFinal.finalEvidenceSha256).toBe(r.finalEvidenceSha256);
    const anchored = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: r.setupReceiptPath!,
      finalEvidencePath: r.finalEvidencePath,
      externalAnchor: {
        expectedReceiptSha256: r.setupReceiptSha256!,
        expectedFinalEvidenceSha256: r.finalEvidenceSha256!,
      },
    });
    expect(anchored.ok).toBe(true);
    expect(anchored.externallyAnchored).toBe(true);
  });

  it('receipt read failure removes failed receipt; no success claim', () => {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-rread',
        handoffId: 'phasea-handoff-rread',
        injectFailure: 'receipt_verify_read',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.setupCompleted).toBe(false);
    expect(r.reasons.some((x) => x.startsWith('setup_receipt_verify_failed'))).toBe(
      true
    );
    expect(r.usabilityChecks.receiptByteVerify).not.toBe(true);
    expect(r.receiptPostWriteVerification?.digestMatch).not.toBe(true);
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const receiptPath = path.join(
      g4,
      'review-handoff',
      'PHASE_A_SETUP_RECEIPT-phasea-probe-rread.json'
    );
    expect(fs.existsSync(receiptPath)).toBe(false);
  });

  it('receipt hash failure refuses without rewriting sealed content as verified', () => {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-rhash',
        handoffId: 'phasea-handoff-rhash',
        injectFailure: 'receipt_verify_hash',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.setupCompleted).toBe(false);
    expect(r.reasons).toContain('setup_receipt_digest_mismatch');
    expect(r.usabilityChecks.receiptByteVerify).not.toBe(true);
    expect(r.receiptPostWriteVerification?.performed).toBe(true);
    expect(r.receiptPostWriteVerification?.digestMatch).toBe(false);
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const receiptPath = path.join(
      g4,
      'review-handoff',
      'PHASE_A_SETUP_RECEIPT-phasea-probe-rhash.json'
    );
    expect(fs.existsSync(receiptPath)).toBe(false);
  });

  it('verify read failure + removal failure: leftover provisional receipt not terminal', () => {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-rrrm',
        handoffId: 'phasea-handoff-rrrm',
        injectFailure: 'receipt_verify_read_remove_fail',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.setupCompleted).toBe(false);
    expect(r.reasons.some((x) => x.startsWith('setup_receipt_verify_failed'))).toBe(
      true
    );
    expect(r.reasons).toContain(
      'setup_receipt_remove_failed:inject_failure_receipt_remove'
    );
    expect(r.finalEvidencePath).toBeNull();
    expect(r.leftovers.length).toBeGreaterThan(0);
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const receiptPath = phaseASetupReceiptPath(g4, 'phasea-probe-rrrm');
    const finalPath = phaseASetupReceiptFinalEvidencePath(g4, 'phasea-probe-rrrm');
    expect(fs.existsSync(receiptPath)).toBe(true);
    expect(fs.existsSync(finalPath)).toBe(false);
    expect(r.leftovers.map((p) => path.resolve(p))).toContain(
      path.resolve(receiptPath)
    );
    const sealed = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as {
      provisional: boolean;
      setupCompleted: boolean;
      terminalSuccess: boolean;
    };
    expect(sealed.provisional).toBe(true);
    expect(sealed.setupCompleted).toBe(false);
    expect(sealed.terminalSuccess).toBe(false);
    const readback = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath,
      finalEvidencePath: null,
    });
    expect(readback.ok).toBe(false);
    expect(readback.terminalSuccess).toBe(false);
    expect(readback.reasons).toContain('final_evidence_missing');
    expect(r.notes).toContain('retained_readback_rejects_terminal_success');
  });
});

describe('terminal-success evaluator schema hardening', () => {
  function freshSuccessPair() {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-eval',
        handoffId: 'phasea-handoff-eval',
        now: (() => {
          let i = 0;
          return () =>
            new Date(
              i++ === 0
                ? '2026-10-14T18:00:00.000Z'
                : '2026-10-14T18:00:03.000Z'
            );
        })(),
      })
    );
    expect(r.ok).toBe(true);
    const receiptPath = r.setupReceiptPath!;
    const finalPath = r.finalEvidencePath!;
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const finalEv = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
    return { root, r, receiptPath, finalPath, receipt, finalEv };
  }

  function writeMutated(
    dir: string,
    receipt: unknown,
    finalEv: unknown
  ): { receiptPath: string; finalPath: string } {
    const receiptPath = path.join(dir, 'receipt.json');
    const finalPath = path.join(dir, 'final.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
    fs.writeFileSync(finalPath, `${JSON.stringify(finalEv)}\n`);
    // Re-bind digest to mutated receipt bytes when final still claims binding.
    if (
      finalEv &&
      typeof finalEv === 'object' &&
      !Array.isArray(finalEv) &&
      finalEv !== null
    ) {
      const bytes = fs.readFileSync(receiptPath);
      const rebound = {
        ...(finalEv as Record<string, unknown>),
        provisionalReceiptSha256: createHash('sha256')
          .update(bytes)
          .digest('hex'),
        provisionalReceiptByteCount: bytes.length,
      };
      fs.writeFileSync(finalPath, `${JSON.stringify(rebound)}\n`);
    }
    return { receiptPath, finalPath };
  }

  function writePairRaw(
    dir: string,
    receipt: unknown,
    finalEv: unknown
  ): { receiptPath: string; finalPath: string } {
    const receiptPath = path.join(dir, 'receipt.json');
    const finalPath = path.join(dir, 'final.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
    fs.writeFileSync(finalPath, `${JSON.stringify(finalEv)}\n`);
    return { receiptPath, finalPath };
  }

  it('rejects malformed receipt/final roots (null, array, non-object)', () => {
    expect(validatePhaseAProvisionalReceiptObject(null).reasons).toContain(
      'receipt_null'
    );
    expect(validatePhaseAProvisionalReceiptObject([]).reasons).toContain(
      'receipt_array'
    );
    expect(validatePhaseAProvisionalReceiptObject('x').reasons).toContain(
      'receipt_not_object'
    );
    expect(validatePhaseAFinalEvidenceObject(null).reasons).toContain(
      'final_evidence_null'
    );
    expect(validatePhaseAFinalEvidenceObject([]).reasons).toContain(
      'final_evidence_array'
    );
  });

  it('rejects each contradictory receipt field independently', () => {
    const { receipt, finalEv } = freshSuccessPair();
    const cases: Array<[string, (r: Record<string, unknown>) => void, string]> =
      [
        ['provisional', (r) => {
          r.provisional = false;
        }, 'receipt_unexpected_provisional:false'],
        ['setupCompleted', (r) => {
          r.setupCompleted = true;
        }, 'receipt_unexpected_setupCompleted:true'],
        ['terminalSuccess', (r) => {
          r.terminalSuccess = true;
        }, 'receipt_unexpected_terminalSuccess:true'],
        ['publicationComplete', (r) => {
          r.publicationComplete = true;
        }, 'receipt_unexpected_publicationComplete:true'],
        ['liveAccepted', (r) => {
          r.liveAccepted = true;
        }, 'receipt_unexpected_liveAccepted:true'],
        ['approved', (r) => {
          r.approved = true;
        }, 'receipt_unexpected_approved:true'],
        ['deployedPoolerProof', (r) => {
          r.deployedPoolerProof = true;
        }, 'receipt_unexpected_deployedPoolerProof:true'],
        ['probeProvenance', (r) => {
          r.probeProvenance = false;
        }, 'receipt_unexpected_probeProvenance:false'],
        ['provenanceClass', (r) => {
          r.provenanceClass = 'live';
        }, 'receipt_provenance_not_probe'],
        ['designSha256', (r) => {
          r.designSha256 = '0'.repeat(64);
        }, 'receipt_designSha256_pin_mismatch'],
        ['base255Head', (r) => {
          r.base255Head = '0'.repeat(40);
        }, 'receipt_base255Head_pin_mismatch'],
        ['clock', (r) => {
          r.setupStartedAt = '2026-10-14T19:00:00.000Z';
          r.setupEndedAt = '2026-10-14T18:00:00.000Z';
        }, 'receipt_clock_reversed'],
        ['usability', (r) => {
          (r.usabilityChecks as Record<string, unknown>).ownedCleanup = false;
        }, 'receipt_usability_not_true:ownedCleanup'],
        ['missingField', (r) => {
          delete r.probeId;
        }, 'receipt_missing_field:probeId'],
        ['wrongType', (r) => {
          r.probeId = 123 as unknown as string;
        }, 'receipt_wrong_type:probeId'],
      ];
    for (const [label, mut, expected] of cases) {
      const dir = tmpOperatorDouble();
      const mutated = { ...receipt, usabilityChecks: { ...receipt.usabilityChecks } };
      mut(mutated);
      // For clock/correspondence fields that also appear on final, keep final
      // timestamps in sync except when testing receipt clock alone.
      let finalMut = { ...finalEv };
      if (label === 'clock') {
        finalMut = {
          ...finalEv,
          setupStartedAt: mutated.setupStartedAt,
          setupCompletedAt: mutated.setupEndedAt,
        };
      }
      const { receiptPath, finalPath } = writeMutated(dir, mutated, finalMut);
      const ev = evaluatePhaseASetupReceiptForTerminalSuccess({
        receiptPath,
        finalEvidencePath: finalPath,
      });
      expect({ label, reasons: ev.reasons }).toEqual(
        expect.objectContaining({
          label,
          reasons: expect.arrayContaining([expected]),
        })
      );
      expect(ev.ok).toBe(false);
    }
  });

  it('rejects each contradictory final-evidence field independently', () => {
    const { receipt, finalEv } = freshSuccessPair();
    const cases: Array<[string, (f: Record<string, unknown>) => void, string]> =
      [
        ['verificationPassed', (f) => {
          f.verificationPassed = false;
        }, 'final_evidence_unexpected_verificationPassed:false'],
        ['setupCompleted', (f) => {
          f.setupCompleted = false;
        }, 'final_evidence_unexpected_setupCompleted:false'],
        ['terminalSuccess', (f) => {
          f.terminalSuccess = false;
        }, 'final_evidence_unexpected_terminalSuccess:false'],
        ['approved', (f) => {
          f.approved = true;
        }, 'final_evidence_unexpected_approved:true'],
        ['liveAccepted', (f) => {
          f.liveAccepted = true;
        }, 'final_evidence_unexpected_liveAccepted:true'],
        ['deployedPoolerProof', (f) => {
          f.deployedPoolerProof = true;
        }, 'final_evidence_unexpected_deployedPoolerProof:true'],
        ['probeProvenance', (f) => {
          f.probeProvenance = false;
        }, 'final_evidence_unexpected_probeProvenance:false'],
        ['provenanceClass', (f) => {
          f.provenanceClass = 'mock';
        }, 'final_evidence_provenance_not_probe'],
        ['clock', (f) => {
          f.setupStartedAt = '2026-10-14T19:00:00.000Z';
          f.setupCompletedAt = '2026-10-14T18:00:00.000Z';
        }, 'final_evidence_clock_reversed'],
        ['probeId', (f) => {
          f.probeId = 'phasea-probe-other';
        }, 'correspondence_probeId_mismatch'],
        ['handoffId', (f) => {
          f.handoffId = 'phasea-handoff-other';
        }, 'correspondence_handoffId_mismatch'],
        ['missingField', (f) => {
          delete f.provisionalReceiptSha256;
        }, 'final_evidence_missing_field:provisionalReceiptSha256'],
        ['wrongType', (f) => {
          f.provisionalReceiptByteCount = '12' as unknown as number;
        }, 'final_evidence_provisionalReceiptByteCount_invalid'],
      ];
    for (const [label, mut, expected] of cases) {
      const dir = tmpOperatorDouble();
      const mutated = { ...finalEv };
      mut(mutated);
      // Preserve digest binding except when the case deletes/invalidates it.
      const rebindDigest =
        label !== 'missingField' &&
        label !== 'wrongType' &&
        label !== 'probeId' &&
        label !== 'handoffId' &&
        label !== 'clock';
      const paths = rebindDigest
        ? writeMutated(dir, receipt, mutated)
        : writePairRaw(dir, receipt, mutated);
      if (
        label !== 'missingField' &&
        label !== 'wrongType' &&
        (label === 'probeId' || label === 'handoffId' || label === 'clock')
      ) {
        const bytes = fs.readFileSync(paths.receiptPath);
        const rebound = {
          ...mutated,
          provisionalReceiptSha256: createHash('sha256')
            .update(bytes)
            .digest('hex'),
          provisionalReceiptByteCount: bytes.length,
        };
        fs.writeFileSync(paths.finalPath, `${JSON.stringify(rebound)}\n`);
      }
      const ev = evaluatePhaseASetupReceiptForTerminalSuccess({
        receiptPath: paths.receiptPath,
        finalEvidencePath: paths.finalPath,
      });
      expect({ label, reasons: ev.reasons }).toEqual(
        expect.objectContaining({
          label,
          reasons: expect.arrayContaining([expected]),
        })
      );
      expect(ev.ok).toBe(false);
    }
  });

  it('rejects digest binding mismatch and missing/failed final evidence', () => {
    const { receiptPath, finalPath, receipt, finalEv } = freshSuccessPair();
    const alone = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath,
      finalEvidencePath: null,
    });
    expect(alone.reasons).toContain('final_evidence_missing');
    expect(alone.ok).toBe(false);

    const dir = tmpOperatorDouble();
    const broken = {
      ...finalEv,
      provisionalReceiptSha256: 'a'.repeat(64),
      provisionalReceiptByteCount: finalEv.provisionalReceiptByteCount,
    };
    const paths = writePairRaw(dir, receipt, broken);
    const badBind = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: paths.receiptPath,
      finalEvidencePath: paths.finalPath,
    });
    expect(badBind.reasons).toContain('final_evidence_digest_binding_mismatch');
    expect(badBind.ok).toBe(false);

    const failedFinal = {
      ...finalEv,
      verificationPassed: false,
      terminalSuccess: false,
      setupCompleted: false,
    };
    const paths2 = writePairRaw(tmpOperatorDouble(), receipt, failedFinal);
    // rebind digests so gate is verification flags
    const bytes = fs.readFileSync(paths2.receiptPath);
    const rebound = {
      ...failedFinal,
      provisionalReceiptSha256: createHash('sha256').update(bytes).digest('hex'),
      provisionalReceiptByteCount: bytes.length,
    };
    fs.writeFileSync(paths2.finalPath, `${JSON.stringify(rebound)}\n`);
    const failed = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: paths2.receiptPath,
      finalEvidencePath: paths2.finalPath,
    });
    expect(failed.ok).toBe(false);
    expect(failed.reasons).toEqual(
      expect.arrayContaining([
        'final_evidence_unexpected_verificationPassed:false',
      ])
    );
  });

  it('distinguishes internal consistency from external anchoring', () => {
    const { r } = freshSuccessPair();
    const internal = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: r.setupReceiptPath!,
      finalEvidencePath: r.finalEvidencePath,
    });
    expect(internal.ok).toBe(true);
    expect(internal.internallyConsistent).toBe(true);
    expect(internal.externallyAnchored).toBe(false);

    const badAnchor = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: r.setupReceiptPath!,
      finalEvidencePath: r.finalEvidencePath,
      externalAnchor: {
        expectedReceiptSha256: r.setupReceiptSha256!,
        expectedFinalEvidenceSha256: 'b'.repeat(64),
      },
    });
    expect(badAnchor.internallyConsistent).toBe(true);
    expect(badAnchor.externallyAnchored).toBe(false);
    expect(badAnchor.ok).toBe(false);
    expect(badAnchor.reasons).toContain(
      'external_anchor_final_evidence_digest_mismatch'
    );

    const goodAnchor = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: r.setupReceiptPath!,
      finalEvidencePath: r.finalEvidencePath,
      externalAnchor: {
        expectedReceiptSha256: r.setupReceiptSha256!,
        expectedFinalEvidenceSha256: r.finalEvidenceSha256!,
      },
    });
    expect(goodAnchor.ok).toBe(true);
    expect(goodAnchor.externallyAnchored).toBe(true);
  });

  it('combined read/removal failure leftover still fails schema terminal eval', () => {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-eval-rrrm',
        handoffId: 'phasea-handoff-eval-rrrm',
        injectFailure: 'receipt_verify_read_remove_fail',
      })
    );
    expect(r.ok).toBe(false);
    const receiptPath = phaseASetupReceiptPath(
      g4EvidenceBaseFromOperatorUserRoot(root),
      'phasea-probe-eval-rrrm'
    );
    const ev = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath,
      finalEvidencePath: null,
    });
    expect(ev.ok).toBe(false);
    expect(ev.reasons).toContain('final_evidence_missing');
    expect(r.leftovers.map((p) => path.resolve(p))).toContain(
      path.resolve(receiptPath)
    );
  });
});

describe('F3 manifest digest verify (not copy-equality alone)', () => {
  it('verifyProbePackageMembers catches bytecount/digest mismatch', () => {
    const root = tmpOperatorDouble();
    const dir = path.join(root, 'pkg');
    fs.mkdirSync(dir, { recursive: true });
    const member = Buffer.from('{"a":1}\n');
    const digests = {
      'PROBE_MEMBER.json': {
        sha256: '0'.repeat(64),
        byteCount: 999,
      },
    };
    fs.writeFileSync(path.join(dir, 'PROBE_MEMBER.json'), member);
    fs.writeFileSync(path.join(dir, 'PACKAGE_MANIFEST.json'), '{}\n');
    fs.writeFileSync(path.join(dir, 'PACKAGE_MANIFEST.sha256'), `${'a'.repeat(64)}\n`);
    const reasons = verifyProbePackageMembers(dir, digests, 'b'.repeat(64));
    expect(reasons).toEqual(
      expect.arrayContaining([
        'bytecount_mismatch:PROBE_MEMBER.json',
        'digest_mismatch:PROBE_MEMBER.json',
        'manifest_bytes_digest_mismatch',
        'manifest_sha_file_mismatch',
      ])
    );
    expect(ML_CAL_1_G4_PHASE_A_REQUIRED_PROBE_MEMBERS.length).toBe(3);
  });
});

describe('F4 completion / clocks / no contradictory success', () => {
  it('reversed completion clock fails without timestamp substitution', () => {
    const root = tmpOperatorDouble();
    let i = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-rev',
        handoffId: 'phasea-handoff-rev',
        now: () => {
          const stamps = [
            '2026-10-14T18:00:10.000Z',
            '2026-10-14T18:00:00.000Z',
          ];
          return new Date(stamps[Math.min(i++, stamps.length - 1)]!);
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.setupCompleted).toBe(false);
    expect(r.reasons).toContain('completion_clock_reversed');
  });

  it('invalid completion clock fails closed (no start substitution)', () => {
    const root = tmpOperatorDouble();
    let i = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-badclock',
        handoffId: 'phasea-handoff-badclock',
        now: () => {
          i += 1;
          if (i === 1) return new Date('2026-10-14T18:00:00.000Z');
          return new Date(Number.NaN);
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('completion_clock_invalid');
    expect(r.setupCompleted).toBe(false);
  });

  it('after_publish failure invalidates retained probe (no success claim)', () => {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-inj-pub',
        handoffId: 'phasea-handoff-inj-pub',
        injectFailure: 'after_publish',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.setupCompleted).toBe(false);
    expect(r.reasons).toContain('inject_failure_after_publish');
    expect(r.probePackageDir).toBeTruthy();
    expect(
      fs.existsSync(
        path.join(r.probePackageDir!, ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER)
      )
    ).toBe(true);
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(r.probePackageDir!, 'PACKAGE_MANIFEST.json'),
        'utf8'
      )
    );
    expect(manifest.terminalSuccess).toBe(false);
    expect(manifest.publicationComplete).toBe(false);
  });

  it('cleanup failure after completion invalidates survivors; leftovers accurate', () => {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-cleanup',
        handoffId: 'phasea-handoff-cleanup',
        injectFailure: 'after_completion',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.setupCompleted).toBe(false);
    expect(r.reasons).toContain('inject_failure_after_completion');
    expect(r.reasons.some((x) => x.startsWith('owned_cleanup_failed'))).toBe(
      true
    );
    expect(r.leftovers.length).toBeGreaterThan(0);
    expect(r.probePackageDir).toBeTruthy();
    expect(fs.existsSync(r.probePackageDir!)).toBe(true);
    expect(
      fs.existsSync(
        path.join(r.probePackageDir!, ML_CAL_1_G4_PHASE_A_COMPLETION_MEMBER)
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(r.probePackageDir!, ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER)
      )
    ).toBe(true);
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    expect(
      fs.existsSync(
        path.join(
          g4,
          'review-handoff',
          'PHASE_A_SETUP_RECEIPT-phasea-probe-cleanup.json'
        )
      )
    ).toBe(false);
  });

  it('retained failure readback is not independently interpretable as success', () => {
    const root = tmpOperatorDouble();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-readback',
        handoffId: 'phasea-handoff-readback',
        injectFailure: 'after_completion',
      })
    );
    expect(r.setupCompleted).toBe(false);
    const pkg = r.probePackageDir!;
    const completion = JSON.parse(
      fs.readFileSync(
        path.join(pkg, ML_CAL_1_G4_PHASE_A_COMPLETION_MEMBER),
        'utf8'
      )
    );
    const invalidated = JSON.parse(
      fs.readFileSync(
        path.join(pkg, ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER),
        'utf8'
      )
    );
    // Completion may still say true locally; invalidation + result forbid success.
    expect(completion.setupCompleted).toBe(true);
    expect(invalidated.terminalSuccess).toBe(false);
    expect(invalidated.setupCompleted).toBe(false);
    expect(invalidated.publicationComplete).toBe(false);
    const verifyReasons = verifyProbePackageMembers(pkg, {}, '0'.repeat(64));
    expect(verifyReasons).toContain('package_invalidated');
  });

  it('invalidate containment rejection causes zero writes/removals', () => {
    const root = tmpOperatorDouble();
    const outside = tmpOperatorDouble();
    const beforeOutside = listTree(outside);
    const beforeRoot = listTree(root);
    const inv = invalidateRetainedProbe({
      operatorUserRoot: root,
      packageDir: outside,
      probeId: 'phasea-probe-escape',
      reasons: ['containment_probe'],
    });
    expect(inv.ok).toBe(false);
    expect(inv.wroteMarker).toBe(false);
    expect(inv.reasons.some((x) => x.includes('containment') || x.includes('escape') || x.includes('path'))).toBe(
      true
    );
    expect(listTree(outside)).toEqual(beforeOutside);
    expect(listTree(root)).toEqual(beforeRoot);
    expect(
      fs.existsSync(path.join(outside, ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER))
    ).toBe(false);
  });
});

describe('F5 inject write/copy/rename + duplicate claim', () => {
  it('inject stage/rename/copy failures fail closed', () => {
    const root = tmpOperatorDouble();
    for (const injectFailure of [
      'after_stage_write',
      'after_rename',
      'after_copy',
    ] as const) {
      const r = runG4PhaseARetentionSetup(
        baseInput(root, {
          probeId: `phasea-probe-${injectFailure}`,
          handoffId: `phasea-handoff-${injectFailure}`,
          injectFailure,
          now: (() => {
            let i = 0;
            return () =>
              new Date(
                i++ === 0
                  ? '2026-10-14T18:00:00.000Z'
                  : '2026-10-14T18:00:01.000Z'
              );
          })(),
        })
      );
      expect(r.ok).toBe(false);
      expect(r.setupCompleted).toBe(false);
      expect(r.reasons).toContain(`inject_failure_${injectFailure}`);
    }
  });

  it('duplicate claim refuses exclusive publish', () => {
    const root = tmpOperatorDouble();
    // Pre-create claim directory to force EEXIST
    const g4 = path.join(root, 'ml-cal-1', 'g4');
    for (const sub of [
      'preflight',
      'observations',
      'staging',
      'review-handoff',
    ]) {
      fs.mkdirSync(path.join(g4, sub), { recursive: true });
    }
    fs.mkdirSync(path.join(g4, 'staging', '.claim-phasea-probe-dupclaim'));
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-dupclaim',
        handoffId: 'phasea-handoff-dupclaim',
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('publish_claim_exists');
    expect(r.setupCompleted).toBe(false);
  });
});

describe('existing negatives preserved', () => {
  it('refuses proposed operator root in temp mode', () => {
    const r = runG4PhaseARetentionSetup(
      baseInput(ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL, {
        expectedOperatorUserRoot: ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL,
        actualOperatorUserRoot: ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL,
      })
    );
    expect(r.reasons).toContain(
      'proposed_operator_root_forbidden_in_temp_mode'
    );
  });

  it('existing package id refuses overwrite; outside sentinel preserved', () => {
    const root = tmpOperatorDouble();
    const outside = tmpOperatorDouble();
    fs.writeFileSync(path.join(outside, 'SENTINEL.txt'), 'keep\n');
    const beforeOutside = listTree(outside);
    const g4 = path.join(root, 'ml-cal-1', 'g4');
    for (const sub of [
      'preflight',
      'observations',
      'staging',
      'review-handoff',
    ]) {
      fs.mkdirSync(path.join(g4, sub), { recursive: true });
    }
    fs.mkdirSync(path.join(g4, 'preflight', 'phasea-probe-exists'), {
      recursive: true,
    });
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-probe-exists',
        handoffId: 'phasea-handoff-exists',
      })
    );
    expect(r.reasons).toContain('preflight_package_exists');
    expect(listTree(outside)).toEqual(beforeOutside);
  });
});
