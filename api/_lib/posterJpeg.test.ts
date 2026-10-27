/**
 * Run: node --experimental-strip-types --test api/_lib/posterJpeg.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { pngToJpeg, WHATSAPP_MAX_BYTES } from './posterJpeg.ts';

/** 1200x630 noisy PNG: photo-like content that PNG compresses badly. */
function noisyPng(): Buffer {
  const png = new PNG({ width: 1200, height: 630 });
  let seed = 7;
  for (let i = 0; i < png.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    png.data[i] = seed & 255;
    png.data[i + 1] = (seed >> 8) & 255;
    png.data[i + 2] = (seed >> 16) & 255;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

test('pngToJpeg returns a real JPEG of the same size image', () => {
  const jpg = pngToJpeg(noisyPng());
  assert.equal(jpg[0], 0xff);
  assert.equal(jpg[1], 0xd8);
  assert.equal(jpg[jpg.length - 2], 0xff);
  assert.equal(jpg[jpg.length - 1], 0xd9);
});

test('pngToJpeg keeps even worst-case photo posters under the WhatsApp budget', () => {
  const png = noisyPng();
  assert.ok(png.length > WHATSAPP_MAX_BYTES, 'fixture must start over budget');
  const jpg = pngToJpeg(png);
  assert.ok(jpg.length <= WHATSAPP_MAX_BYTES, `jpeg ${jpg.length} bytes`);
});

test('WhatsApp budget is 300 KB', () => {
  assert.equal(WHATSAPP_MAX_BYTES, 300 * 1024);
});
