'use strict';
// La Columbera · «Da fare» per l'app Promemoria di iPhone e iPad (Comandi rapidi): le voci ancora aperte di Gestione → Oggi → Da fare,
// come elenco di titoli. Le legge api/x.js (a=dafare, con la chiave del calendario personale); qui solo il calcolo, senza KV né rete.
//
// Le voci automatiche si calcolano come nella pagina (js/admin-operativita.js: soggiorni, veri, todoAuto): chi cambia una delle due cambia
// anche l'altra. La prova W15e (tests/sim/ui.js) confronta la pagina con questo elenco, giorno per giorno.
//
// Il titolo è la chiave con cui il comando rapido riconosce un promemoria già creato: deve restare uguale finché la voce resta aperta.
// Per questo nei titoli non c'è chi arriva (una prenotazione vista prima solo nel calendario di Airbnb cambia nome quando entra nel foglio)
// e non ci sono dati degli ospiti né codici delle prenotazioni, che finirebbero su iCloud: appartamento e giorno bastano per ritrovarla in Gestione.
const RESERVED = /reserved|prenotat|booked/i;      // come in api/_avail.js e nella pagina: titolo di una prenotazione vera nel calendario di Airbnb
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const FONTE = { BOOKING: 'Booking', AIRBNB: 'Airbnb' };
const ISO = /^\d{4}-\d\d-\d\d$/;
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const short = p => String(p.nome || p.id).replace('La Columbera ', '');
const giorno = d => +d.slice(8) + ' ' + MESI[+d.slice(5, 7) - 1];

// Tutti i soggiorni noti, come soggiorni() della pagina: sito (confermate e da verificare), foglio (tranne le righe del sito), calendari non ancora visti.
function soggiorni({ bk, reg, feeds }) {
  const out = [], sito = new Set();
  (bk || []).filter(x => x.stato === 'confermata' || x.stato === 'da_verificare').forEach(x => { sito.add(String(x.code).toUpperCase()); out.push({ id: x.id, da: x.da, a: x.a, stato: x.stato }); });
  (reg || []).filter(r => r.stato !== 'ANNULLATA').forEach(r => { if (r.fonte === 'SITO' || sito.has(String(r.codice).toUpperCase())) return; out.push({ id: r.apt || '', da: r.checkin, a: r.checkout, stato: 'confermata' }); });
  for (const f of feeds || []) for (const e of f.events || []) {
    if (out.some(o => o.id === f.apt && o.da === e.start)) continue;
    out.push({ id: f.apt, da: e.start, a: e.end, stato: 'calendario', fonte: FONTE[f.source] || 'Altro', cal: String(e.summary || '').slice(0, 60) });
  }
  return out.sort((x, y) => (x.da < y.da ? -1 : x.da > y.da ? 1 : 0));
}
// Chi entra davvero, come veri() della pagina: niente blocchi di Airbnb («Not available») né eventi del calendario sopra una prenotazione già nota.
function veri(st) {
  const note = st.filter(y => y.stato !== 'calendario'), blocco = x => x.fonte === 'Airbnb' && !RESERVED.test(x.cal || '');
  return st.filter(x => x.stato !== 'calendario' || !(blocco(x) || note.some(y => y.id === x.id && x.da < y.a && y.da < x.a)));
}

// oggi: AAAA-MM-GG (Roma); apts: appartamenti della configurazione; todo: la chiave KV «todo» così com'è (null se la lista non è ancora partita);
// ricevute: le richieste di ricevuta (api/_ricevute.js, elenco). Ritorna i titoli delle voci non spuntate, senza doppioni.
function vociDaFare({ oggi, apts, bk, reg, feeds, todo, ricevute }) {
  const t = todo && typeof todo === 'object' ? todo : {}, fatti = t.fatti && typeof t.fatti === 'object' ? t.fatti : {};
  const dal0 = ISO.test(t.dal || '') ? t.dal : oggi, dal = dal0 > addDays(oggi, -90) ? dal0 : addDays(oggi, -90);
  const apt = new Map((apts || []).map(p => [p.id, p])), visti = new Set(), voci = [];
  const add = (id, titolo) => { if (fatti[id] || visti.has(id)) return; visti.add(id); voci.push(titolo); };
  // registrare gli ospiti su Alloggiati Web: ogni arrivo da quando la lista è partita (al più 90 giorni fa) fino a oggi
  veri(soggiorni({ bk, reg, feeds })).filter(x => x.da >= dal && x.da <= oggi && apt.has(x.id))
    .forEach(x => add('all:' + x.id + ':' + x.da, 'Registra ospiti su Alloggiati Web · ' + short(apt.get(x.id)) + ', arrivo del ' + giorno(x.da)));
  // ISTAT: dagli ultimi 7 giorni del mese; un mese non spuntato resta anche nei mesi dopo (al più gli ultimi 3)
  for (let k = 2; k >= 0; k--) {
    const d = new Date(+oggi.slice(0, 4), +oggi.slice(5, 7) - 1 - k, 1), y = d.getFullYear(), mo = d.getMonth(), ym = y + '-' + String(mo + 1).padStart(2, '0');
    const da = ym + '-' + String(new Date(y, mo + 1, 0).getDate() - 6).padStart(2, '0');
    if (oggi >= da && ym >= dal0.slice(0, 7)) add('istat:' + ym, 'Registra ospiti ISTAT · movimento di ' + MESI[mo] + ' ' + y);
  }
  // ricevute chieste dagli ospiti e non ancora mandate: appartamento e arrivo della prenotazione (sito o foglio), non il nome dato per la ricevuta
  const pren = new Map();
  (reg || []).forEach(r => pren.set(String(r.codice).toUpperCase(), { id: r.apt, da: r.checkin }));
  (bk || []).forEach(x => pren.set(String(x.code).toUpperCase(), { id: x.id, da: x.da }));
  (ricevute || []).filter(q => q && q.stato === 'richiesta' && q.code).forEach(q => { const x = pren.get(String(q.code).toUpperCase()), il = String(q.richiesta_il || '').slice(0, 10);
    add('ric:' + q.code, 'Manda la ricevuta · ' + (x && apt.has(x.id) && ISO.test(x.da || '') ? short(apt.get(x.id)) + ', arrivo del ' + giorno(x.da) : 'chiesta il ' + giorno(ISO.test(il) ? il : oggi))); });
  // quelle scritte a mano e non spuntate, dalla più vecchia
  (Array.isArray(t.manuali) ? t.manuali : []).filter(m => m && m.id && !m.fatto && String(m.testo || '').trim())
    .sort((x, y) => (String(x.creata) < String(y.creata) ? -1 : String(x.creata) > String(y.creata) ? 1 : 0))
    .forEach(m => add(m.id, String(m.testo).replace(/\s+/g, ' ').trim()));
  return voci;
}

module.exports = { vociDaFare };
