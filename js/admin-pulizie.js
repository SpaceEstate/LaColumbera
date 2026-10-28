// La Columbera · Gestione → OPERATIVITÀ → Pulizie: nel periodo scelto, per ogni appartamento chi esce e chi entra giorno per giorno
// (ospiti, notti, come preparare i letti, una nota) e il testo pronto da copiare e mandare a chi fa le pulizie.
// Nel testo non ci sono nomi né contatti degli ospiti: a chi pulisce bastano giorni, orari, persone e letti (i nomi li vedi solo tu, qui).
// La scelta dei letti e la nota si salvano subito (api/x.js, azioni pul_info e pul_set). Si registra in window.LCAdmParts (vedi js/admin.js).
(window.LCAdmParts=window.LCAdmParts||[]).push(function(A){
'use strict';
const {$,esc,addDays,today,short,V}=A;
const LETTO={m:'letto matrimoniale',s:'letti singoli'};
const giorno=d=>new Date(d+'T00:00:00').toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
const breve=d=>new Date(d+'T00:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'});
const maiusc=s=>s.charAt(0).toUpperCase()+s.slice(1);
const chiave=(p,x)=>x.code||'cal:'+p.id+':'+x.da;      // prenotazione vista solo nei calendari iCal: appartamento + giorno di arrivo
const info=k=>(V.pul||{})[k]||{};
const persone=n=>n?n+(n===1?' ospite':' ospiti'):'ospiti da confermare';
const notti=x=>Math.max(1,Math.round((Date.parse(x.a)-Date.parse(x.da))/864e5));
const chi=x=>x.nome||(x.code?x.fonte+' · '+x.code:x.fonte+' (solo calendario)');      // solo per te, mai nel testo

// entrate e uscite dell'appartamento nel periodo, giorno per giorno (stesse prenotazioni di Oggi: sito, foglio, calendari, senza doppioni)
function movimenti(p,da,al){const g={},add=(d,k,x)=>{(g[d]=g[d]||{d,esce:[],entra:[]})[k].push(x)};
  (A.soggiorni?A.soggiorni():[]).filter(x=>x.id===p.id).forEach(x=>{if(x.a>=da&&x.a<=al)add(x.a,'esce',x);if(x.da>=da&&x.da<=al)add(x.da,'entra',x)});
  return Object.values(g).sort((x,y)=>x.d<y.d?-1:1)}
// il messaggio per chi pulisce
function testo(p,mov,da,al){const S=A.S,L=['PULIZIE '+short(p).toUpperCase(),'dal '+breve(da)+' al '+breve(al),''];
  if(!mov.length)L.push('Nessuna entrata e nessuna uscita in questo periodo.');
  for(const g of mov){
    L.push(maiusc(giorno(g.d))+(g.esce.length&&g.entra.length?' — cambio':''));
    g.esce.forEach(x=>L.push('• esce: '+persone(x.ospiti)+(S.checkoutOra?', entro le '+S.checkoutOra:'')));
    g.entra.forEach(x=>{const i=info(chiave(p,x)),n=notti(x);L.push('• entra: '+persone(x.ospiti)+', '+n+(n===1?' notte':' notti')+', '+(LETTO[i.letto]||'letti da confermare')+(S.checkinOra?', dalle '+S.checkinOra:'')+(i.nota?' — '+i.nota:''))});
    L.push('')}
  return L.join('\n').trim()}
function scheda(p,da,al){const mov=movimenti(p,da,al),S=A.S;let ne=0,nu=0;mov.forEach(g=>{nu+=g.esce.length;ne+=g.entra.length});
  const esce=x=>`<div class="pul-mov"><span class="pul-k esce">Esce</span><span class="pul-d">${esc(persone(x.ospiti))}${S.checkoutOra?' · entro le '+esc(S.checkoutOra):''}<small>${esc(chi(x))}</small></span></div>`;
  const entra=x=>{const k=chiave(p,x),i=info(k),n=notti(x);
    return `<div class="pul-mov"><span class="pul-k entra">Entra</span><span class="pul-d">${esc(persone(x.ospiti))} · ${n} ${n===1?'notte':'notti'}${S.checkinOra?' · dalle '+esc(S.checkinOra):''}<small>${esc(chi(x))}</small></span>
     <div class="pul-letto" role="group" aria-label="Come preparare i letti">${['m','s'].map(v=>`<button type="button" data-act="pulLetto" data-k="${esc(k)}" data-v="${v}" data-a="${esc(x.a)}" class="${i.letto===v?'on':''}" aria-pressed="${i.letto===v}" data-testid="admin-pul-letto-${esc(k)}-${v}">${v==='m'?'Matrimoniale':'Singoli'}</button>`).join('')}${i.letto?'':'<span class="pul-ask">da scegliere</span>'}</div>
     <input class="pul-nota" data-pk="${esc(k)}" data-a="${esc(x.a)}" data-id="${p.id}" value="${esc(i.nota||'')}" maxlength="200" placeholder="Nota per le pulizie (facoltativa): culla, letto aggiuntivo…" aria-label="Nota per le pulizie" data-testid="admin-pul-nota-${esc(k)}"></div>`};
  return `<div class="admin-card pul-card" data-testid="admin-pul-${p.id}"><div class="adm-head"><h2>Pulizie <span class="n">${esc(short(p))}</span></h2><span class="adm-sub">${nu} ${nu===1?'uscita':'uscite'} · ${ne} ${ne===1?'entrata':'entrate'}</span></div>
   ${mov.length?mov.map(g=>`<div class="pul-day"><h4 class="adm-h4">${esc(maiusc(giorno(g.d)))}${g.esce.length&&g.entra.length?' <span class="stato da_verificare">cambio</span>':''}</h4>${g.esce.map(esce).join('')}${g.entra.map(entra).join('')}</div>`).join(''):'<p class="book-note">Nessuna entrata e nessuna uscita in questo periodo.</p>'}
   <h4 class="adm-h4">Testo da mandare</h4><pre class="pul-txt" id="pul-txt-${p.id}" data-testid="admin-pul-txt-${p.id}">${esc(testo(p,mov,da,al))}</pre>
   <div class="adm-quick"><button type="button" class="btn btn-wine" data-act="pulCopy" data-id="${p.id}" data-testid="admin-pul-copy-${p.id}">Copia il testo</button>${navigator.share?`<button type="button" class="btn btn-line" data-act="pulShare" data-id="${p.id}">Condividi…</button>`:''}</div></div>`}
const repaint=()=>{const el=$('#pul-cards');if(el)el.innerHTML=A.S.apts.map(p=>scheda(p,V.pulDa,V.pulAl)).join('')};
// solo il testo di un appartamento (dopo una nota): i campi restano dove sono, anche se intanto tocchi un altro pulsante
const ritesto=id=>{const p=A.aptById(id),t=$('#pul-txt-'+id);if(p&&t)t.textContent=testo(p,movimenti(p,V.pulDa,V.pulAl),V.pulDa,V.pulAl)};

A.view.pulizie=()=>{if(!V.pulDa){V.pulDa=today;V.pulAl=addDays(today,13)}
  return `<div class="admin-card" data-testid="admin-pulizie"><h2>Pulizie</h2>
   <p class="book-note">Scegli il periodo: per ogni appartamento trovi chi esce e chi entra, con il numero di ospiti. Per ogni arrivo scegli come preparare i letti e, se serve, scrivi una nota (si salvano subito); poi copia il testo e mandalo a chi fa le pulizie. Nel testo non ci sono nomi né contatti degli ospiti.</p>
   <div class="pul-per"><div class="adm-inp"><span>Dal</span><input type="date" id="pul-da" value="${V.pulDa}" data-testid="admin-pul-da"></div><div class="adm-inp"><span>al</span><input type="date" id="pul-al" value="${V.pulAl}" data-testid="admin-pul-al"></div>
    <span class="pul-q">${[[7,'7 giorni'],[14,'14 giorni'],[31,'Un mese']].map(([n,l])=>`<button type="button" class="adm-chip" data-act="pulPer" data-n="${n}" data-testid="admin-pul-per-${n}">${l}</button>`).join('')}</span></div></div>
   <div id="pul-cards">${A.S.apts.map(p=>scheda(p,V.pulDa,V.pulAl)).join('')}</div>`};
A.after.pulizie=()=>{A.api('pul_info',{}).then(o=>{V.pul=o||{};repaint()}).catch(()=>{})};

// scelta dei letti e nota: si salvano subito; se il salvataggio non riesce si torna a com'era
async function salva(k,i,partenza,id){V.pul=V.pul||{};const prima=V.pul[k],ridisegna=()=>id?ritesto(id):repaint();
  if(i.letto||i.nota)V.pul[k]={letto:i.letto||'',nota:i.nota||'',a:partenza};else delete V.pul[k];ridisegna();
  try{await A.api('pul_set',{k,letto:i.letto||'',nota:i.nota||'',a:partenza})}
  catch(x){if(prima)V.pul[k]=prima;else delete V.pul[k];repaint();alert(x.message)}}
Object.assign(A.act,{
  pulPer:a=>{V.pulDa=today;V.pulAl=addDays(today,+a.dataset.n-1);$('#pul-da').value=V.pulDa;$('#pul-al').value=V.pulAl;repaint()},
  pulLetto:a=>{const k=a.dataset.k,i=Object.assign({},info(k));i.letto=i.letto===a.dataset.v?'':a.dataset.v;salva(k,i,a.dataset.a)},      // toccare di nuovo la scelta la toglie
  pulCopy:a=>{const t=$('#pul-txt-'+a.dataset.id);if(t)A.copy(t.textContent,a)},
  pulShare:a=>{const t=$('#pul-txt-'+a.dataset.id);if(t&&navigator.share)navigator.share({text:t.textContent}).catch(()=>{})}
});
A.onChange.push(el=>{
  if(el.id==='pul-da'||el.id==='pul-al'){let da=$('#pul-da').value,al=$('#pul-al').value;if(!da||!al)return true;
    // un «dal» dopo l'«al» sposta l'«al» due settimane più avanti; un «al» prima del «dal» porta lì anche il «dal»; al massimo tre mesi alla volta
    if(al<da){if(el.id==='pul-da')al=addDays(da,13);else da=al}
    if(al>addDays(da,92))al=addDays(da,92);
    V.pulDa=da;V.pulAl=al;$('#pul-da').value=da;$('#pul-al').value=al;repaint();return true}
  if(el.classList.contains('pul-nota')){const k=el.dataset.pk,i=Object.assign({},info(k));i.nota=el.value.replace(/\s+/g,' ').trim();salva(k,i,el.dataset.a,el.dataset.id);return true}
  return false});
});
