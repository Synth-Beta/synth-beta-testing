import { supabase } from '@/integrations/supabase/client';

export type BucketName = 'review-photos' | 'profile-avatars' | 'event-photos' | 'review-videos';

export interface UploadResult {
  url: string;
  path: string;
}

export interface UploadOptions {
  maxSizeMB?: number;
  allowedTypes?: string[];
  compressionQuality?: number;
}

class StorageService {
  private readonly DEFAULT_OPTIONS: UploadOptions = {
    maxSizeMB: 5,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'],
    compressionQuality: 0.8,
  };

  /**
   * Upload a photo to Supabase storage
   */
  async uploadPhoto(
    file: File,
    bucket: BucketName,
    userId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    // Validate file type
    if (!opts.allowedTypes?.includes(file.type)) {
      throw new Error(
        `Invalid file type. Allowed types: ${opts.allowedTypes?.join(', ')}`
      );
    }

    // Validate file size
    const maxSizeBytes = (opts.maxSizeMB || 5) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new Error(
        `File size exceeds ${opts.maxSizeMB}MB limit. Current size: ${(
          file.size /
          1024 /
          1024
        ).toFixed(2)}MB`
      );
    }

    // Process and potentially compress the image
    const processedFile = await this.processImage(file, opts);

    // Generate unique filename
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, processedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error(`Failed to upload photo: ${error.message}`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(data.path);

    return {
      url: publicUrl,
      path: data.path,
    };
  }

  /**
   * Upload multiple photos
   */
  async uploadPhotos(
    files: File[],
    bucket: BucketName,
    userId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult[]> {
    const uploadPromises = files.map((file) =>
      this.uploadPhoto(file, bucket, userId, options)
    );
    return Promise.all(uploadPromises);
  }

  /**
   * Delete a photo from storage
   */
  async deletePhoto(bucket: BucketName, path: string): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete photo: ${error.message}`);
    }
  }

  /**
   * Delete multiple photos
   */
  async deletePhotos(bucket: BucketName, paths: string[]): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete photos: ${error.message}`);
    }
  }

  /**
   * Extract path from storage URL
   */
  getPathFromUrl(url: string, bucket: BucketName): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split(`/storage/v1/object/public/${bucket}/`);
      return pathParts[1] || null;
    } catch {
      return null;
    }
  }

  /**
   * Process and optionally compress image
   */
  private async processImage(file: File, options: UploadOptions): Promise<Blob> {
    // Skip compression for small files or if quality is 1
    if (file.size < 500000 || options.compressionQuality === 1) {
      return file;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if too large (max 1920px on longest side)
          const maxDimension = 1920;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = (height / width) * maxDimension;
              width = maxDimension;
            } else {
              width = (width / height) * maxDimension;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            file.type,
            options.compressionQuality || 0.8
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
    });
  }

  /**
   * Validate image before upload
   */
  validateImage(file: File, options: UploadOptions = {}): { valid: boolean; error?: string } {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    // Check file type
    if (!opts.allowedTypes?.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Please use: ${opts.allowedTypes?.join(', ')}`,
      };
    }

    // Check file size
    const maxSizeBytes = (opts.maxSizeMB || 5) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${opts.maxSizeMB}MB`,
      };
    }

    return { valid: true };
  }

  /**
   * Upload a video to Supabase storage
   */
  async uploadVideo(
    file: File,
    bucket: BucketName,
    userId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const opts = {
      maxSizeMB: 100,
      allowedTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/3gpp', 'video/x-flv'],
      ...options,
    };

    // Validate file type
    if (!opts.allowedTypes?.includes(file.type)) {
      throw new Error(
        `Invalid file type. Allowed types: ${opts.allowedTypes?.join(', ')}`
      );
    }

    // Validate file size
    const maxSizeBytes = (opts.maxSizeMB || 100) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new Error(
        `File size exceeds ${opts.maxSizeMB}MB limit. Current size: ${(
          file.size /
          1024 /
          1024
        ).toFixed(2)}MB`
      );
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload to Supabase storage (videos don't need compression)
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error(`Failed to upload video: ${error.message}`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(data.path);

    return {
      url: publicUrl,
      path: data.path,
    };
  }

  /**
   * Upload multiple videos
   */
  async uploadVideos(
    files: File[],
    bucket: BucketName,
    userId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult[]> {
    const uploadPromises = files.map((file) =>
      this.uploadVideo(file, bucket, userId, options)
    );
    return Promise.all(uploadPromises);
  }

  /**
   * Delete a video from storage
   */
  async deleteVideo(bucket: BucketName, path: string): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete video: ${error.message}`);
    }
  }

  /**
   * Delete multiple videos
   */
  async deleteVideos(bucket: BucketName, paths: string[]): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete videos: ${error.message}`);
    }
  }

  /**
   * Validate video before upload
   */
  validateVideo(file: File, options: UploadOptions = {}): { valid: boolean; error?: string } {
    const opts = {
      maxSizeMB: 100,
      allowedTypes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/3gpp', 'video/x-flv'],
      ...options,
    };

    // Check file type
    if (!opts.allowedTypes?.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Please use: ${opts.allowedTypes?.join(', ')}`,
      };
    }

    // Check file size
    const maxSizeBytes = (opts.maxSizeMB || 100) * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${opts.maxSizeMB}MB`,
      };
    }

    return { valid: true };
  }
}

export const storageService = new StorageService();

