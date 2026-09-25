import {
  V4_PROSPECTIVE_V1_EXPECTED_FBS,
  V4_PROSPECTIVE_V1_PROVIDER_CALL_BUDGET,
  V4_PROSPECTIVE_V1_WEIGHTS,
  aggregateAdvancedFeatures,
  aggregateDriveFeatures,
  buildV4ProspectiveRatings,
  combineProspectiveFeatures,
  legacyAvailableYardsPct,
  legacyScoringOpportunity,
  prospectiveDriveOffensePoints,
  v4ProspectiveDecision,
  v4ProspectiveHma,
  type V4ProspectiveTeamFeature,
} from '../src/research/v4-prospective-v1';

describe('V4 prospective v1 research comparator', () => {
  it('freezes the nine-call budget and historical weight skeleton', () => {
    expect(V4_PROSPECTIVE_V1_PROVIDER_CALL_BUDGET).toBe(9);
    expect(V4_PROSPECTIVE_V1_EXPECTED_FBS).toBe(138);
    expect(V4_PROSPECTIVE_V1_WEIGHTS).toEqual({
      success: 0.5,
      explosiveness: 0.25,
      finishing: 0.15,
      availableYards: 0.1,
    });
  });

  it('play-weights success and successful-play-weights explosiveness', () => {
    const result = aggregateAdvancedFeatures(['a'], [
      {
        teamId: 'a',
        offense: { plays: 100, successRate: 0.5, explosiveness: 1.2 },
        defense: { plays: 80, successRate: 0.25, explosiveness: 0.8 },
      },
      {
        teamId: 'a',
        offense: { plays: 50, successRate: 0.2, explosiveness: 2.0 },
        defense: { plays: 20, successRate: 0.5, explosiveness: 1.6 },
      },
    ]);
    expect(result[0].offSuccess).toBeCloseTo(60 / 150, 12);
    expect(result[0].defSuccess).toBeCloseTo(30 / 100, 12);
    expect(result[0].rawOffExplosiveness).toBeCloseTo(
      (1.2 * 50 + 2.0 * 10) / 60,
      12
    );
    expect(result[0].rawDefExplosiveness).toBeCloseTo(
      (0.8 * 20 + 1.6 * 10) / 30,
      12
    );
  });

  it('never converts missing advanced numerics to zero', () => {
    const result = aggregateAdvancedFeatures(['a'], [
      {
        teamId: 'a',
        offense: {
          plays: null as unknown as number,
          successRate: null as unknown as number,
          explosiveness: null as unknown as number,
        },
        defense: {
          plays: null as unknown as number,
          successRate: null as unknown as number,
          explosiveness: null as unknown as number,
        },
      },
    ]);
    expect(result[0].offSuccess).toBeNull();
    expect(result[0].defSuccess).toBeNull();
    expect(result[0].rawOffExplosiveness).toBeNull();
    expect(result[0].rawDefExplosiveness).toBeNull();
  });

  it('preserves legacy scoring-opportunity and available-yards rules', () => {
    expect(
      legacyScoringOpportunity({
        startYardline: 20,
        endYardline: 65,
        yards: 45,
      })
    ).toBe(true);
    expect(
      legacyAvailableYardsPct({
        startYardline: 20,
        yards: 40,
      })
    ).toBeCloseTo(0.5, 12);
  });

  it('uses only play-derived drive points and fails closed when absent', () => {
    expect(
      prospectiveDriveOffensePoints({
        offenseTeamId: 'a',
        defenseTeamId: 'b',
        startYardline: 20,
        endYardline: 100,
        yards: 80,
        offensePointsFromPlays: 7,
      })
    ).toBe(7);
    expect(
      prospectiveDriveOffensePoints({
        offenseTeamId: 'a',
        defenseTeamId: 'b',
        startYardline: 20,
        endYardline: 80,
        yards: 60,
        offensePointsFromPlays: null,
      })
    ).toBeNull();
  });

  it('aggregates offense and defense finishing from the same play-derived drive points', () => {
    const rows = aggregateDriveFeatures(['a', 'b'], [
      {
        offenseTeamId: 'a',
        defenseTeamId: 'b',
        startYardline: 20,
        endYardline: 70,
        yards: 50,
        offensePointsFromPlays: 7,
      },
    ]);
    const a = rows.find((r) => r.teamId === 'a')!;
    const b = rows.find((r) => r.teamId === 'b')!;
    expect(a.offFinishing).toBe(7);
    expect(b.defFinishing).toBe(7);
    expect(a.offScoringOppsMissingPoints).toBe(0);
    expect(b.defScoringOppsMissingPoints).toBe(0);
    expect(a.offAvailableYardsPct).toBeCloseTo(50 / 80, 12);
    expect(b.defAvailableYardsPct).toBeCloseTo(50 / 80, 12);
  });

  it('keeps a qualifying drive in the denominator and fails finishing closed when its points are unknown', () => {
    const rows = aggregateDriveFeatures(['a', 'b'], [
      {
        offenseTeamId: 'a',
        defenseTeamId: 'b',
        startYardline: 20,
        endYardline: 70,
        yards: 50,
        offensePointsFromPlays: null,
      },
    ]);
    const a = rows.find((r) => r.teamId === 'a')!;
    const b = rows.find((r) => r.teamId === 'b')!;
    expect(a.offScoringOpps).toBe(1);
    expect(b.defScoringOpps).toBe(1);
    expect(a.offScoringOppsMissingPoints).toBe(1);
    expect(b.defScoringOppsMissingPoints).toBe(1);
    expect(a.offFinishing).toBeNull();
    expect(b.defFinishing).toBeNull();
  });

  it('marks a team incomplete rather than imputing a missing drive feature', () => {
    const advanced = aggregateAdvancedFeatures(['a'], [
      {
        teamId: 'a',
        offense: { plays: 10, successRate: 0.5, explosiveness: 1.1 },
        defense: { plays: 10, successRate: 0.5, explosiveness: 1.1 },
      },
    ]);
    const drives = aggregateDriveFeatures(['a'], []);
    const combined = combineProspectiveFeatures({
      fbsTeamIds: ['a'],
      advanced,
      drives,
    });
    expect(combined.missingTeamIds).toEqual(['a']);
    expect(combined.features[0].offFinishing).toBeNull();
    expect(combined.features[0].offAvailableYardsPct).toBeNull();
  });

  it('preserves historical center-times-ten rating behavior', () => {
    const features: V4ProspectiveTeamFeature[] = Array.from(
      { length: V4_PROSPECTIVE_V1_EXPECTED_FBS },
      (_, i) => ({
        teamId: `team-${String(i).padStart(3, '0')}`,
        offSuccess: 0.3 + i * 0.001,
        defSuccess: 0.4 - i * 0.0005,
        rawOffExplosiveness: 1 + i * 0.01,
        rawDefExplosiveness: 1.2 - i * 0.003,
        offensePlays: 100,
        defensePlays: 100,
        offenseSuccessfulPlayWeight: 40,
        defenseSuccessfulPlayWeight: 40,
        offFinishing: 2 + i * 0.01,
        defFinishing: 3 - i * 0.005,
        offAvailableYardsPct: 0.3 + i * 0.001,
        defAvailableYardsPct: 0.4 - i * 0.001,
        offScoringOpps: 3,
        defScoringOpps: 3,
        offScoringOppsMissingPoints: 0,
        defScoringOppsMissingPoints: 0,
        offAvailableDrives: 10,
        defAvailableDrives: 10,
        offExplosivenessGrade: -1 + i * 0.02,
        defExplosivenessGrade: 1 - i * 0.015,
      })
    );
    const result = buildV4ProspectiveRatings(features);
    expect(result.ratings).toHaveLength(138);
    const meanRating =
      result.ratings.reduce((sum, r) => sum + r.rating, 0) /
      result.ratings.length;
    expect(meanRating).toBeCloseTo(0, 10);
    expect(result.stdDevNetV4Diagnostic).toBeGreaterThan(0);
  });

  it('uses historical HFA and side-decision conventions', () => {
    expect(
      v4ProspectiveHma({
        homeRating: 10,
        awayRating: 5,
        neutralSite: false,
      })
    ).toBe(7);
    expect(
      v4ProspectiveHma({
        homeRating: 10,
        awayRating: 5,
        neutralSite: true,
      })
    ).toBe(5);
    expect(v4ProspectiveDecision({ v4Hma: 6, marketHma: 3 }).side).toBe(
      'HOME'
    );
    expect(v4ProspectiveDecision({ v4Hma: 1, marketHma: 3 }).side).toBe(
      'AWAY'
    );
    expect(v4ProspectiveDecision({ v4Hma: 3.05, marketHma: 3 }).side).toBe(
      'NO_SELECTION'
    );
  });
});
