import React from 'react';
import type { CSSProperties } from 'react';

export interface PageShellProps {
  /**
   * Optional header rendered above the content container.
   * Use this slot to pass MobileHeader / PermanentHeader instances.
   */
  header?: React.ReactNode;

  /**
   * Primary page content that should scroll beneath the header.
   */
  children: React.ReactNode;

  /**
   * Whether to include the bottom nav spacing (and safe area) below the content.
   * Disable when the page already reserves its own bottom gap (e.g. modal surfaces).
   */
  includeBottomNavPadding?: boolean;

  /**
   * Additional classes to apply to the content container.
   */
  contentClassName?: string;

  /**
   * Override content `paddingTop`. When omitted: if `header` is set, reserves space for MobileHeader (~68px);
   * if no header, uses safe-area + small gap only (avoids phantom gap on web-desktop).
   */
  contentPaddingTop?: string;

  /**
   * When true (default), applies horizontal screen margin via inline padding.
   * Set false for full-bleed layouts (e.g. desktop split-pane chat); Tailwind `px-*` on `contentClassName` cannot
   * override inline padding because inline styles win over classes.
   */
  contentHorizontalPadding?: boolean;

  /** Merged into the content wrapper style (e.g. viewport-clipped desktop chat). */
  contentStyle?: CSSProperties;
}

const PageShell: React.FC<PageShellProps> = ({
  header,
  children,
  includeBottomNavPadding = true,
  contentClassName,
  contentPaddingTop,
  contentHorizontalPadding = true,
  contentStyle,
}) => {
  // When a header is present it is sticky/in-flow and already occupies
  // (safe-area-inset-top + 68px).  Content only needs the 12 px gap.
  // When there is no header the safe area must be applied here instead.
  const defaultTopPadding = header
    ? 'var(--spacing-small, 12px)'
    : 'calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))';
  const topPadding = contentPaddingTop ?? defaultTopPadding;
  const bottomPadding = includeBottomNavPadding
    ? 'calc(var(--spacing-bottom-nav, 32px) + env(safe-area-inset-bottom, 0px))'
    : 'env(safe-area-inset-bottom, 0px)';

  return (
    <div className="page-shell">
      {header}
      <div
        className={contentClassName ? `page-shell__content ${contentClassName}` : 'page-shell__content'}
        style={{
          paddingTop: topPadding,
          paddingBottom: bottomPadding,
          ...(contentHorizontalPadding
            ? {
                paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
                paddingRight: 'var(--spacing-screen-margin-x, 20px)',
              }
            : {}),
          ...contentStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PageShell;
