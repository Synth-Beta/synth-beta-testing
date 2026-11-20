import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    StyleSheet,
    View,
    TextInput,
    FlatList,
    Pressable,
    Keyboard,
    ScrollView,
    Image,
    Text,
} from 'react-native';
import {
    Search as SearchIcon,
    X,
    Music,
    MapPin,
    Calendar,
    Users,
} from 'lucide-react-native';
import { SynthText } from './SynthText';
import { SynthTokens } from '../tokens/SynthTokens';
import {
    SearchService,
    SearchResult,
    ArtistSearchRow,
    VenueSearchRow,
    UserSearchRow,
} from '../services/searchService';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchResultsSkeleton } from './skeletons/SearchResultsSkeleton';
import { EventService } from '../services/eventService';
import { bottomSafeContentPadding } from './navigation/SynthTabBar';

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchScope = 'all' | 'events' | 'artists' | 'venues' | 'users';

interface AllResults {
    events: SearchResult[];
    artists: ArtistSearchRow[];
    venues: VenueSearchRow[];
    users: UserSearchRow[];
}

// ─── Scope config ─────────────────────────────────────────────────────────────

const SCOPES: { key: SearchScope; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'events', label: 'Events' },
    { key: 'artists', label: 'Artists' },
    { key: 'venues', label: 'Venues' },
    { key: 'users', label: 'Users' },
];

const PINK = SynthTokens.colors.brandPink500;
const ALL_PREVIEW = 3; // items per section in "All" tab

// ─── Row renderers ────────────────────────────────────────────────────────────

function EventRow({
    item,
    onPress,
}: {
    item: SearchResult;
    onPress: () => void;
}) {
    const dateLabel = (() => {
        const d = new Date(item.event_date);
        if (!Number.isFinite(d.getTime())) return null;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    })();
    const sub =
        [item.artist_name, item.venue_name, item.venue_city].filter(Boolean).join(' · ') ||
        'Event';

    return (
        <Pressable style={styles.entityRow} onPress={onPress}>
            <View style={[styles.entityAvatar, styles.entityFallback]}>
                <Calendar size={20} color={PINK} />
                {dateLabel ? (
                    <Text style={styles.eventDateText} numberOfLines={1}>{dateLabel}</Text>
                ) : null}
            </View>
            <View style={{ flex: 1 }}>
                <SynthText variant="meta" style={styles.entityTitle} numberOfLines={1}>
                    {item.title || item.artist_name || 'Event'}
                </SynthText>
                <SynthText variant="meta" color="secondary" numberOfLines={1}>
                    {sub}
                </SynthText>
            </View>
            <View style={styles.categoryPill}>
                <Calendar size={11} color={PINK} />
                <Text style={styles.categoryPillText}>Event</Text>
            </View>
        </Pressable>
    );
}

function ArtistRow({
    item,
    onPress,
}: {
    item: ArtistSearchRow;
    onPress: () => void;
}) {
    return (
        <Pressable style={styles.entityRow} onPress={onPress}>
            {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={[styles.entityAvatar, { borderRadius: 10 }]} />
            ) : (
                <View style={[styles.entityAvatar, styles.entityFallback, { backgroundColor: SynthTokens.colors.neutral100 }]}>
                    <Music size={20} color={SynthTokens.colors.neutral600} />
                </View>
            )}
            <View style={{ flex: 1 }}>
                <SynthText variant="meta" style={styles.entityTitle} numberOfLines={1}>
                    {item.name}
                </SynthText>
                <SynthText variant="meta" color="secondary">
                    Artist
                </SynthText>
            </View>
            <View style={styles.categoryPill}>
                <Music size={11} color={PINK} />
                <Text style={styles.categoryPillText}>Artist</Text>
            </View>
        </Pressable>
    );
}

function VenueRow({
    item,
    onPress,
}: {
    item: VenueSearchRow;
    onPress: () => void;
}) {
    return (
        <Pressable style={styles.entityRow} onPress={onPress}>
            <View style={[styles.entityAvatar, styles.entityFallback, { backgroundColor: SynthTokens.colors.neutral100 }]}>
                <MapPin size={20} color={SynthTokens.colors.neutral600} />
            </View>
            <View style={{ flex: 1 }}>
                <SynthText variant="meta" style={styles.entityTitle} numberOfLines={1}>
                    {item.name}
                </SynthText>
                <SynthText variant="meta" color="secondary">
                    {item.city ? `${item.city} · Venue` : 'Venue'}
                </SynthText>
            </View>
            <View style={styles.categoryPill}>
                <MapPin size={11} color={PINK} />
                <Text style={styles.categoryPillText}>Venue</Text>
            </View>
        </Pressable>
    );
}

function UserRow({
    item,
    onPress,
}: {
    item: UserSearchRow;
    onPress: () => void;
}) {
    return (
        <Pressable style={styles.entityRow} onPress={onPress}>
            {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={[styles.entityAvatar, { borderRadius: 22 }]} />
            ) : (
                <View style={[styles.entityAvatar, styles.entityFallback, { backgroundColor: SynthTokens.colors.neutral100, borderRadius: 22 }]}>
                    <Users size={20} color={SynthTokens.colors.neutral600} />
                </View>
            )}
            <View style={{ flex: 1 }}>
                <SynthText variant="meta" style={styles.entityTitle} numberOfLines={1}>
                    {item.name || item.username || 'User'}
                </SynthText>
                <SynthText variant="meta" color="secondary">
                    {item.username ? `@${item.username}` : 'User'}
                </SynthText>
            </View>
            <View style={styles.categoryPill}>
                <Users size={11} color={PINK} />
                <Text style={styles.categoryPillText}>User</Text>
            </View>
        </Pressable>
    );
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
    title,
    count,
    onSeeAll,
}: {
    title: string;
    count: number;
    onSeeAll?: () => void;
}) {
    return (
        <View style={styles.sectionHeader}>
            <SynthText variant="meta" style={styles.sectionHeaderText}>
                {title.toUpperCase()}
            </SynthText>
            {onSeeAll && count > ALL_PREVIEW ? (
                <Pressable onPress={onSeeAll} hitSlop={8}>
                    <SynthText variant="meta" style={styles.seeAllText}>
                        See all {count}
                    </SynthText>
                </Pressable>
            ) : null}
        </View>
    );
}

// ─── Empty / helper states ─────────────────────────────────────────────────────

function EmptySearch({ query, scope }: { query: string; scope: SearchScope }) {
    if (!query || query.trim().length < 2) {
        return (
            <View style={styles.emptyState}>
                <SearchIcon size={36} color={SynthTokens.colors.neutral400} />
                <SynthText variant="body" color="secondary" style={styles.emptyTitle}>
                    Search for anything
                </SynthText>
                <SynthText variant="meta" color="secondary" style={styles.emptyHint}>
                    Find events, artists, venues, and people on Synth.
                </SynthText>
            </View>
        );
    }
    const label = scope === 'all' ? 'results' : scope;
    return (
        <View style={styles.empty}>
            <SynthText variant="body" color="secondary">
                No {label} found for "{query.trim()}"
            </SynthText>
        </View>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface SearchScreenProps {
    /** Pre-populate the search bar (e.g. from the Home search bar). */
    initialQuery?: string;
}

export default function SearchScreen({ initialQuery = '' }: SearchScreenProps) {
    const [keyword, setKeyword] = useState(initialQuery);
    const inputRef = useRef<TextInput>(null);
    const [scope, setScope] = useState<SearchScope>('all');
    const [results, setResults] = useState<AllResults>({
        events: [],
        artists: [],
        venues: [],
        users: [],
    });
    const [loading, setLoading] = useState(false);
    const insets = useSafeAreaInsets();
    const router = useRouter();
    // Id of the newest search. A response is applied only if it belongs to the newest
    // search, so a slow earlier query can never overwrite the results of a later one.
    const searchSeqRef = useRef(0);

    const dismissSearch = useCallback(() => {
        Keyboard.dismiss();
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(tabs)' as any);
        }
    }, [router]);

    const handleClearOrClose = useCallback(() => {
        // A space or a single letter still counts as text: clear it and stay open.
        if (keyword.length > 0) {
            setKeyword('');
            inputRef.current?.focus();
            return;
        }
        dismissSearch();
    }, [keyword, dismissSearch]);

    // Sync with initialQuery when it changes (e.g. deep link or back navigation)
    useEffect(() => {
        if (initialQuery && initialQuery !== keyword) {
            setKeyword(initialQuery);
        }
    }, [initialQuery]);

    const runSearch = useCallback(async (q: string) => {
        const seq = ++searchSeqRef.current;
        const term = q.trim();
        if (term.length < 2) {
            setResults({ events: [], artists: [], venues: [], users: [] });
            setLoading(false);
            return;
        }
        setLoading(true);
        // Fill in each category as soon as it arrives instead of waiting for the slowest
        // one (usually events). The previous query's results stay on screen until the
        // first category of the new query lands (no flash to the skeleton while typing).
        let first = true;
        const apply = <K extends keyof AllResults>(key: K) => (rows: AllResults[K]) => {
            if (seq !== searchSeqRef.current) return;
            const fresh = first;
            first = false;
            setResults(prev => ({
                ...(fresh ? { events: [], artists: [], venues: [], users: [] } : prev),
                [key]: rows,
            }));
        };
        try {
            await Promise.all([
                SearchService.searchArtists(term).then(apply('artists')),
                SearchService.searchVenues(term).then(apply('venues')),
                SearchService.searchUsers(term).then(apply('users')),
                SearchService.searchEvents(term).then(apply('events')),
            ]);
        } finally {
            if (seq === searchSeqRef.current) setLoading(false);
        }
    }, []);

    // Debounced search on keyword change (300ms, matching web)
    useEffect(() => {
        const timer = setTimeout(() => {
            void runSearch(keyword);
        }, 300);
        return () => {
            clearTimeout(timer);
        };
    }, [keyword, runSearch]);

    // ─── Navigation helpers ───────────────────────────────────────────────────

    const goToEvent = useCallback(
        (id: string) => {
            Keyboard.dismiss();
            void EventService.toEventRouteId(id).then(rid => {
                router.push(`/event/${rid}` as any);
            });
        },
        [router]
    );

    const goToArtist = useCallback(
        (id: string) => {
            Keyboard.dismiss();
            router.push(`/artist/${id}` as any);
        },
        [router]
    );

    const goToVenue = useCallback(
        (id: string) => {
            Keyboard.dismiss();
            router.push(`/venue/${id}` as any);
        },
        [router]
    );

    const goToUser = useCallback(
        (userId: string) => {
            Keyboard.dismiss();
            router.push(`/user/${userId}` as any);
        },
        [router]
    );

    // ─── Computed ─────────────────────────────────────────────────────────────

    const hasQuery = keyword.trim().length >= 2;
    const totalResults =
        results.events.length +
        results.artists.length +
        results.venues.length +
        results.users.length;
    const isEmpty = hasQuery && !loading && totalResults === 0;

    // ─── "All" tab render ─────────────────────────────────────────────────────

    function renderAllTab() {
        if (!hasQuery) {
            return (
                <Pressable
                    style={styles.dismissFill}
                    onPress={dismissSearch}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss search"
                >
                    <EmptySearch query={keyword} scope="all" />
                </Pressable>
            );
        }
        if (loading) return <SearchResultsSkeleton />;
        if (isEmpty) return <EmptySearch query={keyword} scope="all" />;

        return (
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                    styles.allContent,
                    { paddingBottom: bottomSafeContentPadding(insets.bottom) },
                ]}
            >
                {/* Events section */}
                {results.events.length > 0 ? (
                    <View>
                        <SectionHeader
                            title="Events"
                            count={results.events.length}
                            onSeeAll={() => setScope('events')}
                        />
                        {results.events.slice(0, ALL_PREVIEW).map(e => (
                            <EventRow
                                key={e.id}
                                item={e}
                                onPress={() => goToEvent(e.id)}
                            />
                        ))}
                    </View>
                ) : null}

                {/* Artists section */}
                {results.artists.length > 0 ? (
                    <View>
                        <SectionHeader
                            title="Artists"
                            count={results.artists.length}
                            onSeeAll={() => setScope('artists')}
                        />
                        {results.artists.slice(0, ALL_PREVIEW).map(a => (
                            <ArtistRow
                                key={a.id}
                                item={a}
                                onPress={() => goToArtist(a.id)}
                            />
                        ))}
                    </View>
                ) : null}

                {/* Venues section */}
                {results.venues.length > 0 ? (
                    <View>
                        <SectionHeader
                            title="Venues"
                            count={results.venues.length}
                            onSeeAll={() => setScope('venues')}
                        />
                        {results.venues.slice(0, ALL_PREVIEW).map(v => (
                            <VenueRow
                                key={v.id}
                                item={v}
                                onPress={() => goToVenue(v.id)}
                            />
                        ))}
                    </View>
                ) : null}

                {/* Users section */}
                {results.users.length > 0 ? (
                    <View>
                        <SectionHeader
                            title="People"
                            count={results.users.length}
                            onSeeAll={() => setScope('users')}
                        />
                        {results.users.slice(0, ALL_PREVIEW).map(u => (
                            <UserRow
                                key={u.user_id}
                                item={u}
                                onPress={() => goToUser(u.user_id)}
                            />
                        ))}
                    </View>
                ) : null}
            </ScrollView>
        );
    }

    // ─── Per-scope FlatList data ───────────────────────────────────────────────

    type FlatRow =
        | { kind: 'event'; data: SearchResult }
        | { kind: 'artist'; data: ArtistSearchRow }
        | { kind: 'venue'; data: VenueSearchRow }
        | { kind: 'user'; data: UserSearchRow };

    const flatData: FlatRow[] = (() => {
        if (scope === 'events') return results.events.map(d => ({ kind: 'event', data: d }));
        if (scope === 'artists') return results.artists.map(d => ({ kind: 'artist', data: d }));
        if (scope === 'venues') return results.venues.map(d => ({ kind: 'venue', data: d }));
        if (scope === 'users') return results.users.map(d => ({ kind: 'user', data: d }));
        return [];
    })();

    const renderFlatRow = ({ item }: { item: FlatRow }) => {
        if (item.kind === 'event')
            return <EventRow item={item.data} onPress={() => goToEvent(item.data.id)} />;
        if (item.kind === 'artist')
            return <ArtistRow item={item.data} onPress={() => goToArtist(item.data.id)} />;
        if (item.kind === 'venue')
            return <VenueRow item={item.data} onPress={() => goToVenue(item.data.id)} />;
        const u = item.data as UserSearchRow;
        return <UserRow item={u} onPress={() => goToUser(u.user_id)} />;
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Search bar */}
            <View style={styles.header}>
                <View style={styles.searchBar}>
                    <SearchIcon size={20} color={SynthTokens.colors.neutral400} />
                    <TextInput
                        ref={inputRef}
                        placeholder='Try "Radiohead" or "Madison Square Garden"'
                        placeholderTextColor={SynthTokens.colors.neutral400}
                        style={styles.input}
                        value={keyword}
                        onChangeText={setKeyword}
                        autoCorrect={false}
                        autoFocus
                        returnKeyType="search"
                        onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    <Pressable
                        onPress={handleClearOrClose}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={keyword.length > 0 ? 'Clear search' : 'Close search'}
                    >
                        <X size={20} color={SynthTokens.colors.neutral400} />
                    </Pressable>
                </View>
            </View>

            {/* Scope tabs */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scopeScroll}
                keyboardShouldPersistTaps="handled"
                style={styles.scopeScrollOuter}
            >
                {SCOPES.map(s => {
                    const active = scope === s.key;
                    // Show count badge on "all" tab when there are results
                    const count =
                        s.key === 'all'
                            ? null
                            : s.key === 'events'
                            ? results.events.length
                            : s.key === 'artists'
                            ? results.artists.length
                            : s.key === 'venues'
                            ? results.venues.length
                            : results.users.length;
                    return (
                        <Pressable
                            key={s.key}
                            onPress={() => setScope(s.key)}
                            style={[styles.scopeChip, active && styles.scopeChipActive]}
                        >
                            <SynthText
                                variant="meta"
                                style={[styles.scopeChipText, active && styles.scopeChipTextActive]}
                            >
                                {s.label}
                                {count != null && count > 0 && hasQuery
                                    ? ` (${count})`
                                    : ''}
                            </SynthText>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* Results */}
            {scope === 'all' ? (
                renderAllTab()
            ) : (
                <FlatList
                    data={flatData}
                    renderItem={renderFlatRow}
                    keyExtractor={(item, index) =>
                        `${item.kind}-${index}-${'id' in item.data ? item.data.id : (item.data as UserSearchRow).user_id}`
                    }
                    contentContainerStyle={[
                        styles.listContent,
                        !hasQuery ? styles.dismissFill : null,
                        { paddingBottom: bottomSafeContentPadding(insets.bottom) },
                    ]}
                    onScrollBeginDrag={Keyboard.dismiss}
                    ListEmptyComponent={
                        loading && hasQuery ? (
                            <SearchResultsSkeleton />
                        ) : hasQuery ? (
                            <EmptySearch query={keyword} scope={scope} />
                        ) : (
                            <Pressable
                                style={styles.dismissFill}
                                onPress={dismissSearch}
                                accessibilityRole="button"
                                accessibilityLabel="Dismiss search"
                            >
                                <EmptySearch query={keyword} scope={scope} />
                            </Pressable>
                        )
                    }
                />
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    dismissFill: {
        flex: 1,
        flexGrow: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: SynthTokens.spacing.sm,
    },
    searchBar: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.medium,
        paddingHorizontal: SynthTokens.spacing.md,
        height: 48,
        gap: SynthTokens.spacing.sm,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: SynthTokens.colors.neutral900,
        paddingVertical: 0,
    },
    scopeScrollOuter: {
        flexGrow: 0,
        flexShrink: 0,
    },
    scopeScroll: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SynthTokens.spacing.md,
        gap: 8,
        paddingBottom: SynthTokens.spacing.sm,
        paddingTop: 4,
    },
    scopeChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
        flexShrink: 0,
    },
    scopeChipActive: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderColor: SynthTokens.colors.brandPink500,
    },
    scopeChipText: { fontWeight: '600', color: SynthTokens.colors.neutral900 },
    scopeChipTextActive: { color: SynthTokens.colors.neutral0 },
    allContent: {
        paddingTop: SynthTokens.spacing.sm,
        gap: 4,
    },
    listContent: {
        paddingTop: SynthTokens.spacing.sm,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
        paddingTop: SynthTokens.spacing.md,
        paddingBottom: 6,
    },
    sectionHeaderText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        color: SynthTokens.colors.neutral600,
    },
    seeAllText: {
        fontSize: 13,
        fontWeight: '600',
        color: PINK,
    },
    entityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: SynthTokens.spacing.md,
        marginBottom: 8,
        padding: 12,
        borderRadius: SynthTokens.radius.medium,
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    entityAvatar: { width: 44, height: 44, borderRadius: 10 },
    entityFallback: {
        backgroundColor: SynthTokens.colors.brandPink050,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    entityFallbackText: { fontWeight: '800', fontSize: 14, color: SynthTokens.colors.neutral600 },
    eventDateText: { fontSize: 10, fontWeight: '700', color: PINK, textAlign: 'center' },
    entityTitle: { fontWeight: '700', marginBottom: 2 },
    categoryPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderWidth: 1,
        borderColor: PINK,
    },
    categoryPillText: {
        fontSize: 11,
        fontWeight: '600',
        color: PINK,
    },
    empty: {
        padding: SynthTokens.spacing.xl,
        alignItems: 'center',
    },
    emptyState: {
        paddingTop: 64,
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: SynthTokens.spacing.xl,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    emptyHint: {
        textAlign: 'center',
        lineHeight: 20,
    },
});
