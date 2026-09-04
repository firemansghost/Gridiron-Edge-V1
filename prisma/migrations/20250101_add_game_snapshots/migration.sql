-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('pre_kick', 'closing', 'intraday');

-- CreateTable
CREATE TABLE "game_snapshots" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "snapshot_type" "SnapshotType" NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "status_at_capture" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "config_hash" TEXT,
    "sign_convention_json" JSONB,
    "market_consensus" JSONB NOT NULL,
    "model_inputs" JSONB NOT NULL,
    "picks" JSONB NOT NULL,
    "telemetry" JSONB,
    "fallback_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_snapshot_links" (
    "game_id" TEXT NOT NULL,
    "official_pre_kick_snapshot_id" TEXT,
    "official_closing_snapshot_id" TEXT,
    "frozen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_snapshot_links_pkey" PRIMARY KEY ("game_id")
);

-- CreateIndex
CREATE INDEX "game_snapshots_game_id_idx" ON "game_snapshots"("game_id");
CREATE INDEX "game_snapshots_season_week_idx" ON "game_snapshots"("season", "week");
CREATE INDEX "game_snapshots_snapshot_type_idx" ON "game_snapshots"("snapshot_type");
CREATE INDEX "game_snapshots_snapshot_at_idx" ON "game_snapshots"("snapshot_at");

-- CreateIndex
CREATE INDEX "game_snapshot_links_pre_kick_idx" ON "game_snapshot_links"("official_pre_kick_snapshot_id");
CREATE INDEX "game_snapshot_links_closing_idx" ON "game_snapshot_links"("official_closing_snapshot_id");

-- AddForeignKey
ALTER TABLE "game_snapshots" ADD CONSTRAINT "game_snapshots_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_snapshot_links" ADD CONSTRAINT "game_snapshot_links_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_snapshot_links" ADD CONSTRAINT "game_snapshot_links_pre_kick_fkey" FOREIGN KEY ("official_pre_kick_snapshot_id") REFERENCES "game_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_snapshot_links" ADD CONSTRAINT "game_snapshot_links_closing_fkey" FOREIGN KEY ("official_closing_snapshot_id") REFERENCES "game_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

