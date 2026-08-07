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
