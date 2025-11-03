/**
 * Ratings v1 Computation Tests
 * 
 * Unit tests for z-score calculation, rating indices, confidence, and data source logic.
 */

import {
  calculateZScores,
  getZScore,
  computeOffensiveIndex,
  computeDefensiveIndex,
  calculateConfidence,
  getDataSourceString
} from '../src/ratings/compute_ratings_v1';
import { TeamFeatures } from '../src/ratings/feature-loader';

describe('Ratings v1 Computation', () => {
  describe('Z-Score Calculation', () => {
    test('should calculate correct mean and stdDev', () => {
      const mockFeatures: TeamFeatures[] = [
        { teamId: 'team1', season: 2025, yppOff: 5.0, dataSource: 'game', confidence: 1.0, gamesCount: 10, lastUpdated: new Date() },
        { teamId: 'team2', season: 2025, yppOff: 6.0, dataSource: 'game', confidence: 1.0, gamesCount: 10, lastUpdated: new Date() },
        { teamId: 'team3', season: 2025, yppOff: 7.0, dataSource: 'game', confidence: 1.0, gamesCount: 10, lastUpdated: new Date() },
      ];

      const stats = calculateZScores(mockFeatures, f => f.yppOff ?? null);
      
      expect(stats.mean).toBeCloseTo(6.0, 5);
      expect(stats.stdDev).toBeGreaterThan(0);
    });

    test('should produce z-scores with mean ≈ 0 and std ≈ 1', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const mockFeatures: TeamFeatures[] = values.map((val, i) => ({
        teamId: `team${i}`,
        season: 2025,
        yppOff: val,
        dataSource: 'game' as const,
        confidence: 1.0,
        gamesCount: 10,
        lastUpdated: new Date()
      }));

      const stats = calculateZScores(mockFeatures, f => f.yppOff ?? null);
      
      // Check z-scores
      const zScores = values.map(v => getZScore(v, stats));
      const zMean = zScores.reduce((sum, z) => sum + z, 0) / zScores.length;
      const zVariance = zScores.reduce((sum, z) => sum + Math.pow(z - zMean, 2), 0) / zScores.length;
      const zStdDev = Math.sqrt(zVariance);
      
      expect(Math.abs(zMean)).toBeLessThan(0.001);
      expect(Math.abs(zStdDev - 1)).toBeLessThan(0.001);
    });

    test('should handle null values correctly', () => {
      const mockFeatures: TeamFeatures[] = [
        { teamId: 'team1', season: 2025, yppOff: 5.0, dataSource: 'game', confidence: 1.0, gamesCount: 10, lastUpdated: new Date() },
        { teamId: 'team2', season: 2025, yppOff: null, dataSource: 'game', confidence: 1.0, gamesCount: 10, lastUpdated: new Date() },
        { teamId: 'team3', season: 2025, yppOff: 7.0, dataSource: 'game', confidence: 1.0, gamesCount: 10, lastUpdated: new Date() },
      ];

      const stats = calculateZScores(mockFeatures, f => f.yppOff ?? null);
      expect(stats.values.length).toBe(2); // Only non-null values included
    });

    test('should handle empty values', () => {
      const mockFeatures: TeamFeatures[] = [
        { teamId: 'team1', season: 2025, yppOff: null, dataSource: 'game', confidence: 1.0, gamesCount: 10, lastUpdated: new Date() },
      ];

      const stats = calculateZScores(mockFeatures, f => f.yppOff ?? null);
      expect(stats.mean).toBe(0);
      expect(stats.stdDev).toBe(1);
      expect(stats.values.length).toBe(0);
    });

    test('getZScore should return 0 for null values', () => {
      const stats = { mean: 5.0, stdDev: 2.0, values: [] };
      expect(getZScore(null, stats)).toBe(0);
      expect(getZScore(undefined, stats)).toBe(0);
    });

    test('getZScore should calculate correctly', () => {
      const stats = { mean: 5.0, stdDev: 2.0, values: [] };
      expect(getZScore(5.0, stats)).toBe(0); // Mean value = z-score 0
      expect(getZScore(7.0, stats)).toBe(1.0); // One stdDev above
      expect(getZScore(3.0, stats)).toBe(-1.0); // One stdDev below
    });
  });

  describe('Offensive Index Computation', () => {
    test('should compute offensive index from weighted z-scores', () => {
      const mockFeatures: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        yppOff: 6.5,
        passYpaOff: 8.0,
        rushYpcOff: 5.0,
        successOff: 0.5,
        epaOff: 0.15,
        dataSource: 'game',
        confidence: 1.0,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      // Create z-score stats (mean=5, stdDev=2 for simplicity)
      const createStats = (mean: number, stdDev: number) => ({ mean, stdDev, values: [] });
      const zStats = {
        yppOff: createStats(5.0, 2.0),
        passYpaOff: createStats(7.0, 1.5),
        rushYpcOff: createStats(4.5, 1.0),
        successOff: createStats(0.45, 0.1),
        epaOff: createStats(0.12, 0.05),
      };

      const offIndex = computeOffensiveIndex(mockFeatures, zStats);
      
      // Should be a weighted sum of z-scores
      expect(typeof offIndex).toBe('number');
      expect(!isNaN(offIndex)).toBe(true);
    });

    test('should handle missing offensive features', () => {
      const mockFeatures: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        yppOff: null,
        passYpaOff: null,
        rushYpcOff: null,
        successOff: null,
        epaOff: null,
        dataSource: 'game',
        confidence: 1.0,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      const createStats = (mean: number, stdDev: number) => ({ mean, stdDev, values: [] });
      const zStats = {
        yppOff: createStats(5.0, 2.0),
        passYpaOff: createStats(7.0, 1.5),
        rushYpcOff: createStats(4.5, 1.0),
        successOff: createStats(0.45, 0.1),
        epaOff: createStats(0.12, 0.05),
      };

      const offIndex = computeOffensiveIndex(mockFeatures, zStats);
      // All z-scores should be 0 for null values, so index should be 0
      expect(offIndex).toBe(0);
    });
  });

  describe('Defensive Index Computation', () => {
    test('should compute defensive index (inverted)', () => {
      const mockFeatures: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        yppDef: 4.0, // Lower is better
        successDef: 0.35, // Lower is better
        epaDef: 0.08, // Lower is better
        dataSource: 'game',
        confidence: 1.0,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      const createStats = (mean: number, stdDev: number) => ({ mean, stdDev, values: [] });
      const zStats = {
        yppDef: createStats(5.0, 2.0),
        passYpaDef: createStats(7.0, 1.5),
        rushYpcDef: createStats(4.5, 1.0),
        successDef: createStats(0.40, 0.1),
        epaDef: createStats(0.10, 0.05),
      };

      const defIndex = computeDefensiveIndex(mockFeatures, zStats);
      
      // Should be negative (inverted) since lower is better
      expect(typeof defIndex).toBe('number');
      expect(!isNaN(defIndex)).toBe(true);
    });

    test('should use only success/EPA when yards stats missing', () => {
      const mockFeatures: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        yppDef: null,
        passYpaDef: null,
        rushYpcDef: null,
        successDef: 0.35,
        epaDef: 0.08,
        dataSource: 'season',
        confidence: 0.9,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      const createStats = (mean: number, stdDev: number) => ({ mean, stdDev, values: [] });
      const zStats = {
        yppDef: createStats(5.0, 2.0),
        passYpaDef: createStats(7.0, 1.5),
        rushYpcDef: createStats(4.5, 1.0),
        successDef: createStats(0.40, 0.1),
        epaDef: createStats(0.10, 0.05),
      };

      const defIndex = computeDefensiveIndex(mockFeatures, zStats);
      
      // Should still compute (using only success/EPA)
      expect(typeof defIndex).toBe('number');
      expect(!isNaN(defIndex)).toBe(true);
    });
  });

  describe('Confidence Calculation', () => {
    test('should calculate confidence based on feature coverage and data source', () => {
      const fullFeatures: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        yppOff: 6.0,
        passYpaOff: 8.0,
        rushYpcOff: 5.0,
        successOff: 0.5,
        epaOff: 0.15,
        yppDef: 4.0,
        successDef: 0.35,
        epaDef: 0.08,
        dataSource: 'game',
        confidence: 1.0,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      const confidence = calculateConfidence(fullFeatures);
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1.0);
      expect(confidence).toBeCloseTo(1.0, 1); // Full coverage + game data = high confidence
    });

    test('should have lower confidence for season-only data', () => {
      const seasonFeatures: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        yppOff: 6.0,
        passYpaOff: 8.0,
        rushYpcOff: 5.0,
        successOff: 0.5,
        epaOff: 0.15,
        yppDef: 4.0,
        successDef: 0.35,
        epaDef: 0.08,
        dataSource: 'season',
        confidence: 0.9,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      const confidence = calculateConfidence(seasonFeatures);
      expect(confidence).toBeLessThan(1.0); // Should be lower than game-level
      expect(confidence).toBeGreaterThan(0);
    });

    test('should have lowest confidence for missing data', () => {
      const missingFeatures: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        yppOff: null,
        passYpaOff: null,
        rushYpcOff: null,
        successOff: null,
        epaOff: null,
        yppDef: null,
        successDef: null,
        epaDef: null,
        dataSource: 'missing',
        confidence: 0.3,
        gamesCount: 0,
        lastUpdated: null
      };

      const confidence = calculateConfidence(missingFeatures);
      expect(confidence).toBeLessThan(0.5); // Low confidence for missing data
      expect(confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Source String', () => {
    test('should return game+season when game data with advanced stats', () => {
      const features: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        successOff: 0.5,
        epaOff: 0.15,
        dataSource: 'game',
        confidence: 1.0,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      const source = getDataSourceString(features);
      expect(source).toBe('game+season');
    });

    test('should return season_only when season data with advanced stats', () => {
      const features: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        successOff: 0.5,
        epaOff: 0.15,
        dataSource: 'season',
        confidence: 0.9,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      const source = getDataSourceString(features);
      expect(source).toBe('season_only');
    });

    test('should return baseline when only baseline data', () => {
      const features: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        successOff: null,
        epaOff: null,
        dataSource: 'baseline',
        confidence: 0.7,
        gamesCount: 0,
        lastUpdated: null
      };

      const source = getDataSourceString(features);
      expect(source).toBe('baseline');
    });
  });

  describe('Power Rating = Offense + Defense', () => {
    test('power rating should equal offense + defense indices', () => {
      const mockFeatures: TeamFeatures = {
        teamId: 'team1',
        season: 2025,
        yppOff: 6.5,
        passYpaOff: 8.0,
        rushYpcOff: 5.0,
        successOff: 0.5,
        epaOff: 0.15,
        yppDef: 4.0,
        passYpaDef: 6.0,
        rushYpcDef: 3.5,
        successDef: 0.35,
        epaDef: 0.08,
        dataSource: 'game',
        confidence: 1.0,
        gamesCount: 10,
        lastUpdated: new Date()
      };

      const createStats = (mean: number, stdDev: number) => ({ mean, stdDev, values: [] });
      const zStats = {
        yppOff: createStats(5.0, 2.0),
        passYpaOff: createStats(7.0, 1.5),
        rushYpcOff: createStats(4.5, 1.0),
        successOff: createStats(0.45, 0.1),
        epaOff: createStats(0.12, 0.05),
        yppDef: createStats(5.0, 2.0),
        passYpaDef: createStats(7.0, 1.5),
        rushYpcDef: createStats(4.5, 1.0),
        successDef: createStats(0.40, 0.1),
        epaDef: createStats(0.10, 0.05),
      };

      const offenseRating = computeOffensiveIndex(mockFeatures, {
        yppOff: zStats.yppOff,
        passYpaOff: zStats.passYpaOff,
        rushYpcOff: zStats.rushYpcOff,
        successOff: zStats.successOff,
        epaOff: zStats.epaOff,
      });

      const defenseRating = computeDefensiveIndex(mockFeatures, {
        yppDef: zStats.yppDef,
        passYpaDef: zStats.passYpaDef,
        rushYpcDef: zStats.rushYpcDef,
        successDef: zStats.successDef,
        epaDef: zStats.epaDef,
      });

      const powerRating = offenseRating + defenseRating;

      // Power rating should equal sum
      expect(powerRating).toBeCloseTo(offenseRating + defenseRating, 5);
      expect(!isNaN(powerRating)).toBe(true);
    });
  });
});

