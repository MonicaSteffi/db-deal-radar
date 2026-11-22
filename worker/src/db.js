// Thin client for the (unofficial) bahn.de web API.
const DB_API = 'https://www.bahn.de/web/api';

const ALL_PRODUCTS = ['ICE', 'EC_IC', 'IR', 'REGIONAL', 'SBAHN', 'BUS', 'SCHIFF', 'UBAHN', 'TRAM', 'ANRUFPFLICHTIG'];

function headers(env) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Language': 'de',
    'User-Agent': env.USER_AGENT || 'SparpreisRadar/0.1',
  };
}

export async function searchStations(env, query) {
  const url = `${DB_API}/reiseloesung/orte?typ=HALTESTELLEN&limit=8&suchbegriff=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: headers(env) });
  if (!res.ok) throw new Error(`station search failed: ${res.status}`);
  const list = await res.json();
  return list
    .filter(s => s.extId && s.type === 'ST')
    .map(s => ({ id: s.extId, name: s.name, lat: s.lat, lon: s.lon }));
}

// Cheapest one-way 2nd-class adult fare (no BahnCard) for one day.
// date: 'YYYY-MM-DD'. Returns null when nothing is bookable.
export async function bestPrice(env, fromId, toId, date) {
  const body = {
    abfahrtsHalt: `A=1@L=${fromId}@`,
    ankunftsHalt: `A=1@L=${toId}@`,
    anfrageZeitpunkt: `${date}T00:00:00`,
    ankunftSuche: 'ABFAHRT',
    klasse: 'KLASSE_2',
    produktgattungen: ALL_PRODUCTS,
    reisende: [{ typ: 'ERWACHSENER', ermaessigungen: [{ art: 'KEINE_ERMAESSIGUNG', klasse: 'KLASSENLOS' }], alter: [], anzahl: 1 }],
    schnelleVerbindungen: true,
    sitzplatzOnly: false,
    bikeCarriage: false,
    reservierungsKontingenteVorhanden: false,
    nurDeutschlandTicketVerbindungen: false,
    deutschlandTicketVorhanden: false,
  };
  const res = await fetch(`${DB_API}/angebote/tagesbestpreis`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`bestprice failed: ${res.status}`);
  return parseBestPrice(await res.json(), date);
}

export function parseBestPrice(json, date) {
  const intervals = json.intervalle || json.tagesbestPreisIntervalle || [];
  let best = null;
  for (const iv of intervals) {
    for (const v of iv.verbindungen || []) {
      const amount = v.abPreis?.betrag;
      if (typeof amount !== 'number') continue;
      if (!best || amount < best.price) best = { price: amount, conn: v.verbindung || v };
    }
  }
  if (!best) return null;
  const legs = (best.conn.verbindungsAbschnitte || []).filter(a => a.verkehrsmittel?.typ !== 'WALK');
  const first = legs[0];
  const last = legs[legs.length - 1];
  return {
    date,
    price: best.price,
    dep: first?.abfahrt?.sollzeit || first?.startHalt?.abfahrt?.sollzeit || first?.abfahrtsZeitpunkt || null,
    arr: last?.ankunft?.sollzeit || last?.zielHalt?.ankunft?.sollzeit || last?.ankunftsZeitpunkt || null,
    trains: legs.map(a => a.verkehrsmittel?.name).filter(Boolean),
    transfers: best.conn.umstiegsAnzahl ?? Math.max(legs.length - 1, 0),
    durationMin: best.conn.verbindungsDauerInSeconds ? Math.round(best.conn.verbindungsDauerInSeconds / 60) : null,
  };
}

// Deep link that opens the bahn.de best-price search for this route and date.
export function bookingUrl(from, to, dateTime) {
  const p = new URLSearchParams({
    sts: 'true',
    so: from.name,
    zo: to.name,
    kl: '2',
    r: '13:16:KLASSENLOS:1',
    soid: `A=1@L=${from.id}@`,
    zoid: `A=1@L=${to.id}@`,
    hd: dateTime,
    hza: 'D',
    ar: 'false',
    s: 'true',
    d: 'false',
    fm: 'false',
    bp: 'true',
  });
  return `https://www.bahn.de/buchung/fahrplan/suche#${p.toString()}`;
}
