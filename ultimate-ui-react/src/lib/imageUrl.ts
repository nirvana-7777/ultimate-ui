/**
 * Provider image URLs often carry resize parameters, e.g.
 *   https://host/img.jpg?w=267&h=150
 *   https://ngiss.t-online.de/iss?client=ngtv&ar=keep&x=660&y=372&src=...&out=webp2
 * If such a pattern is found, the size is rewritten for what the UI needs (keeping the
 * aspect ratio). If none is found, the URL is returned untouched.
 */

/** Parameter name pairs (width, height). Matched case-insensitively. */
const SIZE_PAIRS: [string, string][] = [
  ['w', 'h'],
  ['width', 'height'],
  ['maxwidth', 'maxheight'],
  ['x', 'y'],
];

/** Width-only parameters (height is then up to the server). */
const WIDTH_ONLY = ['w', 'width', 'maxwidth'];

const MAX_WIDTH = 1920;

const isPositiveInt = (v: string | undefined): boolean => !!v && /^\d{1,5}$/.test(v) && Number(v) > 0;

/**
 * Plain "x"/"y" are far too generic to trust on their own. They only count as a size when
 * the URL also looks like an image-resizer call (ngiss style: ar=, src=, client=).
 */
function looksLikeResizer(keys: Set<string>): boolean {
  return keys.has('ar') || keys.has('src') || keys.has('client');
}

/**
 * Returns the URL scaled to `targetWidth` px (aspect ratio kept), or the original URL
 * when no scaling pattern is recognised.
 */
export function sizedImageUrl(url: string | undefined, targetWidth: number): string {
  if (!url || !/^https?:\/\//i.test(url)) return url ?? '';
  const q = url.indexOf('?');
  if (q < 0) return url;

  const hashAt = url.indexOf('#', q);
  const base = url.slice(0, q);
  const query = url.slice(q + 1, hashAt < 0 ? undefined : hashAt);
  const hash = hashAt < 0 ? '' : url.slice(hashAt);

  // Work on the raw query so existing encoding (e.g. src=http%3A%2F%2F...) stays byte-identical.
  const parts = query.split('&');
  const entries = parts.map((part) => {
    const eq = part.indexOf('=');
    return eq < 0
      ? { key: part.toLowerCase(), value: undefined as string | undefined }
      : { key: part.slice(0, eq).toLowerCase(), value: part.slice(eq + 1) };
  });
  const keys = new Set(entries.map((e) => e.key));
  const valueOf = (k: string) => entries.find((e) => e.key === k)?.value;
  const width = Math.min(Math.max(Math.round(targetWidth), 16), MAX_WIDTH);

  const set = (k: string, v: number) => {
    entries.forEach((e, i) => {
      if (e.key === k) parts[i] = `${parts[i].slice(0, parts[i].indexOf('='))}=${v}`;
    });
  };

  for (const [wk, hk] of SIZE_PAIRS) {
    const w = valueOf(wk);
    const h = valueOf(hk);
    if (!isPositiveInt(w) || !isPositiveInt(h)) continue;
    if (wk === 'x' && !looksLikeResizer(keys)) continue;
    set(wk, width);
    set(hk, Math.max(1, Math.round((width * Number(h)) / Number(w))));
    return `${base}?${parts.join('&')}${hash}`;
  }

  for (const wk of WIDTH_ONLY) {
    if (isPositiveInt(valueOf(wk))) {
      set(wk, width);
      return `${base}?${parts.join('&')}${hash}`;
    }
  }
  return url;
}
