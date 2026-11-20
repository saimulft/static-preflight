# Changelog

## 0.1.0

Initial release.

- Checks a built static site folder for titles, meta descriptions, one h1 per page and alt text on images.
- Resolves internal links, in-page anchors, images, `srcset` entries, media, stylesheets (and the files they use) and scripts, including `_redirects` sources with splats and placeholders.
- Checks share cards (og and Twitter tags, a JPG or PNG image that exists), icons, and required JSON-LD types by path pattern.
- Requires or forbids a noindex robots tag, and checks that a list of legacy URLs each lands on a page or a redirect.
- CLI with `--json`, per-check `--skip`, a capped text report and exit codes 0, 1 and 2; options can also come from `static-preflight.config.json`.
- Programmatic API (`preflight`) with typed options and results, and no runtime dependencies.
