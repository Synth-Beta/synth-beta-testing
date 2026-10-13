import { useCallback, useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getApiBaseUrl } from '@/utils/apiBaseUrl';

const PARTNER = 'pickfive';

/** Calls /api/partner/link/{start|complete|revoke} as the signed-in user (api/_lib/auth/partnerLink.ts). */
async function linkRequest(action: 'start' | 'revoke', body: Record<string, string>) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Please sign in again.');
  const rsp = await fetch(`${getApiBaseUrl()}/api/partner/link/${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ partner: PARTNER, ...body }),
  });
  const json = await rsp.json().catch(() => ({}));
  if (!rsp.ok) throw new Error(typeof json.error === 'string' ? json.error : `Request failed (${rsp.status})`);
  return json as Record<string, unknown>;
}

/**
 * Connect a Pick Five account (web twin of mobile/src/components/partners/PickFiveConnection.tsx):
 * Synth gets a one-time code and opens Pick Five's connect page with it in a new tab; Pick Five
 * redeems it with Synth's server. If the page can't open, the user types the code into Pick Five.
 */
export function PickFiveConnection() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: e } = await supabase.from('user_connections').select('service').eq('service', PARTNER).limit(1);
    if (e) {
      setError('Could not check your Pick Five connection.');
      setConnected(false);
      return;
    }
    setConnected((data ?? []).length > 0);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Coming back from the Pick Five tab: re-check so the screen flips to "connected".
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const openPickFive = (url: string) => {
    if (!window.open(url, '_blank', 'noopener,noreferrer')) window.location.assign(url);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const getCode = () => {
    // Open the tab inside the click so popup blockers allow it; point it at Pick Five once we have the code.
    const tab = window.open('', '_blank');
    void run(async () => {
      try {
        const result = await linkRequest('start', {});
        const url = typeof result.connect_url === 'string' ? result.connect_url : null;
        setCode(String(result.code ?? ''));
        setConnectUrl(url);
        setCopied(false);
        if (url && tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          tab?.close();
          if (url) window.location.assign(url);
        }
      } catch (e) {
        tab?.close();
        throw e;
      }
    });
  };

  const disconnect = () => {
    if (!window.confirm('Disconnect Pick Five? Your Synth and Pick Five accounts will no longer be linked.')) return;
    void run(async () => {
      await linkRequest('revoke', {});
      setCode(null);
      await refresh();
    });
  };

  if (connected === null) {
    return <p className="text-sm text-muted-foreground">Checking Pick Five connection…</p>;
  }

  if (connected) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
            <CheckCircle className="h-4 w-4" />
            Pick Five connected
          </span>
          <button type="button" onClick={disconnect} disabled={busy} className="text-sm text-gray-600 underline">
            {busy ? 'Removing…' : 'Disconnect'}
          </button>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Link your Pick Five account. You keep signing in to each app the usual way.
      </p>

      {code ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-gray-50 p-4">
          <p className="text-center text-sm text-muted-foreground">
            {connectUrl
              ? "Finish connecting in Pick Five, then come back here. If it didn't open, enter this code in Pick Five within 10 minutes:"
              : 'Enter this code in Pick Five within 10 minutes:'}
          </p>
          <p className="text-3xl font-extrabold tracking-[0.3em] text-gray-900 select-all" aria-label={`Code ${code.split('').join(' ')}`}>
            {code}
          </p>
          <div className="flex gap-5">
            <button
              type="button"
              className="text-sm text-gray-600 underline"
              onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true))}
            >
              {copied ? 'Copied' : 'Copy code'}
            </button>
            {connectUrl ? (
              <button type="button" className="text-sm text-gray-600 underline" onClick={() => openPickFive(connectUrl)}>
                Open Pick Five again
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <Button
          onClick={getCode}
          disabled={busy}
          className="h-11 w-full rounded-xl bg-synth-pink font-bold text-white hover:bg-pink-600"
        >
          {busy ? 'Opening Pick Five…' : 'Connect Pick Five'}
        </Button>
      )}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
