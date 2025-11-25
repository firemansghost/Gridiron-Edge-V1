/**
 * V3 Ratings Computation (Barnes Luck-Adjusted Model)
 * 
 * Implements the "Robert Barnes" philosophy: segregating luck from results.
 * Calculates Power Ratings based solely on Net Yards and Yards Per Play (YPP)
 * performance, adjusted for opponents. Ignores W/L records.
 * 
 * The "Barnes Margin" Calculation:
 * - YardDiff = HomeYards - AwayYards
 * - YardPoints = YardDiff / 15.0
 * - YppDiff = HomeYPP - AwayYPP
 * - YppPoints = YppDiff / 0.1
 * - ImpliedMargin = (YardPoints + YppPoints) / 2.0
 * 
 * Uses iterative SRS (Simple Rating System) to calculate opponent-adjusted ratings.
 * 
 * Usage:
 *   npx tsx apps/jobs/src/ratings/compute_ratings_v3.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { CFBDClient } from '../cfbd/cfbd-client';

const prisma = new PrismaClient();
const cfbdClient = new CFBDClient();

interface GameData {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeYards: number;
  awayYards: number;
  homeYPP: number;
  awayYPP: number;
  impliedMargin: number; // Calculated Barnes margin
}

interface TeamRating {
  teamId: string;
  rating: number;
}

/**
 * Helper to extract stat value from CFBD stats array
 * Stats array format: [{ category: "totalYards", stat: "450" }, ...]
 * The 'stat' field contains the actual value as a string
 */
function getStatValue(statsArray: any[], categoryName: string): number | null {
  if (!statsArray || !Array.isArray(statsArray)) return null;
  
  const statObj = statsArray.find((s: any) => s.category === categoryName);
  
  if (statObj && statObj.stat != null && statObj.stat !== null) {
    const value = Number(statObj.stat);
    if (!isNaN(value) && isFinite(value)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Extract yards from CFBD stats (/games/teams endpoint)
 * Stats is an array: [{ category: "totalYards", stat: "450" }, ...]
 */
function extractYards(stat: any): number | null {
  if (!stat) return null;
  
  // If stats is an array (from /games/teams endpoint)
  if (Array.isArray(stat.stats)) {
    // Try totalYards first
    const totalYards = getStatValue(stat.stats, 'totalYards');
    if (totalYards !== null) return totalYards;
    
    // Try yards
    const yards = getStatValue(stat.stats, 'yards');
    if (yards !== null) return yards;
    
    // Calculate from rushing + passing yards
    const rushYards = getStatValue(stat.stats, 'rushingYards');
    const passYards = getStatValue(stat.stats, 'passingYards');
    if (rushYards !== null && passYards !== null) {
      return rushYards + passYards;
    }
  }
  
  // Fallback: Direct totalYards field
  if (stat.totalYards != null && stat.totalYards !== null) {
    return Number(stat.totalYards);
  }
  
  // Fallback: yards field
  if (stat.yards != null && stat.yards !== null) {
    return Number(stat.yards);
  }
  
  return null;
}

/**
 * Extract plays from CFBD stats (/games/teams endpoint)
 */
function extractPlays(stat: any): number | null {
  if (!stat) return null;
  
  // If stats is an array (from /games/teams endpoint)
  if (Array.isArray(stat.stats)) {
    // Try totalPlays first
    const totalPlays = getStatValue(stat.stats, 'totalPlays');
    if (totalPlays !== null) return totalPlays;
    
    // Try plays
    const plays = getStatValue(stat.stats, 'plays');
    if (plays !== null) return plays;
    
    // Get rushing attempts
    const rushAtt = getStatValue(stat.stats, 'rushingAttempts');
    
    // Get passing attempts from completionAttempts (format: "completions-attempts")
    let passAtt: number | null = null;
    const completionAttempts = getStatValue(stat.stats, 'completionAttempts');
    if (completionAttempts === null) {
      // Try to parse from string format "21-30"
      const compAttObj = stat.stats.find((s: any) => s.category === 'completionAttempts');
      if (compAttObj && typeof compAttObj.stat === 'string') {
        const parts = compAttObj.stat.split('-');
        if (parts.length === 2) {
          passAtt = Number(parts[1]); // Second number is attempts
        }
      }
    } else {
      passAtt = completionAttempts;
    }
    
    // Calculate total plays
    if (rushAtt !== null && passAtt !== null) {
      return rushAtt + passAtt;
    }
  }
  
  // Fallback: Direct totalPlays field
  if (stat.totalPlays != null && stat.totalPlays !== null) {
    return Number(stat.totalPlays);
  }
  
  // Fallback: plays field
  if (stat.plays != null && stat.plays !== null) {
    return Number(stat.plays);
  }
  
  return null;
}

/**
 * Extract YPP from CFBD stats (calculate from yards/plays)
 */
function extractYPP(stat: any): number | null {
  if (!stat) return null;
  
  // Direct yardsPerPlay field
  if (stat.yardsPerPlay != null && stat.yardsPerPlay !== null) {
    return Number(stat.yardsPerPlay);
  }
  
  // Calculate from totalYards / totalPlays (from /games/teams endpoint)
  if (stat.totalYards != null && stat.totalPlays != null && 
      stat.totalYards !== null && stat.totalPlays !== null && Number(stat.totalPlays) > 0) {
    return Number(stat.totalYards) / Number(stat.totalPlays);
  }
  
  // Fallback: Calculate from yards / plays
  const yards = extractYards(stat);
  const plays = extractPlays(stat);
  if (yards !== null && plays !== null && plays > 0) {
    return yards / plays;
  }
  
  return null;
}

/**
 * Extract defensive yards from CFBD stats (proxy for opponent offense)
 * For /games/teams endpoint, we need to get opponent's stats from the game
 * This function will be called with the opponent's stat object
 */
function extractDefensiveYards(stat: any): number | null {
  if (!stat) return null;
  
  // If this is the opponent's stat object, use their totalYards (which is what they gained)
  if (stat.totalYards != null && stat.totalYards !== null) {
    return Number(stat.totalYards);
  }
  
  // Fallback: defense.yards (if available)
  if (stat.defense && stat.defense.yards != null && stat.defense.yards !== null) {
    return Number(stat.defense.yards);
  }
  
  // Calculate from passing + rushing yards
  if (stat.passing && stat.passing.yards != null && stat.rushing && stat.rushing.yards != null) {
    return Number(stat.passing.yards) + Number(stat.rushing.yards);
  }
  
  return null;
}

/**
 * Extract defensive plays from CFBD stats (opponent's plays)
 */
function extractDefensivePlays(stat: any): number | null {
  if (!stat) return null;
  
  // If this is the opponent's stat object, use their totalPlays
  if (stat.totalPlays != null && stat.totalPlays !== null) {
    return Number(stat.totalPlays);
  }
  
  // Fallback: defense.plays
  if (stat.defense && stat.defense.plays != null && stat.defense.plays !== null) {
    return Number(stat.defense.plays);
  }
  
  // Calculate from passing + rushing attempts
  if (stat.passing && stat.passing.attempts != null && stat.rushing && stat.rushing.attempts != null) {
    return Number(stat.passing.attempts) + Number(stat.rushing.attempts);
  }
  
  return null;
}

/**
 * Extract defensive YPP from CFBD stats (proxy for opponent offense YPP)
 * This is the opponent's YPP, so we calculate from their yards/plays
 */
function extractDefensiveYPP(stat: any): number | null {
  if (!stat) return null;
  
  // Direct yardsPerPlay
  if (stat.yardsPerPlay != null && stat.yardsPerPlay !== null) {
    return Number(stat.yardsPerPlay);
  }
  
  // Calculate from totalYards / totalPlays
  if (stat.totalYards != null && stat.totalPlays != null && 
      stat.totalYards !== null && stat.totalPlays !== null && Number(stat.totalPlays) > 0) {
    return Number(stat.totalYards) / Number(stat.totalPlays);
  }
  
  // Calculate from yards / plays
  const defYards = extractDefensiveYards(stat);
  const defPlays = extractDefensivePlays(stat);
  if (defYards !== null && defPlays !== null && defPlays > 0) {
    return defYards / defPlays;
  }
  
  return null;
}

/**
 * Fetch standard game stats from CFBD API using CFBDClient
 * Returns stats with yards, plays, turnovers (not advanced stats)
 * Fetches week by week since API requires week/team/conference parameter
 */
async function fetchCFBDGameStats(season: number, weeks: number[]): Promise<any[]> {
  console.log(`   Fetching standard game stats from CFBD for ${season}...`);
  const allStats: any[] = [];
  
  for (const week of weeks) {
    try {
      const weekStats = await cfbdClient.getTeamGameStats(season, week, undefined, 'regular');
      allStats.push(...weekStats);
      console.log(`   ✅ Week ${week}: ${weekStats.length} games`);
    } catch (error) {
      console.error(`   ⚠️  Week ${week}: Error fetching stats:`, error);
    }
  }
  
  console.log(`   ✅ Total: ${allStats.length} game records from CFBD`);
  
  
  return allStats;
}

/**
 * Fetch game-level stats and calculate Barnes margins
 */
async function fetchGameData(season: number): Promise<GameData[]> {
  console.log(`\n📊 Fetching game data for season ${season}...`);

  // Get all completed FBS games
  const games = await prisma.game.findMany({
    where: {
      season,
      status: 'final',
      homeScore: { not: null },
      awayScore: { not: null },
    },
    include: {
      homeTeam: {
        select: { id: true, name: true },
      },
      awayTeam: {
        select: { id: true, name: true },
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  console.log(`   Found ${games.length} completed games`);

  // Get unique weeks to fetch CFBD stats
  const weeks = [...new Set(games.map(g => g.week))].sort((a, b) => a - b);
  console.log(`   Weeks to fetch: ${weeks.join(', ')}`);

  // Fetch all CFBD stats for the season (week by week)
  const allCfbdStats = await fetchCFBDGameStats(season, weeks);

  // Create a map of gameId -> { home: stats, away: stats }
  // Match CFBD stats to our games by team names and week
  const gameStatsMap = new Map<string, { home?: any; away?: any }>();
  
  // Also create a lookup by CFBD gameId if available
  const cfbdGames = await prisma.cfbdGame.findMany({
    where: { season },
    select: {
      gameIdCfbd: true,
      homeTeamIdInternal: true,
      awayTeamIdInternal: true,
      week: true,
    },
  });
  
  // Create a map of our gameId -> CFBD gameIdCfbd
  const gameIdToCfbdId = new Map<string, string>();
  for (const game of games) {
    // Match by week and team IDs
    const cfbdGame = cfbdGames.find(cg => 
      cg.week === game.week &&
      ((cg.homeTeamIdInternal === game.homeTeamId && cg.awayTeamIdInternal === game.awayTeamId) ||
       (cg.homeTeamIdInternal === game.awayTeamId && cg.awayTeamIdInternal === game.homeTeamId))
    );
    if (cfbdGame) {
      gameIdToCfbdId.set(game.id, cfbdGame.gameIdCfbd);
    }
  }
  
  console.log(`   Mapped ${gameIdToCfbdId.size} games to CFBD IDs`);
  
  // Match CFBD stats to our games
  // CFBD /games/teams returns games with a teams array, not individual team records
  // Structure: { id: gameId, teams: [{ school: teamName, stats: { totalYards, totalPlays, ... } }] }
  for (const game of games) {
    const cfbdGameId = gameIdToCfbdId.get(game.id);
    let homeStats: any = null;
    let awayStats: any = null;
    
    // Find CFBD game by ID or by matching teams
    let cfbdGame: any = null;
    if (cfbdGameId) {
      // Try both 'id' and 'gameId' fields
      cfbdGame = allCfbdStats.find(g => 
        g.id === Number(cfbdGameId) || g.gameId === Number(cfbdGameId)
      );
    }
    
    
    if (!cfbdGame) {
      // Fallback: Match by team names (week might not be in CFBD response)
      const homeTeamName = game.homeTeam?.name;
      const awayTeamName = game.awayTeam?.name;
      
      if (homeTeamName && awayTeamName) {
        cfbdGame = allCfbdStats.find(g => {
          const teamNames = g.teams?.map((t: any) => t.team?.toLowerCase()) || [];
          return teamNames.includes(homeTeamName.toLowerCase()) && teamNames.includes(awayTeamName.toLowerCase());
        });
      }
    }
    
    if (cfbdGame && cfbdGame.teams && Array.isArray(cfbdGame.teams)) {
      const homeTeamName = game.homeTeam?.name;
      const awayTeamName = game.awayTeam?.name;
      
      if (!homeTeamName || !awayTeamName) continue;
      
      // Find home and away teams in CFBD response
      // CFBD uses 'team' field and 'homeAway' field
      const homeTeam = cfbdGame.teams.find((t: any) => 
        t.homeAway === 'home' || 
        (t.team?.toLowerCase() === homeTeamName.toLowerCase())
      );
      
      const awayTeam = cfbdGame.teams.find((t: any) => 
        t.homeAway === 'away' || 
        (t.team?.toLowerCase() === awayTeamName.toLowerCase())
      );
      
      
      if (homeTeam && homeTeam.stats) {
        homeStats = {
          stats: homeTeam.stats, // Keep the stats array
          team: homeTeam.team || homeTeamName,
          homeAway: 'home',
        };
      }
      
      if (awayTeam && awayTeam.stats) {
        awayStats = {
          stats: awayTeam.stats, // Keep the stats array
          team: awayTeam.team || awayTeamName,
          homeAway: 'away',
        };
      }
    }

    if (homeStats || awayStats) {
      gameStatsMap.set(game.id, {
        home: homeStats || null,
        away: awayStats || null,
      });
    }
  }
  
  console.log(`   Matched ${gameStatsMap.size} games with CFBD stats`);
  
  const gamesWithBothStats = Array.from(gameStatsMap.values()).filter(g => g.home && g.away).length;
  const gamesWithOneStat = Array.from(gameStatsMap.values()).filter(g => (g.home && !g.away) || (!g.home && g.away)).length;
  console.log(`   Games with both home and away stats: ${gamesWithBothStats}`);
  console.log(`   Games with one stat (will use defensive proxy): ${gamesWithOneStat}`);
  
  if (gamesWithBothStats === 0 && gamesWithOneStat === 0) {
    console.log(`   ⚠️  WARNING: No games matched with CFBD stats. Check team name matching.`);
  }

  const gameData: GameData[] = [];
  let skippedNoStats = 0;
  let skippedNoYards = 0;
  let skippedNoYPP = 0;
  let usedDefensiveProxy = 0;

  for (const game of games) {
    const stats = gameStatsMap.get(game.id);
    if (!stats || (!stats.home && !stats.away)) {
      skippedNoStats++;
      continue; // Skip games without any stats
    }

    let homeYards: number | null = null;
    let awayYards: number | null = null;
    let homeYPP: number | null = null;
    let awayYPP: number | null = null;

    // Strategy: Use defensive stats as proxy for opponent offense
    if (stats.home && stats.away) {
      // We have both teams' stats - use them directly
      homeYards = extractYards(stats.home);
      homeYPP = extractYPP(stats.home);
      awayYards = extractYards(stats.away);
      awayYPP = extractYPP(stats.away);
    } else if (stats.home) {
      // We only have home team stats
      homeYards = extractYards(stats.home);
      homeYPP = extractYPP(stats.home);
      
      // Use home defense as proxy for away offense
      awayYards = extractDefensiveYards(stats.home);
      awayYPP = extractDefensiveYPP(stats.home);
      if (awayYards !== null && awayYPP !== null) {
        usedDefensiveProxy++;
      }
    } else if (stats.away) {
      // We only have away team stats
      awayYards = extractYards(stats.away);
      awayYPP = extractYPP(stats.away);
      
      // Use away defense as proxy for home offense
      homeYards = extractDefensiveYards(stats.away);
      homeYPP = extractDefensiveYPP(stats.away);
      if (homeYards !== null && homeYPP !== null) {
        usedDefensiveProxy++;
      }
    }

    // Skip if we can't get required data
    if (homeYards === null || awayYards === null) {
      skippedNoYards++;
      // Debug first few failures
      if (skippedNoYards <= 2) {
        console.log(`   ⚠️  Debug: Game ${game.id}`);
        if (stats.home) {
          console.log(`      Home rawJson exists: ${!!stats.home.rawJson}`);
          if (stats.home.rawJson) {
            const raw = stats.home.rawJson as any;
            console.log(`      Home rawJson.yards: ${raw.yards}`);
            console.log(`      Home rawJson.plays: ${raw.plays}`);
            console.log(`      Home rawJson.yardsPerPlay: ${raw.yardsPerPlay}`);
            console.log(`      Home rawJson.offense?.yardsPerPlay: ${raw.offense?.yardsPerPlay}`);
            console.log(`      Home rawJson.defense?.yards: ${raw.defense?.yards}`);
            console.log(`      Home rawJson.defense?.plays: ${raw.defense?.plays}`);
            console.log(`      Home rawJson.defense?.yardsPerPlay: ${raw.defense?.yardsPerPlay}`);
          }
        }
        if (stats.away) {
          console.log(`      Away rawJson exists: ${!!stats.away.rawJson}`);
          if (stats.away.rawJson) {
            const raw = stats.away.rawJson as any;
            console.log(`      Away rawJson keys: ${Object.keys(raw).join(', ')}`);
            if (raw.defense) {
              console.log(`      Away rawJson.defense keys: ${Object.keys(raw.defense).join(', ')}`);
            }
            if (raw.offense) {
              console.log(`      Away rawJson.offense keys: ${Object.keys(raw.offense).join(', ')}`);
            }
          }
        }
      }
      continue;
    }

    if (homeYPP === null || awayYPP === null) {
      skippedNoYPP++;
      continue;
    }

    // Calculate Barnes Margin
    const yardDiff = homeYards - awayYards;
    const yardPoints = yardDiff / 15.0;
    
    const yppDiff = homeYPP - awayYPP;
    const yppPoints = yppDiff / 0.1;
    
    const impliedMargin = (yardPoints + yppPoints) / 2.0;

    gameData.push({
      gameId: game.id,
      homeTeamId: game.homeTeamId.toLowerCase(),
      awayTeamId: game.awayTeamId.toLowerCase(),
      homeYards,
      awayYards,
      homeYPP,
      awayYPP,
      impliedMargin,
    });
  }

  console.log(`   ✅ Processed ${gameData.length} games with complete stats`);
  console.log(`   📊 Used defensive stats as proxy: ${usedDefensiveProxy} games`);
  console.log(`   ⚠️  Skipped: ${skippedNoStats} (no stats), ${skippedNoYards} (no yards), ${skippedNoYPP} (no YPP)`);
  return gameData;
}

/**
 * Calculate Barnes ratings using iterative SRS
 */
function calculateBarnesRatings(gameData: GameData[]): Map<string, number> {
  console.log(`\n🧮 Calculating Barnes ratings using iterative SRS...`);

  // Get all unique team IDs
  const teamIds = new Set<string>();
  for (const game of gameData) {
    teamIds.add(game.homeTeamId);
    teamIds.add(game.awayTeamId);
  }

  // Initialize all teams at 0
  const ratings = new Map<string, number>();
  for (const teamId of teamIds) {
    ratings.set(teamId, 0);
  }

  // Iterative SRS loop (1000 iterations)
  const ITERATIONS = 1000;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const newRatings = new Map<string, { sum: number; count: number }>();

    // Initialize new ratings
    for (const teamId of teamIds) {
      newRatings.set(teamId, { sum: 0, count: 0 });
    }

    // Process each game
    for (const game of gameData) {
      const homeRating = ratings.get(game.homeTeamId) || 0;
      const awayRating = ratings.get(game.awayTeamId) || 0;

      // Home team: impliedMargin + opponentRating
      const homeNew = newRatings.get(game.homeTeamId)!;
      homeNew.sum += game.impliedMargin + awayRating;
      homeNew.count += 1;

      // Away team: -impliedMargin + opponentRating
      const awayNew = newRatings.get(game.awayTeamId)!;
      awayNew.sum += -game.impliedMargin + homeRating;
      awayNew.count += 1;
    }

    // Update ratings
    for (const teamId of teamIds) {
      const newRating = newRatings.get(teamId)!;
      if (newRating.count > 0) {
        ratings.set(teamId, newRating.sum / newRating.count);
      }
    }
  }

  // Normalize (average = 0)
  const avgRating = Array.from(ratings.values()).reduce((sum, r) => sum + r, 0) / ratings.size;
  for (const teamId of teamIds) {
    ratings.set(teamId, (ratings.get(teamId) || 0) - avgRating);
  }

  console.log(`   ✅ Completed ${ITERATIONS} iterations`);
  return ratings;
}

/**
 * Main function
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    let season = 2025;

    // Parse --season argument
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--season' && args[i + 1]) {
        season = parseInt(args[i + 1], 10);
        break;
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 V3 BARNES RATINGS COMPUTATION`);
    console.log(`${'='.repeat(70)}`);
    console.log(`   Season: ${season}`);
    console.log(`   Philosophy: Luck-adjusted ratings based on Net Yards + YPP`);
    console.log(`   Ignores: W/L records`);
    console.log();

    // Fetch game data
    const gameData = await fetchGameData(season);
    
    if (gameData.length === 0) {
      console.error('❌ No game data found. Make sure games are completed and stats are ingested.');
      process.exit(1);
    }

    // Calculate ratings
    const ratings = calculateBarnesRatings(gameData);

    // Get team names for display
    const teamIds = Array.from(ratings.keys());
    const teams = await prisma.team.findMany({
      where: {
        id: { in: teamIds },
      },
      select: {
        id: true,
        name: true,
      },
    });
    const teamNameMap = new Map(teams.map(t => [t.id.toLowerCase(), t.name]));

    // Save to database
    console.log(`\n💾 Saving ratings to TeamUnitGrades.barnesRating...`);
    let upserted = 0;
    let skipped = 0;

    for (const [teamId, rating] of ratings.entries()) {
      try {
        await prisma.teamUnitGrades.upsert({
          where: {
            teamId_season: {
              teamId,
              season,
            },
          },
          update: {
            barnesRating: rating,
          },
          create: {
            teamId,
            season,
            // Create with default values for other fields (will be filled by V2 script)
            offRunGrade: 0,
            defRunGrade: 0,
            offPassGrade: 0,
            defPassGrade: 0,
            offExplosiveness: 0,
            defExplosiveness: 0,
            havocGrade: 0,
            barnesRating: rating,
          },
        });
        upserted++;
      } catch (error: any) {
        console.error(`   ⚠️  Failed to upsert rating for ${teamId}: ${error.message}`);
        skipped++;
      }
    }

    console.log(`   ✅ Upserted ${upserted} ratings • skipped: ${skipped}`);

    // Display top 10 teams
    console.log(`\n🏆 TOP 10 BARNES RATINGS:\n`);
    const sortedRatings = Array.from(ratings.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (let i = 0; i < sortedRatings.length; i++) {
      const [teamId, rating] = sortedRatings[i];
      const teamName = teamNameMap.get(teamId) || teamId;
      console.log(`   ${(i + 1).toString().padStart(2)}. ${teamName.padEnd(30)} ${rating.toFixed(2)}`);
    }

    // Check specific teams mentioned in requirements
    const missouriId = teamIds.find(id => id.includes('missouri') || teamNameMap.get(id)?.toLowerCase().includes('missouri'));
    const alabamaId = teamIds.find(id => id.includes('alabama') || teamNameMap.get(id)?.toLowerCase().includes('alabama'));
    const oklahomaId = teamIds.find(id => id.includes('oklahoma') || teamNameMap.get(id)?.toLowerCase().includes('oklahoma'));

    if (missouriId) {
      const moRating = ratings.get(missouriId) || 0;
      const moName = teamNameMap.get(missouriId) || missouriId;
      console.log(`\n📊 ${moName}:`);
      console.log(`   Barnes Rating: ${moRating.toFixed(2)}`);
    }

    if (alabamaId) {
      const alRating = ratings.get(alabamaId) || 0;
      const alName = teamNameMap.get(alabamaId) || alabamaId;
      console.log(`\n📊 ${alName}:`);
      console.log(`   Barnes Rating: ${alRating.toFixed(2)}`);
    }

    if (oklahomaId) {
      const okRating = ratings.get(oklahomaId) || 0;
      const okName = teamNameMap.get(oklahomaId) || oklahomaId;
      console.log(`\n📊 ${okName}:`);
      console.log(`   Barnes Rating: ${okRating.toFixed(2)}`);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Barnes ratings computation complete!`);
    console.log(`${'='.repeat(70)}\n`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

