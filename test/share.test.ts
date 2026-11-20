import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSite, messages, page, run } from './helpers.ts';

const card = (image: string, extra = '') => `
<meta property="og:title" content="T"><meta property="og:description" content="D">
<meta property="og:image" content="${image}"><meta name="twitter:card" content="summary">${extra}`;

/** A page with the icon tags but no share tags except the ones given. */
const bare = (head: string) =>
  page({
    share: '<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    head,
  });

test('share-card: passes with all tags and an existing PNG or JPG', (t) => {
  for (const image of ['/og.png', '/og.jpg', '/OG.JPEG']) {
    const files = cleanSite({ 'index.html': bare(card(`https://example.com${image}`)), [image.slice(1)]: 'img' });
    assert.deepEqual(messages(run(t, files), 'share-card'), [], image);
  }
});

test('share-card: reports each missing tag, property or name attribute accepted', (t) => {
  const result = run(t, cleanSite({ 'index.html': bare('<meta property="og:title" content="T">') }));
  assert.deepEqual(messages(result, 'share-card'), ['no og:description', 'no og:image', 'no twitter:card']);
  const swapped = run(
    t,
    cleanSite({
      'index.html': bare(
        '<meta name="og:title" content="T"><meta property="og:description" content="D"><meta property="og:image" content="/og.png"><meta property="twitter:card" content="summary">',
      ),
    }),
  );
  assert.deepEqual(messages(swapped, 'share-card'), []);
});

test('share-card: the image must be a JPG or PNG that exists, whatever the query string', (t) => {
  const webp = run(t, cleanSite({ 'index.html': bare(card('https://example.com/og.webp')), 'og.webp': 'x' }));
  assert.deepEqual(messages(webp, 'share-card'), ["share image isn't a JPG or PNG: /og.webp"]);
  const missing = run(t, cleanSite({ 'index.html': bare(card('https://example.com/nope.png?v=3')) }));
  assert.deepEqual(messages(missing, 'share-card'), ['share image missing: /nope.png']);
  const data = run(t, cleanSite({ 'index.html': bare(card('data:image/png;base64,AAAA')) }));
  assert.deepEqual(messages(data, 'share-card'), ['share image is not an http(s) URL: data:image/png;base64,AAAA']);
});

test('share-card: an image on another origin than the canonical URL is not looked up in the folder', (t) => {
  const head = card('https://cdn.test/x/og.png', '<link rel="canonical" href="https://example.com/">');
  assert.deepEqual(messages(run(t, cleanSite({ 'index.html': bare(head) })), 'share-card'), []);
  const sameOrigin = card('https://example.com/x/og.png', '<link rel="canonical" href="https://example.com/">');
  assert.deepEqual(messages(run(t, cleanSite({ 'index.html': bare(sameOrigin) })), 'share-card'), [
    'share image missing: /x/og.png',
  ]);
  // siteUrl states the origin outright.
  const noCanonical = cleanSite({ 'index.html': bare(card('https://cdn.test/x/og.png')) });
  assert.deepEqual(messages(run(t, noCanonical, { siteUrl: 'https://example.com' }), 'share-card'), []);
  assert.deepEqual(messages(run(t, noCanonical), 'share-card'), ['share image missing: /x/og.png']);
});

test('share-card: twitter:image must exist when it differs from og:image', (t) => {
  const head = card('/og.png', '<meta name="twitter:image" content="https://example.com/tw.png">');
  assert.deepEqual(messages(run(t, cleanSite({ 'index.html': bare(head) })), 'share-card'), [
    'twitter:image missing: /tw.png',
  ]);
});

test('share-card: shareTags changes the required tags', (t) => {
  const files = cleanSite();
  const result = run(t, files, { shareTags: ['og:title', 'og:url', 'og:site_name'] });
  assert.deepEqual(messages(result, 'share-card'), ['no og:url', 'no og:site_name']);
});

test('icons: passes when linked and present', (t) => {
  assert.deepEqual(messages(run(t, cleanSite()), 'icons'), []);
});

test('icons: reports a link to a missing file, any rel spelling', (t) => {
  const html = page().replace(/<link rel="icon"[^>]*>\n/, '<link rel="shortcut icon" href="/gone.ico">\n');
  const result = run(t, cleanSite({ 'index.html': html.replace('/apple-touch-icon.png', '/touch.png') }));
  assert.deepEqual(messages(result, 'icons'), ['icon missing: /gone.ico', 'apple-touch-icon missing: /touch.png']);
});

test('icons: with no link, the default files count, otherwise the page is reported', (t) => {
  const noLinks = page().replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\n/g, '');
  const withDefaults = run(t, cleanSite({ 'index.html': noLinks }));
  assert.deepEqual(messages(withDefaults, 'icons'), []);
  const files = cleanSite({ 'index.html': noLinks });
  delete files['favicon.ico'];
  delete files['apple-touch-icon.png'];
  assert.deepEqual(messages(run(t, files), 'icons'), [
    'icon missing: no <link rel="icon">',
    'apple-touch-icon missing: no <link rel="apple-touch-icon">',
  ]);
});

test('share-card and icons can be skipped', (t) => {
  const files = { 'index.html': page({ share: '' }) };
  assert.ok(run(t, files).problems.length > 0);
  assert.deepEqual(run(t, files, { skip: ['share-card', 'icons'] }).problems, []);
});
