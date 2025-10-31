/**
 * Ratings Configuration API
 * 
 * Save and load custom ratings configurations
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RatingConfig {
  name: string;
  offensiveWeights: {
    yppOff: number;
    passYpaOff: number;
    rushYpcOff: number;
    successOff: number;
    epaOff: number;
  };
  defensiveWeights: {
    yppDef: number;
    passYpaDef: number;
    rushYpcDef: number;
    successDef: number;
    epaDef: number;
  };
  backtestSettings?: {
    season: string;
    weeks: string;
    minEdge: number;
    kellyFraction: number;
  };
}

// GET: List all saved configurations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    // For now, we'll use localStorage on the client side
    // In the future, we could store in database
    // For this implementation, we'll return an empty array and let the client handle storage
    
    return NextResponse.json({
      success: true,
      configs: [],
      message: 'Configurations are stored client-side. Use export/import for persistence.',
    });
  } catch (error) {
    console.error('Error fetching ratings configs:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Save a configuration (client-side storage)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, config } = body;

    if (!name || !config) {
      return NextResponse.json(
        { success: false, error: 'Missing name or config' },
        { status: 400 }
      );
    }

    // Validate config structure
    if (!config.offensiveWeights || !config.defensiveWeights) {
      return NextResponse.json(
        { success: false, error: 'Invalid config structure' },
        { status: 400 }
      );
    }

    // For now, just return success
    // The client will handle localStorage storage
    // In the future, we could store in database
    
    return NextResponse.json({
      success: true,
      message: 'Configuration saved (client-side). Use export for backup.',
    });
  } catch (error) {
    console.error('Error saving ratings config:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

