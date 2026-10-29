// La Columbera · Pannello di gestione, in due aree (selettore in alto, sempre visibile):
//  OPERATIVITÀ — Oggi · Calendario e prezzi · Prenotazioni · Pulizie · Messaggi · Adempimenti · Guest Card
//  SITO        — Appartamenti · Home · Eventi · Luoghi e convenzioni · Regole di prenotazione · Sistema
// Le sezioni vivono in file separati, caricati prima di questo: js/admin-operativita.js (Oggi, Prenotazioni, Guest Card), js/admin-calendario.js,
// js/admin-pulizie.js, js/admin-sito.js; Messaggi in js/admin-messaggi.js, Adempimenti in js/adempimenti.js e js/istat.js. Ognuno si registra in window.LCAdmParts
// e riceve da qui lo stato e le utilità comuni (oggetto A).
// Prezzi, blocchi, testi e regole restano in memoria finché non premi «Salva modifiche» (la barra in basso compare quando c'è qualcosa da salvare
// e dice dove); messaggi, template, adempimenti ed eventi si salvano subito. Il salvataggio porta la versione delle impostazioni che hai aperto:
// se nel frattempo un altro dispositivo ha salvato, il server lo rifiuta e la pagina chiede cosa fare, invece di cancellare le modifiche dell'altro.
// I vecchi indirizzi (#panoramica, #sync, #torre/prezzi, #torre/testi, …) portano alla sezione nuova.
(function(){
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=ymd(new Date());
const eur=n=>{n=+n||0;return '€'+(Number.isInteger(n)?n:n.toFixed(2).replace('.',','))};
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const days=(da,a)=>{const o=[];for(let d=da;d<a&&o.length<800;d=addDays(d,1))o.push(d);return o};
const rangeIncl=(a,b)=>{const o=[];for(let d=a;d<=b&&o.length<800;d=addDays(d,1))o.push(d);return o};
const fmtD=s=>s?new Date(s+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'}):'';
const fmtS=s=>new Date(s+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
const fmtW=s=>new Date(s+'T00:00:00').toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short'});
// «il 10 dic 2026» ma «l'8 dic 2026»; «al 10» ma «all'8» (1, 8 e 11 cominciano per vocale)
const elide=s=>[1,8,11].includes(+String(s).slice(8,10)),ilD=s=>(elide(s)?'l\'':'il ')+fmtD(s),alD=s=>(elide(s)?'all\'':'al ')+fmtD(s);
const short=p=>String(p.nome||p.id).replace('La Columbera ','');
const api=(a,b,t)=>fetch('api/x?a='+a,{method:'POST',headers:{'Content-Type':'application/json',Authorization:t||''},body:JSON.stringify(b||{})}).then(async r=>{const j=await r.json().catch(()=>({}));if(!r.ok){const e=Error(j.err||'Servizio non disponibile');e.status=r.status;e.data=j;throw e}return j});
const get=q=>fetch('api/x?'+q).then(r=>r.ok?r.json():null).catch(()=>null);
const copy=(v,btn)=>{navigator.clipboard&&navigator.clipboard.writeText(v).then(()=>{if(!btn)return;const o=btn.textContent;btn.textContent='Copiato ✓';setTimeout(()=>btn.textContent=o,1800)})};
const RE_HHMM=/^([01]\d|2[0-3]):[0-5]\d$/;

// prezzi: stesse regole del sito
const np=(p,d)=>{if(p.prices&&p.prices[d]!=null)return +p.prices[d];const x=(p.periodi||[]).find(q=>q.da&&q.a&&d>=q.da&&d<=q.a);return+(x?x.prezzo:p.base)};
const sup=(p,n)=>{const k=Math.max(0,n-(p.inclusi||1)),st=(p.extraSteps&&p.extraSteps.length)?p.extraSteps:[0];let s=0;for(let i=0;i<k;i++)s+=+st[Math.min(i,st.length-1)]||0;return s};
const minFor=(p,da)=>{const r=(p.minPeriodi||[]).find(q=>q.da&&q.a&&da>=q.da&&da<=q.a);return+(r?r.min:p.min)||1};

const M=$('#m');
let t=sessionStorage.lc_t||'',S=null,D={bk:[],ext:[]},EV=[],GC=[],BUSY={},dirty=false,cfgKo=false;
const DIRTY=new Set();      // dove sono le modifiche non salvate: le elenca la barra in basso
const V={month:{},sel:{},anchor:{},bkf:'tutte',last:{op:'oggi',sito:'appartamenti'}};
const idx=id=>S.apts.findIndex(p=>p.id===id);
const aptById=id=>S&&S.apts.find(p=>p.id===id);

const norm=()=>{S.ical=S.ical||{};S.closed=S.closed||{};S.chi=S.chi||'';S.rev=+S.rev||0;
  const pg=Number(S.preavvisoGiorni);S.preavvisoGiorni=Number.isInteger(pg)&&pg>=0&&pg<=365?pg:0;S.checkinOra=RE_HHMM.test(S.checkinOra)?S.checkinOra:'16:00';
  // area ospiti: check-out (vuoto = non mostrato), giorni prima dell'arrivo per le informazioni riservate, WhatsApp (non impostato = il telefono del sito)
  S.checkoutOra=RE_HHMM.test(S.checkoutOra)?S.checkoutOra:'';const ig=Number(S.infoGiorni);S.infoGiorni=Number.isInteger(ig)&&ig>=0&&ig<=30?ig:2;
  if(typeof S.whatsapp!=='string')S.whatsapp='+39 351 704 3594';
  S.apts.forEach(p=>{p.prices=p.prices||{};p.periodi=p.periodi||[];p.blocked=p.blocked||{};p.minPeriodi=p.minPeriodi||[];p.foto=p.foto||[];p.inclusi=p.inclusi||1;
    if(!Array.isArray(p.extraSteps)||!p.extraSteps.length)p.extraSteps=(+p.extra>0)?[+p.extra]:[0];
    // Il prezzo base è quello del 1° ospite e ogni ospite dopo il primo ha il suo supplemento. Un vecchio "N ospiti inclusi" diventa
    // N-1 supplementi a 0: i prezzi a notte per 1, 2, 3… ospiti restano identici a prima (il sito e il server non cambiano).
    if(p.inclusi>1){p.extraSteps=[...Array(p.inclusi-1).fill(0),...p.extraSteps];p.inclusi=1}
    p.extraSteps=p.extraSteps.slice(0,Math.max(1,(+p.max||1)-1));
    ['cin','cipat','dettagli','servizi','infoOspiti','infoRiservate'].forEach(k=>{if(typeof p[k]!=='string')p[k]=''})})};
const buildBusy=()=>{BUSY={};S.apts.forEach(p=>BUSY[p.id]=new Set());
  (D.ext||[]).forEach(e=>days(e.da,e.a).forEach(x=>BUSY[e.id]&&BUSY[e.id].add(x)));
  (D.bk||[]).filter(x=>x.stato!=='annullata').forEach(x=>days(x.da,x.a).forEach(z=>BUSY[x.id]&&BUSY[x.id].add(z)))};
const GEST=['richiesta','in_attesa','da_verificare'];
const pending=()=>D.bk.filter(x=>GEST.includes(x.stato));
const LBL={BOOKING_ICAL:'Booking',AIRBNB_ICAL:'Airbnb',ALTRO_ICAL:'Altro iCal',SHEET:'Foglio',SITO:'Sito',HOLD:'In pagamento',MANUALE:'Blocco',CHIUSO:'Chiuso',SITO_HOLD:'In pagamento'};
// quanti punti della sincronizzazione richiedono attenzione: feed e foglio non aggiornati, coda di ripresa non vuota
const syncIssues=()=>{const s=D.sync;if(!s)return 0;
  return (s.feeds||[]).filter(f=>f.health!=='OK').length+(s.registry&&s.registry.health!=='OK'?1:0)+(s.outbox&&s.outbox.pending?1:0)};

// ---------- Aree e sezioni ----------
// [indirizzo, nome, cosa contiene (si legge nel menu laterale)]
const SEZ={
  op:[['oggi','Oggi','arrivi, partenze, cose da fare'],['calendario','Calendario e prezzi','notti, prezzi, blocchi'],['prenotazioni','Prenotazioni','elenco, dettagli, codici'],['pulizie','Pulizie','entrate, uscite, letti'],['messaggi','Messaggi','ospiti, template, automatici'],['adempimenti','Adempimenti','Alloggiati Web, ISTAT'],['guestcard','Guest Card','Trentino Guest Card']],
  sito:[['appartamenti','Appartamenti','testi, foto, area ospiti'],['home','Home','testi e foto della home'],['eventi','Eventi','eventi in programma'],['luoghi','Luoghi e convenzioni','schede dei dintorni'],['regole','Regole di prenotazione','preavviso, orari, area ospiti'],['sistema','Sistema','Sincronizzazione, pagamenti, email']]};
const ALL=[...SEZ.op,...SEZ.sito],areaOf=s=>SEZ.sito.some(x=>x[0]===s)?'sito':'op';
const AUTO=new Set(['messaggi','adempimenti']);      // salvano da sole: la barra «Salva modifiche» non serve (compare solo se restano modifiche in sospeso altrove)
const route=()=>{const[s,sub,arg]=(location.hash||'#oggi').slice(1).split('/');return{s:s||'oggi',sub:sub||'',arg:arg||''}};
// vecchi indirizzi (segnalibri, link nelle email) → sezione nuova; un indirizzo sconosciuto porta a Oggi
const nuovo=h=>{const[s,sub]=h.split('/');
  if(!s||s==='panoramica')return 'oggi';
  if(s==='sync')return 'sistema';
  if(aptById(s))return sub==='prezzi'||sub==='disponibilita'?'calendario/'+s:sub==='calendari'?'sistema/ical':'appartamenti/'+s+(sub==='foto'?'/foto':'');
  return ALL.some(x=>x[0]===s)?h:'oggi'};
const where=()=>{const r=route(),x=ALL.find(z=>z[0]===r.s),p=aptById(r.sub);return (x?x[1]:'Gestione')+(p?' · '+short(p):'')};

// ---------- Barra «Salva modifiche» ----------
// Compare quando c'è qualcosa da salvare (con l'elenco delle sezioni toccate) e per qualche secondo dopo un salvataggio.
let barT=0,barUntil=0;
function bar(msg,cls,ms){const b=$('#save-bar'),o=$('#o');if(!b)return;
  if(msg!=null){o.textContent=msg;o.className='admin-msg'+(cls?' '+cls:'');barUntil=ms?Date.now()+ms:Infinity;clearTimeout(barT);if(ms)barT=setTimeout(()=>bar(),ms+50)}
  else if(dirty&&Date.now()>=barUntil){o.textContent='Modifiche non salvate: '+[...DIRTY].join(', ');o.className='admin-msg warn'}
  const show=dirty||Date.now()<barUntil;b.classList.toggle('show',show);if(!show){o.textContent='';o.className='admin-msg';$('#save-x').innerHTML=''}
  b.classList.toggle('dirty',dirty);document.body.classList.toggle('adm-dirty',dirty);$('#undo').hidden=!dirty}
const markDirty=w=>{dirty=true;DIRTY.add(w||where());barUntil=0;$('#save-x')&&($('#save-x').innerHTML='');bar()};
const pulse=()=>{const b=$('#save-bar');if(!b)return;b.classList.remove('pulse');void b.offsetWidth;b.classList.add('pulse')};

// ---------- Accesso ----------
function login(){
  M.innerHTML=`<div class="auth-card" style="margin:0 auto;max-width:440px" data-testid="admin-login-card"><span class="section-eyebrow">Area riservata</span><h1 style="font-size:2rem;margin-bottom:8px;font-style:italic">Gestione</h1><p class="sub">Accedi per gestire appartamenti, prezzi, disponibilità, prenotazioni e Guest Card.</p><form id="l" data-testid="admin-login-form"><div class="field"><label for="au">Nome utente</label><input id="au" name="u" autocomplete="username" data-testid="admin-user"></div><div class="field"><label for="ap">Password</label><input id="ap" name="p" type="password" autocomplete="current-password" data-testid="admin-pass"></div><button class="btn btn-wine" style="width:100%;justify-content:center" data-testid="admin-login-submit">Accedi</button><p class="form-err" id="e" data-testid="admin-login-error"></p></form></div>`;
  $('#l').onsubmit=async e=>{e.preventDefault();
    try{t=sessionStorage.lc_t=(await api('login',Object.fromEntries(new FormData(e.target)))).t;start()}
    catch(x){$('#e').textContent=x.message}}}
const unauthorized=()=>{sessionStorage.removeItem('lc_t');t='';S=null;dirty=false;DIRTY.clear();document.body.classList.remove('adp-active','adm-dirty');login()};

async function start(){
  try{D=await api('adm',{},t)}catch(x){if(x.status===401||x.status===undefined){sessionStorage.removeItem('lc_t');t='';return login()}return login()}
  const[c,ev,gc]=await Promise.all([api('cfg_admin',{},t).catch(()=>null),get('a=events'),api('gc_manual_list',{},t).catch(()=>[])]);
  // senza le impostazioni salvate si mostra la configurazione di partenza, ma non si salva: si sostituirebbero quelle vere
  cfgKo=!c;S=structuredClone(c||await fetch('data/default.json').then(r=>r.json()));EV=ev||[];GC=gc||[];
  norm();buildBusy();shell();body()}
const refreshAdm=async()=>{try{D=await api('adm',{},t);buildBusy()}catch{}};
async function reloadCfg(msg){
  try{const c=await api('cfg_admin',{},t);S=structuredClone(c);cfgKo=false;norm();dirty=false;DIRTY.clear();V.sel={};$('#save-x').innerHTML='';bar(msg||'Impostazioni ricaricate.','ok',3500);body()}
  catch(x){bar(x.message,'warn')}}

function shell(){
  M.innerHTML=`<h1 class="sr-only">Gestione</h1>
  <div class="adm-bar" data-testid="admin-bar"><nav class="adm-areas" id="adm-areas" aria-label="Area della gestione"></nav>
   <div class="adm-top-actions"><a class="btn btn-line adm-site" href="index.html" target="_blank" rel="noopener">Vedi il sito ↗</a><button type="button" class="btn btn-line" id="out" data-testid="admin-logout">Esci</button></div></div>
  <div class="adm-shell"><nav class="adm-nav" id="adm-nav" aria-label="Sezioni"></nav><section class="adm-body" id="adm-body"></section></div>
  <div class="admin-card save-bar" id="save-bar" data-testid="admin-save-bar"><span class="admin-msg" id="o" data-testid="admin-save-msg" role="status"></span><span class="save-x" id="save-x"></span><span class="save-btns"><button type="button" class="btn btn-line" id="undo" hidden data-testid="admin-undo">Annulla</button><button type="button" class="btn btn-wine" id="save" data-testid="admin-save">Salva modifiche</button></span></div>`}

function nav(){
  const r=route(),ar=areaOf(r.s),badge={prenotazioni:pending().length,messaggi:+D.msgNonLetti||0,sistema:syncIssues()};
  $('#adm-nav').innerHTML=SEZ[ar].map(([h,l,d])=>`<a href="#${h}" class="${r.s===h?'on':''}"${r.s===h?' aria-current="page"':''}><span class="adm-nl">${l}<small>${d}</small></span>${badge[h]?`<span class="adm-badge"${h==='messaggi'?' data-testid="admin-msg-badge"':''}>${badge[h]}</span>`:''}</a>`).join('');
  // l'altra area ha qualcosa da guardare (prenotazioni da gestire, messaggi da leggere, sincronizzazione): un pallino sul selettore
  const altro={op:badge.prenotazioni+badge.messaggi,sito:badge.sistema};
  $('#adm-areas').innerHTML=[['op','Operatività'],['sito','Sito']].map(([k,l])=>`<a href="#${esc(V.last[k])}" class="${ar===k?'on':''}"${ar===k?' aria-current="true"':''} data-testid="admin-area-${k}">${l}${altro[k]&&ar!==k?'<i class="adm-dot" title="C\'è qualcosa da guardare"></i>':''}</a>`).join('');
  const nv=$('#adm-nav'),on=nv.querySelector('a.on');if(on&&nv.scrollWidth>nv.clientWidth)nv.scrollLeft=on.offsetLeft-(nv.clientWidth-on.offsetWidth)/2}      // su telefono il menu scorre: la sezione aperta resta in vista

function body(){
  const el=$('#adm-body');if(!el||!S)return;
  const h=(location.hash||'').slice(1),n=nuovo(h);if(n!==h)history.replaceState(null,'','#'+n);
  const r=route();V.last[areaOf(r.s)]=n;
  if(dirty&&V.cur&&V.cur!==r.s)pulse();      // si cambia sezione con modifiche non salvate: la barra in basso lo ricorda
  V.cur=r.s;
  if(r.s!=='messaggi'&&window.LCMessaggi)window.LCMessaggi.unmount();
  el.innerHTML=(A.view[r.s]||A.view.oggi)(r);
  document.body.classList.toggle('adp-active',AUTO.has(r.s));
  if(A.after[r.s])A.after[r.s](r);
  nav();bar()}

// ---------- Adempimenti (Alloggiati Web, ISTAT): la sezione vive in js/adempimenti.js e js/istat.js; i dati degli ospiti restano solo in memoria ----------
const vAdp=r=>{const sub=r.sub==='istat'?'istat':'alloggiati';
  return `<div class="adm-tabs adp-tabs" data-testid="adp-tabs"><a href="#adempimenti" class="${sub==='alloggiati'?'on':''}" data-testid="adp-tab-alloggiati">Alloggiati Web</a><a href="#adempimenti/istat" class="${sub==='istat'?'on':''}" data-testid="adp-tab-istat">ISTAT</a></div><div id="adp-root" data-testid="adp-root"></div>`};
function adpAfter(r){const el=$('#adp-root');if(!el)return;
  const ist=r.sub==='istat',mod=ist?window.LCIstat:window.LCAdempimenti;
  if(!mod){el.innerHTML='<div class="admin-card"><p class="form-err">Modulo Adempimenti non caricato: ricarica la pagina.</p></div>';return}
  if(ist){document.querySelectorAll('.adp-modal').forEach(n=>n.remove());document.body.classList.remove('adp-noscroll')}      // una finestra dell'altra scheda rimasta aperta non resta sopra questa pagina
  mod.mount(el,{token:()=>t,onUnauthorized:unauthorized})}

// ---------- Messaggi (conversazioni, template, automatici): la sezione vive in js/admin-messaggi.js e salva da sola ----------
const vMsg=()=>'<div id="msg-root" data-testid="msg-root"></div>';
function msgAfter(r){const el=$('#msg-root');if(!el)return;
  if(!window.LCMessaggi){el.innerHTML='<div class="admin-card"><p class="form-err">Modulo Messaggi non caricato: ricarica la pagina.</p></div>';return}
  window.LCMessaggi.mount(el,{token:()=>t,onUnauthorized:unauthorized,apts:()=>S.apts,bk:()=>D.bk,reg:()=>D.reg||[],
    onBadge:n=>{if(D.msgNonLetti!==n){D.msgNonLetti=n;nav()}}},r.sub,r.arg)}

// Cambio di stato di una prenotazione. Confermare a mano ciò che non lo è ancora (es. «da_verificare») fa controllare le sovrapposizioni
// al server: se ce ne sono risponde 409 con il dettaglio e il titolare può confermare comunque (resta traccia nella nota della prenotazione).
async function setStato(code,stato,force){
  try{await api('stato',{code,stato,force:!!force},t)}
  catch(x){
    if(x.status===409&&x.data&&!force){
      const righe=(x.data.conflicts||[]).map(c=>fmtS(c.date)+' — '+(c.by||[]).map(k=>LBL[k]||k).join(' + ')).join('\n');
      if(confirm((x.data.err||'Sovrapposizione con altre prenotazioni.')+(righe?'\n\n'+righe:'')+'\n\nConfermare comunque? La decisione resterà registrata sulla prenotazione.'))return setStato(code,stato,true)}
    else alert(x.message)}
  await refreshAdm();body()}      // riallinea il menu al valore reale

// ---------- Azioni comuni (click) ----------
const ACT={
  copy:a=>copy(a.dataset.v,a),
  cfgReload:()=>{if(confirm('Ricaricare le impostazioni salvate? Le modifiche fatte in questa pagina e non salvate andranno perse.'))reloadCfg('Impostazioni ricaricate: rifai qui le modifiche che ti servono.')},
  cfgForce:()=>{if(confirm('Salvare comunque le modifiche di questa pagina? Quello che è stato salvato dall\'altro dispositivo verrà sostituito.'))save(true)}
};

// ---------- Oggetto comune alle sezioni (js/admin-operativita.js, js/admin-calendario.js, js/admin-sito.js) ----------
const A={$,$$,esc,pad,ymd,today,eur,addDays,days,rangeIncl,fmtD,fmtS,fmtW,ilD,alD,short,np,sup,minFor,get,copy,RE_HHMM,LBL,GEST,M,V,
  api:(a,b)=>api(a,b,t),idx,aptById,route,markDirty,body,nav,bar,refreshAdm,reloadCfg,pending,syncIssues,setStato,buildBusy,unauthorized,
  get S(){return S},get D(){return D},get BUSY(){return BUSY},get EV(){return EV},set EV(v){EV=v},get GC(){return GC},get t(){return t},
  view:{adempimenti:vAdp,messaggi:vMsg},after:{adempimenti:adpAfter,messaggi:msgAfter},act:ACT,
  onClick:[],onInput:[],onChange:[],onSubmit:[],afterBind:[],checks:[]};
(window.LCAdmParts||[]).forEach(f=>f(A));

// ---------- Eventi DOM ----------
// campi collegati alla configurazione: data-b="c:campo" (generale), "a:<indice>:campo" (appartamento), "ical:<id>", "closed:<id>"
function bind(el){const[k,a,b]=el.dataset.b.split(':'),v=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?0:+el.value):el.value;
  if(k==='c')S[a]=v;else if(k==='a')S.apts[+a][b]=v;else if(k==='ical')S.ical[a]=v;else if(k==='closed')S.closed[a]=!!v;
  markDirty();A.afterBind.forEach(f=>f(k,a,b,el))}
function logout(){
  if((dirty||(window.LCMessaggi&&window.LCMessaggi.dirty()))&&!confirm('Hai modifiche non salvate: uscire lo stesso? Andranno perse.'))return;
  window.LCAdempimenti&&window.LCAdempimenti.reset();window.LCIstat&&window.LCIstat.reset();window.LCMessaggi&&window.LCMessaggi.reset();unauthorized()}
function wire(){
  M.addEventListener('click',e=>{
    if(e.target.id==='out'){logout();return}
    if(e.target.id==='save'){save();return}
    if(e.target.id==='undo'){if(confirm('Annullare le modifiche non salvate? Tornano le impostazioni salvate.'))reloadCfg('Modifiche annullate.');return}
    const a=e.target.closest('[data-act]');if(a){ACT[a.dataset.act]&&ACT[a.dataset.act](a,e);return}
    for(const f of A.onClick)if(f(e))return});
  M.addEventListener('input',e=>{const el=e.target;if(el.dataset.b){bind(el);return}for(const f of A.onInput)if(f(el,e))return});
  M.addEventListener('change',e=>{for(const f of A.onChange)if(f(e.target,e))return});
  M.addEventListener('submit',e=>{for(const f of A.onSubmit)if(f(e.target,e))return});
  window.addEventListener('hashchange',()=>{if(S){body();window.scrollTo({top:0,behavior:'smooth'})}});
  window.addEventListener('beforeunload',e=>{if(dirty||(window.LCMessaggi&&window.LCMessaggi.dirty())){e.preventDefault();e.returnValue=''}})}

// ---------- Salvataggio ----------
// controlli prima di inviare (il server ricontrolla comunque)
function check(){
  const pg=Number(S.preavvisoGiorni);
  if(!Number.isInteger(pg)||pg<0||pg>365)return 'Controlla il preavviso minimo (Sito → Regole di prenotazione): un numero intero di giorni da 0 a 365';
  if(!RE_HHMM.test(S.checkinOra))return 'Controlla l’orario di check-in (Sito → Regole di prenotazione): formato HH:MM';
  if(S.checkoutOra&&!RE_HHMM.test(S.checkoutOra))return 'Controlla l’orario di check-out (Sito → Regole di prenotazione): formato HH:MM, oppure lascialo vuoto';
  const ig=Number(S.infoGiorni);if(!Number.isInteger(ig)||ig<0||ig>30)return 'Controlla i giorni per le informazioni riservate (Sito → Regole di prenotazione): da 0 a 30';
  for(const p of S.apts){
    if(p.periodi.find(q=>!q.da||!q.a||q.a<q.da))return 'Controlla i prezzi di stagione di '+short(p)+' (Calendario e prezzi): date mancanti o invertite';
    if(p.minPeriodi.find(q=>!q.da||!q.a||q.a<q.da))return 'Controlla i periodi di soggiorno minimo di '+short(p)+' (Calendario e prezzi): date mancanti o invertite'}
  for(const f of A.checks){const m=f();if(m)return m}
  return ''}
async function save(force){
  const btn=$('#save');btn.disabled=true;$('#save-x').innerHTML='';bar('Salvo…','');
  const err=cfgKo?'Le impostazioni salvate non sono state caricate: ricarica la pagina prima di salvare (non salvo, per non sostituirle con quelle di partenza).':check();
  if(err){bar(err,'warn');btn.disabled=false;return}
  const payload=structuredClone(S);if(force)payload.force=true;
  payload.apts.forEach(p=>{p.extraSteps=p.extraSteps.map(v=>Math.max(0,+v||0));p.extra=p.extraSteps[0]||0;
    p.blocked=Object.fromEntries(Object.keys(p.blocked).filter(d=>p.blocked[d]&&d>=today).map(d=>[d,true]))});
  try{const r=await api('save',payload,t);S.rev=+r.rev||0;dirty=false;DIRTY.clear();bar('Salvato: le modifiche sono già online.','ok',4500)}
  catch(x){bar(x.message,'warn');
    if(x.status===409&&x.data&&x.data.code==='CFG_CAMBIATA')$('#save-x').innerHTML='<button type="button" class="btn btn-line" data-act="cfgReload" data-testid="admin-cfg-reload">Ricarica le impostazioni salvate</button><button type="button" class="btn btn-line" data-act="cfgForce" data-testid="admin-cfg-force">Salva comunque le mie</button>'}
  finally{btn.disabled=false}}

wire();
t?start():login();
})();
