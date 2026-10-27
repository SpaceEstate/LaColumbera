'use strict';
// Controlli statici del sito: diciture, menu, pagina Eventi, contenuti di default. Nessuna rete, nessuna dipendenza.
//   node tests/sim/sito.js
//  S1 il piè di pagina dice "Alloggio ad uso turistico" ovunque
//  S2 il menu ha "Eventi" su ogni pagina e eventi.html è una pagina vera
//  S3 Luoghi di interesse non ha più gli eventi
//  S4 contenuti di default di Torre e Corte (approfondimento, servizi, campi CIN e CIPAT)
//  S5 orizzonte di 6 mesi: calcolo delle date
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const tests = []; const test = (n, f) => tests.push({ n, f });

test('S1 piè di pagina: "Alloggio ad uso turistico" su ogni pagina, mai più "extra-alberghiera"', () => {
  for (const f of HTML) {
    const s = read(f), foot = s.slice(s.indexOf('<footer'));
    assert(/Alloggio ad uso turistico/.test(foot), f + ': dicitura mancante nel piè di pagina');
    assert(!/extra-?\s?alberghier/i.test(s), f + ': compare ancora "extra-alberghiera"');
  }
  for (const f of ['js/pages.js', 'js/dintorni.js', 'js/site.js', 'api/_mail.js']) assert(!/extra-?\s?alberghier/i.test(read(f)), f + ': compare ancora "extra-alberghiera"');
});

test('S2 il menu ha la voce Eventi su ogni pagina; eventi.html è una pagina vera, con il suo contenuto', () => {
  for (const f of HTML) assert(/<a href="eventi\.html" data-testid="nav-eventi">Eventi<\/a>/.test(read(f)), f + ': voce Eventi mancante nel menu');
  const e = read('eventi.html');
  assert(!/http-equiv="refresh"|noindex/.test(e) && !/rel="canonical"/.test(e), 'eventi.html non deve più reindirizzare né essere nascosta ai motori di ricerca');
  assert(/data-p="eventi"/.test(e) && /id="events"/.test(e) && /js\/pages\.js/.test(e), 'eventi.html deve caricare gli eventi');
  assert(/<h1[^>]*>Eventi/.test(e), 'titolo della pagina');
});

test('S3 Luoghi di interesse: nessuna sezione eventi; i rimandi puntano alla pagina Eventi', () => {
  const d = read('dintorni.html'), j = read('js/dintorni.js');
  assert(!/id="eventi"|id="events"|data-p="eventi"|js\/pages\.js/.test(d), 'dintorni.html contiene ancora gli eventi');
  assert(/href="eventi\.html"/.test(d), 'rimando alla pagina Eventi nell\'introduzione');
  assert(/link:'eventi\.html'/.test(j) && !/link:'#eventi'/.test(j), 'la scheda "eventi dell\'estate" deve puntare a eventi.html');
  assert(!/dintorni\.html#eventi/.test(HTML.map(read).join('\n') + read('js/admin.js')), 'link vecchi a dintorni.html#eventi');
});

test('S4 contenuti di default: approfondimento e servizi per gruppi, campi CIN e CIPAT presenti (vuoti: mai segnaposto)', () => {
  const d = JSON.parse(read('data/default.json'));
  for (const id of ['torre', 'corte']) {
    const p = d.apts.find(a => a.id === id); assert(p, id);
    assert(typeof p.cin === 'string' && typeof p.cipat === 'string', id + ': campi cin e cipat');
    assert(!/\[|DA COMPLETARE|XXX|INSERIRE/i.test(p.cin + p.cipat), id + ': segnaposto nei codici');
    const heads = p.dettagli.split('\n').filter(l => l.startsWith('## ')); assert(heads.length >= 3, id + ': sezioni di approfondimento');
    const groups = p.servizi.split('\n').filter(l => l.startsWith('## ')), items = p.servizi.split('\n').filter(l => l.startsWith('- '));
    assert(groups.length >= 4 && items.length >= 20, id + ': servizi (' + groups.length + ' gruppi, ' + items.length + ' voci)');
    for (const l of p.servizi.split('\n')) assert(l === '' || l.startsWith('## ') || l.startsWith('- '), id + ': riga fuori formato nei servizi: ' + l);
    assert(items.slice(0, 8).every(x => x.length < 45), id + ': le prime 8 voci compaiono in pagina, devono essere brevi');
    assert(p.max >= 1 && p.dettagli.includes('Fino a ' + p.max + ' ospiti'), id + ': il testo deve dire il numero giusto di ospiti (' + p.max + ')');
  }
});

test('S5 orizzonte: oggi + 6 mesi, stesso giorno o ultimo giorno del mese; il "oggi" è quello di Roma', () => {
  const A = require('../../api/_avail.js');
  const cases = [['2026-10-27', 6, '2027-04-27'], ['2026-08-31', 6, '2027-02-28'], ['2027-08-31', 6, '2028-02-29'], ['2026-12-31', 2, '2027-02-28'], ['2026-01-15', 12, '2027-01-15'], ['2026-07-31', 6, '2027-01-31']];
  for (const [d, n, want] of cases) assert.strictEqual(A.addMonthsIso(d, n), want, d + ' + ' + n + ' mesi');
  assert.strictEqual(A.GUEST_MONTHS, 6);
  assert.strictEqual(A.maxBookingDate(Date.parse('2026-10-15T09:00:00Z')), '2027-04-15');
  assert.strictEqual(A.maxBookingDate(Date.parse('2026-10-15T22:30:00Z')), '2027-04-16', 'a mezzanotte italiana (in UTC è ancora ieri) il giorno è già il 16');
});

(async () => {
  let pass = 0, fail = 0; const t0 = Date.now();
  for (const t of tests) {
    try { await t.f(); console.log('  ✔ ' + t.n); pass++; }
    catch (e) { console.log('  ✘ ' + t.n + '\n      → ' + String(e.message).split('\n').slice(0, 12).join('\n        ')); fail++; }
  }
  console.log('\n' + pass + ' ok, ' + fail + ' falliti  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  process.exit(fail ? 1 : 0);
})();
