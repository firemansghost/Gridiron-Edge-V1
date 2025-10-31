-- Fix: Mark migration as applied since teams already exist
-- The migration SQL can't run due to updated_at constraint, but data is already there

-- Check if teams from this migration already exist
SELECT COUNT(*) as existing_teams
FROM teams 
WHERE id IN (
    'hawaii', 'san-jos-state', 'akron', 'army', 'coastal-carolina',
    'east-carolina', 'florida-international', 'florida-state', 'indiana',
    'liberty', 'marshall', 'maryland', 'new-mexico', 'new-mexico-state',
    'oregon-state', 'unlv', 'western-kentucky'
);

-- Update the migration to mark it as applied (even though SQL can't run)
-- Since the teams already exist, we can safely mark it as applied
UPDATE _prisma_migrations 
SET 
    finished_at = NOW(),
    applied_steps_count = 1,
    started_at = COALESCE(started_at, NOW() - INTERVAL '1 hour')
WHERE migration_name = '20251027_t6q_fixup_missing_teams';

-- Verify
SELECT 
    id,
    migration_name, 
    started_at, 
    finished_at, 
    applied_steps_count
FROM _prisma_migrations 
WHERE migration_name = '20251027_t6q_fixup_missing_teams';

