# Season Status

**Status:** Offseason / paused for regular-season automation  
**Updated:** 2026-04-19

## Current State
- 2025 regular season is complete.
- Homepage includes a **Season Update (Dec 22, 2025)** banner pointing users to **Labs → Portfolio What-Ifs**.
- `WORKFLOW_DISABLE_REPORT.md` lists the GitHub Actions workflows that were identified for manual offseason disabling.

## Before 2026 Week 0
1. Re-enable the needed GitHub Actions workflows in the GitHub UI.
2. Run a quick pipeline sanity check (`npm run build` plus one ingest/test run if applicable).
3. Confirm homepage copy still makes sense for preseason / current season.

## Notes
- Weekly pick-processing rules are documented in the project operator files / ChatGPT Project instructions.
- Moneyline overlap is treated as **winner-only** (ignore Kalshi vs American-odds scale mismatch).
- Always include **Near Overlaps** for spreads/totals with drift in `(1.0, 2.0]`.
