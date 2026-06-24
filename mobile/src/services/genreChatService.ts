/**
 * Genre Chat Service
 * Manages persistent genre-based community group chats.
 * Uses entity_type='genre' + entity_id=slug on the chats table.
 */
import { getOrCreateGenreChat } from '@synth/shared';
import { supabase } from '../integrations/supabase/client';

export interface GenreConfig {
    id: string;       // slug, e.g. 'edm'
    name: string;     // display name, e.g. 'EDM'
    fullName: string; // chat room name, e.g. 'EDM / Electronic'
    emoji: string;
    color: string;    // hex accent
    description: string;
}

export const GENRE_CONFIGS: GenreConfig[] = [
    { id: 'edm', name: 'EDM', fullName: 'EDM / Electronic', emoji: '🎛️', color: '#7C3AED', description: 'Bass drops, festivals & raves' },
    { id: 'jam-bands', name: 'Jam Bands', fullName: 'Jam Bands', emoji: '🌀', color: '#059669', description: 'Dead & Co, Phish, and beyond' },
    { id: 'rock', name: 'Rock', fullName: 'Rock', emoji: '🎸', color: '#DC2626', description: 'Classic rock to modern anthems' },
    { id: 'hip-hop', name: 'Hip-Hop', fullName: 'Hip-Hop / Rap', emoji: '🎤', color: '#D97706', description: 'Live shows and rap concerts' },
    { id: 'indie', name: 'Indie / Alt', fullName: 'Indie & Alternative', emoji: '🎵', color: '#0891B2', description: 'Underground to indie-pop' },
    { id: 'jazz', name: 'Jazz & Blues', fullName: 'Jazz & Blues', emoji: '🎷', color: '#0284C7', description: 'Jazz clubs and blues festivals' },
    { id: 'metal', name: 'Metal', fullName: 'Metal & Punk', emoji: '🤘', color: '#64748B', description: 'Headbangers and pit crew' },
    { id: 'pop', name: 'Pop', fullName: 'Pop', emoji: '⭐', color: '#EC4899', description: 'Arenas, stadiums & top hits' },
    { id: 'rnb', name: 'R&B & Soul', fullName: 'R&B & Soul', emoji: '🕺', color: '#9333EA', description: 'Smooth vibes and soulful nights' },
    { id: 'country', name: 'Country', fullName: 'Country & Folk', emoji: '🤠', color: '#65A30D', description: 'Honky-tonk to folk festivals' },
    { id: 'classical', name: 'Classical', fullName: 'Classical & Orchestral', emoji: '🎻', color: '#92400E', description: 'Symphonies and chamber music' },
    { id: 'reggae', name: 'Reggae', fullName: 'Reggae & Ska', emoji: '🌴', color: '#16A34A', description: 'Roots, dancehall & ska' },
];

export interface GenreChatInfo {
    genre: GenreConfig;
    chatId: string | null;     // null if genre chat not created yet
    memberCount: number;
    isJoined: boolean;
}

interface GenreChatMemberCountRow {
    entity_id: string | null;
    chat_id: string | null;
    member_count: number | null;
}

export class GenreChatService {
    /**
     * Returns all genre chats with membership info for the given user.
     */
    static async getGenreChats(userId: string): Promise<GenreChatInfo[]> {
        try {
            const { data: stats, error: statsError } = await supabase.rpc<GenreChatMemberCountRow[]>(
                'get_genre_chat_member_counts'
            );
            if (statsError) throw statsError;

            const chatStatsByGenre = new Map<string, { chatId: string; memberCount: number }>();
            const chatIds = new Set<string>();
            for (const stat of stats || []) {
                if (!stat?.entity_id || !stat.chat_id) continue;
                const chatId = stat.chat_id;
                chatStatsByGenre.set(stat.entity_id, {
                    chatId,
                    memberCount: Number(stat.member_count ?? 0),
                });
                chatIds.add(chatId);
            }

            // Fetch user's joined chats
            const joinedChatIds = new Set<string>();
            if (chatIds.size > 0) {
                const { data: myParticipation } = await supabase
                    .from('chat_participants')
                    .select('chat_id')
                    .eq('user_id', userId)
                    .in('chat_id', Array.from(chatIds));
                for (const row of myParticipation || []) {
                    if (row.chat_id) {
                        joinedChatIds.add(row.chat_id);
                    }
                }
            }

            return GENRE_CONFIGS.map(genre => {
                const stats = chatStatsByGenre.get(genre.id);
                const chatId = stats?.chatId ?? null;
                return {
                    genre,
                    chatId,
                    memberCount: stats ? stats.memberCount : 0,
                    isJoined: chatId ? joinedChatIds.has(chatId) : false,
                };
            });
        } catch (err) {
            console.error('[GenreChatService] getGenreChats', err);
            return GENRE_CONFIGS.map(genre => ({
                genre, chatId: null, memberCount: 0, isJoined: false,
            }));
        }
    }

    /**
     * Find or create the genre chat, then join the user.
     * Returns the chatId on success.
     */
    static async joinGenre(genreId: string, userId: string): Promise<string | null> {
        try {
            const genre = GENRE_CONFIGS.find(g => g.id === genreId);
            if (!genre) return null;

            // Find existing genre chat
            let chatId: string | null = null;
            const { data: existing } = await supabase
                .from('chats')
                .select('id')
                .eq('entity_type', 'genre')
                .eq('entity_id', genreId)
                .eq('is_group_chat', true)
                .maybeSingle();

            if (existing?.id) {
                chatId = existing.id;
            } else {
                const { chatId: createdId, error: rpcError } = await getOrCreateGenreChat(
                    supabase,
                    genreId,
                    `${genre.emoji} ${genre.fullName}`
                );
                if (rpcError || !createdId) {
                    console.error('[GenreChatService] joinGenre get_or_create_genre_chat:', rpcError);
                    return null;
                }
                chatId = createdId;
            }

            // Join — insert or do nothing if already a member
            const { error: joinError } = await supabase
                .from('chat_participants')
                .insert({ chat_id: chatId, user_id: userId })
                .select();

            if (joinError && joinError.code !== '23505') {
                // 23505 = unique_violation (already a member), which is fine
                console.error('[GenreChatService] joinGenre chat_participants insert:', joinError);
                return null;
            }

            return chatId;
        } catch (err) {
            console.error('[GenreChatService] joinGenre', err);
            return null;
        }
    }

    /**
     * Leave a genre chat.
     */
    static async leaveGenre(chatId: string, userId: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('chat_participants')
                .delete()
                .eq('chat_id', chatId)
                .eq('user_id', userId);
            return !error;
        } catch (err) {
            console.error('[GenreChatService] leaveGenre', err);
            return false;
        }
    }
}
