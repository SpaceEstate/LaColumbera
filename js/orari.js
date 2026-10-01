// Orari della fermata "Ravina Piazza" per le linee urbane 12 e 14 di Trentino Trasporti.
//
// ATTENZIONE: questo file deve restare in api/ (api/orari.js). Vercel espone come endpoint
// solo i file della cartella api/: se sta altrove (es. js/) /api/orari risponde 404.
//
// I PDF di fermata hanno il codice della stagione nel nome (es. T26I = orario invernale 2026-27,
// T27E = orario estivo 2027) e cambiano due volte l'anno. Invece di tenere un link fisso che scade,
// questo endpoint cerca ogni volta il PDF in vigore sul sito di Trentino Trasporti e fa un redirect.
// Se non lo trova (sito irraggiungibile, nome cambiato...) rimanda alla pagina ufficiale della linea,
// sempre aggiornata: lì basta cliccare "Ravina Piazza".
//
// Uso:  /api/orari?l=12   oppure   /api/orari?l=14
// Facoltativo su Vercel: TT_STAGIONE (es. "T27E") per forzare una stagione se la ricerca automatica sbaglia.
const TT = 'https://www.trentinotrasporti.it';
const FERMATA = '27045'; // codice della fermata Ravina Piazza (uguale per le due linee)

// Pagine ufficiali delle linee: cliccando "Ravina Piazza" si aprono gli orari della fermata.
const PAGINA_BASE = TT + '/it/linea-urbana?idLineaAndata=';
const PAGINA_FINE = '&stagione=&idBacinoCitta=/it/viaggia-con-noi/urbano/trento?stagione=%23andata#ritorno';
const LINEE = {
  '12': PAGINA_BASE + '624&idLineaRitorno=625' + PAGINA_FINE,
  '14': PAGINA_BASE + '626&idLineaRitorno=627' + PAGINA_FINE
};

// Stagioni da provare, in ordine: quella in corso secondo la data, poi la successiva, poi la precedente.
// Orario invernale: da metà settembre a inizio giugno · orario estivo: da inizio giugno a metà settembre.
// (Le date esatte cambiano di anno in anno: il PDF riporta comunque "in vigore dal ... al ...".)
function stagioni() {
  const n = new Date(), y = n.getUTCFullYear() % 100, m = n.getUTCMonth() + 1, d = n.getUTCDate();
  const inverno = m > 9 || (m === 9 && d >= 15);
  const estate = !inverno && (m >= 7 || (m === 6 && d >= 9));
  const cur = inverno ? ['I', y] : estate ? ['E', y] : ['I', y - 1];
  const next = cur[0] === 'I' ? ['E', cur[1] + 1] : ['I', cur[1]];
  const prev = cur[0] === 'I' ? ['E', cur[1]] : ['I', cur[1] - 1];
  return [cur, next, prev].map(([s, v]) => 'T' + String((v + 100) % 100).padStart(2, '0') + s);
}

// true se all'indirizzo c'è davvero un PDF (non una pagina di errore con stato 200)
async function esiste(url) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(url, {
      headers: { Range: 'bytes=0-0', 'User-Agent': 'Mozilla/5.0 (compatible; LaColumberaBot/1.0)' },
      signal: ac.signal
    });
    const ok = (r.status === 200 || r.status === 206) && /pdf/i.test(r.headers.get('content-type') || '');
    try { await r.body.cancel(); } catch (e) {}
    return ok;
  } catch (e) { return false; }
  finally { clearTimeout(t); }
}

module.exports = async (req, res) => {
  const l = String(req.query.l || ''), pagina = LINEE[l];
  if (!pagina) return res.status(404).send('Linea non valida');

  const codici = [...new Set([(process.env.TT_STAGIONE || '').trim().toUpperCase(), ...stagioni()].filter(Boolean))];
  const urls = codici.map(c => TT + '/pdforari/urbani/fermate/OrariDiFermataConPercorso-' + c + '-' + FERMATA + '--T-' + l + 'RP.PDF');
  const trovato = (await Promise.all(urls.map(esiste))).indexOf(true);

  // PDF trovato: si ricontrolla ogni ora. Non trovato: si rimanda alla pagina della linea e si riprova dopo pochi minuti.
  res.setHeader('Cache-Control', trovato >= 0 ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=300');
  res.setHeader('Location', trovato >= 0 ? urls[trovato] : pagina);
  res.status(302).end();
};
