import assert from 'node:assert/strict';
import test from 'node:test';
import { cssUrls, decodeEntities, parseHtml, srcsetUrls } from '../src/html.ts';

test('decodeEntities: named, decimal and hex references; unknown ones are left alone', () => {
  assert.equal(
    decodeEntities('a&amp;b &lt;c&gt; &quot;d&quot; &#39;e&#x27; &#x1F600; &AMP; &bogus; &amp'),
    'a&b <c> "d" \'e\' \u{1F600} & &bogus; &amp',
  );
  assert.equal(decodeEntities('plain'), 'plain');
});

test('parseHtml: attribute quoting styles, case, and > inside a quoted value', () => {
  const { tags } = parseHtml(`<A HREF="/a" Class='x y' data-n=3 hidden title="a > b"><img src=/i.png alt=""/><br/>`);
  assert.deepEqual(
    tags.map((tag) => tag.name),
    ['a', 'img', 'br'],
  );
  assert.equal(tags[0]?.attrs.get('href'), '/a');
  assert.equal(tags[0]?.attrs.get('class'), 'x y');
  assert.equal(tags[0]?.attrs.get('data-n'), '3');
  assert.equal(tags[0]?.attrs.get('hidden'), '');
  assert.equal(tags[0]?.attrs.get('title'), 'a > b');
  assert.equal(tags[1]?.attrs.get('src'), '/i.png');
  assert.equal(tags[1]?.attrs.get('alt'), '');
});

test('parseHtml: the first of a repeated attribute wins; values are entity-decoded', () => {
  const { tags } = parseHtml('<a href="/one?a=1&amp;b=2" href="/two">');
  assert.equal(tags[0]?.attrs.get('href'), '/one?a=1&b=2');
});

test('parseHtml: comments, scripts and styles are not tags; their bodies are kept', () => {
  const html = `<!-- <a href="/c"> --><script type="text/x">if (a < b) document.write("<a href='/s'>")</script>
<style>a > b { color: red }</style><script-like data-x="1"></script-like><p id="p">`;
  const parsed = parseHtml(html);
  assert.deepEqual(
    parsed.tags.map((tag) => tag.name),
    ['script-like', 'p'],
  );
  assert.equal(parsed.scripts.length, 1);
  assert.match(parsed.scripts[0]?.body ?? '', /document\.write/);
  assert.deepEqual(parsed.styles, ['a > b { color: red }']);
  assert.ok(parsed.ids.has('p'));
});

test('parseHtml: an unterminated comment or script does not throw', () => {
  assert.doesNotThrow(() => parseHtml('<p>a</p><!-- never closed <a href="/x">'));
  assert.doesNotThrow(() => parseHtml('<p>a</p><script>never closed <a href="/x">'));
  assert.doesNotThrow(() => parseHtml('<a href="unclosed'));
});

test('parseHtml: title ignores inline SVG titles and decodes entities', () => {
  assert.equal(parseHtml('<svg><title>Icon</title></svg><title> Hi &amp; bye </title>').title, 'Hi & bye');
  assert.equal(parseHtml('<svg><title>Icon</title></svg>').title, undefined);
  assert.equal(parseHtml('<TITLE></TITLE>').title, undefined);
});

test('parseHtml: meta reads name and property, any case, skipping blank content', () => {
  const html = parseHtml(
    `<meta NAME="Description" content="One"><meta property="og:title" content=" T "><meta name="robots" content=""><meta name="robots" content="noindex">`,
  );
  assert.equal(html.meta('description'), 'One');
  assert.equal(html.meta('OG:TITLE'), 'T');
  assert.deepEqual(html.metaAll('robots'), ['noindex']);
  assert.equal(html.meta('missing'), undefined);
});

test('srcsetUrls: descriptors, commas without spaces, and commas inside URLs', () => {
  assert.deepEqual(srcsetUrls('/a.png 1x, /b.png 2x'), ['/a.png', '/b.png']);
  assert.deepEqual(srcsetUrls('/a.png 1x,/b.png 640w,\n  /c.png   1280w'), ['/a.png', '/b.png', '/c.png']);
  assert.deepEqual(srcsetUrls('data:image/gif;base64,R0lG 1x, /d.png'), ['data:image/gif;base64,R0lG', '/d.png']);
  // A comma inside a URL (no space after it) belongs to the URL.
  assert.deepEqual(srcsetUrls('/a.png,/b.png 640w'), ['/a.png,/b.png']);
  assert.deepEqual(srcsetUrls('/only.png'), ['/only.png']);
  assert.deepEqual(srcsetUrls(''), []);
});

test('cssUrls: url() in every quoting style, @import, and comments ignored', () => {
  const css = `/* url(/comment.png) */ a { background: url( "/a.png" ), url('/b.png'), url(/c.png); }
    @import "/d.css"; @import url(/e.css);`;
  assert.deepEqual(cssUrls(css), ['/a.png', '/b.png', '/c.png', '/e.css', '/d.css']);
});
