import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Circle, Sparkles, TrendingUp } from 'lucide-react';
import { useTrustScoreBreakdown } from '@/hooks/useVerification';
import { getCriterionDescription } from '@/utils/verificationUtils';

interface VerificationProgressWidgetProps {
  userId: string;
  accountType: 'user' | 'creator' | 'business' | 'admin';
  verified: boolean;
  onViewDetails?: () => void;
}

export function VerificationProgressWidget({
  userId,
  accountType,
  verified,
  onViewDetails,
}: VerificationProgressWidgetProps) {
  const { breakdown, loading } = useTrustScoreBreakdown(userId);

  // Don't show for non-user accounts
  if (accountType !== 'user') {
    return null;
  }

  // Don't show if already verified
  if (verified) {
    return (
      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-green-900 text-sm">Verified User</h4>
              <p className="text-xs text-green-700">You've earned the trusted badge</p>
            </div>
            <Sparkles className="w-5 h-5 text-green-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading || !breakdown) {
    return null;
  }

  const progressPercentage = (breakdown.criteriaMet / breakdown.totalCriteria) * 100;
  const criteriaNeeded = 4 - breakdown.criteriaMet;
  const isCloseToVerification = breakdown.criteriaMet >= 2;

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${
        isCloseToVerification 
          ? 'bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200' 
          : 'bg-gray-50 border-gray-200'
      }`}
      onClick={onViewDetails}
    >
      <CardContent className="py-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className={`w-4 h-4 ${
                isCloseToVerification ? 'text-blue-600' : 'text-gray-600'
              }`} />
              <h4 className={`font-semibold text-sm ${
                isCloseToVerification ? 'text-blue-900' : 'text-gray-900'
              }`}>
                Verification Progress
              </h4>
            </div>
            <Badge 
              variant={isCloseToVerification ? 'default' : 'secondary'}
              className="text-xs"
            >
              {breakdown.criteriaMet}/4 criteria
            </Badge>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <Progress 
              value={(breakdown.criteriaMet / 4) * 100} 
              className="h-2"
            />
            <p className="text-xs text-gray-600">
              {criteriaNeeded > 0 ? (
                <>
                  <span className="font-medium">{criteriaNeeded} more criteria</span> needed for verification
                </>
              ) : (
                <span className="font-medium text-green-600">Ready for verification! ✓</span>
              )}
            </p>
          </div>

          {/* Quick Checklist - Top 3 incomplete items */}
          <div className="space-y-1.5">
            {Object.entries(breakdown.criteria)
              .filter(([_, met]) => !met)
              .slice(0, 3)
              .map(([key]) => {
                const criterion = getCriterionDescription(key as keyof typeof breakdown.criteria);
                return (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <Circle className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{criterion.label}</span>
                  </div>
                );
              })}
            {breakdown.criteriaMet >= 2 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails?.();
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
              >
                View all criteria →
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

