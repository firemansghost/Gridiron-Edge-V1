# Historical Development Corpus V1 — Independent Audit Closeout

**Date:** 2026-09-28  
**Build run:** `36479515332`  
**Builder source SHA:** `3d553b0925f55321d53c3048544aa16a047e41c8`  
**Workflow:** Build Historical Development Corpus V1 (Manual, Guarded)

## Bottom line

Historical Development Corpus V1 passed independent audit.

The build consumed only the two frozen audited 2022/2023 GitHub Actions source
artifacts, verified both source ZIP SHA-256 digests before extraction, made no data-
provider calls, performed no database access, invoked no Prisma path, computed no
model features, and produced the frozen 1,484-game development universe.

The resulting immutable corpus artifact is suitable as the raw source for the next
research phase: a separately frozen Historical Feature Definition V1 contract.

This audit does **not** authorize feature computation, model fitting, tuning, 2024
validation capture/use, or 2025 holdout access.

## Workflow execution boundary

Run `36479515332`:

- event: `workflow_dispatch`
- branch: `main`
- source SHA: `3d553b0925f55321d53c3048544aa16a047e41c8`
- conclusion: **success**
- source SHA guard: **pass**
- exact confirmation guard: **pass**
- frozen source artifact download: **pass**
- frozen source ZIP hash verification: **pass**
- `npm ci --ignore-scripts`: **pass**
- direct TypeScript compile: **pass**
- corpus build: **pass**
- immutable artifact upload: **pass**

Execution boundaries verified from the workflow and emitted report:

- source provider calls during build: **0**
- database reads: **0**
- database writes: **0**
- Prisma invoked: **no**
- feature engineering invoked: **no**
- model fitting invoked: **no**
- 2024 included: **no**
- 2025 included: **no**

## Frozen source verification

The build used exactly the previously audited source artifacts.

### 2022

- source run: `36464140881`
- artifact ID: `10988661299`
- source repo SHA: `e8a2b184c88f39866f29b865a3fd65ad82f99ec0`
- ZIP SHA-256:
  `7a5b76b681b0ef1873853956cdc5b39cb3581675cf84e6ca6f972141ea2dfe99`
- source manifest SHA-256:
  `975ff351ca8b08bb2791bbaef8d4c993955d590d94d31b5cae53828ef02800c5`
- source report SHA-256:
  `29fc38f926e3352881039097a14efe7da93a29efff3387b55f67564db1291bde`

Independent audit re-opened the source ZIP and re-verified all **28 / 28** manifested
source files for byte count and SHA-256.

### 2023

- source run: `36470674904`
- artifact ID: `10990949531`
- source repo SHA: `7150e263284255e67adf87521fcb710ec97a91a9`
- ZIP SHA-256:
  `479d5dc4481a6f7ab7b2c034976b8845814121cfc0f11c0b18a8166c61fc5bd4`
- source manifest SHA-256:
  `d9d312f2a7b1ea872bb14d3e50948f1f92a30cf983b1f7f5c7c6861ba6032d35`
- source report SHA-256:
  `70aa252f74f593334efd089e870e35965629955c908531d5dfaa56c2dba3cf7a`

Independent audit re-opened the source ZIP and re-verified all **28 / 28** manifested
source files for byte count and SHA-256.

The source row counts recorded in corpus provenance were independently recomputed from
the frozen source ZIPs and matched exactly for every source family, recruiting class,
and weekly Elo snapshot.

## Corpus artifact integrity

GitHub uploaded:

- artifact ID: `10997010171`
- artifact name: `historical-development-corpus-v1-36479515332`
- ZIP bytes: **1,676,040**
- GitHub SHA-256:
  `cea83762d2b6e492caec680a74a085ef5a5e283c36a402ef4b35acbe2ce22b7d`

Independent verification of the downloaded ZIP produced the exact same SHA-256.

The corpus ZIP contains **12 files**:

- **11** files covered by `manifest.json`
- `manifest.json` itself

Independent verification found:

- manifested files checked: **11 / 11**
- SHA-256 mismatches: **0**
- byte-count mismatches: **0**
- unexpected files: **0**
- missing expected files: **0**

## Layer inventory

The emitted corpus contains the required physically separate layers.

### Predictive

- `predictive/game_frames.json`: **1,484**
- `predictive/static_priors.json`: **264**
- `predictive/history_advanced.json`: **3,206**
- `predictive/history_ppa.json`: **3,206**
- `predictive/history_eligibility.json`: **1,484**

### Outcome

- `outcomes/outcomes.json`: **1,484**

### Market evaluation

- `evaluation/market_lines.json`: **1,484**

### Quarantine

- 2022 transfer-portal rows: **2,273**
- 2023 transfer-portal rows: **2,502**

The quarantined portal files were independently byte-compared with the source snapshot
raw portal files and are **exact byte-for-byte copies**.

## Canonical target universe

The canonical target universe was independently reconstructed from the frozen games
payloads using the contract filter:

- target season;
- regular season;
- completed;
- home classification FBS;
- away classification FBS.

Results:

- 2022: **734** games
- 2023: **750** games
- combined: **1,484** games

Every corpus game frame matched a canonical source game by:

- season;
- provider game ID;
- provider week;
- home team;
- away team;
- neutral-site state.

No duplicate target keys were found.

The frame, eligibility, outcome, and market-evaluation layers have the same exact
1,484 target keys.

## Outcome separation

For all **1,484 / 1,484** target games, the outcome sidecar was independently checked
against the frozen games source:

- home team: exact
- away team: exact
- final home points: exact
- final away points: exact
- `homeMargin = finalHomePoints - finalAwayPoints`: exact

No outcome field is required to construct the predictive frame.

## Market-evaluation separation

All **1,484 / 1,484** target games have an evaluation-side historical line row:

- 2022: **734 / 734**
- 2023: **750 / 750**

Each emitted market row was independently byte/structure-compared with the matching
source line row by provider game ID and matched exactly.

Market evidence remains outside predictive layers.

## Static-prior source audit

The predictive static-prior layer contains exactly one row for each canonical team:

- 2022: **131**
- 2023: **133**
- combined: **264**

Exact source-row joins were independently verified for talent, returning production,
and every captured recruiting class.

Frozen missingness was reproduced exactly.

### 2022

- talent missing: **none**
- returning production missing:
  - James Madison
- recruiting 2019 missing: **none**
- recruiting 2020 missing: **none**
- recruiting 2021 missing: **none**
- recruiting 2022 missing:
  - Florida International

### 2023

- talent missing: **none**
- returning production missing:
  - Jacksonville State
  - Sam Houston
- recruiting 2020 missing: **none**
- recruiting 2021 missing: **none**
- recruiting 2022 missing:
  - Florida International
- recruiting 2023 missing: **none**

No gap was filled with zero, another season, another team, or a synthetic replacement.

## Historical Elo mapping audit

There are **2,968** team-side Elo selections across the 1,484 game frames.

Independent comparison against the frozen source snapshots found:

- selections available: **2,968 / 2,968**
- source-row mismatches: **0**
- value mismatches: **0**
- source-request mismatches: **0**

Frozen mapping is exactly respected:

- target Week 1 -> preseason Elo;
- target Week N, N >= 2 -> Week N-1 Elo;
- same-week Week N Elo -> never selected.

The game payload's pregame/postgame Elo fields are not substituted into the predictive
frame.

## Advanced/PPA history-source audit

The corpus preserves raw prior-game source rows, not engineered features.

### Source-history pool

Advanced history:

- 2022: **1,588**
- 2023: **1,618**
- combined: **3,206**

PPA history:

- 2022: **1,588**
- 2023: **1,618**
- combined: **3,206**

Independent reconstruction from the frozen source payloads matched these source-history
pools exactly.

The pool includes eligible captured regular-season history for canonical teams,
including FBS-team rows from FBS-vs-FCS games where present. It does not widen the
1,484-game target universe.

### Eligibility references

Across all target frames:

- advanced-history references: **17,459**
- PPA-history references: **17,459**

By season:

- 2022 advanced refs: **8,618**
- 2022 PPA refs: **8,618**
- 2023 advanced refs: **8,841**
- 2023 PPA refs: **8,841**

Every reference was independently verified to:

- resolve to an emitted history row;
- match the target season;
- match the target team's exact provider identity;
- have source week **strictly less than** target week.

Independent completeness check also confirmed that every eligible earlier-week history
row for a team is referenced and no eligible row is silently omitted.

### Week 1 / same-week gate

Target Week 1 games:

- 2022: **53**
- 2023: **52**

For every Week 1 target:

- advanced references: **0**
- PPA references: **0**

Across the entire corpus:

- same-week-or-later advanced references: **0**
- same-week-or-later PPA references: **0**

This independently confirms the frozen conservative provider-week timing contract.

## Predictive-layer contamination scan

The five predictive artifacts were recursively scanned for the contract's prohibited
target/outcome/market/game-level-Elo keys.

Result:

- forbidden predictive keys found: **0**

The audit specifically checked for score fields, game-level pregame/postgame Elo,
historical line/spread/total/moneyline fields, and related market/output keys.

Target seasons present in the primary corpus layers are only:

- 2022
- 2023

No 2024 validation target or 2025 holdout target appears in the development layers.

## Build-report reconciliation

The emitted `report.json` was independently reconciled with the actual corpus files.

Verified:

- canonical games: **1,484**
- static prior rows: **264**
- advanced history rows: **3,206**
- PPA history rows: **3,206**
- eligibility rows: **1,484**
- outcome rows: **1,484**
- market-evaluation rows: **1,484**
- same-week history refs: **0**
- Week 1 history refs: **0**
- source-provider calls during build: **0**
- database reads: **false**
- database writes: **false**
- feature engineering: **false**
- model fitting: **false**

## Audit conclusion

Historical Development Corpus V1 is **CLEAN / ACCEPTED** as the immutable raw
development corpus for 2022–2023 research.

The acceptance is limited to corpus construction and leakage/missingness/provenance
integrity.

It does not decide:

- which raw prior fields become model features;
- how game-history rows are aggregated;
- rolling windows;
- weighting/decay;
- normalization;
- opponent adjustment;
- HFA;
- feature interactions;
- target/loss choice beyond the raw `homeMargin` label definition;
- training protocol;
- hyperparameter search;
- model promotion criteria.

Those decisions remain intentionally unfrozen.

## Next research boundary

The next step is a separately frozen **Historical Feature Definition V1 contract**.

That contract must be reviewed before any feature matrix is generated from this corpus.

The feature-definition stage must remain confined to 2022–2023 development evidence.
It must not use 2024 validation evidence or 2025 holdout outcomes to choose feature
definitions.
