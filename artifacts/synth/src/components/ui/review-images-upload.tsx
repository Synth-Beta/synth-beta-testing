import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Camera, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { storageService, type BucketName } from '@/services/storageService';
import type { ReviewImageItem, ReviewThumbnailCrop } from '@/hooks/useReviewForm';
import {
  REVIEW_THUMBNAIL_ASPECT_RATIO,
  clampThumbnailCrop,
  computeCoverScale,
  computeMaxOffsetsPx,
  createDefaultThumbnailCrop,
  generateThumbnailBlob,
  offsetsNormToPx,
  offsetsPxToNorm,
} from '@/utils/reviewThumbnailCrop';
import { CroppedCoverImage } from '@/components/ui/cropped-cover-image';

const makeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const THUMB_OUTPUT = { width: 1412, height: 1000 }; // matches 353/250 aspect ratio

export interface ReviewImagesUploadProps {
  images: ReviewImageItem[];
  onChange: (images: ReviewImageItem[]) => void;
  userId: string;
  bucket: BucketName;
  maxPhotos?: number;
  maxSizeMB?: number;
  label?: string;
  helperText?: string;
  className?: string;
  disabled?: boolean;
  onThumbnailBlobChange?: (blob: Blob | null) => void;
}

export function ReviewImagesUpload(props: ReviewImagesUploadProps) {
  const {
    images,
    onChange,
    userId,
    bucket,
    maxPhotos = 5,
    maxSizeMB = 5,
    label = 'Photos',
    helperText,
    className,
    disabled = false,
    onThumbnailBlobChange,
  } = props;
const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);

  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropImageId, setCropImageId] = useState<string | null>(null);
  const [returnToPreview, setReturnToPreview] = useState(false);

  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);

  const prevLenRef = useRef(images.length);

  const thumbnailId = useMemo(() => images.find((i) => i.isThumbnail)?.id ?? null, [images]);

  const previewImage = useMemo(
    () => (previewImageId ? images.find((i) => i.id === previewImageId) ?? null : null),
    [images, previewImageId]
  );

  const cropTarget = useMemo(
    () => (cropImageId ? images.find((i) => i.id === cropImageId) ?? null : null),
    [images, cropImageId]
  );

  const openFilePicker = () => fileInputRef.current?.click();

  const openPreview = (id: string) => {
    setPreviewImageId(id);
    setIsPreviewOpen(true);
  };

  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewImageId(null);
  };

  const setThumbnailExclusive = (id: string | null) => {
    if (!id) {
      onChange(images.map((img) => ({ ...img, isThumbnail: false })));
      return;
    }
    onChange(
      images.map((img) => ({
        ...img,
        isThumbnail: img.id === id,
      }))
    );
  };

  const openCrop = (id: string, opts?: { fromPreview?: boolean }) => {
    setReturnToPreview(Boolean(opts?.fromPreview));
    setCropImageId(id);
    setIsCropOpen(true);
  };

  const closeCrop = (opts?: { reopenPreview?: boolean }) => {
    const shouldReopenPreview = opts?.reopenPreview === true && returnToPreview && cropImageId;
    setIsCropOpen(false);
    setCropImageId(null);
    setReturnToPreview(false);
    if (shouldReopenPreview && cropImageId) {
      openPreview(cropImageId);
    }
  };

  useEffect(() => {
    const prevLen = prevLenRef.current;
    const nextLen = images.length;
    prevLenRef.current = nextLen;

    // Auto-open crop ONLY when user adds their first photo
    if (prevLen === 0 && nextLen >= 1) {
      const first = images[0];
      if (first) {
        // Ensure first is thumbnail by default.
        if (!first.isThumbnail) {
          setThumbnailExclusive(first.id);
        }
        openCrop(first.id, { fromPreview: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images.length]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check if adding these files would exceed max
    if (images.length + files.length > maxPhotos) {
      return;
    }

    for (const file of files) {
      const validation = storageService.validateImage(file, { maxSizeMB });
      if (!validation.valid) {
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const uploaded: ReviewImageItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const result = await storageService.uploadPhoto(files[i], bucket, userId, { maxSizeMB });
        uploaded.push({
          id: makeId(),
          url: result.url,
          isThumbnail: false,
          thumbnailCrop: null,
        });
        setUploadProgress(((i + 1) / files.length) * 100);
      }

      const wasEmpty = images.length === 0;
      let next = [...images, ...uploaded];
      if (wasEmpty && next.length > 0) {
        // First image uploaded: default thumbnail to first image.
        next = next.map((img, idx) => ({ ...img, isThumbnail: idx === 0 }));
      }

      onChange(next);
      } catch (error) {
      console.error('Upload error:', error);
      } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const requestRemove = (id: string) => {
    setRemoveTargetId(id);
    setRemoveConfirmOpen(true);
  };

  const performRemove = async (id: string) => {
    const target = images.find((img) => img.id === id);
    if (!target) return;

    try {
      const path = storageService.getPathFromUrl(target.url, bucket);
      if (path) {
        await storageService.deletePhoto(bucket, path);
      }

      const wasThumbnail = target.isThumbnail;
      const remaining = images.filter((img) => img.id !== id);

      let next = remaining;
      if (wasThumbnail) {
        if (remaining.length > 0) {
          const firstId = remaining[0].id;
          next = remaining.map((img) => ({ ...img, isThumbnail: img.id === firstId }));
        } else {
          next = [];
          onThumbnailBlobChange?.(null);
        }
      }

      onChange(next);
      } catch (error) {
      console.error('Delete error:', error);
      }
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
        {images.map((img) => (
          <div
            key={img.id}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer"
            onClick={() => openPreview(img.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openPreview(img.id);
            }}
            style={img.isThumbnail ? { boxShadow: '0 0 0 2px var(--brand-pink-500)' } : undefined}
            aria-label={img.isThumbnail ? 'Thumbnail photo' : 'Photo'}
          >
            <img src={img.url} alt="Uploaded photo" className="w-full h-full object-cover" draggable={false} />
          </div>
        ))}

        {images.length < maxPhotos && (
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
            aria-label="Add photo"
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

      <p className="text-xs text-muted-foreground">
        {images.length} / {maxPhotos} photos • Max {maxSizeMB}MB per photo
      </p>

      {/* Preview Modal */}
      {previewImage && (
        <Dialog
          open={isPreviewOpen}
          onOpenChange={(open) => {
            if (!open) closePreview();
            else setIsPreviewOpen(true);
          }}
        >
          <DialogContent className="max-w-3xl p-0 overflow-hidden">
            <div className="relative bg-black">
              <button
                type="button"
                onClick={closePreview}
                className="absolute top-3 right-3 z-10 rounded-full bg-black/60 text-white p-2 hover:bg-black/70"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <img src={previewImage.url} alt="Preview" className="block w-full max-h-[70vh] object-contain" />
            </div>

            <div className="p-5">
              <div className="mt-6 space-y-3">
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    const isThumb = previewImage.isThumbnail;
                    const id = previewImage.id;

                    if (!isThumb) {
                      // Select as thumbnail first (exclusive), keep previous crop data on old thumbnails.
                      setThumbnailExclusive(id);
                    }

                    closePreview();
                    openCrop(id, { fromPreview: true });
                  }}
                >
                  {previewImage.isThumbnail ? 'Edit Thumbnail' : 'Select as Thumbnail'}
                </Button>

                <AlertDialog open={removeConfirmOpen} onOpenChange={setRemoveConfirmOpen}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => requestRemove(previewImage.id)}
                  >
                    Remove Photo
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove this photo?</AlertDialogTitle>
                      <AlertDialogDescription>This will remove the photo from your review.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel
                        onClick={() => {
                          setRemoveTargetId(null);
                          setRemoveConfirmOpen(false);
                        }}
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        onClick={async () => {
                          const id = removeTargetId;
                          setRemoveTargetId(null);
                          setRemoveConfirmOpen(false);
                          if (!id) return;
                          await performRemove(id);
                          closePreview();
                        }}
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Crop Modal */}
      {cropTarget && (
        <ThumbnailCropModal
          open={isCropOpen}
          imageUrl={cropTarget.url}
          initialCrop={cropTarget.thumbnailCrop}
          aspectRatio={REVIEW_THUMBNAIL_ASPECT_RATIO}
          onCancel={() => closeCrop({ reopenPreview: true })}
          onSave={async (nextCrop) => {
            const safeCrop = clampThumbnailCrop(nextCrop, { minScale: 1, maxScale: 4 });
            // Persist crop on the image item.
            onChange(
              images.map((img) =>
                img.id === cropTarget.id
                  ? { ...img, thumbnailCrop: safeCrop, isThumbnail: img.isThumbnail || img.id === thumbnailId }
                  : img
              )
            );

            // If this image is the thumbnail, generate a derived thumbnail blob for `${reviewId}/thumbnail.jpg`.
            const isThumb = images.find((i) => i.id === cropTarget.id)?.isThumbnail ?? cropTarget.isThumbnail;
            if (isThumb) {
              try {
                const blob = await generateThumbnailBlob({
                  imageUrl: cropTarget.url,
                  crop: safeCrop,
                  outputWidth: THUMB_OUTPUT.width,
                  outputHeight: THUMB_OUTPUT.height,
                  mimeType: 'image/jpeg',
                  quality: 0.85,
                });
                onThumbnailBlobChange?.(blob);
              } catch (err) {
                console.warn('Thumbnail generation failed:', err);
              }
            }

            closeCrop({ reopenPreview: true });
          }}
        />
      )}
    </div>
  );
}

function ThumbnailCropModal(props: {
  open: boolean;
  imageUrl: string;
  initialCrop: ReviewThumbnailCrop | null;
  aspectRatio: number;
  onCancel: () => void;
  onSave: (crop: ReviewThumbnailCrop) => void | Promise<void>;
}) {
  const { open, imageUrl, initialCrop, aspectRatio, onCancel, onSave } = props;

  const [saving, setSaving] = useState(false);
  const [crop, setCrop] = useState<ReviewThumbnailCrop>(() =>
    clampThumbnailCrop(initialCrop ?? createDefaultThumbnailCrop(aspectRatio), { minScale: 1, maxScale: 4 })
  );

  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panStartRef = useRef<{ startX: number; startY: number; startOffsetPxX: number; startOffsetPxY: number } | null>(
    null
  );
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    // Reset per-open session state.
    if (open) {
      setSaving(false);
      setCrop(clampThumbnailCrop(initialCrop ?? createDefaultThumbnailCrop(aspectRatio), { minScale: 1, maxScale: 4 }));
      pointersRef.current.clear();
      panStartRef.current = null;
      pinchStartRef.current = null;
    }
  }, [open, initialCrop, aspectRatio]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setFrameSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) setImageSize({ w, h });
    };
    img.onerror = () => {
      if (cancelled) return;
      setImageSize(null);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const geometry = useMemo(() => {
    if (!frameSize || !imageSize) return null;
    const coverScale = computeCoverScale({
      containerWidth: frameSize.w,
      containerHeight: frameSize.h,
      imageWidth: imageSize.w,
      imageHeight: imageSize.h,
    });
    const baseW = imageSize.w * coverScale;
    const baseH = imageSize.h * coverScale;
    const { maxX, maxY } = computeMaxOffsetsPx({
      containerWidth: frameSize.w,
      containerHeight: frameSize.h,
      baseWidth: baseW,
      baseHeight: baseH,
      scale: crop.scale,
    });
    const offsetPxX = offsetsNormToPx({ offsetNorm: crop.offsetX, maxPx: maxX });
    const offsetPxY = offsetsNormToPx({ offsetNorm: crop.offsetY, maxPx: maxY });
    return { baseW, baseH, maxX, maxY, offsetPxX, offsetPxY };
  }, [frameSize, imageSize, crop.scale, crop.offsetX, crop.offsetY]);

  const setCropFromOffsetsPx = (next: { scale?: number; offsetPxX: number; offsetPxY: number }) => {
    if (!geometry) return;
    const nextScale = typeof next.scale === 'number' ? next.scale : crop.scale;

    const { maxX, maxY } = computeMaxOffsetsPx({
      containerWidth: frameSize?.w ?? 0,
      containerHeight: frameSize?.h ?? 0,
      baseWidth: geometry.baseW,
      baseHeight: geometry.baseH,
      scale: nextScale,
    });

    const clampedPxX = Math.max(-maxX, Math.min(maxX, next.offsetPxX));
    const clampedPxY = Math.max(-maxY, Math.min(maxY, next.offsetPxY));

    const nextOffsetX = offsetsPxToNorm({ offsetPx: clampedPxX, maxPx: maxX });
    const nextOffsetY = offsetsPxToNorm({ offsetPx: clampedPxY, maxPx: maxY });

    setCrop((prev) =>
      clampThumbnailCrop(
        { ...prev, scale: clampThumbnailCrop({ ...prev, scale: nextScale, offsetX: nextOffsetX, offsetY: nextOffsetY, aspectRatio }).scale, offsetX: nextOffsetX, offsetY: nextOffsetY, aspectRatio },
        { minScale: 1, maxScale: 4 }
      )
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
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
          {/* Header */}
          <div className="bg-white border-b px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={onCancel}
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <div className="flex-1 text-center">
                <div className="text-sm font-semibold text-gray-900">Edit thumbnail</div>
                <div className="text-xs text-gray-500 mt-1">
                  Choose how you want your image to be displayed on review cards
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave(clampThumbnailCrop(crop, { minScale: 1, maxScale: 4 }));
                  } finally {
                    setSaving(false);
                  }
                }}
                className={cn(
                  'text-sm font-semibold',
                  saving ? 'text-gray-400' : 'text-pink-600 hover:text-pink-700'
                )}
                disabled={saving}
                aria-label="Save thumbnail crop"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="px-5 py-6 flex flex-col items-center">
              <div
                ref={frameRef}
                className="w-full max-w-[520px] overflow-hidden rounded-xl bg-neutral-50 border border-neutral-200"
                style={{
                  aspectRatio: `${aspectRatio}`,
                  touchAction: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  cursor: 'grab',
                }}
                onWheel={(e) => {
                  // Ctrl+wheel zoom / trackpad
                  e.preventDefault();
                  const delta = e.deltaY;
                  const factor = Math.exp(-delta / 500);
                  const nextScale = Math.max(1, Math.min(4, crop.scale * factor));
                  if (!geometry) {
                    setCrop((prev) => clampThumbnailCrop({ ...prev, scale: nextScale }, { minScale: 1, maxScale: 4 }));
                    return;
                  }
                  setCropFromOffsetsPx({ scale: nextScale, offsetPxX: geometry.offsetPxX, offsetPxY: geometry.offsetPxY });
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.cursor = 'grabbing';
                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                  pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

                  if (!geometry) return;

                  if (pointersRef.current.size === 1) {
                    panStartRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      startOffsetPxX: geometry.offsetPxX,
                      startOffsetPxY: geometry.offsetPxY,
                    };
                  } else if (pointersRef.current.size === 2) {
                    const pts = Array.from(pointersRef.current.values());
                    const dx = pts[0].x - pts[1].x;
                    const dy = pts[0].y - pts[1].y;
                    pinchStartRef.current = { dist: Math.hypot(dx, dy), scale: crop.scale };
                    panStartRef.current = null;
                  }
                }}
                onPointerMove={(e) => {
                  e.preventDefault();
                  if (!pointersRef.current.has(e.pointerId)) return;
                  pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                  if (!geometry) return;

                  if (pointersRef.current.size === 2 && pinchStartRef.current) {
                    const pts = Array.from(pointersRef.current.values());
                    const dx = pts[0].x - pts[1].x;
                    const dy = pts[0].y - pts[1].y;
                    const dist = Math.hypot(dx, dy);
                    const ratio = pinchStartRef.current.dist > 0 ? dist / pinchStartRef.current.dist : 1;
                    const nextScale = Math.max(1, Math.min(4, pinchStartRef.current.scale * ratio));
                    setCropFromOffsetsPx({ scale: nextScale, offsetPxX: geometry.offsetPxX, offsetPxY: geometry.offsetPxY });
                    return;
                  }

                  if (pointersRef.current.size === 1 && panStartRef.current) {
                    const dx = e.clientX - panStartRef.current.startX;
                    const dy = e.clientY - panStartRef.current.startY;
                    setCropFromOffsetsPx({
                      offsetPxX: panStartRef.current.startOffsetPxX + dx,
                      offsetPxY: panStartRef.current.startOffsetPxY + dy,
                    });
                  }
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.cursor = 'grab';
                  pointersRef.current.delete(e.pointerId);
                  if (pointersRef.current.size < 2) pinchStartRef.current = null;
                  if (pointersRef.current.size === 0) panStartRef.current = null;
                }}
                onPointerCancel={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.cursor = 'grab';
                  pointersRef.current.delete(e.pointerId);
                  if (pointersRef.current.size < 2) pinchStartRef.current = null;
                  if (pointersRef.current.size === 0) panStartRef.current = null;
                }}
                aria-label="Thumbnail crop frame"
              >
                <CroppedCoverImage
                  src={imageUrl}
                  alt="Thumbnail crop preview"
                  crop={crop}
                  className="w-full h-full"
                  imgClassName="pointer-events-none"
                />
              </div>

              <div className="w-full max-w-[520px] mt-6 space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-900">Zoom</div>
                  <Slider
                    value={[crop.scale]}
                    min={1}
                    max={4}
                    step={0.01}
                    onValueChange={(v) => {
                      const nextScale = v[0] ?? 1;
                      if (!geometry) {
                        setCrop((prev) => clampThumbnailCrop({ ...prev, scale: nextScale }, { minScale: 1, maxScale: 4 }));
                        return;
                      }
                      setCropFromOffsetsPx({ scale: nextScale, offsetPxX: geometry.offsetPxX, offsetPxY: geometry.offsetPxY });
                    }}
                    trackClassName="h-2"
                  />
                </div>

                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setCrop(clampThumbnailCrop(createDefaultThumbnailCrop(aspectRatio), { minScale: 1, maxScale: 4 }));
                    }}
                    aria-label="Recenter thumbnail"
                  >
                    Recenter
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

