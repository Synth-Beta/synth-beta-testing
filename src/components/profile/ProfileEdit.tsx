import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Save, Instagram, User, Music, Users, Calendar, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
// Note: Types will need to be regenerated after migration
type Tables<T extends string> = any;
import { SinglePhotoUpload } from '@/components/ui/photo-upload';
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';
import { 
  checkUsernameAvailability, 
  canChangeUsername, 
  updateUsername as updateUsernameService,
  getUsernameSuggestions 
} from '@/services/usernameService';
import { sanitizeUsername, validateUsernameFormat } from '@/utils/usernameUtils';
import { spotifyService } from '@/services/spotifyService';
import { appleMusicService } from '@/services/appleMusicService';
import { toast } from '@/hooks/use-toast';

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
    username: '',
    bio: '',
    instagram_handle: '',
    music_streaming_profile: '',
    music_streaming_service: '' as '' | 'spotify' | 'apple_music',
    avatar_url: null as string | null,
    gender: '',
    birthday: ''
  });
  const [usernameValidation, setUsernameValidation] = useState<{
    checking: boolean;
    available: boolean | null;
    error: string | null;
  }>({ checking: false, available: null, error: null });
  const [canChangeUsernameState, setCanChangeUsernameState] = useState<{
    allowed: boolean;
    daysRemaining?: number;
  }>({ allowed: true });
  const usernameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
useEffect(() => {
    fetchProfile();
  }, [currentUserId]);

  // Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current);
      }
    };
  }, []);

  const fetchProfile = async () => {
    try {
      console.log('Fetching profile for user:', currentUserId);
      const selectFields = 'id, user_id, name, username, avatar_url, bio, instagram_handle, music_streaming_profile, music_streaming_service, gender, birthday, created_at, updated_at';
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
            username: '',
            bio: '',
            instagram_handle: '',
            music_streaming_profile: '',
            music_streaming_service: '',
            avatar_url: null,
            gender: '',
            birthday: ''
          });
          setLoading(false);
          return;
        }
        
      console.log('Profile data received:', profileData);
      setProfile(profileData as any);
      
      // Check if user can change username
      const canChange = await canChangeUsername(currentUserId);
      setCanChangeUsernameState(canChange);
      
      setFormData({
        name: profileData.name || '',
        username: profileData.username || '',
        bio: profileData.bio || '',
        instagram_handle: profileData.instagram_handle || '',
        music_streaming_profile: profileData.music_streaming_profile || '',
        music_streaming_service: (profileData as any).music_streaming_service || '',
        avatar_url: profileData.avatar_url || null,
        gender: profileData.gender || '',
        birthday: profileData.birthday || ''
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    console.log('Save button clicked, form data:', formData);
    
    // Validation
    if (!formData.name.trim()) {
      return;
    }
    
    // Validate username if it changed
    const sanitizedUsername = sanitizeUsername(formData.username);
    const currentUsername = profile?.username;
    
    // Track if username was updated separately (to avoid redundant update in profile save)
    let usernameUpdatedSeparately = false;
    
    if (sanitizedUsername && sanitizedUsername !== currentUsername) {
      // Check format
      const formatCheck = validateUsernameFormat(sanitizedUsername);
      if (!formatCheck.valid) {
        return;
      }
      
      // Check availability
      if (usernameValidation.checking) {
        return;
      }
      
      if (usernameValidation.available === false) {
        return;
      }
      
      // Ensure validation has completed and username is available
      if (usernameValidation.available !== true) {
        return;
      }
      
      // Update username with rate limiting (this already updates the database)
      const usernameResult = await updateUsernameService(currentUserId, sanitizedUsername);
      if (!usernameResult.success) {
        return;
      }
      
      // Mark that username was already updated, so don't include it in profileData
      usernameUpdatedSeparately = true;
    }

    setSaving(true);
    try {
      const profileData: any = {
        user_id: currentUserId,
        name: formData.name.trim(),
        bio: formData.bio.trim() || null,
        instagram_handle: formData.instagram_handle.trim() || null,
        music_streaming_profile: formData.music_streaming_profile.trim() || null,
        music_streaming_service: formData.music_streaming_service || null,
        avatar_url: formData.avatar_url || null,
        gender: formData.gender.trim() || null,
        birthday: formData.birthday.trim() || null,
        updated_at: new Date().toISOString()
      };
      
      // Only include username in profileData if it wasn't already updated by updateUsernameService
      // (updateUsernameService handles the database update, so we don't want to update it again)
      if (!usernameUpdatedSeparately && sanitizedUsername && sanitizedUsername !== currentUsername) {
        profileData.username = sanitizedUsername;
      }
      
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
        // Create new profile - username is required for new profiles
        if (!sanitizedUsername) {
          setSaving(false);
          return;
        }
        profileData.username = sanitizedUsername;
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
      // Refresh can change username state
      const canChange = await canChangeUsername(currentUserId);
      setCanChangeUsernameState(canChange);
      
      onSave();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Real-time username validation
    if (field === 'username') {
      handleUsernameChange(value);
    }
  };
  
  const handleUsernameChange = async (value: string) => {
    // Clear previous timeout
    if (usernameCheckTimeoutRef.current) {
      clearTimeout(usernameCheckTimeoutRef.current);
    }
    
    const sanitized = sanitizeUsername(value);
    
    // Reset validation state
    setUsernameValidation({ checking: false, available: null, error: null });
    
    // If empty, don't validate
    if (!sanitized) {
      return;
    }
    
    // Validate format first
    const formatCheck = validateUsernameFormat(sanitized);
    if (!formatCheck.valid) {
      setUsernameValidation({ checking: false, available: false, error: formatCheck.error || null });
      return;
    }
    
    // Debounce availability check (500ms)
    usernameCheckTimeoutRef.current = setTimeout(async () => {
      setUsernameValidation({ checking: true, available: null, error: null });
      
      try {
        // Check if username changed (don't check if it's the same as current)
        const currentUsername = profile?.username;
        if (sanitized === currentUsername) {
          setUsernameValidation({ checking: false, available: true, error: null });
          return;
        }
        
        const availability = await checkUsernameAvailability(sanitized, currentUserId);
        setUsernameValidation({
          checking: false,
          available: availability.available,
          error: availability.error || null,
        });
      } catch (error) {
        console.error('Error checking username availability:', error);
        setUsernameValidation({
          checking: false,
          available: null,
          error: 'Error checking username availability',
        });
      }
    }, 500);
  };

  if (loading) {
    return <SynthLoadingScreen text="Loading profile..." />;
  }

  return (
    <div
      className="p-4 bg-gray-50"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
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
              <Label htmlFor="name">Display Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter your display name"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">
                This is your display name that others will see on your profile
              </p>
            </div>

            {/* Username Field */}
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                  @
                </div>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="username"
                  maxLength={30}
                  disabled={!canChangeUsernameState.allowed}
                  className={`pl-8 pr-20 ${
                    usernameValidation.available === false 
                      ? 'border-red-500 focus:border-red-500' 
                      : usernameValidation.available === true
                      ? 'border-green-500 focus:border-green-500'
                      : ''
                  }`}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  {usernameValidation.checking && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                  {!usernameValidation.checking && usernameValidation.available === true && (
                    <CheckCircle2 className="w-4 h-4 var(--status-success-500)" />
                  )}
                  {!usernameValidation.checking && usernameValidation.available === false && (
                    <XCircle className="w-4 h-4 var(--status-error-500)" />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  {usernameValidation.error && (
                    <p className="text-xs var(--status-error-500) mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {usernameValidation.error}
                    </p>
                  )}
                  {!usernameValidation.error && usernameValidation.available === true && sanitizeUsername(formData.username) && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Available: @{sanitizeUsername(formData.username)}
                    </p>
                  )}
                  {!canChangeUsernameState.allowed && canChangeUsernameState.daysRemaining !== undefined && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      You can change your username in {canChangeUsernameState.daysRemaining} day{canChangeUsernameState.daysRemaining !== 1 ? 's' : ''}
                    </p>
                  )}
                  {canChangeUsernameState.allowed && sanitizeUsername(formData.username) && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Changing your username will update your profile URL
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {sanitizeUsername(formData.username).length}/30
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Your unique identifier. Can only be changed once every 30 days. 3-30 characters, lowercase letters, numbers, underscores, and periods only.
              </p>
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
              <Label htmlFor="music-streaming-service" className="flex items-center gap-2">
                <Music className="w-4 h-4" />
                Music Streaming Profile
              </Label>
              <Select
                value={formData.music_streaming_service || undefined}
                onValueChange={(value) => handleInputChange('music_streaming_service', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your streaming service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spotify">Spotify</SelectItem>
                  <SelectItem value="apple_music">Apple Music</SelectItem>
                </SelectContent>
              </Select>
              {formData.music_streaming_service && (
                <Input
                  id="music-streaming"
                  value={formData.music_streaming_profile}
                  onChange={(e) => handleInputChange('music_streaming_profile', e.target.value)}
                  placeholder={
                    formData.music_streaming_service === 'spotify' 
                      ? 'Your Spotify username (e.g., yourusername)' 
                      : 'Your Apple Music username (e.g., yourusername)'
                  }
                  maxLength={200}
                />
              )}
              {formData.music_streaming_service === 'spotify' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    if (spotifyService.isConfigured()) {
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('spotify_connect_source', 'profile');
                      }
                      spotifyService.authenticate();
                    } else {
                      toast({
                        title: 'Spotify not configured',
                        description: 'Spotify linking is not available right now.',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  Link Spotify account to sync your taste
                </Button>
              )}
              {formData.music_streaming_service === 'apple_music' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    try {
                      await appleMusicService.authenticate();
                      toast({
                        title: 'Apple Music connected',
                        description: 'Your Apple Music account is now linked. Syncing stats is optional and can be done from Streaming Stats.',
                      });
                    } catch (error) {
                      toast({
                        title: 'Apple Music not available',
                        description: 'Apple Music linking is not available right now.',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  Connect Apple Music to sync your stats (optional)
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Share your Spotify, Apple Music, or other streaming profile link. You can paste @username or a full profile URL. This controls the music icon on your profile; syncing is optional and only affects stats and recommendations.
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
