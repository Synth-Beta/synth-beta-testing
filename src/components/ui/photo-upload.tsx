import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, Loader2, Image as ImageIcon, Video, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { storageService, type BucketName } from '@/services/storageService';
import { useToast } from '@/hooks/use-toast';
import Cropper, { type Area } from 'react-easy-crop';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Failed to load image')));
    image.src = url;
  });
}

async function getCroppedBlob(
  imageSrc: string,
  croppedAreaPixels: Area,
  options: { mimeType?: string; quality?: number } = {}
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas context');

  const mimeType = options.mimeType ?? 'image/jpeg';
  const quality = options.quality ?? 0.9;

  canvas.width = Math.round(croppedAreaPixels.width);
  canvas.height = Math.round(croppedAreaPixels.height);

  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to crop image'));
      },
      mimeType,
      quality
    );
  });

  return blob;
}

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
        aria-hidden="true"
        tabIndex={-1}
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

  const [pendingImageSrc, setPendingImageSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

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

  const resetCropState = () => {
    setIsCropOpen(false);
    setPendingImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
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

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string | null;
      if (!src) {
        toast({
          title: 'Upload failed',
          description: 'Failed to read image',
          variant: 'destructive',
        });
        resetCropState();
        return;
      }
      setPendingImageSrc(src);
      setIsCropOpen(true);
    };
    reader.onerror = () => {
      toast({
        title: 'Upload failed',
        description: 'Failed to read image',
        variant: 'destructive',
      });
      resetCropState();
    };
    reader.readAsDataURL(file);
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

  const handleCropSave = async () => {
    if (!pendingImageSrc || !croppedAreaPixels) return;

    setUploading(true);
    try {
      const blob = await getCroppedBlob(pendingImageSrc, croppedAreaPixels, {
        mimeType: 'image/jpeg',
        quality: 0.9,
      });

      const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

      // Upload cropped photo
      const result = await storageService.uploadPhoto(croppedFile, bucket, userId, { maxSizeMB });
      onChange(result.url);

      // Delete old photo (after successful upload)
      if (value) {
        const oldPath = storageService.getPathFromUrl(value, bucket);
        if (oldPath) {
          await storageService.deletePhoto(bucket, oldPath).catch(console.error);
        }
      }

      toast({
        title: 'Upload successful',
        description: 'Photo uploaded successfully',
      });

      resetCropState();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload photo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
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
                aria-label="Remove photo"
              >
                <X className="w-6 h-6 text-white" aria-hidden="true" />
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
        aria-hidden="true"
        tabIndex={-1}
      />
      
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
        aria-hidden="true"
        tabIndex={-1}
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

      {/* Crop Modal */}
      <Dialog
        open={isCropOpen}
        onOpenChange={(open) => {
          if (!open) resetCropState();
          else setIsCropOpen(true);
        }}
      >
        <DialogContent
          hideCloseButton
          className="rounded-none border-0"
          style={{
            left: 0,
            top: 0,
            transform: 'none',
            width: '100vw',
            height: '100vh',
            maxWidth: '100vw',
            maxHeight: '100vh',
            borderRadius: 0,
          }}
        >
          <div className="flex flex-col h-full w-full">
            <div className="flex-1 relative bg-black">
              {pendingImageSrc && (
                <Cropper
                  image={pendingImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape={aspectRatio === 'circle' ? 'round' : 'rect'}
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                />
              )}
            </div>

            <div className="px-5 py-4 bg-background">
              <div className="space-y-2">
                <div className="text-sm font-medium">Zoom</div>
                <Slider
                  value={[zoom]}
                  min={1}
                  max={3}
                  step={0.05}
                  onValueChange={(v) => setZoom(v[0] ?? 1)}
                  trackClassName="h-4"
                />
              </div>
            </div>

            <div className="px-5 pb-6 bg-background">
              <div className="flex items-center justify-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetCropState}
                  disabled={uploading}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleCropSave} disabled={uploading || !croppedAreaPixels}>
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Info Text */}
      <p className="text-xs text-muted-foreground">
        {value.length} / {maxVideos} videos • Max {maxSizeMB}MB per video
      </p>
    </div>
  );
}

