"use client"

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Bookmark,
  MoreHorizontal,
  MapPin,
  Calendar,
  Star,
  Globe,
  Users,
  Search,
  Filter,
  Bell,
  Navigation as NavigationIcon,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { SynthSLogo } from '@/components/SynthSLogo';
import { UnifiedFeedService, UnifiedFeedItem } from '@/services/unifiedFeedService';
import { FriendsReviewService } from '@/services/friendsReviewService';
import { EventReviewModal } from '@/components/EventReviewModal';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { EventCommentsModal } from '@/components/events/EventCommentsModal';
import { ReviewCommentsModal } from '@/components/reviews/ReviewCommentsModal';
import { EventLikersModal } from '@/components/events/EventLikersModal';
import { EventShareModal } from '@/components/events/EventShareModal';
import { ReportContentModal } from '@/components/moderation/ReportContentModal';
import { trackInteraction } from '@/services/interactionTrackingService';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface InstagramStyleFeedProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToNotifications?: () => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const InstagramStyleFeed = ({ 
  currentUserId, 
  onBack, 
  onNavigateToNotifications, 
  onViewChange,
  onNavigateToProfile,
  onNavigateToChat
}: InstagramStyleFeedProps) => {
  const [activeTab, setActiveTab] = useState('all');
  const [feedItems, setFeedItems] = useState<UnifiedFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showEventDetailsModal, setShowEventDetailsModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showLikersModal, setShowLikersModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<UnifiedFeedItem | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  // Media carousel state
  const [currentMediaIndex, setCurrentMediaIndex] = useState<{ [key: string]: number }>({});
  const [playingVideos, setPlayingVideos] = useState<{ [key: string]: boolean }>({});
  const [videoVolumes, setVideoVolumes] = useState<{ [key: string]: number }>({});
  const [showFullscreenMedia, setShowFullscreenMedia] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchFeedItems();
  }, [activeTab, currentUserId]);

  const fetchFeedItems = async () => {
    setLoading(true);
    try {
      const items = await UnifiedFeedService.getFeedItems({
        userId: currentUserId,
        feedType: activeTab as any,
        limit: 50,
        includePrivateReviews: true
      });
      setFeedItems(items);
    } catch (error) {
      console.error('Error fetching feed items:', error);
      toast({
        title: "Error",
        description: "Failed to load feed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (item: UnifiedFeedItem) => {
    if (!user) return;
    
    const isLiked = likedPosts.has(item.id);
    const newLikedPosts = new Set(likedPosts);
    
    if (isLiked) {
      newLikedPosts.delete(item.id);
    } else {
      newLikedPosts.add(item.id);
    }
    
    setLikedPosts(newLikedPosts);
    
    // Track interaction
    try {
      await trackInteraction.like(item.type, item.review_id || item.id, currentUserId);
    } catch (error) {
      console.error('Error tracking like:', error);
    }
  };

  const handleBookmark = async (item: UnifiedFeedItem) => {
    const isBookmarked = bookmarkedPosts.has(item.id);
    const newBookmarkedPosts = new Set(bookmarkedPosts);
    
    if (isBookmarked) {
      newBookmarkedPosts.delete(item.id);
    } else {
      newBookmarkedPosts.add(item.id);
    }
    
    setBookmarkedPosts(newBookmarkedPosts);
  };

  const handleShare = (item: UnifiedFeedItem) => {
    setSelectedItem(item);
    setShowShareModal(true);
  };

  const handleComment = (item: UnifiedFeedItem) => {
    setSelectedItem(item);
    setShowCommentsModal(true);
  };

  const handleLikers = (item: UnifiedFeedItem) => {
    setSelectedItem(item);
    setShowLikersModal(true);
  };

  const handleReport = (item: UnifiedFeedItem) => {
    setSelectedItem(item);
    setShowReportModal(true);
  };

  const nextMedia = (itemId: string, mediaArray: any[]) => {
    setCurrentMediaIndex(prev => ({
      ...prev,
      [itemId]: Math.min((prev[itemId] || 0) + 1, mediaArray.length - 1)
    }));
  };

  const prevMedia = (itemId: string) => {
    setCurrentMediaIndex(prev => ({
      ...prev,
      [itemId]: Math.max((prev[itemId] || 0) - 1, 0)
    }));
  };

  const toggleVideoPlay = (itemId: string) => {
    setPlayingVideos(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const toggleVideoVolume = (itemId: string) => {
    setVideoVolumes(prev => ({
      ...prev,
      [itemId]: prev[itemId] === 1 ? 0 : 1
    }));
  };

  const toggleFullscreen = (itemId: string) => {
    setShowFullscreenMedia(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const formatTimeAgo = (dateString: string) => {
    const date = parseISO(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    return `${Math.floor(diffInSeconds / 86400)}d`;
  };

  const renderMedia = (item: UnifiedFeedItem) => {
    const photos = item.photos || [];
    const currentIndex = currentMediaIndex[item.id] || 0;
    const currentMedia = photos[currentIndex];

    if (!currentMedia) return null;

    const isVideo = currentMedia.type?.includes('video') || currentMedia.includes('.mp4') || currentMedia.includes('.mov');
    const isPlaying = playingVideos[item.id] || false;
    const volume = videoVolumes[item.id] !== undefined ? videoVolumes[item.id] : 1;
    const isFullscreen = showFullscreenMedia[item.id] || false;

    return (
      <div className={`relative bg-black ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
        {/* Media */}
        <div className="relative w-full aspect-square bg-black flex items-center justify-center">
          {isVideo ? (
            <video
              className="w-full h-full object-cover"
              controls={false}
              autoPlay={isPlaying}
              muted={volume === 0}
              loop
              onClick={() => toggleVideoPlay(item.id)}
            >
              <source src={currentMedia} type="video/mp4" />
            </video>
          ) : (
            <img
              src={currentMedia}
              alt="Post media"
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => toggleFullscreen(item.id)}
            />
          )}

          {/* Video controls overlay */}
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button
                onClick={() => toggleVideoPlay(item.id)}
                className="bg-black/50 rounded-full p-3 text-white hover:bg-black/70 transition-colors"
              >
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
              </button>
            </div>
          )}

          {/* Volume control for videos */}
          {isVideo && (
            <button
              onClick={() => toggleVideoVolume(item.id)}
              className="absolute top-4 right-4 bg-black/50 rounded-full p-2 text-white hover:bg-black/70 transition-colors"
            >
              {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          )}

          {/* Fullscreen control */}
          <button
            onClick={() => toggleFullscreen(item.id)}
            className="absolute top-4 left-4 bg-black/50 rounded-full p-2 text-white hover:bg-black/70 transition-colors"
          >
            {isFullscreen ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
          </button>

          {/* Media navigation arrows */}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => prevMedia(item.id)}
                disabled={currentIndex === 0}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 rounded-full p-2 text-white hover:bg-black/70 transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => nextMedia(item.id, photos)}
                disabled={currentIndex === photos.length - 1}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 rounded-full p-2 text-white hover:bg-black/70 transition-colors disabled:opacity-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Media indicators */}
          {photos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-1">
              {photos.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index === currentIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderFeedItem = (item: UnifiedFeedItem) => (
    <div key={item.id} className="bg-white border border-gray-200 mb-2">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src={item.author.avatar_url || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm">
              {item.author.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onNavigateToProfile?.(item.author.id)}
                className="font-semibold text-sm hover:opacity-70 transition-opacity"
              >
                {item.author.name}
              </button>
              {item.type === 'review' && item.rating && (
                <div className="flex items-center space-x-1">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs text-gray-500">{item.rating}</span>
                </div>
              )}
            </div>
            {item.event_info && (
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <MapPin className="w-3 h-3" />
                <span>{item.event_info.venue_name}</span>
                <span>•</span>
                <Calendar className="w-3 h-3" />
                <span>{format(parseISO(item.event_info.event_date), 'MMM d, yyyy')}</span>
              </div>
            )}
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleReport(item)}>
              Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Media */}
      {renderMedia(item)}

      {/* Actions */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => handleLike(item)}
              className={`transition-colors ${
                likedPosts.has(item.id) ? 'text-red-500' : 'text-gray-700 hover:text-red-500'
              }`}
            >
              <Heart className={`w-6 h-6 ${likedPosts.has(item.id) ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={() => handleComment(item)}
              className="text-gray-700 hover:text-blue-500 transition-colors"
            >
              <MessageCircle className="w-6 h-6" />
            </button>
            <button
              onClick={() => handleShare(item)}
              className="text-gray-700 hover:text-green-500 transition-colors"
            >
              <Share2 className="w-6 h-6" />
            </button>
          </div>
          <button
            onClick={() => handleBookmark(item)}
            className={`transition-colors ${
              bookmarkedPosts.has(item.id) ? 'text-yellow-500' : 'text-gray-700 hover:text-yellow-500'
            }`}
          >
            <Bookmark className={`w-6 h-6 ${bookmarkedPosts.has(item.id) ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Likes count */}
        <div className="mb-2">
          <button
            onClick={() => handleLikers(item)}
            className="font-semibold text-sm hover:opacity-70 transition-opacity"
          >
            {item.likes_count || 0} likes
          </button>
        </div>

        {/* Caption */}
        <div className="space-y-1">
          <div className="text-sm">
            <button
              onClick={() => onNavigateToProfile?.(item.author.id)}
              className="font-semibold hover:opacity-70 transition-opacity"
            >
              {item.author.name}
            </button>
            <span className="ml-2">{item.content}</span>
          </div>
          
          {/* Event info */}
          {item.event_info && (
            <div className="text-sm text-gray-500">
              <span className="font-semibold">{item.event_info.artist_name}</span>
              <span className="ml-2">at {item.event_info.venue_name}</span>
            </div>
          )}

          {/* Comments count */}
          {item.comments_count && item.comments_count > 0 && (
            <button
              onClick={() => handleComment(item)}
              className="text-sm text-gray-500 hover:opacity-70 transition-opacity"
            >
              View all {item.comments_count} comments
            </button>
          )}
        </div>

        {/* Timestamp */}
        <div className="mt-2">
          <span className="text-xs text-gray-500">
            {formatTimeAgo(item.created_at)}
          </span>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-md mx-auto bg-white min-h-screen">
          {/* Header skeleton */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gray-300 rounded-full animate-pulse" />
                <div className="w-20 h-4 bg-gray-300 rounded animate-pulse" />
              </div>
              <div className="w-8 h-8 bg-gray-300 rounded animate-pulse" />
            </div>
          </div>
          
          {/* Feed skeleton */}
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200">
                <div className="aspect-square bg-gray-300 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto bg-white min-h-screen">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 z-40">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <SynthSLogo size="sm" />
              <h1 className="font-semibold text-lg">Feed</h1>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={onNavigateToNotifications}
                className="text-gray-700 hover:text-gray-900 transition-colors"
              >
                <Bell className="w-6 h-6" />
              </button>
              <button
                onClick={() => onViewChange?.('search')}
                className="text-gray-700 hover:text-gray-900 transition-colors"
              >
                <Search className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Feed tabs */}
          <div className="mt-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 bg-gray-100">
                <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                <TabsTrigger value="friends" className="text-xs">Friends</TabsTrigger>
                <TabsTrigger value="friends_plus_one" className="text-xs">Friends+</TabsTrigger>
                <TabsTrigger value="public_only" className="text-xs">Public</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Feed content */}
        <div className="pb-20">
          {feedItems.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Globe className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No posts yet</h3>
                <p className="text-gray-500">Be the first to share a concert review!</p>
              </div>
            </div>
          ) : (
            feedItems.map(renderFeedItem)
          )}
        </div>
      </div>

      {/* Modals */}
      {showReviewModal && (
        <EventReviewModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          event={selectedEvent}
          onReviewSubmitted={() => {
            setShowReviewModal(false);
            fetchFeedItems();
          }}
        />
      )}

      {showEventDetailsModal && selectedItem && (
        <EventDetailsModal
          isOpen={showEventDetailsModal}
          onClose={() => setShowEventDetailsModal(false)}
          eventId={selectedItem.event_info?.artist_id || ''}
        />
      )}

      {showCommentsModal && selectedItem && (
        <ReviewCommentsModal
          isOpen={showCommentsModal}
          onClose={() => setShowCommentsModal(false)}
          reviewId={selectedItem.review_id || ''}
        />
      )}

      {showLikersModal && selectedItem && (
        <EventLikersModal
          isOpen={showLikersModal}
          onClose={() => setShowLikersModal(false)}
          eventId={selectedItem.event_info?.artist_id || ''}
        />
      )}

      {showShareModal && selectedItem && (
        <EventShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          eventId={selectedItem.event_info?.artist_id || ''}
        />
      )}

      {showReportModal && selectedItem && (
        <ReportContentModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          contentType="review"
          contentId={selectedItem.review_id || ''}
        />
      )}
    </div>
  );
};
