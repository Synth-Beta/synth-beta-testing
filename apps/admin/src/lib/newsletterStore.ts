import { newsletters as defaultNewsletters } from "@/data/newsletters";
import { NewsletterIssue } from "@/types/newsletter";

export const NEWSLETTER_DRAFT_STORAGE_KEY = "synth.newsletter.builder.v1";
export const NEWSLETTER_VERSION_STORAGE_KEY = "synth.newsletter.builder.versions.v1";

const canUseStorage = () => typeof window !== "undefined" && !!window.localStorage;
const nowIso = () => new Date().toISOString();

const safeParse = (raw: string): NewsletterIssue[] | null => {
  try {
    const parsed = JSON.parse(raw) as NewsletterIssue[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export interface NewsletterVersionEntry {
  id: string;
  newsletterId: string;
  savedAt: string;
  reason: "autosave" | "manual" | "import" | "restore";
  snapshot: NewsletterIssue;
}

const safeParseVersions = (raw: string): NewsletterVersionEntry[] | null => {
  try {
    const parsed = JSON.parse(raw) as NewsletterVersionEntry[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const withDefaultMeta = (newsletter: NewsletterIssue): NewsletterIssue => {
  const publishedMatch = defaultNewsletters.find((entry) => entry.slug === newsletter.slug);
  const createdAt = newsletter.createdAt ?? publishedMatch?.publishDate ?? newsletter.publishDate ?? nowIso();
  const status = newsletter.status ?? (publishedMatch ? "published" : "draft");
  return {
    ...newsletter,
    status,
    createdAt,
    lastEditedAt: newsletter.lastEditedAt ?? createdAt,
    archivedAt: newsletter.archivedAt ?? null,
  };
};

const normalizePublicSample = (input: NewsletterIssue[]): NewsletterIssue[] => {
  if (input.length === 0) return input;
  const marked = input.filter((entry) => entry.isPublicSample && entry.status !== "archived");
  const selectedId =
    marked[0]?.id ??
    input.find((entry) => entry.status !== "archived")?.id ??
    input[0]?.id;
  return input.map((entry) => ({
    ...entry,
    isPublicSample: entry.id === selectedId,
  }));
};

const normalizeNewsletters = (input: NewsletterIssue[]) =>
  normalizePublicSample(input.map(withDefaultMeta));

export const getNewsletters = (): NewsletterIssue[] => {
  if (!canUseStorage()) return normalizeNewsletters(defaultNewsletters);

  const raw = window.localStorage.getItem(NEWSLETTER_DRAFT_STORAGE_KEY);
  if (!raw) return normalizeNewsletters(defaultNewsletters);

  const parsed = safeParse(raw);
  return parsed && parsed.length > 0
    ? normalizeNewsletters(parsed)
    : normalizeNewsletters(defaultNewsletters);
};

export const getPublishedNewsletters = (): NewsletterIssue[] =>
  normalizeNewsletters(defaultNewsletters);

export const getPublishedNewsletterBySlug = (slug: string): NewsletterIssue | undefined =>
  defaultNewsletters.find((newsletter) => newsletter.slug === slug);

export const getNewsletterBySlugRuntime = (slug: string): NewsletterIssue | undefined =>
  getNewsletters().find((newsletter) => newsletter.slug === slug);

export const getNewslettersNewestFirst = (): NewsletterIssue[] =>
  [...getNewsletters()].sort(
    (a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
  );

export const saveNewsletters = (newsletters: NewsletterIssue[]) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    NEWSLETTER_DRAFT_STORAGE_KEY,
    JSON.stringify(normalizeNewsletters(newsletters))
  );
};

export const setPublicSampleById = (newsletters: NewsletterIssue[], newsletterId: string) =>
  normalizeNewsletters(
    newsletters.map((entry) => ({ ...entry, isPublicSample: entry.id === newsletterId }))
  );

export const getNewsletterVersions = (newsletterId: string): NewsletterVersionEntry[] => {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(NEWSLETTER_VERSION_STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParseVersions(raw) ?? [];
  return parsed
    .filter((entry) => entry.newsletterId === newsletterId)
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
};

export const saveNewsletterVersion = (
  newsletter: NewsletterIssue,
  reason: NewsletterVersionEntry["reason"]
) => {
  if (!canUseStorage()) return;
  const raw = window.localStorage.getItem(NEWSLETTER_VERSION_STORAGE_KEY);
  const parsed = safeParseVersions(raw ?? "[]") ?? [];
  const next: NewsletterVersionEntry[] = [
    {
      id: `${newsletter.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      newsletterId: newsletter.id,
      savedAt: nowIso(),
      reason,
      snapshot: withDefaultMeta(structuredClone(newsletter)),
    },
    ...parsed,
  ].slice(0, 100);
  window.localStorage.setItem(NEWSLETTER_VERSION_STORAGE_KEY, JSON.stringify(next));
};

export const resetNewslettersToDefault = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(NEWSLETTER_DRAFT_STORAGE_KEY);
  window.localStorage.removeItem(NEWSLETTER_VERSION_STORAGE_KEY);
};

export const hasLocalDrafts = (): boolean => {
  if (!canUseStorage()) return false;
  return Boolean(window.localStorage.getItem(NEWSLETTER_DRAFT_STORAGE_KEY));
};

