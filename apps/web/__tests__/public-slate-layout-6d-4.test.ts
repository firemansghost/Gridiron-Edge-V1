/**
 * Phase 2C-2J-6D-4 — Public Slate table layout + team display cleanup.
 * Source/static + pure helper checks (no provider / DB).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  formatTeamIdFallback,
  normalizePublicSlateAcronymTokens,
  resolveTeamDisplayName,
  stripTrailingMascotSuffix,
} from '@/lib/team-display-name';
import {
  prefersReducedMotionScrollBehavior,
  resolveActiveDateIndex,
  resolveAdjacentDateIndex,
  scrollSlateTargetIntoView,
} from '@/lib/slate-table-scroll';

const webRoot = path.join(__dirname, '..');

describe('date navigation index helpers', () => {
  const sixDates = [
    '2026-08-28',
    '2026-08-29',
    '2026-08-30',
    '2026-08-31',
    '2026-09-01',
    '2026-09-02',
  ];

  it('empty activeDate starts at index 0', () => {
    expect(resolveActiveDateIndex(sixDates, '')).toBe(0);
    expect(resolveActiveDateIndex(sixDates, null)).toBe(0);
    expect(resolveActiveDateIndex(sixDates, undefined)).toBe(0);
  });

  it('known activeDate resolves exact index', () => {
    expect(resolveActiveDateIndex(sixDates, sixDates[2])).toBe(2);
    expect(resolveActiveDateIndex(sixDates, sixDates[5])).toBe(5);
  });

  it('next/prev navigate sequentially and clamp at ends', () => {
    expect(resolveAdjacentDateIndex(sixDates, '', 'next')).toBe(1);
    expect(resolveAdjacentDateIndex(sixDates, sixDates[0], 'next')).toBe(1);
    expect(resolveAdjacentDateIndex(sixDates, sixDates[1], 'next')).toBe(2);
    expect(resolveAdjacentDateIndex(sixDates, sixDates[2], 'prev')).toBe(1);
    expect(resolveAdjacentDateIndex(sixDates, sixDates[1], 'prev')).toBe(0);
    expect(resolveAdjacentDateIndex(sixDates, sixDates[0], 'prev')).toBe(0);
    expect(resolveAdjacentDateIndex(sixDates, sixDates[5], 'next')).toBe(5);
  });

  it('empty date keys → -1', () => {
    expect(resolveActiveDateIndex([], 'x')).toBe(-1);
    expect(resolveAdjacentDateIndex([], '', 'next')).toBe(-1);
  });
});

describe('team display name — acronym + mascot strip (6D-4)', () => {
  it('normalizes Tcu / Usc / Nc State acronyms', () => {
    expect(resolveTeamDisplayName('Tcu', 'tcu')).toBe('TCU');
    expect(resolveTeamDisplayName('Usc', 'usc')).toBe('USC');
    expect(resolveTeamDisplayName('Nc State', 'nc-state')).toBe('NC State');
    expect(normalizePublicSlateAcronymTokens('Nc State')).toBe('NC State');
  });

  it('strips exact trailing mascot suffix', () => {
    expect(
      resolveTeamDisplayName('Eastern Michigan Eagles', 'eastern-michigan', 'Eagles')
    ).toBe('Eastern Michigan');
    expect(
      resolveTeamDisplayName('Florida State Seminoles', 'florida-state', 'Seminoles')
    ).toBe('Florida State');
    expect(stripTrailingMascotSuffix('Eastern Michigan Eagles', 'Eagles')).toBe(
      'Eastern Michigan'
    );
  });

  it('does not over-strip ordinary names without matching mascot', () => {
    expect(resolveTeamDisplayName('Ohio State', 'ohio-state', 'Buckeyes')).toBe(
      'Ohio State'
    );
    expect(resolveTeamDisplayName('Ole Miss', 'ole-miss', 'Rebels')).toBe('Ole Miss');
    expect(stripTrailingMascotSuffix('Michigan State', 'Spartans')).toBe(
      'Michigan State'
    );
  });

  it('missing canonical name uses ID fallback safely with acronyms', () => {
    expect(resolveTeamDisplayName(undefined, 'tcu')).toBe('TCU');
    expect(resolveTeamDisplayName('', 'usc')).toBe('USC');
    expect(resolveTeamDisplayName(null, 'nc-state')).toBe('NC State');
    expect(formatTeamIdFallback('ohio-state')).toBe('Ohio State');
  });

  it('normal non-acronym names unchanged', () => {
    expect(resolveTeamDisplayName('Alabama', 'alabama', 'Crimson Tide')).toBe(
      'Alabama'
    );
    expect(resolveTeamDisplayName('Clemson', 'clemson')).toBe('Clemson');
  });
});

describe('slate table scroll helpers', () => {
  it('exposes page-scroll IntoView helper (no scrollTop API)', () => {
    expect(typeof scrollSlateTargetIntoView).toBe('function');
    expect(typeof prefersReducedMotionScrollBehavior).toBe('function');
    const src = fs.readFileSync(
      path.join(webRoot, 'lib/slate-table-scroll.ts'),
      'utf8'
    );
    expect(src).toContain('scrollIntoView');
    expect(src).not.toContain('scrollTop');
  });
});

describe('SlateTable layout contracts (static)', () => {
  const slateTable = fs.readFileSync(
    path.join(webRoot, 'components/SlateTable.tsx'),
    'utf8'
  );
  const route = fs.readFileSync(
    path.join(webRoot, 'app/api/weeks/slate/route.ts'),
    'utf8'
  );

  it('no longer uses fixed 70vh / nested vertical overflow surface', () => {
    expect(slateTable).not.toContain('70vh');
    expect(slateTable).not.toContain("height: '70vh'");
    expect(slateTable).not.toContain('maxHeight: \'70vh\'');
    expect(slateTable).not.toContain('bodyScrollRef');
    expect(slateTable).not.toMatch(/overflow-auto[\s\S]{0,80}70vh/);
  });

  it('outer table root is not an overflow clipping ancestor for sticky page controls', () => {
    expect(slateTable).toContain(
      'ref={tableRootRef} className="bg-white rounded-lg shadow relative"'
    );
    expect(slateTable).not.toContain(
      'ref={tableRootRef} className="bg-white rounded-lg shadow overflow-hidden relative"'
    );
    expect(slateTable).toContain('sticky top-0');
    expect(slateTable).toContain('sticky top-[17px]');
    expect(slateTable).toContain('overflow-x-auto');
    expect(slateTable).not.toMatch(
      /data-slate-table-hscroll[\s\S]{0,120}overflow-(y-auto|y-scroll|auto)/
    );
  });

  it('visible prev/next arrows reuse navigateToDate (no always-0 index bug)', () => {
    expect(slateTable).toContain("onClick={() => navigateToDate('prev')}");
    expect(slateTable).toContain("onClick={() => navigateToDate('next')}");
    expect(slateTable).toContain('resolveActiveDateIndex');
    expect(slateTable).toContain('resolveAdjacentDateIndex');
    expect(slateTable).not.toContain('dateKey === dateEntries[0][0]');
  });

  it('keeps a horizontal overflow surface for wide/advanced tables', () => {
    expect(slateTable).toContain('overflow-x-auto');
    expect(slateTable).toContain('tableHScrollRef');
    expect(slateTable).toContain('data-slate-table-hscroll');
    expect(slateTable).toContain("minWidth: showAdvancedColumns ? '1400px'");
  });

  it('date/hash navigation uses scrollIntoView, not internal scrollTop', () => {
    expect(slateTable).toContain('scrollSlateTargetIntoView');
    expect(slateTable).toContain('scrollToDateKey');
    expect(slateTable).toContain('scrollToGameId');
    expect(slateTable).toContain('#date-');
    expect(slateTable).toContain('#game-');
    expect(slateTable).not.toMatch(/offsetTop\s*-\s*.*offsetTop/);
    expect(slateTable).not.toMatch(/\.scrollTo\(\{\s*top:/);
  });

  it('active date tracking uses IntersectionObserver (page-scroll safe)', () => {
    expect(slateTable).toContain('IntersectionObserver');
    expect(slateTable).toContain('data-date-key');
  });

  it('Matchup sticky left for horizontal scroll context', () => {
    expect(slateTable).toMatch(/sticky left-0/);
    expect(slateTable).toContain('Matchup');
  });

  it('preserves advanced localStorage preference key', () => {
    expect(slateTable).toContain("slateTable-showAdvanced");
  });

  it('renders all provided games (no pagination)', () => {
    expect(slateTable).toContain('dateData.games.map');
    expect(slateTable).not.toContain('pageSize');
    expect(slateTable).toMatch(/no lazy loading/i);
  });

  it('uses mascot-aware display names', () => {
    expect(slateTable).toContain('awayTeamMascot');
    expect(slateTable).toContain('homeTeamMascot');
    expect(slateTable).toContain('resolveTeamDisplayName');
    expect(route).toContain('mascot: true');
    expect(route).toContain('awayTeamMascot');
    expect(route).toContain('homeTeamMascot');
  });
});

describe('PR #79 public-truth regressions remain', () => {
  const home = fs.readFileSync(path.join(webRoot, 'app/page.tsx'), 'utf8');
  const toggle = fs.readFileSync(
    path.join(webRoot, 'components/ModelViewModeToggle.tsx'),
    'utf8'
  );
  const footer = fs.readFileSync(
    path.join(webRoot, 'components/Footer.tsx'),
    'utf8'
  );
  const slateTable = fs.readFileSync(
    path.join(webRoot, 'components/SlateTable.tsx'),
    'utf8'
  );

  it('keeps Hybrid hold authorization wiring and Production view labels', () => {
    expect(home).toContain('resolveHeldProductionModelIds');
    expect(home).toContain('Core V1 production spread');
    expect(home).toContain('Hybrid V2 held');
    expect(home).toContain('summarizeMarketSnapshotFreshness');
    expect(home).toContain('computeSlateSpreadTierSummary');
    expect(home).toContain('href="/labs/portfolio?season=2025"');
    expect(toggle).toContain('Production view');
    expect(toggle).not.toContain('Official picks');
    expect(slateTable).toContain('Min Spread Edge');
    expect(slateTable).not.toContain('Max Edge');
    expect(footer).toContain('team-adjusted; neutral sites = 0');
  });
});
