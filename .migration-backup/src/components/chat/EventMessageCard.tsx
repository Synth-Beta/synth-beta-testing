import React, { useState, useEffect } from 'react';
import { Heart, Star, Calendar, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';
import { UserEventService } from '@/services/userEventService';
import { format, parseISO } from 'date-fns';
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid } from '@/utils/entityUuidResolver';

interface EventMessageCardProps {
  eventId: string;
  customMessage?: string;
  onEventClick?: (event: JamBaseEvent) => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onAttendanceToggle?: (eventId: string, attended: boolean) => void;
  currentUserId?: string;
  className?: string;
  refreshTrigger?: number;
}

export function EventMessageCard({
  eventId,
  customMessage,
  onEventClick,
  onInterestToggle,
  onAttendanceToggle,
  currentUserId,
  className = '',
  refreshTrigger,
}: EventMessageCardProps) {
  const [event, setEvent] = useState<JamBaseEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInterested, setIsInterested] = useState(false);
  const [interestLoading, setInterestLoading] = useState(false);
  const [isAttended, setIsAttended] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  useEffect(() => { loadEvent(); }, [eventId]);

  useEffect(() => {
    if (event && currentUserId) {
      checkInterest();
      checkAttendance();
    }
  }, [event, currentUserId]);

  useEffect(() => {
    if (refreshTrigger && event && currentUserId) {
      checkInterest();
      checkAttendance();
    }
  }, [refreshTrigger, event, currentUserId]);

  const checkInterest = async () => {
    if (!event || !currentUserId) return;
    try {
      const interested = await UserEventService.isUserInterested(currentUserId, event.id);
      setIsInterested(interested);
    } catch {
      setIsInterested(false);
    }
  };

  const checkAttendance = async () => {
    if (!event || !currentUserId) return;
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('was_there')
        .eq('user_id', currentUserId)
        .eq('event_id', event.id)
        .maybeSingle();
      if (error && (error.code === 'PGRST116' || error.code === '406')) {
        setIsAttended(false);
        return;
      }
      setIsAttended(data ? Boolean(data.was_there) : false);
    } catch {
      setIsAttended(false);
    }
  };

  const loadEvent = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*, artists(name), venues(name)')
        .eq('id', eventId)
        .single();
      if (!error && data) {
        setEvent({
          ...data,
          artist_name: (data.artists as any)?.name ?? data.artist_name ?? null,
          venue_name: (data.venues as any)?.name ?? data.venue_name ?? null,
        });
        return;
      }
      const { data: viewData, error: viewError } = await supabase
        .from('events_with_artist_venue')
        .select('id, title, description, event_date, doors_time, venue_city, venue_state, venue_address, venue_zip, latitude, longitude, external_url, genres, price_range, ticket_available, images, media_urls, event_media_url, artist_name_normalized, venue_name_normalized')
        .eq('id', eventId)
        .single();
      if (!viewError && viewData) {
        setEvent({
          ...viewData,
          artist_name: (viewData as any).artist_name_normalized ?? null,
          venue_name: (viewData as any).venue_name_normalized ?? null,
        } as JamBaseEvent);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try { return format(parseISO(dateString), 'EEE, MMM d, yyyy'); }
    catch { return dateString; }
  };

  const isPastEvent = event ? new Date(event.event_date) < new Date() : false;
  const isUpcomingEvent = !isPastEvent;

  const heroImage = event?.images?.[0]?.url ?? event?.images?.[0] ?? (event as any)?.event_media_url ?? null;

  if (loading) {
    return (
      <div className={`w-full rounded-2xl overflow-hidden bg-neutral-100 animate-pulse ${className}`} style={{ height: 160 }} />
    );
  }

  if (!event) {
    return (
      <div className={`w-full rounded-2xl p-4 bg-neutral-100 text-sm text-neutral-500 ${className}`}>
        Event not found
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-2xl overflow-hidden cursor-pointer ${className}`}
      style={{ background: 'var(--neutral-900)', boxShadow: '0 2px 16px rgba(0,0,0,0.18)' }}
      onClick={() => onEventClick?.(event)}
    >
      {/* Hero image */}
      {heroImage && (
        <div style={{ width: '100%', height: 140, overflow: 'hidden', position: 'relative' }}>
          <img
            src={typeof heroImage === 'string' ? heroImage : heroImage.url}
            alt={event.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7) 100%)' }} />
          {/* Status badge */}
          <div style={{ position: 'absolute', top: 10, right: 10 }}>
            <span style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: isPastEvent ? 'rgba(255,255,255,0.15)' : 'var(--brand-pink-500)',
              color: '#fff',
              backdropFilter: 'blur(4px)',
            }}>
              {isPastEvent ? 'Past' : 'Upcoming'}
            </span>
          </div>
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '12px 14px 10px' }}>
        {customMessage && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontStyle: 'italic' }}>
            "{customMessage}"
          </p>
        )}
        <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2, marginBottom: 2 }}>
          {event.artist_name || event.title}
        </p>
        {event.artist_name && event.title !== event.artist_name && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>{event.title}</p>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
            <Calendar size={11} />
            {formatDate(event.event_date)}
          </span>
          {event.venue_name && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              <MapPin size={11} />
              {event.venue_name}
            </span>
          )}
        </div>

        {/* Action button */}
        {currentUserId && (
          <div style={{ marginTop: 10 }}>
            {isUpcomingEvent && onInterestToggle && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setInterestLoading(true);
                  try {
                    const next = !isInterested;
                    await onInterestToggle(event.id, next);
                    setIsInterested(next);
                    if (next) {
                      const uuid = getEventUuid(event);
                      trackInteraction.click('interest', event.id, { source: 'chat_event_card' }, uuid || undefined);
                    }
                  } finally {
                    setInterestLoading(false);
                  }
                }}
                disabled={interestLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: isInterested ? 'rgba(255,255,255,0.15)' : 'var(--brand-pink-500)',
                  color: '#fff',
                }}
              >
                <Heart size={13} fill={isInterested ? '#fff' : 'none'} stroke="#fff" />
                {isInterested ? 'Interested' : "I'm Interested"}
              </button>
            )}
            {isPastEvent && (
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  setAttendanceLoading(true);
                  try {
                    const next = !isAttended;
                    if (onAttendanceToggle) {
                      await onAttendanceToggle(event.id, next);
                    }
                    setIsAttended(next);
                    if (next) {
                      window.dispatchEvent(new CustomEvent('open-review-modal', { detail: { event } }));
                    }
                  } finally {
                    setAttendanceLoading(false);
                  }
                }}
                disabled={attendanceLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: isAttended ? 'var(--brand-pink-500)' : 'rgba(255,255,255,0.1)',
                  color: '#fff',
                }}
              >
                <Star size={13} fill={isAttended ? '#fff' : 'none'} stroke="#fff" />
                I Was There!
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
