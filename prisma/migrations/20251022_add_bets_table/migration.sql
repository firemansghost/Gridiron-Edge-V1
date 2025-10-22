-- CreateEnum
CREATE TYPE "BetSide" AS ENUM ('home', 'away', 'over', 'under');

-- CreateEnum
CREATE TYPE "BetSource" AS ENUM ('strategy_run', 'manual');

-- CreateTable
CREATE TABLE "bets" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "game_id" TEXT NOT NULL,
    "market_type" "BetType" NOT NULL,
    "side" "BetSide" NOT NULL,
    "model_price" DECIMAL(65,30) NOT NULL,
    "close_price" DECIMAL(65,30),
    "stake" DECIMAL(65,30) NOT NULL,
    "result" "BetResult",
    "pnl" DECIMAL(65,30),
    "clv" DECIMAL(65,30),
    "strategy_tag" TEXT NOT NULL,
    "source" "BetSource" NOT NULL,
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bets_season_week_idx" ON "bets"("season", "week");

-- CreateIndex
CREATE INDEX "bets_strategy_tag_idx" ON "bets"("strategy_tag");

-- CreateIndex
CREATE INDEX "bets_game_id_market_type_idx" ON "bets"("game_id", "market_type");

-- AddForeignKey
ALTER TABLE "bets" ADD CONSTRAINT "bets_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
