// node tools/test-geo.mjs
// Prüfskript für die generierten Daten in data/geo.js und data/world.js.
import assert from 'node:assert/strict';
import { COUNTRIES } from '../georaetsel/data/countries.js';
import { GEO } from '../data/geo.js';
import { VIEWBOX, SHAPES } from '../data/world.js';

// 1. Prüfung von COUNTRIES und GEO
assert.equal(COUNTRIES.length, 197, 'COUNTRIES muss genau 197 Einträge haben');
const knownIds = new Set(COUNTRIES.map(c => c.id));

for (const c of COUNTRIES) {
  const g = GEO[c.id];
  assert.ok(g, `Fehlender Eintrag in GEO für ${c.id}`);
  assert.ok(typeof g.c === 'string' && g.c.length > 0, `Leere Hauptstadt für ${c.id}`);
  assert.ok(Number.isFinite(g.lat), `Nicht-endlicher Breitengrad für ${c.id}`);
  assert.ok(Number.isFinite(g.lng), `Nicht-endlicher Längengrad für ${c.id}`);
  assert.ok(Array.isArray(g.b), `Nachbarliste muss ein Array sein für ${c.id}`);
  assert.ok(!g.b.includes(c.id), `Nachbarliste darf nicht die eigene ID enthalten für ${c.id}`);

  // Nur bekannte IDs
  for (const n of g.b) {
    assert.ok(knownIds.has(n), `Unbekannte Nachbar-ID ${n} bei ${c.id}`);
  }
}

// Symmetrie der Grenzen prüfen
for (const c of COUNTRIES) {
  for (const n of GEO[c.id].b) {
    assert.ok(GEO[n].b.includes(c.id), `Grenze zwischen ${c.id} und ${n} ist nicht symmetrisch`);
  }
}

// Spezifische Hauptstädte und Nachbarn
assert.equal(GEO.de.c, 'Berlin', 'GEO.de.c muss Berlin sein');
assert.equal(GEO.fr.c, 'Paris', 'GEO.fr.c muss Paris sein');
assert.equal(GEO.at.c, 'Wien', 'GEO.at.c muss Wien sein');
assert.equal(GEO.ch.c, 'Bern', 'GEO.ch.c muss Bern sein');
assert.equal(GEO.jp.c, 'Tokio', 'GEO.jp.c muss Tokio sein');

assert.equal(GEO.de.b.length, 9, 'GEO.de.b muss genau 9 Einträge haben');
for (const id of ['at', 'fr', 'pl']) {
  assert.ok(GEO.de.b.includes(id), `GEO.de.b muss ${id} enthalten`);
}
assert.deepEqual(GEO.pt.b, ['es'], 'GEO.pt.b muss [es] sein');

// 2. Prüfung von SHAPES und VIEWBOX
assert.equal(VIEWBOX, '0 0 1000 487', 'VIEWBOX muss 0 0 1000 487 sein');

const shapeCount = Object.keys(SHAPES).length;
assert.ok(shapeCount >= 175, `Mindestens 175 Länder müssen eine Form haben, gefunden: ${shapeCount}`);

for (const [id, s] of Object.entries(SHAPES)) {
  assert.ok(knownIds.has(id), `Form hat unbekannte ID ${id}`);
  assert.ok(typeof s.d === 'string', `Pfad muss ein String sein für ${id}`);
  assert.ok(s.d.startsWith('M'), `Pfad für ${id} muss mit M beginnen`);
  assert.ok(s.d.endsWith('Z'), `Pfad für ${id} muss mit Z enden`);

  assert.ok(Array.isArray(s.box) && s.box.length === 4, `Box für ${id} muss 4 Werte haben`);
  const [x0, y0, x1, y1] = s.box;
  assert.ok(x0 >= -5 && y0 >= -5 && x1 <= 1005 && y1 <= 492, `Box für ${id} liegt außerhalb: ${s.box}`);
  assert.ok(x0 <= x1 && y0 <= y1, `Box für ${id} ist invertiert: ${s.box}`);
}

// Pflichtländer müssen eine Form haben
const required = ['de', 'fr', 'us', 'ru', 'br', 'au', 'jp', 'cn', 'in', 'za', 'eg', 'mx', 'ar', 'id', 'it', 'gb', 'ie', 'nz', 'is', 'kr'];
for (const r of required) {
  assert.ok(SHAPES[r], `Pflichtland ${r} hat keine Form`);
}

// Bounding Box Geometrie-Prüfungen
const ruWidth = SHAPES.ru.box[2] - SHAPES.ru.box[0];
assert.ok(ruWidth > 150, `Russland-Box muss breiter als 150 sein, ist: ${ruWidth}`);

assert.ok(
  SHAPES.de.box[0] >= 440 && SHAPES.de.box[2] <= 560,
  `Deutschland-Box muss zwischen x 440 und 560 liegen, ist: [${SHAPES.de.box[0]}, ${SHAPES.de.box[2]}]`
);

// Informationelle Ausgabe fehlender Formen
const missingShapes = COUNTRIES.filter(c => !SHAPES[c.id]).map(c => c.id);
console.log(`Länder ohne Form (${missingShapes.length}): ${missingShapes.join(' ') || '(keine)'}`);

console.log('alles ok');
