import { format } from "date-fns";
import { NewsletterIssue, NewsletterListItem, NewsletterSection } from "@/types/newsletter";

export type NewsletterRenderMode = "web" | "email";

interface NewsletterRenderOptions {
  mode?: NewsletterRenderMode;
  absoluteBaseUrl?: string;
}

const BRAND = {
  pink: "#CC2486",
  darkPink: "#951A6D",
  purple: "#8D1FF4",
  yellow: "#806500",
  yellowBg: "#FFF8DB",
  pinkBg: "#FDF2F7",
  black: "#0E0E0E",
  muted: "#5D646F",
  soft: "#8A8F98",
  white: "#FFFFFF",
  cream: "#FCFCFC",
};

const FONT =
  "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getIssueLabel = (newsletter: NewsletterIssue) => {
  const date = newsletter.publishDate
    ? format(new Date(newsletter.publishDate), "EEEE, MMMM d, yyyy")
    : "";
  return `${date} · Issue No. ${newsletter.issueNumber}`.trim();
};

const absoluteUrl = (url?: string, baseUrl?: string) => {
  if (!url) return "#";
  if (url.startsWith("{{") && url.endsWith("}}")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

const sectionTheme = (section: NewsletterSection) => {
  switch (section.backgroundStyle) {
    case "blue":
      return { background: "#F2F8FF", accent: "#1E5BB8" };
    case "purple":
      return { background: "#F5F0FF", accent: "#6B2CB8" };
    case "green":
      return { background: "#F4FFF4", accent: "#177A34" };
    case "yellow":
      return { background: BRAND.yellowBg, accent: BRAND.yellow };
    case "dark":
      return { background: BRAND.black, accent: "#FCDC5F" };
    case "pink":
      return { background: BRAND.pinkBg, accent: BRAND.darkPink };
    default:
      return { background: BRAND.white, accent: BRAND.pink };
  }
};

const hasText = (value?: string) => Boolean(value && value.trim());

const hasSectionContent = (section: NewsletterSection) => {
  const hasBaseContent =
    hasText(section.label) ||
    hasText(section.eyebrowText) ||
    hasText(section.headline) ||
    hasText(section.body) ||
    hasText(section.imageUrl) ||
    hasText(section.ctaLabel) ||
    hasText(section.ctaUrl);
  if (section.type === "quickStories") return (section.cards?.length ?? 0) > 0;
  if (section.type === "yourMusic") return hasBaseContent || (section.listItems?.length ?? 0) > 0;
  if (section.type === "concertHistory") return hasBaseContent || (section.listItems?.length ?? 0) > 0;
  return hasBaseContent;
};

const isExternalEditorialUrl = (url?: string) => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return !(
      host === "join.getsynth.app" ||
      host === "getsynth.app" ||
      host === "www.getsynth.app" ||
      host.endsWith(".getsynth.app")
    );
  } catch {
    return false;
  }
};

const shouldUseButton = (section: NewsletterSection) => {
  if (section.ctaStyle === "button") return true;
  if (section.ctaStyle === "link") return false;
  return (
    section.type === "cta" ||
    section.type === "yourSynth" ||
    section.type === "yourMusic" ||
    section.type === "aroundYou" ||
    section.type === "discoverTip" ||
    section.type === "communitySpotlight"
  );
};

const pillButtonHtml = (label: string, href: string, options?: { dark?: boolean }) => {
  const bg = options?.dark ? BRAND.pink : BRAND.pink;
  const color = BRAND.white;
  return `
<table role="presentation" style="margin:20px 0 0;">
<tr>
<td bgcolor="${bg}" class="button" style="border-radius:999px;background:${bg};">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:16px;line-height:1;font-weight:700;color:${color};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
</td>
</tr>
</table>`;
};

const textLinkHtml = (label: string, href: string, color: string) =>
  `<div style="margin-top:16px;"><a href="${escapeHtml(href)}" style="font-size:16px;font-weight:700;color:${color};text-decoration:none;">${escapeHtml(label)} →</a></div>`;

const ctaHtml = (
  section: NewsletterSection,
  href: string,
  color: string,
  options?: { dark?: boolean; forceButton?: boolean }
) => {
  if (!section.ctaLabel || !href || href === "#") return "";
  if (options?.forceButton || shouldUseButton(section)) {
    return pillButtonHtml(section.ctaLabel, href, { dark: options?.dark });
  }
  return textLinkHtml(section.ctaLabel, href, color);
};

const paragraphHtml = (text: string) =>
  `<p style="margin:0 0 16px;max-width:640px;">${escapeHtml(text)}</p>`;

const listItemHtml = (item: NewsletterListItem, isLast: boolean) => `
<tr><td style="padding:18px 0;${isLast ? "" : "border-bottom:1px solid #E6E6E6;"}font-family:${FONT};">
<div style="font-size:17px;font-weight:700;color:${BRAND.black};max-width:640px;">${escapeHtml(item.title)}</div>
<div style="font-size:15px;line-height:1.55;color:${BRAND.muted};margin-top:5px;max-width:640px;">${escapeHtml(item.body)}</div>
</td></tr>`;

const storyCardHtml = (
  cards: NonNullable<NewsletterSection["cards"]>,
  baseUrl?: string,
  lead = false
) =>
  cards
    .map((story, index) => {
      const isLead = lead && index === 0;
      const href =
        story.ctaUrl && isExternalEditorialUrl(story.ctaUrl)
          ? absoluteUrl(story.ctaUrl, baseUrl)
          : undefined;
      const titleSize = isLead ? "24px" : "21px";
      const padTop = index === 0 ? "14px" : "12px";
      return `
<tr>
<td class="mobile-pad" style="padding:${padTop} 32px 0;">
<table role="presentation" style="background:${BRAND.white};border:1px solid #E6E6E6;border-radius:10px;" width="100%">
<tr>
<td style="padding:${isLead ? "26px" : "22px"};">
<div style="font-family:${FONT};">
<div style="font-size:13px;line-height:1.5;font-weight:700;color:${BRAND.pink};text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(story.label)}</div>
<div style="font-size:${titleSize};line-height:1.35;font-weight:700;color:${BRAND.black};margin-top:5px;max-width:640px;">${escapeHtml(story.title)}</div>
<div style="font-size:16px;line-height:1.65;font-weight:500;color:${BRAND.muted};margin-top:9px;max-width:640px;">${escapeHtml(story.body)}</div>
${
  href
    ? `<div style="margin-top:16px;"><a href="${escapeHtml(href)}" style="font-size:16px;font-weight:700;color:${BRAND.pink};text-decoration:none;">${escapeHtml(story.ctaLabel || "Read more")} →</a></div>`
    : ""
}
</div>
</td>
</tr>
</table>
</td>
</tr>`;
    })
    .join("");

const featureCard = (section: NewsletterSection, baseUrl?: string) => {
  const theme = sectionTheme(section);
  const isDark = section.backgroundStyle === "dark";
  const href = section.ctaUrl ? absoluteUrl(section.ctaUrl, baseUrl) : "#";
  return `
<tr>
<td class="mobile-pad" style="padding:34px 32px 0;">
<table role="presentation" style="background:${theme.background};border-radius:10px;" width="100%">
<tr>
<td style="padding:26px;">
<div style="font-family:${FONT};${isDark ? `color:${BRAND.white};` : ""}">
${section.label ? `<div style="font-size:13px;line-height:1.5;font-weight:700;color:${theme.accent};text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(section.label)}</div>` : ""}
${section.headline ? `<div style="font-size:24px;line-height:1.3;font-weight:700;color:${isDark ? BRAND.white : BRAND.black};margin-top:7px;max-width:640px;">${escapeHtml(section.headline)}</div>` : ""}
${section.body ? `<div style="font-size:16px;line-height:1.65;font-weight:500;color:${isDark ? "#E6E6E6" : BRAND.muted};margin-top:10px;max-width:640px;">${escapeHtml(section.body)}</div>` : ""}
${ctaHtml(section, href, theme.accent, { dark: isDark })}
</div>
</td>
</tr>
</table>
</td>
</tr>`;
};

const renderSection = (section: NewsletterSection, baseUrl?: string) => {
  if (section.hidden) return "";
  if (!hasSectionContent(section)) return "";

  switch (section.type) {
    case "hero":
      return `
<tr>
<td class="mobile-pad" style="padding:42px 32px;background:linear-gradient(135deg,${BRAND.pink} 0%,${BRAND.purple} 100%);">
<div style="font-family:${FONT};color:${BRAND.white};">
${section.label ? `<div style="font-size:14px;line-height:1.5;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:12px;">${escapeHtml(section.label)}</div>` : ""}
${section.headline ? `<div class="headline" style="font-weight:700;margin:0 0 16px;max-width:640px;">${escapeHtml(section.headline)}</div>` : ""}
${section.body ? `<div style="font-size:18px;line-height:1.55;font-weight:500;max-width:500px;">${escapeHtml(section.body)}</div>` : ""}
</div>
</td>
</tr>`;
    case "intro":
      return `
<tr>
<td class="mobile-pad" style="padding:32px 32px 12px;">
<div style="font-family:${FONT};color:${BRAND.black};font-size:18px;line-height:1.65;font-weight:500;max-width:640px;">
${escapeHtml(section.body || "")}
</div>
</td>
</tr>`;
    case "featuredStory":
      return `
<tr>
<td class="mobile-pad" style="padding:28px 32px 8px;">
<div style="font-family:${FONT};">
${section.label ? `<div style="font-size:13px;line-height:1.5;font-weight:700;color:${BRAND.pink};text-transform:uppercase;letter-spacing:.12em;">${escapeHtml(section.label)}</div>` : ""}
${section.headline ? `<div class="section-title" style="font-weight:700;color:${BRAND.black};margin-top:6px;max-width:640px;">${escapeHtml(section.headline)}</div>` : ""}
</div>
</td>
</tr>
<tr>
<td class="mobile-pad" style="padding:10px 32px 4px;">
<div style="font-family:${FONT};color:#333333;font-size:16px;line-height:1.75;font-weight:500;">
${(section.body || "").split(/\n{2,}/).map(paragraphHtml).join("")}
${
  section.ctaUrl && isExternalEditorialUrl(section.ctaUrl)
    ? textLinkHtml(
        section.ctaLabel || "Read more",
        absoluteUrl(section.ctaUrl, baseUrl),
        BRAND.pink
      )
    : ""
}
</div>
</td>
</tr>`;
    case "quickStories": {
      const cards = section.cards ?? [];
      const title = section.headline || section.label || "This Week in Live Music";
      return `
<tr>
<td class="mobile-pad" style="padding:36px 32px 10px;">
<div class="section-title" style="font-family:${FONT};font-weight:700;color:${BRAND.black};">${escapeHtml(title)}</div>
</td>
</tr>
${storyCardHtml(cards, baseUrl, true)}`;
    }
    case "yourMusic": {
      const href = section.ctaUrl ? absoluteUrl(section.ctaUrl, baseUrl) : "#";
      const listItems = (section.listItems ?? []).filter(
        (item) => hasText(item.title) || hasText(item.body)
      );
      return `
<tr>
<td class="mobile-pad" style="padding:36px 32px 0;">
<table role="presentation" style="background:${BRAND.white};border:1px solid #E6E6E6;border-radius:10px;" width="100%">
<tr>
<td style="padding:26px;">
<div style="font-family:${FONT};">
${section.label ? `<div style="font-size:13px;line-height:1.5;font-weight:700;color:${BRAND.pink};text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(section.label)}</div>` : ""}
${section.headline ? `<div style="font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.black};margin-top:7px;max-width:640px;">${escapeHtml(section.headline)}</div>` : ""}
${section.body ? `<div style="font-size:16px;line-height:1.65;font-weight:500;color:${BRAND.muted};margin-top:10px;max-width:640px;">${escapeHtml(section.body)}</div>` : ""}
${
  listItems.length > 0
    ? `<table role="presentation" style="margin-top:18px;border-top:1px solid #E6E6E6;" width="100%">${listItems
        .map((item, index) => listItemHtml(item, index === listItems.length - 1))
        .join("")}</table>`
    : ""
}
${ctaHtml(section, href, BRAND.pink)}
</div>
</td>
</tr>
</table>
</td>
</tr>`;
    }
    case "concertHistory": {
      const listItems = (section.listItems ?? []).filter((item) => hasText(item.title) || hasText(item.body));
      const namesLine = listItems[0]?.title;
      return `
<tr>
<td class="mobile-pad" style="padding:34px 32px 0;">
<table role="presentation" style="background:${BRAND.white};border:1px solid #E6E6E6;border-radius:10px;" width="100%">
<tr>
<td style="padding:24px 26px;">
<div style="font-family:${FONT};">
${section.label ? `<div style="font-size:13px;line-height:1.5;font-weight:700;color:${BRAND.pink};text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(section.label)}</div>` : ""}
${section.headline ? `<div style="font-size:22px;line-height:1.35;font-weight:700;color:${BRAND.black};margin-top:7px;max-width:640px;">${escapeHtml(section.headline)}</div>` : ""}
${namesLine ? `<div style="font-size:18px;line-height:1.55;font-weight:700;color:${BRAND.darkPink};margin-top:12px;max-width:640px;">${escapeHtml(namesLine)}</div>` : ""}
${section.body ? `<div style="font-size:16px;line-height:1.65;font-weight:500;color:${BRAND.muted};margin-top:10px;max-width:640px;">${escapeHtml(section.body)}</div>` : ""}
</div>
</td>
</tr>
</table>
</td>
</tr>`;
    }
    case "aroundYou": {
      const href = section.ctaUrl ? absoluteUrl(section.ctaUrl, baseUrl) : "#";
      return `
<tr>
<td class="mobile-pad" style="padding:34px 32px 0;">
<table role="presentation" style="background:${BRAND.white};border:1px solid #E6E6E6;border-radius:10px;" width="100%">
<tr>
<td style="padding:26px;">
<div style="font-family:${FONT};">
${section.label ? `<div style="font-size:13px;line-height:1.5;font-weight:700;color:${BRAND.pink};text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(section.label)}</div>` : ""}
${section.headline ? `<div style="font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.black};margin-top:7px;max-width:640px;">${escapeHtml(section.headline)}</div>` : ""}
${section.body ? `<div style="font-size:16px;line-height:1.65;font-weight:500;color:${BRAND.muted};margin-top:10px;max-width:640px;">${escapeHtml(section.body)}</div>` : ""}
${ctaHtml(section, href, BRAND.pink)}
</div>
</td>
</tr>
</table>
</td>
</tr>`;
    }
    case "cta": {
      const href = section.ctaUrl ? absoluteUrl(section.ctaUrl, baseUrl) : "#";
      return `
<tr>
<td class="mobile-pad" style="padding:34px 32px 0;">
<table role="presentation" style="background:${BRAND.black};border-radius:10px;" width="100%">
<tr>
<td style="padding:28px;">
<div style="font-family:${FONT};color:${BRAND.white};">
${section.label ? `<div style="font-size:13px;line-height:1.5;font-weight:700;color:#FCDC5F;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(section.label)}</div>` : ""}
${section.headline ? `<div style="font-size:25px;line-height:1.3;font-weight:700;margin-top:7px;max-width:640px;">${escapeHtml(section.headline)}</div>` : ""}
${section.body ? `<div style="font-size:16px;line-height:1.65;font-weight:500;color:#E6E6E6;margin-top:10px;max-width:640px;">${escapeHtml(section.body)}</div>` : ""}
${pillButtonHtml(section.ctaLabel || "Open Synth", href)}
</div>
</td>
</tr>
</table>
</td>
</tr>`;
    }
    case "footer":
      return `
<tr>
<td class="mobile-pad" style="padding:36px 32px 34px;">
<div style="font-family:${FONT};text-align:center;color:${BRAND.muted};">
${section.headline ? `<div style="font-size:16px;line-height:1.5;font-weight:700;color:${BRAND.black};">${escapeHtml(section.headline)}</div>` : ""}
${section.body ? `<div style="font-size:14px;line-height:1.6;font-weight:500;margin-top:6px;">${escapeHtml(section.body)}</div>` : ""}
<div style="font-size:13px;line-height:1.7;font-weight:500;margin-top:16px;">
${section.ctaUrl ? `<a href="${escapeHtml(absoluteUrl(section.ctaUrl, baseUrl))}" style="color:${BRAND.pink};text-decoration:none;">${escapeHtml(section.ctaLabel || "Website")}</a>` : ""}
${section.imageUrl ? `&nbsp;·&nbsp;<a href="${escapeHtml(absoluteUrl(section.imageUrl, baseUrl))}" style="color:${BRAND.pink};text-decoration:none;">Instagram</a>` : ""}
${section.eyebrowText ? `&nbsp;·&nbsp;<a href="${escapeHtml(absoluteUrl(section.eyebrowText, baseUrl))}" style="color:${BRAND.pink};text-decoration:none;">Preferences</a>` : ""}
</div>
<div style="font-size:12px;line-height:1.6;font-weight:500;color:${BRAND.soft};margin-top:14px;">Synth · Washington, DC</div>
${section.label ? `<div style="font-size:12px;line-height:1.6;font-weight:500;margin-top:6px;"><a href="${escapeHtml(absoluteUrl(section.label, baseUrl))}" style="color:${BRAND.soft};text-decoration:underline;">Unsubscribe</a></div>` : ""}
</div>
</td>
</tr>`;
    case "yourSynth":
    case "communitySpotlight":
    case "discoverTip":
    case "productUpdate":
    case "featuredEvent":
    case "featuredArtist":
    case "featuredVenue":
    default:
      return featureCard(section, baseUrl);
  }
};

export const renderNewsletterHtml = (
  newsletter: NewsletterIssue,
  options: NewsletterRenderOptions = {}
): string => {
  const mode = options.mode ?? "web";
  const containerStyle =
    mode === "email"
      ? `width:100%;max-width:none;background:${BRAND.cream};border-radius:0;overflow:hidden;`
      : `width:100%;max-width:none;background:${BRAND.cream};border-radius:0;overflow:hidden;`;
  const baseUrl = options.absoluteBaseUrl;
  const issueLabel = getIssueLabel(newsletter);
  const sectionHtml = newsletter.sections
    .map((section) => renderSection(section, baseUrl))
    .join("");

  const documentTitle = `The Synth Setlist${
    newsletter.publishDate
      ? ` - ${format(new Date(newsletter.publishDate), "MMMM d, yyyy")}`
      : ""
  }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection"/>
<title>${escapeHtml(documentTitle)}</title>
<style>
html, body { margin:0 !important; padding:0 !important; width:100% !important; background:#F5F5F5; }
table { border-spacing:0 !important; border-collapse:collapse !important; table-layout:fixed; margin:0 auto; }
img { -ms-interpolation-mode:bicubic; border:0; display:block; max-width:100%; }
a { color:${BRAND.pink}; }
.wrapper { width:100%; background:#F5F5F5; }
.container { width:100%; }
.mobile-pad { padding-left:32px; padding-right:32px; }
.headline { font-size:38px; line-height:1.15; }
.section-title { font-size:24px; line-height:1.3; }
.button:hover { background:${BRAND.darkPink} !important; }
@media screen and (max-width:620px) {
  .mobile-pad { padding-left:20px !important; padding-right:20px !important; }
  .headline { font-size:32px !important; }
  .section-title { font-size:22px !important; }
}
</style>
</head>
<body>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
${escapeHtml(newsletter.preheader)}
</div>
<table bgcolor="#F5F5F5" class="wrapper" role="presentation" width="100%">
<tr>
<td align="center" style="padding:0;">
<table bgcolor="${BRAND.cream}" class="container" role="presentation" style="${containerStyle}" width="100%">
<tr>
<td class="mobile-pad" style="padding:24px 32px 18px;border-bottom:1px solid #E6E6E6;">
<table role="presentation" width="100%">
<tr>
<td valign="middle" width="56">
<img alt="Synth" height="48" src="${escapeHtml(absoluteUrl("/Logos/Main logo black background.png", baseUrl))}" style="width:48px;height:48px;border-radius:10px;" width="48"/>
</td>
<td style="font-family:${FONT};color:${BRAND.black};" valign="middle">
<div style="font-size:20px;line-height:1.2;font-weight:700;">The Synth Setlist</div>
<div style="font-size:14px;line-height:1.5;font-weight:500;color:${BRAND.muted};">${escapeHtml(issueLabel)}</div>
</td>
</tr>
</table>
</td>
</tr>
${sectionHtml}
</table>
</td>
</tr>
</table>
</body>
</html>`.trim();
};
