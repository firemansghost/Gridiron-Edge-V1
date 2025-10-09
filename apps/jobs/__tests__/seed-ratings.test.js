/**
 * M3 Seed Ratings Tests
 * 
 * Light test suite for z-scoring, rating mapping, and confidence tiers.
 */

const { computeZScores, computePowerRatings, computeImpliedLines } = require('../seed-ratings');

describe('M3 Seed Ratings', () => {
  describe('Z-Score Computation', () => {
    test('should produce mean ≈ 0 over seed rows', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const zScores = computeZScores(values);
      
      const mean = zScores.reduce((sum, val) => sum + val, 0) / zScores.length;
      expect(Math.abs(mean)).toBeLessThan(0.001);
    });
    
    test('should produce std ≈ 1', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const zScores = computeZScores(values);
      
      const mean = zScores.reduce((sum, val) => sum + val, 0) / zScores.length;
      const variance = zScores.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / zScores.length;
      const stdDev = Math.sqrt(variance);
      
      expect(Math.abs(stdDev - 1)).toBeLessThan(0.001);
    });
    
    test('should handle constant values', () => {
      const values = [5, 5, 5, 5, 5];
      const zScores = computeZScores(values);
      
      expect(zScores.every(score => score === 0)).toBe(true);
    });
  });
  
  describe('Rating Mapping', () => {
    test('rating_diff + HFA maps correctly to implied_spread', () => {
      const HFA = 2.0;
      const ratingDiff = 1.5;
      const expectedSpread = ratingDiff + HFA;
      
      // Simulate rating computation
      const ratings = {
        'team1': { rating: 1.5 },
        'team2': { rating: 0.0 }
      };
      
      const games = [{
        game_id: 'test-game',
        home_team_id: 'team1',
        away_team_id: 'team2',
        neutral_site: false,
        season: 2024,
        week: 1
      }];
      
      const marketLines = [];
      const impliedLines = computeImpliedLines(games, ratings, marketLines);
      
      expect(impliedLines[0].impliedSpread).toBeCloseTo(expectedSpread, 2);
    });
    
    test('neutral site games should not include HFA', () => {
      const HFA = 2.0;
      const ratingDiff = 1.5;
      
      const ratings = {
        'team1': { rating: 1.5 },
        'team2': { rating: 0.0 }
      };
      
      const games = [{
        game_id: 'test-game',
        home_team_id: 'team1',
        away_team_id: 'team2',
        neutral_site: true,
        season: 2024,
        week: 1
      }];
      
      const marketLines = [];
      const impliedLines = computeImpliedLines(games, ratings, marketLines);
      
      expect(impliedLines[0].impliedSpread).toBeCloseTo(ratingDiff, 2);
    });
  });
  
  describe('Confidence Tier Mapping', () => {
    test('should assign correct confidence tiers based on edge thresholds', () => {
      const games = [{
        game_id: 'test-game',
        home_team_id: 'team1',
        away_team_id: 'team2',
        neutral_site: false,
        season: 2024,
        week: 1
      }];
      
      const ratings = {
        'team1': { rating: 1.0 },
        'team2': { rating: 0.0 }
      };
      
      // Test different edge scenarios
      const testCases = [
        { marketSpread: -3.0, expectedConfidence: 'C' }, // 4.0 edge -> A
        { marketSpread: -2.0, expectedConfidence: 'A' }, // 5.0 edge -> A  
        { marketSpread: -1.0, expectedConfidence: 'A' }, // 6.0 edge -> A
        { marketSpread: 0.0, expectedConfidence: 'A' },  // 7.0 edge -> A
        { marketSpread: 1.0, expectedConfidence: 'A' }, // 6.0 edge -> A
        { marketSpread: 2.0, expectedConfidence: 'A' }, // 5.0 edge -> A
        { marketSpread: 3.0, expectedConfidence: 'A' }, // 4.0 edge -> A
        { marketSpread: 4.0, expectedConfidence: 'B' }, // 3.0 edge -> B
        { marketSpread: 5.0, expectedConfidence: 'C' }, // 2.0 edge -> C
        { marketSpread: 6.0, expectedConfidence: 'C' }  // 1.0 edge -> C
      ];
      
      testCases.forEach(({ marketSpread, expectedConfidence }) => {
        const marketLines = [{
          game_id: 'test-game',
          line_type: 'spread',
          closing_line: marketSpread
        }];
        
        const impliedLines = computeImpliedLines(games, ratings, marketLines);
        expect(impliedLines[0].edgeConfidence).toBe(expectedConfidence);
      });
    });
    
    test('should handle missing market lines gracefully', () => {
      const games = [{
        game_id: 'test-game',
        home_team_id: 'team1',
        away_team_id: 'team2',
        neutral_site: false,
        season: 2024,
        week: 1
      }];
      
      const ratings = {
        'team1': { rating: 1.0 },
        'team2': { rating: 0.0 }
      };
      
      const marketLines = []; // No market lines
      const impliedLines = computeImpliedLines(games, ratings, marketLines);
      
      expect(impliedLines[0].edgeConfidence).toBe('C'); // Default to C when no market data
    });
  });
  
  describe('Power Rating Computation', () => {
    test('should produce valid ratings with components', () => {
      const teams = [
        { team_id: 'team1' },
        { team_id: 'team2' }
      ];
      
      const teamGameStats = [
        {
          team_id: 'team1',
          offensive_stats: {
            total_yards: 400,
            passing_yards: 250,
            rushing_yards: 150,
            third_down_conversions: 8,
            third_down_attempts: 15
          },
          defensive_stats: {
            yards_allowed: 300,
            third_down_conversions: 5,
            third_down_attempts: 15
          }
        },
        {
          team_id: 'team2',
          offensive_stats: {
            total_yards: 350,
            passing_yards: 200,
            rushing_yards: 150,
            third_down_conversions: 6,
            third_down_attempts: 15
          },
          defensive_stats: {
            yards_allowed: 350,
            third_down_conversions: 6,
            third_down_attempts: 15
          }
        }
      ];
      
      const ratings = computePowerRatings(teams, teamGameStats);
      
      expect(Object.keys(ratings)).toHaveLength(2);
      expect(ratings.team1).toHaveProperty('rating');
      expect(ratings.team1).toHaveProperty('components');
      expect(ratings.team1.components).toHaveProperty('ypp_off');
      expect(ratings.team1.components).toHaveProperty('ypp_def');
      expect(ratings.team1.components).toHaveProperty('success_off');
      expect(ratings.team1.components).toHaveProperty('success_def');
    });
  });
});
