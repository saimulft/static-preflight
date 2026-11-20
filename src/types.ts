/** Every check the engine can run, in report order. */
export const CHECK_NAMES = [
  'title',
  'description',
  'h1',
  'alt',
  'links',
  'anchors',
  'images',
  'srcset',
  'media',
  'stylesheets',
  'scripts',
  'noindex',
  'share-card',
  'icons',
  'jsonld',
  'redirects',
  'legacy-urls',
  'trailing-slash',
] as const;

/** The name of one check, for example `'share-card'`. */
export type CheckName = (typeof CHECK_NAMES)[number];

/** A page that must carry JSON-LD of a given type. */
export interface JsonLdRule {
  /** The schema.org type to require, for example `Product`. */
  type: string;
  /** URL path pattern of the pages that need it. `*` matches any characters, including `/`. Example: `/products/*`. */
  pattern: string;
}

/** Options for {@link preflight}. Every option is optional. */
export interface PreflightOptions {
  /** Checks to turn off. */
  skip?: readonly CheckName[];
  /**
   * `'expect'`: every page must carry a noindex robots tag (a site hidden before launch).
   * `'forbid'`: no page may carry one, except 404 pages (catches noindex left on at launch).
   * Default: neither, and the `noindex` check does not run.
   */
  noindex?: 'expect' | 'forbid';
  /**
   * Old URLs that must still resolve to a built page or a redirect. Either the list itself, or the path of a
   * file (relative to the working directory): a JSON array of strings, or a text file with one URL or path per
   * line (blank lines and lines starting with `#` are ignored). Only the path of each URL is used.
   */
  legacyUrls?: string | readonly string[];
  /** Pages whose path matches `pattern` must carry JSON-LD of `type`. The string form is `Type=/pattern/*`. */
  requireJsonLd?: readonly (JsonLdRule | string)[];
  /** Meta tags every page needs for its share card. Default: `og:title`, `og:description`, `og:image`, `twitter:card`. */
  shareTags?: readonly string[];
  /** `'forbid'`: internal links to pages must not end in `/`. `'require'`: they must. Default: either is fine. */
  trailingSlash?: 'forbid' | 'require';
  /** Path of a Netlify/Cloudflare-style redirects file. Default: `_redirects` inside the checked folder. `false` ignores it. */
  redirectsFile?: string | false;
  /**
   * The public origin of the site, for example `https://example.com`. Absolute URLs on this origin are checked
   * like internal ones. Share images are looked up in the folder only when they are on this origin; when it is
   * not given, a page's canonical link or og:url stands in for it, and with neither, the image's path is looked up.
   */
  siteUrl?: string;
  /** Let `/about` resolve to `about.html` and `/about/` to `about.html` too, as most static hosts do. Default: true. */
  cleanUrls?: boolean;
  /** Page URL patterns to leave out of every check. Default: 404 and `_not-found` pages and anything under `/_next/`. */
  ignore?: readonly string[];
  /** Page URL patterns to leave out of one particular check. Example: `{ h1: ['/checkout/*'] }`. */
  exclude?: Partial<Record<CheckName, readonly string[]>>;
}

/** What the CLI reads from `static-preflight.config.json`: the options, plus the folder and the output cap. */
export interface PreflightConfig extends PreflightOptions {
  /** Folder to check. Default: `out`. */
  dir?: string;
  /** Most problems the CLI prints in its text report; the rest are summarised. 0 prints all. Default: 80. */
  maxProblems?: number;
}

/** One thing that needs fixing. */
export interface Problem {
  /** The check that found it. */
  check: CheckName;
  /** The page it was found on, as a path inside the folder (`/about/index.html`). `null` for site-wide problems. */
  page: string | null;
  /** What is wrong. A problem seen on several pages is reported once, naming the first page and the count. */
  message: string;
}

/** The outcome of {@link preflight}. */
export interface PreflightResult {
  /** The folder that was checked, as given. */
  dir: string;
  /** The pages that were checked, as paths inside the folder. */
  pages: string[];
  /** HTML files that were skipped because they matched `ignore`. */
  ignored: string[];
  /** The checks that ran. */
  checks: CheckName[];
  /** How many rules the redirects file holds. */
  redirects: number;
  /** How many distinct old URLs were checked. */
  legacyUrls: number;
  /** Everything that needs fixing. Empty when the site is clean. */
  problems: Problem[];
}
