# Investigation: 11 Missing FBS Games Without Odds

## Problem
11 legitimate FBS vs FBS games in Week 10 are missing betting odds.

## Games Missing Odds

1. **UTEP @ Kennesaw State** (Oct 29, 7:00 PM CT)
2. **Florida International @ Missouri State** (Oct 30, 7:00 PM CT)
3. **Marshall @ Coastal Carolina** (Oct 30, 6:30 PM CT)
4. **Army @ Air Force** (Nov 1, 11:00 AM CT) - Service Academy rivalry
5. **East Carolina @ Temple** (Nov 1, 1:00 PM CT)
6. **New Mexico @ UNLV** (Nov 1, 2:00 PM CT)
7. **Delaware @ Liberty** (Nov 1, 2:30 PM CT)
8. **Indiana @ Maryland** (Nov 1, 2:30 PM CT) - Big Ten
9. **New Mexico State @ Western Kentucky** (Nov 1, 2:30 PM CT)
10. **Wake Forest @ Florida State** (Nov 1, 6:30 PM CT) - ACC
11. **Washington State @ Oregon State** (Nov 1, 6:30 PM CT)

## Potential Issues

### 1. Team Name Matching
Some teams might have different names in Odds API:
- **Delaware** - Might be "Delaware Blue Hens" in Odds API (but "Delaware Blue Hens" is in denylist!)
- **Missouri State** - Might be "Missouri State Bears" in Odds API (also in denylist!)
- **Kennesaw State** - New FBS team, might have different naming
- **UTEP** - Might be listed as "UTEP Miners" or just "UTEP"
- **UNLV** - Might be "UNLV Rebels" or "Nevada-Las Vegas"

### 2. Date/Time Mismatch
The game dates might not match Odds API event times:
- Service academy games sometimes have different scheduling
- Some games might be listed with different times
- Week boundary issues (games might be in Week 9 in Odds API but Week 10 in CFBD)

### 3. API Availability
Some games might not be available in Odds API:
- Smaller conference games
- Games with limited bookmaker coverage
- Free tier limitations

### 4. Denylist Issue
**Critical Finding**: 
- "Delaware Blue Hens" is in the denylist (line 235 of team_aliases.yml)
- "Missouri State Bears" is in the denylist (line 236 of team_aliases.yml)

This means if Odds API returns "Delaware Blue Hens", it will be **rejected** even though "Delaware" is a valid FBS team!

## Recommended Fixes

### Immediate Actions

1. **Review Denylist** - Remove or refine entries that might block valid FBS teams:
   - "Delaware Blue Hens" should allow mapping to "delaware" (FBS)
   - "Missouri State Bears" should allow mapping to "missouri-state" if it's FBS

2. **Add Team Aliases** for missing games:
   ```yaml
   "Delaware Blue Hens": delaware  # If Delaware is FBS
   "Missouri State Bears": missouri-state  # If Missouri State is FBS
   "UNLV Rebels": unlv
   "Nevada-Las Vegas": unlv
   "UTEP Miners": utep
   ```

3. **Check Workflow Logs** from last ingestion for:
   - "COULD_NOT_RESOLVE_TEAMS" messages for these specific games
   - "RESOLVED_TEAMS_BUT_NO_GAME" messages (teams matched but game didn't)
   - Unmatched team names report

4. **Manual Verification** - Check Odds API directly to see:
   - What team names they use for these games
   - Whether the games are available in their API
   - Whether the dates/times match

### Long-term Improvements

1. **Better Logging** - Add specific logging for each missing game with:
   - Team name resolution attempts
   - Date matching attempts
   - Final reason for failure

2. **Diagnostic Endpoint** - Create API endpoint to check odds availability:
   - `/api/diagnostics/odds/game/:gameId`
   - Shows team matching attempts
   - Shows date matching attempts
   - Shows what Odds API returns for this matchup

3. **Fallback Matching** - Improve date matching window:
   - Currently ±2 days, expand to ±6 days for service academy games
   - Handle week boundary crossovers better

## Next Steps

1. Check the workflow logs from the last Odds API ingestion
2. Review and fix denylist entries
3. Add missing team aliases
4. Re-run odds ingestion
5. Verify these 11 games now have odds

