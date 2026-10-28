'use strict';
// La Columbera · Gestione → Adempimenti → Alloggiati Web. Endpoint riservato all'amministratore (stesso login del pannello): ogni azione è ?a=al_* con corpo JSON (POST).
// Principi:
//  1. Le credenziali Alloggiati vivono solo nelle variabili d'ambiente di Vercel e ogni chiamata al servizio parte da qui: né credenziali né token arrivano al browser.
//  2. Nessun dato personale viene salvato o scritto nei log. Le schedine restano nella pagina e passano in memoria: il server le riverifica a ogni passo.
//  3. "Conferma e invia" non si aggira dal browser: Send richiede la prova FIRMATA di un Test positivo sugli stessi identici dati (hash) e la accetta una volta sola.
//  4. Mai "inviato" senza una risposta positiva e coerente del servizio. Dopo un timeout l'esito è "incerto" e non si ritenta mai da soli.
const crypto = require('crypto'), zlib = require('zlib');
const AL = require('./_alloggiati.js'), WS = require('./_alloggiati_ws.js');

const PROOF_TTL_MS = 20 * 60e3;        // validità della prova di "Test positivo"
const TABLE_TTL_SEC = 24 * 3600;       // cache delle tabelle ufficiali (KV + memoria)
const BUDGET_MS = 8500;                // tempo massimo per richiesta: sotto il limite di 10 s di una funzione Vercel standard
const KV_MAX_B64 = 900e3;              // oltre questa dimensione la tabella resta solo in memoria
const SENT_TTL_SEC = 7 * 24 * 3600;    // per quanto tempo una schedina acquisita resta "già inviata" (marcatore: solo l'impronta della riga, nessun dato personale)

function make(deps) {
  const env = deps.env, kv = deps.kv, auth = deps.auth, doFetch = deps.fetch, now = deps.now || (() => Date.now());
  const mem = deps.mem || new Map();   // tabelle già lette da questa istanza: { at, table }
  const kvp = deps.kvp || (cmds => Promise.all(cmds.map(c => kv(...c))));      // più comandi in un colpo (pipeline Upstash)
  const secret = () => String(env.SESSION_SECRET || env.ADMIN_PASSWORD || '');
  const net = deadline => ({ url: WS.readConfig(env).url, fetch: doFetch, timeoutMs: Math.max(500, Math.min(8000, deadline - now())) });
  const left = deadline => deadline - now();

  /* ---------- prova firmata ---------- */
  const sign = b => crypto.createHmac('sha256', crypto.createHmac('sha256', secret()).update('alloggiati-proof-v1').digest()).update(b).digest('base64url');
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

  /* ---------- token del servizio (generato a ogni richiesta, mai salvato) ---------- */
  async function newToken(deadline) {
    const c = WS.readConfig(env);
    if (left(deadline) < 800) return { ok: false, kind: 'timeout' };
    return WS.generateToken(c, net(deadline));
  }
  const failBody = (r, extra) => { const stato = WS.classify(r); return Object.assign({ stato, titolo: WS.STATI[stato].titolo, fix: WS.STATI[stato].fix, dettaglio: WS.dettaglio(r) }, extra || {}); };

  /* ---------- tabelle ufficiali: memoria → KV (gzip) → servizio ---------- */
  async function getTable(nome, o) {
    o = o || {};
    const m = mem.get(nome);
    if (m && !o.refresh && now() - m.at < TABLE_TTL_SEC * 1000) return { table: m.table };
    if (!o.refresh) {
      try {
        const raw = await kv('GET', 'alloggiati:tab:' + nome);
        if (raw) { const t = WS.buildTable(nome, zlib.gunzipSync(Buffer.from(raw, 'base64')).toString('utf8')); if (t.ok) { mem.set(nome, { at: now(), table: t }); return { table: t }; } }
      } catch { /* cache illeggibile: si ricarica dal servizio */ }
    }
    if (!o.network) return { table: null };
    const c = WS.readConfig(env); if (c.missing.length) return { table: null, errore: { kind: 'config' } };
    const tk = o.token || await newToken(o.deadline); if (!tk.ok) return { table: null, errore: tk };
    if (left(o.deadline) < 800) return { table: null, errore: { kind: 'timeout' } };
    const r = await WS.tabella(c, tk.token, nome, net(o.deadline));
    if (!r.ok) return { table: null, errore: r };
    const t = WS.buildTable(nome, r.csv);
    if (!t.ok) return { table: null, errore: { kind: 'formato', msg: 'Tabella ' + nome + ' non utilizzabile: ' + t.diag.avvisi.join('; ') }, diag: t.diag };
    mem.set(nome, { at: now(), table: t });
    try { const b64 = zlib.gzipSync(Buffer.from(r.csv, 'utf8')).toString('base64'); if (b64.length < KV_MAX_B64) await kv('SET', 'alloggiati:tab:' + nome, b64, 'EX', String(TABLE_TTL_SEC)); } catch { /* resta in memoria */ }
    return { table: t };
  }
  const cachedTables = async () => {
    const [luoghi, documenti, tipi] = await Promise.all(['Luoghi', 'Tipi_Documento', 'Tipi_Alloggiato'].map(n => getTable(n).then(x => x.table)));
    return { luoghi, documenti, tipi };
  };
  const diagTabelle = async () => { const out = {}; for (const n of ['Luoghi', 'Tipi_Documento', 'Tipi_Alloggiato']) { const t = (await getTable(n)).table; out[n] = t ? { ok: true, righe: t.size, avvisi: t.diag.avvisi } : { ok: false }; } return out; };

  /* ---------- ingresso e validazione ---------- */
  const CAMPI = AL.LAYOUT.map(f => f.k);
  // Il browser può mandare solo i campi del tracciato (più i marcatori di lettura): il resto si scarta. Niente di ciò che arriva si fida.
  function sanitize(arr) {
    if (!Array.isArray(arr) || !arr.length) return { err: 'Nessuna schedina' };
    if (arr.length > AL.MAX_RECORD) return { err: 'Troppe schedine (massimo ' + AL.MAX_RECORD + ')' };
    const records = [];
    for (const x of arr) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return { err: 'Schedina non valida' };
      const r = {};
      for (const k of CAMPI) { const v = x[k]; if (v != null && typeof v !== 'string' && typeof v !== 'number') return { err: 'Campo non valido: ' + k }; r[k] = v == null ? '' : String(v); if (r[k].length > 200) return { err: 'Campo troppo lungo: ' + k }; }
      if (Number.isInteger(x.riga) && x.riga > 0) r.riga = x.riga;
      if (x.approssimato === true) { r.approssimato = true; r._s = [{ sev: 'errore', code: 'RIGA_RICOSTRUITA', campo: null, msg: 'Riga ricostruita per posizione (lunghezza diversa da ' + AL.RECORD_LEN + ' caratteri): i campi potrebbero essere spostati', fix: 'Controlla ogni campo con "Modifica" e salva: la riga verrà ricostruita correttamente' }]; }
      records.push(r);
    }
    return { records };
  }
  const clientRecord = r => { const o = {}; for (const k of [...CAMPI, 'riga', 'approssimato', 'idx', 'nucleo', 'nucleoBloccato', 'ok', 'errori', 'avvisi', 'issues', 'partenza', 'dec']) if (r[k] !== undefined) o[k] = r[k]; return o; };
  const pub = (v, extra) => Object.assign({ records: v.records.map(clientRecord), nuclei: v.nuclei, globali: v.globali, riepilogo: v.riepilogo, hash: v.hash, lines: v.lines }, extra || {});
  const lineKey = line => 'alloggiati:inv:' + crypto.createHash('sha256').update(line).digest('hex').slice(0, 32);
  // Quali schedine il servizio ha già acquisito (invii precedenti, ultimi 7 giorni): evita il doppio invio se si ricarica lo stesso file. null = archivio non raggiungibile.
  async function sentMarkers(records) {
    try { const res = await kvp(records.map(r => ['GET', lineKey(AL.recordToLine(r).line)])), o = {}; res.forEach((x, i) => { if (x) o[i] = String(x); }); return o; }
    catch { return null; }
  }
  // Livelli 1 e 2. Il controllo dei marcatori si fa solo quando i dati sono già formalmente validi (è la fase che porta a Test e Send).
  async function validateAll(records, extra) {
    const tabs = await cachedTables(); let v = AL.validateRecords(records, { now: now(), tables: tabs, extra }), degradato = false;
    if (v.riepilogo.inviabile) {
      const m = await sentMarkers(records);
      if (m === null) degradato = true; else if (Object.keys(m).length) v = AL.validateRecords(records, { now: now(), tables: tabs, extra, inviate: m });
    }
    return { v, tabs, degradato };
  }
  const accountInfo = () => { const c = WS.readConfig(env); return { utente: WS.maskUser(c.utente), send: c.send, ambiente: String(env.VERCEL_ENV || 'locale') }; };

  // Segna come "già inviate" le schedine che il servizio ha acquisito (solo l'impronta della riga, 7 giorni). Se l'archivio non risponde non cambia l'esito dell'invio.
  async function markSent(lines, righe) {
    const iso = new Date(now()).toISOString(), cmds = [];
    righe.forEach((r, i) => { if (r.esito) cmds.push(['SET', lineKey(lines[i]), iso, 'EX', String(SENT_TTL_SEC)]); });
    if (cmds.length) try { await kvp(cmds); } catch { /* resta il blocco sulla prova monouso */ }
  }
  // La chiamata Send vera e propria. Mai ritentata da sola: dopo un timeout l'esito è "incerto".
  async function doSend(v, c, info) {
    const deadline = now() + BUDGET_MS;
    const tk = await newToken(deadline);
    if (!tk.ok) return [502, failBody(tk, Object.assign({ inviato: false, nota: 'Non è stato inviato nulla (il token non è stato ottenuto).' }, info))];
    const r = await WS.send(c, tk.token, v.lines, net(deadline));
    if (!r.ok) {
      // timeout, rete, errori HTTP/SOAP o risposta non interpretabile: NON si sa se il servizio ha acquisito le schedine
      return [200, Object.assign({ stato: 'esito_incerto', dettaglio: WS.dettaglio(r), istruzioni: [
        'Non so se il servizio ha acquisito le schedine: la risposta non è arrivata o non è interpretabile.',
        'NON inviare di nuovo da qui. Controlla sul portale Alloggiati Web se le schedine di questo arrivo risultano comunicate.',
        'Solo se non risultano, ripeti l\'operazione da capo (verifica con Alloggiati e poi invio).'] }, info)];
    }
    const an = WS.analyze(r, v.lines.length), righe = v.records.map((x, i) => Object.assign({ idx: i }, an.righe[i] || { esito: false, cod: '', des: 'nessuna risposta per questa schedina', dett: '' }));
    const acq = righe.filter(x => x.esito).length;
    if (an.coerente && acq) await markSent(v.lines, righe);
    if (an.ok) return [200, Object.assign({ stato: 'inviato', righe, schedineValide: an.valide, istruzioni: ['Tutte le ' + righe.length + ' schedine risultano acquisite dal servizio.', 'Per riprova conserva la ricevuta che il portale Alloggiati Web rende disponibile.'] }, info)];
    if (!an.coerente || acq === 0 && r.general.esito !== true) return [200, Object.assign({ stato: acq ? 'parziale' : 'rifiutato', righe, schedineValide: an.valide, esitoGenerale: r.general, dettaglio: r.general.esito === true ? '' : WS.dettaglio({ kind: 'servizio', cod: r.general.cod, des: r.general.des, dett: r.general.dett }), istruzioni: [
      acq ? 'Il servizio ha risposto in modo non coerente (numero di esiti diverso dalle schedine inviate): non so quali schedine siano state acquisite.' : 'Il servizio non ha acquisito nessuna schedina (vedi i messaggi).',
      'Controlla sul portale Alloggiati Web prima di fare qualsiasi altro tentativo.'] }, info)];
    return [200, Object.assign({ stato: acq ? 'parziale' : 'rifiutato', righe, schedineValide: an.valide, istruzioni: acq ? [
      'Invio PARZIALE: ' + acq + ' schedine su ' + righe.length + ' sono state acquisite, le altre sono state rifiutate (vedi i messaggi).',
      'NON rinviare quelle già acquisite: non vengono inviate di nuovo in automatico.',
      'Per le rifiutate usa il portale Alloggiati Web (inserimento manuale), dopo aver controllato che non risultino già presenti.'] : [
      'Nessuna schedina è stata acquisita (vedi i messaggi del servizio). Correggi i dati e ripeti verifica e invio.'] }, info)];
  }

  /* ---------- azioni ---------- */
  const actions = {
    // Stato della configurazione: variabili, credenziali/WSKEY (GenerateToken + Authentication_Test), raggiungibilità; poi scalda le tabelle ufficiali
    async al_status() {
      const c = WS.readConfig(env), info = accountInfo();
      if (c.missing.length) return [200, Object.assign({ stato: 'variabili_mancanti', titolo: WS.STATI.variabili_mancanti.titolo, fix: WS.STATI.variabili_mancanti.fix, missing: c.missing }, info)];
      const deadline = now() + BUDGET_MS;
      const tk = await newToken(deadline); if (!tk.ok) return [200, failBody(tk, info)];
      const at = await WS.authTest(c, tk.token, net(deadline)); if (!at.ok) return [200, failBody(at, info)];
      for (const n of ['Luoghi', 'Tipi_Documento', 'Tipi_Alloggiato']) if (left(deadline) > 1500) await getTable(n, { network: true, token: tk, deadline });
      return [200, Object.assign({ stato: 'ok', titolo: WS.STATI.ok.titolo, fix: '', tabelle: await diagTabelle() }, info)];
    },
    // Carica (o aggiorna) UNA tabella ufficiale: i dettagli della struttura riconosciuta servono al primo giro di prova
    async al_tables(b) {
      const nome = String(b.nome || ''); if (!['Luoghi', 'Tipi_Documento', 'Tipi_Alloggiato'].includes(nome)) return [400, { err: 'Tabella non valida' }];
      const deadline = now() + BUDGET_MS, r = await getTable(nome, { network: true, refresh: !!b.refresh, deadline });
      if (r.table) return [200, { ok: true, nome, righe: r.table.size, colonne: r.table.diag.colonne, intestazione: r.table.diag.intestazione, scartate: r.table.diag.scartate, avvisi: r.table.diag.avvisi }];
      const e = r.errore || { kind: 'formato' };
      return [200, Object.assign({ ok: false, nome }, e.kind === 'config' ? { stato: 'variabili_mancanti', missing: WS.readConfig(env).missing } : failBody(e), r.diag ? { diag: r.diag } : {})];
    },
    // Ricerca per nome nelle tabelle ufficiali (menu con ricerca del modulo manuale); usa solo la cache
    async al_lookup(b) {
      const q = String(b.q || '').slice(0, 60), t = b.t === 'documenti' ? 'Tipi_Documento' : b.t === 'tipi' ? 'Tipi_Alloggiato' : 'Luoghi';
      const { table } = await getTable(t);
      if (!table) return [200, { ok: false, motivo: 'Tabella non caricata', risultati: [] }];
      // elenco completo delle tabelle brevi (tipi documento, tipi alloggiato) per i menu a tendina; Luoghi è troppo grande: solo ricerca
      if (b.all === true && t !== 'Luoghi') return [200, { ok: true, risultati: table.list().slice().sort((x, y) => x.nome.localeCompare(y.nome, 'it')).slice(0, 200).map(e => ({ codice: e.codice, nome: e.nome, prov: e.prov, kind: e.kind || '' })) }];
      return [200, { ok: true, risultati: t === 'Luoghi' ? WS.search(table, q, { kind: b.kind === 'stato' || b.kind === 'comune' ? b.kind : '' }) : WS.search(table, q, {}) }];
    },
    // Livelli 1 e 2 su un TXT caricato: nessuna modifica al contenuto
    async al_parse(b) {
      if (typeof b.text !== 'string' || b.text.length > 200e3) return [400, { err: 'File non valido o troppo grande' }];
      const p = AL.parseText(b.text);
      const { v, tabs } = await validateAll(p.records, p.issues);
      return [200, pub(v, { tabelle: { Luoghi: !!tabs.luoghi, Tipi_Documento: !!tabs.documenti, Tipi_Alloggiato: !!tabs.tipi } })];
    },
    // Livelli 1 e 2 su schedine già strutturate (modulo manuale o modifiche a mano dopo il caricamento del file)
    async al_validate(b) {
      const s = sanitize(b.records); if (s.err) return [400, { err: s.err }];
      const { v, tabs } = await validateAll(s.records);
      return [200, pub(v, { tabelle: { Luoghi: !!tabs.luoghi, Tipi_Documento: !!tabs.documenti, Tipi_Alloggiato: !!tabs.tipi } })];
    },
    // Livello 3: Authentication_Test + Test sul servizio ufficiale. Solo se i dati sono formalmente validi. Un Test positivo rilascia la prova per Send.
    async al_check(b) {
      const s = sanitize(b.records); if (s.err) return [400, { err: s.err }];
      const { v } = await validateAll(s.records);
      if (!v.riepilogo.inviabile) return [422, pub(v, { stato: 'dati_non_validi' })];
      const c = WS.readConfig(env), info = accountInfo();
      if (c.missing.length) return [409, Object.assign({ stato: 'variabili_mancanti', titolo: WS.STATI.variabili_mancanti.titolo, fix: WS.STATI.variabili_mancanti.fix, missing: c.missing }, info)];
      const deadline = now() + BUDGET_MS;
      const tk = await newToken(deadline); if (!tk.ok) return [502, failBody(tk, info)];
      const at = await WS.authTest(c, tk.token, net(deadline)); if (!at.ok) return [502, failBody(at, info)];
      const t = await WS.test(c, tk.token, v.lines, net(deadline)); if (!t.ok) return [502, failBody(t, info)];
      // esito generale negativo = il servizio ha rifiutato l'intera richiesta (es. token non valido): se ne mostra il motivo, non un generico "risposta incompleta"
      if (t.general.esito !== true) return [502, failBody({ kind: 'servizio', http: t.http, cod: t.general.cod, des: t.general.des, dett: t.general.dett }, info)];
      const an = WS.analyze(t, v.lines.length), righe = v.records.map((r, i) => Object.assign({ idx: i }, an.righe[i] || { esito: false, cod: '', des: 'nessuna risposta per questa schedina', dett: '' }));
      const bloccati = new Set(); v.nuclei.forEach(n => { const idx = [n.capo, ...n.membri]; if (idx.some(i => !righe[i].esito)) idx.forEach(i => bloccati.add(i)); });
      righe.forEach(r => { r.bloccataPerNucleo = bloccati.has(r.idx) && r.esito; });
      const out = Object.assign({ stato: an.ok ? 'test_ok' : 'test_con_errori', righe, schedineValide: an.valide, coerente: an.coerente, hash: v.hash }, info);
      if (!an.coerente) out.anomalia = 'Il servizio ha risposto per ' + (an.righe.length) + ' schedine su ' + v.lines.length + ': per prudenza non si procede';
      if (an.ok) { out.proof = makeProof(v.hash); out.proofScadenzaMs = now() + PROOF_TTL_MS; out.proofTtlMs = PROOF_TTL_MS; }
      return [200, out];
    },
    // Livello 4: Send. Richiede la prova firmata del Test positivo sugli STESSI dati (hash), una sola volta, e Send abilitato (Production + variabile esplicita).
    async al_send(b) {
      const s = sanitize(b.records); if (s.err) return [400, { err: s.err }];
      const { v, degradato } = await validateAll(s.records);
      if (!v.riepilogo.inviabile) return [422, pub(v, { stato: 'dati_non_validi' })];
      if (degradato) return [503, { stato: 'archivio_non_disponibile', err: 'Archivio temporaneamente non disponibile: non è stato inviato nulla, riprova' }];
      const p = readProof(b.proof);
      if (!p) return [403, { stato: 'prova_non_valida', err: 'Prova del Test mancante, scaduta o non valida: rifai la verifica con Alloggiati' }];
      if (p.h !== v.hash) return [409, { stato: 'dati_cambiati', err: 'I dati sono cambiati dopo il Test: rifai la verifica con Alloggiati' }];
      const c = WS.readConfig(env), info = accountInfo();
      if (!c.send.enabled) return [403, Object.assign({ stato: 'send_disattivato', err: 'Invio reale disattivato su questo ambiente: ' + c.send.motivo }, info)];
      if (c.missing.length) return [409, Object.assign({ stato: 'variabili_mancanti', missing: c.missing }, info)];
      // la prova si "brucia" PRIMA di chiamare il servizio: nessun doppio invio da richieste ripetute o ritentativi
      let claimed; try { claimed = await kv('SET', 'alloggiati:prova:' + p.n, '1', 'NX', 'EX', '86400'); } catch { return [503, { stato: 'archivio_non_disponibile', err: 'Archivio temporaneamente non disponibile: non è stato inviato nulla, riprova' }]; }
      if (claimed !== 'OK') return [409, { stato: 'prova_gia_usata', err: 'Questa verifica è già stata usata per un invio: rifai la verifica prima di inviare di nuovo' }];
      // un solo invio alla volta per gli stessi dati (due schede aperte, due verifiche): il blocco scade da solo dopo 2 minuti
      const lockKey = 'alloggiati:invio:' + v.hash;
      let lock; try { lock = await kv('SET', lockKey, '1', 'NX', 'EX', '120'); } catch { lock = null; }
      if (lock !== 'OK') return [409, { stato: 'invio_in_corso', err: 'Questi stessi dati sono già in fase di invio: attendi l\'esito. Questa richiesta non ha inviato nulla' }];
      try { return await doSend(v, c, info); } finally { await kv('DEL', lockKey).catch(() => {}); }
    }
  };

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ err: 'Metodo non consentito' });
    if (!auth(req)) return res.status(401).json({ err: 'Non autorizzato' });
    const a = String((req.query && req.query.a) || ''), fn = actions[a];
    if (!fn || !/^al_[a-z_]+$/.test(a)) return res.status(404).json({ err: '?' });
    try { const [status, body] = await fn(req.body && typeof req.body === 'object' ? req.body : {}); return res.status(status).json(body); }
    catch (e) { console.error('adempimenti:', a, String(e && e.message || e).slice(0, 80)); return res.status(500).json({ err: 'Errore interno: nessun dato è stato conservato' }); }
  };
}

let wired = null;
// collegamento di produzione: login e archivio (KV) del resto del sito
module.exports = (req, res) => { if (!wired) { const x = require('./x.js'); wired = make({ env: process.env, fetch: (...a) => globalThis.fetch(...a), kv: x.kv, kvp: x.kvp, auth: x.auth }); } return wired(req, res); };
module.exports.make = make;
