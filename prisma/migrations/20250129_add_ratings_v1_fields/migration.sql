-- Add Ratings v1 fields to team_season_ratings
ALTER TABLE "team_season_ratings" 
  ADD COLUMN IF NOT EXISTS "power_rating" DECIMAL,
  ADD COLUMN IF NOT EXISTS "confidence" DECIMAL,
  ADD COLUMN IF NOT EXISTS "data_source" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to update updated_at on row updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS update_team_season_ratings_updated_at ON "team_season_ratings";
CREATE TRIGGER update_team_season_ratings_updated_at
  BEFORE UPDATE ON "team_season_ratings"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

