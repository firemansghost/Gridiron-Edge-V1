# Environment Variables & Secrets Policy

## Environment Variables Reference

| Variable | Web App | Jobs/ETL | Where to Set | Description |
|----------|---------|----------|--------------|-------------|
| `APP_ENV` | ✅ | ✅ | Vercel Project Env, Local `.env.local`/`.env` | Application environment (development/preview/production) |
| `TZ` | ✅ | ✅ | Vercel Project Env, Local `.env.local`/`.env` | Timezone (America/Chicago) |
| `MODEL_VERSION` | ✅ | ✅ | Vercel Project Env, Local `.env.local`/`.env` | Model version for as-of state tracking |
| `DATASOURCES_CONFIG_PATH` | ❌ | ✅ | Vercel Project Env, Local `.env` | Path to datasources configuration |
| `DATABASE_URL` | ✅ | ✅ | Vercel Project Env, Local `.env` | Pooled Postgres connection string |
| `SHADOW_DATABASE_URL` | ❌ | ✅ | Vercel Project Env, Local `.env` | Shadow DB for migrations |
| `SUPABASE_URL` | ✅ | ✅ | Vercel Project Env, Local `.env.local`/`.env` | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | ❌ | Vercel Project Env, Local `.env.local` | Public browser key (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ | ✅ | GitHub Actions/Render/Fly secrets, Local `.env` | Service role key (SERVER ONLY) |
| `ODDS_API_KEY` | ❌ | ✅ | GitHub Actions/Render/Fly secrets, Local `.env` | Sports betting data API |
| `WEATHER_API_KEY` | ❌ | ✅ | GitHub Actions/Render/Fly secrets, Local `.env` | Weather data API |
| `RECRUITING_API_KEY` | ❌ | ✅ | GitHub Actions/Render/Fly secrets, Local `.env` | Recruiting data API |

## Security & Roles

### Critical Security Rules
- **Never expose `SUPABASE_SERVICE_ROLE_KEY`** to the browser or any `NEXT_PUBLIC_` variable
- **Prefer pooled `DATABASE_URL`** (pgBouncer, transaction mode) for Vercel serverless
- **Plan for two DB roles**: read-only for web, read-write for jobs (future milestone)

### Database Connection Strategy
- **Web App**: Uses `DATABASE_URL` from Vercel Project Environment Variables
- **ETL Jobs**: Uses `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for full access
- **Connection Pooling**: Use pooled connection strings for serverless environments

## Vercel Environment Setup

### Required Environment Variables in Vercel
1. Go to Vercel → Project → Settings → Environment Variables
2. Add the following variables:
   - `DATABASE_URL` (use **pooled** connection string)
   - `APP_ENV`
   - `TZ`
   - `MODEL_VERSION`
   - `SUPABASE_URL`
3. Only add `SUPABASE_ANON_KEY` if the browser ever calls supabase-js
4. **Never add `SUPABASE_SERVICE_ROLE_KEY`** to Vercel if any value might reach the client
5. Put `SUPABASE_SERVICE_ROLE_KEY` only in **server job runners** (GitHub Actions/Render/Fly)

### Vercel Environment Groups
- **Web App**: Use Vercel Project Environment Variables
- **Jobs**: Use separate environment (GitHub Actions/Render/Fly) with job-specific secrets

## Local Development Setup

### Root Environment (for tooling)
```bash
cp .env.example .env
# Fill in secrets locally (never commit this file)
```

### Web App Environment
```bash
cp .env.example apps/web/.env.local
# Fill only web-safe values (SUPABASE_ANON_KEY, SUPABASE_URL)
# Never include SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL
```

### ETL Jobs Environment
```bash
cp .env.example apps/jobs/.env
# Fill server-only keys for local ETL testing
# Include DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY for full access
```

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

## Prisma Database Management

### Prisma Scripts
- `npm run db:migrate:deploy` - Deploy migrations to production
- `npm run db:migrate:dev` - Create and apply migrations in development
- `npm run db:generate` - Generate Prisma client
- `npm run db:studio` - Open Prisma Studio for database management
- `npm run db:seed` - Seed database with initial data
- `npm run db:reset` - Reset database and apply all migrations

### Migration Workflow
1. **Development**: Use `prisma migrate dev` for interactive development
2. **Production**: Use `prisma migrate deploy` via GitHub Actions
3. **Client Generation**: Run `prisma generate` after schema changes
4. **Verification**: Use `prisma studio` to verify data integrity

### Database Connection Strategy
- **Web App**: Uses `DATABASE_URL` from Vercel Project Environment Variables
- **ETL Jobs**: Uses `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for full access
- **Migrations**: Uses `DATABASE_URL` and `SHADOW_DATABASE_URL` for schema changes
- **Connection Pooling**: Use pooled connection strings for serverless environments

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
