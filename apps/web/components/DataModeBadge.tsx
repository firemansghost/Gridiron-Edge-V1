'use client';

import { InfoTooltip } from './InfoTooltip';

export function DataModeBadge() {
  // Read from NEXT_PUBLIC_DATA_MODE at build time
  const dataMode = (process.env.NEXT_PUBLIC_DATA_MODE || 'mock').toUpperCase();

  const getBadgeColor = () => {
    switch (dataMode) {
      case 'SEED':
        return 'bg-purple-100 text-purple-800';
      case 'MOCK':
        return 'bg-gray-100 text-gray-800';
      case 'REAL':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTooltipContent = () => {
    switch (dataMode) {
      case 'REAL':
        return 'Live data from production APIs. This represents real-time betting lines and game data from current season.';
      case 'SEED':
        return 'Seed data for testing. Using sample data from a specific week for demonstration purposes.';
      case 'MOCK':
        return 'Mock/simulated data. Using placeholder data for development and testing.';
      default:
        return 'Data source indicator. Shows whether you are viewing live, seed, or mock data.';
    }
  };

  return (
    <div className="flex items-center gap-1">
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getBadgeColor()}`}>
        Data: {dataMode}
      </span>
      <InfoTooltip content={getTooltipContent()} position="bottom" />
    </div>
  );
}
