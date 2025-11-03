#!/usr/bin/env node

/**
 * Manual Injury ETL
 * 
 * Allows manual entry and management of injury data.
 * This is a starting point - future versions can integrate with APIs (CFBD, ESPN, etc.)
 * 
 * Usage:
 *   node apps/jobs/dist/src/injuries/manual_injury_etl.js --season 2025 --week 10 --game-id <gameId> --team-id <teamId> --position QB --severity OUT
 */

import { PrismaClient, InjurySeverity } from '@prisma/client';

const prisma = new PrismaClient();

interface InjuryInput {
  gameId: string;
  teamId: string;
  season: number;
  week: number;
  playerName?: string;
  position: string;
  severity: InjurySeverity;
  bodyPart?: string;
  injuryType?: string;
  status?: string;
  source?: string;
  reportedAt?: Date;
}

/**
 * Upsert an injury record
 */
async function upsertInjury(input: InjuryInput): Promise<void> {
  try {
    // Verify game exists
    const game = await prisma.game.findUnique({
      where: { id: input.gameId },
      select: { id: true, season: true, week: true, homeTeamId: true, awayTeamId: true }
    });

    if (!game) {
      throw new Error(`Game ${input.gameId} not found`);
    }

    // Verify team is part of this game
    if (game.homeTeamId !== input.teamId && game.awayTeamId !== input.teamId) {
      throw new Error(`Team ${input.teamId} is not part of game ${input.gameId}`);
    }

    // Verify position is valid (matching adjustment-helpers.ts types)
    const validPositions = ['QB', 'OL', 'DL', 'WR', 'RB', 'DB'];
    if (!validPositions.includes(input.position.toUpperCase())) {
      console.warn(`⚠️  Warning: Position ${input.position} may not be recognized by adjustment calculations`);
    }

    // Upsert injury
    await prisma.injury.upsert({
      where: {
        // Use a composite key: game + team + position + severity for uniqueness
        // For simplicity, we'll use playerName + position if provided, otherwise position only
        id: input.playerName 
          ? `${input.gameId}-${input.teamId}-${input.position}-${input.playerName}`.toLowerCase().replace(/\s+/g, '-')
          : undefined,
      },
      update: {
        playerName: input.playerName,
        position: input.position.toUpperCase(),
        severity: input.severity,
        bodyPart: input.bodyPart,
        injuryType: input.injuryType,
        status: input.status,
        source: input.source || 'manual',
        reportedAt: input.reportedAt || new Date(),
        updatedAt: new Date(),
      },
      create: {
        id: input.playerName
          ? `${input.gameId}-${input.teamId}-${input.position}-${input.playerName}`.toLowerCase().replace(/\s+/g, '-')
          : undefined,
        gameId: input.gameId,
        teamId: input.teamId,
        season: input.season,
        week: input.week,
        playerName: input.playerName,
        position: input.position.toUpperCase(),
        severity: input.severity,
        bodyPart: input.bodyPart,
        injuryType: input.injuryType,
        status: input.status,
        source: input.source || 'manual',
        reportedAt: input.reportedAt || new Date(),
      },
    });

    console.log(`✅ Upserted injury: ${input.teamId} - ${input.position} (${input.severity})${input.playerName ? ` - ${input.playerName}` : ''}`);
  } catch (error: any) {
    console.error(`❌ Failed to upsert injury: ${error.message}`);
    throw error;
  }
}

/**
 * List injuries for a game
 */
async function listInjuriesForGame(gameId: string): Promise<void> {
  const injuries = await prisma.injury.findMany({
    where: { gameId },
    include: {
      team: { select: { id: true, name: true } },
      game: { select: { id: true, homeTeamId: true, awayTeamId: true } },
    },
    orderBy: [
      { teamId: 'asc' },
      { position: 'asc' },
    ],
  });

  if (injuries.length === 0) {
    console.log(`\n📋 No injuries recorded for game ${gameId}\n`);
    return;
  }

  console.log(`\n📋 Injuries for game ${gameId}:\n`);
  for (const injury of injuries) {
    console.log(
      `  ${injury.team.name} (${injury.teamId}): ` +
      `${injury.position} - ${injury.severity} ` +
      `${injury.playerName ? `(${injury.playerName})` : ''} ` +
      `${injury.bodyPart || injury.injuryType ? `[${injury.bodyPart || ''}${injury.bodyPart && injury.injuryType ? ' - ' : ''}${injury.injuryType || ''}]` : ''} ` +
      `(source: ${injury.source})`
    );
  }
  console.log();
}

/**
 * Delete an injury
 */
async function deleteInjury(injuryId: string): Promise<void> {
  await prisma.injury.delete({
    where: { id: injuryId },
  });
  console.log(`✅ Deleted injury ${injuryId}`);
}

async function main() {
  try {
    const yargs = require('yargs/yargs');
    const argv = yargs(process.argv.slice(2))
      .command('add', 'Add or update an injury', (yargs: any) => {
        return yargs
          .option('game-id', { type: 'string', demandOption: true, description: 'Game ID' })
          .option('team-id', { type: 'string', demandOption: true, description: 'Team ID' })
          .option('position', { type: 'string', demandOption: true, description: 'Position (QB, OL, DL, WR, RB, DB)' })
          .option('severity', { type: 'string', demandOption: true, choices: ['OUT', 'QUESTIONABLE', 'PROBABLE', 'DOUBTFUL'], description: 'Injury severity' })
          .option('player-name', { type: 'string', description: 'Player name (optional)' })
          .option('body-part', { type: 'string', description: 'Body part (optional)' })
          .option('injury-type', { type: 'string', description: 'Injury type (optional)' })
          .option('status', { type: 'string', description: 'Additional status text (optional)' })
          .option('source', { type: 'string', default: 'manual', description: 'Data source (default: manual)' })
          .option('reported-at', { type: 'string', description: 'Reported date (ISO format, optional)' });
      })
      .command('list', 'List injuries for a game', (yargs: any) => {
        return yargs
          .option('game-id', { type: 'string', demandOption: true, description: 'Game ID' });
      })
      .command('delete', 'Delete an injury', (yargs: any) => {
        return yargs
          .option('id', { type: 'string', demandOption: true, description: 'Injury ID' });
      })
      .demandCommand(1, 'You need at least one command before moving on')
      .help()
      .parse();

    const command = argv._[0];

    if (command === 'add') {
      // Get game info to extract season/week
      const game = await prisma.game.findUnique({
        where: { id: argv.gameId },
        select: { season: true, week: true },
      });

      if (!game) {
        throw new Error(`Game ${argv.gameId} not found`);
      }

      await upsertInjury({
        gameId: argv.gameId,
        teamId: argv.teamId,
        season: game.season,
        week: game.week,
        playerName: argv.playerName,
        position: argv.position,
        severity: argv.severity as InjurySeverity,
        bodyPart: argv.bodyPart,
        injuryType: argv.injuryType,
        status: argv.status,
        source: argv.source || 'manual',
        reportedAt: argv.reportedAt ? new Date(argv.reportedAt) : new Date(),
      });
    } else if (command === 'list') {
      await listInjuriesForGame(argv.gameId);
    } else if (command === 'delete') {
      await deleteInjury(argv.id);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

