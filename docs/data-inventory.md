# Data Inventory & Feature Map

This document is the single source of truth for what data we store per team/season and how models use it.

---

## What this page is for

This page documents:
- **What data** we store for each team and season
- **Where it comes from** (data sources and ingestion workflows)
- **Which models and pages** use each data block
- **How to inspect** team data using the CLI tool

Use this as a reference when:
- Adding new data sources
- Understanding what's available for model development
- Debugging missing or incorrect data
- Planning new features

---

## Game & Market Data

**Sources:**
- **CFBD**: Game schedules, results, scores, game times
- **OddsAPI**: Primary odds source (spreads, totals, moneylines)
- **SGO**: Backup odds source (used when OddsAPI unavailable)

**Tables:**
- `games`: Game records with teams, dates, scores, locations
- `market_lines`: Betting odds from various sources (OddsAPI, SGO)
- `bets`: Generated picks from models (Hybrid V2, V4 Labs, etc.)

**Key Fields:**
- Game metadata: `season`, `week`, `date`, `homeTeamId`, `awayTeamId`, `score`
- Market lines: `source`, `marketType` (spread/total/moneyline), `line`, `price`
- Bets: `strategyTag`, `marketType`, `side`, `modelPrice`, `closePrice`, `edge`

**Used by:**
- **Current Slate** (`/picks`): Shows upcoming games with model picks and odds
- **Week Review** (`/weeks/review`): Historical performance by week
- **Season Review** (`/season-review`): Season-long profitability analysis
- **Labs** (`/labs`): Experimental overlays (V4, Fade V4)
- **Backtests**: Strategy performance analysis

---

## Core Team-Season Efficiency (CFBD)

**Source:** CFBD Advanced Stats API (aggregated season-level stats)

**Table:** `team_season_stats` (numeric columns)

**Fields:**
- **Offense:**
  - `ypp_off`: Yards per play (offense)
  - `success_off`: Success rate (offense)
  - `pass_ypa_off`: Passing yards per attempt
  - `rush_ypc_off`: Rushing yards per carry
  - `pace_off`: Plays per game (tempo)
  - `epa_off`: Expected points added (offense)

- **Defense:**
  - `ypp_def`: Yards per play allowed (defense)
  - `success_def`: Success rate allowed (defense)
  - `pass_ypa_def`: Passing yards per attempt allowed
  - `rush_ypc_def`: Rushing yards per carry allowed
  - `pace_def`: Opponent plays per game
  - `epa_def`: Expected points added (defense, negative is better)

**Used by:**
- **Hybrid V2**: Core spread model uses these efficiency metrics
- **Ratings calculations**: Power ratings and implied lines
- **Matchup analysis**: Team strengths/weaknesses comparisons

**Ingestion:** `nightly-ingest.yml` → `cfbd_team_season_stats.ts` (runs after games complete)

---

## Drive-Based Metrics (CFBD Drives → `raw_json.drive_stats`)

**Source:** CFBD Drives API (play-by-play drive data)

**Table:** `team_season_stats.raw_json.drive_stats`

**Fields:**
- **Tempo:**
  - `tempo`: Average seconds per drive
  - `qualityDrives`: Count of drives that cross opponent 40-yard line
  - `qualityDriveRate`: Quality drives / total drives

- **Finishing Drives:**
  - `finishingDrives.off.scoringOpps`: Scoring opportunities (inside opponent 40)
  - `finishingDrives.off.pointsOnOpps`: Points scored on opportunities
  - `finishingDrives.off.pointsPerOpp`: Points per scoring opportunity
  - `finishingDrives.def.*`: Same metrics for defense

- **Available Yards:**
  - `availableYards.off.drives`: Drives with available yards data
  - `availableYards.off.avgAvailableYards`: Average yards available (field position)
  - `availableYards.off.avgYardsGained`: Average yards gained
  - `availableYards.off.avgAvailableYardsPct`: Yards gained / yards available
  - `availableYards.def.*`: Same metrics for defense

**Used by:**
- **V4 Labs**: Drive-based spread model (experimental)
- **Future V5**: Potential integration into Hybrid model
- **Labs overlays**: Drive efficiency analysis

**Ingestion:** `v3-totals-nightly.yml` → `sync-drives.ts` (full-season sync, can be slow)

---

## Talent, Recruiting & Roster Churn (`raw_json.roster_churn`)

**Source:** CFBD Returning Production + Transfer Portal APIs

**Table:** `team_season_stats.raw_json.roster_churn`

**Fields:**
- **Returning Production:**
  - `returningProduction`: Percentage of production returning by position group
  - Breakdown by offense/defense and position (QB, RB, WR, OL, DL, LB, DB, etc.)

- **Transfer Portal:**
  - `transferPortal.inCount`: Transfers in
  - `transferPortal.outCount`: Transfers out
  - `transferPortal.netCount`: Net transfers (in - out)

**Used by:**
- **Portal & NIL Indices** (V5 - Planned): Will feed Continuity Score, Positional Shock, Mercenary Index, Portal Aggressor
- **Future Labs overlays**: Roster stability analysis
- **Preseason adjustments**: Power rating adjustments based on roster turnover

**Ingestion:** `roster-churn-cfbd.yml` → `cfbd_roster_churn.ts` (yearly, off-season)

---

## Labs / Experimental Blocks (`raw_json.sgo_stats`)

**Source:** SportsGameOdds API (curated stats)

**Table:** `team_season_stats.raw_json.sgo_stats`

**Fields:**
- **Red Zone:**
  - `redZone.trips`: Red zone trips
  - `redZone.touchdowns`: Red zone touchdowns
  - `redZone.touchdownRate`: TD rate in red zone

- **Penalties:**
  - `penalties.count`: Total penalties
  - `penalties.yards`: Penalty yards
  - `penalties.firstDowns`: First downs via penalty
  - `penalties.perGame`: Penalties per game

- **Pressure/Havoc:**
  - `pressure.offense.sacksTaken`: Sacks allowed
  - `pressure.offense.interceptions`: INTs thrown
  - `pressure.defense.sacks`: Sacks made
  - `pressure.defense.tacklesForLoss`: TFLs
  - `pressure.defense.qbHits`: QB hits
  - `pressure.defense.interceptions`: INTs made
  - `pressure.defense.fumblesForced`: Fumbles forced

- **Special Teams:**
  - `specialTeams.punting.netYards`: Net punting yards
  - `specialTeams.punting.puntsInside20`: Punts inside 20
  - `specialTeams.returns.kickoffYardsPerReturn`: KO return average
  - `specialTeams.returns.puntYardsPerReturn`: Punt return average
  - `specialTeams.fieldGoals.percentMade`: FG percentage
  - `specialTeams.fieldGoals.made50Plus`: FGs made from 50+ yards

- **Game Script:**
  - `gameScript.largestLead`: Largest lead in any game
  - `gameScript.secondsInLead`: Total seconds leading
  - `gameScript.leadChanges`: Number of lead changes
  - `gameScript.longestScoringRun`: Longest scoring run
  - `gameScript.timesTied`: Times tied

**Status:** ⚠️ **Labs-only, optional**

- Not used in production models (Hybrid V2, ratings)
- Used for future V5 model development
- Safe to ignore if SGO plan is disabled
- May be deprecated if not proven useful

**Ingestion:** `sgo-team-stats.yml` → `sync_team_sgo_stats.ts` (yearly, off-season)

---

## Portal & NIL Meta Indices (`raw_json.portal_meta`)

**Status:** 🚧 **Partially implemented** (Continuity Score v1 exists; others are stubs)

These indices are computed from `raw_json.roster_churn` data and used as Labs overlays first, then potentially integrated into V5 Hybrid model.

### Continuity Score v1

**Status:** ✅ **Implemented**

**Definition:** A numeric score in [0, 1] measuring roster stability:
- **0.0** ≈ total reboot (no returning production, high turnover)
- **1.0** ≈ full continuity (everyone returns, minimal transfers)

**Formula:**
- Uses `returningProduction.offense` and `returningProduction.defense` (0-100 percentages)
- Normalizes to [0, 1] and accounts for transfer portal activity
- Combines offense and defense equally (50/50)
- Transfers in reduce continuity (new players = less continuity than returning players)

**Source:** Derived from `roster_churn` data (CFBD returning production + transfer portal)

**Storage:** `team_season_stats.raw_json.portal_meta.continuityScore`

**Usage:**
- **Labs page:** `/labs/portal` displays continuity scores for all teams
- **CLI tools:** `print-continuity-histogram.ts` for distribution analysis
- **Sync script:** `sync_portal_indices.ts` computes and stores scores

**Status:** Labs-only, not yet used in Hybrid V2 production model. Candidate feature for future Hybrid V5.

### 1. Continuity Score

**Data Source:** CFBD returning production + transfer portal net counts

**Intended Use:** Labs overlay to identify teams with high/low roster stability; if stable, may adjust Hybrid V2 confidence or power rating adjustments in V5.

### 2. Positional Shock Index

**Data Source:** Position-group breakdowns from `roster_churn.returningProduction`

**Intended Use:** Labs overlay to flag teams with extreme turnover at key positions (QB, OL, DL); may inform matchup-specific adjustments in V5.

### 3. Mercenary Index

**Data Source:** 1-year transfers and short-eligibility players from transfer portal data

**Intended Use:** Labs overlay to identify teams heavily reliant on transfers; may adjust for chemistry/cohesion factors in V5.

### 4. Portal Aggressor Flag

**Data Source:** Net talent gain from transfers (`transferPortal.netCount` + talent ratings if available)

**Intended Use:** Labs overlay to flag teams that aggressively use the portal; may inform power rating adjustments in V5 if portal-heavy teams show consistent patterns.

**Implementation:** See `apps/jobs/src/talent/portal_indices.ts` for stub functions.

---

## Team Data Inspector (CLI)

**Script:** `scripts/inspect-team-data.ts`

**Usage:**
```bash
npx tsx scripts/inspect-team-data.ts --season 2025 --team lsu
npx tsx scripts/inspect-team-data.ts --season 2024 --team "Ohio State"
```

**What it prints:**
- Header: Season, team name, slug, teamId
- Core efficiency: All numeric columns from `team_season_stats`
- Drive stats: Contents of `raw_json.drive_stats` (if present)
- Roster churn: Contents of `raw_json.roster_churn` (if present)
- SGO stats: Contents of `raw_json.sgo_stats` (if present)
- Portal indices: Contents of `raw_json.portal_meta` (if present, future)

**Why it's useful:**
- Quick verification that data exists for a team/season
- Debug missing or incorrect data
- Understand what's available before writing model code
- Compare data across teams/seasons

---

## Adding New Data Blocks

When adding new data to `team_season_stats.raw_json`:

1. **Document it here** in the appropriate section
2. **Update `docs/workflows-guide.md`** with ingestion workflow details
3. **Update `inspect-team-data.ts`** to display the new block
4. **Add a stub or implementation** in the relevant module (e.g., `portal_indices.ts` for portal/NIL data)

**Example:** If adding `raw_json.weather_meta`, add:
- A section in this doc explaining what it contains
- A workflow entry in `workflows-guide.md`
- Display logic in `inspect-team-data.ts`
- Any model code that consumes it

---

## Related Documentation

- **Workflows Guide** (`/docs/workflows-guide.md`): How data is ingested
- **Bowl & Postseason Ops** (`/docs/bowl-postseason-ops`): Manual ingestion for postseason weeks
- **2026 Betting Playbook** (`/docs/2026-betting-playbook`): How models use this data

