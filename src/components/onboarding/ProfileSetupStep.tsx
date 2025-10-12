import { useState } from 'react';
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
import { Upload } from 'lucide-react';

interface ProfileSetupStepProps {
  initialData?: {
    location_city?: string;
    birthday?: string;
    gender?: string;
    bio?: string;
    avatar_url?: string;
  };
  onNext: (data: {
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
    location_city: initialData?.location_city || '',
    birthday: initialData?.birthday || '',
    gender: initialData?.gender || '',
    bio: initialData?.bio || '',
    avatar_url: initialData?.avatar_url || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};

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

    onNext(formData);
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
        {/* Profile Photo (Optional) */}
        <div className="space-y-2">
          <Label htmlFor="avatar">Profile Photo (Optional)</Label>
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
            <Input
              id="avatar"
              type="url"
              placeholder="Paste image URL"
              value={formData.avatar_url}
              onChange={(e) =>
                setFormData({ ...formData, avatar_url: e.target.value })
              }
              className="bg-white"
            />
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

