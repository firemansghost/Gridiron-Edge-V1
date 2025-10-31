import { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import ETLHeartbeat from './etl-heartbeat';
import DataSources from './data-sources';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Database Status',
  description: 'Live database status and sanity checks for Gridiron Edge',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StatusPage() {
  try {
    // 1) Latest season/week present in games
    const latestGame = await prisma.game.findFirst({
      orderBy: [
        { season: 'desc' },
        { week: 'desc' },
      ],
      select: {
        season: true,
        week: true,
      },
    });

    // 2) Counts for market_lines for the current (season, week) grouped by line_type and source
    const currentSeason = latestGame?.season || 2025;
    const currentWeek = latestGame?.week || 8;
    
    const marketLineCounts = await prisma.marketLine.groupBy({
      by: ['lineType', 'source'],
      where: {
        season: currentSeason,
        week: currentWeek,
      },
      _count: {
        id: true,
      },
      orderBy: [
        { lineType: 'asc' },
        { source: 'asc' },
      ],
    });

    // 3) Top 10 most-recent market_lines rows
    const recentMarketLines = await prisma.marketLine.findMany({
      take: 10,
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        gameId: true,
        lineType: true,
        lineValue: true,
        closingLine: true,
        bookName: true,
        source: true,
        timestamp: true,
      },
    });

    // 4) Seed week quick check (2024, week 1)
    const seedWeekCheck = await prisma.game.count({
      where: {
        season: 2024,
        week: 1,
      },
    });

    const seedWeekMarketLines = await prisma.marketLine.count({
      where: {
        season: 2024,
        week: 1,
      },
    });

    // 5) Odds coverage for current week
    const oddsCoverage = await prisma.$queryRaw`
      SELECT 
        ml.book_name,
        ml.line_type,
        COUNT(*) AS rows,
        MAX(ml.timestamp) AS last_timestamp
      FROM market_lines ml
      JOIN games g ON g.id = ml.game_id
      WHERE g.season = ${currentSeason} AND g.week = ${currentWeek}
      GROUP BY ml.book_name, ml.line_type
      ORDER BY ml.book_name, ml.line_type
    `;

    // 6) Bets ledger counts
    const totalBets = await prisma.bet.count();
    const gradedBets = await prisma.bet.count({
      where: { result: { not: null } }
    });
    const lastGradingRun = await prisma.bet.findFirst({
      where: { result: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    // 7) Games graded this season
    const totalGames = await prisma.game.count({
      where: { season: currentSeason }
    });
    const gamesWithFinalScores = await prisma.game.count({
      where: { 
        season: currentSeason,
        status: 'final',
        homeScore: { not: null },
        awayScore: { not: null }
      }
    });
    const lastScoreUpdate = await prisma.game.findFirst({
      where: { 
        season: currentSeason,
        status: 'final',
        homeScore: { not: null },
        awayScore: { not: null }
      },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    // 8) Team Game Stats counts
    const totalTeamGameStats = await prisma.teamGameStat.count({
      where: { season: currentSeason }
    });
    const teamGameStatsThisWeek = await prisma.teamGameStat.count({
      where: { 
        season: currentSeason,
        week: currentWeek
      }
    });
    const lastTeamStatsUpdate = await prisma.teamGameStat.findFirst({
      where: { season: currentSeason },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    // 9) Recruiting/Talent counts
    const totalRecruitingRecords = await prisma.recruiting.count({
      where: { season: currentSeason }
    });
    const lastRecruitingUpdate = await prisma.recruiting.findFirst({
      where: { season: currentSeason },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    });

    // 10) ETL Heartbeat counts (2025 specific)
    const recruiting2025 = await prisma.recruiting.count({
      where: { season: 2025 }
    });
    const teamGameStats2025 = await prisma.teamGameStat.count({
      where: { season: 2025 }
    });
    
    // Handle team_season_stats gracefully (table might be empty)
    let teamSeasonStats2025 = 0;
    try {
      teamSeasonStats2025 = await prisma.teamSeasonStat.count({
        where: { season: 2025 }
      });
    } catch (error) {
      console.warn('team_season_stats table not accessible:', error);
      teamSeasonStats2025 = 0;
    }

    // Handle team_season_ratings gracefully (table might be empty)
    let teamSeasonRatings2025 = 0;
    let ratingsHealth2025: any = null;
    try {
      teamSeasonRatings2025 = await prisma.teamSeasonRating.count({
        where: { season: 2025 }
      });

      // Get ratings health metrics if ratings exist
      if (teamSeasonRatings2025 > 0) {
        const ratings = await prisma.teamSeasonRating.findMany({
          where: { season: 2025 },
          select: {
            powerRating: true,
            rating: true,
            confidence: true,
            dataSource: true,
          },
        });

        const powerRatings = ratings
          .map(r => Number(r.powerRating || r.rating || 0))
          .filter(r => r !== 0);
        const confidences = ratings
          .map(r => Number(r.confidence || 0))
          .filter(c => c > 0);
        
        const dataSourceBreakdown = ratings.reduce((acc, r) => {
          const source = r.dataSource || 'unknown';
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        if (powerRatings.length > 0) {
          powerRatings.sort((a, b) => a - b);
          const minRating = powerRatings[0];
          const maxRating = powerRatings[powerRatings.length - 1];
          const medianRating = powerRatings[Math.floor(powerRatings.length / 2)];
          const avgConfidence = confidences.length > 0 
            ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
            : 0;

          ratingsHealth2025 = {
            minRating: minRating.toFixed(2),
            maxRating: maxRating.toFixed(2),
            medianRating: medianRating.toFixed(2),
            avgConfidence: (avgConfidence * 100).toFixed(1),
            dataSourceBreakdown,
            totalWithConfidence: confidences.length,
          };
        }
      }
    } catch (error) {
      console.warn('team_season_ratings table not accessible:', error);
      teamSeasonRatings2025 = 0;
    }

    const oddsRowCount = Array.isArray(oddsCoverage) 
      ? oddsCoverage.reduce((sum: number, row: any) => sum + parseInt(row.rows), 0)
      : 0;

    const uniqueBooks = Array.isArray(oddsCoverage) 
      ? Array.from(new Set(oddsCoverage.map((row: any) => row.book_name)))
      : [];

    const lastOddsUpdate = Array.isArray(oddsCoverage) && oddsCoverage.length > 0
      ? oddsCoverage.reduce((latest: Date, row: any) => {
          const timestamp = new Date(row.last_timestamp);
          return timestamp > latest ? timestamp : latest;
        }, new Date(0))
      : null;

    return (
      <>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Database Status
        </h1>
        
        {/* Summary Section for Less Technical Users */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 p-6 rounded-r-lg mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Quick Status Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Current Season</div>
              <div className="text-2xl font-bold text-blue-600">{currentSeason}</div>
              <div className="text-xs text-gray-500 mt-1">Week {currentWeek}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Total Games</div>
              <div className="text-2xl font-bold text-green-600">{totalGames.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">This season</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="text-sm text-gray-600 mb-1">Betting Lines</div>
              <div className="text-2xl font-bold text-purple-600">{oddsRowCount.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">From {uniqueBooks.length} books</div>
            </div>
          </div>
          <div className="text-sm text-gray-700">
            <p className="mb-2">
              <strong>What this page shows:</strong> Technical details about the database, data coverage, and system health. 
              For general usage, check the <Link href="/" className="text-blue-600 hover:text-blue-800 underline">Current Slate</Link> page.
            </p>
            <p>
              <strong>Key metrics:</strong> Games = scheduled games stored in database. Betting Lines = odds from various sportsbooks. 
              Ratings = computed team power ratings. See sections below for detailed breakdowns.
            </p>
          </div>
        </div>
        
        <div className="space-y-8">
          {/* Latest Season/Week */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              📊 Latest Data
            </h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-blue-900 mb-2">Latest FBS Games</h3>
                  <p className="text-blue-800">
                    Season: <span className="font-mono font-bold">{currentSeason}</span>
                  </p>
                  <p className="text-blue-800">
                    Week: <span className="font-mono font-bold">{currentWeek}</span>
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-blue-900 mb-2">Seed Week Check</h3>
                  <p className="text-blue-800">
                    2024 Week 1 Games: <span className="font-mono font-bold">{seedWeekCheck}</span>
                  </p>
                  <p className="text-blue-800">
                    2024 Week 1 Market Lines: <span className="font-mono font-bold">{seedWeekMarketLines}</span>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Odds Coverage Status */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              📊 Odds Coverage Status
            </h2>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-green-900 mb-2">Week {currentWeek} Coverage</h3>
                  <p className="text-green-800">
                    Odds rows: <span className="font-mono font-bold">{oddsRowCount.toLocaleString()}</span>
                  </p>
                  <p className="text-green-800">
                    Books: <span className="font-mono font-bold">{uniqueBooks.length}</span> ({uniqueBooks.join(', ')})
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-green-900 mb-2">Last Update</h3>
                  <p className="text-green-800">
                    {lastOddsUpdate ? lastOddsUpdate.toLocaleString() : 'No data'}
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    <a 
                      href={`/api/diagnostics/odds-coverage?season=${currentSeason}&week=${currentWeek}`}
                      className="underline hover:text-green-900"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View raw diagnostics →
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Market Line Counts */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              📈 Market Lines by Type & Source
            </h2>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Line Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {marketLineCounts.length > 0 ? (
                    marketLineCounts.map((item, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">
                          {item.lineType}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.source}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">
                          {item._count.id.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        No market lines found for season {currentSeason}, week {currentWeek}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Recent Market Lines */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              🕒 Recent Market Lines
            </h2>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Game ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Book
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentMarketLines.length > 0 ? (
                    recentMarketLines.map((line, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">
                          {line.gameId}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {line.lineType}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">
                          {line.closingLine ?? line.lineValue ?? 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {line.bookName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {line.source}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-500">
                          {line.timestamp ? new Date(line.timestamp).toLocaleString() : 'N/A'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        No market lines found in database
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Games Graded Status */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              🏈 Games Graded This Season
            </h2>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="font-medium text-orange-900 mb-2">Total Games</h3>
                  <p className="text-orange-800">
                    <span className="font-mono font-bold">{totalGames.toLocaleString()}</span> games in {currentSeason}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-orange-900 mb-2">With Final Scores</h3>
                  <p className="text-orange-800">
                    <span className="font-mono font-bold">{gamesWithFinalScores.toLocaleString()}</span> games graded
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-orange-900 mb-2">Last Score Update</h3>
                  <p className="text-orange-800">
                    {lastScoreUpdate?.updatedAt ? lastScoreUpdate.updatedAt.toLocaleString() : 'Never'}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-orange-200">
                <p className="text-sm text-orange-700">
                  Completion rate: <span className="font-mono font-bold">
                    {totalGames > 0 ? ((gamesWithFinalScores / totalGames) * 100).toFixed(1) : '0.0'}%
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* Bets Ledger Status */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              💰 Bets Ledger
            </h2>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="font-medium text-purple-900 mb-2">Total Bets</h3>
                  <p className="text-purple-800">
                    <span className="font-mono font-bold">{totalBets.toLocaleString()}</span> bets recorded
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-purple-900 mb-2">Graded</h3>
                  <p className="text-purple-800">
                    <span className="font-mono font-bold">{gradedBets.toLocaleString()}</span> bets graded
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-purple-900 mb-2">Last Graded</h3>
                  <p className="text-purple-800">
                    {lastGradingRun?.updatedAt ? lastGradingRun.updatedAt.toLocaleString() : 'Never'}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-purple-200">
                <p className="text-sm text-purple-700">
                  <a 
                    href="/weeks/review" 
                    className="underline hover:text-purple-900"
                  >
                    Review weeks →
                  </a>
                  {' • '}
                  <a 
                    href="/bets" 
                    className="underline hover:text-purple-900"
                  >
                    View ledger →
                  </a>
                </p>
              </div>
            </div>
          </section>

          {/* Team Game Stats Status */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              📊 Team Game Stats
            </h2>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="font-medium text-indigo-900 mb-2">Total Stats</h3>
                  <p className="text-indigo-800">
                    <span className="font-mono font-bold">{totalTeamGameStats.toLocaleString()}</span> team game stats in {currentSeason}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-indigo-900 mb-2">This Week</h3>
                  <p className="text-indigo-800">
                    <span className="font-mono font-bold">{teamGameStatsThisWeek.toLocaleString()}</span> stats for Week {currentWeek}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-indigo-900 mb-2">Last Update</h3>
                  <p className="text-indigo-800">
                    {lastTeamStatsUpdate?.updatedAt ? lastTeamStatsUpdate.updatedAt.toLocaleString() : 'Never'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Recruiting/Talent Status */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              🎯 Team Talent & Recruiting
            </h2>
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-teal-900 mb-2">Talent Records</h3>
                  <p className="text-teal-800">
                    <span className="font-mono font-bold">{totalRecruitingRecords.toLocaleString()}</span> team talent records in {currentSeason}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-teal-900 mb-2">Last Update</h3>
                  <p className="text-teal-800">
                    {lastRecruitingUpdate?.updatedAt ? lastRecruitingUpdate.updatedAt.toLocaleString() : 'Never'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Season Stats */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              📊 Season Stats (CFBD)
            </h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-blue-900 mb-2">2025 Season Stats</h3>
                  <p className="text-blue-800">
                    <span className="font-mono font-bold">{teamSeasonStats2025.toLocaleString()}</span> team records
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-blue-900 mb-2">Status</h3>
                  <p className="text-blue-800">
                    {teamSeasonStats2025 > 0 ? '✅ Data available' : '⏳ Pending ingestion'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Ratings v1 */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              🎯 Ratings v1 (Feature-Based)
            </h2>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <h3 className="font-medium text-green-900 mb-2">2025 Team Ratings</h3>
                  <p className="text-green-800">
                    <span className="font-mono font-bold">{teamSeasonRatings2025.toLocaleString()}</span> teams rated
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-green-900 mb-2">Status</h3>
                  <p className="text-green-800">
                    {teamSeasonRatings2025 > 0 ? '✅ Ratings available' : '⏳ Pending calculation'}
                  </p>
                </div>
              </div>
              {ratingsHealth2025 && (
                <div className="mt-4 pt-4 border-t border-green-300">
                  <h3 className="font-medium text-green-900 mb-3">Health Metrics</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-green-700 font-medium">Power Rating Range</div>
                      <div className="text-green-800">
                        Min: <span className="font-mono">{ratingsHealth2025.minRating}</span><br/>
                        Max: <span className="font-mono">{ratingsHealth2025.maxRating}</span><br/>
                        Median: <span className="font-mono">{ratingsHealth2025.medianRating}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-green-700 font-medium">Confidence</div>
                      <div className="text-green-800">
                        Avg: <span className="font-mono">{ratingsHealth2025.avgConfidence}%</span><br/>
                        Teams with confidence: <span className="font-mono">{ratingsHealth2025.totalWithConfidence}/{teamSeasonRatings2025}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-green-700 font-medium">Data Sources</div>
                      <div className="text-green-800">
                        {Object.entries(ratingsHealth2025.dataSourceBreakdown).map(([source, count]: [string, any]) => (
                          <div key={source}>
                            <span className="font-mono">{count}</span> {source}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-green-700 font-medium">Quick Links</div>
                      <div className="text-green-800 space-y-1">
                        <Link 
                          href="/ratings/peek?season=2025&teamId=georgia"
                          className="underline hover:text-green-900 block"
                        >
                          Peek: Georgia →
                        </Link>
                        <Link 
                          href="/ratings/peek?season=2025&teamId=alabama"
                          className="underline hover:text-green-900 block"
                        >
                          Peek: Alabama →
                        </Link>
                        <Link 
                          href="/ratings/config"
                          className="underline hover:text-green-900 block mt-2"
                        >
                          Configure Weights →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ETL Heartbeat */}
          <ETLHeartbeat 
            fallbackData={{
              recruiting2025,
              teamGameStats2025,
              teamSeasonStats2025,
              teamSeasonRatings2025,
            }}
          />

          {/* Data Sources */}
          <DataSources season={2025} />

          {/* Summary */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              📋 Summary
            </h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 text-sm">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Current Data</h3>
                  <p className="text-gray-700">
                    Latest: {currentSeason} Week {currentWeek}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Games Graded</h3>
                  <p className="text-gray-700">
                    {gamesWithFinalScores.toLocaleString()}/{totalGames.toLocaleString()} ({totalGames > 0 ? ((gamesWithFinalScores / totalGames) * 100).toFixed(1) : '0.0'}%)
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Market Lines</h3>
                  <p className="text-gray-700">
                    {marketLineCounts.reduce((sum, item) => sum + item._count.id, 0).toLocaleString()} total
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Team Stats</h3>
                  <p className="text-gray-700">
                    {totalTeamGameStats.toLocaleString()} stats, {teamGameStatsThisWeek.toLocaleString()} this week
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Talent Data</h3>
                  <p className="text-gray-700">
                    {totalRecruitingRecords.toLocaleString()} talent records
                  </p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Bets Ledger</h3>
                  <p className="text-gray-700">
                    {totalBets.toLocaleString()} bets, {gradedBets.toLocaleString()} graded
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </>
    );
  } catch (error) {
    return (
      <>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Database Status
        </h1>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Database Connection Error
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>Unable to connect to the database. Please check your connection and try again.</p>
                <p className="mt-1 font-mono text-xs">
                  Error: {error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
}
