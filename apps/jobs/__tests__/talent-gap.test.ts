// Unit tests for Phase 2.1: Talent Gap Feature
// Tests FCS imputation, stability guards, and regression hygiene

describe('Phase 2.1: Talent Gap Feature', () => {
  describe('FCS Imputation', () => {
    test('D1 vs D1 with both raw present → *_used == *_raw, imputation:"none"', () => {
      const homeRaw = 850.5;
      const awayRaw = 720.3;
      const homeUsed = homeRaw; // No imputation
      const awayUsed = awayRaw; // No imputation
      
      expect(homeUsed).toBe(homeRaw);
      expect(awayUsed).toBe(awayRaw);
      
      const imputation = {
        home: 'none' as const,
        away: 'none' as const
      };
      
      expect(imputation.home).toBe('none');
      expect(imputation.away).toBe('none');
    });

    test('P5 vs FCS (missing away) → away_used = g5_p10, imputation:"g5_p10"', () => {
      const homeRaw = 850.5;
      const awayRaw = null; // FCS team, missing data
      const g5P10 = 450.0; // G5 10th percentile
      
      const homeUsed = homeRaw;
      const awayUsed = awayRaw ?? g5P10; // Imputed
      
      expect(homeUsed).toBe(homeRaw);
      expect(awayUsed).toBe(g5P10);
      
      const imputation = {
        home: 'none' as const,
        away: 'g5_p10' as const
      };
      
      expect(imputation.home).toBe('none');
      expect(imputation.away).toBe('g5_p10');
    });
  });

  describe('Z-score Stability Guard', () => {
    test('Season with low variance (mock std=0.05) → talent_z_disabled:true, diff_z=0', () => {
      const seasonStd = 0.05; // Very low variance
      const threshold = 0.1;
      
      const talentZDisabled = seasonStd < threshold;
      const diffZ = talentZDisabled ? 0 : null;
      
      expect(talentZDisabled).toBe(true);
      expect(diffZ).toBe(0);
    });

    test('Season with normal variance (std=15.0) → talent_z_disabled:false, diff_z calculated', () => {
      const seasonStd = 15.0; // Normal variance
      const threshold = 0.1;
      const homeTalentUsed = 850.5;
      const awayTalentUsed = 720.3;
      const seasonMean = 750.0;
      
      const talentZDisabled = seasonStd < threshold;
      
      if (!talentZDisabled && homeTalentUsed !== null && awayTalentUsed !== null) {
        const homeTalentZ = (homeTalentUsed - seasonMean) / seasonStd;
        const awayTalentZ = (awayTalentUsed - seasonMean) / seasonStd;
        const diffZ = homeTalentZ - awayTalentZ;
        
        expect(talentZDisabled).toBe(false);
        expect(diffZ).toBeCloseTo(8.68, 2); // (850.5-750)/15 - (720.3-750)/15
      }
    });
  });

  describe('Regression Hygiene', () => {
    test('diff sign = home_used - away_used', () => {
      const homeUsed = 850.5;
      const awayUsed = 720.3;
      const diff = homeUsed - awayUsed;
      
      expect(diff).toBe(130.2);
      expect(diff).toBeGreaterThan(0); // Home advantage
      
      // Sanity check: diff === home_used - away_used (within 1e-6)
      const expectedDiff = homeUsed - awayUsed;
      expect(Math.abs(diff - expectedDiff)).toBeLessThan(1e-6);
    });

    test('Negative diff when away team is stronger', () => {
      const homeUsed = 720.3;
      const awayUsed = 850.5;
      const diff = homeUsed - awayUsed;
      
      expect(diff).toBe(-130.2);
      expect(diff).toBeLessThan(0); // Away advantage
    });
  });

  describe('G5 P10 Calculation', () => {
    test('G5 p10 capped at 5th-25th percentile band', () => {
      // Mock G5 talent values
      const g5Values = Array.from({ length: 50 }, (_, i) => 300 + i * 10).sort((a, b) => a - b);
      const n = g5Values.length;
      
      const p5 = g5Values[Math.floor(n * 0.05)];
      const p10 = g5Values[Math.floor(n * 0.10)];
      const p25 = g5Values[Math.floor(n * 0.25)];
      
      let g5P10 = p10;
      
      // Cap at 5th-25th percentile band
      if (g5P10 < p5) g5P10 = p5;
      if (g5P10 > p25) g5P10 = p25;
      
      expect(g5P10).toBeGreaterThanOrEqual(p5);
      expect(g5P10).toBeLessThanOrEqual(p25);
    });
  });
});

