/**
 * SVG Icon Assets
 *
 * Only the 4 bottom nav selected-state icons are kept as SVG assets.
 * All other icons must use lucide-react.
 */
import houseSelected from '@/assets/icons/HouseSelected.svg';
import discoverSelected from '@/assets/icons/DiscoverSelected.svg';
import circleCommentSelected from '@/assets/icons/CircleCommentSelected.svg';
import userSelected from '@/assets/icons/UserSelected.svg';

export const bottomNavSelectedIcons = {
  houseSelected,
  discoverSelected,
  circleCommentSelected,
  userSelected,
} as const;

