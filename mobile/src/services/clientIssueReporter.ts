import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';

export type AppIssueSeverity = 'bug' | 'down' | 'failed_index';

const recent = new Set<string>();
let currentRoute = '';

export function setAppIssueRoute(route: string): void {
  currentRoute = route;
}

export function reportAppIssue(input: {
  severity?: AppIssueSeverity;
  message: string;
  stack?: string;
  context?: string;
  details?: Record<string, unknown>;
}): void {
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
      await fetch(`${getExpoSiteUrl()}/api/ops-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          kind: 'client',
          surface: 'app',
          severity: input.severity || 'bug',
          message: message.slice(0, 500),
          stack: input.stack?.slice(0, 1200),
          context: (input.context || currentRoute || '').slice(0, 300),
          platform: Platform.OS,
          app_version: Constants.expoConfig?.version || null,
          details: input.details || null,
        }),
      });
    } catch {
      // Reporting must never take the app down with it.
    }
  })();
}

export function installAppIssueReporter(): void {
  const utils = (global as { ErrorUtils?: { getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void; setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void } }).ErrorUtils;
  const previous = utils?.getGlobalHandler?.();
  utils?.setGlobalHandler?.((error, isFatal) => {
    reportAppIssue({
      severity: isFatal ? 'down' : 'bug',
      message: error?.message || 'App crash',
      stack: error?.stack,
      context: currentRoute || 'global',
    });
    previous?.(error, isFatal);
  });
}
