import React, { useState, useRef } from 'react';
import { Star } from 'lucide-react';
import './StarRating.css';

export interface StarRatingProps {
  /**
   * Current rating value (0-5, can be decimal like 2.5)
   * For display-only mode, this is the rating to display
   * For interactive mode, this is the current/initial rating
   */
  value: number;
  
  /**
   * Whether the stars are interactive (can be clicked/tapped)
   * Default: false (display-only)
   */
  interactive?: boolean;
  
  /**
   * Callback when rating changes (only used in interactive mode)
   */
  onChange?: (value: number) => void;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * StarRating Component
 * 
 * Displays 5 stars with support for partial fills and interactive rating.
 * 
 * Display-only mode:
 * - Standard icon size (24px)
 * - Shows rating with partial fills (e.g., 2.5 stars = 2 full + 1 half-filled)
 * 
 * Interactive mode:
 * - Medium icon size (35px)
 * - Each star has 44x44 touch target
 * - Tapping left 50% = half star (0.5)
 * - Tapping right 50% = full star (1.0)
 * - Stars to the left are completely filled
 * 
 * Usage:
 *   <StarRating value={2.5} /> // Display-only
 *   <StarRating value={3} interactive onChange={(v) => console.log(v)} /> // Interactive
 */
export const StarRating: React.FC<StarRatingProps> = ({
  value,
  interactive = false,
  onChange,
  className = '',
}) => {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Clamp value between 0 and 5
  const clampedValue = Math.max(0, Math.min(5, value));
  
  // Use hover value if hovering, otherwise use actual value
  const displayValue = hoverValue !== null ? hoverValue : clampedValue;

  // Handle star click/tap in interactive mode
  const handleStarClick = (starIndex: number, clickX: number) => {
    if (!interactive || !onChange) return;

    const starElement = starRefs.current[starIndex];
    if (!starElement) return;

    const rect = starElement.getBoundingClientRect();
    const relativeX = clickX - rect.left;
    const starWidth = rect.width;
    
    // Determine if left half (0.5) or right half (1.0)
    const fillAmount = relativeX < starWidth / 2 ? 0.5 : 1.0;
    
    // Calculate new rating: starIndex (0-4) + fillAmount (0.5 or 1.0)
    const newRating = starIndex + fillAmount;
    
    onChange(newRating);
  };

  // Handle mouse/touch events
  const handleStarInteraction = (
    e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>,
    starIndex: number
  ) => {
    if (!interactive) return;

    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined) return;

    setIsDragging(true);
    handleStarClick(starIndex, clientX);
  };

  // Handle swipe/drag across stars
  const handlePointerMove = (e: MouseEvent | TouchEvent) => {
    if (!interactive || !isDragging || !containerRef.current) return;

    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - containerRect.left;
    const containerWidth = containerRect.width;
    
    // Calculate which star we're over (0-4)
    const starWidth = containerWidth / 5;
    const starIndex = Math.floor(relativeX / starWidth);
    const clampedStarIndex = Math.max(0, Math.min(4, starIndex));
    
    // Calculate position within the star (0-1)
    const positionInStar = (relativeX - (clampedStarIndex * starWidth)) / starWidth;
    
    // Determine if left half (0.5) or right half (1.0)
    const fillAmount = positionInStar < 0.5 ? 0.5 : 1.0;
    
    // Calculate new rating
    const newRating = clampedStarIndex + fillAmount;
    
    if (onChange) {
      onChange(newRating);
    }
    setHoverValue(newRating);
  };

  const handlePointerEnd = () => {
    if (interactive) {
      setIsDragging(false);
      setHoverValue(null);
    }
  };

  // Handle hover for visual feedback
  const handleStarHover = (starIndex: number, clientX: number) => {
    if (!interactive) return;

    const starElement = starRefs.current[starIndex];
    if (!starElement) return;

    const rect = starElement.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const starWidth = rect.width;
    
    const fillAmount = relativeX < starWidth / 2 ? 0.5 : 1.0;
    const hoverRating = starIndex + fillAmount;
    
    setHoverValue(hoverRating);
  };

  const handleMouseLeave = () => {
    if (interactive && !isDragging) {
      setHoverValue(null);
    }
  };

  // Add global event listeners for drag/swipe
  React.useEffect(() => {
    if (!interactive) return;

    const handleMouseMove = (e: MouseEvent) => handlePointerMove(e);
    const handleMouseUp = () => handlePointerEnd();
    const handleTouchMove = (e: TouchEvent) => handlePointerMove(e);
    const handleTouchEnd = () => handlePointerEnd();

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [interactive, isDragging]);

  // Render a single star with partial fill support
  const renderStar = (starIndex: number) => {
    const starValue = displayValue - starIndex;
    const isFilled = starValue >= 1;
    const isHalfFilled = starValue >= 0.5 && starValue < 1;
    const starSize = interactive ? 35 : 24;

    const filledStyle = { color: 'var(--rating-star)', fill: 'var(--rating-star)' };
    const emptyStyle = { color: 'var(--neutral-600)', fill: 'none' };

    const renderStarIcon = () => {
      if (isHalfFilled) {
        return (
          <span
            style={{
              position: 'relative',
              display: 'inline-flex',
              width: `${starSize}px`,
              height: `${starSize}px`,
            }}
          >
            <Star size={starSize} style={emptyStyle} />
            <span
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '50%',
                height: '100%',
                overflow: 'hidden',
              }}
            >
              <Star size={starSize} style={filledStyle} />
            </span>
          </span>
        );
      }

      return (
        <Star size={starSize} style={isFilled ? filledStyle : emptyStyle} />
      );
    };

    if (interactive) {
      return (
        <button
          key={starIndex}
          ref={(el) => { starRefs.current[starIndex] = el; }}
          className="star-rating__star star-rating__star--interactive"
          onClick={(e) => handleStarInteraction(e, starIndex)}
          onMouseMove={(e) => handleStarHover(starIndex, e.clientX)}
          onMouseLeave={handleMouseLeave}
          onTouchStart={(e) => handleStarInteraction(e, starIndex)}
          type="button"
          aria-label={`Rate ${starIndex + 1} out of 5 stars`}
        >
          {renderStarIcon()}
        </button>
      );
    } else {
      return (
        <div
          key={starIndex}
          className="star-rating__star star-rating__star--display"
        >
          {renderStarIcon()}
        </div>
      );
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`star-rating ${className}`} 
      role={interactive ? 'radiogroup' : 'img'} 
      aria-label={`Rating: ${clampedValue} out of 5 stars`}
      onMouseLeave={handleMouseLeave}
    >
      {[0, 1, 2, 3, 4].map((starIndex) => renderStar(starIndex))}
    </div>
  );
};

export default StarRating;

