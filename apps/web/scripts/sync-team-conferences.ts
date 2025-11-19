/**
 * Sync Team Conferences from CFBD Game Data
 * 
 * Updates Team.conference field based on conference data from CfbdGame table.
 * Uses the most common conference for each team across all their games in a season.
 * 
 * Usage:
 *   npx tsx apps/web/scripts/sync-team-conferences.ts --season 2025
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const yargs = require('yargs/yargs');
  const argv = yargs(process.argv.slice(2))
    .option('season', { type: 'number', demandOption: true })
    .option('dry-run', { type: 'boolean', default: false, description: 'Show what would be updated without making changes' })
    .parse();

  const season = Number(argv.season);
  const dryRun = argv['dry-run'] || false;

  if (isNaN(season) || season < 2000 || season > 2030) {
    throw new Error('Invalid season. Must be between 2000 and 2030');
  }

  console.log(`\n🔄 Syncing Team Conferences from CFBD Game Data (Season ${season})`);
  if (dryRun) {
    console.log('   ⚠️  DRY RUN MODE - No changes will be made\n');
  }
  console.log('='.repeat(70));

  // Strategy 1: Try CFBD game conference data first
  const cfbdGames = await prisma.cfbdGame.findMany({
    where: {
      season,
      OR: [
        { homeConference: { not: null } },
        { awayConference: { not: null } },
      ],
    },
    select: {
      homeTeamIdInternal: true,
      awayTeamIdInternal: true,
      homeConference: true,
      awayConference: true,
    },
  });

  console.log(`\n📊 Found ${cfbdGames.length} CFBD games with conference data`);

  // Strategy 2: Fallback to opponent conference patterns from Game table
  const internalGames = await prisma.game.findMany({
    where: { season },
    include: {
      homeTeam: { select: { id: true, conference: true } },
      awayTeam: { select: { id: true, conference: true } },
    },
  });

  console.log(`📊 Found ${internalGames.length} internal games for opponent pattern analysis`);

  // Build conference map for each team
  const teamConferences = new Map<string, Map<string, number>>();

  // Strategy 1: Use CFBD game conference data
  for (const game of cfbdGames) {
    // Home team
    if (game.homeConference) {
      const teamId = game.homeTeamIdInternal.toLowerCase();
      if (!teamConferences.has(teamId)) {
        teamConferences.set(teamId, new Map());
      }
      const confMap = teamConferences.get(teamId)!;
      const currentCount = confMap.get(game.homeConference) || 0;
      confMap.set(game.homeConference, currentCount + 1);
    }

    // Away team
    if (game.awayConference) {
      const teamId = game.awayTeamIdInternal.toLowerCase();
      if (!teamConferences.has(teamId)) {
        teamConferences.set(teamId, new Map());
      }
      const confMap = teamConferences.get(teamId)!;
      const currentCount = confMap.get(game.awayConference) || 0;
      confMap.set(game.awayConference, currentCount + 1);
    }
  }

  // Strategy 2: Use opponent conference patterns (if CFBD data is missing)
  // If a team plays mostly teams from one conference, they're likely in that conference
  for (const game of internalGames) {
    if (!game.homeTeam || !game.awayTeam) continue;

    const homeId = game.homeTeam.id.toLowerCase();
    const awayId = game.awayTeam.id.toLowerCase();

    // Home team's conference inferred from away team
    if (game.awayTeam.conference && game.awayTeam.conference !== 'Independent' && game.awayTeam.conference !== 'Unknown') {
      if (!teamConferences.has(homeId)) {
        teamConferences.set(homeId, new Map());
      }
      const confMap = teamConferences.get(homeId)!;
      const currentCount = confMap.get(game.awayTeam.conference) || 0;
      confMap.set(game.awayTeam.conference, currentCount + 1);
    }

    // Away team's conference inferred from home team
    if (game.homeTeam.conference && game.homeTeam.conference !== 'Independent' && game.homeTeam.conference !== 'Unknown') {
      if (!teamConferences.has(awayId)) {
        teamConferences.set(awayId, new Map());
      }
      const confMap = teamConferences.get(awayId)!;
      const currentCount = confMap.get(game.homeTeam.conference) || 0;
      confMap.set(game.homeTeam.conference, currentCount + 1);
    }
  }

  console.log(`\n📋 Found conference data for ${teamConferences.size} teams`);

  // Manual overrides for known conferences (when opponent data is also wrong)
  const MANUAL_OVERRIDES: Record<string, string> = {
    'san-diego-state': 'Mountain West',
    'boise-state': 'Mountain West',
    'fresno-state': 'Mountain West',
    'nevada': 'Mountain West',
    'hawai-i': 'Mountain West',
    'san-jos-state': 'Mountain West',
    'new-mexico': 'Mountain West',
    'wyoming': 'Mountain West',
    'colorado-state': 'Mountain West',
    'utah-state': 'Mountain West',
    'air-force': 'Mountain West',
    'unlv': 'Mountain West',
  };

  // Find most common conference for each team
  // Require minimum 2 games to avoid false positives from single games
  const MIN_GAMES_THRESHOLD = 2;
  const updates: Array<{ teamId: string; newConference: string; oldConference: string | null; gameCount: number }> = [];

  for (const [teamId, confMap] of teamConferences.entries()) {
    // Find most common conference
    let maxCount = 0;
    let mostCommonConf: string | null = null;

    for (const [conf, count] of confMap.entries()) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonConf = conf;
      }
    }

    // Check for manual override first
    const manualOverride = MANUAL_OVERRIDES[teamId];
    if (manualOverride) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, conference: true },
      });
      if (team && team.conference !== manualOverride) {
        updates.push({
          teamId: team.id,
          newConference: manualOverride,
          oldConference: team.conference || null,
          gameCount: 999, // Mark as manual override
        });
        continue;
      }
    }

    // Only update if we have enough evidence (minimum threshold)
    if (mostCommonConf && maxCount >= MIN_GAMES_THRESHOLD) {
      // Get current team data
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, conference: true },
      });

      if (team) {
        const oldConference = team.conference || null;
        // Skip if already correct or if new conference is "Independent" or "Unknown"
        if (oldConference !== mostCommonConf && 
            mostCommonConf !== 'Independent' && 
            mostCommonConf !== 'Unknown') {
          updates.push({
            teamId: team.id,
            newConference: mostCommonConf,
            oldConference,
            gameCount: maxCount,
          });
        }
      }
    }
  }

  console.log(`\n📝 Found ${updates.length} teams with conference mismatches:`);
  console.log('-'.repeat(70));

  // Show updates
  for (const update of updates) {
    const team = await prisma.team.findUnique({
      where: { id: update.teamId },
      select: { name: true },
    });
    console.log(`\n${team?.name || update.teamId}:`);
    console.log(`   Current: ${update.oldConference || 'NULL'}`);
    if (update.gameCount === 999) {
      console.log(`   New:     ${update.newConference} (manual override)`);
    } else {
      console.log(`   New:     ${update.newConference} (from ${update.gameCount} games)`);
    }
  }

  // Apply updates
  if (!dryRun && updates.length > 0) {
    console.log(`\n\n💾 Updating ${updates.length} teams...`);
    let updated = 0;
    let errors = 0;

    for (const update of updates) {
      try {
        await prisma.team.update({
          where: { id: update.teamId },
          data: { conference: update.newConference },
        });
        updated++;
      } catch (error: any) {
        console.error(`   ❌ Failed to update ${update.teamId}: ${error.message}`);
        errors++;
      }
    }

    console.log(`\n✅ Updated ${updated} teams`);
    if (errors > 0) {
      console.log(`   ⚠️  ${errors} errors`);
    }
  } else if (dryRun) {
    console.log(`\n\n⚠️  DRY RUN - No changes made. Run without --dry-run to apply updates.`);
  } else {
    console.log(`\n\n✅ All teams already have correct conferences!`);
  }

  console.log('\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

