/**
 * Check Conference Data Sources
 * 
 * Investigates where conference data is available in the database
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const teamId = 'san-diego-state';

  console.log(`\n🔍 CHECKING CONFERENCE DATA SOURCES\n`);
  console.log('='.repeat(70));

  // 1. Check Team table
  console.log('\n1️⃣  TEAM TABLE');
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, conference: true },
  });
  console.log(`   ${team?.name || teamId}: ${team?.conference || 'NULL'}`);

  // 2. Check CfbdGame table
  console.log('\n2️⃣  CFBD GAME TABLE');
  const cfbdGames = await prisma.cfbdGame.findMany({
    where: {
      season,
      OR: [
        { homeTeamIdInternal: teamId },
        { awayTeamIdInternal: teamId },
      ],
    },
    select: {
      homeTeamIdInternal: true,
      awayTeamIdInternal: true,
      homeConference: true,
      awayConference: true,
    },
    take: 5,
  });
  console.log(`   Found ${cfbdGames.length} games`);
  if (cfbdGames.length > 0) {
    console.log(`   Sample game:`);
    const sample = cfbdGames[0];
    console.log(`     Home: ${sample.homeTeamIdInternal} (${sample.homeConference || 'NULL'})`);
    console.log(`     Away: ${sample.awayTeamIdInternal} (${sample.awayConference || 'NULL'})`);
  }

  // 3. Check Game table (our internal games)
  console.log('\n3️⃣  GAME TABLE (Internal)');
  const games = await prisma.game.findMany({
    where: {
      season,
      OR: [
        { homeTeamId: teamId },
        { awayTeamId: teamId },
      ],
    },
    include: {
      homeTeam: { select: { conference: true } },
      awayTeam: { select: { conference: true } },
    },
    take: 5,
  });
  console.log(`   Found ${games.length} games`);
  if (games.length > 0) {
    console.log(`   Sample game:`);
    const sample = games[0];
    console.log(`     Home: ${sample.homeTeamId} (${sample.homeTeam?.conference || 'NULL'})`);
    console.log(`     Away: ${sample.awayTeamId} (${sample.awayTeam?.conference || 'NULL'})`);
  }

  // 4. Check if there's a team info or roster table
  console.log('\n4️⃣  CHECKING FOR OTHER CONFERENCE SOURCES');
  
  // Check TeamMembership - might have conference info
  const membership = await prisma.teamMembership.findFirst({
    where: {
      season,
      teamId: teamId,
    },
  });
  console.log(`   TeamMembership: ${membership ? 'exists' : 'not found'}`);

  // Check all SDSU games to see conference patterns
  console.log('\n5️⃣  SDSU GAME CONFERENCE ANALYSIS');
  const allSdsuGames = await prisma.game.findMany({
    where: {
      season,
      OR: [
        { homeTeamId: teamId },
        { awayTeamId: teamId },
      ],
    },
    include: {
      homeTeam: { select: { name: true, conference: true } },
      awayTeam: { select: { name: true, conference: true } },
    },
  });

  const conferences = new Map<string, number>();
  for (const game of allSdsuGames) {
    const isHome = game.homeTeamId === teamId;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    if (opponent?.conference) {
      const count = conferences.get(opponent.conference) || 0;
      conferences.set(opponent.conference, count + 1);
    }
  }

  console.log(`   Opponent conferences (${allSdsuGames.length} games):`);
  for (const [conf, count] of Array.from(conferences.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${conf}: ${count} games`);
  }

  // Most common opponent conference
  let maxCount = 0;
  let mostCommonConf: string | null = null;
  for (const [conf, count] of Array.from(conferences.entries())) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonConf = conf;
    }
  }

  if (mostCommonConf) {
    console.log(`\n   💡 Recommendation: SDSU likely in "${mostCommonConf}" (${maxCount} games vs teams in that conference)`);
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

