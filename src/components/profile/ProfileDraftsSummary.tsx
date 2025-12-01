import React from 'react';

interface ProfileDraftsSummaryProps {
  draftCount: number;
  onClick?: () => void;
}

/**
 * Small presentational card for the profile page that surfaces how many
 * in‑progress reviews the user has, styled to echo the Figma "Drafts: 12" tile.
 *
 * This component is purely visual; it relies on callers to decide what happens
 * when the card is clicked (e.g. switching to the "Unreviewed" mode that
 * already exists in ProfileView).
 */
export function ProfileDraftsSummary({ draftCount, onClick }: ProfileDraftsSummaryProps) {
  if (draftCount <= 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-2xl shadow-md bg-gradient-to-br from-[#0e0e0e] via-[#1a1a1a] to-[#3b0b22] text-left focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:ring-offset-background"
    >
      <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top,_rgba(255,51,153,0.85),_transparent_55%),_radial-gradient(circle_at_bottom,_rgba(186,104,200,0.8),_transparent_55%)]" />
      <div className="relative px-4 py-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-pink-200/90">
            Drafts
          </p>
          <p className="mt-1 text-2xl font-semibold text-white drop-shadow">
            {draftCount} in progress
          </p>
          <p className="mt-1 text-xs text-pink-100/90">
            Tap to jump into your unreviewed shows and drafts.
          </p>
        </div>
        <div className="ml-4 flex flex-col items-end gap-1 text-[11px] text-pink-100/80">
          <span className="px-2 py-1 rounded-full bg-pink-500/30 border border-pink-300/40">
            Keep the streak
          </span>
          <span className="px-2 py-1 rounded-full bg-white/10 border border-white/20">
            Autosave on
          </span>
        </div>
      </div>
    </button>
  );
}



