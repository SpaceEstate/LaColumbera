// Webhook Stripe: conferma la prenotazione SOLO quando il pagamento è completato.
// Va registrato su Stripe (Sviluppatori → Webhook) puntando a https://<tuo-dominio>/api/stripe-webhook
// per l'evento "checkout.session.completed"; il "Signing secret" va in STRIPE_WEBHOOK_SECRET su Vercel.
const x=require('./x.js');
const buffer=req=>new Promise((res,rej)=>{const ch=[];req.on('data',d=>ch.push(d));req.on('end',()=>res(Buffer.concat(ch)));req.on('error',rej)});
const {guestMail,ownerMail}=require('./_mail.js');
const REPLY_TO=process.env.REPLY_TO||'info@lacolumbera.it';
const OWNER_EMAIL=process.env.OWNER_EMAIL||'patrick.comper@yahoo.com';

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
    // Le mail non devono mai bloccare la conferma: sendMail gestisce già gli errori.
    const site=process.env.SITE_URL||'https://'+req.headers.host,om=ownerMail(b,site),jobs=[x.sendMail(OWNER_EMAIL,om.subject,om.html,{text:om.text,replyTo:b.email})];
    if(/.+@.+\..+/.test(b.email||'')){const gm=guestMail(b,site);jobs.push(x.sendMail(b.email,gm.subject,gm.html,{text:gm.text,replyTo:REPLY_TO}))}
    await Promise.all(jobs);
   }
  }
 }
 res.json({received:true});
};
module.exports=handler;
module.exports.config={api:{bodyParser:false}};
