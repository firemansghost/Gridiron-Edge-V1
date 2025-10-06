# Environment Variables & Secrets Policy

## Required Environment Variables

### Database
- `DATABASE_URL` - Supabase Postgres connection string
  - Format: `postgresql://user:password@host:port/database`
  - Required for: Web app, ETL jobs

### Application Environment
- `APP_ENV` - Application environment
  - Values: `development`, `preview`, `production`
  - Required for: Web app, ETL jobs
  - Default: `development`

### Timezone
- `TZ` - System timezone
  - Value: `America/Chicago`
  - Required for: All components
  - Used for: Timestamp normalization, scheduling

### Model Configuration
- `MODEL_VERSION` - Current model version
  - Format: `v1.0`, `v1.1`, etc.
  - Required for: ETL jobs, web app
  - Used for: As-of state tracking

### Data Sources Configuration
- `DATASOURCES_CONFIG_PATH` - Path to datasources configuration
  - Format: `/config/datasources.yml`
  - Required for: ETL jobs
  - Contains: API endpoints, rate limits, data mappings

## API Keys & Secrets

### Sports Data APIs
- `SPORTS_REFERENCE_API_KEY` - Sports Reference API access
- `ESPN_API_KEY` - ESPN API access (if used)
- `COLLEGE_FOOTBALL_DATA_API_KEY` - College Football Data API

### Betting Data APIs
- `ODDS_API_KEY` - The Odds API for market lines
- `BETTING_API_KEY` - Alternative betting data source

### Weather Data
- `WEATHER_API_KEY` - Weather data for game conditions
- `OPENWEATHER_API_KEY` - OpenWeatherMap API key

### Recruiting Data
- `RIVALS_API_KEY` - Rivals.com recruiting data
- `247SPORTS_API_KEY` - 247Sports recruiting data

## Secrets Policy

### Vercel Environment Groups
- **Web App Group**: `gridiron-edge-web`
  - Contains: `DATABASE_URL`, `APP_ENV`, `TZ`, `MODEL_VERSION`
  - Access: Vercel dashboard, team members with appropriate permissions
  - Rotation: Quarterly or on security incident

### GitHub Actions Secrets
- **Jobs Group**: `gridiron-edge-jobs`
  - Contains: All API keys, database access, job-specific configs
  - Access: Repository secrets, limited to maintainers
  - Rotation: Monthly for API keys, quarterly for database access

### Alternative: Render/Fly Environment
- **Jobs Environment**: Platform-specific environment variables
  - Contains: Same as GitHub Actions secrets
  - Access: Platform dashboard with team access controls
  - Rotation: Same schedule as GitHub Actions

## Environment-Specific Configuration

### Development
- All API keys use sandbox/test endpoints
- Database uses development instance
- Model version: `dev-{timestamp}`

### Preview
- Production API keys with rate limiting
- Staging database instance
- Model version: `preview-{branch}`

### Production
- Full API access with monitoring
- Production database with backups
- Model version: Semantic versioning (v1.0, v1.1, etc.)

## Security Best Practices

### Secret Rotation
- API keys: Monthly rotation
- Database credentials: Quarterly rotation
- Emergency rotation: Within 24 hours of security incident

### Access Control
- Principle of least privilege
- Separate environments for different access levels
- Audit logging for all secret access

### Monitoring
- Failed authentication attempts
- Unusual API usage patterns
- Database connection anomalies
