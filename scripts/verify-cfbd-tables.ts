import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Verifying CFBD tables exist...\n');
  
  const tables = [
    'cfbd_team_map',
    'cfbd_games',
    'cfbd_eff_team_game',
    'cfbd_eff_team_season',
    'cfbd_ppa_team_game',
    'cfbd_ppa_team_season',
    'cfbd_drives_team_game',
    'cfbd_priors_team_season',
    'cfbd_weather_game',
  ];
  
  for (const table of tables) {
    try {
      // Try to query the table (will fail if it doesn't exist)
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM ${table} LIMIT 1`);
      console.log(`✅ ${table} exists`);
    } catch (error: any) {
      console.log(`❌ ${table} missing: ${error.message}`);
    }
  }
  
  await prisma.$disconnect();
}

main();

