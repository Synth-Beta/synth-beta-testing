import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TopRightMenuProps {
  // Dropdown content to be determined (tbd)
  // For now, just render the menu button
}

export const TopRightMenu: React.FC<TopRightMenuProps> = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={`p-2 h-8 w-8 flex items-center justify-center transition-colors rounded ${
            isOpen ? 'bg-[var(--brand-pink-600)]' : 'bg-transparent hover:bg-gray-100'
          }`}
          aria-label="Menu"
        >
          {/* Three horizontal lines icon */}
          <div className="flex flex-col gap-1.5">
            <div className={`h-0.5 w-5 transition-colors ${
              isOpen ? 'bg-white' : 'bg-[var(--neutral-900)]'
            }`} />
            <div className={`h-0.5 w-5 transition-colors ${
              isOpen ? 'bg-white' : 'bg-[var(--neutral-900)]'
            }`} />
            <div className={`h-0.5 w-5 transition-colors ${
              isOpen ? 'bg-white' : 'bg-[var(--neutral-900)]'
            }`} />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Dropdown content to be determined (tbd) */}
        <div className="p-2 text-sm text-gray-500">
          Menu items coming soon
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

