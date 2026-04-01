/**
 * PromotionROICalculator Component
 * Displays ROI calculations and break-even analysis
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { TrendingUp, TrendingDown, Target, DollarSign, Calculator } from 'lucide-react';

interface PromotionROICalculatorProps {
  roi: number;
  revenue_attributed: number;
  cost: number;
  profit: number;
  break_even_conversions: number;
  className?: string;
}

export function PromotionROICalculator({ 
  roi, 
  revenue_attributed, 
  cost, 
  profit, 
  break_even_conversions,
  className = '' 
}: PromotionROICalculatorProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getROIIcon = () => {
    return roi >= 0 ? (
      <TrendingUp className="h-5 w-5 text-green-600" />
    ) : (
      <TrendingDown className="h-5 w-5 text-red-600" />
    );
  };

  const getROIBadge = () => {
    if (roi >= 100) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>Excellent</span>;
    } else if (roi >= 50) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>Good</span>;
    } else if (roi >= 0) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>Break Even</span>;
    } else {
      return <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>Loss</span>;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          ROI Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main ROI Display */}
        <div className="text-center p-6 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-2 mb-2">
            {getROIIcon()}
            <span className="text-sm text-gray-600">Return on Investment</span>
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className={`text-4xl font-bold ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {roi >= 0 ? '+' : ''}{formatPercentage(roi)}
            </span>
            {getROIBadge()}
          </div>
          <p className="text-sm text-gray-600">
            {roi >= 0 
              ? `You earned ${formatCurrency(profit)} more than you spent`
              : `You lost ${formatCurrency(Math.abs(profit))} on this promotion`
            }
          </p>
        </div>

        {/* Financial Breakdown */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <DollarSign className="h-4 w-4" />
              <span>Total Cost</span>
            </div>
            <p className="text-xl font-semibold text-red-600">
              {formatCurrency(cost)}
            </p>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <TrendingUp className="h-4 w-4" />
              <span>Revenue Attributed</span>
            </div>
            <p className="text-xl font-semibold text-green-600">
              {formatCurrency(revenue_attributed)}
            </p>
          </div>
        </div>

        {/* Profit/Loss */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Net Profit/Loss</span>
            <span className={`text-lg font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
            </span>
          </div>
        </div>

        {/* Break-Even Analysis */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Break-Even Analysis</span>
          </div>
          
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              You need <strong>{break_even_conversions} conversions</strong> to break even on this promotion.
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Based on an average ticket price of $25 per conversion.
            </p>
          </div>
        </div>

        {/* Performance Insights */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Performance Insights</h4>
          
          <div className="space-y-2">
            {roi >= 100 && (
              <div className="p-2 bg-green-50 rounded text-sm text-green-800">
                🎉 Excellent ROI! This promotion is highly profitable.
              </div>
            )}
            
            {roi >= 50 && roi < 100 && (
              <div className="p-2 bg-blue-50 rounded text-sm text-blue-800">
                👍 Good performance. Consider scaling this promotion strategy.
              </div>
            )}
            
            {roi >= 0 && roi < 50 && (
              <div className="p-2 bg-yellow-50 rounded text-sm text-yellow-800">
                ⚠️ Break-even performance. Consider optimizing targeting or creative.
              </div>
            )}
            
            {roi < 0 && (
              <div className="p-2 bg-red-50 rounded text-sm text-red-800">
                ❌ Negative ROI. Review targeting, creative, or consider pausing this promotion.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PromotionROICalculator;
