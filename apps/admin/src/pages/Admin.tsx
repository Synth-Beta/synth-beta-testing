import { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAccountType } from '@/hooks/useAccountType';
import { supabase } from '@/integrations/supabase/client';
// Tables like users, events, interactions, etc. exist in DB but not in generated types — use untyped client for those.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
import Auth from './Auth';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Shield, 
  LogOut,
  TrendingUp,
  Calendar,
  Loader2,
  Music,
  MapPin,
  Ticket,
  AlertCircle,
  ChevronUp,
  Eye,
  ChevronDown,
  FileQuestion,
  CheckCircle,
  XCircle,
  Clock,
  Flag,
  Ban,
  AlertTriangle,
  BarChart3,
  Search,
  Heart,
  MessageSquare,
  Star,
  Compass,
  User,
  Home,
  Share2,
  Newspaper,
  Trash2,
  Plus,
  BookOpen,
  CalendarDays,
  Instagram,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, startOfDay, endOfDay, subDays, addDays, eachDayOfInterval, isWithinInterval } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  SignupMethod,
  normalizeSignupMethod,
  SIGNUP_METHOD_LABELS,
  SIGNUP_METHOD_BADGE_VARIANT,
  SIGNUP_METHOD_FILTER_OPTIONS,
} from '@/lib/signupMethod';
import { ACQUISITION_SOURCE_CANONICAL_ORDER } from '@synth/shared';
import SocialAnalyticsDashboard from '@/components/admin/social-media/SocialAnalyticsDashboard';
import AdminStyleGuidePanel from '@/components/admin/AdminStyleGuidePanel';
import ContentCalendarDashboard from '@/components/admin/content-calendar/ContentCalendarDashboard';
import { AiSceneGuidesAdminPanel } from '@/components/admin/AiSceneGuidesAdminPanel';
import NewsletterBuilder from '@/components/admin/newsletter/NewsletterBuilder';
import {
  PlatformComparison,
  RecentPostRow,
  SocialInsightsMap,
  SocialOverviewMetric,
  TopPostCardProps,
} from '@/services/socialMediaAnalytics/types';
import { fetchInstagramSocialMediaAnalytics } from '@/services/socialMediaAnalytics/socialMediaAnalyticsService';

interface User {
  id: string;
  email: string;
  created_at: string;
  last_active_at?: string;
  account_type?: string;
  name?: string;
  username?: string;
  avatar_url?: string;
}

interface DaySignupUser {
  id: string;
  name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  account_type?: string | null;
  created_at: string;
  instagram_handle?: string | null;
  snapchat_handle?: string | null;
  music_streaming_profile?: string | null;
}

interface ChartDataPoint {
  date: string;
  dateKey?: string;
  users: number;
  mau?: number;
  names?: string[];
}

interface AcquisitionSourceCount {
  source: string;
  count: number;
}

interface AcquisitionWeeklyBreakdownPoint {
  date: string;
  [source: string]: number | string;
}

interface AcquisitionOtherResponse {
  id: string;
  created_at: string;
  other_acquisition_source: string;
}

interface NewsItem {
  id: string;
  title: string;
  url: string;
  image_url: string | null;
  source: string | null;
  sort_order: number;
  created_at: string;
  seo_title?: string | null;
  seo_description?: string | null;
  image_alt?: string | null;
  primary_keyword?: string | null;
  keywords?: string[] | null;
}

interface ModerationFlag {
  id: string;
  flagged_by_user_id: string;
  content_type: 'event' | 'review' | 'artist' | 'venue';
  content_id: string;
  flag_reason: string;
  flag_category: 'spam' | 'harassment' | 'inappropriate_content' | 'misinformation' | 'copyright_violation' | 'fake_content' | 'other' | null;
  additional_details: string | null;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed' | 'escalated';
  resolved_by_user_id: string | null;
  resolution_notes: string | null;
  resolution_action: 'no_action' | 'content_removed' | 'content_edited' | 'user_warned' | 'user_suspended' | 'user_banned' | 'escalated_to_admin' | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// Helper function to check if a field is missing/null/empty
const isFieldMissing = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && Object.keys(value).length === 0) return true;
  return false;
};

// Helper function to format values for display
const formatValue = (value: any): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value).substring(0, 100) + (JSON.stringify(value).length > 100 ? '...' : '');
  if (typeof value === 'string' && value.length > 100) return value.substring(0, 100) + '...';
  return String(value);
};

const ACQUISITION_SOURCE_COLOR_MAP: Record<string, string> = {
  'Friends or Family': '#f97316',
  Instagram: '#ec4899',
  TikTok: '#312e81',
  Reddit: '#f87171',
  LinkedIn: '#0ea5e9',
  Facebook: '#2563eb',
  'App Store': '#a855f7',
  Artist: '#10b981',
  Venue: '#f59e0b',
  Other: '#6b7280',
};

const getAcquisitionSourceColor = (source: string) => ACQUISITION_SOURCE_COLOR_MAP[source] ?? '#94a3b8';

const normalizeAcquisitionSource = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (normalized === 'other') {
    return 'Other';
  }
  const match = ACQUISITION_SOURCE_CANONICAL_ORDER.find((source) => source.toLowerCase() === normalized);
  return match || 'Other';
};

const FULL_OTHER_RESPONSES_LIMIT = 500;

function SignupNamesTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { date?: string; users?: number; count?: number; names?: string[] } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  const count = row.users ?? row.count ?? 0;
  const names = row.names ?? [];
  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm max-w-xs">
      <div className="font-medium">{row.date}</div>
      <div className="text-sm">
        {count} signup{count === 1 ? '' : 's'}
      </div>
      {names.length > 0 ? (
        <ul className="mt-1 text-xs text-muted-foreground space-y-0.5 max-h-40 overflow-auto">
          {names.slice(0, 12).map((n, i) => (
            <li key={`${n}-${i}`}>{n}</li>
          ))}
          {names.length > 12 ? <li>+{names.length - 12} more</li> : null}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No names for this day</p>
      )}
    </div>
  );
}

// Helper function to get missing fields for each type based on actual schemas
const getMissingFields = (record: any, type: 'event' | 'artist' | 'venue'): string[] => {
  const missing: string[] = [];
  
  if (type === 'event') {
    // Required fields: title (not null), event_date (not null)
    // Important fields: artist_id, venue_id, venue_city, venue_state, genres
    const requiredFields = ['title', 'event_date'];
    const importantFields = ['artist_id', 'venue_id', 'venue_city', 'venue_state', 'genres'];
    
    requiredFields.forEach(field => {
      if (isFieldMissing(record[field])) {
        missing.push(field);
      }
    });
    
    importantFields.forEach(field => {
      if (isFieldMissing(record[field])) {
        missing.push(field);
      }
    });
  } else if (type === 'artist') {
    // Required fields: name (not null), identifier (not null)
    // Important fields: url, image_url, external_identifiers, genres
    const requiredFields = ['name', 'identifier'];
    const importantFields = ['url', 'image_url', 'external_identifiers', 'genres'];
    
    requiredFields.forEach(field => {
      if (isFieldMissing(record[field])) {
        missing.push(field);
      }
    });
    
    importantFields.forEach(field => {
      if (isFieldMissing(record[field])) {
        missing.push(field);
      }
    });
  } else if (type === 'venue') {
    // Required fields: name (not null)
    // Important fields: identifier, state, street_address, country, zip
    const requiredFields = ['name'];
    const importantFields = ['identifier', 'state', 'street_address', 'country', 'zip'];
    
    requiredFields.forEach(field => {
      if (isFieldMissing(record[field])) {
        missing.push(field);
      }
    });
    
    importantFields.forEach(field => {
      if (isFieldMissing(record[field])) {
        missing.push(field);
      }
    });
  }
  
  return missing;
};

export default function Admin() {
  console.log('🔐 Admin component is rendering...');
  console.log('📍 Current pathname:', window.location.pathname);
  console.log('✅ Admin route is active!');
  
  const { user, loading: authLoading, signOut } = useAuth();
  const { isAdmin, loading: accountTypeLoading, accountType } = useAccountType();
  const [searchParams, setSearchParams] = useSearchParams();
  const ADMIN_TABS = useMemo(
    () =>
      new Set([
        'users',
        'content-calendar',
        'social',
        'events',
        'moderation',
        'news',
        'newsletter-builder',
        'style-guide',
        'ai-scene-guides',
      ]),
    [],
  );
  const activeAdminTab = ADMIN_TABS.has(searchParams.get('tab') || '')
    ? (searchParams.get('tab') as string)
    : 'ai-scene-guides';
  const setActiveAdminTab = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  };
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyUsersData, setDailyUsersData] = useState<ChartDataPoint[]>([]);
  const [mauData, setMauData] = useState<ChartDataPoint[]>([]);
  const [dayUsersDialogOpen, setDayUsersDialogOpen] = useState(false);
  const [selectedDayLabel, setSelectedDayLabel] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState('');
  const [daySignupUsers, setDaySignupUsers] = useState<DaySignupUser[]>([]);
  const [dayUsersLoading, setDayUsersLoading] = useState(false);
  const [signupMethods, setSignupMethods] = useState<Record<string, SignupMethod>>({});
  const [signupMethodsError, setSignupMethodsError] = useState<string | null>(null);
  const [signupMethodFilter, setSignupMethodFilter] = useState<'all' | SignupMethod>('all');
  const [acquisitionSourceCounts, setAcquisitionSourceCounts] = useState<AcquisitionSourceCount[]>([]);
  const [acquisitionWeeklyBreakdown, setAcquisitionWeeklyBreakdown] = useState<AcquisitionWeeklyBreakdownPoint[]>([]);
  const [recentOtherAcquisitionResponses, setRecentOtherAcquisitionResponses] = useState<AcquisitionOtherResponse[]>([]);
  const [isOtherAcquisitionModalOpen, setIsOtherAcquisitionModalOpen] = useState(false);
  const [otherAcquisitionModalResponses, setOtherAcquisitionModalResponses] = useState<AcquisitionOtherResponse[]>([]);
  const [otherAcquisitionModalLoading, setOtherAcquisitionModalLoading] = useState(false);
  const [otherAcquisitionModalError, setOtherAcquisitionModalError] = useState<string | null>(null);

  // Event Analytics state
  const [totalArtists, setTotalArtists] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalVenues, setTotalVenues] = useState(0);
  const [artistsChange, setArtistsChange] = useState<number | null>(null);
  const [eventsChange, setEventsChange] = useState<number | null>(null);
  const [venuesChange, setVenuesChange] = useState<number | null>(null);
  const [eventAnalyticsLoading, setEventAnalyticsLoading] = useState(true);
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [todayArtists, setTodayArtists] = useState<any[]>([]);
  const [todayVenues, setTodayVenues] = useState<any[]>([]);
  const [expandedRow, setExpandedRow] = useState<{ type: 'event' | 'artist' | 'venue'; id: string } | null>(null);
  
  // Moderation Flags state
  const [moderationFlags, setModerationFlags] = useState<ModerationFlag[]>([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationStatusFilter, setModerationStatusFilter] = useState<string>('all');
  const [moderationContentTypeFilter, setModerationContentTypeFilter] = useState<string>('all');
  const [moderationCategoryFilter, setModerationCategoryFilter] = useState<string>('all');
  const [selectedFlag, setSelectedFlag] = useState<ModerationFlag | null>(null);
  const [moderationDialogOpen, setModerationDialogOpen] = useState(false);
  const [moderationStatus, setModerationStatus] = useState<string>('pending');
  const [moderationAction, setModerationAction] = useState<string>('');
  const [moderationResolutionNotes, setModerationResolutionNotes] = useState<string>('');
  const [contentData, setContentData] = useState<any>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [editContentDialogOpen, setEditContentDialogOpen] = useState(false);
  const [editedContent, setEditedContent] = useState<any>(null);
  const [userInfoMap, setUserInfoMap] = useState<Record<string, { name: string; username: string | null }>>({});
  
  // In the News (Media section) state
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsUrl, setNewsUrl] = useState('');
  const [newsImageUrl, setNewsImageUrl] = useState('');
  const [newsSource, setNewsSource] = useState('');
  const [newsSubmitting, setNewsSubmitting] = useState(false);
  const [newsImageUploading, setNewsImageUploading] = useState(false);
  const [newsSeoTitle, setNewsSeoTitle] = useState('');
  const [newsSeoDescription, setNewsSeoDescription] = useState('');
  const [newsImageAlt, setNewsImageAlt] = useState('');
  const [newsPrimaryKeyword, setNewsPrimaryKeyword] = useState('');
  const [newsKeywords, setNewsKeywords] = useState('');
  
  // User Analytics state
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  
  // Key Metrics
  const [dau, setDau] = useState(0);
  const [mau, setMau] = useState(0);
  const [wau, setWau] = useState(0);
  const [weeklyShares, setWeeklyShares] = useState(0);
  const [eciPerUser, setEciPerUser] = useState(0);
  const [networkDensity, setNetworkDensity] = useState(0);
  
  // ECI/U Components
  const [eventsInterested, setEventsInterested] = useState(0);
  const [reviewsPosted, setReviewsPosted] = useState(0);
  const [eventsShared, setEventsShared] = useState(0);
  const [eciTrend, setEciTrend] = useState<{ date: string; interest: number; reviews: number; shared: number; total: number }[]>([]);
  
  // Network Density Details
  const [totalFriendships, setTotalFriendships] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  
  // Interaction Breakdown - comprehensive analytics
  const [interactionBreakdown, setInteractionBreakdown] = useState<{
    eventType: string;
    entityType: string;
    entityId?: string;
    count: number;
  }[]>([]);
  
  // New User Signups (last 30 days)
  const [newUserSignups, setNewUserSignups] = useState<
    { date: string; dateKey: string; count: number; names: string[] }[]
  >([]);
  // Referral/external shares: count per user (user_id -> count) from referral_shares table
  const [userShareCounts, setUserShareCounts] = useState<Record<string, number>>({});
  
  // Retention Metrics
  const [d1Retention, setD1Retention] = useState(0);
  const [d7Retention, setD7Retention] = useState(0);
  const [d30Retention, setD30Retention] = useState(0);
  
  // Engagement Rate
  const [engagementRate, setEngagementRate] = useState(0);
  
  // Top Content Metrics
  const [topReviewedEvents, setTopReviewedEvents] = useState<{ event_id: string; count: number; title?: string }[]>([]);
  const [topInterestedEvents, setTopInterestedEvents] = useState<{ event_id: string; count: number; title?: string }[]>([]);
  const [socialOverviewMetrics, setSocialOverviewMetrics] = useState<SocialOverviewMetric[]>([]);
  const [platformComparisons, setPlatformComparisons] = useState<PlatformComparison[]>([]);
  const [contentPerformanceCards, setContentPerformanceCards] = useState<TopPostCardProps[]>([]);
  const [recentSocialPosts, setRecentSocialPosts] = useState<RecentPostRow[]>([]);
  const [platformInsights, setPlatformInsights] = useState<SocialInsightsMap>({
    Facebook: [],
    Instagram: [],
    TikTok: [],
  });
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialWarnings, setSocialWarnings] = useState<string[]>([]);
  
  const { toast } = useToast();

  const fetchSocialMediaAnalytics = useCallback(async () => {
    setSocialLoading(true);
    setSocialOverviewMetrics([]);
    setPlatformComparisons([]);
    setContentPerformanceCards([]);
    setRecentSocialPosts([]);
    setPlatformInsights({
      Facebook: [],
      Instagram: [],
      TikTok: [],
    });
    setSocialWarnings([]);

    try {
      const { data, warnings } = await fetchInstagramSocialMediaAnalytics();
      setSocialOverviewMetrics(data.overview);
      setPlatformComparisons(data.platformComparisons);
      setContentPerformanceCards(data.contentPerformance);
      setRecentSocialPosts(data.recentPosts);
      setPlatformInsights(data.insights);
      setSocialWarnings(warnings ?? []);
    } catch (error: any) {
      console.error('Error loading social analytics:', error);
      setSocialWarnings([
        error?.message
          ? `Social media analytics unavailable: ${error.message}`
          : 'Social media analytics unavailable.',
      ]);
      toast({
        title: 'Failed to load social analytics',
        description: error?.message ?? 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setSocialLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchUsers();
      fetchTodayAdditions();
      fetchModerationFlags();
      fetchUserAnalytics();
      fetchSocialMediaAnalytics();
      fetchSignupMethods();
      fetchAcquisitionAnalytics();
    }
  }, [user, isAdmin, fetchSocialMediaAnalytics]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchTodayAdditions();
    }
  }, [user, isAdmin]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch all users from users table for analytics
      const { data: usersData, error: usersError } = await db
        .from('users')
        .select('id, user_id, name, username, avatar_url, account_type, created_at, last_active_at')
        .order('created_at', { ascending: false });

      if (usersError) {
        throw usersError;
      }

      // Build user list from users table
      const usersList: User[] = (usersData || []).map(userRecord => ({
        id: userRecord.user_id,
        email: '', // Email not available from users table (stored in auth.users)
        created_at: userRecord.created_at,
        last_active_at: userRecord.last_active_at || undefined,
        account_type: userRecord.account_type,
        name: userRecord.name || undefined,
        username: userRecord.username || undefined,
        avatar_url: userRecord.avatar_url || undefined,
      }));

      setUsers(usersList);
      
      // Calculate daily new users
      calculateDailyUsers(usersList);
      
      // Calculate MAU (Monthly Active Users)
      calculateMAU(usersList);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      
      const isRLSError = error?.code === '42501' || error?.message?.includes('permission') || error?.message?.includes('policy');
      
      toast({
        title: 'Error loading users',
        description: isRLSError
          ? 'Permission denied. Please check RLS policies for admin access to users table.'
          : error.message || 'Failed to fetch user data. Please try refreshing the page.',
        variant: 'destructive',
      });
      
      setUsers([]);
      setDailyUsersData([]);
      setMauData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignupMethods = async () => {
    const { data, error } = await db.rpc('get_user_signup_providers');

    if (error) {
      console.error('Error fetching signup methods:', error);
      setSignupMethodsError(error.message || 'Signup method data unavailable.');
      setSignupMethods({});
      return;
    }

    const map: Record<string, SignupMethod> = {};
    (data || []).forEach((row: { user_id: string; signup_method: string }) => {
      map[row.user_id] = normalizeSignupMethod(row.signup_method);
    });
    setSignupMethods(map);
    setSignupMethodsError(null);
  };

  const fetchAcquisitionAnalytics = async () => {
    try {
      const [countsResponse, weeklyResponse, otherResponse] = await Promise.all([
        db.from('users').select('acquisition_source'),
        db
          .from('users')
          .select('created_at, acquisition_source')
          .gte('created_at', subDays(new Date(), 6).toISOString()),
        db
          .from('users')
          .select('id, created_at, acquisition_source, other_acquisition_source')
          .not('other_acquisition_source', 'is', null)
          .neq('other_acquisition_source', '')
          .ilike('acquisition_source', 'other')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (countsResponse.error) throw countsResponse.error;
      if (weeklyResponse.error) throw weeklyResponse.error;
      if (otherResponse.error) throw otherResponse.error;

      const counts = new Map<string, number>();
      ACQUISITION_SOURCE_CANONICAL_ORDER.forEach((source) => counts.set(source, 0));
      (countsResponse.data || []).forEach((row: { acquisition_source?: string | null }) => {
        const normalized = normalizeAcquisitionSource(row.acquisition_source);
        if (!normalized) return;
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      });
      const sortedCounts = Array.from(counts.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
      setAcquisitionSourceCounts(sortedCounts);

      const grouped: Record<string, Record<string, number>> = {};
      (weeklyResponse.data || []).forEach((row: { created_at?: string | null; acquisition_source?: string | null }) => {
        if (!row.created_at) return;
        const dateKey = new Date(row.created_at).toISOString().split('T')[0];
        const normalized = normalizeAcquisitionSource(row.acquisition_source);
        if (!normalized) return;
        if (!grouped[dateKey]) {
          grouped[dateKey] = {};
        }
        grouped[dateKey][normalized] = (grouped[dateKey][normalized] || 0) + 1;
      });

      const startDate = startOfDay(subDays(new Date(), 6));
      const weekly: AcquisitionWeeklyBreakdownPoint[] = [];
      for (let i = 0; i < 7; i++) {
        const currentDate = addDays(startDate, i);
        const isoDate = currentDate.toISOString().split('T')[0];
        const dayTotals = grouped[isoDate] || {};
        const entry: AcquisitionWeeklyBreakdownPoint = { date: isoDate };
        ACQUISITION_SOURCE_CANONICAL_ORDER.forEach((source) => {
          entry[source] = dayTotals[source] || 0;
        });
        weekly.push(entry);
      }
      setAcquisitionWeeklyBreakdown(weekly);

      const otherPreview = (otherResponse.data || [])
        .filter((row: { acquisition_source?: string | null }) => normalizeAcquisitionSource(row.acquisition_source) === 'Other')
        .slice(0, 5)
        .map((row: { id: string; created_at: string; other_acquisition_source: string }) => ({
          id: row.id,
          created_at: row.created_at,
          other_acquisition_source: row.other_acquisition_source,
        }));
      setRecentOtherAcquisitionResponses(otherPreview);
    } catch (error) {
      console.error('Error fetching acquisition analytics:', error);
      setAcquisitionSourceCounts(ACQUISITION_SOURCE_CANONICAL_ORDER.map((source) => ({ source, count: 0 })));
      setAcquisitionWeeklyBreakdown([]);
      setRecentOtherAcquisitionResponses([]);
    }
  };

  const fetchAllOtherAcquisitionResponses = async () => {
    try {
      setOtherAcquisitionModalLoading(true);
      setOtherAcquisitionModalError(null);
      const { data, error } = await db
        .from('users')
        .select('id, created_at, acquisition_source, other_acquisition_source')
        .not('other_acquisition_source', 'is', null)
        .neq('other_acquisition_source', '')
        .ilike('acquisition_source', 'other')
        .order('created_at', { ascending: false })
        .limit(FULL_OTHER_RESPONSES_LIMIT);

      if (error) throw error;

      const rows = (data || [])
        .filter((row: { acquisition_source?: string | null }) => normalizeAcquisitionSource(row.acquisition_source) === 'Other')
        .map((row: { id: string; created_at: string; other_acquisition_source: string }) => ({
          id: row.id,
          created_at: row.created_at,
          other_acquisition_source: row.other_acquisition_source,
        }));
      setOtherAcquisitionModalResponses(rows);
    } catch (error: any) {
      console.error('Error loading full other acquisition responses:', error);
      setOtherAcquisitionModalResponses([]);
      setOtherAcquisitionModalError(error?.message || 'Unable to load acquisition responses.');
    } finally {
      setOtherAcquisitionModalLoading(false);
    }
  };

  useEffect(() => {
    if (!isOtherAcquisitionModalOpen) return;
    void fetchAllOtherAcquisitionResponses();
  }, [isOtherAcquisitionModalOpen]);

  const calculateDailyUsers = (usersList: User[]) => {
    // Get the last 30 days
    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    // Group users by creation date
    const dailyCounts: Record<string, number> = {};
    const dailyNames: Record<string, string[]> = {};
    
    // Initialize all dates with 0
    dateRange.forEach(date => {
      const dateKey = format(startOfDay(date), 'yyyy-MM-dd');
      dailyCounts[dateKey] = 0;
    });

    // Count users created on each day
    usersList.forEach(user => {
      const createdDate = startOfDay(new Date(user.created_at));
      const dateKey = format(createdDate, 'yyyy-MM-dd');
      
      // Only count if within the last 30 days
      if (createdDate >= startDate) {
        dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
        if (!dailyNames[dateKey]) dailyNames[dateKey] = [];
        dailyNames[dateKey]!.push(user.name || user.username || user.id.slice(0, 8));
      }
    });

    // Convert to chart data format
    const chartData: ChartDataPoint[] = dateRange.map(date => {
      const dateKey = format(startOfDay(date), 'yyyy-MM-dd');
      return {
        date: format(date, 'MMM dd'),
        dateKey,
        users: dailyCounts[dateKey] || 0,
        names: dailyNames[dateKey] || [],
      };
    });

    setDailyUsersData(chartData);
  };

  const openDailyUsersForDay = async (dateKey: string, dateLabel: string) => {
    if (!dateKey) return;
    setSelectedDayKey(dateKey);
    setSelectedDayLabel(dateLabel);
    setDayUsersDialogOpen(true);
    setDayUsersLoading(true);
    setDaySignupUsers([]);

    try {
      const dayStart = startOfDay(new Date(`${dateKey}T12:00:00`));
      const dayEnd = endOfDay(dayStart);
      const matched = users.filter((u) => {
        const created = new Date(u.created_at);
        return isWithinInterval(created, { start: dayStart, end: dayEnd });
      });

      if (!matched.length) {
        setDaySignupUsers([]);
        return;
      }

      const ids = matched.map((u) => u.id);
      const { data: profiles, error: profilesError } = await db
        .from('profiles')
        .select('user_id, name, avatar_url, instagram_handle, snapchat_handle, music_streaming_profile')
        .in('user_id', ids);

      if (profilesError) {
        console.warn('profiles fetch for day signups:', profilesError);
      }

      const byId = new Map(
        (profiles || []).map((p: {
          user_id: string;
          name?: string | null;
          avatar_url?: string | null;
          instagram_handle?: string | null;
          snapchat_handle?: string | null;
          music_streaming_profile?: string | null;
        }) => [p.user_id, p]),
      );

      setDaySignupUsers(
        matched
          .map((u) => {
            const p = byId.get(u.id);
            return {
              id: u.id,
              name: p?.name || u.name || null,
              username: u.username || null,
              avatar_url: p?.avatar_url || u.avatar_url || null,
              account_type: u.account_type || null,
              created_at: u.created_at,
              instagram_handle: p?.instagram_handle || null,
              snapchat_handle: p?.snapchat_handle || null,
              music_streaming_profile: p?.music_streaming_profile || null,
            };
          })
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      );
    } catch (err) {
      console.error('Error loading day signups', err);
      toast({
        title: 'Could not load users for that day',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDayUsersLoading(false);
    }
  };

  const calculateMAU = (usersList: User[]) => {
    // Calculate MAU for the last 12 months
    const endDate = new Date();
    const months: ChartDataPoint[] = [];

    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
      const monthEnd = new Date(endDate.getFullYear(), endDate.getMonth() - i + 1, 0);
      
      // Count users active in this month
      // A user is considered active if they were created or last active in this month
      const activeUsers = usersList.filter(user => {
        const createdDate = new Date(user.created_at);
        const lastActiveDate = user.last_active_at ? new Date(user.last_active_at) : createdDate;
        const activeDate = lastActiveDate > createdDate ? lastActiveDate : createdDate;
        
        return activeDate >= monthStart && activeDate <= monthEnd;
      }).length;

      months.push({
        date: format(monthStart, 'MMM yyyy'),
        users: activeUsers,
        mau: activeUsers,
      });
    }

    setMauData(months);
  };

  // Helper function to fetch events count from the active events table
  const fetchEventsCount = async (options?: { gte?: string; lte?: string }) => {
    let query = db
      .from('jambase_events')
      .select('*', { count: 'exact', head: true });

    if (options?.gte) {
      query = query.gte('created_at', options.gte);
    }
    if (options?.lte) {
      query = query.lte('created_at', options.lte);
    }

    return await query;
  };

  const fetchTodayAdditions = async () => {
    try {
      setEventAnalyticsLoading(true);
      
      // Get today's date range (start of day to end of day)
      const today = new Date();
      const startOfToday = startOfDay(today);
      const endOfToday = new Date(startOfToday);
      endOfToday.setHours(23, 59, 59, 999);
      
      // Get yesterday's date range for comparison
      const yesterday = subDays(today, 1);
      const startOfYesterday = startOfDay(yesterday);
      const endOfYesterday = new Date(startOfYesterday);
      endOfYesterday.setHours(23, 59, 59, 999);
      
      const startISO = startOfToday.toISOString();
      const endISO = endOfToday.toISOString();
      const startYesterdayISO = startOfYesterday.toISOString();
      const endYesterdayISO = endOfYesterday.toISOString();

      // Fetch totals and day-over-day changes
      const [totalArtistsResult, totalEventsResult, totalVenuesResult] = await Promise.all([
        db
          .from('artists')
          .select('*', { count: 'exact', head: true }),
        fetchEventsCount(),
        db
          .from('venues')
          .select('*', { count: 'exact', head: true })
      ]);

      // Fetch today's counts
      const [todayArtistsCount, todayEventsCount, todayVenuesCount] = await Promise.all([
        db
          .from('artists')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startISO)
          .lte('created_at', endISO),
        fetchEventsCount({ gte: startISO, lte: endISO }),
        db
          .from('venues')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startISO)
          .lte('created_at', endISO)
      ]);

      // Fetch yesterday's counts
      const [yesterdayArtistsCount, yesterdayEventsCount, yesterdayVenuesCount] = await Promise.all([
        db
          .from('artists')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startYesterdayISO)
          .lte('created_at', endYesterdayISO),
        fetchEventsCount({ gte: startYesterdayISO, lte: endYesterdayISO }),
        db
          .from('venues')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startYesterdayISO)
          .lte('created_at', endYesterdayISO)
      ]);

      // Set totals
      setTotalArtists(totalArtistsResult.count || 0);
      setTotalEvents(totalEventsResult.count || 0);
      setTotalVenues(totalVenuesResult.count || 0);

      // Calculate day-over-day changes
      const todayArtists = todayArtistsCount.count || 0;
      const yesterdayArtists = yesterdayArtistsCount.count || 0;
      setArtistsChange(todayArtists - yesterdayArtists);

      const todayEvents = todayEventsCount.count || 0;
      const yesterdayEvents = yesterdayEventsCount.count || 0;
      setEventsChange(todayEvents - yesterdayEvents);

      const todayVenues = todayVenuesCount.count || 0;
      const yesterdayVenues = yesterdayVenuesCount.count || 0;
      setVenuesChange(todayVenues - yesterdayVenues);

      const eventsResult = await db
        .from('jambase_events')
        .select('*')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: false });

      const [artistsResult, venuesResult] = await Promise.all([
        db
          .from('artists')
          .select('*')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false }),
        db
          .from('venues')
          .select('*')
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false })
      ]);

      if (eventsResult.error) {
        console.error('Error fetching events:', eventsResult.error);
      } else {
        setTodayEvents(eventsResult.data || []);
      }

      if (artistsResult.error) {
        console.error('Error fetching artists:', artistsResult.error);
      } else {
        setTodayArtists(artistsResult.data || []);
      }

      if (venuesResult.error) {
        console.error('Error fetching venues:', venuesResult.error);
      } else {
        setTodayVenues(venuesResult.data || []);
      }
    } catch (error: any) {
      console.error('Error fetching today\'s additions:', error);
      toast({
        title: 'Error loading today\'s additions',
        description: error.message || 'Failed to fetch data',
        variant: 'destructive',
      });
    } finally {
      setEventAnalyticsLoading(false);
    }
  };


  useEffect(() => {
    if (user && isAdmin) {
      fetchModerationFlags();
    }
  }, [moderationStatusFilter, moderationContentTypeFilter, moderationCategoryFilter, user, isAdmin]);

  const fetchNewsItems = async () => {
    try {
      setNewsLoading(true);
      const { data, error } = await db
        .from('news_items')
        .select('id, title, url, image_url, source, sort_order, created_at, seo_title, seo_description, image_alt, primary_keyword, keywords')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNewsItems(data || []);
    } catch (error: any) {
      console.error('Error fetching news items:', error);
      toast({
        title: 'Error loading In the News',
        description: error?.message || 'Failed to fetch news items.',
        variant: 'destructive',
      });
      setNewsItems([]);
    } finally {
      setNewsLoading(false);
    }
  };

  useEffect(() => {
    if (user && isAdmin) {
      fetchNewsItems();
    }
  }, [user, isAdmin]);

  const addNewsItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsUrl.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Title and URL are required.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setNewsSubmitting(true);
      const keywordsArr = newsKeywords.trim()
        ? newsKeywords.split(',').map(k => k.trim()).filter(Boolean)
        : null;
      const { error } = await db.from('news_items').insert({
        title: newsTitle.trim(),
        url: newsUrl.trim(),
        image_url: newsImageUrl.trim() || null,
        source: newsSource.trim() || null,
        sort_order: newsItems.length,
        seo_title: newsSeoTitle.trim() || null,
        seo_description: newsSeoDescription.trim() || null,
        image_alt: newsImageAlt.trim() || null,
        primary_keyword: newsPrimaryKeyword.trim() || null,
        keywords: keywordsArr,
      });
      if (error) throw error;
      toast({
        title: 'Added to In the News',
        description: 'The item will appear on the Media page (/pr).',
      });
      setNewsTitle('');
      setNewsUrl('');
      setNewsImageUrl('');
      setNewsSource('');
      setNewsSeoTitle('');
      setNewsSeoDescription('');
      setNewsImageAlt('');
      setNewsPrimaryKeyword('');
      setNewsKeywords('');
      fetchNewsItems();
    } catch (error: any) {
      toast({
        title: 'Error adding item',
        description: error?.message || 'Failed to add news item.',
        variant: 'destructive',
      });
    } finally {
      setNewsSubmitting(false);
    }
  };

  const deleteNewsItem = async (id: string) => {
    try {
      const { error } = await db.from('news_items').delete().eq('id', id);
      if (error) throw error;
      toast({
        title: 'Removed',
        description: 'Item removed from In the News.',
      });
      fetchNewsItems();
    } catch (error: any) {
      toast({
        title: 'Error removing item',
        description: error?.message || 'Failed to delete.',
        variant: 'destructive',
      });
    }
  };

  const handleNewsImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Use JPEG, PNG, WebP, or GIF (max 5MB).',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Image must be 5MB or smaller.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setNewsImageUploading(true);
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `admin/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
      const { data, error } = await supabase.storage
        .from('news-images')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('news-images').getPublicUrl(data.path);
      setNewsImageUrl(urlData.publicUrl);
      toast({
        title: 'Image uploaded',
        description: 'Image URL set. You can add the item below.',
      });
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err?.message || 'Could not upload image.',
        variant: 'destructive',
      });
    } finally {
      setNewsImageUploading(false);
      e.target.value = '';
    }
  };

  const fetchModerationFlags = async () => {
    try {
      setModerationLoading(true);
      let query = db
        .from('moderation_flags')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (moderationStatusFilter !== 'all') {
        query = query.eq('status', moderationStatusFilter);
      }
      if (moderationContentTypeFilter !== 'all') {
        query = query.eq('content_type', moderationContentTypeFilter);
      }
      if (moderationCategoryFilter !== 'all') {
        query = query.eq('flag_category', moderationCategoryFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setModerationFlags(data || []);

      // Fetch user information for all flagged users
      if (data && data.length > 0) {
        const userIds = new Set<string>();
        data.forEach(flag => {
          userIds.add(flag.flagged_by_user_id);
          if (flag.resolved_by_user_id) {
            userIds.add(flag.resolved_by_user_id);
          }
        });

        // Fetch user info from users table
        const { data: usersData, error: usersError } = await db
          .from('users')
          .select('user_id, name, username')
          .in('user_id', Array.from(userIds));

        if (!usersError && usersData) {
          const userMap: Record<string, { name: string; username: string | null }> = {};
          usersData.forEach(user => {
            userMap[user.user_id] = {
              name: user.name || 'Unknown',
              username: user.username || null,
            };
          });
          setUserInfoMap(userMap);
        }
      }
    } catch (error: any) {
      console.error('Error fetching moderation flags:', error);
      
      const isRLSError = error?.code === '42501' || error?.message?.includes('permission') || error?.message?.includes('policy');
      
      toast({
        title: 'Error loading flags',
        description: isRLSError
          ? 'Permission denied. Please check RLS policies for admin access to moderation_flags table.'
          : error.message || 'Failed to fetch moderation flags. Please try refreshing the page.',
        variant: 'destructive',
      });
      
      setModerationFlags([]);
      setUserInfoMap({});
    } finally {
      setModerationLoading(false);
    }
  };

  const getUserDisplayName = (userId: string): string => {
    const userInfo = userInfoMap[userId];
    if (userInfo) {
      if (userInfo.username) {
        return `@${userInfo.username} (${userInfo.name})`;
      }
      return userInfo.name;
    }
    return userId.substring(0, 8) + '...';
  };

  const handleReviewModerationFlag = async (flag: ModerationFlag) => {
    setSelectedFlag(flag);
    setModerationStatus(flag.status);
    setModerationAction(flag.resolution_action || '');
    setModerationResolutionNotes(flag.resolution_notes || '');
    setModerationDialogOpen(true);
    
    // Fetch the actual content being flagged
    await fetchContentData(flag);
  };

  const fetchContentData = async (flag: ModerationFlag) => {
    try {
      setContentLoading(true);
      let content: any = null;

      switch (flag.content_type) {
        case 'review':
          const { data: reviewData, error: reviewError } = await db
            .from('reviews')
            .select('*')
            .eq('id', flag.content_id)
            .single();
          if (!reviewError && reviewData) {
            content = reviewData;
          }
          break;
        case 'event': {
          const { data: eventData, error: eventError } = await db
            .from('jambase_events')
            .select('*')
            .eq('id', flag.content_id)
            .single();

          if (!eventError && eventData) {
            content = eventData;
          }
          break;
        }
        case 'artist':
          const { data: artistData, error: artistError } = await db
            .from('artists')
            .select('*')
            .eq('id', flag.content_id)
            .single();
          if (!artistError && artistData) {
            content = artistData;
          }
          break;
        case 'venue':
          const { data: venueData, error: venueError } = await db
            .from('venues')
            .select('*')
            .eq('id', flag.content_id)
            .single();
          if (!venueError && venueData) {
            content = venueData;
          }
          break;
      }

      setContentData(content);
      if (content) {
        setEditedContent({ ...content });
      }
    } catch (error: any) {
      console.error('Error fetching content:', error);
    } finally {
      setContentLoading(false);
    }
  };

  const getContentOwnerId = (content: any, contentType: string): string | null => {
    if (!content) return null;
    
    // Reviews have user_id
    if (contentType === 'review' && content.user_id) {
      return content.user_id;
    }
    
    // Events, artists, venues might not have direct user_id
    // We'll need to handle this case - for now return null
    return null;
  };

  const handleUpdateModerationFlag = async () => {
    if (!selectedFlag || !user) return;

    try {
      // First, perform the action based on resolution_action
      if (moderationAction) {
        await performModerationAction(selectedFlag, moderationAction);
      }

      // Then update the flag record
      const updateData: any = {
        status: moderationStatus,
        resolved_by_user_id: user.id,
        resolved_at: new Date().toISOString(),
        resolution_notes: moderationResolutionNotes || null,
      };

      if (moderationAction) {
        updateData.resolution_action = moderationAction;
      }

      const { error } = await db
        .from('moderation_flags')
        .update(updateData)
        .eq('id', selectedFlag.id);

      if (error) throw error;

      toast({
        title: 'Flag updated',
        description: `Moderation flag ${moderationAction ? `and action (${moderationAction.replace('_', ' ')}) ` : ''}completed successfully`,
      });

      setModerationDialogOpen(false);
      setSelectedFlag(null);
      setContentData(null);
      setEditedContent(null);
      fetchModerationFlags();
    } catch (error: any) {
      console.error('Error updating moderation flag:', error);
      toast({
        title: 'Error updating flag',
        description: error.message || 'Failed to update moderation flag',
        variant: 'destructive',
      });
    }
  };

  const performModerationAction = async (flag: ModerationFlag, action: string) => {
    const contentOwnerId = getContentOwnerId(contentData, flag.content_type);

    switch (action) {
      case 'content_removed':
        await removeContent(flag);
        break;
      
      case 'content_edited':
        // Content editing is handled separately via edit dialog
        // Just mark it as edited in the flag
        break;
      
      case 'user_warned':
        if (contentOwnerId) {
          await warnUser(contentOwnerId, flag);
        } else {
          throw new Error('Cannot warn user: content owner not found');
        }
        break;
      
      case 'user_suspended':
        if (contentOwnerId) {
          await suspendUser(contentOwnerId);
        } else {
          throw new Error('Cannot suspend user: content owner not found');
        }
        break;
      
      case 'user_banned':
        if (contentOwnerId) {
          await banUser(contentOwnerId);
        } else {
          throw new Error('Cannot ban user: content owner not found');
        }
        break;
    }
  };

  const removeContent = async (flag: ModerationFlag) => {
    let tableName: string;
    
    switch (flag.content_type) {
      case 'review':
        tableName = 'user_reviews';
        break;
      case 'event':
        tableName = 'jambase_events';
        break;
      case 'artist':
        tableName = 'artists';
        break;
      case 'venue':
        tableName = 'venues';
        break;
      default:
        throw new Error(`Unknown content type: ${flag.content_type}`);
    }

    const { error } = await db
      .from(tableName)
      .delete()
      .eq('id', flag.content_id);

    if (error) throw error;
  };

  const warnUser = async (userId: string, flag: ModerationFlag) => {
    // Create a warning record
    const { error: warningError } = await db
      .from('user_warnings')
      .insert({
        user_id: userId,
        warned_by_user_id: user!.id,
        reason: moderationResolutionNotes || flag.flag_reason,
        moderation_flag_id: flag.id,
      });

    if (warningError) throw warningError;

    // Update user account_status to 'warned'
    const { error: userError } = await db
      .from('users')
      .update({ account_status: 'warned' })
      .eq('user_id', userId);

    if (userError) throw userError;
  };

  const suspendUser = async (userId: string) => {
    const { error } = await db
      .from('users')
      .update({ account_status: 'suspended' })
      .eq('user_id', userId);

    if (error) throw error;
  };

  const banUser = async (userId: string) => {
    const { error } = await db
      .from('users')
      .update({ account_status: 'banned' })
      .eq('user_id', userId);

    if (error) throw error;
  };

  const handleSaveContentEdit = async () => {
    if (!selectedFlag || !editedContent) return;

    try {
      let tableName: string;
      
      switch (selectedFlag.content_type) {
        case 'review':
          tableName = 'reviews';
          break;
        case 'event':
          tableName = 'jambase_events';
          break;
        case 'artist':
          tableName = 'artists';
          break;
        case 'venue':
          tableName = 'venues';
          break;
        default:
          throw new Error(`Unknown content type: ${selectedFlag.content_type}`);
      }

      const { error } = await db
        .from(tableName)
        .update(editedContent)
        .eq('id', selectedFlag.content_id);

      if (error) throw error;

      setEditContentDialogOpen(false);
      setContentData(editedContent);
      toast({
        title: 'Content updated',
        description: 'Content has been successfully edited',
      });
    } catch (error: any) {
      console.error('Error updating content:', error);
      toast({
        title: 'Error updating content',
        description: error.message || 'Failed to update content',
        variant: 'destructive',
      });
    }
  };

  const fetchUserAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      
      // Debug: Check current user's auth status and admin privileges
      const { data: { user: authUser } } = await db.auth.getUser();
      console.log('🔐 Current auth user:', authUser?.id);
      
      // Check if user is admin in database
      const { data: currentUserData } = await db
        .from('users')
        .select('user_id, account_type, name')
        .eq('user_id', authUser?.id || '')
        .single();
      
      console.log('👤 Current user in DB:', currentUserData);
      
      const endDate = new Date();
      const todayStart = startOfDay(endDate);
      const thirtyDaysAgo = subDays(endDate, 30);
      const sevenDaysAgo = subDays(endDate, 7);
      const startISO = thirtyDaysAgo.toISOString();
      const endISO = endDate.toISOString();
      const todayISO = todayStart.toISOString();

      // Calculate DAU/MAU/WAU from multiple activity sources (interactions + others)
      console.log('🔍 Fetching activity data for DAU/MAU/WAU from multiple sources...');
      
      const mauUserIds = new Set<string>();
      const dauUserIds = new Set<string>();
      const wauUserIds = new Set<string>();
      const todayDateStr = format(todayStart, 'yyyy-MM-dd');
      
      // Helper function to check if date is today
      const isToday = (dateStr: string): boolean => {
        if (!dateStr) return false;
        const dateOnly = dateStr.substring(0, 10);
        return dateOnly === todayDateStr;
      };
      
      // Helper function to check if date is within last 30 days
      const isWithinLast30Days = (dateStr: string): boolean => {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return date >= thirtyDaysAgo && date <= endDate;
      };
      
      // Helper function to check if date is within last 7 days (for WAU)
      const isWithinLast7Days = (dateStr: string): boolean => {
        if (!dateStr) return false;
        const date = new Date(dateStr);
        return date >= sevenDaysAgo && date <= endDate;
      };
      
      // Helper function to add user to DAU/MAU sets (WAU is computed from interactions only below)
      const addUserActivity = (userId: string, activityDate: string) => {
        if (!userId) return;
        if (isWithinLast30Days(activityDate)) {
          mauUserIds.add(userId);
        }
        if (isToday(activityDate)) {
          dauUserIds.add(userId);
        }
      };
      
      // 1. Fetch interactions (use occurred_at or created_at) — used for DAU/MAU and WAU
      // Paginate to fetch ALL rows — Supabase defaults to 1000 per request
      const PAGE_SIZE = 1000;
      let interactions: { user_id: string; occurred_at?: string; created_at?: string }[] = [];
      let interactionsError: Error | null = null;
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: page, error } = await db
          .from('interactions')
          .select('user_id, occurred_at, created_at')
          .or(`occurred_at.gte.${startISO},created_at.gte.${startISO}`)
          .range(from, from + PAGE_SIZE - 1)
          .order('created_at', { ascending: true });
        if (error) {
          interactionsError = error;
          console.warn('⚠️ Error fetching interactions with OR filter:', error);
          break;
        }
        if (!page || page.length === 0) break;
        interactions = interactions.concat(page);
        hasMore = page.length === PAGE_SIZE;
        from += PAGE_SIZE;
      }
      if (interactionsError) {
        // Try with just created_at filter as fallback, also paginated
        interactions = [];
        from = 0;
        hasMore = true;
        while (hasMore) {
          const { data: page, error } = await db
            .from('interactions')
            .select('user_id, occurred_at, created_at')
            .gte('created_at', startISO)
            .range(from, from + PAGE_SIZE - 1)
            .order('created_at', { ascending: true });
          if (error) break;
          if (!page || page.length === 0) break;
          interactions = interactions.concat(page);
          hasMore = page.length === PAGE_SIZE;
          from += PAGE_SIZE;
        }
        if (interactions.length > 0) interactionsError = null;
      }
      
      (interactions || []).forEach(i => {
        const activityDate = i.occurred_at || i.created_at;
        if (activityDate && i.user_id) {
          addUserActivity(i.user_id, activityDate);
          // WAU: from interactions table only (unique users with activity in last 7 days)
          if (isWithinLast7Days(activityDate)) {
            wauUserIds.add(i.user_id);
          }
        }
      });
      
      // Fetch all activity sources in parallel for better performance
      const [
        { data: reviews, error: reviewsError },
        { data: eventRelationships, error: eventRelError },
        { data: messages, error: messagesError },
        { data: comments, error: commentsError },
        { data: engagements, error: engagementsError }
      ] = await Promise.all([
        // 2. Fetch reviews (non-draft only)
        db
          .from('reviews')
          .select('user_id, created_at, event_id')
          .eq('is_draft', false)
          .gte('created_at', startISO),
        // 3. Fetch user_event_relationships
        db
          .from('user_event_relationships')
          .select('user_id, created_at, updated_at, relationship_type, event_id')
          .gte('created_at', startISO),
        // 4. Fetch messages
        db
          .from('messages')
          .select('sender_id, created_at')
          .gte('created_at', startISO),
        // 5. Fetch comments
        db
          .from('comments')
          .select('user_id, created_at')
          .gte('created_at', startISO),
        // 6. Fetch engagements
        db
          .from('engagements')
          .select('user_id, created_at')
          .gte('created_at', startISO)
      ]);
      
      // Process reviews
      if (reviewsError && reviewsError.code !== 'PGRST205') {
        console.warn('⚠️ Error fetching reviews:', reviewsError);
      }
      (reviews || []).forEach(r => {
        if (r.created_at && r.user_id) {
          addUserActivity(r.user_id, r.created_at);
        }
      });
      
      // Process event relationships
      if (eventRelError && eventRelError.code !== 'PGRST205') {
        console.warn('⚠️ Error fetching event relationships:', eventRelError);
      }
      (eventRelationships || []).forEach(rel => {
        // Use updated_at if it's more recent, otherwise use created_at
        const activityDate = (rel.updated_at && new Date(rel.updated_at) > new Date(rel.created_at)) 
          ? rel.updated_at 
          : rel.created_at;
        if (activityDate && rel.user_id) {
          addUserActivity(rel.user_id, activityDate);
        }
      });
      
      // Process messages
      if (messagesError && messagesError.code !== 'PGRST205') {
        console.warn('⚠️ Error fetching messages:', messagesError);
      }
      (messages || []).forEach(m => {
        if (m.created_at && m.sender_id) {
          addUserActivity(m.sender_id, m.created_at);
        }
      });
      
      // Process comments
      if (commentsError && commentsError.code !== 'PGRST205') {
        console.warn('⚠️ Error fetching comments:', commentsError);
      }
      (comments || []).forEach(c => {
        if (c.created_at && c.user_id) {
          addUserActivity(c.user_id, c.created_at);
        }
      });
      
      // Process engagements
      if (engagementsError && engagementsError.code !== 'PGRST205') {
        console.warn('⚠️ Error fetching engagements:', engagementsError);
      }
      (engagements || []).forEach(e => {
        if (e.created_at && e.user_id) {
          addUserActivity(e.user_id, e.created_at);
        }
      });
      
      console.log('✅ DAU/MAU Calculated from multiple sources:', {
        dauUsers: dauUserIds.size,
        mauUsers: mauUserIds.size,
        todayDateStr,
        sources: {
          interactions: (interactions || []).length,
          reviews: (reviews || []).length,
          eventRelationships: (eventRelationships || []).length,
          messages: (messages || []).length,
          comments: (comments || []).length,
          engagements: (engagements || []).length,
        }
      });
      
      setMau(mauUserIds.size);
      setDau(dauUserIds.size);
      setWau(wauUserIds.size);

      // Date range for ECI trend and other calculations
      const dateRange = eachDayOfInterval({ start: thirtyDaysAgo, end: endDate });

      // Reuse eventRelationships data already fetched for DAU/MAU, but filter to date range
      const eventRelationshipsList = (eventRelationships || []).filter(rel => {
        const activityDate = (rel.updated_at && new Date(rel.updated_at) > new Date(rel.created_at)) 
          ? rel.updated_at 
          : rel.created_at;
        if (!activityDate) return false;
        const date = new Date(activityDate);
        return date >= thirtyDaysAgo && date <= endDate;
      });
      
      // Reuse reviews data already fetched for DAU/MAU
      const reviewsList = (reviews || []).filter(r => {
        if (!r.created_at) return false;
        const date = new Date(r.created_at);
        return date >= thirtyDaysAgo && date <= endDate;
      });

      // External/referral shares from referral_shares table (user_id, shared_at, source)
      const REFERRAL_PAGE_SIZE = 1000;
      let referralSharesList: { user_id: string; shared_at: string }[] = [];
      let refFrom = 0;
      let refHasMore = true;
      while (refHasMore) {
        const { data: refPage, error: refError } = await db
          .from('referral_shares')
          .select('user_id, shared_at')
          .range(refFrom, refFrom + REFERRAL_PAGE_SIZE - 1)
          .order('shared_at', { ascending: true });
        if (refError) {
          if (refError.code !== 'PGRST205') console.error('Error fetching referral_shares:', refError);
          break;
        }
        if (!refPage || refPage.length === 0) break;
        referralSharesList = referralSharesList.concat(refPage);
        refHasMore = refPage.length === REFERRAL_PAGE_SIZE;
        refFrom += REFERRAL_PAGE_SIZE;
      }

      // Per-user share counts (for Users table)
      const shareCountByUser: Record<string, number> = {};
      referralSharesList.forEach(r => {
        if (r.user_id) {
          shareCountByUser[r.user_id] = (shareCountByUser[r.user_id] || 0) + 1;
        }
      });
      setUserShareCounts(shareCountByUser);

      // Weekly shares: referral_shares in the last 7 days
      const weeklySharesCount = referralSharesList.filter(r => {
        if (!r.shared_at) return false;
        const d = new Date(r.shared_at);
        return d >= sevenDaysAgo && d <= endDate;
      }).length;
      setWeeklyShares(weeklySharesCount);

      // Fetch full interaction data (for ECI shares + breakdown); need created_at for ECI trend by date
      const breakdownPageSize = 1000;
      let fullInteractionsList: { event_type: string; entity_type: string; entity_id: string | null; created_at?: string }[] = [];
      let fullInteractionsError: Error | null = null;
      let breakdownFrom = 0;
      let breakdownHasMore = true;
      while (breakdownHasMore) {
        const { data: page, error } = await db
          .from('interactions')
          .select('event_type, entity_type, entity_id, created_at')
          .gte('created_at', startISO)
          .range(breakdownFrom, breakdownFrom + breakdownPageSize - 1)
          .order('created_at', { ascending: true });
        if (error) {
          fullInteractionsError = error;
          break;
        }
        if (!page || page.length === 0) break;
        fullInteractionsList = fullInteractionsList.concat(page);
        breakdownHasMore = page.length === breakdownPageSize;
        breakdownFrom += breakdownPageSize;
      }
      if (fullInteractionsError) {
        fullInteractionsList = [];
        breakdownFrom = 0;
        breakdownHasMore = true;
        while (breakdownHasMore) {
          const { data: page, error } = await db
            .from('user_interactions')
            .select('event_type, entity_type, entity_id, created_at')
            .range(breakdownFrom, breakdownFrom + breakdownPageSize - 1);
          if (error) break;
          if (!page || page.length === 0) break;
          fullInteractionsList = fullInteractionsList.concat(page);
          breakdownHasMore = page.length === breakdownPageSize;
          breakdownFrom += breakdownPageSize;
        }
      }

      // ECI/U components — shares: interactions WHERE event_type = 'share' + external shares from referral_shares
      const eventsInterested = eventRelationshipsList.filter(
        r => r.relationship_type === 'interested'
      ).length;
      const reviewsPosted = reviewsList.length;
      const shareCountFromInteractions = fullInteractionsList.filter(
        i => (i.event_type || '').toLowerCase() === 'share'
      ).length;
      const eventsShared = shareCountFromInteractions + referralSharesList.length;

      setEventsInterested(eventsInterested);
      setReviewsPosted(reviewsPosted);
      setEventsShared(eventsShared);

      // Fetch total users for ECI/U and network density calculations
      const { count: totalUsersCount, error: totalUsersError } = await db
        .from('users')
        .select('*', { count: 'exact', head: true });

      if (totalUsersError && totalUsersError.code !== 'PGRST205') {
        console.error('Error fetching total users:', totalUsersError);
      }

      const totalUsers = totalUsersCount || 0;

      // Calculate ECI/U (per user - total users, not just active)
      const totalEci = eventsInterested + reviewsPosted + eventsShared;
      const eciPerUserValue = totalUsers > 0 ? totalEci / totalUsers : 0;
      setEciPerUser(Number(eciPerUserValue.toFixed(2)));

      // Calculate ECI trend (last 30 days)
      const eciByDate: Record<string, { interest: number; reviews: number; shared: number }> = {};
      dateRange.forEach(date => {
        const dateKey = format(date, 'yyyy-MM-dd');
        eciByDate[dateKey] = { interest: 0, reviews: 0, shared: 0 };
      });

      // Process event relationships for interest
      eventRelationshipsList.forEach(rel => {
        if (rel.relationship_type !== 'interested') return;
        try {
          const dateKey = rel.created_at.split('T')[0]; // Extract YYYY-MM-DD from ISO string
          if (eciByDate[dateKey]) {
            eciByDate[dateKey].interest++;
          }
        } catch (e) {
          console.error('Error processing event relationship:', e, rel);
        }
      });

      // Process reviews
      reviewsList.forEach(review => {
        try {
          const dateKey = review.created_at.split('T')[0]; // Extract YYYY-MM-DD from ISO string
          if (eciByDate[dateKey]) {
            eciByDate[dateKey].reviews++;
          }
        } catch (e) {
          console.error('Error processing review:', e, review);
        }
      });

      // Process referral/external shares by date for ECI trend
      referralSharesList.forEach(row => {
        try {
          if (!row.shared_at) return;
          const dateKey = row.shared_at.split('T')[0];
          if (eciByDate[dateKey]) {
            eciByDate[dateKey].shared++;
          }
        } catch (e) {
          console.error('Error processing referral share:', e, row);
        }
      });

      // Process share-type interactions by date for ECI trend (same 30-day range)
      fullInteractionsList
        .filter(i => (i.event_type || '').toLowerCase() === 'share' && i.created_at)
        .forEach(row => {
          try {
            const dateKey = row.created_at!.split('T')[0];
            if (eciByDate[dateKey]) {
              eciByDate[dateKey].shared++;
            }
          } catch (e) {
            console.error('Error processing interaction share for ECI trend:', e, row);
          }
        });

      const trendData = dateRange.map(date => {
        const dateKey = format(date, 'yyyy-MM-dd');
        const dayData = eciByDate[dateKey] || { interest: 0, reviews: 0, shared: 0 };
        return {
          date: format(date, 'MMM dd'),
          interest: dayData.interest,
          reviews: dayData.reviews,
          shared: dayData.shared,
          total: dayData.interest + dayData.reviews + dayData.shared,
        };
      });
      
      // Debug logging
      console.log('ECI Debug:', {
        eventsInterested,
        reviewsPosted,
        eventsShared,
        eciByDateKeys: Object.keys(eciByDate),
        eciByDateNonZero: Object.entries(eciByDate).filter(([_, v]) => v.interest > 0 || v.reviews > 0 || v.shared > 0),
        trendDataNonZero: trendData.filter(d => d.interest > 0 || d.reviews > 0 || d.shared > 0),
        sampleRelationships: eventRelationshipsList.slice(0, 3).map(r => ({ created_at: r.created_at, type: r.relationship_type })),
        sampleReviews: reviewsList.slice(0, 3).map(r => ({ created_at: r.created_at })),
        sampleReferralShares: referralSharesList.slice(0, 3).map(r => ({ shared_at: r.shared_at })),
      });
      setEciTrend(trendData);

      // Fetch user_relationships for network density
      const { data: userRelationships, error: userRelError } = await db
        .from('user_relationships')
        .select('*');

      if (userRelError && userRelError.code !== 'PGRST205') {
        console.error('Error fetching user relationships:', userRelError);
      }

      const userRelationshipsList = userRelationships || [];
      
      // Calculate network density metrics
      const friendships = userRelationshipsList.filter(
        r => r.relationship_type === 'friend' && r.status === 'accepted'
      ).length;
      const pending = userRelationshipsList.filter(
        r => r.relationship_type === 'friend' && r.status === 'pending'
      ).length;
      const blocks = userRelationshipsList.filter(
        r => r.relationship_type === 'block'
      ).length;

      setTotalFriendships(friendships);
      setPendingRequests(pending);
      setTotalBlocks(blocks);

      // Calculate network density using totalUsers already fetched above
      // Network density = actual connections / possible connections
      // For undirected network (friendships): possible = N * (N-1) / 2
      // Calculate maximum possible connections for undirected network
      const maxPossibleConnections = totalUsers > 1 ? (totalUsers * (totalUsers - 1)) / 2 : 0;
      const density = maxPossibleConnections > 0 ? friendships / maxPossibleConnections : 0;
      setNetworkDensity(Number(density.toFixed(4)));

      // fullInteractionsList already fetched above (with created_at) for ECI shares + trend

      // Calculate comprehensive interaction breakdown
      // Group by event_type, then entity_type, and include entity_id for feeds/views
      const interactionMap: Record<string, {
        eventType: string;
        entityType: string;
        entityId?: string;
        count: number;
      }> = {};

      fullInteractionsList.forEach(interaction => {
        const eventType = interaction.event_type || 'unknown';
        const entityType = interaction.entity_type || 'unknown';
        const entityId = interaction.entity_id || null;
        
        // For view/feed types, include entity_id to distinguish different views/feeds
        // entity_id represents the specific view/feed context (e.g., 'home_feed', 'discover', 'chat')
        const isFeedView = entityType === 'view' && entityId && 
          (entityId.includes('feed') || entityId.includes('discover') || 
           entityId.includes('chat') || entityId.includes('profile') ||
           entityId.includes('notifications') || entityId.includes('home'));
        
        // Include entity_id for feed views and other view contexts
        const shouldIncludeEntityId = isFeedView || (entityType === 'view' && entityId);
        
        // Create a unique key for grouping
        const key = shouldIncludeEntityId && entityId
          ? `${eventType}:${entityType}:${entityId}`
          : `${eventType}:${entityType}`;
        
        if (!interactionMap[key]) {
          interactionMap[key] = {
            eventType,
            entityType,
            entityId: shouldIncludeEntityId && entityId ? entityId : undefined,
            count: 0,
          };
        }
        interactionMap[key].count++;
      });

      // Convert to array and sort
      const breakdown = Object.values(interactionMap);
      
      // Sort by: event_type (alphabetically), then count (descending)
      breakdown.sort((a, b) => {
        if (a.eventType !== b.eventType) {
          return a.eventType.localeCompare(b.eventType);
        }
        return b.count - a.count;
      });
      
      setInteractionBreakdown(breakdown);

      // Calculate new user signups (last 30 days)
      const { data: newUsers, error: newUsersError } = await db
        .from('users')
        .select('user_id, name, username, created_at')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      if (newUsersError && newUsersError.code !== 'PGRST205') {
        console.error('Error fetching new users:', newUsersError);
      }

      const newUsersList = newUsers || [];
      const signupsByDate: Record<string, number> = {};
      const signupNamesByDate: Record<string, string[]> = {};
      dateRange.forEach(date => {
        const dateKey = format(startOfDay(date), 'yyyy-MM-dd');
        signupsByDate[dateKey] = 0;
        signupNamesByDate[dateKey] = [];
      });

      newUsersList.forEach((user: { user_id?: string; name?: string | null; username?: string | null; created_at: string }) => {
        const dateKey = format(startOfDay(new Date(user.created_at)), 'yyyy-MM-dd');
        if (signupsByDate[dateKey] !== undefined) {
          signupsByDate[dateKey]++;
          signupNamesByDate[dateKey]!.push(
            user.name || user.username || (user.user_id ? user.user_id.slice(0, 8) : 'user'),
          );
        }
      });

      setNewUserSignups(
        dateRange.map(date => {
          const dateKey = format(startOfDay(date), 'yyyy-MM-dd');
          return {
            date: format(date, 'MMM dd'),
            dateKey,
            count: signupsByDate[dateKey] || 0,
            names: signupNamesByDate[dateKey] || [],
          };
        })
      );

      // Calculate Retention Metrics (D1, D7, D30)
      // Get all users with signup dates (going back 60 days to have enough data for D30)
      const sixtyDaysAgo = subDays(endDate, 60);
      const { data: allUsersForRetention, error: retentionUsersError } = await db
        .from('users')
        .select('user_id, created_at')
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lte('created_at', endISO);

      if (retentionUsersError && retentionUsersError.code !== 'PGRST205') {
        console.warn('⚠️ Error fetching users for retention:', retentionUsersError);
      }

      const usersForRetention = allUsersForRetention || [];
      
      // Create a map of all active user IDs by date (from all activity sources)
      const activeUsersByDate: Record<string, Set<string>> = {};
      
      // Add interactions activity
      (interactions || []).forEach(i => {
        const activityDate = i.occurred_at || i.created_at;
        if (activityDate && i.user_id) {
          const dateKey = activityDate.substring(0, 10);
          if (!activeUsersByDate[dateKey]) {
            activeUsersByDate[dateKey] = new Set();
          }
          activeUsersByDate[dateKey].add(i.user_id);
        }
      });
      
      // Add reviews activity
      (reviews || []).forEach(r => {
        if (r.created_at && r.user_id) {
          const dateKey = r.created_at.substring(0, 10);
          if (!activeUsersByDate[dateKey]) {
            activeUsersByDate[dateKey] = new Set();
          }
          activeUsersByDate[dateKey].add(r.user_id);
        }
      });
      
      // Add event relationships activity
      (eventRelationships || []).forEach(rel => {
        const activityDate = (rel.updated_at && new Date(rel.updated_at) > new Date(rel.created_at)) 
          ? rel.updated_at 
          : rel.created_at;
        if (activityDate && rel.user_id) {
          const dateKey = activityDate.substring(0, 10);
          if (!activeUsersByDate[dateKey]) {
            activeUsersByDate[dateKey] = new Set();
          }
          activeUsersByDate[dateKey].add(rel.user_id);
        }
      });
      
      // Add messages activity
      (messages || []).forEach(m => {
        if (m.created_at && m.sender_id) {
          const dateKey = m.created_at.substring(0, 10);
          if (!activeUsersByDate[dateKey]) {
            activeUsersByDate[dateKey] = new Set();
          }
          activeUsersByDate[dateKey].add(m.sender_id);
        }
      });
      
      // Add comments activity
      (comments || []).forEach(c => {
        if (c.created_at && c.user_id) {
          const dateKey = c.created_at.substring(0, 10);
          if (!activeUsersByDate[dateKey]) {
            activeUsersByDate[dateKey] = new Set();
          }
          activeUsersByDate[dateKey].add(c.user_id);
        }
      });
      
      // Add engagements activity
      (engagements || []).forEach(e => {
        if (e.created_at && e.user_id) {
          const dateKey = e.created_at.substring(0, 10);
          if (!activeUsersByDate[dateKey]) {
            activeUsersByDate[dateKey] = new Set();
          }
          activeUsersByDate[dateKey].add(e.user_id);
        }
      });

      // Calculate retention
      let d1Retained = 0;
      let d7Retained = 0;
      let d30Retained = 0;
      let d1Eligible = 0;
      let d7Eligible = 0;
      let d30Eligible = 0;

      usersForRetention.forEach(user => {
        const signupDate = new Date(user.created_at);
        const d1Date = addDays(signupDate, 1);
        const d7Date = addDays(signupDate, 7);
        const d30Date = addDays(signupDate, 30);
        
        const d1DateKey = format(d1Date, 'yyyy-MM-dd');
        const d7DateKey = format(d7Date, 'yyyy-MM-dd');
        const d30DateKey = format(d30Date, 'yyyy-MM-dd');
        
        // Check D1 retention (user must have signed up at least 1 day ago)
        if (d1Date <= endDate) {
          d1Eligible++;
          if (activeUsersByDate[d1DateKey]?.has(user.user_id)) {
            d1Retained++;
          }
        }
        
        // Check D7 retention (user must have signed up at least 7 days ago)
        if (d7Date <= endDate) {
          d7Eligible++;
          if (activeUsersByDate[d7DateKey]?.has(user.user_id)) {
            d7Retained++;
          }
        }
        
        // Check D30 retention (user must have signed up at least 30 days ago)
        if (d30Date <= endDate) {
          d30Eligible++;
          if (activeUsersByDate[d30DateKey]?.has(user.user_id)) {
            d30Retained++;
          }
        }
      });

      setD1Retention(d1Eligible > 0 ? Number(((d1Retained / d1Eligible) * 100).toFixed(2)) : 0);
      setD7Retention(d7Eligible > 0 ? Number(((d7Retained / d7Eligible) * 100).toFixed(2)) : 0);
      setD30Retention(d30Eligible > 0 ? Number(((d30Retained / d30Eligible) * 100).toFixed(2)) : 0);

      // Calculate Engagement Rate (MAU / Total Users)
      const engagementRateValue = totalUsers > 0 ? Number(((mauUserIds.size / totalUsers) * 100).toFixed(2)) : 0;
      setEngagementRate(engagementRateValue);

      // Calculate Top Content Metrics
      // Top Reviewed Events
      const reviewedEventsMap: Record<string, number> = {};
      reviewsList.forEach(review => {
        if (review.event_id) {
          reviewedEventsMap[review.event_id] = (reviewedEventsMap[review.event_id] || 0) + 1;
        }
      });
      
      const topReviewed = Object.entries(reviewedEventsMap)
        .map(([event_id, count]) => ({ event_id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top Interested Events
      const interestedEventsMap: Record<string, number> = {};
      eventRelationshipsList.forEach(rel => {
        if (rel.relationship_type === 'interested' && rel.event_id) {
          interestedEventsMap[rel.event_id] = (interestedEventsMap[rel.event_id] || 0) + 1;
        }
      });
      
      const topInterested = Object.entries(interestedEventsMap)
        .map(([event_id, count]) => ({ event_id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      // Fetch event titles for both top reviewed and top interested events in parallel
      const allEventIds = [...new Set([...topReviewed.map(e => e.event_id), ...topInterested.map(e => e.event_id)])];
      
      if (allEventIds.length > 0) {
        const { data: eventTitles } = await db
          .from('jambase_events')
          .select('id, title')
          .in('id', allEventIds);
        
        const titleMap: Record<string, string> = {};
        (eventTitles || []).forEach(e => {
          titleMap[e.id] = e.title;
        });
        
        setTopReviewedEvents(topReviewed.map(e => ({
          ...e,
          title: titleMap[e.event_id] || 'Unknown Event'
        })));
        
        setTopInterestedEvents(topInterested.map(e => ({
          ...e,
          title: titleMap[e.event_id] || 'Unknown Event'
        })));
      } else {
        setTopReviewedEvents([]);
        setTopInterestedEvents([]);
      }

    } catch (error: any) {
      console.error('Error fetching user analytics:', error);
      
      // Check if it's an RLS error
      const isRLSError = error?.code === '42501' || error?.message?.includes('permission') || error?.message?.includes('policy');
      
      toast({
        title: 'Error loading analytics',
        description: isRLSError 
          ? 'Permission denied. Please check RLS policies for admin access to analytics tables.'
          : error.message || 'Failed to fetch user analytics. Some metrics may be incomplete.',
        variant: 'destructive',
      });
      
      // Set default values to prevent UI errors
      setDau(0);
      setMau(0);
      setWau(0);
      setWeeklyShares(0);
      setUserShareCounts({});
      setEciPerUser(0);
      setNetworkDensity(0);
      setEventsInterested(0);
      setReviewsPosted(0);
      setEventsShared(0);
      setD1Retention(0);
      setD7Retention(0);
      setD30Retention(0);
      setEngagementRate(0);
      setEciTrend([]);
      setNewUserSignups([]);
      setTopReviewedEvents([]);
      setTopInterestedEvents([]);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const getModerationStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
      pending: { variant: 'secondary', icon: Clock },
      under_review: { variant: 'default', icon: Eye },
      resolved: { variant: 'default', icon: CheckCircle },
      dismissed: { variant: 'outline', icon: XCircle },
      escalated: { variant: 'destructive', icon: AlertTriangle },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
      </Badge>
    );
  };

  const handleAuthSuccess = () => {
    // Auth component will handle the redirect/navigation
    window.location.reload();
  };

  // Show loading state
  if (authLoading || accountTypeLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-accent/10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Admin Login
            </CardTitle>
            <CardDescription>
              Please sign in to access the admin dashboard
            </CardDescription>
            <div className="text-xs text-muted-foreground mt-2">
              Route: /admin (Admin component loaded)
            </div>
          </CardHeader>
          <CardContent>
            <Auth onAuthSuccess={handleAuthSuccess} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading while checking account type or if user exists but accountType hasn't been determined yet
  if (authLoading || accountTypeLoading || (user && accountType === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-accent/10">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Checking permissions...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show access denied if not admin (only after loading is complete)
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-accent/10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You do not have permission to access this page. Admin access required.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              Your account type: <span className="font-medium">user</span>
            </div>
            <Button onClick={signOut} variant="outline" className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 p-4">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Synth Admin</title>
      </Helmet>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Shield className="h-8 w-8" />
                Admin Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage users and monitor platform activity
              </p>
            </div>
            <Button onClick={signOut} variant="outline">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        <Tabs
          value={activeAdminTab}
          onValueChange={setActiveAdminTab}
          className="w-full"
        >
          <TabsList className="grid w-full max-w-6xl grid-cols-4 lg:grid-cols-9 mb-6 gap-1 h-auto">
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              Users & Analytics
            </TabsTrigger>
            <TabsTrigger value="content-calendar">
              <CalendarDays className="h-4 w-4 mr-2" />
              Content Calendar
            </TabsTrigger>
            <TabsTrigger value="social">
              <Share2 className="h-4 w-4 mr-2" />
              Social Media
            </TabsTrigger>
            <TabsTrigger value="events">
              <Ticket className="h-4 w-4 mr-2" />
              Event Analytics
            </TabsTrigger>
            <TabsTrigger value="moderation">
              <Flag className="h-4 w-4 mr-2" />
              Moderation
            </TabsTrigger>
            <TabsTrigger value="news">
              <Newspaper className="h-4 w-4 mr-2" />
              In the News
            </TabsTrigger>
            <TabsTrigger value="newsletter-builder">
              <Newspaper className="h-4 w-4 mr-2" />
              Newsletter Builder
            </TabsTrigger>
            <TabsTrigger value="style-guide">
              <BookOpen className="h-4 w-4 mr-2" />
              Style Guide
            </TabsTrigger>
            <TabsTrigger value="ai-scene-guides">
              <Music className="h-4 w-4 mr-2" />
              AI Scene Guides
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <div className="flex flex-col xl:flex-row xl:items-start gap-6">
              {/* Left: Users section — stats, user list with shares, then charts */}
              <div className="w-full xl:max-w-[420px] xl:shrink-0 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Users</h3>
                <div className="grid grid-cols-3 gap-3">
                  <Card className="shadow-sm">
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="text-xl font-bold">{users.length}</div>
                    </CardContent>
                  </Card>
                  <Card className="shadow-sm">
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">MAU</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="text-xl font-bold">{mauData.length > 0 ? mauData[mauData.length - 1]?.mau ?? 0 : 0}</div>
                    </CardContent>
                  </Card>
                  <Card className="shadow-sm">
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium text-muted-foreground">New Today</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="text-xl font-bold">{dailyUsersData.length > 0 ? dailyUsersData[dailyUsersData.length - 1]?.users ?? 0 : 0}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Today's new users — name only */}
                {(() => {
                  const todayStart = startOfDay(new Date());
                  const todayEnd = addDays(todayStart, 1);
                  const todaysNewUsers = users.filter(u => {
                    if (!u.created_at) return false;
                    const d = new Date(u.created_at);
                    return d >= todayStart && d < todayEnd;
                  });
                  return (
                    <Card className="shadow-sm">
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm">Today&apos;s new users</CardTitle>
                        <CardDescription className="text-xs">Hover a name for username, type, and join time</CardDescription>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 pt-0">
                        {loading ? (
                          <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                        ) : todaysNewUsers.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">No new users today</p>
                        ) : (
                          <div className="max-h-[200px] overflow-auto rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-xs">Name</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {todaysNewUsers.map(u => (
                                  <TableRow key={u.id}>
                                    <TableCell className="text-sm py-2">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="cursor-help underline decoration-dotted underline-offset-2">
                                            {u.name || u.id.slice(0, 8) || '—'}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="max-w-xs">
                                          <div className="space-y-0.5">
                                            <p className="font-medium">{u.name || 'No name'}</p>
                                            {u.username ? <p>@{u.username}</p> : null}
                                            {u.account_type ? <p>Type: {u.account_type}</p> : null}
                                            <p>
                                              Joined {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy h:mm a') : '—'}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground font-mono">{u.id.slice(0, 8)}</p>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

                <Card className="shadow-sm">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Users · Shares</CardTitle>
                    <CardDescription className="text-xs">Name and external share count (#)</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    {loading ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                    ) : (
                      <div className="max-h-[280px] overflow-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Name</TableHead>
                              <TableHead className="text-xs text-right w-16">#</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {users
                              .filter(u => (userShareCounts[u.id] ?? 0) > 0)
                              .sort((a, b) => (userShareCounts[b.id] ?? 0) - (userShareCounts[a.id] ?? 0))
                              .map(u => (
                                <TableRow key={u.id}>
                                  <TableCell className="text-sm py-2">{u.name || u.id.slice(0, 8) || '—'}</TableCell>
                                  <TableCell className="text-right text-sm py-2">{userShareCounts[u.id] ?? 0}</TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Users · Signup Method</CardTitle>
                    <CardDescription className="text-xs">Apple, Android, or email signup, per user</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0 space-y-3">
                    <Select value={signupMethodFilter} onValueChange={(value) => setSignupMethodFilter(value as 'all' | SignupMethod)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Filter by signup method" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIGNUP_METHOD_FILTER_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {signupMethodsError ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Signup method data unavailable</p>
                    ) : loading ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                    ) : (
                      <div className="max-h-[280px] overflow-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Name</TableHead>
                              <TableHead className="text-xs text-right">Method</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {users
                              .filter(u => signupMethodFilter === 'all' || (signupMethods[u.id] ?? 'unknown') === signupMethodFilter)
                              .map(u => {
                                const method = signupMethods[u.id] ?? 'unknown';
                                return (
                                  <TableRow key={u.id}>
                                    <TableCell className="text-sm py-2">{u.name || u.id.slice(0, 8) || '—'}</TableCell>
                                    <TableCell className="text-right py-2">
                                      <Badge variant={SIGNUP_METHOD_BADGE_VARIANT[method]} className="text-[10px]">
                                        {SIGNUP_METHOD_LABELS[method]}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Daily Users Added</CardTitle>
                    <CardDescription className="text-xs">Last 30 days · hover for names · click a bar for signups + socials</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {loading ? (
                      <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    ) : (
                      <ChartContainer
                        config={{ users: { label: "New Users", color: "hsl(var(--chart-1))" } }}
                        className="h-[220px] w-full"
                      >
                        <BarChart data={dailyUsersData} margin={{ top: 5, right: 8, left: 0, bottom: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <ChartTooltip content={<SignupNamesTooltip />} />
                          <Bar
                            dataKey="users"
                            fill="hsl(var(--chart-1))"
                            radius={[4, 4, 0, 0]}
                            cursor="pointer"
                            onClick={(data) => {
                              const payload = (data as { payload?: ChartDataPoint })?.payload;
                              if (!payload?.dateKey) return;
                              void openDailyUsersForDay(payload.dateKey, payload.date);
                            }}
                          />
                        </BarChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Monthly Active Users</CardTitle>
                    <CardDescription className="text-xs">Last 12 months</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {loading ? (
                      <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    ) : (
                      <ChartContainer
                        config={{ mau: { label: "MAU", color: "#3b82f6" } }}
                        className="h-[220px] w-full"
                      >
                        <LineChart data={mauData} margin={{ top: 5, right: 8, left: 0, bottom: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={60} stroke="#9ca3af" />
                          <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line type="monotone" dataKey="mau" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ChartContainer>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right: User Analytics — grouped metrics, then ECI detail and charts */}
              <div className="flex-1 min-w-0 space-y-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">User Analytics</h3>

                {/* Activity */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Activity</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">DAU</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold">{dau.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Daily Active Users</p>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">MAU</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold">{mau.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Monthly Active Users</p>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">WAU</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold">{wau.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Weekly (last 7 days)</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Engagement */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Engagement</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Card className="shadow-sm border-2 border-primary">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-primary" /> ECI/U
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold text-primary">{eciPerUser.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">North Star Metric</p>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Weekly Shares</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold">{weeklyShares.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">External/referral (7d)</p>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Engagement Rate</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-xl font-bold">{engagementRate.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">MAU / Total Users</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Retention & Network */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Retention & Network</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">D1</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-lg font-bold">{d1Retention.toFixed(1)}%</div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">D7</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-lg font-bold">{d7Retention.toFixed(1)}%</div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">D30</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-lg font-bold">{d30Retention.toFixed(1)}%</div>
                      </CardContent>
                    </Card>
                    <Card className="shadow-sm">
                      <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Network Density</CardTitle>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="text-lg font-bold">{networkDensity.toFixed(4)}</div>
                        <p className="text-xs text-muted-foreground">0–1 scale</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

            {/* ECI/U Detail Section (North Star Metric) */}
            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Engaged Concert Intent per User (ECI/U) - North Star Metric
                </CardTitle>
                <CardDescription>
                  Average events interested, reviews posted, or events shared per user per month
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Events Interested</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{eventsInterested.toLocaleString()}</div>
                          <p className="text-xs text-muted-foreground">Interested events</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Reviews Posted</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{reviewsPosted.toLocaleString()}</div>
                          <p className="text-xs text-muted-foreground">Event reviews</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium">Events Shared</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{eventsShared.toLocaleString()}</div>
                          <p className="text-xs text-muted-foreground">With friends</p>
                        </CardContent>
                      </Card>
                    </div>
                    <div className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={eciTrend} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 11 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                          <Legend verticalAlign="top" height={36} />
                          <Tooltip 
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="grid gap-2">
                                      <div className="font-medium">{payload[0].payload.date}</div>
                                      {payload.map((entry, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                          <div 
                                            className="h-2 w-2 rounded-full" 
                                            style={{ backgroundColor: entry.color }}
                                          />
                                          <span className="text-sm text-muted-foreground">
                                            {entry.name}:
                                          </span>
                                          <span className="font-medium">{entry.value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="interest" 
                            name="Interest"
                            stroke="#ec4899"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "#ec4899" }}
                            activeDot={{ r: 6 }}
                            connectNulls
                          />
                          <Line 
                            type="monotone" 
                            dataKey="reviews" 
                            name="Reviews"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "#3b82f6" }}
                            activeDot={{ r: 6 }}
                            connectNulls
                          />
                          <Line 
                            type="monotone" 
                            dataKey="shared" 
                            name="Shared"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "#10b981" }}
                            activeDot={{ r: 6 }}
                            connectNulls
                          />
                          <Line 
                            type="monotone" 
                            dataKey="total" 
                            name="Total"
                            stroke="#8b5cf6"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: "#8b5cf6" }}
                            activeDot={{ r: 6 }}
                            connectNulls
                            strokeDasharray="5 5"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>


            {/* New User Signups */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  New User Signups
                </CardTitle>
                <CardDescription>
                  New user registrations over the last 30 days · hover a bar for names · click for socials
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <ChartContainer
                    config={{
                      count: {
                        label: "Signups",
                        color: "hsl(var(--chart-3))",
                      },
                    }}
                    className="h-[300px] w-full"
                  >
                    <BarChart data={newUserSignups} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <ChartTooltip content={<SignupNamesTooltip />} />
                      <Bar 
                        dataKey="count" 
                        fill="hsl(var(--chart-3))"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(data) => {
                          const payload = (data as { payload?: { dateKey?: string; date?: string } })?.payload;
                          if (!payload?.dateKey) return;
                          void openDailyUsersForDay(payload.dateKey, payload.date ?? payload.dateKey);
                        }}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Content Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5" />
                    Top Reviewed Events
                  </CardTitle>
                  <CardDescription>
                    Most reviewed events in the last 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : topReviewedEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No reviewed events in the last 30 days
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {topReviewedEvents.map((event, index) => (
                        <div key={event.event_id} className="flex items-center justify-between p-2 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{event.title}</p>
                              <p className="text-xs text-muted-foreground">Event ID: {event.event_id.substring(0, 8)}...</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{event.count} reviews</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    How Users Found Synth
                  </CardTitle>
                  <CardDescription>
                    Acquisition source mix plus recent custom &quot;Other&quot; responses
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Source Count</h4>
                        <span className="text-xs text-muted-foreground">Totals</span>
                      </div>
                      {acquisitionSourceCounts.length > 0 ? (
                        <ChartContainer
                          config={{ count: { label: 'Signups', color: '#6366f1' } }}
                          className="h-[260px] w-full"
                        >
                          <BarChart data={acquisitionSourceCounts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="source" interval={0} height={60} tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#6366f1" />
                          </BarChart>
                        </ChartContainer>
                      ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground">
                          No acquisition source data yet
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Weekly Breakdown</h4>
                        <span className="text-xs text-muted-foreground">Last 7 days</span>
                      </div>
                      {acquisitionWeeklyBreakdown.length > 0 ? (
                        <ChartContainer
                          config={Object.fromEntries(
                            ACQUISITION_SOURCE_CANONICAL_ORDER.map((source) => [
                              source,
                              { label: source, color: getAcquisitionSourceColor(source) },
                            ]),
                          )}
                          className="h-[260px] w-full"
                        >
                          <BarChart data={acquisitionWeeklyBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(value) => format(new Date(value), 'M/d')}
                            />
                            <YAxis allowDecimals={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <Legend verticalAlign="top" align="left" height={28} />
                            {ACQUISITION_SOURCE_CANONICAL_ORDER.map((source) => (
                              <Bar
                                key={source}
                                dataKey={source}
                                stackId="acquisition"
                                fill={getAcquisitionSourceColor(source)}
                                radius={[4, 4, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ChartContainer>
                      ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground">
                          No weekly acquisition data yet
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold">Other Responses Preview</h4>
                        <p className="text-xs text-muted-foreground">Latest custom answers</p>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {recentOtherAcquisitionResponses.length > 0 ? (
                      <div className="space-y-3">
                        {recentOtherAcquisitionResponses.map((response) => (
                          <div key={response.id} className="rounded-lg border bg-background p-3">
                            <p className="text-sm font-semibold">
                              {new Date(response.created_at).toLocaleDateString()}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {response.other_acquisition_source}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        No recent custom responses yet
                      </div>
                    )}

                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-sm font-semibold"
                        onClick={() => setIsOtherAcquisitionModalOpen(true)}
                      >
                        View Full Detail
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="h-5 w-5" />
                    Top Interested Events
                  </CardTitle>
                  <CardDescription>
                    Most interested events in the last 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : topInterestedEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No interested events in the last 30 days
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {topInterestedEvents.map((event, index) => (
                        <div key={event.event_id} className="flex items-center justify-between p-2 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{event.title}</p>
                              <p className="text-xs text-muted-foreground">Event ID: {event.event_id.substring(0, 8)}...</p>
                            </div>
                          </div>
                          <Badge variant="secondary">{event.count} interested</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Comprehensive Interaction Analytics */}
            <div className="space-y-6">
              {/* Summary Metrics */}
              {(() => {
                const groupedByEvent = interactionBreakdown.reduce((acc, item) => {
                  if (!acc[item.eventType]) {
                    acc[item.eventType] = 0;
                  }
                  acc[item.eventType] += item.count;
                  return acc;
                }, {} as Record<string, number>);
                
                const totalInteractions = Object.values(groupedByEvent).reduce((sum, count) => sum + count, 0);
                const topEventType = Object.entries(groupedByEvent).sort((a, b) => b[1] - a[1])[0];
                
                return (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Total Interactions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{totalInteractions.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">All user actions</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Most Common Action</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold capitalize">{topEventType?.[0].replace(/_/g, ' ') || 'N/A'}</div>
                        <p className="text-xs text-muted-foreground">{topEventType?.[1].toLocaleString() || 0} interactions</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Event Types</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{Object.keys(groupedByEvent).length}</div>
                        <p className="text-xs text-muted-foreground">Unique action types</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Avg per Type</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {Object.keys(groupedByEvent).length > 0 
                            ? Math.round(totalInteractions / Object.keys(groupedByEvent).length).toLocaleString()
                            : '0'}
                        </div>
                        <p className="text-xs text-muted-foreground">Interactions per type</p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Event Type Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Event Type Distribution
                  </CardTitle>
                  <CardDescription>
                    Breakdown of user actions by event type
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {interactionBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No interaction data available
                    </p>
                  ) : (
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={Object.entries(
                            interactionBreakdown.reduce((acc, item) => {
                              if (!acc[item.eventType]) {
                                acc[item.eventType] = 0;
                              }
                              acc[item.eventType] += item.count;
                              return acc;
                            }, {} as Record<string, number>)
                          )
                            .map(([eventType, count]) => ({
                              eventType: eventType.replace(/_/g, ' '),
                              count,
                            }))
                            .sort((a, b) => b.count - a.count)}
                          margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="eventType"
                            tick={{ fontSize: 11 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">{payload[0].payload.eventType}</div>
                                    <div className="text-sm text-muted-foreground">
                                      Count: <span className="font-medium">{payload[0].value?.toLocaleString()}</span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Signup Method Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Signup Method Distribution
                  </CardTitle>
                  <CardDescription>
                    Apple (iOS), Android (Google), or email signups
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {signupMethodsError ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Signup method data unavailable
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(['apple', 'android', 'email', 'unknown'] as SignupMethod[])
                        .map(method => ({
                          method,
                          label: SIGNUP_METHOD_LABELS[method],
                          count: users.filter(u => (signupMethods[u.id] ?? 'unknown') === method).length,
                        }))
                        .filter(entry => entry.count > 0)
                        .map(entry => (
                          <Card key={entry.method} className="shadow-sm">
                            <CardHeader className="p-3 pb-1">
                              <CardTitle className="text-xs font-medium text-muted-foreground">
                                {entry.label}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 pt-0">
                              <div className="text-xl font-bold">{entry.count.toLocaleString()}</div>
                              <p className="text-xs text-muted-foreground">Users signed up</p>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Detailed Breakdown by Event Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Detailed Engagement Breakdown
                  </CardTitle>
                  <CardDescription>
                    Comprehensive breakdown of how users are engaging with all parts of the app
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {interactionBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No interaction data available
                    </p>
                  ) : (
                    <div className="space-y-6">
                      {/* Group by event type */}
                      {Object.entries(
                        interactionBreakdown.reduce((acc, item) => {
                          if (!acc[item.eventType]) {
                            acc[item.eventType] = [];
                          }
                          acc[item.eventType].push(item);
                          return acc;
                        }, {} as Record<string, typeof interactionBreakdown>)
                      )
                        .sort((a, b) => {
                          const aTotal = a[1].reduce((sum, item) => sum + item.count, 0);
                          const bTotal = b[1].reduce((sum, item) => sum + item.count, 0);
                          return bTotal - aTotal;
                        })
                        .map(([eventType, items]) => {
                          const total = items.reduce((sum, item) => sum + item.count, 0);
                          const sortedItems = [...items].sort((a, b) => b.count - a.count);
                          const hasContext = items.some(item => item.entityId);
                          
                          return (
                            <div key={eventType} className="border rounded-lg overflow-hidden">
                              <div className="bg-muted/50 px-4 py-3 border-b">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold text-sm capitalize flex items-center gap-2">
                                    {eventType === 'view' && <Eye className="h-4 w-4" />}
                                    {eventType === 'click' && <Search className="h-4 w-4" />}
                                    {eventType === 'navigate' && <Compass className="h-4 w-4" />}
                                    {eventType === 'interest' && <Heart className="h-4 w-4" />}
                                    {eventType === 'share' && <MessageSquare className="h-4 w-4" />}
                                    {eventType === 'post_review' && <Star className="h-4 w-4" />}
                                    {eventType === 'search' && <Search className="h-4 w-4" />}
                                    {eventType === 'form_submit' && <FileQuestion className="h-4 w-4" />}
                                    {eventType === 'review' && <Star className="h-4 w-4" />}
                                    {eventType === 'ticket_link' && <Ticket className="h-4 w-4" />}
                                    {eventType.replace(/_/g, ' ')}
                                  </h4>
                                  <Badge variant="outline" className="ml-2">
                                    {total.toLocaleString()} total
                                  </Badge>
                                </div>
                              </div>
                              <div className="p-4">
                                {/* Mini bar chart for top items */}
                                {sortedItems.length > 0 && (
                                  <div className="mb-4 space-y-2">
                                    {sortedItems.slice(0, 5).map((item, idx) => {
                                      const percentage = (item.count / total) * 100;
                                      return (
                                        <div key={idx} className="space-y-1">
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="font-medium capitalize">
                                              {item.entityType.replace(/_/g, ' ')}
                                              {item.entityId && (
                                                <span className="text-muted-foreground ml-2 font-mono">
                                                  ({item.entityId.length > 20 ? `${item.entityId.substring(0, 20)}...` : item.entityId})
                                                </span>
                                              )}
                                            </span>
                                            <span className="font-semibold">{item.count.toLocaleString()}</span>
                                          </div>
                                          <div className="w-full bg-muted rounded-full h-2">
                                            <div
                                              className="bg-primary rounded-full h-2 transition-all"
                                              style={{ width: `${percentage}%` }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {sortedItems.length > 5 && (
                                      <p className="text-xs text-muted-foreground mt-2">
                                        +{sortedItems.length - 5} more items
                                      </p>
                                    )}
                                  </div>
                                )}
                                
                                {/* Full table (collapsible) */}
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="w-full">
                                      <ChevronDown className="h-4 w-4 mr-2" />
                                      View Full Details
                                    </Button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="mt-4 border rounded-lg overflow-hidden">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Entity Type</TableHead>
                                            {hasContext && <TableHead>Context</TableHead>}
                                            <TableHead className="text-right">Count</TableHead>
                                            <TableHead className="text-right">%</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {sortedItems.map((item, idx) => {
                                            const percentage = (item.count / total) * 100;
                                            return (
                                              <TableRow key={`${eventType}-${item.entityType}-${item.entityId || ''}-${idx}`}>
                                                <TableCell className="font-medium capitalize">
                                                  {item.entityType.replace(/_/g, ' ')}
                                                </TableCell>
                                                {hasContext && (
                                                  <TableCell className="text-muted-foreground text-sm">
                                                    {item.entityId ? (
                                                      <span className="font-mono text-xs">
                                                        {item.entityId.length > 30 
                                                          ? `${item.entityId.substring(0, 30)}...` 
                                                          : item.entityId}
                                                      </span>
                                                    ) : (
                                                      <span className="text-muted-foreground">—</span>
                                                    )}
                                                  </TableCell>
                                                )}
                                                <TableCell className="text-right">
                                                  <Badge variant="secondary">{item.count.toLocaleString()}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right text-sm text-muted-foreground">
                                                  {percentage.toFixed(1)}%
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </CollapsibleContent>
                                </Collapsible>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Network Density Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Network Density
                </CardTitle>
                <CardDescription>
                  Ratio of actual connections to maximum possible connections (0-1 scale, higher = more interconnected)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Network Density Value</p>
                        <p className="text-2xl font-bold">{networkDensity.toFixed(4)}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Actual connections / Maximum possible connections (0 = no connections, 1 = fully connected)
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Friendships</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{totalFriendships.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Accepted</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{pendingRequests.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Awaiting response</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Blocks</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{totalBlocks.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Blocked users</p>
                      </CardContent>
                    </Card>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="content-calendar" className="space-y-6">
            <ContentCalendarDashboard />
          </TabsContent>

          <TabsContent value="social" className="space-y-6">
            <div className="rounded-3xl border border-pink-100 bg-pink-50/60 p-6 shadow-lg shadow-pink-50/60 space-y-6">
              <div className="flex flex-col gap-0">
                <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Social Media</p>
                <h2 className="text-2xl font-semibold text-foreground">Social Media Analytics</h2>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  View Facebook, Instagram, and TikTok performance separately.
                </p>
              </div>

              {socialLoading ? (
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-pink-200 bg-white/70 py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-pink-600" />
                </div>
              ) : (
                <SocialAnalyticsDashboard
                  data={{
                    overview: socialOverviewMetrics,
                    platformComparisons,
                    contentPerformance: contentPerformanceCards,
                    recentPosts: recentSocialPosts,
                    insights: platformInsights,
                  }}
                  warnings={socialWarnings}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            {/* Event Analytics Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Artists</CardTitle>
                  <Music className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalArtists.toLocaleString()}</div>
                  {artistsChange !== null && (
                    <p className={`text-xs mt-1 ${artistsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {artistsChange >= 0 ? '+' : ''}{artistsChange} from yesterday
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    All artists in database
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                  <Ticket className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalEvents.toLocaleString()}</div>
                  {eventsChange !== null && (
                    <p className={`text-xs mt-1 ${eventsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {eventsChange >= 0 ? '+' : ''}{eventsChange} from yesterday
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    All events in database
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Venues</CardTitle>
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalVenues.toLocaleString()}</div>
                  {venuesChange !== null && (
                    <p className={`text-xs mt-1 ${venuesChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {venuesChange >= 0 ? '+' : ''}{venuesChange} from yesterday
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    All venues in database
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Today's Additions List */}
            <Card>
              <CardHeader>
                <CardTitle>Today's Additions</CardTitle>
                <CardDescription>
                  Events, artists, and venues added today ({format(new Date(), 'MMMM d, yyyy')})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {eventAnalyticsLoading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Loading today's additions...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Events Section */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Ticket className="h-5 w-5" />
                        Events ({todayEvents.length})
                      </h3>
                      {todayEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No events added today</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>Artist ID</TableHead>
                                <TableHead>Venue ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Missing Fields</TableHead>
                                <TableHead>Details</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {todayEvents.map((event) => {
                                const missingFields = getMissingFields(event, 'event');
                                const isExpanded = expandedRow?.type === 'event' && expandedRow?.id === event.id;
                                return (
                                  <Collapsible key={event.id} open={isExpanded} onOpenChange={(open) => {
                                    setExpandedRow(open ? { type: 'event', id: event.id } : null);
                                  }}>
                                    <TableRow className={missingFields.length > 0 ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                                      <TableCell className="font-medium">{event.title || 'N/A'}</TableCell>
                                      <TableCell>{event.artist_id || 'N/A'}</TableCell>
                                      <TableCell>{event.venue_id || 'N/A'}</TableCell>
                                      <TableCell>{event.event_date ? format(new Date(event.event_date), 'MMM d, yyyy') : 'N/A'}</TableCell>
                                      <TableCell>
                                        {missingFields.length > 0 ? (
                                          <Badge variant="destructive" className="gap-1">
                                            <AlertCircle className="h-3 w-3" />
                                            {missingFields.length}
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-green-600">Complete</Badge>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <CollapsibleTrigger asChild>
                                          <Button variant="ghost" size="sm">
                                            {isExpanded ? (
                                              <>
                                                <ChevronUp className="h-4 w-4 mr-1" />
                                                Hide
                                              </>
                                            ) : (
                                              <>
                                                <Eye className="h-4 w-4 mr-1" />
                                                View
                                              </>
                                            )}
                                          </Button>
                                        </CollapsibleTrigger>
                                      </TableCell>
                                    </TableRow>
                                    <CollapsibleContent asChild>
                                      <TableRow>
                                        <TableCell colSpan={6} className="bg-muted/50">
                                          <div className="p-4 space-y-2">
                                            <h4 className="font-semibold mb-2">All Fields:</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                                              {Object.entries(event).map(([key, value]) => (
                                                <div key={key} className={isFieldMissing(value) ? 'text-red-600' : ''}>
                                                  <span className="font-medium">{key}:</span>{' '}
                                                  <span className={isFieldMissing(value) ? 'font-semibold' : ''}>
                                                    {formatValue(value)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                            {missingFields.length > 0 && (
                                              <div className="mt-3 pt-3 border-t">
                                                <p className="text-sm font-semibold text-red-600 mb-1">Missing Fields:</p>
                                                <div className="flex flex-wrap gap-1">
                                                  {missingFields.map((field) => (
                                                    <Badge key={field} variant="destructive">{field}</Badge>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>

                    {/* Artists Section */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Music className="h-5 w-5" />
                        Artists ({todayArtists.length})
                      </h3>
                      {todayArtists.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No artists added today</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Identifier</TableHead>
                                <TableHead>Missing Fields</TableHead>
                                <TableHead>Details</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {todayArtists.map((artist) => {
                                const missingFields = getMissingFields(artist, 'artist');
                                const isExpanded = expandedRow?.type === 'artist' && expandedRow?.id === artist.id;
                                return (
                                  <Collapsible key={artist.id} open={isExpanded} onOpenChange={(open) => {
                                    setExpandedRow(open ? { type: 'artist', id: artist.id } : null);
                                  }}>
                                    <TableRow className={missingFields.length > 0 ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                                      <TableCell className="font-medium">{artist.name || 'N/A'}</TableCell>
                                      <TableCell>{artist.identifier || 'N/A'}</TableCell>
                                      <TableCell>
                                        {missingFields.length > 0 ? (
                                          <Badge variant="destructive" className="gap-1">
                                            <AlertCircle className="h-3 w-3" />
                                            {missingFields.length}
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-green-600">Complete</Badge>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <CollapsibleTrigger asChild>
                                          <Button variant="ghost" size="sm">
                                            {isExpanded ? (
                                              <>
                                                <ChevronUp className="h-4 w-4 mr-1" />
                                                Hide
                                              </>
                                            ) : (
                                              <>
                                                <Eye className="h-4 w-4 mr-1" />
                                                View
                                              </>
                                            )}
                                          </Button>
                                        </CollapsibleTrigger>
                                      </TableCell>
                                    </TableRow>
                                    <CollapsibleContent asChild>
                                      <TableRow>
                                        <TableCell colSpan={4} className="bg-muted/50">
                                          <div className="p-4 space-y-2">
                                            <h4 className="font-semibold mb-2">All Fields:</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                                              {Object.entries(artist).map(([key, value]) => (
                                                <div key={key} className={isFieldMissing(value) ? 'text-red-600' : ''}>
                                                  <span className="font-medium">{key}:</span>{' '}
                                                  <span className={isFieldMissing(value) ? 'font-semibold' : ''}>
                                                    {formatValue(value)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                            {missingFields.length > 0 && (
                                              <div className="mt-3 pt-3 border-t">
                                                <p className="text-sm font-semibold text-red-600 mb-1">Missing Fields:</p>
                                                <div className="flex flex-wrap gap-1">
                                                  {missingFields.map((field) => (
                                                    <Badge key={field} variant="destructive">{field}</Badge>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>

                    {/* Venues Section */}
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Venues ({todayVenues.length})
                      </h3>
                      {todayVenues.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No venues added today</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Street Address</TableHead>
                                <TableHead>State</TableHead>
                                <TableHead>Missing Fields</TableHead>
                                <TableHead>Details</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {todayVenues.map((venue) => {
                                const missingFields = getMissingFields(venue, 'venue');
                                const isExpanded = expandedRow?.type === 'venue' && expandedRow?.id === venue.id;
                                return (
                                  <Collapsible key={venue.id} open={isExpanded} onOpenChange={(open) => {
                                    setExpandedRow(open ? { type: 'venue', id: venue.id } : null);
                                  }}>
                                    <TableRow className={missingFields.length > 0 ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                                      <TableCell className="font-medium">{venue.name || 'N/A'}</TableCell>
                                      <TableCell>{venue.street_address || 'N/A'}</TableCell>
                                      <TableCell>{venue.state || 'N/A'}</TableCell>
                                      <TableCell>
                                        {missingFields.length > 0 ? (
                                          <Badge variant="destructive" className="gap-1">
                                            <AlertCircle className="h-3 w-3" />
                                            {missingFields.length}
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-green-600">Complete</Badge>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <CollapsibleTrigger asChild>
                                          <Button variant="ghost" size="sm">
                                            {isExpanded ? (
                                              <>
                                                <ChevronUp className="h-4 w-4 mr-1" />
                                                Hide
                                              </>
                                            ) : (
                                              <>
                                                <Eye className="h-4 w-4 mr-1" />
                                                View
                                              </>
                                            )}
                                          </Button>
                                        </CollapsibleTrigger>
                                      </TableCell>
                                    </TableRow>
                                    <CollapsibleContent asChild>
                                      <TableRow>
                                        <TableCell colSpan={5} className="bg-muted/50">
                                          <div className="p-4 space-y-2">
                                            <h4 className="font-semibold mb-2">All Fields:</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                                              {Object.entries(venue).map(([key, value]) => (
                                                <div key={key} className={isFieldMissing(value) ? 'text-red-600' : ''}>
                                                  <span className="font-medium">{key}:</span>{' '}
                                                  <span className={isFieldMissing(value) ? 'font-semibold' : ''}>
                                                    {formatValue(value)}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                            {missingFields.length > 0 && (
                                              <div className="mt-3 pt-3 border-t">
                                                <p className="text-sm font-semibold text-red-600 mb-1">Missing Fields:</p>
                                                <div className="flex flex-wrap gap-1">
                                                  {missingFields.map((field) => (
                                                    <Badge key={field} variant="destructive">{field}</Badge>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="moderation" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Flags</CardTitle>
                  <Flag className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{moderationFlags.length}</div>
                  <p className="text-xs text-muted-foreground">
                    All moderation flags
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {moderationFlags.filter(f => f.status === 'pending').length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Awaiting review
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Under Review</CardTitle>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {moderationFlags.filter(f => f.status === 'under_review').length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Currently reviewing
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Resolved</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {moderationFlags.filter(f => f.status === 'resolved').length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Resolved flags
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={moderationStatusFilter} onValueChange={setModerationStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="dismissed">Dismissed</SelectItem>
                        <SelectItem value="escalated">Escalated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Content Type</label>
                    <Select value={moderationContentTypeFilter} onValueChange={setModerationContentTypeFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="artist">Artist</SelectItem>
                        <SelectItem value="venue">Venue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Select value={moderationCategoryFilter} onValueChange={setModerationCategoryFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Filter by category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="spam">Spam</SelectItem>
                        <SelectItem value="harassment">Harassment</SelectItem>
                        <SelectItem value="inappropriate_content">Inappropriate Content</SelectItem>
                        <SelectItem value="misinformation">Misinformation</SelectItem>
                        <SelectItem value="copyright_violation">Copyright Violation</SelectItem>
                        <SelectItem value="fake_content">Fake Content</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Flags Table */}
            <Card>
              <CardHeader>
                <CardTitle>Moderation Flags</CardTitle>
                <CardDescription>
                  Review and manage user-reported content that needs moderation
                </CardDescription>
              </CardHeader>
              <CardContent>
                {moderationLoading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Loading flags...
                    </p>
                  </div>
                ) : moderationFlags.length === 0 ? (
                  <div className="text-center py-12">
                    <Flag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No flags found
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Content Type</TableHead>
                          <TableHead>Content ID</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Flagged By</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {moderationFlags.map((flag) => (
                          <TableRow key={flag.id}>
                            <TableCell>
                              <Badge variant="outline">
                                {flag.content_type.charAt(0).toUpperCase() + flag.content_type.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {flag.content_id.substring(0, 8)}...
                            </TableCell>
                            <TableCell>
                              {flag.flag_category ? (
                                <Badge variant="secondary">
                                  {flag.flag_category.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {flag.flag_reason}
                            </TableCell>
                            <TableCell>
                              {getModerationStatusBadge(flag.status)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {getUserDisplayName(flag.flagged_by_user_id)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(flag.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReviewModerationFlag(flag)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="news" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Newspaper className="h-5 w-5" />
                  In the News
                </CardTitle>
                <CardDescription>
                  Add links and items for the Media page (/pr). These appear in the &quot;In the News&quot; section.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={addNewsItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      value={newsTitle}
                      onChange={(e) => setNewsTitle(e.target.value)}
                      placeholder="e.g. Synth featured in TechCrunch"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">URL</label>
                    <Input
                      type="url"
                      value={newsUrl}
                      onChange={(e) => setNewsUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Image (optional)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                        className="hidden"
                        id="news-image-upload"
                        onChange={handleNewsImageUpload}
                        disabled={newsImageUploading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={newsImageUploading}
                        onClick={() => document.getElementById('news-image-upload')?.click()}
                      >
                        {newsImageUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Upload image
                      </Button>
                      <span className="text-xs text-muted-foreground">or paste URL:</span>
                      <Input
                        type="url"
                        value={newsImageUrl}
                        onChange={(e) => setNewsImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 min-w-[200px]"
                      />
                      {newsImageUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setNewsImageUrl('')}
                          className="text-muted-foreground"
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    {newsImageUrl && (
                      <div className="mt-2 flex items-center gap-2">
                        <img
                          src={newsImageUrl}
                          alt="Preview"
                          className="h-16 w-16 rounded object-cover border"
                        />
                        <span className="text-xs text-muted-foreground truncate max-w-[240px]">
                          {newsImageUrl}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Source (optional)</label>
                    <Input
                      value={newsSource}
                      onChange={(e) => setNewsSource(e.target.value)}
                      placeholder="e.g. TechCrunch, Substack"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">SEO (optional)</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/30">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">SEO Title</label>
                        <Input
                          value={newsSeoTitle}
                          onChange={(e) => setNewsSeoTitle(e.target.value)}
                          placeholder="e.g. Synth Featured in TechCrunch | Synth"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">SEO Description</label>
                        <Input
                          value={newsSeoDescription}
                          onChange={(e) => setNewsSeoDescription(e.target.value)}
                          placeholder="Discover how Synth is changing live music discovery..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Image Alt Text</label>
                        <Input
                          value={newsImageAlt}
                          onChange={(e) => setNewsImageAlt(e.target.value)}
                          placeholder="Describe the image for accessibility"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Primary Keyword</label>
                        <Input
                          value={newsPrimaryKeyword}
                          onChange={(e) => setNewsPrimaryKeyword(e.target.value)}
                          placeholder="e.g. live music discovery"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium">Keywords (comma-separated)</label>
                        <Input
                          value={newsKeywords}
                          onChange={(e) => setNewsKeywords(e.target.value)}
                          placeholder="e.g. concert app, music social, live shows"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-2 flex items-end">
                    <Button type="submit" disabled={newsSubmitting}>
                      {newsSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add to In the News
                    </Button>
                  </div>
                </form>

                <div className="border-t pt-6">
                  <h4 className="text-sm font-semibold mb-3">Current items (shown on /pr)</h4>
                  {newsLoading ? (
                    <div className="flex items-center gap-2 py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading...</span>
                    </div>
                  ) : newsItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6">No items yet. Add one above.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[64px]">Image</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>URL</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {newsItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt=""
                                  className="h-12 w-12 rounded object-cover border"
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{item.title}</TableCell>
                            <TableCell className="text-muted-foreground">{item.source || '—'}</TableCell>
                            <TableCell>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate block max-w-[200px]"
                              >
                                {item.url}
                              </a>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteNewsItem(item.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="newsletter-builder" className="space-y-6">
            <NewsletterBuilder />
          </TabsContent>

          <TabsContent value="style-guide" className="space-y-6">
            <AdminStyleGuidePanel />
          </TabsContent>

          <TabsContent value="ai-scene-guides" className="space-y-6">
            <AiSceneGuidesAdminPanel />
          </TabsContent>
        </Tabs>

        {/* Daily signups detail (from Daily Users Added chart) */}
        <Dialog open={dayUsersDialogOpen} onOpenChange={setDayUsersDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0 sm:p-0">
            <div className="shrink-0 border-b px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
              <DialogHeader>
                <DialogTitle>New users · {selectedDayLabel || selectedDayKey}</DialogTitle>
                <DialogDescription>
                  Signups for this day with profile socials when available.
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 space-y-3">
              {dayUsersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : daySignupUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No signups on this day.</p>
              ) : (
                daySignupUsers.map((u) => {
                  const ig = u.instagram_handle?.replace(/^@/, '').trim() || '';
                  const snap = u.snapchat_handle?.replace(/^@/, '').trim() || '';
                  const streaming = u.music_streaming_profile?.trim() || '';
                  const streamingUrl = streaming
                    ? /^https?:\/\//i.test(streaming)
                      ? streaming
                      : `https://${streaming}`
                    : '';
                  return (
                    <div key={u.id} className="rounded-md border p-3 flex gap-3">
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover shrink-0 bg-muted"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {u.name || u.username || u.id.slice(0, 8)}
                          </span>
                          {u.account_type ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {u.account_type}
                            </Badge>
                          ) : null}
                        </div>
                        {u.username ? (
                          <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground">
                          Joined {format(new Date(u.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {ig ? (
                            <a
                              href={`https://instagram.com/${ig}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-pink-600 hover:underline"
                            >
                              <Instagram className="h-3.5 w-3.5" />
                              @{ig}
                            </a>
                          ) : null}
                          {snap ? (
                            <a
                              href={`https://snapchat.com/add/${snap}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-yellow-700 hover:underline"
                            >
                              <span className="font-semibold">SC</span>
                              @{snap}
                            </a>
                          ) : null}
                          {streamingUrl ? (
                            <a
                              href={streamingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline"
                            >
                              <Music className="h-3.5 w-3.5" />
                              Streaming
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                          {!ig && !snap && !streamingUrl ? (
                            <span className="text-xs text-muted-foreground">No socials on profile</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
              <Button type="button" variant="outline" onClick={() => setDayUsersDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isOtherAcquisitionModalOpen} onOpenChange={setIsOtherAcquisitionModalOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Other Acquisition Responses</DialogTitle>
              <DialogDescription>
                Full list of entries where users selected &quot;Other&quot;. Newest responses appear first.
              </DialogDescription>
            </DialogHeader>

            {otherAcquisitionModalLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading responses...
              </div>
            ) : otherAcquisitionModalError ? (
              <div className="py-6 text-sm text-destructive text-center">{otherAcquisitionModalError}</div>
            ) : otherAcquisitionModalResponses.length === 0 ? (
              <div className="py-8 text-sm text-muted-foreground text-center">
                No &quot;Other&quot; responses recorded yet.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Created</TableHead>
                      <TableHead>Custom Response</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otherAcquisitionModalResponses.map((response) => (
                      <TableRow key={response.id}>
                        <TableCell className="font-semibold">
                          {new Date(response.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="whitespace-pre-line text-muted-foreground">
                          {response.other_acquisition_source}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOtherAcquisitionModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Moderation Review Dialog */}
        <Dialog open={moderationDialogOpen} onOpenChange={setModerationDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle>Review Moderation Flag</DialogTitle>
              <DialogDescription>
                Review and take action on this flagged content
              </DialogDescription>
            </DialogHeader>
            {selectedFlag && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Content Type</label>
                    <p className="text-sm text-muted-foreground">
                      {selectedFlag.content_type.charAt(0).toUpperCase() + selectedFlag.content_type.slice(1)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Content ID</label>
                    <p className="text-sm text-muted-foreground font-mono">
                      {selectedFlag.content_id}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Flag Category</label>
                    <p className="text-sm text-muted-foreground">
                      {selectedFlag.flag_category ? selectedFlag.flag_category.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Flagged By</label>
                    <p className="text-sm text-muted-foreground">
                      {getUserDisplayName(selectedFlag.flagged_by_user_id)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Flag Reason</label>
                    <p className="text-sm text-muted-foreground">{selectedFlag.flag_reason}</p>
                  </div>
                  {selectedFlag.additional_details && (
                    <div className="col-span-2">
                      <label className="text-sm font-medium">Additional Details</label>
                      <p className="text-sm text-muted-foreground">{selectedFlag.additional_details}</p>
                    </div>
                  )}
                </div>

                {/* Content Preview */}
                {contentLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-sm text-muted-foreground">Loading content...</span>
                  </div>
                ) : contentData ? (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">Content Preview</label>
                      {moderationAction === 'content_edited' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditContentDialogOpen(true)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Edit Content
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      {Object.entries(contentData).slice(0, 10).map(([key, value]) => (
                        <div key={key} className="flex">
                          <span className="font-medium w-32">{key}:</span>
                          <span className="text-muted-foreground flex-1">
                            {formatValue(value)}
                          </span>
                        </div>
                      ))}
                      {Object.keys(contentData).length > 10 && (
                        <p className="text-xs text-muted-foreground">
                          ... and {Object.keys(contentData).length - 10} more fields
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                      Content not found or could not be loaded
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={moderationStatus} onValueChange={setModerationStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="z-[10001]">
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                      <SelectItem value="escalated">Escalated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Resolution Action</label>
                  <Select value={moderationAction} onValueChange={setModerationAction}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent className="z-[10001]">
                      <SelectItem value="no_action">No Action</SelectItem>
                      <SelectItem value="content_removed">Content Removed</SelectItem>
                      <SelectItem value="content_edited">Content Edited</SelectItem>
                      <SelectItem value="user_warned">User Warned</SelectItem>
                      <SelectItem value="user_suspended">User Suspended</SelectItem>
                      <SelectItem value="user_banned">User Banned</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select an action to censor content or warn/suspend users. 
                    {moderationAction === 'content_edited' && ' Click "Edit Content" above to modify the content.'}
                    {moderationAction === 'content_removed' && ' This will permanently delete the content.'}
                    {(moderationAction === 'user_warned' || moderationAction === 'user_suspended' || moderationAction === 'user_banned') && ' This will affect the content owner\'s account status.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Resolution Notes</label>
                  <Textarea
                    value={moderationResolutionNotes}
                    onChange={(e) => setModerationResolutionNotes(e.target.value)}
                    className="min-h-[100px]"
                    placeholder="Add notes about the resolution..."
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setModerationDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateModerationFlag}>
                Update Flag
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Content Dialog */}
        <Dialog open={editContentDialogOpen} onOpenChange={setEditContentDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Content</DialogTitle>
              <DialogDescription>
                Edit the flagged content. Changes will be saved immediately.
              </DialogDescription>
            </DialogHeader>
            {editedContent && selectedFlag && (
              <div className="space-y-4">
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {Object.entries(editedContent).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-sm font-medium">{key}</label>
                      {typeof value === 'string' && value.length > 100 ? (
                        <Textarea
                          value={String(value)}
                          onChange={(e) => setEditedContent({ ...editedContent, [key]: e.target.value })}
                          rows={4}
                          className="font-mono text-xs"
                        />
                      ) : typeof value === 'object' && value !== null ? (
                        <Textarea
                          value={JSON.stringify(value, null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setEditedContent({ ...editedContent, [key]: parsed });
                            } catch {
                              // If invalid JSON, store as string
                              setEditedContent({ ...editedContent, [key]: e.target.value });
                            }
                          }}
                          rows={4}
                          className="font-mono text-xs"
                        />
                      ) : (
                        <Input
                          value={String(value ?? '')}
                          onChange={(e) => setEditedContent({ ...editedContent, [key]: e.target.value })}
                          className="font-mono text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditContentDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveContentEdit}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
