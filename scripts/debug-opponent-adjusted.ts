/**
 * Debug script to check opponent-adjusted joins
 * Verifies team_off and opp_def are from different teams
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const week = 8;
  
  console.log('\n======================================================================');
  console.log('🔍 DEBUG: OPPONENT-ADJUSTED JOINS');
  console.log('======================================================================\n');
  
  // Get a sample CFBD game
  const cfbdGame = await prisma.cfbdGame.findFirst({
    where: { season, week },
  });
  
  if (!cfbdGame) {
    console.log('No CFBD game found');
    await prisma.$disconnect();
    return;
  }
  
  console.log(`Sample game: ${cfbdGame.homeTeamIdInternal} vs ${cfbdGame.awayTeamIdInternal}`);
  console.log(`Game ID CFBD: ${cfbdGame.gameIdCfbd}\n`);
  
  // Get efficiency stats for home team
  const homeEff = await prisma.cfbdEffTeamGame.findUnique({
    where: {
      gameIdCfbd_teamIdInternal: {
        gameIdCfbd: cfbdGame.gameIdCfbd,
        teamIdInternal: cfbdGame.homeTeamIdInternal,
      },
    },
  });
  
  // Get efficiency stats for away team
  const awayEff = await prisma.cfbdEffTeamGame.findUnique({
    where: {
      gameIdCfbd_teamIdInternal: {
        gameIdCfbd: cfbdGame.gameIdCfbd,
        teamIdInternal: cfbdGame.awayTeamIdInternal,
      },
    },
  });
  
  if (!homeEff || !awayEff) {
    console.log('Missing efficiency stats');
    await prisma.$disconnect();
    return;
  }
  
  console.log('Home team efficiency:');
  console.log(`  teamIdInternal: ${cfbdGame.homeTeamIdInternal}`);
  console.log(`  offSr: ${homeEff.offSr}`);
  console.log(`  defSr: ${homeEff.defSr}`);
  console.log(`  offExplosiveness: ${homeEff.isoPppOff}`);
  console.log(`  defExplosiveness: ${homeEff.isoPppDef}\n`);
  
  console.log('Away team efficiency:');
  console.log(`  teamIdInternal: ${cfbdGame.awayTeamIdInternal}`);
  console.log(`  offSr: ${awayEff.offSr}`);
  console.log(`  defSr: ${awayEff.defSr}`);
  console.log(`  offExplosiveness: ${awayEff.isoPppOff}`);
  console.log(`  defExplosiveness: ${awayEff.isoPppDef}\n`);
  
  // Compute opponent-adjusted for home team
  const homeOffSr = Number(homeEff.offSr);
  const awayDefSr = Number(awayEff.defSr);
  const offAdjSr = homeOffSr - awayDefSr;
  
  console.log('Home team opponent-adjusted:');
  console.log(`  teamOffSr: ${homeOffSr}`);
  console.log(`  oppDefSr: ${awayDefSr}`);
  console.log(`  offAdjSr = teamOffSr - oppDefSr = ${offAdjSr}\n`);
  
  // Compute opponent-adjusted for away team
  const awayOffSr = Number(awayEff.offSr);
  const homeDefSr = Number(homeEff.defSr);
  const awayOffAdjSr = awayOffSr - homeDefSr;
  
  console.log('Away team opponent-adjusted:');
  console.log(`  teamOffSr: ${awayOffSr}`);
  console.log(`  oppDefSr: ${homeDefSr}`);
  console.log(`  offAdjSr = teamOffSr - oppDefSr = ${awayOffAdjSr}\n`);
  
  // Check if they're the same (bug indicator)
  if (offAdjSr === 0 && awayOffAdjSr === 0) {
    console.log('❌ BUG DETECTED: Both offAdjSr values are 0!');
    console.log(`   This suggests teamOffSr === oppDefSr for both teams`);
  } else if (homeOffSr === awayDefSr) {
    console.log('❌ BUG DETECTED: homeOffSr === awayDefSr');
    console.log(`   This means we're comparing the same team's stats!`);
  } else if (awayOffSr === homeDefSr) {
    console.log('❌ BUG DETECTED: awayOffSr === homeDefSr');
    console.log(`   This means we're comparing the same team's stats!`);
  } else {
    console.log('✅ Joins look correct - team and opponent stats are different');
  }
  
  // Check 10 random games
  console.log('\n--- Checking 10 random games ---\n');
  const randomGames = await prisma.cfbdGame.findMany({
    where: { season, week },
    take: 10,
  });
  
  let zeroCount = 0;
  for (const game of randomGames) {
    const hEff = await prisma.cfbdEffTeamGame.findUnique({
      where: {
        gameIdCfbd_teamIdInternal: {
          gameIdCfbd: game.gameIdCfbd,
          teamIdInternal: game.homeTeamIdInternal,
        },
      },
    });
    const aEff = await prisma.cfbdEffTeamGame.findUnique({
      where: {
        gameIdCfbd_teamIdInternal: {
          gameIdCfbd: game.gameIdCfbd,
          teamIdInternal: game.awayTeamIdInternal,
        },
      },
    });
    
    if (hEff && aEff) {
      const hOffSr = Number(hEff.offSr);
      const aDefSr = Number(aEff.defSr);
      const diff = hOffSr - aDefSr;
      
      if (diff === 0) {
        zeroCount++;
        console.log(`  ${game.homeTeamIdInternal} vs ${game.awayTeamIdInternal}: offAdjSr = ${hOffSr} - ${aDefSr} = ${diff} ❌`);
      } else {
        console.log(`  ${game.homeTeamIdInternal} vs ${game.awayTeamIdInternal}: offAdjSr = ${hOffSr} - ${aDefSr} = ${diff} ✅`);
      }
    }
  }
  
  console.log(`\n${zeroCount}/10 games have offAdjSr = 0`);
  
  await prisma.$disconnect();
}

main().catch(console.error);


