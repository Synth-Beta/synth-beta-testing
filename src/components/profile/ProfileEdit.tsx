import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Save, Instagram, User, Music, Users, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Tables } from '@/integrations/supabase/types';
import { SinglePhotoUpload } from '@/components/ui/photo-upload';
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';

interface ProfileEditProps {
  currentUserId: string;
  onBack: () => void;
  onSave: () => void;
}

export const ProfileEdit = ({ currentUserId, onBack, onSave }: ProfileEditProps) => {
  const [profile, setProfile] = useState<Tables<'users'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    instagram_handle: '',
    music_streaming_profile: '',
    avatar_url: null as string | null,
    gender: '',
    birthday: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
  }, [currentUserId]);

  const fetchProfile = async () => {
    try {
      console.log('Fetching profile for user:', currentUserId);
      const selectFields = 'id, user_id, name, avatar_url, bio, instagram_handle, music_streaming_profile, gender, birthday, created_at, updated_at';
      const fetchProfileRecord = async (column: 'user_id' | 'id') => {
        console.log(`ProfileEdit: Attempting profile lookup by ${column}`);
        return await supabase
          .from('users')
          .select(selectFields)
          .eq(column, currentUserId)
          .maybeSingle();
      };

      let profileData: Tables<'users'> | null = null;
      const { data, error } = await fetchProfileRecord('user_id');

      if (error && error.code !== 'PGRST116') {
        console.error('Profile fetch error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        throw error;
      } else {
        profileData = data as Tables<'users'> | null;
      }

      if (!profileData) {
        const { data: fallbackData, error: fallbackError } = await fetchProfileRecord('id');

        if (fallbackError && fallbackError.code !== 'PGRST116') {
          console.error('Profile fetch fallback error:', fallbackError);
          throw fallbackError;
        }

        profileData = fallbackData as Tables<'users'> | null;
      }

      if (!profileData) {
          console.log('No profile found, will create one when user saves');
          setFormData({
            name: '',
            bio: '',
            instagram_handle: '',
            music_streaming_profile: '',
            avatar_url: null,
            gender: '',
            birthday: ''
          });
          setLoading(false);
          return;
        }
        
      console.log('Profile data received:', profileData);
      setProfile(profileData as any);
      setFormData({
        name: profileData.name || '',
        bio: profileData.bio || '',
        instagram_handle: profileData.instagram_handle || '',
        music_streaming_profile: profileData.music_streaming_profile || '',
        avatar_url: profileData.avatar_url || null,
        gender: profileData.gender || '',
        birthday: profileData.birthday || ''
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: "Error",
        description: "Failed to load profile",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    console.log('Save button clicked, form data:', formData);
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const profileData = {
        user_id: currentUserId,
        name: formData.name.trim(),
        bio: formData.bio.trim() || null,
        instagram_handle: formData.instagram_handle.trim() || null,
        music_streaming_profile: formData.music_streaming_profile.trim() || null,
        avatar_url: formData.avatar_url || null,
        gender: formData.gender.trim() || null,
        birthday: formData.birthday.trim() || null,
        updated_at: new Date().toISOString()
      };
      
      console.log('Saving profile with data:', profileData);
      
      let result;
      if (profile && profile.id) {
        // Update existing profile
        console.log('Updating existing profile');
        result = await supabase
          .from('users')
          .update(profileData)
          .eq('user_id', currentUserId)
          .select()
          .single();
      } else {
        // Create new profile
        console.log('Creating new profile');
        result = await supabase
          .from('users')
          .insert(profileData)
          .select()
          .single();
      }

      if (result.error) {
        console.error('Profile save error:', result.error);
        throw result.error;
      }

      console.log('Profile saved successfully:', result.data);
      toast({
        title: "Success",
        description: "Profile saved successfully",
      });
      
      onSave();
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error",
        description: `Failed to save profile: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return <SynthLoadingScreen text="Loading profile..." />;
  }

  return (
    <div className="p-4 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Edit Profile</h1>
            <p className="text-muted-foreground">Update your profile information</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Upload */}
            <SinglePhotoUpload
              value={formData.avatar_url}
              onChange={async (url) => {
                handleInputChange('avatar_url', url || '');
                // Auto-save avatar URL to database immediately after upload
                if (url && profile && profile.id) {
                  try {
                    await supabase
                      .from('users')
                      .update({ avatar_url: url })
                      .eq('user_id', currentUserId);
                    // Update local profile state to reflect change
                    setProfile({ ...profile, avatar_url: url });
                  } catch (error) {
                    console.error('Error auto-saving avatar:', error);
                    // Don't show error toast here as upload already succeeded
                  }
                }
              }}
              userId={currentUserId}
              bucket="profile-avatars"
              maxSizeMB={25}
              label="Profile Picture"
              helperText="Upload a photo to personalize your profile. Max 25MB. Your avatar saves automatically."
              aspectRatio="circle"
            />

            {/* Name Field */}
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter your name"
                maxLength={50}
              />
            </div>

            {/* Bio Field */}
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                placeholder="Tell people about yourself..."
                maxLength={200}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {formData.bio.length}/200 characters
              </p>
            </div>

            {/* Instagram Field */}
            <div className="space-y-2">
              <Label htmlFor="instagram" className="flex items-center gap-2">
                <Instagram className="w-4 h-4" />
                Instagram Handle
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">@</span>
                <Input
                  id="instagram"
                  value={formData.instagram_handle}
                  onChange={(e) => handleInputChange('instagram_handle', e.target.value.replace('@', ''))}
                  placeholder="username"
                  maxLength={100}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your Instagram profile will be linked when people view your profile
              </p>
            </div>

            {/* Music Streaming Profile Field */}
            <div className="space-y-2">
              <Label htmlFor="music-streaming" className="flex items-center gap-2">
                <Music className="w-4 h-4" />
                Music Streaming Profile
              </Label>
              <Input
                id="music-streaming"
                value={formData.music_streaming_profile}
                onChange={(e) => handleInputChange('music_streaming_profile', e.target.value)}
                placeholder="https://open.spotify.com/user/yourusername or @username"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                Share your Spotify, Apple Music, or other streaming profile link. Will display as a clickable link on your profile.
              </p>
            </div>

            {/* Gender Field */}
            <div className="space-y-2">
              <Label htmlFor="gender" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Gender
              </Label>
              <Select
                value={formData.gender || undefined}
                onValueChange={(value) => handleInputChange('gender', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your gender (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non-binary">Non-binary</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="not-specified">Not specified</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Your gender will be shown to other users interested in the same events for trust and safety
              </p>
            </div>

            {/* Birthday Field */}
            <div className="space-y-2">
              <Label htmlFor="birthday" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Birthday
              </Label>
              <Input
                id="birthday"
                type="date"
                value={formData.birthday}
                onChange={(e) => handleInputChange('birthday', e.target.value)}
                max={(() => {
                  const date = new Date();
                  date.setFullYear(date.getFullYear() - 13);
                  return date.toISOString().split('T')[0];
                })()} // User must be at least 13 years old
              />
              <p className="text-xs text-muted-foreground">
                Your age (not exact birthday) will be shown to other users interested in the same events. You must be at least 13 years old.
              </p>
            </div>

            {/* Save Button */}
            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleSave}
                disabled={saving || !formData.name.trim()}
                className="flex-1"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={onBack}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
