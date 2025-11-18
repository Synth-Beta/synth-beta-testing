import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Calendar, 
  Users, 
  Music, 
  Bell, 
  Save,
  User,
  Building2,
  Palette
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Tables } from '@/integrations/supabase/types';
import { MusicTagsService, MusicTag } from '@/services/musicTagsService';
import { MUSIC_GENRES } from '@/data/musicGenres';

interface OnboardingPreferencesSettingsProps {
  onClose?: () => void;
}

export const OnboardingPreferencesSettings = ({ onClose }: OnboardingPreferencesSettingsProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<Tables<'users'> | null>(null);
  const [musicTags, setMusicTags] = useState<MusicTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    location_city: '',
    gender: '',
    birthday: '',
    bio: '',
    similar_users_notifications: true
  });
  
  const [musicPreferences, setMusicPreferences] = useState({
    genres: [] as string[],
    artists: [] as string[],
    customGenres: [] as string[],
    customArtists: [] as string[]
  });

  useEffect(() => {
    if (user?.id) {
      fetchUserData();
    }
  }, [user?.id]);

  const fetchUserData = async () => {
    if (!user?.id) return;
    
    try {
      // Fetch profile data
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      if (profileData) {
        setProfile(profileData);
        setFormData({
          location_city: profileData.location_city || '',
          gender: profileData.gender || '',
          birthday: profileData.birthday || '',
          bio: profileData.bio || '',
          similar_users_notifications: profileData.similar_users_notifications ?? true
        });
      }

      // Fetch music tags
      const userMusicTags = await MusicTagsService.getUserMusicTags(user.id);
      setMusicTags(userMusicTags);

      // Separate genres and artists
      const genres = userMusicTags.filter(tag => tag.tag_type === 'genre').map(tag => tag.tag_value);
      const artists = userMusicTags.filter(tag => tag.tag_type === 'artist').map(tag => tag.tag_value);
      
      setMusicPreferences(prev => ({
        ...prev,
        genres,
        artists
      }));

    } catch (error) {
      console.error('Error fetching user data:', error);
      toast({
        title: "Error",
        description: "Failed to load your preferences",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleMusicTagToggle = async (tagType: 'genre' | 'artist', tagValue: string, isSelected: boolean) => {
    if (!user?.id) return;

    try {
      if (isSelected) {
        // Add tag
        await MusicTagsService.addMusicTag(user.id, {
          tag_type: tagType,
          tag_value: tagValue,
          tag_source: 'manual',
          weight: 5
        });
      } else {
        // Remove tag - find the tag ID first
        const existingTag = musicTags.find(tag => 
          tag.tag_type === tagType && tag.tag_value === tagValue
        );
        if (existingTag) {
          await MusicTagsService.removeMusicTag(existingTag.id);
        }
      }

      // Refresh music tags
      const updatedTags = await MusicTagsService.getUserMusicTags(user.id);
      setMusicTags(updatedTags);

      // Update local state
      const genres = updatedTags.filter(tag => tag.tag_type === 'genre').map(tag => tag.tag_value);
      const artists = updatedTags.filter(tag => tag.tag_type === 'artist').map(tag => tag.tag_value);
      
      setMusicPreferences(prev => ({
        ...prev,
        genres,
        artists
      }));

    } catch (error) {
      console.error('Error updating music tag:', error);
      toast({
        title: "Error",
        description: "Failed to update music preferences",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);
    try {
      // Update profile data
      const { error: profileError } = await supabase
        .from('users')
        .update({
          location_city: formData.location_city.trim() || null,
          gender: formData.gender.trim() || null,
          birthday: formData.birthday.trim() || null,
          bio: formData.bio.trim() || null,
          similar_users_notifications: formData.similar_users_notifications,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (profileError) {
        throw profileError;
      }

      toast({
        title: "Success",
        description: "Your preferences have been saved",
      });

      if (onClose) {
        onClose();
      }

    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error",
        description: "Failed to save preferences",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading preferences...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          Profile & Preferences
        </h3>
        <p className="text-sm text-muted-foreground">
          Manage your profile information and personalization settings
        </p>
      </div>

      <Separator />

      {/* Location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Location
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="location">City</Label>
            <Input
              id="location"
              value={formData.location_city}
              onChange={(e) => handleInputChange('location_city', e.target.value)}
              placeholder="Enter your city"
              maxLength={100}
              className="bg-white"
            />
            <p className="text-xs text-muted-foreground">
              Used for local event discovery and recommendations
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Demographics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Demographics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Gender */}
          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Select
              value={formData.gender || undefined}
              onValueChange={(value) => handleInputChange('gender', value)}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select your gender (optional)" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="non-binary">Non-binary</SelectItem>
                <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Birthday */}
          <div className="space-y-2">
            <Label htmlFor="birthday">Birthday</Label>
            <Input
              id="birthday"
              type="date"
              value={formData.birthday}
              onChange={(e) => handleInputChange('birthday', e.target.value)}
              max={(() => {
                const date = new Date();
                date.setFullYear(date.getFullYear() - 13);
                return date.toISOString().split('T')[0];
              })()}
              className="bg-white"
            />
            <p className="text-xs text-muted-foreground">
              Your age (not exact birthday) helps with event recommendations and safety
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bio */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Bio
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="bio">About You</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => handleInputChange('bio', e.target.value)}
              placeholder="Tell people about yourself..."
              maxLength={200}
              rows={3}
              className="bg-white"
            />
            <p className="text-xs text-muted-foreground">
              {formData.bio.length}/200 characters
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Music Preferences */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Music className="w-4 h-4" />
            Music Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Genres */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Favorite Genres</Label>
              <Badge variant="secondary">
                {musicPreferences.genres.length}/7
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MUSIC_GENRES.slice(0, 20).map((genre) => (
                <Button
                  key={genre}
                  type="button"
                  variant={musicPreferences.genres.includes(genre) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleMusicTagToggle('genre', genre, !musicPreferences.genres.includes(genre))}
                  disabled={!musicPreferences.genres.includes(genre) && musicPreferences.genres.length >= 7}
                  className="justify-start text-xs"
                >
                  {genre}
                </Button>
              ))}
            </div>
            {musicPreferences.genres.length >= 7 && (
              <p className="text-xs text-amber-600">
                Maximum of 7 genres selected
              </p>
            )}
          </div>

          {/* Artists */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Favorite Artists</Label>
              <Badge variant="secondary">
                {musicPreferences.artists.length}/15
              </Badge>
            </div>
            {musicPreferences.artists.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {musicPreferences.artists.map((artist) => (
                  <Badge
                    key={artist}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    {artist}
                    <button
                      type="button"
                      onClick={() => handleMusicTagToggle('artist', artist, false)}
                      className="ml-1 text-xs hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add artists by searching for them in the search bar or during onboarding
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="font-medium">Similar Users Notifications</div>
              <div className="text-sm text-muted-foreground">
                Get notified when similar users (age, gender, interests) show interest in events
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Helps you connect with people who share your interests and demographics
              </p>
            </div>
            <Switch
              checked={formData.similar_users_notifications}
              onCheckedChange={(checked) => handleInputChange('similar_users_notifications', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="min-w-[120px]"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};
