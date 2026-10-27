/**
 * Photo posters render as ~1MB PNGs (PNG compresses photos badly). WhatsApp
 * silently drops og:images over ~300KB, so photo posters are re-encoded as JPEG,
 * stepping quality down until they fit. Pure JS (pngjs + jpeg-js): no native
 * build, safe in Vercel functions.
 */

import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

export const WHATSAPP_MAX_BYTES = 300 * 1024;

const QUALITIES = [82, 72, 62, 50, 40];

type Raw = { width: number; height: number; data: Buffer | Uint8Array };

/** 2x box downscale (each output pixel averages a 2x2 block). */
function halve({ width, height, data }: Raw): Raw {
  const w = width >> 1;
  const h = height >> 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        const i = (y * 2 * width + x * 2) * 4 + c;
        out[(y * w + x) * 4 + c] = (data[i] + data[i + 4] + data[i + width * 4] + data[i + width * 4 + 4]) >> 2;
      }
    }
  }
  return { width: w, height: h, data: out };
}

function encodeWithin(raw: Raw, maxBytes: number): Buffer {
  let out = Buffer.alloc(0);
  for (const quality of QUALITIES) {
    out = Buffer.from(jpeg.encode(raw, quality).data);
    if (out.length <= maxBytes) break;
  }
  return out;
}

export function pngToJpeg(png: Buffer, maxBytes = WHATSAPP_MAX_BYTES): Buffer {
  const raw = PNG.sync.read(png);
  const full = encodeWithin(raw, maxBytes);
  // Last resort for very busy photos: half size (600x315) still previews fine.
  return full.length <= maxBytes ? full : encodeWithin(halve(raw), maxBytes);
}
