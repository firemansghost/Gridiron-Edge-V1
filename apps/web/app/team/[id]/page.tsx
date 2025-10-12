/**
 * Team Detail Page
 * 
 * Shows team profile with logo, colors, conference, and latest power rating
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import { TeamLogo } from '@/components/TeamLogo';

interface TeamData {
  success: boolean;
  team: {
    id: string;
    name: string;
    conference: string;
    division?: string | null;
    city?: string | null;
    state?: string | null;
    mascot?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
  };
  rating: {
    rating: number;
    season: number;
    week: number;
    modelVersion: string;
  } | null;
  recentGames: Array<{
    gameId: string;
    date: string;
    opponent: string;
    isHome: boolean;
    venue: string;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
  }>;
}

export default function TeamDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchTeamData();
    }
  }, [params.id, searchParams]);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      const season = searchParams.get('season');
      const week = searchParams.get('week');
      
      let url = `/api/team/${params.id}`;
      if (season && week) {
        url += `?season=${season}&week=${week}`;
      }

      const response = await fetch(url);
      const result = await response.json();
      
      if (result.success) {
        setData(result);
      } else {
        setError(result.error || 'Failed to load team data');
      }
    } catch (err) {
      setError('Network error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading team data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Team</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const { team, rating, recentGames } = data;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Team Header Card */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
            <div 
              className="h-32"
              style={{ 
                backgroundColor: team.primaryColor || '#6B7280',
                background: team.primaryColor && team.secondaryColor 
                  ? `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.secondaryColor} 100%)`
                  : team.primaryColor || '#6B7280'
              }}
            />
            <div className="px-8 py-6">
              <div className="flex items-start gap-6">
                {/* Logo */}
                <div className="flex-shrink-0 -mt-16">
                  <div className="bg-white rounded-lg p-2 shadow-lg">
                    <TeamLogo
                      teamName={team.name}
                      logoUrl={team.logoUrl}
                      primaryColor={team.primaryColor}
                      teamId={team.id}
                      size="xl"
                    />
                  </div>
                </div>

                {/* Team Info */}
                <div className="flex-1 pt-4">
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">{team.name}</h1>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Conference:</span>
                      <span>{team.conference}</span>
                    </div>
                    {team.division && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Division:</span>
                        <span>{team.division}</span>
                      </div>
                    )}
                    {team.mascot && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Mascot:</span>
                        <span>{team.mascot}</span>
                      </div>
                    )}
                    {team.city && team.state && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Location:</span>
                        <span>{team.city}, {team.state}</span>
                      </div>
                    )}
                  </div>

                  {/* Team Colors */}
                  {(team.primaryColor || team.secondaryColor) && (
                    <div className="mt-4">
                      <span className="text-sm font-semibold text-gray-600 mr-3">Colors:</span>
                      <div className="inline-flex gap-2">
                        {team.primaryColor && (
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 rounded border border-gray-300"
                              style={{ backgroundColor: team.primaryColor }}
                            />
                            <span className="text-xs text-gray-500">{team.primaryColor}</span>
                          </div>
                        )}
                        {team.secondaryColor && (
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 rounded border border-gray-300"
                              style={{ backgroundColor: team.secondaryColor }}
                            />
                            <span className="text-xs text-gray-500">{team.secondaryColor}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Power Rating */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Power Rating</h2>
                {rating ? (
                  <div className="space-y-4">
                    <div className="text-center py-6 bg-blue-50 rounded-lg">
                      <div className="text-5xl font-bold text-blue-600">
                        {rating.rating.toFixed(1)}
                      </div>
                      <div className="text-sm text-gray-600 mt-2">Current Rating</div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Season:</span>
                        <span className="font-medium text-gray-900">{rating.season}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Week:</span>
                        <span className="font-medium text-gray-900">{rating.week}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Model:</span>
                        <span className="font-medium text-gray-900">{rating.modelVersion}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📊</div>
                    <p>No rating data available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Recent Games */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Games</h2>
                {recentGames.length > 0 ? (
                  <div className="space-y-3">
                    {recentGames.map(game => (
                      <Link 
                        key={game.gameId}
                        href={`/game/${game.gameId}`}
                        className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-sm">
                              <span className={`font-medium ${game.isHome ? 'text-blue-600' : 'text-gray-900'}`}>
                                {game.isHome ? 'vs' : '@'}
                              </span>
                              <span className="font-medium text-gray-900">{game.opponent}</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(game.date).toLocaleDateString()} • {game.venue}
                            </div>
                          </div>
                          <div className="text-right">
                            {game.homeScore !== null && game.awayScore !== null ? (
                              <div className="text-lg font-bold text-gray-900">
                                {game.isHome ? `${game.homeScore}-${game.awayScore}` : `${game.awayScore}-${game.homeScore}`}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 capitalize">{game.status}</div>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🏈</div>
                    <p>No recent games found</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Back Link */}
          <div className="mt-8">
            <Link 
              href="/"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

