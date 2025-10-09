-- CreateIndex
CREATE UNIQUE INDEX "power_ratings_teamId_season_week_modelVersion_key" ON "power_ratings"("team_id", "season", "week", "model_version");
