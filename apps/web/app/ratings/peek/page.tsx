/**
 * Ratings Peek Page
 * 
 * Formatted UI for viewing team ratings and features
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

interface RatingData {
  success: boolean;
  teamId: string;
  season: number;
  features: {
    yppOff: number | null;
    successOff: number | null;
    epaOff: number | null;
    paceOff: number | null;
    passYpaOff: number | null;
    rushYpcOff: number | null;
    yppDef: number | null;
    successDef: number | null;
    epaDef: number | null;
    paceDef: number | null;
    passYpaDef: number | null;
    rushYpcDef: number | null;
    dataSource: string;
    confidence: number;
    gamesCount: number;
    lastUpdated: string | null;
  };
  rating: {
    offenseRating: number | null;
    defenseRating: number | null;
    powerRating: number | null;
    confidence: number | null;
    dataSource: string | null;
    createdAt: string;
    updatedAt: string | null;
  } | null;
}

function RatingsPeekContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<RatingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const season = searchParams.get('season') || '2025';
  const teamId = searchParams.get('teamId') || '';

  useEffect(() => {
    if (!teamId) {
      setError('Missing teamId parameter');
      setLoading(false);
      return;
    }

    fetch(`/api/ratings/peek?season=${season}&teamId=${teamId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setData(data);
        } else {
          setError(data.error || 'Failed to load ratings');
        }
      })
      .catch(err => {
        setError('Network error: ' + err.message);
      })
      .finally(() => setLoading(false));
  }, [season, teamId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center">Loading...</div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-900 font-semibold mb-2">Error</h2>
            <p className="text-red-700">{error || 'No data available'}</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const formatNumber = (n: number | null, decimals = 2) => {
    if (n === null || n === undefined) return '—';
    return n.toFixed(decimals);
  };

  const formatPercentage = (n: number | null) => {
    if (n === null || n === undefined) return '—';
    return `${(n * 100).toFixed(1)}%`;
  };

  const dataSourceColors: { [key: string]: string } = {
    'game': 'bg-blue-100 text-blue-800',
    'game+season': 'bg-green-100 text-green-800',
    'season': 'bg-yellow-100 text-yellow-800',
    'season_only': 'bg-yellow-100 text-yellow-800',
    'baseline': 'bg-gray-100 text-gray-800',
    'missing': 'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">
              Ratings Peek: {data.teamId}
            </h1>
            <Link 
              href={`/docs/status`}
              className="text-blue-600 hover:text-blue-800 underline text-sm"
            >
              ← Back to Status
            </Link>
          </div>
          <p className="text-gray-600">Season {data.season}</p>
        </div>

        {/* Rating Summary */}
        {data.rating && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Computed Ratings</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600 mb-1">Power Rating</div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatNumber(data.rating.powerRating)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Offense Rating</div>
                <div className="text-2xl font-bold text-green-700">
                  {formatNumber(data.rating.offenseRating)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Defense Rating</div>
                <div className="text-2xl font-bold text-red-700">
                  {formatNumber(data.rating.defenseRating)}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div>
                <span className="text-sm text-gray-600">Confidence: </span>
                <span className="font-semibold">{formatPercentage(data.rating.confidence)}</span>
              </div>
              <div>
                <span className="text-sm text-gray-600">Data Source: </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${dataSourceColors[data.rating.dataSource || 'unknown'] || 'bg-gray-100 text-gray-800'}`}>
                  {data.rating.dataSource || 'unknown'}
                </span>
              </div>
              {data.rating.updatedAt && (
                <div className="text-sm text-gray-500">
                  Updated: {new Date(data.rating.updatedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Features Grid */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Raw Features</h2>
          
          {/* Offensive Features */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-green-700 mb-3">Offensive Features</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600">Yards Per Play</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.yppOff)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Success Rate</div>
                <div className="font-mono font-semibold">{formatPercentage(data.features.successOff)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">EPA/Play</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.epaOff)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Pace (Plays/Game)</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.paceOff)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Pass YPA</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.passYpaOff)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Rush YPC</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.rushYpcOff)}</div>
              </div>
            </div>
          </div>

          {/* Defensive Features */}
          <div>
            <h3 className="text-lg font-medium text-red-700 mb-3">Defensive Features</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600">Yards Per Play Allowed</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.yppDef)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Success Rate Allowed</div>
                <div className="font-mono font-semibold">{formatPercentage(data.features.successDef)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">EPA/Play Allowed</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.epaDef)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Pace Def</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.paceDef)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Pass YPA Allowed</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.passYpaDef)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Rush YPC Allowed</div>
                <div className="font-mono font-semibold">{formatNumber(data.features.rushYpcDef)}</div>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-gray-600">Feature Confidence: </span>
                <span className="font-semibold">{formatPercentage(data.features.confidence)}</span>
              </div>
              <div>
                <span className="text-gray-600">Games Count: </span>
                <span className="font-semibold">{data.features.gamesCount}</span>
              </div>
              <div>
                <span className="text-gray-600">Feature Data Source: </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${dataSourceColors[data.features.dataSource] || 'bg-gray-100 text-gray-800'}`}>
                  {data.features.dataSource}
                </span>
              </div>
              {data.features.lastUpdated && (
                <div className="text-gray-500">
                  Last Updated: {new Date(data.features.lastUpdated).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Raw JSON (collapsible) */}
        <details className="bg-gray-100 rounded-lg p-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
            View Raw JSON
          </summary>
          <pre className="text-xs bg-gray-800 text-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
      <Footer />
    </div>
  );
}

export default function RatingsPeekPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center">Loading...</div>
        </div>
        <Footer />
      </div>
    }>
      <RatingsPeekContent />
    </Suspense>
  );
}

