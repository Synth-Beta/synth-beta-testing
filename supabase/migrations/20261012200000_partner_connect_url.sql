-- Where Synth sends a user to finish connecting (partner's page; opens their app via
-- universal link when installed). The link-start endpoint appends ?code=<one-time code>.
-- Null: Synth shows the code for the user to type instead.
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS connect_url text;
