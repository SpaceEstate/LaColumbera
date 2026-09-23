// Webhook Stripe: conferma la prenotazione SOLO quando il pagamento è completato.
// Va registrato su Stripe (Sviluppatori → Webhook) puntando a https://<tuo-dominio>/api/stripe-webhook
// per l'evento "checkout.session.completed"; il "Signing secret" va in STRIPE_WEBHOOK_SECRET su Vercel.
const x=require('./x.js');
const buffer=req=>new Promise((res,rej)=>{const ch=[];req.on('data',d=>ch.push(d));req.on('end',()=>res(Buffer.concat(ch)));req.on('error',rej)});
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const OWNER_EMAIL=process.env.OWNER_EMAIL||'comper977@gmail.com';
const ownerHtml=b=>`<h2>Nuova prenotazione confermata</h2>
<p><b>Codice:</b> ${esc(b.code)}<br>
<b>Appartamento:</b> ${esc(x.APT_LABEL[b.id]||b.id)}<br>
<b>Check-in:</b> ${esc(x.F2(b.da))}<br>
<b>Check-out:</b> ${esc(x.F2(b.a))}<br>
<b>Notti:</b> ${esc(b.notti)}<br>
<b>Ospiti:</b> ${esc(b.ospiti)}<br>
<b>Prezzo pagato:</b> €${esc(b.totale)}</p>
<h3>Dati ospite</h3>
<p><b>Nome:</b> ${esc(b.nome)}<br>
<b>Email:</b> ${esc(b.email)}<br>
<b>Telefono:</b> ${esc(b.tel||'—')}</p>`;

const handler=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).end();
 const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY);
 let event;
 try{
  const buf=await buffer(req);
  event=stripe.webhooks.constructEvent(buf,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);
 }catch(e){return res.status(400).send('Webhook Error: '+e.message)}

 if(event.type==='checkout.session.completed'){
  const s=event.data.object,code=s.metadata&&s.metadata.code;
  if(code){
   const bk=await x.getBk(),b=bk.find(k=>k.code===code);
   if(b&&b.stato!=='confermata'){
    b.stato='confermata';b.pagamento=s.payment_intent||s.id;
    await x.kv('SET','bk',JSON.stringify(bk));
    await x.sheetAppend({code:b.code,da:b.da,id:b.id,ospiti:b.ospiti,notti:b.notti});
    await x.sendMail(OWNER_EMAIL,'Nuova prenotazione confermata · '+(x.APT_LABEL[b.id]||b.id)+' · '+b.code,ownerHtml(b));
    // TODO: mail di conferma per l'ospite (b.email) — contenuto da definire insieme
   }
  }
 }
 res.json({received:true});
};
module.exports=handler;
module.exports.config={api:{bodyParser:false}};
