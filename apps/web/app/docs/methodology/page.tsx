import Link from 'next/link';

export default function MethodologyPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Methodology
      </h1>
      
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Overview
          </h2>
          <p className="text-gray-700 mb-4">
            Gridiron Edge provides transparent, data-driven college football analytics. Our system processes 
            real-time market data, historical performance, and environmental factors to generate power ratings 
            and identify potential betting edges.
          </p>
          <p className="text-gray-700 mb-4">
            <strong>Important:</strong> This platform provides analytical insights, not betting recommendations. 
            Users should expect transparent assessment tools, not picks or guarantees.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Inputs & Sources
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Team Performance Metrics
              </h3>
              <p className="text-gray-700 mb-2">
                Core statistical features derived from game-by-game team performance:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>YPP (Yards Per Play):</strong> Total yards divided by total plays (offense/defense)</li>
                <li><strong>Success Rate:</strong> Percentage of successful plays (when available from CFBD)</li>
                <li><strong>EPA (Expected Points Added):</strong> Advanced efficiency metric (when available)</li>
                <li><strong>Pace:</strong> Plays per game proxy for tempo analysis</li>
                <li><strong>Pass/Rush Efficiency:</strong> Yards per attempt/carry for offensive and defensive units</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Team Talent Composite
              </h3>
              <p className="text-gray-700 mb-2">
                Talent assessment based on recruiting data and team composition:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Team Talent Index:</strong> CFBD composite score (0-100 scale)</li>
                <li><strong>Recruiting Class Rankings:</strong> National and conference rankings</li>
                <li><strong>Star Ratings:</strong> Counts of 5-star, 4-star, and 3-star recruits</li>
                <li><strong>Commit Points:</strong> Recruiting class point totals</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Data Sources
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                College Football Data (CFBD)
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>Game schedules, venues, and final scores</li>
                <li>Team classifications (FBS filtering applied)</li>
                <li>Conference and division information</li>
                <li>Historical game data and statistics</li>
                <li>Team game-by-game performance statistics</li>
                <li>Team talent composite and recruiting data</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                The Odds API
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>Live and historical spreads, totals, and moneylines</li>
                <li>Multiple sportsbooks (DraftKings, FanDuel, Caesars, etc.)</li>
                <li>Opening and closing line tracking</li>
                <li>Real-time odds updates</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Visual Crossing Weather
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>Game-time weather conditions</li>
                <li>Temperature, wind, and precipitation data</li>
                <li>Historical weather patterns</li>
              </ul>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-800 mb-2">Data Constraints</h4>
              <ul className="list-disc pl-6 space-y-1 text-yellow-700 text-sm">
                <li>Coverage varies by book and game importance</li>
                <li>Historical data access limited by API tiers</li>
                <li>Real-time updates depend on source availability</li>
                <li>Weather data subject to forecast accuracy</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Data Flow (ETL)
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Automated Workflows
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Nightly Ingest:</strong> Full data refresh with ratings recalculation</li>
                <li><strong>3x Daily Poll:</strong> Live odds updates during active weeks</li>
                <li><strong>One-Week Test:</strong> Manual testing and validation workflows</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Processing Pipeline
              </h3>
              <ol className="list-decimal pl-6 space-y-1 text-gray-700">
                <li>CFBD schedules and team data ingestion</li>
                <li>Odds API market line collection (spreads, totals, moneylines)</li>
                <li>Weather data integration for game conditions</li>
                <li>Chunked database upserts with deduplication</li>
                <li>Power rating calculations and implied line generation</li>
              </ol>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2">Performance Optimizations</h4>
              <ul className="list-disc pl-6 space-y-1 text-blue-700 text-sm">
                <li>Single-week polling to prevent timeouts</li>
                <li>Chunked upserts (500 records per batch)</li>
                <li>In-memory deduplication before database writes</li>
                <li>FBS-only filtering to reduce data volume</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Market Lines & Selection
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Data Storage
              </h3>
              <p className="text-gray-700 mb-4">
                We store individual rows per game/book/line type combination. This allows us to track 
                line movement, compare book offerings, and identify consensus vs. outlier positions.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Selection Logic
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Source Priority:</strong> SGO → Odds API → Other sources</li>
                <li><strong>Timestamp Preference:</strong> Latest available data</li>
                <li><strong>Value Selection:</strong> closing_line preferred, fallback to line_value</li>
                <li><strong>Deduplication:</strong> Remove duplicate entries by game/book/type/timestamp</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Moneyline Handling
              </h3>
              <p className="text-gray-700 mb-4">
                Moneylines are stored as American odds (e.g., -175, +150). We calculate implied 
                probabilities using standard formulas:
              </p>
              <div className="bg-gray-100 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Implied Probability Formulas:</h4>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li><strong>Negative odds:</strong> |odds| / (|odds| + 100)</li>
                  <li><strong>Positive odds:</strong> 100 / (odds + 100)</li>
                </ul>
                <p className="text-xs text-gray-600 mt-2">
                  Example: -175 → 175/(175+100) = 63.6% implied probability
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Modeling (Seed v0)
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Power Ratings
              </h3>
              <p className="text-gray-700 mb-4">
                Our current model generates team power ratings based on historical performance, 
                recent form, and strength of schedule. Ratings are updated after each game 
                and used to calculate implied spreads.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Implied Lines
              </h3>
              <p className="text-gray-700 mb-4">
                We calculate implied spreads and totals by comparing our power ratings to 
                market consensus. This helps identify potential edges where our model 
                disagrees with market pricing.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Confidence Tiers
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Tier A:</strong> High confidence (edge ≥ 3 points)</li>
                <li><strong>Tier B:</strong> Medium confidence (edge 1-3 points)</li>
                <li><strong>Tier C:</strong> Low confidence (edge &lt; 1 point)</li>
              </ul>
            </div>
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-800 mb-2">Future Enhancements</h4>
              <ul className="list-disc pl-6 space-y-1 text-green-700 text-sm">
                <li>Injury report integration and adjustments</li>
                <li>Weather impact modeling</li>
                <li>Home field advantage quantification</li>
                <li>Conference strength adjustments</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Risk Notes / Limitations
          </h2>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-medium text-red-800 mb-2">Data Variability</h3>
              <ul className="list-disc pl-6 space-y-1 text-red-700 text-sm">
                <li>Odds change frequently and may not reflect current market conditions</li>
                <li>Weather forecasts update and may differ from game-time conditions</li>
                <li>Data latency varies by source and can impact real-time accuracy</li>
                <li>Coverage gaps may exist for smaller games or less popular books</li>
              </ul>
            </div>
            
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h3 className="font-medium text-orange-800 mb-2">Model Limitations</h3>
              <ul className="list-disc pl-6 space-y-1 text-orange-700 text-sm">
                <li>Power ratings are based on historical data and may not capture recent changes</li>
                <li>Implied lines assume our model is more accurate than market consensus</li>
                <li>Confidence tiers are estimates and not guarantees of success</li>
                <li>Past performance does not guarantee future results</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Reproducibility
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Post-Run Verification
              </h3>
              <p className="text-gray-700 mb-4">
                We provide SQL queries and data export tools to verify our calculations 
                and ensure transparency. See our <Link href="/docs/runbook" className="text-blue-600 hover:text-blue-800 underline">runbook documentation</Link> for 
                detailed post-run expectations and verification steps.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Data Exports
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>CSV Export:</strong> <code className="bg-gray-100 px-1 rounded">/api/weeks/csv</code> for spreadsheet analysis</li>
                <li><strong>API Endpoints:</strong> JSON data access for custom analysis</li>
                <li><strong>Database Queries:</strong> Direct SQL access for advanced users</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Change Log
          </h2>
          <div className="space-y-2">
            <div className="flex items-start space-x-3">
              <span className="text-sm text-gray-500 font-mono">2025-01-08</span>
              <div>
                <p className="text-gray-700">Switched to single-week polling to prevent workflow timeouts</p>
                <p className="text-sm text-gray-500">Implemented chunked upserts and deduplication for better performance</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-sm text-gray-500 font-mono">2025-01-08</span>
              <div>
                <p className="text-gray-700">Added moneyline support across API and UI</p>
                <p className="text-sm text-gray-500">Integrated Odds API as primary source with SGO fallback</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <span className="text-sm text-gray-500 font-mono">2025-01-08</span>
              <div>
                <p className="text-gray-700">Implemented FBS-only filtering to reduce data volume</p>
                <p className="text-sm text-gray-500">Added CI safety guards and performance optimizations</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
