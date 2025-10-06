# Gridiron Edge Architecture

## System Components

### Web Application (Next.js on Vercel)
- **Frontend**: Next.js 14 with App Router, Tailwind CSS, shadcn/ui
- **Deployment**: Vercel with automatic deployments from main branch
- **Environment**: Production, preview, and development environments
- **Features**: Team ratings display, edge identification, game details, betting tracking

### ETL Jobs (Python)
- **Runtime**: GitHub Actions on schedule or Render/Fly cron jobs
- **Language**: Python 3.11+ with SQLAlchemy, Pandas, Requests
- **Schedule**: Daily data ingestion, weekly power rating updates
- **Environment**: Separate from web app with own environment variables

### Database (Postgres via Supabase)
- **Provider**: Supabase hosted Postgres
- **Connection**: Via DATABASE_URL environment variable
- **Features**: Full-text search, real-time subscriptions, row-level security
- **Backup**: Automated daily backups via Supabase

## Data Flow

### ETL Pipeline
1. **Data Ingestion**: Jobs fetch data from external APIs (team stats, recruiting, schedules, market lines)
2. **Data Processing**: Clean, validate, and transform raw data
3. **Storage**: Store processed data in Postgres with proper indexing
4. **Versioning**: Track model versions and data timestamps for as-of state

### Power Rating Calculation
1. **Feature Engineering**: Extract and normalize team statistics
2. **Opponent Adjustment**: Adjust stats for strength of schedule
3. **Rating Calculation**: Compute power ratings using weighted features
4. **Validation**: Compare against historical game outcomes

### Implied Lines Generation
1. **Rating Delta**: Calculate difference between team power ratings
2. **Spread Mapping**: Convert rating delta to implied point spread
3. **Total Mapping**: Calculate implied total based on team offensive/defensive ratings
4. **Confidence Assignment**: Assign A/B/C confidence tiers based on model certainty

### As-of Versioning
- **Model Versioning**: Store model_version with all calculations
- **Market Line Freezing**: Capture market lines at bet time and closing
- **Historical State**: Maintain complete historical state for backtesting
- **Timezone Handling**: All timestamps in America/Chicago

## Jobs Runner Configuration

### GitHub Actions
- **Schedule**: Daily at 6 AM CT for data ingestion
- **Environment**: Separate secrets for API keys and database access
- **Monitoring**: Job status notifications via Slack/email

### Alternative: Render/Fly
- **Cron Jobs**: Scheduled Python scripts
- **Environment**: Environment variables configured in platform
- **Scaling**: Auto-scale based on job complexity

## Security & Secrets

### Web App (Vercel)
- **Environment Group**: `gridiron-edge-web`
- **Secrets**: DATABASE_URL, API keys for external services
- **Access**: Vercel dashboard configuration

### Jobs (GitHub Actions/Render/Fly)
- **Environment Group**: `gridiron-edge-jobs`
- **Secrets**: Database access, API keys, job-specific configurations
- **Access**: Platform-specific secret management
