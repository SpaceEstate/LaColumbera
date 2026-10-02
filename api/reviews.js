// Recensioni La Columbera.
//  - Google: DINAMICHE (Places API New). Cache su KV per 6 ore: se Google non risponde si serve l'ultima copia buona.
//  - Booking: curate a mano in data/reviews-booking.json (Booking non ha un'API pubblica per le recensioni).
// Variabili Vercel: GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID (formato "ChIJ..."). Facoltativa: REVIEWS_TTL_ORE (default 6).
// Apri /api/reviews nel browser: il campo "status" dice se i dati sono live, in cache o se qualcosa non va.
// Con ?all=1 (pagina recensioni.html) restituisce tutte le recensioni che Google mette a disposizione, senza filtri.
const x = require('./x.js'); // riusa il client KV già configurato (KV_REST_API_URL / UPSTASH_*)

const KEY = 'google:reviews:v2';
const TTL = (+process.env.REVIEWS_TTL_ORE || 6) * 3600e3;

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => s.length > n ? s.slice(0, s.lastIndexOf(' ', n) > 0 ? s.lastIndexOf(' ', n) : n) + '…' : s;
const ts = s => Date.parse(s) || 0;

const cacheGet = async () => { try { return JSON.parse(await x.kv('GET', KEY) || 'null'); } catch (e) { return null; } };
const cacheSet = async v => { try { await x.kv('SET', KEY, JSON.stringify(v)); } catch (e) {} };

// Chiamata a Google. Ritorna {data} oppure {err} con un codice leggibile (mai la chiave).
async function fetchGoogle() {
  const key = process.env.GOOGLE_PLACES_API_KEY, id = process.env.GOOGLE_PLACE_ID;
  if (!key || !id) return { err: 'non_configurato' };
  try {
    const r = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(id) + '?languageCode=it', {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return { err: 'http_' + r.status };
    const j = await r.json();
    return {
      data: {
        rating: j.rating || null,
        count: j.userRatingCount || 0,
        url: j.googleMapsUri || '',
        reviews: (j.reviews || []).map(v => ({
          author: clean(v.authorAttribution && v.authorAttribution.displayName) || 'Ospite',
          authorUri: (v.authorAttribution && v.authorAttribution.uri) || '',
          rating: v.rating || 0,
          // testo ORIGINALE dell'ospite: "text" è tradotto in italiano da Google se la recensione è in un'altra lingua
          text: clean((v.originalText && v.originalText.text) || (v.text && v.text.text)),
          when: v.relativePublishTimeDescription || '',
          publishTime: v.publishTime || '',
          url: v.googleMapsUri || ''
        })).filter(v => v.text)
      }
    };
  } catch (e) { return { err: 'rete' }; }
}

async function getGoogle() {
  const c = await cacheGet(), age = c && c.fetchedAt ? Date.now() - c.fetchedAt : Infinity;
  if (c && c.data && age < TTL) return { data: c.data, status: 'cache', at: c.fetchedAt };
  const f = await fetchGoogle();
  if (f.data) { const at = Date.now(); await cacheSet({ fetchedAt: at, data: f.data }); return { data: f.data, status: 'live', at }; }
  if (c && c.data) return { data: c.data, status: 'copia_precedente', at: c.fetchedAt, err: f.err };
  return { data: null, status: f.err };
}

// Pagine appartamento: solo le recensioni da 4★ in su e con un po' di testo, le più recenti, accorciate.
// ?all=1: tutte quelle che Google restituisce (max 5), testo completo.
function pick(g, all) {
  if (!g) return null;
  const rv = g.reviews.slice().sort((a, b) => ts(b.publishTime) - ts(a.publishTime));
  const reviews = all ? rv : rv.filter(v => v.rating >= 4 && v.text.length >= 40).slice(0, 4).map(v => ({ ...v, text: clip(v.text, 320) }));
  return { rating: g.rating, count: g.count, url: g.url, reviews };
}

function booking() {
  try {
    // require statico: Vercel include sicuramente il file nella funzione (con fs.readFileSync non è garantito)
    const j = JSON.parse(JSON.stringify(require('../data/reviews-booking.json')));
    j.reviews = (j.reviews || []).filter(v => v && v.text && v.author).slice(0, 6);
    return { data: j, status: (j.score || j.reviews.length) ? 'ok' : 'vuoto' };
  } catch (e) { return { data: null, status: 'file_non_leggibile' }; }
}

module.exports = async (req, res) => {
  const all = !!(req.query && req.query.all === '1');
  const g = await getGoogle(), b = booking();
  // niente cache sul CDN quando Google non ha dato nulla (prima un errore restava in cache 6 ore)
  res.setHeader('Cache-Control', g.status === 'live' || g.status === 'cache' ? 'public, s-maxage=1800, stale-while-revalidate=86400'
    : g.data ? 'public, s-maxage=300' : 'no-store');
  res.json({
    google: pick(g.data, all),
    booking: b.data,
    status: { google: g.status, googleErrore: g.err || null, aggiornatoIl: g.at ? new Date(g.at).toISOString() : null, booking: b.status }
  });
};
