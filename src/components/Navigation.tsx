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
      <div className="bg-[#fdf2f7] border-t-2 border-[rgba(201,201,201,0.5)] rounded-t-[12px] w-full" style={{ margin: 0 }}>
        <div className="flex items-center justify-center gap-6 sm:gap-[43px] px-4 sm:px-[23px] max-w-[405px] mx-auto" style={{ minHeight: '60px', paddingTop: '12px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
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
          
          // Special handling for Home icon - when active, it needs a light pink fill inside
          if (id === "feed" && Icon === Home) {
            return (
              <button
                key={`${id}-${index}`}
                onClick={() => onViewChange(id)}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center justify-center h-[40px] w-[40px] transition-colors flex-shrink-0 relative",
                  isActive ? "text-[#cc2486]" : "text-[#cc2486]"
                )}
              >
                {isActive ? (
                  <svg 
                    className="w-6 h-6" 
                    viewBox="0 0 24 24" 
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Outer filled house shape with pink fill and stroke */}
                    <path 
                      d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9.55228 21 10 20.5523 10 20V16C10 15.4477 10.4477 15 11 15H13C13.5523 15 14 15.4477 14 16V20C14 20.5523 14.4477 21 15 21M9 21H15" 
                      stroke="#cc2486" 
                      strokeWidth={2}
                      fill="#cc2486"
                    />
                    {/* Inner light pink fill for the house base */}
                    <path 
                      d="M9 21H15M9 21C9.55228 21 10 20.5523 10 20V16C10 15.4477 10.4477 15 11 15H13C13.5523 15 14 15.4477 14 16V20C14 20.5523 14.4477 21 15 21" 
                      fill="#fdf2f7"
                      stroke="#cc2486"
                      strokeWidth={2}
                    />
                  </svg>
                ) : (
                  <Home className="w-6 h-6" strokeWidth={2} />
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
              className={cn(
                "flex items-center justify-center h-[40px] w-[40px] transition-colors flex-shrink-0",
                isActive ? "text-[#cc2486]" : "text-[#cc2486]"
              )}
            >
              <Icon 
                className="w-6 h-6" 
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
