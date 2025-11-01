# Workflow Comparison & Consolidation

## Comparison Results

### 1. Odds Backfill Workflows

#### `backfill-odds.yml` (DELETE)
- **Uses**: `npm run backfill:oddsapi` (older script)
- **Features**: 
  - Season range (seasonFrom-seasonTo)
  - Week range
  - Dry run
- **Limitations**: Simpler, uses older script

#### `backfill-odds-historical.yml` (KEEP)
- **Uses**: `node apps/jobs/dist/ingest-minimal.js oddsapi` (newer script)
- **Features**: 
  - Single season (more precise)
  - Week range
  - Markets selection (spreads, totals, etc.)
  - Regions selection
  - Credits limit
  - Dry run
  - Historical strict mode
  - Season fallback
  - Max events (testing)
  - Concurrency control
  - Artifact uploads
- **Advantages**: More features, uses newer script, better validation

**Decision**: ✅ **Delete `backfill-odds.yml`**, keep `backfill-odds-historical.yml`

---

### 2. Stats Workflows

#### `stats-cfbd.yml` (PER-GAME STATS)
- **Runs**: `cfbd_team_stats.js`
- **Table**: `team_game_stats` (one row per team per game)
- **Purpose**: Fetches per-game statistics
- **Data**: Game-by-game breakdown (yards, plays, YPP per game)
- **Use case**: Detailed game analysis, game-level features
- **Auto-run**: ⚠️ Currently enabled (nightly at 2 AM UTC)

#### `stats-season-cfbd.yml` (SEASON STATS)
- **Runs**: `cfbd_team_season_stats.js`
- **Table**: `team_season_stats` (one row per team per season)
- **Purpose**: Fetches season-level aggregated statistics
- **Data**: Season totals/averages (YPP for season, pace for season)
- **Use case**: Ratings calculations, season-level analysis
- **Auto-run**: ✅ Currently enabled (nightly at 2 AM UTC)

**Difference**:
- **Per-game stats** (`stats-cfbd.yml`): Individual game statistics - useful for game-level analysis, but not used by ratings
- **Season stats** (`stats-season-cfbd.yml`): Aggregated season statistics - **required for ratings calculations**

**Decision**: ⚠️ **Disable auto-run for `stats-cfbd.yml`** (keep for manual use), ✅ **Keep auto-run for `stats-season-cfbd.yml`**

**Reasoning**: 
- Ratings system uses `team_season_stats`, not `team_game_stats`
- Per-game stats might be useful for future analysis, but not needed daily
- Running both nightly wastes resources and API credits

---

## Actions to Take

1. ✅ Delete `backfill-odds.yml` (superseded by historical version)
2. ✅ Delete `monitor-2025-archival.yml` (user confirmed not needed)
3. ✅ Delete `odds-poll-3x.yml` (redundant with nightly-ingest)
4. ✅ Delete `weather-daily.yml` (not implemented)
5. ✅ Delete `odds-one-week.yml` (test workflow)
6. ⚠️ Disable auto-run for `stats-cfbd.yml` (keep for manual use)
7. ✅ Keep `backfill-odds-historical.yml` (better version)
8. ✅ Keep `stats-season-cfbd.yml` (required for ratings)

