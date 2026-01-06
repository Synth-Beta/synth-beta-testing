/**
 * Icon Mapping Configuration
 * 
 * Maps canonical icon names to SVG asset paths using Vite's asset URL pattern.
 * All icons are located in src/assets/icons/
 * 
 * Usage:
 *   import { icons } from '@/config/icons';
 *   <img src={icons.house} alt="Home" />
 */

/**
 * Icon name to SVG path mapping
 * Uses Vite's new URL() pattern for proper asset resolution
 */
export const icons = {
  // Navigation Icons
  house: new URL('../assets/icons/House.svg', import.meta.url).href,
  houseSelected: new URL('../assets/icons/HouseSelected.svg', import.meta.url).href,
  discover: new URL('../assets/icons/Discover.svg', import.meta.url).href,
  discoverSelected: new URL('../assets/icons/DiscoverSelected.svg', import.meta.url).href,
  circleComment: new URL('../assets/icons/CircleComment.svg', import.meta.url).href,
  circleCommentSelected: new URL('../assets/icons/CircleCommentSelected.svg', import.meta.url).href,
  user: new URL('../assets/icons/User.svg', import.meta.url).href,
  userSelected: new URL('../assets/icons/UserSelected.svg', import.meta.url).href,
  
  // Action Icons
  plus: new URL('../assets/icons/Plus.svg', import.meta.url).href,
  plusBox: new URL('../assets/icons/PlusBox.svg', import.meta.url).href,
  search: new URL('../assets/icons/Search.svg', import.meta.url).href,
  send: new URL('../assets/icons/Send.svg', import.meta.url).href,
  share: new URL('../assets/icons/Share.svg', import.meta.url).href,
  upload: new URL('../assets/icons/Upload.svg', import.meta.url).href,
  download: new URL('../assets/icons/Download.svg', import.meta.url).href,
  edit: new URL('../assets/icons/Edit.svg', import.meta.url).href,
  trash: new URL('../assets/icons/Trash.svg', import.meta.url).href,
  refresh: new URL('../assets/icons/Refresh.svg', import.meta.url).href,
  repeat: new URL('../assets/icons/Repeat.svg', import.meta.url).href,
  
  // UI Icons
  hamburgerMenu: new URL('../assets/icons/HamburgerMenu.svg', import.meta.url).href,
  bell: new URL('../assets/icons/Bell.svg', import.meta.url).href,
  settings: new URL('../assets/icons/Settings.svg', import.meta.url).href,
  filter: new URL('../assets/icons/Filter.svg', import.meta.url).href,
  sort: new URL('../assets/icons/Sort.svg', import.meta.url).href,
  sortFilter: new URL('../assets/icons/SortFilter.svg', import.meta.url).href,
  x: new URL('../assets/icons/X.svg', import.meta.url).href,
  check: new URL('../assets/icons/Check.svg', import.meta.url).href,
  checkMark: new URL('../assets/icons/CheckMark.svg', import.meta.url).href,
  circleCheck: new URL('../assets/icons/CircleCheck.svg', import.meta.url).href,
  smallCheck: new URL('../assets/icons/SmallCheck.svg', import.meta.url).href,
  minus: new URL('../assets/icons/Minus.svg', import.meta.url).href,
  questionMark: new URL('../assets/icons/QuestionMark.svg', import.meta.url).href,
  infoCircle: new URL('../assets/icons/InfoCircle.svg', import.meta.url).href,
  exclamationTriangle: new URL('../assets/icons/ExclamationTriangle.svg', import.meta.url).href,
  
  // Arrows & Navigation
  arrowDown: new URL('../assets/icons/ArrowDown.svg', import.meta.url).href,
  arrowUp: new URL('../assets/icons/ArrowUp.svg', import.meta.url).href,
  left: new URL('../assets/icons/Left.svg', import.meta.url).href,
  leftArrow: new URL('../assets/icons/LeftArrow.svg', import.meta.url).href,
  right: new URL('../assets/icons/Right.svg', import.meta.url).href,
  up: new URL('../assets/icons/Up.svg', import.meta.url).href,
  upArrow: new URL('../assets/icons/UpArrow.svg', import.meta.url).href,
  down: new URL('../assets/icons/Down.svg', import.meta.url).href,
  
  // Social & Engagement
  heart: new URL('../assets/icons/Heart.svg', import.meta.url).href,
  largeHeart: new URL('../assets/icons/LargeHeart.svg', import.meta.url).href,
  thumbsUp: new URL('../assets/icons/ThumbsUp.svg', import.meta.url).href,
  star: new URL('../assets/icons/Star.svg', import.meta.url).href,
  miniStar: new URL('../assets/icons/MiniStar.svg', import.meta.url).href,
  mediumStar: new URL('../assets/icons/MediumStar.svg', import.meta.url).href,
  largeStar: new URL('../assets/icons/LargeStar.svg', import.meta.url).href,
  
  // Media Icons
  image: new URL('../assets/icons/Image.svg', import.meta.url).href,
  photo: new URL('../assets/icons/Photo.svg', import.meta.url).href,
  video: new URL('../assets/icons/Video.svg', import.meta.url).href,
  largeVideo: new URL('../assets/icons/LargeVideo.svg', import.meta.url).href,
  largeCamera: new URL('../assets/icons/LargeCamera.svg', import.meta.url).href,
  music: new URL('../assets/icons/Music.svg', import.meta.url).href,
  smallMusic: new URL('../assets/icons/SmallMusic.svg', import.meta.url).href,
  mediumMusic: new URL('../assets/icons/MediumMusic.svg', import.meta.url).href,
  largeMusic: new URL('../assets/icons/LargeMusic.svg', import.meta.url).href,
  
  // Location & Events
  location: new URL('../assets/icons/Location.svg', import.meta.url).href,
  smallLocation: new URL('../assets/icons/SmallLocation.svg', import.meta.url).href,
  mediumLocation: new URL('../assets/icons/MediumLocation.svg', import.meta.url).href,
  calendar: new URL('../assets/icons/Calendar.svg', import.meta.url).href,
  ticket: new URL('../assets/icons/Ticket.svg', import.meta.url).href,
  clock: new URL('../assets/icons/Clock.svg', import.meta.url).href,
  
  // Communication
  envelope: new URL('../assets/icons/Envelope.svg', import.meta.url).href,
  largeMessaging: new URL('../assets/icons/LargeMessaging.svg', import.meta.url).href,
  squareComment: new URL('../assets/icons/SquareComment.svg', import.meta.url).href,
  atSymbol: new URL('../assets/icons/AtSymbol.svg', import.meta.url).href,
  mediumSend: new URL('../assets/icons/MediumSend.svg', import.meta.url).href,
  
  // User & Profile
  userPlus: new URL('../assets/icons/UserPlus.svg', import.meta.url).href,
  twoUsers: new URL('../assets/icons/TwoUsers.svg', import.meta.url).href,
  
  // Business & Commerce
  dollar: new URL('../assets/icons/Dollar.svg', import.meta.url).href,
  mediumDollar: new URL('../assets/icons/MediumDollar.svg', import.meta.url).href,
  building: new URL('../assets/icons/Building.svg', import.meta.url).href,
  mediumBuildings: new URL('../assets/icons/MediumBuildings.svg', import.meta.url).href,
  
  // Security & Verification
  lock: new URL('../assets/icons/Lock.svg', import.meta.url).href,
  key: new URL('../assets/icons/Key.svg', import.meta.url).href,
  shield: new URL('../assets/icons/Shield.svg', import.meta.url).href,
  ban: new URL('../assets/icons/Ban.svg', import.meta.url).href,
  flag: new URL('../assets/icons/Flag.svg', import.meta.url).href,
  
  // Analytics & Data
  barChart: new URL('../assets/icons/BarChart.svg', import.meta.url).href,
  pieChart: new URL('../assets/icons/PieChart.svg', import.meta.url).href,
  trendingUp: new URL('../assets/icons/TrendingUp.svg', import.meta.url).href,
  
  // Other Icons
  globe: new URL('../assets/icons/Globe.svg', import.meta.url).href,
  eye: new URL('../assets/icons/Eye.svg', import.meta.url).href,
  externalLink: new URL('../assets/icons/ExternalLink.svg', import.meta.url).href,
  maximize: new URL('../assets/icons/Maximize.svg', import.meta.url).href,
  mousePointer: new URL('../assets/icons/MousePointer.svg', import.meta.url).href,
  target: new URL('../assets/icons/Target.svg', import.meta.url).href,
  ribbonAward: new URL('../assets/icons/RibbonAward.svg', import.meta.url).href,
  mediumShootingStar: new URL('../assets/icons/MediumShootingStar.svg', import.meta.url).href,
  mediumMicrophone: new URL('../assets/icons/MediumMicrophone.svg', import.meta.url).href,
  mediumEdit: new URL('../assets/icons/MediumEdit.svg', import.meta.url).href,
  logOut: new URL('../assets/icons/LogOut.svg', import.meta.url).href,
  
  // Brand Logos
  spotifyLogo: new URL('../assets/icons/SpotifyLogo.svg', import.meta.url).href,
  appleMusicLogo: new URL('../assets/icons/AppleMusicLogo.svg', import.meta.url).href,
  instagram: new URL('../assets/icons/Instagram.svg', import.meta.url).href,
} as const;

/**
 * Union type of all available icon names
 * Use this for type-safe icon name props
 * 
 * Example:
 *   type IconName = keyof typeof icons;
 *   const iconName: IconName = 'house'; // ✅ Valid
 *   const invalid: IconName = 'invalid'; // ❌ Type error
 */
export type IconName = keyof typeof icons;

