'use strict';
// La Columbera · traduzione automatica dei messaggi (area clienti ↔ Gestione). Il prefisso "_" evita che Vercel lo esponga come endpoint.
//
// Fornitore: DeepL (società tedesca, server nell'Unione europea), un solo punto di contatto in tutto il sito: questo file.
// Chiave nella variabile d'ambiente DEEPL_API_KEY: le chiavi che finiscono con ":fx" sono del piano gratuito (api-free.deepl.com),
// le altre del piano Pro (api.deepl.com). Per i messaggi degli ospiti va usato il piano Pro (i testi non vengono conservati da DeepL):
// verificare le condizioni del contratto prima di attivarlo (docs/messaggi.md).
// Senza chiave, o se DeepL non risponde in 6 secondi, la traduzione semplicemente non c'è: il messaggio parte comunque e si legge
// in originale. Non lancia mai. Nessun log con i testi.
const LINGUE = { it: 'IT', en: 'EN-GB', de: 'DE', fr: 'FR', es: 'ES', nl: 'NL', pt: 'PT-PT', pl: 'PL', cs: 'CS', sk: 'SK', sl: 'SL', hu: 'HU', ro: 'RO', da: 'DA', sv: 'SV', fi: 'FI', nb: 'NB', el: 'EL', bg: 'BG', uk: 'UK', ru: 'RU', tr: 'TR', ja: 'JA', zh: 'ZH', ko: 'KO' };
function makeTraduci({ env, fetch }) {
  env = env || process.env;
  const TIMEOUT_MS = Number(env.DEEPL_TIMEOUT_MS) > 0 ? Number(env.DEEPL_TIMEOUT_MS) : 6000;      // DEEPL_TIMEOUT_MS solo per le prove
  const key = () => String(env.DEEPL_API_KEY || '').trim();
  const attiva = () => !!key();
  const url = () => (/:fx$/.test(key()) ? 'https://api-free.deepl.com' : 'https://api.deepl.com') + '/v2/translate';
  const supportata = l => !!LINGUE[String(l || '').toLowerCase()];
  // testi: array di stringhe; verso: codice breve (it, en, de…); da: lingua di partenza se nota (altrimenti la riconosce DeepL);
  // xml: le parti tra <x>…</x> non si traducono (variabili dei template). Ritorna { ok, testi, lingue (rilevate, codice breve) }.
  async function traduci(testi, verso, { da, xml } = {}) {
    const target = LINGUE[String(verso || '').toLowerCase()];
    if (!attiva() || !target || !Array.isArray(testi) || !testi.length) return { ok: false };
    const body = { text: testi.map(s => String(s == null ? '' : s).slice(0, 5000)), target_lang: target };
    if (da && LINGUE[da]) body.source_lang = LINGUE[da].slice(0, 2);
    if (xml) { body.tag_handling = 'xml'; body.ignore_tags = ['x']; }
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url(), { method: 'POST', headers: { Authorization: 'DeepL-Auth-Key ' + key(), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) return { ok: false, http: r.status };
      const j = await r.json(), tr = (j && Array.isArray(j.translations)) ? j.translations : [];
      if (tr.length !== testi.length) return { ok: false };
      return { ok: true, testi: tr.map(x => String(x && x.text || '')), lingue: tr.map(x => String(x && x.detected_source_language || '').slice(0, 2).toLowerCase()) };
    } catch (e) { return { ok: false }; }
    finally { clearTimeout(timer); }
  }
  return { traduci, attiva, supportata };
}

module.exports = { makeTraduci, LINGUE };
