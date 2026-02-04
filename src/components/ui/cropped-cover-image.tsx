import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReviewThumbnailCrop } from '@/hooks/useReviewForm';
import {
  clampThumbnailCrop,
  computeCoverScale,
  computeMaxOffsetsPx,
  offsetsNormToPx,
  createDefaultThumbnailCrop,
} from '@/utils/reviewThumbnailCrop';
import { cn } from '@/lib/utils';

interface CroppedCoverImageProps {
  src: string;
  alt: string;
  crop?: ReviewThumbnailCrop | null;
  className?: string;
  imgClassName?: string;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

export function CroppedCoverImage({ src, alt, crop, className, imgClassName, onError }: CroppedCoverImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const rect = entry?.contentRect;
      if (!rect) return;
      setContainerSize({ w: rect.width, h: rect.height });
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
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const renderState = useMemo(() => {
    if (!containerSize || !imageSize) return null;
    const { w: containerW, h: containerH } = containerSize;
    const { w: imgW, h: imgH } = imageSize;
    if (!(containerW > 0 && containerH > 0 && imgW > 0 && imgH > 0)) return null;

    const coverScale = computeCoverScale({
      containerWidth: containerW,
      containerHeight: containerH,
      imageWidth: imgW,
      imageHeight: imgH,
    });
    const baseW = imgW * coverScale;
    const baseH = imgH * coverScale;

    const resolvedCrop = clampThumbnailCrop(crop ?? createDefaultThumbnailCrop());

    const { maxX, maxY } = computeMaxOffsetsPx({
      containerWidth: containerW,
      containerHeight: containerH,
      baseWidth: baseW,
      baseHeight: baseH,
      scale: resolvedCrop.scale,
    });

    const offsetPxX = offsetsNormToPx({ offsetNorm: resolvedCrop.offsetX, maxPx: maxX });
    const offsetPxY = offsetsNormToPx({ offsetNorm: resolvedCrop.offsetY, maxPx: maxY });

    return {
      baseW,
      baseH,
      scale: resolvedCrop.scale,
      offsetPxX,
      offsetPxY,
    };
  }, [containerSize, imageSize, crop]);

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden', className)}>
      {renderState ? (
        <img
          src={src}
          alt={alt}
          onError={onError}
          className={cn('absolute left-1/2 top-1/2 select-none', imgClassName)}
          draggable={false}
          style={{
            width: `${renderState.baseW}px`,
            height: `${renderState.baseH}px`,
            transform: `translate(-50%, -50%) translate(${renderState.offsetPxX}px, ${renderState.offsetPxY}px) scale(${renderState.scale})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        />
      ) : (
        <img src={src} alt={alt} onError={onError} className={cn('w-full h-full object-cover', imgClassName)} />
      )}
    </div>
  );
}

