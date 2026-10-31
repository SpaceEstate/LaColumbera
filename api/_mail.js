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
// ospiti della prenotazione: i bambini sotto i 4 anni (gratis) sono compresi nel numero e si dicono a parte
const ospitiTxt=b=>plural(b.ospiti,'persona','persone')+(+b.bambini>0?' (di cui '+plural(+b.bambini,'bambino','bambini')+' sotto i 4 anni)':'');
// Codice del sito (13 caratteri) a gruppi per leggerlo e dettarlo: "558R TE56 487A9". Gli spazi non contano: l'area clienti accetta il codice
// con o senza spazi e trattini. Gli altri codici (es. quelli di prima, di 6 caratteri) restano come sono.
const fmtCode=code=>{const s=String(code||'');return /^[0-9A-Z]{13}$/.test(s)?s.slice(0,4)+' '+s.slice(4,8)+' '+s.slice(8):s};
// I gruppi vanno a capo tra loro (mai dentro un gruppo) se lo schermo del telefono è stretto
const codeBox=code=>`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border:1px dashed ${C.gold};border-radius:10px"><tr><td align="center" style="padding:20px 16px">
<div style="font-family:${SANS};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${C.muted};font-weight:700">Codice di prenotazione</div>
<div style="font-family:${MONO};font-size:28px;line-height:38px;font-weight:700;letter-spacing:4px;word-spacing:6px;color:${C.wine};padding:8px 0 0 4px">${fmtCode(code).split(' ').map(g=>`<span style="white-space:nowrap">${esc(g)}</span>`).join(' ')}</div></td></tr></table>`;

const row=(k,v,last)=>`<tr><td style="padding:13px 0;${last?'':`border-bottom:1px solid ${C.line};`}font-family:${SANS};font-size:14px;color:${C.muted}">${k}</td><td align="right" style="padding:13px 0;${last?'':`border-bottom:1px solid ${C.line};`}font-family:${SANS};font-size:15px;font-weight:700;color:${C.ink}">${v}</td></tr>`;

const recap=b=>`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td colspan="2" style="padding:0 0 14px"><div style="font-family:${SERIF};font-size:22px;line-height:28px;color:${C.ink}">${esc(aptName(b.id))}</div>${aptSub(b.id)?`<div style="font-family:${SANS};font-size:13px;color:${C.muted};padding-top:2px">${esc(aptSub(b.id))}</div>`:''}</td></tr>
${row('Check-in',esc(dLong(b.da)))}${row('Check-out',esc(dLong(b.a)))}${row('Notti',esc(plural(b.notti,'notte','notti')))}${row('Ospiti',esc(ospitiTxt(b)))}
<tr><td style="padding:16px 0 0;font-family:${SANS};font-size:14px;color:${C.muted};vertical-align:middle">Importo pagato</td><td align="right" style="padding:16px 0 0;font-family:${SERIF};font-size:28px;line-height:32px;color:${C.wine}">${esc(eur(b.totale))}</td></tr></table>`;

const button=(href,label)=>`<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="${C.wine}" style="border-radius:999px"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:.3px;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`;

const shell=({site,preheader,eyebrow,title,body,lang})=>`<!doctype html>
<html lang="${lang||'it'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(title)}</title></head>
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

// Regola di annullamento (api/_annulla.js): fino a 7 giorni prima dell'arrivo si annulla gratis dall'area personale; dopo non è rimborsabile
const annulloRiga=b=>{const ug=require('./_annulla.js').ultimoGiorno(b.da);
  return require('./_avail.js').todayRome()<=ug?'Puoi annullare gratis dall\'area personale fino a '+dLong(ug).replace(/^./,c=>c.toLowerCase())+', con il rimborso totale sulla carta.':'Mancano meno di 7 giorni all\'arrivo: questa prenotazione non è rimborsabile.'};

// ---------------- EMAIL OSPITE ----------------
// token = chiave segreta di accesso (api/_accesso.js): va nel frammento "#", che il browser non invia mai al server né ad altri siti.
// Senza token (es. errore nel crearlo) il link apre solo l'area clienti, dove si entra con il codice di prenotazione.
const guestMail=(b,site,token)=>{
  const link=site+'/area-clienti.html'+(token?'#c='+encodeURIComponent(b.code)+'&t='+encodeURIComponent(token):'');
  const nome=String(b.nome||'').trim().split(/\s+/)[0];
  const step=(n,t,d)=>`<tr><td valign="top" width="40" style="padding:0 0 14px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="30" height="30" bgcolor="${C.paper2}" style="width:30px;height:30px;border-radius:15px;background:${C.paper2};font-family:${SERIF};font-size:15px;color:${C.wine};font-weight:700">${n}</td></tr></table></td><td valign="top" style="padding:0 0 14px"><div style="font-family:${SANS};font-size:15px;font-weight:700;color:${C.ink}">${t}</div><div style="font-family:${SANS};font-size:13.5px;line-height:20px;color:${C.muted};padding-top:2px">${d}</div></td></tr>`;
  const html=shell({site,eyebrow:'Prenotazione confermata',preheader:`Il tuo codice è ${b.code}: con questo accedi all'area personale per check-in online e Trentino Guest Card.`,
    title:`Grazie${nome?', '+esc(nome):''}!<br>Ti aspettiamo alla Columbera`,
    body:
    sec(`<p style="margin:0;font-family:${SANS};font-size:15px;line-height:24px;color:${C.ink};text-align:center">Abbiamo ricevuto il tuo pagamento e la prenotazione è <b>confermata</b>. Qui sotto trovi il riepilogo del tuo soggiorno.</p>`,'14px 32px 0')+
    sec(codeBox(b.code),'24px 32px 0')+
    sec(`<div style="font-family:${SANS};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${C.muted};font-weight:700;padding-bottom:12px">Riepilogo del soggiorno</div>${recap(b)}`,'30px 32px 0')+
    sec(piede(esc(annulloRiga(b))),'14px 32px 0')+
    sec(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border-radius:12px"><tr><td style="padding:24px 22px 10px">
<div style="font-family:${SERIF};font-size:20px;line-height:26px;color:${C.ink};padding-bottom:8px">La tua area personale</div>
<p style="margin:0 0 18px;font-family:${SANS};font-size:14px;line-height:22px;color:${C.muted}">Con il codice di prenotazione <b style="color:${C.wine};font-family:${MONO};letter-spacing:1px;white-space:nowrap">${esc(fmtCode(b.code))}</b> entri nell'<b>area personale</b> del nostro sito e, prima di arrivare, sbrighi tutto online:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${step('1','Check-in online','Compili i dati degli ospiti in pochi minuti, così all\'arrivo è tutto pronto.')}${step('2','Trentino Guest Card','La richiedi direttamente dall\'area personale: musei, trasporti e attrazioni del territorio inclusi.')}</table>
</td></tr><tr><td style="padding:4px 22px 26px" align="center">${button(link,'Vai alla mia area personale')}<div style="font-family:${SANS};font-size:12px;color:${C.muted};padding-top:12px">Il link ti fa entrare direttamente. In alternativa vai su <a href="${esc(site)}/area-clienti.html" style="color:${C.wine}">area clienti</a> e inserisci il codice di prenotazione. Codice e link valgono come una chiave: non inoltrarli a chi non soggiorna con te.</div></td></tr></table>`,'30px 32px 0')+
    sec(`<p style="margin:0;font-family:${SANS};font-size:14px;line-height:22px;color:${C.muted};text-align:center">Conserva questa email: ti servirà il codice per tutto il soggiorno.<br>Per qualsiasi domanda scrivici a <a href="mailto:lacolumbera@gmail.com" style="color:${C.wine}">lacolumbera@gmail.com</a> o chiamaci al <a href="tel:+393517043594" style="color:${C.wine};white-space:nowrap">+39 351 704 3594</a>.<br>Questa è un'email automatica: non rispondere a questo messaggio.<br><a href="${esc(site)}/privacy.html" target="_blank" style="color:${C.muted}">Informativa privacy</a></p>`,'26px 32px 32px')});
  const text=`Grazie${nome?', '+nome:''}! La tua prenotazione a La Columbera è confermata.

CODICE DI PRENOTAZIONE: ${fmtCode(b.code)}

${aptName(b.id)}${aptSub(b.id)?' ('+aptSub(b.id)+')':''}
Check-in:  ${dLong(b.da)}
Check-out: ${dLong(b.a)}
Notti:     ${b.notti}
Ospiti:    ${ospitiTxt(b)}
Importo pagato: ${eur(b.totale)}
${annulloRiga(b)}

Dall'area personale del sito puoi fare il check-in online e richiedere la Trentino Guest Card. Questo link ti fa entrare direttamente:
${link}
In alternativa: ${site}/area-clienti.html con il codice di prenotazione. Codice e link valgono come una chiave: non inoltrarli a chi non soggiorna con te.

Per qualsiasi domanda: lacolumbera@gmail.com · +39 351 704 3594
Questa è un'email automatica: non rispondere a questo messaggio.
Informativa privacy: ${site}/privacy.html
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
Ospiti:    ${ospitiTxt(b)}
Importo pagato: ${eur(b.totale)}

Ospite
Nome:     ${b.nome||'—'}
Email:    ${b.email||'—'}
Telefono: ${tel||'—'}${b.pagamento?'\nRif. Stripe: '+b.pagamento:''}`;
  return{subject:`Nuova prenotazione · ${aptName(b.id)} · ${dLong(b.da)} · ${b.code}`,html,text}};

// ---------------- AVVISI DEI MESSAGGI (api/_messaggi.js) ----------------
// Al titolare: un ospite ha scritto. Senza il testo del messaggio (resta nell'area riservata): solo chi, quale soggiorno e il link per rispondere.
// Il testo di un messaggio in un riquadro: a capo dove l'ha messo chi scrive, mai HTML (esc). Diventano link gli indirizzi http(s) e www.
// e, nei messaggi della struttura (md), «[testo](https://…)»; in quelli dell'ospite quella forma resta com'è, con l'indirizzo cliccabile.
const RE_LINK=/\[([^\]\n]{1,200})\]\s?\((https?:\/\/[^\s()<>"]+)\)|((?:https?:\/\/|www\.)[^\s<>"]*[^\s<>".,;:!?)\]'])/gi;
const linkMsg=(s,md)=>{s=String(s==null?'':s);let o='',i=0;
  const a=(u,l)=>`<a href="${esc(/^www\./i.test(u)?'https://'+u:u)}" target="_blank" style="color:${C.wine};font-weight:700;word-break:break-all">${esc(l)}</a>`;
  for(const m of s.matchAll(RE_LINK)){o+=esc(s.slice(i,m.index))+(m[2]?(md?a(m[2],m[1]):esc('['+m[1]+'](')+a(m[2],m[2])+esc(')')):a(m[3],m[3]));i=m.index+m[0].length}
  return (o+esc(s.slice(i))).replace(/\r?\n/g,'<br>')};
const semplice=s=>String(s==null?'':s).replace(/\[([^\]\n]{1,200})\]\s?\((https?:\/\/[^\s()<>"]+)\)/g,'$1: $2');      // per la parte di solo testo
const msgBox=(testo,nota,md)=>`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border-left:3px solid ${C.gold};border-radius:6px"><tr><td style="padding:14px 18px">${nota?`<div style="font-family:${SANS};font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:${C.muted};font-weight:700;padding-bottom:6px">${esc(nota)}</div>`:''}<div style="font-family:${SANS};font-size:15px;line-height:24px;color:${C.ink};word-wrap:break-word">${linkMsg(testo,md)}</div></td></tr></table>`;
// foto di un messaggio della struttura (Vercel Blob): larghe quanto il riquadro, ognuna apre l'originale
const fotoBox=l=>(l||[]).map(u=>`<a href="${esc(u)}" target="_blank" style="text-decoration:none"><img src="${esc(u)}" width="496" alt="" style="display:block;width:100%;max-width:496px;height:auto;border:0;border-radius:8px;margin:10px 0 0"></a>`).join('');
const pc=(t,extra)=>`<p style="margin:0;font-family:${SANS};font-size:15px;line-height:24px;color:${C.ink};text-align:center${extra||''}">${t}</p>`;
const piede=t=>`<p style="margin:0;font-family:${SANS};font-size:12px;line-height:19px;color:${C.muted};text-align:center">${t}</p>`;
// Al titolare, quando scrive un ospite: il testo (con la traduzione in italiano, se ha scritto in un'altra lingua) e «Rispondi»,
// che apre la conversazione in Gestione (se il telefono o il computer non hanno già l'accesso, prima chiede la password).
const avvisoTitolare=(b,site,m)=>{m=m||{};
  const link=site+'/admin.html#messaggi/c/'+encodeURIComponent(b.code||''),chi=String(b.nome||'').trim()||'un ospite',quando=b.da?dLong(b.da).replace(/^./,c=>c.toLowerCase()):'';
  const testo=String(m.testo||''),it=m.it&&m.it!==testo?String(m.it):'',dove=b.id?aptName(b.id)+(quando?', arrivo '+quando:''):'';
  const html=shell({site,eyebrow:'Nuovo messaggio',preheader:testo.slice(0,110)||`${chi} ti ha scritto nell'area ospiti`,title:`Nuovo messaggio da<br><span style="color:${C.wine}">${esc(chi)}</span>`,
    body:sec(pc(`Ti ha scritto nell'area ospiti${dove?' ('+esc(dove)+')':''}:`),'16px 32px 0')+
      (testo?sec(msgBox(testo),'14px 32px 0'):'')+(it?sec(msgBox(it,'Traduzione automatica in italiano'),'10px 32px 0'):'')+
      sec(button(link,'Rispondi'),'24px 32px 0')+
      sec(piede('La risposta la scrivi in Gestione: l\'ospite la legge nella sua area e riceve un\'email. Ti arriva un avviso per il primo messaggio non letto; se l\'ospite scrive ancora prima che tu legga, al massimo uno ogni 15 minuti. Si disattiva in Gestione → Messaggi → Automatici.'),'22px 32px 32px')});
  const text=`${chi}${dove?' ('+dove+')':''} ti ha scritto nell'area ospiti:\n\n${testo}\n${it?'\nTraduzione automatica in italiano:\n'+it+'\n':''}\nRispondi: ${link}`;
  return{subject:`💬 Nuovo messaggio da ${chi}${b.id?' · '+aptName(b.id):''}`,html,text}};
// All'ospite, quando gli scrivi (anche i messaggi automatici): il testo nella lingua scelta nell'area ospiti (con l'originale sotto, se tradotto)
// e «Rispondi», che apre la scheda Messaggi della sua area ospiti senza chiedere il codice (token nel frammento "#").
// Lingua non nota (l'ospite non ha ancora aperto i messaggi): italiano e inglese insieme.
const OSP={
  it:{sub:'Nuovo messaggio da La Columbera',eye:'Nuovo messaggio',ciao:n=>'Ciao'+(n?' '+n:'')+'!',intro:'Ti abbiamo scritto sul tuo soggiorno:',orig:'Testo originale (italiano)',btn:'Rispondi',foto:'Foto',
    piede:'Il pulsante apre i messaggi nella tua area ospiti, senza bisogno del codice: non inoltrare questa email a chi non soggiorna con te.',codice:'Per entrare nella tua area ospiti ti serve il codice di prenotazione: lo trovi nella email di conferma.',priv:'Informativa privacy'},
  en:{sub:'New message from La Columbera',eye:'New message',ciao:n=>'Hi'+(n?' '+n:'')+'!',intro:'We have written to you about your stay:',orig:'Original text (Italian)',btn:'Reply',foto:'Photos',
    piede:'The button opens the messages in your guest area, no code needed: please do not forward this email to anyone who is not staying with you.',codice:'To open your guest area you need your booking code: you will find it in the confirmation email.',priv:'Privacy notice'},
  de:{sub:'Neue Nachricht von La Columbera',eye:'Neue Nachricht',ciao:n=>'Hallo'+(n?' '+n:'')+'!',intro:'Wir haben Ihnen zu Ihrem Aufenthalt geschrieben:',orig:'Originaltext (Italienisch)',btn:'Antworten',foto:'Fotos',
    piede:'Die Schaltfläche öffnet die Nachrichten in Ihrem Gästebereich, ohne Code: Bitte leiten Sie diese E-Mail nicht an Personen weiter, die nicht mit Ihnen übernachten.',codice:'Um Ihren Gästebereich zu öffnen, benötigen Sie Ihren Buchungscode: Sie finden ihn in der Bestätigungs-E-Mail.',priv:'Datenschutzhinweis'}};
const avvisoOspite=(b,site,token,m)=>{m=m||{};
  const lg=OSP[m.lingua]?m.lingua:'',L=OSP[lg||'it'],E=OSP.en,due=!lg;
  const link=site+'/area-clienti.html'+(token?'#c='+encodeURIComponent(b.code)+'&t='+encodeURIComponent(token)+'&s=messaggi':'');
  const nome=String(b.nome||'').trim().split(/\s+/)[0],testo=String(m.testo||''),tr=lg&&lg!=='it'&&m.tradotto&&m.tradotto!==testo?String(m.tradotto):'',foto=Array.isArray(m.foto)?m.foto:[];
  const nota=x=>token?x.piede:x.codice;      // senza il token (non è stato possibile crearlo) il pulsante apre l'area e serve il codice
  const html=shell({site,lang:lg||'it',eyebrow:due?L.eye+' · '+E.eye:L.eye,preheader:(tr||testo).slice(0,110)||L.sub,title:esc(L.ciao(nome)),
    body:sec(pc(esc(L.intro))+(due?pc(esc(E.intro),';margin-top:4px;font-size:14px;color:'+C.muted):''),'16px 32px 0')+
      sec((tr?msgBox(tr,'',true)+'<div style="height:10px;line-height:10px">&nbsp;</div>'+msgBox(testo,L.orig,true):testo?msgBox(testo,'',true):'')+fotoBox(foto),'14px 32px 0')+
      sec(button(link,due?L.btn+' · '+E.btn:L.btn),'24px 32px 0')+
      sec(piede(esc(nota(L))+(due?'<br>'+esc(nota(E)):'')+`<br><a href="${esc(site)}/privacy.html" target="_blank" style="color:${C.muted}">${esc(L.priv)}</a>`),'22px 32px 32px')});
  const text=`${L.ciao(nome)} ${L.intro}${due?'\n'+E.intro:''}\n\n${semplice(tr||testo)}\n${tr?'\n'+L.orig+':\n'+semplice(testo)+'\n':''}${foto.length?'\n'+L.foto+':\n'+foto.join('\n')+'\n':''}\n${due?L.btn+' · '+E.btn:L.btn}: ${link}\n\n${nota(L)}${due?'\n'+nota(E):''}\n${L.priv}: ${site}/privacy.html`;
  return{subject:due?'Nuovo messaggio da La Columbera · New message':L.sub,html,text}};

// ---------------- ANNULLAMENTO CON RIMBORSO (api/_annulla.js) ----------------
// All'ospite, nella lingua dell'area ospiti (italiano se non è nota): cosa è stato annullato e quanto torna sulla carta.
const dLg=(s,lg)=>{if(lg==='it'||!LOCALE[lg])return dLong(s);const m=/^(\d{4})-(\d\d)-(\d\d)/.exec(s||'');if(!m)return x.F2(s);
  try{return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toLocaleDateString(LOCALE[lg],{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}catch{return x.F2(s)}};
const LOCALE={it:'it-IT',en:'en-GB',de:'de-DE'};
const ANN={
  it:{sub:c=>'Prenotazione annullata · La Columbera · '+c,eye:'Prenotazione annullata',tit:n=>'Ciao'+(n?' '+n:'')+',<br>la prenotazione è annullata',
    ospite:'Abbiamo annullato la prenotazione come ci hai chiesto.',titolare:'La Columbera ha annullato la tua prenotazione.',rimb:'Rimborso',
    carta:'Torna sulla carta con cui hai pagato: di solito arriva in 5–10 giorni lavorativi, dipende dalla tua banca.',gia:'Il pagamento ti è già stato rimborsato.',
    checkin:'Check-in',checkout:'Check-out',codice:'Codice di prenotazione',domande:'Per qualsiasi domanda scrivici a',auto:'Questa è un\'email automatica: non rispondere a questo messaggio.',priv:'Informativa privacy'},
  en:{sub:c=>'Booking cancelled · La Columbera · '+c,eye:'Booking cancelled',tit:n=>'Hi'+(n?' '+n:'')+',<br>your booking is cancelled',
    ospite:'We have cancelled your booking as you asked.',titolare:'La Columbera has cancelled your booking.',rimb:'Refund',
    carta:'It goes back to the card you paid with: it usually arrives within 5–10 business days, depending on your bank.',gia:'Your payment has already been refunded.',
    checkin:'Check-in',checkout:'Check-out',codice:'Booking code',domande:'For any questions, write to',auto:'This is an automated email: please do not reply to this message.',priv:'Privacy notice'},
  de:{sub:c=>'Buchung storniert · La Columbera · '+c,eye:'Buchung storniert',tit:n=>'Hallo'+(n?' '+n:'')+',<br>Ihre Buchung ist storniert',
    ospite:'Wir haben Ihre Buchung wie gewünscht storniert.',titolare:'La Columbera hat Ihre Buchung storniert.',rimb:'Erstattung',
    carta:'Sie geht auf die Karte zurück, mit der Sie bezahlt haben: in der Regel innerhalb von 5–10 Werktagen, je nach Bank.',gia:'Ihre Zahlung wurde bereits erstattet.',
    checkin:'Check-in',checkout:'Check-out',codice:'Buchungscode',domande:'Bei Fragen schreiben Sie an',auto:'Dies ist eine automatische E-Mail: Bitte antworten Sie nicht auf diese Nachricht.',priv:'Datenschutzhinweis'}};
const annullataOspite=(b,site,lingua)=>{
  const lg=ANN[lingua]?lingua:'it',L=ANN[lg],r=b.rimborso||{},nome=String(b.nome||'').trim().split(/\s+/)[0],gia=r.stato==='gia_rimborsato';
  const intro=b.annullata_da==='titolare'?L.titolare:L.ospite;
  const html=shell({site,lang:lg,eyebrow:L.eye,preheader:intro+' '+(gia?L.gia:L.rimb+': '+eur(r.importo)),title:esc(L.tit(nome)),
    body:sec(pc(esc(intro)),'14px 32px 0')+
      sec(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};border:1px dashed ${C.gold};border-radius:10px"><tr><td align="center" style="padding:20px 16px">
<div style="font-family:${SANS};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${C.muted};font-weight:700">${esc(L.rimb)}</div>
${gia?`<div style="font-family:${SANS};font-size:15px;line-height:22px;color:${C.ink};padding-top:8px">${esc(L.gia)}</div>`:`<div style="font-family:${SERIF};font-size:30px;line-height:36px;color:${C.wine};padding-top:6px">${esc(eur(r.importo))}</div><div style="font-family:${SANS};font-size:13.5px;line-height:20px;color:${C.muted};padding-top:6px">${esc(L.carta)}</div>`}</td></tr></table>`,'22px 32px 0')+
      sec(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td colspan="2" style="padding:0 0 10px"><div style="font-family:${SERIF};font-size:20px;line-height:26px;color:${C.ink}">${esc(aptName(b.id))}</div></td></tr>${row(esc(L.checkin),esc(dLg(b.da,lg)))}${row(esc(L.checkout),esc(dLg(b.a,lg)))}${row(esc(L.codice),`<span style="font-family:${MONO};letter-spacing:1px">${esc(fmtCode(b.code))}</span>`,true)}</table>`,'26px 32px 0')+
      sec(piede(`${esc(L.domande)} <a href="mailto:lacolumbera@gmail.com" style="color:${C.wine}">lacolumbera@gmail.com</a>.<br>${esc(L.auto)}<br><a href="${esc(site)}/privacy.html" target="_blank" style="color:${C.muted}">${esc(L.priv)}</a>`),'24px 32px 32px')});
  const text=`${L.tit(nome).replace('<br>',' ')}\n\n${intro}\n\n${gia?L.gia:L.rimb+': '+eur(r.importo)+'\n'+L.carta}\n\n${aptName(b.id)}\n${L.checkin}: ${dLg(b.da,lg)}\n${L.checkout}: ${dLg(b.a,lg)}\n${L.codice}: ${fmtCode(b.code)}\n\n${L.domande} lacolumbera@gmail.com · +39 351 704 3594\n${L.auto}\n${L.priv}: ${site}/privacy.html`;
  return{subject:L.sub(b.code),html,text}};
// Al titolare, quando annulla l'ospite: chi, quale soggiorno, quanto è stato rimborsato e che le notti sono di nuovo libere.
const annullataTitolare=(b,site)=>{
  const r=b.rimborso||{},link=site+'/admin.html#prenotazioni/'+encodeURIComponent(b.code),gia=r.stato==='gia_rimborsato',chi=String(b.nome||'').trim()||'L\'ospite';
  const rimb=gia?'il pagamento risultava già rimborsato su Stripe':'rimborso di '+eur(r.importo)+' avviato su Stripe'+(r.id?' ('+r.id+')':'');
  const html=shell({site,eyebrow:'Prenotazione annullata',preheader:`${chi} ha annullato · ${aptName(b.id)} · ${dLong(b.da)} · ${eur(r.importo)}`,
    title:`Annullata da<br><span style="color:${C.wine}">${esc(chi)}</span>`,
    body:sec(pc(`${esc(chi)} ha annullato dall'area clienti (fino a 7 giorni prima dell'arrivo si può): ${esc(rimb)}.`),'14px 32px 0')+
      sec(codeBox(b.code),'22px 32px 0')+
      sec(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td colspan="2" style="padding:0 0 10px"><div style="font-family:${SERIF};font-size:20px;line-height:26px;color:${C.ink}">${esc(aptName(b.id))}</div></td></tr>${row('Check-in',esc(dLong(b.da)))}${row('Check-out',esc(dLong(b.a)))}${row('Ospite',esc(b.nome||'—'))}${row('Email',esc(b.email||'—'))}${row('Rimborso',esc(gia?'già fatto su Stripe':eur(r.importo)),true)}</table>`,'26px 32px 0')+
      sec(button(link,'Apri in Gestione'),'24px 32px 0')+
      sec(piede('Le notti sono di nuovo libere sul sito; Booking e Airbnb le liberano quando rileggono il tuo calendario (di solito entro qualche ora). Sul foglio la riga è segnata ANNULLATA. All\'ospite è arrivata l\'email con il rimborso.'),'22px 32px 32px')});
  const text=`${chi} ha annullato la prenotazione ${b.code} dall'area clienti: ${rimb}.\n\n${aptName(b.id)}\nCheck-in:  ${dLong(b.da)}\nCheck-out: ${dLong(b.a)}\nOspite: ${b.nome||'—'} · ${b.email||'—'}\n\nLe notti sono di nuovo libere sul sito; Booking e Airbnb le liberano quando rileggono il calendario.\nGestione: ${link}`;
  return{subject:`❌ Prenotazione annullata · ${aptName(b.id)} · ${dLong(b.da)} · ${b.code}`,html,text}};

// ---------------- RICEVUTA DEL SOGGIORNO ----------------
// Al titolare: un ospite chiede la ricevuta. I dati per intestarla (testo dell'ospite, sempre esc) e il soggiorno; la ricevuta la emetti tu.
const ricevutaRichiesta=(b,site,q)=>{
  const link=site+'/admin.html#prenotazioni/'+encodeURIComponent(b.code),chi=String(q.nome||'').trim()||'un ospite';
  const kv2=(k,v,last)=>`<tr><td style="padding:9px 0;${last?'':`border-bottom:1px solid ${C.line};`}font-family:${SANS};font-size:13px;color:${C.muted};width:120px;vertical-align:top">${k}</td><td style="padding:9px 0;${last?'':`border-bottom:1px solid ${C.line};`}font-family:${SANS};font-size:15px;font-weight:600;color:${C.ink};word-wrap:break-word">${v}</td></tr>`;
  const dove=[q.indirizzo,[q.cap,q.citta].filter(Boolean).join(' '),q.paese].filter(Boolean).join(', ');
  const righe=[['Intestata a',q.nome],['Codice fiscale',q.cf||'—'],['Indirizzo',dove],['Mandala a',q.invio||'—']];
  const html=shell({site,eyebrow:q.aggiornata?'Richiesta di ricevuta aggiornata':'Richiesta di ricevuta',preheader:`${chi} chiede la ricevuta · ${aptName(b.id)} · ${dLong(b.da)}`,
    title:`Ricevuta per<br><span style="color:${C.wine}">${esc(chi)}</span>`,
    body:sec(pc(`Ha chiesto la ricevuta del soggiorno ${esc(aptName(b.id))}, dal ${esc(dLong(b.da))} al ${esc(dLong(b.a))}${b.totale?' ('+esc(eur(b.totale))+')':''}. Codice <b>${esc(b.code)}</b>.`),'14px 32px 0')+
      sec(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${righe.map(([k,v],i)=>kv2(esc(k),esc(v),i===righe.length-1)).join('')}</table>`,'22px 32px 0')+
      (q.nota?sec(msgBox(q.nota,'Nota dell\'ospite'),'16px 32px 0'):'')+
      sec(button(link,'Apri in Gestione'),'24px 32px 0')+
      sec(piede('Emetti la ricevuta come fai di solito, poi in Gestione → Prenotazioni carica il PDF: parte all\'ospite per email. Se l\'hai già mandata in un altro modo, segnala come inviata.'),'22px 32px 32px')});
  const text=`${chi} chiede la ricevuta del soggiorno ${aptName(b.id)} (${dLong(b.da)} → ${dLong(b.a)}${b.totale?', '+eur(b.totale):''}), codice ${b.code}.\n\n${righe.map(([k,v])=>k+': '+v).join('\n')}${q.nota?'\nNota: '+q.nota:''}\n\nGestione: ${link}`;
  return{subject:`🧾 Richiesta di ricevuta · ${chi} · ${b.code}`,html,text}};
// All'ospite: la ricevuta in allegato (il file lo aggiunge chi chiama), con una riga del titolare se c'è.
const RIC={
  it:{sub:'La tua ricevuta · La Columbera',eye:'Ricevuta',tit:n=>'Ciao'+(n?' '+n:'')+'!',intro:(a,d1,d2)=>'In allegato trovi la ricevuta del tuo soggiorno: '+a+', dal '+d1+' al '+d2+'.',domande:'Per qualsiasi domanda scrivici a',auto:'Questa è un\'email automatica: non rispondere a questo messaggio.',priv:'Informativa privacy'},
  en:{sub:'Your receipt · La Columbera',eye:'Receipt',tit:n=>'Hi'+(n?' '+n:'')+'!',intro:(a,d1,d2)=>'Attached is the receipt for your stay: '+a+', from '+d1+' to '+d2+'.',domande:'For any questions, write to',auto:'This is an automated email: please do not reply to this message.',priv:'Privacy notice'},
  de:{sub:'Ihre Quittung · La Columbera',eye:'Quittung',tit:n=>'Hallo'+(n?' '+n:'')+'!',intro:(a,d1,d2)=>'Im Anhang finden Sie die Quittung für Ihren Aufenthalt: '+a+', vom '+d1+' bis '+d2+'.',domande:'Bei Fragen schreiben Sie an',auto:'Dies ist eine automatische E-Mail: Bitte antworten Sie nicht auf diese Nachricht.',priv:'Datenschutzhinweis'}};
const ricevutaOspite=(b,site,lingua,m)=>{m=m||{};
  const lg=RIC[lingua]?lingua:'it',L=RIC[lg],nome=String(m.nome||b.nome||'').trim().split(/\s+/)[0],dd=s=>lg==='it'?dLg(s,lg).replace(/^./,c=>c.toLowerCase()):dLg(s,lg),intro=L.intro(aptName(b.id),dd(b.da),dd(b.a));
  const html=shell({site,lang:lg,eyebrow:L.eye,preheader:intro,title:esc(L.tit(nome)),
    body:sec(pc(esc(intro)),'14px 32px 0')+(m.messaggio?sec(msgBox(m.messaggio),'16px 32px 0'):'')+
      sec(piede(`${esc(L.domande)} <a href="mailto:lacolumbera@gmail.com" style="color:${C.wine}">lacolumbera@gmail.com</a>.<br>${esc(L.auto)}<br><a href="${esc(site)}/privacy.html" target="_blank" style="color:${C.muted}">${esc(L.priv)}</a>`),'24px 32px 32px')});
  const text=`${L.tit(nome)} ${intro}${m.messaggio?'\n\n'+m.messaggio:''}\n\n${L.domande} lacolumbera@gmail.com.\n${L.auto}\n${L.priv}: ${site}/privacy.html`;
  return{subject:L.sub,html,text}};

module.exports={guestMail,ownerMail,avvisoTitolare,avvisoOspite,annullataOspite,annullataTitolare,ricevutaRichiesta,ricevutaOspite};
