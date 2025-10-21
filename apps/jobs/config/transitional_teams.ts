/**
 * Transitional Teams Configuration
 * 
 * Teams that are transitioning between divisions or have inconsistent data coverage.
 * When the season-only fallback is enabled, these teams are still eligible for matching
 * even if the date window is wider.
 * 
 * Use this sparingly - only for teams you know are in your games table but may have
 * schedule/week drift issues.
 */

export const TRANSITIONAL_TEAM_SLUGS = new Set([
  'kennesaw-state',  // FBS transitional (2024+), may have sparse/inconsistent early data
  // Add others as needed (e.g., james-madison, jacksonville-state when they transitioned)
]);

/**
 * Check if either team in a matchup is transitional
 */
export function isTransitionalMatchup(homeTeamId: string, awayTeamId: string): boolean {
  return TRANSITIONAL_TEAM_SLUGS.has(homeTeamId) || TRANSITIONAL_TEAM_SLUGS.has(awayTeamId);
}

