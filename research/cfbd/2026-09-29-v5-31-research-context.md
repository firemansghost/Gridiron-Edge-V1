# CFBD v5.31.x Research Context — 2026-09-29

**Status:** RESEARCH-ONLY CONTEXT / NO LIVE-MODEL CHANGE  
**Source:** Gridiron Scout monitoring + current CFBD API documentation review  
**Scope:** Provider-contract awareness only

## Bottom line

CFBD v5.31.x introduced convenience/reconciliation surfaces that may be useful for
selective validation, but they do **not** change current Gridiron Edge canonical research
sources or live production.

No current Gridiron Edge consumer was found for the new preview / overview ranking
contracts at this checkpoint.

Therefore this update does **not** change:

- Core V1 production;
- `CORE_EVAL_V1`;
- Candidate B frozen prospective evidence;
- current Week 5 T-30 work;
- canonical raw/bulk WEPA sources;
- Garbage-Time EPA methodology;
- PassMatch primary archive sources;
- historical V3 / Final Holdout V1 conclusions.

## CFBD v5.31.x preview convenience endpoints

Current CFBD API documentation exposes:

- `GET /games/schedule`
- `GET /games/{gameId}/preview`
- `GET /games/{gameId}/preview/adjusted`

The current docs state that:

- `/games/schedule` returns an active/next/explicit schedule window;
- the standard game preview returns pregame team comparisons/key players;
- preview analysis remains available until game completion;
- team statistics may use the previous season;
- adjusted preview returns stored adjusted team/player metrics until completion;
- adjusted team metrics may also use the previous season while player metrics remain
  current-season.

### Frozen PIT interpretation

Endpoint availability is **not** equivalent to prediction-time availability.

For any future prospective research use:

1. capture must occur before kickoff under a frozen protocol;
2. retrieval/assembled time must be preserved;
3. the game kickoff used for the cutoff must be preserved;
4. a response retrieved after kickoff must never be treated as pregame evidence;
5. any previous-season fallback must preserve the actual source season and fallback flag.

These endpoints are therefore **SELECTIVE VALIDATION / reconciliation** sources only.

Do not:

- treat them as new canonical historical research datasets;
- systematically PIT-archive them without a separately frozen protocol;
- use post-kickoff preview availability to reconstruct pregame evidence;
- replace lower-level/raw canonical WEPA or advanced sources with convenience preview
  payloads;
- activate them in a production model merely because the endpoint now exists.

## Adjusted preview

Gridiron Scout reports that the adjusted preview bundles opponent-adjusted team metrics,
player WEPA passing/rushing, and kicker PAAR.

Those are convenience aggregates over already-existing data families.

Current rule:

> lower-level/raw and already-frozen bulk sources remain canonical; adjusted preview is
> validation/reconciliation only.

Any future use must preserve:

- retrieval timestamp;
- game kickoff;
- source season;
- previous-season fallback state;
- endpoint/schema version where available.

## v5.31.2 stat rankings

Gridiron Scout reports optional `statRankings` enrichment on:

- `/teams/season/overview`;
- free `/games/{gameId}/preview` team statistics.

Reported semantics:

- division-relative ranks / percentiles;
- approximately 20 existing advanced-efficiency metrics;
- query-time enrichment;
- provenance fields such as `calculatedAt`, `expiresAt`, and `sourceUpdatedAt`.

Research interpretation:

- this is a **derived transformation**, not a new independent signal family;
- provenance is mixed;
- retrospective/PIT status is not automatically established by endpoint availability;
- rankings are **SELECTIVE VALIDATION only** unless captured prospectively before kickoff
  under a frozen protocol.

Do not:

- systematically archive rankings team-by-team solely because they are exposed;
- infer historical pregame rankings from a later arbitrary team-season pull;
- use ranking values as historical prediction features without legitimate pre-kickoff
  evidence.

If ranking reconstruction is ever required, it should use:

1. the matching stored team-season snapshot cohort;
2. a frozen ranking catalog;
3. frozen eligibility rules;
4. explicit provenance.

## powerRushAttempts

Gridiron Scout reports optional `powerRushAttempts` in nested overview/preview advanced
offense/defense blocks.

Research interpretation:

- useful as sample context for `powerSuccess` ranking eligibility;
- not currently a new primary Gridiron Edge feature;
- no current systematic archive requirement;
- `/stats/season/advanced` remains unchanged with respect to this field per Scout's
  report.

## Current boundary

No code or schema change is authorized by this note.

No production/provider call is required.

No Week 5 workflow should be delayed for this provider update.

Revisit only if a future research task:

- relies on preview payloads as historical evidence;
- uses `statRankings`;
- reconstructs overview ranking state;
- needs adjusted-preview provenance;
- changes canonical WEPA/advanced data contracts.

Until then:

**WATCH / DOCUMENTED / NO ACTION.**
