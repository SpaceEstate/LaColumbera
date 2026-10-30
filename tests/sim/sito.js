'use strict';
// Controlli statici del sito: diciture, menu, pagina Eventi, contenuti di default. Nessuna rete, nessuna dipendenza.
//   node tests/sim/sito.js
//  S1 il piè di pagina dice "Alloggio ad uso turistico" ovunque
//  S2 il menu ha "Eventi" su ogni pagina e eventi.html è una pagina vera
//  S3 Luoghi di interesse non ha più gli eventi
//  S4 contenuti di default di Torre e Corte (approfondimento, servizi, campi CIN e CIPAT)
//  S5 orizzonte di 6 mesi: calcolo delle date
//  S6 immagini leggere per il telefono: nessuna foto pesante, ogni foto degli appartamenti ha la sua miniatura
//  S7 accessibilità di base su ogni pagina: menu, logo, descrizione, titoli del piè di pagina, numero di telefono
//  S8 cache delle immagini (vercel.json)
//  S9 scheda di prenotazione: compatta, sugli schermi larghi segue la pagina restando intera (mai altezza massima né scorrimento interno); nessun prezzo fisso nell'HTML
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
    assert(/^IT\d{6}C2[A-Z0-9]{8}$/.test(p.cin), id + ': il CIN non ha la forma attesa (IT + 6 cifre + C2 + 8 caratteri): ' + p.cin);
    assert(p.cipat === '' || /^\d{6}-AT-\d{6}$/.test(p.cipat), id + ': il CIPAT non ha la forma attesa: ' + p.cipat);
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

test('S6 immagini leggere per il telefono: nessuna foto pesante, ogni foto degli appartamenti ha la sua miniatura', () => {
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  const tutte = walk('img').filter(f => /\.(jpe?g|png|webp)$/i.test(f)), kb = f => fs.statSync(path.join(ROOT, f)).size / 1024;
  for (const f of tutte) {
    if (/\/t\//.test(f)) assert(kb(f) <= 40, f + ': miniatura troppo pesante (' + Math.round(kb(f)) + ' KB)');
    else if (/\.jpe?g$/i.test(f)) assert(kb(f) <= 400, f + ': foto troppo pesante per il telefono (' + Math.round(kb(f)) + ' KB, massimo 400)');
  }
  assert(tutte.reduce((a, f) => a + kb(f), 0) < 16 * 1024, 'le immagini del sito superano i 16 MB');
  const d = JSON.parse(read('data/default.json'));
  for (const p of d.apts) for (const u of p.foto) {
    assert(/^img\//.test(u), p.id + ': foto non locale ' + u);
    const t = decodeURIComponent(u).replace(/\/([^/]+)$/, '/t/$1');
    assert(fs.existsSync(path.join(ROOT, decodeURIComponent(u))), p.id + ': foto mancante ' + u);
    assert(fs.existsSync(path.join(ROOT, t)), p.id + ': miniatura mancante per ' + u);
  }
});

test('S7 accessibilità di base su ogni pagina: menu, logo, descrizione, titoli del piè di pagina, numero di telefono', () => {
  for (const f of HTML) {
    const s = read(f);
    assert(/<html lang="it">/.test(s), f + ': lingua della pagina');
    const toggle = /<button [^>]*class="menu-toggle"[^>]*>/.exec(s); assert(toggle && /type="button"/.test(toggle[0]) && /aria-label="[^"]+"/.test(toggle[0]), f + ': il pulsante del menu non ha tipo o nome accessibile');
    const brand = /<a [^>]*class="brand"[^>]*>/.exec(s); assert(brand && /aria-label="[^"]+"/.test(brand[0]), f + ': il logo non ha un nome accessibile');
    if (f !== 'admin.html') assert(/<meta name="description" content="[^"]{40,}">/.test(s), f + ': descrizione della pagina mancante o troppo breve');
    const foot = s.slice(s.indexOf('<footer')); assert(/<h2>La dimora<\/h2>/.test(foot) && /<h2>Contatti<\/h2>/.test(foot) && !/<h[34]>/.test(foot), f + ': i titoli del piè di pagina devono essere h2');
    assert(!/>\+39 351 704 3594</.test(s), f + ': il numero di telefono mostrato deve avere spazi non separabili');
    for (const img of s.match(/<img [^>]*>/g) || []) assert(/ alt="/.test(img), f + ': immagine senza attributo alt: ' + img.slice(0, 80));
  }
  assert(/aria-label="Scegli la stagione"/.test(read('dintorni.html')) && !/role="tablist"/.test(read('dintorni.html')), 'i pulsanti delle stagioni non sono "tab" senza pannelli');
  assert(!/aria-label="'\+esc\(o\.t\)/.test(read('js/dintorni.js')), 'le schede non devono avere un aria-label diverso dal testo visibile');
});

test('S8 cache delle immagini: un giorno, con rinnovo in background (vercel.json)', () => {
  const v = JSON.parse(read('vercel.json')), h = v.headers.find(x => x.source === '/img/(.*)');
  assert(h && /max-age=86400/.test(h.headers.find(k => k.key === 'Cache-Control').value), 'intestazione Cache-Control per /img');
});

test('S9 scheda di prenotazione: più compatta; sugli schermi larghi segue la pagina restando intera (mai altezza massima, scorrimento interno né barra fissata); nessun prezzo fisso nell\'HTML', () => {
  // regole del CSS con la loro @media (una regola dentro una @media porta la condizione)
  const css = read('css/main.css').replace(/\/\*[\s\S]*?\*\//g, ''), regole = [];
  for (let i = 0, media = '', sel = '', depth = 0, buf = ''; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') { const t = buf.trim(); buf = ''; if (t.startsWith('@media')) media = t; else sel = t; depth++; }
    else if (ch === '}') { if (sel) regole.push({ media: depth > 1 ? media : '', sel, dec: buf.trim() }); else media = ''; sel = ''; buf = ''; depth--; }
    else buf += ch;
  }
  const scheda = regole.filter(r => /\.book-card(?![\w-])|\.bk-quote(?![\w-])|#bk\b/.test(r.sel));
  assert(scheda.length > 3, 'regole della scheda trovate');
  for (const r of scheda) assert(!/max-height|overflow(-y)?\s*:\s*(auto|scroll|hidden)/.test(r.dec), 'la scheda non deve scorrere dentro sé stessa: ' + r.media + ' ' + r.sel + ' { ' + r.dec + ' }');
  const sticky = regole.filter(r => /position\s*:\s*(sticky|fixed)/.test(r.dec) && /\.book-card|\.bk-|#bk\b|\.cal\b/.test(r.sel));
  assert(sticky.length === 1 && sticky[0].sel === '.book-card', 'solo la scheda intera segue la pagina (nessuna barra fissata sopra il calendario): ' + sticky.map(r => r.sel).join(' | '));
  assert(/min-width:\s*961px/.test(sticky[0].media) && /min-height:\s*\d+px/.test(sticky[0].media), 'solo sugli schermi larghi e abbastanza alti: ' + sticky[0].media);
  assert(/top\s*:\s*var\(--bk-top/.test(sticky[0].dec), 'la distanza dall\'alto la calcola la pagina (--bk-top): ' + sticky[0].dec);
  // più compatta: celle del calendario al massimo 40 px (38 sugli schermi larghi), margine interno della scheda al massimo 24 px
  const px = (sel, prop, media) => { const r = regole.filter(x => x.sel === sel && x.media === (media || '') && new RegExp('(^|;)\\s*' + prop + '\\s*:').test(x.dec)).pop(); return r ? r.dec.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)'))[1].trim() : null; };
  assert(parseFloat(px('.cal .d', 'height')) <= 40, 'celle del calendario: ' + px('.cal .d', 'height'));
  assert(parseFloat(px('.cal .d', 'height', '@media(min-width:961px)')) <= 38, 'celle del calendario sugli schermi larghi: ' + px('.cal .d', 'height', '@media(min-width:961px)'));
  const pad = px('.book-card', 'padding'); assert(/^clamp\(\d+px,[\d.]+vw,(\d+)px\)$/.test(pad) && +pad.match(/,(\d+)px\)$/)[1] <= 24, 'margine interno della scheda: ' + pad);
  const js = read('js/pages.js');
  assert(/setProperty\('--bk-top',Math\.min\(84,innerHeight-card\.offsetHeight-16\)/.test(js) && /ResizeObserver\(fit\)\.observe\(card\)/.test(js), 'la pagina tiene la scheda intera nello schermo (--bk-top ricalcolato quando cambia altezza)');
  for (const f of ['torre.html', 'corte.html']) {
    const h = read(f), price = /<div class="price"[^>]*>[\s\S]*?<\/div>/.exec(h);
    assert(price && / hidden[ >]/.test(price[0]) && !/€\s?\d/.test(price[0]), f + ': la riga del prezzo parte nascosta e senza importo: ' + (price && price[0]));
    assert(!/€\s?(120|180)\b/.test(h), f + ': importo fisso nella pagina');
  }
  assert(!/booking-limit|notice-note|Prenotabile fino al/.test(js), 'niente note fisse su orizzonte e preavviso sotto il calendario');
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
