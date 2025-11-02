# Odds Coverage Investigation - Week 10

## Summary
Analysis of why many games are missing odds data for Week 10, Season 2025.

## Key Findings

### 1. FBS Status Breakdown
- **Both FBS teams**: 50 games total
  - ✅ **39 games WITH odds** (78%)
  - ❌ **11 games WITHOUT odds** (22%)
  
- **One FBS team**: 2 games (both without odds)
  
- **Neither FBS**: 252 games (all without odds)

### 2. The Real Issue
**Only 50 out of 304 games are FBS vs FBS matchups.** The other 254 games are:
- FBS vs FCS (2 games) - These typically don't have betting odds
- Non-FBS games (252 games) - These definitely don't have betting odds

### 3. FBS Games Missing Odds (11 games)
These are legitimate FBS matchups that should have odds but don't:

1. **UTEP @ Kennesaw State** (Oct 29) - Conference game
2. **Florida International @ Missouri State** (Oct 30) - Conference game
3. **Marshall @ Coastal Carolina** (Oct 30, 6:30 PM) - Conference game
4. **Army @ Air Force** (Nov 1, 11:00 AM) - Non-conference (rivalry game, should have odds!)
5. **East Carolina @ Temple** (Nov 1, 1:00 PM) - Conference game
6. **New Mexico @ UNLV** (Nov 1, 2:00 PM) - Conference game
7. **Delaware @ Liberty** (Nov 1, 2:30 PM) - Conference game
8. **Indiana @ Maryland** (Nov 1, 2:30 PM) - Conference game (Big Ten!)
9. **New Mexico State @ Western Kentucky** (Nov 1, 2:30 PM) - Conference game
10. **Wake Forest @ Florida State** (Nov 1, 6:30 PM) - Conference game (ACC!)
11. **Washington State @ Oregon State** (Nov 1, 6:30 PM) - Conference game

### 4. Conference Analysis
- **Independent vs Independent**: 42 games (33 with odds, 9 without)
- Most missing odds are conference games involving smaller conferences
- Some notable missing games:
  - Army @ Air Force (Service Academy rivalry - should definitely have odds!)
  - Wake Forest @ Florida State (ACC - major conference)
  - Indiana @ Maryland (Big Ten - major conference)

### 5. Possible Reasons

#### A. Team Name Matching Issues
Some team names might not match between our database and Odds API:
- Delaware (may be confused with Delaware State)
- Missouri State (may not be recognized as FBS)
- Kennesaw State (recent FBS transition?)

#### B. Timing Issues
- Some games may have been played before odds were fetched
- Odds API may not provide lines for all games immediately
- Service academy games sometimes have different coverage

#### C. API Limitations
- Odds API may not cover all FBS games
- Some conferences/games may have limited bookmaker coverage
- Free tier of Odds API may have restricted access

## Recommendations

### Immediate Actions

1. **Check Odds API directly** for these 11 missing FBS games
   - Verify if they're available in the API
   - Check team name variations that might be causing match failures

2. **Review Odds API Adapter logs** from the last ingestion
   - Look for "Team matching failed" messages
   - Check for these specific teams in the logs

3. **Add team aliases** for teams that might be mismatched:
   - Delaware (ensure it's not matching Delaware State)
   - Missouri State
   - Kennesaw State

### Long-term Actions

1. **Filter UI to show only FBS vs FBS games** by default
   - Current UI shows 304 games (all games)
   - Should show 50 games (FBS vs FBS only)
   - This would make the "missing odds" problem much smaller (11 games instead of 265)

2. **Add diagnostic endpoint** to check odds availability for specific games

3. **Improve team matching** in Odds API adapter
   - Better fuzzy matching
   - Conference-aware matching
   - Logging of all failed matches

## Next Steps

1. Review Odds API adapter logs from the last ingestion run
2. Check if these 11 games are available in Odds API manually
3. Consider filtering the main slate to FBS-only games
4. Add better team aliases for the mismatched teams

