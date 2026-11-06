import assert from 'node:assert/strict';
import { fmtTime, withTime } from './common.js';

assert.equal(fmtTime(0), '0:00');
assert.equal(fmtTime(65000), '1:05');
assert.equal(fmtTime(599999), '9:59');
assert.equal(fmtTime(3725000), '1:02:05');

assert.equal(
  withTime('Umriss 6. Nov.\n3/6\nhttps://x', 83000),
  'Umriss 6. Nov.\n3/6\n⏱ 1:23\nhttps://x'
);
assert.equal(withTime('a\nurl', 500), 'a\nurl');
assert.equal(withTime('a\nurl', undefined), 'a\nurl');

console.log('alles ok');
