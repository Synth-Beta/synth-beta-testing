/**
 * Admin Moderation Panel
 * For admins to review and moderate flagged content
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAccountType } from '@/hooks/useAccountType';
import AdminService from '@/services/adminService';
import ContentModerationService, { FLAG_REASONS } from '@/services/contentModerationService';
import { supabase } from '@/integrations/supabase/client';
import { Flag, Trash2, AlertTriangle, X, Loader2, ExternalLink, Eye } from 'lucide-react';

export function AdminModerationPanel() {
  const { isAdmin, accountInfo, loading: accountLoading } = useAccountType();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [pendingFlags, setPendingFlags] = useState<any[]>([]);
  const [reviewedFlags, setReviewedFlags] = useState<any[]>([]);
  const [selectedFlag, setSelectedFlag] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [contentPreview, setContentPreview] = useState<any>(null);

  useEffect(() => {
    console.log('🔍 AdminModerationPanel: useEffect triggered');
    console.log('🔍 AdminModerationPanel: accountLoading:', accountLoading);
    console.log('🔍 AdminModerationPanel: accountInfo:', accountInfo);
    console.log('🔍 AdminModerationPanel: isAdmin() check:', isAdmin());
    
    // Wait for account info to load before checking admin status
    if (accountLoading) {
      console.log('🔍 AdminModerationPanel: Account still loading, waiting...');
      return;
    }
    
    if (isAdmin()) {
      console.log('🔍 AdminModerationPanel: User is admin, calling loadFlags()');
      loadFlags();
    } else {
      console.log('⚠️ AdminModerationPanel: User is NOT admin, skipping loadFlags()');
    }
  }, [accountLoading, accountInfo]); // Now depends on account loading state

  const loadFlags = async () => {
    setLoading(true);
    try {
      console.log('🔍 AdminModerationPanel: Loading flags...');
      console.log('🔍 AdminModerationPanel: isAdmin() result:', isAdmin());
      
      // First get all flags to see what statuses exist
      const { data: allFlags, error: allFlagsError } = await (supabase as any)
        .from('moderation_flags')
        .select('id, flag_status, flag_reason, created_at')
        .order('created_at', { ascending: false });
      
      console.log('🔍 AdminModerationPanel: All flags in database:', allFlags);
      console.log('🔍 AdminModerationPanel: All flags error:', allFlagsError);
      
      // Group flags by status
      if (allFlags && Array.isArray(allFlags)) {
        const statusGroups = allFlags.reduce((acc: any, flag: any) => {
          acc[flag.flag_status] = (acc[flag.flag_status] || 0) + 1;
          return acc;
        }, {});
        console.log('🔍 AdminModerationPanel: Flags by status:', statusGroups);
      }

      // Get pending flags - try direct query first
      console.log('🔍 AdminModerationPanel: Trying direct pending flags query...');
      const { data: pendingFlags, error: pendingError } = await (supabase as any)
        .from('moderation_flags')
        .select('*')
        .eq('flag_status', 'pending')
        .order('created_at', { ascending: true });
      
      console.log('🔍 AdminModerationPanel: Direct pending flags query result:', pendingFlags);
      console.log('🔍 AdminModerationPanel: Direct pending flags query error:', pendingError);
      
      // Fetch flagger profiles for pending flags
      let pending = pendingFlags || [];
      if (pending.length > 0) {
        const userIds = pending.map((f: any) => f.flagged_by_user_id);
        console.log('🔍 AdminModerationPanel: Fetching profiles for pending flags user IDs:', userIds);
        
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('user_id, name, avatar_url')
          .in('user_id', userIds);
        
        console.log('🔍 AdminModerationPanel: Profiles for pending flags:', profiles);
        
        // Merge profiles into flags
        pending = pending.map((flag: any) => ({
          ...flag,
          flagger: profiles?.find(p => p.user_id === flag.flagged_by_user_id)
        }));
      }
      
      // Get all non-pending flags (reviewed, dismissed, etc.) - without join first
      const { data: reviewedFlags, error: reviewedError } = await (supabase as any)
        .from('moderation_flags')
        .select('*')
        .neq('flag_status', 'pending')
        .order('reviewed_at', { ascending: false });
      
      console.log('🔍 AdminModerationPanel: Reviewed flags from DB:', reviewedFlags);
      console.log('🔍 AdminModerationPanel: Reviewed flags error:', reviewedError);
      
      // Fetch flagger profiles separately if we have flags
      let reviewed = reviewedFlags || [];
      if (reviewed.length > 0) {
        const userIds = reviewed.map((f: any) => f.flagged_by_user_id);
        console.log('🔍 AdminModerationPanel: Fetching profiles for reviewed flags user IDs:', userIds);
        
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('user_id, name, avatar_url')
          .in('user_id', userIds);
        
        console.log('🔍 AdminModerationPanel: Profiles for reviewed flags:', profiles);
        
        // Merge profiles into flags
        reviewed = reviewed.map((flag: any) => ({
          ...flag,
          flagger: profiles?.find(p => p.user_id === flag.flagged_by_user_id)
        }));
      }
      
      console.log('🔍 AdminModerationPanel: Raw pending flags response:', pending);
      console.log('🔍 AdminModerationPanel: Raw reviewed flags response:', reviewed);
      console.log('🔍 AdminModerationPanel: Pending flags type:', typeof pending);
      console.log('🔍 AdminModerationPanel: Pending flags is array:', Array.isArray(pending));
      console.log('🔍 AdminModerationPanel: Pending flags length:', pending?.length || 'undefined');
      console.log('🔍 AdminModerationPanel: Reviewed flags length:', reviewed?.length || 'undefined');
      
      // Log each individual flag
      if (pending && Array.isArray(pending)) {
        console.log('🔍 AdminModerationPanel: Individual pending flags:');
        pending.forEach((flag, index) => {
          console.log(`  [${index}] Flag ID: ${flag.id}, Status: ${flag.flag_status}, Reason: ${flag.flag_reason}`);
        });
      }
      
      setPendingFlags(pending);
      setReviewedFlags(reviewed.slice(0, 20)); // Show last 20
      
      console.log('🔍 AdminModerationPanel: State updated - pendingFlags.length:', pending?.length || 0);
      console.log('🔍 AdminModerationPanel: State updated - reviewedFlags.length:', reviewed?.slice(0, 20)?.length || 0);
    } catch (error) {
      console.error('❌ AdminModerationPanel: Error loading flags:', error);
      console.error('❌ AdminModerationPanel: Error details:', JSON.stringify(error, null, 2));
      toast({
        title: 'Error',
        description: 'Failed to load moderation flags',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      console.log('🔍 AdminModerationPanel: Loading completed');
    }
  };

  const loadContentPreview = async (flag: any) => {
    try {
      const content = await ContentModerationService.getFlaggedContentDetails(
        flag.content_type,
        flag.content_id
      );
      setContentPreview(content);
    } catch (error) {
      console.error('Error loading content preview:', error);
      setContentPreview(null);
    }
  };

  const handleSelectFlag = (flag: any) => {
    setSelectedFlag(flag);
    setReviewNotes('');
    loadContentPreview(flag);
  };

  const handleModerate = async (action: 'remove' | 'warn' | 'dismiss') => {
    if (!selectedFlag) return;

    setIsProcessing(true);
    try {
      await ContentModerationService.moderateContent(
        selectedFlag.id,
        action,
        reviewNotes.trim() || undefined,
        true
      );

      const actionText = action === 'remove' ? 'removed' : action === 'warn' ? 'warned about' : 'dismissed';
      toast({
        title: 'Content Moderated',
        description: `Successfully ${actionText} the flagged content`,
      });

      setSelectedFlag(null);
      setContentPreview(null);
      setReviewNotes('');
      loadFlags(); // Refresh list
    } catch (error) {
      console.error('Error moderating content:', error);
      toast({
        title: 'Error',
        description: 'Failed to moderate content',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: 'default',
      resolved: 'secondary',
      dismissed: 'outline',
    };

    return (
      <Badge variant={variants[status] || 'default'} className="capitalize">
        {status}
      </Badge>
    );
  };

  const FlagCard = ({ flag, onClick, isSelected }: any) => (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'border-purple-500 bg-purple-50' : ''
      }`}
      onClick={() => onClick(flag)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">
                {FLAG_REASONS[flag.flag_reason as keyof typeof FLAG_REASONS]?.icon || '🚩'}
              </span>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {FLAG_REASONS[flag.flag_reason as keyof typeof FLAG_REASONS]?.label || flag.flag_reason}
                </p>
                <p className="text-xs text-gray-600 capitalize">
                  {ContentModerationService.getContentTypeDisplayName(flag.content_type)}
                </p>
              </div>
            </div>

            {flag.flag_details && (
              <p className="text-sm text-gray-700 line-clamp-2 mb-2">
                "{flag.flag_details}"
              </p>
            )}

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>By {flag.flagger?.name || 'Unknown'}</span>
              <span>•</span>
              <span>{formatDate(flag.created_at)}</span>
            </div>
          </div>

          {getStatusBadge(flag.flag_status)}
        </div>
      </CardContent>
    </Card>
  );

  if (!isAdmin()) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Content Moderation</h2>
        <p className="text-gray-600">Review and moderate flagged content</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flags List */}
        <div className="lg:col-span-1">
          <Tabs defaultValue="pending">
            <TabsList className="w-full">
              <TabsTrigger value="pending" className="flex-1">
                Pending ({pendingFlags.length})
              </TabsTrigger>
              <TabsTrigger value="reviewed" className="flex-1">
                Reviewed
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-3 mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
              ) : pendingFlags.length === 0 ? (
                <Card className="border-dashed border-2 border-gray-200">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Flag className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Flags</h3>
                    <p className="text-sm text-gray-500 text-center max-w-sm">
                      There are no content flags waiting for review. Great job keeping the community safe! 🎉
                    </p>
                  </CardContent>
                </Card>
              ) : (
                pendingFlags.map((flag) => (
                  <FlagCard
                    key={flag.id}
                    flag={flag}
                    onClick={handleSelectFlag}
                    isSelected={selectedFlag?.id === flag.id}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="reviewed" className="space-y-3 mt-4">
              {reviewedFlags.length === 0 ? (
                <Card className="border-dashed border-2 border-gray-200">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Flag className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Reviewed Flags</h3>
                    <p className="text-sm text-gray-500 text-center max-w-sm">
                      No content flags have been reviewed yet. This is where completed moderation actions will appear.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                reviewedFlags.map((flag) => (
                  <FlagCard key={flag.id} flag={flag} onClick={handleSelectFlag} isSelected={false} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Flag Details & Actions */}
        <div className="lg:col-span-2">
          {selectedFlag ? (
            <Card>
              <CardHeader>
                <CardTitle>Review Flagged Content</CardTitle>
                <CardDescription>
                  {FLAG_REASONS[selectedFlag.flag_reason as keyof typeof FLAG_REASONS]?.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Flag Details */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Flag className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-red-900">
                        {FLAG_REASONS[selectedFlag.flag_reason as keyof typeof FLAG_REASONS]?.label}
                      </p>
                      <p className="text-sm text-red-800 mt-1">{selectedFlag.flag_details}</p>
                      <p className="text-xs text-red-700 mt-2">
                        Reported by {selectedFlag.flagger?.name} on {formatDate(selectedFlag.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Content Preview */}
                {contentPreview && (
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Content Preview
                    </h4>
                    <div className="text-sm space-y-2">
                      {selectedFlag.content_type === 'event' && (
                        <>
                          <p><strong>Title:</strong> {contentPreview.title}</p>
                          <p><strong>Artist:</strong> {contentPreview.artist_name}</p>
                          <p><strong>Description:</strong> {contentPreview.description}</p>
                        </>
                      )}
                      {selectedFlag.content_type === 'review' && (
                        <>
                          <p><strong>By:</strong> {contentPreview.user?.name}</p>
                          <p><strong>Rating:</strong> {contentPreview.rating}/5</p>
                          <p><strong>Review:</strong> {contentPreview.review}</p>
                        </>
                      )}
                      {selectedFlag.content_type === 'comment' && (
                        <>
                          <p><strong>By:</strong> {contentPreview.user?.name}</p>
                          <p><strong>Comment:</strong> {contentPreview.comment}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Review Notes */}
                {selectedFlag.flag_status === 'pending' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Review Notes (Optional)</label>
                    <Textarea
                      placeholder="Add notes about your decision..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      disabled={isProcessing}
                      rows={3}
                    />
                  </div>
                )}

                {/* Actions */}
                {selectedFlag.flag_status === 'pending' ? (
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      onClick={() => handleModerate('remove')}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Remove Content
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleModerate('warn')}
                      disabled={isProcessing}
                      className="flex-1 border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Warn User
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleModerate('dismiss')}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Dismiss
                    </Button>
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-lg p-4">
                    <p className="font-semibold">This flag has been reviewed</p>
                    {selectedFlag.action_taken && (
                      <p className="text-sm text-gray-700 mt-1">
                        Action taken: <span className="font-medium capitalize">{selectedFlag.action_taken}</span>
                      </p>
                    )}
                    {selectedFlag.review_notes && (
                      <p className="text-sm text-gray-600 mt-2">{selectedFlag.review_notes}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Flag className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg font-medium">Select a flag to review</p>
                <p className="text-sm text-gray-500 mt-1">
                  Choose a flagged content item from the list to begin moderation
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminModerationPanel;

