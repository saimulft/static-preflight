import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSite, messages, page, run } from './helpers.ts';

const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const product = ld({ '@context': 'https://schema.org', '@type': 'Product', name: 'Mug' });

test('jsonld: pages under the pattern need the type; other pages do not', (t) => {
  const result = run(
    t,
    cleanSite({
      'products/mug/index.html': page({ head: product }),
      'products/cup/index.html': page(),
      'products/index.html': page(),
      'about.html': page(),
    }),
    { requireJsonLd: [{ type: 'Product', pattern: '/products/*' }] },
  );
  assert.deepEqual(
    result.problems.map((p) => [p.check, p.page, p.message]),
    [['jsonld', '/products/cup/index.html', 'no Product JSON-LD']],
  );
});

test('jsonld: finds types in @graph, arrays, nested objects and prefixed names', (t) => {
  const pages = {
    'a.html': page({ head: ld({ '@graph': [{ '@type': 'Organization' }, { '@type': ['Thing', 'Product'] }] }) }),
    'b.html': page({ head: ld([{ '@type': 'WebPage', mainEntity: { '@type': 'https://schema.org/Product' } }]) }),
    'c.html': page({ head: ld({ '@type': 'schema:Product' }) }),
    'd.html': page({ head: ld({ '@type': 'Organization' }) }),
  };
  const result = run(t, cleanSite(pages), { requireJsonLd: ['Product=/*'] });
  assert.deepEqual(
    result.problems.map((p) => p.page).filter((name) => name !== '/index.html'),
    ['/d.html'],
  );
});

test('jsonld: the type attribute is matched loosely, a plain script is not JSON-LD', (t) => {
  const result = run(
    t,
    cleanSite({
      'a.html': page({ head: `<SCRIPT TYPE='application/ld+json; charset=utf-8'>{"@type":"Product"}</SCRIPT>` }),
      'b.html': page({ head: '<script>{"@type":"Product"}</script>' }),
    }),
    { requireJsonLd: ['Product=/*'] },
  );
  assert.deepEqual(
    result.problems.map((p) => p.page).filter((name) => name !== '/index.html'),
    ['/b.html'],
  );
});

test('jsonld: an unreadable block is reported even without rules', (t) => {
  const result = run(
    t,
    cleanSite({ 'index.html': page({ head: '<script type="application/ld+json">{"@type": "Product",}</script>' }) }),
  );
  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0]?.check, 'jsonld');
  assert.match(result.problems[0]?.message ?? '', /^JSON-LD block 1 is not valid JSON/);
});

test('jsonld: a missing type says when a block could not be read', (t) => {
  const result = run(
    t,
    cleanSite({ 'index.html': page({ head: '<script type="application/ld+json">{oops}</script>' }) }),
    { requireJsonLd: ['Product=/'] },
  );
  assert.deepEqual(messages(result, 'jsonld').slice(1), ['no Product JSON-LD (1 JSON-LD block could not be read)']);
});

test('jsonld: rules in string form are validated', (t) => {
  for (const rule of ['Product', '=/x/*', 'Product=products', 'Pro duct=/x']) {
    assert.throws(() => run(t, cleanSite(), { requireJsonLd: [rule] }), /Invalid JSON-LD rule/, rule);
  }
});

test('jsonld: can be skipped', (t) => {
  const result = run(t, cleanSite(), { requireJsonLd: ['Product=/*'], skip: ['jsonld'] });
  assert.deepEqual(result.problems, []);
});
