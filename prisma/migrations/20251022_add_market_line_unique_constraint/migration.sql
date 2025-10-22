-- Add unique constraint to prevent duplicate market lines
-- This ensures idempotent odds ingestion when using skipDuplicates
-- Natural key: gameId + lineType + bookName + timestamp

CREATE UNIQUE INDEX "market_lines_game_line_book_timestamp_unique" 
ON "market_lines"("game_id", "line_type", "book_name", "timestamp");


