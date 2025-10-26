'use client';

import { useEffect, useState } from 'react';

interface ETLHeartbeatData {
  recruiting_2025: number;
  team_game_stats_2025: number;
  team_season_stats_2025: number;
  ratings_2025: number;
  lastUpdated: {
    recruiting: string | null;
    teamGameStats: string | null;
    teamSeasonStats: string | null;
    ratings: string | null;
  };
  timestamp: string;
}

interface ETLHeartbeatProps {
  fallbackData: {
    recruiting2025: number;
    teamGameStats2025: number;
    teamSeasonStats2025: number;
    teamSeasonRatings2025: number;
  };
}

export default function ETLHeartbeat({ fallbackData }: ETLHeartbeatProps) {
  const [data, setData] = useState<ETLHeartbeatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHeartbeat = async () => {
      try {
        const response = await fetch('/api/etl/heartbeat');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const heartbeatData = await response.json();
        setData(heartbeatData);
      } catch (err) {
        console.error('Failed to fetch ETL heartbeat:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchHeartbeat();
  }, []);

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getDataAge = (timestamp: string | null) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    return Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  };

  const getAgeColor = (ageHours: number | null) => {
    if (ageHours === null) return 'text-gray-500';
    if (ageHours < 24) return 'text-green-600';
    if (ageHours < 72) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Use fallback data if API failed
  const displayData = data || {
    recruiting_2025: fallbackData.recruiting2025,
    team_game_stats_2025: fallbackData.teamGameStats2025,
    team_season_stats_2025: fallbackData.teamSeasonStats2025,
    ratings_2025: fallbackData.teamSeasonRatings2025,
    lastUpdated: {
      recruiting: null,
      teamGameStats: null,
      teamSeasonStats: null,
      ratings: null,
    },
    timestamp: new Date().toISOString(),
  };

  return (
    <section>
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">
        💓 ETL Heartbeat (2025)
        {loading && <span className="text-sm text-gray-500 ml-2">(Loading...)</span>}
        {error && <span className="text-sm text-red-500 ml-2">(Error: {error})</span>}
      </h2>
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <h3 className="font-medium text-purple-900 mb-2">Recruiting Data</h3>
            <p className="text-purple-800">
              <span className="font-mono font-bold">{displayData.recruiting_2025.toLocaleString()}</span> records
            </p>
            <p className={`text-xs ${getAgeColor(getDataAge(displayData.lastUpdated.recruiting))}`}>
              {formatTimestamp(displayData.lastUpdated.recruiting)}
            </p>
          </div>
          <div>
            <h3 className="font-medium text-purple-900 mb-2">Team Game Stats</h3>
            <p className="text-purple-800">
              <span className="font-mono font-bold">{displayData.team_game_stats_2025.toLocaleString()}</span> records
            </p>
            <p className={`text-xs ${getAgeColor(getDataAge(displayData.lastUpdated.teamGameStats))}`}>
              {formatTimestamp(displayData.lastUpdated.teamGameStats)}
            </p>
          </div>
          <div>
            <h3 className="font-medium text-purple-900 mb-2">Season Stats</h3>
            <p className="text-purple-800">
              <span className="font-mono font-bold">{displayData.team_season_stats_2025.toLocaleString()}</span> records
            </p>
            <p className={`text-xs ${getAgeColor(getDataAge(displayData.lastUpdated.teamSeasonStats))}`}>
              {formatTimestamp(displayData.lastUpdated.teamSeasonStats)}
            </p>
          </div>
          <div>
            <h3 className="font-medium text-purple-900 mb-2">Baseline Ratings</h3>
            <p className="text-purple-800">
              <span className="font-mono font-bold">{displayData.ratings_2025.toLocaleString()}</span> teams rated
            </p>
            <p className={`text-xs ${getAgeColor(getDataAge(displayData.lastUpdated.ratings))}`}>
              {formatTimestamp(displayData.lastUpdated.ratings)}
            </p>
          </div>
        </div>
        {data && (
          <div className="mt-4 pt-4 border-t border-purple-200">
            <p className="text-xs text-purple-600">
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
