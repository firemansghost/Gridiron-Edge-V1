/**
 * System Status Dashboard
 * 
 * Live health check for the current week's data ingestion.
 * Shows game data, stats coverage, ratings, and V2 data status.
 */

'use client';

import { useState, useEffect } from 'react';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';

interface WeekStatus {
  season: number;
  week: number;
  gameData: {
    totalGames: number;
    gamesWithOdds: number;
    gamesWithFinalScores: number;
    gamesWithStats: number;
  };
  statsCoverage: {
    lineYards: number;
    ppa: number;
    havoc: number;
    isoPpp: number;
  };
  ratings: {
    v1Ratings: boolean;
    v2UnitGrades: boolean;
    v1Count: number;
    v2Count: number;
  };
  v2Data: {
    ppaIngested: boolean;
    effTeamGameIngested: boolean;
    effTeamSeasonIngested: boolean;
    ppaCount: number;
    effGameCount: number;
    effSeasonCount: number;
  };
  lastUpdated: string | null;
}

function StatusBadge({ status, label }: { status: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {status ? (
        <>
          <span className="text-green-600 text-xl">✓</span>
          <span className="text-green-700 font-medium">{label}</span>
        </>
      ) : (
        <>
          <span className="text-red-600 text-xl">✗</span>
          <span className="text-red-700 font-medium">{label}</span>
        </>
      )}
    </div>
  );
}

function CoverageBar({ percentage, label }: { percentage: number; label: string }) {
  const color = percentage >= 90 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm text-gray-600">{percentage.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className={`${color} h-2.5 rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [status, setStatus] = useState<WeekStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/status/week');
        if (!response.ok) {
          throw new Error('Failed to fetch status');
        }
        const data = await response.json();
        setStatus(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center">
          <LoadingState />
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <HeaderNav />
        <div className="flex-1 flex items-center justify-center">
          <ErrorState message={error || 'Failed to load status'} />
        </div>
        <Footer />
      </div>
    );
  }

  const { season, week, gameData, statsCoverage, ratings, v2Data, lastUpdated } = status;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">System Status</h1>
            <p className="text-lg text-gray-600">
              Live health check for {season} Week {week}
            </p>
            {lastUpdated && (
              <p className="text-sm text-gray-500 mt-1">
                Last updated: {new Date(lastUpdated).toLocaleString()}
              </p>
            )}
          </div>

          {/* Game Data Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Game Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Total Games</div>
                <div className="text-2xl font-bold text-gray-900">{gameData.totalGames}</div>
                <div className="text-xs text-gray-500 mt-1">scheduled</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">With Odds</div>
                <div className="text-2xl font-bold text-gray-900">{gameData.gamesWithOdds}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {gameData.totalGames > 0
                    ? `${Math.round((gameData.gamesWithOdds / gameData.totalGames) * 100)}% coverage`
                    : '—'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Final Scores</div>
                <div className="text-2xl font-bold text-gray-900">{gameData.gamesWithFinalScores}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {gameData.totalGames > 0
                    ? `${Math.round((gameData.gamesWithFinalScores / gameData.totalGames) * 100)}% complete`
                    : '—'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">With Stats</div>
                <div className="text-2xl font-bold text-gray-900">{gameData.gamesWithStats}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {gameData.totalGames > 0
                    ? `${Math.round((gameData.gamesWithStats / gameData.totalGames) * 100)}% coverage`
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Coverage Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Stats Coverage</h2>
            <div className="space-y-4">
              <CoverageBar percentage={statsCoverage.lineYards} label="Line Yards" />
              <CoverageBar percentage={statsCoverage.ppa} label="PPA (Points Per Attempt)" />
              <CoverageBar percentage={statsCoverage.isoPpp} label="IsoPPP (Explosiveness)" />
              <CoverageBar percentage={statsCoverage.havoc} label="Havoc Rate (Season)" />
            </div>
          </div>

          {/* Model Health Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Model Health</h2>
            <div className="space-y-3">
              <StatusBadge
                status={ratings.v1Ratings}
                label={`V1 Power Ratings (${ratings.v1Count} teams)`}
              />
              <StatusBadge
                status={ratings.v2UnitGrades}
                label={`V2 Unit Grades (${ratings.v2Count} teams)`}
              />
            </div>
          </div>

          {/* V2 Data Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">V2 Data Ingestion</h2>
            <div className="space-y-3">
              <StatusBadge
                status={v2Data.ppaIngested}
                label={`PPA Data (${v2Data.ppaCount} game records)`}
              />
              <StatusBadge
                status={v2Data.effTeamGameIngested}
                label={`Efficiency Game Stats (${v2Data.effGameCount} records)`}
              />
              <StatusBadge
                status={v2Data.effTeamSeasonIngested}
                label={`Efficiency Season Stats (${v2Data.effSeasonCount} records)`}
              />
            </div>
          </div>

          {/* Refresh Note */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Status updates automatically every 30 seconds</p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

