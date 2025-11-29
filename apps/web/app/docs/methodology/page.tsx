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
            Production Models
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Hybrid Spread Model (Production ATS Engine)
              </h3>
              <p className="text-gray-700 mb-4">
                Our production ATS (Against The Spread) model is a <strong>Hybrid</strong> that blends 
                V1 power ratings with V2 unit matchup analysis. All spread edges, confidence tiers, and 
                official ATS picks on "Current Slate", "My Picks", and "Matchup" pages come from this Hybrid model.
              </p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-800 mb-3">Hybrid Formula</h4>
                <p className="text-blue-700 text-sm mb-2">
                  <strong>Hybrid Spread = (V1 Spread × 70%) + (V2 Spread × 30%)</strong>
                </p>
                <p className="text-blue-700 text-sm">
                  This blend leverages the stability of V1 (results-aware) with the matchup specificity 
                  of V2 (stats-only). The weights were optimized through backtesting against 2025 season 
                  results, achieving superior performance compared to pure V1 or V2 alone.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">
                    V1 Component: Power Ratings (70% weight)
                  </h4>
                  <p className="text-gray-700 mb-3">
                    V1 generates team power ratings using a balanced four-pillar approach. 
                    Each component is normalized to Z-scores and weighted equally (25% each) to create 
                    a composite rating that captures multiple dimensions of team strength:
                  </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-800 mb-3">The Four Pillars</h4>
                <ul className="space-y-2 text-blue-700">
                  <li>
                    <strong>25% Talent:</strong> 247Sports Composite talent rating. Measures roster 
                    potential and recruiting quality. Provides a stable baseline that reflects 
                    program strength independent of current season performance.
                  </li>
                  <li>
                    <strong>25% Efficiency:</strong> EPA (Expected Points Added) per play and Success Rate. 
                    Captures down-to-down dominance and play-level effectiveness. EPA measures the 
                    value created on each play, while Success Rate tracks consistency.
                  </li>
                  <li>
                    <strong>25% Scoring:</strong> Net Points per Game (Points For minus Points Against). 
                    Reflects margin of victory and overall team strength. Teams that consistently 
                    outscore opponents demonstrate superior ability to finish drives and prevent scores.
                  </li>
                  <li>
                    <strong>25% Results:</strong> Win Percentage. The ultimate measure of team success. 
                    Accounts for game management, clutch performance, and the ability to win close games.
                  </li>
                </ul>
                <p className="text-sm text-blue-600 mt-3">
                  <strong>Normalization:</strong> Each metric is converted to Z-scores (standard deviations 
                  from the mean) across all FBS teams, ensuring equal weight regardless of scale. The 
                  composite is then scaled by a factor of 14.0 to convert to "points above average" 
                  (where +14 represents approximately one standard deviation above average).
                </p>
              </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Calibration & Backtesting
                  </h3>
                  <p className="text-gray-700 mb-4">
                    The 25/25/25/25 weight distribution is not arbitrary—it was determined through rigorous 
                    backtesting against historical game results. Our calibration engine simulates thousands 
                    of past games using different weight combinations to identify the configuration that 
                    minimizes prediction error.
                  </p>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-green-800 mb-2">Optimization Process</h4>
                    <p className="text-green-700 text-sm mb-2">
                      We test various weight combinations (e.g., 50% Efficiency/50% Talent, 40% Scoring/30% 
                      Efficiency/30% Results, etc.) against actual game outcomes from the 2025 season. For 
                      each configuration, we calculate the Mean Absolute Error (MAE) between predicted spreads 
                      and actual score margins.
                    </p>
                    <p className="text-green-700 text-sm mb-2">
                      <strong>Result:</strong> The balanced 25/25/25/25 approach achieved the lowest MAE 
                      (approximately 10.8 points) for the 2025 season, outperforming alternative strategies 
                      such as "Efficiency-Only" (higher error) and "Talent-Only" (higher error) models.
                    </p>
                    <p className="text-green-700 text-sm">
                      <strong>Continuous Improvement:</strong> We re-calibrate these weights periodically 
                      (typically at the start of each season or after significant rule changes) to ensure 
                      the model adapts to the current season's meta. This ensures our predictions remain 
                      accurate as the game evolves.
                    </p>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">
                  V2 Component: Unit Matchup Analysis (30% weight)
                </h4>
                <p className="text-gray-700 mb-3">
                  V2 analyzes specific unit matchups to identify tactical advantages. It breaks down 
                  team performance into granular unit grades (Run Offense, Pass Defense, Explosiveness) 
                  and compares them head-to-head to find hidden edges.
                </p>
                <p className="text-gray-700 mb-3">
                  Unit grades are calculated by aggregating game-level stats to season averages, 
                  normalizing to Z-scores, and blending related metrics (40% Run, 40% Pass, 20% Explosiveness).
                </p>
              </div>

              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">
                  Spread Calculation
                </h4>
                <p className="text-gray-700 mb-3">
                  The Hybrid spread is calculated as:
                </p>
                <div className="bg-gray-100 p-4 rounded-lg mb-3">
                  <p className="text-sm text-gray-700 font-mono mb-2">
                    V1 Spread = (Home Rating - Away Rating) + HFA
                  </p>
                  <p className="text-sm text-gray-700 font-mono mb-2">
                    V2 Spread = Unit Matchup Analysis (scaled by 9.0)
                  </p>
                  <p className="text-sm text-gray-700 font-mono">
                    Hybrid Spread = (V1 × 0.7) + (V2 × 0.3)
                  </p>
                  <p className="text-xs text-gray-600 mt-2">
                    Where HFA (Home Field Advantage) = 2.0 points for home games, 0.0 for neutral sites.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                V3 Drive-Based Totals Model (Production Totals Engine)
              </h3>
              <p className="text-gray-700 mb-4">
                Our production totals model uses drive-level data to predict game totals. The core insight: 
                drives that gain 40+ yards ("Quality Drives") typically yield ~5 points. By projecting the 
                number of quality drives each team will have, we can estimate total scoring.
              </p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-green-800 mb-3">V3 Totals Formula</h4>
                <ol className="list-decimal pl-6 space-y-2 text-green-700 text-sm">
                  <li><strong>Quality Drive Rate:</strong> (Drives ≥ 40 yards) / (Total Drives) per team</li>
                  <li><strong>Tempo:</strong> Average drives per game for each team</li>
                  <li><strong>Expected Drives:</strong> Average of home and away team tempo</li>
                  <li><strong>Projected Points:</strong> (Expected Drives × Quality Drive Rate) × 5.0</li>
                  <li><strong>Model Total:</strong> Home Projected Points + Away Projected Points</li>
                </ol>
                <p className="text-green-700 text-sm mt-3">
                  <strong>Data Source:</strong> Drive-level data from CFBD API, stored as <code>drive_stats</code> 
                  on <code>TeamSeasonStats</code>. The model is wired into Game API (Matchup page), Week Slate API 
                  (Current Slate), and My Picks via official Bet records.
                </p>
              </div>

              <p className="text-gray-700 mb-4">
                <strong>Bet Record as Source of Truth:</strong> When a V3 totals bet exists for a game, 
                the Bet record stores the line taken, model price, closing price, edge magnitude, and Tier 
                (A/B/C). This ensures consistency across all UI elements—the same edge and grade are displayed 
                everywhere, derived from the stored bet rather than re-computed from current market lines.
              </p>

              <p className="text-gray-700 mb-4">
                <strong>Fallback:</strong> If V3 drive data is unavailable, the system falls back to Core V1 
                totals, which use spread-driven overlays based on market totals.
              </p>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Confidence Tiers (A/B/C)
              </h3>
              <p className="text-gray-700 mb-4">
                All bets (spreads and totals) are assigned confidence tiers based on the magnitude of the edge. 
                This logic is centralized in shared helpers and used consistently across Week Review, Season Review, 
                and My Picks:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Tier A:</strong> |edge| ≥ 4.0 points — High confidence, primary "Best Bets"</li>
                <li><strong>Tier B:</strong> 3.0 ≤ |edge| &lt; 4.0 points — Medium confidence</li>
                <li><strong>Tier C:</strong> |edge| &lt; 3.0 points — Lower confidence, experimental</li>
              </ul>
              <p className="text-gray-700 mt-4">
                <strong>Operational Rules:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Spreads (ATS):</strong> Hybrid model, primarily Tier A, optionally Tier B</li>
                <li><strong>Totals:</strong> V3 Totals, Tier A only is the main "serious" system</li>
                <li><strong>Tier B/C Totals:</strong> Experimental/action, visually de-emphasized with "High Risk" warnings</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            User Interface & Features
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                My Picks Page
              </h3>
              <p className="text-gray-700 mb-4">
                The My Picks page is organized into two main sections that prioritize Tier A picks:
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-800 mb-2">🔥 Best Bets (Tier A)</h4>
                <ul className="list-disc pl-6 space-y-1 text-blue-700 text-sm">
                  <li>Located at the top of the page with green styling and Tier A badges</li>
                  <li>Shows games that have at least one Tier A pick (spread or total)</li>
                  <li>Includes Hybrid Tier A spreads and V3 Totals Tier A picks</li>
                  <li>These are the primary recommendations based on our strongest edges</li>
                </ul>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-yellow-800 mb-2">👀 Leans / Action (Tier B & C)</h4>
                <ul className="list-disc pl-6 space-y-1 text-yellow-700 text-sm">
                  <li>Located below Best Bets with muted styling</li>
                  <li>Shows games that only have Tier B/C picks or where users want more action</li>
                  <li>V3 Totals Tier B/C picks are shown with an explicit "Experimental / High Risk" warning</li>
                  <li>These are for users seeking additional betting opportunities beyond Tier A</li>
                </ul>
              </div>
              <p className="text-gray-700">
                <strong>Sorting:</strong> Games with any Tier A pick appear first (in Best Bets). Within each 
                section, games are sorted by earliest kickoff or highest absolute edge.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Current Slate Table
              </h3>
              <p className="text-gray-700 mb-3">
                The Current Slate table displays key information for each game:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Best Spread / Best Total:</strong> Line and book pulled from market data (best available number at that moment, usually from DraftKings/others)</li>
                <li><strong>Model Spread:</strong> From Hybrid model (70% V1 + 30% V2)</li>
                <li><strong>Model Total:</strong> From V3 Drive-Based Totals model (or Core V1 fallback)</li>
                <li><strong>Pick (ATS / Total):</strong> Derived from model vs best line; tied back to official Bet when one exists</li>
                <li><strong>Max Edge:</strong> Largest edge among all bet types for that game</li>
                <li><strong>Confidence:</strong> Highest tier (A/B/C) among all picks for that game</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Week Review & Season Review
              </h3>
              <p className="text-gray-700 mb-3">
                Both Week Review and Season Review support filtering by Confidence Tier:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Confidence Filter:</strong> Users can filter by Tier (All / A / B / C)</li>
                <li><strong>Summary Metrics:</strong> All metrics (PnL, ROI, record, cumulative PnL, per-week breakdowns) respect the selected Tier</li>
                <li><strong>Performance Insights:</strong> 
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>Hybrid Tier A spreads: Extremely strong performance (~66% win rate, 25%+ ROI over large sample)</li>
                    <li>V3 Totals Tier A: Profitable (~57% win rate, +9% ROI)</li>
                    <li>V3 Totals Tier B/C: Negative ROI (-14% to -20%) — hence operational rule to focus on Tier A only</li>
                  </ul>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Unit Matchup Analysis (V2 Component)
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Overview
              </h3>
              <p className="text-gray-700 mb-4">
                The V2 component of the Hybrid model analyzes specific unit matchups to identify 
                tactical advantages. It breaks down team performance into granular unit grades 
                (Run Offense, Pass Defense, Explosiveness) and compares them head-to-head to find hidden edges.
              </p>
              <p className="text-gray-700 mb-4">
                These unit grades are displayed on the Game Detail page in the "Unit Matchup" card, showing 
                how each team's offensive and defensive units stack up against their opponent.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Unit Grade Calculation
              </h3>
              <p className="text-gray-700 mb-4">
                Each unit grade is calculated by:
              </p>
              <ol className="list-decimal pl-6 space-y-2 text-gray-700">
                <li><strong>Aggregating game-level stats</strong> to season averages (PPA, Line Yards, Success Rate, IsoPPP)</li>
                <li><strong>Normalizing to Z-scores</strong> across all FBS teams (standard deviations from mean)</li>
                <li><strong>Blending related metrics</strong> with equal weights (e.g., Run Grade = 50% Line Yards + 50% Rush PPA)</li>
                <li><strong>Inverting defensive metrics</strong> where lower values are better (e.g., PPA Allowed becomes negative Z-score)</li>
              </ol>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h4 className="font-medium text-blue-800 mb-2">Example: Run Offense Grade</h4>
                <p className="text-blue-700 text-sm mb-2">
                  A team's Run Offense Grade combines:
                </p>
                <ul className="list-disc pl-6 space-y-1 text-blue-700 text-sm">
                  <li><strong>Line Yards Z-score:</strong> How many standard deviations above/below average the offensive line performs</li>
                  <li><strong>Rush PPA Z-score:</strong> How many standard deviations above/below average the rushing attack is in terms of predicted points added</li>
                  <li><strong>Final Grade:</strong> (Line Yards Z × 0.5) + (Rush PPA Z × 0.5)</li>
                </ul>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Grading Scale
              </h3>
              <p className="text-gray-700 mb-4">
                Unit grades are displayed on the Game Detail page using a letter grade system (A+ to F) 
                converted from Z-scores:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>A+ (2.0+ Z):</strong> Elite unit, top 2.5% of FBS</li>
                <li><strong>A (1.5-1.99 Z):</strong> Excellent unit, top 7%</li>
                <li><strong>B+ (1.0-1.49 Z):</strong> Very good unit, top 16%</li>
                <li><strong>B (0.5-0.99 Z):</strong> Above average unit</li>
                <li><strong>C+ (0.0-0.49 Z):</strong> Average unit</li>
                <li><strong>C (-0.49-0.0 Z):</strong> Below average unit</li>
                <li><strong>D+ (-0.99 to -0.5 Z):</strong> Poor unit</li>
                <li><strong>D (-1.49 to -1.0 Z):</strong> Very poor unit</li>
                <li><strong>F (&lt; -1.5 Z):</strong> Bottom tier unit</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Matchup Analysis
              </h3>
              <p className="text-gray-700 mb-4">
                The V2 system calculates net advantages for each matchup:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Run Matchup:</strong> (Home Run Offense - Away Run Defense) vs (Away Run Offense - Home Run Defense)</li>
                <li><strong>Pass Matchup:</strong> (Home Pass Offense - Away Pass Defense) vs (Away Pass Offense - Home Pass Defense)</li>
                <li><strong>Explosiveness Matchup:</strong> (Home Offensive Explosiveness - Away Defensive Explosiveness) vs (Away Offensive Explosiveness - Home Defensive Explosiveness)</li>
              </ul>
              <p className="text-gray-700 mt-4">
                These net advantages are then weighted (40% Run, 40% Pass, 20% Explosiveness) and converted 
                to a spread prediction using an optimized scale factor.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Integration with Hybrid Model
              </h3>
              <p className="text-gray-700 mb-4">
                The V2 unit matchup analysis is combined with the V1 Power Rating in the production Hybrid model. 
                The Hybrid model (70% V1 + 30% V2) is the source of all ATS edges, confidence tiers, and official 
                spread picks across the application.
              </p>
              <p className="text-gray-700 mb-4">
                For comparison and analysis, the "Labs (V2)" dashboard allows users to view pure V1, pure V2, 
                and Hybrid predictions side-by-side.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Situational Adjustments
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Weather Adjustments (V2)
              </h3>
              <p className="text-gray-700 mb-4">
                The V2 model applies situational penalties to unit grades based on weather conditions. 
                These adjustments are visible on the Game Detail page when the "Weather Adjustment" toggle 
                is enabled.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-yellow-800 mb-2">Wind Penalty</h4>
                <p className="text-yellow-700 text-sm mb-2">
                  <strong>Threshold:</strong> Wind speed &gt; 15 mph
                </p>
                <p className="text-yellow-700 text-sm mb-2">
                  <strong>Effect:</strong> Passing offense grades are penalized by 0.05 Z-score per mph above 15 mph
                </p>
                <p className="text-yellow-700 text-sm">
                  <strong>Example:</strong> 20 mph wind = (20 - 15) × 0.05 = 0.25 Z-score penalty to Pass Offense Grade
                </p>
                <p className="text-yellow-700 text-sm mt-2">
                  High wind conditions make passing more difficult, reducing the effectiveness of teams that 
                  rely heavily on the aerial attack. The penalty is capped at -3.0 Z-score to prevent extreme 
                  adjustments.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">Precipitation Penalty</h4>
                <p className="text-blue-700 text-sm mb-2">
                  <strong>Threshold:</strong> Precipitation probability &gt; 50%
                </p>
                <p className="text-blue-700 text-sm mb-2">
                  <strong>Effect:</strong> Offensive explosiveness grades are penalized by 0.2 Z-score
                </p>
                <p className="text-blue-700 text-sm">
                  Heavy rain or snow conditions make ball handling more difficult and reduce the likelihood 
                  of explosive plays. This penalty affects both teams equally and is applied to the 
                  Explosiveness component of the V2 matchup calculation.
                </p>
              </div>
              <p className="text-gray-700 mt-4">
                <strong>Note:</strong> Weather adjustments only affect the V2 component of the Hybrid model. 
                The V1 Power Rating remains unchanged, as it reflects season-long performance that already 
                accounts for typical weather conditions.
              </p>
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
