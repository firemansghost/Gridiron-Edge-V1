# CFBD research predictor qualification Phase B V1

This new, outcome-isolated acquisition is separate from frozen Final Holdout V1, which remains HISTORICAL_FINAL_HOLDOUT_INPUT_BLOCKED. It does not modify any old source or contract and cannot unlock V3 or authorize scoring.

Exactly two GET requests: /talent?year=2025 (Air Force and Navy, finite talent); /ratings/elo?preseason=true&seasonType=regular&year=2025 (UNLV, finite elo). No week, alternate endpoint, retry, redirect, pagination, prior-year substitution or model computation is allowed. Returned rows must have year 2025; missing, duplicate or nonnumeric required fields remain explicit. Numeric zero is finite, never an imputation. Boolean values are not numeric inputs.

The official Elo response has year/team/conference/elo but no source-week/publication timestamp. Its documented preseason query requests the opening regular-season rating. Any contradictory explicit timing metadata is rejected. Successful retrieval in 2026 establishes only a dated endpoint response, not historical point-in-time publication or a revision history. Extra response fields remain original raw evidence and are not predictors.

Use manual main-only workflow_dispatch, exact independently reviewed source SHA, secret-free offline tests, actual zero-call PLAN and separate original-artifact acceptance. FETCH additionally requires that accepted plan SHA256 and FETCH_CFBD_RESEARCH_GAPS_PHASE_B_V1. Only CFBD_API_KEY is exposed to the FETCH step; no database credentials, dependency installation or Prisma use. Always preserve original response bytes/status/UTC/hash and STARTED/FINISHED journal events, including partial failure. Never overwrite an output directory. Reject secret-reflecting bodies without persisting them.

Separate review is mandatory before commit, merge and each execution gate. Workflow success does not mean targets were recovered. No mixed sealed 2025 snapshot, games, scores, outcomes, lines, market data, portal/PPA evidence or other research archive is read. No training, scoring, predictions, production, cohort/card/prices/ratings/lifecycle changes occur. All original game denominators and missing-history distinctions remain intact.

Prior input-only preflight run36600675919/artifact11049058024 identifies missing Air Force/Navy talent (22 sides) and UNLV Week1 preseason Elo (game401757224). Its original INPUT_BLOCKED result remains authoritative. This capability evaluates only whether the current endpoint can supply those three target units for a separately versioned future research source. Full 2025 feature/package readiness requires later outcome-isolated qualification; two responses cannot certify all features or a new holdout contract.

Official schema references checked November4,2026: https://api.collegefootballdata.com/api/teams and https://api.collegefootballdata.com/api/ratings .
