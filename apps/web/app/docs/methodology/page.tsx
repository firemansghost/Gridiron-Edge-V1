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
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Roster & Portal (Labs / V5 Prep)
              </h3>
              <p className="text-gray-700 mb-2">
                Roster stability and transfer portal activity metrics:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Returning Production:</strong> Percentage of production returning from previous season (overall, offense, defense, passing, rushing, receiving)</li>
                <li><strong>Transfer Portal Activity:</strong> Counts of transfers in, out, and net portal movement</li>
              </ul>
              <p className="text-gray-600 text-sm mt-2 italic">
                Note: This data is currently labeled as "Labs / V5 Prep" and not yet used in production Hybrid or V3 models. 
                It will be used for future off-season adjustments and mid-season recalibration in V5.
              </p>
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
            Modeling (Balanced Composite V1)
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Power Ratings: Balanced Composite
              </h3>
              <p className="text-gray-700 mb-4">
                Our V1 model generates team power ratings using a balanced four-pillar approach. 
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
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Spread Calculation
              </h3>
              <p className="text-gray-700 mb-4">
                Spreads are derived directly from the power rating difference between teams, plus 
                a home field advantage adjustment:
              </p>
              <div className="bg-gray-100 p-4 rounded-lg mb-4">
                <p className="text-sm text-gray-700 font-mono mb-2">
                  Spread (Home Minus Away) = (Home Rating - Away Rating) + HFA
                </p>
                <p className="text-xs text-gray-600">
                  Where HFA (Home Field Advantage) = 2.0 points for home games, 0.0 for neutral sites.
                </p>
              </div>
              <p className="text-gray-700 mb-4">
                This direct calculation ensures that the spread reflects the model's assessment of 
                team strength without additional overlays or market adjustments. The rating difference 
                is already in "points above average" format, so the spread directly translates to 
                expected margin of victory.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Betting Logic: Actionable Edge Threshold
              </h3>
              <p className="text-gray-700 mb-4">
                The model identifies betting opportunities by comparing its predicted spread to the 
                market consensus. An "edge" is the difference between the model's spread and the 
                market line:
              </p>
              <div className="bg-gray-100 p-4 rounded-lg mb-4">
                <p className="text-sm text-gray-700 font-mono mb-2">
                  Edge = |Model Spread - Market Spread|
                </p>
              </div>
              <p className="text-gray-700 mb-4">
                <strong>0.1 Point Threshold:</strong> The model recommends a bet when the edge is 
                at least 0.1 points. This minimal threshold ensures that any meaningful disagreement 
                between the model and market is flagged as actionable. There are no caps, overlays, 
                or decay factors—the model trusts its ratings completely.
              </p>
              <p className="text-gray-700 mb-4">
                <strong>No Market Capping:</strong> Unlike previous versions, the V1 model does not 
                apply "Trust-Market" safety layers. The model's spread is used directly, without 
                capping edges or applying minimum thresholds above 0.1 points. This approach maximizes 
                the model's predictive power while maintaining a low barrier for actionable picks.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Confidence Tiers
              </h3>
              <p className="text-gray-700 mb-4">
                Bets are assigned confidence grades based on the magnitude of the edge:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Grade A:</strong> High confidence (edge ≥ 4.0 points)</li>
                <li><strong>Grade B:</strong> Medium confidence (edge 3.0 - 3.9 points)</li>
                <li><strong>Grade C:</strong> Low confidence (edge 0.1 - 2.9 points)</li>
              </ul>
              <p className="text-gray-700 mt-4">
                The game's overall confidence grade is determined by the <strong>highest</strong> 
                grade among all active bets (Spread, Total, Moneyline) for that matchup.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Moneyline & Totals
              </h3>
              <p className="text-gray-700 mb-4">
                <strong>Moneyline:</strong> Win probabilities are derived from the spread using a 
                standard sigmoid conversion (logistic function). The model compares its implied 
                probability to the market's implied probability to identify value. Moneyline bets 
                are only considered for games where the spread is ≤ 24 points (to avoid extreme 
                favorites with unbettable odds).
              </p>
              <p className="text-gray-700 mb-4">
                <strong>Totals:</strong> Over/Under picks are calculated using a spread-driven 
                totals model that considers both offensive and defensive ratings, adjusted for 
                game pace and scoring efficiency. The same 0.1 point edge threshold applies.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Unit Matchup Analysis (V2)
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Overview
              </h3>
              <p className="text-gray-700 mb-4">
                Beyond the main Power Rating (V1), Gridiron Edge analyzes specific unit matchups to identify 
                tactical advantages. The V2 system breaks down team performance into granular unit grades 
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
                Hybrid Model V2 (Production)
              </h3>
              <p className="text-gray-700 mb-4">
                The V2 unit matchup analysis is combined with the V1 Power Rating in a "Hybrid" model that 
                blends both approaches:
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-700 text-sm mb-2">
                  <strong>Hybrid Spread = (V1 Spread × 70%) + (V2 Spread × 30%)</strong>
                </p>
                <p className="text-green-700 text-sm mb-2">
                  This blend leverages the stability of V1 (results-aware) with the matchup specificity 
                  of V2 (stats-only). The weights were optimized through backtesting against 2025 season 
                  results.
                </p>
                <p className="text-green-700 text-sm font-semibold">
                  <strong>Production Status:</strong> Hybrid V2 is the only production spread model used for 
                  "My Picks" and live betting recommendations. All other models (V1, V2 standalone, V4) are 
                  experimental/Labs-only.
                </p>
              </div>
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
            Labs / Experimental Models
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                V4 (Labs) — SP+/FEI-Style Spread Ratings
              </h3>
              <p className="text-gray-700 mb-4">
                V4 is an experimental spread rating model inspired by SP+ and FEI methodologies. It uses 
                drive-based metrics (Finishing Drives, Available Yards %) and advanced efficiency stats to 
                generate spread predictions. V4 is <strong>not used in production</strong> and is available 
                only in Labs for research and backtesting purposes.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-yellow-800 mb-2">V4 (Labs) & Fade V4 — Backtest Snapshot</h4>
                <p className="text-yellow-700 text-sm mb-3">
                  V4, as a standalone model, is currently unprofitable and is not used in production. However, 
                  fading its picks ("Fade V4 (Labs)") has shown positive ROI in backtests for both 2024 and 
                  2025. This overlay remains experimental and subject to regression.
                </p>
                
                <div className="mt-4">
                  <h5 className="font-semibold text-yellow-800 mb-2">2024 Season</h5>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-yellow-800 mb-1">V4 Labs (standalone):</p>
                      <ul className="text-yellow-700 space-y-0.5">
                        <li>372 bets</li>
                        <li>Win rate: 35.1%</li>
                        <li>ROI: -32.75%</li>
                        <li>Tier A ROI (edge ≥ 3): -35.08%</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-yellow-800 mb-1">Fade V4 (Labs):</p>
                      <ul className="text-yellow-700 space-y-0.5">
                        <li>372 bets</li>
                        <li>Win rate: 58.0%</li>
                        <li>ROI: +10.43%</li>
                        <li>Tier A ROI: +7.48%</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <h5 className="font-semibold text-yellow-800 mb-2">2025 Season</h5>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-yellow-800 mb-1">V4 Labs (standalone):</p>
                      <ul className="text-yellow-700 space-y-0.5">
                        <li>709 bets</li>
                        <li>Win rate: 39.1%</li>
                        <li>ROI: -24.96%</li>
                        <li>Tier A ROI: -26.88%</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-yellow-800 mb-1">Fade V4 (Labs):</p>
                      <ul className="text-yellow-700 space-y-0.5">
                        <li>671 bets</li>
                        <li>Win rate: 61.8%</li>
                        <li>ROI: +17.81%</li>
                        <li>Tier A ROI: +18.93%</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <p className="text-yellow-600 text-xs mt-4 italic">
                  All results are backtests, not guarantees. Fade V4 is Labs-only and is not part of the 
                  main "My Picks" flow. Hybrid V2 remains the only official spread model.
                </p>
                
                <h4 className="font-medium text-yellow-800 mb-2 mt-4">SGO Team Season Stats (Labs / V5 Prep)</h4>
                <p className="text-yellow-700 text-sm mb-3">
                  We ingest a curated subset of SportsGameOdds team season stats and aggregate them into structured 
                  metrics stored in <code className="bg-yellow-100 px-1 rounded">team_season_stats.raw_json.sgo_stats</code>. 
                  These include:
                </p>
                <ul className="text-yellow-700 text-sm list-disc pl-6 mb-3 space-y-1">
                  <li><strong>Red zone efficiency:</strong> Trips, touchdowns, TD rate</li>
                  <li><strong>Discipline:</strong> Penalty counts, yards, first downs (total and per-game)</li>
                  <li><strong>Pressure/havoc:</strong> Offense sacks taken, INTs; defense sacks, TFL, QB hits, INTs, fumbles forced</li>
                  <li><strong>Special teams:</strong> Punting, kickoff/punt returns, field goal accuracy</li>
                  <li><strong>Game script:</strong> Largest lead, time in lead, lead changes, scoring runs, ties</li>
                </ul>
                <p className="text-yellow-700 text-sm">
                  This data is currently Labs-only and not yet used in the production Hybrid V2 model. It is being 
                  collected for future V5 model development and analysis.
                </p>
                
                <h4 className="font-medium text-yellow-800 mb-2 mt-4">Hybrid Conflict Types (Labs Analytics)</h4>
                <p className="text-gray-700 mb-2">
                  We compute conflict types for games with Hybrid V2 spread bets to understand where performance 
                  comes from relative to V4 (Labs):
                </p>
                <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-2">
                  <li><strong>Hybrid Strong (disagree):</strong> Hybrid and V4 disagree on side (H.side !== V4.side). 
                  These games historically show stronger performance for Hybrid/Fade V4.</li>
                  <li><strong>Hybrid Weak (agree):</strong> Hybrid and V4 agree on side (H.side === V4.side). 
                  These games historically show weaker/near-coinflip performance for Hybrid.</li>
                  <li><strong>Hybrid Only:</strong> Hybrid bet exists but no V4 bet for that game.</li>
                </ul>
                <p className="text-gray-600 text-sm italic">
                  Note: Conflict types are Labs-only diagnostics used for performance analysis in Week Review and 
                  Season Review. They do not change which bets are shown or how bets are selected—they are purely 
                  analytical tools for understanding where profit comes from.
                </p>
              </div>
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
