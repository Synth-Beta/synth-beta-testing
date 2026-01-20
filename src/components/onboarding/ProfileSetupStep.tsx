import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Upload, Camera, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface ProfileSetupStepProps {
  initialData?: {
    username?: string;
    location_city?: string;
    birthday?: string;
    gender?: string;
    bio?: string;
    avatar_url?: string;
  };
  onNext: (data: {
    username?: string;
    location_city?: string;
    birthday?: string;
    gender?: string;
    bio?: string;
    avatar_url?: string;
  }) => void;
  onSkip: () => void;
}

export const ProfileSetupStep = ({ initialData, onNext, onSkip }: ProfileSetupStepProps) => {
  const [formData, setFormData] = useState({
    username: initialData?.username || '',
    location_city: initialData?.location_city || '',
    birthday: initialData?.birthday || '',
    gender: initialData?.gender || '',
    bio: initialData?.bio || '',
    avatar_url: initialData?.avatar_url || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Auto-suggest username from name when component mounts, name changes, or username is cleared
  // Use a ref to track if we've already suggested to prevent infinite loops
  const hasSuggestedRef = React.useRef(false);
  const isGeneratingRef = React.useRef(false);
  
  useEffect(() => {
    const generateSuggestedUsername = async () => {
      const isEmpty = !formData.username;
      const hasName = !!user?.user_metadata?.name;
      
      // Reset suggestion flag when username is cleared (user manually cleared it)
      // Only reset if we're not currently generating and username is empty
      if (isEmpty && hasSuggestedRef.current && !isGeneratingRef.current) {
        hasSuggestedRef.current = false;
      }
      
      // Only suggest if username is empty, user has a name, we haven't suggested yet, and we're not currently generating
      if (isEmpty && hasName && !hasSuggestedRef.current && !isGeneratingRef.current) {
        isGeneratingRef.current = true; // Mark as generating to prevent reset
        try {
          const { generateAvailableUsername } = await import('@/services/usernameService');
          const suggested = await generateAvailableUsername(user.user_metadata.name);
          if (suggested) {
            hasSuggestedRef.current = true; // Mark as suggested
            setFormData(prev => ({ ...prev, username: suggested }));
          }
        } catch (error) {
          console.error('Error generating suggested username:', error);
        } finally {
          isGeneratingRef.current = false; // Clear generating flag
        }
      }
    };
    
    generateSuggestedUsername();
    // Only depend on user name - don't include formData.username to avoid circular dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_metadata?.name]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPEG, PNG, or WebP image.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingPhoto(true);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('profile-avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(data.path);

      setFormData({ ...formData, avatar_url: urlData.publicUrl });
      
      toast({
        title: "Photo uploaded",
        description: "Your profile photo has been uploaded successfully.",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload photo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const checkUsernameAvailability = async (username: string): Promise<{ available: boolean; error?: string }> => {
    if (!username.trim()) {
      return { available: false, error: 'Username is required' };
    }
    
    try {
      // Use the shared username service for consistency
      const { checkUsernameAvailability: checkAvailability } = await import('@/services/usernameService');
      const result = await checkAvailability(username);
      return result;
    } catch (error) {
      console.error('Error checking username availability:', error);
      // Fallback to direct query if service fails
      // Use same sanitization as primary path to ensure consistency
      try {
        const { sanitizeUsername } = await import('@/utils/usernameUtils');
        const sanitized = sanitizeUsername(username);
        
        if (!sanitized) {
          return { available: false, error: 'Invalid username after sanitization' };
        }
        
        const { data, error } = await supabase
          .from('users')
          .select('username')
          .eq('username', sanitized) // Use sanitized username to match primary path behavior
          .limit(1);

        if (error && error.code !== 'PGRST116') {
          console.warn('Error checking username:', error);
          return { available: true }; // Allow if column doesn't exist
        }

        const available = !data || data.length === 0;
        return available 
          ? { available: true }
          : { available: false, error: 'This username is already taken' };
      } catch (fallbackError) {
        console.error('Fallback username check failed:', fallbackError);
        return { available: true }; // Allow on error to not block onboarding
      }
    }
  };

  const handleUsernameBlur = async () => {
    const username = formData.username.trim();
    if (!username) {
      setErrors({ ...errors, username: 'Username is required' });
      return;
    }

    // Use shared validation utilities
    // Note: formData.username is already sanitized by the onChange handler,
    // but we call sanitizeUsername again to ensure consistency (it's idempotent)
    try {
      const { validateUsernameFormat, sanitizeUsername } = await import('@/utils/usernameUtils');
      // Re-sanitize to ensure consistency (sanitizeUsername is idempotent)
      const sanitized = sanitizeUsername(username);
      const formatCheck = validateUsernameFormat(sanitized);
      
      if (!formatCheck.valid) {
        setErrors({ ...errors, username: formatCheck.error || 'Invalid username format' });
        return;
      }

      // Check availability
      setIsCheckingUsername(true);
      const availability = await checkUsernameAvailability(sanitized);
      setIsCheckingUsername(false);

      if (!availability.available) {
        setErrors({ ...errors, username: availability.error || 'This username is already taken' });
      } else {
        setErrors({ ...errors, username: '' });
      }
    } catch (error) {
      console.error('Error validating username:', error);
      setIsCheckingUsername(false);
      setErrors({ ...errors, username: 'Error validating username' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};

    // Validate username (required)
    let finalUsername = formData.username.trim();
    if (!finalUsername) {
      newErrors.username = 'Username is required';
    } else {
      // Use shared validation utilities
      try {
        const { validateUsernameFormat, sanitizeUsername } = await import('@/utils/usernameUtils');
        const sanitized = sanitizeUsername(finalUsername);
        const formatCheck = validateUsernameFormat(sanitized);
        
        if (!formatCheck.valid) {
          newErrors.username = formatCheck.error || 'Invalid username format';
        } else {
          // Check availability one more time
          setIsCheckingUsername(true);
          const availability = await checkUsernameAvailability(sanitized);
          setIsCheckingUsername(false);
          if (!availability.available) {
            newErrors.username = availability.error || 'This username is already taken';
          } else {
            // Store sanitized username to use when passing to onNext
            finalUsername = sanitized;
          }
        }
      } catch (error) {
        console.error('Error validating username:', error);
        newErrors.username = 'Error validating username';
      }
    }

    // Validate required fields
    if (!formData.location_city.trim()) {
      newErrors.location_city = 'City is required';
    }

    if (!formData.birthday) {
      newErrors.birthday = 'Birthday is required';
    } else {
      // Validate age (must be at least 13 years old)
      const birthDate = new Date(formData.birthday);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        if (age - 1 < 13) {
          newErrors.birthday = 'You must be at least 13 years old';
        }
      } else if (age < 13) {
        newErrors.birthday = 'You must be at least 13 years old';
      }
    }

    if (formData.bio.length > 120) {
      newErrors.bio = 'Bio must be 120 characters or less';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Pass formData with sanitized username
    onNext({
      ...formData,
      username: finalUsername, // Use the sanitized username
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Welcome to Synth!</h2>
        <p className="text-muted-foreground">
          Let's set up your profile to personalize your experience
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username (Required) */}
        <div className="space-y-2">
          <Label htmlFor="username">
            Username <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <div className="relative">
              <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                @
              </div>
              <Input
                id="username"
                placeholder="username"
                value={formData.username}
                onChange={(e) => {
                  // Sanitize input inline to match sanitizeUsername utility exactly
                  let value = e.target.value.toLowerCase().trim();
                  // Allow alphanumeric, underscore, period only
                  value = value.replace(/[^a-z0-9_.]/g, '');
                  // Remove leading/trailing periods/underscores
                  value = value.replace(/^[_.]+|[_.]+$/g, '');
                  // Replace multiple consecutive periods or underscores with single (matches sanitizeUsername)
                  value = value.replace(/[_.]{2,}/g, (match) => match[0]);
                  setFormData({ ...formData, username: value });
                  // Clear error when user starts typing
                  if (errors.username) {
                    setErrors({ ...errors, username: '' });
                  }
                }}
                onBlur={handleUsernameBlur}
                maxLength={30}
                className={`bg-white pl-8 ${errors.username ? 'border-destructive' : ''}`}
              />
            </div>
            {isCheckingUsername && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          {errors.username && (
            <p className="text-sm text-destructive">{errors.username}</p>
          )}
          {formData.username && (
            <p className="text-xs text-muted-foreground">
              Preview: <span className="font-medium">@{formData.username}</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Your unique username (3-30 characters, lowercase letters, numbers, underscores, and periods only)
          </p>
        </div>

        {/* Profile Photo (Optional) */}
        <div className="space-y-2">
          <Label>Profile Photo (Optional)</Label>
          <div className="flex items-center gap-4">
            {formData.avatar_url ? (
              <img
                src={formData.avatar_url}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto}
                className="w-full"
              >
                {isUploadingPhoto ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    Upload Photo
                  </>
                )}
              </Button>
              <Input
                type="url"
                placeholder="Or paste image URL"
                value={formData.avatar_url}
                onChange={(e) =>
                  setFormData({ ...formData, avatar_url: e.target.value })
                }
                disabled={isUploadingPhoto}
                className="bg-white"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            You can add a photo now or skip and add it later
          </p>
        </div>

        {/* Location/City (Required) */}
        <div className="space-y-2">
          <Label htmlFor="location_city">
            City <span className="text-destructive">*</span>
          </Label>
          <Input
            id="location_city"
            placeholder="e.g., Los Angeles, CA"
            value={formData.location_city}
            onChange={(e) =>
              setFormData({ ...formData, location_city: e.target.value })
            }
            className={`bg-white ${errors.location_city ? 'border-destructive' : ''}`}
          />
          {errors.location_city && (
            <p className="text-sm text-destructive">{errors.location_city}</p>
          )}
          <p className="text-xs text-muted-foreground">
            We'll show you events happening near you
          </p>
        </div>

        {/* Birthday (Required) */}
        <div className="space-y-2">
          <Label htmlFor="birthday">
            Birthday <span className="text-destructive">*</span>
          </Label>
          <Input
            id="birthday"
            type="date"
            value={formData.birthday}
            onChange={(e) =>
              setFormData({ ...formData, birthday: e.target.value })
            }
            className={`bg-white ${errors.birthday ? 'border-destructive' : ''}`}
          />
          {errors.birthday && (
            <p className="text-sm text-destructive">{errors.birthday}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Your age will be displayed to other users, but not your exact birthday
          </p>
        </div>

        {/* Gender (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="gender">Gender (Optional)</Label>
          <Select
            value={formData.gender}
            onValueChange={(value) =>
              setFormData({ ...formData, gender: value })
            }
          >
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Select your gender" />
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

        {/* Bio (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="bio">Bio (Optional)</Label>
          <Textarea
            id="bio"
            placeholder="Tell us a bit about yourself..."
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            maxLength={120}
            className={`bg-white ${errors.bio ? 'border-destructive' : ''}`}
          />
          <p className="text-xs text-muted-foreground text-right">
            {formData.bio.length}/120 characters
          </p>
          {errors.bio && (
            <p className="text-sm text-destructive">{errors.bio}</p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={onSkip} className="flex-1">
            Skip
          </Button>
          <Button type="submit" className="flex-1">
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
};

