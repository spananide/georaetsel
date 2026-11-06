const base = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const letters = c => c.name.replace(/[^\p{L}]/gu, '').length;
const oneWord = c => !/[\s-]/.test(c.name);
const tag = t => c => c.tags.includes(t);
const num = (f, test) => c => c[f] != null && test(c[f]);
const color = k => c => c.flag.colors.includes(k);
const count = c => new Set(c.flag.colors).size;

const group = (group, list) => list.map(([id, label, test]) => ({ id, label, group, test }));

export const CATEGORIES = [
  ...group('continent', [
    ['inEuropa', 'In Europa', c => c.continent === 'Europa'],
    ['inAsien', 'In Asien', c => c.continent === 'Asien'],
    ['inAfrika', 'In Afrika', c => c.continent === 'Afrika'],
    ['inAmerika', 'In Amerika', c => c.continent === 'Amerika'],
    ['inOzeanien', 'In Ozeanien', c => c.continent === 'Ozeanien'],
  ]),
  ...group('geo', [
    ['island', 'Inselstaat', tag('island')],
    ['landlocked', 'Binnenland', c => c.landlocked],
    ['coast', 'Hat Meerzugang', c => !c.landlocked],
    ['noBorder', 'Keine Landgrenze', c => c.neighbours === 0],
  ]),
  ...group('neigh', [
    ['oneNeighbour', 'Genau ein Nachbarland', c => c.neighbours === 1],
    ['fiveNeighbours', '5 oder mehr Nachbarländer', c => c.neighbours >= 5],
  ]),
  ...group('area', [
    ['areaBig', 'Über 1 Mio. km²', c => c.area > 1e6],
    ['areaMid', '100.000 bis 1 Mio. km²', c => c.area >= 1e5 && c.area <= 1e6],
    ['areaSmall', 'Unter 100.000 km²', c => c.area < 1e5],
    ['areaTiny', 'Unter 1.000 km²', c => c.area < 1000],
  ]),
  ...group('pop', [
    ['pop100', 'Über 100 Mio. Einwohner', c => c.pop > 100],
    ['pop50', 'Über 50 Mio. Einwohner', c => c.pop > 50],
    ['pop10', 'Über 10 Mio. Einwohner', c => c.pop > 10],
    ['pop1to10', '1 bis 10 Mio. Einwohner', c => c.pop >= 1 && c.pop <= 10],
    ['popU5', 'Unter 5 Mio. Einwohner', c => c.pop < 5],
    ['popU1', 'Unter 1 Mio. Einwohner', c => c.pop < 1],
  ]),
  ...group('capital', [
    ['cap1', 'Hauptstadt über 1 Mio.', num('capPop', v => v > 1)],
    ['cap5', 'Hauptstadt über 5 Mio.', num('capPop', v => v > 5)],
    ['capSmall', 'Hauptstadt unter 100.000', num('capPop', v => v < 0.1)],
  ]),
  ...group('density', [
    ['densHigh', 'Über 200 Einw. pro km²', c => c.density > 200],
    ['densMid', '50 bis 200 Einw. pro km²', c => c.density >= 50 && c.density <= 200],
    ['densLow', 'Unter 20 Einw. pro km²', c => c.density < 20],
  ]),
  ...group('gdp', [
    ['gdpHigh', 'BIP pro Kopf über 40.000 $', num('gdp', v => v > 40000)],
    ['gdpMid', 'BIP pro Kopf 10.000 bis 40.000 $', num('gdp', v => v >= 10000 && v <= 40000)],
    ['gdpLowMid', 'BIP pro Kopf 2.000 bis 10.000 $', num('gdp', v => v >= 2000 && v < 10000)],
    ['gdpLow', 'BIP pro Kopf unter 2.000 $', num('gdp', v => v < 2000)],
  ]),
  ...group('hdi', [
    ['hdi90', 'HDI über 0,90', num('hdi', v => v > 0.9)],
    ['hdi80', 'HDI über 0,80', num('hdi', v => v > 0.8)],
    ['hdi55', 'HDI unter 0,55', num('hdi', v => v < 0.55)],
  ]),
  ...group('renew', [
    ['renewHigh', 'Über 60 % erneuerbare Energie', num('renew', v => v > 60)],
    ['renewLow', 'Unter 10 % erneuerbare Energie', num('renew', v => v < 10)],
  ]),
  ...group('oil', [
    ['oilTop20', 'Top 20 der Ölförderer', tag('oilTop20')],
    ['opec', 'OPEC-Mitglied', tag('opec')],
  ]),
  ...group('eu', [['eu', 'EU-Mitglied', tag('eu')]]),
  ...group('nato', [['nato', 'NATO-Mitglied', tag('nato')]]),
  ...group('g20', [['g20', 'G20-Mitglied', tag('g20')]]),
  ...group('cw', [['commonwealth', 'Commonwealth-Mitglied', tag('commonwealth')]]),
  ...group('un', [['foundingUN', 'UN-Gründungsmitglied', tag('foundingUN')]]),
  ...group('monarchy', [['monarchy', 'Monarchie', tag('monarchy')]]),
  ...group('nuclear', [['nuclear', 'Hat Atomwaffen', tag('nuclear')]]),
  ...group('indep', [['indep1990', 'Unabhängig seit 1990', tag('indep1990')]]),
  ...group('colony', [
    ['formerBritish', 'Ehemals britisch', tag('formerBritish')],
    ['formerFrench', 'Ehemals französisch', tag('formerFrench')],
    ['formerSpanish', 'Ehemals spanisch', tag('formerSpanish')],
    ['formerPortuguese', 'Ehemals portugiesisch', tag('formerPortuguese')],
    ['langEn', 'Amtssprache Englisch', c => c.langs.includes('eng')],
    ['langFr', 'Amtssprache Französisch', c => c.langs.includes('fra')],
    ['langEs', 'Amtssprache Spanisch', c => c.langs.includes('spa')],
    ['langAr', 'Amtssprache Arabisch', c => c.langs.includes('ara')],
    ['langPt', 'Amtssprache Portugiesisch', c => c.langs.includes('por')],
  ]),
  ...group('history', [
    ['ussr', 'Ehemalige Sowjetrepublik', tag('ussr')],
    ['roman', 'Teil des Römischen Reichs', tag('roman')],
    ['ottoman', 'Teil des Osmanischen Reichs', tag('ottoman')],
  ]),
  ...group('religion', [
    ['muslim', 'Mehrheitlich muslimisch', tag('muslim')],
    ['christian', 'Mehrheitlich christlich', tag('christian')],
    ['buddhist', 'Mehrheitlich buddhistisch', tag('buddhist')],
  ]),
  ...group('olympia', [['hostedOlympics', 'War Olympia-Gastgeber', tag('hostedOlympics')]]),
  ...group('worldcup', [
    ['wonWC', 'Fußball-Weltmeister', tag('wonWC')],
    ['hostedWC', 'War WM-Gastgeber', tag('hostedWC')],
  ]),
  ...group('f1', [['hostedF1', 'Hatte ein Formel-1-Rennen', tag('hostedF1')]]),
  ...group('law', [['samesex', 'Ehe für alle', tag('samesex')]]),
  ...group('left', [['drivesLeft', 'Linksverkehr', tag('drivesLeft')]]),
  ...group('tz', [['multiTZ', 'Mehrere Zeitzonen', tag('multiTZ')]]),
  ...group('heritage', [
    ['her0', 'Kein UNESCO-Welterbe', c => c.heritage === 0],
    ['her5', '5+ UNESCO-Welterbestätten', c => c.heritage >= 5],
    ['her10', '10+ UNESCO-Welterbestätten', c => c.heritage >= 10],
    ['her15', '15+ UNESCO-Welterbestätten', c => c.heritage >= 15],
  ]),
  ...group('flagcount', [
    ['flag2', 'Flagge mit 2 Farben', c => count(c) === 2],
    ['flag3', 'Flagge mit 3 Farben', c => count(c) === 3],
    ['flag4', 'Flagge mit 4+ Farben', c => count(c) >= 4],
  ]),
  ...group('flagcolor', [
    ['flagGreen', 'Flagge mit Grün', color('green')],
    ['flagBlack', 'Flagge mit Schwarz', color('black')],
    ['flagYellow', 'Flagge mit Gelb', color('yellow')],
    ['flagRedBlue', 'Flagge mit Rot und Blau', c => color('red')(c) && color('blue')(c)],
    ['flagBlueNoRed', 'Flagge mit Blau ohne Rot', c => color('blue')(c) && !color('red')(c)],
    ['flagRedNoBlue', 'Flagge mit Rot ohne Blau', c => color('red')(c) && !color('blue')(c)],
  ]),
  ...group('flagsymbol', [
    ['flagStar', 'Stern oder Sonne auf der Flagge', c => c.flag.star],
    ['flagAnimal', 'Tier auf der Flagge', c => c.flag.animal],
    ['flagEmblem', 'Wappen auf der Flagge', c => c.flag.emblem],
    ['flagCrescent', 'Halbmond auf der Flagge', c => c.flag.crescent],
    ['flagCross', 'Kreuz auf der Flagge', c => c.flag.cross],
    ['flagPlain', 'Nur Farbflächen auf der Flagge', c => !(c.flag.star || c.flag.animal || c.flag.emblem || c.flag.crescent || c.flag.cross)],
  ]),
  ...group('letter', [
    ...[...'ABDGIKLMNPSTV'].map(l => [`letter${l}`, `Beginnt mit ${l}`, c => base(c.name)[0] === l]),
    ['vowelStart', 'Beginnt mit Vokal', c => 'AEIOU'.includes(base(c.name)[0])],
  ]),
  ...group('length', [
    ['lenShort', 'Name mit höchstens 5 Buchstaben', c => oneWord(c) && letters(c) <= 5],
    ['len6', 'Name mit 6 Buchstaben', c => oneWord(c) && letters(c) === 6],
    ['len7', 'Name mit 7 Buchstaben', c => oneWord(c) && letters(c) === 7],
    ['len8', 'Name mit 8 Buchstaben', c => oneWord(c) && letters(c) === 8],
    ['len11', 'Name mit 10+ Buchstaben', c => oneWord(c) && letters(c) >= 10],
    ['multiWord', 'Name mit mehreren Wörtern', c => !oneWord(c)],
  ]),
  ...group('ending', [
    ['endsIen', 'Name endet auf -ien', c => c.name.endsWith('ien')],
    ['endsLand', 'Name endet auf -land', c => c.name.endsWith('land')],
    ['endsStan', 'Name endet auf -stan', c => c.name.endsWith('stan')],
    ['endsA', 'Name endet auf -a', c => c.name.endsWith('a')],
    ['endsN', 'Name endet auf -n', c => c.name.endsWith('n')],
  ]),
  ...group('umlaut', [['hasUmlaut', 'Name mit Umlaut', c => /[äöü]/i.test(c.name)]]),
];
