# Odds Ingestion Guide - Week 10

## Current Status

Based on the database query, Week 10 has many games missing odds data:
- **Friday (Oct 31)**: 46 games total (many missing odds)
- **Saturday (Nov 1)**: 251 games total (most missing odds)

## Running Odds Ingestion

### Prerequisites

1. **Environment Variables**: Ensure `ODDS_API_KEY` is set in your environment
2. **Database Access**: Ensure `DATABASE_URL` is configured

### Command to Run

```bash
node apps/jobs/ingest-simple.js oddsapi --season 2025 --weeks 10
```

This will:
1. Fetch odds from The Odds API for all games in Week 10
2. Match team names from Odds API to database team IDs
3. Match events to database games by date/teams
4. Insert market lines (spreads, totals, moneylines) into the database

### Expected Results

- The adapter will attempt to match all events from Odds API to database games
- Games that match will have market lines inserted
- Games that don't match (due to team name mismatches or missing games) will be logged

### Monitoring Progress

The script will log:
- Number of events fetched from Odds API
- Number of games successfully matched
- Number of market lines inserted
- Any unmatched events (team name resolution failures)

### After Ingestion

Check results:
```sql
SELECT 
  DATE(g.date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago') as local_date,
  COUNT(*) FILTER (WHERE ml.id IS NOT NULL) as games_with_odds,
  COUNT(*) FILTER (WHERE ml.id IS NULL) as games_missing_odds,
  COUNT(*) as total_games
FROM games g
LEFT JOIN market_lines ml ON ml.game_id = g.id AND ml.source = 'oddsapi'
WHERE g.season = 2025 AND g.week = 10
GROUP BY DATE(g.date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')
ORDER BY local_date;
```

## Troubleshooting

### Games Still Missing Odds

If games are still missing odds after ingestion:

1. **Team Name Mismatches**: Check if team names from Odds API match database names
   - Check logs for "unmatched teams"
   - May need to add aliases to `apps/jobs/config/team_aliases.yml`

2. **Date Mismatches**: Odds API events may not match game dates
   - The adapter tries ±2 days, then ±6 days for matching
   - Check logs for "RESOLVED_TEAMS_BUT_NO_GAME"

3. **Non-FBS Games**: Some games may not be available in Odds API
   - FCS and lower division games may not have odds
   - These will remain without odds

4. **API Rate Limits**: Check if Odds API quota is exhausted
   - Check response headers for `x-requests-remaining`

### Increasing Match Rate

To improve matching:
- Add team aliases to `apps/jobs/config/team_aliases.yml`
- Ensure all games in database have correct team IDs
- Check that game dates in database are accurate

