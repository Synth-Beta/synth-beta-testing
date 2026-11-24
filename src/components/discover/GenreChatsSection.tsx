/**
 * GenreChatsSection — sliding genre community cards, shown at the top of Messages.
 */
import React, { useEffect, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { GenreChatService, pastelFromHex, type GenreChatInfo } from '@/services/genreChatService';

function formatCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

interface Props {
    currentUserId: string;
    onNavigateToChat?: (chatId: string) => void;
    /** 'rail' scrolls sideways (Messages); 'list' stacks rows for the Home desktop side panel. */
    layout?: 'rail' | 'list';
    /** List layout shows this many; Messages has the full set. */
    limit?: number;
}

function GenreCard({
    info,
    onJoin,
    onLeave,
    onNavigate,
    joining,
    isList,
}: {
    info: GenreChatInfo;
    onJoin: (genreId: string) => void;
    onLeave: (chatId: string) => void;
    onNavigate: (chatId: string) => void;
    joining: boolean;
    isList: boolean;
}) {
    const { genre, chatId, memberCount, isJoined } = info;
    const members = `${formatCount(memberCount)} ${memberCount === 1 ? 'member' : 'members'}`;

    return (
        // Compact row card: the genre's own tint is the only surface cue (no border, no shadow).
        <div
            className={isList
                ? 'flex h-14 w-full items-center gap-3 rounded-xl pl-3 pr-2'
                : 'flex h-16 w-[248px] shrink-0 items-center gap-3 rounded-xl pl-3 pr-2'}
            style={isList ? undefined : { background: pastelFromHex(genre.color) }}
        >
            {/* Same emoji mark the chat list uses for this community, so the two read as one thing.
                In the side panel the tint moves onto this tile, so five rows don't stack five colors. */}
            <span
                className={isList ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[18px] leading-none' : 'text-[22px] leading-none'}
                style={isList ? { background: pastelFromHex(genre.color) } : undefined}
                aria-hidden="true"
            >
                {genre.emoji}
            </span>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold leading-5 text-[var(--neutral-900)]">{genre.name}</div>
                <div className="truncate text-xs leading-4 text-[var(--neutral-600)] tabular-nums">
                    {members}
                    {isJoined && chatId && (
                        <>
                            {' · '}
                            <button type="button" onClick={() => onLeave(chatId)} className="text-[var(--neutral-600)] underline-offset-2 hover:underline">
                                Leave
                            </button>
                        </>
                    )}
                </div>
            </div>
            {isJoined && chatId ? (
                <button
                    type="button"
                    onClick={() => onNavigate(chatId)}
                    className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition-transform duration-150 active:scale-[0.96] ${isList ? 'bg-[var(--brand-pink-050)] text-[var(--brand-pink-500)]' : 'bg-[var(--neutral-0)] text-[var(--neutral-900)]'}`}
                >
                    Open
                </button>
            ) : (
                <button
                    type="button"
                    disabled={joining}
                    onClick={() => onJoin(genre.id)}
                    // Ink, not the genre color: white on amber/lime/cyan fails 4.5:1 at 12px.
                    // In the side panel five ink pills would outshout the feed, so Join goes quiet there.
                    className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition-[opacity,transform] duration-150 active:scale-[0.96] disabled:opacity-60 ${isList ? 'bg-[var(--neutral-100)] text-[var(--neutral-900)] hover:bg-[var(--neutral-200)]' : 'bg-[var(--neutral-900)] text-white'}`}
                >
                    {joining ? 'Joining…' : 'Join'}
                </button>
            )}
        </div>
    );
}

export function GenreChatsSection({ currentUserId, onNavigateToChat, layout = 'rail', limit }: Props) {
    const isList = layout === 'list';
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
                toast({ title: "Couldn't join", description: 'Try again in a moment.', variant: 'destructive' });
            }
        } catch {
            toast({ title: "Couldn't join", description: 'Try again in a moment.', variant: 'destructive' });
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
        <section style={isList ? undefined : { marginBottom: 24 }} aria-label="Communities">
            <h2 className={`pb-2 text-[13px] font-semibold text-[var(--neutral-600)] ${isList ? 'px-3' : ''}`} style={isList ? undefined : { paddingLeft: 2 }}>Communities</h2>
            {loading ? (
                <div className={`flex gap-2 overflow-hidden ${isList ? 'flex-col' : ''}`} aria-busy="true">
                    {[0, 1, 2].map(i => (
                        <div key={i} className={`shrink-0 rounded-xl animate-shimmer ${isList ? 'h-14 w-full' : 'h-16 w-[248px]'}`} />
                    ))}
                </div>
            ) : (
                <div className={isList ? 'flex flex-col' : 'scrollbar-hide flex gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]'}>
                    {(limit ? genres.slice(0, limit) : genres).map(info => (
                        <GenreCard
                            key={info.genre.id}
                            info={info}
                            onJoin={handleJoin}
                            onLeave={handleLeave}
                            onNavigate={handleNavigate}
                            joining={joiningId === info.genre.id}
                            isList={isList}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
