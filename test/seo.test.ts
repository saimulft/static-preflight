import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSite, messages, page, run } from './helpers.ts';

test('a clean site has no problems', (t) => {
  const result = run(t, cleanSite());
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.pages, ['/index.html']);
  assert.ok(result.checks.includes('share-card'));
  assert.ok(!result.checks.includes('noindex'));
});

test('title: reports a missing or blank title, accepts one with entities', (t) => {
  const result = run(
    t,
    cleanSite({
      'none.html': page({ title: null }),
      'blank.html': page({ title: '   ' }),
      'svg.html': page({ title: null, body: '<h1>x</h1><svg><title>Icon</title></svg>' }),
      'ok.html': page({ title: 'Tom &amp; Jerry' }),
    }),
  );
  const pages = result.problems.filter((p) => p.check === 'title').map((p) => p.page);
  assert.deepEqual(pages, ['/blank.html', '/none.html', '/svg.html']);
  assert.equal(result.problems[0]?.message, 'no <title>');
});

test('description: reports a missing or empty description; attribute order and case do not matter', (t) => {
  const result = run(
    t,
    cleanSite({
      'none.html': page({ description: null }),
      'empty.html': page({ description: '' }),
      'ok.html': page({ description: null, head: "<META CONTENT='Hi there' NAME='Description'>" }),
    }),
  );
  assert.deepEqual(
    result.problems.filter((p) => p.check === 'description').map((p) => p.page),
    ['/empty.html', '/none.html'],
  );
});

test('h1: exactly one is required; h1 inside a script string is not counted', (t) => {
  const result = run(
    t,
    cleanSite({
      'none.html': page({ body: '<p>no heading</p>' }),
      'two.html': page({ body: '<h1>a</h1><H1 class=x>b</H1>' }),
      'script.html': page({ body: '<h1>a</h1><script>const x = "<h1>not a heading</h1>";</script>' }),
    }),
  );
  assert.deepEqual(
    result.problems.filter((p) => p.check === 'h1').map((p) => [p.page, p.message]),
    [
      ['/none.html', '0 h1 elements (expected 1)'],
      ['/two.html', '2 h1 elements (expected 1)'],
    ],
  );
});

test('alt: an image needs an alt attribute; an empty alt is allowed', (t) => {
  const result = run(
    t,
    cleanSite({
      'a.png': 'png',
      'img.html': page({
        body: `<h1>x</h1>
<img src="/a.png">
<img src='/a.png' alt=''>
<img src=/a.png alt>
<IMG SRC="/a.png" ALT="A photo">
<img src="/a.png" data-alt="no">`,
      }),
    }),
  );
  assert.deepEqual(messages(result, 'alt'), ['image without alt: /a.png', 'image without alt: /a.png']);
});

test('noindex: neither mode by default; the check does not run', (t) => {
  const result = run(t, cleanSite({ 'hidden.html': page({ head: '<meta name="robots" content="noindex">' }) }));
  assert.deepEqual(result.problems, []);
  assert.ok(!result.checks.includes('noindex'));
});

test('noindex expect: every page must carry a noindex robots tag', (t) => {
  const noindex = '<meta name="robots" content="noindex, nofollow">';
  const result = run(
    t,
    cleanSite({
      'index.html': page({ head: noindex }),
      'googlebot.html': page({ head: '<meta name="googlebot" content="NOINDEX">' }),
      'none.html': page({ head: '<meta name="robots" content="none">' }),
      'open.html': page({ head: '<meta name="robots" content="index, follow">' }),
      'bare.html': page(),
    }),
    { noindex: 'expect' },
  );
  assert.deepEqual(
    result.problems.map((p) => [p.check, p.page]),
    [
      ['noindex', '/bare.html'],
      ['noindex', '/open.html'],
    ],
  );
});

test('noindex forbid: fails pages that carry noindex, except 404 pages', (t) => {
  const noindex = '<meta name="robots" content="noindex">';
  const result = run(
    t,
    cleanSite({
      'index.html': page({ head: noindex }),
      'about.html': page(),
      '404.html': page({ head: noindex }),
    }),
    { noindex: 'forbid', ignore: [] },
  );
  assert.deepEqual(
    result.problems.map((p) => [p.check, p.page, p.message]),
    [['noindex', '/index.html', 'has a noindex robots tag']],
  );
});

test('404 pages and _next are ignored by default and listed in the result', (t) => {
  const result = run(
    t,
    cleanSite({
      '404.html': '<p>nothing here</p>',
      '_not-found/index.html': '<p>nothing here</p>',
      '_next/static/frame.html': '<p>x</p>',
    }),
  );
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.ignored, ['/404.html', '/_next/static/frame.html', '/_not-found/index.html']);
});
