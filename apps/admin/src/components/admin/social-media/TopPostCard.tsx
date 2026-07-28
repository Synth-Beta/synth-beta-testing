import * as React from 'react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface TopPostCardProps {
  title: string;
  platform: string;
  metricLabel: string;
  metricValue: string | null;
  detail: string;
  className?: string;
}

const TopPostCard = ({ title, platform, metricLabel, metricValue, detail, className }: TopPostCardProps) => (
  <Card className={cn('shadow-sm border border-slate-200 bg-white', className)}>
    <CardHeader className="px-4 pb-2">
      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      <CardDescription className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
        {platform}
      </CardDescription>
    </CardHeader>
    <CardContent className="px-4 pb-6 pt-0 space-y-1">
      <p className="text-sm text-muted-foreground">{detail}</p>
      <p className="text-2xl font-semibold text-foreground">{metricValue ?? 'N/A'}</p>
      <p className="text-[11px] uppercase tracking-[0.3em] text-pink-600">{metricLabel}</p>
    </CardContent>
  </Card>
);

export default TopPostCard;