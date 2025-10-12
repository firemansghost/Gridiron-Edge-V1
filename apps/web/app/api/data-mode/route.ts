/**
 * Data Mode API
 * 
 * Returns the current DATA_MODE for client-side display
 */

import { getDataMode } from '@/lib/data-mode';
import { NextResponse } from 'next/server';

export async function GET() {
  const dataMode = getDataMode();
  
  return NextResponse.json({
    success: true,
    dataMode,
  });
}
