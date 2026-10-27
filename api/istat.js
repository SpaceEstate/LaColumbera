'use strict';
// La Columbera · Gestione → Adempimenti → ISTAT. Endpoint riservato all'amministratore (stesso login del pannello): ogni azione è ?a=is_* con corpo JSON (POST).
// Endpoint SEPARATO da quello di Alloggiati Web (api/adempimenti.js), che resta invariato. Principi:
//  1. Le credenziali del servizio ISTAT vivono solo nelle variabili d'ambiente di Vercel e ogni chiamata parte da qui: nel browser non arrivano mai.
//  2. I movimenti non vengono salvati né scritti nei log: restano nella pagina e passano in memoria; il server rifà i controlli a ogni passo.
//  3. "Conferma e invia" non si aggira dal browser: l'invio richiede la conferma FIRMATA dal server sugli stessi identici dati (impronta), monouso, e l'invio reale abilitato.
//  4. Mai "inviato" senza una risposta chiara e coerente del servizio. Dopo un timeout o una risposta incerta l'esito è "incerto" e non si ritenta mai da soli.
const crypto = require('crypto');
const IS = require('./_istat.js'), W = require('./_istat_ws.js');

const PROOF_TTL_MS = 20 * 60e3;        // validità della conferma firmata
const BUDGET_MS = 8500;                // tempo massimo per richiesta: sotto il limite di 10 s di una funzione Vercel standard
const SENT_TTL_SEC = 70 * 24 * 3600;   // per quanto tempo un movimento acquisito resta "già inviato" (il periodo ammesso dal servizio è di circa due mesi); si conserva solo l'impronta

function make(deps) {
  const env = deps.env, kv = deps.kv, auth = deps.auth, doFetch = deps.fetch, now = deps.now || (() => Date.now());
  const kvp = deps.kvp || (cmds => Promise.all(cmds.map(c => kv(...c))));      // più comandi in un colpo (pipeline Upstash)
  const secret = () => String(env.SESSION_SECRET || env.ADMIN_PASSWORD || '');

  /* ---------- conferma firmata ---------- */
  const sign = b => crypto.createHmac('sha256', crypto.createHmac('sha256', secret()).update('istat-proof-v1').digest()).update(b).digest('base64url');
  const makeProof = hash => { const p = Buffer.from(JSON.stringify({ h: hash, n: crypto.randomBytes(12).toString('hex'), e: now() + PROOF_TTL_MS })).toString('base64url'); return p + '.' + sign(p); };
  function readProof(s) {
    const [p, g] = String(s || '').split('.');
    if (!p || !g || !secret()) return null;
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sign(p)), Buffer.from(g))) return null;
      const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
      return o && typeof o.h === 'string' && /^[0-9a-f]{24}$/.test(o.n) && o.e > now() ? o : null;
    } catch { return null; }
  }

  /* ---------- configurazione e tabella statica ---------- */
  let provTable = deps.provenienze || null;
  // la tabella statica si legge solo quando serve; un file mancante o rovinato blocca l'invio (errore esplicito) ma non fa cadere l'endpoint
  const provenienze = () => { if (!provTable) { try { provTable = IS.buildProvenienze(require('../data/istat-provenienze.json')); } catch (e) { provTable = IS.buildProvenienze(null); } } return provTable; };
  const cipatCfg = () => String(env.ISTAT_CIPAT == null ? '' : env.ISTAT_CIPAT).trim();
  const accountInfo = () => { const c = W.readConfig(env); return { credenziali: { presenti: !c.missing.length, missing: c.missing, utente: W.maskUser(c.user) }, send: c.send, ambiente: String(env.VERCEL_ENV || 'locale'), servizio: W.hostOf(c.url) }; };
  const failBody = (stato, extra) => Object.assign({ stato, titolo: W.STATI[stato] ? W.STATI[stato].titolo : stato, fix: W.STATI[stato] ? W.STATI[stato].fix : '' }, extra || {});

  /* ---------- ingresso e controlli ---------- */
  // Il browser può mandare solo i cinque campi del movimento (più i marcatori di lettura): il resto si scarta. Niente di ciò che arriva si fida.
  function sanitize(arr) {
    if (!Array.isArray(arr) || !arr.length) return { err: 'Nessun movimento' };
    if (arr.length > IS.MAX_RIGHE) return { err: 'Troppi movimenti (massimo ' + IS.MAX_RIGHE + ')' };
    const rows = [];
    for (const x of arr) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return { err: 'Movimento non valido' };
      const r = {};
      for (const k of IS.CAMPI) { const v = x[k]; if (v != null && typeof v !== 'string' && typeof v !== 'number') return { err: 'Campo non valido: ' + k }; r[k] = v == null ? '' : String(v); if (r[k].length > 40) return { err: 'Campo troppo lungo: ' + k }; }
      if (Number.isInteger(x.riga) && x.riga > 0) r.riga = x.riga;
      if (x.approssimato === true) { r.approssimato = true; r._s = [{ sev: 'errore', code: 'RIGA_RICOSTRUITA', campo: null, msg: 'Riga ricostruita per posizione (numero di colonne diverso da 5): i campi potrebbero essere spostati', fix: 'Controlla ogni campo e correggilo nella tabella: la riga verrà riletta' }]; }
      rows.push(r);
    }
    return { rows };
  }
  const clientRow = r => { const o = {}; for (const k of [...IS.CAMPI, 'riga', 'approssimato', 'idx', 'ok', 'errori', 'avvisi', 'issues', 'notti', 'dec']) if (r[k] !== undefined) o[k] = r[k]; return o; };
  const pub = (v, extra) => Object.assign({ rows: v.rows.map(clientRow), globali: v.globali, riepilogo: v.riepilogo, hash: v.hash, periodo: v.periodo, cipat: cipatCfg() }, extra || {});
  const fpKey = fp => 'istat:inv:' + fp;
  // Quali movimenti il servizio ha già acquisito in invii precedenti (conteggio per impronta: più prenotazioni uguali sono possibili). null = archivio non raggiungibile.
  async function sentMarkers(rows) {
    try {
      const f = IS.fingerprints(rows), uniq = [...new Set(f.map(x => x.fp))], res = await kvp(uniq.map(fp => ['GET', fpKey(fp)])), cnt = {};
      uniq.forEach((fp, i) => { cnt[fp] = res[i] ? parseInt(res[i], 10) || 0 : 0; });
      const o = {}; f.forEach((x, i) => { if (x.occ < cnt[x.fp]) o[i] = true; }); return o;
    } catch { return null; }
  }
  const isCtx = (extra, inviati) => ({ now: now(), provenienze: provenienze(), cipat: cipatCfg(), extra, inviati });
  // Livelli di controllo. Il controllo dei marcatori si fa solo quando i dati sono già formalmente validi (è la fase che porta all'invio).
  async function validateAll(rows, extra) {
    let v = IS.validateRows(rows, isCtx(extra)), degradato = false;
    if (v.riepilogo.inviabile) {
      const m = await sentMarkers(rows);
      if (m === null) degradato = true; else if (Object.keys(m).length) v = IS.validateRows(rows, isCtx(extra, m));
    }
    return { v, degradato };
  }
  // Segna come "già acquisiti" i movimenti di un invio riuscito (solo l'impronta e il conteggio). Se l'archivio non risponde non cambia l'esito dell'invio.
  async function markSent(rows) {
    const f = IS.fingerprints(rows), cnt = {}; f.forEach(x => { cnt[x.fp] = (cnt[x.fp] || 0) + 1; });
    const cmds = []; for (const fp of Object.keys(cnt)) { cmds.push(['INCRBY', fpKey(fp), String(cnt[fp])]); cmds.push(['EXPIRE', fpKey(fp), String(SENT_TTL_SEC)]); }
    try { await kvp(cmds); } catch { /* resta il blocco sulla conferma monouso */ }
  }
  const avvisiElenco = v => { const o = []; v.rows.forEach(r => r.issues.forEach(i => { if (i.sev === 'avviso' && o.length < 30) o.push({ riga: r.riga || r.idx + 1, campo: i.campo, code: i.code, msg: i.msg }); })); v.globali.forEach(g => { if (g.sev === 'avviso') o.push({ riga: null, campo: null, code: g.code, msg: g.msg }); }); return o; };
  const INCERTO = [
    'Non so se il servizio ha acquisito i movimenti: la risposta non è arrivata o non è interpretabile.',
    'NON inviare di nuovo da qui. Controlla con «Elenco movimenti sul portale» (o sul portale ISTAT) se i movimenti di questo invio risultano caricati.',
    'Solo se non risultano, ripeti l\'operazione da capo (controllo, riepilogo e nuovo invio).'];

  // La chiamata di invio vera e propria. Mai ritentata da sola: dopo un timeout l'esito è "incerto".
  async function doSend(v, rows, c, info) {
    const body = IS.toServiceBody(v.rows), n = body.length;
    const r = await W.upload(c, body, { fetch: doFetch, timeoutMs: Math.min(8000, BUDGET_MS) });
    if (!r.ok) {
      const k = W.classify(r), dett = W.dettaglio(r);
      if (k.certo) return [502, failBody(k.stato, Object.assign({ inviato: false, dettaglio: dett, nota: 'Non è stato trasmesso nulla.' }, info))];
      return [200, Object.assign({ stato: 'esito_incerto', titolo: 'Esito dell\'invio incerto', dettaglio: dett, causa: k.stato, istruzioni: INCERTO }, info)];
    }
    const a = W.analyzeUpload(r.esito, n), out = { caricati: a.caricati, totale: a.totale, inviati: n, info: a.info, dettaglio: a.dettaglio, statusServizio: a.status };
    if (a.esito === 'inviato') { await markSent(v.rows); return [200, Object.assign({ stato: 'inviato', istruzioni: ['Il servizio dichiara di aver caricato tutti i ' + n + ' movimenti.'] }, out, info)]; }
    if (a.esito === 'parziale') return [200, Object.assign({ stato: 'parziale', istruzioni: [
      'Invio PARZIALE: il servizio ha caricato ' + a.caricati + ' movimenti su ' + n + '. Il testo del servizio (sotto) indica quali sono stati scartati e perché.',
      'NON rinviare l\'intero elenco: i movimenti già caricati verrebbero trasmessi di nuovo. Non so quali righe siano state acquisite: controllale con «Elenco movimenti sul portale».',
      'Correggi i soli movimenti scartati e trasmettili in un nuovo elenco.'] }, out, info)];
    if (a.esito === 'respinto') return [200, Object.assign({ stato: 'rifiutato', istruzioni: ['Il servizio non ha caricato nessun movimento (motivo sotto, come restituito dal servizio). Correggi i dati e ripeti controllo e invio.'] }, out, info)];
    return [200, Object.assign({ stato: 'esito_incerto', titolo: 'Esito dell\'invio incerto', incoerente: !!a.incoerente, istruzioni: (a.incoerente ? ['La risposta del servizio non è coerente con i movimenti inviati (conteggio o esito che non tornano).'] : ['La risposta del servizio non è nel formato descritto dal PDF.']).concat(INCERTO) }, out, info)];
  }

  /* ---------- azioni ---------- */
  const actions = {
    // Stato: CIPAT, credenziali, invio reale e tabella delle provenienze. Non chiama il servizio (il PDF non prevede una chiamata di prova).
    async is_status() {
      const P = provenienze(), c = cipatCfg(), info = accountInfo(), cipatValido = /^[A-Za-z0-9-]{16}$/.test(c);
      return [200, Object.assign({ stato: P.ok && cipatValido && info.credenziali.presenti ? 'ok' : 'configurazione_incompleta', cipat: c, cipatValido, provenienze: { ok: P.ok, righe: P.size, stati: P.stati, province: P.province, fonte: P.fonte, acquisita: P.acquisita } }, info)];
    },
    // Ricerca per nome o sigla nella tabella delle provenienze (menu con ricerca della tabella)
    async is_lookup(b) { const P = provenienze(); return [200, { ok: P.ok, risultati: IS.searchProvenienze(P, String(b.q || '').slice(0, 60)) }]; },
    // Lettura e controlli di un CSV caricato: nessuna modifica al contenuto
    async is_parse(b) {
      if (typeof b.text !== 'string' || b.text.length > 200e3) return [400, { err: 'File non valido o troppo grande' }];
      const p = IS.parseText(b.text), { v } = await validateAll(p.rows, p.issues);
      return [200, pub(v)];
    },
    // Controlli su movimenti già strutturati (modifiche nella tabella, righe aggiunte o eliminate)
    async is_validate(b) {
      const s = sanitize(b.rows); if (s.err) return [400, { err: s.err }];
      const { v } = await validateAll(s.rows);
      return [200, pub(v)];
    },
    // Validazione finale e riepilogo: se non ci sono errori rilascia la conferma firmata (monouso, 20 minuti) legata all'impronta dei movimenti
    async is_check(b) {
      const s = sanitize(b.rows); if (s.err) return [400, { err: s.err }];
      const { v } = await validateAll(s.rows);
      if (!v.riepilogo.inviabile) return [422, pub(v, { stato: 'dati_non_validi' })];
      const info = accountInfo();
      return [200, Object.assign({ stato: 'pronto', proof: makeProof(v.hash), proofTtlMs: PROOF_TTL_MS, hash: v.hash, cipat: cipatCfg(),
        riepilogo: { movimenti: v.rows.length, persone: v.riepilogo.persone, primoArrivo: v.riepilogo.primoArrivo, ultimoArrivo: v.riepilogo.ultimoArrivo, avvisi: v.riepilogo.avvisi }, avvisi: avvisiElenco(v) }, info)];
    },
    // Invio: richiede la conferma firmata sugli STESSI dati (impronta), una sola volta, e l'invio reale abilitato (variabile esplicita + Production).
    async is_send(b) {
      const s = sanitize(b.rows); if (s.err) return [400, { err: s.err }];
      const { v, degradato } = await validateAll(s.rows);
      if (!v.riepilogo.inviabile) return [422, pub(v, { stato: 'dati_non_validi' })];
      if (degradato) return [503, { stato: 'archivio_non_disponibile', err: 'Archivio temporaneamente non disponibile: non è stato trasmesso nulla, riprova' }];
      const p = readProof(b.proof);
      if (!p) return [403, { stato: 'prova_non_valida', err: 'Conferma mancante, scaduta o non valida: rifai il controllo e conferma di nuovo' }];
      if (p.h !== v.hash) return [409, { stato: 'dati_cambiati', err: 'I dati sono cambiati dopo la conferma: rifai il controllo e conferma di nuovo' }];
      const c = W.readConfig(env), info = accountInfo();
      if (!c.send.enabled) return [403, Object.assign({ stato: 'send_disattivato', err: 'Invio reale disattivato su questo ambiente: ' + c.send.motivo }, info)];
      if (c.missing.length) return [409, Object.assign(failBody('variabili_mancanti', { missing: c.missing }), info)];
      // la conferma si "brucia" PRIMA di chiamare il servizio: nessun doppio invio da richieste ripetute o ritentativi
      let claimed; try { claimed = await kv('SET', 'istat:prova:' + p.n, '1', 'NX', 'EX', '86400'); } catch { return [503, { stato: 'archivio_non_disponibile', err: 'Archivio temporaneamente non disponibile: non è stato trasmesso nulla, riprova' }]; }
      if (claimed !== 'OK') return [409, { stato: 'prova_gia_usata', err: 'Questa conferma è già stata usata per un invio: rifai il controllo prima di inviare di nuovo' }];
      // un solo invio alla volta per gli stessi dati (due schede aperte, due conferme): il blocco scade da solo dopo 2 minuti
      const lockKey = 'istat:invio:' + v.hash;
      let lock; try { lock = await kv('SET', lockKey, '1', 'NX', 'EX', '120'); } catch { lock = null; }
      if (lock !== 'OK') return [409, { stato: 'invio_in_corso', err: 'Questi stessi dati sono già in fase di invio: attendi l\'esito. Questa richiesta non ha trasmesso nulla' }];
      try { return await doSend(v, s.rows, c, info); } finally { await kv('DEL', lockKey).catch(() => {}); }
    },
    // Verifica sul portale: "elenco dei movimenti caricati dal mese precedente" (PDF, ?ws&list). Sola lettura; si mostra la risposta com'è (il formato non è documentato).
    async is_list() {
      const c = W.readConfig(env), info = accountInfo();
      if (c.missing.length) return [409, Object.assign(failBody('variabili_mancanti', { missing: c.missing }), info)];
      const r = await W.list(c, { fetch: doFetch, timeoutMs: Math.min(8000, BUDGET_MS) });
      if (!r.ok) { const k = W.classify(r); return [502, failBody(k.stato, Object.assign({ dettaglio: W.dettaglio(r) }, info))]; }
      return [200, Object.assign({ stato: 'ok', http: r.http, testo: r.testo, troncato: r.troncato, elementi: r.elementi, json: r.json }, info)];
    }
  };

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ err: 'Metodo non consentito' });
    if (!auth(req)) return res.status(401).json({ err: 'Non autorizzato' });
    const a = String((req.query && req.query.a) || ''), fn = actions[a];
    if (!fn || !/^is_[a-z_]+$/.test(a)) return res.status(404).json({ err: '?' });
    try { const [status, body] = await fn(req.body && typeof req.body === 'object' ? req.body : {}); return res.status(status).json(body); }
    catch (e) { console.error('istat:', a, String(e && e.message || e).slice(0, 80)); return res.status(500).json({ err: 'Errore interno: nessun dato è stato conservato' }); }
  };
}

let wired = null;
// collegamento di produzione: login e archivio (KV) del resto del sito
module.exports = (req, res) => { if (!wired) { const x = require('./x.js'); wired = make({ env: process.env, fetch: (...a) => globalThis.fetch(...a), kv: x.kv, kvp: x.kvp, auth: x.auth }); } return wired(req, res); };
module.exports.make = make;
