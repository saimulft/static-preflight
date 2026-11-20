import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSite, messages, page, run } from './helpers.ts';

const withBody = (body: string, extra: Record<string, string | Uint8Array> = {}, head = '') =>
  cleanSite({ 'index.html': page({ body: `<h1>x</h1>${body}`, head }), ...extra });

test('images: img src, input type=image and video poster must exist; query and hash are ignored', (t) => {
  const result = run(
    t,
    withBody(
      `<img src="/a.png" alt=""> <img src="/a.png?v=2#x" alt=""> <img src="/b.jpg" alt="">
       <input type="image" src="/c.png" alt="go"> <video poster="/d.jpg" src="/v.mp4"></video>
       <img src="https://cdn.test/x.png" alt=""> <img src="data:image/gif;base64,R0lGOD" alt="">`,
      { 'a.png': 'png', 'v.mp4': 'mp4' },
    ),
  );
  assert.deepEqual(messages(result, 'images'), [
    'missing image: /b.jpg',
    'missing image: /c.png',
    'missing poster image: /d.jpg',
  ]);
});

test('srcset: every candidate must exist, in img and picture source, commas and descriptors handled', (t) => {
  const result = run(
    t,
    withBody(
      `<img src="/a.png" alt="" srcset="/a.png 1x, /a@2x.png 2x,/a@3x.png 3x">
       <picture><source srcset="/w.webp 640w, /w-big.webp 1280w" type="image/webp"><img src="/a.png" alt=""></picture>
       <img src="/a.png" alt="" SRCSET='/a.png'>`,
      { 'a.png': 'png', 'a@2x.png': 'png', 'w.webp': 'webp' },
    ),
  );
  assert.deepEqual(messages(result, 'srcset'), [
    'missing srcset image: /a@3x.png',
    'missing srcset image: /w-big.webp',
  ]);
});

test('media: video, audio, source, track and embed files must exist', (t) => {
  const result = run(
    t,
    withBody(
      `<video src="/clip.mp4"><source src="/clip.webm" type="video/webm"><track src="/clip.vtt"></video>
       <audio src="/sound.mp3"></audio><embed src="/doc.pdf">`,
      { 'clip.mp4': 'x', 'sound.mp3': 'x' },
    ),
  );
  assert.deepEqual(messages(result, 'media'), [
    'missing media file: /clip.webm',
    'missing media file: /clip.vtt',
    'missing media file: /doc.pdf',
  ]);
});

test('scripts: external scripts, inline scripts and existing files pass; a missing file fails', (t) => {
  const result = run(
    t,
    withBody(
      `<script src="/app.js"></script><script src="/gone.js" defer></script><script src="https://cdn.test/x.js"></script>
       <script>console.log("</p>")</script><script type="module" src="./mod.js"></script>`,
      { 'app.js': 'x', 'mod.js': 'x' },
    ),
  );
  assert.deepEqual(messages(result, 'scripts'), ['missing script: /gone.js']);
});

test('stylesheets: linked files must exist, and so must the files they use', (t) => {
  const result = run(
    t,
    withBody(
      '',
      {
        'css/site.css': `/* url(/ignored.png) */
        @import "./extra.css";
        body { background: url(/img/bg.png) }
        .a { background: url("../img/ok.png?v=1#x") }
        .b { background: URL('/img/missing.png') }
        .c { background: url(data:image/png;base64,AAAA) }
        .d { filter: url(#blur) }
        @font-face { src: url(../fonts/f.woff2) format("woff2") }`,
        'css/extra.css': '.e { background: url(deep/gone.png) }',
        'img/bg.png': 'x',
        'img/ok.png': 'x',
      },
      '<link rel="stylesheet" href="/css/site.css"><link rel="stylesheet" href="/css/none.css"><link rel="stylesheet" href="https://cdn.test/x.css">',
    ),
  );
  assert.deepEqual(
    result.problems.filter((p) => p.check === 'stylesheets').map((p) => [p.page, p.message]),
    [
      ['/css/site.css', 'missing file in url(): /img/missing.png'],
      ['/css/site.css', 'missing file in url(): ../fonts/f.woff2'],
      ['/css/extra.css', 'missing file in url(): deep/gone.png'],
      ['/index.html', 'missing stylesheet: /css/none.css'],
    ],
  );
});

test('stylesheets: inline <style> and style attributes are read too', (t) => {
  const result = run(
    t,
    withBody(
      '<div style="background-image: url(/inline-missing.png)">x</div>',
      { 'ok.png': 'x' },
      '<style>.a { background: url(/ok.png) } .b { background: url(/style-missing.png) }</style>',
    ),
  );
  assert.deepEqual(messages(result, 'stylesheets'), [
    'missing file in url(): /inline-missing.png',
    'missing file in url(): /style-missing.png',
  ]);
});

test('assets: a missing asset used on several pages is reported once', (t) => {
  const result = run(t, {
    ...withBody('<img src="/logo.svg" alt="">'),
    'a.html': page({ body: '<h1>a</h1><img src="/logo.svg" alt="">' }),
  });
  assert.deepEqual(messages(result, 'images'), ['missing image: /logo.svg (on 2 pages, e.g. /a.html)']);
});

test('assets: each asset check can be skipped on its own', (t) => {
  const files = withBody(
    '<img src="/a.png" alt="" srcset="/b.png 2x"><video src="/c.mp4"></video><script src="/d.js"></script>',
    {},
    '<link rel="stylesheet" href="/e.css">',
  );
  assert.equal(run(t, files).problems.length, 5);
  const skip = ['images', 'srcset', 'media', 'stylesheets', 'scripts'] as const;
  assert.deepEqual(run(t, files, { skip }).problems, []);
  for (const check of skip) {
    const result = run(t, files, { skip: skip.filter((name) => name !== check) });
    assert.deepEqual([...new Set(result.problems.map((p) => p.check))], [check]);
  }
});
