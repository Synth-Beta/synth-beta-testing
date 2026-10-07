import type { ComposedEdition, ShowCard, StoryCard } from "./types";

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const card = (tone: "white" | "pink" | "yellow" | "caution", inner: string) => {
  const background = tone === "pink" ? "#FDF2F7" : tone === "yellow" || tone === "caution" ? "#FFF8DB" : "#FFFFFF";
  return `<tr><td class="mobile-pad" style="padding:18px 32px 0;"><table role="presentation" width="100%" bgcolor="${background}" style="background:${background};border:1px solid #E6E6E6;border-radius:10px;"><tr><td style="padding:22px;"><div style="font-family:${FONT};">${inner}</div></td></tr></table></td></tr>`;
};

const textLink = (label: string, url: string) =>
  `<a href="${escapeHtml(url)}" style="font-size:15px;line-height:1.6;font-weight:700;color:#CC2486;text-decoration:underline;">${escapeHtml(label)} →</a>`;

const pill = (label: string, url: string) =>
  `<table role="presentation" style="margin:20px 0 0;"><tr><td bgcolor="#CC2486" style="border-radius:999px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:#FFFFFF;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;

const storyInner = (cardData: StoryCard) => {
  const links = cardData.links?.length
    ? cardData.links.map((link) => textLink(link.label.replace(/ →$/, ""), link.url)).join("<br/>")
    : textLink(cardData.ctaLabel, cardData.ctaUrl);
  return `<div style="font-size:12px;line-height:1.5;font-weight:700;color:#951A6D;text-transform:uppercase;letter-spacing:.10em;">${escapeHtml(cardData.eyebrow)}</div><h2 style="font-size:24px;line-height:1.3;font-weight:700;color:#0E0E0E;margin:7px 0 0;">${escapeHtml(cardData.title)}</h2><p style="margin:10px 0 0;font-size:16px;line-height:1.65;color:#5D646F;">${escapeHtml(cardData.body)}</p><div style="margin-top:16px;">${links}</div>`;
};

const showInner = (show: ShowCard) =>
  `<div style="font-size:12px;line-height:1.5;font-weight:700;color:#951A6D;text-transform:uppercase;letter-spacing:.10em;">${escapeHtml(show.eyebrow)}</div><h2 style="font-size:24px;line-height:1.3;font-weight:700;color:#0E0E0E;margin:7px 0 0;">${escapeHtml(show.title)}</h2><p style="margin:10px 0 0;font-size:16px;line-height:1.65;color:#5D646F;">${escapeHtml(show.body)}</p>${
    show.availabilityNote
      ? `<p style="margin:10px 0 0;font-size:16px;line-height:1.65;color:#5D646F;"><strong style="color:#0E0E0E;">${escapeHtml(show.availabilityNote)}</strong></p>`
      : ""
  }<div style="margin-top:16px;">${textLink(show.ctaLabel, show.ctaUrl)}</div>`;

export const renderEditionHtml = (edition: ComposedEdition) => {
  const checked = edition.sources[0]?.retrievedAt.slice(0, 10) ?? "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection"/>
<title>${escapeHtml(edition.subject)}</title>
<style>
html, body { margin:0 !important; padding:0 !important; width:100% !important; background:#F5F5F5; }
table { border-spacing:0 !important; border-collapse:collapse !important; table-layout:fixed; margin:0 auto; }
img { -ms-interpolation-mode:bicubic; border:0; display:block; max-width:100%; }
a { color:#CC2486; }
.wrapper { width:100%; background:#F5F5F5; }
.container { width:100%; max-width:680px; }
.mobile-pad { padding-left:32px; padding-right:32px; }
.headline { font-size:38px; line-height:1.15; }
.section-title { font-size:24px; line-height:1.3; }
.button:hover { background:#951A6D !important; }
@media screen and (max-width:620px) {
  .container { width:100% !important; }
  .mobile-pad { padding-left:20px !important; padding-right:20px !important; }
  .headline { font-size:32px !important; }
  .section-title { font-size:22px !important; }
}
</style>
</head>
<body>
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(edition.preheader)}</div>
<table role="presentation" class="wrapper" width="100%" bgcolor="#F5F5F5"><tr><td align="center" style="padding:20px 0;">
<table role="presentation" class="container" width="680" bgcolor="#FCFCFC" style="width:100%;max-width:680px;background:#FCFCFC;">
<tr><td class="mobile-pad" style="padding:24px 32px 18px;border-bottom:1px solid #E6E6E6;"><table role="presentation" width="100%"><tr><td width="56" valign="middle"><img alt="Synth" height="48" width="48" src="https://getsynth.app/Logos/Main%20logo%20black%20background.png" style="width:48px;height:48px;border-radius:10px;"/></td><td style="font-family:${FONT};"><div style="font-size:20px;line-height:1.3;font-weight:700;color:#0E0E0E;">The Synth Setlist</div><div style="font-size:13px;line-height:1.6;color:#5D646F;">${escapeHtml(edition.issueLabel)}</div></td></tr></table></td></tr>
<tr><td class="mobile-pad" bgcolor="#CC2486" style="padding:38px 32px;background:#CC2486;font-family:${FONT};color:#FFFFFF;"><div style="font-size:13px;line-height:1.5;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Your week in live music</div><h1 class="headline" style="font-weight:700;margin:12px 0 16px;">${escapeHtml(edition.headline)}</h1><p style="font-size:18px;line-height:1.6;margin:0;">${escapeHtml(edition.intro)}</p></td></tr>
${
  edition.yourSynth
    ? card(
        "pink",
        `<div style="font-size:12px;line-height:1.5;font-weight:700;color:#951A6D;text-transform:uppercase;letter-spacing:.10em;">Your Synth</div><h2 style="font-size:24px;line-height:1.3;font-weight:700;color:#0E0E0E;margin:7px 0 0;">${escapeHtml(edition.yourSynth.headline)}</h2><p style="margin:10px 0 0;font-size:16px;line-height:1.65;color:#5D646F;">${escapeHtml(edition.yourSynth.body)}</p>${textLink("Open your timeline", "https://join.getsynth.app/")}`
      )
    : ""
}
${
  edition.showsHeading
    ? `<tr><td class="mobile-pad" style="padding:32px 32px 0;font-family:${FONT};"><h2 class="section-title" style="margin:0;color:#0E0E0E;">${escapeHtml(edition.showsHeading)}</h2><p style="margin:10px 0 0;font-size:16px;line-height:1.65;color:#5D646F;">${escapeHtml(edition.showsDek ?? "")}</p></td></tr>`
    : ""
}
${edition.shows.map((show) => card(show.caution ? "caution" : "white", showInner(show))).join("")}
${
  edition.updates.length
    ? `<tr><td class="mobile-pad" style="padding:32px 32px 0;font-family:${FONT};"><h2 class="section-title" style="margin:0;color:#0E0E0E;">This week in live music</h2></td></tr>${edition.updates
        .map((update) => card(update.tone, storyInner(update)))
        .join("")}`
    : ""
}
${edition.listen ? card(edition.listen.tone, storyInner(edition.listen)) : ""}
${
  edition.connect
    ? card(
        "yellow",
        `<div style="font-size:12px;line-height:1.5;font-weight:700;color:#951A6D;text-transform:uppercase;letter-spacing:.10em;">${escapeHtml(edition.connect.eyebrow)}</div><h2 style="font-size:24px;line-height:1.3;font-weight:700;color:#0E0E0E;margin:7px 0 0;">${escapeHtml(edition.connect.title)}</h2><p style="margin:10px 0 0;font-size:16px;line-height:1.65;color:#5D646F;">${escapeHtml(edition.connect.body)}</p>${pill(edition.connect.ctaLabel, edition.connect.ctaUrl)}`
      )
    : ""
}
<tr><td class="mobile-pad" style="padding:28px 32px 0;"><table role="presentation" width="100%" bgcolor="#0E0E0E" style="border-radius:10px;"><tr><td style="padding:26px;font-family:${FONT};color:#FFFFFF;"><div style="font-size:12px;line-height:1.5;font-weight:700;color:#FCDC5F;letter-spacing:.10em;text-transform:uppercase;">After the encore</div><h2 style="font-size:25px;line-height:1.3;margin:7px 0 0;">Find the show. Find your people.</h2><p style="font-size:16px;line-height:1.65;color:#E6E6E6;margin:10px 0 0;">Browse something new, connect with someone who gets it, and keep the memory when it’s over.</p>${pill("Open Synth", "https://join.getsynth.app/")}</td></tr></table></td></tr>
<tr><td class="mobile-pad" style="padding:32px 32px;font-family:${FONT};text-align:center;color:#5D646F;"><div style="font-size:16px;line-height:1.5;font-weight:700;color:#0E0E0E;">Discover, Connect, Share.</div><div style="font-size:14px;line-height:1.6;margin-top:6px;">Going to shows just got easier.</div><div style="font-size:13px;line-height:1.7;margin-top:16px;"><a href="https://getsynth.app/">Website</a> &nbsp;·&nbsp; <a href="https://www.instagram.com/getsynth.app/">Instagram</a></div><div style="font-size:12px;line-height:1.6;margin-top:16px;">Synth · Washington, DC<br/>Event details checked ${escapeHtml(checked)}. Availability may change.</div><div style="font-size:12px;line-height:1.6;margin-top:8px;"><a href="{{unsubscribe_url}}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a></div></td></tr>
</table></td></tr></table>
</body>
</html>`;
};
