#!/usr/bin/env node

/**
 * Historical Odds Diagnostic Tool
 * 
 * Tests Odds API historical endpoints step-by-step to isolate issues.
 * NO DB WRITES - logs only.
 */

const fs = require('fs').promises;
const path = require('path');

const ODDS_API_KEY = process.env.ODDS_API_KEY || '85381add0eaef796a6c41145a50dd4a1';
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Rate limiting helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Strip milliseconds from ISO string (Odds API requires no milliseconds)
const toISOStringNoMs = (date) => {
  const iso = date.toISOString();
  return iso.replace(/\.\d{3}Z$/, 'Z'); // Remove .000Z and add back Z
};

// Ensure reports directory exists
async function ensureReportsDir() {
  const reportsDir = path.join(process.cwd(), 'reports', 'historical');
  await fs.mkdir(reportsDir, { recursive: true });
  return reportsDir;
}

// Make API call and log everything
async function makeCall(url, description) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 ${description}`);
  console.log(`📡 URL: ${url}`);
  console.log(`${'='.repeat(80)}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Gridiron-Edge-Diagnostic/1.0'
      }
    });
    
    const status = response.status;
    const statusText = response.statusText;
    const headers = {
      'x-requests-remaining': response.headers.get('x-requests-remaining'),
      'x-requests-used': response.headers.get('x-requests-used'),
      'x-requests-last': response.headers.get('x-requests-last'),
      'content-type': response.headers.get('content-type')
    };
    
    console.log(`\n📊 Response:`);
    console.log(`   Status: ${status} ${statusText}`);
    console.log(`   Headers:`, JSON.stringify(headers, null, 2));
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
      console.log(`   Body (first 500 chars):`, JSON.stringify(data, null, 2).substring(0, 500));
    } else {
      data = await response.text();
      console.log(`   Body:`, data.substring(0, 500));
    }
    
    return { success: response.ok, status, statusText, headers, data };
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Step 0: NBA sanity check
async function step0_nbaSanityCheck() {
  console.log('\n\n' + '█'.repeat(80));
  console.log('STEP 0: NBA Sanity Check (Does key have historical access?)');
  console.log('█'.repeat(80));
  
  // Historical events for NBA
  const eventsUrl = `${BASE_URL}/historical/sports/basketball_nba/events?apiKey=${ODDS_API_KEY}&date=2023-11-29T22:42:00Z`;
  const eventsResult = await makeCall(eventsUrl, 'NBA Historical Events (known good date)');
  
  if (!eventsResult.success) {
    console.log('\n❌ STEP 0 FAILED: Cannot access NBA historical events');
    console.log('   This key may not have historical access enabled');
    return false;
  }
  
  console.log('\n✅ NBA Historical Events: SUCCESS');
  
  // Get first event ID
  const events = eventsResult.data?.data || [];
  if (events.length === 0) {
    console.log('\n⚠️  No events returned, but call succeeded');
    return true;
  }
  
  const firstEvent = events[0];
  console.log(`\n📍 Found event: ${firstEvent.away_team} @ ${firstEvent.home_team}`);
  console.log(`   Event ID: ${firstEvent.id}`);
  
  await delay(300); // Rate limit
  
  // Historical event odds for first event
  const oddsUrl = `${BASE_URL}/historical/sports/basketball_nba/events/${firstEvent.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads&date=2023-11-29T22:45:00Z`;
  const oddsResult = await makeCall(oddsUrl, 'NBA Historical Event Odds (single event, spreads only)');
  
  if (!oddsResult.success) {
    console.log('\n⚠️  Events succeeded but event odds failed');
    return true; // Events worked, which proves historical access
  }
  
  console.log('\n✅ NBA Historical Event Odds: SUCCESS');
  console.log('✅ STEP 0 PASSED: Key has historical access');
  return true;
}

// Step 1: NCAAF 2024 probe
async function step1_ncaaf2024Probe() {
  console.log('\n\n' + '█'.repeat(80));
  console.log('STEP 1: NCAAF 2024 Probe (Does NCAAF historical work for known past season?)');
  console.log('█'.repeat(80));
  
  const snapshots = [
    '2024-09-14T22:55:00Z',
    '2024-09-14T23:00:00Z',
    '2024-09-14T23:05:00Z'
  ];
  
  let eventsResult = null;
  
  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i];
    console.log(`\n🔄 Attempt ${i + 1}/${snapshots.length}: Snapshot ${snapshot}`);
    
    const eventsUrl = `${BASE_URL}/historical/sports/americanfootball_ncaaf/events?apiKey=${ODDS_API_KEY}&date=${snapshot}&commenceTimeFrom=2024-09-13T00:00:00Z&commenceTimeTo=2024-09-15T23:59:59Z`;
    eventsResult = await makeCall(eventsUrl, `NCAAF Historical Events (2024-09-14, attempt ${i + 1})`);
    
    if (eventsResult.success) {
      console.log(`\n✅ NCAAF 2024 Historical Events: SUCCESS on attempt ${i + 1}`);
      break;
    }
    
    if (i < snapshots.length - 1) {
      await delay(300);
    }
  }
  
  if (!eventsResult || !eventsResult.success) {
    console.log('\n❌ STEP 1 FAILED: All NCAAF 2024 snapshot attempts failed');
    return false;
  }
  
  // Try to fetch odds for up to 5 events
  const events = eventsResult.data?.data || [];
  console.log(`\n📍 Found ${events.length} events in 2024-09-14 window`);
  
  const eventsToTest = events.slice(0, 5);
  let successCount = 0;
  
  for (let i = 0; i < eventsToTest.length; i++) {
    const event = eventsToTest[i];
    console.log(`\n📍 Testing event ${i + 1}/${eventsToTest.length}: ${event.away_team} @ ${event.home_team}`);
    
    await delay(300);
    
    const oddsUrl = `${BASE_URL}/historical/sports/americanfootball_ncaaf/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals&date=${eventsResult.data.timestamp}`;
    const oddsResult = await makeCall(oddsUrl, `NCAAF Event Odds (${event.id})`);
    
    if (oddsResult.success) {
      successCount++;
    }
  }
  
  console.log(`\n✅ STEP 1 SUMMARY: ${successCount}/${eventsToTest.length} event odds calls succeeded`);
  
  // Write report
  const reportsDir = await ensureReportsDir();
  const report = {
    step: 1,
    sport: 'americanfootball_ncaaf',
    date: '2024-09-14',
    snapshot: eventsResult.data.timestamp,
    events_found: events.length,
    events_tested: eventsToTest.length,
    odds_success_count: successCount,
    events: eventsToTest.map(e => ({
      id: e.id,
      home_team: e.home_team,
      away_team: e.away_team,
      commence_time: e.commence_time
    }))
  };
  
  await fs.writeFile(
    path.join(reportsDir, 'probe_ncaaf_2024.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(`\n📝 Report written to reports/historical/probe_ncaaf_2024.json`);
  
  return successCount > 0;
}

// Step 2: NCAAF 2025 Week 7
async function step2_ncaaf2025Week7() {
  console.log('\n\n' + '█'.repeat(80));
  console.log('STEP 2: NCAAF 2025 Week 7 (Target week for backfill)');
  console.log('█'.repeat(80));
  
  // Calculate snapshot from DB games
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const games = await prisma.game.findMany({
      where: { season: 2025, week: 7 },
      select: { date: true },
      orderBy: { date: 'desc' }
    });
    
    if (games.length === 0) {
      console.log('\n❌ No games found for 2025 Week 7 in database');
      await prisma.$disconnect();
      return false;
    }
    
    console.log(`\n📍 Found ${games.length} games for 2025 Week 7`);
    
    // Get max kickoff
    const maxKickoff = new Date(games[0].date);
    console.log(`   Max kickoff: ${maxKickoff.toISOString()}`);
    
    // Add 30 minutes, round down to 5-min
    maxKickoff.setMinutes(maxKickoff.getMinutes() + 30);
    const minutes = maxKickoff.getUTCMinutes();
    const roundedMinutes = Math.floor(minutes / 5) * 5;
    maxKickoff.setUTCMinutes(roundedMinutes, 0, 0);
    
    const baseSnapshot = maxKickoff.toISOString();
    console.log(`   Base snapshot (max + 30m, rounded): ${baseSnapshot}`);
    
    // Get week date range
    const minDate = new Date(games[games.length - 1].date);
    const maxDate = new Date(games[0].date);
    
    // Set Friday 00:00 to Monday 23:59
    const friday = new Date(minDate);
    friday.setDate(friday.getDate() - ((friday.getDay() + 2) % 7)); // Back to Friday
    friday.setUTCHours(0, 0, 0, 0);
    
    const monday = new Date(maxDate);
    monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7)); // Forward to Monday
    monday.setUTCHours(23, 59, 59, 0);
    
    const commenceTimeFrom = toISOStringNoMs(friday);
    const commenceTimeTo = toISOStringNoMs(monday);
    
    console.log(`   Commence window: ${commenceTimeFrom} to ${commenceTimeTo}`);
    
    await prisma.$disconnect();
    
    // Try three snapshots
    const snapshots = [
      baseSnapshot,  // +30 minutes
      new Date(new Date(baseSnapshot).getTime() + 5 * 60 * 1000).toISOString(),  // +35 minutes
      new Date(new Date(baseSnapshot).getTime() + 10 * 60 * 1000).toISOString()  // +40 minutes
    ];
    
    let eventsResult = null;
    
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      console.log(`\n🔄 Attempt ${i + 1}/${snapshots.length}: Snapshot ${snapshot}`);
      
      const eventsUrl = `${BASE_URL}/historical/sports/americanfootball_ncaaf/events?apiKey=${ODDS_API_KEY}&date=${snapshot}&commenceTimeFrom=${commenceTimeFrom}&commenceTimeTo=${commenceTimeTo}`;
      eventsResult = await makeCall(eventsUrl, `NCAAF Historical Events (2025 W7, attempt ${i + 1})`);
      
      if (eventsResult.success) {
        console.log(`\n✅ NCAAF 2025 W7 Historical Events: SUCCESS on attempt ${i + 1}`);
        break;
      }
      
      if (i < snapshots.length - 1) {
        await delay(300);
      }
    }
    
    if (!eventsResult || !eventsResult.success) {
      console.log('\n❌ STEP 2 FAILED: All NCAAF 2025 W7 snapshot attempts failed');
      return false;
    }
    
    // Try to fetch odds for up to 5 events
    const events = eventsResult.data?.data || [];
    console.log(`\n📍 Found ${events.length} events in 2025 W7 window`);
    
    const eventsToTest = events.slice(0, 5);
    let successCount = 0;
    
    for (let i = 0; i < eventsToTest.length; i++) {
      const event = eventsToTest[i];
      console.log(`\n📍 Testing event ${i + 1}/${eventsToTest.length}: ${event.away_team} @ ${event.home_team}`);
      
      await delay(300);
      
      const oddsUrl = `${BASE_URL}/historical/sports/americanfootball_ncaaf/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals&date=${eventsResult.data.timestamp}`;
      const oddsResult = await makeCall(oddsUrl, `NCAAF Event Odds (${event.id})`);
      
      if (oddsResult.success) {
        successCount++;
      }
    }
    
    console.log(`\n✅ STEP 2 SUMMARY: ${successCount}/${eventsToTest.length} event odds calls succeeded`);
    
    // Write report
    const reportsDir = await ensureReportsDir();
    const report = {
      step: 2,
      sport: 'americanfootball_ncaaf',
      season: 2025,
      week: 7,
      snapshot: eventsResult.data.timestamp,
      commence_window: { from: commenceTimeFrom, to: commenceTimeTo },
      events_found: events.length,
      events_tested: eventsToTest.length,
      odds_success_count: successCount,
      events: eventsToTest.map(e => ({
        id: e.id,
        home_team: e.home_team,
        away_team: e.away_team,
        commence_time: e.commence_time
      }))
    };
    
    await fs.writeFile(
      path.join(reportsDir, 'probe_2025_w7.json'),
      JSON.stringify(report, null, 2)
    );
    console.log(`\n📝 Report written to reports/historical/probe_2025_w7.json`);
    
    return successCount > 0;
    
  } catch (error) {
    console.error(`\n❌ Error in Step 2: ${error.message}`);
    return false;
  }
}

// Step 3: NCAAF 2025 Week 6 (fallback)
async function step3_ncaaf2025Week6() {
  console.log('\n\n' + '█'.repeat(80));
  console.log('STEP 3: NCAAF 2025 Week 6 (One week earlier)');
  console.log('█'.repeat(80));
  
  // Same logic as Step 2 but for Week 6
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const games = await prisma.game.findMany({
      where: { season: 2025, week: 6 },
      select: { date: true },
      orderBy: { date: 'desc' }
    });
    
    if (games.length === 0) {
      console.log('\n❌ No games found for 2025 Week 6 in database');
      await prisma.$disconnect();
      return false;
    }
    
    console.log(`\n📍 Found ${games.length} games for 2025 Week 6`);
    
    // Get max kickoff
    const maxKickoff = new Date(games[0].date);
    console.log(`   Max kickoff: ${maxKickoff.toISOString()}`);
    
    // Add 30 minutes, round down to 5-min
    maxKickoff.setMinutes(maxKickoff.getMinutes() + 30);
    const minutes = maxKickoff.getUTCMinutes();
    const roundedMinutes = Math.floor(minutes / 5) * 5;
    maxKickoff.setUTCMinutes(roundedMinutes, 0, 0);
    
    const baseSnapshot = maxKickoff.toISOString();
    console.log(`   Base snapshot (max + 30m, rounded): ${baseSnapshot}`);
    
    // Get week date range
    const minDate = new Date(games[games.length - 1].date);
    const maxDate = new Date(games[0].date);
    
    // Set Friday 00:00 to Monday 23:59
    const friday = new Date(minDate);
    friday.setDate(friday.getDate() - ((friday.getDay() + 2) % 7));
    friday.setUTCHours(0, 0, 0, 0);
    
    const monday = new Date(maxDate);
    monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7));
    monday.setUTCHours(23, 59, 59, 0);
    
    const commenceTimeFrom = toISOStringNoMs(friday);
    const commenceTimeTo = toISOStringNoMs(monday);
    
    console.log(`   Commence window: ${commenceTimeFrom} to ${commenceTimeTo}`);
    
    await prisma.$disconnect();
    
    // Try three snapshots
    const snapshots = [
      baseSnapshot,
      new Date(new Date(baseSnapshot).getTime() + 5 * 60 * 1000).toISOString(),
      new Date(new Date(baseSnapshot).getTime() + 10 * 60 * 1000).toISOString()
    ];
    
    let eventsResult = null;
    
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      console.log(`\n🔄 Attempt ${i + 1}/${snapshots.length}: Snapshot ${snapshot}`);
      
      const eventsUrl = `${BASE_URL}/historical/sports/americanfootball_ncaaf/events?apiKey=${ODDS_API_KEY}&date=${snapshot}&commenceTimeFrom=${commenceTimeFrom}&commenceTimeTo=${commenceTimeTo}`;
      eventsResult = await makeCall(eventsUrl, `NCAAF Historical Events (2025 W6, attempt ${i + 1})`);
      
      if (eventsResult.success) {
        console.log(`\n✅ NCAAF 2025 W6 Historical Events: SUCCESS on attempt ${i + 1}`);
        break;
      }
      
      if (i < snapshots.length - 1) {
        await delay(300);
      }
    }
    
    if (!eventsResult || !eventsResult.success) {
      console.log('\n❌ STEP 3 FAILED: All NCAAF 2025 W6 snapshot attempts failed');
      return false;
    }
    
    // Try to fetch odds for up to 5 events
    const events = eventsResult.data?.data || [];
    console.log(`\n📍 Found ${events.length} events in 2025 W6 window`);
    
    const eventsToTest = events.slice(0, 5);
    let successCount = 0;
    
    for (let i = 0; i < eventsToTest.length; i++) {
      const event = eventsToTest[i];
      console.log(`\n📍 Testing event ${i + 1}/${eventsToTest.length}: ${event.away_team} @ ${event.home_team}`);
      
      await delay(300);
      
      const oddsUrl = `${BASE_URL}/historical/sports/americanfootball_ncaaf/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,totals&date=${eventsResult.data.timestamp}`;
      const oddsResult = await makeCall(oddsUrl, `NCAAF Event Odds (${event.id})`);
      
      if (oddsResult.success) {
        successCount++;
      }
    }
    
    console.log(`\n✅ STEP 3 SUMMARY: ${successCount}/${eventsToTest.length} event odds calls succeeded`);
    
    // Write report
    const reportsDir = await ensureReportsDir();
    const report = {
      step: 3,
      sport: 'americanfootball_ncaaf',
      season: 2025,
      week: 6,
      snapshot: eventsResult.data.timestamp,
      commence_window: { from: commenceTimeFrom, to: commenceTimeTo },
      events_found: events.length,
      events_tested: eventsToTest.length,
      odds_success_count: successCount,
      events: eventsToTest.map(e => ({
        id: e.id,
        home_team: e.home_team,
        away_team: e.away_team,
        commence_time: e.commence_time
      }))
    };
    
    await fs.writeFile(
      path.join(reportsDir, 'probe_2025_w6.json'),
      JSON.stringify(report, null, 2)
    );
    console.log(`\n📝 Report written to reports/historical/probe_2025_w6.json`);
    
    return successCount > 0;
    
  } catch (error) {
    console.error(`\n❌ Error in Step 3: ${error.message}`);
    return false;
  }
}

// Main diagnostic runner
async function main() {
  console.log('\n' + '█'.repeat(80));
  console.log('🔬 HISTORICAL ODDS DIAGNOSTIC TOOL');
  console.log('   NO DATABASE WRITES - LOGS ONLY');
  console.log('█'.repeat(80));
  
  // Step 0: NBA sanity check
  const step0Pass = await step0_nbaSanityCheck();
  if (!step0Pass) {
    console.log('\n\n❌ DIAGNOSTIC FAILED AT STEP 0');
    console.log('   Your API key may not have historical access enabled');
    console.log('   Contact Odds API support to verify your plan includes historical data');
    process.exit(1);
  }
  
  await delay(1000);
  
  // Step 1: NCAAF 2024 probe
  const step1Pass = await step1_ncaaf2024Probe();
  if (!step1Pass) {
    console.log('\n\n⚠️  STEP 1 FAILED: NCAAF 2024 historical not available');
    console.log('   NBA historical works, but NCAAF does not');
    console.log('   This suggests NCAAF may have different archival rules or lag');
  }
  
  await delay(1000);
  
  // Step 2: NCAAF 2025 Week 7
  const step2Pass = await step2_ncaaf2025Week7();
  if (!step2Pass) {
    console.log('\n\n⚠️  STEP 2 FAILED: NCAAF 2025 Week 7 not available');
    console.log('   Proceeding to Step 3 (Week 6)...');
    
    await delay(1000);
    
    // Step 3: NCAAF 2025 Week 6
    const step3Pass = await step3_ncaaf2025Week6();
    if (!step3Pass) {
      console.log('\n\n❌ ALL NCAAF 2025 ATTEMPTS FAILED');
      console.log('   NBA historical: ✅');
      console.log('   NCAAF 2024: ' + (step1Pass ? '✅' : '❌'));
      console.log('   NCAAF 2025 W7: ❌');
      console.log('   NCAAF 2025 W6: ❌');
      console.log('\n   Recommendation: Contact Odds API support with these findings');
      process.exit(1);
    } else {
      console.log('\n\n✅ DIAGNOSTIC COMPLETE: Week 6 available, Week 7 not yet');
      console.log('   You can backfill up through Week 6');
      console.log('   Week 7 may become available later');
    }
  } else {
    console.log('\n\n✅ DIAGNOSTIC COMPLETE: Week 7 is available!');
    console.log('   You can proceed with the full backfill for Weeks 2-7');
  }
  
  console.log('\n\n' + '█'.repeat(80));
  console.log('📝 Check reports/historical/ for detailed JSON reports');
  console.log('█'.repeat(80) + '\n');
}

main().catch(error => {
  console.error('\n\n❌ DIAGNOSTIC TOOL ERROR:', error);
  process.exit(1);
});

