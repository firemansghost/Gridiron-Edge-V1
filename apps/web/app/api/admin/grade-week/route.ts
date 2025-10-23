/**
 * Admin endpoint: Sync scores and grade bets for a specific week
 * Requires x-admin-secret header matching ADMIN_SECRET env var
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/prisma';

const execAsync = promisify(exec);

interface GradeWeekResponse {
  ok: boolean;
  season: number;
  week: number;
  updatedGames: number;
  graded: number;
  pushes: number;
  failed: number;
  filledClosePrices: number;
  finishedAt: string;
  error?: string;
}

function checkAdminSecret(request: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.error('ADMIN_SECRET environment variable not set');
    return false;
  }

  const providedSecret = request.headers.get('x-admin-secret');
  return providedSecret === adminSecret;
}

async function runCFBDScoresSync(season: number, week: number): Promise<{ updatedGames: number; error?: string }> {
  try {
    console.log(`🏈 Running CFBD scores sync for ${season} Week ${week}...`);
    
    const { stdout, stderr } = await execAsync(
      `node apps/jobs/dist/src/cfbd-game-results.js --season ${season} --weeks ${week}`
    );
    
    console.log('CFBD sync stdout:', stdout);
    if (stderr) console.log('CFBD sync stderr:', stderr);
    
    // Parse the output to get updated games count
    const updatedGamesMatch = stdout.match(/Games updated: (\d+)/);
    const updatedGames = updatedGamesMatch ? parseInt(updatedGamesMatch[1], 10) : 0;
    
    return { updatedGames };
  } catch (error) {
    console.error('CFBD sync error:', error);
    return { updatedGames: 0, error: (error as Error).message };
  }
}

async function runGrader(season: number, week: number): Promise<{
  graded: number;
  pushes: number;
  failed: number;
  filledClosePrices: number;
  error?: string;
}> {
  try {
    console.log(`🧮 Running grader for ${season} Week ${week}...`);
    
    const { stdout, stderr } = await execAsync(
      `node apps/jobs/dist/grade-bets.js --season ${season} --week ${week}`
    );
    
    console.log('Grader stdout:', stdout);
    if (stderr) console.log('Grader stderr:', stderr);
    
    // Parse the output to get grading stats
    const gradedMatch = stdout.match(/graded=(\d+)/);
    const pushesMatch = stdout.match(/pushes=(\d+)/);
    const failedMatch = stdout.match(/failed=(\d+)/);
    const filledMatch = stdout.match(/filledClosePrice=(\d+)/);
    
    const graded = gradedMatch ? parseInt(gradedMatch[1], 10) : 0;
    const pushes = pushesMatch ? parseInt(pushesMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
    const filledClosePrices = filledMatch ? parseInt(filledMatch[1], 10) : 0;
    
    return { graded, pushes, failed, filledClosePrices };
  } catch (error) {
    console.error('Grader error:', error);
    return { 
      graded: 0, 
      pushes: 0, 
      failed: 0, 
      filledClosePrices: 0, 
      error: (error as Error).message 
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check admin secret
    if (!checkAdminSecret(request)) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Invalid or missing x-admin-secret header' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const season = parseInt(url.searchParams.get('season') || '2025', 10);
    const week = parseInt(url.searchParams.get('week') || '9', 10);

    if (!season || !week) {
      return NextResponse.json(
        { ok: false, error: 'Invalid season or week parameter' },
        { status: 400 }
      );
    }

    console.log(`🔐 Admin grade-week request: ${season} Week ${week}`);

    // Step 1: Run CFBD scores sync
    const syncResult = await runCFBDScoresSync(season, week);
    if (syncResult.error) {
      return NextResponse.json(
        { 
          ok: false, 
          season, 
          week, 
          updatedGames: syncResult.updatedGames,
          error: `CFBD sync failed: ${syncResult.error}` 
        },
        { status: 500 }
      );
    }

    // Step 2: Run grader
    const gradeResult = await runGrader(season, week);
    if (gradeResult.error) {
      return NextResponse.json(
        { 
          ok: false, 
          season, 
          week, 
          updatedGames: syncResult.updatedGames,
          error: `Grader failed: ${gradeResult.error}` 
        },
        { status: 500 }
      );
    }

    // Return success response
    const response: GradeWeekResponse = {
      ok: true,
      season,
      week,
      updatedGames: syncResult.updatedGames,
      graded: gradeResult.graded,
      pushes: gradeResult.pushes,
      failed: gradeResult.failed,
      filledClosePrices: gradeResult.filledClosePrices,
      finishedAt: new Date().toISOString()
    };

    console.log(`✅ Admin grade-week completed:`, response);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Admin grade-week error:', error);
    return NextResponse.json(
      { 
        ok: false, 
        error: (error as Error).message,
        finishedAt: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
