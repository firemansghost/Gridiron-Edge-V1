# Candidate B V1 Feature Snapshot Ingest

**Status:** STORAGE + LOCAL INGEST CAPABILITY IMPLEMENTED — RESEARCH ONLY  
**Not authorized:** migration deploy, feature-snapshot COMMIT, Generic Shadow adapter, workflows, prediction capture

This documents the local guarded ingest for the immutable Candidate B V1 derived team-feature snapshot.

It does **not** make Candidate B an official model and does **not** authorize production writes.

---

## What this is

Additive append-only storage plus a **local** PREVIEW/COMMIT CLI that can turn private frozen PIT + persisted 2026 talent into a sanitized 138-team snapshot.

Tables:

- `shadow_model_feature_snapshots`
- `shadow_model_feature_snapshot_teams`

Migration (written, **not deployed**):

`prisma/migrations/20260914120000_add_shadow_model_feature_snapshot_v1/migration.sql`

---

## What this is not

- Not a Candidate B Generic Shadow adapter
- Not a Generic Shadow frame/runtime change
- Not a model allowlist change
- Not a GitHub Actions workflow
- Not prediction PREVIEW/COMMIT
- Not evaluator work
- Not authorization to ingest against production

Raw CFBD PIT remains local/private under `.research-data/` and must not be committed.

`providerCalls` is always `0`. The CLI never calls CFBD or the Odds API.

---

## Operator sequence (eventual)

1. Independent code/migration audit of this PR
2. Merge
3. **Separately deploy** the additive migration and audit it
4. Local **PREVIEW** (default)
5. Independent PREVIEW audit
6. Explicit COMMIT authorization
7. Local **COMMIT** with the exact confirmation string
8. Verification
9. Only then Candidate B runtime adapter work

Do **not** skip to COMMIT. Do **not** run this CLI against production until the migration is deployed and PREVIEW is audited.

---

## PREVIEW (default)

```
npx tsx apps/jobs/ingest-candidate-b-v1-feature-snapshot.ts --season 2026 --mode PREVIEW
```

Optional:

```
--core-snapshot-dir .research-data/cfbd-pit/2025/2026-09-14/cfbd-2025-core-prior-freeze-20260914T061114Z
--opening-snapshot-dir .research-data/cfbd-pit/2026/2026-09-01/cfbd-2026-w01-seed-partial-20260901T153731Z
--report reports/candidate-b-v1-feature-snapshot-preview.json
```

PREVIEW:

- reads private PIT bytes and verifies frozen raw SHA-256 **before** parse
- SELECTs 2026 `TeamMembership` FBS IDs and `TeamSeasonTalent`
- derives 138 rows
- classifies existing identity/conflict
- writes **zero** snapshot rows
- prints hashes, `snapshotHash`, unavailable teams, and the exact COMMIT confirmation
- exits nonzero if COMMIT would be unsafe

Migration must be deployed before a DB-backed PREVIEW can succeed.

---

## COMMIT guard

COMMIT is implemented but **not currently authorized**.

```
npx tsx apps/jobs/ingest-candidate-b-v1-feature-snapshot.ts --season 2026 --mode COMMIT --confirm INGEST_2026_CANDIDATE_B_V1_FEATURE_SNAPSHOT_<FULL_64_CHAR_SNAPSHOT_HASH>
```

Requirements:

- exact mode `COMMIT`
- confirmation must match the **current** computed `snapshotHash`
- no blockers
- `providerCalls = 0`
- serializable transaction
- insert exactly one parent + 138 children, or verified NO-OP
- no UPDATE / DELETE / overwrite-upsert

Do not put a real confirmation hash in this document. Use:

`INGEST_2026_CANDIDATE_B_V1_FEATURE_SNAPSHOT_<FULL_64_CHAR_SNAPSHOT_HASH>`

---

## Idempotency / conflict

| Existing state | Behavior |
|---|---|
| `ABSENT` | eligible for guarded insert |
| `EXACT_EXISTING` | verified NO-OP |
| `PROVENANCE_ONLY_DIFFERENCE` | verified NO-OP; report diagnostically; do not update persisted provenance |
| `SEMANTIC_CONFLICT` | fail closed |
| `CORRUPT_EXISTING` | fail closed |

A later `TeamSeasonTalent` timestamp-only change must not create a competing Candidate B V1 snapshot.

---

## Frozen contracts

Do not edit these from this ingest work:

- `research/candidate-b/CANDIDATE_B_V1_INPUT_CONTRACT.md`
- `research/candidate-b/CANDIDATE_B_V1_FORMULA_CONTRACT.md`
- `research/candidate-b/CANDIDATE_B_V1_PERSISTENCE_DESIGN.md`
