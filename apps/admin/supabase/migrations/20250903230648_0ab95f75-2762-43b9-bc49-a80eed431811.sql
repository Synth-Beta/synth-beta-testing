-- Create events table derived from concerts
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  venue TEXT NOT NULL,
  datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(title, venue)
);

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create event interests table (users interested in events)
CREATE TABLE public.event_interests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- Create user swipes table (tracking swipe actions)
CREATE TABLE public.user_swipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  swiper_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  swiped_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  is_interested BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(swiper_user_id, swiped_user_id, event_id)
);

-- Create matches table (when both users swipe right)
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user1_id, user2_id, event_id)
);

-- Create chats table
CREATE TABLE public.chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Events policies (public read, admin write)
CREATE POLICY "Events are viewable by everyone" 
ON public.events 
FOR SELECT 
USING (true);

-- Profiles policies
CREATE POLICY "Profiles are viewable by everyone" 
ON public.profiles 
FOR SELECT 
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Event interests policies
CREATE POLICY "Users can view event interests" 
ON public.event_interests 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create their own event interests" 
ON public.event_interests 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own event interests" 
ON public.event_interests 
FOR DELETE 
USING (auth.uid() = user_id);

-- User swipes policies
CREATE POLICY "Users can view swipes for events they're interested in" 
ON public.user_swipes 
FOR SELECT 
USING (
  auth.uid() = swiper_user_id OR 
  EXISTS (
    SELECT 1 FROM public.event_interests 
    WHERE user_id = auth.uid() AND event_id = user_swipes.event_id
  )
);

CREATE POLICY "Users can create their own swipes" 
ON public.user_swipes 
FOR INSERT 
WITH CHECK (auth.uid() = swiper_user_id);

-- Matches policies
CREATE POLICY "Users can view their own matches" 
ON public.matches 
FOR SELECT 
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Chats policies
CREATE POLICY "Users can view chats they're part of" 
ON public.chats 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.matches 
    WHERE matches.id = chats.match_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);

-- Messages policies
CREATE POLICY "Users can view messages in their chats" 
ON public.messages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.chats 
    JOIN public.matches ON matches.id = chats.match_id
    WHERE chats.id = messages.chat_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);

CREATE POLICY "Users can send messages in their chats" 
ON public.messages 
FOR INSERT 
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.chats 
    JOIN public.matches ON matches.id = chats.match_id
    WHERE chats.id = messages.chat_id 
    AND (matches.user1_id = auth.uid() OR matches.user2_id = auth.uid())
  )
);

-- Function to automatically create profiles when users sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, bio)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    'Music lover looking to connect at events!'
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to automatically create matches when both users swipe right
CREATE OR REPLACE FUNCTION public.check_for_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  match_exists BOOLEAN;
  new_match_id UUID;
BEGIN
  -- Only proceed if this is a positive swipe
  IF NEW.is_interested = true THEN
    -- Check if the other user has also swiped right
    SELECT EXISTS (
      SELECT 1 FROM public.user_swipes 
      WHERE swiper_user_id = NEW.swiped_user_id 
      AND swiped_user_id = NEW.swiper_user_id 
      AND event_id = NEW.event_id 
      AND is_interested = true
    ) INTO match_exists;
    
    IF match_exists THEN
      -- Create a match (ensure consistent ordering of user IDs)
      INSERT INTO public.matches (user1_id, user2_id, event_id)
      VALUES (
        LEAST(NEW.swiper_user_id, NEW.swiped_user_id),
        GREATEST(NEW.swiper_user_id, NEW.swiped_user_id),
        NEW.event_id
      )
      ON CONFLICT (user1_id, user2_id, event_id) DO NOTHING
      RETURNING id INTO new_match_id;
      
      -- Create a chat for the match if a new match was created
      IF new_match_id IS NOT NULL THEN
        INSERT INTO public.chats (match_id)
        VALUES (new_match_id);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to check for matches on swipe
CREATE TRIGGER on_user_swipe_created
  AFTER INSERT ON public.user_swipes
  FOR EACH ROW EXECUTE FUNCTION public.check_for_match();

-- Function to populate events from concerts
CREATE OR REPLACE FUNCTION public.populate_events_from_concerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  concert_row RECORD;
  event_date TIMESTAMP WITH TIME ZONE;
BEGIN
  FOR concert_row IN SELECT DISTINCT venue, artist FROM public.concerts LOOP
    -- Generate a random future date within the next 3 months
    event_date := NOW() + (RANDOM() * INTERVAL '90 days');
    
    INSERT INTO public.events (title, venue, datetime, description)
    VALUES (
      concert_row.artist,
      concert_row.venue,
      event_date,
      concert_row.artist || ' live at ' || concert_row.venue || '. Don''t miss this amazing performance!'
    )
    ON CONFLICT (title, venue) DO NOTHING;
  END LOOP;
END;
$$;

-- Populate events from existing concerts data
SELECT public.populate_events_from_concerts();

-- Create update triggers for timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chats_updated_at
  BEFORE UPDATE ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();