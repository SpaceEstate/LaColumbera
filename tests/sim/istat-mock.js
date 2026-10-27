'use strict';
// La Columbera · servizio ISTAT Alloggi FINTO per i test (nessuna rete). Segue il protocollo del PDF "ISTATalloggi – Registrazione dati tramite file upload
// e via web service" (§2): POST all'indirizzo documentato, credenziali (username, password) nell'header, corpo JSON con i soli campi documentati,
// risposta { status, info } con le stesse frasi degli esempi ("5/5 movimenti caricati", "4/5 movimenti caricati – provenienza incorretta …").
// Ciò che il PDF non dice è una ASSUNZIONE del simulatore, dichiarata qui: risposta 401 a credenziali errate e formato dell'elenco "list" (array di oggetti
// con gli stessi campi dell'upload). Ogni scostamento dal protocollo viene registrato in `protocolErrors`: i test verificano che resti vuoto.
// opts: { user, password, url, cipatAttivi, now, delay (ms), modo: { upload|list: 'abort'|'timeout'|'rete'|'http500'|'http401'|'http404'|'redirect'|'html'|'json-rotto'|'status-vuoto'|'solo-testo'|'incoerente'|'dopo-abort' }, rowCheck(item, i), onCall(rec) }
const IS = require('../../api/_istat.js'), W = require('../../api/_istat_ws.js');
const resp = (status, text, type) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => type || 'application/json' }, text: async () => text });
const KEYS = ['CIPAT', 'dataArrivo', 'dataPartenza', 'siglaProvenienza', 'nrPersone'];
const it = d8 => d8.slice(6) + '/' + d8.slice(4, 6) + '/' + d8.slice(0, 4);

function makeIstatMock(opts) {
  const o = Object.assign({ user: 'ws-user', password: 'ws-pass', url: W.DEFAULT_URL, cipatAttivi: ['022001-AT-012345'], now: () => Date.now(), delay: 0, modo: {}, rowCheck: null, onCall: null }, opts || {});
  const P = IS.buildProvenienze(require('../../data/istat-provenienze.json')), m = { opts: o, requests: [], archive: [], protocolErrors: [] };
  const abortErr = () => { const e = new Error('aborted'); e.name = 'AbortError'; return e; };
  const wait = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(abortErr()); }); });
  // regole di import del PDF (§ "Regole generali di importazione") → messaggio di scarto oppure null
  function scarto(x, i) {
    const per = IS.periodo(new Date(o.now()).toISOString().slice(0, 10)), a = IS.d8ToIso(x.dataArrivo), p = IS.d8ToIso(x.dataPartenza);
    if (!o.cipatAttivi.includes(x.CIPAT)) return 'CIPAT non attivo ' + x.CIPAT;
    if (!a || !p || a >= p || p > ((d => { d.setUTCFullYear(d.getUTCFullYear() + 1); return d.toISOString().slice(0, 10); })(new Date(a + 'T00:00:00Z')))) return 'date non corrette ' + x.CIPAT + ' (' + (x.dataArrivo ? it(x.dataArrivo) : '') + ')';
    if (a < per.da || a > per.a) return 'date fuori periodo ' + x.CIPAT + ' (' + it(x.dataArrivo) + ')';
    if (!P.get(x.siglaProvenienza)) return 'provenienza incorretta ' + x.CIPAT + '(' + x.siglaProvenienza + ')';
    if (!/^\d{1,2}$/.test(x.nrPersone) || +x.nrPersone < 1) return 'numero persone non valido ' + x.CIPAT;
    return o.rowCheck ? o.rowCheck(x, i) : null;
  }
  m.fetch = async (url, init) => {
    init = init || {}; const u = String(url), isList = u === o.url + '&list', op = isList ? 'list' : 'upload', headers = {};
    for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
    const rec = { op, url: u, method: init.method, headers, raw: init.body, redirect: init.redirect }; m.requests.push(rec);
    if (o.onCall) o.onCall(rec);
    if (init.method !== 'POST') m.protocolErrors.push(op + ': metodo ' + init.method + ' invece di POST');
    if (u !== o.url && !isList) { m.protocolErrors.push('indirizzo non documentato: ' + u); return resp(404, '', 'text/plain'); }
    if (o.delay) await wait(o.delay, init.signal);
    const modo = o.modo[op];
    if (modo === 'abort') throw abortErr();
    if (modo === 'timeout') await new Promise((res, rej) => { if (init.signal) init.signal.addEventListener('abort', () => rej(abortErr())); });
    if (modo === 'rete') { const e = new Error('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; }
    if (modo === 'http500') return resp(500, 'Internal Server Error', 'text/plain');
    if (modo === 'http401') return resp(401, 'Unauthorized', 'text/plain');
    if (modo === 'http404') return resp(404, '', 'text/plain');
    if (modo === 'redirect') return resp(302, '', 'text/plain');
    if (modo === 'html') return resp(200, '<html><body>Accesso richiesto</body></html>', 'text/html');
    if (modo === 'json-rotto') return resp(200, '{"status": "true", "info": ');
    if (headers.username !== o.user || headers.password !== o.password) return resp(401, 'Unauthorized', 'text/plain');       // ASSUNZIONE: il PDF non dice come risponde a credenziali errate
    if (isList) return resp(200, JSON.stringify(m.archive));                                                                  // ASSUNZIONE: formato dell'elenco non documentato
    let body; try { body = JSON.parse(init.body); } catch (e) { m.protocolErrors.push('upload: corpo non JSON'); return resp(400, 'Bad Request', 'text/plain'); }
    if (headers['content-type'] !== 'application/json') m.protocolErrors.push('upload: Content-Type ' + headers['content-type']);
    if (!Array.isArray(body)) { m.protocolErrors.push('upload: il corpo non è un array'); return resp(400, 'Bad Request', 'text/plain'); }
    body.forEach((x, i) => {
      const k = Object.keys(x || {}).sort().join(','), del = ['CIPAT', 'dataArrivo'].sort().join(','), full = KEYS.slice().sort().join(',');
      if (k !== full && k !== del) m.protocolErrors.push('upload: campi non documentati alla riga ' + (i + 1) + ': ' + k);
      for (const v of Object.values(x || {})) if (typeof v !== 'string') m.protocolErrors.push('upload: valore non stringa alla riga ' + (i + 1));
    });
    const msgs = [], ok = []; body.forEach((x, i) => { const s = scarto(x, i); if (s) msgs.push(s); else ok.push(x); });
    const n = body.length, k = ok.length; m.archive.push(...ok);
    if (modo === 'dopo-abort') throw abortErr();                                                                              // il servizio ha elaborato ma la risposta è andata persa
    if (modo === 'status-vuoto') return resp(200, '{}');
    if (modo === 'solo-testo') return resp(200, JSON.stringify({ status: String(k > 0), info: 'Operazione eseguita' }));
    const tot = modo === 'incoerente' ? n + 1 : n;
    return resp(200, JSON.stringify({ status: String(k > 0), info: k + '/' + tot + ' movimenti caricati' + (msgs.length ? ' – ' + msgs.join(' – ') : '') }));
  };
  m.count = op => m.requests.filter(r => r.op === op).length;
  return m;
}
module.exports = { makeIstatMock };
