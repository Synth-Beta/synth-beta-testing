import { ShieldCheck, Star, Crown, CheckCircle } from 'lucide-react';

export type AccountType = 'user' | 'creator' | 'business' | 'admin';

export interface VerificationBadgeConfig {
  icon: typeof ShieldCheck;
  colors: {
    from: string;
    to: string;
    text: string;
  };
  label: string;
  description: string;
}

export interface TrustScoreCriteria {
  profileComplete: boolean;
  streamingConnected: boolean;
  hasReviews: boolean;
  hasFriends: boolean;
  hasEvents: boolean;
  accountAge: boolean;
  emailVerified: boolean;
  hasAttended: boolean;
}

export interface TrustScoreBreakdown {
  score: number;
  criteriaMet: number;
  totalCriteria: number;
  criteria: TrustScoreCriteria;
  isVerified: boolean;
  profile?: Profile;
  friendCount?: number;
}

export interface Profile {
  verified?: boolean;
  account_type?: AccountType;
  verification_level?: string;
  name?: string;
  bio?: string;
  avatar_url?: string;
  birthday?: string;
  gender?: string;
  music_streaming_profile?: string;
  created_at?: string;
  verification_criteria_met?: TrustScoreCriteria;
  trust_score?: number;
}

/**
 * Get verification badge configuration based on account type
 */
export function getVerificationBadgeConfig(accountType: AccountType): VerificationBadgeConfig {
  switch (accountType) {
    case 'business':
      return {
        icon: ShieldCheck,
        colors: {
          from: '#3B82F6',
          to: '#2563EB',
          text: 'text-blue-600',
        },
        label: 'Verified Business',
        description: 'This is a verified business account with confirmed venue or promoter credentials.',
      };
    case 'creator':
      return {
        icon: Star,
        colors: {
          from: '#A855F7',
          to: '#9333EA',
          text: 'text-purple-600',
        },
        label: 'Verified Creator',
        description: 'This is a verified creator account with confirmed artist or influencer credentials.',
      };
    case 'admin':
      return {
        icon: Crown,
        colors: {
          from: '#F59E0B',
          to: '#D97706',
          text: 'text-amber-600',
        },
        label: 'Admin',
        description: 'This is an official Synth platform administrator.',
      };
    case 'user':
    default:
      return {
        icon: CheckCircle,
        colors: {
          from: '#10B981',
          to: '#059669',
          text: 'text-emerald-600',
        },
        label: 'Verified User',
        description: 'This user has met trust and safety criteria for verification.',
      };
  }
}

/**
 * Calculate trust score for a user profile
 */
export function calculateUserTrustScore(
  profile: Profile,
  reviewCount: number = 0,
  friendCount: number = 0,
  eventCount: number = 0,
  attendedCount: number = 0
): TrustScoreBreakdown {
  const criteria: TrustScoreCriteria = {
    // Profile 90%+ complete (name, bio, avatar, birthday, gender)
    profileComplete: Boolean(
      profile.name &&
      profile.bio &&
      profile.avatar_url &&
      profile.birthday &&
      profile.gender
    ),
    
    // Connected streaming account
    streamingConnected: Boolean(profile.music_streaming_profile),
    
    // 3+ event reviews posted
    hasReviews: reviewCount >= 3,
    
    // 10+ friends added
    hasFriends: friendCount >= 10,
    
    // 10+ events marked interested
    hasEvents: eventCount >= 10,
    
    // Account age 30+ days
    accountAge: profile.created_at
      ? new Date().getTime() - new Date(profile.created_at).getTime() >= 30 * 24 * 60 * 60 * 1000
      : false,
    
    // Email verified (assumed true if profile exists)
    emailVerified: true,
    
    // Attended 3+ events
    hasAttended: attendedCount >= 3,
  };

  const criteriaMet = Object.values(criteria).filter(Boolean).length;
  const totalCriteria = Object.keys(criteria).length;
  const score = Math.round((criteriaMet / totalCriteria) * 100);
  
  // User is verified if they meet 4+ criteria
  const isVerified = criteriaMet >= 4;

  return {
    score,
    criteriaMet,
    totalCriteria,
    criteria,
    isVerified,
  };
}

/**
 * Determine if a profile should be verified
 */
export function getVerificationStatus(
  profile: Profile,
  trustScoreBreakdown?: TrustScoreBreakdown
): boolean {
  // Admins are always verified
  if (profile.account_type === 'admin') {
    return true;
  }

  // Check if manually verified
  if (profile.verified) {
    return true;
  }

  // For users, check trust score
  if (profile.account_type === 'user' && trustScoreBreakdown) {
    return trustScoreBreakdown.isVerified;
  }

  // For creators and business, they should be verified by the auto-verify function
  // if they have the appropriate profiles linked
  return false;
}

/**
 * Calculate profile completion percentage (0-100)
 */
export function calculateProfileCompletionPercentage(profile: Profile): number {
  const requiredFields = ['name', 'bio', 'avatar_url', 'birthday', 'gender'] as const;
  let completedFields = 0;
  
  for (const field of requiredFields) {
    if (profile[field]) {
      completedFields++;
    }
  }
  
  return Math.round((completedFields / requiredFields.length) * 100);
}

/**
 * Get human-readable description for a trust criterion
 */
export function getCriterionDescription(
  criterion: keyof TrustScoreCriteria,
  profile?: Profile,
  friendCount?: number
): {
  label: string;
  description: string;
  target: string;
} {
  // Calculate dynamic values if profile data is provided
  let profileCompletionPercentage: number | undefined;
  if (criterion === 'profileComplete' && profile) {
    profileCompletionPercentage = calculateProfileCompletionPercentage(profile);
  }
  
  const descriptions: Record<keyof TrustScoreCriteria, { label: string; description: string; target: string }> = {
    profileComplete: {
      label: 'Complete Profile',
      description: 'Fill out your name, bio, avatar, birthday, and gender',
      target: profileCompletionPercentage !== undefined 
        ? `${profileCompletionPercentage}% complete`
        : '100% complete',
    },
    streamingConnected: {
      label: 'Streaming Account',
      description: 'Connect your Spotify or Apple Music account',
      target: 'Connected',
    },
    hasReviews: {
      label: 'Event Reviews',
      description: 'Share your concert experiences by posting reviews',
      target: '3+ reviews',
    },
    hasFriends: {
      label: 'Friend Network',
      description: 'Build your network by connecting with other users',
      target: friendCount !== undefined 
        ? `${friendCount}+ friends`
        : '10+ friends',
    },
    hasEvents: {
      label: 'Event Interests',
      description: 'Show interest in concerts you want to attend',
      target: '10+ events',
    },
    accountAge: {
      label: 'Account Age',
      description: 'Be an active member of the community',
      target: '30+ days',
    },
    emailVerified: {
      label: 'Email Verified',
      description: 'Verify your email address',
      target: 'Verified',
    },
    hasAttended: {
      label: 'Event Attendance',
      description: 'Attend and review concerts',
      target: '3+ attended',
    },
  };

  return descriptions[criterion];
}

