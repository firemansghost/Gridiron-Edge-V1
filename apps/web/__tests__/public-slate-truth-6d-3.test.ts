/**
 * Phase 2C-2J-6D-3 — Public slate truth + UX cleanup.
 * Source/static + pure helper checks only (no provider / DB).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  formatSlateStatusLabel,
  summarizeSlateStatus,
} from '@/lib/slate-status-summary';
import {
  formatMarketSnapshotLabel,
  newestDisplayedMarketTimestamp,
  summarizeMarketSnapshotFreshness,
} from '@/lib/market-snapshot-freshness';
import {
  formatTeamIdFallback,
  resolveTeamDisplayName,
} from '@/lib/team-display-name';
import { computeSlateSpreadTierSummary } from '@/lib/config/slate-model';

const webRoot = path.join(__dirname, '..');

describe('slate status summary (Game.status)', () => {
  it('0 final / all upcoming', () => {
    const s = summarizeSlateStatus([
      { status: 'scheduled' },
      { status: 'scheduled' },
    ]);
    expect(s).toEqual({
      total: 2,
      final: 0,
      inProgress: 0,
      scheduled: 2,
      allFinal: false,
    });
    expect(formatSlateStatusLabel(s)).toBe('2 Upcoming');
  });

  it('mixed final + upcoming', () => {
    const s = summarizeSlateStatus([
      { status: 'final' },
      { status: 'final' },
      { status: 'scheduled' },
      { status: 'scheduled' },
      { status: 'scheduled' },
    ]);
    expect(s.final).toBe(2);
    expect(s.scheduled).toBe(3);
    expect(s.allFinal).toBe(false);
    expect(formatSlateStatusLabel(s)).toBe('2 Final · 3 Upcoming');
  });

  it('live + final + upcoming', () => {
    const s = summarizeSlateStatus([
      { status: 'in_progress' },
      { status: 'in_progress' },
      { status: 'final' },
      { status: 'scheduled' },
    ]);
    expect(formatSlateStatusLabel(s)).toBe('2 Live · 1 Final · 1 Upcoming');
    expect(s.allFinal).toBe(false);
  });

  it('all final → standalone Final', () => {
    const s = summarizeSlateStatus([
      { status: 'final' },
      { status: 'final' },
    ]);
    expect(s.allFinal).toBe(true);
    expect(formatSlateStatusLabel(s)).toBe('Final');
  });

  it('empty slate', () => {
    const s = summarizeSlateStatus([]);
    expect(s.total).toBe(0);
    expect(s.allFinal).toBe(false);
    expect(formatSlateStatusLabel(s)).toBeNull();
  });

  it('does not treat scores as final without status', () => {
    const s = summarizeSlateStatus([{ status: 'scheduled' }]);
    expect(s.final).toBe(0);
    expect(s.allFinal).toBe(false);
  });
});

describe('market snapshot freshness', () => {
  it('handles empty timestamps', () => {
    expect(newestDisplayedMarketTimestamp([])).toBeNull();
    expect(newestDisplayedMarketTimestamp([{ closingSpread: null }])).toBeNull();
    expect(formatMarketSnapshotLabel(null)).toBe('Market snapshot unavailable');
    expect(summarizeMarketSnapshotFreshness([]).label).toBe(
      'Market snapshot unavailable'
    );
  });

  it('uses newest displayed market timestamp', () => {
    const newer = '2026-08-29T15:42:00.000Z';
    const older = '2026-08-28T10:00:00.000Z';
    const games = [
      { closingSpread: { timestamp: older }, closingTotal: null },
      { closingSpread: { timestamp: newer }, closingTotal: { timestamp: older } },
    ];
    expect(newestDisplayedMarketTimestamp(games)).toBe(newer);
    const now = new Date('2026-08-30T15:42:00.000Z');
    expect(formatMarketSnapshotLabel(newer, now)).toContain(
      'Newest displayed market snapshot:'
    );
  });
});

describe('canonical team display names', () => {
  it('prefers API names for TCU / USC / NC State', () => {
    expect(resolveTeamDisplayName('TCU', 'tcu')).toBe('TCU');
    expect(resolveTeamDisplayName('USC', 'usc')).toBe('USC');
    expect(resolveTeamDisplayName('NC State', 'nc-state')).toBe('NC State');
  });

  it('falls back to formatted id when name missing', () => {
    expect(resolveTeamDisplayName(undefined, 'nc-state')).toBe('Nc State');
    expect(formatTeamIdFallback('ohio-state')).toBe('Ohio State');
  });
});

describe('spread tier summary (not game.confidence)', () => {
  it('counts picks.spread.grade only', () => {
    const summary = computeSlateSpreadTierSummary([
      { picks: { spread: { grade: 'A' } }, confidence: 'C' } as any,
      { picks: { spread: { grade: 'B' } }, confidence: 'A' } as any,
      { picks: { spread: { grade: null } }, confidence: 'A' } as any,
      { picks: {}, confidence: 'A' } as any,
    ]);
    expect(summary.totalGames).toBe(4);
    expect(summary.spreadTier).toEqual({ A: 1, B: 1, C: 0 });
  });
});

describe('homepage / selector / footer public truth (static)', () => {
  const home = fs.readFileSync(path.join(webRoot, 'app/page.tsx'), 'utf8');
  const selector = fs.readFileSync(
    path.join(webRoot, 'components/ProductionModelSelector.tsx'),
    'utf8'
  );
  const toggle = fs.readFileSync(
    path.join(webRoot, 'components/ModelViewModeToggle.tsx'),
    'utf8'
  );
  const slateTable = fs.readFileSync(
    path.join(webRoot, 'components/SlateTable.tsx'),
    'utf8'
  );
  const footer = fs.readFileSync(
    path.join(webRoot, 'components/Footer.tsx'),
    'utf8'
  );

  it('held Hybrid does not visually appear as effective live model', () => {
    expect(selector).toContain('effectiveModel');
    expect(selector).toContain('heldModelIds');
    expect(selector).toContain("suffix = 'HELD'");
    expect(selector).toContain("suffix = 'LIVE'");
    expect(selector).toContain('aria-pressed={isEffective}');
    expect(selector).toContain('disabled={isHeld}');
    expect(selector).not.toMatch(/aria-pressed=\{model === option\.id\}/);
  });

  it('homepage wires effective Core LIVE + Hybrid HELD during hold', () => {
    expect(home).toContain('effectiveModel={slate ? effectiveModel : null}');
    expect(home).toContain("heldModelIds={heldModelIds}");
    expect(home).toContain("hybridHeld ? ['hybrid_v2'] : []");
    expect(home).toContain('Core V1 production spread');
    expect(home).toContain('Hybrid V2 held');
  });

  it('selector preserves preference when held (no silent rewrite)', () => {
    expect(selector).toContain('if (isHeld) return');
    expect(selector).not.toContain('setModel(effectiveModel');
    expect(selector).toContain('preference retained');
  });

  it('week Final uses status summary helper, not score presence alone', () => {
    expect(home).toContain('summarizeSlateStatus');
    expect(home).toContain('formatSlateStatusLabel');
    expect(home).not.toMatch(
      /games\?\.some\(game => game\.homeScore !== null && game\.awayScore !== null\)/
    );
  });

  it('Production view label replaces Official picks', () => {
    expect(toggle).toContain('Production view');
    expect(toggle).toContain('Raw model');
    expect(toggle).not.toContain('Official picks');
    expect(toggle).toContain('aria-label="Production view"');
    expect(toggle).toContain('not the locked Official Card');
  });

  it('no public Max Edge mixed-unit presentation', () => {
    expect(slateTable).not.toContain('>Max<');
    expect(slateTable).not.toMatch(/Max Edge/);
    expect(slateTable).not.toContain('The larger of spread edge or total edge');
    expect(home).not.toContain('Max Edge');
  });

  it('homepage summary uses spread grade, not game.confidence', () => {
    expect(home).toContain('computeSlateSpreadTierSummary');
    expect(home).toContain('Spread Tier A');
    expect(home).toContain('Spread Tier B');
    expect(home).toContain('Spread Tier C');
    expect(home).not.toContain('computeSlateConfidenceSummary');
    expect(home).not.toContain('High Confidence (A)');
  });

  it('spread filter/sort uses spread edge helpers', () => {
    expect(slateTable).toContain('Min Spread Edge');
    expect(slateTable).toContain('Spread Tier');
    expect(slateTable).toContain('resolveSpreadEdgePts');
    expect(slateTable).toContain('resolveSpreadGrade');
    expect(slateTable).toContain('Spread Edge (High to Low)');
  });

  it('canonical team names used for matchup/search', () => {
    expect(slateTable).toContain('resolveTeamDisplayName');
    expect(slateTable).toContain('awayTeamName');
    expect(slateTable).toContain('homeTeamName');
  });

  it('market freshness helper wired on homepage', () => {
    expect(home).toContain('summarizeMarketSnapshotFreshness');
    expect(home).toContain('marketFreshness.label');
  });

  it('2025 historical link remains exact; stale offseason copy absent', () => {
    expect(home).toContain('href="/labs/portfolio?season=2025"');
    expect(home).toContain('2025 results &amp; Labs what-ifs');
    expect(home).not.toContain('Season Update (Dec 22, 2025)');
    expect(home).not.toContain('will be back for the 2026 season');
    expect(home).not.toContain('Offseason plan:');
  });

  it('footer no longer states universal fixed +2.0 HFA', () => {
    expect(footer).toContain('Current production spread: Core V1');
    expect(footer).toContain('HFA: team-adjusted; neutral sites = 0');
    expect(footer).toContain('Market tiers are market-specific');
    expect(footer).not.toContain('Home Field Advantage: +2.0 pts');
    expect(footer).not.toContain('Confidence Tiers: A (≥4.0)');
  });

  it('page no longer claims all market tiers share the same point scale', () => {
    expect(home).toContain(
      'Spread and total edges are measured in points. Moneyline value is a probability/'
    );
    expect(home).toContain('The summary below reflects spread');
    expect(home).not.toContain('High (A) ≥ 4.0 pts');
    expect(home).not.toContain('Medium (B) ≥ 3.0 pts');
    expect(home).not.toContain('Low (C) ≥ 2.0 pts');
    expect(home).not.toContain('Quick Actions');
  });
});
