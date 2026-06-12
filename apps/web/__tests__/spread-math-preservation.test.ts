/**
 * Golden fixture tests locking current Core V1 OLS and Hybrid V2 blend math.
 * Do not change expected values unless model coefficients are intentionally recalibrated.
 */

import { computeCoreV1Spread, computeEffectiveHfa } from '@/lib/core-v1-spread';
import {
  calculateHybridSpread,
  calculateV1Spread,
  calculateV2Spread,
} from '@/lib/core-v2-spread';

const ZERO_GRADES = {
  offRunGrade: 0,
  defRunGrade: 0,
  offPassGrade: 0,
  defPassGrade: 0,
  offExplosiveness: 0,
  defExplosiveness: 0,
};

describe('Core V1 spread math preservation', () => {
  it('computeCoreV1Spread matches calibrated OLS coefficients (golden fixture)', () => {
    const ratingDiffBlend = 3.0;
    const hfaPoints = 2.5;
    const spreadHma = computeCoreV1Spread(ratingDiffBlend, hfaPoints);
    // beta0 + betaRatingDiff * 3.0 + betaHfa * 2.5 (betaHfa=0 in current coeffs)
    expect(spreadHma).toBeCloseTo(6.104612810987456, 10);
  });

  it('computeCoreV1Spread returns neutral-site spread when hfa is zero', () => {
    const spreadHma = computeCoreV1Spread(1.5, 0);
    expect(spreadHma).toBeCloseTo(2.794592813618502, 10);
  });

  it('computeEffectiveHfa is zero on neutral site', () => {
    const hfa = computeEffectiveHfa('any-team', true);
    expect(hfa.effectiveHfa).toBe(0);
    expect(hfa.teamAdjustment).toBe(0);
  });
});

describe('Hybrid V2 spread math preservation', () => {
  it('calculateV1Spread uses rating diff plus HFA', () => {
    expect(calculateV1Spread(5, 0, false)).toBeCloseTo(7.5, 10);
    expect(calculateV1Spread(5, 0, true)).toBeCloseTo(5, 10);
  });

  it('calculateV2Spread with zero grades yields HFA-only spread', () => {
    expect(calculateV2Spread(ZERO_GRADES, ZERO_GRADES, false)).toBeCloseTo(2.5, 10);
    expect(calculateV2Spread(ZERO_GRADES, ZERO_GRADES, true)).toBeCloseTo(0, 10);
  });

  it('calculateHybridSpread blends 70% V1 and 30% V2 (golden fixture)', () => {
    const result = calculateHybridSpread(
      5,
      0,
      ZERO_GRADES,
      ZERO_GRADES,
      false,
      'home-team',
      'away-team',
      null
    );

    expect(result.v1SpreadHma).toBeCloseTo(7.5, 10);
    expect(result.v2SpreadHma).toBeCloseTo(2.5, 10);
    expect(result.hybridSpreadHma).toBeCloseTo(6.0, 10);
    expect(result.favoriteTeamId).toBe('home-team');
    expect(result.dogTeamId).toBe('away-team');
    expect(result.hybridFavoriteSpread).toBeCloseTo(-6.0, 10);
  });

  it('calculateHybridSpread favors away when hybrid HMA is negative (golden fixture)', () => {
    const result = calculateHybridSpread(
      0,
      8,
      ZERO_GRADES,
      ZERO_GRADES,
      true,
      'home-team',
      'away-team',
      null
    );

    // Neutral site: V1 = 0 - 8 = -8; V2 = 0; hybrid = 0.7 * -8 + 0.3 * 0
    expect(result.v1SpreadHma).toBeCloseTo(-8, 10);
    expect(result.v2SpreadHma).toBeCloseTo(0, 10);
    expect(result.hybridSpreadHma).toBeCloseTo(-5.6, 10);
    expect(result.favoriteTeamId).toBe('away-team');
    expect(result.dogTeamId).toBe('home-team');
    expect(result.hybridFavoriteSpread).toBeCloseTo(-5.6, 10);
  });
});
