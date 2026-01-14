/**
 * Lucide React Icon Mapping
 * 
 * Maps icon names to lucide-react icon components.
 * This file imports all lucide-react icons used in the application.
 */

import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Mapping from icon names (from iconMapping.ts) to lucide-react icon components
 */
export const lucideIconMap: Record<string, LucideIcon> = {
  // Size 16px
  'X': LucideIcons.X,
  
  // Size 17px
  'Heart': LucideIcons.Heart,
  'Music': LucideIcons.Music,
  'MapPin': LucideIcons.MapPin,
  'Check': LucideIcons.Check,
  
  // Size 24px - Action Icons
  'Search': LucideIcons.Search,
  'Send': LucideIcons.Send,
  'Share2': LucideIcons.Share2,
  'Upload': LucideIcons.Upload,
  'Download': LucideIcons.Download,
  'SquarePen': LucideIcons.SquarePen,
  'Trash2': LucideIcons.Trash2,
  'RefreshCw': LucideIcons.RefreshCw,
  'Repeat': LucideIcons.Repeat,
  'Plus': LucideIcons.Plus,
  'SquarePlus': LucideIcons.SquarePlus,
  
  // Size 24px - UI Icons
  'Menu': LucideIcons.Menu,
  'Bell': LucideIcons.Bell,
  'Settings': LucideIcons.Settings,
  'Filter': LucideIcons.Filter,
  'ArrowDownUp': LucideIcons.ArrowDownUp,
  'SlidersHorizontal': LucideIcons.SlidersHorizontal,
  'Minus': LucideIcons.Minus,
  'CircleHelp': LucideIcons.CircleHelp,
  'Info': LucideIcons.Info,
  'AlertTriangle': LucideIcons.AlertTriangle,
  'CheckCircle2': LucideIcons.CheckCircle2,
  'Ellipsis': LucideIcons.MoreHorizontal,
  
  // Size 24px - Arrows & Navigation
  'ArrowDown': LucideIcons.ArrowDown,
  'ArrowUp': LucideIcons.ArrowUp,
  'ChevronLeft': LucideIcons.ChevronLeft,
  'ArrowLeft': LucideIcons.ArrowLeft,
  'ChevronRight': LucideIcons.ChevronRight,
  'ChevronUp': LucideIcons.ChevronUp,
  'ChevronDown': LucideIcons.ChevronDown,
  
  // Size 24px - Social & Engagement
  'ThumbsUp': LucideIcons.ThumbsUp,
  'Star': LucideIcons.Star,
  
  // Size 24px - Media Icons
  'Image': LucideIcons.Image,
  'Camera': LucideIcons.Camera,
  'Video': LucideIcons.Video,
  
  // Size 24px - Navigation Icons
  'Home': LucideIcons.Home,
  'Compass': LucideIcons.Compass,
  
  // Size 24px - Location & Events
  'Calendar': LucideIcons.Calendar,
  'Ticket': LucideIcons.Ticket,
  'Clock': LucideIcons.Clock,
  
  // Size 24px - Communication
  'Mail': LucideIcons.Mail,
  'MessageSquare': LucideIcons.MessageSquare,
  'AtSign': LucideIcons.AtSign,
  
  // Size 24px - User & Profile
  'User': LucideIcons.User,
  'UserPlus': LucideIcons.UserPlus,
  'Users': LucideIcons.Users,
  
  // Size 24px - Business & Commerce
  'DollarSign': LucideIcons.DollarSign,
  'Building2': LucideIcons.Building2,
  
  // Size 24px - Security & Verification
  'Lock': LucideIcons.Lock,
  'Key': LucideIcons.Key,
  'Shield': LucideIcons.Shield,
  'Ban': LucideIcons.Ban,
  'Flag': LucideIcons.Flag,
  
  // Size 24px - Analytics & Data
  'BarChart3': LucideIcons.BarChart3,
  'PieChart': LucideIcons.PieChart,
  'TrendingUp': LucideIcons.TrendingUp,
  
  // Size 24px - Other
  'Globe': LucideIcons.Globe,
  'Eye': LucideIcons.Eye,
  'ExternalLink': LucideIcons.ExternalLink,
  'Maximize2': LucideIcons.Maximize2,
  'MousePointer': LucideIcons.MousePointer,
  'Target': LucideIcons.Target,
  'Route': LucideIcons.Route,
  'Award': LucideIcons.Award,
  'LogOut': LucideIcons.LogOut,
  
  // Size 24px - Brand Logos
  'Instagram': LucideIcons.Instagram,
  
  // Size 35px & 60px (same icons, different sizes)
  'Sparkles': LucideIcons.Sparkles,
  'Mic': LucideIcons.Mic,
  'Pencil': LucideIcons.Pencil,
  'MessageCircle': LucideIcons.MessageCircle,
};

/**
 * Get a lucide-react icon component by name
 */
export function getLucideIcon(lucideName: string): LucideIcon | null {
  return lucideIconMap[lucideName] || null;
}
