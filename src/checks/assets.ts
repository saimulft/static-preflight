import type { PageContext } from '../context.ts';
import { cssUrls, srcsetUrls } from '../html.ts';
import type { Attrs } from '../html.ts';
import type { PageRef } from '../reporter.ts';
import type { CheckName } from '../types.ts';
import { localRef } from '../urls.ts';
import type { RefBase } from '../urls.ts';

function relTokens(attrs: Attrs): string[] {
  return (attrs.get('rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

/** Reports `value` if it is an internal URL that does not resolve. */
function verify(
  ctx: PageContext,
  check: CheckName,
  what: string,
  value: string | undefined,
  page: PageRef = ctx.page,
): void {
  if (!value || !ctx.enabled(check)) return;
  const ref = ctx.ref(value);
  if (ref && !ctx.resolves(ref.path)) ctx.report.group(check, page, `missing ${what}: ${value}`);
}

/** Checks the URLs written in CSS: `from` is what they resolve against (the page, or the stylesheet file). */
function verifyCss(ctx: PageContext, css: string, from: RefBase, page: PageRef): void {
  for (const url of cssUrls(css)) {
    if (url.startsWith('#')) continue;
    const ref = localRef(url, from);
    if (ref && !ctx.resolves(ref.path)) ctx.report.group('stylesheets', page, `missing file in url(): ${url}`);
  }
}

/** Reads a linked stylesheet once per run and checks the files it refers to. */
function scanStylesheet(ctx: PageContext, urlPath: string): void {
  const file = urlPath.replace(/^\/+/, '');
  if (ctx.scannedCss.has(file) || !ctx.site.hasFile(file)) return;
  ctx.scannedCss.add(file);
  const sheet: PageRef = { label: `/${file}`, url: `/${file}` };
  const from: RefBase = { base: `/${file}`, origin: ctx.settings.origin };
  const css = ctx.site.read(file);
  verifyCss(ctx, css, from, sheet);
  // Follow `@import` of local stylesheets.
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) {
    const ref = localRef(match[1] ?? '', from);
    if (ref) scanStylesheet(ctx, ref.path);
  }
}

/** Images, srcset entries, media files, stylesheets (and the files they use) and scripts all resolve. */
export function checkAssets(ctx: PageContext): void {
  for (const { name, attrs } of ctx.html.tags) {
    switch (name) {
      case 'img':
        verify(ctx, 'images', 'image', attrs.get('src'));
        break;
      case 'input':
        if (attrs.get('type')?.toLowerCase() === 'image') verify(ctx, 'images', 'image', attrs.get('src'));
        break;
      case 'video':
        verify(ctx, 'images', 'poster image', attrs.get('poster'));
        verify(ctx, 'media', 'media file', attrs.get('src'));
        break;
      case 'audio':
      case 'source':
      case 'track':
      case 'embed':
      case 'iframe':
        verify(ctx, 'media', 'media file', attrs.get('src'));
        break;
      case 'object':
        verify(ctx, 'media', 'media file', attrs.get('data'));
        break;
      case 'link':
        if (relTokens(attrs).includes('stylesheet')) {
          const href = attrs.get('href');
          verify(ctx, 'stylesheets', 'stylesheet', href);
          const ref = href ? ctx.ref(href) : null;
          if (ref && ctx.enabled('stylesheets')) scanStylesheet(ctx, ref.path);
        }
        break;
    }
    if ((name === 'img' || name === 'source') && ctx.enabled('srcset')) {
      for (const url of srcsetUrls(attrs.get('srcset') ?? '')) verify(ctx, 'srcset', 'srcset image', url);
    }
    if (ctx.enabled('stylesheets')) {
      const style = attrs.get('style');
      if (style) verifyCss(ctx, style, ctx.from, ctx.page);
    }
  }
  if (ctx.enabled('stylesheets')) for (const css of ctx.html.styles) verifyCss(ctx, css, ctx.from, ctx.page);
  for (const script of ctx.html.scripts) verify(ctx, 'scripts', 'script', script.attrs.get('src'));
}
