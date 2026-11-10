import { cleanName, nameKey, cleanAnswer, dayOk, cleanResult } from './logic.js';

function isOriginAllowed(origin) {
  if (!origin) return true;
  return (
    origin === 'https://geo.spanani.de' ||
    origin === 'https://spananide.github.io' ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1')
  );
}

function jsonResponse(data, status = 200, origin = null) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Vary'] = 'Origin';
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function handleResult(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400, origin);
  }

  const checked = cleanResult(body, Date.now());
  if (!checked.ok) {
    return jsonResponse({ error: checked.error }, 400, origin);
  }

  const r = checked.r;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  const rateRow = await env.DB.prepare(
    'SELECT count(*) as count FROM results WHERE ip = ? AND at > ?'
  ).bind(ip, oneMinuteAgo).first();

  if (rateRow && rateRow.count >= 60) {
    return jsonResponse({ error: 'slow down' }, 429, origin);
  }

  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO results (name, key, day, game, mode, tries, won, ms, ip, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(r.name, r.key, r.day, r.game, r.mode, r.tries, r.won, r.ms, ip, now).run();

  const stored = Boolean(res.meta && res.meta.changes > 0);
  return jsonResponse({ ok: true, stored }, 200, origin);
}

async function handleBoard(url, env, origin) {
  const nameParam = url.searchParams.get('name');
  const cleanUser = cleanName(nameParam);
  if (!cleanUser) {
    return jsonResponse({ error: 'invalid name' }, 400, origin);
  }
  const userKey = nameKey(cleanUser);

  let day = url.searchParams.get('day');
  if (!day) {
    day = new Date().toISOString().slice(0, 10);
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return jsonResponse({ error: 'invalid day' }, 400, origin);
  }

  const meRow = await env.DB.prepare(
    'SELECT (SELECT name FROM results WHERE key = ? ORDER BY at DESC, id DESC LIMIT 1) as name, (SELECT count(*) FROM results WHERE key = ?) as total'
  ).bind(userKey, userKey).first();

  const me = {
    name: meRow?.name || cleanUser,
    total: meRow?.total ?? 0
  };

  const boardSql = `
    WITH day_keys AS (
      SELECT key, count(*) as dailies
      FROM results
      WHERE day = ? AND mode = 'daily'
      GROUP BY key
    ),
    totals AS (
      SELECT key, count(*) as total
      FROM results
      WHERE key IN (SELECT key FROM day_keys)
      GROUP BY key
    ),
    latest_names AS (
      SELECT key, name
      FROM (
        SELECT key, name, ROW_NUMBER() OVER (PARTITION BY key ORDER BY at DESC, id DESC) as rn
        FROM results
        WHERE key IN (SELECT key FROM day_keys)
      ) WHERE rn = 1
    )
    SELECT d.key, l.name, d.dailies, t.total
    FROM day_keys d
    JOIN latest_names l ON d.key = l.key
    JOIN totals t ON d.key = t.key
    ORDER BY d.dailies DESC, l.name ASC
    LIMIT 200
  `;

  const playerRows = await env.DB.prepare(boardSql).bind(day).all();
  const rawPlayers = playerRows.results || [];
  if (rawPlayers.length === 0) {
    return jsonResponse({ day, me, players: [] }, 200, origin);
  }

  const playersMap = new Map();
  const players = [];
  for (const p of rawPlayers) {
    const item = {
      name: p.name,
      games: {},
      dailies: Number(p.dailies),
      total: Number(p.total)
    };
    playersMap.set(p.key, item);
    players.push(item);
  }

  const gamesSql = 'SELECT key, game, tries, won, ms FROM results WHERE day = ? AND mode = ?';
  const gameRows = await env.DB.prepare(gamesSql).bind(day, 'daily').all();
  for (const g of gameRows.results || []) {
    const player = playersMap.get(g.key);
    if (player) {
      player.games[g.game] = {
        tries: Number(g.tries),
        won: Number(g.won),
        ms: Number(g.ms)
      };
    }
  }

  return jsonResponse({ day, me, players }, 200, origin);
}

async function handleMe(url, env, origin) {
  const nameParam = url.searchParams.get('name');
  const cleanUser = cleanName(nameParam);
  if (!cleanUser) {
    return jsonResponse({ error: 'invalid name' }, 400, origin);
  }
  const userKey = nameKey(cleanUser);

  const sql = `
    SELECT
      (SELECT name FROM results WHERE key = ? ORDER BY at DESC, id DESC LIMIT 1) as name,
      (SELECT count(*) FROM results WHERE key = ?) as total,
      (SELECT count(*) FROM results WHERE key = ? AND mode = 'daily') as dailies
  `;
  const row = await env.DB.prepare(sql).bind(userKey, userKey, userKey).first();

  return jsonResponse({
    name: row?.name || cleanUser,
    total: row?.total ?? 0,
    dailies: row?.dailies ?? 0
  }, 200, origin);
}

async function handleAnswer(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid json' }, 400, origin);
  }

  const name = cleanName(body?.name);
  if (!name) {
    return jsonResponse({ error: 'invalid name' }, 400, origin);
  }
  const key = nameKey(name);

  const day = body?.day;
  if (!dayOk(day, Date.now())) {
    return jsonResponse({ error: 'invalid day' }, 400, origin);
  }

  const cleanAns = cleanAnswer(body?.answer);
  if (!cleanAns) {
    return jsonResponse({ error: 'invalid answer' }, 400, origin);
  }

  // several questions per day: question 0 uses the plain day, others "<day>:<q>"
  const q = Number.isInteger(body?.q) && body.q >= 0 && body.q <= 9 ? body.q : 0;
  const dayKey = q ? `${day}:${q}` : day;

  const existing = await env.DB.prepare(
    'SELECT answer FROM answered WHERE key = ? AND day = ?'
  ).bind(key, dayKey).first();

  let finalAnswer;
  if (existing) {
    finalAnswer = existing.answer;
  } else {
    finalAnswer = cleanAns;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO answered (key, day, answer) VALUES (?, ?, ?)').bind(key, dayKey, cleanAns),
      env.DB.prepare(
        'INSERT INTO answers (day, answer, n) VALUES (?, ?, 1) ON CONFLICT(day, answer) DO UPDATE SET n = n + 1'
      ).bind(dayKey, cleanAns)
    ]);
  }

  const statsSql = `
    SELECT
      a.n,
      (SELECT coalesce(sum(n), 0) FROM answers WHERE day = ?) as total,
      1 + (SELECT count(*) FROM answers WHERE day = ? AND n > a.n) as rank
    FROM answers a
    WHERE day = ? AND answer = ?
  `;
  const stats = await env.DB.prepare(statsSql).bind(dayKey, dayKey, dayKey, finalAnswer).first();

  return jsonResponse({
    answer: finalAnswer,
    n: stats?.n ?? 0,
    total: stats?.total ?? 0,
    rank: stats?.rank ?? 1
  }, 200, origin);
}

async function handleAnswers(url, env, origin) {
  let day = url.searchParams.get('day');
  if (!day) {
    day = new Date().toISOString().slice(0, 10);
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return jsonResponse({ error: 'invalid day' }, 400, origin);
  }

  const q = Number(url.searchParams.get('q')) || 0;
  const dayKey = q >= 1 && q <= 9 ? `${day}:${q}` : day;

  const totalRow = await env.DB.prepare(
    'SELECT coalesce(sum(n), 0) as total FROM answers WHERE day = ?'
  ).bind(dayKey).first();

  const topRows = await env.DB.prepare(
    'SELECT answer, n FROM answers WHERE day = ? ORDER BY n DESC, answer ASC LIMIT 20'
  ).bind(dayKey).all();

  return jsonResponse({
    day,
    total: totalRow?.total ?? 0,
    top: (topRows.results || []).map(r => ({ answer: r.answer, n: r.n }))
  }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      if (origin && !isOriginAllowed(origin)) {
        return jsonResponse({ error: 'forbidden' }, 403);
      }
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      };
      if (origin && isOriginAllowed(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Vary'] = 'Origin';
      }
      return new Response(null, { status: 204, headers });
    }

    if (origin && !isOriginAllowed(origin) && request.method === 'POST') {
      return jsonResponse({ error: 'forbidden' }, 403);
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const method = request.method;

      if (method === 'POST' && path === '/result') {
        return await handleResult(request, env, origin);
      }
      if (method === 'GET' && path === '/board') {
        return await handleBoard(url, env, origin);
      }
      if (method === 'GET' && path === '/me') {
        return await handleMe(url, env, origin);
      }
      if (method === 'POST' && path === '/answer') {
        return await handleAnswer(request, env, origin);
      }
      if (method === 'GET' && path === '/answers') {
        return await handleAnswers(url, env, origin);
      }

      return jsonResponse({ error: 'not found' }, 404, origin);
    } catch {
      return jsonResponse({ error: 'server error' }, 500, origin);
    }
  }
};
