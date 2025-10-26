/**
 * Admin Claim Review Panel
 * For admins to review and approve/reject event claims from creators
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAccountType } from '@/hooks/useAccountType';
import AdminService from '@/services/adminService';
import { Award, CheckCircle, XCircle, Loader2, Calendar, MapPin, ExternalLink } from 'lucide-react';

export function AdminClaimReviewPanel() {
  const { isAdmin, accountInfo, loading: accountLoading } = useAccountType();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [approvedClaims, setApprovedClaims] = useState<any[]>([]);
  const [rejectedClaims, setRejectedClaims] = useState<any[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    console.log('🔍 AdminClaimReviewPanel: useEffect triggered');
    console.log('🔍 AdminClaimReviewPanel: accountLoading:', accountLoading);
    console.log('🔍 AdminClaimReviewPanel: accountInfo:', accountInfo);
    console.log('🔍 AdminClaimReviewPanel: isAdmin() check:', isAdmin());
    
    // Wait for account info to load before checking admin status
    if (accountLoading) {
      console.log('🔍 AdminClaimReviewPanel: Account still loading, waiting...');
      return;
    }
    
    if (isAdmin()) {
      console.log('🔍 AdminClaimReviewPanel: User is admin, calling loadClaims()');
      loadClaims();
    } else {
      console.log('⚠️ AdminClaimReviewPanel: User is NOT admin, skipping loadClaims()');
    }
  }, [accountLoading, accountInfo]); // Now depends on account loading state

  const loadClaims = async () => {
    setLoading(true);
    try {
      const [pending, approved, rejected] = await Promise.all([
        AdminService.getPendingClaims(),
        AdminService.getAllClaims('approved'),
        AdminService.getAllClaims('rejected'),
      ]);
      
      setPendingClaims(pending);
      setApprovedClaims(approved.slice(0, 20));
      setRejectedClaims(rejected.slice(0, 20));
    } catch (error) {
      console.error('Error loading claims:', error);
      toast({
        title: 'Error',
        description: 'Failed to load event claims',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClaim = (claim: any) => {
    setSelectedClaim(claim);
    setAdminNotes('');
  };

  const handleReviewClaim = async (approved: boolean) => {
    if (!selectedClaim) return;

    if (!approved && !adminNotes.trim()) {
      toast({
        title: 'Notes Required',
        description: 'Please provide a reason for rejecting this claim',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      await EventManagementService.reviewEventClaim({
        claim_id: selectedClaim.id,
        approved,
        admin_notes: adminNotes.trim() || undefined,
      });

      toast({
        title: approved ? 'Claim Approved' : 'Claim Rejected',
        description: `Successfully ${approved ? 'approved' : 'rejected'} the event claim`,
      });

      setSelectedClaim(null);
      setAdminNotes('');
      loadClaims(); // Refresh list
    } catch (error) {
      console.error('Error reviewing claim:', error);
      toast({
        title: 'Error',
        description: 'Failed to review claim',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: 'default',
      approved: 'default',
      rejected: 'destructive',
    };

    const colors: Record<string, string> = {
      approved: 'bg-green-100 text-green-800',
    };

    return (
      <Badge variant={variants[status] || 'default'} className={`capitalize ${colors[status] || ''}`}>
        {status}
      </Badge>
    );
  };

  const ClaimCard = ({ claim, onClick, isSelected }: any) => (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'border-purple-500 bg-purple-50' : ''
      }`}
      onClick={() => onClick(claim)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold truncate">{claim.event?.title}</h4>
            <p className="text-sm text-gray-600">{claim.event?.artist_name}</p>
          </div>
          {getStatusBadge(claim.claim_status)}
        </div>

        <div className="space-y-1 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(claim.event?.event_date)}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            <span>{claim.event?.venue_name}</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            Claimed by <span className="font-medium">{claim.claimer?.name}</span>
          </p>
          <p className="text-xs text-gray-500">{formatDate(claim.created_at)}</p>
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
        <h2 className="text-2xl font-bold">Event Claim Reviews</h2>
        <p className="text-gray-600">Review and approve creator event claims</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Claims List */}
        <div className="lg:col-span-1">
          <Tabs defaultValue="pending">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="pending">
                Pending ({pendingClaims.length})
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved
              </TabsTrigger>
              <TabsTrigger value="rejected">
                Rejected
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-3 mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
              ) : pendingClaims.length === 0 ? (
                <Card className="border-dashed border-2 border-gray-200">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Award className="h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Claims</h3>
                    <p className="text-sm text-gray-500 text-center max-w-sm">
                      There are no event claims waiting for review. All creators are happy! 🎵
                    </p>
                  </CardContent>
                </Card>
              ) : (
                pendingClaims.map((claim) => (
                  <ClaimCard
                    key={claim.id}
                    claim={claim}
                    onClick={handleSelectClaim}
                    isSelected={selectedClaim?.id === claim.id}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="approved" className="space-y-3 mt-4">
              {approvedClaims.length === 0 ? (
                <Card className="border-dashed border-2 border-gray-200">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Award className="h-12 w-12 text-green-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Approved Claims</h3>
                    <p className="text-sm text-gray-500 text-center max-w-sm">
                      No event claims have been approved yet. This is where successful claim approvals will appear.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                approvedClaims.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} onClick={handleSelectClaim} isSelected={false} />
                ))
              )}
            </TabsContent>

            <TabsContent value="rejected" className="space-y-3 mt-4">
              {rejectedClaims.length === 0 ? (
                <Card className="border-dashed border-2 border-gray-200">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Award className="h-12 w-12 text-red-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Rejected Claims</h3>
                    <p className="text-sm text-gray-500 text-center max-w-sm">
                      No event claims have been rejected yet. This is where rejected claims will appear.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                rejectedClaims.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} onClick={handleSelectClaim} isSelected={false} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Claim Details & Review */}
        <div className="lg:col-span-2">
          {selectedClaim ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-purple-600" />
                  Review Event Claim
                </CardTitle>
                <CardDescription>Verify the creator's claim to this event</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Event Details */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex gap-4">
                    {selectedClaim.event?.poster_image_url && (
                      <img
                        src={selectedClaim.event.poster_image_url}
                        alt={selectedClaim.event.title}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">{selectedClaim.event?.title}</h3>
                      <div className="space-y-1 text-sm text-gray-700">
                        <p><strong>Artist:</strong> {selectedClaim.event?.artist_name}</p>
                        <p><strong>Venue:</strong> {selectedClaim.event?.venue_name}</p>
                        <p><strong>Date:</strong> {formatDate(selectedClaim.event?.event_date)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Claimer Info */}
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <h4 className="font-semibold mb-2">Claimed By</h4>
                  <div className="flex items-center gap-3">
                    {selectedClaim.claimer?.avatar_url ? (
                      <img
                        src={selectedClaim.claimer.avatar_url}
                        alt={selectedClaim.claimer.name}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center">
                        <span className="text-purple-600 font-semibold">
                          {selectedClaim.claimer?.name?.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{selectedClaim.claimer?.name}</p>
                      <p className="text-xs text-gray-600 capitalize">
                        {selectedClaim.claimer?.account_type || 'User'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Claim Reason */}
                <div>
                  <Label className="text-sm font-semibold">Claim Reason</Label>
                  <div className="mt-1 p-3 bg-gray-50 rounded border border-gray-200">
                    <p className="text-sm">{selectedClaim.claim_reason}</p>
                  </div>
                </div>

                {/* Verification Proof */}
                {selectedClaim.verification_proof && (
                  <div>
                    <Label className="text-sm font-semibold">Verification Link</Label>
                    <a
                      href={selectedClaim.verification_proof}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-2 text-sm text-blue-600 hover:underline"
                    >
                      {selectedClaim.verification_proof}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {/* Admin Notes */}
                {selectedClaim.claim_status === 'pending' ? (
                  <div className="space-y-2">
                    <Label htmlFor="admin_notes">
                      Admin Notes {selectedClaim.claim_status === 'pending' ? '(Required for rejection)' : ''}
                    </Label>
                    <Textarea
                      id="admin_notes"
                      placeholder="Add notes about your decision..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      disabled={isProcessing}
                      rows={3}
                    />
                  </div>
                ) : (
                  selectedClaim.admin_notes && (
                    <div>
                      <Label className="text-sm font-semibold">Admin Notes</Label>
                      <div className="mt-1 p-3 bg-gray-50 rounded border border-gray-200">
                        <p className="text-sm">{selectedClaim.admin_notes}</p>
                      </div>
                    </div>
                  )
                )}

                {/* Actions */}
                {selectedClaim.claim_status === 'pending' ? (
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="default"
                      onClick={() => handleReviewClaim(true)}
                      disabled={isProcessing}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {isProcessing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Approve Claim
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handleReviewClaim(false)}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject Claim
                    </Button>
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-lg p-4">
                    <p className="font-semibold">This claim has been reviewed</p>
                    <p className="text-sm text-gray-700 mt-1">
                      Status: <span className="font-medium capitalize">{selectedClaim.claim_status}</span>
                    </p>
                    {selectedClaim.reviewed_at && (
                      <p className="text-xs text-gray-600 mt-1">
                        Reviewed on {formatDate(selectedClaim.reviewed_at)}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Award className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg font-medium">Select a claim to review</p>
                <p className="text-sm text-gray-500 mt-1">
                  Choose a claim from the list to begin review
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminClaimReviewPanel;

