import React from 'react';

/**
 * WebAppShell — desktop web chrome (social-app style)
 *
 * Max-width rules for the main column live in getWebDesktopMainContentClass (webMainContentClass.ts):
 * - feed / profile / notifications: max-w-3xl (readable column)
 * - search: up to 80rem (maps / discover)
 * - chat: max-w-6xl
 * - analytics / events / streaming-stats: max-w-7xl
 * - profile-edit: max-w-2xl
 * - default: max-w-4xl
 *
 * Rail + full-width background use full viewport; only the main column is capped.
 */
export interface WebAppShellProps {
  /** When true, render left rail + main column (web-desktop). When false, single-column main only. */
  enabled: boolean;
  /** Left rail (e.g. WebDesktopRail). Ignored when enabled is false. */
  rail: React.ReactNode;
  /** Tailwind classes applied to the main content wrapper on desktop (e.g. max-width). */
  mainContentClassName: string;
  /** Key for view transitions (typically currentView). */
  mainKey: string;
  transitionClass: string;
  children: React.ReactNode;
  /** Optional right column (e.g. suggestions); omit until a low-risk widget exists. */
  rightAside?: React.ReactNode;
}

export function WebAppShell({
  enabled,
  rail,
  mainContentClassName,
  mainKey,
  transitionClass,
  children,
  rightAside,
}: WebAppShellProps) {
if (!enabled) {
  return (
    <div
      key={mainKey}
      className={`${transitionClass} flex-1 flex flex-col`}
      style={{ backgroundColor: 'transparent', minHeight: 0 }}
    >
      {children}
    </div>
  );
}

  return (
    <div
      className="flex min-h-[100dvh] min-h-screen"
      data-testid="web-app-shell"
    >
      {rail}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          key={mainKey}
          className={`${transitionClass} ${mainContentClassName}`.trim()}
          style={{ backgroundColor: 'transparent', minHeight: 0 }}
        >
          {children}
        </div>
      </div>
      {rightAside != null ? (
        <div
          className="hidden w-[min(20rem,100%)] shrink-0 border-l border-[var(--neutral-200)] bg-[var(--neutral-50)] xl:block"
          data-testid="web-app-shell-aside"
        >
          {rightAside}
        </div>
      ) : null}
    </div>
  );
}
