import Link from 'next/link';

export default function DataInventoryPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        Data Inventory & Feature Map
      </h1>
      
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">What this page is for</h2>
          <p className="text-gray-700 mb-4">
            This page documents:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li><strong>What data</strong> we store for each team and season</li>
            <li><strong>Where it comes from</strong> (data sources and ingestion workflows)</li>
            <li><strong>Which models and pages</strong> use each data block</li>
            <li><strong>How to inspect</strong> team data using the CLI tool</li>
          </ul>
          <p className="text-gray-700">
            Use this as a reference when adding new data sources, understanding what's available for model development, debugging missing or incorrect data, or planning new features.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Game & Market Data</h2>
          <p className="text-gray-700 mb-2"><strong>Sources:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li><strong>CFBD</strong>: Game schedules, results, scores, game times</li>
            <li><strong>OddsAPI</strong>: Primary odds source (spreads, totals, moneylines)</li>
            <li><strong>SGO</strong>: Backup odds source (used when OddsAPI unavailable)</li>
          </ul>
          <p className="text-gray-700 mb-2"><strong>Tables:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li><code className="bg-gray-100 px-1 rounded">games</code>: Game records with teams, dates, scores, locations</li>
            <li><code className="bg-gray-100 px-1 rounded">market_lines</code>: Betting odds from various sources (OddsAPI, SGO)</li>
            <li><code className="bg-gray-100 px-1 rounded">bets</code>: Generated picks from models (Hybrid V2, V4 Labs, etc.)</li>
          </ul>
          <p className="text-gray-700 mb-2"><strong>Used by:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><strong>Current Slate</strong> (<code className="bg-gray-100 px-1 rounded">/picks</code>): Shows upcoming games with model picks and odds</li>
            <li><strong>Week Review</strong> (<code className="bg-gray-100 px-1 rounded">/weeks/review</code>): Historical performance by week</li>
            <li><strong>Season Review</strong> (<code className="bg-gray-100 px-1 rounded">/season-review</code>): Season-long profitability analysis</li>
            <li><strong>Labs</strong> (<code className="bg-gray-100 px-1 rounded">/labs</code>): Experimental overlays (V4, Fade V4)</li>
            <li><strong>Backtests</strong>: Strategy performance analysis</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Core Team-Season Efficiency (CFBD)</h2>
          <p className="text-gray-700 mb-2"><strong>Source:</strong> CFBD Advanced Stats API (aggregated season-level stats)</p>
          <p className="text-gray-700 mb-2"><strong>Table:</strong> <code className="bg-gray-100 px-1 rounded">team_season_stats</code> (numeric columns)</p>
          <p className="text-gray-700 mb-2"><strong>Fields:</strong></p>
          <div className="space-y-2 mb-4">
            <div>
              <p className="text-gray-700 font-medium">Offense:</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
                <li><code className="bg-gray-100 px-1 rounded">ypp_off</code>: Yards per play</li>
                <li><code className="bg-gray-100 px-1 rounded">success_off</code>: Success rate</li>
                <li><code className="bg-gray-100 px-1 rounded">pass_ypa_off</code>: Passing yards per attempt</li>
                <li><code className="bg-gray-100 px-1 rounded">rush_ypc_off</code>: Rushing yards per carry</li>
                <li><code className="bg-gray-100 px-1 rounded">pace_off</code>: Plays per game (tempo)</li>
                <li><code className="bg-gray-100 px-1 rounded">epa_off</code>: Expected points added</li>
              </ul>
            </div>
            <div>
              <p className="text-gray-700 font-medium">Defense:</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
                <li><code className="bg-gray-100 px-1 rounded">ypp_def</code>: Yards per play allowed</li>
                <li><code className="bg-gray-100 px-1 rounded">success_def</code>: Success rate allowed</li>
                <li><code className="bg-gray-100 px-1 rounded">pass_ypa_def</code>: Passing yards per attempt allowed</li>
                <li><code className="bg-gray-100 px-1 rounded">rush_ypc_def</code>: Rushing yards per carry allowed</li>
                <li><code className="bg-gray-100 px-1 rounded">pace_def</code>: Opponent plays per game</li>
                <li><code className="bg-gray-100 px-1 rounded">epa_def</code>: Expected points added (defense, negative is better)</li>
              </ul>
            </div>
          </div>
          <p className="text-gray-700 mb-2"><strong>Used by:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><strong>Hybrid V2</strong>: Core spread model uses these efficiency metrics</li>
            <li><strong>Ratings calculations</strong>: Power ratings and implied lines</li>
            <li><strong>Matchup analysis</strong>: Team strengths/weaknesses comparisons</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Drive-Based Metrics (CFBD Drives → <code className="bg-gray-100 px-1 rounded">raw_json.drive_stats</code>)</h2>
          <p className="text-gray-700 mb-2"><strong>Source:</strong> CFBD Drives API (play-by-play drive data)</p>
          <p className="text-gray-700 mb-2"><strong>Table:</strong> <code className="bg-gray-100 px-1 rounded">team_season_stats.raw_json.drive_stats</code></p>
          <p className="text-gray-700 mb-2"><strong>Fields:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li><strong>Tempo:</strong> Average seconds per drive, quality drives, quality drive rate</li>
            <li><strong>Finishing Drives:</strong> Scoring opportunities, points per opportunity (offense/defense)</li>
            <li><strong>Available Yards:</strong> Average yards available, yards gained, available yards percentage (offense/defense)</li>
          </ul>
          <p className="text-gray-700 mb-2"><strong>Used by:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><strong>V4 Labs</strong>: Drive-based spread model (experimental)</li>
            <li><strong>Future V5</strong>: Potential integration into Hybrid model</li>
            <li><strong>Labs overlays</strong>: Drive efficiency analysis</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Talent, Recruiting & Roster Churn (<code className="bg-gray-100 px-1 rounded">raw_json.roster_churn</code>)</h2>
          <p className="text-gray-700 mb-2"><strong>Source:</strong> CFBD Returning Production + Transfer Portal APIs</p>
          <p className="text-gray-700 mb-2"><strong>Table:</strong> <code className="bg-gray-100 px-1 rounded">team_season_stats.raw_json.roster_churn</code></p>
          <p className="text-gray-700 mb-2"><strong>Fields:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li><strong>Returning Production:</strong> Percentage of production returning by position group (offense/defense, QB, RB, WR, OL, DL, LB, DB, etc.)</li>
            <li><strong>Transfer Portal:</strong> Transfers in, transfers out, net transfers</li>
          </ul>
          <p className="text-gray-700 mb-2"><strong>Used by:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><strong>Portal & NIL Indices</strong> (V5 - Planned): Will feed Continuity Score, Positional Shock, Mercenary Index, Portal Aggressor</li>
            <li><strong>Future Labs overlays</strong>: Roster stability analysis</li>
            <li><strong>Preseason adjustments</strong>: Power rating adjustments based on roster turnover</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Labs / Experimental Blocks (<code className="bg-gray-100 px-1 rounded">raw_json.sgo_stats</code>)</h2>
          <p className="text-gray-700 mb-2"><strong>Source:</strong> SportsGameOdds API (curated stats)</p>
          <p className="text-gray-700 mb-2"><strong>Table:</strong> <code className="bg-gray-100 px-1 rounded">team_season_stats.raw_json.sgo_stats</code></p>
          <p className="text-gray-700 mb-2"><strong>Fields:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li><strong>Red Zone:</strong> Trips, touchdowns, touchdown rate</li>
            <li><strong>Penalties:</strong> Count, yards, first downs, per-game rates</li>
            <li><strong>Pressure/Havoc:</strong> Sacks, TFLs, QB hits, INTs, fumbles (offense/defense)</li>
            <li><strong>Special Teams:</strong> Punting, returns, field goals</li>
            <li><strong>Game Script:</strong> Largest lead, seconds in lead, lead changes, scoring runs, ties</li>
          </ul>
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
            <p className="text-gray-700 font-medium mb-2">⚠️ <strong>Labs-only, optional</strong></p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
              <li>Not used in production models (Hybrid V2, ratings)</li>
              <li>Used for future V5 model development</li>
              <li>Safe to ignore if SGO plan is disabled</li>
              <li>May be deprecated if not proven useful</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Portal & NIL Meta Indices (V5 – Planned)</h2>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
            <p className="text-gray-700 font-medium mb-2">🚧 <strong>Not yet implemented</strong> (stubs exist in <code className="bg-gray-100 px-1 rounded">apps/jobs/src/talent/portal_indices.ts</code>)</p>
            <p className="text-gray-700 text-sm">
              These four indices will be computed from <code className="bg-gray-100 px-1 rounded">raw_json.roster_churn</code> data and used as Labs overlays first, then potentially integrated into V5 Hybrid model.
            </p>
          </div>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">1. Continuity Score</h3>
              <p className="text-gray-700 mb-1"><strong>Data Source:</strong> CFBD returning production + transfer portal net counts</p>
              <p className="text-gray-700"><strong>Intended Use:</strong> Labs overlay to identify teams with high/low roster stability; if stable, may adjust Hybrid V2 confidence or power rating adjustments in V5.</p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">2. Positional Shock Index</h3>
              <p className="text-gray-700 mb-1"><strong>Data Source:</strong> Position-group breakdowns from <code className="bg-gray-100 px-1 rounded">roster_churn.returningProduction</code></p>
              <p className="text-gray-700"><strong>Intended Use:</strong> Labs overlay to flag teams with extreme turnover at key positions (QB, OL, DL); may inform matchup-specific adjustments in V5.</p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">3. Mercenary Index</h3>
              <p className="text-gray-700 mb-1"><strong>Data Source:</strong> 1-year transfers and short-eligibility players from transfer portal data</p>
              <p className="text-gray-700"><strong>Intended Use:</strong> Labs overlay to identify teams heavily reliant on transfers; may adjust for chemistry/cohesion factors in V5.</p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">4. Portal Aggressor Flag</h3>
              <p className="text-gray-700 mb-1"><strong>Data Source:</strong> Net talent gain from transfers (<code className="bg-gray-100 px-1 rounded">transferPortal.netCount</code> + talent ratings if available)</p>
              <p className="text-gray-700"><strong>Intended Use:</strong> Labs overlay to flag teams that aggressively use the portal; may inform power rating adjustments in V5 if portal-heavy teams show consistent patterns.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Team Data Inspector (CLI)</h2>
          <p className="text-gray-700 mb-2"><strong>Script:</strong> <code className="bg-gray-100 px-1 rounded">scripts/inspect-team-data.ts</code></p>
          <p className="text-gray-700 mb-2"><strong>Usage:</strong></p>
          <pre className="bg-gray-100 p-2 rounded text-sm mb-4"><code>npx tsx scripts/inspect-team-data.ts --season 2025 --team lsu
npx tsx scripts/inspect-team-data.ts --season 2024 --team "Ohio State"</code></pre>
          <p className="text-gray-700 mb-2"><strong>What it prints:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
            <li>Header: Season, team name, slug, teamId</li>
            <li>Core efficiency: All numeric columns from <code className="bg-gray-100 px-1 rounded">team_season_stats</code></li>
            <li>Drive stats: Contents of <code className="bg-gray-100 px-1 rounded">raw_json.drive_stats</code> (if present)</li>
            <li>Roster churn: Contents of <code className="bg-gray-100 px-1 rounded">raw_json.roster_churn</code> (if present)</li>
            <li>SGO stats: Contents of <code className="bg-gray-100 px-1 rounded">raw_json.sgo_stats</code> (if present)</li>
            <li>Portal indices: Contents of <code className="bg-gray-100 px-1 rounded">raw_json.portal_meta</code> (if present, future)</li>
          </ul>
          <p className="text-gray-700 mb-2"><strong>Why it's useful:</strong></p>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li>Quick verification that data exists for a team/season</li>
            <li>Debug missing or incorrect data</li>
            <li>Understand what's available before writing model code</li>
            <li>Compare data across teams/seasons</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Adding New Data Blocks</h2>
          <p className="text-gray-700 mb-2">
            When adding new data to <code className="bg-gray-100 px-1 rounded">team_season_stats.raw_json</code>:
          </p>
          <ol className="list-decimal pl-6 space-y-1 text-gray-700">
            <li><strong>Document it here</strong> in the appropriate section</li>
            <li><strong>Update <Link href="/docs/workflows-guide" className="text-blue-600 hover:text-blue-700 underline">workflows-guide.md</Link></strong> with ingestion workflow details</li>
            <li><strong>Update <code className="bg-gray-100 px-1 rounded">inspect-team-data.ts</code></strong> to display the new block</li>
            <li><strong>Add a stub or implementation</strong> in the relevant module (e.g., <code className="bg-gray-100 px-1 rounded">portal_indices.ts</code> for portal/NIL data)</li>
          </ol>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Related Documentation</h2>
          <ul className="list-disc pl-6 space-y-1 text-gray-700">
            <li><Link href="/docs/workflows-guide" className="text-blue-600 hover:text-blue-700 underline">Workflows Guide</Link>: How data is ingested</li>
            <li><Link href="/docs/bowl-postseason-ops" className="text-blue-600 hover:text-blue-700 underline">Bowl & Postseason Ops</Link>: Manual ingestion for postseason weeks</li>
            <li><Link href="/docs/2026-betting-playbook" className="text-blue-600 hover:text-blue-700 underline">2026 Betting Playbook</Link>: How models use this data</li>
          </ul>
        </section>
      </div>
    </>
  );
}


