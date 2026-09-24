// api/genera-pdf-email.js
// VERSIONE CORRETTA - Tutti gli ospiti nel PDF + documenti allegati correttamente
import nodemailer from 'nodemailer';

// L'HTML generato da generaHTMLRiepilogo() viene inviato a Browserless, che lo
// apre in un vero browser per produrre il PDF. Ogni campo qui sotto arriva da
// dati inviati dall'ospite (o da chiunque chiami direttamente questa API, dato
// che è un endpoint pubblico — i vincoli del form HTML, es. un <select> con
// valori fissi, non impediscono a una richiesta POST diretta di mandare
// qualsiasi stringa). Senza escaping, un valore tipo "<script>...</script>" nel
// cognome o nel numero documento verrebbe eseguito dentro il browser che genera
// il PDF invece di essere mostrato come testo.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  // ✅ FIX SICUREZZA: endpoint chiamato solo da stripeWebhook.js dopo un
  // pagamento confermato. Prima non c'era alcun controllo: chiunque poteva
  // generare PDF e far inviare email a proprio piacimento (costo su
  // Browserless/SMTP, rischio di uso come relay di spam/phishing). Stesso
  // secret già usato per invia-email-ospite.js e per il GET di
  // salva-dati-temporanei.js.
  const secretAtteso = process.env.INTERNAL_API_SECRET;
  const secretRicevuto = req.headers['x-internal-secret'];

  if (!secretAtteso) {
    console.error('❌ INTERNAL_API_SECRET non configurato nelle variabili d\'ambiente');
    return res.status(500).json({ error: "Configurazione server incompleta" });
  }

  if (secretRicevuto !== secretAtteso) {
    console.warn('⚠️ Tentativo di generazione PDF senza secret valido');
    return res.status(401).json({ error: "Non autorizzato" });
  }

  console.log('📧 Inizio generazione PDF e invio email');

  try {
    const { datiPrenotazione, emailDestinatario } = req.body;

    if (!datiPrenotazione || !emailDestinatario) {
      return res.status(400).json({
        error: 'Dati prenotazione ed email destinatario sono obbligatori'
      });
    }

    // Converti totale in numero se è stringa
    if (typeof datiPrenotazione.totale === 'string') {
      datiPrenotazione.totale = parseFloat(datiPrenotazione.totale);
    }

    // Validazione e normalizzazione documenti
    if (!Array.isArray(datiPrenotazione.documenti)) {
      console.warn('⚠️ documenti non è un array, inizializzo array vuoto');
      datiPrenotazione.documenti = [];
    }

    // ✅ DEBUG DETTAGLIATO: Verifica struttura dati ricevuti
    console.log('📊 === DATI RICEVUTI ===');
    console.log('  numeroOspiti:', datiPrenotazione.ospiti?.length || 0);
    console.log('  numeroDocumenti:', datiPrenotazione.documenti.length);
    console.log('  totale:', datiPrenotazione.totale);

    datiPrenotazione.ospiti?.forEach((o, i) => {
      console.log(`  ospite[${i}]: presente=${!!(o.cognome && o.nome)}, isResp=${o.isResponsabile}`);
    });

    datiPrenotazione.documenti?.forEach((d, i) => {
      const hasBase64 = !!d.base64;
      const base64Len = d.base64?.length || 0;
      const estimatedKB = Math.round(base64Len * 0.75 / 1024);
      console.log(`  doc[${i}]: ospite=${d.ospiteNumero}, file=${d.nomeFile}, hasBase64=${hasBase64}, ~${estimatedKB}KB`);
    });
    console.log('======================');

    // 1. Genera HTML per il PDF
    const htmlContent = generaHTMLRiepilogo(datiPrenotazione);

    let pdfBuffer = null;
    let pdfGenerato = false;

    // 2. Prova a generare PDF con Browserless
    try {
      console.log('🌐 Tentativo generazione PDF con Browserless...');
      pdfBuffer = await generaPDFConBrowserless(htmlContent);
      pdfGenerato = true;
      console.log('✅ PDF generato con successo');
    } catch (pdfError) {
      console.warn('⚠️ Impossibile generare PDF:', pdfError.message);
      console.log('📧 Procedo con invio email senza PDF');
    }

    // 3. ✅ Prepara allegati documenti (con validazione robusta)
    const allegatiDocumenti = preparaAllegatiDocumenti(datiPrenotazione.documenti);
    console.log(`📎 Allegati preparati: ${allegatiDocumenti.length} su ${datiPrenotazione.documenti.length} documenti`);

    // 4. Invia email
    if (pdfGenerato && pdfBuffer) {
      await inviaEmailConPDF(emailDestinatario, datiPrenotazione, pdfBuffer, allegatiDocumenti);
      console.log('✅ Email inviata CON PDF e documenti allegati');
    } else {
      await inviaEmailSenzaPDF(emailDestinatario, datiPrenotazione, allegatiDocumenti);
      console.log('✅ Email inviata SENZA PDF (solo testo + documenti)');
    }

    return res.status(200).json({
      success: true,
      message: pdfGenerato
        ? 'PDF generato e email inviata con successo'
        : 'Email inviata con successo (PDF non disponibile)',
      pdfGenerato: pdfGenerato,
      numeroDocumenti: allegatiDocumenti.length
    });

  } catch (error) {
    console.error('❌ Errore finale:', error);
    console.error('Stack:', error.stack);
    return res.status(500).json({
      error: 'Errore interno: ' + error.message
    });
  }
}

// ✅ FUNZIONE CORRETTA: Prepara allegati documenti con validazione robusta
function preparaAllegatiDocumenti(documenti) {
  if (!Array.isArray(documenti) || documenti.length === 0) {
    console.log('📎 Nessun documento da allegare');
    return [];
  }

  const allegati = [];

  documenti.forEach((doc, index) => {
    console.log(`📎 Processando documento ${index + 1}:`, {
      ospiteNumero: doc?.ospiteNumero,
      nomeFile: doc?.nomeFile,
      tipo: doc?.tipo,
      hasBase64: !!doc?.base64,
      base64Type: typeof doc?.base64
    });

    // ✅ Validazione campo obbligatori
    if (!doc) {
      console.warn(`⚠️ Documento ${index + 1} è null/undefined, saltato`);
      return;
    }

    if (!doc.base64) {
      console.warn(`⚠️ Documento ${index + 1} senza base64, saltato. Chiavi disponibili:`, Object.keys(doc));
      return;
    }

    if (!doc.nomeFile) {
      console.warn(`⚠️ Documento ${index + 1} senza nomeFile, uso nome generico`);
      doc.nomeFile = `documento_${index + 1}.jpg`;
    }

    try {
      // ✅ Gestisce sia base64 con prefisso data: che puro base64
      let base64Data = doc.base64;

      if (typeof base64Data !== 'string') {
        console.warn(`⚠️ Documento ${index + 1}: base64 non è una stringa (tipo: ${typeof base64Data}), saltato`);
        return;
      }

      // Rimuovi il prefixo data:image/...;base64, se presente
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }

      if (!base64Data || base64Data.length < 100) {
        console.warn(`⚠️ Documento ${index + 1}: base64 troppo corto (${base64Data?.length} chars), saltato`);
        return;
      }

      // Converti base64 in Buffer
      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length < 100) {
        console.warn(`⚠️ Documento ${index + 1}: buffer troppo piccolo (${buffer.length} bytes), saltato`);
        return;
      }

      // Determina il nome file con prefisso ospite
      const ospitePrefix = doc.ospiteNumero ? `Ospite_${doc.ospiteNumero}_` : '';
      const nomeFile = `${ospitePrefix}${doc.nomeFile}`;

      // Determina il content type
      const contentType = doc.tipo || 'image/jpeg';

      allegati.push({
        filename: nomeFile,
        content: buffer,
        contentType: contentType
      });

      console.log(`✅ Allegato preparato: ${nomeFile} (${(buffer.length / 1024).toFixed(2)} KB)`);

    } catch (error) {
      console.error(`❌ Errore preparazione documento ${index + 1}:`, error.message);
    }
  });

  console.log(`📎 Totale allegati preparati: ${allegati.length}/${documenti.length}`);
  return allegati;
}

// FUNZIONE: Genera PDF usando Browserless API
async function generaPDFConBrowserless(htmlContent) {
  const browserlessToken = process.env.BROWSERLESS_API_TOKEN;

  if (!browserlessToken) {
    throw new Error('BROWSERLESS_API_TOKEN non configurato');
  }

  const url = `https://production-sfo.browserless.io/pdf?token=${browserlessToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      html: htmlContent,
      options: {
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
        printBackground: true,
        scale: 1
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Browserless error (${response.status}): ${errorText}`);
  }

  const pdfBuffer = await response.arrayBuffer();
  console.log(`✅ PDF generato: ${(pdfBuffer.byteLength / 1024).toFixed(2)} KB`);
  return Buffer.from(pdfBuffer);
}

// ✅ FUNZIONE CORRETTA: Genera HTML con TUTTI gli ospiti
function generaHTMLRiepilogo(dati) {
  const dataFormattata = new Date(dati.dataCheckin).toLocaleDateString('it-IT', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const documentiValidi = Array.isArray(dati.documenti) ? dati.documenti : [];
  const totale = typeof dati.totale === 'string' ? parseFloat(dati.totale) : (dati.totale || 0);
  const ospiti = Array.isArray(dati.ospiti) ? dati.ospiti : [];

  console.log(`📄 Generazione HTML: ${ospiti.length} ospiti, ${documentiValidi.length} documenti`);

  // ✅ Genera HTML per TUTTI gli ospiti (non solo ospite 1), uno dietro l'altro:
  // nessun page-break forzato ogni 2 ospiti. "page-break-inside: avoid" su
  // .ospite (vedi CSS sotto) evita solo che UNA scheda venga tagliata a metà
  // tra due pagine; il resto del flusso lo decide il renderer in base allo
  // spazio disponibile, come per qualunque contenuto continuo.
  const ospitiHTML = ospiti.map((ospite) => {
    // Cerca documento per questo ospite specifico
    const documento = documentiValidi.find(d => d && d.ospiteNumero === ospite.numero);

    return `
      <div class="ospite ${ospite.isResponsabile ? 'responsabile' : ''}">
        <div class="ospite-header">
          <div class="ospite-nome">${escapeHtml(ospite.cognome) || 'N/A'} ${escapeHtml(ospite.nome) || 'N/A'}</div>
          ${ospite.isResponsabile
            ? '<div class="ospite-badge">RESPONSABILE</div>'
            : `<div class="ospite-number">Ospite ${escapeHtml(ospite.numero)}</div>`
          }
        </div>

        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Genere</div>
            <div class="info-value">${ospite.genere === 'M' ? 'Maschio' : ospite.genere === 'F' ? 'Femmina' : 'N/A'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Data Nascita</div>
            <div class="info-value">${ospite.nascita ? new Date(ospite.nascita).toLocaleDateString('it-IT') : 'N/A'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Età</div>
            <div class="info-value">${ospite.eta || 0} anni ${(ospite.eta || 0) >= 4 ? '(tassabile)' : '(esente)'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Cittadinanza</div>
            <div class="info-value">${escapeHtml(ospite.cittadinanza) || 'N/A'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Luogo Nascita</div>
            <div class="info-value">${escapeHtml(ospite.luogoNascita) || 'N/A'}</div>
          </div>
          ${ospite.comune && ospite.provincia ? `
          <div class="info-item">
            <div class="info-label">Comune/Provincia</div>
            <div class="info-value">${escapeHtml(ospite.comune)} (${escapeHtml(ospite.provincia)})</div>
          </div>
          ` : ''}
        </div>

        ${ospite.isResponsabile && ospite.tipoDocumento ? `
        <div class="info-grid" style="margin-top: 10px;">
          <div class="info-item">
            <div class="info-label">Tipo Documento</div>
            <div class="info-value">${escapeHtml(ospite.tipoDocumento)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Numero Documento</div>
            <div class="info-value">${escapeHtml(ospite.numeroDocumento) || 'N/A'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Luogo Rilascio</div>
            <div class="info-value">${escapeHtml(ospite.luogoRilascio) || 'N/A'}</div>
          </div>
        </div>
        ` : ''}

        ${documento ? `
        <div class="documento-note">
          <strong>📎 Documento allegato:</strong> ${escapeHtml(documento.nomeFile) || 'Documento'}
          (${Math.round((documento.dimensione || 0) / 1024)} KB) -
          <em>Vedi allegati email separati</em>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: 'Arial', sans-serif; line-height: 1.3; color: #333; margin: 0; padding: 0; font-size: 11px; }
        .header { text-align: center; margin-bottom: 8px; border-bottom: 2px solid #3498db; padding-bottom: 8px; }
        .header h1 { color: #2c3e50; font-size: 18px; margin: 0 0 4px 0; }
        .header p { font-size: 10px; margin: 0; color: #7f8c8d; }
        .section { margin: 6px 0; background: #f8f9fa; padding: 6px 8px; border-radius: 4px; border-left: 3px solid #3498db; }
        .section h2 { font-size: 13px; margin: 0 0 6px 0; color: #2c3e50; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0; }
        .info-item { background: white; padding: 5px 7px; border-radius: 3px; border: 1px solid #e9ecef; }
        .info-label { font-weight: bold; color: #495057; font-size: 9px; text-transform: uppercase; line-height: 1.2; }
        .info-value { color: #2c3e50; font-size: 11px; margin-top: 2px; line-height: 1.2; }
        .totale-section { background: #e8f5e8; border: 2px solid #28a745; padding: 8px; border-radius: 4px; text-align: center; margin: 6px 0; }
        .totale-section h2 { font-size: 13px; margin: 0 0 6px 0; color: #28a745; }
        .totale-amount { font-size: 20px; font-weight: bold; color: #28a745; margin: 4px 0; }
        .ospite { background: white; border: 1px solid #dee2e6; border-radius: 4px; padding: 8px; margin: 6px 0; page-break-inside: avoid; }
        .ospite.responsabile { border-color: #28a745; background: #f8fff9; }
        .ospite-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6; }
        .ospite-nome { font-size: 13px; font-weight: bold; color: #2c3e50; }
        .ospite-badge { background: #28a745; color: white; padding: 2px 8px; border-radius: 10px; font-size: 9px; }
        .ospite-number { background: #6c757d; color: white; padding: 2px 8px; border-radius: 10px; font-size: 9px; }
        .ospite .info-grid { grid-template-columns: 1fr 1fr; gap: 5px; }
        .ospite .info-item { padding: 4px 6px; }
        .ospite .info-label { font-size: 8px; }
        .ospite .info-value { font-size: 10px; }
        .documento-note { background: #fff3cd; border: 1px solid #ffc107; padding: 5px 7px; border-radius: 3px; margin-top: 6px; font-size: 9px; }
        .section ul { margin: 6px 0 0 0; padding-left: 18px; }
        .section li { font-size: 10px; margin: 3px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Riepilogo Check-in</h1>
        <p>Generato il ${new Date().toLocaleString('it-IT')}</p>
      </div>

      <div class="section">
        <h2>📍 Dettagli Soggiorno</h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Data Check-in</div>
            <div class="info-value">${dataFormattata}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Appartamento</div>
            <div class="info-value">${escapeHtml(dati.appartamento) || 'Non specificato'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Numero Ospiti</div>
            <div class="info-value">${escapeHtml(dati.numeroOspiti) || ospiti.length}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Numero Notti</div>
            <div class="info-value">${escapeHtml(dati.numeroNotti) || 0}</div>
          </div>
        </div>
      </div>

      <div class="totale-section">
        <h2>💰 Totale Tassa di Soggiorno</h2>
        <div class="totale-amount">€${totale.toFixed(2)}</div>
      </div>

      <div class="section">
        <h2>👥 Ospiti Registrati (${ospiti.length})</h2>
      </div>

      ${ospitiHTML}

      ${documentiValidi.length > 0 ? `
      <div class="section" style="page-break-before: auto;">
        <h2>📎 Documenti Allegati</h2>
        <p style="font-size: 10px; margin: 4px 0;">I documenti di identità sono allegati separatamente a questa email:</p>
        <ul>
          ${documentiValidi.map(doc => `
            <li><strong>Ospite ${escapeHtml(doc.ospiteNumero) || '?'}:</strong> ${escapeHtml(doc.nomeFile)} (~${Math.round((doc.dimensione || 0) / 1024)} KB)</li>
          `).join('')}
        </ul>
      </div>
      ` : `
      <div class="section" style="page-break-before: auto;">
        <h2>📎 Documenti</h2>
        <p style="font-size: 10px; margin: 4px 0; color: #e74c3c;">Nessun documento allegato ricevuto.</p>
      </div>
      `}
    </body>
    </html>
  `;
}

// Invia email CON PDF
async function inviaEmailConPDF(emailDestinatario, dati, pdfBuffer, allegatiDocumenti) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
  });

  const totale = typeof dati.totale === 'string' ? parseFloat(dati.totale) : (dati.totale || 0);
  const ospiti = Array.isArray(dati.ospiti) ? dati.ospiti : [];

  const oggetto = `Riepilogo Check-in - ${dati.appartamento || 'Appartamento'} - ${new Date(dati.dataCheckin).toLocaleDateString('it-IT')}`;

  const corpoEmail = `
Nuovo check-in ricevuto!

DETTAGLI SOGGIORNO:
- Data check-in: ${new Date(dati.dataCheckin).toLocaleDateString('it-IT')}
- Appartamento: ${dati.appartamento || 'Non specificato'}
- Ospiti: ${ospiti.length} (${dati.numeroOspiti || ospiti.length} registrati)
- Notti: ${dati.numeroNotti || 0}
- Totale tassa soggiorno: €${totale.toFixed(2)}

Responsabile: ${ospiti[0]?.cognome || 'N/A'} ${ospiti[0]?.nome || 'N/A'}

📎 ALLEGATI:
- Riepilogo completo (PDF) con tutti i ${ospiti.length} ospiti
${allegatiDocumenti.length > 0 ? `- ${allegatiDocumenti.length} documento/i di identità` : '- Nessun documento di identità allegato'}

---
Sistema Check-in Automatico
  `;

  await transporter.sendMail({
    from: '"La Columbera" <' + process.env.EMAIL_USER + '>',
    to: emailDestinatario,
    subject: oggetto,
    text: corpoEmail,
    attachments: [
      {
        filename: `checkin-${new Date(dati.dataCheckin).toISOString().split('T')[0]}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      },
      ...allegatiDocumenti
    ]
  });
}

// Invia email SENZA PDF
async function inviaEmailSenzaPDF(emailDestinatario, dati, allegatiDocumenti) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
  });

  const totale = typeof dati.totale === 'string' ? parseFloat(dati.totale) : (dati.totale || 0);
  const ospiti = Array.isArray(dati.ospiti) ? dati.ospiti : [];

  const oggetto = `Check-in Ricevuto - ${dati.appartamento || 'Appartamento'} - ${new Date(dati.dataCheckin).toLocaleDateString('it-IT')}`;

  let listaOspiti = '';
  ospiti.forEach((ospite, index) => {
    listaOspiti += `
${index + 1}. ${ospite.cognome} ${ospite.nome}${ospite.isResponsabile ? ' (RESPONSABILE)' : ''}
   - Genere: ${ospite.genere === 'M' ? 'Maschio' : 'Femmina'}
   - Età: ${ospite.eta || 0} anni
   - Cittadinanza: ${ospite.cittadinanza || 'N/A'}
   - Luogo nascita: ${ospite.luogoNascita || 'N/A'}
`;
  });

  const corpoEmail = `
Nuovo check-in ricevuto!

⚠️ NOTA: Il PDF non è stato generato. Di seguito i dettagli completi.

DETTAGLI SOGGIORNO
Data check-in: ${new Date(dati.dataCheckin).toLocaleDateString('it-IT')}
Appartamento: ${dati.appartamento || 'Non specificato'}
Numero ospiti: ${ospiti.length}
Numero notti: ${dati.numeroNotti || 0}
Totale tassa soggiorno: €${totale.toFixed(2)}

OSPITI REGISTRATI (${ospiti.length})
${listaOspiti}

${allegatiDocumenti.length > 0 ? `
DOCUMENTI ALLEGATI: ${allegatiDocumenti.length}
${allegatiDocumenti.map(doc => `- ${doc.filename}`).join('\n')}
` : 'NESSUN DOCUMENTO ALLEGATO'}

---
Sistema Check-in Automatico
  `;

  await transporter.sendMail({
    from: '"La Columbera" <' + process.env.EMAIL_USER + '>',
    to: emailDestinatario,
    subject: oggetto,
    text: corpoEmail,
    attachments: allegatiDocumenti.length > 0 ? allegatiDocumenti : undefined
  });
}
