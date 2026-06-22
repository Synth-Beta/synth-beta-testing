import { supabase } from "@/lib/supabase";

export interface FeedEvent {
  event_id: string;
  title: string;
  artist_name: string;
  venue_name: string;
  venue_city?: string;
  event_date: string;
  image_url?: string;
  friends_going: number;
  my_relationship?: "interested" | "going" | "maybe" | null;
}

export interface Artist {
  id: string;
  name: string;
  genre?: string;
  image_url?: string;
  following: boolean;
}

export interface ConnectUser {
  user_id: string;
  name: string;
  avatar_url?: string;
  shared_events: number;
  connected: boolean;
}

export interface ChatItem {
  id: string;
  chat_name: string;
  is_group_chat: boolean;
  latest_message?: string;
  latest_message_at?: string;
  latest_sender?: string;
  unread: number;
  entity_type?: string | null;
}

export interface ProfileStats {
  reviews: number;
  events: number;
  friends: number;
  artists: number;
}

export interface UserProfile {
  user_id: string;
  name: string;
  avatar_url?: string;
  bio?: string;
  email?: string;
}

export async function fetchFeedEvents(userId: string): Promise<FeedEvent[]> {
  try {
    const today = new Date().toISOString();

    const { data: raw, error } = await supabase
      .from("events")
      .select(
        `id, title, event_date, venue_city, images, event_media_url, media_urls,
         artists(name), venues(name),
         user_event_relationships(user_id, relationship_type)`
      )
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(40);

    if (error) throw error;

    const events: FeedEvent[] = (raw ?? []).map((e: any) => {
      const rels: any[] = e.user_event_relationships ?? [];
      const myRel = rels.find((r: any) => r.user_id === userId);
      const friendsGoing = rels.filter((r: any) =>
        ["interested", "going", "maybe"].includes(r.relationship_type)
      ).length;

      let imageUrl: string | undefined;
      if (Array.isArray(e.images) && e.images.length > 0) {
        const best =
          e.images.find(
            (img: any) =>
              img?.url &&
              (img?.ratio === "16_9" || (img?.width && img.width > 1000))
          ) ?? e.images.find((img: any) => img?.url);
        imageUrl = best?.url;
      } else if (e.event_media_url) {
        imageUrl = e.event_media_url;
      } else if (Array.isArray(e.media_urls) && e.media_urls.length > 0) {
        imageUrl = e.media_urls[0];
      }

      return {
        event_id: e.id,
        title: e.title ?? e.artists?.name ?? "Event",
        artist_name: e.artists?.name ?? "Unknown Artist",
        venue_name: e.venues?.name ?? "Unknown Venue",
        venue_city: e.venue_city ?? undefined,
        event_date: e.event_date,
        image_url: imageUrl,
        friends_going: friendsGoing,
        my_relationship: myRel?.relationship_type ?? null,
      };
    });

    return events;
  } catch (err) {
    console.error("fetchFeedEvents error:", err);
    return [];
  }
}

export async function setEventRelationship(
  userId: string,
  eventId: string,
  type: "interested" | "going" | "maybe" | null
): Promise<void> {
  if (type === null) {
    await supabase
      .from("user_event_relationships")
      .delete()
      .eq("user_id", userId)
      .eq("event_id", eventId);
  } else {
    await supabase.from("user_event_relationships").upsert(
      { user_id: userId, event_id: eventId, relationship_type: type },
      { onConflict: "user_id,event_id" }
    );
  }
}

export async function fetchArtists(
  userId: string,
  search?: string
): Promise<Artist[]> {
  try {
    let query = supabase
      .from("artists")
      .select("id, name, genre, image_url, artist_follows(user_id)")
      .order("name", { ascending: true })
      .limit(50);

    if (search && search.length > 0) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((a: any) => ({
      id: a.id,
      name: a.name ?? "Unknown",
      genre: a.genre ?? undefined,
      image_url: a.image_url ?? undefined,
      following: (a.artist_follows ?? []).some(
        (f: any) => f.user_id === userId
      ),
    }));
  } catch (err) {
    console.error("fetchArtists error:", err);
    return [];
  }
}

export async function toggleArtistFollow(
  artistId: string,
  following: boolean
): Promise<void> {
  try {
    const { error } = await (supabase as any).rpc("set_artist_follow", {
      p_artist_id: artistId,
      p_following: following,
    });
    if (error) {
      if (following) {
        await supabase
          .from("artist_follows")
          .upsert({ artist_id: artistId }, { onConflict: "user_id,artist_id" });
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("artist_follows")
            .delete()
            .eq("artist_id", artistId)
            .eq("user_id", user.id);
        }
      }
    }
  } catch (err) {
    console.error("toggleArtistFollow error:", err);
  }
}

export async function fetchConnectUsers(
  userId: string
): Promise<ConnectUser[]> {
  try {
    const { data: myRels, error: myErr } = await supabase
      .from("user_event_relationships")
      .select("event_id")
      .eq("user_id", userId)
      .in("relationship_type", ["interested", "going", "maybe"])
      .limit(100);

    if (myErr || !myRels || myRels.length === 0) return [];

    const myEventIds = myRels.map((r: any) => r.event_id);

    const { data: others, error: othersErr } = await supabase
      .from("user_event_relationships")
      .select("user_id, event_id, users(user_id, name, avatar_url)")
      .in("event_id", myEventIds)
      .in("relationship_type", ["interested", "going", "maybe"])
      .neq("user_id", userId)
      .limit(200);

    if (othersErr || !others) return [];

    const { data: myFriends } = await supabase
      .from("user_relationships")
      .select("user_id, related_user_id")
      .eq("relationship_type", "friend")
      .eq("status", "accepted")
      .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

    const friendIds = new Set(
      (myFriends ?? []).map((f: any) =>
        f.user_id === userId ? f.related_user_id : f.user_id
      )
    );

    const userMap = new Map<string, { name: string; avatar_url?: string; events: Set<string> }>();
    for (const r of others as any[]) {
      const uid = r.user_id;
      const u = r.users;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          name: u?.name ?? "Synth User",
          avatar_url: u?.avatar_url ?? undefined,
          events: new Set(),
        });
      }
      userMap.get(uid)!.events.add(r.event_id);
    }

    const result: ConnectUser[] = [];
    userMap.forEach((val, uid) => {
      result.push({
        user_id: uid,
        name: val.name,
        avatar_url: val.avatar_url,
        shared_events: val.events.size,
        connected: friendIds.has(uid),
      });
    });

    result.sort((a, b) => b.shared_events - a.shared_events);
    return result.slice(0, 30);
  } catch (err) {
    console.error("fetchConnectUsers error:", err);
    return [];
  }
}

export async function sendFriendRequest(
  userId: string,
  targetUserId: string
): Promise<void> {
  await supabase.from("user_relationships").upsert(
    {
      user_id: userId,
      related_user_id: targetUserId,
      relationship_type: "friend",
      status: "pending",
    },
    { onConflict: "user_id,related_user_id" }
  );
}

export async function fetchChats(userId: string): Promise<ChatItem[]> {
  try {
    const { data: participants, error: pErr } = await supabase
      .from("chat_participants")
      .select("chat_id")
      .eq("user_id", userId);

    if (pErr || !participants || participants.length === 0) return [];

    const chatIds = participants.map((p: any) => p.chat_id);

    const { data: chats, error: cErr } = await supabase
      .from("chats")
      .select(
        `id, chat_name, is_group_chat, entity_type, updated_at, latest_message_id,
         messages!latest_message_id (content, is_encrypted, created_at, sender_id,
           users!messages_sender_id_fkey(name))`
      )
      .in("id", chatIds)
      .order("updated_at", { ascending: false })
      .limit(30);

    if (cErr || !chats) return [];

    return (chats as any[]).map((c) => {
      const msg = c.messages;
      let latestMsg: string | undefined;
      if (msg) {
        latestMsg =
          msg.is_encrypted ? "[Encrypted message]" : (msg.content ?? undefined);
      }

      return {
        id: c.id,
        chat_name: c.chat_name ?? "Chat",
        is_group_chat: c.is_group_chat ?? false,
        latest_message: latestMsg,
        latest_message_at: msg?.created_at ?? c.updated_at,
        latest_sender: msg?.users?.name ?? undefined,
        unread: 0,
        entity_type: c.entity_type ?? null,
      };
    });
  } catch (err) {
    console.error("fetchChats error:", err);
    return [];
  }
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("user_id, name, avatar_url, bio")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      user_id: data.user_id,
      name: data.name ?? "Synth User",
      avatar_url: data.avatar_url ?? undefined,
      bio: data.bio ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  try {
    const [reviewsRes, eventsRes, friendsRes] = await Promise.all([
      supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_public", true)
        .eq("is_draft", false),
      supabase
        .from("user_event_relationships")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("relationship_type", ["interested", "going", "maybe"]),
      supabase
        .from("user_relationships")
        .select("*", { count: "exact", head: true })
        .eq("relationship_type", "friend")
        .eq("status", "accepted")
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`),
    ]);

    return {
      reviews: reviewsRes.count ?? 0,
      events: eventsRes.count ?? 0,
      friends: friendsRes.count ?? 0,
      artists: 0,
    };
  } catch {
    return { reviews: 0, events: 0, friends: 0, artists: 0 };
  }
}
