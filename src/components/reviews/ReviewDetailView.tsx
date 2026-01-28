import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Star, ThumbsUp, MessageCircle, Share2, MapPin, ChevronLeft, Music2, Lightbulb, Building2, Compass, DollarSign, EllipsisVertical, SquarePen, Trash2, Flag, Ban, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { SetlistDisplay } from './SetlistDisplay';
import { supabase } from '@/integrations/supabase/client';
import { ReviewService, type ReviewWithEngagement } from '@/services/reviewService';
import { ReviewCommentsModal } from './ReviewCommentsModal';
import { ReviewShareModal } from './ReviewShareModal';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { useToast } from '@/hooks/use-toast';
import { glassCardLight, textStyles } from '@/styles/glassmorphism';
import { ContentModerationService } from '@/services/contentModerationService';

interface ReviewDetailViewProps {
  reviewId: string;
  currentUserId?: string;
  onBack: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onOpenArtist?: (artistId: string, artistName: string) => void;
  onOpenVenue?: (venueId: string, venueName: string) => void;
  onOpenProfile?: (userId: string) => void;
}

interface FullReviewData {
  id: string;
  user_id: string;
  review_text: string | null;
  rating: number | null;
  photos: string[] | null;
  created_at: string;
  artist_performance_rating?: number | null;
  production_rating?: number | null;
  venue_rating?: number | null;
  location_rating?: number | null;
  value_rating?: number | null;
  artist_performance_feedback?: string | null;
  production_feedback?: string | null;
  venue_feedback?: string | null;
  location_feedback?: string | null;
  value_feedback?: string | null;
  setlist?: any;
  likes_count?: number;
  comments_count?: number;
  artist_id?: string | null;
  venue_id?: string | null;
  attendees?:
    | Array<
        | { type: 'user'; user_id: string; name: string; avatar_url?: string }
        | { type: 'phone'; phone: string; name?: string }
      >
    | string[]
    | null;
  author?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  };
  event_info?: {
    artist_name?: string;
    venue_name?: string;
    event_date?: string;
  };
}

export function ReviewDetailView({
  reviewId,
  currentUserId,
  onBack,
  onEdit,
  onDelete,
  onOpenArtist,
  onOpenVenue,
  onOpenProfile,
}: ReviewDetailViewProps) {
  const [reviewData, setReviewData] = useState<FullReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isLiking, setIsLiking] = useState(false);
  const [commentsModalOpen, setCommentsModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [commentsCount, setCommentsCount] = useState(0);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const optionsMenuContainerRef = useRef<HTMLDivElement | null>(null);

  // Normalize attendees: DB stores as TEXT[] (JSON strings), but UI expects attendee objects
  const attendeesNormalized: any[] = useMemo(() => {
    const raw = (reviewData as any)?.attendees;
    if (!Array.isArray(raw)) return [];
    if (typeof raw[0] === 'string') {
      return (raw as string[])
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
    return raw as any[];
  }, [(reviewData as any)?.attendees]);

  const taggedUserAttendees = useMemo(
    () =>
      attendeesNormalized.filter(
        (a): a is { type: 'user'; user_id: string; name: string; avatar_url?: string } =>
          a && (a as any).type === 'user' && typeof (a as any).user_id === 'string'
      ),
    [attendeesNormalized]
  );

  useEffect(() => {
    const fetchReviewData = async () => {
      try {
        setLoading(true);
        
        // Fetch review with all details
        const { data: review, error: reviewError } = await supabase
          .from('reviews')
          .select(`
            id,
            user_id,
            review_text,
            rating,
            photos,
            created_at,
            artist_performance_rating,
            production_rating,
            venue_rating,
            location_rating,
            value_rating,
            artist_performance_feedback,
            production_feedback,
            venue_feedback,
            location_feedback,
            value_feedback,
            setlist,
            likes_count,
            comments_count,
            event_id,
            artist_id,
            venue_id,
            attendees
          `)
          .eq('id', reviewId)
          .single();

        if (reviewError) throw reviewError;

        // Fetch author info
        const { data: author } = await supabase
          .from('users')
          .select('user_id, name, avatar_url')
          .eq('user_id', review.user_id)
          .single();

        // Fetch event/artist/venue info
        let eventInfo: any = {};
        let artistId: string | null = null;
        let venueId: string | null = null;
        
        if (review.event_id) {
          const { data: event } = await supabase
            .from('events')
            .select(`
              id,
              title,
              event_date,
              artist_id,
              venue_id,
              artists(name),
              venues(name)
            `)
            .eq('id', review.event_id)
            .single();

          if (event) {
            artistId = event.artist_id;
            venueId = event.venue_id;
            eventInfo = {
              artist_name: (event.artists as any)?.name,
              venue_name: (event.venues as any)?.name,
              event_date: event.event_date,
            };
          }
        } else if (review.artist_id && review.venue_id) {
          artistId = review.artist_id;
          venueId = review.venue_id;
          const [artistRes, venueRes] = await Promise.all([
            supabase.from('artists').select('name').eq('id', review.artist_id).single(),
            supabase.from('venues').select('name').eq('id', review.venue_id).single(),
          ]);

          eventInfo = {
            artist_name: artistRes.data?.name,
            venue_name: venueRes.data?.name,
          };
        }

        const finalReviewData = {
          ...review,
          artist_id: artistId || review.artist_id || null,
          venue_id: venueId || review.venue_id || null,
          author: author ? {
            id: author.user_id,
            name: author.name,
            avatar_url: author.avatar_url,
          } : undefined,
          event_info: eventInfo,
        };
        
        setReviewData(finalReviewData);
        setLikesCount(review.likes_count || 0);
        setCommentsCount(review.comments_count || 0);

        // Check if user has liked this review
        if (currentUserId) {
          try {
            // Avoid querying the entities table (can be blocked by RLS); instead, look directly in engagements.
            // 1) Primary path: engagements where entity_id is the reviewId
            // 2) Fallback: legacy records with metadata->>review_id and null entity_id
            const [byEntityId, byMetadata] = await Promise.all([
              supabase
                .from('engagements')
                .select('id')
                .eq('user_id', currentUserId)
                .eq('entity_id', reviewId)
                .eq('engagement_type', 'like')
                .maybeSingle(),
              supabase
                .from('engagements')
                .select('id')
                .eq('user_id', currentUserId)
                .is('entity_id', null)
                .eq('engagement_type', 'like')
                .eq('metadata->>review_id', reviewId)
                .maybeSingle()
            ]);

            const isLiked = !!(byEntityId.data || byMetadata.data);
            setIsLiked(isLiked);
          } catch (likeCheckError) {
            // If like check fails, just set to false and continue - don't block review display
            console.error('Error checking if review is liked:', likeCheckError);
            setIsLiked(false);
          }
        }
      } catch (error) {
        console.error('Error fetching review data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (reviewId) {
      fetchReviewData();
    }
  }, [reviewId, currentUserId]);

  const handleLike = async () => {
    if (!currentUserId || isLiking || !reviewData) return;

    setIsLiking(true);
    try {
      if (isLiked) {
        await ReviewService.unlikeReview(currentUserId, reviewId);
        setLikesCount(prev => Math.max(0, prev - 1));
        setIsLiked(false);
      } else {
        await ReviewService.likeReview(currentUserId, reviewId);
        setLikesCount(prev => prev + 1);
        setIsLiked(true);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
    } finally {
      setIsLiking(false);
    }
  };

  const handleComment = () => {
    setCommentsModalOpen(true);
  };

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const handleCommentAdded = () => {
    setCommentsCount(prev => prev + 1);
  };

  const handleCommentsLoaded = (count: number) => {
    setCommentsCount(count);
  };

  const timeAgo = reviewData
    ? formatDistanceToNow(new Date(reviewData.created_at), { addSuffix: true })
    : '';
  const isOwner = !!reviewData && currentUserId === reviewData.user_id;
  
  useEffect(() => {
    if (!optionsMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (optionsMenuContainerRef.current?.contains(target)) return;
      setOptionsMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => window.removeEventListener('pointerdown', handlePointerDown, { capture: true } as any);
  }, [optionsMenuOpen]);

  const menuItems = useMemo(() => {
    if (isOwner) {
      return [
        { key: 'edit', label: 'Edit', icon: SquarePen },
        { key: 'delete', label: 'Delete', icon: Trash2 },
      ] as const;
    }
    return [
      { key: 'report', label: 'Report', icon: Flag },
      { key: 'block', label: 'Block User', icon: Ban },
    ] as const;
  }, [isOwner]);

  const handleMenuAction = async (key: 'edit' | 'delete' | 'report' | 'block') => {
    setOptionsMenuOpen(false);
    if (!reviewData) return;

    if (key === 'edit') {
      onEdit?.();
      return;
    }

    if (key === 'delete') {
      setDeleteConfirmOpen(true);
      return;
    }

    if (key === 'report') {
      setReportModalOpen(true);
      return;
    }

    // block
    if (!currentUserId) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to block users.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await ContentModerationService.blockUser({ blocked_user_id: reviewData.user_id });
      toast({
        title: 'User blocked',
        description: 'You will no longer see their content.',
      });
      onBack();
    } catch (error) {
      console.error('Error blocking user:', error);
      toast({
        title: 'Error',
        description: 'Failed to block user',
        variant: 'destructive',
      });
    }
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setDeleteConfirmOpen(false);
  };

  const confirmDelete = async () => {
    if (!currentUserId || !reviewData || isDeleting) return;
    try {
      setIsDeleting(true);
      await ReviewService.deleteEventReview(currentUserId, reviewId);
      await onDelete?.();
      toast({
        title: 'Deleted',
        description: 'Your post has been deleted.',
      });
      setDeleteConfirmOpen(false);
      onBack();
    } catch (error) {
      console.error('Error deleting review:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete post',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading || !reviewData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'var(--neutral-50, #fcfcfc)' }}>
        <div className="text-center">
          <p className="text-lg" style={{ color: 'var(--neutral-600)' }}>Loading review...</p>
        </div>
      </div>
    );
  }

  const ratingCategories = [
    {
      name: 'Artist Performance',
      rating: reviewData.artist_performance_rating || 0,
      feedback: reviewData.artist_performance_feedback,
      icon: Music2,
      iconColor: 'var(--brand-pink-500)', // Pink
    },
    {
      name: 'Production Quality',
      rating: reviewData.production_rating || 0,
      feedback: reviewData.production_feedback,
      icon: Lightbulb,
      iconColor: '#8B5CF6', // Purple
    },
    {
      name: 'Venue Experience',
      rating: reviewData.venue_rating || 0,
      feedback: reviewData.venue_feedback,
      icon: Building2,
      iconColor: '#3B82F6', // Blue
    },
    {
      name: 'Location & Logistics',
      rating: reviewData.location_rating || 0,
      feedback: reviewData.location_feedback,
      icon: Compass,
      iconColor: '#10B981', // Green
    },
    {
      name: 'Value for Ticket',
      rating: reviewData.value_rating || 0,
      feedback: reviewData.value_feedback,
      icon: DollarSign,
      iconColor: '#F59E0B', // Orange/Amber
    },
  ].filter(cat => cat.rating > 0);

  const mainImage = reviewData.photos && reviewData.photos.length > 0 ? reviewData.photos[0] : null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ 
        backgroundColor: '#ffffff',
        WebkitOverflowScrolling: 'touch',
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div 
        className="sticky top-0 z-10"
        style={{
          background: 'rgba(252, 252, 252, 0.85)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          boxShadow: '0 4px 4px rgba(0, 0, 0, 0.25)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="max-w-2xl mx-auto" style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)' }}>
          {/* Top Header Row: Back Chevron, Avatar, Username */}
          <div className="flex items-center justify-between" style={{ gap: 'var(--spacing-inline, 6px)', paddingTop: 'var(--spacing-small, 12px)', paddingBottom: 'var(--spacing-small, 12px)' }}>
            <div className="flex items-center min-w-0" style={{ gap: 'var(--spacing-inline, 6px)' }}>
              {/* Back Chevron */}
              <button
                onClick={onBack}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  padding: 0, 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft style={{ width: '35px', height: '35px', color: 'var(--neutral-900)' }} />
              </button>
              
              {/* Avatar */}
              <button
                onClick={() => onOpenProfile?.(reviewData.user_id)}
                className="shrink-0"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <Avatar className="w-14 h-14">
                  <AvatarImage src={reviewData.author?.avatar_url || undefined} alt={reviewData.author?.name} />
                  <AvatarFallback className="text-white font-bold text-lg" style={{ backgroundColor: '#FF3399' }}>
                    {reviewData.author?.name?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </button>
              
              {/* Username */}
              <button
                onClick={() => onOpenProfile?.(reviewData.user_id)}
                className="min-w-0"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-body-size, 20px)',
                  fontWeight: 'var(--typography-body-weight, 500)',
                  lineHeight: 'var(--typography-body-line-height, 1.5)',
                  color: 'var(--neutral-600)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {reviewData.author?.name || 'User'}
              </button>
            </div>

            {/* Options menu */}
            <div ref={optionsMenuContainerRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                aria-label="More options"
                onClick={() => setOptionsMenuOpen((v) => !v)}
                style={{
                  width: '44px',
                  height: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  margin: 0,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <EllipsisVertical size={24} style={{ color: 'var(--neutral-900)' }} />
              </button>

              {optionsMenuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: '48px',
                    right: 0,
                    width: '220px',
                    borderRadius: 'var(--radius-corner, 10px)',
                    boxShadow: '0 4px 12px 0 var(--shadow-color)',
                    background: 'var(--neutral-50, #fcfcfc)',
                    border: '1px solid rgba(0, 0, 0, 0.06)',
                    overflow: 'hidden',
                    zIndex: 50,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {menuItems.map((item, idx) => {
                    const Icon = item.icon;
                    const isLast = idx === menuItems.length - 1;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        onClick={() => handleMenuAction(item.key)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '14px 16px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: isLast ? 'none' : '1px solid rgba(0, 0, 0, 0.06)',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <Icon size={24} style={{ color: 'var(--neutral-600)', flexShrink: 0 }} />
                        <span
                          style={{
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-meta-size, 16px)',
                            fontWeight: 'var(--typography-meta-weight, 500)',
                            lineHeight: 'var(--typography-meta-line-height, 1.5)',
                            color: 'var(--neutral-900)',
                          }}
                        >
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Pills Row - Directly below header row */}
          {(reviewData.event_info?.artist_name || reviewData.event_info?.venue_name) && (
            <div className="flex flex-col" style={{ gap: 'var(--spacing-inline, 6px)', paddingBottom: 'var(--spacing-small, 12px)' }}>
              {/* Artist Button */}
              {reviewData.event_info?.artist_name && (
                <button
                  onClick={() => {
                    if (onOpenArtist && reviewData.artist_id) {
                      onOpenArtist(reviewData.artist_id, reviewData.event_info?.artist_name || '');
                    }
                  }}
                  className="swift-ui-button swift-ui-button-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: 8,
                    padding: '14px 20px',
                    borderRadius: 14,
                    border: '2px solid var(--brand-pink-500, #FF3399)',
                    background: 'var(--brand-pink-500, #FF3399)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    width: 'fit-content',
                    maxWidth: 'calc(100vw - calc(var(--spacing-screen-margin-x, 20px) * 2))',
                    overflow: 'hidden',
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-pink-050, #FDF2F8)', flexShrink: 0 }}>
                    <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12"/>
                    <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5"/>
                    <circle cx="16" cy="7" r="5"/>
                  </svg>
                  <span style={{ 
                    fontWeight: 600, 
                    fontSize: 16, 
                    color: 'var(--brand-pink-050, #FDF2F8)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {reviewData.event_info.artist_name}
                  </span>
                </button>
              )}

              {/* Venue Button */}
              {reviewData.event_info?.venue_name && (
                <button
                  onClick={() => {
                    if (onOpenVenue && reviewData.venue_id) {
                      onOpenVenue(reviewData.venue_id, reviewData.event_info?.venue_name || '');
                    }
                  }}
                  className="swift-ui-button swift-ui-button-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: 8,
                    padding: '14px 20px',
                    borderRadius: 14,
                    border: '2px solid var(--brand-pink-200, #FBCFE8)',
                    background: 'var(--brand-pink-050, #FDF2F8)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    width: 'fit-content',
                    maxWidth: 'calc(100vw - calc(var(--spacing-screen-margin-x, 20px) * 2))',
                    overflow: 'hidden',
                  }}
                >
                  <MapPin size={20} style={{ color: 'var(--brand-pink-500, #FF3399)', flexShrink: 0 }} />
                  <span style={{ 
                    fontWeight: 600, 
                    fontSize: 16, 
                    color: 'var(--brand-pink-500, #FF3399)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {reviewData.event_info.venue_name}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div
        className="max-w-2xl mx-auto"
        style={{
          paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
          paddingRight: 'var(--spacing-screen-margin-x, 20px)',
          // Start content 12px below the header, per info modal layout
          paddingTop: 12,
          paddingBottom: 'var(--spacing-grouped, 24px)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-grouped, 24px)' }}>
          {/* Header section: tagged attendees 12px above title */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Tagged Attendees Chips (users only) */}
            {taggedUserAttendees.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                {taggedUserAttendees.map((attendee) => (
                  <button
                    key={attendee.user_id}
                    type="button"
                    onClick={() => onOpenProfile?.(attendee.user_id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: '2px solid var(--brand-pink-500, #FF3399)',
                      background: '#FFFFFF',
                      cursor: 'pointer',
                      maxWidth: '100%',
                    }}
                  >
                    <Avatar className="w-7 h-7" style={{ border: '2px solid var(--brand-pink-500, #FF3399)' }}>
                      <AvatarImage src={attendee.avatar_url || undefined} alt={attendee.name} />
                      <AvatarFallback
                        style={{
                          background: 'var(--brand-pink-500, #FF3399)',
                          color: '#FFFFFF',
                          fontWeight: 600,
                        }}
                      >
                        {attendee.name?.charAt(0).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        color: 'var(--brand-pink-500, #FF3399)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {attendee.name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* {PersonName}'s Review Heading */}
            <h1 className="text-2xl font-bold" style={{ color: 'var(--neutral-900)', margin: 0 }}>
              {reviewData.author?.name ? `${reviewData.author.name.split(' ')[0]}'s Review` : "Review"}
            </h1>
          </div>

          {/* Review Text Container */}
          {reviewData.review_text && (
            <div
              className="rounded-xl border-2"
              style={{
                borderColor: 'var(--neutral-300, #c9c9c9)',
                backgroundColor: 'white',
                padding: '16px',
              }}
            >
              <p style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-900)',
                margin: 0,
              }}>
                {reviewData.review_text}
              </p>
            </div>
          )}

          {/* Image */}
          {mainImage && (
            <div 
              className="rounded-xl overflow-hidden shadow-md"
              style={{ aspectRatio: '353/250' }}
            >
              <img
                src={mainImage}
                alt="Review"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Rating Details */}
          {ratingCategories.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-grouped, 24px)' }}>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--neutral-900)' }}>
                View Rating Details
              </h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-grouped, 24px)' }}>
                {ratingCategories.map((category) => (
                  <div
                    key={category.name}
                    className="flex gap-6 items-center p-3 rounded-xl border-2"
                    style={{
                      borderColor: 'var(--neutral-300, #c9c9c9)',
                      backgroundColor: 'white',
                    }}
                  >
                    {/* Category Info */}
                    <div className="flex flex-col gap-6 flex-1 min-w-0">
                      <p className="text-xl font-bold" style={{ color: 'var(--neutral-900)' }}>
                        {category.name}
                      </p>
                      {category.feedback && (
                        <p className="text-base" style={{ color: 'var(--neutral-600, #5d646f)' }}>
                          "{category.feedback}"
                        </p>
                      )}
                    </div>

                    {/* Rating */}
                    <div className="flex flex-col gap-3 items-end shrink-0 w-[120px]">
                      <p className="text-xl font-bold" style={{ color: 'var(--neutral-900)' }}>
                        {category.rating.toFixed(1)}
                      </p>
                      <div className="flex gap-0">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const starValue = i + 1;
                          const isFilled = starValue <= Math.floor(category.rating);
                          const isHalf = !isFilled && starValue <= category.rating;
                          
                          return (
                            <Star
                              key={i}
                              className={cn(
                                'w-6 h-6',
                                isFilled || isHalf
                                  ? 'fill-[#FCDC5F] text-[#FCDC5F]'
                                  : 'text-neutral-300 fill-transparent'
                              )}
                              strokeWidth={isFilled || isHalf ? 0 : 1.5}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Set List */}
          {reviewData.setlist && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-grouped, 24px)' }}>
                <SetlistDisplay
                  setlist={reviewData.setlist}
                  type="api"
                />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)', marginTop: ratingCategories.length > 0 ? 'var(--spacing-screen-margin-x, 20px)' : 0 }}>
          {/* Helpful Button */}
          <Button
            variant="secondary-neutral"
            className="flex items-center gap-2 flex-1"
            style={{
              height: 'var(--size-input-height, 44px)',
            }}
            onClick={handleLike}
            disabled={isLiking || !currentUserId}
          >
            <ThumbsUp 
              className={cn('w-4 h-4', isLiked && 'fill-current')} 
              style={{ color: 'var(--neutral-50)' }} 
            />
            <span style={{ 
              color: 'var(--neutral-600)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
            }}>{likesCount}</span>
            <span style={{ 
              color: 'var(--neutral-900)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
            }}>Helpful</span>
          </Button>

          {/* Comments Button */}
          <Button
            variant="secondary-neutral"
            className="flex items-center gap-2 flex-1"
            style={{
              height: 'var(--size-input-height, 44px)',
            }}
            onClick={handleComment}
          >
            <MessageCircle className="w-4 h-4" style={{ color: 'var(--neutral-50)' }} />
            <span style={{ 
              color: 'var(--neutral-600)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
            }}>{commentsCount}</span>
            <span style={{ 
              color: 'var(--neutral-900)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
            }}>Comments</span>
          </Button>

          {/* Share Button */}
          <Button
            className="btn-synth-primary shrink-0"
            style={{
              width: 'var(--size-input-height, 44px)',
              height: 'var(--size-input-height, 44px)',
              padding: 0,
              backgroundColor: 'var(--brand-pink-500, #FF3399)',
              color: 'var(--neutral-50)',
              borderRadius: 'var(--radius-corner, 10px)',
              boxShadow: '0 4px 4px 0 var(--shadow-color)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--brand-pink-500, #FF3399)';
            }}
            onClick={handleShare}
            aria-label="Share review"
          >
            <Share2 className="w-6 h-6" style={{ color: 'var(--neutral-50)' }} />
          </Button>
          </div>
        </div>
      </div>

      {/* Comments Modal */}
      {commentsModalOpen && (
        <ReviewCommentsModal
          reviewId={reviewId}
          isOpen={commentsModalOpen}
          onClose={() => setCommentsModalOpen(false)}
          currentUserId={currentUserId}
          onCommentAdded={handleCommentAdded}
          onCommentsLoaded={handleCommentsLoaded}
        />
      )}

      {/* Share Modal */}
      {shareModalOpen && reviewData && (
        <ReviewShareModal
          review={{
            id: reviewData.id,
            user_id: reviewData.user_id,
            event_id: (reviewData as any).event_id || '',
            rating: reviewData.rating || 0,
            review_text: reviewData.review_text || '',
            is_public: true,
            created_at: reviewData.created_at,
            updated_at: reviewData.created_at,
            likes_count: likesCount,
            comments_count: commentsCount,
            shares_count: 0,
            is_liked_by_user: isLiked,
            reaction_emoji: '',
            photos: reviewData.photos || [],
            videos: [],
            mood_tags: [],
            genre_tags: [],
            context_tags: [],
            artist_name: reviewData.event_info?.artist_name,
            artist_id: (reviewData as any).artist_id,
            venue_name: reviewData.event_info?.venue_name,
            venue_id: (reviewData as any).venue_id,
          } as ReviewWithEngagement}
          currentUserId={currentUserId || ''}
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {/* Report Modal */}
      {reportModalOpen && reviewData && (
        <ReportContentModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          contentType="review"
          contentId={reviewId}
          contentTitle={reviewData.event_info?.artist_name && reviewData.event_info?.venue_name
            ? `${reviewData.event_info.artist_name} at ${reviewData.event_info.venue_name}`
            : reviewData.event_info?.artist_name || 'Review'}
          onReportSubmitted={() => {
            setReportModalOpen(false);
            toast({
              title: "Review Reported",
              description: "Thank you for reporting this review. We'll review it shortly.",
            });
          }}
        />
      )}

      {/* Delete Confirm Modal (matches chat delete styling) */}
      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.30)',
            paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
            paddingRight: 'var(--spacing-screen-margin-x, 20px)',
          }}
          onMouseDown={() => {
            closeDeleteModal();
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              backgroundColor: 'var(--neutral-50, #fcfcfc)',
              borderRadius: 'var(--radius-corner, 10px)',
              boxShadow: '0 4px 12px 0 var(--shadow-color)',
              position: 'relative',
              paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
              paddingRight: 'var(--spacing-screen-margin-x, 20px)',
              paddingTop: 'var(--spacing-grouped, 24px)',
              paddingBottom: 'var(--spacing-grouped, 24px)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Close X button in top right */}
            <button
              onClick={() => closeDeleteModal()}
              style={{
                position: 'absolute',
                top: 'var(--spacing-grouped, 24px)',
                right: 'var(--spacing-screen-margin-x, 20px)',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label="Close dialog"
              type="button"
              disabled={isDeleting}
            >
              <X size={24} style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
            </button>

            {/* Title */}
            <h2
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-body-size, 20px)',
                fontWeight: 'var(--typography-bold-weight, 700)',
                lineHeight: 'var(--typography-body-line-height, 1.5)',
                color: 'var(--neutral-900)',
                margin: 0,
                marginBottom: 'var(--spacing-small, 12px)',
                paddingRight: '44px', // Account for X button space
              }}
            >
              Are you sure you want to delete this post?
            </h2>

            {/* Subtitle */}
            <p
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)',
                margin: 0,
                marginBottom: 'var(--spacing-small, 12px)',
              }}
            >
              This action cannot be undone
            </p>

            {/* Delete Button */}
            <Button
              className="btn-synth-primary w-full"
              onClick={confirmDelete}
              disabled={isDeleting}
              style={{
                backgroundColor: 'var(--brand-pink-500, #FF3399)',
                color: 'var(--neutral-50)',
                height: 'var(--size-input-height, 44px)',
                boxShadow: '0 4px 4px 0 var(--shadow-color)',
              }}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
