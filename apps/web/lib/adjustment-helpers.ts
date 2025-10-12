/**
 * M6 Lite Adjustments
 * 
 * Server-side heuristics for injuries and weather impact on spreads/totals.
 * No external APIs yet - using mock inputs for demonstration.
 */

// Confidence tier thresholds (M6 tuned)
export const CONFIDENCE_THRESHOLDS = {
  A: 3.5,
  B: 2.5,
  C: 1.5,
};

export interface InjuryInput {
  teamId: string;
  type: 'QB' | 'OL' | 'DL' | 'WR' | 'RB' | 'DB';
  severity: 'out' | 'questionable' | 'probable';
}

export interface WeatherInput {
  windMph: number;
  precipitation: 'none' | 'rain' | 'snow';
  temperature: number;
}

export interface AdjustmentResult {
  injuryAdjPts: number;
  weatherAdjPts: number;
  totalAdjPts: number;
  breakdown: {
    injuries: string[];
    weather: string[];
  };
}

/**
 * Calculate injury adjustments to spread
 * Negative value = disadvantage to the injured team
 */
export function calculateInjuryAdjustment(
  homeTeamId: string,
  awayTeamId: string,
  injuries: InjuryInput[]
): { spreadAdj: number; breakdown: string[] } {
  let spreadAdj = 0;
  const breakdown: string[] = [];

  for (const injury of injuries) {
    let impact = 0;
    const isHomeTeam = injury.teamId === homeTeamId;
    const teamLabel = isHomeTeam ? 'Home' : 'Away';

    // Severity multiplier
    const severityMultiplier = injury.severity === 'out' ? 1.0 : 
                              injury.severity === 'questionable' ? 0.5 : 0.25;

    // Position-based impact
    switch (injury.type) {
      case 'QB':
        impact = -2.5 * severityMultiplier;
        breakdown.push(`${teamLabel} ${injury.type} ${injury.severity}: ${impact.toFixed(1)} pts`);
        break;
      case 'OL':
      case 'DL':
        impact = -1.0 * severityMultiplier;
        breakdown.push(`${teamLabel} ${injury.type} ${injury.severity}: ${impact.toFixed(1)} pts`);
        break;
      case 'WR':
      case 'RB':
        impact = -0.75 * severityMultiplier;
        breakdown.push(`${teamLabel} ${injury.type} ${injury.severity}: ${impact.toFixed(1)} pts`);
        break;
      case 'DB':
        impact = -0.5 * severityMultiplier;
        breakdown.push(`${teamLabel} ${injury.type} ${injury.severity}: ${impact.toFixed(1)} pts`);
        break;
    }

    // Apply to spread (home perspective)
    if (isHomeTeam) {
      spreadAdj += impact; // negative impact to home = more positive spread
    } else {
      spreadAdj -= impact; // negative impact to away = more negative spread
    }
  }

  return { spreadAdj, breakdown };
}

/**
 * Calculate weather adjustments to total and spread
 */
export function calculateWeatherAdjustment(
  weather: WeatherInput,
  homeTeamStyle: 'pass' | 'run' | 'balanced' = 'balanced',
  awayTeamStyle: 'pass' | 'run' | 'balanced' = 'balanced'
): { totalAdj: number; spreadAdj: number; breakdown: string[] } {
  let totalAdj = 0;
  let spreadAdj = 0;
  const breakdown: string[] = [];

  // Wind impact on total
  if (weather.windMph >= 15) {
    const windImpact = Math.min(-1.5 - (weather.windMph - 15) * 0.1, -3.0);
    totalAdj += windImpact;
    breakdown.push(`Wind ${weather.windMph} mph: ${windImpact.toFixed(1)} pts to total`);

    // Wind favors run teams slightly
    const passTeamPenalty = 0.5;
    if (homeTeamStyle === 'pass' && awayTeamStyle === 'run') {
      spreadAdj += passTeamPenalty; // home disadvantaged
      breakdown.push(`Wind favors away run game: +${passTeamPenalty.toFixed(1)} spread`);
    } else if (homeTeamStyle === 'run' && awayTeamStyle === 'pass') {
      spreadAdj -= passTeamPenalty; // home advantaged
      breakdown.push(`Wind favors home run game: -${passTeamPenalty.toFixed(1)} spread`);
    }
  }

  // Precipitation impact
  if (weather.precipitation !== 'none') {
    const precipImpact = weather.precipitation === 'snow' ? -2.0 : -1.0;
    totalAdj += precipImpact;
    breakdown.push(`${weather.precipitation}: ${precipImpact.toFixed(1)} pts to total`);
  }

  // Extreme cold
  if (weather.temperature < 20) {
    const coldImpact = -1.5;
    totalAdj += coldImpact;
    breakdown.push(`Temperature ${weather.temperature}°F: ${coldImpact.toFixed(1)} pts to total`);
  }

  return { totalAdj, spreadAdj, breakdown };
}

/**
 * Apply adjustments to implied lines
 */
export function applyAdjustments(
  baseSpread: number,
  baseTotal: number,
  homeTeamId: string,
  awayTeamId: string,
  injuries: InjuryInput[],
  weather: WeatherInput | null,
  homeTeamStyle: 'pass' | 'run' | 'balanced' = 'balanced',
  awayTeamStyle: 'pass' | 'run' | 'balanced' = 'balanced'
): {
  impliedSpreadAdj: number;
  impliedTotalAdj: number;
  adjustments: AdjustmentResult;
} {
  let injuryAdjPts = 0;
  let weatherAdjPts = 0;
  const injuryBreakdown: string[] = [];
  const weatherBreakdown: string[] = [];

  // Apply injury adjustments
  if (injuries.length > 0) {
    const injuryResult = calculateInjuryAdjustment(homeTeamId, awayTeamId, injuries);
    injuryAdjPts = injuryResult.spreadAdj;
    injuryBreakdown.push(...injuryResult.breakdown);
  }

  // Apply weather adjustments
  let weatherSpreadAdj = 0;
  let weatherTotalAdj = 0;
  if (weather) {
    const weatherResult = calculateWeatherAdjustment(weather, homeTeamStyle, awayTeamStyle);
    weatherTotalAdj = weatherResult.totalAdj;
    weatherSpreadAdj = weatherResult.spreadAdj;
    weatherAdjPts = weatherSpreadAdj;
    weatherBreakdown.push(...weatherResult.breakdown);
  }

  const totalAdjPts = injuryAdjPts + weatherAdjPts;

  return {
    impliedSpreadAdj: baseSpread + totalAdjPts,
    impliedTotalAdj: baseTotal + (weatherTotalAdj || 0),
    adjustments: {
      injuryAdjPts,
      weatherAdjPts,
      totalAdjPts,
      breakdown: {
        injuries: injuryBreakdown,
        weather: weatherBreakdown,
      },
    },
  };
}

/**
 * Calculate confidence tier based on edge
 */
export function calculateConfidenceTier(edge: number): 'A' | 'B' | 'C' {
  if (edge >= CONFIDENCE_THRESHOLDS.A) return 'A';
  if (edge >= CONFIDENCE_THRESHOLDS.B) return 'B';
  return 'C';
}

/**
 * Mock injury data for demonstration
 */
export function getMockInjuries(gameId: string): InjuryInput[] {
  // Mock injuries for specific games
  const mockData: Record<string, InjuryInput[]> = {
    'game-1': [
      { teamId: 'alabama', type: 'QB', severity: 'questionable' },
    ],
    'game-2': [
      { teamId: 'ohio-state', type: 'OL', severity: 'out' },
      { teamId: 'ohio-state', type: 'OL', severity: 'out' },
    ],
    'game-3': [
      { teamId: 'clemson', type: 'WR', severity: 'out' },
    ],
  };

  return mockData[gameId] || [];
}

/**
 * Mock weather data for demonstration
 */
export function getMockWeather(gameId: string): WeatherInput | null {
  // Mock weather for specific games
  const mockData: Record<string, WeatherInput> = {
    'game-1': {
      windMph: 18,
      precipitation: 'none',
      temperature: 72,
    },
    'game-4': {
      windMph: 8,
      precipitation: 'rain',
      temperature: 55,
    },
  };

  return mockData[gameId] || null;
}
