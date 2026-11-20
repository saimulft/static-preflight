import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { PreflightResult } from '../src/index.ts';
import { cleanSite, makeSite, page } from './helpers.ts';

const CLI = path.resolve(import.meta.dirname, '../src/cli.ts');

/** Runs the CLI in a temp working directory that holds `files`. */
function cli(t: TestContext, files: Record<string, string | Uint8Array>, args: string[]) {
  const cwd = makeSite(t, files);
  const done = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { cwd, status: done.status, stdout: done.stdout, stderr: done.stderr };
}

const inOut = (files: Record<string, string | Uint8Array>) =>
  Object.fromEntries(Object.entries(files).map(([name, content]) => [`out/${name}`, content]));

test('cli: a clean site prints "No problems found." with the page count and exits 0', (t) => {
  const { status, stdout, stderr } = cli(t, inOut(cleanSite()), []);
  assert.equal(status, 0, stderr);
  assert.equal(stdout, 'No problems found. Checked 1 page.\n');
});

test('cli: defaults to the out folder, and takes another folder as an argument', (t) => {
  const files = {
    ...inOut(cleanSite()),
    ...Object.fromEntries(Object.entries(cleanSite()).map(([k, v]) => [`dist/${k}`, v])),
  };
  files['dist/index.html'] = page({ title: null });
  assert.equal(cli(t, files, []).status, 0);
  const result = cli(t, files, ['dist']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^title \(1\)\n {2}\/index\.html: no <title>\n/);
});

test('cli: problems are grouped by check, with a summary, and exit 1', (t) => {
  const files = inOut(
    cleanSite({
      'index.html': page({ title: null, body: '<h1>x</h1><a href="/nope">x</a>' }),
      'about.html': page({ title: null }),
    }),
  );
  const { status, stdout } = cli(t, files, []);
  assert.equal(status, 1);
  assert.equal(
    stdout,
    `title (2)
  /about.html: no <title>
  /index.html: no <title>

links (1)
  /index.html: broken link /nope

3 problems found. Checked 2 pages.
`,
  );
});

test('cli: the list is capped, with …and N more', (t) => {
  const pages = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}.html`, page({ title: null })]));
  const files = inOut(cleanSite(pages));
  const capped = cli(t, files, ['--max-problems', '3']);
  assert.equal(capped.status, 1);
  assert.match(capped.stdout, /^title \(10\)\n( {2}\S+: no <title>\n){3}\n…and 7 more\.\n\n10 problems found/);
  const all = cli(t, files, ['--max-problems', '0']);
  assert.equal(all.stdout.match(/no <title>/g)?.length, 10);
  assert.doesNotMatch(all.stdout, /…and/);
  // The default is 80, like the scripts this came from.
  const many = Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`p${i}.html`, page({ title: null })]));
  assert.match(cli(t, inOut(cleanSite(many)), []).stdout, /…and 10 more\./);
});

test('cli: --json prints the full result and keeps the exit code', (t) => {
  const files = inOut(cleanSite({ 'index.html': page({ title: null }) }));
  const { status, stdout } = cli(t, files, ['--json']);
  assert.equal(status, 1);
  const result = JSON.parse(stdout) as PreflightResult;
  assert.equal(result.dir, 'out');
  assert.deepEqual(result.pages, ['/index.html']);
  assert.deepEqual(result.problems, [{ check: 'title', page: '/index.html', message: 'no <title>' }]);
  assert.equal(cli(t, inOut(cleanSite()), ['--json']).status, 0);
});

test('cli: --expect-noindex and --forbid-noindex', (t) => {
  const open = inOut(cleanSite());
  assert.equal(cli(t, open, ['--forbid-noindex']).status, 0);
  const expect = cli(t, open, ['--expect-noindex']);
  assert.equal(expect.status, 1);
  assert.match(expect.stdout, /noindex \(1\)\n {2}\/index\.html: no noindex robots tag/);
  const hidden = inOut(cleanSite({ 'index.html': page({ head: '<meta name="robots" content="noindex">' }) }));
  assert.equal(cli(t, hidden, ['--expect-noindex']).status, 0);
  assert.match(cli(t, hidden, ['--forbid-noindex']).stdout, /has a noindex robots tag/);
  const both = cli(t, open, ['--expect-noindex', '--forbid-noindex']);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /cannot be used together/);
});

test('cli: --legacy-urls, --require-jsonld, --skip and --ignore', (t) => {
  const files = {
    ...inOut(cleanSite({ 'shop/mug.html': page(), _redirects: '/old-shop /shop/mug 301\n', 'draft.html': '<p>x</p>' })),
    'old.txt': '/old-shop\n/lost\n',
  };
  const result = cli(t, files, [
    '--legacy-urls',
    'old.txt',
    '--require-jsonld',
    'Product=/shop/*',
    '--skip',
    'title,description',
    '--skip',
    'h1',
    '--ignore',
    '/draft',
  ]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(
    result.stdout,
    `jsonld (1)
  /shop/mug.html: no Product JSON-LD

legacy-urls (1)
  old URL /lost has no page and no redirect

2 problems found. Checked 2 pages and 2 old URLs.
`,
  );
});

test('cli: --exclude, --share-tags, --trailing-slash, --site-url, --no-clean-urls, --redirects', (t) => {
  const files = {
    ...inOut(
      cleanSite({
        'index.html': page({ body: '<p>no h1</p><a href="/about/">a</a><a href="/about">b</a>' }),
        'about.html': page(),
      }),
    ),
    'rules.txt': '/gone /nowhere 301\n',
  };
  const out = (...args: string[]) => cli(t, files, args).stdout;
  assert.match(out(), /h1 elements/);
  assert.doesNotMatch(out('--exclude', 'h1=/'), /h1 elements/);
  assert.match(out('--share-tags', 'og:title,og:url'), /no og:url/);
  assert.match(out('--trailing-slash', 'forbid'), /link with a trailing slash: \/about\//);
  assert.match(out('--no-clean-urls'), /broken link \/about/);
  assert.match(out('--redirects', 'rules.txt'), /redirect \/gone goes to \/nowhere/);
  const absolute = inOut(
    cleanSite({ 'index.html': page({ body: '<h1>x</h1><a href="https://example.com/missing">x</a>' }) }),
  );
  assert.equal(cli(t, absolute, []).status, 0);
  assert.match(
    cli(t, absolute, ['--site-url', 'https://example.com']).stdout,
    /broken link https:\/\/example\.com\/missing/,
  );
});

test('cli: reads static-preflight.config.json from the working directory; flags win', (t) => {
  const files = {
    ...Object.fromEntries(
      Object.entries(cleanSite({ 'index.html': page({ title: null }) })).map(([k, v]) => [`build/${k}`, v]),
    ),
    'static-preflight.config.json': JSON.stringify({
      dir: 'build',
      skip: ['title'],
      noindex: 'expect',
      maxProblems: 5,
    }),
  };
  const fromConfig = cli(t, files, []);
  assert.equal(fromConfig.status, 1);
  assert.match(fromConfig.stdout, /^noindex \(1\)/);
  assert.doesNotMatch(fromConfig.stdout, /no <title>/);
  // --skip replaces the config's skip; --forbid-noindex replaces its noindex.
  const flags = cli(t, files, ['--skip', 'alt', '--forbid-noindex']);
  assert.equal(flags.stdout.match(/^(\w+) \(/gm)?.join(), 'title (');
  assert.equal(cli(t, files, ['--config', 'nope.json']).status, 2);
});

test('cli: a broken config file is a usage error', (t) => {
  const { status, stderr } = cli(t, { 'static-preflight.config.json': '{"nope": 1}', 'out/index.html': page() }, []);
  assert.equal(status, 2);
  assert.match(stderr, /unknown option "nope"/);
});

test('cli: usage errors exit 2 and say what is wrong', (t) => {
  const files = inOut(cleanSite());
  const cases: [string[], RegExp][] = [
    [['--nope'], /Unknown option '--nope'/],
    [['a', 'b'], /Expected one folder/],
    [['--skip', 'nope'], /Unknown check: nope/],
    [['--require-jsonld', 'Product'], /Invalid JSON-LD rule/],
    [['--max-problems', 'many'], /--max-problems must be/],
    [['--exclude', 'h1'], /--exclude expects check=pattern/],
    [['--trailing-slash', 'sometimes'], /trailingSlash must be/],
    [['--legacy-urls', 'missing.json'], /Cannot read the legacy URL list/],
    [['missing-folder'], /Folder not found: missing-folder/],
  ];
  for (const [args, message] of cases) {
    const { status, stderr, stdout } = cli(t, files, args);
    assert.equal(status, 2, args.join(' '));
    assert.equal(stdout, '');
    assert.match(stderr, message, args.join(' '));
  }
});

test('cli: an empty folder is a failure, not a pass', (t) => {
  const { status, stdout } = cli(t, { 'out/robots.txt': 'x' }, []);
  assert.equal(status, 1);
  assert.match(stdout, /^No HTML pages found in out/);
});

test('cli: --help and --version', (t) => {
  const help = cli(t, {}, ['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage: static-preflight \[dir\] \[options\]/);
  assert.match(help.stdout, /--expect-noindex[\s\S]*--forbid-noindex[\s\S]*--json/);
  const version = cli(t, {}, ['--version']);
  const { version: expected } = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, '../package.json'), 'utf8'),
  ) as {
    version: string;
  };
  assert.equal(version.stdout, `${expected}\n`);
});
