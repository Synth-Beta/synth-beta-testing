import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/Icon/Icon';
import { SceneService, type SceneDetail } from '@/services/sceneService';
import { CompactEventCard } from './CompactEventCard';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { HorizontalCarousel } from './HorizontalCarousel';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { ArtistDetailModal } from './modals/ArtistDetailModal';
import { VenueDetailModal } from './modals/VenueDetailModal';
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
  const [experiencedParticipants, setExperiencedParticipants] = useState<Set<string>>(new Set());
  const [participantEventCounts, setParticipantEventCounts] = useState<Map<string, number>>(new Map());
  const [participantImages, setParticipantImages] = useState<Map<string, string>>(new Map());
  // Modal states for artist/venue details
  const [artistModalOpen, setArtistModalOpen] = useState(false);
  const [venueModalOpen, setVenueModalOpen] = useState(false);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [selectedArtistName, setSelectedArtistName] = useState<string>('');
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [selectedVenueName, setSelectedVenueName] = useState<string>('');

  useEffect(() => {
    loadSceneDetails();
    loadInterestedEvents();
  }, [sceneId, userId]);

  useEffect(() => {
    if (scene) {
      loadParticipantExperience();
      loadParticipantEventCounts();
      loadParticipantImages();
    }
  }, [scene, userId]);

  const loadInterestedEvents = async () => {
    try {
      const interestedSet = await UserEventService.getUserInterestedEventIdSet(userId);
      setInterestedEvents(interestedSet);
    } catch (error) {
      console.error('Error loading interested events:', error);
    }
  };

  const loadParticipantExperience = async () => {
    if (!scene?.participants) return;
    
    try {
      // Get all participant IDs
      const artistIds = scene.participants
        .filter(p => p.participant_type === 'artist' && p.artist_id)
        .map(p => p.artist_id!);
      const venueIds = scene.participants
        .filter(p => p.participant_type === 'venue' && p.venue_id)
        .map(p => p.venue_id!);

      const experienced = new Set<string>();

      // Check passport entries for artists
      // Match by entity_uuid (normalized) OR entity_id (legacy) to handle incomplete backfill
      // artistIds are UUIDs from scene_participants, but legacy entries might only have entity_id
      if (artistIds.length > 0) {
        const artistUuidsSet = new Set(artistIds);
        
        // Query passport entries matching entity_uuid (normalized entries)
        const { data: artistPassportsByUuid } = await supabase
          .from('passport_entries')
          .select('entity_id, entity_uuid')
          .eq('user_id', userId)
          .eq('type', 'artist')
          .in('entity_uuid', artistIds);

        // For legacy entries: resolve UUIDs to external IDs, then match against entity_id
        // Batch resolve external IDs (get_external_id only accepts single UUID)
        const externalIdMap = new Map<string, string>(); // UUID -> external_id (without prefix)
        await Promise.all(
          artistIds.map(async (uuid) => {
            const { data } = await supabase.rpc('get_external_id', {
              p_entity_uuid: uuid,
              p_source: 'jambase',
              p_entity_type: 'artist'
            });
            if (data) externalIdMap.set(uuid, data);
          })
        );
        const externalIds = Array.from(externalIdMap.values());
        
        // Create normalized ID sets to handle prefix variants (legacy entries may have "jambase:" prefix)
        // Similar to SQL migration logic: handle both prefixed and non-prefixed formats
        const normalizedExternalIds = new Set<string>();
        externalIds.forEach(id => {
          normalizedExternalIds.add(id); // Without prefix (from get_external_id)
          normalizedExternalIds.add(`jambase:${id}`); // With prefix (legacy format)
        });

        // Query all legacy entries (without entity_uuid) and filter in JavaScript
        // This handles prefix variants that .in() query cannot match
        let artistPassportsByEntityId: any[] = [];
        if (externalIds.length > 0) {
          const { data } = await supabase
            .from('passport_entries')
            .select('entity_id, entity_uuid')
            .eq('user_id', userId)
            .eq('type', 'artist')
            .is('entity_uuid', null); // Only get entries without entity_uuid (legacy)
          
          // Filter to match normalized external IDs (handles prefix variants)
          artistPassportsByEntityId = (data || []).filter(p => {
            if (!p.entity_id) return false;
            // Normalize entity_id: remove prefix if present, then check both formats
            const normalizedId = p.entity_id.replace(/^jambase:/, '');
            return normalizedExternalIds.has(p.entity_id) || normalizedExternalIds.has(normalizedId);
          });
        }

        // Combine and process results
        const allArtistPassports = [
          ...(artistPassportsByUuid || []),
          ...artistPassportsByEntityId
        ];

        allArtistPassports.forEach(p => {
          // Match by entity_uuid (normalized) or entity_id (legacy external ID)
          if (p.entity_uuid && artistUuidsSet.has(p.entity_uuid)) {
            experienced.add(`artist:${p.entity_uuid}`);
          } else if (p.entity_id) {
            // Match legacy entry by normalized external ID (handle prefix variants)
            // Try to find matching UUID by comparing normalized entity_id with external IDs
            const normalizedEntityId = p.entity_id.replace(/^jambase:/, '');
            const matchingUuid = Array.from(externalIdMap.entries())
              .find(([_, extId]) => extId === normalizedEntityId || `jambase:${extId}` === p.entity_id)?.[0];
            if (matchingUuid) {
              experienced.add(`artist:${matchingUuid}`);
            }
          }
        });
      }

      // Check passport entries for venues
      // Match by entity_uuid (normalized) OR entity_id (legacy) to handle incomplete backfill
      // venueIds are UUIDs from scene_participants, but legacy entries might only have entity_id
      if (venueIds.length > 0) {
        const venueUuidsSet = new Set(venueIds);
        
        // Query passport entries matching entity_uuid (normalized entries)
        const { data: venuePassportsByUuid } = await supabase
          .from('passport_entries')
          .select('entity_id, entity_uuid')
          .eq('user_id', userId)
          .eq('type', 'venue')
          .in('entity_uuid', venueIds);

        // For legacy entries: resolve UUIDs to external IDs, then match against entity_id
        // Batch resolve external IDs (get_external_id only accepts single UUID)
        const externalIdMap = new Map<string, string>(); // UUID -> external_id (without prefix)
        await Promise.all(
          venueIds.map(async (uuid) => {
            const { data } = await supabase.rpc('get_external_id', {
              p_entity_uuid: uuid,
              p_source: 'jambase',
              p_entity_type: 'venue'
            });
            if (data) externalIdMap.set(uuid, data);
          })
        );
        const externalIds = Array.from(externalIdMap.values());
        
        // Create normalized ID sets to handle prefix variants (legacy entries may have "jambase:" prefix)
        // Similar to SQL migration logic: handle both prefixed and non-prefixed formats
        const normalizedExternalIds = new Set<string>();
        externalIds.forEach(id => {
          normalizedExternalIds.add(id); // Without prefix (from get_external_id)
          normalizedExternalIds.add(`jambase:${id}`); // With prefix (legacy format)
        });

        // Query all legacy entries (without entity_uuid) and filter in JavaScript
        // This handles prefix variants that .in() query cannot match
        let venuePassportsByEntityId: any[] = [];
        if (externalIds.length > 0) {
          const { data } = await supabase
            .from('passport_entries')
            .select('entity_id, entity_uuid')
            .eq('user_id', userId)
            .eq('type', 'venue')
            .is('entity_uuid', null); // Only get entries without entity_uuid (legacy)
          
          // Filter to match normalized external IDs (handles prefix variants)
          venuePassportsByEntityId = (data || []).filter(p => {
            if (!p.entity_id) return false;
            // Normalize entity_id: remove prefix if present, then check both formats
            const normalizedId = p.entity_id.replace(/^jambase:/, '');
            return normalizedExternalIds.has(p.entity_id) || normalizedExternalIds.has(normalizedId);
          });
        }

        // Combine and process results
        const allVenuePassports = [
          ...(venuePassportsByUuid || []),
          ...venuePassportsByEntityId
        ];

        allVenuePassports.forEach(p => {
          // Match by entity_uuid (normalized) or entity_id (legacy external ID)
          if (p.entity_uuid && venueUuidsSet.has(p.entity_uuid)) {
            experienced.add(`venue:${p.entity_uuid}`);
          } else if (p.entity_id) {
            // Match legacy entry by normalized external ID (handle prefix variants)
            // Try to find matching UUID by comparing normalized entity_id with external IDs
            const normalizedEntityId = p.entity_id.replace(/^jambase:/, '');
            const matchingUuid = Array.from(externalIdMap.entries())
              .find(([_, extId]) => extId === normalizedEntityId || `jambase:${extId}` === p.entity_id)?.[0];
            if (matchingUuid) {
              experienced.add(`venue:${matchingUuid}`);
            }
          }
        });
      }

      // Check cities from passport entries
      const cities = scene.participants
        .filter(p => p.participant_type === 'city' && p.text_value)
        .map(p => p.text_value!);
      
      if (cities.length > 0) {
        const { data: cityPassports } = await supabase
          .from('passport_entries')
          .select('entity_name')
          .eq('user_id', userId)
          .eq('type', 'city')
          .in('entity_name', cities);

        cityPassports?.forEach(p => experienced.add(`city:${p.entity_name}`));
      }

      setExperiencedParticipants(experienced);
    } catch (error) {
      console.error('Error loading participant experience:', error);
    }
  };

  const loadParticipantEventCounts = async () => {
    if (!scene?.participants) return;

    const counts = new Map<string, number>();
    const now = new Date().toISOString();

    try {
      // Get event counts for each participant using UUID joins
      await Promise.all(
        scene.participants.map(async (p) => {
          let count = 0;
          const key = `${p.participant_type}:${p.artist_id || p.venue_id || p.text_value}`;

          try {
            if (p.participant_type === 'artist' && p.artist_id) {
              // Use artist_id from events table to join with artist_id from scene_participants
              const { count: eventCount } = await supabase
                .from('events')
                .select('id', { count: 'exact', head: true })
                .gte('event_date', now)
                .eq('artist_id', p.artist_id);

              count = eventCount || 0;
            } else if (p.participant_type === 'venue' && p.venue_id) {
              // Use venue_id from events table to join with venue_id from scene_participants
              const { count: eventCount } = await supabase
                .from('events')
                .select('id', { count: 'exact', head: true })
                .gte('event_date', now)
                .eq('venue_id', p.venue_id);

              count = eventCount || 0;
            } else if (p.participant_type === 'city' && p.text_value) {
              const { count: eventCount } = await supabase
                .from('events')
                .select('id', { count: 'exact', head: true })
                .gte('event_date', now)
                .eq('venue_city', p.text_value);

              count = eventCount || 0;
            }

            counts.set(key, count);
          } catch (error) {
            console.error(`Error loading event count for ${key}:`, error);
            counts.set(key, 0);
          }
        })
      );

      setParticipantEventCounts(counts);
    } catch (error) {
      console.error('Error loading participant event counts:', error);
    }
  };

  const loadParticipantImages = async () => {
    if (!scene?.participants) return;

    const images = new Map<string, string>();

    try {
      // Get images for artists
      const artistIds = scene.participants
        .filter(p => p.participant_type === 'artist' && p.artist_id)
        .map(p => p.artist_id!);

      if (artistIds.length > 0) {
        const { data: artists } = await supabase
          .from('artists')
          .select('id, image_url')
          .in('id', artistIds);

        artists?.forEach(a => {
          if (a.image_url) {
            images.set(`artist:${a.id}`, a.image_url);
          }
        });
      }

      // Get images for venues
      const venueIds = scene.participants
        .filter(p => p.participant_type === 'venue' && p.venue_id)
        .map(p => p.venue_id!);

      if (venueIds.length > 0) {
        const { data: venues } = await supabase
          .from('venues')
          .select('id, image_url')
          .in('id', venueIds);

        venues?.forEach(v => {
          if (v.image_url) {
            images.set(`venue:${v.id}`, v.image_url);
          }
        });
      }

      setParticipantImages(images);
    } catch (error) {
      console.error('Error loading participant images:', error);
    }
  };

  const handleParticipantClick = (participant: { type: string; name: string; id: string; participantId?: string; textValue?: string }) => {
    // Open detail modals for artists and venues
    if (participant.type === 'artist' && participant.participantId) {
      setSelectedArtistId(participant.participantId);
      setSelectedArtistName(participant.name);
      setArtistModalOpen(true);
    } else if (participant.type === 'venue' && participant.participantId) {
      setSelectedVenueId(participant.participantId);
      setSelectedVenueName(participant.name);
      setVenueModalOpen(true);
    } else if (participant.type === 'artist' && participant.name) {
      // Fallback to name if no participantId - still open modal
      setSelectedArtistId(participant.id);
      setSelectedArtistName(participant.name);
      setArtistModalOpen(true);
    } else if (participant.type === 'venue' && participant.name) {
      // Fallback to name if no participantId - still open modal
      setSelectedVenueId(participant.id);
      setSelectedVenueName(participant.name);
      setVenueModalOpen(true);
    }
    // Cities and genres don't have detail modals, so do nothing
  };

  const loadSceneDetails = async () => {
    setLoading(true);
    try {
      const sceneData = await SceneService.getSceneDetails(sceneId, userId);
      setScene(sceneData);
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
        <Icon name="refresh" size={24} className="animate-spin" color="var(--neutral-600)" />
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 pt-4 pb-6">
          <Button variant="ghost" onClick={onBack} className="mb-4" style={{
            height: 'var(--size-button-height, 36px)',
            paddingLeft: 'var(--spacing-small, 12px)',
            paddingRight: 'var(--spacing-small, 12px)',
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)'
          }}>
            <Icon name="leftArrow" size={16} style={{ marginRight: 'var(--spacing-inline, 6px)' }} color="var(--neutral-900)" />
            Back to Discover
          </Button>
          <div className="text-center py-12 text-muted-foreground">
            <p>Scene not found</p>
          </div>
        </div>
      </div>
    );
  }

  const progress = scene.userProgress;
  const hasProgress = progress && progress.discovery_state !== 'undiscovered';
  
  // Get participants by type
  const venues = scene.participants?.filter(p => p.participant_type === 'venue' && p.venue_name) || [];
  const artists = scene.participants?.filter(p => p.participant_type === 'artist' && p.artist_name) || [];
  const genres = scene.participants?.filter(p => p.participant_type === 'genre' && p.text_value) || [];
  const cities = scene.participants?.filter(p => p.participant_type === 'city' && p.text_value) || [];

  // Calculate totals for progress
  const totalArtists = artists.length;
  const totalVenues = venues.length;
  const totalCities = cities.length;
  const totalGenres = genres.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div 
        className="max-w-6xl mx-auto px-4 sm:px-6 pt-4"
        style={{ 
          paddingBottom: `calc(var(--spacing-bottom-nav, 32px) + env(safe-area-inset-bottom, 0px) + var(--spacing-grouped, 24px))`
        }}
      >
        {/* Back Button */}
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-6">
          <Icon name="leftArrow" size={16} className="mr-2" color="var(--neutral-900)" />
          Back to Discover
        </Button>

        {/* Hero Section */}
        <div className="mb-8">
          {(scene.image_url || scene.scene_url) && (
            <div className="w-full h-80 rounded-2xl overflow-hidden mb-6 shadow-lg">
              <img
                src={scene.image_url || scene.scene_url || ''}
                alt={scene.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight">{scene.name}</h1>
            
            {scene.short_description && (
              <p className="text-xl text-muted-foreground font-medium">
                {scene.short_description}
              </p>
            )}
            
            {scene.description && (
              <p className="text-base text-muted-foreground leading-relaxed max-w-3xl">
                {scene.description}
              </p>
            )}
          </div>
        </div>

        {/* User Progress Section */}
        {hasProgress && (
          <Card 
            className="mb-8 shadow-lg"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(236, 72, 153, 0.2)',
              borderRadius: 'var(--radius-corner, 20px)',
            }}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-synth-pink/10">
                  <Icon name="trendingUp" size={24} color="var(--brand-pink-500)" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">Your Progress</h2>
                  <p className="text-sm text-muted-foreground">Track your journey through this scene</p>
                </div>
                <Badge 
                  variant={progress.discovery_state === 'completed' ? 'default' : 'secondary'}
                  className="text-sm px-3 py-1"
                >
                  {progress.discovery_state.replace('_', ' ')}
                </Badge>
              </div>

              {/* Overall Progress Bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">Overall Progress</span>
                  <span className="text-lg font-bold text-synth-pink">{progress.progress_percentage}%</span>
                </div>
                <div 
                  className="w-full overflow-hidden"
                  style={{
                    height: '12px',
                    backgroundColor: 'var(--neutral-100)',
                    borderRadius: 'var(--radius-corner, 10px)'
                  }}
                >
                  <div
                    className="h-full transition-all duration-500"
                    style={{ 
                      width: `${progress.progress_percentage}%`,
                      background: 'var(--gradient-brand)',
                      borderRadius: progress.progress_percentage >= 100 
                        ? 'var(--radius-corner, 10px)' 
                        : 'var(--radius-corner, 10px) 0 0 var(--radius-corner, 10px)',
                      minWidth: progress.progress_percentage > 0 ? '4px' : '0'
                    }}
                  />
                </div>
              </div>

              {/* Detailed Progress Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {totalArtists > 0 && (
                  <div 
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.5)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon name="music" size={16} color="var(--neutral-600)" />
                        <span className="text-sm font-medium">Artists</span>
                      </div>
                      <span className="text-sm font-bold">
                        {progress.artists_experienced}/{totalArtists}
                      </span>
                    </div>
                    <div 
                      className="w-full overflow-hidden"
                      style={{
                        height: '8px',
                        backgroundColor: 'var(--neutral-100)',
                        borderRadius: 'var(--radius-corner, 10px)'
                      }}
                    >
                      <div
                        className="h-full transition-all"
                        style={{ 
                          width: `${totalArtists > 0 ? (progress.artists_experienced / totalArtists) * 100 : 0}%`,
                          backgroundColor: 'var(--brand-pink-500)',
                          borderRadius: (progress.artists_experienced / totalArtists) >= 1 
                            ? 'var(--radius-corner, 10px)' 
                            : 'var(--radius-corner, 10px) 0 0 var(--radius-corner, 10px)',
                          minWidth: (progress.artists_experienced / totalArtists) > 0 ? '4px' : '0'
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {totalVenues > 0 && (
                  <div 
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.5)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon name="location" size={16} color="var(--neutral-600)" />
                        <span className="text-sm font-medium">Venues</span>
                      </div>
                      <span className="text-sm font-bold">
                        {progress.venues_experienced}/{totalVenues}
                      </span>
                    </div>
                    <div 
                      className="w-full overflow-hidden"
                      style={{
                        height: '8px',
                        backgroundColor: 'var(--neutral-100)',
                        borderRadius: 'var(--radius-corner, 10px)'
                      }}
                    >
                      <div
                        className="h-full transition-all"
                        style={{ 
                          width: `${totalVenues > 0 ? (progress.venues_experienced / totalVenues) * 100 : 0}%`,
                          backgroundColor: 'var(--brand-pink-500)',
                          borderRadius: (progress.venues_experienced / totalVenues) >= 1 
                            ? 'var(--radius-corner, 10px)' 
                            : 'var(--radius-corner, 10px) 0 0 var(--radius-corner, 10px)',
                          minWidth: (progress.venues_experienced / totalVenues) > 0 ? '4px' : '0'
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {totalCities > 0 && (
                  <div 
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.5)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon name="location" size={16} color="var(--neutral-600)" />
                        <span className="text-sm font-medium">Cities</span>
                      </div>
                      <span className="text-sm font-bold">
                        {progress.cities_experienced}/{totalCities}
                      </span>
                    </div>
                    <div 
                      className="w-full overflow-hidden"
                      style={{
                        height: '8px',
                        backgroundColor: 'var(--neutral-100)',
                        borderRadius: 'var(--radius-corner, 10px)'
                      }}
                    >
                      <div
                        className="h-full transition-all"
                        style={{ 
                          width: `${totalCities > 0 ? (progress.cities_experienced / totalCities) * 100 : 0}%`,
                          backgroundColor: 'var(--brand-pink-500)',
                          borderRadius: (progress.cities_experienced / totalCities) >= 1 
                            ? 'var(--radius-corner, 10px)' 
                            : 'var(--radius-corner, 10px) 0 0 var(--radius-corner, 10px)',
                          minWidth: (progress.cities_experienced / totalCities) > 0 ? '4px' : '0'
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {totalGenres > 0 && (
                  <div 
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.5)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon name="mediumShootingStar" size={16} color="var(--neutral-600)" />
                        <span className="text-sm font-medium">Genres</span>
                      </div>
                      <span className="text-sm font-bold">
                        {progress.genres_experienced}/{totalGenres}
                      </span>
                    </div>
                    <div 
                      className="w-full overflow-hidden"
                      style={{
                        height: '8px',
                        backgroundColor: 'var(--neutral-100)',
                        borderRadius: 'var(--radius-corner, 10px)'
                      }}
                    >
                      <div
                        className="h-full transition-all"
                        style={{ 
                          width: `${totalGenres > 0 ? (progress.genres_experienced / totalGenres) * 100 : 0}%`,
                          backgroundColor: 'var(--brand-pink-500)',
                          borderRadius: (progress.genres_experienced / totalGenres) >= 1 
                            ? 'var(--radius-corner, 10px)' 
                            : 'var(--radius-corner, 10px) 0 0 var(--radius-corner, 10px)',
                          minWidth: (progress.genres_experienced / totalGenres) > 0 ? '4px' : '0'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Events Attended */}
              {progress.events_experienced > 0 && (
                <div 
                  className="mt-4 p-3 rounded-lg flex items-center gap-3"
                  style={{
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgba(236, 72, 153, 0.2)',
                  }}
                >
                  <Icon name="circleCheck" size={24} className="flex-shrink-0" color="var(--brand-pink-500)" />
                  <div>
                    <p className="text-sm font-medium">
                      <span className="text-synth-pink font-bold">{progress.events_experienced}</span> events attended
                    </p>
                    <p className="text-xs text-muted-foreground">Keep exploring to complete this scene!</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Participants Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-6">
            <Icon name="mediumShootingStar" size={24} color="var(--brand-pink-500)" />
            <h2 className="text-2xl font-bold">Participants</h2>
          </div>

          <div className="space-y-3">
            {/* Venues */}
            {venues.map((p) => {
              const key = `venue:${p.venue_id}`;
              const isExperienced = experiencedParticipants.has(key);
              const eventCount = participantEventCounts.get(key) || 0;
              const imageUrl = participantImages.get(key);

              return (
                <Card
                  key={p.id}
                  className="cursor-pointer transition-all hover:shadow-lg"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: 'var(--radius-corner, 16px)',
                  }}
                  onClick={() => handleParticipantClick({
                    type: 'venue',
                    name: p.venue_name || '',
                    id: p.id,
                    participantId: p.venue_id,
                  })}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Image */}
                      <div className="flex-shrink-0">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={p.venue_name}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                            <Icon name="location" size={35} color="var(--neutral-600)" />
                          </div>
                        )}
                      </div>

                      {/* Name and Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="truncate" style={{
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-h3-size, 18px)',
                            fontWeight: 'var(--typography-h3-weight, 600)',
                            lineHeight: 'var(--typography-h3-line-height, 1.4)',
                            color: 'var(--neutral-900)'
                          }}>{p.venue_name}</h3>
                          {isExperienced && (
                            <Icon name="circleCheck" size={24} className="flex-shrink-0" color="var(--status-success-500)" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap" style={{
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          color: 'var(--neutral-600)'
                        }}>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <Icon name="calendar" size={24} color="var(--neutral-600)" />
                            {eventCount} {eventCount === 1 ? 'upcoming event' : 'upcoming events'}
                          </span>
                          <div
                            className="flex-shrink-0"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: '25px',
                              paddingLeft: 'var(--spacing-small, 12px)',
                              paddingRight: 'var(--spacing-small, 12px)',
                              borderRadius: 'var(--radius-corner, 10px)',
                              backgroundColor: isExperienced ? 'var(--brand-pink-050)' : 'var(--neutral-100)',
                              border: isExperienced ? '2px solid var(--brand-pink-500)' : '2px solid var(--neutral-200)',
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
                              lineHeight: 'var(--typography-meta-line-height, 1.5)',
                              color: isExperienced ? 'var(--brand-pink-500)' : 'var(--neutral-900)',
                              boxShadow: '0 4px 4px 0 var(--shadow-color)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isExperienced ? 'Experienced' : 'Not Experienced'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Artists */}
            {artists.map((p) => {
              const key = `artist:${p.artist_id}`;
              const isExperienced = experiencedParticipants.has(key);
              const eventCount = participantEventCounts.get(key) || 0;
              const imageUrl = participantImages.get(key);

              return (
                <Card
                  key={p.id}
                  className="cursor-pointer transition-all hover:shadow-lg"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: 'var(--radius-corner, 16px)',
                  }}
                  onClick={() => handleParticipantClick({
                    type: 'artist',
                    name: p.artist_name || '',
                    id: p.id,
                    participantId: p.artist_id,
                  })}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Image */}
                      <div className="flex-shrink-0">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={p.artist_name}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                            <Icon name="music" size={35} color="var(--neutral-600)" />
                          </div>
                        )}
                      </div>

                      {/* Name and Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="truncate" style={{
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-h3-size, 18px)',
                            fontWeight: 'var(--typography-h3-weight, 600)',
                            lineHeight: 'var(--typography-h3-line-height, 1.4)',
                            color: 'var(--neutral-900)'
                          }}>{p.artist_name}</h3>
                          {isExperienced && (
                            <Icon name="circleCheck" size={24} className="flex-shrink-0" color="var(--status-success-500)" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap" style={{
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          color: 'var(--neutral-600)'
                        }}>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <Icon name="calendar" size={24} color="var(--neutral-600)" />
                            {eventCount} {eventCount === 1 ? 'upcoming event' : 'upcoming events'}
                          </span>
                          <div
                            className="flex-shrink-0"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: '25px',
                              paddingLeft: 'var(--spacing-small, 12px)',
                              paddingRight: 'var(--spacing-small, 12px)',
                              borderRadius: 'var(--radius-corner, 10px)',
                              backgroundColor: isExperienced ? 'var(--brand-pink-050)' : 'var(--neutral-100)',
                              border: isExperienced ? '2px solid var(--brand-pink-500)' : '2px solid var(--neutral-200)',
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
                              lineHeight: 'var(--typography-meta-line-height, 1.5)',
                              color: isExperienced ? 'var(--brand-pink-500)' : 'var(--neutral-900)',
                              boxShadow: '0 4px 4px 0 var(--shadow-color)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isExperienced ? 'Experienced' : 'Not Experienced'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Cities */}
            {cities.map((p) => {
              const key = `city:${p.text_value}`;
              const isExperienced = experiencedParticipants.has(key);
              const eventCount = participantEventCounts.get(key) || 0;

              return (
                <Card
                  key={p.id}
                  className="cursor-pointer transition-all hover:shadow-lg"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: 'var(--radius-corner, 16px)',
                  }}
                  onClick={() => handleParticipantClick({
                    type: 'city',
                    name: p.text_value || '',
                    id: p.id,
                    textValue: p.text_value,
                  })}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0">
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                          <Icon name="location" size={35} color="var(--neutral-600)" />
                        </div>
                      </div>

                      {/* Name and Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="truncate" style={{
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-h3-size, 18px)',
                            fontWeight: 'var(--typography-h3-weight, 600)',
                            lineHeight: 'var(--typography-h3-line-height, 1.4)',
                            color: 'var(--neutral-900)'
                          }}>{p.text_value}</h3>
                          {isExperienced && (
                            <Icon name="circleCheck" size={24} className="flex-shrink-0" color="var(--status-success-500)" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap" style={{
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          color: 'var(--neutral-600)'
                        }}>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <Icon name="calendar" size={24} color="var(--neutral-600)" />
                            {eventCount} {eventCount === 1 ? 'upcoming event' : 'upcoming events'}
                          </span>
                          <div
                            className="flex-shrink-0"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: '25px',
                              paddingLeft: 'var(--spacing-small, 12px)',
                              paddingRight: 'var(--spacing-small, 12px)',
                              borderRadius: 'var(--radius-corner, 10px)',
                              backgroundColor: isExperienced ? 'var(--brand-pink-050)' : 'var(--neutral-100)',
                              border: isExperienced ? '2px solid var(--brand-pink-500)' : '2px solid var(--neutral-200)',
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
                              lineHeight: 'var(--typography-meta-line-height, 1.5)',
                              color: isExperienced ? 'var(--brand-pink-500)' : 'var(--neutral-900)',
                              boxShadow: '0 4px 4px 0 var(--shadow-color)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isExperienced ? 'Experienced' : 'Not Experienced'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Genres */}
            {genres.map((p) => {
              const key = `genre:${p.text_value}`;
              const eventCount = participantEventCounts.get(key) || 0;

              return (
                <Card
                  key={p.id}
                  className="cursor-pointer transition-all hover:shadow-lg"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: 'var(--radius-corner, 16px)',
                  }}
                  onClick={() => handleParticipantClick({
                    type: 'genre',
                    name: p.text_value || '',
                    id: p.id,
                    textValue: p.text_value,
                  })}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0">
                        <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                          <Icon name="mediumShootingStar" size={35} color="var(--neutral-600)" />
                        </div>
                      </div>

                      {/* Name and Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="truncate" style={{
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-h3-size, 18px)',
                            fontWeight: 'var(--typography-h3-weight, 600)',
                            lineHeight: 'var(--typography-h3-line-height, 1.4)',
                            color: 'var(--neutral-900)'
                          }}>{p.text_value}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Icon name="calendar" size={16} color="var(--neutral-900)" />
                            {eventCount} {eventCount === 1 ? 'upcoming event' : 'upcoming events'}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            Genre
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Upcoming Events */}
        {scene.upcomingEvents.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Icon name="calendar" size={24} color="var(--brand-pink-500)" />
              <h2 className="text-2xl font-bold">Upcoming Events ({scene.upcomingEvents.length})</h2>
            </div>
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
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Icon name="twoUsers" size={24} color="var(--brand-pink-500)" />
              <h2 className="text-2xl font-bold">Active Reviewers ({scene.activeReviewers.length})</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {scene.activeReviewers.map((reviewer) => (
                <Card
                  key={reviewer.user_id}
                  className="cursor-pointer hover:shadow-md transition-all"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    borderRadius: 'var(--radius-corner, 16px)',
                  }}
                  onClick={() => onNavigateToProfile?.(reviewer.user_id)}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col items-center text-center space-y-2">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={reviewer.avatar_url || undefined} />
                        <AvatarFallback className="bg-synth-pink/10 text-synth-pink">
                          {reviewer.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="w-full">
                        <p className="text-sm font-medium truncate">{reviewer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {reviewer.review_count} {reviewer.review_count === 1 ? 'review' : 'reviews'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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

      {/* Artist Detail Modal */}
      {selectedArtistId && (
        <ArtistDetailModal
          isOpen={artistModalOpen}
          onClose={() => {
            setArtistModalOpen(false);
            setSelectedArtistId(null);
            setSelectedArtistName('');
          }}
          artistId={selectedArtistId}
          artistName={selectedArtistName}
          currentUserId={userId}
        />
      )}

      {/* Venue Detail Modal */}
      {selectedVenueId && (
        <VenueDetailModal
          isOpen={venueModalOpen}
          onClose={() => {
            setVenueModalOpen(false);
            setSelectedVenueId(null);
            setSelectedVenueName('');
          }}
          venueId={selectedVenueId}
          venueName={selectedVenueName}
          currentUserId={userId}
        />
      )}

    </div>
  );
};
