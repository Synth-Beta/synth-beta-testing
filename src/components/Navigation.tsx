"use client";

import { User, Search, Users, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SynthSLogo } from "@/components/SynthSLogo";
import { useAccountType } from "@/hooks/useAccountType";

interface NavigationProps {
  currentView: "feed" | "search" | "profile" | "profile-edit" | "analytics";
  onViewChange: (view: "feed" | "search" | "profile" | "analytics") => void;
}

export const Navigation = ({ currentView, onViewChange }: NavigationProps) => {
  const { hasAnalyticsAccess } = useAccountType();
  
  // Base navigation items for all users
  const baseNavItems: Array<{ id: "feed" | "search" | "profile"; icon: any; label: string }> = [
    { id: "feed", icon: Users, label: "Feed" },
    { id: "search", icon: Search, label: "Search" },
    { id: "profile", icon: User, label: "Profile" },
  ];

  // Add Analytics for Creator, Business, and Admin account types
  const navItems = hasAnalyticsAccess() 
    ? [...baseNavItems, { id: "analytics" as const, icon: BarChart3, label: "Analytics" }]
    : baseNavItems;


  return (
    <nav className="glass-nav fixed bottom-0 left-0 right-0 p-4 z-40 safe-area-bottom">
      <div className="flex items-center justify-between w-full">
        
        {/* Main Navigation Items - Centered */}
        <div className={`flex justify-center gap-2 ${hasAnalyticsAccess() ? 'max-w-lg' : 'max-w-md'} mx-auto`}>
          {navItems.map(({ id, icon: Icon, label }) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              onClick={() => onViewChange(id)}
              aria-label={`Navigate to ${label}`}
              aria-current={currentView === id ? "page" : undefined}
              className={`nav-button hover-button ${hasAnalyticsAccess() ? 'flex-1' : 'flex-1'} ${
                currentView === id 
                  ? "active" 
                  : ""
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-xs font-medium">{label}</span>
            </Button>
          ))}
        </div>
        
        {/* Spacer for balance */}
        <div className="w-16"></div>
      </div>
    </nav>
  )
}
