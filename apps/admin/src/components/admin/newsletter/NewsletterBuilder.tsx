import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  AlertTriangle,
  CalendarClock,
  Copy,
  FileDown,
  Download,
  Eye,
  Plus,
  Save,
  Trash2,
  CopyPlus,
  GripVertical,
  RefreshCw,
  RotateCcw,
  Search,
  Upload,
  User,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  buildPersonalizationContextForUser,
  getMockPersonalizationContext,
  inferDerivedState,
  resolveNewsletterForContext,
  searchPreviewUsers,
  validateNewsletterPersonalization,
} from "@/lib/newsletterPersonalization";
import { renderNewsletterHtml } from "@/lib/newsletterRenderer";
import {
  getNewsletters,
  getNewsletterVersions,
  getPublishedNewsletterBySlug,
  getPublishedNewsletters,
  hasLocalDrafts,
  resetNewslettersToDefault,
  saveNewsletters,
  saveNewsletterVersion,
  setPublicSampleById,
} from "@/lib/newsletterStore";
import {
  NewsletterIssue,
  NewsletterPersonalizationDataField,
  NewsletterSection,
  NewsletterSectionPersonalization,
  NewsletterSectionType,
} from "@/types/newsletter";
import { NewsletterPreviewPreset } from "@/types/newsletterPersonalization";
import { getEligibleRecipientCount, sendTestNewsletter } from "@/services/newsletterSendService";

const SECTION_OPTIONS: { label: string; value: NewsletterSectionType }[] = [
  { label: "Hero", value: "hero" },
  { label: "Intro", value: "intro" },
  { label: "Your Synth", value: "yourSynth" },
  { label: "Your Music", value: "yourMusic" },
  { label: "Around You", value: "aroundYou" },
  { label: "Community Spotlight", value: "communitySpotlight" },
  { label: "Featured story", value: "featuredStory" },
  { label: "Quick stories", value: "quickStories" },
  { label: "Featured event", value: "featuredEvent" },
  { label: "Featured artist", value: "featuredArtist" },
  { label: "Featured venue", value: "featuredVenue" },
  { label: "Discover or tip", value: "discoverTip" },
  { label: "Product update", value: "productUpdate" },
  { label: "CTA", value: "cta" },
  { label: "Footer", value: "footer" },
];

type PreviewPreset = "desktop-web" | "mobile-web" | "desktop-email" | "mobile-email";
type PersonalizationPreviewMode = "template" | "resolved";

const PRESET_OPTIONS: { id: NewsletterPreviewPreset; label: string }[] = [
  { id: "active-user", label: "Active user" },
  { id: "inactive-with-history", label: "Inactive with history" },
  { id: "spotify-connected-user", label: "Spotify-connected user" },
  { id: "apple-connected-user", label: "Apple Music-connected user" },
  { id: "interest-signal-user", label: "Interest-signal user" },
  { id: "brand-new-user", label: "Brand-new user" },
  { id: "missing-location-user", label: "Missing-location user" },
];

const TOKEN_REFERENCE: Array<{
  category: string;
  items: Array<{ token: string; description: string; optional?: boolean }>;
}> = [
  {
    category: "User profile",
    items: [
      { token: "{{firstName}}", description: "User first name from profile", optional: true },
      { token: "{{city}}", description: "User city or inferred location", optional: true },
    ],
  },
  {
    category: "Synth activity",
    items: [
      { token: "{{upcomingShowCount}}", description: "Count of upcoming interested shows", optional: true },
      { token: "{{recentConcertCount}}", description: "Count of recently attended concerts", optional: true },
      { token: "{{lifetimeConcertCount}}", description: "Lifetime attended concert count", optional: true },
      { token: "{{lifetimeReviewCount}}", description: "Lifetime published review count", optional: true },
      { token: "{{nextShowArtist}}", description: "Artist from next upcoming show", optional: true },
      { token: "{{nextShowVenue}}", description: "Venue from next upcoming show", optional: true },
    ],
  },
  {
    category: "Music + interest signals",
    items: [
      { token: "{{topArtist}}", description: "Top artist from connected music data", optional: true },
      { token: "{{topGenre}}", description: "Top genre from connected music data", optional: true },
      { token: "{{followedArtist}}", description: "First artist from interest signals", optional: true },
      { token: "{{followedVenue}}", description: "First venue from interest signals", optional: true },
    ],
  },
];

const parseCsv = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const updateSectionPersonalization = (
  section: NewsletterSection,
  patch: Partial<NewsletterSectionPersonalization>
) => ({
  ...(section.personalization ?? {}),
  ...patch,
});

const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isValidUrl = (value: string) => {
  if (!value) return false;
  if (value.startsWith("{{") && value.endsWith("}}")) return true;
  if (value.startsWith("/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const sectionTypeLabel = (value: NewsletterSectionType) =>
  SECTION_OPTIONS.find((option) => option.value === value)?.label ?? value;

const isAbsolutePublicUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const hasContent = (section: NewsletterSection) =>
  Boolean(
    section.label?.trim() ||
      section.eyebrowText?.trim() ||
      section.headline?.trim() ||
      section.body?.trim() ||
      section.imageUrl?.trim() ||
      section.ctaLabel?.trim() ||
      section.ctaUrl?.trim() ||
      (section.cards?.length ?? 0) > 0 ||
      (section.listItems?.length ?? 0) > 0
  );

const remapNestedIds = (section: NewsletterSection): NewsletterSection => ({
  ...section,
  cards: section.cards?.map((card) => ({ ...card, id: newId("card") })),
  listItems: section.listItems?.map((item) => ({ ...item, id: newId("item") })),
});

const normalizeImportedNewsletter = (incoming: NewsletterIssue): NewsletterIssue => ({
  ...incoming,
  sections: incoming.sections.map((section) => ({
    ...section,
    id: section.id || newId(section.type),
    cards:
      section.type === "quickStories"
        ? (section.cards ?? []).slice(0, 6).map((card) => ({
            id: card.id || newId("card"),
            label: card.label ?? "",
            title: card.title ?? "",
            body: card.body ?? "",
            imageUrl: card.imageUrl,
            ctaLabel: card.ctaLabel,
            ctaUrl: card.ctaUrl,
          }))
        : section.cards,
    listItems: (section.listItems ?? []).map((item) => ({
      id: item.id || newId("item"),
      title: item.title ?? "",
      body: item.body ?? "",
    })),
  })),
});

type LibrarySort = "newest" | "oldest" | "draft" | "published";

const formatDateLabel = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
};

const statusLabel = (status?: NewsletterIssue["status"]) => {
  if (status === "published") return "Published";
  if (status === "archived") return "Archived";
  return "Draft";
};

const clearSectionPersonalizedContent = (section: NewsletterSection): NewsletterSection => ({
  ...section,
  eyebrowText: "",
  headline: "",
  body: "",
  ctaLabel: "",
  ctaUrl: "",
  listItems: section.listItems?.map((item) => ({ ...item, title: "", body: "" })) ?? [],
  cards:
    section.cards?.map((card) => ({
      ...card,
      label: "",
      title: "",
      body: "",
      ctaLabel: "",
      ctaUrl: "",
    })) ?? [],
});

const createIssueFromTemplate = (template: NewsletterIssue): NewsletterIssue => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const nextIssueNumber = String(Number(template.issueNumber || "1") + 1);
  return {
    ...structuredClone(template),
    id: newId("newsletter"),
    slug: normalizeSlug(`${template.slug}-draft-${Date.now()}`),
    title: `${template.title} (Draft)`,
    issueNumber: nextIssueNumber,
    publishDate: datePart,
    subjectLine: "",
    preheader: "",
    description: "",
    isPublicSample: false,
    status: "draft",
    createdAt: now.toISOString(),
    lastEditedAt: now.toISOString(),
    archivedAt: null,
    sections: template.sections.map((section) =>
      remapNestedIds({
        ...clearSectionPersonalizedContent(section),
        id: newId(section.type),
        hidden: false,
      })
    ),
  };
};

const summarizeDraftDiff = (current: NewsletterIssue, previous?: NewsletterIssue | null) => {
  if (!previous) return "No saved snapshot yet.";
  const changes: string[] = [];
  if (current.title !== previous.title) changes.push("title");
  if (current.subjectLine !== previous.subjectLine) changes.push("subject");
  if (current.preheader !== previous.preheader) changes.push("preheader");
  if (current.slug !== previous.slug) changes.push("slug");
  if (current.sections.length !== previous.sections.length) changes.push("section count");
  const hiddenCurrent = current.sections.filter((section) => section.hidden).length;
  const hiddenPrevious = previous.sections.filter((section) => section.hidden).length;
  if (hiddenCurrent !== hiddenPrevious) changes.push("hidden sections");
  return changes.length > 0
    ? `Changed since last saved: ${changes.join(", ")}.`
    : "No differences from last saved snapshot.";
};

export default function NewsletterBuilder() {
  const { toast } = useToast();
  const [selectedAddType, setSelectedAddType] = useState<NewsletterSectionType>("hero");
  const [previewPreset, setPreviewPreset] = useState<PreviewPreset>("desktop-web");
  const [allNewsletters, setAllNewsletters] = useState<NewsletterIssue[]>(() => getNewsletters());
  const [selectedNewsletterId, setSelectedNewsletterId] = useState<string>(() => {
    const list = getNewsletters();
    return list.find((item) => item.slug === "august-5-2026")?.id ?? list[0]?.id ?? "";
  });
  const [newsletter, setNewsletter] = useState<NewsletterIssue>(() => {
    const list = getNewsletters();
    return list.find((item) => item.slug === "august-5-2026") ?? list[0];
  });
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("newest");
  const [renameDraftTitle, setRenameDraftTitle] = useState("");
  const [importJson, setImportJson] = useState("");
  const [lastDeletedSection, setLastDeletedSection] = useState<{ section: NewsletterSection; index: number } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [savedLocallyAt, setSavedLocallyAt] = useState<string | null>(null);
  const [hasDraftsOnDevice, setHasDraftsOnDevice] = useState(() => hasLocalDrafts());
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [personalizationPreset, setPersonalizationPreset] =
    useState<NewsletterPreviewPreset>("active-user");
  const [personalizationPreviewMode, setPersonalizationPreviewMode] =
    useState<PersonalizationPreviewMode>("resolved");
  const [recipientOnlyPreview, setRecipientOnlyPreview] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<Array<{ id: string; label: string }>>(
    []
  );
  const [selectedRealUserId, setSelectedRealUserId] = useState<string | null>(null);
  const [realContextLoading, setRealContextLoading] = useState(false);
  const [realContextError, setRealContextError] = useState<string | null>(null);
  const [realUserContext, setRealUserContext] = useState<any>(null);
  const [testSendEmail, setTestSendEmail] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSendMessage, setTestSendMessage] = useState<string | null>(null);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [eligibleCountLoading, setEligibleCountLoading] = useState(false);
  const isAugustPublishedIssue = newsletter.slug === "august-5-2026";

  useEffect(() => {
    if (!renameDraftTitle) setRenameDraftTitle(newsletter.title);
  }, [newsletter.title, renameDraftTitle]);

  useEffect(() => {
    const selected = allNewsletters.find((entry) => entry.id === selectedNewsletterId);
    if (selected && selected.id !== newsletter.id) {
      setNewsletter(selected);
      setRenameDraftTitle(selected.title);
      setIsDirty(false);
      setOverwriteConfirmed(false);
    }
  }, [allNewsletters, newsletter.id, selectedNewsletterId]);

  useEffect(() => {
    if (!isDirty) return;
    const timeout = setTimeout(() => {
      setAllNewsletters((prev) => {
        const next = prev.map((entry) =>
          entry.id === newsletter.id
            ? {
                ...newsletter,
                lastEditedAt: new Date().toISOString(),
                status: (newsletter.status === "archived" ? "archived" : "draft") as NewsletterIssue["status"],
              }
            : entry
        );
        saveNewsletters(next);
        saveNewsletterVersion(newsletter, "autosave");
        setSavedLocallyAt(new Date().toLocaleTimeString());
        setHasDraftsOnDevice(hasLocalDrafts());
        setIsDirty(false);
        return next;
      });
    }, 800);
    return () => clearTimeout(timeout);
  }, [newsletter, isDirty]);

  useEffect(() => {
    if (!userSearchQuery.trim()) {
      setUserSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const results = await searchPreviewUsers(userSearchQuery.trim());
      setUserSearchResults(results);
    }, 250);
    return () => clearTimeout(timeout);
  }, [userSearchQuery]);

  useEffect(() => {
    if (!selectedRealUserId) return;
    let cancelled = false;
    setRealContextLoading(true);
    setRealContextError(null);
    buildPersonalizationContextForUser(selectedRealUserId)
      .then((context) => {
        if (cancelled) return;
        setRealUserContext(context);
      })
      .catch((error: any) => {
        if (cancelled) return;
        setRealContextError(
          error?.message ??
            "Real-user preview is unavailable with current permissions. Using Admin mock data only."
        );
        setRealUserContext(null);
      })
      .finally(() => {
        if (!cancelled) setRealContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRealUserId]);

  const previewContext = useMemo(() => {
    if (selectedRealUserId && realUserContext) return realUserContext;
    return getMockPersonalizationContext(personalizationPreset);
  }, [personalizationPreset, realUserContext, selectedRealUserId]);

  const resolvedNewsletterResult = useMemo(
    () => resolveNewsletterForContext(newsletter, previewContext, personalizationPreviewMode),
    [newsletter, personalizationPreviewMode, previewContext]
  );

  const personalizationValidation = useMemo(
    () => validateNewsletterPersonalization(newsletter, previewContext),
    [newsletter, previewContext]
  );

  const ensureOverwriteConfirmed = () => {
    if (!isAugustPublishedIssue || overwriteConfirmed) return true;
    const confirmed = window.confirm(
      "You are about to create a local draft override for the published August 5 issue. Continue?"
    );
    if (confirmed) setOverwriteConfirmed(true);
    return confirmed;
  };

  const applyNewsletterChange = (updater: (prev: NewsletterIssue) => NewsletterIssue) => {
    if (!ensureOverwriteConfirmed()) return;
    setNewsletter((prev) => updater(prev));
    setIsDirty(true);
  };

  const persistAllNewsletters = (next: NewsletterIssue[]) => {
    const normalized = setPublicSampleById(
      next,
      next.find((entry) => entry.isPublicSample)?.id ?? next[0]?.id
    );
    setAllNewsletters(normalized);
    saveNewsletters(normalized);
    setHasDraftsOnDevice(hasLocalDrafts());
  };

  const handleManualSave = () => {
    const now = new Date().toISOString();
    const savedNewsletter = {
      ...newsletter,
      lastEditedAt: now,
      status: (newsletter.status === "archived" ? "archived" : "draft") as NewsletterIssue["status"],
    };
    const next = allNewsletters.map((entry) =>
      entry.id === savedNewsletter.id ? savedNewsletter : entry
    );
    persistAllNewsletters(next);
    saveNewsletterVersion(savedNewsletter, "manual");
    setNewsletter(savedNewsletter);
    setIsDirty(false);
    setSavedLocallyAt(new Date().toLocaleTimeString());
    toast({ title: "Saved", description: "Draft saved locally." });
  };

  const handleSelectNewsletter = (id: string) => {
    if (isDirty) {
      const shouldSave = window.confirm(
        "You have unsaved changes. Save before switching issues?"
      );
      if (shouldSave) handleManualSave();
    }
    setSelectedNewsletterId(id);
  };

  const handleCreateIssue = () => {
    const template = newsletter ?? allNewsletters[0];
    if (!template) return;
    const created = createIssueFromTemplate(template);
    const next = [...allNewsletters, created];
    persistAllNewsletters(next);
    saveNewsletterVersion(created, "manual");
    setSelectedNewsletterId(created.id);
    setNewsletter(created);
    setRenameDraftTitle(created.title);
    setIsDirty(false);
  };

  const handleDuplicateIssue = (issueId: string) => {
    const source = allNewsletters.find((entry) => entry.id === issueId);
    if (!source) return;
    const duplicated: NewsletterIssue = {
      ...structuredClone(source),
      id: newId("newsletter"),
      slug: normalizeSlug(`${source.slug}-copy-${Date.now()}`),
      title: `${source.title} (Copy)`,
      isPublicSample: false,
      status: "draft",
      createdAt: new Date().toISOString(),
      lastEditedAt: new Date().toISOString(),
      archivedAt: null,
      sections: source.sections.map((section) =>
        remapNestedIds({ ...section, id: newId(section.type), hidden: false })
      ),
    };
    const next = [...allNewsletters, duplicated];
    persistAllNewsletters(next);
    setSelectedNewsletterId(duplicated.id);
    setNewsletter(duplicated);
    setRenameDraftTitle(duplicated.title);
  };

  const handleRenameIssue = (issueId: string, title: string) => {
    const next = allNewsletters.map((entry) =>
      entry.id === issueId
        ? { ...entry, title: title.trim() || entry.title, lastEditedAt: new Date().toISOString() }
        : entry
    );
    persistAllNewsletters(next);
    if (newsletter.id === issueId) {
      setNewsletter((prev) => ({
        ...prev,
        title: title.trim() || prev.title,
        lastEditedAt: new Date().toISOString(),
      }));
    }
  };

  const handleArchiveIssue = (issueId: string) => {
    const next = allNewsletters.map((entry) =>
      entry.id === issueId
        ? {
            ...entry,
            status: (entry.status === "archived" ? "draft" : "archived") as NewsletterIssue["status"],
            archivedAt: entry.status === "archived" ? null : new Date().toISOString(),
            isPublicSample: entry.status === "archived" ? entry.isPublicSample : false,
            lastEditedAt: new Date().toISOString(),
          }
        : entry
    );
    persistAllNewsletters(next);
    const active = next.find((entry) => entry.id === selectedNewsletterId && entry.status !== "archived");
    if (!active) {
      const replacement = next.find((entry) => entry.status !== "archived") ?? next[0];
      if (replacement) {
        setSelectedNewsletterId(replacement.id);
        setNewsletter(replacement);
      }
    }
  };

  const handleDeleteIssue = (issueId: string) => {
    const target = allNewsletters.find((entry) => entry.id === issueId);
    if (!target) return;
    if (!window.confirm(`Delete "${target.title}"? This cannot be undone.`)) return;
    const next = allNewsletters.filter((entry) => entry.id !== issueId);
    if (next.length === 0) return;
    persistAllNewsletters(next);
    if (selectedNewsletterId === issueId) {
      setSelectedNewsletterId(next[0].id);
      setNewsletter(next[0]);
    }
  };

  const handleSetPublicSample = (issueId: string) => {
    const next = setPublicSampleById(allNewsletters, issueId);
    persistAllNewsletters(next);
    const current = next.find((entry) => entry.id === newsletter.id);
    if (current) setNewsletter(current);
  };

  const { validationErrors, validationWarnings } = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!newsletter.title.trim()) errors.push("Issue title is required.");
    if (!newsletter.publishDate.trim()) errors.push("Publication date is required.");
    if (!newsletter.subjectLine.trim()) errors.push("Subject line is required.");
    if (!newsletter.preheader.trim()) errors.push("Preview text is required.");
    if (!newsletter.slug.trim()) {
      errors.push("Slug is required.");
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newsletter.slug)) {
      errors.push("Slug must use lowercase letters, numbers, and hyphens only.");
    }
    const duplicateSlug = allNewsletters.some(
      (entry) => entry.id !== newsletter.id && entry.slug === newsletter.slug
    );
    if (duplicateSlug) errors.push("Slug must be unique across newsletters.");
    const duplicateIssueNumber = allNewsletters.some(
      (entry) => entry.id !== newsletter.id && entry.issueNumber === newsletter.issueNumber
    );
    if (duplicateIssueNumber) warnings.push("Issue number already exists in another newsletter.");

    let hasAnyCta = false;
    newsletter.sections.forEach((section) => {
      if (section.hidden) return;
      if (section.ctaLabel?.trim() && section.ctaUrl?.trim()) hasAnyCta = true;
      if (section.ctaUrl && !isValidUrl(section.ctaUrl)) {
        errors.push(`${sectionTypeLabel(section.type)} has an invalid CTA URL.`);
      }
      if (section.imageUrl && !isValidUrl(section.imageUrl)) {
        errors.push(`${sectionTypeLabel(section.type)} has an invalid image URL.`);
      }
      if (section.imageUrl && !isAbsolutePublicUrl(section.imageUrl)) {
        warnings.push(
          `${sectionTypeLabel(section.type)} image should be an absolute https URL for export.`
        );
      }
      if ((section.ctaLabel && !section.ctaUrl) || (!section.ctaLabel && section.ctaUrl)) {
        warnings.push(
          `${sectionTypeLabel(section.type)} CTA should include both label and URL.`
        );
      }
      if (section.headline && !section.body && section.type !== "quickStories") {
        warnings.push(`${sectionTypeLabel(section.type)} has a heading but no body/content.`);
      }
      if (!hasContent(section)) {
        warnings.push(`${sectionTypeLabel(section.type)} is empty and will not render.`);
      }
      if (section.type === "quickStories") {
        if ((section.cards ?? []).length === 0) errors.push("Quick stories requires at least one card.");
        if ((section.cards ?? []).length > 6) errors.push("Quick stories cannot exceed six items.");
        (section.cards ?? []).forEach((card, index) => {
          if (!card.title.trim() || !card.body.trim()) {
            errors.push(`Quick story ${index + 1} needs a title and body.`);
          }
          if (card.ctaUrl && !isValidUrl(card.ctaUrl)) {
            errors.push(`Quick story ${index + 1} has an invalid URL.`);
          }
          if (card.ctaUrl && !isAbsolutePublicUrl(card.ctaUrl)) {
            warnings.push(`Quick story ${index + 1} CTA should be absolute https URL.`);
          }
          if ((card.ctaLabel && !card.ctaUrl) || (!card.ctaLabel && card.ctaUrl)) {
            warnings.push(`Quick story ${index + 1} CTA needs both label and URL.`);
          }
        });
      }
    });
    if (!hasAnyCta) warnings.push("No CTA is configured in visible sections.");
    const hasFinalSection = newsletter.sections.some(
      (section) => !section.hidden && section.type === "cta"
    );
    if (!hasFinalSection) warnings.push("No final CTA section is present.");
    errors.push(...personalizationValidation.errors);
    warnings.push(...personalizationValidation.warnings);
    return { validationErrors: errors, validationWarnings: warnings };
  }, [
    allNewsletters,
    newsletter,
    personalizationValidation.errors,
    personalizationValidation.warnings,
  ]);

  const canExport = validationErrors.length === 0;
  const previewMode = previewPreset.includes("email") ? "email" : "web";
  const previewWidth = previewPreset.includes("mobile") ? 390 : "100%";
  const previewHtml = useMemo(
    () =>
      renderNewsletterHtml(resolvedNewsletterResult.newsletter, {
        mode: previewMode,
        absoluteBaseUrl: "https://getsynth.app",
      }),
    [previewMode, resolvedNewsletterResult.newsletter]
  );

  const updateNewsletter = <K extends keyof NewsletterIssue>(key: K, value: NewsletterIssue[K]) => {
    applyNewsletterChange((prev) => ({ ...prev, [key]: value }));
  };

  const updateSection = (sectionId: string, patch: Partial<NewsletterSection>) => {
    applyNewsletterChange((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section
      ),
    }));
  };

  const moveSection = (sectionId: string, direction: "up" | "down") => {
    applyNewsletterChange((prev) => {
      const index = prev.sections.findIndex((section) => section.id === sectionId);
      if (index < 0) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.sections.length) return prev;
      const sections = [...prev.sections];
      const [item] = sections.splice(index, 1);
      sections.splice(targetIndex, 0, item);
      return { ...prev, sections };
    });
  };

  const duplicateSection = (sectionId: string) => {
    applyNewsletterChange((prev) => {
      const index = prev.sections.findIndex((section) => section.id === sectionId);
      if (index < 0) return prev;
      const clone = remapNestedIds(structuredClone(prev.sections[index]));
      clone.id = newId(clone.type);
      clone.hidden = true;
      return {
        ...prev,
        sections: [...prev.sections.slice(0, index + 1), clone, ...prev.sections.slice(index + 1)],
      };
    });
  };

  const removeSection = (sectionId: string) => {
    const index = newsletter.sections.findIndex((section) => section.id === sectionId);
    const removed = newsletter.sections[index];
    if (index < 0 || !removed) return;
    setLastDeletedSection({ section: removed, index });
    applyNewsletterChange((prev) => ({
      ...prev,
      sections: prev.sections.filter((section) => section.id !== sectionId),
    }));
  };

  const restoreDeletedSection = () => {
    if (!lastDeletedSection) return;
    applyNewsletterChange((prev) => ({
      ...prev,
      sections: [
        ...prev.sections.slice(0, lastDeletedSection.index),
        lastDeletedSection.section,
        ...prev.sections.slice(lastDeletedSection.index),
      ],
    }));
    setLastDeletedSection(null);
  };

  const addSection = () => {
    const next: NewsletterSection = {
      id: newId(selectedAddType),
      type: selectedAddType,
      label: "",
      headline: "",
      body: "",
      hidden: false,
      cards: selectedAddType === "quickStories" ? [] : undefined,
      listItems: selectedAddType === "yourMusic" ? [] : undefined,
    };
    applyNewsletterChange((prev) => ({ ...prev, sections: [...prev.sections, next] }));
  };

  const addQuickStory = (sectionId: string) => {
    applyNewsletterChange((prev) => ({
      ...prev,
      sections: prev.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const cards = section.cards ?? [];
        if (cards.length >= 6) return section;
        return {
          ...section,
          cards: [...cards, { id: newId("card"), label: "", title: "", body: "" }],
        };
      }),
    }));
  };

  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(newsletter, null, 2));
    toast({ title: "Copied", description: "Newsletter JSON copied to clipboard." });
  };

  const getAbsoluteBaseUrl = () => "https://getsynth.app";

  const renderExportHtml = (mode: PersonalizationPreviewMode) => {
    const sourceNewsletter =
      mode === "template"
        ? newsletter
        : resolveNewsletterForContext(newsletter, previewContext, "resolved").newsletter;
    return renderNewsletterHtml(sourceNewsletter, {
      mode: "email",
      absoluteBaseUrl: getAbsoluteBaseUrl(),
    });
  };

  const confirmRealUserExport = () => {
    if (!previewContext.containsRealUserData) return true;
    return window.confirm(
      "This export includes resolved real-user personal data. Continue?"
    );
  };

  const handleCopyEmailHtml = async (mode: PersonalizationPreviewMode) => {
    if (!canExport) return;
    if (mode === "resolved" && !confirmRealUserExport()) return;
    const html = renderExportHtml(mode);
    await navigator.clipboard.writeText(html);
    toast({
      title: "Copied",
      description:
        mode === "template"
          ? "Template HTML with tokens copied."
          : "Resolved sample HTML copied.",
    });
  };

  const handleDownloadEmailHtml = (mode: PersonalizationPreviewMode) => {
    if (!canExport) return;
    if (mode === "resolved" && !confirmRealUserExport()) return;
    const html = renderExportHtml(mode);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${newsletter.slug || "newsletter"}-${mode}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(newsletter, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${newsletter.slug || "newsletter"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importJson) as NewsletterIssue;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
        throw new Error("Invalid newsletter JSON format.");
      }
      const normalized = {
        ...normalizeImportedNewsletter(parsed),
        id: newsletter.id,
        status: "draft" as const,
        createdAt: newsletter.createdAt ?? new Date().toISOString(),
        lastEditedAt: new Date().toISOString(),
      };
      if ((normalized.sections.find((s) => s.type === "quickStories")?.cards?.length ?? 0) > 6) {
        throw new Error("Quick stories cannot exceed six items.");
      }
      setNewsletter(normalized);
      const next = allNewsletters.map((entry) => (entry.id === newsletter.id ? normalized : entry));
      persistAllNewsletters(next);
      saveNewsletterVersion(normalized, "import");
      setIsDirty(false);
      toast({ title: "Imported", description: "Newsletter JSON imported into builder." });
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error?.message ?? "Could not parse newsletter JSON.",
        variant: "destructive",
      });
    }
  };

  const handleImportJsonFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportJson(text);
    event.target.value = "";
  };

  const handlePreviewPublicSample = () => {
    const next = setPublicSampleById(allNewsletters, newsletter.id);
    persistAllNewsletters(next);
    const current = next.find((entry) => entry.id === newsletter.id);
    if (current) setNewsletter(current);
    window.open(`/newsletter/${newsletter.slug}`, "_blank", "noopener,noreferrer");
  };

  const handleResetToPublished = () => {
    const published = getPublishedNewsletterBySlug(newsletter.slug);
    if (!published) return;
    if (!window.confirm("Reset this issue to the published version? This discards local draft changes.")) {
      return;
    }
    const restored = {
      ...structuredClone(published),
      id: newsletter.id,
      status: "published" as const,
      createdAt: newsletter.createdAt ?? new Date().toISOString(),
      lastEditedAt: new Date().toISOString(),
      archivedAt: null,
      isPublicSample: newsletter.isPublicSample,
    };
    setNewsletter(restored);
    const next = allNewsletters.map((entry) => (entry.id === newsletter.id ? restored : entry));
    persistAllNewsletters(next);
    saveNewsletterVersion(restored, "restore");
    setIsDirty(false);
    setLastDeletedSection(null);
  };

  const handleClearLocalDraft = () => {
    if (!window.confirm("Clear all local newsletter drafts on this device?")) return;
    resetNewslettersToDefault();
    const published = getPublishedNewsletters();
    setAllNewsletters(published);
    const fallback = published.find((item) => item.slug === "august-5-2026") ?? published[0];
    setSelectedNewsletterId(fallback?.id ?? "");
    setNewsletter(fallback);
    setRenameDraftTitle(fallback?.title ?? "");
    setSavedLocallyAt(null);
    setHasDraftsOnDevice(false);
    setLastDeletedSection(null);
    setIsDirty(false);
    setOverwriteConfirmed(false);
    toast({ title: "Local drafts cleared", description: "Local draft storage has been reset." });
  };

  const clearRealUserPreview = () => {
    setSelectedRealUserId(null);
    setRealUserContext(null);
    setRealContextError(null);
  };

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    toast({ title: "Token copied", description: `${token} copied to clipboard.` });
  };

  const handleLoadEligibleCount = async () => {
    setEligibleCountLoading(true);
    setTestSendMessage(null);
    try {
      const count = await getEligibleRecipientCount();
      setEligibleCount(count);
      toast({ title: "Eligibility loaded", description: `${count} recipients currently eligible.` });
    } catch (error: any) {
      setTestSendMessage(error?.message ?? "Unable to fetch recipient eligibility.");
      toast({
        title: "Eligibility check failed",
        description: error?.message ?? "Unable to fetch recipient eligibility.",
        variant: "destructive",
      });
    } finally {
      setEligibleCountLoading(false);
    }
  };

  const handleSendTest = async () => {
    const email = testSendEmail.trim();
    if (!selectedRealUserId) {
      setTestSendMessage("Select a real preview user before sending a test email.");
      return;
    }
    if (!email || !newsletter.subjectLine.trim()) {
      setTestSendMessage("Test recipient email and newsletter subject are required.");
      return;
    }
    if (!canExport) {
      setTestSendMessage("Fix validation errors before sending.");
      return;
    }

    setIsSendingTest(true);
    setTestSendMessage(null);
    try {
      await sendTestNewsletter({
        newsletter,
        previewUserId: selectedRealUserId,
        toEmail: email,
      });
      setTestSendMessage(`Test email sent to ${email}.`);
      toast({ title: "Test sent", description: `Newsletter test sent to ${email}.` });
    } catch (error: any) {
      const message = error?.message ?? "Test send failed.";
      setTestSendMessage(message);
      toast({ title: "Test send failed", description: message, variant: "destructive" });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleRestoreVersion = (versionId: string) => {
    const selected = versionHistory.find((entry) => entry.id === versionId);
    if (!selected) return;
    if (!window.confirm("Restore this saved version to the current draft?")) return;
    const restored = {
      ...structuredClone(selected.snapshot),
      id: newsletter.id,
      lastEditedAt: new Date().toISOString(),
    };
    setNewsletter(restored);
    const next = allNewsletters.map((entry) => (entry.id === restored.id ? restored : entry));
    persistAllNewsletters(next);
    saveNewsletterVersion(restored, "restore");
    setSavedLocallyAt(new Date().toLocaleTimeString());
    setIsDirty(false);
  };

  const statusBadges = [
    isDirty ? "Unsaved changes" : "Saved locally",
    canExport ? "Export ready" : "Validation errors",
    hasDraftsOnDevice ? "Saved locally on this device" : "No local draft yet",
    `Status: ${statusLabel(newsletter.status)}`,
  ];

  const moduleSummary = useMemo(() => {
    const rendered = resolvedNewsletterResult.moduleExplanations.filter((entry) => entry.rendered);
    return {
      personalizedModules: rendered.filter((entry) =>
        ["Personalized", "Streaming-based", "Location-based"].includes(entry.sourceLabel)
      ).length,
      fallbackModules: rendered.filter((entry) => entry.fallbackUsed).length,
      adminSelectedModules: rendered.filter((entry) => entry.sourceLabel === "Admin-selected").length,
    };
  }, [resolvedNewsletterResult.moduleExplanations]);

  const versionHistory = getNewsletterVersions(newsletter.id);
  const lastSavedSnapshot = versionHistory[0]?.snapshot ?? null;
  const draftDiffSummary = summarizeDraftDiff(newsletter, lastSavedSnapshot);

  const filteredNewsletters = useMemo(() => {
    const term = librarySearch.trim().toLowerCase();
    let list = allNewsletters.filter((entry) => {
      if (!term) return true;
      return (
        entry.title.toLowerCase().includes(term) ||
        entry.slug.toLowerCase().includes(term) ||
        entry.issueNumber.toLowerCase().includes(term)
      );
    });

    if (librarySort === "draft") {
      list = list.filter((entry) => (entry.status ?? "draft") === "draft");
    } else if (librarySort === "published") {
      list = list.filter((entry) => (entry.status ?? "draft") === "published");
    } else if (librarySort === "newest") {
      list = [...list].sort(
        (a, b) =>
          new Date(b.publishDate || b.lastEditedAt || 0).getTime() -
          new Date(a.publishDate || a.lastEditedAt || 0).getTime()
      );
    } else if (librarySort === "oldest") {
      list = [...list].sort(
        (a, b) =>
          new Date(a.publishDate || a.lastEditedAt || 0).getTime() -
          new Date(b.publishDate || b.lastEditedAt || 0).getTime()
      );
    }
    return list;
  }, [allNewsletters, librarySearch, librarySort]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Newsletter Library</CardTitle>
          <CardDescription>Manage drafts, published issues, and archive state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Search by title, issue number, or slug"
              className="max-w-sm"
            />
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={librarySort}
              onChange={(event) => setLibrarySort(event.target.value as LibrarySort)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <Button type="button" onClick={handleCreateIssue}>
              <Plus className="mr-2 h-4 w-4" />
              Create new issue
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filteredNewsletters.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-md border p-3 ${
                  entry.id === selectedNewsletterId ? "border-pink-400 bg-pink-50/40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{entry.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Issue {entry.issueNumber} · {formatDateLabel(entry.publishDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{statusLabel(entry.status)}</Badge>
                    {entry.isPublicSample ? <Badge>Public sample</Badge> : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-[96px_1fr] gap-3">
                  <img
                    src={entry.coverImage}
                    alt={`${entry.title} preview`}
                    className="h-20 w-24 rounded border object-cover bg-muted"
                  />
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      Last edited: {formatDateLabel(entry.lastEditedAt)}
                    </p>
                    <Input
                      value={entry.id === selectedNewsletterId ? renameDraftTitle : entry.title}
                      onChange={(event) => {
                        if (entry.id === selectedNewsletterId) setRenameDraftTitle(event.target.value);
                      }}
                      placeholder="Rename issue"
                      className="h-8 text-xs"
                      disabled={entry.id !== selectedNewsletterId}
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => handleSelectNewsletter(entry.id)}>
                    Open
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleDuplicateIssue(entry.id)}>
                    <CopyPlus className="mr-1 h-3 w-3" />
                    Duplicate
                  </Button>
                  {entry.id === selectedNewsletterId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleRenameIssue(entry.id, renameDraftTitle)}
                    >
                      Rename
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" onClick={() => handleArchiveIssue(entry.id)}>
                    <Archive className="mr-1 h-3 w-3" />
                    {entry.status === "archived" ? "Unarchive" : "Archive"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleSetPublicSample(entry.id)}>
                    Set public sample
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => handleDeleteIssue(entry.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Newsletter Builder</CardTitle>
          <CardDescription>Create and edit public sample newsletter content.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertTitle>Draft status</AlertTitle>
            <AlertDescription className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {statusBadges.map((status) => (
                  <Badge key={status} variant={status.includes("error") ? "destructive" : "secondary"}>
                    {status}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Drafts are saved locally on this device only. They are not shared with other admins and are not persisted to the database yet.
              </p>
              {savedLocallyAt ? (
                <p className="text-xs text-muted-foreground">Last local save: {savedLocallyAt}</p>
              ) : null}
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleManualSave}>
              <Save className="mr-2 h-4 w-4" />
              Save draft
            </Button>
            <Button type="button" variant="outline" onClick={() => handleDuplicateIssue(newsletter.id)}>
              <CopyPlus className="mr-2 h-4 w-4" />
              Duplicate draft
            </Button>
            <Button type="button" variant="outline" onClick={handleResetToPublished}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Restore published version
            </Button>
          </div>

          <Alert>
            <AlertTitle>Version history (local)</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-xs text-muted-foreground">{draftDiffSummary}</p>
              <div className="space-y-1">
                {versionHistory.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                    <span>
                      {formatDateLabel(entry.savedAt)} · {entry.reason}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRestoreVersion(entry.id)}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
                {versionHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No saved versions yet.</p>
                ) : null}
              </div>
            </AlertDescription>
          </Alert>

          {(validationErrors.length > 0 || validationWarnings.length > 0) && (
            <Alert variant={validationErrors.length > 0 ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {validationErrors.length > 0
                  ? `${validationErrors.length} blocking issue(s)`
                  : "Warnings to review"}
              </AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1">
                  {validationErrors.slice(0, 6).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                  {validationWarnings.slice(0, 6).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <AlertTitle>Content types in this phase</AlertTitle>
            <AlertDescription>
              Public sample content is editable, and personalized rendering is preview-only in admin.
              Real-user preview data is never written into local drafts.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input value={newsletter.title} onChange={(e) => updateNewsletter("title", e.target.value)} placeholder="Issue title" />
            <Input value={newsletter.issueNumber} onChange={(e) => updateNewsletter("issueNumber", e.target.value)} placeholder="Issue number" />
            <Input type="date" value={newsletter.publishDate} onChange={(e) => updateNewsletter("publishDate", e.target.value)} />
            <Input value={newsletter.subjectLine} onChange={(e) => updateNewsletter("subjectLine", e.target.value)} placeholder="Subject line" />
            <Input value={newsletter.preheader} onChange={(e) => updateNewsletter("preheader", e.target.value)} placeholder="Preview text" className="md:col-span-2" />
            <Input value={newsletter.slug} onChange={(e) => updateNewsletter("slug", normalizeSlug(e.target.value))} placeholder="slug" />
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Public sample</span>
              <Switch
                checked={newsletter.isPublicSample}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    toast({
                      title: "One sample required",
                      description: "Exactly one newsletter must stay marked as the public sample.",
                    });
                    return;
                  }
                  handleSetPublicSample(newsletter.id);
                }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={selectedAddType}
              onChange={(e) => setSelectedAddType(e.target.value as NewsletterSectionType)}
            >
              {SECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" onClick={addSection}>
              <Plus className="mr-2 h-4 w-4" />
              Add section
            </Button>
          </div>

          <div className="space-y-4">
            {newsletter.sections.map((section) => (
              <Card key={section.id} className="border border-border/60">
                <CardHeader className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{sectionTypeLabel(section.type)}</CardTitle>
                      {section.hidden ? <Badge variant="secondary">Hidden</Badge> : <Badge>Visible</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => moveSection(section.id, "up")}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => moveSection(section.id, "down")}><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => duplicateSection(section.id)}><CopyPlus className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeSection(section.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-sm">Temporarily hide</span>
                    <Switch checked={Boolean(section.hidden)} onCheckedChange={(checked) => updateSection(section.id, { hidden: checked })} />
                  </div>
                  <Input value={section.label ?? ""} onChange={(e) => updateSection(section.id, { label: e.target.value })} placeholder="Section label" />
                  <Input value={section.eyebrowText ?? ""} onChange={(e) => updateSection(section.id, { eyebrowText: e.target.value })} placeholder="Eyebrow text" />
                  <Input value={section.headline ?? ""} onChange={(e) => updateSection(section.id, { headline: e.target.value })} placeholder="Headline" />
                  <Textarea value={section.body ?? ""} onChange={(e) => updateSection(section.id, { body: e.target.value })} placeholder="Body" rows={4} />
                  <Input value={section.imageUrl ?? ""} onChange={(e) => updateSection(section.id, { imageUrl: e.target.value })} placeholder="Image URL" />
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Input value={section.ctaLabel ?? ""} onChange={(e) => updateSection(section.id, { ctaLabel: e.target.value })} placeholder="CTA label" />
                    <Input value={section.ctaUrl ?? ""} onChange={(e) => updateSection(section.id, { ctaUrl: e.target.value })} placeholder="CTA URL" />
                  </div>
                  <Input value={section.backgroundStyle ?? ""} onChange={(e) => updateSection(section.id, { backgroundStyle: e.target.value as NewsletterSection["backgroundStyle"] })} placeholder="Background style (default, pink, blue, purple, green, yellow, dark)" />
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Personalization controls</p>
                    <Input
                      value={(section.personalization?.requiredDataFields ?? []).join(", ")}
                      onChange={(e) =>
                        updateSection(section.id, {
                          personalization: updateSectionPersonalization(section, {
                            requiredDataFields: parseCsv(e.target.value) as NewsletterPersonalizationDataField[],
                          }),
                        })
                      }
                      placeholder="Required fields (comma-separated: user.firstName, recommendations.nearbyShows)"
                    />
                    <Input
                      value={(section.personalization?.displayIfStates ?? []).join(", ")}
                      onChange={(e) =>
                        updateSection(section.id, {
                          personalization: updateSectionPersonalization(section, {
                            displayIfStates: parseCsv(e.target.value),
                          }),
                        })
                      }
                      placeholder="Display states (comma-separated: active-user, connected-music-user)"
                    />
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <span className="text-sm">Requires location</span>
                      <Switch
                        checked={Boolean(section.personalization?.requiresLocation)}
                        onCheckedChange={(checked) =>
                          updateSection(section.id, {
                            personalization: updateSectionPersonalization(section, {
                              requiresLocation: checked,
                            }),
                          })
                        }
                      />
                    </div>
                    <Input
                      value={section.personalization?.fallbackSectionId ?? ""}
                      onChange={(e) =>
                        updateSection(section.id, {
                          personalization: updateSectionPersonalization(section, {
                            fallbackSectionId: e.target.value || undefined,
                          }),
                        })
                      }
                      placeholder="Fallback section ID (optional)"
                    />
                    <Input
                      value={section.personalization?.fallbackContent?.headline ?? ""}
                      onChange={(e) =>
                        updateSection(section.id, {
                          personalization: updateSectionPersonalization(section, {
                            fallbackContent: {
                              ...(section.personalization?.fallbackContent ?? {}),
                              headline: e.target.value,
                            },
                          }),
                        })
                      }
                      placeholder="Fallback headline (optional)"
                    />
                    <Textarea
                      value={section.personalization?.fallbackContent?.body ?? ""}
                      onChange={(e) =>
                        updateSection(section.id, {
                          personalization: updateSectionPersonalization(section, {
                            fallbackContent: {
                              ...(section.personalization?.fallbackContent ?? {}),
                              body: e.target.value,
                            },
                          }),
                        })
                      }
                      placeholder="Fallback body (optional)"
                      rows={2}
                    />
                  </div>

                  {section.type === "quickStories" ? (
                    <div className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Quick stories (max 6)</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => addQuickStory(section.id)} disabled={(section.cards ?? []).length >= 6}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add card
                        </Button>
                      </div>
                      {(section.cards ?? []).map((card, index) => (
                        <div key={card.id} className="space-y-2 rounded-md border p-2">
                          <Input value={card.label} onChange={(e) => updateSection(section.id, { cards: (section.cards ?? []).map((entry) => entry.id === card.id ? { ...entry, label: e.target.value } : entry) })} placeholder={`Card ${index + 1} label`} />
                          <Input value={card.title} onChange={(e) => updateSection(section.id, { cards: (section.cards ?? []).map((entry) => entry.id === card.id ? { ...entry, title: e.target.value } : entry) })} placeholder="Card title" />
                          <Textarea value={card.body} onChange={(e) => updateSection(section.id, { cards: (section.cards ?? []).map((entry) => entry.id === card.id ? { ...entry, body: e.target.value } : entry) })} placeholder="Card body" rows={3} />
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <Input value={card.ctaLabel ?? ""} onChange={(e) => updateSection(section.id, { cards: (section.cards ?? []).map((entry) => entry.id === card.id ? { ...entry, ctaLabel: e.target.value } : entry) })} placeholder="Card CTA label" />
                            <Input value={card.ctaUrl ?? ""} onChange={(e) => updateSection(section.id, { cards: (section.cards ?? []).map((entry) => entry.id === card.id ? { ...entry, ctaUrl: e.target.value } : entry) })} placeholder="Card CTA URL" />
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => updateSection(section.id, { cards: (() => {
                              const cards = [...(section.cards ?? [])];
                              const cardIndex = cards.findIndex((entry) => entry.id === card.id);
                              if (cardIndex <= 0) return cards;
                              const [item] = cards.splice(cardIndex, 1);
                              cards.splice(cardIndex - 1, 0, item);
                              return cards;
                            })() })}><ArrowUp className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => updateSection(section.id, { cards: (() => {
                              const cards = [...(section.cards ?? [])];
                              const cardIndex = cards.findIndex((entry) => entry.id === card.id);
                              if (cardIndex < 0 || cardIndex >= cards.length - 1) return cards;
                              const [item] = cards.splice(cardIndex, 1);
                              cards.splice(cardIndex + 1, 0, item);
                              return cards;
                            })() })}><ArrowDown className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => updateSection(section.id, { cards: (section.cards ?? []).filter((entry) => entry.id !== card.id) })}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {lastDeletedSection ? (
            <Button type="button" variant="outline" onClick={restoreDeletedSection}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore deleted section
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live personalization preview</CardTitle>
          <CardDescription>
            Reuse one template in `web` and `email` modes with full-width rendering.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Personalization profile</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_OPTIONS.map((preset) => (
                <Button
                  key={preset.id}
                  variant={
                    personalizationPreset === preset.id && !selectedRealUserId
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    setPersonalizationPreset(preset.id);
                    clearRealUserPreview();
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            {!recipientOnlyPreview ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Admin mock data</Badge>
                <Badge variant="outline">
                  Derived state: {inferDerivedState(previewContext)}
                </Badge>
                {selectedRealUserId ? (
                  <Badge variant="destructive">Real user data in preview</Badge>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2 rounded-md border p-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Preview real user (optional)</p>
              <div className="flex gap-2">
                <Input
                  value={userSearchQuery}
                  onChange={(event) => setUserSearchQuery(event.target.value)}
                  placeholder="Search by name or username"
                />
                <Button type="button" variant="outline" size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {userSearchResults.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {userSearchResults.map((result) => (
                    <Button
                      key={result.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRealUserId(result.id);
                        setUserSearchResults([]);
                      }}
                    >
                      <User className="mr-1 h-3 w-3" />
                      {result.label}
                    </Button>
                  ))}
                </div>
              ) : null}
              {selectedRealUserId ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Previewing user: {selectedRealUserId.slice(0, 8)}</Badge>
                  <Button type="button" variant="ghost" size="sm" onClick={clearRealUserPreview}>
                    <X className="mr-1 h-3 w-3" />
                    Clear real user
                  </Button>
                </div>
              ) : null}
              {realContextLoading ? <p className="text-xs text-muted-foreground">Loading real-user context...</p> : null}
              {realContextError ? <p className="text-xs text-destructive">{realContextError}</p> : null}
            </div>
          </div>

          {!recipientOnlyPreview ? (
            <div className="space-y-2 rounded-md border border-dashed border-amber-300 bg-amber-50/40 p-3">
              <p className="text-sm font-medium">Supported tokens (admin-only)</p>
              <p className="text-xs text-muted-foreground">
                Admin-only reference. Tokens may be unavailable for some user states.
              </p>
              <div className="space-y-2">
                {TOKEN_REFERENCE.map((group) => (
                  <div key={group.category} className="rounded border bg-background p-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{group.category}</p>
                    <div className="mt-2 space-y-1">
                      {group.items.map((item) => (
                        <div key={item.token} className="flex items-center justify-between gap-2 text-xs">
                          <div>
                            <button
                              type="button"
                              className="font-mono text-left text-pink-700 hover:underline"
                              onClick={() => handleCopyToken(item.token)}
                            >
                              {item.token}
                            </button>
                            <span className="ml-2 text-muted-foreground">{item.description}</span>
                          </div>
                          {item.optional ? <Badge variant="outline">May be unavailable</Badge> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 items-center">
            <Button
              size="sm"
              variant={personalizationPreviewMode === "resolved" ? "default" : "outline"}
              onClick={() => setPersonalizationPreviewMode("resolved")}
            >
              Preview resolved
            </Button>
            <Button
              size="sm"
              variant={personalizationPreviewMode === "template" ? "default" : "outline"}
              onClick={() => setPersonalizationPreviewMode("template")}
            >
              Preview template tokens
            </Button>
            <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
              <span className="text-xs font-medium">Recipient-only preview</span>
              <Switch
                checked={recipientOnlyPreview}
                onCheckedChange={setRecipientOnlyPreview}
              />
            </div>
          </div>
          {recipientOnlyPreview ? (
            <Alert>
              <AlertTitle>Recipient view</AlertTitle>
              <AlertDescription>
                Admin metadata is hidden below. This iframe matches exported HTML.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>Admin view</AlertTitle>
              <AlertDescription>
                Source labels, confidence, and fallback notes below are admin-only and never export.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            {(["desktop-web", "mobile-web", "desktop-email", "mobile-email"] as PreviewPreset[]).map((preset) => (
              <Button key={preset} variant={previewPreset === preset ? "default" : "outline"} size="sm" onClick={() => setPreviewPreset(preset)}>
                {preset.replace("-", " ")}
              </Button>
            ))}
          </div>

          {validationErrors.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>Fix validation before export</AlertTitle>
              <AlertDescription>{validationErrors[0]}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handlePreviewPublicSample}>
              <Eye className="mr-2 h-4 w-4" />
              Preview public sample
            </Button>
            <Button type="button" variant="outline" onClick={handleCopyJson}>
              <Copy className="mr-2 h-4 w-4" />
              Copy newsletter JSON
            </Button>
            <Button type="button" variant="outline" onClick={handleDownloadJson}>
              <FileDown className="mr-2 h-4 w-4" />
              Download JSON
            </Button>
            <Button type="button" variant="outline" onClick={handleResetToPublished}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset to published version
            </Button>
            <Button type="button" variant="outline" onClick={handleClearLocalDraft}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear local draft
            </Button>
            <Button type="button" variant="outline" onClick={() => handleDownloadEmailHtml("template")} disabled={!canExport}>
              <Download className="mr-2 h-4 w-4" />
              Export template HTML
            </Button>
            <Button type="button" variant="outline" onClick={() => handleCopyEmailHtml("template")} disabled={!canExport}>
              <Copy className="mr-2 h-4 w-4" />
              Copy template HTML
            </Button>
            <Button type="button" variant="outline" onClick={() => handleDownloadEmailHtml("resolved")} disabled={!canExport}>
              <Download className="mr-2 h-4 w-4" />
              Export resolved mock sample
            </Button>
            <Button type="button" variant="outline" onClick={() => handleCopyEmailHtml("resolved")} disabled={!canExport}>
              <Copy className="mr-2 h-4 w-4" />
              Copy resolved sample HTML
            </Button>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Resend test send</p>
            <p className="text-xs text-muted-foreground">
              Safe mode only: sends one resolved newsletter to your test email. Production send remains manual and is not triggered here.
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input
                value={testSendEmail}
                onChange={(event) => setTestSendEmail(event.target.value)}
                placeholder="you@yourdomain.com"
              />
              <Input value={newsletter.subjectLine} readOnly />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadEligibleCount}
                disabled={eligibleCountLoading}
              >
                {eligibleCountLoading ? "Checking..." : "Check eligible recipient count"}
              </Button>
              <Button
                type="button"
                onClick={handleSendTest}
                disabled={isSendingTest || !selectedRealUserId || !testSendEmail.trim()}
              >
                {isSendingTest ? "Sending..." : "Send one test email"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                Personalization source:{" "}
                {selectedRealUserId ? `real user ${selectedRealUserId.slice(0, 8)}` : "none selected"}
              </p>
              {eligibleCount !== null ? <p>Eligible recipients currently: {eligibleCount}</p> : null}
              {testSendMessage ? <p>{testSendMessage}</p> : null}
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Import newsletter JSON</p>
            <Textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste exported newsletter JSON here"
              rows={6}
            />
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex">
                <input type="file" accept="application/json" className="hidden" onChange={handleImportJsonFile} />
                <span className="inline-flex h-10 items-center rounded-md border px-4 text-sm cursor-pointer">
                  <Upload className="mr-2 h-4 w-4" />
                  Load JSON file
                </span>
              </label>
              <Button type="button" variant="outline" onClick={handleImportJson} disabled={!importJson.trim()}>
                Import JSON
              </Button>
            </div>
          </div>

          {!recipientOnlyPreview ? (
            <div className="space-y-2 rounded-md border border-dashed border-amber-300 bg-amber-50/40 p-3">
              <p className="text-sm font-medium">Module explanations (admin-only)</p>
              <p className="text-xs text-muted-foreground">
                These explanations are preview-only and never exported in HTML.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">Personalized: {moduleSummary.personalizedModules}</Badge>
                <Badge variant="secondary">Fallback: {moduleSummary.fallbackModules}</Badge>
                <Badge variant="secondary">Admin-selected: {moduleSummary.adminSelectedModules}</Badge>
              </div>
              <div className="space-y-1">
                {resolvedNewsletterResult.moduleExplanations.map((entry) => (
                  <div key={entry.sectionId} className="rounded border bg-background px-2 py-1 text-xs">
                    <div className="mb-1 flex flex-wrap items-center gap-1">
                      <span className="font-semibold">{entry.sectionType}</span>
                      <Badge variant="outline">{entry.sourceLabel}</Badge>
                      <Badge variant={entry.confidence === "low" ? "destructive" : "secondary"}>
                        {entry.confidence} confidence
                      </Badge>
                      {entry.fallbackUsed ? <Badge variant="secondary">fallback</Badge> : null}
                    </div>
                    <span>{entry.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div
            className={`rounded-md border p-2 ${
              recipientOnlyPreview ? "border-pink-300 bg-white" : "border-border bg-muted/20"
            }`}
          >
            {recipientOnlyPreview ? (
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-pink-700">
                Recipient-only preview
              </p>
            ) : (
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Admin annotated preview
              </p>
            )}
            <div className="mx-auto overflow-hidden rounded-md border bg-white" style={{ width: previewWidth }}>
              <iframe title="Newsletter preview" srcDoc={previewHtml} className="h-[760px] w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}

