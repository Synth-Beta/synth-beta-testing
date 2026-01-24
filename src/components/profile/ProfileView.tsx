import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, Edit, Heart, MapPin, Calendar, Instagram, ExternalLink, Settings, Music, Plus, ThumbsUp, ThumbsDown, Minus, Star, Grid, BarChart3, Clock, Award, Trophy, Flag, Ban, MoreVertical, Trash2 } from 'lucide-react';
import { FollowersModal } from './FollowersModal';
import { FollowingModal } from './FollowingModal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
// JamBaseService removed - using database queries directly
import { EventReviewModal } from '../reviews/EventReviewModal';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReviewDetailView } from '../reviews/ReviewDetailView';
import type { Artist } from '@/types/concertSearch';
import { ReviewService } from '@/services/reviewService';
import { UserEventService } from '@/services/userEventService';
import { DraftReviewService } from '@/services/draftReviewService';
import { getEventStatus, isEventPast, getPastEvents, getUpcomingEvents } from '@/utils/eventStatusUtils';
import { detectStreamingServiceType } from '../streaming/UnifiedStreamingStats';
import { SwiftUIEventCard } from '@/components/events/SwiftUIEventCard';
import { EventDetailsModal } from '../events/EventDetailsModal';
import { MusicTasteCard } from './MusicTasteCard';
import { HolisticStatsCard } from './HolisticStatsCard';
import { UserAnalyticsService } from '@/services/userAnalyticsService';
import { SynthSLogo } from '@/components/SynthSLogo';
import { SkeletonProfileCard } from '@/components/skeleton/SkeletonProfileCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ArtistFollowService } from '@/services/artistFollowService';
import { useNavigate } from 'react-router-dom';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { BlockUserModal } from '@/components/moderation/BlockUserModal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FriendActivityFeed } from '@/components/social/FriendActivityFeed';
import { WorkingConnectionBadge } from '../WorkingConnectionBadge';
import { VerificationBadge } from '@/components/verification/VerificationBadge';
import type { AccountType } from '@/utils/verificationUtils';
import { PageActions } from '@/components/PageActions';
import { FriendsService } from '@/services/friendsService';
import { ProfileDraftsSummary } from './ProfileDraftsSummary';
import { ProfileStarBuckets } from './ProfileStarBuckets';
import { PassportModal } from '@/components/discover/PassportModal';
import { PassportService } from '@/services/passportService';
import { Sparkles } from 'lucide-react';
import { useViewTracking } from '@/hooks/useViewTracking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';
import { UserInfo } from './UserInfo';
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';
import { MobileHeader } from '@/components/Header/MobileHeader';

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
  onNavigateToDiscover?: () => void; // Callback to navigate back to discover page
  menuOpen?: boolean;
  onMenuClick?: () => void;
  hideHeader?: boolean;
  refreshTrigger?: number; // Trigger to refresh reviews when incremented
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  username: string | null;
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
import type { JamBaseEvent } from '@/types/eventTypes';

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
  ticket_price_paid?: number;
  photos?: string[];
  videos?: string[];
  mood_tags?: string[];
  genre_tags?: string[];
  reaction_emoji?: string | null;
  category_average?: number;
  event_date?: Date | string; // Date object or string for compatibility
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

export const ProfileView = ({ currentUserId, profileUserId, onBack, onEdit, onSettings, onSignOut, onNavigateToProfile, onNavigateToChat, onNavigateToNotifications, onNavigateToDiscover, menuOpen = false, onMenuClick, hideHeader = false, refreshTrigger = 0 }: ProfileViewProps) => {
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
  
  // 🏆 Achievements state (removed - now in Passport)
  const [canViewInterested, setCanViewInterested] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [viewReviewOpen, setViewReviewOpen] = useState(false); // Only declare once
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [followersModalType, setFollowersModalType] = useState<'followers' | 'following' | 'friends'>('friends');
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'none' | 'friends' | 'pending_sent' | 'pending_received'>('none');
  const friendButtonRef = useRef<HTMLButtonElement>(null);
  const messageButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [followedArtistsCount, setFollowedArtistsCount] = useState(0);
  const [followedVenuesCount, setFollowedVenuesCount] = useState(0);
  const [passportProgress, setPassportProgress] = useState({
    cities: 0,
    venues: 0,
    artists: 0,
    scenes: 0,
  });
  const { toast } = useToast();
  const { user, sessionExpired } = useAuth();
  const navigate = useNavigate();

  // Determine which user's profile to show
  const targetUserId = profileUserId || currentUserId;
  const isViewingOwnProfile = !profileUserId || profileUserId === currentUserId;

  // Track profile view
  useViewTracking(
    'profile',
    targetUserId,
    { is_own_profile: isViewingOwnProfile },
    targetUserId
  );

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
      
      // Parallelize all independent data fetching for faster loading
      const fetchData = async () => {
        try {
          console.log('🔍 ProfileView: fetchData function called - parallelizing queries');
          
          // Parallelize all independent queries
          await Promise.all([
            fetchProfile(),
            fetchUserEvents(),
            fetchReviews(),
            fetchReviewsCount(),
            fetchFriends(),
            fetchAttendedEvents(),
            fetchDraftReviews(),
            fetchFollowedArtistsCount(),
            loadPassportSummary(),
            // Only check friend status if viewing someone else's profile
            !isViewingOwnProfile ? checkFriendStatus() : Promise.resolve()
          ]);
          
          console.log('🔍 ProfileView: All data fetched successfully');
        } catch (error) {
          console.error('🔍 ProfileView: Error fetching data:', error);
        } finally {
          setLoading(false);
          console.log('🔍 ProfileView: Loading state set to FALSE');
        }
      };
      
      fetchData();
    }, 300); // Debounce by 300ms
    
    return () => clearTimeout(fetchTimeout);
  }, [targetUserId, sessionExpired, user]);

  // Refresh interested events when user switches to "interested" tab
  useEffect(() => {
    if (activeTab === 'interested' && targetUserId) {
      console.log('🔍 ProfileView: User switched to interested tab, refreshing events...');
      fetchUserEvents();
    }
  }, [activeTab, targetUserId]);

  // Refresh reviews when refreshTrigger changes (triggered when review is submitted)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0 && user && !sessionExpired) {
      console.log('🔄 ProfileView: Refresh trigger changed, refetching reviews...');
      fetchReviews();
      fetchReviewsCount();
    }
  }, [refreshTrigger]);

  useEffect(() => {
    // Check for hash in URL to determine active tab
    const hash = window.location.hash.substring(1);
    if (hash === 'spotify') {
      setActiveTab('spotify');
      return; // Don't check sessionStorage if hash is present
    }
    
    // Check for tab preference from sessionStorage (set by SideMenu navigation)
    // Only read if we're viewing own profile to avoid conflicts
    if (isViewingOwnProfile) {
      const preferredTab = sessionStorage.getItem('profileTab');
      if (preferredTab && ['timeline', 'interested', 'passport'].includes(preferredTab)) {
        // Map 'timeline' to 'passport' for backward compatibility
        setActiveTab(preferredTab === 'timeline' ? 'passport' : preferredTab);
        sessionStorage.removeItem('profileTab'); // Clear after use
      }
    }
  }, [isViewingOwnProfile]);

  useEffect(() => {
    // Check for tab preference from sessionStorage (set by SideMenu navigation)
    if (isViewingOwnProfile) {
      const preferredTab = sessionStorage.getItem('profileTab');
      if (preferredTab && ['timeline', 'interested', 'passport'].includes(preferredTab)) {
        setActiveTab(preferredTab === 'timeline' ? 'passport' : preferredTab);
        sessionStorage.removeItem('profileTab');
      }
    }
  }, [isViewingOwnProfile]);

  useEffect(() => {
    // Show by default; optionally restrict later based on friends
    if (!user) { setCanViewInterested(true); return; }
    if (user.id === currentUserId) { setCanViewInterested(true); return; }
    (async () => {
      try {
        // Check if users are friends using user_relationships table
        const { data } = await supabase
          .from('user_relationships')
          .select('id')
          .eq('relationship_type', 'friend')
          .eq('status', 'accepted')
          .or(`and(user_id.eq.${user.id},related_user_id.eq.${currentUserId}),and(user_id.eq.${currentUserId},related_user_id.eq.${user.id}))`)
          .limit(1);
        setCanViewInterested(Array.isArray(data) ? data.length > 0 : false);
      } catch {
        setCanViewInterested(true);
      }
    })();
  }, [user, currentUserId]);

  // Override button text colors to neutral-600
  useEffect(() => {
    if (friendButtonRef.current) {
      friendButtonRef.current.style.setProperty('color', 'var(--neutral-600)', 'important');
    }
    if (messageButtonRef.current) {
      messageButtonRef.current.style.setProperty('color', 'var(--neutral-600)', 'important');
    }
  }, [friendStatus]);

  const fetchProfile = async () => {
    try {
      console.log('🔍 ProfileView: Starting profile fetch...');
      console.log('🔍 ProfileView: sessionExpired:', sessionExpired);
      console.log('🔍 ProfileView: user:', user);
      console.log('🔍 ProfileView: currentUserId:', currentUserId);
      
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('❌ Session expired or no user, skipping profile fetch');
        // Don't set loading to false here - let the main fetchData handle it
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
          // Don't set loading to false here - let the main fetchData handle it
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
          username: null,
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
        username: null,
        avatar_url: null,
        bio: null,
        instagram_handle: null,
        music_streaming_profile: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      // Don't set loading to false here - let the main fetchData handle it
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

      console.log('🔍 ProfileView: Fetching user events from database...');
      const interested = await UserEventService.getUserInterestedEvents(targetUserId);
      let data: JamBaseEvent[] = interested.events
        .map(item => item.event)
        .filter(Boolean) as JamBaseEvent[];
      console.log('🔍 ProfileView: Database query returned:', data?.length, 'events');
      
      // Get events that user has attended to exclude them from interested events
      const { data: attendanceData } = await (supabase as any)
        .from('reviews')
        .select('event_id')
        .eq('user_id', targetUserId)
        .eq('was_there', true);
      
      const attendedEventIds = new Set(attendanceData?.map((a: any) => a.event_id) || []);
      
      const events = data?.map(item => {
        // Item is already the event object (3NF schema)
        const jambaseEvent = item as JamBaseEvent;
        const rawItem = item as any; // Keep raw item to access all database fields
        
        // Debug all events to see what we're getting
        console.log('ProfileView: Processing event in getUserEvents:', {
          title: jambaseEvent?.title,
          artist_name: jambaseEvent?.artist_name,
          venue_name: jambaseEvent?.venue_name,
          poster_image_url: rawItem?.poster_image_url,
          images: rawItem?.images
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
          // Use normalized artist_name and venue_name from JOINs (already populated by getUserInterestedEvents)
          // Preserve null instead of empty string so EventDetailsModal fallback can fetch names
          artist_name: jambaseEvent?.artist_name || (jambaseEvent as any)?.artist_name || null,
          artist_id: jambaseEvent?.artist_id ?? (jambaseEvent as any)?.artist_id ?? null,
          venue_name: jambaseEvent?.venue_name || (jambaseEvent as any)?.venue_name || null,
          venue_id: jambaseEvent?.venue_id ?? (jambaseEvent as any)?.venue_id ?? null,
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
          // Preserve image fields for display - use rawItem to get all database fields
          poster_image_url: rawItem?.poster_image_url ?? null,
          event_media_url: rawItem?.event_media_url ?? null,
          images: rawItem?.images ?? null,
          media_urls: rawItem?.media_urls ?? null,
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
        .map((item: any) => {
          // Get event_date from review - it's a Date object from getUserReviewHistory
          // If it's a string (from database), convert to Date; if already Date, use as-is
          // Handle both lowercase (event_date) and capitalized (Event_date) for migration compatibility
          let reviewEventDate: Date | undefined = undefined;
          const eventDateValue = (item.review as any).event_date || (item.review as any).Event_date;
          if (eventDateValue) {
            if (eventDateValue instanceof Date) {
              reviewEventDate = eventDateValue;
            } else if (typeof eventDateValue === 'string') {
              // Convert string (YYYY-MM-DD) to Date object in local timezone
              // DATE type has no time component, so parse as local date to avoid timezone shifting
              const [year, month, day] = eventDateValue.split('-').map(Number);
              if (year && month && day) {
                const parsedDate = new Date(year, month - 1, day); // month is 0-indexed
                if (!isNaN(parsedDate.getTime())) {
                  reviewEventDate = parsedDate;
                }
              }
            }
          }
          
          return {
          id: item.review.id,
          user_id: item.review.user_id,
          event_id: item.review.event_id,
          artist_id: item.review.artist_id,
          venue_id: item.review.venue_id,
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
          photos: item.review.photos || [],
          videos: item.review.videos || [],
          setlist: item.review.setlist,
          is_public: item.review.is_public,
          is_draft: item.review.is_draft || false, // Include is_draft flag
          was_there: item.review.was_there,
          created_at: item.review.created_at,
          ticket_price_paid: item.review.ticket_price_paid,
          category_average: calculateCategoryAverage(item.review),
          // Store event_date as Date object for easy access
          event_date: reviewEventDate,
          // Add artist_name and venue_name directly for review cards
          artist_name: item.event?.artist_name,
          venue_name: item.event?.venue_name,
          // Add jambase_events data for the modal to access (keep full event object)
          jambase_events: item.event || null,
          event: {
            event_name: item.event?.title 
              || (item.event?.artist_name && item.event?.venue_name 
                ? `${item.event.artist_name} at ${item.event.venue_name}`
                : item.event?.event_name || 'Concert Review'),
            location: item.event?.venue_name || 'Unknown Venue',
            artist_name: item.event?.artist_name,
            venue_name: item.event?.venue_name,
            // Convert event_date (Date) to string for event_date field, or use event.event_date, or fallback to created_at
            event_date: reviewEventDate 
              ? reviewEventDate.toISOString().split('T')[0] 
              : (item.event?.event_date || item.review.created_at),
            event_time: item.event?.event_time || item.event?.doors_time || 'TBD',
            // Keep full event data for PostsGrid
            _fullEvent: item.event || null
          }
        };
        });
      
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

  // Helper function to open event and check if current user is interested
  const handleOpenEvent = async (event: any) => {
    setSelectedEvent(event);
    
    // Check if current user is interested in this event (not the profile user)
    try {
      const interested = await UserEventService.isUserInterested(currentUserId, event.id);
      setSelectedEventInterested(interested);
    } catch (error) {
      console.error('Error checking interest:', error);
      setSelectedEventInterested(false);
    }
    
    setDetailsOpen(true);
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
    // Use review.rating directly - it's always calculated as the average of 5 category ratings by the database trigger
    // The database stores it as NUMERIC(3,1) which is already rounded to 1 decimal place
    if (typeof review.rating === 'number') {
      return review.rating;
    }
    
    // Handle string ratings from database (sometimes Supabase returns NUMERIC as string)
    if (typeof review.rating === 'string') {
      const parsed = parseFloat(review.rating);
      return isNaN(parsed) ? null : parsed;
    }

    // If rating is null or undefined, return null (don't default to 0)
    if (review.rating === null || review.rating === undefined) {
      return null;
    }

    // Legacy fallback for old string ratings
    if (review.rating === 'good') return 5;
    if (review.rating === 'okay') return 3;
    if (review.rating === 'bad') return 1;
    return null; // Return null instead of 0 for unknown values
  };

  // Compute display rating - use review.rating directly from database (already rounded to 1 decimal)
  // This ensures consistency - the database trigger calculates it as the average of 5 category ratings
  // Round to 1 decimal for consistent display and comparison
  const getDisplayRating = (r: any) => {
    const rating = calculateCategoryAverage(r);
    // Round to 1 decimal place for consistent grouping and display
    // This matches the database NUMERIC(3,1) format
    return parseFloat(rating.toFixed(1));
  };

  const fetchFriends = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping friends fetch');
        return;
      }

      // Use FriendsService to get friends (deduplicated)
      const friendsList = await FriendsService.getFriends(targetUserId);
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

      console.log('🔍 ProfileView: Fetching artist follows count for user:', targetUserId);
      console.log('🔍 ProfileView: Current authenticated user:', user?.id);
      
      // Get artist follows count
      const artistFollowsCount = await UserAnalyticsService.getArtistFollowsCount(targetUserId);
      console.log('🔍 ProfileView: Artist follows count:', artistFollowsCount);
      
      // Also get detailed data for debugging and verification
      const followedArtists = await ArtistFollowService.getUserFollowedArtists(targetUserId);
      console.log('🔍 ProfileView: Followed artists array length:', followedArtists.length);
      console.log('🔍 ProfileView: Artist names:', followedArtists.map(a => a.artist_name));
      
      // Use the count from the service (which queries the database directly)
      // If there's a discrepancy, log it for debugging
      const finalCount = artistFollowsCount !== followedArtists.length 
        ? followedArtists.length  // Use actual array length if mismatch
        : artistFollowsCount;
      
      if (artistFollowsCount !== followedArtists.length) {
        console.warn(`⚠️ ProfileView: Count mismatch! Service count: ${artistFollowsCount}, Array length: ${followedArtists.length}. Using array length.`);
      }
      
      setFollowedArtistsCount(finalCount);
      console.log('🔍 ProfileView: Final artist follows count set to:', finalCount);

      // Also fetch venue follows count
      const { count: venueCount } = await supabase
        .from('user_venue_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', targetUserId);
      
      const venueFollowsCount = venueCount || 0;
      setFollowedVenuesCount(venueFollowsCount);
      console.log('🔍 ProfileView: Venue follows count set to:', venueFollowsCount);
    } catch (error) {
      console.error('Error fetching followed artists/venues count:', error);
      setFollowedArtistsCount(0);
      setFollowedVenuesCount(0);
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
      
      // Fetch reviews first
      const { data: reviewsData, error } = await supabase
        .from('reviews')
        .select(`
          id, 
          event_id, 
          rating, 
          review_text, 
          was_there, 
          is_public, 
          created_at, 
          updated_at
        `)
        .eq('user_id', targetUserId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching attended events:', error);
        setAttendedEvents([]);
        return;
      }

      if (!reviewsData || reviewsData.length === 0) {
        setAttendedEvents([]);
        return;
      }

      // Fetch events separately
      const eventIds = reviewsData.map((r: any) => r.event_id).filter(Boolean);
      const eventMap = new Map();
      
      if (eventIds.length > 0) {
        const { data: eventsData } = await supabase
          .from('events_with_artist_venue')
          .select('id, title, artist_name_normalized, venue_name_normalized, event_date, venue_city, venue_state, setlist')
          .in('id', eventIds);
        
        if (eventsData) {
          eventsData.forEach((event: any) => {
            eventMap.set(event.id, event);
          });
        }
      }

      // Map reviews with event data
      const data = reviewsData.map((review: any) => ({
        ...review,
        events: eventMap.get(review.event_id)
      }));

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

      // DIRECT DATABASE QUERY: Get all drafts directly from database
      // This bypasses any RPC function caching or issues
      const { data: allDraftsDirect, error: directError } = await supabase
        .from('reviews')
        .select('id, event_id, is_draft, draft_data, last_saved_at')
        .eq('user_id', targetUserId)
        .eq('is_draft', true);
      
      if (directError) {
        console.error('❌ ProfileView: Error fetching drafts directly:', directError);
      }
      
      console.log('🔍 ProfileView: All drafts from database (direct query):', allDraftsDirect?.length || 0);
      
      // Fetch draft reviews using the DraftReviewService (uses RPC function)
      const drafts = await DraftReviewService.getUserDrafts(targetUserId);
      
      console.log('🔍 ProfileView: Drafts from RPC function:', drafts?.length || 0);
      
      // CRITICAL: Filter out drafts that have published reviews
      // Get all published reviews with event data to match by artist/venue/date too
      // Use helper view to get normalized names for deduplication matching
      const { data: publishedReviews } = await supabase
        .from('reviews')
        .select(`
          event_id,
          event:events!inner(
            id,
            artist_id,
            venue_id,
            event_date
          )
        `)
        .eq('user_id', targetUserId)
        .eq('is_draft', false)
        .not('review_text', 'is', null)
        .neq('review_text', 'ATTENDANCE_ONLY');
      
      const publishedEventIds = new Set(
        (publishedReviews || [])
          .map((r: any) => r.event_id)
          .filter(Boolean)
      );
      
      // Get event names from helper view for deduplication (match by name, not ID, to handle duplicates)
      const publishedEventIdsList = Array.from(publishedEventIds);
      let publishedEventNames: Map<string, { artist_name: string; venue_name: string }> = new Map();
      if (publishedEventIdsList.length > 0) {
        const { data: eventNamesData } = await supabase
          .from('events_with_artist_venue')
          .select('id, artist_name_normalized, venue_name_normalized')
          .in('id', publishedEventIdsList);
        
        if (eventNamesData) {
          eventNamesData.forEach((event: any) => {
            publishedEventNames.set(event.id, {
              artist_name: event.artist_name_normalized || '',
              venue_name: event.venue_name_normalized || ''
            });
          });
        }
      }
      
      // Build a map of published reviews by artist/venue/date for matching
      // Use names for matching to handle duplicate artist/venue records correctly
      const publishedByConcert = new Map<string, any>();
      (publishedReviews || []).forEach((review: any) => {
        if (review.event) {
          const eventNames = publishedEventNames.get(review.event.id);
          const artistName = eventNames?.artist_name || '';
          const venueName = eventNames?.venue_name || '';
          // Use names for matching (normalized to lowercase for comparison)
          const key = `${artistName.toLowerCase().trim()}|${venueName.toLowerCase().trim()}|${review.event.event_date}`;
          publishedByConcert.set(key, review);
        }
      });
      
      console.log('🔍 ProfileView: Published review event IDs:', Array.from(publishedEventIds));
      console.log('🔍 ProfileView: Published reviews by concert:', publishedByConcert.size);
      
      // Helper function to normalize dates for comparison
      const normalizeDate = (dateStr: string) => {
        if (!dateStr) return null;
        try {
          const d = new Date(dateStr);
          return d.toISOString().split('T')[0]; // Just the date part
        } catch {
          return dateStr;
        }
      };
      
      // Step 1: Identify drafts that should be deleted (don't filter yet)
      const draftsToDelete: string[] = [];
      const draftsToKeep: typeof drafts = [];
      
      for (const draft of (drafts || [])) {
        if (!draft.event_id) {
          console.log('⚠️ ProfileView: Draft has no event_id:', draft.id);
          continue; // Skip drafts without event_id
        }
        
        let shouldDelete = false;
        let deleteReason = '';
        
        // Check by event_id first
        const hasPublishedReview = publishedEventIds.has(draft.event_id);
        if (hasPublishedReview) {
          shouldDelete = true;
          deleteReason = `published review exists for event ${draft.event_id}`;
        } else {
          // Also check by artist/venue/date (handles case where event_id changed)
          // Use names for matching to handle duplicate artist/venue records correctly
          const draftArtist = draft.artist_name || (draft.draft_data as any)?.selectedArtist?.name;
          const draftVenue = draft.venue_name || (draft.draft_data as any)?.selectedVenue?.name;
          const draftDate = draft.event_date || (draft.draft_data as any)?.eventDate;
          
          if (draftArtist && draftVenue && draftDate) {
            const normalizedDraftDate = normalizeDate(draftDate);
            // Normalize names to lowercase for comparison (same as publishedByConcert keys)
            const normalizedDraftArtist = draftArtist.toLowerCase().trim();
            const normalizedDraftVenue = draftVenue.toLowerCase().trim();
            
            // Check if any published review matches this concert
            for (const [key] of publishedByConcert.entries()) {
              const [pubArtist, pubVenue, pubDate] = key.split('|');
              const normalizedPubDate = normalizeDate(pubDate);
              
              if (pubArtist === normalizedDraftArtist && 
                  pubVenue === normalizedDraftVenue && 
                  normalizedPubDate === normalizedDraftDate) {
                shouldDelete = true;
                deleteReason = `published review exists for same concert (${draftArtist} at ${draftVenue})`;
                break;
              }
            }
          }
        }
        
        if (shouldDelete) {
          draftsToDelete.push(draft.id);
          console.log(`🚫 ProfileView: Marked draft ${draft.id} for deletion - ${deleteReason}`);
        } else {
          draftsToKeep.push(draft);
        }
      }
      
      // Step 2: Delete all identified drafts and await completion
      if (draftsToDelete.length > 0) {
        console.log(`🗑️ ProfileView: Deleting ${draftsToDelete.length} orphaned draft(s)...`);
        const deletePromises = draftsToDelete.map(async (draftId) => {
          try {
            const { error } = await supabase
              .from('reviews')
              .delete()
              .eq('id', draftId);
            if (error) {
              console.error(`❌ ProfileView: Failed to delete orphaned draft ${draftId}:`, error);
              return { success: false, draftId, error };
            } else {
              console.log(`✅ ProfileView: Successfully deleted orphaned draft ${draftId}`);
              return { success: true, draftId };
            }
          } catch (err) {
            console.error(`❌ ProfileView: Exception deleting orphaned draft ${draftId}:`, err);
            return { success: false, draftId, error: err };
          }
        });
        
        const deleteResults = await Promise.all(deletePromises);
        const successfulDeletions = deleteResults.filter(r => r.success).length;
        const failedDeletions = deleteResults.filter(r => !r.success);
        
        if (failedDeletions.length > 0) {
          console.error(`❌ ProfileView: Failed to delete ${failedDeletions.length} draft(s):`, failedDeletions);
          // Keep failed drafts in the UI so user can see them and potentially retry
          // Add them back to draftsToKeep
          const failedDraftIds = new Set(failedDeletions.map(r => r.draftId));
          const failedDrafts = (drafts || []).filter(d => failedDraftIds.has(d.id));
          draftsToKeep.push(...failedDrafts);
        }
        
        console.log(`✅ ProfileView: Deletion complete - ${successfulDeletions} successful, ${failedDeletions.length} failed`);
      }
      
      // Step 3: Use only the drafts we kept (deleted drafts are already excluded)
      const validDrafts = draftsToKeep;
      
      // Also check direct database drafts and filter/delete them (by event_id OR by artist/venue/date)
      if (allDraftsDirect) {
        for (const directDraft of allDraftsDirect) {
          let shouldDelete = false;
          
          // Check by event_id
          if (directDraft.event_id && publishedEventIds.has(directDraft.event_id)) {
            console.log(`🚫 ProfileView: Found orphaned draft ${directDraft.id} in database (same event_id) - deleting`);
            shouldDelete = true;
          }
          
          // Also check by artist/venue/date
          if (!shouldDelete && directDraft.draft_data) {
            const draftData = directDraft.draft_data as any;
            const draftArtist = draftData?.selectedArtist?.name;
            const draftVenue = draftData?.selectedVenue?.name;
            const draftDate = draftData?.eventDate;
            
            if (draftArtist && draftVenue && draftDate) {
              const normalizeDate = (dateStr: string) => {
                if (!dateStr) return null;
                try {
                  const d = new Date(dateStr);
                  return d.toISOString().split('T')[0];
                } catch {
                  return dateStr;
                }
              };
              
              const normalizedDraftDate = normalizeDate(draftDate);
              
              // Check if matches any published review
              for (const [key] of publishedByConcert.entries()) {
                const [pubArtist, pubVenue, pubDate] = key.split('|');
                const normalizedPubDate = normalizeDate(pubDate);
                
                if (pubArtist === draftArtist && 
                    pubVenue === draftVenue && 
                    normalizedPubDate === normalizedDraftDate) {
                  console.log(`🚫 ProfileView: Found orphaned draft ${directDraft.id} in database (same concert) - deleting`);
                  shouldDelete = true;
                  break;
                }
              }
            }
          }
          
          if (shouldDelete) {
            await supabase
              .from('reviews')
              .delete()
              .eq('id', directDraft.id);
          }
        }
      }
      
      console.log('🔍 ProfileView: Draft reviews data (final):', validDrafts);
      console.log('🔍 ProfileView: Total valid draft reviews (after filtering):', validDrafts?.length);
      
      setDraftReviews(validDrafts);
    } catch (error) {
      console.error('Error fetching draft reviews:', error);
      setDraftReviews([]);
    } finally {
      setDraftReviewsLoading(false);
    }
  };

  // Achievements moved to Passport tab

  const loadPassportSummary = async () => {
    try {
      if (sessionExpired || !user || !isViewingOwnProfile) {
        return;
      }
      const progress = await PassportService.getPassportProgress(targetUserId);
      setPassportProgress({
        cities: progress.cities.length,
        venues: progress.venues.length,
        artists: progress.artists.length,
        scenes: progress.scenes.length,
      });
    } catch (error) {
      console.error('Error loading passport summary:', error);
    }
  };

  const checkFriendStatus = async () => {
    try {
      if (sessionExpired || !user || isViewingOwnProfile) {
        return;
      }

      // Check if users are already friends (using user_relationships table)
      const { data: friendship, error: friendsError } = await supabase
        .from('user_relationships')
        .select('id, status')
        .eq('relationship_type', 'friend')
        .or(`and(user_id.eq.${currentUserId},related_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},related_user_id.eq.${currentUserId})`)
        .in('status', ['accepted'])
        .limit(1);

      if (friendsError) {
        console.warn('Warning: Could not check friendship status:', friendsError);
        return;
      }

      if (friendship && friendship.length > 0) {
        setFriendStatus('friends');
        return;
      }

      // Check for pending friend requests (sent by current user)
      const { data: sentRequest, error: sentError } = await supabase
        .from('user_relationships')
        .select('id')
        .eq('user_id', currentUserId)
        .eq('related_user_id', targetUserId)
        .eq('relationship_type', 'friend')
        .eq('status', 'pending')
        .limit(1);

      if (sentError) {
        console.warn('Warning: Could not check sent friend requests:', sentError);
        return;
      }

      if (sentRequest && sentRequest.length > 0) {
        setFriendStatus('pending_sent');
        setPendingRequestId(sentRequest[0].id);
        return;
      }

      // Check for pending friend requests (received by current user)
      const { data: receivedRequest, error: receivedError } = await supabase
        .from('user_relationships')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('related_user_id', currentUserId)
        .eq('relationship_type', 'friend')
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

      // Get the request ID first before updating status to ensure Cancel button works
      let requestId: string | null = null;
      if (data) {
        requestId = data;
      } else {
        // Fetch the request ID if not returned
        requestId = await FriendsService.getPendingRequestId(currentUserId, targetUserId);
      }
      
      // Set both state updates together after we have the request ID
      // This ensures the Cancel button is functional when the UI updates
      setPendingRequestId(requestId);
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

      console.log('Unfriending user:', friendUserId);
      
      // Use FriendsService to unfriend (which calls the RPC function)
      // No confirmation needed - quick unfriend as requested
      await FriendsService.unfriendUser(friendUserId);

      // Update local state - remove from friends list immediately
      setFriends(prevFriends => prevFriends.filter(friend => friend.user_id !== friendUserId));
      
      // If viewing their profile, update friend status
      if (targetUserId === friendUserId) {
        setFriendStatus('none');
      }
      
      // Refresh friends list to ensure it's up to date
      await fetchFriends();
      
      toast({
        title: "Friend Removed",
        description: "You are no longer friends with this person.",
      });
    } catch (error: any) {
      console.error('Error unfriending user:', error);
      // Don't show error if friendship doesn't exist (already unfriended)
      if (error?.message?.includes('Friendship does not exist')) {
        // Silently update UI since friendship is already gone
        setFriends(prevFriends => prevFriends.filter(friend => friend.user_id !== friendUserId));
        if (targetUserId === friendUserId) {
          setFriendStatus('none');
        }
        await fetchFriends();
        return;
      }
      
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

  const handleReviewSubmitted = async (review: any) => {
    // Close modal first
    setShowAddReview(false);
    setReviewModalEvent(null);
    
    // NUCLEAR: Delete ALL drafts for this event before refreshing
    if (review?.event_id) {
      try {
        console.log('🗑️ ProfileView: NUCLEAR deletion of drafts for event:', review.event_id);
        const { error } = await supabase
          .from('reviews')
          .delete()
          .eq('user_id', currentUserId)
          .eq('event_id', review.event_id)
          .eq('is_draft', true);
        
        if (error) {
          console.error('❌ ProfileView: Failed to delete drafts:', error);
        } else {
          console.log('✅ ProfileView: Deleted all drafts for event:', review.event_id);
        }
      } catch (error) {
        console.error('❌ ProfileView: Exception deleting drafts:', error);
      }
    }
    
    // Wait longer to ensure database operations complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Refresh reviews, attended events, and drafts after submission
    // The draft should now be converted to published, so it won't appear in drafts anymore
    await Promise.all([
      fetchReviews(),
      fetchAttendedEvents(),
      fetchDraftReviews()
    ]);
    
    toast({
      title: "Review Added",
      description: "Your concert review has been added!",
    });
  };

  const handleEditReview = (review: any) => {
    // Open edit with prefilled data for non-destructive updates
    // Normalize event_date to string format for consistent type handling
    let eventDate: string;
    if (review.event_date instanceof Date) {
      // Convert Date object to ISO string and extract date part
      eventDate = review.event_date.toISOString().split('T')[0];
    } else if (typeof review.event_date === 'string') {
      eventDate = review.event_date;
    } else {
      // Fallback to event.event_date or created_at
      eventDate = review.event?.event_date || review.created_at;
    }
    
    setReviewModalEvent({
      id: review.event_id,
      title: review.event?.event_name || 'Concert Review',
      venue_name: review.event?.venue_name || review.event?.location || 'Unknown Venue',
      event_date: eventDate,
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
        ticket_price_paid: review.ticket_price_paid,
        reaction_emoji: review.reaction_emoji,
        is_public: review.is_public,
        review_type: review.review_type,
        event_date: review.event_date || review.event?.event_date || review.created_at,
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
      // ACCESSIBILITY: Status colors converted to tokens with proper contrast
      // Note: These should include text labels, not just color
      case 'good': return ''; // Use status-success tokens with text label
      case 'okay': return ''; // Use status-warning tokens with text label  
      case 'bad': return ''; // Use status-error tokens with text label
      default: return ''; // Use inline styles for colors
    }
  };

  const getRatingIcon = (rating: 'good' | 'okay' | 'bad') => {
    switch (rating) {
      case 'good': return <ThumbsUp size={16} />;
      case 'okay': return <Minus size={16} />;
      case 'bad': return <ThumbsDown size={16} />;
      default: return null;
    }
  };

  // Session expiration is handled by MainApp, so we don't need to handle it here

  // Show loading screen while loading or if profile hasn't loaded yet
  if (loading || !profile) {
    return <SynthLoadingScreen text="Loading profile..." />;
  }

  // If loading is complete but no profile, show error (shouldn't happen with current logic)
  if (!profile) {
    console.log('❌ ProfileView: No profile data available after loading');
    console.log('❌ ProfileView: Loading state:', loading);
    console.log('❌ ProfileView: Current user ID:', currentUserId);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-bold mb-4" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-body-size, 20px)', fontWeight: 'var(--typography-body-weight, 500)', lineHeight: 'var(--typography-body-line-height, 1.5)' }}>Profile not found</h2>
          <p className="mb-4" style={{ color: 'var(--neutral-600)' }}>Unable to load profile data. Please try again.</p>
          <Button onClick={() => {
            // Use browser history navigation if available, otherwise use onBack prop
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              onBack();
            }
          }}>
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  console.log('✅ ProfileView: Rendering profile for:', profile.name);


  // setViewReviewOpen is defined by useState earlier

  return (
    <div 
      className="min-h-screen w-full max-w-[393px] mx-auto overflow-x-hidden" style={{ backgroundColor: 'var(--neutral-50)' }}
    >
      {/* Mobile Header with person's name */}
      {!hideHeader && (
        <div style={{ position: 'relative' }}>
          {!isViewingOwnProfile ? (
            <DropdownMenu>
              <MobileHeader 
                menuOpen={menuOpen} 
                onMenuClick={onMenuClick} 
                alignLeft={true}
                leftIcon={onNavigateToDiscover ? "left" : undefined}
                onLeftIconClick={onNavigateToDiscover ? onNavigateToDiscover : undefined}
                rightButton={
                  <DropdownMenuTrigger asChild>
                    <button
                      className="mobile-header__menu-button"
                      aria-label="More options"
                      type="button"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--neutral-900)' }}>
                        <circle cx="12" cy="12" r="1"/>
                        <circle cx="12" cy="5" r="1"/>
                        <circle cx="12" cy="19" r="1"/>
                      </svg>
                    </button>
                  </DropdownMenuTrigger>
                }
              >
                <h1 className="font-bold truncate" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-h2-size, 24px)', fontWeight: 'var(--typography-h2-weight, 700)', lineHeight: 'var(--typography-h2-line-height, 1.3)', color: 'var(--neutral-900)' }}>
                    {profile.username ? `@${profile.username}` : profile.name || 'Profile'}
                  </h1>
              </MobileHeader>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setBlockModalOpen(true)}>
                  <Ban size={16} className="mr-2" />
                  Block
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setReportModalOpen(true)}>
                  <Flag size={16} className="mr-2" />
                  Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <MobileHeader 
              menuOpen={menuOpen} 
              onMenuClick={onMenuClick} 
              alignLeft={true}
            >
              <h1 className="font-bold truncate" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-h2-size, 24px)', fontWeight: 'var(--typography-h2-weight, 700)', lineHeight: 'var(--typography-h2-line-height, 1.3)', color: 'var(--neutral-900)' }}>
                  {profile.username ? `@${profile.username}` : profile.name || 'Profile'}
                </h1>
            </MobileHeader>
          )}
        </div>
      )}
      <div className="w-full max-w-full overflow-x-hidden" style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', paddingTop: hideHeader ? `calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))` : `calc(env(safe-area-inset-top, 0px) + 68px + var(--spacing-small, 12px))`, paddingBottom: 'var(--spacing-bottom-nav, 32px)' }}>
        {/* Profile Header */}
        <div 
          className="mb-6 relative w-full max-w-full" 
          style={{ 
            padding: 'var(--spacing-grouped, 24px) 0',
            border: 'none'
          }}
        >
          {/* Main Profile Row */}
          <div className="flex flex-col items-start gap-4 mb-4 w-full max-w-full">
            {/* UserInfo with userProfile variant */}
            <div className="w-full flex justify-start">
              <div className="relative" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            <div className="relative">
                  <UserInfo
                    variant="userProfile"
                    name={profile.name}
                    username={isViewingOwnProfile ? (profile.username || undefined) : undefined}
                    initial={profile.name.charAt(0).toUpperCase()}
                    imageUrl={profile.avatar_url}
                    followers={friends.length}
                    following={followedArtistsCount + followedVenuesCount}
                    events={reviewsCount}
                    onFollowersClick={() => { setFollowersModalType('friends'); setShowFollowersModal(true); }}
                    onFollowingClick={() => setShowFollowingModal(true)}
                    customSubtitle={!isViewingOwnProfile && profile.last_active_at ? (
                      <Badge variant="secondary" className="flex items-center gap-1 bg-green-100 text-green-700 border-green-200" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)', width: 'fit-content' }}>
                        <Clock size={16} />
                        {UserVisibilityService.formatLastActive(profile.last_active_at)}
                      </Badge>
                    ) : undefined}
                  />
              {/* Online status indicator */}
              {!isViewingOwnProfile && profile.last_active_at && (
                    <div className="absolute bottom-0 left-0 w-6 h-6 rounded-full border-2" style={{ backgroundColor: 'var(--status-success-500)', borderColor: 'var(--neutral-50)' }}>
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--neutral-50)' }}></div>
                </div>
            </div>
              )}

            </div>
                {/* Verification Badge - positioned next to name */}
                  {profile.verified && profile.account_type && (
                  <div style={{ marginTop: '2px' }}>
                    <VerificationBadge
                      accountType={profile.account_type as AccountType}
                      verified={profile.verified}
                      size="lg"
                    />
                  </div>
                  )}
              </div>
                </div>
              
            {/* Profile Info */}
            <div className="w-full max-w-full">
              
              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 w-full max-w-full">
                {isViewingOwnProfile ? (
                  <>
                    <Button 
                      onClick={onEdit} 
                      variant="default" 
                      style={{ 
                        height: 'var(--size-button-height, 36px)',
                        paddingLeft: 'var(--spacing-small, 12px)',
                        paddingRight: 'var(--spacing-small, 12px)',
                        backgroundColor: 'var(--brand-pink-500)',
                        color: 'var(--neutral-50)',
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        boxShadow: '0 4px 4px 0 var(--shadow-color)',
                        border: 'none'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)';
                      }}
                    >
                      <Edit size={24} style={{ marginRight: 'var(--spacing-inline, 6px)', color: 'var(--neutral-50)' }} />
                      <span style={{ color: 'var(--neutral-50)' }}>Edit Profile</span>
                    </Button>
                    <Button 
                      onClick={onSettings} 
                      variant="secondary" 
                      size="icon"
                      style={{
                        width: '44px',
                        height: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'var(--neutral-50)',
                        border: '2px solid var(--neutral-200)',
                        color: 'var(--neutral-900)'
                      }}
                      aria-label="Profile settings"
                    >
                      <Settings size={24} style={{ color: 'var(--neutral-900)' }} />
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    {friendStatus === 'none' && (
                      <Button 
                        onClick={sendFriendRequest} 
                        variant="secondary" 
                        size="sm" 
                        ref={friendButtonRef}
                        style={{ 
                          height: 'var(--size-button-height, 36px)',
                          paddingLeft: 'var(--spacing-small, 12px)',
                          paddingRight: 'var(--spacing-small, 12px)',
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          borderColor: 'var(--neutral-200)',
                          borderWidth: '1px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--neutral-200)';
                          e.currentTarget.style.setProperty('color', 'var(--neutral-600)', 'important');
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--neutral-200)';
                          e.currentTarget.style.setProperty('color', 'var(--neutral-600)', 'important');
                        }}
                        aria-label="Send friend request"
                      >
                        Friend
                      </Button>
                    )}
                    {friendStatus === 'pending_sent' && (
                      <div className="flex items-center gap-2">
                        <Button disabled variant="outline" style={{
                          height: 'var(--size-button-height, 36px)',
                          paddingLeft: 'var(--spacing-small, 12px)',
                          paddingRight: 'var(--spacing-small, 12px)',
                          borderColor: 'var(--neutral-200)',
                          color: 'var(--neutral-600)',
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)'
                        }}>
                          Friend Request Sent
                        </Button>
                        <Button 
                          onClick={async () => {
                            if (!pendingRequestId) {
                              toast({
                                title: "Cannot Cancel",
                                description: "Request ID not available. Please refresh the page.",
                                variant: "destructive",
                              });
                              return;
                            }
                            
                            try {
                              await FriendsService.cancelFriendRequest(pendingRequestId);
                              setFriendStatus('none');
                              setPendingRequestId(null);
                              toast({
                                title: "Request Cancelled",
                                description: "Friend request has been cancelled.",
                              });
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Failed to cancel request.",
                                variant: "destructive",
                              });
                            }
                          }}
                          disabled={!pendingRequestId}
                          variant="outline" 
                          size="sm" 
                          className="disabled:opacity-50 disabled:cursor-not-allowed" style={{ borderColor: 'var(--neutral-200)', color: 'var(--neutral-600)' }}
                          title={!pendingRequestId ? "Request ID not available" : "Cancel friend request"}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                    {friendStatus === 'pending_received' && (
                      <Button 
                        disabled 
                        variant="outline" 
                        size="sm" 
                        style={{ 
                          borderColor: 'var(--info-blue-500)',
                          color: 'var(--info-blue-500)',
                          backgroundColor: 'var(--state-disabled-bg)',
                          cursor: 'not-allowed'
                        }}
                        aria-label="Friend request already sent"
                        aria-disabled="true"
                      >
                        Respond to Request
                      </Button>
                    )}
                    {friendStatus === 'friends' && (
                      <Button 
                        onClick={() => unfriendUser(targetUserId)} 
                        variant="default" 
                        size="sm"
                        style={{ 
                          height: 'var(--size-button-height, 36px)',
                          paddingLeft: 'var(--spacing-small, 12px)',
                          paddingRight: 'var(--spacing-small, 12px)',
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          boxShadow: '0 4px 4px 0 var(--shadow-color)'
                        }}
                        aria-label="Unfriend user"
                      >
                        Unfriend
                      </Button>
                    )}
                    {(friendStatus === 'none' || friendStatus === 'friends') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (onNavigateToChat) {
                            // Store that we came from profile so back button returns here
                            sessionStorage.setItem('chatFromProfile', 'true');
                            sessionStorage.setItem('chatFromProfileUserId', targetUserId || '');
                            onNavigateToChat(targetUserId);
                          }
                        }}
                        ref={messageButtonRef}
                        style={{ 
                          height: 'var(--size-button-height, 36px)',
                          paddingLeft: 'var(--spacing-small, 12px)',
                          paddingRight: 'var(--spacing-small, 12px)',
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          marginLeft: '6px',
                          borderColor: 'var(--neutral-200)',
                          borderWidth: '1px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--neutral-200)';
                          e.currentTarget.style.setProperty('color', 'var(--neutral-600)', 'important');
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--neutral-200)';
                          e.currentTarget.style.setProperty('color', 'var(--neutral-600)', 'important');
                        }}
                        aria-label="Message user"
                      >
                        Message
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Bio and Links */}
          <div style={{ paddingTop: 'var(--spacing-grouped, 24px)' }}>
            {profile.bio && (
              <div className="mb-4">
                <p className="leading-relaxed" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)', color: 'var(--neutral-600)' }}>{profile.bio}</p>
              </div>
            )}

            {/* Social Media Links and Streaming Stats */}
            <div className="flex flex-wrap gap-3">
              {profile.instagram_handle && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`https://instagram.com/${profile.instagram_handle}`, '_blank')}
                  style={{
                    borderColor: 'var(--neutral-200)',
                    color: 'var(--neutral-900)'
                  }}
                >
                  <Instagram size={16} className="mr-2" />
                  @{profile.instagram_handle}
                </Button>
              )}
              
              {/* Show streaming profile link only if viewing someone else's profile */}
              {!isViewingOwnProfile && profile.music_streaming_profile && (() => {
                const serviceType = detectStreamingServiceType(profile.music_streaming_profile);
                const isSpotify = serviceType === 'spotify';
                const isAppleMusic = serviceType === 'apple-music';
                
                let href = profile.music_streaming_profile;
                let displayText = profile.music_streaming_profile;
                
                if (isSpotify) {
                  href = profile.music_streaming_profile.startsWith('http') 
                    ? profile.music_streaming_profile 
                    : `https://open.spotify.com/user/${profile.music_streaming_profile}`;
                  displayText = 'Spotify Profile';
                } else if (isAppleMusic) {
                  href = profile.music_streaming_profile.startsWith('http') 
                    ? profile.music_streaming_profile 
                    : profile.music_streaming_profile;
                  displayText = 'Apple Music Profile';
                }
                
                return (
                  <Button
                    variant="outline"
                    onClick={() => window.open(href, '_blank')}
                    style={{
                      height: 'var(--size-button-height, 36px)',
                      paddingLeft: 'var(--spacing-small, 12px)',
                      paddingRight: 'var(--spacing-small, 12px)',
                      borderColor: 'var(--neutral-200)',
                      color: 'var(--neutral-900)',
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)'
                    }}
                  >
                    <Music size={16} style={{ marginRight: 'var(--spacing-inline, 6px)' }} />
                    {displayText}
                  </Button>
                );
              })()}
            </div>
            <div
              aria-hidden="true"
              style={{
                height: '1px',
                backgroundColor: 'var(--neutral-200)',
                width: '100%',
                marginTop: 'var(--spacing-grouped, 24px)'
              }}
            />
          </div>
        </div>

        {/* Drafts summary card – visible only on own profile when drafts exist */}
        {isViewingOwnProfile && !draftReviewsLoading && Array.isArray(draftReviews) && draftReviews.length > 0 && (
          <div className="mb-6">
            <ProfileDraftsSummary
              draftCount={draftReviews.length}
              onClick={() => setRankingMode('unreviewed')}
            />
          </div>
        )}

        {/* Instagram-style Content Tabs */}
        <Tabs value={activeTab} onValueChange={(tab) => {
          // Track profile tab switch
          try {
            trackInteraction.click('profile', `profile_tab_${tab}`, { 
              tab,
              is_own_profile: isViewingOwnProfile,
              profile_user_id: targetUserId
            }, targetUserId);
          } catch (error) {
            console.error('Error tracking profile tab switch:', error);
          }
          setActiveTab(tab);
        }} className="w-full">
          <TabsList className={`glass-card inner-glow grid w-full max-w-full mb-4 p-1 floating-shadow overflow-x-hidden ${canViewInterested ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="my-events" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Events
            </TabsTrigger>
            {canViewInterested && (
              <TabsTrigger value="interested" className="flex items-center gap-2">
                <Heart size={16} />
                Interested
              </TabsTrigger>
            )}
            <TabsTrigger value="passport" className="flex items-center gap-2">
              <Sparkles size={16} />
              Passport
            </TabsTrigger>
          </TabsList>


          {/* My Events Tab - Show attended events with review/ranking toggle */}
          <TabsContent value="my-events" className="mt-4 mb-32 w-full max-w-full overflow-x-hidden">
            <div className="flex flex-col gap-3 mb-4 p-2 w-full max-w-full">
              <h3 className="gradient-text font-semibold" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-body-size, 20px)', fontWeight: 'var(--typography-body-weight, 500)', lineHeight: 'var(--typography-body-line-height, 1.5)' }}>
                {isViewingOwnProfile ? 'My Events' : `${profile?.name || 'User'}'s Events`}
              </h3>
              {isViewingOwnProfile && (
                <div className="flex flex-col gap-2 w-full max-w-full">
                  <span style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)', color: 'var(--neutral-600)' }}>View mode:</span>
                  <div
                    className="flex w-full max-w-full overflow-x-auto"
                    style={{
                      padding: 'var(--spacing-inline, 6px)',
                      gap: 'var(--spacing-inline, 6px)',
                      borderRadius: 'var(--radius-corner, 10px)',
                      backgroundColor: 'var(--neutral-100)',
                      border: '1px solid var(--neutral-200)'
                    }}
                  >
                    <button
                      onClick={() => setRankingMode(false)}
                      className="transition-colors"
                      style={{
                        paddingLeft: 'var(--spacing-small, 12px)',
                        paddingRight: 'var(--spacing-small, 12px)',
                        height: 'var(--size-button-height, 36px)',
                        borderRadius: 'var(--radius-corner, 10px)',
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        backgroundColor: !rankingMode ? 'var(--neutral-50)' : 'transparent',
                        color: !rankingMode ? 'var(--neutral-900)' : 'var(--neutral-600)'
                      }}
                    >
                      Reviews
                    </button>
                    <button
                      onClick={() => setRankingMode(true)}
                      className="transition-colors"
                      style={{ 
                        paddingLeft: 'var(--spacing-small, 12px)',
                        paddingRight: 'var(--spacing-small, 12px)',
                        height: 'var(--size-button-height, 36px)',
                        borderRadius: 'var(--radius-corner, 10px)',
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        backgroundColor: rankingMode ? 'var(--neutral-50)' : 'transparent',
                        color: rankingMode ? 'var(--neutral-900)' : 'var(--neutral-600)'
                      }}
                    >
                      Rankings
                    </button>
                    <button
                      onClick={() => setRankingMode('unreviewed')}
                      className="transition-colors"
                      style={{ 
                        paddingLeft: 'var(--spacing-small, 12px)',
                        paddingRight: 'var(--spacing-small, 12px)',
                        height: 'var(--size-button-height, 36px)',
                        borderRadius: 'var(--radius-corner, 10px)',
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        backgroundColor: rankingMode === 'unreviewed' ? 'var(--neutral-50)' : 'transparent',
                        color: rankingMode === 'unreviewed' ? 'var(--neutral-900)' : 'var(--neutral-600)'
                      }}
                    >
                      Unreviewed
                    </button>
                  </div>
                </div>
              )}
            </div>

            {rankingMode === false && (
              reviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12" style={{ borderRadius: 'var(--radius-corner, 10px)', backgroundColor: 'var(--neutral-50)', gap: 'var(--spacing-inline, 6px)' }}>
                  {/* Large icon (60px), dark grey */}
                  <Calendar className="w-[60px] h-[60px] mx-auto" style={{ color: 'var(--neutral-600)' }} />
                  {/* Heading - Body typography, off black */}
                  <h3 style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-body-size, 20px)',
                    fontWeight: 'var(--typography-body-weight, 500)',
                    lineHeight: 'var(--typography-body-line-height, 1.5)',
                    color: 'var(--neutral-900)',
                    margin: 0,
                    textAlign: 'center'
                  }}>No Posts Yet</h3>
                  {/* Description - Meta typography, dark grey - only visible on own profile */}
                  {isViewingOwnProfile && (
                    <p style={{ 
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)',
                      margin: 0,
                      textAlign: 'center'
                    }}>Start attending events and writing reviews to build your profile!</p>
                  )}
                </div>
              ) : (
                <ProfileStarBuckets
                  reviews={reviews}
                  onSelectReview={(review) => {
                    setSelectedReview(review as any);
                    setViewReviewOpen(true);
                  }}
                />
              )
            )}

            {rankingMode === true && isViewingOwnProfile && (
              reviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12" style={{ borderRadius: 'var(--radius-corner, 10px)', backgroundColor: 'var(--neutral-50)', gap: 'var(--spacing-inline, 6px)' }}>
                  {/* Large icon (60px), dark grey */}
                  <Calendar className="w-[60px] h-[60px] mx-auto" style={{ color: 'var(--neutral-600)' }} />
                  {/* Heading - Body typography, off black */}
                  <h3 style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-body-size, 20px)',
                    fontWeight: 'var(--typography-body-weight, 500)',
                    lineHeight: 'var(--typography-body-line-height, 1.5)',
                    color: 'var(--neutral-900)',
                    margin: 0,
                    textAlign: 'center'
                  }}>No Posts Yet</h3>
                  {/* Description - Meta typography, dark grey - only visible on own profile */}
                  <p style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-600)',
                    margin: 0,
                    textAlign: 'center'
                  }}>Start attending events and writing reviews to build your profile!</p>
                </div>
              ) : (
              <div className="space-y-6">
                {(() => {
                  // Get all unique ratings from reviews
                  // Use review.rating directly (already calculated as average of 5 categories by database trigger)
                  // Round to 1 decimal for consistent grouping
                  const uniqueRatings = Array.from(new Set(
                    reviews
                      .filter(r => (r as any).review_text !== 'ATTENDANCE_ONLY')
                      .map(r => {
                        const rating = getDisplayRating(r);
                        // Round to 1 decimal for consistent grouping (database stores as NUMERIC(3,1))
                        return Math.round(rating * 10) / 10;
                      })
                  )).sort((a, b) => b - a); // Sort descending
                  
                  return uniqueRatings.map(ratingGroup => {
                    // Group reviews by rating (rounded to 1 decimal for comparison)
                    const group = reviews.filter(r => {
                      if ((r as any).review_text === 'ATTENDANCE_ONLY') return false;
                      const displayRating = getDisplayRating(r);
                      const roundedRating = Math.round(displayRating * 10) / 10;
                      // Compare rounded ratings for consistent grouping
                      return Math.abs(roundedRating - ratingGroup) < 0.01;
                    });
                    if (group.length === 0) return null as any;
                    return (
                      <div key={ratingGroup}>
                        <div className="font-semibold mb-2" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)', color: 'var(--neutral-600)' }}>{ratingGroup.toFixed(1)}★</div>
                      <div 
                        className="divide-y" 
                        style={{ 
                          backgroundColor: 'var(--neutral-50)',
                          border: '1px solid var(--neutral-200)',
                          borderRadius: 'var(--radius-corner, 10px)',
                          padding: 'var(--spacing-small, 12px)',
                          boxShadow: '0 2px 4px 0 var(--shadow-color)'
                        }}
                      >
                        {group
                          .sort((a, b) => {
                            const ao = (a as any).rank_order ?? 9999;
                            const bo = (b as any).rank_order ?? 9999;
                            if (ao !== bo) return ao - bo;
                            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                          })
                          .map((item, idx) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between px-3 py-2 cursor-pointer"
                            style={{
                              borderBottom: idx < group.length - 1 ? '1px solid var(--neutral-200)' : 'none'
                            }}
                            onClick={() => { setSelectedReview(item as any); setViewReviewOpen(true); }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--neutral-100)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-6 w-6 rounded-full flex items-center justify-center border" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)', backgroundColor: 'var(--neutral-50)' }}>{idx + 1}</div>
                              <div>
                                <div className="font-medium" style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>{item.event.event_name}</div>
                                <div style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)', color: 'var(--neutral-600)' }}>
                                  {(() => {
                                    // event_date might be Date or string, event.event_date is string
                                    const dateToShow = (item.event_date instanceof Date ? item.event_date : (item.event_date ? new Date(item.event_date) : null))
                                      || (item.event.event_date ? new Date(item.event.event_date) : null);
                                    return dateToShow ? dateToShow.toLocaleDateString() : '';
                                  })()}
                                </div>
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
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  });
                })()}
              </div>
              )
            )}
            
            {rankingMode === 'unreviewed' && isViewingOwnProfile && (
              <div className="space-y-4">
                {(attendedEventsLoading || draftReviewsLoading) ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                    <p style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)'
                    }}>Loading unreviewed events and drafts...</p>
                  </div>
                ) : (
                  (() => {
                    // Filter for events that were attended but not reviewed
                    const unreviewedEvents = attendedEvents.filter(attendance => {
                      const isAttendanceOnly = attendance.review_text === 'ATTENDANCE_ONLY'; // Special marker for attendance-only records
                      return isAttendanceOnly;
                    });

                    // Get event IDs that have completed reviews (not drafts)
                    // A completed review is one that is not a draft and has actual review content
                    const completedReviewEventIds = new Set(
                      reviews
                        .filter((review: any) => {
                          const isDraft = review.is_draft === true;
                          const isAttendanceOnly = review.review_text === 'ATTENDANCE_ONLY';
                          const hasContent = review.review_text && review.review_text.trim().length > 0;
                          // Completed review: not a draft, has content, not just attendance marker
                          return !isDraft && hasContent && !isAttendanceOnly;
                        })
                        .map((review: any) => review.event_id)
                        .filter(Boolean)
                    );

                    // Filter out drafts for events that already have completed reviews
                    const validDrafts = draftReviews.filter(draft => {
                      const eventId = draft.event_id;
                      if (!eventId) return false; // Skip drafts without event_id
                      return !completedReviewEventIds.has(eventId);
                    });

                    // Combine unreviewed events and draft reviews
                    const allUnreviewedItems = [
                      ...unreviewedEvents.map(event => ({ type: 'unreviewed', data: event })),
                      ...validDrafts.map(draft => ({ type: 'draft', data: draft }))
                    ];

                    if (allUnreviewedItems.length === 0) {
                      return (
                        <div className="text-center py-12">
                          <Calendar className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--neutral-200)' }} aria-hidden="true" />
                          <h3 style={{
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-body-size, 20px)',
                            fontWeight: 'var(--typography-body-weight, 500)',
                            lineHeight: 'var(--typography-body-line-height, 1.5)',
                            color: 'var(--neutral-900)',
                            marginBottom: 'var(--spacing-small, 12px)'
                          }}>All Caught Up!</h3>
                          <p className="mb-4" style={{ color: 'var(--neutral-600)' }}>
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
                              <Card 
                                key={`unreviewed-${attendance.id}`} 
                                className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" 
                                onClick={() => {
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
                                  handleOpenEvent(completeEvent);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    const eventData = event.jambase_event || event;
                                    const completeEvent = {
                                      ...eventData,
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
                                    handleOpenEvent(completeEvent);
                                  }
                                }}
                                tabIndex={0}
                                role="button"
                                aria-label={`Review event: ${event.title || 'Event'}`}
                              >
                                <CardContent className="p-6">
                                  <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                      <h4 className="text-lg font-semibold mb-2" style={{ color: 'var(--neutral-900)' }}>
                                        {event.title}
                                      </h4>
                                      <div className="flex items-center gap-4 text-sm mb-3" style={{ color: 'var(--neutral-600)' }}>
                                        <div className="flex items-center gap-1">
                                          <Music className="w-4 h-4" />
                                          <span>{event.artist_name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <MapPin className="w-4 h-4" />
                                          <span>{event.venue_name}</span>
                                          {event.venue_city && (
                                            <span style={{ color: 'var(--neutral-400)' }}>• {event.venue_city}, {event.venue_state}</span>
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
                                    <span className="text-xs" style={{ color: 'var(--neutral-600)' }}>
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
                                          handleOpenEvent(completeEvent);
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
                              <Card 
                                key={`draft-${draft.id}`} 
                                className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" 
                                onClick={() => {
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
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
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
                                  }
                                }}
                                tabIndex={0}
                                role="button"
                                aria-label={`Edit draft review: ${draft.event_title || 'Draft Review'}`}
                              >
                                <CardContent className="p-6">
                                  <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                      <h4 className="text-lg font-semibold mb-2" style={{ color: 'var(--neutral-900)' }}>
                                        {draft.event_title || 'Draft Review'}
                                      </h4>
                                      <div className="flex items-center gap-4 text-sm mb-3" style={{ color: 'var(--neutral-600)' }}>
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
                                      <Badge variant="outline" style={{ color: 'var(--info-blue-500)', borderColor: 'var(--info-blue-500)' }}>
                                        <Edit className="w-3 h-3 mr-1" />
                                        Draft
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <span className="text-xs" style={{ color: 'var(--neutral-600)' }}>
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
                                        className=""
                                        style={{ backgroundColor: 'var(--info-blue-500)', color: 'var(--neutral-50)' }}
                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--info-blue-500)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--info-blue-500)'; }}
                                      >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Continue Draft
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
                                            try {
                                              const success = await DraftReviewService.deleteDraft(draft.id, currentUserId);
                                              if (success) {
                                                // Reload drafts to refresh the list
                                                const updatedDrafts = await DraftReviewService.getUserDrafts(currentUserId);
                                                setDraftReviews(updatedDrafts || []);
                                                toast({
                                                  title: "Draft Deleted",
                                                  description: "The draft has been deleted successfully.",
                                                });
                                              } else {
                                                toast({
                                                  title: "Error",
                                                  description: "Failed to delete draft. Please try again.",
                                                  variant: "destructive",
                                                });
                                              }
                                            } catch (error) {
                                              console.error('Error deleting draft:', error);
                                              toast({
                                                title: "Error",
                                                description: "Failed to delete draft. Please try again.",
                                                variant: "destructive",
                                              });
                                            }
                                          }
                                        }}
                                        className="border"
                                        style={{ 
                                          color: 'var(--status-error-500)', 
                                          borderColor: 'var(--status-error-500)'
                                        }}
                                        onMouseEnter={(e) => { 
                                          e.currentTarget.style.backgroundColor = 'var(--status-error-050)';
                                          e.currentTarget.style.color = 'var(--status-error-500)';
                                        }}
                                        onMouseLeave={(e) => { 
                                          e.currentTarget.style.backgroundColor = 'transparent';
                                          e.currentTarget.style.color = 'var(--status-error-500)';
                                        }}
                                      >
                                        <Trash2 className="w-4 h-4" />
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
            
          </TabsContent>

            {canViewInterested && (
            <TabsContent value="interested" className="mt-4 w-full max-w-full overflow-x-hidden">
              {/* Toggle between Upcoming and Past */}
              {userEvents.length > 0 && (
                <div className="flex justify-center mb-4 w-full max-w-full">
                  <div className="p-1 flex w-full max-w-full" style={{ borderRadius: 'var(--radius-corner, 10px)', backgroundColor: 'var(--neutral-50)' }}>
                    <button
                      onClick={() => setShowPastEvents(false)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        !showPastEvents
                          ? 'shadow-sm' 
                          : ''
                      }`}
                    >
                      Upcoming
                    </button>
                    <button
                      onClick={() => setShowPastEvents(true)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        showPastEvents
                          ? 'shadow-sm' 
                          : ''
                      }`}
                    >
                      Past
                    </button>
                  </div>
                </div>
              )}

              {userEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12" style={{ borderRadius: 'var(--radius-corner, 10px)', backgroundColor: 'var(--neutral-50)', gap: 'var(--spacing-inline, 6px)' }}>
                  {/* Large icon (60px), dark grey */}
                  <Heart className="w-[60px] h-[60px] mx-auto" style={{ color: 'var(--neutral-600)' }} />
                  {/* Heading - Body typography, off black */}
                  <h3 style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-body-size, 20px)',
                    fontWeight: 'var(--typography-body-weight, 500)',
                    lineHeight: 'var(--typography-body-line-height, 1.5)',
                    color: 'var(--neutral-900)',
                    margin: 0,
                    textAlign: 'center'
                  }}>No Interested Events Yet</h3>
                  {/* Description - Meta typography, dark grey - only visible on own profile */}
                  {isViewingOwnProfile && (
                    <p style={{ 
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)',
                      margin: 0,
                      textAlign: 'center'
                    }}>Tap the heart on events to add them here.</p>
                  )}
                </div>
              ) : filteredUserEvents.length === 0 ? (
                <div className="text-center py-12" style={{ borderRadius: 'var(--radius-corner, 10px)', backgroundColor: 'var(--neutral-100)' }}>
                  <Heart className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--neutral-400)' }} />
                  <h3 style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-body-size, 20px)',
                    fontWeight: 'var(--typography-body-weight, 500)',
                    lineHeight: 'var(--typography-body-line-height, 1.5)',
                    color: 'var(--neutral-900)'
                  }}>
                    {showPastEvents ? 'No Past Events' : 'No Upcoming Events'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {showPastEvents 
                      ? 'You haven\'t marked any past events as interested.' 
                      : 'You don\'t have any upcoming events marked as interested.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 w-full max-w-full">
                  {filteredUserEvents
                    .sort((a,b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
                    .slice(0, 9)
                    .map((ev) => (
                      <div
                        key={ev.id}
                        className={`aspect-square cursor-pointer rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200 relative ${
                          showPastEvents ? 'opacity-75' : ''
                        }`}
                        style={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.85)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          border: '1px solid rgba(255, 255, 255, 0.5)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)';
                        }}
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
                            setlist_song_count: (ev as any).setlist_song_count || null,
                            setlist_fm_url: (ev as any).setlist_fm_url || null
                          };
                          
                          console.log('ProfileView: Complete event data for modal from interested events:', {
                            originalEvent: ev,
                            completeEvent,
                            artist_name: completeEvent.artist_name,
                            venue_name: completeEvent.venue_name,
                            venue_city: completeEvent.venue_city,
                            venue_state: completeEvent.venue_state
                          });
                          
                          handleOpenEvent(completeEvent);
                        }}
                      >
                        <div className="h-full flex flex-col">
                          <div className="h-2/3 w-full relative overflow-hidden bg-gradient-to-br from-pink-400 to-pink-600 rounded-t-xl">
                            {/* Event image - use same resolution logic as home feed (PreferencesV4FeedSection) */}
                            {(() => {
                              // Resolve image URL with same priority as PreferencesV4FeedSection
                              const evAny = ev as any;
                              let imageUrl: string | undefined = undefined;
                              
                              // First priority: poster_image_url (same as PreferencesV4FeedSection)
                              if (evAny?.poster_image_url) {
                                imageUrl = replaceJambasePlaceholder(evAny.poster_image_url);
                              } 
                              // Second priority: images JSONB array (same logic as PreferencesV4FeedSection)
                              else if (evAny?.images && Array.isArray(evAny.images) && evAny.images.length > 0) {
                                const bestImage = evAny.images.find((img: any) => 
                                  img?.url && (img?.ratio === '16_9' || (img?.width && img.width > 1000))
                                ) || evAny.images.find((img: any) => img?.url);
                                imageUrl = bestImage?.url ? replaceJambasePlaceholder(bestImage.url) : undefined;
                              }
                              // Third priority: media_urls array (fallback)
                              else if (evAny?.media_urls && Array.isArray(evAny.media_urls) && evAny.media_urls.length > 0) {
                                imageUrl = evAny.media_urls[0];
                              }
                              // Fourth priority: event_media_url (fallback)
                              else if (evAny?.event_media_url) {
                                imageUrl = evAny.event_media_url;
                              }
                              
                              if (imageUrl) {
                                return (
                                  <img
                                    src={imageUrl}
                                    alt={ev.title}
                                    className="w-full h-full object-cover"
                                  />
                                );
                              }
                              
                              // Fallback to gradient with heart icon if no image
                              return (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Heart className="w-1/3 h-1/3 text-white" />
                                </div>
                              );
                            })()}
                            
                            {/* Interested badge - only show for upcoming events */}
                            {!showPastEvents && (
                              <div 
                                className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md font-semibold text-[10px] leading-tight uppercase tracking-wide"
                                style={{ 
                                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                                  backdropFilter: 'blur(10px)',
                                  WebkitBackdropFilter: 'blur(10px)',
                                  color: 'rgba(255, 255, 255, 0.95)',
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                                }}
                              >
                                Interested
                              </div>
                            )}
                            {/* Past badge - only show for archive events */}
                            {showPastEvents && (
                              <div 
                                className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md font-semibold text-[10px] leading-tight uppercase tracking-wide"
                                style={{ 
                                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                                  backdropFilter: 'blur(10px)',
                                  WebkitBackdropFilter: 'blur(10px)',
                                  color: 'rgba(255, 255, 255, 0.95)',
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                                }}
                              >
                                Past
                              </div>
                            )}
                          </div>
                          <div className="px-2.5 pt-2.5 pb-2.5 flex-1 flex flex-col justify-between min-h-0">
                            <div className="min-w-0 flex-shrink">
                              <h4 
                                className="font-semibold truncate mb-0.5 leading-tight"
                                style={{ 
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-family)',
                                  color: 'var(--neutral-900)'
                                }}
                              >
                                {ev.title}
                              </h4>
                              <p 
                                className="truncate leading-tight"
                                style={{ 
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-family)',
                                  color: 'var(--neutral-600)',
                                  marginTop: '2px'
                                }}
                              >
                                {ev.venue_name}
                              </p>
                            </div>
                            <div className="mt-1.5 pt-1.5 border-t border-solid" style={{ borderColor: 'rgba(0, 0, 0, 0.08)' }}>
                              <div 
                                className="font-medium leading-tight mb-0.5"
                                style={{ 
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-family)',
                                  color: 'var(--neutral-900)'
                                }}
                              >
                                {new Date(ev.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </div>
                              {[ev.venue_city, ev.venue_state].filter(Boolean).length > 0 && (
                                <p 
                                  className="truncate leading-tight"
                                  style={{ 
                                    fontSize: '10px',
                                    fontFamily: 'var(--font-family)',
                                    color: 'var(--neutral-600)'
                                  }}
                                >
                                  {[ev.venue_city, ev.venue_state].filter(Boolean).join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>
          )}

          

          {/* 🎫 Passport Tab */}
          <TabsContent value="passport" className="mt-4 mb-32 w-full max-w-full overflow-x-hidden">
            {targetUserId ? (
              <PassportModal
                isOpen={true}
                onClose={() => setActiveTab('my-events')}
                userId={targetUserId}
                userName={profile?.name || undefined}
                inline={true}
                isOwnProfile={isViewingOwnProfile}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Unable to load passport. User ID is missing.</p>
              </div>
            )}
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
          <DialogContent
            className="fixed inset-0 z-[100] max-w-none w-full h-full m-0 p-0 overflow-hidden rounded-none"
            style={{
              left: 0,
              top: 0,
              transform: 'none',
              width: '100vw',
              height: '100vh',
              maxWidth: '100vw',
              maxHeight: '100vh',
              borderRadius: 0,
              border: 'none',
              boxShadow: 'none',
              backgroundColor: 'var(--neutral-50)',
            }}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Review Details</DialogTitle>
              <DialogDescription>Detailed view of a review</DialogDescription>
            </DialogHeader>

            <ReviewDetailView
              reviewId={selectedReview.id}
              currentUserId={currentUserId}
              onBack={() => setViewReviewOpen(false)}
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
              onOpenProfile={(userId) => {
                const event = new CustomEvent('open-user-profile', { detail: { userId } });
                window.dispatchEvent(event);
                setViewReviewOpen(false);
              }}
              onOpenArtist={(artistId, artistName) => {
                if (artistName) {
                  navigate(`/artist/${encodeURIComponent(artistName)}`);
                  setViewReviewOpen(false);
                }
              }}
              onOpenVenue={(venueId, venueName) => {
                if (venueName) {
                  navigate(`/venue/${encodeURIComponent(venueName)}`);
                  setViewReviewOpen(false);
                }
              }}
            />
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

      {/* Following Modal - shows artists and venues */}
      {profile && (
        <FollowingModal
          isOpen={showFollowingModal}
          onClose={() => setShowFollowingModal(false)}
          userId={targetUserId}
          profileName={profile.name}
          isOwnProfile={isViewingOwnProfile}
          onNavigateToProfile={onNavigateToProfile}
        />
      )}

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
        isInterested={selectedEventInterested}
        onInterestToggle={async (eventId, interested) => {
          console.log('🎯 Interest toggled in profile view:', eventId, interested);
          try {
            // Use setEventInterest for consistency (handles both add and remove)
            await UserEventService.setEventInterest(currentUserId, eventId, interested);
            // Update local state
            setSelectedEventInterested(interested);
            // Close the modal if removing interest
            if (!interested) {
              setDetailsOpen(false);
            }
            // Refetch user events to update the UI
            await fetchUserEvents();
            toast({
              title: interested ? "Interest Added" : "Interest Removed",
              description: interested 
                ? "You're now interested in this event"
                : "You've removed this event from your interested list"
            });
          } catch (error) {
            console.error('Error toggling event interest:', error);
            toast({
              title: "Error",
              description: "Failed to update interest",
              variant: "destructive"
            });
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
