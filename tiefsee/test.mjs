import assert from 'node:assert/strict';
import { QUESTIONS } from '../data/tiefsee.js';
import {
  questionsFor,
  normalizeAnswer,
  checkAnswer,
  seedWeight,
  depthFor,
  newRound,
  record,
  current,
  totalDepth,
  rarityText,
  shareText,
} from './logic.js';

// 1. normalizeAnswer
assert.equal(normalizeAnswer('Büffel'), 'büffel');
assert.equal(normalizeAnswer('  BÄR  '), 'bär');
assert.equal(normalizeAnswer('  biene   honig  '), 'biene honig');
assert.equal(normalizeAnswer('!Biber?...'), 'biber');
assert.equal(normalizeAnswer('„Bussard“'), 'bussard');
assert.equal(normalizeAnswer('«Barsch»'), 'barsch');
assert.equal(normalizeAnswer('mau-mau'), 'mau-mau');
assert.equal(normalizeAnswer('Löwe'), 'löwe');
assert.equal(normalizeAnswer('Ägypten'), 'ägypten');
assert.equal(normalizeAnswer('a'.repeat(41)), '');
assert.equal(normalizeAnswer('a'.repeat(40)), 'a'.repeat(40));
assert.equal(normalizeAnswer('   '), '');
assert.equal(normalizeAnswer('!?...'), '');
assert.equal(normalizeAnswer(null), '');
assert.equal(normalizeAnswer(123), '');

// 2. checkAnswer
assert.deepEqual(checkAnswer(0, 'b'), { ok: false, reason: 'short' });
assert.deepEqual(checkAnswer(0, '--'), { ok: false, reason: 'short' });
assert.deepEqual(checkAnswer(0, 'affe'), { ok: false, reason: 'starts' });
assert.deepEqual(checkAnswer(0, 'bär'), { ok: true, answer: 'bär' });
assert.deepEqual(checkAnswer(0, '  !Büffel. '), { ok: true, answer: 'büffel' });

const zeitIdx = QUESTIONS.findIndex(q => q.starts === 'zeit');
assert.ok(zeitIdx >= 0);
assert.deepEqual(checkAnswer(zeitIdx, 'zeitung'), { ok: true, answer: 'zeitung' });
assert.deepEqual(checkAnswer(zeitIdx, 'uhr'), { ok: false, reason: 'starts' });
assert.deepEqual(checkAnswer(zeitIdx, 'ze'), { ok: false, reason: 'short' });

const noStartsIdx = QUESTIONS.findIndex(q => !q.starts);
assert.ok(noStartsIdx >= 0);
assert.deepEqual(checkAnswer(noStartsIdx, 'erdbeere'), { ok: true, answer: 'erdbeere' });

// 3. seedWeight ranks
const expectedWeights = [30, 22, 16, 12, 9, 7, 5, 4];
for (let i = 0; i < expectedWeights.length; i++) {
  assert.equal(seedWeight(0, QUESTIONS[0].seeds[i]), expectedWeights[i]);
}
assert.equal(seedWeight(0, 'unbekanntestier'), 0);

// 4. depthFor
// Monotonic (rarer = deeper)
const d0 = depthFor(0, QUESTIONS[0].seeds[0], 10, 10);
const d1 = depthFor(0, QUESTIONS[0].seeds[1], 10, 10);
const d4 = depthFor(0, QUESTIONS[0].seeds[4], 10, 10);
const dUnknown = depthFor(0, 'unbekanntestier', 10, 10);
assert.ok(d0 <= d1);
assert.ok(d1 <= d4);
assert.ok(d4 <= dUnknown);

// Within 0..33
assert.ok(d0 >= 0 && d0 <= 33);
assert.ok(dUnknown >= 0 && dUnknown <= 33);
assert.ok(depthFor(0, 'x', 0, 0) >= 0 && depthFor(0, 'x', 0, 0) <= 33);

// Common seed answer shallow (< 8)
const shallowDepth = depthFor(0, QUESTIONS[0].seeds[0], 50, 50);
assert.ok(shallowDepth < 8);

// Unknown answer deep (> 20) with n=0 and with n=1, total=1
const deepZero = depthFor(0, 'unbekanntestier', 0, 0);
assert.ok(deepZero > 20);
const deepOne = depthFor(0, 'unbekanntestier', 1, 1);
assert.ok(deepOne > 20);

// 5. questionsFor
const qDaily1 = questionsFor(20261110, 'daily');
const qDaily1Again = questionsFor(20261110, 'daily');
assert.deepEqual(qDaily1, qDaily1Again);
assert.equal(new Set(qDaily1).size, 3);

const qDaily2 = questionsFor(20261111, 'daily');
assert.notDeepEqual(qDaily1, qDaily2);
assert.equal(new Set(qDaily2).size, 3);

const qPractice1 = questionsFor(999, 'practice');
const qPractice1Again = questionsFor(999, 'practice');
assert.deepEqual(qPractice1, qPractice1Again);
assert.equal(new Set(qPractice1).size, 3);

// 6. record rules and automatic 'done'
const r = newRound(20261110, 'daily');
assert.equal(r.state, 'playing');
assert.equal(current(r), 0);

record(r, 0, { answer: 'bär', n: 1, total: 1, depth: 8 });
assert.equal(r.state, 'playing');
assert.equal(current(r), 1);
assert.equal(r.answers[0].answer, 'bär');

// Ignore duplicate answer for question 0
record(r, 0, { answer: 'biene', n: 1, total: 1, depth: 10 });
assert.equal(r.answers[0].answer, 'bär');

record(r, 1, { answer: 'münchen', n: 1, total: 1, depth: 8 });
assert.equal(r.state, 'playing');
assert.equal(current(r), 2);

record(r, 2, { answer: 'kirsche', n: 1, total: 1, depth: 15 });
assert.equal(r.state, 'done');
assert.equal(current(r), 3);

// Ignore recording when done
record(r, 1, { answer: 'mainz', n: 1, total: 1, depth: 12 });
assert.equal(r.answers[1].answer, 'münchen');

// 7. totalDepth
assert.equal(totalDepth(r), 31);
assert.equal(totalDepth(null), 0);
assert.equal(totalDepth({ answers: [null, null, null] }), 0);

// 8. rarityText
assert.equal(rarityText({ depth: 10, n: 0, total: 0 }, 'practice'), 'Gegen die Standardantworten gemessen.');
assert.equal(rarityText({ depth: 5, n: 8, total: 10 }, 'daily'), 'Eine beliebte Antwort.');
assert.equal(rarityText({ depth: 25, n: 1, total: 10 }, 'daily'), 'Nur du hast das geantwortet.');
assert.equal(rarityText({ depth: 15, n: 3, total: 10 }, 'daily'), 'Nur 3 von 10 Spielern haben das geantwortet.');

// 9. shareText
const share = shareText(r, '10. Nov.', 'https://geo.spanani.de/tiefsee/');
const shareLines = share.split('\n');
assert.equal(shareLines[0], 'Tiefsee 10. Nov.');
assert.equal(shareLines[1], '31 m tief');
assert.equal(shareLines[shareLines.length - 1], 'https://geo.spanani.de/tiefsee/');
assert.ok(share.includes('8 m'));
assert.ok(share.includes('15 m'));
assert.ok(share.includes('🟦'));

console.log('alles ok');
