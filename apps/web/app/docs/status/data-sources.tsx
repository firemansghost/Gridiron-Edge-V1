'use client';

import { useEffect, useState } from 'react';

interface DataSourceSummary {
  gameFeatures: number;
  seasonFeatures: number;
  baselineOnly: number;
  missing: number;
  total: number;
}

interface DataSourcesData {
  season: number;
  timestamp: string;
  summary: DataSourceSummary;
  percentages: {
    gameFeatures: number;
    seasonFeatures: number;
    baselineOnly: number;
    missing: number;
  };
  qualityScore: number;
  recommendations: string[];
}

interface DataSourcesProps {
  season: number;
}

export default function DataSources({ season }: DataSourcesProps) {
  const [data, setData] = useState<DataSourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDataSources = async () => {
      try {
        const response = await fetch(`/api/ratings/data-sources?season=${season}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const dataSourcesData = await response.json();
        setData(dataSourcesData);
      } catch (err) {
        console.error('Failed to fetch data sources:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchDataSources();
  }, [season]);

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getQualityLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  if (loading) {
    return (
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          📊 Data Sources (Season {season})
        </h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800">Loading data source summary...</p>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section>
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          📊 Data Sources (Season {season})
        </h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error || 'Failed to load data'}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">
        📊 Data Sources (Season {season})
      </h2>
      
      {/* Quality Score */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-blue-900 mb-1">Data Quality Score</h3>
            <p className="text-sm text-blue-700">
              Based on data source hierarchy: Game-level (100%), Season-level (70%), Baseline (30%)
            </p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${getQualityColor(data.qualityScore)}`}>
              {data.qualityScore}
            </div>
            <div className={`text-sm font-medium ${getQualityColor(data.qualityScore)}`}>
              {getQualityLabel(data.qualityScore)}
            </div>
          </div>
        </div>
      </div>

      {/* Data Source Distribution */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <h3 className="font-medium text-gray-900 mb-3">Data Source Distribution</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-green-50 border border-green-200 rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-green-900">Game-Level</h4>
                <p className="text-sm text-green-700">Most accurate</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-green-900">
                  {data.summary.gameFeatures}
                </div>
                <div className="text-sm text-green-700">
                  {data.percentages.gameFeatures.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-yellow-900">Season-Level</h4>
                <p className="text-sm text-yellow-700">Good fallback</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-yellow-900">
                  {data.summary.seasonFeatures}
                </div>
                <div className="text-sm text-yellow-700">
                  {data.percentages.seasonFeatures.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-orange-900">Baseline Only</h4>
                <p className="text-sm text-orange-700">Last resort</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-orange-900">
                  {data.summary.baselineOnly}
                </div>
                <div className="text-sm text-orange-700">
                  {data.percentages.baselineOnly.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-red-900">Missing</h4>
                <p className="text-sm text-red-700">No data</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-red-900">
                  {data.summary.missing}
                </div>
                <div className="text-sm text-red-700">
                  {data.percentages.missing.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="font-medium text-purple-900 mb-2">Recommendations</h3>
          <ul className="space-y-1">
            {data.recommendations.map((rec, index) => (
              <li key={index} className="text-sm text-purple-800 flex items-start">
                <span className="text-purple-600 mr-2">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timestamp */}
      <div className="mt-4 text-xs text-gray-500">
        Last updated: {new Date(data.timestamp).toLocaleString()}
      </div>
    </section>
  );
}
