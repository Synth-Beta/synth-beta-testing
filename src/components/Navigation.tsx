"use client";

import { Home, Compass, Plus, MessageCircle, User } from "lucide-react";
import { useAccountType } from "@/hooks/useAccountType";

interface NavigationProps {
  currentView: "feed" | "search" | "profile" | "profile-edit" | "analytics" | "events" | "chat";
  onViewChange: (view: "feed" | "search" | "profile" | "analytics" | "events" | "chat") => void;
  onOpenEventReview?: () => void;
}

export const Navigation = ({ currentView, onViewChange, onOpenEventReview }: NavigationProps) => {
  const { hasAnalyticsAccess, isCreator, isBusiness, isAdmin } = useAccountType();
  
  const baseNavItems: Array<{ 
    id: "feed" | "search" | "profile" | "chat"; 
    icon: any; 
    label: string;
    isPlusButton?: boolean;
  }> = [
    { id: "feed", icon: Home, label: "Home" },
    { id: "search", icon: Compass, label: "Discover" },
    { id: "feed", icon: Plus, label: "Event Entry", isPlusButton: true },
    { id: "chat", icon: MessageCircle, label: "Messaging" },
    { id: "profile", icon: User, label: "Profile" },
  ];

  const handlePlusClick = () => {
    if (onOpenEventReview) {
      onOpenEventReview();
    } else {
      onViewChange("search");
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0"
      style={{ margin: 0, padding: 0, zIndex: 'var(--z-index-nav, 80)' }}
    >
      <div
        style={{
          backgroundColor: 'var(--brand-pink-050)',
          borderTop: '2px solid var(--neutral-200)',
          borderTopLeftRadius: 'var(--radius-corner, 10px)',
          borderTopRightRadius: 'var(--radius-corner, 10px)',
          margin: 0,
        }}
      >
        <div
          className="flex items-center justify-center mx-auto"
          style={{
            width: '393px',
            maxWidth: '100%',
            minWidth: '320px',
            gap: 'var(--spacing-grouped, 24px)',
            paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
            paddingRight: 'var(--spacing-screen-margin-x, 20px)',
            paddingTop: 'var(--spacing-screen-margin-x, 20px)',
            paddingBottom: 'max(var(--spacing-screen-margin-x, 20px), calc(var(--spacing-screen-margin-x, 20px) + env(safe-area-inset-bottom)))',
          }}
        >
          {baseNavItems.map(({ id, icon: Icon, label, isPlusButton }, index) => {
            const isActive = currentView === id;
            
            if (isPlusButton) {
              return (
                <button
                  key="plus"
                  onClick={handlePlusClick}
                  aria-label="Create"
                  type="button"
                  data-tour="create-review"
                  style={{
                    height: '40px',
                    width: '70px',
                    backgroundColor: 'var(--brand-pink-500)',
                    borderRadius: '999px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)')}
                >
                  <Plus
                    style={{ width: '24px', height: '24px', color: 'var(--neutral-50)' }}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </button>
              );
            }
            
            if (id === "feed" && Icon === Home) {
              return (
                <button
                  key={`${id}-${index}`}
                  onClick={() => onViewChange(id)}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 'var(--size-input-height, 44px)',
                    height: 'var(--size-input-height, 44px)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Home
                    style={{ width: '24px', height: '24px', color: 'var(--brand-pink-500)' }}
                    strokeWidth={2}
                    fill={isActive ? "var(--brand-pink-500)" : "none"}
                    aria-hidden="true"
                  />
                </button>
              );
            }
            
            if (id === "search" && Icon === Compass) {
              return (
                <button
                  key={`${id}-${index}`}
                  onClick={() => onViewChange(id)}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 'var(--size-input-height, 44px)',
                    height: 'var(--size-input-height, 44px)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {isActive ? (
                    <svg
                      style={{ width: '24px', height: '24px' }}
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="11" fill="var(--brand-pink-500)" />
                    </svg>
                  ) : (
                    <Compass
                      style={{ width: '24px', height: '24px', color: 'var(--brand-pink-500)' }}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            }
            
            const tourAttr = id === 'chat' ? 'chat' : id === 'profile' ? 'profile-passport' : undefined;
            
            return (
              <button
                key={`${id}-${index}`}
                onClick={() => onViewChange(id)}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                type="button"
                data-tour={tourAttr}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 'var(--size-input-height, 44px)',
                  height: 'var(--size-input-height, 44px)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Icon
                  style={{ width: '24px', height: '24px', color: 'var(--brand-pink-500)' }}
                  strokeWidth={2}
                  fill={isActive ? "var(--brand-pink-500)" : "none"}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
