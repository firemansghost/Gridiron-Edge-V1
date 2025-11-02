/**
 * Week 10 Odds Ingestion Verification Guide
 * 
 * Documentation page for verifying the week calculation fix
 */

'use client';

import Link from 'next/link';
import { HeaderNav } from '@/components/HeaderNav';
import { Footer } from '@/components/Footer';

export default function Week10IngestionPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <HeaderNav />
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-8">
            <Link 
              href="/docs" 
              className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block"
            >
              ← Back to Docs
            </Link>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Week 10 Odds Ingestion - Fix Summary & Verification Guide
            </h1>
            <p className="text-lg text-gray-600">
              Guide for verifying the week calculation fix and monitoring odds ingestion
            </p>
          </div>

          {/* Content */}
          <div className="prose prose-lg max-w-none bg-white rounded-lg shadow-sm p-8">
            {/* Bug Fixed Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">🐛 Bug Fixed</h2>
              
              <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                <h3 className="font-semibold text-red-900 mb-2">Problem Identified</h3>
                <p className="text-red-800">
                  The workflow requested Week 10 odds but fetched <strong>Week 11 games</strong> instead. All 30 matched games were Week 11.
                </p>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <h3 className="font-semibold text-yellow-900 mb-2">Root Cause</h3>
                <p className="text-yellow-800 mb-2">
                  The <code className="bg-yellow-100 px-1 rounded">getCurrentCFBWeek()</code> method in <code className="bg-yellow-100 px-1 rounded">OddsApiAdapter.ts</code> was <strong>hardcoded to return week 8</strong>.
                </p>
                <p className="text-yellow-800">
                  This caused Week 10 requests to use the <strong>live endpoint</strong> instead of historical, returning all upcoming games (Week 11).
                </p>
              </div>

              <div className="bg-green-50 border-l-4 border-green-400 p-4">
                <h3 className="font-semibold text-green-900 mb-2">Fix Applied</h3>
                <p className="text-green-800">
                  Changed <code className="bg-green-100 px-1 rounded">getCurrentCFBWeek()</code> to query the database and find the actual current week based on game dates closest to now. This ensures past weeks correctly use historical endpoint and current week uses live endpoint.
                </p>
                <p className="text-green-700 text-sm mt-2">
                  <strong>Commit:</strong> <code>d215247</code>
                </p>
              </div>
            </section>

            {/* Expected Behavior Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">✅ What Should Happen Now</h2>
              
              <div className="space-y-4">
                <div className="border-l-4 border-blue-400 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">1. Week Detection</h3>
                  <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`[DEBUG] Historical check: season=2025, currentYear=2025, week=10, currentWeek=11, isHistorical=true`}
                  </pre>
                  <p className="text-sm text-gray-600 mt-2">
                    Should show <code className="bg-gray-100 px-1 rounded">currentWeek=11</code> (from database query) and <code className="bg-gray-100 px-1 rounded">isHistorical=true</code>
                  </p>
                </div>

                <div className="border-l-4 border-blue-400 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">2. Endpoint Selection</h3>
                  <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
{`[ODDSAPI] Using historical data endpoint for 2025 week 10`}
                  </pre>
                  <p className="text-sm text-gray-600 mt-2">
                    Should use <strong>historical endpoint</strong>, not live endpoint
                  </p>
                </div>

                <div className="border-l-4 border-blue-400 pl-4">
                  <h3 className="font-semibold text-gray-900 mb-2">3. Games Matched</h3>
                  <p className="text-sm text-gray-700">
                    Should match Week 10 games (not Week 11) and include the previously missing 8 FBS games:
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-600 mt-2 space-y-1">
                    <li>UTEP @ Kennesaw State</li>
                    <li>Marshall @ Coastal Carolina</li>
                    <li>Army @ Air Force</li>
                    <li>East Carolina @ Temple</li>
                    <li>New Mexico State @ Western Kentucky</li>
                    <li>Indiana @ Maryland</li>
                    <li>Wake Forest @ Florida State</li>
                    <li>Washington State @ Oregon State</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Success Indicators Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">📋 What to Look For in Logs</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-green-900 mb-2">✅ Success Indicators</h3>
                  <div className="bg-green-50 border border-green-200 rounded p-4 space-y-3">
                    <div>
                      <p className="font-medium text-green-900 mb-1">Correct Week Detection</p>
                      <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
{`[DEBUG] Historical check: ... currentWeek=11, isHistorical=true`}
                      </pre>
                    </div>
                    <div>
                      <p className="font-medium text-green-900 mb-1">Historical Endpoint Used</p>
                      <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
{`[ODDSAPI] Using historical data endpoint for 2025 week 10`}
                      </pre>
                    </div>
                    <div>
                      <p className="font-medium text-green-900 mb-1">Week 10 Games Matched</p>
                      <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
{`[DEBUG] Found game: 2025-wk10-delaware-liberty for ...`}
                      </pre>
                      <p className="text-xs text-green-700 mt-1">Game IDs should start with <code>2025-wk10-</code> (not <code>2025-wk11-</code>)</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-red-900 mb-2">⚠️ Potential Issues</h3>
                  <div className="bg-red-50 border border-red-200 rounded p-4 space-y-3">
                    <div>
                      <p className="font-medium text-red-900 mb-1">Still Using Live Endpoint ❌</p>
                      <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
{`[ODDSAPI] Using live odds endpoint for 2025 week 10`}
                      </pre>
                      <p className="text-xs text-red-700 mt-1">If you see this, the week calculation might still be wrong</p>
                    </div>
                    <div>
                      <p className="font-medium text-red-900 mb-1">Wrong Week Games ❌</p>
                      <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
{`[DEBUG] Found game: 2025-wk11-...`}
                      </pre>
                      <p className="text-xs text-red-700 mt-1">If game IDs are still Week 11, historical endpoint isn't working correctly</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Verification Steps Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">🔍 Verification Steps</h2>
              
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                <h3 className="font-semibold text-blue-900 mb-2">After Workflow Completes</h3>
                <p className="text-blue-800 text-sm mb-3">
                  Run these SQL queries to verify the fix worked:
                </p>
                
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-blue-900 mb-1">1. Check Database Count</p>
                    <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
{`SELECT COUNT(DISTINCT g.id) as games_with_odds
FROM games g
WHERE g.season = 2025 AND g.week = 10
  AND EXISTS (SELECT 1 FROM market_lines ml WHERE ml.game_id = g.id);`}
                    </pre>
                    <p className="text-xs text-blue-700 mt-1">Should be <strong>40-50 games</strong> (up from 39)</p>
                  </div>

                  <div>
                    <p className="font-medium text-blue-900 mb-1">2. Verify Fixed Games</p>
                    <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
{`SELECT g.id, COUNT(DISTINCT ml.id) as market_line_count
FROM games g
LEFT JOIN market_lines ml ON ml.game_id = g.id
WHERE g.id IN (
  '2025-wk10-delaware-liberty',
  '2025-wk10-florida-international-missouri-state',
  '2025-wk10-new-mexico-unlv'
)
GROUP BY g.id;`}
                    </pre>
                    <p className="text-xs text-blue-700 mt-1">All 3 should show <code>market_line_count &gt; 0</code></p>
                  </div>
                </div>
              </div>
            </section>

            {/* Expected Results Section */}
            <section className="mb-12">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">📊 Expected Results</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-red-50 border border-red-200 rounded p-4">
                  <h3 className="font-semibold text-red-900 mb-2">Before Fix</h3>
                  <ul className="text-sm text-red-800 space-y-1">
                    <li>❌ Week 10 request → Fetched Week 11 games</li>
                    <li>❌ 30 games matched (wrong week)</li>
                    <li>❌ 11 FBS games missing odds</li>
                    <li>❌ Used live endpoint for past week</li>
                  </ul>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded p-4">
                  <h3 className="font-semibold text-green-900 mb-2">After Fix</h3>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>✅ Week 10 request → Fetches Week 10 games</li>
                    <li>✅ 40-50 games matched (correct week)</li>
                    <li>✅ 0-3 FBS games missing odds (down from 11)</li>
                    <li>✅ Uses historical endpoint for past week</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Next Steps Section */}
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">🚀 Next Steps</h2>
              
              <ol className="list-decimal list-inside space-y-2 text-gray-700">
                <li><strong>Re-run Workflow:</strong> Execute "Nightly Ingest + Ratings" for Week 10</li>
                <li><strong>Monitor Logs:</strong> Watch for the success indicators listed above</li>
                <li><strong>Verify Database:</strong> Run the SQL checks to confirm games have odds</li>
                <li><strong>If Issues Persist:</strong> Review team matching logs for remaining missing games</li>
              </ol>
            </section>

            {/* Footer Note */}
            <div className="bg-gray-100 rounded p-4 text-sm text-gray-600">
              <p className="mb-2">
                <strong>Note:</strong> This document is also available as a markdown file in the repository:
              </p>
              <a 
                href="https://github.com/firemansghost/Gridiron-Edge-V1/blob/main/docs/week10-odds-ingestion-summary.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                View on GitHub →
              </a>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

