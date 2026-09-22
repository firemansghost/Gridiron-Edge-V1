import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const RAW = path.join(
  ROOT,
  'research/candidate-b/snapshots/cfbd-preseason-elo/2026/2026-09-22-raw.json'
);
const MANIFEST = path.join(
  ROOT,
  'research/candidate-b/snapshots/cfbd-preseason-elo/2026/2026-09-22-manifest.json'
);
const CONTRACT = path.join(
  ROOT,
  'research/candidate-b/CANDIDATE_B_ELO_PRIOR_V1_FORMULA_CONTRACT.md'
);

describe('Candidate B Elo Prior V1 frozen source contract', () => {
  const raw = fs.readFileSync(RAW);
  const rows = JSON.parse(raw.toString('utf8')) as Array<{
    year: number;
    team: string;
    conference: string;
    elo: number;
  }>;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as any;
  const contract = fs.readFileSync(CONTRACT, 'utf8');

  it('pins the exact discovery bytes and complete 138-team payload', () => {
    expect(raw.length).toBe(9542);
    expect(crypto.createHash('sha256').update(raw).digest('hex')).toBe(
      '97e40e9f8220f9e7bafd8c6cd68dbf9ecb4b94208fe5911b97b07891f9fa4e64'
    );
    expect(rows).toHaveLength(138);
    expect(new Set(rows.map((row) => row.team)).size).toBe(138);
    expect(rows.every((row) => row.year === 2026)).toBe(true);
    expect(rows.every((row) => Number.isFinite(row.elo))).toBe(true);
  });

  it('recomputes the frozen population moments from source rather than trusting rounded references', () => {
    const values = rows.map((row) => row.elo);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    const sd = Math.sqrt(variance);

    expect(mean).toBeCloseTo(1498.7608695652175, 12);
    expect(sd).toBeCloseTo(193.5003858868873, 12);
    expect(Math.min(...values)).toBe(925);
    expect(Math.max(...values)).toBe(2064);
  });

  it('pins provenance and the Week 5 prospective boundary', () => {
    expect(manifest.discoveryRunId).toBe(35740044682);
    expect(manifest.rawSha256).toBe(
      '97e40e9f8220f9e7bafd8c6cd68dbf9ecb4b94208fe5911b97b07891f9fa4e64'
    );
    expect(manifest.qa.canonicalFbsTeams).toBe(138);
    expect(manifest.qa.usableEloTeams).toBe(138);

    expect(contract).toContain('candidate_b_elo_prior_v1');
    expect(contract).toContain('3.5 * zElo_i');
    expect(contract).toContain('First prospective observation: **Week 5, 2026**');
    expect(contract).toContain('Do **not** create a Week 4 Elo capture');
    expect(contract).toContain('No outcome optimization. No retrospective use. No blend.');
  });
});
