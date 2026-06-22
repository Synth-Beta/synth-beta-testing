-- Fix the trigger by adding the missing unique constraints
-- The trigger expects unique constraints that don't exist

-- Add unique constraints to user_artist_interactions
ALTER TABLE user_artist_interactions 
ADD CONSTRAINT unique_user_artist_interaction 
UNIQUE (user_id, artist_name, interaction_type, source_entity_type, source_entity_id);

-- Add unique constraints to user_venue_interactions
ALTER TABLE user_venue_interactions 
ADD CONSTRAINT unique_user_venue_interaction 
UNIQUE (user_id, venue_name, interaction_type, source_entity_type, source_entity_id);

-- Add unique constraints to user_genre_interactions
ALTER TABLE user_genre_interactions 
ADD CONSTRAINT unique_user_genre_interaction 
UNIQUE (user_id, genre, interaction_type, source_entity_type, source_entity_id);
