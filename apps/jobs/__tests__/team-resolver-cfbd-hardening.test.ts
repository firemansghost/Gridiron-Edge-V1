/**
 * Phase 2C-2E — CFBD TeamResolver hardening tests.
 * Uses real alias/denylist files. No network. No DB mutations.
 */

import { TeamResolver } from '../adapters/TeamResolver';
import {
  isRecognizedV1Conference,
  normalizeCfbdConferenceForV1,
} from '../src/preseason/conference-recruiting-diagnostic';

describe('TeamResolver CFBD hardening', () => {
  const resolver = new TeamResolver();

  const cfbd = (name: string) =>
    resolver.resolveTeam(name, 'college-football', { provider: 'cfbd' });

  const nonCfbd = (name: string) =>
    resolver.resolveTeam(name, 'college-football');

  describe('2026 FBS exact CFBD aliases', () => {
    it('North Dakota State CFBD → north-dakota-state', () => {
      expect(cfbd('North Dakota State')).toBe('north-dakota-state');
    });

    it('Sacramento State CFBD → sacramento-state', () => {
      expect(cfbd('Sacramento State')).toBe('sacramento-state');
    });

    it('James Madison CFBD → james-madison without fuzzy', () => {
      expect(cfbd('James Madison')).toBe('james-madison');
    });

    it('South Alabama CFBD → south-alabama without fuzzy', () => {
      expect(cfbd('South Alabama')).toBe('south-alabama');
    });
  });

  describe('FCS / non-FBS false positives fail closed', () => {
    it('North Carolina A&T CFBD → null', () => {
      expect(cfbd('North Carolina A&T')).toBeNull();
    });

    it('Alabama A&M CFBD → null', () => {
      expect(cfbd('Alabama A&M')).toBeNull();
    });

    it('San Diego CFBD → null', () => {
      expect(cfbd('San Diego')).toBeNull();
    });
  });

  describe('legitimate nearby FBS names', () => {
    it('North Carolina → north-carolina', () => {
      expect(cfbd('North Carolina')).toBe('north-carolina');
    });

    it('Alabama → alabama', () => {
      expect(cfbd('Alabama')).toBe('alabama');
    });

    it('San Diego State → san-diego-state', () => {
      expect(cfbd('San Diego State')).toBe('san-diego-state');
    });
  });

  describe('CFBD strict — no generic fuzzy fallback', () => {
    it('unknown CFBD two-word team does not fuzzy-map to an FBS alias', () => {
      // Would previously fuzzy-match word subsets onto FBS aliases
      expect(cfbd('North Carolina Central')).toBeNull();
      expect(cfbd('Alabama State')).toBeNull();
    });

    it('exact CFBD alias still resolves', () => {
      expect(cfbd('Texas A&M')).toBe('texas-a-m');
      expect(cfbd('Boise State')).toBe('boise-state');
    });

    it('non-CFBD resolver keeps fuzzy available for unrelated providers', () => {
      // General aliases include "South Alabama Jaguars"; plain name without
      // CFBD provider may still fuzzy onto that alias for Odds-style inputs.
      expect(nonCfbd('South Alabama')).toBe('south-alabama');
    });
  });

  describe('strictFullIdentity is additive and default CFBD behavior is unchanged', () => {
    const strictCfbd = (name: string) =>
      resolver.resolveTeamDetailed(name, 'college-football', {
        provider: 'cfbd',
        strictFullIdentity: true,
      });

    it('default CFBD still resolves California (PA) after parenthetical stripping', () => {
      const result = resolver.resolveTeamDetailed('California (PA)', 'college-football', {
        provider: 'cfbd',
      });
      expect(result.teamId).toBe('california');
      expect(result.method).toBe('cfbd_alias');
      expect(
        resolver.resolveTeamDetailed('California (PA)', 'NCAAF', { provider: 'cfbd' }).teamId
      ).toBe('california');
    });

    it('strict CFBD leaves California (PA) unresolved and keeps explicit full-identity maps', () => {
      expect(strictCfbd('California (PA)')).toEqual({ teamId: null, method: null });
      expect(strictCfbd('California').teamId).toBe('california');
      expect(strictCfbd('Miami (OH)').teamId).toBe('miami-oh');
      expect(strictCfbd('Miami (FL)').teamId).toBe('miami');
      expect(strictCfbd('Texas A&M').teamId).toBe('texas-a-m');
      expect(strictCfbd('San José State').teamId).toBe('san-jos-state');
      expect(strictCfbd('San Diego State').teamId).toBe('san-diego-state');
    });

    it('strict CFBD rejects substring/prefix guard hits that default mode still accepts', () => {
      expect(strictCfbd('Texas A&M (Fake)')).toEqual({ teamId: null, method: null });
      expect(strictCfbd('Miami (OH) (Fake)')).toEqual({ teamId: null, method: null });
      expect(strictCfbd('San José State (Fake)')).toEqual({ teamId: null, method: null });
      expect(strictCfbd('San Diego State (Fake)')).toEqual({ teamId: null, method: null });
      expect(strictCfbd('Texas A&M Corpus Christi')).toEqual({ teamId: null, method: null });

      expect(cfbd('Texas A&M (Fake)')).toBe('texas-a-m');
      expect(cfbd('Miami (OH) (Fake)')).toBe('miami-oh');
      expect(cfbd('San José State (Fake)')).toBe('san-jos-state');
      expect(cfbd('San Diego State (Fake)')).toBe('san-diego-state');
      expect(cfbd('Texas A&M Corpus Christi')).toBe('texas-a-m');
    });

    it('synthetic parenthetical-only alias is rejected in strict mode and accepted by default CFBD', () => {
      expect(cfbd('Boise State (Fake)')).toBe('boise-state');
      expect(strictCfbd('Boise State (Fake)')).toEqual({ teamId: null, method: null });
    });
  });

  describe('San Diego mis-map guard', () => {
    it('plain San Diego does not map via guard', () => {
      expect(cfbd('San Diego')).toBeNull();
      expect(nonCfbd('San Diego')).toBeNull();
    });

    it('San Diego State still maps', () => {
      expect(cfbd('San Diego State')).toBe('san-diego-state');
      expect(nonCfbd('San Diego State')).toBe('san-diego-state');
    });
  });
});

describe('TeamResolver strictFullIdentity for Odds API', () => {
  const resolver = new TeamResolver();
  const strictOdds = (name: string) =>
    resolver.resolveTeamDetailed(name, 'NCAAF', {
      provider: 'oddsapi',
      strictFullIdentity: true,
    });

  it('does not consult CFBD-specific aliases for Odds provider', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../adapters/TeamResolver.ts'),
      'utf8'
    );
    expect(src).toContain("options?.provider === 'cfbd'");
    expect(src).toContain('strictFullIdentity === true');
    expect(src).not.toMatch(/provider === 'oddsapi'[\s\S]{0,80}cfbdAliases/);
  });

  it('resolves current legitimate Odds exact identities', () => {
    expect(strictOdds('Miami (OH) RedHawks')).toEqual({
      teamId: 'miami-oh',
      method: 'alias',
    });
    expect(strictOdds('Texas A&M Aggies')).toEqual({
      teamId: 'texas-a-m',
      method: 'alias',
    });
    expect(strictOdds('San Diego State Aztecs')).toEqual({
      teamId: 'san-diego-state',
      method: 'alias',
    });
    expect(strictOdds('San Jose State Spartans')).toEqual({
      teamId: 'san-jos-state',
      method: 'alias',
    });
  });

  it('fails closed on East Texas A&M and nearby false A&M identities', () => {
    expect(strictOdds('East Texas A&M Lions')).toEqual({ teamId: null, method: null });
    expect(strictOdds('Texas A&M Corpus Christi')).toEqual({ teamId: null, method: null });
    expect(strictOdds('Texas A&M-Kingsville')).toEqual({ teamId: null, method: null });
    expect(strictOdds('Texas A&M (Fake)')).toEqual({ teamId: null, method: null });
  });

  it('legacy default substring guard remains for non-opt-in callers', () => {
    expect(resolver.resolveTeamDetailed('East Texas A&M Lions', 'NCAAF')).toEqual({
      teamId: 'texas-a-m',
      method: 'guard',
    });
  });
});

describe('normalizeCfbdConferenceForV1', () => {
  it('FBS Independents → Independent', () => {
    expect(normalizeCfbdConferenceForV1('FBS Independents')).toBe(
      'Independent'
    );
    expect(
      isRecognizedV1Conference(
        normalizeCfbdConferenceForV1('FBS Independents')
      )
    ).toBe(true);
  });

  it('Independent remains Independent', () => {
    expect(normalizeCfbdConferenceForV1('Independent')).toBe('Independent');
  });

  it('recognized provider conferences remain unchanged', () => {
    expect(normalizeCfbdConferenceForV1('Mid-American')).toBe('Mid-American');
    expect(normalizeCfbdConferenceForV1('Conference USA')).toBe(
      'Conference USA'
    );
    expect(normalizeCfbdConferenceForV1('Mountain West')).toBe('Mountain West');
    expect(normalizeCfbdConferenceForV1('Pac-12')).toBe('Pac-12');
    expect(isRecognizedV1Conference('Mid-American')).toBe(true);
    expect(isRecognizedV1Conference('Conference USA')).toBe(true);
    expect(isRecognizedV1Conference('Mountain West')).toBe(true);
    expect(isRecognizedV1Conference('Pac-12')).toBe(true);
  });

  it('unknown conference still flagged', () => {
    expect(normalizeCfbdConferenceForV1('WAC')).toBe('WAC');
    expect(isRecognizedV1Conference(normalizeCfbdConferenceForV1('WAC'))).toBe(
      false
    );
  });
});
