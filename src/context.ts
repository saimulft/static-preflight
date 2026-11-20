import { localRef } from './urls.ts';
import type { LocalRef, RefBase } from './urls.ts';
import type { ParsedHtml } from './html.ts';
import type { PageRef, Reporter } from './reporter.ts';
import type { Settings } from './settings.ts';
import type { Site } from './site.ts';
import type { CheckName } from './types.ts';

/** State shared by every page of one run. */
export interface RunState {
  site: Site;
  settings: Settings;
  report: Reporter;
  /** Stylesheet files already scanned for `url()` references. */
  scannedCss: Set<string>;
}

/** Everything a check needs about the page it is looking at. */
export interface PageContext extends RunState {
  page: PageRef;
  html: ParsedHtml;
  /** What relative URLs on this page are resolved against. */
  from: RefBase;
  enabled(check: CheckName): boolean;
  /** Resolves a URL on this page to an internal path, or `null` if it is external or not a file URL. */
  ref(value: string, anyHost?: boolean): LocalRef | null;
  /** True when the internal path is a built page or file, or a redirect source. */
  resolves(urlPath: string): boolean;
}

/** Builds the context for one page. */
export function createPageContext(state: RunState, page: PageRef, html: ParsedHtml): PageContext {
  const origin = state.settings.origin;
  let from: RefBase = { base: page.url, origin };
  const baseHref = html.tags.find((tag) => tag.name === 'base' && tag.attrs.get('href'))?.attrs.get('href');
  if (baseHref) {
    const resolved = localRef(baseHref, from);
    from = { base: resolved ? resolved.path : null, origin };
  }
  return {
    ...state,
    page,
    html,
    from,
    enabled: (check) => state.settings.enabled.has(check),
    ref: (value, anyHost) => localRef(value, from, anyHost),
    resolves: (urlPath) => state.site.built(urlPath) || state.site.redirected(urlPath),
  };
}
