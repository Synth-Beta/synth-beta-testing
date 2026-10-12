import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from './seoFormat';

export function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous && !current) return null;
  if (!previous) return <span className="text-xs text-emerald-600">new</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center text-xs ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(change)}%
    </span>
  );
}

export function Kpi({ label, value, previous, hint }: { label: string; value: number; previous?: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{fmt(value)}</span>
          {previous !== undefined && <Delta current={value} previous={previous} />}
        </div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

/** Horizontal bar list: label, count, and a proportional bar. */
export function BarList({ rows, color = '#db2777' }: { rows: Array<{ label: ReactNode; value: number; extra?: ReactNode }>; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {fmt(row.value)}
              {row.extra}
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-muted">
            <div className="h-1.5 rounded" style={{ width: `${(100 * row.value) / max}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
