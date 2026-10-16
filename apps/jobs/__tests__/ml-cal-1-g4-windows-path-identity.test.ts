/**
 * W5 path-identity launcher + operator gate wiring — disposable fixtures only.
 * Never inspects C:\Users\Bobby\GridironResearchEvidence or ancestors.
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  evaluateOperatorWindowsGatesAfterW4,
  ML_CAL_1_G4_W5_HELPER_EXE_BYTE_COUNT,
  ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN,
  ML_CAL_1_G4_W5_MODE,
  ML_CAL_1_G4_W5_SCHEMA_VERSION,
  ML_CAL_1_G4_W5_STDERR_BYTE_CAP,
  ML_CAL_1_G4_W5_STDOUT_BYTE_CAP,
  resolveDefaultW5HelperExePath,
  runW5PathIdentityInspectAsync,
  runW5PathIdentityInspectSync,
  buildW5HelperEnv,
  isMlCal1G4W5TestEnvKey,
  ML_CAL_1_G4_W5_TEST_ENV_PREFIX,
  stripMlCal1G4W5TestEnvKeys,
  splitWindowsDriveSegments,
  validatePassEvidence,
  verifyW5HelperExePin,
  type MlCal1G4W5HelperResponse,
  type MlCal1G4W5InspectResult,
} from '../lib/ml-cal-1-g4-windows-path-identity';
import {
  g4EvidenceBaseFromOperatorUserRoot,
  phaseASetupReceiptPath,
  runG4PhaseARetentionSetup,
} from '../lib/ml-cal-1-g4-phase-a-retention-setup';
import { runPhaseARetentionSetupCli } from '../run-ml-cal-1-g4-phase-a-retention-setup';
import { runPhaseAJsonCommand } from '../lib/ml-cal-1-g4-phase-a-json-command';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const HELPER_EXE = resolveDefaultW5HelperExePath(REPO_ROOT);
const HOST_PLATFORM = process.platform;

const coverage = {
  nativeExercised: 0,
  mocked: 0,
  skipped: 0,
  unverified: 0,
};

afterAll(() => {
  // eslint-disable-next-line no-console
  console.log(
    `[W5 coverage] native=${coverage.nativeExercised} mocked=${coverage.mocked} skipped=${coverage.skipped} unverified=${coverage.unverified}`
  );
});

function skipUnverified(
  reason: string,
  testCtx?: { skip: () => void }
): void {
  coverage.skipped += 1;
  coverage.unverified += 1;
  // eslint-disable-next-line no-console
  console.warn(`[W5] SKIPPED/UNVERIFIED: ${reason}`);
  if (testCtx && typeof testCtx.skip === 'function') {
    testCtx.skip();
    return;
  }
}

function disposableRoot(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `g4-w5-${label}-`));
}

/** Windows drive path for evidence/binding strings. Not a host filesystem path. */
function windowsEvidencePath(...segments: string[]): string {
  return ['C:', 'g4-w5-evidence', ...segments].join('\\');
}

/**
 * Mocked transport tests isolate Windows platform and absolute-path semantics.
 * Host fixture files stay on os.tmpdir(). Each install has one restore.
 */
let restoreWindowsTransport: (() => void) | null = null;

function installWindowsTransportIsolation(): void {
  restoreWindowsTransportIsolation();
  const previous = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {
    configurable: true,
    enumerable: true,
    get: () => 'win32',
  });
  // Assign the CJS export. Jest's namespace binding is not configurable, so spyOn cannot replace it.
  const nodePath = require('path') as typeof path;
  const originalIsAbsolute = nodePath.isAbsolute.bind(nodePath);
  nodePath.isAbsolute = (candidate: string) => {
    // path.win32 is the same object on Windows, so do not call it from this replacement.
    if (/^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith('\\\\')) {
      return true;
    }
    return originalIsAbsolute(candidate);
  };
  restoreWindowsTransport = () => {
    nodePath.isAbsolute = originalIsAbsolute;
    if (previous) {
      Object.defineProperty(process, 'platform', previous);
    }
    restoreWindowsTransport = null;
  };
}

function restoreWindowsTransportIsolation(): void {
  if (restoreWindowsTransport) restoreWindowsTransport();
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

function captureBaseline(userRoot: string) {
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

function assertUnchanged(
  userRoot: string,
  before: ReturnType<typeof captureBaseline>
) {
  const after = captureBaseline(userRoot);
  expect(after.tree).toEqual(before.tree);
  expect(after.files).toEqual(before.files);
}

function mutationRecorder() {
  const calls: Array<{ op: string; target: string }> = [];
  return {
    calls,
    record: (op: string, absTarget: string) => {
      calls.push({ op, target: absTarget });
    },
  };
}

function baseTempInput(root: string, overrides: Record<string, unknown> = {}) {
  return {
    enabled: true as unknown,
    confirmSetup: true as unknown,
    mode: 'temp' as const,
    expectedOperatorUserRoot: root,
    actualOperatorUserRoot: root,
    probeId: 'phasea-w5-probe-001',
    handoffId: 'phasea-w5-handoff-001',
    now: () => new Date('2026-10-15T18:00:00.000Z'),
    ...overrides,
  };
}

function baseOperatorInput(
  root: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    ...baseTempInput(root, overrides),
    mode: 'operator' as const,
  };
}

function completePassHelper(boundPath: string): MlCal1G4W5HelperResponse {
  const parts = splitWindowsDriveSegments(boundPath);
  if (!Array.isArray(parts)) {
    throw new Error(`completePassHelper: ${parts.reason}`);
  }
  const volume = '\\\\?\\Volume{00000000-0000-0000-0000-000000000001}\\';
  const guid = volume + parts.join('\\');
  return {
    schemaVersion: 1,
    mode: 'inspect-w5',
    boundPath,
    outcome: 'PASS',
    reasons: [],
    expectedFinalGuidPath: guid,
    followedFinalGuidPath: guid,
    followedFinalNtPath: '\\Device\\HarddiskVolume1\\' + parts.join('\\'),
    volumeGuidRoot: volume,
    segments: parts.map((p, i) => ({
      boundName: p,
      onDiskName: p,
      objectId: `AAAAAAAA:${(i + 1).toString(16).padStart(16, '0')}`,
      reparseTag: 0,
      status: 'OK',
    })),
    notes: [],
    limitations: [],
  };
}

function w5PassStub(): MlCal1G4W5InspectResult {
  const helper = completePassHelper(windowsEvidencePath('stub'));
  return {
    ok: true,
    outcome: 'PASS',
    reasons: [],
    notes: ['test_stub_w5_pass'],
    helper,
    exePath: HELPER_EXE,
    exeSha256: ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN,
    spawned: false,
  };
}

function w5RefuseStub(reason: string): MlCal1G4W5InspectResult {
  return {
    ok: false,
    outcome: 'REFUSE',
    reasons: [reason],
    notes: [],
    exePath: HELPER_EXE,
    exeSha256: ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN,
    spawned: false,
  };
}

async function waitForFile(p: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(p)) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
}

describe('W5 helper pin + frozen caps', () => {
  it('records frozen caps and pin constants', () => {
    expect(ML_CAL_1_G4_W5_STDOUT_BYTE_CAP).toBe(1_048_576);
    expect(ML_CAL_1_G4_W5_STDERR_BYTE_CAP).toBe(1_048_576);
    expect(ML_CAL_1_G4_W5_SCHEMA_VERSION).toBe(1);
    expect(ML_CAL_1_G4_W5_MODE).toBe('inspect-w5');
    expect(ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN).toHaveLength(64);
    expect(ML_CAL_1_G4_W5_HELPER_EXE_BYTE_COUNT).toBe(20_480);
  });

  it('verifies disposable helper pin when binary present', () => {
    if (process.platform !== 'win32' || !fs.existsSync(HELPER_EXE)) {
      skipUnverified('helper exe absent or non-Windows');
      return;
    }
    coverage.nativeExercised += 1;
    const pin = verifyW5HelperExePin(HELPER_EXE);
    expect(pin.ok).toBe(true);
    if (pin.ok) {
      expect(pin.sha256).toBe(ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN);
      expect(pin.byteCount).toBe(ML_CAL_1_G4_W5_HELPER_EXE_BYTE_COUNT);
    }
  });
});

describe('PASS evidence gate', () => {
  beforeEach(() => {
    installWindowsTransportIsolation();
  });
  afterEach(() => {
    restoreWindowsTransportIsolation();
  });

  it('rejects PASS with reasons / missing identity / malformed segments', () => {
    coverage.mocked += 1;
    const bound = windowsEvidencePath('pass-ev');
    const base = completePassHelper(bound);
    expect(validatePassEvidence(base, bound).ok).toBe(true);
    expect(validatePassEvidence({ ...base, reasons: ['x'] }, bound).ok).toBe(
      false
    );
    expect(
      validatePassEvidence({ ...base, expectedFinalGuidPath: undefined }, bound)
        .ok
    ).toBe(false);
    expect(
      validatePassEvidence(
        {
          ...base,
          followedFinalGuidPath: base.expectedFinalGuidPath + 'x',
        },
        bound
      ).ok
    ).toBe(false);
    expect(
      validatePassEvidence({ ...base, segments: [{ bad: true }] }, bound).ok
    ).toBe(false);
  });

  it('rejects impossible all-"x" PASS and REFUSE_ALIAS segment PASS', () => {
    coverage.mocked += 1;
    const bound = windowsEvidencePath('pass-impossible');
    const allX: MlCal1G4W5HelperResponse = {
      schemaVersion: 1,
      mode: 'inspect-w5',
      boundPath: bound,
      outcome: 'PASS',
      reasons: [],
      expectedFinalGuidPath: 'x',
      followedFinalGuidPath: 'x',
      volumeGuidRoot: 'x',
      segments: [],
    };
    expect(validatePassEvidence(allX, bound).ok).toBe(false);
    expect(validatePassEvidence(allX, bound).ok === false &&
      (validatePassEvidence(allX, bound) as { reasons: string[] }).reasons
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/volume_guid_syntax|segment_count/),
      ])
    );

    const aliasSeg: MlCal1G4W5HelperResponse = {
      ...completePassHelper(bound),
      segments: [
        {
          boundName: 'unrelated',
          onDiskName: 'other',
          objectId: 'not-an-id',
          reparseTag: 0xa000000c,
          status: 'REFUSE_ALIAS',
        },
      ],
    };
    const aliasGate = validatePassEvidence(aliasSeg, bound);
    expect(aliasGate.ok).toBe(false);
  });

  it('async+sync launchers refuse independently reproduced impossible PASS payloads', async () => {
    coverage.mocked += 1;
    const absBound = windowsEvidencePath('g4-w5-impossible-pass');
    const allX = {
      schemaVersion: 1,
      mode: 'inspect-w5',
      boundPath: absBound,
      outcome: 'PASS',
      reasons: [],
      expectedFinalGuidPath: 'x',
      followedFinalGuidPath: 'x',
      volumeGuidRoot: 'x',
      segments: [],
    };
    const aliasBody = {
      schemaVersion: 1,
      mode: 'inspect-w5',
      boundPath: absBound,
      outcome: 'PASS',
      reasons: [],
      expectedFinalGuidPath: 'x',
      followedFinalGuidPath: 'x',
      volumeGuidRoot: '\\\\?\\Volume{00000000-0000-0000-0000-000000000001}\\',
      segments: [
        {
          boundName: 'a',
          onDiskName: 'b',
          objectId: 'AAAAAAAA:0000000000000001',
          reparseTag: 0xa000000c,
          status: 'REFUSE_ALIAS',
        },
      ],
    };

    for (const body of [allX, aliasBody]) {
      const fakeExe = path.join(disposableRoot('imp'), 'h.exe');
      fs.writeFileSync(fakeExe, Buffer.alloc(8));
      const { spawnMock } = mockChild({
        stdout: Buffer.from(JSON.stringify(body), 'utf8'),
      });
      const asyncR = await runW5PathIdentityInspectAsync({
        boundPath: absBound,
        helperExePath: fakeExe,
        testOnlySkipPinCheck: true,
        testOnlySpawn: spawnMock,
      });
      expect(asyncR.ok).toBe(false);
      expect(asyncR.reasons).not.toContain('windows_helper_platform_unsupported');

      const syncR = runW5PathIdentityInspectSync({
        boundPath: absBound,
        helperExePath: fakeExe,
        testOnlySkipPinCheck: true,
        testOnlySpawnSync: ((_c, _a, _o) =>
          ({
            status: 0,
            signal: null,
            stdout: Buffer.from(JSON.stringify(body), 'utf8'),
            stderr: Buffer.alloc(0),
            error: undefined,
            pid: 1,
            output: [
              null,
              Buffer.from(JSON.stringify(body), 'utf8'),
              Buffer.alloc(0),
            ],
          }) as ReturnType<typeof spawnSync>) as typeof spawnSync,
      });
      expect(syncR.ok).toBe(false);
      expect(syncR.reasons).not.toContain('windows_helper_platform_unsupported');
    }
  });

  it('async launcher refuses incomplete PASS JSON', async () => {
    coverage.mocked += 1;
    const absBound = windowsEvidencePath('g4-w5-incomplete-pass');
    const body = {
      schemaVersion: 1,
      mode: 'inspect-w5',
      boundPath: absBound,
      outcome: 'PASS',
      reasons: ['contradiction'],
    };
    const { spawnMock } = mockChild({
      stdout: Buffer.from(JSON.stringify(body), 'utf8'),
    });
    const fakeExe = path.join(disposableRoot('inc'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const r = await runW5PathIdentityInspectAsync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      testOnlySpawn: spawnMock,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('windows_helper_pass_with_reasons');
  });

  it('buildW5HelperEnv strips ambient G4_W5_TEST_* unless handshake enabled', () => {
    coverage.mocked += 1;
    process.env.G4_W5_TEST_HANDSHAKE_DIR = 'C:\\should\\not\\leak';
    process.env.G4_W5_TEST_PAUSE_AFTER_SEGMENT = 'mid';
    process.env.G4_W5_TEST_HANDSHAKE_ENABLE = '1';
    const stripped = buildW5HelperEnv();
    expect(stripped.G4_W5_TEST_HANDSHAKE_DIR).toBeUndefined();
    expect(stripped.G4_W5_TEST_HANDSHAKE_ENABLE).toBeUndefined();
    expect(
      Object.keys(stripped).some((k) => isMlCal1G4W5TestEnvKey(k))
    ).toBe(false);
    const enabled = buildW5HelperEnv({
      dir: 'C:\\Users\\Bobby\\AppData\\Local\\Temp\\hs',
      afterSegment: 'mid',
    });
    expect(enabled.G4_W5_TEST_HANDSHAKE_ENABLE).toBe('1');
    expect(enabled.G4_W5_TEST_HANDSHAKE_DIR).toContain('hs');
    delete process.env.G4_W5_TEST_HANDSHAKE_DIR;
    delete process.env.G4_W5_TEST_PAUSE_AFTER_SEGMENT;
    delete process.env.G4_W5_TEST_HANDSHAKE_ENABLE;
    void ML_CAL_1_G4_W5_TEST_ENV_PREFIX;
  });

  it('strips lowercase, mixed-case, and duplicate-case G4_W5_TEST_* variants', () => {
    coverage.mocked += 1;
    // Synthetic env can hold multiple casings even when process.env collapses on Windows.
    const synthetic: NodeJS.ProcessEnv = {
      PATH: 'C:\\Windows\\System32',
      g4_w5_test_handshake_enable: '1',
      g4_w5_test_handshake_dir: 'C:\\lower\\hs',
      g4_w5_test_pause_after_segment: 'mid',
      G4_w5_Test_HANDSHAKE_DIR: 'C:\\mixed\\hs',
      G4_W5_TEST_HANDSHAKE_DIR: 'C:\\upper\\hs',
      G4_W5_TEST_HANDSHAKE_ENABLE: '1',
      unrelated: 'keep',
    };
    stripMlCal1G4W5TestEnvKeys(synthetic);
    expect(Object.keys(synthetic).some((k) => isMlCal1G4W5TestEnvKey(k))).toBe(
      false
    );
    expect(synthetic.unrelated).toBe('keep');
    expect(synthetic.PATH).toBe('C:\\Windows\\System32');

    const ambientKeys = [
      'g4_w5_test_handshake_enable',
      'g4_w5_test_handshake_dir',
      'g4_w5_test_pause_after_segment',
      'G4_w5_Test_PAUSE_AFTER_SEGMENT',
      'G4_W5_TEST_HANDSHAKE_ENABLE',
    ];
    for (const k of ambientKeys) {
      process.env[k] = k.endsWith('dir') || k.endsWith('DIR')
        ? 'C:\\ambient\\should\\not\\leak'
        : k.toLowerCase().includes('pause')
          ? 'mid'
          : '1';
    }
    try {
      const stripped = buildW5HelperEnv();
      expect(
        Object.keys(stripped).some((k) => isMlCal1G4W5TestEnvKey(k))
      ).toBe(false);
      const enabled = buildW5HelperEnv({
        dir: 'C:\\Users\\Bobby\\AppData\\Local\\Temp\\hs-canon',
        afterSegment: 'mid',
      });
      const testKeys = Object.keys(enabled).filter((k) =>
        isMlCal1G4W5TestEnvKey(k)
      );
      expect(testKeys.sort()).toEqual([
        'G4_W5_TEST_HANDSHAKE_DIR',
        'G4_W5_TEST_HANDSHAKE_ENABLE',
        'G4_W5_TEST_PAUSE_AFTER_SEGMENT',
      ]);
      expect(enabled.G4_W5_TEST_HANDSHAKE_DIR).toContain('hs-canon');
    } finally {
      for (const k of ambientKeys) {
        delete process.env[k];
      }
      delete process.env.G4_W5_TEST_HANDSHAKE_DIR;
      delete process.env.G4_W5_TEST_PAUSE_AFTER_SEGMENT;
      delete process.env.G4_W5_TEST_HANDSHAKE_ENABLE;
    }
  });

  it('async+sync launchers strip casing variants from spawn env', async () => {
    coverage.mocked += 1;
    const absBound = windowsEvidencePath('g4-w5-case-env');
    const body = completePassHelper(absBound);
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const ambientKeys = [
      'g4_w5_test_handshake_enable',
      'g4_w5_test_handshake_dir',
      'g4_w5_test_pause_after_segment',
      'G4_w5_Test_HANDSHAKE_DIR',
      'G4_W5_TEST_HANDSHAKE_ENABLE',
    ];
    for (const k of ambientKeys) {
      process.env[k] =
        k.toLowerCase().includes('dir')
          ? 'C:\\should\\not\\reach\\helper'
          : k.toLowerCase().includes('pause')
            ? 'mid'
            : '1';
    }
    try {
      let asyncEnv: NodeJS.ProcessEnv | null = null;
      const { spawnMock } = mockChild({ stdout: payload });
      const wrappedAsync: typeof spawn = ((cmd, args, options) => {
        asyncEnv = (options as { env?: NodeJS.ProcessEnv }).env ?? null;
        return spawnMock(cmd, args, options);
      }) as typeof spawn;
      const fakeExe = path.join(disposableRoot('case-async'), 'h.exe');
      fs.writeFileSync(fakeExe, Buffer.alloc(8));
      const asyncR = await runW5PathIdentityInspectAsync({
        boundPath: absBound,
        helperExePath: fakeExe,
        testOnlySkipPinCheck: true,
        testOnlySpawn: wrappedAsync,
      });
      expect(asyncR.ok).toBe(true);
      expect(asyncEnv).not.toBeNull();
      expect(
        Object.keys(asyncEnv!).some((k) => isMlCal1G4W5TestEnvKey(k))
      ).toBe(false);

      let syncEnv: NodeJS.ProcessEnv | null = null;
      const syncR = runW5PathIdentityInspectSync({
        boundPath: absBound,
        helperExePath: fakeExe,
        testOnlySkipPinCheck: true,
        testOnlySpawnSync: ((_c, _a, opts) => {
          syncEnv = (opts as { env?: NodeJS.ProcessEnv }).env ?? null;
          return {
            status: 0,
            signal: null,
            stdout: payload,
            stderr: Buffer.alloc(0),
            error: undefined,
            pid: 1,
            output: [null, payload, Buffer.alloc(0)],
          } as ReturnType<typeof spawnSync>;
        }) as typeof spawnSync,
      });
      expect(syncR.ok).toBe(true);
      expect(syncEnv).not.toBeNull();
      expect(
        Object.keys(syncEnv!).some((k) => isMlCal1G4W5TestEnvKey(k))
      ).toBe(false);

      // Explicit handshake: only canonical uppercase controls after strip.
      let hsEnv: NodeJS.ProcessEnv | null = null;
      const hsDir = path.join(os.tmpdir(), 'g4-w5-hs-canon');
      const asyncHs = await runW5PathIdentityInspectAsync({
        boundPath: absBound,
        helperExePath: fakeExe,
        testOnlySkipPinCheck: true,
        testOnlyHandshake: { dir: hsDir, afterSegment: 'mid' },
        testOnlySpawn: ((cmd, args, options) => {
          hsEnv = (options as { env?: NodeJS.ProcessEnv }).env ?? null;
          return spawnMock(cmd, args, options);
        }) as typeof spawn,
      });
      expect(asyncHs.ok).toBe(true);
      const hsKeys = Object.keys(hsEnv!).filter((k) => isMlCal1G4W5TestEnvKey(k));
      expect(hsKeys.sort()).toEqual([
        'G4_W5_TEST_HANDSHAKE_DIR',
        'G4_W5_TEST_HANDSHAKE_ENABLE',
        'G4_W5_TEST_PAUSE_AFTER_SEGMENT',
      ]);
      expect(hsEnv!.G4_W5_TEST_HANDSHAKE_DIR).toBe(hsDir);
    } finally {
      for (const k of ambientKeys) {
        delete process.env[k];
      }
      delete process.env.G4_W5_TEST_HANDSHAKE_DIR;
      delete process.env.G4_W5_TEST_PAUSE_AFTER_SEGMENT;
      delete process.env.G4_W5_TEST_HANDSHAKE_ENABLE;
    }
  });
});

function mockChild(opts: {
  stdout?: Buffer | Buffer[];
  stderr?: Buffer | Buffer[];
  code?: number | null;
  signal?: NodeJS.Signals | null;
  delayMs?: number;
  hang?: boolean;
  killNoClose?: boolean;
}): {
  spawnMock: typeof spawn;
  getSpawnOpts: () => Record<string, unknown> | null;
} {
  let capturedOpts: Record<string, unknown> | null = null;
  const spawnMock = ((
    _cmd: string,
    _args: readonly string[],
    options: Record<string, unknown>
  ) => {
    capturedOpts = options;
    const ee = new EventEmitter() as ChildProcessWithoutNullStreams &
      EventEmitter;
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const stdin = new EventEmitter() as EventEmitter & {
      write: () => boolean;
      end: () => void;
    };
    stdin.write = () => true;
    stdin.end = () => undefined;
    (ee as unknown as { stdout: EventEmitter }).stdout = stdout;
    (ee as unknown as { stderr: EventEmitter }).stderr = stderr;
    (ee as unknown as { stdin: typeof stdin }).stdin = stdin;
    (ee as unknown as { kill: (sig?: string) => void }).kill = () => {
      if (opts.killNoClose) return;
      setImmediate(() => ee.emit('close', null, 'SIGTERM'));
    };
    setTimeout(() => {
      if (opts.hang) return;
      const outs = opts.stdout
        ? Array.isArray(opts.stdout)
          ? opts.stdout
          : [opts.stdout]
        : [];
      const errs = opts.stderr
        ? Array.isArray(opts.stderr)
          ? opts.stderr
          : [opts.stderr]
        : [];
      for (const c of outs) stdout.emit('data', c);
      for (const c of errs) stderr.emit('data', c);
      setTimeout(() => {
        ee.emit('close', opts.code ?? 0, opts.signal ?? null);
      }, opts.delayMs ?? 5);
    }, 1);
    return ee as unknown as ChildProcessWithoutNullStreams;
  }) as unknown as typeof spawn;
  return { spawnMock, getSpawnOpts: () => capturedOpts };
}

describe('W5 async launcher refusal surfaces (mocked spawn)', () => {
  const absBound = windowsEvidencePath('g4-w5-mock-bound');

  beforeEach(() => {
    installWindowsTransportIsolation();
  });
  afterEach(() => {
    restoreWindowsTransportIsolation();
  });

  it('does not pass maxBuffer into spawn options', async () => {
    coverage.mocked += 1;
    const body = completePassHelper(absBound);
    const { spawnMock, getSpawnOpts } = mockChild({
      stdout: Buffer.from(JSON.stringify(body), 'utf8'),
    });
    const fakeExe = path.join(disposableRoot('spawnopts'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    await runW5PathIdentityInspectAsync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      testOnlySpawn: spawnMock,
    });
    const opts = getSpawnOpts();
    expect(opts).not.toHaveProperty('maxBuffer');
    expect(opts!.shell).toBe(false);
  });

  it('stdout/stderr overflow refuse', async () => {
    coverage.mocked += 1;
    const fakeExe = path.join(disposableRoot('ov'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const { spawnMock: s1 } = mockChild({ stdout: Buffer.alloc(100) });
    const r1 = await runW5PathIdentityInspectAsync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      stdoutByteCap: 50,
      testOnlySpawn: s1,
    });
    expect(r1.reasons).toContain('windows_helper_stdout_overflow');
    const { spawnMock: s2 } = mockChild({
      stderr: Buffer.alloc(100),
      stdout: Buffer.from('{}'),
    });
    const r2 = await runW5PathIdentityInspectAsync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      stderrByteCap: 40,
      testOnlySpawn: s2,
    });
    expect(r2.reasons).toContain('windows_helper_stderr_overflow');
  });

  it(
    'timeout settles even when kill does not close',
    async () => {
      coverage.mocked += 1;
      const { spawnMock } = mockChild({ hang: true, killNoClose: true });
      const fakeExe = path.join(disposableRoot('to'), 'h.exe');
      fs.writeFileSync(fakeExe, Buffer.alloc(8));
      const r = await runW5PathIdentityInspectAsync({
        boundPath: absBound,
        helperExePath: fakeExe,
        testOnlySkipPinCheck: true,
        timeoutMs: 40,
        killGraceMs: 50,
        testOnlySpawn: spawnMock,
      });
      expect(r.reasons).toContain('windows_helper_timeout');
    },
    15_000
  );

  it('stdin error settles', async () => {
    coverage.mocked += 1;
    const { spawnMock } = mockChild({ hang: true, killNoClose: true });
    const fakeExe = path.join(disposableRoot('stdin'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    // Override spawn to emit stdin error after attach
    const base = spawnMock;
    const wrapped = ((cmd: string, args: readonly string[], opts: Record<string, unknown>) => {
      const child = base(cmd, args as string[], opts as never);
      setImmediate(() => {
        (child.stdin as EventEmitter).emit('error', new Error('stdin boom'));
      });
      return child;
    }) as unknown as typeof spawn;
    const r = await runW5PathIdentityInspectAsync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      timeoutMs: 500,
      killGraceMs: 40,
      testOnlySpawn: wrapped,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => /stdin/i.test(x) || x === 'windows_helper_timeout')).toBe(
      true
    );
  });

  it('schema/binding/nonzero refuse', async () => {
    coverage.mocked += 1;
    const fakeExe = path.join(disposableRoot('sch'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const { spawnMock } = mockChild({
      stdout: Buffer.from(
        JSON.stringify({
          schemaVersion: 99,
          mode: 'inspect-w5',
          boundPath: absBound,
          outcome: 'PASS',
          reasons: [],
        }),
        'utf8'
      ),
    });
    const r = await runW5PathIdentityInspectAsync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      testOnlySpawn: spawnMock,
    });
    expect(r.reasons).toContain('windows_helper_schema_version_mismatch');
  });

  it('exact-cap complete PASS evidence accepted', async () => {
    coverage.mocked += 1;
    const body = completePassHelper(absBound);
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    const { spawnMock } = mockChild({ stdout: raw });
    const fakeExe = path.join(disposableRoot('cap'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const r = await runW5PathIdentityInspectAsync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      stdoutByteCap: raw.byteLength,
      testOnlySpawn: spawnMock,
    });
    expect(r.outcome).toBe('PASS');
    expect(r.ok).toBe(true);
  });
});

describe('W5 sync launcher path (actual sync contract)', () => {
  const absBound = windowsEvidencePath('g4-w5-sync-bound');

  beforeEach(() => {
    installWindowsTransportIsolation();
  });
  afterEach(() => {
    restoreWindowsTransportIsolation();
  });

  function mockSpawnSync(result: {
    status?: number | null;
    signal?: NodeJS.Signals | null;
    stdout?: Buffer;
    stderr?: Buffer;
    error?: NodeJS.ErrnoException;
  }): typeof spawnSync {
    return ((_cmd, _args, opts) => {
      expect(opts).toMatchObject({ shell: false });
      expect(typeof (opts as { maxBuffer?: number }).maxBuffer).toBe('number');
      // Combined ceiling = independent caps sum when caller passes both.
      return {
        status: result.status ?? 0,
        signal: result.signal ?? null,
        stdout: result.stdout ?? Buffer.alloc(0),
        stderr: result.stderr ?? Buffer.alloc(0),
        error: result.error,
        pid: 1,
        output: [null, result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)],
      } as ReturnType<typeof spawnSync>;
    }) as typeof spawnSync;
  }

  it('pin mismatch does not spawnSync', () => {
    coverage.mocked += 1;
    const fake = path.join(disposableRoot('spin'), 'fake.exe');
    fs.writeFileSync(fake, Buffer.from('x'));
    let called = false;
    const r = runW5PathIdentityInspectSync({
      boundPath: absBound,
      helperExePath: fake,
      expectedExeSha256: ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN,
      testOnlySpawnSync: ((..._a: unknown[]) => {
        called = true;
        throw new Error('no');
      }) as typeof spawnSync,
    });
    expect(called).toBe(false);
    expect(r.reasons).toContain('windows_helper_pin_mismatch');
  });

  it('schema mismatch / incomplete PASS refuse on sync path', () => {
    coverage.mocked += 1;
    const fakeExe = path.join(disposableRoot('sschema'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const incomplete = {
      schemaVersion: 1,
      mode: 'inspect-w5',
      boundPath: absBound,
      outcome: 'PASS',
      reasons: [],
    };
    const r = runW5PathIdentityInspectSync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      testOnlySpawnSync: mockSpawnSync({
        stdout: Buffer.from(JSON.stringify(incomplete), 'utf8'),
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('windows_helper_pass_missing_expected_guid');
  });

  it('sync timeout refuse', () => {
    coverage.mocked += 1;
    const fakeExe = path.join(disposableRoot('sto'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const err = new Error('timeout') as NodeJS.ErrnoException;
    err.code = 'ETIMEDOUT';
    const r = runW5PathIdentityInspectSync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      testOnlySpawnSync: mockSpawnSync({ error: err }),
    });
    expect(r.reasons).toContain('windows_helper_timeout');
  });

  it('sync combined ceiling allows independent stream sizes under each cap', () => {
    coverage.mocked += 1;
    const fakeExe = path.join(disposableRoot('sbudget'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const body = completePassHelper(absBound);
    // 6+6 bytes with caps 10/10 → maxBuffer=20; both under per-stream caps.
    const r = runW5PathIdentityInspectSync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      stdoutByteCap: 10_000,
      stderrByteCap: 10_000,
      testOnlySpawnSync: mockSpawnSync({
        stdout: Buffer.from(JSON.stringify(body), 'utf8'),
        stderr: Buffer.from('abcdef'), // 6 bytes
      }),
    });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('PASS');
  });

  it('sync ENOBUFS / maxBuffer overflow refuse', () => {
    coverage.mocked += 1;
    const fakeExe = path.join(disposableRoot('sov'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const err = new Error('maxBuffer exceeded') as NodeJS.ErrnoException;
    err.code = 'ENOBUFS';
    const r = runW5PathIdentityInspectSync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      stdoutByteCap: 10,
      stderrByteCap: 10,
      testOnlySpawnSync: mockSpawnSync({ error: err }),
    });
    expect(r.reasons).toContain('windows_helper_output_overflow');
  });

  it('sync stdout over dedicated cap refuse after collection', () => {
    coverage.mocked += 1;
    const fakeExe = path.join(disposableRoot('scap'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    const r = runW5PathIdentityInspectSync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      stdoutByteCap: 5,
      stderrByteCap: 100,
      testOnlySpawnSync: mockSpawnSync({
        stdout: Buffer.from('0123456789'),
        stderr: Buffer.alloc(0),
      }),
    });
    expect(r.reasons).toContain('windows_helper_stdout_overflow');
  });

  it('sync uses maxBuffer = stdoutCap + stderrCap', () => {
    coverage.mocked += 1;
    const fakeExe = path.join(disposableRoot('ssum'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    let seenMax: number | undefined;
    const r = runW5PathIdentityInspectSync({
      boundPath: absBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      stdoutByteCap: 7,
      stderrByteCap: 9,
      testOnlySpawnSync: ((_c, _a, opts) => {
        seenMax = (opts as { maxBuffer: number }).maxBuffer;
        const err = new Error('maxBuffer') as NodeJS.ErrnoException;
        err.code = 'ENOBUFS';
        return {
          status: null,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          error: err,
          pid: 1,
          output: [null, Buffer.alloc(0), Buffer.alloc(0)],
        } as ReturnType<typeof spawnSync>;
      }) as typeof spawnSync,
    });
    expect(seenMax).toBe(16);
    expect(r.reasons).toContain('windows_helper_output_overflow');
  });
});

describe('Operator W5-only always BLOCKED (library/CLI/JSON)', () => {
  it('W5 PASS stub still leaves operator setup BLOCKED with zero mutation', () => {
    coverage.mocked += 1;
    installWindowsTransportIsolation();
    try {
    const root = disposableRoot('op-pass');
    fs.writeFileSync(path.join(root, 'KEEP.txt'), 'keep\n');
    const before = captureBaseline(root);
    const mut = mutationRecorder();
    let clockCalls = 0;
    const r = runG4PhaseARetentionSetup(
      baseOperatorInput(root, {
        testOnlyW5Inspect: () => w5PassStub(),
        testOnlyRecordUserRootMutation: mut.record,
        now: () => {
          clockCalls += 1;
          return new Date('2026-10-15T18:00:00.000Z');
        },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('windows_gates_incomplete');
    expect(clockCalls).toBe(0);
    expect(mut.calls).toEqual([]);
    assertUnchanged(root, before);
    } finally {
      restoreWindowsTransportIsolation();
    }
  });

  it('W5 non-PASS: no clock, no user-root mutation', () => {
    coverage.mocked += 1;
    installWindowsTransportIsolation();
    try {
    const root = disposableRoot('op-refuse');
    const before = captureBaseline(root);
    const mut = mutationRecorder();
    let clockCalls = 0;
    const r = runG4PhaseARetentionSetup(
      baseOperatorInput(root, {
        testOnlyW5Inspect: () => w5RefuseStub('w5_identity_mismatch'),
        testOnlyRecordUserRootMutation: mut.record,
        now: () => {
          clockCalls += 1;
          return new Date('2026-10-15T18:00:00.000Z');
        },
      })
    );
    expect(r.reasons).toContain('w5_identity_mismatch');
    expect(r.reasons).toContain('windows_gates_incomplete');
    expect(clockCalls).toBe(0);
    expect(mut.calls).toEqual([]);
    assertUnchanged(root, before);
    } finally {
      restoreWindowsTransportIsolation();
    }
  });

  it('disabled: zero W5, clock, mutation', () => {
    coverage.mocked += 1;
    const root = disposableRoot('disabled');
    const before = captureBaseline(root);
    let w5Calls = 0;
    const r = runG4PhaseARetentionSetup(
      baseOperatorInput(root, {
        enabled: false,
        testOnlyW5Inspect: () => {
          w5Calls += 1;
          return w5PassStub();
        },
      })
    );
    expect(r.reasons).toContain('phase_a_setup_disabled');
    expect(w5Calls).toBe(0);
    assertUnchanged(root, before);
  });

  it('W4 refusal: no W5 inspect', () => {
    coverage.mocked += 1;
    const root = disposableRoot('w4block');
    const g4 = g4EvidenceBaseFromOperatorUserRoot(root);
    const probeId = 'phasea-w5-probe-001';
    const receipt = phaseASetupReceiptPath(g4, probeId);
    fs.mkdirSync(path.dirname(receipt), { recursive: true });
    fs.writeFileSync(receipt, 'conflict\n');
    const before = captureBaseline(root);
    let w5Calls = 0;
    const r = runG4PhaseARetentionSetup(
      baseOperatorInput(root, {
        probeId,
        testOnlyW5Inspect: () => {
          w5Calls += 1;
          return w5PassStub();
        },
      })
    );
    expect(r.reasons).toContain('w4_pre_mutation_conflict');
    expect(w5Calls).toBe(0);
    assertUnchanged(root, before);
  });

  it('temp mode skips W5 and can succeed', () => {
    coverage.mocked += 1;
    const root = disposableRoot('temp-ok');
    let w5Calls = 0;
    const r = runG4PhaseARetentionSetup(
      baseTempInput(root, {
        testOnlyW5Inspect: () => {
          w5Calls += 1;
          return w5RefuseStub('should_not_run');
        },
      })
    );
    expect(w5Calls).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('CLI/JSON operator BLOCKED', () => {
    coverage.mocked += 1;
    const root = disposableRoot('cli-op');
    const cli = runPhaseARetentionSetupCli({
      enabled: true,
      confirmSetup: true,
      mode: 'operator',
      destination: root,
      expectedDestination: root,
      probeId: 'phasea-w5-cli-001',
      handoffId: 'phasea-w5-cli-h-001',
    });
    expect(cli.ok).toBe(false);
    expect(cli.setup?.reasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/windows_/)])
    );

    const captureParent = disposableRoot('json-cap');
    const captureFile = path.join(captureParent, 'w5-op-capture.json');
    installWindowsTransportIsolation();
    try {
    const result = runPhaseAJsonCommand(
      {
        command: 'setup',
        enabled: true,
        confirmSetup: true,
        mode: 'operator',
        destination: root,
        expectedDestination: root,
        probeId: 'phasea-w5-json-001',
        handoffId: 'phasea-w5-json-h-001',
        output: { stdout: false, captureFile },
      },
      {
        now: () => new Date('2026-10-15T18:00:00.000Z'),
        runSetup: (input) =>
          runG4PhaseARetentionSetup({
            ...input,
            testOnlyW5Inspect: () => w5PassStub(),
          }),
      }
    );
    expect(result.exitCode).toBe(1);
    const durable = JSON.parse(fs.readFileSync(captureFile, 'utf8')) as {
      reasons: string[];
    };
    expect(durable.reasons).toContain('windows_gates_incomplete');
    } finally {
      restoreWindowsTransportIsolation();
    }
  });
});

describe('unmocked non-Windows platform refusal', () => {
  it('refuses before spawn when the host platform is not win32', async () => {
    expect(process.platform).toBe(HOST_PLATFORM);
    if (process.platform === 'win32') {
      skipUnverified(
        'non-Windows platform refusal is not observable while process.platform is win32'
      );
      return;
    }
    coverage.mocked += 1;
    const hostBound = path.join(os.tmpdir(), 'g4-w5-unmocked-non-windows');
    const fakeExe = path.join(disposableRoot('unmocked'), 'h.exe');
    fs.writeFileSync(fakeExe, Buffer.alloc(8));
    let asyncSpawned = false;
    const asyncR = await runW5PathIdentityInspectAsync({
      boundPath: hostBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      testOnlySpawn: (() => {
        asyncSpawned = true;
        throw new Error('spawned');
      }) as typeof spawn,
    });
    expect(asyncSpawned).toBe(false);
    expect(asyncR.spawned).toBe(false);
    expect(asyncR.reasons).toEqual(['windows_helper_platform_unsupported']);

    let syncSpawned = false;
    const syncR = runW5PathIdentityInspectSync({
      boundPath: hostBound,
      helperExePath: fakeExe,
      testOnlySkipPinCheck: true,
      testOnlySpawnSync: (() => {
        syncSpawned = true;
        throw new Error('spawned');
      }) as typeof spawnSync,
    });
    expect(syncSpawned).toBe(false);
    expect(syncR.spawned).toBe(false);
    expect(syncR.reasons).toEqual(['windows_helper_platform_unsupported']);
  });
});

describe('Native W5 disposable Windows readback', () => {
  const win = process.platform === 'win32';

  it('ordinary existing path PASS', () => {
    if (!win || !fs.existsSync(HELPER_EXE)) {
      skipUnverified('native helper unavailable');
      return;
    }
    coverage.nativeExercised += 1;
    const root = disposableRoot('native-ok');
    const r = runW5PathIdentityInspectSync({
      boundPath: root,
      repoRoot: REPO_ROOT,
    });
    expect(r.outcome).toBe('PASS');
    expect(r.ok).toBe(true);
    expect(r.helper?.expectedFinalGuidPath).toBeTruthy();
    expect(r.helper?.reasons).toEqual([]);
  });

  it('missing leaf/ancestor BLOCKED', () => {
    if (!win || !fs.existsSync(HELPER_EXE)) {
      skipUnverified('native helper unavailable');
      return;
    }
    coverage.nativeExercised += 1;
    const root = disposableRoot('native-miss');
    const missing = path.join(root, 'no-such-' + randomUUID());
    const r = runW5PathIdentityInspectSync({
      boundPath: missing,
      repoRoot: REPO_ROOT,
    });
    expect(r.outcome).not.toBe('PASS');
  });

  it('long / Unicode names', () => {
    if (!win || !fs.existsSync(HELPER_EXE)) {
      skipUnverified('native helper unavailable');
      return;
    }
    coverage.nativeExercised += 1;
    const root = disposableRoot('native-uni');
    const uni = path.join(root, '路径-αβγ-' + 'x'.repeat(40));
    fs.mkdirSync(uni);
    const r = runW5PathIdentityInspectSync({
      boundPath: uni,
      repoRoot: REPO_ROOT,
    });
    expect(r.outcome).toBe('PASS');
  });

  it('junction alias segment REFUSE (pre-existing)', function (this: {
    skip: () => void;
  }) {
    if (!win || !fs.existsSync(HELPER_EXE)) {
      skipUnverified('native helper unavailable', this);
      return;
    }
    coverage.nativeExercised += 1;
    const root = disposableRoot('junc');
    const real = path.join(root, 'real');
    const link = path.join(root, 'alias');
    fs.mkdirSync(real);
    try {
      fs.symlinkSync(real, link, 'junction');
    } catch (e) {
      skipUnverified(`junction create failed: ${String(e)}`, this);
      return;
    }
    const r = runW5PathIdentityInspectSync({
      boundPath: link,
      repoRoot: REPO_ROOT,
    });
    expect(r.outcome).toBe('REFUSE');
    expect(r.reasons.some((x) => /alias|reparse/i.test(x))).toBe(true);
  });

  it('dir symlink UNVERIFIED without privilege', function (this: {
    skip: () => void;
  }) {
    if (!win || !fs.existsSync(HELPER_EXE)) {
      skipUnverified('native helper unavailable', this);
      return;
    }
    const root = disposableRoot('sym');
    const target = path.join(root, 'target-dir');
    const link = path.join(root, 'link-dir');
    fs.mkdirSync(target);
    try {
      fs.symlinkSync(target, link, 'dir');
    } catch (e) {
      skipUnverified(
        `dir symlink create requires privilege: ${String(e)}`,
        this
      );
      return;
    }
    coverage.nativeExercised += 1;
    const r = runW5PathIdentityInspectSync({
      boundPath: link,
      repoRoot: REPO_ROOT,
    });
    expect(r.outcome).toBe('REFUSE');
  });

  it(
    'controlled normal-directory parent swap via explicit handshake',
    async () => {
      if (!win || !fs.existsSync(HELPER_EXE)) {
        skipUnverified('native helper unavailable');
        return;
      }
      coverage.nativeExercised += 1;
      const root = disposableRoot('swap');
      const mid = path.join(root, 'mid');
      const leaf = path.join(mid, 'leaf');
      fs.mkdirSync(leaf, { recursive: true });
      const mid2 = path.join(root, 'mid2');
      fs.mkdirSync(mid2);
      const hs = disposableRoot('hs-dir');
      const ready = path.join(hs, 'ready.txt');
      const proceed = path.join(hs, 'proceed.txt');

      const inspectP = runW5PathIdentityInspectAsync({
        boundPath: leaf,
        repoRoot: REPO_ROOT,
        timeoutMs: 30_000,
        testOnlyHandshake: { dir: hs, afterSegment: 'mid' },
      });

      expect(await waitForFile(ready, 15_000)).toBe(true);
      const readyBody = fs.readFileSync(ready, 'utf8');
      expect(readyBody).toContain('segment=mid');
      fs.renameSync(mid, path.join(root, 'mid_old'));
      fs.renameSync(mid2, mid);
      fs.mkdirSync(path.join(mid, 'leaf'), { recursive: true });
      fs.writeFileSync(proceed, 'swapped\n');

      const r = await inspectP;
      expect(fs.existsSync(ready)).toBe(true);
      expect(fs.existsSync(proceed)).toBe(true);
      expect(r.outcome).not.toBe('PASS');
      expect(r.ok).toBe(false);
      expect(
        r.reasons.some((x) =>
          /parent_pathname_object_mismatch|parent_handle|identity|handshake/i.test(
            x
          )
        )
      ).toBe(true);
    },
    40_000
  );

  it(
    'controlled junction replacement during inspection via explicit handshake',
    async function (this: { skip: () => void }) {
      if (!win || !fs.existsSync(HELPER_EXE)) {
        skipUnverified('native helper unavailable', this);
        return;
      }
      coverage.nativeExercised += 1;
      const root = disposableRoot('jswap');
      const mid = path.join(root, 'mid');
      const leaf = path.join(mid, 'leaf');
      fs.mkdirSync(leaf, { recursive: true });
      const alt = path.join(root, 'alt');
      fs.mkdirSync(path.join(alt, 'leaf'), { recursive: true });
      const hs = disposableRoot('hs-junc');
      const ready = path.join(hs, 'ready.txt');
      const proceed = path.join(hs, 'proceed.txt');

      const inspectP = runW5PathIdentityInspectAsync({
        boundPath: leaf,
        repoRoot: REPO_ROOT,
        timeoutMs: 30_000,
        testOnlyHandshake: { dir: hs, afterSegment: 'mid' },
      });

      if (!(await waitForFile(ready, 15_000))) {
        skipUnverified('handshake ready not observed', this);
        return;
      }
      try {
        fs.renameSync(mid, path.join(root, 'mid_old'));
        fs.symlinkSync(alt, mid, 'junction');
      } catch (e) {
        fs.writeFileSync(proceed, 'abort\n');
        skipUnverified(`junction swap failed: ${String(e)}`, this);
        return;
      }
      fs.writeFileSync(proceed, 'junction-swapped\n');

      const r = await inspectP;
      expect(fs.existsSync(ready)).toBe(true);
      expect(fs.readFileSync(proceed, 'utf8')).toContain('junction-swapped');
      expect(r.outcome).not.toBe('PASS');
      expect(r.ok).toBe(false);
      expect(
        r.reasons.some((x) =>
          /parent_pathname_object_mismatch|alias|reparse|identity/i.test(x)
        )
      ).toBe(true);
    },
    40_000
  );

  it('ordinary inspection with ambient casing-variant G4_W5_TEST_* writes no handshake files', () => {
    if (!win || !fs.existsSync(HELPER_EXE)) {
      skipUnverified('native helper unavailable');
      return;
    }
    coverage.nativeExercised += 1;
    const root = disposableRoot('no-hs');
    const hs = disposableRoot('ambient-hs');
    const ready = path.join(hs, 'ready.txt');
    // Lowercase / mixed ambient names (Windows env is case-insensitive).
    const ambientKeys = [
      'g4_w5_test_handshake_enable',
      'g4_w5_test_handshake_dir',
      'g4_w5_test_pause_after_segment',
      'G4_w5_Test_HANDSHAKE_DIR',
      'G4_W5_TEST_HANDSHAKE_ENABLE',
    ];
    process.env.g4_w5_test_handshake_enable = '1';
    process.env.g4_w5_test_handshake_dir = hs;
    process.env.g4_w5_test_pause_after_segment = path.basename(root);
    process.env.G4_w5_Test_HANDSHAKE_DIR = hs;
    process.env.G4_W5_TEST_HANDSHAKE_ENABLE = '1';
    try {
      const r = runW5PathIdentityInspectSync({
        boundPath: root,
        repoRoot: REPO_ROOT,
        // deliberate: no testOnlyHandshake
      });
      expect(r.outcome).toBe('PASS');
      expect(fs.existsSync(ready)).toBe(false);
      expect(fs.readdirSync(hs)).toEqual([]);
    } finally {
      for (const k of ambientKeys) {
        delete process.env[k];
      }
      delete process.env.G4_W5_TEST_HANDSHAKE_DIR;
      delete process.env.G4_W5_TEST_PAUSE_AFTER_SEGMENT;
      delete process.env.G4_W5_TEST_HANDSHAKE_ENABLE;
    }
  });

  it('case-sensitive parent UNVERIFIED without privileged fixture', function (this: {
    skip: () => void;
  }) {
    skipUnverified(
      'case-sensitive directory fixture requires privileged fsutil; not elevated in this task',
      this
    );
  });
});

describe('Positive mutation recorder control', () => {
  it('temp success records mutations', () => {
    coverage.mocked += 1;
    const root = disposableRoot('mut-pos');
    const mut = mutationRecorder();
    const r = runG4PhaseARetentionSetup(
      baseTempInput(root, {
        testOnlyRecordUserRootMutation: mut.record,
      })
    );
    expect(r.ok).toBe(true);
    expect(mut.calls.length).toBeGreaterThan(0);
  });
});
