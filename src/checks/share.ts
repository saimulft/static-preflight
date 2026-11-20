import type { PageContext } from '../context.ts';
import { localRef } from '../urls.ts';

const SHARE_IMAGE_TYPE = /\.(jpe?g|png)$/i;

/** The site's origin: the `siteUrl` option, else the page's canonical link, else its og:url. */
function originOf(ctx: PageContext): string | undefined {
  if (ctx.settings.origin) return ctx.settings.origin;
  const canonical = ctx.html.tags.find(
    (tag) => tag.name === 'link' && /\bcanonical\b/i.test(tag.attrs.get('rel') ?? ''),
  );
  for (const candidate of [canonical?.attrs.get('href'), ctx.html.meta('og:url')]) {
    try {
      if (candidate) return new URL(candidate).origin;
    } catch {
      // Not an absolute URL: try the next one.
    }
  }
  return undefined;
}

/** The share card: required meta tags, and an og:image that is a JPG or PNG and exists. */
export function checkShareCard(ctx: PageContext): void {
  const { report, page, html, settings } = ctx;
  for (const tag of settings.shareTags) {
    if (!html.meta(tag)) report.add('share-card', page, `no ${tag}`);
  }

  // Share images are written as absolute URLs. An image on another origin than the site (a CDN) is not in the
  // folder; when the origin is not known at all, the path is looked up as is.
  const from = { ...ctx.from, origin: originOf(ctx) };
  const lookUp = (value: string) => (from.origin ? localRef(value, from) : localRef(value, from, true));

  const image = html.meta('og:image');
  if (image) {
    const anyPath = localRef(image, from, true);
    const local = lookUp(image);
    if (!anyPath) {
      report.add('share-card', page, `share image is not an http(s) URL: ${image}`);
    } else if (!SHARE_IMAGE_TYPE.test(anyPath.path)) {
      report.add('share-card', page, `share image isn't a JPG or PNG: ${anyPath.path}`);
    } else if (local && !ctx.resolves(local.path)) {
      report.add('share-card', page, `share image missing: ${local.path}`);
    }
  }

  const twitterImage = html.meta('twitter:image');
  const twitterRef = twitterImage && twitterImage !== image ? lookUp(twitterImage) : null;
  if (twitterRef && !ctx.resolves(twitterRef.path))
    report.add('share-card', page, `twitter:image missing: ${twitterRef.path}`);
}

const ICONS = [
  { kind: 'icon', matches: (token: string) => token === 'icon', fallback: ['favicon.ico'] },
  {
    kind: 'apple-touch-icon',
    matches: (token: string) => token === 'apple-touch-icon' || token === 'apple-touch-icon-precomposed',
    // Safari looks for these when the page names none.
    fallback: ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png'],
  },
] as const;

/** The favicon and the apple-touch-icon are linked (or sit at the default path) and the files exist. */
export function checkIcons(ctx: PageContext): void {
  const { report, page, html, site } = ctx;
  for (const { kind, matches, fallback } of ICONS) {
    const hrefs = html.tags
      .filter((tag) => tag.name === 'link' && (tag.attrs.get('rel') ?? '').toLowerCase().split(/\s+/).some(matches))
      .map((tag) => tag.attrs.get('href')?.trim())
      .filter((href): href is string => Boolean(href));

    if (hrefs.length === 0) {
      if (!fallback.some((file) => site.hasFile(file)))
        report.group('icons', page, `${kind} missing: no <link rel="${kind}">`);
      continue;
    }
    for (const href of hrefs) {
      const ref = ctx.ref(href);
      if (ref && !ctx.resolves(ref.path)) report.group('icons', page, `${kind} missing: ${href}`);
    }
  }
}
