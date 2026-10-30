'use strict';
// Conferma di una prenotazione PAGATA. Un solo percorso, tre ingressi:
//  1) il webhook di Stripe (checkout.session.completed / async_payment_succeeded): il caso normale;
//  2) il controllo "checkout_status", che parte quando l'ospite torna sul sito dopo il pagamento;
//  3) la sincronizzazione periodica (riconciliaInAttesa), che ricontrolla su Stripe le prenotazioni rimaste "in attesa".
// Il 2 e il 3 sono la rete di sicurezza se il webhook non arriva (non registrato, segreto sbagliato, Stripe in ritardo): senza,
// un pagamento riuscito resterebbe "in attesa" e le notti si riaprirebbero dopo 35 minuti. Il percorso è lo stesso in tutti i casi e
// ogni passo è IDEMPOTENTE (marcatore "fatto" + lock su KV): più ingressi sulla stessa prenotazione non duplicano righe del foglio né email.
// Il prefisso "_" evita che Vercel lo esponga come endpoint. Va richiesto solo dentro le funzioni (x.js lo carica a richiesta, per il ciclo con _mail.js).
const x = require('./x.js');
const { rangeDays } = require('./_avail.js');
const { guestMail, ownerMail } = require('./_mail.js');
const { OWNER_EMAIL, REPLY_TO } = x;                                  // stessi indirizzi di x.js (variabili OWNER_EMAIL e REPLY_TO su Vercel)
const E = x.engine, kv = x.kv;
const K = (code, step) => ({ done: 'done:' + code + ':' + step, lock: 'lock:' + code + ':' + step });
const MIN = 60e3, DAY = 864e5;

// Esegue un passo una sola volta. Se un'altra consegna lo sta eseguendo → errore → chi chiama riprova più tardi.
// Doppio controllo: "fatto" va riletto DOPO aver preso il lock. Senza, una consegna che ha letto "non fatto" mentre l'altra stava
// finendo (marcatore scritto, lock già rilasciato) trova il lock libero e rieseguirebbe il passo → mail duplicata.
// Il marcatore viene scritto PRIMA di rilasciare il lock: chi prende il lock dopo vede sempre "fatto".
async function step(code, name, fn) {
  const k = K(code, name);
  if (await kv('GET', k.done)) return;
  if ((await kv('SET', k.lock, '1', 'NX', 'EX', '120')) !== 'OK') throw new Error('passo "' + name + '" in corso su un\'altra consegna');
  try {
    if (await kv('GET', k.done)) return;
    if ((await fn()) === false) throw new Error('passo "' + name + '" fallito');
    await kv('SET', k.done, new Date().toISOString());
  } finally { await kv('DEL', k.lock).catch(() => {}); }
}

// Email: true = inviata, false = errore (si riprova), null = invio non configurato (GMAIL_USER / GMAIL_APP_PASSWORD mancanti).
// Con null il passo non può riuscire mai: lo si chiude per non ripeterlo all'infinito, MA si lascia traccia nel registro eventi,
// così Gestione → Sito → Sistema mostra che le email non partono (altrimenti nessuno se ne accorgerebbe).
async function mail(code, cosa, to, subject, html, opts) {
  const r = await x.sendMail(to, subject, html, opts);
  if (r === null) await E.log({ lvl: 'ERR', msg: 'EMAIL NON CONFIGURATA: ' + cosa + ' (' + code + ') non inviata. Mancano GMAIL_USER / GMAIL_APP_PASSWORD su Vercel.' }).catch(() => {});
  return r !== false;
}

// Il pagamento di una sessione Stripe è arrivato: conferma la prenotazione, scrive sul foglio, avvisa titolare e ospite.
// `s` è la sessione Stripe (dall'evento del webhook oppure letta con checkout.sessions.retrieve). Ritorna { code, stato } o null se non è una prenotazione del sito.
async function confermaPagamento(s, req) {
  const code = s && s.metadata && s.metadata.code;
  if (!code) return null;                                              // sessione di un altro sistema (es. il check-in): non è una prenotazione del sito
  if (s.payment_status && s.payment_status !== 'paid') return null;    // "completed" ma non ancora pagato (metodi asincroni): si attende async_payment_succeeded
  const config = await x.cfg(req), site = process.env.SITE_URL || 'https://' + req.headers.host;
  const r = await E.confirmBooking(config, code, { payment: s.payment_intent || s.id });
  if (!r.booking) {                                                    // pagamento senza prenotazione: non si conferma alla cieca, si avvisa il titolare
    await step(code, 'mail_orfano', () => mail(code, 'avviso di pagamento senza prenotazione', OWNER_EMAIL, '⚠️ Pagamento Stripe senza prenotazione · ' + code,
      '<p>È arrivato un pagamento per il codice <b>' + code + '</b> (sessione ' + s.id + ', ' + ((s.amount_total || 0) / 100).toFixed(2) + ' €) ma non esiste una prenotazione con questo codice.</p><p>Verifica su Stripe e contatta l\'ospite (' + (s.customer_details && s.customer_details.email || s.customer_email || 'email sconosciuta') + ').</p>'));
    return { code, stato: 'sconosciuta' };
  }
  const b = r.booking;
  await step(code, 'sheet', () => x.sheetUpsertBooking(b).then(() => true));   // upsert idempotente (o coda di ripresa)
  if (!r.ok) {                                                        // pagamento ricevuto ma la prenotazione non si conferma da sola: serve una decisione del titolare
    const by = (r.conflict && r.conflict.by || []).join(', '), chi = b.id + ', ' + b.da + ' → ' + b.a + ', ' + b.nome + ', ' + b.email;
    const annullata = b.stato === 'annullata', nonVerificabile = /NON_VERIFICABILE/.test(by);
    await step(code, annullata ? 'mail_annullata' : 'mail_conflitto', () => annullata
      ? mail(code, 'avviso di pagamento su prenotazione annullata', OWNER_EMAIL, '⚠️ Pagamento ricevuto su una prenotazione annullata · ' + code,
        '<p>È arrivato il pagamento della prenotazione <b>' + code + '</b> (' + chi + '), che però risulta <b>annullata</b>. Non è stata riattivata né comunicata all\'ospite.</p><p>Se l\'hai già rimborsata su Stripe puoi ignorare questo avviso; altrimenti rimborsa il pagamento oppure, in Gestione → Prenotazioni, rimetti lo stato su «confermata».</p>')
      : mail(code, 'avviso di date in conflitto', OWNER_EMAIL, '⚠️ Pagamento ricevuto ma date in conflitto · ' + code,
        '<p>La prenotazione <b>' + code + '</b> (' + chi + ') è stata pagata ma ' + (nonVerificabile
          ? 'in questo momento non è stato possibile verificare che le notti siano ancora libere (calendari non aggiornati).'
          : 'le notti risultano occupate da un\'altra fonte (' + by + ').') + '</p><p>NON è stata confermata né comunicata all\'ospite. ' + (nonVerificabile
          ? 'Sincronizza da Gestione e controlla il calendario: se le date sono libere, in Gestione → Prenotazioni imposta lo stato su «confermata» e all\'ospite parte la conferma.'
          : 'Riassegna le date o rimborsa il pagamento su Stripe.') + '</p>'));
    return { code, stato: b.stato };
  }
  const om = ownerMail(b, site);
  await step(code, 'mail_titolare', () => mail(code, 'email al titolare', OWNER_EMAIL, om.subject, om.html, { text: om.text, replyTo: b.email }));
  if (/.+@.+\..+/.test(b.email || '')) {
    // il link della mail porta un token segreto (nel frammento "#"): il codice da solo non apre l'area clienti.
    // Il token si crea dentro il passo: se l'invio fallisce e si riprova, il nuovo invio ha un nuovo token (quello vecchio scade da solo).
    await step(code, 'mail_ospite', async () => {
      const tk = await x.access.issueForBooking(b, 'mail');
      const gm = guestMail(b, site, tk);
      return mail(code, 'email di conferma all\'ospite', b.email, gm.subject, gm.html, { text: gm.text, replyTo: REPLY_TO });
    });
  }
  return { code, stato: 'confermata' };
}

// Sessione scaduta senza pagamento: libera subito le notti.
async function sessioneScaduta(s) {
  const code = s && s.metadata && s.metadata.code;
  if (!code) return;
  const b = await E.bkGet(code);
  if (b && b.stato === 'in_attesa') await E.holdRelease(b.id, rangeDays(b.da, b.a), code);
}

const stripeClient = () => require('stripe')(process.env.STRIPE_SECRET_KEY);

// Chiede a Stripe com'è andata la sessione di una prenotazione "in attesa" e, se è stata pagata, la conferma (stesso percorso del webhook).
// Ritorna { recuperata: true } solo se QUESTA chiamata l'ha confermata; il webhook arrivato nel frattempo non conta come recupero.
// sessione = stato della sessione su Stripe (open = pagamento non ancora completato: lo dice all'ospite la pagina di ritorno).
async function riconcilia(b, req) {
  if (!process.env.STRIPE_SECRET_KEY || !b || !b.sessione || b.stato !== 'in_attesa') return { recuperata: false };
  const s = await stripeClient().checkout.sessions.retrieve(b.sessione);
  if (s.payment_status === 'paid') {
    await confermaPagamento(s, req);
    const dopo = await E.bkGet(b.code);
    return { recuperata: !!(dopo && dopo.stato !== 'in_attesa'), stato: dopo && dopo.stato };
  }
  if (s.status === 'expired') {                                        // mai pagata e ormai chiusa: libera le notti e smette di controllarla
    await sessioneScaduta(s);
    const cur = await E.bkGet(b.code);
    if (cur && cur.stato === 'in_attesa') await E.bkPut(Object.assign(cur, { scaduta: true }));
  }
  return { recuperata: false, sessione: s.status };
}

// Controllo periodico (sincronizzazione): le prenotazioni "in attesa" con una sessione Stripe, più vecchie di 3 minuti (al webhook si lascia il tempo
// di arrivare) e non più vecchie di 3 giorni. Ogni errore resta confinato: la sincronizzazione non si ferma mai per colpa di Stripe.
async function riconciliaInAttesa(req, { max = 8 } = {}) {
  const out = { controllate: 0, recuperate: 0, errori: [] };
  if (!process.env.STRIPE_SECRET_KEY) return out;
  const t = Date.now();
  const da = (await E.bkAll()).filter(b => b.stato === 'in_attesa' && b.sessione && !b.scaduta && t - Date.parse(b.creato) > 3 * MIN && t - Date.parse(b.creato) < 3 * DAY)
    .sort((a, c) => String(a.creato).localeCompare(String(c.creato))).slice(0, max);
  for (const b of da) {
    out.controllate++;
    try {
      const r = await riconcilia(b, req);
      if (r.recuperata) {
        out.recuperate++;
        await E.log({ lvl: 'WARN', msg: 'Prenotazione ' + b.code + ' confermata dal controllo su Stripe: il webhook non era arrivato. Controlla che il webhook sia registrato (Gestione → Sito → Sistema → Pagamenti ed email).' }).catch(() => {});
        await kv('SET', 'stripe:recuperata', JSON.stringify({ ts: new Date(t).toISOString(), code: b.code })).catch(() => {});
        await kv('INCR', 'stripe:recuperate').catch(() => {});
      }
    } catch (e) { out.errori.push(b.code + ': ' + String(e && (e.code || e.message) || 'errore').slice(0, 80)); }
  }
  if (out.errori.length) await E.log({ lvl: 'ERR', msg: 'Controllo pagamenti su Stripe non riuscito: ' + out.errori.join(' | ') }).catch(() => {});
  return out;
}

// ---------- salute dei pagamenti (Gestione → Sito → Sistema → Pagamenti ed email; anche il semaforo di Oggi) ----------
// Mai valori segreti: solo "c'è / non c'è", e l'email del titolare mascherata. Ogni controllo è a sé: se uno fallisce gli altri restano.
const mask = e => { const s = String(e || ''), i = s.indexOf('@'); return i < 1 ? '' : s.slice(0, Math.min(2, i)) + '***' + s.slice(i); };
const EVENTI_ATTESI = ['checkout.session.completed', 'checkout.session.expired'];
async function salute(req, config) {
  const env = process.env, t = Date.now();
  const out = {
    ambiente: { stripe: !!env.STRIPE_SECRET_KEY, webhook: !!env.STRIPE_WEBHOOK_SECRET, email: !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD), foglio: !!(env.SHEET_WEBAPP_URL && env.SHEET_SECRET), sync: !!env.SYNC_SECRET, destinatario: mask(OWNER_EMAIL), destinatarioImpostato: !!env.OWNER_EMAIL, nelSito: x.stripePk().stato },      // nelSito: chiave pubblicabile per pagare nella pagina del sito (ok | manca | formato | tipo)
    stripe: { collegato: null, errore: '', webhook: null, consegneFallite: null },
    ultimoWebhook: null, recuperate: { n: 0, ultima: null }, coda: null, incompleti: [], inAttesaVecchie: 0, daVerificare: 0
  };
  try { out.ultimoWebhook = JSON.parse((await kv('GET', 'stripe:ultimo')) || 'null'); } catch (e) { /* assente */ }
  try { out.recuperate = { n: +(await kv('GET', 'stripe:recuperate')) || 0, ultima: JSON.parse((await kv('GET', 'stripe:recuperata')) || 'null') }; } catch (e) { /* assente */ }
  try { const st = await E.syncState(config, {}); out.coda = { inAttesa: (st.outbox && st.outbox.pending) || 0, piuVecchia: st.outbox && st.outbox.oldest || null }; } catch (e) { /* assente */ }
  // prenotazioni confermate negli ultimi 14 giorni con un passo non completato (foglio, email al titolare, email all'ospite): è il "non mi è arrivata"
  try {
    const bks = await E.bkAll(), recenti = bks.filter(b => b.stato === 'confermata' && t - Date.parse(b.confermata_il || b.creato) < 14 * DAY);
    const passi = b => ['sheet', 'mail_titolare'].concat(/.+@.+\..+/.test(b.email || '') ? ['mail_ospite'] : []).map(n => [b, n]);
    const coppie = recenti.flatMap(passi), vals = coppie.length ? await x.kvp(coppie.map(([b, n]) => ['GET', 'done:' + b.code + ':' + n])) : [];
    const mancanti = {};
    coppie.forEach(([b, n], i) => { if (!vals[i]) (mancanti[b.code] = mancanti[b.code] || []).push(n); });
    out.incompleti = Object.entries(mancanti).slice(0, 10).map(([code, m]) => ({ code, mancano: m }));
    out.inAttesaVecchie = bks.filter(b => b.stato === 'in_attesa' && b.sessione && !b.scaduta && t - Date.parse(b.creato) > 40 * MIN && t - Date.parse(b.creato) < 3 * DAY).length;
    out.daVerificare = bks.filter(b => b.stato === 'da_verificare').length;      // pagate ma ferme in attesa di una decisione del titolare
  } catch (e) { /* assente */ }
  if (env.STRIPE_SECRET_KEY) {
    const stripe = stripeClient(), codice = e => String(e && (e.code || e.type || e.message) || 'errore').slice(0, 60);
    try {                                                                // il webhook è registrato, punta a questo sito ed ascolta gli eventi giusti?
      const eps = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter(e => /\/api\/stripe-webhook\/?$/.test(e.url));
      out.stripe.collegato = true;
      out.stripe.webhook = eps.map(e => { const ev = e.enabled_events || [], tutti = ev.includes('*'); return { url: e.url, stato: e.status, mancanti: tutti ? [] : EVENTI_ATTESI.filter(x2 => !ev.includes(x2)) }; });
    } catch (e) { out.stripe.collegato = e && (e.type === 'StripeAuthenticationError' || e.code === 'api_key_invalid') ? false : null; out.stripe.errore = codice(e); }
    try {                                                                // Stripe dice che qualche consegna al webhook è fallita (o è ancora in nuovo tentativo)?
      const ev = await stripe.events.list({ type: 'checkout.session.completed', delivery_success: false, limit: 20, created: { gte: Math.floor((t - 7 * DAY) / 1000) } });
      out.stripe.consegneFallite = ev.data.length;
    } catch (e) { if (!out.stripe.errore) out.stripe.errore = codice(e); }
  }
  return out;
}

module.exports = { step, confermaPagamento, sessioneScaduta, riconcilia, riconciliaInAttesa, stripeClient, salute, mask, OWNER_EMAIL };
