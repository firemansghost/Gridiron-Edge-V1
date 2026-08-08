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
      b.includes('Preflight status acceptable for migrate deploy')
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

  it('passes workflow inputs through env mappings, not shell interpolation', () => {
    expect(text).toMatch(/MIGRATION_CONFIRM:\s*\$\{\{\s*inputs\.confirm\s*\}\}/);
    expect(text).toMatch(
      /MIGRATION_REASON:\s*\$\{\{\s*inputs\.migration_reason\s*\}\}/
    );
    expect(runBodies).not.toMatch(/\$\{\{\s*inputs\.confirm\s*\}\}/);
    expect(runBodies).not.toMatch(/\$\{\{\s*inputs\.migration_reason\s*\}\}/);
    expect(runBodies).toMatch(/\$MIGRATION_CONFIRM/);
    expect(runBodies).toMatch(/\$MIGRATION_REASON/);
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

  it('detects history divergence before accepting pending/up-to-date', () => {
    expect(preflightBlock).toBeTruthy();
    const divergenceIdx = preflightBlock.search(
      /migrations from the database are not found locally|local migration history and the migrations table/
    );
    const acceptIdx = preflightBlock.search(
      /Preflight status acceptable for migrate deploy/
    );
    expect(divergenceIdx).toBeGreaterThanOrEqual(0);
    expect(acceptIdx).toBeGreaterThan(divergenceIdx);
    expect(preflightBlock).toMatch(
      /Do not auto-repair or modify _prisma_migrations/
    );
    expect(postDeployBlock).toMatch(
      /migrations from the database are not found locally|local migration history and the migrations table/
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
