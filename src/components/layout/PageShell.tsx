import React from 'react';

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
}

const PageShell: React.FC<PageShellProps> = ({
  header,
  children,
  includeBottomNavPadding = true,
  contentClassName,
}) => {
  const topPadding = 'calc(env(safe-area-inset-top, 0px) + 68px + var(--spacing-small, 12px))';
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
          paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
          paddingRight: 'var(--spacing-screen-margin-x, 20px)',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PageShell;
