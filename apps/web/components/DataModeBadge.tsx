'use client';

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

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getBadgeColor()}`}>
      Data: {dataMode}
    </span>
  );
}
