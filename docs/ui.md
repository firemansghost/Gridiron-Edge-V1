# UI Page Requirements

## Navigation & Layout

**Header Navigation (All Pages)**:
- **Logo/Title**: "Gridiron Edge" (left, links to home)
- **Navigation Links** (center):
  - This Week (/)
  - Weeks (/weeks)
  - Strategies (/strategies)
  - Backtests (/backtests)
- **Data Mode Badge** (right): Shows active data mode (SEED/MOCK/REAL)
- **Active Link Styling**: Highlighted for current page
- **Mobile-Friendly**: Collapses to stacked layout on small screens

**Footer (All Pages)**:
- **Links**: GitHub repo, Docs (/docs), Disclaimer (/disclaimer)
- **Copyright**: Educational disclaimer notice

**Linkable Elements**:
- **Matchup Cells**: Clickable, navigate to Game Detail page
- **View Actions**: "View →" link at end of each table row
- **Empty States**: Friendly message with links to /strategies and /weeks when no games available

## Home Page - Top Edges
**Purpose**: Display highest confidence betting edges for current week
**Required Fields**:
- Game matchup (home vs away teams)
- Implied spread vs market spread
- Edge size and direction
- Confidence tier (A/B/C)
- Game date and time
- Team power ratings
- Recent team performance (last 3 games)

**New Explicit Pick Fields (M3.5)**:
- Model Line: Spread pick with favored team and line (e.g., "Alabama -3.0")
- Pick (Spread): Model recommendation with edge points
- Pick (Total): Over/Under recommendation with edge points
- Sign Convention: Home minus Away (negative = home favored)
- Edge Points: |Model - Market| for both spread and total

**M6 Adjustment Toggles**:
- Injuries Toggle: Enable/disable injury-based spread adjustments
- Weather Toggle: Enable/disable weather-based spread/total adjustments
- Both toggles update confidence tiers and edges in real-time
- Adjustments applied server-side via API query parameters

**Seed Mode Coverage**:
- ✅ Game matchup from games.json (home_team_id, away_team_id)
- ✅ Game date and time from games.json (converted to CST/CDT)
- ✅ Venue and neutral site from games.json
- ✅ Market close spreads/totals from market_lines.json
- ✅ Implied spreads from M3 model computation
- ✅ Edge detection with explicit pick labels
- ✅ Confidence tiers (A/B/C) with edge thresholds
- ✅ Team logos with fallbacks (colored circles with first letter)

## Game Detail Page
**Purpose**: Detailed analysis of specific game with implied vs market comparison
**Required Fields**:
- Team power ratings and trends
- Implied spread/total calculations
- Market line comparison with CLV
- Historical matchup data
- Weather conditions
- Injury reports
- Betting edge analysis
- Confidence breakdown

**New Model vs Market Card (M3.5)**:
- Model Line (Spread): Explicit pick with favored team and line
- Market Line (Spread): Market perspective (e.g., "Alabama -30.0")
- Model Total: Implied total rounded to 0.5
- Market Total: Existing market total
- Recommended Picks: Spread and Total with edge points and confidence tier
- Sign Convention: Home minus Away with HFA = 2.0 points

**Seed Mode Coverage**:
- ✅ Team names and logos from teams.json
- ✅ Market close spread/total from market_lines.json
- ✅ Team statistics from team_game_stats.json (YPP, success rate, pace)
- ✅ Recruiting talent index from recruiting.json
- ✅ Game venue and location from games.json
- ✅ Team power ratings from M3 model computation
- ✅ Implied spread/total calculations from M3 model
- ✅ CLV analysis with explicit pick recommendations

## Team Detail Page (`/team/[id]`)
**Purpose**: Individual team profile with branding, ratings, and recent games
**Route**: `/team/[id]?season=YYYY&week=N` (optional filters)

**Team Card**:
- Team logo (large, 96x96px)
- Team name (header)
- Conference and division
- Mascot
- Location (city, state)
- Team colors (visual swatches with hex codes)
- Color gradient header using primary + secondary colors

**Power Rating Card**:
- Current rating (large display)
- Season and week context
- Model version
- Falls back to "No rating data available" if missing

**Recent Games List** (last 5 games):
- Opponent name (linkable)
- Home vs Away indicator (vs / @)
- Date and venue
- Final score (if available) or status
- Each game links to Game Detail page

**Data Sources**:
- Team info from `teams` table
- Latest power rating from `power_ratings` (most recent or filtered by season/week)
- Recent games from `games` table with team joins

**Linking**:
- All team names throughout the app link to `/team/[id]`
- Home page: Team names in matchup cells
- Weeks page: Team names in matchup text
- Game Detail: Team names in matchup header
- Click team name → view team profile

## Backtests Page (`/backtests`)
**Purpose**: Client-side CSV upload and visualization for backtest reports
**Route**: `/backtests` (no server required)

**Features**:
- **CSV Upload**: Client-side file upload (no server processing)
- **Summary Tiles**: Total bets, hit rate, ROI, avg CLV, max drawdown, avg stake
- **Results Breakdown**: Wins, losses, pushes, pending
- **Confidence Breakdown**: Bet counts by tier (A/B/C)
- **Interactive Charts** (Recharts):
  - Equity Curve: Cumulative P/L over time
  - Drawdown: Peak-to-valley drawdown tracking
  - Edge Histogram: Distribution of bet edges
- **Sortable Bet Table**: 
  - Columns: Week, Matchup, Pick, Edge, Confidence, Stake, Result, P/L, CLV
  - Sortable by: Week, Edge, Confidence, P/L, CLV
  - Filterable by: Confidence tier (A/B/C)
- **Empty State**: Friendly instructions when no CSV loaded

**Data Source**:
- CSV files from `/reports/backtest_*.csv` (generated by `npm run backtest`)
- Client-side parsing with Papaparse (no server upload)

**CSV Format**:
```
season,week,gameId,matchup,betType,pickLabel,line,marketLine,edge,confidence,price,stake,result,pnl,clv,homeScore,awayScore
2024,1,game-1,Away @ Home,spread,Home -3.0,-3.0,-2.5,0.50,A,-110,1.00,WIN,1.00,0.50,31,24
```

**Calculations**:
- Hit Rate: Wins / (Wins + Losses)
- ROI: Total Profit / Total Risked × 100
- Avg CLV: Mean of all CLV values
- Max Drawdown: Largest peak-to-valley decline in equity

## Strategies Page (`/strategies`)
**Purpose**: Strategy configuration and management

**Features**:
- **Ruleset List**: View all betting strategy rulesets
- **Create New**: Button to create new ruleset (`/strategies/new`)
- **Edit**: Link to edit existing ruleset (`/strategies/[id]/edit`)
- **Run**: Link to execute ruleset (`/strategies/run`)
- **Past Runs**: Table of historical strategy executions
- **Active/Inactive Toggle**: Show/hide inactive rulesets

**Ruleset Card**:
- Name and description
- Active status indicator
- Created/updated timestamps
- Action buttons (Run, Edit)

**Past Runs Table**:
- Ruleset name
- Date range (start/end)
- Total bets
- Win rate
- ROI
- CLV
- Link to run details

## Edit Ruleset Page (`/strategies/[id]/edit`)
**Purpose**: Modify existing betting strategy ruleset
**Route**: `/strategies/[id]/edit`

**Form Fields**:
- **Name**: Ruleset name (required)
- **Description**: Optional description
- **Min Spread Edge**: Minimum points edge for spread bets
- **Min Total Edge**: Minimum points edge for total bets
- **Confidence Tiers**: Checkboxes for A/B/C
- **Max Games Per Week**: Optional game limit
- **Include Teams**: Comma-separated team IDs to include
- **Exclude Teams**: Comma-separated team IDs to exclude
- **Active**: Toggle to enable/disable ruleset

**API Integration**:
- `GET /api/strategies/rulesets/[id]`: Fetch ruleset data to prefill form
- `PUT /api/strategies/rulesets/[id]`: Save changes

**Validation**:
- Name is required
- Numeric fields validated (edge, max games)
- Team IDs trimmed and filtered

**Actions**:
- **Cancel**: Return to `/strategies` without saving
- **Save Changes**: Update ruleset and redirect to `/strategies`

**Error Handling**:
- Red error banner for API failures
- Field-level validation
- Network error messages

## My Bets Page
**Purpose**: Personal betting tracking and performance
**Required Fields**:
- Bet history with results
- P/L tracking and trends
- CLV analysis
- Betting performance by strategy
- Win/loss record
- Profit/loss charts
- Betting statistics

## Review Past Weeks Page
**Purpose**: Weekly performance summary with as-of state preservation
**Required Fields**:
- Weekly P/L summary
- Hit rate by confidence tier
- CLV analysis per week
- Strategy performance breakdown
- As-of state preservation (model version, market lines)
- Weekly edge analysis
- Performance trends over time
- Drill-through to specific weeks

**M4 Implementation (Seed-Mode)**:
- **Filters**: Season, Week, Confidence (A/B/C), Market (spread/total)
- **Table Columns**: Matchup, Kickoff (CT), Model Line, Pick (Spread), Pick (Total), Market Close, Edges, Confidence
- **Summary Card**: Confidence tier counts (A/B/C), ROI analysis if scores available
- **ROI Calculation**: Simple win/loss/push tracking at -110 odds for spread picks
- **No Results Message**: "No results yet — scores not seeded" when scores missing
- **Deep Linking**: /weeks?season=2024&week=1 for seed week

## Methodology/Settings Page
**Purpose**: System configuration and methodology explanation
**Required Fields**:
- Power rating methodology explanation
- Feature engineering details
- Confidence tier definitions
- Model version information
- Data source configuration
- Update schedules
- System status and health
- Performance metrics

## Common UI Requirements

### Data Display
- Responsive design for mobile/desktop
- Real-time data updates
- Loading states and error handling
- Data export capabilities
- Print-friendly layouts

### Navigation
- Clear page hierarchy
- Breadcrumb navigation
- Search functionality
- Filtering and sorting options
- Quick access to key metrics

### Performance
- Fast page load times (<2 seconds)
- Efficient data loading
- Caching strategies
- Progressive loading for large datasets
- Optimized chart rendering

### Accessibility
- Screen reader compatibility
- Keyboard navigation
- Color contrast compliance
- Alt text for images
- Focus management

## Team Logo Fallbacks
**Purpose**: Handle missing or broken team logos gracefully
**Implementation**:
- If `logoUrl` is missing or fails to load, display colored circle with team's first letter
- Use `primaryColor` for background, white text
- Fallback to neutral gray (#6B7280) if colors are missing
- Size variants: sm (24px), md (32px), lg (48px)
- Applied to Home page matchup display and Game Detail pages

## Strategies Pages (M6)

### /strategies (List Page)
**Purpose**: Manage betting strategy rulesets and view past runs
**Features**:
- **Rulesets Tab**: List all created rulesets with parameters preview
  - Name, description, status (active/inactive)
  - Parameter summary: min edges, confidence tiers, limits
  - Actions: Run, Edit
  - Create New Ruleset button
- **Past Runs Tab**: Historical strategy execution results
  - Ruleset name, period, total bets, win rate, ROI, CLV
  - Sortable by date and performance metrics

### /strategies/new (Create Ruleset)
**Purpose**: Create new betting strategy ruleset
**Fields**:
- **Basic Info**: Name (required), description (optional)
- **Edge Thresholds**: 
  - Min Spread Edge (pts)
  - Min Total Edge (pts)
- **Confidence Tiers**: Checkboxes for A/B/C tiers
- **Limits**: Max games per week (optional)
- **Team Filters**:
  - Include only teams (comma-separated IDs)
  - Exclude teams (comma-separated IDs)

**Ruleset Parameters JSON**:
```json
{
  "minSpreadEdge": 2.0,
  "minTotalEdge": 2.0,
  "confidenceIn": ["A", "B"],
  "maxGamesPerWeek": 5,
  "includeTeams": ["alabama", "ohio-state"],
  "excludeTeams": ["fcs-teams"]
}
```

### /strategies/run (Run Screen)
**Purpose**: Execute ruleset against a specific week
**Query Parameters**:
- `rulesetId`: Ruleset to execute
- `season`: Season year (default: 2024)
- `week`: Week number (default: 1)

**Display**:
- **Summary Cards**: Total bets, avg edge, confidence breakdown
- **Ruleset Parameters**: Display active filters
- **Qualifying Games Table**: 
  - Matchup, kickoff, spread/total picks
  - Edges for spread and total
  - Confidence tier badges
- **Save Button**: Persist run to strategy_runs table

**Filtering Logic**:
1. Fetch games for season/week
2. Calculate edges (implied vs market)
3. Apply min edge thresholds (OR logic)
4. Apply confidence filter
5. Apply team include/exclude filters
6. Sort by max edge descending
7. Apply max games limit (if set)

**Saved Run Data**:
- `rulesetId`, `startDate`, `endDate`
- `totalBets`, `avgEdge`
- `winRate`, `roi`, `clv` (placeholders in seed mode)
