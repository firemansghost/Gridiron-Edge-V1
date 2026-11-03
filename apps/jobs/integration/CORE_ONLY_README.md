# Core-only Week 10 integrity integration

Use a disposable PostgreSQL17.6 database named `gridiron_core_only_fixture` on loopback and create the unchanged Prisma schema there. Set `CORE_ONLY_FIXTURE_URL` explicitly; the test refuses all other hosts/databases and never falls back to production environment variables. Run from repository root:

```
npx tsx apps/jobs/integration/core-only-disposition.integration.ts
```

The gzip/base64 fixture contains exact native row-text copies of the three original November2Week10 capture runs and186predictions, including the original stored precision defects. The payload's uncompressed SHA256 is verified before use; the source-pinned disposition ledger then checks every native row byte hash. These are isolated offline test copies, not new prospective cohorts, repairs or substitutions for production data. No sealed2025outcome data is included or queried.

The suite exercises the unmocked production guard, automatic discovery, StageC/D coordinators, closing transaction and both manual closing/evaluation CLI reports against actual PostgreSQL. It retains186original/124held/122direct-failure accounting, all62Core children,2Core NO_SELECTION and26roster UNAVAILABLE states. Tests cover unexpected unsupported runs, missing/duplicate children, changed source/count/identity, sub-ULP held JSON edits, tampered ledger, replayed plans, zero provider/write effects on blocked scopes, transaction revalidation rollback, qualified closing/idempotence, mutable Game kickoff drift, missed windows, no fall-forward quotes, and other2026weeks' exact checks. Unsupported seasons reject before payload/outcome queries.

Faults are injected only into this explicitly isolated database or temporarily into the local test checkout's ledger file, which is restored byte-for-byte in a finally block. Database fault transactions roll back. A qualified fixture close may persist for the idempotent retry test; the suite supports repeat runs without replacing original fixture captures. No real provider call is made. Existing mapping-only unit tests mock the shared eligibility dependency explicitly; they do not qualify guard behavior. This real-database suite supplies that evidence.

The CI workflow supplies a local PostgreSQL service with fixture-only credentials and no production secrets. Passing tests qualifies a prospective source change only. Fresh production read-only PREVIEW, separate operational acceptance and guarded active-week rollout remain required; no real StageC/D success is inferred from synthetic clocks.
