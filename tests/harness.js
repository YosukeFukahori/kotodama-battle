// 依存なしの最小テストハーネス。ブラウザ（tests/index.html）と Node（tests/run.js）の両方で動く。

const registered = [];

export function test(name, fn) {
  registered.push({ name, fn });
}

class AssertionError extends Error {}

function show(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

export const assert = {
  equal(actual, expected, message) {
    if (!Object.is(actual, expected)) {
      throw new AssertionError(`${message ? message + ': ' : ''}expected ${show(expected)}, got ${show(actual)}`);
    }
  },
  deepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new AssertionError(`${message ? message + ': ' : ''}expected ${e}, got ${a}`);
    }
  },
  ok(value, message) {
    if (!value) throw new AssertionError(message ?? `expected truthy, got ${show(value)}`);
  },
  notOk(value, message) {
    if (value) throw new AssertionError(message ?? `expected falsy, got ${show(value)}`);
  },
};

export async function runAll() {
  const results = [];
  for (const { name, fn } of registered) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error?.message ?? String(error) });
    }
  }
  return results;
}
