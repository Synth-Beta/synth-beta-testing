-- ============================================
-- ADD CREATOR EVENT CREATION PERMISSION
-- ============================================
-- Adds the 'create_events' permission to creators so they can create events
-- just like business accounts

-- Add create_events permission for creators
INSERT INTO public.account_permissions (account_type, permission_key, permission_name, permission_description) VALUES
('creator', 'create_events', 'Create Events', 'Can create and manage events for their artist/label');

-- Add comment for documentation
COMMENT ON TABLE public.account_permissions IS 'Updated to include event creation permissions for creators';
