import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, Edit, Heart, MapPin, Calendar, Instagram, ExternalLink, Settings, Music, Plus, ThumbsUp, ThumbsDown, Minus, Star, Grid, BarChart3, Clock } from 'lucide-react';
import { FollowersModal } from './FollowersModal';
import { PostsGrid } from './PostsGrid';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { JamBaseService } from '@/services/jambaseService';
import { EventReviewModal } from '../reviews/EventReviewModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProfileReviewCard } from '../reviews/ProfileReviewCard';
import type { Artist } from '@/types/concertSearch';
import { ReviewService } from '@/services/reviewService';
import { UserEventService } from '@/services/userEventService';
import { DraftReviewService } from '@/services/draftReviewService';
import { getEventStatus, isEventPast, getPastEvents, getUpcomingEvents } from '@/utils/eventStatusUtils';
import { ReviewCard } from '../reviews/ReviewCard';
import { UnifiedStreamingStats, detectStreamingServiceType } from '../streaming/UnifiedStreamingStats';
import { JamBaseEventCard } from '@/components/events/JamBaseEventCard';
import { EventDetailsModal } from '../events/EventDetailsModal';
import { MusicTasteCard } from './MusicTasteCard';
import { HolisticStatsCard } from './HolisticStatsCard';
import { SynthSLogo } from '@/components/SynthSLogo';
import { SkeletonProfileCard } from '@/components/skeleton/SkeletonProfileCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ArtistFollowService } from '@/services/artistFollowService';
import { useNavigate } from 'react-router-dom';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { WorkingConnectionBadge } from '../WorkingConnectionBadge';

interface ProfileViewProps {
  currentUserId: string;
  profileUserId?: string; // Optional: if provided, show this user's profile instead of current user
  onBack: () => void;
  onEdit: () => void;
  onSettings: () => void;
  onSignOut?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
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
}

// Use JamBaseEvent type directly instead of custom UserEvent interface
import type { JamBaseEvent } from '@/services/jambaseService';

interface ConcertReview {
  id: string;
  user_id: string;
  event_id: string;
  rating: 'good' | 'okay' | 'bad';
  review_text: string | null;
  is_public: boolean;
  created_at: string;
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

export const ProfileView = ({ currentUserId, profileUserId, onBack, onEdit, onSettings, onSignOut, onNavigateToProfile, onNavigateToChat }: ProfileViewProps) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEvents, setUserEvents] = useState<JamBaseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [showAddReview, setShowAddReview] = useState(false);
  const [reviews, setReviews] = useState<ConcertReview[]>([]);
  const [reviewModalEvent, setReviewModalEvent] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('my-events');
  const [rankingMode, setRankingMode] = useState<boolean | 'unreviewed'>(false);
  const [attendedEvents, setAttendedEvents] = useState<any[]>([]);
  const [attendedEventsLoading, setAttendedEventsLoading] = useState(false);
  const [draftReviews, setDraftReviews] = useState<any[]>([]);
  const [draftReviewsLoading, setDraftReviewsLoading] = useState(false);
  const [canViewInterested, setCanViewInterested] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [viewReviewOpen, setViewReviewOpen] = useState(false); // Only declare once
  const [selectedReview, setSelectedReview] = useState<any>(null);
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
        console.log('🔍 ProfileView: About to fetch friends...');
        await fetchFriends();
        console.log('🔍 ProfileView: About to fetch attended events...');
        await fetchAttendedEvents();
        console.log('🔍 ProfileView: About to fetch draft reviews...');
        await fetchDraftReviews();
        console.log('🔍 ProfileView: About to fetch followed artists count...');
        await fetchFollowedArtistsCount();
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
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar_url, bio, instagram_handle, music_streaming_profile, created_at, updated_at, last_active_at, is_public_profile')
        .eq('user_id', targetUserId)
        .single();
      
      console.log('ProfileView: Profile query result:', { data, error });

      if (error) {
        console.error('Profile query error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        
        // Handle session/authentication errors
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
        
        // If no profile exists, create a default one
        if (error.code === 'PGRST116' || error.message?.includes('No rows found')) {
          console.log('No profile found for user:', currentUserId);
          
          console.log('Creating default profile for user:', currentUserId);
          
          // Get user metadata from auth
          const { data: { user } } = await supabase.auth.getUser();
          const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'New User';
          
          console.log('Creating profile with name:', userName);
          
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
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
          } else {
            console.log('Profile created successfully:', newProfile);
            setProfile(newProfile);
          }
        } else {
          throw error;
        }
      } else {
        console.log('Profile found:', data);
        setProfile(data);
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
        .from('user_reviews')
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

      setUserEvents(filteredEvents);
      console.log('🔍 ProfileView: fetchUserEvents completed successfully');
    } catch (error) {
      console.error('❌ ProfileView: Error fetching user events:', error);
      setUserEvents([]);
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
      
      // Fetch user's reviews from the database
      const result = await ReviewService.getUserReviewHistory(targetUserId);
      
      console.log('🔍 ProfileView: Raw review data:', result);
      
      // Transform to match the expected interface for display (include rank_order and category ratings for display)
      // Filter reviews based on privacy: show all reviews for own profile, only public reviews for others
      const transformedReviews = result.reviews
        .filter((item: any) => isViewingOwnProfile || item.review.is_public)
        .map((item: any) => ({
          id: item.review.id,
          user_id: item.review.user_id,
          event_id: item.review.event_id,
          rating: item.review.rating,
          rank_order: (item.review as any).rank_order,
          performance_rating: (item.review as any).performance_rating,
          venue_rating: (item.review as any).venue_rating_new ?? (item.review as any).venue_rating,
          overall_experience_rating: (item.review as any).overall_experience_rating,
          review_text: item.review.review_text,
          photos: item.review.photos || [],
          videos: item.review.videos || [],
          setlist: item.review.setlist,
          is_public: item.review.is_public,
          created_at: item.review.created_at,
          // Add jambase_events data for the modal to access
          jambase_events: item.event,
          event: {
            event_name: item.event?.title || item.event?.event_name || 'Concert Review',
            location: item.event?.venue_name || 'Unknown Venue',
            event_date: item.event?.event_date || item.review.created_at,
            event_time: item.event?.event_time || 'TBD'
          }
        }));
      
      console.log('🔍 ProfileView: Transformed reviews:', transformedReviews);
      
      // Debug: Check if any reviews have setlist data
      const reviewsWithSetlist = transformedReviews.filter((review: any) => review.setlist);
      console.log('🎵 ProfileView: Reviews with setlist:', reviewsWithSetlist.length, reviewsWithSetlist);
      
      setReviews(transformedReviews);
    } catch (error) {
      console.error('❌ ProfileView: Error fetching reviews:', error);
      setReviews([]);
    }
  };

  // Compute display rating (0.5 increments) preferring category ratings when present
  const getDisplayRating = (r: any) => {
    const parts: number[] = [];
    if (typeof r.performance_rating === 'number' && r.performance_rating > 0) parts.push(r.performance_rating);
    if (typeof r.venue_rating === 'number' && r.venue_rating > 0) parts.push(r.venue_rating);
    if (typeof r.overall_experience_rating === 'number' && r.overall_experience_rating > 0) parts.push(r.overall_experience_rating);
    if (parts.length > 0) {
      const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
      return Math.round(avg * 2) / 2;
    }
    if (typeof r.rating === 'number') return Math.round(r.rating * 2) / 2;
    if (r.rating === 'good') return 5;
    if (r.rating === 'okay') return 3;
    if (r.rating === 'bad') return 1;
    return 0;
  };

  const fetchFriends = async () => {
    try {
      // Check if session is expired before making any requests
      if (sessionExpired || !user) {
        console.log('Session expired or no user, skipping friends fetch');
        return;
      }

      // First, get the friendship records
      const { data: friendships, error: friendsError } = await supabase
        .from('friends')
        .select('id, user1_id, user2_id, created_at')
        .or(`user1_id.eq.${targetUserId},user2_id.eq.${targetUserId}`)
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

      // Get all the user IDs we need to fetch
      const userIds = friendships.map(f => 
        f.user1_id === currentUserId ? f.user2_id : f.user1_id
      );

      // Fetch the profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, bio, user_id, created_at, last_active_at, is_public_profile')
        .in('user_id', userIds);

      if (profilesError) {
        console.warn('Warning: Could not fetch friend profiles:', profilesError);
        setFriends([]);
        return;
      }

      // Transform the data to get the other user's profile
      const friendsList = friendships.map(friendship => {
        const otherUserId = friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id;
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

      console.log('🔍 ProfileView: Fetching followed artists count for user:', targetUserId);
      
      const followedArtists = await ArtistFollowService.getUserFollowedArtists(targetUserId);
      setFollowedArtistsCount(followedArtists.length);
      
      console.log('🔍 ProfileView: Followed artists count:', followedArtists.length);
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
      .from('user_reviews')
      .select(`
        id, 
        event_id, 
        rating, 
        review_text, 
        was_there, 
        is_public, 
        created_at, 
        updated_at,
        jambase_events(
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
      .or('was_there.eq.true,and(review_text.not.is.null,review_text.not.eq.ATTENDANCE_ONLY)')
      .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching attended events:', error);
        setAttendedEvents([]);
        return;
      }

      console.log('🔍 ProfileView: Attended events data:', data);
      console.log('🔍 ProfileView: Total attended events fetched:', data?.length);
      
      // Log breakdown of event types
      const withReviews = data?.filter(item => item.review_text && item.review_text !== 'ATTENDANCE_ONLY').length || 0;
      const attendanceOnly = data?.filter(item => item.review_text === 'ATTENDANCE_ONLY').length || 0;
      const noReview = data?.filter(item => !item.review_text).length || 0;
      
      console.log('📊 Event breakdown:');
      console.log(`   With reviews: ${withReviews}`);
      console.log(`   Attendance only: ${attendanceOnly}`);
      console.log(`   No review: ${noReview}`);
      console.log(`   Total: ${data?.length}`);
      
      // Fetch event details for each attendance record
      if (data && data.length > 0) {
        const eventIds = data.map(item => item.event_id);
        const { data: events, error: eventsError } = await supabase
          .from('jambase_events')
          .select('id, title, artist_name, venue_name, event_date, venue_city, venue_state')
          .in('id', eventIds);
          
        if (eventsError) {
          console.error('Error fetching event details:', eventsError);
          setAttendedEvents([]);
          return;
        }
        
        // Combine attendance records with event data
        const combinedData = data.map(attendance => ({
          ...attendance,
          jambase_events: events?.find(event => event.id === attendance.event_id)
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
        performance_rating: review.performance_rating,
        venue_rating: review.venue_rating,
        overall_experience_rating: review.overall_experience_rating,
        performance_review_text: review.performance_review_text,
        venue_review_text: review.venue_review_text,
        overall_experience_review_text: review.overall_experience_review_text,
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
      await ReviewService.deleteEventReview(currentUserId, reviewId);
      fetchReviews(); // Refresh the list
      toast({
        title: "Review Deleted",
        description: "Your review has been deleted.",
      });
    } catch (error) {
      console.error('Error deleting review:', error);
      toast({
        title: "Error",
        description: "Failed to delete review. Please try again.",
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
        <div className="mb-6 p-6">
          {/* Profile Info Row */}
          <div className="flex items-start gap-6 mb-6">
            {/* Profile Picture */}
            <Avatar className="w-20 h-20 md:w-24 md:h-24 profile-ring">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-2xl">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
            {/* Profile Stats and Actions */}
            <div className="flex-1">
              {/* Compact counts row above name */}
              <div className="flex items-center gap-6 mb-2">
              <div className="text-center">
                <span className="gradient-text-bold font-semibold">{reviews.filter(review => (review as any).review_text !== 'ATTENDANCE_ONLY').length}</span>
                <p className="text-sm text-muted-foreground">reviews</p>
              </div>
              <button
                className="text-center hover:opacity-70 transition-opacity"
                onClick={() => { setFollowersModalType('friends'); setShowFollowersModal(true); }}
              >
                <span className="gradient-text-bold font-semibold">{friends.length}</span>
                <p className="text-sm text-muted-foreground">friends</p>
              </button>
              <button
                className="text-center hover:opacity-70 transition-opacity"
                onClick={() => navigate(`/following${!isViewingOwnProfile ? `/${targetUserId}` : ''}`)}
              >
                <span className="gradient-text-bold font-semibold">{followedArtistsCount}</span>
                <p className="text-sm text-muted-foreground">following</p>
              </button>
              </div>
              
              <div className="flex items-center gap-4 mb-3">
                <h2 className="text-xl font-semibold">{profile.name}</h2>
                
                {/* Connection Degree Badge */}
                {!isViewingOwnProfile && (
                  <WorkingConnectionBadge targetUserId={targetUserId} />
                )}
                
                {!isViewingOwnProfile && profile.last_active_at && (
                  <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                    <Clock className="w-3 h-3" />
                    {UserVisibilityService.formatLastActive(profile.last_active_at)}
                  </Badge>
                )}
                {isViewingOwnProfile ? (
                  <>
                    <Button onClick={onEdit} variant="outline" size="sm" className="hover-button gradient-button">Edit profile</Button>
                    <Button onClick={onSettings} variant="ghost" size="sm" className="hover-button"><Settings className="w-4 h-4 hover-icon" /></Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    {friendStatus === 'none' && (
                      <Button onClick={sendFriendRequest} variant="default" size="sm">
                        <Plus className="w-4 h-4 mr-1" />
                        Add Friend
                      </Button>
                    )}
                    {friendStatus === 'pending_sent' && (
                      <Button disabled variant="outline" size="sm">
                        Friend Request Sent
                      </Button>
                    )}
                    {friendStatus === 'pending_received' && (
                      <Button disabled variant="outline" size="sm">
                        Respond to Request
                      </Button>
                    )}
                    {friendStatus === 'friends' && (
                      <Button 
                        onClick={() => unfriendUser(targetUserId)} 
                        variant="outline" 
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:border-red-300"
                      >
                        Unfriend
                      </Button>
                    )}
                  </div>
                )}
            </div>
            </div>
          </div>
          
          {/* Bio and Links */}
          <div className="mb-4">
              {profile.bio && (
              <p className="text-sm mb-3">{profile.bio}</p>
              )}

              {/* Social Media Links */}
              {(profile.instagram_handle || profile.music_streaming_profile) && (
              <div className="flex flex-col gap-1">
                  {profile.instagram_handle && (
                    <a
                      href={`https://instagram.com/${profile.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    className="flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors text-sm"
                    >
                      <Instagram className="w-4 h-4" />
                    <span>@{profile.instagram_handle}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                {profile.music_streaming_profile && (() => {
                  const serviceType = detectStreamingServiceType(profile.music_streaming_profile);
                  const isSpotify = serviceType === 'spotify';
                  const isAppleMusic = serviceType === 'apple-music';
                  
                  let href = profile.music_streaming_profile;
                  let displayText = profile.music_streaming_profile;
                  let colorClass = 'text-blue-600 hover:text-blue-700';
                  
                  if (isSpotify) {
                    href = profile.music_streaming_profile.startsWith('http') 
                      ? profile.music_streaming_profile 
                      : `https://open.spotify.com/user/${profile.music_streaming_profile}`;
                    displayText = 'Spotify Profile';
                    colorClass = 'text-green-600 hover:text-green-700';
                  } else if (isAppleMusic) {
                    href = profile.music_streaming_profile.startsWith('http') 
                      ? profile.music_streaming_profile 
                      : profile.music_streaming_profile;
                    displayText = 'Apple Music Profile';
                    colorClass = 'text-red-500 hover:text-red-600';
                  } else if (profile.music_streaming_profile.startsWith('http')) {
                    displayText = 'Music Profile';
                  }
                  
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 hover:opacity-80 transition-opacity duration-200 text-sm ${colorClass}`}
                    >
                      <Music className="w-4 h-4" />
                      <span>{displayText}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  );
                })()}
                </div>
              )}
              </div>
            </div>

        {/* Instagram-style Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="glass-card inner-glow grid w-full grid-cols-3 mb-6 p-1 floating-shadow">
            <TabsTrigger value="my-events" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              My Events
            </TabsTrigger>
            {canViewInterested && (
              <TabsTrigger value="interested" className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Interested Events
              </TabsTrigger>
            )}
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Streaming Stats
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
              posts={[
                  // Transform reviews into posts (exclude attendance-only records)
                  ...reviews.filter(review => (review as any).review_text !== 'ATTENDANCE_ONLY').map((review) => ({
                  id: `review-${review.id}`,
                  type: 'review' as const,
                  image: Array.isArray((review as any)?.photos) && (review as any).photos.length > 0 ? (review as any).photos[0] : undefined,
                  images: Array.isArray((review as any)?.photos) ? (review as any).photos : [],
                  title: review.event?.event_name || 'Concert Review',
                  subtitle: `Posted by: ${profile?.name || 'User'}`,
                  rating: (() => {
                    // Prefer category average if present to preserve .5 increments
                    const parts: number[] = [];
                    const pr = (review as any).performance_rating;
                    const vr = (review as any).venue_rating;
                    const or = (review as any).overall_experience_rating;
                    if (typeof pr === 'number' && pr > 0) parts.push(pr);
                    if (typeof vr === 'number' && vr > 0) parts.push(vr);
                    if (typeof or === 'number' && or > 0) parts.push(or);
                    if (parts.length > 0) {
                      const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
                      return Math.round(avg * 2) / 2;
                    }
                    if (typeof review.rating === 'string') {
                      switch (review.rating) {
                        case 'good': return 5;
                        case 'okay': return 3;
                        case 'bad': return 1;
                        default: return 0;
                      }
                    }
                    return Math.round((review.rating || 0) * 2) / 2;
                  })(),
                  date: review.created_at,
                  likes: 0,
                  comments: 0,
                  badge: 'Review'
                }))
              ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())}
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

          

          <TabsContent value="stats" className="mt-6">
            <UnifiedStreamingStats 
              musicStreamingProfile={profile.music_streaming_profile} 
              isViewingOtherProfile={!isViewingOwnProfile}
            />
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

      {/* Review View Dialog - Instagram-style layout */}
      {viewReviewOpen && selectedReview && (
        <Dialog open={viewReviewOpen} onOpenChange={setViewReviewOpen}>
          <DialogContent className="max-w-5xl w-[90vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden flex">
            {/* Left side - Image/Graphic */}
            <div className="flex-1 bg-black flex items-center justify-center min-h-0">
              {Array.isArray((selectedReview as any)?.photos) && (selectedReview as any).photos.length > 0 ? (
                <img 
                  src={(selectedReview as any).photos[0]} 
                  alt="Review photo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center text-white">
                  <div className="text-6xl font-bold mb-4">
                    <span className="text-pink-500">S</span>ynth
                  </div>
                  <div className="w-32 h-0.5 bg-white mx-auto mb-4"></div>
                  <div className="text-sm opacity-80">Concert Review</div>
                </div>
              )}
            </div>
            
            {/* Right side - Content */}
            <div className="flex-1 flex flex-col bg-white">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-bold">
                      {profile?.name?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{profile?.name || 'User'}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(selectedReview.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setViewReviewOpen(false)}>
                  ✕
                </Button>
              </div>
              
              {/* Content */}
              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {/* Event Info */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold mb-1">
                        {selectedReview.jambase_events?.title || 'Concert Review'}
                      </h2>
                      <p className="text-sm text-gray-600">
                        {selectedReview.jambase_events?.artist_name} • {new Date(selectedReview.jambase_events?.event_date).toLocaleDateString()}
                      </p>
                      {selectedReview.jambase_events?.venue_name && (
                        <p className="text-sm text-gray-500">
                          {selectedReview.jambase_events.venue_name}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setViewReviewOpen(false);
                        // Ensure we have complete event data for the modal
                        // The event data is nested under jambase_events in the review object
                        const eventData = selectedReview.jambase_events;
                        
                        
                        const completeEvent = {
                          ...eventData,
                          // Ensure all required fields are present with proper fallbacks
                          id: eventData?.id || selectedReview.event_id,
                          title: eventData?.title || 'Unknown Event',
                          artist_name: eventData?.artist_name || 'Unknown Artist',
                          venue_name: eventData?.venue_name || 'Unknown Venue',
                          event_date: eventData?.event_date || new Date().toISOString(),
                          venue_city: eventData?.venue_city || null,
                          venue_state: eventData?.venue_state || null,
                          setlist: eventData?.setlist || null,
                          setlist_song_count: eventData?.setlist_song_count || null,
                          setlist_fm_url: eventData?.setlist_fm_url || null
                        };
                        
                        setSelectedEvent(completeEvent);
                        setDetailsOpen(true);
                      }}
                      className="ml-3 flex-shrink-0"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Event
                    </Button>
                  </div>
                  
                  {/* Event Status Badge */}
                  <div className="flex items-center gap-2">
                    {new Date(selectedReview.event?.event_date) < new Date() ? (
                      <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700">
                        <Calendar className="w-3 h-3 mr-1" />
                        Past Event
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                        <Calendar className="w-3 h-3 mr-1" />
                        Upcoming
                      </Badge>
                    )}
                    {selectedReview.event?.venue_city && selectedReview.event?.venue_state && (
                      <Badge variant="outline" className="text-xs">
                        <MapPin className="w-3 h-3 mr-1" />
                        {selectedReview.event.venue_city}, {selectedReview.event.venue_state}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Rating */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star
                        key={i}
                        className={`w-5 h-5 ${
                          i < Math.floor(selectedReview.rating) 
                            ? 'text-yellow-500 fill-yellow-500' 
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                    <span className="text-sm font-medium ml-1">{selectedReview.rating}/5</span>
                  </div>
                </div>
                
                {/* Category Ratings */}
                {((selectedReview as any).performance_rating || (selectedReview as any).venue_rating_new || (selectedReview as any).overall_experience_rating) && (
                  <div className="flex flex-wrap gap-2">
                    {(selectedReview as any).performance_rating && (
                      <Badge variant="secondary" className="text-xs">
                        Performance {(selectedReview as any).performance_rating}
                      </Badge>
                    )}
                    {(selectedReview as any).venue_rating_new && (
                      <Badge variant="secondary" className="text-xs">
                        Venue {(selectedReview as any).venue_rating_new}
                      </Badge>
                    )}
                    {(selectedReview as any).overall_experience_rating && (
                      <Badge variant="secondary" className="text-xs">
                        Experience {(selectedReview as any).overall_experience_rating}
                      </Badge>
                    )}
                  </div>
                )}
                
                {/* Review Text */}
                {selectedReview.review_text && (
                  <div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedReview.review_text}
                    </p>
                  </div>
                )}
                
                {/* Additional Review Texts */}
                {((selectedReview as any).performance_review_text || (selectedReview as any).venue_review_text || (selectedReview as any).overall_experience_review_text) && (
                  <div className="space-y-3">
                    {(selectedReview as any).performance_review_text && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Performance</h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {(selectedReview as any).performance_review_text}
                        </p>
                      </div>
                    )}
                    {(selectedReview as any).venue_review_text && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Venue</h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {(selectedReview as any).venue_review_text}
                        </p>
                      </div>
                    )}
                    {(selectedReview as any).overall_experience_review_text && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Overall Experience</h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {(selectedReview as any).overall_experience_review_text}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Setlist Section */}
                {selectedReview.setlist && (
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="setlist" className="border-0">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                          <div className="flex items-center gap-3 w-full">
                            <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                              <Music className="w-3 h-3 text-white" />
                            </div>
                            <div className="flex-1 text-left">
                              <h3 className="font-semibold text-purple-900 text-sm">Setlist from this Show</h3>
                              <p className="text-xs text-purple-700">
                                {selectedReview.jambase_events?.setlist_song_count || 'Multiple'} songs performed
                              </p>
                            </div>
                            {selectedReview.jambase_events?.setlist_fm_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="border-purple-300 hover:bg-purple-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <a 
                                  href={selectedReview.jambase_events.setlist_fm_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1"
                                >
                                  <span className="text-xs">View on setlist.fm</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 max-h-80 overflow-y-auto">
                    
                    {(() => {
                      const setlistData = selectedReview.setlist as any;
                      
                      // Handle different setlist data formats
                      let songs = [];
                      if (setlistData) {
                        if (Array.isArray(setlistData)) {
                          // If setlist is directly an array of songs
                          songs = setlistData;
                        } else if (setlistData.songs && Array.isArray(setlistData.songs)) {
                          // If setlist has a songs property
                          songs = setlistData.songs;
                        } else if (setlistData.setlist && Array.isArray(setlistData.setlist)) {
                          // If setlist has a setlist property
                          songs = setlistData.setlist;
                        }
                      }
                      
                      if (!songs || songs.length === 0) {
                        return (
                          <div className="text-center py-4">
                            <p className="text-purple-700">Setlist data is available but in an unexpected format.</p>
                            {selectedReview.jambase_events?.setlist_fm_url && (
                              <p className="text-sm text-purple-600 mt-2">
                                <a href={selectedReview.jambase_events.setlist_fm_url} target="_blank" rel="noopener noreferrer" className="underline">
                                  View on setlist.fm
                                </a>
                              </p>
                            )}
                          </div>
                        );
                      }
                      
                      // Group songs by set
                      const sets: { [key: number]: any[] } = {};
                      songs.forEach((song: any) => {
                        const setNumber = song.setNumber || 1;
                        if (!sets[setNumber]) {
                          sets[setNumber] = [];
                        }
                        sets[setNumber].push(song);
                      });
                      
                      return (
                        <div className="space-y-3">
                          {Object.entries(sets).map(([setNumber, setSongs]) => {
                            const setName = setSongs[0]?.setName || `Set ${setNumber}`;
                            
                            return (
                              <div key={setNumber} className="bg-white/70 rounded-lg p-3">
                                <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2 text-sm">
                                  <Music className="w-3 h-3" />
                                  {setName}
                                </h4>
                                <div className="space-y-1">
                                  {setSongs.map((song: any, idx: number) => (
                                    <div key={song.position || idx} className="flex items-start gap-3 py-1">
                                      <span className="text-purple-600 font-medium min-w-[20px] text-xs">
                                        {song.position || (idx + 1)}.
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-gray-900 text-xs font-medium">
                                            {song.name || song.title || song.song || 'Unknown Song'}
                                          </span>
                                          {song.cover && (
                                            <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                                              {song.cover.artist || song.cover} cover
                                            </span>
                                          )}
                                        </div>
                                        {(song.info || song.notes) && (
                                          <p className="text-xs text-gray-600 mt-1 italic">
                                            {song.info || song.notes}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          
                          {setlistData.info && (
                            <div className="bg-purple-100/50 rounded-lg p-3 mt-4">
                              <p className="text-sm text-purple-900">
                                <span className="font-semibold">Note:</span> {setlistData.info}
                              </p>
                            </div>
                          )}
                          
                          {/* Tour information */}
                          {setlistData.tour && (
                            <div className="bg-blue-100/50 rounded-lg p-3 mt-4">
                              <p className="text-sm text-blue-900">
                                <span className="font-semibold">Tour:</span> {setlistData.tour}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                )}
              </div>
              
              {/* Actions */}
              <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setViewReviewOpen(false)}>Close</Button>
                {isViewingOwnProfile && selectedReview?.user_id === currentUserId && (
                  <Button onClick={() => { setViewReviewOpen(false); handleEditReview(selectedReview); }}>Edit Review</Button>
                )}
              </div>
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

    </div>
  );
};
