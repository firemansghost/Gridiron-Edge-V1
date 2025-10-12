'use client';

import { useState, useEffect } from 'react';

export function DataModeBadge() {
  const [dataMode, setDataMode] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDataMode();
  }, []);

  const fetchDataMode = async () => {
    try {
      const response = await fetch('/api/data-mode');
      const data = await response.json();
      
      if (data.success) {
        setDataMode(data.dataMode.toUpperCase());
      }
    } catch (error) {
      console.error('Failed to fetch data mode:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !dataMode) {
    return null;
  }

  const getBadgeColor = () => {
    switch (dataMode) {
      case 'SEED':
        return 'bg-purple-100 text-purple-800';
      case 'MOCK':
        return 'bg-yellow-100 text-yellow-800';
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
