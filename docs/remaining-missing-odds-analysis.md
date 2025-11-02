# Analysis: Remaining 8 FBS Games Without Odds

## Status Update
- ✅ **Fixed**: 3 games now have odds after denylist/alias fixes:
  - Delaware @ Liberty
  - Florida International @ Missouri State  
  - New Mexico @ UNLV

- ❌ **Still Missing**: 8 FBS games without odds

## The Remaining 8 Games

1. **UTEP @ Kennesaw State** (Oct 29, 7:00 PM CT)
   - Both teams have aliases in config
   - Possible issue: Date matching (Oct 29 might be Week 9 in some systems)

2. **Marshall @ Coastal Carolina** (Oct 30, 6:30 PM CT)
   - Both teams should have aliases
   - Possible issue: Smaller conference, limited bookmaker coverage

3. **Army @ Air Force** (Nov 1, 11:00 AM CT)
   - Service Academy rivalry - should definitely have odds!
   - Both teams have aliases ("Army", "Air Force")
   - Possible issue: Service academy games sometimes have different scheduling/timing

4. **East Carolina @ Temple** (Nov 1, 1:00 PM CT)
   - Both teams should have aliases
   - Possible issue: Smaller conferences, limited coverage

5. **New Mexico State @ Western Kentucky** (Nov 1, 2:30 PM CT)
   - Both teams should have aliases
   - "Western Kentucky Hilltoppers" vs "Western Kentucky" name variation possible

6. **Indiana @ Maryland** (Nov 1, 2:30 PM CT)
   - Big Ten game - should have odds!
   - Both teams should have aliases
   - Possible issue: Name matching or date mismatch

7. **Wake Forest @ Florida State** (Nov 1, 6:30 PM CT)
   - ACC game - major conference, should have odds!
   - Both teams have aliases ("Wake Forest", "Florida State Seminoles")
   - Possible issue: "Florida State Seminoles" vs "Florida State" variation

8. **Washington State @ Oregon State** (Nov 1, 6:30 PM CT)
   - Both teams have aliases ("Washington State", "Oregon State")
   - Possible issue: Name matching or API availability

## Potential Issues

### 1. Date/Time Matching Problems
- The game dates in the database might not match Odds API event times
- Week boundaries can cause issues (games might be listed in different weeks)
- Early morning/late night games might have timezone conversion issues

### 2. Team Name Variations
Odds API might use different names:
- "Florida State Seminoles" vs "Florida State"
- "Western Kentucky Hilltoppers" vs "Western Kentucky" vs "WKU"
- Service academies might use "Army Black Knights", "Air Force Falcons"

### 3. API Availability
Some games might genuinely not be available in Odds API:
- Smaller conferences may have limited bookmaker coverage
- Some games might be excluded from free tier
- Regional games might have different coverage

### 4. Workflow Timing
- The workflow might have run before the denylist fixes were applied
- Need to re-run odds ingestion to pick up the fixed aliases

## Recommended Next Steps

1. **Re-run Odds Ingestion** for Week 10 to apply the denylist/alias fixes
2. **Review Workflow Logs** to see matching attempts for these 8 games
3. **Check Odds API Directly** to verify if these games are available
4. **Add Additional Aliases** if name variations are found
5. **Improve Date Matching** for service academy games (they sometimes have unusual scheduling)

## Action Items

- [ ] Re-run "Nightly Ingest + Ratings" workflow for Week 10
- [ ] Check workflow logs for "COULD_NOT_RESOLVE_TEAMS" or "RESOLVED_TEAMS_BUT_NO_GAME" messages
- [ ] Review unmatched teams report if available
- [ ] Add aliases for common variations (WKU, FSU abbreviations, etc.)
- [ ] Check if service academy games need special date matching logic

