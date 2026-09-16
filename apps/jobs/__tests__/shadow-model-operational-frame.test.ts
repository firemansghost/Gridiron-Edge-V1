/**
 * Model-aware OperationalShadowModelFrame loader tests.
 * No DATABASE_URL. No providers. No PREVIEW/COMMIT.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { CORE_V1_SHADOW_BASELINE_MODEL_ID } from '../../web/lib/shadow-models/core-v1-shadow-baseline-v1';
import {
  buildSourceManifest,
  buildSourceProvenanceManifest,
  deriveCandidateBSnapshot,
  emptyDirection,
  hashTalentProvenance,
  hashTalentValues,
} from '../src/research/candidate-b/candidate-b-v1-feature-snapshot';
import {
  assertCandidateBChildSelectSqlContract,
  type CandidateBExactChildRawRow,
} from '../src/research/candidate-b/candidate-b-v1-exact-float8-reader';
import { encodeCandidateBNormalizationManifest } from '../src/research/candidate-b/candidate-b-v1-normalization-manifest-transport';
import { CANDIDATE_B_GENERIC_SHADOW_MODEL_ID } from '../src/research/candidate-b/candidate-b-v1-shadow-adapter';
import {
  CANDIDATE_B_FEATURE_SNAPSHOT_ABSENT,
  CANDIDATE_B_FEATURE_SNAPSHOT_IDENTITY_MISMATCH,
  CANDIDATE_B_FEATURE_SNAPSHOT_INTEGRITY_FAILED,
  CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH,
} from '../src/research/candidate-b/candidate-b-v1-runtime-snapshot';
import { loadOperationalShadowModelFrame } from '../src/shadow-model-operational-frame';

const ROOT = path.resolve(__dirname, '../../..');
const LOADER = path.join(ROOT, 'apps/jobs/src/shadow-model-operational-frame.ts');
const CLI = path.join(ROOT, 'apps/jobs/capture-shadow-model-predictions-2026.ts');

function bits(value: number): string {
  const buf = Buffer.allocUnsafe(8);
  buf.writeDoubleBE(value, 0);
  return buf.toString('hex');
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function deriveSyntheticSnapshot(teamCount: number) {
  const ids = Array.from({ length: teamCount }, (_, i) => `t${String(i).padStart(3, '0')}`);
  const prior = new Map(ids.map((id, i) => [id, i + 1]));
  const talent = new Map(ids.map((id, i) => [id, 100 + i]));
  const returning = new Map(ids.map((id, i) => [id, 0.01 * (i + 1)]));
  const portalByTeamId = new Map(
    ids.map((id, i) => {
      if (i % 7 === 0) {
        return [
          id,
          { inbound: emptyDirection(), outbound: emptyDirection(), portalRaw: null },
        ] as const;
      }
      return [
        id,
        {
          inbound: {
            transferCount: 2,
            ratedCount: 2,
            ratedCoverage: 1,
            directionStatus: 'SUFFICIENT_RATED_COVERAGE' as const,
            meanRating: 0.8,
            centeredQuality: 0.1,
          },
          outbound: emptyDirection(),
          portalRaw: 0.001 * (i + 1),
        },
      ] as const;
    })
  );
  const talentRows = ids.map((teamId, i) => ({
    teamId,
    season: 2026,
    talentComposite: 100 + i,
  }));
  return deriveCandidateBSnapshot({
    teamIds: ids,
    priorCoreByTeamId: prior,
    talentByTeamId: talent,
    returningByTeamId: returning,
    portalByTeamId: new Map(portalByTeamId),
    muPortal: 0.5,
    sourceManifest: buildSourceManifest({
      coreSha256: 'c'.repeat(64),
      returningSha256: 'd'.repeat(64),
      portalSha256: 'e'.repeat(64),
      muPortal: 0.5,
      talentValueHash: hashTalentValues(talentRows),
    }),
    sourceProvenanceManifest: buildSourceProvenanceManifest({
      coreRetrievedAt: iso(1_000),
      returningRetrievedAt: iso(2_000),
      portalRetrievedAt: iso(3_000),
      coreRelativePath: '.research-data/core/raw.json',
      returningRelativePath: '.research-data/open/returning.json',
      portalRelativePath: '.research-data/open/portal.json',
      talentProvenanceHash: hashTalentProvenance(
        ids.map((teamId) => ({
          teamId,
          season: 2026,
          createdAt: iso(1_000),
          updatedAt: iso(2_000),
          sourceUpdatedAt: null,
        }))
      ),
    }),
    talentValueHash: hashTalentValues(talentRows),
    talentProvenanceHash: hashTalentProvenance(
      ids.map((teamId) => ({
        teamId,
        season: 2026,
        createdAt: iso(1_000),
        updatedAt: iso(2_000),
        sourceUpdatedAt: null,
      }))
    ),
  });
}

function rawFromTeam(team: ReturnType<typeof deriveSyntheticSnapshot>['teams'][number]): CandidateBExactChildRawRow {
  return {
    teamId: team.teamId,
    season: team.season,
    availabilityStatus: team.availabilityStatus,
    unavailableReasons: [...team.unavailableReasons],
    inboundTransferCount: team.inboundTransferCount,
    inboundRatedCount: team.inboundRatedCount,
    inboundDirectionStatus: team.inboundDirectionStatus,
    outboundTransferCount: team.outboundTransferCount,
    outboundRatedCount: team.outboundRatedCount,
    outboundDirectionStatus: team.outboundDirectionStatus,
    rowHash: team.rowHash,
    priorCoreRawHex: team.priorCoreRaw == null ? null : bits(team.priorCoreRaw),
    talentRawHex: team.talentRaw == null ? null : bits(team.talentRaw),
    returningRawHex: team.returningRaw == null ? null : bits(team.returningRaw),
    portalRawHex: team.portalRaw == null ? null : bits(team.portalRaw),
    zCoreHex: team.zCore == null ? null : bits(team.zCore),
    zTalentHex: team.zTalent == null ? null : bits(team.zTalent),
    zReturningHex: team.zReturning == null ? null : bits(team.zReturning),
    zPortalHex: team.zPortal == null ? null : bits(team.zPortal),
    candidateBRawCompositeHex:
      team.candidateBRawComposite == null ? null : bits(team.candidateBRawComposite),
    candidateBCompositeZHex:
      team.candidateBCompositeZ == null ? null : bits(team.candidateBCompositeZ),
    candidateBTeamRatingPointsHex:
      team.candidateBTeamRatingPoints == null ? null : bits(team.candidateBTeamRatingPoints),
    inboundRatedCoverageHex:
      team.inboundRatedCoverage == null ? null : bits(team.inboundRatedCoverage),
    inboundMeanRatingHex: team.inboundMeanRating == null ? null : bits(team.inboundMeanRating),
    outboundRatedCoverageHex:
      team.outboundRatedCoverage == null ? null : bits(team.outboundRatedCoverage),
    outboundMeanRatingHex: team.outboundMeanRating == null ? null : bits(team.outboundMeanRating),
  };
}

function parentFromSnapshot(snapshot: ReturnType<typeof deriveSyntheticSnapshot>, id: string) {
  return {
    id,
    season: snapshot.season,
    snapshotKind: snapshot.snapshotKind,
    modelFamily: snapshot.modelFamily,
    modelDefinitionId: snapshot.modelDefinitionId,
    featureDefinitionId: snapshot.featureDefinitionId,
    featureDefinitionVersion: snapshot.featureDefinitionVersion,
    featureDefinitionHash: snapshot.featureDefinitionHash,
    featureDefinitionManifest: snapshot.featureDefinitionManifest,
    derivationDefinitionId: snapshot.derivationDefinitionId,
    derivationDefinitionHash: snapshot.derivationDefinitionHash,
    derivationDefinitionManifest: snapshot.derivationDefinitionManifest,
    sourceManifest: snapshot.sourceManifest,
    sourceManifestHash: snapshot.sourceManifestHash,
    sourceProvenanceManifest: snapshot.sourceProvenanceManifest,
    sourceProvenanceManifestHash: snapshot.sourceProvenanceManifestHash,
    normalizationManifest: encodeCandidateBNormalizationManifest(
      snapshot.normalizationManifest,
      snapshot.normalizationManifestHash
    ),
    normalizationManifestHash: snapshot.normalizationManifestHash,
    populationManifest: snapshot.populationManifest,
    populationManifestHash: snapshot.populationManifestHash,
    expectedTeamCount: snapshot.expectedTeamCount,
    rowCount: snapshot.rowCount,
    completeVectorCount: snapshot.completeVectorCount,
    unavailableVectorCount: snapshot.unavailableVectorCount,
    portalAvailableCount: snapshot.portalAvailableCount,
    snapshotHash: snapshot.snapshotHash,
  };
}

function mockDb(options: {
  parent?: ReturnType<typeof parentFromSnapshot> | null;
  queryRaw?: jest.Mock;
}) {
  const games = [
    {
      id: 'g1',
      season: 2026,
      week: 3,
      homeTeamId: 'home',
      awayTeamId: 'away',
      date: new Date('2026-09-13T19:00:00.000Z'),
      neutralSite: false,
    },
  ];
  const marketLines = [
    {
      id: 'ml-home',
      gameId: 'g1',
      lineType: 'spread',
      lineValue: -3.5,
      teamId: 'home',
      bookName: 'book-a',
      source: 'oddsapi',
      timestamp: new Date('2026-09-13T15:50:00.000Z'),
    },
  ];
  const ratings = [
    {
      teamId: 'home',
      season: 2026,
      modelVersion: 'v1',
      powerRating: 10,
      rating: 10,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  ];

  const gameFindMany = jest.fn(async () => games);
  const marketFindMany = jest.fn(async () => marketLines);
  const ratingFindMany = jest.fn(async () => ratings);
  const snapshotFindUnique = jest.fn(async (args: { where?: Record<string, unknown> }) => {
    expect(args).not.toHaveProperty('include');
    return options.parent === undefined ? null : options.parent;
  });
  const queryRaw =
    options.queryRaw ??
    jest.fn(async () => {
      throw new Error('unexpected_query_raw');
    });

  return {
    db: {
      game: { findMany: gameFindMany },
      marketLine: { findMany: marketFindMany },
      teamSeasonRating: { findMany: ratingFindMany },
      shadowModelFeatureSnapshot: { findUnique: snapshotFindUnique },
      $queryRaw: queryRaw,
    },
    gameFindMany,
    marketFindMany,
    ratingFindMany,
    snapshotFindUnique,
    queryRaw,
  };
}

describe('model-aware operational frame loader', () => {
  it('Core loads V1 ratings and persisted spread markets without a Candidate B snapshot', async () => {
    const { db, gameFindMany, marketFindMany, ratingFindMany, snapshotFindUnique } = mockDb({});
    const frame = await loadOperationalShadowModelFrame(db as never, {
      season: 2026,
      week: 3,
      modelDefinitionId: CORE_V1_SHADOW_BASELINE_MODEL_ID,
    });
    expect(gameFindMany).toHaveBeenCalledTimes(1);
    expect(marketFindMany).toHaveBeenCalledTimes(1);
    expect(ratingFindMany).toHaveBeenCalledTimes(1);
    expect(snapshotFindUnique).not.toHaveBeenCalled();
    expect(frame.ratings).toHaveLength(1);
    expect(frame.frozenFeatureSnapshots).toBeUndefined();
    expect(frame.games).toHaveLength(1);
    expect(frame.marketLines).toHaveLength(1);
  });

  it('Candidate B loads games and spread markets, queries the exact pinned snapshotHash, and does not use TeamSeasonRating', async () => {
    const { db, gameFindMany, marketFindMany, ratingFindMany, snapshotFindUnique } = mockDb({
      parent: null,
    });
    await expect(
      loadOperationalShadowModelFrame(db as never, {
        season: 2026,
        week: 3,
        modelDefinitionId: CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
      })
    ).rejects.toThrow(CANDIDATE_B_FEATURE_SNAPSHOT_ABSENT);
    expect(gameFindMany).toHaveBeenCalledTimes(1);
    expect(marketFindMany).toHaveBeenCalledTimes(1);
    expect(ratingFindMany).not.toHaveBeenCalled();
    expect(snapshotFindUnique).toHaveBeenCalledTimes(1);
    const args = snapshotFindUnique.mock.calls[0][0] as { where: { snapshotHash: string } };
    expect(args.where).toEqual({ snapshotHash: CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH });
    expect(args).not.toHaveProperty('include');
  });

  it('Candidate B run-level integrity failure happens before a frame is returned', async () => {
    const snapshot = deriveSyntheticSnapshot(3);
    const parent = parentFromSnapshot(snapshot, 'parent-3');
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'parent-3');
      return snapshot.teams.map(rawFromTeam);
    });
    const { db, ratingFindMany } = mockDb({ parent, queryRaw });
    await expect(
      loadOperationalShadowModelFrame(db as never, {
        season: 2026,
        week: 3,
        modelDefinitionId: CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
      })
    ).rejects.toThrow(CANDIDATE_B_FEATURE_SNAPSHOT_INTEGRITY_FAILED);
    expect(ratingFindMany).not.toHaveBeenCalled();
  });

  it('Candidate B identity-mismatch fails closed on an integrity-valid synthetic 138-team snapshot', async () => {
    const snapshot = deriveSyntheticSnapshot(138);
    expect(snapshot.snapshotHash).not.toBe(CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH);
    const parent = parentFromSnapshot(snapshot, 'parent-138');
    const queryRaw = jest.fn(async (sql: Prisma.Sql) => {
      assertCandidateBChildSelectSqlContract(sql, 'parent-138');
      return snapshot.teams.map(rawFromTeam);
    });
    const { db, ratingFindMany } = mockDb({ parent, queryRaw });
    await expect(
      loadOperationalShadowModelFrame(db as never, {
        season: 2026,
        week: 3,
        modelDefinitionId: CANDIDATE_B_GENERIC_SHADOW_MODEL_ID,
      })
    ).rejects.toThrow(CANDIDATE_B_FEATURE_SNAPSHOT_IDENTITY_MISMATCH);
    expect(ratingFindMany).not.toHaveBeenCalled();
  });

  it('wires the exact snapshotHash reader, runtime validator, and mapping helper', () => {
    const src = fs.readFileSync(LOADER, 'utf8');
    const cli = fs.readFileSync(CLI, 'utf8');
    expect(src).toContain('loadCandidateBPersistedSnapshotBySnapshotHash');
    expect(src).toContain('CANDIDATE_B_FROZEN_FEATURE_SNAPSHOT_HASH');
    expect(src).toContain('assertCandidateBRuntimeSnapshot');
    expect(src).toContain('mapCandidateBSnapshotToFrozenFeatureSnapshot');
    expect(src).toContain('teamSeasonRating.findMany');
    expect(src).not.toContain('classifyExistingSnapshot');
    expect(cli).toContain('loadOperationalShadowModelFrame');
    expect(cli.indexOf('bindTx')).toBeGreaterThan(-1);
  });
});
