/**
 * ML-CAL-1 G4 Phase A R-LOCAL-FS retention setup (probe provenance only).
 *
 * Import is passive: no env reads, no Prisma, no network, no operator-root touch.
 * Offline tests MUST use disposable roots under os.tmpdir().
 *
 * F1: absolute destination + every existing ancestor validated before first mutation.
 * F2: exclusive receipt publish; post-write verify evidence is separate from sealed
 *     receipt content (never mark verify OK before performing it; never rewrite a
 *     sealed receipt merely to flip a verify flag).
 * F3: post-publish / handoff member digests vs original manifest (not copy-equality alone).
 * F4: completion evidence + finite non-reversed clocks; sealed receipt is provisional;
 *     terminal success requires digest-bound final evidence; verify/remove failures
 *     must not leave independently interpretable success (even if cleanup cannot run);
 *     containment reject → zero unsafe writes/removals.
 * F5: exclusive claims; injected write/copy/rename failures fail closed.
 * W4: pre-mutation conflict scan of the five deterministic ID destinations
 *     after opt-in/path/ID/ancestor validation and BEFORE start clock / first
 *     user-root mutation. Mid/post exclusive protections remain; W4 is not a lock.
 * W5–W9: operator mode requires all PASS before start clock / user-root mutation.
 *     W5-only leaves operator BLOCKED (`windows_gates_incomplete`). Temp mode
 *     does not invoke the native helper.
 *
 * Design pin (git/LF): 55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f
 * Base #255 head: af28c337adb18b38a5a77a71d4f452ca74a1c994
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { stableStringify } from './ml-cal-1-lifecycle-binding';
import {
  isSafeG4PreflightId,
  ML_CAL_1_G4_PREFLIGHT_SUBTREES,
  redactError,
} from './ml-cal-1-g4-pooler-preflight-fixture';
import {
  evaluateOperatorWindowsGatesAfterW4,
  type MlCal1G4W5InspectResult,
} from './ml-cal-1-g4-windows-path-identity';

export const ML_CAL_1_G4_PHASE_A_SETUP_KIND =
  'ml-cal-1-g4-phase-a-retention-setup-v1' as const;

export const ML_CAL_1_G4_PHASE_A_PROBE_PACKAGE_SCHEMA =
  'ml-cal-1-g4-phase-a-setup-probe-package-v1' as const;

export const ML_CAL_1_G4_PHASE_A_SETUP_RECEIPT_KIND =
  'ml-cal-1-g4-phase-a-setup-receipt-v1' as const;

export const ML_CAL_1_G4_PHASE_A_SETUP_RECEIPT_FINAL_EVIDENCE_KIND =
  'ml-cal-1-g4-phase-a-setup-receipt-final-evidence-v1' as const;

export const ML_CAL_1_G4_PHASE_A_COMPLETION_MEMBER =
  'PUBLICATION_COMPLETION.json' as const;

export const ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER =
  'PACKAGE_INVALIDATED.json' as const;

export const ML_CAL_1_G4_PHASE_A_REQUIRED_PROBE_MEMBERS = [
  'PROBE_MEMBER.json',
  'PACKAGE_MANIFEST.json',
  'PACKAGE_MANIFEST.sha256',
] as const;

/** Documentation label only — never used as a default mutation target. */
export const ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL =
  'C:\\Users\\Bobby\\GridironResearchEvidence' as const;

export const ML_CAL_1_G4_EVIDENCE_RELATIVE_SEGMENTS = [
  'ml-cal-1',
  'g4',
] as const;

export type MlCal1G4PhaseAProvenanceClass = 'probe';

const SECRETISH =
  /(api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|authorization\s*[:=]\s*\S+|bearer\s+[a-z0-9._\-+\/=]{8,}|ghp_[A-Za-z0-9]+|(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL)\s*[:=]\s*\S+|postgres(ql)?:\/\/\S+)/i;

function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function scanSecretish(text: string): boolean {
  return SECRETISH.test(text);
}

function isSymlinkOrJunction(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return true;
  }
}

export function canonicalizePathForCompare(p: string): string {
  return path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
}

export function g4EvidenceBaseFromOperatorUserRoot(
  operatorUserRoot: string
): string {
  return path.resolve(
    operatorUserRoot,
    ...ML_CAL_1_G4_EVIDENCE_RELATIVE_SEGMENTS
  );
}

export function runnerRetainRootFromOperatorUserRoot(
  operatorUserRoot: string
): string {
  return g4EvidenceBaseFromOperatorUserRoot(operatorUserRoot);
}

/**
 * F1: require caller-supplied absolute path (path.resolve alone is insufficient).
 */
export function requireAbsoluteDestination(
  p: string
): { ok: true; abs: string } | { ok: false; reason: string } {
  if (typeof p !== 'string' || !p.trim()) {
    return { ok: false, reason: 'destination_empty' };
  }
  if (!path.isAbsolute(p)) {
    return { ok: false, reason: 'destination_not_absolute' };
  }
  return { ok: true, abs: path.resolve(p) };
}

/**
 * F1: validate every existing ancestor of target before any mutation.
 * Creates nothing. Rejects symlink/junction components.
 */
export function validateExistingAncestors(targetAbs: string): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const abs = path.resolve(targetAbs);
  const root = path.parse(abs).root;
  const rel = path.relative(root, abs);
  const parts = rel.split(path.sep).filter(Boolean);
  let walk = root;
  // root itself
  if (fs.existsSync(walk) && isSymlinkOrJunction(walk)) {
    reasons.push('ancestor_symlink:root');
  }
  for (const part of parts) {
    walk = path.join(walk, part);
    if (!fs.existsSync(walk)) break;
    try {
      if (isSymlinkOrJunction(walk)) {
        reasons.push(`ancestor_symlink:${part}`);
        break;
      }
      const st = fs.lstatSync(walk);
      // intermediate ancestors that exist must be directories (except final may be missing)
      if (walk !== abs && !st.isDirectory()) {
        reasons.push(`ancestor_not_directory:${part}`);
        break;
      }
    } catch (e) {
      reasons.push(`ancestor_unreadable:${redactError(e)}`);
      break;
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Test-only mutation recording active during runG4PhaseARetentionSetup after W4.
 * Helpers (safeRemoveContained / invalidateRetainedProbe) consult this so cleanup
 * removals and invalidation writes are visible across call-boundary gaps.
 */
type PhaseAMutationRecorder = (op: string, absTarget: string) => void;
let activePhaseAMutationRecorder: PhaseAMutationRecorder | undefined;

function phaseARecordMutation(op: string, target: string): void {
  if (typeof activePhaseAMutationRecorder === 'function') {
    activePhaseAMutationRecorder(op, path.resolve(String(target)));
  }
}

function assertPhysicalContainment(root: string, candidate: string): string {
  const rootReal = fs.realpathSync(root);
  const candAbs = path.resolve(candidate);
  const rel = path.relative(rootReal, candAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path_escape');
  }
  let walk = rootReal;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    walk = path.join(walk, part);
    if (fs.existsSync(walk) && isSymlinkOrJunction(walk)) {
      throw new Error('path_symlink_component');
    }
  }
  const parent = path.dirname(candAbs);
  if (fs.existsSync(parent)) {
    if (isSymlinkOrJunction(parent)) {
      throw new Error('path_symlink_component');
    }
    const parentReal = fs.realpathSync(parent);
    if (
      parentReal !== rootReal &&
      !parentReal.startsWith(rootReal + path.sep)
    ) {
      throw new Error('path_escape');
    }
  }
  return candAbs;
}

function safeRemoveContained(
  root: string,
  target: string
): { ok: boolean; reason?: string } {
  try {
    const rootResolved = path.resolve(root);
    const targetAbs = path.resolve(target);
    if (targetAbs === rootResolved) {
      return { ok: false, reason: 'remove_retain_root_forbidden' };
    }
    assertPhysicalContainment(root, targetAbs);
    if (!fs.existsSync(targetAbs)) return { ok: true };
    if (isSymlinkOrJunction(targetAbs)) {
      return { ok: false, reason: 'remove_symlink_forbidden' };
    }
    const rootReal = fs.realpathSync(root);
    const targetReal = fs.realpathSync(targetAbs);
    if (targetReal === rootReal) {
      return { ok: false, reason: 'remove_retain_root_forbidden' };
    }
    const rel = path.relative(rootReal, targetReal);
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel === '') {
      return { ok: false, reason: 'remove_escape_forbidden' };
    }
    phaseARecordMutation('remove', targetAbs);
    fs.rmSync(targetAbs, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `remove_containment:${redactError(e)}` };
  }
}

/**
 * F3: verify required members against original manifest digests / manifest sha.
 */
export function verifyProbePackageMembers(
  packageDir: string,
  expectedMemberDigests: Record<string, { sha256: string; byteCount: number }>,
  expectedManifestSha256: string
): string[] {
  const reasons: string[] = [];
  if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
    return ['package_dir_missing'];
  }
  if (isSymlinkOrJunction(packageDir)) {
    return ['package_dir_symlink'];
  }
  if (fs.existsSync(path.join(packageDir, ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER))) {
    reasons.push('package_invalidated');
  }
  for (const name of ML_CAL_1_G4_PHASE_A_REQUIRED_PROBE_MEMBERS) {
    const p = path.join(packageDir, name);
    if (!fs.existsSync(p)) {
      reasons.push(`member_missing:${name}`);
      continue;
    }
    if (isSymlinkOrJunction(p)) {
      reasons.push(`member_symlink:${name}`);
      continue;
    }
    const bytes = fs.readFileSync(p);
    if (name === 'PACKAGE_MANIFEST.sha256') {
      const got = bytes.toString('utf8').trim().toLowerCase();
      if (got !== expectedManifestSha256.toLowerCase()) {
        reasons.push('manifest_sha_file_mismatch');
      }
      continue;
    }
    if (name === 'PACKAGE_MANIFEST.json') {
      if (sha256Buffer(bytes) !== expectedManifestSha256.toLowerCase()) {
        reasons.push('manifest_bytes_digest_mismatch');
      }
      if (bytes.length === 0) reasons.push('manifest_empty');
      continue;
    }
    const meta = expectedMemberDigests[name];
    if (!meta) {
      reasons.push(`digest_entry_missing:${name}`);
      continue;
    }
    if (bytes.length !== meta.byteCount) {
      reasons.push(`bytecount_mismatch:${name}`);
    }
    if (sha256Buffer(bytes) !== meta.sha256.toLowerCase()) {
      reasons.push(`digest_mismatch:${name}`);
    }
  }
  return reasons;
}

/**
 * Invalidate owned probe/handoff package evidence in place (marker only).
 * Containment / symlink rejection → zero writes or removals.
 * Does not delete the package directory (caller reports leftovers).
 */
export function invalidateRetainedProbe(input: {
  operatorUserRoot: string;
  packageDir: string;
  probeId: string;
  reasons: string[];
}): { ok: boolean; reasons: string[]; wroteMarker: boolean } {
  const packageAbs = path.resolve(input.packageDir);
  const rootAbs = path.resolve(input.operatorUserRoot);
  if (packageAbs === rootAbs) {
    return {
      ok: false,
      reasons: ['invalidate_retain_root_forbidden'],
      wroteMarker: false,
    };
  }
  if (!fs.existsSync(packageAbs)) {
    return { ok: true, reasons: [], wroteMarker: false };
  }
  try {
    assertPhysicalContainment(input.operatorUserRoot, packageAbs);
    if (isSymlinkOrJunction(packageAbs)) {
      return {
        ok: false,
        reasons: ['invalidate_package_symlink'],
        wroteMarker: false,
      };
    }
  } catch (e) {
    return {
      ok: false,
      reasons: [`invalidate_containment:${redactError(e)}`],
      wroteMarker: false,
    };
  }
  const marker = path.join(
    packageAbs,
    ML_CAL_1_G4_PHASE_A_INVALIDATION_MEMBER
  );
  try {
    assertPhysicalContainment(input.operatorUserRoot, marker);
  } catch (e) {
    return {
      ok: false,
      reasons: [`invalidate_marker_containment:${redactError(e)}`],
      wroteMarker: false,
    };
  }
  try {
    const body = {
      kind: 'g4-phase-a-setup-probe-invalidated',
      preflightId: input.probeId,
      provenanceClass: 'probe',
      terminalSuccess: false as const,
      publicationComplete: false as const,
      setupCompleted: false as const,
      liveAccepted: false as const,
      approved: false as const,
      deployedPoolerProof: false as const,
      reasons: input.reasons.map((r) =>
        scanSecretish(r) ? '[redacted_reason]' : r
      ),
    };
    phaseARecordMutation('write', marker);
    fs.writeFileSync(marker, `${stableStringify(body)}\n`, 'utf8');
    return { ok: true, reasons: [], wroteMarker: true };
  } catch (e) {
    return {
      ok: false,
      reasons: [`invalidate_marker:${redactError(e)}`],
      wroteMarker: false,
    };
  }
}

function existingLeftover(p: string): string | null {
  return fs.existsSync(p) ? path.resolve(p) : null;
}

/**
 * After completion evidence exists, failures must invalidate survivors and
 * accurately list leftovers. Containment reject → no unsafe writes/removals.
 */
function invalidateSurvivorsAfterCompletion(input: {
  operatorUserRoot: string;
  probeId: string;
  packageDirs: Array<string | null | undefined>;
  reasons: string[];
}): { invalidateReasons: string[]; leftovers: string[] } {
  const invalidateReasons: string[] = [];
  const leftovers: string[] = [];
  const seen = new Set<string>();
  for (const dir of input.packageDirs) {
    if (!dir) continue;
    const abs = path.resolve(dir);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!fs.existsSync(abs)) continue;
    const inv = invalidateRetainedProbe({
      operatorUserRoot: input.operatorUserRoot,
      packageDir: abs,
      probeId: input.probeId,
      reasons: input.reasons,
    });
    if (!inv.ok) {
      invalidateReasons.push(...inv.reasons.map((r) => `invalidate_${abs}:${r}`));
    }
    const left = existingLeftover(abs);
    if (left) leftovers.push(left);
  }
  return { invalidateReasons, leftovers };
}

/** Sealed receipt usability: omit post-write verification flags. */
function usabilitySnapshotForSealedReceipt(
  usability: Record<string, boolean>
): Record<string, boolean> {
  const snap: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(usability)) {
    if (k === 'receiptByteVerify' || k === 'exclusiveReceipt') continue;
    snap[k] = v;
  }
  return snap;
}

export const ML_CAL_1_G4_PHASE_A_DESIGN_SHA256 =
  '55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f' as const;

export const ML_CAL_1_G4_PHASE_A_BASE255_HEAD =
  'af28c337adb18b38a5a77a71d4f452ca74a1c994' as const;

/** Usability outcomes required on the sealed provisional receipt (all true). */
export const ML_CAL_1_G4_PHASE_A_REQUIRED_SEALED_USABILITY_KEYS = [
  'layoutCreateOrIdempotent',
  'probeWriteReadHash',
  'exclusiveClaim',
  'sameVolumeAtomicRename',
  'noOverwrite',
  'memberDigestVerify',
  'copyAwayManifestVerify',
  'ownedCleanup',
  'publicationCompletion',
] as const;

export function phaseASetupReceiptFinalEvidencePath(
  g4EvidenceBase: string,
  probeId: string
): string {
  return path.join(
    g4EvidenceBase,
    'review-handoff',
    `PHASE_A_SETUP_RECEIPT-${probeId}.final-evidence.json`
  );
}

export function phaseASetupReceiptPath(
  g4EvidenceBase: string,
  probeId: string
): string {
  return path.join(
    g4EvidenceBase,
    'review-handoff',
    `PHASE_A_SETUP_RECEIPT-${probeId}.json`
  );
}

/** Deterministic W4 destinations (same naming as mid-flight exclusive checks). */
export function phaseAPreflightPackagePath(
  g4EvidenceBase: string,
  probeId: string
): string {
  return path.join(g4EvidenceBase, 'preflight', probeId);
}

export function phaseAClaimDirPath(
  g4EvidenceBase: string,
  probeId: string
): string {
  return path.join(g4EvidenceBase, 'staging', `.claim-${probeId}`);
}

export function phaseAHandoffPackagePath(
  g4EvidenceBase: string,
  handoffId: string
): string {
  return path.join(g4EvidenceBase, 'review-handoff', handoffId);
}

export type MlCal1G4PhaseAW4ConflictCategory =
  | 'preflight_package_exists'
  | 'publish_claim_exists'
  | 'handoff_exists'
  | 'setup_receipt_exists'
  | 'setup_final_evidence_exists';

export type MlCal1G4PhaseAW4LstatKind =
  | 'file'
  | 'directory'
  | 'symlink'
  | 'other';

export type MlCal1G4PhaseAW4LstatSync = (path: fs.PathLike) => fs.Stats;

/**
 * lstat-style presence: distinguishes confirmed absence from present objects
 * (including dangling symlinks) and unreadable/I/O/identity errors.
 * Does not follow symlink targets. Creates nothing.
 * Optional lstatSync is test-only injection for permission/I/O regressions.
 */
export function lstatPathPresence(
  absPath: string,
  deps?: { lstatSync?: MlCal1G4PhaseAW4LstatSync }
):
  | { status: 'absent' }
  | { status: 'present'; kind: MlCal1G4PhaseAW4LstatKind }
  | { status: 'error'; reason: string } {
  const lstat = deps?.lstatSync ?? fs.lstatSync;
  try {
    const st = lstat(absPath);
    if (st.isSymbolicLink()) return { status: 'present', kind: 'symlink' };
    if (st.isDirectory()) return { status: 'present', kind: 'directory' };
    if (st.isFile()) return { status: 'present', kind: 'file' };
    return { status: 'present', kind: 'other' };
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: unknown }).code)
        : '';
    if (code === 'ENOENT') return { status: 'absent' };
    if (code === 'ENOTDIR') {
      return { status: 'error', reason: `w4_lstat_enotdir:${absPath}` };
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return {
        status: 'error',
        reason: `w4_lstat_permission:${code}:${redactError(e)}`,
      };
    }
    if (code === 'EIO') {
      return { status: 'error', reason: `w4_lstat_eio:${redactError(e)}` };
    }
    return {
      status: 'error',
      reason: `w4_lstat_failed:${code || 'unknown'}:${redactError(e)}`,
    };
  }
}

/**
 * W4 parent-chain inspection using lstat only (never existsSync).
 * Inspects each parent component of targetAbs, not the leaf.
 * Confirmed absence of a parent stops the walk (leaf will be absent).
 * Symlink/junction parents — including dangling — are unresolved ancestors.
 * Does not follow symlink targets. Creates nothing.
 */
export function validateW4DestinationParents(
  targetAbs: string,
  deps?: { lstatSync?: MlCal1G4PhaseAW4LstatSync }
):
  | { ok: true }
  | {
      ok: false;
      reasons: string[];
      notes: string[];
      unresolvedPath: string | null;
    } {
  const abs = path.resolve(targetAbs);
  const root = path.parse(abs).root;
  const rel = path.relative(root, abs);
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length === 0) {
    return {
      ok: false,
      reasons: ['w4_pre_mutation_conflict', 'w4_destination_is_fs_root'],
      notes: ['layout_probe_usability_not_run'],
      unresolvedPath: abs,
    };
  }

  let walk = root;
  const rootPresence = lstatPathPresence(walk, deps);
  if (rootPresence.status === 'error') {
    return {
      ok: false,
      reasons: ['w4_pre_mutation_conflict', rootPresence.reason],
      notes: [
        'w4_ancestor_lstat_error',
        'layout_probe_usability_not_run',
        `w4_conflict_path:${walk}`,
      ],
      unresolvedPath: walk,
    };
  }
  if (rootPresence.status === 'present' && rootPresence.kind === 'symlink') {
    return {
      ok: false,
      reasons: [
        'w4_pre_mutation_conflict',
        'w4_unresolved_ancestor_symlink:root',
      ],
      notes: [
        'w4_ancestor_symlink_or_dangling',
        'w4_conflict_before_user_root_mutation',
        'layout_probe_usability_not_run',
        `w4_conflict_path:${walk}`,
        'w4_conflict_kind:symlink',
      ],
      unresolvedPath: walk,
    };
  }

  const parentParts = parts.slice(0, -1);
  for (const part of parentParts) {
    walk = path.join(walk, part);
    const presence = lstatPathPresence(walk, deps);
    if (presence.status === 'absent') {
      // Confirmed missing parent: stop; leaf cannot be a durable object here.
      break;
    }
    if (presence.status === 'error') {
      return {
        ok: false,
        reasons: ['w4_pre_mutation_conflict', presence.reason],
        notes: [
          'w4_ancestor_lstat_error',
          'layout_probe_usability_not_run',
          `w4_conflict_path:${walk}`,
        ],
        unresolvedPath: walk,
      };
    }
    if (presence.kind === 'symlink') {
      return {
        ok: false,
        reasons: [
          'w4_pre_mutation_conflict',
          `w4_unresolved_ancestor_symlink:${part}`,
        ],
        notes: [
          'w4_ancestor_symlink_or_dangling',
          'w4_conflict_before_user_root_mutation',
          'layout_probe_usability_not_run',
          `w4_conflict_path:${walk}`,
          'w4_conflict_kind:symlink',
        ],
        unresolvedPath: walk,
      };
    }
    if (presence.kind !== 'directory') {
      return {
        ok: false,
        reasons: [
          'w4_pre_mutation_conflict',
          `w4_ancestor_not_directory:${part}`,
        ],
        notes: [
          'w4_ancestor_not_directory',
          'w4_conflict_before_user_root_mutation',
          'layout_probe_usability_not_run',
          `w4_conflict_path:${walk}`,
          `w4_conflict_kind:${presence.kind}`,
        ],
        unresolvedPath: walk,
      };
    }
  }
  return { ok: true };
}

function assertLogicalContainmentUnderRoot(
  rootAbs: string,
  candidateAbs: string
): { ok: true } | { ok: false; reason: string } {
  const root = path.resolve(rootAbs);
  const cand = path.resolve(candidateAbs);
  const rel = path.relative(root, cand);
  if (rel === '') {
    return { ok: false, reason: 'w4_path_is_operator_root' };
  }
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: 'w4_path_escape' };
  }
  return { ok: true };
}

/**
 * W4 read-only pre-mutation conflict scan for the five claimed destinations.
 * Missing user root / missing layout is allowed (absence). Creates nothing.
 * Fail-closed on ancestor/lstat errors. Does not traverse symlink targets.
 */
export function scanPhaseAW4PreMutationConflicts(input: {
  operatorUserRoot: string;
  g4EvidenceBase: string;
  probeId: string;
  handoffId: string;
  /** Test-only lstat injection for permission/I/O regressions. */
  lstatSync?: MlCal1G4PhaseAW4LstatSync;
}):
  | { ok: true }
  | {
      ok: false;
      reasons: string[];
      notes: string[];
      conflictPath: string | null;
      conflictKind: MlCal1G4PhaseAW4LstatKind | null;
    } {
  const operatorUserRoot = path.resolve(input.operatorUserRoot);
  const g4Base = path.resolve(input.g4EvidenceBase);
  const lstatDeps = input.lstatSync ? { lstatSync: input.lstatSync } : undefined;
  const underRoot = assertLogicalContainmentUnderRoot(operatorUserRoot, g4Base);
  if (underRoot.ok === false) {
    return {
      ok: false,
      reasons: ['w4_pre_mutation_conflict', underRoot.reason],
      notes: ['w4_g4_base_containment_failed'],
      conflictPath: null,
      conflictKind: null,
    };
  }

  const targets: Array<{
    category: MlCal1G4PhaseAW4ConflictCategory;
    abs: string;
  }> = [
    {
      category: 'preflight_package_exists',
      abs: phaseAPreflightPackagePath(g4Base, input.probeId),
    },
    {
      category: 'publish_claim_exists',
      abs: phaseAClaimDirPath(g4Base, input.probeId),
    },
    {
      category: 'handoff_exists',
      abs: phaseAHandoffPackagePath(g4Base, input.handoffId),
    },
    {
      category: 'setup_receipt_exists',
      abs: phaseASetupReceiptPath(g4Base, input.probeId),
    },
    {
      category: 'setup_final_evidence_exists',
      abs: phaseASetupReceiptFinalEvidencePath(g4Base, input.probeId),
    },
  ];

  for (const t of targets) {
    const contained = assertLogicalContainmentUnderRoot(
      operatorUserRoot,
      t.abs
    );
    if (contained.ok === false) {
      return {
        ok: false,
        reasons: ['w4_pre_mutation_conflict', contained.reason, t.category],
        notes: [`w4_target_escape:${t.category}`],
        conflictPath: t.abs,
        conflictKind: null,
      };
    }
    // Parents first (lstat): dangling/symlink ancestors refuse before leaf lstat.
    const parents = validateW4DestinationParents(t.abs, lstatDeps);
    if (parents.ok === false) {
      return {
        ok: false,
        reasons: [...parents.reasons, t.category],
        notes: parents.notes,
        conflictPath: parents.unresolvedPath ?? t.abs,
        conflictKind: parents.notes.includes('w4_conflict_kind:symlink')
          ? 'symlink'
          : null,
      };
    }
    // Leaf: terminal symlink/file/dir is a category conflict (do not follow).
    const presence = lstatPathPresence(t.abs, lstatDeps);
    if (presence.status === 'error') {
      return {
        ok: false,
        reasons: ['w4_pre_mutation_conflict', presence.reason, t.category],
        notes: [
          'w4_lstat_error_fail_closed',
          'layout_probe_usability_not_run',
          `w4_conflict_path:${t.abs}`,
        ],
        conflictPath: t.abs,
        conflictKind: null,
      };
    }
    if (presence.status === 'present') {
      return {
        ok: false,
        reasons: ['w4_pre_mutation_conflict', t.category],
        notes: [
          'w4_conflict_before_user_root_mutation',
          'layout_probe_usability_not_run',
          `w4_conflict_path:${t.abs}`,
          `w4_conflict_kind:${presence.kind}`,
          'pre_existing_object_not_owned_leftover',
        ],
        conflictPath: t.abs,
        conflictKind: presence.kind,
      };
    }
  }
  return { ok: true };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isIsoTimestamp(v: unknown): v is string {
  if (typeof v !== 'string' || !v.trim()) return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms) && new Date(ms).toISOString() === v;
}

function isSha256Hex(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
}

function requireExactBool(
  obj: Record<string, unknown>,
  key: string,
  expected: boolean,
  prefix: string,
  reasons: string[]
): void {
  if (!(key in obj)) {
    reasons.push(`${prefix}_missing_field:${key}`);
    return;
  }
  if (obj[key] !== expected) {
    if (typeof obj[key] !== 'boolean') {
      reasons.push(`${prefix}_wrong_type:${key}`);
    } else {
      reasons.push(`${prefix}_unexpected_${key}:${String(obj[key])}`);
    }
  }
}

function requireStringField(
  obj: Record<string, unknown>,
  key: string,
  prefix: string,
  reasons: string[]
): string | null {
  if (!(key in obj)) {
    reasons.push(`${prefix}_missing_field:${key}`);
    return null;
  }
  if (typeof obj[key] !== 'string' || !(obj[key] as string).trim()) {
    reasons.push(`${prefix}_wrong_type:${key}`);
    return null;
  }
  return obj[key] as string;
}

/**
 * Explicit schema for sealed provisional receipt JSON.
 * Rejects null/arrays/missing/wrong types; does not grant terminal success.
 */
export function validatePhaseAProvisionalReceiptObject(
  value: unknown
): { ok: boolean; reasons: string[]; value: Record<string, unknown> | null } {
  const reasons: string[] = [];
  if (value === null) {
    return { ok: false, reasons: ['receipt_null'], value: null };
  }
  if (Array.isArray(value)) {
    return { ok: false, reasons: ['receipt_array'], value: null };
  }
  if (!isPlainObject(value)) {
    return { ok: false, reasons: ['receipt_not_object'], value: null };
  }
  const o = value;
  if (o.kind !== ML_CAL_1_G4_PHASE_A_SETUP_RECEIPT_KIND) {
    reasons.push('receipt_kind_mismatch');
  }
  if (o.provenanceClass !== 'probe') {
    reasons.push(
      typeof o.provenanceClass === 'undefined'
        ? 'receipt_missing_field:provenanceClass'
        : 'receipt_provenance_not_probe'
    );
  }
  requireExactBool(o, 'probeProvenance', true, 'receipt', reasons);
  requireExactBool(o, 'provisional', true, 'receipt', reasons);
  requireExactBool(o, 'awaitsFinalEvidence', true, 'receipt', reasons);
  requireExactBool(o, 'setupCompleted', false, 'receipt', reasons);
  requireExactBool(o, 'publicationComplete', false, 'receipt', reasons);
  requireExactBool(o, 'terminalSuccess', false, 'receipt', reasons);
  requireExactBool(o, 'liveAccepted', false, 'receipt', reasons);
  requireExactBool(o, 'approved', false, 'receipt', reasons);
  requireExactBool(o, 'deployedPoolerProof', false, 'receipt', reasons);
  requireExactBool(o, 'credentialsPresent', false, 'receipt', reasons);

  const profile = requireStringField(o, 'profile', 'receipt', reasons);
  if (profile !== null && profile !== 'R-LOCAL-FS') {
    reasons.push('receipt_profile_mismatch');
  }
  const mode = requireStringField(o, 'mode', 'receipt', reasons);
  if (mode !== null && mode !== 'temp' && mode !== 'operator') {
    reasons.push('receipt_mode_invalid');
  }
  for (const key of [
    'operatorUserRoot',
    'g4EvidenceBase',
    'runnerRetainRoot',
    'probeId',
    'handoffId',
  ] as const) {
    const s = requireStringField(o, key, 'receipt', reasons);
    if (
      s !== null &&
      (key === 'probeId' || key === 'handoffId') &&
      !isSafeG4PreflightId(s)
    ) {
      reasons.push(`receipt_unsafe_${key}`);
    }
  }
  if (
    typeof o.operatorUserRoot === 'string' &&
    typeof o.g4EvidenceBase === 'string' &&
    typeof o.runnerRetainRoot === 'string'
  ) {
    const expectedG4 = g4EvidenceBaseFromOperatorUserRoot(o.operatorUserRoot);
    if (
      canonicalizePathForCompare(o.g4EvidenceBase) !==
      canonicalizePathForCompare(expectedG4)
    ) {
      reasons.push('receipt_g4_base_binding_mismatch');
    }
    if (
      canonicalizePathForCompare(o.runnerRetainRoot) !==
      canonicalizePathForCompare(o.g4EvidenceBase)
    ) {
      reasons.push('receipt_retain_root_binding_mismatch');
    }
  }

  const started = requireStringField(o, 'setupStartedAt', 'receipt', reasons);
  const ended = requireStringField(o, 'setupEndedAt', 'receipt', reasons);
  if (started !== null && !isIsoTimestamp(started)) {
    reasons.push('receipt_setupStartedAt_invalid');
  }
  if (ended !== null && !isIsoTimestamp(ended)) {
    reasons.push('receipt_setupEndedAt_invalid');
  }
  if (
    started !== null &&
    ended !== null &&
    isIsoTimestamp(started) &&
    isIsoTimestamp(ended) &&
    !(Date.parse(started) <= Date.parse(ended))
  ) {
    reasons.push('receipt_clock_reversed');
  }

  if (!isSha256Hex(o.designSha256)) {
    reasons.push(
      'designSha256' in o
        ? 'receipt_designSha256_invalid'
        : 'receipt_missing_field:designSha256'
    );
  } else if (o.designSha256 !== ML_CAL_1_G4_PHASE_A_DESIGN_SHA256) {
    reasons.push('receipt_designSha256_pin_mismatch');
  }
  if (
    typeof o.base255Head !== 'string' ||
    o.base255Head !== ML_CAL_1_G4_PHASE_A_BASE255_HEAD
  ) {
    reasons.push(
      'base255Head' in o
        ? 'receipt_base255Head_pin_mismatch'
        : 'receipt_missing_field:base255Head'
    );
  }
  if (!isSha256Hex(o.probeManifestSha256)) {
    reasons.push(
      'probeManifestSha256' in o
        ? 'receipt_probeManifestSha256_invalid'
        : 'receipt_missing_field:probeManifestSha256'
    );
  }

  if (!isPlainObject(o.usabilityChecks)) {
    reasons.push(
      o.usabilityChecks === null
        ? 'receipt_usabilityChecks_null'
        : Array.isArray(o.usabilityChecks)
          ? 'receipt_usabilityChecks_array'
          : 'receipt_missing_or_wrong_type:usabilityChecks'
    );
  } else {
    const u = o.usabilityChecks;
    for (const key of ML_CAL_1_G4_PHASE_A_REQUIRED_SEALED_USABILITY_KEYS) {
      if (!(key in u)) {
        reasons.push(`receipt_usability_missing:${key}`);
      } else if (u[key] !== true) {
        reasons.push(
          typeof u[key] !== 'boolean'
            ? `receipt_usability_wrong_type:${key}`
            : `receipt_usability_not_true:${key}`
        );
      }
    }
    if (u.receiptByteVerify === true) {
      reasons.push('receipt_usability_claims_receiptByteVerify');
    }
    if (u.exclusiveReceipt === true) {
      reasons.push('receipt_usability_claims_exclusiveReceipt');
    }
  }

  if (!isPlainObject(o.durabilityClaims)) {
    reasons.push(
      o.durabilityClaims === null
        ? 'receipt_durabilityClaims_null'
        : Array.isArray(o.durabilityClaims)
          ? 'receipt_durabilityClaims_array'
          : 'receipt_missing_or_wrong_type:durabilityClaims'
    );
  } else {
    for (const key of [
      'backup',
      'persistenceAcrossReboot',
      'multiSiteReplica',
      'permissionsBeyondProcessRights',
    ] as const) {
      requireExactBool(o.durabilityClaims, key, false, 'receipt_durability', reasons);
    }
  }

  if (!isPlainObject(o.memberDigests)) {
    reasons.push(
      o.memberDigests === null
        ? 'receipt_memberDigests_null'
        : Array.isArray(o.memberDigests)
          ? 'receipt_memberDigests_array'
          : 'receipt_missing_or_wrong_type:memberDigests'
    );
  }

  return { ok: reasons.length === 0, reasons, value: o };
}

/**
 * Explicit schema for digest-bound final evidence JSON.
 */
export function validatePhaseAFinalEvidenceObject(
  value: unknown
): { ok: boolean; reasons: string[]; value: Record<string, unknown> | null } {
  const reasons: string[] = [];
  if (value === null) {
    return { ok: false, reasons: ['final_evidence_null'], value: null };
  }
  if (Array.isArray(value)) {
    return { ok: false, reasons: ['final_evidence_array'], value: null };
  }
  if (!isPlainObject(value)) {
    return { ok: false, reasons: ['final_evidence_not_object'], value: null };
  }
  const o = value;
  if (o.kind !== ML_CAL_1_G4_PHASE_A_SETUP_RECEIPT_FINAL_EVIDENCE_KIND) {
    reasons.push('final_evidence_kind_mismatch');
  }
  if (o.provenanceClass !== 'probe') {
    reasons.push(
      typeof o.provenanceClass === 'undefined'
        ? 'final_evidence_missing_field:provenanceClass'
        : 'final_evidence_provenance_not_probe'
    );
  }
  requireExactBool(o, 'probeProvenance', true, 'final_evidence', reasons);
  requireExactBool(o, 'verificationPassed', true, 'final_evidence', reasons);
  requireExactBool(o, 'setupCompleted', true, 'final_evidence', reasons);
  requireExactBool(o, 'publicationComplete', true, 'final_evidence', reasons);
  requireExactBool(o, 'terminalSuccess', true, 'final_evidence', reasons);
  requireExactBool(o, 'liveAccepted', false, 'final_evidence', reasons);
  requireExactBool(o, 'approved', false, 'final_evidence', reasons);
  requireExactBool(o, 'deployedPoolerProof', false, 'final_evidence', reasons);
  requireExactBool(o, 'credentialsPresent', false, 'final_evidence', reasons);

  for (const key of ['probeId', 'handoffId'] as const) {
    const s = requireStringField(o, key, 'final_evidence', reasons);
    if (s !== null && !isSafeG4PreflightId(s)) {
      reasons.push(`final_evidence_unsafe_${key}`);
    }
  }
  if (!isSha256Hex(o.provisionalReceiptSha256)) {
    reasons.push(
      'provisionalReceiptSha256' in o
        ? 'final_evidence_provisionalReceiptSha256_invalid'
        : 'final_evidence_missing_field:provisionalReceiptSha256'
    );
  }
  if (
    typeof o.provisionalReceiptByteCount !== 'number' ||
    !Number.isInteger(o.provisionalReceiptByteCount) ||
    o.provisionalReceiptByteCount < 0
  ) {
    reasons.push(
      'provisionalReceiptByteCount' in o
        ? 'final_evidence_provisionalReceiptByteCount_invalid'
        : 'final_evidence_missing_field:provisionalReceiptByteCount'
    );
  }
  const started = requireStringField(o, 'setupStartedAt', 'final_evidence', reasons);
  const completed = requireStringField(
    o,
    'setupCompletedAt',
    'final_evidence',
    reasons
  );
  if (started !== null && !isIsoTimestamp(started)) {
    reasons.push('final_evidence_setupStartedAt_invalid');
  }
  if (completed !== null && !isIsoTimestamp(completed)) {
    reasons.push('final_evidence_setupCompletedAt_invalid');
  }
  if (
    started !== null &&
    completed !== null &&
    isIsoTimestamp(started) &&
    isIsoTimestamp(completed) &&
    !(Date.parse(started) <= Date.parse(completed))
  ) {
    reasons.push('final_evidence_clock_reversed');
  }

  return { ok: reasons.length === 0, reasons, value: o };
}

export interface MlCal1G4PhaseAExternalAnchorClaim {
  /** Separately retained expected digests for BOTH artifacts. */
  expectedReceiptSha256: string;
  expectedFinalEvidenceSha256: string;
}

export interface MlCal1G4PhaseATerminalSuccessEval {
  ok: boolean;
  terminalSuccess: boolean;
  internallyConsistent: boolean;
  externallyAnchored: boolean;
  reasons: string[];
  receiptSha256: string | null;
  receiptByteCount: number | null;
  finalEvidenceSha256: string | null;
  finalEvidenceByteCount: number | null;
  provisional: boolean | null;
}

/**
 * Terminal setup success requires provisional sealed receipt PLUS separately
 * supplied final evidence bound to the receipt's exact digest.
 *
 * Internal consistency ≠ external anchoring. Claiming externally anchored review
 * requires separately retained expected digests covering BOTH artifacts.
 */
export function evaluatePhaseASetupReceiptForTerminalSuccess(input: {
  receiptPath: string;
  finalEvidencePath?: string | null;
  externalAnchor?: MlCal1G4PhaseAExternalAnchorClaim | null;
}): MlCal1G4PhaseATerminalSuccessEval {
  const fail = (
    reasons: string[],
    partial: Partial<MlCal1G4PhaseATerminalSuccessEval> = {}
  ): MlCal1G4PhaseATerminalSuccessEval => ({
    ok: false,
    terminalSuccess: false,
    internallyConsistent: false,
    externallyAnchored: false,
    reasons,
    receiptSha256: null,
    receiptByteCount: null,
    finalEvidenceSha256: null,
    finalEvidenceByteCount: null,
    provisional: null,
    ...partial,
  });

  if (!fs.existsSync(input.receiptPath)) {
    return fail(['receipt_missing']);
  }
  if (isSymlinkOrJunction(input.receiptPath)) {
    return fail(['receipt_symlink']);
  }
  let receiptBytes: Buffer;
  try {
    receiptBytes = fs.readFileSync(input.receiptPath);
  } catch (e) {
    return fail([`receipt_unreadable:${redactError(e)}`]);
  }
  const receiptSha256 = sha256Buffer(receiptBytes);
  const receiptByteCount = receiptBytes.length;

  let parsedReceipt: unknown;
  try {
    parsedReceipt = JSON.parse(receiptBytes.toString('utf8'));
  } catch (e) {
    return fail([`receipt_json_invalid:${redactError(e)}`], {
      receiptSha256,
      receiptByteCount,
    });
  }
  const receiptSchema = validatePhaseAProvisionalReceiptObject(parsedReceipt);
  if (!receiptSchema.ok || !receiptSchema.value) {
    return fail(receiptSchema.reasons, {
      receiptSha256,
      receiptByteCount,
      provisional: false,
    });
  }
  const receipt = receiptSchema.value;

  const finalPath = input.finalEvidencePath ?? null;
  if (!finalPath || !fs.existsSync(finalPath)) {
    return fail([...receiptSchema.reasons, 'final_evidence_missing'], {
      receiptSha256,
      receiptByteCount,
      provisional: true,
    });
  }
  if (isSymlinkOrJunction(finalPath)) {
    return fail(['final_evidence_symlink'], {
      receiptSha256,
      receiptByteCount,
      provisional: true,
    });
  }
  let finalBytes: Buffer;
  try {
    finalBytes = fs.readFileSync(finalPath);
  } catch (e) {
    return fail([`final_evidence_unreadable:${redactError(e)}`], {
      receiptSha256,
      receiptByteCount,
      provisional: true,
    });
  }
  const finalEvidenceSha256 = sha256Buffer(finalBytes);
  const finalEvidenceByteCount = finalBytes.length;

  let parsedFinal: unknown;
  try {
    parsedFinal = JSON.parse(finalBytes.toString('utf8'));
  } catch (e) {
    return fail([`final_evidence_json_invalid:${redactError(e)}`], {
      receiptSha256,
      receiptByteCount,
      finalEvidenceSha256,
      finalEvidenceByteCount,
      provisional: true,
    });
  }
  const finalSchema = validatePhaseAFinalEvidenceObject(parsedFinal);
  const reasons: string[] = [];
  if (!finalSchema.ok || !finalSchema.value) {
    reasons.push(...finalSchema.reasons);
  }
  const finalEv = finalSchema.value;

  // Exact digest / byte-count binding to retained receipt bytes.
  if (finalEv) {
    const boundSha =
      typeof finalEv.provisionalReceiptSha256 === 'string'
        ? finalEv.provisionalReceiptSha256.toLowerCase()
        : '';
    const boundBytes =
      typeof finalEv.provisionalReceiptByteCount === 'number'
        ? finalEv.provisionalReceiptByteCount
        : -1;
    if (boundSha !== receiptSha256) {
      reasons.push('final_evidence_digest_binding_mismatch');
    }
    if (boundBytes !== receiptByteCount) {
      reasons.push('final_evidence_bytecount_binding_mismatch');
    }
    if (finalEv.probeId !== receipt.probeId) {
      reasons.push('correspondence_probeId_mismatch');
    }
    if (finalEv.handoffId !== receipt.handoffId) {
      reasons.push('correspondence_handoffId_mismatch');
    }
    if (finalEv.setupStartedAt !== receipt.setupStartedAt) {
      reasons.push('correspondence_setupStartedAt_mismatch');
    }
    if (finalEv.setupCompletedAt !== receipt.setupEndedAt) {
      reasons.push('correspondence_setupCompletedAt_mismatch');
    }
  }

  const correspondenceReasons = [...reasons];
  const internallyConsistent =
    receiptSchema.ok &&
    finalSchema.ok &&
    correspondenceReasons.length === 0;

  // External anchoring is separate from internal consistency. Claiming it
  // requires separately retained expected digests for BOTH artifacts.
  const externalReasons: string[] = [];
  let externallyAnchored = false;
  if (input.externalAnchor != null) {
    if (!isPlainObject(input.externalAnchor)) {
      externalReasons.push('external_anchor_not_object');
    } else {
      const ea = input.externalAnchor as MlCal1G4PhaseAExternalAnchorClaim;
      if (!isSha256Hex(ea.expectedReceiptSha256)) {
        externalReasons.push('external_anchor_expectedReceiptSha256_invalid');
      } else if (ea.expectedReceiptSha256 !== receiptSha256) {
        externalReasons.push('external_anchor_receipt_digest_mismatch');
      }
      if (!isSha256Hex(ea.expectedFinalEvidenceSha256)) {
        externalReasons.push(
          'external_anchor_expectedFinalEvidenceSha256_invalid'
        );
      } else if (ea.expectedFinalEvidenceSha256 !== finalEvidenceSha256) {
        externalReasons.push('external_anchor_final_evidence_digest_mismatch');
      }
      if (
        externalReasons.length === 0 &&
        internallyConsistent &&
        isSha256Hex(ea.expectedReceiptSha256) &&
        isSha256Hex(ea.expectedFinalEvidenceSha256)
      ) {
        externallyAnchored = true;
      }
    }
  }

  const allReasons = [...correspondenceReasons, ...externalReasons];
  const claimingExternal = input.externalAnchor != null;
  // Internal consistency can stand alone. Claiming externally anchored review
  // additionally requires both separately retained digests to match.
  const ok =
    internallyConsistent && (!claimingExternal || externallyAnchored);

  if (!ok) {
    return fail(
      allReasons.length > 0 ? allReasons : ['internal_consistency_failed'],
      {
        receiptSha256,
        receiptByteCount,
        finalEvidenceSha256,
        finalEvidenceByteCount,
        provisional: true,
        internallyConsistent,
        externallyAnchored: false,
      }
    );
  }

  return {
    ok: true,
    terminalSuccess: true,
    internallyConsistent: true,
    externallyAnchored,
    reasons: [],
    receiptSha256,
    receiptByteCount,
    finalEvidenceSha256,
    finalEvidenceByteCount,
    provisional: true,
  };
}

export function assertTempOperatorDoubleRoot(operatorUserRoot: string): {
  ok: boolean;
  reasons: string[];
  root: string;
} {
  const abs = requireAbsoluteDestination(operatorUserRoot);
  if (abs.ok === false) {
    return { ok: false, reasons: [abs.reason], root: '' };
  }
  const resolved = abs.abs;
  if (
    canonicalizePathForCompare(resolved) ===
    canonicalizePathForCompare(ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL)
  ) {
    return {
      ok: false,
      reasons: ['proposed_operator_root_forbidden_in_temp_mode'],
      root: resolved,
    };
  }
  let tmpReal: string;
  try {
    tmpReal = fs.realpathSync(os.tmpdir());
  } catch (e) {
    return {
      ok: false,
      reasons: [`tmpdir_unusable:${redactError(e)}`],
      root: resolved,
    };
  }
  const ancestors = validateExistingAncestors(resolved);
  if (!ancestors.ok) {
    return { ok: false, reasons: ancestors.reasons, root: resolved };
  }
  if (fs.existsSync(resolved) && isSymlinkOrJunction(resolved)) {
    return { ok: false, reasons: ['operator_root_symlink'], root: resolved };
  }
  try {
    const real = fs.existsSync(resolved)
      ? fs.realpathSync(resolved)
      : resolved;
    if (real !== tmpReal && !real.startsWith(tmpReal + path.sep)) {
      return {
        ok: false,
        reasons: ['operator_root_not_under_tmpdir'],
        root: resolved,
      };
    }
  } catch (e) {
    return {
      ok: false,
      reasons: [`operator_root_unreadable:${redactError(e)}`],
      root: resolved,
    };
  }
  return { ok: true, reasons: [], root: resolved };
}

export interface MlCal1G4PhaseASetupInput {
  enabled: unknown;
  confirmSetup: unknown;
  expectedOperatorUserRoot: string;
  actualOperatorUserRoot: string;
  mode: 'temp' | 'operator';
  probeId: string;
  handoffId: string;
  now: () => Date;
  injectFailure?:
    | 'after_layout'
    | 'after_probe_write'
    | 'after_stage_write'
    | 'after_claim'
    | 'after_rename'
    | 'after_publish'
    | 'after_copy'
    | 'after_completion_clock'
    | 'after_completion'
    | 'receipt_verify_read'
    | 'receipt_verify_hash'
    | 'receipt_verify_read_remove_fail';
  /**
   * Test-only: invoked after W4 pre-mutation scan passes and before the start
   * clock / first user-root mutation. Production callers must omit this.
   * Used to plant a post-scan race conflict without a production bypass flag.
   * In operator mode, Windows W5–W9 gating runs before this hook and always
   * refuses while W6–W9 are unimplemented — temp mode still reaches this hook.
   */
  testOnlyAfterW4PreMutationScan?: () => void;
  /**
   * Test-only: records each user-root mutating FS call after W4 passes.
   * Detects transient mkdir/write/rename/remove that byte snapshots miss.
   */
  testOnlyRecordUserRootMutation?: (op: string, absTarget: string) => void;
  /** Test-only lstat injection forwarded into the W4 scan. */
  testOnlyW4LstatSync?: MlCal1G4PhaseAW4LstatSync;
  /**
   * Test-only: substitute W5 inspect for operator Windows gating.
   * Cannot manufacture full-bundle PASS — W6–W9 remain incomplete.
   */
  testOnlyW5Inspect?: () => MlCal1G4W5InspectResult;
}

export interface MlCal1G4PhaseAReceiptPostWriteVerification {
  /** Explicitly separate from sealed receipt content. */
  performed: boolean;
  byteCountMatch: boolean;
  digestMatch: boolean;
  retainedSha256: string | null;
  retainedByteCount: number | null;
  expectedSha256: string | null;
  expectedByteCount: number | null;
}

export interface MlCal1G4PhaseASetupResult {
  ok: boolean;
  reasons: string[];
  notes: string[];
  provenanceClass: 'probe';
  liveAccepted: false;
  approved: false;
  deployedPoolerProof: false;
  credentialsPresent: false;
  setupCompleted: boolean;
  mode: 'temp' | 'operator' | null;
  operatorUserRoot: string | null;
  g4EvidenceBase: string | null;
  runnerRetainRoot: string | null;
  probePackageDir: string | null;
  handoffDir: string | null;
  setupReceiptPath: string | null;
  setupReceiptSha256: string | null;
  setupReceiptByteCount: number | null;
  /** Post-write verify evidence — never embedded by rewriting a sealed receipt. */
  receiptPostWriteVerification: MlCal1G4PhaseAReceiptPostWriteVerification | null;
  /** Digest-bound final evidence path; required for terminal success with provisional receipt. */
  finalEvidencePath: string | null;
  finalEvidenceSha256: string | null;
  probeManifestSha256: string | null;
  usabilityChecks: Record<string, boolean>;
  durabilityClaims: Record<string, false>;
  leftovers: string[];
}

function refuse(
  reasons: string[],
  mode: 'temp' | 'operator' | null = null,
  partial: Partial<MlCal1G4PhaseASetupResult> = {}
): MlCal1G4PhaseASetupResult {
  const base: MlCal1G4PhaseASetupResult = {
    ok: false,
    reasons,
    notes: [],
    provenanceClass: 'probe',
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    credentialsPresent: false,
    setupCompleted: false,
    mode,
    operatorUserRoot: null,
    g4EvidenceBase: null,
    runnerRetainRoot: null,
    probePackageDir: null,
    handoffDir: null,
    setupReceiptPath: null,
    setupReceiptSha256: null,
    setupReceiptByteCount: null,
    receiptPostWriteVerification: null,
    finalEvidencePath: null,
    finalEvidenceSha256: null,
    probeManifestSha256: null,
    usabilityChecks: {},
    durabilityClaims: {
      backup: false,
      persistenceAcrossReboot: false,
      multiSiteReplica: false,
      permissionsBeyondProcessRights: false,
    },
    leftovers: [],
  };
  return {
    ...base,
    ...partial,
    ok: false,
    setupCompleted: false,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    reasons: partial.reasons ?? reasons,
    provenanceClass: 'probe',
    receiptPostWriteVerification:
      partial.receiptPostWriteVerification ??
      base.receiptPostWriteVerification,
  };
}

function readClock(
  now: () => Date,
  label: string
): { ok: true; iso: string; ms: number } | { ok: false; reason: string } {
  try {
    const d = now();
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
      return { ok: false, reason: `${label}_clock_invalid` };
    }
    if (!Number.isFinite(d.getTime())) {
      return { ok: false, reason: `${label}_clock_non_finite` };
    }
    return { ok: true, iso: d.toISOString(), ms: d.getTime() };
  } catch (e) {
    return { ok: false, reason: `${label}_clock_threw:${redactError(e)}` };
  }
}

/**
 * Phase A retention setup. Probe provenance only.
 * Disabled/malformed opt-in: zero filesystem/clock effects.
 */
export function runG4PhaseARetentionSetup(
  input: MlCal1G4PhaseASetupInput
): MlCal1G4PhaseASetupResult {
  if (input.enabled !== true) {
    return refuse(['phase_a_setup_disabled']);
  }
  if (input.confirmSetup !== true) {
    return refuse(['phase_a_confirm_setup_required']);
  }
  if (input.mode !== 'temp' && input.mode !== 'operator') {
    return refuse(['phase_a_mode_invalid']);
  }
  if (!isSafeG4PreflightId(input.probeId)) {
    return refuse(['unsafe_probe_id']);
  }
  if (!isSafeG4PreflightId(input.handoffId)) {
    return refuse(['unsafe_handoff_id']);
  }
  if (typeof input.now !== 'function') {
    return refuse(['injected_clock_not_function']);
  }

  // Temp mode: forbid the proposed Windows operator label before absolute-path
  // gating so Linux CI rejects the same sentinel string (path.isAbsolute is
  // platform-specific for Windows drive paths).
  if (
    input.mode === 'temp' &&
    (input.actualOperatorUserRoot ===
      ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL ||
      input.expectedOperatorUserRoot ===
        ML_CAL_1_G4_PROPOSED_OPERATOR_USER_ROOT_LABEL)
  ) {
    return refuse(['proposed_operator_root_forbidden_in_temp_mode'], 'temp');
  }

  const expectedAbs = requireAbsoluteDestination(
    input.expectedOperatorUserRoot
  );
  if (expectedAbs.ok === false) {
    return refuse([`expected_${expectedAbs.reason}`]);
  }
  const actualAbs = requireAbsoluteDestination(input.actualOperatorUserRoot);
  if (actualAbs.ok === false) {
    return refuse([`actual_${actualAbs.reason}`]);
  }
  if (
    canonicalizePathForCompare(expectedAbs.abs) !==
    canonicalizePathForCompare(actualAbs.abs)
  ) {
    return refuse(['operator_root_binding_mismatch']);
  }

  if (input.mode === 'temp') {
    const gate = assertTempOperatorDoubleRoot(actualAbs.abs);
    if (!gate.ok) return refuse(gate.reasons, 'temp');
  } else {
    const anc = validateExistingAncestors(actualAbs.abs);
    if (!anc.ok) return refuse(anc.reasons, 'operator');
    if (fs.existsSync(actualAbs.abs) && isSymlinkOrJunction(actualAbs.abs)) {
      return refuse(['operator_root_symlink'], 'operator');
    }
  }

  // F1: validate planned layout destinations' existing ancestors BEFORE any mkdir
  const operatorUserRoot = actualAbs.abs;
  const g4Base = g4EvidenceBaseFromOperatorUserRoot(operatorUserRoot);
  const plannedPaths = [
    operatorUserRoot,
    path.join(operatorUserRoot, 'ml-cal-1'),
    g4Base,
    ...ML_CAL_1_G4_PREFLIGHT_SUBTREES.map((s) => path.join(g4Base, s)),
  ];
  for (const p of plannedPaths) {
    const anc = validateExistingAncestors(p);
    if (!anc.ok) {
      return refuse(anc.reasons, input.mode);
    }
  }

  // W4: refuse claimed ID destinations before start clock and before any
  // user-root mutation. Missing layout/root is allowed (confirmed absence).
  const w4 = scanPhaseAW4PreMutationConflicts({
    operatorUserRoot,
    g4EvidenceBase: g4Base,
    probeId: input.probeId,
    handoffId: input.handoffId,
    lstatSync: input.testOnlyW4LstatSync,
  });
  if (w4.ok === false) {
    return refuse(w4.reasons, input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      leftovers: [],
      notes: w4.notes,
      usabilityChecks: {},
    });
  }

  // Operator Win32 bundle (W5–W9): after W4, before start clock / user-root
  // mutation. Temp mode skips native inspection. W5-only → always BLOCKED.
  if (input.mode === 'operator') {
    const winGates = evaluateOperatorWindowsGatesAfterW4({
      operatorUserRoot,
      testOnlyW5Inspect: input.testOnlyW5Inspect,
    });
    return refuse(winGates.reasons, 'operator', {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      leftovers: [],
      notes: [
        ...winGates.notes,
        'w5_operator_gate_before_start_clock',
        'w5_zero_user_root_mutation',
      ],
      usabilityChecks: {},
    });
  }

  if (typeof input.testOnlyAfterW4PreMutationScan === 'function') {
    try {
      input.testOnlyAfterW4PreMutationScan();
    } catch (e) {
      return refuse(
        [`w4_test_hook_threw:${redactError(e)}`],
        input.mode,
        {
          operatorUserRoot,
          g4EvidenceBase: g4Base,
          runnerRetainRoot: g4Base,
          leftovers: [],
          notes: ['test_only_after_w4_hook_failed_before_mutation'],
          usabilityChecks: {},
        }
      );
    }
  }

  const startClock = readClock(input.now, 'start');
  if (startClock.ok === false) {
    return refuse([startClock.reason], input.mode);
  }
  const startIso = startClock.iso;
  const startMs = startClock.ms;

  const usability: Record<string, boolean> = {
    layoutCreateOrIdempotent: false,
    probeWriteReadHash: false,
    exclusiveClaim: false,
    sameVolumeAtomicRename: false,
    noOverwrite: false,
    memberDigestVerify: false,
    copyAwayManifestVerify: false,
    ownedCleanup: false,
    exclusiveReceipt: false,
    receiptByteVerify: false,
    publicationCompletion: false,
  };
  const durabilityClaims = {
    backup: false as const,
    persistenceAcrossReboot: false as const,
    multiSiteReplica: false as const,
    permissionsBeyondProcessRights: false as const,
  };
  const leftovers: string[] = [];
  const notes: string[] = [];

  // Activate cross-helper mutation recording for the remainder of this invocation.
  const prevMutationRecorder = activePhaseAMutationRecorder;
  activePhaseAMutationRecorder =
    typeof input.testOnlyRecordUserRootMutation === 'function'
      ? input.testOnlyRecordUserRootMutation
      : undefined;

  const mkdirSyncTracked = (
    p: fs.PathLike,
    o?: fs.MakeDirectoryOptions | fs.Mode | null
  ) => {
    phaseARecordMutation('mkdir', String(p));
    return fs.mkdirSync(p, o as never);
  };
  const writeFileSyncTracked = (
    p: fs.PathOrFileDescriptor,
    data: string | NodeJS.ArrayBufferView,
    o?: fs.WriteFileOptions
  ) => {
    phaseARecordMutation('write', String(p));
    return fs.writeFileSync(p, data, o as never);
  };
  const copyFileSyncTracked = (
    src: fs.PathLike,
    dest: fs.PathLike,
    mode?: number
  ) => {
    phaseARecordMutation('copy', String(dest));
    return fs.copyFileSync(src, dest, mode);
  };
  const renameSyncTracked = (src: fs.PathLike, dest: fs.PathLike) => {
    phaseARecordMutation('rename', String(src));
    phaseARecordMutation('rename', String(dest));
    return fs.renameSync(src, dest);
  };
  const unlinkSyncTracked = (p: fs.PathLike) => {
    phaseARecordMutation('remove', String(p));
    return fs.unlinkSync(p);
  };
  const rmSyncTracked = (p: fs.PathLike, o?: fs.RmOptions) => {
    phaseARecordMutation('remove', String(p));
    return fs.rmSync(p, o);
  };

  try {
  // Mutations begin only after ancestor validation + W4 conflict scan
  try {
    if (!fs.existsSync(operatorUserRoot)) {
      mkdirSyncTracked(operatorUserRoot, { recursive: true });
    }
    if (isSymlinkOrJunction(operatorUserRoot)) {
      return refuse(['operator_root_symlink'], input.mode);
    }
  } catch (e) {
    return refuse(
      [`operator_root_create_failed:${redactError(e)}`],
      input.mode
    );
  }

  try {
    const ml = path.join(operatorUserRoot, 'ml-cal-1');
    const g4 = path.join(ml, 'g4');
    for (const p of [ml, g4]) {
      if (fs.existsSync(p)) {
        if (isSymlinkOrJunction(p)) {
          return refuse([`symlink_in_path:${path.basename(p)}`], input.mode);
        }
        if (!fs.statSync(p).isDirectory()) {
          return refuse([`path_not_directory:${path.basename(p)}`], input.mode);
        }
      } else {
        mkdirSyncTracked(p, { recursive: true });
      }
    }
    for (const sub of ML_CAL_1_G4_PREFLIGHT_SUBTREES) {
      const p = path.join(g4Base, sub);
      assertPhysicalContainment(operatorUserRoot, p);
      if (fs.existsSync(p)) {
        if (isSymlinkOrJunction(p)) {
          return refuse([`symlink_in_layout:${sub}`], input.mode);
        }
        if (!fs.statSync(p).isDirectory()) {
          return refuse([`layout_conflict_not_dir:${sub}`], input.mode);
        }
      } else {
        mkdirSyncTracked(p, { recursive: true });
      }
    }
    usability.layoutCreateOrIdempotent = true;
  } catch (e) {
    return refuse([`layout_failed:${redactError(e)}`], input.mode);
  }

  if (input.injectFailure === 'after_layout') {
    return refuse(['inject_failure_after_layout'], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }

  const stagingRoot = path.join(g4Base, 'staging');
  const preflightRoot = path.join(g4Base, 'preflight');
  const handoffRoot = path.join(g4Base, 'review-handoff');
  const probeFile = path.join(
    stagingRoot,
    `.probe-${input.probeId}-${randomUUID()}.bin`
  );
  const stagingDir = path.join(
    stagingRoot,
    `.tmp-${input.probeId}-${randomUUID()}`
  );
  const claimDir = path.join(stagingRoot, `.claim-${input.probeId}`);
  const finalDir = path.join(preflightRoot, input.probeId);
  const handoffDir = path.join(handoffRoot, input.handoffId);

  try {
    assertPhysicalContainment(operatorUserRoot, probeFile);
    const payload = Buffer.from(
      `phase-a-probe:${input.probeId}:${startIso}\n`,
      'utf8'
    );
    writeFileSyncTracked(probeFile, payload);
    const readBack = fs.readFileSync(probeFile);
    if (!readBack.equals(payload)) {
      safeRemoveContained(operatorUserRoot, probeFile);
      return refuse(['probe_readback_mismatch'], input.mode, {
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
      });
    }
    if (sha256Buffer(readBack).length !== 64) {
      safeRemoveContained(operatorUserRoot, probeFile);
      return refuse(['probe_hash_invalid'], input.mode);
    }
    usability.probeWriteReadHash = true;
    const rm = safeRemoveContained(operatorUserRoot, probeFile);
    if (!rm.ok) {
      leftovers.push(probeFile);
      return refuse([`probe_cleanup_failed:${rm.reason ?? 'unknown'}`], input.mode, {
        leftovers,
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        usabilityChecks: usability,
        durabilityClaims,
      });
    }
  } catch (e) {
    safeRemoveContained(operatorUserRoot, probeFile);
    return refuse([`probe_write_failed:${redactError(e)}`], input.mode);
  }

  if (input.injectFailure === 'after_probe_write') {
    return refuse(['inject_failure_after_probe_write'], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }

  if (fs.existsSync(finalDir)) {
    usability.noOverwrite = true;
    return refuse(['preflight_package_exists'], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }
  usability.noOverwrite = true;

  // Stage with terminalSuccess false until completion evidence is written
  const probeBody = {
    kind: 'g4-phase-a-setup-probe-member',
    preflightId: input.probeId,
    provenanceClass: 'probe' as const,
    probeProvenance: true,
    mockProvenance: false,
    fixtureProvenance: false,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    credentialsPresent: false,
    setupKind: ML_CAL_1_G4_PHASE_A_SETUP_KIND,
    note: 'phase_a_fs_usability_probe_not_p_preflight',
  };
  const memberBytes = Buffer.from(`${stableStringify(probeBody)}\n`, 'utf8');
  if (scanSecretish(memberBytes.toString('utf8'))) {
    return refuse(['probe_member_secretish'], input.mode);
  }
  const memberDigests: Record<string, { sha256: string; byteCount: number }> = {
    'PROBE_MEMBER.json': {
      sha256: sha256Buffer(memberBytes),
      byteCount: memberBytes.length,
    },
  };
  const manifestCore = {
    schemaVersion: ML_CAL_1_G4_PHASE_A_PROBE_PACKAGE_SCHEMA,
    kind: 'g4-phase-a-setup-probe-package',
    preflightId: input.probeId,
    provenanceClass: 'probe' as const,
    probeProvenance: true,
    mockProvenance: false,
    fixtureProvenance: false,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    credentialsPresent: false,
    // F4: not successful until PUBLICATION_COMPLETION written
    terminalSuccess: false as const,
    publicationComplete: false as const,
    memberDigests,
    operatorUserRootLabel: operatorUserRoot,
    g4EvidenceBaseLabel: g4Base,
    runnerRetainRootLabel: g4Base,
  };
  const manifestBytes = Buffer.from(
    `${stableStringify(manifestCore)}\n`,
    'utf8'
  );
  const manifestSha256 = sha256Buffer(manifestBytes);

  try {
    assertPhysicalContainment(operatorUserRoot, stagingDir);
    mkdirSyncTracked(stagingDir, { recursive: true });
    writeFileSyncTracked(path.join(stagingDir, 'PROBE_MEMBER.json'), memberBytes);
    writeFileSyncTracked(
      path.join(stagingDir, 'PACKAGE_MANIFEST.json'),
      manifestBytes
    );
    writeFileSyncTracked(
      path.join(stagingDir, 'PACKAGE_MANIFEST.sha256'),
      `${manifestSha256}\n`
    );
    if (input.injectFailure === 'after_stage_write') {
      safeRemoveContained(operatorUserRoot, stagingDir);
      return refuse(['inject_failure_after_stage_write'], input.mode, {
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        usabilityChecks: usability,
        durabilityClaims,
      });
    }
  } catch (e) {
    safeRemoveContained(operatorUserRoot, stagingDir);
    return refuse([`stage_failed:${redactError(e)}`], input.mode);
  }

  try {
    assertPhysicalContainment(operatorUserRoot, claimDir);
    mkdirSyncTracked(claimDir);
    usability.exclusiveClaim = true;
  } catch (e: unknown) {
    safeRemoveContained(operatorUserRoot, stagingDir);
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: unknown }).code)
        : '';
    if (code === 'EEXIST') {
      return refuse(['publish_claim_exists'], input.mode, {
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        usabilityChecks: usability,
        durabilityClaims,
      });
    }
    return refuse([`publish_claim_failed:${redactError(e)}`], input.mode);
  }

  if (input.injectFailure === 'after_claim') {
    safeRemoveContained(operatorUserRoot, claimDir);
    safeRemoveContained(operatorUserRoot, stagingDir);
    return refuse(['inject_failure_after_claim'], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }

  try {
    assertPhysicalContainment(operatorUserRoot, stagingDir);
    assertPhysicalContainment(operatorUserRoot, finalDir);
    if (fs.existsSync(finalDir)) {
      safeRemoveContained(operatorUserRoot, claimDir);
      safeRemoveContained(operatorUserRoot, stagingDir);
      return refuse(['preflight_package_exists'], input.mode, {
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        usabilityChecks: usability,
        durabilityClaims,
      });
    }
    if (input.injectFailure === 'after_rename') {
      // Simulate rename failure: do not rename; cleanup staging/claim
      safeRemoveContained(operatorUserRoot, claimDir);
      safeRemoveContained(operatorUserRoot, stagingDir);
      return refuse(['inject_failure_after_rename'], input.mode, {
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        usabilityChecks: usability,
        durabilityClaims,
      });
    }
    renameSyncTracked(stagingDir, finalDir);
    usability.sameVolumeAtomicRename = true;
  } catch (e) {
    safeRemoveContained(operatorUserRoot, claimDir);
    safeRemoveContained(operatorUserRoot, stagingDir);
    return refuse([`atomic_publish_failed:${redactError(e)}`], input.mode);
  } finally {
    safeRemoveContained(operatorUserRoot, claimDir);
    safeRemoveContained(operatorUserRoot, stagingDir);
  }

  if (input.injectFailure === 'after_publish') {
    invalidateRetainedProbe({
      operatorUserRoot,
      packageDir: finalDir,
      probeId: input.probeId,
      reasons: ['inject_failure_after_publish'],
    });
    leftovers.push(finalDir);
    return refuse(['inject_failure_after_publish'], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      probePackageDir: finalDir,
      leftovers,
      usabilityChecks: usability,
      durabilityClaims,
      notes: ['failed_probe_package_preserved_invalidated'],
    });
  }

  // F3: post-publish member digest verify against original manifest
  const publishedReasons = verifyProbePackageMembers(
    finalDir,
    memberDigests,
    manifestSha256
  );
  if (publishedReasons.length > 0) {
    invalidateRetainedProbe({
      operatorUserRoot,
      packageDir: finalDir,
      probeId: input.probeId,
      reasons: publishedReasons,
    });
    leftovers.push(finalDir);
    return refuse(publishedReasons.map((r) => `published_${r}`), input.mode, {
      leftovers,
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      probePackageDir: finalDir,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }
  usability.memberDigestVerify = true;

  // Copy-away + F3 handoff verify against original digests
  try {
    assertPhysicalContainment(operatorUserRoot, handoffDir);
    if (fs.existsSync(handoffDir)) {
      invalidateRetainedProbe({
        operatorUserRoot,
        packageDir: finalDir,
        probeId: input.probeId,
        reasons: ['handoff_exists'],
      });
      leftovers.push(finalDir);
      return refuse(['handoff_exists'], input.mode, {
        leftovers,
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        probePackageDir: finalDir,
        usabilityChecks: usability,
        durabilityClaims,
      });
    }
    mkdirSyncTracked(handoffDir, { recursive: true });
    for (const name of ML_CAL_1_G4_PHASE_A_REQUIRED_PROBE_MEMBERS) {
      const src = path.join(finalDir, name);
      copyFileSyncTracked(src, path.join(handoffDir, name));
    }
    if (input.injectFailure === 'after_copy') {
      leftovers.push(finalDir, handoffDir);
      invalidateRetainedProbe({
        operatorUserRoot,
        packageDir: finalDir,
        probeId: input.probeId,
        reasons: ['inject_failure_after_copy'],
      });
      return refuse(['inject_failure_after_copy'], input.mode, {
        leftovers,
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        probePackageDir: finalDir,
        handoffDir,
        usabilityChecks: usability,
        durabilityClaims,
      });
    }
    const handoffReasons = verifyProbePackageMembers(
      handoffDir,
      memberDigests,
      manifestSha256
    );
    if (handoffReasons.length > 0) {
      leftovers.push(finalDir, handoffDir);
      invalidateRetainedProbe({
        operatorUserRoot,
        packageDir: finalDir,
        probeId: input.probeId,
        reasons: handoffReasons,
      });
      return refuse(handoffReasons.map((r) => `handoff_${r}`), input.mode, {
        leftovers,
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        probePackageDir: finalDir,
        handoffDir,
        usabilityChecks: usability,
        durabilityClaims,
      });
    }
    const handoffMeta = {
      kind: 'g4-phase-a-setup-handoff',
      handoffId: input.handoffId,
      probeId: input.probeId,
      provenanceClass: 'probe',
      manifestSha256,
      memberDigests,
      sourcePackageDirLabel: finalDir,
      liveAccepted: false,
      approved: false,
      deployedPoolerProof: false,
      note: 'HANDOFF.json is untrusted as external anchor until digest separately retained by reviewer',
    };
    writeFileSyncTracked(
      path.join(handoffDir, 'HANDOFF.json'),
      `${stableStringify(handoffMeta)}\n`,
      'utf8'
    );
    usability.copyAwayManifestVerify = true;
  } catch (e) {
    leftovers.push(finalDir);
    if (fs.existsSync(handoffDir)) leftovers.push(handoffDir);
    invalidateRetainedProbe({
      operatorUserRoot,
      packageDir: finalDir,
      probeId: input.probeId,
      reasons: [`copy_away_failed:${redactError(e)}`],
    });
    return refuse([`copy_away_failed:${redactError(e)}`], input.mode, {
      leftovers,
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      probePackageDir: finalDir,
      handoffDir: fs.existsSync(handoffDir) ? handoffDir : null,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }

  // F4: completion clock — no substitution on failure
  if (input.injectFailure === 'after_completion_clock') {
    invalidateRetainedProbe({
      operatorUserRoot,
      packageDir: finalDir,
      probeId: input.probeId,
      reasons: ['inject_failure_after_completion_clock'],
    });
    leftovers.push(finalDir, handoffDir);
    return refuse(['inject_failure_after_completion_clock'], input.mode, {
      leftovers,
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      probePackageDir: finalDir,
      handoffDir,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }

  const endClock = readClock(input.now, 'completion');
  if (endClock.ok === false) {
    invalidateRetainedProbe({
      operatorUserRoot,
      packageDir: finalDir,
      probeId: input.probeId,
      reasons: [endClock.reason],
    });
    leftovers.push(finalDir, handoffDir);
    return refuse([endClock.reason], input.mode, {
      leftovers,
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      probePackageDir: finalDir,
      handoffDir,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }
  if (!(startMs <= endClock.ms)) {
    invalidateRetainedProbe({
      operatorUserRoot,
      packageDir: finalDir,
      probeId: input.probeId,
      reasons: ['completion_clock_reversed'],
    });
    leftovers.push(finalDir, handoffDir);
    return refuse(['completion_clock_reversed'], input.mode, {
      leftovers,
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      probePackageDir: finalDir,
      handoffDir,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }
  const endIso = endClock.iso;

  // F4: write completion evidence into retained probe before success can be claimed
  const completion = {
    kind: 'g4-phase-a-setup-publication-completion',
    preflightId: input.probeId,
    provenanceClass: 'probe',
    publicationComplete: true as const,
    terminalSuccess: true as const,
    setupCompleted: true as const,
    manifestSha256,
    setupStartedAt: startIso,
    setupCompletedAt: endIso,
    liveAccepted: false as const,
    approved: false as const,
    deployedPoolerProof: false as const,
  };
  const completionPath = path.join(
    finalDir,
    ML_CAL_1_G4_PHASE_A_COMPLETION_MEMBER
  );
  try {
    assertPhysicalContainment(operatorUserRoot, completionPath);
    writeFileSyncTracked(
      completionPath,
      `${stableStringify(completion)}\n`,
      'utf8'
    );
    usability.publicationCompletion = true;
  } catch (e) {
    invalidateRetainedProbe({
      operatorUserRoot,
      packageDir: finalDir,
      probeId: input.probeId,
      reasons: [`completion_write_failed:${redactError(e)}`],
    });
    leftovers.push(finalDir, handoffDir);
    return refuse([`completion_write_failed:${redactError(e)}`], input.mode, {
      leftovers,
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      probePackageDir: finalDir,
      handoffDir,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }

  // Narrow cleanup of owned probe + handoff after completion evidence.
  // F4: any failure from here must invalidate survivors — completion alone
  // must not remain independently interpretable as successful setup.
  const rmPkg =
    input.injectFailure === 'after_completion'
      ? { ok: false as const, reason: 'inject_failure_after_completion' }
      : safeRemoveContained(operatorUserRoot, finalDir);
  const rmHand =
    input.injectFailure === 'after_completion'
      ? { ok: false as const, reason: 'inject_failure_after_completion' }
      : safeRemoveContained(operatorUserRoot, handoffDir);
  if (!rmPkg.ok || !rmHand.ok) {
    const failReasons = [
      `owned_cleanup_failed:${rmPkg.reason ?? ''}:${rmHand.reason ?? ''}`,
    ];
    if (input.injectFailure === 'after_completion') {
      failReasons.unshift('inject_failure_after_completion');
    }
    const inv = invalidateSurvivorsAfterCompletion({
      operatorUserRoot,
      probeId: input.probeId,
      packageDirs: [finalDir, handoffDir],
      reasons: failReasons,
    });
    return refuse([...failReasons, ...inv.invalidateReasons], input.mode, {
      leftovers: inv.leftovers,
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      probePackageDir: existingLeftover(finalDir),
      handoffDir: existingLeftover(handoffDir),
      usabilityChecks: usability,
      durabilityClaims,
      notes: [
        'cleanup_failed_survivors_invalidated_or_reported',
        'completion_evidence_must_not_be_read_as_success_without_invalidation_check',
      ],
    });
  }
  usability.ownedCleanup = true;

  const receiptPath = phaseASetupReceiptPath(g4Base, input.probeId);
  const finalEvidencePath = phaseASetupReceiptFinalEvidencePath(
    g4Base,
    input.probeId
  );

  // F2: exclusive receipt — no overwrite; do not claim exclusiveReceipt before wx
  if (fs.existsSync(receiptPath)) {
    return refuse(['setup_receipt_exists'], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      usabilityChecks: usability,
      durabilityClaims,
      notes: ['exclusive_receipt_refused_existing'],
    });
  }
  if (fs.existsSync(finalEvidencePath)) {
    return refuse(['setup_final_evidence_exists'], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }

  // Sealed receipt is provisional (F4): excludes post-write verify flags (F2)
  // and never claims terminal setup success by itself.
  const sealedUsability = usabilitySnapshotForSealedReceipt(usability);
  const receipt = {
    kind: ML_CAL_1_G4_PHASE_A_SETUP_RECEIPT_KIND,
    provenanceClass: 'probe' as const,
    probeProvenance: true,
    provisional: true as const,
    awaitsFinalEvidence: true as const,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    credentialsPresent: false,
    setupCompleted: false as const,
    publicationComplete: false as const,
    terminalSuccess: false as const,
    profile: 'R-LOCAL-FS',
    mode: input.mode,
    operatorUserRoot,
    g4EvidenceBase: g4Base,
    runnerRetainRoot: g4Base,
    runnerRetainRootBindingNote:
      'Runner retainRoot parameter is the G4 evidence base (ml-cal-1/g4), not the operator user root.',
    probeId: input.probeId,
    handoffId: input.handoffId,
    probeManifestSha256: manifestSha256,
    memberDigests,
    usabilityChecks: sealedUsability,
    receiptPostWriteVerificationNote:
      'Post-write retained-byte verification and digest-bound final evidence are separate from this sealed provisional receipt; do not rewrite this file to claim terminal success.',
    finalEvidenceRequirement:
      'Terminal setup success requires separately supplied final evidence bound to this receipt file exact sha256/byteCount.',
    durabilityClaims,
    usabilityVsDurability: {
      usabilityMeans:
        'create/write/read/hash, exclusive claim, same-volume atomic rename, no-overwrite, member digest verify, handoff digest verify, exclusive provisional receipt publish, owned cleanup',
      durabilityNotClaimed:
        'backup, reboot persistence, multi-site replica, ACL rights beyond this process',
      postWriteVerifySeparate:
        'retained receipt byte/digest verify is result.receiptPostWriteVerification; terminal success requires final evidence bound to receipt digest',
    },
    externalAnchorProposal: {
      carrier:
        'Reviewer-retained offline note or password manager item outside the retain tree',
      valuesToRecordAfterFutureOperatorExecution: [
        'setupReceiptSha256',
        'setupReceipt byteCount',
        'finalEvidenceSha256',
        'probeManifestSha256 (from receipt)',
        'operatorUserRoot final path label',
        'g4EvidenceBase final path label',
      ],
      handoffJsonNote:
        'Discovered HANDOFF.json is untrusted until its digest is separately retained by the reviewer; colocated self-hash is not an external anchor.',
    },
    setupStartedAt: startIso,
    setupEndedAt: endIso,
    designSha256: ML_CAL_1_G4_PHASE_A_DESIGN_SHA256,
    base255Head: ML_CAL_1_G4_PHASE_A_BASE255_HEAD,
    destinationStatus:
      input.mode === 'temp'
        ? 'TEMP_DOUBLE_USABILITY_PASS_PROVISIONAL'
        : 'OPERATOR_USABILITY_RECORDED_PENDING_FINAL_EVIDENCE',
  };

  const receiptBytes = Buffer.from(`${stableStringify(receipt)}\n`, 'utf8');
  if (scanSecretish(receiptBytes.toString('utf8'))) {
    return refuse(['setup_receipt_secretish'], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      usabilityChecks: usability,
      durabilityClaims,
    });
  }
  const expectedReceiptSha = sha256Buffer(receiptBytes);
  const expectedReceiptBytes = receiptBytes.length;

  try {
    assertPhysicalContainment(operatorUserRoot, receiptPath);
    mkdirSyncTracked(path.dirname(receiptPath), { recursive: true });
    writeFileSyncTracked(receiptPath, receiptBytes, { flag: 'wx' });
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: unknown }).code)
        : '';
    const reason =
      code === 'EEXIST'
        ? 'setup_receipt_exists'
        : `setup_receipt_write_failed:${redactError(e)}`;
    return refuse([reason], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      usabilityChecks: usability,
      durabilityClaims,
      leftovers: existingLeftover(receiptPath)
        ? [path.resolve(receiptPath)]
        : [],
    });
  }
  // Exclusive create succeeded — result flag only; sealed receipt unchanged.
  usability.exclusiveReceipt = true;

  const emptyVerify = (
    partial: Partial<MlCal1G4PhaseAReceiptPostWriteVerification> = {}
  ): MlCal1G4PhaseAReceiptPostWriteVerification => ({
    performed: false,
    byteCountMatch: false,
    digestMatch: false,
    retainedSha256: null,
    retainedByteCount: null,
    expectedSha256: expectedReceiptSha,
    expectedByteCount: expectedReceiptBytes,
    ...partial,
  });

  const removeFailedReceipt = (): {
    reasons: string[];
    leftovers: string[];
  } => {
    if (input.injectFailure === 'receipt_verify_read_remove_fail') {
      const left = existingLeftover(receiptPath);
      return {
        reasons: [
          'setup_receipt_remove_failed:inject_failure_receipt_remove',
        ],
        leftovers: left ? [left] : [],
      };
    }
    const rm = safeRemoveContained(operatorUserRoot, receiptPath);
    if (!rm.ok) {
      const left = existingLeftover(receiptPath);
      return {
        reasons: [`setup_receipt_remove_failed:${rm.reason ?? 'unknown'}`],
        leftovers: left ? [left] : [],
      };
    }
    return { reasons: [], leftovers: [] };
  };

  const refuseVerifyFailure = (
    failReasons: string[],
    verification: MlCal1G4PhaseAReceiptPostWriteVerification
  ): MlCal1G4PhaseASetupResult => {
    const removed = removeFailedReceipt();
    const leftoverReceipt = existingLeftover(receiptPath);
    // F4: surviving provisional receipt is not terminal success even if
    // deletion cannot run — final evidence is absent by construction here.
    const readback = leftoverReceipt
      ? evaluatePhaseASetupReceiptForTerminalSuccess({
          receiptPath: leftoverReceipt,
          finalEvidencePath: null,
        })
      : null;
    return refuse([...failReasons, ...removed.reasons], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      setupReceiptPath: leftoverReceipt,
      setupReceiptSha256: expectedReceiptSha,
      setupReceiptByteCount: expectedReceiptBytes,
      receiptPostWriteVerification: verification,
      finalEvidencePath: null,
      finalEvidenceSha256: null,
      usabilityChecks: usability,
      durabilityClaims,
      leftovers: removed.leftovers,
      notes: [
        'sealed_receipt_provisional_not_terminal_success',
        'sealed_receipt_not_rewritten_for_verify_flag',
        'failed_receipt_removed_or_reported_as_leftover',
        'final_evidence_absent_after_verify_failure',
        ...(readback && !readback.ok
          ? ['retained_readback_rejects_terminal_success']
          : []),
      ],
    });
  };

  // F2: post-write verify — separate evidence; do not rewrite sealed receipt.
  if (input.injectFailure === 'receipt_verify_read') {
    try {
      unlinkSyncTracked(receiptPath);
    } catch {
      /* inject best-effort */
    }
  }
  if (input.injectFailure === 'receipt_verify_hash') {
    try {
      // Same length, different digest — isolates hash mismatch from bytecount.
      const cur = fs.readFileSync(receiptPath);
      if (cur.length > 0) {
        cur[0] = cur[0] ^ 0xff;
        writeFileSyncTracked(receiptPath, cur);
      }
    } catch {
      /* inject best-effort */
    }
  }

  let receiptPostWriteVerification: MlCal1G4PhaseAReceiptPostWriteVerification;
  try {
    if (input.injectFailure === 'receipt_verify_read_remove_fail') {
      throw new Error('inject_failure_receipt_verify_read');
    }
    const retained = fs.readFileSync(receiptPath);
    const retainedSha = sha256Buffer(retained);
    const byteCountMatch = retained.length === expectedReceiptBytes;
    const digestMatch = retainedSha === expectedReceiptSha;
    receiptPostWriteVerification = {
      performed: true,
      byteCountMatch,
      digestMatch,
      retainedSha256: retainedSha,
      retainedByteCount: retained.length,
      expectedSha256: expectedReceiptSha,
      expectedByteCount: expectedReceiptBytes,
    };
    if (!byteCountMatch || !digestMatch) {
      return refuseVerifyFailure(
        [
          !byteCountMatch
            ? 'setup_receipt_bytecount_mismatch'
            : 'setup_receipt_digest_mismatch',
        ],
        receiptPostWriteVerification
      );
    }
  } catch (e) {
    return refuseVerifyFailure(
      [`setup_receipt_verify_failed:${redactError(e)}`],
      emptyVerify({ performed: true })
    );
  }

  // Only after successful post-write verify — result flag, not a receipt rewrite.
  usability.receiptByteVerify = true;

  // F4: digest-bound final evidence — required for terminal success. Never rewrite
  // the sealed provisional receipt to flip success flags.
  const finalEvidence = {
    kind: ML_CAL_1_G4_PHASE_A_SETUP_RECEIPT_FINAL_EVIDENCE_KIND,
    provenanceClass: 'probe' as const,
    probeProvenance: true as const,
    probeId: input.probeId,
    handoffId: input.handoffId,
    provisionalReceiptSha256: expectedReceiptSha,
    provisionalReceiptByteCount: expectedReceiptBytes,
    verificationPassed: true as const,
    setupCompleted: true as const,
    publicationComplete: true as const,
    terminalSuccess: true as const,
    liveAccepted: false as const,
    approved: false as const,
    deployedPoolerProof: false as const,
    credentialsPresent: false as const,
    setupStartedAt: startIso,
    setupCompletedAt: endIso,
    bindingNote:
      'Binds terminal setup success to the exact sealed provisional receipt digest; receipt file alone is insufficient.',
  };
  const finalEvidenceBytes = Buffer.from(
    `${stableStringify(finalEvidence)}\n`,
    'utf8'
  );
  if (scanSecretish(finalEvidenceBytes.toString('utf8'))) {
    const removed = removeFailedReceipt();
    return refuse(['setup_final_evidence_secretish', ...removed.reasons], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      setupReceiptPath: existingLeftover(receiptPath),
      setupReceiptSha256: expectedReceiptSha,
      setupReceiptByteCount: expectedReceiptBytes,
      receiptPostWriteVerification,
      usabilityChecks: usability,
      durabilityClaims,
      leftovers: removed.leftovers,
    });
  }
  const finalEvidenceSha = sha256Buffer(finalEvidenceBytes);

  try {
    assertPhysicalContainment(operatorUserRoot, finalEvidencePath);
    writeFileSyncTracked(finalEvidencePath, finalEvidenceBytes, { flag: 'wx' });
  } catch (e: unknown) {
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code: unknown }).code)
        : '';
    const reason =
      code === 'EEXIST'
        ? 'setup_final_evidence_exists'
        : `setup_final_evidence_write_failed:${redactError(e)}`;
    const removed = removeFailedReceipt();
    const leftoverReceipt = existingLeftover(receiptPath);
    const readback = leftoverReceipt
      ? evaluatePhaseASetupReceiptForTerminalSuccess({
          receiptPath: leftoverReceipt,
          finalEvidencePath: existingLeftover(finalEvidencePath),
        })
      : null;
    return refuse([reason, ...removed.reasons], input.mode, {
      operatorUserRoot,
      g4EvidenceBase: g4Base,
      runnerRetainRoot: g4Base,
      setupReceiptPath: leftoverReceipt,
      setupReceiptSha256: expectedReceiptSha,
      setupReceiptByteCount: expectedReceiptBytes,
      receiptPostWriteVerification,
      finalEvidencePath: existingLeftover(finalEvidencePath),
      usabilityChecks: usability,
      durabilityClaims,
      leftovers: [
        ...removed.leftovers,
        ...(existingLeftover(finalEvidencePath)
          ? [path.resolve(finalEvidencePath)]
          : []),
      ],
      notes: [
        'provisional_receipt_without_final_evidence_is_not_terminal_success',
        ...(readback && !readback.ok
          ? ['retained_readback_rejects_terminal_success']
          : []),
      ],
    });
  }

  // Confirm retained readback accepts only with digest-bound final evidence.
  const terminalEval = evaluatePhaseASetupReceiptForTerminalSuccess({
    receiptPath,
    finalEvidencePath,
  });
  if (!terminalEval.ok || !terminalEval.terminalSuccess) {
    const removedReceipt = removeFailedReceipt();
    const rmFinal = safeRemoveContained(operatorUserRoot, finalEvidencePath);
    const leftovers: string[] = [...removedReceipt.leftovers];
    if (!rmFinal.ok) {
      const left = existingLeftover(finalEvidencePath);
      if (left) leftovers.push(left);
    }
    return refuse(
      [
        'terminal_success_evaluation_failed',
        ...terminalEval.reasons,
        ...removedReceipt.reasons,
        ...(!rmFinal.ok
          ? [`final_evidence_remove_failed:${rmFinal.reason ?? 'unknown'}`]
          : []),
      ],
      input.mode,
      {
        operatorUserRoot,
        g4EvidenceBase: g4Base,
        runnerRetainRoot: g4Base,
        setupReceiptPath: existingLeftover(receiptPath),
        setupReceiptSha256: expectedReceiptSha,
        setupReceiptByteCount: expectedReceiptBytes,
        receiptPostWriteVerification,
        finalEvidencePath: existingLeftover(finalEvidencePath),
        finalEvidenceSha256: finalEvidenceSha,
        usabilityChecks: usability,
        durabilityClaims,
        leftovers,
      }
    );
  }

  notes.push(
    `setup_receipt_bytes=${expectedReceiptBytes}`,
    `setup_receipt_sha256=${expectedReceiptSha}`,
    `final_evidence_sha256=${finalEvidenceSha}`,
    'receipt_provisional_final_evidence_digest_bound',
    'receipt_post_write_verification_separate_from_sealed_content',
    'external_anchor_must_be_retained_separately_by_reviewer'
  );

  return {
    ok: true,
    reasons: [],
    notes,
    provenanceClass: 'probe',
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    credentialsPresent: false,
    setupCompleted: true,
    mode: input.mode,
    operatorUserRoot,
    g4EvidenceBase: g4Base,
    runnerRetainRoot: g4Base,
    probePackageDir: null,
    handoffDir: null,
    setupReceiptPath: receiptPath,
    setupReceiptSha256: expectedReceiptSha,
    setupReceiptByteCount: expectedReceiptBytes,
    receiptPostWriteVerification,
    finalEvidencePath,
    finalEvidenceSha256: finalEvidenceSha,
    probeManifestSha256: manifestSha256,
    usabilityChecks: usability,
    durabilityClaims,
    leftovers: [],
  };
  } finally {
    activePhaseAMutationRecorder = prevMutationRecorder;
  }
}
