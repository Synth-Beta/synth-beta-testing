/**
 * Icon Name Mapping
 * 
 * Maps old custom icon names to lucide-react icon component names.
 * This mapping is used by the Icon component to render lucide-react icons
 * instead of custom SVG files.
 * 
 * Only the 4 bottom nav selected-state icons remain as SVG files.
 * All other icons use lucide-react.
 */

// Helper function to convert kebab-case to PascalCase
function kebabToPascal(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

// Extract lucide icon name from class string like "lucide lucide-x-icon lucide-x"
function extractLucideName(classString: string): string {
  const match = classString.match(/lucide-([a-z0-9-]+)(?:\s|"|')/);
  if (match) {
    const kebabName = match[1];
    // Handle special cases
    if (kebabName === 'x') return 'X';
    if (kebabName === 'share-2') return 'Share2';
    if (kebabName === 'trash-2') return 'Trash2';
    if (kebabName === 'refresh-ccw') return 'RefreshCw';
    if (kebabName === 'arrow-down-up') return 'ArrowDownUp';
    if (kebabName === 'sliders-horizontal') return 'SlidersHorizontal';
    if (kebabName === 'circle-check-big') return 'CheckCircle2';
    if (kebabName === 'square-pen') return 'SquarePen';
    if (kebabName === 'triangle-alert') return 'AlertTriangle';
    if (kebabName === 'circle-question-mark') return 'CircleHelp';
    if (kebabName === 'user-round-plus') return 'UserPlus';
    if (kebabName === 'building-2') return 'Building2';
    if (kebabName === 'dollar-sign') return 'DollarSign';
    if (kebabName === 'chart-column-decreasing') return 'BarChart3';
    if (kebabName === 'chart-pie') return 'PieChart';
    if (kebabName === 'trending-up') return 'TrendingUp';
    if (kebabName === 'maximize-2') return 'Maximize2';
    if (kebabName === 'log-out') return 'LogOut';
    if (kebabName === 'mic-vocal') return 'Mic';
    if (kebabName === 'pencil') return 'Pencil';
    if (kebabName === 'message-circle') return 'MessageCircle';
    return kebabToPascal(kebabName);
  }
  return '';
}

/**
 * Mapping from old icon names to lucide-react icon component names
 * Based on ICON_REPLACEMENT_LIST.md
 */
export const iconNameToLucide: Record<string, string> = {
  // Size 16px
  'x': 'X',
  
  // Size 17px
  'heart': 'Heart',
  'smallMusic': 'Music',
  'smallLocation': 'MapPin',
  'smallCheck': 'Check',
  
  // Size 24px - Navigation Icons (unselected states use lucide-react)
  'house': 'Home',
  'discover': 'Compass',
  'circleComment': 'MessageCircle',
  'user': 'User',
  
  // Size 24px - Action Icons
  'search': 'Search',
  'send': 'Send',
  'share': 'Share2',
  'upload': 'Upload',
  'download': 'Download',
  'edit': 'SquarePen',
  'trash': 'Trash2',
  'refresh': 'RefreshCw',
  'repeat': 'Repeat',
  'plus': 'Plus',
  'plusBox': 'SquarePlus',
  
  // Size 24px - UI Icons
  'hamburgerMenu': 'Menu',
  'bell': 'Bell',
  'settings': 'Settings',
  'filter': 'Filter',
  'sort': 'ArrowDownUp',
  'sortFilter': 'SlidersHorizontal',
  'check': 'Check',
  'checkMark': 'Check',
  'circleCheck': 'CheckCircle2',
  'minus': 'Minus',
  'questionMark': 'CircleHelp',
  'infoCircle': 'Info',
  'exclamationTriangle': 'AlertTriangle',
  'ellipsis': 'Ellipsis',
  'moreHorizontal': 'Ellipsis',
  'overflowMenu': 'Ellipsis',
  
  // Size 24px - Arrows & Navigation
  'arrowDown': 'ArrowDown',
  'arrowUp': 'ArrowUp',
  'left': 'ChevronLeft',
  'leftArrow': 'ArrowLeft',
  'right': 'ChevronRight',
  'up': 'ChevronUp',
  'upArrow': 'ArrowUp',
  'down': 'ChevronDown',
  
  // Size 24px - Social & Engagement
  'thumbsUp': 'ThumbsUp',
  'star': 'Star',
  
  // Size 24px - Media Icons
  'image': 'Image',
  'photo': 'Camera',
  'video': 'Video',
  'music': 'Music',
  
  // Size 24px - Location & Events
  'location': 'MapPin',
  'calendar': 'Calendar',
  'ticket': 'Ticket',
  'clock': 'Clock',
  
  // Size 24px - Communication
  'envelope': 'Mail',
  'squareComment': 'MessageSquare',
  'atSymbol': 'AtSign',
  
  // Size 24px - User & Profile
  'userPlus': 'UserPlus',
  'twoUsers': 'Users',
  
  // Size 24px - Business & Commerce
  'dollar': 'DollarSign',
  'building': 'Building2',
  
  // Size 24px - Security & Verification
  'lock': 'Lock',
  'key': 'Key',
  'shield': 'Shield',
  'ban': 'Ban',
  'flag': 'Flag',
  
  // Size 24px - Analytics & Data
  'barChart': 'BarChart3',
  'pieChart': 'PieChart',
  'trendingUp': 'TrendingUp',
  
  // Size 24px - Other
  'globe': 'Globe',
  'eye': 'Eye',
  'externalLink': 'ExternalLink',
  'maximize': 'Maximize2',
  'mousePointer': 'MousePointer',
  'target': 'Target',
  'route': 'Route',
  'ribbonAward': 'Award',
  'logOut': 'LogOut',
  
  // Size 24px - Brand Logos (render as lucide music icon)
  'spotifyLogo': 'Music',
  'appleMusicLogo': 'Music',
  'instagram': 'Instagram',
  
  // Size 35px
  'mediumStar': 'Star',
  'mediumMusic': 'Music',
  'mediumLocation': 'MapPin',
  'mediumSend': 'Send',
  'mediumDollar': 'DollarSign',
  'mediumBuildings': 'Building2',
  'mediumShootingStar': 'Sparkles',
  'mediumMicrophone': 'Mic',
  'mediumEdit': 'Pencil',
  
  // Size 60px
  'largeHeart': 'Heart',
  'largeStar': 'Star',
  'largeVideo': 'Video',
  'largeCamera': 'Camera',
  'largeMusic': 'Music',
  'largeMessaging': 'MessageCircle',
  
  // Star variants (lucide only)
  'fullStar': 'Star',
  'halfStar': 'Star',
} as const;

/**
 * Icons that should remain as SVG files (not converted to lucide-react)
 * Selected states of bottom nav icons (home, discover, messages, profile) remain as SVG
 */
export type BottomNavSelectedIconName =
  | 'houseSelected'
  | 'discoverSelected'
  | 'circleCommentSelected'
  | 'userSelected';

export const keepAsSvg = new Set<BottomNavSelectedIconName>([
  'houseSelected',
  'discoverSelected',
  'circleCommentSelected',
  'userSelected',
]);

export type IconName = keyof typeof iconNameToLucide | BottomNavSelectedIconName;

/**
 * Check if an icon should remain as SVG
 */
export function shouldKeepAsSvg(iconName: string): boolean {
  return keepAsSvg.has(iconName);
}

/**
 * Get the lucide-react icon name for a given icon name
 */
export function getLucideIconName(iconName: string): string | null {
  if (shouldKeepAsSvg(iconName)) {
    return null; // Keep as SVG
  }
  return iconNameToLucide[iconName] || null;
}
