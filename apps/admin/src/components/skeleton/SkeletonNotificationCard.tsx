"use client"

import React from "react"
import { SynthSLogo } from "@/components/SynthSLogo"

export function SkeletonNotificationCard() {
  return (
    <div className="bg-white rounded-xl p-4 border border-white/20 shadow-sm animate-pulse">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 bg-gradient-to-br from-pink-100 to-pink-200 rounded-full flex items-center justify-center">
          <SynthSLogo size="sm" className="opacity-30 animate-breathe" />
        </div>
        
        {/* Content */}
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-3/4"></div>
          <div className="h-3 bg-gradient-to-r from-pink-50 to-white rounded animate-pulse w-1/2"></div>
          <div className="h-3 bg-gradient-to-r from-pink-50 to-white rounded animate-pulse w-1/4"></div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-gradient-to-r from-pink-200 to-pink-300 rounded-full animate-pulse"></div>
          <div className="w-8 h-8 bg-gradient-to-r from-gray-100 to-white rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  )
}

export default SkeletonNotificationCard
