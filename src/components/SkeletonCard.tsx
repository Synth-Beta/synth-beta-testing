"use client"

import React from "react"
import { SynthSLogo } from "@/components/SynthSLogo"

export function SkeletonCard() {
  return (
    <div 
      className="synth-card relative w-full max-w-sm mx-auto overflow-hidden shadow-lg border border-white/20" 
      role="status" 
      aria-label="Loading content" 
      aria-busy="true"
    >
      {/* Event Image Skeleton with Synth Branding */}
      <div className="relative h-72 bg-gradient-to-br from-pink-50 via-white to-pink-100 animate-pulse">
        {/* Synth Logo in Center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <SynthSLogo size="lg" className="opacity-40 animate-breathe animate-float" />
        </div>
        
        {/* Category Badge */}
        <div className="absolute top-4 left-4">
          <div className="w-20 h-6 bg-pink-200 animate-pulse rounded-full"></div>
        </div>
        
        {/* Price Badge */}
        <div className="absolute top-4 right-4">
          <div className="w-16 h-6 bg-gradient-to-r from-pink-300 to-pink-400 animate-pulse rounded-full"></div>
        </div>
      </div>

      <div className="p-6 space-y-5 bg-white">
        {/* Title Section */}
        <div>
          <div className="h-7 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-4/5 mb-3"></div>
          <div className="h-4 bg-gradient-to-r from-pink-50 to-white rounded animate-pulse w-3/4"></div>
          <div className="h-4 bg-gradient-to-r from-pink-50 to-white rounded animate-pulse w-1/2 mt-1"></div>
        </div>

        {/* Details Container with Pink Accents */}
        <div className="space-y-3 bg-gradient-to-r from-pink-50/50 to-white rounded-xl p-4 border border-pink-100/50">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-pink-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-32"></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-pink-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-24"></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-pink-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-20"></div>
          </div>
        </div>

        {/* Action Buttons with Pink Gradient */}
        <div className="flex gap-4 pt-2">
          <div className="flex-1 h-14 bg-gradient-to-r from-gray-100 to-white rounded-lg animate-pulse border border-pink-100"></div>
          <div className="flex-1 h-14 bg-gradient-to-r from-pink-200 to-pink-300 rounded-lg animate-pulse"></div>
        </div>
      </div>

      <span className="sr-only">Loading event details...</span>
    </div>
  )
}

export default SkeletonCard