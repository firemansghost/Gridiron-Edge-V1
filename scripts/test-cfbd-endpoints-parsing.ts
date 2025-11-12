// Quick test to verify endpoint parsing
const testEndpoints = 'teamSeason,teamGame,priors';
const parsed = testEndpoints.split(',').map(e => e.trim());
console.log('Parsed endpoints:', parsed);
console.log('Includes teamSeason?', parsed.includes('teamSeason'));
console.log('Includes teamGame?', parsed.includes('teamGame'));
console.log('Includes priors?', parsed.includes('priors'));

