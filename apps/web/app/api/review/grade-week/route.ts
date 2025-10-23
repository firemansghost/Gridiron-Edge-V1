/**
 * Safe UI proxy for grade-week admin endpoint
 * Injects admin secret server-side to avoid exposing it to the client
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body to get season/week
    const body = await request.json();
    const { season, week } = body;

    if (!season || !week) {
      return NextResponse.json(
        { ok: false, error: 'Missing season or week parameter' },
        { status: 400 }
      );
    }

    // Get admin secret from environment
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      console.error('ADMIN_SECRET environment variable not set');
      return NextResponse.json(
        { ok: false, error: 'Admin secret not configured' },
        { status: 500 }
      );
    }

    // Call the admin endpoint with the secret
    const adminUrl = new URL('/api/admin/grade-week', request.url);
    adminUrl.searchParams.set('season', season.toString());
    adminUrl.searchParams.set('week', week.toString());

    const adminResponse = await fetch(adminUrl.toString(), {
      method: 'POST',
      headers: {
        'x-admin-secret': adminSecret,
        'Content-Type': 'application/json'
      }
    });

    const adminResult = await adminResponse.json();

    // Return the admin response to the client
    return NextResponse.json(adminResult, { 
      status: adminResponse.status 
    });

  } catch (error) {
    console.error('Review grade-week proxy error:', error);
    return NextResponse.json(
      { 
        ok: false, 
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}
