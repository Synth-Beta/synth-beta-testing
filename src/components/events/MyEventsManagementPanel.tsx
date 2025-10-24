/**
 * My Events Management Panel
 * Shows user's created events, claimed events, and pending claims
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAccountType } from '@/hooks/useAccountType';
import EventManagementService from '@/services/eventManagementService';
import { EventCreationModal } from './EventCreationModal';
import { EventPromotionModal } from './EventPromotionModal';
import { EventEditModal } from './EventEditModal';
import { Calendar, MapPin, Clock, Edit, Trash2, Award, Loader2, Plus, TrendingUp } from 'lucide-react';

export function MyEventsManagementPanel() {
  const { user } = useAuth();
  const { accountInfo, isCreator, isBusiness, isAdmin } = useAccountType();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [createdEvents, setCreatedEvents] = useState<any[]>([]);
  const [claimedEvents, setClaimedEvents] = useState<any[]>([]);
  const [eventClaims, setEventClaims] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEventForPromotion, setSelectedEventForPromotion] = useState<any | null>(null);
  const [selectedEventForEdit, setSelectedEventForEdit] = useState<any | null>(null);

  useEffect(() => {
    if (user) {
      loadEvents();
    }
  }, [user]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      // Load created events if business/admin
      if (isBusiness() || isAdmin()) {
        const created = await EventManagementService.getUserCreatedEvents();
        setCreatedEvents(created);
      }

      // Load claimed events if creator/admin
      if (isCreator() || isAdmin()) {
        const claimed = await EventManagementService.getClaimedEvents();
        setClaimedEvents(claimed);

        const claims = await EventManagementService.getUserEventClaims();
        setEventClaims(claims);
      }
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your events',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      published: 'default',
      draft: 'secondary',
      cancelled: 'destructive',
      postponed: 'outline',
      pending: 'secondary',
      approved: 'default',
      rejected: 'destructive',
    };

    return (
      <Badge variant={variants[status] || 'default'} className="capitalize">
        {status}
      </Badge>
    );
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      await EventManagementService.deleteEvent(eventId);
      toast({
        title: 'Event Deleted',
        description: 'The event has been removed',
      });
      loadEvents();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete event',
        variant: 'destructive',
      });
    }
  };

  const handlePromoteEvent = (event: any) => {
    setSelectedEventForPromotion(event);
    setShowPromotionModal(true);
  };

  const handleEditEvent = (event: any) => {
    setSelectedEventForEdit(event);
    setShowEditModal(true);
  };

  const EventCard = ({ event, showEdit = true, showClaim = false }: any) => (
    <Card key={event.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {event.poster_image_url && (
            <img
              src={event.poster_image_url}
              alt={event.title}
              className="w-20 h-20 object-cover rounded-lg"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{event.title}</h3>
                <p className="text-sm text-gray-600">{event.artist_name}</p>
              </div>
              {event.event_status && getStatusBadge(event.event_status)}
              {event.claim_status && getStatusBadge(event.claim_status)}
            </div>

            <div className="space-y-1 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="truncate">{event.venue_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(event.event_date)}</span>
                <Clock className="h-4 w-4 ml-2" />
                <span>{formatTime(event.event_date)}</span>
              </div>
            </div>

            {showEdit && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleEditEvent(event)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                {!event.is_promoted && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                    onClick={() => handlePromoteEvent(event)}
                  >
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Promote
                  </Button>
                )}
                {event.is_promoted && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    disabled
                  >
                    <Award className="h-4 w-4 mr-1" />
                    Promoted
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteEvent(event.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            )}

            {showClaim && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-1">Claim Reason:</p>
                <p className="text-sm">{event.claim_reason}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!user || !accountInfo) {
    return null;
  }

  // Only show for business, creator, or admin accounts
  if (!isBusiness() && !isCreator() && !isAdmin()) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">My Events</h2>
          <p className="text-gray-600">Manage your events and claims</p>
        </div>
        {(isBusiness() || isCreator() || isAdmin()) && (
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Event
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      ) : (
        <Tabs defaultValue="my-events" className="w-full">
          <TabsList className={`grid w-full ${(isCreator() || isBusiness() || isAdmin()) ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {(isBusiness() || isCreator() || isAdmin()) && (
              <TabsTrigger value="my-events">
                My Events ({createdEvents.length + claimedEvents.length})
              </TabsTrigger>
            )}
            {(isCreator() || isAdmin()) && (
              <TabsTrigger value="claims">
                Pending Claims ({eventClaims.filter((c) => c.claim_status === 'pending').length})
              </TabsTrigger>
            )}
          </TabsList>

          {(isBusiness() || isCreator() || isAdmin()) && (
            <TabsContent value="my-events" className="space-y-4 mt-4">
              {createdEvents.length === 0 && claimedEvents.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">You don't have any events yet</p>
                    <Button onClick={() => setShowCreateModal(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Event
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Created Events Section */}
                  {createdEvents.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Created Events ({createdEvents.length})
                      </h3>
                      <div className="space-y-3">
                        {createdEvents.map((event) => <EventCard key={event.id} event={event} />)}
                      </div>
                    </div>
                  )}

                  {/* Claimed Events Section */}
                  {claimedEvents.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Award className="h-5 w-5" />
                        Claimed Events ({claimedEvents.length})
                      </h3>
                      <div className="space-y-3">
                        {claimedEvents.map((event) => <EventCard key={event.id} event={event} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          )}

          {(isCreator() || isAdmin()) && (
            <TabsContent value="claims" className="space-y-4 mt-4">
              {eventClaims.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Award className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No claim requests</p>
                  </CardContent>
                </Card>
              ) : (
                eventClaims.map((claim) => (
                  <EventCard
                    key={claim.id}
                    event={{ ...claim.event, claim_status: claim.claim_status, claim_reason: claim.claim_reason }}
                    showEdit={false}
                    showClaim={true}
                  />
                ))
              )}
            </TabsContent>
          )}
        </Tabs>
      )}

      <EventCreationModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onEventCreated={() => {
          setShowCreateModal(false);
          loadEvents();
        }}
      />

      {selectedEventForPromotion && (
        <EventPromotionModal
          open={showPromotionModal}
          onClose={() => {
            setShowPromotionModal(false);
            setSelectedEventForPromotion(null);
          }}
          event={selectedEventForPromotion}
          onPromotionRequested={() => {
            setShowPromotionModal(false);
            setSelectedEventForPromotion(null);
            toast({
              title: 'Success',
              description: 'Your promotion request has been submitted for review',
            });
          }}
        />
      )}

      {selectedEventForEdit && (
        <EventEditModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedEventForEdit(null);
          }}
          event={selectedEventForEdit}
          onEventUpdated={() => {
            setShowEditModal(false);
            setSelectedEventForEdit(null);
            loadEvents(); // Reload events to show updated data
          }}
        />
      )}
    </div>
  );
}

export default MyEventsManagementPanel;

