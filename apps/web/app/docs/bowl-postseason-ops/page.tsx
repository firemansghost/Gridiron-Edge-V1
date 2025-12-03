import Link from 'next/link';

export default function BowlPostseasonOpsPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        Bowl & Postseason Ops Checklist
      </h1>
      
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">When to use this</h2>
          <p className="text-gray-700 mb-4">
            Use this checklist for any week that is:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><strong>Week 16 or later</strong> in the season, OR</li>
            <li>Any week that contains <strong>bowl games or CFP games</strong></li>
          </ul>
          <p className="text-gray-700 mt-4">
            Regular season weeks (1-15) are handled automatically by the "Nightly Ingest + Ratings" workflow. This checklist is for manual one-off bootstrapping of postseason weeks.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Per-week checklist</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Step 1 — Run <strong>Bowl Week Bootstrap</strong> workflow</h3>
              <ol className="list-decimal pl-6 space-y-2 text-gray-700 mb-4">
                <li>Go to <strong>GitHub Actions</strong> → <strong>"Bowl Week Bootstrap"</strong></li>
                <li>Click <strong>"Run workflow"</strong></li>
                <li>Set inputs:
                  <ul className="list-disc pl-6 mt-1">
                    <li><strong>season</strong>: <code className="bg-gray-100 px-1 rounded">2025</code> (or the appropriate season)</li>
                    <li><strong>week</strong>: <code className="bg-gray-100 px-1 rounded">16</code>, <code className="bg-gray-100 px-1 rounded">17</code>, <code className="bg-gray-100 px-1 rounded">18</code>, etc. (depending on what CFBD has available)</li>
                  </ul>
                </li>
                <li>Click <strong>"Run workflow"</strong></li>
              </ol>
              
              <p className="text-gray-700 mb-2"><strong>What the workflow does:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
                <li>✅ Ingest CFBD schedule for that specific week</li>
                <li>✅ Ingest OddsAPI odds for that week (SGO odds as backup if OddsAPI fails)</li>
                <li>✅ Run ratings calculation for the season</li>
                <li>✅ Generate Hybrid V2 bets for that week</li>
                <li>✅ Generate the "Hybrid V2 Card (Flat $100)" official bets for that week</li>
                <li>✅ Run <code className="bg-gray-100 px-1 rounded">check-week-data</code> sanity script to log counts</li>
              </ul>
              
              <p className="text-gray-700 mb-2"><strong>What the workflow does NOT do:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>❌ Does NOT run CFBD drive sync (too slow, can timeout)</li>
                <li>❌ Does NOT run SGO team stats ingestion (Labs-only, separate workflow)</li>
                <li>❌ Does NOT run multi-week backfills</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Step 2 — Sanity check in the app</h3>
              <p className="text-gray-700 mb-2">
                After the workflow completes, verify the data in the UI:
              </p>
              <ol className="list-decimal pl-6 space-y-2 text-gray-700">
                <li><strong>Browse Weeks</strong> (<code className="bg-gray-100 px-1 rounded">/weeks</code>):
                  <ul className="list-disc pl-6 mt-1">
                    <li>Verify the games and odds show for the new week</li>
                    <li>Check that market lines (spreads, totals, moneylines) are populated</li>
                  </ul>
                </li>
                <li><strong>Season Review / Week Review</strong> (<code className="bg-gray-100 px-1 rounded">/season-review</code>, <code className="bg-gray-100 px-1 rounded">/weeks/review</code>):
                  <ul className="list-disc pl-6 mt-1">
                    <li>Verify Hybrid V2 bets exist for that week</li>
                    <li>Verify Official Card bets exist for that week</li>
                    <li>Check that the week appears in the week selector dropdown</li>
                  </ul>
                </li>
                <li><strong>Current Slate</strong> (<code className="bg-gray-100 px-1 rounded">/picks</code> or <code className="bg-gray-100 px-1 rounded">/</code>):
                  <ul className="list-disc pl-6 mt-1">
                    <li>Once the week is the next upcoming week (closest to today), it should automatically show as the current week</li>
                    <li>The header should show the correct week number (e.g., "Week 16 · 2025 Season")</li>
                    <li>Date chips should correspond to the game dates for that week</li>
                  </ul>
                </li>
              </ol>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Step 3 — Notes</h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>SGO usage</strong>: In this workflow, SGO is used only as an <strong>odds backup</strong> (if OddsAPI fails). It is NOT used for team season stats.</li>
                <li><strong>SGO team stats</strong>: All SGO team stats ingestion is Labs-only and handled by a separate workflow (<code className="bg-gray-100 px-1 rounded">sgo-team-stats.yml</code>). You can safely ignore it if the higher-priced SGO plan is disabled.</li>
                <li><strong>Drive stats</strong>: This workflow does NOT sync drive stats. Existing <code className="bg-gray-100 px-1 rounded">drive_stats</code> from previous weeks will be used for ratings calculations.</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">What NOT to do</h2>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>❌ <strong>Don't manually edit weeks in the DB</strong> — Use the Bowl Week Bootstrap workflow instead</li>
            <li>❌ <strong>Don't run full-season drive syncs during bowl season from GitHub</strong> — They can time out (30+ minutes)</li>
            <li>❌ <strong>Don't run multiple workflows simultaneously</strong> — Wait for one to complete before starting another</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Troubleshooting</h2>
          <p className="text-gray-700 mb-2">
            If something looks wrong:
          </p>
          <ol className="list-decimal pl-6 space-y-2 text-gray-700">
            <li><strong>Check the workflow logs</strong>:
              <ul className="list-disc pl-6 mt-1">
                <li>Look at the "Sanity check - Log data counts" step output</li>
                <li>Verify games, market lines, and bets counts are non-zero</li>
              </ul>
            </li>
            <li><strong>Run the check script locally</strong>:
              <pre className="bg-gray-100 p-2 rounded mt-2 text-sm"><code>npx tsx scripts/check-week-data.ts --season 2025 --week 16</code></pre>
            </li>
            <li><strong>Check the API directly</strong>:
              <ul className="list-disc pl-6 mt-1">
                <li><code className="bg-gray-100 px-1 rounded">/api/weeks</code> should return the correct current week once data exists</li>
                <li><code className="bg-gray-100 px-1 rounded">/api/weeks/slate?season=2025&week=16</code> should return games for that week</li>
              </ul>
            </li>
            <li><strong>Verify CFBD has the data</strong>:
              <ul className="list-disc pl-6 mt-1">
                <li>Check CFBD's API or website to confirm the week number exists</li>
                <li>Some bowl weeks may be numbered differently (e.g., "Bowl Week 1" vs "Week 16")</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Related workflows</h2>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><strong>Nightly Ingest + Ratings</strong> (<code className="bg-gray-100 px-1 rounded">nightly-ingest.yml</code>): Continues to run automatically for regular season weeks</li>
            <li><strong>Bowl Week Bootstrap</strong> (<code className="bg-gray-100 px-1 rounded">bowl-week-bootstrap.yml</code>): Manual workflow for postseason weeks (this checklist)</li>
            <li><strong>SGO Team Stats Sync</strong> (<code className="bg-gray-100 px-1 rounded">sgo-team-stats.yml</code>): Separate Labs-only workflow for team stats (not used in this checklist)</li>
          </ul>
        </section>
      </div>
    </>
  );
}


