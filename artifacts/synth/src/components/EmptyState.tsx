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
      {/* Large icon (60px), dark grey - 6px spacing below */}
      {icon && (
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--spacing-inline, 6px)'
        }}>
          <div style={{ color: 'var(--neutral-600)' }}>
            {icon}
          </div>
        </div>
      )}

      {/* Heading - Body typography, off black - 6px spacing below */}
      <h3 style={{ 
        fontFamily: 'var(--font-family)',
        fontSize: 'var(--typography-body-size, 20px)',
        fontWeight: 'var(--typography-body-weight, 500)',
        lineHeight: 'var(--typography-body-line-height, 1.5)',
        color: 'var(--neutral-900)',
        margin: 0,
        marginBottom: 'var(--spacing-inline, 6px)',
        textAlign: 'center'
      }}>{title}</h3>

      {/* Description - Meta typography, dark grey */}
      <p style={{ 
        fontFamily: 'var(--font-family)',
        fontSize: 'var(--typography-meta-size, 16px)',
        fontWeight: 'var(--typography-meta-weight, 500)',
        lineHeight: 'var(--typography-meta-line-height, 1.5)',
        color: 'var(--neutral-600)',
        margin: 0,
        maxWidth: '100%',
        textAlign: 'center'
      }}>{description}</p>

      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            marginTop: 'var(--spacing-grouped, 24px)',
            backgroundColor: 'var(--brand-pink-500)',
            color: 'var(--neutral-50)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)';
          }}
          onFocus={(e) => {
            e.currentTarget.style.outline = '2px solid var(--brand-pink-500)';
          }}
          aria-label={action.label}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export default EmptyState
