"use client";

import { Home, Compass, Plus, MessageCircle, User, BarChart3, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccountType } from "@/hooks/useAccountType";
import { cn } from "@/lib/utils";

interface NavigationProps {
  currentView: "feed" | "search" | "profile" | "profile-edit" | "analytics" | "events" | "chat";
  onViewChange: (view: "feed" | "search" | "profile" | "analytics" | "events" | "chat") => void;
  onOpenEventReview?: () => void;
}

export const Navigation = ({ currentView, onViewChange, onOpenEventReview }: NavigationProps) => {
  const { hasAnalyticsAccess, isCreator, isBusiness, isAdmin } = useAccountType();
  
  // Base navigation items matching Figma design: Home, Discover, Event Entry, Messaging, Profile
  const baseNavItems: Array<{ 
    id: "feed" | "search" | "profile" | "chat"; 
    icon: any; 
    label: string;
    isPlusButton?: boolean;
  }> = [
    { id: "feed", icon: Home, label: "Home" },
    { id: "search", icon: Compass, label: "Discover" },
    { id: "feed", icon: Plus, label: "Event Entry", isPlusButton: true }, // Plus button for creating event entry
    { id: "chat", icon: MessageCircle, label: "Messaging" },
    { id: "profile", icon: User, label: "Profile" },
  ];

  // Handle Plus button click - opens event entry creation (review or attendance)
  const handlePlusClick = () => {
    if (onOpenEventReview) {
      onOpenEventReview();
    } else {
      // Fallback: navigate to search if callback not provided
      onViewChange("search");
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40" style={{ margin: 0, padding: 0 }}>
      {/* Container optimized for iPhone 17 (393px width) */}
      <div className="bg-[#fdf2f7] border-2 border-t-[rgba(201,201,201,0.5)] border-b-0 border-l-0 border-r-0 rounded-tl-[10px] rounded-tr-[10px] w-full" style={{ margin: 0 }}>
        <div 
          className="flex items-center justify-center gap-[43px] px-[23px] py-[20px] mx-auto" 
          style={{ 
            width: '393px',
            maxWidth: '100%',
            minWidth: '320px',
            paddingBottom: 'max(20px, calc(20px + env(safe-area-inset-bottom)))'
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
                className="h-[40px] w-[70px] bg-[#cc2486] rounded-[20px] flex items-center justify-center hover:bg-[#b01f75] transition-colors flex-shrink-0"
              >
                <Plus className="w-6 h-6 text-white" strokeWidth={2} />
              </button>
            );
          }
          
          // Special handling for Home icon - when active, it should be filled with pink
          if (id === "feed" && Icon === Home) {
            return (
              <button
                key={`${id}-${index}`}
                onClick={() => onViewChange(id)}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                className="flex items-center justify-center w-6 h-6 transition-colors flex-shrink-0 relative"
              >
                <Home 
                  className="w-6 h-6 text-[#cc2486]" 
                  strokeWidth={2} 
                  fill={isActive ? "#cc2486" : "none"}
                />
              </button>
            );
          }
          
          // Special handling for Discover icon - when active, it should be a solid filled pink circle
          if (id === "search" && Icon === Compass) {
            return (
              <button
                key={`${id}-${index}`}
                onClick={() => onViewChange(id)}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                className="flex items-center justify-center w-6 h-6 transition-colors flex-shrink-0 relative"
              >
                {isActive ? (
                  <svg 
                    className="w-6 h-6" 
                    viewBox="0 0 24 24" 
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Solid filled pink circle for active state */}
                    <circle 
                      cx="12" 
                      cy="12" 
                      r="11" 
                      fill="#cc2486"
                    />
                  </svg>
                ) : (
                  <Compass className="w-6 h-6 text-[#cc2486]" strokeWidth={2} />
                )}
              </button>
            );
          }
          
          return (
            <button
              key={`${id}-${index}`}
              onClick={() => onViewChange(id)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className="flex items-center justify-center w-6 h-6 transition-colors flex-shrink-0"
            >
              <Icon 
                className="w-6 h-6 text-[#cc2486]" 
                strokeWidth={2} 
                fill={isActive ? "#cc2486" : "none"}
              />
            </button>
          );
        })}
        </div>
      </div>
    </nav>
  )
}
