-- Manual resolution script for failed migration: 20251027_t6q_fixup_missing_teams
-- Run this in Supabase SQL Editor to mark the migration as applied

-- First, check the current state
SELECT 
    migration_name, 
    started_at, 
    finished_at, 
    applied_steps_count,
    logs
FROM _prisma_migrations 
WHERE migration_name = '20251027_t6q_fixup_missing_teams';

-- Update the migration to mark it as applied
UPDATE _prisma_migrations 
SET 
    finished_at = NOW(),
    applied_steps_count = 1
WHERE migration_name = '20251027_t6q_fixup_missing_teams' 
  AND finished_at IS NULL;

-- Verify it was updated
SELECT 
    migration_name, 
    started_at, 
    finished_at, 
    applied_steps_count
FROM _prisma_migrations 
WHERE migration_name = '20251027_t6q_fixup_missing_teams';

-- Should now show finished_at IS NOT NULL

