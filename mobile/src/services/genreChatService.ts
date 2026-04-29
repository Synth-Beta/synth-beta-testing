/**
 * Genre Chat Service
 * Manages persistent genre-based community group chats.
 * Uses entity_type='genre' + entity_id=slug on the chats table.
 */
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

export class GenreChatService {
    /**
     * Returns all genre chats with membership info for the given user.
     */
    static async getGenreChats(userId: string): Promise<GenreChatInfo[]> {
        try {
            // Fetch all existing genre chats
            const { data: chats } = await supabase
                .from('chats')
                .select('id, entity_id')
                .eq('entity_type', 'genre')
                .eq('is_group_chat', true);

            const chatByGenreId = new Map<string, string>();
            const chatIds: string[] = [];
            for (const c of chats || []) {
                if (c.entity_id) {
                    chatByGenreId.set(c.entity_id, c.id);
                    chatIds.push(c.id);
                }
            }

            // Fetch member counts for existing chats
            const memberCountByChatId = new Map<string, number>();
            if (chatIds.length > 0) {
                const { data: counts } = await supabase
                    .from('chat_participants')
                    .select('chat_id')
                    .in('chat_id', chatIds);
                for (const row of counts || []) {
                    memberCountByChatId.set(
                        row.chat_id,
                        (memberCountByChatId.get(row.chat_id) ?? 0) + 1
                    );
                }
            }

            // Fetch user's joined chats
            const joinedChatIds = new Set<string>();
            if (chatIds.length > 0) {
                const { data: myParticipation } = await supabase
                    .from('chat_participants')
                    .select('chat_id')
                    .eq('user_id', userId)
                    .in('chat_id', chatIds);
                for (const row of myParticipation || []) {
                    joinedChatIds.add(row.chat_id);
                }
            }

            return GENRE_CONFIGS.map(genre => {
                const chatId = chatByGenreId.get(genre.id) ?? null;
                return {
                    genre,
                    chatId,
                    memberCount: chatId ? (memberCountByChatId.get(chatId) ?? 0) : 0,
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
                // Create the genre chat on demand
                const { data: created, error } = await supabase
                    .from('chats')
                    .insert({
                        chat_name: `${genre.emoji} ${genre.fullName}`,
                        is_group_chat: true,
                        entity_type: 'genre',
                        entity_id: genreId,
                    })
                    .select('id')
                    .single();
                if (error || !created) {
                    // Race condition — another user may have just created it
                    const { data: retry } = await supabase
                        .from('chats')
                        .select('id')
                        .eq('entity_type', 'genre')
                        .eq('entity_id', genreId)
                        .eq('is_group_chat', true)
                        .maybeSingle();
                    if (!retry?.id) return null;
                    chatId = retry.id;
                } else {
                    chatId = created.id;
                }
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
