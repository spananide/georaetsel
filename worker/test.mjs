import assert from 'node:assert/strict';
import { GAMES, cleanName, nameKey, cleanAnswer, dayOk, cleanResult } from './logic.js';

// GAMES array check
assert.equal(GAMES.length, 16);
assert.ok(GAMES.includes('georaetsel'));
assert.ok(GAMES.includes('tiefsee'));

// cleanName
assert.equal(cleanName(''), null);
assert.equal(cleanName('a'), null);
assert.equal(cleanName('12345678901234567'), null);
assert.equal(cleanName('ab'), 'ab');
assert.equal(cleanName('1234567890123456'), '1234567890123456');
assert.equal(cleanName('bad@name'), null);
assert.equal(cleanName('hello!'), null);
assert.equal(cleanName('  Alice   Bob  '), 'Alice Bob');
assert.equal(cleanName('\tAlice\nBob\t'), 'Alice Bob');
assert.equal(cleanName('Jürgen'), 'Jürgen');
assert.equal(cleanName('Ärzte'), 'Ärzte');
assert.equal(cleanName('user_name-1.0'), 'user_name-1.0');
assert.equal(cleanName(null), null);
assert.equal(cleanName(undefined), null);
assert.equal(cleanName(123), null);

// nameKey case-insensitivity
assert.equal(nameKey('Alice'), 'alice');
assert.equal(nameKey('ALICE'), 'alice');
assert.equal(nameKey('alice'), 'alice');
assert.equal(nameKey('Alice') === nameKey('ALICE'), true);
assert.equal(nameKey('Jürgen'), 'jürgen');
assert.equal(nameKey('JÜRGEN'), 'jürgen');
assert.equal(nameKey('  Alice   Bob  '), 'alice bob');
assert.equal(nameKey('!bad!'), null);

// cleanAnswer
assert.equal(cleanAnswer('  berlin  '), 'berlin');
assert.equal(cleanAnswer('BERLIN'), 'berlin');
assert.equal(cleanAnswer('  new   york  '), 'new york');
assert.equal(cleanAnswer('...berlin!?'), 'berlin');
assert.equal(cleanAnswer('«paris»'), 'paris');
assert.equal(cleanAnswer('"rome"'), 'rome');
assert.equal(cleanAnswer('-tokyo-'), 'tokyo');
assert.equal(cleanAnswer('st. gallen'), 'st. gallen');
assert.equal(cleanAnswer('washington, d.c.'), 'washington, d.c');
assert.equal(cleanAnswer(''), null);
assert.equal(cleanAnswer('???'), null);
assert.equal(cleanAnswer('a'.repeat(40)), 'a'.repeat(40));
assert.equal(cleanAnswer('a'.repeat(41)), null);
assert.equal(cleanAnswer(null), null);

// dayOk
const refTime = Date.UTC(2026, 10, 10, 12, 0, 0); // 2026-11-10
assert.equal(dayOk('2026-11-10', refTime), true);
assert.equal(dayOk('2026-11-09', refTime), true);
assert.equal(dayOk('2026-11-11', refTime), true);
assert.equal(dayOk('2026-11-12', refTime), false);
assert.equal(dayOk('2026-11-08', refTime), false);
assert.equal(dayOk('2026-13-45', refTime), false);
assert.equal(dayOk('2026-02-29', refTime), false);
assert.equal(dayOk('not-a-date', refTime), false);
assert.equal(dayOk('', refTime), false);
assert.equal(dayOk(null, refTime), false);
assert.equal(dayOk('2024-02-29', Date.UTC(2024, 1, 29)), true);

// cleanResult
const validBody = {
  name: 'Alice',
  day: '2026-11-10',
  game: 'georaetsel',
  mode: 'daily',
  tries: 5,
  won: true,
  ms: 12345
};

// valid daily
const validRes = cleanResult(validBody, refTime);
assert.equal(validRes.ok, true);
assert.deepEqual(validRes.r, {
  name: 'Alice',
  key: 'alice',
  day: '2026-11-10',
  game: 'georaetsel',
  mode: 'daily',
  tries: 5,
  won: 1,
  ms: 12345
});

// unknown game
const unknownGameRes = cleanResult({ ...validBody, game: 'space-invaders' }, refTime);
assert.equal(unknownGameRes.ok, false);
assert.equal(typeof unknownGameRes.error, 'string');

// bad mode
const badModeRes = cleanResult({ ...validBody, mode: 'ranked' }, refTime);
assert.equal(badModeRes.ok, false);
assert.equal(typeof badModeRes.error, 'string');

// tries 100
const tries100Res = cleanResult({ ...validBody, tries: 100 }, refTime);
assert.equal(tries100Res.ok, false);
assert.equal(typeof tries100Res.error, 'string');

// tries boundary
assert.equal(cleanResult({ ...validBody, tries: 0 }, refTime).ok, true);
assert.equal(cleanResult({ ...validBody, tries: 99 }, refTime).ok, true);
assert.equal(cleanResult({ ...validBody, tries: -1 }, refTime).ok, false);

// won as true -> 1
const wonTrueRes = cleanResult({ ...validBody, won: true }, refTime);
assert.equal(wonTrueRes.ok, true);
assert.equal(wonTrueRes.r.won, 1);

// won as false -> 0
const wonFalseRes = cleanResult({ ...validBody, won: false }, refTime);
assert.equal(wonFalseRes.ok, true);
assert.equal(wonFalseRes.r.won, 0);

// won numbers
assert.equal(cleanResult({ ...validBody, won: 1 }, refTime).r.won, 1);
assert.equal(cleanResult({ ...validBody, won: 0 }, refTime).r.won, 0);
assert.equal(cleanResult({ ...validBody, won: 2 }, refTime).ok, false);
assert.equal(cleanResult({ ...validBody, won: 'true' }, refTime).ok, false);

// missing ms becomes 0
const missingMsRes = cleanResult({
  name: 'Alice',
  day: '2026-11-10',
  game: 'georaetsel',
  mode: 'daily',
  tries: 5,
  won: 1
}, refTime);
assert.equal(missingMsRes.ok, true);
assert.equal(missingMsRes.r.ms, 0);

// practice mode
assert.equal(cleanResult({ ...validBody, mode: 'practice' }, refTime).ok, true);

// invalid body
assert.equal(cleanResult(null, refTime).ok, false);

console.log('ok');
