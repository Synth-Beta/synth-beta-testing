import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2, Image as ImageIcon, Video, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { storageService, type BucketName } from '@/services/storageService';
import { useToast } from '@/hooks/use-toast';

export interface PhotoUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  userId: string;
  bucket: BucketName;
  maxPhotos?: number;
  maxSizeMB?: number;
  label?: string;
  helperText?: string;
  className?: string;
  disabled?: boolean;
}

export function PhotoUpload({
  value = [],
  onChange,
  userId,
  bucket,
  maxPhotos = 5,
  maxSizeMB = 5,
  label = 'Photos',
  helperText,
  className,
  disabled = false,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check if adding these files would exceed max
    if (value.length + files.length > maxPhotos) {
      toast({
        title: 'Too many photos',
        description: `You can only upload up to ${maxPhotos} photos`,
        variant: 'destructive',
      });
      return;
    }

    // Validate each file
    for (const file of files) {
      const validation = storageService.validateImage(file, { maxSizeMB });
      if (!validation.valid) {
        toast({
          title: 'Invalid file',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Upload files one by one with progress
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const result = await storageService.uploadPhoto(files[i], bucket, userId, {
          maxSizeMB,
        });
        uploadedUrls.push(result.url);
        setUploadProgress(((i + 1) / files.length) * 100);
      }

      onChange([...value, ...uploadedUrls]);
      
      toast({
        title: 'Upload successful',
        description: `${files.length} photo${files.length > 1 ? 's' : ''} uploaded`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload photos',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async (url: string, index: number) => {
    try {
      // Extract path and delete from storage
      const path = storageService.getPathFromUrl(url, bucket);
      if (path) {
        await storageService.deletePhoto(bucket, path);
      }

      // Update state
      const newValue = value.filter((_, i) => i !== index);
      onChange(newValue);

      toast({
        title: 'Photo removed',
        description: 'Photo deleted successfully',
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete failed',
        description: 'Failed to delete photo',
        variant: 'destructive',
      });
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={cn('space-y-3', className)}>
      {label && (
        <div>
          <label className="text-sm font-medium">{label}</label>
          {helperText && <p className="text-xs text-muted-foreground mt-1">{helperText}</p>}
        </div>
      )}

      {/* Photo Grid */}
      <div className="grid grid-cols-3 gap-3">
        {value.map((url, index) => (
          <div
            key={url}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
          >
            <img
              src={url}
              alt={`Photo ${index + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(url, index)}
              disabled={disabled || uploading}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        {/* Upload Button */}
        {value.length < maxPhotos && (
          <button
            type="button"
            onClick={openFilePicker}
            disabled={disabled || uploading}
            className={cn(
              'aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400',
              'flex flex-col items-center justify-center gap-2 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              uploading && 'border-primary'
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">{uploadProgress.toFixed(0)}%</span>
              </>
            ) : (
              <>
                <Camera className="w-6 h-6 text-gray-400" />
                <span className="text-xs text-muted-foreground">Add Photo</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Info Text */}
      <p className="text-xs text-muted-foreground">
        {value.length} / {maxPhotos} photos • Max {maxSizeMB}MB per photo
      </p>
    </div>
  );
}

/* Single Photo Upload Component (for avatars) */
export interface SinglePhotoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  userId: string;
  bucket: BucketName;
  maxSizeMB?: number;
  label?: string;
  helperText?: string;
  className?: string;
  disabled?: boolean;
  aspectRatio?: 'square' | 'circle';
}

export function SinglePhotoUpload({
  value,
  onChange,
  userId,
  bucket,
  maxSizeMB = 25,
  label = 'Photo',
  helperText,
  className,
  disabled = false,
  aspectRatio = 'square',
}: SinglePhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Detect if user is on mobile device
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
  };

  // Handle camera capture
  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  // Handle gallery selection
  const handleGallerySelect = () => {
    galleryInputRef.current?.click();
  };

  // Show upload options on mobile, direct upload on desktop
  const handleUploadClick = () => {
    if (isMobile()) {
      setShowUploadOptions(true);
    } else {
      galleryInputRef.current?.click();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Close upload options modal
    setShowUploadOptions(false);

    // Validate file
    const validation = storageService.validateImage(file, { maxSizeMB });
    if (!validation.valid) {
      toast({
        title: 'Invalid file',
        description: validation.error,
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      // Delete old photo if exists
      if (value) {
        const oldPath = storageService.getPathFromUrl(value, bucket);
        if (oldPath) {
          await storageService.deletePhoto(bucket, oldPath).catch(console.error);
        }
      }

      // Upload new photo
      const result = await storageService.uploadPhoto(file, bucket, userId, { maxSizeMB });
      onChange(result.url);

      toast({
        title: 'Upload successful',
        description: 'Photo uploaded successfully',
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload photo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (galleryInputRef.current) {
        galleryInputRef.current.value = '';
      }
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    try {
      const path = storageService.getPathFromUrl(value, bucket);
      if (path) {
        await storageService.deletePhoto(bucket, path);
      }
      onChange(null);

      toast({
        title: 'Photo removed',
        description: 'Photo deleted successfully',
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete failed',
        description: 'Failed to delete photo',
        variant: 'destructive',
      });
    }
  };

  const openFilePicker = () => {
    galleryInputRef.current?.click();
  };

  return (
    <div className={cn('space-y-3', className)}>
      {label && (
        <div>
          <label className="text-sm font-medium">{label}</label>
          {helperText && <p className="text-xs text-muted-foreground mt-1">{helperText}</p>}
        </div>
      )}

      <div className="flex items-center gap-4">
        {/* Photo Preview */}
        <div
          className={cn(
            'relative w-24 h-24 bg-gray-100 overflow-hidden group',
            aspectRatio === 'circle' ? 'rounded-full' : 'rounded-lg'
          )}
        >
          {value ? (
            <>
              <img src={value} alt="Upload" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || uploading}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>

        {/* Upload Button */}
        <div className="flex-1">
          <Button
            type="button"
            variant="outline"
            onClick={openFilePicker}
            disabled={disabled || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-2" />
                {value ? 'Change Photo' : 'Upload Photo'}
              </>
            )}
          </Button>
          {helperText && <p className="text-xs text-muted-foreground mt-2">{helperText}</p>}
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
        capture="environment"
      />
      
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Upload Options Modal */}
      {showUploadOptions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-center">Choose Photo Source</h3>
            
            <div className="space-y-3">
              <Button
                onClick={handleCameraCapture}
                className="w-full flex items-center justify-center gap-3 py-3"
                variant="outline"
                disabled={disabled || uploading}
              >
                <Camera className="w-5 h-5" />
                Take Photo
              </Button>
              
              <Button
                onClick={handleGallerySelect}
                className="w-full flex items-center justify-center gap-3 py-3"
                variant="outline"
                disabled={disabled || uploading}
              >
                <ImageIcon className="w-5 h-5" />
                Choose from Gallery
              </Button>
            </div>
            
            <Button
              onClick={() => setShowUploadOptions(false)}
              variant="ghost"
              className="w-full mt-4"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Video Upload Component */
export interface VideoUploadProps {
  value: string[];
  onChange: (urls: string[]) => void;
  userId: string;
  bucket: BucketName;
  maxVideos?: number;
  maxSizeMB?: number;
  label?: string;
  helperText?: string;
  className?: string;
  disabled?: boolean;
}

export function VideoUpload({
  value = [],
  onChange,
  userId,
  bucket,
  maxVideos = 3,
  maxSizeMB = 100,
  label = 'Videos',
  helperText,
  className,
  disabled = false,
}: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check if adding these files would exceed max
    if (value.length + files.length > maxVideos) {
      toast({
        title: 'Too many videos',
        description: `You can only upload up to ${maxVideos} videos`,
        variant: 'destructive',
      });
      return;
    }

    // Validate each file
    for (const file of files) {
      const validation = storageService.validateVideo(file, { maxSizeMB });
      if (!validation.valid) {
        toast({
          title: 'Invalid file',
          description: validation.error,
          variant: 'destructive',
        });
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Upload files one by one with progress
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const result = await storageService.uploadVideo(files[i], bucket, userId, {
          maxSizeMB,
        });
        uploadedUrls.push(result.url);
        setUploadProgress(((i + 1) / files.length) * 100);
      }

      onChange([...value, ...uploadedUrls]);
      
      toast({
        title: 'Upload successful',
        description: `${files.length} video${files.length > 1 ? 's' : ''} uploaded`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload videos',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async (url: string, index: number) => {
    try {
      // Extract path and delete from storage
      const path = storageService.getPathFromUrl(url, bucket);
      if (path) {
        await storageService.deleteVideo(bucket, path);
      }

      // Update state
      const newValue = value.filter((_, i) => i !== index);
      onChange(newValue);

      toast({
        title: 'Video removed',
        description: 'Video deleted successfully',
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Delete failed',
        description: 'Failed to delete video',
        variant: 'destructive',
      });
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={cn('space-y-3', className)}>
      {label && (
        <div>
          <label className="text-sm font-medium">{label}</label>
          {helperText && <p className="text-xs text-muted-foreground mt-1">{helperText}</p>}
        </div>
      )}

      {/* Video Grid */}
      <div className="grid grid-cols-3 gap-3">
        {value.map((url, index) => (
          <div
            key={url}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group"
          >
            <video
              src={url}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/50 rounded-full p-2">
                <Play className="w-6 h-6 text-white" fill="white" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(url, index)}
              disabled={disabled || uploading}
              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        {/* Upload Button */}
        {value.length < maxVideos && (
          <button
            type="button"
            onClick={openFilePicker}
            disabled={disabled || uploading}
            className={cn(
              'aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400',
              'flex flex-col items-center justify-center gap-2 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              uploading && 'border-primary'
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">{uploadProgress.toFixed(0)}%</span>
              </>
            ) : (
              <>
                <Video className="w-6 h-6 text-gray-400" />
                <span className="text-xs text-muted-foreground">Add Video</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/3gpp,video/x-flv"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Info Text */}
      <p className="text-xs text-muted-foreground">
        {value.length} / {maxVideos} videos • Max {maxSizeMB}MB per video
      </p>
    </div>
  );
}

