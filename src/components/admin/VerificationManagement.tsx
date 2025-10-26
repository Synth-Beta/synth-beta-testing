import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, RefreshCw, TrendingUp, Search, Filter, Download } from 'lucide-react';
import { VerificationService } from '@/services/verificationService';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface UserNearVerification {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  account_type: string;
  verified: boolean;
  trust_score: number;
  verification_criteria_met: any;
  created_at: string;
}

interface VerificationManagementProps {
  currentUserId: string;
}

export function VerificationManagement({ currentUserId }: VerificationManagementProps) {
  const [users, setUsers] = useState<UserNearVerification[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserNearVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'unverified'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score');
  const { toast } = useToast();

  useEffect(() => {
    fetchUsersNearVerification();
  }, []);

  // Filter and sort users
  useEffect(() => {
    let filtered = [...users];

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(user =>
        filterStatus === 'verified' ? user.verified : !user.verified
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'score') {
        return (b.trust_score || 0) - (a.trust_score || 0);
      } else {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    setFilteredUsers(filtered);
  }, [users, searchQuery, filterStatus, sortBy]);

  const fetchUsersNearVerification = async () => {
    try {
      setLoading(true);
      const data = await VerificationService.getUsersNearVerification(50);
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users near verification.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyUser = async (userId: string, verify: boolean) => {
    try {
      setActionLoading(userId);
      await VerificationService.manuallyVerifyUser(userId, currentUserId, verify);
      
      toast({
        title: 'Success',
        description: `User ${verify ? 'verified' : 'unverified'} successfully.`,
      });

      // Refresh the list
      await fetchUsersNearVerification();
    } catch (error) {
      console.error('Error verifying user:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user verification status.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getCriteriaMet = (criteria: any): number => {
    if (!criteria) return 0;
    return Object.values(criteria).filter(Boolean).length;
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Name', 'Trust Score', 'Criteria Met', 'Verified', 'Account Age', 'Created At'].join(','),
      ...filteredUsers.map(user => [
        user.name,
        user.trust_score || 0,
        `${getCriteriaMet(user.verification_criteria_met)}/8`,
        user.verified ? 'Yes' : 'No',
        Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)),
        new Date(user.created_at).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-stats-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verification Management</CardTitle>
          <CardDescription>Manage user verification requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Verification Management
              </CardTitle>
              <CardDescription>
                Users close to verification threshold (40%+ trust score)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={filteredUsers.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchUsersNearVerification}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Trust Score</SelectItem>
                <SelectItem value="date">Join Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>
                {users.length === 0
                  ? 'No users near verification threshold'
                  : 'No users match your filters'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUsers.map((user) => {
                const criteriaMet = getCriteriaMet(user.verification_criteria_met);
                const totalCriteria = 8;
                const isProcessing = actionLoading === user.user_id;

                return (
                  <div
                    key={user.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    {/* Avatar */}
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold truncate">{user.name}</h4>
                        {user.verified && (
                          <Badge variant="default" className="text-xs">
                            Verified
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {user.account_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                        <span>Trust Score: {user.trust_score}%</span>
                        <span>Criteria: {criteriaMet}/{totalCriteria}</span>
                        <span>
                          Member since {format(new Date(user.created_at), 'MMM yyyy')}
                        </span>
                      </div>

                      {/* Criteria Pills */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {user.verification_criteria_met && Object.entries(user.verification_criteria_met).map(([key, value]) => (
                          value ? (
                            <span
                              key={key}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-700"
                            >
                              {key}
                            </span>
                          ) : null
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {user.verified ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerifyUser(user.user_id, false)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 mr-2" />
                              Unverify
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleVerifyUser(user.user_id, true)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Verify
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{users.length}</div>
              <div className="text-sm text-muted-foreground mt-1">Near Verification</div>
              <div className="text-xs text-gray-500 mt-1">40%+ trust score</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {users.filter(u => u.verified).length}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Verified</div>
              <div className="text-xs text-gray-500 mt-1">
                {users.length > 0 
                  ? `${Math.round((users.filter(u => u.verified).length / users.length) * 100)}% conversion`
                  : '0% conversion'}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-600">
                {users.filter(u => !u.verified).length}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Pending Review</div>
              <div className="text-xs text-gray-500 mt-1">Awaiting criteria</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {Math.round(users.reduce((acc, u) => acc + u.trust_score, 0) / users.length) || 0}%
              </div>
              <div className="text-sm text-muted-foreground mt-1">Avg Trust Score</div>
              <div className="text-xs text-gray-500 mt-1">
                Range: {Math.min(...users.map(u => u.trust_score))}% - {Math.max(...users.map(u => u.trust_score))}%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

