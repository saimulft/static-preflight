import type { RunState } from '../context.ts';
import type { PageRef } from '../reporter.ts';
import { safeDecode } from '../urls.ts';

import { servesRequests } from '../redirects.ts';

/** Redirect rules land on built pages and do not hide pages. */
export function checkRedirects(state: RunState, checkedPages: readonly PageRef[]): void {
  const { site, report } = state;
  for (const rule of site.redirects) {
    const to = rule.to;
    if (to.startsWith('/') && !to.startsWith('//') && !/[*]|:[A-Za-z_]/.test(to)) {
      const target = safeDecode(to.split(/[?#]/)[0] ?? '');
      if (!site.built(target))
        report.add('redirects', null, `redirect ${rule.from} goes to ${to}, which isn't a page or file`);
    }

    // A redirect that matches a page answers before the page does (Cloudflare Pages, Netlify), so the page is hidden.
    // Rewrites (200) and an extension in a fixed source (`/old.html` to `/old`) are deliberate.
    if (!servesRequests(rule) || rule.status === 200) continue;
    if (!rule.dynamic) {
      const source = safeDecode(rule.from);
      if (!/\.[a-z0-9]+$/i.test(source) && site.built(source)) {
        report.add('redirects', null, `redirect ${rule.from} hides the page ${source}`);
      }
      continue;
    }
    const hidden = checkedPages.filter((page) => rule.pattern.test(page.url));
    if (hidden.length) {
      const first = hidden[0]?.url ?? '';
      const what = hidden.length === 1 ? `the page ${first}` : `${hidden.length} pages, e.g. ${first}`;
      report.add('redirects', null, `redirect ${rule.from} hides ${what}`);
    }
  }
}

/** Every legacy URL is a built page or file, or a redirect source. */
export function checkLegacyUrls(state: RunState): void {
  for (const urlPath of state.settings.legacyUrls) {
    if (!state.site.built(urlPath) && !state.site.redirected(urlPath)) {
      state.report.add('legacy-urls', null, `old URL ${urlPath} has no page and no redirect`);
    }
  }
}
