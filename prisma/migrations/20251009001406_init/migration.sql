-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('scheduled', 'in_progress', 'final');

-- CreateEnum
CREATE TYPE "LineType" AS ENUM ('spread', 'total', 'moneyline');

-- CreateEnum
CREATE TYPE "EdgeConfidence" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "BetType" AS ENUM ('spread', 'total', 'moneyline');

-- CreateEnum
CREATE TYPE "BetResult" AS ENUM ('win', 'loss', 'push');

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conference" TEXT NOT NULL,
    "division" TEXT,
    "logo_url" TEXT NOT NULL,
    "primary_color" TEXT NOT NULL,
    "secondary_color" TEXT NOT NULL,
    "mascot" TEXT,
    "city" TEXT,
    "state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "home_team_id" TEXT NOT NULL,
    "away_team_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "GameStatus" NOT NULL,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "venue" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "neutral_site" BOOLEAN NOT NULL DEFAULT false,
    "conference_game" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_game_stats" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "offensive_stats" JSONB NOT NULL,
    "defensive_stats" JSONB NOT NULL,
    "special_teams" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_game_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiting" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "class_rank" INTEGER NOT NULL,
    "avg_rating" DOUBLE PRECISION NOT NULL,
    "commit_count" INTEGER NOT NULL,
    "five_stars" INTEGER NOT NULL,
    "four_stars" INTEGER NOT NULL,
    "three_stars" INTEGER NOT NULL,
    "top_players" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_lines" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "line_type" "LineType" NOT NULL,
    "line_value" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "closing_line" DOUBLE PRECISION NOT NULL,
    "book_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "power_ratings" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "model_version" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "power_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matchup_outputs" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "implied_spread" DOUBLE PRECISION NOT NULL,
    "implied_total" DOUBLE PRECISION NOT NULL,
    "market_spread" DOUBLE PRECISION NOT NULL,
    "market_total" DOUBLE PRECISION NOT NULL,
    "edge_confidence" "EdgeConfidence" NOT NULL,
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matchup_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bets" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "bet_type" "BetType" NOT NULL,
    "line_at_bet" DOUBLE PRECISION NOT NULL,
    "closing_line" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "result" "BetResult",
    "pnl" DOUBLE PRECISION,
    "clv" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rulesets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parameters" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rulesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_runs" (
    "id" TEXT NOT NULL,
    "ruleset_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "total_bets" INTEGER NOT NULL,
    "win_rate" DOUBLE PRECISION NOT NULL,
    "roi" DOUBLE PRECISION NOT NULL,
    "clv" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_conference_division_idx" ON "teams"("conference", "division");

-- CreateIndex
CREATE INDEX "teams_name_idx" ON "teams"("name");

-- CreateIndex
CREATE INDEX "games_season_week_idx" ON "games"("season", "week");

-- CreateIndex
CREATE INDEX "games_home_team_id_season_idx" ON "games"("home_team_id", "season");

-- CreateIndex
CREATE INDEX "games_away_team_id_season_idx" ON "games"("away_team_id", "season");

-- CreateIndex
CREATE INDEX "games_date_idx" ON "games"("date");

-- CreateIndex
CREATE INDEX "team_game_stats_team_id_season_idx" ON "team_game_stats"("team_id", "season");

-- CreateIndex
CREATE INDEX "team_game_stats_game_id_idx" ON "team_game_stats"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_game_stats_game_id_team_id_key" ON "team_game_stats"("game_id", "team_id");

-- CreateIndex
CREATE INDEX "recruiting_team_id_season_idx" ON "recruiting"("team_id", "season");

-- CreateIndex
CREATE INDEX "recruiting_season_class_rank_idx" ON "recruiting"("season", "class_rank");

-- CreateIndex
CREATE INDEX "market_lines_game_id_line_type_idx" ON "market_lines"("game_id", "line_type");

-- CreateIndex
CREATE INDEX "market_lines_timestamp_idx" ON "market_lines"("timestamp");

-- CreateIndex
CREATE INDEX "market_lines_season_week_idx" ON "market_lines"("season", "week");

-- CreateIndex
CREATE INDEX "power_ratings_team_id_season_idx" ON "power_ratings"("team_id", "season");

-- CreateIndex
CREATE INDEX "power_ratings_season_week_idx" ON "power_ratings"("season", "week");

-- CreateIndex
CREATE INDEX "power_ratings_model_version_idx" ON "power_ratings"("model_version");

-- CreateIndex
CREATE INDEX "power_ratings_rating_idx" ON "power_ratings"("rating" DESC);

-- CreateIndex
CREATE INDEX "matchup_outputs_game_id_idx" ON "matchup_outputs"("game_id");

-- CreateIndex
CREATE INDEX "matchup_outputs_season_week_idx" ON "matchup_outputs"("season", "week");

-- CreateIndex
CREATE INDEX "matchup_outputs_edge_confidence_idx" ON "matchup_outputs"("edge_confidence");

-- CreateIndex
CREATE INDEX "matchup_outputs_model_version_idx" ON "matchup_outputs"("model_version");

-- CreateIndex
CREATE INDEX "bets_game_id_idx" ON "bets"("game_id");

-- CreateIndex
CREATE INDEX "bets_bet_type_idx" ON "bets"("bet_type");

-- CreateIndex
CREATE INDEX "bets_result_idx" ON "bets"("result");

-- CreateIndex
CREATE INDEX "bets_created_at_idx" ON "bets"("created_at");

-- CreateIndex
CREATE INDEX "rulesets_active_idx" ON "rulesets"("active");

-- CreateIndex
CREATE INDEX "rulesets_name_idx" ON "rulesets"("name");

-- CreateIndex
CREATE INDEX "strategy_runs_ruleset_id_idx" ON "strategy_runs"("ruleset_id");

-- CreateIndex
CREATE INDEX "strategy_runs_start_date_idx" ON "strategy_runs"("start_date");

-- CreateIndex
CREATE INDEX "strategy_runs_roi_idx" ON "strategy_runs"("roi" DESC);

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_game_stats" ADD CONSTRAINT "team_game_stats_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiting" ADD CONSTRAINT "recruiting_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_lines" ADD CONSTRAINT "market_lines_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "power_ratings" ADD CONSTRAINT "power_ratings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_outputs" ADD CONSTRAINT "matchup_outputs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_runs" ADD CONSTRAINT "strategy_runs_ruleset_id_fkey" FOREIGN KEY ("ruleset_id") REFERENCES "rulesets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
