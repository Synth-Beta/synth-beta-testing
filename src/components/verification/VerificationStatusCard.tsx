import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Circle, RefreshCw, Sparkles } from 'lucide-react';
import { useTrustScoreBreakdown } from '@/hooks/useVerification';
import { getCriterionDescription } from '@/utils/verificationUtils';
import { VerificationService } from '@/services/verificationService';
import { useToast } from '@/hooks/use-toast';

interface VerificationStatusCardProps {
  userId: string;
  accountType: 'user' | 'creator' | 'business' | 'admin';
  verified: boolean;
}

export function VerificationStatusCard({
  userId,
  accountType,
  verified,
}: VerificationStatusCardProps) {
  const { breakdown, loading, error } = useTrustScoreBreakdown(userId);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  // For non-user accounts, show verified card if applicable, otherwise show a placeholder card
  if (accountType !== 'user') {
    if (verified) {
      return (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <CardTitle>Verified Account</CardTitle>
            </div>
            <CardDescription>
              Your {accountType} account is verified and trusted by the Synth community.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verification Status</CardTitle>
          <CardDescription>
            Verification details are not available for this account type.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await VerificationService.refreshVerificationStatus(userId);
      toast({
        title: 'Status Updated',
        description: 'Your verification status has been refreshed.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to refresh verification status.',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verification Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !breakdown || !userId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verification Status</CardTitle>
          <CardDescription>
            Verification details are currently unavailable.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const progressPercentage = (breakdown.criteriaMet / breakdown.totalCriteria) * 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Verification Status
              {verified && <CheckCircle className="w-5 h-5 text-green-500" />}
            </CardTitle>
            <CardDescription>
              {verified
                ? 'You are a verified member of the Synth community'
                : 'Complete criteria to earn verification'}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trust Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Trust Score</span>
            <span className="text-2xl font-bold text-primary">{breakdown.score}%</span>
          </div>
          <div 
            className="w-full overflow-hidden"
            style={{
              height: '8px',
              backgroundColor: 'var(--neutral-100)',
              borderRadius: 'var(--radius-corner, 10px)'
            }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{ 
                width: `${progressPercentage}%`,
                background: 'var(--gradient-brand)',
                borderRadius: progressPercentage >= 100 
                  ? 'var(--radius-corner, 10px)' 
                  : 'var(--radius-corner, 10px) 0 0 var(--radius-corner, 10px)',
                minWidth: progressPercentage > 0 ? '4px' : '0'
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {breakdown.criteriaMet} of {breakdown.totalCriteria} criteria met
            {!verified && breakdown.criteriaMet < 4 && (
              <> • {4 - breakdown.criteriaMet} more needed for verification</>
            )}
          </p>
        </div>

        {/* Verification Badge */}
        {verified && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h4 className="font-semibold text-green-900">Verified User</h4>
                <p className="text-sm text-green-700">
                  You have earned the trusted user badge
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Criteria List */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Verification Criteria</h4>
          {Object.entries(breakdown.criteria).map(([key, met]) => {
            const criterion = getCriterionDescription(
              key as keyof typeof breakdown.criteria,
              breakdown.profile,
              breakdown.friendCount
            );
            return (
              <div
                key={key}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  met
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {met ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h5 className="font-medium text-sm">{criterion.label}</h5>
                    <div
                      style={{
                        height: '25px',
                        paddingLeft: 'var(--spacing-small, 12px)',
                        paddingRight: 'var(--spacing-small, 12px)',
                        backgroundColor: met ? '#f0fdf4' : '#f9fafb', // green-50 : gray-50
                        color: met ? '#16a34a' : '#6b7280', // green-600 : gray-500
                        border: met ? '2px solid #bbf7d0' : '2px solid #e5e7eb', // green-200 : gray-200
                        borderRadius: '999px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {criterion.target}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {criterion.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tips */}
        {!verified && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-sm text-blue-900 mb-2">
              Tips to Get Verified
            </h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Complete your profile with all information</li>
              <li>• Connect your music streaming account</li>
              <li>• Post reviews for concerts you attend</li>
              <li>• Build your friend network</li>
              <li>• Mark concerts you're interested in</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

