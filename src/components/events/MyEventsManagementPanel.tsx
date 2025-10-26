/**
 * Simplified My Events Management Panel
 * Shows only events created by the current user
 * No claiming logic - just simple event management
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Plus, RefreshCw, MapPin, Clock, Users, Loader2, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAccountType } from '@/hooks/useAccountType';
import EventManagementService from '@/services/eventManagementService';
import { EventCreationModal } from './EventCreationModal';

export function MyEventsManagementPanel() {
  const { user } = useAccountType();
  const { toast } = useToast();
  const [createdEvents, setCreatedEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [canCreateEvents, setCanCreateEvents] = useState(false);

  const { isCreator, isBusiness, isAdmin } = useAccountType();

  useEffect(() => {
    loadEvents();
    checkCreatePermissions();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const events = await EventManagementService.getMyCreatedEvents();
      setCreatedEvents(events);
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        title: 'Error loading events',
        description: 'Failed to load your created events.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const checkCreatePermissions = async () => {
    try {
      const canCreate = await EventManagementService.canCreateEvents();
      setCanCreateEvents(canCreate);
    } catch (error) {
      console.error('Error checking permissions:', error);
      setCanCreateEvents(false);
    }
  };

  const handleEventCreated = (newEvent: any) => {
    setCreatedEvents(prev => [newEvent, ...prev]);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return;
    }

    try {
      await EventManagementService.deleteEvent(eventId);
      setCreatedEvents(prev => prev.filter(event => event.id !== eventId));
      toast({
        title: 'Event deleted',
        description: 'The event has been deleted successfully.',
      });
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete event',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const EventCard = ({ event }: { event: any }) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-2">{event.title}</CardTitle>
            {event.artist_name && (
              <p className="text-purple-600 font-medium mb-1">{event.artist_name}</p>
            )}
            {event.venue_name && (
              <div className="flex items-center gap-1 text-gray-600 text-sm">
                <MapPin className="h-4 w-4" />
                <span>{event.venue_name}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast({
                  title: 'Edit Event',
                  description: 'Event editing features coming soon!',
                });
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteEvent(event.id)}
              className="text-red-600 hover:text-red-700 hover:border-red-300"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-2">
          {event.event_date && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(event.event_date)}</span>
              <Clock className="h-4 w-4 ml-2" />
              <span>{formatTime(event.event_date)}</span>
            </div>
          )}
          
          {(event.venue_capacity || event.estimated_attendance) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="h-4 w-4" />
              {event.venue_capacity && <span>Capacity: {event.venue_capacity.toLocaleString()}</span>}
              {event.venue_capacity && event.estimated_attendance && <span>•</span>}
              {event.estimated_attendance && <span>Est. Attendance: {event.estimated_attendance.toLocaleString()}</span>}
            </div>
          )}

          {event.age_restriction && (
            <Badge variant="outline" className="text-xs">
              {event.age_restriction}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (!canCreateEvents) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">My Events</h1>
            <p className="text-gray-600 mb-8">
              Only business, creator, and admin accounts can create events.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-blue-900 mb-2">What you can do:</h2>
              <ul className="text-blue-800 space-y-1">
                <li>• Express interest in events</li>
                <li>• Meet people going to the same events</li>
                <li>• Chat with matched users</li>
                <li>• Leave reviews and ratings</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Events</h1>
              <p className="text-gray-600">Manage your created events</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={loadEvents}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {createdEvents.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">You haven't created any events yet</p>
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Event
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Created Events ({createdEvents.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {createdEvents.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <EventCreationModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onEventCreated={handleEventCreated}
        />
      </div>
    </div>
  );
}
