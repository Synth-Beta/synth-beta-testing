import React from 'react';
import { Icon } from '@/components/Icon';
import type { MainNavItem } from '@/hooks/useMainNavItems';

export interface WebDesktopRailProps {
  items: MainNavItem[];
  onItemClick: (item: MainNavItem) => void;
  onOpenMenu: () => void;
  /** Unread notifications + friend requests (same logic as feed header hamburger badge). */
  menuBadgeCount?: number;
}

/**
 * Left navigation rail for browser desktop (lg+). Same destinations as bottom nav.
 */
export function WebDesktopRail({ items, onItemClick, onOpenMenu, menuBadgeCount = 0 }: WebDesktopRailProps) {
  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col border-r border-[var(--neutral-200)] bg-[var(--neutral-50)]"
      aria-label="Main navigation"
      data-testid="web-desktop-rail"
    >
      <div className="sticky top-0 flex h-[min(100dvh,100vh)] flex-col gap-1 py-4 pl-3 pr-2">
        <button
          type="button"
          onClick={onOpenMenu}
          className="relative mb-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--neutral-100)]"
          aria-label="Open menu"
        >
          <span className="relative inline-flex">
            <Icon name="hamburgerMenu" size={24} alt="" ariaHidden />
            {menuBadgeCount > 0 ? (
              <span
                className="absolute -right-2 -top-1.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold var(--neutral-0) ring-2 ring-[var(--neutral-50)]"
                aria-hidden
              >
                {menuBadgeCount > 99 ? '99+' : menuBadgeCount}
              </span>
            ) : null}
          </span>
          <span
            className="text-[15px] font-semibold"
            style={{ color: 'var(--neutral-900)', fontFamily: 'var(--font-family)' }}
          >
            Menu
          </span>
        </button>

        {items.map((item) => {
          if (item.isCTA) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemClick(item)}
                className="mx-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-semibold shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  backgroundColor: 'var(--brand-pink-500)',
                  color: 'var(--neutral-50)',
                  fontFamily: 'var(--font-family)',
                }}
                aria-label={item.label}
              >
                <Icon name={item.icon as any} size={22} color="var(--neutral-50)" alt="" ariaHidden />
                <span
                  className="text-[15px]"
                  style={{ color: 'var(--neutral-50)', fontFamily: 'var(--font-family)' }}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          const active = item.isActive;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemClick(item)}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                active ? 'bg-[var(--neutral-100)]' : 'hover:bg-[var(--neutral-100)]'
              }`}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
            >
              <span style={{ color: active ? 'var(--brand-pink-500)' : 'var(--neutral-700)' }}>
                <Icon name={item.icon as any} size={24} alt="" ariaHidden />
              </span>
              <span
                className="text-[15px] font-medium"
                style={{
                  color: active ? 'var(--neutral-900)' : 'var(--neutral-700)',
                  fontFamily: 'var(--font-family)',
                }}
              >
                {item.label}
              </span>
              {item.hasUnread ? (
                <span
                  className="absolute left-8 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[var(--neutral-50)]"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
