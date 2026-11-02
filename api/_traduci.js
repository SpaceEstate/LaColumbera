'use strict';
// La Columbera · traduzione automatica dei messaggi (area clienti ↔ Gestione). Il prefisso "_" evita che Vercel lo esponga come endpoint.
//
// Fornitori (un solo punto di contatto in tutto il sito: questo file), uno solo alla volta:
// - DeepL (società tedesca, server nell'Unione europea). Chiave nella variabile d'ambiente DEEPL_API_KEY: le chiavi che finiscono con ":fx"
//   sono del piano gratuito (api-free.deepl.com), le altre del piano Pro (api.deepl.com). Per i messaggi degli ospiti va usato il piano Pro
//   (i testi non vengono conservati da DeepL): verificare le condizioni del contratto prima di attivarlo (docs/messaggi.md).
// - Microsoft Azure Translator (anche con il livello gratuito F0): chiave in AZURE_TRANSLATOR_KEY e, se la risorsa Azure è in una regione
//   (es. westeurope), la regione in AZURE_TRANSLATOR_REGION. Si chiama l'indirizzo europeo (api-eur), così il testo resta in Europa; Microsoft
//   dichiara di non conservare i testi tradotti e di non usarli per addestrare i modelli. Si usa solo se DEEPL_API_KEY non c'è.
// Senza chiave, o se il servizio non risponde in 6 secondi, la traduzione semplicemente non c'è: il messaggio parte comunque e si legge
// in originale. Non lancia mai. Nessun log con i testi.
const LINGUE = { it: 'IT', en: 'EN-GB', de: 'DE', fr: 'FR', es: 'ES', nl: 'NL', pt: 'PT-PT', pl: 'PL', cs: 'CS', sk: 'SK', sl: 'SL', hu: 'HU', ro: 'RO', da: 'DA', sv: 'SV', fi: 'FI', nb: 'NB', el: 'EL', bg: 'BG', uk: 'UK', ru: 'RU', tr: 'TR', ja: 'JA', zh: 'ZH', ko: 'KO' };
// codici di Microsoft dove sono diversi dal codice breve; per l'italiano e le altre lingue il codice breve va già bene
const LINGUE_MS = { pt: 'pt-pt', zh: 'zh-Hans' };
const MS_URL = 'https://api-eur.cognitive.microsofttranslator.com/translate';
const MS_LOTTO = { testi: 100, caratteri: 10000 };      // per richiesta: ben sotto i limiti di Microsoft (1000 testi, 50.000 caratteri)
function makeTraduci({ env, fetch }) {
  env = env || process.env;
  const TIMEOUT_MS = Number(env.DEEPL_TIMEOUT_MS) > 0 ? Number(env.DEEPL_TIMEOUT_MS) : 6000;      // DEEPL_TIMEOUT_MS solo per le prove
  const MS_TIMEOUT_MS = Number(env.AZURE_TRANSLATOR_TIMEOUT_MS) > 0 ? Number(env.AZURE_TRANSLATOR_TIMEOUT_MS) : 6000;      // solo per le prove
  const key = () => String(env.DEEPL_API_KEY || '').trim();
  const msKey = () => String(env.AZURE_TRANSLATOR_KEY || '').trim();
  const msRegione = () => String(env.AZURE_TRANSLATOR_REGION || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const attiva = () => !!key() || !!msKey();
  const nome = () => key() ? 'DeepL' : msKey() ? 'Microsoft' : '';
  const url = () => (/:fx$/.test(key()) ? 'https://api-free.deepl.com' : 'https://api.deepl.com') + '/v2/translate';
  const supportata = l => !!LINGUE[String(l || '').toLowerCase()];
  // testi: array di stringhe; verso: codice breve (it, en, de…); da: lingua di partenza se nota (altrimenti la riconosce DeepL);
  // xml: le parti tra <x>…</x> non si traducono (variabili dei template). Ritorna { ok, testi, lingue (rilevate, codice breve) }.
  async function traduci(testi, verso, { da, xml } = {}) {
    const target = LINGUE[String(verso || '').toLowerCase()];
    if (!attiva() || !target || !Array.isArray(testi) || !testi.length) return { ok: false };
    if (!key()) return traduciMS(testi, String(verso).toLowerCase(), { da, xml });
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
  // Microsoft Translator (API v3): stessi ingressi e stesse uscite di DeepL. Le parti protette <x>…</x> diventano
  // <span class="notranslate">…</span> (testo in formato HTML) e tornano <x>…</x> nella risposta. Le conversazioni lunghe vanno a lotti;
  // se un lotto non riesce non si salva niente (come con DeepL).
  async function traduciMS(testi, verso, { da, xml } = {}) {
    const q = 'api-version=3.0&to=' + encodeURIComponent(LINGUE_MS[verso] || verso) + (da && LINGUE[da] ? '&from=' + encodeURIComponent(LINGUE_MS[da] || da) : '') + (xml ? '&textType=html' : '');
    const headers = { 'Ocp-Apim-Subscription-Key': msKey(), 'Content-Type': 'application/json' };
    if (msRegione()) headers['Ocp-Apim-Subscription-Region'] = msRegione();
    const dentro = testi.map(s => { s = String(s == null ? '' : s).slice(0, 5000); return xml ? s.replace(/<x>/g, '<span class="notranslate">').replace(/<\/x>/g, '</span>') : s; });
    const lotti = [[]]; let car = 0;
    for (const s of dentro) {
      const l = lotti[lotti.length - 1];
      if (l.length && (l.length >= MS_LOTTO.testi || car + s.length > MS_LOTTO.caratteri)) { lotti.push([s]); car = s.length; } else { l.push(s); car += s.length; }
    }
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), MS_TIMEOUT_MS);
    try {
      const out = [];
      for (const l of lotti) {
        const r = await fetch(MS_URL + '?' + q, { method: 'POST', headers, body: JSON.stringify(l.map(t => ({ Text: t }))), signal: ctl.signal });
        if (!r.ok) return { ok: false, http: r.status };
        const j = await r.json();
        if (!Array.isArray(j) || j.length !== l.length) return { ok: false };
        out.push(...j);
      }
      const fuori = t => xml ? t.replace(/<span\s+class\s*=\s*["']?notranslate["']?\s*>/gi, '<x>').replace(/<\/span\s*>/gi, '</x>') : t;
      return {
        ok: true,
        testi: out.map(x => fuori(String(x && Array.isArray(x.translations) && x.translations[0] && x.translations[0].text || ''))),
        lingue: out.map(x => String(x && x.detectedLanguage && x.detectedLanguage.language || da || '').slice(0, 2).toLowerCase())
      };
    } catch (e) { return { ok: false }; }
    finally { clearTimeout(timer); }
  }
  return { traduci, attiva, supportata, nome };
}

module.exports = { makeTraduci, LINGUE };
