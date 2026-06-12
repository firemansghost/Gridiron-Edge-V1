/**
 * Test script to hit the actual HTTP endpoint for /api/weeks/slate
 * This simulates what the browser does
 */

import { normalizeSlateApiResponse } from '../lib/config/slate-model';

async function testHttpSlate() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TESTING: HTTP /api/weeks/slate endpoint');
  console.log('═══════════════════════════════════════════════════════════\n');

  const url = 'http://localhost:3000/api/weeks/slate?season=2025&week=12';
  
  console.log(`📡 Fetching: ${url}\n`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response body:', text);
      return;
    }
    
    const raw = await response.json();
    const { games: data, meta } = normalizeSlateApiResponse<any>(raw);

    if (data.length === 0 && raw && typeof raw === 'object' && 'error' in raw) {
      console.error('❌ API error:', (raw as { error: string }).error);
      return;
    }

    console.log(`✅ Received ${data.length} games${meta ? ` (model=${meta.activeModel})` : ''}\n`);
    
    // Find OU @ Alabama game
    const ouAlabama = data.find((g: any) => 
      g.gameId === '2025-wk12-oklahoma-alabama' ||
      (g.awayTeamId === 'oklahoma' && g.homeTeamId === 'alabama')
    );
    
    if (!ouAlabama) {
      console.log('⚠️  OU @ Alabama game not found in response');
      console.log('Sample game IDs:', data.slice(0, 3).map((g: any) => g.gameId));
      return;
    }
    
    console.log('📊 Oklahoma @ Alabama (from HTTP endpoint):');
    console.log('   Game ID:', ouAlabama.gameId);
    console.log('   Model fields:');
    console.log('   - modelSpread:', ouAlabama.modelSpread, `(type: ${typeof ouAlabama.modelSpread}, isFinite: ${Number.isFinite(ouAlabama.modelSpread)})`);
    console.log('   - modelTotal:', ouAlabama.modelTotal, `(type: ${typeof ouAlabama.modelTotal})`);
    console.log('   - pickSpread:', ouAlabama.pickSpread, `(type: ${typeof ouAlabama.pickSpread})`);
    console.log('   - pickTotal:', ouAlabama.pickTotal, `(type: ${typeof ouAlabama.pickTotal})`);
    console.log('   - maxEdge:', ouAlabama.maxEdge, `(type: ${typeof ouAlabama.maxEdge}, isFinite: ${Number.isFinite(ouAlabama.maxEdge)})`);
    console.log('   - confidence:', ouAlabama.confidence, `(type: ${typeof ouAlabama.confidence})`);
    console.log('   - closingSpread:', ouAlabama.closingSpread?.value ?? 'null');
    console.log('\n   Full game object:');
    console.log(JSON.stringify(ouAlabama, null, 2));
    
    // Check if model fields are null
    const hasModelData = ouAlabama.modelSpread !== null && 
                        ouAlabama.modelSpread !== undefined &&
                        Number.isFinite(ouAlabama.modelSpread);
    
    if (!hasModelData) {
      console.log('\n❌ PROBLEM: Model fields are null/undefined/NaN!');
      console.log('   This matches the production issue.');
    } else {
      console.log('\n✅ Model fields are populated correctly!');
    }
    
  } catch (error) {
    console.error('❌ Error fetching HTTP endpoint:', error);
    if (error instanceof Error) {
      console.error('   Stack:', error.stack);
    }
  }
}

// Run the test
testHttpSlate().catch(console.error);

