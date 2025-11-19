/**
 * Quick check of SDSU ranking after conference adjustments
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const season = 2025;
  const teamId = 'san-diego-state';

  console.log(`\n🔍 CHECKING SDSU RANKING (Season ${season})\n`);
  console.log('='.repeat(70));

  // Get all V1 ratings sorted by power rating
  const ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion: 'v1',
    },
    include: {
      // Note: TeamSeasonRating doesn't have direct relation, need to join manually
    },
    orderBy: {
      powerRating: 'desc',
    },
  });

  // Get team names
  const teamIds = Array.from(new Set(ratings.map(r => r.teamId)));
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, conference: true },
  });
  const teamMap = new Map(teams.map(t => [t.id.toLowerCase(), t]));

  // Find SDSU
  const sdsuRating = ratings.find(r => r.teamId.toLowerCase() === teamId.toLowerCase());
  const sdsuTeam = teamMap.get(teamId.toLowerCase());

  if (sdsuRating && sdsuTeam) {
    const rank = ratings.findIndex(r => r.teamId.toLowerCase() === teamId.toLowerCase()) + 1;
    console.log(`\n📊 SDSU Ranking:`);
    console.log(`   Rank: #${rank} of ${ratings.length}`);
    console.log(`   Team: ${sdsuTeam.name}`);
    console.log(`   Conference: ${sdsuTeam.conference || 'NULL'}`);
    console.log(`   Power Rating: ${Number(sdsuRating.powerRating || 0).toFixed(2)}`);
    console.log(`   Games: ${sdsuRating.games}`);
  }

  // Show top 10
  console.log(`\n🏆 TOP 10 RATINGS:\n`);
  for (let i = 0; i < Math.min(10, ratings.length); i++) {
    const rating = ratings[i];
    const team = teamMap.get(rating.teamId.toLowerCase());
    const powerRating = Number(rating.powerRating || 0);
    const marker = rating.teamId.toLowerCase() === teamId.toLowerCase() ? ' ⭐ SDSU' : '';
    console.log(`   #${i + 1}. ${team?.name || rating.teamId}: ${powerRating.toFixed(2)} (${team?.conference || 'Unknown'})${marker}`);
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

