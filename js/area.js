// La Columbera · Area clienti (area-clienti.html): la prenotazione dell'ospite, come un'app.
// Si entra con il codice di prenotazione (o con il link della mail): il server risponde con il soggiorno già ridotto a ciò che serve (a=mie → soggiorno).
// Sezioni: Il soggiorno (riepilogo, azioni, pagamento) · Info utili (arrivo, orari, informazioni della casa, Wi-Fi) · Dintorni (eventi nelle date del soggiorno).
// Interfaccia in italiano, inglese e tedesco: la lingua del browser, oppure quella scelta (resta solo per questa scheda).
// Gli strumenti condivisi (accesso con codice e token, chiamate al server) arrivano da js/pages.js (window.LCP), che va caricato prima.
(function(){
'use strict';
const P=window.LCP;
if(!P)return;
const {esc,api,get,mdLite,accSet,accDel,accFromHash,accGet,accBody,fmtCode,codeIn}=P;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const TEL='+39 351 704 3594',TEL_H='+393517043594',MAIL='lacolumbera@gmail.com';
const INDIRIZZO='Via Centrale 48, 38123 Ravina (Trento)',PARCHEGGIO='Via Val Gola 22, 38123 Ravina (Trento)';
const CHECKIN_URL='https://spaceestate.github.io/Checkin/index.html',REVIEW_URL='https://search.google.com/local/writereview?placeid=ChIJmXdr3vNzgkcR3O0jehZOocQ';
const mapsQ=q=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
const mapsDir=q=>'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(q);
const ss=(k,v)=>{try{if(v===undefined)return sessionStorage.getItem(k);if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v)}catch{return null}};

/* ---------------- lingua ---------------- */
const LANGS=['it','en','de'],LOC={it:'it-IT',en:'en-GB',de:'de-DE'};
const n2=(n,a,b)=>n+' '+(+n===1?a:b);
const L={
 it:{eyebrow:'Area ospiti',titolo:'La tua prenotazione',sub:'Inserisci il codice di prenotazione: lo trovi nella email di conferma se hai prenotato sul nostro sito, altrimenti è il numero di prenotazione di Booking.com o Airbnb.',
  etCodice:'Codice di prenotazione',entra:'Entra',cerco:'Cerco…',privacy:'Il codice vale come una chiave della tua prenotazione: non condividerlo con chi non soggiorna con te. Lo usiamo solo per mostrarti la prenotazione e i servizi collegati.',informativa:'Informativa privacy',lingua:'Lingua',
  err404:'Prenotazione non trovata. Controlla il codice: è quello della mail di conferma oppure il numero di prenotazione di Booking.com o Airbnb.',err429:'Troppi tentativi. Riprova tra qualche minuto (se hai prenotato sul sito puoi anche aprire il link della mail di conferma).',errRete:'Servizio non raggiungibile: controlla la connessione e riprova.',
  esci:'Esci',tabSoggiorno:'Il soggiorno',tabInfo:'Info utili',tabDintorni:'Dintorni',tabMessaggi:'Messaggi',tabs:'Sezioni dell\'area ospiti',
  prima:n=>n===1?'Arrivi domani':'Arrivi tra '+n+' giorni',oggiArrivo:'Benvenuto! Arrivi oggi',durante:'Buon soggiorno!',oggiPartenza:'Oggi è il giorno della partenza: buon viaggio!',dopo:'Grazie per aver soggiornato alla Columbera',
  checkin:'Check-in',checkout:'Check-out',notti:'Notti',ospiti:'Ospiti',nNotti:n=>n2(n,'notte','notti'),nOspiti:n=>n2(n,'ospite','ospiti'),dalle:h=>'dalle '+h,entro:h=>'entro le '+h,copia:'Copia codice',copiato:'Copiato ✓',confermata:'Confermata',
  aCheckin:'Check-in online',aCheckinD:'Registra gli ospiti prima di arrivare',aGc:'Trentino Guest Card',aGcD:'Musei, trasporti e attrazioni',aCal:'Aggiungi al calendario',aCalD:'Date e orari del soggiorno',aStrada:'Indicazioni stradali',aChiama:'Chiama',aWa:'WhatsApp',aMail:'Email',aRec:'Lascia una recensione',aRecD:'Ci aiuti molto',
  pagTit:'Pagamento',pagTot:'Totale',pagNotti:(n,p)=>n2(n,'notte','notti')+' × '+p,pagDal:d=>'dal '+d,pagSup:(n,p)=>'Ospiti in più · '+n2(n,'notte','notti')+' × '+p,pagPagato:d=>'Pagato online con carta'+(d?' il '+d:''),
  pagPortale:p=>'Hai prenotato tramite '+p+': pagamenti e ricevute sono gestiti dalla piattaforma.',pagAltro:'Per pagamenti e ricevute scrivici.',pagImposta:'L\'imposta di soggiorno si paga con il check-in online.',
  arrivo:'Come arrivare',parcheggio:'Parcheggio',parcheggioD:'Il parcheggio della struttura è in Via Val Gola 22, a 50 metri.',apriMaps:'Apri in Maps',trovarci:'Come trovarci',chiavi:'Le istruzioni per entrare (codici della cassetta delle chiavi) arrivano via email dopo il check-in online.',
  orari:'Orari',casa:'La casa',riservate:'Wi-Fi e informazioni riservate',riservateDal:d=>'Le trovi qui dal '+d+'.',testiIt:'',contatti:'Contatti',
  eventi:'Eventi durante il tuo soggiorno',nessunEvento:'Nessun evento in calendario per le tue date.',tuttiEventi:'Tutti gli eventi',caricoEventi:'Carico gli eventi…',
  luoghi:'Luoghi di interesse',luoghiD:'Trento, laghi, castelli e montagna',conv:'Convenzioni',convD:'Vantaggi per gli ospiti',trovarciD:'Auto, autobus e parcheggio',tutti:'Eventi a Trento',tuttiD:'Il calendario completo',
  installa:'Aggiungi alla schermata Home',installaD:'Ritrovi l\'area ospiti come un\'app: per entrare basta il codice.',installaIos:'Su iPhone o iPad tocca Condividi e poi «Aggiungi alla schermata Home».',installaBtn:'Installa',chiudi:'Chiudi',
  calTitolo:a=>'Soggiorno a La Columbera · '+a,calArea:'Area ospiti',
  chatNota:'Scrivici qui per qualsiasi domanda sul soggiorno: ti rispondiamo appena possibile. Per le urgenze chiamaci al +39 351 704 3594.',chatNotaEmail:'Scrivici qui per qualsiasi domanda sul soggiorno: ti rispondiamo appena possibile e la risposta ti arriva anche via email. Per le urgenze chiamaci al +39 351 704 3594.',chatVuota:'Nessun messaggio per ora: scrivici quando vuoi.',
  scrivi:'Il tuo messaggio',scriviPh:'Scrivi qui…',invia:'Invia',invio:'Invio…',tu:'Tu',noi:'La Columbera',originale:'Mostra originale',tradotto:'Tradotto automaticamente',errInvio:'Messaggio non inviato: controlla la connessione e riprova.',troppiMsg:'Hai scritto molti messaggi in poco tempo: riprova tra qualche minuto.',caratteri:n=>n+' caratteri rimasti',
  annTit:'Annullamento',annOk:(d,i)=>'Puoi annullare gratis fino a '+d+' (7 giorni prima dell\'arrivo): ti rimborsiamo '+i+' sulla carta con cui hai pagato.',annBtn:'Annulla la prenotazione',
  annConf:i=>'Vuoi davvero annullare? La prenotazione non si potrà recuperare e le notti tornano disponibili. Ti rimborsiamo '+i+'.',annSi:'Sì, annulla e rimborsa',annNo:'No, la tengo',annInCorso:'Annullo…',
  annScaduto:d=>'Si annulla gratis fino a 7 giorni prima dell\'arrivo (fino a '+d+'): ora la prenotazione non è più rimborsabile. Per qualsiasi necessità scrivici.',annNonPagata:'Per annullare questa prenotazione scrivici.',
  annPortale:p=>'Hai prenotato tramite '+p+': per annullare usa la piattaforma.',annFatto:'Prenotazione annullata',annFattoD:(i,e)=>'Il rimborso di '+i+' è partito: torna sulla carta con cui hai pagato, di solito in 5–10 giorni lavorativi.'+(e?' Ti abbiamo mandato un\'email a '+e+'.':''),
  annGia:'La prenotazione è annullata e il pagamento risulta già rimborsato.',annErr:'Annullamento non riuscito: controlla la connessione e riprova.',annHome:'Torna al sito',
  ricTit:'Ricevuta',ricD:'Ti serve la ricevuta del soggiorno? Chiedila qui: la prepariamo e te la mandiamo via email.',ricBtn:'Richiedi la ricevuta',ricNome:'Intestata a (nome e cognome o ragione sociale)',
  ricCf:'Codice fiscale',ricCfEst:'Codice fiscale (se risiedi in Italia) o numero fiscale',ricInd:'Indirizzo (via e numero)',ricCap:'CAP',ricCitta:'Città',ricPaese:'Paese',ricPaeseDef:'Italia',
  ricEmailPren:e=>'facoltativa: se la lasci vuota te la mandiamo a '+e,ricEmailAlt:'Email',ricEmail:'Email a cui mandarla',ricNota:'Nota (facoltativa)',ricInvia:'Invia la richiesta',ricInvio:'Invio…',
  ricPriv:'Usiamo questi dati solo per preparare la ricevuta.',ricRichiesta:(d,e)=>'Richiesta inviata il '+d+': prepariamo la ricevuta e te la mandiamo'+(e?' a '+e:'')+'.',ricCorreggi:'Correggi i dati',
  ricInviata:(d,e)=>'Ricevuta inviata il '+d+(e?' a '+e:'')+'. Non la trovi? Guarda nello spam o scrivici.',ricCompila:'Compila i campi con l\'asterisco.',ricEmailNo:'L\'email non sembra giusta: controllala.',
  ricControlla:'Controlla i dati inseriti.',ricErr:'Richiesta non inviata: controlla la connessione e riprova.',obbl:'obbligatorio'},
 en:{eyebrow:'Guest area',titolo:'Your booking',sub:'Enter your booking code: you will find it in the confirmation email if you booked on our website, otherwise it is your Booking.com or Airbnb reservation number.',
  etCodice:'Booking code',entra:'Open',cerco:'Searching…',privacy:'Your booking code works like a key: do not share it with anyone who is not staying with you. We only use it to show you your booking and the related services.',informativa:'Privacy notice',lingua:'Language',
  err404:'Booking not found. Check the code: it is the one in the confirmation email or your Booking.com or Airbnb reservation number.',err429:'Too many attempts. Please try again in a few minutes (if you booked on our website you can also open the link in the confirmation email).',errRete:'Service unavailable: check your connection and try again.',
  esci:'Log out',tabSoggiorno:'Your stay',tabInfo:'Useful info',tabDintorni:'Nearby',tabMessaggi:'Messages',tabs:'Guest area sections',
  prima:n=>n===1?'You arrive tomorrow':'You arrive in '+n+' days',oggiArrivo:'Welcome! You arrive today',durante:'Enjoy your stay!',oggiPartenza:'Today is your departure day: have a safe trip!',dopo:'Thank you for staying at La Columbera',
  checkin:'Check-in',checkout:'Check-out',notti:'Nights',ospiti:'Guests',nNotti:n=>n2(n,'night','nights'),nOspiti:n=>n2(n,'guest','guests'),dalle:h=>'from '+h,entro:h=>'by '+h,copia:'Copy code',copiato:'Copied ✓',confermata:'Confirmed',
  aCheckin:'Online check-in',aCheckinD:'Register your guests before you arrive',aGc:'Trentino Guest Card',aGcD:'Museums, transport and attractions',aCal:'Add to calendar',aCalD:'Dates and times of your stay',aStrada:'Directions',aChiama:'Call',aWa:'WhatsApp',aMail:'Email',aRec:'Leave a review',aRecD:'It helps us a lot',
  pagTit:'Payment',pagTot:'Total',pagNotti:(n,p)=>n2(n,'night','nights')+' × '+p,pagDal:d=>'from '+d,pagSup:(n,p)=>'Extra guests · '+n2(n,'night','nights')+' × '+p,pagPagato:d=>'Paid online by card'+(d?' on '+d:''),
  pagPortale:p=>'You booked through '+p+': payments and receipts are handled by the platform.',pagAltro:'For payments and receipts, write to us.',pagImposta:'The tourist tax is paid during online check-in.',
  arrivo:'Getting here',parcheggio:'Parking',parcheggioD:'Our parking is at Via Val Gola 22, 50 metres away.',apriMaps:'Open in Maps',trovarci:'How to find us',chiavi:'The instructions to get in (key box codes) are sent by email after online check-in.',
  orari:'Times',casa:'The house',riservate:'Wi-Fi and private information',riservateDal:d=>'You will find it here from '+d+'.',testiIt:'Written in Italian by your hosts.',contatti:'Contact',
  eventi:'Events during your stay',nessunEvento:'No events scheduled for your dates.',tuttiEventi:'All events',caricoEventi:'Loading events…',
  luoghi:'Places to visit',luoghiD:'Trento, lakes, castles and mountains',conv:'Partner offers',convD:'Perks for our guests',trovarciD:'Car, bus and parking',tutti:'Events in Trento',tuttiD:'The full calendar',
  installa:'Add to Home Screen',installaD:'Find your guest area like an app: your code is all you need to open it.',installaIos:'On iPhone or iPad tap Share, then "Add to Home Screen".',installaBtn:'Install',chiudi:'Close',
  calTitolo:a=>'Stay at La Columbera · '+a,calArea:'Guest area',
  chatNota:'Write to us here with any question about your stay: we will reply as soon as possible. For anything urgent call +39 351 704 3594.',chatNotaEmail:'Write to us here with any question about your stay: we will reply as soon as possible and you will also get our answer by email. For anything urgent call +39 351 704 3594.',chatVuota:'No messages yet: write to us whenever you like.',
  scrivi:'Your message',scriviPh:'Write here…',invia:'Send',invio:'Sending…',tu:'You',noi:'La Columbera',originale:'Show original',tradotto:'Automatically translated',errInvio:'Message not sent: check your connection and try again.',troppiMsg:'You have sent many messages in a short time: please try again in a few minutes.',caratteri:n=>n+' characters left',
  annTit:'Cancellation',annOk:(d,i)=>'You can cancel free of charge until '+d+' (7 days before arrival): we refund '+i+' to the card you paid with.',annBtn:'Cancel the booking',
  annConf:i=>'Do you really want to cancel? The booking cannot be restored and the nights become available again. We will refund '+i+'.',annSi:'Yes, cancel and refund',annNo:'No, keep it',annInCorso:'Cancelling…',
  annScaduto:d=>'Free cancellation is possible up to 7 days before arrival (until '+d+'): the booking is no longer refundable. If you need anything, write to us.',annNonPagata:'To cancel this booking, write to us.',
  annPortale:p=>'You booked through '+p+': to cancel, use the platform.',annFatto:'Booking cancelled',annFattoD:(i,e)=>'The refund of '+i+' is on its way back to the card you paid with: it usually arrives within 5–10 business days.'+(e?' We have sent you an email at '+e+'.':''),
  annGia:'The booking is cancelled and the payment has already been refunded.',annErr:'Cancellation failed: check your connection and try again.',annHome:'Back to the website',
  ricTit:'Receipt',ricD:'Need a receipt for your stay? Request it here: we will prepare it and email it to you.',ricBtn:'Request a receipt',ricNome:'Issued to (full name or company name)',
  ricCf:'Italian tax code (codice fiscale)',ricCfEst:'Italian tax code (if resident in Italy) or tax number',ricInd:'Address (street and number)',ricCap:'Postcode',ricCitta:'City',ricPaese:'Country',ricPaeseDef:'',
  ricEmailPren:e=>'optional: if you leave it empty we send it to '+e,ricEmailAlt:'Email',ricEmail:'Email address to send it to',ricNota:'Note (optional)',ricInvia:'Send request',ricInvio:'Sending…',
  ricPriv:'We only use these details to prepare your receipt.',ricRichiesta:(d,e)=>'Request sent on '+d+': we will prepare your receipt and send it'+(e?' to '+e:'')+'.',ricCorreggi:'Correct the details',
  ricInviata:(d,e)=>'Receipt sent on '+d+(e?' to '+e:'')+'. Can\'t find it? Check your spam folder or write to us.',ricCompila:'Please fill in the fields marked with an asterisk.',ricEmailNo:'The email address does not look right: please check it.',
  ricControlla:'Please check the details you entered (tax code, postcode).',ricErr:'Request not sent: check your connection and try again.',obbl:'required'},
 de:{eyebrow:'Gästebereich',titolo:'Ihre Buchung',sub:'Geben Sie Ihren Buchungscode ein: Sie finden ihn in der Bestätigungs-E-Mail, wenn Sie auf unserer Website gebucht haben, ansonsten ist es Ihre Buchungsnummer von Booking.com oder Airbnb.',
  etCodice:'Buchungscode',entra:'Öffnen',cerco:'Suche…',privacy:'Der Buchungscode funktioniert wie ein Schlüssel: Geben Sie ihn nicht an Personen weiter, die nicht mit Ihnen übernachten. Wir verwenden ihn nur, um Ihnen Ihre Buchung und die zugehörigen Dienste anzuzeigen.',informativa:'Datenschutzhinweis',lingua:'Sprache',
  err404:'Buchung nicht gefunden. Prüfen Sie den Code: Es ist der aus der Bestätigungs-E-Mail oder Ihre Buchungsnummer von Booking.com oder Airbnb.',err429:'Zu viele Versuche. Bitte versuchen Sie es in einigen Minuten erneut (wenn Sie auf unserer Website gebucht haben, können Sie auch den Link in der Bestätigungs-E-Mail öffnen).',errRete:'Dienst nicht erreichbar: Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
  esci:'Abmelden',tabSoggiorno:'Ihr Aufenthalt',tabInfo:'Nützliche Infos',tabDintorni:'Umgebung',tabMessaggi:'Nachrichten',tabs:'Bereiche des Gästebereichs',
  prima:n=>n===1?'Sie reisen morgen an':'Sie reisen in '+n+' Tagen an',oggiArrivo:'Willkommen! Sie reisen heute an',durante:'Schönen Aufenthalt!',oggiPartenza:'Heute ist Ihr Abreisetag: Gute Reise!',dopo:'Danke für Ihren Aufenthalt in La Columbera',
  checkin:'Check-in',checkout:'Check-out',notti:'Nächte',ospiti:'Gäste',nNotti:n=>n2(n,'Nacht','Nächte'),nOspiti:n=>n2(n,'Gast','Gäste'),dalle:h=>'ab '+h+' Uhr',entro:h=>'bis '+h+' Uhr',copia:'Code kopieren',copiato:'Kopiert ✓',confermata:'Bestätigt',
  aCheckin:'Online-Check-in',aCheckinD:'Gäste vor der Anreise registrieren',aGc:'Trentino Guest Card',aGcD:'Museen, Verkehrsmittel und Attraktionen',aCal:'Zum Kalender hinzufügen',aCalD:'Daten und Zeiten Ihres Aufenthalts',aStrada:'Wegbeschreibung',aChiama:'Anrufen',aWa:'WhatsApp',aMail:'E-Mail',aRec:'Bewertung schreiben',aRecD:'Das hilft uns sehr',
  pagTit:'Zahlung',pagTot:'Gesamt',pagNotti:(n,p)=>n2(n,'Nacht','Nächte')+' × '+p,pagDal:d=>'ab '+d,pagSup:(n,p)=>'Zusätzliche Gäste · '+n2(n,'Nacht','Nächte')+' × '+p,pagPagato:d=>'Online per Karte bezahlt'+(d?' am '+d:''),
  pagPortale:p=>'Sie haben über '+p+' gebucht: Zahlungen und Belege laufen über die Plattform.',pagAltro:'Für Zahlungen und Belege schreiben Sie uns.',pagImposta:'Die Kurtaxe wird beim Online-Check-in bezahlt.',
  arrivo:'Anreise',parcheggio:'Parkplatz',parcheggioD:'Unser Parkplatz befindet sich in der Via Val Gola 22, 50 Meter entfernt.',apriMaps:'In Maps öffnen',trovarci:'Anfahrt',chiavi:'Die Anweisungen zum Einlass (Codes des Schlüsselkastens) erhalten Sie nach dem Online-Check-in per E-Mail.',
  orari:'Zeiten',casa:'Das Haus',riservate:'WLAN und vertrauliche Informationen',riservateDal:d=>'Sie finden sie hier ab dem '+d+'.',testiIt:'Von Ihren Gastgebern auf Italienisch verfasst.',contatti:'Kontakt',
  eventi:'Veranstaltungen während Ihres Aufenthalts',nessunEvento:'Für Ihre Daten sind keine Veranstaltungen geplant.',tuttiEventi:'Alle Veranstaltungen',caricoEventi:'Veranstaltungen werden geladen…',
  luoghi:'Sehenswürdigkeiten',luoghiD:'Trient, Seen, Burgen und Berge',conv:'Partnerangebote',convD:'Vorteile für unsere Gäste',trovarciD:'Auto, Bus und Parkplatz',tutti:'Veranstaltungen in Trient',tuttiD:'Der ganze Kalender',
  installa:'Zum Home-Bildschirm hinzufügen',installaD:'Ihr Gästebereich wie eine App: Zum Öffnen brauchen Sie nur Ihren Code.',installaIos:'Auf iPhone oder iPad auf Teilen tippen und dann „Zum Home-Bildschirm“.',installaBtn:'Installieren',chiudi:'Schließen',
  calTitolo:a=>'Aufenthalt in La Columbera · '+a,calArea:'Gästebereich',
  chatNota:'Schreiben Sie uns hier zu allen Fragen rund um Ihren Aufenthalt: Wir antworten so schnell wie möglich. In dringenden Fällen rufen Sie +39 351 704 3594 an.',chatNotaEmail:'Schreiben Sie uns hier zu allen Fragen rund um Ihren Aufenthalt: Wir antworten so schnell wie möglich, und unsere Antwort erhalten Sie auch per E-Mail. In dringenden Fällen rufen Sie +39 351 704 3594 an.',chatVuota:'Noch keine Nachrichten: Schreiben Sie uns, wann immer Sie möchten.',
  scrivi:'Ihre Nachricht',scriviPh:'Hier schreiben…',invia:'Senden',invio:'Wird gesendet…',tu:'Sie',noi:'La Columbera',originale:'Original anzeigen',tradotto:'Automatisch übersetzt',errInvio:'Nachricht nicht gesendet: Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',troppiMsg:'Sie haben in kurzer Zeit viele Nachrichten gesendet: Bitte versuchen Sie es in einigen Minuten erneut.',caratteri:n=>'noch '+n+' Zeichen',
  annTit:'Stornierung',annOk:(d,i)=>'Sie können bis zum '+d+' (7 Tage vor der Anreise) kostenlos stornieren: Wir erstatten '+i+' auf die Karte, mit der Sie bezahlt haben.',annBtn:'Buchung stornieren',
  annConf:i=>'Möchten Sie wirklich stornieren? Die Buchung kann nicht wiederhergestellt werden, und die Nächte werden wieder frei. Wir erstatten '+i+'.',annSi:'Ja, stornieren und erstatten',annNo:'Nein, behalten',annInCorso:'Wird storniert…',
  annScaduto:d=>'Eine kostenlose Stornierung ist bis 7 Tage vor der Anreise möglich (bis zum '+d+'): Die Buchung ist nicht mehr erstattungsfähig. Wenn Sie etwas brauchen, schreiben Sie uns.',annNonPagata:'Um diese Buchung zu stornieren, schreiben Sie uns.',
  annPortale:p=>'Sie haben über '+p+' gebucht: Zum Stornieren nutzen Sie die Plattform.',annFatto:'Buchung storniert',annFattoD:(i,e)=>'Die Erstattung von '+i+' geht auf die Karte zurück, mit der Sie bezahlt haben: in der Regel innerhalb von 5–10 Werktagen.'+(e?' Wir haben Ihnen eine E-Mail an '+e+' gesendet.':''),
  annGia:'Die Buchung ist storniert und die Zahlung wurde bereits erstattet.',annErr:'Stornierung fehlgeschlagen: Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',annHome:'Zurück zur Website',
  ricTit:'Quittung',ricD:'Benötigen Sie eine Quittung für Ihren Aufenthalt? Fordern Sie sie hier an: Wir erstellen sie und senden sie Ihnen per E-Mail.',ricBtn:'Quittung anfordern',ricNome:'Ausgestellt auf (Vor- und Nachname oder Firmenname)',
  ricCf:'Italienische Steuernummer (Codice fiscale)',ricCfEst:'Italienische Steuernummer (bei Wohnsitz in Italien) oder Steuernummer',ricInd:'Adresse (Straße und Hausnummer)',ricCap:'PLZ',ricCitta:'Ort',ricPaese:'Land',ricPaeseDef:'',
  ricEmailPren:e=>'optional: leer lassen, dann senden wir sie an '+e,ricEmailAlt:'E-Mail',ricEmail:'E-Mail-Adresse für den Versand',ricNota:'Anmerkung (optional)',ricInvia:'Anfrage senden',ricInvio:'Wird gesendet…',
  ricPriv:'Wir verwenden diese Angaben nur für Ihre Quittung.',ricRichiesta:(d,e)=>'Anfrage am '+d+' gesendet: Wir erstellen Ihre Quittung und senden sie'+(e?' an '+e:'')+'.',ricCorreggi:'Angaben korrigieren',
  ricInviata:(d,e)=>'Quittung am '+d+(e?' an '+e:'')+' gesendet. Nicht gefunden? Prüfen Sie den Spam-Ordner oder schreiben Sie uns.',ricCompila:'Bitte füllen Sie die mit Sternchen markierten Felder aus.',ricEmailNo:'Die E-Mail-Adresse scheint nicht zu stimmen: Bitte prüfen Sie sie.',
  ricControlla:'Bitte prüfen Sie Ihre Angaben (Steuernummer, PLZ).',ricErr:'Anfrage nicht gesendet: Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',obbl:'Pflichtfeld'}
};
const pickL=l=>{l=String(l||'').slice(0,2).toLowerCase();return LANGS.includes(l)?l:''};
let lang=pickL(ss('lc_lang'))||(navigator.languages||[navigator.language]).map(pickL).find(Boolean)||'en';
const t=(k,...a)=>{const v=(L[lang]||L.it)[k],w=v===undefined?L.it[k]:v;return typeof w==='function'?w(...a):w};

/* ---------------- date e importi ---------------- */
const D=s=>new Date(s+'T12:00:00Z');
const fd=(s,o)=>{try{return D(s).toLocaleDateString(LOC[lang],Object.assign({timeZone:'UTC'},o))}catch{return s}};
const dLong=s=>fd(s,{weekday:'short',day:'numeric',month:'short',year:'numeric'}),dShort=s=>fd(s,{day:'numeric',month:'short'}),dDay=s=>fd(s,{weekday:'short',day:'numeric',month:'short'});
// stesso formato del resto del sito: €180, €1.250, €95,50
const eur=n=>{n=+n||0;try{return '€'+n.toLocaleString(LOC[lang],{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2})}catch{return '€'+n}};
// oggi a Trento (Europe/Rome), non nel fuso del telefono dell'ospite: è lì che si arriva e si parte
const today=()=>{try{const p={};for(const x of new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()))p[x.type]=x.value;return p.year+'-'+p.month+'-'+p.day}catch{return new Date().toISOString().slice(0,10)}};
const dd=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/864e5);
const short=n=>String(n||'').replace('La Columbera ','');
const countdown=s=>{const o=today();if(o<s.da){const n=dd(o,s.da);return t('prima',n)}if(o===s.da)return t('oggiArrivo');if(o<s.a)return t('durante');if(o===s.a)return t('oggiPartenza');return t('dopo')};

/* ---------------- icone (SVG in linea, nessun file esterno) ---------------- */
const IC={
 checkin:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
 card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
 cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 route:'<path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>',
 tel:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
 wa:'<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/>',
 mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
 star:'<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
 msg:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
 tag:'<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
 mount:'<path d="M3 20l6.5-11 4 6.5 2.5-4L21 20z"/>'
};
const icon=k=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IC[k]||''}</svg>`;

/* ---------------- calendario (.ics) ---------------- */
// Un evento per tutto il soggiorno, nel fuso di Trento. Nessun codice di prenotazione (il calendario può essere condiviso o finire nel cloud).
const icsOf=s=>{
 const d8=x=>x.replace(/-/g,''),hm=x=>x.replace(':','')+'00',nx=x=>{const d=new Date(x+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
 const ix=x=>String(x).replace(/\\/g,'\\\\').replace(/([,;])/g,'\\$1').replace(/\r?\n/g,'\\n');
 const h=s.orari||{},start=h.checkin?'DTSTART;TZID=Europe/Rome:'+d8(s.da)+'T'+hm(h.checkin):'DTSTART;VALUE=DATE:'+d8(s.da),end=h.checkout?'DTEND;TZID=Europe/Rome:'+d8(s.a)+'T'+hm(h.checkout):'DTEND;VALUE=DATE:'+d8(nx(s.a));
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,''),uid='soggiorno-'+d8(s.da)+'-'+Math.random().toString(36).slice(2,10)+'@lacolumbera';
 return['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//La Columbera//Area ospiti//IT','CALSCALE:GREGORIAN',
  'BEGIN:VTIMEZONE','TZID:Europe/Rome','BEGIN:DAYLIGHT','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT',
  'BEGIN:STANDARD','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD','END:VTIMEZONE',
  'BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+stamp,start,end,'SUMMARY:'+ix(t('calTitolo',short(s.apt&&s.apt.nome))),'LOCATION:'+ix(INDIRIZZO),
  'DESCRIPTION:'+ix(t('calArea')+': '+location.origin+location.pathname),'END:VEVENT','END:VCALENDAR',''].join('\r\n')};
const download=(name,text,type)=>{
 try{const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);return true}
 catch{return false}};

/* ---------------- copia negli appunti (con ripiego) ---------------- */
const copia=async v=>{
 try{await navigator.clipboard.writeText(v);return true}
 catch{try{const ta=document.createElement('textarea');ta.value=v;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return ok}catch{return false}}};

/* ---------------- testi della struttura (Gestione → Sito → Appartamenti → Testi → Area ospiti) ---------------- */
// "## Titolo" apre una scheda, le righe vuote separano i paragrafi, "- voce" fa un elenco (come i testi dell'appartamento)
const cards=(txt,title0)=>{const out=[];let cur=null;
 for(const b of mdLite(txt)){if(b.h){cur={h:b.h,body:''};out.push(cur);continue}
  if(!cur){cur={h:title0,body:''};out.push(cur)}
  cur.body+=b.p!==undefined?`<p class="ga-pre">${esc(b.p)}</p>`:`<ul>${b.li.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`}
 return out.filter(c=>c.body)};

/* ---------------- stato della pagina ---------------- */
let R=null,tab='soggiorno',evCache=null,deferredInstall=null;
// messaggi: v = versione già mostrata (il server dice solo «niente di nuovo» se non cambia), poll = controlli fatti dall'ultima attività
const MS={v:null,list:[],timer:null,poll:0,busy:false,err:''};
const MAX_TESTO=2000,POLL_MS=20000,POLL_MAX=30;      // un controllo ogni 20 secondi, solo con la scheda Messaggi aperta e la pagina in primo piano, al massimo 10 minuti senza toccare nulla
const sog=()=>{const r=R||{},s=r.soggiorno;if(s)return s;
 const x=(r.prenotazioni||[])[0]||{};return Object.assign({apt:{nome:x.id||''},orari:{},info:{},contatti:{},pagamento:null},x)};      // risposta di una versione precedente del server

/* ---------------- accesso ---------------- */
function i18nLogin(){
 document.documentElement.lang=lang;
 $$('[data-i18n]').forEach(el=>{const v=t(el.dataset.i18n);if(typeof v==='string')el.textContent=v});
 const cd=$('#cd');if(cd)cd.setAttribute('aria-describedby','ga-sub');
 paintLang('#ga-lang-login')}
const langSel=id=>`<div class="ga-lang" id="${id}" role="group" aria-label="${esc(t('lingua'))}">${LANGS.map(l=>`<button type="button" data-lang="${l}" aria-pressed="${l===lang}" data-testid="ga-lang-${l}">${l.toUpperCase()}</button>`).join('')}</div>`;
function paintLang(sel){const el=$(sel);if(el)el.outerHTML=langSel(sel.slice(1))}
const errText=x=>x&&x.status===404?t('err404'):x&&x.status===429?t('err429'):lang==='it'&&x&&x.status?x.message:t('errRete');
function showErr(x){$('#r').innerHTML=`<p class="form-err" role="alert" data-testid="ga-error">${esc(errText(x))}</p>`}
// apri: scheda da mostrare subito (dal pulsante Rispondi dell'email arriva «messaggi»), se c'è per questa prenotazione
async function load(body,btn,apri){
 let orig;if(btn){if(btn.dataset.loading)return;btn.dataset.loading='1';orig=btn.textContent;btn.disabled=true;btn.classList.add('is-loading');btn.textContent=t('cerco')}
 try{let r;
  try{r=await api('mie',body)}
  catch(x){if(!body.t||x.status!==404)throw x;accDel();r=await api('mie',{code:body.code})}      // sessione scaduta o link vecchio (404): si riprova con il solo codice; senza rete la sessione resta
  if(r.t)accSet(r.code||body.code,r.t);
  R=r;tab=apri==='messaggi'&&chatOn()?'messaggi':'soggiorno';evCache=null;stopPoll();Object.assign(MS,{v:null,list:[],poll:0,err:''});paint()}
 catch(x){showErr(x)}
 finally{if(btn){btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=orig||t('entra');delete btn.dataset.loading}}}
function logout(){accDel();R=null;stopPoll();Object.assign(MS,{v:null,list:[],poll:0,err:''});$('#r').innerHTML='';const lg=$('#login');if(lg)lg.hidden=false;document.querySelector('.auth-wrap').classList.remove('ga-on');const cd=$('#cd');if(cd){cd.value='';cd.focus()}}

/* ---------------- disegno ---------------- */
const act=(href,ic,label,desc,attrs)=>`<a class="ga-act" href="${esc(href)}"${attrs||''}>${icon(ic)}<span><b>${esc(label)}</b>${desc?`<small>${esc(desc)}</small>`:''}</span></a>`;
const ext=' target="_blank" rel="noopener noreferrer"';
function pSoggiorno(s){
 const h=s.orari||{},c=s.contatti||{},code=s.code,pay=s.pagamento;
 const card=`<article class="booking-card ga-card" data-testid="mie-card-${esc(code)}">
   <div class="bc-top"><span class="bc-code">${esc(fmtCode(code))}</span><span class="stato confermata">${esc(t('confermata'))}</span></div>
   <h3 class="bc-title">${esc(short(s.apt.nome))}</h3>
   <div class="bc-grid">
    <div class="bc-cell"><span>${esc(t('checkin'))}</span><b>${esc(dLong(s.da))}</b>${h.checkin?`<small>${esc(t('dalle',h.checkin))}</small>`:''}</div>
    <div class="bc-cell"><span>${esc(t('checkout'))}</span><b>${esc(dLong(s.a))}</b>${h.checkout?`<small>${esc(t('entro',h.checkout))}</small>`:''}</div>
    <div class="bc-cell"><span>${esc(t('notti'))}</span><b>${esc(s.notti)}</b></div>
    <div class="bc-cell"><span>${esc(t('ospiti'))}</span><b>${esc(s.ospiti||'—')}</b></div>
   </div>
   <button type="button" class="ga-copy" data-copy="${esc(code)}" data-testid="ga-copy-code">${esc(t('copia'))}</button>
  </article>`;
 const acts=[
  act(CHECKIN_URL,'checkin',t('aCheckin'),t('aCheckinD'),ext+` data-testid="checkin-link-${esc(code)}"`),
  act('guest-card.html','card',t('aGc'),t('aGcD'),` data-testid="gc-link-${esc(code)}"`),
  `<button type="button" class="ga-act" data-act="ics" data-testid="ga-ics">${icon('cal')}<span><b>${esc(t('aCal'))}</b><small>${esc(t('aCalD'))}</small></span></button>`,
  act(mapsDir(INDIRIZZO),'route',t('aStrada'),'Via Centrale 48, Ravina',ext+' data-testid="ga-route"')].join('');
 const chip=(href,ic,label,attrs)=>`<a href="${esc(href)}"${attrs}>${icon(ic)}<span>${esc(label)}</span></a>`;
 const contatti=`<div class="ga-contact">${chip('tel:'+TEL_H,'tel',t('aChiama'),' data-testid="ga-tel"')}${c.whatsapp?chip('https://wa.me/'+c.whatsapp,'wa',t('aWa'),ext+' data-testid="ga-wa"'):''}${chip('mailto:'+MAIL,'mail',t('aMail'),' data-testid="ga-mail"')}</div>`;
 const rec=`<p class="ga-review">${icon('star')}<a href="${esc(REVIEW_URL)}"${ext} data-testid="review-link-${esc(code)}">${esc(t('aRec'))}</a><span>· ${esc(t('aRecD'))}</span></p>`;
 return card+`<div class="ga-actions">${acts}</div>`+contatti+pPay(s,pay)+pRicevuta(s)+pAnnullo(s)+rec+installCard()}
// Annullamento (solo prenotazioni del sito pagate online): fino a 7 giorni prima dell'arrivo, con il rimborso totale. Due passi: il pulsante,
// poi la conferma con l'importo. La regola la decide il server (s.annullo): qui si mostra soltanto.
function pAnnullo(s){
 const a=s.annullo||{},pay=s.pagamento;
 if(a.motivo==='portale')return `<section class="ga-card ga-ann" data-testid="ga-annullo"><h3>${esc(t('annTit'))}</h3><p class="book-note">${esc(t('annPortale',s.portale))}</p></section>`;
 if(!pay)return '';
 const body=a.possibile?`<p>${esc(t('annOk',dLong(a.entro),eur(pay.totale)))}</p><div id="ga-ann-box">${annBox(false)}</div>`
  :`<p class="book-note" data-testid="ga-annullo-no">${esc(a.motivo==='scaduto'?t('annScaduto',dLong(a.entro)):t('annNonPagata'))}</p>`;
 return `<section class="ga-card ga-ann" data-testid="ga-annullo"><h3>${esc(t('annTit'))}</h3>${body}</section>`}
const annBox=(conf,err)=>conf?`<div class="ga-ann-conf" role="group" aria-labelledby="ga-ann-q"><p id="ga-ann-q"><b>${esc(t('annConf',eur(sog().pagamento.totale)))}</b></p>
  <div class="ga-btns"><button type="button" class="btn btn-wine" data-act="annSi" data-testid="ga-annulla-si">${esc(t('annSi'))}</button><button type="button" class="btn btn-line" data-act="annNo" data-testid="ga-annulla-no">${esc(t('annNo'))}</button></div>
  <p class="form-err" role="alert" data-testid="ga-annulla-err">${esc(err||'')}</p></div>`
 :`<button type="button" class="btn btn-line" data-act="annChiedi" data-testid="ga-annulla">${esc(t('annBtn'))}</button>`;
async function annulla(btn){
 btn.disabled=true;btn.textContent=t('annInCorso');
 try{const r=await callG('annulla',{lingua:lang});paintAnnullata(r)}
 catch(x){const box=$('#ga-ann-box'),m=x.status&&lang==='it'?x.message:x.code==='NON_ANNULLABILE'?t('annScaduto',dLong(sog().annullo.entro)):t('annErr');      // i messaggi del server sono in italiano
  if(box)box.innerHTML=annBox(true,m);const b=$('[data-testid=ga-annulla-si]');if(b)b.focus()}}
// dopo l'annullamento l'area non apre più la prenotazione: si chiude la sessione e resta la conferma, con quanto torna sulla carta
function paintAnnullata(r){
 stopPoll();accDel();R=null;
 const rb=r.rimborso||{};
 $('#r').innerHTML=`<div class="ga" data-testid="guest-app"><section class="ga-card ga-ann-done" data-testid="ga-annullata" tabindex="-1"><h2>${esc(t('annFatto'))}</h2>
  <p>${esc(rb.stato==='gia_rimborsato'?t('annGia'):t('annFattoD',eur(rb.importo),r.email))}</p><a class="btn btn-wine" href="index.html">${esc(t('annHome'))}</a></section></div>`;
 const c=$('[data-testid=ga-annullata]');if(c)c.focus()}
// Ricevuta: l'ospite la chiede con i dati per intestarla; il titolare la prepara e la manda dalla Gestione (api/_ricevute.js).
// Il server non rimanda mai indietro i dati inseriti: dopo l'invio qui resta solo lo stato.
let ricForm=false,ricErr='';
function pRicevuta(s){
 const q=s.ricevuta||{},giorno=v=>dLong(String(v||'').slice(0,10));
 let body;
 if(q.stato==='inviata')body=`<p data-testid="ga-ric-inviata">${esc(t('ricInviata',giorno(q.inviata_il),q.invio))}</p>`;
 else if(ricForm)body=ricFormHtml(q);
 else if(q.stato==='richiesta')body=`<p data-testid="ga-ric-richiesta">${esc(t('ricRichiesta',giorno(q.richiesta_il),q.invio))}</p><button type="button" class="link-btn" data-act="ricApri">${esc(t('ricCorreggi'))}</button>`;
 else body=`<p>${esc(t('ricD'))}</p><button type="button" class="btn btn-line" data-act="ricApri" data-testid="ga-ric-apri">${esc(t('ricBtn'))}</button>`;
 return `<section class="ga-card ga-ric" id="ga-ric" data-testid="ga-ricevuta"><h3>${esc(t('ricTit'))}</h3>${body}</section>`}
function ricFormHtml(q){
 const it=lang==='it',f=(id,lab,attrs,req,hint)=>`<div class="field"><label for="ric-${id}">${esc(lab)}${req?' <span aria-hidden="true">*</span>':''}${hint?` <small>(${esc(hint)})</small>`:''}</label><input id="ric-${id}" name="${id}"${req?' aria-required="true"':''} ${attrs}></div>`;
 return `<form id="ga-ric-f" class="ga-ric-f" novalidate data-testid="ga-ric-form">
  ${f('nome',t('ricNome'),'autocomplete="name" maxlength="100"',1)}
  ${f('paese',t('ricPaese'),`autocomplete="country-name" maxlength="40" value="${esc(t('ricPaeseDef'))}"`,1)}
  ${f('cf',it?t('ricCf'):t('ricCfEst'),'maxlength="30" autocapitalize="characters" spellcheck="false" autocomplete="off"',it)}
  ${f('indirizzo',t('ricInd'),'autocomplete="street-address" maxlength="120"',1)}
  <div class="fields-grid">${f('cap',t('ricCap'),'autocomplete="postal-code" maxlength="12"',1)}${f('citta',t('ricCitta'),'autocomplete="address-level2" maxlength="60"',1)}</div>
  ${f('email',q.emailPren?t('ricEmailAlt'):t('ricEmail'),'type="email" autocomplete="email" maxlength="120" inputmode="email"',!q.emailPren,q.emailPren?t('ricEmailPren',q.emailPren):'')}
  <div class="field"><label for="ric-nota">${esc(t('ricNota'))}</label><textarea id="ric-nota" name="nota" rows="2" maxlength="300"></textarea></div>
  <p class="book-note">${esc(t('ricPriv'))} <a href="privacy.html">${esc(t('informativa'))}</a></p>
  <div class="ga-btns"><button class="btn btn-wine" data-testid="ga-ric-invia">${esc(t('ricInvia'))}</button><button type="button" class="btn btn-line" data-act="ricChiudi">${esc(t('chiudi'))}</button></div>
  <p class="form-err" id="ga-ric-err" role="alert" data-testid="ga-ric-err">${esc(ricErr)}</p></form>`}
const ricRepaint=focus=>{const el=$('#ga-ric');if(el)el.outerHTML=pRicevuta(sog());if(focus){const x=$(focus);if(x)x.focus()}};
async function sendRic(f){
 const v=k=>(f.elements[k].value||'').trim(),dati={nome:v('nome'),paese:v('paese'),cf:v('cf'),indirizzo:v('indirizzo'),cap:v('cap'),citta:v('citta'),email:v('email'),nota:v('nota')};
 const q=sog().ricevuta||{},italia=/^(it|ita|italia|italy|italien)$/i.test(dati.paese||(lang==='it'?'Italia':''));
 const manca=dati.nome.length<2||!dati.paese&&lang!=='it'||italia&&!dati.cf||dati.indirizzo.length<3||!dati.cap||dati.citta.length<2||!q.emailPren&&!dati.email;
 const err=m=>{ricErr=m;const e=$('#ga-ric-err');if(e)e.textContent=m};
 if(manca)return err(t('ricCompila'));
 if(dati.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dati.email))return err(t('ricEmailNo'));
 const btn=f.querySelector('[data-testid=ga-ric-invia]');btn.disabled=true;btn.textContent=t('ricInvio');err('');
 try{const r=await callG('ricevuta',{lingua:lang,dati});delete r.t;sog().ricevuta=r;ricForm=false;ricErr='';ricRepaint('#ga-ric h3')}
 catch(x){err(x.status===429||x.status===409?x.message:x.status===400?(lang==='it'?x.message:t('ricControlla')):t('ricErr'));btn.disabled=false;btn.textContent=t('ricInvia')}}
function pPay(s,pay){
 let body='';
 if(pay){
  const ct=pay.conto,righe=ct&&ct.righe&&ct.righe.length?ct.righe:null,rows=[];
  if(righe){for(const r of righe)rows.push([t('pagNotti',r.notti,eur(r.prezzo))+(righe.length>1?' · '+t('pagDal',dShort(r.dal)):''),eur(r.notti*r.prezzo)]);
   if(ct.supplemento>0)rows.push([t('pagSup',s.notti,eur(ct.supplemento)),eur(ct.supplemento*s.notti)])}
  body=`<div class="ga-rows">${rows.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}<div class="ga-tot"><span>${esc(t('pagTot'))}</span><b data-testid="ga-pay-total">${esc(eur(pay.totale))}</b></div></div>`
   +(pay.pagato?`<p class="ga-ok" data-testid="ga-pay-ok">✓ ${esc(t('pagPagato',pay.data?dLong(pay.data):''))}</p>`:'')}
 else body=`<p data-testid="ga-pay-portale">${esc(s.portale?t('pagPortale',s.portale):t('pagAltro'))}</p>`;
 return `<section class="ga-card ga-pay" data-testid="ga-pay"><h3>${esc(t('pagTit'))}</h3>${body}<p class="book-note">${esc(t('pagImposta'))}</p></section>`}
function pInfo(s){
 const h=s.orari||{},c=s.contatti||{},inf=s.info||{},nota=lang!=='it'&&t('testiIt')?`<p class="book-note">${esc(t('testiIt'))}</p>`:'';
 const casa=cards(inf.testo,t('casa')).map(k=>`<section class="ga-card ga-txt" data-testid="ga-info-casa"><h3>${esc(k.h)}</h3>${k.body}${nota}</section>`).join('');
 const ris=inf.riservate?`<section class="ga-card ga-txt ga-ris" data-testid="ga-riservate"><h3>${esc(t('riservate'))}</h3>${cards(inf.riservate,'').map(k=>(k.h?`<h4>${esc(k.h)}</h4>`:'')+k.body).join('')}</section>`
  :inf.riservateDal?`<section class="ga-card" data-testid="ga-riservate-dal"><h3>${esc(t('riservate'))}</h3><p>${esc(t('riservateDal',dLong(inf.riservateDal)))}</p></section>`:'';
 return `<section class="ga-card" data-testid="ga-arrivo"><h3>${esc(t('arrivo'))}</h3><p><b>${esc(INDIRIZZO)}</b></p>
   <div class="ga-btns"><a class="btn btn-wine" href="${esc(mapsDir(INDIRIZZO))}"${ext}>${esc(t('aStrada'))}</a><a class="btn btn-line" href="mappa.html">${esc(t('trovarci'))}</a></div>
   <h4>${esc(t('parcheggio'))}</h4><p>${esc(t('parcheggioD'))} <a href="${esc(mapsQ(PARCHEGGIO))}"${ext}>${esc(t('apriMaps'))}</a></p>
   <p class="book-note">${esc(t('chiavi'))}</p></section>
  <section class="ga-card" data-testid="ga-orari"><h3>${esc(t('orari'))}</h3><div class="bc-grid">
   <div class="bc-cell"><span>${esc(t('checkin'))}</span><b>${esc(dDay(s.da))}</b>${h.checkin?`<small>${esc(t('dalle',h.checkin))}</small>`:''}</div>
   <div class="bc-cell"><span>${esc(t('checkout'))}</span><b>${esc(dDay(s.a))}</b>${h.checkout?`<small>${esc(t('entro',h.checkout))}</small>`:''}</div></div></section>
  ${casa}${ris}
  <section class="ga-card" data-testid="ga-contatti"><h3>${esc(t('contatti'))}</h3><p><a href="tel:${TEL_H}">${TEL}</a><br><a href="mailto:${MAIL}">${MAIL}</a>${c.whatsapp?`<br><a href="https://wa.me/${esc(c.whatsapp)}"${ext}>WhatsApp</a>`:''}</p></section>`}
function pDintorni(s){
 const link=(href,ic,lab,desc)=>`<a class="ga-act" href="${href}">${icon(ic)}<span><b>${esc(lab)}</b><small>${esc(desc)}</small></span></a>`;
 return `<section class="ga-card" data-testid="ga-eventi"><h3>${esc(t('eventi'))}</h3><div id="ga-ev"><p class="book-note">${esc(t('caricoEventi'))}</p></div><p><a href="eventi.html">${esc(t('tuttiEventi'))} →</a></p></section>
  <div class="ga-actions">${link('dintorni.html','mount',t('luoghi'),t('luoghiD'))}${link('convenzioni.html','tag',t('conv'),t('convD'))}${link('eventi.html','cal',t('tutti'),t('tuttiD'))}${link('mappa.html','route',t('trovarci'),t('trovarciD'))}</div>`}
// eventi nelle date del soggiorno (dal giorno di arrivo a quello di partenza): quelli automatici e quelli inseriti in Gestione
async function paintEvents(s){
 const box=$('#ga-ev');if(!box)return;
 if(!evCache){const [f,m]=await Promise.all([get('a=events_feed'),get('a=events')]);evCache=[...(Array.isArray(f)?f:[]),...(Array.isArray(m)?m:[])]}
 const safe=u=>{u=String(u||'').trim();return /^https?:\/\//i.test(u)?u:''};
 const list=evCache.filter(x=>x&&x.date>=s.da&&x.date<=s.a).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0).slice(0,12);
 const el=$('#ga-ev');if(!el)return;
 el.innerHTML=list.length?`<ul class="ga-ev">${list.map(x=>{const u=safe(x.url),inner=`<span class="ga-ev-d">${esc(dDay(x.date))}${x.time?' · '+esc(x.time):''}</span><b>${esc(x.title)}</b>${x.location?`<small>${esc(x.location)}</small>`:''}`;
   return `<li data-testid="ga-ev-${esc(x.date)}">${u?`<a href="${esc(u)}"${ext}>${inner}</a>`:inner}</li>`}).join('')}</ul>`:`<p class="book-note" data-testid="ga-ev-none">${esc(t('nessunEvento'))}</p>`}

/* ---------------- messaggi (solo prenotazioni fatte sul sito) ---------------- */
// testo sempre come testo; i soli indirizzi http(s) diventano link (si aprono in un'altra scheda)
const linkify=s=>esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
const ora=ts=>{try{return new Date(ts).toLocaleString(LOC[lang],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}catch{return ''}};
const chatOn=()=>{const s=sog();return !!(s.messaggi&&s.messaggi.attivi)};
function pMessaggi(){
 return `<section class="ga-card ga-chat" data-testid="ga-chat"><p class="book-note">${esc(t(sog().messaggi.email?'chatNotaEmail':'chatNota'))}</p>
  <div class="ga-thread" id="ga-thread" data-testid="ga-thread">${threadHtml()}</div>
  <form id="ga-send" class="ga-compose" data-testid="ga-compose" novalidate>
   <label for="ga-testo">${esc(t('scrivi'))}</label>
   <textarea id="ga-testo" rows="3" maxlength="${MAX_TESTO}" placeholder="${esc(t('scriviPh'))}" data-testid="ga-testo"></textarea>
   <div class="ga-compose-bar"><small id="ga-cnt" aria-live="polite"></small><button class="btn btn-wine" data-testid="ga-invia">${esc(t('invia'))}</button></div>
   <p class="form-err" id="ga-merr" role="alert" data-testid="ga-merr">${esc(MS.err)}</p></form></section>`}
function threadHtml(){
 if(!MS.list.length)return `<p class="book-note" data-testid="ga-chat-vuota">${esc(t('chatVuota'))}</p>`;
 return MS.list.map(m=>{const me=m.da==='ospite';
  return `<div class="ga-msg ${me?'me':'them'}" data-testid="ga-msg-${esc(m.id)}"><div class="ga-bubble">${linkify(m.testo)}</div>
   <div class="ga-meta">${esc(me?t('tu'):t('noi'))} · ${esc(ora(m.ts))}${m.originale?` · <span>${esc(t('tradotto'))}</span> · <button type="button" class="link-btn" data-orig="${esc(m.id)}">${esc(t('originale'))}</button>`:''}</div>
   ${m.originale?`<div class="ga-orig" id="ga-o-${esc(m.id)}" hidden>${linkify(m.originale)}</div>`:''}</div>`}).join('')}
function paintThread(scroll){const el=$('#ga-thread');if(!el)return;const near=el.scrollHeight-el.scrollTop-el.clientHeight<80;el.innerHTML=threadHtml();if(scroll||near)el.scrollTop=el.scrollHeight}
function setBadge(n){const s=sog();if(s.messaggi)s.messaggi.nonLetti=n;const b=$('#ga-t-messaggi .adm-badge');if(n>0){if(b)b.textContent=n;else{const tb=$('#ga-t-messaggi');if(tb)tb.insertAdjacentHTML('beforeend',`<span class="adm-badge">${n}</span>`)}}else if(b)b.remove()}
// chiamata con il token della sessione; se è scaduto (4 ore) si rientra con il solo codice, come all'accesso
async function callG(a,extra){
 const code=R.code||sog().code,b=accBody(code);
 try{const r=await api(a,Object.assign({},b,extra));if(r.t)accSet(code,r.t);return r}
 catch(x){if(!b.t||x.status!==404||a==='msg_v')throw x;accDel();const r=await api(a,Object.assign({code},extra));if(r.t)accSet(code,r.t);return r}}
async function loadMsgs(first){
 if(!R||!chatOn())return;
 try{const r=await callG('msg_list',{lingua:lang,v:first?null:MS.v});
  if(!r.invariato){MS.list=r.messaggi||[];MS.v=r.v;paintThread(first)}
  setBadge(0)}
 catch(x){if(x.status===404||x.status===401)stopPoll()}}
// controllo periodico: prima solo la versione (leggerissimo); l'elenco intero solo se è cambiato qualcosa
async function pollMsgs(){
 try{const r=await callG('msg_v');if(r.v!==MS.v)await loadMsgs(false)}
 catch(x){if(x.status===404)await loadMsgs(false)}}      // token scaduto: l'elenco rientra con il codice e rinnova la sessione
function stopPoll(){clearTimeout(MS.timer);MS.timer=null}
function schedulePoll(){stopPoll();if(tab!=='messaggi'||MS.poll>=POLL_MAX)return;
 MS.timer=setTimeout(async()=>{MS.timer=null;if(tab!=='messaggi')return;if(document.visibilityState==='visible'){MS.poll++;await pollMsgs()}schedulePoll()},POLL_MS)}
function active(){MS.poll=0;if(tab==='messaggi'&&!MS.timer)schedulePoll()}
async function sendMsg(f){
 const ta=$('#ga-testo'),btn=f.querySelector('button'),testo=(ta.value||'').trim();
 if(!testo||MS.busy)return;
 MS.busy=true;btn.disabled=true;btn.textContent=t('invio');MS.err='';const e=$('#ga-merr');if(e)e.textContent='';
 try{const m=await callG('msg_send',{testo,lingua:lang});
  MS.list.push({id:m.id,da:'ospite',testo:m.testo,ts:m.ts});ta.value='';cnt();paintThread(true);
  loadMsgs(false)}      // la versione è cambiata: si allinea subito (e prende eventuali risposte arrivate nel frattempo)
 catch(x){MS.err=x.status===429?(lang==='it'?x.message:t('troppiMsg')):x.status===400&&lang==='it'?x.message:t('errInvio');const el=$('#ga-merr');if(el)el.textContent=MS.err}
 finally{MS.busy=false;btn.disabled=false;btn.textContent=t('invia');active()}}
function cnt(){const ta=$('#ga-testo'),c=$('#ga-cnt');if(!ta||!c)return;const left=MAX_TESTO-ta.value.length;c.textContent=left<200?t('caratteri',left):''}

/* ---------------- app installabile (PWA) ---------------- */
const standalone=()=>{try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch{return false}};
const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent||'')||(/Macintosh/.test(navigator.userAgent||'')&&navigator.maxTouchPoints>1);
function installCard(){
 if(standalone()||ss('lc_pwa_no'))return '';
 if(!deferredInstall&&!isIos())return '';
 return `<section class="ga-card ga-install" data-testid="ga-install"><h3>${esc(t('installa'))}</h3><p>${esc(t('installaD'))}</p>${deferredInstall?`<button type="button" class="btn btn-wine" data-act="install">${esc(t('installaBtn'))}</button>`:`<p class="book-note">${esc(t('installaIos'))}</p>`} <button type="button" class="link-btn" data-act="noinstall">${esc(t('chiudi'))}</button></section>`}

function paint(){
 const s=sog(),lg=$('#login');if(lg)lg.hidden=true;
 document.querySelector('.auth-wrap').classList.add('ga-on');
 document.documentElement.lang=lang;
 const tabs=[['soggiorno',t('tabSoggiorno')],...(chatOn()?[['messaggi',t('tabMessaggi')]]:[]),['info',t('tabInfo')],['dintorni',t('tabDintorni')]];
 if(!tabs.some(x=>x[0]===tab))tab='soggiorno';
 const nl=chatOn()?+s.messaggi.nonLetti||0:0;
 $('#r').innerHTML=`<div class="ga" data-testid="guest-app">
  <div class="ga-bar">${langSel('ga-lang-app')}<button type="button" class="link-btn" data-act="logout" data-testid="ga-logout">${esc(t('esci'))}</button></div>
  <header class="ga-hero">${s.apt.foto?`<img class="ga-hero-img" src="${esc(s.apt.foto)}" alt="" decoding="async">`:''}<div class="ga-hero-in">
   <span class="ga-kicker">${esc(t('titolo'))}</span><h2>${esc(short(s.apt.nome))}</h2>
   <p>${esc(dDay(s.da))} → ${esc(dDay(s.a))} · ${esc(t('nNotti',s.notti))}${s.ospiti?' · '+esc(t('nOspiti',s.ospiti)):''}</p>
   <span class="ga-count" data-testid="ga-count">${esc(countdown(s))}</span></div></header>
  <div class="ga-tabs" role="tablist" aria-label="${esc(t('tabs'))}">${tabs.map(([k,l])=>`<button type="button" role="tab" id="ga-t-${k}" aria-controls="ga-p-${k}" aria-selected="${k===tab}" tabindex="${k===tab?0:-1}" data-tab="${k}" data-testid="ga-tab-${k}">${esc(l)}${k==='messaggi'&&nl?`<span class="adm-badge">${nl}</span>`:''}</button>`).join('')}</div>
  ${tabs.map(([k])=>`<section class="ga-panel" role="tabpanel" id="ga-p-${k}" aria-labelledby="ga-t-${k}"${k===tab?'':' hidden'}>${k==='soggiorno'?pSoggiorno(s):k==='messaggi'?pMessaggi():k==='info'?pInfo(s):pDintorni(s)}</section>`).join('')}
 </div>`;
 if(tab==='dintorni')paintEvents(s);
 if(tab==='messaggi'){loadMsgs(true);active()}}
function setTab(k,focus){tab=k;
 $$('.ga-tabs [role=tab]').forEach(b=>{const on=b.dataset.tab===k;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;if(on&&focus)b.focus()});
 $$('.ga-panel').forEach(p=>{p.hidden=p.id!=='ga-p-'+k});
 if(k==='dintorni')paintEvents(sog());
 if(k==='messaggi'){loadMsgs(MS.v==null);active()}else stopPoll()}

/* ---------------- eventi della pagina ---------------- */
function wire(){
 const f=$('#f');
 f.onsubmit=e=>{e.preventDefault();const code=codeIn($('#cd').value);if(!code)return;load(accBody(code),f.querySelector('[data-testid="area-clienti-submit"]'))};
 document.addEventListener('submit',e=>{if(e.target&&e.target.id==='ga-send'){e.preventDefault();sendMsg(e.target)}if(e.target&&e.target.id==='ga-ric-f'){e.preventDefault();sendRic(e.target)}});
 document.addEventListener('input',e=>{if(e.target&&e.target.id==='ga-testo'){cnt();active()}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&tab==='messaggi'&&R){loadMsgs(false);active()}});
 document.addEventListener('click',async e=>{
  const lb=e.target.closest('[data-lang]');
  if(lb){lang=lb.dataset.lang;ss('lc_lang',lang);if(R)paint();else i18nLogin();const nb=$(`[data-lang="${lang}"]`);if(nb)nb.focus();return}
  const tb=e.target.closest('.ga-tabs [role=tab]');if(tb){setTab(tb.dataset.tab);return}
  const og=e.target.closest('[data-orig]');if(og){const o=$('#ga-o-'+og.dataset.orig);if(o){o.hidden=!o.hidden;og.setAttribute('aria-expanded',String(!o.hidden))}return}
  const cp=e.target.closest('[data-copy]');
  if(cp){const ok=await copia(cp.dataset.copy);cp.textContent=ok?t('copiato'):cp.textContent;clearTimeout(cp._t);cp._t=setTimeout(()=>{cp.textContent=t('copia')},2200);return}
  const a=e.target.closest('[data-act]');if(!a)return;
  const k=a.dataset.act;
  if(k==='logout')logout();
  else if(k==='ics'){const s=sog();download('la-columbera-'+s.da+'.ics',icsOf(s),'text/calendar;charset=utf-8')}
  else if(k==='install'&&deferredInstall){deferredInstall.prompt();try{await deferredInstall.userChoice}catch{}deferredInstall=null;if(R)paint()}
  else if(k==='noinstall'){ss('lc_pwa_no','1');const c=a.closest('.ga-install');if(c)c.remove()}
  else if(k==='annChiedi'||k==='annNo'){const box=$('#ga-ann-box');if(box){box.innerHTML=annBox(k==='annChiedi');const x=$(k==='annChiedi'?'[data-testid=ga-annulla-no]':'[data-testid=ga-annulla]');if(x)x.focus()}}
  else if(k==='annSi')annulla(a);
  else if(k==='ricApri'||k==='ricChiudi'){ricForm=k==='ricApri';ricErr='';ricRepaint(ricForm?'#ric-nome':'#ga-ric h3')}});
 // frecce sinistra/destra tra le schede (come una barra di schede vera)
 document.addEventListener('keydown',e=>{const tb=e.target.closest&&e.target.closest('.ga-tabs [role=tab]');if(!tb||!/^Arrow(Left|Right)$/.test(e.key))return;
  const all=$$('.ga-tabs [role=tab]'),i=all.indexOf(tb),j=(i+(e.key==='ArrowRight'?1:-1)+all.length)%all.length;e.preventDefault();setTab(all[j].dataset.tab,true)});
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;if(R&&tab==='soggiorno')paint()})}

// link della mail (#c=…&t=…) o del messaggio di benvenuto (#k=…): all'apertura della pagina e anche se si apre mentre la pagina è già aperta
function fromHash(){
 const h=accFromHash();
 if(h&&h.t){$('#cd').value=fmtCode(h.c);load({code:h.c,t:h.t},null,h.s);return true}
 if(h&&h.k){const k=codeIn(h.k);$('#cd').value=k;load({code:k},null,h.s);return true}
 return false}
function start(){
 i18nLogin();wire();
 window.addEventListener('hashchange',fromHash);
 // service worker solo per questa pagina (ambito /area-clienti): installazione come app e struttura della pagina senza rete. Mai le risposte del server.
 try{if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('sw.js',{scope:'area-clienti'}).catch(()=>{})}catch{}
 // Link della mail di conferma (#c=…&t=…), messaggio di benvenuto (#k=…) o sessione già aperta in questa scheda: accesso diretto.
 // Link con il codice nell'indirizzo (?code=…, il server lo vedrebbe nei log): il codice si precompila soltanto e sparisce dall'indirizzo.
 const qc=new URLSearchParams(location.search).get('code');
 if(qc)history.replaceState(null,'',location.pathname);
 if(fromHash())return;
 const s=accGet();
 if(s){$('#cd').value=fmtCode(s.c);load({code:s.c,t:s.t})}
 else if(qc)$('#cd').value=codeIn(qc)}

// parte da sé (non aspetta la configurazione del sito: tutto ciò che serve arriva con la prenotazione), così si apre anche senza rete
window.LCArea={ics:icsOf};
start();
})();
