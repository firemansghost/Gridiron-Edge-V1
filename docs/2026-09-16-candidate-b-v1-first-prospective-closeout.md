# Candidate B V1 — First Prospective Cohort Closeout

**Date:** 2026-09-16 America/Chicago
**Current production main:** `60e5735c820dbd53e3f07de28d5c4c44b8f46b38`
**Official production spread model:** Core V1 / `official_flat_100`
**Hybrid V2:** SHADOW / HELD / NOT OFFICIAL
**Candidate B V1:** SHADOW / RESEARCH ONLY / NOT OFFICIAL

This is a dated evidence ledger for the first persisted prospective Candidate B V1 Generic Shadow cohort. It records operator truth after independent PREVIEW proof, COMMIT-path enablement, a fresh Live Odds refresh, and a separately authorized production COMMIT.

It does **not** promote Candidate B. It does **not** change official selections. It does **not** authorize a recurring schedule. It does **not** authorize blanket future COMMITs. It does **not** evaluate ATS / CLV / ROI. It does **not** alter or replace any persisted Candidate B row.

---

## 1. Scope / non-promotion statement

Candidate B success on September 16 proves **evidence plumbing** and establishes **prospective research data**.

It does **not** prove predictive superiority.
It does **not** promote Candidate B.
It does **not** change official selections.
It does **not** change Core V1 official status.

Core V1 remains the official production spread model. Candidate B remains research/shadow until prospective evidence is evaluated under the frozen research protocol.

The first Candidate B Week 3 cohort is now **frozen evidence**. Do not rerun it to improve a market line, replace it under a newer SHA, delete it, overwrite it, or backdate another cohort into `candidate_b_w3_first_observation`.

---

## 2. Frozen Candidate B identities

Runtime reads the exact persisted Candidate B feature snapshot. It does **not** select newest/latest Candidate B snapshot. It does **not** rederive Candidate B from mutable production inputs. The feature snapshot is immutable: do not rerun, update, or delete it.

| Identity | Frozen value |
|---|---|
| `modelDefinitionId` | `candidate_b_roster_prior_v1` |
| `featureDefinitionId` | `candidate_b_roster_prior_features_v1` |
| `policyDefinitionId` | `candidate_b_roster_prior_spread_policy_v1` |
| persisted feature `snapshotHash` | `0332e24f97c891fd6431280fa7939c467c614714abe207eeb3dc89d466eb1148` |
| feature snapshot rows | **138** |
| complete feature vectors | **103** |
| unavailable feature vectors | **35** |
| `modelDefinitionHash` | `1e5bbf0119832caf10e7b769afe5e8c02dbcda1b358022ec31803df40bca3d8c` |
| `featureDefinitionHash` | `6f1f8ecc132cdd87650252d57597a657ece0dd908bdf5010897023cafe988972` |
| `derivationDefinitionHash` | `6c04627787edbcc7d1d42549f3cb19c525a6c4c31de572549f01e3efa64a638c` |
| `policyDefinitionHash` | `b1b292c0ea01ed692dcbfdfd7f6adf28b951d20786f08dac0993444c8b1e1fba` |
| `adapterDefinitionHash` | `89ea502df175846f7d942dc485779e33fdd15fe17cd2bcaebba5b3926274ebf6` |
| `sourceManifestHash` | `183e07cec8ab146247f8b15eda93331a1dfe03f624b06fd8b0dae886d14b14d6` |
| `sourceProvenanceManifestHash` | `89ea635c89898aa2de5fad66a43e6eca36ef917f6945cc82635536746347f8da` |
| `normalizationManifestHash` | `9de2fdbf94581f05671349111ae36e458c94ac637b93e8db0eaea701abdeaa96` |
| `populationManifestHash` | `ce7a633f3230864c785048047698a3ba55fef1e25339e87db2a090bd65c59f2c` |

Prediction policy remains frozen:

- market: **SPREAD only**
- market source: persisted `oddsapi` `MarketLine` only
- Generic Shadow provider calls: **0**
- market timestamp must be `<=` prediction timestamp
- maximum prediction-time market age: **1800 seconds / 30 minutes**
- selection floor: **0.1**
- no stale-market rescue, retrospective capture, backdating, missing→zero, `TeamSeasonRating` fallback, or formula/coefficient changes

---

## 3. PR #127–#131 implementation sequence

| PR | Merged main | Purpose |
|---|---|---|
| **#127** | `20b40917530b683c8f73bee8d147967457dcd379` | Freeze the Candidate B V1 Generic Shadow adapter contract |
| **#128** | `7d36f63e32fcb6f861d274623dcb7c1398895596` | Implement Candidate B adapter/runtime against the exact persisted feature snapshot while Candidate B remained operationally disabled |
| **#129** | `4da989c8e9a0fca2a5c71023aeb0b62a9d71389f` | Allow Candidate B PREVIEW through Generic Shadow while mechanically blocking Candidate B COMMIT |
| **#130** | `611bb4c13663e6b49b648ef9333797461a493ca5` | Repair false Live Odds identity mapping `East Texas A&M Lions` → `texas-a-m`; fail-closed unmatched FBS while preserving real Texas A&M |
| **#131** | `60e5735c820dbd53e3f07de28d5c4c44b8f46b38` | Add Candidate B to the shared Generic Shadow COMMIT allowlist after clean PREVIEW proof |

PR #131 enabled the guarded technical path. It did **not** itself authorize a production run. The first COMMIT received **separate explicit operator authorization**.

---

## 4. Live Odds false-identity fail-closed incident

Failed Live Odds Week 3 COMMIT run **35048532226**:

- cause: legacy substring resolution incorrectly mapped **East Texas A&M Lions** → `texas-a-m`
- result: `unmatched_both_fbs` blocker
- `writeSafe=false`
- **no production persistence**
- **no DB mutation**

This is safety / fail-closed evidence. The blocker was not weakened.

---

## 5. PR #130 repair

PR #130 repaired the resolver at the identity layer.

Post-repair successful Live Odds COMMIT run **35120508141**:

- scheduled Week 3 games matched: **57 / 57**
- FBS/FCS out-of-scope events: **17**
- outside requested week: **1**
- `unmatched_both_fbs`: **0**
- `unresolved_expected_fbs`: **0**
- `writeSafe=true`
- `providerCalls=1`
- rows inserted: **2,615**
- post-write verification: passed

This refresh supported the Candidate B PREVIEW gate.

---

## 6. Candidate B PREVIEW gate

Successful PREVIEW run **35123647114** on runtime SHA `611bb4c13663e6b49b648ef9333797461a493ca5`:

| Item | Value |
|---|---|
| model | `candidate_b_roster_prior_v1` |
| season / week | 2026 / 3 |
| `capture_context` | `candidate_b_w3_first_observation` |
| mode | PREVIEW |
| games | **57** |
| AVAILABLE / UNAVAILABLE | **35 / 22** |
| selections / NO_SELECTION | **34 / 1** |
| `providerCalls` | **0** |
| `mutationsInvoked` | **false** |
| `writeSafe` | **true** |
| write blockers | none |
| all 22 unavailable | `team_feature_vector_unavailable` |
| unexpected market/runtime reasons | **0** |

The one NO_SELECTION was North Carolina @ Clemson:

- Candidate B margin: Clemson **+3.5876**
- market: Clemson **-3.5**
- edge: **0.0876**
- selection floor: **0.1**
- market age: **1,755 seconds** (ceiling 1,800)

This PREVIEW was valid but near the freshness ceiling. It is **not** persisted prediction evidence. PREVIEW wrote **zero** Shadow prediction rows.

Two accidental Core PREVIEW dispatches (**35121629608**, **35122600400**) occurred while operators were trying to launch Candidate B PREVIEW, before the successful Candidate B PREVIEW above. Both were harmless Core PREVIEW-only runs (`providerCalls=0`, `mutations=false`, no Candidate B evidence persisted). They are **not** Candidate B PREVIEWs.

---

## 7. PR #131 COMMIT enablement

PR #131 was merged only after independent audit of the successful PREVIEW.

After #131, current main `60e5735c820dbd53e3f07de28d5c4c44b8f46b38`:

| Gate | Exact value |
|---|---|
| `SHADOW_MODEL_ALLOWLIST` | `core_v1_shadow_baseline_v1`, `candidate_b_roster_prior_v1` |
| `SHADOW_MODEL_COMMIT_ALLOWLIST` | `core_v1_shadow_baseline_v1`, `candidate_b_roster_prior_v1` |
| workflow triggers | `workflow_dispatch` only |
| default mode | PREVIEW |
| Candidate B Week 3 confirmation | `CAPTURE_2026_WEEK_3_SHADOW_MODEL_candidate_b_roster_prior_v1` |
| recurring schedule | **none** |

Each future production COMMIT still requires separate current operator authorization and the exact confirmation string.

---

## 8. Fresh pre-COMMIT market capture

Generic Shadow itself is `providerCalls=0`. Fresh Week 3 Live Odds were therefore captured separately.

Live Odds COMMIT run **35127135613** on runtime SHA `60e5735c820dbd53e3f07de28d5c4c44b8f46b38`:

| Item | Value |
|---|---|
| scheduled games | **57** |
| matched requested-week | **57** |
| out-of-scope FBS/FCS | **17** |
| outside requested week | **1** |
| `unmatched_both_fbs` | **0** |
| `unresolved_expected_fbs` | **0** |
| ambiguous | **0** |
| fuzzy-required | **0** |
| `writeSafe` | **true** |
| write blockers | none |
| `providerCalls` | **1** |
| Odds API credits | **3** |
| rows proposed / inserted | **2,618 / 2,618** |
| `postWriteVerificationSucceeded` | **true** |
| missing / conflicting inserted fingerprints | **0 / 0** |
| Week 3 MarketLine total after write | **9,404** |

The September 13 MarketLine total of **4,171** (COMMIT **34784597710**) is historical and is **not** the current Week 3 count.

---

## 9. First Candidate B production COMMIT

This is the milestone.

| Item | Value |
|---|---|
| workflow run | **35128215811** |
| runtime SHA | `60e5735c820dbd53e3f07de28d5c4c44b8f46b38` |
| model | `candidate_b_roster_prior_v1` |
| season / week | 2026 / 3 |
| `capture_context` | `candidate_b_w3_first_observation` |
| mode | COMMIT |
| exact confirmation | `CAPTURE_2026_WEEK_3_SHADOW_MODEL_candidate_b_roster_prior_v1` |
| production capture run UUID | `74234d87-bb32-47c6-927b-6de3d24cfc88` |
| prediction timestamp | `2026-09-16T17:27:24Z` (12:27:24 PM America/Chicago) |
| games persisted | **57** |
| AVAILABLE / UNAVAILABLE | **35 / 22** |
| selections / NO_SELECTION | **34 / 1** |
| selected sides | **21 AWAY / 13 HOME** |
| `providerCalls` | **0** |
| `writeSafe` | **true** |
| write blockers | none |
| `mutationsInvoked` | **true** |
| `commitSucceeded` | **true** |
| `persistenceCommitted` | **true** |
| `verificationOk` | **true** |
| rollback | **false** |
| all 22 unavailable | `team_feature_vector_unavailable` |
| unexpected `stale_market` / `missing_market` / `incoherent_market` | **0 / 0 / 0** |

The same North Carolina @ Clemson game remained NO_SELECTION because edge **0.0876** was below the frozen **0.1** floor.

If a COMMIT report shows `productionCommitAuthorized=false`, that is a **static software/report field** indicating the workflow/software does not itself grant operator authorization. It does **not** mean the September 16 COMMIT was unauthorized. The actual production run received separate explicit operator authorization before execution. This closeout does not change that report field.

---

## 10. Prediction-time market freshness evidence

| Item | Value |
|---|---|
| selected market timestamp | `2026-09-16T17:16:34Z` (12:16:34 PM America/Chicago) |
| Candidate B prediction timestamp | approximately `2026-09-16T17:27:24Z` |
| market age | **651 seconds** (10 minutes 51 seconds) |
| frozen ceiling | **1800 seconds** |
| all 57 games age bucket | **301–900 seconds** |
| over 1800 | **0** |

The first persisted Candidate B cohort is legitimate prospective evidence under the frozen prediction-time freshness rule.

Keep evidence layers distinct:

- prediction evidence (this cohort)
- closing-market evidence (kickoff − 30 minutes; not claimed here)
- outcome/evaluation evidence (not implemented / not authorized)

Do not backfill missed T−30 evidence after the target. Do not use future outcomes to reinterpret prediction evidence. Do not silently claim Candidate B already has evaluated ATS / CLV performance.

---

## 11. Persistence / write-scope evidence

Candidate B COMMIT wrote **only** Generic Shadow evidence:

- `ShadowModelCaptureRun`
- `ShadowModelPrediction`

It did **not** write:

- `Bet`
- `MatchupOutput`
- Official Card
- Hybrid Shadow Snapshot V1
- closing market evidence
- evaluation evidence
- Candidate B feature snapshot
- Prisma migrations

Provider calls during Candidate B capture: **0**.

---

## 12. Immutability / no replacement rule

The first Candidate B Week 3 prospective cohort is now frozen evidence.

Do **not**:

- rerun it to improve the market line
- replace it under a newer SHA
- delete it
- overwrite it
- backdate another cohort into this context
- alter `capture_context` after outcomes
- reinterpret the PREVIEW timestamp as the COMMIT timestamp

Exact idempotent retry behavior, if ever encountered accidentally, is **not** authorization to create a replacement observation.

Future Candidate B captures must be new prospective cohorts with their own real system-observed timestamps and separately authorized operating context.

---

## 13. Current operator posture

| Item | State |
|---|---|
| Current production main | `60e5735c820dbd53e3f07de28d5c4c44b8f46b38` |
| Official spread model | **Core V1** / `official_flat_100` |
| Hybrid V2 | **SHADOW / HELD / NOT OFFICIAL** |
| Candidate B V1 | **SHADOW / RESEARCH ONLY / NOT OFFICIAL** |
| Generic Shadow allowlist | Core + Candidate B |
| Generic Shadow workflow | **PROVEN / MANUAL_GUARDED / RESEARCH ONLY / PER-RUN AUTHORIZATION** |
| Recurring Shadow schedule | **NOT AUTHORIZED** |
| Blanket future COMMIT | **NOT AUTHORIZED** |
| Candidate B Week 3 cohort | **FROZEN / DO NOT REPLACE** |
| ATS / CLV / evaluation | **NOT IMPLEMENTED / NOT AUTHORIZED** |

---

## 14. What happens next

- Preserve this cohort unchanged.
- Collect future Candidate B evidence prospectively.
- Preserve prediction / closing / evaluation separation.
- Do not change Candidate B methodology based on Week 3 outcomes.
- No promotion decision is made by this milestone.
- Future captures require appropriate current market evidence and per-run authorization.
- Evaluation waits for legitimate outcomes/closing evidence under the frozen research contract.

This closeout invents **no** performance conclusion.
