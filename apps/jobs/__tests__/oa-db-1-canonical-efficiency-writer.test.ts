import * as fs from 'fs';
import * as path from 'path';
import {
  OA_DB_1_COMMIT_CONFIRMATION,
  OA_DB_1_FLOAT_READBACK_RELATIVE_TOLERANCE,
  OA_DB_1_INSERT_BATCH_SIZE,
  OA_DB_1_TRANSACTION_TIMEOUT_MS,
  oaDb1FloatReadbackEqual,
  parseOaDb1CommitArgs,
  validateOaDb1CommitPlan,
} from '../commit-oa-db-1-canonical-efficiency';
import type { OaDb1PreviewPlan } from '../src/research/oa-db-1-canonical-efficiency';

const ROOT = path.resolve(__dirname, '../../..');
const WRITER = fs.readFileSync(
  path.join(ROOT, 'apps/jobs/commit-oa-db-1-canonical-efficiency.ts'),
  'utf8'
);
const WORKFLOW = fs.readFileSync(
  path.join(ROOT, '.github/workflows/commit-oa-db-1-canonical-efficiency.yml'),
  'utf8'
);
const PREVIEW = fs.readFileSync(
  path.join(ROOT, 'apps/jobs/preview-oa-db-1-canonical-efficiency.ts'),
  'utf8'
);

function cleanPlan(): OaDb1PreviewPlan {
  return {
    version: 'oa_db_1_canonical_efficiency_persistence_v1',
    targetTable: 'team_game_efficiency_canonical_v1',
    targetTableExists: true,
    schemaDeploymentRequired: false,
    previewSafe: true,
    dataCommitEligible: false,
    writeBlockers: [],
    counts: {
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
    },
    perSeason: [],
    conflictKeys: [],
    unexpectedExistingKeys: [],
    plannedRows: [],
  };
}

describe('OA-DB-1 COMMIT argument guard', () => {
  const base = [
    '--source-zip',
    '/tmp/source.zip',
    '--reviewed-preview-zip',
    '/tmp/preview.zip',
    '--reviewed-preview-sha256',
    'a'.repeat(64),
    '--reviewed-preview-run-id',
    '12345',
    '--expected-repo-sha',
    'b'.repeat(40),
    '--confirm',
    OA_DB_1_COMMIT_CONFIRMATION,
    '--report',
    '/tmp/report.json',
  ];

  it('requires the exact frozen confirmation', () => {
    expect(OA_DB_1_COMMIT_CONFIRMATION).toBe(
      'WRITE_OA_DB_1_CANONICAL_EFFICIENCY_2022_2025'
    );
    expect(parseOaDb1CommitArgs(base).ok).toBe(true);

    const bad = [...base];
    bad[bad.indexOf('--confirm') + 1] = 'WRITE_SOMETHING_ELSE';
    expect(parseOaDb1CommitArgs(bad).ok).toBe(false);
  });

  it('requires exact repo SHA, reviewed run ID, and reviewed artifact SHA', () => {
    for (const [flag, value] of [
      ['--expected-repo-sha', 'not-a-sha'],
      ['--reviewed-preview-run-id', 'not-numeric'],
      ['--reviewed-preview-sha256', 'ABC'],
    ]) {
      const args = [...base];
      args[args.indexOf(flag) + 1] = value;
      expect(parseOaDb1CommitArgs(args).ok).toBe(false);
    }
  });
});

describe('OA-DB-1 float readback verification', () => {
  it('matches PostgreSQL extra_float_digits=0 readback within the frozen relative-error bound', () => {
    expect(OA_DB_1_FLOAT_READBACK_RELATIVE_TOLERANCE).toBe(5e-15);
    expect(
      oaDb1FloatReadbackEqual(-0.27626448555417216, -0.276264485554172)
    ).toBe(true);
    expect(
      oaDb1FloatReadbackEqual(0.29294212919058815, 0.292942129190588)
    ).toBe(true);
    expect(
      oaDb1FloatReadbackEqual(0.5217391304347826, 0.521739130434783)
    ).toBe(true);
    expect(
      oaDb1FloatReadbackEqual(0.10210902744783851, 0.102109027447839)
    ).toBe(true);
  });

  it('still rejects a materially different metric', () => {
    expect(oaDb1FloatReadbackEqual(0.29294212919058815, 0.2929421292)).toBe(
      false
    );
    expect(oaDb1FloatReadbackEqual(null, null)).toBe(true);
    expect(oaDb1FloatReadbackEqual(null, 0)).toBe(false);
  });
});

describe('OA-DB-1 COMMIT plan gate', () => {
  it('accepts the clean 5,996-row post-schema plan', () => {
    expect(validateOaDb1CommitPlan(cleanPlan())).toEqual([]);
  });

  it('fails closed on conflict, unexpected rows, or any 2026 row', () => {
    const plan = cleanPlan();
    plan.counts.create = 5993;
    plan.counts.conflict = 1;
    plan.counts.unexpectedExisting = 1;
    plan.counts.existing2026Rows = 1;

    const blockers = validateOaDb1CommitPlan(plan);
    expect(blockers).toContain('conflicts_not_zero');
    expect(blockers).toContain('unexpected_existing_not_zero');
    expect(blockers).toContain('existing_2026_rows_not_zero');
    expect(blockers).toContain('create_plus_identical_not_5996');
  });

  it('allows already-identical accepted rows but never updates them', () => {
    const plan = cleanPlan();
    plan.counts.create = 5000;
    plan.counts.identical = 996;
    expect(validateOaDb1CommitPlan(plan)).toEqual([]);
  });
});

describe('OA-DB-1 COMMIT static safety', () => {
  it('uses a bounded Serializable batched transaction', () => {
    expect(OA_DB_1_INSERT_BATCH_SIZE).toBe(200);
    expect(OA_DB_1_TRANSACTION_TIMEOUT_MS).toBe(180000);
    expect(WRITER).toContain(
      'isolationLevel: Prisma.TransactionIsolationLevel.Serializable'
    );
    expect(WRITER).toContain(
      'tx.canonicalTeamGameEfficiencyV1.createMany'
    );
    expect(WRITER).toContain('reviewedPreviewMatchesCurrentPlan');
    expect(WRITER).toContain('persistedRowsExactlyMatchPlan');
    expect(WRITER).toContain('oaDb1FloatReadbackEqual');
    expect(WRITER).toContain('floatReadbackRelativeTolerance');
    expect(WRITER).toContain('snapshot2026');
  });

  it('contains no update, delete, provider, or migrate operation', () => {
    expect(WRITER).not.toMatch(
      /canonicalTeamGameEfficiencyV1\.update\s*\(/
    );
    expect(WRITER).not.toMatch(
      /canonicalTeamGameEfficiencyV1\.updateMany\s*\(/
    );
    expect(WRITER).not.toMatch(
      /canonicalTeamGameEfficiencyV1\.delete\s*\(/
    );
    expect(WRITER).not.toMatch(
      /canonicalTeamGameEfficiencyV1\.deleteMany\s*\(/
    );
    expect(WRITER).not.toContain('prisma migrate');
    expect(WRITER).not.toContain('CFBD_API_KEY');
    expect(WRITER).not.toContain('ODDS_API_KEY');
  });

  it('binds the reviewed PREVIEW to repo SHA, workflow run ID, and target-table state', () => {
    expect(PREVIEW).toContain('repoCommitSha');
    expect(PREVIEW).toContain('workflowRunId');
    expect(PREVIEW).toContain('targetTableExists: plan.targetTableExists');
    expect(WORKFLOW).toContain('reviewed_preview_run_id:');
    expect(WORKFLOW).toContain('reviewed_preview_artifact_id:');
    expect(WORKFLOW).toContain('reviewed_preview_artifact_sha256:');
    expect(WORKFLOW).toContain('Verify reviewed PREVIEW artifact ZIP hash');
  });

  it('is manual-only and runs compiled Node, not tsx', () => {
    expect(WORKFLOW).toContain('workflow_dispatch:');
    expect(WORKFLOW).not.toMatch(/^\s*schedule:/m);
    expect(WORKFLOW).not.toMatch(/^\s*push:/m);
    expect(WORKFLOW).not.toMatch(/^\s*pull_request:/m);
    expect(WORKFLOW).toContain('Compile OA-DB-1 COMMIT writer');
    expect(WORKFLOW).toContain(
      'node .tmp/oa-db-1-commit/commit-oa-db-1-canonical-efficiency.js'
    );
    expect(WORKFLOW).not.toContain('npx tsx');
    expect(WORKFLOW).not.toContain('prisma migrate');
  });
});
