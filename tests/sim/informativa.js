'use strict';
// Controlli statici dell'intervento 3 (informativa e link). Nessuna rete, nessuna dipendenza.
//   node tests/sim/informativa.js
//  I1 ogni pagina pubblica ha il link all'informativa nel footer
//  I2 nessun link interno rotto (href/src delle pagine e dei modelli HTML nei file js/)
//  I3 ogni modulo che raccoglie dati personali ha accanto il link all'informativa
//  I4 privacy.html contiene i contenuti minimi dell'art. 13 e nessun tracciamento
//  I5 la presa visione non è trattata come consenso (il sito non ha caselle di consenso)
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tests = []; const test = (n, f) => tests.push({ n, f });

const HTML = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const JS = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);

test('I1 link all\'informativa nel footer di ogni pagina pubblica', () => {
  for (const f of HTML) {
    const s = read(f), foot = s.slice(s.indexOf('<footer'));
    assert(s.includes('<footer'), f + ': footer mancante');
    assert(/href="privacy\.html"/.test(foot), f + ': link privacy.html mancante nel footer');
  }
});

// percorso locale di un href/src (null se esterno o non verificabile staticamente)
function local(u) {
  if (!u || /^(https?:|mailto:|tel:|#|javascript:|data:|\/\/)/i.test(u) || u.includes('${') || /'\s*\+|\+\s*'/.test(u)) return null;   // valori calcolati a runtime
  const p = decodeURIComponent(u.split('#')[0].split('?')[0]);
  if (!p || p.startsWith('api/') || p.startsWith('/api/')) return null;          // endpoint serverless, non file
  return p.replace(/^\//, '');
}
test('I2 nessun link interno rotto (pagine HTML e modelli nei file js/)', () => {
  const bad = [];
  const scan = (f, s) => { for (const m of s.matchAll(/(?:href|src)="([^"]+)"/g)) { const p = local(m[1]); if (p && !fs.existsSync(path.join(ROOT, p))) bad.push(f + ' → ' + m[1]); } };
  for (const f of HTML) scan(f, read(f));
  for (const f of JS) scan(f, read(f));
  assert.deepStrictEqual(bad, [], 'link rotti');
});

test('I3 link all\'informativa accanto ai moduli che raccolgono dati personali', () => {
  const pages = read('js/pages.js');
  // il link deve stare DENTRO il blocco del modulo (dal marcatore alla chiusura indicata), non solo nel footer della pagina
  const near = (s, marker, end) => { const i = s.indexOf(marker); assert(i >= 0, 'marcatore ' + marker); const j = s.indexOf(end, i); assert(j > i, 'fine blocco ' + end); return s.slice(i, j).includes('href="privacy.html"'); };
  assert(near(pages, 'data-testid="booking-name"', '</form>'), 'modulo di prenotazione: link mancante');
  assert(near(pages, 'data-testid="gc-confirm"', 'id="gc-go"'), 'Guest Card (emissione): link mancante');
  assert(near(read('area-clienti.html'), 'data-testid="area-clienti-form"', '</form>'), 'area clienti: link mancante');
  assert(near(read('guest-card.html'), 'data-testid="gc-form"', '</form>'), 'Guest Card (verifica): link mancante');
  assert(/privacy\.html/.test(read('api/_mail.js')), 'email all\'ospite: link all\'informativa mancante');
});

test('I4 privacy.html: contenuti minimi art. 13, segnaposto riconoscibili, nessun tracciamento', () => {
  const s = read('privacy.html');
  for (const id of ['titolare', 'trattamenti', 'checkin', 'conferimento', 'conservazione', 'destinatari', 'browser', 'diritti', 'english']) assert(s.includes('id="' + id + '"'), 'sezione #' + id);
  for (const t of ['Andrea Scozzafava', 'lacolumbera@gmail.com', 'art. 6.1.b', 'art. 6.1.c', 'art. 6.1.f', 'Garante per la protezione dei dati personali', 'Alloggiati Web', '5 anni', 'Stati Uniti'])
    assert(s.includes(t), 'testo atteso: ' + t);
  // i segnaposto sono sempre evidenziati (mai testo "finto" mescolato al resto)
  const todo = (s.match(/\[DA COMPLETARE/g) || []).length, marked = (s.match(/<mark class="todo">\[DA COMPLETARE/g) || []).length;
  assert(todo > 0 && todo === marked, 'segnaposto non evidenziati: ' + todo + ' / ' + marked);
  assert(/class="draft"/.test(s), 'avviso di testo in revisione mancante');
  assert(!/<script[^>]+src="https?:/i.test(s) && !/googletagmanager|gtag\(|fbq\(|document\.cookie|localStorage/.test(s), 'tracciamento o storage non dichiarato');
  assert(!/GDPR compliant|conforme al GDPR|dati al sicuro|nessun dato conservato/i.test(s), 'dichiarazioni assolute non dimostrabili');
});

test('I5 nessuna casella di "consenso" privacy nel sito', () => {
  for (const f of HTML.concat(JS)) assert(!/type="checkbox"[^>]*(consen|privacy)|name="[^"]*consen/i.test(read(f)), f + ': casella di consenso');
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
