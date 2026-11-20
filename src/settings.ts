import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PreflightError } from './errors.ts';
import { globToRegExp } from './glob.ts';
import { pathOf } from './urls.ts';
import { CHECK_NAMES } from './types.ts';
import type { CheckName, JsonLdRule, PreflightOptions } from './types.ts';

export const DEFAULT_IGNORE = ['/404', '/_not-found*', '/_next/*'] as const;
export const DEFAULT_SHARE_TAGS = ['og:title', 'og:description', 'og:image', 'twitter:card'] as const;

/** Checks that only run when something tells them what to look for. */
const OPT_IN: readonly CheckName[] = ['noindex', 'legacy-urls', 'trailing-slash'];

/** {@link PreflightOptions}, validated and compiled. */
export interface Settings {
  enabled: ReadonlySet<CheckName>;
  noindex: 'expect' | 'forbid' | undefined;
  legacyUrls: string[];
  jsonLdRules: { type: string; pattern: RegExp }[];
  shareTags: string[];
  trailingSlash: 'forbid' | 'require' | undefined;
  redirectsFile: string | false | undefined;
  origin: string | undefined;
  cleanUrls: boolean;
  ignore: RegExp[];
  exclude: Partial<Record<CheckName, RegExp[]>>;
}

/** `Product=/products/*` to `{ type: 'Product', pattern: '/products/*' }`. Throws on a malformed rule. */
export function parseJsonLdRule(rule: JsonLdRule | string): JsonLdRule {
  const parsed =
    typeof rule === 'string'
      ? { type: rule.slice(0, Math.max(rule.indexOf('='), 0)), pattern: rule.slice(rule.indexOf('=') + 1) }
      : rule;
  const type = parsed.type.trim();
  const pattern = parsed.pattern.trim();
  if (!/^[A-Za-z][\w:.-]*$/.test(type) || !pattern.startsWith('/')) {
    const shown = typeof rule === 'string' ? rule : `${rule.type}=${rule.pattern}`;
    throw new PreflightError(
      `Invalid JSON-LD rule "${shown}". Use Type=/path/pattern/*, for example Product=/products/*.`,
    );
  }
  return { type, pattern };
}

/** A JSON-LD type with any prefix removed: `https://schema.org/Product` and `schema:Product` are `Product`. */
export function bareType(type: string): string {
  return type.split(/[/#:]/).pop() ?? type;
}

function parseLegacyList(text: string, source: string): string[] {
  const body = text.trim();
  if (body.startsWith('[')) {
    let list: unknown;
    try {
      list = JSON.parse(body);
    } catch {
      throw new PreflightError(`${source} is not valid JSON.`);
    }
    if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) {
      throw new PreflightError(`${source} must be a JSON array of strings.`);
    }
    return list;
  }
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function compileGlobs(patterns: readonly string[]): RegExp[] {
  return patterns.map(globToRegExp);
}

/** Validates the options and compiles patterns. Reads the legacy URL file. Throws {@link PreflightError}. */
export function resolveSettings(options: PreflightOptions): Settings {
  const unknown = (options.skip ?? []).filter((name) => !CHECK_NAMES.includes(name));
  if (unknown.length) {
    throw new PreflightError(`Unknown check: ${unknown.join(', ')}. Checks: ${CHECK_NAMES.join(', ')}.`);
  }
  if (options.noindex !== undefined && options.noindex !== 'expect' && options.noindex !== 'forbid') {
    throw new PreflightError(`noindex must be "expect" or "forbid", not "${String(options.noindex)}".`);
  }
  if (
    options.trailingSlash !== undefined &&
    options.trailingSlash !== 'forbid' &&
    options.trailingSlash !== 'require'
  ) {
    throw new PreflightError(`trailingSlash must be "forbid" or "require", not "${String(options.trailingSlash)}".`);
  }

  let origin: string | undefined;
  if (options.siteUrl !== undefined) {
    try {
      origin = new URL(options.siteUrl).origin;
    } catch {
      throw new PreflightError(`siteUrl is not a URL: ${options.siteUrl}`);
    }
  }

  let legacy: string[] = [];
  if (typeof options.legacyUrls === 'string') {
    const file = path.resolve(options.legacyUrls);
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      throw new PreflightError(`Cannot read the legacy URL list: ${options.legacyUrls}`);
    }
    legacy = parseLegacyList(text, options.legacyUrls);
  } else if (options.legacyUrls) {
    legacy = [...options.legacyUrls];
  }
  legacy = [...new Set(legacy.map(pathOf))];

  const skip = new Set(options.skip ?? []);
  const requested: Record<string, boolean> = {
    noindex: options.noindex !== undefined,
    'legacy-urls': options.legacyUrls !== undefined,
    'trailing-slash': options.trailingSlash !== undefined,
  };
  const enabled = new Set(CHECK_NAMES.filter((name) => !skip.has(name) && (!OPT_IN.includes(name) || requested[name])));

  const exclude: Partial<Record<CheckName, RegExp[]>> = {};
  for (const [name, patterns] of Object.entries(options.exclude ?? {})) {
    if (!CHECK_NAMES.includes(name as CheckName)) {
      throw new PreflightError(`Unknown check in exclude: ${name}. Checks: ${CHECK_NAMES.join(', ')}.`);
    }
    exclude[name as CheckName] = compileGlobs(patterns ?? []);
  }

  return {
    enabled,
    noindex: options.noindex,
    legacyUrls: legacy,
    jsonLdRules: (options.requireJsonLd ?? []).map(parseJsonLdRule).map((rule) => ({
      type: bareType(rule.type),
      pattern: globToRegExp(rule.pattern),
    })),
    shareTags: (options.shareTags ?? DEFAULT_SHARE_TAGS).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    trailingSlash: options.trailingSlash,
    redirectsFile: options.redirectsFile,
    origin,
    cleanUrls: options.cleanUrls ?? true,
    ignore: compileGlobs(options.ignore ?? DEFAULT_IGNORE),
    exclude,
  };
}
