/**
 * Resolve server-side env vars on Vercel (often set as VITE_* for the web bundle).
 */
export function getSupabaseServerConfig(): { url: string; serviceRoleKey: string } | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export function getPushWebhookSecret(): string | null {
  const secret = process.env.PUSH_WEBHOOK_SECRET?.trim();
  return secret || null;
}
