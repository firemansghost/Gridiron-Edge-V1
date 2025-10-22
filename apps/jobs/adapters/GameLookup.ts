import { PrismaClient } from '@prisma/client';

interface GameLookupResult {
  gameId: string | null;
  game: any | null;
  reason?: string;
}

export class GameLookup {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Look up a game in the database using canonical team IDs
   * @param season - Season year
   * @param week - Week number
   * @param homeTeamId - Canonical home team ID
   * @param awayTeamId - Canonical away team ID
   * @param eventTime - Optional event time for disambiguation
   * @returns Game ID and game object, or null if not found
   */
  async lookupGame(
    season: number,
    week: number,
    homeTeamId: string,
    awayTeamId: string,
    eventTime?: Date
  ): Promise<GameLookupResult> {
    try {
      // First try exact week match
      const exactGames = await this.prisma.game.findMany({
        where: {
          season,
          week,
          homeTeamId,
          awayTeamId
        },
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } }
        }
      });

      if (exactGames.length > 0) {
        if (exactGames.length === 1) {
          return {
            gameId: exactGames[0].id,
            game: exactGames[0]
          };
        }

        // Multiple games found - choose the one closest to event time
        if (eventTime) {
          const closestGame = exactGames.reduce((closest, current) => {
            const closestDiff = Math.abs(closest.date.getTime() - eventTime.getTime());
            const currentDiff = Math.abs(current.date.getTime() - eventTime.getTime());
            return currentDiff < closestDiff ? current : closest;
          });

          return {
            gameId: closestGame.id,
            game: closestGame
          };
        }

        // No event time provided, return the first one
        return {
          gameId: exactGames[0].id,
          game: exactGames[0]
        };
      }

      // No exact week match - try week-flexible lookup
      if (eventTime) {
        return await this.lookupGameWeekFlexible(season, homeTeamId, awayTeamId, eventTime);
      }

      return {
        gameId: null,
        game: null,
        reason: `No game found for ${awayTeamId} @ ${homeTeamId} in ${season} W${week}`
      };

    } catch (error) {
      console.error(`[GAME_LOOKUP] Error looking up game:`, error);
      return {
        gameId: null,
        game: null,
        reason: `Database error: ${error}`
      };
    }
  }

  /**
   * Week-flexible game lookup using date proximity
   * @param season - Season year
   * @param homeTeamId - Canonical home team ID
   * @param awayTeamId - Canonical away team ID
   * @param eventTime - Event time for date proximity matching
   * @returns Game ID and game object, or null if not found
   */
  async lookupGameWeekFlexible(
    season: number,
    homeTeamId: string,
    awayTeamId: string,
    eventTime: Date
  ): Promise<GameLookupResult> {
    try {
      // Query games with season and teams (no week filter)
      const games = await this.prisma.game.findMany({
        where: {
          season,
          homeTeamId,
          awayTeamId
        },
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } }
        },
        orderBy: {
          date: 'asc'
        }
      });

      if (games.length === 0) {
        // Try swapping home/away in case provider flips venue
        const swappedGames = await this.prisma.game.findMany({
          where: {
            season,
            homeTeamId: awayTeamId,
            awayTeamId: homeTeamId
          },
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } }
          },
          orderBy: {
            date: 'asc'
          }
        });

        if (swappedGames.length === 0) {
          return {
            gameId: null,
            game: null,
            reason: `No game found for ${awayTeamId} @ ${homeTeamId} in ${season} (tried both directions)`
          };
        }

        // Use swapped games for proximity matching
        const closestGame = swappedGames.reduce((closest, current) => {
          const closestDiff = Math.abs(closest.date.getTime() - eventTime.getTime());
          const currentDiff = Math.abs(current.date.getTime() - eventTime.getTime());
          return currentDiff < closestDiff ? current : closest;
        });

        return {
          gameId: closestGame.id,
          game: closestGame
        };
      }

      // Find the game closest to the event time
      const closestGame = games.reduce((closest, current) => {
        const closestDiff = Math.abs(closest.date.getTime() - eventTime.getTime());
        const currentDiff = Math.abs(current.date.getTime() - eventTime.getTime());
        return currentDiff < closestDiff ? current : closest;
      });

      return {
        gameId: closestGame.id,
        game: closestGame
      };

    } catch (error) {
      console.error(`[GAME_LOOKUP] Error in week-flexible lookup:`, error);
      return {
        gameId: null,
        game: null,
        reason: `Database error in week-flexible lookup: ${error}`
      };
    }
  }

  /**
   * Batch lookup multiple games
   * @param lookups - Array of lookup parameters
   * @returns Map of lookup key to result
   */
  async batchLookup(lookups: Array<{
    season: number;
    week: number;
    homeTeamId: string;
    awayTeamId: string;
    eventTime?: Date;
  }>): Promise<Map<string, GameLookupResult>> {
    const results = new Map<string, GameLookupResult>();
    
    // Process in parallel for better performance
    const promises = lookups.map(async (lookup) => {
      const key = `${lookup.season}-${lookup.week}-${lookup.awayTeamId}-${lookup.homeTeamId}`;
      const result = await this.lookupGame(
        lookup.season,
        lookup.week,
        lookup.homeTeamId,
        lookup.awayTeamId,
        lookup.eventTime
      );
      return { key, result };
    });

    const resolved = await Promise.all(promises);
    
    for (const { key, result } of resolved) {
      results.set(key, result);
    }

    return results;
  }

  /**
   * Get game statistics for reporting
   */
  async getGameStats(season: number, week: number): Promise<{
    totalGames: number;
    gamesWithOdds: number;
    coverage: number;
  }> {
    const totalGames = await this.prisma.game.count({
      where: { season, week }
    });

    const gamesWithOdds = await this.prisma.game.count({
      where: {
        season,
        week,
        marketLines: {
          some: {}
        }
      }
    });

    const coverage = totalGames > 0 ? (gamesWithOdds / totalGames) * 100 : 0;

    return {
      totalGames,
      gamesWithOdds,
      coverage
    };
  }
}
