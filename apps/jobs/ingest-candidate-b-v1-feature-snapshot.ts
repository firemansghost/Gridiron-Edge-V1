/**
 * CLI — Guarded local Candidate B V1 feature-snapshot ingest.
 *
 * PREVIEW (default): private PIT + DB SELECT only; zero snapshot writes; providerCalls=0.
 * COMMIT: serializable insert of one parent + 138 children, or verified NO-OP.
 *
 * Does NOT call CFBD / Odds. Does NOT run Prisma migrate.
 * Does NOT write operational Team / Game / MarketLine / Bet rows.
 * COMMIT exists but is not currently authorized for production use.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Prisma, PrismaClient } from '@prisma/client';
import { TeamResolver } from './adapters/TeamResolver';
import {
  CANDIDATE_B_SEASON,
  CORE_RAW_RELATIVE,
  DEFAULT_CORE_SNAPSHOT_DIR,
  DEFAULT_OPENING_SNAPSHOT_DIR,
  DERIVATION_DEFINITION_ID,
  FEATURE_DEFINITION_ID,
  FEATURE_DEFINITION_VERSION,
  FROZEN_CORE_SHA256,
  FROZEN_PORTAL_SHA256,
  FROZEN_RETURNING_SHA256,
  PORTAL_RAW_RELATIVE,
  RETURNING_RAW_RELATIVE,
  aggregatePortalByTeam,
  assertAuthoritativeFbsPopulation,
  assertMuPortalParity,
  assertTalentPopulation,
  buildSourceManifest,
  buildSourceProvenanceManifest,
  calculateMuPortal,
  createCandidateBCfbdFbsResolver,
  deriveCandidateBSnapshot,
  executeCandidateBFeatureSnapshotIngest,
  expectedCandidateBFeatureSnapshotConfirmation,
  hashTalentProvenance,
  hashTalentValues,
  parseFrozenCorePayload,
  parseFrozenPortalPayload,
  parseFrozenReturningPayload,
  parseVerifiedFrozenJson,
  resolveNamedTeamsToFbs,
  resolvePortalCounterpart,
  sha256RawBytes,
  type CandidateBFeatureSnapshotStore,
  type CandidateBFeatureSnapshotTx,
  type CfbdTeamResolver,
  type DerivedSnapshot,
  type IngestMode,
  type PersistedSnapshot,
  type PersistedTeamRow,
  type TalentSourceRow,
} from './src/research/candidate-b/candidate-b-v1-feature-snapshot';
import { insertCandidateBFeatureSnapshotTeamsExact } from './src/research/candidate-b/candidate-b-v1-exact-float8-writer';
import { loadCandidateBFeatureSnapshotTeamsExact } from './src/research/candidate-b/candidate-b-v1-exact-float8-reader';
import {
  decodeCandidateBNormalizationManifest,
  encodeCandidateBNormalizationManifest,
} from './src/research/candidate-b/candidate-b-v1-normalization-manifest-transport';

export function parseCandidateBIngestArgs(argv: string[]): {
  season: number;
  mode: IngestMode;
  confirmation: string;
  reportPath?: string;
  coreSnapshotDir: string;
  openingSnapshotDir: string;
} {
  let season: number = CANDIDATE_B_SEASON;
  let mode: IngestMode = 'PREVIEW';
  let confirmation = '';
  let reportPath: string | undefined;
  let coreSnapshotDir = DEFAULT_CORE_SNAPSHOT_DIR;
  let openingSnapshotDir = DEFAULT_OPENING_SNAPSHOT_DIR;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--season') season = Number(argv[++i]);
    else if (a === '--mode') mode = String(argv[++i]).toUpperCase() as IngestMode;
    else if (a === '--confirm' || a === '--confirmation') confirmation = String(argv[++i] ?? '');
    else if (a === '--report') reportPath = String(argv[++i]);
    else if (a === '--core-snapshot-dir') coreSnapshotDir = String(argv[++i] ?? '');
    else if (a === '--opening-snapshot-dir') openingSnapshotDir = String(argv[++i] ?? '');
  }

  return { season, mode, confirmation, reportPath, coreSnapshotDir, openingSnapshotDir };
}

function readRepoCommitSha(): string {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    throw new Error('repoCommitSha must be obtained from git rev-parse HEAD');
  }
  return sha;
}

export function toRepoRelativePath(absPath: string, repoRoot = process.cwd()): string {
  const resolved = path.resolve(absPath);
  const root = path.resolve(repoRoot);
  const rel = path.relative(root, resolved).split(path.sep).join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const parts = rel.split('/');
    const idx = parts.lastIndexOf('.research-data');
    if (idx >= 0) return parts.slice(idx).join('/');
    return path.basename(resolved);
  }
  return rel;
}

export function readVerifiedFrozenJsonFile(input: {
  absPath: string;
  expectedSha256: string;
  label: string;
}): { bytes: Buffer; sha256: string; json: unknown } {
  const bytes = fs.readFileSync(input.absPath);
  return parseVerifiedFrozenJson(bytes, input.expectedSha256, input.label);
}

function readManifestTimestamp(snapshotDir: string, fallbackKeys: string[]): string | null {
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  for (const key of fallbackKeys) {
    const value = manifest[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  if (Array.isArray(manifest.endpoints)) {
    for (const endpoint of manifest.endpoints as Array<Record<string, unknown>>) {
      if (typeof endpoint.response_received_at === 'string') return endpoint.response_received_at;
    }
  }
  return null;
}

function openingEndpointTimestamp(snapshotDir: string, sourceId: string): string | null {
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    endpoints?: Array<Record<string, unknown>>;
  };
  const endpoint = (manifest.endpoints ?? []).find((e) => e.source_id === sourceId);
  return typeof endpoint?.response_received_at === 'string' ? endpoint.response_received_at : null;
}

export function createCfbdFbsResolver(
  resolver: Pick<TeamResolver, 'resolveTeamDetailed'>,
  authoritativeTeamIds: string[]
): CfbdTeamResolver {
  return createCandidateBCfbdFbsResolver(resolver, authoritativeTeamIds);
}

function mapPersistedSnapshot(
  row: {
    id: string;
    season: number;
    snapshotKind: string;
    modelFamily: string;
    modelDefinitionId: string;
    featureDefinitionId: string;
    featureDefinitionVersion: string;
    featureDefinitionHash: string;
    featureDefinitionManifest: unknown;
    derivationDefinitionId: string;
    derivationDefinitionHash: string;
    derivationDefinitionManifest: unknown;
    sourceManifest: unknown;
    sourceManifestHash: string;
    sourceProvenanceManifest: unknown;
    sourceProvenanceManifestHash: string;
    normalizationManifest: unknown;
    normalizationManifestHash: string;
    populationManifest: unknown;
    populationManifestHash: string;
    expectedTeamCount: number;
    rowCount: number;
    completeVectorCount: number;
    unavailableVectorCount: number;
    portalAvailableCount: number;
    snapshotHash: string;
  },
  teams: PersistedTeamRow[]
): PersistedSnapshot {
  return {
    ...row,
    teams,
  };
}

const STABLE_IDENTITY = {
  season: CANDIDATE_B_SEASON,
  featureDefinitionId: FEATURE_DEFINITION_ID,
  featureDefinitionVersion: FEATURE_DEFINITION_VERSION,
  derivationDefinitionId: DERIVATION_DEFINITION_ID,
} as const;

export function createPrismaCandidateBFeatureSnapshotStore(
  prisma: PrismaClient
): CandidateBFeatureSnapshotStore {
  const loadExisting = async (db: Prisma.TransactionClient | PrismaClient) => {
    const row = await db.shadowModelFeatureSnapshot.findUnique({
      where: {
        season_featureDefinitionId_featureDefinitionVersion_derivationDefinitionId: STABLE_IDENTITY,
      },
    });
    if (!row) return null;
    const teams = await loadCandidateBFeatureSnapshotTeamsExact(db, row.id);
    const normalizationManifest = decodeCandidateBNormalizationManifest(
      row.normalizationManifest,
      row.normalizationManifestHash
    );
    return mapPersistedSnapshot({ ...row, normalizationManifest }, teams);
  };

  return {
    async loadAuthoritativeFbsMembership(season) {
      return prisma.teamMembership.findMany({
        where: { season },
        select: { teamId: true, level: true },
      });
    },
    async loadTalent(season, teamIds) {
      return prisma.teamSeasonTalent.findMany({
        where: { season, teamId: { in: teamIds } },
        select: {
          teamId: true,
          season: true,
          talentComposite: true,
          createdAt: true,
          updatedAt: true,
          sourceUpdatedAt: true,
        },
      });
    },
    loadExistingByStableIdentity: () => loadExisting(prisma),
    async runSerializable(fn) {
      return prisma.$transaction(
        async (tx) => {
          const txStore: CandidateBFeatureSnapshotTx = {
            loadExistingByStableIdentity: () => loadExisting(tx),
            async insertSnapshot(snapshot, repoCommitSha, derivedAt) {
              const parent = await tx.shadowModelFeatureSnapshot.create({
                data: {
                  season: snapshot.season,
                  snapshotKind: snapshot.snapshotKind,
                  modelFamily: snapshot.modelFamily,
                  modelDefinitionId: snapshot.modelDefinitionId,
                  featureDefinitionId: snapshot.featureDefinitionId,
                  featureDefinitionVersion: snapshot.featureDefinitionVersion,
                  featureDefinitionManifest: snapshot.featureDefinitionManifest as Prisma.InputJsonValue,
                  featureDefinitionHash: snapshot.featureDefinitionHash,
                  derivationDefinitionId: snapshot.derivationDefinitionId,
                  derivationDefinitionManifest:
                    snapshot.derivationDefinitionManifest as Prisma.InputJsonValue,
                  derivationDefinitionHash: snapshot.derivationDefinitionHash,
                  sourceManifest: snapshot.sourceManifest as Prisma.InputJsonValue,
                  sourceManifestHash: snapshot.sourceManifestHash,
                  sourceProvenanceManifest: snapshot.sourceProvenanceManifest as Prisma.InputJsonValue,
                  sourceProvenanceManifestHash: snapshot.sourceProvenanceManifestHash,
                  normalizationManifest: encodeCandidateBNormalizationManifest(
                    snapshot.normalizationManifest,
                    snapshot.normalizationManifestHash
                  ) as unknown as Prisma.InputJsonValue,
                  normalizationManifestHash: snapshot.normalizationManifestHash,
                  populationManifest: snapshot.populationManifest as unknown as Prisma.InputJsonValue,
                  populationManifestHash: snapshot.populationManifestHash,
                  expectedTeamCount: snapshot.expectedTeamCount,
                  rowCount: snapshot.rowCount,
                  completeVectorCount: snapshot.completeVectorCount,
                  unavailableVectorCount: snapshot.unavailableVectorCount,
                  portalAvailableCount: snapshot.portalAvailableCount,
                  repoCommitSha,
                  derivedAt,
                  snapshotHash: snapshot.snapshotHash,
                },
              });
              await insertCandidateBFeatureSnapshotTeamsExact(tx, parent.id, snapshot.teams);
            },
          };
          return fn(txStore);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    },
  };
}

export function deriveSnapshotFromLocalSources(input: {
  teamIds: string[];
  talentRows: TalentSourceRow[];
  coreBytes: Buffer;
  coreJson: unknown;
  returningBytes: Buffer;
  returningJson: unknown;
  portalBytes: Buffer;
  portalJson: unknown;
  resolve: CfbdTeamResolver;
  coreRelativePath: string;
  returningRelativePath: string;
  portalRelativePath: string;
  coreRetrievedAt: string | null;
  returningRetrievedAt: string | null;
  portalRetrievedAt: string | null;
}): DerivedSnapshot {
  const coreSha = sha256RawBytes(input.coreBytes);
  const returningSha = sha256RawBytes(input.returningBytes);
  const portalSha = sha256RawBytes(input.portalBytes);
  if (coreSha !== FROZEN_CORE_SHA256) throw new Error(`core_sha_mismatch:${coreSha}`);
  if (returningSha !== FROZEN_RETURNING_SHA256) throw new Error(`returning_sha_mismatch:${returningSha}`);
  if (portalSha !== FROZEN_PORTAL_SHA256) throw new Error(`portal_sha_mismatch:${portalSha}`);

  const coreRows = parseFrozenCorePayload(input.coreJson);
  const returningRows = parseFrozenReturningPayload(input.returningJson);
  const portalRows = parseFrozenPortalPayload(input.portalJson);
  const muPortal = calculateMuPortal(portalRows);
  assertMuPortalParity(muPortal);

  const talent = assertTalentPopulation(input.talentRows, input.teamIds);
  const talentValueHash = hashTalentValues(talent);
  const talentProvenanceHash = hashTalentProvenance(talent);

  const coreMap = resolveNamedTeamsToFbs(
    coreRows.map((r) => r.teamName),
    input.resolve,
    input.teamIds,
    'core'
  );
  const returningMap = resolveNamedTeamsToFbs(
    returningRows.map((r) => r.teamName),
    input.resolve,
    input.teamIds,
    'returning'
  );

  const priorCoreByTeamId = new Map<string, number>();
  for (const row of coreRows) {
    priorCoreByTeamId.set(coreMap.get(row.teamName)!, row.overall);
  }
  const returningByTeamId = new Map<string, number>();
  for (const row of returningRows) {
    returningByTeamId.set(returningMap.get(row.teamName)!, row.percentPPA);
  }
  const talentByTeamId = new Map(talent.map((r) => [r.teamId, r.talentComposite]));

  const transfers = portalRows.map((row) => ({
    originTeamId: resolvePortalCounterpart(row.originName, input.resolve, input.teamIds),
    destinationTeamId: resolvePortalCounterpart(row.destinationName, input.resolve, input.teamIds),
    rating: row.rating,
  }));
  const portalByTeamId = aggregatePortalByTeam(input.teamIds, transfers, muPortal);

  return deriveCandidateBSnapshot({
    teamIds: input.teamIds,
    priorCoreByTeamId,
    talentByTeamId,
    returningByTeamId,
    portalByTeamId,
    muPortal,
    talentValueHash,
    talentProvenanceHash,
    sourceManifest: buildSourceManifest({
      coreSha256: coreSha,
      returningSha256: returningSha,
      portalSha256: portalSha,
      muPortal,
      talentValueHash,
    }),
    sourceProvenanceManifest: buildSourceProvenanceManifest({
      coreRetrievedAt: input.coreRetrievedAt,
      returningRetrievedAt: input.returningRetrievedAt,
      portalRetrievedAt: input.portalRetrievedAt,
      coreRelativePath: input.coreRelativePath,
      returningRelativePath: input.returningRelativePath,
      portalRelativePath: input.portalRelativePath,
      talentProvenanceHash,
    }),
  });
}

async function main(): Promise<void> {
  const args = parseCandidateBIngestArgs(process.argv.slice(2));
  if (args.season !== CANDIDATE_B_SEASON) {
    console.error(JSON.stringify({ ok: false, error: 'season_must_be_2026' }, null, 2));
    process.exit(1);
  }
  if (args.mode !== 'PREVIEW' && args.mode !== 'COMMIT') {
    console.error(JSON.stringify({ ok: false, error: 'mode_invalid' }, null, 2));
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const coreDir = path.resolve(repoRoot, args.coreSnapshotDir);
  const openingDir = path.resolve(repoRoot, args.openingSnapshotDir);
  const coreFile = path.join(coreDir, CORE_RAW_RELATIVE);
  const returningFile = path.join(openingDir, RETURNING_RAW_RELATIVE);
  const portalFile = path.join(openingDir, PORTAL_RAW_RELATIVE);
  const core = readVerifiedFrozenJsonFile({
    absPath: coreFile,
    expectedSha256: FROZEN_CORE_SHA256,
    label: 'core',
  });
  const returning = readVerifiedFrozenJsonFile({
    absPath: returningFile,
    expectedSha256: FROZEN_RETURNING_SHA256,
    label: 'returning',
  });
  const portal = readVerifiedFrozenJsonFile({
    absPath: portalFile,
    expectedSha256: FROZEN_PORTAL_SHA256,
    label: 'portal',
  });

  const repoCommitSha = readRepoCommitSha();
  const prisma = new PrismaClient();
  try {
    const store = createPrismaCandidateBFeatureSnapshotStore(prisma);
    const membership = await store.loadAuthoritativeFbsMembership(CANDIDATE_B_SEASON);
    const teamIds = assertAuthoritativeFbsPopulation(membership);
    const talentRows = await store.loadTalent(CANDIDATE_B_SEASON, teamIds);
    const resolver = new TeamResolver();
    const resolve = createCfbdFbsResolver(resolver, teamIds);
    const snapshot = deriveSnapshotFromLocalSources({
      teamIds,
      talentRows,
      coreBytes: core.bytes,
      coreJson: core.json,
      returningBytes: returning.bytes,
      returningJson: returning.json,
      portalBytes: portal.bytes,
      portalJson: portal.json,
      resolve,
      coreRelativePath: toRepoRelativePath(coreFile, repoRoot),
      returningRelativePath: toRepoRelativePath(returningFile, repoRoot),
      portalRelativePath: toRepoRelativePath(portalFile, repoRoot),
      coreRetrievedAt: readManifestTimestamp(coreDir, ['retrieved_at_utc', 'response_received_at']),
      returningRetrievedAt: openingEndpointTimestamp(openingDir, 'returning'),
      portalRetrievedAt: openingEndpointTimestamp(openingDir, 'portal'),
    });

    const { report } = await executeCandidateBFeatureSnapshotIngest({
      mode: args.mode,
      confirmation: args.confirmation,
      snapshot,
      store,
      repoCommitSha,
      derivedAt: new Date(),
      requireFrozenCounts: true,
    });

    const artifact = {
      ...report,
      researchOnly: true,
      migrationDeployedInThisPr: false,
      prismaMigrateInvoked: false,
      providerCalls: 0,
      commitGuardSatisfied: args.mode === 'COMMIT' && (report.commitSucceeded || report.alreadyPresent),
    };
    const reportPath =
      args.reportPath ??
      path.join(
        repoRoot,
        'reports',
        `candidate-b-v1-feature-snapshot-${args.mode.toLowerCase()}.json`
      );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(artifact, null, 2), 'utf8');

    console.log(
      JSON.stringify(
        {
          ok: report.blockers.length === 0,
          mode: report.mode,
          providerCalls: 0,
          snapshotHash: report.snapshotHash,
          expectedConfirmation: report.expectedConfirmation,
          existingState: report.existingState,
          blockers: report.blockers,
          writeSafe: report.writeSafe,
          commitSucceeded: report.commitSucceeded,
          persistenceCommitted: report.persistenceCommitted,
          rowCount: report.rowCount,
          completeVectorCount: report.completeVectorCount,
          unavailableVectorCount: report.unavailableVectorCount,
          portalAvailableCount: report.portalAvailableCount,
          unavailableTeamCount: report.unavailableTeams.length,
          reportPath,
        },
        null,
        2
      )
    );

    if (args.mode === 'PREVIEW') {
      process.exit(report.blockers.length === 0 ? 0 : 1);
    }
    if (!report.commitSucceeded && !report.alreadyPresent) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }, null, 2));
    process.exit(1);
  });
}

export { expectedCandidateBFeatureSnapshotConfirmation };
