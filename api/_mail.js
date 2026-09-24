// Template email di La Columbera (proprietario + ospite).
// Il prefisso "_" evita che Vercel lo esponga come endpoint: è solo un modulo condiviso.
// Solo tabelle + stili inline + font di sistema: è l'unico modo per avere un rendering
// coerente su Gmail, Outlook e Apple Mail.
const x=require('./x.js');

const C={wine:'#7A2E39',wine2:'#5F222B',wine3:'#3A151B',ink:'#1E1917',muted:'#6C5F55',paper:'#FAF5EC',paper2:'#F1E9D9',line:'#DCCFB6',gold:'#B08D3C',white:'#FFFDF7'};
const SERIF="Georgia,'Times New Roman',serif",SANS="'Helvetica Neue',Helvetica,Arial,sans-serif",MONO="'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const APT={torre:['Torre','Appartamento con 2 camere da letto · due livelli'],corte:['Corte','Appartamento con 1 camera da letto · piano terra']};
const aptName=id=>(APT[id]?APT[id][0]:(x.APT_LABEL[id]||id));
const aptSub=id=>APT[id]?APT[id][1]:'';
const dLong=s=>{const m=/^(\d{4})-(\d\d)-(\d\d)/.exec(s||'');if(!m)return x.F2(s);
  try{const t=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});return t.charAt(0).toUpperCase()+t.slice(1)}catch{return x.F2(s)}};
const eur=n=>{const v=Number(n);if(!isFinite(v))return '€ '+esc(n);return '€ '+v.toLocaleString('it-IT',{minimumFractionDigits:Number.isInteger(v)?0:2,maximumFractionDigits:2})};
const plural=(n,one,many)=>n+' '+(+n===1?one:many);
// Codice spaziato per la lettura (es. "A1B2C3" -> "A1B 2C3" solo visivamente: il testo copiato resta intero grazie al letter-spacing)
const codeBox=code=>`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border:1px dashed ${C.gold};border-radius:10px"><tr><td align="center" style="padding:20px 16px">
<div style="font-family:${SANS};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${C.muted};font-weight:700">Numero di prenotazione</div>
<div style="font-family:${MONO};font-size:34px;line-height:40px;font-weight:700;letter-spacing:8px;color:${C.wine};padding:8px 0 0 8px">${esc(code)}</div></td></tr></table>`;

const row=(k,v,last)=>`<tr><td style="padding:13px 0;${last?'':`border-bottom:1px solid ${C.line};`}font-family:${SANS};font-size:14px;color:${C.muted}">${k}</td><td align="right" style="padding:13px 0;${last?'':`border-bottom:1px solid ${C.line};`}font-family:${SANS};font-size:15px;font-weight:700;color:${C.ink}">${v}</td></tr>`;

const recap=b=>`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td colspan="2" style="padding:0 0 14px"><div style="font-family:${SERIF};font-size:22px;line-height:28px;color:${C.ink}">${esc(aptName(b.id))}</div>${aptSub(b.id)?`<div style="font-family:${SANS};font-size:13px;color:${C.muted};padding-top:2px">${esc(aptSub(b.id))}</div>`:''}</td></tr>
${row('Check-in',esc(dLong(b.da)))}${row('Check-out',esc(dLong(b.a)))}${row('Notti',esc(plural(b.notti,'notte','notti')))}${row('Ospiti',esc(plural(b.ospiti,'persona','persone')))}
<tr><td style="padding:16px 0 0;font-family:${SANS};font-size:14px;color:${C.muted};vertical-align:middle">Importo pagato</td><td align="right" style="padding:16px 0 0;font-family:${SERIF};font-size:28px;line-height:32px;color:${C.wine}">${esc(eur(b.totale))}</td></tr></table>`;

const button=(href,label)=>`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="${C.wine}" style="border-radius:999px"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:.3px;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;

const shell=({site,preheader,eyebrow,title,body})=>`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.paper2};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper2}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.white};border-radius:14px;overflow:hidden;border:1px solid ${C.line}">
<tr><td align="center" bgcolor="${C.wine2}" style="background:${C.wine2};padding:22px 24px 18px">
<a href="${esc(site)}" target="_blank" style="text-decoration:none"><img src="${esc(site)}/img/brand/email-logo.png" width="240" alt="La Columbera · Abitazione in villa storica" style="display:block;width:240px;max-width:100%;height:auto;border:0;color:#F1E9D9;font-family:${SERIF};font-size:22px"></a></td></tr>
<tr><td height="4" style="height:4px;line-height:4px;font-size:0;background:${C.gold}">&nbsp;</td></tr>
<tr><td style="padding:34px 32px 8px" align="center">
<div style="font-family:${SANS};font-size:11px;letter-spacing:2.6px;text-transform:uppercase;color:${C.gold};font-weight:700">${esc(eyebrow)}</div>
<h1 style="margin:10px 0 0;font-family:${SERIF};font-weight:400;font-size:29px;line-height:36px;color:${C.ink}">${title}</h1></td></tr>
${body}
<tr><td bgcolor="${C.wine3}" style="background:${C.wine3};padding:24px 32px" align="center">
<div style="font-family:${SERIF};font-size:16px;color:#F1E9D9">La Columbera</div>
<div style="font-family:${SANS};font-size:12px;line-height:19px;color:#CDBFAE;padding-top:6px">Dimora storica del XV secolo · Ravina, Trento<br><a href="tel:+393517043594" style="color:#CDBFAE;text-decoration:none">+39 351 704 3594</a> · <a href="mailto:lacolumbera@gmail.com" style="color:#CDBFAE;text-decoration:none">lacolumbera@gmail.com</a></div></td></tr>
</table></td></tr></table></body></html>`;

const sec=(inner,pad)=>`<tr><td style="padding:${pad||'22px 32px 0'}">${inner}</td></tr>`;

// ---------------- EMAIL OSPITE ----------------
const guestMail=(b,site)=>{
  const link=site+'/area-clienti.html?code='+encodeURIComponent(b.code);
  const nome=String(b.nome||'').trim().split(/\s+/)[0];
  const step=(n,t,d)=>`<tr><td valign="top" width="40" style="padding:0 0 14px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="30" height="30" bgcolor="${C.paper2}" style="width:30px;height:30px;border-radius:15px;background:${C.paper2};font-family:${SERIF};font-size:15px;color:${C.wine};font-weight:700">${n}</td></tr></table></td><td valign="top" style="padding:0 0 14px"><div style="font-family:${SANS};font-size:15px;font-weight:700;color:${C.ink}">${t}</div><div style="font-family:${SANS};font-size:13.5px;line-height:20px;color:${C.muted};padding-top:2px">${d}</div></td></tr>`;
  const html=shell({site,eyebrow:'Prenotazione confermata',preheader:`Il tuo codice è ${b.code}: con questo accedi all'area personale per check-in online e Trentino Guest Card.`,
    title:`Grazie${nome?', '+esc(nome):''}!<br>Ti aspettiamo alla Columbera`,
    body:
    sec(`<p style="margin:0;font-family:${SANS};font-size:15px;line-height:24px;color:${C.ink};text-align:center">Abbiamo ricevuto il tuo pagamento e la prenotazione è <b>confermata</b>. Qui sotto trovi il riepilogo del tuo soggiorno.</p>`,'14px 32px 0')+
    sec(codeBox(b.code),'24px 32px 0')+
    sec(`<div style="font-family:${SANS};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${C.muted};font-weight:700;padding-bottom:12px">Riepilogo del soggiorno</div>${recap(b)}`,'30px 32px 0')+
    sec(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border-radius:12px"><tr><td style="padding:24px 22px 10px">
<div style="font-family:${SERIF};font-size:20px;line-height:26px;color:${C.ink};padding-bottom:8px">Il tuo codice apre l'area personale</div>
<p style="margin:0 0 18px;font-family:${SANS};font-size:14px;line-height:22px;color:${C.muted}">Con il numero di prenotazione <b style="color:${C.wine};font-family:${MONO};letter-spacing:1px">${esc(b.code)}</b> puoi accedere all'<b>area personale</b> del nostro sito e, prima di arrivare, sbrigare tutto online:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${step('1','Check-in online','Compili i dati degli ospiti in pochi minuti, così all\'arrivo è tutto pronto.')}${step('2','Trentino Guest Card','La richiedi direttamente dall\'area personale: musei, trasporti e attrazioni del territorio inclusi.')}</table>
</td></tr><tr><td style="padding:4px 22px 26px" align="center">${button(link,'Vai alla mia area personale')}<div style="font-family:${SANS};font-size:12px;color:${C.muted};padding-top:12px">Il codice viene inserito in automatico. Se preferisci, vai su <a href="${esc(site)}/area-clienti.html" style="color:${C.wine}">area clienti</a> e digitalo a mano.</div></td></tr></table>`,'30px 32px 0')+
    sec(`<p style="margin:0;font-family:${SANS};font-size:14px;line-height:22px;color:${C.muted};text-align:center">Conserva questa email: ti servirà il codice per tutto il soggiorno.<br>Per qualsiasi domanda rispondi pure a questo messaggio o scrivici a <a href="mailto:lacolumbera@gmail.com" style="color:${C.wine}">lacolumbera@gmail.com</a>.</p>`,'26px 32px 32px')});
  const text=`Grazie${nome?', '+nome:''}! La tua prenotazione a La Columbera è confermata.

NUMERO DI PRENOTAZIONE: ${b.code}

${aptName(b.id)}${aptSub(b.id)?' ('+aptSub(b.id)+')':''}
Check-in:  ${dLong(b.da)}
Check-out: ${dLong(b.a)}
Notti:     ${b.notti}
Ospiti:    ${b.ospiti}
Importo pagato: ${eur(b.totale)}

Con il codice prenotazione puoi accedere all'area personale del sito per fare il check-in online e richiedere la Trentino Guest Card:
${link}

Per qualsiasi domanda: lacolumbera@gmail.com · +39 351 704 3594
La Columbera · Ravina, Trento`;
  return{subject:`Prenotazione confermata · La Columbera ${aptName(b.id)} · ${b.code}`,html,text}};

// ---------------- EMAIL PROPRIETARIO ----------------
const ownerMail=(b,site)=>{
  const tel=String(b.tel||'').trim();
  const kv=(k,v,last)=>`<tr><td style="padding:10px 0;${last?'':`border-bottom:1px solid ${C.line};`}font-family:${SANS};font-size:13px;color:${C.muted};width:90px">${k}</td><td style="padding:10px 0;${last?'':`border-bottom:1px solid ${C.line};`}font-family:${SANS};font-size:15px;font-weight:600;color:${C.ink}">${v}</td></tr>`;
  const html=shell({site,eyebrow:'Pagamento ricevuto',preheader:`${aptName(b.id)} · ${dLong(b.da)} · ${plural(b.notti,'notte','notti')} · ${eur(b.totale)} · ${b.nome||''}`,
    title:`Nuova prenotazione da<br><span style="color:${C.wine}">${esc(b.nome||'un ospite')}</span>`,
    body:
    sec(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td bgcolor="#E4EFE2" style="background:#E4EFE2;border-radius:999px;padding:6px 16px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.6px;color:#2F6B3B">● PRENOTAZIONE CONFERMATA</td></tr></table>`,'14px 32px 0')+
    sec(codeBox(b.code),'22px 32px 0')+
    sec(`<div style="font-family:${SANS};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${C.muted};font-weight:700;padding-bottom:12px">Soggiorno</div>${recap(b)}`,'28px 32px 0')+
    sec(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border-radius:12px"><tr><td style="padding:20px 22px 12px">
<div style="font-family:${SANS};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${C.muted};font-weight:700;padding-bottom:6px">Dati ospite</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${kv('Nome',esc(b.nome||'—'))}${kv('Email',b.email?`<a href="mailto:${esc(b.email)}" style="color:${C.wine};text-decoration:none">${esc(b.email)}</a>`:'—')}${kv('Telefono',tel?`<a href="tel:${esc(tel.replace(/[^\d+]/g,''))}" style="color:${C.wine};text-decoration:none">${esc(tel)}</a>`:'—',true)}</table></td></tr></table>`,'28px 32px 0')+
    sec(`<p style="margin:0;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};text-align:center">L'ospite riceve la mail di conferma con lo stesso codice.<br>Rispondendo a questa email scrivi direttamente all'ospite.${b.pagamento?`<br><span style="font-family:${MONO};font-size:11px">Rif. Stripe: ${esc(b.pagamento)}</span>`:''}</p>`,'22px 32px 32px')});
  const text=`Nuova prenotazione confermata da ${b.nome||'un ospite'} · pagamento ricevuto

NUMERO DI PRENOTAZIONE: ${b.code}

${aptName(b.id)}
Check-in:  ${dLong(b.da)}
Check-out: ${dLong(b.a)}
Notti:     ${b.notti}
Ospiti:    ${b.ospiti}
Importo pagato: ${eur(b.totale)}

Ospite
Nome:     ${b.nome||'—'}
Email:    ${b.email||'—'}
Telefono: ${tel||'—'}${b.pagamento?'\nRif. Stripe: '+b.pagamento:''}`;
  return{subject:`Nuova prenotazione · ${aptName(b.id)} · ${dLong(b.da)} · ${b.code}`,html,text}};

module.exports={guestMail,ownerMail};
