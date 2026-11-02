// Webhook Stripe: conferma la prenotazione SOLO quando il pagamento è completato. È IDEMPOTENTE:
//  - la conferma è atomica rispetto agli hold (hold → conferma → rilascio hold): niente doppie conferme, niente notti scoperte;
//  - ogni passo successivo (scrittura sul foglio, mail al titolare, mail all'ospite) ha un claim (SET NX) e un marcatore "fatto":
//    se arriva due volte lo stesso evento NON si duplicano righe, mail o prenotazioni;
//  - se un passo fallisce risponde 500: Stripe riprova e vengono rieseguiti SOLO i passi mancanti;
//  - la scrittura sul foglio non blocca mai la conferma: se il foglio non risponde finisce in una coda che si svuota da sola.
// Il percorso di conferma vive in _pagato.js ed è lo stesso per tre ingressi: questo webhook, il controllo al ritorno dell'ospite sul sito
// (checkout_status) e la sincronizzazione periodica, che ricontrolla su Stripe le prenotazioni rimaste "in attesa" se il webhook non arriva.
// Se lo stesso account Stripe incassa anche l'imposta di soggiorno del check-in online, un check-in pagato con il numero di prenotazione si registra
// (api/_checkin.js), così l'area clienti mostra «Check-in completato»; i pagamenti del sito non sono check-in e viceversa.
// Va registrato su Stripe (Sviluppatori → Webhook) puntando a https://<tuo-dominio>/api/stripe-webhook per gli eventi
// "checkout.session.completed", "checkout.session.async_payment_succeeded" e (consigliati) "checkout.session.expired" e "checkout.session.async_payment_failed".
// Il "Signing secret" va in STRIPE_WEBHOOK_SECRET su Vercel.
// Check-in su un ALTRO account Stripe: se l'app Check-in incassa su un account diverso da quello del sito (come oggi: account diversi, e il sito
// anche in modalità di prova), i suoi pagamenti non arrivano mai al webhook del sito. Allora sull'account del Check-in si registra un
// secondo webhook verso questo stesso indirizzo, con il suo "Signing secret" in STRIPE_CHECKIN_WEBHOOK_SECRET su Vercel. Un evento firmato con
// quel segreto viene dall'account del Check-in e serve SOLO a registrare il check-in fatto: mai conferme, scadenze o email di prenotazioni del
// sito (un pagamento di un altro account non deve poter toccare una prenotazione). L'ultimo evento ricevuto da lì: stripe:ultimo:checkin.
const x = require('./x.js');
const P = require('./_pagato.js');
const buffer = req => new Promise((res, rej) => { const ch = []; req.on('data', d => ch.push(d)); req.on('end', () => res(Buffer.concat(ch))); req.on('error', rej); });

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CHECKIN_SECRET_KEY);
  let event, checkin = false;
  try {
    const buf = await buffer(req), sig = req.headers['stripe-signature'];
    try { event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET); }
    catch (e) {                                                        // non è dell'account del sito: forse dell'account del Check-in
      if (!process.env.STRIPE_CHECKIN_WEBHOOK_SECRET) throw e;
      event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_CHECKIN_WEBHOOK_SECRET); checkin = true;
    }
  } catch (e) { return res.status(400).send('Webhook Error: firma non valida'); }      // il dettaglio non serve a chi chiama
  try {
    const pagato = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
    if (checkin) { if (pagato) await x.checkin.registra(event.data.object); }      // account del Check-in: solo il check-in fatto
    else if (pagato) {
      await P.confermaPagamento(event.data.object, req);      // prenotazioni del sito (metadato code)
      await x.checkin.registra(event.data.object);           // check-in online (metadati dataCheckin e numeroPrenotazione), se incassa sullo stesso account
    } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') await P.sessioneScaduta(event.data.object);   // mai pagata: notti libere subito
    // ultimo evento ricevuto e valido: lo mostra Gestione → Sito → Sistema → Pagamenti ed email (se non cambia mai, il webhook non sta arrivando)
    await x.kv('SET', checkin ? 'stripe:ultimo:checkin' : 'stripe:ultimo', JSON.stringify({ ts: new Date().toISOString(), tipo: event.type })).catch(() => {});
  } catch (e) {
    console.error('stripe-webhook:', event.type, e.message);
    return res.status(500).json({ received: false, retry: true });    // Stripe riprova (con backoff) e si rieseguono solo i passi mancanti
  }
  res.json({ received: true });
};
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
