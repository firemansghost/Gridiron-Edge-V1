// Unit tests for Phase 2.2: Matchup Class Feature
// Tests classification rules, season awareness, and transitional edge cases

describe('Phase 2.2: Matchup Class Feature', () => {
  describe('Classification Rules', () => {
    test('P5 vs P5 → P5_P5', () => {
      const homeTier = 'P5';
      const awayTier = 'P5';
      const matchupClass = getMatchupClass(homeTier, awayTier);
      expect(matchupClass).toBe('P5_P5');
    });

    test('P5 vs G5 → P5_G5', () => {
      const homeTier = 'P5';
      const awayTier = 'G5';
      const matchupClass = getMatchupClass(homeTier, awayTier);
      expect(matchupClass).toBe('P5_G5');
    });

    test('P5 vs FCS → P5_FCS', () => {
      const homeTier = 'P5';
      const awayTier = 'FCS';
      const matchupClass = getMatchupClass(homeTier, awayTier);
      expect(matchupClass).toBe('P5_FCS');
    });

    test('G5 vs G5 → G5_G5', () => {
      const homeTier = 'G5';
      const awayTier = 'G5';
      const matchupClass = getMatchupClass(homeTier, awayTier);
      expect(matchupClass).toBe('G5_G5');
    });

    test('G5 vs FCS → G5_FCS', () => {
      const homeTier = 'G5';
      const awayTier = 'FCS';
      const matchupClass = getMatchupClass(homeTier, awayTier);
      expect(matchupClass).toBe('G5_FCS');
    });

    test('Order independence: G5 vs P5 → P5_G5', () => {
      const homeTier = 'G5';
      const awayTier = 'P5';
      const matchupClass = getMatchupClass(homeTier, awayTier);
      expect(matchupClass).toBe('P5_G5'); // Higher tier first
    });
  });

  describe('Tier Classification', () => {
    test('Notre Dame → P5 (independent)', () => {
      const teamId = 'notre-dame';
      const membership = { level: 'fbs' };
      const conference = null; // Independent
      const tier = classifyTeamTier(teamId, membership, conference);
      expect(tier).toBe('P5');
    });

    test('Other independent → G5', () => {
      const teamId = 'army';
      const membership = { level: 'fbs' };
      const conference = null; // Independent
      const tier = classifyTeamTier(teamId, membership, conference);
      expect(tier).toBe('G5');
    });

    test('FCS membership → FCS', () => {
      const teamId = 'some-fcs-team';
      const membership = { level: 'fcs' };
      const conference = 'FCS Conference';
      const tier = classifyTeamTier(teamId, membership, conference);
      expect(tier).toBe('FCS');
    });

    test('P5 conference → P5', () => {
      const teamId = 'alabama';
      const membership = { level: 'fbs' };
      const conference = 'SEC';
      const tier = classifyTeamTier(teamId, membership, conference);
      expect(tier).toBe('P5');
    });

    test('G5 conference → G5', () => {
      const teamId = 'boise-state';
      const membership = { level: 'fbs' };
      const conference = 'Mountain West';
      const tier = classifyTeamTier(teamId, membership, conference);
      expect(tier).toBe('G5');
    });
  });

  describe('Transitional Edge Cases', () => {
    test('2025 FBS entrant (e.g., Delaware) → correct tier based on conference', () => {
      // Simulate a team transitioning from FCS to FBS in 2025
      const teamId = 'delaware';
      const membership2024 = { level: 'fcs' };
      const membership2025 = { level: 'fbs' };
      const conference = 'C-USA'; // G5 conference
      
      const tier2024 = classifyTeamTier(teamId, membership2024, conference);
      const tier2025 = classifyTeamTier(teamId, membership2025, conference);
      
      expect(tier2024).toBe('FCS');
      expect(tier2025).toBe('G5'); // Based on conference, not just membership
    });
  });
});

// Helper functions (matching API implementation)
type MatchupClass = 'P5_P5' | 'P5_G5' | 'P5_FCS' | 'G5_G5' | 'G5_FCS';

function getMatchupClass(home: 'P5' | 'G5' | 'FCS', away: 'P5' | 'G5' | 'FCS'): MatchupClass {
  const tierOrder = { P5: 3, G5: 2, FCS: 1 };
  const [higher, lower] = tierOrder[home] >= tierOrder[away] 
    ? [home, away] 
    : [away, home];
  
  if (higher === 'P5' && lower === 'P5') return 'P5_P5';
  if (higher === 'P5' && lower === 'G5') return 'P5_G5';
  if (higher === 'P5' && lower === 'FCS') return 'P5_FCS';
  if (higher === 'G5' && lower === 'G5') return 'G5_G5';
  if (higher === 'G5' && lower === 'FCS') return 'G5_FCS';
  
  return 'P5_P5';
}

function classifyTeamTier(
  teamId: string,
  membership: { level: string } | null,
  conference: string | null
): 'P5' | 'G5' | 'FCS' {
  const P5_CONFERENCES = new Set([
    'ACC', 'Big Ten', 'B1G', 'Big 12', 'SEC', 'Pac-12', 'Pac-10'
  ]);
  
  const G5_CONFERENCES = new Set([
    'American Athletic', 'AAC', 'Mountain West', 'MWC', 'Sun Belt',
    'Mid-American', 'MAC', 'Conference USA', 'C-USA'
  ]);

  if (membership?.level === 'fcs') {
    return 'FCS';
  }
  
  if (teamId === 'notre-dame') {
    return 'P5';
  }
  
  if (conference && P5_CONFERENCES.has(conference)) {
    return 'P5';
  }
  
  if (conference && G5_CONFERENCES.has(conference)) {
    return 'G5';
  }
  
  if (membership?.level === 'fbs') {
    return 'G5';
  }
  
  return 'FCS';
}

