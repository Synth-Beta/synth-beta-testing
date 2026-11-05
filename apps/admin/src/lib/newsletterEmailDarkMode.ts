/**
 * Shared dark-mode support for Synth newsletter HTML.
 * Light-mode inline styles stay the source of truth; dark overrides live here.
 */

export const NEWSLETTER_DARK_MODE_MARK = "synth-newsletter-dark-1";

/** Deliberate dark palette — charcoal, not pure black. */
export const NEWSLETTER_DARK = {
  page: "#1C1B1F",
  shell: "#232227",
  card: "#2C2A30",
  cardPink: "#3A2733",
  cardYellow: "#3A3426",
  border: "#45414A",
  text: "#F2F0F3",
  muted: "#C4BFC8",
  soft: "#9E99A4",
  link: "#E85BA8",
  eyebrow: "#F0A0D0",
  accentNote: "#D4B3C0",
  brandPink: "#CC2486",
  brandYellow: "#FCDC5F",
  heroText: "#FFFFFF",
  buttonText: "#FFFFFF",
  darkPanel: "#141316",
  darkPanelText: "#F2F0F3",
  darkPanelMuted: "#D5D0D8",
} as const;

export type NewsletterColorPreviewMode =
  | "light"
  | "dark"
  | "gmail-invert-sim"
  | "outlook-invert-sim";

export const NEWSLETTER_COLOR_PREVIEW_OPTIONS: Array<{
  id: NewsletterColorPreviewMode;
  label: string;
  hint: string;
  simulated: boolean;
}> = [
  {
    id: "light",
    label: "Light",
    hint: "Intended light appearance (unchanged design).",
    simulated: false,
  },
  {
    id: "dark",
    label: "Dark",
    hint: "Intended dark theme for clients that honor prefers-color-scheme.",
    simulated: false,
  },
  {
    id: "gmail-invert-sim",
    label: "Gmail invert (sim)",
    hint: "Approximate forced inversion. Not real Gmail rendering.",
    simulated: true,
  },
  {
    id: "outlook-invert-sim",
    label: "Outlook invert (sim)",
    hint: "Approximate Outlook dark remapping. Not real Outlook rendering.",
    simulated: true,
  },
];

const darkOverrides = (prefix: string) => `
${prefix} .nl-page,
${prefix} .nl-page-bg { background-color:${NEWSLETTER_DARK.page} !important; background:${NEWSLETTER_DARK.page} !important; }
${prefix} .nl-shell { background-color:${NEWSLETTER_DARK.shell} !important; background:${NEWSLETTER_DARK.shell} !important; }
${prefix} .nl-card { background-color:${NEWSLETTER_DARK.card} !important; background:${NEWSLETTER_DARK.card} !important; border-color:${NEWSLETTER_DARK.border} !important; }
${prefix} .nl-card-pink { background-color:${NEWSLETTER_DARK.cardPink} !important; background:${NEWSLETTER_DARK.cardPink} !important; border-color:${NEWSLETTER_DARK.border} !important; }
${prefix} .nl-card-yellow { background-color:${NEWSLETTER_DARK.cardYellow} !important; background:${NEWSLETTER_DARK.cardYellow} !important; border-color:${NEWSLETTER_DARK.border} !important; }
${prefix} .nl-heading,
${prefix} .nl-brand-title { color:${NEWSLETTER_DARK.text} !important; }
${prefix} .nl-body-text,
${prefix} .nl-paragraph { color:${NEWSLETTER_DARK.muted} !important; }
${prefix} .nl-muted,
${prefix} .nl-issue,
${prefix} .nl-footer-meta { color:${NEWSLETTER_DARK.soft} !important; }
${prefix} .nl-eyebrow { color:${NEWSLETTER_DARK.eyebrow} !important; }
${prefix} .nl-note { color:${NEWSLETTER_DARK.accentNote} !important; }
${prefix} .nl-link,
${prefix} .nl-link a,
${prefix} a.nl-link { color:${NEWSLETTER_DARK.link} !important; }
${prefix} .nl-unsub,
${prefix} .nl-unsub a { color:${NEWSLETTER_DARK.soft} !important; }
${prefix} .nl-divider { border-color:${NEWSLETTER_DARK.border} !important; }
${prefix} .nl-list-rule { border-color:${NEWSLETTER_DARK.border} !important; }
${prefix} .nl-hero,
${prefix} .nl-hero td,
${prefix} .nl-hero h1,
${prefix} .nl-hero p,
${prefix} .nl-hero div { background-color:${NEWSLETTER_DARK.brandPink} !important; color:${NEWSLETTER_DARK.heroText} !important; }
${prefix} .nl-btn,
${prefix} .nl-btn a,
${prefix} .nl-btn td { color:${NEWSLETTER_DARK.buttonText} !important; }
${prefix} .nl-btn-pink,
${prefix} .nl-btn-pink td { background-color:${NEWSLETTER_DARK.brandPink} !important; background:${NEWSLETTER_DARK.brandPink} !important; }
${prefix} .nl-btn-dark,
${prefix} .nl-btn-dark td { background-color:${NEWSLETTER_DARK.brandPink} !important; background:${NEWSLETTER_DARK.brandPink} !important; }
${prefix} .nl-dark-panel,
${prefix} .nl-dark-panel td { background-color:${NEWSLETTER_DARK.darkPanel} !important; background:${NEWSLETTER_DARK.darkPanel} !important; color:${NEWSLETTER_DARK.darkPanelText} !important; border:1px solid ${NEWSLETTER_DARK.border} !important; }
${prefix} .nl-dark-panel .nl-heading,
${prefix} .nl-dark-panel h2,
${prefix} .nl-dark-panel p,
${prefix} .nl-dark-panel div { color:${NEWSLETTER_DARK.darkPanelText} !important; }
${prefix} .nl-dark-panel .nl-panel-muted { color:${NEWSLETTER_DARK.darkPanelMuted} !important; }
${prefix} .nl-dark-panel .nl-eyebrow { color:${NEWSLETTER_DARK.brandYellow} !important; }
${prefix} .nl-logo,
${prefix} .nl-logo img,
${prefix} img.nl-logo { background-color:${NEWSLETTER_DARK.shell} !important; border-radius:10px !important; }
${prefix} .nl-phone-art,
${prefix} img.nl-phone-art { background-color:transparent !important; }
${prefix} .nl-footer-title { color:${NEWSLETTER_DARK.text} !important; }
`.trim();

/** CSS embedded in every sent newsletter. */
export const newsletterDarkModeStyleBlock = `
/* ${NEWSLETTER_DARK_MODE_MARK} */
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
${darkOverrides("")}
}
/* Outlook.com / Outlook mobile partial dark support */
[data-ogsc] .nl-page,
[data-ogsb] .nl-page { background-color:${NEWSLETTER_DARK.page} !important; }
[data-ogsc] .nl-shell,
[data-ogsb] .nl-shell { background-color:${NEWSLETTER_DARK.shell} !important; }
[data-ogsc] .nl-heading,
[data-ogsb] .nl-heading,
[data-ogsc] .nl-brand-title,
[data-ogsb] .nl-brand-title { color:${NEWSLETTER_DARK.text} !important; }
[data-ogsc] .nl-body-text,
[data-ogsb] .nl-body-text,
[data-ogsc] .nl-paragraph,
[data-ogsb] .nl-paragraph { color:${NEWSLETTER_DARK.muted} !important; }
[data-ogsc] .nl-card,
[data-ogsb] .nl-card { background-color:${NEWSLETTER_DARK.card} !important; border-color:${NEWSLETTER_DARK.border} !important; }
[data-ogsc] .nl-link,
[data-ogsb] .nl-link { color:${NEWSLETTER_DARK.link} !important; }
[data-ogsc] .nl-btn a,
[data-ogsb] .nl-btn a { color:${NEWSLETTER_DARK.buttonText} !important; }
[data-ogsc] .nl-hero,
[data-ogsb] .nl-hero { background-color:${NEWSLETTER_DARK.brandPink} !important; color:${NEWSLETTER_DARK.heroText} !important; }
`.trim();

export const newsletterColorSchemeMeta = `
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
`.trim();

const forceLightCss = `
/* admin preview: force light even when OS is dark */
:root { color-scheme: light only !important; supported-color-schemes: light only !important; }
html.nl-preview-root .nl-page,
html.nl-preview-root .nl-page-bg { background-color:#F6F4F5 !important; background:#F6F4F5 !important; }
html.nl-preview-root .nl-shell { background-color:#FFFFFF !important; background:#FFFFFF !important; }
html.nl-preview-root .nl-card { background-color:#FFFFFF !important; background:#FFFFFF !important; border-color:#E8E3E7 !important; }
html.nl-preview-root .nl-card-pink { background-color:#FFF6FA !important; background:#FFF6FA !important; border-color:#E8E3E7 !important; }
html.nl-preview-root .nl-card-yellow { background-color:#FFF9E6 !important; background:#FFF9E6 !important; border-color:#E8E3E7 !important; }
html.nl-preview-root .nl-heading,
html.nl-preview-root .nl-brand-title,
html.nl-preview-root .nl-footer-title { color:#161616 !important; }
html.nl-preview-root .nl-body-text,
html.nl-preview-root .nl-paragraph { color:#505662 !important; }
html.nl-preview-root .nl-muted,
html.nl-preview-root .nl-issue,
html.nl-preview-root .nl-footer-meta { color:#6D717C !important; }
html.nl-preview-root .nl-eyebrow { color:#A11C70 !important; }
html.nl-preview-root .nl-note { color:#7B5566 !important; }
html.nl-preview-root .nl-link,
html.nl-preview-root .nl-link a,
html.nl-preview-root a.nl-link { color:#CC2486 !important; }
html.nl-preview-root .nl-unsub,
html.nl-preview-root .nl-unsub a { color:#777777 !important; }
html.nl-preview-root .nl-divider,
html.nl-preview-root .nl-list-rule { border-color:#E6E6E6 !important; }
html.nl-preview-root .nl-hero,
html.nl-preview-root .nl-hero td,
html.nl-preview-root .nl-hero h1,
html.nl-preview-root .nl-hero p,
html.nl-preview-root .nl-hero div { background-color:#CC2486 !important; color:#FFFFFF !important; }
html.nl-preview-root .nl-btn,
html.nl-preview-root .nl-btn a,
html.nl-preview-root .nl-btn td { color:#FFFFFF !important; }
html.nl-preview-root .nl-btn-pink,
html.nl-preview-root .nl-btn-pink td { background-color:#CC2486 !important; background:#CC2486 !important; }
html.nl-preview-root .nl-btn-dark,
html.nl-preview-root .nl-btn-dark td { background-color:#111111 !important; background:#111111 !important; }
html.nl-preview-root .nl-dark-panel,
html.nl-preview-root .nl-dark-panel td { background-color:#101010 !important; background:#101010 !important; color:#FFFFFF !important; border:0 !important; }
html.nl-preview-root .nl-dark-panel .nl-heading,
html.nl-preview-root .nl-dark-panel h2,
html.nl-preview-root .nl-dark-panel p,
html.nl-preview-root .nl-dark-panel div { color:#FFFFFF !important; }
html.nl-preview-root .nl-dark-panel .nl-panel-muted { color:#E4DFE3 !important; }
html.nl-preview-root .nl-dark-panel .nl-eyebrow { color:#FCDC5F !important; }
html.nl-preview-root .nl-logo,
html.nl-preview-root .nl-logo img,
html.nl-preview-root img.nl-logo { background-color:transparent !important; }
`.trim();

const forceDarkCss = `
/* admin preview: force intended dark theme */
:root { color-scheme: dark only !important; supported-color-schemes: dark only !important; }
${darkOverrides("html.nl-preview-root")}
`.trim();

/** Approximate Gmail-style auto inversion (simulation only). */
const gmailInvertSimCss = `
/* SIMULATION — not real Gmail */
html.nl-preview-root {
  background:#111 !important;
  filter: invert(1) hue-rotate(180deg);
}
html.nl-preview-root img,
html.nl-preview-root .nl-hero,
html.nl-preview-root .nl-btn-pink,
html.nl-preview-root .nl-dark-panel {
  filter: invert(1) hue-rotate(180deg);
}
`.trim();

/** Approximate Outlook dark remapping (simulation only). */
const outlookInvertSimCss = `
/* SIMULATION — not real Outlook */
html.nl-preview-root {
  background:${NEWSLETTER_DARK.page} !important;
}
html.nl-preview-root .nl-page,
html.nl-preview-root .nl-page-bg {
  background-color:#2B2A2E !important;
  background:#2B2A2E !important;
}
html.nl-preview-root .nl-shell {
  background-color:#323136 !important;
  background:#323136 !important;
}
html.nl-preview-root .nl-card {
  background-color:#3A383F !important;
  border-color:#55515A !important;
}
html.nl-preview-root .nl-heading,
html.nl-preview-root .nl-brand-title,
html.nl-preview-root .nl-footer-title { color:#F7F5F8 !important; }
html.nl-preview-root .nl-paragraph,
html.nl-preview-root .nl-body-text { color:#D2CED6 !important; }
html.nl-preview-root .nl-muted,
html.nl-preview-root .nl-issue,
html.nl-preview-root .nl-footer-meta,
html.nl-preview-root .nl-unsub { color:#A8A3AD !important; }
html.nl-preview-root .nl-link { color:#F0A0D0 !important; }
html.nl-preview-root .nl-hero { background-color:#B81F78 !important; color:#FFFFFF !important; }
html.nl-preview-root .nl-btn a { color:#FFFFFF !important; }
`.trim();

const previewCssForMode = (mode: NewsletterColorPreviewMode) => {
  switch (mode) {
    case "dark":
      return forceDarkCss;
    case "gmail-invert-sim":
      return gmailInvertSimCss;
    case "outlook-invert-sim":
      return outlookInvertSimCss;
    case "light":
    default:
      return forceLightCss;
  }
};

/** Inject admin-only preview CSS so toggles work regardless of OS theme. */
export const applyNewsletterColorPreviewMode = (
  html: string,
  mode: NewsletterColorPreviewMode
): string => {
  const css = previewCssForMode(mode);
  const styleTag = `<style data-nl-preview-mode="${mode}">${css}</style>`;
  const withHtmlClass = html.includes("<html")
    ? html.replace(/<html([^>]*)>/i, (_match, attrs: string) => {
        if (/\bclass=/i.test(attrs)) {
          return `<html${attrs.replace(/class=(["'])(.*?)\1/i, (_m, q, value) => `class=${q}${value} nl-preview-root${q}`)}>`;
        }
        return `<html${attrs} class="nl-preview-root">`;
      })
    : html;

  if (/<\/head>/i.test(withHtmlClass)) {
    return withHtmlClass.replace(/<\/head>/i, `${styleTag}</head>`);
  }
  return `${styleTag}${withHtmlClass}`;
};

/**
 * Ensure a stored draft HTML document includes dark-mode head assets.
 * Safe to call on already-tagged HTML (no-op when mark present).
 */
export const ensureNewsletterDarkModeHead = (html: string): string => {
  if (!html || html.includes(NEWSLETTER_DARK_MODE_MARK)) return html;
  const injection = `${newsletterColorSchemeMeta}\n<style>\n${newsletterDarkModeStyleBlock}\n</style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${injection}\n</head>`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (open) => `${open}<head>${injection}</head>`);
  }
  return `<!DOCTYPE html><html><head>${injection}</head><body>${html}</body></html>`;
};

/** Asserts required dark-mode assets exist in rendered HTML. */
export const newsletterDarkModeHtmlChecks = (html: string) => {
  const missing: string[] = [];
  if (!html.includes(NEWSLETTER_DARK_MODE_MARK)) missing.push("dark-mode mark");
  if (!/name=["']color-scheme["']/i.test(html)) missing.push("color-scheme meta");
  if (!/prefers-color-scheme:\s*dark/i.test(html)) missing.push("prefers-color-scheme dark CSS");
  if (!/\bnl-page\b/.test(html)) missing.push("nl-page class");
  if (!/\bnl-shell\b/.test(html)) missing.push("nl-shell class");
  if (!/\bnl-heading\b/.test(html)) missing.push("nl-heading class");
  if (!/\bnl-card\b/.test(html)) missing.push("nl-card class");
  return { ok: missing.length === 0, missing };
};
