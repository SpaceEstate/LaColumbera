'use strict';
// La Columbera · client del servizio web ISTAT Alloggi (ISPAT, Provincia autonoma di Trento).
// Fonte: "ISTATalloggi – Registrazione dati tramite file upload e via web service" (v. 30/09/2024), paragrafo 2 «Via web service»:
//  - richiesta HTTP POST a https://statweb.provincia.tn.it/istatAlloggi/upload.aspx?ws con le credenziali (username e password, forniti da ISPAT) nell'header;
//  - corpo JSON: array di { CIPAT, dataArrivo, dataPartenza, siglaProvenienza, nrPersone } (date AAAAMMGG);
//  - risposta JSON { status, info }: status "true" se almeno un movimento è stato caricato; info = dettaglio ("5/5 movimenti caricati",
//    "4/5 movimenti caricati – provenienza incorretta …", "0/5 movimenti caricati – date fuori periodo … – CIPAT non attivo …");
//  - verifica: POST a …upload.aspx?ws&list con le credenziali nell'header: elenco dei movimenti caricati dal mese precedente a quello corrente.
// Il PDF NON descrive: il Content-Type (si usa application/json, come per ogni corpo JSON), la risposta a credenziali errate, il formato dell'elenco
// e il modo di passare il CIPAT a "list" (qui non lo si passa): per questo ogni risposta anomala è trattata con prudenza e mostrata com'è.
// Modulo senza stato (il prefisso "_" evita che Vercel lo esponga): rete, orologio e variabili d'ambiente sono iniettabili; nei test non si chiama mai il servizio vero.
// Nessun log: né le credenziali né i movimenti devono finire nei log.
const DEFAULT_URL = 'https://statweb.provincia.tn.it/istatAlloggi/upload.aspx?ws';
const VARS = ['ISTAT_WS_USER', 'ISTAT_WS_PASSWORD'];
const MAX_TESTO = 4000;

/* ============================ configurazione ============================ */
function readConfig(env) {
  const g = k => String(env[k] == null ? '' : env[k]).trim();
  const missing = VARS.filter(k => !g(k)), sendOn = g('ISTAT_SEND_ENABLED') === 'true', prod = g('VERCEL_ENV') === 'production', url = g('ISTAT_WS_URL') || DEFAULT_URL;
  return { missing, user: g('ISTAT_WS_USER'), password: g('ISTAT_WS_PASSWORD'), url, listUrl: url + (url.indexOf('?') >= 0 ? '&list' : '?list'),
    // invio reale: serve la variabile esplicita E l'ambiente Production (in preview e sviluppo non si trasmette nulla)
    send: { enabled: sendOn && prod, motivo: !sendOn ? 'La variabile ISTAT_SEND_ENABLED non è impostata a "true" su questo ambiente' : !prod ? 'Questo ambiente non è Production (VERCEL_ENV=' + (g('VERCEL_ENV') || 'non impostato') + ')' : '' } };
}
const maskUser = u => !u ? '' : u.length <= 4 ? '••••' : u.slice(0, 2) + '•'.repeat(Math.min(6, u.length - 4)) + u.slice(-2);
const hostOf = u => { try { return new URL(u).host; } catch (e) { return ''; } };

/* ============================ chiamata HTTP ============================ */
// c = { user, password }, body = array (upload) oppure undefined (list), o = { fetch, timeoutMs }.
// Non lancia mai: ritorna { ok:true, http, text } oppure { ok:false, kind: 'timeout'|'rete'|'config', … }. Il verdetto sul contenuto lo dà chi chiama.
async function call(url, c, body, o) {
  if (!/^[\x20-\x7E]*$/.test(c.user) || !/^[\x20-\x7E]*$/.test(c.password)) return { ok: false, kind: 'config', msg: 'Le credenziali contengono caratteri non ammessi in un header HTTP' };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), o.timeoutMs || 8000);
  const headers = { username: c.user, password: c.password, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let r, text;
  try {
    // redirect non seguiti: un POST che "rimbalza" non va mai ripetuto in silenzio
    r = await o.fetch(url, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: ctl.signal });
    text = await r.text();
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, kind: 'timeout' };
    return { ok: false, kind: 'rete', msg: String(e && (e.code || (e.cause && e.cause.code) || e.name) || 'errore di rete').slice(0, 60) };
  } finally { clearTimeout(timer); }
  return { ok: true, http: r.status, text: String(text == null ? '' : text) };
}

/* ============================ interpretazione ============================ */
function parseEsito(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const key = n => Object.keys(j).filter(k => k.toLowerCase() === n)[0];
  const ks = key('status'), ki = key('info'); if (ks === undefined) return null;
  const st = String(j[ks] == null ? '' : j[ks]).trim().toLowerCase();
  if (st !== 'true' && st !== 'false') return null;
  return { status: st === 'true', info: ki === undefined || j[ki] == null ? '' : String(j[ki]) };
}
// "5/5 movimenti caricati" · "4/5 movimenti caricati – provenienza incorretta …" · "0/0 [2 del] movimenti caricati" (esempi del PDF)
const RE_INFO = /^\s*(\d+)\s*\/\s*(\d+)(?:\s*\[\s*(\d+)\s*del\s*\])?\s*movimenti\s+caricati\b\s*(?:[–—-]\s*([\s\S]*))?$/i;
function parseInfo(info) { const m = RE_INFO.exec(String(info || '')); return m ? { caricati: +m[1], totale: +m[2], cancellati: m[3] ? +m[3] : 0, dettaglio: (m[4] || '').replace(/\s+/g, ' ').trim() } : null; }

// Verdetto su una risposta di upload. n = movimenti inviati. Ritorna { esito, caricati, totale, … } con esito:
//  'inviato'  = il servizio dichiara di averli caricati tutti (status true e N/N con N = movimenti inviati);
//  'parziale' = caricati solo alcuni (status true e K/N con 0 < K < N);
//  'respinto' = nessuno caricato (status false e 0/N, oppure status false con un testo non nel formato descritto);
//  'incerto'  = risposta contraddittoria o non interpretabile: NON si sa se i movimenti sono stati acquisiti.
function analyzeUpload(r, n) {
  if (!r || r.status === undefined) return { esito: 'incerto', caricati: null, totale: null, info: '' };
  const p = parseInfo(r.info), base = { status: r.status, info: r.info, caricati: p ? p.caricati : null, totale: p ? p.totale : null, cancellati: p ? p.cancellati : 0, dettaglio: p ? p.dettaglio : r.info };
  if (!p) return Object.assign(base, { esito: r.status ? 'incerto' : 'respinto' });             // status false = nessun record caricato (PDF); status true senza conteggio = non verificabile
  if (p.totale !== n) return Object.assign(base, { esito: 'incerto', incoerente: true });          // il servizio parla di un numero di movimenti diverso da quelli inviati
  if (r.status && p.caricati === p.totale) return Object.assign(base, { esito: 'inviato' });
  if (r.status && p.caricati > 0 && p.caricati < p.totale) return Object.assign(base, { esito: 'parziale' });
  if (!r.status && p.caricati === 0) return Object.assign(base, { esito: 'respinto' });
  return Object.assign(base, { esito: 'incerto', incoerente: true });                             // status e conteggio che non tornano
}
// Classificazione di una risposta HTTP che non è un esito leggibile: ritorna { certo: true/false (non elaborata?), stato }
function classify(r) {
  if (r.kind === 'config') return { certo: true, stato: 'credenziali_non_valide' };
  if (r.kind === 'timeout' || r.kind === 'rete') return { certo: false, stato: 'servizio_non_raggiungibile' };
  if (r.kind === 'http' && (r.http === 401 || r.http === 403)) return { certo: true, stato: 'credenziali_non_valide' };
  if (r.kind === 'http' && r.http >= 400 && r.http < 500) return { certo: true, stato: 'richiesta_rifiutata' };
  return { certo: false, stato: 'errore_servizio' };                                               // 3xx, 5xx, pagina HTML o JSON anomalo: potrebbe essere stata elaborata
}
const dettaglio = r => r.kind === 'timeout' ? 'nessuna risposta entro il tempo massimo' : r.kind === 'rete' ? 'errore di rete (' + (r.msg || '') + ')' : r.kind === 'http' ? 'HTTP ' + r.http
  : r.kind === 'config' ? (r.msg || 'configurazione non valida') : r.kind === 'formato' ? (r.msg || 'risposta non interpretabile') : '';
const STATI = {
  variabili_mancanti: { titolo: 'Mancano variabili d\'ambiente su Vercel', fix: 'Su Vercel (Project → Settings → Environment Variables) crea le variabili elencate per l\'ambiente giusto, poi rifai il deploy.' },
  credenziali_non_valide: { titolo: 'Credenziali non accettate', fix: 'Username e password del servizio ISTAT sono quelli forniti da ISPAT. Controlla ISTAT_WS_USER e ISTAT_WS_PASSWORD su Vercel e rifai il deploy. Non è stato trasmesso nulla.' },
  richiesta_rifiutata: { titolo: 'Richiesta rifiutata dal servizio', fix: 'Il servizio ha rifiutato la richiesta prima di elaborarla (controlla l\'indirizzo ISTAT_WS_URL, se impostato). Non è stato trasmesso nulla.' },
  servizio_non_raggiungibile: { titolo: 'Servizio non raggiungibile o senza risposta', fix: 'Non so se il servizio ha ricevuto la richiesta.' },
  errore_servizio: { titolo: 'Risposta anomala del servizio', fix: 'Il servizio ha risposto in modo non previsto dalla documentazione: non so se ha elaborato la richiesta.' }
};

/* ============================ operazioni ============================ */
// upload: POST del corpo JSON. Ritorna { ok:true, http, esito: {status, info} } se la risposta è un JSON { status, info }, altrimenti { ok:false, kind, … }.
async function upload(c, movimenti, o) {
  const r = await call(c.url, c, movimenti, o); if (!r.ok) return r;
  if (r.http < 200 || r.http >= 300) return { ok: false, kind: 'http', http: r.http };
  const e = parseEsito(r.text); if (!e) return { ok: false, kind: 'formato', http: r.http, msg: 'Risposta del servizio non interpretabile (attesi JSON con "status" e "info")' };
  return { ok: true, http: r.http, esito: e };
}
// list: elenco dei movimenti caricati (sola lettura). Il formato non è documentato: si ritorna il testo (troncato) e, se è un array JSON, il numero di elementi.
async function list(c, o) {
  const r = await call(c.listUrl, c, undefined, o); if (!r.ok) return r;
  if (r.http < 200 || r.http >= 300) return { ok: false, kind: 'http', http: r.http };
  let n = null, j = null; try { j = JSON.parse(r.text); if (Array.isArray(j)) n = j.length; } catch (e) { /* testo libero */ }
  return { ok: true, http: r.http, testo: r.text.slice(0, MAX_TESTO), troncato: r.text.length > MAX_TESTO, elementi: n, json: n !== null };
}

module.exports = { DEFAULT_URL, VARS, STATI, readConfig, maskUser, hostOf, call, upload, list, parseEsito, parseInfo, analyzeUpload, classify, dettaglio };
