import type { ComposedEdition, ShowCard, StoryCard } from "./types";

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
const APP_URL = "https://join.getsynth.app/";
// Shared, already-created Synth phone mockup. Host in a public, stable asset bucket
// before long-term production use; this is the user's supplied signed URL.
const PHONE_IMAGE = "https://glpiolbrafqikqhnseto.supabase.co/storage/v1/object/sign/email-pictures/upcoming_shows.png?token=eyJraWQiOiI3MzI3YjBiYy01OTVmLTQzNzUtODk3My03NTcwYzE5YzkwMDYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJlbWFpbC1waWN0dXJlcy91cGNvbWluZ19zaG93cy5wbmciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzkzMzAzMzU1LCJleHAiOjI0MjQwMjMzNTV9.fjTInIxYtL3v63u1QS8xWWoX9Vm05LRWPP8Lm1OexEI";
const escapeHtml = (value: string) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const button = (label: string, url: string, dark = false) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;margin:16px 0 0;"><tr><td bgcolor="${dark ? "#111111" : "#CC2486"}" style="border-radius:99px;"><a href="${escapeHtml(url)}" style="font-family:${FONT};display:inline-block;padding:13px 20px;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:800;line-height:1.3;">${escapeHtml(label)} &rarr;</a></td></tr></table>`;
const link = (label: string, url: string) => `<a href="${escapeHtml(url)}" style="font-family:${FONT};font-size:15px;font-weight:800;color:#CC2486;text-decoration:none;">${escapeHtml(label)} &rarr;</a>`;
const card = (background: string, html: string) => `<tr><td class="mobile-padding" style="padding:12px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${background};border:1px solid #E8E3E7;border-radius:12px;"><tr><td style="padding:23px 24px;font-family:${FONT};">${html}</td></tr></table></td></tr>`;
const eyebrow = (value: string) => `<div style="font-family:${FONT};color:#A11C70;font-size:12px;line-height:1.5;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">${escapeHtml(value)}</div>`;
const paragraph = (value: string) => `<p style="font-family:${FONT};margin:11px 0 0;font-size:16px;line-height:1.6;color:#505662;">${escapeHtml(value)}</p>`;
const heading = (value: string, size = 23) => `<h2 style="font-family:${FONT};margin:7px 0 0;font-size:${size}px;line-height:1.24;letter-spacing:-.5px;color:#161616;font-weight:800;">${escapeHtml(value)}</h2>`;
const section = (title: string, detail?: string) => `<tr><td class="mobile-padding" style="padding:28px 32px 4px;font-family:${FONT};"><h2 style="margin:0;font-size:24px;line-height:1.3;color:#171717;font-weight:800;">${escapeHtml(title)}</h2>${detail ? paragraph(detail) : ""}</td></tr>`;
const showBlock = (show: ShowCard, first: boolean) => card(first ? "#FFF6FA" : "#FFFFFF", `${eyebrow(show.eyebrow)}${heading(show.title, first ? 28 : 23)}${paragraph(show.body)}${show.availabilityNote ? `<p style="font-size:13px;line-height:1.5;color:#7B5566;margin:12px 0 0;">${escapeHtml(show.availabilityNote)}</p>` : ""}${button(show.ctaLabel, show.ctaUrl)}`);
const storyBlock = (story: StoryCard, prominence = false) => card(story.tone === "pink" ? "#FFF3F9" : story.tone === "yellow" ? "#FFF9E6" : "#FFFFFF", `${eyebrow(story.eyebrow)}${heading(story.title, prominence ? 25 : 22)}${paragraph(story.body)}<div style="padding-top:17px;">${link(story.ctaLabel, story.ctaUrl)}</div>`);

export const NEWSLETTER_WRITER_MARK = "synth-newsletter-writer-8";

export const renderEditionHtml = (edition: ComposedEdition) => `<!DOCTYPE html>
<!-- ${NEWSLETTER_WRITER_MARK} -->
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="x-apple-disable-message-reformatting" content=""/>
<title>${escapeHtml(edition.subject)}</title>
<style>
html,body {margin:0!important;padding:0!important;width:100%!important;background:#F6F4F5;}
table {border-spacing:0;border-collapse:collapse;} img {border:0;outline:none;text-decoration:none;display:block;max-width:100%;-ms-interpolation-mode:bicubic;}
a {color:#CC2486;} .container {width:680px;max-width:680px;}
@media screen and (max-width:620px) {
 .container {width:100%!important;} .mobile-padding {padding-left:20px!important;padding-right:20px!important;}
 .hero-headline {font-size:32px!important;} .spotlight-col {display:block!important;width:100%!important;}
 .phone-art {margin:15px auto 0!important;width:170px!important;max-width:60%!important;}
}
</style></head>
<body style="margin:0;padding:0;background:#F6F4F5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(edition.preheader)}</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#F6F4F5"><tr><td align="center" style="padding:20px 0;">
<table class="container" role="presentation" width="680" border="0" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:680px;width:100%;background:#FFFFFF;">
<tr><td class="mobile-padding" style="padding:23px 32px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="58" valign="middle"><img src="https://getsynth.app/Logos/Main%20logo%20black%20background.png" alt="Synth" width="48" height="48" style="width:48px;height:48px;border-radius:10px;"/></td><td valign="middle" style="font-family:${FONT};"><div style="font-weight:800;font-size:20px;color:#161616;">The Synth Setlist<span style="color:#CC2486;">.</span></div><div style="font-size:13px;line-height:1.5;color:#6D717C;margin-top:3px;">${escapeHtml(edition.issueLabel)}</div></td></tr></table></td></tr>
<tr><td bgcolor="#CC2486" class="mobile-padding" style="background:#CC2486;color:#FFFFFF;padding:36px 32px 38px;font-family:${FONT};">
<div style="font-size:12px;font-weight:800;letter-spacing:1.9px;line-height:1.4;text-transform:uppercase;">For the love of live music</div>
<h1 class="hero-headline" style="font-size:39px;line-height:1.12;letter-spacing:-1px;margin:14px 0 14px;color:#FFFFFF;font-weight:800;">${escapeHtml(edition.headline)}</h1>
<p style="font-size:17px;line-height:1.55;font-weight:500;margin:0;color:#FFFFFF;">${escapeHtml(edition.intro)}</p></td></tr>
${edition.shows.length ? `${section(edition.showsHeading || "On your radar", edition.showsDek)}${edition.shows.map((show, index) => showBlock(show, index === 0)).join("")}` : ""}
${edition.locationPrompt ? `<tr><td class="mobile-padding" style="padding:21px 32px 0;">${link(edition.locationPrompt.label, edition.locationPrompt.url)}</td></tr>` : ""}
${(edition.listens?.length || edition.listen) ? section("The listening detour", "Two tracks chosen for your taste, not another list of what you already played.") : ""}
${(edition.listens || (edition.listen ? [edition.listen] : [])).map((story, index) => storyBlock(story, index === 0)).join("")}
${edition.updates.length ? `${section("A little music news", "Only stories connected to your artists, interests, or local scene.")}${edition.updates.map((story) => storyBlock(story)).join("")}` : ""}
${(edition.features ?? []).map((story) => storyBlock(story)).join("")}
${edition.connect ? `${section("Find your people")}${storyBlock(edition.connect)}` : ""}
<tr><td class="mobile-padding" style="padding:28px 32px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#101010" style="width:100%;background:#101010;border-radius:12px;"><tr>
<td class="spotlight-col" valign="middle" width="59%" style="padding:25px 14px 26px 26px;font-family:${FONT};color:#FFFFFF;">
<div style="font-size:12px;font-weight:800;line-height:1.5;letter-spacing:1.5px;color:#FCDC5F;text-transform:uppercase;">See it on Synth</div>
<h2 style="font-size:24px;line-height:1.2;letter-spacing:-.4px;margin:8px 0 0;color:#FFFFFF;">Your next favorite show is out there.</h2>
<p style="font-size:15px;line-height:1.6;color:#E4DFE3;margin:11px 0 0;">Browse upcoming shows, see who's interested, and make a plan.</p>
${button("Explore concerts on Synth", APP_URL)}
</td><td class="spotlight-col" width="41%" valign="middle" align="center" style="padding:14px 14px 0 0;">
<a href="${escapeHtml(APP_URL)}" title="Explore shows on Synth"><img class="phone-art" src="${escapeHtml(PHONE_IMAGE)}" width="190" alt="A preview of upcoming concert listings in the Synth app" style="display:block;width:190px;height:auto;max-width:100%;margin:0 auto;"/></a>
</td></tr></table></td></tr>
<tr><td class="mobile-padding" style="padding:30px 32px 33px;text-align:center;font-family:${FONT};">
<div style="font-size:15px;font-weight:800;color:#171717;">Discover, Connect, Share.</div>
<div style="font-size:13px;line-height:1.7;margin-top:9px;color:#787B85;"><a href="https://getsynth.app/" style="color:#CC2486;">Website</a>&nbsp; · &nbsp;<a href="https://www.instagram.com/getsynth.app/" style="color:#CC2486;">Instagram</a></div>
<div style="font-size:12px;line-height:1.6;color:#868A94;margin-top:12px;">Synth · Washington, DC<br/>Sent because you subscribed to The Synth Setlist.</div>
<div style="font-size:12px;line-height:1.6;margin-top:10px;"><a href="{{unsubscribe_url}}" style="color:#777777;text-decoration:underline;">Unsubscribe</a></div>
</td></tr>
</table></td></tr></table></body></html>`;
