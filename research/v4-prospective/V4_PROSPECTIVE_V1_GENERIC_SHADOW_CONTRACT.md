# V4 Prospective V1 — Generic Shadow Persistence & Hybrid Integration Contract

Status: APPROVED FOR IMPLEMENTATION
Parent: #160
Implementation: #171

## Identity

- model family: v4_prospective
- model definition id: v4_prospective_v1
- market type: SPREAD
- official: false
- production status: SHADOW / RESEARCH ONLY
- Super Tier A product activation: HELD

## Frozen Week 4 feature artifact

The first prospective comparator frame is the independently audited Week 4 source frame derived from completed Weeks 1–3.

- workflow run: 36084777413
- source repo SHA: 73475029ff1e5e050260d12e501a1ecf505e6ca8
- source artifact: 10843139601
- source artifact archive SHA-256: ab28291fe102335abf1b3af6960ab5251bc51b74d4608a62e9ad3da8464ec0df
- team-ratings.json SHA-256: 4ed8926cf27be4c5f2914613b134d7c4ec3d4a8205e403d671189effca68fd07
- runtime artifact hash: 0c1fddf9e1d08a308887024c86c8be5a34aa3aa5bae16e53fe3dc2cb3edb0a33
- team count: 138
- reconstructed final validation: 157/157 exact
- scoring rows: 2378
- invalid scoring events: 0

No later provider fetch may silently replace this artifact for the Week 4 cohort.

## Model

For each game:

modelHma = homeRating + (neutralSite ? 0 : 2.0) - awayRating
edgeHma = modelHma - canonicalMarketHma

Selection:
- abs(edgeHma) < 0.1 => NO_SELECTION
- edgeHma >= +0.1 => HOME
- edgeHma <= -0.1 => AWAY

NO_SELECTION is AVAILABLE evidence.

## Prediction market

Reuse Generic Shadow coherent spread selector:
- oddsapi only
- coherent home/away pair required
- market observation <= prediction timestamp
- maximum age 1800 seconds
- no future fallback
- post-kickoff unavailable

## Persistence

The immutable decision artifact is:
- ShadowModelCaptureRun
- ShadowModelPrediction

Generic Shadow capture performs zero provider calls and no Bet/Official Card/Hybrid Snapshot writes.

## Hybrid integration

A Hybrid Snapshot V1 capture must receive an explicit v4_capture_run_id.

The referenced V4 run must:
- season/week equal the Hybrid capture;
- status COMPLETE;
- modelDefinitionId = v4_prospective_v1;
- captureTimestamp <= Hybrid prediction timestamp.

Game translation:
- AVAILABLE + HOME => SIDE_AVAILABLE/HOME
- AVAILABLE + AWAY => SIDE_AVAILABLE/AWAY
- AVAILABLE + NO_SELECTION => VERIFIED_NO_SELECTION/null
- UNAVAILABLE => PROVENANCE_UNAVAILABLE/null
- absent prediction => PROVENANCE_UNAVAILABLE/null

Hybrid must never auto-select latest, best, or highest-edge V4 run.

## Frozen Super Tier A rule

Unchanged:
- actual Hybrid V2 HOME/AWAY selection
- hybridConflictType = hybrid_strong
- absSpreadEdge >= 4.0

No change to Hybrid math, threshold, Core V1, or Official Card.

## Prospective boundary

- no Week 1–4 retrospective backfill
- Liberty @ Coastal Carolina is not reconstructed after kickoff
- already frozen Week 2 Hybrid cohort is not rewritten
- all new qualification evidence starts at the actual capture timestamp

## Activation boundary

This contract authorizes persistence/integration implementation and one prospective proof cohort under Bobby's explicit approval.

It does not make Hybrid official or expose Super Tier A as an official betting product.
