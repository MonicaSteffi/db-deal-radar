(() => {
  'use strict';
  const API = (window.SPARPREIS_API || '').replace(/\/+$/, '');
  const CHEAP = 6.99;
  const SHOW_FIRST = 15;
  const $ = id => document.getElementById(id);

  // ---------- storage (fails quietly in private mode) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('spr:' + key); return v == null ? fallback : JSON.parse(v); }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('spr:' + key, JSON.stringify(value)); } catch (_) { /* ignore */ }
    },
  };

  const state = {
    origin: store.get('origin', null),       // {id, name, lat, lon}
    saved: store.get('saved', []),           // [{id, name}]
    topic: store.get('topic', null),
    alertsOn: store.get('alertsOn', false),
    alerts: new Set(),                       // alert ids active on the server
    date: null,
    deals: [],
    dealsToken: 0,
  };
  if (!state.topic) {
    state.topic = 'spr-' + randomId(20);
    store.set('topic', state.topic);
  }

  // ---------- API ----------
  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.status);
    return data;
  }

  // ---------- dates ----------
  function berlinToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  }
  function addDays(date, n) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dow(date) { return new Date(date + 'T12:00:00Z').getUTCDay(); }
  function nextMonday(today = berlinToday()) {
    const w = dow(today);
    return addDays(today, w === 0 ? 1 : 8 - w);
  }
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const dayLabel = date => `${WD[dow(date)]} ${date.slice(8, 10)}.${date.slice(5, 7)}.`;
  const time = iso => (iso ? iso.slice(11, 16) : '');
  const euro = v => v.toFixed(2).replace('.', ',') + ' €';
  const duration = m => (m == null ? '' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`);

  function bookingUrl(from, to, dateTime) {
    const p = new URLSearchParams({
      sts: 'true', so: from.name, zo: to.name, kl: '2', r: '13:16:KLASSENLOS:1',
      soid: `A=1@L=${from.id}@`, zoid: `A=1@L=${to.id}@`, hd: dateTime,
      hza: 'D', ar: 'false', s: 'true', d: 'false', fm: 'false', bp: 'true',
    });
    return 'https://www.bahn.de/buchung/fahrplan/suche#' + p.toString();
  }

  // ---------- origin search ----------
  const input = $('originInput');
  const suggest = $('originSuggest');
  let suggestTimer = null;
  let suggestItems = [];
  let activeIdx = -1;

  input.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    const q = input.value.trim();
    if (q.length < 2) { hideSuggest(); return; }
    suggestTimer = setTimeout(async () => {
      try {
        suggestItems = await api('/api/stations?q=' + encodeURIComponent(q));
        renderSuggest();
      } catch (_) { hideSuggest(); }
    }, 250);
  });
  input.addEventListener('keydown', e => {
    if (suggest.hidden) return;
    if (e.key === 'ArrowDown') { activeIdx = Math.min(activeIdx + 1, suggestItems.length - 1); renderSuggest(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { activeIdx = Math.max(activeIdx - 1, 0); renderSuggest(); e.preventDefault(); }
    if (e.key === 'Enter' && suggestItems[Math.max(activeIdx, 0)]) { chooseOrigin(suggestItems[Math.max(activeIdx, 0)]); e.preventDefault(); }
    if (e.key === 'Escape') hideSuggest();
  });
  document.addEventListener('click', e => { if (!suggest.contains(e.target) && e.target !== input) hideSuggest(); });

  function renderSuggest() {
    suggest.innerHTML = '';
    if (!suggestItems.length) { hideSuggest(); return; }
    suggestItems.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = s.name;
      if (i === activeIdx) li.className = 'active';
      li.addEventListener('click', () => chooseOrigin(s));
      suggest.appendChild(li);
    });
    suggest.hidden = false;
  }
  function hideSuggest() { suggest.hidden = true; activeIdx = -1; }

  function chooseOrigin(s) {
    state.origin = { id: s.id, name: s.name, lat: s.lat, lon: s.lon };
    store.set('origin', state.origin);
    input.value = s.name;
    hideSuggest();
    input.blur();
    renderOrigin();
    loadDeals();
    renderSaved();
  }

  function renderOrigin() {
    const p = $('originSaved');
    if (state.origin) {
      input.value = state.origin.name;
      p.textContent = 'Gespeichert. Die App merkt sich deinen Startbahnhof.';
      p.hidden = false;
      $('dealsCard').hidden = false;
    } else {
      p.hidden = true;
      $('dealsCard').hidden = true;
    }
  }

  // ---------- day chips ----------
  function renderChips() {
    const today = berlinToday();
    const chips = $('dayChips');
    chips.innerHTML = '';
    if (!state.date) {
      const w = dow(today);
      state.date = (w === 6 || w === 0) ? nextMonday(today) : addDays(today, 1);
    }
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i);
      const b = document.createElement('button');
      b.className = 'chip';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(d === state.date));
      b.textContent = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : dayLabel(d);
      b.addEventListener('click', () => {
        state.date = d;
        renderChips();
        loadDeals();
      });
      chips.appendChild(b);
    }
  }

  // ---------- deals ----------
  async function loadDeals() {
    if (!state.origin) return;
    const token = ++state.dealsToken;
    state.deals = [];
    state.showAll = false;
    $('moreBtn').hidden = true;
    const list = $('dealsList');
    list.innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
    setStatus('Preise werden abgefragt …');
    const { id, lat, lon } = state.origin;
    let page = 0, pages = 1;
    try {
      while (page < pages) {
        const data = await api(`/api/deals?from=${id}&lat=${lat}&lon=${lon}&date=${state.date}&page=${page}`);
        if (token !== state.dealsToken) return; // user switched day or station
        pages = data.pages;
        state.deals.push(...data.results);
        renderDeals(page + 1 < pages);
        page++;
      }
      setStatus(state.deals.length
        ? `${state.deals.length} Ziele am ${dayLabel(state.date)}, günstigste zuerst.`
        : `Für ${dayLabel(state.date)} wurden keine Sparpreise gefunden.`);
    } catch (err) {
      if (token !== state.dealsToken) return;
      renderDeals(false);
      setStatus('Die Preise konnten gerade nicht geladen werden. Bitte später noch einmal versuchen.');
    }
  }

  function setStatus(t) { $('dealsStatus').textContent = t; }

  function renderDeals(loadingMore) {
    const list = $('dealsList');
    list.innerHTML = '';
    const onlyCheap = $('onlyCheap').checked;
    const items = state.deals
      .filter(d => !onlyCheap || d.price <= CHEAP)
      .sort((a, b) => a.price - b.price || a.km - b.km);
    const shown = state.showAll ? items : items.slice(0, SHOW_FIRST);
    for (const d of shown) list.appendChild(dealRow(d));
    if (loadingMore) list.insertAdjacentHTML('beforeend', '<li class="skeleton"></li>');
    const more = $('moreBtn');
    more.hidden = shown.length >= items.length;
    more.textContent = `Alle ${items.length} Ziele anzeigen`;
    if (!items.length && !loadingMore && onlyCheap && state.deals.length) {
      list.innerHTML = '<li class="muted">An diesem Tag gibt es keine Ziele für 6,99 €. Probier einen anderen Tag.</li>';
    }
  }

  function dealRow(d) {
    const li = document.createElement('li');
    li.className = 'deal';
    const cheap = d.price <= CHEAP;
    const isSaved = state.saved.some(s => s.id === d.to.id);
    li.innerHTML = `
      <div class="price ${cheap ? 'cheap' : ''}">${euro(d.price)}</div>
      <div>
        <div class="dest"></div>
        <div class="meta"></div>
      </div>
      <div class="actions">
        <button class="icon ${isSaved ? 'on' : ''}" title="Ziel speichern" aria-label="Ziel speichern">${isSaved ? '★' : '☆'}</button>
        <a class="btn" target="_blank" rel="noopener">Buchen</a>
      </div>`;
    li.querySelector('.dest').textContent = d.to.name;
    const parts = [`${time(d.dep)}–${time(d.arr)}`, duration(d.durationMin)];
    parts.push(d.transfers ? `${d.transfers}× Umstieg` : 'direkt');
    if (d.trains?.length) parts.push(d.trains.slice(0, 3).join(', '));
    li.querySelector('.meta').textContent = parts.filter(Boolean).join(' · ');
    li.querySelector('a').href = bookingUrl(state.origin, d.to, d.dep || `${state.date}T06:00:00`);
    li.querySelector('button').addEventListener('click', () => toggleSaved(d.to));
    return li;
  }

  $('onlyCheap').addEventListener('change', () => renderDeals(false));
  $('moreBtn').addEventListener('click', () => { state.showAll = true; renderDeals(false); });

  // ---------- saved destinations ----------
  async function toggleSaved(to) {
    const idx = state.saved.findIndex(s => s.id === to.id);
    if (idx >= 0) {
      state.saved.splice(idx, 1);
      if (state.origin) removeAlert(state.origin, to).catch(() => {});
      toast(`${to.name} entfernt`);
    } else {
      state.saved.push({ id: to.id, name: to.name });
      toast(`${to.name} gespeichert`);
      if (state.alertsOn && state.origin) addAlert(state.origin, to).catch(() => toast('Alarm konnte nicht gespeichert werden'));
    }
    store.set('saved', state.saved);
    renderDeals(false);
    renderSaved();
  }

  function renderSaved() {
    const card = $('savedCard');
    const list = $('savedList');
    if (!state.saved.length || !state.origin) { card.hidden = true; return; }
    card.hidden = false;
    const start = nextMonday();
    $('savedWeekLabel').textContent = `Ab ${state.origin.name}, Woche ab ${dayLabel(start)} – günstigster Tag ist grün markiert.`;
    list.innerHTML = '';
    for (const s of state.saved) {
      const li = document.createElement('li');
      li.className = 'saved';
      li.innerHTML = `
        <div class="row-between">
          <div><span class="dest"></span> <span class="low-label meta"></span></div>
          <div class="actions">
            <button class="icon bell" title="Wöchentlicher Alarm" aria-label="Wöchentlicher Alarm"></button>
            <button class="icon remove" title="Entfernen" aria-label="Entfernen">✕</button>
          </div>
        </div>
        <div class="week"><div class="skeleton" style="grid-column: 1 / -1; height: 40px; margin: 0"></div></div>`;
      li.querySelector('.dest').textContent = s.name;
      const bell = li.querySelector('.bell');
      const alertId = `${state.origin.id}-${s.id}`;
      const on = state.alertsOn && state.alerts.has(alertId);
      bell.textContent = on ? '🔔' : '🔕';
      bell.classList.toggle('on', on);
      bell.addEventListener('click', async () => {
        if (!state.alertsOn) { toast('Schalte zuerst unten die Preis-Alarme ein'); $('notifyCard').scrollIntoView({ behavior: 'smooth' }); return; }
        try {
          if (state.alerts.has(alertId)) await removeAlert(state.origin, s);
          else await addAlert(state.origin, s);
          renderSaved();
        } catch (_) { toast('Das hat nicht geklappt'); }
      });
      li.querySelector('.remove').addEventListener('click', () => toggleSaved(s));
      list.appendChild(li);
      loadWeek(li, s, start);
    }
  }

  async function loadWeek(li, to, start) {
    const week = li.querySelector('.week');
    try {
      const data = await api(`/api/week?from=${state.origin.id}&to=${to.id}&start=${start}`);
      week.innerHTML = '';
      for (const d of data.days) {
        const a = document.createElement('a');
        a.className = 'day' + (data.lowest && d.date === data.lowest.date ? ' low' : '');
        a.target = '_blank';
        a.rel = 'noopener';
        a.href = bookingUrl(state.origin, to, d.dep || `${d.date}T06:00:00`);
        a.innerHTML = `${WD[dow(d.date)]}<b>${d.price != null ? d.price.toFixed(2).replace('.', ',') : '–'}</b>`;
        week.appendChild(a);
      }
      li.querySelector('.low-label').textContent = data.lowest
        ? `ab ${euro(data.lowest.price)} (${dayLabel(data.lowest.date)})`
        : 'noch keine Preise';
    } catch (_) {
      week.innerHTML = '<span class="muted small" style="grid-column: 1 / -1">Preise nicht verfügbar</span>';
    }
  }

  // ---------- alerts (ntfy) ----------
  async function addAlert(from, to) {
    await api('/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ topic: state.topic, from: { id: from.id, name: from.name }, to }),
    });
    state.alerts.add(`${from.id}-${to.id}`);
    toast(`Alarm für ${to.name} aktiv. Der aktuelle Bestpreis kommt gleich per ntfy.`);
  }
  async function removeAlert(from, to) {
    const id = `${from.id}-${to.id}`;
    await api(`/api/alerts/${id}?topic=${encodeURIComponent(state.topic)}`, { method: 'DELETE' });
    state.alerts.delete(id);
  }
  async function syncAlerts() {
    try {
      const list = await api('/api/alerts?topic=' + encodeURIComponent(state.topic));
      state.alerts = new Set(list.map(a => a.id));
    } catch (_) { /* offline */ }
  }

  $('topicCode').textContent = state.topic;
  $('copyTopic').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.topic); toast('Kanalname kopiert'); }
    catch (_) { toast(state.topic); }
  });
  const alertsToggle = $('alertsOn');
  alertsToggle.checked = state.alertsOn;
  alertsToggle.addEventListener('change', async () => {
    state.alertsOn = alertsToggle.checked;
    store.set('alertsOn', state.alertsOn);
    if (state.alertsOn && state.origin && state.saved.length) {
      for (const s of state.saved) {
        if (!state.alerts.has(`${state.origin.id}-${s.id}`)) await addAlert(state.origin, s).catch(() => {});
      }
    } else if (!state.alertsOn && state.origin) {
      for (const id of [...state.alerts]) {
        const to = state.saved.find(s => id.endsWith('-' + s.id)) || { id: id.split('-')[1] };
        await removeAlert({ id: id.split('-')[0] }, to).catch(() => {});
      }
    }
    renderSaved();
  });

  // ---------- install ----------
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    $('installBtn').hidden = false;
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('installBtn').hidden = true;
  });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isIOS && !standalone) $('iosHint').hidden = false;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ---------- misc ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }
  function randomId(n) {
    const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
  }

  // ---------- start ----------
  renderChips();
  renderOrigin();
  if (state.origin) loadDeals();
  syncAlerts().then(renderSaved);
})();
