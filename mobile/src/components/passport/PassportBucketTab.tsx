import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Building2, Music, Plus, Search, X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { BucketListService, type BucketListItem } from '../../services/bucketListService';
import { SearchService, type ArtistSearchRow, type VenueSearchRow } from '../../services/searchService';
import { EmptyState, SectionError, TabSkeleton } from './PassportPrimitives';

const PINK = SynthTokens.colors.brandPink500;

type SearchMode = 'artist' | 'venue';
type SearchHit =
    | { kind: 'artist'; id: string; name: string; imageUrl?: string; detail?: string }
    | { kind: 'venue'; id: string; name: string; imageUrl?: string; detail?: string };

export function PassportBucketTab({ userId, canEdit }: { userId: string; canEdit: boolean }) {
    const router = useRouter();
    const [items, setItems] = useState<BucketListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [mode, setMode] = useState<SearchMode>('artist');
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingId, setAddingId] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setItems(await BucketListService.getBucketList(userId));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void load();
    }, [load]);

    // Debounced search against the same artist/venue tables the web search boxes use.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const q = query.trim();
        if (!canEdit || q.length < 2) {
            setHits([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        debounceRef.current = setTimeout(() => {
            void (async () => {
                try {
                    if (mode === 'artist') {
                        const rows: ArtistSearchRow[] = await SearchService.searchArtists(q, 8);
                        setHits(rows.map(r => ({ kind: 'artist' as const, id: r.id, name: r.name, imageUrl: r.image_url })));
                    } else {
                        const rows: VenueSearchRow[] = await SearchService.searchVenues(q, 8);
                        setHits(rows.map(r => ({ kind: 'venue' as const, id: r.id, name: r.name, detail: r.city ?? undefined })));
                    }
                } finally {
                    setSearching(false);
                }
            })();
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, mode, canEdit]);

    const inList = useMemo(() => {
        const set = new Set<string>();
        for (const item of items) {
            if (item.entity_id) set.add(item.entity_id);
        }
        return set;
    }, [items]);

    const handleAdd = useCallback(
        (hit: SearchHit) => {
            void (async () => {
                setAddingId(hit.id);
                try {
                    const ok =
                        hit.kind === 'artist'
                            ? await BucketListService.addArtist(userId, hit.id, hit.name)
                            : await BucketListService.addVenue(userId, hit.id, hit.name);
                    if (ok) {
                        setQuery('');
                        setHits([]);
                        await load();
                    } else {
                        Alert.alert('Could not add', 'Please try again.');
                    }
                } finally {
                    setAddingId(null);
                }
            })();
        },
        [userId, load]
    );

    const handleRemove = useCallback(
        (item: BucketListItem) => {
            Alert.alert('Remove', `Remove ${item.entity_name} from your bucket list?`, [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () =>
                        void (async () => {
                            const ok = await BucketListService.removeItem(userId, item.id);
                            if (ok) setItems(prev => prev.filter(x => x.id !== item.id));
                        })(),
                },
            ]);
        },
        [userId]
    );

    const openItem = useCallback(
        (item: BucketListItem) => {
            const uuid = item.artist?.id || item.venue?.id || item.entity_id;
            if (!uuid) return;
            router.push(item.entity_type === 'venue' ? `/venue/${uuid}` : `/artist/${uuid}`);
        },
        [router]
    );

    if (loading) return <TabSkeleton cards={3} />;
    if (error) return <SectionError message={error} onRetry={() => void load()} />;

    return (
        <View>
            {canEdit ? (
                <View style={styles.addBox}>
                    <View style={styles.modeRow}>
                        <ModeChip label="Artists" icon={<Music size={13} color={mode === 'artist' ? PINK : SynthTokens.colors.neutral600} />} active={mode === 'artist'} onPress={() => setMode('artist')} />
                        <ModeChip label="Venues" icon={<Building2 size={13} color={mode === 'venue' ? PINK : SynthTokens.colors.neutral600} />} active={mode === 'venue'} onPress={() => setMode('venue')} />
                    </View>

                    <View style={styles.searchRow}>
                        <Search size={16} color={SynthTokens.colors.neutral400} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder={mode === 'artist' ? 'Search artists to add…' : 'Search venues to add…'}
                            placeholderTextColor={SynthTokens.colors.neutral400}
                            value={query}
                            onChangeText={setQuery}
                            autoCorrect={false}
                            returnKeyType="search"
                        />
                        {query.length > 0 ? (
                            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                                <X size={15} color={SynthTokens.colors.neutral400} />
                            </Pressable>
                        ) : null}
                    </View>

                    {searching ? (
                        <ActivityIndicator color={PINK} style={styles.searchSpinner} />
                    ) : hits.length > 0 ? (
                        <View style={styles.hitList}>
                            {hits.map(hit => {
                                const already = inList.has(hit.id);
                                return (
                                    <View key={`${hit.kind}-${hit.id}`} style={styles.hitRow}>
                                        <HitAvatar hit={hit} />
                                        <View style={{ flex: 1 }}>
                                            <SynthText variant="meta" style={styles.hitName} numberOfLines={1}>
                                                {hit.name}
                                            </SynthText>
                                            {hit.detail ? (
                                                <SynthText variant="meta" color="secondary" style={styles.hitDetail} numberOfLines={1}>
                                                    {hit.detail}
                                                </SynthText>
                                            ) : null}
                                        </View>
                                        {already ? (
                                            <SynthText variant="meta" color="secondary" style={styles.addedTxt}>
                                                Added
                                            </SynthText>
                                        ) : (
                                            <Pressable
                                                style={styles.addBtn}
                                                onPress={() => handleAdd(hit)}
                                                disabled={addingId != null}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Add ${hit.name}`}
                                            >
                                                {addingId === hit.id ? (
                                                    <ActivityIndicator size="small" color="#fff" />
                                                ) : (
                                                    <>
                                                        <Plus size={13} color="#fff" />
                                                        <SynthText variant="meta" style={styles.addBtnTxt}>
                                                            Add
                                                        </SynthText>
                                                    </>
                                                )}
                                            </Pressable>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    ) : query.trim().length >= 2 ? (
                        <SynthText variant="meta" color="secondary" style={styles.noHits}>
                            No {mode === 'artist' ? 'artists' : 'venues'} found for “{query.trim()}”.
                        </SynthText>
                    ) : null}
                </View>
            ) : null}

            {items.length === 0 ? (
                <EmptyState
                    title="Bucket list is empty"
                    hint={canEdit ? 'Search above to add artists you need to see and venues you need to visit.' : 'Nothing on the list yet.'}
                />
            ) : (
                items.map(item => (
                    <View key={item.id} style={styles.itemRow}>
                        <Pressable style={styles.itemMain} onPress={() => openItem(item)} accessibilityRole="button">
                            <ItemAvatar item={item} />
                            <View style={{ flex: 1 }}>
                                <SynthText variant="meta" style={styles.itemName} numberOfLines={1}>
                                    {item.entity_name}
                                </SynthText>
                                <SynthText variant="meta" color="secondary" style={styles.itemType}>
                                    {item.entity_type === 'venue' ? 'Venue' : 'Artist'}
                                </SynthText>
                            </View>
                        </Pressable>
                        {canEdit ? (
                            <Pressable
                                style={styles.removeBtn}
                                onPress={() => handleRemove(item)}
                                hitSlop={6}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${item.entity_name}`}
                            >
                                <X size={15} color={SynthTokens.colors.neutral600} />
                            </Pressable>
                        ) : null}
                    </View>
                ))
            )}
        </View>
    );
}

function ModeChip({ label, icon, active, onPress }: { label: string; icon: React.ReactNode; active: boolean; onPress: () => void }) {
    return (
        <Pressable style={[styles.modeChip, active && styles.modeChipOn]} onPress={onPress} accessibilityRole="button">
            {icon}
            <SynthText variant="meta" style={[styles.modeChipTxt, active && styles.modeChipTxtOn]}>
                {label}
            </SynthText>
        </Pressable>
    );
}

function HitAvatar({ hit }: { hit: SearchHit }) {
    if (hit.imageUrl) {
        return <Image source={{ uri: hit.imageUrl }} style={styles.avatar} />;
    }
    return (
        <View style={[styles.avatar, styles.avatarFallback]}>
            {hit.kind === 'venue' ? <Building2 size={14} color={PINK} /> : <Music size={14} color={PINK} />}
        </View>
    );
}

function ItemAvatar({ item }: { item: BucketListItem }) {
    const url = item.artist?.image_url || item.venue?.image_url;
    if (url) {
        return <Image source={{ uri: url }} style={styles.avatar} />;
    }
    return (
        <View style={[styles.avatar, styles.avatarFallback]}>
            {item.entity_type === 'venue' ? <Building2 size={14} color={PINK} /> : <Music size={14} color={PINK} />}
        </View>
    );
}

const styles = StyleSheet.create({
    addBox: {
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral50,
        padding: 12,
        marginBottom: 14,
    },
    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    modeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: SynthTokens.colors.neutral100,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    modeChipOn: { backgroundColor: SynthTokens.colors.brandPink050, borderColor: PINK },
    modeChipTxt: { fontSize: 13, fontWeight: '600', color: SynthTokens.colors.neutral600 },
    modeChipTxtOn: { color: PINK },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: 12,
        paddingHorizontal: 12,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 10,
        fontSize: 15,
        fontFamily: SynthTokens.typography.fontFamily.medium,
        color: SynthTokens.colors.neutral900,
    },
    searchSpinner: { marginTop: 12 },
    hitList: { marginTop: 8 },
    hitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    hitName: { fontWeight: '700' },
    hitDetail: { fontSize: 12.5 },
    addedTxt: { fontSize: 13 },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: PINK,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        minWidth: 58,
        justifyContent: 'center',
    },
    addBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
    noHits: { marginTop: 10, fontSize: 13.5 },

    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 8,
    },
    itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    itemName: { fontWeight: '700' },
    itemType: { fontSize: 12.5 },
    removeBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SynthTokens.colors.neutral100,
    },
    avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: SynthTokens.colors.neutral100 },
    avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: SynthTokens.colors.brandPink050 },
});
