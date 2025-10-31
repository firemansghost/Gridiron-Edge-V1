-- Final cleanup: Remove ALL duplicate entries
-- Then use Prisma's resolve command to properly mark it

-- Step 1: Delete ALL entries for this migration
DELETE FROM _prisma_migrations
WHERE migration_name = '20251027_t6q_fixup_missing_teams';

-- Step 2: Verify deletion
SELECT COUNT(*) as remaining_entries
FROM _prisma_migrations 
WHERE migration_name = '20251027_t6q_fixup_missing_teams';
-- Should return 0

-- After running this, use Prisma CLI to mark as rolled back:
-- npx prisma migrate resolve --rolled-back 20251027_t6q_fixup_missing_teams --schema=prisma/schema.prisma

