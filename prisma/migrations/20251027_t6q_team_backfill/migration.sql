-- Add missing teams that CFBD aliases reference
-- This ensures FK constraints are satisfied

DO $$
BEGIN
  -- Add Hawaii if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'hawaii') THEN
    INSERT INTO teams (id, name, conference, division, "logoUrl", "primaryColor", "secondaryColor")
    VALUES ('hawaii', 'Hawaiʻi Rainbow Warriors', 'Mountain West', 'West', 
            'https://example.com/logos/hawaii.png', '#003366', '#FFFFFF');
  END IF;

  -- San Jose State should already exist as 'san-jos-state' based on the alias file
  -- If it doesn't exist, add it
  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'san-jos-state') THEN
    INSERT INTO teams (id, name, conference, division, "logoUrl", "primaryColor", "secondaryColor")
    VALUES ('san-jos-state', 'San José State Spartans', 'Mountain West', 'West',
            'https://example.com/logos/san-jos-state.png', '#1B365D', '#FFC72C');
  END IF;
END$$;
