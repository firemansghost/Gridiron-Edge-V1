/**
 * ESPN Injury Adapter
 * 
 * Fetches injury data from ESPN's unofficial API.
 * Requires no API key (public endpoint, but use responsibly).
 * 
 * NOTE: This is an unofficial API endpoint and may change without notice.
 * Implement robust error handling and monitor for changes.
 */

import { PrismaClient } from '@prisma/client';
import { TeamResolver } from './TeamResolver';

const prisma = new PrismaClient();

interface ESPNInjuryResponse {
  timestamp: string;
  status: string;
  season: {
    year: number;
    type: number;
    name: string;
    displayName: string;
  };
  injuries: Array<{
    id: string;
    displayName: string;
    injuries: Array<{
      id: string;
      longComment?: string;
      shortComment?: string;
      date: string;
      athlete: {
        firstName: string;
        lastName: string;
        displayName: string;
        shortName: string;
        position: {
          id: string;
          name: string;
          displayName: string;
          abbreviation: string; // "QB", "RB", "WR", etc.
        };
        team: {
          id: string;
          displayName: string;
          abbreviation: string;
          slug: string;
        };
      };
      notes?: {
        items: Array<{
          id: string;
          type: string;
          date: string;
          headline: string;
          text: string;
          source?: string;
        }>;
      };
      status?: {
        id: string;
        name: string;
        type: string;
        abbreviation: string;
      };
      type?: {
        id: string;
        name: string;
        description: string;
        abbreviation: string;
      };
    }>;
  }>;
}

/**
 * Map ESPN status to our InjurySeverity enum
 */
function mapESPNStatusToSeverity(espnStatus: string, statusType: string): 'OUT' | 'QUESTIONABLE' | 'PROBABLE' | 'DOUBTFUL' {
  const statusUpper = espnStatus.toUpperCase();
  const typeUpper = statusType.toUpperCase();

  if (statusUpper === 'OUT' || typeUpper.includes('OUT')) {
    return 'OUT';
  }
  if (statusUpper === 'QUESTIONABLE' || typeUpper.includes('QUESTIONABLE')) {
    return 'QUESTIONABLE';
  }
  if (statusUpper === 'PROBABLE' || typeUpper.includes('PROBABLE')) {
    return 'PROBABLE';
  }
  if (statusUpper === 'DOUBTFUL' || typeUpper.includes('DOUBTFUL')) {
    return 'DOUBTFUL';
  }
  
  // Default fallback based on status
  if (statusUpper === 'ACTIVE') {
    return 'PROBABLE'; // Active = likely to play
  }
  
  // Default to questionable if uncertain
  return 'QUESTIONABLE';
}

/**
 * Map ESPN position abbreviation to our position format
 */
function mapESPNPosition(positionAbbr: string): string {
  const positionMap: { [key: string]: string } = {
    'QB': 'QB',
    'RB': 'RB',
    'FB': 'RB', // Fullback maps to RB
    'WR': 'WR',
    'TE': 'WR', // Tight End maps to WR (receiving position)
    'OL': 'OL',
    'C': 'OL',
    'G': 'OL',
    'T': 'OL',
    'DL': 'DL',
    'DE': 'DL',
    'DT': 'DL',
    'NT': 'DL',
    'LB': 'DL', // Linebacker maps to DL (front seven)
    'DB': 'DB',
    'CB': 'DB',
    'S': 'DB',
    'K': 'DB', // Kicker maps to DB (defensive positions group)
    'P': 'DB',
  };
  
  return positionMap[positionAbbr.toUpperCase()] || positionAbbr.toUpperCase();
}

/**
 * Extract injury details from notes
 */
function extractInjuryDetails(injury: ESPNInjuryResponse['injuries'][0]['injuries'][0]): {
  bodyPart?: string;
  injuryType?: string;
  status?: string;
} {
  const details: { bodyPart?: string; injuryType?: string; status?: string } = {};
  
  // Try to extract from notes
  if (injury.notes && injury.notes.items && injury.notes.items.length > 0) {
    const latestNote = injury.notes.items[0];
    details.status = latestNote.text || latestNote.headline;
    
    // Try to extract body part/injury type from text
    const text = (latestNote.text || latestNote.headline || '').toLowerCase();
    const bodyParts = ['knee', 'shoulder', 'ankle', 'foot', 'hand', 'wrist', 'arm', 'elbow', 'hip', 'back', 'neck', 'head', 'concussion'];
    const injuryTypes = ['acl', 'mcl', 'pcl', 'concussion', 'hamstring', 'groin', 'calf', 'quad', 'tendon'];
    
    for (const part of bodyParts) {
      if (text.includes(part)) {
        details.bodyPart = part.charAt(0).toUpperCase() + part.slice(1);
        break;
      }
    }
    
    for (const type of injuryTypes) {
      if (text.includes(type)) {
        details.injuryType = type.toUpperCase();
        break;
      }
    }
  }
  
  // Also check short/long comments
  const comment = (injury.shortComment || injury.longComment || '').toLowerCase();
  if (!details.bodyPart) {
    const bodyParts = ['knee', 'shoulder', 'ankle', 'foot', 'hand', 'wrist', 'arm', 'elbow', 'hip', 'back', 'neck', 'head'];
    for (const part of bodyParts) {
      if (comment.includes(part)) {
        details.bodyPart = part.charAt(0).toUpperCase() + part.slice(1);
        break;
      }
    }
  }
  
  return details;
}

/**
 * Fetch and process injury data from ESPN
 */
export async function fetchESPNInjuries(season: number, weeks: number[]): Promise<void> {
  const teamResolver = new TeamResolver();
  
  try {
    const baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/injuries';
    
    console.log(`\n🏥 Fetching injury data from ESPN for season ${season}...\n`);
    
    // Fetch all injuries (ESPN doesn't filter by week, so we get everything)
    const response = await fetch(baseUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; GridironEdge/1.0)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status} ${response.statusText}`);
    }
    
    const data: ESPNInjuryResponse = await response.json();
    
    if (!data.injuries || data.injuries.length === 0) {
      console.log('⚠️  No injury data returned from ESPN');
      return;
    }
    
    console.log(`   Found ${data.injuries.length} teams with injury reports`);
    
    // Get all games for the specified season and weeks
    const games = await prisma.game.findMany({
      where: {
        season,
        week: { in: weeks },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
      },
    });
    
    if (games.length === 0) {
      console.log(`⚠️  No games found for season ${season}, weeks ${weeks.join(', ')}`);
      return;
    }
    
    console.log(`   Found ${games.length} games to process`);
    
    let totalProcessed = 0;
    let totalUpserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    // Process each team's injuries
    for (const teamInjuries of data.injuries) {
      const teamDisplayName = teamInjuries.displayName;
      
      // Resolve ESPN team name to our team ID
      const teamId = teamResolver.resolveTeam(teamDisplayName, 'college-football');
      
      if (!teamId) {
        console.log(`   ⚠️  Could not resolve team: ${teamDisplayName}`);
        totalSkipped += teamInjuries.injuries.length;
        continue;
      }
      
      // Find games for this team in the specified weeks
      const teamGames = games.filter(
        g => g.homeTeamId === teamId || g.awayTeamId === teamId
      );
      
      if (teamGames.length === 0) {
        // Team has injuries but no games in our specified weeks
        continue;
      }
      
      // Process each injury for this team
      for (const injury of teamInjuries.injuries) {
        const playerName = `${injury.athlete.firstName} ${injury.athlete.lastName}`;
        
        try {
          totalProcessed++;
          
          // Extract status - can be string or object
          let statusString = '';
          let statusType = '';
          
          if (typeof injury.status === 'string') {
            statusString = injury.status;
          } else if (injury.status && typeof injury.status === 'object') {
            statusString = injury.status.name || '';
            statusType = injury.status.type || '';
          }
          
          const statusAbbr = injury.type?.abbreviation || '';
          
          // Skip if status is "Active" (player is healthy/playing)
          if (statusString === 'Active' || statusAbbr === 'A') {
            totalSkipped++;
            continue;
          }
          
          const severity = mapESPNStatusToSeverity(statusString, statusType);
          const position = mapESPNPosition(injury.athlete.position.abbreviation);
          const injuryDetails = extractInjuryDetails(injury);
          
          // Process for each game this team is playing
          for (const game of teamGames) {
            // Check if injury already exists
            const existing = await prisma.injury.findFirst({
              where: {
                gameId: game.id,
                teamId: teamId,
                position: position,
                ...(playerName ? { playerName: playerName } : {}),
              },
            });
            
            const injuryData = {
              gameId: game.id,
              teamId: teamId,
              season: game.season,
              week: game.week,
              playerName: playerName,
              position: position,
              severity: severity,
              bodyPart: injuryDetails.bodyPart,
              injuryType: injuryDetails.injuryType,
              status: injuryDetails.status || injury.shortComment || injury.longComment,
              source: 'espn',
              reportedAt: injury.date ? new Date(injury.date) : new Date(),
            };
            
            if (existing) {
              await prisma.injury.update({
                where: { id: existing.id },
                data: injuryData,
              });
            } else {
              await prisma.injury.create({
                data: injuryData,
              });
            }
            
            totalUpserted++;
          }
          
        } catch (error: any) {
          console.error(`   ❌ Error processing injury for ${playerName} (${teamDisplayName}):`, error.message);
          totalErrors++;
        }
      }
    }
    
    console.log(`\n✅ Injury fetch complete:`);
    console.log(`   Processed: ${totalProcessed} injuries`);
    console.log(`   Upserted: ${totalUpserted} injury records`);
    console.log(`   Skipped: ${totalSkipped} (Active/healthy players)`);
    console.log(`   Errors: ${totalErrors}\n`);
    
  } catch (error: any) {
    console.error(`\n❌ Failed to fetch ESPN injuries:`, error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

