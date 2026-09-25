const c=require('crypto'),{put,del}=require('@vercel/blob');
const KU=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,KT=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const kv=async(...a)=>(await(await fetch(KU,{method:'POST',headers:{Authorization:'Bearer '+KT},body:JSON.stringify(a)})).json()).result;
const jg=async k=>JSON.parse(await kv('GET',k)||'null');
const sha=s=>c.createHash('sha256').update(String(s)).digest();
const eq=(x,y)=>c.timingSafeEqual(sha(x),sha(y));
const S=()=>process.env.SESSION_SECRET||process.env.ADMIN_PASSWORD||'';
const sign=p=>p+'.'+c.createHmac('sha256',S()).update(p).digest('hex');
const auth=r=>{const t=r.headers.authorization||'',p=t.split('.')[0];return !!S()&&+p>Date.now()&&eq(t,sign(p))};
const cfg=async r=>(await jg('cfg'))||await(await fetch('https://'+r.headers.host+'/data/default.json')).json();
const iso=d=>d.toISOString().slice(0,10);
const days=(da,a)=>{const o=[];for(let d=new Date(da);d<new Date(a);d.setUTCDate(d.getUTCDate()+1))o.push(iso(d));return o};
const addDays=(s,n)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const np=(p,d)=>{if(p.prices&&p.prices[d]!=null)return +p.prices[d];const x=(p.periodi||[]).find(q=>d>=q.da&&d<=q.a);return+(x?x.prezzo:p.base)};
const F=s=>s.replace(/(\d{4})(\d\d)(\d\d)/,'$1-$2-$3');
const F2=s=>{const m=/(\d{4})-(\d\d)-(\d\d)/.exec(s);return m?m[3]+'/'+m[2]+'/'+m[1]:s};
const APT_LABEL={torre:'La Columbera - Torre, Appartamento con 2 camere da letto',corte:'La Columbera - Corte, Appartamento con 1 camere da letto'};
const aptFromLabel=s=>/corte/i.test(s)?'corte':/torre/i.test(s)?'torre':'';
const icalUrls=(config,id)=>{const cf=(config.ical&&config.ical[id])?String(config.ical[id]):'';const en=process.env['ICAL_'+id.toUpperCase()]||'';return (cf+','+en).split(',').map(s=>s.trim()).filter(Boolean)};
const evs=async(config,id)=>{const o=[];for(const u of icalUrls(config,id)){try{const t=await(await fetch(u)).text(),src=/booking/.test(u)?'Booking':/airbnb/.test(u)?'Airbnb':'Altro';for(const e of t.split('BEGIN:VEVENT').slice(1)){const a=/DTSTART[^:]*:(\d{8})/.exec(e),b=/DTEND[^:]*:(\d{8})/.exec(e);if(a&&b)o.push({da:F(a[1]),a:F(b[1]),src})}}catch{}}return o};

// ---- Google Sheet (prenotazioni) ----
const sheetCsvUrl=()=>process.env.SHEET_CSV_URL||('https://docs.google.com/spreadsheets/d/'+(process.env.SHEET_ID||'1FtQXb6Yx8rdVrDxbFmgv34f2btHzqaC9wenVbL2ujDY')+'/gviz/tq?tqx=out:csv&gid='+(process.env.SHEET_GID||'0'));
function parseCSV(text){const rows=[];let row=[],cur='',q=false;for(let i=0;i<text.length;i++){const ch=text[i];if(q){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch}else{if(ch==='"')q=true;else if(ch===','){row.push(cur);cur=''}else if(ch==='\n'){row.push(cur);rows.push(row);row=[];cur=''}else if(ch==='\r'){}else cur+=ch}}if(cur!==''||row.length){row.push(cur);rows.push(row)}return rows}
const itDate=s=>{const m=/(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s));return m?m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'):(/^\d{4}-\d\d-\d\d/.test(String(s))?String(s).slice(0,10):'')};
async function sheetBookings(){try{const t=await(await fetch(sheetCsvUrl(),{headers:{'User-Agent':'LaColumberaBot/1.0'}})).text();const rows=parseCSV(t);if(rows.length<2)return[];const out=[];for(let i=1;i<rows.length;i++){const r=rows[i];if(!r||!(r[0]||'').trim())continue;const code=String(r[0]).trim(),da=itDate(r[1]),id=aptFromLabel(String(r[2]||'')),ospiti=parseInt(String(r[3]||'').trim())||0,notti=parseInt(String(r[4]||'').trim())||0;if(!code||!da||!id||!notti)continue;out.push({code,id,da,a:addDays(da,notti),ospiti,notti,stato:'confermata',fonte:'foglio'})}return out}catch{return[]}}
async function sheetAppend(b){const url=process.env.SHEET_WEBAPP_URL;if(!url)return;try{await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:process.env.SHEET_SECRET||'',code:b.code,checkin:F2(b.da),appartamento:APT_LABEL[b.id]||b.id,ospiti:b.ospiti,notti:b.notti})})}catch{}}

// ---- Prenotazione unica per codice (per Guest Card): 'bk' (sito, ha email) prima, poi foglio (esterne, senza email) ----
const findBooking=async code=>{code=String(code||'').trim().toUpperCase();if(!code)return null;
 const bk=await getBk(),x=bk.find(k=>String(k.code).toUpperCase()===code);
 if(x)return{code:x.code,id:x.id,da:x.da,a:x.a,notti:x.notti,ospiti:x.ospiti,nome:x.nome,email:x.email||'',stato:x.stato,fonte:'sito'};
 const sheet=await sheetBookings(),s=sheet.find(k=>String(k.code).toUpperCase()===code);
 if(s)return{code:s.code,id:s.id,da:s.da,a:s.a,notti:s.notti,ospiti:s.ospiti,nome:'',email:'',stato:s.stato,fonte:'foglio'};
 return null};

// ---- Trentino Guest Card: doc ufficiale rev.11 (03/2026), innovazione@trentinomarketing.org ----
// baseUrl test: https://demoricettivo.hi-logic.it · produzione: https://ricettivo.guestcard.info
//
// Il doc (pag.2, 17-18) descrive DUE sistemi di credenziali indipendenti, mai intercambiabili:
//  - Basic Auth "gestionale" (pag.2): header Authorization: Basic base64(TGC_BASIC_USER:TGC_BASIC_PASS)
//    — comunicate via email da Trentino Marketing — PIÙ, come parametro separato in ogni chiamata,
//    Username/Password della STRUTTURA su ricettivo.guestcard.info (TGC_USERNAME/TGC_PASSWORD).
//  - OAuth (pag.17-18): un client_id/client_secret DEDICATI, "forniti per ogni PMS" — in demo è
//    sempre il valore fisso "PMSOauth_demo"; in produzione andrebbe richiesto esplicitamente a
//    Trentino Marketing e NON coincide con le credenziali Basic Auth sopra.
//
// STATO (25/09/2026): Paolo Maccagnan (Trentino Marketing) ha confermato via email che le credenziali
// inviate il 24/09 (username "PMS_Lacolumbera" + password) sono quelle definitive di produzione e che
// non c'è nessun'altra attivazione da fare sul loro sistema. Non è mai arrivato — né in quella email né
// prima — un client_id/client_secret OAuth realmente dedicato: solo lo username/password sopra, nel
// formato tipico della Basic Auth "gestionale". Coerentemente, i tentativi OAuth fatti in questi giorni
// (quella stessa coppia, e poi le credenziali struttura, messe in TGC_OAUTH_CLIENT_ID/SECRET) hanno
// sempre dato "Client non autorizzato": quel client OAuth dedicato semplicemente non esiste per questo
// account. Il percorso ATTIVO è quindi Basic Auth — è anche "l'opzione consigliata" dal doc (pag.5):
//  - Basic Auth (tgcBasicAuth, tgcCallBasic, emettiGuestCardTGC) è oggi agganciata a gc_tipologie,
//    gc_attributi e gc_issue.
//  - OAuth (gc_oauth_start → login struttura → gc_oauth_callback → tgcCall su /ws/Pms/...) resta nel
//    codice come riserva, pronta da riattivare se in futuro Trentino Marketing fornirà un client_id/
//    secret OAuth dedicato.
//
// SICUREZZA: senza TGC_BASE_URL il fallback qui sotto è l'ambiente di PRODUZIONE
// (ricettivo.guestcard.info, non demo) — imposta esplicitamente TGC_BASE_URL=https://demoricettivo.hi-logic.it per testare in demo.
const TGC_BASE=(process.env.TGC_BASE_URL||'https://ricettivo.guestcard.info').replace(/\/+$/,'');
// Le card demo e quelle di produzione sono salvate con chiavi diverse: una card di prova non blocca mai l'emissione reale per lo stesso codice.
const GCK=code=>(/demoricettivo|hi-logic/i.test(TGC_BASE)?'gc:demo:':'gc:')+code;
const tgcBasicAuth=()=>'Basic '+Buffer.from(process.env.TGC_BASIC_USER+':'+process.env.TGC_BASIC_PASS).toString('base64');
const ymd=s=>String(s).replace(/-/g,'');

// Chiamata generica Basic Auth verso /ws/SoftwareGestionali/...: aggiunge sempre l'header Authorization
// Basic (gestionale, TGC_BASIC_USER/PASS) + Username/Password della struttura (TGC_USERNAME/PASSWORD),
// come richiesto dal doc (pag.2) — per le GET in querystring, per le POST come campo form.
async function tgcCallBasic(path,{method='GET',form}={}){
 if(!process.env.TGC_BASIC_USER||!process.env.TGC_BASIC_PASS)
  throw new Error('Mancano TGC_BASIC_USER/TGC_BASIC_PASS su Vercel (credenziali gestionale inviate via email da Trentino Marketing)');
 if(!process.env.TGC_USERNAME||!process.env.TGC_PASSWORD)
  throw new Error('Mancano TGC_USERNAME/TGC_PASSWORD su Vercel (credenziali della struttura su ricettivo.guestcard.info)');
 const opt={method,headers:{Authorization:tgcBasicAuth()}};
 let url=TGC_BASE+'/ws/SoftwareGestionali/'+path;
 if(method==='GET'){
  const qs='username='+encodeURIComponent(process.env.TGC_USERNAME)+'&password='+encodeURIComponent(process.env.TGC_PASSWORD);
  url+=(path.includes('?')?'&':'?')+qs
 }else{
  const fd=new FormData();fd.set('Username',process.env.TGC_USERNAME);fd.set('Password',process.env.TGC_PASSWORD);
  for(const k in(form||{}))if(form[k]!=null)fd.set(k,String(form[k]));
  opt.body=fd
 }
 const r=await fetch(url,opt);
 const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j={raw:txt}}
 if(!r.ok||j.esito===false)throw new Error((j.motivo||[]).join(', ')||j.message||('HTTP '+r.status+' '+txt.slice(0,200)));
 return j}

// Emissione card: percorso ATTIVO (Basic Auth, vedi nota sopra).
async function emettiGuestCardTGC({dal,al,email,personeMax,codice}){
 const form={idTipologiaCard:process.env.TGC_CARD_TYPE_ID,dal:ymd(dal),al:ymd(al),Email:email,PersoneMax:String(personeMax)};
 if(process.env.TGC_ATTRIBUTO_ID)form.IdAttributo=process.env.TGC_ATTRIBUTO_ID;
 if(codice)form.ExtraSftAlbergatori=String(codice).slice(0,36);
 return tgcCallBasic('EmissioneEssenzialeCard.ashx',{method:'POST',form})}

// ---- OAuth Bearer Token: riserva, non agganciata a nessun endpoint (vedi nota sopra) ----
const tgcOauthBasic=()=>'Basic '+Buffer.from(process.env.TGC_OAUTH_CLIENT_ID+':'+process.env.TGC_OAUTH_CLIENT_SECRET).toString('base64');

// Scambia il "code" ricevuto dal redirect di login per Token + RefreshToken
async function tgcExchangeCode(code){
 const r=await fetch(TGC_BASE+'/ws/oauth/access_token_pms.ashx?code='+encodeURIComponent(code),{headers:{Authorization:tgcOauthBasic()}});
 const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j={raw:txt}}
 if(!r.ok||!j.Token)throw new Error(j.message||('HTTP '+r.status+' '+txt.slice(0,200)));
 return j}

// Rinnova un Token scaduto usando il RefreshToken salvato
async function tgcRefreshToken(refreshToken){
 const fd=new FormData();fd.set('refreshToken',refreshToken);
 const r=await fetch(TGC_BASE+'/ws/oauth/refresh_token.ashx',{method:'POST',headers:{Authorization:tgcOauthBasic()},body:fd});
 const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j={raw:txt}}
 if(!r.ok||!j.Token)throw new Error(j.message||('HTTP '+r.status+' '+txt.slice(0,200)));
 return j}

// Ritorna un Bearer Token valido, rinnovandolo se scaduto o vicino alla scadenza (margine 60s). Se non
// esiste ancora nessuna autorizzazione salvata, lancia un errore chiaro invece di un 401 muto.
async function tgcGetToken(){
 let t=await jg('tgc:oauth:token');
 if(!t||!t.RefreshToken)throw new Error('Guest Card non ancora autorizzata: vai in admin e clicca "Autorizza Trentino Guest Card"');
 if(!t.expiresAt||Date.parse(t.expiresAt)<Date.now()+6e4){
  const fresh=await tgcRefreshToken(t.RefreshToken);
  t={Token:fresh.Token,RefreshToken:fresh.RefreshToken,expiresAt:fresh.expiresAt};
  await kv('SET','tgc:oauth:token',JSON.stringify(t))}
 return t.Token}

// Chiamata generica autenticata Bearer verso /ws/Pms/..., con un retry (refresh + ripeti una volta sola)
// se il token risultasse comunque scaduto lato server (401) nonostante il controllo di tgcGetToken.
async function tgcCall(path,{method='GET',form}={}){
 const once=async tok=>{
  const opt={method,headers:{Authorization:'Bearer '+tok}};
  if(form){const fd=new FormData();for(const k in form)if(form[k]!=null)fd.set(k,String(form[k]));opt.body=fd}
  const r=await fetch(TGC_BASE+'/ws/Pms/'+path,opt);
  const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j={raw:txt}}
  return{r,j,txt}};
 let tok=await tgcGetToken(),{r,j,txt}=await once(tok);
 if(r.status===401){
  const t=await jg('tgc:oauth:token'),fresh=await tgcRefreshToken(t.RefreshToken);
  await kv('SET','tgc:oauth:token',JSON.stringify({Token:fresh.Token,RefreshToken:fresh.RefreshToken,expiresAt:fresh.expiresAt}));
  ({r,j,txt}=await once(fresh.Token))}
 if(!r.ok||j.esito===false)throw new Error((j.motivo||[]).join(', ')||j.message||('HTTP '+r.status+' '+txt.slice(0,200)));
 return j}

// ---- Prenotazioni: lettura con pulizia automatica delle "in_attesa" scadute (pagamento mai completato) ----
const PEND_MS=18e5; // 30 minuti
const getBk=async()=>{let bk=(await jg('bk'))||[];const now=Date.now(),n=bk.length;bk=bk.filter(x=>!(x.stato==='in_attesa'&&now-Date.parse(x.creato)>PEND_MS));if(bk.length!==n)await kv('SET','bk',JSON.stringify(bk));return bk};

const closedDays=(config,id)=>{if(!(config.closed&&config.closed[id]))return[];const o=[],s=new Date();for(let i=0;i<731;i++){o.push(iso(s));s.setUTCDate(s.getUTCDate()+1)}return o};
const busy=async(config,id,bk)=>{const sheet=await sheetBookings();return new Set([...(await evs(config,id)).flatMap(e=>days(e.da,e.a)),...bk.filter(x=>x.id===id&&x.stato!=='annullata').flatMap(x=>days(x.da,x.a)),...sheet.filter(x=>x.id===id).flatMap(x=>days(x.da,x.a)),...closedDays(config,id)])};
// Rete di sicurezza SOLO lato ospite (calendario sul sito + checkout): oltre questo orizzonte le date sono
// considerate chiuse per default, anche se il feed iCal non dice nulla (es. Booking non ancora aperto così avanti).
// Non tocca busy()/l'export a==='ical' verso Booking/Airbnb, per non segnalare loro come occupate date che
// vogliono invece tenere aperte più a lungo.
const HORIZON_DAYS=()=>+process.env.ORIZZONTE_MAX_GIORNI||365;
const beyondHorizon=()=>{const o=[],s=new Date();s.setUTCDate(s.getUTCDate()+HORIZON_DAYS());for(let i=0;i<731;i++){o.push(iso(s));s.setUTCDate(s.getUTCDate()+1)}return o};
const guestBusy=async(config,id,bk)=>new Set([...(await busy(config,id,bk)),...beyondHorizon()]);

// ---- Email (Gmail SMTP) ----
const sendMail=async(to,subject,html,opts={})=>{if(!process.env.GMAIL_USER||!process.env.GMAIL_APP_PASSWORD)return;
 try{const nodemailer=require('nodemailer'),t=nodemailer.createTransport({service:'gmail',auth:{user:process.env.GMAIL_USER,pass:process.env.GMAIL_APP_PASSWORD}});
  await t.sendMail({from:'"La Columbera" <'+process.env.GMAIL_USER+'>',to,subject,html,...(opts.text?{text:opts.text}:{}),...(opts.replyTo?{replyTo:opts.replyTo}:{})})}
 catch(e){console.error('sendMail:',e.message)}};

function icalFeed(id,set){const dd=[...set].sort();const ranges=[];for(const d of dd){const last=ranges[ranges.length-1];if(last&&addDays(last.end,1)===d)last.end=d;else ranges.push({start:d,end:d})}const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'').replace('Z','')+'Z';let out='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//La Columbera//Prenotazioni//IT\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:La Columbera '+id+'\r\n';for(const r of ranges){out+='BEGIN:VEVENT\r\nUID:'+r.start+'-'+r.end+'-'+id+'@lacolumbera\r\nDTSTAMP:'+stamp+'\r\nDTSTART;VALUE=DATE:'+r.start.replace(/-/g,'')+'\r\nDTEND;VALUE=DATE:'+addDays(r.end,1).replace(/-/g,'')+'\r\nSUMMARY:Occupato - La Columbera\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\n'}out+='END:VCALENDAR\r\n';return out}

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

const handler=async(req,res)=>{const a=req.query.a,b=req.body||{};res.setHeader('Cache-Control','no-store');
try{
if(a==='cfg')return res.json(await cfg(req));
if(a==='busy'){const config=await cfg(req);res.setHeader('Cache-Control','s-maxage=120');return res.json([...await guestBusy(config,String(req.query.id),await getBk())].sort())}
if(a==='ical'){const config=await cfg(req),id=String(req.query.id||'');if(!config.apts.find(x=>x.id===id))return res.status(404).send('not found');const set=await busy(config,id,await getBk());res.setHeader('Content-Type','text/calendar; charset=utf-8');res.setHeader('Cache-Control','s-maxage=1800');return res.send(icalFeed(id,set))}
if(a==='events')return res.json((await jg('events'))||[]);
if(a==='events_feed'){res.setHeader('Cache-Control','s-maxage=21600');return res.json(await feed())}
if(a==='checkout'){const config=await cfg(req),p=config.apts.find(x=>x.id===b.id),R=/^\d{4}-\d\d-\d\d$/;
 if(!p||!R.test(b.da)||!R.test(b.a)||b.a<=b.da||b.da<new Date().toISOString().slice(0,10)||!b.nome||!/.+@.+\..+/.test(b.email))return res.status(400).json({err:'Dati non validi'});
 if(config.closed&&config.closed[p.id])return res.status(409).json({err:'Appartamento non disponibile in questo periodo'});
 const g=days(b.da,b.a);if(g.length<p.min||g.length>60)return res.status(400).json({err:'Durata non valida (minimo '+p.min+' notti)'});
 const n=Math.min(Math.max(+b.ospiti||1,1),p.max),bk=await getBk(),occ=await guestBusy(config,p.id,bk);
 if(g.some(d=>occ.has(d)))return res.status(409).json({err:'Date non più disponibili'});
 if(!process.env.STRIPE_SECRET_KEY)return res.status(500).json({err:'Pagamento non configurato (manca STRIPE_SECRET_KEY su Vercel)'});
 const totale=g.reduce((s,d)=>s+np(p,d)+Math.max(0,n-p.inclusi)*p.extra,0);
 const r={code:c.randomBytes(3).toString('hex').toUpperCase(),id:p.id,da:b.da,a:b.a,notti:g.length,ospiti:n,nome:String(b.nome).slice(0,80),email:String(b.email).toLowerCase().slice(0,120),tel:String(b.tel||'').slice(0,30),totale,stato:'in_attesa',creato:new Date().toISOString()};
 const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY),site='https://'+req.headers.host;
 let session;
 try{session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],customer_email:r.email,client_reference_id:r.code,locale:'it',
  line_items:[{quantity:1,price_data:{currency:'eur',unit_amount:Math.round(totale*100),product_data:{name:APT_LABEL[p.id]||p.nome,description:F2(r.da)+' → '+F2(r.a)+' · '+n+' ospiti · '+g.length+' notti'}}}],
  metadata:{code:r.code,apt:p.id,da:r.da,a:r.a},
  success_url:site+'/'+p.id+'.html?pagamento=successo&code='+r.code,
  cancel_url:site+'/'+p.id+'.html?pagamento=annullato',
  expires_at:Math.floor(Date.now()/1000)+1810})}
 catch(e){return res.status(500).json({err:'Errore nella creazione del pagamento: '+e.message})}
 r.sessione=session.id;bk.push(r);await kv('SET','bk',JSON.stringify(bk));
 return res.json({code:r.code,url:session.url})}
if(a==='mie'){const code=String(b.code||'').trim().toUpperCase();if(!code)return res.status(400).json({err:'Inserisci il codice prenotazione'});
 const sheet=await sheetBookings(),found=sheet.filter(x=>String(x.code).toUpperCase()===code).map(x=>({code:x.code,id:x.id,da:x.da,a:x.a,ospiti:x.ospiti,notti:x.notti,stato:x.stato}));
 if(!found.length)return res.status(404).json({err:'Nessuna prenotazione trovata con questo codice'});
 return res.json(found)}
if(a==='gc_check'){const x=await findBooking(b.code);if(!x)return res.status(404).json({err:'Nessuna prenotazione trovata con questo codice'});
 if(x.stato==='annullata')return res.status(409).json({err:'Questa prenotazione risulta annullata'});
 if(x.stato==='in_attesa'||x.stato==='richiesta')return res.status(409).json({err:'Prenotazione non ancora confermata: riprova dopo la conferma (pagamento completato)'});
 const card=await jg(GCK(x.code));
 return res.json({booking:{id:x.id,da:x.da,a:x.a,notti:x.notti,ospiti:x.ospiti,nome:x.nome,needsEmail:!x.email},card:card||null})}
if(a==='gc_issue'){const x=await findBooking(b.code);if(!x)return res.status(404).json({err:'Nessuna prenotazione trovata con questo codice'});
 if(x.stato!=='confermata')return res.status(409).json({err:'La prenotazione non è (ancora) confermata'});
 const existing=await jg(GCK(x.code));if(existing)return res.json(existing); // idempotente: non ricrea una seconda card
 let email=x.email;
 if(!email){email=String(b.email||'').trim().toLowerCase();if(!/.+@.+\..+/.test(email))return res.status(400).json({err:'Email non valida'})}
 if(!process.env.TGC_CARD_TYPE_ID)
  return res.status(500).json({err:'Guest Card non configurata sul server (manca TGC_CARD_TYPE_ID su Vercel: chiama prima gc_tipologie per trovarlo)'});
 // Notare: date, notti e numero ospiti arrivano SOLO da "x" (la prenotazione verificata lato server),
 // mai dal corpo della richiesta del browser: è questo che impedisce all'ospite di alterarli.
 let tgc;
 try{tgc=await emettiGuestCardTGC({dal:x.da,al:x.a,email,personeMax:x.ospiti,codice:x.code})}
 catch(e){return res.status(502).json({err:'Errore dal sistema Trentino Guest Card: '+e.message})}
 // Con "Emissione Essenziale" esito:true torna subito il QrCode della card emessa (già valido).
 const card={gc_id:tgc.QrCode||'',stato:'richiesta_inviata',valid_from:x.da,valid_to:x.a,ospiti:x.ospiti,email,creato:new Date().toISOString(),raw:tgc};
 await kv('SET',GCK(x.code),JSON.stringify(card));
 return res.json(card)}
if(a==='gc_oauth_callback'){ // pubblico: redirect di ritorno da Trentino Marketing dopo il login della struttura
 const code=req.query.code,state=req.query.state;
 if(!code||!state)return res.status(400).send('Parametri mancanti (code/state)');
 const okState=await jg('tgc:oauth:state:'+state);
 if(!okState)return res.status(400).send('Sessione di autorizzazione scaduta o già usata: riprova dal pannello admin');
 await kv('DEL','tgc:oauth:state:'+state);
 try{
  const tok=await tgcExchangeCode(String(code));
  await kv('SET','tgc:oauth:token',JSON.stringify({Token:tok.Token,RefreshToken:tok.RefreshToken,expiresAt:tok.expiresAt}));
  return res.send('<html><body style="font-family:sans-serif;padding:40px"><h2>Trentino Guest Card autorizzata ✅</h2><p>Puoi chiudere questa pagina e tornare al pannello admin.</p></body></html>')
 }catch(e){return res.status(502).send('Errore nello scambio del token: '+e.message)}}
if(a==='login'){if(!S()||!process.env.ADMIN_USER)return res.status(500).json({err:'Mancano ADMIN_USER e ADMIN_PASSWORD su Vercel'});
 if(eq(b.u,process.env.ADMIN_USER)&eq(b.p,process.env.ADMIN_PASSWORD))return res.json({t:sign(String(Date.now()+288e5))});
 await new Promise(r=>setTimeout(r,1200));return res.status(401).json({err:'Credenziali errate'})}
if(!auth(req))return res.status(401).json({err:'Non autorizzato'});
if(a==='gc_oauth_start'){ // solo admin: riserva — oggi la Guest Card funziona via Basic Auth (vedi nota sopra), non serve per l'emissione
 if(!process.env.TGC_OAUTH_CLIENT_ID||!process.env.TGC_REDIRECT_URI)return res.status(500).json({err:'OAuth non configurato: mancano TGC_OAUTH_CLIENT_ID o TGC_REDIRECT_URI su Vercel. Non è un problema per l\'emissione della Guest Card, oggi attiva via Basic Auth: servirebbe solo un client_id/secret OAuth dedicato, mai fornito da Trentino Marketing per questo account.'});
 const state=c.randomBytes(16).toString('hex');
 await kv('SET','tgc:oauth:state:'+state,'1','EX','600');
 const qs=new URLSearchParams({client_id:process.env.TGC_OAUTH_CLIENT_ID,redirect_uri:process.env.TGC_REDIRECT_URI,state});
 return res.json({url:TGC_BASE+'/loginricettivo.aspx?'+qs})}
if(a==='gc_tipologie'){ // solo admin: elenco tipologie card, serve una volta per trovare il TGC_CARD_TYPE_ID da mettere su Vercel
 try{return res.json(await tgcCallBasic('TipologieCard.ashx'))}
 catch(e){return res.status(502).json({err:e.message})}}
if(a==='gc_attributi'){ // solo admin: verifica se una tipologia card richiede idAttributo
 const idTipologiaCard=req.query.idTipologiaCard||b.idTipologiaCard;
 if(!idTipologiaCard)return res.status(400).json({err:'Manca idTipologiaCard'});
 try{return res.json(await tgcCallBasic('AttributiCard.ashx?idTipologiaCard='+encodeURIComponent(idTipologiaCard)))}
 catch(e){return res.status(502).json({err:e.message})}}
if(a==='adm'){const config=await cfg(req),bk=await getBk(),ext=[];for(const p of config.apts)for(const e of await evs(config,p.id))ext.push({id:p.id,...e});const sheet=await sheetBookings();for(const s of sheet)ext.push({id:s.id,da:s.da,a:s.a,src:'Foglio'});return res.json({bk,ext})}
if(a==='stato'){const bk=await getBk(),x=bk.find(k=>k.code===b.code);if(x&&['richiesta','in_attesa','confermata','annullata'].includes(b.stato))x.stato=b.stato;await kv('SET','bk',JSON.stringify(bk));return res.json({ok:1})}
if(a==='book_del'){let bk=await getBk();const before=bk.length;bk=bk.filter(k=>String(k.code)!==String(b.code));await kv('SET','bk',JSON.stringify(bk));return res.json({ok:1,removed:before-bk.length})}
if(a==='event_add'){const list=(await jg('events'))||[];if(!b.title||!b.date)return res.status(400).json({err:'Titolo e data obbligatori'});
 list.push({id:c.randomBytes(4).toString('hex'),title:String(b.title).slice(0,200),date:String(b.date).slice(0,10),time:String(b.time||'').slice(0,20),location:String(b.location||'').slice(0,200),url:absUrl(b.url).slice(0,400),source:'La Columbera'});
 await kv('SET','events',JSON.stringify(list));return res.json({ok:1})}
if(a==='event_del'){let list=(await jg('events'))||[];list=list.filter(x=>x.id!==b.id);await kv('SET','events',JSON.stringify(list));return res.json({ok:1})}
if(a==='up'){const m=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(b.img||'');if(!m)return res.status(400).json({err:'Immagine non valida'});
 const o=await put('foto/'+String(b.id).replace(/\W/g,'')+'/f.jpg',Buffer.from(m[2],'base64'),{access:'public',contentType:m[1],addRandomSuffix:true});return res.json({url:o.url})}
if(a==='save'){const old=await cfg(req),n={chi:String(b.chi||'').slice(0,4000),ical:{},closed:{},apts:(b.apts||[]).map(p=>({id:String(p.id),nome:String(p.nome).slice(0,80),sotto:String(p.sotto||'').slice(0,120),testo:String(p.testo).slice(0,4000),base:+p.base||0,inclusi:+p.inclusi||1,extra:+p.extra||0,max:+p.max||1,min:+p.min||1,foto:(p.foto||[]).map(String),periodi:(p.periodi||[]).filter(q=>q.da&&q.a).map(q=>({da:q.da,a:q.a,prezzo:+q.prezzo||0})),prices:Object.fromEntries(Object.entries(p.prices||{}).filter(([k,v])=>v!=null&&v!=='').map(([k,v])=>[k,+v]))}))};
 for(const k of Object.keys(b.ical||{}))n.ical[k]=String(b.ical[k]||'');
 for(const k of Object.keys(b.closed||{}))n.closed[k]=!!b.closed[k];
 const keep=new Set(n.apts.flatMap(p=>p.foto));
 for(const p of old.apts)for(const u of p.foto)if(!keep.has(u)&&/blob\.vercel-storage\.com/.test(u))await del(u).catch(()=>{});
 await kv('SET','cfg',JSON.stringify(n));return res.json({ok:1})}
res.status(404).json({err:'?'})}catch(e){res.status(500).json({err:e.message})}};
module.exports=handler;
module.exports.kv=kv;module.exports.sheetAppend=sheetAppend;module.exports.getBk=getBk;module.exports.APT_LABEL=APT_LABEL;module.exports.F2=F2;module.exports.sendMail=sendMail;
