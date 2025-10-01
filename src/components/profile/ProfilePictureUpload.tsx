import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface ProfilePictureUploadProps {
  currentAvatarUrl?: string | null;
  userName: string;
  onUploadSuccess: (newAvatarUrl: string) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ProfilePictureUpload = ({
  currentAvatarUrl,
  userName,
  onUploadSuccess,
  size = 'md',
  className = ''
}: ProfilePictureUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-20 h-20 md:w-24 md:h-24',
    lg: 'w-32 h-32'
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please select a JPEG, PNG, WebP, or HEIC image.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload the file
    uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to upload a profile picture.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Generate a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('profile-avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        throw error;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(data.path);

      const publicUrl = urlData.publicUrl;

      // Update the profile in the database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Profile update error:', updateError);
        throw updateError;
      }

      // Success!
      setPreviewUrl(null);
      onUploadSuccess(publicUrl);
      
      toast({
        title: "Profile picture updated! 🎉",
        description: "Your new profile picture has been saved.",
      });

    } catch (error: any) {
      console.error('Error uploading profile picture:', error);
      setPreviewUrl(null);
      
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload profile picture. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePicture = async () => {
    if (!user || !currentAvatarUrl) return;

    setIsUploading(true);

    try {
      // Extract the file path from the URL
      const urlParts = currentAvatarUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `${user.id}/${fileName}`;

      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('profile-avatars')
        .remove([filePath]);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        // Continue even if delete fails - we still want to update the profile
      }

      // Update the profile to remove the avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Profile update error:', updateError);
        throw updateError;
      }

      onUploadSuccess('');
      
      toast({
        title: "Profile picture removed",
        description: "Your profile picture has been removed.",
      });

    } catch (error: any) {
      console.error('Error removing profile picture:', error);
      
      toast({
        title: "Remove failed",
        description: error.message || "Failed to remove profile picture. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const displayUrl = previewUrl || currentAvatarUrl;

  return (
    <div className={`relative inline-block ${className}`}>
      <div className="relative">
        <Avatar className={sizeClasses[size]}>
          <AvatarImage src={displayUrl || undefined} />
          <AvatarFallback className="text-2xl">
            {userName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Upload overlay */}
        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
          {isUploading ? (
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          ) : (
            <Camera className="w-6 h-6 text-white" />
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-3 justify-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="text-xs"
        >
          <Upload className="w-3 h-3 mr-1" />
          {currentAvatarUrl ? 'Change' : 'Upload'}
        </Button>
        
        {currentAvatarUrl && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRemovePicture}
            disabled={isUploading}
            className="text-xs text-red-600 hover:text-red-700"
          >
            <X className="w-3 h-3 mr-1" />
            Remove
          </Button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};
