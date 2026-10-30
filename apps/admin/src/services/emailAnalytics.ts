/**
 * Admin Email Analytics — Brevo event KPIs via get_admin_email_analytics RPC.
 */

import { supabase } from '@/integrations/supabase/client';

// brevo_email_events / RPC are not in generated Database types yet.
const db = supabase as any;

export type EmailAnalyticsKpis = {
  days: number;
  since: string;
  sent: number;
  delivered: number;
  opens: number;
  unique_opens: number;
  clicks: number;
  soft_bounces: number;
  hard_bounces: number;
  bounces: number;
  spam: number;
  unsubscribed: number;
  blocked: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
};

export type EmailAnalyticsSeriesPoint = {
  day: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
};

export type EmailAnalyticsCampaign = {
  campaign: string;
  campaign_date: string | null;
  tag: string;
  sample_subject: string | null;
  recipients: number;
  sent: number;
  delivered: number;
  unique_opens: number;
  clicks: number;
  bounces: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
};

export type EmailAnalyticsRecentEvent = {
  id: string;
  event_type: string;
  email: string | null;
  subject: string | null;
  link: string | null;
  reason: string | null;
  tags: string[] | null;
  brevo_message_id: string | null;
  event_at: string;
};

export type EmailAnalyticsDashboard = {
  kpis: EmailAnalyticsKpis;
  series: EmailAnalyticsSeriesPoint[];
  campaigns: EmailAnalyticsCampaign[];
  recent: EmailAnalyticsRecentEvent[];
};

const emptyKpis = (days: number): EmailAnalyticsKpis => ({
  days,
  since: new Date(Date.now() - days * 86_400_000).toISOString(),
  sent: 0,
  delivered: 0,
  opens: 0,
  unique_opens: 0,
  clicks: 0,
  soft_bounces: 0,
  hard_bounces: 0,
  bounces: 0,
  spam: 0,
  unsubscribed: 0,
  blocked: 0,
  delivery_rate: 0,
  open_rate: 0,
  click_rate: 0,
  bounce_rate: 0,
});

export async function fetchEmailAnalytics(days: number): Promise<EmailAnalyticsDashboard> {
  const { data, error } = await db.rpc('get_admin_email_analytics', { p_days: days });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as Partial<EmailAnalyticsDashboard>;
  return {
    kpis: { ...emptyKpis(days), ...(payload.kpis ?? {}) },
    series: Array.isArray(payload.series) ? payload.series : [],
    campaigns: Array.isArray(payload.campaigns) ? payload.campaigns : [],
    recent: Array.isArray(payload.recent) ? payload.recent : [],
  };
}
