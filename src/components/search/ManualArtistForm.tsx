import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Music, Loader2, X, AlertCircle } from 'lucide-react';
import { MissingEntityRequestService } from '@/services/missingEntityRequestService';
import { useToast } from '@/hooks/use-toast';

interface ManualArtistFormProps {
  open: boolean;
  onClose: () => void;
  onArtistCreated: (artist: any) => void;
  initialQuery?: string;
}

export function ManualArtistForm({ open, onClose, onArtistCreated, initialQuery = '' }: ManualArtistFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: initialQuery,
    description: '',
    genres: '',
    imageUrl: '',
  });
  const [genreTags, setGenreTags] = useState<string[]>([]);
  const { toast } = useToast();

  // Update form data when initialQuery changes
  React.useEffect(() => {
    if (open && initialQuery) {
      setFormData(prev => ({ ...prev, name: initialQuery }));
    }
  }, [open, initialQuery]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddGenre = () => {
    const genre = formData.genres.trim();
    if (genre && !genreTags.includes(genre)) {
      setGenreTags(prev => [...prev, genre]);
      setFormData(prev => ({ ...prev, genres: '' }));
    }
  };

  const handleRemoveGenre = (genreToRemove: string) => {
    setGenreTags(prev => prev.filter(g => g !== genreToRemove));
  };

  const handleGenreKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddGenre();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Artist name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit request for missing artist instead of creating directly
      await MissingEntityRequestService.submitRequest({
        entity_type: 'artist',
        entity_name: formData.name.trim(),
        entity_description: formData.description.trim() || undefined,
        entity_image_url: formData.imageUrl.trim() || undefined,
        additional_info: {
          genres: genreTags,
        },
      });

      toast({
        title: "Request Submitted! 🎵",
        description: `Your request for "${formData.name}" has been submitted. We'll review it and add it to the database if approved.`,
      });

      // Don't call onArtistCreated since we're not creating an artist
      // The user will need to wait for admin approval
      handleClose();
    } catch (error) {
      console.error('Error submitting artist request:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({ name: '', description: '', genres: '', imageUrl: '' });
    setGenreTags([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Request Missing Artist
          </DialogTitle>
          <DialogDescription>
            Can't find the artist you're looking for? Submit a request and we'll review it for addition to the database.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Artist Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Artist Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g., The Beatles"
              value={formData.name}
              onChange={handleInputChange}
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="e.g., British rock band from Liverpool"
              value={formData.description}
              onChange={handleInputChange}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {/* Genres */}
          <div className="space-y-2">
            <Label htmlFor="genres">Genres (Optional)</Label>
            <div className="flex gap-2">
              <Input
                id="genres"
                name="genres"
                placeholder="e.g., Rock, Pop, Alternative"
                value={formData.genres}
                onChange={handleInputChange}
                onKeyPress={handleGenreKeyPress}
                disabled={isSubmitting}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddGenre}
                disabled={!formData.genres.trim() || isSubmitting}
              >
                Add
              </Button>
            </div>
            {genreTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {genreTags.map((genre) => (
                  <Badge key={genre} variant="secondary" className="gap-1">
                    {genre}
                    <button
                      type="button"
                      onClick={() => handleRemoveGenre(genre)}
                      disabled={isSubmitting}
                      className="ml-1 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image URL (Optional)</Label>
            <Input
              id="imageUrl"
              name="imageUrl"
              placeholder="https://example.com/artist-image.jpg"
              type="url"
              value={formData.imageUrl}
              onChange={handleInputChange}
              disabled={isSubmitting}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.name.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

