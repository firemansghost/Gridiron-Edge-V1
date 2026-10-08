# ML-CAL-1 G4 Observer — Fixture Matrix Mapping

Maps design fixture IDs to concrete assertions in PR #249 (post F1–F6 repair).  
Suite: `apps/jobs/__tests__/ml-cal-1-lifecycle-binding-observer-g4.test.ts`  
Dependency suites (CI): binding / G2 / G3 Jest paths.

| Design ID | Assertion location | Kind |
|-----------|-------------------|------|
| G4-N1 | archive prerequisites + e2e Week5 abort | negative |
| G4-N2 | wrong ZIP pin | negative |
| G4-N3 | allowlist unit + e2e forceSelectScalars | negative |
| G4-N4 | observed modelVersion drift e2e | negative |
| G4-N5 | cohort shrink e2e | negative |
| G4-N6 | Decimal `'0'` usable | positive usability |
| G4-N7 | blank raw unusable | negative |
| G4-N8 | observation predates archive e2e + F4 pre-adapter spy | negative |
| G4-N9 | row updated after snapshot (timing helper) | negative |
| G4-N10 | emitter echo equals recomputed; contradictory echo rejected via binding verifier (F5 negative) | positive + negative |
| G4-N11 | rating numeric mismatch e2e | negative |
| G4-N11b | games exact inequality e2e | negative |
| G4-N12 | fixture_hypothetical / fixture_injected retained | positive provenance |
| G4-N13–N15 | lineage/trust/digest triad | **dependency:** `ml-cal-1-lifecycle-binding.test.ts` (unchanged accepted binding suite) |
| G4-N16 | package metadata `businessDataWrites=0` / `providerCalls=0`; write attempts not available on mock (no mutation API) | positive counters |
| G4-N17 | wrong isolation / read_only off | negative |
| G4-N18 | lost TX mid-read | negative |
| G4-N19 | retry stitching | covered by lost-TX + fresh-attempt contract (no combine API); mock aborts on lost TX | negative |
| G4-N20 | missing db time on live-path helper (`dbTransactionTimeRequired: true`) | negative |
| G4-N21 | clamp attempts | timing helpers fail closed without mutation | negative |
| G4-N22 / G4-P6 | missing prospective target → null | positive null |
| G4-N23 / G4-N24 | prospective 7/7 and 8/7 fail | negative |
| G4-N25 | emission without G5 anchors | positive emission |
| G4-N26–N32 | timing helper + e2e DB-early | negative |
| G4-P1 / P7 / P9 | synthetic W6 seal unapproved + overwrite refuse | positive |
| G4-P2 / P4 | fingerprint / Decimal round-trip | positive |
| G4-P3 | distinct role SHA example | positive example |
| G4-P5 | fixture target week 7 prospectiveOk true, no eligibility claim | positive |
| G4-P8 | digest triad | **dependency:** binding suite |
| G4-P10 | Week5 planned-row schema | positive schema |
| F1 repair | null/blank/whitespace ratingRaw; planned null | negative |
| F2 repair | created>updated; offset extrema; invalid ts structured | negative |
| F3 repair | nonfixture rejected; PROVENANCE retained; copy-away | negative + positive |
| F4 repair | pre-adapter chrono + empty identity; zero adapter enters | negative |
| F5 repair | omit eligibility echo; binding verifier replay + copy-away | positive structural / live blocked |

Planned tests remain distinct from executed CI: this PR’s G4 workflow runs the G4 suite plus accepted binding/G2/G3 regressions on Linux.
