# UI Page Requirements

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

## Teams Page
**Purpose**: Team rankings and performance analysis
**Required Fields**:
- Team power ratings (current and historical)
- Recent game results and scores
- Season statistics (offensive/defensive)
- Recruiting rankings and trends
- Conference standings
- Upcoming schedule
- Team performance trends

**Seed Mode Coverage**:
- ✅ Team names, conferences from teams.json
- ✅ Basic stat profiles from team_game_stats.json
- ✅ Recruiting rankings from recruiting.json
- ✅ Conference standings (calculated from games.json results)
- ✅ Team colors and logos from teams.json
- ⏳ Team power ratings (placeholder until M2 model)
- ⏳ Historical trends (placeholder until M2 model)

## Backtests Page
**Purpose**: Historical strategy performance analysis
**Required Fields**:
- Strategy performance metrics (ROI, hit rate, CLV)
- Time period selection
- Confidence tier breakdown
- Win/loss record by strategy
- P/L charts and trends
- Strategy comparison tools
- Historical edge analysis

## Strategies Page
**Purpose**: Strategy configuration and management
**Required Fields**:
- Active strategy list
- Strategy parameters and rules
- Performance metrics per strategy
- Strategy activation/deactivation
- Parameter optimization tools
- Strategy comparison
- Risk management settings

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
