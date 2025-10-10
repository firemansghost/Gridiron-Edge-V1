# Seed Data Plan

## Overview
Seed data for CFB 2024 Week 1 (7 games) to enable UI development without API dependencies. All data normalized to America/Chicago timezone.

## JSON Schemas

### teams.json Schema
```json
{
  "teams": [
    {
      "team_id": "string (required, unique)",
      "name": "string (required)",
      "conference": "string (required)",
      "division": "string (optional)",
      "logo_url": "string (required)",
      "primary_color": "string (required, hex)",
      "secondary_color": "string (required, hex)",
      "mascot": "string (optional)",
      "city": "string (optional)",
      "state": "string (optional)"
    }
  ]
}
```

### games.json Schema
```json
{
  "games": [
    {
      "game_id": "string (required, unique)",
      "home_team_id": "string (required, FK to teams.team_id)",
      "away_team_id": "string (required, FK to teams.team_id)",
      "season": "integer (required)",
      "week": "integer (required)",
      "date": "string (required, ISO 8601 with timezone)",
      "status": "string (required, enum: scheduled|in_progress|final)",
      "home_score": "integer (optional)",
      "away_score": "integer (optional)",
      "venue": "string (required)",
      "city": "string (required)",
      "neutral_site": "boolean (required)",
      "conference_game": "boolean (required)"
    }
  ]
}
```

### team_game_stats.json Schema
```json
{
  "team_game_stats": [
    {
      "game_id": "string (required, FK to games.game_id)",
      "team_id": "string (required, FK to teams.team_id)",
      "offensive_stats": {
        "points": "integer (required)",
        "total_yards": "integer (required)",
        "passing_yards": "integer (required)",
        "rushing_yards": "integer (required)",
        "turnovers": "integer (required)",
        "third_down_conversions": "integer (required)",
        "third_down_attempts": "integer (required)",
        "red_zone_attempts": "integer (optional)",
        "red_zone_touchdowns": "integer (optional)",
        "time_of_possession": "string (optional, MM:SS format)"
      },
      "defensive_stats": {
        "points_allowed": "integer (required)",
        "yards_allowed": "integer (required)",
        "sacks": "integer (required)",
        "interceptions": "integer (required)",
        "fumbles_recovered": "integer (required)",
        "tackles_for_loss": "integer (optional)",
        "pass_breakups": "integer (optional)"
      },
      "special_teams": {
        "field_goals_made": "integer (required)",
        "field_goals_attempted": "integer (required)",
        "punt_returns": "integer (optional)",
        "kick_returns": "integer (optional)",
        "punt_return_yards": "integer (optional)",
        "kick_return_yards": "integer (optional)"
      }
    }
  ]
}
```

### recruiting.json Schema
```json
{
  "recruiting": [
    {
      "team_id": "string (required, FK to teams.team_id)",
      "season": "integer (required)",
      "class_rank": "integer (required)",
      "avg_rating": "number (required, 0-100)",
      "commit_count": "integer (required)",
      "five_stars": "integer (required)",
      "four_stars": "integer (required)",
      "three_stars": "integer (required)",
      "top_players": [
        {
          "name": "string (required)",
          "position": "string (required)",
          "rating": "number (required, 0-100)",
          "stars": "integer (required, 1-5)"
        }
      ]
    }
  ]
}
```

### market_lines.json Schema
```json
{
  "market_lines": [
    {
      "game_id": "string (required, FK to games.game_id)",
      "line_type": "string (required, enum: spread|total|moneyline)",
      "line_value": "number (required)",
      "timestamp": "string (required, ISO 8601 with timezone)",
      "source": "string (required)",
      "closing_line": "number (required)",
      "book_name": "string (required)"
    }
  ]
}
```

## Seed Ingestion Plan

### Single Command Execution
```bash
python -m jobs.seed.ingest --seed-dir /seed --validate --upsert
```

### Validation Rules
1. **Schema Validation**: All JSON files must match their respective schemas
2. **Foreign Key Validation**: 
   - All team_id references must exist in teams.json
   - All game_id references must exist in games.json
   - home_team_id != away_team_id for all games
3. **Data Range Validation**:
   - Spreads: -60 to +60
   - Totals: 25 to 100
   - Recruiting ratings: 0 to 100
   - Stars: 1 to 5
4. **Date Format Validation**: All timestamps in ISO 8601 format with timezone
5. **Enum Validation**: status, line_type, conference values must match allowed values

### Upsert Behavior
- **Primary Keys**: team_id, game_id, (game_id, team_id) for stats
- **Conflict Resolution**: Update existing records, insert new ones
- **Logging**: Count of records inserted/updated per table
- **Error Handling**: Log validation errors, continue processing valid records

## Data Quality Gates

### Minimum Viable Fields
- **teams**: team_id, name, conference, logo_url, primary_color, secondary_color
- **games**: game_id, home_team_id, away_team_id, season, week, date, status, venue, city
- **team_game_stats**: game_id, team_id, offensive_stats.points, defensive_stats.points_allowed
- **recruiting**: team_id, season, class_rank, avg_rating, commit_count
- **market_lines**: game_id, line_type, line_value, timestamp, source, closing_line

### Validation Checks
- **Duplicate IDs**: No duplicate primary keys within each file
- **Invalid Enums**: status in [scheduled, in_progress, final], line_type in [spread, total, moneyline]
- **Date Format**: ISO 8601 with timezone (America/Chicago)
- **Numeric Ranges**: Spreads -60 to +60, totals 25-100, ratings 0-100
- **Required Fields**: All required fields must be present and non-null

## UI Rendering Requirements

### Home Page Fields (Seed Mode)
- Team names and logos from teams.json
- Game dates and times from games.json (converted to CST/CDT display)
- Venue and neutral site flags from games.json
- Market close spreads/totals from market_lines.json
- Note: "Top Edges" shows placeholder until M2 model implementation

### Game Detail Page Fields (Seed Mode)
- Team names and logos from teams.json
- Market close spread/total from market_lines.json
- Team statistics from team_game_stats.json (YPP, success rate, pace)
- Recruiting talent index from recruiting.json
- Note: No implied lines until M2 model implementation

### Teams Page Fields (Seed Mode)
- Team names, conferences from teams.json
- Basic stat profiles from team_game_stats.json
- Recruiting rankings from recruiting.json
- Conference standings (calculated from games.json results)

## Additional Fields for UI Coverage

### Enhanced Team Data
- mascot, city, state for richer team profiles
- primary_color, secondary_color for UI theming

### Enhanced Game Data
- neutral_site, conference_game flags for game context
- venue, city for location display

### Enhanced Market Data
- book_name for source attribution
- closing_line for CLV calculations
- timestamp for as-of state preservation

## M5 Mock Provider Data

### Mock Data Directory Structure
```
/data/
├── teams.json
├── schedules-2024-week-1.json
├── schedules-2024-week-2.json
├── market-lines-2024-week-1.json
└── market-lines-2024-week-2.json
```

### Mock Provider Usage
1. **Drop files in `/data/` directory** following the naming convention
2. **Run ingestion**: `npm run ingest -- mock --season 2024 --weeks 1-2`
3. **Data flows**: Mock files → Adapter → Database → Ratings Pipeline

### File Naming Convention
- **Teams**: `teams.json` (season-agnostic)
- **Schedules**: `schedules-{season}-week-{week}.json`
- **Market Lines**: `market-lines-{season}-week-{week}.json`

### Mock Data Format
The mock provider expects the same JSON schemas as the seed files, but with slightly different field names to match the adapter interface:

**Teams**: `id` instead of `team_id`
**Games**: `id`, `homeTeamId`, `awayTeamId` instead of `game_id`, `home_team_id`, `away_team_id`
**Market Lines**: `gameId`, `lineType`, `openingLine`, `closingLine` instead of `game_id`, `line_type`, `opening_line`, `closing_line`