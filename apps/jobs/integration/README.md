# Exact JSON persistence integration

This suite requires a disposable PostgreSQL database named `gridiron_integrity_fixture` on loopback. It refuses any other host/database and never falls back to `DATABASE_URL`. No production credentials are needed.

After creating the unchanged Prisma schema in that isolated database, set `SHADOW_INTEGRITY_FIXTURE_URL` to its local connection URL and run:

```
npx tsx apps/jobs/integration/shadow-model-exact-json.integration.ts
```

The checked-in six-row fixture is an offline subset of the original November 2, 2026 Core/Elo/roster artifacts. It includes selected, NO_SELECTION and roster UNAVAILABLE/null states. Source COMMIT run IDs: Core41505773951, Elo41506177800, roster41506385787. Input payloads and declared hashes are unchanged; local run IDs, capture contexts and population counts are fixture-specific. It creates no live research capture.

The suite checks all persisted JSON and scalar fields, stored canonical hashes, valid existing-cohort idempotence, malformed existing-cohort rejection, and complete transaction rollback after injected payload/manifest/provenance/scalar corruption. It also checks invalid planned input hashes. Fault injection modifies only this explicitly isolated fixture database.

An optional JSON fixture path can supply full offline plans with the same shape. The original repair run separately exercised all186original predictions with every input hash matched to its archived COMMIT artifact, including all26roster UNAVAILABLE rows. That larger receipt is retained in the execution workspace; it is not a new production cohort.

The GitHub integration job uses PostgreSQL17.6 and repository-pinned Prisma6.17 with fixture-only credentials. Passing it validates the prospective writer repair, not the already-failed immutable cohorts or Week10 activation.
