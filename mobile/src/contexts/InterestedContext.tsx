import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { EventService } from '../services/eventService';

type RsvpType = 'interested' | 'going' | 'maybe';

interface InterestedContextValue {
    /** Returns true if the user has marked this event as interested. Accepts raw or canonical event ID. */
    isInterested: (rawId: string) => boolean;
    /** Toggle interested for an event. Handles resolve + optimistic update + DB write. */
    toggle: (rawId: string) => Promise<void>;
    /** True while the initial load from DB is in progress. */
    loading: boolean;
    /** Seed initial interested state from feed data (before DB load completes). */
    seedFromFeed: (events: Array<{ id: string; user_is_interested?: boolean }>) => void;
    /** Current RSVP for an event, or null. Accepts raw or canonical event ID. */
    rsvpOf: (rawId: string) => RsvpType | null;
    /**
     * Set the RSVP directly (target-state). Used by the Going control.
     * Pass force when deliberately stepping DOWN from going to interested.
     */
    setRsvp: (rawId: string, target: 'interested' | 'going' | null, force?: boolean) => Promise<void>;
}

const InterestedContext = createContext<InterestedContextValue>({
    isInterested: () => false,
    toggle: async () => {},
    loading: false,
    seedFromFeed: () => {},
    rsvpOf: () => null,
    setRsvp: async () => {},
});

export function InterestedProvider({ children }: { children: React.ReactNode }) {
    // canonical UUID -> relationship_type, loaded from DB. Was a Set of ids; it
    // carries the type now so the profile can badge 'going' without a second query.
    const [rsvpMap, setRsvpMap] = useState<Map<string, string>>(new Map());
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
            .select('event_id, relationship_type')
            .eq('user_id', userId)
            .in('relationship_type', ['interested', 'going', 'maybe']);

        if (error) {
            console.warn('[InterestedContext] load failed', error.message);
            setLoading(false);
            return;
        }

        const next = new Map<string, string>();
        for (const r of (data || []) as Array<{ event_id: string; relationship_type: string }>) {
            if (r.event_id) next.set(r.event_id, r.relationship_type);
        }
        setRsvpMap(next);
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
                setRsvpMap(new Map());
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
        // rawId itself may be a valid UUID stored in the map
        return rawId;
    }, []);

    const isInterested = useCallback((rawId: string): boolean => {
        if (rsvpMap.has(rawId)) return true;
        const cached = rawToCanonical.current.get(rawId);
        if (cached && rsvpMap.has(cached)) return true;
        // Fall back to feed seed if DB hasn't loaded yet
        if (loading) {
            if (feedSeed.current.get(rawId) === true) return true;
            if (cached && feedSeed.current.get(cached) === true) return true;
        }
        return false;
    }, [rsvpMap, loading]);

    const rsvpOf = useCallback((rawId: string): RsvpType | null => {
        const direct = rsvpMap.get(rawId);
        if (direct) return direct as RsvpType;
        const cached = rawToCanonical.current.get(rawId);
        if (cached) {
            const viaCache = rsvpMap.get(cached);
            if (viaCache) return viaCache as RsvpType;
        }
        return null;
    }, [rsvpMap]);

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

        const isCurrentlyInterested = rsvpMap.has(canonical);

        // Optimistic update
        setRsvpMap(prev => {
            const next = new Map(prev);
            if (isCurrentlyInterested) {
                next.delete(canonical);
            } else {
                next.set(canonical, 'interested');
            }
            return next;
        });

        const action = await EventService.toggleInteraction(userId, rawId, 'interested');

        // Revert if the service errored OR returned 'noop' (e.g. user has going/maybe — heart stays on).
        if (action === null || action === 'noop') {
            setRsvpMap(prev => {
                const next = new Map(prev);
                if (isCurrentlyInterested) {
                    next.set(canonical, 'interested');
                } else {
                    next.delete(canonical);
                }
                return next;
            });
        }
        // 'added'/'removed' — optimistic update was correct, keep it.
    }, [rsvpMap, resolve]);

    const setRsvp = useCallback(async (
        rawId: string,
        target: 'interested' | 'going' | null,
        force = false
    ): Promise<void> => {
        const userId = userIdRef.current;
        if (!userId) return;

        const canonical = await resolve(rawId);
        if (!canonical) return;

        const previous = rsvpMap.get(canonical) ?? null;

        setRsvpMap(prev => {
            const next = new Map(prev);
            if (target === null) next.delete(canonical);
            else next.set(canonical, target);
            return next;
        });

        const result = await EventService.setRsvp(canonical, target, force);

        // Roll back when the RPC disagrees with what we optimistically rendered.
        if ((target === null && result !== null) || (target !== null && result !== target)) {
            setRsvpMap(prev => {
                const next = new Map(prev);
                if (previous === null) next.delete(canonical);
                else next.set(canonical, previous);
                return next;
            });
        }
    }, [rsvpMap, resolve]);

    return (
        <InterestedContext.Provider value={{ isInterested, toggle, loading, seedFromFeed, rsvpOf, setRsvp }}>
            {children}
        </InterestedContext.Provider>
    );
}

export function useInterested() {
    return useContext(InterestedContext);
}
