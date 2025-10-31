import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed team_membership table with FBS teams for specified seasons
 * 
 * Usage:
 *   node apps/jobs/dist/src/seed-team-membership.js --seasons 2024,2025
 */
async function main() {
  const yargs = require('yargs/yargs');
  const argv = yargs(process.argv.slice(2))
    .option('seasons', {
      type: 'string',
      default: '2024,2025',
      description: 'Comma-separated list of seasons to seed'
    })
    .parse();
  
  const seasons = argv.seasons.split(',').map((s: string) => parseInt(s.trim()));
  
  console.log(`🌱 Seeding team_membership for seasons: ${seasons.join(', ')}`);

  // Step 1: Ensure Delaware and Missouri State exist in teams table (2025 FBS additions)
  const newTeams = [
    { id: 'delaware', name: 'Delaware', conference: 'C-USA', division: null },
    { id: 'missouri-state', name: 'Missouri State', conference: 'C-USA', division: null },
  ];

  for (const team of newTeams) {
    try {
      await prisma.team.upsert({
        where: { id: team.id },
        update: {},
        create: team,
      });
      console.log(`✅ Team created/verified: ${team.id}`);
    } catch (error) {
      console.warn(`⚠️  Could not upsert team ${team.id}:`, error);
    }
  }

  // Step 2: Load FBS team IDs from fbs_slugs.json
  const fs = require('fs');
  const path = require('path');
  
  const fbsSlugsPath = path.join(__dirname, '../../config/fbs_slugs.json');
  let fbsTeamIds: string[] = [];
  
  try {
    const fbsSlugsContent = fs.readFileSync(fbsSlugsPath, 'utf8');
    fbsTeamIds = JSON.parse(fbsSlugsContent);
    console.log(`📋 Loaded ${fbsTeamIds.length} FBS team IDs from fbs_slugs.json`);
  } catch (error) {
    console.warn(`⚠️  Could not load fbs_slugs.json, falling back to all teams:`, error);
    // Fallback: use all teams (less ideal but functional)
    const allTeams = await prisma.team.findMany({ select: { id: true } });
    fbsTeamIds = allTeams.map(t => t.id);
  }

  // Step 3: Insert team_membership records for each season
  let totalInserted = 0;
  
  for (const season of seasons) {
    console.log(`\n📅 Processing season ${season}...`);
    
    // Check existing memberships for this season
    const existing = await prisma.teamMembership.findMany({
      where: { season, level: 'fbs' },
      select: { teamId: true }
    });
    const existingIds = new Set(existing.map(e => e.teamId));
    
    // Add 2025-specific teams
    const teamIdsForSeason = season === 2025 
      ? [...fbsTeamIds, 'delaware', 'missouri-state']
      : fbsTeamIds;
    
    // Filter to only teams that exist in the database
    const existingTeamsInDb = await prisma.team.findMany({
      where: { id: { in: teamIdsForSeason } },
      select: { id: true }
    });
    const existingTeamIds = new Set(existingTeamsInDb.map(t => t.id));
    
    // Insert memberships for FBS teams not already in this season
    const toInsert = teamIdsForSeason
      .filter(id => existingTeamIds.has(id) && !existingIds.has(id))
      .map(id => ({ id }));
    
    if (toInsert.length === 0) {
      console.log(`   ✓ Season ${season} already has ${existing.length} FBS teams (skipping)`);
      continue;
    }

    // Batch insert (Prisma doesn't have createMany with ignoreDuplicates for postgres)
    let inserted = 0;
    for (const team of toInsert) {
      try {
        await prisma.teamMembership.create({
          data: {
            season,
            teamId: team.id.toLowerCase(),
            level: 'fbs'
          }
        });
        inserted++;
      } catch (error: any) {
        // P2002 = unique constraint violation (already exists)
        if (error.code !== 'P2002') {
          console.warn(`   ⚠️  Could not insert membership for ${team.id}:`, error.message);
        }
      }
    }
    
    totalInserted += inserted;
    console.log(`   ✓ Inserted ${inserted} new memberships for season ${season}`);
  }

  // Step 4: Verification
  console.log(`\n📊 Verification:`);
  for (const season of seasons) {
    const count = await prisma.teamMembership.count({
      where: { season, level: 'fbs' }
    });
    console.log(`   Season ${season}: ${count} FBS teams`);
  }

  console.log(`\n✅ Total memberships inserted: ${totalInserted}`);
  console.log(`✅ Seed complete!`);
}

main()
  .catch((error) => {
    console.error('❌ Error seeding team_membership:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

