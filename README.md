# Gridiron Edge

College football analytics platform for power ratings, implied spreads, and betting edge identification.

## Quick Start

### Vercel Deployment
1. Import this repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `DATABASE_URL` (Supabase connection string)
   - `APP_ENV=production`
   - `TZ=America/Chicago`
   - `MODEL_VERSION=v1.0`
   - `DATASOURCES_CONFIG_PATH=/config/datasources.yml`
3. Deploy

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