'use strict';
// La Columbera · messaggi tra ospite e titolare, template, messaggi automatici programmati, traduzione automatica.
// Il prefisso "_" evita che Vercel lo esponga come endpoint: le azioni sono in x.js (a=msg_…), gli invii automatici partono dalla sincronizzazione.
//
// Chi scrive: le prenotazioni fatte sul sito e confermate. Gli ospiti di Booking e Airbnb usano la chat della piattaforma: per loro i template
// si compilano in Gestione e si incollano là. Solo testo, al massimo 2000 caratteri; ogni testo si mostra sempre come testo (mai HTML).
//
// KV (chiavi separate dalla configurazione: il pulsante «Salva modifiche» della Gestione non le tocca mai):
//   msg:<codice>        lista dei messaggi {id, da: 'ospite'|'host'|'auto', testo, lingua, ts, regola?}: al massimo 300, i più vecchi escono
//   msg:v:<codice>      versione della conversazione (cresce a ogni messaggio): chi controlla se c'è qualcosa di nuovo legge solo questa
//   msg:tr:<codice>     traduzioni, campo "<id>:<lingua>" → testo
//   msg:idx             conversazioni, campo codice → {ts, da, anteprima}
//   msg:nh / msg:no     non letti dal titolare / dall'ospite, campo codice → numero
//   msg:lo              ultima lettura dell'ospite (per «letto»), campo codice → ms
//   msg:lingua          lingua dell'area ospiti (it, en, de), campo codice → lingua
//   msg:tpl             template [{id, nome, testo}] (finché il titolare non li salva valgono quelli di DEFAULT_TPL)
//   msg:auto            regole dei messaggi automatici [{id, nome, attiva, tpl, base, giorni, ora, apt, nottiMin, ritardo, dal}]
//   msg:prog            messaggi programmati a mano, campo id → {id, code, testo, quando}
//   msg:imp             impostazioni {conservazione, avvisaTitolare, avvisaOspite}
//   msg:fatto:<regola>:<codice> · msg:fatto:p:<id>   invio fatto, saltato o in corso: mai due volte la stessa cosa (SET NX)
//   msg:avv:h:<codice> · msg:avv:o:<codice>           ultimo avviso email al titolare / all'ospite (15 minuti: dopo il primo non letto, al massimo uno ogni 15 minuti)
//   tr:tpl:<impronta>:<lingua>                        traduzione di un template (senza i dati della prenotazione)
// Traduzione (api/_traduci.js, DeepL): i messaggi automatici si traducono dal template, con le variabili protette: a DeepL non arrivano
// mai nomi, codici o Wi-Fi della prenotazione. I messaggi scritti a mano (dall'ospite o dal titolare) si traducono così come sono.
// Nessun log con testi, nomi o codici.
const crypto = require('crypto');
const AV = require('./_avail.js');

const MAX_TESTO = 2000, MAX_MSG = 300, LATE_MS = 36 * 3600e3, FATTO_TTL = 400 * 86400, DAY = 864e5;
const RE_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/, BASI = ['conferma', 'arrivo', 'partenza'], LINGUE_AREA = ['it', 'en', 'de'];
const INDIRIZZO = 'Via Centrale 48, 38123 Ravina (Trento)';
const LOC = { it: 'it-IT', en: 'en-GB', de: 'de-DE' };
// Template di partenza: il titolare li cambia, li cancella o ne aggiunge in Gestione → Messaggi → Template.
const DEFAULT_TPL = [
  { id: 'benvenuto', nome: 'Benvenuto (dopo la conferma)', testo: 'Ciao {nome}, grazie per aver scelto La Columbera! Ti aspettiamo {checkin} nell\'appartamento {appartamento}: il check-in è dalle {ora_checkin}.\n\nPrima di arrivare fai il check-in online e richiedi la Trentino Guest Card dalla tua area ospiti. Per qualsiasi domanda scrivici qui.' },
  { id: 'promemoria', nome: 'Promemoria prima dell\'arrivo', testo: 'Ciao {nome}, ci vediamo {checkin}! Il check-in è dalle {ora_checkin} in {indirizzo}. Se non l\'hai ancora fatto completa il check-in online: dopo la registrazione ti arrivano via email le istruzioni per entrare.' },
  { id: 'grazie', nome: 'Grazie e recensione', testo: 'Ciao {nome}, grazie per aver soggiornato alla Columbera! Se il soggiorno ti è piaciuto, una recensione ci aiuta moltissimo. Speriamo di rivederti presto.' },
  { id: 'portale', nome: 'Per Booking.com e Airbnb: area ospiti', testo: 'Ciao! Grazie per la prenotazione alla Columbera. Nella tua area ospiti trovi check-in online, Trentino Guest Card e tutte le informazioni per il soggiorno: {link_area}\n(per entrare basta il numero di prenotazione: {codice})' }
];
const VARIABILI = [
  ['nome', 'Nome dell\'ospite (solo prenotazioni del sito)'], ['appartamento', 'Torre o Corte'], ['checkin', 'Giorno di arrivo'], ['checkout', 'Giorno di partenza'],
  ['ora_checkin', 'Orario di check-in'], ['ora_checkout', 'Orario di check-out'], ['notti', 'Numero di notti'], ['ospiti', 'Numero di ospiti'],
  ['codice', 'Codice di prenotazione'], ['link_area', 'Link all\'area ospiti (entra con un tocco)'], ['wifi', 'Wi-Fi e informazioni riservate dell\'appartamento'], ['indirizzo', 'Indirizzo della struttura']
];

const parse = s => { if (s == null) return null; try { return JSON.parse(s); } catch { return null; } };
const hashObj = r => { if (!r) return {}; if (!Array.isArray(r)) return r; const o = {}; for (let i = 0; i + 1 < r.length; i += 2) o[r[i]] = r[i + 1]; return o; };
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const err = (status, message) => Object.assign(new Error(message), { status });
// testo di un messaggio: a capo normalizzati, niente caratteri di controllo, al massimo 3 righe vuote di fila
const pulisci = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, n || MAX_TESTO);
const fmtCode = c => { c = String(c || ''); return /^[0-9A-Z]{13}$/.test(c) ? c.slice(0, 4) + ' ' + c.slice(4, 8) + ' ' + c.slice(8) : c; };
const dLong = (s, lg) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ''); if (!m) return String(s || ''); try { return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString(LOC[lg] || 'it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch { return s; } };
// istante (ms) di un giorno "YYYY-MM-DD" alle HH:MM di Trento (ora legale compresa)
const romeMs = (day, hhmm) => { const [y, m, d] = day.split('-').map(Number), [h, mi] = String(hhmm || '00:00').split(':').map(Number); return AV.zonedToUtcMs(y, m, d, h, mi, 0, AV.TZ); };
const fineGiorno = day => romeMs(AV.addDays(day, 1), '00:00') - 1;
const cleanId = s => String(s == null ? '' : s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
// le variabili dei template non si traducono: <x>…</x> con il formato XML di DeepL (il resto del testo va reso XML valido)
const proteggi = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{([a-z_]+)\}/g, '<x>{$1}</x>');
const sproteggi = s => s.replace(/<x>\s*(\{[a-z_]+\})\s*<\/x>/g, '$1').replace(/<\/?x>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Compila un template per una prenotazione (del sito o del foglio). Una variabile vuota (es. il nome per una prenotazione Booking) sparisce
// insieme allo spazio che la precede: "Ciao {nome}!" → "Ciao!". Le date si scrivono nella lingua del testo.
function riempi(testo, b, config, site, lg) {
  lg = LOC[lg] ? lg : 'it';
  const p = ((config && config.apts) || []).find(q => q.id === b.id) || {};
  const v = {
    nome: String(b.nome || '').trim().split(/\s+/)[0] || '', appartamento: String(p.nome || b.id || '').replace('La Columbera ', ''),
    checkin: dLong(b.da, lg), checkout: dLong(b.a, lg), ora_checkin: AV.noticeSettings(config || {}).ora, ora_checkout: config && RE_HHMM.test(config.checkoutOra) ? config.checkoutOra : '',
    notti: b.notti ? String(b.notti) : '', ospiti: b.ospiti ? String(b.ospiti) : '', codice: fmtCode(b.code),
    link_area: String(site || '') + '/area-clienti.html#k=' + encodeURIComponent(b.code || ''), wifi: String(p.infoRiservate || '').trim(), indirizzo: INDIRIZZO
  };
  return String(testo || '').replace(/[ \t]*\{([a-z_]+)\}/g, (m, k) => !(k in v) ? m : v[k] ? m.slice(0, m.indexOf('{')) + v[k] : '');
}

function makeMessaggi({ kv, kvp, traduci, sendMail, ownerEmail, replyTo, issueToken, mail, log, now }) {
  now = now || (() => Date.now());
  const T = traduci || { attiva: () => false, traduci: async () => ({ ok: false }), supportata: () => false };
  const jget = async k => parse(await kv('GET', k));
  const newId = () => now().toString(36) + crypto.randomBytes(4).toString('hex');
  const logE = m => Promise.resolve().then(() => log && log({ lvl: 'ERR', msg: m })).catch(() => {});
  const ms = () => Number(process.hrtime.bigint() / 1000000n);        // tempo reale (per il limite di durata dentro la sincronizzazione)

  /* ---------- impostazioni ---------- */
  async function impostazioni() {
    const o = (await jget('msg:imp')) || {}, c = Number(o.conservazione);
    return { conservazione: Number.isInteger(c) && c >= 7 && c <= 730 ? c : 7, avvisaTitolare: o.avvisaTitolare !== false, avvisaOspite: o.avvisaOspite !== false };      // entrambi gli avvisi attivi di partenza; conversazioni 7 giorni dopo la partenza (come l'area clienti)
  }
  async function salvaImpostazioni(b) {
    const c = Number(b && b.conservazione);
    if (!Number.isInteger(c) || c < 7 || c > 730) throw err(400, 'Conservazione non valida: da 7 a 730 giorni dopo la partenza');
    const o = { conservazione: c, avvisaTitolare: b.avvisaTitolare !== false, avvisaOspite: b.avvisaOspite !== false };
    await kv('SET', 'msg:imp', JSON.stringify(o));
    return o;
  }

  /* ---------- conversazioni ---------- */
  const lista = async code => ((await kv('LRANGE', 'msg:' + code, '0', '-1')) || []).map(parse).filter(m => m && m.id);
  const versione = async code => +(await kv('GET', 'msg:v:' + code)) || 0;
  async function append(code, m) {
    const len = +(await kv('RPUSH', 'msg:' + code, JSON.stringify(m))) || 0;
    const cmds = [['INCR', 'msg:v:' + code], ['HSET', 'msg:idx', code, JSON.stringify({ ts: m.ts, da: m.da, anteprima: m.testo.slice(0, 140) })], ['HINCRBY', m.da === 'ospite' ? 'msg:nh' : 'msg:no', code, '1']];
    if (len > MAX_MSG) cmds.push(['LTRIM', 'msg:' + code, String(len - MAX_MSG), String(len - 1)]);
    await kvp(cmds);
    return m;
  }
  // traduzioni mancanti: una sola chiamata per tutti i testi, poi restano salvate (se DeepL non risponde si mostra l'originale)
  async function completa(code, msgs, tr, verso, o) {
    if (!T.attiva() || !msgs.length) return tr;
    const r = await T.traduci(msgs.map(m => m.testo), verso, o || {});
    if (!r.ok) return tr;
    await kvp(msgs.map((m, i) => ['HSET', 'msg:tr:' + code, m.id + ':' + verso, r.testi[i]])).catch(() => {});
    msgs.forEach((m, i) => { tr[m.id + ':' + verso] = r.testi[i]; });
    return tr;
  }
  const linguaDi = async code => { const l = await kv('HGET', 'msg:lingua', code).catch(() => null); return LINGUE_AREA.includes(l) ? l : null; };

  // Vista dell'ospite (area clienti). v = versione che la pagina ha già: se non è cambiato nulla basta dirlo.
  // I messaggi del titolare si mostrano nella lingua dell'ospite (traduzione salvata, o fatta ora); leggerli li segna come letti.
  async function perOspite(code, lingua, v) {
    lingua = LINGUE_AREA.includes(lingua) ? lingua : 'it';
    const [cur, nl, lg] = await kvp([['GET', 'msg:v:' + code], ['HGET', 'msg:no', code], ['HGET', 'msg:lingua', code]]);
    if (lg !== lingua) await kv('HSET', 'msg:lingua', code, lingua);
    if (v != null && v !== '' && +v === (+cur || 0) && !(+nl > 0)) return { v: +cur || 0, invariato: true };
    const msgs = await lista(code);
    let tr = hashObj(await kv('HGETALL', 'msg:tr:' + code));
    tr = await completa(code, msgs.filter(m => m.da !== 'ospite' && (m.lingua || 'it') !== lingua && tr[m.id + ':' + lingua] == null), tr, lingua, { da: 'it' });
    await kvp([['HDEL', 'msg:no', code], ['HSET', 'msg:lo', code, String(now())]]);
    return {
      v: +cur || 0, messaggi: msgs.map(m => {
        const t = m.da !== 'ospite' && (m.lingua || 'it') !== lingua ? tr[m.id + ':' + lingua] : null;
        return Object.assign({ id: m.id, da: m.da === 'ospite' ? 'ospite' : 'host', testo: t || m.testo, ts: m.ts }, t ? { originale: m.testo } : {}, m.da === 'auto' ? { auto: true } : {});
      })
    };
  }
  // L'ospite scrive. Con la traduzione attiva DeepL riconosce la lingua: se non è l'italiano, il titolare trova anche la traduzione.
  async function daOspite(code, testo, lingua, { booking, site } = {}) {
    testo = pulisci(testo);
    if (!testo) throw err(400, 'Scrivi un messaggio');
    const m = { id: newId(), da: 'ospite', testo, lingua: LINGUE_AREA.includes(lingua) ? lingua : 'it', ts: now() };
    let it = null;
    if (T.attiva()) { const r = await T.traduci([testo], 'it'); if (r.ok) { if (r.lingue[0]) m.lingua = r.lingue[0]; if (m.lingua !== 'it') it = r.testi[0]; } }
    await append(code, m);
    if (it) await kv('HSET', 'msg:tr:' + code, m.id + ':it', it).catch(() => {});
    await avvisaTitolare(code, booking, site, m, it).catch(() => {});
    return { id: m.id, da: 'ospite', testo: m.testo, ts: m.ts };
  }
  // Il titolare scrive (o parte un messaggio automatico). traduzioni = testi già pronti per lingua (template); verso = lingua dell'ospite
  async function daHost(code, testo, { auto, regola, verso, traduzioni, booking, site } = {}) {
    testo = pulisci(testo);
    if (!testo) throw err(400, 'Scrivi un messaggio');
    const m = Object.assign({ id: newId(), da: auto ? 'auto' : 'host', testo, lingua: 'it', ts: now() }, regola ? { regola } : {});
    await append(code, m);
    const cmds = [], tr = {};      // tr: il messaggio tradotto, per lingua (serve anche all'email per l'ospite)
    for (const [lg, t] of Object.entries(traduzioni || {})) if (lg !== 'it' && t) { tr[lg] = pulisci(t); cmds.push(['HSET', 'msg:tr:' + code, m.id + ':' + lg, tr[lg]]); }
    if (verso && verso !== 'it' && !tr[verso] && T.attiva()) { const r = await T.traduci([testo], verso, { da: 'it' }); if (r.ok) { tr[verso] = r.testi[0]; cmds.push(['HSET', 'msg:tr:' + code, m.id + ':' + verso, r.testi[0]]); } }
    if (cmds.length) await kvp(cmds).catch(() => {});
    await avvisaOspite(code, booking, site, m, tr).catch(() => {});
    return m;
  }
  // Vista del titolare: i messaggi dell'ospite con la traduzione in italiano, i propri con «letto» (l'ospite ha aperto i messaggi dopo)
  async function perHost(code, v, lo) {
    const [cur, loRaw, lg] = await kvp([['GET', 'msg:v:' + code], ['HGET', 'msg:lo', code], ['HGET', 'msg:lingua', code]]);
    if (v != null && v !== '' && +v === (+cur || 0) && +lo === (+loRaw || 0)) return { v: +cur || 0, lo: +loRaw || 0, invariato: true };
    const msgs = await lista(code);
    let tr = hashObj(await kv('HGETALL', 'msg:tr:' + code));
    tr = await completa(code, msgs.filter(m => m.da === 'ospite' && m.lingua && m.lingua !== 'it' && tr[m.id + ':it'] == null), tr, 'it');
    await kv('HDEL', 'msg:nh', code);
    const ospite = LINGUE_AREA.includes(lg) ? lg : null, letto = +loRaw || 0;
    return {
      v: +cur || 0, lo: letto, lingua: ospite, traduzione: T.attiva(),
      messaggi: msgs.map(m => Object.assign({ id: m.id, da: m.da, testo: m.testo, ts: m.ts, lingua: m.lingua || 'it' }, m.regola ? { regola: m.regola } : {},
        m.da === 'ospite' ? (tr[m.id + ':it'] ? { tradotto: tr[m.id + ':it'] } : {}) : Object.assign({ letto: letto >= m.ts }, ospite && ospite !== 'it' && tr[m.id + ':' + ospite] ? { tradotto: tr[m.id + ':' + ospite] } : {})))
    };
  }
  async function inbox(bks) {
    const [idx, nh] = await kvp([['HGETALL', 'msg:idx'], ['HGETALL', 'msg:nh']]);
    const I = hashObj(idx), N = hashObj(nh), by = new Map((bks || []).map(b => [String(b.code), b]));
    const conversazioni = Object.entries(I).map(([code, s]) => {
      const x = parse(s) || {}, b = by.get(code) || {};
      return { code, ts: x.ts || 0, da: x.da || '', anteprima: x.anteprima || '', nonLetti: +N[code] || 0, nome: b.nome || '', apt: b.id || '', dal: b.da || '', al: b.a || '', stato: b.stato || '' };
    }).sort((a, b) => ((b.nonLetti > 0) - (a.nonLetti > 0)) || (b.ts - a.ts));
    // prenotazioni confermate del sito senza conversazione (si può scrivere per primi): dal mese scorso in poi
    const da = AV.addDays(AV.todayRome(now()), -30);
    const senza = (bks || []).filter(b => b && b.stato === 'confermata' && !I[b.code] && String(b.a) >= da).sort((a, b) => String(a.da).localeCompare(String(b.da)))
      .map(b => ({ code: b.code, nome: b.nome || '', apt: b.id, dal: b.da, al: b.a }));
    return { conversazioni, senza, nonLetti: conversazioni.reduce((s, c) => s + c.nonLetti, 0), traduzione: T.attiva() };
  }
  const nonLettiHost = async () => Object.values(hashObj(await kv('HGETALL', 'msg:nh'))).reduce((s, n) => s + (+n || 0), 0);
  const nonLettiOspite = async code => +(await kv('HGET', 'msg:no', code)) || 0;

  /* ---------- avvisi email ---------- */
  // Un avviso per il primo messaggio non letto; se ne arrivano altri prima che il destinatario legga, al massimo uno ogni 15 minuti.
  // nonLetti = contatore dei non letti del destinatario (già aggiornato con questo messaggio), chiave = ultimo avviso mandato.
  async function libero(nonLetti, chiave) {
    if ((+(await kv('HGET', nonLetti[0], nonLetti[1])) || 0) <= 1) { await kv('SET', chiave, '1', 'EX', '900'); return true; }
    return (await kv('SET', chiave, '1', 'NX', 'EX', '900')) === 'OK';
  }
  // Al titolare, quando scrive un ospite: il testo (con la traduzione in italiano se ha scritto in un'altra lingua) e «Rispondi»,
  // che apre la conversazione in Gestione. Se l'invio non riesce, al messaggio successivo si riprova.
  async function avvisaTitolare(code, b, site, m, it) {
    if (!sendMail || !ownerEmail || !mail || !(await impostazioni()).avvisaTitolare) return;
    const k = 'msg:avv:h:' + code;
    if (!(await libero(['msg:nh', code], k))) return;
    const mm = mail().avvisoTitolare(b || { code }, site, { testo: m && m.testo, it });
    if ((await sendMail(ownerEmail, mm.subject, mm.html, { text: mm.text })) === false) await kv('DEL', k).catch(() => {});
  }
  // All'ospite, quando scrivi tu (anche i messaggi automatici): il testo nella sua lingua, se c'è la traduzione, con l'originale sotto,
  // e «Rispondi», che apre i messaggi della sua area ospiti senza il codice (token nel frammento "#"). Si spegne in Messaggi → Automatici.
  async function avvisaOspite(code, b, site, m, tr) {
    if (!sendMail || !mail || !b || !/.+@.+\..+/.test(b.email || '') || !(await impostazioni()).avvisaOspite) return;
    const k = 'msg:avv:o:' + code;
    if (!(await libero(['msg:no', code], k))) return;
    const lg = await linguaDi(code);      // la lingua scelta dall'ospite nell'area (null = non ha ancora aperto i messaggi)
    let tk = null; try { tk = issueToken ? await issueToken(b) : null; } catch (e) { tk = null; }
    const mm = mail().avvisoOspite(b, site, tk, { testo: m && m.testo, lingua: lg, tradotto: lg && lg !== 'it' ? (tr || {})[lg] || '' : '' });
    if ((await sendMail(b.email, mm.subject, mm.html, Object.assign({ text: mm.text }, replyTo ? { replyTo } : {}))) === false) await kv('DEL', k).catch(() => {});
  }

  /* ---------- template ---------- */
  async function templates() { const t = await jget('msg:tpl'); return Array.isArray(t) ? t : DEFAULT_TPL.map(x => Object.assign({}, x)); }
  function normTemplates(list) {
    if (!Array.isArray(list) || list.length > 50) throw err(400, 'Elenco dei template non valido (al massimo 50)');
    const out = [], ids = new Set();
    for (const x of list) {
      const nome = pulisci(x && x.nome, 80), testo = pulisci(x && x.testo);
      if (!nome || !testo) throw err(400, 'Ogni template ha bisogno di un nome e di un testo');
      let id = cleanId(x.id) || newId(); if (ids.has(id)) id = newId(); ids.add(id);
      out.push({ id, nome, testo });
    }
    return out;
  }
  async function salvaTemplates(list) {
    const out = normTemplates(list), ids = new Set(out.map(t => t.id));
    const usato = (await regole()).find(r => !ids.has(r.tpl));
    if (usato) throw err(409, 'Il template usato dalla regola «' + usato.nome + '» non c\'è più: cambia prima la regola (Messaggi automatici)');
    await kv('SET', 'msg:tpl', JSON.stringify(out));
    return out;
  }
  // traduzione di un template, con le variabili protette; resta salvata 60 giorni (la chiave è l'impronta del testo)
  async function templateIn(testo, lg) {
    const k = 'tr:tpl:' + sha(testo).slice(0, 32) + ':' + lg, c = await kv('GET', k).catch(() => null);
    if (c) return c;
    const r = await T.traduci([proteggi(testo)], lg, { da: 'it', xml: true });
    if (!r.ok) return null;
    const t = sproteggi(r.testi[0]);
    await kv('SET', k, t, 'EX', String(60 * 86400)).catch(() => {});
    return t;
  }
  async function testiDaTemplate(testo, b, config, site) {
    const out = { it: riempi(testo, b, config, site, 'it') };
    if (T.attiva()) for (const lg of ['en', 'de']) { const t = await templateIn(testo, lg); if (t) out[lg] = riempi(t, b, config, site, lg); }
    return out;
  }

  /* ---------- regole dei messaggi automatici ---------- */
  // base + giorni + ora: "conferma" = appena la prenotazione è confermata; "arrivo"/"partenza" = quel giorno ± giorni, alle HH:MM di Trento.
  // dal = da quando la regola vale (attivazione o cambio del momento d'invio): attivare una regola non manda messaggi «arretrati».
  // ritardo = se la prenotazione arriva quando il momento è già passato, il messaggio parte subito (ma mai dopo che non ha più senso).
  async function regole() { const r = await jget('msg:auto'); return Array.isArray(r) ? r : []; }
  async function salvaRegole(list, aptIds) {
    const out = normRegole(list, aptIds, new Set((await templates()).map(t => t.id)), new Map((await regole()).map(r => [r.id, r])));
    await kv('SET', 'msg:auto', JSON.stringify(out));
    return out;
  }
  // Template e loro invii automatici insieme (Gestione → Messaggi → Template): le regole possono indicare un template nuovo dello stesso
  // salvataggio (con l'id scelto dalla pagina) e un template tolto si porta via le sue regole nello stesso momento
  async function salvaInsieme(listT, listR, aptIds) {
    const tpl = normTemplates(listT), reg = normRegole(listR, aptIds, new Set(tpl.map(t => t.id)), new Map((await regole()).map(r => [r.id, r])));
    await kvp([['SET', 'msg:tpl', JSON.stringify(tpl)], ['SET', 'msg:auto', JSON.stringify(reg)]]);
    return { templates: tpl, regole: reg };
  }
  function normRegole(list, aptIds, tpls, old) {
    if (!Array.isArray(list) || list.length > 30) throw err(400, 'Elenco delle regole non valido (al massimo 30)');
    const out = [], ids = new Set();
    for (const x of list) {
      const nome = pulisci(x && x.nome, 80) || 'Messaggio automatico', base = BASI.includes(x.base) ? x.base : '';
      if (!base) throw err(400, 'Regola «' + nome + '»: scegli quando inviarla');
      const giorni = base === 'conferma' ? 0 : Number(x.giorni), ora = base === 'conferma' ? '' : String(x.ora || '');
      if (!Number.isInteger(giorni) || giorni < -60 || giorni > 60) throw err(400, 'Regola «' + nome + '»: giorni non validi (da 0 a 60)');
      if (base !== 'conferma' && !RE_HHMM.test(ora)) throw err(400, 'Regola «' + nome + '»: orario non valido (HH:MM)');
      if (!tpls.has(x.tpl)) throw err(400, 'Regola «' + nome + '»: scegli un template');
      let id = cleanId(x.id) || newId(); if (ids.has(id)) id = newId(); ids.add(id);
      const prev = old.get(id), attiva = x.attiva === true, stessa = prev && prev.attiva && prev.base === base && prev.giorni === giorni && prev.ora === ora;
      out.push({ id, nome, attiva, tpl: x.tpl, base, giorni, ora, apt: aptIds.includes(x.apt) ? x.apt : '', nottiMin: Math.max(0, Math.min(60, parseInt(x.nottiMin, 10) || 0)), ritardo: x.ritardo === true, dal: attiva ? (stessa ? prev.dal : now()) : 0 });
    }
    return out;
  }
  const dueOf = (r, b) => {
    if (r.base === 'conferma') return Date.parse(b.confermata_il || b.creato) || 0;
    const d = r.base === 'arrivo' ? b.da : b.a;
    return AV.isIso(d) ? romeMs(AV.addDays(d, r.giorni), r.ora) : 0;
  };
  // in ritardo, fin quando ha ancora senso: un messaggio prima dell'arrivo fino alla fine del giorno di arrivo, uno durante il soggiorno fino alla partenza
  const limiteRitardo = (r, b, due) => r.base === 'conferma' ? due : r.base === 'arrivo' ? fineGiorno(r.giorni <= 0 ? b.da : b.a) : r.giorni <= 0 ? fineGiorno(b.a) : due + LATE_MS;
  const vale = (r, b) => !(r.apt && r.apt !== b.id) && !(r.nottiMin && (+b.notti || 0) < r.nottiMin);
  // quando parte (ms) una regola per una prenotazione, oppure null se non parte: in orario fino a 36 ore dopo (sincronizzazione ferma), in ritardo se ammesso
  const quandoParte = (r, b, t) => {
    const due = dueOf(r, b);
    if (!due) return null;
    const start = Math.max(+r.dal || 0, Date.parse(b.confermata_il || b.creato) || 0);
    if (due >= start) return due > t || t - due <= LATE_MS ? due : null;
    return r.ritardo && t <= limiteRitardo(r, b, due) ? t : null;
  };
  // invii dei prossimi giorni (e quelli già dovuti, che partono al prossimo giro), per la Gestione: stato '' = in programma, 'saltato'
  async function prossimi(bks, giorni) {
    const t = now(), fino = t + (giorni || 7) * DAY, att = (await regole()).filter(r => r.attiva), nomi = new Map((await templates()).map(x => [x.id, x.nome]));
    const out = [];
    for (const r of att) for (const b of (bks || [])) {
      if (!b || b.stato !== 'confermata' || !vale(r, b)) continue;
      const q = quandoParte(r, b, t);
      if (q == null || q > fino) continue;
      out.push({ regola: r.id, nomeRegola: r.nome, template: nomi.get(r.tpl) || '', code: b.code, nome: b.nome || '', apt: b.id, dal: b.da, al: b.a, quando: Math.max(q, t) });
    }
    if (!out.length) return out;
    const st = await kvp(out.map(x => ['GET', 'msg:fatto:' + x.regola + ':' + x.code]));
    out.forEach((x, i) => { x.stato = st[i] || ''; });
    return out.filter(x => x.stato === '' || x.stato === 'saltato').sort((a, b) => a.quando - b.quando);
  }
  async function salta(regola, code, si) {
    const k = 'msg:fatto:' + cleanId(regola) + ':' + String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (si) {
      if ((await kv('SET', k, 'saltato', 'NX', 'EX', String(FATTO_TTL))) !== 'OK' && (await kv('GET', k)) !== 'saltato') throw err(409, 'Questo messaggio è già partito');
    } else if ((await kv('GET', k)) === 'saltato') await kv('DEL', k);
  }

  /* ---------- messaggi programmati a mano ---------- */
  async function programmati() { return Object.values(hashObj(await kv('HGETALL', 'msg:prog'))).map(parse).filter(Boolean).sort((a, b) => String(a.quando).localeCompare(String(b.quando))); }
  async function programma(code, testo, quando) {
    testo = pulisci(testo);
    const q = Date.parse(quando);
    if (!testo) throw err(400, 'Scrivi il messaggio');
    if (!(q > now() + 60e3) || q > now() + 400 * DAY) throw err(400, 'Scegli un momento futuro (al massimo tra 400 giorni)');
    const p = { id: newId(), code, testo, quando: new Date(q).toISOString(), creato: new Date(now()).toISOString() };
    await kv('HSET', 'msg:prog', p.id, JSON.stringify(p));
    return p;
  }
  const annullaProgrammato = id => kv('HDEL', 'msg:prog', cleanId(id));

  /* ---------- invii automatici (dalla sincronizzazione) ---------- */
  // Idempotente: ogni invio prende prima il suo marcatore (SET NX), così due sincronizzazioni insieme non mandano due volte lo stesso messaggio.
  // Si ferma da solo dopo budgetMs e non lancia mai: la sincronizzazione delle date non deve mai aspettare né fallire per colpa dei messaggi.
  async function esegui(config, bks, site, { budgetMs = 6000 } = {}) {
    const out = { inviati: 0, saltati: 0, errori: 0 }, t0 = ms(), tardi = () => ms() - t0 > budgetMs;
    try {
      const [regRaw, progRaw] = await kvp([['GET', 'msg:auto'], ['HGETALL', 'msg:prog']]);
      const att = (parse(regRaw) || []).filter(r => r && r.attiva), prog = Object.values(hashObj(progRaw)).map(parse).filter(Boolean);
      if (!att.length && !prog.length) return out;
      const t = now(), conf = (bks || []).filter(b => b && b.stato === 'confermata'), cand = [];
      for (const r of att) for (const b of conf) { if (!vale(r, b)) continue; const q = quandoParte(r, b, t); if (q != null && q <= t) cand.push({ r, b, key: 'msg:fatto:' + r.id + ':' + b.code }); }
      if (cand.length) {
        const tpls = new Map((await templates()).map(x => [x.id, x])), fatti = await kvp(cand.map(c => ['GET', c.key]));
        for (let i = 0; i < cand.length && !tardi(); i++) {
          const { r, b, key } = cand[i], tpl = tpls.get(r.tpl);
          if (fatti[i]) continue;
          if (!tpl) { out.errori++; continue; }
          if ((await kv('SET', key, 'in_corso', 'NX', 'EX', '300')) !== 'OK') continue;      // un'altra sincronizzazione lo sta mandando
          try {
            const testi = await testiDaTemplate(tpl.testo, b, config, site);
            await daHost(b.code, testi.it, { auto: true, regola: r.id, traduzioni: testi, booking: b, site });
            await kv('SET', key, 'inviato', 'EX', String(FATTO_TTL));
            out.inviati++;
          } catch (e) { await kv('DEL', key).catch(() => {}); out.errori++; }
        }
      }
      for (const p of prog) {
        if (tardi()) break;
        if (!(Date.parse(p.quando) <= t)) continue;
        const b = conf.find(x => x.code === p.code), key = 'msg:fatto:p:' + p.id;
        if (!b) { await kv('HDEL', 'msg:prog', p.id); out.saltati++; continue; }      // prenotazione annullata o non più confermata: non si manda
        if ((await kv('SET', key, 'in_corso', 'NX', 'EX', '300')) !== 'OK') continue;
        try {
          await daHost(p.code, p.testo, { verso: await linguaDi(p.code), booking: b, site });
          await kvp([['SET', key, 'inviato', 'EX', String(FATTO_TTL)], ['HDEL', 'msg:prog', p.id]]);
          out.inviati++;
        } catch (e) { await kv('DEL', key).catch(() => {}); out.errori++; }
      }
    } catch (e) { out.errori++; }
    if (out.errori) await logE('Messaggi automatici: ' + out.errori + (out.errori === 1 ? ' invio non riuscito' : ' invii non riusciti') + ' (si riprova al prossimo giro)');
    return out;
  }
  // Conservazione: le conversazioni si cancellano `conservazione` giorni dopo la partenza (al massimo un controllo ogni 20 ore).
  // Senza l'elenco delle prenotazioni (KV non ha risposto) non si cancella nulla; una conversazione senza prenotazione si cancella
  // solo se è ferma da `conservazione` giorni (mai per un errore momentaneo).
  async function pulizia(bks) {
    try {
      if (!Array.isArray(bks) || !bks.length) return { cancellate: 0 };
      if ((await kv('SET', 'msg:pulizia', '1', 'NX', 'EX', '72000')) !== 'OK') return { cancellate: 0 };
      const imp = await impostazioni(), oggi = AV.todayRome(now()), by = new Map(bks.map(b => [String(b.code), b])), idx = hashObj(await kv('HGETALL', 'msg:idx'));
      let n = 0;
      for (const code of Object.keys(idx)) {
        const b = by.get(code), ultimo = (parse(idx[code]) || {}).ts || 0;
        if (b ? !(AV.isIso(b.a) && AV.addDays(b.a, imp.conservazione) < oggi) : now() - ultimo < imp.conservazione * DAY) continue;
        await kvp([['DEL', 'msg:' + code], ['DEL', 'msg:tr:' + code], ['DEL', 'msg:v:' + code], ['HDEL', 'msg:idx', code], ['HDEL', 'msg:nh', code], ['HDEL', 'msg:no', code], ['HDEL', 'msg:lo', code], ['HDEL', 'msg:lingua', code]]);
        n++;
      }
      for (const p of await programmati()) if (!by.has(p.code)) await kv('HDEL', 'msg:prog', p.id);
      return { cancellate: n };
    } catch (e) { return { cancellate: 0, errore: true }; }
  }

  return { versione, perOspite, daOspite, perHost, daHost, inbox, nonLettiHost, nonLettiOspite, linguaDi, impostazioni, salvaImpostazioni, templates, salvaTemplates, testiDaTemplate,
    regole, salvaRegole, salvaInsieme, prossimi, salta, programmati, programma, annullaProgrammato, esegui, pulizia };
}

module.exports = { makeMessaggi, riempi, VARIABILI, DEFAULT_TPL, MAX_TESTO, pulisci };
