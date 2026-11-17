// Byte-level image checks for publish-media. Reads the file's own headers;
// never trusts the declared type or file name.
//
// Accepts PNG, JPEG and WebP only. Anything else (SVG, GIF, HTML, scripts,
// executables, polyglots without a valid header) is rejected.

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_SIDE = 10000;
export const MAX_PIXELS = 40_000_000;

export type ImageKind = 'image/png' | 'image/jpeg' | 'image/webp';
export interface ImageInfo { mime: ImageKind; ext: 'png' | 'jpg' | 'webp'; width: number; height: number }

export class ImageError extends Error {}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function png(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || !sig.every((v, i) => b[i] === v)) return null;
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') throw new ImageError('PNG header is malformed');
  return { mime: 'image/png', ext: 'png', width: u32be(b, 16), height: u32be(b, 20) };
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) throw new ImageError('JPEG structure is malformed');
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }                 // fill byte
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;              // end / start of scan before a frame
    const len = u16be(b, i + 2);
    if (len < 2) throw new ImageError('JPEG segment is malformed');
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: 'image/jpeg', ext: 'jpg', width: u16be(b, i + 7), height: u16be(b, i + 5) };
    }
    i += 2 + len;
  }
  throw new ImageError('JPEG has no frame header');
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw new ImageError('WebP (VP8) header is malformed');
    return { mime: 'image/webp', ext: 'webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) throw new ImageError('WebP (VP8L) header is malformed');
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { mime: 'image/webp', ext: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { mime: 'image/webp', ext: 'webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  throw new ImageError('WebP format is not supported');
}

// Identify and check an image. Throws ImageError with a user-safe message.
export function inspectImage(bytes: Uint8Array): ImageInfo {
  if (bytes.length === 0) throw new ImageError('The file is empty');
  if (bytes.length > MAX_BYTES) throw new ImageError('Images must be at most 5 MB');
  const info = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  if (!info) throw new ImageError('Only PNG, JPEG and WebP images are accepted');
  if (info.width < 1 || info.height < 1 || info.width > MAX_SIDE || info.height > MAX_SIDE) {
    throw new ImageError(`Images must be between 1 and ${MAX_SIDE} pixels on each side`);
  }
  if (info.width * info.height > MAX_PIXELS) throw new ImageError('The image has too many pixels');
  return info;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const EXT_BY_MIME: Record<ImageKind, 'png' | 'jpg' | 'webp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
