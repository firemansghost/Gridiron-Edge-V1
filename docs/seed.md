# Seed Data Plan

## Overview
Seed data for one week (6-8 games) to enable UI development without API dependencies.

## Data Files

### teams.json
```json
{
  "teams": [
    {
      "team_id": "alabama",
      "name": "Alabama Crimson Tide",
      "conference": "SEC",
      "division": "West",
      "logo_url": "https://example.com/logos/alabama.png",
      "primary_color": "#9E1B32",
      "secondary_color": "#FFFFFF"
    },
    {
      "team_id": "georgia",
      "name": "Georgia Bulldogs", 
      "conference": "SEC",
      "division": "East",
      "logo_url": "https://example.com/logos/georgia.png",
      "primary_color": "#BA0C2F",
      "secondary_color": "#000000"
    }
  ]
}
```

### games.json
```json
{
  "games": [
    {
      "game_id": "2024-alabama-georgia",
      "home_team_id": "georgia",
      "away_team_id": "alabama",
      "season": 2024,
      "week": 1,
      "date": "2024-09-07T19:00:00-05:00",
      "status": "scheduled",
      "home_score": null,
      "away_score": null,
      "venue": "Sanford Stadium",
      "city": "Athens, GA"
    }
  ]
}
```

### team_game_stats.json
```json
{
  "team_game_stats": [
    {
      "game_id": "2024-alabama-georgia",
      "team_id": "alabama",
      "offensive_stats": {
        "points": 28,
        "total_yards": 450,
        "passing_yards": 320,
        "rushing_yards": 130,
        "turnovers": 1,
        "third_down_conversions": 8,
        "third_down_attempts": 15
      },
      "defensive_stats": {
        "points_allowed": 21,
        "yards_allowed": 380,
        "sacks": 3,
        "interceptions": 1,
        "fumbles_recovered": 0
      },
      "special_teams": {
        "field_goals_made": 2,
        "field_goals_attempted": 3,
        "punt_returns": 2,
        "kick_returns": 3
      }
    }
  ]
}
```

### recruiting.json
```json
{
  "recruiting": [
    {
      "team_id": "alabama",
      "season": 2024,
      "class_rank": 2,
      "avg_rating": 92.5,
      "commit_count": 25,
      "five_stars": 3,
      "four_stars": 15,
      "three_stars": 7,
      "top_players": [
        {
          "name": "Julian Sayin",
          "position": "QB",
          "rating": 95,
          "stars": 5
        }
      ]
    }
  ]
}
```

### market_lines.json
```json
{
  "market_lines": [
    {
      "game_id": "2024-alabama-georgia",
      "line_type": "spread",
      "line_value": -3.5,
      "timestamp": "2024-09-07T12:00:00-05:00",
      "source": "draftkings",
      "closing_line": -4.0
    },
    {
      "game_id": "2024-alabama-georgia", 
      "line_type": "total",
      "line_value": 52.5,
      "timestamp": "2024-09-07T12:00:00-05:00",
      "source": "draftkings",
      "closing_line": 51.5
    }
  ]
}
```

## UI Rendering Requirements

### Home Page Fields
- Team names and logos
- Game dates and times
- Implied vs market spreads
- Edge confidence tiers (A/B/C)
- Recent team performance

### Game Detail Page Fields
- Team power ratings
- Implied spread/total calculations
- Market line comparison
- Historical matchup data
- Weather conditions (if available)

### Teams Page Fields
- Team power ratings
- Recent game results
- Recruiting rankings
- Conference standings
- Season statistics

### Review Past Weeks Fields
- Weekly P/L summary
- Hit rate by confidence tier
- CLV analysis
- Strategy performance
- As-of state preservation

## Data Quality Requirements

### Completeness
- All required fields populated
- No null values for critical data
- Consistent data types
- Proper timestamp formatting

### Accuracy
- Realistic statistical values
- Consistent team identifiers
- Proper game relationships
- Valid market line formats

### Usability
- Data supports all planned UI pages
- Sufficient variety for testing
- Edge cases represented
- Performance data included
