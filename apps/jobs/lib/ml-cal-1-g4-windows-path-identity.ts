/**
 * ML-CAL-1 G4 Windows W5 path-identity launcher (Node).
 *
 * Verifies a pinned helper executable, then runs a bounded inspect-w5 request.
 * Helper PASS is inspection success only — never operator setup approval.
 *
 * Import is passive: no spawn, download, or compilation at module load.
 *
 * Sync public callers (runG4PhaseARetentionSetup) use runW5PathIdentityInspectSync,
 * which shares pin/schema/caps with the async spawn launcher. Launcher unit tests
 * exercise child_process.spawn without maxBuffer (async path). Sync path uses
 * spawnSync with frozen maxBuffer to preserve the existing synchronous setup API
 * without a material async redesign of library/CLI/JSON callers.
 */

import { createHash } from 'crypto';
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Schema / mode correspondence required of helper JSON. */
export const ML_CAL_1_G4_W5_SCHEMA_VERSION = 1 as const;
export const ML_CAL_1_G4_W5_MODE = 'inspect-w5' as const;

/** Frozen I/O / process limits (implementation freeze). */
export const ML_CAL_1_G4_W5_STDOUT_BYTE_CAP = 1_048_576 as const; // 1 MiB
export const ML_CAL_1_G4_W5_STDERR_BYTE_CAP = 1_048_576 as const; // 1 MiB (independent)
export const ML_CAL_1_G4_W5_TIMEOUT_MS = 15_000 as const;
export const ML_CAL_1_G4_W5_KILL_GRACE_MS = 1_000 as const;
export const ML_CAL_1_G4_W5_STDIN_BYTE_CAP = 65_536 as const;
export const ML_CAL_1_G4_W5_BOUND_PATH_CHAR_CAP = 32_767 as const;
export const ML_CAL_1_G4_W5_MAX_SEGMENTS = 256 as const;

/**
 * Disposable Framework csc test-only build pin (win-x64 /platform:x64).
 * Origin: local build of tools/windows-g4-fs-inspect/Program.cs with
 * %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
 * /nologo /optimize+ /target:exe /platform:x64
 * → tools/windows-g4-fs-inspect/bin/WindowsG4FsInspect.exe
 * Self-contained `dotnet publish` RID win-x64 is BLOCKED (SDK not on PATH).
 * This pin is NOT a production signing identity.
 */
export const ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN =
  '9fc710026f177525994126673f084274e94d17615ec136a72b60d3e7a558c9b5';
export const ML_CAL_1_G4_W5_HELPER_EXE_BYTE_COUNT = 20_480;

/** Relative path from repository root (absolute path resolved at call time). */
export const ML_CAL_1_G4_W5_HELPER_RELATIVE_PATH = path.join(
  'tools',
  'windows-g4-fs-inspect',
  'bin',
  'WindowsG4FsInspect.exe'
);

export type MlCal1G4W5InspectOutcome = 'PASS' | 'REFUSE' | 'BLOCKED';

export interface MlCal1G4W5HelperResponse {
  schemaVersion: number;
  mode: string;
  boundPath: string;
  outcome: MlCal1G4W5InspectOutcome;
  reasons: string[];
  expectedFinalGuidPath?: string;
  followedFinalGuidPath?: string;
  followedFinalNtPath?: string;
  volumeGuidRoot?: string;
  segments?: unknown[];
  notes?: string[];
  limitations?: string[];
}

export interface MlCal1G4W5InspectResult {
  ok: boolean;
  outcome: MlCal1G4W5InspectOutcome;
  reasons: string[];
  notes: string[];
  helper?: MlCal1G4W5HelperResponse;
  exePath: string | null;
  exeSha256: string | null;
  spawned: boolean;
}

export interface MlCal1G4W5InspectInput {
  boundPath: string;
  /** Absolute path to pinned helper; defaults to repo-relative resolution. */
  helperExePath?: string;
  /** Override expected SHA-256 pin (tests only — never derive from untrusted exe). */
  expectedExeSha256?: string;
  /** Repo root for default helper path resolution. */
  repoRoot?: string;
  timeoutMs?: number;
  stdoutByteCap?: number;
  stderrByteCap?: number;
  /**
   * Test-only: substitute spawn implementation. Production must omit.
   * Must not be usable to manufacture W6–W9 PASS in setup.
   */
  testOnlySpawn?: typeof spawn;
  /** Test-only: substitute spawnSync for sync-path unit tests. */
  testOnlySpawnSync?: typeof spawnSync;
  /** Test-only: skip pin check after recording observed hash (unsafe). */
  testOnlySkipPinCheck?: boolean;
  /** Test-only: override kill grace after timeout (async). */
  killGraceMs?: number;
  /**
   * Test-only: explicitly enable native handshake for disposable swap fixtures.
   * Ordinary inspection strips all G4_W5_TEST_* env vars; handshake never inherits
   * ambient process.env alone.
   */
  testOnlyHandshake?: {
    dir: string;
    afterSegment: string;
    waitMs?: number;
  };
}

/** Canonical test-control env prefix (uppercase). Matching is case-insensitive. */
export const ML_CAL_1_G4_W5_TEST_ENV_PREFIX = 'G4_W5_TEST_' as const;

/** True when key is any casing of G4_W5_TEST_*. Windows env names are case-insensitive. */
export function isMlCal1G4W5TestEnvKey(key: string): boolean {
  return (
    key.length >= ML_CAL_1_G4_W5_TEST_ENV_PREFIX.length &&
    key.slice(0, ML_CAL_1_G4_W5_TEST_ENV_PREFIX.length).toUpperCase() ===
      ML_CAL_1_G4_W5_TEST_ENV_PREFIX
  );
}

/** Delete every G4_W5_TEST_* key regardless of casing. */
export function stripMlCal1G4W5TestEnvKeys(env: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(env)) {
    if (isMlCal1G4W5TestEnvKey(key)) {
      delete env[key];
    }
  }
}

// Volume GUID root form: \\?\Volume{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}\
const VOLUME_GUID_ROOT_RE =
  /^\\\\\?\\Volume\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}\\$/;
const OBJECT_ID_RE = /^[0-9a-fA-F]{8}:[0-9a-fA-F]{16}$/;
const IO_REPARSE_TAG_SYMLINK = 0xa000000c;
const IO_REPARSE_TAG_MOUNT_POINT = 0xa0000003;

export function splitWindowsDriveSegments(
  absPath: string
): string[] | { reason: string } {
  const n = absPath.replace(/\//g, '\\');
  if (n.length < 3 || n[1] !== ':' || (n[2] !== '\\' && n[2] !== '/')) {
    return { reason: 'windows_helper_pass_bound_not_drive_absolute' };
  }
  let rest = n.slice(3);
  while (rest.endsWith('\\')) rest = rest.slice(0, -1);
  if (rest.length === 0) return [];
  const parts = rest.split('\\').filter((p) => p.length > 0);
  if (parts.some((p) => p === '.' || p === '..')) {
    return { reason: 'windows_helper_pass_bound_dot_segment' };
  }
  return parts;
}

function isNameSurrogateTag(tag: number): boolean {
  if ((tag & 0x20000000) !== 0) return true;
  return tag === IO_REPARSE_TAG_SYMLINK || tag === IO_REPARSE_TAG_MOUNT_POINT;
}

/**
 * Build helper subprocess env: strip all G4_W5_TEST_* (any casing) from
 * process.env, then optionally re-add canonical uppercase handshake controls
 * for disposable fixtures only. Windows treats env names case-insensitively.
 */
export function buildW5HelperEnv(
  handshake?: MlCal1G4W5InspectInput['testOnlyHandshake']
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  stripMlCal1G4W5TestEnvKeys(env);
  if (handshake) {
    // Ensure no residual casing variants remain before canonical controls.
    stripMlCal1G4W5TestEnvKeys(env);
    env.G4_W5_TEST_HANDSHAKE_ENABLE = '1';
    env.G4_W5_TEST_HANDSHAKE_DIR = handshake.dir;
    env.G4_W5_TEST_PAUSE_AFTER_SEGMENT = handshake.afterSegment;
    if (typeof handshake.waitMs === 'number' && handshake.waitMs > 0) {
      env.G4_W5_TEST_HANDSHAKE_WAIT_MS = String(handshake.waitMs);
    }
  }
  return env;
}

function refuseResult(
  reasons: string[],
  partial: Partial<MlCal1G4W5InspectResult> = {}
): MlCal1G4W5InspectResult {
  return {
    outcome: 'BLOCKED',
    notes: [],
    exePath: null,
    exeSha256: null,
    spawned: false,
    ...partial,
    ok: false,
    reasons: partial.reasons ?? reasons,
  };
}

export function resolveDefaultW5HelperExePath(repoRoot?: string): string {
  const root =
    repoRoot ??
    path.resolve(__dirname, '..', '..', '..');
  return path.resolve(root, ML_CAL_1_G4_W5_HELPER_RELATIVE_PATH);
}

/**
 * Hash file bytes. Never use the result of hashing an untrusted candidate as the
 * expected pin for that same candidate in the same step without an external pin.
 */
export function sha256FileSync(absPath: string): { sha256: string; byteCount: number } {
  const buf = fs.readFileSync(absPath);
  return {
    sha256: createHash('sha256').update(buf).digest('hex'),
    byteCount: buf.byteLength,
  };
}

export function verifyW5HelperExePin(
  absExePath: string,
  expectedSha256: string = ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN
): { ok: true; sha256: string; byteCount: number } | { ok: false; reasons: string[]; sha256: string | null } {
  if (!path.isAbsolute(absExePath)) {
    return { ok: false, reasons: ['windows_helper_path_not_absolute'], sha256: null };
  }
  if (!fs.existsSync(absExePath)) {
    return { ok: false, reasons: ['windows_helper_missing'], sha256: null };
  }
  let st: fs.Stats;
  try {
    st = fs.lstatSync(absExePath);
  } catch (e) {
    return {
      ok: false,
      reasons: [`windows_helper_lstat_failed:${String(e)}`],
      sha256: null,
    };
  }
  if (!st.isFile() || st.isSymbolicLink()) {
    return { ok: false, reasons: ['windows_helper_not_regular_file'], sha256: null };
  }
  const { sha256, byteCount } = sha256FileSync(absExePath);
  if (sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    return {
      ok: false,
      reasons: ['windows_helper_pin_mismatch'],
      sha256,
    };
  }
  if (byteCount !== ML_CAL_1_G4_W5_HELPER_EXE_BYTE_COUNT) {
    return {
      ok: false,
      reasons: ['windows_helper_byte_count_mismatch'],
      sha256,
    };
  }
  return { ok: true, sha256, byteCount };
}

function buildRequestJson(boundPath: string): string {
  return JSON.stringify({
    schemaVersion: ML_CAL_1_G4_W5_SCHEMA_VERSION,
    mode: ML_CAL_1_G4_W5_MODE,
    boundPath,
  });
}

function validateBoundPath(boundPath: unknown): string | { reasons: string[] } {
  if (typeof boundPath !== 'string' || boundPath.length === 0) {
    return { reasons: ['w5_bound_path_missing'] };
  }
  if (boundPath.length > ML_CAL_1_G4_W5_BOUND_PATH_CHAR_CAP) {
    return { reasons: ['w5_bound_path_too_long'] };
  }
  if (!path.isAbsolute(boundPath)) {
    return { reasons: ['w5_bound_path_not_absolute'] };
  }
  return boundPath;
}

function parseHelperStdout(
  stdout: Buffer,
  requestedBound: string
):
  | { ok: true; helper: MlCal1G4W5HelperResponse }
  | { ok: false; reasons: string[] } {
  let text: string;
  try {
    text = stdout.toString('utf8');
  } catch {
    return { ok: false, reasons: ['windows_helper_stdout_not_utf8'] };
  }
  if (stdout.includes(0)) {
    // Allow only if valid UTF-8 JSON without NULs in practice — reject NULs.
    return { ok: false, reasons: ['windows_helper_stdout_contains_nul'] };
  }
  // Incomplete UTF-8: Buffer.toString replaces; detect via round-trip.
  if (!Buffer.from(text, 'utf8').equals(stdout)) {
    return { ok: false, reasons: ['windows_helper_stdout_incomplete_utf8'] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reasons: ['windows_helper_stdout_invalid_json'] };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reasons: ['windows_helper_stdout_schema_mismatch'] };
  }
  const o = parsed as Record<string, unknown>;
  if (o.schemaVersion !== ML_CAL_1_G4_W5_SCHEMA_VERSION) {
    return { ok: false, reasons: ['windows_helper_schema_version_mismatch'] };
  }
  if (o.mode !== ML_CAL_1_G4_W5_MODE) {
    return { ok: false, reasons: ['windows_helper_mode_mismatch'] };
  }
  if (typeof o.boundPath !== 'string' || o.boundPath !== requestedBound) {
    return { ok: false, reasons: ['windows_helper_binding_mismatch'] };
  }
  if (o.outcome !== 'PASS' && o.outcome !== 'REFUSE' && o.outcome !== 'BLOCKED') {
    return { ok: false, reasons: ['windows_helper_outcome_invalid'] };
  }
  if (!Array.isArray(o.reasons) || !o.reasons.every((r) => typeof r === 'string')) {
    return { ok: false, reasons: ['windows_helper_reasons_invalid'] };
  }
  const helper: MlCal1G4W5HelperResponse = {
    schemaVersion: o.schemaVersion as number,
    mode: o.mode as string,
    boundPath: o.boundPath as string,
    outcome: o.outcome as MlCal1G4W5InspectOutcome,
    reasons: o.reasons as string[],
    expectedFinalGuidPath:
      typeof o.expectedFinalGuidPath === 'string'
        ? o.expectedFinalGuidPath
        : undefined,
    followedFinalGuidPath:
      typeof o.followedFinalGuidPath === 'string'
        ? o.followedFinalGuidPath
        : undefined,
    followedFinalNtPath:
      typeof o.followedFinalNtPath === 'string'
        ? o.followedFinalNtPath
        : undefined,
    volumeGuidRoot:
      typeof o.volumeGuidRoot === 'string' ? o.volumeGuidRoot : undefined,
    segments: Array.isArray(o.segments) ? o.segments : undefined,
    notes: Array.isArray(o.notes)
      ? (o.notes.filter((n) => typeof n === 'string') as string[])
      : undefined,
    limitations: Array.isArray(o.limitations)
      ? (o.limitations.filter((n) => typeof n === 'string') as string[])
      : undefined,
  };
  const passGate = validatePassEvidence(helper, requestedBound);
  if (passGate.ok === false) {
    return { ok: false, reasons: passGate.reasons };
  }
  return { ok: true, helper };
}

/**
 * PASS requires complete, internally consistent identity evidence with
 * GUID-volume syntax, binding correspondence, and reconstructible path.
 * Incomplete / contradictory / meaningless PASS payloads are refused.
 */
export function validatePassEvidence(
  helper: MlCal1G4W5HelperResponse,
  requestedBound: string = helper.boundPath
): { ok: true } | { ok: false; reasons: string[] } {
  if (helper.outcome !== 'PASS') {
    return { ok: true };
  }
  if (helper.reasons.length > 0) {
    return { ok: false, reasons: ['windows_helper_pass_with_reasons'] };
  }
  if (helper.boundPath !== requestedBound) {
    return { ok: false, reasons: ['windows_helper_pass_bound_mismatch'] };
  }
  if (
    typeof helper.expectedFinalGuidPath !== 'string' ||
    helper.expectedFinalGuidPath.length === 0
  ) {
    return { ok: false, reasons: ['windows_helper_pass_missing_expected_guid'] };
  }
  if (
    typeof helper.followedFinalGuidPath !== 'string' ||
    helper.followedFinalGuidPath.length === 0
  ) {
    return { ok: false, reasons: ['windows_helper_pass_missing_followed_guid'] };
  }
  if (
    typeof helper.volumeGuidRoot !== 'string' ||
    helper.volumeGuidRoot.length === 0
  ) {
    return { ok: false, reasons: ['windows_helper_pass_missing_volume_guid'] };
  }
  if (!VOLUME_GUID_ROOT_RE.test(helper.volumeGuidRoot)) {
    return { ok: false, reasons: ['windows_helper_pass_volume_guid_syntax'] };
  }
  if (helper.expectedFinalGuidPath !== helper.followedFinalGuidPath) {
    return { ok: false, reasons: ['windows_helper_pass_guid_mismatch'] };
  }
  if (!helper.expectedFinalGuidPath.startsWith(helper.volumeGuidRoot)) {
    return { ok: false, reasons: ['windows_helper_pass_volume_prefix_mismatch'] };
  }
  if (!Array.isArray(helper.segments)) {
    return { ok: false, reasons: ['windows_helper_pass_segments_missing'] };
  }
  if (helper.segments.length > ML_CAL_1_G4_W5_MAX_SEGMENTS) {
    return { ok: false, reasons: ['windows_helper_pass_segments_too_many'] };
  }

  const boundParts = splitWindowsDriveSegments(requestedBound);
  if (!Array.isArray(boundParts)) {
    return { ok: false, reasons: [boundParts.reason] };
  }
  if (helper.segments.length !== boundParts.length) {
    return { ok: false, reasons: ['windows_helper_pass_segment_count_mismatch'] };
  }

  const onDiskNames: string[] = [];
  for (let i = 0; i < helper.segments.length; i++) {
    const seg = helper.segments[i];
    if (seg === null || typeof seg !== 'object' || Array.isArray(seg)) {
      return { ok: false, reasons: [`windows_helper_pass_segment_malformed:${i}`] };
    }
    const s = seg as Record<string, unknown>;
    if (typeof s.boundName !== 'string' || s.boundName.length === 0) {
      return { ok: false, reasons: [`windows_helper_pass_segment_bound:${i}`] };
    }
    if (typeof s.onDiskName !== 'string' || s.onDiskName.length === 0) {
      return { ok: false, reasons: [`windows_helper_pass_segment_ondisk:${i}`] };
    }
    if (s.onDiskName.includes('/') || s.onDiskName.includes('\\') ||
        s.onDiskName === '.' || s.onDiskName === '..') {
      return { ok: false, reasons: [`windows_helper_pass_segment_ondisk_invalid:${i}`] };
    }
    // Binding order: boundName must equal the requested segment (exact).
    if (s.boundName !== boundParts[i]) {
      return { ok: false, reasons: [`windows_helper_pass_segment_bound_order:${i}`] };
    }
    // Parent case policy: helper already enforced; launcher requires at least
    // case-insensitive correspondence (rejects unrelated names like stub aliases).
    if (s.boundName.toLowerCase() !== (s.onDiskName as string).toLowerCase()) {
      return {
        ok: false,
        reasons: [`windows_helper_pass_segment_name_unrelated:${i}`],
      };
    }
    if (typeof s.objectId !== 'string' || !OBJECT_ID_RE.test(s.objectId)) {
      return { ok: false, reasons: [`windows_helper_pass_segment_objectid:${i}`] };
    }
    if (s.status !== 'OK') {
      return { ok: false, reasons: [`windows_helper_pass_segment_not_ok:${i}`] };
    }
    if (typeof s.reparseTag !== 'number' || !Number.isFinite(s.reparseTag)) {
      return { ok: false, reasons: [`windows_helper_pass_segment_reparse:${i}`] };
    }
    if (s.reparseTag !== 0 || isNameSurrogateTag(s.reparseTag)) {
      return { ok: false, reasons: [`windows_helper_pass_segment_alias_tag:${i}`] };
    }
    onDiskNames.push(s.onDiskName);
  }

  const reconstructed =
    helper.volumeGuidRoot +
    (onDiskNames.length === 0 ? '' : onDiskNames.join('\\'));
  if (reconstructed !== helper.expectedFinalGuidPath) {
    return { ok: false, reasons: ['windows_helper_pass_path_not_reconstructible'] };
  }
  // Followed must equal reconstructed expected (already equal to expected above).
  if (helper.followedFinalGuidPath !== reconstructed) {
    return { ok: false, reasons: ['windows_helper_pass_followed_not_reconstructible'] };
  }
  return { ok: true };
}

function finalizeFromHelper(
  helper: MlCal1G4W5HelperResponse,
  exePath: string,
  exeSha256: string
): MlCal1G4W5InspectResult {
  const pass = helper.outcome === 'PASS';
  return {
    ok: pass,
    outcome: helper.outcome,
    reasons:
      pass
        ? []
        : helper.reasons.length > 0
          ? helper.reasons
          : ['windows_helper_non_pass'],
    notes: helper.notes ?? [],
    helper,
    exePath,
    exeSha256,
    spawned: true,
  };
}

/**
 * Plan-canonical async launcher: child_process.spawn, shell:false, independent
 * stdout/stderr Buffer byte caps, timeout, single settlement.
 */
export function runW5PathIdentityInspectAsync(
  input: MlCal1G4W5InspectInput
): Promise<MlCal1G4W5InspectResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (r: MlCal1G4W5InspectResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const bound = validateBoundPath(input.boundPath);
    if (typeof bound !== 'string') {
      settle(refuseResult(bound.reasons));
      return;
    }

    if (process.platform !== 'win32') {
      settle(refuseResult(['windows_helper_platform_unsupported']));
      return;
    }

    const exePath = path.resolve(
      input.helperExePath ?? resolveDefaultW5HelperExePath(input.repoRoot)
    );
    const expectedPin =
      input.expectedExeSha256 ?? ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN;
    const pin = verifyW5HelperExePin(exePath, expectedPin);
    if (pin.ok === false && !input.testOnlySkipPinCheck) {
      settle(
        refuseResult(pin.reasons, {
          exePath,
          exeSha256: pin.sha256,
          spawned: false,
        })
      );
      return;
    }
    const exeSha256 =
      pin.ok === true
        ? pin.sha256
        : sha256FileSync(exePath).sha256;

    const stdoutCap = input.stdoutByteCap ?? ML_CAL_1_G4_W5_STDOUT_BYTE_CAP;
    const stderrCap = input.stderrByteCap ?? ML_CAL_1_G4_W5_STDERR_BYTE_CAP;
    const timeoutMs = input.timeoutMs ?? ML_CAL_1_G4_W5_TIMEOUT_MS;
    const req = buildRequestJson(bound);
    const reqBuf = Buffer.from(req, 'utf8');
    if (reqBuf.byteLength > ML_CAL_1_G4_W5_STDIN_BYTE_CAP) {
      settle(refuseResult(['windows_helper_stdin_too_large'], { exePath, exeSha256 }));
      return;
    }

    const spawnFn = input.testOnlySpawn ?? spawn;
    const spawnOpts: SpawnOptionsWithoutStdio = {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildW5HelperEnv(input.testOnlyHandshake),
    };
    // Explicit: never pass maxBuffer to async spawn (option does not exist).
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnFn(exePath, [], spawnOpts) as ChildProcessWithoutNullStreams;
    } catch (e) {
      settle(
        refuseResult([`windows_helper_spawn_failed:${String(e)}`], {
          exePath,
          exeSha256,
          spawned: false,
        })
      );
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let overflowed: 'stdout' | 'stderr' | null = null;
    let streamError: string | null = null;
    let timedOut = false;
    let killAttempted = false;
    let forceSettleTimer: ReturnType<typeof setTimeout> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const killGraceMs = input.killGraceMs ?? ML_CAL_1_G4_W5_KILL_GRACE_MS;

    const clearTimers = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (forceSettleTimer) {
        clearTimeout(forceSettleTimer);
        forceSettleTimer = null;
      }
    };

    const settleTimeout = () => {
      clearTimers();
      settle(
        refuseResult(['windows_helper_timeout'], {
          exePath,
          exeSha256,
          spawned: true,
        })
      );
    };

    const killChild = (force = false) => {
      if (killAttempted && !force) return;
      killAttempted = true;
      try {
        child.kill(force ? 'SIGKILL' : 'SIGTERM');
      } catch {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      }
    };

    const armBoundedSettlement = (reason: 'timeout' | 'overflow' | 'stream') => {
      if (forceSettleTimer) return;
      forceSettleTimer = setTimeout(() => {
        killChild(true);
        if (settled) return;
        if (reason === 'timeout' || timedOut) {
          settleTimeout();
          return;
        }
        if (overflowed === 'stdout') {
          settle(
            refuseResult(['windows_helper_stdout_overflow'], {
              exePath,
              exeSha256,
              spawned: true,
            })
          );
          return;
        }
        if (overflowed === 'stderr') {
          settle(
            refuseResult(['windows_helper_stderr_overflow'], {
              exePath,
              exeSha256,
              spawned: true,
            })
          );
          return;
        }
        settle(
          refuseResult(
            [`windows_helper_stream_error:${streamError ?? 'unsettled'}`],
            { exePath, exeSha256, spawned: true }
          )
        );
      }, killGraceMs);
    };

    timer = setTimeout(() => {
      timedOut = true;
      killChild(false);
      armBoundedSettlement('timeout');
    }, timeoutMs);

    const onOverflow = (which: 'stdout' | 'stderr') => {
      overflowed = which;
      killChild(false);
      armBoundedSettlement('overflow');
    };

    child.stdout.on('data', (chunk: Buffer) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stdoutBytes += buf.byteLength;
      if (stdoutBytes > stdoutCap) {
        onOverflow('stdout');
        return;
      }
      stdoutChunks.push(buf);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stderrBytes += buf.byteLength;
      if (stderrBytes > stderrCap) {
        onOverflow('stderr');
        return;
      }
      stderrChunks.push(buf);
    });
    child.stdout.on('error', (e) => {
      streamError = `stdout:${String(e)}`;
      killChild(false);
      armBoundedSettlement('stream');
    });
    child.stderr.on('error', (e) => {
      streamError = `stderr:${String(e)}`;
      killChild(false);
      armBoundedSettlement('stream');
    });
    if (child.stdin) {
      child.stdin.on('error', (e) => {
        streamError = `stdin:${String(e)}`;
        killChild(false);
        armBoundedSettlement('stream');
      });
    }
    child.on('error', (e) => {
      clearTimers();
      settle(
        refuseResult([`windows_helper_spawn_failed:${String(e)}`], {
          exePath,
          exeSha256,
          spawned: true,
        })
      );
    });

    child.on('close', (code, signal) => {
      clearTimers();
      if (settled) return;
      if (timedOut) {
        settleTimeout();
        return;
      }
      if (overflowed === 'stdout') {
        settle(
          refuseResult(['windows_helper_stdout_overflow'], {
            exePath,
            exeSha256,
            spawned: true,
          })
        );
        return;
      }
      if (overflowed === 'stderr') {
        settle(
          refuseResult(['windows_helper_stderr_overflow'], {
            exePath,
            exeSha256,
            spawned: true,
          })
        );
        return;
      }
      if (streamError) {
        settle(
          refuseResult([`windows_helper_stream_error:${streamError}`], {
            exePath,
            exeSha256,
            spawned: true,
          })
        );
        return;
      }
      if (signal) {
        settle(
          refuseResult([`windows_helper_signal:${signal}`], {
            exePath,
            exeSha256,
            spawned: true,
          })
        );
        return;
      }
      if (code !== 0) {
        settle(
          refuseResult([`windows_helper_nonzero_exit:${code ?? 'null'}`], {
            exePath,
            exeSha256,
            spawned: true,
          })
        );
        return;
      }
      const stdout = Buffer.concat(stdoutChunks);
      const parsed = parseHelperStdout(stdout, bound);
      if (parsed.ok === false) {
        settle(
          refuseResult(parsed.reasons, {
            exePath,
            exeSha256,
            spawned: true,
          })
        );
        return;
      }
      settle(finalizeFromHelper(parsed.helper, exePath, exeSha256));
    });

    try {
      child.stdin.write(reqBuf);
      child.stdin.end();
    } catch (e) {
      streamError = `stdin_write:${String(e)}`;
      killChild(false);
      armBoundedSettlement('stream');
    }
  });
}

/**
 * Synchronous inspect for runG4PhaseARetentionSetup (sync public API).
 * Uses spawnSync with frozen maxBuffer; refuses on overflow/truncation/nonzero.
 */
export function runW5PathIdentityInspectSync(
  input: MlCal1G4W5InspectInput
): MlCal1G4W5InspectResult {
  const bound = validateBoundPath(input.boundPath);
  if (typeof bound !== 'string') {
    return refuseResult(bound.reasons);
  }
  if (process.platform !== 'win32') {
    return refuseResult(['windows_helper_platform_unsupported']);
  }

  const exePath = path.resolve(
    input.helperExePath ?? resolveDefaultW5HelperExePath(input.repoRoot)
  );
  const expectedPin =
    input.expectedExeSha256 ?? ML_CAL_1_G4_W5_HELPER_EXE_SHA256_PIN;
  const pin = verifyW5HelperExePin(exePath, expectedPin);
  if (pin.ok === false && !input.testOnlySkipPinCheck) {
    return refuseResult(pin.reasons, {
      exePath,
      exeSha256: pin.sha256,
      spawned: false,
    });
  }
  const exeSha256 =
    pin.ok === true ? pin.sha256 : sha256FileSync(exePath).sha256;

  const stdoutCap = input.stdoutByteCap ?? ML_CAL_1_G4_W5_STDOUT_BYTE_CAP;
  const stderrCap = input.stderrByteCap ?? ML_CAL_1_G4_W5_STDERR_BYTE_CAP;
  const timeoutMs = input.timeoutMs ?? ML_CAL_1_G4_W5_TIMEOUT_MS;
  const req = buildRequestJson(bound);
  const reqBuf = Buffer.from(req, 'utf8');
  if (reqBuf.byteLength > ML_CAL_1_G4_W5_STDIN_BYTE_CAP) {
    return refuseResult(['windows_helper_stdin_too_large'], { exePath, exeSha256 });
  }

  // spawnSync applies one maxBuffer ceiling across collected stdio. Use the
  // sum of independent caps as that ceiling, then enforce per-stream caps on
  // the observed buffers. Never treat maxBuffer alone as a per-stream limit.
  const maxBuffer = stdoutCap + stderrCap;
  const spawnSyncFn = input.testOnlySpawnSync ?? spawnSync;
  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSyncFn(exePath, [], {
      input: reqBuf,
      shell: false,
      windowsHide: true,
      encoding: 'buffer',
      maxBuffer,
      timeout: timeoutMs,
      env: buildW5HelperEnv(input.testOnlyHandshake),
    });
  } catch (e) {
    return refuseResult([`windows_helper_spawn_failed:${String(e)}`], {
      exePath,
      exeSha256,
      spawned: true,
    });
  }

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === 'ETIMEDOUT') {
      return refuseResult(['windows_helper_timeout'], {
        exePath,
        exeSha256,
        spawned: true,
      });
    }
    if (
      err.code === 'ENOBUFS' ||
      /maxBuffer/i.test(String(err.message)) ||
      err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
    ) {
      return refuseResult(['windows_helper_output_overflow'], {
        exePath,
        exeSha256,
        spawned: true,
      });
    }
    return refuseResult([`windows_helper_spawn_failed:${err.message}`], {
      exePath,
      exeSha256,
      spawned: true,
    });
  }

  const stdout = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout ?? '');
  const stderr = Buffer.isBuffer(result.stderr)
    ? result.stderr
    : Buffer.from(result.stderr ?? '');

  if (stdout.byteLength > stdoutCap) {
    return refuseResult(['windows_helper_stdout_overflow'], {
      exePath,
      exeSha256,
      spawned: true,
    });
  }
  if (stderr.byteLength > stderrCap) {
    return refuseResult(['windows_helper_stderr_overflow'], {
      exePath,
      exeSha256,
      spawned: true,
    });
  }
  if (result.signal) {
    return refuseResult([`windows_helper_signal:${result.signal}`], {
      exePath,
      exeSha256,
      spawned: true,
    });
  }
  if (result.status !== 0) {
    return refuseResult(
      [`windows_helper_nonzero_exit:${result.status ?? 'null'}`],
      { exePath, exeSha256, spawned: true }
    );
  }

  const parsed = parseHelperStdout(stdout, bound);
  if (parsed.ok === false) {
    return refuseResult(parsed.reasons, {
      exePath,
      exeSha256,
      spawned: true,
    });
  }
  return finalizeFromHelper(parsed.helper, exePath, exeSha256);
}

/**
 * Operator Win32 gate bundle after W4. W5-only implementation: even if W5
 * PASSes, result is always non-PASS aggregate (`windows_gates_incomplete`)
 * because W6–W9 are unimplemented. No caller flag can manufacture full PASS.
 */
export function evaluateOperatorWindowsGatesAfterW4(input: {
  operatorUserRoot: string;
  platform?: NodeJS.Platform;
  /** Test-only W5 inspect substitute. Cannot skip incomplete-bundle refusal. */
  testOnlyW5Inspect?: () => MlCal1G4W5InspectResult;
  w5Inspect?: (boundPath: string) => MlCal1G4W5InspectResult;
}): {
  aggregateOk: false;
  reasons: string[];
  notes: string[];
  w5: MlCal1G4W5InspectResult | null;
  w6: 'unimplemented';
  w7: 'unimplemented';
  w8: 'unimplemented';
  w9: 'unimplemented';
} {
  const platform = input.platform ?? process.platform;
  const notes: string[] = [
    'w6_unimplemented',
    'w7_unimplemented',
    'w8_unimplemented',
    'w9_unimplemented',
  ];

  if (platform !== 'win32') {
    return {
      aggregateOk: false,
      reasons: ['windows_helper_platform_unsupported', 'windows_gates_incomplete'],
      notes,
      w5: null,
      w6: 'unimplemented',
      w7: 'unimplemented',
      w8: 'unimplemented',
      w9: 'unimplemented',
    };
  }

  const w5 =
    typeof input.testOnlyW5Inspect === 'function'
      ? input.testOnlyW5Inspect()
      : typeof input.w5Inspect === 'function'
        ? input.w5Inspect(input.operatorUserRoot)
        : runW5PathIdentityInspectSync({ boundPath: input.operatorUserRoot });

  const reasons: string[] = [];
  if (w5.outcome !== 'PASS') {
    reasons.push(...w5.reasons);
    if (!reasons.includes('windows_gates_incomplete')) {
      reasons.push('windows_gates_incomplete');
    }
  } else {
    reasons.push('windows_gates_incomplete');
  }

  return {
    aggregateOk: false,
    reasons,
    notes: [...notes, ...(w5.notes ?? [])],
    w5,
    w6: 'unimplemented',
    w7: 'unimplemented',
    w8: 'unimplemented',
    w9: 'unimplemented',
  };
}
