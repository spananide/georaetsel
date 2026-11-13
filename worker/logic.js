export const GAMES = [
  'georaetsel',
  'flaggen',
  'mehr-weniger',
  'umriss',
  'hauptstaedte',
  'laenderkette',
  'heisskalt',
  'woertel',
  'rechnel',
  'kronen',
  'sonne-mond',
  'sudoku',
  'wabe',
  'vierer',
  'tiefsee',
  'kippe'
];

export function cleanName(s) {
  if (typeof s !== 'string') return null;
  const cleaned = s.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 16) return null;
  if (!/^[\p{L}\p{N} _.-]+$/u.test(cleaned)) return null;
  return cleaned;
}

export function nameKey(s) {
  const cleaned = cleanName(s);
  return cleaned ? cleaned.toLowerCase() : null;
}

export function cleanAnswer(s) {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim().toLowerCase().replace(/\s+/g, ' ');
  const stripped = trimmed.replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '');
  if (stripped.length < 1 || stripped.length > 40) return null;
  return stripped;
}

export function dayOk(day, nowMs = Date.now()) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  if (
    target.getUTCFullYear() !== y ||
    target.getUTCMonth() !== m - 1 ||
    target.getUTCDate() !== d
  ) {
    return false;
  }
  const now = new Date(nowMs);
  if (Number.isNaN(now.getTime())) return false;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((target.getTime() - todayUtc) / 86400000);
  return diffDays >= -1 && diffDays <= 1;
}

export function cleanResult(body, nowMs = Date.now()) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid body' };
  }

  const name = cleanName(body.name);
  if (!name) return { ok: false, error: 'invalid name' };
  const key = nameKey(name);

  if (!dayOk(body.day, nowMs)) return { ok: false, error: 'invalid day' };
  const day = body.day;

  if (!GAMES.includes(body.game)) return { ok: false, error: 'unknown game' };
  const game = body.game;

  if (body.mode !== 'daily' && body.mode !== 'practice') {
    return { ok: false, error: 'invalid mode' };
  }
  const mode = body.mode;

  if (!Number.isInteger(body.tries) || body.tries < 0 || body.tries > 99) {
    return { ok: false, error: 'invalid tries' };
  }
  const tries = body.tries;

  let won;
  if (body.won === true || body.won === 1) {
    won = 1;
  } else if (body.won === false || body.won === 0) {
    won = 0;
  } else {
    return { ok: false, error: 'invalid won' };
  }

  let ms = 0;
  if (body.ms !== undefined && body.ms !== null) {
    if (!Number.isInteger(body.ms) || body.ms < 0 || body.ms > 86400000) {
      return { ok: false, error: 'invalid ms' };
    }
    ms = body.ms;
  }

  return {
    ok: true,
    r: { name, key, day, game, mode, tries, won, ms }
  };
}
