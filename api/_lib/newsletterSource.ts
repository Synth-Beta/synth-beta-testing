type Db = { from: (table: string) => any };

const NEWS_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;
const NEARBY_MILES = 75;
const FEEDS = [
  { source: "Pitchfork", url: "https://pitchfork.com/rss/news/" },
  { source: "Rolling Stone", url: "https://www.rollingstone.com/music/rss/" },
  { source: "NME", url: "https://www.nme.com/music/feed/" },
  { source: "Billboard", url: "https://www.billboard.com/feed/" },
];

const readAll = async (makeQuery: () => any, label: string) => {
  const rows: any[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await makeQuery().range(offset, offset + size - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
};

const requireRows = (result: { data: any[] | null; error: { message: string } | null }, label: string) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
};

const chunk = <T,>(items: T[], size: number) => {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
};

const artistNamesFromProfile = (profileData: any) => {
  if (!profileData || typeof profileData !== "object") return [];
  const byRange = profileData.topArtistsByTimeRange;
  const list = byRange?.medium_term ?? byRange?.short_term ?? byRange?.long_term ?? profileData.topArtists ?? [];
  const names: string[] = [];
  for (const artist of list) {
    const name = String(artist?.name || artist?.attributes?.name || "").trim();
    if (!name || names.some((existing) => existing.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
    if (names.length === 8) break;
  }
  return names;
};

const genresFromPreferences = (row: any) => {
  if (Array.isArray(row?.top_genres) && row.top_genres.length) {
    return row.top_genres.map((genre: any) => String(genre)).filter(Boolean).slice(0, 6);
  }
  const scores = row?.genre_preference_scores;
  if (!scores || typeof scores !== "object") return [];
  return Object.entries(scores)
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, 6)
    .map(([genre]) => genre);
};

const loadListeningStats = async (db: Db, userIds: string[]) => {
  const stats: any[] = [];
  for (const ids of chunk(userIds, 40)) {
    if (!ids.length) continue;
    const profiles = await readAll(() => db.from("streaming_profiles")
      .select("user_id, service_type, profile_data, last_updated")
      .in("user_id", ids)
      .order("last_updated", { ascending: false })
      .order("user_id"), "Load listening history");
    const preferences = await readAll(() => db.from("user_preferences")
      .select("user_id, top_genres, genre_preference_scores")
      .in("user_id", ids)
      .order("user_id"), "Load listening genres");
    const genresByUser = new Map(preferences.map((row) => [row.user_id, genresFromPreferences(row)]));
    const seen = new Set<string>();
    for (const profile of profiles) {
      if (!profile.user_id || seen.has(profile.user_id)) continue;
      seen.add(profile.user_id);
      stats.push({
        user_id: profile.user_id,
        service_type: profile.service_type ?? null,
        top_artists: artistNamesFromProfile(profile.profile_data).map((name: string) => ({ name })),
        top_genres: (genresByUser.get(profile.user_id) ?? []).map((genre: string) => ({ genre })),
      });
    }
    for (const [userId, genres] of genresByUser) {
      if (seen.has(userId) || !genres.length) continue;
      stats.push({ user_id: userId, service_type: null, top_artists: [], top_genres: genres.map((genre: string) => ({ genre })) });
    }
  }
  return stats;
};

const enrichReviewArtists = async (db: Db, reviews: any[]) => {
  const ids = [...new Set(reviews.map((row) => row.user_created_artist_id).filter(Boolean))];
  const names = new Map<string, string>();
  for (const group of chunk(ids, 100)) {
    const artists = await readAll(() => db.from("user_created_artists").select("id, name").in("id", group).order("id"), "Load manually entered artists");
    for (const artist of artists) names.set(artist.id, artist.name);
  }
  return reviews.map((row) => ({
    ...row,
    artistName: row.artists?.name ?? names.get(row.user_created_artist_id) ?? row.setlist?.artist?.name,
  }));
};

const canonicalState = (value?: string | null) => {
  const names: Record<string, string> = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
    connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
    hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
    louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
    mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
    washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  };
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (names[raw]) return names[raw];
  if (/^[a-z]{2}$/i.test(value.trim())) return value.trim().toUpperCase();
  return raw.toUpperCase();
};

const placeKey = (city?: string | null, state?: string | null) =>
  `${String(city ?? "").trim().toLowerCase()}|${canonicalState(state) ?? ""}`;

const sameState = (left?: string | null, right?: string | null) => !left || !right || canonicalState(left) === canonicalState(right);

const loadEvents = async (db: Db, places: Array<{ city: string; state?: string | null }>, artists: string[], now: Date) => {
  const from = now.toISOString();
  const until = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const centers = new Map<string, { latitude: number; longitude: number }>();
  const events: any[] = [];
  const seen = new Set<string>();
  const add = (rows: any[]) => {
    for (const row of rows) {
      const id = String(row?.id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      events.push(row);
    }
  };
  const eventSelect = "id, title, event_date, doors_time, venue_city, venue_state, latitude, longitude, ticket_available, ticket_urls, genres, event_status, artists(name), venues(name)";
  for (const place of places) {
    const sample = requireRows(await db.from("events").select("latitude, longitude, venue_state").ilike("venue_city", place.city).gte("event_date", from).not("latitude", "is", null).limit(12), "Load event listings");
    const located = sample.filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)) && sameState(row.venue_state, place.state));
    if (!located.length) {
      add(requireRows(await db.from("events").select(eventSelect).ilike("venue_city", place.city).gte("event_date", from).lte("event_date", until).order("event_date", { ascending: true }).limit(40), "Load city event listings"));
      continue;
    }
    const latitude = located.reduce((sum, row) => sum + Number(row.latitude), 0) / located.length;
    const longitude = located.reduce((sum, row) => sum + Number(row.longitude), 0) / located.length;
    centers.set(placeKey(place.city, place.state), { latitude, longitude });
    const latDelta = NEARBY_MILES / 69;
    const lngDelta = NEARBY_MILES / (69 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));
    add(requireRows(await db.from("events").select(eventSelect)
      .gte("latitude", latitude - latDelta).lte("latitude", latitude + latDelta)
      .gte("longitude", longitude - lngDelta).lte("longitude", longitude + lngDelta)
      .gte("event_date", from).lte("event_date", until).order("event_date", { ascending: true }).limit(40), "Load event listings"));
  }
  for (const artist of artists) {
    const rows = requireRows(await db.from("events").select(eventSelect).ilike("title", `%${artist}%`).gte("event_date", from).lte("event_date", until).order("event_date", { ascending: true }).limit(8), "Load event listings");
    add(rows.filter((row) => String(row.artists?.name || row.artist_name || "").toLowerCase() === artist.toLowerCase()));
  }
  return { centers, events };
};

const decode = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).trim();

const fetchMusicNews = async (now: Date) => {
  const stories: any[] = [];
  const seen = new Set<string>();
  await Promise.all(FEEDS.map(async (feed) => {
    try {
      const response = await fetch(feed.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "SynthNewsletter/1.0" } });
      if (!response.ok) return;
      const xml = await response.text();
      for (const block of xml.split(/<item[\s>]/i).slice(1)) {
        const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
        const dateMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
        const title = titleMatch ? decode(titleMatch[1]) : "";
        const link = linkMatch ? decode(linkMatch[1]).trim() : "";
        const published = Date.parse(dateMatch ? decode(dateMatch[1]) : "");
        if (!title || !/^https?:\/\//.test(link) || !Number.isFinite(published)) continue;
        if (published > now.getTime() + 24 * 60 * 60 * 1000 || now.getTime() - published > NEWS_WINDOW_MS || seen.has(link)) continue;
        seen.add(link);
        const descriptionMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
        const text = (descriptionMatch ? decode(descriptionMatch[1]) : "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const sentence = text.length >= 40 ? (text.match(/^.{40,220}?[.!](\s|$)/)?.[0] ?? text.slice(0, 180)).trim() : null;
        stories.push({ id: link, title, url: link, source: feed.source, publishedAt: new Date(published).toISOString(), summary: sentence });
      }
    } catch {
      /* A failed feed should not abort the edition. Stored news still loads. */
    }
  }));
  return stories;
};

export const loadEditionSource = async (db: Db, now = new Date()) => {
  const users = await readAll(() => db.from("users")
    .select("user_id, email, name, username, location_city, location_state, account_status, is_bot")
    .eq("account_status", "active").or("is_bot.is.false,is_bot.is.null")
    .not("email", "is", null).order("user_id"), "Load users");
  const unsubscribes = await readAll(() => db.from("newsletter_unsubscribes").select("email").order("email"), "Load unsubscribes");
  const unsubscribed = new Set((unsubscribes ?? []).map((row) => String(row.email).trim().toLowerCase()));
  const recipients = (users ?? []).filter((user) => {
    const email = String(user.email ?? "").trim().toLowerCase();
    return email.includes("@") && !unsubscribed.has(email);
  });
  const rss = await fetchMusicNews(now);
  const news = [...rss, ...requireRows(await db.from("news_items").select("id, title, url, source, created_at").order("created_at", { ascending: false }).limit(40), "Load stored news")];
  const userIds = recipients.map((user) => user.user_id);
  const reviews: any[] = [];
  for (const ids of chunk(userIds, 40)) {
    if (!ids.length) continue;
    reviews.push(...await readAll(() => db.from("reviews")
      .select("id, user_id, rating, review_text, Event_date, setlist, user_created_artist_id, artists(name), venues(name)")
      .in("user_id", ids).eq("is_draft", false)
      .order("Event_date", { ascending: false }).order("id"), "Load review history"));
  }
  const stats = await loadListeningStats(db, userIds);
  const enrichedReviews = await enrichReviewArtists(db, reviews);
  const artistNames = [...new Set(userIds.flatMap((id: string) => {
    const reviewArtists = enrichedReviews.filter((row) => row.user_id === id).slice(0, 2)
      .map((row) => row.artistName ?? row.artists?.name ?? row.user_created_artists?.name ?? row.setlist?.artist?.name).filter(Boolean);
    const stat = stats.find((row) => row.user_id === id);
    const listening = Array.isArray(stat?.top_artists) ? stat.top_artists.slice(0, 3).map((artist: any) => artist.name) : [];
    return [...listening, ...reviewArtists];
  }))];
  const places = [...new Map(recipients.map((user) => {
    const city = String(user.location_city || "").trim();
    return [placeKey(city, user.location_state), { city, state: user.location_state ?? null }];
  })).values()].filter((place) => place.city);
  const loaded = await loadEvents(db, places, artistNames, now);
  const publicFives = requireRows(await db.from("reviews").select("user_id, artists(name)").eq("is_public", true).eq("is_draft", false).gte("rating", 5).limit(300), "Load community reviews");
  return {
    users: recipients.map((user) => {
      const center = loaded.centers.get(placeKey(user.location_city, user.location_state));
      return { ...user, latitude: center?.latitude ?? null, longitude: center?.longitude ?? null };
    }),
    news,
    reviews: enrichedReviews,
    stats,
    events: loaded.events,
    publicFives,
  };
};
