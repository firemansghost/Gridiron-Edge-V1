# Guarded 2026 CFBD schedule rollover

Manual PREVIEW/COMMIT path for weekly 2026 FBS schedule writes. Replaces retired
`.github/workflows/ingest-2026-schedules.yml`. Not production-authorized merely
by merge. Do not run against production until independently audited.

## Entry points

- Workflow: `.github/workflows/write-cfbd-schedules-2026-manual.yml`
- CLI: `apps/jobs/write-cfbd-schedules-2026.ts`
- Helpers: `apps/jobs/src/preseason/cfbd-schedule-rollover-2026.ts`

Read-only preview remains: `.github/workflows/preview-2026-schedules.yml`.

Legacy `apps/jobs/write-schedules.ts` is **REPAIR_BEFORE_USE / NOT AUTHORIZED**.
No production workflow may invoke it.

## Contract

- `workflow_dispatch` only. Season must be `2026`. Week is one positive integer
  (week `0` rejected). Mode defaults to `PREVIEW`.
- COMMIT confirmation: `WRITE_2026_WEEK_<week>_SCHEDULES`.
- PREVIEW may read production DB and CFBD `/games` (+ optional `/venues`). Zero
  mutations.
- COMMIT may create missing canonical Game rows and update only `date`, `venue`,
  `city`, `neutralSite`, `conferenceGame`. Serializable transaction. All
  transaction reads/writes use the transaction client. Post-write verification
  runs inside the transaction and throws to roll back.
- DB-only rows absent from the provider are write blockers. No automatic delete.
- Protected rows (score present or status `final` / `completed` / `in_progress`)
  block metadata updates.
- Authoritative 2026 FBS membership must be exactly 138 distinct team IDs.
