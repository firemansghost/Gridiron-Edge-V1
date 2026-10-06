import * as fs from 'fs';
import * as path from 'path';
import {
  OA_DB_1_ARCHIVE_ARTIFACT_ID,
  OA_DB_1_ARCHIVE_CONTRACT,
  OA_DB_1_ARCHIVE_RUN_ID,
  OA_DB_1_ARCHIVE_ZIP_SHA256,
  fingerprintOaDb1Row,
  planOaDb1Preview,
  type OaDb1ArchiveRow,
} from '../src/research/oa-db-1-canonical-efficiency';

const ROOT = path.resolve(__dirname, '../../..');
const CLI = fs.readFileSync(
  path.join(ROOT, 'apps/jobs/preview-oa-db-1-canonical-efficiency.ts'),
  'utf8'
);
const MIGRATION = fs.readFileSync(
  path.join(
    ROOT,
    'prisma/migrations/20261006194500_add_canonical_team_game_efficiency_v1/migration.sql'
  ),
  'utf8'
);

const SOURCE = {
  2022: {
    artifactId: 10988661299,
    zip:
      '7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99',
  },
  2023: {
    artifactId: 10990949531,
    zip:
      '479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4',
  },
  2024: {
    artifactId: 11008470975,
    zip:
      'b41e934b26952100e7e056a56114dc81df6bbe77f5c787f28b75b646ae7ea544',
  },
  2025: {
    artifactId: 10973848747,
    zip:
      'fda9a410faf3f648de1135a7ed841a497d947d844978513e0bfcd88aea9d0b22',
  },
} as const;

const UNAVAILABLE_2024 = new Set([
  401641034,
  401645328,
  401644689,
  401644780,
]);

function makeSeason(
  season: 2022 | 2023 | 2024 | 2025,
  games: number
): OaDb1ArchiveRow[] {
  const source = SOURCE[season];
  const ids: number[] = [];

  if (season === 2024) {
    ids.push(...[...UNAVAILABLE_2024]);
  }

  let candidate = season * 1_000_000;
  while (ids.length < games) {
    candidate += 1;
    if (!UNAVAILABLE_2024.has(candidate)) ids.push(candidate);
  }

  return ids.flatMap((providerGameId, index) => {
    const unavailable =
      season === 2024 && UNAVAILABLE_2024.has(providerGameId);
    const common = {
      contractVersion: OA_DB_1_ARCHIVE_CONTRACT,
      season,
      providerGameId,
      providerWeek: (index % 15) + 1,
      startDate: `${season}-09-01T12:00:00.000Z`,
      neutralSite: false,
      homeTeam: 'Alpha',
      awayTeam: 'Beta',
      sourceSeason: season,
      sourceArtifactId: source.artifactId,
      sourceArtifactZipSha256: source.zip,
      sourceEndpoint: '/stats/game/advanced',
      sourceRawMember: 'raw/003-advanced-game-stats.json',
    };

    return [
      {
        ...common,
        team: 'Alpha',
        opponent: 'Beta',
        isHome: true,
        status: unavailable ? 'SOURCE_UNAVAILABLE' : 'AVAILABLE',
        ppaOff: unavailable ? null : 0.2,
        ppaDef: unavailable ? null : -0.1,
        successOff: unavailable ? null : 0.45,
        successDef: unavailable ? null : 0.37,
        sourceMethod: unavailable
          ? 'SOURCE_UNAVAILABLE'
          : 'DIRECT_PROVIDER_ROW',
      } as OaDb1ArchiveRow,
      {
        ...common,
        team: 'Beta',
        opponent: 'Alpha',
        isHome: false,
        status: unavailable ? 'SOURCE_UNAVAILABLE' : 'AVAILABLE',
        ppaOff: unavailable ? null : -0.1,
        ppaDef: unavailable ? null : 0.2,
        successOff: unavailable ? null : 0.37,
        successDef: unavailable ? null : 0.45,
        sourceMethod: unavailable
          ? 'SOURCE_UNAVAILABLE'
          : 'DIRECT_PROVIDER_ROW',
      } as OaDb1ArchiveRow,
    ];
  });
}

function fullArchive(): OaDb1ArchiveRow[] {
  return [
    ...makeSeason(2022, 734),
    ...makeSeason(2023, 750),
    ...makeSeason(2024, 752),
    ...makeSeason(2025, 762),
  ];
}

const teamMapRows = [
  { teamNameCfbd: 'Alpha', teamIdInternal: 'alpha' },
  { teamNameCfbd: 'Beta', teamIdInternal: 'beta' },
];

describe('OA-DB-1 canonical efficiency PREVIEW', () => {
  it('plans the clean first PREVIEW when the table is absent', () => {
    const plan = planOaDb1Preview({
      archiveRows: fullArchive(),
      teamMapRows,
      existingTeamIds: ['alpha', 'beta'],
      targetTableExists: false,
      existingRows: [],
    });

    expect(plan.previewSafe).toBe(true);
    expect(plan.dataCommitEligible).toBe(false);
    expect(plan.schemaDeploymentRequired).toBe(true);
    expect(plan.writeBlockers).toEqual([]);
    expect(plan.counts).toMatchObject({
      archiveRows: 5996,
      plannedRows: 5996,
      create: 5996,
      identical: 0,
      update: 0,
      conflict: 0,
      sourceUnavailable: 8,
      unexpectedExisting: 0,
      duplicatePlannedNaturalKeys: 0,
      duplicateExistingNaturalKeys: 0,
      existing2026Rows: 0,
      planned2026Mutations: 0,
    });
    expect(plan.perSeason).toEqual([
      {
        season: 2022,
        plannedRows: 1468,
        create: 1468,
        identical: 0,
        conflict: 0,
        sourceUnavailable: 0,
      },
      {
        season: 2023,
        plannedRows: 1500,
        create: 1500,
        identical: 0,
        conflict: 0,
        sourceUnavailable: 0,
      },
      {
        season: 2024,
        plannedRows: 1504,
        create: 1504,
        identical: 0,
        conflict: 0,
        sourceUnavailable: 8,
      },
      {
        season: 2025,
        plannedRows: 1524,
        create: 1524,
        identical: 0,
        conflict: 0,
        sourceUnavailable: 0,
      },
    ]);
  });

  it('is idempotent when every existing fingerprint is identical', () => {
    const first = planOaDb1Preview({
      archiveRows: fullArchive(),
      teamMapRows,
      existingTeamIds: ['alpha', 'beta'],
      targetTableExists: true,
      existingRows: [],
    });

    const existingRows = first.plannedRows.map((row) => ({
      season: row.season,
      providerGameId: row.providerGameId,
      teamIdInternal: row.teamIdInternal,
      availabilityStatus: row.availabilityStatus,
      recordFingerprintSha256: row.recordFingerprintSha256,
    }));

    const second = planOaDb1Preview({
      archiveRows: fullArchive(),
      teamMapRows,
      existingTeamIds: ['alpha', 'beta'],
      targetTableExists: true,
      existingRows,
    });

    expect(second.previewSafe).toBe(true);
    expect(second.schemaDeploymentRequired).toBe(false);
    expect(second.counts.create).toBe(0);
    expect(second.counts.identical).toBe(5996);
    expect(second.counts.conflict).toBe(0);
  });

  it('blocks on a fingerprint conflict rather than planning an update', () => {
    const first = planOaDb1Preview({
      archiveRows: fullArchive(),
      teamMapRows,
      existingTeamIds: ['alpha', 'beta'],
      targetTableExists: true,
      existingRows: [],
    });
    const row = first.plannedRows[0];

    const plan = planOaDb1Preview({
      archiveRows: fullArchive(),
      teamMapRows,
      existingTeamIds: ['alpha', 'beta'],
      targetTableExists: true,
      existingRows: [
        {
          season: row.season,
          providerGameId: row.providerGameId,
          teamIdInternal: row.teamIdInternal,
          availabilityStatus: row.availabilityStatus,
          recordFingerprintSha256: 'f'.repeat(64),
        },
      ],
    });

    expect(plan.previewSafe).toBe(false);
    expect(plan.counts.conflict).toBe(1);
    expect(plan.counts.update).toBe(0);
    expect(plan.writeBlockers).toContain('conflicting existing rows: 1');
  });

  it('blocks on unexpected existing 2022-2025 rows but does not plan 2026 mutations', () => {
    const plan = planOaDb1Preview({
      archiveRows: fullArchive(),
      teamMapRows,
      existingTeamIds: ['alpha', 'beta'],
      targetTableExists: true,
      existingRows: [
        {
          season: 2024,
          providerGameId: 'unexpected',
          teamIdInternal: 'alpha',
          availabilityStatus: 'AVAILABLE',
          recordFingerprintSha256: 'a'.repeat(64),
        },
        {
          season: 2026,
          providerGameId: 'future',
          teamIdInternal: 'alpha',
          availabilityStatus: 'AVAILABLE',
          recordFingerprintSha256: 'b'.repeat(64),
        },
      ],
    });

    expect(plan.previewSafe).toBe(false);
    expect(plan.counts.unexpectedExisting).toBe(1);
    expect(plan.counts.existing2026Rows).toBe(1);
    expect(plan.counts.planned2026Mutations).toBe(0);
  });

  it('blocks when provider team mapping is incomplete', () => {
    const plan = planOaDb1Preview({
      archiveRows: fullArchive(),
      teamMapRows: [
        { teamNameCfbd: 'Alpha', teamIdInternal: 'alpha' },
      ],
      existingTeamIds: ['alpha'],
      targetTableExists: false,
      existingRows: [],
    });

    expect(plan.previewSafe).toBe(false);
    expect(
      plan.writeBlockers.some((blocker) =>
        blocker.includes('missing cfbd_team_map mapping: Beta')
      )
    ).toBe(true);
  });

  it('fingerprint is deterministic and bound to the accepted archive identity', () => {
    const plan = planOaDb1Preview({
      archiveRows: fullArchive(),
      teamMapRows,
      existingTeamIds: ['alpha', 'beta'],
      targetTableExists: false,
      existingRows: [],
    });
    const row = plan.plannedRows[0];
    const { recordFingerprintSha256: _discard, ...without } = row;

    expect(fingerprintOaDb1Row(without)).toBe(row.recordFingerprintSha256);
    expect(row.archiveRunId).toBe(OA_DB_1_ARCHIVE_RUN_ID);
    expect(row.archiveArtifactId).toBe(OA_DB_1_ARCHIVE_ARTIFACT_ID);
    expect(row.archiveArtifactZipSha256).toBe(OA_DB_1_ARCHIVE_ZIP_SHA256);
  });
});

describe('OA-DB-1 schema / CLI static safety', () => {
  it('migration is additive and does not alter legacy production tables', () => {
    expect(MIGRATION).toContain(
      'CREATE TABLE "team_game_efficiency_canonical_v1"'
    );
    expect(MIGRATION).toContain('SOURCE_UNAVAILABLE');
    expect(MIGRATION).not.toContain('ALTER TABLE "team_game_stats"');
    expect(MIGRATION).not.toContain('ALTER TABLE "games"');
    expect(MIGRATION).not.toContain('INSERT INTO');
    expect(MIGRATION).not.toContain('UPDATE ');
    expect(MIGRATION).not.toContain('DELETE FROM');
  });

  it('preview CLI contains no Prisma mutation or migrate path', () => {
    expect(CLI).toContain("mode: 'PREVIEW'");
    expect(CLI).toContain('databaseWrites: false');
    expect(CLI).toContain('planned2026Mutations: 0');
    expect(CLI).not.toMatch(/prisma\.[A-Za-z0-9_]+\.create\s*\(/);
    expect(CLI).not.toMatch(/prisma\.[A-Za-z0-9_]+\.createMany\s*\(/);
    expect(CLI).not.toMatch(/prisma\.[A-Za-z0-9_]+\.update\s*\(/);
    expect(CLI).not.toMatch(/prisma\.[A-Za-z0-9_]+\.upsert\s*\(/);
    expect(CLI).not.toMatch(/prisma\.[A-Za-z0-9_]+\.delete\s*\(/);
    expect(CLI).not.toContain('$executeRaw');
    expect(CLI).not.toContain('prisma migrate');
  });
});
