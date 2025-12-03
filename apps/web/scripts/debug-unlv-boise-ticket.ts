/**
 * Debug UNLV @ Boise State ticket wiring
 */

import { prisma } from '../lib/prisma';

async function main() {
  // Find UNLV @ Boise State game for 2025 (Fri Dec 5, 7:00 PM)
  const game = await prisma.game.findFirst({
    where: {
      season: 2025,
      homeTeam: {
        name: { contains: 'Boise', mode: 'insensitive' },
      },
      awayTeam: {
        name: { contains: 'UNLV', mode: 'insensitive' },
      },
    },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  if (!game) {
    console.log('Game not found');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nGame: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
  console.log(`Game ID: ${game.id}`);
  console.log(`Week: ${game.week}, Date: ${game.date}`);

  // Get market spread
  const marketSpread = await prisma.marketLine.findFirst({
    where: {
      gameId: game.id,
      lineType: 'spread',
    },
    orderBy: { timestamp: 'desc' },
  });

  console.log(`\nMarket Spread:`);
  if (marketSpread) {
    console.log(`  Line: ${marketSpread.lineValue}`);
    console.log(`  Team: ${marketSpread.teamId}`);
    console.log(`  Timestamp: ${marketSpread.timestamp}`);
  } else {
    console.log(`  No market spread found`);
  }

  // Get official_flat_100 bet
  const officialBet = await prisma.bet.findFirst({
    where: {
      gameId: game.id,
      strategyTag: 'official_flat_100',
      marketType: 'spread',
    },
  });

  console.log(`\nOfficial Bet (official_flat_100):`);
  if (officialBet) {
    console.log(`  Side: ${officialBet.side}`);
    console.log(`  Line/Price: ${officialBet.closePrice}`);
    console.log(`  Model Price: ${officialBet.modelPrice}`);
    console.log(`  Edge: ${officialBet.modelPrice && officialBet.closePrice ? Math.abs(Number(officialBet.modelPrice) - Number(officialBet.closePrice)) : 'N/A'}`);
    // Grade field not available on Bet model
    console.log(`  CLV: ${officialBet.clv || 'N/A'}`);
    console.log(`  Result: ${officialBet.result || 'pending'}`);
    
    // Determine bet team
    const betTeamId = officialBet.side === 'home' ? game.homeTeamId : game.awayTeamId;
    const betTeamName = officialBet.side === 'home' ? game.homeTeam.name : game.awayTeam.name;
    console.log(`  Bet Team: ${betTeamName} (${betTeamId})`);
    
    // Format the line
    const closePrice = officialBet.closePrice ? Number(officialBet.closePrice) : null;
    if (closePrice !== null) {
      const lineStr = closePrice >= 0 ? `+${closePrice.toFixed(1)}` : closePrice.toFixed(1);
      console.log(`  Bet Label: ${betTeamName} ${lineStr}`);
    }
  } else {
    console.log(`  No official bet found`);
  }

  // Get Hybrid V2 bet for comparison
  const hybridBet = await prisma.bet.findFirst({
    where: {
      gameId: game.id,
      strategyTag: 'hybrid_v2',
      marketType: 'spread',
    },
  });

  console.log(`\nHybrid V2 Bet:`);
  if (hybridBet) {
    console.log(`  Side: ${hybridBet.side}`);
    console.log(`  Line/Price: ${hybridBet.closePrice}`);
    console.log(`  Model Price: ${hybridBet.modelPrice}`);
    const betTeamId = hybridBet.side === 'home' ? game.homeTeamId : game.awayTeamId;
    const betTeamName = hybridBet.side === 'home' ? game.homeTeam.name : game.awayTeam.name;
    console.log(`  Bet Team: ${betTeamName} (${betTeamId})`);
  } else {
    console.log(`  No hybrid_v2 bet found`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

