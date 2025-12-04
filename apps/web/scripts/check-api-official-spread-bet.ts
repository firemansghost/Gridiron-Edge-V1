/**
 * Check what the API returns for officialSpreadBet
 */

function parseArgs(): { gameId?: string; season?: number; week?: number; home?: string; away?: string } {
  const args = process.argv.slice(2);
  const result: any = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--gameId' && i + 1 < args.length) {
      result.gameId = args[i + 1];
      i++;
    } else if (args[i] === '--season' && i + 1 < args.length) {
      result.season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--week' && i + 1 < args.length) {
      result.week = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--home' && i + 1 < args.length) {
      result.home = args[i + 1];
      i++;
    } else if (args[i] === '--away' && i + 1 < args.length) {
      result.away = args[i + 1];
      i++;
    }
  }
  
  return result;
}

async function main() {
  const args = parseArgs();
  let gameId = args.gameId;
  
  // If not provided, try to find by season/week/teams
  if (!gameId && args.season && args.week && args.home && args.away) {
    const { prisma } = await import('../lib/prisma');
    const game = await prisma.game.findFirst({
      where: {
        season: args.season,
        week: args.week,
        homeTeam: { name: { contains: args.home, mode: 'insensitive' } },
        awayTeam: { name: { contains: args.away, mode: 'insensitive' } },
      },
    });
    if (game) {
      gameId = game.id;
    } else {
      console.error(`Game not found: ${args.season} Week ${args.week}, ${args.away} @ ${args.home}`);
      process.exit(1);
    }
    await prisma.$disconnect();
  }
  
  if (!gameId) {
    gameId = '2025-wk15-unlv-boise-state'; // Default
  }
  
  try {
    const response = await fetch(`http://localhost:3000/api/game/${gameId}`);
    if (!response.ok) {
      console.error(`API returned ${response.status}: ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('API returned error:', data.error);
      return;
    }
    
    console.log('\n=== API Response for officialSpreadBet ===');
    console.log(JSON.stringify(data.officialSpreadBet, null, 2));
    
    if (data.officialSpreadBet) {
      console.log('\n=== Parsed officialSpreadBet ===');
      console.log(`Team: ${data.officialSpreadBet.teamName}`);
      console.log(`Line: ${data.officialSpreadBet.line}`);
      console.log(`Edge: ${data.officialSpreadBet.edge}`);
      console.log(`Grade: ${data.officialSpreadBet.grade}`);
      console.log(`Bet To: ${data.officialSpreadBet.betTo}`);
    } else {
      console.log('\n⚠️  officialSpreadBet is null');
      console.log('This means there is no official_flat_100 bet for this game.');
    }
    
    // Also check what bettablePick says
    console.log('\n=== bettablePick (for comparison) ===');
    if (data.picks?.spread?.bettablePick) {
      console.log(`Team: ${data.picks.spread.bettablePick.teamName}`);
      console.log(`Line: ${data.picks.spread.bettablePick.line}`);
      console.log(`Label: ${data.picks.spread.bettablePick.label}`);
      console.log(`Edge: ${data.picks.spread.bettablePick.edgePts}`);
    } else {
      console.log('bettablePick is null');
    }
    
  } catch (error) {
    console.error('Error calling API:', error);
    console.log('\n⚠️  Make sure the dev server is running on http://localhost:3000');
  }
}

main().catch(console.error);

