/**
 * Power Ratings Page
 * 
 * Displays all FBS teams ranked by their V1 model power ratings
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

interface TeamRating {
  teamId: string;
  team: string;
  conference: string;
  rating: number;
  offenseRating: number | null;
  defenseRating: number | null;
  games: number;
  confidence: number | null;
  dataSource: string | null;
  rank: number;
}

interface RatingsResponse {
  success: boolean;
  season: number;
  ratings: TeamRating[];
  count: number;
}

type SortField = 'rank' | 'team' | 'rating' | 'conference';
type SortDirection = 'asc' | 'desc';

export default function RatingsPage() {
  const [data, setData] = useState<RatingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('rating');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    const fetchRatings = async () => {
      setLoading(true);
      setError(null);
      try {
        const seasonParam = season ? `?season=${season}` : '';
        const response = await fetch(`/api/ratings${seasonParam}`);
        if (!response.ok) {
          throw new Error('Failed to fetch ratings');
        }
        const result = await response.json();
        setData(result);
        // Only set season if it wasn't explicitly provided by user
        if (season === null) {
          setSeason(result.season);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching ratings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRatings();
  }, [season]);

  // Filter and sort ratings
  const filteredAndSortedRatings = useMemo(() => {
    if (!data?.ratings) return [];

    let filtered = data.ratings;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        r =>
          r.team.toLowerCase().includes(query) ||
          r.conference.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case 'rank':
          aVal = a.rank;
          bVal = b.rank;
          break;
        case 'team':
          aVal = a.team.toLowerCase();
          bVal = b.team.toLowerCase();
          break;
        case 'rating':
          aVal = a.rating;
          bVal = b.rating;
          break;
        case 'conference':
          aVal = a.conference.toLowerCase();
          bVal = b.conference.toLowerCase();
          break;
        default:
          aVal = a.rating;
          bVal = b.rating;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [data, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'rating' || field === 'rank' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const formatRating = (rating: number) => {
    const sign = rating >= 0 ? '+' : '';
    return `${sign}${rating.toFixed(1)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Power Ratings (V1 Model)
          </h1>
          <p className="text-gray-600 mb-4">
            Team strength ratings used to generate model spreads. Ratings represent
            points above an average FBS team on a neutral field.
          </p>
          {data && (
            <p className="text-sm text-gray-500">
              Season {data.season} • {data.count} FBS teams
            </p>
          )}
        </div>

        {/* Search and Season Selector */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Teams
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by team name or conference..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Season
              </label>
              <input
                type="number"
                value={season || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSeason(val ? parseInt(val, 10) : null);
                }}
                placeholder="2025"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
            Error: {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">Loading ratings...</p>
          </div>
        )}

        {/* Ratings Table */}
        {!loading && !error && filteredAndSortedRatings.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('rank')}
                    >
                      <div className="flex items-center gap-1">
                        Rank
                        <SortIcon field="rank" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('team')}
                    >
                      <div className="flex items-center gap-1">
                        Team
                        <SortIcon field="team" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('conference')}
                    >
                      <div className="flex items-center gap-1">
                        Conference
                        <SortIcon field="conference" />
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('rating')}
                    >
                      <div className="flex items-center gap-1">
                        Power Rating
                        <SortIcon field="rating" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Offense
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Defense
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Games
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAndSortedRatings.map((rating) => (
                    <tr
                      key={rating.teamId}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{rating.rank}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {rating.team}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {rating.conference}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-blue-600">
                        {formatRating(rating.rating)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {rating.offenseRating !== null
                          ? formatRating(rating.offenseRating)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {rating.defenseRating !== null
                          ? formatRating(rating.defenseRating)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {rating.games}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredAndSortedRatings.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">
              {searchQuery
                ? 'No teams found matching your search.'
                : 'No ratings available.'}
            </p>
          </div>
        )}

        {/* Info Box */}
        {!loading && !error && (
          <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              About Power Ratings
            </h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>
                Ratings represent points above/below an average FBS team on a
                neutral field
              </li>
              <li>
                A team with a +14.2 rating would be expected to beat an average
                team by 14.2 points on a neutral field
              </li>
              <li>
                Ratings are calculated using offensive and defensive statistics
                (yards per play, success rate, EPA, etc.)
              </li>
              <li>
                These ratings are used to generate model spreads for game
                predictions
              </li>
            </ul>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

