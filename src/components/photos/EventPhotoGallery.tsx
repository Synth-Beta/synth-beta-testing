/**
 * Event Photo Gallery
 * Display user-uploaded photos from events with likes and comments
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useAuth } from '@/hooks/useAuth';
import { Heart, MessageCircle, Trash2, Image as ImageIcon, Upload } from 'lucide-react';
import { SynthLoadingInline } from '@/components/ui/SynthLoader';
import EventPhotoService, { EventPhoto } from '@/services/eventPhotoService';

interface EventPhotoGalleryProps {
  eventId: string;
  eventTitle: string;
  canUpload?: boolean;
}

export function EventPhotoGallery({ eventId, eventTitle, canUpload = true }: EventPhotoGalleryProps) {
  const { user } = useAuth();
const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhotos();
  }, [eventId]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const photosData = await EventPhotoService.getEventPhotos(eventId, 50);
      setPhotos(photosData);
      // Don't show error if no photos found - that's expected if no reviews have photos
    } catch (error) {
      console.error('Error loading photos:', error);
      setPhotos([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (photo: EventPhoto) => {
    // Photos in reviews don't have separate likes - they use review likes
    };

  const handleDelete = async (photo: EventPhoto) => {
    // Photos are part of reviews - users should edit the review to remove photos
    };

  const PhotoCard = ({ photo }: { photo: EventPhoto }) => (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        <img
          src={photo.photo_url}
          alt={photo.caption || `${eventTitle} event photo by ${photo.user_name}`}
          className="w-full aspect-square object-cover cursor-pointer"
          onClick={() => {
            // Open photo in modal/lightbox (future enhancement)
          }}
        />
        {photo.is_featured && (
          <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
            ⭐ Featured
          </span>
        )}
      </div>

      <CardContent className="p-4">
        {/* User Info */}
        <div className="flex items-center gap-2 mb-2">
          {photo.user_avatar_url ? (
            <img
              src={photo.user_avatar_url}
              alt={`${photo.user_name}'s profile picture`}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-purple-600 font-semibold text-sm">
                {photo.user_name.charAt(0)}
              </span>
            </div>
          )}
          <span className="font-medium text-sm">{photo.user_name}</span>
        </div>

        {/* Caption */}
        {photo.caption && (
          <p className="text-sm text-gray-700 mb-3">{photo.caption}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleLike(photo)}
            className={photo.user_has_liked ? 'var(--status-error-500)' : 'var(--neutral-600)'}
          >
            <Heart className={`h-4 w-4 mr-1 ${photo.user_has_liked ? 'fill-current' : ''}`} />
            {photo.likes_count}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              }}
            className="var(--neutral-600)"
          >
            <MessageCircle className="h-4 w-4 mr-1" />
            {photo.comments_count}
          </Button>

          {user?.id === photo.user_id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(photo)}
              className="var(--neutral-600) hover:text-red-600 ml-auto"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Timestamp */}
        <p className="text-xs text-gray-500 mt-2">
          {new Date(photo.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">Event Photos</h3>
          <p className="text-sm var(--neutral-600)">
            {photos.length} photo{photos.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canUpload && (
          <Button 
            onClick={() => {
              }} 
            size="sm"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Photo
          </Button>
        )}
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <SynthLoadingInline text="Loading photos..." size="lg" />
      ) : photos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-semibold mb-2">No Photos Yet</h4>
            <p className="var(--neutral-600) text-sm mb-4">
              Be the first to share a photo from this event!
            </p>
            {canUpload && (
              <Button onClick={() => {
                }}>
                <Upload className="h-4 w-4 mr-2" />
                Upload First Photo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo) => (
            <PhotoCard key={photo.id} photo={photo} />
          ))}
        </div>
      )}

    </div>
  );
}

export default EventPhotoGallery;

