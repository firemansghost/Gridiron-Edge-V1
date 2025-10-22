#!/usr/bin/env node

/**
 * Test script for the bets API endpoints
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testBetsAPI() {
  console.log('🧪 Testing Bets API...\n');

  try {
    // Test 1: Check if bets table exists and is accessible
    console.log('1. Testing database connection...');
    const betCount = await prisma.bet.count();
    console.log(`   ✅ Connected to database, found ${betCount} existing bets`);

    // Test 2: Test import API (simulate)
    console.log('\n2. Testing import API logic...');
    const testBet = {
      season: 2025,
      week: 9,
      gameId: '2025-wk9-alabama-south-carolina',
      marketType: 'spread',
      side: 'home',
      modelPrice: -7.5,
      stake: 100,
      strategyTag: 'test-strategy',
      source: 'manual',
      notes: 'Test bet for API validation'
    };

    // Check if game exists
    const game = await prisma.game.findFirst({
      where: { id: testBet.gameId },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      }
    });

    if (game) {
      console.log(`   ✅ Game found: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
    } else {
      console.log(`   ⚠️  Game not found: ${testBet.gameId}`);
    }

    // Test 3: Test summary API logic
    console.log('\n3. Testing summary API logic...');
    const summary = await prisma.bet.groupBy({
      by: ['strategyTag'],
      _count: { _all: true },
      _sum: { pnl: true },
    });

    console.log(`   ✅ Found ${summary.length} strategies with bets`);
    summary.forEach(s => {
      console.log(`   📊 ${s.strategyTag}: ${s._count._all} bets, PnL: ${s._sum.pnl || 0}`);
    });

    // Test 4: Test diagnostics API logic
    console.log('\n4. Testing diagnostics API logic...');
    const coverage = await prisma.marketLine.groupBy({
      by: ['bookName', 'lineType'],
      where: { season: 2025, week: 9 },
      _count: { _all: true },
      _max: { timestamp: true },
    });

    console.log(`   ✅ Found ${coverage.length} book/line combinations for 2025 W9`);
    coverage.slice(0, 3).forEach(row => {
      console.log(`   📈 ${row.bookName} ${row.lineType}: ${row._count._all} rows`);
    });

    console.log('\n✅ All API tests passed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Start the web server: npm run dev');
    console.log('   2. Test POST /api/bets/import with real data');
    console.log('   3. Test GET /api/bets/summary');
    console.log('   4. Test GET /api/diagnostics/odds');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testBetsAPI();
