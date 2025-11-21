/**
 * Data Points / Data Dictionary Page
 * 
 * Lists all data points and metrics collected from CFBD, OddsAPI, and other sources.
 */

import Link from 'next/link';

export default function DataPointsPage() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Data Dictionary
      </h1>
      
      <div className="space-y-8">
        <section>
          <p className="text-gray-700 mb-4">
            This page documents all data points and metrics collected by Gridiron Edge. 
            Understanding the raw ingredients helps users interpret model outputs and 
            understand the system's capabilities.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Play-by-Play Metrics (CFBD)
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Efficiency Metrics
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>EPA (Expected Points Added):</strong> Offensive and defensive EPA per play. Measures the value created (or prevented) on each play relative to baseline expectations.</li>
                <li><strong>PPA (Points Per Attempt):</strong> Predicted points added per rushing or passing attempt. Measures efficiency by play type (rush PPA, pass PPA). Used in V2 unit grade calculations.</li>
                <li><strong>Success Rate:</strong> Percentage of plays with positive EPA. Tracks consistency and play-level effectiveness.</li>
                <li><strong>IsoPPP (Isolated Points Per Play):</strong> Average EPA on successful plays. Measures explosiveness and big-play ability.</li>
                <li><strong>Points Per Opportunity (PPO):</strong> Scoring efficiency when in scoring position. Tracks finishing ability.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Line & Havoc Metrics
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Line Yards:</strong> Offensive line performance metric. Measures yards gained before contact.</li>
                <li><strong>Stuff Rate:</strong> Percentage of runs stopped at or behind the line of scrimmage.</li>
                <li><strong>Power Success:</strong> Conversion rate on short-yardage situations (3rd/4th & 2 or less).</li>
                <li><strong>Havoc Rate:</strong> Percentage of plays with TFL, INT, or PBU. Measures defensive disruption.</li>
                <li><strong>Havoc by Position:</strong> Front-7 havoc (linebackers/DL) and defensive back havoc tracked separately.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Play Type Splits
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Run EPA / Pass EPA:</strong> Efficiency by play type (offensive and defensive).</li>
                <li><strong>Run Success Rate / Pass Success Rate:</strong> Consistency by play type.</li>
                <li><strong>Early Down EPA / Late Down EPA:</strong> Performance on 1st/2nd down vs. 3rd/4th down.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Field Position
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Average Starting Field Position:</strong> Typical starting field position for drives. Impacts scoring opportunities.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                V2 Unit Grades (Derived)
              </h3>
              <p className="text-gray-700 mb-2">
                Unit-specific performance grades calculated from the metrics above, normalized to Z-scores:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Run Offense Grade:</strong> 50% Line Yards Z-score + 50% Rush PPA Z-score. Measures ground game effectiveness.</li>
                <li><strong>Run Defense Grade:</strong> 50% Stuff Rate Z-score + 50% (inverted) Rush PPA Allowed Z-score. Measures ability to stop the run.</li>
                <li><strong>Pass Offense Grade:</strong> 50% Pass PPA Z-score + 50% Pass Success Rate Z-score. Measures aerial attack effectiveness.</li>
                <li><strong>Pass Defense Grade:</strong> 50% (inverted) Pass PPA Allowed Z-score + 50% (inverted) Pass Success Rate Allowed Z-score. Measures pass defense strength.</li>
                <li><strong>Offensive Explosiveness:</strong> IsoPPP Z-score. Measures big-play ability.</li>
                <li><strong>Defensive Explosiveness:</strong> (Inverted) IsoPPP Allowed Z-score. Measures ability to prevent big plays.</li>
                <li><strong>Havoc Grade:</strong> Havoc Rate Z-score (season-level). Measures defensive disruption and playmaking ability.</li>
              </ul>
              <p className="text-gray-600 text-sm mt-2 italic">
                Note: All grades are normalized to Z-scores (standard deviations from FBS mean), enabling direct comparison across different metric types. These grades power the "Unit Matchup" analysis on game detail pages.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Team Information
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Talent & Recruiting
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Talent Composite (247Sports):</strong> Overall team talent rating (0-100 scale). Aggregates recruiting rankings and roster quality.</li>
                <li><strong>Blue Chip Percentage:</strong> Percentage of roster with 4-star or 5-star recruits.</li>
                <li><strong>Star Counts:</strong> Number of 5-star, 4-star, and 3-star recruits on roster.</li>
                <li><strong>Recruiting Class Rankings:</strong> National and conference rankings for recent recruiting classes.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Team Classification
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Conference:</strong> Conference affiliation (SEC, Big Ten, etc.).</li>
                <li><strong>Division:</strong> Division within conference (if applicable).</li>
                <li><strong>FBS Status:</strong> FBS (Football Bowl Subdivision) vs. FCS classification.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Returning Production
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Offensive Returning Production:</strong> Percentage of offensive production (yards, TDs) returning from previous season.</li>
                <li><strong>Defensive Returning Production:</strong> Percentage of defensive production (tackles, INTs) returning from previous season.</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Market Data (OddsAPI)
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Spread Lines
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Opening Line:</strong> Initial spread posted by sportsbooks.</li>
                <li><strong>Closing Line:</strong> Final spread at game time (or consensus closing line).</li>
                <li><strong>Line Movement:</strong> Tracked via timestamped line values to identify market shifts.</li>
                <li><strong>Multiple Books:</strong> Data from DraftKings, FanDuel, Caesars, BetMGM, and others.</li>
                <li><strong>Team Association:</strong> Each spread line is associated with a specific team (favorite or underdog).</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Total Lines (Over/Under)
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Opening Total:</strong> Initial over/under posted by sportsbooks.</li>
                <li><strong>Closing Total:</strong> Final total at game time.</li>
                <li><strong>Line Movement:</strong> Tracked to identify market consensus shifts.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Moneyline Odds
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>American Odds Format:</strong> Stored as positive (underdog) or negative (favorite) values (e.g., +150, -175).</li>
                <li><strong>Implied Probability:</strong> Calculated from odds using standard formulas:
                  <ul className="list-disc pl-6 mt-1 space-y-1 text-gray-600">
                    <li>Negative odds: |odds| / (|odds| + 100)</li>
                    <li>Positive odds: 100 / (odds + 100)</li>
                  </ul>
                </li>
                <li><strong>Favorite vs. Underdog:</strong> Each moneyline is associated with a specific team.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Market Metadata
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Source Book:</strong> Sportsbook name (DraftKings, FanDuel, etc.).</li>
                <li><strong>Timestamp:</strong> When the line was collected (enables line movement tracking).</li>
                <li><strong>Consensus:</strong> Median/average across multiple books to identify market consensus.</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Contextual Data
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Weather Conditions
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Temperature:</strong> Game-time temperature (affects passing efficiency and player performance).</li>
                <li><strong>Wind Speed:</strong> Wind conditions (impacts passing and kicking).</li>
                <li><strong>Precipitation Probability:</strong> Chance of rain/snow (affects ball handling and field conditions).</li>
                <li><strong>Condition Text:</strong> Human-readable weather description.</li>
                <li><strong>Source:</strong> Visual Crossing Weather API (historical and forecast data).</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Injury Reports
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Player Name:</strong> Injured player identifier.</li>
                <li><strong>Position:</strong> Player position (QB, RB, WR, OL, DL, LB, DB, etc.).</li>
                <li><strong>Severity:</strong> Injury status (Out, Questionable, Probable).</li>
                <li><strong>Team Association:</strong> Which team the player belongs to.</li>
                <li><strong>Note:</strong> Currently collected but not yet integrated into model adjustments.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Game Context
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Venue:</strong> Stadium name and location.</li>
                <li><strong>Neutral Site:</strong> Boolean flag indicating if game is at a neutral location.</li>
                <li><strong>Home Field Advantage:</strong> Applied as +2.0 points for home teams (0.0 for neutral sites).</li>
                <li><strong>Kickoff Time:</strong> Game start time (used for timezone conversions and scheduling).</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Derived Metrics
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Power Ratings
              </h3>
              <p className="text-gray-700 mb-2">
                Composite ratings calculated from the four pillars (Talent, Efficiency, Scoring, Results). 
                See <Link href="/docs/methodology" className="text-blue-600 hover:text-blue-800 underline">Methodology</Link> for details.
              </p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>V1 Power Rating:</strong> Balanced composite (25% each pillar), normalized to Z-scores, scaled by 14.0.</li>
                <li><strong>Rating Format:</strong> "Points above average" (e.g., +15.0 means team is 15 points better than average).</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Model Spreads & Totals
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Model Spread:</strong> Calculated as (Home Rating - Away Rating) + HFA.</li>
                <li><strong>Model Total:</strong> Derived from offensive/defensive ratings, adjusted for pace and scoring efficiency.</li>
                <li><strong>Edge:</strong> Difference between model prediction and market consensus.</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Win Probabilities
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Model Win Probability:</strong> Derived from spread using sigmoid function: prob = 1 / (1 + 10^(spread / 14.5)).</li>
                <li><strong>Market Implied Probability:</strong> Calculated from moneyline odds using standard formulas.</li>
                <li><strong>Value:</strong> Difference between model probability and market implied probability (for moneyline bets).</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Data Collection Status
          </h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-medium text-yellow-800 mb-2">Coverage Notes</h3>
            <ul className="list-disc pl-6 space-y-1 text-yellow-700 text-sm">
              <li><strong>Play-by-Play Metrics:</strong> 100% coverage for FBS teams (season-level) and FBS-vs-FBS games (game-level).</li>
              <li><strong>Market Data:</strong> Coverage varies by book and game importance. Major games have full coverage; smaller games may have limited book coverage.</li>
              <li><strong>Weather:</strong> Collected for all games, but forecast accuracy varies by proximity to game time.</li>
              <li><strong>Injuries:</strong> Collected but not yet integrated into model adjustments (future enhancement).</li>
              <li><strong>Historical Data:</strong> Limited by API tier access. Current season (2025) has full coverage; historical seasons may have gaps.</li>
            </ul>
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
                <li>Play-by-play efficiency metrics (EPA, Success Rate, IsoPPP)</li>
                <li>Team talent composite and recruiting data</li>
                <li>Game schedules, scores, and team classifications</li>
                <li>Returning production data</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                The Odds API
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>Spread, total, and moneyline odds from multiple sportsbooks</li>
                <li>Opening and closing line tracking</li>
                <li>Real-time odds updates (3x daily during active weeks)</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Visual Crossing Weather
              </h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li>Game-time weather conditions (temperature, wind, precipitation)</li>
                <li>Historical weather patterns</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}


