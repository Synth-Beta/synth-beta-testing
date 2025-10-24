/**
 * PromotionComparisonTable Component
 * Compares multiple promotions side by side
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';

interface PromotionComparisonTableProps {
  promotions: {
    promotion_id: string;
    event_title: string;
    tier: string;
    duration_days: number;
    total_spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    conversion_rate: number;
    cost_per_click: number;
    cost_per_conversion: number;
    roi: number;
  }[];
  className?: string;
}

export function PromotionComparisonTable({ promotions, className = '' }: PromotionComparisonTableProps) {
  if (!promotions || promotions.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Promotion Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-gray-500">
            No promotions to compare
          </div>
        </CardContent>
      </Card>
    );
  }

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'basic':
        return <Badge className="bg-blue-100 text-blue-700 text-xs">Basic</Badge>;
      case 'premium':
        return <Badge className="bg-purple-100 text-purple-700 text-xs">Premium</Badge>;
      case 'featured':
        return <Badge className="bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800 text-xs">Featured</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{tier}</Badge>;
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

  const getROIIcon = (roi: number) => {
    return roi >= 0 ? (
      <TrendingUp className="h-4 w-4 text-green-600" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-600" />
    );
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Promotion Performance Comparison
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead>Impressions</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Conversions</TableHead>
                <TableHead>CTR</TableHead>
                <TableHead>Conv. Rate</TableHead>
                <TableHead>Cost/Click</TableHead>
                <TableHead>Cost/Conv.</TableHead>
                <TableHead>ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promotions.map((promotion) => (
                <TableRow key={promotion.promotion_id}>
                  <TableCell className="font-medium max-w-32 truncate">
                    {promotion.event_title}
                  </TableCell>
                  <TableCell>
                    {getTierBadge(promotion.tier)}
                  </TableCell>
                  <TableCell>
                    {promotion.duration_days} days
                  </TableCell>
                  <TableCell>
                    {formatCurrency(promotion.total_spend)}
                  </TableCell>
                  <TableCell>
                    {promotion.impressions.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {promotion.clicks.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {promotion.conversions.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {formatPercentage(promotion.ctr)}
                  </TableCell>
                  <TableCell>
                    {formatPercentage(promotion.conversion_rate)}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(promotion.cost_per_click)}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(promotion.cost_per_conversion)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {getROIIcon(promotion.roi)}
                      <span className={`font-semibold ${
                        promotion.roi >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {promotion.roi >= 0 ? '+' : ''}{formatPercentage(promotion.roi)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-4 border-t">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Total Promotions</p>
              <p className="text-lg font-semibold">{promotions.length}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Total Spend</p>
              <p className="text-lg font-semibold">
                {formatCurrency(promotions.reduce((sum, p) => sum + p.total_spend, 0))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Avg. CTR</p>
              <p className="text-lg font-semibold">
                {formatPercentage(
                  promotions.reduce((sum, p) => sum + p.ctr, 0) / promotions.length
                )}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Avg. ROI</p>
              <p className="text-lg font-semibold">
                {formatPercentage(
                  promotions.reduce((sum, p) => sum + p.roi, 0) / promotions.length
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default PromotionComparisonTable;
