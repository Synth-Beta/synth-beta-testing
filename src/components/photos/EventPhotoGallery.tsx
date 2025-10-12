/**
 * Event Photo Gallery
 * Display user-uploaded photos from events with likes and comments
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Heart, MessageCircle, Trash2, Loader2, Image as ImageIcon, Upload } from 'lucide-react';
import EventPhotoService, { EventPhoto } from '@/services/eventPhotoService';
import { UploadEventPhotoModal } from './UploadEventPhotoModal';
import { PhotoCommentsModal } from './PhotoCommentsModal';

interface EventPhotoGalleryProps {
  eventId: string;
  eventTitle: string;
  canUpload?: boolean;
}

export function EventPhotoGallery({ eventId, eventTitle, canUpload = true }: EventPhotoGalleryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<EventPhoto | null>(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, [eventId]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const photosData = await EventPhotoService.getEventPhotos(eventId, 50);
      setPhotos(photosData);
    } catch (error) {
      console.error('Error loading photos:', error);
      toast({
        title: 'Error',
        description: 'Failed to load event photos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (photo: EventPhoto) => {
    try {
      await EventPhotoService.togglePhotoLike(photo.id, !photo.user_has_liked);
      
      // Update local state
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                user_has_liked: !p.user_has_liked,
                likes_count: p.user_has_liked ? p.likes_count - 1 : p.likes_count + 1,
              }
            : p
        )
      );
    } catch (error) {
      console.error('Error liking photo:', error);
      toast({
        title: 'Error',
        description: 'Failed to like photo',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (photo: EventPhoto) => {
    if (!confirm('Are you sure you want to delete this photo?')) return;

    try {
      await EventPhotoService.deletePhoto(photo.id);
      toast({
        title: 'Photo Deleted',
        description: 'Your photo has been removed',
      });
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (error) {
      console.error('Error deleting photo:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete photo',
        variant: 'destructive',
      });
    }
  };

  const PhotoCard = ({ photo }: { photo: EventPhoto }) => (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        <img
          src={photo.photo_url}
          alt={photo.caption || 'Event photo'}
          className="w-full aspect-square object-cover cursor-pointer"
          onClick={() => {
            // Open photo in modal/lightbox (future enhancement)
          }}
        />
        {photo.is_featured && (
          <Badge className="absolute top-2 right-2 bg-yellow-500">
            ⭐ Featured
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        {/* User Info */}
        <div className="flex items-center gap-2 mb-2">
          {photo.user_avatar_url ? (
            <img
              src={photo.user_avatar_url}
              alt={photo.user_name}
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
            className={photo.user_has_liked ? 'text-red-500' : 'text-gray-600'}
          >
            <Heart className={`h-4 w-4 mr-1 ${photo.user_has_liked ? 'fill-current' : ''}`} />
            {photo.likes_count}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedPhoto(photo);
              setShowCommentsModal(true);
            }}
            className="text-gray-600"
          >
            <MessageCircle className="h-4 w-4 mr-1" />
            {photo.comments_count}
          </Button>

          {user?.id === photo.user_id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(photo)}
              className="text-gray-600 hover:text-red-600 ml-auto"
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
          <p className="text-sm text-gray-600">
            {photos.length} photo{photos.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canUpload && (
          <Button onClick={() => setShowUploadModal(true)} size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Upload Photo
          </Button>
        )}
      </div>

      {/* Gallery Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      ) : photos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ImageIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-semibold mb-2">No Photos Yet</h4>
            <p className="text-gray-600 text-sm mb-4">
              Be the first to share a photo from this event!
            </p>
            {canUpload && (
              <Button onClick={() => setShowUploadModal(true)}>
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

      {/* Upload Modal */}
      {user && (
        <UploadEventPhotoModal
          open={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          eventId={eventId}
          eventTitle={eventTitle}
          userId={user.id}
          onPhotoUploaded={() => {
            setShowUploadModal(false);
            loadPhotos();
          }}
        />
      )}

      {/* Comments Modal */}
      {selectedPhoto && (
        <PhotoCommentsModal
          open={showCommentsModal}
          onClose={() => {
            setShowCommentsModal(false);
            setSelectedPhoto(null);
          }}
          photo={selectedPhoto}
          onCommentAdded={loadPhotos}
        />
      )}
    </div>
  );
}

export default EventPhotoGallery;

