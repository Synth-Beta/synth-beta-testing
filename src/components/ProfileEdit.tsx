import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Save, Instagram, Camera, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Profile } from '@/types/database';

interface ProfileEditProps {
  currentUserId: string;
  onBack: () => void;
  onSave: () => void;
}

export const ProfileEdit = ({ currentUserId, onBack, onSave }: ProfileEditProps) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    instagram_handle: '',
    snapchat_handle: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
  }, [currentUserId]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', currentUserId)
        .single();

      if (error) throw error;
      
      setProfile(data);
      setFormData({
        name: data.name || '',
        bio: data.bio || '',
        instagram_handle: data.instagram_handle || '',
        snapchat_handle: data.snapchat_handle || ''
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
      const { error } = await supabase
        .from('profiles')
        .update({
          name: formData.name.trim(),
          bio: formData.bio.trim() || null,
          instagram_handle: formData.instagram_handle.trim() || null,
          snapchat_handle: formData.snapchat_handle.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', currentUserId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      
      onSave();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: "Failed to update profile",
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
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
            {/* Avatar Section */}
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xl">
                  {formData.name.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">Profile Picture</p>
                <p className="text-xs text-muted-foreground">
                  Avatar updates coming soon
                </p>
              </div>
            </div>

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
                  maxLength={30}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your Instagram profile will be linked when people view your profile
              </p>
            </div>

            {/* Snapchat Field */}
            <div className="space-y-2">
              <Label htmlFor="snapchat" className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Snapchat Handle
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">@</span>
                <Input
                  id="snapchat"
                  value={formData.snapchat_handle}
                  onChange={(e) => handleInputChange('snapchat_handle', e.target.value.replace('@', ''))}
                  placeholder="username"
                  maxLength={30}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Your Snapchat profile will be linked when people view your profile
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
