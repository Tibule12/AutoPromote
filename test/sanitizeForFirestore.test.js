const sanitize = require('../src/utils/sanitizeForFirestore');

describe('sanitizeForFirestore', () => {
  test('primitives are unchanged', () => {
    expect(sanitize('hello')).toBe('hello');
    expect(sanitize(1)).toBe(1);
    expect(sanitize(true)).toBe(true);
  });

  test('dates become ISO strings', () => {
    const d = new Date('2020-01-01T00:00:00Z');
    expect(sanitize(d)).toBe(d.toISOString());
  });

  test('maps become objects', () => {
    const m = new Map([['a', 1], ['b', 2]]);
    expect(sanitize(m)).toEqual({ a: 1, b: 2 });
  });

  test('sets become arrays', () => {
    const s = new Set([1, 2, 3]);
    expect(sanitize(s)).toEqual([1, 2, 3]);
  });

  test('removes functions and circular refs', () => {
    const obj = { a: 1, b: () => {} };
    const circular = { a: 1 };
    circular.self = circular;
    expect(sanitize(obj)).toEqual({ a: 1 });
    expect(sanitize(circular)).toEqual({ a: 1 });
  });

  test('class instances become plain objects', () => {
    class Foo { constructor(x) { this.x = x; this._hidden = () => {}; } }
    const f = new Foo(7);
    expect(sanitize(f)).toEqual({ x: 7 });
  });
});
