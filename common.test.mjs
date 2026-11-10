import assert from 'node:assert/strict';
import {
  fmtTime,
  withTime,
  dayOf,
  getName,
  summarize,
  reportRound,
} from './common.js';

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

// dayOf tests
assert.equal(dayOf(new Date(2026, 10, 10)), '2026-11-10');
assert.equal(dayOf(new Date(2026, 0, 5)), '2026-01-05');
assert.equal(dayOf(20261110), '2026-11-10');
assert.equal(dayOf(20260105), '2026-01-05');

// summarize unknown & falsy
assert.equal(summarize('unknown', {}), null);
assert.equal(summarize('foobar', { over: true }), null);
assert.equal(summarize('georaetsel', null), null);
assert.equal(summarize('flaggen', undefined), null);

// summarize for each game id in over and not-over states
// 1. georaetsel
assert.deepEqual(
  summarize('georaetsel', { over: false, guessesLeft: 10, cells: [null, null] }),
  { over: false, tries: 2, won: false }
);
assert.deepEqual(
  summarize('georaetsel', { over: true, guessesLeft: 3, cells: [{}, {}, {}] }),
  { over: true, tries: 9, won: true }
);
assert.deepEqual(
  summarize('georaetsel', { over: true, guessesLeft: 0, cells: [{}, null, {}] }),
  { over: true, tries: 12, won: false }
);

// 2. flaggen
assert.deepEqual(
  summarize('flaggen', { state: 'asking', results: [{ pts: 3 }] }),
  { over: false, tries: 3, won: true }
);
assert.deepEqual(
  summarize('flaggen', { state: 'done', results: [{ pts: 3 }, { pts: 2 }, { pts: 0 }] }),
  { over: true, tries: 5, won: true }
);

// 3. hauptstaedte
assert.deepEqual(
  summarize('hauptstaedte', { state: 'asking', results: [{ ok: true }] }),
  { over: false, tries: 1, won: true }
);
assert.deepEqual(
  summarize('hauptstaedte', { state: 'done', results: [{ ok: true }, { ok: false }, { ok: true }] }),
  { over: true, tries: 2, won: true }
);

// 4. umriss
assert.deepEqual(
  summarize('umriss', { state: 'playing', guesses: ['DE'] }),
  { over: false, tries: 1, won: false }
);
assert.deepEqual(
  summarize('umriss', { state: 'won', guesses: ['DE', 'FR'] }),
  { over: true, tries: 2, won: true }
);
assert.deepEqual(
  summarize('umriss', { state: 'lost', guesses: ['DE', 'FR', 'IT'] }),
  { over: true, tries: 3, won: false }
);

// 5. laenderkette
assert.deepEqual(
  summarize('laenderkette', { state: 'playing', guesses: [{ id: 'DE', ok: true }] }),
  { over: false, tries: 1, won: false }
);
assert.deepEqual(
  summarize('laenderkette', { state: 'won', guesses: [{ id: 'DE', ok: true }] }),
  { over: true, tries: 1, won: true }
);
assert.deepEqual(
  summarize('laenderkette', { state: 'lost', guesses: [{ id: 'DE', ok: false }] }),
  { over: true, tries: 1, won: false }
);

// 6. heisskalt
assert.deepEqual(
  summarize('heisskalt', { state: 'playing', guesses: [{ id: 'DE' }] }),
  { over: false, tries: 1, won: false }
);
assert.deepEqual(
  summarize('heisskalt', { state: 'won', guesses: [{ id: 'DE' }] }),
  { over: true, tries: 1, won: true }
);
assert.deepEqual(
  summarize('heisskalt', { state: 'gave-up', guesses: [{ id: 'DE' }, { id: 'FR' }] }),
  { over: true, tries: 2, won: false }
);

// 7. mehr-weniger
assert.deepEqual(
  summarize('mehr-weniger', { over: false, streak: 4 }),
  { over: false, tries: 4, won: true }
);
assert.deepEqual(
  summarize('mehr-weniger', { over: true, streak: 6 }),
  { over: true, tries: 6, won: true }
);

// 8. woertel
assert.deepEqual(
  summarize('woertel', { state: 'playing', guesses: ['APFEL'] }),
  { over: false, tries: 1, won: false }
);
assert.deepEqual(
  summarize('woertel', { state: 'won', guesses: ['BIRNE', 'APFEL'] }),
  { over: true, tries: 2, won: true }
);
assert.deepEqual(
  summarize('woertel', { state: 'lost', guesses: ['A', 'B', 'C', 'D', 'E', 'F'] }),
  { over: true, tries: 6, won: false }
);

// 9. rechnel
assert.deepEqual(
  summarize('rechnel', { state: 'playing', guesses: ['12+35=47'] }),
  { over: false, tries: 1, won: false }
);
assert.deepEqual(
  summarize('rechnel', { state: 'won', guesses: ['10-2*3=4', '12+35=47'] }),
  { over: true, tries: 2, won: true }
);
assert.deepEqual(
  summarize('rechnel', { state: 'lost', guesses: ['1', '2', '3', '4', '5', '6'] }),
  { over: true, tries: 6, won: false }
);

// reportRound is a no-op without a name (does not throw in Node when getName() is empty)
assert.equal(getName(), '');
await reportRound('georaetsel', { over: true, guessesLeft: 10, cells: [] }, 'daily');
await reportRound('flaggen', { state: 'done', results: [] }, 'daily');
await reportRound('mehr-weniger', { over: true, streak: 5 }, 'practice');

console.log('alles ok');

