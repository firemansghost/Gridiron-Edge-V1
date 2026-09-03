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

Eligibility **fails closed** when the prediction-time market exceeds the frozen <=30-minute freshness requirement.

Do **not** use a later market row to repair a stale prediction after the fact.

Do **not** fall forward to a market observation after the T-30 closing target.

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

### 6.1 Minimum frozen concepts

- capture / run ID (technical record ID)
- season
- week
- evaluation protocol = `CORE_EVAL_V1`
- model family
- immutable model version / definition identifier
- model-definition payload or canonical manifest reference
- SHA-256 model-definition hash
- repository commit SHA
- capture timestamp
- complete expected Game frame / game IDs
- total games
- available predictions
- unavailable games
- capture status

### 6.2 Game-frame denominator

A formal capture **must** preserve the full eligible Game frame even when the model cannot compute some games.

If 51 games exist and Hybrid computes only 20:

| Field | Value |
|-------|------:|
| totalGames | 51 |
| available | 20 |
| unavailable | 31 |

Do **not** persist only the 20 successful predictions and later describe that as complete model coverage.

Capture status must be able to represent at least:

- complete expected frame with mixed available / unavailable predictions
- rejected / failed capture (no silent partial overwrite)

How expected Game IDs are physically stored (normalized rows vs frozen JSON) is an implementation question. The **complete Game-frame set must be frozen either way**.

---

## 7. Shadow Prediction Snapshot

One immutable game observation within a capture.

The record must support **both**:

- **A. AVAILABLE prediction**
- **B. UNAVAILABLE prediction state**

Unavailable games must **not** silently disappear.

### 7.1 Identity / context

- snapshot ID (technical record ID)
- capture / run ID
- game ID
- season
- week
- home team ID
- away team ID
- kickoff timestamp
- neutral-site flag
- prediction timestamp

### 7.2 Model identity / provenance

- model family
- model version / definition ID
- canonical model-definition payload or manifest reference
- SHA-256 model-definition hash
- repository commit SHA
- evaluation protocol = `CORE_EVAL_V1`

`"hybrid_v2"` / a strategy tag / a UI label is **not** immutable model identity. The definition hash must change if prediction-defining behavior changes. Repository commit SHA is stored **separately** from the definition hash.

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
- weather state used by the model, including an explicit **null / none** when weather is not used

**Do not silently convert missing inputs to zero.**

If a required input is missing, the snapshot is **UNAVAILABLE** with an explicit reason. Rating `0` is a valid persisted rating when actually present; absence is not `0`.

### 7.4 Computed prediction freeze (available snapshots)

When the prediction is AVAILABLE, freeze:

- Core V1 comparison HMA (production Core V1, not Hybrid’s internal simple V1 component)
- V2 HMA
- final Hybrid HMA
- selected side: `home` / `away` / `none`
- selected team ID
- team-sided ATS pick line
- prediction-market HMA
- spread edge in points

Team-sided ATS pick line is **not** canonical HMA.

Frozen conversion from canonical market HMA:

- selected HOME side line = `-marketSpreadHma`
- selected AWAY side line = `marketSpreadHma`

Do not relabel HMA as a pick line.

Core V1 comparison, V2, and Hybrid favorites / HMAs are independent derived values. V2 favorite is derived from V2 HMA. Hybrid favorite is derived from Hybrid HMA. Core V1 is the production Core V1 calculation from persisted V1 ratings plus effective HFA.

### 7.5 Market provenance at prediction

Freeze:

- selected MarketLine ID when available
- selected MarketLine `teamId` / signed-row side
- signed row line value
- canonical market HMA
- actual market favorite if useful
- book
- source
- market timestamp
- prediction timestamp
- calculated market age

`MarketLine.teamId` is the **signed-row side**, not necessarily the market favorite. Canonical HMA and actual favorite must remain distinct from the selected row’s `teamId`.

Keep existing latest-eligible-line selection semantics at capture time. After capture, that selected row is frozen. Do **not** later swap in a newer row.

**Fail closed** if:

- no eligible prediction-time market exists (`missing_market`), or
- calculated market age exceeds prediction-time freshness **<= 30 minutes** (`stale_market`), or
- kickoff is not eligible for a prospective capture (`post_kickoff`)

A later market row must **not** repair a stale or missing prediction after the fact.

### 7.6 Super Tier A / V4 dependency (mandatory)

Current frozen Hybrid conflict semantics depend on V4 comparison side:

| Condition | `hybridConflictType` |
|-----------|----------------------|
| Hybrid vs V4 disagreement | `hybrid_strong` |
| Hybrid vs V4 agreement | `hybrid_weak` |
| no V4 side | `hybrid_only` |

Therefore freeze enough V4 provenance to reproduce the qualification. At minimum:

- V4 comparison side used at capture
- source / provenance of that V4 side
- source row / reference if one exists
- `hybridConflictType`
- `tierBucket`
- `isSuperTierA`

Frozen Super Tier A rule remains **unchanged**:

- actual Hybrid V2 spread selection
- **AND** `hybridConflictType = hybrid_strong`
- **AND** `abs(spread edge) >= 4.0`

Super Tier A is **not** a separate prediction model and must **not** create a duplicate independent prediction record. It is a qualification on the Hybrid V2 snapshot.

If the V4 comparison needed to establish `hybrid_strong` is unavailable, **do not reconstruct it later using hindsight**. Mark `missing_v4_provenance` and do not claim Super Tier A.

V4 / Fade remain historical / backtest. Freezing V4 comparison side at Hybrid capture does **not** authorize V4 as a 2026 production model.

### 7.7 Unavailable reasons

Each unavailable snapshot must retain explicit reason(s). Required reason vocabulary includes:

- `missing_rating`
- `missing_unit_grades`
- `stale_market`
- `missing_market`
- `post_kickoff`
- `invalid_model_output`
- `missing_v4_provenance` when qualification cannot be established

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
- selected MarketLine ID if available
- signed-row team ID / value
- canonical market HMA
- book
- source
- market observation timestamp
- capture / evaluation timestamp
- AVAILABLE / UNAVAILABLE state
- explicit unavailable reason

Signed-row side vs canonical HMA vs actual favorite remain distinct, as at prediction time.

### 8.3 Selection semantics for formal evaluation

- Use the deterministic latest eligible stored market observation **at or before** the T-30 target.
- Deterministic tie breaking must be preserved. Existing stored-market recency order is **timestamp DESC, then id DESC**.
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
- ATS result: `win` / `loss` / `push` / `unavailable`
- cover margin / actual margin as needed
- CLV using the frozen prediction line and frozen T-30 benchmark
- evaluation timestamp
- result source / provenance

ATS grading uses the frozen team-sided pick line vs the frozen game result. CLV uses the frozen prediction-market facts vs the frozen T-30 closing benchmark. If the closing benchmark is unavailable, CLV is unavailable; do not substitute a later line.

### 9.2 Score corrections

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

### 10.1 Technical ID vs deterministic evaluation identity

Distinguish:

| Kind | Role |
|------|------|
| Technical record ID | Storage primary key. Opaque. Not the evaluation identity. |
| Deterministic evaluation identity | Behavioral uniqueness key. |

Recommended deterministic identity is based on:

- game
- evaluation protocol (`CORE_EVAL_V1`)
- model definition (immutable definition ID / hash, not merely `"hybrid_v2"`)
- designated capture context (season / week / capture intent as implementation later specifies)

Do **not** lock a Prisma index design yet. Freeze the **behavioral uniqueness rule** first. Exact capture-key encoding is an implementation question.

---

## 11. Coverage / survivorship-bias rule

A formal capture must preserve the full eligible Game frame.

Live mutable Hybrid UI remaining at 0 computed / 51 unavailable is **not** a prospective ledger. When a prospective capture later runs, unavailable games remain in the denominator with explicit reasons.

Do not report performance only on the successfully computed subset as if that were complete coverage.

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

## 13. Model definition manifest

Implementation must use a canonical definition manifest whose **SHA-256 hash changes if prediction-defining behavior changes**.

Do **not** define the hash as merely `SHA("hybrid_v2")`.

For Hybrid V2 the manifest must account for prediction-defining items such as:

- Hybrid / V1 / V2 formula identity
- Hybrid blend weights
- V2 scaling
- matchup weights
- HFA behavior
- weather behavior / state
- selection / edge convention
- conflict classification semantics
- Super Tier A qualification rule

Also store repository commit SHA **separately**.

A capture using a different definition hash is a different model identity, even on the same game week.

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

Not open questions (already frozen above):

- `CORE_EVAL_V1` timing rules
- Super Tier A qualification
- Hybrid conflict types and V4 provenance requirement
- Game-frame denominator / unavailable states
- no retrospective 2026 backfill
- append-only prediction and closing facts
- fail-closed stale / missing market
- no fall-forward past T-30
- model-definition hash vs friendly model name
- Super Tier A is not a separate prediction model
