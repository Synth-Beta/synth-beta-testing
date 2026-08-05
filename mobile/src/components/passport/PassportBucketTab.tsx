import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Building2, ChevronDown, ChevronUp, Music, Plus, Search, X } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { BucketListService, type BucketListItem } from '../../services/bucketListService';
import { SearchService, type ArtistSearchRow } from '../../services/searchService';
import { EmptyState, SectionError, TabSkeleton } from './PassportPrimitives';

const PINK = SynthTokens.colors.brandPink500;

type SearchHit = { kind: 'artist'; id: string; name: string; imageUrl?: string; detail?: string };

export function PassportBucketTab({ userId, canEdit }: { userId: string; canEdit: boolean }) {
    const router = useRouter();
    const [items, setItems] = useState<BucketListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingId, setAddingId] = useState<string | null>(null);
    const [reordering, setReordering] = useState(false);
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

    // Debounced search against the same artist table the web search box uses.
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
                    const rows: ArtistSearchRow[] = await SearchService.searchArtists(q, 8);
                    setHits(rows.map(r => ({ kind: 'artist' as const, id: r.id, name: r.name, imageUrl: r.image_url })));
                } finally {
                    setSearching(false);
                }
            })();
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, canEdit]);

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
                    const ok = await BucketListService.addArtist(userId, hit.id, hit.name);
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

    const handleReorder = useCallback(
        (index: number, dir: 'up' | 'down') => {
            if (!canEdit || reordering) return;
            const newIndex = dir === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= items.length) return;

            const reordered = items.slice();
            [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
            setItems(reordered);

            void (async () => {
                setReordering(true);
                try {
                    await BucketListService.reorderBucketList(userId, reordered.map(i => i.id));
                } catch (e) {
                    console.error('Error reordering bucket list:', e);
                    await load();
                } finally {
                    setReordering(false);
                }
            })();
        },
        [canEdit, reordering, items, userId, load]
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
                    <View style={styles.searchRow}>
                        <Search size={16} color={SynthTokens.colors.neutral400} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search artists to add…"
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
                            No artists found for “{query.trim()}”.
                        </SynthText>
                    ) : null}
                </View>
            ) : null}

            {items.length === 0 ? (
                <EmptyState
                    title="Bucket list is empty"
                    hint={canEdit ? 'Search above to add artists you need to see.' : 'Nothing on the list yet.'}
                />
            ) : (
                items.map((item, index) => (
                    <View key={item.id} style={styles.itemRow}>
                        {canEdit ? (
                            <View style={styles.rankArrows}>
                                <Pressable
                                    style={styles.rankArrowBtn}
                                    disabled={index === 0 || reordering}
                                    onPress={() => handleReorder(index, 'up')}
                                    hitSlop={4}
                                    accessibilityRole="button"
                                    accessibilityLabel="Move up"
                                >
                                    <ChevronUp size={16} color={index === 0 ? SynthTokens.colors.neutral400 : SynthTokens.colors.neutral600} />
                                </Pressable>
                                <Pressable
                                    style={styles.rankArrowBtn}
                                    disabled={index === items.length - 1 || reordering}
                                    onPress={() => handleReorder(index, 'down')}
                                    hitSlop={4}
                                    accessibilityRole="button"
                                    accessibilityLabel="Move down"
                                >
                                    <ChevronDown size={16} color={index === items.length - 1 ? SynthTokens.colors.neutral400 : SynthTokens.colors.neutral600} />
                                </Pressable>
                            </View>
                        ) : null}
                        <View style={styles.rankBadge}>
                            <SynthText variant="meta" style={styles.rankBadgeTxt}>{index + 1}</SynthText>
                        </View>
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

function HitAvatar({ hit }: { hit: SearchHit }) {
    if (hit.imageUrl) {
        return <Image source={{ uri: hit.imageUrl }} style={styles.avatar} />;
    }
    return (
        <View style={[styles.avatar, styles.avatarFallback]}>
            <Music size={14} color={PINK} />
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
    rankArrows: { marginRight: 6 },
    rankArrowBtn: { paddingVertical: 1, paddingHorizontal: 2 },
    rankBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    rankBadgeTxt: { fontSize: 11, fontWeight: '700', color: SynthTokens.colors.neutral600 },
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
