/**
 * Diagnostic Script: SDSU Ratings Data Investigation
 * 
 * Checks:
 * 1. How many games SDSU has in the database
 * 2. What conference SDSU is mapped to
 * 3. What the games count is in TeamSeasonRating
 * 4. Whether games are missing or just not counted
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const teamId = 'san-diego-state'; // Common team ID format
  
  console.log(`\n🔍 DIAGNOSING SDSU RATINGS DATA (Season ${season})\n`);
  console.log('='.repeat(70));

  // 1. Check Team table for SDSU
  console.log('\n1️⃣  TEAM TABLE DATA');
  console.log('-'.repeat(70));
  const teams = await prisma.team.findMany({
    where: {
      OR: [
        { id: { contains: 'san-diego' } },
        { id: { contains: 'sdsu' } },
        { name: { contains: 'San Diego' } },
        { name: { contains: 'SDSU' } },
      ],
    },
    select: {
      id: true,
      name: true,
      conference: true,
    },
  });

  if (teams.length === 0) {
    console.log('❌ No teams found matching SDSU');
    // Try to find by searching all teams
    const allTeams = await prisma.team.findMany({
      where: {
        name: { contains: 'Diego' },
      },
      select: { id: true, name: true, conference: true },
    });
    console.log(`Found ${allTeams.length} teams with "Diego" in name:`);
    allTeams.forEach(t => console.log(`  - ${t.id}: ${t.name} (${t.conference || 'NULL'})`));
  } else {
    teams.forEach(team => {
      console.log(`✅ Found: ${team.id}`);
      console.log(`   Name: ${team.name}`);
      console.log(`   Conference: ${team.conference || 'NULL (will show as Unknown)'}`);
    });
  }

  // 2. Check TeamSeasonRating for SDSU
  console.log('\n2️⃣  TEAM SEASON RATING DATA');
  console.log('-'.repeat(70));
  const sdsuTeamId = teams.length > 0 ? teams[0].id : teamId;
  
  const ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      teamId: {
        in: teams.length > 0 ? teams.map(t => t.id) : [teamId, 'san-diego-state', 'sdsu'],
      },
    },
    select: {
      teamId: true,
      modelVersion: true,
      games: true,
      powerRating: true,
      dataSource: true,
      confidence: true,
    },
  });

  if (ratings.length === 0) {
    console.log('❌ No ratings found for SDSU');
  } else {
    ratings.forEach(rating => {
      console.log(`✅ Model: ${rating.modelVersion}`);
      console.log(`   Team ID: ${rating.teamId}`);
      console.log(`   Games: ${rating.games}`);
      console.log(`   Power Rating: ${rating.powerRating}`);
      console.log(`   Data Source: ${rating.dataSource || 'NULL'}`);
      console.log(`   Confidence: ${rating.confidence ? (Number(rating.confidence) * 100).toFixed(1) + '%' : 'NULL'}`);
    });
  }

  // 3. Check actual games in database
  console.log('\n3️⃣  GAME DATA');
  console.log('-'.repeat(70));
  const sdsuIds = teams.length > 0 ? teams.map(t => t.id) : [teamId, 'san-diego-state', 'sdsu'];
  
  const games = await prisma.game.findMany({
    where: {
      season,
      OR: [
        { homeTeamId: { in: sdsuIds } },
        { awayTeamId: { in: sdsuIds } },
      ],
    },
    select: {
      id: true,
      week: true,
      date: true,
      homeTeamId: true,
      awayTeamId: true,
      status: true,
      homeScore: true,
      awayScore: true,
    },
    orderBy: {
      week: 'asc',
    },
  });

  console.log(`✅ Found ${games.length} games for SDSU in season ${season}`);
  if (games.length > 0) {
    console.log('\n   Games breakdown:');
    const statusCounts = games.reduce((acc, g) => {
      acc[g.status || 'unknown'] = (acc[g.status || 'unknown'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`     ${status}: ${count}`);
    });

    console.log('\n   Games by week:');
    games.forEach(game => {
      const isHome = sdsuIds.includes(game.homeTeamId);
      const opponent = isHome ? game.awayTeamId : game.homeTeamId;
      const score = isHome 
        ? `${game.homeScore || '?'}-${game.awayScore || '?'}`
        : `${game.awayScore || '?'}-${game.homeScore || '?'}`;
      console.log(`     Week ${game.week}: ${isHome ? 'vs' : '@'} ${opponent} (${game.status}) ${score}`);
    });
  } else {
    console.log('❌ No games found in database!');
  }

  // 4. Check TeamGameStat records
  console.log('\n4️⃣  TEAM GAME STATS DATA');
  console.log('-'.repeat(70));
  const gameStats = await prisma.teamGameStat.findMany({
    where: {
      season,
      teamId: { in: sdsuIds },
    },
    select: {
      gameId: true,
      week: true,
      teamId: true,
    },
  });

  console.log(`✅ Found ${gameStats.length} TeamGameStat records for SDSU`);
  if (gameStats.length > 0) {
    const weeks = Array.from(new Set(gameStats.map(gs => gs.week))).sort((a, b) => a - b);
    console.log(`   Weeks with stats: ${weeks.join(', ')}`);
  }

  // 5. Check TeamSeasonStat
  console.log('\n5️⃣  TEAM SEASON STATS DATA');
  console.log('-'.repeat(70));
  const seasonStats = await prisma.teamSeasonStat.findMany({
    where: {
      season,
      teamId: { in: sdsuIds },
    },
    select: {
      teamId: true,
      yppOff: true,
      epaOff: true,
      successOff: true,
    },
  });

  if (seasonStats.length > 0) {
    seasonStats.forEach(stat => {
      console.log(`✅ Team ID: ${stat.teamId}`);
      console.log(`   YPP Off: ${stat.yppOff || 'NULL'}`);
      console.log(`   EPA Off: ${stat.epaOff || 'NULL'}`);
      console.log(`   Success Off: ${stat.successOff || 'NULL'}`);
    });
  } else {
    console.log('❌ No TeamSeasonStat records found');
  }

  // 6. Summary and recommendations
  console.log('\n📊 SUMMARY & DIAGNOSIS');
  console.log('='.repeat(70));
  
  const rating = ratings.find(r => r.modelVersion === 'v1');
  const actualGames = games.filter(g => g.status === 'final' || g.status === 'completed').length;
  
  if (rating) {
    console.log(`\n🔴 ISSUE 1: Games Count Mismatch`);
    console.log(`   TeamSeasonRating.games: ${rating.games}`);
    console.log(`   Actual final games in DB: ${actualGames}`);
    if (rating.games !== actualGames) {
      console.log(`   ⚠️  MISMATCH! Rating shows ${rating.games} but DB has ${actualGames} final games`);
      console.log(`   💡 Fix: Update compute_ratings_v1.ts to count games from Game table`);
    }
  }

  if (teams.length > 0 && teams[0].conference) {
    if (teams[0].conference === 'Independent' || teams[0].conference === 'NULL') {
      console.log(`\n🔴 ISSUE 2: Conference Mapping`);
      console.log(`   Team.conference: ${teams[0].conference}`);
      console.log(`   ⚠️  SDSU should be in Mountain West or Pac-12, not Independent`);
      console.log(`   💡 Fix: Check CFBD team info sync to update conference field`);
    }
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

