import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { EventService } from '../services/eventService';

interface InterestedContextValue {
    /** Returns true if the user has marked this event as interested. Accepts raw or canonical event ID. */
    isInterested: (rawId: string) => boolean;
    /** Toggle interested for an event. Handles resolve + optimistic update + DB write. */
    toggle: (rawId: string) => Promise<void>;
    /** True while the initial load from DB is in progress. */
    loading: boolean;
    /** Seed initial interested state from feed data (before DB load completes). */
    seedFromFeed: (events: Array<{ id: string; user_is_interested?: boolean }>) => void;
}

const InterestedContext = createContext<InterestedContextValue>({
    isInterested: () => false,
    toggle: async () => {},
    loading: false,
    seedFromFeed: () => {},
});

export function InterestedProvider({ children }: { children: React.ReactNode }) {
    // canonical UUID set loaded from DB
    const [canonicalSet, setCanonicalSet] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    // Seeded from feed data before DB load completes
    const feedSeed = useRef<Map<string, boolean>>(new Map());
    // cache of raw external ID → canonical UUID so we don't re-resolve
    const rawToCanonical = useRef<Map<string, string>>(new Map());
    const userIdRef = useRef<string | null>(null);

    const load = useCallback(async (userId: string) => {
        // Align with web `UserEventService.isUserInterested`: interested + going + maybe all count as “saved” for the heart.
        const { data, error } = await supabase
            .from('user_event_relationships')
            .select('event_id')
            .eq('user_id', userId)
            .in('relationship_type', ['interested', 'going', 'maybe']);

        if (error) {
            console.warn('[InterestedContext] load failed', error.message);
            setLoading(false);
            return;
        }

        const ids = new Set<string>((data || []).map((r: any) => r.event_id as string).filter(Boolean));
        setCanonicalSet(ids);
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;

        supabase.auth.getSession().then(({ data: { session } }) => {
            const user = session?.user ?? null;
            if (cancelled || !user) { setLoading(false); return; }
            userIdRef.current = user.id;
            void load(user.id);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (cancelled) return;
            const uid = session?.user?.id ?? null;
            userIdRef.current = uid;
            if (uid) {
                setLoading(true);
                void load(uid);
            } else {
                setCanonicalSet(new Set());
                rawToCanonical.current.clear();
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, [load]);

    const resolve = useCallback(async (rawId: string): Promise<string | null> => {
        // Already cached
        const cached = rawToCanonical.current.get(rawId);
        if (cached) return cached;
        // Try to resolve via EventService
        const canonical = await EventService.resolveEventQueryId(rawId);
        if (canonical) {
            rawToCanonical.current.set(rawId, canonical);
            return canonical;
        }
        // rawId itself may be a valid UUID stored in the set
        return rawId;
    }, []);

    const isInterested = useCallback((rawId: string): boolean => {
        if (canonicalSet.has(rawId)) return true;
        const cached = rawToCanonical.current.get(rawId);
        if (cached && canonicalSet.has(cached)) return true;
        // Fall back to feed seed if DB hasn't loaded yet
        if (loading) {
            if (feedSeed.current.get(rawId) === true) return true;
            if (cached && feedSeed.current.get(cached) === true) return true;
        }
        return false;
    }, [canonicalSet, loading]);

    const seedFromFeed = useCallback((events: Array<{ id: string; user_is_interested?: boolean }>) => {
        for (const ev of events) {
            feedSeed.current.set(ev.id, Boolean(ev.user_is_interested));
        }
    }, []);

    const toggle = useCallback(async (rawId: string): Promise<void> => {
        const userId = userIdRef.current;
        if (!userId) return;

        const canonical = await resolve(rawId);
        if (!canonical) return;

        const isCurrentlyInterested = canonicalSet.has(canonical);

        // Optimistic update
        setCanonicalSet(prev => {
            const next = new Set(prev);
            if (isCurrentlyInterested) {
                next.delete(canonical);
            } else {
                next.add(canonical);
            }
            return next;
        });

        const ok = await EventService.toggleInteraction(userId, rawId, 'interested');
        if (!ok) {
            // Revert on failure
            setCanonicalSet(prev => {
                const next = new Set(prev);
                if (isCurrentlyInterested) {
                    next.add(canonical);
                } else {
                    next.delete(canonical);
                }
                return next;
            });
        }
    }, [canonicalSet, resolve]);

    return (
        <InterestedContext.Provider value={{ isInterested, toggle, loading, seedFromFeed }}>
            {children}
        </InterestedContext.Provider>
    );
}

export function useInterested() {
    return useContext(InterestedContext);
}
