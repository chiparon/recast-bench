const assert = require('assert');
const utils = require('../lib/cjs/utils');

suite('utils extra suite', function () {
  test('escapeXML should escape all 5 XML special characters', function () {
    const raw = '& < > " \'';
    const expected = '&amp; &lt; &gt; &#34; &#39;';
    assert.strictEqual(utils.escapeXML(raw), expected);
  });

  test('escapeXML handles empty, null, undefined and numbers', function () {
    assert.strictEqual(utils.escapeXML(''), '');
    assert.strictEqual(utils.escapeXML(null), '');
    assert.strictEqual(utils.escapeXML(undefined), '');
    assert.strictEqual(utils.escapeXML(12345), '12345');
    assert.strictEqual(utils.escapeXML(0), '0');
  });

  test('escapeRegExpChars escapes all regex meta characters', function () {
    const meta = '|\\{}()[].^$+*?';
    const escaped = utils.escapeRegExpChars(meta);
    assert.strictEqual(escaped, '\\|\\\\\\{\\}\\(\\)\\[\\]\\.\\^\\$\\+\\*\\?');
  });

  test('cache full lifecycle set, get, remove, reset', function () {
    utils.cache.reset();
    utils.cache.set('key1', 'val1');
    assert.strictEqual(utils.cache.get('key1'), 'val1');
    utils.cache.set('key2', 'val2');
    assert.strictEqual(utils.cache.get('key2'), 'val2');
    utils.cache.remove('key1');
    assert.strictEqual(utils.cache.get('key1'), undefined);
    assert.strictEqual(utils.cache.get('key2'), 'val2');
    utils.cache.reset();
    assert.strictEqual(utils.cache.get('key2'), undefined);
  });

  test('shallowCopy copies properties and overwrites existing', function () {
    const target = { a: 1, b: 2 };
    const src = { b: 20, c: 30 };
    const res = utils.shallowCopy(target, src);
    assert.strictEqual(res, target);
    assert.strictEqual(target.a, 1);
    assert.strictEqual(target.b, 20);
    assert.strictEqual(target.c, 30);
  });

  test('shallowCopyFromList copies only listed keys', function () {
    const target = { a: 1 };
    const src = { b: 2, c: 3, d: 4 };
    const res = utils.shallowCopyFromList(target, src, ['b', 'd', 'nonexistent']);
    assert.strictEqual(res, target);
    assert.strictEqual(target.a, 1);
    assert.strictEqual(target.b, 2);
    assert.strictEqual(target.c, undefined);
    assert.strictEqual(target.d, 4);
  });

  test('hyphenToCamel converts hyphenated strings to camelCase', function () {
    assert.strictEqual(utils.hyphenToCamel('data-user-id'), 'dataUserId');
    assert.strictEqual(utils.hyphenToCamel('output-file'), 'outputFile');
    assert.strictEqual(utils.hyphenToCamel('open-delimiter'), 'openDelimiter');
    assert.strictEqual(utils.hyphenToCamel('simple'), 'simple');
  });

  test('hasOwn checks object own property accurately', function () {
    const parent = { inherited: true };
    const child = Object.create(parent);
    child.own = 42;
    assert.strictEqual(utils.hasOwn(child, 'own'), true);
    assert.strictEqual(utils.hasOwn(child, 'inherited'), false);
    assert.strictEqual(utils.hasOwn(child, 'missing'), false);
  });
});
