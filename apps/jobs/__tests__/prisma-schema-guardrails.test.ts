/**
 * Phase 2C-2G-1B — Static + pure tests for Prisma Schema Guardrails.
 *
 * Run 31219442075 showed origin/main unavailable under shallow PR merge
 * checkout; `if git diff origin/...` swallowed the fatal and falsely passed.
 * No network. No DB. No migrate deploy.
 */

import * as fs from 'fs';
import * as path from 'path';
import { classifyPrismaGuardrailChanges } from '../src/preseason/prisma-schema-guardrail';

const WORKFLOW = path.join(
  __dirname,
  '../../../.github/workflows/prisma-guardrails.yml'
);

describe('classifyPrismaGuardrailChanges', () => {
  it('Case A: schema only => fail', () => {
    const r = classifyPrismaGuardrailChanges(['prisma/schema.prisma']);
    expect(r.schemaChanged).toBe(true);
    expect(r.migrationChanged).toBe(false);
    expect(r.guardrailPasses).toBe(false);
  });

  it('Case B: schema + migration => pass', () => {
    const r = classifyPrismaGuardrailChanges([
      'prisma/schema.prisma',
      'prisma/migrations/20260807_add_team_membership_conference/migration.sql',
    ]);
    expect(r.schemaChanged).toBe(true);
    expect(r.migrationChanged).toBe(true);
    expect(r.guardrailPasses).toBe(true);
  });

  it('Case C: unrelated files => pass', () => {
    const r = classifyPrismaGuardrailChanges(['apps/jobs/foo.ts']);
    expect(r.schemaChanged).toBe(false);
    expect(r.migrationChanged).toBe(false);
    expect(r.guardrailPasses).toBe(true);
  });

  it('Case D: migration only => pass', () => {
    const r = classifyPrismaGuardrailChanges([
      'prisma/migrations/something/migration.sql',
    ]);
    expect(r.schemaChanged).toBe(false);
    expect(r.migrationChanged).toBe(true);
    expect(r.guardrailPasses).toBe(true);
  });
});

describe('prisma-guardrails workflow', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');

  it('has Prisma Schema Guardrails name and pull_request trigger', () => {
    expect(text).toMatch(/^name:\s*Prisma Schema Guardrails/m);
    expect(text).toMatch(/pull_request:/);
    expect(text).not.toMatch(/^\s*push:/m);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).not.toMatch(/workflow_dispatch:/);
  });

  it('uses checkout@v6 with fetch-depth 0 and setup-node@v6 Node 20', () => {
    expect(text).toMatch(/checkout@v6/);
    expect(text).toMatch(/fetch-depth:\s*0/);
    expect(text).toMatch(/setup-node@v6/);
    expect(text).toMatch(/node-version:\s*['"]?20['"]?/);
  });

  it('compares against PR base SHA, not origin/main', () => {
    expect(text).toMatch(
      /BASE_SHA:\s*\$\{\{\s*github\.event\.pull_request\.base\.sha\s*\}\}/
    );
    expect(text).toMatch(/git cat-file -e "\$\{BASE_SHA\}\^\{commit\}"/);
    expect(text).toMatch(/git diff --name-only "\$\{BASE_SHA\}"\.\.\.HEAD/);
    // Run 31219442075: bare origin/main...HEAD comparison must be gone
    // (comments may mention the incident; forbid the executable command form).
    expect(text).not.toMatch(
      /git diff --name-only origin\/main\.\.\.HEAD/
    );
    expect(text).not.toMatch(/origin\/\$\{\{\s*github\.base_ref/);
    // Fail-closed: never use `if git diff` as the condition (failure => skip).
    expect(text).not.toMatch(/if\s+git\s+diff/);
  });

  it('fail-closed comparison semantics', () => {
    expect(text).toMatch(/set -euo pipefail/);
    expect(text).toMatch(/PR base SHA unavailable/);
    expect(text).toMatch(/SCHEMA_CHANGED=true/);
    expect(text).toMatch(/MIGRATION_CHANGED=true/);
    expect(text).toMatch(
      /schema\.prisma change without prisma\/migrations/
    );
    expect(text).not.toMatch(/\|\|\s*true/);
  });

  it('keeps format/validate; no migrate deploy or providers', () => {
    expect(text).toMatch(/prisma format/);
    expect(text).toMatch(/prisma validate/);
    expect(text).toMatch(/npm ci --ignore-scripts/);
    expect(text).not.toMatch(/prisma migrate deploy/);
    expect(text).not.toMatch(/migrate resolve/);
    expect(text).not.toMatch(/ODDS_API_KEY|CFBD_API_KEY|secrets\./);
    expect(text).not.toMatch(/compute_ratings|seed-ratings|ingest-simple/);
    // Dummy localhost URLs for validate only — not production secrets
    expect(text).toMatch(/postgresql:\/\/user:pass@localhost/);
  });
});
