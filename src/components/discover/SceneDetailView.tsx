import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { SceneService, type SceneDetail } from '@/services/sceneService';
import { CompactEventCard } from './CompactEventCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { HorizontalCarousel } from './HorizontalCarousel';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

interface SceneDetailViewProps {
  sceneId: string;
  userId: string;
  onBack: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const SceneDetailView: React.FC<SceneDetailViewProps> = ({
  sceneId,
  userId,
  onBack,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [scene, setScene] = useState<SceneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEventInterested, setSelectedEventInterested] = useState(false);
  const [interestedEvents, setInterestedEvents] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSceneDetails();
    loadInterestedEvents();
  }, [sceneId, userId]);

  const loadInterestedEvents = async () => {
    try {
      const { data } = await supabase
        .from('user_event_relationships')
        .select('event_id')
        .eq('user_id', userId)
        .eq('relationship_type', 'interest');

      if (data) {
        setInterestedEvents(new Set(data.map(r => r.event_id)));
      }
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const loadSceneDetails = async () => {
    setLoading(true);
    try {
      const sceneData = await SceneService.getSceneDetails(sceneId, userId);
      setScene(sceneData);
      // Refresh progress after loading scene
      if (sceneData) {
        await SceneService.refreshSceneProgress(userId, sceneId);
      }
    } catch (error) {
      console.error('Error loading scene details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventClick = async (event: JamBaseEvent) => {
    try {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', event.id)
        .single();

      if (data) {
        setSelectedEvent(data);
        const interested = await UserEventService.isUserInterested(userId, data.id);
        setSelectedEventInterested(interested);
        setEventDetailsOpen(true);
      } else {
        setSelectedEvent(event);
        setSelectedEventInterested(interestedEvents.has(event.id || ''));
        setEventDetailsOpen(true);
      }
    } catch (error) {
      console.error('Error fetching event details:', error);
      setSelectedEvent(event);
      setSelectedEventInterested(interestedEvents.has(event.id || ''));
      setEventDetailsOpen(true);
    }
  };

  const handleInterestToggle = async (eventId: string, interested: boolean) => {
    try {
      await UserEventService.setEventInterest(userId, eventId, interested);
      setInterestedEvents(prev => {
        const next = new Set(prev);
        if (interested) {
          next.add(eventId);
        } else {
          next.delete(eventId);
        }
        return next;
      });
      setSelectedEventInterested(interested);
    } catch (error) {
      console.error('Error toggling interest:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-6">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Discover
          </Button>
          <div className="text-center py-12 text-muted-foreground">
            <p>Scene not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-6">
        {/* Header */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Discover
          </Button>
          <h1 className="text-2xl font-bold mb-2">{scene.name}</h1>
          {scene.description && (
          <p className="text-muted-foreground mb-4">{scene.description}</p>
          )}

          {/* Scene Image */}
          {(scene.image_url || scene.scene_url) && (
            <div className="w-full h-64 rounded-lg overflow-hidden mb-4">
              <img
                src={scene.image_url || scene.scene_url || ''}
                alt={scene.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* User Progress */}
          {scene.userProgress && scene.userProgress.discovery_state !== 'undiscovered' && (
            <div className="mb-4 p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Your Progress</span>
                <Badge variant="outline">
                  {scene.userProgress.discovery_state.replace('_', ' ')}
                </Badge>
              </div>
              <div className="w-full bg-background rounded-full h-2 mb-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${scene.userProgress.progress_percentage}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{scene.userProgress.artists_experienced} artists</span>
                <span>{scene.userProgress.venues_experienced} venues</span>
                <span>{scene.userProgress.cities_experienced} cities</span>
                <span>{scene.userProgress.events_experienced} events</span>
              </div>
            </div>
          )}

          {/* Genres */}
          {scene.participating_genres && scene.participating_genres.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {scene.participating_genres.map((genre) => (
                <Badge key={genre} variant="secondary">
                  {genre}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Participating Venues */}
        {scene.participating_venues && scene.participating_venues.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Participating Venues</h2>
            <div className="flex flex-wrap gap-2">
              {scene.participating_venues.map((venue) => (
                <Badge key={venue} variant="outline" className="text-sm">
                  {venue}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Participating Artists */}
        {scene.participating_artists && scene.participating_artists.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Participating Artists</h2>
            <div className="flex flex-wrap gap-2">
              {scene.participating_artists.map((artist) => (
                <Badge key={artist} variant="outline" className="text-sm">
                  {artist}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Events */}
        {scene.upcomingEvents.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Upcoming Events</h2>
            <HorizontalCarousel
              title=""
              showTitle={false}
              items={scene.upcomingEvents.map((event) => (
                <CompactEventCard
                  key={event.id}
                  event={event}
                  onClick={() => handleEventClick(event)}
                />
              ))}
              emptyMessage="No upcoming events"
            />
          </div>
        )}

        {/* Active Reviewers */}
        {scene.activeReviewers.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Active Reviewers</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {scene.activeReviewers.map((reviewer) => (
                <div
                  key={reviewer.user_id}
                  className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => onNavigateToProfile?.(reviewer.user_id)}
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={reviewer.avatar_url || undefined} />
                    <AvatarFallback>
                      {reviewer.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{reviewer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {reviewer.review_count} {reviewer.review_count === 1 ? 'review' : 'reviews'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Event Details Modal */}
      {eventDetailsOpen && selectedEvent && (
        <EventDetailsModal
          isOpen={eventDetailsOpen}
          onClose={() => {
            setEventDetailsOpen(false);
            setSelectedEvent(null);
          }}
          event={selectedEvent}
          currentUserId={userId}
          isInterested={selectedEventInterested}
          onInterestToggle={handleInterestToggle}
          onReview={() => {
            console.log('Review event:', selectedEvent.id);
          }}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToChat={onNavigateToChat}
        />
      )}
    </div>
  );
};

