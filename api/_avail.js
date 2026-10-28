'use strict';
// La Columbera · MOTORE UNICO di disponibilità e prenotazioni (fail-closed).
// Il prefisso "_" evita che Vercel lo esponga come endpoint: è un modulo condiviso da x.js e stripe-webhook.js.
//
// Regole (valgono per calendario pubblico, checkout, admin, export iCal, riconciliazione):
//  1. Un solo calcolo dell'occupazione: computeOccupancy(). Nessun altro file calcola "busy" per conto suo.
//  2. Occupazione = feed iCal (ultimo snapshot valido) + registro Google Sheet (snapshot) + prenotazioni del sito
//     + hold temporanei (checkout in corso) + blocchi manuali + chiusura appartamento.
//  3. Un errore NON è mai "nessun dato": un feed che non risponde mantiene l'ultimo snapshot valido; se non esiste
//     (o è troppo vecchio) il lato ospite risponde "non verificabile" invece di mostrare date libere.
//  4. Date = stringhe ISO "YYYY-MM-DD", intervalli [check-in, check-out) (check-out escluso), fuso Europe/Rome.
//  5. Gli hold sono acquisiti con uno script Lua atomico su Redis: due checkout contemporanei non possono
//     ottenere le stesse notti.
const crypto = require('crypto');

const TZ = 'Europe/Rome';
const MIN = 60e3;
const DAY = 864e5;
const SEV = { CRITICO: 0, ALTO: 1, MEDIO: 2, BASSO: 3 };
const STATI = new Set(['CONFERMATA', 'IN_ATTESA', 'ANNULLATA', 'DA_VERIFICARE']);
const FONTI = new Set(['BOOKING', 'AIRBNB', 'SITO', 'MANUALE']);
const SRC = { BOOKING: 'BOOKING_ICAL', AIRBNB: 'AIRBNB_ICAL', ALTRO: 'ALTRO_ICAL' };

/* ============================ date: stringhe ISO, intervalli [da, a) ============================ */
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const validDate = s => {
  const m = RE_ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const isIso = s => typeof s === 'string' && validDate(s);
const toIso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return toIso(d); };
// notti occupate da un soggiorno: check-in incluso, check-out escluso
const rangeDays = (from, to, cap = 1500) => {
  const o = [];
  if (!isIso(from) || !isIso(to)) return o;
  for (let d = from; d < to && o.length < cap; d = addDays(d, 1)) o.push(d);
  return o;
};
const nightsBetween = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
const mkFmt = tz => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const FMT_ROME = mkFmt(TZ);
const wallParts = (fmt, ms) => { const p = {}; for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value; return p; };
const romeDate = ms => { const p = wallParts(FMT_ROME, ms); return p.year + '-' + p.month + '-' + p.day; };
const todayRome = (now = Date.now()) => romeDate(now);
// ora "a muro" in un fuso qualsiasi -> istante UTC (2 passate per gestire il cambio ora legale)
function zonedToUtcMs(y, mo, d, h, mi, s, tz) {
  const fmt = mkFmt(tz), target = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = target;
  for (let k = 0; k < 2; k++) {
    const p = wallParts(fmt, guess);
    guess -= Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - target;
  }
  return guess;
}
const sha1 = s => crypto.createHash('sha1').update(String(s)).digest('hex');
const hmac = (secret, msg) => crypto.createHmac('sha256', String(secret)).update(String(msg)).digest('hex');
const clean = m => String(m == null ? '' : m).replace(/https?:\/\/\S+/g, '[url]').slice(0, 160);
const bkParse = s => { if (s == null) return null; try { return JSON.parse(s); } catch { return null; } };
const ageMin = (isoStr, t) => isoStr ? (t - Date.parse(isoStr)) / MIN : Infinity;
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);

/* ============================ preavviso minimo di prenotazione (solo prenotazioni dirette dal sito) ============================ */
// Chi prenota dal sito deve farlo con almeno `giorni` giorni di anticipo sul check-in. Lo imposta il titolare dal pannello admin
// (config.preavvisoGiorni + config.checkinOra, salvati in KV insieme al resto della configurazione).
//  - Il conto è in "ora a muro" di Roma, non in multipli di 24 ore: "2 giorni prima" è lo stesso orario di due giorni fa, anche se in mezzo cambia l'ora legale.
//  - giorni = 0: nessun preavviso, si può prenotare fino alla fine del giorno di arrivo (è il comportamento storico del sito).
//  - giorni ≥ 1: l'ultimo istante utile per un arrivo del giorno D sono le HH:MM del check-in del giorno D − giorni, estremo incluso.
// Non tocca: export iCal verso Booking/Airbnb (hanno le loro regole), prenotazioni già confermate, blocchi manuali, hold e conferma del pagamento.
const NOTICE_MAX_DAYS = 365, NOTICE_DEFAULT_HHMM = '16:00', RE_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toInt = v => ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isInteger(Number(v))) ? Number(v) : null;
// lettura tollerante dalla configurazione salvata: valore assente o non valido = nessun preavviso / orario di default (la configurazione vecchia non ha questi campi)
function noticeSettings(src) {
  const g = toInt(src && src.preavvisoGiorni), h = src && src.checkinOra;
  return { giorni: g !== null && g >= 0 && g <= NOTICE_MAX_DAYS ? g : 0, ora: RE_HHMM.test(h) ? h : NOTICE_DEFAULT_HHMM };
}
// validazione RIGOROSA di quanto arriva dal pannello: un campo non inviato (undefined, es. pagina admin non aggiornata) tiene il valore già salvato
function parseNoticeInput(b, old) {
  const cur = noticeSettings(old), out = { giorni: cur.giorni, ora: cur.ora };
  if (b.preavvisoGiorni !== undefined) {
    const g = toInt(b.preavvisoGiorni);
    if (g === null || g < 0 || g > NOTICE_MAX_DAYS) return { err: 'Preavviso minimo non valido: inserisci un numero intero di giorni da 0 a ' + NOTICE_MAX_DAYS };
    out.giorni = g;
  }
  if (b.checkinOra !== undefined) {
    if (!RE_HHMM.test(b.checkinOra)) return { err: 'Orario di check-in non valido: usa il formato HH:MM (es. 15:00)' };
    out.ora = b.checkinOra;
  }
  return out;
}
// ultimo istante (ms UTC) in cui si può ancora prenotare un arrivo del giorno `checkin`, estremo incluso
function noticeCutoffMs(checkin, st) {
  if (!isIso(checkin)) return NaN;
  const ymd = s => s.split('-').map(Number);
  if (st.giorni === 0) { const [y, m, d] = ymd(addDays(checkin, 1)); return zonedToUtcMs(y, m, d, 0, 0, 0, TZ) - 1; }   // fine del giorno di arrivo (Roma)
  const [y, m, d] = ymd(addDays(checkin, -st.giorni)), [h, mi] = st.ora.split(':').map(Number);
  return zonedToUtcMs(y, m, d, h, mi, 0, TZ);
}
const noticeOk = (checkin, nowMs, st) => isIso(checkin) && nowMs <= noticeCutoffMs(checkin, st);
// primo giorno di arrivo prenotabile all'istante nowMs
function minCheckinDate(nowMs, st) {
  let c = addDays(todayRome(nowMs), st.giorni);
  for (let i = 0; i < 3 && nowMs > noticeCutoffMs(c, st); i++) c = addDays(c, 1);
  return c;
}

/* ============================ orizzonte di prenotazione per gli ospiti ============================ */
// Dal sito si prenota al massimo GUEST_MONTHS mesi in avanti: il calendario non mostra date più lontane e il server le rifiuta.
// Ultimo giorno scegliibile (anche come partenza) = oggi + 6 mesi, stesso giorno del mese (o l'ultimo, se il mese di arrivo è più corto: 31 agosto → 28 febbraio).
const GUEST_MONTHS = 6;
const addMonthsIso = (s, n) => {
  const [y, m, d] = s.split('-').map(Number), t = m - 1 + n, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
  return toIso(new Date(Date.UTC(yy, mm, Math.min(d, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()))));
};
const maxBookingDate = nowMs => addMonthsIso(todayRome(nowMs), GUEST_MONTHS);

/* ============================ parser iCal ============================ */
function splitUnquoted(s, sep) {
  const out = []; let cur = '', q = false;
  for (const ch of s) { if (ch === '"') q = !q; if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur);
  return out;
}
function parseLine(line) {
  let q = false, i = 0;
  for (; i < line.length; i++) { const ch = line[i]; if (ch === '"') q = !q; else if (ch === ':' && !q) break; }
  if (i >= line.length) return null;
  const parts = splitUnquoted(line.slice(0, i), ';'), name = parts[0].trim().toUpperCase();
  if (!name) return null;
  const params = {};
  for (const p of parts.slice(1)) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).trim().toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); }
  return { name, params, value: line.slice(i + 1) };
}
const unesc = s => String(s == null ? '' : s).replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1');

// DTSTART/DTEND: DATE (20261010), UTC (20261010T140000Z), TZID=… o fluttuante -> data di Roma
function icalDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const date = m[1] + '-' + m[2] + '-' + m[3];
  if (!validDate(date)) return null;
  if (m[4] === undefined) return { date, allDay: true };
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number);
  if (h > 23 || mi > 59 || s > 60) return null;
  let utc;
  if (m[7] === 'Z') utc = Date.UTC(y, mo - 1, d, h, mi, s);
  else {
    const tz = params && params.TZID;
    if (!tz || tz === TZ) return { date, allDay: false };
    try { utc = zonedToUtcMs(y, mo, d, h, mi, s, tz); } catch { return null; }
  }
  return { date: romeDate(utc), allDay: false };
}
const durDays = v => {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(v).trim());
  return m ? (+m[1] || 0) * 7 + (+m[2] || 0) : null;
};
const evKey = e => e.uid || (e.start + '|' + e.end + '|' + e.summary);
const cmpVersion = (a, b) => (a.seq - b.seq) || (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0);

// Ritorna { valid, error, events[], invalid[], cancelled, dupDropped, dupRanges, warnings[], hash }.
// valid=false => il chiamante NON deve usare il risultato (errore di rete/formato) e deve tenere l'ultimo snapshot valido.
// valid=true con events=[] => calendario realmente vuoto.
function parseICS(text) {
  const res = { valid: false, error: null, events: [], invalid: [], cancelled: 0, dupDropped: 0, dupRanges: 0, warnings: [], hash: null };
  if (typeof text !== 'string' || !text.trim()) { res.error = 'CORPO_VUOTO'; return res; }
  const t = text.replace(/^\uFEFF/, '');
  if (!/^\s*BEGIN:VCALENDAR/i.test(t)) { res.error = 'NON_ICAL'; return res; }          // es. pagina HTML di errore
  if (!/END:VCALENDAR\s*$/i.test(t)) { res.error = 'TRONCATO'; return res; }           // download interrotto
  const lines = t.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');      // CRLF/LF + line folding
  const raw = [];
  let ev = null, depth = 0;
  for (const line of lines) {
    if (!line) continue;
    if (/^BEGIN:VEVENT\s*$/i.test(line)) { if (ev) { res.error = 'TRONCATO'; return res; } ev = { props: {} }; depth = 0; continue; }
    if (/^END:VEVENT\s*$/i.test(line)) { if (ev) raw.push(ev); ev = null; continue; }
    if (!ev) continue;
    if (/^BEGIN:/i.test(line)) { depth++; continue; }                                  // VALARM ecc.
    if (/^END:/i.test(line)) { if (depth > 0) depth--; continue; }
    if (depth > 0) continue;
    const p = parseLine(line);
    if (p && !(p.name in ev.props)) ev.props[p.name] = p;
  }
  if (ev) { res.error = 'TRONCATO'; return res; }
  const list = [];
  for (const e of raw) {
    const P = e.props, g = n => (P[n] ? P[n].value : '');
    const uid = unesc(g('UID')).trim(), status = g('STATUS').trim().toUpperCase();
    const summary = unesc(g('SUMMARY')).trim().slice(0, 200), desc = unesc(g('DESCRIPTION')).slice(0, 600);
    const bad = reason => res.invalid.push({ uid, summary: summary.slice(0, 60), reason });
    if (!P.DTSTART) { bad('DTSTART_MANCANTE'); continue; }
    const s = icalDate(P.DTSTART.value, P.DTSTART.params);
    if (!s) { bad('DTSTART_NON_VALIDO'); continue; }
    let end;
    if (P.DTEND) { const e2 = icalDate(P.DTEND.value, P.DTEND.params); if (!e2) { bad('DTEND_NON_VALIDO'); continue; } end = e2.date; }
    else if (P.DURATION) { const dd = durDays(P.DURATION.value); if (dd === null) { bad('DURATION_NON_VALIDA'); continue; } end = addDays(s.date, dd || 1); }
    else end = addDays(s.date, 1);                                                      // nessuna fine: 1 notte (conservativo)
    if (end < s.date) { bad('FINE_PRIMA_DELL_INIZIO'); continue; }
    let short = false;
    if (end === s.date) { end = addDays(s.date, 1); short = true; }                     // durata zero/stesso giorno: blocca 1 notte
    if (status === 'CANCELLED') { res.cancelled++; continue; }                          // annullato esplicitamente dalla fonte
    if (P.RRULE) res.warnings.push('RRULE_NON_SUPPORTATA:' + (uid || summary).slice(0, 40));
    const hint = /\bHM[A-Z0-9]{8}\b/.exec(desc + ' ' + summary);
    list.push({ uid, start: s.date, end, summary, status: status || 'CONFIRMED', seq: parseInt(g('SEQUENCE'), 10) || 0, stamp: g('DTSTAMP').trim(), codeHint: hint ? hint[0] : '', short });
  }
  // duplicati: stessa UID -> tengo la versione più recente (SEQUENCE, poi DTSTAMP); stessa UID con date diverse e versione uguale -> tengo entrambe
  const byKey = new Map();
  for (const e of list) {
    const key = e.uid || ('~' + sha1(e.summary + '|' + e.start + '|' + e.end).slice(0, 16)), cur = byKey.get(key);
    if (!cur) { byKey.set(key, e); continue; }
    const c = cmpVersion(e, cur);
    if (e.start === cur.start && e.end === cur.end) { res.dupDropped++; if (c > 0) byKey.set(key, e); continue; }
    if (c > 0) { res.dupDropped++; byKey.set(key, e); }
    else if (c < 0) res.dupDropped++;
    else { byKey.set(key + '#' + e.start + '#' + e.end, e); res.warnings.push('UID_CONFLITTO:' + e.uid.slice(0, 40)); }
  }
  res.events = [...byKey.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
  const seenRange = new Set();
  for (const e of res.events) { const k = e.start + '|' + e.end; if (seenRange.has(k)) res.dupRanges++; seenRange.add(k); }
  res.hash = sha1(JSON.stringify(res.events.map(e => [e.uid, e.start, e.end, e.status])));
  res.valid = true;
  return res;
}

/* ============================ export iCal verso Booking/Airbnb ============================ */
function icalFeed(id, set, stampMs) {
  const dd = [...set].sort(), ranges = [];
  for (const d of dd) { const last = ranges[ranges.length - 1]; if (last && addDays(last.end, 1) === d) last.end = d; else ranges.push({ start: d, end: d }); }
  const stamp = new Date(stampMs == null ? Date.now() : stampMs).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').replace('Z', '') + 'Z';
  let out = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//La Columbera//Prenotazioni//IT\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:La Columbera ' + id + '\r\n';
  for (const r of ranges) out += 'BEGIN:VEVENT\r\nUID:' + r.start + '-' + r.end + '-' + id + '@lacolumbera\r\nDTSTAMP:' + stamp + '\r\nDTSTART;VALUE=DATE:' + r.start.replace(/-/g, '') + '\r\nDTEND;VALUE=DATE:' + addDays(r.end, 1).replace(/-/g, '') + '\r\nSUMMARY:Occupato - La Columbera\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\n';
  return out + 'END:VCALENDAR\r\n';
}

/* ============================ hold atomici (Lua, un hash per appartamento) ============================ */
// holds:{apt}  campo = data ISO, valore = "codice|scadenza_ms". Scadenza controllata dall'app (non serve SCAN).
const LUA_ACQUIRE = `
local now = tonumber(ARGV[1])
local code = ARGV[2]
local exp = ARGV[3]
for i = 4, #ARGV do
  local v = redis.call('HGET', KEYS[1], ARGV[i])
  if v then
    local c, e = string.match(v, '^([^|]*)|(%d+)$')
    if c and c ~= code and tonumber(e) > now then
      return {0, ARGV[i], c}
    end
  end
end
for i = 4, #ARGV do
  redis.call('HSET', KEYS[1], ARGV[i], code .. '|' .. exp)
end
return {1}
`;
const LUA_RELEASE = `
local code = ARGV[1]
local n = 0
for i = 2, #ARGV do
  local v = redis.call('HGET', KEYS[1], ARGV[i])
  if v and string.sub(v, 1, #code + 1) == code .. '|' then
    redis.call('HDEL', KEYS[1], ARGV[i])
    n = n + 1
  end
end
return {n}
`;

const K = {
  ics: id => 'ics:' + id, reg: 'reg:snap', holds: apt => 'holds:' + apt, bkh: 'bkh', bkMig: 'bkh:migrated',
  outbox: 'outbox:sheet', log: 'sync:log', recon: 'reconcile:last', lockFeeds: 'lock:feeds', lockReg: 'lock:reg',
  done: (code, step) => 'done:' + code + ':' + step, lock: (code, step) => 'lock:' + code + ':' + step
};
const hashToObj = r => {
  if (!r) return {};
  if (!Array.isArray(r)) return r;
  const o = {};
  for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = r[i + 1];
  return o;
};
const hashToList = r => Object.values(hashToObj(r));

function srcOf(u) {
  let h = '';
  try { h = new URL(u).hostname.toLowerCase(); } catch { /* resta '' */ }
  const s = h || String(u).toLowerCase();
  return /booking/.test(s) ? 'BOOKING' : /airbnb/.test(s) ? 'AIRBNB' : 'ALTRO';
}
const labelOf = u => { let h = 'feed'; try { h = new URL(u).hostname; } catch { /* */ } return h + '/…' + sha1(u).slice(0, 4); };   // mai l'URL: contiene token segreti

const thresholds = env => ({
  feedFreshMin: num(env.FEED_FRESH_MIN, 10),          // oltre questa età si prova a riscaricare il feed
  feedRetryMin: num(env.FEED_RETRY_MIN, 2),           // attesa tra due tentativi su un feed in errore
  feedMaxStaleMin: num(env.FEED_MAX_STALE_MIN, 120),  // oltre: lato ospite "non verificabile"
  regFreshMin: num(env.REG_FRESH_MIN, 10),
  regMaxStaleMin: num(env.REG_MAX_STALE_MIN, 180),
  feedTimeoutMs: num(env.FEED_TIMEOUT_MS, 6000),
  regTimeoutMs: num(env.REG_TIMEOUT_MS, 8000),
  holdTtlSec: num(env.HOLD_TTL_SEC, 2110),            // sessione Stripe 1810 s + 300 s di margine
  horizonDays: num(env.ORIZZONTE_MAX_GIORNI, 365)
});

/* ============================ ENGINE ============================ */
function makeEngine(deps) {
  const env = deps.env || process.env;
  const kv = deps.kv, kvp = deps.kvp;
  const doFetch = deps.fetch || ((...a) => globalThis.fetch(...a));
  const now = deps.now || (() => Date.now());
  const T = thresholds(env);
  const iso = t => new Date(t).toISOString();
  let migrated = false;

  /* ---------- feed ---------- */
  function feedsFor(config) {
    const out = [];
    for (const apt of (config.apts || [])) {
      const cf = (config.ical && config.ical[apt.id]) ? String(config.ical[apt.id]) : '';
      const en = env['ICAL_' + String(apt.id).toUpperCase()] || '';
      const seen = new Set();
      let bad = 0;
      for (const u of (cf + ',' + en).split(',').map(s => s.trim()).filter(Boolean)) {
        if (seen.has(u)) continue;
        seen.add(u);
        if (!/^https?:\/\/\S+$/i.test(u)) { out.push({ apt: apt.id, url: null, source: 'ALTRO', feedId: apt.id + ':bad' + (++bad), label: 'URL non valido', invalid: true }); continue; }
        out.push({ apt: apt.id, url: u, source: srcOf(u), feedId: apt.id + ':' + sha1(u).slice(0, 10), label: labelOf(u) });
      }
    }
    return out;
  }
  function feedHealth(s, t) {
    if (!s || !s.lastSuccess) return 'NEVER';
    const age = ageMin(s.lastSuccess, t);
    if (!(age <= T.feedMaxStaleMin)) return 'EXPIRED';
    if (s.status !== 'OK' || !(age <= T.feedFreshMin * 2)) return 'STALE';
    return 'OK';
  }
  function regHealth(s, t) {
    if (!s || !s.lastSuccess) return 'NEVER';
    const age = ageMin(s.lastSuccess, t);
    if (!(age <= T.regMaxStaleMin)) return 'EXPIRED';
    if (s.status !== 'OK' || !(age <= T.regFreshMin * 2)) return 'STALE';
    return 'OK';
  }
  const feedDue = (s, t) => {
    if (!s) return true;
    if (s.status === 'OK' && s.lastSuccess) return !(ageMin(s.lastSuccess, t) <= T.feedFreshMin);
    return !(ageMin(s.lastAttempt, t) <= T.feedRetryMin);
  };
  const regDue = (s, t) => {
    if (!s) return true;
    if (s.status === 'OK' && s.lastSuccess) return !(ageMin(s.lastSuccess, t) <= T.regFreshMin);
    return !(ageMin(s.lastAttempt, t) <= T.feedRetryMin);
  };
  async function fetchText(url, timeoutMs, headers) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await doFetch(url, { signal: ctl.signal, redirect: 'follow', headers });
      const body = await r.text();
      return { ok: r.ok, http: r.status, body };
    } catch (e) {
      const code = e && e.name === 'AbortError' ? 'TIMEOUT' : ((e && e.cause && e.cause.code) || 'RETE');
      return { ok: false, http: 0, error: code + ': ' + clean(e && e.message) };
    } finally { clearTimeout(timer); }
  }
  async function getSnaps(feeds) {
    if (!feeds.length) return [];
    return (await kvp(feeds.map(f => ['GET', K.ics(f.feedId)]))).map(bkParse);
  }
  // Scarica un feed e aggiorna lo snapshot. Un fallimento NON azzera gli eventi: resta l'ultimo snapshot valido.
  async function refreshFeed(feed) {
    const t = now();
    const prev = bkParse(await kv('GET', K.ics(feed.feedId)));
    const base = prev || { feedId: feed.feedId, events: [], lastSuccess: null, eventCount: 0, hash: null, consecutiveFailures: 0, firstSeen: {}, lastChange: null };
    let r;
    if (!feed.url) r = { ok: false, http: 0, error: 'URL_NON_VALIDO' };
    else {
      r = await fetchText(feed.url, T.feedTimeoutMs, { 'User-Agent': 'LaColumberaSync/2', Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5' });
      if (r.ok) {
        const p = parseICS(r.body);
        r = p.valid ? { ok: true, http: r.http, parsed: p } : { ok: false, http: r.http, error: p.error };
      } else if (!r.error) r = { ok: false, http: r.http, error: 'HTTP_' + r.http };
    }
    let snap;
    if (r.ok) {
      const p = r.parsed, fs = {}, prevFs = base.firstSeen || {};
      for (const e of p.events) fs[evKey(e)] = prevFs[evKey(e)] || iso(t);
      snap = Object.assign({}, base, {
        feedId: feed.feedId, apt: feed.apt, source: feed.source, label: feed.label, events: p.events, eventCount: p.events.length,
        hash: p.hash, lastAttempt: iso(t), lastSuccess: iso(t), status: 'OK', http: r.http, error: null, consecutiveFailures: 0,
        invalid: p.invalid.length, invalidList: p.invalid.slice(0, 5), cancelled: p.cancelled, dupDropped: p.dupDropped, dupRanges: p.dupRanges,
        warnings: p.warnings.slice(0, 5), firstSeen: fs, lastChange: base.hash !== p.hash ? iso(t) : (base.lastChange || iso(t)),
        emptyAfterNonEmpty: (base.eventCount || 0) > 0 && p.events.length === 0
      });
    } else {
      snap = Object.assign({}, base, { feedId: feed.feedId, apt: feed.apt, source: feed.source, label: feed.label, lastAttempt: iso(t), status: 'ERROR', http: r.http || 0, error: r.error, consecutiveFailures: (base.consecutiveFailures || 0) + 1 });
    }
    await kv('SET', K.ics(feed.feedId), JSON.stringify(snap), 'EX', String(90 * 86400));
    return snap;
  }
  async function refreshFeedList(list, force) {
    if (!list.length) return [];
    if (!force && (await kv('SET', K.lockFeeds, '1', 'NX', 'EX', '45')) !== 'OK') return [];
    try {
      const rs = await Promise.allSettled(list.map(refreshFeed));
      const bad = rs.find(x => x.status === 'rejected');
      if (bad) throw bad.reason;
      return rs.map(x => x.value);
    } finally { if (!force) await kv('DEL', K.lockFeeds).catch(() => {}); }
  }
  async function refreshFeeds(config, { force = false } = {}) {
    const feeds = feedsFor(config), t = now();
    const snaps = await getSnaps(feeds);
    return refreshFeedList(feeds.filter((f, i) => force || feedDue(snaps[i], t)), force);
  }

  /* ---------- registro (Google Sheet via Apps Script web app) ---------- */
  function normReg(r, aptIds) {
    const codice = String(r.codice == null ? '' : r.codice).trim();
    if (!codice) return { bad: 'CODICE_MANCANTE' };
    const stato = String(r.stato || '').toUpperCase();
    if (!STATI.has(stato)) return { bad: 'STATO_NON_VALIDO', codice };
    let fonte = String(r.fonte || '').toUpperCase();
    if (!FONTI.has(fonte)) fonte = 'MANUALE';
    const a = String(r.apt || '').toLowerCase(), apt = aptIds.includes(a) ? a : '';
    let checkin = isIso(r.checkin) ? r.checkin : '', checkout = isIso(r.checkout) ? r.checkout : '';
    const n = parseInt(r.notti, 10) || 0, flags = [];
    if (checkin && (!checkout || checkout <= checkin)) checkout = n > 0 ? addDays(checkin, n) : '';
    if (stato !== 'ANNULLATA') {
      if (!checkin) return { bad: 'CHECKIN_NON_VALIDO', codice };
      if (!checkout) { checkout = addDays(checkin, 1); flags.push('NOTTI_ASSENTI'); }   // fail-closed: almeno 1 notte
    }
    return { row: { id: fonte + '|' + codice.toUpperCase(), fonte, codice, apt, checkin, checkout, notti: checkin && checkout ? nightsBetween(checkin, checkout) : 0, ospiti: parseInt(r.ospiti, 10) || 0, stato, uid: String(r.uid || ''), motivo: String(r.motivo || ''), creata: r.creata || '', aggiornata: r.aggiornata || '', ultimoSeen: r.ultimoSeen || '', annullata: r.annullata || '', note: String(r.note || '').slice(0, 300), flags } };
  }
  async function webappGet(action, extra) {
    const url = env.SHEET_WEBAPP_URL, secret = env.SHEET_SECRET;
    if (!url) return { ok: false, error: 'SHEET_WEBAPP_URL_MANCANTE' };
    if (!secret) return { ok: false, error: 'SHEET_SECRET_MANCANTE' };
    const ts = String(now()), p = (extra && extra.code) ? String(extra.code) : '';
    const u = url + (url.includes('?') ? '&' : '?') + 'action=' + action + '&ts=' + ts + '&sig=' + hmac(secret, ts + '.' + action + '.' + p) + (p ? '&code=' + encodeURIComponent(p) : '');
    const r = await fetchText(u, T.regTimeoutMs, { Accept: 'application/json' });
    if (!r.ok) return { ok: false, http: r.http, error: r.error || ('HTTP_' + r.http) };
    let j;
    try { j = JSON.parse(r.body); } catch { return { ok: false, http: r.http, error: 'RISPOSTA_NON_JSON' }; }
    if (!j || j.ok !== true || j.schema !== 2) return { ok: false, http: r.http, error: (j && j.error) ? 'WEBAPP: ' + clean(j.error) : 'WEBAPP_OBSOLETO_O_RISPOSTA_NON_VALIDA' };
    return { ok: true, http: r.http, data: j };
  }
  async function refreshRegistry(config, { force = false } = {}) {
    const t = now(), prev = bkParse(await kv('GET', K.reg));
    if (!force && !regDue(prev, t)) return { skipped: true };
    if (!force && (await kv('SET', K.lockReg, '1', 'NX', 'EX', '45')) !== 'OK') return { skipped: true, locked: true };
    try {
      const aptIds = (config.apts || []).map(a => a.id);
      const r = await webappGet('export');
      let snap;
      if (r.ok && Array.isArray(r.data.rows)) {
        const rows = [], invalid = [];
        for (const x of r.data.rows) { const n = normReg(x, aptIds); if (n.row) rows.push(n.row); else invalid.push({ codice: n.codice || '', reason: n.bad }); }
        if (rows.length === 0 && prev && (prev.count || 0) >= 3) r.ok = false, r.error = 'REGISTRO_VUOTO_SOSPETTO';   // un foglio che si svuota di colpo è più probabilmente un errore che la realtà
        else snap = { rows, invalid, count: rows.length, total: +r.data.total || rows.length, generatedAt: r.data.generatedAt || null, sheetTz: r.data.tz || null, lastAttempt: iso(t), lastSuccess: iso(t), status: 'OK', http: r.http, error: null, consecutiveFailures: 0 };
      }
      if (!snap) snap = Object.assign({ rows: [], invalid: [], count: 0 }, prev || {}, { lastAttempt: iso(t), status: 'ERROR', http: r.http || 0, error: r.error || 'ERRORE', consecutiveFailures: ((prev && prev.consecutiveFailures) || 0) + 1 });
      await kv('SET', K.reg, JSON.stringify(snap), 'EX', String(90 * 86400));
      return { ok: snap.status === 'OK', snap };
    } finally { if (!force) await kv('DEL', K.lockReg).catch(() => {}); }
  }
  const regPayload = b => ({
    fonte: 'SITO', codice: b.code, apt: b.id, checkin: b.da, checkout: b.a, notti: b.notti, ospiti: b.ospiti,
    stato: ({ confermata: 'CONFERMATA', in_attesa: 'IN_ATTESA', annullata: 'ANNULLATA', richiesta: 'IN_ATTESA', da_verificare: 'DA_VERIFICARE' })[b.stato] || 'DA_VERIFICARE',
    note: b.note || '', creata: b.creato || '', annullata: b.annullata_il || ''
  });
  // upsert idempotente sul foglio (chiave FONTE|CODICE). Non lancia mai: ritorna {ok,...}
  async function webappUpsert(b) {
    const url = env.SHEET_WEBAPP_URL, secret = env.SHEET_SECRET;
    if (!url) return { ok: false, error: 'SHEET_WEBAPP_URL_MANCANTE' };
    if (!secret) return { ok: false, error: 'SHEET_SECRET_MANCANTE' };
    const p = regPayload(b);
    const body = JSON.stringify({ secret, action: 'upsert', booking: p, code: p.codice, checkin: p.checkin.split('-').reverse().join('/'), appartamento: b.id, ospiti: p.ospiti, notti: p.notti });   // i campi "legacy" servono solo se il foglio ha ancora il vecchio script
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'follow', signal: ctl.signal });
      const j = bkParse(await r.text());
      return j && j.ok === true ? { ok: true, result: j.result || j.action || 'ok' } : { ok: false, error: (j && j.error) ? 'WEBAPP: ' + clean(j.error) : 'HTTP_' + r.status };
    } catch (e) { return { ok: false, error: (e && e.name === 'AbortError' ? 'TIMEOUT' : 'RETE') + ': ' + clean(e && e.message) }; }
    finally { clearTimeout(timer); }
  }
  // In coda va solo ciò che serve al foglio: nome, email e telefono dell'ospite NON vengono duplicati (restano solo nel registro delle prenotazioni del sito).
  async function outboxPush(b) {
    const m = { code: b.code, id: b.id, da: b.da, a: b.a, notti: b.notti, ospiti: b.ospiti, stato: b.stato, note: b.note, creato: b.creato, annullata_il: b.annullata_il };
    await kv('RPUSH', K.outbox, JSON.stringify({ code: b.code, booking: m, ts: iso(now()) }));
  }
  async function outboxDrain(max = 20) {
    let done = 0, failed = 0;
    for (let i = 0; i < max; i++) {
      const raw = ((await kv('LRANGE', K.outbox, '0', '0')) || [])[0];
      if (!raw) break;
      const it = bkParse(raw);
      if (it && it.booking) {
        const r = await webappUpsert(it.booking);
        if (!r.ok) { failed++; break; }                 // web app giù: si riprova al prossimo giro, l'elemento resta in coda
      }
      await kv('LREM', K.outbox, '1', raw);             // rimosso SOLO dopo il successo (upsert idempotente: un doppio invio è innocuo)
      done++;
    }
    return { done, failed, pending: +(await kv('LLEN', K.outbox)) || 0 };
  }
  // registra su foglio; se non raggiungibile accoda per il drain (mai perdere una prenotazione confermata)
  async function registerBooking(b) {
    const r = await webappUpsert(b);
    if (!r.ok) { await outboxPush(b); return { ok: false, queued: true, error: r.error }; }
    return { ok: true };
  }

  /* ---------- prenotazioni del sito: un hash Redis (un campo per prenotazione, niente lost-update) ---------- */
  async function ensureBkMigrated() {
    if (migrated) return;
    if (!(await kv('GET', K.bkMig))) {
      const legacy = bkParse(await kv('GET', 'bk')), t = now();
      const cmds = (Array.isArray(legacy) ? legacy : []).filter(x => x && x.code && !(x.stato === 'in_attesa' && t - Date.parse(x.creato) > 40 * MIN))
        .map(x => ['HSETNX', K.bkh, String(x.code), JSON.stringify(x)]);
      if (cmds.length) await kvp(cmds);
      await kv('SET', K.bkMig, iso(t));
    }
    migrated = true;
  }
  async function bkAll() { await ensureBkMigrated(); return hashToList(await kv('HGETALL', K.bkh)).map(bkParse).filter(x => x && x.code); }
  async function bkGet(code) {
    await ensureBkMigrated();
    code = String(code || '').trim();
    if (!code) return null;
    let b = bkParse(await kv('HGET', K.bkh, code));
    if (!b) {                                              // transizione: prenotazione creata dalla versione precedente dopo la migrazione
      const legacy = bkParse(await kv('GET', 'bk'));
      b = (Array.isArray(legacy) ? legacy : []).find(x => x && String(x.code) === code) || null;
      if (b) await kv('HSETNX', K.bkh, code, JSON.stringify(b));
    }
    return b;
  }
  async function bkPut(b) { await kv('HSET', K.bkh, String(b.code), JSON.stringify(b)); return b; }
  async function bkDel(code) { await kv('HDEL', K.bkh, String(code)); }
  // i checkout abbandonati (mai pagati) non sono prenotazioni: dopo 3 giorni si eliminano. Le prenotazioni confermate/annullate NON si toccano mai.
  async function bkPurgePending() {
    const t = now(), dead = (await bkAll()).filter(x => x.stato === 'in_attesa' && t - Date.parse(x.creato) > 3 * DAY);
    if (dead.length) await kvp(dead.map(x => ['HDEL', K.bkh, String(x.code)]));
    return dead.length;
  }

  /* ---------- hold ---------- */
  async function holdAcquire(aptId, dates, code, ttlSec) {
    if (!dates.length) return { ok: false, error: 'NESSUNA_DATA' };
    const t = now(), exp = t + (ttlSec || T.holdTtlSec) * 1000;
    const r = await kv('EVAL', LUA_ACQUIRE, '1', K.holds(aptId), String(t), String(code), String(exp), ...dates);
    return Array.isArray(r) && +r[0] === 1 ? { ok: true, exp } : { ok: false, conflict: r && r[1], by: r && r[2] };
  }
  async function holdRelease(aptId, dates, code) {
    if (!dates.length) return 0;
    const r = await kv('EVAL', LUA_RELEASE, '1', K.holds(aptId), String(code), ...dates);
    return Array.isArray(r) ? +r[0] : 0;
  }
  async function holdsValid(aptId, dates, code) {
    const h = hashToObj(await kv('HGETALL', K.holds(aptId))), t = now();
    return dates.every(d => { const [c, e] = String(h[d] || '').split('|'); return c === String(code) && +e > t; });
  }
  async function holdPurge(aptIds) {
    const t = now(); let n = 0;
    for (const apt of aptIds) {
      const h = hashToObj(await kv('HGETALL', K.holds(apt))), dead = Object.keys(h).filter(d => !(+String(h[d]).split('|')[1] > t));
      if (dead.length) { await kvp(dead.map(d => ['HDEL', K.holds(apt), d])); n += dead.length; }
    }
    return n;
  }

  /* ---------- occupazione: UNICA funzione ---------- */
  async function loadAptState(config, aptId) {
    await ensureBkMigrated();
    const feeds = feedsFor(config).filter(f => f.apt === aptId);
    // ordine voluto: hold -> prenotazioni confermate -> registro -> feed (chi scrive conferma PRIMA di rilasciare l'hold)
    const res = await kvp([['HGETALL', K.holds(aptId)], ['HGETALL', K.bkh], ['GET', K.reg], ...feeds.map(f => ['GET', K.ics(f.feedId)])]);
    return { feeds, holds: hashToObj(res[0]), bks: hashToList(res[1]).map(bkParse).filter(x => x && x.code), reg: bkParse(res[2]), snaps: res.slice(3).map(bkParse) };
  }
  // carica lo stato e, se qualcosa è scaduto, prova a rinfrescarlo (con lock) prima di decidere
  async function loadFresh(config, aptId) {
    let st = await loadAptState(config, aptId);
    const t = now(), due = st.feeds.filter((f, i) => feedDue(st.snaps[i], t));
    const rDue = regDue(st.reg, t);
    if (due.length || rDue) {
      await Promise.allSettled([due.length ? refreshFeedList(due, false) : null, rDue ? refreshRegistry(config, { force: false }) : null]);
      st = await loadAptState(config, aptId);
    }
    return st;
  }
  function computeOccupancy(config, aptId, st, opts) {
    opts = opts || {};
    const mode = opts.mode || 'guest', t = now(), today = todayRome(t), aptIds = (config.apts || []).map(a => a.id);
    const days = {}, problems = [], feedInfo = [];
    const add = (d, src, ref, extra) => { (days[d] || (days[d] = [])).push(Object.assign({ src, ref: ref || '' }, extra || {})); };
    let fatal = false, degraded = false;
    const lastOk = [];
    st.feeds.forEach((f, i) => {
      const s = st.snaps[i], h = feedHealth(s, t);
      feedInfo.push({ feedId: f.feedId, apt: f.apt, source: f.source, label: f.label, health: h, lastAttempt: s && s.lastAttempt || null, lastSuccess: s && s.lastSuccess || null, http: s ? s.http : null, eventCount: s ? s.eventCount : null, error: s ? s.error : (f.invalid ? 'URL_NON_VALIDO' : null), consecutiveFailures: s ? s.consecutiveFailures : 0 });
      if (s && s.lastSuccess) lastOk.push(s.lastSuccess);
      if (h === 'NEVER') { fatal = true; problems.push({ code: 'FEED_MAI_CARICATO', feed: f.source + ' ' + f.apt, msg: (s && s.error) || 'nessun download riuscito' }); }
      else if (h === 'EXPIRED') { fatal = true; problems.push({ code: 'FEED_SCADUTO', feed: f.source + ' ' + f.apt, msg: 'ultimo successo ' + s.lastSuccess }); }
      else if (h === 'STALE') { degraded = true; problems.push({ code: 'FEED_STALE', feed: f.source + ' ' + f.apt, msg: (s.error || 'in ritardo') + ' · uso l\'ultimo snapshot' }); }
      if (!s || (opts.exclude && f.source === opts.exclude)) return;
      for (const e of (s.events || [])) for (const d of rangeDays(e.start, e.end)) add(d, SRC[f.source] || 'ALTRO_ICAL', e.uid, { feedId: f.feedId });
    });
    const rh = regHealth(st.reg, t);
    if (rh === 'NEVER') { fatal = true; problems.push({ code: 'REGISTRO_MAI_CARICATO', msg: (st.reg && st.reg.error) || 'nessun export riuscito' }); }
    else if (rh === 'EXPIRED') { fatal = true; problems.push({ code: 'REGISTRO_SCADUTO', msg: 'ultimo successo ' + st.reg.lastSuccess }); }
    else if (rh === 'STALE') { degraded = true; problems.push({ code: 'REGISTRO_STALE', msg: (st.reg.error || 'in ritardo') + ' · uso l\'ultimo snapshot' }); }
    if (st.reg && st.reg.lastSuccess) lastOk.push(st.reg.lastSuccess);
    const bkCodes = new Set(st.bks.map(b => String(b.code).toUpperCase()));
    for (const r of ((st.reg && st.reg.rows) || [])) {
      if (r.stato === 'ANNULLATA') continue;
      if (r.fonte === 'SITO' && bkCodes.has(r.codice.toUpperCase())) continue;           // per le prenotazioni del sito fa fede KV
      if (opts.exclude && r.fonte === opts.exclude) continue;
      const target = r.apt ? [r.apt] : aptIds;                                           // appartamento non determinato: li blocca entrambi
      if (!target.includes(aptId)) continue;
      for (const d of rangeDays(r.checkin, r.checkout)) add(d, 'SHEET', r.id, { fonte: r.fonte, stato: r.stato, nonAssegnata: !r.apt });
    }
    for (const b of st.bks) {
      if (b.id !== aptId || !['confermata', 'richiesta', 'da_verificare'].includes(b.stato)) continue;   // in_attesa: coperta dagli hold; annullata: libera
      for (const d of rangeDays(b.da, b.a)) add(d, 'SITO', b.code, { stato: b.stato });
    }
    for (const [d, v] of Object.entries(st.holds)) {
      const [code, exp] = String(v).split('|');
      if (+exp > t && code !== opts.ignoreHold) add(d, 'HOLD', code);
    }
    const p = (config.apts || []).find(x => x.id === aptId);
    if (p && p.blocked) for (const d of Object.keys(p.blocked)) if (p.blocked[d]) add(d, 'MANUALE', '');
    if (config.closed && config.closed[aptId]) for (let i = 0; i < 731; i++) add(addDays(today, i), 'CHIUSO', '');
    let notice = null;
    if (mode === 'guest') {
      // orizzonte: il più vicino tra i 6 mesi e il limite in giorni (ORIZZONTE_MAX_GIORNI). L'ultimo giorno scegliibile vale solo come partenza: la sua notte non si prenota
      const h0 = [addDays(today, T.horizonDays), maxBookingDate(t)].sort()[0]; for (let i = 0; i < 731; i++) add(addDays(h0, i), 'ORIZZONTE', '');
      // preavviso minimo: nessun soggiorno può iniziare prima del primo arrivo prenotabile adesso, quindi quelle notti non sono prenotabili dal sito
      const nt = noticeSettings(config), first = minCheckinDate(t, nt);
      for (let d = today; d < first; d = addDays(d, 1)) add(d, 'PREAVVISO', '');
      notice = { giorni: nt.giorni, ora: nt.ora, primoArrivo: first };
    }
    return { aptId, mode, status: fatal ? 'unverifiable' : degraded ? 'degraded' : 'ok', problems, days, feeds: feedInfo, registry: { health: rh, lastSuccess: st.reg && st.reg.lastSuccess || null, lastAttempt: st.reg && st.reg.lastAttempt || null, error: st.reg && st.reg.error || null, count: st.reg ? st.reg.count : null }, asOf: lastOk.length ? lastOk.sort()[0] : null, notice };
  }
  const aptExists = (config, id) => (config.apts || []).some(x => x.id === id);

  // calendario pubblico / checkout
  async function guestBusy(config, aptId) {
    const occ = computeOccupancy(config, aptId, await loadFresh(config, aptId), { mode: 'guest' });
    return { status: occ.status, asOf: occ.asOf, dates: Object.keys(occ.days).sort(), problems: occ.problems, notice: occ.notice, limit: { mesi: GUEST_MONTHS, ultimoGiorno: maxBookingDate(now()) } };
  }
  // verifica puntuale di un intervallo (checkout / conferma tardiva). ignoreHold = i miei stessi hold.
  async function checkRange(config, aptId, da, a, { ignoreHold, mode = 'guest', fresh = true } = {}) {
    const st = fresh ? await loadFresh(config, aptId) : await loadAptState(config, aptId);
    const occ = computeOccupancy(config, aptId, st, { mode, ignoreHold });
    const hit = rangeDays(da, a).filter(d => occ.days[d]);
    return { status: occ.status, problems: occ.problems, conflicts: hit.map(d => ({ date: d, by: occ.days[d].map(x => x.src) })) };
  }
  // Conferma MANUALE di una prenotazione del sito non ancora confermata (tipicamente "da_verificare"): sovrapposizioni con tutte le
  // ALTRE fonti (iCal, registro, altre prenotazioni, hold altrui, blocchi). La prenotazione stessa e i suoi hold non contano.
  async function conflictsFor(config, b) {
    const occ = computeOccupancy(config, b.id, await loadFresh(config, b.id), { mode: 'admin', ignoreHold: b.code });
    const code = String(b.code).toUpperCase(), own = new Set([code, 'SITO|' + code]), conflicts = [];
    for (const d of rangeDays(b.da, b.a)) {
      const other = (occ.days[d] || []).filter(x => !own.has(String(x.ref || '').toUpperCase()));
      if (other.length) conflicts.push({ date: d, by: [...new Set(other.map(x => x.src))] });
    }
    return { status: occ.status, problems: occ.problems, conflicts };
  }
  // admin / debug: occupazione completa con motivi
  async function adminOccupancy(config, { fresh = false } = {}) {
    const out = {};
    for (const apt of (config.apts || [])) out[apt.id] = computeOccupancy(config, apt.id, fresh ? await loadFresh(config, apt.id) : await loadAptState(config, apt.id), { mode: 'admin' });
    return out;
  }
  async function occupancyOf(config, aptId, { mode = 'admin', fresh = false, ignoreHold } = {}) {
    return computeOccupancy(config, aptId, fresh ? await loadFresh(config, aptId) : await loadAptState(config, aptId), { mode, ignoreHold });
  }
  async function registryRows() { const r = bkParse(await kv('GET', K.reg)); return (r && r.rows) || []; }
  async function exportIcs(config, aptId, { forSource = '' } = {}) {
    const occ = computeOccupancy(config, aptId, await loadFresh(config, aptId), { mode: 'export', exclude: forSource });
    // fail-closed: se un feed (escluso quello della piattaforma destinataria) non è mai stato scaricato l'export sarebbe incompleto
    const never = occ.feeds.filter(f => f.source !== forSource && f.health === 'NEVER');
    if (never.length) return { ok: false, reason: 'FEED_MAI_CARICATO', feeds: never.map(f => f.source + ' ' + f.apt) };
    const t = now(), cut = addDays(todayRome(t), -7);
    return { ok: true, status: occ.status, ics: icalFeed(aptId, Object.keys(occ.days).filter(d => d >= cut), t) };
  }

  // Export "solo sito": SOLO le prenotazioni nate sul sito (una per evento, UID stabile). Nessun evento importato da Booking/Airbnb/foglio,
  // nessun hold, nessun blocco manuale (manual:true per includerli). Non dipende dai feed esterni: legge solo le prenotazioni del sito.
  async function exportIcsSite(config, aptId, { manual = false } = {}) {
    const t = now(), cut = addDays(todayRome(t), -7), ev = [];
    for (const b of await bkAll()) {
      if (b.id !== aptId || !['confermata', 'richiesta', 'da_verificare'].includes(b.stato) || !isIso(b.da) || !isIso(b.a) || b.a <= cut) continue;
      ev.push({ uid: 'sito-' + String(b.code).toUpperCase() + '@lacolumbera', start: b.da, end: b.a, summary: 'Prenotazione sito - La Columbera' });
    }
    if (manual) {
      const p = (config.apts || []).find(x => x.id === aptId), dd = Object.keys((p && p.blocked) || {}).filter(d => p.blocked[d] && d >= cut).sort();
      let cur = null;
      for (const d of dd) {
        if (cur && cur.end === d) cur.end = addDays(d, 1);
        else { cur = { uid: 'blocco-' + d + '-' + aptId + '@lacolumbera', start: d, end: addDays(d, 1), summary: 'Bloccato - La Columbera' }; ev.push(cur); }
      }
    }
    ev.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.uid < b.uid ? -1 : 1));
    const stamp = new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    let out = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//La Columbera//Sito//IT\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:La Columbera ' + aptId + ' (sito)\r\n';
    for (const e of ev) out += 'BEGIN:VEVENT\r\nUID:' + e.uid + '\r\nDTSTAMP:' + stamp + '\r\nDTSTART;VALUE=DATE:' + e.start.replace(/-/g, '') + '\r\nDTEND;VALUE=DATE:' + e.end.replace(/-/g, '') + '\r\nSUMMARY:' + e.summary + '\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\n';
    return { ok: true, status: 'ok', count: ev.length, ics: out + 'END:VCALENDAR\r\n' };
  }

  // Export PERSONALE (calendario del telefono): TUTTE le prenotazioni, un evento per prenotazione, con fonte e appartamento nel titolo.
  // Contiene nomi degli ospiti del sito: va protetto con una chiave (vedi x.js, ICAL_PERSONAL_KEY). Non va mai dato a Booking/Airbnb.
  //
  // Ordine di inserimento per ogni appartamento (conta: il primo evento per FONTE+date vince, gli altri sono doppioni):
  //   1) prenotazioni del sito   2) registro Google Sheet (ha codice, ospiti, notti)   3) blocchi manuali
  //   4) feed iCal di Booking/altri   5) feed iCal di Airbnb.
  // I feed vengono dopo il registro, così per la stessa prenotazione resta la riga più ricca (ospiti, codice) e non il solo "Reserved".
  // Airbnb ricopia nel suo feed, come "Not available", le date che gli giriamo (prenotazioni Booking, blocchi manuali): quegli eventi
  // non sono prenotazioni Airbnb ma echi, e sovrapposti a una prenotazione già presente vengono scartati. Gli eventi "Reserved" restano sempre
  // (se si sovrappongono a un'altra prenotazione è una vera doppia prenotazione e deve vedersi).
  async function exportIcsAll(config, aptIds) {
    const t = now(), cut = addDays(todayRome(t), -30), ev = [], seen = new Set();
    const LBL = { BOOKING: 'Booking', AIRBNB: 'Airbnb', ALTRO: 'Altro iCal', SITO: 'Sito', MANUALE: 'Blocco manuale' };
    const RESERVED = /reserved|prenotat|booked/i;   // titolo di una prenotazione vera nel feed Airbnb; gli altri titoli sono blocchi
    const esc = x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
    // true se l'evento è stato inserito (false: fuori finestra o doppione)
    const push = (apt, fonte, start, end, summary, desc) => {
      if (!isIso(start) || !isIso(end) || end <= cut) return false;
      const k = apt + '|' + fonte + '|' + start + '|' + end;
      if (seen.has(k)) return false;
      seen.add(k);
      const n = nightsBetween(start, end);
      ev.push({ uid: 'tutto-' + fonte.toLowerCase() + '-' + apt + '-' + start + '-' + end + '@lacolumbera', start, end, summary, desc: [n + (n === 1 ? ' notte' : ' notti'), desc].filter(Boolean).join(' · ') });
      return true;
    };
    for (const id of aptIds) {
      const a = (config.apts || []).find(x => x.id === id), nm = (a && a.nome) || id, st = await loadFresh(config, id);
      const strong = [];                                                                  // intervalli già inseriti per questo appartamento
      const add = (apt, fonte, start, end, summary, desc) => { if (push(apt, fonte, start, end, summary, desc) && apt === id) strong.push({ start, end }); };
      const bkCodes = new Set(st.bks.map(b => String(b.code).toUpperCase()));
      // 1) prenotazioni del sito
      for (const b of st.bks) {
        if (b.id !== id || !['confermata', 'richiesta', 'da_verificare'].includes(b.stato)) continue;
        add(id, 'SITO', b.da, b.a, nm + ' - Sito - ' + (b.nome || b.code) + (b.stato === 'da_verificare' ? ' (DA VERIFICARE)' : ''), 'Codice ' + b.code + (b.ospiti ? ' - ' + b.ospiti + ' ospiti' : ''));
      }
      // 2) registro (Booking/Airbnb/manuali dal foglio)
      for (const r of ((st.reg && st.reg.rows) || [])) {
        if (r.stato === 'ANNULLATA' || (r.fonte === 'SITO' && bkCodes.has(r.codice.toUpperCase())) || (r.apt && r.apt !== id)) continue;
        const who = r.apt ? nm : 'APPARTAMENTO DA ASSEGNARE';
        add(r.apt || '?', r.fonte, r.checkin, r.checkout, who + ' - ' + (LBL[r.fonte] || r.fonte) + ' ' + r.codice, r.ospiti ? r.ospiti + ' ospiti' : '');
      }
      // 3) blocchi manuali
      const dd = Object.keys((a && a.blocked) || {}).filter(d => a.blocked[d] && d >= cut).sort();
      let run = null; const runs = [];
      for (const d of dd) { if (run && run.end === d) run.end = addDays(d, 1); else { run = { start: d, end: addDays(d, 1) }; runs.push(run); } }
      for (const r of runs) add(id, 'MANUALE', r.start, r.end, nm + ' - Blocco manuale', '');
      // 4) feed iCal che non sono Airbnb (Booking, altri)
      const feeds = st.feeds.map((f, i) => ({ f, s: st.snaps[i] })).filter(x => x.s);
      for (const { f, s } of feeds) {
        if (f.source === 'AIRBNB') continue;
        for (const e of (s.events || [])) add(id, f.source, e.start, e.end, nm + ' - ' + LBL[f.source], e.summary);
      }
      // 5) feed iCal di Airbnb: prima le prenotazioni vere ("Reserved"), poi i blocchi, che si scartano se coprono qualcosa già presente
      const ab = [];
      for (const { f, s } of feeds) if (f.source === 'AIRBNB') for (const e of (s.events || [])) ab.push({ f, e, res: RESERVED.test(e.summary) });
      ab.sort((x, y) => (y.res ? 1 : 0) - (x.res ? 1 : 0));
      for (const { f, e, res } of ab) {
        if (!res && strong.some(x => x.start < e.end && e.start < x.end)) continue;     // eco di una prenotazione Booking/sito o di un blocco manuale
        add(id, f.source, e.start, e.end, nm + ' - ' + LBL[f.source], e.summary);
      }
    }
    ev.sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : x.uid < y.uid ? -1 : 1));
    const stamp = new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    let out = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//La Columbera//Tutto//IT\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:La Columbera - tutte le prenotazioni\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n';
    for (const e of ev) out += 'BEGIN:VEVENT\r\nUID:' + e.uid + '\r\nDTSTAMP:' + stamp + '\r\nDTSTART;VALUE=DATE:' + e.start.replace(/-/g, '') + '\r\nDTEND;VALUE=DATE:' + e.end.replace(/-/g, '') + '\r\nSUMMARY:' + esc(e.summary) + '\r\n' + (e.desc ? 'DESCRIPTION:' + esc(e.desc) + '\r\n' : '') + 'TRANSP:TRANSPARENT\r\nEND:VEVENT\r\n';
    return { ok: true, count: ev.length, ics: out + 'END:VCALENDAR\r\n' };
  }

  /* ---------- conferma prenotazione (da webhook Stripe o admin) ---------- */
  async function confirmBooking(config, code, pay) {
    let b = await bkGet(code);
    if (!b) return { ok: false, reason: 'NON_TROVATA' };
    if (b.stato === 'confermata') return { ok: true, booking: b, already: true };
    // "da_verificare" e "annullata" sono decisioni del titolare (o attese di una sua decisione): un pagamento che arriva di nuovo (Stripe riconsegna
    // l'evento, il controllo dalla pagina di ritorno) non le cambia mai da solo. Si decide da Gestione, che controlla le sovrapposizioni.
    if (b.stato === 'da_verificare' || b.stato === 'annullata') return { ok: false, booking: b, already: true, conflict: { date: null, by: [b.stato === 'annullata' ? 'ANNULLATA' : 'GIA_DA_VERIFICARE'] } };
    const dates = rangeDays(b.da, b.a);
    let conflict = null;
    if (!(await holdsValid(b.id, dates, code))) {          // hold scaduto/perso (pagamento tardivo): riacquisisco e riverifico
      const h = await holdAcquire(b.id, dates, code, T.holdTtlSec);
      if (!h.ok) conflict = { date: h.conflict, by: ['HOLD ' + h.by] };
      else {
        const chk = await conflictsFor(config, b);          // esclude la prenotazione stessa: una consegna duplicata che arriva dopo la conferma non deve "scontrarsi" con se stessa
        if (chk.status === 'unverifiable') conflict = { date: null, by: ['NON_VERIFICABILE'] };
        else if (chk.conflicts.length) conflict = chk.conflicts[0];
        if (conflict) await holdRelease(b.id, dates, code).catch(() => {});   // l'hold preso solo per il controllo non resta: con un conflitto la prenotazione non ottiene quelle notti
      }
    }
    if (conflict) {
      const fresh = await bkGet(code);                      // un'altra consegna può aver confermato nel frattempo: una prenotazione già confermata non si declassa mai
      if (fresh && fresh.stato === 'confermata') return { ok: true, booking: fresh, already: true };
      b = Object.assign(b, { stato: 'da_verificare', pagamento: pay && pay.payment || b.pagamento, note: 'PAGAMENTO RICEVUTO MA CONFLITTO DATE (' + (conflict.date || '?') + ' ' + (conflict.by || []).join('+') + '): verificare e rimborsare/riassegnare' });
      await bkPut(b);
      return { ok: false, booking: b, conflict };
    }
    b = Object.assign(b, { stato: 'confermata', pagamento: pay && pay.payment || b.pagamento, confermata_il: iso(now()) });
    await bkPut(b);                                         // PRIMA la conferma...
    await holdRelease(b.id, dates, code);                   // ...poi il rilascio dell'hold (nessuna finestra scoperta)
    return { ok: true, booking: b };
  }

  /* ---------- ricerca per codice (Guest Card, area clienti) ---------- */
  const lower = s => String(s || '').toLowerCase();
  const fromBk = b => ({ code: b.code, id: b.id, da: b.da, a: b.a, notti: b.notti, ospiti: b.ospiti, nome: b.nome, email: b.email || '', stato: b.stato, fonte: 'sito' });
  const fromRow = r => ({ code: r.codice, id: r.apt, da: r.checkin, a: r.checkout, notti: r.notti, ospiti: r.ospiti, nome: '', email: '', stato: lower(r.stato), fonte: 'foglio' });
  async function findByCode(config, code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return null;
    const b = await bkGet(code);
    if (b) return fromBk(b);
    const aptIds = (config.apts || []).map(a => a.id);
    const snap = bkParse(await kv('GET', K.reg));
    const row = ((snap && snap.rows) || []).find(r => r.codice.toUpperCase() === code);
    if (row) return fromRow(row);
    const live = await webappGet('find', { code });            // codice recentissimo o riga fuori finestra export
    if (live.ok && live.data.row) { const n = normReg(live.data.row, aptIds); if (n.row) return fromRow(n.row); }
    return null;
  }

  /* ---------- stato sincronizzazione (admin, Apps Script) ---------- */
  async function syncState(config, { events = false } = {}) {
    const feeds = feedsFor(config), t = now(), snaps = await getSnaps(feeds), reg = bkParse(await kv('GET', K.reg));
    const first = bkParse(((await kv('LRANGE', K.outbox, '0', '0')) || [])[0]);
    return {
      ok: true, now: iso(t), tz: TZ,
      apts: (config.apts || []).map(a => ({ id: a.id, nome: a.nome, max: a.max })),
      feeds: feeds.map((f, i) => { const s = snaps[i]; return { feedId: f.feedId, apt: f.apt, source: f.source, label: f.label, health: feedHealth(s, t), lastAttempt: s && s.lastAttempt || null, lastSuccess: s && s.lastSuccess || null, http: s ? s.http : null, eventCount: s ? s.eventCount : 0, error: s ? s.error : (f.invalid ? 'URL_NON_VALIDO' : null), consecutiveFailures: s ? s.consecutiveFailures : 0, warnings: s && s.warnings || [], invalid: s ? s.invalid || 0 : 0, emptyAfterNonEmpty: !!(s && s.emptyAfterNonEmpty), events: events && s ? (s.events || []).map(e => Object.assign({}, e, { firstSeen: (s.firstSeen || {})[evKey(e)] || null })) : undefined }; }),
      registry: { health: regHealth(reg, t), lastAttempt: reg && reg.lastAttempt || null, lastSuccess: reg && reg.lastSuccess || null, http: reg ? reg.http : null, count: reg ? reg.count : 0, invalid: reg ? (reg.invalid || []).length : 0, error: reg && reg.error || null },
      outbox: { pending: +(await kv('LLEN', K.outbox)) || 0, oldest: first && first.ts || null },
      thresholds: { feedFreshMin: T.feedFreshMin, feedMaxStaleMin: T.feedMaxStaleMin, regFreshMin: T.regFreshMin, regMaxStaleMin: T.regMaxStaleMin, holdTtlSec: T.holdTtlSec }
    };
  }
  async function syncAll(config, { force = false, feeds = true, registry = true, drain = false, events = false } = {}) {
    const out = { feeds: null, registry: null, outbox: null, errors: [] };
    const jobs = [];
    if (feeds) jobs.push(refreshFeeds(config, { force }).then(r => { out.feeds = r.length; }, e => out.errors.push('feeds: ' + clean(e.message))));
    if (registry) jobs.push(refreshRegistry(config, { force }).then(r => { out.registry = r.skipped ? 'skipped' : (r.ok ? 'ok' : 'errore'); }, e => out.errors.push('registry: ' + clean(e.message))));
    await Promise.all(jobs);
    if (drain) out.outbox = await outboxDrain().catch(e => { out.errors.push('outbox: ' + clean(e.message)); return null; });
    await holdPurge((config.apts || []).map(a => a.id)).catch(() => {});
    await bkPurgePending().catch(() => {});
    const state = await syncState(config, { events });
    if (out.errors.length) await log({ lvl: 'ERR', msg: out.errors.join(' | ') }).catch(() => {});
    return Object.assign(state, { run: out });
  }
  async function log(e) { await kvp([['LPUSH', K.log, JSON.stringify(Object.assign({ ts: iso(now()) }, e))], ['LTRIM', K.log, '0', '199']]); }

  /* ---------- riconciliazione: confronta registro, KV, iCal, hold e produce matrice + anomalie ---------- */
  async function reconcile(config, { days = 90 } = {}) {
    const t = now(), today = todayRome(t), aptIds = (config.apts || []).map(a => a.id);
    const byApt = {};
    for (const id of aptIds) byApt[id] = await loadAptState(config, id);
    const any = byApt[aptIds[0]] || { bks: [], reg: null };
    const first = bkParse(((await kv('LRANGE', K.outbox, '0', '0')) || [])[0]);
    const outLen = +(await kv('LLEN', K.outbox)) || 0;
    const A = [], add = (sev, type, o) => A.push(Object.assign({ sev, type }, o));
    const regRows = (any.reg && any.reg.rows) || [];
    // feed e registro
    for (const apt of aptIds) byApt[apt].feeds.forEach((f, i) => {
      const s = byApt[apt].snaps[i], h = feedHealth(s, t), ref = f.source + ' ' + apt + ' ' + f.label;
      if (h === 'NEVER') add('ALTO', 'FEED_MAI_CARICATO', { apt, ref, msg: (s && s.error) || 'nessun download riuscito' });
      else if (h === 'EXPIRED') add('ALTO', 'FEED_SCADUTO', { apt, ref, msg: 'ultimo successo ' + s.lastSuccess });
      else if (h === 'STALE') add('MEDIO', 'FEED_STALE', { apt, ref, msg: (s.error || 'in ritardo') + ' · HTTP ' + (s.http || 0) });
      if (f.source === 'ALTRO') add('BASSO', 'FEED_FONTE_SCONOSCIUTA', { apt, ref, msg: 'l\'URL non è né Booking né Airbnb' });
      if (s && s.invalid > 0) add('MEDIO', 'ICAL_EVENTI_NON_VALIDI', { apt, ref, msg: s.invalid + ' eventi scartati: ' + (s.invalidList || []).map(x => x.reason).join(',') });
      if (s && s.emptyAfterNonEmpty) add('MEDIO', 'FEED_VUOTO_DOPO_EVENTI', { apt, ref, msg: 'il feed ora è valido ma vuoto (prima aveva eventi)' });
    });
    const rh = regHealth(any.reg, t);
    if (rh === 'NEVER' || rh === 'EXPIRED') add('ALTO', 'REGISTRO_NON_AGGIORNATO', { ref: 'Google Sheet', msg: (any.reg && any.reg.error) || 'nessun export recente' });
    else if (rh === 'STALE') add('MEDIO', 'REGISTRO_STALE', { ref: 'Google Sheet', msg: any.reg.error || 'in ritardo' });
    for (const x of ((any.reg && any.reg.invalid) || [])) add('ALTO', 'RIGA_REGISTRO_NON_VALIDA', { ref: x.codice || '(senza codice)', msg: x.reason });
    // righe del registro
    const seenId = new Map();
    for (const r of regRows) { if (seenId.has(r.id)) add('ALTO', 'DUPLICATO_REGISTRO', { ref: r.id, msg: 'più righe con la stessa chiave FONTE|CODICE' }); seenId.set(r.id, 1); }
    for (const r of regRows) {
      if (r.stato === 'ANNULLATA' || r.checkout < today) continue;
      if (!r.apt) add('ALTO', 'SENZA_APPARTAMENTO', { ref: r.id, from: r.checkin, to: r.checkout, msg: 'appartamento non determinato: blocca entrambi finché non assegnato' + (r.motivo ? ' (' + r.motivo + ')' : '') });
      else if (r.stato === 'DA_VERIFICARE') add('MEDIO', 'DA_VERIFICARE', { apt: r.apt, ref: r.id, from: r.checkin, to: r.checkout, msg: r.motivo || 'da verificare' });
      if (r.flags && r.flags.includes('NOTTI_ASSENTI')) add('MEDIO', 'NOTTI_ASSENTI', { apt: r.apt, ref: r.id, from: r.checkin, msg: 'numero notti mancante: considerata 1 notte' });
    }
    // sovrapposizioni tra prenotazioni attive (doppia prenotazione)
    const bkCodes = new Set(any.bks.map(b => String(b.code).toUpperCase()));
    const act = [];
    for (const r of regRows) { if (r.stato === 'ANNULLATA' || !r.apt || (r.fonte === 'SITO' && bkCodes.has(r.codice.toUpperCase()))) continue; act.push({ id: r.id, apt: r.apt, da: r.checkin, a: r.checkout }); }
    for (const b of any.bks) { if (['confermata', 'richiesta', 'da_verificare'].includes(b.stato)) act.push({ id: 'SITO|' + String(b.code).toUpperCase(), apt: b.id, da: b.da, a: b.a }); }
    for (const apt of aptIds) {
      const L = act.filter(x => x.apt === apt && x.a >= today).sort((p, q) => (p.da < q.da ? -1 : p.da > q.da ? 1 : 0));
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { if (L[j].da >= L[i].a) break; if (L[i].id !== L[j].id) add('CRITICO', 'SOVRAPPOSIZIONE', { apt, ref: L[i].id + ' ↔ ' + L[j].id, from: L[j].da, to: L[i].a < L[j].a ? L[i].a : L[j].a, msg: 'due prenotazioni attive sulle stesse notti' }); }
    }
    // iCal <-> registro
    const evMatch = (r, e) => (r.uid && r.uid === e.uid) || (r.checkin === e.start && r.checkout === e.end);
    for (const apt of aptIds) byApt[apt].feeds.forEach((f, i) => {
      const s = byApt[apt].snaps[i];
      if (!s || (f.source !== 'BOOKING' && f.source !== 'AIRBNB')) return;
      for (const e of (s.events || [])) {
        if (e.end <= today) continue;
        if (regRows.some(r => r.fonte === f.source && r.apt === apt && r.stato !== 'ANNULLATA' && evMatch(r, e))) continue;
        if (any.bks.some(b => b.id === apt && b.da === e.start && b.a === e.end && ['confermata', 'richiesta'].includes(b.stato))) continue;   // eco di una prenotazione del sito esportata
        const fs = (s.firstSeen || {})[evKey(e)];
        if (fs && ageMin(fs, t) <= 60) continue;                                                           // dà tempo alla mail di arrivare
        add(/reserved|prenotat|booked/i.test(e.summary) ? 'MEDIO' : 'BASSO', 'ICAL_SENZA_REGISTRO', { apt, ref: f.source + ' ' + (e.uid || '').slice(0, 24), from: e.start, to: e.end, msg: e.summary || 'evento senza dettagli (blocco o prenotazione non registrata)' });
      }
    });
    for (const r of regRows.filter(x => (x.fonte === 'BOOKING' || x.fonte === 'AIRBNB') && x.stato === 'CONFERMATA' && x.apt && x.checkout > today)) {
      const feeds = aptIds.flatMap(a => byApt[a].feeds.map((f, i) => ({ f, s: byApt[a].snaps[i], apt: a }))).filter(x => x.f.source === r.fonte && x.s && x.s.lastSuccess);
      if (!feeds.some(x => x.apt === r.apt)) continue;                                                       // nessun feed di quella fonte per quell'appartamento: non confrontabile
      if (feeds.some(x => x.apt === r.apt && (x.s.events || []).some(e => evMatch(r, e)))) continue;
      const other = feeds.find(x => x.apt !== r.apt && (x.s.events || []).some(e => e.start === r.checkin && e.end === r.checkout));
      if (other) add('ALTO', 'APPARTAMENTO_DISCORDANTE', { apt: r.apt, ref: r.id, from: r.checkin, to: r.checkout, msg: 'registro: ' + r.apt + ' · l\'evento iCal con le stesse date è in ' + other.apt });
      else if (ageMin(r.creata, t) > 90) add('MEDIO', 'REGISTRO_SENZA_ICAL', { apt: r.apt, ref: r.id, from: r.checkin, to: r.checkout, msg: 'confermata nel registro ma assente dal feed ' + r.fonte });
    }
    // sito <-> registro, coda di scrittura
    for (const b of any.bks.filter(x => x.stato === 'confermata')) {
      if (ageMin(b.confermata_il || b.creato, t) > 30 && !regRows.some(r => r.fonte === 'SITO' && r.codice.toUpperCase() === String(b.code).toUpperCase())) add('MEDIO', 'SITO_NON_IN_REGISTRO', { apt: b.id, ref: 'SITO|' + b.code, from: b.da, to: b.a, msg: 'confermata sul sito ma non (ancora) nel foglio' });
    }
    if (outLen > 0 && first && ageMin(first.ts, t) > 30) add('ALTO', 'CODA_FOGLIO_BLOCCATA', { ref: 'outbox', msg: outLen + ' scritture in attesa da oltre 30 minuti (web app non raggiungibile?)' });
    A.sort((x, y) => SEV[x.sev] - SEV[y.sev] || String(x.type).localeCompare(y.type));
    // matrice giorno per giorno
    const matrix = {};
    for (const apt of aptIds) {
      const occ = computeOccupancy(config, apt, byApt[apt], { mode: 'admin' }), m = {};
      for (let i = 0; i < days; i++) { const d = addDays(today, i); m[d] = occ.days[d] ? [...new Set(occ.days[d].map(x => x.src))] : []; }
      matrix[apt] = m;
    }
    const summary = { CRITICO: 0, ALTO: 0, MEDIO: 0, BASSO: 0 };
    for (const x of A) summary[x.sev]++;
    const out = { generatedAt: iso(t), summary, anomalies: A, matrix };
    await kv('SET', K.recon, JSON.stringify(out), 'EX', String(7 * 86400)).catch(() => {});
    return out;
  }

  return { T, feedsFor, feedHealth, regHealth, refreshFeeds, refreshRegistry, loadAptState, computeOccupancy, guestBusy, checkRange, conflictsFor, adminOccupancy, occupancyOf, registryRows, bkPurgePending, exportIcs, exportIcsSite, exportIcsAll, confirmBooking, findByCode, syncState, syncAll, reconcile, log, aptExists,
    bkAll, bkGet, bkPut, bkDel, holdAcquire, holdRelease, holdsValid, holdPurge, webappUpsert, registerBooking, outboxPush, outboxDrain };
}

module.exports = { makeEngine, parseICS, icalDate, icalFeed, rangeDays, addDays, nightsBetween, todayRome, isIso, hmac, srcOf, LUA_ACQUIRE, LUA_RELEASE, K,
  noticeSettings, parseNoticeInput, noticeCutoffMs, noticeOk, minCheckinDate, NOTICE_MAX_DAYS, GUEST_MONTHS, addMonthsIso, maxBookingDate };
