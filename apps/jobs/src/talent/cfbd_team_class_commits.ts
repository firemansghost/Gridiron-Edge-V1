/**
 * CFBD Team Class Commits Job
 * 
 * Fetches recruiting class commits from CollegeFootballData API.
 * This is forward-looking data (new signings) that should be decayed into roster signal.
 * 
 * Endpoint: CFBD /recruiting/teams?year={season}
 * Stores in: team_class_commits table
 * 
 * Usage:
 *   ts-node apps/jobs/src/talent/cfbd_team_class_commits.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from '../../adapters/TeamResolver';

const prisma = new PrismaClient();
const teamResolver = new TeamResolver();

interface CFBDRecruitingTeam {
  team: string;
  conference: string;
  year: number; // Class year (season)
  rank?: number;
  totalPoints?: number;
  averageRating?: number;
  commits?: number;
  fiveStars?: number;
  fourStars?: number;
  threeStars?: number;
}

interface CommitsData {
  teamId: string;
  season: number;
  commitsTotal?: number;
  fiveStarCommits?: number;
  fourStarCommits?: number;
  threeStarCommits?: number;
  avgCommitRating?: number;
  classRank?: number;
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
 * Fetch recruiting class commits from CFBD API
 */
async function fetchRecruitingCommits(season: number): Promise<CFBDRecruitingTeam[]> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}/recruiting/teams`);
  url.searchParams.set('year', season.toString());

  console.log(`   [CFBD] Fetching recruiting class commits for ${season}...`);
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

    let data: CFBDRecruitingTeam[];
    try {
      data = JSON.parse(body) as CFBDRecruitingTeam[];
    } catch (parseError) {
      console.error(`   [CFBD] JSON parse error: ${parseError}`);
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }
    
    console.log(`   [CFBD] Fetched ${data.length} recruiting class records for ${season}`);
    
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
 * Map CFBD recruiting team to our database format
 */
function mapCFBDRecruitingToCommitsData(cfbdRecruiting: CFBDRecruitingTeam): CommitsData | null {
  // Use TeamResolver to resolve team name to team ID
  const teamId = teamResolver.resolveTeam(cfbdRecruiting.team, 'college-football', { provider: 'cfbd' });

  if (!teamId) {
    console.warn(`   [CFBD] Could not resolve team: "${cfbdRecruiting.team}"`);
    return null;
  }

  return {
    teamId,
    season: cfbdRecruiting.year || 2025,
    commitsTotal: cfbdRecruiting.commits,
    fiveStarCommits: cfbdRecruiting.fiveStars,
    fourStarCommits: cfbdRecruiting.fourStars,
    threeStarCommits: cfbdRecruiting.threeStars,
    avgCommitRating: cfbdRecruiting.averageRating,
    classRank: cfbdRecruiting.rank,
  };
}

/**
 * Upsert commits data to team_class_commits table with FBS filtering
 */
async function upsertCommitsData(
  commitsData: CommitsData[], 
  season: number
): Promise<{ upserted: number; skippedMissingTeam: number; errors: number }> {
  let upserted = 0;
  let skippedMissingTeam = 0;
  let errors = 0;

  // Load FBS teams for this season (season-aware filtering)
  const fbsTeamIds = await teamResolver.loadFBSTeamsForSeason(season);
  console.log(`   [DB] Loaded ${fbsTeamIds.size} FBS teams for season ${season}`);

  // Check which teams exist in the database
  const teamIds = [...new Set(commitsData.map(d => d.teamId))];
  const existingTeams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true }
  });
  const existingTeamIds = new Set(existingTeams.map(t => t.id));

  for (const data of commitsData) {
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

      await prisma.teamClassCommits.upsert({
        where: {
          season_teamId: {
            season: data.season,
            teamId: data.teamId
          }
        },
        update: {
          commitsTotal: data.commitsTotal || 0,
          fiveStarCommits: data.fiveStarCommits || 0,
          fourStarCommits: data.fourStarCommits || 0,
          threeStarCommits: data.threeStarCommits || 0,
          avgCommitRating: data.avgCommitRating,
          classRank: data.classRank,
          sourceUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          season: data.season,
          teamId: data.teamId,
          commitsTotal: data.commitsTotal || 0,
          fiveStarCommits: data.fiveStarCommits || 0,
          fourStarCommits: data.fourStarCommits || 0,
          threeStarCommits: data.threeStarCommits || 0,
          avgCommitRating: data.avgCommitRating,
          classRank: data.classRank,
          sourceUpdatedAt: new Date(),
        }
      });
      upserted++;
    } catch (error: any) {
      console.error(`   [DB] Failed to upsert commits data for ${data.teamId}/${data.season}:`, error.message);
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
    
    console.log('📝 CFBD Team Class Commits Job');
    console.log(`   Season: ${args.season}`);
    console.log(`   Table: team_class_commits`);
    console.log(`   Filter: FBS teams only\n`);

    // Fetch recruiting commits from CFBD
    const cfbdRecruiting = await fetchRecruitingCommits(args.season);
    
    // Map to our format
    const commitsData: CommitsData[] = [];
    for (const cfbdRecord of cfbdRecruiting) {
      const data = mapCFBDRecruitingToCommitsData(cfbdRecord);
      if (data) {
        commitsData.push(data);
      }
    }

    console.log(`   Found ${commitsData.length} recruiting class records\n`);

    if (commitsData.length > 0) {
      // Upsert to database
      const { upserted, skippedMissingTeam, errors } = await upsertCommitsData(commitsData, args.season);
      
      console.log(`\n✅ Upsert complete:`);
      console.log(`   Upserted: ${upserted} records`);
      console.log(`   Skipped: ${skippedMissingTeam} (missing teams or non-FBS)`);
      console.log(`   Errors: ${errors}`);
      console.log(`   Total processed: ${commitsData.length}`);
      
      // Calculate fill ratio
      const fbsTeamIds = await teamResolver.loadFBSTeamsForSeason(args.season);
      const fillRatio = fbsTeamIds.size > 0 ? (upserted / fbsTeamIds.size * 100).toFixed(1) : '0.0';
      console.log(`   Fill ratio: ${fillRatio}% (${upserted}/${fbsTeamIds.size} FBS teams)`);
    } else {
      console.log(`   ℹ️  No recruiting class data found for ${args.season}`);
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

