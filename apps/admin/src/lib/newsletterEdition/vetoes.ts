/** Helpers for permanent / per-user newsletter content vetoes. */

export type VetoKind = "event" | "news" | "listen" | "account";
export type VetoScope = "global" | "user";
export type VetoReason = "bad" | "unfit";

export interface NewsletterContentVeto {
  content_key: string;
  kind: VetoKind;
  scope: VetoScope;
  user_id: string | null;
  reason: VetoReason;
  label?: string;
}

export interface VetoExcludes {
  urls: string[];
  listenKeys: string[];
  connectArtists: string[];
}

const CONNECT_PREFIX = "connect:";

export const normalizeVetoKey = (value: string) => value.trim().toLowerCase();

export const connectVetoKey = (artist: string) => `${CONNECT_PREFIX}${normalizeVetoKey(artist)}`;

export const connectArtistFromKey = (contentKey: string) => {
  const key = contentKey.trim();
  if (key.toLowerCase().startsWith(CONNECT_PREFIX)) return key.slice(CONNECT_PREFIX.length).trim();
  const match = key.match(/^other five-star fans of\s+(.+)$/i);
  return match ? match[1].trim() : key;
};

export const listenKeyFromLabel = (label: string) => {
  const trimmed = label.trim();
  return trimmed.includes(",") ? trimmed : "";
};

/** Derive the durable ban key(s) for a draft source card. */
export const contentKeysForSource = (source: {
  kind?: string;
  url?: string;
  label?: string;
}): string[] => {
  const kind = String(source.kind ?? "");
  const url = String(source.url ?? "").trim();
  const label = String(source.label ?? "").trim();
  if (kind === "account") {
    return [connectVetoKey(connectArtistFromKey(label || url))];
  }
  if (kind === "listen") {
    const keys = [url, listenKeyFromLabel(label)].filter(Boolean);
    return [...new Set(keys.map((value) => value.trim()))];
  }
  if (kind === "event" || kind === "news") {
    return url ? [url] : [];
  }
  return [];
};

export const excludesFromVetoes = (
  vetoes: NewsletterContentVeto[],
  userId?: string | null,
): VetoExcludes => {
  const urls: string[] = [];
  const listenKeys: string[] = [];
  const connectArtists: string[] = [];
  for (const veto of vetoes) {
    if (veto.scope === "user" && (!userId || veto.user_id !== userId)) continue;
    if (veto.scope === "global" || veto.scope === "user") {
      if (veto.kind === "account") {
        connectArtists.push(connectArtistFromKey(veto.content_key));
      } else if (veto.kind === "listen") {
        if (veto.content_key.includes("://")) urls.push(veto.content_key);
        else listenKeys.push(veto.content_key);
      } else {
        urls.push(veto.content_key);
      }
    }
  }
  return {
    urls: [...new Set(urls.map((value) => value.trim()).filter(Boolean))],
    listenKeys: [...new Set(listenKeys.map(normalizeVetoKey).filter(Boolean))],
    connectArtists: [...new Set(connectArtists.map(normalizeVetoKey).filter(Boolean))],
  };
};
