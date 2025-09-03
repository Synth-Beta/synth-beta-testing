export interface DBEvent {
  id: string;
  title: string;
  venue: string;
  datetime: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventInterest {
  id: string;
  user_id: string;
  event_id: string;
  created_at: string;
}

export interface UserSwipe {
  id: string;
  swiper_user_id: string;
  swiped_user_id: string;
  event_id: string;
  is_interested: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  event_id: string;
  created_at: string;
}

export interface Chat {
  id: string;
  match_id: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}