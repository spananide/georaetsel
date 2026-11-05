// node test.mjs
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { COUNTRIES } from './data/countries.js';
import { CATEGORIES } from './categories.js';
import { dailySeed, pickBoard, answersFor, points, solve, newGame, guess, score, tier, shareText, search, byId, bestBoard } from './game.js';

const C = id => byId(id);
const has = (id, tag) => C(id).tags.includes(tag);
const cat = id => CATEGORIES.find(c => c.id === id);

// Daten
assert.equal(COUNTRIES.length, 197);
assert.equal(new Set(COUNTRIES.map(c => c.name)).size, 197);
for (const c of COUNTRIES) {
  assert.ok(existsSync(`assets/flags/${c.id}.svg`), c.id);
  assert.ok(c.pop > 0 && c.area > 0 && c.density > 0, `Zahlen fehlen: ${c.id}`);
  assert.ok(c.flag.colors.length >= 1, `Flagge fehlt: ${c.id}`);
  for (const f of c.flag.colors) assert.ok(['red', 'white', 'blue', 'green', 'yellow', 'black'].includes(f), `${c.id} ${f}`);
}
assert.equal(C('de').name, 'Deutschland');
assert.equal(C('cd').name, 'Demokratische Republik Kongo');
assert.equal(C('cg').name, 'Republik Kongo');
assert.equal(C('de').continent, 'Europa');
assert.ok(C('de').pop > 80 && C('de').pop < 90);
assert.ok(C('it').heritage >= 55 && C('li').heritage === 0);
for (const t of ['eu', 'nato', 'g20']) assert.ok(has('de', t), t);
assert.ok(!has('ch', 'eu') && !has('at', 'nato') && has('se', 'nato') && has('fi', 'nato'));
assert.ok(has('mt', 'island') && has('is', 'island') && !has('de', 'island'));
assert.ok(C('mn').landlocked && C('at').landlocked && !C('de').landlocked);
assert.ok(has('gb', 'drivesLeft') && has('jp', 'drivesLeft') && !has('de', 'drivesLeft'));
assert.ok(has('br', 'wonWC') && has('de', 'wonWC') && !has('nl', 'wonWC'));
assert.deepEqual([...C('de').flag.colors].sort(), ['black', 'red', 'yellow']);
assert.ok(C('ch').flag.cross && C('tr').flag.crescent && C('al').flag.animal && C('es').flag.emblem && C('jp').flag.star);
assert.ok(!C('de').flag.cross && !C('fr').flag.star && !C('fr').flag.emblem);

// Kategorien
assert.ok(CATEGORIES.length >= 100, `nur ${CATEGORIES.length} Kategorien`);
assert.equal(new Set(CATEGORIES.map(c => c.id)).size, CATEGORIES.length);
for (const c of CATEGORIES) {
  const n = COUNTRIES.filter(c.test).length;
  assert.ok(n >= 8, `${c.id} passt nur auf ${n} Länder`);
  assert.ok(c.label && c.group, c.id);
}
assert.ok(cat('letterD').test(C('de')) && !cat('letterG').test(C('de')));
assert.ok(cat('letterO').test(C('at')), 'Österreich zählt als O');
assert.ok(cat('letterA').test(C('eg')), 'Ägypten zählt als A');
assert.ok(cat('endsLand').test(C('de')) && cat('endsIen').test(C('it')) && cat('endsStan').test(C('pk')));
assert.ok(cat('hasUmlaut').test(C('at')) && !cat('hasUmlaut').test(C('de')));
assert.ok(cat('len11').test(C('de')), 'Deutschland hat 11 Buchstaben: gehört zu 10 oder mehr');

// Tagesrätsel: 2 Jahre lang gültig und lösbar
const seed = dailySeed(new Date(2026, 10, 5));
assert.equal(seed, 20261105);
assert.deepEqual(pickBoard(seed), pickBoard(seed));
const seen = new Set();
for (let i = 0; i < 730; i++) {
  const s = dailySeed(new Date(2026, 10, 5 + i));
  const { rows, cols } = pickBoard(s);
  seen.add([...rows, ...cols].join());
  const all = [...rows, ...cols];
  assert.equal(all.length, 6);
  assert.equal(new Set(all.map(id => cat(id).group)).size, 6, `Gruppen doppelt: ${s}`);
  for (const r of rows) for (const c of cols) assert.ok(answersFor(r, c).length >= 3, `${s} ${r} ${c}`);
  assert.ok(solve(rows.flatMap(r => cols.map(c => answersFor(r, c).map(x => ({ id: x.id, pts: 1 }))))), `nicht lösbar: ${s}`);
}
assert.ok(seen.size > 700, 'Rätsel wiederholen sich');

// Punkte: Einwohnerrang, großes Land 5, kleinstes 100
const three = [{ id: 'a', pop: 100 }, { id: 'b', pop: 10 }, { id: 'c', pop: 1 }];
assert.equal(points(three, 'a'), 5);
assert.equal(points(three, 'b'), 53);
assert.equal(points(three, 'c'), 100);
assert.equal(tier(5), 'tief'); assert.equal(tier(29), 'tief');
assert.equal(tier(30), 'huegel'); assert.equal(tier(79), 'huegel');
assert.equal(tier(80), 'hoch'); assert.equal(tier(100), 'hoch');

// Lösen: Land nur einmal, höchste Summe
assert.equal(solve([[{ id: 'a', pts: 1 }], [{ id: 'a', pts: 1 }]]), null);
const s2 = solve([[{ id: 'a', pts: 10 }, { id: 'b', pts: 5 }], [{ id: 'a', pts: 9 }]]);
assert.equal(s2.total, 14);
assert.deepEqual(s2.picks.map(p => p.id), ['b', 'a']);
const s3 = solve([[{ id: 'a', pts: 10 }, { id: 'b', pts: 5 }], [{ id: 'a', pts: 2 }, { id: 'c', pts: 2 }]]);
assert.equal(s3.total, 12);
assert.deepEqual(s3.picks.map(p => p.id), ['a', 'c']);

// Spielablauf
const g = newGame(seed);
assert.equal(g.guessesLeft, 12);
assert.equal(g.cells.length, 9);
assert.deepEqual(JSON.parse(JSON.stringify(g)), g, 'Spielstand muss JSON-fest sein');
const right0 = answersFor(g.rows[0], g.cols[0])[0];
const wrong0 = COUNTRIES.find(c => !answersFor(g.rows[0], g.cols[0]).includes(c));
assert.equal(guess(g, 0, wrong0.id).result, 'wrong');
assert.equal(g.guessesLeft, 11);
assert.equal(guess(g, 0, wrong0.id).result, 'repeat', 'Gleicher Fehler kostet nichts');
assert.equal(g.guessesLeft, 11);
const r = guess(g, 0, right0.id);
assert.equal(r.result, 'right');
assert.equal(r.pts, points(answersFor(g.rows[0], g.cols[0]), right0.id));
assert.equal(g.guessesLeft, 10);
assert.equal(score(g), r.pts);
assert.equal(guess(g, 1, right0.id).result, 'used', 'Land nur einmal');
assert.equal(g.guessesLeft, 10);
assert.equal(guess(g, 0, right0.id).result, 'filled');
while (g.guessesLeft > 0) {
  const i = g.cells.findIndex(c => !c);
  const bad = COUNTRIES.find(c => !answersFor(g.rows[Math.floor(i / 3)], g.cols[i % 3]).includes(c) && !g.wrong[i].includes(c.id));
  assert.equal(guess(g, i, bad.id).result, 'wrong');
}
assert.equal(g.over, true);
assert.equal(guess(g, 5, COUNTRIES[0].id).result, 'over');

const best = bestBoard(newGame(seed));
assert.equal(best.picks.length, 9);
assert.equal(new Set(best.picks.map(p => p.id)).size, 9);
assert.ok(best.total >= 9 * 5);

// Teilen
const sh = newGame(seed);
sh.cells[0] = { id: 'de', pts: 10 };
sh.cells[4] = { id: 'fr', pts: 50 };
sh.cells[8] = { id: 'it', pts: 90 };
assert.equal(shareText(sh, '5. Nov.', 'https://x.test'),
  'GeoRätsel 5. Nov.\n3/9 Felder, 150 Punkte\n\n🟩🟦🟦\n🟦🟨🟦\n🟦🟦🟫\n\nhttps://x.test');

// Suche
const first = q => search(q)[0]?.country.id;
for (const [q, id] of [['oesterreich', 'at'], ['osterreich', 'at'], ['Österreich', 'at'], ['Holland', 'nl'], ['birma', 'mm'],
  ['Burma', 'mm'], ['Elfenbeinküste', 'ci'], ['elfenbeinkueste', 'ci'], ['USA', 'us'], ['England', 'gb'], ['UK', 'gb'], ['Weißrussland', 'by'],
  ['weissrussland', 'by'], ['Tschechei', 'cz'], ['Deutsch', 'de'], ['moldawien', 'md'], ['Swasiland', 'sz']]) {
  assert.equal(first(q), id, q);
}
assert.equal(search('').length, 0);
assert.ok(search('a').length <= 8);
assert.equal(search('Holland')[0].via, 'Holland');
assert.equal(search('Niederlande')[0].via, null);

console.log('alles ok');
