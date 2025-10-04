"use client"

import React from "react"
import { SynthSLogo } from "@/components/SynthSLogo"

export function SkeletonChatMessage() {
  return (
    <div className="flex items-start gap-3 p-3 animate-pulse">
      {/* Avatar */}
      <div className="w-8 h-8 bg-gradient-to-br from-pink-100 to-pink-200 rounded-full flex items-center justify-center flex-shrink-0">
        <SynthSLogo size="sm" className="opacity-30 animate-breathe" />
      </div>
      
      {/* Message Content */}
      <div className="space-y-2 flex-1">
        <div className="h-3 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-20"></div>
        <div className="bg-gradient-to-r from-pink-50 to-white rounded-lg p-3 space-y-2">
          <div className="h-4 bg-gradient-to-r from-pink-200 to-pink-100 rounded animate-pulse w-full"></div>
          <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-3/4"></div>
        </div>
      </div>
    </div>
  )
}

export default SkeletonChatMessage
