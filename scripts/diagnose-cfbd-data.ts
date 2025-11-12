/**
 * Diagnostic script to check CFBD efficiency data availability
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const weeks = [8, 9, 10, 11];
  
  console.log('\n======================================================================');
  console.log('🔍 CFBD DATA DIAGNOSTIC');
  console.log('======================================================================\n');
  console.log(`Season: ${season}, Weeks: ${weeks.join(', ')}\n`);
  
  // Check CFBD games
  const cfbdGames = await prisma.cfbdGame.findMany({
    where: { season, week: { in: weeks } },
  });
  console.log(`1. CFBD Games: ${cfbdGames.length} games\n`);
  
  // Check efficiency game stats
  const effStats = await prisma.cfbdEffTeamGame.findMany({
    where: {
      gameIdCfbd: { in: cfbdGames.map(g => g.gameIdCfbd) },
    },
    take: 10,
  });
  
  console.log(`2. Efficiency Stats Sample (first 10):`);
  if (effStats.length === 0) {
    console.log('   ❌ No efficiency stats found!\n');
  } else {
    const sample = effStats[0];
    console.log(`   Sample row:`);
    console.log(`     gameIdCfbd: ${sample.gameIdCfbd}`);
    console.log(`     teamIdInternal: ${sample.teamIdInternal}`);
    console.log(`     offEpa: ${sample.offEpa}`);
    console.log(`     offSr: ${sample.offSr}`);
    console.log(`     isoPppOff: ${sample.isoPppOff}`);
    console.log(`     ppoOff: ${sample.ppoOff}`);
    console.log(`     havocOff: ${sample.havocOff}`);
    console.log(`     defEpa: ${sample.defEpa}`);
    console.log(`     defSr: ${sample.defSr}`);
    console.log(`     isoPppDef: ${sample.isoPppDef}`);
    console.log(`     ppoDef: ${sample.ppoDef}`);
    console.log(`     havocDef: ${sample.havocDef}\n`);
  }
  
  // Count nulls
  const totalStats = await prisma.cfbdEffTeamGame.count({
    where: {
      gameIdCfbd: { in: cfbdGames.map(g => g.gameIdCfbd) },
    },
  });
  
  const nullCounts = {
    offEpa: await prisma.cfbdEffTeamGame.count({
      where: {
        gameIdCfbd: { in: cfbdGames.map(g => g.gameIdCfbd) },
        offEpa: null,
      },
    }),
    offSr: await prisma.cfbdEffTeamGame.count({
      where: {
        gameIdCfbd: { in: cfbdGames.map(g => g.gameIdCfbd) },
        offSr: null,
      },
    }),
    offPpa: await prisma.cfbdEffTeamGame.count({
      where: {
        gameIdCfbd: { in: cfbdGames.map(g => g.gameIdCfbd) },
        ppoOff: null,
      },
    }),
    havocOff: await prisma.cfbdEffTeamGame.count({
      where: {
        gameIdCfbd: { in: cfbdGames.map(g => g.gameIdCfbd) },
        havocOff: null,
      },
    }),
  };
  
  console.log(`3. Null Counts (out of ${totalStats} total stats):`);
  console.log(`   offEpa: ${nullCounts.offEpa} (${((nullCounts.offEpa / totalStats) * 100).toFixed(1)}%)`);
  console.log(`   offSr: ${nullCounts.offSr} (${((nullCounts.offSr / totalStats) * 100).toFixed(1)}%)`);
  console.log(`   ppoOff: ${nullCounts.offPpa} (${((nullCounts.offPpa / totalStats) * 100).toFixed(1)}%)`);
  console.log(`   havocOff: ${nullCounts.havocOff} (${((nullCounts.havocOff / totalStats) * 100).toFixed(1)}%)\n`);
  
  // Check if we have matching internal games
  const internalGames = await prisma.game.findMany({
    where: { season, week: { in: weeks }, status: 'final' },
  });
  console.log(`4. Internal Games: ${internalGames.length} games\n`);
  
  // Check matching
  let matched = 0;
  for (const cfbdGame of cfbdGames) {
    const key = `${cfbdGame.season}_${cfbdGame.week}_${cfbdGame.homeTeamIdInternal}_${cfbdGame.awayTeamIdInternal}`;
    const found = internalGames.find(g => 
      g.season === cfbdGame.season &&
      g.week === cfbdGame.week &&
      g.homeTeamId === cfbdGame.homeTeamIdInternal &&
      g.awayTeamId === cfbdGame.awayTeamIdInternal
    );
    if (found) matched++;
  }
  console.log(`5. Matched Games: ${matched} / ${cfbdGames.length}\n`);
  
  await prisma.$disconnect();
}

main().catch(console.error);

