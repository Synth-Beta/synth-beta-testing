/** Mirrors apps/admin/src/lib/newsletterEmailDarkMode.ts for Deno sends. */
export const NEWSLETTER_DARK_MODE_MARK = "synth-newsletter-dark-1";

const DARK = {
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

const darkOverrides = (prefix: string) => `
${prefix} .nl-page,
${prefix} .nl-page-bg { background-color:${DARK.page} !important; background:${DARK.page} !important; }
${prefix} .nl-shell { background-color:${DARK.shell} !important; background:${DARK.shell} !important; }
${prefix} .nl-card { background-color:${DARK.card} !important; background:${DARK.card} !important; border-color:${DARK.border} !important; }
${prefix} .nl-card-pink { background-color:${DARK.cardPink} !important; background:${DARK.cardPink} !important; border-color:${DARK.border} !important; }
${prefix} .nl-card-yellow { background-color:${DARK.cardYellow} !important; background:${DARK.cardYellow} !important; border-color:${DARK.border} !important; }
${prefix} .nl-heading,
${prefix} .nl-brand-title { color:${DARK.text} !important; }
${prefix} .nl-body-text,
${prefix} .nl-paragraph { color:${DARK.muted} !important; }
${prefix} .nl-muted,
${prefix} .nl-issue,
${prefix} .nl-footer-meta { color:${DARK.soft} !important; }
${prefix} .nl-eyebrow { color:${DARK.eyebrow} !important; }
${prefix} .nl-note { color:${DARK.accentNote} !important; }
${prefix} .nl-link,
${prefix} .nl-link a,
${prefix} a.nl-link { color:${DARK.link} !important; }
${prefix} .nl-unsub,
${prefix} .nl-unsub a { color:${DARK.soft} !important; }
${prefix} .nl-divider { border-color:${DARK.border} !important; }
${prefix} .nl-list-rule { border-color:${DARK.border} !important; }
${prefix} .nl-hero,
${prefix} .nl-hero td,
${prefix} .nl-hero h1,
${prefix} .nl-hero p,
${prefix} .nl-hero div { background-color:${DARK.brandPink} !important; color:${DARK.heroText} !important; }
${prefix} .nl-btn,
${prefix} .nl-btn a,
${prefix} .nl-btn td { color:${DARK.buttonText} !important; }
${prefix} .nl-btn-pink,
${prefix} .nl-btn-pink td { background-color:${DARK.brandPink} !important; background:${DARK.brandPink} !important; }
${prefix} .nl-btn-dark,
${prefix} .nl-btn-dark td { background-color:${DARK.brandPink} !important; background:${DARK.brandPink} !important; }
${prefix} .nl-dark-panel,
${prefix} .nl-dark-panel td { background-color:${DARK.darkPanel} !important; background:${DARK.darkPanel} !important; color:${DARK.darkPanelText} !important; border:1px solid ${DARK.border} !important; }
${prefix} .nl-dark-panel .nl-heading,
${prefix} .nl-dark-panel h2,
${prefix} .nl-dark-panel p,
${prefix} .nl-dark-panel div { color:${DARK.darkPanelText} !important; }
${prefix} .nl-dark-panel .nl-panel-muted { color:${DARK.darkPanelMuted} !important; }
${prefix} .nl-dark-panel .nl-eyebrow { color:${DARK.brandYellow} !important; }
${prefix} .nl-logo,
${prefix} .nl-logo img,
${prefix} img.nl-logo { background-color:${DARK.shell} !important; border-radius:10px !important; }
${prefix} .nl-phone-art,
${prefix} img.nl-phone-art { background-color:transparent !important; }
${prefix} .nl-footer-title { color:${DARK.text} !important; }
`.trim();

const styleBlock = `
/* ${NEWSLETTER_DARK_MODE_MARK} */
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
${darkOverrides("")}
}
[data-ogsc] .nl-page,
[data-ogsb] .nl-page { background-color:${DARK.page} !important; }
[data-ogsc] .nl-shell,
[data-ogsb] .nl-shell { background-color:${DARK.shell} !important; }
[data-ogsc] .nl-heading,
[data-ogsb] .nl-heading,
[data-ogsc] .nl-brand-title,
[data-ogsb] .nl-brand-title { color:${DARK.text} !important; }
[data-ogsc] .nl-body-text,
[data-ogsb] .nl-body-text,
[data-ogsc] .nl-paragraph,
[data-ogsb] .nl-paragraph { color:${DARK.muted} !important; }
[data-ogsc] .nl-card,
[data-ogsb] .nl-card { background-color:${DARK.card} !important; border-color:${DARK.border} !important; }
[data-ogsc] .nl-link,
[data-ogsb] .nl-link { color:${DARK.link} !important; }
[data-ogsc] .nl-btn a,
[data-ogsb] .nl-btn a { color:${DARK.buttonText} !important; }
[data-ogsc] .nl-hero,
[data-ogsb] .nl-hero { background-color:${DARK.brandPink} !important; color:${DARK.heroText} !important; }
`.trim();

const meta = `
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
`.trim();

export const ensureNewsletterDarkModeHead = (html: string): string => {
  if (!html || html.includes(NEWSLETTER_DARK_MODE_MARK)) return html;
  const injection = `${meta}\n<style>\n${styleBlock}\n</style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${injection}\n</head>`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (open) => `${open}<head>${injection}</head>`);
  }
  return `<!DOCTYPE html><html><head>${injection}</head><body>${html}</body></html>`;
};
