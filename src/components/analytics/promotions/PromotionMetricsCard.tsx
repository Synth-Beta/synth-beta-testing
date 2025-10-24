/**
 * PromotionMetricsCard Component
 * Displays individual promotion statistics
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Eye, MousePointer, Target, DollarSign, TrendingDown } from 'lucide-react';

interface PromotionMetricsCardProps {
  promotion: {
    id: string;
    event_title: string;
    tier: string;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    conversion_rate: number;
    cost_per_click: number;
    cost_per_conversion: number;
    roi: number;
    revenue_attributed: number;
  };
  className?: string;
}

export function PromotionMetricsCard({ promotion, className = '' }: PromotionMetricsCardProps) {
  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'basic':
        return <Badge className="bg-blue-100 text-blue-700">Basic</Badge>;
      case 'premium':
        return <Badge className="bg-purple-100 text-purple-700">Premium</Badge>;
      case 'featured':
        return <Badge className="bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800">Featured</Badge>;
      default:
        return <Badge variant="secondary">{tier}</Badge>;
    }
  };

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

  return (
    <Card className={`hover:shadow-md transition-shadow ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold truncate">
            {promotion.event_title}
          </CardTitle>
          {getTierBadge(promotion.tier)}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Eye className="h-4 w-4" />
              <span>Impressions</span>
            </div>
            <p className="text-2xl font-bold">{promotion.impressions.toLocaleString()}</p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MousePointer className="h-4 w-4" />
              <span>Clicks</span>
            </div>
            <p className="text-2xl font-bold">{promotion.clicks.toLocaleString()}</p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Target className="h-4 w-4" />
              <span>Conversions</span>
            </div>
            <p className="text-2xl font-bold">{promotion.conversions.toLocaleString()}</p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <DollarSign className="h-4 w-4" />
              <span>Revenue</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(promotion.revenue_attributed)}
            </p>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div className="space-y-1">
            <p className="text-sm text-gray-600">Click-through Rate</p>
            <p className="text-lg font-semibold">{formatPercentage(promotion.ctr)}</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-gray-600">Conversion Rate</p>
            <p className="text-lg font-semibold">{formatPercentage(promotion.conversion_rate)}</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-gray-600">Cost per Click</p>
            <p className="text-lg font-semibold">{formatCurrency(promotion.cost_per_click)}</p>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm text-gray-600">Cost per Conversion</p>
            <p className="text-lg font-semibold">{formatCurrency(promotion.cost_per_conversion)}</p>
          </div>
        </div>

        {/* ROI Section */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {promotion.roi >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
              <span className="text-sm text-gray-600">Return on Investment</span>
            </div>
            <p className={`text-xl font-bold ${promotion.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {promotion.roi >= 0 ? '+' : ''}{formatPercentage(promotion.roi)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PromotionMetricsCard;
