/**
 * Admin endpoint: Sync scores and grade bets for a specific week
 * Requires x-admin-secret header matching ADMIN_SECRET env var
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { gradeAvailableBets } from '@/lib/grading/grading-service';

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

/**
 * Resolve the path to a jobs script, trying multiple candidate locations.
 * 
 * In Vercel, process.cwd() may be /var/task/apps/web, but the scripts are at
 * /var/task/apps/jobs/dist/src/. This function tries multiple reasonable paths
 * to handle different deployment layouts.
 */
function resolveJobsScriptPath(scriptFile: string, subdir: string = 'src'): string {
  const buildCandidates = (base: string): string => {
    if (subdir) {
      return path.resolve(base, 'apps/jobs/dist', subdir, scriptFile);
    } else {
      return path.resolve(base, 'apps/jobs/dist', scriptFile);
    }
  };
  
  const candidates: string[] = [
    // CWD = monorepo root (local development, some deployments)
    buildCandidates(process.cwd()),
    
    // CWD = apps/web (Vercel serverless functions)
    buildCandidates(path.resolve(process.cwd(), '..')),
    
    // Fallback: CWD = apps/web, but need to go up two levels
    buildCandidates(path.resolve(process.cwd(), '../..')),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[resolveJobsScriptPath] Found "${scriptFile}" at: ${candidate}`);
      return candidate;
    }
  }

  const errorMsg = `Could not find jobs script "${scriptFile}". Tried: ${candidates.join(', ')}`;
  console.error(`[resolveJobsScriptPath] ${errorMsg}`);
  throw new Error(errorMsg);
}

/**
 * Run CFBD game results sync job
 * 
 * Note: MODULE_NOT_FOUND errors are treated as non-fatal warnings since
 * scores may already exist in the database. This allows grading to proceed
 * even if the CFBD script cannot be found.
 */
async function runCFBDScoresSync(season: number, week: number): Promise<{ 
  ok: boolean; 
  updatedGames?: number; 
  message?: string; 
  error?: string; 
  details?: string;
}> {
  try {
    console.log(`🏈 Running CFBD scores sync for ${season} Week ${week}...`);
    
    const scriptPath = resolveJobsScriptPath('cfbd-game-results.js');
    const command = `node "${scriptPath}" --season ${season} --weeks ${week}`;
    
    console.log(`Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    });
    
    console.log('CFBD sync stdout:', stdout);
    if (stderr) {
      console.log('CFBD sync stderr:', stderr);
    }
    
    // Parse the output to get updated games count
    const updatedGamesMatch = stdout.match(/Games updated: (\d+)/);
    const updatedGames = updatedGamesMatch ? parseInt(updatedGamesMatch[1], 10) : 0;
    
    return { ok: true, updatedGames };
  } catch (error: any) {
    console.error('CFBD sync error:', error);
    
    const stderr = error?.stderr?.toString?.() ?? '';
    const stdout = error?.stdout?.toString?.() ?? '';
    const errorMessage = error?.message || String(error);
    
    // Check if this is a MODULE_NOT_FOUND error
    const isModuleNotFound =
      error?.code === 'MODULE_NOT_FOUND' ||
      errorMessage.includes('MODULE_NOT_FOUND') ||
      errorMessage.includes('Cannot find module') ||
      stderr.includes('MODULE_NOT_FOUND') ||
      stderr.includes('Cannot find module');
    
    if (isModuleNotFound) {
      // Log for diagnostics but don't block grading
      console.warn('[CFBD Sync] MODULE_NOT_FOUND – continuing to grading', { 
        error: errorMessage,
        stderr: stderr.substring(0, 500), // Truncate for logging
      });
      return { 
        ok: false, 
        message: 'CFBD script not found; skipping scores sync. Scores may already exist in database.',
        error: 'MODULE_NOT_FOUND',
        details: `Script path resolution failed. Tried multiple locations but script not found.`
      };
    }
    
    // For other errors, return error details but still allow grading to proceed
    const errorDetails = stderr || stdout || errorMessage;
    return { 
      ok: false,
      updatedGames: 0, 
      error: `CFBD job failed: ${errorMessage}`,
      details: errorDetails.substring(0, 1000), // Truncate for response
      message: 'CFBD sync failed, but grading will proceed.'
    };
  }
}

/**
 * Run grading using the grading service (serverless-friendly)
 * 
 * This replaces the child process approach with a direct function call.
 */
async function runGrader(season: number, week: number): Promise<{
  ok: boolean;
  graded: number;
  pushes: number;
  failed: number;
  filledClosePrices: number;
  error?: string;
  details?: string;
}> {
  try {
    console.log(`🧮 Running grader for ${season} Week ${week}...`);
    
    const counts = await gradeAvailableBets({
      season,
      week,
      limit: 500,
      force: false,
    });
    
    console.log(`[GRADER] Completed:`, counts);
    
    return { 
      ok: true, 
      graded: counts.graded, 
      pushes: counts.pushes, 
      failed: counts.failed, 
      filledClosePrices: counts.filledClosePrice 
    };
  } catch (error: any) {
    console.error('Grader error:', error);
    
    const errorMessage = error?.message || String(error);
    
    return { 
      ok: false,
      graded: 0, 
      pushes: 0, 
      failed: 0, 
      filledClosePrices: 0, 
      error: `Grading failed: ${errorMessage}`,
      details: errorMessage
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

    // Step 1: Run CFBD scores sync (non-fatal if MODULE_NOT_FOUND)
    const cfbdResult = await runCFBDScoresSync(season, week);
    if (!cfbdResult.ok) {
      console.warn(`[CFBD Sync] ${cfbdResult.message || cfbdResult.error} - continuing to grading`);
    }

    // Step 2: Always run grader (even if CFBD sync failed)
    // Scores may already exist in the database, so grading can proceed
    const gradeResult = await runGrader(season, week);
    if (!gradeResult.ok) {
      return NextResponse.json(
        { 
          ok: false, 
          season, 
          week, 
          updatedGames: cfbdResult.updatedGames || 0,
          error: gradeResult.error,
          details: gradeResult.details,
          cfbd: {
            ok: cfbdResult.ok,
            message: cfbdResult.message,
          }
        },
        { status: 500 }
      );
    }

    // Return success response (even if CFBD sync failed, grading succeeded)
    const response: GradeWeekResponse & { cfbd?: { ok: boolean; message?: string } } = {
      ok: true,
      season,
      week,
      updatedGames: cfbdResult.updatedGames || 0,
      graded: gradeResult.graded,
      pushes: gradeResult.pushes,
      failed: gradeResult.failed,
      filledClosePrices: gradeResult.filledClosePrices,
      finishedAt: new Date().toISOString(),
      // Include CFBD result for frontend to show non-blocking notice if needed
      cfbd: {
        ok: cfbdResult.ok,
        message: cfbdResult.message,
      }
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
