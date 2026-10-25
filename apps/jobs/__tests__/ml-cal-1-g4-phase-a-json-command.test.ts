/**
 * Phase A JSON command surfaces — temp-directory validation only.
 * Never hard-codes or mutates the proposed operator destination.
 */

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  mainPhaseAJsonCommandFromArgv,
  parsePhaseAJsonCommandArgv,
  runPhaseAJsonCommand,
  validateCapturePath,
  type PhaseAJsonCommandDeps,
} from '../lib/ml-cal-1-g4-phase-a-json-command';
import { mainFromArgv } from '../run-ml-cal-1-g4-phase-a-json-command';
import {
  ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL,
  g4EvidenceBaseFromOperatorUserRoot,
  phaseASetupReceiptFinalEvidencePath,
  phaseASetupReceiptPath,
  runG4PhaseARetentionSetup,
} from '../lib/ml-cal-1-g4-phase-a-retention-setup';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ENTRY = path.join(
  ROOT,
  'apps',
  'jobs',
  'run-ml-cal-1-g4-phase-a-json-command.ts'
);

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
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

function fileDigestMap(dir: string): Record<string, { bytes: number; sha256: string }> {
  const out: Record<string, { bytes: number; sha256: string }> = {};
  const walk = (d: string, prefix: string) => {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full, rel);
      else {
        const buf = fs.readFileSync(full);
        out[rel] = {
          bytes: buf.length,
          sha256: createHash('sha256').update(buf).digest('hex'),
        };
      }
    }
  };
  walk(dir, '');
  return out;
}

function snapshotEvidence(userRoot: string): string {
  const g4 = g4EvidenceBaseFromOperatorUserRoot(userRoot);
  return JSON.stringify({
    tree: listTree(userRoot),
    digests: fileDigestMap(userRoot),
    g4Exists: fs.existsSync(g4),
  });
}

describe('parsePhaseAJsonCommandArgv', () => {
  it('rejects unknown, duplicate, and conflicting flags without implying FS', () => {
    expect(parsePhaseAJsonCommandArgv(['--foo=bar']).ok).toBe(false);
    const dup = parsePhaseAJsonCommandArgv([
      '--command=setup',
      '--command=evaluate',
    ]);
    expect(dup.ok).toBe(false);
    if (dup.ok === false) {
      expect(dup.reasons).toContain('duplicate_flag:command');
    }
    const r = parsePhaseAJsonCommandArgv([
      '--command=setup',
      '--enabled=true',
      '--confirm-setup=true',
      '--mode=temp',
      '--destination=C:\\x',
      '--expected-destination=C:\\x',
      '--probe-id=probe-a',
      '--handoff-id=handoff-a',
      '--json-stdout=true',
      '--receipt-path=C:\\r.json',
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reasons.some((x) => x.startsWith('conflicting_flag_for_setup'))).toBe(
        true
      );
    }
  });

  it('requires exact booleans and output choice', () => {
    const r = parsePhaseAJsonCommandArgv([
      '--command=setup',
      '--enabled=yes',
      '--confirm-setup=true',
      '--mode=temp',
      '--destination=C:\\x',
      '--expected-destination=C:\\x',
      '--probe-id=probe-a',
      '--handoff-id=handoff-a',
    ]);
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reasons).toEqual(
        expect.arrayContaining([
          'enabled_exact_true_required',
          'output_choice_required_json_stdout_and_or_json_capture_file',
        ])
      );
    }
  });
});

describe('setup JSON capture (temp only)', () => {
  it('valid setup output matches retained receipt/final bytes; exactly one setup call', () => {
    const userRoot = tmpDir('g4-json-setup-ok-');
    const captureDir = tmpDir('g4-json-cap-');
    const captureFile = path.join(captureDir, 'setup-result.json');
    let setupCalls = 0;
    const deps: PhaseAJsonCommandDeps = {
      runSetup: (input) => {
        setupCalls += 1;
        return runG4PhaseARetentionSetup(input);
      },
      now: () => new Date('2026-10-15T14:00:00.000Z'),
    };
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-probe-001',
        handoffId: 'phasea-json-handoff-001',
        output: { stdout: false, captureFile },
      },
      deps
    );
    expect(setupCalls).toBe(1);
    expect(result.exitCode).toBe(0);
    expect(result.envelope.ok).toBe(true); // in-memory after verified output
    expect(result.envelope.operationOk).toBe(true);
    expect(result.envelope.setupSucceeded).toBe(true);
    expect(result.envelope.setupInvoked).toBe(true);
    expect(result.envelope.setup?.ok).toBe(true);
    expect(result.envelope.setup?.liveAccepted).toBe(false);
    expect(result.envelope.setup?.approved).toBe(false);
    expect(result.envelope.setup?.deployedPoolerProof).toBe(false);

    const receiptPath = result.envelope.setup!.setupReceiptPath!;
    const finalPath = result.envelope.setup!.finalEvidencePath!;
    const receiptBytes = fs.readFileSync(receiptPath);
    const finalBytes = fs.readFileSync(finalPath);
    expect(result.envelope.setup!.setupReceiptSha256).toBe(
      createHash('sha256').update(receiptBytes).digest('hex')
    );
    expect(result.envelope.setup!.setupReceiptByteCount).toBe(
      receiptBytes.length
    );
    expect(result.envelope.setup!.finalEvidenceSha256).toBe(
      createHash('sha256').update(finalBytes).digest('hex')
    );
    expect(result.envelope.setup!.finalEvidenceByteCount).toBe(
      finalBytes.length
    );

    const captured = fs.readFileSync(captureFile, 'utf8');
    const parsed = JSON.parse(captured);
    expect(parsed.kind).toBe('ml-cal-1-g4-phase-a-json-command-v1');
    // F3: durable payload must not claim command/output success
    expect(parsed.ok).toBe(false);
    expect(parsed.outputOk).toBe(false);
    expect(parsed.operationOk).toBe(true);
    expect(parsed.setup.setupReceiptSha256).toBe(
      result.envelope.setup!.setupReceiptSha256
    );
    expect(parsed.setup.finalEvidenceByteCount).toBe(finalBytes.length);
  });

  it('disabled/malformed: no setup, no capture reservation, no destination mutation', () => {
    const userRoot = tmpDir('g4-json-disabled-');
    const captureDir = tmpDir('g4-json-cap-dis-');
    const captureFile = path.join(captureDir, 'should-not-exist.json');
    const before = listTree(userRoot);
    let setupCalls = 0;
    const result = mainPhaseAJsonCommandFromArgv(
      [
        '--command=setup',
        '--enabled=false',
        '--confirm-setup=true',
        '--mode=temp',
        `--destination=${userRoot}`,
        `--expected-destination=${userRoot}`,
        '--probe-id=phasea-json-probe-002',
        '--handoff-id=phasea-json-handoff-002',
        `--json-capture-file=${captureFile}`,
      ],
      {
        runSetup: (input) => {
          setupCalls += 1;
          return runG4PhaseARetentionSetup(input);
        },
      }
    );
    expect(setupCalls).toBe(0);
    expect(result.exitCode).toBe(1);
    expect(result.envelope.setupInvoked).toBe(false);
    expect(fs.existsSync(captureFile)).toBe(false);
    expect(listTree(userRoot)).toEqual(before);
  });

  it('capture collision / missing parent / inside user root: setup never invoked; sentinel untouched', () => {
    const userRoot = tmpDir('g4-json-coll-');
    const captureDir = tmpDir('g4-json-cap-coll-');
    const existing = path.join(captureDir, 'exists.json');
    fs.writeFileSync(existing, 'SENTINEL_BYTES_DO_NOT_TOUCH', 'utf8');
    let setupCalls = 0;
    const deps: PhaseAJsonCommandDeps = {
      runSetup: (input) => {
        setupCalls += 1;
        return runG4PhaseARetentionSetup(input);
      },
    };

    const collision = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-probe-003',
        handoffId: 'phasea-json-handoff-003',
        output: { stdout: false, captureFile: existing },
      },
      deps
    );
    expect(setupCalls).toBe(0);
    expect(collision.envelope.reasons).toContain('capture_path_exists');
    expect(fs.readFileSync(existing, 'utf8')).toBe('SENTINEL_BYTES_DO_NOT_TOUCH');

    const missingParent = path.join(captureDir, 'no-such-dir', 'x.json');
    const miss = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-probe-004',
        handoffId: 'phasea-json-handoff-004',
        output: { stdout: false, captureFile: missingParent },
      },
      deps
    );
    expect(setupCalls).toBe(0);
    expect(miss.envelope.reasons).toContain('capture_parent_missing');

    const inside = path.join(userRoot, 'capture-inside.json');
    // parent userRoot may not exist yet — create it as empty dir without g4 layout
    fs.mkdirSync(userRoot, { recursive: true });
    const insideR = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-probe-005',
        handoffId: 'phasea-json-handoff-005',
        output: { stdout: false, captureFile: inside },
      },
      deps
    );
    expect(setupCalls).toBe(0);
    expect(insideR.envelope.reasons).toContain(
      'capture_inside_operator_user_root'
    );
    expect(fs.existsSync(inside)).toBe(false);
  });

  it('distinguishes successful setup from failed capture without retry', () => {
    const userRoot = tmpDir('g4-json-capfail-');
    const captureDir = tmpDir('g4-json-capfail-out-');
    const captureFile = path.join(captureDir, 'out.json');
    let setupCalls = 0;
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-probe-006',
        handoffId: 'phasea-json-handoff-006',
        output: { stdout: false, captureFile },
      },
      {
        runSetup: (input) => {
          setupCalls += 1;
          return runG4PhaseARetentionSetup(input);
        },
        now: () => new Date('2026-10-15T14:05:00.000Z'),
        injectAfterSetupBeforeCaptureWrite: true,
      }
    );
    expect(setupCalls).toBe(1);
    expect(result.envelope.setupSucceeded).toBe(true);
    expect(result.envelope.operationOk).toBe(true);
    expect(result.envelope.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.envelope.reasons).toContain(
      'inject_failure_after_setup_before_capture_write'
    );
    expect(result.jsonText).toBeTruthy();
    const fallback = result.stderrLines.join('\n');
    expect(fallback).toMatch(/"ok": false/);
    expect(fallback).toMatch(/"outputOk": false/);
    expect(result.envelope.setup?.setupReceiptPath).toBeTruthy();
    expect(fs.existsSync(result.envelope.setup!.setupReceiptPath!)).toBe(true);
  });

  it('setup refusal preserves reasons/leftovers in JSON; never success', () => {
    const userRoot = tmpDir('g4-json-refuse-');
    const captureDir = tmpDir('g4-json-refuse-cap-');
    const captureFile = path.join(captureDir, 'refuse.json');
    // First succeed, second reuse same IDs → refuse
    const first = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-probe-007',
        handoffId: 'phasea-json-handoff-007',
        output: { stdout: false, captureFile },
      },
      { now: () => new Date('2026-10-15T14:10:00.000Z') }
    );
    expect(first.exitCode).toBe(0);
    const capture2 = path.join(captureDir, 'refuse2.json');
    const second = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-probe-007',
        handoffId: 'phasea-json-handoff-007',
        output: { stdout: false, captureFile: capture2 },
      },
      { now: () => new Date('2026-10-15T14:11:00.000Z') }
    );
    expect(second.exitCode).toBe(1);
    expect(second.envelope.ok).toBe(false);
    expect(second.envelope.setupSucceeded).toBe(false);
    expect(second.envelope.setup?.reasons.length).toBeGreaterThan(0);
    expect(second.jsonText).toBeTruthy();
    // Capture channel succeeded with failure payload → stderr may be empty.
    const parsed = JSON.parse(fs.readFileSync(capture2, 'utf8'));
    expect(parsed.ok).toBe(false);
    expect(parsed.outputOk).toBe(false);
    expect(parsed.setup.ok).toBe(false);
  });

  it('rejects proposed operator root label in temp mode via setup library', () => {
    const captureDir = tmpDir('g4-json-prop-');
    const captureFile = path.join(captureDir, 'x.json');
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL,
        expectedDestination: ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL,
        probeId: 'phasea-json-probe-008',
        handoffId: 'phasea-json-handoff-008',
        output: { stdout: false, captureFile },
      },
      { now: () => new Date('2026-10-15T14:12:00.000Z') }
    );
    // May fail at absolute path on non-Windows OR at proposed_operator_root_forbidden.
    expect(result.exitCode).toBe(1);
    expect(result.envelope.ok).toBe(false);
  });
});

describe('read-only anchored evaluate', () => {
  function produceEvidence(): {
    userRoot: string;
    receiptPath: string;
    finalPath: string;
    receiptSha: string;
    receiptBytes: number;
    finalSha: string;
    finalBytes: number;
  } {
    const userRoot = tmpDir('g4-json-eval-');
    const setup = runG4PhaseARetentionSetup({
      enabled: true,
      confirmSetup: true,
      mode: 'temp',
      expectedOperatorUserRoot: userRoot,
      actualOperatorUserRoot: userRoot,
      probeId: 'phasea-json-eval-probe',
      handoffId: 'phasea-json-eval-handoff',
      now: () => new Date('2026-10-15T15:00:00.000Z'),
    });
    expect(setup.ok).toBe(true);
    const receiptPath = setup.setupReceiptPath!;
    const finalPath = setup.finalEvidencePath!;
    const rBuf = fs.readFileSync(receiptPath);
    const fBuf = fs.readFileSync(finalPath);
    return {
      userRoot,
      receiptPath,
      finalPath,
      receiptSha: createHash('sha256').update(rBuf).digest('hex'),
      receiptBytes: rBuf.length,
      finalSha: createHash('sha256').update(fBuf).digest('hex'),
      finalBytes: fBuf.length,
    };
  }

  it('valid external pins/counts pass evaluation', () => {
    const ev = produceEvidence();
    const captureDir = tmpDir('g4-json-eval-ok-');
    const captureFile = path.join(captureDir, 'eval.json');
    const before = snapshotEvidence(ev.userRoot);
    let setupCalls = 0;
    const result = runPhaseAJsonCommand(
      {
        command: 'evaluate',
        receiptPath: ev.receiptPath,
        finalEvidencePath: ev.finalPath,
        expectedReceiptSha256: ev.receiptSha,
        expectedReceiptByteCount: ev.receiptBytes,
        expectedFinalEvidenceSha256: ev.finalSha,
        expectedFinalEvidenceByteCount: ev.finalBytes,
        output: { stdout: false, captureFile },
      },
      {
        runSetup: (input) => {
          setupCalls += 1;
          return runG4PhaseARetentionSetup(input);
        },
      }
    );
    expect(setupCalls).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(result.envelope.ok).toBe(true);
    expect(result.envelope.operationOk).toBe(true);
    expect(result.envelope.evaluationSucceeded).toBe(true);
    expect(result.envelope.evaluation?.externallyAnchored).toBe(true);
    expect(result.envelope.evaluation?.terminalSuccess).toBe(true);
    expect(result.envelope.byteCountChecks?.receiptByteCountMatch).toBe(true);
    expect(result.envelope.byteCountChecks?.finalEvidenceByteCountMatch).toBe(
      true
    );
    const durable = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
    expect(durable.ok).toBe(false);
    expect(durable.outputOk).toBe(false);
    expect(durable.operationOk).toBe(true);
    expect(snapshotEvidence(ev.userRoot)).toBe(before);
  });

  it.each([
    ['wrong receipt digest', (ev: ReturnType<typeof produceEvidence>) => ({
      expectedReceiptSha256: 'a'.repeat(64),
      expectedReceiptByteCount: ev.receiptBytes,
      expectedFinalEvidenceSha256: ev.finalSha,
      expectedFinalEvidenceByteCount: ev.finalBytes,
    })],
    ['wrong final digest', (ev: ReturnType<typeof produceEvidence>) => ({
      expectedReceiptSha256: ev.receiptSha,
      expectedReceiptByteCount: ev.receiptBytes,
      expectedFinalEvidenceSha256: 'b'.repeat(64),
      expectedFinalEvidenceByteCount: ev.finalBytes,
    })],
    ['wrong receipt byte count', (ev: ReturnType<typeof produceEvidence>) => ({
      expectedReceiptSha256: ev.receiptSha,
      expectedReceiptByteCount: ev.receiptBytes + 1,
      expectedFinalEvidenceSha256: ev.finalSha,
      expectedFinalEvidenceByteCount: ev.finalBytes,
    })],
    ['wrong final byte count', (ev: ReturnType<typeof produceEvidence>) => ({
      expectedReceiptSha256: ev.receiptSha,
      expectedReceiptByteCount: ev.receiptBytes,
      expectedFinalEvidenceSha256: ev.finalSha,
      expectedFinalEvidenceByteCount: ev.finalBytes + 1,
    })],
  ] as const)('%s fails closed with zero mutation', (_label, overrideFn) => {
    const ev = produceEvidence();
    const before = snapshotEvidence(ev.userRoot);
    const captureDir = tmpDir('g4-json-eval-bad-');
    const captureFile = path.join(captureDir, 'eval-bad.json');
    const o = overrideFn(ev);
    const result = runPhaseAJsonCommand({
      command: 'evaluate',
      receiptPath: ev.receiptPath,
      finalEvidencePath: ev.finalPath,
      ...o,
      output: { stdout: false, captureFile },
    });
    expect(result.exitCode).toBe(1);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.evaluationSucceeded).toBe(false);
    expect(snapshotEvidence(ev.userRoot)).toBe(before);
  });

  it('missing final evidence fails; evidence tree unchanged', () => {
    const ev = produceEvidence();
    const before = snapshotEvidence(ev.userRoot);
    const captureDir = tmpDir('g4-json-eval-miss-');
    const captureFile = path.join(captureDir, 'eval.json');
    const missing = path.join(captureDir, 'no-final.json');
    const result = runPhaseAJsonCommand({
      command: 'evaluate',
      receiptPath: ev.receiptPath,
      finalEvidencePath: missing,
      expectedReceiptSha256: ev.receiptSha,
      expectedReceiptByteCount: ev.receiptBytes,
      expectedFinalEvidenceSha256: ev.finalSha,
      expectedFinalEvidenceByteCount: ev.finalBytes,
      output: { stdout: false, captureFile },
    });
    expect(result.exitCode).toBe(1);
    expect(result.envelope.reasons).toContain('final_evidence_missing');
    expect(result.envelope.evaluatorInvoked).toBe(false);
    expect(fs.existsSync(captureFile)).toBe(false);
    expect(result.jsonText).toBeTruthy();
    expect(result.stderrLines.join('\n')).toMatch(/final_evidence_missing/);
    expect(snapshotEvidence(ev.userRoot)).toBe(before);
  });

  it('changed evidence during readback fails stableAcrossReread', () => {
    const ev2 = produceEvidence();
    const captureDir = tmpDir('g4-json-eval-race-');
    const capture2 = path.join(captureDir, 'eval2.json');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      evaluatePhaseASetupReceiptForTerminalSuccess,
    } = require('../lib/ml-cal-1-g4-phase-a-retention-setup');
    const raced = runPhaseAJsonCommand(
      {
        command: 'evaluate',
        receiptPath: ev2.receiptPath,
        finalEvidencePath: ev2.finalPath,
        expectedReceiptSha256: ev2.receiptSha,
        expectedReceiptByteCount: ev2.receiptBytes,
        expectedFinalEvidenceSha256: ev2.finalSha,
        expectedFinalEvidenceByteCount: ev2.finalBytes,
        output: { stdout: false, captureFile: capture2 },
      },
      {
        evaluate: (input) => {
          const evalResult =
            evaluatePhaseASetupReceiptForTerminalSuccess(input);
          // Change bytes after evaluation, before command reread.
          fs.writeFileSync(
            ev2.receiptPath,
            Buffer.concat([fs.readFileSync(ev2.receiptPath), Buffer.from(' ')])
          );
          return evalResult;
        },
      }
    );
    expect(raced.exitCode).toBe(1);
    expect(
      raced.envelope.reasons.some((r) =>
        /changed_across_readback|byte_count_mismatch/.test(r)
      )
    ).toBe(true);
  });

  it('evaluate never calls setup; existing capture untouched on collision', () => {
    const ev = produceEvidence();
    const captureDir = tmpDir('g4-json-eval-coll-');
    const existing = path.join(captureDir, 'occupied.json');
    fs.writeFileSync(existing, 'KEEP', 'utf8');
    let setupCalls = 0;
    const result = runPhaseAJsonCommand(
      {
        command: 'evaluate',
        receiptPath: ev.receiptPath,
        finalEvidencePath: ev.finalPath,
        expectedReceiptSha256: ev.receiptSha,
        expectedReceiptByteCount: ev.receiptBytes,
        expectedFinalEvidenceSha256: ev.finalSha,
        expectedFinalEvidenceByteCount: ev.finalBytes,
        output: { stdout: false, captureFile: existing },
      },
      {
        runSetup: (input) => {
          setupCalls += 1;
          return runG4PhaseARetentionSetup(input);
        },
      }
    );
    expect(setupCalls).toBe(0);
    expect(result.envelope.evaluatorInvoked).toBe(false);
    expect(result.envelope.reasons).toContain('capture_path_exists');
    expect(fs.readFileSync(existing, 'utf8')).toBe('KEEP');
  });
});

describe('validateCapturePath symlink parent', () => {
  it('rejects symlinked capture parent when platform allows symlink create', () => {
    const base = tmpDir('g4-json-sym-');
    const realParent = path.join(base, 'real');
    const linkParent = path.join(base, 'link');
    fs.mkdirSync(realParent);
    let linked = false;
    let linkError: string | null = null;
    try {
      fs.symlinkSync(realParent, linkParent, 'junction');
      linked = true;
    } catch (e1) {
      try {
        fs.symlinkSync(realParent, linkParent, 'dir');
        linked = true;
      } catch (e2) {
        linked = false;
        linkError = `${redact(e1)} | ${redact(e2)}`;
      }
    }
    if (!linked) {
      // Do not count an early return as exercised symlink coverage.
      pending(
        `SYMLINK_COVERAGE_UNAVAILABLE: could not create capture-parent symlink/junction (${linkError})`
      );
      return;
    }
    const userRoot = tmpDir('g4-json-sym-user-');
    const cap = validateCapturePath({
      captureFile: path.join(linkParent, 'out.json'),
      operatorUserRoot: userRoot,
    });
    expect(cap.ok).toBe(false);
    if (cap.ok === false) {
      expect(
        cap.reasons.some(
          (r) => r.includes('symlink') || r.includes('capture_parent_symlink')
        )
      ).toBe(true);
    }
  });
});

function redact(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

describe('subprocess entrypoint', () => {
  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  it('emits parseable JSON on stdout and nonzero exit on malformed argv', () => {
    const result = spawnSync(
      process.execPath,
      [
        tsxCli,
        ENTRY,
        '--command=setup',
        '--enabled=true',
        '--json-stdout=true',
      ],
      { encoding: 'utf8', cwd: ROOT }
    );
    expect(result.status).not.toBe(0);
    // Prefer stdout when --json-stdout=true (avoid duplicating stderr+stdout JSON).
    const out = (result.stdout && result.stdout.trim()) || result.stderr || '';
    expect(out).toMatch(/ml-cal-1-g4-phase-a-json-command-v1/);
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(false);
    expect(parsed.kind).toBe('ml-cal-1-g4-phase-a-json-command-v1');
  });

  it('temp setup via subprocess writes exclusive capture and exits 0', () => {
    const userRoot = tmpDir('g4-json-sub-');
    const captureDir = tmpDir('g4-json-sub-cap-');
    const captureFile = path.join(captureDir, 'sub.json');
    const result = spawnSync(
      process.execPath,
      [
        tsxCli,
        ENTRY,
        '--command=setup',
        '--enabled=true',
        '--confirm-setup=true',
        '--mode=temp',
        `--destination=${userRoot}`,
        `--expected-destination=${userRoot}`,
        '--probe-id=phasea-json-sub-probe',
        '--handoff-id=phasea-json-sub-handoff',
        `--json-capture-file=${captureFile}`,
      ],
      { encoding: 'utf8', cwd: ROOT }
    );
    expect(result.status).toBe(0);
    expect(fs.existsSync(captureFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
    expect(parsed.ok).toBe(false); // durable
    expect(parsed.outputOk).toBe(false);
    expect(parsed.operationOk).toBe(true);
    expect(parsed.setupSucceeded).toBe(true);
    expect(parsed.setup.setupReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof parsed.setup.finalEvidenceByteCount).toBe('number');
    const receiptPath = parsed.setup.setupReceiptPath as string;
    const finalPath = parsed.setup.finalEvidencePath as string;
    expect(sha256File(receiptPath)).toBe(parsed.setup.setupReceiptSha256);
    expect(sha256File(finalPath)).toBe(parsed.setup.finalEvidenceSha256);
    expect(fs.statSync(finalPath).size).toBe(parsed.setup.finalEvidenceByteCount);
  });
});

describe('F1 alias / stdout partial / F5 diagnostic safety', () => {
  it('F1 physical alias: receipt via directory symlink refuses; zero evidence-tree writes', () => {
    const userRoot = tmpDir('g4-json-f1alias-');
    const setup = runG4PhaseARetentionSetup({
      enabled: true,
      confirmSetup: true,
      mode: 'temp',
      expectedOperatorUserRoot: userRoot,
      actualOperatorUserRoot: userRoot,
      probeId: 'phasea-json-f1alias-probe',
      handoffId: 'phasea-json-f1alias-handoff',
      now: () => new Date('2026-10-15T17:00:00.000Z'),
    });
    expect(setup.ok).toBe(true);
    const g4 = g4EvidenceBaseFromOperatorUserRoot(userRoot);
    const before = snapshotEvidence(userRoot);
    const aliasRoot = tmpDir('g4-json-f1alias-link-');
    const aliasG4 = path.join(aliasRoot, 'g4-link');
    let linked = false;
    let linkError: string | null = null;
    try {
      fs.symlinkSync(g4, aliasG4, 'junction');
      linked = true;
    } catch (e1) {
      try {
        fs.symlinkSync(g4, aliasG4, 'dir');
        linked = true;
      } catch (e2) {
        linkError = `${e1 instanceof Error ? e1.message : String(e1)} | ${
          e2 instanceof Error ? e2.message : String(e2)
        }`;
      }
    }
    if (!linked) {
      pending(
        `SYMLINK_COVERAGE_UNAVAILABLE: F1 alias regression needs dir symlink (${linkError})`
      );
      return;
    }
    const aliasReceipt = path.join(
      aliasG4,
      'review-handoff',
      path.basename(setup.setupReceiptPath!)
    );
    const aliasFinal = path.join(
      aliasG4,
      'review-handoff',
      path.basename(setup.finalEvidencePath!)
    );
    expect(fs.existsSync(aliasReceipt)).toBe(true);
    const captureDir = tmpDir('g4-json-f1alias-cap-');
    // Attempt capture into the *physical* evidence tree (the bypass under review).
    const evilCapture = path.join(
      path.dirname(setup.setupReceiptPath!),
      'evil-capture-via-alias.json'
    );
    const rBuf = fs.readFileSync(setup.setupReceiptPath!);
    const fBuf = fs.readFileSync(setup.finalEvidencePath!);
    const result = runPhaseAJsonCommand({
      command: 'evaluate',
      receiptPath: aliasReceipt,
      finalEvidencePath: aliasFinal,
      expectedReceiptSha256: createHash('sha256').update(rBuf).digest('hex'),
      expectedReceiptByteCount: rBuf.length,
      expectedFinalEvidenceSha256: createHash('sha256')
        .update(fBuf)
        .digest('hex'),
      expectedFinalEvidenceByteCount: fBuf.length,
      output: { stdout: false, captureFile: evilCapture },
    });
    expect(result.exitCode).toBe(1);
    expect(result.envelope.ok).toBe(false);
    expect(fs.existsSync(evilCapture)).toBe(false);
    expect(snapshotEvidence(userRoot)).toBe(before);
    expect(
      result.envelope.reasons.some(
        (r) =>
          r.includes('symlink') ||
          r.includes('capture_inside_evidence_tree') ||
          r.includes('artifact_')
      )
    ).toBe(true);
    // Outside capture path must also be unused for this refusal.
    expect(fs.existsSync(path.join(captureDir, 'unused.json'))).toBe(false);
  });

  it('stdout: partial then zero-progress write never reports output success', () => {
    const userRoot = tmpDir('g4-json-stdout-partial-');
    const captureDir = tmpDir('g4-json-stdout-partial-cap-');
    const captureFile = path.join(captureDir, 'out.json');
    let calls = 0;
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-stdout-partial',
        handoffId: 'phasea-json-stdout-partial-h',
        output: { stdout: true, captureFile },
      },
      {
        now: () => new Date('2026-10-15T17:10:00.000Z'),
        writeStdout: (text) => {
          // Simulate fs.writeSync returning 1 byte once then 0 — must not ok.
          const buf = Buffer.from(text, 'utf8');
          expect(buf.length).toBeGreaterThan(1);
          let offset = 0;
          const fakeChunk = (
            _fd: number,
            _b: Buffer,
            _o: number,
            _l: number
          ): number => {
            calls += 1;
            if (calls === 1) return 1;
            return 0;
          };
          const { writeAllUtf8ToFd } = require('../lib/ml-cal-1-g4-phase-a-json-command');
          const w = writeAllUtf8ToFd(1, text, fakeChunk);
          if (w.ok === false) return { ok: false, reason: w.reason };
          return { ok: true };
        },
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.outputOk).toBe(false);
    expect(result.envelope.reasons.some((r) => r.includes('zero_progress'))).toBe(
      true
    );
    const durable = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
    expect(durable.ok).toBe(false);
    expect(durable.outputOk).toBe(false);
  });

  it('stdout: one-byte chunking eventually completes full payload', () => {
    const { writeAllUtf8ToFd } = require('../lib/ml-cal-1-g4-phase-a-json-command');
    const payload = 'x'.repeat(3713);
    let offsetMirror = 0;
    const w = writeAllUtf8ToFd(999, payload, (_fd, buf, offset, length) => {
      expect(offset).toBe(offsetMirror);
      const n = Math.min(1, length);
      offsetMirror += n;
      return n;
    });
    expect(w.ok).toBe(true);
    if (w.ok === true) expect(w.byteCount).toBe(3713);
    expect(offsetMirror).toBe(3713);
  });

  it('F5: throwing stdout writer yields structured result without rethrow', () => {
    const userRoot = tmpDir('g4-json-f5throw-');
    const captureDir = tmpDir('g4-json-f5throw-cap-');
    const captureFile = path.join(captureDir, 'out.json');
    let stdoutCalls = 0;
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-f5throw-probe',
        handoffId: 'phasea-json-f5throw-handoff',
        output: { stdout: true, captureFile },
      },
      {
        now: () => new Date('2026-10-15T17:20:00.000Z'),
        writeStdout: () => {
          stdoutCalls += 1;
          throw new Error('inject_stdout_writer_throw');
        },
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.setupSucceeded).toBe(true);
    expect(result.envelope.operationOk).toBe(true);
    expect(result.jsonText).toBeTruthy();
    expect(result.stderrLines.join('\n')).toMatch(/stdout_emit_threw/);
    // Writer invoked once for emit; diagnostic path must not retry it.
    expect(stdoutCalls).toBe(1);
    const durable = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
    expect(durable.ok).toBe(false);
    expect(durable.operationOk).toBe(true);
  });

  it.each([
    ['receipt missing', true, false],
    ['final evidence missing', false, true],
    ['both missing', true, true],
  ] as const)(
    'F1 missing inputs (%s): capture inside G4 tree never created; sentinel preserved',
    (_label, missReceipt, missFinal) => {
      const userRoot = tmpDir('g4-json-f1miss-');
      const setup = runG4PhaseARetentionSetup({
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        expectedOperatorUserRoot: userRoot,
        actualOperatorUserRoot: userRoot,
        probeId: `phasea-json-f1miss-${missReceipt ? 'r' : 'x'}${missFinal ? 'f' : 'y'}`,
        handoffId: `phasea-json-f1miss-h-${missReceipt ? 'r' : 'x'}${missFinal ? 'f' : 'y'}`,
        now: () => new Date('2026-10-15T17:30:00.000Z'),
      });
      expect(setup.ok).toBe(true);
      const handoffDir = path.dirname(setup.setupReceiptPath!);
      const sentinel = path.join(handoffDir, 'SENTINEL_F1_MISS.txt');
      fs.writeFileSync(sentinel, 'SENTINEL_BYTES_PRESERVE', 'utf8');
      const before = snapshotEvidence(userRoot);
      const captureInside = path.join(
        handoffDir,
        `evil-capture-miss-${missReceipt ? 'r' : 'ok'}-${missFinal ? 'f' : 'ok'}.json`
      );
      const missingReceipt = path.join(handoffDir, 'no-such-receipt.json');
      const missingFinal = path.join(handoffDir, 'no-such-final.json');
      const result = runPhaseAJsonCommand({
        command: 'evaluate',
        receiptPath: missReceipt ? missingReceipt : setup.setupReceiptPath!,
        finalEvidencePath: missFinal ? missingFinal : setup.finalEvidencePath!,
        expectedReceiptSha256: 'a'.repeat(64),
        expectedReceiptByteCount: 12,
        expectedFinalEvidenceSha256: 'b'.repeat(64),
        expectedFinalEvidenceByteCount: 12,
        output: { stdout: false, captureFile: captureInside },
      });
      expect(result.exitCode).toBe(1);
      expect(result.envelope.ok).toBe(false);
      expect(result.envelope.evaluatorInvoked).toBe(false);
      expect(fs.existsSync(captureInside)).toBe(false);
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('SENTINEL_BYTES_PRESERVE');
      expect(snapshotEvidence(userRoot)).toBe(before);
      expect(result.jsonText).toBeTruthy();
      expect(result.stderrLines.length).toBeGreaterThan(0);
      if (missReceipt) {
        expect(result.envelope.reasons).toContain('receipt_missing');
      }
      if (missFinal) {
        expect(result.envelope.reasons).toContain('final_evidence_missing');
      }
    }
  );
});

describe('F1–F5 repairs', () => {
  it('F1: evaluate capture beside receipt inside evidence tree is refused', () => {
    const userRoot = tmpDir('g4-json-f1-');
    const setup = runG4PhaseARetentionSetup({
      enabled: true,
      confirmSetup: true,
      mode: 'temp',
      expectedOperatorUserRoot: userRoot,
      actualOperatorUserRoot: userRoot,
      probeId: 'phasea-json-f1-probe',
      handoffId: 'phasea-json-f1-handoff',
      now: () => new Date('2026-10-15T16:00:00.000Z'),
    });
    expect(setup.ok).toBe(true);
    const receiptPath = setup.setupReceiptPath!;
    const finalPath = setup.finalEvidencePath!;
    const beside = path.join(path.dirname(receiptPath), 'capture-beside.json');
    const before = snapshotEvidence(userRoot);
    const rBuf = fs.readFileSync(receiptPath);
    const fBuf = fs.readFileSync(finalPath);
    const result = runPhaseAJsonCommand({
      command: 'evaluate',
      receiptPath,
      finalEvidencePath: finalPath,
      expectedReceiptSha256: createHash('sha256').update(rBuf).digest('hex'),
      expectedReceiptByteCount: rBuf.length,
      expectedFinalEvidenceSha256: createHash('sha256')
        .update(fBuf)
        .digest('hex'),
      expectedFinalEvidenceByteCount: fBuf.length,
      output: { stdout: false, captureFile: beside },
    });
    expect(result.exitCode).toBe(1);
    expect(result.envelope.reasons).toContain('capture_inside_evidence_tree');
    expect(result.envelope.evaluatorInvoked).toBe(false);
    expect(fs.existsSync(beside)).toBe(false);
    expect(result.jsonText).toBeTruthy();
    expect(result.stderrLines.join('\n')).toMatch(/capture_inside_evidence_tree/);
    expect(snapshotEvidence(userRoot)).toBe(before);
  });

  it('F2: exported runner rejects enabled/confirm false before setup', () => {
    const userRoot = tmpDir('g4-json-f2-');
    const captureDir = tmpDir('g4-json-f2-cap-');
    const captureFile = path.join(captureDir, 'x.json');
    let setupCalls = 0;
    const before = listTree(userRoot);
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: false,
        confirmSetup: false,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-f2-probe',
        handoffId: 'phasea-json-f2-handoff',
        output: { stdout: false, captureFile },
      } as unknown,
      {
        runSetup: (input) => {
          setupCalls += 1;
          return runG4PhaseARetentionSetup(input);
        },
      }
    );
    expect(setupCalls).toBe(0);
    expect(result.exitCode).toBe(1);
    expect(result.envelope.setupInvoked).toBe(false);
    expect(result.envelope.reasons).toEqual(
      expect.arrayContaining([
        'enabled_exact_true_required',
        'confirm_setup_exact_true_required',
      ])
    );
    expect(fs.existsSync(captureFile)).toBe(false);
    expect(listTree(userRoot)).toEqual(before);
    expect(result.jsonText).toMatch(/enabled_exact_true_required/);
  });

  it('F3: close/readback failure keeps durable and stderr JSON at ok=false', () => {
    const userRoot = tmpDir('g4-json-f3-');
    const captureDir = tmpDir('g4-json-f3-cap-');
    const captureFile = path.join(captureDir, 'out.json');
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-f3-probe',
        handoffId: 'phasea-json-f3-handoff',
        output: { stdout: false, captureFile },
      },
      {
        now: () => new Date('2026-10-15T16:10:00.000Z'),
        injectCaptureCloseFailure: true,
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.envelope.setupSucceeded).toBe(true);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.outputOk).toBe(false);
    const stderr = result.stderrLines.join('\n');
    expect(stderr).toMatch(/"ok": false/);
    expect(stderr).toMatch(/"outputOk": false/);
    // Retained file may be empty/partial; if parseable must not claim success.
    if (fs.existsSync(captureFile) && fs.statSync(captureFile).size > 0) {
      try {
        const parsed = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
        expect(parsed.ok).toBe(false);
        expect(parsed.outputOk).toBe(false);
      } catch {
        // empty/partial residue is acceptable failure residue
      }
    }
  });

  it('F3: dual-channel stdout failure does not leave success claim in durable payload', () => {
    const userRoot = tmpDir('g4-json-f3b-');
    const captureDir = tmpDir('g4-json-f3b-cap-');
    const captureFile = path.join(captureDir, 'out.json');
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-f3b-probe',
        handoffId: 'phasea-json-f3b-handoff',
        output: { stdout: true, captureFile },
      },
      {
        now: () => new Date('2026-10-15T16:11:00.000Z'),
        writeStdout: () => ({ ok: false, reason: 'inject_stdout_failure' }),
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.outputOk).toBe(false);
    const durable = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
    expect(durable.ok).toBe(false);
    expect(durable.outputOk).toBe(false);
    expect(durable.operationOk).toBe(true);
  });

  it('F4: capture collision reaches entrypoint as structured stderr JSON', () => {
    const userRoot = tmpDir('g4-json-f4-');
    const captureDir = tmpDir('g4-json-f4-cap-');
    const existing = path.join(captureDir, 'occupied.json');
    fs.writeFileSync(existing, 'SENTINEL_F4', 'utf8');
    const entry = mainFromArgv([
      '--command=setup',
      '--enabled=true',
      '--confirm-setup=true',
      '--mode=temp',
      `--destination=${userRoot}`,
      `--expected-destination=${userRoot}`,
      '--probe-id=phasea-json-f4-probe',
      '--handoff-id=phasea-json-f4-handoff',
      `--json-capture-file=${existing}`,
    ]);
    expect(entry.exitCode).toBe(1);
    expect(entry.jsonText).toBeTruthy();
    expect(entry.stderrLineCount).toBeGreaterThan(0);
    const parsed = JSON.parse(entry.jsonText!);
    expect(parsed.reasons).toContain('capture_path_exists');
    expect(fs.readFileSync(existing, 'utf8')).toBe('SENTINEL_F4');
  });

  it('F5: serialization failure after setup closes FD and reports residue', () => {
    const userRoot = tmpDir('g4-json-f5-');
    const captureDir = tmpDir('g4-json-f5-cap-');
    const captureFile = path.join(captureDir, 'out.json');
    let setupCalls = 0;
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: userRoot,
        expectedDestination: userRoot,
        probeId: 'phasea-json-f5-probe',
        handoffId: 'phasea-json-f5-handoff',
        output: { stdout: false, captureFile },
      },
      {
        runSetup: (input) => {
          setupCalls += 1;
          return runG4PhaseARetentionSetup(input);
        },
        now: () => new Date('2026-10-15T16:20:00.000Z'),
        injectSerializeFailure: true,
      }
    );
    expect(setupCalls).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(result.envelope.ok).toBe(false);
    expect(result.envelope.reasons.some((r) => r.startsWith('serialize_failed'))).toBe(
      true
    );
    expect(result.envelope.captureResidue).toBe(captureFile);
    expect(result.jsonText).toBeTruthy();
    expect(result.stderrLines.length).toBeGreaterThan(0);
    // Empty reserved capture may remain; must not claim success if non-empty JSON.
    if (fs.existsSync(captureFile) && fs.statSync(captureFile).size > 2) {
      const parsed = JSON.parse(fs.readFileSync(captureFile, 'utf8'));
      expect(parsed.ok).toBe(false);
    }
  });
});

describe('passive import', () => {
  it('module sources do not construct live clients or secret env reads', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'apps/jobs/lib/ml-cal-1-g4-phase-a-json-command.ts'),
      'utf8'
    );
    const entry = fs.readFileSync(ENTRY, 'utf8');
    for (const text of [src, entry]) {
      expect(text).not.toMatch(/new PrismaClient/);
      expect(text).not.toMatch(/process\.env\.DATABASE_URL/);
      expect(text).not.toMatch(/process\.env\.DIRECT_URL/);
    }
    expect(ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL).toContain(
      'GridironResearchEvidence'
    );
    void phaseASetupReceiptPath;
    void phaseASetupReceiptFinalEvidencePath;
  });
});
