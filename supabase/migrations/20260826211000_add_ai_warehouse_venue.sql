-- Add A.i. Warehouse (Washington, DC) from JamBase listing.
-- JamBase venue page: https://www.jambase.com/venue/ai-warehouse
--
-- This migration is intentionally schema-tolerant because this repo contains
-- both legacy and 3NF venue shapes across codepaths. It inserts exactly once
-- if the venue is missing.

DO $$
DECLARE
  venues_regclass regclass;
  has_city_col boolean;
  has_state_col boolean;
  has_street_address_col boolean;
  has_address_col boolean;
  has_jambase_venue_id_col boolean;
  has_identifier_col boolean;
  has_url_col boolean;
  has_country_col boolean;
  has_zip_col boolean;
  has_verified_col boolean;
  has_last_synced_at_col boolean;
  has_max_capacity_col boolean;
  has_num_upcoming_col boolean;
  has_date_published_col boolean;
  has_date_modified_col boolean;
  has_created_at_col boolean;
  has_updated_at_col boolean;
  existing_venue_id uuid;
  inserted_venue_id uuid;
BEGIN
  SELECT to_regclass('public.venues') INTO venues_regclass;
  IF venues_regclass IS NULL THEN
    RAISE NOTICE 'public.venues does not exist; skipping A.i. Warehouse insert.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'city'
  ) INTO has_city_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'state'
  ) INTO has_state_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'street_address'
  ) INTO has_street_address_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'address'
  ) INTO has_address_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'jambase_venue_id'
  ) INTO has_jambase_venue_id_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'identifier'
  ) INTO has_identifier_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'url'
  ) INTO has_url_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'country'
  ) INTO has_country_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'zip'
  ) INTO has_zip_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'verified'
  ) INTO has_verified_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'last_synced_at'
  ) INTO has_last_synced_at_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'maximum_attendee_capacity'
  ) INTO has_max_capacity_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'num_upcoming_events'
  ) INTO has_num_upcoming_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'date_published'
  ) INTO has_date_published_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'date_modified'
  ) INTO has_date_modified_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'created_at'
  ) INTO has_created_at_col;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'updated_at'
  ) INTO has_updated_at_col;

  -- First, check for an existing venue match (prefer name + city/state if present).
  IF has_city_col AND has_state_col THEN
    EXECUTE $SQL$
      SELECT id
      FROM public.venues
      WHERE lower(name) = lower('A.i. Warehouse')
        AND lower(coalesce(city, '')) = lower('Washington')
        AND lower(coalesce(state, '')) = lower('DC')
      LIMIT 1
    $SQL$ INTO existing_venue_id;
  ELSE
    EXECUTE $SQL$
      SELECT id
      FROM public.venues
      WHERE lower(name) = lower('A.i. Warehouse')
      LIMIT 1
    $SQL$ INTO existing_venue_id;
  END IF;

  IF existing_venue_id IS NOT NULL THEN
    inserted_venue_id := existing_venue_id;
  ELSE
    -- Newer 3NF-ish shape
    IF has_street_address_col THEN
      EXECUTE format(
        'INSERT INTO public.venues (%s) VALUES (%s) RETURNING id',
        array_to_string(ARRAY[
          'name',
          CASE WHEN has_identifier_col THEN 'identifier' END,
          CASE WHEN has_url_col THEN 'url' END,
          CASE WHEN has_street_address_col THEN 'street_address' END,
          CASE WHEN has_city_col THEN 'city' END,
          CASE WHEN has_state_col THEN 'state' END,
          CASE WHEN has_zip_col THEN 'zip' END,
          CASE WHEN has_country_col THEN 'country' END,
          CASE WHEN has_max_capacity_col THEN 'maximum_attendee_capacity' END,
          CASE WHEN has_num_upcoming_col THEN 'num_upcoming_events' END,
          CASE WHEN has_date_published_col THEN 'date_published' END,
          CASE WHEN has_date_modified_col THEN 'date_modified' END,
          CASE WHEN has_verified_col THEN 'verified' END,
          CASE WHEN has_last_synced_at_col THEN 'last_synced_at' END,
          CASE WHEN has_created_at_col THEN 'created_at' END,
          CASE WHEN has_updated_at_col THEN 'updated_at' END
        ], ', '),
        array_to_string(ARRAY[
          quote_literal('A.i. Warehouse'),
          CASE WHEN has_identifier_col THEN quote_literal('ai_warehouse') END,
          CASE WHEN has_url_col THEN quote_literal('https://www.jambase.com/venue/ai-warehouse') END,
          CASE WHEN has_street_address_col THEN quote_literal('530 Penn Street Northeast') END,
          CASE WHEN has_city_col THEN quote_literal('Washington') END,
          CASE WHEN has_state_col THEN quote_literal('DC') END,
          CASE WHEN has_zip_col THEN quote_literal('20002') END,
          CASE WHEN has_country_col THEN quote_literal('US') END,
          CASE WHEN has_max_capacity_col THEN 'NULL' END,
          CASE WHEN has_num_upcoming_col THEN '0' END,
          CASE WHEN has_date_published_col THEN 'now()' END,
          CASE WHEN has_date_modified_col THEN 'now()' END,
          CASE WHEN has_verified_col THEN 'false' END,
          CASE WHEN has_last_synced_at_col THEN 'now()' END,
          CASE WHEN has_created_at_col THEN 'now()' END,
          CASE WHEN has_updated_at_col THEN 'now()' END
        ], ', ')
      ) INTO inserted_venue_id;

    -- Legacy shape
    ELSE
      EXECUTE format(
        'INSERT INTO public.venues (%s) VALUES (%s) RETURNING id',
        array_to_string(ARRAY[
          CASE WHEN has_jambase_venue_id_col THEN 'jambase_venue_id' END,
          'name',
          CASE WHEN has_identifier_col THEN 'identifier' END,
          CASE WHEN has_url_col THEN 'url' END,
          CASE WHEN has_address_col THEN 'address' END,
          CASE WHEN has_city_col THEN 'city' END,
          CASE WHEN has_state_col THEN 'state' END,
          CASE WHEN has_zip_col THEN 'zip' END,
          CASE WHEN has_country_col THEN 'country' END,
          CASE WHEN has_date_published_col THEN 'date_published' END,
          CASE WHEN has_date_modified_col THEN 'date_modified' END,
          CASE WHEN has_created_at_col THEN 'created_at' END,
          CASE WHEN has_updated_at_col THEN 'updated_at' END
        ], ', '),
        array_to_string(ARRAY[
          CASE WHEN has_jambase_venue_id_col THEN quote_literal('ai-warehouse') END,
          quote_literal('A.i. Warehouse'),
          CASE WHEN has_identifier_col THEN quote_literal('jambase:ai-warehouse') END,
          CASE WHEN has_url_col THEN quote_literal('https://www.jambase.com/venue/ai-warehouse') END,
          CASE WHEN has_address_col THEN quote_literal('530 Penn Street Northeast') END,
          CASE WHEN has_city_col THEN quote_literal('Washington') END,
          CASE WHEN has_state_col THEN quote_literal('DC') END,
          CASE WHEN has_zip_col THEN quote_literal('20002') END,
          CASE WHEN has_country_col THEN quote_literal('US') END,
          CASE WHEN has_date_published_col THEN 'now()' END,
          CASE WHEN has_date_modified_col THEN 'now()' END,
          CASE WHEN has_created_at_col THEN 'now()' END,
          CASE WHEN has_updated_at_col THEN 'now()' END
        ], ', ')
      ) INTO inserted_venue_id;
    END IF;
  END IF;

  -- Backfill external ID mapping when the normalization table is present.
  IF inserted_venue_id IS NOT NULL
     AND to_regclass('public.external_entity_ids') IS NOT NULL THEN
    BEGIN
      EXECUTE $SQL$
        INSERT INTO public.external_entity_ids (entity_uuid, source, entity_type, external_id)
        VALUES ($1, 'jambase', 'venue', 'ai-warehouse')
        ON CONFLICT (source, entity_type, external_id)
        DO UPDATE SET entity_uuid = EXCLUDED.entity_uuid
      $SQL$ USING inserted_venue_id;
    EXCEPTION WHEN undefined_column THEN
      -- If external_entity_ids has a different shape in older environments, skip.
      RAISE NOTICE 'external_entity_ids shape does not match expected columns; skipping mapping insert.';
    WHEN undefined_table THEN
      NULL;
    END;
  END IF;
END $$;
