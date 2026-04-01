import React, { useState, useEffect } from 'react'
import { supabase } from '../integrations/supabase/client'
import { useAuth } from '../hooks/useAuth'

interface WorkingConnectionBadgeProps {
  targetUserId: string
}

export const WorkingConnectionBadge: React.FC<WorkingConnectionBadgeProps> = ({ targetUserId }) => {
  const { user } = useAuth()
  const [connectionInfo, setConnectionInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id && targetUserId && user.id !== targetUserId) {
      fetchConnectionInfo()
    } else {
      setLoading(false)
    }
  }, [user?.id, targetUserId])

  // Don't render anything if viewing own profile
  if (user?.id === targetUserId) {
    return null
  }

  const fetchConnectionInfo = async () => {
    if (!user?.id) return

    try {
      const { data, error } = await supabase
        .rpc('get_connection_info', {
          current_user_id: user.id,
          target_user_id: targetUserId
        })

      if (error) {
        console.error('Error fetching connection info:', error)
        return
      }

      if (data && data.length > 0) {
        setConnectionInfo(data[0])
      } else {
        setConnectionInfo(null)
      }
    } catch (error) {
      console.error('Error fetching connection info:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>Loading...</span>
  }

  if (!connectionInfo) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>No connection</span>
  }

  // Determine badge styling based on degree
  const getBadgeVariant = (degree: number) => {
    switch (degree) {
      case 1: return "default" // Friend - dark green
      case 2: return "secondary" // Mutual Friend - light green  
      case 3: return "outline" // Mutual Friends + - yellow
      default: return "destructive" // Stranger - red
    }
  }

  const getBadgeColor = (degree: number) => {
    switch (degree) {
      case 1: return "bg-green-700 text-white" // dark green
      case 2: return "bg-green-400 text-black" // light green
      case 3: return "bg-yellow-400 text-black" // yellow
      default: return "bg-red-500 text-white" // red
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
      {connectionInfo.label}
      {connectionInfo.degree === 2 || connectionInfo.degree === 3 ? 
        ` (${connectionInfo.mutual_friends_count})` : ''}
    </span>
  )
}
