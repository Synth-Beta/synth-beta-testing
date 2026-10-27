import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SYNTH_APP_STORE_URL } from '@/services/shareService';

type Invite = {
  code: string;
  inviter_name: string | null;
  inviter_avatar_url: string | null;
  event_title: string | null;
  event_venue: string | null;
  event_date: string | null;
};

/**
 * join.getsynth.app/i/CODE for people without the app (with it installed, iOS opens the
 * app instead via the AASA /i/* path). The code is the attribution: Apple drops link
 * params through an App Store install, so we show it big and the app asks for it.
 */
export default function InvitePage() {
  const { code = '' } = useParams();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const normalized = code.replace(/[^a-z0-9]/gi, '').toUpperCase();

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).rpc('get_invite', { p_code: normalized });
      setInvite((Array.isArray(data) ? data[0] : data) ?? null);
    })();
  }, [normalized]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(normalized);
      setCopied(true);
    } catch {
      // clipboard blocked: the code is on screen
    }
  };

  const first = invite?.inviter_name?.split(' ')[0] || 'A friend';
  const show = invite?.event_title
    ? `${invite.event_title}${invite.event_venue && !invite.event_title.includes(invite.event_venue) ? ` at ${invite.event_venue}` : ''}`
    : null;
  const date = invite?.event_date
    ? new Date(invite.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <main className="min-h-screen bg-[#FFFDFA] px-4 py-12 flex flex-col items-center text-center">
      <div className="w-full max-w-sm flex flex-col items-center gap-3">
        {invite === undefined ? (
          <p className="text-neutral-500">Loading invite…</p>
        ) : invite === null ? (
          <>
            <h1 className="text-2xl font-bold text-neutral-900">Invite not found</h1>
            <p className="text-neutral-600">Check the link, or get Synth and find your friends there.</p>
          </>
        ) : (
          <>
            {invite.inviter_avatar_url ? (
              <img src={invite.inviter_avatar_url} alt="" className="w-20 h-20 rounded-full object-cover mb-2" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-neutral-100 flex items-center justify-center text-3xl font-bold text-neutral-500 mb-2">
                {first.charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="text-xl font-semibold text-neutral-900">
              {show ? `${first} invited you to` : `${first} invited you to Synth`}
            </h1>
            {show && <p className="text-3xl font-extrabold tracking-tight text-neutral-900">{show}</p>}
            {date && <p className="text-neutral-600">{date}</p>}
          </>
        )}

        <a
          href={SYNTH_APP_STORE_URL}
          className="mt-6 w-full rounded-full bg-[#CC2486] py-3.5 text-lg font-bold text-[#FFFDFA]"
        >
          Get Synth on the App Store
        </a>

        {invite && (
          <div className="mt-4 w-full rounded-2xl border border-dashed border-neutral-300 bg-[#FFFDFA] p-4">
            <p className="text-sm text-neutral-600">Enter this invite code when you sign up</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-neutral-900">{normalized}</p>
            <button onClick={copy} className="mt-2 min-h-[44px] px-4 text-sm font-semibold text-neutral-700 underline">
              {copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
        )}
        <p className="mt-2 text-sm text-neutral-500">You'll be friends with {first} on Synth right away.</p>
      </div>
    </main>
  );
}
