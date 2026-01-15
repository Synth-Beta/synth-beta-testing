/**
 * Mock Services for Demo Mode
 * 
 * These services return demo data immediately without making any API calls.
 * Used only in demo mode to provide fully populated pages.
 */

import { 
  DEMO_USER, 
  DEMO_EVENTS, 
  DEMO_REVIEWS, 
  DEMO_CHATS, 
  DEMO_MESSAGES,
  DEMO_SEARCH_RESULTS,
  DEMO_INTERESTED_EVENTS,
  DEMO_PASSPORT,
  DEMO_FRIENDS,
} from '../data/mockData';

// Mock delay to simulate network (but instant for demo)
const mockDelay = (ms: number = 0) => new Promise(resolve => setTimeout(resolve, ms));

export const MockEventService = {
  async getEvents() {
    await mockDelay(0);
    return { data: DEMO_EVENTS, error: null };
  },
  async getEventById(id: string) {
    await mockDelay(0);
    const event = DEMO_EVENTS.find(e => e.id === id);
    return { data: event || null, error: event ? null : { message: 'Event not found' } };
  },
  async getInterestedEvents(userId: string) {
    await mockDelay(0);
    return { data: DEMO_INTERESTED_EVENTS, error: null };
  },
};

export const MockReviewService = {
  async getUserReviews(userId: string) {
    await mockDelay(0);
    return { data: DEMO_REVIEWS.filter(r => r.user_id === userId), error: null };
  },
  async getPublicReviews() {
    await mockDelay(0);
    return { data: DEMO_REVIEWS.filter(r => r.is_public), error: null };
  },
  async getReviewById(id: string) {
    await mockDelay(0);
    const review = DEMO_REVIEWS.find(r => r.id === id);
    return { data: review || null, error: review ? null : { message: 'Review not found' } };
  },
};

export const MockChatService = {
  async getUserChats(userId: string) {
    await mockDelay(0);
    return { data: DEMO_CHATS, error: null };
  },
  async getChatMessages(chatId: string) {
    await mockDelay(0);
    const messages = DEMO_MESSAGES[chatId as keyof typeof DEMO_MESSAGES] || [];
    return { data: messages, error: null };
  },
  async getChatById(chatId: string) {
    await mockDelay(0);
    const chat = DEMO_CHATS.find(c => c.id === chatId);
    return { data: chat || null, error: chat ? null : { message: 'Chat not found' } };
  },
};

export const MockSearchService = {
  async search(query: string) {
    await mockDelay(0);
    // Always return the same demo results regardless of query
    return {
      data: {
        users: DEMO_SEARCH_RESULTS.users,
        artists: DEMO_SEARCH_RESULTS.artists,
        events: DEMO_SEARCH_RESULTS.events,
        venues: DEMO_SEARCH_RESULTS.venues,
      },
      error: null,
    };
  },
  async searchArtists(query: string) {
    await mockDelay(0);
    return { data: DEMO_SEARCH_RESULTS.artists, error: null };
  },
  async searchVenues(query: string) {
    await mockDelay(0);
    return { data: DEMO_SEARCH_RESULTS.venues, error: null };
  },
  async searchEvents(query: string) {
    await mockDelay(0);
    return { data: DEMO_SEARCH_RESULTS.events, error: null };
  },
  async searchUsers(query: string) {
    await mockDelay(0);
    return { data: DEMO_SEARCH_RESULTS.users, error: null };
  },
};

export const MockUserService = {
  async getUserProfile(userId: string) {
    await mockDelay(0);
    if (userId === DEMO_USER.id) {
      return { data: DEMO_USER, error: null };
    }
    return { data: null, error: { message: 'User not found' } };
  },
  async getUserFriends(userId: string) {
    await mockDelay(0);
    return { data: DEMO_FRIENDS, error: null };
  },
};

export const MockPassportService = {
  async getPassportData(userId: string) {
    await mockDelay(0);
    return { data: DEMO_PASSPORT, error: null };
  },
};

export const MockFeedService = {
  async getFeedItems(userId: string) {
    await mockDelay(0);
    // Return a mix of events and reviews
    const feedItems = [
      ...DEMO_EVENTS.slice(0, 5).map(event => ({
        id: `feed-event-${event.id}`,
        type: 'event' as const,
        event,
        created_at: event.event_date,
      })),
      ...DEMO_REVIEWS.slice(0, 5).map(review => ({
        id: `feed-review-${review.id}`,
        type: 'review' as const,
        review,
        event: DEMO_EVENTS.find(e => e.id === review.event_id),
        user: DEMO_USER,
        created_at: review.created_at,
      })),
    ];
    return { data: feedItems, error: null };
  },
};
