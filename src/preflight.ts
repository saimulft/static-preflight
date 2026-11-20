import { statSync } from 'node:fs';
import path from 'node:path';
import { checkAssets } from './checks/assets.ts';
import { checkJsonLd } from './checks/jsonld.ts';
import { checkLinks } from './checks/links.ts';
import { checkPageSeo } from './checks/page-seo.ts';
import { checkIcons, checkShareCard } from './checks/share.ts';
import { checkLegacyUrls, checkRedirects } from './checks/site-level.ts';
import { createPageContext } from './context.ts';
import type { RunState } from './context.ts';
import { PreflightError } from './errors.ts';
import { matchesAny } from './glob.ts';
import { parseHtml } from './html.ts';
import { createReporter } from './reporter.ts';
import type { PageRef } from './reporter.ts';
import { resolveSettings } from './settings.ts';
import { readSite } from './site.ts';
import { CHECK_NAMES } from './types.ts';
import type { PreflightOptions, PreflightResult } from './types.ts';

/**
 * Checks a built static site and returns what needs fixing. Synchronous; throws {@link PreflightError} for bad
 * options or a missing folder, and returns problems (it does not throw) for anything wrong with the site.
 *
 * @example
 * const { pages, problems } = preflight('out', { noindex: 'forbid' });
 * if (problems.length) process.exitCode = 1;
 */
export function preflight(dir: string, options: PreflightOptions = {}): PreflightResult {
  const root = path.resolve(dir);
  let isDirectory = false;
  try {
    isDirectory = statSync(root).isDirectory();
  } catch {
    // Reported below.
  }
  if (!isDirectory) throw new PreflightError(`Folder not found: ${dir}. Run your build first.`);

  const settings = resolveSettings(options);
  const site = readSite(root, { cleanUrls: settings.cleanUrls, redirectsFile: settings.redirectsFile });
  const report = createReporter(settings.exclude);
  const state: RunState = { site, settings, report, scannedCss: new Set() };

  const checked: PageRef[] = [];
  const ignored: string[] = [];
  for (const { file, label, url } of site.pages) {
    if (matchesAny(settings.ignore, url)) {
      ignored.push(label);
      continue;
    }
    const page: PageRef = { label, url };
    checked.push(page);
    const ctx = createPageContext(state, page, parseHtml(site.read(file)));
    checkPageSeo(ctx);
    checkLinks(ctx);
    checkAssets(ctx);
    if (ctx.enabled('share-card')) checkShareCard(ctx);
    if (ctx.enabled('icons')) checkIcons(ctx);
    if (ctx.enabled('jsonld')) checkJsonLd(ctx);
  }
  if (settings.enabled.has('redirects')) checkRedirects(state, checked);
  if (settings.enabled.has('legacy-urls')) checkLegacyUrls(state);

  return {
    dir,
    pages: checked.map((page) => page.label),
    ignored,
    checks: CHECK_NAMES.filter((name) => settings.enabled.has(name)),
    redirects: site.redirects.length,
    legacyUrls: settings.legacyUrls.length,
    problems: report.finish(),
  };
}
