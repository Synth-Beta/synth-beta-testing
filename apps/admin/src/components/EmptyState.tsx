"use client"

import type React from "react"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="mb-6 text-gray-300">{icon}</div>}

      <h3 className="text-xl font-semibold text-gray-900 mb-2 text-balance">{title}</h3>

      <p className="text-gray-600 mb-6 max-w-md text-pretty leading-relaxed">{description}</p>

      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-[#FF3399] text-white rounded-lg font-medium hover:bg-[#E6007A] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#FF3399] focus:ring-offset-2"
          aria-label={action.label}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export default EmptyState
