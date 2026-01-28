import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useAccountType } from '@/hooks/useAccountType';
import { AdminService } from '@/services/adminService';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Users, Search, Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import Auth from './Auth';

interface UserData {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  music_streaming_profile: string | null;
  gender: string | null;
  birthday: string | null;
  account_type: 'user' | 'creator' | 'business' | 'admin';
  verified: boolean;
  verification_level: 'none' | 'email' | 'phone' | 'identity' | 'business';
  subscription_tier: 'free' | 'premium' | 'professional' | 'enterprise';
  subscription_expires_at: string | null;
  subscription_started_at: string | null;
  is_public_profile: boolean;
  similar_users_notifications: boolean;
  trust_score: number | null;
  moderation_status: 'good_standing' | 'warned' | 'restricted' | 'suspended' | 'banned';
  warning_count: number;
  last_warned_at: string | null;
  suspended_until: string | null;
  ban_reason: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
  location_city: string | null;
  username: string | null;
  latitude: number | null;
  longitude: number | null;
  location_state: string | null;
  onboarding_completed: boolean;
  onboarding_skipped: boolean;
  tour_completed: boolean;
}

export default function Admin() {
  const { user, loading: authLoading, sessionExpired } = useAuth();
  const { accountInfo, loading: accountLoading, isAdmin } = useAccountType();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedAccountType, setSelectedAccountType] = useState<string>('');
  const usersPerPage = 50;

  const handleAuthSuccess = () => {
    // After successful auth, check if user is admin
    // The component will re-render and check admin status
  };

  // Fetch users when page or filters change
  useEffect(() => {
    if (user && isAdmin()) {
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentPage, selectedAccountType]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      // Calculate offset
      const offset = (currentPage - 1) * usersPerPage;

      // Build query - use users_complete view to include verification and subscription data
      let query = supabase
        .from('users_complete')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + usersPerPage - 1);

      // Filter by account type if selected
      if (selectedAccountType) {
        query = query.eq('account_type', selectedAccountType);
      }

      // Apply search filter if search term exists
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%,instagram_handle.ilike.%${searchTerm}%`);
      }

      const { data, error: fetchError, count } = await query;

      if (fetchError) throw fetchError;

      setUsers(data || []);
      setTotalUsers(count || 0);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    // Reset to page 1 and fetch with current searchTerm
    const fetchWithPage1 = async () => {
      try {
        setLoading(true);
        setError(null);

        // Build query with page 1 - use users_complete view to include verification and subscription data
        let query = supabase
          .from('users_complete')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(0, usersPerPage - 1);

        // Filter by account type if selected
        if (selectedAccountType) {
          query = query.eq('account_type', selectedAccountType);
        }

        // Apply search filter if search term exists
        if (searchTerm) {
          query = query.or(`name.ilike.%${searchTerm}%,username.ilike.%${searchTerm}%,instagram_handle.ilike.%${searchTerm}%`);
        }

        const { data, error: fetchError, count } = await query;

        if (fetchError) throw fetchError;

        setUsers(data || []);
        setTotalUsers(count || 0);
        setCurrentPage(1);
      } catch (err: any) {
        console.error('Error fetching users:', err);
        setError(err.message || 'Failed to fetch users');
      } finally {
        setLoading(false);
      }
    };

    fetchWithPage1();
  };

  const handleExport = () => {
    // Export all users to CSV
    const headers = [
      'ID', 'User ID', 'Name', 'Username', 'Email', 'Account Type', 'Verified', 
      'Subscription Tier', 'Moderation Status', 'Location', 'Created At', 'Last Active'
    ];
    
    const rows = users.map(u => [
      u.id,
      u.user_id,
      u.name || '',
      u.username || '',
      '', // Email would need to come from auth.users
      u.account_type,
      u.verified ? 'Yes' : 'No',
      u.subscription_tier,
      u.moderation_status,
      `${u.location_city || ''}${u.location_state ? ', ' + u.location_state : ''}`,
      new Date(u.created_at).toLocaleDateString(),
      u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : 'Never'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(totalUsers / usersPerPage);

  // Show loading state while checking auth
  if (authLoading || accountLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-pink-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated or session expired
  if (!user || sessionExpired) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  // Show access denied if not admin
  if (!isAdmin()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <Shield className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">
            You need administrator privileges to access this page.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Shield className="w-8 h-8 text-pink-600" />
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              </div>
              <p className="text-gray-600">
                Manage users and monitor platform activity
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchUsers}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Total Users</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalUsers.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-gray-600">Verified Users</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {users.filter(u => u.verified).length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-gray-600">Active Users</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {users.filter(u => {
                if (!u.last_active_at) return false;
                const lastActive = new Date(u.last_active_at);
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                return lastActive > sevenDaysAgo;
              }).length}
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-red-600" />
              <span className="text-sm font-medium text-gray-600">Moderation Issues</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {users.filter(u => u.moderation_status !== 'good_standing').length}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="admin-user-search"
                  name="admin_user_search"
                  type="text"
                  placeholder="Search by name, username, or Instagram handle..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  autoComplete="off"
                  aria-label="Search users by name, username, or Instagram handle"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={selectedAccountType}
              onChange={(e) => {
                setSelectedAccountType(e.target.value);
                setCurrentPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            >
              <option value="">All Account Types</option>
              <option value="user">User</option>
              <option value="creator">Creator</option>
              <option value="business">Business</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
            >
              Search
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-pink-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No users found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subscription</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((userData) => (
                      <tr key={userData.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              {userData.avatar_url ? (
                                <img
                                  className="h-10 w-10 rounded-full"
                                  src={userData.avatar_url}
                                  alt={userData.name}
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center">
                                  <span className="text-pink-600 font-medium">
                                    {userData.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{userData.name}</div>
                              <div className="text-sm text-gray-500">
                                {userData.username && `@${userData.username}`}
                                {userData.instagram_handle && ` • ${userData.instagram_handle}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            userData.account_type === 'admin' ? 'bg-red-100 text-red-800' :
                            userData.account_type === 'creator' ? 'bg-purple-100 text-purple-800' :
                            userData.account_type === 'business' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {userData.account_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              userData.moderation_status === 'good_standing' ? 'bg-green-100 text-green-800' :
                              userData.moderation_status === 'warned' ? 'bg-yellow-100 text-yellow-800' :
                              userData.moderation_status === 'restricted' ? 'bg-orange-100 text-orange-800' :
                              userData.moderation_status === 'suspended' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {userData.moderation_status.replace('_', ' ')}
                            </span>
                            {userData.verified && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Verified
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            userData.subscription_tier === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                            userData.subscription_tier === 'professional' ? 'bg-blue-100 text-blue-800' :
                            userData.subscription_tier === 'premium' ? 'bg-pink-100 text-pink-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {userData.subscription_tier}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {userData.location_city || 'N/A'}
                          {userData.location_state && `, ${userData.location_state}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(userData.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {userData.last_active_at 
                            ? new Date(userData.last_active_at).toLocaleDateString()
                            : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {(currentPage - 1) * usersPerPage + 1} to {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-4 py-2 text-sm text-gray-700">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

