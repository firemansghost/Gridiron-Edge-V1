#!/usr/bin/env node

/**
 * CFBD API Debug Script
 * 
 * Makes direct requests to CFBD API endpoints to debug connectivity issues.
 * Usage:
 *   node scripts/curl-cfbd.mjs stats --season 2025 --week 9
 *   node scripts/curl-cfbd.mjs talent --season 2025
 */

import { URL } from 'url';

const apiKey = process.env.CFBD_API_KEY;
if (!apiKey) {
  console.error('❌ CFBD_API_KEY environment variable is required');
  process.exit(1);
}

const baseUrl = process.env.CFBD_BASE_URL || 'https://api.collegefootballdata.com';

async function testEndpoint(endpoint, params) {
  const url = new URL(`${baseUrl}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value.toString());
  });

  console.log(`🔍 Testing: ${url.toString()}`);
  console.log(`📋 Headers:`);
  console.log(`   Authorization: Bearer ${apiKey ? '***' : 'MISSING'}`);
  console.log(`   Accept: application/json`);
  console.log(`   User-Agent: gridiron-edge-jobs/1.0`);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'gridiron-edge-jobs/1.0'
      }
    });

    console.log(`\n📊 Response:`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   URL: ${response.url}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);
    console.log(`   Content-Length: ${response.headers.get('content-length') || 'unknown'}`);

    const body = await response.text();
    console.log(`   Body preview (first 200 chars): ${body.substring(0, 200)}...`);

    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      console.log(`✅ Success: Valid JSON response`);
      try {
        const data = JSON.parse(body);
        console.log(`   Records: ${Array.isArray(data) ? data.length : 'N/A'}`);
      } catch (e) {
        console.log(`   ⚠️  JSON parse failed: ${e.message}`);
      }
    } else {
      console.log(`❌ Failed: ${response.status} or invalid content-type`);
    }

  } catch (error) {
    console.error(`❌ Request failed: ${error.message}`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const endpoint = args[0];
const params = {};

for (let i = 1; i < args.length; i += 2) {
  if (args[i].startsWith('--') && i + 1 < args.length) {
    const key = args[i].substring(2);
    const value = args[i + 1];
    params[key] = value;
  }
}

if (endpoint === 'stats') {
  if (!params.season || !params.week) {
    console.error('❌ Stats endpoint requires --season and --week');
    process.exit(1);
  }
  testEndpoint('/stats/game/teams', {
    year: params.season,
    week: params.week,
    seasonType: 'regular'
  });
} else if (endpoint === 'talent') {
  if (!params.season) {
    console.error('❌ Talent endpoint requires --season');
    process.exit(1);
  }
  testEndpoint('/talent', {
    year: params.season
  });
} else if (endpoint === 'fbs') {
  // Debug fallback endpoint
  testEndpoint('/teams/fbs', {
    year: params.season || 2025
  });
} else {
  console.error('❌ Unknown endpoint. Use: stats, talent, or fbs');
  process.exit(1);
}
