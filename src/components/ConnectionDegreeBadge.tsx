import React, { useState, useEffect, useCallback } from 'react'
import { Badge } from './ui/badge'
import { supabase } from '../integrations/supabase/client'
import { useAuth } from '../hooks/useAuth'

interface ConnectionInfo {
  degree: number
  label: string
  color: string
  mutual_friends_count: number
}

interface ConnectionDegreeBadgeProps {
  targetUserId: string
  className?: string
}

export const ConnectionDegreeBadge: React.FC<ConnectionDegreeBadgeProps> = ({ 
  targetUserId, 
  className = '' 
}) => {
  const { user } = useAuth()
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('🔗 ConnectionDegreeBadge useEffect triggered:', {
      userId: user?.id,
      targetUserId,
      isOwnProfile: user?.id === targetUserId,
      shouldFetch: !!(user?.id && targetUserId && user.id !== targetUserId)
    })

    if (user?.id && targetUserId && user.id !== targetUserId) {
      console.log('🔗 ConnectionDegreeBadge: Calling fetchConnectionInfo')
      fetchConnectionInfo()
    } else if (user?.id === targetUserId) {
      console.log('🔗 ConnectionDegreeBadge: Own profile, not fetching')
      // Don't show badge on own profile
      setLoading(false)
    } else {
      console.log('🔗 ConnectionDegreeBadge: Missing required data, not fetching')
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, targetUserId])

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
      }
    } catch (error) {
      console.error('Error fetching connection info:', error)
    } finally {
      setLoading(false)
    }
  }

  console.log('🔗 ConnectionDegreeBadge render check:', {
    loading,
    connectionInfo,
    isOwnProfile: user?.id === targetUserId,
    userId: user?.id,
    targetUserId
  })

  if (loading || !connectionInfo || user?.id === targetUserId) {
    console.log('🔗 ConnectionDegreeBadge: Not rendering because:', {
      loading,
      hasConnectionInfo: !!connectionInfo,
      isOwnProfile: user?.id === targetUserId
    })
    return null
  }

  console.log('🔗 ConnectionDegreeBadge: Rendering badge with info:', connectionInfo)

  const getBadgeStyles = (color: string) => {
    switch (color) {
      case 'dark-green':
        return 'bg-green-700 text-white hover:bg-green-800'
      case 'light-green':
        return 'bg-green-400 text-green-900 hover:bg-green-500'
      case 'yellow':
        return 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'
      case 'red':
        return 'bg-red-500 text-white hover:bg-red-600'
      case 'blue':
        return 'bg-blue-500 text-white hover:bg-blue-600'
      default:
        return 'bg-gray-500 text-white hover:bg-gray-600'
    }
  }

  const getDegreeIcon = (degree: number) => {
    switch (degree) {
      case 1:
        return '👥' // Friend
      case 2:
        return '🤝' // Mutual Friend
      case 3:
        return '🔗' // Mutual Friends +
      case 4:
        return '👤' // Stranger
      default:
        return ''
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge 
        className={`${getBadgeStyles(connectionInfo.color)} font-semibold px-3 py-1 border-2 border-black`}
        style={{ backgroundColor: 'yellow', color: 'black' }} // Temporary debugging
      >
        <span className="mr-1">{getDegreeIcon(connectionInfo.degree)}</span>
        {connectionInfo.label}
      </Badge>
      
      {connectionInfo.mutual_friends_count > 0 && (
        <span className="text-sm text-gray-600">
          {connectionInfo.mutual_friends_count} mutual {connectionInfo.mutual_friends_count === 1 ? 'friend' : 'friends'}
        </span>
      )}
    </div>
  )
}

// Compact version for smaller spaces
export const ConnectionDegreeCompactBadge: React.FC<ConnectionDegreeBadgeProps> = ({ 
  targetUserId, 
  className = '' 
}) => {
  const { user } = useAuth()
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id && targetUserId && user.id !== targetUserId) {
      fetchConnectionInfo()
    } else if (user?.id === targetUserId) {
      setLoading(false)
    }
  }, [user?.id, targetUserId])

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
      }
    } catch (error) {
      console.error('Error fetching connection info:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !connectionInfo || user?.id === targetUserId) {
    return null
  }

  const getBadgeColor = (color: string) => {
    switch (color) {
      case 'dark-green':
        return 'bg-green-700'
      case 'light-green':
        return 'bg-green-400'
      case 'yellow':
        return 'bg-yellow-400'
      case 'red':
        return 'bg-red-500'
      case 'blue':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getShortLabel = (degree: number) => {
    switch (degree) {
      case 1:
        return '1st'
      case 2:
        return '2nd'
      case 3:
        return '3rd'
      case 4:
        return '4th+'
      default:
        return ''
    }
  }

  return (
    <div 
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${getBadgeColor(connectionInfo.color)} text-white font-bold text-xs ${className}`}
      title={`${connectionInfo.label}${connectionInfo.mutual_friends_count > 0 ? ` (${connectionInfo.mutual_friends_count} mutual)` : ''}`}
    >
      {getShortLabel(connectionInfo.degree)}
    </div>
  )
}
