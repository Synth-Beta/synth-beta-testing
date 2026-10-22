import { supabase } from '@/integrations/supabase/client';

const ENDPOINT = 'https://join.getsynth.app/api/ops-alert';

export type ClientSeverity = 'bug' | 'down' | 'failed_index';

const recent = new Set<string>();

function isLocal(): boolean {
  return typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
}

export function reportClientIssue(input: {
  severity?: ClientSeverity;
  message: string;
  stack?: string;
  context?: string;
  surface?: 'web' | 'admin';
}): void {
  if (isLocal()) return;
  const message = input.message?.trim();
  if (!message || message.length < 3) return;
  const key = `${input.severity || 'bug'}:${message.slice(0, 160)}`;
  if (recent.has(key)) return;
  recent.add(key);
  setTimeout(() => recent.delete(key), 15_000);
  void (async () => {
    try {
      let token: string | undefined;
      try {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
      } catch {
        token = undefined;
      }
      await fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          kind: 'client',
          surface: input.surface || 'web',
          severity: input.severity || 'bug',
          message: message.slice(0, 500),
          stack: input.stack?.slice(0, 1200),
          context: input.context?.slice(0, 300),
          url: window.location.href.slice(0, 300),
          platform: 'web',
        }),
      });
    } catch {
      // Reporting must never take the app down with it.
    }
  })();
}

export function installWebIssueReporter(): void {
  if (typeof window === 'undefined' || isLocal()) return;
  window.addEventListener('error', (event) => {
    const error = event.error instanceof Error ? event.error : null;
    reportClientIssue({
      message: error?.message || event.message || 'Window error',
      stack: error?.stack,
      context: window.location.pathname,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const error = reason instanceof Error ? reason : null;
    reportClientIssue({
      message: error?.message || (typeof reason === 'string' ? reason : 'Unhandled rejection'),
      stack: error?.stack,
      context: window.location.pathname,
    });
  });
}
