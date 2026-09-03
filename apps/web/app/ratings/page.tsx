/**
 * Power Ratings Page
 *
 * Displays persisted Core V1 (modelVersion=v1) FBS power ratings.
 * 2026 conference is season-membership truth, not stale Team.conference.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';
import {
  CORE_V1_RATINGS_PAGE_COPY,
  isCoreV12026LifecycleSeason,
  isSeasonAwareConferenceSeason,
  ratingsGamesColumnLabel,
  ratingsPageCopyKind,
  type RatingsProvenance,
} from '@/lib/ratings-truth';

interface TeamRating {
  teamId: string;
  team: string;
  conference: string;
  rating: number;
  offenseRating: number | null;
  defenseRating: number | null;
  games: number;
  gamesSample: number | null;
  confidence: number | null;
  dataSource: string | null;
  rank: number;
}

interface RatingsResponse {
  success: boolean;
  season: number;
  provenance?: RatingsProvenance;
  ratings: TeamRating[];
  count: number;
  error?: string;
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
        const result = (await response.json()) as RatingsResponse;
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch ratings');
        }
        setData(result);
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

  const seasonAware = data ? isSeasonAwareConferenceSeason(data.season) : false;
  const lifecycle2026 = data ? isCoreV12026LifecycleSeason(data.season) : false;
  const copyKind = data ? ratingsPageCopyKind(data.season) : 'legacy';
  const showOffenseDefense = data != null && !seasonAware;
  const gamesColumnLabel = data ? ratingsGamesColumnLabel(data.season) : 'Games';

  const filteredAndSortedRatings = useMemo(() => {
    if (!data?.ratings) return [];

    let filtered = data.ratings;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.team.toLowerCase().includes(query) ||
          r.conference.toLowerCase().includes(query)
      );
    }

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
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Power Ratings (V1 Model)
          </h1>
          <p className="text-gray-600 mb-4">
            {seasonAware
              ? CORE_V1_RATINGS_PAGE_COPY.headline
              : 'Team strength ratings used to generate model spreads. Ratings represent points above an average FBS team on a neutral field.'}
          </p>
          {data && (
            <p className="text-sm text-gray-500">
              Season {data.season} • {data.count} FBS teams
            </p>
          )}
        </div>

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
                placeholder="2026"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
            Error: {error}
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">Loading ratings...</p>
          </div>
        )}

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
                    {showOffenseDefense && (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Offense
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Defense
                        </th>
                      </>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {gamesColumnLabel}
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
                      {showOffenseDefense && (
                        <>
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
                        </>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {lifecycle2026
                          ? rating.gamesSample != null
                            ? rating.gamesSample
                            : '—'
                          : rating.games}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && filteredAndSortedRatings.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">
              {searchQuery
                ? 'No teams found matching your search.'
                : 'No ratings available.'}
            </p>
          </div>
        )}

        {!loading && !error && (
          <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              About Power Ratings
            </h3>
            {copyKind === 'core_v1_2026_lifecycle' ? (
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>{CORE_V1_RATINGS_PAGE_COPY.headline}</li>
                <li>{CORE_V1_RATINGS_PAGE_COPY.baseline}</li>
                <li>{CORE_V1_RATINGS_PAGE_COPY.components}</li>
                <li>{CORE_V1_RATINGS_PAGE_COPY.conference}</li>
                <li>{CORE_V1_RATINGS_PAGE_COPY.ratingSample}</li>
              </ul>
            ) : copyKind === 'membership_conference' ? (
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>{CORE_V1_RATINGS_PAGE_COPY.headline}</li>
                <li>{CORE_V1_RATINGS_PAGE_COPY.conference}</li>
              </ul>
            ) : (
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
            )}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
