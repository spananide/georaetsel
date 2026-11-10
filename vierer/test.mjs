import assert from 'node:assert/strict';
import {
  PUZZLES,
  ORDER,
  puzzleFor,
  newRound,
  toggleSelect,
  shuffle,
  deselect,
  submit,
  shareText,
} from './logic.js';

// 1. All puzzles: 4 groups x 4 words, 16 unique words, levels 0..3
assert.equal(Array.isArray(PUZZLES), true);
assert.equal(PUZZLES.length, 24);
for (const [idx, p] of PUZZLES.entries()) {
  assert.equal(p.length, 4, `Puzzle ${idx} has 4 groups`);
  const wordsInPuzzle = [];
  for (let lvl = 0; lvl < 4; lvl++) {
    const [name, words] = p[lvl];
    assert.equal(typeof name, 'string', `Puzzle ${idx} group ${lvl} name is string`);
    assert.ok(name.length > 0, `Puzzle ${idx} group ${lvl} has non-empty name`);
    assert.equal(Array.isArray(words), true);
    assert.equal(words.length, 4, `Puzzle ${idx} group ${lvl} has 4 words`);
    for (const w of words) {
      assert.equal(typeof w, 'string');
      assert.ok(w.length > 0);
      wordsInPuzzle.push(w);
    }
  }
  assert.equal(wordsInPuzzle.length, 16);
  assert.equal(new Set(wordsInPuzzle).size, 16, `Puzzle ${idx} words are unique`);
}

// 2. ORDER is a permutation of 0..23
assert.equal(ORDER.length, 24);
assert.equal(new Set(ORDER).size, 24);
for (let i = 0; i < 24; i++) {
  assert.ok(ORDER.includes(i), `ORDER includes ${i}`);
}

// 3. puzzleFor deterministic and different on consecutive days
const p1 = puzzleFor(20261110, 'daily');
const p1Again = puzzleFor(20261110, 'daily');
assert.equal(p1, p1Again, 'Memoisation returns exact same instance for identical call');
assert.equal(p1.groups.length, 4);
for (let i = 0; i < 4; i++) {
  assert.equal(p1.groups[i].level, i, `Group ${i} has level ${i}`);
}

const p2 = puzzleFor(20261111, 'daily');
assert.notDeepEqual(p1.groups[0].words, p2.groups[0].words, 'Consecutive days have different puzzles');

// Practice mode puzzle
const pPractice = puzzleFor(12345, 'practice');
assert.equal(pPractice.groups.length, 4);
assert.equal(pPractice.groups[0].words.length, 4);

// 4. newRound order is a permutation of the 16 words and deterministic per seed
const r1 = newRound(20261110, 'daily');
const r1Again = newRound(20261110, 'daily');
assert.deepEqual(r1.order, r1Again.order, 'Deterministic order per seed');
assert.equal(r1.order.length, 16);
assert.equal(new Set(r1.order).size, 16, 'All 16 words present and unique');
const allPuzzleWords = p1.groups.flatMap(g => g.words);
for (const w of allPuzzleWords) {
  assert.ok(r1.order.includes(w), `Word ${w} in round order`);
}
assert.deepEqual(r1.selected, []);
assert.deepEqual(r1.solved, []);
assert.deepEqual(r1.guesses, []);
assert.equal(r1.mistakes, 0);
assert.equal(r1.state, 'playing');
assert.equal(r1.ms, 0);

// 5. toggleSelect limits
const rToggle = newRound(20261110, 'daily');
const [w0, w1, w2, w3, w4] = rToggle.order;

toggleSelect(rToggle, w0);
assert.deepEqual(rToggle.selected, [w0]);
toggleSelect(rToggle, w0);
assert.deepEqual(rToggle.selected, [], 'Toggling selected word removes it');

toggleSelect(rToggle, w0);
toggleSelect(rToggle, w1);
toggleSelect(rToggle, w2);
toggleSelect(rToggle, w3);
assert.equal(rToggle.selected.length, 4);
toggleSelect(rToggle, w4);
assert.equal(rToggle.selected.length, 4, 'Fifth selection is ignored');
assert.ok(!rToggle.selected.includes(w4));

// Ignored when word not in order
toggleSelect(rToggle, 'NonExistentWord');
assert.equal(rToggle.selected.length, 4);

// deselect clears
deselect(rToggle);
assert.deepEqual(rToggle.selected, []);

// shuffle keeps all words
const beforeShuffle = [...rToggle.order];
shuffle(rToggle);
assert.equal(rToggle.order.length, 16);
assert.equal(new Set(rToggle.order).size, 16);
for (const w of beforeShuffle) {
  assert.ok(rToggle.order.includes(w));
}

// 6. submit: incomplete / correct / oneaway / wrong / repeat
const rSub = newRound(20261110, 'daily');
const pSub = puzzleFor(20261110, 'daily');

// Incomplete (< 4 selected)
toggleSelect(rSub, rSub.order[0]);
assert.deepEqual(submit(rSub, pSub), { result: 'incomplete' });
deselect(rSub);

// Group 0 words
const g0Words = pSub.groups[0].words;
const g1Words = pSub.groups[1].words;

// Oneaway: 3 from g0, 1 from g1
toggleSelect(rSub, g0Words[0]);
toggleSelect(rSub, g0Words[1]);
toggleSelect(rSub, g0Words[2]);
toggleSelect(rSub, g1Words[0]);
const oneAwayRes = submit(rSub, pSub);
assert.deepEqual(oneAwayRes, { result: 'oneaway' });
assert.equal(rSub.mistakes, 1);
assert.equal(rSub.guesses.length, 1);
assert.deepEqual(rSub.selected.length, 4, 'Selection kept after non-ending mistake');

// Repeat: same 4 words in different selection order
deselect(rSub);
toggleSelect(rSub, g1Words[0]);
toggleSelect(rSub, g0Words[2]);
toggleSelect(rSub, g0Words[1]);
toggleSelect(rSub, g0Words[0]);
const repeatRes = submit(rSub, pSub);
assert.deepEqual(repeatRes, { result: 'repeat' });
assert.equal(rSub.mistakes, 1, 'No penalty for repeat');
assert.equal(rSub.guesses.length, 1, 'Guesses not appended for repeat');

// Wrong: 2 from g0, 2 from g1
deselect(rSub);
toggleSelect(rSub, g0Words[0]);
toggleSelect(rSub, g0Words[1]);
toggleSelect(rSub, g1Words[0]);
toggleSelect(rSub, g1Words[1]);
const wrongRes = submit(rSub, pSub);
assert.deepEqual(wrongRes, { result: 'wrong' });
assert.equal(rSub.mistakes, 2);
assert.equal(rSub.guesses.length, 2);

// Correct: all 4 from g0
deselect(rSub);
for (const w of g0Words) toggleSelect(rSub, w);
const correctRes = submit(rSub, pSub);
assert.deepEqual(correctRes, { result: 'correct', level: 0 });
assert.deepEqual(rSub.solved, [0]);
assert.equal(rSub.order.length, 12);
for (const w of g0Words) {
  assert.ok(!rSub.order.includes(w), 'Solved words removed from order');
}
assert.deepEqual(rSub.selected, [], 'Selection cleared after correct');
assert.equal(rSub.guesses.length, 3);
assert.deepEqual(rSub.guesses[2], [0, 0, 0, 0]);

// 7. Solving all four groups -> 'won'
const rWin = newRound(20261110, 'daily');
const pWin = puzzleFor(20261110, 'daily');
for (let lvl = 0; lvl < 4; lvl++) {
  const gWords = pWin.groups[lvl].words;
  for (const w of gWords) toggleSelect(rWin, w);
  const res = submit(rWin, pWin);
  assert.deepEqual(res, { result: 'correct', level: lvl });
}
assert.equal(rWin.state, 'won');
assert.equal(rWin.solved.length, 4);
assert.equal(rWin.order.length, 0);
assert.equal(rWin.mistakes, 0);

// 8. Four mistakes -> 'lost' with the rest revealed
const rLose = newRound(20261110, 'daily');
const pLose = puzzleFor(20261110, 'daily');

// First solve group 0 to check partial solve before loss
for (const w of pLose.groups[0].words) toggleSelect(rLose, w);
submit(rLose, pLose);
assert.deepEqual(rLose.solved, [0]);

// Mistake 1
toggleSelect(rLose, pLose.groups[1].words[0]);
toggleSelect(rLose, pLose.groups[1].words[1]);
toggleSelect(rLose, pLose.groups[2].words[0]);
toggleSelect(rLose, pLose.groups[3].words[0]);
submit(rLose, pLose);
assert.equal(rLose.mistakes, 1);
assert.equal(rLose.state, 'playing');

// Mistake 2
deselect(rLose);
toggleSelect(rLose, pLose.groups[1].words[0]);
toggleSelect(rLose, pLose.groups[1].words[1]);
toggleSelect(rLose, pLose.groups[2].words[1]);
toggleSelect(rLose, pLose.groups[3].words[0]);
submit(rLose, pLose);
assert.equal(rLose.mistakes, 2);
assert.equal(rLose.state, 'playing');

// Mistake 3
deselect(rLose);
toggleSelect(rLose, pLose.groups[1].words[0]);
toggleSelect(rLose, pLose.groups[1].words[1]);
toggleSelect(rLose, pLose.groups[2].words[2]);
toggleSelect(rLose, pLose.groups[3].words[0]);
submit(rLose, pLose);
assert.equal(rLose.mistakes, 3);
assert.equal(rLose.state, 'playing');

// Mistake 4 (ends game)
deselect(rLose);
toggleSelect(rLose, pLose.groups[1].words[0]);
toggleSelect(rLose, pLose.groups[1].words[1]);
toggleSelect(rLose, pLose.groups[2].words[3]);
toggleSelect(rLose, pLose.groups[3].words[0]);
submit(rLose, pLose);
assert.equal(rLose.mistakes, 4);
assert.equal(rLose.state, 'lost');
assert.deepEqual(rLose.missed, [1, 2, 3], 'Missed levels recorded');
assert.deepEqual(rLose.solved, [0, 1, 2, 3], 'All groups revealed in solved');
assert.deepEqual(rLose.selected, [], 'Selection cleared when lost');
assert.equal(rLose.order.length, 0);

// 9. shareText for a win and a loss
const url = 'https://geo.spanani.de/vierer/';

// Win without mistakes
const winShare = shareText(rWin, '10. Nov.', url);
const winLines = winShare.split('\n');
assert.equal(winLines[0], 'Vierer 10. Nov.');
assert.equal(winLines[1], '🟨🟨🟨🟨');
assert.equal(winLines[2], '🟩🟩🟩🟩');
assert.equal(winLines[3], '🟦🟦🟦🟦');
assert.equal(winLines[4], '🟪🟪🟪🟪');
assert.equal(winLines[5], 'Fehlerfrei');
assert.equal(winLines[6], url);

// Win with mistakes
rSub.mistakes = 2;
const subShare = shareText(rSub, 'Übung', url);
assert.ok(subShare.includes('2 Fehler'));

// Loss share
const loseShare = shareText(rLose, '10. Nov.', url);
const loseLines = loseShare.split('\n');
assert.equal(loseLines[0], 'Vierer 10. Nov.');
// 1 correct + 4 mistakes = 5 guesses in share
assert.equal(loseLines.length, 1 + 5 + 1 + 1);
assert.equal(loseLines[loseLines.length - 2], '4 Fehler');
assert.equal(loseLines[loseLines.length - 1], url);

console.log('alles ok');
