import React, { useEffect, useState } from 'react';
import { Home, Search, Plus, MessageCircle, User } from 'lucide-react';

interface ReviewMobileShellProps {
  children: React.ReactNode;
}

/**
 * Presentational shell that wraps the review form.
 *
 * - On **mobile** it uses an iPhone-style frame (status bar, dynamic island,
 *   bottom nav) to mirror the Figma mocks.
 * - On **desktop / large screens** it renders a simple centered card without
 *   any device chrome so it feels like a normal web layout.
 *
 * IMPORTANT: This component is purely visual and does not own any logic.
 */
export function ReviewMobileShell({ children }: ReviewMobileShellProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => {
      // Treat narrow viewports as “mobile shell” targets
      setIsMobile(window.innerWidth < 768);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  if (!isMobile) {
    // Desktop / large-screen: simple centered card, no iPhone chrome
    return (
      <div className="flex justify-center py-6">
        <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-[#fcfcfc] shadow-md max-h-[80vh] overflow-y-auto px-6 pb-6 pt-4">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center py-4">
      <div className="relative w-full max-w-[420px] rounded-3xl border border-gray-200 bg-[#fcfcfc] shadow-lg overflow-hidden">
        {/* Status bar / dynamic island */}
        <div className="h-[47px] bg-[#fcfcfc] border-b border-gray-200 flex items-end justify-center px-3 pt-1">
          <div className="flex-1 flex items-center">
            <span className="text-[13px] font-semibold text-black ml-1">9:41</span>
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-black h-[28px] w-[108px] rounded-full" />
          </div>
          <div className="flex-1 flex justify-end items-center gap-1 text-black/80 text-[10px]">
            <div className="w-4 h-[10px] bg-gradient-to-r from-black/10 to-black rounded-[3px]" />
            <div className="w-4 h-[10px] bg-gradient-to-r from-black/10 to-black rounded-[3px]" />
            <div className="w-6 h-[10px] border border-black rounded-[3px] flex items-center justify-end pr-[1px]">
              <div className="h-[7px] w-[9px] bg-black rounded-[2px]" />
            </div>
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="max-h-[calc(100vh-140px)] overflow-y-auto px-4 pb-24 pt-4">
          {children}
        </div>

        {/* Bottom nav – purely visual, uses existing navigation outside this shell */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="pointer-events-auto flex items-center justify-between gap-6 rounded-2xl border border-gray-200 bg-[#f9d7e4] px-6 py-3 shadow-md w-[90%] max-w-[360px]">
            <button
              type="button"
              className="flex flex-col items-center text-xs text-[#cc2486]"
            >
              <Home className="w-5 h-5" />
              <span className="mt-1">Home</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center text-xs text-[#cc2486]"
            >
              <Search className="w-5 h-5" />
              <span className="mt-1">Search</span>
            </button>
            <button
              type="button"
              className="flex items-center justify-center rounded-full bg-[#cc2486] text-white w-[70px] h-10 shadow-sm"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              type="button"
              className="flex flex-col items-center text-xs text-[#cc2486]"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="mt-1">Feed</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center text-xs text-[#cc2486]"
            >
              <User className="w-5 h-5" />
              <span className="mt-1">Profile</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



