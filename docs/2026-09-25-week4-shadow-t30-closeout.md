# 2026-09-25 Week 4 Shadow / T-30 Closeout

**Status:** prospective Week 4 prediction evidence frozen; Generic T-30 automation active; Hybrid Week 4 T-30 protection live-proven.

**Runtime baseline:** `653eb9d1826954bb3ea6d1eaedb10b41739000eb`

## Frozen production / research posture

- Core V1 / `official_flat_100` remains the only official spread model.
- Hybrid V2 remains **SHADOW / HELD / NOT OFFICIAL**.
- Hybrid Super Tier A remains **SHADOW / HELD**.
- Candidate B roster prior remains **SHADOW / RESEARCH ONLY / NOT OFFICIAL**.
- V4 prospective remains **research-only**.
- `CORE_EVAL_V1`, prediction freshness <=30 minutes, and kickoff-minus-30-minute closing semantics are unchanged.
- No retrospective/backdated prediction or closing evidence is authorized.

## Week 4 official / lifecycle checkpoint

- Week 4 schedule: **58 games**.
- Week 4 official Core card: **107** `official_flat_100` Bet rows, all currently ungraded as of this closeout.
- TeamGameStat evidence through completed Week 3 is complete:
  - Week 1: **102 / 102** rows with EPA
  - Week 2: **98 / 98**
  - Week 3: **114 / 114**
  - total: **314 / 314**
- Canonical lifecycle policy remains Candidate A / `GLOBAL_BLEND_W3_W6`.
  - completed Week 3 weight: **0.25**
  - after completed Week 4: **0.50**

## Week 4 Generic Shadow prediction cohorts

| Model | Capture context | Run ID | Total | Available | Unavailable | Selections | No selection |
|---|---|---|---:|---:|---:|---:|---:|
| Core V1 | `week4_post_official_card` | `fefc8c48-a40c-4eeb-9ccb-5819d68d79cc` | 58 | 58 | 0 | 56 | 2 |
| Core V1 | `week4_tuesday_paired_research` | `00172ddc-b7e2-4526-8011-88856811857e` | 58 | 58 | 0 | 57 | 1 |
| Candidate B roster prior | `week4_tuesday_paired_research` | `900b34ff-e022-4129-a8fb-b967f8cdaa8c` | 58 | 34 | 24 | 34 | 0 |
| V4 prospective V1 | `week4_v4_prospective_first_observation` | `149e59c2-801a-4535-bfc0-1b2d2f4a5198` | 58 | 57 | 1 | 57 | 0 |

These are frozen prospective research observations. Do not rerun, replace, overwrite, or backdate them.

Candidate B Elo Prior V1 remains Week 5+ only. Technical capability does not authorize a Week 5 production COMMIT by itself.

## Week 4 Hybrid + V4 cohort

PR #173 wired Hybrid Snapshot V1 to an explicit Generic Shadow V4 capture run rather than legacy V4 Bet rows.

Frozen source V4 run:

`149e59c2-801a-4535-bfc0-1b2d2f4a5198`

Hybrid Week 4 capture:

- capture context: `week4_hybrid_v4_prospective_first_observation`
- capture run ID: `86505023-0ba6-4838-bbd6-21091c73057f`
- capture timestamp: `2026-09-25T14:03:50.112Z`
- total games: **58**
- Hybrid AVAILABLE / UNAVAILABLE: **57 / 1**
- qualification QUALIFIED / NOT_QUALIFIED / UNAVAILABLE: **8 / 49 / 1**
- V4 SIDE_AVAILABLE: **57**
- V4 provenance unavailable: **1**
- Super Tier A: **8**
- status: **COMPLETE**

The first COMMIT workflow run **36144902983** persisted the cohort successfully but then exited failure during post-write verification because the verifier's `readRun()` selector omitted `v4Provenance`.

PR #174 repaired only that readback selector and added regression coverage. No persisted cohort was replaced.

Idempotent verification run **36146124407** then returned success with:

`COMMIT transactional idempotent no-op — existing COMPLETE cohort unchanged`

The Week 4 Hybrid cohort is therefore frozen and verified.

## Generic T-30 automation

Supabase remains the sole recurring production clock. It dispatches the GitHub coordinator every five minutes.

Generic Stage C:
- provider-backed board refresh only in the frozen T-45..T-35 window
- at most one board refresh per active cycle

Generic Stage D:
- providerCalls=0
- append-only Generic closing capture at/after T-30 and before kickoff
- no fall-forward
- no post-kickoff backfill

Current Week 4 persisted Generic closing evidence at this closeout:

- Core V1: **2 AVAILABLE** rows
- Candidate B roster prior: **1 AVAILABLE** row

The active coordinator remains research-only and does not create prediction cohorts, Official Card bets, evaluations, scores, or lifecycle writes.

## Hybrid Week 4 T-30 protection

PR #175 added an optional Hybrid closing Stage E after Generic Stage C/D using the existing proven `capture-shadow-t30-closing-v1-2026.ts` writer.

Because the secured Supabase dispatch token correctly lacks repository variable write permission, PR #176 scoped activation without broadening token permissions:

Stage E runs only when:

- `GENERIC_SHADOW_T30_AUTOMATION_V1_ENABLED=true`
- `GENERIC_SHADOW_T30_AUTOMATION_V1_WEEK=4`

Advancing the active week away from 4 automatically disables Hybrid Stage E. Any future-week Hybrid closing automation requires separate reviewed authorization.

Stage E may write only:

`ShadowClosingMarketSnapshot`

It does not write predictions, capture runs, Bets, MatchupOutputs, evaluations, Game rows, lifecycle state, or migrations.

### Live proof

External-clock proof run **36148638315** on runtime SHA `653eb9d1826954bb3ea6d1eaedb10b41739000eb`:

- trigger: `workflow_dispatch` from Supabase external control path
- job status: **success**
- Stage C provider calls: **0**
- Stage D Generic closing rows inserted: **0**
- Hybrid Stage E enabled: **true**
- Hybrid writeSafe: **true**
- Hybrid total games: **58**
- existing: **0**
- future: **57**
- due: **0**
- missed: **1**
- planned inserts: **0**
- mutationsInvoked: **false**
- transactionalIdempotentNoOp: **true**
- verificationOk: **true**
- Hybrid closing rows persisted after proof: **0**

The single missed game is Liberty @ Coastal Carolina, whose kickoff occurred before the Week 4 Hybrid cohort was created. It must remain missed; no retrospective closing row may be manufactured.

## Next operator sequence

Until Week 4 games are complete:

- allow the external T-30 coordinator to continue collecting Generic and Week 4 Hybrid closing evidence;
- do not create additional Week 4 prediction cohorts;
- do not promote Hybrid / Super Tier A / Candidate B / V4 to official use.

After Week 4 is complete:

1. guarded CFBD scores PREVIEW -> audit -> COMMIT;
2. grade the 107 Week 4 official Core bets;
3. guarded Week 4 TeamGameStat PREVIEW -> audit -> COMMIT;
4. Core V1 lifecycle PREVIEW at completedThroughWeek=4;
5. audit the canonical 0.50 blend;
6. lifecycle COMMIT only if all gates pass;
7. run read-only `CORE_EVAL_V1` research evaluation against prospective prediction and closing evidence.

No frozen formula or policy changes are implied by this closeout.
