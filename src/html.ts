/** Attributes of one tag, names lower-cased, values with entities decoded. The first of a repeated attribute wins. */
export type Attrs = ReadonlyMap<string, string>;

/** One start tag. */
export interface HtmlTag {
  name: string;
  attrs: Attrs;
}

/** One `<script>` element. */
export interface ScriptBlock {
  attrs: Attrs;
  body: string;
}

/** What the checks need from a page. */
export interface ParsedHtml {
  /** Every start tag outside comments, scripts and styles, in document order. */
  tags: HtmlTag[];
  scripts: ScriptBlock[];
  /** The bodies of `<style>` elements. */
  styles: string[];
  /** The text of the first `<title>` outside inline SVG; `undefined` if missing or blank. */
  title: string | undefined;
  /** Every `id`, plus the `name` of every `<a>`: the targets of `#fragment` links. */
  ids: Set<string>;
  /** The first non-blank `content` of a `<meta name|property="…">`, name compared case-insensitively. */
  meta(name: string): string | undefined;
  /** Every non-blank `content` of `<meta name|property="…">`. */
  metaAll(name: string): string[];
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the character references that turn up in attribute values: named (`&amp;`) and numeric (`&#38;`, `&#x26;`). */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi,
    (match, dec?: string, hex?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? match;
      const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex ?? '', 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    },
  );
}

// Comments, and <script>/<style> elements with their bodies. Alternation order matters: a comment wins over a tag.
const OPAQUE =
  /<!--[\s\S]*?(?:-->|$)|<(script|style)(?![\w:-])((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)(?:<\/\1\s*>|$)/gi;
// A start tag; quoted attribute values may contain `>`.
const START_TAG = /<([a-z][a-z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(source: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = (match[1] ?? '').toLowerCase();
    if (!attrs.has(name)) attrs.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attrs;
}

/** Reads the parts of an HTML document the checks look at. Tolerant: it never throws on sloppy markup. */
export function parseHtml(html: string): ParsedHtml {
  const scripts: ScriptBlock[] = [];
  const styles: string[] = [];
  const stripped = html.replace(OPAQUE, (_match, element?: string, attrs?: string, body?: string) => {
    if (element?.toLowerCase() === 'script') scripts.push({ attrs: parseAttrs(attrs ?? ''), body: body ?? '' });
    else if (element) styles.push(body ?? '');
    return '';
  });

  const tags: HtmlTag[] = [];
  const ids = new Set<string>();
  const metas: { key: string; content: string }[] = [];
  for (const match of stripped.matchAll(START_TAG)) {
    const name = (match[1] ?? '').toLowerCase();
    const attrs = parseAttrs(match[2] ?? '');
    tags.push({ name, attrs });
    const id = attrs.get('id');
    if (id) ids.add(id);
    const anchorName = attrs.get('name');
    if (name === 'a' && anchorName) ids.add(anchorName);
    if (name === 'meta') {
      const content = attrs.get('content')?.trim();
      if (content) {
        for (const key of [attrs.get('name'), attrs.get('property')]) {
          if (key) metas.push({ key: key.trim().toLowerCase(), content });
        }
      }
    }
  }

  const withoutSvg = stripped.replace(/<svg(?![\w:-])[\s\S]*?<\/svg\s*>/gi, '');
  const titleText = /<title(?![\w:-])[^>]*>([\s\S]*?)<\/title\s*>/i.exec(withoutSvg)?.[1];
  const title = titleText === undefined ? undefined : decodeEntities(titleText).trim() || undefined;

  const metaAll = (name: string): string[] => metas.filter((m) => m.key === name.toLowerCase()).map((m) => m.content);
  return { tags, scripts, styles, title, ids, meta: (name) => metaAll(name)[0], metaAll };
}

/** The URLs in a `srcset` value, per the HTML parsing rules (a URL may contain commas; descriptors are dropped). */
export function srcsetUrls(srcset: string): string[] {
  const urls: string[] = [];
  let i = 0;
  while (i < srcset.length) {
    while (i < srcset.length && /[\s,]/.test(srcset.charAt(i))) i++;
    const start = i;
    while (i < srcset.length && !/\s/.test(srcset.charAt(i))) i++;
    let url = srcset.slice(start, i);
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      // Skip the descriptors (`640w`, `2x`) up to the comma that ends this candidate, ignoring commas in parentheses.
      let depth = 0;
      while (i < srcset.length && !(srcset.charAt(i) === ',' && depth === 0)) {
        if (srcset.charAt(i) === '(') depth++;
        else if (srcset.charAt(i) === ')') depth = Math.max(0, depth - 1);
        i++;
      }
    }
    if (url) urls.push(url);
  }
  return urls;
}

/** The URLs a stylesheet (or `style` attribute) points at: `url(...)` and `@import "..."`. */
export function cssUrls(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const urls: string[] = [];
  for (const m of clean.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']+))\s*\)/gi)) {
    urls.push(m[1] ?? m[2] ?? m[3] ?? '');
  }
  for (const m of clean.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) urls.push(m[1] ?? m[2] ?? '');
  return urls.map((url) => url.trim()).filter(Boolean);
}
