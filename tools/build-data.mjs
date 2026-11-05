// node tools/build-data.mjs [--refresh]
// Rohantworten liegen in tools/cache, damit der Build ohne Netz wiederholbar bleibt.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const REFRESH = process.argv.includes('--refresh');
const manual = JSON.parse(readFileSync('tools/manual.json', 'utf8'));
const heritage = JSON.parse(readFileSync('tools/heritage.json', 'utf8'));

async function cached(name, url, headers = {}) {
  const file = `tools/cache/${name}.json`;
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(90000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      writeFileSync(file, JSON.stringify(data));
      return data;
    } catch (e) {
      if (i === 3) throw new Error(`${name}: ${e.message}`);
    }
  }
}

const worldBank = async id => {
  const [, rows] = await cached(id, `https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&mrnev=1&per_page=400`);
  return Object.fromEntries(rows.filter(r => r.value != null).map(r => [r.countryiso3code, r.value]));
};
const sparql = async (name, query) => {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
  const data = await cached(name, url, { Accept: 'application/sparql-results+json', 'User-Agent': 'georaetsel-build/1.0' });
  return data.results.bindings;
};

const raw = await cached('countries', 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json');
const [popWB, gdpWB, renewWB] = await Promise.all(['SP.POP.TOTL', 'NY.GDP.PCAP.CD', 'EG.FEC.RNEW.ZS'].map(worldBank));

const capital = {};
for (const b of await sparql('capital', 'SELECT ?iso (MAX(?p) AS ?pop) WHERE { ?c wdt:P297 ?iso; wdt:P31 wd:Q3624078; wdt:P36 ?cap. ?cap wdt:P1082 ?p } GROUP BY ?iso'))
  capital[b.iso.value.toLowerCase()] = +b.pop.value;

const hdi = {}, hdiDate = {};
for (const b of await sparql('hdi', 'SELECT ?iso ?hdi ?date WHERE { ?c wdt:P297 ?iso; wdt:P31 wd:Q3624078; p:P1081 ?st. ?st ps:P1081 ?hdi. OPTIONAL { ?st pq:P585 ?date } }')) {
  const id = b.iso.value.toLowerCase(), date = b.date?.value ?? '';
  if (!(id in hdi) || date > hdiDate[id]) { hdi[id] = +b.hdi.value; hdiDate[id] = date; }
}

const CONTINENT = { Europe: 'Europa', Asia: 'Asien', Africa: 'Afrika', Americas: 'Amerika', Oceania: 'Ozeanien' };
const COLOR = { r: 'red', w: 'white', b: 'blue', g: 'green', y: 'yellow', k: 'black' };
const round = (v, d) => v == null ? null : +v.toFixed(d);

const picked = raw.filter(c => c.unMember || ['PS', 'XK', 'TW'].includes(c.cca2));
const known = new Set(picked.map(c => c.cca2.toLowerCase()));
const sets = Object.fromEntries(Object.entries(manual.sets).map(([k, v]) => [k, new Set(v.split(' '))]));
for (const [k, s] of Object.entries(sets)) for (const id of s) if (!known.has(id)) throw new Error(`${k}: unbekannt ${id}`);
for (const part of ['names', 'aliases', 'overrides', 'flags']) for (const id of Object.keys(manual[part])) if (!known.has(id)) throw new Error(`${part}: unbekannt ${id}`);

const countries = picked.map(c => {
  const id = c.cca2.toLowerCase();
  const code = id === 'xk' ? 'XKX' : c.cca3;
  const over = manual.overrides[id] ?? {};
  const pop = over.pop ?? (popWB[code] != null ? popWB[code] / 1e6 : null);
  if (!pop || !c.area) throw new Error(`Einwohner oder Fläche fehlt: ${id}`);
  const spec = manual.flags[id];
  if (!spec) throw new Error(`Flagge fehlt: ${id}`);
  const [colors, symbols = ''] = spec.split('|');
  return {
    id,
    name: manual.names[id] ?? c.translations.deu.common,
    aliases: manual.aliases[id] ?? [],
    continent: CONTINENT[c.region],
    landlocked: id === 'xk' || c.landlocked,
    neighbours: over.neighbours ?? c.borders.length,
    pop: round(pop, pop < 1 ? 4 : 1),
    area: c.area < 10 ? c.area : Math.round(c.area),
    density: Math.round(pop * 1e6 / c.area) || 1,
    gdp: over.gdp ?? round(gdpWB[code], 0),
    hdi: over.hdi ?? round(hdi[id] ?? null, 3),
    renew: over.renew ?? round(renewWB[code] ?? null, 1),
    capPop: over.capPop ?? round(capital[id] != null ? capital[id] / 1e6 : null, 3),
    heritage: heritage[id] ?? 0,
    langs: Object.keys(c.languages ?? {}),
    flag: {
      colors: [...colors].map(k => COLOR[k]),
      star: symbols.includes('s'), animal: symbols.includes('a'), emblem: symbols.includes('e'),
      crescent: symbols.includes('c'), cross: symbols.includes('x'),
    },
    tags: Object.keys(sets).filter(k => sets[k].has(id)),
  };
});

writeFileSync('data/countries.js', `export const COUNTRIES=${JSON.stringify(countries)};\n`);
console.log(`${countries.length} Länder`);
for (const f of ['gdp', 'hdi', 'renew', 'capPop']) console.log(f, 'fehlt:', countries.filter(c => c[f] == null).map(c => c.id).join(' '));
