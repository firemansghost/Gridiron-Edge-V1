# CollegeFootballData (CFBD) Adapter

The CFBD adapter fetches real NCAAF schedules from the CollegeFootballData API, providing accurate venue, city, and game details.

## Overview

- **Provider**: `cfbd`
- **Adapter Class**: `CFBDAdapter`
- **Purpose**: Fetch real college football schedules with venue/location details
- **Data Provided**: Schedules only (no odds or weather)

## Configuration

### Environment Variables

Required:
- `CFBD_API_KEY` - Your CollegeFootballData API key ([Get one here](https://collegefootballdata.com))

Optional:
- `CFBD_BASE_URL` - API base URL (defaults to `https://api.collegefootballdata.com`)

### datasources.yml

```yaml
cfbd:
  provider: "cfbd"
  enabled: true
  config:
    baseUrl: "https://api.collegefootballdata.com"
    division: "fbs"  # fbs, fcs, ii, iii
    timeoutMs: 20000
```

## Usage

### CLI Command

```bash
npm run ingest -- cfbd --season 2024 --weeks 1
```

### Example Output

```
🚀 Starting data ingestion...
   Adapter: cfbd
   Season: 2024
   Weeks: 1
✅ Using adapter: CollegeFootballData

📥 Fetching teams...
⚠️  CFBD adapter does not provide team data. Teams will be created from schedules.
   Found 0 teams

📥 Fetching schedules...
📥 Fetching CFBD schedules for 2024 Week 1...
   ✅ Found 65 games (cfbd)
   Found 65 games

📥 Fetching market lines...
⚠️  CFBD adapter does not provide market lines. Use SGO or another adapter for odds.
   Found 0 market lines

💾 Upserting teams...
   Upserted 0 teams
💾 Upserting games...
[Stubbed] Inserted missing team: georgia
[Stubbed] Inserted missing team: clemson
   ...
   Upserted 65 games
💾 Upserting market lines...
   Upserted 0 market lines

⏭️  Adapter has no getTeamBranding(); skipping branding step.

✅ Data ingestion completed successfully!
```

## How It Works

1. **API Call**: Fetches games from `/games` endpoint for specified season/week
2. **Venue Lookup**: Fetches venue details from `/venues` endpoint to get city/state
3. **Team Normalization**: Converts team names to slugified IDs (e.g., "Georgia" → "georgia")
4. **Game Mapping**: Creates Game objects with:
   - Stable game ID: `{season}-wk{week}-{awayTeam}-{homeTeam}`
   - Season, week, date
   - Home/away team IDs
   - Venue name, city
   - Neutral site flag
   - Conference game flag
   - Status (scheduled/final)
   - Scores (if game completed)

5. **Team Stubbing**: If teams don't exist, ingest.js creates stub records with normalized IDs

## Data Flow

```
CFBD API
  → Fetch games for season/week
  → Fetch venue details (city/state)
  → Map to Game interface
  → Normalize team names to IDs
  → Upsert games to database
  → Stub missing teams
```

## API Details

### Endpoints Used

**Games:**
```
GET https://api.collegefootballdata.com/games
  ?year={season}
  &week={week}
  &seasonType=regular
  &division={fbs|fcs|ii|iii}
```

**Venues:**
```
GET https://api.collegefootballdata.com/venues
```

### Authentication

Uses Bearer token authentication:
```
Authorization: Bearer {CFBD_API_KEY}
```

### Rate Limits

- Free tier: 200 requests/hour
- Paid tier: Higher limits available
- Adapter includes timeout protection (20s default)

## Game ID Format

Games are assigned stable IDs:
```
{season}-wk{week}-{awayTeamId}-{homeTeamId}
```

Example: `2024-wk1-clemson-georgia`

This ensures:
- Consistent IDs across ingestion runs
- Easy matching for odds/weather adapters
- Human-readable format

## Team ID Normalization

Team names are normalized to lowercase slugs:
- "Georgia" → "georgia"
- "Ohio State" → "ohio-state"
- "Miami (FL)" → "miami-fl"
- "Texas A&M" → "texas-a-m"

## Venue & Location Data

CFBD provides rich venue details:
- **Venue name**: "Sanford Stadium"
- **City**: "Athens"
- **State**: Not directly in Game model, but available in venue data
- **Capacity, grass/turf, dome**: Available but not currently stored

The `city` field is populated when venue details are found, enabling:
- Weather adapter to fetch game-time conditions
- Better game presentation in UI

## Error Handling

The adapter handles these scenarios gracefully:

- **Missing API Key**: Throws clear error at initialization
- **API Timeout**: Logs error, continues with next week
- **Invalid Response**: Logs error, skips malformed games
- **Missing Venue**: Uses venue name without city/state
- **Missing Teams**: Logs warning, lets ingest.js create stubs

## GitHub Actions Integration

### Nightly Ingest Workflow

```yaml
- name: Ingest schedules via CFBD (optional)
  if: ${{ env.CFBD_API_KEY != '' }}
  run: |
    echo "🗓️ Ingesting real schedules from CFBD..."
    npm run ingest -- cfbd --season 2024 --weeks 1
    echo "✅ CFBD schedules ingested"

- name: Fallback - Ensure mock schedules (if no CFBD key)
  if: ${{ env.CFBD_API_KEY == '' }}
  run: |
    echo "📥 Using mock data (no CFBD_API_KEY)..."
    npm run ingest -- mock --season 2024 --weeks 1
    echo "✅ Mock data ingest complete"
```

### Odds Poll Workflow

```yaml
- name: Ingest schedules via CFBD (optional)
  if: ${{ env.CFBD_API_KEY != '' }}
  run: npm run ingest -- cfbd --season 2024 --weeks 1

- name: Fallback - Ensure mock schedules (if no CFBD key)
  if: ${{ env.CFBD_API_KEY == '' }}
  run: npm run ingest -- mock --season 2024 --weeks 1

- name: Poll odds for current week
  run: npm run ingest -- sgo --season 2024 --weeks 1
```

## Recommended Workflow

**Full data ingestion with real data:**
```bash
# 1. Fetch real schedules from CFBD
npm run ingest -- cfbd --season 2024 --weeks 1

# 2. Fetch real odds from SGO
npm run ingest -- sgo --season 2024 --weeks 1

# 3. Fetch weather data
npm run ingest -- weatherVc --season 2024 --weeks 1

# 4. Calculate ratings
npm run seed:ratings

# 5. Verify data
npm run verify:ingest
```

## Troubleshooting

### "CFBD_API_KEY environment variable is required"
- Get API key from https://collegefootballdata.com
- Add to `.env`: `CFBD_API_KEY=your_key_here`
- Add to GitHub Secrets: `CFBD_API_KEY`

### "Request timeout"
- Check internet connection
- Verify CFBD API is operational
- Increase `timeoutMs` in datasources.yml

### "API error: 401 Unauthorized"
- Verify API key is correct
- Check if key has expired
- Ensure key is properly set in environment

### "API error: 429 Too Many Requests"
- You've hit rate limit (200/hour on free tier)
- Wait an hour or upgrade to paid tier
- Reduce frequency of ingestion runs

### No city/state in games
- Venue lookup may have failed
- Some venues may not have city data in CFBD
- Check CFBD API documentation for venue coverage

### Teams created as stubs
- This is expected behavior
- Teams are created with normalized IDs
- Use team branding file or another adapter to enrich team data

## API Key Setup

1. **Sign up** at [CollegeFootballData.com](https://collegefootballdata.com)
2. **Request API key** from your account dashboard
3. **Add to `.env`**:
   ```
   CFBD_API_KEY=your_key_here
   ```
4. **Add to GitHub Secrets**: Navigate to Settings → Secrets → Actions → New repository secret
   - Name: `CFBD_API_KEY`
   - Value: Your API key
5. **Add to Vercel** (if needed): Project Settings → Environment Variables

## Limitations

1. **No Team Data**: CFBD doesn't provide a simple teams endpoint. Teams are created from schedules.
2. **No Odds**: Use SGO or another adapter for betting lines.
3. **No Weather**: Use Visual Crossing adapter for weather data.
4. **Rate Limits**: Free tier limited to 200 requests/hour.
5. **Regular Season Only**: Currently configured for regular season games only.

## Future Enhancements

1. **Postseason Support**: Add seasonType parameter for bowl games, playoffs
2. **Team Roster Data**: Fetch team rosters and player stats
3. **Historical Data**: Bulk import multiple seasons
4. **Play-by-Play**: Integrate play-by-play data for advanced analytics
5. **Recruiting Data**: Add recruiting rankings and commits
6. **Coaching Data**: Track coaching changes and records

## Related Files

- `apps/jobs/adapters/CFBDAdapter.ts` - Adapter implementation
- `apps/jobs/adapters/CFBDAdapter.js` - Compiled JavaScript
- `apps/jobs/adapters/AdapterFactory.ts` - Factory registration
- `datasources.yml` - Configuration
- `.github/workflows/nightly-ingest.yml` - Nightly automation
- `.github/workflows/odds-poll-3x.yml` - Odds polling automation

## Resources

- [CFBD API Documentation](https://collegefootballdata.com/api/docs/)
- [CFBD GitHub](https://github.com/CFBD)
- [Rate Limits & Pricing](https://collegefootballdata.com/key)

