import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TextInput, FlatList, Pressable, Keyboard } from 'react-native';
import { Search as SearchIcon, X, Calendar as CalendarIcon, Map as MapIcon, SlidersHorizontal } from 'lucide-react-native';
import { SynthText } from './SynthText';
import { SynthTokens } from '../tokens/SynthTokens';
import { SearchService, SearchResult } from '../services/searchService';
import { EventCard } from './Feed/EventCard';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SearchScreen() {
    const [keyword, setKeyword] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const insets = useSafeAreaInsets();
    const router = useRouter();

    useEffect(() => {
        const timer = setTimeout(() => {
            if (keyword.length > 2) handleSearch();
        }, 500);
        return () => clearTimeout(timer);
    }, [keyword]);

    const handleSearch = async () => {
        setLoading(true);
        const data = await SearchService.searchEvents(keyword);
        setResults(data);
        setLoading(false);
    };

    const renderItem = ({ item }: { item: SearchResult }) => (
        <EventCard
            id={item.id}
            title={item.title}
            artist_name={item.artist_name}
            venue_name={item.venue_name}
            event_date={item.event_date}
            image_url={item.image_url}
            onPress={() => router.push(`/event/${item.id}`)}
        />
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <View style={styles.searchBar}>
                    <SearchIcon size={20} color={SynthTokens.colors.neutral400} />
                    <TextInput
                        placeholder="Search artists, venues, events..."
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
                <Pressable style={styles.filterButton}>
                    <SlidersHorizontal size={20} color={SynthTokens.colors.neutral900} />
                </Pressable>
            </View>

            <View style={styles.tabsRow}>
                <Pressable style={[styles.tab, styles.activeTab]}>
                    <SearchIcon size={16} color={SynthTokens.colors.neutral900} />
                    <SynthText variant="meta" style={styles.activeTabText}>Search</SynthText>
                </Pressable>
                <Pressable style={styles.tab} onPress={() => console.log('Calendar')}>
                    <CalendarIcon size={16} color={SynthTokens.colors.neutral600} />
                    <SynthText variant="meta" color="secondary">Calendar</SynthText>
                </Pressable>
                <Pressable style={styles.tab} onPress={() => console.log('Tours')}>
                    <MapIcon size={16} color={SynthTokens.colors.neutral600} />
                    <SynthText variant="meta" color="secondary">Tours</SynthText>
                </Pressable>
            </View>

            <FlatList
                data={results}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                onScrollBeginDrag={Keyboard.dismiss}
                ListEmptyComponent={
                    !loading && keyword.length > 2 ? (
                        <View style={styles.empty}>
                            <SynthText variant="body" color="secondary">No events found matching "{keyword}"</SynthText>
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
        gap: SynthTokens.spacing.sm,
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
        fontFamily: 'Inter-Medium',
    },
    filterButton: {
        width: 48,
        height: 48,
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: SynthTokens.radius.medium,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
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
    }
});
