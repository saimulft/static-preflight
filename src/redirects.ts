/** One rule of a Netlify/Cloudflare-style `_redirects` file. */
export interface RedirectRule {
  from: string;
  to: string;
  status: number;
  /** True when the source has a splat (`*`) or a placeholder (`:slug`). */
  dynamic: boolean;
  /** Matches a URL path against the source. */
  pattern: RegExp;
}

const TOKEN = /(\*|:[A-Za-z_]\w*)/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reads the rules that apply to paths on this site. Skips comments, blank lines and sources that are not paths.
 * A rule matches with or without a trailing slash; `*` matches anything, `:name` matches one path segment.
 */
export function parseRedirects(text: string): RedirectRule[] {
  const rules: RedirectRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const tokens = trimmed.split(/\s+/);
    const from = tokens[0] ?? '';
    if (!from.startsWith('/')) continue;
    const rest = tokens.slice(1).filter((token) => !/^[^/\s]+=/.test(token));
    const to = rest[0];
    if (!to) continue;
    const status = /^(\d{3})!?$/.exec(rest[1] ?? '')?.[1];
    const source = from.length > 1 && from.endsWith('/') ? from.slice(0, -1) : from;
    const parts = source.split(TOKEN);
    const body = parts.map((part, i) => (i % 2 === 0 ? escapeRegExp(part) : part === '*' ? '.*' : '[^/]+')).join('');
    rules.push({
      from,
      to,
      status: status ? Number(status) : 301,
      dynamic: parts.length > 1,
      pattern: new RegExp(`^${body}/?$`),
    });
  }
  return rules;
}

/** True when the rule answers the request with a page or a redirect (not an explicit 404 or 410). */
export function servesRequests(rule: RedirectRule): boolean {
  return rule.status === 200 || (rule.status >= 300 && rule.status < 400);
}
