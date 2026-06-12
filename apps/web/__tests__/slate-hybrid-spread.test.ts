import {
  deriveHybridConflictType,
  deriveHybridSpreadSide,
  deriveHybridTierFields,
  tryComputeHybridSpreadHma,
} from '@/lib/slate-hybrid-spread';

const ZERO_GRADES = {
  offRunGrade: 0,
  defRunGrade: 0,
  offPassGrade: 0,
  defPassGrade: 0,
  offExplosiveness: 0,
  defExplosiveness: 0,
};

describe('slate-hybrid-spread helpers', () => {
  it('computes hybrid spread HMA from ratings and grades', () => {
    const hma = tryComputeHybridSpreadHma(
      {
        homeRating: 5,
        awayRating: 0,
        homeGrades: ZERO_GRADES,
        awayGrades: ZERO_GRADES,
      },
      false,
      'home-team',
      'away-team'
    );
    expect(hma).toBeCloseTo(6.0, 5);
  });

  it('returns null when hybrid inputs are missing', () => {
    expect(tryComputeHybridSpreadHma(null, false, 'home', 'away')).toBeNull();
  });

  it('derives hybrid_strong when hybrid and V4 disagree', () => {
    expect(deriveHybridConflictType('home', 'away')).toBe('hybrid_strong');
  });

  it('derives hybrid_weak when hybrid and V4 agree', () => {
    expect(deriveHybridConflictType('home', 'home')).toBe('hybrid_weak');
  });

  it('derives hybrid_only when no V4 bet exists', () => {
    expect(deriveHybridConflictType('away', null)).toBe('hybrid_only');
  });

  it('assigns super tier A for hybrid_strong with edge >= 4', () => {
    const tier = deriveHybridTierFields(4.2, 'hybrid_strong', -3.5);
    expect(tier.tierBucket).toBe('super_tier_a');
    expect(tier.isSuperTierA).toBe(true);
  });

  it('derives spread side from edge HMA', () => {
    expect(deriveHybridSpreadSide(1.5)).toBe('home');
    expect(deriveHybridSpreadSide(-2)).toBe('away');
    expect(deriveHybridSpreadSide(0)).toBeNull();
  });
});
