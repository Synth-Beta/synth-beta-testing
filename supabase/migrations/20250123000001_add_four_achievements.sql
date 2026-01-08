-- ============================================
-- ADD FOUR NEW ACHIEVEMENTS
-- Festival Attendance, Artist Devotee, Venue Regular, Go with Friends!
-- ============================================

-- Festival Attendance: Attend 1/3/5 festivals
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'festival_attendance',
  'Festival Attendance',
  'Experience the magic of music festivals',
  'Attend 1 festival',
  1,
  'Attend 3 festivals',
  3,
  'Attend 5 festivals',
  5,
  'milestones',
  11
) ON CONFLICT (achievement_key) DO NOTHING;

-- Artist Devotee: See the same artist 3/5/10 times
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'artist_devotee',
  'Artist Devotee',
  'Show your dedication to your favorite artists',
  'See the same artist 3 times',
  3,
  'See the same artist 5 times',
  5,
  'See the same artist 10 times',
  10,
  'loyalty',
  12
) ON CONFLICT (achievement_key) DO NOTHING;

-- Venue Regular: Attend 5/10/20 shows at the same venue
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'venue_regular',
  'Venue Regular',
  'Become a familiar face at your favorite venues',
  'Attend 5 shows at the same venue',
  5,
  'Attend 10 shows at the same venue',
  10,
  'Attend 20 shows at the same venue',
  20,
  'loyalty',
  13
) ON CONFLICT (achievement_key) DO NOTHING;

-- Go with Friends!: Attend 2/5/10 shows with friends
INSERT INTO public.achievements (
  achievement_key, name, description,
  bronze_requirement, bronze_goal,
  silver_requirement, silver_goal,
  gold_requirement, gold_goal,
  category, sort_order
) VALUES (
  'go_with_friends',
  'Go with Friends!',
  'Share the music experience with your crew',
  'Attend 2 shows with friends',
  2,
  'Attend 5 shows with friends',
  5,
  'Attend 10 shows with friends',
  10,
  'social',
  14
) ON CONFLICT (achievement_key) DO NOTHING;




