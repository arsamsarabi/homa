/**
 * Circle display images: store a seed (and optional uploaded data URL) in the API.
 * Generated avatars are GitHub-style 5×5 identicons built client-side as SVG data URLs —
 * no CDN and no blob storage for the default case.
 */

const FNV_OFFSET = 0x811c9dc5;

/** Stable 32-bit hash of a seed (FNV-1a). */
export function hashSeed(seed: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hex colour from the same seed so a generated avatar stays consistent with itself. */
export function identiconForeground(seed: string): string {
  const h = hashSeed(`${seed}:fg`);
  const hue = h % 360;
  const sat = 55 + (h % 25);
  const lit = 40 + ((h >>> 8) % 20);
  return `hsl(${hue} ${sat}% ${lit}%)`;
}

/** 5×5 mirrored bit pattern → SVG data URL. */
export function identiconDataUrl(seed: string): string {
  const bits = hashSeed(seed);
  const fg = identiconForeground(seed);
  const cells: string[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const bit = (bits >> (y * 3 + x)) & 1;
      if (!bit) continue;
      const mirror = 4 - x;
      cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fg}"/>`);
      if (mirror !== x) cells.push(`<rect x="${mirror}" y="${y}" width="1" height="1" fill="${fg}"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges"><rect width="5" height="5" fill="#f0eeeb"/>${cells.join('')}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Prefer an uploaded data URL; otherwise the seed identicon. */
export function circleAvatarSrc(circle: { avatarSeed: string; avatarImage: string | null }): string {
  return circle.avatarImage ?? identiconDataUrl(circle.avatarSeed);
}

const SEED_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Random seed for a new or shuffled generated avatar. */
export function randomAvatarSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => SEED_CHARS[b % SEED_CHARS.length]).join('');
}

/** Random default colour from the shared calendar swatch set. */
export function randomCircleColor(swatches: readonly string[]): string {
  return swatches[Math.floor(Math.random() * swatches.length)] ?? '#7d7fa3';
}

const MAX_AVATAR_BYTES = 350_000;

/** Read a local image as a data URL, rejecting oversized files. */
export function readImageAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('not an image'));
  if (file.size > MAX_AVATAR_BYTES) return Promise.reject(new Error('image too large'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => {
      const result = reader.result;
      if (typeof result !== 'string' || !result.startsWith('data:image/')) {
        reject(new Error('could not read image'));
        return;
      }
      if (result.length > 500_000) {
        reject(new Error('image too large'));
        return;
      }
      resolve(result);
    };
    reader.onerror = (): void => reject(new Error('could not read image'));
    reader.readAsDataURL(file);
  });
}
