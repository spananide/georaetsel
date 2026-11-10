import assert from 'node:assert/strict';
import { PUZZLES } from '../data/wabe.js';
import {
  RANKS,
  puzzleFor,
  pointsOf,
  newRound,
  submit,
  finish,
  scoreOf,
  rankOf,
  shuffleOuter,
  shareText,
} from './logic.js';

// 1. Invariants for ALL puzzles in PUZZLES
assert.equal(PUZZLES.length, 365, 'PUZZLES must have 365 entries');

for (let idx = 0; idx < PUZZLES.length; idx++) {
  const [lettersStr, wordsStr] = PUZZLES[idx];
  // 7 distinct letters
  assert.equal(lettersStr.length, 7, `Puzzle ${idx}: letters must have length 7`);
  const letterSet = new Set([...lettersStr]);
  assert.equal(letterSet.size, 7, `Puzzle ${idx}: letters must have 7 distinct letters`);

  const center = lettersStr[0];
  const words = wordsStr.split(' ');

  // 20 <= word count <= 70
  assert.ok(words.length >= 20 && words.length <= 70, `Puzzle ${idx}: word count ${words.length} out of range [20, 70]`);

  // Words unique
  assert.equal(new Set(words).size, words.length, `Puzzle ${idx}: words must be unique`);

  let pangramCount = 0;
  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const word = words[wIdx];
    // Every word has >= 4 letters
    assert.ok(word.length >= 4, `Puzzle ${idx}: word "${word}" has < 4 letters`);
    // Only the puzzle's letters
    for (const ch of word) {
      assert.ok(letterSet.has(ch), `Puzzle ${idx}: word "${word}" contains foreign letter "${ch}"`);
    }
    // Contains the centre
    assert.ok(word.includes(center), `Puzzle ${idx}: word "${word}" missing center letter "${center}"`);
    // Words sorted alphabetically
    if (wIdx > 0) {
      assert.ok(words[wIdx - 1] < word, `Puzzle ${idx}: words not sorted ("${words[wIdx - 1]}" >= "${word}")`);
    }
    // Pangram check
    if (new Set(word).size === 7) {
      pangramCount++;
    }
  }

  // At least one pangram
  assert.ok(pangramCount >= 1, `Puzzle ${idx}: must have at least one pangram`);
}

// 2. puzzleFor deterministic and different for consecutive days
const pToday = puzzleFor(20261110, 'daily');
const pTodayAgain = puzzleFor(20261110, 'daily');
assert.equal(pToday, pTodayAgain, 'puzzleFor should return memoised/identical puzzle for same seed/mode');
assert.equal(pToday.center, pTodayAgain.center);

const pTomorrow = puzzleFor(20261111, 'daily');
assert.notEqual(pToday.letters.join(''), pTomorrow.letters.join(''), 'puzzleFor should differ for consecutive days');

// Practice mode determinism per seed
const pPrac1 = puzzleFor(42, 'practice');
const pPrac2 = puzzleFor(42, 'practice');
assert.deepEqual(pPrac1.letters, pPrac2.letters, 'Practice puzzle must be deterministic per seed');

// 3. submit for every result code (built from a real puzzle)
{
  const r = newRound(20261110, 'daily');
  const p = puzzleFor(r.seed, r.mode);

  // 'short'
  assert.deepEqual(submit(r, 'ABC'), { result: 'short', points: 0 });
  assert.deepEqual(submit(r, ''), { result: 'short', points: 0 });

  // 'badletter'
  assert.deepEqual(submit(r, 'XYZQ'), { result: 'badletter', points: 0 });

  // 'nocenter'
  const outerWord = (p.outer[0] + p.outer[1] + p.outer[2] + p.outer[0]).toUpperCase();
  assert.deepEqual(submit(r, outerWord), { result: 'nocenter', points: 0 });

  // 'notword' (contains center and valid letters, >= 4 letters, but not in wordSet)
  const nonWord = p.center.repeat(4);
  assert.ok(!p.wordSet.has(nonWord));
  assert.deepEqual(submit(r, nonWord), { result: 'notword', points: 0 });

  // 'ok' (non-pangram word in wordSet)
  const nonPangram = p.words.find(w => !p.pangrams.includes(w));
  assert.ok(nonPangram);
  const ptsExpected = nonPangram.length === 4 ? 1 : nonPangram.length;
  assert.deepEqual(submit(r, nonPangram), { result: 'ok', points: ptsExpected });
  assert.ok(r.found.includes(nonPangram));
  assert.equal(r.pangram, false);

  // 'known' (submitting the same word again)
  assert.deepEqual(submit(r, nonPangram), { result: 'known', points: 0 });

  // 'pangram' (valid pangram word)
  const pangramWord = p.pangrams[0];
  assert.ok(pangramWord);
  const pangramPts = pangramWord.length + 7;
  assert.deepEqual(submit(r, pangramWord), { result: 'pangram', points: pangramPts });
  assert.ok(r.found.includes(pangramWord));
  assert.equal(r.pangram, true);

  // 'ignored' when round is not playing
  finish(r);
  assert.equal(r.state, 'done');
  assert.deepEqual(submit(r, p.words[0]), { result: 'ignored', points: 0 });
}

// 4. Points calculation
{
  const pMock = { pangrams: ['PANGRAM'], letters: ['P','A','N','G','R','M','S'] };
  assert.equal(pointsOf('TEST', pMock), 1, '4 letters = 1 point');
  assert.equal(pointsOf('TESTE', pMock), 5, '5 letters = 5 points');
  assert.equal(pointsOf('TESTEN', pMock), 6, '6 letters = 6 points');
  assert.equal(pointsOf('PANGRAM', pMock), 14, '7-letter pangram = 7 + 7 = 14 points');
  assert.equal(pointsOf('PANGRAMS', { pangrams: ['PANGRAMS'], letters: ['P','A','N','G','R','M','S'] }), 15, '8-letter pangram = 8 + 7 = 15 points');
}

// 5. rankOf thresholds
{
  const r = newRound(20261110, 'daily');
  const p = puzzleFor(r.seed, r.mode);
  const total = p.total;

  const expectedRanks = [
    { pct: 0, name: 'Anfänger' },
    { pct: 5, name: 'Guter Start' },
    { pct: 10, name: 'Wird besser' },
    { pct: 20, name: 'Solide' },
    { pct: 30, name: 'Gut' },
    { pct: 45, name: 'Toll' },
    { pct: 60, name: 'Fabelhaft' },
    { pct: 75, name: 'Genie' },
    { pct: 100, name: 'Alle Wörter' },
  ];

  for (let i = 0; i < expectedRanks.length; i++) {
    assert.equal(RANKS[i].pct, expectedRanks[i].pct);
    assert.equal(RANKS[i].name, expectedRanks[i].name);

    const targetScore = Math.ceil(total * expectedRanks[i].pct / 100);
    r.found = new Array(targetScore).fill('AAAA');
    const res = rankOf(r);
    assert.equal(res.name, expectedRanks[i].name);
    assert.equal(res.index, i);
    if (i < expectedRanks.length - 1) {
      assert.equal(res.next, Math.ceil(total * expectedRanks[i + 1].pct / 100));
    } else {
      assert.equal(res.next, null);
    }

    if (i > 0 && targetScore > 0) {
      r.found = new Array(targetScore - 1).fill('AAAA');
      const prevRes = rankOf(r);
      assert.equal(prevRes.index, i - 1);
    }
  }
}

// 6. auto-done when all words are found
{
  const r = newRound(20261110, 'daily');
  const p = puzzleFor(r.seed, r.mode);
  for (const word of p.words) {
    submit(r, word);
  }
  assert.equal(r.found.length, p.words.length);
  assert.equal(r.state, 'done');
  assert.equal(rankOf(r).name, 'Alle Wörter');
  assert.equal(rankOf(r).index, 8);
}

// 7. finish
{
  const r = newRound(20261110, 'daily');
  assert.equal(r.state, 'playing');
  finish(r);
  assert.equal(r.state, 'done');
}

// 8. shuffleOuter
{
  const r = newRound(20261110, 'daily');
  const initial = [...r.order];
  assert.equal(r.order.length, 6);
  shuffleOuter(r);
  assert.equal(r.order.length, 6);
  assert.deepEqual([...r.order].sort(), [...initial].sort());
}

// 9. shareText
{
  const r = newRound(20261110, 'daily');
  const p = puzzleFor(r.seed, r.mode);
  submit(r, p.words[0]);
  const text = shareText(r, '10. Nov.', 'https://geo.spanani.de/wabe/');
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'Wabe 10. Nov.');
  assert.ok(lines[1].includes('von ' + p.words.length + ' Wörtern'));
  assert.ok(lines[1].includes('Punkte'));
  assert.equal(lines[2], 'https://geo.spanani.de/wabe/');
}

console.log('alles ok');
