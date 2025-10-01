import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Music, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
      // Create artist in database
      const { data: artistProfile, error: profileError } = await supabase
        .from('artists')
        .insert([
          {
            jambase_artist_id: `user-created-${Date.now()}`,
            name: formData.name.trim(),
            identifier: `user-created-${formData.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            genres: genreTags.length > 0 ? genreTags : null,
            image_url: formData.imageUrl.trim() || null,
            is_user_created: true,
            bio: formData.description.trim() || null,
          }
        ])
        .select()
        .single();

      if (profileError) throw profileError;

      toast({
        title: "Artist Created! 🎵",
        description: `${formData.name} has been added to your database.`,
      });

      // Convert to the expected format
      const artist = {
        id: artistProfile.id,
        jambase_artist_id: artistProfile.jambase_artist_id,
        name: artistProfile.name,
        description: formData.description.trim() || '',
        genres: (artistProfile as any).genres || [],
        image_url: artistProfile.image_url,
        popularity_score: 0,
        source: 'user_created',
        created_at: artistProfile.created_at,
        updated_at: artistProfile.updated_at,
      };

      onArtistCreated(artist);
      handleClose();
    } catch (error) {
      console.error('Error creating artist:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create artist",
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
            Add Artist Manually
          </DialogTitle>
          <DialogDescription>
            Can't find the artist you're looking for? Add them manually to your database.
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
                  Creating...
                </>
              ) : (
                'Create Artist'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

