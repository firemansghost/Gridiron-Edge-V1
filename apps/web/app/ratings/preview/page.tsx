/**
 * Ratings Preview Page
 * 
 * Shows ratings computed with custom weights (client-side simulation)
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

interface TeamFeatures {
  teamId: string;
  yppOff: number | null;
  passYpaOff: number | null;
  rushYpcOff: number | null;
  successOff: number | null;
  epaOff: number | null;
  yppDef: number | null;
  passYpaDef: number | null;
  rushYpcDef: number | null;
  successDef: number | null;
  epaDef: number | null;
}

interface ComputedRating {
  teamId: string;
  offenseRating: number;
  defenseRating: number;
  powerRating: number;
}

interface Weights {
  offensive: {
    yppOff: number;
    passYpaOff: number;
    rushYpcOff: number;
    successOff: number;
    epaOff: number;
  };
  defensive: {
    yppDef: number;
    passYpaDef: number;
    rushYpcDef: number;
    successDef: number;
    epaDef: number;
  };
}

const DEFAULT_WEIGHTS: Weights = {
  offensive: {
    yppOff: 0.30,
    passYpaOff: 0.20,
    rushYpcOff: 0.15,
    successOff: 0.20,
    epaOff: 0.15,
  },
  defensive: {
    yppDef: 0.20,
    passYpaDef: 0.20,
    rushYpcDef: 0.15,
    successDef: 0.25,
    epaDef: 0.20,
  },
};

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 1;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance) || 1;
}

function calculateZScore(value: number | null, mean: number, stdDev: number): number {
  if (value === null || isNaN(value)) return 0;
  return (value - mean) / stdDev;
}

function computeRatings(
  teams: TeamFeatures[],
  weights: Weights
): ComputedRating[] {
  // Calculate z-score statistics for each feature
  const features = {
    yppOff: teams.map(t => t.yppOff).filter(v => v !== null) as number[],
    passYpaOff: teams.map(t => t.passYpaOff).filter(v => v !== null) as number[],
    rushYpcOff: teams.map(t => t.rushYpcOff).filter(v => v !== null) as number[],
    successOff: teams.map(t => t.successOff).filter(v => v !== null) as number[],
    epaOff: teams.map(t => t.epaOff).filter(v => v !== null) as number[],
    yppDef: teams.map(t => t.yppDef).filter(v => v !== null) as number[],
    passYpaDef: teams.map(t => t.passYpaDef).filter(v => v !== null) as number[],
    rushYpcDef: teams.map(t => t.rushYpcDef).filter(v => v !== null) as number[],
    successDef: teams.map(t => t.successDef).filter(v => v !== null) as number[],
    epaDef: teams.map(t => t.epaDef).filter(v => v !== null) as number[],
  };

  const stats = {
    yppOff: { mean: calculateMean(features.yppOff), stdDev: calculateStdDev(features.yppOff, calculateMean(features.yppOff)) },
    passYpaOff: { mean: calculateMean(features.passYpaOff), stdDev: calculateStdDev(features.passYpaOff, calculateMean(features.passYpaOff)) },
    rushYpcOff: { mean: calculateMean(features.rushYpcOff), stdDev: calculateStdDev(features.rushYpcOff, calculateMean(features.rushYpcOff)) },
    successOff: { mean: calculateMean(features.successOff), stdDev: calculateStdDev(features.successOff, calculateMean(features.successOff)) },
    epaOff: { mean: calculateMean(features.epaOff), stdDev: calculateStdDev(features.epaOff, calculateMean(features.epaOff)) },
    yppDef: { mean: calculateMean(features.yppDef), stdDev: calculateStdDev(features.yppDef, calculateMean(features.yppDef)) },
    passYpaDef: { mean: calculateMean(features.passYpaDef), stdDev: calculateStdDev(features.passYpaDef, calculateMean(features.passYpaDef)) },
    rushYpcDef: { mean: calculateMean(features.rushYpcDef), stdDev: calculateStdDev(features.rushYpcDef, calculateMean(features.rushYpcDef)) },
    successDef: { mean: calculateMean(features.successDef), stdDev: calculateStdDev(features.successDef, calculateMean(features.successDef)) },
    epaDef: { mean: calculateMean(features.epaDef), stdDev: calculateStdDev(features.epaDef, calculateMean(features.epaDef)) },
  };

  return teams.map(team => {
    // Offensive rating
    const offZ = {
      yppOff: calculateZScore(team.yppOff, stats.yppOff.mean, stats.yppOff.stdDev),
      passYpaOff: calculateZScore(team.passYpaOff, stats.passYpaOff.mean, stats.passYpaOff.stdDev),
      rushYpcOff: calculateZScore(team.rushYpcOff, stats.rushYpcOff.mean, stats.rushYpcOff.stdDev),
      successOff: calculateZScore(team.successOff, stats.successOff.mean, stats.successOff.stdDev),
      epaOff: calculateZScore(team.epaOff, stats.epaOff.mean, stats.epaOff.stdDev),
    };
    const offenseRating = (
      offZ.yppOff * weights.offensive.yppOff +
      offZ.passYpaOff * weights.offensive.passYpaOff +
      offZ.rushYpcOff * weights.offensive.rushYpcOff +
      offZ.successOff * weights.offensive.successOff +
      offZ.epaOff * weights.offensive.epaOff
    );

    // Defensive rating (inverted - lower is better for defense)
    const defZ = {
      yppDef: calculateZScore(team.yppDef, stats.yppDef.mean, stats.yppDef.stdDev),
      passYpaDef: calculateZScore(team.passYpaDef, stats.passYpaDef.mean, stats.passYpaDef.stdDev),
      rushYpcDef: calculateZScore(team.rushYpcDef, stats.rushYpcDef.mean, stats.rushYpcDef.stdDev),
      successDef: calculateZScore(team.successDef, stats.successDef.mean, stats.successDef.stdDev),
      epaDef: calculateZScore(team.epaDef, stats.epaDef.mean, stats.epaDef.stdDev),
    };
    const rawDefenseRating = (
      defZ.yppDef * weights.defensive.yppDef +
      defZ.passYpaDef * weights.defensive.passYpaDef +
      defZ.rushYpcDef * weights.defensive.rushYpcDef +
      defZ.successDef * weights.defensive.successDef +
      defZ.epaDef * weights.defensive.epaDef
    );
    // Invert: lower is better for defense, so multiply by -1
    const defenseRating = -rawDefenseRating;

    const powerRating = offenseRating + defenseRating;

    return {
      teamId: team.teamId,
      offenseRating,
      defenseRating,
      powerRating,
    };
  });
}

function RatingsPreviewContent() {
  const searchParams = useSearchParams();
  const [teams, setTeams] = useState<TeamFeatures[]>([]);
  const [ratings, setRatings] = useState<ComputedRating[]>([]);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [season, setSeason] = useState<string>('2025');
  const [configName, setConfigName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = searchParams.get('config');
    if (loadConfig) {
      try {
        const saved = localStorage.getItem('ratings-configs');
        if (saved) {
          const configs = JSON.parse(saved);
          const config = configs.find((c: any) => c.name === loadConfig);
          if (config) {
            setWeights({
              offensive: config.config.offensiveWeights,
              defensive: config.config.defensiveWeights,
            });
            setConfigName(config.name);
          }
        }
      } catch (error) {
        console.error('Error loading config:', error);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        // Fetch team features from peek endpoint for a sample of teams
        // In production, we'd want a bulk endpoint, but for now we'll use the status page data
        const response = await fetch(`/api/docs/status`);
        const data = await response.json();
        
        // For now, we'll need to fetch features for each team
        // Let's fetch top teams as an example
        const sampleTeams = ['georgia', 'alabama', 'texas', 'ohio-state', 'michigan', 'oregon', 'florida-state', 'washington', 'missouri', 'ole-miss'];
        const teamFeatures: TeamFeatures[] = [];
        
        for (const teamId of sampleTeams) {
          try {
            const teamResponse = await fetch(`/api/ratings/peek?season=${season}&teamId=${teamId}`);
            const teamData = await teamResponse.json();
            if (teamData.success && teamData.features) {
              teamFeatures.push({
                teamId,
                yppOff: teamData.features.yppOff,
                passYpaOff: teamData.features.passYpaOff,
                rushYpcOff: teamData.features.rushYpcOff,
                successOff: teamData.features.successOff,
                epaOff: teamData.features.epaOff,
                yppDef: teamData.features.yppDef,
                passYpaDef: teamData.features.passYpaDef,
                rushYpcDef: teamData.features.rushYpcDef,
                successDef: teamData.features.successDef,
                epaDef: teamData.features.epaDef,
              });
            }
          } catch (err) {
            console.error(`Error fetching ${teamId}:`, err);
          }
        }
        
        setTeams(teamFeatures);
        setLoading(false);
      } catch (err) {
        setError('Failed to load team data: ' + (err instanceof Error ? err.message : 'Unknown error'));
        setLoading(false);
      }
    };

    fetchTeams();
  }, [season]);

  useEffect(() => {
    if (teams.length > 0) {
      const computed = computeRatings(teams, weights);
      computed.sort((a, b) => b.powerRating - a.powerRating);
      setRatings(computed);
    }
  }, [teams, weights]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center">Loading team data...</div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-900 font-semibold mb-2">Error</h2>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">
              Ratings Preview {configName && `(${configName})`}
            </h1>
            <Link 
              href="/ratings/config"
              className="text-blue-600 hover:text-blue-800 underline text-sm"
            >
              ← Back to Config
            </Link>
          </div>
          <p className="text-gray-600">
            Simulated ratings using custom weights (client-side computation)
          </p>
          <div className="mt-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
            ⚠️ This is a preview with sample teams. Full ratings computation requires running the backend job.
          </div>
        </div>

        {/* Weights Display */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Weights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium text-green-700 mb-2">Offensive:</div>
              <div className="font-mono text-gray-700 space-y-1">
                {Object.entries(weights.offensive).map(([key, val]) => (
                  <div key={key}>{key}: {val.toFixed(3)}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-medium text-red-700 mb-2">Defensive:</div>
              <div className="font-mono text-gray-700 space-y-1">
                {Object.entries(weights.defensive).map(([key, val]) => (
                  <div key={key}>{key}: {val.toFixed(3)}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Ratings Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Team
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Power Rating
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Offense Rating
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Defense Rating
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ratings.map((rating, index) => (
                  <tr key={rating.teamId} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {rating.teamId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-right font-semibold">
                      {rating.powerRating.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-right text-green-700">
                      {rating.offenseRating.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-right text-red-700">
                      {rating.defenseRating.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h3 className="font-medium text-blue-900 mb-2">Note</h3>
          <p className="text-sm text-blue-800">
            This preview shows ratings computed client-side with sample teams. To apply custom weights to all teams and persist results, 
            you would need to modify the backend ratings computation job to accept custom weights as parameters.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function RatingsPreviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50">
        <HeaderNav />
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center">Loading...</div>
        </div>
        <Footer />
      </div>
    }>
      <RatingsPreviewContent />
    </Suspense>
  );
}

