/**
 * Check what the API returns for officialSpreadBet
 */

async function main() {
  const gameId = '2025-wk15-unlv-boise-state';
  
  try {
    const response = await fetch(`http://localhost:3000/api/game/${gameId}`);
    if (!response.ok) {
      console.error(`API returned ${response.status}: ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('API returned error:', data.error);
      return;
    }
    
    console.log('\n=== API Response for officialSpreadBet ===');
    console.log(JSON.stringify(data.officialSpreadBet, null, 2));
    
    if (data.officialSpreadBet) {
      console.log('\n=== Parsed officialSpreadBet ===');
      console.log(`Team: ${data.officialSpreadBet.teamName}`);
      console.log(`Line: ${data.officialSpreadBet.line}`);
      console.log(`Edge: ${data.officialSpreadBet.edge}`);
      console.log(`Grade: ${data.officialSpreadBet.grade}`);
      console.log(`Bet To: ${data.officialSpreadBet.betTo}`);
    } else {
      console.log('\n⚠️  officialSpreadBet is null');
      console.log('This means there is no official_flat_100 bet for this game.');
    }
    
    // Also check what bettablePick says
    console.log('\n=== bettablePick (for comparison) ===');
    if (data.picks?.spread?.bettablePick) {
      console.log(`Team: ${data.picks.spread.bettablePick.teamName}`);
      console.log(`Line: ${data.picks.spread.bettablePick.line}`);
      console.log(`Label: ${data.picks.spread.bettablePick.label}`);
      console.log(`Edge: ${data.picks.spread.bettablePick.edgePts}`);
    } else {
      console.log('bettablePick is null');
    }
    
  } catch (error) {
    console.error('Error calling API:', error);
    console.log('\n⚠️  Make sure the dev server is running on http://localhost:3000');
  }
}

main().catch(console.error);

