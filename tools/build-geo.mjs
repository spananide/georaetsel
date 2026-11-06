// node tools/build-geo.mjs [--refresh]
// Erstellt data/geo.js und data/world.js für Geografie-Spiele.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { COUNTRIES } from '../georaetsel/data/countries.js';

const REFRESH = process.argv.includes('--refresh');

mkdirSync('tools/cache', { recursive: true });
mkdirSync('data', { recursive: true });

// HTTP-Abruf mit Cache und Wiederholung wie in build-data.mjs
async function cached(file, fetchFn) {
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let i = 1; ; i++) {
    try {
      const data = await fetchFn();
      writeFileSync(file, JSON.stringify(data));
      return data;
    } catch (e) {
      if (i === 3) throw new Error(`${file}: ${e.message}`);
    }
  }
}

// 1. Rohdaten laden
const mledoze = JSON.parse(readFileSync('georaetsel/tools/cache/countries.json', 'utf8'));

const topo = await cached('tools/cache/world-50m.json', async () => {
  const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json', {
    signal: AbortSignal.timeout(90000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

const wikiQuery = `SELECT ?iso ?de ?en WHERE { ?c wdt:P297 ?iso; wdt:P31 wd:Q3624078; wdt:P36 ?cap. ?cap rdfs:label ?de. FILTER(LANG(?de) = "de") OPTIONAL { ?cap rdfs:label ?en. FILTER(LANG(?en) = "en") } }`;
const wikiBindings = await cached('tools/cache/wikidata-capitals.json', async () => {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(wikiQuery)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'georaetsel-build/1.0' },
    signal: AbortSignal.timeout(90000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.results.bindings;
});

// 2. geo.js erstellen
const cca2ToMle = new Map(mledoze.map(c => [c.cca2.toLowerCase(), c]));

// cca3 -> id Map für alle Länder in COUNTRIES (Kosovo ist XKX)
const cca3ToId = new Map();
for (const c of COUNTRIES) {
  const mle = cca2ToMle.get(c.id);
  if (mle) {
    const cca3 = c.id === 'xk' ? 'XKX' : mle.cca3;
    cca3ToId.set(cca3, c.id);
  }
}

// Wikidata-Treffer nach ISO gruppieren
const wikiByIso = new Map();
for (const b of wikiBindings) {
  const iso = b.iso?.value?.toLowerCase();
  if (!iso) continue;
  if (!wikiByIso.has(iso)) wikiByIso.set(iso, []);
  wikiByIso.get(iso).push({ de: b.de?.value, en: b.en?.value });
}

const mehrdeutig = [];
const ohneDeutschenNamen = [];
const round2 = v => v == null ? null : +v.toFixed(2);
const GEO = {};
// Von Hand korrigiert: englische Reste, Mehrdeutiges, deutsche Schreibweise
const CAPITAL_FIX = { dk: 'Kopenhagen', ye: 'Sanaa', ki: 'Tarawa', gq: 'Malabo', tm: 'Aschgabat', ag: 'Saint John’s' };

for (const country of COUNTRIES) {
  const id = country.id;
  const mle = cca2ToMle.get(id);
  if (!mle) throw new Error(`mledoze-Eintrag fehlt für ${id}`);

  const rows = wikiByIso.get(id) || [];
  let capital = null;

  if (rows.length === 1) {
    capital = rows[0].de;
  } else if (rows.length > 1) {
    const mleCap = mle.capital?.[0];
    let match = null;
    if (mleCap) {
      match = rows.find(r => r.en && r.en.toLowerCase() === mleCap.toLowerCase());
    }
    if (match) {
      capital = match.de;
    } else {
      const sorted = rows.slice().sort((a, b) => (a.de || '').localeCompare(b.de || ''));
      capital = sorted[0].de;
      mehrdeutig.push(id);
    }
  } else {
    capital = mle.capital?.[0] || '';
    ohneDeutschenNamen.push(id);
  }

  GEO[id] = {
    c: CAPITAL_FIX[id] ?? capital,
    lat: round2(mle.latlng[0]),
    lng: round2(mle.latlng[1]),
    b: []
  };
}

// Nachbarschaften symmetrisch und alphabetisch sortiert aufbauen
const adj = new Map(COUNTRIES.map(c => [c.id, new Set()]));
for (const country of COUNTRIES) {
  const mle = cca2ToMle.get(country.id);
  const borders = mle.borders || [];
  for (const cca3 of borders) {
    const neighbourId = cca3ToId.get(cca3);
    if (neighbourId && neighbourId !== country.id) {
      adj.get(country.id).add(neighbourId);
      adj.get(neighbourId).add(country.id);
    }
  }
}
for (const country of COUNTRIES) {
  GEO[country.id].b = [...adj.get(country.id)].sort();
}

const geoLines = Object.entries(GEO).map(([id, val]) => `  ${id}: ${JSON.stringify(val)},`);
writeFileSync('data/geo.js', `export const GEO = {\n${geoLines.join('\n')}\n};\n`);

if (mehrdeutig.length > 0) {
  console.log(`Mehrdeutige Hauptstädte (${mehrdeutig.length}): ${mehrdeutig.join(' ')}`);
}
if (ohneDeutschenNamen.length > 0) {
  console.log(`Ohne deutschen Namen / kein Wikidata-Treffer (${ohneDeutschenNamen.length}): ${ohneDeutschenNamen.join(' ')}`);
}

// 3. world.js erstellen
// TopoJSON Dekodierung: Arcs delta-dekodieren und transformieren
const { scale, translate } = topo.transform;
const decodedArcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});

function getArc(i) {
  if (i >= 0) return decodedArcs[i];
  return decodedArcs[~i].slice().reverse();
}

// Equal Earth Projektion und Skalierung auf SVG ViewBox (1000 x 487)
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
const s = 1000 / 5.4132;

function project(lon, lat) {
  const lam = lon * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  const th = Math.asin(Math.sqrt(3) / 2 * Math.sin(phi));
  const th2 = th * th;
  const th6 = th2 * th2 * th2;
  const th8 = th6 * th2;
  const num = 2 * Math.sqrt(3) * lam * Math.cos(th);
  const den = 3 * (9 * A4 * th8 + 7 * A3 * th6 + 3 * A2 * th2 + A1);
  const x = num / den;
  const y = th * (A1 + A2 * th2 + th6 * (A3 + A4 * th2));
  const X = (x + 2.7066) * s;
  const Y = (1.3173 - y) * s;
  return [X, Y];
}

// Ringe aus Arcs zusammensetzen, doppelte Verbindungspunkte entfernen
function unwrapRing(pts) {
  let offset = 0;
  return pts.map(([lon, lat], i) => {
    if (i > 0) {
      const diff = lon - pts[i - 1][0];
      if (diff > 180) offset -= 360;
      else if (diff < -180) offset += 360;
    }
    return [lon + offset, lat];
  });
}

function decodeGeometry(geom) {
  const rawRings = geom.type === 'Polygon' ? geom.arcs : geom.arcs.flat();
  return rawRings.map(ringArcs => {
    const pts = [];
    for (let j = 0; j < ringArcs.length; j++) {
      const arcPts = getArc(ringArcs[j]);
      if (j === 0) pts.push(...arcPts);
      else pts.push(...arcPts.slice(1));
    }
    // Längengrade vor der Projektion entfalten (Anti-Meridian)
    const unwrapped = unwrapRing(pts);
    return unwrapped.map(([lon, lat]) => project(lon, lat));
  });
}

function pointToSegmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function douglasPeucker(pts, tol) {
  if (pts.length <= 2) return pts;
  let maxDist = 0;
  let maxIdx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointToSegmentDistance(pts[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > tol) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), tol);
    const right = douglasPeucker(pts.slice(maxIdx), tol);
    return left.slice(0, left.length - 1).concat(right);
  }
  return [a, b];
}

function getBbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, area: (maxX - minX) * (maxY - minY) };
}

// ccn3 -> id Zuordnung
const ccn3ToId = new Map();
for (const c of COUNTRIES) {
  const mle = cca2ToMle.get(c.id);
  if (mle && mle.ccn3) {
    ccn3ToId.set(String(mle.ccn3).padStart(3, '0'), c.id);
  }
}

// Geometrien nach Länder-ID gruppieren
const ringsByCountry = new Map();
for (const g of topo.objects.countries.geometries) {
  let id = null;
  if (g.id) {
    id = ccn3ToId.get(String(g.id).padStart(3, '0'));
  } else if (g.properties?.name === 'Kosovo') {
    id = 'xk';
  }
  if (!id) continue;
  if (!ringsByCountry.has(id)) ringsByCountry.set(id, []);
  ringsByCountry.get(id).push(...decodeGeometry(g));
}

const round1 = v => +v.toFixed(2); // zwei Nachkommastellen, trotz Namen

function buildShapes(dpTolerance) {
  const SHAPES = {};
  for (const [id, rings] of ringsByCountry.entries()) {
    let maxArea = -1;
    let maxIdx = 0;
    const bboxes = rings.map((r, i) => {
      const b = getBbox(r);
      if (b.area > maxArea) {
        maxArea = b.area;
        maxIdx = i;
      }
      return b;
    });

    const keptRings = [];
    for (let i = 0; i < rings.length; i++) {
      const b = bboxes[i];
      const isSmall = b.w < 0.4 && b.h < 0.4;
      if (!isSmall || i === maxIdx) {
        // kleine Länder feiner vereinfachen, sonst sehen Umrisse wie Albanien eckig aus
        const tol = Math.max(0.01, Math.min(dpTolerance, 0.004 * Math.max(bboxes[maxIdx].w, bboxes[maxIdx].h)));
        let simp = douglasPeucker(rings[i], tol);
        if (simp.length < 4) simp = rings[i];
        keptRings.push(simp);
      }
    }

    if (keptRings.length === 0) continue;

    let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
    let hasXOver1000 = false;
    let hasXUnder0 = false;
    const dParts = [];
    for (const r of keptRings) {
      const pts = r.map(([x, y]) => [round1(x), round1(y)]);
      for (const [x, y] of pts) {
        if (x < cMinX) cMinX = x;
        if (x > cMaxX) cMaxX = x;
        if (y < cMinY) cMinY = y;
        if (y > cMaxY) cMaxY = y;
        if (x > 1000) hasXOver1000 = true;
        if (x < 0) hasXUnder0 = true;
      }
      dParts.push('M ' + pts.map(p => `${p[0]} ${p[1]}`).join(' L ') + ' Z');
    }

    const shapeObj = {
      d: dParts.join(' '),
      box: [round1(cMinX), round1(cMinY), round1(cMaxX), round1(cMaxY)]
    };

    if (hasXOver1000 || id === 'ru') shapeObj.wrap = 1;
    else if (hasXUnder0) shapeObj.wrap = -1;

    SHAPES[id] = shapeObj;
  }
  return SHAPES;
}

let tolerance = 0.1;
let SHAPES = buildShapes(tolerance);
let sortedShapes = Object.fromEntries(Object.entries(SHAPES).sort(([a], [b]) => a.localeCompare(b)));
let shapeLines = Object.entries(sortedShapes).map(([id, val]) => `  ${id}: ${JSON.stringify(val)},`);
let worldContent = `export const VIEWBOX = '0 0 1000 487';\nexport const SHAPES = {\n${shapeLines.join('\n')}\n};\n`;
let sizeKB = +(Buffer.byteLength(worldContent, 'utf8') / 1024).toFixed(1);

while (sizeKB > 1100) {
  tolerance = +(tolerance + 0.02).toFixed(2);
  SHAPES = buildShapes(tolerance);
  sortedShapes = Object.fromEntries(Object.entries(SHAPES).sort(([a], [b]) => a.localeCompare(b)));
  shapeLines = Object.entries(sortedShapes).map(([id, val]) => `  ${id}: ${JSON.stringify(val)},`);
  worldContent = `export const VIEWBOX = '0 0 1000 487';\nexport const SHAPES = {\n${shapeLines.join('\n')}\n};\n`;
  sizeKB = +(Buffer.byteLength(worldContent, 'utf8') / 1024).toFixed(1);
}

writeFileSync('data/world.js', worldContent);

const shapeCount = Object.keys(SHAPES).length;
const missingShapes = COUNTRIES.filter(c => !SHAPES[c.id]).map(c => c.id);
const wrappedIds = Object.keys(SHAPES).filter(id => SHAPES[id].wrap !== undefined);
console.log(`Formen vorhanden: ${shapeCount} von ${COUNTRIES.length}`);
console.log(`Länder ohne Form (${missingShapes.length}): ${missingShapes.join(' ') || '(keine)'}`);
console.log(`Länder mit wrap (${wrappedIds.length}): ${wrappedIds.join(' ') || '(keine)'}`);
console.log(`Dateigröße data/world.js: ${sizeKB} KB (Toleranz: ${tolerance})`);
