# Gridiron Edge

College football analytics platform for power ratings, implied spreads, and betting edge identification.

## Quick Start

### Vercel Deployment
1. Import this repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `DATABASE_URL` (use **pooled** Supabase connection string)
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
```bash
# Web app
cd apps/web
npm install
npm run dev

# ETL jobs
cd apps/jobs
pip install -r requirements.txt
python -m jobs.etl.main
```

## Project Structure
- `/apps/web` - Next.js frontend
- `/apps/jobs` - Python ETL pipeline
- `/docs` - Project documentation

## Documentation
See `/docs` directory for detailed architecture, data models, and implementation guides.