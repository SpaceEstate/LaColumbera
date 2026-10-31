'use strict';
// La Columbera · check-in online fatto. Il modulo del check-in è un progetto a parte («Checkin»: pagina su GitHub Pages, imposta di soggiorno
// pagata con lo stesso account Stripe del sito). Il prefisso "_" evita che Vercel lo esponga come endpoint.
//
// Il check-in di una prenotazione è FATTO quando l'ospite l'ha aperto con il numero di prenotazione (verificato nel primo passo del modulo,
// anche arrivando dall'area clienti) e il pagamento è riuscito. La sessione Stripe del check-in ha allora nei metadati `dataCheckin` (la
// distingue dai pagamenti delle prenotazioni del sito, come nel Check-in) e `numeroPrenotazione`, con payment_status 'paid'. Chi salta la
// verifica («Non ho il numero di prenotazione») non porta il numero, e nemmeno i check-in fatti prima del 30/10/2026: questi si collegano
// per ABBINAMENTO (abbina): stessa data di arrivo e stesso appartamento di UNA sola prenotazione attiva (sito, Booking, Airbnb, manuale);
// con più prenotazioni possibili anche lo stesso numero di notti; se resta più di una, o nessuna, o il check-in è per tutti e due gli
// appartamenti, non si collega nulla (meglio un riquadro ancora da fare che un check-in attribuito alla prenotazione sbagliata).
// Due ingressi, stesso passo idempotente (SET NX): il webhook di Stripe di questo sito, che riceve anche gli eventi del check-in, e la
// sincronizzazione periodica, rete di sicurezza se il webhook non arriva (rilegge su Stripe le sessioni degli ultimi 3 giorni, al più ogni 10 minuti).
// KV: ck:<CODICE> → {il, sid} (quando è stato registrato, sessione Stripe), scade 30 giorni dopo la partenza. Nessun dato degli ospiti.
// checkin:ric → ultimo controllo su Stripe della sincronizzazione (10 minuti).
// L'area clienti (a=mie) mostra il riquadro «Check-in completato» e, nei giorni giusti, il codice della cassetta delle chiavi.
const AV = require('./_avail.js');
const DAY = 864e5, FINESTRA_MS = 3 * DAY, STORICO_MS = 60 * DAY, ATTESA_MS = 35 * 60e3, TTL_MAX = 400 * 86400;

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

// appartamento del check-in, dal testo del modulo («La Columbera - Torre, …»): '' se sono tutti e due o nessuno
const aptDi = a => { const t = /torre/i.test(String(a || '')), c = /corte/i.test(String(a || '')); return t === c ? '' : t ? 'torre' : 'corte'; };
// prenotazioni: async () => [{ code, apt, da, notti }] delle prenotazioni attive (le dà x.js: sito confermate + registro del foglio non annullate)
function makeCheckin({ kv, stripe, log, now, prenotazioni }) {
  now = now || (() => Date.now());
  // Codice della prenotazione per un check-in pagato SENZA numero: data di arrivo e appartamento (e, se serve, notti) di una sola prenotazione
  async function abbina(s) {
    const md = (s && s.metadata) || {}, da = md.dataCheckin, apt = aptDi(md.appartamento), notti = parseInt(md.numeroNotti, 10);
    if (!prenotazioni || !AV.isIso(da) || !apt) return '';
    const per = new Map();
    for (const p of (await prenotazioni()) || []) { const c = String(p && p.code || '').trim().toUpperCase(); if (c && p.apt === apt && p.da === da && !per.has(c)) per.set(c, p); }
    let c = [...per.values()];
    if (c.length > 1 && notti > 0) c = c.filter(p => +p.notti === notti);
    return c.length === 1 ? String(c[0].code).trim().toUpperCase() : '';
  }
  // Registra il check-in di una sessione Stripe pagata: { code, nuovo, abbinato } (nuovo = prima registrazione), null se non è un check-in collegato
  async function registra(s) {
    if (!eCheckin(s) || s.payment_status !== 'paid') return null;
    let code = codiceDi(s), abbinato = false;
    if (!code && !(s.metadata && s.metadata.numeroPrenotazione)) { code = await abbina(s).catch(() => ''); abbinato = !!code; }      // un numero scritto ma non valido non si indovina
    if (!code) return null;
    const t = now(), il = s.created > 0 && s.created * 1000 <= t ? s.created * 1000 : t;      // giorno del pagamento, anche se lo registra la rete di sicurezza
    const v = JSON.stringify({ il: new Date(il).toISOString(), sid: String(s.id || '').slice(0, 80) });
    return { code, abbinato, nuovo: (await kv('SET', 'ck:' + code, v, 'NX', 'EX', String(ttlDi(s.metadata, t)))) === 'OK' };
  }
  // Per l'area clienti: fatto sì o no, e il giorno (ora di Trento). Per la Gestione anche come: 'online' (pagamento del check-in) o 'manuale'.
  async function stato(code, { come = false } = {}) {
    const v = parse(await kv('GET', 'ck:' + String(code || '').trim().toUpperCase()));
    if (!(v && Date.parse(v.il))) return { fatto: false };
    return Object.assign({ fatto: true, il: AV.todayRome(Date.parse(v.il)) }, come ? { come: v.sid === 'manuale' ? 'manuale' : 'online' } : {});
  }
  // Gestione: il titolare segna a mano il check-in fatto (ospite registrato di persona, check-in fatto fuori dal modulo online o non collegabile),
  // oppure lo toglie. Stessa chiave del check-in online: l'area clienti si comporta allo stesso modo (riquadro «Check-in completato», cassetta).
  async function segna(b, on) {
    const code = String(b && b.code || '').trim().toUpperCase();
    if (!code) return false;
    if (!on) { await kv('DEL', 'ck:' + code); return true; }
    const t = now(), v = JSON.stringify({ il: new Date(t).toISOString(), sid: 'manuale' });
    await kv('SET', 'ck:' + code, v, 'EX', String(ttlDi({ dataCheckin: b.da, numeroNotti: String(b.notti || '') }, t)));
    return true;
  }
  // Rete di sicurezza (dalla sincronizzazione, al più ogni 10 minuti): le sessioni Stripe degli ultimi 3 giorni, più vecchie di 35 minuti
  // (il pagamento del check-in scade dopo 30: sono tutte chiuse e il webhook ha avuto il tempo di arrivare). Un check-in registrato qui
  // vuol dire che il webhook non è arrivato: resta nel registro eventi. Non lancia mai.
  async function riconcilia() {
    const out = { controllate: 0, recuperati: 0, abbinati: 0, errore: false };      // recuperati: col numero (webhook perso); abbinati: senza numero
    try {
      if ((await kv('SET', 'checkin:ric', '1', 'NX', 'EX', '600')) !== 'OK') return out;
      // La prima volta (e poi una volta al giorno) si guardano gli ultimi 60 giorni: così si collegano per abbinamento anche i check-in
      // già fatti senza numero (prima del 30/10/2026 o con «Non ho il numero»), e quelli di prenotazioni arrivate dopo sul foglio.
      const t = now(), storico = (await kv('SET', 'checkin:ric:storico', '1', 'NX', 'EX', '86400')) === 'OK', sessioni = [];
      let dopo;
      for (let pagina = 0; pagina < (storico ? 10 : 1); pagina++) {
        const l = await stripe().checkout.sessions.list(Object.assign({ status: 'complete', created: { gte: Math.floor((t - (storico ? STORICO_MS : FINESTRA_MS)) / 1000), lte: Math.floor((t - ATTESA_MS) / 1000) }, limit: 100 }, dopo ? { starting_after: dopo } : {}));
        const d = (l && l.data) || []; sessioni.push(...d);
        if (!(l && l.has_more) || !d.length) break;
        dopo = d[d.length - 1].id;
      }
      for (const s of sessioni) {
        if (!eCheckin(s) || s.payment_status !== 'paid') continue;
        const r = await registra(s);
        if (!r) continue;
        out.controllate++;
        if (r.nuovo) out[r.abbinato ? 'abbinati' : 'recuperati']++;
      }
    } catch (e) { out.errore = true; }
    if (log && out.recuperati) await log({ lvl: 'WARN', msg: 'Check-in online: ' + out.recuperati + (out.recuperati === 1 ? ' check-in registrato' : ' check-in registrati') + ' dal controllo su Stripe, il webhook non era arrivato. Controlla il webhook (Gestione → Sito → Sistema → Pagamenti ed email).' }).catch(() => {});
    if (log && out.abbinati) await log({ lvl: 'INFO', msg: 'Check-in online: ' + out.abbinati + (out.abbinati === 1 ? ' check-in senza numero di prenotazione collegato' : ' check-in senza numero di prenotazione collegati') + ' alla prenotazione con la stessa data di arrivo e lo stesso appartamento.' }).catch(() => {});
    if (log && out.errore) await log({ lvl: 'ERR', msg: 'Check-in online: controllo su Stripe non riuscito (si riprova tra 10 minuti).' }).catch(() => {});
    return out;
  }
  return { registra, stato, segna, riconcilia };
}

module.exports = { makeCheckin, eCheckin, codiceDi, codiceCassetta };
