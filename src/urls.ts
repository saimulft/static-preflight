/** An internal reference, resolved to a decoded URL path (`/about/team`) plus its query and fragment. */
export interface LocalRef {
  path: string;
  search: string;
  hash: string;
}

/** What a reference is resolved against. */
export interface RefBase {
  /** URL path references are relative to: the page, or its `<base href>`. `null` when `<base>` points off-site. */
  base: string | null;
  /** The site's public origin, if known. */
  origin: string | undefined;
}

const PLACEHOLDER = 'http://static-preflight.invalid';

/** Percent-decodes a path, leaving it alone when it is malformed. */
export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Resolves a URL found in a page to a path inside the site. Returns `null` for anything that is not a file of
 * this site: other origins, `mailto:`, `tel:`, `data:`, `javascript:` and the like. With `anyHost`, an absolute
 * http(s) URL counts whatever its host (used for share images, which are always written as absolute URLs).
 */
export function localRef(value: string, from: RefBase, anyHost = false): LocalRef | null {
  const text = value.trim();
  if (!text) return null;
  try {
    let url: URL;
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//')) {
      url = new URL(text, from.origin ?? 'https://example.invalid');
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (!anyHost && url.origin !== from.origin) return null;
    } else {
      if (from.base === null && !text.startsWith('/')) return null;
      url = new URL(text, new URL(from.base ?? '/', PLACEHOLDER));
    }
    return { path: safeDecode(url.pathname), search: url.search, hash: url.hash };
  } catch {
    return null;
  }
}

/** The URL path of a legacy URL entry: a full URL or a path; query and fragment dropped. */
export function pathOf(entry: string): string {
  return safeDecode(new URL(entry.trim(), PLACEHOLDER).pathname);
}

/** The URL path a page is served at: `a/index.html` is `/a/`, `a.html` is `/a`. */
export function pageUrl(file: string): string {
  const withoutExt = file.replace(/\.html?$/i, '');
  if (withoutExt === 'index') return '/';
  return withoutExt.endsWith('/index') ? `/${withoutExt.slice(0, -'index'.length)}` : `/${withoutExt}`;
}
