// api/invia-email-ospite.js
// VERSIONE CORRETTA - nomi file immagini aggiornati

import nodemailer from 'nodemailer';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Stesso criterio usato in stripeWebhook.js: mascherare l'indirizzo nei log
// mantenendo visibile solo il dominio.
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return 'N/A';
  const [user, domain] = email.split('@');
  const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user.slice(0, 2)}${'*'.repeat(user.length - 2)}`;
  return `${maskedUser}@${domain}`;
}

// ------------------------------------------------------------------
// i18n email ospite (IT/EN/DE). Questa è l'UNICA email tradotta: quella al
// proprietario (api/genera-pdf-email.js) resta sempre in italiano, così
// come Google Sheets e il PDF per la Questura — la lingua qui sotto riguarda
// solo cosa legge l'ospite.
// ------------------------------------------------------------------
const LINGUE_VALIDE = ['it', 'en', 'de'];

const EMAIL_TESTI = {
  it: {
    headerTitle: 'Benvenuto a La Columbera!',
    headerSubtitle: 'Il tuo soggiorno sta per iniziare',
    guestFallback: 'Ospite',
    thanksText: 'Grazie per aver completato il check-in e il pagamento della tassa di soggiorno. Siamo felici di accoglierti nella nostra struttura!',
    codeTitleSingle: '🔑 Codice Cassetta Sicurezza',
    codeTitleMulti: '🔑 Codici Cassette Sicurezza',
    codeNoteSingle: 'Conserva questo codice con cura',
    bothApartmentsNote: 'Hai prenotato entrambi gli appartamenti',
    infoTitle: '📋 Dettagli della tua prenotazione',
    labelCheckin: 'Data Check-in:',
    labelApartment: 'Appartamento:',
    labelGuests: 'Numero Ospiti:',
    labelNights: 'Numero Notti:',
    labelTaxPaid: 'Tassa Soggiorno Pagata:',
    instructionsTitle: '📍 Come accedere alla struttura',
    addressPropertyLabel: '📍 Indirizzo Struttura:',
    addressParkingLabel: '📍 Indirizzo Parcheggio:',
    hoursLabel: '⏰ Orari:',
    checkinHoursText: (open, close) => `Check-in: dalle ${open} alle ${close}`,
    checkoutHoursText: (close) => `Check-out: entro le ${close}`,
    instruction1: 'Entrando dal cancello principale, dirigiti verso la palazzina sulla sinistra. Troverai due porte-finestre al piano terra, come mostrato in foto.',
    instruction2: "La cassetta si trova nella nicchia accanto all'ultimo scuro in legno sulla destra della facciata (vedi foto cerchiata in giallo).",
    instruction3: 'La sosta all\'interno della proprietà è consentita esclusivamente per le operazioni di carico e scarico dei bagagli.',
    galleryTitle: "📸 Foto di riferimento per l'accesso",
    photo1Caption: '1. Ingresso della proprietà',
    photo2Caption: (multi, codes) => `2. Cassetta di sicurezza con ${multi ? 'codici' : 'codice'} ${codes}`,
    photo3Caption: (multi) => `3. Ubicazione esatta ${multi ? 'delle cassette' : 'della cassetta'}`,
    closingText: 'Per qualsiasi necessità o domanda, non esitare a contattarci. Ti auguriamo un soggiorno piacevole e confortevole! 🌟',
    footerTagline: 'La Columbera - Appartamenti turistici',
    footerAutomated: 'Questa è una email automatica, per favore non rispondere direttamente.',
    footerGenerated: (data) => `Generata il ${data}`,
    subjectLine: (appartamento, data) => `Benvenuto a La Columbera - ${appartamento} - Check-in ${data}`,
    genericName: 'Generico',
    fallbackDescrizione: 'Codice non disponibile, contatta il proprietario',
    corteDescrizione: 'Appartamento con 1 camera da letto',
    torreDescrizione: 'Appartamento con 2 camere da letto',
    corteNomeCompleto: 'La Columbera - Corte',
    torreNomeCompleto: 'La Columbera - Torre'
  },
  en: {
    headerTitle: 'Welcome to La Columbera!',
    headerSubtitle: 'Your stay is about to begin',
    guestFallback: 'Guest',
    thanksText: "Thank you for completing check-in and paying the tourist tax. We're delighted to welcome you to our property!",
    codeTitleSingle: '🔑 Security Lockbox Code',
    codeTitleMulti: '🔑 Security Lockbox Codes',
    codeNoteSingle: 'Keep this code somewhere safe',
    bothApartmentsNote: 'You have booked both apartments',
    infoTitle: '📋 Your booking details',
    labelCheckin: 'Check-in date:',
    labelApartment: 'Apartment:',
    labelGuests: 'Number of guests:',
    labelNights: 'Number of nights:',
    labelTaxPaid: 'Tourist tax paid:',
    instructionsTitle: '📍 How to get into the property',
    addressPropertyLabel: '📍 Property address:',
    addressParkingLabel: '📍 Parking address:',
    hoursLabel: '⏰ Hours:',
    checkinHoursText: (open, close) => `Check-in: from ${open} to ${close}`,
    checkoutHoursText: (close) => `Check-out: by ${close}`,
    instruction1: "Through the main gate, head to the building on the left. You'll find two French doors on the ground floor, as shown in the photo.",
    instruction2: 'The lockbox is in the recess next to the last wooden shutter on the right side of the façade (see the photo, circled in yellow).',
    instruction3: 'Parking inside the property is allowed only for loading and unloading luggage.',
    galleryTitle: '📸 Reference photos for access',
    photo1Caption: '1. Entrance to the property',
    photo2Caption: (multi, codes) => `2. Lockbox with ${multi ? 'codes' : 'code'} ${codes}`,
    photo3Caption: (multi) => `3. Exact location of the ${multi ? 'lockboxes' : 'lockbox'}`,
    closingText: "If you need anything or have any questions, please don't hesitate to contact us. We wish you a pleasant and comfortable stay! 🌟",
    footerTagline: 'La Columbera - Holiday apartments',
    footerAutomated: 'This is an automated email, please do not reply directly to it.',
    footerGenerated: (data) => `Generated on ${data}`,
    subjectLine: (appartamento, data) => `Welcome to La Columbera - ${appartamento} - Check-in ${data}`,
    genericName: 'Generic',
    fallbackDescrizione: 'Code not available, please contact the owner',
    corteDescrizione: 'Apartment with 1 bedroom',
    torreDescrizione: 'Apartment with 2 bedrooms',
    corteNomeCompleto: 'La Columbera - Corte',
    torreNomeCompleto: 'La Columbera - Torre'
  },
  de: {
    headerTitle: 'Willkommen bei La Columbera!',
    headerSubtitle: 'Ihr Aufenthalt beginnt bald',
    guestFallback: 'Gast',
    thanksText: 'Vielen Dank für den Abschluss des Check-ins und die Zahlung der Kurtaxe. Wir freuen uns, Sie in unserer Unterkunft begrüßen zu dürfen!',
    codeTitleSingle: '🔑 Code für die Sicherheitsbox',
    codeTitleMulti: '🔑 Codes für die Sicherheitsboxen',
    codeNoteSingle: 'Bewahren Sie diesen Code sorgfältig auf',
    bothApartmentsNote: 'Sie haben beide Wohnungen gebucht',
    infoTitle: '📋 Details Ihrer Buchung',
    labelCheckin: 'Check-in-Datum:',
    labelApartment: 'Wohnung:',
    labelGuests: 'Anzahl der Gäste:',
    labelNights: 'Anzahl der Nächte:',
    labelTaxPaid: 'Bezahlte Kurtaxe:',
    instructionsTitle: '📍 So gelangen Sie zur Unterkunft',
    addressPropertyLabel: '📍 Adresse der Unterkunft:',
    addressParkingLabel: '📍 Adresse des Parkplatzes:',
    hoursLabel: '⏰ Zeiten:',
    checkinHoursText: (open, close) => `Check-in: von ${open} bis ${close}`,
    checkoutHoursText: (close) => `Check-out: bis ${close}`,
    instruction1: 'Gehen Sie durch das Haupttor zum Gebäude auf der linken Seite. Im Erdgeschoss finden Sie zwei Fenstertüren, wie auf dem Foto gezeigt.',
    instruction2: 'Die Box befindet sich in der Nische neben dem letzten Holzfensterladen auf der rechten Seite der Fassade (siehe gelb umkreistes Foto).',
    instruction3: 'Das Parken innerhalb des Grundstücks ist ausschließlich zum Be- und Entladen von Gepäck gestattet.',
    galleryTitle: '📸 Referenzfotos für den Zugang',
    photo1Caption: '1. Eingang zur Unterkunft',
    photo2Caption: (multi, codes) => `2. Sicherheitsbox mit ${multi ? 'Codes' : 'Code'} ${codes}`,
    photo3Caption: (multi) => `3. Genaue Lage der ${multi ? 'Sicherheitsboxen' : 'Sicherheitsbox'}`,
    closingText: 'Bei Fragen oder Anliegen jeglicher Art zögern Sie nicht, uns zu kontaktieren. Wir wünschen Ihnen einen angenehmen und komfortablen Aufenthalt! 🌟',
    footerTagline: 'La Columbera - Ferienwohnungen',
    footerAutomated: 'Dies ist eine automatische E-Mail, bitte antworten Sie nicht direkt darauf.',
    footerGenerated: (data) => `Erstellt am ${data}`,
    subjectLine: (appartamento, data) => `Willkommen bei La Columbera - ${appartamento} - Check-in ${data}`,
    genericName: 'Allgemein',
    fallbackDescrizione: 'Code nicht verfügbar, bitte kontaktieren Sie den Eigentümer',
    corteDescrizione: 'Wohnung mit 1 Schlafzimmer',
    torreDescrizione: 'Wohnung mit 2 Schlafzimmern',
    corteNomeCompleto: 'La Columbera - Corte',
    torreNomeCompleto: 'La Columbera - Torre'
  }
};

function linguaValida(lingua) {
  return LINGUE_VALIDE.includes(lingua) ? lingua : 'it';
}

// Locale BCP47 per Intl/toLocaleDateString (usato per Data Check-in e per il
// timestamp "Generata il" in fondo all'email).
function localeEmail(lingua) {
  return { it: 'it-IT', en: 'en-GB', de: 'de-DE' }[lingua] || 'it-IT';
}

// Nome appartamento mostrato all'ospite nell'email. Il valore che arriva in
// dati.appartamento resta sempre quello italiano (coerente con Google
// Sheets e il PDF per il proprietario): qui si traduce solo l'etichetta.
function nomeAppartamentoEmail(valoreOriginale, lingua) {
  const T = EMAIL_TESTI[linguaValida(lingua)];
  if (lingua === 'it' || !valoreOriginale) return valoreOriginale;
  const parti = valoreOriginale.includes(' + ') ? valoreOriginale.split(' + ') : [valoreOriginale];
  const traduciSingolo = (val) => {
    const v = val.toLowerCase();
    if (v.includes('torre')) return `${T.torreNomeCompleto}, ${T.torreDescrizione}`;
    if (v.includes('corte')) return `${T.corteNomeCompleto}, ${T.corteDescrizione}`;
    return val.trim();
  };
  return parti.map(p => traduciSingolo(p.trim())).join(' + ');
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://spaceestate.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Internal-Secret");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' });
  }

  // ✅ FIX SICUREZZA: questo endpoint viene chiamato solo da stripeWebhook.js
  // dopo un pagamento confermato. Senza questo controllo, chiunque conoscesse
  // l'URL poteva ottenere i codici reali delle cassette (Torre/Corte) nella
  // risposta JSON e farseli inviare via email con foto, senza aver pagato
  // né avere una prenotazione reale. Stesso criterio già usato per il GET
  // di salva-dati-temporanei.js.
  const secretAtteso = process.env.INTERNAL_API_SECRET;
  const secretRicevuto = req.headers['x-internal-secret'];

  if (!secretAtteso) {
    console.error('❌ INTERNAL_API_SECRET non configurato nelle variabili d\'ambiente');
    return res.status(500).json({ error: "Configurazione server incompleta" });
  }

  if (secretRicevuto !== secretAtteso) {
    console.warn('⚠️ Tentativo di invio email senza secret valido, apartamento:', req.body?.datiPrenotazione?.appartamento);
    return res.status(401).json({ error: "Non autorizzato" });
  }

  console.log('📧 === INIZIO INVIO EMAIL OSPITE ===');

  try {
    const { emailOspite, datiPrenotazione } = req.body;

    if (!emailOspite || !datiPrenotazione) {
      return res.status(400).json({ 
        error: 'Email ospite e dati prenotazione sono obbligatori' 
      });
    }

    console.log('📬 Destinatario:', maskEmail(emailOspite));
    console.log('📊 Appartamento:', datiPrenotazione.appartamento);

    const lingua = linguaValida(datiPrenotazione.lingua);
    console.log('🌐 Lingua email ospite:', lingua);

    const codiciCassetta = determinaCodiciCassetta(datiPrenotazione.appartamento, lingua);
    console.log('🔑 Codici cassetta generati:', codiciCassetta.length);

    if (typeof datiPrenotazione.totale === 'string') {
      datiPrenotazione.totale = parseFloat(datiPrenotazione.totale);
    }

    const htmlContent = generaHTMLEmailOspite(datiPrenotazione, codiciCassetta, lingua);

    const allegati = await caricaAllegatiFoto();
    console.log(`📎 Foto caricate: ${allegati.length}`);

    await inviaEmailConNodemailer(emailOspite, datiPrenotazione, htmlContent, allegati, lingua);

    console.log('✅ Email ospite inviata con successo');
    console.log('📧 === FINE INVIO EMAIL OSPITE ===');

    return res.status(200).json({
      success: true,
      message: 'Email inviata con successo',
      codiciCassetta: codiciCassetta.map(c => c.codice),
      emailDestinatario: emailOspite,
      numeroAllegati: allegati.length,
      warning: allegati.length === 0 ? 'Foto cassetta non trovate' : null
    });

  } catch (error) {
    console.error('❌ Errore invio email ospite:', error);
    console.error('Stack:', error.stack);
    return res.status(500).json({
      error: 'Errore invio email',
      message: error.message
    });
  }
}

// ✅ FIX: nomi file corretti (con prefisso numerico)
async function caricaAllegatiFoto() {
  const allegati = [];

  // Logo La Columbera (cid: logo_columbera), incorporato nell'header dell'email
  try {
    const logoPath = join(process.cwd(), 'public', 'img', 'brand', 'email-logo.png');
    const logoContent = await readFile(logoPath);
    allegati.push({
      filename: 'logo-la-columbera.png',
      content: logoContent,
      cid: 'logo_columbera',
      contentType: 'image/png'
    });
    console.log(`✅ Logo caricato (${(logoContent.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.warn(`⚠️ Impossibile caricare il logo: ${err.message}`);
  }

  try {
    const basePath = join(process.cwd(), 'public', 'images', 'cassetta');
    
    // ✅ NOMI FILE CORRETTI
    const files = [
      { name: '1_ingresso_proprieta.jpg',  cid: 'ingresso_proprieta' },
      { name: '2_cassetta_sicurezza.jpg',  cid: 'cassetta_sicurezza' },
      { name: '3_ubicazione_cassetta.jpg', cid: 'ubicazione_cassetta' }
    ];
    
    console.log('🔍 Directory foto:', basePath);
    
    // Log contenuto directory per debug
    try {
      const { readdir } = await import('fs/promises');
      const contenuto = await readdir(join(basePath, '..')).catch(() => []);
      console.log('📂 Contenuto images/:', contenuto);
      const contenutoCassetta = await readdir(basePath).catch(() => []);
      console.log('📂 Contenuto images/cassetta/:', contenutoCassetta);
    } catch (e) {
      console.warn('⚠️ Impossibile listare directory');
    }
    
    let fotoTrovate = 0;
    for (const file of files) {
      try {
        const filePath = join(basePath, file.name);
        console.log(`🔍 Caricamento: ${filePath}`);
        
        const content = await readFile(filePath);
        
        allegati.push({
          filename: file.name,
          content: content,
          cid: file.cid,
          contentType: 'image/jpeg'
        });
        fotoTrovate++;
        
        console.log(`✅ Foto caricata: ${file.name} (${(content.length / 1024).toFixed(1)} KB)`);
      } catch (err) {
        console.warn(`⚠️ Impossibile caricare ${file.name}: ${err.message}`);
      }
    }
    
    if (fotoTrovate === 0) {
      console.warn('⚠️ NESSUNA foto trovata - email inviata senza immagini');
    }
    
  } catch (error) {
    console.error('❌ Errore generale caricamento foto:', error.message);
  }
  
  return allegati;
}

// I valori arrivano da CODICE_CASSETTA_TORRE / CODICE_CASSETTA_CORTE (env var,
// solo server). Prima erano scritti qui in chiaro E duplicati anche nel
// frontend pubblico (checkin.js, successo-pagamento.html) — vedi anche
// api/get-session.js, che ora è l'unica altra copia di questa logica.
function determinaCodiciCassetta(appartamento, lingua) {
  const T = EMAIL_TESTI[linguaValida(lingua)];
  const generico = [{
    codice: null,
    nome: T.genericName,
    descrizione: T.fallbackDescrizione
  }];

  if (!appartamento) {
    console.warn('⚠️ Appartamento non specificato, uso codice generico');
    return generico;
  }

  const appartamentoLower = appartamento.toLowerCase();
  const codici = [];

  if (appartamentoLower.includes('corte')) {
    codici.push({
      codice: process.env.CODICE_CASSETTA_CORTE || null,
      nome: 'Corte',
      descrizione: T.corteDescrizione
    });
  }

  if (appartamentoLower.includes('torre')) {
    codici.push({
      codice: process.env.CODICE_CASSETTA_TORRE || null,
      nome: 'Torre',
      descrizione: T.torreDescrizione
    });
  }

  if (codici.length === 0) {
    console.warn('⚠️ Appartamento non riconosciuto:', appartamento);
    return generico;
  }

  return codici;
}

function generaHTMLEmailOspite(dati, codiciCassetta, lingua) {
  const L = linguaValida(lingua);
  const T = EMAIL_TESTI[L];

  const dataFormattata = new Date(dati.dataCheckin).toLocaleDateString(localeEmail(L), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const totale = typeof dati.totale === 'string' ? parseFloat(dati.totale) : (dati.totale || 0);

  const CHECKIN_OPEN_TIME = "16:00";
  const CHECKIN_CLOSE_TIME = "00:00";
  const CHECKOUT_CLOSE_TIME = "10:00";

  let codiciHTML = '';
  
  if (codiciCassetta.length === 1) {
    codiciHTML = `
      <div class="code-section">
        <div class="code-title">${T.codeTitleSingle}</div>
        <div class="code-subtitle">${codiciCassetta[0].nome}</div>
        <div class="code-box">${codiciCassetta[0].codice}</div>
        <div class="code-note">${T.codeNoteSingle}</div>
      </div>
    `;
  } else {
    codiciHTML = `
      <div class="code-section">
        <div class="code-title">${T.codeTitleMulti}</div>
        <div class="code-note" style="margin-bottom: 20px;">${T.bothApartmentsNote}</div>
        
        ${codiciCassetta.map(cassetta => `
          <div class="code-sub-section">
            <div class="code-subtitle">🏠 ${cassetta.nome}</div>
            <div class="code-box">${cassetta.codice}</div>
            <small style="display: block; margin-top: 5px; opacity: 0.9; font-size: 14px;">
              ${cassetta.descrizione}
            </small>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="${L}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Georgia', 'Times New Roman', serif;
          line-height: 1.6;
          color: #1e1917;
          background-color: #f1e9d9;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background: #fffdf7;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(58,21,27,0.12);
          border: 1px solid rgba(220, 207, 182, 0.5);
        }
        .header {
          background: linear-gradient(135deg, #8c6f2e 0%, #7a2e39 100%);
          color: #fffdf7;
          padding: 36px 20px 32px;
          text-align: center;
        }
        .header img.brand-logo { height: 46px; width: auto; margin-bottom: 16px; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 500; font-family: 'Georgia', 'Times New Roman', serif; }
        .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.95; font-family: 'Arial', sans-serif; }
        .content { padding: 40px 30px; font-family: 'Arial', sans-serif; }
        .welcome-text { font-size: 18px; color: #6c5f55; margin-bottom: 20px; }
        .code-section {
          background: linear-gradient(135deg, #7a2e39 0%, #5f222b 100%);
          color: white;
          padding: 30px;
          border-radius: 12px;
          text-align: center;
          margin: 30px 0;
        }
        .code-title { font-size: 20px; font-weight: 600; margin-bottom: 15px; }
        .code-subtitle { font-size: 16px; margin-bottom: 10px; font-weight: 500; }
        .code-box {
          background: rgba(255, 255, 255, 0.2);
          padding: 20px;
          border-radius: 8px;
          font-size: 48px;
          font-weight: bold;
          letter-spacing: 8px;
          margin: 15px 0;
        }
        .code-sub-section {
          background: rgba(255, 255, 255, 0.1);
          padding: 20px;
          border-radius: 8px;
          margin: 15px 0;
        }
        .code-sub-section .code-box { font-size: 40px; padding: 15px; background: rgba(255, 255, 255, 0.2); }
        .code-note { font-size: 14px; opacity: 0.9; margin-top: 10px; }
        .info-section {
          background: #f1e9d9;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 4px solid #b08d3c;
        }
        .info-title { font-size: 18px; font-weight: 600; color: #6c5f55; margin-bottom: 15px; }
        .info-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #dccfb6;
        }
        .info-item:last-child { border-bottom: none; }
        .info-label { font-weight: 500; color: #6c5f55; }
        .info-value { font-weight: 600; color: #1e1917; }
        .instructions {
          background: #fff9e6;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 4px solid #b08d3c;
        }
        .instructions h3 { color: #7a2e39; margin-top: 0; font-size: 18px; margin-bottom: 15px; }
        .instructions p { margin: 10px 0; color: #6c5f55; line-height: 1.8; }
        .address-block {
          background: white;
          padding: 12px;
          border-radius: 6px;
          margin: 10px 0;
          border-left: 3px solid #b08d3c;
        }
        .photo-gallery { margin: 30px 0; }
        .photo-gallery h3 { color: #6c5f55; font-size: 20px; margin-bottom: 20px; text-align: center; }
        .photo-item { margin: 20px 0; text-align: center; }
        .photo-item img {
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          box-shadow: 0 4px 15px rgba(58,21,27,0.18);
          margin-bottom: 10px;
        }
        .photo-caption { font-size: 14px; color: #6c5f55; font-style: italic; }
        .footer {
          background: #f1e9d9;
          padding: 30px;
          text-align: center;
          color: #6c5f55;
          font-size: 14px;
          font-family: 'Arial', sans-serif;
        }
        .footer p { margin: 5px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="cid:logo_columbera" alt="La Columbera" class="brand-logo">
          <h1>${T.headerTitle}</h1>
          <p>${T.headerSubtitle}</p>
        </div>
        
        <div class="content">
          <p class="welcome-text">
            Gentile <strong>${dati.ospiti?.[0]?.nome || T.guestFallback} ${dati.ospiti?.[0]?.cognome || ''}</strong>,
          </p>
          
          <p>
            ${T.thanksText}
          </p>
          
          ${codiciHTML}
          
          <div class="info-section">
            <div class="info-title">${T.infoTitle}</div>
            <div class="info-item">
              <span class="info-label">${T.labelCheckin}</span>
              <span class="info-value">${dataFormattata}</span>
            </div>
            <div class="info-item">
              <span class="info-label">${T.labelApartment}</span>
              <span class="info-value">${nomeAppartamentoEmail(dati.appartamento, L) || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">${T.labelGuests}</span>
              <span class="info-value">${dati.numeroOspiti || 0}</span>
            </div>
            <div class="info-item">
              <span class="info-label">${T.labelNights}</span>
              <span class="info-value">${dati.numeroNotti || 0}</span>
            </div>
            <div class="info-item">
              <span class="info-label">${T.labelTaxPaid}</span>
              <span class="info-value">€${totale.toFixed(2)}</span>
            </div>
          </div>
          
          <div class="instructions">
            <h3>${T.instructionsTitle}</h3>
            
            <div class="address-block">
              <strong>${T.addressPropertyLabel}</strong>
              <p style="margin: 5px 0;">
                Via Centrale, 48<br>
                38123 Trento (TN)
              </p>
            </div>

            <div class="address-block">
              <strong>${T.addressParkingLabel}</strong>
              <p style="margin: 5px 0;">
                Via Val Gola, 22<br>
                38123 Trento (TN)
              </p>
            </div>

            <div class="address-block">
              <strong>${T.hoursLabel}</strong>
              <p style="margin: 5px 0;">
                ${T.checkinHoursText(CHECKIN_OPEN_TIME, CHECKIN_CLOSE_TIME)}<br>
                ${T.checkoutHoursText(CHECKOUT_CLOSE_TIME)}
              </p>
            </div>

            <p style="margin-top: 20px;">
              • ${T.instruction1}
            </p>

            <p>
              • ${T.instruction2}
            </p>

            <p>
              • ${T.instruction3}
            </p>
          </div>

          <div class="photo-gallery">
            <h3>${T.galleryTitle}</h3>
            
            <div class="photo-item">
              <img src="cid:ingresso_proprieta" alt="Ingresso Proprietà">
              <p class="photo-caption">${T.photo1Caption}</p>
            </div>

            <div class="photo-item">
              <img src="cid:cassetta_sicurezza" alt="Cassetta di Sicurezza">
              <p class="photo-caption">${T.photo2Caption(codiciCassetta.length > 1, codiciCassetta.map(c => c.codice).join(' / '))}</p>
            </div>

            <div class="photo-item">
              <img src="cid:ubicazione_cassetta" alt="Ubicazione Cassetta">
              <p class="photo-caption">${T.photo3Caption(codiciCassetta.length > 1)}</p>
            </div>
          </div>
          
          <p style="margin-top: 30px; color: #6c5f55;">
            ${T.closingText}
          </p>
        </div>
        
        <div class="footer">
          <p><strong>La Columbera</strong></p>
          <p>${T.footerTagline}</p>
          <p style="margin-top: 15px; font-size: 12px;">
            ${T.footerAutomated}
          </p>
          <p style="font-size: 12px;">
            ${T.footerGenerated(new Date().toLocaleString(localeEmail(L)))}
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function inviaEmailConNodemailer(emailDestinatario, dati, htmlContent, allegati, lingua) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const L = linguaValida(lingua);
  const T = EMAIL_TESTI[L];
  const totale = typeof dati.totale === 'string' ? parseFloat(dati.totale) : (dati.totale || 0);

  const oggetto = T.subjectLine(
    nomeAppartamentoEmail(dati.appartamento, L) || 'Appartamento',
    new Date(dati.dataCheckin).toLocaleDateString(localeEmail(L))
  );

  const mailOptions = {
    from: '"La Columbera" <' + process.env.EMAIL_USER + '>',
    to: emailDestinatario,
    subject: oggetto,
    html: htmlContent,
    attachments: allegati.length > 0 ? allegati : undefined
  };

  await transporter.sendMail(mailOptions);
  console.log(`✅ Email inviata a ${maskEmail(emailDestinatario)}${allegati.length > 0 ? ' con ' + allegati.length + ' foto allegate' : ' senza foto'}`);
}
