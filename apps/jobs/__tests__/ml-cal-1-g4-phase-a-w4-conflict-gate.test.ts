/**
 * W4 pre-mutation conflict gate — temp-directory validation only.
 * Never hard-codes or mutates the proposed operator destination.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import {
  ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER,
  evaluatePhaseASetupReceiptForTerminalSuccess,
  g4EvidenceBaseFromOperatorUserRoot,
  lstatPathPresence,
  phaseAClaimDirPath,
  phaseAHandoffPackagePath,
  phaseAPreflightPackagePath,
  phaseASetupReceiptFinalEvidencePath,
  phaseASetupReceiptPath,
  runG4PhaseARetentionSetup,
  scanPhaseAW4PreMutationConflicts,
  validateW4DestinationParents,
} from '../lib/ml-cal-1-g4-phase-a-retention-setup';
import {
  mainFromArgv,
  runPhaseARetentionSetupCli,
} from '../run-ml-cal-1-g4-phase-a-retention-setup';
import {
  runPhaseAJsonCommand,
} from '../lib/ml-cal-1-g4-phase-a-json-command';

/**
 * Mark platform-unavailable coverage as skipped (never a silent pass).
 * Jest provides `pending` under jasmine-like globals in some configs; fall back
 * to `this.skip` when invoked via a classic function test body.
 */
function skipUnverified(
  reason: string,
  testCtx?: { skip: () => void }
): never {
  if (testCtx && typeof testCtx.skip === 'function') {
    testCtx.skip();
  }
  const g = globalThis as { pending?: (msg?: string) => void };
  if (typeof g.pending === 'function') {
    g.pending(reason);
  }
  // Fail closed if neither skip mechanism exists — do not pass.
  throw new Error(`SKIPPED/UNVERIFIED: ${reason}`);
}

function tmpOperatorDouble(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'g4-phase-a-w4-op-'));
}

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
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

function snapshotPath(p: string): {
  existsLstat: boolean;
  kind: string | null;
  bytes: number | null;
  sha256: string | null;
} {
  const presence = lstatPathPresence(p);
  if (presence.status === 'absent') {
    return { existsLstat: false, kind: null, bytes: null, sha256: null };
  }
  if (presence.status === 'error') {
    return { existsLstat: true, kind: `error:${presence.reason}`, bytes: null, sha256: null };
  }
  if (presence.kind === 'symlink' || presence.kind === 'directory') {
    return { existsLstat: true, kind: presence.kind, bytes: null, sha256: null };
  }
  const buf = fs.readFileSync(p);
  return {
    existsLstat: true,
    kind: presence.kind,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

function baseInput(root: string, overrides: Record<string, unknown> = {}) {
  return {
    enabled: true as unknown,
    confirmSetup: true as unknown,
    mode: 'temp' as const,
    expectedOperatorUserRoot: root,
    actualOperatorUserRoot: root,
    probeId: 'phasea-w4-probe-001',
    handoffId: 'phasea-w4-handoff-001',
    now: () => new Date('2026-10-15T18:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Mutation instrumentation for this Node build: `fs.*Sync` properties are
 * non-configurable getters, so jest.spyOn cannot wrap them. Proof of zero
 * user-root mutation is a full tree listing plus per-path byte/digest snapshots
 * taken before the call and asserted identical afterward.
 */
function captureUserRootMutationBaseline(userRoot: string): {
  tree: string[];
  files: Record<string, { bytes: number; sha256: string }>;
} {
  const tree = listTree(userRoot);
  const files: Record<string, { bytes: number; sha256: string }> = {};
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        const buf = fs.readFileSync(full);
        files[path.resolve(full)] = {
          bytes: buf.length,
          sha256: createHash('sha256').update(buf).digest('hex'),
        };
      }
    }
  };
  walk(userRoot);
  return { tree, files };
}

function assertUserRootUnchanged(
  userRoot: string,
  before: ReturnType<typeof captureUserRootMutationBaseline>
): void {
  const after = captureUserRootMutationBaseline(userRoot);
  expect(after.tree).toEqual(before.tree);
  expect(after.files).toEqual(before.files);
}

function mutationRecorder(): {
  calls: Array<{ op: string; target: string }>;
  record: (op: string, absTarget: string) => void;
} {
  const calls: Array<{ op: string; target: string }> = [];
  return {
    calls,
    record: (op, absTarget) => {
      calls.push({ op, target: absTarget });
    },
  };
}

function tryCreateSymlink(
  target: string,
  linkPath: string,
  type: 'file' | 'dir' | 'junction'
): { ok: true } | { ok: false; reason: string } {
  const attempts: Array<'file' | 'dir' | 'junction'> =
    type === 'file'
      ? ['file']
      : process.platform === 'win32'
        ? [type, 'junction', 'dir']
        : [type, 'dir'];
  const errors: string[] = [];
  for (const t of attempts) {
    try {
      fs.symlinkSync(target, linkPath, t);
      return { ok: true };
    } catch (e: unknown) {
      errors.push(`${t}:${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: false, reason: errors.join(' | ') };
}

const CONFLICT_CASES: Array<{
  name: string;
  category:
    | 'preflight_package_exists'
    | 'publish_claim_exists'
    | 'handoff_exists'
    | 'setup_receipt_exists'
    | 'setup_final_evidence_exists';
  plant: (g4: string, probeId: string, handoffId: string) => string;
  as: 'file' | 'directory';
}> = [
  {
    name: 'preflight package dir',
    category: 'preflight_package_exists',
    plant: (g4, probeId) => {
      const p = phaseAPreflightPackagePath(g4, probeId);
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, 'SENTINEL.bin'), 'preflight-conflict\n');
      return p;
    },
    as: 'directory',
  },
  {
    name: 'claim dir',
    category: 'publish_claim_exists',
    plant: (g4, probeId) => {
      const p = phaseAClaimDirPath(g4, probeId);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.mkdirSync(p);
      return p;
    },
    as: 'directory',
  },
  {
    name: 'handoff package dir',
    category: 'handoff_exists',
    plant: (g4, _probeId, handoffId) => {
      const p = phaseAHandoffPackagePath(g4, handoffId);
      fs.mkdirSync(p, { recursive: true });
      fs.writeFileSync(path.join(p, 'KEEP.txt'), 'handoff-conflict\n');
      return p;
    },
    as: 'directory',
  },
  {
    name: 'setup receipt file',
    category: 'setup_receipt_exists',
    plant: (g4, probeId) => {
      const p = phaseASetupReceiptPath(g4, probeId);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, '{"kind":"conflict-receipt"}\n');
      return p;
    },
    as: 'file',
  },
  {
    name: 'final evidence file',
    category: 'setup_final_evidence_exists',
    plant: (g4, probeId) => {
      const p = phaseASetupReceiptFinalEvidencePath(g4, probeId);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, '{"kind":"conflict-final"}\n');
      return p;
    },
    as: 'file',
  },
];

describe('W4 path helpers', () => {
  it('derives the five deterministic destinations', () => {
    const g4 = path.join(os.tmpdir(), 'g4-w4-helpers', 'ml-cal-1', 'g4');
    const probeId = 'phasea-w4-probe-x';
    const handoffId = 'phasea-w4-handoff-x';
    expect(phaseAPreflightPackagePath(g4, probeId)).toBe(
      path.join(g4, 'preflight', probeId)
    );
    expect(phaseAClaimDirPath(g4, probeId)).toBe(
      path.join(g4, 'staging', `.claim-${probeId}`)
    );
    expect(phaseAHandoffPackagePath(g4, handoffId)).toBe(
      path.join(g4, 'review-handoff', handoffId)
    );
    expect(phaseASetupReceiptPath(g4, probeId)).toBe(
      path.join(g4, 'review-handoff', `PHASE_A_SETUP_RECEIPT-${probeId}.json`)
    );
    expect(phaseASetupReceiptFinalEvidencePath(g4, probeId)).toBe(
      path.join(
        g4,
        'review-handoff',
        `PHASE_A_SETUP_RECEIPT-${probeId}.final-evidence.json`
      )
    );
  });
});

describe('W4 five conflict categories — zero user-root mutation', () => {
  for (const c of CONFLICT_CASES) {
    it(`refuses ${c.name} before any user-root mutation`, () => {
      const root = tmpOperatorDouble();
      const outside = tmpOperatorDouble();
      const sentinel = path.join(outside, 'OUTSIDE_SENTINEL.txt');
      fs.writeFileSync(sentinel, 'outside-keep\n');
      const outsideBefore = {
        tree: listTree(outside),
        snap: snapshotPath(sentinel),
      };

      const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
      const probeId = `phasea-w4-${c.category}-p`;
      const handoffId = `phasea-w4-${c.category}-h`;
      const conflictPath = c.plant(g4, probeId, handoffId);
      const beforeConflict = snapshotPath(conflictPath);
      const beforeRoot = captureUserRootMutationBaseline(root);
      const mut = mutationRecorder();
      let clocks = 0;
      const r = runG4PhaseARetentionSetup(
        baseInput(root, {
          probeId,
          handoffId,
          testOnlyRecordUserRootMutation: mut.record,
          now: () => {
            clocks += 1;
            return new Date('2026-10-15T18:00:00.000Z');
          },
        })
      );
      expect(r.ok).toBe(false);
      expect(r.setupCompleted).toBe(false);
      expect(r.reasons).toContain('w4_pre_mutation_conflict');
      expect(r.reasons).toContain(c.category);
      expect(r.leftovers).toEqual([]);
      expect(r.notes).toContain('w4_conflict_before_user_root_mutation');
      expect(r.notes).toContain('layout_probe_usability_not_run');
      expect(r.usabilityChecks.layoutCreateOrIdempotent).toBeUndefined();
      expect(clocks).toBe(0);
      expect(mut.calls).toEqual([]);
      expect(snapshotPath(conflictPath)).toEqual(beforeConflict);
      assertUserRootUnchanged(root, beforeRoot);
      expect(listTree(outside)).toEqual(outsideBefore.tree);
      expect(snapshotPath(sentinel)).toEqual(outsideBefore.snap);
    });
  }
});

describe('W4 partial layout / missing root', () => {
  it('receipt-only conflict refuses without creating missing layout dirs', () => {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-partial-receipt';
    const handoffId = 'phasea-w4-partial-handoff';
    const receipt = phaseASetupReceiptPath(g4, probeId);
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    fs.writeFileSync(receipt, '{"partial":true}\n');
    const beforeRoot = captureUserRootMutationBaseline(root);
    const r = runG4PhaseARetentionSetup(
      baseInput(root, { probeId, handoffId })
    );
    expect(r.reasons).toContain('setup_receipt_exists');
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    assertUserRootUnchanged(root, beforeRoot);
    expect(fs.existsSync(path.join(g4, 'preflight'))).toBe(false);
    expect(fs.existsSync(path.join(g4, 'staging'))).toBe(false);
    expect(fs.existsSync(path.join(g4, 'observations'))).toBe(false);
  });

  it('no user root and no conflicts: successful temp setup still works', () => {
    const parent = tmpOperatorDouble();
    const root = path.join(parent, 'missing-user-root');
    expect(fs.existsSync(root)).toBe(false);
    let i = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-w4-fresh-ok',
        handoffId: 'phasea-w4-fresh-ok-h',
        now: () =>
          new Date(
            i++ === 0
              ? '2026-10-15T18:00:00.000Z'
              : '2026-10-15T18:00:01.000Z'
          ),
      })
    );
    expect(r.ok).toBe(true);
    expect(r.setupCompleted).toBe(true);
    expect(r.setupReceiptPath).toBeTruthy();
    expect(r.finalEvidencePath).toBeTruthy();
    const evalR = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: r.setupReceiptPath!,
      finalEvidencePath: r.finalEvidencePath,
      externalAnchor: {
        expectedReceiptSha256: r.setupReceiptSha256!,
        expectedFinalEvidenceSha256: r.finalEvidenceSha256!,
      },
    });
    expect(evalR.ok).toBe(true);
    expect(evalR.externallyAnchored).toBe(true);
  });
});

describe('W4 symlink / dangling / junction coverage', () => {
  it('symlink at receipt path is a conflict; outside target untouched', function () {
    const root = tmpOperatorDouble();
    const outside = tmpOperatorDouble();
    const target = path.join(outside, 'receipt-target.json');
    fs.writeFileSync(target, '{"outside":true}\n');
    const beforeOutside = snapshotPath(target);
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-symlink-receipt';
    const handoffId = 'phasea-w4-symlink-handoff';
    const linkPath = phaseASetupReceiptPath(g4, probeId);
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    const created = tryCreateSymlink(target, linkPath, 'file');
    if (created.ok === false) {
      // OS file-symlink create unavailable (often EPERM on Windows without
      // Developer Mode). Still prove leaf-symlink classification via injected
      // lstat — do not count OS create as exercised.
      // eslint-disable-next-line no-console
      console.warn(
        `[W4] SKIPPED/UNVERIFIED real file-symlink create: ${created.reason}`
      );
      const mut = mutationRecorder();
      let clocks = 0;
      const beforeRoot = captureUserRootMutationBaseline(root);
      const r = runG4PhaseARetentionSetup(
        baseInput(root, {
          probeId,
          handoffId,
          testOnlyRecordUserRootMutation: mut.record,
          testOnlyW4LstatSync: (p) => {
            if (path.resolve(String(p)) === path.resolve(linkPath)) {
              return {
                isSymbolicLink: () => true,
                isDirectory: () => false,
                isFile: () => false,
              } as fs.Stats;
            }
            return fs.lstatSync(p);
          },
          now: () => {
            clocks += 1;
            return new Date('2026-10-15T18:00:00.000Z');
          },
        })
      );
      expect(r.reasons).toContain('w4_pre_mutation_conflict');
      expect(r.reasons).toContain('setup_receipt_exists');
      expect(r.notes).toContain('w4_conflict_kind:symlink');
      expect(r.notes).not.toContain(
        'w4_ancestor_validation_failed_before_lstat'
      );
      expect(clocks).toBe(0);
      expect(mut.calls).toEqual([]);
      assertUserRootUnchanged(root, beforeRoot);
      expect(snapshotPath(target)).toEqual(beforeOutside);
      return;
    }
    const beforeLink = snapshotPath(linkPath);
    const beforeRoot = captureUserRootMutationBaseline(root);
    const mut = mutationRecorder();
    let clocks = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId,
        handoffId,
        testOnlyRecordUserRootMutation: mut.record,
        now: () => {
          clocks += 1;
          return new Date('2026-10-15T18:00:00.000Z');
        },
      })
    );
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    expect(r.reasons).toContain('setup_receipt_exists');
    expect(r.notes).toContain('w4_conflict_kind:symlink');
    expect(r.notes).not.toContain('w4_ancestor_validation_failed_before_lstat');
    expect(clocks).toBe(0);
    expect(mut.calls).toEqual([]);
    expect(snapshotPath(linkPath)).toEqual(beforeLink);
    expect(snapshotPath(target)).toEqual(beforeOutside);
    assertUserRootUnchanged(root, beforeRoot);
  });

  it('dangling symlink at claim path is a conflict (lstat, not existsSync)', function () {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-dangling-claim';
    const handoffId = 'phasea-w4-dangling-handoff';
    const claim = phaseAClaimDirPath(g4, probeId);
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    const missingTarget = path.join(
      os.tmpdir(),
      `g4-w4-missing-${randomUUID()}`
    );
    const created = tryCreateSymlink(missingTarget, claim, 'dir');
    if (created.ok === false) {
      skipUnverified(
        `dangling claim symlink: ${created.reason}`,
        this as { skip: () => void }
      );
    }
    expect(fs.existsSync(claim)).toBe(false);
    expect(lstatPathPresence(claim).status).toBe('present');
    const beforeRoot = captureUserRootMutationBaseline(root);
    const mut = mutationRecorder();
    let clocks = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId,
        handoffId,
        testOnlyRecordUserRootMutation: mut.record,
        now: () => {
          clocks += 1;
          return new Date();
        },
      })
    );
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    expect(r.reasons).toContain('publish_claim_exists');
    expect(r.notes).toContain('w4_conflict_kind:symlink');
    expect(clocks).toBe(0);
    expect(mut.calls).toEqual([]);
    assertUserRootUnchanged(root, beforeRoot);
  });

  it('directory junction/symlink at preflight package refuses without mutating target', function () {
    const root = tmpOperatorDouble();
    const outside = tmpOperatorDouble();
    const realPkg = path.join(outside, 'real-preflight');
    fs.mkdirSync(realPkg, { recursive: true });
    fs.writeFileSync(path.join(realPkg, 'KEEP.bin'), 'keep\n');
    const beforeOutside = listTree(outside);
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-junction-preflight';
    const handoffId = 'phasea-w4-junction-handoff';
    const linkPath = phaseAPreflightPackagePath(g4, probeId);
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    const created = tryCreateSymlink(realPkg, linkPath, type);
    if (created.ok === false) {
      skipUnverified(
        `junction/dir-symlink: ${created.reason}`,
        this as { skip: () => void }
      );
    }
    const beforeRoot = captureUserRootMutationBaseline(root);
    const mut = mutationRecorder();
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId,
        handoffId,
        testOnlyRecordUserRootMutation: mut.record,
      })
    );
    expect(r.reasons).toContain('preflight_package_exists');
    expect(r.notes).toContain('w4_conflict_kind:symlink');
    expect(mut.calls).toEqual([]);
    assertUserRootUnchanged(root, beforeRoot);
    expect(listTree(outside)).toEqual(beforeOutside);
  });
});

describe('W4 dangling ancestor refuses before clock/mutation', () => {
  it('dangling review-handoff ancestor: zero clock, zero mutations, other layout dirs absent', function () {
    const root = tmpOperatorDouble();
    const outside = tmpOperatorDouble();
    fs.writeFileSync(path.join(outside, 'OUT.txt'), 'keep\n');
    const outsideBefore = captureUserRootMutationBaseline(outside);
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-dangle-rh';
    const handoffId = 'phasea-w4-dangle-rh-h';
    // Create only ml-cal-1/g4; leave preflight/staging/observations absent.
    fs.mkdirSync(g4, { recursive: true });
    const missingTarget = path.join(
      os.tmpdir(),
      `g4-w4-missing-rh-${randomUUID()}`
    );
    const reviewHandoff = path.join(g4, 'review-handoff');
    const created = tryCreateSymlink(missingTarget, reviewHandoff, 'dir');
    if (created.ok === false) {
      skipUnverified(
        `dangling review-handoff ancestor: ${created.reason}`,
        this as { skip: () => void }
      );
    }
    expect(fs.existsSync(reviewHandoff)).toBe(false);
    expect(lstatPathPresence(reviewHandoff).status).toBe('present');
    expect(fs.existsSync(path.join(g4, 'preflight'))).toBe(false);
    expect(fs.existsSync(path.join(g4, 'staging'))).toBe(false);
    expect(fs.existsSync(path.join(g4, 'observations'))).toBe(false);

    const parents = validateW4DestinationParents(
      phaseASetupReceiptPath(g4, probeId)
    );
    expect(parents.ok).toBe(false);

    const beforeRoot = captureUserRootMutationBaseline(root);
    const mut = mutationRecorder();
    let clocks = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId,
        handoffId,
        testOnlyRecordUserRootMutation: mut.record,
        now: () => {
          clocks += 1;
          return new Date('2026-10-15T18:00:00.000Z');
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    expect(
      r.reasons.some((x) => x.startsWith('w4_unresolved_ancestor_symlink:'))
    ).toBe(true);
    expect(r.notes).toContain('w4_ancestor_symlink_or_dangling');
    expect(clocks).toBe(0);
    expect(mut.calls).toEqual([]);
    assertUserRootUnchanged(root, beforeRoot);
    assertUserRootUnchanged(outside, outsideBefore);
    expect(fs.existsSync(path.join(g4, 'preflight'))).toBe(false);
    expect(fs.existsSync(path.join(g4, 'staging'))).toBe(false);
    expect(fs.existsSync(path.join(g4, 'observations'))).toBe(false);
  });

  it('dangling staging ancestor refuses before mutation', function () {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    fs.mkdirSync(g4, { recursive: true });
    const missingTarget = path.join(
      os.tmpdir(),
      `g4-w4-missing-st-${randomUUID()}`
    );
    const staging = path.join(g4, 'staging');
    const created = tryCreateSymlink(missingTarget, staging, 'dir');
    if (created.ok === false) {
      skipUnverified(
        `dangling staging: ${created.reason}`,
        this as { skip: () => void }
      );
    }
    const mut = mutationRecorder();
    let clocks = 0;
    const beforeRoot = captureUserRootMutationBaseline(root);
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-w4-dangle-st',
        handoffId: 'phasea-w4-dangle-st-h',
        testOnlyRecordUserRootMutation: mut.record,
        now: () => {
          clocks += 1;
          return new Date();
        },
      })
    );
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    expect(
      r.reasons.some((x) => x.includes('w4_unresolved_ancestor_symlink:'))
    ).toBe(true);
    expect(clocks).toBe(0);
    expect(mut.calls).toEqual([]);
    assertUserRootUnchanged(root, beforeRoot);
  });

  it('dangling preflight ancestor refuses before mutation', function () {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    fs.mkdirSync(g4, { recursive: true });
    const missingTarget = path.join(
      os.tmpdir(),
      `g4-w4-missing-pf-${randomUUID()}`
    );
    const preflight = path.join(g4, 'preflight');
    const created = tryCreateSymlink(missingTarget, preflight, 'dir');
    if (created.ok === false) {
      skipUnverified(
        `dangling preflight: ${created.reason}`,
        this as { skip: () => void }
      );
    }
    const mut = mutationRecorder();
    let clocks = 0;
    const beforeRoot = captureUserRootMutationBaseline(root);
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-w4-dangle-pf',
        handoffId: 'phasea-w4-dangle-pf-h',
        testOnlyRecordUserRootMutation: mut.record,
        now: () => {
          clocks += 1;
          return new Date();
        },
      })
    );
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    expect(clocks).toBe(0);
    expect(mut.calls).toEqual([]);
    assertUserRootUnchanged(root, beforeRoot);
  });
});

describe('W4 read/inspection failures fail closed', () => {
  it('distinguishes confirmed absence from permission and I/O errors', () => {
    const missing = path.join(
      os.tmpdir(),
      `g4-w4-absent-${randomUUID()}`,
      'nope'
    );
    expect(lstatPathPresence(missing).status).toBe('absent');

    const perm = lstatPathPresence(missing, {
      lstatSync: () => {
        const err = new Error('EACCES') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      },
    });
    expect(perm.status).toBe('error');
    if (perm.status === 'error') {
      expect(perm.reason).toContain('w4_lstat_permission:EACCES');
    }

    const eio = lstatPathPresence(missing, {
      lstatSync: () => {
        const err = new Error('EIO') as NodeJS.ErrnoException;
        err.code = 'EIO';
        throw err;
      },
    });
    expect(eio.status).toBe('error');
    if (eio.status === 'error') {
      expect(eio.reason).toContain('w4_lstat_eio');
    }
  });

  it('W4 scan fails closed on injected leaf lstat permission error before mutation', () => {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    for (const sub of [
      'preflight',
      'observations',
      'staging',
      'review-handoff',
    ]) {
      fs.mkdirSync(path.join(g4, sub), { recursive: true });
    }
    const probeId = 'phasea-w4-lstat-eacces';
    const leaf = phaseAPreflightPackagePath(g4, probeId);
    const mut = mutationRecorder();
    let clocks = 0;
    const beforeRoot = captureUserRootMutationBaseline(root);
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId,
        handoffId: 'phasea-w4-lstat-eacces-h',
        testOnlyRecordUserRootMutation: mut.record,
        testOnlyW4LstatSync: (p) => {
          if (path.resolve(String(p)) === path.resolve(leaf)) {
            const err = new Error('EACCES') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            throw err;
          }
          return fs.lstatSync(p);
        },
        now: () => {
          clocks += 1;
          return new Date();
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    expect(r.reasons.some((x) => x.includes('w4_lstat_permission'))).toBe(
      true
    );
    expect(clocks).toBe(0);
    expect(mut.calls).toEqual([]);
    assertUserRootUnchanged(root, beforeRoot);
  });

  it('ENOTDIR ancestor fails closed before mutation', () => {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-enotdir';
    const handoffId = 'phasea-w4-enotdir-h';
    const handoffParent = path.join(g4, 'review-handoff');
    fs.mkdirSync(path.dirname(handoffParent), { recursive: true });
    fs.writeFileSync(handoffParent, 'not-a-directory\n');
    const beforeRoot = captureUserRootMutationBaseline(root);
    const mut = mutationRecorder();
    let clocks = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId,
        handoffId,
        testOnlyRecordUserRootMutation: mut.record,
        now: () => {
          clocks += 1;
          return new Date();
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    expect(
      r.reasons.some(
        (x) =>
          x.includes('w4_ancestor_not_directory') ||
          x.includes('w4_lstat_') ||
          x.includes('enotdir')
      )
    ).toBe(true);
    expect(clocks).toBe(0);
    expect(mut.calls).toEqual([]);
    assertUserRootUnchanged(root, beforeRoot);
  });
});

describe('W4 callers: library, legacy CLI, JSON command', () => {
  it('disabled/malformed retain zero clock/FS', () => {
    const root = tmpOperatorDouble();
    const before = listTree(root);
    let clocks = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        enabled: false,
        now: () => {
          clocks += 1;
          return new Date();
        },
      })
    );
    expect(r.reasons).toContain('phase_a_setup_disabled');
    expect(clocks).toBe(0);
    expect(listTree(root)).toEqual(before);
    expect(runPhaseARetentionSetupCli({}).filesystemMutations).toBe(false);
    expect(mainFromArgv(['--help']).usagePrinted).toBe(true);
  });

  it('legacy CLI surfaces W4 refusal with zero further layout when receipt conflicts', () => {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-cli-receipt';
    const handoffId = 'phasea-w4-cli-handoff';
    const receipt = phaseASetupReceiptPath(g4, probeId);
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    fs.writeFileSync(receipt, '{"cli":true}\n');
    const before = listTree(root);
    const cli = runPhaseARetentionSetupCli({
      enabled: true,
      confirmSetup: true,
      mode: 'temp',
      destination: root,
      expectedDestination: root,
      probeId,
      handoffId,
    });
    expect(cli.ok).toBe(false);
    expect(cli.setup?.reasons).toContain('w4_pre_mutation_conflict');
    expect(cli.setup?.reasons).toContain('setup_receipt_exists');
    expect(listTree(root)).toEqual(before);
  });

  it('JSON setup path reports W4 refusal while preserving external capture', () => {
    const root = tmpOperatorDouble();
    const captureParent = tmpOperatorDouble();
    const captureFile = path.join(captureParent, 'w4-refusal-capture.json');
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-json-probe';
    const handoffId = 'phasea-w4-json-handoff';
    const receipt = phaseASetupReceiptPath(g4, probeId);
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    const receiptBytes = Buffer.from('{"json-w4":true}\n', 'utf8');
    fs.writeFileSync(receipt, receiptBytes);
    const treeBefore = listTree(root);

    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'temp',
        destination: root,
        expectedDestination: root,
        probeId,
        handoffId,
        output: { stdout: false, captureFile },
      },
      { now: () => new Date('2026-10-15T18:00:00.000Z') }
    );
    // Capture-before-setup: exclusive capture may exist with the refusal.
    // That is outside the operator user root — W4 zeroes user-root mutation only.
    expect(result.exitCode).toBe(1);
    expect(result.envelope.setupInvoked).toBe(true);
    expect(result.envelope.setupSucceeded).toBe(false);
    expect(result.envelope.operationOk).toBe(false);
    expect(fs.existsSync(captureFile)).toBe(true);
    expect(result.envelope.capturePath).toBe(path.resolve(captureFile));
    const durable = JSON.parse(fs.readFileSync(captureFile, 'utf8')) as {
      reasons: string[];
      setup: { reasons: string[] } | null;
    };
    expect(durable.reasons).toContain('w4_pre_mutation_conflict');
    expect(durable.reasons).toContain('setup_receipt_exists');
    expect(listTree(root)).toEqual(treeBefore);
    expect(snapshotPath(receipt).sha256).toBe(
      createHash('sha256').update(receiptBytes).digest('hex')
    );
  });
});

describe('W4 post-scan race: mid-flight exclusive still holds', () => {
  it('claim planted after W4 scan is refused without overwrite/removal', () => {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w4-race-claim';
    const handoffId = 'phasea-w4-race-handoff';
    const claim = phaseAClaimDirPath(g4, probeId);
    let planted = false;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId,
        handoffId,
        testOnlyAfterW4PreMutationScan: () => {
          fs.mkdirSync(path.dirname(claim), { recursive: true });
          fs.mkdirSync(claim);
          fs.writeFileSync(path.join(claim, 'RACER.txt'), 'planted\n');
          planted = true;
        },
        now: (() => {
          let i = 0;
          return () =>
            new Date(
              i++ === 0
                ? '2026-10-15T18:00:00.000Z'
                : '2026-10-15T18:00:01.000Z'
            );
        })(),
      })
    );
    expect(planted).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('publish_claim_exists');
    expect(fs.existsSync(path.join(claim, 'RACER.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(claim, 'RACER.txt'), 'utf8')).toBe(
      'planted\n'
    );
    // Must not treat racer as owned leftover to delete
    expect(r.leftovers.map((p) => path.resolve(p))).not.toContain(
      path.resolve(claim)
    );
  });
});

describe('mutation recorder crosses helper boundaries', () => {
  it('successful setup records cleanup removals (positive control)', () => {
    const root = tmpOperatorDouble();
    const mut = mutationRecorder();
    let i = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-w4-rec-cleanup',
        handoffId: 'phasea-w4-rec-cleanup-h',
        testOnlyRecordUserRootMutation: mut.record,
        now: () =>
          new Date(
            i++ === 0
              ? '2026-10-15T18:00:00.000Z'
              : '2026-10-15T18:00:01.000Z'
          ),
      })
    );
    expect(r.ok).toBe(true);
    expect(r.usabilityChecks.ownedCleanup).toBe(true);
    const removals = mut.calls.filter((c) => c.op === 'remove');
    // Staging/claim/probe cleanup goes through safeRemoveContained → must record.
    expect(removals.length).toBeGreaterThanOrEqual(4);
    expect(
      removals.some((c) => c.target.toLowerCase().includes('.claim-'))
    ).toBe(true);
    expect(
      removals.some((c) => {
        const t = c.target.toLowerCase();
        return t.includes('staging') || t.includes('preflight');
      })
    ).toBe(true);
  });

  it('after_publish failure records invalidation writes (positive control)', () => {
    const root = tmpOperatorDouble();
    const mut = mutationRecorder();
    let i = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-w4-rec-inv',
        handoffId: 'phasea-w4-rec-inv-h',
        injectFailure: 'after_publish',
        testOnlyRecordUserRootMutation: mut.record,
        now: () =>
          new Date(
            i++ === 0
              ? '2026-10-15T18:00:00.000Z'
              : '2026-10-15T18:00:01.000Z'
          ),
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('inject_failure_after_publish');
    expect(r.probePackageDir).toBeTruthy();
    const invPath = path.resolve(
      path.join(r.probePackageDir!, ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER)
    );
    expect(fs.existsSync(invPath)).toBe(true);
    const invWrites = mut.calls.filter(
      (c) =>
        c.op === 'write' &&
        path.resolve(c.target).toLowerCase() === invPath.toLowerCase()
    );
    expect(invWrites.length).toBeGreaterThanOrEqual(1);
    // Cleanup removals after publish failure also cross helper boundary.
    expect(mut.calls.some((c) => c.op === 'remove')).toBe(true);
  });
});

describe('W4 scan helper + happy evaluate still works', () => {
  it('scan reports ok when all five absent', () => {
    const root = tmpOperatorDouble();
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const scan = scanPhaseAW4PreMutationConflicts({
      operatorUserRoot: root,
      g4EvidenceBase: g4,
      probeId: 'phasea-w4-scan-free',
      handoffId: 'phasea-w4-scan-free-h',
    });
    expect(scan.ok).toBe(true);
  });

  it('idempotent layout + unique IDs succeed; paired evidence evaluates', () => {
    const root = tmpOperatorDouble();
    // Pre-create layout only (IDs free) — must remain idempotent
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    for (const sub of [
      'preflight',
      'observations',
      'staging',
      'review-handoff',
    ]) {
      fs.mkdirSync(path.join(g4, sub), { recursive: true });
    }
    let i = 0;
    const r = runG4PhaseARetentionSetup(
      baseInput(root, {
        probeId: 'phasea-w4-idempotent',
        handoffId: 'phasea-w4-idempotent-h',
        now: () =>
          new Date(
            i++ === 0
              ? '2026-10-15T18:00:00.000Z'
              : '2026-10-15T18:00:01.000Z'
          ),
      })
    );
    expect(r.ok).toBe(true);
    expect(r.liveAccepted).toBe(false);
    expect(r.approved).toBe(false);
    expect(r.deployedPoolerProof).toBe(false);
    const evalR = evaluatePhaseASetupReceiptForTerminalSuccess({
      receiptPath: r.setupReceiptPath!,
      finalEvidencePath: r.finalEvidencePath,
      externalAnchor: {
        expectedReceiptSha256: r.setupReceiptSha256!,
        expectedFinalEvidenceSha256: r.finalEvidenceSha256!,
      },
    });
    expect(evalR.ok).toBe(true);
    expect(evalR.externallyAnchored).toBe(true);
    expect(sha256File(r.setupReceiptPath!)).toBe(r.setupReceiptSha256);
    expect(sha256File(r.finalEvidencePath!)).toBe(r.finalEvidenceSha256);
  });
});
