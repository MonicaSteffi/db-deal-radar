// Run with: npm test (inside worker/)
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { nextMonday } from '../src/index.js';
import { parseBestPrice } from '../src/db.js';

// Shape taken from a real bahn.de tagesbestpreis response (Munich → Nuremberg, 1 Dec 2026).
function fakeBestPrice(price) {
  const conn = (p, dep, arr, train) => ({
    abPreis: { betrag: p, waehrung: 'EUR' },
    verbindung: {
      umstiegsAnzahl: 0,
      verbindungsDauerInSeconds: 6360,
      verbindungsAbschnitte: [{
        abfahrt: { sollzeit: dep }, ankunft: { sollzeit: arr },
        verkehrsmittel: { name: train, typ: 'ICE' },
      }],
    },
  });
  return {
    intervalle: [
      { ab: '00:00', verbindungen: [conn(price + 5, '2026-12-01T05:00:00', '2026-12-01T06:10:00', 'ICE 1')] },
      { ab: '07:00', verbindungen: [conn(price, '2026-12-01T09:20:00', '2026-12-01T10:26:00', 'ICE 822')] },
    ],
  };
}

function memoryKV() {
  const m = new Map();
  return {
    async get(k, type) { const v = m.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', limit = 1000, cursor } = {}) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      const startIdx = cursor ? Number(cursor) : 0;
      const slice = keys.slice(startIdx, startIdx + limit);
      const end = startIdx + slice.length;
      return { keys: slice.map(name => ({ name })), list_complete: end >= keys.length, cursor: String(end) };
    },
    _map: m,
  };
}

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  const u = String(url);
  if (u.includes('/reiseloesung/orte')) {
    return new Response(JSON.stringify([{ extId: '8002078', name: 'Freising', lat: 48.39, lon: 11.74, type: 'ST' }]));
  }
  if (u.includes('/angebote/tagesbestpreis')) {
    const body = JSON.parse(opts.body);
    const to = body.ankunftsHalt.match(/L=(\d+)/)[1];
    const price = to === '8000284' ? 6.99 : 9.99 + (Number(to) % 20);
    return new Response(JSON.stringify(fakeBestPrice(price)), { status: 201 });
  }
  if (u.startsWith('https://ntfy.sh')) return new Response('{}');
  return new Response('not mocked', { status: 500 });
};

const env = () => ({ ALERTS: memoryKV(), ALLOWED_ORIGINS: 'https://monicasteffi.github.io', USER_AGENT: 'test' });
const req = (path, init) => new Request('https://w.example' + path, { headers: { Origin: 'https://monicasteffi.github.io' }, ...init });

test('parseBestPrice picks the cheapest connection', () => {
  const r = parseBestPrice(fakeBestPrice(6.99), '2026-12-01');
  assert.equal(r.price, 6.99);
  assert.equal(r.dep, '2026-12-01T09:20:00');
  assert.deepEqual(r.trains, ['ICE 822']);
  assert.equal(r.durationMin, 106);
});

test('nextMonday', () => {
  assert.equal(nextMonday('2026-11-21'), '2026-11-23'); // Saturday
  assert.equal(nextMonday('2026-11-22'), '2026-11-23'); // Sunday
  assert.equal(nextMonday('2026-11-23'), '2026-11-30'); // Monday
  assert.equal(nextMonday('2026-11-27'), '2026-11-30'); // Friday
});

test('stations search', async () => {
  const res = await worker.fetch(req('/api/stations?q=Freis'), env());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://monicasteffi.github.io');
  const data = await res.json();
  assert.equal(data[0].id, '8002078');
});

test('deals are paged, priced and stay under the subrequest limit', async () => {
  calls.length = 0;
  const e = env();
  const res = await worker.fetch(req('/api/deals?from=8000261&lat=48.1404&lon=11.5587&date=2026-12-01&page=0'), e);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.results.length, 20);
  assert.ok(data.pages >= 3);
  assert.ok(calls.length <= 45, `too many upstream calls: ${calls.length}`);
  assert.ok(data.results.some(r => r.to.name === 'Nürnberg Hbf' && r.price === 6.99));
  // second call is served from cache
  calls.length = 0;
  await worker.fetch(req('/api/deals?from=8000261&lat=48.1404&lon=11.5587&date=2026-12-01&page=0'), e);
  assert.equal(calls.length, 0);
});

test('bad input is rejected', async () => {
  const res = await worker.fetch(req('/api/deals?from=abc&date=x'), env());
  assert.equal(res.status, 400);
});

test('week view returns 7 days and the lowest', async () => {
  const res = await worker.fetch(req('/api/week?from=8000261&to=8000284&start=2026-11-30'), env());
  const data = await res.json();
  assert.equal(data.days.length, 7);
  assert.equal(data.lowest.price, 6.99);
});

test('alerts: create sends ntfy, list, delete, cron', async () => {
  const e = env();
  const topic = 'spr-abcdefghijkmnop';
  calls.length = 0;
  let res = await worker.fetch(req('/api/alerts', {
    method: 'POST',
    body: JSON.stringify({ topic, from: { id: '8000261', name: 'München Hbf' }, to: { id: '8000284', name: 'Nürnberg Hbf' } }),
  }), e);
  assert.equal(res.status, 201);
  const ntfy = calls.find(c => c.url.startsWith('https://ntfy.sh'));
  assert.ok(ntfy, 'ntfy message sent');
  const msg = JSON.parse(ntfy.opts.body);
  assert.equal(msg.topic, topic);
  assert.match(msg.title, /6,99 €/);
  assert.match(msg.click, /^https:\/\/www\.bahn\.de\/buchung\/fahrplan\/suche#/);

  res = await worker.fetch(req('/api/alerts?topic=' + topic), e);
  assert.equal((await res.json()).length, 1);

  // cron sends one message per alert, then stops for the week
  calls.length = 0;
  let pending;
  await worker.scheduled({}, e, { waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(calls.filter(c => c.url.startsWith('https://ntfy.sh')).length, 1);
  calls.length = 0;
  await worker.scheduled({}, e, { waitUntil: p => { pending = p; } });
  await pending;
  assert.equal(calls.filter(c => c.url.startsWith('https://ntfy.sh')).length, 0);

  res = await worker.fetch(req('/api/alerts/8000261-8000284?topic=' + topic, { method: 'DELETE' }), e);
  assert.equal(res.status, 200);
  res = await worker.fetch(req('/api/alerts?topic=' + topic), e);
  assert.equal((await res.json()).length, 0);
});
