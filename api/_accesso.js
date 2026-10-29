'use strict';
// La Columbera · accesso degli ospiti alla propria prenotazione (area clienti, Trentino Guest Card, annullo del pagamento).
// Il prefisso "_" evita che Vercel lo esponga come endpoint.
//
// Modello (docs/gdpr/sicurezza-accessi.md):
//  - basta il CODICE della prenotazione, scelta del titolare: niente data di arrivo né email.
//    · prenotazioni del sito: il codice è lungo e casuale (13 caratteri, ~65 bit: newBookingCode), quindi non si indovina;
//    · prenotazioni Booking/Airbnb/manuali: il numero di prenotazione del portale, letto dal foglio (registro). È più corto:
//      lo proteggono i limiti di frequenza qui sotto e la finestra di validità più breve (7 giorni dopo il check-out);
//  - riuscito il controllo il server rilascia un TOKEN di sessione (4 ore) per le richieste successive;
//  - il link della mail di conferma porta un TOKEN segreto (128 bit) nel frammento "#", che non viene mai inviato al server
//    né ai siti esterni: apre l'area senza digitare nulla. Sul server si conserva SOLO l'hash SHA-256 di ogni token, con scadenza;
//  - ogni tentativo passa da limiti di frequenza su KV (per IP e, per i codici sbagliati, anche in totale) e ogni fallimento
//    ha la STESSA risposta, così non si può capire se un codice esiste.
// Nessun log con codici, token, email, date o IP.
const crypto = require('crypto');

const RL = {
  lookupIp: { max: 60, win: 600 },      // richieste di consultazione per IP: 60 ogni 10 minuti
  failIp: { max: 10, win: 900 },        // tentativi falliti per IP: 10 ogni 15 minuti
  failAll: { max: 300, win: 3600 },     // codici sbagliati da TUTTI gli IP: 300 l'ora (tentativi distribuiti su molti indirizzi). Chi ha già un token entra comunque
  checkoutIp: { max: 10, win: 1800 },   // avvii di pagamento per IP: 10 ogni 30 minuti
  statusIp: { max: 60, win: 600 },      // controlli "com'è andato il pagamento" per IP: 60 ogni 10 minuti (la pagina ne fa pochi, a distanza di secondi)
  loginIp: { max: 10, win: 900 }        // login admin falliti per IP: 10 ogni 15 minuti
};
const SESSION_TTL_SEC = 4 * 3600;
// L'area clienti resta aperta fino a 7 giorni dopo il check-out, per tutti (richiesta del titolare, 29/10/2026: prima il sito arrivava a 30):
// poi le conversazioni si cancellano e le righe del foglio pure. Vale per il codice e per i link già mandati (si controlla la data a ogni accesso).
const GRACE_DAYS = 30;                  // un token "lungo" (mail, checkout) resta su KV fino a 30 giorni dopo il check-out, ma apre l'area solo fino al 7°:
                                        // dopo serve soltanto a dire a chi apre il link che il soggiorno è finito (invece di «non trovata»)
const CODE_DAYS_SITO = 7;               // accesso con il codice del sito: fino a 7 giorni dopo il check-out
const CODE_DAYS_PORTALE = 7;            // accesso con il numero Booking/Airbnb (e delle prenotazioni manuali): fino a 7 giorni dopo il check-out
const ERR_NOT_FOUND = { err: 'Prenotazione non trovata. Controlla il codice: è quello della mail di conferma oppure il numero di prenotazione di Booking.com o Airbnb.' };
// a chi apre un link valido (il token prova chi è) dopo la chiusura si dice perché; con il solo codice resta «non trovata» (non si rivela nulla)
const ERR_CHIUSA = { err: 'Il soggiorno è finito: l\'area clienti resta aperta fino a 7 giorni dopo la partenza. Per qualsiasi necessità scrivici a lacolumbera@gmail.com.', code: 'CHIUSA' };

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const RE_TOKEN = /^[A-Za-z0-9_-]{22,64}$/;
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const normCode = c => String(c == null ? '' : c).trim().toUpperCase().slice(0, 40);

// Codice delle prenotazioni del sito: 13 caratteri dall'alfabeto di Crockford (cifre e lettere maiuscole senza I, L, O, U, che si confondono
// con 1 e 0 o tra loro). 13 × 5 bit ≈ 65 bit casuali: è insieme il riferimento e la chiave dell'area clienti. Un byte & 31 è uniforme (256 = 8 × 32).
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', CODE_LEN = 13;
// Almeno una lettera diversa da E: un codice di sole cifre (o cifre ed E, "12E45…") nel foglio Google diventerebbe un numero e perderebbe cifre.
// Succede circa una volta su un milione: si estrae di nuovo.
function newBookingCode() {
  for (;;) { const c = Array.from(crypto.randomBytes(CODE_LEN), b => CODE_ALPHABET[b & 31]).join(''); if (/[A-DF-HJKMNP-TV-Z]/.test(c)) return c; }
}
// Come lo scrive l'ospite → codici da cercare (al massimo 3, nell'ordine): senza spazi, punti e trattini (Booking mostra "6877.180.932",
// la mail mostra il codice a gruppi), poi così com'è (i codici manuali del foglio possono avere un trattino), poi, per un codice del sito,
// con O→0 e I/L→1 (l'alfabeto non ha I, L, O: chi le scrive intendeva 1 e 0).
function codeCandidates(input) {
  const raw = String(input == null ? '' : input).trim().toUpperCase().slice(0, 60), out = [];
  const add = c => { if (/^[A-Z0-9-]{3,40}$/.test(c) && !out.includes(c)) out.push(c); };
  const al = raw.replace(/[\s.\-_/]+/g, '');
  add(al);
  add(raw.replace(/\s+/g, ''));
  if (al.length === CODE_LEN) add(al.replace(/O/g, '0').replace(/[IL]/g, '1'));
  return out.slice(0, 3);
}

// IP del client (Vercel: x-real-ip / x-forwarded-for). Si usa solo come chiave dei contatori, già "hashato": l'IP in chiaro non va su KV.
function ipKey(req) {
  const h = (req && req.headers) || {};
  const ip = String(h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || (req && req.socket && req.socket.remoteAddress) || 'sconosciuto').trim();
  return sha('ip|' + ip).slice(0, 24);
}

function makeAccess({ kv, kvp, now }) {
  now = now || (() => Date.now());
  const pipe = kvp || (cmds => Promise.all(cmds.map(c => kv(...c))));

  // Contatori a finestra fissa: SET NX EX (crea con scadenza) + INCR (non tocca la scadenza).
  // Se KV non risponde i limiti non bloccano (fail-open, con log): la prenotazione stessa richiede comunque KV.
  async function hit(scope, key, rule) {
    const k = 'rl:' + scope + ':' + key;
    try { const r = await pipe([['SET', k, '0', 'EX', String(rule.win), 'NX'], ['INCR', k]]); return +r[1] || 0; }
    catch (e) { console.warn('rate-limit non disponibile (' + scope + ')'); return 0; }
  }
  async function peek(scope, key) {
    try { return +(await kv('GET', 'rl:' + scope + ':' + key)) || 0; } catch (e) { return 0; }
  }
  const tooMany = rule => ({ status: 429, retryAfter: rule.win, body: { err: 'Troppi tentativi. Riprova tra ' + Math.ceil(rule.win / 60) + ' minuti (se hai prenotato sul sito puoi anche aprire il link della mail di conferma).' } });

  // limite "per IP" che conta OGNI richiesta (checkout): null se va bene, altrimenti la risposta 429
  async function limitIp(req, scope, rule) { return (await hit(scope, ipKey(req), rule)) > rule.max ? tooMany(rule) : null; }
  // limite su una chiave qualsiasi (es. i messaggi di una prenotazione): conta ogni richiesta; msg = testo della risposta 429
  async function limitKey(scope, key, rule, msg) {
    if ((await hit(scope, sha('k|' + key).slice(0, 24), rule)) <= rule.max) return null;
    const r = tooMany(rule); if (msg) r.body = { err: msg }; return r;
  }
  // limite che conta solo i FALLIMENTI (login): blockedIp prima di provare, countFail dopo un fallimento
  async function blockedIp(req, scope, rule) { return (await peek(scope, ipKey(req))) >= rule.max ? tooMany(rule) : null; }
  const countFail = (req, scope, rule) => hit(scope, ipKey(req), rule);

  /* ---------- token ---------- */
  function ttlUntil(checkoutIso) {
    const t = RE_ISO.test(String(checkoutIso || '')) ? Date.parse(checkoutIso + 'T00:00:00Z') + GRACE_DAYS * 864e5 : now() + 2 * 864e5;
    return Math.min(400 * 86400, Math.max(86400, Math.ceil((t - now()) / 1000)));
  }
  async function issue(code, ttlSec, kind) {
    const t = crypto.randomBytes(16).toString('base64url');           // 128 bit
    await kv('SET', 'tok:' + sha(t), JSON.stringify({ c: normCode(code), k: kind || 'acc' }), 'EX', String(Math.max(60, Math.floor(ttlSec))));
    return t;
  }
  // token "lungo" per la mail di conferma / il checkout: resta 30 giorni dopo il check-out (l'area si chiude al 7°, vedi aperta)
  const issueForBooking = (b, kind) => issue(b.code, ttlUntil(b.a), kind);
  // l'area è ancora aperta per questa prenotazione? (fino a N giorni dopo il check-out, alla mezzanotte UTC)
  const aperta = b => { const g = b.fonte === 'sito' ? CODE_DAYS_SITO : CODE_DAYS_PORTALE, fine = RE_ISO.test(String(b.a || '')) ? Date.parse(b.a + 'T00:00:00Z') + g * 864e5 : 0; return fine > now(); };
  async function verify(code, t) {
    if (!RE_TOKEN.test(String(t || ''))) return false;
    let v = null;
    try { v = JSON.parse(await kv('GET', 'tok:' + sha(t)) || 'null'); } catch (e) { v = null; }
    return !!(v && v.c === normCode(code));
  }

  /* ---------- autorizzazione di una richiesta dell'ospite ---------- */
  // input = { code, t } (link della mail, checkout, sessione già aperta) oppure { code } da solo (campi in più, es. data o email
  // dalle pagine di prima, si ignorano). findBooking(code, { live }) → prenotazione normalizzata (findByCode) o null; live = si può
  // chiedere al foglio in diretta (una volta sola per richiesta: un codice sbagliato non moltiplica le chiamate allo script).
  // Ritorna { ok:true, booking, token? } oppure { ok:false, status, body, retryAfter? }. Il codice "ufficiale" è booking.code.
  async function authorize(req, input, findBooking) {
    const ip = ipKey(req);
    if ((await hit('lk', ip, RL.lookupIp)) > RL.lookupIp.max) return Object.assign({ ok: false }, tooMany(RL.lookupIp));
    if ((await peek('fi', ip)) >= RL.failIp.max) return Object.assign({ ok: false }, tooMany(RL.failIp));
    const fail = async (codice) => {
      await hit('fi', ip, RL.failIp);
      if (codice) await hit('fa', 'tutti', RL.failAll);
      return { ok: false, status: 404, body: ERR_NOT_FOUND };
    };
    const code = normCode(input && input.code), list = typeof (input && input.code) === 'string' || typeof (input && input.code) === 'number' ? codeCandidates(input.code) : [];
    if (!list.length) return fail(false);

    // 1) token: vale solo per il codice per cui è stato rilasciato
    if (input.t != null && input.t !== '') {
      if (!(await verify(code, input.t))) return fail(false);
      const booking = await findBooking(code, { live: true });
      if (!booking) return fail(false);
      if (!aperta(booking)) return { ok: false, status: 410, body: ERR_CHIUSA };      // link valido ma soggiorno chiuso: non conta come tentativo sbagliato
      return { ok: true, booking };
    }
    // 2) il codice da solo
    if ((await peek('fa', 'tutti')) >= RL.failAll.max) return Object.assign({ ok: false }, tooMany(RL.failAll));
    let booking = null;
    for (let i = 0; i < list.length && !booking; i++) booking = await findBooking(list[i], { live: false });   // KV e istantanea del foglio: veloci
    if (!booking) booking = await findBooking(list[0], { live: true });                                    // una sola domanda in diretta allo script del foglio
    if (!booking) return fail(true);
    if (!aperta(booking)) return fail(true);
    const token = await issue(booking.code, SESSION_TTL_SEC, 'sess');
    return { ok: true, booking, token };
  }

  return { authorize, issue, issueForBooking, verify, limitIp, limitKey, blockedIp, countFail, ipKey, RL };
}

// Email mascherata per le risposte all'ospite (es. "ma***@esempio.it"): mai l'indirizzo completo.
function maskEmail(e) {
  const s = String(e || ''), i = s.indexOf('@');
  if (i < 1) return '';
  return s.slice(0, Math.min(2, i)) + '***' + s.slice(i);
}

module.exports = { makeAccess, maskEmail, ipKey, RL, ERR_NOT_FOUND, ERR_CHIUSA, SESSION_TTL_SEC, newBookingCode, codeCandidates, CODE_ALPHABET, CODE_LEN, CODE_DAYS_SITO, CODE_DAYS_PORTALE };
