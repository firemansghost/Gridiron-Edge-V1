-- Cleanup script for duplicate migration entries: 20251027_t6q_fixup_missing_teams
-- This removes invalid/duplicate entries and keeps only the valid one

-- First, check all entries for this migration
SELECT 
    id,
    migration_name, 
    started_at, 
    finished_at, 
    applied_steps_count,
    logs
FROM _prisma_migrations 
WHERE migration_name = '20251027_t6q_fixup_missing_teams'
ORDER BY started_at;

-- Delete duplicate/invalid entries
-- Keep only the most recent entry that has finished_at set and applied_steps_count = 1
DELETE FROM _prisma_migrations
WHERE migration_name = '20251027_t6q_fixup_missing_teams'
  AND (
    -- Delete entries where applied_steps_count = 0 (incomplete)
    applied_steps_count = 0
    OR
    -- Delete entries where finished_at is NULL or equals started_at (failed)
    finished_at IS NULL 
    OR finished_at = started_at
    OR
    -- Delete older entries, keeping only the most recent valid one
    id NOT IN (
      SELECT id 
      FROM _prisma_migrations 
      WHERE migration_name = '20251027_t6q_fixup_missing_teams'
        AND finished_at IS NOT NULL 
        AND finished_at != started_at
        AND applied_steps_count = 1
      ORDER BY finished_at DESC 
      LIMIT 1
    )
  );

-- Verify cleanup - should only see one entry now
SELECT 
    id,
    migration_name, 
    started_at, 
    finished_at, 
    applied_steps_count
FROM _prisma_migrations 
WHERE migration_name = '20251027_t6q_fixup_missing_teams';

-- Should return exactly 1 row with finished_at IS NOT NULL and applied_steps_count = 1

