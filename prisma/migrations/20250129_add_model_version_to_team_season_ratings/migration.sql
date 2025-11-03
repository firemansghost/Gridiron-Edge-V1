-- AlterTable
ALTER TABLE "team_season_ratings" ADD COLUMN "model_version" TEXT NOT NULL DEFAULT 'v1';

-- AlterTable: Update primary key to include model_version
-- First, drop the existing primary key constraint
ALTER TABLE "team_season_ratings" DROP CONSTRAINT "team_season_ratings_pkey";

-- Add new primary key with model_version
ALTER TABLE "team_season_ratings" ADD PRIMARY KEY ("season", "team_id", "model_version");

-- CreateIndex
CREATE INDEX "team_season_ratings_season_model_version_idx" ON "team_season_ratings"("season", "model_version");

-- CreateIndex
CREATE INDEX "team_season_ratings_model_version_idx" ON "team_season_ratings"("model_version");


