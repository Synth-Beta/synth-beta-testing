import React from 'react';
import { MapPin, Calendar, Ticket, MessageCircle, Share2, Heart, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { formatPrice } from '@/utils/currencyUtils';

interface FigmaEventCardProps {
  event: {
    id: string;
    title: string;
    artist_name?: string;
    venue_name?: string;
    venue_city?: string;
    event_date?: string;
    price_range?: string;
  };
  isInterested?: boolean;
  commentsCount?: number;
  onInterestToggle?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onFlag?: () => void;
  onClick?: () => void;
  className?: string;
}

export const FigmaEventCard: React.FC<FigmaEventCardProps> = ({
  event,
  isInterested = false,
  commentsCount = 0,
  onInterestToggle,
  onComment,
  onShare,
  onFlag,
  onClick,
  className,
}) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Date TBD';
    try {
      // Use shorter format to prevent wrapping issues
      return format(new Date(dateString), 'EEE, MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const formatVenueLocation = () => {
    if (!event.venue_name && !event.venue_city) return 'Venue TBD';
    if (event.venue_name && event.venue_city) {
      return (
        <>
          {event.venue_name} · <span className="text-[#5d646f]">{event.venue_city}</span>
        </>
      );
    }
    return event.venue_name || event.venue_city || 'Venue TBD';
  };

  return (
    <div
      className={cn(
        'bg-[#fcfcfc] border-2 border-[#5d646f] rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] cursor-pointer overflow-hidden relative w-full h-[247px]',
        className
      )}
      onClick={onClick}
    >
      {/* Inner shadow overlay */}
      <div className="absolute inset-[-1px] pointer-events-none shadow-[inset_0px_4px_4px_0px_rgba(0,0,0,0.25)] rounded-[10px]" />

      {/* Event Title - positioned at top-left with width constraint and line clamping */}
      <p className="absolute left-[10px] top-[16px] right-[10px] font-['Inter',sans-serif] font-bold leading-tight not-italic text-[#0e0e0e] text-[16px] line-clamp-2">
        {event.title || event.artist_name || 'Event'}
      </p>

      {/* Information Section - positioned below title with more spacing */}
      <div className="absolute left-[7.5px] top-[60px] w-[252.5px]">
        {/* Location Row - icon centered with multi-line text block */}
        <div className="flex items-center gap-[3.5px] mb-[11px]">
          <MapPin className="size-[24px] text-[#b00056] flex-shrink-0" strokeWidth={2} />
          <p className="flex-1 font-['Inter',sans-serif] font-normal leading-[24px] not-italic text-[16px] text-[#0e0e0e] break-words line-clamp-2">
            {formatVenueLocation()}
          </p>
        </div>
        
        {/* Date Row - icon centered with text */}
        <div className="flex items-center gap-[3.5px] mb-[11px]">
          <Calendar className="size-[24px] text-[#b00056] flex-shrink-0" strokeWidth={2} />
          <p className="flex-1 font-['Inter',sans-serif] font-normal leading-[24px] not-italic text-[16px] text-[#0e0e0e] break-words line-clamp-1">
            {formatDate(event.event_date)}
          </p>
        </div>
        
        {/* Price Row - icon centered with text */}
        <div className="flex items-center gap-[3.5px] mb-0">
          <Ticket className="size-[24px] text-[#b00056] flex-shrink-0" strokeWidth={2} />
          <p className="flex-1 font-['Inter',sans-serif] font-normal leading-[24px] not-italic text-[16px] text-[#0e0e0e] break-words line-clamp-1">
            {formatPrice(event.price_range) || 'Price TBD'}
          </p>
        </div>
      </div>

      {/* Divider - positioned after info section with proper spacing (60px top + max 118px content + 13px spacing = 191px) */}
      <div className="absolute left-0 top-[191px] right-0 bg-[#5d646f] h-px" />

      {/* Buttons Section - positioned after divider with tighter spacing, centered */}
      <div className="absolute left-0 right-0 top-[192px] flex gap-6 items-center justify-center h-[53px] w-full">
        {/* Interested Button */}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onInterestToggle?.();
          }}
          className={cn(
            'bg-[#fcfcfc] border-2 border-[#b00056] flex gap-3 h-9 items-center justify-center px-3 rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]',
            isInterested && 'bg-[#b00056]'
          )}
        >
          <Heart
            className={cn(
              'size-6',
              isInterested ? 'fill-white text-white' : 'text-[#b00056]'
            )}
            strokeWidth={2}
          />
          <span className={cn(
            'font-["Inter",sans-serif] font-normal leading-normal not-italic text-[16px]',
            isInterested ? 'text-white' : 'text-[#b00056]'
          )}>
            Interested
          </span>
        </Button>

        {/* Comments */}
        <div
          className="flex gap-2 items-center justify-center cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onComment?.();
          }}
        >
          <MessageCircle className="size-6 text-[#5d646f]" strokeWidth={2} />
          <span className="font-['Inter',sans-serif] font-normal leading-normal not-italic text-[16px] text-[#0e0e0e]">
            {commentsCount}
          </span>
        </div>

        {/* Share */}
        <div
          className="flex gap-2 items-center justify-center cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onShare?.();
          }}
        >
          <Share2 className="w-[18px] h-[22px] text-[#5d646f]" strokeWidth={2} />
          <span className="font-['Inter',sans-serif] font-normal leading-normal not-italic text-[16px] text-[#0e0e0e]">
            Share
          </span>
        </div>

        {/* Flag */}
        <div
          className="flex gap-2 items-center justify-center cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onFlag?.();
          }}
        >
          <Flag className="w-[18px] h-[22px] text-[#5d646f]" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
};

