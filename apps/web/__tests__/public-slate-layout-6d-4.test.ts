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
  scrollSlateTargetIntoView,
} from '@/lib/slate-table-scroll';

const webRoot = path.join(__dirname, '..');

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
