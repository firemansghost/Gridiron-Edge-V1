/**
 * CFBD Rankings ETL
 * 
 * Fetches poll rankings (AP, Coaches, CFP) from CollegeFootballData API
 * and upserts them into the team_rankings table.
 */

import { PrismaClient, PollType } from '@prisma/client';
import { TeamResolver } from '../../adapters/TeamResolver';

const prisma = new PrismaClient();

interface CFBDRanking {
  season: number;
  week: number;
  polls: Array<{
    poll: string; // "AP Top 25", "Coaches Poll", "Playoff Committee Rankings"
    ranks: Array<{
      rank: number;
      school: string;
      conference?: string;
      firstPlaceVotes?: number;
      points?: number;
    }>;
  }>;
}

/**
 * Map CFBD poll name to our PollType enum
 */
function mapPollType(cfbdPollName: string): PollType | null {
  const normalized = cfbdPollName.toLowerCase();
  
  if (normalized.includes('ap') || normalized.includes('associated press')) {
    return 'AP';
  }
  if (normalized.includes('coach') || normalized.includes('afca')) {
    return 'COACHES';
  }
  if (normalized.includes('playoff') || normalized.includes('cfp') || normalized.includes('committee')) {
    return 'CFP';
  }
  
  return null;
}

/**
 * Fetch rankings from CFBD API
 */
async function fetchCFBDRankings(season: number, week: number): Promise<CFBDRanking | null> {
  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const apiKey = process.env.CFBD_API_KEY;
  
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const url = new URL(`${baseUrl}/rankings`);
  url.searchParams.set('year', season.toString());
  url.searchParams.set('week', week.toString());
  url.searchParams.set('seasonType', 'regular');

  console.log(`📊 Fetching CFBD rankings for ${season} Week ${week}...`);
  console.log(`   URL: ${url.toString()}`);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`   [CFBD] HTTP ${response.status} ${response.statusText}`);
      console.error(`   [CFBD] Error body: ${errorBody}`);
      throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
    }

    const data: CFBDRanking[] = await response.json();
    
    if (!data || data.length === 0) {
      console.warn(`   ⚠️  No rankings found for ${season} Week ${week}`);
      return null;
    }

    // CFBD returns an array, but we expect one result per season/week
    const ranking = data.find(r => r.season === season && r.week === week) || data[0];
    
    console.log(`   ✅ Found ${ranking.polls.length} polls for ${season} Week ${week}`);
    
    return ranking;
  } catch (error) {
    console.error(`   ❌ Error fetching rankings:`, error);
    throw error;
  }
}

/**
 * Upsert rankings into database
 */
async function upsertRankings(
  season: number,
  week: number,
  ranking: CFBDRanking,
  teamResolver: TeamResolver
): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;

  for (const poll of ranking.polls) {
    const pollType = mapPollType(poll.poll);
    
    if (!pollType) {
      console.warn(`   ⚠️  Skipping unknown poll type: "${poll.poll}"`);
      continue;
    }

    console.log(`   📋 Processing ${pollType} poll (${poll.poll})...`);

    for (const rankEntry of poll.ranks) {
      // Resolve team name to team ID
      const teamId = teamResolver.resolveTeam(rankEntry.school, 'college-football', { provider: 'cfbd' });
      
      if (!teamId) {
        console.warn(`   ⚠️  Could not resolve team: ${rankEntry.school}`);
        errors++;
        continue;
      }

      try {
        await prisma.teamRanking.upsert({
          where: {
            season_week_pollType_teamId: {
              season,
              week,
              pollType,
              teamId,
            }
          },
          update: {
            rank: rankEntry.rank,
            points: rankEntry.points || null,
            firstPlaceVotes: rankEntry.firstPlaceVotes || null,
            source: 'cfbd',
            updatedAt: new Date(),
          },
          create: {
            season,
            week,
            pollType,
            teamId,
            rank: rankEntry.rank,
            points: rankEntry.points || null,
            firstPlaceVotes: rankEntry.firstPlaceVotes || null,
            source: 'cfbd',
          }
        });
        
        upserted++;
      } catch (error) {
        console.error(`   ❌ Error upserting ranking for ${rankEntry.school} (${teamId}):`, error);
        errors++;
      }
    }
  }

  return { upserted, errors };
}

/**
 * Main function
 */
async function main() {
  const yargs = require('yargs/yargs');
  const { hideBin } = require('yargs/helpers');
  const argv = yargs(hideBin(process.argv))
    .option('season', {
      type: 'number',
      demandOption: true,
      description: 'Season year (e.g., 2025)'
    })
    .option('weeks', {
      type: 'string',
      demandOption: true,
      description: 'Comma-separated list of weeks (e.g., "1,2,3") or "all" for all weeks'
    })
    .help()
    .parseSync();

  const season = argv.season;
  const weeksInput = argv.weeks;
  
  // Parse weeks
  let weeks: number[];
  if (weeksInput === 'all') {
    // For "all", we'll fetch the current week or a reasonable range
    // For now, let's fetch weeks 1-15 (regular season)
    weeks = Array.from({ length: 15 }, (_, i) => i + 1);
  } else {
    weeks = weeksInput.split(',').map(w => parseInt(w.trim())).filter(w => !isNaN(w));
  }

  if (weeks.length === 0) {
    console.error('❌ No valid weeks specified');
    process.exit(1);
  }

  console.log(`\n🚀 Starting CFBD Rankings ETL`);
  console.log(`   Season: ${season}`);
  console.log(`   Weeks: ${weeks.join(', ')}\n`);

  // Initialize TeamResolver
  const teamResolver = new TeamResolver();
  await teamResolver.loadFBSTeamsForSeason(season);

  let totalUpserted = 0;
  let totalErrors = 0;

  // Process each week
  for (const week of weeks) {
    try {
      const ranking = await fetchCFBDRankings(season, week);
      
      if (!ranking) {
        console.log(`   ⏭️  Skipping week ${week} (no rankings available)\n`);
        continue;
      }

      const { upserted, errors } = await upsertRankings(season, week, ranking, teamResolver);
      
      totalUpserted += upserted;
      totalErrors += errors;
      
      console.log(`   ✅ Week ${week}: ${upserted} rankings upserted, ${errors} errors\n`);
    } catch (error) {
      console.error(`   ❌ Error processing week ${week}:`, error);
      totalErrors++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total upserted: ${totalUpserted}`);
  console.log(`   Total errors: ${totalErrors}`);

  // Verify counts
  const counts = await prisma.teamRanking.groupBy({
    by: ['season', 'pollType'],
    where: { season },
    _count: { id: true }
  });

  console.log(`\n📈 Rankings by poll type:`);
  for (const count of counts) {
    console.log(`   ${count.pollType}: ${count._count.id} records`);
  }

  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { fetchCFBDRankings, upsertRankings, main };

