'use strict';
// La Columbera · client dei servizi "Alloggiati Web" della Polizia di Stato.
// Fonte: manuale WS "Servizi Alloggiati" rev. 01 del 24/01/2022 — SOAP 1.2, namespace "AlloggiatiService", account STANDARD (solo Test e Send; nessun metodo GestioneAppartamenti_*).
// Modulo senza stato (il prefisso "_" evita che Vercel lo esponga): rete, orologio e variabili d'ambiente sono iniettabili; nei test non si chiama mai il servizio vero.
// Nessun log: nulla di ciò che passa di qui (credenziali, token, dati degli ospiti) deve finire nei log.
const NS = 'AlloggiatiService';
const DEFAULT_URL = 'https://alloggiatiweb.poliziadistato.it/service/service.asmx';
const VARS = ['ALLOGGIATI_UTENTE', 'ALLOGGIATI_PASSWORD', 'ALLOGGIATI_WSKEY'];
const TABELLE = ['Luoghi', 'Tipi_Documento', 'Tipi_Alloggiato', 'TipoErrore'];

/* ============================ configurazione ============================ */
function readConfig(env) {
  const g = k => String(env[k] == null ? '' : env[k]).trim();
  const missing = VARS.filter(k => !g(k)), sendOn = g('ALLOGGIATI_SEND_ENABLED') === 'true', prod = g('VERCEL_ENV') === 'production';
  return { missing, utente: g('ALLOGGIATI_UTENTE'), password: g('ALLOGGIATI_PASSWORD'), wskey: g('ALLOGGIATI_WSKEY'), url: g('ALLOGGIATI_URL') || DEFAULT_URL,
    // invio reale: serve la variabile esplicita E l'ambiente Production (in preview e sviluppo si usa solo Test)
    send: { enabled: sendOn && prod, motivo: !sendOn ? 'La variabile ALLOGGIATI_SEND_ENABLED non è impostata a "true" su questo ambiente' : !prod ? 'Questo ambiente non è Production (VERCEL_ENV=' + (g('VERCEL_ENV') || 'non impostato') + ')' : '' } };
}
const maskUser = u => !u ? '' : u.length <= 4 ? '••••' : u.slice(0, 2) + '•'.repeat(Math.min(6, u.length - 4)) + u.slice(-2);

/* ============================ XML ============================ */
const esc = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const unesc = s => String(s == null ? '' : s).replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => {
  if (e[0] !== '#') return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e];
  try { return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)); } catch { return '?'; }
});
const rx = name => new RegExp('<(?:[\\w.-]+:)?' + name + '(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?' + name + '>)', 'g');
const tag = (xml, name) => { const m = rx(name).exec(xml || ''); return m ? (m[1] == null ? '' : m[1]) : null; };
const tags = (xml, name) => { const re = rx(name), out = []; let m; while ((m = re.exec(xml || ''))) out.push(m[1] == null ? '' : m[1]); return out; };
function parseEsito(frag) {
  if (frag == null) return null;
  const e = tag(frag, 'esito'), s = e == null ? '' : e.trim().toLowerCase(), t = n => { const x = tag(frag, n); return x == null ? '' : unesc(x).trim(); };
  return { esito: s === 'true' ? true : s === 'false' ? false : null, cod: t('ErroreCod'), des: t('ErroreDes'), dett: t('ErroreDettaglio') };
}

/* ============================ chiamata SOAP 1.2 ============================ */
// o = { url, fetch, timeoutMs }. Non lancia mai: ritorna { ok:true, xml } oppure { ok:false, kind: 'timeout'|'rete'|'http'|'fault', ... }.
async function call(op, inner, o) {
  const body = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope" xmlns:all="' + NS + '"><soap12:Header/><soap12:Body><all:' + op + '>' + inner + '</all:' + op + '></soap12:Body></soap12:Envelope>';
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), o.timeoutMs || 8000);
  let r, text;
  try {
    r = await o.fetch(o.url, { method: 'POST', headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', Accept: 'application/soap+xml, text/xml' }, body, signal: ctl.signal });
    text = await r.text();
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, kind: 'timeout' };
    return { ok: false, kind: 'rete', msg: String(e && (e.code || (e.cause && e.cause.code) || e.message) || 'errore di rete').slice(0, 80) };
  } finally { clearTimeout(timer); }
  const fault = tag(text, 'Fault');
  if (fault != null) { const m = tag(fault, 'Text') || tag(fault, 'faultstring') || ''; return { ok: false, kind: 'fault', http: r.status, msg: unesc(m).replace(/\s+/g, ' ').trim().slice(0, 300) }; }
  if (!r.ok) return { ok: false, kind: 'http', http: r.status };
  return { ok: true, http: r.status, xml: text };
}
const formato = (r, what) => ({ ok: false, kind: 'formato', http: r && r.http, msg: 'Risposta del servizio non interpretabile (' + what + ')' });
const ute = (c, token) => '<all:Utente>' + esc(c.utente) + '</all:Utente><all:token>' + esc(token) + '</all:token>';

// Opzioni di rete comuni: o = { url, fetch, timeoutMs }
async function generateToken(c, o) {
  const r = await call('GenerateToken', '<all:Utente>' + esc(c.utente) + '</all:Utente><all:Password>' + esc(c.password) + '</all:Password><all:WsKey>' + esc(c.wskey) + '</all:WsKey>', o);
  if (!r.ok) return r;
  const res = parseEsito(tag(r.xml, 'result')) || parseEsito(tag(r.xml, 'GenerateTokenResult')), box = tag(r.xml, 'GenerateTokenResult');
  if (box == null && !res) return formato(r, 'GenerateToken');
  const tk = box == null ? '' : unesc(tag(box, 'token') || '').trim(), ex = box == null ? '' : unesc(tag(box, 'expires') || '').trim();
  if (tk && !(res && res.esito === false)) return { ok: true, token: tk, expires: ex };
  return { ok: false, kind: 'servizio', http: r.http, cod: res ? res.cod : '', des: res ? res.des : '', dett: res ? res.dett : '' };
}
async function authTest(c, token, o) {
  const r = await call('Authentication_Test', ute(c, token), o);
  if (!r.ok) return r;
  const e = parseEsito(tag(r.xml, 'Authentication_TestResult'));
  if (!e || e.esito === null) return formato(r, 'Authentication_Test');
  return e.esito ? { ok: true } : { ok: false, kind: 'servizio', http: r.http, cod: e.cod, des: e.des, dett: e.dett };
}
// Test = SOLO controllo, non registra nulla · Send = controllo + invio: vengono acquisite le sole schedine corrette (esito PARZIALE possibile).
// Ritorna { ok:true, general, valide, dettaglio:[{esito,cod,des,dett}] }: "ok" significa risposta interpretabile, il verdetto lo dà analyze().
async function schedine(op, c, token, lines, o) {
  const r = await call(op, ute(c, token) + '<all:ElencoSchedine>' + lines.map(l => '<all:string>' + esc(l) + '</all:string>').join('') + '</all:ElencoSchedine>', o);
  if (!r.ok) return r;
  const general = parseEsito(tag(r.xml, op + 'Result')), res = tag(r.xml, 'result');
  if (!general || general.esito === null) return formato(r, op);
  const det = res == null ? [] : tags(tag(res, 'Dettaglio') || '', 'EsitoOperazioneServizio').map(parseEsito);
  const sv = res == null ? NaN : parseInt(unesc(tag(res, 'SchedineValide') || '').trim(), 10);
  return { ok: true, http: r.http, general, valide: Number.isFinite(sv) ? sv : null, dettaglio: det };
}
const test = (c, token, lines, o) => schedine('Test', c, token, lines, o);
const send = (c, token, lines, o) => schedine('Send', c, token, lines, o);
async function tabella(c, token, nome, o) {
  if (!TABELLE.includes(nome)) return { ok: false, kind: 'formato', msg: 'Tabella non gestita: ' + nome };
  const r = await call('Tabella', ute(c, token) + '<all:tipo>' + nome + '</all:tipo>', o);
  if (!r.ok) return r;
  const e = parseEsito(tag(r.xml, 'TabellaResult')), csv = tag(r.xml, 'CSV');
  if (!e || e.esito === null) return formato(r, 'Tabella');
  if (!e.esito) return { ok: false, kind: 'servizio', http: r.http, cod: e.cod, des: e.des, dett: e.dett };
  if (csv == null) return formato(r, 'Tabella senza CSV');
  return { ok: true, csv: unesc(csv) };
}

/* ============================ verdetto delle risposte ============================ */
// Un Test/Send è "tutto ok" solo se: esito generale true, una risposta per ogni schedina inviata, tutte con esito true e SchedineValide = numero inviato.
function analyze(r, n) {
  if (!r || !r.ok) return { ok: false, risposta: false, righe: [], valide: null };
  const righe = r.dettaglio.map((x, i) => ({ i, esito: x.esito === true, cod: x.cod, des: x.des, dett: x.dett }));
  const coerente = righe.length === n;
  return { ok: coerente && righe.every(x => x.esito) && r.general.esito === true && r.valide === n, risposta: true, coerente, righe, valide: r.valide, generale: r.general };
}
// Messaggio per l'utente quando la configurazione o il servizio non permettono di andare avanti (stato della sezione "Stato configurazione").
const STATI = {
  ok: { titolo: 'Configurazione valida', fix: '' },
  variabili_mancanti: { titolo: 'Mancano variabili d\'ambiente', fix: 'Su Vercel (Project → Settings → Environment Variables) crea le variabili elencate per l\'ambiente giusto, poi rifai il deploy.' },
  credenziali_non_valide: { titolo: 'Credenziali non valide', fix: 'Utente e password devono essere quelle del portale Alloggiati Web. Se hai cambiato la password sul portale, aggiorna ALLOGGIATI_PASSWORD e rifai il deploy.' },
  wskey_non_valida: { titolo: 'WSKEY non valida', fix: 'La WSKEY non è stata generata oppure è stata rigenerata (la vecchia smette di funzionare). Sul portale Alloggiati Web leggi o rigenera la WSKEY, aggiorna ALLOGGIATI_WSKEY e rifai il deploy.' },
  servizio_non_raggiungibile: { titolo: 'Servizio non raggiungibile', fix: 'Il servizio della Polizia di Stato non risponde (rete, timeout o manutenzione). Riprova tra qualche minuto: non è stato inviato nulla.' },
  errore_servizio: { titolo: 'Errore del servizio', fix: 'Il servizio ha risposto con un errore (messaggio qui sotto). Se persiste, controlla sul portale che il servizio di cooperazione applicativa sia abilitato (manuale WS, par. 3.1).' }
};
function classify(r) {
  if (r.kind === 'rete' || r.kind === 'timeout' || (r.kind === 'http' && r.http >= 500)) return 'servizio_non_raggiungibile';
  if (r.kind === 'servizio') {
    const t = [r.cod, r.des, r.dett].join(' ').toLowerCase();
    if (/wskey|ws[\s_-]?key|chiave/.test(t)) return 'wskey_non_valida';
    if (/password|credenzial|utente|user|login|autentic/.test(t)) return 'credenziali_non_valide';
  }
  return 'errore_servizio';
}
// testo leggibile per il dettaglio tecnico (nessun dato personale: solo codici e messaggi del servizio)
const dettaglio = r => r.kind === 'timeout' ? 'nessuna risposta entro il tempo massimo' : r.kind === 'rete' ? 'errore di rete (' + (r.msg || '') + ')' : r.kind === 'http' ? 'HTTP ' + r.http
  : r.kind === 'fault' ? 'errore SOAP: ' + (r.msg || '') : r.kind === 'formato' ? (r.msg || 'risposta non interpretabile') : [r.cod && 'codice ' + r.cod, r.des, r.dett].filter(Boolean).join(' · ') || 'nessun dettaglio dal servizio';

/* ============================ tabelle (CSV con ";") ============================ */
function parseCsv(text) {
  const t = String(text || '').replace(/^\uFEFF/, ''), rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Le colonne si riconoscono dall'intestazione (Codice / Descrizione / Provincia …); senza intestazione: 1ª colonna codice, 2ª descrizione.
// La struttura REALE delle tabelle non è documentata nel manuale: `diag` dice cosa è stato riconosciuto, così il primo giro di prova mostra eventuali sorprese.
function buildTable(nome, csv) {
  const rows = parseCsv(csv), diag = { righe: rows.length, intestazione: null, colonne: null, scartate: 0, avvisi: [] };
  if (!rows.length) { diag.avvisi.push('tabella vuota'); return { ok: false, nome, diag, get: () => undefined, size: 0 }; }
  const first = rows[0].map(x => x.trim()), isHead = first.some(x => /[A-Za-z]/.test(x)) && !first.some(x => /^\d{9}$/.test(x)) && !(nome !== 'Luoghi' && first.length >= 2 && /^[A-Z0-9]{1,5}$/.test(first[0]) && /\s/.test(first[1]));
  const data = isHead ? rows.slice(1) : rows, ix = re => isHead ? first.findIndex(h => re.test(h)) : -1;
  let iC = ix(/^cod/i), iD = ix(/^(descr|nome|denomin|comune|luogo)/i); const iP = ix(/^(prov|sigla)/i), iF = ix(/(fine|scad|valid)/i);
  if (iC < 0) iC = 0; if (iD < 0 || iD === iC) iD = iC === 0 ? 1 : 0;
  diag.intestazione = isHead ? first : null; diag.colonne = { codice: iC, descrizione: iD, provincia: iP, fine: iF };
  const byCode = new Map(); let italia = null;
  for (const r of data) {
    const codice = (r[iC] || '').trim(), n = (r[iD] || '').trim();
    if (!codice || !n) { diag.scartate++; continue; }
    const e = { codice, nome: n, prov: iP >= 0 ? (r[iP] || '').trim().toUpperCase() : '', fine: iF >= 0 ? (r[iF] || '').trim() : '' };
    if (nome === 'Luoghi') { if (!/^\d{9}$/.test(codice)) { diag.scartate++; continue; } e.kind = /^100000\d{3}$/.test(codice) ? 'stato' : 'comune'; if (e.kind === 'stato' && norm(n) === 'ITALIA') italia = italia === null ? codice : 'ambiguo'; }
    if (!byCode.has(codice)) byCode.set(codice, e);
  }
  if (nome === 'Luoghi') {
    if (italia === 'ambiguo') italia = null;
    if (!italia) diag.avvisi.push('Italia non riconosciuta nella tabella Luoghi: le regole su comune e provincia di nascita non possono essere applicate in locale');
    if (byCode.size < 100) diag.avvisi.push('tabella Luoghi con pochissime righe (' + byCode.size + ')');
  }
  if (!byCode.size) diag.avvisi.push('nessuna riga utilizzabile');
  return { ok: byCode.size > 0, nome, diag, size: byCode.size, italia, byCode, get: c => byCode.get(String(c == null ? '' : c).trim()), list: () => [...byCode.values()] };
}
// ricerca per nome (o per inizio del codice), per i menu con ricerca del modulo manuale
function search(table, q, opt) {
  opt = opt || {}; const k = norm(q), limit = opt.limit || 25;
  if (!table || !table.ok || k.length < 2 && !/^\d+$/.test(k)) return [];
  const hits = [];
  for (const e of table.list()) {
    if (opt.kind && e.kind && e.kind !== opt.kind) continue;
    const n = norm(e.nome), score = /^\d+$/.test(k) ? (e.codice.startsWith(k) ? 0 : 9) : n === k ? 0 : n.startsWith(k) ? 1 : n.includes(' ' + k) ? 2 : n.includes(k) ? 3 : 9;
    if (score < 9) hits.push([score, n.length, e]);
  }
  return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map(h => ({ codice: h[2].codice, nome: h[2].nome, prov: h[2].prov, kind: h[2].kind || '' }));
}

module.exports = { NS, DEFAULT_URL, VARS, TABELLE, STATI, readConfig, maskUser, esc, unesc, tag, tags, parseEsito, call, generateToken, authTest, test, send, tabella, analyze, classify, dettaglio, parseCsv, buildTable, search };
