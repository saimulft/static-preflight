import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { preflight } from '../src/index.ts';
import type { CheckName, PreflightOptions, PreflightResult } from '../src/index.ts';

/** Writes a small site into a temp folder that is removed when the test ends. */
export function makeSite(t: TestContext, files: Record<string, string | Uint8Array>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'static-preflight-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

const SHARE_TAGS = `<meta property="og:title" content="A page">
<meta property="og:description" content="About this page.">
<meta property="og:image" content="https://example.com/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`;

export interface PageParts {
  title?: string | null;
  description?: string | null;
  /** Replaces the whole <body>. */
  body?: string;
  /** Extra markup for the <head>. */
  head?: string;
  /** The share-card and icon tags. Pass '' to leave them out. */
  share?: string;
}

/** A page that passes every default check, with the parts you name changed. `null` leaves a part out. */
export function page(parts: PageParts = {}): string {
  const { title = 'A page', description = 'About this page.', body = '<h1>Hello</h1>', head = '' } = parts;
  const { share = SHARE_TAGS } = parts;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${title === null ? '' : `<title>${title}</title>`}
${description === null ? '' : `<meta name="description" content="${description}">`}
${share}
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

/** The files every clean site needs next to its pages. */
export const SUPPORT_FILES: Record<string, string> = {
  'og.png': 'png',
  'favicon.ico': 'ico',
  'apple-touch-icon.png': 'png',
};

/** A clean one-page site, plus any files you add or override. */
export function cleanSite(extra: Record<string, string | Uint8Array> = {}): Record<string, string | Uint8Array> {
  return { 'index.html': page(), ...SUPPORT_FILES, ...extra };
}

/** Runs preflight on a site written to a temp folder. */
export function run(
  t: TestContext,
  files: Record<string, string | Uint8Array>,
  options: PreflightOptions = {},
): PreflightResult {
  return preflight(makeSite(t, files), options);
}

/** The problem messages of one check. */
export function messages(result: PreflightResult, check: CheckName): string[] {
  return result.problems.filter((problem) => problem.check === check).map((problem) => problem.message);
}
