/**
 * Investigate Week 12 ungraded bet and try to fill closePrice
 */

import { prisma } from '../lib/prisma';

async function investigateWeek12Bet() {
  console.log('\n🔍 Investigating Week 12 ungraded bet...\n');

  // Find the ungraded bet
  const bet = await prisma.bet.findFirst({
    where: {
      season: 2025,
      week: 12,
      result: null,
      source: 'strategy_run',
    },
    include: {
      game: {
        select: {
          id: true,
          date: true,
          homeScore: true,
          awayScore: true,
          status: true,
        },
      },
    },
  });

  if (!bet) {
    console.log('No ungraded bet found for Week 12');
    await prisma.$disconnect();
    return;
  }

  console.log('Bet details:');
  console.log(`  ID: ${bet.id}`);
  console.log(`  Strategy: ${bet.strategyTag}`);
  console.log(`  Market: ${bet.marketType}`);
  console.log(`  Side: ${bet.side}`);
  console.log(`  Game ID: ${bet.gameId}`);
  console.log(`  Model Price: ${bet.modelPrice}`);
  console.log(`  Close Price: ${bet.closePrice || 'NULL'}`);
  console.log(`  Stake: ${bet.stake}`);
  console.log('\nGame details:');
  console.log(`  Date: ${bet.game.date}`);
  console.log(`  Home Score: ${bet.game.homeScore}`);
  console.log(`  Away Score: ${bet.game.awayScore}`);
  console.log(`  Status: ${bet.game.status}`);

  // Check for market lines
  const lineType = bet.marketType === 'moneyline' ? 'moneyline' : bet.marketType;
  const kickoffTime = new Date(bet.game.date);

  console.log(`\n🔍 Searching for market lines (${lineType})...`);
  
  // Try to find line at or before kickoff
  const preKickoffLine = await prisma.marketLine.findFirst({
    where: {
      gameId: bet.gameId,
      lineType,
      timestamp: { lte: kickoffTime },
    },
    orderBy: { timestamp: 'desc' },
    select: {
      lineValue: true,
      bookName: true,
      timestamp: true,
    },
  });

  if (preKickoffLine) {
    console.log(`\n✅ Found pre-kickoff line:`);
    console.log(`  Value: ${preKickoffLine.lineValue}`);
    console.log(`  Book: ${preKickoffLine.bookName}`);
    console.log(`  Timestamp: ${preKickoffLine.timestamp}`);
    
    // Try to update the bet
    console.log(`\n💾 Updating bet with closePrice...`);
    await prisma.bet.update({
      where: { id: bet.id },
      data: {
        closePrice: preKickoffLine.lineValue,
      },
    });
    console.log('✅ Bet updated with closePrice');
  } else {
    // Try to find any line
    const anyLine = await prisma.marketLine.findFirst({
      where: {
        gameId: bet.gameId,
        lineType,
      },
      orderBy: { timestamp: 'desc' },
      select: {
        lineValue: true,
        bookName: true,
        timestamp: true,
      },
    });

    if (anyLine) {
      console.log(`\n⚠️  Found line but it's after kickoff:`);
      console.log(`  Value: ${anyLine.lineValue}`);
      console.log(`  Book: ${anyLine.bookName}`);
      console.log(`  Timestamp: ${anyLine.timestamp}`);
      console.log(`  Kickoff: ${kickoffTime.toISOString()}`);
      console.log(`\n💾 Updating bet with closePrice (using post-kickoff line)...`);
      await prisma.bet.update({
        where: { id: bet.id },
        data: {
          closePrice: anyLine.lineValue,
        },
      });
      console.log('✅ Bet updated with closePrice');
    } else {
      console.log(`\n❌ No market lines found for game ${bet.gameId}, lineType ${lineType}`);
    }
  }

  await prisma.$disconnect();
}

investigateWeek12Bet().catch(console.error);




