-- Add missing teams that CFBD aliases reference
-- This ensures all CFBD aliases point to existing team IDs

DO $$
BEGIN
  -- Add missing teams one by one
  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'hawaii') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('hawaii', 'Hawaiʻi Rainbow Warriors', 'Mountain West', 'West', 
            'https://example.com/logos/hawaii.png', '#003366', '#FFFFFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'san-jos-state') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('san-jos-state', 'San José State Spartans', 'Mountain West', 'West',
            'https://example.com/logos/san-jos-state.png', '#1B365D', '#FFC72C');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'akron') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('akron', 'Akron Zips', 'MAC', 'East',
            'https://example.com/logos/akron.png', '#041E42', '#FFB81C');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'army') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('army', 'Army Black Knights', 'Independent', 'Independent',
            'https://example.com/logos/army.png', '#D4AF37', '#000000');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'coastal-carolina') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('coastal-carolina', 'Coastal Carolina Chanticleers', 'Sun Belt', 'East',
            'https://example.com/logos/coastal-carolina.png', '#1B365D', '#00A4CC');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'east-carolina') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('east-carolina', 'East Carolina Pirates', 'American', 'East',
            'https://example.com/logos/east-carolina.png', '#4B1869', '#F5F5DC');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'florida-international') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('florida-international', 'FIU Panthers', 'Conference USA', 'East',
            'https://example.com/logos/florida-international.png', '#003366', '#F0F0F0');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'florida-state') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('florida-state', 'Florida State Seminoles', 'ACC', 'Atlantic',
            'https://example.com/logos/florida-state.png', '#782F40', '#CECECE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'indiana') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('indiana', 'Indiana Hoosiers', 'Big Ten', 'East',
            'https://example.com/logos/indiana.png', '#990000', '#FFFFFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'liberty') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('liberty', 'Liberty Flames', 'Conference USA', 'East',
            'https://example.com/logos/liberty.png', '#002D62', '#FFFFFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'marshall') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('marshall', 'Marshall Thundering Herd', 'Sun Belt', 'East',
            'https://example.com/logos/marshall.png', '#006633', '#FFFFFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'maryland') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('maryland', 'Maryland Terrapins', 'Big Ten', 'East',
            'https://example.com/logos/maryland.png', '#E03A3E', '#FFFFFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'new-mexico') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('new-mexico', 'New Mexico Lobos', 'Mountain West', 'West',
            'https://example.com/logos/new-mexico.png', '#C8102E', '#FFFFFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'new-mexico-state') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('new-mexico-state', 'New Mexico State Aggies', 'Conference USA', 'West',
            'https://example.com/logos/new-mexico-state.png', '#8B0000', '#FFFFFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'oregon-state') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('oregon-state', 'Oregon State Beavers', 'Pac-12', 'Pac-12',
            'https://example.com/logos/oregon-state.png', '#D73F09', '#000000');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'unlv') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('unlv', 'UNLV Rebels', 'Mountain West', 'West',
            'https://example.com/logos/unlv.png', '#C8102E', '#FFFFFF');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = 'western-kentucky') THEN
    INSERT INTO teams (id, name, conference, division, logo_url, primary_color, secondary_color)
    VALUES ('western-kentucky', 'Western Kentucky Hilltoppers', 'Conference USA', 'East',
            'https://example.com/logos/western-kentucky.png', '#E31937', '#FFFFFF');
  END IF;

END$$;
