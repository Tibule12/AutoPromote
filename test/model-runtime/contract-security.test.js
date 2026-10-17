const test = require('node:test');
const assert = require('node:assert/strict');
const { request, validateOutput } = require('../../src/modelRuntime/contract');
const invalid = error => error.code === 'MODEL_CAPABILITY_REQUEST_INVALID' && !(error instanceof RangeError);

test('prototype-named and unknown capabilities are rejected without dynamic dispatch', () => {
  for (const capability of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'unknown', null, {}]) {
    assert.throws(() => request({ capability, parameters: {} }), invalid);
    assert.throws(() => validateOutput(capability, {}), e => e.code === 'MODEL_CAPABILITY_OUTPUT_INVALID');
  }
});
test('deep and cyclic request/output graphs fail without stack exhaustion', () => {
  let deep = {};
  for (let i = 0; i < 12000; i++) deep = { child: deep };
  const cyclic = {}; cyclic.child = cyclic;
  for (const value of [deep, cyclic]) {
    assert.throws(() => request(value), invalid);
    assert.throws(() => validateOutput('understand_video', value), e => e.code === 'MODEL_CAPABILITY_OUTPUT_INVALID' && !(e instanceof RangeError));
  }
});
test('validation never invokes getters, toJSON or class instance methods', () => {
  let calls = 0;
  const getter = Object.defineProperty({}, 'capability', { enumerable: true, get() { calls++; throw Error('called'); } });
  const serializer = { toJSON() { calls++; throw Error('called'); } };
  class Input { toJSON() { calls++; throw Error('called'); } }
  for (const value of [getter, serializer, new Input(), { bad: Infinity }, { bad: NaN }]) assert.throws(() => request(value), invalid);
  assert.equal(calls, 0);
});
