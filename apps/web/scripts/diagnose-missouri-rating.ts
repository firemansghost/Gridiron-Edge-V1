/**
 * Diagnose Missouri Power Rating
 * 
 * Investigates why Missouri (top 25 team) has a negative V1 Power Rating (-34.18)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const teamName = 'Missouri';

  console.log(`\n🔍 DIAGNOSING MISSOURI POWER RATING (Season ${season})\n`);
  console.log('='.repeat(70));

  // Find Missouri team - try multiple approaches
  let team = await prisma.team.findFirst({
    where: {
      id: 'missouri', // Most likely ID
    },
    select: {
      id: true,
      name: true,
      conference: true,
    },
  });

  // If not found, try SEC conference search
  if (!team) {
    team = await prisma.team.findFirst({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: 'Missouri', mode: 'insensitive' } },
              { name: { contains: 'Mizzou', mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              { conference: 'SEC' },
              { conference: { contains: 'SEC', mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        conference: true,
      },
    });
  }

  if (!team) {
    console.error(`❌ Could not find ${teamName}`);
    console.log(`\n   Searching for all teams with "Missouri" in name...`);
    const allMissouri = await prisma.team.findMany({
      where: {
        name: { contains: 'Missouri', mode: 'insensitive' },
      },
      select: { id: true, name: true, conference: true },
    });
    if (allMissouri.length > 0) {
      console.log(`   Found ${allMissouri.length} teams:`);
      for (const t of allMissouri) {
        console.log(`     - ${t.name} (${t.id}) - ${t.conference || 'NULL'}`);
      }
    }
    return;
  }

  console.log(`\n📊 Team Info:`);
  console.log(`   Name: ${team.name}`);
  console.log(`   ID: ${team.id}`);
  console.log(`   Conference: ${team.conference || 'NULL'}`);

  // Get V1 rating
  const rating = await prisma.teamSeasonRating.findUnique({
    where: {
      season_teamId_modelVersion: {
        season,
        teamId: team.id,
        modelVersion: 'v1',
      },
    },
  });

  if (!rating) {
    console.error(`❌ No V1 rating found for ${team.name}`);
    return;
  }

  console.log(`\n📈 V1 Power Rating:`);
  console.log(`   Power Rating: ${Number(rating.powerRating || rating.rating || 0).toFixed(2)}`);
  console.log(`   Offense Rating: ${Number(rating.offenseRating || 0).toFixed(2)}`);
  console.log(`   Defense Rating: ${Number(rating.defenseRating || 0).toFixed(2)}`);
  console.log(`   Confidence: ${Number(rating.confidence || 0).toFixed(2)}`);
  console.log(`   Games: ${rating.games || 0}`);

  // Get game stats
  const games = await prisma.game.findMany({
    where: {
      season,
      OR: [
        { homeTeamId: team.id },
        { awayTeamId: team.id },
      ],
      status: 'final',
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  });

  console.log(`\n🎮 Game Results (${games.length} games):`);
  let wins = 0;
  let losses = 0;
  let totalPointsFor = 0;
  let totalPointsAgainst = 0;

  for (const game of games) {
    const isHome = game.homeTeamId === team.id;
    const opponent = isHome ? game.awayTeam.name : game.homeTeam.name;
    const pointsFor = isHome ? (game.homeScore || 0) : (game.awayScore || 0);
    const pointsAgainst = isHome ? (game.awayScore || 0) : (game.homeScore || 0);
    const won = pointsFor > pointsAgainst;

    if (won) wins++;
    else losses++;

    totalPointsFor += pointsFor;
    totalPointsAgainst += pointsAgainst;

    console.log(`   ${isHome ? 'vs' : '@'} ${opponent}: ${pointsFor}-${pointsAgainst} ${won ? 'W' : 'L'}`);
  }

  console.log(`\n📊 Season Summary:`);
  console.log(`   Record: ${wins}-${losses}`);
  console.log(`   Points For: ${totalPointsFor} (${(totalPointsFor / games.length).toFixed(1)} avg)`);
  console.log(`   Points Against: ${totalPointsAgainst} (${(totalPointsAgainst / games.length).toFixed(1)} avg)`);
  console.log(`   Point Differential: ${totalPointsFor - totalPointsAgainst} (${((totalPointsFor - totalPointsAgainst) / games.length).toFixed(1)} avg)`);

  // Get team game stats (efficiency metrics)
  const teamStats = await prisma.teamGameStat.findMany({
    where: {
      season,
      teamId: team.id,
      game: {
        status: 'final',
      },
    },
    select: {
      yppOff: true,
      yppDef: true,
      successOff: true,
      successDef: true,
      epaOff: true,
      epaDef: true,
    },
  });

  if (teamStats.length > 0) {
    const avgYppOff = teamStats.reduce((sum, s) => sum + (s.yppOff || 0), 0) / teamStats.length;
    const avgYppDef = teamStats.reduce((sum, s) => sum + (s.yppDef || 0), 0) / teamStats.length;
    const avgSuccessOff = teamStats.reduce((sum, s) => sum + (s.successOff || 0), 0) / teamStats.length;
    const avgSuccessDef = teamStats.reduce((sum, s) => sum + (s.successDef || 0), 0) / teamStats.length;
    const avgEpaOff = teamStats.reduce((sum, s) => sum + (s.epaOff || 0), 0) / teamStats.length;
    const avgEpaDef = teamStats.reduce((sum, s) => sum + (s.epaDef || 0), 0) / teamStats.length;

    console.log(`\n📈 Efficiency Metrics (${teamStats.length} games):`);
    console.log(`   YPP Offense: ${avgYppOff.toFixed(3)}`);
    console.log(`   YPP Defense: ${avgYppDef.toFixed(3)}`);
    console.log(`   Success Rate Offense: ${(avgSuccessOff * 100).toFixed(1)}%`);
    console.log(`   Success Rate Defense: ${(avgSuccessDef * 100).toFixed(1)}%`);
    console.log(`   EPA Offense: ${avgEpaOff.toFixed(3)}`);
    console.log(`   EPA Defense: ${avgEpaDef.toFixed(3)}`);
  }

  // Compare to other top teams
  console.log(`\n🏆 Comparison to Top Teams:`);
  const topRatings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion: 'v1',
    },
    orderBy: {
      powerRating: 'desc',
    },
    take: 10,
    include: {
      // Note: TeamSeasonRating doesn't have direct relation, need to join manually
    },
  });

  // Get team names for top ratings
  const topTeamIds = topRatings.map(r => r.teamId);
  const topTeams = await prisma.team.findMany({
    where: {
      id: { in: topTeamIds },
    },
    select: { id: true, name: true },
  });

  const teamMap = new Map(topTeams.map(t => [t.id.toLowerCase(), t.name]));

  console.log(`   Top 10 V1 Ratings:`);
  for (let i = 0; i < topRatings.length; i++) {
    const r = topRatings[i];
    const teamName = teamMap.get(r.teamId.toLowerCase()) || r.teamId;
    console.log(`   ${(i + 1).toString().padStart(2)}. ${teamName}: ${Number(r.powerRating || r.rating || 0).toFixed(2)}`);
  }

  // Find Missouri's rank
  const allRatings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion: 'v1',
    },
    orderBy: {
      powerRating: 'desc',
    },
  });

  const missouriRank = allRatings.findIndex(r => r.teamId.toLowerCase() === team.id.toLowerCase()) + 1;
  console.log(`\n📊 Missouri's Rank: #${missouriRank} of ${allRatings.length} teams`);

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

