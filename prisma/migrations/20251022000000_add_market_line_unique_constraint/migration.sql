-- Add unique constraint to prevent duplicate market lines
-- This ensures idempotent odds ingestion when using skipDuplicates
-- Natural key: gameId + lineType + bookName + timestamp

-- Step 1: Remove existing duplicates (keep the earliest row by created_at)
DELETE FROM "market_lines" ml1
USING "market_lines" ml2
WHERE ml1.id > ml2.id
  AND ml1.game_id = ml2.game_id
  AND ml1.line_type = ml2.line_type
  AND ml1.book_name = ml2.book_name
  AND ml1.timestamp = ml2.timestamp;

-- Step 2: Add unique constraint
CREATE UNIQUE INDEX "market_lines_game_line_book_timestamp_unique" 
ON "market_lines"("game_id", "line_type", "book_name", "timestamp");

