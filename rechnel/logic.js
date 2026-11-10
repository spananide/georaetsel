import { mulberry32 } from '../georaetsel/game.js';

export const LEN = 8;
export const MAX_GUESSES = 6;

const SIDE_RE = /^(0|[1-9]\d*)(?:[+\-*/](0|[1-9]\d*))*$/;
const OPS = ['+', '-', '*', '/'];

// Greatest common divisor for exact rational arithmetic
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

// Exact rational number representation using BigInt
class Rational {
  constructor(n, d = 1n) {
    if (d === 0n) throw new Error('Division by zero');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.n = n / g;
    this.d = d / g;
  }

  add(other) {
    return new Rational(this.n * other.d + other.n * this.d, this.d * other.d);
  }

  sub(other) {
    return new Rational(this.n * other.d - other.n * this.d, this.d * other.d);
  }

  mul(other) {
    return new Rational(this.n * other.n, this.d * other.d);
  }

  div(other) {
    if (other.n === 0n) throw new Error('Division by zero');
    return new Rational(this.n * other.d, this.d * other.n);
  }

  equals(other) {
    return this.n === other.n && this.d === other.d;
  }

  isInteger() {
    return this.d === 1n;
  }
}

// Evaluate an expression side with standard precedence (* and / before + and -, left to right)
function evalSide(expr) {
  const nums = expr.split(/[+\-*/]/).map(s => BigInt(s));
  const ops = expr.split(/\d+/).filter(Boolean);

  const values = [new Rational(nums[0])];
  const remainingOps = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const nextVal = new Rational(nums[i + 1]);
    if (op === '*') {
      values.push(values.pop().mul(nextVal));
    } else if (op === '/') {
      values.push(values.pop().div(nextVal));
    } else {
      remainingOps.push(op);
      values.push(nextVal);
    }
  }

  let res = values[0];
  for (let i = 0; i < remainingOps.length; i++) {
    if (remainingOps[i] === '+') {
      res = res.add(values[i + 1]);
    } else {
      res = res.sub(values[i + 1]);
    }
  }
  return res;
}

// Parse and validate an equation string
export function parseEquation(str, expectedLen = LEN) {
  if (typeof str !== 'string' || (expectedLen != null && str.length !== expectedLen)) {
    return { ok: false, reason: 'length' };
  }
  if (/[^0-9+\-*/=]/.test(str)) {
    return { ok: false, reason: 'chars' };
  }
  const parts = str.split('=');
  if (parts.length !== 2) {
    return { ok: false, reason: 'equals' };
  }
  const [left, right] = parts;
  if (!SIDE_RE.test(left) || !SIDE_RE.test(right)) {
    return { ok: false, reason: 'syntax' };
  }
  let lVal, rVal;
  try {
    lVal = evalSide(left);
    rVal = evalSide(right);
  } catch (e) {
    return { ok: false, reason: 'zero' };
  }
  if (!lVal.equals(rVal)) {
    return { ok: false, reason: 'unequal' };
  }
  return { ok: true };
}

// Templates for operand digit lengths:
// 2 operands: d1 + d2 + dVal = 6 (left has length d1 + d2 + 1, eq total length 8)
// 3 operands: d1 + d2 + d3 + dVal = 5 (left has length d1 + d2 + d3 + 2, eq total length 8)
const TEMPLATES = [
  [1, 2], [2, 1], [2, 2], [3, 1], [1, 3], [3, 2], [2, 3],
  [1, 1, 1], [2, 1, 1], [1, 2, 1], [1, 1, 2]
];

function randInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function randOperand(rand, digits, isDivisor = false) {
  const min = digits === 1 ? (isDivisor ? 1 : 0) : 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return randInt(rand, min, max);
}

// Deterministically generate a valid 8-character equation for the given seed
export function generate(seed) {
  const rand = mulberry32(seed);
  for (let attempt = 0; attempt < 5000; attempt++) {
    const tmpl = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
    const numOps = tmpl.length - 1;
    const ops = [];
    for (let i = 0; i < numOps; i++) {
      ops.push(OPS[Math.floor(rand() * 4)]);
    }
    const operands = [];
    for (let i = 0; i < tmpl.length; i++) {
      const isDivisor = i > 0 && ops[i - 1] === '/';
      operands.push(randOperand(rand, tmpl[i], isDivisor));
    }
    let left = String(operands[0]);
    for (let i = 0; i < numOps; i++) {
      left += ops[i] + operands[i + 1];
    }
    try {
      const val = evalSide(left);
      if (val.isInteger() && val.n >= 0n) {
        const eq = `${left}=${val.n}`;
        if (eq.length === LEN && parseEquation(eq).ok) {
          return eq;
        }
      }
    } catch (e) {}
  }
  return '12+35=47';
}

// Secret equation for daily or practice mode
export function answerFor(seed, mode = 'daily') {
  return generate(seed);
}

// Initialise a new round object
export function newRound(seed, mode = 'daily') {
  return {
    seed,
    answer: answerFor(seed, mode),
    guesses: [],
    state: 'playing',
    ms: 0,
  };
}

// Two-pass Wordle/Nerdle evaluation of guess against answer
export function evaluate(guess, answer) {
  const len = guess.length;
  const res = new Array(len).fill('miss');
  const remaining = {};

  // Pass 1: mark exact hits and tally remaining characters in answer
  for (let i = 0; i < len; i++) {
    if (guess[i] === answer[i]) {
      res[i] = 'hit';
    } else {
      const c = answer[i];
      remaining[c] = (remaining[c] || 0) + 1;
    }
  }

  // Pass 2: mark near matches while count of character > 0
  for (let i = 0; i < len; i++) {
    if (res[i] === 'hit') continue;
    const c = guess[i];
    if ((remaining[c] || 0) > 0) {
      res[i] = 'near';
      remaining[c]--;
    }
  }

  return res;
}

// Submit a guess string to the round
export function submit(round, str) {
  if (!round || round.state !== 'playing') {
    return { result: 'ignored' };
  }
  const s = String(str || '').trim();
  if (s.length < LEN) {
    return { result: 'short' };
  }
  const p = parseEquation(s);
  if (!p.ok) {
    return { result: 'invalid', reason: p.reason };
  }
  round.guesses.push(s);
  if (s === round.answer) {
    round.state = 'won';
  } else if (round.guesses.length >= MAX_GUESSES) {
    round.state = 'lost';
  }
  return { result: 'ok' };
}

// Aggregate character states across all guesses (hit > near > miss)
export function keyStates(round) {
  const states = {};
  if (!round || !round.guesses) return states;
  for (const guess of round.guesses) {
    const ev = evaluate(guess, round.answer);
    for (let i = 0; i < guess.length; i++) {
      const ch = guess[i];
      const state = ev[i];
      const current = states[ch];
      if (current === 'hit') continue;
      if (state === 'hit') {
        states[ch] = 'hit';
      } else if (state === 'near') {
        states[ch] = 'near';
      } else if (state === 'miss' && !current) {
        states[ch] = 'miss';
      }
    }
  }
  return states;
}

// Generate shareable text for the round
export function shareText(round, label, url) {
  const score = round.state === 'won' ? `${round.guesses.length}/6` : 'X/6';
  const rows = round.guesses.map(g => {
    const ev = evaluate(g, round.answer);
    return ev.map(s => s === 'hit' ? '🟩' : s === 'near' ? '🟨' : '⬛').join('');
  });
  return [`Rechnel ${label}`, score, ...rows, url].join('\n');
}
