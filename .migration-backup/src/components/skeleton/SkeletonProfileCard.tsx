"use client"

import React from "react"
import { SynthSLogo } from "@/components/SynthSLogo"

export function SkeletonProfileCard() {
  return (
    <div className="synth-card p-6 bg-white shadow-lg border border-white/20">
      <div className="space-y-6">
        {/* Profile Header */}
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 bg-gradient-to-br from-pink-100 to-pink-200 rounded-full animate-pulse flex items-center justify-center">
            <SynthSLogo size="md" className="opacity-30 animate-breathe" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="h-6 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-32"></div>
            <div className="h-4 bg-gradient-to-r from-v-20"></div>
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-full"></div>
          <div className="h-4 bg-gradient-to-r from-pink-50 to-white rounded animate-pulse w-4/5"></div>
          <div className="h-4 bg-gradient-to-r from-pink-50 to-white rounded animate-pulse w-3/5"></div>
        </div>

        {/* Stats Row */}
        <div className="flex gap-6">
          <div className="text-center">
            <div className="h-8 bg-gradient-to-r from-pink-200 to-pink-100 rounded animate-pulse w-12"></div>
            <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-16 mt-2"></div>
          </div>
          <div className="text-center">
            <div className="h-8 bg-gradient-to-r from-pink-200 to-pink-100 rounded animate-pulse w-12"></div>
            <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-20 mt-2"></div>
          </div>
          <div className="text-center">
            <div className="h-8 bg-gradient-to-r from-pink-200 to-pink-100 rounded animate-pulse w-12"></div>
            <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-18 mt-2"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SkeletonProfileCard