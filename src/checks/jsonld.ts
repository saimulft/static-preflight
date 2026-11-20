import type { PageContext } from '../context.ts';
import { matchesAny } from '../glob.ts';
import { bareType } from '../settings.ts';

function collectTypes(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, into);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '@type') {
        for (const type of Array.isArray(value) ? value : [value])
          if (typeof type === 'string') into.add(bareType(type));
      } else {
        collectTypes(value, into);
      }
    }
  }
}

/** JSON-LD blocks parse, and pages matching a rule carry the type it requires (also inside `@graph`). */
export function checkJsonLd(ctx: PageContext): void {
  const { report, page, settings } = ctx;
  const types = new Set<string>();
  let blocks = 0;
  let invalid = 0;
  for (const script of ctx.html.scripts) {
    if (!/^application\/ld\+json\b/i.test((script.attrs.get('type') ?? '').trim())) continue;
    blocks++;
    try {
      collectTypes(JSON.parse(script.body), types);
    } catch (error) {
      invalid++;
      report.add('jsonld', page, `JSON-LD block ${blocks} is not valid JSON (${(error as Error).message})`);
    }
  }
  for (const rule of settings.jsonLdRules) {
    if (!matchesAny([rule.pattern], page.url) || types.has(rule.type)) continue;
    const note = invalid ? ` (${invalid} JSON-LD block${invalid === 1 ? '' : 's'} could not be read)` : '';
    report.add('jsonld', page, `no ${rule.type} JSON-LD${note}`);
  }
}
