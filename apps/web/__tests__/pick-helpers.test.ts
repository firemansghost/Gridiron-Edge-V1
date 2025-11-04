/**
 * Unit tests for pick-helpers.ts
 * Specifically testing convertToFavoriteCentric function
 */

import { convertToFavoriteCentric } from '@/lib/pick-helpers';

describe('convertToFavoriteCentric', () => {
  // Test case from user: OSU @ Purdue should show Ohio State -29.5
  // If OSU is away and should be -29.5, then in home-minus-away: spread = +29.5 (away favored)
  test('Ohio State @ Purdue: Away team favored should convert correctly', () => {
    const homeTeamId = 'purdue';
    const homeTeamName = 'Purdue';
    const awayTeamId = 'ohio-state';
    const awayTeamName = 'Ohio State';
    
    // If Ohio State (away) is favored by 29.5, spread should be +29.5 (away favored)
    const spread = 29.5; // home-minus-away: positive = away favored
    
    const result = convertToFavoriteCentric(
      spread,
      homeTeamId,
      homeTeamName,
      awayTeamId,
      awayTeamName
    );
    
    // Should identify away team (Ohio State) as favorite
    expect(result.favoriteTeamId).toBe(awayTeamId);
    expect(result.favoriteTeamName).toBe(awayTeamName);
    expect(result.favoriteSpread).toBe(-29.5); // Favorite always negative
    
    // Underdog should be home team (Purdue)
    expect(result.underdogTeamId).toBe(homeTeamId);
    expect(result.underdogTeamName).toBe(homeTeamName);
    expect(result.underdogSpread).toBe(29.5); // Underdog always positive
  });

  test('Home team favored: negative spread converts correctly', () => {
    const homeTeamId = 'alabama';
    const homeTeamName = 'Alabama';
    const awayTeamId = 'lsu';
    const awayTeamName = 'LSU';
    
    // If Alabama (home) is favored by 10, spread should be -10 (home favored)
    const spread = -10.0; // home-minus-away: negative = home favored
    
    const result = convertToFavoriteCentric(
      spread,
      homeTeamId,
      homeTeamName,
      awayTeamId,
      awayTeamName
    );
    
    // Should identify home team (Alabama) as favorite
    expect(result.favoriteTeamId).toBe(homeTeamId);
    expect(result.favoriteTeamName).toBe(homeTeamName);
    expect(result.favoriteSpread).toBe(-10.0); // Favorite always negative
    
    // Underdog should be away team (LSU)
    expect(result.underdogTeamId).toBe(awayTeamId);
    expect(result.underdogTeamName).toBe(awayTeamName);
    expect(result.underdogSpread).toBe(10.0); // Underdog always positive
  });

  test('Favorite spread is always negative, underdog always positive', () => {
    const testCases = [
      { spread: -15.5, expectedFavorite: 'home' },
      { spread: 15.5, expectedFavorite: 'away' },
      { spread: -3.0, expectedFavorite: 'home' },
      { spread: 3.0, expectedFavorite: 'away' },
      { spread: 0.0, expectedFavorite: 'away' }, // Zero is treated as away (spread >= 0)
    ];

    testCases.forEach(({ spread, expectedFavorite }) => {
      const result = convertToFavoriteCentric(
        spread,
        'home-id',
        'Home Team',
        'away-id',
        'Away Team'
      );
      
      expect(result.favoriteSpread).toBeLessThanOrEqual(0);
      expect(result.underdogSpread).toBeGreaterThanOrEqual(0);
      expect(Math.abs(result.favoriteSpread)).toBe(Math.abs(result.underdogSpread));
      
      if (expectedFavorite === 'home') {
        expect(result.favoriteTeamId).toBe('home-id');
        expect(result.underdogTeamId).toBe('away-id');
      } else {
        expect(result.favoriteTeamId).toBe('away-id');
        expect(result.underdogTeamId).toBe('home-id');
      }
    });
  });
});

