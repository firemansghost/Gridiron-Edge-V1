# Data Model

## Core Tables

### teams
**Purpose**: Master list of college football teams with metadata
**Key Fields**: team_id, name, conference, division, logo_url
**Indexes**: (conference, division), (name)

### games
**Purpose**: Game schedule and results with timestamps
**Key Fields**: game_id, home_team_id, away_team_id, season, week, date, status, home_score, away_score
**Indexes**: (season, week), (home_team_id, season), (away_team_id, season), (date)

### team_game_stats
**Purpose**: Per-game team statistics for power rating calculations
**Key Fields**: game_id, team_id, offensive_stats, defensive_stats, special_teams_stats
**Indexes**: (team_id, season), (game_id), (season, week)

### recruiting
**Purpose**: Team recruiting rankings and player commitments
**Key Fields**: team_id, season, class_rank, avg_rating, commit_count, top_players
**Indexes**: (team_id, season), (season, class_rank)

### market_lines
**Purpose**: Betting market lines with timestamps for as-of state
**Key Fields**: game_id, line_type, line_value, timestamp, source, closing_line
**Indexes**: (game_id, line_type), (timestamp), (season, week)

### power_ratings
**Purpose**: Team power ratings with model versioning
**Key Fields**: team_id, season, week, rating, model_version, features, confidence
**Indexes**: (team_id, season), (season, week), (model_version), (rating DESC)

### matchup_outputs
**Purpose**: Calculated implied lines and edge detection results
**Key Fields**: game_id, implied_spread, implied_total, market_spread, market_total, edge_confidence, model_version
**Indexes**: (game_id), (season, week), (edge_confidence), (model_version)

### bets
**Purpose**: User bet tracking with as-of state preservation
**Key Fields**: bet_id, game_id, bet_type, line_at_bet, closing_line, amount, result, pnl, clv
**Indexes**: (game_id), (bet_type), (result), (created_at)

### rulesets
**Purpose**: Betting strategy rules and parameters
**Key Fields**: ruleset_id, name, description, parameters, active
**Indexes**: (active), (name)

### strategy_runs
**Purpose**: Strategy execution history and performance tracking
**Key Fields**: run_id, ruleset_id, start_date, end_date, total_bets, win_rate, roi, clv
**Indexes**: (ruleset_id), (start_date), (roi DESC)

## Index Strategy

### Primary Indexes
- **Season/Week**: (season, week) for time-based queries
- **Team/Season**: (team_id, season) for team-specific historical data
- **Game ID**: (game_id) for game-specific lookups

### Performance Indexes
- **Rating Queries**: (rating DESC) for top team rankings
- **Edge Detection**: (edge_confidence) for filtering high-confidence edges
- **Betting Performance**: (roi DESC) for strategy performance analysis

### Composite Indexes
- **Team Performance**: (team_id, season, week) for team progression
- **Market Analysis**: (season, week, edge_confidence) for weekly edge summary
- **Strategy Analysis**: (ruleset_id, start_date) for strategy performance over time

## Data Relationships

### Core Relationships
- teams → games (one-to-many via home_team_id/away_team_id)
- games → team_game_stats (one-to-many)
- games → market_lines (one-to-many)
- teams → power_ratings (one-to-many)
- games → matchup_outputs (one-to-one)

### Betting Relationships
- games → bets (one-to-many)
- rulesets → strategy_runs (one-to-many)
- strategy_runs → bets (one-to-many via ruleset_id)

## As-of State Management

### Model Versioning
- All calculated fields include model_version
- Historical state preserved for backtesting
- Version comparison for model improvement tracking

### Market Line Freezing
- line_at_bet: Market line when bet was placed
- closing_line: Final market line at game time
- CLV calculation: (line_at_bet - closing_line) for spread bets

### Timestamp Strategy
- All timestamps in America/Chicago timezone
- Created/updated timestamps on all tables
- Audit trail for data changes
