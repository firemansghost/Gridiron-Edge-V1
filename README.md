# Gridiron Edge

College football analytics platform for power ratings, implied spreads, and betting edge identification.

## Quick Start

### Vercel Deployment
1. Import this repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `DATABASE_URL` (use **pooled** Supabase connection string)
   - `NEXT_PUBLIC_SITE_URL` (e.g., `https://gridiron-edge-v1.vercel.app`)
   - `APP_ENV=production`
   - `TZ=America/Chicago`
   - `MODEL_VERSION=v1.0`
   - `SUPABASE_URL=https://tccqmxcaledmlkybjqef.supabase.co`
   - `SUPABASE_ANON_KEY` (only if using supabase-js in browser)
3. Deploy

## Vercel Environment Setup

### Required Environment Variables
Create these environment variables in Vercel → Project → Settings → Environment Variables:

- `DATABASE_URL` - Use the **pooled** Postgres connection string from Supabase
- `NEXT_PUBLIC_SITE_URL` - Your deployed site URL (e.g., `https://gridiron-edge-v1.vercel.app`)
  - Used for Open Graph metadata and absolute URLs
  - **Important:** Must match your actual Vercel deployment URL
- `APP_ENV` - Set to `production` for production deployments
- `TZ` - Set to `America/Chicago`
- `MODEL_VERSION` - Set to `v1.0` (or current model version)
- `SUPABASE_URL` - Set to `https://tccqmxcaledmlkybjqef.supabase.co`
- `SUPABASE_ANON_KEY` - Only add if the browser will use supabase-js

### Security Notes
- **Never add `SUPABASE_SERVICE_ROLE_KEY`** to Vercel environment variables
- Use **pooled** connection strings for `DATABASE_URL` (pgBouncer, transaction mode)
- Service role keys should only be used in server-side job runners (GitHub Actions/Render/Fly)

### Local Development

#### Web App (Next.js)
```bash
# From repo root - using npm workspaces
npm run dev --workspace apps/web

# Or from web directory
cd apps/web
npm install
npm run dev
```

#### ETL Jobs (Python)
```bash
cd apps/jobs
pip install -r requirements.txt
python -m jobs.etl.main
```

#### Database Operations
```bash
# From repo root
npm run db:generate    # Generate Prisma client
npm run db:migrate:dev # Run migrations in development
npm run db:studio     # Open Prisma Studio
npm run seed:ratings  # Run seed job
npm run ingest -- mock --season 2024 --weeks 1  # Ingest mock data
```

### Automated Jobs

#### Nightly Ingest + Ratings
A GitHub Actions workflow runs automatically every night at **7:00 UTC** (2:00 AM CST / 1:00 AM CDT):
- Ingests fresh mock data for 2024 Week 1
- Recalculates power ratings and matchup outputs
- Keeps the demo environment up-to-date

**Manual Trigger:**
Navigate to **Actions → Nightly Ingest + Ratings → Run workflow** in GitHub to trigger manually.

**Secrets Required:**
- `DATABASE_URL` - Pooled Supabase connection string
- `DIRECT_URL` - Direct Supabase connection string

**View Logs:**
Check the **Actions** tab in GitHub to see execution logs and summaries.

## Project Structure
- `/apps/web` - Next.js frontend
- `/apps/jobs` - Python ETL pipeline
- `/docs` - Project documentation

## Documentation
See `/docs` directory for detailed architecture, data models, and implementation guides.