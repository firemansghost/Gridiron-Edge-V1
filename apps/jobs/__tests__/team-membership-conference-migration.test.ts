/**
 * Phase 2C-2G-2 — Static safety checks for TeamMembership.conference migration.
 * No network. No DB. No migrate deploy.
 */

import * as fs from 'fs';
import * as path from 'path';

const SCHEMA = path.join(__dirname, '../../../prisma/schema.prisma');
const MIGRATION_DIR = path.join(
  __dirname,
  '../../../prisma/migrations/20260808010000_add_team_membership_conference'
);
const MIGRATION_SQL = path.join(MIGRATION_DIR, 'migration.sql');

describe('TeamMembership.conference schema + migration', () => {
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const sql = fs.readFileSync(MIGRATION_SQL, 'utf8');

  it('adds nullable conference on TeamMembership without changing keys/indexes', () => {
    const modelMatch = schema.match(
      /model TeamMembership \{[\s\S]*?\n\}/
    );
    expect(modelMatch).toBeTruthy();
    const model = modelMatch![0];
    expect(model).toMatch(/conference\s+String\?/);
    expect(model).toMatch(/@@id\(\[season,\s*teamId\]\)/);
    expect(model).toMatch(/@@map\("team_membership"\)/);
    // Must stay nullable — no required conference
    expect(model).not.toMatch(/conference\s+String\s/);
  });

  it('migration SQL only adds nullable conference column', () => {
    expect(fs.existsSync(MIGRATION_DIR)).toBe(true);
    expect(sql).toMatch(
      /ALTER TABLE "team_membership"\s+ADD COLUMN "conference" TEXT/i
    );
    // Strip SQL comments before forbidding DML/DDL keywords
    const statements = sql
      .split(/\r?\n/)
      .filter((line) => !/^\s*--/.test(line))
      .join('\n');
    expect(statements).not.toMatch(/\bNOT NULL\b/i);
    expect(statements).not.toMatch(/\bUPDATE\b/i);
    expect(statements).not.toMatch(/\bDELETE\b/i);
    expect(statements).not.toMatch(/\bDROP TABLE\b/i);
    expect(statements).not.toMatch(/\bDROP COLUMN\b/i);
    expect(statements).not.toMatch(/\bTRUNCATE\b/i);
    expect(statements).not.toMatch(/\bINSERT\b/i);
    expect(statements).not.toMatch(/_prisma_migrations/);
    expect(statements).not.toMatch(/migrate resolve/i);
    // Must not mutate static Team.conference (teams table)
    expect(statements).not.toMatch(/ALTER TABLE "teams"/i);
  });
});
