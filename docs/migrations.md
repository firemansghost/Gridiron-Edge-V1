# Database Migrations

## Overview
Gridiron Edge uses Prisma for database schema management and migrations. All database changes are tracked through Prisma migrations to ensure consistency across environments.

## Prisma Setup

### Schema Location
- **Schema File**: `/prisma/schema.prisma`
- **Migrations**: `/prisma/migrations/`
- **Generated Client**: `node_modules/.prisma/client/`

### Environment Variables
- `DATABASE_URL` - Primary database connection (pooled for Vercel)
- `SHADOW_DATABASE_URL` - Shadow database for migrations (same cluster, different DB)

## Migration Workflow

### Development
```bash
# Create a new migration
npm run db:migrate:dev

# Generate Prisma client
npm run db:generate

# Open Prisma Studio
npm run db:studio
```

### Production Deployment
```bash
# Deploy migrations to production
npm run db:migrate:deploy

# Generate client for production
npm run db:generate
```

### GitHub Actions
- **Trigger**: Push to main branch with changes to `prisma/` directory
- **Actions**: 
  1. Generate Prisma client
  2. Run `prisma migrate deploy`
  3. Verify migration success
- **Secrets Required**: `DATABASE_URL`, `SHADOW_DATABASE_URL`

## Schema Design Principles

### Table Naming
- **Database Tables**: snake_case (e.g., `team_game_stats`)
- **Prisma Models**: PascalCase (e.g., `TeamGameStat`)
- **Field Mapping**: Use `@map()` for database field names

### Indexes
- **Primary Keys**: All tables have `id` field with appropriate type
- **Foreign Keys**: Proper relations with `onDelete: Cascade`
- **Performance Indexes**: Based on query patterns from `/docs/data_model.md`

### Data Types
- **Timestamps**: `DateTime` with `@default(now())` and `@updatedAt`
- **JSON Fields**: Used for flexible data (stats, features, parameters)
- **Enums**: Proper enum types for status fields

## Model Relationships

### Core Relationships
- `Team` → `Game` (home/away teams)
- `Game` → `TeamGameStat` (one-to-many)
- `Game` → `MarketLine` (one-to-many)
- `Team` → `PowerRating` (one-to-many)
- `Game` → `MatchupOutput` (one-to-one)

### Betting Relationships
- `Game` → `Bet` (one-to-many)
- `Ruleset` → `StrategyRun` (one-to-many)

## Migration Best Practices

### Schema Changes
1. **Always create migrations** for schema changes
2. **Test migrations** on development database first
3. **Backup production** before major migrations
4. **Use transactions** for complex migrations

### Data Migrations
1. **Separate data changes** from schema changes
2. **Use raw SQL** for complex data transformations
3. **Validate data** after migrations
4. **Rollback plan** for failed migrations

### Performance Considerations
1. **Add indexes** for new query patterns
2. **Consider table size** for large datasets
3. **Use partial indexes** where appropriate
4. **Monitor migration performance**

## Environment-Specific Configuration

### Development
- **Database**: Local or development Supabase instance
- **Migrations**: `prisma migrate dev` for interactive development
- **Client**: Generated automatically with `prisma generate`

### Preview
- **Database**: Preview Supabase instance
- **Migrations**: `prisma migrate deploy` for automated deployment
- **Client**: Generated during build process

### Production
- **Database**: Production Supabase instance
- **Migrations**: `prisma migrate deploy` via GitHub Actions
- **Client**: Generated during deployment process
- **Backup**: Automated daily backups via Supabase

## Troubleshooting

### Common Issues
1. **Migration conflicts**: Resolve by rebasing and regenerating
2. **Client generation**: Run `prisma generate` after schema changes
3. **Connection issues**: Verify `DATABASE_URL` format
4. **Shadow database**: Ensure `SHADOW_DATABASE_URL` is accessible

### Recovery Procedures
1. **Failed migrations**: Use `prisma migrate resolve` to mark as applied
2. **Schema drift**: Use `prisma db pull` to sync with database
3. **Data loss**: Restore from Supabase backups
4. **Client issues**: Delete `node_modules/.prisma` and regenerate

## Monitoring

### Migration Status
- **GitHub Actions**: Check workflow status for deployment
- **Database**: Query `_prisma_migrations` table for history
- **Logs**: Monitor application logs for connection issues

### Performance Metrics
- **Migration time**: Track duration of large migrations
- **Query performance**: Monitor slow queries after schema changes
- **Connection pool**: Monitor database connection usage
