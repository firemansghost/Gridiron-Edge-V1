/**
 * CFBD Team Talent Job
 * 
 * Fetches team talent composite and recruiting data from CollegeFootballData API.
 * Stores talent index and recruiting class counts in recruiting table.
 * 
 * Usage:
 *   ts-node apps/jobs/src/stats/cfbd_talent.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface CFBDTeamTalent {
  team: string;
  conference: string;
  season: number;
  talent: number;
  recruiting: {
    rank: number;
    points: number;
    averageRating: number;
    commits: number;
    fiveStars: number;
    fourStars: number;
    threeStars: number;
  };
}

interface RecruitingData {
  teamId: string;
  season: number;
  teamTalentIndex?: number;
  fiveStar?: number;
  fourStar?: number;
  threeStar?: number;
  commits?: number;
  points?: number;
  nationalRank?: number;
  conferenceRank?: number;
  rawJson?: any;
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
 * Normalize team name to team ID
 */
function normalizeTeamId(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fetch team talent from CFBD API
 */
async function fetchTeamTalent(season: number): Promise<CFBDTeamTalent[]> {
  const apiKey = process.env.CFBD_API_KEY;
  if (!apiKey) {
    throw new Error('CFBD_API_KEY environment variable is required');
  }

  const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';
  const url = new URL(`${baseUrl}/talent`);
  url.searchParams.set('year', season.toString());

  console.log(`   [CFBD] Fetching team talent for ${season}...`);
  console.log(`   [CFBD] URL: ${url.toString()}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`   [CFBD] HTTP ${response.status} ${response.statusText}`);
      console.error(`   [CFBD] Error body: ${errorBody}`);
      throw new Error(`CFBD API error: ${response.status} ${response.statusText}`);
    }

    const data: CFBDTeamTalent[] = await response.json();
    console.log(`   [CFBD] Fetched ${data.length} team talent records for ${season}`);
    
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
function mapCFBDTalentToRecruiting(cfbdTalent: CFBDTeamTalent): RecruitingData | null {
  // Normalize team ID
  const teamId = normalizeTeamId(cfbdTalent.team);

  if (!teamId) {
    console.warn(`   [CFBD] Invalid team ID: team="${teamId}" for ${cfbdTalent.team}`);
    return null;
  }

  return {
    teamId,
    season: cfbdTalent.season,
    teamTalentIndex: cfbdTalent.talent,
    fiveStar: cfbdTalent.recruiting.fiveStars,
    fourStar: cfbdTalent.recruiting.fourStars,
    threeStar: cfbdTalent.recruiting.threeStars,
    commits: cfbdTalent.recruiting.commits,
    points: cfbdTalent.recruiting.points,
    nationalRank: cfbdTalent.recruiting.rank,
    conferenceRank: null, // CFBD doesn't provide conference rank in talent endpoint
    rawJson: cfbdTalent
  };
}

/**
 * Upsert recruiting data to database
 */
async function upsertRecruitingData(recruitingData: RecruitingData[]): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;

  for (const data of recruitingData) {
    try {
      await prisma.recruiting.upsert({
        where: {
          teamId_season: {
            teamId: data.teamId,
            season: data.season
          }
        },
        update: {
          teamTalentIndex: data.teamTalentIndex,
          fiveStar: data.fiveStar,
          fourStar: data.fourStar,
          threeStar: data.threeStar,
          commits: data.commits,
          points: data.points,
          nationalRank: data.nationalRank,
          conferenceRank: data.conferenceRank,
          rawJson: data.rawJson
        },
        create: {
          teamId: data.teamId,
          season: data.season,
          teamTalentIndex: data.teamTalentIndex,
          fiveStar: data.fiveStar,
          fourStar: data.fourStar,
          threeStar: data.threeStar,
          commits: data.commits,
          points: data.points,
          nationalRank: data.nationalRank,
          conferenceRank: data.conferenceRank,
          rawJson: data.rawJson
        }
      });
      upserted++;
    } catch (error) {
      console.error(`   [DB] Failed to upsert recruiting data for ${data.teamId}/${data.season}:`, error);
      errors++;
    }
  }

  return { upserted, errors };
}

/**
 * Main function
 */
async function main() {
  try {
    const args = parseArgs();
    
    console.log('🏈 CFBD Team Talent Job');
    console.log(`   Season: ${args.season}`);

    try {
      // Fetch team talent from CFBD
      const cfbdTalent = await fetchTeamTalent(args.season);
      
      // Map to our format
      const recruitingData: RecruitingData[] = [];
      for (const cfbdTalentRecord of cfbdTalent) {
        const data = mapCFBDTalentToRecruiting(cfbdTalentRecord);
        if (data) {
          recruitingData.push(data);
        }
      }

      console.log(`   Found ${recruitingData.length} team talent records`);

      if (recruitingData.length > 0) {
        // Upsert to database
        const { upserted, errors } = await upsertRecruitingData(recruitingData);
        
        console.log(`   ✅ Upserted ${upserted} records, ${errors} errors`);
        
        console.log('\n📊 Summary:');
        console.log(`   Records upserted: ${upserted}`);
        console.log(`   Errors: ${errors}`);
        console.log(`   Total processed: ${upserted + errors}`);
      } else {
        console.log(`   ℹ️  No team talent data found for ${args.season}`);
      }

    } catch (error) {
      console.error(`   ❌ Failed to process talent data:`, error);
    }

  } catch (error) {
    console.error('❌ Job failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
