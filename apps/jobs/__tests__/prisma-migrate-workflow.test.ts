/**
 * Phase 2C-2G-1 / 2C-2G-2B — Static + status-classification checks for
 * production Prisma migrate workflow. No network. No DB. No migrate deploy.
 */

import * as fs from 'fs';
import * as path from 'path';
import { classifyPrismaMigrateStatus } from '../src/preseason/prisma-migrate-status';

const WORKFLOW = path.join(
  __dirname,
  '../../../.github/workflows/prisma-migrate.yml'
);

/** Extract a named job step (from `- name:` through the next sibling step). */
function extractStep(yaml: string, stepName: string): string {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^\\s+- name:\\s*${stepName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(
      line
    )
  );
  if (start < 0) return '';
  const nameIndent = (lines[start].match(/^(\s*)/)?.[1] ?? '').length;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const indent = (line.match(/^(\s*)/)?.[1] ?? '').length;
    if (/^\s+- name:/.test(line) && indent <= nameIndent) break;
    body.push(line);
  }
  return body.join('\n');
}

function jobPreambleBeforeSteps(yaml: string): string {
  const afterJobs = yaml.split(/^jobs:\s*$/m)[1] ?? '';
  return afterJobs.split(/^\s+steps:\s*$/m)[0] ?? '';
}

/** Extract YAML `run: |` block bodies (shell scripts), not `env:` mappings. */
function extractRunBlocks(yaml: string): string[] {
  const blocks: string[] = [];
  const lines = yaml.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s+run:\s*\|?\s*$/.test(lines[i]) && !/^\s+run:\s*\|/.test(lines[i])) {
      continue;
    }
    if (!lines[i].includes('|')) continue;
    const indentMatch = lines[i].match(/^(\s*)/);
    const baseIndent = indentMatch ? indentMatch[1].length : 0;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') {
        body.push(line);
        continue;
      }
      const m = line.match(/^(\s*)/);
      const ind = m ? m[1].length : 0;
      if (ind <= baseIndent) break;
      body.push(line);
    }
    blocks.push(body.join('\n'));
  }
  return blocks;
}

describe('classifyPrismaMigrateStatus', () => {
  it('Case A: one normal pending migration => safeForDeploy', () => {
    const output = `
The migration have not yet been applied:
20260808010000_add_team_membership_conference
`;
    const r = classifyPrismaMigrateStatus(output);
    expect(r.pendingMigrations).toBe(true);
    expect(r.historyDivergence).toBe(false);
    expect(r.failedMigration).toBe(false);
    expect(r.safeForDeploy).toBe(true);
  });

  it('Case B: up to date => safeForDeploy', () => {
    const r = classifyPrismaMigrateStatus('Database schema is up to date!');
    expect(r.upToDate).toBe(true);
    expect(r.historyDivergence).toBe(false);
    expect(r.safeForDeploy).toBe(true);
  });

  it('Case C: P3009/failed migration => unsafe', () => {
    const output = `
Error: P3009
The following migration(s) have failed:
20251027_t6q_team_backfill
`;
    const r = classifyPrismaMigrateStatus(output);
    expect(r.failedMigration).toBe(true);
    expect(r.safeForDeploy).toBe(false);
  });

  it('Case D: database migrations missing locally => unsafe', () => {
    const output = `
Your local migration history and the migrations table from your database are different:
The last common migration is:
20251112062918_add_cfbd_feature_tables
The migrations from the database are not found locally in prisma/migrations:
20251009001406_init
20250101_add_game_snapshots
`;
    const r = classifyPrismaMigrateStatus(output);
    expect(r.historyDivergence).toBe(true);
    expect(r.pendingMigrations).toBe(false);
    expect(r.safeForDeploy).toBe(false);
  });

  it('Case E: pending + divergence (real production mixed) => unsafe', () => {
    // Critical regression: production preflight for 2C-2G-2 contained BOTH
    // a legitimate pending migration and history divergence; old workflow
    // accepted it because pending matched first.
    const output = `
Your local migration history and the migrations table from your database are different:
The last common migration is:
20251112062918_add_cfbd_feature_tables
The migrations from the database are not found locally in prisma/migrations:
20251009001406_init
20250101_add_game_snapshots

The migration have not yet been applied:
20260808010000_add_team_membership_conference
`;
    const r = classifyPrismaMigrateStatus(output);
    expect(r.pendingMigrations).toBe(true);
    expect(r.historyDivergence).toBe(true);
    expect(r.safeForDeploy).toBe(false);
  });
});

describe('prisma-migrate workflow hardening', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  const runBlocks = extractRunBlocks(text);
  const runBodies = runBlocks.join('\n---\n');
  const preflightBlock =
    runBlocks.find((b) =>
      b.includes(
        'Preflight: exactly one expected pending migration; proceeding to migrate deploy.'
      )
    ) ?? '';
  const postDeployBlock =
    runBlocks.find((b) => b.includes('Post-deploy migration status healthy')) ??
    '';

  it('is workflow_dispatch only (no push auto-migrate)', () => {
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).not.toMatch(/^\s*pull_request:/m);
  });

  it('requires explicit MIGRATE_PRODUCTION confirmation', () => {
    expect(text).toMatch(/confirm:/);
    expect(text).toMatch(/MIGRATE_PRODUCTION/);
    expect(text).toMatch(
      /MIGRATION_CONFIRM" != "MIGRATE_PRODUCTION"|confirm must equal MIGRATE_PRODUCTION/
    );
  });

  it('requires expected_main_sha and expected_migration inputs', () => {
    expect(text).toMatch(/expected_main_sha:/);
    expect(text).toMatch(/expected_migration:/);
    expect(text).toMatch(
      /Exact main commit SHA authorized for this deployment/
    );
    expect(text).toMatch(
      /Exact single pending migration expected to be deployed/
    );
    expect(text).toMatch(/required:\s*true/);
  });

  it('passes workflow inputs through env mappings, not shell interpolation', () => {
    expect(text).toMatch(/MIGRATION_CONFIRM:\s*\$\{\{\s*inputs\.confirm\s*\}\}/);
    expect(text).toMatch(
      /MIGRATION_REASON:\s*\$\{\{\s*inputs\.migration_reason\s*\}\}/
    );
    expect(text).toMatch(
      /EXPECTED_MAIN_SHA:\s*\$\{\{\s*inputs\.expected_main_sha\s*\}\}/
    );
    expect(text).toMatch(
      /EXPECTED_MIGRATION:\s*\$\{\{\s*inputs\.expected_migration\s*\}\}/
    );
    expect(runBodies).not.toMatch(/\$\{\{\s*inputs\.confirm\s*\}\}/);
    expect(runBodies).not.toMatch(/\$\{\{\s*inputs\.migration_reason\s*\}\}/);
    expect(runBodies).not.toMatch(/\$\{\{\s*inputs\.expected_main_sha\s*\}\}/);
    expect(runBodies).not.toMatch(/\$\{\{\s*inputs\.expected_migration\s*\}\}/);
    expect(runBodies).toMatch(/\$MIGRATION_CONFIRM/);
    expect(runBodies).toMatch(/\$MIGRATION_REASON/);
    expect(runBodies).toMatch(/\$EXPECTED_MAIN_SHA/);
    expect(runBodies).toMatch(/\$EXPECTED_MIGRATION/);
  });

  it('uses checkout@v6, setup-node@v6, Node 20, contents read', () => {
    expect(text).toMatch(/checkout@v6/);
    expect(text).toMatch(/setup-node@v6/);
    expect(text).toMatch(/node-version:\s*['"]?20['"]?/);
    expect(text).toMatch(/permissions:\s*\n\s*contents:\s*read/m);
  });

  it('does not mutate _prisma_migrations or hard-code migrate resolve', () => {
    expect(text).not.toMatch(/DELETE\s+FROM\s+_prisma_migrations/i);
    expect(text).not.toMatch(/INSERT\s+INTO\s+_prisma_migrations/i);
    expect(text).not.toMatch(/UPDATE\s+_prisma_migrations/i);
    expect(text).not.toMatch(/prisma migrate resolve/);
    expect(text).not.toMatch(/migrate resolve --/);
    expect(text).not.toMatch(/prisma migrate dev/);
    expect(text).not.toMatch(/prisma db push/);
    expect(text).toMatch(/_prisma_migrations repair: not invoked/);
    expect(text).toMatch(/NOT part of the normal deploy path/);
  });

  it('keeps migrate deploy and fail-closed status verification', () => {
    expect(text).toMatch(/prisma migrate deploy/);
    expect(text).toMatch(/Prisma migrate status \(fail closed/);
    expect(text).toMatch(/Post-deploy migrate status/);
    expect(text).toMatch(/P3009/);
    expect(text).toMatch(/Database schema is up to date/);
  });

  it('detects history divergence before accepting a matching pending migration', () => {
    expect(preflightBlock).toBeTruthy();
    const failedIdx = preflightBlock.search(/P3009/);
    const divergenceIdx = preflightBlock.search(
      /migrations from the database are not found locally|local migration history and the migrations table/
    );
    const acceptIdx = preflightBlock.search(
      /Preflight: exactly one expected pending migration; proceeding to migrate deploy/
    );
    expect(failedIdx).toBeGreaterThanOrEqual(0);
    expect(divergenceIdx).toBeGreaterThan(failedIdx);
    expect(acceptIdx).toBeGreaterThan(divergenceIdx);
    expect(preflightBlock).toMatch(
      /Do not auto-repair or modify _prisma_migrations/
    );
    expect(postDeployBlock).toMatch(
      /migrations from the database are not found locally|local migration history and the migrations table/
    );
  });

  it('fails closed on SHA mismatch or non-main ref before any DB status/deploy', () => {
    const shaStep = extractStep(text, 'Source SHA guard');
    const statusStep = extractStep(
      text,
      'Prisma migrate status (fail closed on failed/unsafe state)'
    );
    const deployStep = extractStep(text, 'Prisma migrate deploy');
    expect(shaStep).toMatch(/git rev-parse HEAD/);
    expect(shaStep).toMatch(/ACTUAL_SHA/);
    expect(shaStep).toMatch(/EXPECTED_MAIN_SHA/);
    expect(shaStep).toMatch(/refs\/heads\/main/);
    expect(shaStep).toMatch(
      /Checked-out SHA does not match expected_main_sha/
    );
    expect(shaStep).not.toMatch(/prisma migrate status/);
    expect(shaStep).not.toMatch(/prisma migrate deploy/);
    expect(shaStep).not.toMatch(/secrets\.DATABASE_URL|secrets\.DIRECT_URL/);
    expect(statusStep).toMatch(/prisma migrate status/);
    expect(deployStep).toMatch(/prisma migrate deploy/);
    const shaIdx = text.indexOf('Source SHA guard');
    const statusIdx = text.indexOf(
      'Prisma migrate status (fail closed on failed/unsafe state)'
    );
    const deployIdx = text.indexOf('Prisma migrate deploy');
    expect(shaIdx).toBeGreaterThan(text.indexOf('Checkout'));
    expect(statusIdx).toBeGreaterThan(shaIdx);
    expect(deployIdx).toBeGreaterThan(statusIdx);
  });

  it('accepts only exactly one pending migration matching expected_migration', () => {
    expect(preflightBlock).toMatch(/pending_count/);
    expect(preflightBlock).toMatch(/pending_migration/);
    expect(preflightBlock).toMatch(/expected_migration/);
    expect(preflightBlock).toMatch(/To apply migrations/);
    expect(preflightBlock).toMatch(
      /\^\[0-9\]\{8\}\[0-9\]\*_\[A-Za-z0-9_\]\+\$/
    );
    expect(preflightBlock).toMatch(
      /prisma\/migrations\/\$\{name\}\/migration\.sql/
    );
    expect(preflightBlock).toMatch(
      /Zero pending migrations\. This is a production deployment workflow, not a no-op/
    );
    expect(preflightBlock).toMatch(
      /Exactly one pending migration is required/
    );
    expect(preflightBlock).toMatch(
      /Pending migration does not match expected_migration/
    );
    expect(preflightBlock).toMatch(/PENDING_COUNT\}" -eq 0/);
    expect(preflightBlock).toMatch(/PENDING_COUNT\}" -ne 1/);
    expect(preflightBlock).toMatch(
      /PENDING_MIGRATION\}" != "\$\{EXPECTED_MIGRATION\}"/
    );
    expect(preflightBlock).not.toMatch(
      /Preflight status acceptable for migrate deploy \(pending or up-to-date\)/
    );
  });

  it('does not set DATABASE_URL or DIRECT_URL at job scope', () => {
    const preamble = jobPreambleBeforeSteps(text);
    expect(preamble).not.toMatch(/DATABASE_URL/);
    expect(preamble).not.toMatch(/DIRECT_URL/);
  });

  it('scopes production DB secrets only to presence, status, and deploy steps', () => {
    const confirm = extractStep(
      text,
      'Confirm production migration authorization'
    );
    const checkout = extractStep(text, 'Checkout');
    const setupNode = extractStep(text, 'Setup Node');
    const npmCi = extractStep(text, 'Install dependencies');
    const prismaVersion = extractStep(text, 'Prisma version');
    const listMigrations = extractStep(text, 'Verify migration directory');
    const waitPooled = extractStep(text, 'Wait for pooled (6543)');
    const waitDirect = extractStep(text, 'Wait for direct (5432)');
    const generate = extractStep(text, 'Prisma generate');
    const summary = extractStep(text, 'Summary');
    const preflightSecrets = extractStep(
      text,
      'Preflight secrets (names/presence only)'
    );
    const preStatus = extractStep(
      text,
      'Prisma migrate status (fail closed on failed/unsafe state)'
    );
    const deploy = extractStep(text, 'Prisma migrate deploy');
    const postStatus = extractStep(
      text,
      'Post-deploy migrate status (must be healthy)'
    );

    for (const step of [
      confirm,
      checkout,
      setupNode,
      npmCi,
      prismaVersion,
      listMigrations,
      waitPooled,
      waitDirect,
      generate,
      summary,
    ]) {
      expect(step).not.toMatch(/secrets\.DATABASE_URL/);
      expect(step).not.toMatch(/secrets\.DIRECT_URL/);
    }

    expect(npmCi).toMatch(/npm ci/);
    expect(generate).toMatch(/prisma generate/);
    expect(preflightSecrets).toMatch(
      /DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/
    );
    expect(preflightSecrets).toMatch(
      /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );
    expect(preStatus).toMatch(
      /DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/
    );
    expect(preStatus).toMatch(
      /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );
    expect(deploy).toMatch(
      /DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/
    );
    expect(deploy).toMatch(/DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/);
    expect(postStatus).toMatch(
      /DATABASE_URL:\s*\$\{\{\s*secrets\.DATABASE_URL\s*\}\}/
    );
    expect(postStatus).toMatch(
      /DIRECT_URL:\s*\$\{\{\s*secrets\.DIRECT_URL\s*\}\}/
    );
  });

  it('does not invoke providers, Odds, ETL, or ratings', () => {
    expect(text).toMatch(/ODDS_API_KEY: not provided/);
    expect(text).toMatch(/CFBD_API_KEY: not provided/);
    expect(text).not.toMatch(/secrets\.ODDS_API_KEY|secrets\.CFBD_API_KEY/);
    expect(text).not.toMatch(/compute_ratings|seed-ratings|ingest-simple/);
    expect(text).toMatch(/providers\/ETL\/ratings: not invoked/);
  });

  it('documents that prisma schema merges no longer auto-migrate', () => {
    expect(text).toMatch(/does NOT/);
    expect(text).toMatch(/apply production migrations/);
    expect(text).toMatch(/MIGRATE_PRODUCTION/);
    expect(text).toMatch(/auto push trigger: disabled/);
  });
});

describe('prisma migrate workflow does not embed schema DDL', () => {
  const workflow = fs.readFileSync(WORKFLOW, 'utf8');

  it('workflow YAML does not add TeamMembership.conference or ALTER team_membership', () => {
    expect(workflow).not.toMatch(/TeamMembership\.conference/);
    expect(workflow).not.toMatch(/ADD COLUMN "conference"/);
    expect(workflow).not.toMatch(/ALTER TABLE "team_membership"/);
  });
});
