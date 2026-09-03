# Shadow Snapshot Contract V1

**Status:** CONTRACT / DESIGN ONLY — not implemented

**Phase:** 4B

**Evaluation protocol:** `CORE_EVAL_V1` (preserved; not revised)

**Verified production baseline entering this work:** `2274f8c2c65e685207f167389f3bfb4527d6f729`

This document freezes the prospective Shadow Snapshot V1 contract.

It does **not** authorize Prisma schema, migration, writer, workflow, API, UI, grading, provider calls, Hybrid activation, official Bet changes, MatchupOutput changes, or model formula changes.

No implementation is in scope for the PR that introduces this file.

---

## 1. Purpose

2026 Hybrid V2 / Super Tier A performance must eventually be evaluated from **genuinely point-in-time frozen predictions**, not from live mutable recalculation.

Today:

- `/labs/hybrid` is **LIVE / MUTABLE SHADOW**.
- Official `Bet` rows are the **Core V1 Official Card**, not a Hybrid shadow ledger.
- `MatchupOutput` is not the prospective shadow ledger.

This contract defines the append-only capture, closing-benchmark, and later-evaluation entities required before any writer exists.

The first legitimate prospective record begins only after:

1. this contract is frozen and merged
2. implementation is separately reviewed and merged
3. a qualifying pre-kickoff capture is actually executed

---

## 2. Governing state

These are frozen product facts, not design choices of this contract:

- **Core V1** remains the official 2026 production spread model (`official_flat_100`).
- **Hybrid V2** remains **SHADOW / HELD / NOT OFFICIAL**.
- **Hybrid Super Tier A** remains **SHADOW / HELD**.
- **V4 / Fade V4** remain **historical / backtest**.
- Official Bet rows are **not** the shadow ledger.
- MatchupOutput is **not** the prospective shadow ledger.
- No existing 2026 live Hybrid recalculation may be retroactively converted into a prospective record.
- No Hybrid production activation is authorized.
- No model formula change is authorized.

---

## 3. CORE_EVAL_V1 timing rules (preserved exactly)

This contract **preserves** `CORE_EVAL_V1`. It does **not** invent a new prediction lead-time rule and does **not** change these timing rules:

- **Prediction-time market freshness <= 30 minutes**
- **Closing-market snapshot 30 minutes pre-kickoff** (`kickoff - 30 minutes`)

### 3.1 Prediction-market temporal eligibility (frozen)

Prediction-time MarketLine eligibility **must** satisfy:

```text
marketTimestamp <= predictionTimestamp
marketAge = predictionTimestamp - marketTimestamp
0 <= marketAge <= 30 minutes
```

A **future-dated** market observation (`marketTimestamp > predictionTimestamp`, negative market age) must **never** qualify merely because a negative age is numerically `<= 30 minutes`.

Eligibility **fails closed** when:

- no eligible observation exists with `marketTimestamp <= predictionTimestamp`, or
- `marketAge` is outside `[0, 30 minutes]`

Do **not** use a later market row to repair a stale prediction after the fact.

Do **not** fall forward to a market observation after the T-30 closing target.

### 3.2 Authoritative predictionTimestamp (frozen)

`predictionTimestamp` is the system-observed timestamp of the actual prospective capture operation for that snapshot / run.

- It is **immutable** after capture.
- It must **not** be supplied as an arbitrary historical timestamp by the operator or workflow input.
- It must **not** be backdated.
- It must satisfy: `predictionTimestamp < kickoffTimestamp`
- Any snapshot attempted at or after kickoff is Hybrid prediction **UNAVAILABLE** with `post_kickoff`.

The operator / workflow may choose **when** to execute a declared capture context. It may **not** choose **what historical time** the resulting record claims to have been captured.

If implementation later uses one run-level timestamp for all game rows versus tightly system-observed per-row timestamps, that physical choice may remain open **only if** these semantics remain true and the chosen behavior is explicit and deterministic.

All as-of evidence used by the snapshot must be observable **no later than** `predictionTimestamp`.

This does **not** invent a new minimum lead time before kickoff. `CORE_EVAL_V1` remains unchanged.

---

## 4. What this is not

| Artifact | Role relative to this contract |
|----------|--------------------------------|
| Official `Bet` (`official_flat_100`) | Production Official Card. Not the shadow ledger. |
| Live `/labs/hybrid` / Hybrid slate API | Live mutable research. Not a frozen prospective record. |
| `MatchupOutput` | Not the prospective shadow ledger. |
| Historical 2025 V4 / Hybrid / Super Tier A | Historical / backtest context only. |

A friendly string such as `"hybrid_v2"` alone is **not** sufficient immutable model identity.

---

## 5. Four logical entities

Implementation table names are **not** frozen here. The behavioral entities are.

1. **Shadow Capture Run** — immutable envelope for one prospective model capture
2. **Shadow Prediction Snapshot** — one immutable game observation inside that capture (available **or** unavailable)
3. **Shadow Closing Market Snapshot** — separate immutable T-30 closing benchmark
4. **Shadow Evaluation Result** — later result linked without mutating prediction facts

---

## 6. Shadow Capture Run

An immutable envelope for a prospective model capture of one season/week Game frame.

### 6.1 Capture context / intent (mandatory)

Every formal Capture Run **must** have a **declared capture context / intent before execution**.

This is not a new prediction lead-time rule. It is anti-cherry-picking / anti-double-counting semantics.

If multiple prospective captures exist for the same game:

- retain **all** of them
- **never** overwrite an earlier capture
- treat different capture contexts as **separate evaluation cohorts**
- **never** choose the “best” capture after the outcome
- **never** collapse multiple contexts into one record without explicit **predeclared** reporting methodology

Within one:

```text
evaluation protocol
+ model / shadow definition
+ capture context
+ game
```

a game may contribute **at most once** to that reported cohort.

Exact key encoding and exact workflow schedule remain implementation questions. The behavioral uniqueness and no-post-outcome-selection rules are frozen.

### 6.2 Minimum frozen concepts

- capture / run ID (technical record ID)
- declared capture context / intent
- season
- week
- evaluation protocol = `CORE_EVAL_V1`
- model family
- prediction / model definition identifier and hash (section 13A)
- evaluation / selection / qualification policy identifier and hash (section 13B)
- or one canonical broader shadow-definition manifest that contains both subsections
- repository commit SHA
- capture timestamp
- complete expected Game frame / game IDs
- total games
- Hybrid prediction available count
- Hybrid prediction unavailable count
- Super Tier A / qualification determinacy counts (separate from Hybrid prediction coverage)
- V4-comparator provenance coverage counts (separate from Super Tier A determinacy)
- capture status

### 6.3 Game-frame denominator

A formal capture **must** preserve the full eligible Game frame even when the model cannot compute some games.

If 51 games exist and Hybrid computes only 20:

| Field | Value |
|-------|------:|
| totalGames | 51 |
| Hybrid prediction available | 20 |
| Hybrid prediction unavailable | 31 |

Do **not** persist only the 20 successful predictions and later describe that as complete model coverage.

**Hybrid prediction coverage, Super Tier A qualification determinacy, and V4-comparator provenance coverage are separate reports.** A game can have an AVAILABLE Hybrid prediction that is Super Tier A `NOT_QUALIFIED` even when V4 provenance is `PROVENANCE_UNAVAILABLE`, if Super Tier A is already decided by `NO_SELECTION` or `absSpreadEdge < 4.0`. V4 provenance is decision-relevant only when a HOME/AWAY selection has `absSpreadEdge >= 4.0`. Do not drop those games from any denominator.

Capture status must be able to represent at least:

- complete expected frame with mixed available / unavailable Hybrid predictions
- mixed Super Tier A qualification determinacy on available Hybrid predictions
- mixed V4-comparator provenance coverage, reported separately
- rejected / failed capture (no silent partial overwrite)

How expected Game IDs are physically stored (normalized rows vs frozen JSON) is an implementation question. The **complete Game-frame set must be frozen either way**.

---

## 7. Shadow Prediction Snapshot

One immutable game observation within a capture.

The record must support **both**:

- **A. AVAILABLE Hybrid prediction**
- **B. UNAVAILABLE Hybrid prediction state**

Unavailable Hybrid games must **not** silently disappear.

Hybrid prediction availability is **not** the same as Super Tier A / V4 qualification availability.

### 7.1 Identity / context

- snapshot ID (technical record ID)
- capture / run ID
- declared capture context / intent of the parent run
- game ID
- season
- week
- home team ID
- away team ID
- kickoff timestamp
- neutral-site flag
- prediction timestamp (system-observed capture time; section 3.2)

### 7.2 Definition identity / provenance

- model family
- prediction / model definition ID and hash (section 13A)
- evaluation / selection / qualification policy ID and hash (section 13B)
- or one canonical broader shadow-definition manifest containing both
- repository commit SHA (stored separately)
- evaluation protocol = `CORE_EVAL_V1`

`"hybrid_v2"` / a strategy tag / a UI label is **not** immutable identity.

Changing only a Super Tier A **filter** does **not** change the underlying predictive Hybrid formula. That change belongs in the evaluation / qualification policy identity, not the prediction/model math identity.

### 7.3 Hybrid input freeze

Freeze the **exact values used**, not merely foreign-key references.

At minimum:

- home V1 rating
- away V1 rating
- rating model / source provenance
- rating source timestamps / version information available at capture
- home unit-grade values
- away unit-grade values
- unit-grade row IDs / timestamps where available
- exact input payload
- SHA-256 input hash
- weather **state used by the model**, including an explicit **null / none** when weather is not used

Per-game weather **values** belong in the frozen input payload / hash. Weather **behavior** belongs in the prediction/model definition (section 13A).

**Do not silently convert missing inputs to zero.**

If a required Hybrid input is missing, Hybrid `predictionStatus` is **UNAVAILABLE** with an explicit reason. Rating `0` is a valid persisted rating when actually present; absence is not `0`.

Missing V4 provenance does **not** make Hybrid `predictionStatus` UNAVAILABLE.

### 7.4 Hybrid prediction availability vs qualification availability

Exact enum names are not locked. The behavioral dimensions are frozen.

**predictionStatus**

- `AVAILABLE`
- `UNAVAILABLE`

**v4ComparisonStatus**

- `SIDE_AVAILABLE` — V4 side HOME/AWAY was prospectively available at or before the Hybrid prediction timestamp
- `VERIFIED_NO_SELECTION` — V4 was prospectively evaluated and verifiably produced no selection
- `PROVENANCE_UNAVAILABLE` — V4 state / provenance cannot be established as-of the Hybrid prediction timestamp

**qualificationStatus**

- `QUALIFIED`
- `NOT_QUALIFIED`
- `UNAVAILABLE`

Rules:

1. If Hybrid inputs and the prediction market are valid, the Hybrid prediction remains **AVAILABLE** even when V4 provenance is unavailable.
2. `hybrid_only` requires a **VERIFIED** no-V4-selection state (`v4ComparisonStatus = VERIFIED_NO_SELECTION`). Do **not** treat “no V4 row found” as proof that V4 legitimately made no pick.
3. Super Tier A `qualificationStatus` is **not** universally `UNAVAILABLE` merely because V4 provenance is missing. V4 is decision-relevant only in the Super Tier A path defined in section 7.8.

V4 as-of provenance must be sufficient to establish that the comparator state existed **at or before** the Hybrid `predictionTimestamp`. Do not reconstruct V4 later with hindsight.

### 7.5 Computed prediction freeze (AVAILABLE Hybrid snapshots)

When Hybrid `predictionStatus` is AVAILABLE, freeze:

- Core V1 comparison HMA (production Core V1, not Hybrid’s internal simple V1 component)
- V2 HMA
- final Hybrid HMA (`hybridSpreadHma`)
- prediction-market HMA (`predictionMarketHma`)
- selected MarketLine row technical ID
- signed Hybrid ATS edge and absolute edge
- selected side: `HOME` / `AWAY` / `NO_SELECTION`
- selected team ID (`null` when `NO_SELECTION`)
- team-sided ATS pick line (`null` when `NO_SELECTION`)

Core V1 comparison, V2, and Hybrid favorites / HMAs are independent derived values. V2 favorite is derived from V2 HMA. Hybrid favorite is derived from Hybrid HMA. Core V1 is the production Core V1 calculation from persisted V1 ratings plus effective HFA.

### 7.6 Signed Hybrid ATS edge and selection convention (frozen)

```text
spreadEdgeHma = hybridSpreadHma - predictionMarketHma
absSpreadEdge = abs(spreadEdgeHma)
```

Prospective Hybrid V2 selection convention (matches the existing historical Hybrid synthetic-selection threshold; does **not** alter Super Tier A `>= 4.0`):

```text
abs(spreadEdgeHma) < 0.1  -> NO_SELECTION
spreadEdgeHma >= +0.1     -> HOME
spreadEdgeHma <= -0.1     -> AWAY
```

`NO_SELECTION` is an **AVAILABLE** model observation, not an unavailable game. Continue freezing both `spreadEdgeHma` and `absSpreadEdge`.

Team-sided ATS pick line is **not** canonical HMA. When a side is selected:

- HOME pick line = `-predictionMarketHma`
- AWAY pick line = `predictionMarketHma`

Do not relabel HMA as a pick line.

### 7.7 Market provenance at prediction

For an AVAILABLE market-backed Hybrid prediction, preserve the selected MarketLine row technical ID. Current MarketLine rows have technical IDs.

Also freeze:

- selected MarketLine `teamId` / signed-row side
- signed row line value
- canonical market HMA
- actual market favorite if useful
- book
- source
- market timestamp
- prediction timestamp
- `marketAge = predictionTimestamp - marketTimestamp`

`MarketLine.teamId` is the **signed-row side**, not necessarily the market favorite. Canonical HMA and actual favorite must remain distinct from the selected row’s `teamId`.

Prediction-market selector ordering is frozen as:

```text
timestamp DESC
then id DESC
```

subject to `marketTimestamp <= predictionTimestamp` and `0 <= marketAge <= 30 minutes`.

This docs PR does **not** change the broader current book-selection policy. The eventual selector behavior / version **must** be part of the frozen evaluation / selection definition (section 13B). After capture, the selected row is frozen. Do **not** later swap in a newer row.

**Fail closed** for Hybrid `predictionStatus` if:

- no eligible prediction-time market exists (`missing_market`), or
- market is future-dated or `marketAge` is outside `[0, 30 minutes]` (`stale_market`), or
- kickoff is not eligible for a prospective capture (`post_kickoff`)

A later market row must **not** repair a stale or missing prediction after the fact.

### 7.8 Super Tier A / V4 dependency (decision-relevant, not universally required)

Frozen Super Tier A rule remains **unchanged**. Super Tier A requires **all** of:

- actual Hybrid selection `HOME` or `AWAY` (not `NO_SELECTION`)
- **AND** `absSpreadEdge >= 4.0`
- **AND** `hybridConflictType = hybrid_strong`

V4 provenance is **not** required to reach a known Super Tier A result in every case.

**A.** Hybrid `selectedSide = NO_SELECTION`

- `qualificationStatus = NOT_QUALIFIED`
- V4 provenance is **not** required to reach that Super Tier A result

**B.** Hybrid has a `HOME`/`AWAY` selection but `absSpreadEdge < 4.0`

- `qualificationStatus = NOT_QUALIFIED`
- V4 provenance is **not** required to reach that Super Tier A result

**C.** Hybrid has a `HOME`/`AWAY` selection **AND** `absSpreadEdge >= 4.0`

- the V4 comparator **becomes decision-relevant**
- if V4 side / provenance is established:
  - `hybrid_strong` → `QUALIFIED`
  - `hybrid_weak` / verified `hybrid_only` → `NOT_QUALIFIED`
- if V4 provenance cannot be established:
  - `qualificationStatus = UNAVAILABLE`
  - `missing_v4_provenance`
  - **no Super Tier A claim**

`v4ComparisonStatus` may still be `PROVENANCE_UNAVAILABLE` in cases A or B. That must **not** turn a logically known Super Tier A `NOT_QUALIFIED` result into `UNAVAILABLE`.

Report V4-comparator provenance coverage **separately** from Super Tier A qualification determinacy when needed.

V4 comparator states, when captured, remain:

| V4 comparator state at or before Hybrid `predictionTimestamp` | Meaning |
|--------------------------------------------------------------|---------|
| `SIDE_AVAILABLE` | V4 side HOME/AWAY was prospectively available |
| `VERIFIED_NO_SELECTION` | V4 was prospectively evaluated and verifiably produced no selection |
| `PROVENANCE_UNAVAILABLE` | V4 state / provenance cannot be established as-of `predictionTimestamp` |

When `SIDE_AVAILABLE` and Hybrid has a `HOME`/`AWAY` selection:

| Condition | `hybridConflictType` |
|-----------|----------------------|
| Hybrid vs V4 disagreement | `hybrid_strong` |
| Hybrid vs V4 agreement | `hybrid_weak` |

`hybrid_only` requires `VERIFIED_NO_SELECTION`. It is never inferred from “no V4 row found.”

Freeze enough V4 as-of provenance to reproduce the **decision-relevant** qualification path. At minimum:

- `v4ComparisonStatus`
- V4 comparison side used at capture when `SIDE_AVAILABLE`
- source / provenance of that V4 state
- source row / reference if one exists
- as-of evidence that the comparator existed at or before the Hybrid `predictionTimestamp`
- `hybridConflictType` when established
- `tierBucket` when established
- `isSuperTierA`
- `qualificationStatus`

Super Tier A is **not** a separate prediction model and must **not** create a duplicate independent prediction record. It is a qualification on an AVAILABLE Hybrid V2 snapshot.

Do not reconstruct V4 later using hindsight.

V4 / Fade remain historical / backtest. Freezing V4 comparison side at Hybrid capture does **not** authorize V4 as a 2026 production model.

### 7.9 Unavailable Hybrid-prediction reasons

Each Hybrid-unavailable snapshot must retain explicit reason(s). Hybrid-prediction unavailability vocabulary includes:

- `missing_rating`
- `missing_unit_grades`
- `stale_market`
- `missing_market`
- `post_kickoff`
- `invalid_model_output`

`missing_v4_provenance` is a **qualification** reason, **not** a Hybrid-prediction unavailability reason. It makes Super Tier A `qualificationStatus = UNAVAILABLE` **only** on the decision-relevant path (HOME/AWAY and `absSpreadEdge >= 4.0`).

Additional explicit reasons may be added later only if they are equally fail-closed and do not invent values.

Do **not** invent zero values for missing inputs.

---

## 8. Shadow Closing Market Snapshot

A **separate** immutable closing benchmark.

The prediction record itself must **not** be mutated to add a closing line.

### 8.1 Target time (frozen)

`kickoff - 30 minutes`

This contract does **not** change the frozen T-30 rule.

### 8.2 Minimum fields / concepts

- closing snapshot ID (technical record ID)
- game ID
- evaluation protocol = `CORE_EVAL_V1`
- market type
- target timestamp = kickoff - 30 minutes
- selector / evaluation-policy identity or hash under which the closing row was chosen (section 13B)
- signed-row team ID / value
- canonical market HMA
- book
- source
- actual selected market observation timestamp
- capture / evaluation timestamp
- AVAILABLE / UNAVAILABLE state
- explicit unavailable reason

For a Shadow Closing Market Snapshot with status **AVAILABLE**:

- selected MarketLine technical ID is **REQUIRED**, not merely “if available”
- preserve the selector / evaluation-policy identity or hash under which that closing row was chosen
- preserve `targetTimestamp = kickoff - 30 minutes`
- preserve the actual selected market observation timestamp
- preserve `timestamp DESC, id DESC` selection semantics
- preserve no fall-forward after T-30

This allows a frozen closing observation to prove not only **what** row was chosen but **which frozen selection policy** chose it.

If the snapshot is UNAVAILABLE, MarketLine ID may be absent; do not invent a row.

Signed-row side vs canonical HMA vs actual favorite remain distinct, as at prediction time.

### 8.3 Selection semantics for formal evaluation

- Use the deterministic latest eligible stored market observation **at or before** the T-30 target.
- Deterministic tie breaking must be preserved: **timestamp DESC, then id DESC**.
- Do **NOT** fall forward to a market observation after the T-30 target.
- If no eligible observation exists, mark the closing benchmark **UNAVAILABLE** rather than inventing one.

Do not copy a post-T-30 line into this snapshot to “complete” coverage.

---

## 9. Shadow Evaluation Result

Results must be linked later **without mutating** the frozen prediction facts.

### 9.1 Minimum concepts

- prediction snapshot ID
- closing-market snapshot ID when available
- final home score
- final away score
- ATS result: `WIN` / `LOSS` / `PUSH` / `NOT_APPLICABLE` / `UNAVAILABLE` (exact spelling is an implementation choice; the behavioral distinction is frozen)
- `sideMargin` / `coverMargin` as defined below
- shadow CLV as defined below, or unavailable
- shadow PnL / stake under the research comparison convention below, when graded
- evaluation timestamp
- result source / provenance

### 9.2 ATS settlement (frozen)

Behaviorally distinguish at least:

- `WIN`
- `LOSS`
- `PUSH`
- `NOT_APPLICABLE`
- `UNAVAILABLE`

Exact enum spelling can remain an implementation choice.

Rules:

- `selectedSide = NO_SELECTION` → ATS evaluation = `NOT_APPLICABLE`; no shadow stake; no PnL; no ATS CLV. This is **not** missing / ungradable evidence.
- `selectedSide` `HOME`/`AWAY` with missing final result → ATS evaluation = `UNAVAILABLE`
- `selectedSide` `HOME`/`AWAY` with final scores → settle as below

`NO_SELECTION` observations remain part of Hybrid **prediction coverage** but **not** the graded-wager denominator.

Do not treat a deliberate `NO_SELECTION` as missing/ungradable evidence.

Applies when Hybrid `predictionStatus` is AVAILABLE and selected side is `HOME` or `AWAY` and final scores exist.

For the frozen selected team:

```text
HOME: sideMargin = homeScore - awayScore
AWAY: sideMargin = awayScore - homeScore
coverMargin = sideMargin + predictionPickLine
```

Settlement:

```text
coverMargin > 0  -> win
coverMargin = 0  -> push
coverMargin < 0  -> loss
```

Implementation may use an appropriately tiny numeric epsilon solely for floating representation. It may **not** use a different football settlement rule (including Official Bet’s half-point push band).

If the T-30 benchmark is unavailable and selected side is `HOME`/`AWAY` with scores:

- ATS result **may still be graded from scores**
- CLV remains **unavailable**

### 9.3 Shadow CLV (frozen; not Official Bet CLV)

Convert the T-30 canonical closing HMA to the **selected team’s** signed line:

```text
HOME: closingTeamLine = -closingMarketHma
AWAY: closingTeamLine = closingMarketHma
clvPoints = predictionPickLine - closingTeamLine
```

Positive CLV means the prediction snapshot captured the better ATS number.

`NO_SELECTION` has **no ATS CLV** (`NOT_APPLICABLE`). Missing T-30 on a HOME/AWAY selection makes CLV `UNAVAILABLE`, not `NOT_APPLICABLE`.

Examples:

- prediction HOME `-3`, T-30 HOME `-4` → CLV `+1`
- prediction DOG `+7`, T-30 DOG `+6` → CLV `+1`

Do **not** reuse Official Bet CLV semantics blindly. Official spread CLV uses `closeLine - modelLine`. Shadow Snapshot V1 uses the selected-team / T-30 definition above.

### 9.4 Shadow / research spread ROI convention (frozen)

This is a **SHADOW / RESEARCH comparison convention**, not an official wager and not a claim that the sportsbook actually offered `-110`.

It preserves comparability with the existing historical Hybrid / V4 synthetic evaluation convention (`FLAT_STAKE = 100`, spread PnL at assumed `-110`):

- theoretical flat stake = `$100`
- assumed spread price = `-110`
- win PnL = `+$90.90`
- loss PnL = `-$100`
- push PnL = `$0`
- ROI = graded shadow PnL / graded shadow stake

Do not mix `NOT_APPLICABLE` (`NO_SELECTION`) or ungraded snapshots into graded stake without an explicit predeclared methodology.

### 9.5 Score corrections

If a final-score correction requires re-evaluation, preserve auditability.

Preferred contract: **append a new evaluation revision** (or otherwise preserve the prior result revision).

**Never** modify the original prediction facts.

**Never** modify the original closing-market facts.

Exact revision-row vs other audited-history mechanism is an implementation question; the behavioral rule is frozen.

---

## 10. Append-only / idempotency

Frozen principles:

- Prediction facts are immutable after insertion.
- Closing-market facts are immutable after insertion.
- No `UPDATE` may silently replace a prediction with newer model / market data.
- Retrying an identical capture must be **idempotent**.
- If the deterministic identity already exists and frozen facts differ, **fail closed** rather than overwrite.
- Duplicate conflicting snapshots must be surfaced as an **integrity error**.
- Multiple capture contexts for the same game are retained as separate cohorts; none may be overwritten or post-selected after the outcome.

### 10.1 Technical ID vs deterministic evaluation identity

Distinguish:

| Kind | Role |
|------|------|
| Technical record ID | Storage primary key. Opaque. Not the evaluation identity. |
| Deterministic evaluation identity | Behavioral uniqueness key for one reported cohort. |

Recommended deterministic identity is based on:

- game
- evaluation protocol (`CORE_EVAL_V1`)
- shadow definition (prediction/model identity **and** evaluation/qualification policy identity, not merely `"hybrid_v2"`)
- declared capture context

Within that identity, a game contributes at most once.

Do **not** lock a Prisma index design yet. Freeze the **behavioral uniqueness rule** first. Exact capture-key encoding is an implementation question.

---

## 11. Coverage / survivorship-bias rule

A formal capture must preserve the full eligible Game frame.

Live mutable Hybrid UI remaining at 0 computed / 51 unavailable is **not** a prospective ledger. When a prospective capture later runs, unavailable Hybrid games remain in the Hybrid-prediction denominator with explicit reasons.

Report Hybrid prediction coverage separately from Super Tier A qualification determinacy, and report V4-comparator provenance coverage separately from both.

Do not report Super Tier A performance on a subset whose V4 comparator was reconstructed later.

Do not report performance only on the successfully computed Hybrid subset as if that were complete Hybrid coverage.

Do not choose among multiple capture contexts after outcomes are known.

---

## 12. No retrospective 2026 backfill

Existing 2026 live / mutable Hybrid calculations made **before** the prospective snapshot path exists are **NOT** eligible to be converted into a prospective record.

That includes:

- `/labs/hybrid` live recalculation
- Hybrid slate API rows
- any ad-hoc notebook or export of current Hybrid numbers
- any attempt to attach a later T-30 line onto a prediction that was never frozen

The first legitimate prospective record begins only after this contract is frozen and merged, implementation is separately reviewed and merged, and a qualifying pre-kickoff capture is actually executed.

Historical 2025 V4 / Hybrid / Super Tier A data remains **historical / backtest context only**.

---

## 13. Shadow definition manifest

Implementation must use a canonical definition manifest. Prefer one broader **shadow definition manifest** with two explicit subsections, or two separately stored/hashed identities. Repository commit SHA remains **separate**.

Do **not** define any hash as merely `SHA("hybrid_v2")`.

Do **not** say that changing only the Super Tier A filter changes the underlying predictive Hybrid formula.

### 13A. Prediction / model definition identity

Hash changes if Hybrid **math** / prediction-defining model behavior changes:

- Hybrid / V1 / V2 formula identity
- Hybrid blend weights
- V2 scale
- matchup weights
- HFA behavior
- weather behavior

Actual per-game weather **values** belong in the frozen input payload / hash, not this subsection.

### 13B. Evaluation / selection / qualification policy identity

Hash changes if evaluation, selection, market-eligibility, conflict, or research-ROI policy changes, including:

- `CORE_EVAL_V1`
- prediction market selector / version
- edge formula (`spreadEdgeHma = hybridSpreadHma - predictionMarketHma`)
- `0.1` selection threshold
- side convention (`HOME` / `AWAY` / `NO_SELECTION`)
- V4 conflict semantics and as-of provenance rules
- Super Tier A rule
- shadow stake / `-110` ROI convention

A capture using a different shadow-definition hash is a different evaluation identity, even on the same game week.

---

## 14. Out of scope for this contract PR

- Prisma model / table names
- migration SQL
- writer implementation
- workflow YAML
- UI
- API
- grading implementation
- provider calls
- TeamUnitGrades generation
- Hybrid activation
- official Bet changes
- MatchupOutput changes
- model formula changes
- Phase 4C Labs cleanup

---

## 15. Open implementation questions

These are **not** guessed here:

1. Exact Prisma model / table names
2. Whether result corrections use revision rows or another audited history mechanism
3. Exact deterministic capture-key encoding
4. Eventual manual workflow naming / confirmation phrase
5. Whether run-level expected Game IDs are normalized rows or frozen JSON
6. Exact enum spellings for `predictionStatus` / `v4ComparisonStatus` / `qualificationStatus` / ATS evaluation states (behavioral distinctions are frozen)
7. Exact capture-context vocabulary / labels, provided they are declared **before** execution
8. Broader book-selection policy version identifier, provided selector **behavior/version** is stored in section 13B
9. Run-level versus per-row physical storage of `predictionTimestamp`, provided section 3.2 semantics remain true and explicit

Not open questions (already frozen above):

- `CORE_EVAL_V1` timing rules
- authoritative `predictionTimestamp` is system-observed, immutable, not operator-backdated, and strictly pre-kickoff
- `marketTimestamp <= predictionTimestamp` and `0 <= marketAge <= 30 minutes`
- future-dated prediction markets cannot qualify
- prediction-market selector order `timestamp DESC, then id DESC`
- signed `spreadEdgeHma` and `0.1` Hybrid selection threshold
- `NO_SELECTION` is AVAILABLE Hybrid observation and ATS `NOT_APPLICABLE`
- ATS `coverMargin` settlement signs
- shadow `clvPoints = predictionPickLine - closingTeamLine`
- shadow `$100` / `-110` / `+$90.90` research ROI convention
- Super Tier A rule (`HOME`/`AWAY` and `hybrid_strong` and `absSpreadEdge >= 4.0`)
- V4 provenance is decision-relevant only when HOME/AWAY and `absSpreadEdge >= 4.0`
- `NO_SELECTION` or `absSpreadEdge < 4.0` is Super Tier A `NOT_QUALIFIED` even if V4 provenance is unavailable
- Hybrid prediction coverage distinct from qualification determinacy and from V4-comparator provenance coverage
- `hybrid_only` requires verified no-V4-selection; missing V4 provenance does not erase Hybrid
- V4 as-of provenance at or before Hybrid `predictionTimestamp`
- AVAILABLE T-30 closing snapshot requires MarketLine technical ID and selector-policy provenance
- Game-frame denominator / unavailable Hybrid input states
- no retrospective 2026 backfill
- append-only prediction and closing facts
- multiple capture contexts retained; no post-outcome cherry-pick / double-count
- fail-closed stale / missing market
- no fall-forward past T-30
- shadow definition has separate prediction-math vs evaluation-policy identities
- Super Tier A is not a separate prediction model
