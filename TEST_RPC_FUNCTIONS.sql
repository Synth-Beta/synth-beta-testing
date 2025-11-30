-- Test the RPC functions directly
-- Replace 'YOUR_USER_ID_HERE' with an actual user ID from your database

-- Test get_user_chats
SELECT * FROM public.get_user_chats('YOUR_USER_ID_HERE'::uuid);

-- Test get_first_degree_connections  
SELECT * FROM public.get_first_degree_connections('YOUR_USER_ID_HERE'::uuid);

-- Test get_second_degree_connections
SELECT * FROM public.get_second_degree_connections('YOUR_USER_ID_HERE'::uuid);

