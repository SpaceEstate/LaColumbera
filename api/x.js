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
const days=(da,a)=>{const o=[];for(let d=new Date(da);d<new Date(a);d.setUTCDate(d.getUTCDate()+1))o.push(d.toISOString().slice(0,10));return o};
const np=(p,d)=>{const x=(p.periodi||[]).find(q=>d>=q.da&&d<=q.a);return+(x?x.prezzo:p.base)};
const F=s=>s.replace(/(\d{4})(\d\d)(\d\d)/,'$1-$2-$3');
const evs=async id=>{const o=[];for(const u of(process.env['ICAL_'+id.toUpperCase()]||'').split(',').map(s=>s.trim()).filter(Boolean)){try{const t=await(await fetch(u)).text(),src=/booking/.test(u)?'Booking':/airbnb/.test(u)?'Airbnb':'Altro';for(const e of t.split('BEGIN:VEVENT').slice(1)){const a=/DTSTART[^:]*:(\d{8})/.exec(e),b=/DTEND[^:]*:(\d{8})/.exec(e);if(a&&b)o.push({da:F(a[1]),a:F(b[1]),src})}}catch{}}return o};
const busy=async(id,bk)=>new Set([...(await evs(id)).flatMap(e=>days(e.da,e.a)),...bk.filter(x=>x.id===id&&x.stato!=='annullata').flatMap(x=>days(x.da,x.a))]);
module.exports=async(req,res)=>{const a=req.query.a,b=req.body||{};res.setHeader('Cache-Control','no-store');
try{
if(a==='cfg')return res.json(await cfg(req));
if(a==='busy'){res.setHeader('Cache-Control','s-maxage=300');return res.json([...await busy(String(req.query.id),(await jg('bk'))||[])].sort())}
if(a==='book'){const p=(await cfg(req)).apts.find(x=>x.id===b.id),R=/^\d{4}-\d\d-\d\d$/;
 if(!p||!R.test(b.da)||!R.test(b.a)||b.a<=b.da||b.da<new Date().toISOString().slice(0,10)||!b.nome||!/.+@.+\..+/.test(b.email))return res.status(400).json({err:'Dati non validi'});
 const g=days(b.da,b.a);if(g.length<p.min||g.length>60)return res.status(400).json({err:'Durata non valida (minimo '+p.min+' notti)'});
 const n=Math.min(Math.max(+b.ospiti||1,1),p.max),bk=(await jg('bk'))||[],occ=await busy(p.id,bk);
 if(g.some(d=>occ.has(d)))return res.status(409).json({err:'Date non più disponibili'});
 const r={code:c.randomBytes(3).toString('hex').toUpperCase(),id:p.id,da:b.da,a:b.a,ospiti:n,nome:String(b.nome).slice(0,80),email:String(b.email).toLowerCase().slice(0,120),tel:String(b.tel||'').slice(0,30),totale:g.reduce((s,d)=>s+np(p,d)+Math.max(0,n-p.inclusi)*p.extra,0),stato:'richiesta',creato:new Date().toISOString()};
 bk.push(r);await kv('SET','bk',JSON.stringify(bk));return res.json(r)}
if(a==='mie'){const bk=(await jg('bk'))||[],e=String(b.email||'').toLowerCase();
 if(!bk.some(x=>x.email===e&&eq(x.code,String(b.code||'').toUpperCase())))return res.status(404).json({err:'Nessuna prenotazione trovata con questi dati'});
 return res.json(bk.filter(x=>x.email===e))}
if(a==='login'){if(!S()||!process.env.ADMIN_USER)return res.status(500).json({err:'Mancano ADMIN_USER e ADMIN_PASSWORD su Vercel'});
 if(eq(b.u,process.env.ADMIN_USER)&eq(b.p,process.env.ADMIN_PASSWORD))return res.json({t:sign(String(Date.now()+288e5))});
 await new Promise(r=>setTimeout(r,1200));return res.status(401).json({err:'Credenziali errate'})}
if(!auth(req))return res.status(401).json({err:'Non autorizzato'});
if(a==='adm'){const bk=(await jg('bk'))||[],ext=[];for(const p of(await cfg(req)).apts)for(const e of await evs(p.id))ext.push({id:p.id,...e});return res.json({bk,ext})}
if(a==='stato'){const bk=(await jg('bk'))||[],x=bk.find(k=>k.code===b.code);if(x&&['richiesta','confermata','annullata'].includes(b.stato))x.stato=b.stato;await kv('SET','bk',JSON.stringify(bk));return res.json({ok:1})}
if(a==='up'){const m=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(b.img||'');if(!m)return res.status(400).json({err:'Immagine non valida'});
 const o=await put('foto/'+String(b.id).replace(/\W/g,'')+'/f.jpg',Buffer.from(m[2],'base64'),{access:'public',contentType:m[1],addRandomSuffix:true});return res.json({url:o.url})}
if(a==='save'){const old=await cfg(req),n={chi:String(b.chi||'').slice(0,4000),apts:(b.apts||[]).map(p=>({id:String(p.id),nome:String(p.nome).slice(0,80),sotto:String(p.sotto||'').slice(0,120),testo:String(p.testo).slice(0,4000),base:+p.base||0,inclusi:+p.inclusi||1,extra:+p.extra||0,max:+p.max||1,min:+p.min||1,foto:(p.foto||[]).map(String),periodi:(p.periodi||[]).filter(q=>q.da&&q.a).map(q=>({da:q.da,a:q.a,prezzo:+q.prezzo||0}))}))},keep=new Set(n.apts.flatMap(p=>p.foto));
 for(const p of old.apts)for(const u of p.foto)if(!keep.has(u)&&/blob\.vercel-storage\.com/.test(u))await del(u).catch(()=>{});
 await kv('SET','cfg',JSON.stringify(n));return res.json({ok:1})}
res.status(404).json({err:'?'})}catch(e){res.status(500).json({err:e.message})}};
