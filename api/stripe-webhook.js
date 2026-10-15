// Webhook Stripe: conferma la prenotazione SOLO quando il pagamento è completato. È IDEMPOTENTE:
//  - la conferma è atomica rispetto agli hold (hold → conferma → rilascio hold): niente doppie conferme, niente notti scoperte;
//  - ogni passo successivo (scrittura sul foglio, mail al titolare, mail all'ospite) ha un claim (SET NX) e un marcatore "fatto":
//    se arriva due volte lo stesso evento NON si duplicano righe, mail o prenotazioni;
//  - se un passo fallisce risponde 500: Stripe riprova e vengono rieseguiti SOLO i passi mancanti;
//  - la scrittura sul foglio non blocca mai la conferma: se il foglio non risponde finisce in una coda che si svuota da sola.
// Va registrato su Stripe (Sviluppatori → Webhook) puntando a https://<tuo-dominio>/api/stripe-webhook per gli eventi
// "checkout.session.completed", "checkout.session.async_payment_succeeded" e (consigliato) "checkout.session.expired".
// Il "Signing secret" va in STRIPE_WEBHOOK_SECRET su Vercel.
const x = require('./x.js');
const { rangeDays } = require('./_avail.js');
const { guestMail, ownerMail } = require('./_mail.js');
const buffer = req => new Promise((res, rej) => { const ch = []; req.on('data', d => ch.push(d)); req.on('end', () => res(Buffer.concat(ch))); req.on('error', rej); });
const REPLY_TO = process.env.REPLY_TO || 'info@lacolumbera.it';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'patrick.comper@yahoo.com';
const E = x.engine, kv = x.kv;
const K = (code, step) => ({ done: 'done:' + code + ':' + step, lock: 'lock:' + code + ':' + step });

// Esegue un passo una sola volta. Se un'altra consegna dello stesso evento lo sta eseguendo → errore → Stripe riprova più tardi.
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

async function onPaid(event, req) {
  const s = event.data.object, code = s.metadata && s.metadata.code;
  if (!code) return;
  if (s.payment_status && s.payment_status !== 'paid') return;        // "completed" ma non ancora pagato (metodi asincroni): si attende async_payment_succeeded
  const config = await x.cfg(req), site = process.env.SITE_URL || 'https://' + req.headers.host;
  const r = await E.confirmBooking(config, code, { payment: s.payment_intent || s.id });
  if (!r.booking) {                                                   // pagamento senza prenotazione: non si conferma alla cieca, si avvisa il titolare
    await step(code, 'mail_orfano', () => x.sendMail(OWNER_EMAIL, '⚠️ Pagamento Stripe senza prenotazione · ' + code,
      '<p>È arrivato un pagamento per il codice <b>' + code + '</b> (sessione ' + s.id + ', ' + ((s.amount_total || 0) / 100).toFixed(2) + ' €) ma non esiste una prenotazione con questo codice.</p><p>Verifica su Stripe e contatta l\'ospite (' + (s.customer_details && s.customer_details.email || s.customer_email || 'email sconosciuta') + ').</p>').then(v => v !== false));
    return;
  }
  const b = r.booking;
  await step(code, 'sheet', () => x.sheetUpsertBooking(b).then(() => true));   // upsert idempotente (o coda di ripresa)
  if (!r.ok) {                                                        // pagamento ricevuto ma le date non sono più nostre: serve un intervento umano
    await step(code, 'mail_conflitto', () => x.sendMail(OWNER_EMAIL, '⚠️ Pagamento ricevuto ma date in conflitto · ' + code,
      '<p>La prenotazione <b>' + code + '</b> (' + b.id + ', ' + b.da + ' → ' + b.a + ', ' + b.nome + ', ' + b.email + ') è stata pagata ma le notti risultano occupate da un\'altra fonte (' + (r.conflict && (r.conflict.by || []).join(', ')) + ').</p><p>NON è stata confermata né comunicata all\'ospite. Riassegna le date o rimborsa il pagamento su Stripe.</p>').then(v => v !== false));
    return;
  }
  const om = ownerMail(b, site);
  await step(code, 'mail_titolare', () => x.sendMail(OWNER_EMAIL, om.subject, om.html, { text: om.text, replyTo: b.email }).then(v => v !== false));
  if (/.+@.+\..+/.test(b.email || '')) {
    const gm = guestMail(b, site);
    await step(code, 'mail_ospite', () => x.sendMail(b.email, gm.subject, gm.html, { text: gm.text, replyTo: REPLY_TO }).then(v => v !== false));
  }
}

async function onExpired(event) {                                      // sessione scaduta senza pagamento: libera subito le notti
  const s = event.data.object, code = s.metadata && s.metadata.code;
  if (!code) return;
  const b = await E.bkGet(code);
  if (b && b.stato === 'in_attesa') await E.holdRelease(b.id, rangeDays(b.da, b.a), code);
}

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) { return res.status(400).send('Webhook Error: ' + e.message); }
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await onPaid(event, req);
    else if (event.type === 'checkout.session.expired') await onExpired(event);
  } catch (e) {
    console.error('stripe-webhook:', event.type, e.message);
    return res.status(500).json({ received: false, retry: true });    // Stripe riprova (con backoff) e si rieseguono solo i passi mancanti
  }
  res.json({ received: true });
};
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
