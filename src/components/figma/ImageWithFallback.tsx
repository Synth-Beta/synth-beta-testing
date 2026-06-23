import React, { useState } from 'react';

interface ImageWithFallbackProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}

export function ImageWithFallback({ src, alt, className, fallbackSrc }: ImageWithFallbackProps) {
  const [imgSrc, setImgSrc] = useState<string | undefined>(src || undefined);
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    if (!hasError && fallbackSrc) {
      setImgSrc(fallbackSrc);
      setHasError(true);
    } else {
      setImgSrc(undefined);
    }
  };

  if (!imgSrc) {
    return (
      <div className={`${className} bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center`}>
        <span className="text-gray-400 text-xs">No image</span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onError={handleError}
      loading="lazy"
    />
  );
}

