import * as React from 'react';

import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export interface PlatformInsightCardProps {
  label: string;
  value: string | null;
  description?: string;
  accent?: boolean;
  className?: string;
}

const PlatformInsightCard = ({ label, value, description, accent = false, className }: PlatformInsightCardProps) => (
  <Card className={cn('shadow-sm border bg-white', accent ? 'border-pink-200' : 'border-slate-200', className)}>
    <CardContent className="px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value ?? 'N/A'}</p>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </CardContent>
  </Card>
);

export default PlatformInsightCard;