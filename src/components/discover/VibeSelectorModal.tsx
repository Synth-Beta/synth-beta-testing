import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VibeCard } from './VibeCard';
import {
  Music,
  Calendar,
  DollarSign,
  Building2,
  Clock,
  TrendingUp,
  Star,
  MapPin,
  Sparkles,
  Users,
  Award,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { VibeType } from '@/services/discoverVibeService';

interface Vibe {
  id: VibeType;
  title: string;
  description: string;
  icon: LucideIcon;
  category: 'taste' | 'context' | 'discovery' | 'opinion';
}

const VIBES: Vibe[] = [
  // By Taste
  {
    id: 'similar-artists',
    title: 'Similar to Artists You Love',
    description: 'Events by artists similar to ones you\'ve seen',
    icon: Music,
    category: 'taste',
  },
  {
    id: 'last-5-attended',
    title: 'Based on Your Last 5 Shows',
    description: 'Recommendations from your recent attendance',
    icon: Calendar,
    category: 'taste',
  },
  {
    id: 'similar-taste-users',
    title: 'Highly Rated by Similar Tastes',
    description: 'Events loved by users with similar music taste',
    icon: Users,
    category: 'taste',
  },
  // By Context
  {
    id: 'this-weekend',
    title: 'This Weekend',
    description: 'Shows happening this Saturday and Sunday',
    icon: Calendar,
    category: 'context',
  },
  {
    id: 'under-25',
    title: 'Under $25',
    description: 'Affordable shows under $25',
    icon: DollarSign,
    category: 'context',
  },
  {
    id: 'small-venues',
    title: 'Small Venues',
    description: 'Intimate shows at smaller venues',
    icon: Building2,
    category: 'context',
  },
  {
    id: 'late-shows',
    title: 'Late Shows',
    description: 'Shows starting after 10 PM',
    icon: Clock,
    category: 'context',
  },
  // By Discovery Energy
  {
    id: 'up-and-coming',
    title: 'Up-and-Coming Artists',
    description: 'Artists with fewer than 10 reviews',
    icon: TrendingUp,
    category: 'discovery',
  },
  {
    id: 'less-than-10-reviews',
    title: 'Events with <10 Reviews',
    description: 'Be among the first to review these shows',
    icon: Sparkles,
    category: 'discovery',
  },
  // By Opinion
  {
    id: 'highest-rated-month',
    title: 'Highest-Rated This Month',
    description: 'Events rated 4.5+ stars this month',
    icon: Star,
    category: 'opinion',
  },
  {
    id: 'best-venues',
    title: 'Best Venues',
    description: 'Events at venues rated 4+ stars',
    icon: Award,
    category: 'opinion',
  },
  {
    id: 'best-value',
    title: 'Best Value',
    description: 'Events rated highly for value-for-price',
    icon: Zap,
    category: 'opinion',
  },
];

interface VibeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVibe: (vibeType: VibeType) => void;
  isMobile?: boolean;
}

export const VibeSelectorModal: React.FC<VibeSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectVibe,
  isMobile = false,
}) => {
  const handleSelect = (vibeType: VibeType) => {
    onSelectVibe(vibeType);
    onClose();
  };

  const tasteVibes = VIBES.filter(v => v.category === 'taste');
  const contextVibes = VIBES.filter(v => v.category === 'context');
  const discoveryVibes = VIBES.filter(v => v.category === 'discovery');
  const opinionVibes = VIBES.filter(v => v.category === 'opinion');

  const content = (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">Start with a Vibe</h2>
        <p className="text-sm text-muted-foreground">
          Choose a curated entry point to discover events through different perspectives
        </p>
      </div>

      {/* By Taste */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase">By Taste</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tasteVibes.map((vibe) => (
            <VibeCard
              key={vibe.id}
              title={vibe.title}
              description={vibe.description}
              icon={vibe.icon}
              onClick={() => handleSelect(vibe.id)}
            />
          ))}
        </div>
      </div>

      {/* By Context */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase">By Context</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contextVibes.map((vibe) => (
            <VibeCard
              key={vibe.id}
              title={vibe.title}
              description={vibe.description}
              icon={vibe.icon}
              onClick={() => handleSelect(vibe.id)}
            />
          ))}
        </div>
      </div>

      {/* By Discovery Energy */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase">By Discovery Energy</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {discoveryVibes.map((vibe) => (
            <VibeCard
              key={vibe.id}
              title={vibe.title}
              description={vibe.description}
              icon={vibe.icon}
              onClick={() => handleSelect(vibe.id)}
            />
          ))}
        </div>
      </div>

      {/* By Opinion */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase">By Opinion</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {opinionVibes.map((vibe) => (
            <VibeCard
              key={vibe.id}
              title={vibe.title}
              description={vibe.description}
              icon={vibe.icon}
              onClick={() => handleSelect(vibe.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Browse by Vibe</SheetTitle>
            <SheetDescription>
              Choose a curated entry point to discover events
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Browse by Vibe</DialogTitle>
          <DialogDescription>
            Choose a curated entry point to discover events through different perspectives
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">{content}</div>
      </DialogContent>
    </Dialog>
  );
};

