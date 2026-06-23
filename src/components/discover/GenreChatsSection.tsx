/**
 * GenreChatsSection — genre community chat cards for the Discover page.
 * Shown below the Calendar / Tour Tracker section.
 */
import React, { useEffect, useState } from 'react';
import { MessageCircle, Users } from 'lucide-react';
import { GenreChatService, type GenreChatInfo } from '@/services/genreChatService';

const BRAND_PINK = 'var(--brand-pink-500, #e91e8c)';
const BRAND_PINK_LIGHT = 'rgba(233, 30, 140, 0.1)';

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
                background: 'var(--neutral-0)',
                borderRadius: '18px',
                borderLeft: '1px solid var(--neutral-150, #ebebeb)',
                borderRight: '1px solid var(--neutral-150, #ebebeb)',
                borderBottom: '1px solid var(--neutral-150, #ebebeb)',
                borderTop: `3px solid ${BRAND_PINK}`,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                minWidth: '160px',
                maxWidth: '190px',
                flex: '0 0 auto',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                transition: 'box-shadow 0.2s, transform 0.15s',
                cursor: 'default',
            }}
        >
            {/* Emoji */}
            <span style={{ fontSize: '30px', lineHeight: 1 }}>{genre.emoji}</span>

            {/* Name */}
            <div style={{
                fontWeight: 700,
                fontSize: '15px',
                color: 'var(--neutral-900)',
                lineHeight: 1.2,
            }}>
                {genre.name}
            </div>

            {/* Description */}
            <div style={{
                fontSize: '12px',
                color: 'var(--neutral-500)',
                lineHeight: 1.4,
                flexGrow: 1,
            }}>
                {genre.description}
            </div>

            {/* Member count */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                color: 'var(--neutral-400)',
                fontWeight: 500,
            }}>
                <Users size={12} style={{ flexShrink: 0 }} />
                {`${formatCount(memberCount)} ${memberCount === 1 ? 'member' : 'members'}`}
            </div>

            {/* Actions */}
            {isJoined && chatId ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                    {/* Joined badge */}
                    <div style={{
                        background: BRAND_PINK_LIGHT,
                        borderRadius: '8px',
                        padding: '6px 10px',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '12px',
                        color: BRAND_PINK,
                    }}>
                        ✓ Joined
                    </div>
                    {/* Open chat */}
                    <button
                        onClick={() => onNavigate(chatId)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            border: `1.5px solid ${BRAND_PINK}`,
                            background: 'transparent',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: '12px',
                            color: BRAND_PINK,
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = BRAND_PINK_LIGHT)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        <MessageCircle size={13} />
                        Open Chat
                    </button>
                    {/* Leave */}
                    <button
                        onClick={() => onLeave(chatId)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: 'var(--neutral-400)',
                            padding: '2px 0',
                            textAlign: 'center',
                        }}
                    >
                        Leave
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => onJoin(genre.id)}
                    disabled={joining}
                    style={{
                        marginTop: '4px',
                        background: joining ? 'var(--neutral-300)' : BRAND_PINK,
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '9px 14px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: joining ? 'default' : 'pointer',
                        transition: 'opacity 0.15s, transform 0.1s',
                        opacity: joining ? 0.7 : 1,
                    }}
                    onMouseEnter={e => { if (!joining) e.currentTarget.style.opacity = '0.85'; }}
                    onMouseLeave={e => { if (!joining) e.currentTarget.style.opacity = '1'; }}
                >
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
        <section style={{ marginTop: '40px', marginBottom: '8px' }}>
            {/* Header */}
            <div style={{ marginBottom: '16px' }}>
                <h2 style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--neutral-900)',
                    margin: 0,
                    fontFamily: 'var(--font-family)',
                }}>
                    Genre Communities
                </h2>
                <p style={{
                    margin: '4px 0 0',
                    fontSize: '14px',
                    color: 'var(--neutral-500)',
                    fontFamily: 'var(--font-family)',
                }}>
                    Join group chats with fans who share your taste
                </p>
            </div>

            {loading ? (
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    overflowX: 'auto',
                    paddingBottom: '8px',
                }}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{
                            minWidth: '160px',
                            height: '200px',
                            borderRadius: '18px',
                            background: 'var(--neutral-100)',
                            animation: 'pulse 1.5s ease-in-out infinite',
                            flexShrink: 0,
                        }} />
                    ))}
                </div>
            ) : (
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        overflowX: 'auto',
                        paddingBottom: '12px',
                        scrollbarWidth: 'none',
                    }}
                    className="hide-scrollbar"
                >
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
