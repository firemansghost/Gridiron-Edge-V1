/**
 * Phase 2C-2G-1 — Static safety checks for production Prisma migrate workflow.
 * No network. No DB. No migrate deploy.
 */

import * as fs from 'fs';
import * as path from 'path';

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

describe('prisma-migrate workflow hardening', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  const runBlocks = extractRunBlocks(text);
  const runBodies = runBlocks.join('\n---\n');

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
    // Safe in YAML env: — expected. Unsafe inside run: bodies — forbidden.
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
    // Historical mention only in comments / "repair: not invoked" log lines is OK
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

describe('prisma schema unchanged in this phase (repo snapshot)', () => {
  it('TeamMembership still has no conference field in schema.prisma', () => {
    const schema = fs.readFileSync(
      path.join(__dirname, '../../../prisma/schema.prisma'),
      'utf8'
    );
    const membershipBlock = schema.match(
      /model TeamMembership \{[\s\S]*?\n\}/
    )?.[0];
    expect(membershipBlock).toBeTruthy();
    expect(membershipBlock).toMatch(/season\s+Int/);
    expect(membershipBlock).toMatch(/teamId\s+String/);
    expect(membershipBlock).toMatch(/level\s+String/);
    expect(membershipBlock).not.toMatch(/conference\s+String/);
  });
});
