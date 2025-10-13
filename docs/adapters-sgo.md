# SportsGameOdds (SGO) Adapter

## Overview

The SportsGameOdds adapter fetches real-time NCAAF spreads and totals from the SportsGameOdds API.

**Important:** This adapter only provides odds/lines. It does NOT provide schedules or team data. You must run another adapter (like `mock` or `cfbd`) first to populate games and teams.

## Setup

### 1. Get API Key

Sign up at [SportsGameOdds.com](https://sportsgameodds.com) and get your API key.

### 2. Configure Environment

Add to your `.env` file:

```bash
SGO_API_KEY=your_api_key_here
SGO_BASE_URL=https://api.sportsgameodds.com/v2  # Optional, defaults to config
```

### 3. Enable Adapter

In `datasources.yml`:

```yaml
sgo:
  provider: "sgo"
  enabled: true  # Set to true
  config:
    baseUrl: "https://api.sportsgameodds.com/v2"
    league: "NCAAF"
    books:
      - consensus
      - pinnacle
      - draftkings
      - fanduel
    timeoutMs: 20000
```

## Usage

### Basic Usage

```bash
# First, ingest schedules from another source
npm run ingest -- mock --season 2024 --weeks 1

# Then fetch odds from SGO
npm run ingest -- sgo --season 2024 --weeks 1
```

### What It Does

1. Fetches odds for the specified season and week(s)
2. Matches odds to existing games in the database
3. Inserts market lines for each book and market type (spread, total)
4. Logs summary: "Upserted X spreads, Y totals (sgo)"

### What Gets Inserted

For each game and book, the adapter creates `market_lines` rows with:

- `gameId` - Matched from existing games table
- `season` - Season year
- `week` - Week number
- `lineType` - "spread" or "total"
- `lineValue` - The line value (spread or total points)
- `closingLine` - Same as lineValue (SGO may not distinguish opening/closing)
- `timestamp` - API update time or current time
- `bookName` - Book name (e.g., "pinnacle", "draftkings")
- `source` - "sgo"

## Configuration

### Books Filter

The `books` array in `datasources.yml` filters which bookmakers to ingest. If empty, all books are ingested.

Supported books:
- `consensus` - Consensus line
- `pinnacle` - Pinnacle
- `draftkings` - DraftKings
- `fanduel` - FanDuel
- `bovada` - Bovada
- `betmgm` - BetMGM
- `caesars` - Caesars

### Timeout

`timeoutMs` sets the request timeout in milliseconds (default: 20000 = 20 seconds).

## Error Handling

### Missing API Key

```
❌ SGO_API_KEY environment variable is required for SportsGameOdds adapter.
Get your API key from https://sportsgameodds.com and add it to your .env file.
```

**Fix:** Add `SGO_API_KEY` to your `.env` file.

### Game Not Found

If the adapter can't match a game from the API to your database:

```
⚠️  Skipping game with missing teams: {...}
```

**Fix:** Ensure you've run another adapter (mock/cfbd) first to populate games.

### API Error

```
❌ Error fetching SGO odds for week 1: SGO API error: 401 Unauthorized
```

**Fix:** Check your API key is valid and has sufficient credits.

## API Response Format

The adapter expects SGO API responses in this format:

```json
[
  {
    "game_id": "...",
    "home_team": "Alabama",
    "away_team": "Georgia",
    "commence_time": "2024-09-07T19:00:00Z",
    "bookmakers": [
      {
        "key": "draftkings",
        "title": "DraftKings",
        "markets": [
          {
            "key": "spreads",
            "outcomes": [
              {
                "name": "Alabama",
                "point": -7.5
              },
              {
                "name": "Georgia",
                "point": 7.5
              }
            ]
          },
          {
            "key": "totals",
            "outcomes": [
              {
                "name": "Over",
                "point": 52.5
              },
              {
                "name": "Under",
                "point": 52.5
              }
            ]
          }
        ]
      }
    ]
  }
]
```

## Limitations

1. **No schedules** - Must use another adapter for game schedules
2. **No team data** - Must use another adapter for team rosters
3. **Game matching** - Games are matched by team names (normalized to IDs)
4. **Opening vs Closing** - SGO may not distinguish between opening and closing lines; adapter uses the same value for both

## Workflow Example

```bash
# Step 1: Ingest schedules and teams (mock data)
npm run ingest -- mock --season 2024 --weeks 1

# Step 2: Fetch real odds from SGO
npm run ingest -- sgo --season 2024 --weeks 1

# Step 3: Run ratings and implied lines
npm run seed:ratings

# Result: Your database now has:
# - Games (from mock)
# - Teams (from mock)
# - Market lines (from SGO - real odds!)
# - Power ratings (calculated)
# - Matchup outputs (calculated)
```

## Troubleshooting

### No lines inserted

**Check:**
1. Games exist in database for that season/week
2. Team names from SGO match your team IDs (normalized)
3. API key is valid
4. SGO has data for that week

### Duplicate lines

The adapter creates new rows for each ingestion. If you run it multiple times, you'll get duplicate lines with different timestamps. This is by design - you can track line movement over time.

To avoid duplicates, clear old lines before re-ingesting:

```sql
DELETE FROM market_lines WHERE source = 'sgo' AND season = 2024 AND week = 1;
```

## Next Steps

- Implement CFBD adapter for real schedules
- Add line movement tracking
- Add opening vs closing line distinction
- Add more bookmakers

