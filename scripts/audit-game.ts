/**
 * Audit script to trace model spread calculation for a specific game
 */

import { prisma } from '../apps/web/lib/prisma';

const HFA = 2.0;

async function auditGame(gameId: string) {
  console.log(`\n🔍 AUDITING GAME: ${gameId}\n`);
  
  const game = await prisma.game.findFirst({
    where: { id: gameId },
    include: {
      homeTeam: true,
      awayTeam: true,
      matchupOutputs: {
        where: { modelVersion: 'v1.0.0' },
        take: 1
      },
      marketLines: {
        where: { lineType: 'spread' },
        orderBy: { timestamp: 'desc' },
        take: 5
      }
    }
  });

  if (!game) {
    console.error('❌ Game not found');
    return;
  }

  // Fetch ratings and stats separately
  const [homeRating, awayRating, homeStats, awayStats] = await Promise.all([
    prisma.teamSeasonRating.findFirst({
      where: { teamId: game.homeTeamId, season: 2025, modelVersion: 'v1' }
    }),
    prisma.teamSeasonRating.findFirst({
      where: { teamId: game.awayTeamId, season: 2025, modelVersion: 'v1' }
    }),
    prisma.teamSeasonStat.findFirst({
      where: { teamId: game.homeTeamId, season: 2025 }
    }),
    prisma.teamSeasonStat.findFirst({
      where: { teamId: game.awayTeamId, season: 2025 }
    })
  ]);

  console.log(`📋 GAME INFO:`);
  console.log(`   ${game.awayTeam.name} @ ${game.homeTeam.name}`);
  console.log(`   Neutral Site: ${game.neutralSite ? 'Yes' : 'No'}\n`);

  console.log(`⚡ POWER RATINGS:`);
  console.log(`   ${game.homeTeam.name} (Home):`);
  console.log(`     Power Rating: ${homeRating?.powerRating ?? 'NULL'}`);
  console.log(`     Rating: ${homeRating?.rating ?? 'NULL'}`);
  console.log(`     Confidence: ${homeRating?.confidence ?? 'NULL'}`);
  console.log(`   ${game.awayTeam.name} (Away):`);
  console.log(`     Power Rating: ${awayRating?.powerRating ?? 'NULL'}`);
  console.log(`     Rating: ${awayRating?.rating ?? 'NULL'}`);
  console.log(`     Confidence: ${awayRating?.confidence ?? 'NULL'}\n`);

  console.log(`📊 TEAM STATS:`);
  console.log(`   ${game.homeTeam.name}:`);
  console.log(`     EPA Off: ${homeStats?.epaOff ?? 'NULL'}`);
  console.log(`     EPA Def: ${homeStats?.epaDef ?? 'NULL'}`);
  console.log(`     YPP Off: ${homeStats?.yppOff ?? 'NULL'}`);
  console.log(`     YPP Def: ${homeStats?.yppDef ?? 'NULL'}`);
  console.log(`     Success Off: ${homeStats?.successOff ?? 'NULL'}`);
  console.log(`     Success Def: ${homeStats?.successDef ?? 'NULL'}`);
  console.log(`     Pace Off: ${homeStats?.paceOff ?? 'NULL'}`);
  console.log(`   ${game.awayTeam.name}:`);
  console.log(`     EPA Off: ${awayStats?.epaOff ?? 'NULL'}`);
  console.log(`     EPA Def: ${awayStats?.epaDef ?? 'NULL'}`);
  console.log(`     YPP Off: ${awayStats?.yppOff ?? 'NULL'}`);
  console.log(`     YPP Def: ${awayStats?.yppDef ?? 'NULL'}`);
  console.log(`     Success Off: ${awayStats?.successOff ?? 'NULL'}`);
  console.log(`     Success Def: ${awayStats?.successDef ?? 'NULL'}`);
  console.log(`     Pace Off: ${awayStats?.paceOff ?? 'NULL'}\n`);

  // Model Spread Calculation
  if (homeRating && awayRating) {
    const homePower = Number(homeRating.powerRating || homeRating.rating || 0);
    const awayPower = Number(awayRating.powerRating || awayRating.rating || 0);
    const hfa = game.neutralSite ? 0 : HFA;
    const modelSpread = homePower - awayPower + hfa;

    console.log(`🎯 MODEL SPREAD CALCULATION:`);
    console.log(`   Formula: modelSpread = homePower - awayPower + HFA`);
    console.log(`   Calculation: ${homePower.toFixed(2)} - ${awayPower.toFixed(2)} + ${hfa.toFixed(2)} = ${modelSpread.toFixed(2)}`);
    console.log(`   Sign Convention: NEGATIVE = Home favored, POSITIVE = Away favored`);
    console.log(`   Result: ${modelSpread < 0 ? game.homeTeam.name + ' favored by ' + Math.abs(modelSpread).toFixed(1) : game.awayTeam.name + ' favored by ' + modelSpread.toFixed(1)}\n`);

    // ATS Pick Logic
    const marketSpread = game.marketLines[0]?.lineValue ?? null;
    if (marketSpread !== null) {
      const spreadEdge = Math.abs(modelSpread - Number(marketSpread));
      console.log(`📈 ATS PICK LOGIC:`);
      console.log(`   Market Spread: ${Number(marketSpread).toFixed(1)} (${Number(marketSpread) < 0 ? game.homeTeam.name : game.awayTeam.name} favored)`);
      console.log(`   Model Spread: ${modelSpread.toFixed(1)} (${modelSpread < 0 ? game.homeTeam.name : game.awayTeam.name} favored)`);
      console.log(`   Edge: |${modelSpread.toFixed(1)} - ${Number(marketSpread).toFixed(1)}| = ${spreadEdge.toFixed(1)} points`);
      
      // Determine pick
      const modelFavorsHome = modelSpread < 0;
      const modelFavorsAway = modelSpread > 0;
      const pickTeam = modelFavorsHome ? game.homeTeam.name : game.awayTeam.name;
      const pickSide = modelFavorsHome ? `${game.homeTeam.name} ${marketSpread}` : `${game.awayTeam.name} +${Math.abs(Number(marketSpread))}`;
      
      console.log(`   Pick: ${pickSide} (Model favors ${pickTeam})\n`);
    }
  } else {
    console.log(`❌ Missing power ratings - cannot calculate model spread\n`);
  }

  // Matchup Output
  const matchupOutput = game.matchupOutputs[0];
  if (matchupOutput) {
    console.log(`📦 MATCHUP OUTPUT (from DB):`);
    console.log(`   Implied Spread: ${matchupOutput.impliedSpread ?? 'NULL'}`);
    console.log(`   Implied Total: ${matchupOutput.impliedTotal ?? 'NULL'}`);
    console.log(`   Win Prob: ${matchupOutput.winProb ?? 'NULL'}\n`);
  } else {
    console.log(`⚠️ No matchup output found in database\n`);
  }

  // Market Lines
  console.log(`💰 MARKET LINES (most recent 5 spreads):`);
  game.marketLines.forEach((line, i) => {
    console.log(`   ${i + 1}. ${line.bookName}: ${line.lineValue} (${new Date(line.timestamp).toLocaleString()}) [teamId: ${line.teamId || 'NULL'}]`);
  });

  await prisma.$disconnect();
}

// Run audit
const gameId = process.argv[2] || '2025-wk11-ohio-state-purdue';
auditGame(gameId).catch(console.error);

