'use strict';
// La Columbera · accesso degli ospiti alla propria prenotazione (area clienti, Trentino Guest Card, annullo del pagamento).
// Il prefisso "_" evita che Vercel lo esponga come endpoint.
//
// Modello (docs/gdpr/sicurezza-accessi.md):
//  - il CODICE prenotazione è solo un identificativo leggibile: da solo NON dà accesso a nulla;
//  - l'accesso lo dà un TOKEN segreto casuale (128 bit, crypto.randomBytes) che arriva all'ospite nel link della mail di
//    conferma (nel frammento "#", che non viene mai inviato al server né ai siti esterni) o nella risposta del checkout;
//    sul server si conserva SOLO l'hash SHA-256 del token, con scadenza;
//  - in alternativa (prenotazioni Booking/Airbnb del foglio, prenotazioni create prima di questa versione, link perso):
//    codice + data di arrivo + email della prenotazione (l'email solo se la prenotazione ne ha una), solo per soggiorni non
//    ancora conclusi da più di 7 giorni. Riuscito questo controllo il server rilascia un token di sessione (4 ore);
//  - ogni tentativo passa da limiti di frequenza su KV (per IP e per codice) e ogni fallimento ha la STESSA risposta,
//    così non si può capire se un codice esiste.
// Nessun log con codici, token, email, date o IP.
const crypto = require('crypto');

const RL = {
  lookupIp: { max: 60, win: 600 },      // richieste di consultazione per IP: 60 ogni 10 minuti
  failIp: { max: 10, win: 900 },        // tentativi falliti per IP: 10 ogni 15 minuti
  failCode: { max: 10, win: 86400 },    // tentativi falliti senza token per lo stesso codice: 10 ogni 24 ore
  checkoutIp: { max: 10, win: 1800 },   // avvii di pagamento per IP: 10 ogni 30 minuti
  statusIp: { max: 60, win: 600 },      // controlli "com'è andato il pagamento" per IP: 60 ogni 10 minuti (la pagina ne fa pochi, a distanza di secondi)
  loginIp: { max: 10, win: 900 }        // login admin falliti per IP: 10 ogni 15 minuti
};
const SESSION_TTL_SEC = 4 * 3600;
const GRACE_DAYS = 30;                  // un token "lungo" (mail, checkout) vale fino a 30 giorni dopo il check-out
const MANUAL_AFTER_CHECKOUT_DAYS = 7;   // accesso senza token: solo fino a 7 giorni dopo il check-out
const ERR_NOT_FOUND = { err: 'Prenotazione non trovata. Controlla codice, data di arrivo ed email, oppure apri il link che hai ricevuto via email.' };

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const RE_TOKEN = /^[A-Za-z0-9_-]{22,64}$/;
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const normCode = c => String(c == null ? '' : c).trim().toUpperCase().slice(0, 40);
const normEmail = e => String(e == null ? '' : e).trim().toLowerCase().slice(0, 120);

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
  const tooMany = rule => ({ status: 429, retryAfter: rule.win, body: { err: 'Troppi tentativi. Riprova tra ' + Math.ceil(rule.win / 60) + ' minuti oppure apri il link che hai ricevuto via email.' } });

  // limite "per IP" che conta OGNI richiesta (checkout): null se va bene, altrimenti la risposta 429
  async function limitIp(req, scope, rule) { return (await hit(scope, ipKey(req), rule)) > rule.max ? tooMany(rule) : null; }
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
  // token "lungo" per la mail di conferma / il checkout: scade 30 giorni dopo il check-out
  const issueForBooking = (b, kind) => issue(b.code, ttlUntil(b.a), kind);
  async function verify(code, t) {
    if (!RE_TOKEN.test(String(t || ''))) return false;
    let v = null;
    try { v = JSON.parse(await kv('GET', 'tok:' + sha(t)) || 'null'); } catch (e) { v = null; }
    return !!(v && v.c === normCode(code));
  }

  /* ---------- autorizzazione di una richiesta dell'ospite ---------- */
  // input = { code, t } oppure { code, da, email }. findBooking(code) → prenotazione normalizzata (findByCode) o null.
  // Ritorna { ok:true, booking, token? } oppure { ok:false, status, body, retryAfter? }.
  async function authorize(req, input, findBooking) {
    const ip = ipKey(req);
    if ((await hit('lk', ip, RL.lookupIp)) > RL.lookupIp.max) return Object.assign({ ok: false }, tooMany(RL.lookupIp));
    if ((await peek('fi', ip)) >= RL.failIp.max) return Object.assign({ ok: false }, tooMany(RL.failIp));
    const code = normCode(input && input.code);
    const fail = async (perCode) => {
      await hit('fi', ip, RL.failIp);
      if (perCode && code) await hit('fc', sha('c|' + code).slice(0, 24), RL.failCode);
      return { ok: false, status: 404, body: ERR_NOT_FOUND };
    };
    if (!code || !/^[A-Z0-9-]{3,40}$/.test(code)) return fail(false);

    // 1) token
    if (input.t != null && input.t !== '') {
      if (!(await verify(code, input.t))) return fail(false);
      const booking = await findBooking(code);
      if (!booking) return fail(false);
      return { ok: true, booking };
    }
    // 2) senza token: codice + data di arrivo (+ email se la prenotazione ne ha una)
    if ((await peek('fc', sha('c|' + code).slice(0, 24))) >= RL.failCode.max) return Object.assign({ ok: false }, tooMany(RL.failCode));
    const da = String(input.da || '');
    if (!RE_ISO.test(da)) return fail(true);
    const booking = await findBooking(code);
    if (!booking || booking.da !== da) return fail(true);
    const em = normEmail(booking.email);
    if (em && !crypto.timingSafeEqual(Buffer.from(sha(em)), Buffer.from(sha(normEmail(input.email))))) return fail(true);
    const fine = RE_ISO.test(String(booking.a || '')) ? Date.parse(booking.a + 'T00:00:00Z') + MANUAL_AFTER_CHECKOUT_DAYS * 864e5 : 0;
    if (!(fine > now())) return fail(true);
    const token = await issue(code, SESSION_TTL_SEC, 'sess');
    return { ok: true, booking, token };
  }

  return { authorize, issue, issueForBooking, verify, limitIp, blockedIp, countFail, ipKey, RL };
}

// Email mascherata per le risposte all'ospite (es. "ma***@esempio.it"): mai l'indirizzo completo.
function maskEmail(e) {
  const s = String(e || ''), i = s.indexOf('@');
  if (i < 1) return '';
  return s.slice(0, Math.min(2, i)) + '***' + s.slice(i);
}

module.exports = { makeAccess, maskEmail, ipKey, RL, ERR_NOT_FOUND, SESSION_TTL_SEC };
