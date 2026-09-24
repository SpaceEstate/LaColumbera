// Recensioni La Columbera: Google (dinamiche via Places API) + Booking (curate a mano in data/reviews-booking.json).
// Variabili Vercel: GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID (formato "ChIJ...").
const fs = require('fs'), path = require('path');

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => s.length > n ? s.slice(0, s.lastIndexOf(' ', n) > 0 ? s.lastIndexOf(' ', n) : n) + '…' : s;

async function google() {
  const key = process.env.GOOGLE_PLACES_API_KEY, id = process.env.GOOGLE_PLACE_ID;
  if (!key || !id) return null;
  try {
    const r = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(id) + '?languageCode=it', {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'rating,userRatingCount,googleMapsUri,reviews'
      }
    });
    if (!r.ok) return null;
    const j = await r.json();
    const reviews = (j.reviews || [])
      .filter(v => v.rating >= 4 && clean(v.text && v.text.text).length >= 40)
      .sort((a, b) => Date.parse(b.publishTime) - Date.parse(a.publishTime))
      .slice(0, 4)
      .map(v => ({
        author: clean(v.authorAttribution && v.authorAttribution.displayName) || 'Ospite',
        rating: v.rating,
        text: clip(clean(v.text.text), 320),
        when: v.relativePublishTimeDescription || '',
        url: (v.authorAttribution && v.authorAttribution.uri) || j.googleMapsUri || ''
      }));
    return { rating: j.rating || null, count: j.userRatingCount || 0, url: j.googleMapsUri || '', reviews };
  } catch (e) { return null; }
}

function booking() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'reviews-booking.json'), 'utf8'));
    j.reviews = (j.reviews || []).filter(v => v && v.text && v.author).slice(0, 6);
    return j;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400'); // aggiorna ogni 6 ore
  const [g, b] = await Promise.all([google(), Promise.resolve(booking())]);
  res.json({ google: g, booking: b });
};
