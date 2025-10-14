# Visual Crossing Weather Adapter

The Visual Crossing adapter fetches game-time weather data for college football games using the Visual Crossing Timeline API.

## Overview

- **Provider**: `weather-vc`
- **Adapter Class**: `VisualCrossingAdapter`
- **Purpose**: Fetch hourly weather data for game locations at kickoff time
- **Database Writes**: None (logs only, no weather table exists yet)

## Configuration

### Environment Variables

Required:
- `VISUALCROSSING_API_KEY` - Your Visual Crossing API key ([Get one here](https://www.visualcrossing.com))

### datasources.yml

```yaml
weatherVc:
  provider: "weather-vc"
  enabled: true
  config:
    baseUrl: "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline"
    units: "us"      # 'us' = Fahrenheit, mph
    include: "hours" # Get hourly data along the game time
    timeoutMs: 20000
```

## Usage

### CLI Command

```bash
npm run ingest -- weatherVc --season 2024 --weeks 1
```

### Example Output

```
🚀 Starting data ingestion...
   Adapter: weatherVc
   Season: 2024
   Weeks: 1
✅ Using adapter: VisualCrossing

⛅ Fetching weather for 11 games...

weather-vc: 2024 wk1 georgia-clemson @ 19:00 → temp 78°F, wind 12 mph, precipProb 10%
weather-vc: 2024 wk1 alabama-texas @ 15:30 → temp 92°F, wind 8 mph, precipProb 5%
⚠️  2024 wk1 notre-dame-usc → No city/state, skipped

✅ Weather fetch complete: 10 fetched, 1 skipped, 0 errors
```

## How It Works

1. **Queries Database**: Fetches games for specified season/weeks from the database
2. **Location Lookup**: Uses game `city` field as location (state from home team if available)
3. **API Call**: Calls Visual Crossing Timeline API for each game's date and location
4. **Hour Selection**: Finds the hourly weather closest to kickoff time
5. **Logging**: Prints concise summary line per game with temp, wind, and precipitation probability
6. **Error Handling**: Gracefully handles missing data, API errors, and timeouts

## Data Flow

```
Database (games) 
  → For each game: 
    → Build URL: {baseUrl}/{city}/{YYYY-MM-DD}?key={API_KEY}
    → Fetch hourly weather from Visual Crossing
    → Find hour closest to kickoff
    → Log: "weather-vc: {season} wk{week} {away}-{home} @ {time} → temp {T}°F, wind {W} mph, precipProb {P}%"
```

## API Details

### Endpoint Pattern

```
GET https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/{location}/{date}
  ?key={API_KEY}
  &include=hours
  &unitGroup=us
```

### Response Structure (Simplified)

```json
{
  "days": [
    {
      "datetime": "2024-09-07",
      "hours": [
        {
          "datetime": "19:00:00",
          "temp": 78.2,
          "windspeed": 12.3,
          "precipprob": 10,
          "humidity": 65,
          "conditions": "Partly cloudy"
        }
      ]
    }
  ]
}
```

## Limitations & Notes

1. **No Database Writes**: This adapter only logs weather data. It does not write to any table (no weather table exists in schema yet).

2. **Requires Existing Games**: Games must already exist in the database (run `mock` or `cfbd` adapter first).

3. **City Required**: Games without a `city` field are skipped with a warning.

4. **Timezone Handling**: Currently uses UTC for simplicity. In production, you may want to use the venue's local timezone.

5. **Rate Limiting**: Includes a 100ms delay between requests to avoid hitting API rate limits.

6. **Graceful Failures**: If weather data is unavailable for a game, it logs a warning and continues with the next game.

## Error Handling

The adapter handles these scenarios gracefully:

- **Missing API Key**: Throws clear error at initialization
- **Missing City**: Logs warning, skips game
- **API Timeout**: Logs error for that game, continues
- **API Error (4xx/5xx)**: Returns null, logs "unavailable"
- **No Hourly Data**: Logs "unavailable"

## GitHub Actions Integration

The `weather-daily.yml` workflow runs this adapter automatically:

```yaml
name: Weather Daily
on:
  schedule:
    - cron: '0 8 * * *'  # 8:00 UTC daily
  workflow_dispatch:

jobs:
  weather:
    runs-on: ubuntu-latest
    env:
      VISUALCROSSING_API_KEY: ${{ secrets.VISUALCROSSING_API_KEY }}
    steps:
      - run: npm run ingest -- weatherVc --season 2024 --weeks 1
```

## Future Enhancements

1. **Database Table**: Add a `weather` or `game_weather` table to persist the data
2. **Timezone Support**: Use venue timezone instead of UTC
3. **Forecast Updates**: Fetch weather multiple times as game approaches
4. **Historical Data**: Store weather snapshots at different times (7 days out, 3 days out, game day)
5. **Additional Metrics**: Capture more fields (feels like temp, visibility, cloud cover, etc.)
6. **State Field**: Use home team's state if game record doesn't have state field

## API Key Setup

1. Sign up at [Visual Crossing](https://www.visualcrossing.com)
2. Get your free API key (500 requests/day on free tier)
3. Add to `.env`:
   ```
   VISUALCROSSING_API_KEY=your_key_here
   ```
4. Add to GitHub Secrets: `VISUALCROSSING_API_KEY`
5. Add to Vercel Environment Variables (if needed)

## Related Files

- `apps/jobs/adapters/VisualCrossingAdapter.ts` - Adapter implementation
- `apps/jobs/adapters/VisualCrossingAdapter.js` - Compiled JavaScript
- `apps/jobs/adapters/AdapterFactory.ts` - Factory registration
- `datasources.yml` - Configuration
- `.github/workflows/weather-daily.yml` - Automation workflow

