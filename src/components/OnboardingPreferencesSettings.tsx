import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MapPin, 
  Users, 
  Music, 
  Bell, 
  Save,
  User,
  Palette
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MUSIC_GENRES } from '@/data/musicGenres';
import { MusicTagsStep } from '@/components/onboarding/MusicTagsStep';
import { StreamingAccountSettings } from '@/components/streaming/StreamingAccountSettings';

interface OnboardingPreferencesSettingsProps {
  onClose?: () => void;
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  location_city: string | null;
  gender: string | null;
  birthday: string | null;
  similar_users_notifications: boolean | null;
  [key: string]: any;
}

type ArtistSignalEntry = {
  entityId: string | null;
  fallbackName: string | null;
};

const GENRE_MANUAL_SIGNAL_TYPE = 'genre_manual_preference';
const ARTIST_MANUAL_SIGNAL_TYPE = 'artist_manual_preference';
const MANUAL_PREFERENCE_SIGNAL_TYPES = [
  GENRE_MANUAL_SIGNAL_TYPE,
  ARTIST_MANUAL_SIGNAL_TYPE,
] as const;

const normalizeGenreKey = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || raw.trim();

type PreferenceSignalInsertRow = {
  user_id: string;
  signal_type: typeof GENRE_MANUAL_SIGNAL_TYPE | typeof ARTIST_MANUAL_SIGNAL_TYPE;
  entity_type: 'genre' | 'artist';
  entity_id: string | null;
  entity_name: string | null;
  genre: string | null;
  signal_weight: number;
  context: { source: string };
  occurred_at: string;
};

export const OnboardingPreferencesSettings = ({ onClose }: OnboardingPreferencesSettingsProps) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    location_city: '',
    gender: '',
    birthday: '',
    bio: '',
    similar_users_notifications: true
  });
  
  const [musicPreferences, setMusicPreferences] = useState<{
    genres: string[];
    artists: string[];
  }>({
    genres: [],
    artists: []
  });

  const handleMusicPreferencesChange = (data: { genres: string[]; artists: string[] }) => {
    setMusicPreferences(data);
  };

  const resolveArtistIds = async (names: string[]) => {
    const lookup = new Map<string, string | null>();
    const uniqueNames = names.reduce<Map<string, string>>((map, name) => {
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, name);
      }
      return map;
    }, new Map());

    await Promise.all(
      Array.from(uniqueNames.values()).map(async (name) => {
        const key = name.toLowerCase();
        try {
          const { data, error } = await supabase
            .from('artists')
            .select('id')
            .ilike('name', name)
            .limit(1);

          if (error) {
            console.error('Error resolving artist ID for', name, error);
            lookup.set(key, null);
          } else {
            lookup.set(key, data?.[0]?.id ?? null);
          }
        } catch (error) {
          console.error('Error resolving artist ID for', name, error);
          lookup.set(key, null);
        }
      })
    );

    return lookup;
  };

  const loadSavedMusicPreferences = async (userId: string) => {
    const { data: signals, error } = await supabase
      .from('user_preference_signals')
      .select('signal_type, entity_id, entity_name, genre')
      .eq('user_id', userId)
      .in('signal_type', MANUAL_PREFERENCE_SIGNAL_TYPES as string[])
      .order('occurred_at', { ascending: false });

    if (error) {
      console.error('Error loading music preferences:', error);
      return { genres: [], artists: [] };
    }

    const dedupedGenres: string[] = [];
    const seenGenreKeys = new Set<string>();
    const artistEntries: ArtistSignalEntry[] = [];
    const seenArtistKeys = new Set<string>();
    const artistIdsToFetch = new Set<string>();

    (signals ?? []).forEach((signal) => {
      if (signal.signal_type === GENRE_MANUAL_SIGNAL_TYPE && signal.genre) {
        const genreKey = normalizeGenreKey(signal.genre);
        if (!genreKey || seenGenreKeys.has(genreKey)) return;
        seenGenreKeys.add(genreKey);
        const canonical = MUSIC_GENRES.find(
          (genre) => normalizeGenreKey(genre) === genreKey
        );
        dedupedGenres.push(canonical ?? signal.genre);
      } else if (signal.signal_type === ARTIST_MANUAL_SIGNAL_TYPE) {
        if (signal.entity_id) {
          if (seenArtistKeys.has(signal.entity_id)) return;
          seenArtistKeys.add(signal.entity_id);
          artistIdsToFetch.add(signal.entity_id);
          artistEntries.push({
            entityId: signal.entity_id,
            fallbackName: signal.entity_name?.trim() ?? null,
          });
        } else if (signal.entity_name) {
          const normalizedName = signal.entity_name.trim().toLowerCase();
          if (!normalizedName || seenArtistKeys.has(normalizedName)) return;
          seenArtistKeys.add(normalizedName);
          artistEntries.push({
            entityId: null,
            fallbackName: signal.entity_name.trim(),
          });
        }
      }
    });

    const artistNameMap = new Map<string, string>();
    if (artistIdsToFetch.size > 0) {
      const { data: artistRows, error: artistError } = await supabase
        .from('artists')
        .select('id, name')
        .in('id', Array.from(artistIdsToFetch));

      if (artistError) {
        console.error('Error fetching artist names:', artistError);
      } else {
        artistRows?.forEach((row) => {
          if (row?.id && row?.name) {
            artistNameMap.set(row.id, row.name);
          }
        });
      }
    }

    const dedupedArtists = artistEntries
      .map((entry) => {
        if (!entry) return null;
        if (entry.entityId) {
          return artistNameMap.get(entry.entityId) ?? entry.fallbackName;
        }
        return entry.fallbackName;
      })
      .filter((name): name is string => typeof name === 'string' && name.length > 0);

    return {
      genres: dedupedGenres,
      artists: dedupedArtists,
    };
  };

  const persistMusicPreferences = async (userId: string, genres: string[], artists: string[]) => {
    const now = new Date().toISOString();
    const { error: deleteError } = await supabase
      .from('user_preference_signals')
      .delete()
      .eq('user_id', userId)
      .in('signal_type', MANUAL_PREFERENCE_SIGNAL_TYPES as string[]);

    if (deleteError) {
      throw deleteError;
    }

    const normalizedGenres = genres
      .map((genre) => normalizeGenreKey(genre))
      .filter((genre) => genre.length > 0);

    const genreRows: PreferenceSignalInsertRow[] = normalizedGenres.map((genre) => ({
      user_id: userId,
      signal_type: GENRE_MANUAL_SIGNAL_TYPE,
      entity_type: 'genre',
      entity_id: null,
      entity_name: null,
      genre,
      signal_weight: 1,
      context: { source: 'settings' },
      occurred_at: now,
    }));

    const trimmedArtists = artists
      .map((artist) => artist.trim())
      .filter((artist) => artist.length > 0);
    const resolvedArtistIds = await resolveArtistIds(trimmedArtists);
    const addedArtistKeys = new Set<string>();
    const artistRows: PreferenceSignalInsertRow[] = trimmedArtists.reduce((rows, artist) => {
      const key = artist.toLowerCase();
      if (addedArtistKeys.has(key)) {
        return rows;
      }
      addedArtistKeys.add(key);
      const artistId = resolvedArtistIds.get(key) ?? null;
      rows.push({
        user_id: userId,
        signal_type: ARTIST_MANUAL_SIGNAL_TYPE,
        entity_type: 'artist',
        entity_id: artistId,
        entity_name: artistId ? null : artist,
        genre: null,
        signal_weight: 1,
        context: { source: 'settings' },
        occurred_at: now,
      });
      return rows;
    }, [] as PreferenceSignalInsertRow[]);

    const insertRows = [...genreRows, ...artistRows];
    if (insertRows.length === 0) {
      return;
    }

    const { error: insertError } = await supabase
      .from('user_preference_signals')
      .insert(insertRows);

    if (insertError) {
      throw insertError;
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchUserData();
    }
  }, [user?.id]);

  const fetchUserData = async () => {
    if (!user?.id) return;
    
    setLoading(true);

    try {
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

      const savedPreferences = await loadSavedMusicPreferences(user.id);
      setMusicPreferences(savedPreferences);

    } catch (error) {
      console.error('Error fetching user data:', error);
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

      await persistMusicPreferences(user.id, musicPreferences.genres, musicPreferences.artists);

      if (onClose) {
        onClose();
      }

    } catch (error) {
      console.error('Error saving preferences:', error);
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
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="non-binary">Non-binary</SelectItem>
                <SelectItem value="transgender">Transgender</SelectItem>
                <SelectItem value="genderqueer">Genderqueer</SelectItem>
                <SelectItem value="agender">Agender</SelectItem>
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

      {/* Streaming account (OAuth link, resync, disconnect) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Music className="w-4 h-4" />
            Streaming Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StreamingAccountSettings />
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
          <MusicTagsStep
            showButtons={false}
            showStreamingConnect={false}
            initialGenres={musicPreferences.genres}
            initialArtists={musicPreferences.artists}
            onChange={handleMusicPreferencesChange}
          />
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
