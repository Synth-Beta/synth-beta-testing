/**
 * Desktop main-column widths for logged-in MainApp (see WebAppShell.tsx for full rules).
 * Mirrors MainApp `ViewType` (avoid circular imports).
 */
export type MainAppViewForLayout =
  | 'feed'
  | 'search'
  | 'streaming-stats'
  | 'profile'
  | 'profile-edit'
  | 'settings'
  | 'notifications'
  | 'chat'
  | 'analytics'
  | 'events'
  | 'onboarding'
  | 'auth';

/**
 * Max-width rules for logged-in main column on desktop web (lg+).
 */
export function getWebDesktopMainContentClass(currentView: MainAppViewForLayout): string {
  switch (currentView) {
    case 'search':
      return 'w-full max-w-[min(100%,80rem)] mx-auto px-4 lg:px-8';
    case 'chat':
      // min-h-0 so flex ancestors don’t force document scroll; chat panes scroll internally.
      return 'w-full max-w-none flex-1 min-h-0 min-w-0 px-0 lg:px-0';
    case 'feed':
    case 'notifications':
      // Use full width between rail and edge so secondary columns / rails can breathe (web-primary).
      return 'w-full max-w-none flex-1 min-w-0 px-4 lg:px-8';
    case 'profile':
      return 'w-full max-w-none flex-1 min-w-0 px-4 lg:px-8';
    case 'events':
    case 'analytics':
    case 'streaming-stats':
      return 'w-full max-w-7xl mx-auto px-4 lg:px-8';
    case 'profile-edit':
    case 'settings':
      return 'w-full max-w-2xl mx-auto px-4 lg:px-8';
    default:
      return 'w-full max-w-4xl mx-auto px-4 lg:px-8';
  }
}
