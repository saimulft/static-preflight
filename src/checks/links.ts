import type { PageContext } from '../context.ts';
import { safeDecode } from '../urls.ts';
import type { LocalRef } from '../urls.ts';

// Links the stylesheet and icon checks already cover.
const OTHER_CHECKS = /^(stylesheet|icon|shortcut|apple-touch-icon(-precomposed)?)$/;

function relTokens(rel: string | undefined): string[] {
  return (rel ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

/** How a link is shown in a report: as written when root-relative, otherwise with where it resolves to. */
function describe(value: string, ref: LocalRef): string {
  return value.startsWith('/') ? value : `${value} (resolves to ${ref.path})`;
}

/** Internal links resolve, in-page anchors exist, and trailing slashes follow the site's convention. */
export function checkLinks(ctx: PageContext): void {
  const { report, page, html } = ctx;
  const wantLinks = ctx.enabled('links');
  const wantAnchors = ctx.enabled('anchors');
  const slashRule = ctx.enabled('trailing-slash') ? ctx.settings.trailingSlash : undefined;
  if (!wantLinks && !wantAnchors && !slashRule) return;

  for (const tag of html.tags) {
    const isAnchor = tag.name === 'a' || tag.name === 'area';
    const isOtherLink =
      tag.name === 'link' && !relTokens(tag.attrs.get('rel')).some((token) => OTHER_CHECKS.test(token));
    if (!isAnchor && !isOtherLink) continue;
    const href = tag.attrs.get('href')?.trim();
    if (!href) continue;

    if (href.startsWith('#')) {
      if (!wantAnchors || !isAnchor) continue;
      const fragment = href.slice(1);
      const decoded = safeDecode(fragment);
      // `#` and `#top` always work: they scroll to the top of the page.
      if (!fragment || decoded.toLowerCase() === 'top' || html.ids.has(fragment) || html.ids.has(decoded)) continue;
      report.add('anchors', page, `anchor ${href} has no target`);
      continue;
    }

    const ref = ctx.ref(href);
    if (!ref) continue;
    const shown = describe(href, ref);
    if (wantLinks && !ctx.resolves(ref.path)) report.group('links', page, `broken link ${shown}`);

    if (slashRule && isAnchor && ref.path !== '/' && !/\.[a-z0-9]+$/i.test(ref.path)) {
      const slashed = ref.path.endsWith('/');
      if (slashRule === 'forbid' && slashed)
        report.group('trailing-slash', page, `link with a trailing slash: ${shown}`);
      if (slashRule === 'require' && !slashed)
        report.group('trailing-slash', page, `link without a trailing slash: ${shown}`);
    }
  }
}
