// Webhook Stripe: conferma la prenotazione SOLO quando il pagamento è completato. È IDEMPOTENTE:
//  - la conferma è atomica rispetto agli hold (hold → conferma → rilascio hold): niente doppie conferme, niente notti scoperte;
//  - ogni passo successivo (scrittura sul foglio, mail al titolare, mail all'ospite) ha un claim (SET NX) e un marcatore "fatto":
//    se arriva due volte lo stesso evento NON si duplicano righe, mail o prenotazioni;
//  - se un passo fallisce risponde 500: Stripe riprova e vengono rieseguiti SOLO i passi mancanti;
//  - la scrittura sul foglio non blocca mai la conferma: se il foglio non risponde finisce in una coda che si svuota da sola.
// Il percorso di conferma vive in _pagato.js ed è lo stesso per tre ingressi: questo webhook, il controllo al ritorno dell'ospite sul sito
// (checkout_status) e la sincronizzazione periodica, che ricontrolla su Stripe le prenotazioni rimaste "in attesa" se il webhook non arriva.
// Va registrato su Stripe (Sviluppatori → Webhook) puntando a https://<tuo-dominio>/api/stripe-webhook per gli eventi
// "checkout.session.completed", "checkout.session.async_payment_succeeded" e (consigliato) "checkout.session.expired".
// Il "Signing secret" va in STRIPE_WEBHOOK_SECRET su Vercel.
const x = require('./x.js');
const P = require('./_pagato.js');
const buffer = req => new Promise((res, rej) => { const ch = []; req.on('data', d => ch.push(d)); req.on('end', () => res(Buffer.concat(ch))); req.on('error', rej); });

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) { return res.status(400).send('Webhook Error: firma non valida'); }      // il dettaglio non serve a chi chiama
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await P.confermaPagamento(event.data.object, req);
    else if (event.type === 'checkout.session.expired') await P.sessioneScaduta(event.data.object);
    // ultimo evento ricevuto e valido: lo mostra Gestione → Sito → Sistema → Pagamenti ed email (se non cambia mai, il webhook non sta arrivando)
    await x.kv('SET', 'stripe:ultimo', JSON.stringify({ ts: new Date().toISOString(), tipo: event.type })).catch(() => {});
  } catch (e) {
    console.error('stripe-webhook:', event.type, e.message);
    return res.status(500).json({ received: false, retry: true });    // Stripe riprova (con backoff) e si rieseguono solo i passi mancanti
  }
  res.json({ received: true });
};
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
