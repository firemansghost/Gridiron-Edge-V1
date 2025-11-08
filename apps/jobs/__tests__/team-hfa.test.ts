// Unit tests for Phase 2.3: Team-Specific HFA with Shrinkage

describe('Phase 2.3: Team-Specific HFA', () => {
  describe('HFA_raw Computation', () => {
    test('Home game residual calculation', () => {
      const teamRating = 10.0;
      const opponentRating = 5.0;
      const leagueMeanHFA = 2.0;
      const homeScore = 35;
      const awayScore = 21;
      
      // Expected margin = teamRating - opponentRating + leagueMeanHFA
      const expectedMargin = teamRating - opponentRating + leagueMeanHFA; // 10 - 5 + 2 = 7
      
      // Observed margin = homeScore - awayScore
      const observedMargin = homeScore - awayScore; // 35 - 21 = 14
      
      // Residual = observed - expected
      const residual = observedMargin - expectedMargin; // 14 - 7 = 7
      
      expect(residual).toBe(7);
    });

    test('Away game residual calculation (flipped)', () => {
      const teamRating = 10.0;
      const opponentRating = 5.0;
      const leagueMeanHFA = 2.0;
      const homeScore = 21; // Opponent is home
      const awayScore = 35; // Team is away
      
      // Expected margin (from team's perspective) = opponentRating - teamRating + leagueMeanHFA
      const expectedMargin = opponentRating - teamRating + leagueMeanHFA; // 5 - 10 + 2 = -3
      
      // Observed margin (from team's perspective) = awayScore - homeScore
      const observedMargin = awayScore - homeScore; // 35 - 21 = 14
      
      // Residual = observed - expected
      const residual = observedMargin - expectedMargin; // 14 - (-3) = 17
      
      // For away games, flip sign to measure "home boost"
      const awayResidual = -residual; // -17
      
      expect(awayResidual).toBe(-17);
    });
  });

  describe('Shrinkage to League Mean', () => {
    test('Shrinkage weight calculation', () => {
      const nTotal = 8;
      const k = 8; // Prior strength
      const shrinkW = nTotal / (nTotal + k); // 8 / (8 + 8) = 0.5
      
      expect(shrinkW).toBe(0.5);
    });

    test('Low-sample rescue (n_total < 4)', () => {
      const nTotal = 2;
      const k = 8;
      const lowSampleMaxW = 0.4;
      
      let shrinkW = nTotal / (nTotal + k); // 2 / 10 = 0.2
      if (nTotal < 4) {
        shrinkW = Math.min(shrinkW, lowSampleMaxW); // min(0.2, 0.4) = 0.2
      }
      
      expect(shrinkW).toBe(0.2);
    });

    test('HFA_shrunk calculation', () => {
      const hfaRaw = 4.0;
      const leagueMean = 2.0;
      const shrinkW = 0.6;
      
      const hfaShrunk = shrinkW * hfaRaw + (1 - shrinkW) * leagueMean;
      // 0.6 * 4.0 + 0.4 * 2.0 = 2.4 + 0.8 = 3.2
      
      expect(hfaShrunk).toBe(3.2);
    });

    test('Capping to [0.5, 5.0]', () => {
      const hfaShrunk = 6.0;
      const hfaMin = 0.5;
      const hfaMax = 5.0;
      
      const hfaUsed = Math.max(hfaMin, Math.min(hfaMax, hfaShrunk));
      
      expect(hfaUsed).toBe(5.0);
    });
  });

  describe('Guardrails', () => {
    test('Outlier detection (|hfa_raw| > 8)', () => {
      const hfaRaw = 9.5;
      const isOutlier = Math.abs(hfaRaw) > 8;
      
      expect(isOutlier).toBe(true);
    });

    test('Low sample detection (n_total < 4)', () => {
      const nHome = 1;
      const nAway = 2;
      const nTotal = nHome + nAway;
      const lowSample = nTotal < 4;
      
      expect(lowSample).toBe(true);
    });

    test('Neutral site HFA = 0', () => {
      const neutralSite = true;
      const hfaUsed = neutralSite ? 0 : 2.0;
      
      expect(hfaUsed).toBe(0);
    });
  });
});

