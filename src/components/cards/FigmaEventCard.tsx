import React from 'react';
import { MapPin, Calendar, Ticket, MessageCircle, Share2, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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
  onClick,
  className,
}) => {
  const formatPrice = (priceRange?: string) => {
    if (!priceRange) return null;
    // Extract price from price range string like "$24.65-$36.00"
    return priceRange;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), 'EEEE, MMMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  return (
    <div
      className={cn(
        'bg-[#fcfcfc] border-2 border-[#5d646f] rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] cursor-pointer overflow-hidden relative p-4',
        className
      )}
      onClick={onClick}
      style={{ boxShadow: 'inset 0px 4px 4px 0px rgba(0,0,0,0.25)' }}
    >
      {/* Event Title */}
      <p className="font-['Inter',sans-serif] font-bold leading-normal not-italic text-[#0e0e0e] text-[16px] mb-4">
        {event.title}
      </p>

      {/* Information Section */}
      <div className="flex gap-3 mb-4">
        {/* Icons Column */}
        <div className="flex flex-col gap-[11px] items-center justify-start pt-1">
          <MapPin className="size-[24px] text-[#b00056]" strokeWidth={2} />
          <Calendar className="size-[24px] text-[#b00056]" strokeWidth={2} />
          <Ticket className="size-[24px] text-[#b00056]" strokeWidth={2} />
        </div>

        {/* Text Column */}
        <div className="flex flex-col font-['Inter',sans-serif] font-normal gap-4 items-start justify-start leading-normal not-italic text-[16px] text-[#0e0e0e] flex-1">
          <p>
            {event.venue_name || 'Venue'}
            {event.venue_city && (
              <>
                {' · '}
                <span className="text-[#5d646f]">{event.venue_city}</span>
              </>
            )}
          </p>
          <p>{formatDate(event.event_date) || 'Date TBD'}</p>
          <p>{formatPrice(event.price_range) || 'Price TBD'}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="bg-[#5d646f] h-px w-full mb-4" />

      {/* Buttons Section */}
      <div className="flex gap-6 items-center justify-center">
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
      </div>
    </div>
  );
};

