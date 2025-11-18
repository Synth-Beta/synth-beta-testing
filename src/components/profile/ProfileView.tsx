import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, Edit, Heart, MapPin, Calendar, Instagram, ExternalLink, Settings, Music, Plus, ThumbsUp, ThumbsDown, Minus, Star, Grid, BarChart3, Clock, Award, Trophy, Flag, Ban, MoreVertical } from 'lucide-react';
import { FollowersModal } from './FollowersModal';
import { PostsGrid } from './PostsGrid';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { JamBaseService } from '@/services/jambaseService';
import { EventReviewModal } from '../reviews/EventReviewModal';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProfileReviewCard } from '../reviews/ProfileReviewCard';
import type { Artist } from '@/types/concertSearch';
import { ReviewService } from '@/services/reviewService';
import { UserEventService } from '@/services/userEventService';
import { DraftReviewService } from '@/services/draftReviewService';
import { getEventStatus, isEventPast, getPastEvents, getUpcomingEvents } from '@/utils/eventStatusUtils';
import { BelliStyleReviewCard } from '../reviews/BelliStyleReviewCard';
import { detectStreamingServiceType } from '../streaming/UnifiedStreamingStats';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';
import { EventDetailsModal } from '../events/EventDetailsModal';
import { MusicTasteCard } from './MusicTasteCard';
import { HolisticStatsCard } from './HolisticStatsCard';
import { UserAnalyticsService, Achievement } from '@/services/userAnalyticsService';
import { AchievementCard } from '@/components/analytics/shared/AchievementCard';
import { SynthSLogo } from '@/components/SynthSLogo';
import { SkeletonProfileCard } from '@/components/skeleton/SkeletonProfileCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ArtistFollowService } from '@/services/artistFollowService';
import { useNavigate } from 'react-router-dom';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { BlockUserModal } from '@/components/moderation/BlockUserModal';
import { FriendActivityFeed } from '@/components/social/FriendActivityFeed';
import { WorkingConnectionBadge } from '../WorkingConnectionBadge';
import { VerificationBadge } from '@/components/verification/VerificationBadge';
import type { AccountType } from '@/utils/verificationUtils';
import { PageActions } from '@/components/PageActions';

interface ProfileViewProps {
  currentUserId: string;
  profileUserId?: string; // Optional: if provided, show this user's profile instead of current user
  onBack: () => void;
  onEdit: () => void;
  onSettings: () => void;
  onSignOut?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onNavigateToNotifications?: () => void;
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  music_streaming_profile?: string | null; // Optional until migration is applied
  created_at: string;
  updated_at: string;
  last_active_at?: string;
  is_public_profile?: boolean;
  gender?: string | null;
  birthday?: string | null;
  account_type?: 'user' | 'creator' | 'business' | 'admin';
  verified?: boolean;
  verification_level?: string | null;
}

// Use JamBaseEvent type directly instead of custom UserEvent interface
import type { JamBaseEvent } from '@/services/jambaseService';

interface ConcertReview {
  id: string;
  user_id: string;
  event_id: string;
  rating: number | 'good' | 'okay' | 'bad';
  review_text: string | null;
  is_public: boolean;
  created_at: string;
  artist_performance_rating?: number;
  production_rating?: number;
  venue_rating?: number;
  location_rating?: number;
  value_rating?: number;
  artist_performance_feedback?: string;
  production_feedback?: string;
  venue_feedback?: string;
  location_feedback?: string;
  value_feedback?: string;
  artist_performance_recommendation?: string;
  production_recommendation?: string;
  venue_recommendation?: string;
  location_recommendation?: string;
  value_recommendation?: string;
  ticket_price_paid?: number;
  photos?: string[];
  videos?: string[];
  mood_tags?: string[];
  genre_tags?: string[];
  reaction_emoji?: string | null;
  category_average?: number;
  event: {
    event_name: string;
    location: string;
    event_date: string;
    event_time: string;
  };
  jambase_events?: {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    venue_city?: string | null;
    venue_state?: string | null;
    setlist?: any;
    setlist_song_count?: number | null;
    setlist_fm_url?: string | null;
  };
}

export const ProfileView = ({ currentUserId, profileUserId, onBack, onEdit, onSettings, onSignOut, onNavigateToProfile, onNavigateToChat, onNavigateToNotifications }: ProfileViewProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEvents, setUserEvents] = useState<JamBaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [showAddReview, setShowAddReview] = useState(false);
  const [reviews, setReviews] = useState<ConcertReview[]>([]);
  const [reviewsCount, setReviewsCount] = useState<number>(0);
  const [reviewModalEvent, setReviewModalEvent] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('my-events');
  const [rankingMode, setRankingMode] = useState<boolean | 'unreviewed'>(false);
  const [attendedEvents, setAttendedEvents] = useState<any[]>([]);
  const [attendedEventsLoading, setAttendedEventsLoading] = useState(false);
  const [draftReviews, setDraftReviews] = useState<any[]>([]);
  const [draftReviewsLoading, setDraftReviewsLoading] = useState(false);
  
  // 🏆 Achievements state
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [canViewInterested, setCanViewInterested] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [viewReviewOpen, setViewReviewOpen] = useState(false); // Only declare once
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [followersModalType, setFollowersModalType] = useState<'followers' | 'following' | 'friends'>('friends');
  const [friendStatus, setFriendStatus] = useState<'none' | 'friends' | 'pending_sent' | 'pending_received'>('none');
  const [followedArtistsCount, setFollowedArtistsCount] = useState(0);
  const { toast } = useToast();
  const { user, sessionExpired } = useAuth();
  const navigate = useNavigate();

  // Determine which user's profile to show
  const targetUserId = profileUserId || currentUserId;
  const isViewingOwnProfile = !profileUserId || profileUserId === currentUserId;

  useEffect(() => {
    console.log('🔍 ProfileView: useEffect triggered with:', {
      targetUserId,
      sessionExpired,
      user: user?.id,
      hasUser: !!user
    });
    
    // Don't fetch data if session is expired
    if (sessionExpired) {
      console.log('🔍 ProfileView: Session expired, skipping data fetch');
      setLoading(false);
      return;
    }
    
    // Don't fetch if user is not available yet
    if (!user) {
      console.log('🔍 ProfileView: User not available yet, waiting...');
      return;
    }
    
    // Debounce data fetching to prevent excessive calls
    const fetchTimeout = setTimeout(() => {
      console.log('🔍 ProfileView: User is available, fetching data...');
      setLoading(true);
      console.log('🔍 ProfileView: Loading state set to TRUE');
      
      // Ensure we wait for both minimum time AND data fetching
      const fetchData = async () => {
        try {
          console.log('🔍 ProfileView: fetchData function called');
          console.log('🔍 ProfileView: About to fetch profile...');
          await fetchProfile();
          console.log('🔍 ProfileView: About to fetch user events...');
          await fetchUserEvents();
          console.log('🔍 ProfileView: About to fetch reviews...');
          await fetchReviews();
          console.log('🔍 ProfileView: About to fetch reviews count...');
          await fetchReviewsCount();
          console.log('🔍 ProfileView: About to fetch friends...');
          await fetchFriends();
          console.log('🔍 ProfileView: About to fetch attended events...');
          await fetchAttendedEvents();
          console.log('🔍 ProfileView: About to fetch draft reviews...');
          await fetchDraftReviews();
          console.log('🔍 ProfileView: About to fetch followed artists count...');
          await fetchFollowedArtistsCount();
          console.log('🔍 ProfileView: About to fetch achievements...');
          await loadAchievements();
          if (!isViewingOwnProfile) {
            await checkFriendStatus();
          }
          console.log('🔍 ProfileView: All data fetched successfully');
        } catch (error) {
          console.error('🔍 ProfileView: Error fetching data:', error);
        }
      };

      const minTime = new Promise(resolve => setTimeout(resolve, 800));
      
      Promise.all([fetchData(), minTime]).finally(() => {
        setLoading(false);
        console.log('🔍 ProfileView: Loading state set to FALSE');
      });
    }, 300); // Debounce by 300ms
    
    return () => clearTimeout(fetchTimeout);
  }, [targetUserId, sessionExpired, user]);

  useEffect(() => {
    // Check for hash in URL to determine active tab
    const hash = window.location.hash.substring(1);
    if (hash === 'spotify') {
      setActiveTab('spotify');
    }
  }, []);

  useEffect(() => {
    // Show by default; optionally restrict later based on friends
    if (!user) { setCanViewInterested(true); return; }
    if (user.id === currentUserId) { setCanViewInterested(true); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from('friends')
          .select('id')
          .or(`and(user1_id.eq.${user.id},user2_id.eq.${currentUserId}),and(user1_id.eq.${currentUserId},user2_id.eq.${user.id}))`)
          .limit(1);
        setCanViewInterested(Array.isArray(data) ? data.length > 0 : false);
      } catch {
        setCanViewInterested(true);
      }
    })();
  }, [user, currentUserId]);

  const fetchProfile = async () => {
    try {
      console.log('🔍 ProfileView: Starting profile fetch...');
      console.log('🔍 ProfileView: sessionExpired:', sessionExpired);
      console.log('🔍 ProfileView: user:', user);
      console.log('🔍 ProfileView: currentUserId:', currentUserId);
      
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('❌ Session expired or no user, skipping profile fetch');
        setLoading(false);
        return;
      }

      console.log('✅ Fetching profile for user:', targetUserId);
      
      // First try to get the profile
      console.log('ProfileView: Fetching profile for user:', targetUserId);

      const fetchProfileRecord = async (column: 'user_id' | 'id') => {
        console.log(`ProfileView: Attempting profile lookup by ${column}`);
        return await supabase
          .from('users')
          .select('*')
          .eq(column, targetUserId)
          .maybeSingle();
      };

      let profileData: UserProfile | null = null;

      const { data, error } = await fetchProfileRecord('user_id');
      console.log('ProfileView: Profile query result (user_id):', { data, error });

      if (error && error.code !== 'PGRST116') {
        console.error('Profile query error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        
        if (error.message?.includes('invalid') || error.message?.includes('API key') || error.message?.includes('JWT') || error.message?.includes('expired')) {
          console.error('Session error in ProfileView:', error);
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please sign in again.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      } else {
        profileData = data as UserProfile | null;
      }

      if (!profileData) {
        const { data: fallbackData, error: fallbackError } = await fetchProfileRecord('id');
        console.log('ProfileView: Profile query result (id):', { fallbackData, fallbackError });

        if (fallbackError && fallbackError.code !== 'PGRST116') {
          throw fallbackError;
        }

        profileData = fallbackData as UserProfile | null;
      }

      if (profileData) {
        console.log('Profile found:', profileData);
        setProfile(profileData);
        return;
      }

      console.log('No profile found for user:', currentUserId);
      console.log('Creating default profile for user:', currentUserId);
      
      // Get user metadata from auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const userName = authUser?.user_metadata?.name || authUser?.email?.split('@')[0] || 'New User';
      
      console.log('Creating profile with name:', userName);
      
      const { data: newProfile, error: insertError } = await supabase
        .from('users')
        .insert({
          user_id: currentUserId,
          name: userName,
          bio: 'Music lover looking to connect at events!',
          instagram_handle: null,
          music_streaming_profile: null
        })
        .select()
        .single();
      
      console.log('Profile creation result:', { newProfile, insertError });
      
      if (insertError) {
        console.error('Error creating profile:', insertError);
        console.error('Insert error details:', insertError.details);
        console.error('Insert error hint:', insertError.hint);
        
        // If we can't create a profile, show a fallback
        setProfile({
          id: 'temp',
          user_id: currentUserId,
          name: userName,
          avatar_url: null,
          bio: 'Music lover looking to connect at events!',
          instagram_handle: null,
          music_streaming_profile: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else if (newProfile) {
        console.log('Profile created successfully:', newProfile);
        setProfile(newProfile as UserProfile);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      // Show a fallback profile instead of error
        setProfile({
          id: 'temp',
          user_id: currentUserId,
          name: 'New User',
          avatar_url: null,
          bio: null,
          instagram_handle: null,
          music_streaming_profile: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserEvents = async () => {
    try {
      console.log('🔍 ProfileView: fetchUserEvents called for user:', targetUserId);
      
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping user events fetch');
        return;
      }

      console.log('🔍 ProfileView: Calling JamBaseService.getUserEvents...');
      const data = await JamBaseService.getUserEvents(targetUserId);
      console.log('🔍 ProfileView: JamBaseService.getUserEvents returned:', data?.length, 'events');
      
      // Get events that user has attended to exclude them from interested events
      const { data: attendanceData } = await (supabase as any)
        .from('reviews')
        .select('event_id')
        .eq('user_id', targetUserId)
        .eq('was_there', true);
      
      const attendedEventIds = new Set(attendanceData?.map((a: any) => a.event_id) || []);
      
      const events = data?.map(item => {
        const jambaseEvent = item?.jambase_event as any; // Type assertion to include setlist fields
        
        // Debug all events to see what we're getting
        console.log('ProfileView: Processing event in getUserEvents:', {
          title: jambaseEvent?.title,
          artist_name: jambaseEvent?.artist_name,
          venue_name: jambaseEvent?.venue_name
        });
        
        // Debug specific event if it's the Anotha event
        if (jambaseEvent?.title?.includes('Anotha')) {
          console.log('ProfileView: Found Anotha event in getUserEvents:', {
            item,
            jambaseEvent,
            title: jambaseEvent?.title,
            artist_name: jambaseEvent?.artist_name,
            venue_name: jambaseEvent?.venue_name,
            venue_city: jambaseEvent?.venue_city,
            venue_state: jambaseEvent?.venue_state
          });
        }
        
        const processedEvent = {
        // Ensure all required fields are present with proper defaults
          id: jambaseEvent?.id ?? '',
          jambase_event_id: jambaseEvent?.jambase_event_id ?? jambaseEvent?.id ?? '',
          title: jambaseEvent?.title ?? '',
          artist_name: jambaseEvent?.artist_name ?? '',
          artist_id: jambaseEvent?.artist_id ?? null,
          venue_name: jambaseEvent?.venue_name ?? '',
          venue_id: jambaseEvent?.venue_id ?? null,
          venue_address: jambaseEvent?.venue_address ?? null,
          venue_city: jambaseEvent?.venue_city ?? null,
          venue_state: jambaseEvent?.venue_state ?? null,
          venue_zip: jambaseEvent?.venue_zip ?? null,
          event_date: jambaseEvent?.event_date ?? '',
          doors_time: jambaseEvent?.doors_time ?? null,
          description: jambaseEvent?.description ?? null,
          genres: Array.isArray(jambaseEvent?.genres) ? jambaseEvent.genres : [],
          latitude: jambaseEvent?.latitude ?? null,
          longitude: jambaseEvent?.longitude ?? null,
          ticket_available: Boolean(jambaseEvent?.ticket_available),
          price_range: jambaseEvent?.price_range ?? null,
          ticket_urls: jambaseEvent?.ticket_urls || [],
        setlist: null,
        setlist_enriched: null,
        setlist_song_count: null,
        setlist_fm_id: null,
        setlist_fm_url: null,
        setlist_source: null,
        setlist_last_updated: null,
          tour_name: jambaseEvent?.tour_name ?? null,
        created_at: item.created_at,
        updated_at: item.created_at
        };
        
        // Debug specific event if it's the Anotha event
        if (jambaseEvent?.title?.includes('Anotha')) {
          console.log('ProfileView: Processed Anotha event:', {
            processedEvent,
            title: processedEvent.title,
            artist_name: processedEvent.artist_name,
            venue_name: processedEvent.venue_name,
            venue_city: processedEvent.venue_city,
            venue_state: processedEvent.venue_state
          });
        }
        
        return processedEvent;
      }) || [];

      // Filter out events that user has attended (moved to My Events)
      const filteredEvents = events.filter(event => !attendedEventIds.has(event.id));

      console.log('ProfileView: Final filtered events:', filteredEvents.map(ev => ({
        title: ev.title,
        artist_name: ev.artist_name,
        venue_name: ev.venue_name
      })));

      // Ensure filteredEvents conforms to the expected type
      setUserEvents(filteredEvents as any); // TODO: Ensure type safety

      console.log('🔍 ProfileView: fetchUserEvents completed successfully');
    } catch (error) {
      console.error('❌ ProfileView: Error fetching user events:', error);
      setUserEvents([] as any); // TODO: Ensure type safety
    } finally {
      setLoading(false);
    }
  };

  // Filter events based on showPastEvents toggle using new utilities
  const filteredUserEvents = showPastEvents ? getPastEvents(userEvents) : getUpcomingEvents(userEvents);

  const fetchReviews = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping reviews fetch');
        return;
      }

      console.log('🔍 ProfileView: Fetching reviews for user:', targetUserId);
      console.log('🔍 ProfileView: isViewingOwnProfile:', isViewingOwnProfile);
      console.log('🔍 ProfileView: Session user:', user?.id);
      
      // Fetch user's reviews from the database
      let result;
      try {
        result = await ReviewService.getUserReviewHistory(targetUserId);
      console.log('🔍 ProfileView: Raw review data:', result);
      console.log('🔍 ProfileView: Number of reviews in result:', result.reviews.length);
      if (result.reviews.length > 0) {
        console.log('🔍 ProfileView: First review event data:', {
          reviewId: result.reviews[0].review.id,
          eventId: result.reviews[0].review.event_id,
          event: result.reviews[0].event,
          eventTitle: result.reviews[0].event?.title
        });
      }
      } catch (serviceError) {
        console.error('❌ ProfileView: Error calling ReviewService.getUserReviewHistory:', serviceError);
        setReviews([]);
        return;
      }
      
      // Transform to match the expected interface for display (include rank_order and category ratings for display)
      // Filter reviews based on privacy: show all reviews for own profile, only public reviews for others
      // Also exclude ATTENDANCE_ONLY reviews that don't have was_there=true
      const transformedReviews = result.reviews
        .filter((item: any) => {
          // Show all reviews for own profile, only public reviews for others
          if (!isViewingOwnProfile && !item.review.is_public) {
            return false;
          }
          // Exclude ATTENDANCE_ONLY reviews unless was_there is true
          if (item.review.review_text === 'ATTENDANCE_ONLY' && !item.review.was_there) {
            return false;
          }
          return true;
        })
        .map((item: any) => ({
          id: item.review.id,
          user_id: item.review.user_id,
          event_id: item.review.event_id,
          rating: item.review.rating,
          rank_order: (item.review as any).rank_order,
          artist_performance_rating: (item.review as any).artist_performance_rating,
          production_rating: (item.review as any).production_rating,
          venue_rating: (item.review as any).venue_rating,
          location_rating: (item.review as any).location_rating,
          value_rating: (item.review as any).value_rating,
          review_text: item.review.review_text,
          reaction_emoji: item.review.reaction_emoji,
          artist_performance_feedback: (item.review as any).artist_performance_feedback,
          production_feedback: (item.review as any).production_feedback,
          venue_feedback: (item.review as any).venue_feedback,
          location_feedback: (item.review as any).location_feedback,
          value_feedback: (item.review as any).value_feedback,
          artist_performance_recommendation: (item.review as any).artist_performance_recommendation,
          production_recommendation: (item.review as any).production_recommendation,
          venue_recommendation: (item.review as any).venue_recommendation,
          location_recommendation: (item.review as any).location_recommendation,
          value_recommendation: (item.review as any).value_recommendation,
          photos: item.review.photos || [],
          videos: item.review.videos || [],
          setlist: item.review.setlist,
          is_public: item.review.is_public,
          was_there: item.review.was_there,
          created_at: item.review.created_at,
          ticket_price_paid: item.review.ticket_price_paid,
          category_average: calculateCategoryAverage(item.review),
          // Add jambase_events data for the modal to access (keep full event object)
          jambase_events: item.event || null,
          event: {
            event_name: item.event?.title 
              || (item.event?.artist_name && item.event?.venue_name 
                ? `${item.event.artist_name} at ${item.event.venue_name}`
                : item.event?.event_name || 'Concert Review'),
            location: item.event?.venue_name || 'Unknown Venue',
            event_date: item.event?.event_date || item.review.created_at,
            event_time: item.event?.event_time || item.event?.doors_time || 'TBD',
            // Keep full event data for PostsGrid
            _fullEvent: item.event || null
          }
        }));
      
      console.log('🔍 ProfileView: Transformed reviews:', transformedReviews);
      console.log('🔍 ProfileView: Number of transformed reviews:', transformedReviews.length);
      
      // Debug: Check if any reviews have setlist data
      const reviewsWithSetlist = transformedReviews.filter((review: any) => review.setlist);
      console.log('🎵 ProfileView: Reviews with setlist:', reviewsWithSetlist.length, reviewsWithSetlist);
      
      // Debug: Check reviews that will be shown in PostsGrid
      const reviewsForPosts = transformedReviews.filter(review => {
        if ((review as any).review_text === 'ATTENDANCE_ONLY' && !(review as any).was_there) {
          return false;
        }
        return true;
      });
      console.log('🔍 ProfileView: Reviews for PostsGrid:', reviewsForPosts.length);
      console.log('🔍 ProfileView: Reviews for PostsGrid (first 3):', reviewsForPosts.slice(0, 3).map(r => ({
        id: r.id,
        event_name: r.event?.event_name,
        review_text: (r as any).review_text,
        was_there: (r as any).was_there
      })));
      
      setReviews(transformedReviews);
    } catch (error) {
      console.error('❌ ProfileView: Error fetching reviews:', error);
      setReviews([]);
    }
  };

  const fetchReviewsCount = async () => {
    try {
      console.log('🔍 ProfileView: Fetching reviews count for user:', targetUserId);
      
      // Query reviews table directly to get accurate count
      // Count all non-draft reviews that the user has either:
      // 1. Attended (was_there = true), OR
      // 2. Written a review (review_text is not null and not 'ATTENDANCE_ONLY')
      let query = supabase
        .from('reviews')
        .select('id, was_there, review_text, is_public', { count: 'exact' })
        .eq('user_id', targetUserId)
        .eq('is_draft', false);

      // If viewing someone else's profile, only count public reviews
      if (!isViewingOwnProfile) {
        query = query.eq('is_public', true);
      }

      const { data, count, error } = await query;

      if (error) {
        console.error('❌ ProfileView: Error fetching reviews count:', error);
        setReviewsCount(0);
        return;
      }

      // Filter in JavaScript to match the logic used in fetchReviews
      const filteredData = (data || []).filter((item: any) => {
        // Include if was_there is true
        if (item.was_there === true) {
          return true;
        }
        // Include if review_text exists and is not ATTENDANCE_ONLY
        if (item.review_text && item.review_text !== 'ATTENDANCE_ONLY') {
          return true;
        }
        return false;
      });

      const actualCount = filteredData.length;

      console.log('🔍 ProfileView: Reviews count (raw):', count);
      console.log('🔍 ProfileView: Reviews count (filtered):', actualCount);
      setReviewsCount(actualCount);
    } catch (error) {
      console.error('❌ ProfileView: Error fetching reviews count:', error);
      setReviewsCount(0);
    }
  };

  const calculateCategoryAverage = (review: any) => {
    const values = [
      review.artist_performance_rating,
      review.production_rating,
      review.venue_rating,
      review.location_rating,
      review.value_rating
    ].filter((value: any): value is number => typeof value === 'number' && value > 0);

    if (values.length > 0) {
      return values.reduce((sum: number, value: number) => sum + value, 0) / values.length;
    }

    if (typeof review.rating === 'number') {
      return review.rating;
    }

    if (review.rating === 'good') return 5;
    if (review.rating === 'okay') return 3;
    if (review.rating === 'bad') return 1;
    return 0;
  };

  // Compute display rating (0.5 increments) preferring category ratings when present
  const getDisplayRating = (r: any) => {
    const avg = calculateCategoryAverage(r);
    return Math.round(avg * 2) / 2;
  };

  const fetchFriends = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping friends fetch');
        return;
      }

      // Get friendship records from user_relationships table
      const { data: friendships, error: friendsError } = await supabase
        .from('user_relationships')
        .select('id, user_id, related_user_id, created_at')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${targetUserId},related_user_id.eq.${targetUserId}`)
        .order('created_at', { ascending: false });

      if (friendsError) {
        console.warn('Warning: Could not fetch friends:', friendsError);
        setFriends([]);
        return;
      }

      if (!friendships || friendships.length === 0) {
        setFriends([]);
        return;
      }

      // Get all the user IDs we need to fetch (the other user in each relationship)
      const userIds = friendships.map(f => 
        f.user_id === targetUserId ? f.related_user_id : f.user_id
      );

      // Fetch the profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('id, name, avatar_url, bio, user_id, created_at, last_active_at, is_public_profile')
        .in('user_id', userIds);

      if (profilesError) {
        console.warn('Warning: Could not fetch friend profiles:', profilesError);
        setFriends([]);
        return;
      }

      // Transform the data to get the other user's profile
      const friendsList = friendships.map(friendship => {
        const otherUserId = friendship.user_id === targetUserId ? friendship.related_user_id : friendship.user_id;
        const profile = profiles?.find(p => p.user_id === otherUserId);
        
        return {
          id: profile?.id || otherUserId,
          user_id: otherUserId, // Add user_id for chat functionality
          name: profile?.name || 'Unknown User',
          username: (profile?.name || 'unknown').toLowerCase().replace(/\s+/g, ''),
          avatar_url: profile?.avatar_url || null,
          bio: profile?.bio || null,
          friendship_id: friendship.id,
          created_at: friendship.created_at
        };
      });

      setFriends(friendsList);
    } catch (error) {
      console.warn('Warning: Error fetching friends:', error);
      setFriends([]);
    }
  };

  const fetchFollowedArtistsCount = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping followed artists count fetch');
        return;
      }

      console.log('🔍 ProfileView: Fetching total follows count (artists + venues) for user:', targetUserId);
      
      // Get both artist and venue follows count
      const artistFollowsCount = await UserAnalyticsService.getArtistFollowsCount(targetUserId);
      const venueFollowsCount = await UserAnalyticsService.getVenueFollowsCount(targetUserId);
      
      console.log('🔍 ProfileView: Artist follows count:', artistFollowsCount);
      console.log('🔍 ProfileView: Venue follows count:', venueFollowsCount);
      
      // Also get detailed data for debugging
      const followedArtists = await ArtistFollowService.getUserFollowedArtists(targetUserId);
      console.log('🔍 ProfileView: Artist names:', followedArtists.map(a => a.artist_name));
      
      // 🎯 FIX: Count artists + venues following
      const totalFollowsCount = artistFollowsCount + venueFollowsCount;
      console.log(`🔍 ProfileView: Total follows (artists + venues): ${totalFollowsCount} (${artistFollowsCount} artists + ${venueFollowsCount} venues)`);
      
      setFollowedArtistsCount(totalFollowsCount);
      
      console.log('🔍 ProfileView: Final total follows count set to:', totalFollowsCount);
    } catch (error) {
      console.error('Error fetching followed artists count:', error);
      setFollowedArtistsCount(0);
    }
  };

  const fetchAttendedEvents = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping attended events fetch');
        return;
      }

      console.log('🔍 ProfileView: Fetching attended events for user:', targetUserId);
      setAttendedEventsLoading(true);
      
      // Fetch events where user has reviews (implies attendance)
      // Also include events where was_there = true (attendance without review)
    const { data, error } = await (supabase as any)
      .from('reviews')
      .select(`
        id, 
        event_id, 
        rating, 
        review_text, 
        was_there, 
        is_public, 
        created_at, 
        updated_at,
        events (
          id,
          title,
          artist_name,
          venue_name,
          event_date,
          venue_city,
          venue_state,
          setlist,
          setlist_enriched,
          setlist_song_count,
          setlist_fm_id,
          setlist_fm_url,
          setlist_source,
          setlist_last_updated
        )
      `)
      .eq('user_id', targetUserId)
      .eq('is_draft', false)
      .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching attended events:', error);
        setAttendedEvents([]);
        return;
      }

      console.log('🔍 ProfileView: Attended events data (raw):', data);
      console.log('🔍 ProfileView: Total attended events fetched (raw):', data?.length);
      
      // Filter reviews: include those where user either attended or wrote a review
      const filteredData = (data || []).filter((item: any) => {
        // Include if was_there is true
        if (item.was_there === true) {
          return true;
        }
        // Include if review_text exists and is not ATTENDANCE_ONLY
        if (item.review_text && item.review_text !== 'ATTENDANCE_ONLY') {
          return true;
        }
        return false;
      });
      
      console.log('🔍 ProfileView: Attended events data (filtered):', filteredData);
      console.log('🔍 ProfileView: Total attended events fetched (filtered):', filteredData?.length);
      
      // Log breakdown of event types
      const withReviews = filteredData?.filter(item => item.review_text && item.review_text !== 'ATTENDANCE_ONLY').length || 0;
      const attendanceOnly = filteredData?.filter(item => item.review_text === 'ATTENDANCE_ONLY').length || 0;
      const noReview = filteredData?.filter(item => !item.review_text).length || 0;
      
      console.log('📊 Event breakdown:');
      console.log(`   With reviews: ${withReviews}`);
      console.log(`   Attendance only: ${attendanceOnly}`);
      console.log(`   No review: ${noReview}`);
      console.log(`   Total: ${filteredData?.length}`);
      
      // Event data is already joined from the query above
      if (filteredData && filteredData.length > 0) {
        // Map the joined event data to the expected structure
        const combinedData = filteredData.map(attendance => ({
          ...attendance,
          jambase_events: attendance.events || null
        }));
        
        setAttendedEvents(combinedData);
      } else {
        setAttendedEvents([]);
      }
    } catch (error) {
      console.error('Error fetching attended events:', error);
      setAttendedEvents([]);
    } finally {
      setAttendedEventsLoading(false);
    }
  };

  const fetchDraftReviews = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping draft reviews fetch');
        return;
      }

      console.log('🔍 ProfileView: Fetching draft reviews for user:', targetUserId);
      setDraftReviewsLoading(true);
      
      // Only fetch drafts for the current user (not other users' profiles)
      if (!isViewingOwnProfile) {
        setDraftReviews([]);
        return;
      }

      // Fetch draft reviews using the DraftReviewService
      const drafts = await DraftReviewService.getUserDrafts(targetUserId);
      
      console.log('🔍 ProfileView: Draft reviews data:', drafts);
      console.log('🔍 ProfileView: Total draft reviews fetched:', drafts?.length);
      
      setDraftReviews(drafts || []);
    } catch (error) {
      console.error('Error fetching draft reviews:', error);
      setDraftReviews([]);
    } finally {
      setDraftReviewsLoading(false);
    }
  };

  // 🏆 Load user achievements
  const loadAchievements = async () => {
    try {
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping achievements fetch');
        return;
      }

      console.log('🔍 ProfileView: Fetching achievements for user:', targetUserId);
      setAchievementsLoading(true);
      
      const achievementsData = await UserAnalyticsService.getUserAchievements(targetUserId);
      
      console.log('🔍 ProfileView: Achievements data:', achievementsData);
      console.log('🔍 ProfileView: Total achievements:', achievementsData?.length);
      console.log('🔍 ProfileView: Unlocked achievements:', achievementsData?.filter(a => a.unlocked).length);
      
      setAchievements(achievementsData || []);
    } catch (error) {
      console.error('Error fetching achievements:', error);
      setAchievements([]);
    } finally {
      setAchievementsLoading(false);
    }
  };

  const checkFriendStatus = async () => {
    try {
      if (sessionExpired || !user || isViewingOwnProfile) {
        return;
      }

      // Check if users are already friends
      const { data: friendship, error: friendsError } = await supabase
        .from('friends')
        .select('id')
        .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${targetUserId}),and(user1_id.eq.${targetUserId},user2_id.eq.${currentUserId})`)
        .limit(1);

      if (friendsError) {
        console.warn('Warning: Could not check friendship status:', friendsError);
        return;
      }

      if (friendship && friendship.length > 0) {
        setFriendStatus('friends');
        return;
      }

      // Check for pending friend requests
      const { data: sentRequest, error: sentError } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', currentUserId)
        .eq('receiver_id', targetUserId)
        .eq('status', 'pending')
        .limit(1);

      if (sentError) {
        console.warn('Warning: Could not check sent friend requests:', sentError);
        return;
      }

      if (sentRequest && sentRequest.length > 0) {
        setFriendStatus('pending_sent');
        return;
      }

      const { data: receivedRequest, error: receivedError } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', targetUserId)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .limit(1);

      if (receivedError) {
        console.warn('Warning: Could not check received friend requests:', receivedError);
        return;
      }

      if (receivedRequest && receivedRequest.length > 0) {
        setFriendStatus('pending_received');
        return;
      }

      setFriendStatus('none');
    } catch (error) {
      console.warn('Warning: Error checking friend status:', error);
      setFriendStatus('none');
    }
  };

  const sendFriendRequest = async () => {
    try {
      if (sessionExpired || !user || isViewingOwnProfile) {
        return;
      }

      console.log('Sending friend request to:', targetUserId);
      
      // Call the database function to create friend request
      const { data, error } = await supabase.rpc('create_friend_request', {
        receiver_user_id: targetUserId
      });

      if (error) {
        console.error('Error creating friend request:', error);
        throw error;
      }

      setFriendStatus('pending_sent');
      
      toast({
        title: "Friend Request Sent! 🎉",
        description: "Your friend request has been sent and they'll be notified.",
      });
    } catch (error: any) {
      console.error('Error sending friend request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const unfriendUser = async (friendUserId: string) => {
    try {
      if (sessionExpired || !user) {
        return;
      }

      // Show confirmation dialog
      const confirmed = window.confirm('Are you sure you want to unfriend this person?');
      if (!confirmed) {
        return;
      }

      console.log('Unfriending user:', friendUserId);
      
      // Call the database function to unfriend the user
      const { error } = await supabase.rpc('unfriend_user', {
        friend_user_id: friendUserId
      });

      if (error) {
        console.error('Error unfriending user:', error);
        throw error;
      }

      // Update local state
      setFriends(prevFriends => prevFriends.filter(friend => friend.user_id !== friendUserId));
      setFriendStatus('none');
      
      toast({
        title: "Friend Removed",
        description: "You are no longer friends with this person.",
      });
    } catch (error: any) {
      console.error('Error unfriending user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to unfriend user. Please try again.",
        variant: "destructive",
      });
      throw error; // Re-throw to let the calling component handle it
    }
  };

  const handleOpenReviewModal = () => {
    // Create a mock event for the review modal
    setReviewModalEvent({
      id: 'new-review',
      event_title: '',
      venue_name: '',
      event_date: new Date().toISOString().split('T')[0],
      artist_name: ''
    });
    setShowAddReview(true);
  };

  const handleReviewSubmitted = (review: any) => {
    // Refresh reviews, attended events, and drafts after submission
    fetchReviews();
    fetchAttendedEvents();
    fetchDraftReviews();
    setShowAddReview(false);
    setReviewModalEvent(null);
    
    toast({
      title: "Review Added",
      description: "Your concert review has been added!",
    });
  };

  const handleEditReview = (review: any) => {
    // Open edit with prefilled data for non-destructive updates
    setReviewModalEvent({
      id: review.event_id,
      title: review.event?.event_name || 'Concert Review',
      venue_name: review.event?.venue_name || review.event?.location || 'Unknown Venue',
      event_date: review.event?.event_date || review.created_at,
      artist_name: review.event?.artist_name || 'Unknown Artist',
      existing_review_id: review.id,
      // pass through existing ratings/texts where the form can read them from context if needed
      existing_review: {
        rating: review.rating,
        review_text: review.review_text,
        artist_performance_rating: review.artist_performance_rating,
        production_rating: review.production_rating,
        venue_rating: review.venue_rating,
        location_rating: review.location_rating,
        value_rating: review.value_rating,
        artist_performance_feedback: review.artist_performance_feedback,
        production_feedback: review.production_feedback,
        venue_feedback: review.venue_feedback,
        location_feedback: review.location_feedback,
        value_feedback: review.value_feedback,
        artist_performance_recommendation: review.artist_performance_recommendation,
        production_recommendation: review.production_recommendation,
        venue_recommendation: review.venue_recommendation,
        location_recommendation: review.location_recommendation,
        value_recommendation: review.value_recommendation,
        ticket_price_paid: review.ticket_price_paid,
        reaction_emoji: review.reaction_emoji,
        is_public: review.is_public,
        review_type: review.review_type,
        event_date: review.event?.event_date || review.created_at,
        artist_name: review.event?.artist_name,
        venue_name: review.event?.venue_name,
        venue_id: review.venue_id
      }
    });
    setShowAddReview(true);
  };

  const handleDeleteReview = async (reviewId: string) => {
    try {
      console.log('🗑️ ProfileView: Deleting review:', { userId: currentUserId, reviewId });
      await ReviewService.deleteEventReview(currentUserId, reviewId);
      console.log('✅ ProfileView: Review deleted successfully');
      fetchReviews(); // Refresh the list
      toast({
        title: "Review Deleted",
        description: "Your review has been deleted.",
      });
    } catch (error) {
      console.error('❌ ProfileView: Error deleting review:', error);
      toast({
        title: "Error",
        description: `Failed to delete review: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  };

  const getRatingText = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return 'Good';
      case 'okay': return 'Okay';
      case 'bad': return 'Bad';
      default: return 'Unknown';
    }
  };

  const getRatingColor = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return 'bg-green-100 text-green-800 border-green-200';
      case 'okay': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'bad': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRatingIcon = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return <ThumbsUp className="w-4 h-4" />;
      case 'okay': return <Minus className="w-4 h-4" />;
      case 'bad': return <ThumbsDown className="w-4 h-4" />;
      default: return null;
    }
  };

  // Session expiration is handled by MainApp, so we don't need to handle it here

  if (loading) {
    return (
      <div className="min-h-screen synth-gradient-card p-4 pb-20">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header skeleton */}
          <div className="flex items-center gap-4 mb-6">
            <SynthSLogo size="md" className="animate-breathe" />
            <div className="h-8 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-24"></div>
          </div>

          {/* Profile skeleton */}
          <SkeletonProfileCard />

          {/* Reviews grid skeleton */}
          <div className="space-y-4">
            <div className="h-6 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-32"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    console.log('❌ ProfileView: No profile data available');
    console.log('❌ ProfileView: Loading state:', loading);
    console.log('❌ ProfileView: Current user ID:', currentUserId);
    console.log('❌ ProfileView: User from auth:', user);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Profile not found</h2>
          <p className="text-muted-foreground mb-4">Unable to load profile data. Please try again.</p>
          <div className="text-xs text-muted-foreground mb-4">
            Debug: User ID: {currentUserId}, Loading: {loading.toString()}
          </div>
          <Button onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  console.log('✅ ProfileView: Rendering profile for:', profile.name);


  // setViewReviewOpen is defined by useState earlier

  return (
    <div className="min-h-screen p-4 pb-48">
      <div className="max-w-2xl mx-auto">

        {/* Enhanced Profile Header */}
        <div className="mb-8 bg-gradient-to-br from-white via-pink-50/30 to-purple-50/20 rounded-2xl p-8 border border-pink-100/50 shadow-sm relative overflow-hidden">
          <div className="absolute top-6 right-6">
            <PageActions
              currentUserId={currentUserId}
              onNavigateToNotifications={onNavigateToNotifications}
              onNavigateToChat={onNavigateToChat}
            />
          </div>

          {/* Main Profile Row */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-6">
            {/* Profile Picture */}
            <div className="relative">
              <Avatar className="w-24 h-24 md:w-28 md:h-28 ring-4 ring-white shadow-lg">
                <AvatarImage 
                  src={profile.avatar_url || undefined} 
                  alt={`${profile.name}'s avatar`}
                  onError={(e) => {
                    console.log('🔍 Avatar image failed to load:', profile.avatar_url);
                    // Hide the image element to show fallback
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                  onLoad={() => {
                    console.log('🔍 Avatar image loaded successfully:', profile.avatar_url);
                  }}
                />
                <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-pink-500 to-purple-600 text-white">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* Online status indicator */}
              {!isViewingOwnProfile && profile.last_active_at && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
              )}
            </div>
              
            {/* Profile Info */}
            <div className="flex-1 min-w-0">
              {/* Name and Status Row */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 truncate">
                    {profile.name}
                  </h1>
                  {profile.verified && profile.account_type && (
                    <VerificationBadge
                      accountType={profile.account_type as AccountType}
                      verified={profile.verified}
                      size="lg"
                    />
                  )}
                  
                  {/* Connection Degree Badge */}
                  {!isViewingOwnProfile && (
                    <WorkingConnectionBadge targetUserId={targetUserId} />
                  )}
                </div>
                
                {/* Status Badges */}
                {!isViewingOwnProfile && profile.last_active_at && (
                  <Badge variant="secondary" className="flex items-center gap-1 text-xs bg-green-100 text-green-700 border-green-200">
                    <Clock className="w-3 h-3" />
                    {UserVisibilityService.formatLastActive(profile.last_active_at)}
                  </Badge>
                )}
              </div>
              
              {/* Stats Row */}
              <div className="flex items-center gap-8 mb-6">
                <button
                  className="text-center hover:scale-105 transition-transform group"
                  onClick={() => { setFollowersModalType('friends'); setShowFollowersModal(true); }}
                >
                  <div className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent group-hover:from-pink-700 group-hover:to-purple-700">
                    {friends.length}
                  </div>
                  <p className="text-sm text-gray-600 font-medium">Friends</p>
                </button>
                
                <div className="text-center">
                  <div className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                    {reviewsCount}
                  </div>
                  <p className="text-sm text-gray-600 font-medium">Reviews</p>
                </div>
                
                <button
                  className="text-center hover:scale-105 transition-transform group"
                  onClick={() => navigate(`/following${!isViewingOwnProfile ? `/${targetUserId}` : ''}`)}
                >
                  <div className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent group-hover:from-pink-700 group-hover:to-purple-700">
                    {followedArtistsCount}
                  </div>
                  <p className="text-sm text-gray-600 font-medium">Following</p>
                </button>
              </div>
              
              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {isViewingOwnProfile ? (
                  <>
                    <Button onClick={onEdit} variant="default" size="sm" className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-md">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Profile
                    </Button>
                    <Button onClick={onSettings} variant="outline" size="sm" className="border-gray-200 hover:border-gray-300">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    {friendStatus === 'none' && (
                      <Button onClick={sendFriendRequest} variant="default" size="sm" className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-md">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Friend
                      </Button>
                    )}
                    {friendStatus === 'pending_sent' && (
                      <Button disabled variant="outline" size="sm" className="border-orange-200 text-orange-600">
                        Friend Request Sent
                      </Button>
                    )}
                    {friendStatus === 'pending_received' && (
                      <Button disabled variant="outline" size="sm" className="border-blue-200 text-blue-600">
                        Respond to Request
                      </Button>
                    )}
                    {friendStatus === 'friends' && (
                      <Button 
                        onClick={() => unfriendUser(targetUserId)} 
                        variant="outline" 
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:border-red-300 border-red-200"
                      >
                        Unfriend
                      </Button>
                    )}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setBlockModalOpen(true)}
                        className="text-gray-500 hover:text-red-600 hover:bg-red-50 p-2"
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReportModalOpen(true)}
                        className="text-gray-500 hover:text-red-600 hover:bg-red-50 p-2"
                      >
                        <Flag className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Bio and Links */}
          <div className="border-t border-pink-100/50 pt-6">
            {profile.bio && (
              <div className="mb-4">
                <p className="text-gray-700 leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {/* Social Media Links and Streaming Stats */}
            <div className="flex flex-wrap gap-3">
              {profile.instagram_handle && (
                <a
                  href={`https://instagram.com/${profile.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-pink-500/10 to-purple-500/10 hover:from-pink-500/20 hover:to-purple-500/20 rounded-lg border border-pink-200/50 text-pink-600 hover:text-pink-700 transition-all duration-200 text-sm font-medium"
                >
                  <Instagram className="w-4 h-4" />
                  <span>@{profile.instagram_handle}</span>
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
              
              {/* Streaming Stats Button - Always show if viewing own profile */}
              {isViewingOwnProfile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🎵 View Streaming Stats button clicked');
                    console.log('🎵 Current location:', window.location.href);
                    console.log('🎵 Navigating to /streaming-stats');
                    // Use absolute URL to ensure navigation works
                    const url = '/streaming-stats';
                    console.log('🎵 Navigating to:', url);
                    window.location.href = url;
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-pink-500/10 to-purple-500/10 hover:from-pink-500/20 hover:to-purple-500/20 rounded-lg border border-pink-200/50 text-pink-600 hover:text-pink-700 transition-all duration-200 text-sm font-medium cursor-pointer hover:shadow-md"
                >
                  <Music className="w-4 h-4" />
                  <span>View Streaming Stats</span>
                </button>
              )}
              
              {/* Show streaming profile link only if viewing someone else's profile */}
              {!isViewingOwnProfile && profile.music_streaming_profile && (() => {
                const serviceType = detectStreamingServiceType(profile.music_streaming_profile);
                const isSpotify = serviceType === 'spotify';
                const isAppleMusic = serviceType === 'apple-music';
                
                let href = profile.music_streaming_profile;
                let displayText = profile.music_streaming_profile;
                let bgClass = 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-200/50';
                let textClass = 'text-blue-600 hover:text-blue-700';
                
                if (isSpotify) {
                  href = profile.music_streaming_profile.startsWith('http') 
                    ? profile.music_streaming_profile 
                    : `https://open.spotify.com/user/${profile.music_streaming_profile}`;
                  displayText = 'Spotify Profile';
                  bgClass = 'bg-green-500/10 hover:bg-green-500/20 border-green-200/50';
                  textClass = 'text-green-600 hover:text-green-700';
                } else if (isAppleMusic) {
                  href = profile.music_streaming_profile.startsWith('http') 
                    ? profile.music_streaming_profile 
                    : profile.music_streaming_profile;
                  displayText = 'Apple Music Profile';
                  bgClass = 'bg-red-500/10 hover:bg-red-500/20 border-red-200/50';
                  textClass = 'text-red-600 hover:text-red-700';
                }
                
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-2 ${bgClass} rounded-lg border ${textClass} transition-all duration-200 text-sm font-medium`}
                  >
                    <Music className="w-4 h-4" />
                    <span>{displayText}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Instagram-style Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`glass-card inner-glow grid w-full mb-6 p-1 floating-shadow ${canViewInterested ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="my-events" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Events
            </TabsTrigger>
            {canViewInterested && (
              <TabsTrigger value="interested" className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Interested
              </TabsTrigger>
            )}
            <TabsTrigger value="achievements" className="flex items-center gap-2">
              <Award className="w-4 h-4" />
              Achievements
            </TabsTrigger>
          </TabsList>


          {/* My Events Tab - Show attended events with review/ranking toggle */}
          <TabsContent value="my-events" className="mt-6 mb-40">
            <div className="flex items-center justify-between mb-6 p-4">
              <h3 className="gradient-text text-lg font-semibold">
                {isViewingOwnProfile ? 'My Events' : `${profile?.name || 'User'}'s Events`}
              </h3>
              {isViewingOwnProfile && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">View mode:</span>
                  <div className="bg-gray-100 rounded-lg p-1 flex">
                    <button
                      onClick={() => setRankingMode(false)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        !rankingMode
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Reviews
                    </button>
                    <button
                      onClick={() => setRankingMode(true)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        rankingMode
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Rankings
                    </button>
                    <button
                      onClick={() => setRankingMode('unreviewed')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        rankingMode === 'unreviewed'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Unreviewed
                    </button>
                  </div>
                </div>
              )}
            </div>

            {rankingMode === false && (
            <PostsGrid 
              posts={(() => {
                console.log('🔍 ProfileView: Rendering PostsGrid with reviews:', reviews.length);
                console.log('🔍 ProfileView: Reviews array:', reviews);
                
                // Transform reviews into posts (exclude attendance-only records that don't have was_there=true)
                const filteredReviews = reviews.filter(review => {
                  // Show all reviews except ATTENDANCE_ONLY reviews that don't have was_there=true
                  if ((review as any).review_text === 'ATTENDANCE_ONLY' && !(review as any).was_there) {
                    return false;
                  }
                  return true;
                });
                
                console.log('🔍 ProfileView: Filtered reviews for PostsGrid:', filteredReviews.length);
                
                const posts = filteredReviews.map((review) => {
                  // Try multiple sources for event name - check full event object first
                  const fullEvent = (review.event as any)?._fullEvent || review.jambase_events;
                  const eventName = fullEvent?.title 
                    || (fullEvent?.artist_name && fullEvent?.venue_name 
                      ? `${fullEvent.artist_name} at ${fullEvent.venue_name}`
                      : review.event?.event_name || 'Concert Review');
                  const eventDate = fullEvent?.event_date || review.event?.event_date || review.jambase_events?.event_date || review.created_at;
                  
                  return {
                    id: `review-${review.id}`,
                    type: 'review' as const,
                    image: Array.isArray((review as any)?.photos) && (review as any).photos.length > 0 ? (review as any).photos[0] : undefined,
                    images: Array.isArray((review as any)?.photos) ? (review as any).photos : [],
                    title: eventName,
                    subtitle: `Posted by: ${profile?.name || 'User'}`,
                    rating: (() => {
                      const avg = review.category_average ?? calculateCategoryAverage(review);
                      return Math.round(avg * 2) / 2;
                    })(),
                    date: eventDate,
                    likes: (review as any).likes_count || 0,
                    comments: (review as any).comments_count || 0
                  };
                });
                
                console.log('🔍 ProfileView: Posts for PostsGrid:', posts.length, posts);
                
                return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              })()}
              onPostClick={(post) => {
                if (post.type === 'review') {
                  const reviewId = post.id.replace('review-', '');
                  const review = reviews.find(r => r.id === reviewId);
                  if (review) {
                    // Open view modal first (same cool card as feed)
                    console.log('ProfileView: Setting selectedReview from reviews array:', {
                      review,
                      'review.jambase_events': review.jambase_events,
                      'review.jambase_events?.title': review.jambase_events?.title,
                      'review.jambase_events?.artist_name': review.jambase_events?.artist_name,
                      'review.jambase_events?.venue_name': review.jambase_events?.venue_name,
                      'review.setlist': (review as any).setlist,
                      'hasSetlist': !!(review as any).setlist
                    });
                    setSelectedReview(review as any);
                    try { console.log('🔎 Opening review modal for', review.id); } catch {}
                    setViewReviewOpen(true);
                  }
                }
              }}
              />
            )}

            {rankingMode === true && isViewingOwnProfile && (
              <div className="space-y-6">
                {[5,4.5,4,3.5,3,2.5,2,1.5,1].map(ratingGroup => {
                  const group = reviews.filter(r => (r as any).review_text !== 'ATTENDANCE_ONLY' && getDisplayRating(r) === ratingGroup); // Exclude attendance-only records
                  if (group.length === 0) return null as any;
                  return (
                    <div key={ratingGroup}>
                      <div className="text-xs font-semibold text-muted-foreground mb-2">{ratingGroup}★</div>
                      <ul className="glass-card inner-glow divide-y rounded-lg border p-2 floating-shadow">
                        {group
                          .sort((a, b) => {
                            const ao = (a as any).rank_order ?? 9999;
                            const bo = (b as any).rank_order ?? 9999;
                            if (ao !== bo) return ao - bo;
                            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                          })
                          .map((item, idx) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50"
                            onClick={() => { setSelectedReview(item as any); setViewReviewOpen(true); }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-6 w-6 rounded-full bg-gray-100 text-xs flex items-center justify-center border">{idx + 1}</div>
                              <div>
                                <div className="text-sm font-medium">{item.event.event_name}</div>
                                <div className="text-xs text-muted-foreground">{new Date(item.event.event_date).toLocaleDateString()}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {idx > 0 && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const arr = group.slice().sort((a,b)=>((a as any).rank_order||9999)-((b as any).rank_order||9999));
                                  const i = arr.findIndex(x => x.id === item.id);
                                  if (i > 0) {
                                    const [moved] = arr.splice(i,1);
                                    arr.splice(i-1,0,moved);
                                    (async () => {
                                      await ReviewService.setRankOrderForRatingGroup(currentUserId, ratingGroup, arr.map(x => x.id));
                                      fetchReviews();
                                    })();
                                  }
                                }}
                              >↑</Button>)}
                              {idx < group.length - 1 && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const arr = group.slice().sort((a,b)=>((a as any).rank_order||9999)-((b as any).rank_order||9999));
                                  const i = arr.findIndex(x => x.id === item.id);
                                  if (i !== -1 && i < arr.length - 1) {
                                    const [moved] = arr.splice(i,1);
                                    arr.splice(i+1,0,moved);
                                    (async () => {
                                      await ReviewService.setRankOrderForRatingGroup(currentUserId, ratingGroup, arr.map(x => x.id));
                                      fetchReviews();
                                    })();
                                  }
                                }}
                              >↓</Button>)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            
            {rankingMode === 'unreviewed' && isViewingOwnProfile && (
              <div className="space-y-4">
                {(attendedEventsLoading || draftReviewsLoading) ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                    <p className="text-sm text-gray-600">Loading unreviewed events and drafts...</p>
                  </div>
                ) : (
                  (() => {
                    // Filter for events that were attended but not reviewed
                    const unreviewedEvents = attendedEvents.filter(attendance => {
                      const isAttendanceOnly = attendance.review_text === 'ATTENDANCE_ONLY'; // Special marker for attendance-only records
                      return isAttendanceOnly;
                    });

                    // Combine unreviewed events and draft reviews
                    const allUnreviewedItems = [
                      ...unreviewedEvents.map(event => ({ type: 'unreviewed', data: event })),
                      ...draftReviews.map(draft => ({ type: 'draft', data: draft }))
                    ];

                    if (allUnreviewedItems.length === 0) {
                      return (
                        <div className="text-center py-12">
                          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h3>
                          <p className="text-gray-600 mb-4">
                            You've reviewed all the events you've attended and have no draft reviews. Great job!
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-4">
                        {allUnreviewedItems.map((item) => {
                          if (item.type === 'unreviewed') {
                            const attendance = item.data;
                            const event = attendance.jambase_events;
                            
                            return (
                              <Card key={`unreviewed-${attendance.id}`} className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={() => {
                                // Ensure we have complete event data for the modal
                                // Handle both direct event objects and nested jambase_event objects
                                const eventData = event.jambase_event || event;
                                const completeEvent = {
                                  ...eventData,
                                  // Ensure all required fields are present with proper fallbacks
                                  id: eventData.id || event.id || attendance.event_id,
                                  title: eventData.title || event.title || 'Unknown Event',
                                  artist_name: eventData.artist_name || event.artist_name || 'Unknown Artist',
                                  venue_name: eventData.venue_name || event.venue_name || 'Unknown Venue',
                                  event_date: eventData.event_date || event.event_date || new Date().toISOString(),
                                  venue_city: eventData.venue_city || event.venue_city || null,
                                  venue_state: eventData.venue_state || event.venue_state || null,
                                  setlist: eventData.setlist || event.setlist || null,
                                  setlist_song_count: eventData.setlist_song_count || event.setlist_song_count || null,
                                  setlist_fm_url: eventData.setlist_fm_url || event.setlist_fm_url || null
                                };
                                
                                console.log('ProfileView: Complete event data for modal:', {
                                  originalEvent: event,
                                  completeEvent,
                                  attendanceEventId: attendance.event_id
                                });
                                setSelectedEvent(completeEvent);
                                setDetailsOpen(true);
                              }}>
                                <CardContent className="p-6">
                                  <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                      <h4 className="text-lg font-semibold text-gray-900 mb-2">
                                        {event.title}
                                      </h4>
                                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                                        <div className="flex items-center gap-1">
                                          <Music className="w-4 h-4" />
                                          <span>{event.artist_name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <MapPin className="w-4 h-4" />
                                          <span>{event.venue_name}</span>
                                          {event.venue_city && (
                                            <span className="text-gray-400">• {event.venue_city}, {event.venue_state}</span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Calendar className="w-4 h-4" />
                                          <span>{new Date(event.event_date).toLocaleDateString()}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                                        <Calendar className="w-3 h-3 mr-1" />
                                        Needs Review
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      Attended on {new Date(attendance.created_at).toLocaleDateString()}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // Ensure we have complete event data for the modal
                                          // Handle both direct event objects and nested jambase_event objects
                                          const eventData = event.jambase_event || event;
                                          const completeEvent = {
                                            ...eventData,
                                            // Ensure all required fields are present with proper fallbacks
                                            id: eventData.id || event.id || attendance.event_id,
                                            title: eventData.title || event.title || 'Unknown Event',
                                            artist_name: eventData.artist_name || event.artist_name || 'Unknown Artist',
                                            venue_name: eventData.venue_name || event.venue_name || 'Unknown Venue',
                                            event_date: eventData.event_date || event.event_date || new Date().toISOString(),
                                            venue_city: eventData.venue_city || event.venue_city || null,
                                            venue_state: eventData.venue_state || event.venue_state || null,
                                            setlist: eventData.setlist || event.setlist || null,
                                            setlist_song_count: eventData.setlist_song_count || event.setlist_song_count || null,
                                            setlist_fm_url: eventData.setlist_fm_url || event.setlist_fm_url || null
                                          };
                                          setSelectedEvent(completeEvent);
                                          setDetailsOpen(true);
                                        }}
                                      >
                                        <ExternalLink className="w-4 h-4 mr-2" />
                                        View Event
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setReviewModalEvent(event);
                                          setShowAddReview(true);
                                        }}
                                        className="bg-primary hover:bg-primary/90"
                                      >
                                        <Star className="w-4 h-4 mr-2" />
                                        Add Review
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          } else if (item.type === 'draft') {
                            const draft = item.data;
                            
                            return (
                              <Card key={`draft-${draft.id}`} className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={() => {
                                // Create a mock event object for the draft
                                const draftEvent = {
                                  id: draft.event_id,
                                  title: draft.event_title || 'Draft Review',
                                  artist_name: draft.artist_name || 'Unknown Artist',
                                  venue_name: draft.venue_name || 'Unknown Venue',
                                  event_date: draft.event_date || new Date().toISOString(),
                                  venue_city: null,
                                  venue_state: null,
                                  setlist: null,
                                  setlist_song_count: null,
                                  setlist_fm_url: null
                                };
                                
                                setReviewModalEvent(draftEvent);
                                setShowAddReview(true);
                              }}>
                                <CardContent className="p-6">
                                  <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                      <h4 className="text-lg font-semibold text-gray-900 mb-2">
                                        {draft.event_title || 'Draft Review'}
                                      </h4>
                                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                                        {draft.artist_name && (
                                          <div className="flex items-center gap-1">
                                            <Music className="w-4 h-4" />
                                            <span>{draft.artist_name}</span>
                                          </div>
                                        )}
                                        {draft.venue_name && (
                                          <div className="flex items-center gap-1">
                                            <MapPin className="w-4 h-4" />
                                            <span>{draft.venue_name}</span>
                                          </div>
                                        )}
                                        {draft.event_date && (
                                          <div className="flex items-center gap-1">
                                            <Calendar className="w-4 h-4" />
                                            <span>{new Date(draft.event_date).toLocaleDateString()}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-blue-600 border-blue-300">
                                        <Edit className="w-3 h-3 mr-1" />
                                        Draft
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      Last saved: {draft.last_saved_at ? new Date(draft.last_saved_at).toLocaleDateString() : 'Unknown'}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // Create a mock event object for the draft
                                          const draftEvent = {
                                            id: draft.event_id,
                                            title: draft.event_title || 'Draft Review',
                                            artist_name: draft.artist_name || 'Unknown Artist',
                                            venue_name: draft.venue_name || 'Unknown Venue',
                                            event_date: draft.event_date || new Date().toISOString(),
                                            venue_city: null,
                                            venue_state: null,
                                            setlist: null,
                                            setlist_song_count: null,
                                            setlist_fm_url: null
                                          };
                                          setReviewModalEvent(draftEvent);
                                          setShowAddReview(true);
                                        }}
                                        className="bg-blue-600 hover:bg-blue-700"
                                      >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Continue Draft
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          }
                          return null;
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
            )}
            
            {/* Floating Add Button - only show for own profile in reviews mode */}
            {rankingMode === false && isViewingOwnProfile && (
            <div className="fixed bottom-20 right-4 z-10">
              <Button 
                onClick={handleOpenReviewModal} 
                size="lg"
                className="rounded-full h-14 w-14 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
              >
                <Plus className="w-6 h-6" />
              </Button>
            </div>)}
          </TabsContent>

            {canViewInterested && (
            <TabsContent value="interested" className="mt-6">
              {/* Toggle between Upcoming and Archive */}
              {userEvents.length > 0 && (
                <div className="flex justify-center mb-4">
                  <div className="bg-gray-100 rounded-lg p-1 flex">
                    <button
                      onClick={() => setShowPastEvents(false)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        !showPastEvents
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Upcoming
                    </button>
                    <button
                      onClick={() => setShowPastEvents(true)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        showPastEvents
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              )}

              {userEvents.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Heart className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold">No Interested Events Yet</h3>
                  <p className="text-sm text-muted-foreground">Tap the heart on events to add them here.</p>
                </div>
              ) : filteredUserEvents.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Heart className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="text-lg font-semibold">
                    {showPastEvents ? 'No Past Events' : 'No Upcoming Events'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {showPastEvents 
                      ? 'You haven\'t marked any past events as interested.' 
                      : 'You don\'t have any upcoming events marked as interested.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1 md:gap-2">
                  {filteredUserEvents
                    .sort((a,b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
                    .slice(0, 9)
                    .map((ev) => (
                      <div
                        key={ev.id}
                        className={`aspect-square cursor-pointer rounded-md overflow-hidden border bg-white hover:shadow-md transition-shadow relative ${
                          showPastEvents ? 'opacity-75' : ''
                        }`}
                        onClick={() => { 
                          console.log('ProfileView: Event data being passed to modal from interested events:', ev);
                          // Ensure we have complete event data for the modal
                          // The event from fetchUserEvents is already processed, so use it directly
                          const completeEvent = {
                            ...ev,
                            // Ensure all required fields are present with proper fallbacks
                            id: ev.id || ev.jambase_event_id,
                            title: ev.title || 'Unknown Event',
                            artist_name: ev.artist_name || 'Unknown Artist',
                            venue_name: ev.venue_name || 'Unknown Venue',
                            event_date: ev.event_date || new Date().toISOString(),
                            venue_city: ev.venue_city || null,
                            venue_state: ev.venue_state || null,
                            setlist: ev.setlist || null,
                            setlist_song_count: ev.setlist_song_count || null,
                            setlist_fm_url: ev.setlist_fm_url || null
                          };
                          
                          console.log('ProfileView: Complete event data for modal from interested events:', {
                            originalEvent: ev,
                            completeEvent,
                            artist_name: completeEvent.artist_name,
                            venue_name: completeEvent.venue_name,
                            venue_city: completeEvent.venue_city,
                            venue_state: completeEvent.venue_state
                          });
                          
                          setSelectedEvent(completeEvent); 
                          setDetailsOpen(true); 
                        }}
                      >
                        <div className="h-full flex flex-col">
                          <div className="h-2/3 w-full bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center relative">
                            {/* Always show the heart icon instead of trying to load images */}
                            <Heart className="w-1/3 h-1/3 text-white" />
                            {/* Interested badge - only show for upcoming events */}
                            {!showPastEvents && (
                              <div className="absolute top-1 right-1 bg-white text-black text-[8px] px-1 py-0.5 rounded font-medium">
                                Interested
                              </div>
                            )}
                            {/* Past badge - only show for archive events */}
                            {showPastEvents && (
                              <div className="absolute top-1 right-1 bg-white text-black text-[8px] px-1 py-0.5 rounded font-medium">
                                Past
                              </div>
                            )}
                          </div>
                          <div className="p-2 flex-1 flex flex-col justify-between">
                            <div>
                              <h4 className="font-semibold text-xs truncate">{ev.title}</h4>
                              <p className="text-xs text-muted-foreground truncate">{ev.venue_name}</p>
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                              <span>{new Date(ev.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              <span className="truncate">{[ev.venue_city, ev.venue_state].filter(Boolean).join(', ')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>
          )}

          

          {/* 🏆 Achievements Tab */}
          <TabsContent value="achievements" className="mt-6 mb-40">
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Trophy className="w-8 h-8 text-yellow-500" />
                  <h2 className="gradient-text text-2xl font-bold">Achievements</h2>
                </div>
                <p className="text-gray-600 text-sm">
                  {isViewingOwnProfile 
                    ? 'Track your concert journey milestones' 
                    : `${profile?.name || 'User'}'s concert achievements`}
                </p>
              </div>

              {achievementsLoading ? (
                <div className="space-y-4">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              ) : (
                <>
                  {/* Unlocked Achievements */}
                  {achievements.filter(a => a.unlocked).length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Award className="w-5 h-5 text-yellow-500" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Unlocked ({achievements.filter(a => a.unlocked).length})
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {achievements.filter(a => a.unlocked).map(achievement => (
                          <AchievementCard
                            key={achievement.id}
                            name={achievement.name}
                            description={achievement.description}
                            icon={achievement.icon}
                            progress={achievement.progress}
                            goal={achievement.goal}
                            unlocked={achievement.unlocked}
                            unlockedAt={achievement.unlockedAt}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* In Progress Achievements */}
                  {achievements.filter(a => !a.unlocked).length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Award className="w-5 h-5 text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          In Progress ({achievements.filter(a => !a.unlocked).length})
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {achievements.filter(a => !a.unlocked).map(achievement => (
                          <AchievementCard
                            key={achievement.id}
                            name={achievement.name}
                            description={achievement.description}
                            icon={achievement.icon}
                            progress={achievement.progress}
                            goal={achievement.goal}
                            unlocked={achievement.unlocked}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {achievements.length === 0 && (
                    <div className="text-center py-12">
                      <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No Achievements Yet</h3>
                      <p className="text-gray-600">
                        {isViewingOwnProfile 
                          ? 'Start attending events and writing reviews to unlock achievements!'
                          : 'This user hasn\'t unlocked any achievements yet.'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

        </Tabs>
      </div>

      {/* Review Modal */}
      <EventReviewModal
        event={reviewModalEvent}
        userId={currentUserId}
        isOpen={showAddReview}
        onClose={() => {
          setShowAddReview(false);
          setReviewModalEvent(null);
        }}
        onReviewSubmitted={handleReviewSubmitted}
      />

      {/* Review View Dialog - Belli-style layout */}
      {viewReviewOpen && selectedReview && (
        <Dialog open={viewReviewOpen} onOpenChange={setViewReviewOpen}>
          <DialogContent className="max-w-5xl w-[90vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden bg-transparent border-none shadow-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Review</DialogTitle>
              <DialogDescription>
                View concert review details
              </DialogDescription>
            </DialogHeader>
            {/* BelliStyleReviewCard inside dialog */}
            <div className="w-full h-full overflow-y-auto p-2">
              <BelliStyleReviewCard
                review={{
                  id: selectedReview.id,
                  user_id: selectedReview.user_id || profile?.user_id || '',
                  event_id: selectedReview.event_id || '',
                  rating: selectedReview.rating || 0,
                  review_text: selectedReview.review_text || '',
                  is_public: selectedReview.is_public ?? true,
                  created_at: selectedReview.created_at,
                  updated_at: selectedReview.updated_at || selectedReview.created_at,
                  likes_count: selectedReview.likes_count || 0,
                  comments_count: selectedReview.comments_count || 0,
                  shares_count: selectedReview.shares_count || 0,
                  is_liked_by_user: (selectedReview as any).is_liked_by_user || false,
                  reaction_emoji: selectedReview.reaction_emoji || '',
                  photos: (selectedReview as any).photos || [],
                  videos: (selectedReview as any).videos || [],
                  mood_tags: (selectedReview as any).mood_tags || [],
                  genre_tags: (selectedReview as any).genre_tags || [],
                  context_tags: (selectedReview as any).context_tags || [],
                  artist_name: selectedReview.jambase_events?.artist_name,
                  venue_name: selectedReview.jambase_events?.venue_name,
                  artist_performance_rating: (selectedReview as any).artist_performance_rating,
                  production_rating: (selectedReview as any).production_rating,
                  venue_rating: (selectedReview as any).venue_rating,
                  location_rating: (selectedReview as any).location_rating,
                  value_rating: (selectedReview as any).value_rating,
                  artist_performance_feedback: (selectedReview as any).artist_performance_feedback,
                  production_feedback: (selectedReview as any).production_feedback,
                  venue_feedback: (selectedReview as any).venue_feedback,
                  location_feedback: (selectedReview as any).location_feedback,
                  value_feedback: (selectedReview as any).value_feedback,
                  artist_performance_recommendation: (selectedReview as any).artist_performance_recommendation,
                  production_recommendation: (selectedReview as any).production_recommendation,
                  venue_recommendation: (selectedReview as any).venue_recommendation,
                  location_recommendation: (selectedReview as any).location_recommendation,
                  value_recommendation: (selectedReview as any).value_recommendation,
                  ticket_price_paid: (selectedReview as any).ticket_price_paid,
                  setlist: (selectedReview as any).setlist || selectedReview.jambase_events?.setlist,
                  custom_setlist: (selectedReview as any).custom_setlist
                }}
                currentUserId={currentUserId}
                onLike={async (reviewId, isLiked) => {
                  console.log('🔍 ProfileView BelliStyle onLike:', { reviewId, isLiked });
                }}
                onComment={() => {
                  console.log('Comment on review from ProfileView');
                }}
                onShare={() => {
                  console.log('Share review from ProfileView');
                }}
                onEdit={() => {
                  setViewReviewOpen(false);
                  handleEditReview(selectedReview);
                }}
                onDelete={async () => {
                  if (window.confirm('Are you sure you want to delete this review?')) {
                    await handleDeleteReview(selectedReview.id);
                  setViewReviewOpen(false);
                    setSelectedReview(null);
                  }
                }}
                userProfile={{
                  name: profile?.name || 'User',
                  avatar_url: profile?.avatar_url,
                  verified: profile?.verified,
                  account_type: profile?.account_type as any
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}



      {/* Friends Modal */}
      <FollowersModal
        isOpen={Boolean(showFollowersModal)}
        onClose={() => setShowFollowersModal(false)}
        type="friends"
        friends={Array.isArray(friends) ? friends : []}
        count={Array.isArray(friends) ? friends.length : 0}
        onStartChat={(friendId: string) => {
          console.log('Start chat with friend:', friendId);
          if (onNavigateToChat) {
            onNavigateToChat(friendId);
          }
        }}
        onViewProfile={(friend) => {
          // Navigate to friend's profile using the same pattern as MainApp
          const event = new CustomEvent('open-user-profile', {
            detail: { userId: friend.user_id }
          });
          window.dispatchEvent(event);
          // Close the modal after navigation
          setShowFollowersModal(false);
        }}
        onUnfriend={unfriendUser}
      />

      {/* Event Details Modal - mount only when needed to avoid React static flag warning */}
      {detailsOpen && selectedEvent && (
      <EventDetailsModal
        event={(() => {
          console.log('🎵 ProfileView: Event data being passed to EventDetailsModal:', {
            event: selectedEvent,
            hasSetlist: selectedEvent.setlist,
            hasSetlistEnriched: selectedEvent.setlist_enriched,
            setlistSongCount: selectedEvent.setlist_song_count
          });
          return selectedEvent;
        })()}
        currentUserId={currentUserId}
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        isInterested={true}
        onInterestToggle={async (eventId, interested) => {
          console.log('🎯 Interest toggled in profile view:', eventId, interested);
          // Remove interest from the event
          if (!interested) {
            try {
              await UserEventService.removeEventInterest(currentUserId, eventId);
              // Close the modal
              setDetailsOpen(false);
              // Refetch user events to update the UI
              await fetchUserEvents();
              toast({
                title: "Interest Removed",
                description: "You've removed this event from your interested list"
              });
            } catch (error) {
              console.error('Error removing event interest:', error);
              toast({
                title: "Error",
                description: "Failed to remove interest",
                variant: "destructive"
              });
            }
          }
        }}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToChat={onNavigateToChat}
        onAttendanceChange={async (eventId, attended) => {
          console.log('🎯 Attendance changed in profile view:', eventId, attended);
          // Refetch user events and attended events to update the UI
          await Promise.all([
            fetchUserEvents(),
            fetchAttendedEvents()
          ]);
        }}
      />
      )}

      {/* Report Profile Modal */}
      {!isViewingOwnProfile && profile && (
        <ReportContentModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          contentType="profile"
          contentId={targetUserId}
          contentTitle={`${profile.name}'s profile`}
          onReportSubmitted={() => {
            setReportModalOpen(false);
            toast({
              title: 'Report Submitted',
              description: 'Thank you for helping keep our community safe',
            });
          }}
        />
      )}

      {/* Block User Modal */}
      {!isViewingOwnProfile && profile && (
        <BlockUserModal
          open={blockModalOpen}
          onClose={() => setBlockModalOpen(false)}
          user={{
            id: targetUserId,
            name: profile.name,
            avatar_url: profile.avatar_url || undefined,
          }}
          isBlocked={isUserBlocked}
          onBlockToggled={() => {
            setBlockModalOpen(false);
            setIsUserBlocked(!isUserBlocked);
            toast({
              title: isUserBlocked ? 'User Unblocked' : 'User Blocked',
              description: isUserBlocked 
                ? `You can now see content from ${profile.name}` 
                : `You won't see content from ${profile.name} anymore`,
            });
          }}
        />
      )}

    </div>
  );
};
