-- CreateTable
CREATE TABLE IF NOT EXISTS "team_membership" (
    "season" INTEGER NOT NULL,
    "team_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,

    CONSTRAINT "team_membership_pkey" PRIMARY KEY ("season", "team_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_team_membership_season_level" ON "team_membership"("season", "level");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "team_membership_team_id_idx" ON "team_membership"("team_id");

-- AddForeignKey
ALTER TABLE "team_membership" ADD CONSTRAINT "team_membership_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

