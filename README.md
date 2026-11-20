# static-preflight

Preflight checks for a static site build, before you deploy it.

[![npm version](https://img.shields.io/npm/v/static-preflight)](https://www.npmjs.com/package/static-preflight)
[![license](https://img.shields.io/npm/l/static-preflight)](https://www.npmjs.com/package/static-preflight)
[![node version](https://img.shields.io/node/v/static-preflight)](https://www.npmjs.com/package/static-preflight)

It started as the pre-launch check run on every static site [DeveloperLook](https://developerlook.com) ships.

static-preflight reads the HTML your build wrote (Next.js with `output: 'export'`, Astro, Eleventy, Hugo, or anything else that writes HTML files) and fails the build when a launch would go wrong: a page without a title or description, a broken internal link or image, a share card pointing at a missing file, an old URL that no longer lands anywhere. Link checkers such as linkinator look at links only, and html-validate looks at markup; neither knows about SEO basics, share cards, icons, JSON-LD or `_redirects`. This one does, in a single zero-dependency pass over a folder.

## Install

```sh
npm install -D static-preflight
```

Run it after the build, for example from `package.json`:

```json
{
  "scripts": {
    "build": "next build",
    "postbuild": "static-preflight out"
  }
}
```

Or without installing:

```sh
npx static-preflight out
```

It needs Node 20 or later and has no runtime dependencies.

## CLI

```
static-preflight [dir] [--expect-noindex | --forbid-noindex] [--legacy-urls file]
                 [--require-jsonld Type=/pattern/*] [--skip check,check] [--json]
```

`dir` defaults to `out`. The exit code is `0` when the site is clean, `1` when there are problems and `2` for a usage error (a bad flag, a missing folder, an unreadable file).

A launch check for a site that is replacing an old one, with product pages that need structured data:

```sh
static-preflight out --forbid-noindex --legacy-urls old-urls.txt --require-jsonld 'Product=/products/*'
```

```
description (1)
  /contact/index.html: no meta description

alt (1)
  /menu/index.html: image without alt: /img/loaf.jpg

links (1)
  /contact/index.html: broken link /old-contact

anchors (1)
  /menu/index.html: anchor #pastries has no target

srcset (1)
  /products/sourdough/index.html: missing srcset image: /img/loaf@2x.jpg

stylesheets (1)
  /assets/site.css: missing file in url(): /img/bg.png

noindex (1)
  /contact/index.html: has a noindex robots tag

share-card (4)
  /contact/index.html: no og:title
  /contact/index.html: no og:description
  /contact/index.html: no og:image
  /contact/index.html: no twitter:card

jsonld (1)
  /products/sourdough/index.html: no Product JSON-LD

redirects (1)
  redirect /menu hides the page /menu

legacy-urls (2)
  old URL /product/rye-bread/ has no page and no redirect
  old URL /about-us/ has no page and no redirect

15 problems found. Checked 5 pages and 3 old URLs.
```

When nothing is wrong it prints `No problems found. Checked 5 pages.`

A problem that repeats across pages (a broken nav link, a missing logo) is listed once: `broken link /old (on 12 pages, e.g. /about/index.html)`. The list stops after 80 problems with `…and N more.`

| Flag                        | Meaning                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `--expect-noindex`          | Every page must carry a noindex robots tag. For a site hidden before launch.                         |
| `--forbid-noindex`          | No page may carry one, except 404 pages. Catches noindex left on at launch.                          |
| `--legacy-urls <file>`      | Old URLs that must still land somewhere: a JSON array, or a text file with one URL or path per line. |
| `--require-jsonld <T=/p/*>` | Pages matching the path pattern must carry JSON-LD of type `T`. Repeatable.                          |
| `--skip <check,check>`      | Turn checks off. Repeatable.                                                                         |
| `--ignore <pattern>`        | Leave pages matching a URL path pattern out of every check. Repeatable.                              |
| `--exclude <check=pattern>` | Leave pages matching the pattern out of one check. Repeatable.                                       |
| `--share-tags <tag,tag>`    | Meta tags the share card needs. Default `og:title,og:description,og:image,twitter:card`.             |
| `--trailing-slash <rule>`   | `forbid` or `require` a trailing slash on links to pages. Default: either.                           |
| `--redirects <file>`        | Redirects file. Default `_redirects` inside `dir`.                                                   |
| `--site-url <url>`          | The site's public origin. Absolute URLs on it are checked like internal ones.                        |
| `--no-clean-urls`           | Do not let `/about` resolve to `about.html`.                                                         |
| `--max-problems <n>`        | Print at most `n` problems. Default 80, `0` prints all.                                              |
| `--config <file>`           | Config file. Default `static-preflight.config.json` in the working directory.                        |
| `--json`                    | Print the result as JSON instead of text.                                                            |

Patterns match the URL path of a page (`/about/`, `/blog/post`), where `*` matches any characters including `/`, and a trailing slash is ignored. `/blog/*` matches the pages under `/blog/` but not `/blog` itself; use `/blog*` for both.

### Config file

Put a `static-preflight.config.json` in the working directory to keep the options with the project. Flags win over the file.

```json
{
  "dir": "out",
  "noindex": "forbid",
  "legacyUrls": "scripts/old-urls.json",
  "requireJsonLd": ["Product=/products/*", { "type": "Article", "pattern": "/blog/*" }],
  "skip": ["media"],
  "exclude": { "h1": ["/checkout*"] },
  "maxProblems": 80
}
```

The keys are the API options below, plus `dir` and `maxProblems`. Unknown keys are an error.

## API

```ts
import { preflight } from 'static-preflight';

const { pages, problems } = preflight('out', {
  noindex: 'forbid',
  requireJsonLd: [{ type: 'Product', pattern: '/products/*' }],
});

for (const { check, page, message } of problems) console.log(`${check} ${page ?? ''} ${message}`);
if (problems.length) process.exitCode = 1;
```

`preflight(dir, options?)` is synchronous. It returns problems rather than throwing; it throws `PreflightError` only for bad options, a missing folder or an unreadable input file.

| Export                    | What it is                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `preflight(dir, options)` | Runs the checks on a built folder and returns a `PreflightResult`.                              |
| `loadConfig(cwd?, file?)` | Reads and validates `static-preflight.config.json`; `undefined` if absent.                      |
| `PreflightError`          | Thrown for usage errors, as opposed to problems found in the site.                              |
| `CHECK_NAMES`             | The names of all checks.                                                                        |
| types                     | `PreflightOptions`, `PreflightResult`, `Problem`, `CheckName`, `JsonLdRule`, `PreflightConfig`. |

### Options

| Option          | Type                                   | Default                                                  | Meaning                                                                                    |
| --------------- | -------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `skip`          | `CheckName[]`                          | none                                                     | Checks to turn off.                                                                        |
| `noindex`       | `'expect' \| 'forbid'`                 | neither                                                  | Require or forbid a noindex robots tag on every page (404 pages are exempt from `forbid`). |
| `legacyUrls`    | `string \| string[]`                   | none                                                     | Old URLs that must land on a page or a redirect: a file path, or the list itself.          |
| `requireJsonLd` | `(JsonLdRule \| string)[]`             | none                                                     | `{ type, pattern }` or `'Type=/pattern/*'`.                                                |
| `shareTags`     | `string[]`                             | `og:title`, `og:description`, `og:image`, `twitter:card` | Meta tags every page needs.                                                                |
| `trailingSlash` | `'forbid' \| 'require'`                | either                                                   | Convention for links to pages.                                                             |
| `redirectsFile` | `string \| false`                      | `<dir>/_redirects`                                       | Redirects file; `false` ignores it.                                                        |
| `siteUrl`       | `string`                               | from each page's canonical link                          | Public origin of the site.                                                                 |
| `cleanUrls`     | `boolean`                              | `true`                                                   | Let `/about` and `/about/` resolve to `about.html`.                                        |
| `ignore`        | `string[]`                             | `/404`, `/_not-found*`, `/_next/*`                       | Page URL patterns left out of every check.                                                 |
| `exclude`       | `Partial<Record<CheckName, string[]>>` | none                                                     | Page URL patterns left out of one check.                                                   |

### Result

| Field        | Type          | Meaning                                                                                |
| ------------ | ------------- | -------------------------------------------------------------------------------------- |
| `dir`        | `string`      | The folder, as given.                                                                  |
| `pages`      | `string[]`    | The pages checked, as paths inside the folder (`/about/index.html`).                   |
| `ignored`    | `string[]`    | HTML files skipped by `ignore`.                                                        |
| `checks`     | `CheckName[]` | The checks that ran.                                                                   |
| `redirects`  | `number`      | Rules in the redirects file.                                                           |
| `legacyUrls` | `number`      | Distinct old URLs checked.                                                             |
| `problems`   | `Problem[]`   | `{ check, page, message }`. `page` is `null` for site-wide problems. Empty when clean. |

## What it checks

Each check can be turned off with `--skip` (or `skip`).

| Check            | What it looks for                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`          | A non-empty `<title>`.                                                                                                                                                                    |
| `description`    | A non-empty `<meta name="description">`.                                                                                                                                                  |
| `h1`             | Exactly one `<h1>`.                                                                                                                                                                       |
| `alt`            | An `alt` attribute on every `<img>` (an empty one is fine for decorative images).                                                                                                         |
| `links`          | Internal `href`s resolve to a built page, a file, or a `_redirects` source, including splats (`/blog/*`) and placeholders (`/shop/:slug`). Relative links and `<base href>` are followed. |
| `anchors`        | `#fragment` links point at an `id` or `<a name>` on the same page.                                                                                                                        |
| `images`         | `img src`, `input type=image` and `video poster` files exist.                                                                                                                             |
| `srcset`         | Every candidate in `srcset` on `img` and `picture > source` exists.                                                                                                                       |
| `media`          | `video`, `audio`, `source`, `track`, `embed`, `iframe` and `object` files exist.                                                                                                          |
| `stylesheets`    | Linked stylesheets exist, and so do the files their `url()` and `@import` point at (also in `<style>` and `style=""`).                                                                    |
| `scripts`        | `script src` files exist.                                                                                                                                                                 |
| `noindex`        | With `--expect-noindex` or `--forbid-noindex`: the robots tag on every page. Runs only when one is set.                                                                                   |
| `share-card`     | `og:title`, `og:description`, `og:image` and `twitter:card` are set; the image is a JPG or PNG and exists.                                                                                |
| `icons`          | A favicon and an `apple-touch-icon` are linked (or sit at `/favicon.ico` and `/apple-touch-icon.png`) and the files exist.                                                                |
| `jsonld`         | JSON-LD blocks parse, and pages matching a `--require-jsonld` pattern carry the type (found in `@graph` and nested objects).                                                              |
| `redirects`      | Redirect destinations are built pages, and no redirect hides a page that exists (hosts answer redirects first).                                                                           |
| `legacy-urls`    | Every URL in the `--legacy-urls` list is a built page or a redirect source. Runs only when a list is given.                                                                               |
| `trailing-slash` | With `--trailing-slash`: links to pages follow the rule. Runs only when set.                                                                                                              |

URLs are read the way a browser would: any attribute quoting, any case, entity-encoded values (`&amp;`), percent-encoding, trailing slashes, and query strings or hashes (ignored when looking up a file). `http(s)` URLs on other hosts, `mailto:`, `tel:`, `data:` and `javascript:` are not checked. Lookups are case-sensitive, because most hosts are, even if your laptop is not.

## Limits

- It reads the HTML your build wrote, not what a browser renders. A link, heading or meta tag added by JavaScript at runtime is invisible to it.
- External URLs are never fetched. It does not check that `https://other.example` is alive.
- Only a Netlify/Cloudflare Pages style `_redirects` file is read. Rules in `vercel.json`, `netlify.toml`, `_headers` or server config are not, so a link that only a Vercel rewrite answers is reported as broken, and a noindex sent as an `X-Robots-Tag` header is not seen. Redirect rules are matched on the path only; conditions on country, role or query are ignored.
- A site served from a sub-path (Next.js `basePath`, a GitHub Pages project site) is not supported: links are looked up from the root of the folder.
- Only `#fragment` links within the same page are checked, not `/other-page#section`.
- The share image is judged by its extension and existence, not by its bytes or dimensions. An image on a different origin than the page's canonical URL (a CDN) is not looked up.
- `/about` resolving to `about.html` matches Cloudflare Pages, Netlify and Vercel. A server that does not do that needs `--no-clean-urls`.
- Redirect stub pages that some generators write (Hugo aliases, for example) count as pages. Leave them out with `--ignore`.
- It does not validate markup, measure title length or judge content. Use an HTML validator for markup.

## License

MIT © Saimul Islam
