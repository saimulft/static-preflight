import type { PageContext } from '../context.ts';

const NOT_FOUND_PAGE = /^\/(404|_not-found)(\/|$)/;

/** True when any robots meta tag of the page says `noindex` (or `none`, which includes it). */
function hasNoindex(ctx: PageContext): boolean {
  const contents = ['robots', 'googlebot', 'bingbot'].flatMap((name) => ctx.html.metaAll(name));
  return contents.some((content) =>
    content
      .toLowerCase()
      .split(/[\s,]+/)
      .some((token) => token === 'noindex' || token === 'none'),
  );
}

/** Title, meta description, exactly one h1, alt text on images, and the noindex expectation. */
export function checkPageSeo(ctx: PageContext): void {
  const { report, page, html } = ctx;

  if (ctx.enabled('title') && !html.title) report.add('title', page, 'no <title>');

  if (ctx.enabled('description') && !html.meta('description')) report.add('description', page, 'no meta description');

  if (ctx.enabled('h1')) {
    const count = html.tags.filter((tag) => tag.name === 'h1').length;
    if (count !== 1) report.add('h1', page, `${count} h1 elements (expected 1)`);
  }

  if (ctx.enabled('alt')) {
    for (const tag of html.tags) {
      if (tag.name === 'img' && !tag.attrs.has('alt')) {
        report.add('alt', page, `image without alt: ${tag.attrs.get('src') || '(no src)'}`);
      }
    }
  }

  if (ctx.enabled('noindex') && ctx.settings.noindex) {
    const noindex = hasNoindex(ctx);
    if (ctx.settings.noindex === 'expect' && !noindex) {
      report.add('noindex', page, 'no noindex robots tag (the site is expected to be hidden)');
    } else if (ctx.settings.noindex === 'forbid' && noindex && !NOT_FOUND_PAGE.test(page.url)) {
      report.add('noindex', page, 'has a noindex robots tag');
    }
  }
}
