import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Pick Delaware vs Middle Tennessee from Week 11 (one of the sign mismatches)
  const games = await prisma.game.findMany({
    where: {
      season: 2025,
      week: 11,
      OR: [
        { homeTeam: { slug: { contains: 'delaware' } } },
        { awayTeam: { slug: { contains: 'delaware' } } },
      ],
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      marketLines: {
        where: { lineType: 'spread' },
        orderBy: { timestamp: 'desc' },
        take: 20,
      },
    },
  });
  
  console.log(`Found ${games.length} games`);
  
  for (const game of games) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Game ID: ${game.id}`);
    console.log(`Matchup: ${game.homeTeam.name} (home) vs ${game.awayTeam.name} (away)`);
    console.log(`Date: ${game.date}`);
    console.log(`Neutral: ${game.neutralSite}`);
    console.log(`Status: ${game.status}`);
    
    // Get ratings
    const homeRating = await prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season: 2025,
          teamId: game.homeTeamId,
          modelVersion: 'v2_7_sos7_shr12',
        },
      },
    });
    
    const awayRating = await prisma.teamSeasonRating.findUnique({
      where: {
        season_teamId_modelVersion: {
          season: 2025,
          teamId: game.awayTeamId,
          modelVersion: 'v2_7_sos7_shr12',
        },
      },
    });
    
    console.log(`\nRatings (v2_7_sos7_shr12):`);
    console.log(`  Home (${game.homeTeam.name}):`);
    console.log(`    teamId: ${game.homeTeamId}`);
    console.log(`    powerRating: ${homeRating?.powerRating}`);
    console.log(`    rating: ${homeRating?.rating}`);
    console.log(`    confidence: ${homeRating?.confidence}`);
    console.log(`  Away (${game.awayTeam.name}):`);
    console.log(`    teamId: ${game.awayTeamId}`);
    console.log(`    powerRating: ${awayRating?.powerRating}`);
    console.log(`    rating: ${awayRating?.rating}`);
    console.log(`    confidence: ${awayRating?.confidence}`);
    
    const homeVal = homeRating?.powerRating ?? homeRating?.rating ?? 0;
    const awayVal = awayRating?.powerRating ?? awayRating?.rating ?? 0;
    const ratingDiff = homeVal - awayVal;
    
    console.log(`\n  Rating Diff (home - away): ${ratingDiff.toFixed(2)}`);
    console.log(`  Interpretation: ${ratingDiff > 0 ? 'Home favored' : 'Away favored'} by ${Math.abs(ratingDiff).toFixed(2)} pts`);
    
    // Get market lines
    console.log(`\nMarket Lines (last 20, favorite-centric):`);
    for (const line of game.marketLines.slice(0, 10)) {
      const ts = line.timestamp ? new Date(line.timestamp).toISOString() : 'N/A';
      console.log(`  ${line.bookName?.padEnd(20)} ${line.lineValue}  @${ts}`);
    }
    
    // Compute pre-kick consensus
    const kickoff = game.date ? new Date(game.date) : null;
    if (kickoff) {
      const windowStart = new Date(kickoff.getTime() - 60 * 60 * 1000);
      const windowEnd = new Date(kickoff.getTime() + 5 * 60 * 1000);
      
      const preKickLines = game.marketLines.filter(line => {
        if (!line.timestamp) return false;
        const ts = new Date(line.timestamp);
        return ts >= windowStart && ts <= windowEnd;
      });
      
      console.log(`\nPre-kick window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);
      console.log(`Pre-kick lines: ${preKickLines.length}`);
      
      if (preKickLines.length > 0) {
        const spreadsByBook = new Map<string, number[]>();
        for (const line of preKickLines) {
          const book = line.bookName || 'unknown';
          const value = line.lineValue !== null ? Number(line.lineValue) : null;
          if (value === null || !isFinite(value)) continue;
          const fcValue = value < 0 ? value : -Math.abs(value);
          if (!spreadsByBook.has(book)) {
            spreadsByBook.set(book, []);
          }
          spreadsByBook.get(book)!.push(fcValue);
        }
        
        const dedupedSpreads: number[] = [];
        for (const [book, values] of spreadsByBook.entries()) {
          if (values.length === 0) continue;
          const sorted = [...values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          const median = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
          dedupedSpreads.push(median);
          console.log(`  ${book}: median=${median.toFixed(1)} (from ${values.length} values)`);
        }
        
        const sortedSpreads = [...dedupedSpreads].sort((a, b) => a - b);
        const mid = Math.floor(sortedSpreads.length / 2);
        const consensusFC = sortedSpreads.length % 2 === 0
          ? (sortedSpreads[mid - 1] + sortedSpreads[mid]) / 2
          : sortedSpreads[mid];
        
        console.log(`\nConsensus (favorite-centric): ${consensusFC.toFixed(1)}`);
        console.log(`Books: ${dedupedSpreads.length}`);
        
        const marketFavIsHome = consensusFC < 0;
        const marketSpreadHMA = marketFavIsHome ? -consensusFC : consensusFC;
        
        console.log(`\nConverted to home_minus_away: ${marketSpreadHMA.toFixed(1)}`);
        console.log(`Market favorite: ${marketFavIsHome ? game.homeTeam.name + ' (home)' : game.awayTeam.name + ' (away)'}`);
        
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`COMPARISON:`);
        console.log(`  Market spread (HMA):   ${marketSpreadHMA.toFixed(1)} (${marketSpreadHMA > 0 ? 'home favored' : 'away favored'})`);
        console.log(`  Rating diff (HMA):     ${ratingDiff.toFixed(1)} (${ratingDiff > 0 ? 'home favored' : 'away favored'})`);
        console.log(`  Sign match:            ${Math.sign(marketSpreadHMA) === Math.sign(ratingDiff) ? '✓' : '✗'}`);
      }
    }
  }
  
  await prisma.$disconnect();
}

main();

