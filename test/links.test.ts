import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSite, messages, page, run } from './helpers.ts';

const withBody = (body: string, extra: Record<string, string | Uint8Array> = {}) =>
  cleanSite({ 'index.html': page({ body: `<h1>x</h1>${body}` }), ...extra });

test('links: pass for pages, files, folders with an index and clean URLs', (t) => {
  const result = run(
    t,
    withBody(
      `<a href="/about/">a</a> <a href="/about">b</a> <a href="/team">c</a> <a href="/docs/guide.pdf">d</a>
       <a href="/team/?x=1#top">e</a> <a href="/">home</a> <a href="">self</a> <a href="?page=2">self</a>`,
      {
        'about/index.html': page(),
        'team.html': page(),
        'docs/guide.pdf': 'pdf',
      },
    ),
  );
  assert.deepEqual(messages(result, 'links'), []);
});

test('links: report broken links once, with a count and the first page', (t) => {
  const result = run(t, {
    ...withBody('<a href="/missing">x</a> <a href="/folder/">y</a>', { 'folder/readme.txt': 'no index here' }),
    'a.html': page({ body: '<h1>a</h1><a href="/missing">x</a>' }),
    'b.html': page({ body: '<h1>b</h1><a href="/missing">x</a>' }),
  });
  assert.deepEqual(messages(result, 'links'), [
    'broken link /missing (on 3 pages, e.g. /a.html)',
    'broken link /folder/',
  ]);
  assert.equal(result.problems[0]?.page, '/a.html');
});

test('links: resolve relative to the page, and honour <base href>', (t) => {
  const result = run(t, {
    ...cleanSite(),
    'blog/index.html': page({
      body: '<h1>b</h1><a href="post">ok</a> <a href="../about">ok</a> <a href="./nope">bad</a>',
    }),
    'blog/post.html': page(),
    'about.html': page(),
    'docs/page.html': page({
      head: '<base href="/guide/">',
      body: '<h1>d</h1><a href="intro">ok</a> <a href="gone">bad</a>',
    }),
    'guide/intro.html': page(),
  });
  assert.deepEqual(messages(result, 'links'), [
    'broken link ./nope (resolves to /blog/nope)',
    'broken link gone (resolves to /guide/gone)',
  ]);
});

test('links: ignore external, mailto, tel, data, javascript and protocol-relative URLs', (t) => {
  const result = run(
    t,
    withBody(`<a href="https://elsewhere.test/x">1</a> <a href="mailto:a@b.test">2</a> <a href="tel:+100">3</a>
      <a href="data:text/plain,hi">4</a> <a href="javascript:void(0)">5</a> <a href="//cdn.test/x">6</a>
      <a href="HTTP://Elsewhere.test/y">7</a> <a href="sms:+100">8</a>`),
  );
  assert.deepEqual(messages(result, 'links'), []);
});

test('links: read double, single and unquoted attributes, any case, and decode entities', (t) => {
  const result = run(
    t,
    withBody(
      `<a href='/a?x=1&amp;y=2'>1</a> <A HREF=/b>2</A> <a
          class="x"
          href = "/c#frag">3</a> <a href="/d&#47;e">4</a> <a title="a > b" href="/f">5</a>`,
      { 'a.html': page(), 'b.html': page(), 'c.html': page(), 'd/e.html': page(), 'f.html': page() },
    ),
  );
  assert.deepEqual(messages(result, 'links'), []);
});

test('links: percent-encoded paths match the file, and the case must match exactly', (t) => {
  const result = run(
    t,
    withBody('<a href="/caf%C3%A9">1</a> <a href="/my%20page">2</a> <a href="/About">3</a>', {
      'café.html': page(),
      'my page.html': page(),
      'about.html': page(),
    }),
  );
  assert.deepEqual(messages(result, 'links'), ['broken link /About']);
});

test('links: use <link> hrefs too, but leave stylesheets and icons to their own checks', (t) => {
  const result = run(
    t,
    cleanSite({
      'index.html': page({
        head: '<link rel="manifest" href="/site.webmanifest"><link rel="stylesheet" href="/gone.css" /><link rel="canonical" href="/">',
      }),
    }),
    { skip: ['stylesheets'] },
  );
  assert.deepEqual(messages(result, 'links'), ['broken link /site.webmanifest']);
});

test('links: can be skipped', (t) => {
  const result = run(t, withBody('<a href="/missing">x</a>'), { skip: ['links'] });
  assert.deepEqual(result.problems, []);
  assert.ok(!result.checks.includes('links'));
});

test('links: a redirect source counts as resolving, including splats and placeholders', (t) => {
  const result = run(
    t,
    withBody(
      `<a href="/old">1</a> <a href="/old/">2</a> <a href="/blog/2020/hello">3</a> <a href="/shop/shoes">4</a>
       <a href="/shop/shoes/red">5</a> <a href="/gone">6</a> <a href="/blocked">7</a>`,
      {
        _redirects: `# comment
/old /new 301
/blog/* /news/:splat 301
/shop/:category /products/:category 302

/blocked /new 410
/new.html /new 200
`,
        'new.html': page(),
      },
    ),
  );
  // /shop/:category matches one segment only; 410 rules do not serve a page.
  assert.deepEqual(messages(result, 'links'), [
    'broken link /shop/shoes/red',
    'broken link /gone',
    'broken link /blocked',
  ]);
});

test('links: redirectsFile points at a file elsewhere, false ignores _redirects', (t) => {
  const files = withBody('<a href="/old">1</a>', { _redirects: '/old /new.html 301\n' });
  assert.deepEqual(messages(run(t, files), 'links'), []);
  assert.deepEqual(messages(run(t, files, { redirectsFile: false }), 'links'), ['broken link /old']);
  assert.throws(() => run(t, files, { redirectsFile: '/no/such/redirects' }), /Cannot read the redirects file/);
});

test('links: cleanUrls false stops /about resolving to about.html', (t) => {
  const files = withBody('<a href="/about">1</a>', { 'about.html': page() });
  assert.deepEqual(messages(run(t, files), 'links'), []);
  assert.deepEqual(messages(run(t, files, { cleanUrls: false }), 'links'), ['broken link /about']);
});

test('links: absolute URLs on siteUrl are checked like internal ones', (t) => {
  const files = withBody('<a href="https://example.com/missing">1</a> <a href="https://example.com/about">2</a>', {
    'about.html': page(),
  });
  assert.deepEqual(messages(run(t, files), 'links'), []);
  assert.deepEqual(messages(run(t, files, { siteUrl: 'https://example.com' }), 'links'), [
    'broken link https://example.com/missing (resolves to /missing)',
  ]);
  assert.throws(() => run(t, files, { siteUrl: 'not a url' }), /siteUrl is not a URL/);
});

test('anchors: in-page fragments need an id or a named anchor', (t) => {
  const result = run(
    t,
    withBody(
      `<a href="#top">1</a> <a href="#">2</a> <a href="#section">3</a> <a href="#old-style">4</a>
       <a href="#caf%C3%A9">5</a> <a href="#nope">6</a> <a href="#Section">7</a>
       <h2 id="section">S</h2> <a name="old-style"></a> <p id='café'>c</p>`,
    ),
  );
  assert.deepEqual(messages(result, 'anchors'), ['anchor #nope has no target', 'anchor #Section has no target']);
});

test('anchors: ids inside scripts and comments do not count', (t) => {
  const result = run(
    t,
    withBody('<a href="#a">1</a> <a href="#b">2</a><!-- <i id="a"></i> --><script>x = \'<i id="b"></i>\'</script>'),
  );
  assert.deepEqual(messages(result, 'anchors'), ['anchor #a has no target', 'anchor #b has no target']);
});

test('trailing-slash: off by default; forbid and require flag the links that disagree', (t) => {
  const files = withBody('<a href="/about/">1</a> <a href="/team">2</a> <a href="/">3</a> <a href="/file.pdf">4</a>', {
    'about/index.html': page(),
    'team/index.html': page(),
    'file.pdf': 'pdf',
  });
  assert.deepEqual(messages(run(t, files), 'trailing-slash'), []);
  assert.deepEqual(messages(run(t, files, { trailingSlash: 'forbid' }), 'trailing-slash'), [
    'link with a trailing slash: /about/',
  ]);
  assert.deepEqual(messages(run(t, files, { trailingSlash: 'require' }), 'trailing-slash'), [
    'link without a trailing slash: /team',
  ]);
});
