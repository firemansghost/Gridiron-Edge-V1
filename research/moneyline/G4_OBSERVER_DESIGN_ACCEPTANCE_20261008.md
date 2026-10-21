# ML-CAL-1 G4 Observer Design — Acceptance

Date: October 8, 2026 (America/Chicago).

**Disposition: PASS / DESIGN CONTENT ACCEPTED. F1–F4, including the remaining F3 timing correction, are CLOSED.** This accepts the observer specification and fixture plan only. It does not accept implementation, pooler compatibility, a live observation, a prospective protocol, or a calibration result.

## Reviewed evidence and identity limits

Reviewed the complete attached `Pasted markdown(8).md` design and the recovery note pasted in the same user message. Recorded authoring base:

`955cb46bad0ccca40d073a10d2c0aea3adf236a2`.

| Evidence | SHA-256 / verification status |
|---|---|
| Exact uploaded design copy reviewed | `e61ffd3cb7563fea1d616969df64d760bfe7e931cf654074ab2e9f5146dc3215` — independently computed |
| Cursor original design file | `53d8906c2caa3b68658c6596d74f28e1ec2367fa026991013dadb210aca922bc` — Cursor-reported, not independently byte-verified |
| Cursor original recovery file | `f8ba7a4f673f7bf5603bb14f0d40adc23a0eeea2937e74af1e5de64888a6adce` — Cursor-reported, not independently byte-verified |

The uploaded copy contains escaped Markdown, additional blank lines, and HTML entities. Its bytes therefore differ from the original file identity claimed by Cursor. Acceptance is pinned to the reviewed upload's content and exact digest; it is not a claim that the original on-disk digest was verified. No formatting normalization was used to manufacture a matching source hash.

The worktree HEAD/status and absence of commits are reported by Cursor, not independently checked against Bobby's local Windows worktree in this review. The recovery note was reviewed as pasted text; its original file bytes were not supplied.

## Finding closure

| Finding | Accepted repair |
|---|---|
| F1 | `completedThroughWeek < prospectiveTargetWeek` passes prospective ordering. Missing production target cannot produce prospective or fullWeightEligible claims; G6 retains registration |
| F2 | Archive mapping uses the authentic report fields; model from report and observed rows; unique 138-team cohort; verification counts/reasons; rating tolerance 1e-9; games exact integer equality |
| F3 | Bounded Prisma RepeatableRead transaction; in-transaction READ ONLY before metadata/business reads; settings verified on the same client; mandatory live PostgreSQL transaction timestamp; original clocks retained; no snapshot-currentness claim or mocked pooler proof |
| F3 timing | Database time must fall within observation bounds unconditionally. Both archive chronology fields mandatory and bounded by observation start/ceiling. No clamp, offset correction, skipped checks, or successful sidecar on timing failure. Start before transaction; reference after SELECT; end after attempt |
| F4 | Unapproved G4 evidence emission separated from later approval/lineage/registration/capture gates; independently anchored digest comparisons; no self-granted trust |
| Producer roles | Roles independently bound; no substitution or forced equality/inequality of SHA values |

The nine-column 2026/v1 projection, raw Decimal preservation including zero, capture/binding fingerprint parity, separate digest objects, retained self-contained evidence, and fail-closed rules remain intact. Existing and added fixture scenarios cover the corrections. They are planned tests, not executed tests.

U1–U9 dispositions are accepted as specified. Real external evidence and authority remain unresolved operational prerequisites, not values to invent in fixtures or implementation.

## Next recommended task

Separately authorize a fixture-first G4 observer implementation on a new branch/draft PR inheriting the accepted G3 dependencies. Preserve accepted PR history. Build and test the injected transaction adapter, archive gates, observer export, and atomic package writer offline. Return exact source head, dependency identities, file diff, test/CI evidence, and retrievable fixture packages for independent implementation review.

Before using an original design file as an implementation source pin, independently reconcile its exact bytes with this reviewed specification; do not relabel the pasted copy's hash as the original file hash. This is a source-binding step, not a requirement to repeat design analysis.

This acceptance does not start implementation. No DB credentials or connection, provider calls, production preflight, manual live run, scheduled/live workflow, or merge is authorized here. An offline observer implementation can proceed without selecting a genuine Week ≥ 6 archive or a production target, once explicitly authorized; missing real evidence must remain blocked.

## Holds

Live research readiness remains **BLOCKED**. No genuine Week ≥ 6 archive, reviewed live observation package, deployed pooler proof, production approval registry/lineage, or prospective target is accepted by this report. Week 5 remains integrity-positive/full-weight-ineligible. #243 stays draft/unregistered. No amendment or merge of #244–#248/main, calibration, or 2025 reopening occurred.

G5 retrieval/lineage, G6 registration, G7 prospective capture/workflow enablement, and G8 per-capture checks remain later gates. Research markdown, if later committed under separate authority, is expected to trigger Vercel BUILD unless the complete diff meets established safe-skip rules.
