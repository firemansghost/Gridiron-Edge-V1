# Injury Data Integration

## Overview

Injury data is automatically populated from ESPN's unofficial API endpoint. This eliminates the need for manual CLI entry and keeps injury information up-to-date.

## Data Source: ESPN API

**Endpoint:** `https://site.api.espn.com/apis/site/v2/sports/football/college-football/injuries`

**Status:** Unofficial API (not officially documented)

**Authentication:** None required (public endpoint)

**Important Notes:**
- ⚠️ This is an unofficial API and may change without notice
- Use responsibly - implement error handling for API changes
- Rate limiting: Unknown (no documented limits, but be respectful)

### Why ESPN?

- **CFBD**: ❌ Does NOT provide injury data endpoints (verified at https://apinext.collegefootballdata.com/)
- **ESPN**: ✅ Provides comprehensive injury data with player names, positions, and severity
- **Other APIs**: SportsDataIO and similar services are primarily NFL-focused and require paid subscriptions

## How It Works

### 1. Data Fetching

The `ESPNInjuryAdapter` fetches all injury data from ESPN's endpoint. The API returns:
- All teams with injury reports
- For each team: list of injured players
- For each player: status, position, injury details, notes

### 2. Team Mapping

ESPN uses team display names (e.g., "Arkansas Razorbacks") which are mapped to our database team IDs using `TeamResolver`:
- Uses existing team alias system
- Falls back to fuzzy matching if exact match not found
- Logs warnings for teams that can't be resolved

### 3. Status Mapping

ESPN status values are mapped to our `InjurySeverity` enum:

| ESPN Status | Our Severity | Meaning |
|-------------|--------------|---------|
| "Active" | N/A (skipped) | Player is healthy/playing |
| "Out" | `OUT` | Player will not play |
| "Questionable" | `QUESTIONABLE` | Player may or may not play |
| "Probable" | `PROBABLE` | Player is likely to play |
| "Doubtful" | `DOUBTFUL` | Player unlikely to play |

### 4. Position Mapping

ESPN position abbreviations are mapped to our position format:

| ESPN Position | Our Position | Notes |
|---------------|--------------|-------|
| QB | QB | Quarterback |
| RB, FB | RB | Running Back, Fullback |
| WR | WR | Wide Receiver |
| TE | WR | Tight End (receiving position) |
| OL, C, G, T | OL | Offensive Line |
| DL, DE, DT, NT | DL | Defensive Line |
| LB | DL | Linebacker (front seven) |
| DB, CB, S | DB | Defensive Back |
| K, P | DB | Special teams (defensive positions group) |

### 5. Injury Details Extraction

The adapter extracts additional details from injury notes/comments:
- **Body Part**: Parsed from notes (knee, shoulder, ankle, etc.)
- **Injury Type**: Parsed from notes (ACL, MCL, concussion, etc.)
- **Status Text**: Full injury description from notes

### 6. Database Upsert

For each injury:
- Finds matching game(s) for the team in specified weeks
- Checks if injury already exists (by game + team + position + player name)
- Updates existing record or creates new one
- Sets `source: 'espn'` to track data origin

## Usage

### Automatic (Nightly Workflow)

The `ingest-injuries` job runs automatically in the nightly workflow:
1. Runs after `ingest-schedules`
2. Processes current week
3. Fetches all injuries from ESPN
4. Maps to database games
5. Upserts injury records

### Manual Execution

```bash
# Build first
npm run build:jobs

# Run for specific week(s)
node apps/jobs/dist/ingest.js espn-injuries --season 2025 --weeks 9

# Run for multiple weeks
node apps/jobs/dist/ingest.js espn-injuries --season 2025 --weeks 9,10,11
```

## Output Example

```
🏥 Fetching injury data from ESPN for season 2025...

   Found 134 teams with injury reports
   Found 65 games to process

✅ Injury fetch complete:
   Processed: 247 injuries
   Upserted: 312 injury records (multiple games per team)
   Skipped: 89 (Active/healthy players)
   Errors: 0
```

## Data Quality

### Coverage

- ✅ Player names from ESPN
- ✅ Position information
- ✅ Injury severity (OUT, QUESTIONABLE, etc.)
- ✅ Injury details extracted from notes
- ✅ Reported dates
- ⚠️ Some injuries may not have detailed body part/type information

### Limitations

1. **Team Mapping**: Some ESPN team names may not resolve to database teams
   - Solution: Add aliases to `team_aliases.yml` or `team_aliases_cfbd.yml`

2. **Position Mapping**: Non-standard positions may not map correctly
   - Solution: Update `mapESPNPosition()` function as needed

3. **API Changes**: ESPN API structure may change
   - Solution: Monitor error logs, update adapter as needed

4. **Active Players**: Players with "Active" status are skipped
   - This is intentional - only injured players are stored

## Viewing Injury Data

Injury data appears on game detail pages:
1. Navigate to any game: `/game/{gameId}`
2. Scroll to "Injuries" section (below Weather section)
3. See injury reports with:
   - Team name
   - Player name and position
   - Severity badge (color-coded)
   - Body part and injury type (if available)
   - Status text from ESPN

## Manual Overrides

You can still manually add/edit injuries using the CLI tool:

```bash
node apps/jobs/dist/src/injuries/manual_injury_etl.js add \
  --game-id <gameId> \
  --team-id <teamId> \
  --position QB \
  --severity OUT \
  --player-name "John Smith" \
  --body-part "Knee" \
  --injury-type "ACL"
```

Manual entries will have `source: 'manual'` and can coexist with ESPN data.

## Future Enhancements

1. **Web UI**: Add injury entry/edit form on game detail pages
2. **API Monitoring**: Alert if ESPN API changes structure
3. **Data Validation**: Verify injury data freshness
4. **Multiple Sources**: Add other injury data sources if available
5. **Historical Data**: Fetch historical injury data for backtesting

## Troubleshooting

### No injuries showing on game pages

1. **Check workflow logs**: Verify `ingest-injuries` job ran successfully
2. **Check team mapping**: Look for "Could not resolve team" warnings in logs
3. **Verify games exist**: Injury data only shows for games in database
4. **Check week**: Injuries are filtered by week - ensure correct week selected

### Team mapping failures

If you see: `⚠️  Could not resolve team: {TeamName}`

1. Check if team exists in database
2. Add alias mapping:
   ```yaml
   # In team_aliases.yml or team_aliases_cfbd.yml
   "{TeamName}": database-team-id
   ```
3. Rebuild and re-run ingestion

### API errors

If ESPN API returns errors:
1. Check if endpoint still works: `curl https://site.api.espn.com/apis/site/v2/sports/football/college-football/injuries`
2. Verify response structure hasn't changed
3. Update adapter if structure changed
4. Consider implementing retry logic with exponential backoff

## References

- ESPN Injuries Endpoint: https://site.api.espn.com/apis/site/v2/sports/football/college-football/injuries
- CFBD API Docs: https://apinext.collegefootballdata.com/ (confirmed no injury endpoints)

