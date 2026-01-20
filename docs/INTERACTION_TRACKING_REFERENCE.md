# Interaction Tracking Reference

Complete documentation of all user interactions tracked in the application.

## Overview

This document lists every interaction that is logged to the `interactions` table for analytics and marketing purposes. Each interaction includes:
- **Event Type**: `view`, `click`, `like`, `share`, `interest`, `search`, `review`, `comment`, `navigate`, `form_submit`, etc.
- **Entity Type**: `event`, `artist`, `venue`, `review`, `user`, `profile`, `search`, `view`, `form`, etc.
- **Entity UUID**: UUID reference to the actual entity (required for events, artists, venues, users, reviews)
- **Metadata**: Additional context for marketing analytics (names, dates, locations, genres, etc.)

---

## Table of Contents

1. [Page Views](#page-views)
2. [Event Interactions](#event-interactions)
3. [Artist Interactions](#artist-interactions)
4. [Venue Interactions](#venue-interactions)
5. [Feed Interactions](#feed-interactions)
6. [Review Interactions](#review-interactions)
7. [Social Interactions](#social-interactions)
8. [Search Interactions](#search-interactions)
9. [Navigation Interactions](#navigation-interactions)
10. [Form Interactions](#form-interactions)
11. [Profile Interactions](#profile-interactions)
12. [Chat/Message Interactions](#chatmessage-interactions)
13. [Onboarding Interactions](#onboarding-interactions)
14. [Analytics Interactions](#analytics-interactions)

---

## Page Views

### Home Feed View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `home_feed`
- **Metadata**: `{ source: 'home' }`

### Discover/Search View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `discover`
- **Metadata**: `{ source: 'discover' }`

### Profile View (Own)
- **Event Type**: `view`
- **Entity Type**: `profile`
- **Entity UUID**: `{user_id}` (current user)
- **Metadata**: `{ is_own_profile: true }`

### Profile View (Other User)
- **Event Type**: `view`
- **Entity Type**: `profile`
- **Entity UUID**: `{profile_user_id}`
- **Metadata**: `{ is_own_profile: false, profile_user_id: '...' }`

### Event Details Modal
- **Event Type**: `view`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "venue_name": "...",
    "event_date": "...",
    "venue_city": "...",
    "venue_state": "...",
    "genres": [...],
    "view_duration": 1234
  }
  ```

### Artist Events Page
- **Event Type**: `view`
- **Entity Type**: `artist`
- **Entity UUID**: `{artist.id}`
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "genres": [...]
  }
  ```

### Venue Events Page
- **Event Type**: `view`
- **Entity Type**: `venue`
- **Entity UUID**: `{venue.id}`
- **Metadata**: 
  ```json
  {
    "venue_name": "...",
    "venue_city": "...",
    "venue_state": "..."
  }
  ```

### Chat/Messages View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `chat`
- **Metadata**: `{ source: 'messages' }`

### Notifications View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `notifications`
- **Metadata**: `{ source: 'notifications' }`

### Settings View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `settings`
- **Metadata**: `{ source: 'settings' }`

### Analytics Dashboards
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `analytics_{type}` (creator/business/admin)
- **Metadata**: `{ dashboard_type: 'creator'|'business'|'admin' }`

### Onboarding Steps
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `onboarding_{step_name}`
- **Metadata**: `{ step: '...', step_number: 1 }`

---

## Event Interactions

### Event Card Click
- **Event Type**: `click`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "venue_name": "...",
    "event_date": "...",
    "venue_city": "...",
    "venue_state": "...",
    "genres": [...],
    "source": "feed|discover|search|profile",
    "position": 0
  }
  ```

### Event Interest Toggle (Interested)
- **Event Type**: `interest`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "isInterested": true,
    "artist_name": "...",
    "venue_name": "...",
    "event_date": "..."
  }
  ```

### Event Interest Toggle (Not Interested)
- **Event Type**: `interest`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "isInterested": false,
    "action": "remove",
    "artist_name": "..."
  }
  ```

### Event Attendance Mark (Attended)
- **Event Type**: `attendance`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "attended": true,
    "artist_name": "...",
    "venue_name": "...",
    "event_date": "..."
  }
  ```

### Ticket Link Click
- **Event Type**: `click`
- **Entity Type**: `ticket_link`
- **Entity ID**: `{event.id}`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "event_id": "...",
    "provider_url": "...",
    "price_range": "...",
    "artist_name": "...",
    "venue_name": "..."
  }
  ```

### Event Share
- **Event Type**: `share`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "platform": "native|twitter|facebook|...",
    "artist_name": "...",
    "venue_name": "...",
    "event_date": "..."
  }
  ```

### Event Details Tab Clicks
- **Photos Tab**: `click` on `view` entity, `entity_id: 'event_photos_tab'`, metadata includes `event_id`
- **Groups Tab**: `click` on `view` entity, `entity_id: 'event_groups_tab'`, metadata includes `event_id`
- **Find Buddies Tab**: `click` on `view` entity, `entity_id: 'event_buddies_tab'`, metadata includes `event_id`
- **Reviews Tab**: `click` on `view` entity, `entity_id: 'event_reviews_tab'`, metadata includes `event_id`
- **Setlist Tab**: `click` on `view` entity, `entity_id: 'event_setlist_tab'`, metadata includes `event_id`

### Event Filter/Sort
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `event_filter_{filter_type}`
- **Metadata**: 
  ```json
  {
    "filter_type": "genre|date|location|price",
    "filter_value": "...",
    "source": "feed|discover|search"
  }
  ```

### Event Impression (Viewport Visibility)
- **Event Type**: `view`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "source": "feed",
    "impression": true,
    "position": 0,
    "viewport_time": 1234567890
  }
  ```

---

## Artist Interactions

### Artist Card Click
- **Event Type**: `click`
- **Entity Type**: `artist`
- **Entity UUID**: `{artist.id}`
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "genres": [...],
    "source": "feed|discover|search|profile"
  }
  ```

### Artist View (Card Display)
- **Event Type**: `view`
- **Entity Type**: `artist`
- **Entity UUID**: `{artist.id}`
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "genres": [...],
    "source": "feed|discover|search"
  }
  ```

### Artist Follow
- **Event Type**: `follow`
- **Entity Type**: `artist`
- **Entity UUID**: `{artist.id}`
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "action": "follow"
  }
  ```

### Artist Unfollow
- **Event Type**: `unfollow`
- **Entity Type**: `artist`
- **Entity UUID**: `{artist.id}`
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "action": "unfollow"
  }
  ```

### Artist Events View All Click
- **Event Type**: `click`
- **Entity Type**: `artist`
- **Entity UUID**: `{artist.id}`
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "action": "view_all_events"
  }
  ```

### Artist Search Result Click
- **Event Type**: `click`
- **Entity Type**: `artist`
- **Entity UUID**: `{artist.id}` (if available)
- **Metadata**: 
  ```json
  {
    "artist_name": "...",
    "source": "artist_search_box"
  }
  ```

---

## Venue Interactions

### Venue Card Click
- **Event Type**: `click`
- **Entity Type**: `venue`
- **Entity UUID**: `{venue.id}`
- **Metadata**: 
  ```json
  {
    "venue_name": "...",
    "venue_city": "...",
    "venue_state": "...",
    "source": "feed|discover|search|profile"
  }
  ```

### Venue View (Card Display)
- **Event Type**: `view`
- **Entity Type**: `venue`
- **Entity UUID**: `{venue.id}`
- **Metadata**: 
  ```json
  {
    "venue_name": "...",
    "venue_city": "...",
    "venue_state": "..."
  }
  ```

### Venue Follow
- **Event Type**: `follow`
- **Entity Type**: `venue`
- **Entity UUID**: `{venue.id}`
- **Metadata**: 
  ```json
  {
    "venue_name": "...",
    "venue_city": "...",
    "action": "follow"
  }
  ```

### Venue Unfollow
- **Event Type**: `unfollow`
- **Entity Type**: `venue`
- **Entity UUID**: `{venue.id}`
- **Metadata**: 
  ```json
  {
    "venue_name": "...",
    "action": "unfollow"
  }
  ```

### Venue Events View All Click
- **Event Type**: `click`
- **Entity Type**: `venue`
- **Entity UUID**: `{venue.id}`
- **Metadata**: 
  ```json
  {
    "venue_name": "...",
    "action": "view_all_events"
  }
  ```

### Venue Search Result Click
- **Event Type**: `click`
- **Entity Type**: `venue`
- **Entity UUID**: `{venue.id}` (if available)
- **Metadata**: 
  ```json
  {
    "venue_name": "...",
    "venue_city": "...",
    "venue_state": "...",
    "source": "venue_search_box"
  }
  ```

---

## Feed Interactions

### Feed Event Impression (Intersection Observer)
- **Event Type**: `view`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "source": "feed",
    "impression": true,
    "tracked_via": "intersection_observer",
    "viewport_time": 1234567890,
    "position": 0
  }
  ```

### Feed Section View
- **Recommended Events**: `view` on `view`, `entity_id: 'feed_section_recommended'`
- **Network Events**: `view` on `view`, `entity_id: 'feed_section_network'`
- **Trending Events**: `view` on `view`, `entity_id: 'feed_section_trending'`
- **Reviews**: `view` on `view`, `entity_id: 'feed_section_reviews'`

### Feed Load More / Pagination
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `feed_load_more`
- **Metadata**: 
  ```json
  {
    "section": "recommended|network|trending|reviews",
    "page": 2
  }
  ```

### Feed Filter Apply
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `feed_filter_apply`
- **Metadata**: 
  ```json
  {
    "filters": {
      "genres": [...],
      "cities": [...],
      "date_range": {...},
      "radius_miles": 50
    }
  }
  ```

### Network Event Click (Friend Activity)
- **Event Type**: `click`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "source": "network_feed",
    "friend_name": "...",
    "artist_name": "..."
  }
  ```

---

## Review Interactions

### Review Card Click
- **Event Type**: `click`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}`
- **Metadata**: 
  ```json
  {
    "rating": 5,
    "event_id": "...",
    "artist_name": "...",
    "venue_name": "..."
  }
  ```

### Review View (Card Display)
- **Event Type**: `view`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}`
- **Metadata**: 
  ```json
  {
    "rating": 5,
    "source": "feed|profile|event"
  }
  ```

### Review Like
- **Event Type**: `like`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}`
- **Metadata**: 
  ```json
  {
    "isLiked": true,
    "rating": 5
  }
  ```

### Review Unlike
- **Event Type**: `like`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}`
- **Metadata**: 
  ```json
  {
    "isLiked": false
  }
  ```

### Review Comment
- **Event Type**: `comment`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}`
- **Metadata**: 
  ```json
  {
    "commentLength": 50
  }
  ```

### Review Share
- **Event Type**: `share`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}`
- **Metadata**: 
  ```json
  {
    "platform": "native|twitter|facebook|...",
    "rating": 5
  }
  ```

### Review Form Submit
- **Event Type**: `review`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}` (if created)
- **Entity ID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "rating": 5,
    "has_text": true,
    "has_photos": false,
    "artist_name": "...",
    "venue_name": "...",
    "event_date": "..."
  }
  ```

### Review Form Step Navigation
- **Event Type**: `click`
- **Entity Type**: `form`
- **Entity ID**: `review_form_step_{step_name}`
- **Metadata**: 
  ```json
  {
    "step": "event_details|rating|content|privacy",
    "step_number": 1
  }
  ```

### Post-Submit Ranking Interaction
- **Event Type**: `click`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}`
- **Metadata**: 
  ```json
  {
    "action": "post_submit_ranking",
    "ranking_position": 1
  }
  ```

### Review Delete
- **Event Type**: `click`
- **Entity Type**: `review`
- **Entity UUID**: `{review.id}`
- **Metadata**: 
  ```json
  {
    "action": "delete",
    "source": "event_review_form"
  }
  ```

---

## Social Interactions

### Profile View (Other User)
- **Event Type**: `view`
- **Entity Type**: `profile`
- **Entity UUID**: `{profile_user_id}`
- **Metadata**: 
  ```json
  {
    "is_own_profile": false,
    "profile_user_id": "...",
    "source": "feed|search|chat|match"
  }
  ```

### Friend Request Send
- **Event Type**: `click`
- **Entity Type**: `user`
- **Entity UUID**: `{friend_user_id}`
- **Metadata**: 
  ```json
  {
    "action": "send_friend_request"
  }
  ```

### Friend Request Accept
- **Event Type**: `click`
- **Entity Type**: `user`
- **Entity UUID**: `{friend_user_id}`
- **Metadata**: 
  ```json
  {
    "action": "accept_friend_request"
  }
  ```

### Friend Unfriend
- **Event Type**: `click`
- **Entity Type**: `user`
- **Entity UUID**: `{friend_user_id}`
- **Metadata**: 
  ```json
  {
    "action": "unfriend"
  }
  ```

### Chat/Message Open
- **Event Type**: `click`
- **Entity Type**: `user`
- **Entity UUID**: `{chat_user_id}`
- **Metadata**: 
  ```json
  {
    "action": "open_chat",
    "source": "matches|friends|profile"
  }
  ```

### Message Send
- **Event Type**: `click`
- **Entity Type**: `user`
- **Entity UUID**: `{recipient_user_id}`
- **Metadata**: 
  ```json
  {
    "action": "send_message",
    "message_length": 50
  }
  ```

### Match Swipe (Like/Pass)
- **Event Type**: `swipe`
- **Entity Type**: `user`
- **Entity UUID**: `{swiped_user_id}`
- **Metadata**: 
  ```json
  {
    "direction": "like|pass",
    "event_id": "...",
    "artist_name": "..."
  }
  ```

### Group Create
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `create_event_group`
- **Metadata**: 
  ```json
  {
    "event_id": "...",
    "artist_name": "..."
  }
  ```

### Group Join
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `join_event_group`
- **Metadata**: 
  ```json
  {
    "group_id": "...",
    "event_id": "..."
  }
  ```

### Photo Upload
- **Event Type**: `click`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "action": "upload_photo",
    "artist_name": "..."
  }
  ```

### Photo View
- **Event Type**: `view`
- **Entity Type**: `event`
- **Entity UUID**: `{event.id}`
- **Metadata**: 
  ```json
  {
    "action": "view_photo",
    "photo_count": 5
  }
  ```

---

## Search Interactions

### Search Query
- **Event Type**: `search`
- **Entity Type**: `search`
- **Entity ID**: `search_query`
- **Metadata**: 
  ```json
  {
    "query": "...",
    "search_type": "events|artists|venues|users|global",
    "result_count": 15
  }
  ```

### Search Result Click
- **Event Type**: `click`
- **Entity Type**: `{event|artist|venue|user}`
- **Entity UUID**: `{entity.id}`
- **Metadata**: 
  ```json
  {
    "query": "...",
    "result_type": "event|artist|venue|user",
    "position": 0,
    "source": "search"
  }
  ```

### Search Filter Apply
- **Event Type**: `click`
- **Entity Type**: `search`
- **Entity ID**: `search_filter`
- **Metadata**: 
  ```json
  {
    "filter_type": "genre|date|location|type",
    "filter_value": "..."
  }
  ```

### Search Tab Switch
- **Event Type**: `click`
- **Entity Type**: `search`
- **Entity ID**: `search_tab_{tab_name}`
- **Metadata**: 
  ```json
  {
    "tab": "events|artists|venues|users"
  }
  ```

---

## Navigation Interactions

### Bottom Navigation Click
- **Feed Tab**: `navigate` on `view`, `entity_id: 'feed'`
- **Search/Discover Tab**: `navigate` on `view`, `entity_id: 'discover'`
- **Profile Tab**: `navigate` on `view`, `entity_id: 'profile'`
- **Events Tab** (Business/Creator): `navigate` on `view`, `entity_id: 'events'`
- **Analytics Tab** (Business/Creator/Admin): `navigate` on `view`, `entity_id: 'analytics'`

### Side Menu Click
- **Activity**: `click` on `view`, `entity_id: 'side_menu_activity'`
- **Profile & Preferences**: `click` on `view`, `entity_id: 'side_menu_profile'`
- **Event Timeline**: `click` on `view`, `entity_id: 'side_menu_timeline'`
- **Help & Support**: `click` on `view`, `entity_id: 'side_menu_help'`
- **About**: `click` on `view`, `entity_id: 'side_menu_about'`
- **Settings**: `click` on `view`, `entity_id: 'side_menu_settings'`

### Tab Switch Within View
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `tab_{tab_name}`
- **Metadata**: 
  ```json
  {
    "view": "profile|event_details|discover",
    "tab": "events|matches|interested|reviews|stats"
  }
  ```

### Modal Open
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `modal_{modal_name}`
- **Metadata**: 
  ```json
  {
    "modal": "event_details|review|share|settings",
    "trigger": "button|card|link"
  }
  ```

### Modal Close
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `modal_close_{modal_name}`
- **Metadata**: 
  ```json
  {
    "modal": "event_details|review|share",
    "close_method": "button|x|backdrop"
  }
  ```

### Back Button
- **Event Type**: `navigate`
- **Entity Type**: `view`
- **Entity ID**: `back`
- **Metadata**: 
  ```json
  {
    "from_view": "event_details|profile|search",
    "to_view": "feed|discover"
  }
  ```

---

## Form Interactions

### Form Field Focus
- **Event Type**: `click`
- **Entity Type**: `form`
- **Entity ID**: `form_field_{field_name}`
- **Metadata**: 
  ```json
  {
    "form_type": "review|profile|settings",
    "field": "rating|comment|name|email"
  }
  ```

### Form Submit (Success)
- **Event Type**: `form_submit`
- **Entity Type**: `{review|profile|settings}`
- **Entity UUID**: `{created_entity_id}` (if applicable)
- **Metadata**: 
  ```json
  {
    "success": true,
    "form_type": "review|profile_update|settings",
    "fields_filled": ["rating", "comment"]
  }
  ```

### Form Submit (Failure)
- **Event Type**: `form_submit`
- **Entity Type**: `{review|profile|settings}`
- **Metadata**: 
  ```json
  {
    "success": false,
    "form_type": "review|profile_update",
    "error": "..."
  }
  ```

### Form Abandonment
- **Event Type**: `click`
- **Entity Type**: `form`
- **Entity ID**: `form_abandon`
- **Metadata**: 
  ```json
  {
    "form_type": "review|profile",
    "steps_completed": 2,
    "total_steps": 4
  }
  ```

---

## Profile Interactions

### Profile Tab Switch
- **Events Tab**: `click` on `profile`, `entity_id: 'profile_tab_events'`
- **Matches Tab**: `click` on `profile`, `entity_id: 'profile_tab_matches'`
- **Interested Tab**: `click` on `profile`, `entity_id: 'profile_tab_interested'`
- **Reviews Tab**: `click` on `profile`, `entity_id: 'profile_tab_reviews'`
- **Stats Tab**: `click` on `profile`, `entity_id: 'profile_tab_stats'`

### Profile Edit
- **Event Type**: `profile_update`
- **Entity Type**: `profile`
- **Entity UUID**: `{user_id}`
- **Metadata**: 
  ```json
  {
    "field": "name|bio|avatar|preferences",
    "updated": true
  }
  ```

### Followers View
- **Event Type**: `view`
- **Entity Type**: `profile`
- **Entity UUID**: `{profile_user_id}`
- **Metadata**: 
  ```json
  {
    "section": "followers"
  }
  ```

### Following View
- **Event Type**: `view`
- **Entity Type**: `profile`
- **Entity UUID**: `{profile_user_id}`
- **Metadata**: 
  ```json
  {
    "section": "following"
  }
  ```

### Profile Share
- **Event Type**: `share`
- **Entity Type**: `profile`
- **Entity UUID**: `{profile_user_id}`
- **Metadata**: 
  ```json
  {
    "platform": "native|twitter|facebook|...",
    "is_own_profile": false
  }
  ```

---

## Chat/Message Interactions

### Chat View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `chat`
- **Metadata**: 
  ```json
  {
    "chat_count": 5
  }
  ```

### Chat List Item Click
- **Event Type**: `click`
- **Entity Type**: `user`
- **Entity UUID**: `{chat_user_id}`
- **Metadata**: 
  ```json
  {
    "action": "open_chat",
    "unread_count": 2
  }
  ```

### Message Send
- **Event Type**: `click`
- **Entity Type**: `user`
- **Entity UUID**: `{recipient_user_id}`
- **Metadata**: 
  ```json
  {
    "action": "send_message",
    "message_type": "text|image|event|review",
    "message_length": 50
  }
  ```

### Match View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `matches`
- **Metadata**: 
  ```json
  {
    "match_count": 3
  }
  ```

### Match Chat Open
- **Event Type**: `click`
- **Entity Type**: `user`
- **Entity UUID**: `{match_user_id}`
- **Metadata**: 
  ```json
  {
    "action": "open_match_chat",
    "event_id": "...",
    "artist_name": "..."
  }
  ```

---

## Onboarding Interactions

### Onboarding Step View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `onboarding_{step_name}`
- **Metadata**: 
  ```json
  {
    "step": "account_type|profile_setup|music_tags",
    "step_number": 1,
    "total_steps": 4
  }
  ```

### Onboarding Step Complete
- **Event Type**: `click`
- **Entity Type**: `form`
- **Entity ID**: `onboarding_step_complete`
- **Metadata**: 
  ```json
  {
    "step": "account_type|profile_setup|music_tags",
    "step_number": 1,
    "completed": true
  }
  ```

### Onboarding Skip
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `onboarding_skip`
- **Metadata**: 
  ```json
  {
    "step": "...",
    "step_number": 2
  }
  ```

### Onboarding Complete
- **Event Type**: `form_submit`
- **Entity Type**: `form`
- **Entity ID**: `onboarding_complete`
- **Metadata**: 
  ```json
  {
    "completed": true,
    "total_steps": 4
  }
  ```

---

## Analytics Interactions

### Analytics Dashboard View
- **Event Type**: `view`
- **Entity Type**: `view`
- **Entity ID**: `analytics_{dashboard_type}`
- **Metadata**: 
  ```json
  {
    "dashboard_type": "creator|business|admin",
    "user_type": "creator|business|admin"
  }
  ```

### Analytics Tab Switch
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `analytics_tab_{tab_name}`
- **Metadata**: 
  ```json
  {
    "tab": "overview|users|revenue|content|claims|moderation",
    "dashboard_type": "creator|business|admin"
  }
  ```

### Analytics Date Range Change
- **Event Type**: `click`
- **Entity Type**: `view`
- **Entity ID**: `analytics_date_range`
- **Metadata**: 
  ```json
  {
    "range": "7d|30d|90d|1y|all",
    "dashboard_type": "creator|business|admin"
  }
  ```

---

## Event Type Reference

### Standard Event Types
- `view` - Component/page viewed
- `click` - Element clicked
- `like` - Content liked/unliked
- `share` - Content shared
- `interest` - Event interest toggled
- `search` - Search performed
- `review` - Review created
- `comment` - Comment added
- `navigate` - Navigation occurred
- `form_submit` - Form submitted
- `profile_update` - Profile updated
- `swipe` - Swipe action (matches)
- `follow` - Follow action
- `unfollow` - Unfollow action
- `attendance` - Attendance marked

### Entity Type Reference

#### UUID-Required Entities
- `event` - Event interactions
- `artist` - Artist interactions
- `venue` - Venue interactions
- `user` - User interactions
- `profile` - Profile interactions
- `review` - Review interactions

#### Non-UUID Entities
- `search` - Search interactions
- `view` - View/page interactions
- `form` - Form interactions
- `ticket_link` - Ticket link clicks
- `song` - Song interactions
- `album` - Album interactions
- `playlist` - Playlist interactions
- `genre` - Genre interactions
- `scene` - Scene interactions

---

## Metadata Fields Reference

### Common Metadata Fields
- `source` - Where interaction originated (feed, discover, search, profile, etc.)
- `position` - Position in list/carousel
- `viewport_time` - Timestamp when item entered viewport
- `view_duration` - How long user viewed item (milliseconds)
- `action` - Specific action taken
- `platform` - Platform for shares (native, twitter, facebook, etc.)

### Event Metadata
- `artist_name` - Artist name
- `venue_name` - Venue name
- `event_date` - Event date (ISO string)
- `venue_city` - Venue city
- `venue_state` - Venue state
- `genres` - Array of genres
- `price_range` - Price range string

### Artist Metadata
- `artist_name` - Artist name
- `genres` - Array of genres

### Venue Metadata
- `venue_name` - Venue name
- `venue_city` - Venue city
- `venue_state` - Venue state

### Review Metadata
- `rating` - Rating (1-5)
- `has_text` - Boolean if review has text
- `has_photos` - Boolean if review has photos
- `commentLength` - Length of comment

---

## Implementation Notes

1. **UUID Resolution**: For events, artists, and venues, always use `entity_uuid` field when the UUID is available. Use `entity_id` as fallback.

2. **Batch Processing**: Interactions are batched and sent every 2 seconds or when batch size reaches 10 events.

3. **Error Handling**: All tracking calls are wrapped in try-catch to prevent failures from breaking the UI.

4. **View Tracking**: Use `useEffect` hooks that fire on component mount for view tracking.

5. **Click Tracking**: Wrap existing click handlers or add onClick props that call tracking functions.

6. **Intersection Observer**: Use `useIntersectionTracking` hook for automatic impression tracking of list items.

7. **Session Tracking**: All interactions automatically include `session_id` for session analysis.

---

## Query Examples

### Find all event views in last 7 days
```sql
SELECT * FROM interactions
WHERE entity_type = 'event' 
  AND event_type = 'view'
  AND occurred_at >= NOW() - INTERVAL '7 days'
ORDER BY occurred_at DESC;
```

### Count clicks per artist
```sql
SELECT 
  entity_uuid,
  COUNT(*) as click_count
FROM interactions
WHERE entity_type = 'artist'
  AND event_type = 'click'
GROUP BY entity_uuid
ORDER BY click_count DESC;
```

### Find most viewed events with metadata
```sql
SELECT 
  i.entity_uuid,
  i.metadata->>'artist_name' as artist_name,
  COUNT(*) as view_count
FROM interactions i
WHERE i.entity_type = 'event'
  AND i.event_type = 'view'
  AND i.occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY i.entity_uuid, i.metadata->>'artist_name'
ORDER BY view_count DESC
LIMIT 10;
```

---

---

## Implementation Status

### ✅ Completed
- **Tracking Service**: Enabled database inserts in `interactionTrackingService.ts`
- **Utility Functions**: Created `entityUuidResolver.ts` for UUID extraction and metadata generation
- **View Tracking Hook**: Created `useViewTracking.ts` hook for automatic view tracking
- **Updated Convenience Functions**: All `trackInteraction` functions now support `entityUuid` parameter
- **Major Page Views**: Added view tracking to:
  - `HomeFeed` - home feed view
  - `DiscoverView` - discover/search view
  - `ProfileView` - profile pages (own and others)
- **Event Details Modal**: Updated existing tracking to use entityUuid

### 🚧 In Progress / To Implement
The following components need tracking added (see reference above for complete list):

**Event Interactions:**
- Event card clicks (EventCard, SwiftUIEventCard, CompactEventCard)
- Event interest toggles
- Event attendance marking
- Event share actions
- Event tab clicks in EventDetailsModal
- Event filter/sort interactions
- Feed event impressions (using intersection observer)

**Artist Interactions:**
- Artist card clicks and views
- Artist follow/unfollow actions
- Artist events page views
- Artist search result clicks

**Venue Interactions:**
- Venue card clicks and views
- Venue follow/unfollow actions
- Venue events page views
- Venue search result clicks

**Review Interactions:**
- Review card clicks and views
- Review likes/comments/shares
- Review form interactions
- Post-submit ranking interactions

**Social Interactions:**
- Friend connection actions
- Chat/message interactions
- Match swipe interactions
- Group creation/joining
- Photo uploads/views

**Navigation Interactions:**
- Bottom navigation clicks
- Side menu clicks
- Tab switches
- Modal open/close events

**Search Interactions:**
- Search queries
- Search result clicks
- Search filter usage

**Form Interactions:**
- Form field interactions
- Form submissions (success/failure)
- Form abandonment

**Additional Pages:**
- NotificationsPage
- SettingsModal
- OnboardingFlow
- Analytics dashboards
- ArtistEvents page
- VenueEvents page
- UnifiedChatView

### 📝 Implementation Pattern

To add tracking to any component:

1. **For View Tracking:**
```typescript
import { useViewTracking } from '@/hooks/useViewTracking';

// In component:
useViewTracking('view', 'entity_id', { metadata }, entityUuid);
```

2. **For Click Tracking:**
```typescript
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';

// In click handler:
trackInteraction.click(
  'event',
  event.id,
  getEventMetadata(event),
  getEventUuid(event) // entityUuid
);
```

3. **For Entity-Specific Tracking:**
- Events: Use `getEventUuid(event)` and `getEventMetadata(event)`
- Artists: Use `getArtistUuid(artist)` and `getArtistMetadata(artist)`
- Venues: Use `getVenueUuid(venue)` and `getVenueMetadata(venue)`

---

*Last Updated: January 2025*
*Version: 1.0*
*Implementation Status: Foundation Complete - Comprehensive Tracking In Progress*