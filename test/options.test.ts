import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CHECK_NAMES, PreflightError, loadConfig, preflight } from '../src/index.ts';
import { cleanSite, makeSite, page, run } from './helpers.ts';

const broken = cleanSite({ 'index.html': page({ title: null, body: '<h1>x</h1><a href="/nope">x</a>' }) });

test('skip turns checks off and they are left out of result.checks', (t) => {
  assert.deepEqual(
    run(t, broken).problems.map((p) => p.check),
    ['title', 'links'],
  );
  const result = run(t, broken, { skip: ['title'] });
  assert.deepEqual(
    result.problems.map((p) => p.check),
    ['links'],
  );
  assert.ok(!result.checks.includes('title'));
  assert.deepEqual(run(t, broken, { skip: [...CHECK_NAMES] }).checks, []);
});

test('ignore leaves matching pages out of every check; patterns use * across slashes', (t) => {
  const files = cleanSite({ 'drafts/a/index.html': '<p>x</p>', 'drafts/b.html': '<p>x</p>', 'keep.html': page() });
  const result = run(t, files, { ignore: ['/drafts/*'] });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.pages, ['/index.html', '/keep.html']);
  assert.deepEqual(result.ignored, ['/drafts/a/index.html', '/drafts/b.html']);
});

test('exclude leaves matching pages out of one check only', (t) => {
  const files = cleanSite({
    'checkout/index.html': page({ body: '<p>drawn in the browser</p><img src="/og.png">' }),
  });
  assert.deepEqual(
    run(t, files).problems.map((p) => p.check),
    ['h1', 'alt'],
  );
  const result = run(t, files, { exclude: { h1: ['/checkout*'] } });
  assert.deepEqual(
    result.problems.map((p) => p.check),
    ['alt'],
  );
  assert.throws(() => run(t, files, { exclude: { nope: ['/x'] } as never }), /Unknown check in exclude: nope/);
});

test('bad options throw PreflightError', (t) => {
  const files = cleanSite();
  assert.throws(() => run(t, files, { skip: ['nope' as never] }), PreflightError);
  assert.throws(() => run(t, files, { skip: ['nope' as never] }), /Unknown check: nope/);
  assert.throws(() => run(t, files, { noindex: 'maybe' as never }), /noindex must be/);
  assert.throws(() => run(t, files, { trailingSlash: 'always' as never }), /trailingSlash must be/);
  assert.throws(() => preflight(path.join(makeSite(t, files), 'missing')), /Folder not found/);
  assert.throws(() => preflight(path.join(makeSite(t, files), 'index.html')), /Folder not found/);
});

test('an empty folder gives no pages and no problems', (t) => {
  const dir = makeSite(t, { 'robots.txt': 'x' });
  const result = preflight(dir);
  assert.deepEqual(result.pages, []);
  assert.deepEqual(result.problems, []);
});

test('problems are ordered by check, then by page', (t) => {
  const files = {
    ...cleanSite({
      'a.html': page({ title: null, description: null, body: '<a href="/x">x</a>' }),
      'b.html': page({ title: null, body: '<h1>b</h1>' }),
    }),
  };
  const order = run(t, files).problems.map((p) => `${p.check}:${p.page}`);
  assert.deepEqual(order, ['title:/a.html', 'title:/b.html', 'description:/a.html', 'h1:/a.html', 'links:/a.html']);
});

test('the same site gives the same result on every run', (t) => {
  const files = makeSite(t, broken);
  assert.deepEqual(preflight(files), preflight(files));
});

test('a byte-order mark and CRLF line endings do not matter', (t) => {
  const html = String.fromCharCode(0xfeff) + page().replace(/\n/g, '\r\n');
  assert.deepEqual(run(t, cleanSite({ 'index.html': html })).problems, []);
});

test('loadConfig: no file means undefined; a valid file is returned as written', (t) => {
  const cwd = makeSite(t, {});
  assert.equal(loadConfig(cwd), undefined);
  writeFileSync(
    path.join(cwd, 'static-preflight.config.json'),
    JSON.stringify({
      $schema: 'ignored',
      dir: 'dist',
      noindex: 'expect',
      skip: ['alt'],
      requireJsonLd: ['Product=/p/*', { type: 'Article', pattern: '/blog/*' }],
      exclude: { h1: ['/x'] },
      maxProblems: 10,
    }),
  );
  const config = loadConfig(cwd);
  assert.equal(config?.dir, 'dist');
  assert.equal(config?.noindex, 'expect');
  assert.equal(config?.maxProblems, 10);
});

test('loadConfig: rejects unknown keys, wrong types, unknown checks and bad JSON', (t) => {
  const cwd = makeSite(t, {});
  const write = (text: string) => writeFileSync(path.join(cwd, 'cfg.json'), text);
  for (const [text, message] of [
    ['{"colour": 1}', /unknown option "colour"/],
    ['{"noindex": "yes"}', /"noindex" must be/],
    ['{"skip": "alt"}', /"skip" must be an array/],
    ['{"skip": ["nope"]}', /unknown check in "skip": nope/],
    ['{"maxProblems": -1}', /"maxProblems" must be/],
    ['[]', /must contain a JSON object/],
    ['{', /is not valid JSON/],
  ] as const) {
    write(text);
    assert.throws(() => loadConfig(cwd, 'cfg.json'), message, text);
  }
  assert.throws(() => loadConfig(cwd, 'missing.json'), /Cannot read the config file/);
});
