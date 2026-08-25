/**
 * Home warm-chats strip — consumes Chat warmth contract v1 (`homeEligible` only).
 * Never pads with cold chats. Soft-refreshes on focus / ≤5 min cache.
 * T3: same-day hide list filters empty-room offenders off Home only.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { SYNTH_20_DEMO, SYNTH_20_HOME } from '@/config/synth20Demo';
import {
  getHomeWarmChats,
  type HomeWarmChat,
  HOME_WARM_STRIP_MAX,
  HOME_WARM_STRIP_MIN,
} from '@/services/chatWarmthService';
import { getHiddenHomeWarmChatIds } from '@/services/homeDensityService';

interface WarmChatsStripProps {
  onOpenChat?: (chatId: string) => void;
}

export const WarmChatsStrip: React.FC<WarmChatsStripProps> = ({ onOpenChat }) => {
  const [chats, setChats] = useState<HomeWarmChat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    if (!SYNTH_20_DEMO) return;
    try {
      const next = await getHomeWarmChats({ force });
      const hidden = getHiddenHomeWarmChatIds();
      // Never pad after T3 hides — under-gate / hidden stay off Home.
      setChats(next.filter((c) => !hidden.has(c.chatId)));
    } catch (err) {
      console.error('[WarmChatsStrip]', err);
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!SYNTH_20_DEMO) return;
    void load(false);

    const softRefresh = () => {
      void load(true);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') softRefresh();
    };

    window.addEventListener('focus', softRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', softRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  if (!SYNTH_20_DEMO) return null;

  // Never pad: hide strip when zero eligible (under-gate stays on show detail only).
  if (!loading && chats.length === 0) return null;

  return (
    <section
      style={{
        marginBottom: 'var(--spacing-medium, 24px)',
        paddingLeft: 'var(--spacing-small, 12px)',
        paddingRight: 'var(--spacing-small, 12px)',
      }}
      data-testid="home-warm-chats-strip"
      data-warm-count={chats.length}
      data-warm-min={HOME_WARM_STRIP_MIN}
      data-warm-max={HOME_WARM_STRIP_MAX}
    >
      <div style={{ marginBottom: 12 }}>
        <h2
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-h2-size, 24px)',
            fontWeight: 700,
            color: 'var(--neutral-900)',
            margin: 0,
          }}
        >
          {SYNTH_20_HOME.chats.teaserLabel}
        </h2>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 14,
            color: 'var(--neutral-600)',
            lineHeight: 1.4,
            maxWidth: 520,
          }}
        >
          {SYNTH_20_HOME.chats.newThreadHint}
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--neutral-500)', fontSize: 14 }}>Loading warm chats…</div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 8,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {chats.map((chat) => (
            <button
              key={chat.chatId}
              type="button"
              data-home-eligible="true"
              data-chat-kind={chat.chatKind}
              onClick={() => onOpenChat?.(chat.chatId)}
              style={{
                flex: '0 0 auto',
                width: 200,
                textAlign: 'left',
                border: '1px solid var(--neutral-150, #ebebeb)',
                borderRadius: 16,
                background: 'var(--neutral-0, #fff)',
                padding: 14,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(233, 30, 140, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand-pink-500, #e91e8c)',
                }}
              >
                <MessageCircle size={18} />
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--neutral-900)',
                  lineHeight: 1.25,
                }}
              >
                {chat.displayName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>
                {chat.chatKind === 'scene_persistent' ? 'Scene room' : 'Show chat'}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--brand-pink-500, #e91e8c)',
                }}
              >
                Open chat
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default WarmChatsStrip;
