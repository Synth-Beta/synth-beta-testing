/**
 * GenreChatsSection — sliding genre community cards, shown at the top of Messages.
 */
import React, { useEffect, useState } from 'react';
import { MessageCircle, Users } from 'lucide-react';
import { GenreChatService, type GenreChatInfo } from '@/services/genreChatService';

function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

interface Props {
    currentUserId: string;
    onNavigateToChat?: (chatId: string) => void;
}

function GenreCard({
    info,
    onJoin,
    onLeave,
    onNavigate,
    joining,
}: {
    info: GenreChatInfo;
    onJoin: (genreId: string) => void;
    onLeave: (chatId: string) => void;
    onNavigate: (chatId: string) => void;
    joining: boolean;
}) {
    const { genre, chatId, memberCount, isJoined } = info;

    return (
        <div
            style={{
                background: '#FFFDFA',
                borderRadius: 16,
                border: '0.5px solid rgba(60, 60, 67, 0.1)',
                padding: 14,
                minWidth: 168,
                maxWidth: 200,
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}
        >
            <span style={{ fontSize: 26, lineHeight: 1 }}>{genre.emoji}</span>
            <div style={{ fontWeight: 650, fontSize: 15, color: 'var(--neutral-900)', lineHeight: 1.2 }}>{genre.name}</div>
            <div style={{ fontSize: 12, color: 'var(--neutral-600)', lineHeight: 1.35, flexGrow: 1 }}>{genre.description}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--neutral-600)' }}>
                <Users size={12} />
                {`${formatCount(memberCount)} ${memberCount === 1 ? 'member' : 'members'}`}
            </div>
            {isJoined && chatId ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" className="thread-btn thread-btn--interest" onClick={() => onNavigate(chatId)}>
                        <MessageCircle size={14} />
                        Open
                    </button>
                    <button type="button" onClick={() => onLeave(chatId)} style={{ background: 'none', border: 'none', color: 'var(--neutral-600)', fontSize: 12, cursor: 'pointer' }}>
                        Leave
                    </button>
                </div>
            ) : (
                <button type="button" className="thread-btn thread-btn--interest" disabled={joining} onClick={() => onJoin(genre.id)}>
                    {joining ? 'Joining…' : 'Join'}
                </button>
            )}
        </div>
    );
}

export function GenreChatsSection({ currentUserId, onNavigateToChat }: Props) {
    const [genres, setGenres] = useState<GenreChatInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [joiningId, setJoiningId] = useState<string | null>(null);

    useEffect(() => {
        void GenreChatService.getGenreChats(currentUserId).then(data => {
            setGenres(data);
            setLoading(false);
        });
    }, [currentUserId]);

    const handleJoin = async (genreId: string) => {
        setJoiningId(genreId);
        try {
            const chatId = await GenreChatService.joinGenre(genreId, currentUserId);
            if (chatId) {
                setGenres(prev =>
                    prev.map(g =>
                        g.genre.id === genreId
                            ? { ...g, chatId, isJoined: true, memberCount: g.memberCount + 1 }
                            : g
                    )
                );
            } else {
                alert('Could not join chat. Please try again.');
            }
        } catch {
            alert('Could not join chat. Please try again.');
        } finally {
            setJoiningId(null);
        }
    };

    const handleLeave = async (chatId: string) => {
        const ok = await GenreChatService.leaveGenre(chatId, currentUserId);
        if (ok) {
            setGenres(prev =>
                prev.map(g =>
                    g.chatId === chatId
                        ? { ...g, isJoined: false, memberCount: Math.max(0, g.memberCount - 1) }
                        : g
                )
            );
        }
    };

    const handleNavigate = (chatId: string) => {
        onNavigateToChat?.(chatId);
    };

    return (
        <section style={{ marginBottom: 28 }}>
            <div className="feed-banner" style={{ paddingLeft: 2, paddingRight: 2 }}>
                <h2>Communities</h2>
                <p>Group chats for fans who share your taste.</p>
            </div>
            {loading ? (
                <div style={{ color: 'var(--neutral-600)', fontSize: 14, padding: '8px 2px' }}>Loading communities…</div>
            ) : (
                <div className="hide-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
                    {genres.map(info => (
                        <GenreCard
                            key={info.genre.id}
                            info={info}
                            onJoin={handleJoin}
                            onLeave={handleLeave}
                            onNavigate={handleNavigate}
                            joining={joiningId === info.genre.id}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
