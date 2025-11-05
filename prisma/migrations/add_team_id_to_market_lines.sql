-- Add teamId column to market_lines table
ALTER TABLE "market_lines" ADD COLUMN IF NOT EXISTS "team_id" TEXT;

-- Add foreign key constraint
ALTER TABLE "market_lines" ADD CONSTRAINT "market_lines_team_id_fkey" 
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old unique constraint
ALTER TABLE "market_lines" DROP CONSTRAINT IF EXISTS "market_lines_game_line_book_timestamp_unique";

-- Add new unique constraint with teamId
ALTER TABLE "market_lines" ADD CONSTRAINT "market_lines_game_line_book_timestamp_team_unique" 
  UNIQUE ("game_id", "line_type", "book_name", "timestamp", "team_id");

-- Add index for teamId
CREATE INDEX IF NOT EXISTS "market_lines_team_id_idx" ON "market_lines"("team_id");

-- Add composite index for gameId, lineType, teamId
CREATE INDEX IF NOT EXISTS "market_lines_game_id_line_type_team_id_idx" ON "market_lines"("game_id", "line_type", "team_id");

