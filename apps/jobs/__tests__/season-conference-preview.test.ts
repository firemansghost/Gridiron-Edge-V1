/**
 * Phase 2C-2F — Mocked season-conference persistence preview tests.
 * No network. No production DB. No providers. No migrations.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  EXPECTED_FBS_COUNT,
  buildFbsFixture,
  buildIdentityResolver,
  buildSeasonConferencePreview,
  canonicalizeConferenceForPersistence,
  parseSeasonConferencePreviewArgs,
  resolveSeasonAwareConferenceMap,
  sanitizeSeasonConferencePreviewError,
} from '../src/preseason/season-conference-preview';
import { canonicalizeConferenceForPersistence as canonFromDiagnostic } from '../src/preseason/conference-recruiting-diagnostic';

function nameMapForFbs(fbs: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const id of fbs) {
    map[`Name ${id}`] = id;
    if (id === 'north-dakota-state') map['North Dakota State'] = id;
    if (id === 'sacramento-state') map['Sacramento State'] = id;
  }
  return map;
}

function healthyTeamsFbs(fbs: string[]) {
  return fbs.map((id) => {
    let school = `Name ${id}`;
    let conference = 'SEC';
    if (id === 'north-dakota-state') {
      school = 'North Dakota State';
      conference = 'Mountain West';
    } else if (id === 'sacramento-state') {
      school = 'Sacramento State';
      conference = 'Mid-American';
    } else if (id === fbs[0]) {
      conference = 'FBS Independents';
    } else if (id === fbs[1]) {
      conference = 'FBS Independents';
    }
    return {
      school,
      conference,
      classification: 'fbs',
    };
  });
}

function matchingProposed(fbs: string[]): Record<string, string> {
  const rows = healthyTeamsFbs(fbs);
  const out: Record<string, string> = {};
  for (const r of rows) {
    const id =
      r.school === 'North Dakota State'
        ? 'north-dakota-state'
        : r.school === 'Sacramento State'
          ? 'sacramento-state'
          : r.school.replace(/^Name /, '');
    out[id] = canonicalizeConferenceForPersistence(r.conference)!;
  }
  return out;
}

describe('parse season conference preview args', () => {
  it('accepts --season 2026 --preview', () => {
    expect(
      parseSeasonConferencePreviewArgs(['--season', '2026', '--preview'])
    ).toEqual({ ok: true, season: 2026, preview: true });
  });

  it('rejects wrong season and write flags', () => {
    expect(
      parseSeasonConferencePreviewArgs(['--season', '2025', '--preview']).ok
    ).toBe(false);
    expect(
      parseSeasonConferencePreviewArgs([
        '--season',
        '2026',
        '--preview',
        '--write',
      ]).ok
    ).toBe(false);
  });
});

describe('canonicalizeConferenceForPersistence', () => {
  it('normalizes FBS Independents and alias spellings', () => {
    expect(canonicalizeConferenceForPersistence('FBS Independents')).toBe(
      'Independent'
    );
    expect(canonicalizeConferenceForPersistence('MAC')).toBe('Mid-American');
    expect(canonicalizeConferenceForPersistence('AAC')).toBe(
      'American Athletic'
    );
    expect(canonicalizeConferenceForPersistence('Conference USA')).toBe(
      'Conference USA'
    );
    expect(canonFromDiagnostic('C-USA')).toBe('Conference USA');
  });
});

describe('season conference preview', () => {
  const fbs = buildFbsFixture();
  const resolve = buildIdentityResolver(nameMapForFbs(fbs));

  it('exact 138 provider/DB map is writeEligible with NDSU/Sac/Independents', () => {
    const result = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId: matchingProposed(fbs),
      resolveTeamId: resolve,
      providerRequestCount: 1,
    });
    expect(result.candidateCount).toBe(EXPECTED_FBS_COUNT);
    expect(result.exactSetMatch).toBe(true);
    expect(result.writeEligible).toBe(true);
    expect(result.mutationsInvoked).toBe(false);
    expect(result.ratingsComputeAuthorized).toBe(false);
    expect(result.schemaChanged).toBe(false);
    expect(result.migrationCreated).toBe(false);
    expect(result.providerRequestCount).toBe(1);
    expect(result.ndsu.conference).toBe('Mountain West');
    expect(result.sacramentoState.conference).toBe('Mid-American');
    expect(result.normalizedConferenceCounts.Independent).toBe(2);
    expect(result.rawConferenceCounts['FBS Independents']).toBe(2);
    expect(result.currentTeamConferenceSafeFor2026).toBe(true);
  });

  it('current Team.conference mismatch does not invalidate provider candidate', () => {
    const result = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: healthyTeamsFbs(fbs),
      conferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'Independent'])
      ),
      resolveTeamId: resolve,
    });
    expect(result.writeEligible).toBe(true);
    expect(result.currentTeamConferenceSafeFor2026).toBe(false);
    expect(result.currentTeamConferenceDifferences.length).toBeGreaterThan(0);
    expect(result.ratingsComputeAuthorized).toBe(false);
  });

  it('missing provider team => not writeEligible', () => {
    const rows = healthyTeamsFbs(fbs).filter(
      (r) => r.school !== 'North Dakota State'
    );
    const result = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingProposed(fbs),
      resolveTeamId: resolve,
    });
    expect(result.dbFbsMissingFromProvider).toContain('north-dakota-state');
    expect(result.exactSetMatch).toBe(false);
    expect(result.writeEligible).toBe(false);
  });

  it('provider extra => not writeEligible', () => {
    const map = nameMapForFbs(fbs);
    map['Ghost FBS'] = 'ghost-fbs';
    const result = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: [
        ...healthyTeamsFbs(fbs),
        { school: 'Ghost FBS', conference: 'SEC', classification: 'fbs' },
      ],
      conferenceByTeamId: matchingProposed(fbs),
      resolveTeamId: buildIdentityResolver(map),
    });
    expect(result.providerFbsOutsideDb).toContain('ghost-fbs');
    expect(result.writeEligible).toBe(false);
  });

  it('unresolved team => not writeEligible', () => {
    const rows = [
      ...healthyTeamsFbs(fbs).slice(0, -1),
      { school: 'Unknown School', conference: 'SEC', classification: 'fbs' },
    ];
    const result = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingProposed(fbs),
      resolveTeamId: resolve,
    });
    expect(result.unresolvedProviderSchools).toContain('Unknown School');
    expect(result.writeEligible).toBe(false);
  });

  it('duplicate/collision => not writeEligible', () => {
    const rows = [
      ...healthyTeamsFbs(fbs),
      { school: `Name ${fbs[0]}`, conference: 'ACC', classification: 'fbs' },
    ];
    const result = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingProposed(fbs),
      resolveTeamId: resolve,
    });
    expect(result.duplicateTeamIds).toContain(fbs[0]);
    expect(result.writeEligible).toBe(false);
  });

  it('missing conference => not writeEligible', () => {
    const rows = healthyTeamsFbs(fbs).map((r, i) =>
      i === 0 ? { ...r, conference: undefined } : r
    );
    const result = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingProposed(fbs),
      resolveTeamId: resolve,
    });
    expect(result.missingConferences.length).toBeGreaterThan(0);
    expect(result.writeEligible).toBe(false);
  });

  it('unknown conference => not writeEligible', () => {
    const rows = healthyTeamsFbs(fbs).map((r, i) =>
      i === 0 ? { ...r, conference: 'WAC' } : r
    );
    const result = buildSeasonConferencePreview({
      fbsIds: fbs,
      teamsFbsRaw: rows,
      conferenceByTeamId: matchingProposed(fbs),
      resolveTeamId: resolve,
    });
    expect(result.unrecognizedConferences.length).toBeGreaterThan(0);
    expect(result.writeEligible).toBe(false);
  });
});

describe('resolveSeasonAwareConferenceMap (future V1)', () => {
  const fbs = buildFbsFixture().slice(0, 5);

  it('complete season-aware map accepted', () => {
    const seasonMap = Object.fromEntries(fbs.map((id) => [id, 'SEC']));
    const r = resolveSeasonAwareConferenceMap({
      targetSeason: 2026,
      expectedFbsIds: fbs,
      seasonConferenceByTeamId: seasonMap,
    });
    expect(r.ok).toBe(true);
    expect(r.usedLegacyFallback).toBe(false);
    expect(Object.keys(r.conferenceByTeamId)).toHaveLength(5);
  });

  it('incomplete map fails closed', () => {
    const seasonMap = Object.fromEntries(
      fbs.slice(0, 4).map((id) => [id, 'SEC'])
    );
    const r = resolveSeasonAwareConferenceMap({
      targetSeason: 2026,
      expectedFbsIds: fbs,
      seasonConferenceByTeamId: seasonMap,
      legacyTeamConferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'Independent'])
      ),
      allowLegacyTeamConferenceFallback: true,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/fallback prohibited for 2026/);
    expect(r.missingTeamIds).toContain(fbs[4]);
  });

  it('2026 cannot fall back to Team.conference', () => {
    const r = resolveSeasonAwareConferenceMap({
      targetSeason: 2026,
      expectedFbsIds: fbs,
      seasonConferenceByTeamId: {},
      legacyTeamConferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'SEC'])
      ),
      allowLegacyTeamConferenceFallback: true,
    });
    expect(r.ok).toBe(false);
    expect(r.usedLegacyFallback).toBe(false);
  });

  it('historical seasons may use legacy fallback when explicitly allowed', () => {
    const r = resolveSeasonAwareConferenceMap({
      targetSeason: 2025,
      expectedFbsIds: fbs,
      seasonConferenceByTeamId: {},
      legacyTeamConferenceByTeamId: Object.fromEntries(
        fbs.map((id) => [id, 'SEC'])
      ),
      allowLegacyTeamConferenceFallback: true,
    });
    expect(r.ok).toBe(true);
    expect(r.usedLegacyFallback).toBe(true);
  });
});

describe('season conference preview safety', () => {
  it('sanitized errors', () => {
    expect(
      sanitizeSeasonConferencePreviewError({
        message: 'postgresql://u:p@h/db CFBD_API_KEY=x',
      })
    ).toBe(
      'Season conference preview failed; connection and secret details suppressed'
    );
  });

  it('pure module has no fetch/prisma', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/preseason/season-conference-preview.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/from ['"]@prisma\/client['"]/);
  });

  it('CLI reuses one TeamResolver; no mutations; one endpoint', () => {
    const cli = fs.readFileSync(
      path.join(__dirname, '../preview-2026-season-conferences.ts'),
      'utf8'
    );
    expect(cli).not.toMatch(
      /\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\s*\(/
    );
    expect(cli).toMatch(/\/teams\/fbs/);
    expect(cli).not.toMatch(/cfbdGetJson\(\s*['"]\/talent['"]/);
    expect(cli).not.toMatch(/cfbdGetJson\(\s*['"]\/recruiting\/teams['"]/);
    expect(cli).toMatch(/\/recruiting\/teams not called|No recruiting/);
    expect(cli).not.toMatch(/ODDS_API_KEY|OddsApi/);
    expect(cli).not.toMatch(/compute_ratings|seed-ratings/);
    expect(cli).toMatch(
      /const teamResolver = options\.resolveTeamId \? null : new TeamResolver\(\)/
    );
    const resolverNews = cli.match(/new TeamResolver\s*\(/g) ?? [];
    expect(resolverNews).toHaveLength(1);
  });

  it('workflow is dispatch-only with no Odds/migrations', () => {
    const text = fs.readFileSync(
      path.join(
        __dirname,
        '../../../.github/workflows/preview-2026-season-conferences.yml'
      ),
      'utf8'
    );
    expect(text).toMatch(/workflow_dispatch:/);
    expect(text).not.toMatch(/^\s*schedule:/m);
    expect(text).toMatch(/checkout@v6/);
    expect(text).toMatch(/node-version:\s*'20'/);
    expect(text).toMatch(/ODDS_API_KEY: not provided/);
    expect(text).not.toMatch(/secrets\.ODDS_API_KEY/);
    expect(text).toMatch(/prisma migrate: not invoked/);
    expect(text).not.toMatch(/prisma migrate deploy/);
    expect(text).toMatch(/preview-2026-season-conferences\.ts/);
  });
});
