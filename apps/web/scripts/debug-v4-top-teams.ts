/**
 * Debug Script: V4 Top Teams
 * 
 * Queries and displays the top 10 V4 ratings for a given season.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/debug-v4-top-teams.ts --season 2025
 */

import { prisma } from '../lib/prisma';
import { Command } from 'commander';

async function showV4TopTeams(season: number) {
  console.log(`\n🏆 V4 Top 10 – Season ${season}\n`);
  
  const ratings = await prisma.teamSeasonRating.findMany({
    where: {
      season,
      modelVersion: 'v4',
    },
    orderBy: {
      rating: 'desc',
    },
    take: 10,
  });
  
  if (ratings.length === 0) {
    console.log('   ⚠️  No V4 ratings found for this season.');
    console.log('   Run: npx tsx apps/jobs/src/ratings/compute_ratings_v4.ts --season', season);
    return;
  }
  
  // Get team IDs and fetch teams
  const teamIds = ratings.map(r => r.teamId);
  const teams = await prisma.team.findMany({
    where: {
      id: {
        in: teamIds,
      },
    },
  });
  
  // Create a map for quick lookup
  const teamMap = new Map(teams.map(t => [t.id, t]));
  
  for (let i = 0; i < ratings.length; i++) {
    const r = ratings[i];
    const team = teamMap.get(r.teamId);
    const teamName = team?.name || r.teamId;
    
    const rating = r.rating ? Number(r.rating) : 0;
    const off = r.offenseRating ? Number(r.offenseRating) : 0;
    const def = r.defenseRating ? Number(r.defenseRating) : 0;
    
    const ratingStr = rating.toFixed(1).padStart(6);
    const offStr = off.toFixed(1).padStart(6);
    const defStr = def.toFixed(1).padStart(6);
    
    console.log(`${(i + 1).toString().padStart(2)}) ${teamName.padEnd(20)} rating=${ratingStr}  off=${offStr}  def=${defStr}`);
  }
  
  console.log('');
}

async function main() {
  const program = new Command();
  
  program
    .option('--season <year>', 'Season to query', parseInt)
    .action(async (options) => {
      const season = options.season || 2025;
      
      try {
        await showV4TopTeams(season);
      } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
      } finally {
        await prisma.$disconnect();
      }
    });
  
  program.parse(process.argv);
}

main();

