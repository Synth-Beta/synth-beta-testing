import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Clock, User, Building2, Music } from 'lucide-react';

interface UpgradeRequest {
  id: string;
  user_id: string;
  requested_account_type: 'creator' | 'business';
  business_info: any;
  status: 'pending' | 'approved' | 'denied';
  denial_reason?: string;
  created_at: string;
  user_profile?: {
    name: string;
    email: string;
  };
}

export const AdminAccountUpgradePanel = () => {
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [denialReason, setDenialReason] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('account_upgrade_requests')
        .select(`
          *,
          user_profile:profiles!inner(name, user_id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get user emails
      const requestsWithEmails = await Promise.all(
        (data || []).map(async (request: any) => {
          const { data: userData } = await supabase.auth.admin.getUserById(request.user_id);
          return {
            ...request,
            user_profile: {
              name: request.user_profile?.name || 'Unknown',
              email: userData?.user?.email || 'No email',
            },
          };
        })
      );

      setRequests(requestsWithEmails as UpgradeRequest[]);
    } catch (error) {
      console.error('Error loading upgrade requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load account upgrade requests',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const { error } = await supabase.rpc('admin_review_upgrade_request', {
        p_request_id: requestId,
        p_status: 'approved',
      });

      if (error) throw error;

      toast({
        title: 'Request Approved',
        description: 'The account has been upgraded successfully.',
      });

      loadRequests();
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeny = async (requestId: string) => {
    const reason = denialReason[requestId]?.trim();
    if (!reason) {
      toast({
        title: 'Denial Reason Required',
        description: 'Please provide a reason for denying the request.',
        variant: 'destructive',
      });
      return;
    }

    setProcessingId(requestId);
    try {
      const { error } = await supabase.rpc('admin_review_upgrade_request', {
        p_request_id: requestId,
        p_status: 'denied',
        p_denial_reason: reason,
      });

      if (error) throw error;

      toast({
        title: 'Request Denied',
        description: 'The upgrade request has been denied.',
      });

      setDenialReason({ ...denialReason, [requestId]: '' });
      loadRequests();
    } catch (error: any) {
      console.error('Error denying request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to deny request',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case 'denied':
        return (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <XCircle className="w-3 h-3 mr-1" />
            Denied
          </Badge>
        );
      default:
        return null;
    }
  };

  const getAccountTypeIcon = (type: string) => {
    switch (type) {
      case 'creator':
        return <Music className="w-5 h-5 text-primary" />;
      case 'business':
        return <Building2 className="w-5 h-5 text-primary" />;
      default:
        return <User className="w-5 h-5 text-primary" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Account Upgrade Requests</h2>
        <Button onClick={loadRequests} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No account upgrade requests found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getAccountTypeIcon(request.requested_account_type)}
                    <div>
                      <CardTitle className="text-lg">
                        {request.user_profile?.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {request.user_profile?.email}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Requested:{' '}
                        <span className="font-semibold capitalize">
                          {request.requested_account_type}
                        </span>{' '}
                        account
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Business Info */}
                {request.business_info && Object.keys(request.business_info).length > 0 && (
                  <div className="bg-muted rounded-lg p-4 space-y-2">
                    <h4 className="font-semibold text-sm">Business Information</h4>
                    {request.business_info.company_name && (
                      <p className="text-sm">
                        <span className="font-medium">Company:</span>{' '}
                        {request.business_info.company_name}
                      </p>
                    )}
                    {request.business_info.website && (
                      <p className="text-sm">
                        <span className="font-medium">Website:</span>{' '}
                        <a
                          href={request.business_info.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {request.business_info.website}
                        </a>
                      </p>
                    )}
                    {request.business_info.description && (
                      <p className="text-sm">
                        <span className="font-medium">Description:</span>{' '}
                        {request.business_info.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Denial Reason if denied */}
                {request.status === 'denied' && request.denial_reason && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <h4 className="font-semibold text-sm text-red-900 dark:text-red-100 mb-1">
                      Denial Reason
                    </h4>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {request.denial_reason}
                    </p>
                  </div>
                )}

                {/* Actions for pending requests */}
                {request.status === 'pending' && (
                  <div className="space-y-3 pt-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Denial Reason (optional, required if denying)
                      </label>
                      <Textarea
                        placeholder="Provide a reason if you're denying this request..."
                        value={denialReason[request.id] || ''}
                        onChange={(e) =>
                          setDenialReason({
                            ...denialReason,
                            [request.id]: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => handleApprove(request.id)}
                        disabled={processingId === request.id}
                        className="flex-1"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleDeny(request.id)}
                        disabled={processingId === request.id}
                        variant="destructive"
                        className="flex-1"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Deny
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

