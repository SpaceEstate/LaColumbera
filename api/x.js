const c=require('crypto'),{put,del}=require('@vercel/blob');
const KU=(process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/+$/,''),KT=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
// KV: un errore NON è mai "nessun dato". Prima una risposta di errore di Upstash (limite richieste, token…) veniva letta come chiave vuota:
// prenotazioni del sito, blocchi manuali e chiusure "sparivano" e il calendario mostrava date libere.
const kvReq=async(path,body)=>{if(!KU||!KT)throw new Error('KV non configurato');const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),7000);
 try{const r=await fetch(KU+path,{method:'POST',headers:{Authorization:'Bearer '+KT,'Content-Type':'application/json'},body:JSON.stringify(body),signal:ctl.signal});
  let j;try{j=await r.json()}catch{throw new Error('KV: risposta non valida (HTTP '+r.status+')')}
  if(!r.ok||(j&&!Array.isArray(j)&&j.error))throw new Error('KV: '+((j&&j.error)||('HTTP '+r.status)));return j}
 finally{clearTimeout(t)}};
const kv=async(...a)=>(await kvReq('',a)).result;
const kvp=async cmds=>(await kvReq('/pipeline',cmds)).map(x=>{if(x.error)throw new Error('KV: '+x.error);return x.result});
const jg=async k=>JSON.parse(await kv('GET',k)||'null');
const sha=s=>c.createHash('sha256').update(String(s)).digest();
const eq=(x,y)=>c.timingSafeEqual(sha(x),sha(y));
const S=()=>process.env.SESSION_SECRET||process.env.ADMIN_PASSWORD||'';
const sign=p=>p+'.'+c.createHmac('sha256',S()).update(p).digest('hex');
const auth=r=>{const t=r.headers.authorization||'',p=t.split('.')[0];return !!S()&&+p>Date.now()&&eq(t,sign(p))};
// Campi di contenuto aggiunti dopo il primo salvataggio dal pannello (servizi, testo di approfondimento, CIN, CIPAT): finché il titolare non li salva
// (cfg senza quel campo) valgono quelli di data/default.json, così il sito li mostra subito senza sovrascrivere i testi che ha già modificato.
// require statico: Vercel include sicuramente il file nella funzione.
// I codici (CIN, CIPAT) valgono anche se il campo salvato è vuoto: sono obbligatori negli annunci, un campo lasciato vuoto per sbaglio non deve farli sparire dal sito.
const DEF=require('../data/default.json'),FILL=['servizi','dettagli','cin','cipat'],CODICI=new Set(['cin','cipat']);
const withDefaults=c=>{if(!c||!Array.isArray(c.apts))return c;const d=new Map((DEF.apts||[]).map(p=>[p.id,p]));
 return{...c,apts:c.apts.map(p=>{const q=d.get(p.id);if(!q)return p;const o={...p};for(const k of FILL)if((o[k]===undefined||(CODICI.has(k)&&String(o[k]).trim()===''))&&q[k]!==undefined)o[k]=q[k];return o})}};
const cfg=async r=>withDefaults((await jg('cfg'))||await(await fetch('https://'+r.headers.host+'/data/default.json')).json());
// CIPAT della struttura (lo stesso usato per l'ISTAT, variabile ISTAT_CIPAT): è un codice che per legge compare negli annunci, quindi può essere pubblico. Solo se ha la forma giusta.
const cipatPub=()=>{const v=String(process.env.ISTAT_CIPAT||'').trim();return /^[A-Za-z0-9-]{16}$/.test(v)?v:''};
const AV=require('./_avail.js'),days=AV.rangeDays,addDays=AV.addDays,todayRome=AV.todayRome;
// Motore unico di disponibilità: tutta la logica "busy" (iCal, foglio, sito, hold, blocchi) vive in _avail.js
const E=AV.makeEngine({kv,kvp,fetch:(...a)=>fetch(...a),env:process.env});
// Accesso degli ospiti alla prenotazione: codice = identificativo, token segreto = autorizzazione; limiti di frequenza su KV (api/_accesso.js)
const {makeAccess,maskEmail}=require('./_accesso.js'),ACC=makeAccess({kv,kvp});
const deny=(res,r)=>{if(r.retryAfter)res.setHeader('Retry-After',String(r.retryAfter));return res.status(r.status).json(r.body)};
// La Guest Card restituita all'ospite: solo ciò che serve a mostrarla (niente risposta grezza del sistema TGC, email mascherata)
const cardOut=k=>k?{gc_id:k.gc_id||'',stato:k.stato||'',valid_from:k.valid_from,valid_to:k.valid_to,ospiti:k.ospiti,email:maskEmail(k.email)}:null;
// Azioni che accettano un corpo grande (solo admin): per tutte le altre il corpo oltre 20 KB è rifiutato
const BIG_BODY=new Set(['save','up']);
const np=(p,d)=>{if(p.prices&&p.prices[d]!=null)return +p.prices[d];const x=(p.periodi||[]).find(q=>d>=q.da&&d<=q.a);return+(x?x.prezzo:p.base)};
// supplemento a notte per gli ospiti oltre quelli inclusi, a scaglioni: extraSteps[0] = 1° ospite extra, [1] = 2°, ... (l'ultimo valore vale anche per i successivi)
const sup=(p,n)=>{const k=Math.max(0,n-(p.inclusi||1)),st=(p.extraSteps&&p.extraSteps.length)?p.extraSteps:[+p.extra||0];let s=0;for(let i=0;i<k;i++)s+=+st[Math.min(i,st.length-1)]||0;return s};
// notti minime: vale la regola del periodo che contiene la data di arrivo, altrimenti il minimo generale
const minFor=(p,da)=>{const r=(p.minPeriodi||[]).find(q=>q.da&&q.a&&da>=q.da&&da<=q.a);return+(r?r.min:p.min)||1};
const F2=s=>{const m=/(\d{4})-(\d\d)-(\d\d)/.exec(s);return m?m[3]+'/'+m[2]+'/'+m[1]:s};
const APT_LABEL={torre:'La Columbera - Torre, Appartamento con 2 camere da letto',corte:'La Columbera - Corte, Appartamento con 1 camere da letto'};

// Messaggio al cliente (409) quando il preavviso minimo non è rispettato: la regola, il primo arrivo prenotabile e come ottenere un arrivo più vicino
const fmtLong=s=>{try{const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(s),t=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});return t}catch{return F2(s)}};
const noticeBody=(nt,nowMs)=>{const first=AV.minCheckinDate(nowMs,nt);
 return{err:(nt.giorni>0?'Preavviso minimo non rispettato: le prenotazioni online richiedono almeno '+nt.giorni+(nt.giorni===1?' giorno':' giorni')+' di anticipo sul check-in (ore '+nt.ora+').':'La data di arrivo scelta non è più prenotabile.')+' Il primo arrivo prenotabile è '+fmtLong(first)+'. Per arrivi più vicini scrivici a lacolumbera@gmail.com o chiamaci al +39 351 704 3594.',code:'PREAVVISO_INSUFFICIENTE',giorni:nt.giorni,ora:nt.ora,primoArrivo:first}};

// ---- Registro prenotazioni (Google Sheet via Apps Script): upsert idempotente + coda di ripresa ----
const sheetUpsertBooking=b=>E.registerBooking(b);   // chiave FONTE|CODICE; se il foglio non risponde accoda (mai perdere una conferma)
const sheetAppend=sheetUpsertBooking;                // nome storico, per compatibilità
const findBooking=(config,code)=>E.findByCode(config,code);

// ---- Trentino Guest Card: doc ufficiale rev.11 (03/2026) — autenticazione OAuth Bearer Token (pag.17-20) ----
// baseUrl test: https://demoricettivo.hi-logic.it · produzione: https://ricettivo.guestcard.info
//
// PERCORSO ATTIVO: OAuth Bearer Token. Le credenziali di produzione inviate da Trentino Marketing
// (PMS_Lacolumbera + GUID) sono client_id / client_secret OAuth: NON funzionano come Basic Auth diretta
// sulle API (davano 401 "invalid PMS"), vanno usate solo per scambio code e refresh del token.
// Env su Vercel: TGC_OAUTH_CLIENT_ID, TGC_OAUTH_CLIENT_SECRET, TGC_REDIRECT_URI, TGC_CARD_TYPE_ID,
// TGC_BASE_URL (opzionale, default produzione). TGC_BASIC_USER/PASS e TGC_USERNAME/PASSWORD NON servono più:
// username e password della struttura si digitano sulla pagina di login di Trentino Marketing, non nel codice.
// Flusso: admin clicca "Autorizza" (gc_oauth_start) → login struttura su ricettivo.guestcard.info → redirect
// a TGC_REDIRECT_URI (la home del sito) con code+state → la home inoltra in automatico a gc_oauth_callback →
// code scambiato per Token+RefreshToken, salvati su KV →
// tgcCall usa "Bearer" su /ws/Pms/... e rinnova da solo il Token quando scade. Se il RefreshToken scade o
// viene revocato basta rifare "Autorizza" una volta dal pannello admin.
const TGC_BASE=(process.env.TGC_BASE_URL||'https://ricettivo.guestcard.info').replace(/\/+$/,'');
// Le card demo e quelle di produzione sono salvate con chiavi diverse: una card di prova non blocca mai l'emissione reale per lo stesso codice.
const GCK=code=>(/demoricettivo|hi-logic/i.test(TGC_BASE)?'gc:demo:':'gc:')+code;
const ymd=s=>String(s).replace(/-/g,'');
const tgcOauthBasic=()=>{
 if(!process.env.TGC_OAUTH_CLIENT_ID||!process.env.TGC_OAUTH_CLIENT_SECRET)throw new Error('Mancano TGC_OAUTH_CLIENT_ID/TGC_OAUTH_CLIENT_SECRET su Vercel');
 return 'Basic '+Buffer.from(process.env.TGC_OAUTH_CLIENT_ID+':'+process.env.TGC_OAUTH_CLIENT_SECRET).toString('base64')};

// Scambia il "code" ricevuto dal redirect di login per Token + RefreshToken.
// Se viene passato "diag" lo riempie con i dettagli della chiamata (il secret NON viene mai mostrato:
// solo lunghezza e controlli di formato), così quando Trentino Marketing rifiuta lo scambio la pagina di
// callback mostra esattamente cosa è successo.
async function tgcExchangeCode(code,diag){
 const endpoint='/ws/oauth/access_token_pms.ashx',cid=process.env.TGC_OAUTH_CLIENT_ID||'',sec=process.env.TGC_OAUTH_CLIENT_SECRET||'';
 if(diag)Object.assign(diag,{ambienteVercel:process.env.VERCEL_ENV||'(non su Vercel)',base:TGC_BASE,endpoint,clientId:cid,clientIdSpaziAiBordi:cid!==cid.trim(),secretLen:sec.length,secretSpaziAiBordi:sec!==sec.trim(),secretApici:/^["']|["']$/.test(sec),codeLen:String(code).length,redirectUri:process.env.TGC_REDIRECT_URI||''});
 const t0=Date.now();
 const r=await fetch(TGC_BASE+endpoint+'?code='+encodeURIComponent(code),{headers:{Authorization:tgcOauthBasic()}});
 const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j={raw:txt}}
 if(diag)Object.assign(diag,{ms:Date.now()-t0,status:r.status,contentType:r.headers.get('content-type')||'',wwwAuthenticate:r.headers.get('www-authenticate')||'',body:txt.slice(0,300)});
 if(!r.ok||!j.Token)throw new Error(j.message||('HTTP '+r.status+' '+txt.slice(0,200)));
 return j}

// Rinnova un Token scaduto usando il RefreshToken salvato (il RefreshToken cambia a ogni refresh: va sempre risalvato)
async function tgcRefreshToken(refreshToken){
 const fd=new FormData();fd.set('refreshToken',refreshToken);
 const r=await fetch(TGC_BASE+'/ws/oauth/refresh_token.ashx',{method:'POST',headers:{Authorization:tgcOauthBasic()},body:fd});
 const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j={raw:txt}}
 if(!r.ok||!j.Token)throw new Error(j.message||('HTTP '+r.status+' '+txt.slice(0,200)));
 return j}

// Ritorna un Bearer Token valido; lo rinnova se scaduto/vicino alla scadenza (margine 60s) o se force=true.
// Se un'altra richiesta ha già rinnovato nel frattempo (RefreshToken monouso) usa il token più recente su KV.
async function tgcGetToken(force){
 let t=await jg('tgc:oauth:token');
 if(!t||!t.RefreshToken)throw new Error('Guest Card non ancora autorizzata: in admin clicca "Autorizza Trentino Guest Card"');
 if(force||!(Date.parse(t.expiresAt)>Date.now()+6e4)){
  try{
   const fresh=await tgcRefreshToken(t.RefreshToken);
   t={Token:fresh.Token,RefreshToken:fresh.RefreshToken,expiresAt:fresh.expiresAt};
   await kv('SET','tgc:oauth:token',JSON.stringify(t))}
  catch(e){
   const cur=await jg('tgc:oauth:token');
   if(cur&&cur.RefreshToken&&cur.RefreshToken!==t.RefreshToken)t=cur;
   else throw new Error('Autorizzazione Guest Card scaduta o revocata: in admin clicca "Autorizza Trentino Guest Card" ('+e.message+')')}}
 return t.Token}

// Chiamata generica autenticata Bearer verso /ws/Pms/... (niente più username/password nei parametri, doc pag.19).
// Se il server risponde 401 rinnova il token e ripete una sola volta.
async function tgcCall(path,{method='GET',form}={}){
 const once=async tok=>{
  const opt={method,headers:{Authorization:'Bearer '+tok}};
  if(form){const fd=new FormData();for(const k in form)if(form[k]!=null)fd.set(k,String(form[k]));opt.body=fd}
  const r=await fetch(TGC_BASE+'/ws/Pms/'+path,opt);
  const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j={raw:txt}}
  return{r,j,txt}};
 let x=await once(await tgcGetToken());
 if(x.r.status===401)x=await once(await tgcGetToken(true));
 const{r,j,txt}=x;
 if(!r.ok||j.esito===false)throw new Error((j.motivo||[]).join(', ')||j.message||('HTTP '+r.status+' '+txt.slice(0,200)));
 if(j.raw!==undefined)throw new Error('Risposta non valida da Trentino Guest Card: '+txt.slice(0,200));
 return j}

// Emissione essenziale (opzione consigliata dal doc, pag.5) via Bearer
async function emettiGuestCardTGC({dal,al,email,personeMax,codice}){
 return tgcCall('EmissioneEssenzialeCard.ashx',{method:'POST',form:{
  idTipologiaCard:process.env.TGC_CARD_TYPE_ID,dal:ymd(dal),al:ymd(al),Email:email,PersoneMax:personeMax,
  IdAttributo:process.env.TGC_ATTRIBUTO_ID||null,
  ExtraSftAlbergatori:codice?String(codice).slice(0,36):null}})}

// ---- Email (Gmail SMTP). Ritorna true=inviata, false=errore, null=non configurata (il webhook riprova solo se false) ----
const sendMail=async(to,subject,html,opts={})=>{if(!process.env.GMAIL_USER||!process.env.GMAIL_APP_PASSWORD)return null;
 try{const nodemailer=require('nodemailer'),t=nodemailer.createTransport({service:'gmail',auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}});
  await t.sendMail({from:'"La Columbera" <'+process.env.GMAIL_USER+'>',to,subject,html,...(opts.text?{text:opts.text}:{}),...(opts.replyTo?{replyTo:opts.replyTo}:{})});return true}
 catch(e){console.error('sendMail:',e.message);return false}};

// ---- Avvisi al titolare sulla sincronizzazione ----
// Un appartamento "non verificabile" ferma le prenotazioni dal sito (scelta voluta: meglio fermarsi che mostrare date sbagliate), ma il titolare
// deve saperlo senza aprire il pannello: una mail per episodio, un promemoria ogni 6 ore finché dura, una mail quando torna tutto a posto.
// Stato per appartamento in KV (alert:nv:<apt>); la mail conta come inviata solo se l'invio riesce, altrimenti si riprova al giro successivo.
const OWNER_EMAIL=process.env.OWNER_EMAIL||'patrick.comper@yahoo.com',REPLY_TO=process.env.REPLY_TO||'lacolumbera@gmail.com',ALERT_REMIND_MS=6*3600e3;      // REPLY_TO: a chi risponde l'ospite alla conferma (predefinito: l'indirizzo pubblicato sul sito)
const hx=v=>String(v==null?'':v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function syncAlerts(config,req){
 if((await kv('SET','alert:lock','1','NX','EX','60'))!=='OK')return;      // un solo controllo alla volta
 try{
  const site=process.env.SITE_URL||'https://'+req.headers.host;
  for(const p of config.apts||[]){
   const k='alert:nv:'+p.id,st=(await jg(k))||{open:false},nome=APT_LABEL[p.id]||p.nome||p.id,t=Date.now();
   let g;try{g=await E.guestBusy(config,p.id)}catch(e){g={status:'unverifiable',problems:[{code:'ERRORE_CONTROLLO',msg:String(e&&e.message||e).slice(0,120)}]}}
   const bad=g.status==='unverifiable',link=site+'/admin.html#sync';
   if(bad&&(!st.open||t-(st.last||0)>=ALERT_REMIND_MS)){
    const motivi=(g.problems||[]).slice(0,6).map(x=>x.code+(x.feed?' · '+x.feed:'')+(x.msg?' · '+x.msg:''));
    const since=st.open?st.since:new Date().toISOString(),subj=(st.open?'⏰ Ancora non verificabile':'⚠️ Disponibilità non verificabile')+' · '+nome;
    const text='La disponibilità di "'+nome+'" non è verificabile'+(st.open?' dal '+since.slice(0,16).replace('T',' ')+' (UTC)':'')+'.\n\nFINCHÉ DURA, IL SITO NON ACCETTA PRENOTAZIONI per questo appartamento (le altre piattaforme non sono toccate).\n\nMotivi:\n'+(motivi.length?motivi.map(m=>'- '+m).join('\n'):'- non indicato')+'\n\nCosa fare: apri Gestione → Sincronizzazione ('+link+'), controlla quale calendario o il foglio non si aggiorna e premi «Sincronizza ora».\nRiceverai un promemoria ogni 6 ore e una mail quando tutto torna a posto.';
    const html='<p>'+hx(text).replace(/\n/g,'<br>')+'</p>';
    if((await sendMail(OWNER_EMAIL,subj,html,{text}))!==false)await kv('SET',k,JSON.stringify({open:true,since,last:t}));
   }else if(!bad&&st.open){
    const text='La disponibilità di "'+nome+'" è di nuovo verificabile (non verificabile dal '+String(st.since||'').slice(0,16).replace('T',' ')+' UTC). Il sito accetta di nuovo prenotazioni.\n\nControlla comunque: '+link;
    if((await sendMail(OWNER_EMAIL,'✅ Disponibilità ripristinata · '+nome,'<p>'+hx(text).replace(/\n/g,'<br>')+'</p>',{text}))!==false)await kv('SET',k,JSON.stringify({open:false}));
   }
  }
 }finally{await kv('DEL','alert:lock').catch(()=>{})}
}

// ---- Eventi automatici ----
// Fonte: guida eventi ufficiale VisitTrentino (il vecchio indirizzo /it/eventi non esiste più: dava 404).
// Se la pagina cambia struttura o non risponde si usa l'elenco fisso qui sotto, con link verificati.
const EV_HOME='https://www.visittrentino.info';
const EV_PAGE=EV_HOME+'/it/guida/cosa-fare/eventi';
const curated=()=>{const t=new Date(),Y=t.getUTCFullYear();const base=[
 ['Trentodoc Festival',9,25,'Centro storico, Trento','https://www.trentodocfestival.it/'],
 ['Il Festival dello Sport di Trento',10,1,'Centro storico, Trento','https://www.ilfestivaldellosport.it/'],
 ['Mercatini di Natale di Trento',11,21,'Piazza Fiera & Piazza Cesare Battisti, Trento',EV_HOME+'/it/esperienze/natale-in-trentino'],
 ['Trento Film Festival',4,24,'Vari luoghi, Trento','https://trentofestival.it/'],
 ["Festival dell'Economia di Trento",5,20,'Centro storico, Trento','https://www.festivaleconomia.it/it'],
 ['Feste Vigiliane',6,20,'Centro storico, Trento','https://www.visittrento.it/it/eventi-festival/festival-grandi-eventi']];
 const iso2=d=>d.toISOString().slice(0,10),today=iso2(t);
 return base.map(([title,mo,day,location,url])=>{let d=new Date(Date.UTC(Y,mo-1,day));if(iso2(d)<today)d=new Date(Date.UTC(Y+1,mo-1,day));return{title,date:iso2(d),time:'',location,url,source:'VisitTrentino'}})};
const absUrl=u=>{u=String(u||'').trim();if(!u)return'';if(/^https?:\/\//i.test(u))return u;if(u[0]==='/')return EV_HOME+u;return'https://'+u};
const slug=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const decode=s=>String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/&lt;/g,'<').replace(/&gt;/g,'>');
// Estrae gli eventi di Trento dall'HTML della guida: per ogni link evento cerca titolo (h2/h3), date e luogo vicini,
// e scarta le coppie in cui il titolo non corrisponde al link (evita link sbagliati).
function parseEventiHtml(html){
 const out=[],seen=new Set(),re=/href="((?:https?:\/\/www\.visittrentino\.info)?\/it\/guida\/cosa-fare\/eventi\/([a-z0-9\-_]+)_e_\d+)"/gi,hits=[];let m;
 while((m=re.exec(html)))hits.push({i:m.index,path:m[1],slug:m[2]});
 for(let k=0;k<hits.length;k++){const h=hits[k];if(seen.has(h.path))continue;
  const end=Math.min(hits[k+1]?hits[k+1].i:html.length,h.i+3500),win=html.slice(h.i,end);
  const tm=/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(win);if(!tm)continue;
  const title=decode(tm[1].replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim();
  if(!title||slug(title).slice(0,10)!==h.slug.slice(0,10))continue;
  const txt=win.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,'\n'),lines=decode(txt).split('\n').map(x=>x.trim()).filter(Boolean);
  const di=lines.findIndex(l=>/^\d{2}\/\d{2}\/\d{4}(\s*-\s*\d{2}\/\d{2}\/\d{4})?$/.test(l));if(di<1)continue;
  const dm=lines[di].match(/(\d{2})\/(\d{2})\/(\d{4})/g),conv=x=>x.slice(6)+'-'+x.slice(3,5)+'-'+x.slice(0,2);
  const loc=lines[di-1].replace(/\s*-\s*Una città da scoprire$/i,'');
  if(!/trento|povo|ravina|mattarello|villazzano|cadine|sardagna|bondone|piné|baselga/i.test(lines[di-1]))continue;
  seen.add(h.path);
  const start=conv(dm[0]),endD=dm[1]?conv(dm[1]):start,today=new Date().toISOString().slice(0,10);
  // eventi lunghi (mostre di mesi): mostrati a partire da oggi, non dal giorno di inizio
  out.push({title,date:start<today&&endD>=today?today:start,time:'',location:loc,url:absUrl(h.path),source:'VisitTrentino'})}
 return out}
const feed=async()=>{
 try{
  const out=[],seenU=new Set();
  for(const pg of [1,2,3]){
   const r=await fetch(EV_PAGE+'?mode=list&page='+pg,{headers:{'User-Agent':'Mozilla/5.0 (compatible; LaColumberaBot/1.0)'}});
   if(!r.ok)continue;
   for(const e of parseEventiHtml(await r.text()))if(!seenU.has(e.url)){seenU.add(e.url);out.push(e)}}
  if(out.length)return out
 }catch{}
 return curated();
};

const handler=async(req,res)=>{const rawA=String(req.query.a||''),a=rawA.split('?')[0],b=req.body&&typeof req.body==='object'?req.body:{};res.setHeader('Cache-Control','no-store');
try{
if(!BIG_BODY.has(a)){let n=0;try{n=JSON.stringify(b).length}catch{n=Infinity}if(n>20000)return res.status(413).json({err:'Richiesta troppo grande'})}
if(a==='og'){ // immagine di copertina (og:image) di una pagina ufficiale: usata dalle schede di Luoghi, Convenzioni e Come trovarci
 // siti ammessi (anti-abuso). Per aggiungere il sito di un partner: variabile Vercel OG_HOSTS, es. "sun7caffe.it,bistro.it"
 const HOSTS=['visittrentino.info','visittrento.it','gardatrentino.it','visitvaldinon.it','tastetrentino.it','muse.it','buonconsiglio.it','casteltoblino.it','trentinotrasporti.it','provincia.tn.it','forst.it','palestra-trento-juta.it'].concat((process.env.OG_HOSTS||'').split(',').map(s=>s.trim().toLowerCase().replace(/^www\./,'')).filter(Boolean));
 let u;try{u=new URL(String(req.query.u||''))}catch{return res.status(400).end()}
 const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||!HOSTS.some(d=>h===d||h.endsWith('.'+d)))return res.status(400).end();
 try{
  const r=await fetch(u.href,{headers:{'User-Agent':'Mozilla/5.0 (compatible; LaColumberaBot/1.0)'},redirect:'follow'});
  if(!r.ok)return res.status(404).end();
  const ct=r.headers.get('content-type')||'';
  if(ct.startsWith('image/')){ // il link punta già a un file immagine (pagina senza tag og:image): lo si inoltra direttamente
   res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
   res.setHeader('Location',r.url||u.href);return res.status(302).end();
  }
  const html=(await r.text()).slice(0,300000);
  const m=html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["']/i);
  if(!m)return res.status(404).end();
  const img=new URL(m[1].replace(/&amp;/g,'&'),u.href);
  if(img.protocol!=='https:')return res.status(404).end();
  res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
  res.setHeader('Location',img.href);return res.status(302).end();
 }catch{return res.status(502).end()}
}
// Configurazione PUBBLICA (la leggono le pagine degli appartamenti): niente URL iCal (contengono token segreti), niente chiusure né blocchi manuali.
// La configurazione completa la legge solo il pannello admin, con il login (a=cfg_admin).
if(a==='cfg'){const c0=await cfg(req);return res.json({chi:c0.chi,cipat:cipatPub(),apts:(c0.apts||[]).map(({blocked,...p})=>p)})}
if(a==='busy'){const id=String(req.query.id||'');
 // Fail-closed: se la disponibilità non è verificabile NON si mostrano date libere (503 → il sito mostra "non verificabile")
 try{const config=await cfg(req);if(!E.aptExists(config,id))return res.status(404).json({err:'not found'});
  const r=await E.guestBusy(config,id);
  if(r.status==='unverifiable'){res.setHeader('Cache-Control','no-store');return res.status(503).json({v:2,status:'unverifiable'})}
  res.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=15');
  return res.json({v:2,status:r.status,asOf:r.asOf,dates:r.dates,notice:r.notice,limit:r.limit})}
 catch(e){console.error('busy:',e.message);res.setHeader('Cache-Control','no-store');return res.status(503).json({v:2,status:'unverifiable'})}}
if(a==='ical'&&String(req.query.for||'').toLowerCase()==='all'){
 // Calendario PERSONALE con tutte le prenotazioni (nomi ospiti inclusi): richiede la chiave ICAL_PERSONAL_KEY (variabile d'ambiente Vercel), passata come &k=
 const key=process.env.ICAL_PERSONAL_KEY||'';
 if(!key||!eq(String(req.query.k||''),key))return res.status(403).send('forbidden');
 try{const config=await cfg(req),id=String(req.query.id||'all'),ids=id==='all'?(config.apts||[]).map(x=>x.id):[id];
  if(!ids.length||!ids.every(i=>E.aptExists(config,i)))return res.status(404).send('not found');
  const r=await E.exportIcsAll(config,ids);
  res.setHeader('Content-Type','text/calendar; charset=utf-8');res.setHeader('Cache-Control','private, no-store');
  return res.send(r.ics)}
 catch(e){console.error('ical-all:',e.message);res.setHeader('Retry-After','300');return res.status(503).send('Calendario temporaneamente non disponibile')}}
if(a==='ical'){const id=String(req.query.id||'');
 // ?for=booking|airbnb esclude dal calendario gli eventi della piattaforma destinataria (evita l'eco/i blocchi "fantasma")
 const forSource={booking:'BOOKING',airbnb:'AIRBNB'}[String(req.query.for||'').toLowerCase()]||'';
 try{const config=await cfg(req);if(!E.aptExists(config,id))return res.status(404).send('not found');
  // ?for=site = SOLO prenotazioni del sito (è il link da dare a Booking e Airbnb; i blocchi manuali NON sono inclusi, scelta del titolare); senza for = unione di tutte le fonti (uso interno/legacy)
  const siteOnly=String(req.query.for||'').toLowerCase()==='site';
  const r=siteOnly?await E.exportIcsSite(config,id):await E.exportIcs(config,id,{forSource});
  // se i dati non sono completi si risponde 503: la piattaforma tiene l'ultimo calendario importato invece di ricevere date sbagliate
  if(!r.ok){res.setHeader('Retry-After','300');return res.status(503).send('Calendario temporaneamente non disponibile')}
  res.setHeader('Content-Type','text/calendar; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=120');res.setHeader('X-LC-Status',r.status);
  return res.send(r.ics)}
 catch(e){console.error('ical:',e.message);res.setHeader('Retry-After','300');return res.status(503).send('Calendario temporaneamente non disponibile')}}
if(a==='events')return res.json((await jg('events'))||[]);
if(a==='events_feed'){res.setHeader('Cache-Control','s-maxage=21600');return res.json(await feed())};
if(a==='checkout'){const lim=await ACC.limitIp(req,'co',ACC.RL.checkoutIp);if(lim)return deny(res,lim);
 const config=await cfg(req),p=(config.apts||[]).find(x=>x.id===b.id);
 if(!p||!AV.isIso(b.da)||!AV.isIso(b.a)||b.a<=b.da||b.da<todayRome()||typeof b.nome!=='string'||!b.nome.trim()||typeof b.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim())||(b.tel!=null&&typeof b.tel!=='string'&&typeof b.tel!=='number'))return res.status(400).json({err:'Dati non validi'});
 if(config.closed&&config.closed[p.id])return res.status(409).json({err:'Appartamento non disponibile in questo periodo'});
 const g=days(b.da,b.a);const mn=minFor(p,b.da);if(g.length<mn||g.length>60)return res.status(400).json({err:'Durata non valida (minimo '+mn+' notti per queste date)'});
 // Orizzonte: dal sito si prenota al massimo 6 mesi in avanti. Il calendario non permette di scegliere date più lontane; qui lo si fa rispettare anche a chi chiama l'API a mano.
 const lastDay=AV.maxBookingDate(Date.now());
 if(b.a>lastDay)return res.status(409).json({err:'Dal sito si può prenotare fino al '+fmtLong(lastDay)+' (al massimo '+AV.GUEST_MONTHS+' mesi in anticipo). Per date più lontane scrivici a lacolumbera@gmail.com o chiamaci al +39 351 704 3594.',code:'OLTRE_ORIZZONTE',ultimoGiorno:lastDay});
 // Preavviso minimo (impostazione del titolare, Gestione → Prenotazioni): il controllo è QUI, sul server, prima di hold e pagamento. Cambiare il browser non lo aggira.
 const nt=AV.noticeSettings(config),noticeErr=()=>{const t=Date.now();return AV.noticeOk(b.da,t,nt)?null:noticeBody(nt,t)};
 const ne=noticeErr();if(ne)return res.status(409).json(ne);
 if(!process.env.STRIPE_SECRET_KEY)return res.status(500).json({err:'Pagamento non configurato (manca STRIPE_SECRET_KEY su Vercel)'});
 const n=Math.min(Math.max(+b.ospiti||1,1),p.max),NV={err:'Disponibilità temporaneamente non verificabile: riprova tra qualche minuto o scrivici a lacolumbera@gmail.com'},ND={err:'Date non più disponibili'};
 // 1) controllo (fail-closed)  2) HOLD ATOMICO sulle notti  3) ricontrollo dopo l'hold  4) sessione Stripe
 try{const pre=await E.checkRange(config,p.id,b.da,b.a);
  if(pre.status==='unverifiable')return res.status(503).json(NV);
  if(pre.conflicts.length)return res.status(409).json(ND)}
 catch(e){console.error('checkout/pre:',e.message);return res.status(503).json(NV)}
 const totale=g.reduce((s,d)=>s+np(p,d)+sup(p,n),0);
 const r={code:c.randomBytes(3).toString('hex').toUpperCase(),id:p.id,da:b.da,a:b.a,notti:g.length,ospiti:n,nome:String(b.nome).trim().slice(0,80),email:String(b.email).trim().toLowerCase().slice(0,120),tel:String(b.tel||'').slice(0,30),totale,stato:'in_attesa',creato:new Date().toISOString()};
 let h;try{h=await E.holdAcquire(p.id,g,r.code,E.T.holdTtlSec)}catch(e){console.error('checkout/hold:',e.message);return res.status(503).json(NV)}
 if(!h.ok)return res.status(409).json(ND);
 try{const post=await E.checkRange(config,p.id,b.da,b.a,{ignoreHold:r.code,fresh:false});
  if(post.status==='unverifiable'){await E.holdRelease(p.id,g,r.code);return res.status(503).json(NV)}
  const ne2=noticeErr();      // il limite può scadere mentre si acquisisce l'hold: si ricontrolla con l'orologio di adesso
  if(ne2){await E.holdRelease(p.id,g,r.code);return res.status(409).json(ne2)}
  if(post.conflicts.length){await E.holdRelease(p.id,g,r.code);return res.status(409).json(ND)}
  await E.bkPut(r)}
 catch(e){await E.holdRelease(p.id,g,r.code).catch(()=>{});console.error('checkout/post:',e.message);return res.status(503).json(NV)}
 const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY),site='https://'+req.headers.host;
 let session;
 try{session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:r.email,client_reference_id:r.code,locale:'it',
  line_items:[{quantity:1,price_data:{currency:'eur',unit_amount:Math.round(totale*100),product_data:{name:APT_LABEL[p.id]||p.nome,description:F2(r.da)+' → '+F2(r.a)+' · '+n+' ospiti · '+g.length+' notti'}}}],
  metadata:{code:r.code,apt:p.id,da:r.da,a:r.a},
  success_url:site+'/'+p.id+'.html?pagamento=successo&code='+r.code,
  cancel_url:site+'/'+p.id+'.html?pagamento=annullato&code='+r.code,
  expires_at:Math.floor(Date.now()/1000)+1810})}
 catch(e){await E.holdRelease(p.id,g,r.code).catch(()=>{});await E.bkDel(r.code).catch(()=>{});console.error('checkout/stripe:',(e&&(e.type||e.code))||'errore');return res.status(500).json({err:'Non è stato possibile avviare il pagamento: riprova tra qualche minuto.'})}
 r.sessione=session.id;await E.bkPut(r).catch(()=>{});
 // token segreto per questa prenotazione: il browser lo tiene in sessionStorage (ritorno da Stripe, annullo, area clienti)
 let t=null;try{t=await ACC.issueForBooking(r,'checkout')}catch(e){console.error('checkout/token:',e.message)}
 return res.json({code:r.code,url:session.url,t})}
if(a==='checkout_cancel'){ // l'ospite torna indietro dalla pagina Stripe: libera subito le notti (il record resta: se paga lo stesso, il webhook lo conferma)
 // Serve il token del checkout: senza, nessuno può liberare le notti trattenute da un altro (la risposta è sempre la stessa;
 // in mancanza di token le notti si liberano comunque alla scadenza dell'hold o con l'evento "expired" di Stripe).
 const code=String(b.code||'').trim().toUpperCase();
 if(code&&await ACC.verify(code,b.t)){const x=await E.bkGet(code);if(x&&x.stato==='in_attesa')await E.holdRelease(x.id,days(x.da,x.a),x.code)}
 return res.json({ok:1})}
if(a==='checkout_status'){ // l'ospite è tornato dal pagamento: com'è andata? Se il webhook non è ancora arrivato lo si chiede a Stripe (rete di sicurezza: stesso percorso di conferma del webhook)
 const lim=await ACC.limitIp(req,'cs',ACC.RL.statusIp);if(lim)return deny(res,lim);
 const code=String(b.code||'').trim().toUpperCase();
 if(!(code&&await ACC.verify(code,b.t)))return res.status(404).json(require('./_accesso.js').ERR_NOT_FOUND);
 let bk=await E.bkGet(code);if(!bk)return res.status(404).json(require('./_accesso.js').ERR_NOT_FOUND);
 if(bk.stato==='in_attesa'){
  try{await require('./_pagato.js').riconcilia(bk,req)}catch(e){console.error('checkout_status:',String(e&&(e.code||e.message)||'errore').slice(0,80))}      // un errore (Stripe, passo già in corso) non cambia la risposta: si dice lo stato attuale
  bk=await E.bkGet(code)||bk}
 return res.json({stato:bk.stato,email:maskEmail(bk.email)})}
// Area clienti e Guest Card: il codice da solo NON basta. Serve il token (link della mail / sessione) oppure codice + data di arrivo + email.
const guestAuth=async()=>ACC.authorize(req,{code:b.code,t:b.t,da:b.da,email:b.email},async code=>findBooking(await cfg(req),code));
if(a==='mie'){const r=await guestAuth();if(!r.ok)return deny(res,r);const x=r.booking;
 if(['annullata','in_attesa','richiesta','da_verificare'].includes(x.stato))return res.status(404).json(require('./_accesso.js').ERR_NOT_FOUND);      // l'area clienti mostra solo prenotazioni confermate (da_verificare è uno stato interno)
 return res.json({t:r.token||undefined,prenotazioni:[{code:x.code,id:x.id,da:x.da,a:x.a,ospiti:x.ospiti,notti:x.notti,stato:x.stato}]})}
if(a==='gc_check'){const r=await guestAuth();if(!r.ok)return deny(res,r);const x=r.booking;
 if(x.stato==='annullata')return res.status(409).json({err:'Questa prenotazione risulta annullata'});
 if(x.stato==='in_attesa'||x.stato==='richiesta'||x.stato==='da_verificare')return res.status(409).json({err:'Prenotazione non ancora confermata: riprova dopo la conferma (pagamento completato)'});
 if(!(x.ospiti>0))return res.status(409).json({err:'Numero di ospiti non ancora registrato per questa prenotazione: scrivici a lacolumbera@gmail.com'});
 const card=await jg(GCK(x.code));
 return res.json({t:r.token||undefined,booking:{id:x.id,da:x.da,a:x.a,notti:x.notti,ospiti:x.ospiti,needsEmail:!x.email},card:cardOut(card)})}
if(a==='gc_issue'){const r=await guestAuth();if(!r.ok)return deny(res,r);const x=r.booking;
 if(x.stato!=='confermata')return res.status(409).json({err:'La prenotazione non è (ancora) confermata'});
 if(!(x.ospiti>0))return res.status(409).json({err:'Numero di ospiti non ancora registrato per questa prenotazione: scrivici a lacolumbera@gmail.com'});
 const existing=await jg(GCK(x.code));if(existing)return res.json(cardOut(existing)); // idempotente: non ricrea una seconda card
 let email=x.email;
 if(!email){email=String(b.email||'').trim().toLowerCase().slice(0,120);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({err:'Email non valida'})}
 if(!process.env.TGC_CARD_TYPE_ID)
  return res.status(500).json({err:'Guest Card non configurata sul server (manca TGC_CARD_TYPE_ID su Vercel: chiama prima gc_tipologie per trovarlo)'});
 // Notare: date, notti e numero ospiti arrivano SOLO da "x" (la prenotazione verificata lato server),
 // mai dal corpo della richiesta del browser: è questo che impedisce all'ospite di alterarli.
 let tgc;
 try{tgc=await emettiGuestCardTGC({dal:x.da,al:x.a,email,personeMax:x.ospiti,codice:x.code})}
 catch(e){console.error('gc_issue: TGC',String(e&&e.message||'errore').slice(0,120));return res.status(502).json({err:'Il sistema Trentino Guest Card non ha risposto: riprova più tardi o scrivici a lacolumbera@gmail.com.'})}
 // Con "Emissione Essenziale" esito:true torna subito il QrCode della card emessa (già valido). Si conserva solo ciò che serve (niente risposta grezza).
 const card={gc_id:tgc.QrCode||'',stato:'richiesta_inviata',valid_from:x.da,valid_to:x.a,ospiti:x.ospiti,email,creato:new Date().toISOString()};
 await kv('SET',GCK(x.code),JSON.stringify(card));
 return res.json(cardOut(card))}
if(a==='gc_oauth_callback'){ // pubblico: redirect di ritorno da Trentino Marketing dopo il login della struttura
 // Il redirect registrato è la home: index.html inoltra qui in automatico (?a=gc_oauth_callback&state=…&code=…).
 // Per sicurezza si accetta anche il caso in cui Trentino accodi "?state=..&code=.." dentro "a" (rawA).
 const q=new URLSearchParams(rawA.includes('?')?rawA.slice(rawA.indexOf('?')+1):'');
 const code=req.query.code||q.get('code'),state=req.query.state||q.get('state');
 if(!code||!state)return res.status(400).send('Parametri mancanti (code/state)');
 const okState=await jg('tgc:oauth:state:'+state);
 if(!okState)return res.status(400).send('Sessione di autorizzazione scaduta o già usata: riprova dal pannello admin');
 await kv('DEL','tgc:oauth:state:'+state);
 const diag={},h=s=>String(s).replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
 try{
  const tok=await tgcExchangeCode(String(code),diag);
  await kv('SET','tgc:oauth:token',JSON.stringify({Token:tok.Token,RefreshToken:tok.RefreshToken,expiresAt:tok.expiresAt}));
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.send('<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3;url=/admin.html#guestcard"></head><body style="font-family:sans-serif;padding:40px"><h2>Trentino Guest Card autorizzata ✅</h2><p>Ti riporto al pannello admin… <a href="/admin.html#guestcard">Vai subito</a></p></body></html>')
 }catch(e){
  // Diagnostica: tutto quello che serve per capire perché Trentino Marketing ha rifiutato lo scambio (mai il secret in chiaro)
  Object.assign(diag,{chiaviQuerySulCallback:Object.keys(req.query),rawAConPunto:rawA.includes('?'),errore:e.message});
  console.error('gc_oauth_callback',JSON.stringify(diag));
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.status(502).send('<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;padding:40px;max-width:760px"><h2>Autorizzazione Trentino Guest Card non riuscita</h2><p>Il login è andato a buon fine ma lo scambio del codice è stato rifiutato. Dettagli (il secret non viene mai mostrato):</p><pre style="white-space:pre-wrap;word-break:break-word;background:#f4f0e6;padding:16px;border-radius:8px;font-size:14px">'+h(JSON.stringify(diag,null,2))+'</pre><p>Il codice è monouso: per riprovare rifai «Autorizza Trentino Guest Card» dal <a href="/admin.html#guestcard">pannello admin</a>.</p></body></html>')}}
if(a==='login'){if(!S()||!process.env.ADMIN_USER)return res.status(500).json({err:'Mancano ADMIN_USER e ADMIN_PASSWORD su Vercel'});
 const bl=await ACC.blockedIp(req,'lg',ACC.RL.loginIp);if(bl)return deny(res,bl);      // troppi tentativi falliti da questo IP: pausa
 if(eq(String(b.u||''),process.env.ADMIN_USER)&eq(String(b.p||''),process.env.ADMIN_PASSWORD))return res.json({t:sign(String(Date.now()+288e5))});
 await ACC.countFail(req,'lg',ACC.RL.loginIp);
 await new Promise(r=>setTimeout(r,1200));return res.status(401).json({err:'Credenziali errate'})}
// ---- Sincronizzazione: chiamabile dallo script Apps Script (header x-sync-secret = SYNC_SECRET) o da un admin loggato ----
const machine=()=>{const s=process.env.SYNC_SECRET||'',h=String(req.headers['x-sync-secret']||'');return !!s&&!!h&&eq(h,s)};
if(a==='sync'||a==='reconcile'||a==='sync_status'){
 if(!machine()&&!auth(req))return res.status(401).json({err:'Non autorizzato'});
 const config=await cfg(req);
 if(a==='sync'){const out=await E.syncAll(config,{force:!!b.force,feeds:b.feeds!==false,registry:b.registry!==false,drain:!!b.drain,events:!!b.events});
  await syncAlerts(config,req).catch(e=>console.error('syncAlerts:',e.message));
  // rete di sicurezza dei pagamenti: prenotazioni rimaste "in attesa" con una sessione Stripe già pagata (webhook perso) vengono confermate qui
  out.pagamenti=await require('./_pagato.js').riconciliaInAttesa(req).catch(e=>({controllate:0,recuperate:0,errori:[String(e&&e.message||e).slice(0,80)]}));
  return res.json(out)}
 if(a==='reconcile')return res.json(await E.reconcile(config,{days:Math.min(Math.max(+b.days||90,7),180)}));
 const [last,logs]=await Promise.all([jg('reconcile:last'),kv('LRANGE','sync:log','0','19')]);
 return res.json(Object.assign(await E.syncState(config,{}),{lastReconcile:last,log:(logs||[]).map(x=>{try{return JSON.parse(x)}catch{return {msg:String(x)}}})}))}
if(!auth(req))return res.status(401).json({err:'Non autorizzato'});
if(a==='cfg_admin')return res.json(await cfg(req));
if(a==='health')return res.json(await require('./_pagato.js').salute(req,await cfg(req)));
if(a==='test_mail'){const P=require('./_pagato.js'),r=await sendMail(P.OWNER_EMAIL,'Prova email · La Columbera','<p>Se leggi questo messaggio le email di <b>La Columbera</b> partono correttamente: riceverai così anche le conferme di prenotazione.</p><p>Inviata da Gestione → Sincronizzazione → Pagamenti ed email.</p>',{text:'Se leggi questo messaggio le email di La Columbera partono correttamente: riceverai così anche le conferme di prenotazione.'});
 return res.json({esito:r===true?'inviata':r===null?'non_configurata':'errore',destinatario:P.mask(P.OWNER_EMAIL)})}
if(a==='gc_oauth_start'){ // solo admin: genera l'url di login Trentino Guest Card (il frontend fa location.href=url)
 if(!process.env.TGC_OAUTH_CLIENT_ID||!process.env.TGC_REDIRECT_URI)return res.status(500).json({err:'Mancano TGC_OAUTH_CLIENT_ID o TGC_REDIRECT_URI su Vercel'});
 const state=c.randomBytes(16).toString('hex');
 await kv('SET','tgc:oauth:state:'+state,'1','EX','600');
 const qs=new URLSearchParams({client_id:process.env.TGC_OAUTH_CLIENT_ID,redirect_uri:process.env.TGC_REDIRECT_URI,state});
 return res.json({url:TGC_BASE+'/loginricettivo.aspx?'+qs})}
if(a==='gc_manual_issue'){ // solo admin: emette una Guest Card per date/ospiti scelti a mano, senza prenotazione sul sito
 const R=/^\d{4}-\d\d-\d\d$/,email=String(b.email||'').trim().toLowerCase(),personeMax=Math.min(Math.max(+b.ospiti||1,1),12);
 if(!R.test(b.da)||!R.test(b.a)||b.a<=b.da)return res.status(400).json({err:'Date non valide'});
 if(!/.+@.+\..+/.test(email))return res.status(400).json({err:'Email non valida'});
 if(!process.env.TGC_CARD_TYPE_ID)return res.status(500).json({err:'Guest Card non configurata sul server (manca TGC_CARD_TYPE_ID su Vercel)'});
 const codice='MAN-'+c.randomBytes(3).toString('hex').toUpperCase();let tgc;
 try{tgc=await emettiGuestCardTGC({dal:b.da,al:b.a,email,personeMax,codice})}
 catch(e){return res.status(502).json({err:'Errore dal sistema Trentino Guest Card: '+e.message})}
 const rec={codice,gc_id:tgc.QrCode||'',nome:String(b.nome||'').slice(0,80),email,da:b.da,a:b.a,ospiti:personeMax,apt:String(b.apt||'').slice(0,20),note:String(b.note||'').slice(0,200),creato:new Date().toISOString()};
 const list=(await jg('gc:manual'))||[];list.unshift(rec);await kv('SET','gc:manual',JSON.stringify(list.slice(0,300)));
 return res.json(rec)}
if(a==='gc_manual_list')return res.json((await jg('gc:manual'))||[]);
if(a==='gc_tipologie'){ // solo admin: elenco tipologie card, serve una volta per trovare il TGC_CARD_TYPE_ID da mettere su Vercel
 try{return res.json(await tgcCall('TipologieCard.ashx'))}
 catch(e){return res.status(502).json({err:e.message})}}
if(a==='gc_attributi'){ // solo admin: verifica se una tipologia card richiede idAttributo
 const idTipologiaCard=req.query.idTipologiaCard||b.idTipologiaCard;
 if(!idTipologiaCard)return res.status(400).json({err:'Manca idTipologiaCard'});
 try{return res.json(await tgcCall('AttributiCard.ashx?idTipologiaCard='+encodeURIComponent(idTipologiaCard)))}
 catch(e){return res.status(502).json({err:e.message})}}
if(a==='adm'){const config=await cfg(req),t40=Date.now()-24e5,
  bk=(await E.bkAll()).filter(x=>!(x.stato==='in_attesa'&&Date.parse(x.creato)<t40)).sort((x,y)=>String(x.creato).localeCompare(String(y.creato))),
  occupancy=await E.adminOccupancy(config,{fresh:false}),sync=await E.syncState(config,{events:true}),ext=[];
 for(const f of sync.feeds){for(const e of (f.events||[]))ext.push({id:f.apt,da:e.start,a:e.end,src:{BOOKING:'Booking',AIRBNB:'Airbnb'}[f.source]||'Altro'});delete f.events}
 for(const r of await E.registryRows())if(r.stato!=='ANNULLATA')ext.push({id:r.apt||'',da:r.checkin,a:r.checkout,src:'Foglio'});
 return res.json({bk,ext,occupancy,sync})}
if(a==='busy_debug'){ // perché una data è occupata: elenco fonti per ogni giorno, vista ospite (con orizzonte e fail-closed)
 const config=await cfg(req),id=String(req.query.id||b.id||'');if(!E.aptExists(config,id))return res.status(404).json({err:'not found'});
 const occ=await E.occupancyOf(config,id,{mode:'guest',fresh:true}),from=todayRome(),out=[];
 for(let i=0;i<Math.min(Math.max(+req.query.days||120,1),400);i++){const d=addDays(from,i),s=occ.days[d]||[];out.push({date:d,busy:s.length>0,sources:[...new Set(s.map(x=>x.src))],reason:s.length?s[0].src:null,refs:s.map(x=>x.ref).filter(Boolean)})}
 return res.json({apt:id,status:occ.status,problems:occ.problems,feeds:occ.feeds,registry:occ.registry,asOf:occ.asOf,days:out})}
if(a==='stato'){const x=await E.bkGet(b.code);
 if(!x||!['richiesta','in_attesa','confermata','annullata'].includes(b.stato))return res.json({ok:1,changed:0});
 const was=x.stato;
 // Confermare a mano ciò che non lo è ancora (tipicamente "da_verificare"): prima si controllano le sovrapposizioni con le altre fonti.
 // Senza b.force la richiesta è respinta (409) con il dettaglio; con b.force la decisione è del titolare e ne resta traccia nella nota.
 if(b.stato==='confermata'&&was!=='confermata'){
  let cf;try{cf=await E.conflictsFor(await cfg(req),x)}catch(e){cf={status:'unverifiable',problems:[],conflicts:[]}}
  const dubbio=cf.conflicts.length>0||cf.status==='unverifiable';
  if(dubbio&&!b.force)return res.status(409).json({err:cf.conflicts.length?'Le date si sovrappongono ad altre prenotazioni.':'Disponibilità non verificabile in questo momento: sincronizza e riprova.',conflicts:cf.conflicts.slice(0,10),unverifiable:cf.status==='unverifiable'});
  if(dubbio)x.note='CONFERMATA A MANO DAL TITOLARE NONOSTANTE '+(cf.conflicts.length?'SOVRAPPOSIZIONE ('+cf.conflicts.slice(0,5).map(c=>c.date+' '+c.by.join('+')).join(', ')+')':'DISPONIBILITÀ NON VERIFICABILE')+' · '+new Date().toISOString();
  x.confermata_il=new Date().toISOString();
 }
 x.stato=b.stato;if(b.stato==='annullata'&&was!=='annullata')x.annullata_il=new Date().toISOString();
 await E.bkPut(x);
 if(b.stato==='annullata')await E.holdRelease(x.id,days(x.da,x.a),x.code).catch(()=>{});
 if(b.stato==='confermata'||b.stato==='annullata')await sheetUpsertBooking(x);   // il foglio resta allineato (con coda di ripresa)
 // Una prenotazione "da_verificare" era già pagata ma NON comunicata all'ospite: ora che il titolare la conferma gli parte la conferma (una sola volta).
 if(b.stato==='confermata'&&was==='da_verificare'&&x.pagamento&&/.+@.+\..+/.test(x.email||'')&&(await kv('SET','done:'+x.code+':mail_ospite',new Date().toISOString(),'NX'))==='OK'){
  let tk=null;try{tk=await ACC.issueForBooking(x,'mail')}catch(e){console.error('stato/token:',e.message)}
  const gm=require('./_mail.js').guestMail(x,process.env.SITE_URL||'https://'+req.headers.host,tk);
  if((await sendMail(x.email,gm.subject,gm.html,{text:gm.text,replyTo:REPLY_TO}))===false)await kv('DEL','done:'+x.code+':mail_ospite').catch(()=>{});
 }
 return res.json({ok:1,changed:1})}
if(a==='book_del'){const x=await E.bkGet(b.code);if(!x)return res.json({ok:1,removed:0});
 if(x.stato==='confermata'||x.stato==='da_verificare'){ // lo storico confermato non si cancella: diventa "annullata" (resta nel foglio per audit e riconciliazione)
  x.stato='annullata';x.annullata_il=new Date().toISOString();await E.bkPut(x);await E.holdRelease(x.id,days(x.da,x.a),x.code).catch(()=>{});await sheetUpsertBooking(x);
  return res.json({ok:1,removed:0,annullata:1})}
 await E.bkDel(x.code);await E.holdRelease(x.id,days(x.da,x.a),x.code).catch(()=>{});return res.json({ok:1,removed:1})}
if(a==='event_add'){const list=(await jg('events'))||[];if(!b.title||!b.date)return res.status(400).json({err:'Titolo e data obbligatori'});
 list.push({id:c.randomBytes(4).toString('hex'),title:String(b.title).slice(0,200),date:String(b.date).slice(0,10),time:String(b.time||'').slice(0,20),location:String(b.location||'').slice(0,200),url:absUrl(b.url).slice(0,400),source:'La Columbera'});
 await kv('SET','events',JSON.stringify(list));return res.json({ok:1})}
if(a==='event_del'){let list=(await jg('events'))||[];list=list.filter(x=>x.id!==b.id);await kv('SET','events',JSON.stringify(list));return res.json({ok:1})}
if(a==='up'){const m=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(b.img||'');if(!m)return res.status(400).json({err:'Immagine non valida'});
 const o=await put('foto/'+String(b.id).replace(/\W/g,'')+'/f.jpg',Buffer.from(m[2],'base64'),{access:'public',contentType:m[1],addRandomSuffix:true});return res.json({url:o.url})}
if(a==='save'){const old=await cfg(req),pre=AV.parseNoticeInput(b,old);if(pre.err)return res.status(400).json({err:pre.err});
 // campi di contenuto nuovi: una pagina di gestione non aggiornata (non li invia) non deve cancellare quelli già salvati
 const oa=new Map((old.apts||[]).map(x=>[String(x.id),x])),saved=(p,k)=>p[k]!==undefined?p[k]:(oa.get(String(p.id))||{})[k],ostr=(v,n)=>v===undefined?undefined:String(v).trim().slice(0,n);
 const n={chi:String(b.chi||'').slice(0,4000),preavvisoGiorni:pre.giorni,checkinOra:pre.ora,ical:{},closed:{},apts:(b.apts||[]).map(p=>({id:String(p.id),nome:String(p.nome).slice(0,80),sotto:String(p.sotto||'').slice(0,120),testo:String(p.testo).slice(0,4000),dettagli:ostr(saved(p,'dettagli'),6000),servizi:ostr(saved(p,'servizi'),4000),cin:ostr(saved(p,'cin'),40),cipat:ostr(saved(p,'cipat'),40),base:+p.base||0,inclusi:+p.inclusi||1,extra:+p.extra||0,extraSteps:(Array.isArray(p.extraSteps)?p.extraSteps:[]).map(v=>Math.max(0,+v||0)).slice(0,12),max:+p.max||1,min:+p.min||1,minPeriodi:(p.minPeriodi||[]).filter(q=>q.da&&q.a&&q.a>=q.da).map(q=>({da:q.da,a:q.a,min:Math.max(1,+q.min||1)})),blocked:Object.fromEntries(Object.entries(p.blocked||{}).filter(([k,v])=>v&&/^\d{4}-\d\d-\d\d$/.test(k)).map(([k])=>[k,true])),foto:(p.foto||[]).map(String),periodi:(p.periodi||[]).filter(q=>q.da&&q.a).map(q=>({da:q.da,a:q.a,prezzo:+q.prezzo||0})),prices:Object.fromEntries(Object.entries(p.prices||{}).filter(([k,v])=>v!=null&&v!=='').map(([k,v])=>[k,+v]))}))};
 for(const k of Object.keys(b.ical||{}))n.ical[k]=String(b.ical[k]||'');
 for(const k of Object.keys(b.closed||{}))n.closed[k]=!!b.closed[k];
 const keep=new Set(n.apts.flatMap(p=>p.foto));
 for(const p of old.apts)for(const u of p.foto)if(!keep.has(u)&&/blob\.vercel-storage\.com/.test(u))await del(u).catch(()=>{});
 await kv('SET','cfg',JSON.stringify(n));
 await E.refreshFeeds(n,{force:true}).catch(()=>{});   // nuovi URL iCal: scarico subito, così il sito non resta "non verificabile" fino al prossimo giro
 return res.json({ok:1})}
res.status(404).json({err:'?'})}catch(e){console.error('x:',a,String(e&&e.message||e).slice(0,160));res.status(500).json({err:'Errore interno: riprova tra qualche minuto.'})}};
module.exports=handler;
module.exports.kv=kv;module.exports.kvp=kvp;module.exports.engine=E;module.exports.cfg=cfg;
module.exports.sheetAppend=sheetAppend;module.exports.sheetUpsertBooking=sheetUpsertBooking;module.exports.getBk=E.bkAll;
module.exports.OWNER_EMAIL=OWNER_EMAIL;module.exports.REPLY_TO=REPLY_TO;module.exports.access=ACC;module.exports.APT_LABEL=APT_LABEL;module.exports.F2=F2;module.exports.sendMail=sendMail;module.exports.auth=auth;
