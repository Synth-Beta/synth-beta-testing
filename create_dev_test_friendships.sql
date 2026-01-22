-- Create friendships between Dev Test User and Sam Loiterstein, Lauren Pesce, and Tej Patel
-- All friendships are created as 'accepted' status
-- Note: Only one direction is needed due to unique_friendship_bidirectional constraint

BEGIN;

-- Dev Test User -> Sam Loiterstein
INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status, metadata, created_at, updated_at)
VALUES (
  'd38b8090-f269-45d5-888f-c5a29765328e', -- Dev Test User
  '349bda34-7878-4c10-9f86-ec5888e55571', -- Sam Loiterstein
  'friend',
  'accepted',
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, related_user_id, relationship_type) 
DO UPDATE SET 
  status = 'accepted',
  updated_at = NOW();

-- Dev Test User -> Lauren Pesce
INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status, metadata, created_at, updated_at)
VALUES (
  'd38b8090-f269-45d5-888f-c5a29765328e', -- Dev Test User
  '7d727ff6-fb7f-4e86-b272-f5ac31bd08d4', -- Lauren Pesce
  'friend',
  'accepted',
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, related_user_id, relationship_type) 
DO UPDATE SET 
  status = 'accepted',
  updated_at = NOW();

-- Dev Test User -> Tej Patel
INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status, metadata, created_at, updated_at)
VALUES (
  'd38b8090-f269-45d5-888f-c5a29765328e', -- Dev Test User
  '690d27ae-d803-4ff5-a381-162f8863dd9b', -- Tej Patel
  'friend',
  'accepted',
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, related_user_id, relationship_type) 
DO UPDATE SET 
  status = 'accepted',
  updated_at = NOW();

-- Sam Loiterstein -> Mara
INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status, metadata, created_at, updated_at)
VALUES (
  '349bda34-7878-4c10-9f86-ec5888e55571', -- Sam Loiterstein
  '25cc21f9-861d-4ff7-a3d0-10805d8f2f73', -- Mara
  'friend',
  'accepted',
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, related_user_id, relationship_type) 
DO UPDATE SET 
  status = 'accepted',
  updated_at = NOW();

-- Sam Loiterstein -> Ben
INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status, metadata, created_at, updated_at)
VALUES (
  '349bda34-7878-4c10-9f86-ec5888e55571', -- Sam Loiterstein
  'eb79a6b0-f444-4683-ba27-1b461428b7b1', -- Ben
  'friend',
  'accepted',
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, related_user_id, relationship_type) 
DO UPDATE SET 
  status = 'accepted',
  updated_at = NOW();

-- Ben -> Tej Patel
INSERT INTO public.user_relationships (user_id, related_user_id, relationship_type, status, metadata, created_at, updated_at)
VALUES (
  'eb79a6b0-f444-4683-ba27-1b461428b7b1', -- Ben
  '690d27ae-d803-4ff5-a381-162f8863dd9b', -- Tej Patel
  'friend',
  'accepted',
  '{}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (user_id, related_user_id, relationship_type) 
DO UPDATE SET 
  status = 'accepted',
  updated_at = NOW();

COMMIT;
