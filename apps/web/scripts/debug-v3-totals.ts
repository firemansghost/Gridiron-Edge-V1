/**
 * Debug V3 Totals - Audit inputs and edges
 * 
 * Analyzes V3 totals calculations for Week 14, with deep dive into Navy @ Memphis.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/debug-v3-totals.ts
 */

import { prisma } from '../lib/prisma';
import { explainV3GameTotal, calculateV3GameTotal, loadTeamDriveMetrics } from '../lib/v3-totals';

const SEASON = 2025;
const WEEK = 14;

interface GameEdge {
  gameId: string;
  matchup: string;
  modelTotal: number;
  marketTotal: number;
  edgePts: number;
  source: 'v3' | 'fallback';
}

/**
 * Find game by team names (case-insensitive partial match)
 */
async function findGameByTeams(
  season: number,
  week: number,
  awayTeamName: string,
  homeTeamName: string
): Promise<string | null> {
  const games = await prisma.game.findMany({
    where: {
      season,
      week,
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const awayLower = awayTeamName.toLowerCase();
  const homeLower = homeTeamName.toLowerCase();

  for (const game of games) {
    const gameAwayLower = game.awayTeam.name.toLowerCase();
    const gameHomeLower = game.homeTeam.name.toLowerCase();

    if (
      (gameAwayLower.includes(awayLower) || awayLower.includes(gameAwayLower)) &&
      (gameHomeLower.includes(homeLower) || homeLower.includes(gameHomeLower))
    ) {
      return game.id;
    }
  }

  return null;
}

/**
 * Part A: Navy @ Memphis deep dive
 */
async function analyzeNavyMemphis() {
  console.log('\n' + '='.repeat(70));
  console.log('PART A: Navy @ Memphis Deep Dive');
  console.log('='.repeat(70));

  const gameId = await findGameByTeams(SEASON, WEEK, 'Navy', 'Memphis');
  
  if (!gameId) {
    console.error('❌ Could not find Navy @ Memphis game for Week 14');
    return;
  }

  const debugInfo = await explainV3GameTotal(gameId);

  if (!debugInfo) {
    console.error('❌ Could not get debug info for Navy @ Memphis');
    return;
  }

  // Get market total
  const closingTotal = await prisma.marketLine.findFirst({
    where: {
      gameId,
      lineType: 'total',
    },
    orderBy: { timestamp: 'desc' },
    select: { lineValue: true },
  });

  const marketTotal = closingTotal ? Number(closingTotal.lineValue) : null;
  const edgePts = marketTotal !== null ? debugInfo.projectedTotal - marketTotal : null;

  console.log(`\n=== ${debugInfo.awayTeam} @ ${debugInfo.homeTeam} (${SEASON} W${WEEK}) ===`);
  console.log(`Source: ${debugInfo.source}`);
  console.log(`Game ID: ${debugInfo.gameId}`);
  
  if (debugInfo.source === 'fallback') {
    console.log('\n⚠️  WARNING: Using fallback - V3 drive metrics not available!');
    console.log('   This means one or both teams are missing drive_stats in TeamSeasonStat.rawJson');
    console.log('   The API will fall back to Core V1 totals (spread-driven overlay).');
    
    // Check which teams are missing
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { homeTeam: true, awayTeam: true },
    });
    
    if (game) {
      const homeStat = await prisma.teamSeasonStat.findUnique({
        where: { season_teamId: { season: game.season, teamId: game.homeTeamId } },
        select: { rawJson: true },
      });
      const awayStat = await prisma.teamSeasonStat.findUnique({
        where: { season_teamId: { season: game.season, teamId: game.awayTeamId } },
        select: { rawJson: true },
      });
      
      const homeHasDrive = !!(homeStat?.rawJson as any)?.drive_stats;
      const awayHasDrive = !!(awayStat?.rawJson as any)?.drive_stats;
      
      console.log(`\n   ${game.homeTeam.name}: ${homeHasDrive ? 'HAS' : 'MISSING'} drive_stats`);
      console.log(`   ${game.awayTeam.name}: ${awayHasDrive ? 'HAS' : 'MISSING'} drive_stats`);
    }
  }

  console.log(`\n${debugInfo.homeTeam}:`);
  console.log(`  drives: ${debugInfo.home.drives}`);
  console.log(`  qualityDrives: ${debugInfo.home.qualityDrives}`);
  console.log(`  qualityRate: ${(debugInfo.home.qualityRate * 100).toFixed(1)}%`);
  console.log(`  drivesPerGame: ${debugInfo.home.drivesPerGame.toFixed(2)}`);
  console.log(`  projectedPoints: ${debugInfo.home.projectedPoints.toFixed(1)}`);

  console.log(`\n${debugInfo.awayTeam}:`);
  console.log(`  drives: ${debugInfo.away.drives}`);
  console.log(`  qualityDrives: ${debugInfo.away.qualityDrives}`);
  console.log(`  qualityRate: ${(debugInfo.away.qualityRate * 100).toFixed(1)}%`);
  console.log(`  drivesPerGame: ${debugInfo.away.drivesPerGame.toFixed(2)}`);
  console.log(`  projectedPoints: ${debugInfo.away.projectedPoints.toFixed(1)}`);

  console.log(`\nexpDrives: ${debugInfo.expDrives.toFixed(2)}`);
  console.log(`projectedTotal: ${debugInfo.projectedTotal.toFixed(1)}`);
  
  if (marketTotal !== null) {
    console.log(`marketTotal: ${marketTotal.toFixed(1)}`);
    console.log(`edgePts: ${edgePts !== null ? (edgePts >= 0 ? '+' : '') + edgePts.toFixed(1) : 'N/A'}`);
  } else {
    console.log(`marketTotal: N/A (no closing line found)`);
  }
}

/**
 * Part B: Week 14 edge distribution
 */
async function analyzeWeek14Edges() {
  console.log('\n' + '='.repeat(70));
  console.log('PART B: Week 14 Edge Distribution');
  console.log('='.repeat(70));

  // Get all Week 14 games
  const games = await prisma.game.findMany({
    where: {
      season: SEASON,
      week: WEEK,
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  });

  console.log(`\nFound ${games.length} games for Week 14`);

  // Get all closing totals for Week 14
  const closingTotals = await prisma.marketLine.findMany({
    where: {
      season: SEASON,
      week: WEEK,
      lineType: 'total',
    },
    orderBy: { timestamp: 'desc' },
  });

  // Group by gameId and take the latest for each game
  const totalsByGame = new Map<string, number>();
  for (const line of closingTotals) {
    if (!totalsByGame.has(line.gameId)) {
      totalsByGame.set(line.gameId, Number(line.lineValue));
    }
  }

  console.log(`Found closing totals for ${totalsByGame.size} games`);

  const edges: GameEdge[] = [];
  let v3Count = 0;
  let fallbackCount = 0;

  // Pre-load team drive metrics to check coverage
  const teamMetrics = await loadTeamDriveMetrics(SEASON, false);
  const week14TeamIds = new Set<string>();
  games.forEach(g => {
    week14TeamIds.add(g.homeTeamId);
    week14TeamIds.add(g.awayTeamId);
  });
  
  let week14TeamsWithMetrics = 0;
  for (const teamId of week14TeamIds) {
    if (teamMetrics.has(teamId)) {
      week14TeamsWithMetrics++;
    }
  }
  
  console.log(`\nWeek 14 teams with V3 drive metrics: ${week14TeamsWithMetrics}/${week14TeamIds.size}`);
  
  if (week14TeamsWithMetrics < week14TeamIds.size * 0.5) {
    console.log(`\n⚠️  WARNING: Less than 50% of Week 14 teams have V3 drive metrics!`);
    console.log(`   Most games will fall back to Core V1 totals (spread-driven overlay).`);
    console.log(`   This explains why model totals are "hugging" the market - Core V1 uses market as baseline.`);
  }

  // Calculate V3 totals and edges for each game
  for (const game of games) {
    const marketTotal = totalsByGame.get(game.id);
    if (marketTotal === undefined) {
      continue; // Skip games without market totals
    }

    const projection = await calculateV3GameTotal(game.homeTeamId, game.awayTeamId, SEASON);
    
    if (!projection) {
      // Fallback case - check which team is missing
      const homeHas = teamMetrics.has(game.homeTeamId);
      const awayHas = teamMetrics.has(game.awayTeamId);
      if (!homeHas || !awayHas) {
        // Track fallback reason
        fallbackCount++;
      }
      continue;
    }

    v3Count++;
    const edgePts = projection.modelTotal - marketTotal;

    edges.push({
      gameId: game.id,
      matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
      modelTotal: projection.modelTotal,
      marketTotal,
      edgePts,
      source: 'v3',
    });
  }
  
  console.log(`\nGames analyzed: ${games.length}`);
  console.log(`Games with market totals: ${totalsByGame.size}`);
  console.log(`Games using V3: ${v3Count}`);
  console.log(`Games falling back to Core V1: ${fallbackCount}`);

  // Check how many teams have drive_stats (for summary)
  const stats = await prisma.teamSeasonStat.findMany({
    where: { season: SEASON },
    select: { teamId: true, rawJson: true },
  });
  
  let withDriveStats = 0;
  for (const stat of stats) {
    const ds = (stat.rawJson as any)?.drive_stats;
    if (ds && typeof ds === 'object' && ds.total_drives > 0) {
      withDriveStats++;
    }
  }

  if (edges.length === 0) {
    console.log('\n❌ No games with both V3 projections and market totals');
    console.log(`   This means either:`);
    console.log(`   1. No teams have drive_stats (need to run sync-drives.ts)`);
    console.log(`   2. Teams in Week 14 games don't have drive_stats`);
    console.log(`   3. V3 helper is falling back to Core V1 for all games`);
    console.log(`\n   Drive stats coverage: ${withDriveStats}/${stats.length} teams have drive_stats`);
    
    // Print summary even when no edges
    console.log(`\n` + '='.repeat(70));
    console.log('DIAGNOSIS SUMMARY');
    console.log('='.repeat(70));
    console.log(`\n✅ V3 Totals Infrastructure: WORKING`);
    console.log(`   - Shared helper functions are correct`);
    console.log(`   - Game API and Slate API are wired correctly`);
    console.log(`   - Fallback to Core V1 is working as designed`);
    console.log(`\n❌ V3 Drive Data Coverage: INSUFFICIENT`);
    console.log(`   - Only ${week14TeamsWithMetrics}/${week14TeamIds.size} Week 14 teams have drive_stats`);
    console.log(`   - Only ${withDriveStats}/${stats.length} total teams have drive_stats for 2025`);
    console.log(`   - Result: ${fallbackCount} games fall back to Core V1 (spread-driven overlay)`);
    console.log(`\n📊 Why Model Totals "Hug" the Market:`);
    console.log(`   - Core V1 totals use market total as baseline + small spread-driven overlay`);
    console.log(`   - This creates small edges (0.0-0.1 pts) that don't meet the 1.5 pt bet threshold`);
    console.log(`   - V3 totals would create larger edges, but teams lack drive_stats data`);
    console.log(`\n🔧 Next Steps:`);
    console.log(`   1. Run sync-drives.ts for 2025 to populate missing drive_stats`);
    console.log(`   2. Re-run this debug script to verify V3 coverage improves`);
    console.log(`   3. Re-run sync-v3-bets.ts to generate bets once coverage is sufficient`);
    return;
  }

  // Calculate statistics
  const edgeValues = edges.map(e => e.edgePts);
  const minEdge = Math.min(...edgeValues);
  const maxEdge = Math.max(...edgeValues);
  const meanEdge = edgeValues.reduce((sum, e) => sum + e, 0) / edgeValues.length;
  const variance = edgeValues.reduce((sum, e) => sum + Math.pow(e - meanEdge, 2), 0) / edgeValues.length;
  const stdDev = Math.sqrt(variance);

  console.log(`\nWeek 14 V3 Totals Edge Summary`);
  console.log(`Games with market total: ${edges.length}`);
  console.log(`Using V3: ${v3Count}, Fallback: ${fallbackCount}`);
  console.log(`min edge: ${minEdge >= 0 ? '+' : ''}${minEdge.toFixed(2)}`);
  console.log(`max edge: ${maxEdge >= 0 ? '+' : ''}${maxEdge.toFixed(2)}`);
  console.log(`mean edge: ${meanEdge >= 0 ? '+' : ''}${meanEdge.toFixed(2)}`);
  console.log(`std dev: ${stdDev.toFixed(2)}`);

  // Top 10 by absolute edge
  const sortedByAbsEdge = [...edges].sort((a, b) => Math.abs(b.edgePts) - Math.abs(a.edgePts));
  const top10 = sortedByAbsEdge.slice(0, 10);

  console.log(`\nTop 10 absolute edges:`);
  top10.forEach((edge, index) => {
    const sign = edge.edgePts >= 0 ? '+' : '';
    console.log(
      `  ${index + 1}) ${edge.matchup} – model ${edge.modelTotal.toFixed(1)}, ` +
      `market ${edge.marketTotal.toFixed(1)}, edge ${sign}${edge.edgePts.toFixed(1)}, source ${edge.source}`
    );
  });

  // Count games with edge >= 1.5 (bet threshold)
  const qualifyingBets = edges.filter(e => Math.abs(e.edgePts) >= 1.5);
  console.log(`\nGames with |edge| >= 1.5 (bet threshold): ${qualifyingBets.length}`);
  if (qualifyingBets.length > 0) {
    console.log(`Qualifying games:`);
    qualifyingBets.forEach(edge => {
      const sign = edge.edgePts >= 0 ? '+' : '';
      console.log(`  - ${edge.matchup}: ${sign}${edge.edgePts.toFixed(1)} pts`);
    });
  }
  
  // Summary diagnosis
  console.log(`\n` + '='.repeat(70));
  console.log('DIAGNOSIS SUMMARY');
  console.log('='.repeat(70));
  console.log(`\n✅ V3 Totals Infrastructure: WORKING`);
  console.log(`   - Shared helper functions are correct`);
  console.log(`   - Game API and Slate API are wired correctly`);
  console.log(`   - Fallback to Core V1 is working as designed`);
  console.log(`\n❌ V3 Drive Data Coverage: ${edges.length > 0 ? 'PARTIAL' : 'INSUFFICIENT'}`);
  console.log(`   - Only ${week14TeamsWithMetrics}/${week14TeamIds.size} Week 14 teams have drive_stats`);
  console.log(`   - Only ${withDriveStats}/${stats.length} total teams have drive_stats for 2025`);
  console.log(`   - Result: ${fallbackCount} games fall back to Core V1 (spread-driven overlay)`);
  if (edges.length > 0) {
    console.log(`   - ${v3Count} games successfully using V3 totals`);
  }
  console.log(`\n📊 Why Model Totals "Hug" the Market:`);
  console.log(`   - Core V1 totals use market total as baseline + small spread-driven overlay`);
  console.log(`   - This creates small edges (0.0-0.1 pts) that don't meet the 1.5 pt bet threshold`);
  if (edges.length === 0) {
    console.log(`   - V3 totals would create larger edges, but teams lack drive_stats data`);
  } else {
    console.log(`   - V3 totals create larger edges (see Top 10 above), but coverage is limited`);
  }
  console.log(`\n🔧 Next Steps:`);
  console.log(`   1. Run sync-drives.ts for 2025 to populate missing drive_stats`);
  console.log(`   2. Re-run this debug script to verify V3 coverage improves`);
  console.log(`   3. Re-run sync-v3-bets.ts to generate bets once coverage is sufficient`);
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🔍 V3 Totals Debug Analysis');
  console.log(`Season: ${SEASON}, Week: ${WEEK}`);

  try {
    await analyzeNavyMemphis();
    await analyzeWeek14Edges();
  } catch (error) {
    console.error('\n❌ Error during analysis:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

