# Gridiron Edge ETL Jobs

TypeScript/Node ETL pipeline for data ingestion and processing.

> **Note:** Older docs may reference Python ETL; the current implementation lives under `apps/jobs/src` and runs via npm scripts / GitHub Actions.

## Tech Stack
- TypeScript / Node.js
- Prisma for database access
- CFBD, Odds API, and other provider clients in `apps/jobs/src`

## Development
```bash
# From repo root
npm run ingest -- --help
npm run seed:ratings
```

## Deployment
Runs via GitHub Actions on schedule or manual workflow dispatch. **As of 2026 preseason prep, all workflows are disabled in the GitHub UI** — see `SEASON_STATUS.md` and `WORKFLOW_DISABLE_REPORT.md`.
