/**
 * ML-CAL-1 G4 nonfixture P-PREFLIGHT runner + sealer (offline-capable).
 *
 * Orchestrates metadata-only preflight through a module-owned mock adapter.
 * Import is passive: no env reads, PrismaClient construction, FS mutation, or connect.
 *
 * Offline tests MUST use provenanceClass "mock", createNonfixtureMockTxAdapter,
 * and disposable temp roots. A caller-supplied adapter is not executed.
 * Live orchestration remains gated; this module never self-approves deployed proof.
 *
 * Design pin (git/LF): 55d4a3d72877abcf154461a6504bb702791339b41721729116472187fab7c95f
 * Base #254 tip: cbb0d25d03294439baccf4da5e4e6e50e36fe035
 */

import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { stableStringify } from './ml-cal-1-lifecycle-binding';
import {
  ML_CAL_1_G4_PREFLIGHT_BASE_253_TIP,
  ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
  ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND,
  ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS,
  ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS,
  ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS,
} from './ml-cal-1-g4-pooler-preflight-real-adapter';
import {
  createMockPreflightTxAdapter,
  isSafeG4PreflightId,
  ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE,
  ML_CAL_1_G4_PREFLIGHT_SUBTREES,
  redactError,
  type MlCal1G4PreflightMockConfig,
  type MlCal1G4PreflightTxAdapter,
  type MlCal1G4PreflightTxMetadata,
} from './ml-cal-1-g4-pooler-preflight-fixture';

// ---------------------------------------------------------------------------
// Schemas / constants
// ---------------------------------------------------------------------------

export const ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK =
  'ml-cal-1-g4-pooler-preflight-package-mock-v1' as const;
export const ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE =
  'ml-cal-1-g4-pooler-preflight-package-live-v1' as const;
export const ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_PROBE =
  'ml-cal-1-g4-pooler-preflight-package-probe-v1' as const;

export const ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND =
  'ml-cal-1-g4-pooler-preflight-nonfixture-runner-v1' as const;

export const ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP =
  'cbb0d25d03294439baccf4da5e4e6e50e36fe035' as const;

export type MlCal1G4PreflightProvenanceClass = 'mock' | 'live' | 'probe';

export const ML_CAL_1_G4_PREFLIGHT_REQUIRED_MEMBERS = [
  'preflight-run-metadata.json',
  'preflight-tx-evidence.json',
  'design-correspondence.json',
  'PROVENANCE.json',
  'PACKAGE_MANIFEST.json',
  'PACKAGE_MANIFEST.sha256',
  'PUBLICATION_COMPLETION.json',
] as const;

export const ML_CAL_1_G4_PREFLIGHT_INVALIDATION_MEMBER =
  'PACKAGE_INVALIDATED.json' as const;

const SECRETISH =
  /(api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+|authorization\s*[:=]\s*\S+|bearer\s+[a-z0-9._\-+\/=]{8,}|ghp_[A-Za-z0-9]+|(DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL)\s*[:=]\s*\S+|postgres(ql)?:\/\/\S+)/i;

const DEFAULT_PG_PORT = 5432;

// ---------------------------------------------------------------------------
// Connection descriptor (nonsecret)
// ---------------------------------------------------------------------------

export interface MlCal1G4NonsecretConnectionDescriptor {
  host: string;
  port: number;
  database: string;
  configuredUsername: string;
}

export interface MlCal1G4ClientConstructionConfig {
  /** May contain secrets — never sealed; used only to derive nonsecret actual. */
  connectionUrl?: string;
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  username?: string;
}

function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function scanSecretish(text: string): boolean {
  return SECRETISH.test(text);
}

export function normalizeNonsecretConnectionDescriptor(
  raw: MlCal1G4NonsecretConnectionDescriptor
): MlCal1G4NonsecretConnectionDescriptor {
  const host = String(raw.host ?? '')
    .trim()
    .toLowerCase();
  let port = Number(raw.port);
  if (!Number.isFinite(port) || port <= 0) {
    port = DEFAULT_PG_PORT;
  }
  port = Math.trunc(port);
  return {
    host,
    port,
    database: String(raw.database ?? ''),
    configuredUsername: String(raw.configuredUsername ?? ''),
  };
}

export function connectionDescriptorsEqual(
  a: MlCal1G4NonsecretConnectionDescriptor,
  b: MlCal1G4NonsecretConnectionDescriptor
): boolean {
  const na = normalizeNonsecretConnectionDescriptor(a);
  const nb = normalizeNonsecretConnectionDescriptor(b);
  return (
    na.host === nb.host &&
    na.port === nb.port &&
    na.database === nb.database &&
    na.configuredUsername === nb.configuredUsername
  );
}

/**
 * Derive nonsecret descriptor from the exact client-construction config.
 * Never returns password/query secrets. Sanitizes parse errors.
 */
export function deriveNonsecretConnectionDescriptor(
  config: MlCal1G4ClientConstructionConfig
):
  | { ok: true; descriptor: MlCal1G4NonsecretConnectionDescriptor }
  | { ok: false; reason: string } {
  try {
    if (config.connectionUrl != null && typeof config.connectionUrl === 'string') {
      const raw = config.connectionUrl.trim();
      if (!raw) {
        return { ok: false, reason: 'connection_url_empty' };
      }
      let u: URL;
      try {
        u = new URL(raw);
      } catch {
        return { ok: false, reason: 'connection_url_parse_failed' };
      }
      const host = u.hostname;
      const port = u.port ? Number(u.port) : DEFAULT_PG_PORT;
      const database = decodeURIComponent(
        (u.pathname || '').replace(/^\//, '')
      );
      const configuredUsername = decodeURIComponent(u.username || '');
      if (!host || !database || !configuredUsername) {
        return { ok: false, reason: 'connection_descriptor_incomplete' };
      }
      if (!Number.isFinite(port) || port <= 0) {
        return { ok: false, reason: 'connection_port_invalid' };
      }
      return {
        ok: true,
        descriptor: normalizeNonsecretConnectionDescriptor({
          host,
          port,
          database,
          configuredUsername,
        }),
      };
    }
    const host = config.host;
    const database = config.database;
    const configuredUsername = config.user ?? config.username;
    const portRaw = config.port;
    const port =
      portRaw === undefined || portRaw === null || portRaw === ''
        ? DEFAULT_PG_PORT
        : Number(portRaw);
    if (
      typeof host !== 'string' ||
      typeof database !== 'string' ||
      typeof configuredUsername !== 'string' ||
      !host.trim() ||
      !database ||
      !configuredUsername
    ) {
      return { ok: false, reason: 'connection_descriptor_incomplete' };
    }
    if (!Number.isFinite(port) || port <= 0) {
      return { ok: false, reason: 'connection_port_invalid' };
    }
    return {
      ok: true,
      descriptor: normalizeNonsecretConnectionDescriptor({
        host,
        port,
        database,
        configuredUsername,
      }),
    };
  } catch (e) {
    return { ok: false, reason: `connection_derive_failed:${redactError(e)}` };
  }
}

// ---------------------------------------------------------------------------
// Retain root (mock / operator-layout double — under tmpdir for offline)
// ---------------------------------------------------------------------------

function isSymlinkOrJunction(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return true;
  }
}

/**
 * Lexical + physical containment. Rejects symlink/junction components and
 * realpath escapes before any mutation toward candidate.
 */
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

function assertWithinRoot(root: string, candidate: string): string {
  return assertPhysicalContainment(root, candidate);
}

/** Exact permitted final package path: <retainRoot>/preflight/<safeId>. */
export function permittedPreflightPackageDir(
  retainRoot: string,
  preflightId: string
): string {
  return path.resolve(path.join(retainRoot, 'preflight', preflightId));
}

/**
 * Remove only a path that remains physically contained under root and is not
 * the retain root itself. Containment failure → no mutation.
 */
function safeRemoveContained(root: string, target: string): {
  ok: boolean;
  reason?: string;
} {
  try {
    const rootResolved = path.resolve(root);
    const targetAbs = path.resolve(target);
    if (targetAbs === rootResolved) {
      return { ok: false, reason: 'remove_retain_root_forbidden' };
    }
    assertPhysicalContainment(root, targetAbs);
    if (!fs.existsSync(targetAbs)) {
      return { ok: true };
    }
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
    fs.rmSync(targetAbs, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `remove_containment:${redactError(e)}` };
  }
}

export function assertMockRetainRoot(retainRoot: string): {
  ok: boolean;
  reasons: string[];
  root: string;
} {
  if (typeof retainRoot !== 'string' || !retainRoot.trim()) {
    return { ok: false, reasons: ['retain_root_empty'], root: '' };
  }
  const resolved = path.resolve(retainRoot);
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
  if (isSymlinkOrJunction(resolved)) {
    return { ok: false, reasons: ['retain_root_symlink'], root: resolved };
  }
  try {
    const real = fs.existsSync(resolved)
      ? fs.realpathSync(resolved)
      : resolved;
    if (real !== tmpReal && !real.startsWith(tmpReal + path.sep)) {
      return {
        ok: false,
        reasons: ['retain_root_not_under_tmpdir'],
        root: resolved,
      };
    }
  } catch (e) {
    return {
      ok: false,
      reasons: [`retain_root_unreadable:${redactError(e)}`],
      root: resolved,
    };
  }
  return { ok: true, reasons: [], root: resolved };
}

export function ensureOperatorLayout(retainRoot: string): {
  ok: boolean;
  reasons: string[];
  root: string;
} {
  const gate = assertMockRetainRoot(retainRoot);
  if (!gate.ok) return gate;
  const root = gate.root;
  const reasons: string[] = [];
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      reasons: [`retain_root_unusable:${redactError(e)}`],
      root,
    };
  }
  for (const sub of ML_CAL_1_G4_PREFLIGHT_SUBTREES) {
    try {
      const p = path.join(root, sub);
      if (fs.existsSync(p) && isSymlinkOrJunction(p)) {
        reasons.push(`symlink_in_layout:${sub}`);
        continue;
      }
      assertPhysicalContainment(root, p);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
      if (isSymlinkOrJunction(p)) {
        reasons.push(`symlink_in_layout:${sub}`);
        continue;
      }
      const rootReal = fs.realpathSync(root);
      const subReal = fs.realpathSync(p);
      const relSub = path.relative(rootReal, subReal);
      if (relSub !== sub || relSub.startsWith('..') || path.isAbsolute(relSub)) {
        reasons.push(`layout_escape:${sub}`);
      }
    } catch (e) {
      reasons.push(`layout_${sub}:${redactError(e)}`);
    }
  }
  return { ok: reasons.length === 0, reasons, root };
}

function canonicalizeRetainRootLabel(label: string): string {
  return path.normalize(label.trim()).replace(/[\\/]+$/, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Sealer
// ---------------------------------------------------------------------------

export type MlCal1G4PreflightSealHooks = {
  onStagingReady?: (info: {
    stagingDir: string;
    finalDir: string;
    claimDir: string;
  }) => void | Promise<void>;
  injectFailure?: 'after_staging' | 'after_claim' | 'after_publish_hash';
};

function memberDigestsOf(
  members: Record<string, Buffer>
): Record<string, { sha256: string; byteCount: number }> {
  const out: Record<string, { sha256: string; byteCount: number }> = {};
  for (const [name, bytes] of Object.entries(members)) {
    out[name] = { sha256: sha256Buffer(bytes), byteCount: bytes.length };
  }
  return out;
}

function verifyMembersAgainstDigests(
  dir: string,
  digests: Record<string, { sha256: string; byteCount: number }>
): string[] {
  const reasons: string[] = [];
  for (const [name, meta] of Object.entries(digests)) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) {
      reasons.push(`member_missing:${name}`);
      continue;
    }
    if (fs.lstatSync(p).isSymbolicLink()) {
      reasons.push(`member_symlink:${name}`);
      continue;
    }
    const bytes = fs.readFileSync(p);
    if (bytes.length !== meta.byteCount) {
      reasons.push(`member_bytecount_mismatch:${name}`);
    }
    if (sha256Buffer(bytes) !== meta.sha256.toLowerCase()) {
      reasons.push(`member_digest_mismatch:${name}`);
    }
    if (scanSecretish(bytes.toString('utf8'))) {
      reasons.push(`member_secretish:${name}`);
    }
  }
  return reasons;
}

export function sealNonfixturePreflightPackage(input: {
  retainRoot: string;
  preflightId: string;
  members: Record<string, Buffer>;
  sealedAt: string;
  provenanceClass: MlCal1G4PreflightProvenanceClass;
  packageSchema: string;
  hooks?: MlCal1G4PreflightSealHooks;
}):
  | {
      ok: true;
      packageDir: string;
      manifestSha256: string;
      memberDigests: Record<string, { sha256: string; byteCount: number }>;
      reasons: [];
    }
  | { ok: false; reasons: string[] } {
  if (!isSafeG4PreflightId(input.preflightId)) {
    return { ok: false, reasons: ['unsafe_preflight_id'] };
  }
  const gate = assertMockRetainRoot(input.retainRoot);
  if (!gate.ok) return { ok: false, reasons: gate.reasons };
  const root = gate.root;
  const layout = ensureOperatorLayout(root);
  if (!layout.ok) return { ok: false, reasons: layout.reasons };

  for (const [name, bytes] of Object.entries(input.members)) {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return { ok: false, reasons: [`unsafe_member_name:${name}`] };
    }
    if (scanSecretish(bytes.toString('utf8'))) {
      return { ok: false, reasons: [`member_secretish:${name}`] };
    }
  }

  const digests = memberDigestsOf(input.members);
  const manifestCore = {
    schemaVersion: input.packageSchema,
    kind: 'g4-pooler-preflight-package',
    preflightId: input.preflightId,
    sealedAt: input.sealedAt,
    provenanceClass: input.provenanceClass,
    liveAccepted: false as const,
    approved: false as const,
    deployedPoolerProof: false as const,
    credentialsPresent: false as const,
    fixtureProvenance: false as const,
    mockProvenance: input.provenanceClass === 'mock',
    probeProvenance: input.provenanceClass === 'probe',
    terminalSuccess: true as const,
    retentionProfile: ML_CAL_1_G4_PREFLIGHT_RETENTION_PROFILE,
    memberDigests: digests,
    designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
    base254Tip: ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP,
    base253Tip: ML_CAL_1_G4_PREFLIGHT_BASE_253_TIP,
  };
  const manifestBytes = Buffer.from(
    `${stableStringify(manifestCore)}\n`,
    'utf8'
  );
  const manifestSha256 = sha256Buffer(manifestBytes);
  const allMembers: Record<string, Buffer> = {
    ...input.members,
    'PACKAGE_MANIFEST.json': manifestBytes,
    'PACKAGE_MANIFEST.sha256': Buffer.from(`${manifestSha256}\n`, 'utf8'),
  };
  const allDigests = memberDigestsOf(allMembers);

  const preflightRoot = path.join(root, 'preflight');
  const stagingRoot = path.join(root, 'staging');
  const finalDir = path.join(preflightRoot, input.preflightId);
  const claimDir = path.join(stagingRoot, `.claim-${input.preflightId}`);
  const stagingDir = path.join(
    stagingRoot,
    `.tmp-${input.preflightId}-${randomUUID()}`
  );

  try {
    assertWithinRoot(root, finalDir);
    assertWithinRoot(root, stagingDir);
    assertWithinRoot(root, claimDir);
  } catch {
    return { ok: false, reasons: ['path_escape'] };
  }
  if (fs.existsSync(finalDir)) {
    return { ok: false, reasons: ['preflight_package_exists'] };
  }

  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    for (const [name, bytes] of Object.entries(allMembers)) {
      const p = path.join(stagingDir, name);
      assertWithinRoot(root, p);
      fs.writeFileSync(p, bytes);
    }
    const staged = verifyMembersAgainstDigests(stagingDir, allDigests);
    if (staged.length > 0) {
      safeRemoveContained(root, stagingDir);
      return { ok: false, reasons: staged.map((r) => `staged_${r}`) };
    }
    if (input.hooks?.onStagingReady) {
      void input.hooks.onStagingReady({ stagingDir, finalDir, claimDir });
    }
    // Revalidate containment after test hooks before further mutations
    try {
      assertPhysicalContainment(root, stagingDir);
      assertPhysicalContainment(root, finalDir);
      assertPhysicalContainment(root, claimDir);
      if (isSymlinkOrJunction(path.join(root, 'preflight'))) {
        safeRemoveContained(root, stagingDir);
        return { ok: false, reasons: ['symlink_in_layout:preflight'] };
      }
    } catch (e) {
      safeRemoveContained(root, stagingDir);
      return {
        ok: false,
        reasons: [`post_hook_containment:${redactError(e)}`],
      };
    }
    if (input.hooks?.injectFailure === 'after_staging') {
      safeRemoveContained(root, stagingDir);
      return { ok: false, reasons: ['inject_failure_after_staging'] };
    }
    try {
      assertPhysicalContainment(root, claimDir);
      fs.mkdirSync(claimDir);
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: unknown }).code)
          : '';
      safeRemoveContained(root, stagingDir);
      if (code === 'EEXIST') {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      return {
        ok: false,
        reasons: [`publish_claim_failed:${redactError(e)}`],
      };
    }
    try {
      // Revalidate again after claim creation / before rename
      assertPhysicalContainment(root, stagingDir);
      assertPhysicalContainment(root, finalDir);
      if (input.hooks?.injectFailure === 'after_claim') {
        return { ok: false, reasons: ['inject_failure_after_claim'] };
      }
      if (fs.existsSync(finalDir)) {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      fs.renameSync(stagingDir, finalDir);
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: unknown }).code)
          : '';
      if (code === 'EEXIST' || code === 'ENOTEMPTY') {
        return { ok: false, reasons: ['preflight_package_exists'] };
      }
      return {
        ok: false,
        reasons: [`atomic_publish_failed:${redactError(e)}`],
      };
    } finally {
      safeRemoveContained(root, claimDir);
      safeRemoveContained(root, stagingDir);
    }
    if (!fs.existsSync(finalDir)) {
      return { ok: false, reasons: ['atomic_publish_missing_final'] };
    }
    try {
      assertPhysicalContainment(root, finalDir);
      if (path.resolve(finalDir) !== permittedPreflightPackageDir(root, input.preflightId)) {
        return { ok: false, reasons: ['final_dir_not_permitted'] };
      }
    } catch (e) {
      return {
        ok: false,
        reasons: [`final_containment:${redactError(e)}`],
      };
    }
    const published = verifyMembersAgainstDigests(finalDir, allDigests);
    if (published.length > 0) {
      const reasons = published.map((r) => `published_${r}`);
      invalidatePublishedPackage({
        retainRoot: root,
        packageDir: finalDir,
        preflightId: input.preflightId,
        reasons,
        provenanceClass: input.provenanceClass,
      });
      return { ok: false, reasons };
    }
    if (input.hooks?.injectFailure === 'after_publish_hash') {
      invalidatePublishedPackage({
        retainRoot: root,
        packageDir: finalDir,
        preflightId: input.preflightId,
        reasons: ['inject_failure_after_publish_hash'],
        provenanceClass: input.provenanceClass,
      });
      return { ok: false, reasons: ['inject_failure_after_publish_hash'] };
    }
    // F5: completion evidence only after post-publish verify succeeds
    const completion = {
      kind: 'g4-pooler-preflight-publication-completion',
      preflightId: input.preflightId,
      provenanceClass: input.provenanceClass,
      publicationComplete: true as const,
      terminalSuccess: true as const,
      manifestSha256,
      liveAccepted: false as const,
      approved: false as const,
      deployedPoolerProof: false as const,
    };
    const completionPath = path.join(finalDir, 'PUBLICATION_COMPLETION.json');
    try {
      assertPhysicalContainment(root, completionPath);
      if (isSymlinkOrJunction(finalDir)) {
        invalidatePublishedPackage({
          retainRoot: root,
          packageDir: finalDir,
          preflightId: input.preflightId,
          reasons: ['final_dir_symlink'],
          provenanceClass: input.provenanceClass,
        });
        return { ok: false, reasons: ['final_dir_symlink'] };
      }
      fs.writeFileSync(
        completionPath,
        `${stableStringify(completion)}\n`,
        'utf8'
      );
    } catch (e) {
      invalidatePublishedPackage({
        retainRoot: root,
        packageDir: finalDir,
        preflightId: input.preflightId,
        reasons: [`completion_write_failed:${redactError(e)}`],
        provenanceClass: input.provenanceClass,
      });
      return {
        ok: false,
        reasons: [`completion_write_failed:${redactError(e)}`],
      };
    }
    return {
      ok: true,
      packageDir: finalDir,
      manifestSha256,
      memberDigests: allDigests,
      reasons: [],
    };
  } catch (e) {
    safeRemoveContained(root, stagingDir);
    safeRemoveContained(root, claimDir);
    return { ok: false, reasons: [`seal_failed:${redactError(e)}`] };
  }
}

/**
 * Invalidate a published package so it cannot remain reader-accepted success.
 * Containment / path-permission failure returns immediately with zero writes
 * or removals. Never deletes the retain root or unrelated directories.
 */
export function invalidatePublishedPackage(input: {
  retainRoot: string;
  packageDir: string;
  preflightId: string;
  reasons: string[];
  provenanceClass: MlCal1G4PreflightProvenanceClass;
}): { ok: boolean; reasons: string[] } {
  if (!isSafeG4PreflightId(input.preflightId)) {
    return { ok: false, reasons: ['unsafe_preflight_id'] };
  }
  const gate = assertMockRetainRoot(input.retainRoot);
  if (!gate.ok) {
    return { ok: false, reasons: gate.reasons };
  }
  const root = gate.root;
  const permitted = permittedPreflightPackageDir(root, input.preflightId);
  const packageAbs = path.resolve(input.packageDir);
  if (packageAbs !== permitted) {
    return { ok: false, reasons: ['invalidate_package_path_not_permitted'] };
  }
  if (packageAbs === path.resolve(root)) {
    return { ok: false, reasons: ['invalidate_retain_root_forbidden'] };
  }

  // Fail closed BEFORE any write or removal
  try {
    const preflightDir = path.join(root, 'preflight');
    if (fs.existsSync(preflightDir) && isSymlinkOrJunction(preflightDir)) {
      return { ok: false, reasons: ['symlink_in_layout:preflight'] };
    }
    assertPhysicalContainment(root, packageAbs);
    if (fs.existsSync(packageAbs) && isSymlinkOrJunction(packageAbs)) {
      return { ok: false, reasons: ['invalidate_package_symlink'] };
    }
  } catch (e) {
    return {
      ok: false,
      reasons: [`invalidate_containment:${redactError(e)}`],
    };
  }

  if (!fs.existsSync(packageAbs)) {
    return { ok: true, reasons: [] };
  }

  const marker = path.join(
    packageAbs,
    ML_CAL_1_G4_PREFLIGHT_INVALIDATION_MEMBER
  );
  try {
    assertPhysicalContainment(root, marker);
  } catch (e) {
    return {
      ok: false,
      reasons: [`invalidate_marker_containment:${redactError(e)}`],
    };
  }

  try {
    const body = {
      kind: 'g4-pooler-preflight-package-invalidated',
      preflightId: input.preflightId,
      provenanceClass: input.provenanceClass,
      terminalSuccess: false as const,
      publicationComplete: false as const,
      liveAccepted: false as const,
      approved: false as const,
      deployedPoolerProof: false as const,
      reasons: input.reasons.map((r) =>
        scanSecretish(r) ? '[redacted_reason]' : r
      ),
    };
    fs.writeFileSync(marker, `${stableStringify(body)}\n`, 'utf8');
  } catch (e) {
    return {
      ok: false,
      reasons: [`invalidate_marker:${redactError(e)}`],
    };
  }

  const removed = safeRemoveContained(root, packageAbs);
  if (!removed.ok) {
    return {
      ok: false,
      reasons: [removed.reason ?? 'invalidate_rm_failed'],
    };
  }
  return { ok: true, reasons: [] };
}

export function writeFailureReceipt(input: {
  retainRoot: string;
  preflightId: string;
  reasons: string[];
  observedAt: string;
  provenanceClass: MlCal1G4PreflightProvenanceClass;
}): { ok: boolean; path: string | null; reasons: string[] } {
  if (!isSafeG4PreflightId(input.preflightId)) {
    return { ok: false, path: null, reasons: ['unsafe_preflight_id'] };
  }
  const gate = assertMockRetainRoot(input.retainRoot);
  if (!gate.ok) return { ok: false, path: null, reasons: gate.reasons };
  const layout = ensureOperatorLayout(gate.root);
  if (!layout.ok) {
    return { ok: false, path: null, reasons: layout.reasons };
  }
  const preflightDir = path.join(layout.root, 'preflight');
  if (isSymlinkOrJunction(preflightDir)) {
    return { ok: false, path: null, reasons: ['symlink_in_layout:preflight'] };
  }
  const p = path.join(preflightDir, `${input.preflightId}.failure.json`);
  try {
    assertPhysicalContainment(layout.root, p);
    if (fs.existsSync(p)) {
      return { ok: false, path: null, reasons: ['failure_receipt_exists'] };
    }
    const body = {
      kind: 'g4-pooler-preflight-failure-receipt',
      preflightId: input.preflightId,
      provenanceClass: input.provenanceClass,
      observedAt: input.observedAt,
      terminalSuccess: false,
      liveAccepted: false,
      approved: false,
      deployedPoolerProof: false,
      reasons: input.reasons.map((r) =>
        scanSecretish(r) ? '[redacted_reason]' : r
      ),
    };
    const text = `${stableStringify(body)}\n`;
    if (scanSecretish(text)) {
      return { ok: false, path: null, reasons: ['failure_receipt_secretish'] };
    }
    fs.writeFileSync(p, text, 'utf8');
    return { ok: true, path: p, reasons: [] };
  } catch (e) {
    return {
      ok: false,
      path: null,
      reasons: [`failure_receipt_write:${redactError(e)}`],
    };
  }
}

export function copyPreflightPackageAway(input: {
  packageDir: string;
  destinationRoot: string;
  preflightId: string;
}):
  | { ok: true; destinationDir: string; reasons: [] }
  | { ok: false; reasons: string[] } {
  if (!isSafeG4PreflightId(input.preflightId)) {
    return { ok: false, reasons: ['unsafe_preflight_id'] };
  }
  const destGate = assertMockRetainRoot(input.destinationRoot);
  if (!destGate.ok) return { ok: false, reasons: destGate.reasons };
  const destLayout = ensureOperatorLayout(destGate.root);
  if (!destLayout.ok) return { ok: false, reasons: destLayout.reasons };
  const dest = path.join(
    destLayout.root,
    'review-handoff',
    input.preflightId
  );
  try {
    assertPhysicalContainment(destLayout.root, dest);
    if (fs.existsSync(dest)) {
      return { ok: false, reasons: ['handoff_exists'] };
    }
    fs.mkdirSync(dest, { recursive: true });
    const names = fs.readdirSync(input.packageDir);
    for (const name of names) {
      if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        return { ok: false, reasons: [`unsafe_member_name:${name}`] };
      }
      const src = path.join(input.packageDir, name);
      if (fs.lstatSync(src).isDirectory()) continue;
      fs.copyFileSync(src, path.join(dest, name));
    }
    return { ok: true, destinationDir: dest, reasons: [] };
  } catch (e) {
    return { ok: false, reasons: [`copy_away_failed:${redactError(e)}`] };
  }
}

// ---------------------------------------------------------------------------
// Module-owned mock boundary
// ---------------------------------------------------------------------------

/**
 * Identity registry for mock adapters this module created.
 * The value is the trusted inner implementation. The runner calls that value,
 * never the method on the caller-visible object. Not exported.
 */
const nonfixtureMockRegistry = new WeakMap<object, MlCal1G4PreflightTxAdapter>();

/** Descriptive brand only. Authorization is WeakMap identity, not this symbol. */
const NONFIXTURE_MOCK_BRAND = Symbol('ml-cal-1-g4-nonfixture-mock-tx');

/**
 * Build the only transaction adapter the mock runner will execute.
 * Accepts the fixture mock configuration. It does not accept a Prisma parent,
 * a connected client, or a caller-supplied transaction implementation.
 */
export function createNonfixtureMockTxAdapter(
  config: MlCal1G4PreflightMockConfig = {}
): MlCal1G4PreflightTxAdapter {
  const inner = createMockPreflightTxAdapter(config);
  const visible: MlCal1G4PreflightTxAdapter = {
    async withRepeatableReadTransaction(): Promise<never> {
      throw new Error('caller_visible_mock_adapter_method_is_not_executable');
    },
  };
  Object.defineProperty(visible, NONFIXTURE_MOCK_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.freeze(visible);
  nonfixtureMockRegistry.set(visible, inner);
  return visible;
}

function registeredNonfixtureMock(
  adapter: unknown
): MlCal1G4PreflightTxAdapter | null {
  if (
    adapter === null ||
    (typeof adapter !== 'object' && typeof adapter !== 'function')
  ) {
    return null;
  }
  return nonfixtureMockRegistry.get(adapter) ?? null;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface MlCal1G4NonfixturePreflightRunInput {
  /**
   * Offline/test path: 'mock' (required for CI).
   * 'live' requires separate future authority + Phase A receipt — not exercised here.
   */
  provenanceClass: MlCal1G4PreflightProvenanceClass;
  /** Explicit opt-in. Only boolean true permits TX. */
  enabled: unknown;
  preflightId: string;
  retainRoot: string;
  /** Independently supplied expected connection descriptor (before client use). */
  expectedConnection: MlCal1G4NonsecretConnectionDescriptor;
  /**
   * Exact configuration used to construct / that would construct the client.
   * For injected mock adapters, still required so F3 binding is testable.
   */
  clientConstructionConfig: MlCal1G4ClientConstructionConfig;
  /**
   * Mock adapter returned by createNonfixtureMockTxAdapter.
   * Any other object, including a real Prisma adapter, is refused.
   * adapterKind in sealed JSON names the metadata contract, not a Prisma execution.
   */
  txAdapter: MlCal1G4PreflightTxAdapter;
  now: () => Date;
  runnerCommitSha: string;
  authorityId?: string;
  poolerProfileLabel?: string;
  expectedRetainRootLabel?: string;
  sealHooks?: MlCal1G4PreflightSealHooks;
}

export interface MlCal1G4NonfixturePreflightRunResult {
  ok: boolean;
  reasons: string[];
  notes: string[];
  preflightId: string;
  provenanceClass: MlCal1G4PreflightProvenanceClass;
  liveAccepted: false;
  approved: false;
  deployedPoolerProof: false;
  packageDir: string | null;
  failureReceiptPath: string | null;
  manifestSha256: string | null;
  preflightStartTime: string | null;
  preflightEndTime: string | null;
  dbTransactionTime: string | null;
  targetBound: boolean;
  transactionCompleted: boolean;
}

function parseIsoMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function readInjectedClock(now: unknown):
  | { ok: true; date: Date; iso: string }
  | { ok: false; reason: string } {
  if (typeof now !== 'function') {
    return { ok: false, reason: 'injected_clock_not_function' };
  }
  let value: unknown;
  try {
    value = (now as () => unknown)();
  } catch (e) {
    return { ok: false, reason: `injected_clock_threw:${redactError(e)}` };
  }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return { ok: false, reason: 'injected_clock_invalid' };
  }
  if (!Number.isFinite(value.getTime())) {
    return { ok: false, reason: 'injected_clock_non_finite' };
  }
  return { ok: true, date: value, iso: value.toISOString() };
}

function schemaForProvenance(
  p: MlCal1G4PreflightProvenanceClass
): string {
  if (p === 'live') return ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_LIVE;
  if (p === 'probe') return ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_PROBE;
  return ML_CAL_1_G4_PREFLIGHT_PACKAGE_SCHEMA_MOCK;
}

/**
 * Run nonfixture P-PREFLIGHT (typically mock in offline tests).
 * Passive import; no env/Prisma construction here.
 */
export async function runG4NonfixturePreflight(
  input: MlCal1G4NonfixturePreflightRunInput
): Promise<MlCal1G4NonfixturePreflightRunResult> {
  const base = {
    liveAccepted: false as const,
    approved: false as const,
    deployedPoolerProof: false as const,
    packageDir: null as string | null,
    failureReceiptPath: null as string | null,
    manifestSha256: null as string | null,
    preflightStartTime: null as string | null,
    preflightEndTime: null as string | null,
    dbTransactionTime: null as string | null,
    targetBound: false,
    transactionCompleted: false,
  };

  const refuseWithoutFs = (
    reasons: string[]
  ): MlCal1G4NonfixturePreflightRunResult => ({
    ok: false,
    reasons,
    notes: [],
    preflightId:
      typeof input.preflightId === 'string' ? input.preflightId : '',
    provenanceClass:
      input.provenanceClass === 'mock' ||
      input.provenanceClass === 'live' ||
      input.provenanceClass === 'probe'
        ? input.provenanceClass
        : 'mock',
    ...base,
  });

  // F2: disabled/malformed opt-in — zero clock or filesystem activity
  if (input.enabled !== true) {
    return refuseWithoutFs(['preflight_runner_disabled']);
  }

  const fail = async (
    reasons: string[],
    partial: Partial<MlCal1G4NonfixturePreflightRunResult> = {},
    opts: { writeReceipt?: boolean; readClock?: boolean } = {}
  ): Promise<MlCal1G4NonfixturePreflightRunResult> => {
    const writeReceipt = opts.writeReceipt !== false;
    const readClock = opts.readClock !== false;
    let observedAt = new Date(0).toISOString();
    if (readClock) {
      const endClock = readInjectedClock(input.now);
      observedAt = endClock.ok ? endClock.iso : observedAt;
    }
    let failureReceiptPath: string | null = null;
    if (
      writeReceipt &&
      isSafeG4PreflightId(input.preflightId) &&
      typeof input.retainRoot === 'string'
    ) {
      const fr = writeFailureReceipt({
        retainRoot: input.retainRoot,
        preflightId: input.preflightId,
        reasons,
        observedAt,
        provenanceClass: 'mock',
      });
      if (fr.ok) failureReceiptPath = fr.path;
    }
    return {
      ok: false,
      reasons,
      notes: [],
      preflightId:
        typeof input.preflightId === 'string' ? input.preflightId : '',
      provenanceClass:
        input.provenanceClass === 'mock' ||
        input.provenanceClass === 'live' ||
        input.provenanceClass === 'probe'
          ? input.provenanceClass
          : 'mock',
      ...base,
      failureReceiptPath,
      ...partial,
    };
  };

  if (!isSafeG4PreflightId(input.preflightId)) {
    return fail(['unsafe_preflight_id'], {}, { writeReceipt: false });
  }
  if (
    input.provenanceClass !== 'mock' &&
    input.provenanceClass !== 'live' &&
    input.provenanceClass !== 'probe'
  ) {
    return refuseWithoutFs(['provenance_class_invalid']);
  }
  if (input.provenanceClass === 'probe') {
    return refuseWithoutFs(['probe_provenance_not_for_tx_runner']);
  }
  // F1: exported runner never seals live-labeled packages from injected mocks
  if (input.provenanceClass === 'live') {
    return refuseWithoutFs(['live_execution_not_authorized_in_this_build']);
  }
  if (input.provenanceClass !== 'mock') {
    return refuseWithoutFs(['provenance_class_invalid']);
  }
  const trustedMock = registeredNonfixtureMock(input.txAdapter);
  if (!trustedMock) {
    return refuseWithoutFs(['mock_runner_rejects_unbranded_tx_adapter']);
  }
  if (
    typeof input.runnerCommitSha !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(input.runnerCommitSha)
  ) {
    return fail(['runner_commit_invalid']);
  }

  const expectedNorm = normalizeNonsecretConnectionDescriptor(
    input.expectedConnection
  );
  if (
    !expectedNorm.host ||
    !expectedNorm.database ||
    !expectedNorm.configuredUsername
  ) {
    return fail(['expected_connection_incomplete']);
  }
  const actualDerived = deriveNonsecretConnectionDescriptor(
    input.clientConstructionConfig
  );
  if (actualDerived.ok === false) {
    return fail([actualDerived.reason]);
  }
  if (!connectionDescriptorsEqual(expectedNorm, actualDerived.descriptor)) {
    return fail(['target_connection_mismatch']);
  }

  const layout = ensureOperatorLayout(input.retainRoot);
  if (!layout.ok) {
    return fail(layout.reasons);
  }
  if (input.expectedRetainRootLabel) {
    const expectedLabel = canonicalizeRetainRootLabel(
      input.expectedRetainRootLabel
    );
    const actualLabel = canonicalizeRetainRootLabel(layout.root);
    if (expectedLabel !== actualLabel) {
      return fail(['retain_root_label_mismatch']);
    }
  }

  const startClock = readInjectedClock(input.now);
  if (startClock.ok === false) {
    return fail([startClock.reason]);
  }
  const preflightStartTime = startClock.iso;

  let meta: MlCal1G4PreflightTxMetadata | null = null;
  let transactionCompleted = false;
  try {
    await trustedMock.withRepeatableReadTransaction(async (client) => {
      await client.setTransactionReadOnly();
      meta = await client.queryTransactionMetadata();
    });
    transactionCompleted = true;
  } catch (e) {
    const endClock = readInjectedClock(input.now);
    return fail([`transaction_failed:${redactError(e)}`], {
      preflightStartTime,
      preflightEndTime: endClock.ok ? endClock.iso : null,
      transactionCompleted: false,
      targetBound: true,
    });
  }

  const endClock = readInjectedClock(input.now);
  if (endClock.ok === false) {
    return fail([endClock.reason], {
      preflightStartTime,
      transactionCompleted,
      targetBound: true,
    });
  }
  const preflightEndTime = endClock.iso;

  if (!transactionCompleted || meta == null) {
    return fail(['transaction_incomplete'], {
      preflightStartTime,
      preflightEndTime,
      targetBound: true,
    });
  }

  const m = meta as MlCal1G4PreflightTxMetadata;
  if (typeof m.transactionIsolation !== 'string') {
    return fail(['transaction_isolation_type_invalid'], {
      preflightStartTime,
      preflightEndTime,
      transactionCompleted,
      targetBound: true,
    });
  }
  if (typeof m.transactionReadOnly !== 'string') {
    return fail(['transaction_read_only_type_invalid'], {
      preflightStartTime,
      preflightEndTime,
      transactionCompleted,
      targetBound: true,
    });
  }
  if (typeof m.transactionTimestamp !== 'string') {
    return fail(['transaction_timestamp_type_invalid'], {
      preflightStartTime,
      preflightEndTime,
      transactionCompleted,
      targetBound: true,
    });
  }
  if (m.transactionIsolation.toLowerCase() !== 'repeatable read') {
    return fail(['isolation_not_repeatable_read'], {
      preflightStartTime,
      preflightEndTime,
      transactionCompleted,
      targetBound: true,
    });
  }
  if (m.transactionReadOnly.toLowerCase() !== 'on') {
    return fail(['transaction_not_read_only'], {
      preflightStartTime,
      preflightEndTime,
      transactionCompleted,
      targetBound: true,
    });
  }

  const dbMs = parseIsoMs(m.transactionTimestamp);
  const startMs = parseIsoMs(preflightStartTime);
  const endMs = parseIsoMs(preflightEndTime);
  if (dbMs == null || startMs == null || endMs == null) {
    return fail(['timestamp_unparseable'], {
      preflightStartTime,
      preflightEndTime,
      transactionCompleted,
      targetBound: true,
    });
  }
  if (!Number.isFinite(dbMs) || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return fail(['timestamp_non_finite'], {
      preflightStartTime,
      preflightEndTime,
      transactionCompleted,
      targetBound: true,
    });
  }
  if (!(startMs <= dbMs && dbMs <= endMs)) {
    return fail(['db_transaction_time_out_of_bounds'], {
      preflightStartTime,
      preflightEndTime,
      dbTransactionTime: m.transactionTimestamp,
      transactionCompleted,
      targetBound: true,
    });
  }
  if (m.serverClockDiagnostics) {
    for (const [k, v] of Object.entries(m.serverClockDiagnostics)) {
      if (typeof v !== 'string' || parseIsoMs(v) == null) {
        return fail([`server_clock_diagnostic_invalid:${k}`], {
          preflightStartTime,
          preflightEndTime,
          dbTransactionTime: m.transactionTimestamp,
          transactionCompleted,
          targetBound: true,
        });
      }
    }
  }

  const provenanceClass = input.provenanceClass;
  const packageSchema = schemaForProvenance(provenanceClass);
  const txOptions = {
    isolationLevel: 'RepeatableRead',
    maxWait: ML_CAL_1_G4_PREFLIGHT_TX_MAX_WAIT_MS,
    timeout: ML_CAL_1_G4_PREFLIGHT_TX_TIMEOUT_MS,
  };

  const runMetadata = {
    kind: 'g4-pooler-preflight-run-metadata',
    preflightId: input.preflightId,
    provenanceClass,
    schemaVersion: packageSchema,
    authorityId: input.authorityId ?? null,
    runnerKind: ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND,
    runnerCommitSha: input.runnerCommitSha.toLowerCase(),
    adapterKind: ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND,
    designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
    base254Tip: ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP,
    poolerProfileLabel: input.poolerProfileLabel ?? null,
    preflightStartTime,
    preflightEndTime,
    dbTransactionTime: m.transactionTimestamp,
    transactionOptions: txOptions,
    transactionIsolation: m.transactionIsolation,
    transactionReadOnly: m.transactionReadOnly,
    serverClockDiagnostics: m.serverClockDiagnostics ?? null,
    businessDataWrites: 0,
    providerCalls: 0,
    transactionCompleted: true,
    databaseObservedRole: 'UNVERIFIED',
    expectedConnection: expectedNorm,
    actualConnection: actualDerived.descriptor,
    targetBound: true,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
    credentialsPresent: false,
    fixtureProvenance: false,
    mockProvenance: provenanceClass === 'mock',
    probeProvenance: false,
    terminalSuccess: true,
  };

  const txEvidence = {
    kind: 'g4-pooler-preflight-tx-evidence',
    preflightId: input.preflightId,
    provenanceClass,
    transactionIsolation: m.transactionIsolation,
    transactionReadOnly: m.transactionReadOnly,
    transactionTimestamp: m.transactionTimestamp,
    serverClockDiagnostics: m.serverClockDiagnostics ?? null,
    transactionOptions: txOptions,
    transactionCompleted: true,
    adapterKind: ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND,
    designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
    runnerCommitSha: input.runnerCommitSha.toLowerCase(),
    databaseObservedRole: 'UNVERIFIED',
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
  };

  const designCorrespondence = {
    kind: 'g4-pooler-preflight-design-correspondence',
    preflightId: input.preflightId,
    provenanceClass,
    designPath:
      'research/moneyline/ML_CAL_1_G4_NONFIXTURE_OBSERVER_POOLER_PREFLIGHT_PROCEDURE_DESIGN_20261013.md',
    designSha256: ML_CAL_1_G4_PREFLIGHT_DESIGN_SHA256_PIN,
    executionPlanPath:
      'research/moneyline/ML_CAL_1_G4_RETENTION_PREFLIGHT_EXECUTION_PLAN_20261013.md',
    adapterKind: ML_CAL_1_G4_PREFLIGHT_REAL_ADAPTER_KIND,
    runnerKind: ML_CAL_1_G4_PREFLIGHT_NONFIXTURE_RUNNER_KIND,
    runnerCommitSha: input.runnerCommitSha.toLowerCase(),
    base254Tip: ML_CAL_1_G4_PREFLIGHT_BASE_254_TIP,
    frozenTxOptionsNote: {
      isolationLevel: 'RepeatableRead',
      maxWait: ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS.maxWait,
      timeout: ML_CAL_1_G4_PREFLIGHT_TX_OPTIONS.timeout,
    },
  };

  const provenance = {
    kind: 'g4-pooler-preflight-provenance',
    preflightId: input.preflightId,
    provenanceClass,
    fixtureProvenance: false,
    mockProvenance: provenanceClass === 'mock',
    probeProvenance: false,
    liveAccepted: false,
    approved: false,
    deployedPoolerProof: false,
  };

  const members: Record<string, Buffer> = {
    'preflight-run-metadata.json': Buffer.from(
      `${stableStringify(runMetadata)}\n`,
      'utf8'
    ),
    'preflight-tx-evidence.json': Buffer.from(
      `${stableStringify(txEvidence)}\n`,
      'utf8'
    ),
    'design-correspondence.json': Buffer.from(
      `${stableStringify(designCorrespondence)}\n`,
      'utf8'
    ),
    'PROVENANCE.json': Buffer.from(`${stableStringify(provenance)}\n`, 'utf8'),
  };

  const sealed = sealNonfixturePreflightPackage({
    retainRoot: layout.root,
    preflightId: input.preflightId,
    members,
    sealedAt: preflightEndTime,
    provenanceClass,
    packageSchema,
    hooks: input.sealHooks,
  });
  if (!sealed.ok) {
    return fail(sealed.reasons, {
      preflightStartTime,
      preflightEndTime,
      dbTransactionTime: m.transactionTimestamp,
      transactionCompleted: true,
      targetBound: true,
    });
  }

  return {
    ok: true,
    reasons: [],
    notes: ['mock_nonfixture_preflight_sealed'],
    preflightId: input.preflightId,
    provenanceClass,
    ...base,
    packageDir: sealed.packageDir,
    manifestSha256: sealed.manifestSha256,
    preflightStartTime,
    preflightEndTime,
    dbTransactionTime: m.transactionTimestamp,
    targetBound: true,
    transactionCompleted: true,
  };
}
