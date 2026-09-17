# Generic Shadow T−30 Automation V1 — Contract

**Status:** `CONTRACT_FROZEN` / `IMPLEMENTATION_NOT_AUTHORIZED` / `SCHEDULE_NOT_AUTHORIZED`  
**Contract date:** 2026-09-17 America/Chicago  
**Scope:** orchestration only for persisted market refresh + Generic Shadow T−30 closing capture  
**Context main at freeze:** `a2d1a07bdd63815567c23163def6b9e227d9c094`

This contract freezes how a future automated operator may coordinate already-separated production lanes. It does **not** change Generic Shadow prediction semantics, `GENERIC_SHADOW_T30_CLOSING_V1`, `CORE_EVAL_V1`, Candidate B methodology, Core V1 authorization, Official Card truth, or Hybrid Shadow Snapshot V1.

Merging this contract authorizes **no** schedule, provider call, production write, workflow dispatch, model promotion, or automatic COMMIT. Implementation and schedule enablement remain separate decisions.

---

## 1. Objective

Replace repeated human timing work with a conservative target-aware coordinator while preserving the existing evidence boundaries:

```text
provider-backed Live Odds persistence
  -> persisted MarketLine
    -> provider-free Generic Shadow T−30 closing capture
      -> ShadowModelClosingMarketSnapshot
```

Automation may coordinate these stages. It must not collapse them into one semantic writer.

---

## 2. Non-negotiable inherited contracts

The automation layer MUST preserve all existing frozen closing semantics:

- target = kickoff −30 minutes;
- latest eligible persisted `oddsapi` spread evidence at or before target;
- coherent home/away spread pair;
- no after-target fall-forward;
- no postkick backfill;
- existing closing row immutable / idempotent no-op;
- closing writer `providerCalls=0`;
- prediction rows immutable;
- Candidate B Week 3 cohort immutable;
- no Official Card / `Bet` write;
- no `MatchupOutput` write;
- no Hybrid closing write;
- no evaluation write;
- no migration from automation runtime;
- no missing-evidence-to-zero behavior.

Automation failure must preserve missing evidence as missing rather than repair it retrospectively.

---

## 3. V1 operating scope

V1 is deliberately narrow.

| Item | Frozen V1 scope |
|---|---|
| season | `2026` only |
| market source | persisted `oddsapi` only |
| market type | `SPREAD` |
| closing definition | `generic_shadow_t30_closing_v1` |
| Generic models | existing eligible Generic capture runs only |
| provider stage | existing guarded Live Odds persistence path / equivalent shared implementation |
| closing stage | existing Generic T−30 planner/writer / equivalent shared implementation |
| prediction creation | forbidden |
| evaluation | forbidden |
| model changes | forbidden |

The coordinator must operate on persisted Generic capture runs and their prediction children. It must not create a new prediction cohort merely because a target is approaching.

---

## 4. Scheduler posture

Do **not** rely on an exact T−30 cron fire time.

GitHub schedule latency is treated as expected infrastructure behavior. The coordinator therefore uses a **look-ahead market-refresh window** and a separate **due-closing window**.

### Frozen V1 timing constants

- scheduler cadence target: **every 5 minutes** when enabled;
- market look-ahead opens: **45 minutes before kickoff**;
- market look-ahead closes: **35 minutes before kickoff**;
- closing target remains exactly: **30 minutes before kickoff**;
- closing may persist only once target has passed and kickoff has not occurred;
- after kickoff with no existing closing row: `MISSED`, no backfill.

The 45→35 minute market window is operational timing only. It does not alter the frozen T−30 closing definition. Its purpose is to make a persisted pre-target market observation likely to exist before the true T−30 target even when a scheduled runner starts late.

If a scheduled run misses the market-refresh window, the coordinator MUST NOT fetch after T−30 and reinterpret that observation as pre-target evidence.

---

## 5. Market refresh decision

Each coordinator cycle first performs DB reads to determine whether an uncaptured Generic prediction has an upcoming T−30 target within the frozen market look-ahead window.

If none exists:

`NO_ACTION`

No provider call and no write.

If one or more targets are in the market look-ahead window, the coordinator checks persisted Week market evidence.

A provider refresh is needed only when there is no sufficiently recent persisted board observation capable of supporting the approaching target group.

For V1, “sufficiently recent” means an `oddsapi` observation for the relevant week with timestamp **at or after kickoff−45m and at or before the current observed time**, while still before the T−30 target.

One Live Odds refresh covers the board. The coordinator MUST NOT make one provider call per game.

After one successful provider refresh in a cycle, do not issue a second refresh in the same cycle.

---

## 6. Closing decision

After the provider stage, or immediately when no provider refresh is required, the coordinator runs the Generic T−30 planner against each eligible capture run in scope.

Possible planner states remain inherited from the closing contract:

- `EXISTING`
- `FUTURE`
- `DUE`
- `MISSED`

For `DUE` predictions:

- persist `AVAILABLE` only when the frozen selector finds eligible persisted pre-target market evidence;
- persist explicit `UNAVAILABLE` only when the existing Generic T−30 contract says the due frame is legitimately unavailable;
- never use a post-target market row;
- never postpone a due close merely to wait for a better line.

The writer remains append-only and serializable.

---

## 7. Authorization stages

Automation rollout is staged.

### Stage A — implementation / no schedule

Allowed future work:

- pure coordinator planner;
- deterministic target grouping;
- market-refresh-needed decision;
- Generic closing due decision;
- static tests;
- manual PREVIEW workflow.

No provider call or DB write is authorized merely by Stage A implementation.

### Stage B — scheduled PREVIEW / provider disabled

A schedule may later be enabled in read-only mode only after separate authorization.

Required behavior:

- DB reads only;
- no provider secret exposed;
- no provider call;
- no closing write;
- artifact must report exactly what the coordinator would have done.

### Stage C — automated market refresh

Separate authorization required.

Only the existing guarded Live Odds persistence boundary may write `MarketLine` rows. The coordinator may invoke/reuse that implementation, but it must preserve its team-identity blockers, week framing, verification, and provider accounting.

### Stage D — automated Generic closing COMMIT

Separate authorization required and only after at least one real manual Generic T−30 COMMIT has been independently verified.

The closing write target remains only `ShadowModelClosingMarketSnapshot`.

No contract stage grants blanket model-prediction COMMIT permission.

---

## 8. Source/ref safety

Scheduled automation has no human-supplied `expected_main_sha`, so V1 freezes this alternative safety rule:

- checkout must be `refs/heads/main`;
- record the exact checked-out `HEAD` SHA in the artifact;
- fail if the workflow is not running from `main`;
- no self-modification, branch switching, or detached arbitrary ref;
- every artifact must pin the runtime SHA used for its decisions/writes.

Manual workflows keep their existing explicit expected-SHA guards unchanged.

---

## 9. Concurrency and idempotency

Use one production concurrency group for automated T−30 orchestration with `cancel-in-progress: false`.

A later cycle may safely observe work persisted by an earlier cycle.

Required idempotency:

- existing Generic closing row -> no replacement / no refresh;
- same persisted market fingerprint -> existing Live Odds writer behavior governs duplicate handling;
- multiple capture runs may legitimately create separate per-prediction closing rows for the same physical game/market observation;
- never mutate an earlier closing to a newer or “better” line.

---

## 10. Observability

Every cycle must upload a machine-readable report, including when nothing happens.

Minimum report fields:

- observed timestamp;
- runtime SHA;
- season/week;
- eligible capture run IDs and model IDs;
- counts of `EXISTING`, `FUTURE`, `DUE`, `MISSED`;
- upcoming target groups;
- `marketRefreshWindowOpen` count;
- `marketRefreshNeeded` boolean and reasons;
- provider calls attempted/succeeded;
- provider credits when available;
- closing rows planned/inserted;
- AVAILABLE/UNAVAILABLE counts;
- MISSED count;
- blockers;
- `writeSafe`;
- mutation targets invoked;
- postwrite verification status.

Recommended top-level cycle outcome enum:

- `NO_ACTION`
- `PREVIEW_ONLY`
- `MARKET_REFRESH_NOT_NEEDED`
- `MARKET_REFRESHED`
- `CLOSINGS_CAPTURED`
- `MARKET_REFRESHED_AND_CLOSINGS_CAPTURED`
- `MISSED_TARGET_PRESENT`
- `BLOCKED`
- `FAILED`

A green workflow without a valid report is insufficient evidence.

---

## 11. Failure behavior

Fail closed on:

- wrong season/week frame;
- unknown capture run identity;
- unsupported closing definition;
- capture-run/prediction frame mismatch;
- kickoff/team identity contradiction;
- Live Odds unresolved/ambiguous expected FBS game;
- provider response or persistence verification failure;
- database transaction failure;
- unexpected write target;
- postwrite verification failure;
- runtime not on `main`;
- evidence that would require after-target fall-forward.

Do not convert a failed refresh into permission to persist a post-target line.

---

## 12. Manual fallback remains canonical

The existing manual guarded workflows remain available throughout V1 rollout.

If automation is disabled, blocked, or fails before target, a human may use the existing guarded manual paths while the legitimate window remains open.

A human fallback still may not backfill after kickoff or use post-target market evidence as a T−30 close.

---

## 13. Explicitly out of scope

V1 does not authorize:

- automatic Generic prediction capture;
- automatic Candidate B prediction capture;
- Hybrid automation;
- ATS/CLV/ROI evaluation;
- model promotion;
- lifecycle updates;
- Official Card generation;
- score/grading automation;
- provider-call cadence unrelated to approaching Generic T−30 targets;
- retroactive reconstruction of missed closes;
- changing the 30-minute closing benchmark;
- changing Candidate B or Core formulas.

---

## 14. Required implementation sequence after contract merge

1. Independent contract audit.
2. Pure coordinator planner + deterministic tests.
3. Manual coordinator PREVIEW workflow with provider/write disabled.
4. Production PREVIEW/no-op proof.
5. Independently verify at least one manual real Generic T−30 COMMIT through the existing manual workflow.
6. Add automated market-refresh capability in a separate PR; initially schedule-disabled.
7. Add automated closing-COMMIT capability in a separate PR; initially schedule-disabled.
8. Enable scheduled production operation only through a separate explicit authorization/change after prior stages are proven.

Do not combine contract freeze, scheduler enablement, provider-backed automation, and automated closing COMMIT into one PR.
