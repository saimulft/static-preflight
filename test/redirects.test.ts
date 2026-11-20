import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { cleanSite, makeSite, messages, page, run } from './helpers.ts';
import { preflight } from '../src/index.ts';

const site = (redirects: string, extra: Record<string, string> = {}) =>
  cleanSite({
    _redirects: redirects,
    'about.html': page(),
    'blog/index.html': page(),
    'blog/post.html': page(),
    ...extra,
  });

test('redirects: destinations that exist pass, including clean URLs, queries and external targets', (t) => {
  const result = run(
    t,
    site(`/team /about 301
/people /about?from=people 301
/news /blog/ 302
/shop https://shop.example.com 301
/docs/* /blog/:splat 301
/a/:id /blog/:id 301`),
  );
  assert.deepEqual(messages(result, 'redirects'), []);
  assert.equal(result.redirects, 6);
});

test('redirects: a destination that is not built is reported', (t) => {
  const result = run(t, site('/old /gone 301\n/older /gone.html 301'));
  assert.deepEqual(messages(result, 'redirects'), [
    "redirect /old goes to /gone, which isn't a page or file",
    "redirect /older goes to /gone.html, which isn't a page or file",
  ]);
  assert.equal(result.problems[0]?.page, null);
});

test('redirects: a rule that matches a built page hides it', (t) => {
  const result = run(t, site('/about /blog 301\n/blog/* /about 301\n/index.html / 301'));
  assert.deepEqual(messages(result, 'redirects'), [
    'redirect /about hides the page /about',
    'redirect /blog/* hides 2 pages, e.g. /blog/',
  ]);
});

test('redirects: rewrites, error rules and sources with a file extension are deliberate', (t) => {
  const result = run(t, site('/about /blog 200\n/blog/* /about 404\n/about.html /about 301\n/app/* /about 200'));
  assert.deepEqual(messages(result, 'redirects'), []);
});

test('redirects: a comment-only or empty file is fine; --redirects false ignores the file', (t) => {
  assert.deepEqual(run(t, site('# nothing\n\n')).problems, []);
  assert.deepEqual(run(t, site('/about /gone 301'), { redirectsFile: false }).problems, []);
});

test('redirects: can be skipped', (t) => {
  assert.deepEqual(run(t, site('/old /gone 301'), { skip: ['redirects'] }).problems, []);
});

test('redirects: a redirects file outside the folder can be named', (t) => {
  const dir = makeSite(t, cleanSite({ 'about.html': page() }));
  const rules = path.join(makeSite(t, {}), 'rules.txt');
  writeFileSync(rules, '/old /gone 301\n');
  const result = preflight(dir, { redirectsFile: rules });
  assert.deepEqual(messages(result, 'redirects'), ["redirect /old goes to /gone, which isn't a page or file"]);
});

test('legacy-urls: each old path needs a page, a file or a redirect (JSON array)', (t) => {
  const dir = makeSite(t, {
    ...site('/old-contact /about 301\n/shop/* /blog 301'),
    'legacy.json': JSON.stringify([
      'https://old.example.com/about?ref=1',
      '/old-contact/',
      '/shop/mugs',
      '/lost',
      '/blog/post',
    ]),
  });
  const result = preflight(dir, { legacyUrls: path.join(dir, 'legacy.json'), ignore: ['/legacy*'] });
  assert.deepEqual(messages(result, 'legacy-urls'), ['old URL /lost has no page and no redirect']);
  assert.equal(result.legacyUrls, 5);
  assert.ok(result.checks.includes('legacy-urls'));
});

test('legacy-urls: a text file ignores blank lines and comments, and repeated entries count once', (t) => {
  const dir = makeSite(t, {
    ...cleanSite({ 'about.html': page() }),
    'urls.txt': '# exported from the old site\n\n/about\n/about/\nhttps://old.example.com/lost#x\n  /about  \n',
  });
  const result = preflight(dir, { legacyUrls: path.join(dir, 'urls.txt'), ignore: ['/urls*'] });
  assert.deepEqual(messages(result, 'legacy-urls'), ['old URL /lost has no page and no redirect']);
  assert.equal(result.legacyUrls, 3);
});

test('legacy-urls: an array can be passed directly; no list means no check', (t) => {
  const files = cleanSite({ 'about.html': page() });
  assert.deepEqual(messages(run(t, files, { legacyUrls: ['/about', '/lost'] }), 'legacy-urls'), [
    'old URL /lost has no page and no redirect',
  ]);
  assert.ok(!run(t, files).checks.includes('legacy-urls'));
  assert.deepEqual(run(t, files, { legacyUrls: ['/lost'], skip: ['legacy-urls'] }).problems, []);
});

test('legacy-urls: unreadable or malformed lists are errors, not problems', (t) => {
  const dir = makeSite(t, { 'bad.json': '[1, 2]', 'broken.json': '[ "/a" ', 'index.html': page() });
  assert.throws(() => preflight(dir, { legacyUrls: path.join(dir, 'nope.json') }), /Cannot read the legacy URL list/);
  assert.throws(() => preflight(dir, { legacyUrls: path.join(dir, 'bad.json') }), /must be a JSON array of strings/);
  assert.throws(() => preflight(dir, { legacyUrls: path.join(dir, 'broken.json') }), /is not valid JSON/);
});
