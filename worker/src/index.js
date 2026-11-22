import { searchStations, bestPrice, bookingUrl } from './db.js';
import { STATIONS, destinationsFor } from './stations.js';

const PAGE_SIZE = 20;        // destinations per /api/deals call (keeps us under the 50-subrequest limit)
const CONCURRENCY = 5;       // parallel calls to bahn.de
const ALERTS_PER_CRON = 5;   // 5 routes x 7 days = 35 lookups per cron run
const TOPIC_RE = /^[A-Za-z0-9_-]{12,64}$/;
const EVA_RE = /^\d{6,9}$/;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(env, request, new Response(null, { status: 204 }));
    let res;
    try {
      res = await route(request, env);
    } catch (err) {
      console.error(err);
      res = json({ error: 'upstream_error', message: String(err.message || err) }, 502);
    }
    return cors(env, request, res);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWeeklyAlerts(env));
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  const q = url.searchParams;

  if (p === '' || p === '/api') return json({ ok: true, name: 'sparpreis-radar' });

  if (p === '/api/stations' && request.method === 'GET') {
    const term = (q.get('q') || '').trim();
    if (term.length < 2) return json([]);
    const data = await cached(env, `st:${term.toLowerCase()}`, 86400, () => searchStations(env, term));
    return json(data, 200, 3600);
  }

  if (p === '/api/deals' && request.method === 'GET') {
    const from = q.get('from');
    const lat = parseFloat(q.get('lat'));
    const lon = parseFloat(q.get('lon'));
    const date = q.get('date');
    const page = Math.max(0, parseInt(q.get('page') || '0', 10));
    if (!EVA_RE.test(from || '') || !isDate(date) || !isFinite(lat) || !isFinite(lon)) return json({ error: 'bad_request' }, 400);
    const all = destinationsFor(from, lat, lon);
    const slice = all.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const results = await cached(env, `deals:${from}:${date}:${page}`, 3 * 3600, async () => {
      const prices = await mapLimit(slice, CONCURRENCY, d => bestPrice(env, from, d.id, date).catch(() => null));
      return slice
        .map((d, i) => (prices[i] ? { to: { id: d.id, name: d.name }, km: d.km, ...prices[i] } : null))
        .filter(Boolean);
    });
    return json({ page, pages: Math.ceil(all.length / PAGE_SIZE), results }, 200, 600);
  }

  if (p === '/api/week' && request.method === 'GET') {
    const from = q.get('from');
    const to = q.get('to');
    const start = q.get('start') || nextMonday();
    if (!EVA_RE.test(from || '') || !EVA_RE.test(to || '') || !isDate(start)) return json({ error: 'bad_request' }, 400);
    const days = await cached(env, `week:${from}:${to}:${start}`, 3 * 3600, () => weekPrices(env, from, to, start));
    return json({ start, days, lowest: lowestOf(days) }, 200, 600);
  }

  // --- Alerts (ntfy) ---
  if (p === '/api/alerts' && request.method === 'GET') {
    const topic = q.get('topic') || '';
    if (!TOPIC_RE.test(topic)) return json({ error: 'bad_topic' }, 400);
    const list = await env.ALERTS.list({ prefix: `alert:${topic}:` });
    const items = await Promise.all(list.keys.map(k => env.ALERTS.get(k.name, 'json')));
    return json(items.filter(Boolean));
  }

  if (p === '/api/alerts' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { topic, from, to } = body;
    if (!TOPIC_RE.test(topic || '') || !validStation(from) || !validStation(to)) return json({ error: 'bad_request' }, 400);
    const existing = await env.ALERTS.list({ prefix: `alert:${topic}:` });
    if (existing.keys.length >= 20) return json({ error: 'too_many_alerts' }, 429);
    const id = `${from.id}-${to.id}`;
    const alert = { id, topic, from: pick(from), to: pick(to), created: new Date().toISOString() };
    await env.ALERTS.put(`alert:${topic}:${id}`, JSON.stringify(alert));
    // Send the lowest price for the coming week right away.
    const start = nextMonday();
    const days = await weekPrices(env, from.id, to.id, start);
    await notify(env, alert, start, days);
    return json({ alert, start, days, lowest: lowestOf(days) }, 201);
  }

  const m = p.match(/^\/api\/alerts\/([0-9-]+)$/);
  if (m && request.method === 'DELETE') {
    const topic = q.get('topic') || '';
    if (!TOPIC_RE.test(topic)) return json({ error: 'bad_topic' }, 400);
    await env.ALERTS.delete(`alert:${topic}:${m[1]}`);
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}

// ---------- weekly cron ----------
// Runs hourly on Saturdays and Sundays (see wrangler.toml). Each run processes a small batch of
// alerts and remembers where it stopped, so every alert gets one message per week.
async function runWeeklyAlerts(env) {
  const start = nextMonday();
  const stateKey = `cron:${start}`;
  const state = (await env.ALERTS.get(stateKey, 'json')) || { cursor: undefined, done: false };
  if (state.done) return;
  const list = await env.ALERTS.list({ prefix: 'alert:', limit: ALERTS_PER_CRON, cursor: state.cursor });
  for (const k of list.keys) {
    const alert = await env.ALERTS.get(k.name, 'json');
    if (!alert) continue;
    try {
      const days = await weekPrices(env, alert.from.id, alert.to.id, start);
      await notify(env, alert, start, days);
    } catch (err) {
      console.error('alert failed', k.name, err);
    }
  }
  const next = list.list_complete ? { done: true } : { cursor: list.cursor, done: false };
  await env.ALERTS.put(stateKey, JSON.stringify(next), { expirationTtl: 14 * 86400 });
}

async function weekPrices(env, fromId, toId, start) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const prices = await mapLimit(dates, CONCURRENCY, d => bestPrice(env, fromId, toId, d).catch(() => null));
  return dates.map((date, i) => prices[i] || { date, price: null });
}

function lowestOf(days) {
  return days.filter(d => d.price != null).sort((a, b) => a.price - b.price)[0] || null;
}

async function notify(env, alert, start, days) {
  const low = lowestOf(days);
  const route = `${alert.from.name} → ${alert.to.name}`;
  let title, message, click;
  if (low) {
    const when = formatDay(low.date) + (low.dep ? `, ${low.dep.slice(11, 16)} Uhr` : '');
    title = `${formatEuro(low.price)}: ${route}`;
    message = `Günstigster Preis in der Woche ab ${formatDay(start)}: ${formatEuro(low.price)} am ${when}` +
      (low.trains?.length ? ` (${low.trains.join(', ')})` : '') + '.';
    click = bookingUrl(alert.from, alert.to, low.dep || `${low.date}T06:00:00`);
  } else {
    title = route;
    message = `Für die Woche ab ${formatDay(start)} sind noch keine Sparpreise buchbar.`;
    click = bookingUrl(alert.from, alert.to, `${start}T06:00:00`);
  }
  const res = await fetch(env.NTFY_SERVER || 'https://ntfy.sh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: alert.topic, title, message, click, tags: ['train'] }),
  });
  if (!res.ok) console.error('ntfy failed', res.status);
}

// ---------- helpers ----------
async function cached(env, key, ttl, fn) {
  try {
    const hit = await env.ALERTS.get(`cache:${key}`, 'json');
    if (hit) return hit;
  } catch (_) { /* ignore */ }
  const value = await fn();
  try {
    await env.ALERTS.put(`cache:${key}`, JSON.stringify(value), { expirationTtl: Math.max(ttl, 60) });
  } catch (_) { /* KV write quota reached: serve uncached */ }
  return value;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function berlinToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

export function nextMonday(today = berlinToday()) {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  const add = dow === 0 ? 1 : 8 - dow;
  return addDays(today, add);
}

function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function validStation(s) {
  return s && EVA_RE.test(String(s.id)) && typeof s.name === 'string' && s.name.length < 100;
}

function pick(s) {
  return { id: String(s.id), name: s.name };
}

function formatEuro(v) {
  return v.toFixed(2).replace('.', ',') + ' €';
}

function formatDay(date) {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getUTCDay()];
  return `${wd} ${date.slice(8, 10)}.${date.slice(5, 7)}.`;
}

function json(data, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}

function cors(env, request, res) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const origin = request.headers.get('Origin');
  const allow = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', allow);
  h.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}

export { STATIONS };
