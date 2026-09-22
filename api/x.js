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

const closedDays=(config,id)=>{if(!(config.closed&&config.closed[id]))return[];const o=[],s=new Date();for(let i=0;i<731;i++){o.push(iso(s));s.setUTCDate(s.getUTCDate()+1)}return o};
const busy=async(config,id,bk)=>{const sheet=await sheetBookings();return new Set([...(await evs(config,id)).flatMap(e=>days(e.da,e.a)),...bk.filter(x=>x.id===id&&x.stato!=='annullata').flatMap(x=>days(x.da,x.a)),...sheet.filter(x=>x.id===id).flatMap(x=>days(x.da,x.a)),...closedDays(config,id)])};

function icalFeed(id,set){const dd=[...set].sort();const ranges=[];for(const d of dd){const last=ranges[ranges.length-1];if(last&&addDays(last.end,1)===d)last.end=d;else ranges.push({start:d,end:d})}const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'').replace('Z','')+'Z';let out='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//La Columbera//Prenotazioni//IT\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:La Columbera '+id+'\r\n';for(const r of ranges){out+='BEGIN:VEVENT\r\nUID:'+r.start+'-'+r.end+'-'+id+'@lacolumbera\r\nDTSTAMP:'+stamp+'\r\nDTSTART;VALUE=DATE:'+r.start.replace(/-/g,'')+'\r\nDTEND;VALUE=DATE:'+addDays(r.end,1).replace(/-/g,'')+'\r\nSUMMARY:Occupato - La Columbera\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\n'}out+='END:VCALENDAR\r\n';return out}

// ---- Eventi automatici ----
const curated=()=>{const t=new Date(),Y=t.getUTCFullYear();const base=[
 ['Mercatini di Natale di Trento',11,21,'Piazza Fiera & Piazza Cesare Battisti, Trento','https://www.visittrentino.info/it/eventi/mercatini-di-natale'],
 ['Trento Film Festival',4,24,'Vari luoghi, Trento','https://trentofestival.it'],
 ['Feste Vigiliane',6,20,'Centro storico, Trento','https://www.festevigiliane.it'],
 ["Festival dell'Economia di Trento",5,22,'Centro storico, Trento','https://www.festivaleconomia.it'],
 ['DiVinNosiola - Tempo di Vino Santo',3,28,'Valle dei Laghi, Trento','https://www.visittrentino.info/it/eventi'],
 ['Autunno Trentino - Sagre e sapori',10,4,'Trento e valli','https://www.visittrentino.info/it/eventi']];
 const iso2=d=>d.toISOString().slice(0,10),today=iso2(t);
 return base.map(([title,mo,day,location,url])=>{let d=new Date(Date.UTC(Y,mo-1,day));if(iso2(d)<today)d=new Date(Date.UTC(Y+1,mo-1,day));return{title,date:iso2(d),time:'',location,url,source:'VisitTrentino'}})};
const absUrl=u=>{u=String(u||'').trim();if(!u)return'';if(/^https?:\/\//i.test(u))return u;if(u[0]==='/')return'https://www.visittrentino.info'+u;return'https://'+u};
const feed=async()=>{
 try{
  const r=await fetch('https://www.visittrentino.info/it/eventi',{headers:{'User-Agent':'Mozilla/5.0 (compatible; LaColumberaBot/1.0)'}});
  if(r.ok){const html=await r.text(),out=[],re=/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;let m;
   while((m=re.exec(html))){let data;try{data=JSON.parse(m[1])}catch{continue}
    const arr=Array.isArray(data)?data:[data];
    for(const it of arr){if(!it||typeof it!=='object')continue;const type=it['@type'];
     if((type==='Event'||type==='Festival'||it.startDate)&&it.startDate){const sd=String(it.startDate).slice(0,10);if(!/^\d{4}-\d\d-\d\d$/.test(sd))continue;
      let loc='';if(it.location&&it.location.name)loc=it.location.name;else if(Array.isArray(it.location)&&it.location[0])loc=it.location[0].name||'';
      out.push({title:it.name||'Evento',date:sd,time:String(it.startDate).slice(11,16),location:loc||'Trentino',url:absUrl(it.url)||'https://www.visittrentino.info/it/eventi',source:'VisitTrentino'})}}}
   if(out.length)return out}
 }catch{}
 return curated();
};

module.exports=async(req,res)=>{const a=req.query.a,b=req.body||{};res.setHeader('Cache-Control','no-store');
try{
if(a==='cfg')return res.json(await cfg(req));
if(a==='busy'){const config=await cfg(req);res.setHeader('Cache-Control','s-maxage=120');return res.json([...await busy(config,String(req.query.id),(await jg('bk'))||[])].sort())}
if(a==='ical'){const config=await cfg(req),id=String(req.query.id||'');if(!config.apts.find(x=>x.id===id))return res.status(404).send('not found');const set=await busy(config,id,(await jg('bk'))||[]);res.setHeader('Content-Type','text/calendar; charset=utf-8');res.setHeader('Cache-Control','s-maxage=1800');return res.send(icalFeed(id,set))}
if(a==='events')return res.json((await jg('events'))||[]);
if(a==='events_feed'){res.setHeader('Cache-Control','s-maxage=21600');return res.json(await feed())}
if(a==='book'){const config=await cfg(req),p=config.apts.find(x=>x.id===b.id),R=/^\d{4}-\d\d-\d\d$/;
 if(!p||!R.test(b.da)||!R.test(b.a)||b.a<=b.da||b.da<new Date().toISOString().slice(0,10)||!b.nome||!/.+@.+\..+/.test(b.email))return res.status(400).json({err:'Dati non validi'});
 if(config.closed&&config.closed[p.id])return res.status(409).json({err:'Appartamento non disponibile in questo periodo'});
 const g=days(b.da,b.a);if(g.length<p.min||g.length>60)return res.status(400).json({err:'Durata non valida (minimo '+p.min+' notti)'});
 const n=Math.min(Math.max(+b.ospiti||1,1),p.max),bk=(await jg('bk'))||[],occ=await busy(config,p.id,bk);
 if(g.some(d=>occ.has(d)))return res.status(409).json({err:'Date non più disponibili'});
 const r={code:c.randomBytes(3).toString('hex').toUpperCase(),id:p.id,da:b.da,a:b.a,ospiti:n,nome:String(b.nome).slice(0,80),email:String(b.email).toLowerCase().slice(0,120),tel:String(b.tel||'').slice(0,30),totale:g.reduce((s,d)=>s+np(p,d)+Math.max(0,n-p.inclusi)*p.extra,0),stato:'richiesta',creato:new Date().toISOString()};
 bk.push(r);await kv('SET','bk',JSON.stringify(bk));await sheetAppend({code:r.code,da:r.da,id:p.id,ospiti:n,notti:g.length});return res.json(r)}
if(a==='mie'){const code=String(b.code||'').trim().toUpperCase();if(!code)return res.status(400).json({err:'Inserisci il codice prenotazione'});
 const sheet=await sheetBookings(),found=sheet.filter(x=>String(x.code).toUpperCase()===code).map(x=>({code:x.code,id:x.id,da:x.da,a:x.a,ospiti:x.ospiti,notti:x.notti,stato:x.stato}));
 if(!found.length)return res.status(404).json({err:'Nessuna prenotazione trovata con questo codice'});
 return res.json(found)}
if(a==='guestcard'){const code=String(b.code||'').trim().toUpperCase();const bk=(await jg('bk'))||[],sheet=await sheetBookings();
 const x=bk.find(k=>String(k.code).toUpperCase()===code)||sheet.find(k=>String(k.code).toUpperCase()===code);if(!x)return res.status(404).json({err:'Prenotazione non trovata'});
 return res.json({gc_id:'TGC-'+c.randomBytes(4).toString('hex').toUpperCase(),nome:String(b.nome||x.nome||'').slice(0,80),valid_from:x.da,valid_to:x.a,ospiti:+b.ospiti||x.ospiti||1})}
if(a==='login'){if(!S()||!process.env.ADMIN_USER)return res.status(500).json({err:'Mancano ADMIN_USER e ADMIN_PASSWORD su Vercel'});
 if(eq(b.u,process.env.ADMIN_USER)&eq(b.p,process.env.ADMIN_PASSWORD))return res.json({t:sign(String(Date.now()+288e5))});
 await new Promise(r=>setTimeout(r,1200));return res.status(401).json({err:'Credenziali errate'})}
if(!auth(req))return res.status(401).json({err:'Non autorizzato'});
if(a==='adm'){const config=await cfg(req),bk=(await jg('bk'))||[],ext=[];for(const p of config.apts)for(const e of await evs(config,p.id))ext.push({id:p.id,...e});const sheet=await sheetBookings();for(const s of sheet)ext.push({id:s.id,da:s.da,a:s.a,src:'Foglio'});return res.json({bk,ext})}
if(a==='stato'){const bk=(await jg('bk'))||[],x=bk.find(k=>k.code===b.code);if(x&&['richiesta','confermata','annullata'].includes(b.stato))x.stato=b.stato;await kv('SET','bk',JSON.stringify(bk));return res.json({ok:1})}
if(a==='book_del'){let bk=(await jg('bk'))||[];const before=bk.length;bk=bk.filter(k=>String(k.code)!==String(b.code));await kv('SET','bk',JSON.stringify(bk));return res.json({ok:1,removed:before-bk.length})}
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
