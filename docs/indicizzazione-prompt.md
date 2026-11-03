# Prompt pronto: indicizzazione del sito

Quando vuoi che il sito compaia su Google, copia il testo qui sotto in una nuova sessione.

---

Voglio che il sito La Columbera venga indicizzato dai motori di ricerca. Segui le regole di `CLAUDE.md`.

**Prima di toccare qualsiasi file, chiedimi:**

1. Il sito usa un **dominio personalizzato** (ad esempio `lacolumbera.it`) oppure è sempre `https://la-columbera.vercel.app`? Se è un dominio nuovo, chiedimi anche:
   - se la versione principale è con o senza `www`;
   - se il dominio è già collegato in Vercel → Settings → Domains.
2. Come verificherò la proprietà in Google Search Console?
   - Con un record DNS (solo con un dominio mio): nel repository non serve niente.
   - Con un meta tag `google-site-verification`: chiedimi il codice da inserire nella home.
3. Voglio indicizzare anche Checkin? Il consiglio di partenza è di no, perché è un'area per ospiti già prenotati.

**Poi, solo con le risposte in mano:**

1. Esegui le prove di `CLAUDE.md` e annota la baseline.
2. Crea `robots.txt` nella cartella principale del sito:
   - permette tutto;
   - esclude `/admin.html`, `/prenota.html` e `/api/`;
   - riporta la riga `Sitemap:` con l'indirizzo completo.
3. Crea `sitemap.xml` con le sole pagine pubbliche: `index.html` (come `/`), `torre.html`, `corte.html`, `dintorni.html`, `mappa.html`, `eventi.html`, `recensioni.html`, `convenzioni.html` e `privacy.html`. Per `guest-card.html` e `area-clienti.html` chiedimi se includerle, perché servono a chi ha già prenotato.
4. Aggiungi `<link rel="canonical">` con il dominio scelto alle pagine della sitemap. Su `privacy.html` correggi quello che c'è già (oggi punta a `la-columbera.vercel.app`).
   - **Attenzione:** la prova S2 di `tests/sim/sito.js` oggi vieta il canonico su `eventi.html`, perché un tempo quella pagina reindirizzava altrove. Il divieto va cambiato in «il canonico, se c'è, punta a se stessa», motivando la modifica nel commit; la prova non va indebolita.
5. Lascia `noindex` dove già c'è (`admin.html`, `prenota.html`) e non togliere le intestazioni di `vercel.json`. Se `vercel.json` richiede modifiche (per esempio per servire `robots.txt` e `sitemap.xml`), descrivile prima di farle.
6. Aggiungi una prova in `tests/sim/sito.js` che controlli:
   - `robots.txt` esiste e blocca le pagine riservate;
   - la sitemap elenca solo pagine esistenti e non quelle con `noindex`;
   - i canonici usano lo stesso dominio della sitemap.
   Aggiorna la baseline in `CLAUDE.md` nello stesso commit.
7. Fai commit e push sul branch indicato, senza fare deploy in produzione.
8. Alla fine dammi i passi da fare io, ciascuno con l'indirizzo esatto:
   - Search Console: aggiungere il sito, verificarlo, inviare la sitemap e chiedere l'indicizzazione di home, Torre e Corte;
   - Bing Webmaster Tools, importando da Search Console;
   - aggiornare il sito nella scheda Google Business Profile.
