const { TeamResolver } = require('./apps/jobs/dist/adapters/TeamResolver');

async function testTeamResolver() {
  console.log('Testing TeamResolver...');
  
  const resolver = new TeamResolver();
  await resolver.initialize();
  
  console.log('TeamResolver initialized');
  
  // Test resolving a few teams
  const testTeams = ['Alabama', 'Hawai\'i', 'San Jose State'];
  
  for (const team of testTeams) {
    const resolved = resolver.resolveTeam(team, 'college-football', { provider: 'cfbd' });
    console.log(`${team} -> ${resolved}`);
  }
  
  process.exit(0);
}

testTeamResolver().catch(console.error);

