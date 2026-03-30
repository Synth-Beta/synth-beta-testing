import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet,
    View,
    TextInput,
    FlatList,
    Pressable,
    Keyboard,
    ScrollView,
    Image,
} from 'react-native';
import {
    Search as SearchIcon,
    X,
    Calendar as CalendarIcon,
    Map as MapIcon,
} from 'lucide-react-native';
import { SynthText } from './SynthText';
import { SynthTokens } from '../tokens/SynthTokens';
import {
    SearchService,
    SearchResult,
    SearchScope,
    ArtistSearchRow,
    VenueSearchRow,
    UserSearchRow,
} from '../services/searchService';
import { EventCard } from './Feed/EventCard';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Row =
    | { kind: 'event'; data: SearchResult }
    | { kind: 'artist'; data: ArtistSearchRow }
    | { kind: 'venue'; data: VenueSearchRow }
    | { kind: 'user'; data: UserSearchRow };

const SCOPES: { key: SearchScope; label: string }[] = [
    { key: 'events', label: 'Events' },
    { key: 'artists', label: 'Artists' },
    { key: 'venues', label: 'Venues' },
    { key: 'users', label: 'Users' },
];

export default function SearchScreen() {
    const [keyword, setKeyword] = useState('');
    const [scope, setScope] = useState<SearchScope>('events');
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const runSearch = useCallback(async () => {
        const q = keyword.trim();
        if (q.length < 2) {
            setRows([]);
            return;
        }
        setLoading(true);
        try {
            if (scope === 'events') {
                const data = await SearchService.searchEvents(q);
                setRows(data.map(d => ({ kind: 'event', data: d })));
            } else if (scope === 'artists') {
                const data = await SearchService.searchArtists(q);
                setRows(data.map(d => ({ kind: 'artist', data: d })));
            } else if (scope === 'venues') {
                const data = await SearchService.searchVenues(q);
                setRows(data.map(d => ({ kind: 'venue', data: d })));
            } else {
                const data = await SearchService.searchUsers(q);
                setRows(data.map(d => ({ kind: 'user', data: d })));
            }
        } finally {
            setLoading(false);
        }
    }, [keyword, scope]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void runSearch();
        }, 450);
        return () => clearTimeout(timer);
    }, [runSearch]);

    const renderRow = ({ item }: { item: Row }) => {
        if (item.kind === 'event') {
            const e = item.data;
            return (
                <EventCard
                    id={e.id}
                    title={e.title}
                    artist_name={e.artist_name}
                    venue_name={e.venue_name}
                    event_date={e.event_date}
                    image_url={e.image_url}
                    onPress={() => router.push(`/event/${e.id}`)}
                />
            );
        }
        if (item.kind === 'artist') {
            const a = item.data;
            return (
                <Pressable
                    style={styles.entityRow}
                    onPress={() => {
                        Keyboard.dismiss();
                        router.push(`/artist/${a.id}`);
                    }}
                >
                    {a.image_url ? (
                        <Image source={{ uri: a.image_url }} style={styles.entityAvatar} />
                    ) : (
                        <View style={[styles.entityAvatar, styles.entityFallback]}>
                            <SynthText variant="meta" style={styles.entityFallbackText}>
                                {a.name.charAt(0).toUpperCase()}
                            </SynthText>
                        </View>
                    )}
                    <View style={{ flex: 1 }}>
                        <SynthText variant="meta" style={styles.entityTitle}>
                            {a.name}
                        </SynthText>
                        <SynthText variant="meta" color="secondary">
                            Artist
                        </SynthText>
                    </View>
                </Pressable>
            );
        }
        if (item.kind === 'venue') {
            const v = item.data;
            return (
                <Pressable
                    style={styles.entityRow}
                    onPress={() => {
                        Keyboard.dismiss();
                        router.push(`/venue/${v.id}`);
                    }}
                >
                    <View style={[styles.entityAvatar, styles.entityFallback]}>
                        <SynthText variant="meta" style={styles.entityFallbackText}>
                            V
                        </SynthText>
                    </View>
                    <View style={{ flex: 1 }}>
                        <SynthText variant="meta" style={styles.entityTitle}>
                            {v.name}
                        </SynthText>
                        <SynthText variant="meta" color="secondary">
                            {v.city ? `${v.city} · Venue` : 'Venue'}
                        </SynthText>
                    </View>
                </Pressable>
            );
        }
        const u = item.data;
        return (
            <Pressable
                style={styles.entityRow}
                onPress={() => {
                    Keyboard.dismiss();
                    router.push(`/user/${u.user_id}`);
                }}
            >
                {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={styles.entityAvatar} />
                ) : (
                    <View style={[styles.entityAvatar, styles.entityFallback]}>
                        <SynthText variant="meta" style={styles.entityFallbackText}>
                            {(u.name || u.username || '?').charAt(0).toUpperCase()}
                        </SynthText>
                    </View>
                )}
                <View style={{ flex: 1 }}>
                    <SynthText variant="meta" style={styles.entityTitle}>
                        {u.name || u.username || 'User'}
                    </SynthText>
                    <SynthText variant="meta" color="secondary">
                        {u.username ? `@${u.username}` : 'User'}
                    </SynthText>
                </View>
            </Pressable>
        );
    };

    const emptyText =
        keyword.trim().length > 2 && !loading
            ? `No ${scope} found for "${keyword.trim()}"`
            : null;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <View style={styles.searchBar}>
                    <SearchIcon size={20} color={SynthTokens.colors.neutral400} />
                    <TextInput
                        placeholder="Search events, artists, venues, users…"
                        placeholderTextColor={SynthTokens.colors.neutral400}
                        style={styles.input}
                        value={keyword}
                        onChangeText={setKeyword}
                        autoCorrect={false}
                    />
                    {keyword.length > 0 && (
                        <Pressable onPress={() => setKeyword('')}>
                            <X size={20} color={SynthTokens.colors.neutral400} />
                        </Pressable>
                    )}
                </View>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scopeScroll}
                keyboardShouldPersistTaps="handled"
            >
                {SCOPES.map(s => {
                    const active = scope === s.key;
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
                            </SynthText>
                        </Pressable>
                    );
                })}
            </ScrollView>

            <View style={styles.tabsRow}>
                <Pressable style={[styles.tab, styles.activeTab]}>
                    <SearchIcon size={16} color={SynthTokens.colors.neutral900} />
                    <SynthText variant="meta" style={styles.activeTabText}>
                        Search
                    </SynthText>
                </Pressable>
                <Pressable style={styles.tab} onPress={() => router.push('/(tabs)/discover')}>
                    <CalendarIcon size={16} color={SynthTokens.colors.neutral600} />
                    <SynthText variant="meta" color="secondary">
                        Calendar
                    </SynthText>
                </Pressable>
                <Pressable style={styles.tab} onPress={() => router.push('/(tabs)/discover')}>
                    <MapIcon size={16} color={SynthTokens.colors.neutral600} />
                    <SynthText variant="meta" color="secondary">
                        Tours
                    </SynthText>
                </Pressable>
            </View>

            <FlatList
                data={rows}
                renderItem={renderRow}
                keyExtractor={(item, index) => `${item.kind}-${index}-${JSON.stringify(item.data)}`}
                contentContainerStyle={styles.listContent}
                onScrollBeginDrag={Keyboard.dismiss}
                ListEmptyComponent={
                    emptyText ? (
                        <View style={styles.empty}>
                            <SynthText variant="body" color="secondary">
                                {emptyText}
                            </SynthText>
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
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
        backgroundColor: SynthTokens.colors.neutral100,
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
    },
    scopeScroll: {
        paddingHorizontal: SynthTokens.spacing.md,
        gap: 8,
        paddingBottom: SynthTokens.spacing.sm,
    },
    scopeChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    scopeChipActive: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderColor: SynthTokens.colors.brandPink500,
    },
    scopeChipText: { fontWeight: '600', color: SynthTokens.colors.neutral900 },
    scopeChipTextActive: { color: SynthTokens.colors.neutral0 },
    tabsRow: {
        flexDirection: 'row',
        paddingHorizontal: SynthTokens.spacing.md,
        gap: SynthTokens.spacing.md,
        paddingVertical: SynthTokens.spacing.sm,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: 8,
        borderRadius: SynthTokens.radius.full,
    },
    activeTab: {
        backgroundColor: SynthTokens.colors.neutral200,
    },
    activeTabText: {
        fontWeight: 'bold',
    },
    listContent: {
        paddingVertical: SynthTokens.spacing.md,
    },
    empty: {
        padding: SynthTokens.spacing.xl,
        alignItems: 'center',
    },
    entityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: SynthTokens.spacing.md,
        marginBottom: 12,
        padding: 12,
        borderRadius: SynthTokens.radius.medium,
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    entityAvatar: { width: 48, height: 48, borderRadius: 24 },
    entityFallback: {
        backgroundColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    entityFallbackText: { fontWeight: '800', fontSize: 18 },
    entityTitle: { fontWeight: '700' },
});
