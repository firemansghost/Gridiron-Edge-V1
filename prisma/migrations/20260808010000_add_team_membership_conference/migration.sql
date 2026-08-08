-- AlterTable
-- Phase 2C-2G-2: nullable season-aware conference on TeamMembership.
-- Column add only; no data backfill in this migration.
ALTER TABLE "team_membership" ADD COLUMN "conference" TEXT;
