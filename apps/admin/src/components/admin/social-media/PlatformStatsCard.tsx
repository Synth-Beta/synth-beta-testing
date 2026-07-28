import * as React from 'react';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface PlatformStat {
  label: string;
  value: string | null;
  subLabel?: string;
}

export interface PlatformStatsCardProps {
  platform: string;
  stats: PlatformStat[];
  className?: string;
}

const PlatformStatsCard = ({ platform, stats, className }: PlatformStatsCardProps) => (
  <Card className={cn('shadow-sm border border-slate-200 bg-white', className)}>
    <CardHeader className="px-4 pb-2">
      <CardTitle className="text-sm font-semibold">{platform}</CardTitle>
    </CardHeader>
    <CardContent className="px-4 pt-1 pb-4 space-y-3">
      {stats.map(stat => (
        <div
          key={`${platform}-${stat.label}`}
          className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-b-0"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {stat.label}
            </p>
            {stat.subLabel && <p className="text-[11px] text-muted-foreground">{stat.subLabel}</p>}
          </div>
          <p className="text-sm font-semibold text-foreground">{stat.value ?? 'N/A'}</p>
        </div>
      ))}
    </CardContent>
  </Card>
);

export default PlatformStatsCard;