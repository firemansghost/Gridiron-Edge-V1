import * as dotenv from 'dotenv';
import { CFBDClient } from '../apps/jobs/src/cfbd/cfbd-client';

dotenv.config();

async function main() {
  console.log('Testing CFBD API connection...\n');
  
  if (!process.env.CFBD_API_KEY) {
    console.error('❌ CFBD_API_KEY not set');
    process.exit(1);
  }
  
  const client = new CFBDClient();
  
  try {
    console.log('Testing getAdvancedStatsSeason(2025)...');
    const start = Date.now();
    const stats = await client.getAdvancedStatsSeason(2025);
    const elapsed = (Date.now() - start) / 1000;
    
    console.log(`✅ Success! Got ${stats.length} teams in ${elapsed.toFixed(1)}s`);
    if (stats.length > 0) {
      console.log(`   Sample team: ${stats[0].team || stats[0].teamName || 'unknown'}`);
      console.log(`   Has offense data: ${!!stats[0].offense}`);
      console.log(`   Has defense data: ${!!stats[0].defense}`);
    }
  } catch (error: any) {
    console.error(`❌ API call failed: ${error.message}`);
    if (error.message.includes('429')) {
      console.error('   Rate limited - wait and retry');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.error('   Authentication failed - check CFBD_API_KEY');
    }
    process.exit(1);
  }
}

main();

