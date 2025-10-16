/**
 * Season/Week Helper Functions
 * 
 * Utilities for determining current season and week
 */

export interface SeasonWeek {
  season: number;
  week: number;
}

/**
 * Get the current season and week
 * This is a simplified implementation - in production you might want to
 * calculate this based on actual CFB calendar dates
 */
export function getCurrentSeasonWeek(): SeasonWeek {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // For now, we'll use a simple approach:
  // - If we're in the fall (Aug-Dec), use current year
  // - If we're in spring/summer (Jan-July), use previous year
  let season = currentYear;
  if (now.getMonth() < 7) { // January through July
    season = currentYear - 1;
  }
  
  // For now, default to week 8 as a reasonable mid-season week
  // In production, this could be calculated based on actual game dates
  const week = 8;
  
  return { season, week };
}

/**
 * Get season/week from query parameters with fallback to current
 */
export function getSeasonWeekFromParams(searchParams: URLSearchParams): SeasonWeek {
  const season = parseInt(searchParams.get('season') || '');
  const week = parseInt(searchParams.get('week') || '');
  
  if (season && week) {
    return { season, week };
  }
  
  return getCurrentSeasonWeek();
}
