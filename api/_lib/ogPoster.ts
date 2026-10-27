/**
 * 1200x630 branded poster for share link previews (iMessage, WhatsApp, Discord...).
 * Served at /api/og, which vercel.json rewrites to /api/share?og=1: the Hobby plan
 * caps a deployment at 12 functions, so this rides inside api/share.ts.
 *
 *   /api/og?event=<uuid>   artist photo + artist, date · venue
 *   /api/og?review=<uuid>  same base + stars, quote, reviewer
 *   /api/og                default Synth poster (also public/og-default.png)
 *
 * Bad or unknown ids, or any render error, return the default poster with 200.
 */

import { ImageResponse } from '@vercel/og';
import { createElement as h, type ReactNode } from 'react';
import {
  getShareSupabase,
  isValidShareUuid,
  fetchShareEvent,
  fetchShareReview,
  loadImageAsDataUrl,
  posterCacheControl,
  type ShareEvent,
} from './shareData.js';
import { formatShowDate, truncateQuote } from './shareCopy.js';
import { pngToJpeg } from './posterJpeg.js';

const W = 1200;
const H = 630;
const INK = '#0E0E0E';
const PAPER = '#FFFDFA';
const PINK = '#CC2486';
const STAR = '#FCDC5F';

type Fonts = { name: string; data: ArrayBuffer; weight: 500 | 800; style: 'normal' }[];
let fontsPromise: Promise<Fonts> | null = null;

/** Inter from Google Fonts (CSS API serves TTF to a UA-less fetch); empty on failure → built-in font. */
function loadFonts(): Promise<Fonts> {
  fontsPromise ??= Promise.all(
    ([500, 800] as const).map(async (weight) => {
      const signal = AbortSignal.timeout(2000);
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`, { signal })).text();
      const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
      if (!url) throw new Error('font url not found');
      return { name: 'Inter', data: await (await fetch(url, { signal })).arrayBuffer(), weight, style: 'normal' as const };
    })
  ).catch(() => []);
  return fontsPromise;
}

const div = (style: Record<string, unknown>, ...children: ReactNode[]) =>
  h('div', { style: { display: 'flex', ...style } }, ...children);

const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: W - 128 };

function wordmark() {
  return div(
    { position: 'absolute', right: 56, top: 44, alignItems: 'center', gap: 8 },
    div({ fontSize: 34, fontWeight: 800, color: PAPER, letterSpacing: -1 }, 'synth'),
    div({ width: 10, height: 10, borderRadius: 999, background: PINK, marginTop: 14 })
  );
}

function base(photo: string, ...content: ReactNode[]) {
  return div(
    {
      width: W,
      height: H,
      position: 'relative',
      background: INK,
      backgroundImage: `radial-gradient(circle at 100% 0%, rgba(204,36,134,0.35), transparent 55%)`,
      fontFamily: 'Inter',
      color: PAPER,
    },
    photo ? h('img', { src: photo, width: W, height: H, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } }) : null,
    photo
      ? div({
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: H,
          // Top band keeps the wordmark readable; bottom band carries the text.
          backgroundImage:
            'linear-gradient(to top, rgba(14,14,14,0.96) 0%, rgba(14,14,14,0.75) 35%, rgba(14,14,14,0.1) 70%, rgba(14,14,14,0.45) 100%)',
        })
      : null,
    div({ position: 'absolute', left: 64, right: 64, bottom: 56, flexDirection: 'column', gap: 12 }, ...content),
    wordmark()
  );
}

/** 5 SVG stars (full / half / empty); glyph stars aren't in the built-in font. */
function stars(rating: number) {
  const s = Math.round(Math.min(5, Math.max(0, rating)) * 2) / 2;
  const path = 'M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01z';
  return div(
    { gap: 6 },
    ...[1, 2, 3, 4, 5].map((i) => {
      const fill = s >= i ? 1 : s >= i - 0.5 ? 0.5 : 0;
      return h(
        'svg',
        { key: i, width: 44, height: 44, viewBox: '0 0 24 24' },
        h('defs', null, h('linearGradient', { id: `g${i}` },
          h('stop', { offset: fill, stopColor: STAR }),
          h('stop', { offset: fill, stopColor: 'rgba(255,253,250,0.25)' }))),
        h('path', { d: path, fill: `url(#g${i})` })
      );
    })
  );
}

export function eventPoster(e: ShareEvent) {
  const line = [formatShowDate(e.date), e.venue].filter(Boolean).join(' · ');
  return base(
    e.image,
    div({ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, ...oneLine }, e.artist || e.title || 'Live music'),
    line ? div({ fontSize: 34, fontWeight: 500, opacity: 0.85, ...oneLine }, line) : null
  );
}

export function reviewPoster(r: { rating: number | null; text: string; reviewer: string; event: ShareEvent | null }) {
  const e = r.event;
  const quote = truncateQuote(r.text, 90);
  return base(
    e?.image ?? '',
    r.rating ? stars(r.rating) : null,
    div({ fontSize: 64, fontWeight: 800, letterSpacing: -2, ...oneLine }, e?.artist || e?.title || 'Concert review'),
    quote ? div({ fontSize: 32, fontWeight: 500, fontStyle: 'italic', ...oneLine }, `“${quote}”`) : null,
    div({ fontSize: 28, fontWeight: 500, opacity: 0.8, ...oneLine }, [`by ${r.reviewer}`, e?.venue].filter(Boolean).join(' · '))
  );
}

function defaultPoster() {
  return div(
    {
      width: W,
      height: H,
      background: INK,
      backgroundImage: `radial-gradient(circle at 100% 0%, rgba(204,36,134,0.35), transparent 55%)`,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter',
      color: PAPER,
      gap: 12,
    },
    div({ alignItems: 'center', gap: 14 },
      div({ fontSize: 120, fontWeight: 800, letterSpacing: -4 }, 'synth'),
      div({ width: 26, height: 26, borderRadius: 999, background: PINK, marginTop: 50 })),
    div({ fontSize: 36, fontWeight: 500, opacity: 0.85 }, 'Find shows. Go with friends.')
  );
}

/** Photo posters go out as JPEG (WhatsApp drops images over ~300KB); text-only stays crisp PNG. */
export async function render(node: ReactNode, isFallback = false, asJpeg = false): Promise<Response> {
  const fonts = await loadFonts();
  const img = new ImageResponse(node as any, { width: W, height: H, fonts: fonts.length ? fonts : undefined });
  // Render fully here so a bad photo URL throws inside our try, not mid-stream.
  const png = Buffer.from(await img.arrayBuffer());
  const body = asJpeg ? pngToJpeg(png) : png;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': asJpeg ? 'image/jpeg' : 'image/png', 'Cache-Control': posterCacheControl(isFallback) },
  });
}

export async function ogPosterResponse(params: { event?: string; review?: string }): Promise<Response> {
  const event = params.event?.trim();
  const review = params.review?.trim();
  try {
    const sb = getShareSupabase();
    // Photos are prefetched with a timeout ('' on failure) so a slow host
    // can't hang the function; a render failure still retries without it.
    if (sb && isValidShareUuid(event)) {
      const e = await fetchShareEvent(sb, event);
      if (e) {
        const withPhoto = { ...e, image: await loadImageAsDataUrl(e.image) };
        return await render(eventPoster(withPhoto), false, Boolean(withPhoto.image)).catch(() =>
          render(eventPoster({ ...e, image: '' }))
        );
      }
    } else if (sb && isValidShareUuid(review)) {
      const r = await fetchShareReview(sb, review);
      if (r) {
        const photo = r.event ? await loadImageAsDataUrl(r.event.image) : '';
        const withPhoto = { ...r, event: r.event && { ...r.event, image: photo } };
        const noPhoto = { ...r, event: r.event && { ...r.event, image: '' } };
        return await render(reviewPoster(withPhoto), false, Boolean(photo)).catch(() => render(reviewPoster(noPhoto)));
      }
    }
  } catch (err) {
    console.error('[og] render failed, serving default', err);
  }
  return render(defaultPoster(), true);
}
