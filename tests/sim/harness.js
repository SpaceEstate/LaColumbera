'use strict';
// Banco di prova end-to-end: esegue il codice REALE di Vercel (api/x.js, _avail.js, stripe-webhook.js) e dello script Apps Script
// (google-apps-script.gs in una VM) contro: Redis finto che esegue il Lua vero (wasmoon), feed iCal controllabili, Sheet/Gmail finti,
// Stripe/SMTP finti e un orologio simulato. Nessuna rete.
const path = require('path'), fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
process.env.TZ = 'Europe/Rome';

/* ---------------- orologio simulato ---------------- */
const RealDate = Date;
let offset = 0;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
  static now() { return RealDate.now() + offset; }
}
global.Date = FakeDate;
const clock = {
  set(iso) { offset = RealDate.parse(iso) - RealDate.now(); },
  advance(ms) { offset += ms; },
  now() { return FakeDate.now(); },
  iso() { return new FakeDate().toISOString(); }
};
const MIN = 60e3, H = 3600e3;

/* ---------------- Redis finto (Upstash REST) con Lua reale ---------------- */
// nodemailer, stripe e @vercel/blob sono sostituiti da finti (tests/sim/stubs) solo dentro questo processo di prova: node_modules non si tocca.
const Module = require('module'), STUBS = { nodemailer: 'nodemailer.js', stripe: 'stripe.js', '@vercel/blob': 'vercel-blob.js' };
const _resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return STUBS[request] ? path.join(__dirname, 'stubs', STUBS[request]) : _resolve.call(this, request, ...rest); };
let luaEngine = null, luaFactory = null, luaUses = 0;
const LUA_ROTATE_EVERY = 25;      // wasmoon accumula stato per chiamata e dopo ~40 EVAL va in "memory access out of bounds": limite del motore di test, non dello script
async function getLua() {
  if (luaEngine && luaUses < LUA_ROTATE_EVERY) { luaUses++; return luaEngine; }
  if (luaEngine) { try { luaEngine.global.close(); } catch (e) { /* già chiuso */ } }
  if (!luaFactory) { let W; try { W = require('wasmoon'); } catch (e) { W = require(path.join(ROOT, '.testnm', 'wasmoon')); } luaFactory = new W.LuaFactory(); }
  luaEngine = await luaFactory.createEngine();
  luaEngine.global.set('redis', { call: (...c) => { const r = kv.exec(c); return r === null ? false : r; } });
  luaUses = 1;      // i dati stanno nel Redis finto (JS): ricreare il motore non perde stato
  return luaEngine;
}
class FakeKV {
  constructor() { this.reset(); }
  reset() { this.d = new Map(); this.calls = 0; this.fail = null; this.chain = Promise.resolve(); this.jitter = 0; this.after = null; }
  get(k) { const e = this.d.get(k); if (!e) return null; if (e.exp && e.exp <= clock.now()) { this.d.delete(k); return null; } return e; }
  hash(k, create) { let e = this.get(k); if (!e && create) { e = { t: 'h', v: {} }; this.d.set(k, e); } return e; }
  list(k, create) { let e = this.get(k); if (!e && create) { e = { t: 'l', v: [] }; this.d.set(k, e); } return e; }
  exec(cmd) {
    const O = String(cmd[0]).toUpperCase(), a = cmd.slice(1).map((x, i) => (typeof x === 'number' ? String(x) : x));
    switch (O) {
      case 'GET': { const e = this.get(a[0]); return e ? e.v : null; }
      case 'SET': { const [k, v, ...o] = a; let nx = false, ex = null; for (let i = 0; i < o.length; i++) { const u = String(o[i]).toUpperCase(); if (u === 'NX') nx = true; else if (u === 'EX') ex = +o[++i]; } if (nx && this.get(k)) return null; this.d.set(k, { t: 's', v: String(v), exp: ex ? clock.now() + ex * 1000 : null }); return 'OK'; }
      case 'DEL': { let n = 0; for (const k of a) if (this.d.delete(k)) n++; return n; }
      case 'INCR': { const e = this.get(a[0]); const n = (e ? parseInt(e.v, 10) || 0 : 0) + 1; this.d.set(a[0], { t: 's', v: String(n), exp: e ? e.exp : null }); return n; }      // come Redis: INCR non cambia la scadenza
      case 'EXPIRE': { const e = this.get(a[0]); if (!e) return 0; e.exp = clock.now() + (+a[1]) * 1000; return 1; }
      case 'HGET': { const e = this.hash(a[0]); return e && a[1] in e.v ? e.v[a[1]] : null; }
      case 'HSET': { const e = this.hash(a[0], true); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!(a[i] in e.v)) n++; e.v[a[i]] = String(a[i + 1]); } return n; }
      case 'HSETNX': { const e = this.hash(a[0], true); if (a[1] in e.v) return 0; e.v[a[1]] = String(a[2]); return 1; }
      case 'HINCRBY': { const e = this.hash(a[0], true); const n = (parseInt(e.v[a[1]], 10) || 0) + parseInt(a[2], 10); e.v[a[1]] = String(n); return n; }
      case 'HDEL': { const e = this.hash(a[0]); if (!e) return 0; let n = 0; for (const f of a.slice(1)) if (delete e.v[f]) n++; return n; }
      case 'HGETALL': { const e = this.hash(a[0]); const o = []; if (e) for (const [f, v] of Object.entries(e.v)) o.push(f, v); return o; }
      case 'RPUSH': { const e = this.list(a[0], true); for (const v of a.slice(1)) e.v.push(String(v)); return e.v.length; }
      case 'LPUSH': { const e = this.list(a[0], true); for (const v of a.slice(1)) e.v.unshift(String(v)); return e.v.length; }
      case 'LRANGE': { const e = this.list(a[0]); if (!e) return []; let s = +a[1], t = +a[2]; if (t < 0) t = e.v.length + t; return e.v.slice(s, t + 1); }
      case 'LREM': { const e = this.list(a[0]); if (!e) return 0; const i = e.v.indexOf(a[2]); if (i < 0) return 0; e.v.splice(i, 1); return 1; }
      case 'LLEN': { const e = this.list(a[0]); return e ? e.v.length : 0; }
      case 'LTRIM': { const e = this.list(a[0]); if (e) e.v = e.v.slice(+a[1], +a[2] + 1); return 'OK'; }
      default: throw new Error('comando KV non simulato: ' + O);
    }
  }
  async run(cmd) {
    this.calls++;
    if (this.jitter) await new Promise(r => setTimeout(r, Math.floor(Math.random() * this.jitter)));      // intreccia i task come farebbe la rete
    const out = String(cmd[0]).toUpperCase() === 'EVAL' ? await this.evalLua(cmd) : this.exec(cmd);
    if (this.after) await this.after(cmd, out);      // gancio dei test: il comando è GIÀ stato eseguito, si può ritardare solo la risposta (simula una risposta di rete lenta)
    return out;
  }
  evalLua(cmd) {      // un solo script alla volta: come Redis (single thread)
    const job = this.chain.then(async () => {
      const L = await getLua(), [, script, nk, ...rest] = cmd, keys = rest.slice(0, +nk).map(String), argv = rest.slice(+nk).map(String);
      L.global.set('KEYS', keys); L.global.set('ARGV', argv);
      const r = await L.doString(script);
      return Array.isArray(r) ? r : (r && typeof r === 'object' ? Object.values(r) : r);
    });
    this.chain = job.catch(() => {});
    return job;
  }
}
const kv = new FakeKV();

/* ---------------- rete simulata ---------------- */
const KV_URL = 'https://kv.test', WEBAPP_URL = 'https://script.google.com/macros/s/TEST/exec';
const feeds = new Map();      // url -> { status, body, delay, error, calls }
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });
const sleepAbortable = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
});
let gasCtx = null;      // VM Apps Script corrente
const webapp = { mode: 'ok', calls: [] };
async function routeFetch(url, opts = {}) {
  url = String(url);
  if (url.startsWith(KV_URL)) {
    if (kv.fail) return res(kv.fail.status, JSON.stringify(kv.fail.body));
    const body = JSON.parse(opts.body);
    if (url.endsWith('/pipeline')) { const out = []; for (const c of body) { try { out.push({ result: await kv.run(c) }); } catch (e) { out.push({ error: e.message }); } } return res(200, JSON.stringify(out)); }
    try { return res(200, JSON.stringify({ result: await kv.run(body) })); } catch (e) { return res(400, JSON.stringify({ error: e.message })); }
  }
  if (feeds.has(url)) {
    const f = feeds.get(url); f.calls = (f.calls || 0) + 1;
    if (f.delay) await sleepAbortable(f.delay, opts.signal);
    if (f.error) { const e = new Error(f.error); e.cause = { code: f.error }; throw e; }
    return res(f.status || 200, f.body == null ? '' : f.body);
  }
  if (url.startsWith('https://api.deepl.com/') || url.startsWith('https://api-free.deepl.com/')) {      // DeepL finto: "[EN] testo"; global.__deepl = { mode: 'ok'|'down'|'slow', calls: [] }
    const d = global.__deepl || (global.__deepl = { mode: 'ok', calls: [] }), body = JSON.parse(opts.body || '{}');
    d.calls.push({ url, body, auth: (opts.headers || {}).Authorization });
    if (d.mode === 'down') return res(503, '{"message":"giù"}');
    if (d.mode === 'slow') await sleepAbortable(60000, opts.signal);
    const tgt = String(body.target_lang || '').slice(0, 2), src = l => /[äöüß]/i.test(l) ? 'DE' : /\b(the|and|is|we|you|thanks?)\b/i.test(l) ? 'EN' : /\b(merci|bonjour|nous)\b/i.test(l) ? 'FR' : 'IT';
    return res(200, JSON.stringify({ translations: (body.text || []).map(t => ({ detected_source_language: body.source_lang || src(t), text: src(t) === tgt && !body.source_lang ? t : '[' + tgt + '] ' + t })) }));
  }
  if (url.startsWith(WEBAPP_URL)) {
    webapp.calls.push({ method: opts.method || 'GET', url });
    if (webapp.mode === 'down') return res(500, 'Internal Error');
    if (webapp.mode === 'html') return res(200, '<html><body>Accedi a Google</body></html>');
    if (webapp.mode === 'timeout') await sleepAbortable(60000, opts.signal);
    if (!gasCtx) return res(500, 'nessun web app');
    let out;
    if ((opts.method || 'GET') === 'POST') out = gasCtx.doPost({ postData: { contents: opts.body } });
    else { const q = Object.fromEntries(new URL(url).searchParams.entries()); out = gasCtx.doGet({ parameter: q }); }
    return res(200, out.getContent());
  }
  throw new Error('fetch non previsto dal banco di prova: ' + url.slice(0, 80));
}
global.fetch = (...a) => routeFetch(...a);

/* ---------------- ambiente Vercel ---------------- */
const SECRETS = { SYNC_SECRET: 'sync-test-secret', SHEET_SECRET: 'sheet-test-secret', STRIPE_WEBHOOK_SECRET: 'whsec_test' };
function setEnv(extra) {
  for (const k of Object.keys(process.env)) if (/^(ICAL_|FEED_|REG_|HOLD_|ORIZZONTE|KV_|SHEET_|SYNC_|STRIPE_|GMAIL_|ADMIN_|SESSION_|OWNER_|REPLY_|SITE_|ISTAT_|DEEPL_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { KV_REST_API_URL: KV_URL, KV_REST_API_TOKEN: 'tok', SHEET_WEBAPP_URL: WEBAPP_URL, SHEET_SECRET: SECRETS.SHEET_SECRET, SYNC_SECRET: SECRETS.SYNC_SECRET,
    STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: SECRETS.STRIPE_WEBHOOK_SECRET, GMAIL_USER: 'info@test', GMAIL_APP_PASSWORD: 'x', ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'sess',
    OWNER_EMAIL: 'owner@test', FEED_TIMEOUT_MS: '150', REG_TIMEOUT_MS: '300' }, extra || {});
}
function loadVercel() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'api'))) delete require.cache[k];
  return { handler: require(path.join(ROOT, 'api', 'x.js')), webhook: require(path.join(ROOT, 'api', 'stripe-webhook.js')) };
}
let V = null;
async function callHandler(fn, { method = 'POST', query = {}, body = {}, headers = {}, raw = null }) {
  const out = { status: 200, headers: {}, body: null, text: null };
  const { Readable } = require('stream');
  const req = raw != null ? Object.assign(Readable.from([Buffer.from(raw)]), {}) : { };
  Object.assign(req, { method, query, body, headers: Object.assign({ host: 'www.lacolumbera.test' }, headers) });
  await new Promise((resolve, reject) => {
    const r = {
      setHeader(k, v) { out.headers[k.toLowerCase()] = v; return r; },
      status(s) { out.status = s; return r; },
      json(o) { out.body = o; out.text = JSON.stringify(o); resolve(); return r; },
      send(t) { out.text = typeof t === 'string' ? t : JSON.stringify(t); try { out.body = JSON.parse(out.text); } catch { out.body = null; } resolve(); return r; },
      end() { resolve(); return r; }, redirect() { resolve(); }
    };
    Promise.resolve(fn(req, r)).catch(reject);
  });
  return out;
}
const api = (a, body, opts = {}) => callHandler(V.handler, { method: opts.method || 'POST', query: Object.assign({ a }, opts.query || {}), body: body || {}, headers: opts.headers || {} });
const machine = () => ({ 'x-sync-secret': SECRETS.SYNC_SECRET });
const adminTok = () => { const p = String(clock.now() + 288e5); return p + '.' + crypto.createHmac('sha256', 'sess').update(p).digest('hex'); };
const adminApi = (a, body, opts = {}) => api(a, body, Object.assign({}, opts, { headers: { authorization: adminTok() } }));
function stripeEvent(type, session) { return JSON.stringify({ id: 'evt_' + crypto.randomBytes(4).toString('hex'), type, data: { object: session } }); }
async function webhook(type, session, { dup = false } = {}) {
  const raw = stripeEvent(type, session), h = { 'stripe-signature': 'valid-' + SECRETS.STRIPE_WEBHOOK_SECRET };
  return callHandler(V.webhook, { method: 'POST', headers: h, raw });
}
const paidSession = (code, extra) => Object.assign({ id: 'cs_' + code, payment_status: 'paid', payment_intent: 'pi_' + code, metadata: { code }, amount_total: 24000 }, extra || {});

/* ---------------- iCal di prova (stile Booking e Airbnb) ---------------- */
const vevent = o => 'BEGIN:VEVENT\r\n' + Object.entries(o).map(([k, v]) => k + ':' + v).join('\r\n') + '\r\nEND:VEVENT\r\n';
const cal = evs => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//IT\r\n' + evs.join('') + 'END:VCALENDAR\r\n';
const d8 = iso => iso.replace(/-/g, '');
const bookingEv = (uid, from, to) => vevent({ UID: uid, 'DTSTART;VALUE=DATE': d8(from), 'DTEND;VALUE=DATE': d8(to), SUMMARY: 'CLOSED - Not available' });
const airbnbEv = (uid, from, to, code) => vevent({ UID: uid + '@airbnb.com', 'DTSTART;VALUE=DATE': d8(from), 'DTEND;VALUE=DATE': d8(to), SUMMARY: 'Reserved', DESCRIPTION: 'Reservation URL: https://www.airbnb.com/hosting/reservations/details/' + code + '\\nPhone Number (Last 4 Digits): 1234' });
const FEED = { bookingTorre: 'https://ical.booking.com/v1/export?t=TORRE-TOKEN', bookingCorte: 'https://ical.booking.com/v1/export?t=CORTE-TOKEN', airbnbTorre: 'https://www.airbnb.com/calendar/ical/111.ics?s=ATOK', airbnbCorte: 'https://www.airbnb.com/calendar/ical/222.ics?s=CTOK' };
const setFeed = (key, evs, extra) => feeds.set(FEED[key], Object.assign({ status: 200, body: cal(evs), calls: (feeds.get(FEED[key]) || {}).calls || 0 }, extra || {}));
const breakFeed = (key, extra) => { const f = feeds.get(FEED[key]); feeds.set(FEED[key], Object.assign({}, f, { delay: 0, error: null, status: 200 }, extra)); };

/* ---------------- Apps Script: VM con Sheet/Gmail/Lock/Properties finti ---------------- */
class FakeSheet {
  constructor(ss, name) { this.ss = ss; this.name = name; this.rows = []; this.textCols = new Set(); }
  _ensure(r, c) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(''); }
  getLastRow() { for (let i = this.rows.length - 1; i >= 0; i--) if ((this.rows[i] || []).some(v => v !== '' && v != null)) return i + 1; return 0; }
  setName(n) { this.name = n; return this; }
  getRange(a, b, c, d) {
    if (typeof a === 'string') { const m = /^([A-Z]+)(\d+):([A-Z]+)(\d*)$/.exec(a), col = s => s.split('').reduce((x, ch) => x * 26 + ch.charCodeAt(0) - 64, 0); return new FakeRange(this, +m[2], col(m[1]), m[4] ? +m[4] - +m[2] + 1 : 100000, col(m[3]) - col(m[1]) + 1, true); }
    return new FakeRange(this, a, b, c || 1, d || 1, false);
  }
  appendRow(vals) { const r = this.getLastRow() + 1; this.getRange(r, 1, 1, vals.length).setValues([vals]); }
  copyTo(ss) { const s = ss.insertSheet('Copia di ' + this.name); s.rows = JSON.parse(JSON.stringify(this.rows)); return s; }
}
class FakeRange {
  constructor(sh, r, c, nr, nc, open) { Object.assign(this, { sh, r, c, nr, nc, open }); }
  getValues() { const out = []; const last = this.open ? Math.min(this.nr, Math.max(this.sh.getLastRow() - this.r + 1, 0)) : this.nr; for (let i = 0; i < last; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.rows[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined || v === null ? '' : (v instanceof Date ? new Date(v.getTime()) : v)); } out.push(row); } return out; }
  getDisplayValues() { return this.getValues().map(r => r.map(String)); }
  _w(i, j, v) {
    const R = this.r + i, C = this.c + j; this.sh._ensure(R, C);
    if (this.sh.textCols.has(C) && R >= 2 && !(v instanceof Date)) v = v === '' ? '' : String(v);               // colonna formattata come testo: nessuna conversione
    else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim() !== '' && !this.sh.textCols.has(C)) v = Number(v);   // Sheets converte "123" in numero
    this.sh.rows[R - 1][C - 1] = v;
  }
  setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => this._w(i, j, v))); return this; }
  setValue(v) { this._w(0, 0, v); return this; }
  setNumberFormat(f) { if (f === '@') for (let j = 0; j < this.nc; j++) this.sh.textCols.add(this.c + j); else for (let j = 0; j < this.nc; j++) this.sh.textCols.delete(this.c + j); return this; }
  clearContent() { for (let i = 0; i < Math.min(this.nr, this.sh.rows.length); i++) for (let j = 0; j < this.nc; j++) if (this.sh.rows[this.r - 1 + i]) this.sh.rows[this.r - 1 + i][this.c - 1 + j] = ''; return this; }
}
class FakeSpreadsheet {
  constructor() { this.sheets = []; this.tz = 'Europe/Rome'; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(this, n); this.sheets.push(s); return s; }
  getSpreadsheetTimeZone() { return this.tz; }
}
const zoned = (y, mo, d, tz) => { // mezzanotte nel fuso tz -> Date
  const target = Date.UTC(y, mo - 1, d, 0, 0, 0), fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let g = target; for (let k = 0; k < 2; k++) { const p = {}; for (const x of fmt.formatToParts(new RealDate(g))) p[x.type] = x.value; g -= Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - target; } return new FakeDate(g);
};
// Lo script Apps Script reale NON è nel repo (il vecchio google-apps-script.gs è stato cancellato). Se manca si usa lo stub minimo in stubs/ (registro vuoto, upsert accettati);
// i test che dipendono dal comportamento reale dello script vengono SALTATI e dichiarati dai runner. Con il file vero nella radice non si salta nulla.
const GAS_FILE = path.join(ROOT, 'google-apps-script.gs'), GAS_REAL = fs.existsSync(GAS_FILE);
function makeGas(initRegistry) {
  const ss = new FakeSpreadsheet(), reg = ss.insertSheet('Prenotazioni');
  if (initRegistry) { reg.rows = initRegistry.map(r => r.slice()); }
  const props = { SHEET_SECRET: SECRETS.SHEET_SECRET, SYNC_SECRET: SECRETS.SYNC_SECRET, VERCEL_BASE: 'https://www.lacolumbera.test' };
  const mailbox = { threads: [], seq: 0 };
  const lockState = { held: false, otherHolds: false };
  const prefetched = {}, queued = [];
  const mkMsg = (t, m) => ({ getId: () => m.id, getSubject: () => m.subject, getFrom: () => m.from, getDate: () => new FakeDate(m.date), getPlainBody: () => m.body, markRead: () => { m.read = true; }, getThread: () => t, _m: m });
  const mkThread = t => ({ getId: () => t.id, getMessages: () => t.messages.map(m => mkMsg(thread(t), m)), moveToTrash: () => { t.trashed = true; } });
  const threadCache = new Map(); const thread = t => { if (!threadCache.has(t)) threadCache.set(t, mkThread(t)); return threadCache.get(t); };
  const sandbox = {
    console: { log: () => {} }, Date: FakeDate,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (lockState.held || lockState.otherHolds) return false; lockState.held = true; return true; }, releaseLock: () => { lockState.held = false; } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }) },
    Session: { getScriptTimeZone: () => 'Europe/Rome' },
    ScriptApp: { _t: [], getProjectTriggers() { return this._t; }, deleteTrigger(t) { this._t = this._t.filter(x => x !== t); }, newTrigger(fn) { const o = { fn, spec: [] }; const b = { timeBased() { return b; }, everyMinutes(n) { o.spec.push('min' + n); return b; }, everyHours(n) { o.spec.push('h' + n); return b; }, everyDays(n) { o.spec.push('d' + n); return b; }, atHour(n) { o.spec.push('at' + n); return b; }, create() { sandbox.ScriptApp._t.push(Object.assign(o, { getHandlerFunction: () => fn })); return o; } }; return b; } },
    Utilities: {
      formatDate: (d, tz, f) => { if (f !== 'yyyy-MM-dd') throw new Error('formato non simulato ' + f); const p = {}; for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)) p[x.type] = x.value; return p.year + '-' + p.month + '-' + p.day; },
      parseDate: (s, tz) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return zoned(+m[1], +m[2], +m[3], tz); },
      computeHmacSha256Signature: (msg, secret) => Array.from(crypto.createHmac('sha256', secret).update(msg).digest()).map(b => (b > 127 ? b - 256 : b)),
      sleep: () => {}
    },
    UrlFetchApp: { fetch(url, opts) {
      const m = /\/api\/x\?a=([a-z_]+)/.exec(url); if (!m) throw new Error('UrlFetchApp: URL non previsto ' + url);
      const body = JSON.parse((opts && opts.payload) || '{}'), key = m[1] + ':' + JSON.stringify(body);
      const mk = o => ({ getResponseCode: () => o.status, getContentText: () => o.text });
      if (prefetched[key]) return mk(prefetched[key]);
      if (m[1] === 'sync' && body.registry === true && body.force === true && body.drain === true) { queued.push({ action: m[1], body }); return mk({ status: 200, text: JSON.stringify({ ok: true, queued: true }) }); }   // chiamata finale (a lock rilasciato): rieseguita dopo il giro
      throw new Error('chiamata Vercel non prevista dal banco di prova: ' + key);
    } },
    GmailApp: { search(q, start, max) {
      const from = (/from:\(([^)]+)\)/.exec(q) || /from:(\S+)/.exec(q) || [])[1], newer = (/newer_than:(\d+)d/.exec(q) || [])[1], older = (/older_than:(\d+)d/.exec(q) || [])[1];
      const subs = []; for (const x of q.matchAll(/subject:"([^"]+)"|subject:(\w+)/g)) subs.push((x[1] || x[2]).toLowerCase());
      const out = mailbox.threads.filter(t => !t.trashed && t.messages.some(m => {
        if (from && !m.from.toLowerCase().includes(from.toLowerCase().replace(/^@/, ''))) return false;
        if (subs.length && !subs.some(s => m.subject.toLowerCase().includes(s))) return false;
        const age = (clock.now() - m.date) / 864e5;
        if (newer && !(age <= +newer)) return false; if (older && !(age > +older)) return false; return true; })).sort((a, b) => b.messages[0].date - a.messages[0].date);
      return out.slice(start, start + max).map(thread);
    } }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(GAS_REAL ? GAS_FILE : path.join(__dirname, 'stubs', 'google-apps-script.stub.gs'), 'utf8'), ctx, { filename: 'google-apps-script.gs' });
  const gas = { ctx, ss, reg, props, mailbox, lockState, prefetched, queued,
    addEmail(from, subject, body, ms) { const id = 'm' + (++mailbox.seq), t = { id: 't' + mailbox.seq, messages: [{ id, from, subject, body, date: ms || clock.now(), read: false }] }; mailbox.threads.push(t); return id; },
    rows() { const s = ss.getSheetByName('Prenotazioni'), h = (s.rows[0] || []); return s.rows.slice(1).filter(r => r.some(v => v !== '' && v != null)).map((r, i) => Object.assign({ _row: i + 2 }, Object.fromEntries(h.map((k, j) => [k, r[j] === undefined ? '' : r[j]])))); },
    sheet(n) { const s = ss.getSheetByName(n); return s ? s.rows.slice(1).filter(r => r.some(v => v !== '' && v != null)) : []; } };
  gasCtx = ctx; return gas;
}
// esegue una funzione dello script Apps Script come farebbe il trigger: prima le chiamate a Vercel che farà all'inizio (eseguite per davvero),
// poi la funzione (sincrona, come in GAS), poi le chiamate "finali" a lock rilasciato
async function runGas(gas, fn, { prefetch = [] } = {}) {
  gas.queued.length = 0; for (const k of Object.keys(gas.prefetched)) delete gas.prefetched[k];
  for (const p of prefetch) { const r = await api(p.action, p.body, { headers: machine() }); gas.prefetched[p.action + ':' + JSON.stringify(p.body)] = { status: r.status, text: r.text }; }
  const result = gas.ctx[fn]();
  for (const q of gas.queued) await api(q.action, q.body, { headers: machine() });
  return result;
}
const PRE = { feeds: { action: 'sync', body: { feeds: true, registry: false, events: true } }, recon: { action: 'reconcile', body: { days: 60 } }, diag: { action: 'sync', body: { feeds: true, registry: true, force: true } } };
const PREFETCH = { syncRapida: [PRE.feeds], syncCompleta: [PRE.feeds, PRE.recon], diagnostica: [PRE.diag], dryRunGmail: [PRE.feeds], riconciliaPrenotazioni: [PRE.recon] };

/* ---------------- ambiente di test ---------------- */
const defaultCfg = () => { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'default.json'), 'utf8')); return Object.assign(d, { ical: { torre: FEED.bookingTorre + ',' + FEED.airbnbTorre, corte: FEED.bookingCorte + ',' + FEED.airbnbCorte }, closed: {} }); };
async function newEnv({ legacyRows, env, cfg, startIso } = {}) {
  kv.reset(); feeds.clear(); webapp.mode = 'ok'; webapp.calls = []; global.__mails = []; global.__deepl = { mode: 'ok', calls: [] }; global.__stripeSessions = []; global.__mailFail = false; global.__stripeFail = false; global.__stripeState = {}; global.__stripeWebhooks = []; global.__stripeFailedDeliveries = 0; global.__stripeRetrieveFail = false; global.__stripeListFail = false; global.__stripeRefunds = []; global.__stripeRefundFail = false; global.__stripeRefunded = {}; global.__stripeRefundStatus = '';
  clock.set(startIso || '2026-10-02T09:00:00Z');
  setEnv(env); V = loadVercel();
  const c = cfg || defaultCfg(); kv.exec(['SET', 'cfg', JSON.stringify(c)]);
  for (const k of ['bookingTorre', 'bookingCorte', 'airbnbTorre', 'airbnbCorte']) setFeed(k, []);
  const gas = makeGas(legacyRows || [['Numero Prenotazione', 'Data Check-in', 'Appartamento', 'Numero Ospiti', 'Numero Notti']]);
  return { gas, cfg: c };
}
const busy = async id => { const r = await api('busy', {}, { method: 'GET', query: { id } }); return r; };
const busyAll = async id => { const r = await busy(id); return r.status === 200 ? r.body.dates.filter(d => d >= '2026-10-02' && d < '2028-01-01') : null; };
const busyDates = async id => { const r = await busyAll(id); return r && r.filter(d => d < '2027-01-01'); };
const sync = (o) => api('sync', Object.assign({ force: true }, o || {}), { headers: machine() });
const romeMidnight = (y, m, d) => zoned(y, m, d, 'Europe/Rome');
module.exports = { GAS_REAL, romeMidnight, clock, MIN, H, kv, feeds, FEED, setFeed, breakFeed, cal, vevent, bookingEv, airbnbEv, api, adminApi, machine, webhook, paidSession, newEnv, runGas, PREFETCH, busy, busyDates, busyAll, sync, webapp, V: () => V, RealDate, FakeDate, SECRETS, getLua };
