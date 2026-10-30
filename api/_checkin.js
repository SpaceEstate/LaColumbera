'use strict';
// La Columbera · check-in online fatto. Il modulo del check-in è un progetto a parte («Checkin»: pagina su GitHub Pages, imposta di soggiorno
// pagata con lo stesso account Stripe del sito). Il prefisso "_" evita che Vercel lo esponga come endpoint.
//
// Il check-in di una prenotazione è FATTO quando l'ospite l'ha aperto con il numero di prenotazione (verificato nel primo passo del modulo,
// anche arrivando dall'area clienti) e il pagamento è riuscito. La sessione Stripe del check-in ha allora nei metadati `dataCheckin` (la
// distingue dai pagamenti delle prenotazioni del sito, come nel Check-in) e `numeroPrenotazione`, con payment_status 'paid'. Chi salta la
// verifica («Non ho il numero di prenotazione») non porta il numero: quel check-in non si collega a nessuna prenotazione.
// Due ingressi, stesso passo idempotente (SET NX): il webhook di Stripe di questo sito, che riceve anche gli eventi del check-in, e la
// sincronizzazione periodica, rete di sicurezza se il webhook non arriva (rilegge su Stripe le sessioni degli ultimi 3 giorni, al più ogni 10 minuti).
// KV: ck:<CODICE> → {il, sid} (quando è stato registrato, sessione Stripe), scade 30 giorni dopo la partenza. Nessun dato degli ospiti.
// checkin:ric → ultimo controllo su Stripe della sincronizzazione (10 minuti).
// L'area clienti (a=mie) mostra il riquadro «Check-in completato» e, nei giorni giusti, il codice della cassetta delle chiavi.
const AV = require('./_avail.js');
const DAY = 864e5, FINESTRA_MS = 3 * DAY, ATTESA_MS = 35 * 60e3, TTL_MAX = 400 * 86400;

const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const eCheckin = s => !!(s && s.metadata && s.metadata.dataCheckin);
// stesso controllo del Check-in (crea-pagamento-stripe.js): lettere e cifre maiuscole, al più qualche trattino
const codiceDi = s => { const v = String((s && s.metadata && s.metadata.numeroPrenotazione) || '').trim().toUpperCase().replace(/\s+/g, ''); return /^[A-Z0-9][A-Z0-9-]{2,39}$/.test(v) ? v : ''; };
// la registrazione scade 30 giorni dopo la partenza (arrivo + notti, dai metadati); senza date valide dopo 400 giorni
const ttlDi = (md, t) => {
  const n = parseInt(md && md.numeroNotti, 10), da = md && md.dataCheckin;
  if (!AV.isIso(da)) return TTL_MAX;
  const fine = Date.parse(AV.addDays(da, (n > 0 && n < 366 ? n : 0) + 30) + 'T12:00:00Z');
  return Math.max(86400, Math.min(TTL_MAX, Math.round((fine - t) / 1000)));
};
// Codice della cassetta delle chiavi di un appartamento: Gestione → Sito → Appartamenti → Area ospiti. Se il campo è vuoto vale la variabile
// del Check-in (CODICE_CASSETTA_TORRE, CODICE_CASSETTA_CORTE), se è impostata anche in questo progetto.
const codiceCassetta = (p, id, env) => String((p && p.cassetta) || (env || process.env)['CODICE_CASSETTA_' + String(id || '').toUpperCase()] || '').trim().slice(0, 40);

function makeCheckin({ kv, stripe, log, now }) {
  now = now || (() => Date.now());
  // Registra il check-in di una sessione Stripe pagata: { code, nuovo } (nuovo = prima registrazione), null se non è un check-in collegato
  async function registra(s) {
    if (!eCheckin(s) || s.payment_status !== 'paid') return null;
    const code = codiceDi(s);
    if (!code) return null;
    const t = now(), v = JSON.stringify({ il: new Date(t).toISOString(), sid: String(s.id || '').slice(0, 80) });
    return { code, nuovo: (await kv('SET', 'ck:' + code, v, 'NX', 'EX', String(ttlDi(s.metadata, t)))) === 'OK' };
  }
  // Per l'area clienti: fatto sì o no, e il giorno (ora di Trento)
  async function stato(code) {
    const v = parse(await kv('GET', 'ck:' + String(code || '').trim().toUpperCase()));
    return v && Date.parse(v.il) ? { fatto: true, il: AV.todayRome(Date.parse(v.il)) } : { fatto: false };
  }
  // Rete di sicurezza (dalla sincronizzazione, al più ogni 10 minuti): le sessioni Stripe degli ultimi 3 giorni, più vecchie di 35 minuti
  // (il pagamento del check-in scade dopo 30: sono tutte chiuse e il webhook ha avuto il tempo di arrivare). Un check-in registrato qui
  // vuol dire che il webhook non è arrivato: resta nel registro eventi. Non lancia mai.
  async function riconcilia() {
    const out = { controllate: 0, recuperati: 0, errore: false };
    try {
      if ((await kv('SET', 'checkin:ric', '1', 'NX', 'EX', '600')) !== 'OK') return out;
      const t = now(), l = await stripe().checkout.sessions.list({ created: { gte: Math.floor((t - FINESTRA_MS) / 1000), lte: Math.floor((t - ATTESA_MS) / 1000) }, limit: 100 });
      for (const s of (l && l.data) || []) {
        if (!eCheckin(s) || s.payment_status !== 'paid' || !codiceDi(s)) continue;
        out.controllate++;
        const r = await registra(s);
        if (r && r.nuovo) out.recuperati++;
      }
    } catch (e) { out.errore = true; }
    if (log && out.recuperati) await log({ lvl: 'WARN', msg: 'Check-in online: ' + out.recuperati + (out.recuperati === 1 ? ' check-in registrato' : ' check-in registrati') + ' dal controllo su Stripe, il webhook non era arrivato. Controlla il webhook (Gestione → Sito → Sistema → Pagamenti ed email).' }).catch(() => {});
    if (log && out.errore) await log({ lvl: 'ERR', msg: 'Check-in online: controllo su Stripe non riuscito (si riprova tra 10 minuti).' }).catch(() => {});
    return out;
  }
  return { registra, stato, riconcilia };
}

module.exports = { makeCheckin, eCheckin, codiceDi, codiceCassetta };
