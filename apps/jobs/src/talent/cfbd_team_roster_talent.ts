/**
 * CFBD Team Roster Talent Job
 * 
 * Fetches roster talent composite (Team Talent Composite) from CollegeFootballData API.
 * This is the whole-roster strength for a season (prior signal for ratings).
 * 
 * Endpoint: CFBD /talent/teams?year={season}
 * Stores in: team_season_talent table
 * 
 * Usage:
 *   ts-node apps/jobs/src/talent/cfbd_team_roster_talent.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from '../../adapters/TeamResolver';

const prisma = new PrismaClient();
const teamResolver = new TeamResolver();

interface CFBDTeamTalent {
  team: string;
  conference: string;
  season: number;
  talent: number;
  // Optional recruiting data (if present, but we'll handle commits separately)
  recruiting?: {
    rank?: number;
    points?: number;
    averageRating?: number;
    commits?: number;
    fiveStars?: number;
    fourStars?: number;
    threeStars?: number;
  };
}

interface TalentData {
  teamId: string;
  season: number;
  talentComposite: number;
  fiveStar?: number;
  fourStar?: number;
  threeStar?: number;
  unrated?: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { season: number } {
  const args = process.argv.slice(2);
  let season = 2025;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--season' && i + 1 < args.length) {
      season = parseInt(args[i + 1]);
      i++;
    }
  }

  return { season };
}

/**
 * Fetch team roster talent from CFBD API
 */
async function fetchTeamTalent(season: number): Promise<CFBDTeamTalent[]> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}/talent`);
  url.searchParams.set('year', season.toString());

  console.log(`   [CFBD] Fetching roster talent for ${season}...`);
  console.log(`   [CFBD] URL: ${url.toString()}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'gridiron-edge-jobs/1.0'
      }
    });

    clearTimeout(timeout);

    if (process.env.DEBUG_CFBD === '1') {
      console.log(`   [CFBD] Response status: ${response.status}`);
      console.log(`   [CFBD] Response URL: ${response.url}`);
    }

    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get('location');
      console.error(`   [CFBD] Redirect detected: ${response.status} to ${location}`);
      throw new Error(`CFBD API redirected: ${response.status} to ${location}`);
    }

    const contentType = response.headers.get('content-type');
    const body = await response.text();
    
    if (!response.ok) {
      console.error(`   [CFBD] HTTP ${response.status} ${response.statusText}`);
      if (response.status === 401) {
        throw new Error(`CFBD API unauthorized (401) - check API key`);
      } else if (response.status === 403) {
        throw new Error(`CFBD API forbidden (403) - check API permissions`);
      } else if (response.status === 404) {
        throw new Error(`CFBD API not found (404) - check endpoint URL`);
      } else {
        throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
      }
    }

    if (!contentType || !contentType.includes('application/json')) {
      console.error(`   [CFBD] Invalid content-type: ${contentType}`);
      throw new Error(`CFBD API returned non-JSON content-type: ${contentType}`);
    }

    if (body.trim().startsWith('<')) {
      console.error(`   [CFBD] Received HTML response instead of JSON`);
      throw new Error('CFBD API returned HTML instead of JSON - likely an error page');
    }

    let data: CFBDTeamTalent[];
    try {
      data = JSON.parse(body) as CFBDTeamTalent[];
    } catch (parseError) {
      console.error(`   [CFBD] JSON parse error: ${parseError}`);
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }
    
    console.log(`   [CFBD] Fetched ${data.length} roster talent records for ${season}`);
    
    if (data.length > 0 && process.env.DEBUG_CFBD === '1') {
      console.log(`   [CFBD] Sample record:`, JSON.stringify(data[0], null, 2));
    }
    
    return data;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('CFBD API request timed out');
    }
    throw error;
  }
}

/**
 * Map CFBD team talent to our database format
 */
function mapCFBDTalentToTalentData(cfbdTalent: CFBDTeamTalent): TalentData | null {
  // Use TeamResolver to resolve team name to team ID
  const teamId = teamResolver.resolveTeam(cfbdTalent.team, 'college-football', { provider: 'cfbd' });

  if (!teamId) {
    console.warn(`   [CFBD] Could not resolve team: "${cfbdTalent.team}"`);
    return null;
  }

  return {
    teamId,
    season: cfbdTalent.season || 2025,
    talentComposite: cfbdTalent.talent,
    fiveStar: cfbdTalent.recruiting?.fiveStars,
    fourStar: cfbdTalent.recruiting?.fourStars,
    threeStar: cfbdTalent.recruiting?.threeStars,
    // Unrated count not available from CFBD, will be calculated if needed
    unrated: undefined,
  };
}

/**
 * Calculate blue chips percentage from star counts
 */
function calculateBlueChipsPct(talentData: TalentData): number | null {
  const total = (talentData.fiveStar || 0) + 
                (talentData.fourStar || 0) + 
                (talentData.threeStar || 0) + 
                (talentData.unrated || 0);
  
  if (total === 0) {
    return null;
  }
  
  const blueChips = (talentData.fiveStar || 0) + (talentData.fourStar || 0);
  return (blueChips / total) * 100.0;
}

/**
 * Upsert talent data to team_season_talent table with FBS filtering
 */
async function upsertTalentData(
  talentData: TalentData[], 
  season: number
): Promise<{ upserted: number; skippedMissingTeam: number; errors: number }> {
  let upserted = 0;
  let skippedMissingTeam = 0;
  let errors = 0;

  // Load FBS teams for this season (season-aware filtering)
  const fbsTeamIds = await teamResolver.loadFBSTeamsForSeason(season);
  console.log(`   [DB] Loaded ${fbsTeamIds.size} FBS teams for season ${season}`);

  // Check which teams exist in the database
  const teamIds = [...new Set(talentData.map(d => d.teamId))];
  const existingTeams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true }
  });
  const existingTeamIds = new Set(existingTeams.map(t => t.id));

  for (const data of talentData) {
    try {
      // Check if team exists in database
      if (!existingTeamIds.has(data.teamId)) {
        console.warn(`   [DB] Skipping ${data.teamId} - team not found in database`);
        skippedMissingTeam++;
        continue;
      }

      // Check if team is FBS for this season
      if (!fbsTeamIds.has(data.teamId)) {
        console.log(`   [DB] Skipping ${data.teamId} - not FBS for season ${season}`);
        skippedMissingTeam++;
        continue;
      }

      const blueChipsPct = calculateBlueChipsPct(data);

      await prisma.teamSeasonTalent.upsert({
        where: {
          season_teamId: {
            season: data.season,
            teamId: data.teamId
          }
        },
        update: {
          talentComposite: data.talentComposite,
          blueChipsPct: blueChipsPct,
          fiveStar: data.fiveStar || 0,
          fourStar: data.fourStar || 0,
          threeStar: data.threeStar || 0,
          unrated: data.unrated || 0,
          sourceUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          season: data.season,
          teamId: data.teamId,
          talentComposite: data.talentComposite,
          blueChipsPct: blueChipsPct,
          fiveStar: data.fiveStar || 0,
          fourStar: data.fourStar || 0,
          threeStar: data.threeStar || 0,
          unrated: data.unrated || 0,
          sourceUpdatedAt: new Date(),
        }
      });
      upserted++;
    } catch (error: any) {
      console.error(`   [DB] Failed to upsert talent data for ${data.teamId}/${data.season}:`, error.message);
      errors++;
    }
  }

  return { upserted, skippedMissingTeam, errors };
}

/**
 * Main function
 */
async function main() {
  try {
    const args = parseArgs();
    
    console.log('🏈 CFBD Team Roster Talent Job');
    console.log(`   Season: ${args.season}`);
    console.log(`   Table: team_season_talent`);
    console.log(`   Filter: FBS teams only\n`);

    // Fetch team talent from CFBD
    const cfbdTalent = await fetchTeamTalent(args.season);
    
    // Map to our format
    const talentData: TalentData[] = [];
    for (const cfbdTalentRecord of cfbdTalent) {
      const data = mapCFBDTalentToTalentData(cfbdTalentRecord);
      if (data) {
        talentData.push(data);
      }
    }

    console.log(`   Found ${talentData.length} team talent records\n`);

    if (talentData.length > 0) {
      // Upsert to database
      const { upserted, skippedMissingTeam, errors } = await upsertTalentData(talentData, args.season);
      
      console.log(`\n✅ Upsert complete:`);
      console.log(`   Upserted: ${upserted} records`);
      console.log(`   Skipped: ${skippedMissingTeam} (missing teams or non-FBS)`);
      console.log(`   Errors: ${errors}`);
      console.log(`   Total processed: ${talentData.length}`);
      
      // Calculate fill ratio
      const fbsTeamIds = await teamResolver.loadFBSTeamsForSeason(args.season);
      const fillRatio = fbsTeamIds.size > 0 ? (upserted / fbsTeamIds.size * 100).toFixed(1) : '0.0';
      console.log(`   Fill ratio: ${fillRatio}% (${upserted}/${fbsTeamIds.size} FBS teams)`);
    } else {
      console.log(`   ℹ️  No team talent data found for ${args.season}`);
    }

  } catch (error: any) {
    console.error('❌ Job failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

