// La Columbera · Gestione → SITO: Appartamenti (testi, foto, area ospiti), Home (testi e foto della homepage), Eventi, Luoghi e convenzioni,
// Regole di prenotazione, Sistema (sincronizzazione, pagamenti ed email, calendari iCal).
// Si registra in window.LCAdmParts: stato e utilità comuni arrivano da js/admin.js (oggetto A).
(window.LCAdmParts=window.LCAdmParts||[]).push(function(A){
'use strict';
const {$,$$,esc,fmtD,fmtW,addDays,today,short,V}=A;
const S=()=>A.S;

// ---------- Appartamenti: testi, area ospiti, foto ----------
function vApp(r){const apts=S().apts,p=A.aptById(r.sub)||A.aptById(V.appApt)||apts[0],i=A.idx(p.id),sub=r.arg==='foto'?'foto':'testi';V.appApt=p.id;
  return `<div class="adm-tabs">${apts.map(q=>`<a href="#appartamenti/${q.id}${sub==='foto'?'/foto':''}" class="${q.id===p.id?'on':''}">${esc(short(q))}</a>`).join('')}</div>
  <div class="admin-card" data-testid="admin-apt-${p.id}"><div class="adm-head"><h2>Appartamento <span class="n">${esc(short(p))}</span></h2><a class="btn btn-line" href="${p.id}.html" target="_blank" rel="noopener">Anteprima ↗</a></div>
  <div class="adm-tabs"><a href="#appartamenti/${p.id}" class="${sub==='testi'?'on':''}">Testi</a><a href="#appartamenti/${p.id}/foto" class="${sub==='foto'?'on':''}">Foto</a></div>${sub==='foto'?sFoto(p,i):sTesti(p,i)}</div>`}
const sTesti=(p,i)=>`<div class="field"><label>Nome</label><input data-b="a:${i}:nome" value="${esc(p.nome)}"></div>
  <div class="field"><label>Sottotitolo</label><input data-b="a:${i}:sotto" value="${esc(p.sotto)}"></div>
  <div class="field"><label>Descrizione</label><textarea rows="10" data-b="a:${i}:testo">${esc(p.testo)}</textarea></div>
  <div class="fields-grid"><div class="field"><label>Ospiti massimi</label><input type="number" min="1" data-b="a:${i}:max" value="${p.max}"></div></div>
  <h3>Codici dell'alloggio</h3>
  <p class="book-note">CIN e CIPAT compaiono sotto la descrizione, nella pagina dell'appartamento e nella scheda in home. Un campo lasciato vuoto non compare. Se il CIPAT è vuoto vale quello della struttura (variabile ISTAT_CIPAT su Vercel), se impostato.</p>
  <div class="fields-grid"><div class="field"><label>CIN</label><input data-b="a:${i}:cin" value="${esc(p.cin)}" autocomplete="off" data-testid="admin-cin-${p.id}"></div>
  <div class="field"><label>CIPAT</label><input data-b="a:${i}:cipat" value="${esc(p.cipat)}" autocomplete="off" data-testid="admin-cipat-${p.id}"></div></div>
  <h3>Approfondimento</h3>
  <p class="book-note">Testo che compare sotto la descrizione. Scrivi «## Titolo» per aprire una sezione e lascia una riga vuota tra un paragrafo e l'altro.</p>
  <div class="field"><textarea rows="16" data-b="a:${i}:dettagli" data-testid="admin-dettagli-${p.id}">${esc(p.dettagli)}</textarea></div>
  <h3>Servizi</h3>
  <p class="book-note">L'elenco che si apre con «Mostra tutti i servizi». Scrivi «## Gruppo» per aprire un gruppo; ogni servizio è una riga che inizia con «- ». I primi 8 compaiono anche nella pagina.</p>
  <div class="field"><textarea rows="16" data-b="a:${i}:servizi" data-testid="admin-servizi-${p.id}">${esc(p.servizi)}</textarea></div>
  ${sOspiti(p,i)}`;
// Area ospiti: testi che vede solo chi entra con il codice di una prenotazione di questo appartamento (mai sulla pagina pubblica)
const sOspiti=(p,i)=>`<h3>Area ospiti</h3>
  <p class="book-note">Questi testi li vede solo l'ospite che entra nell'area clienti con il codice di una prenotazione di ${esc(short(p))}: non compaiono sul sito pubblico. Scrivi «## Titolo» per aprire una scheda (es. «## Regole della casa», «## Raccolta differenziata», «## Prima di partire»).</p>
  <div class="field"><label>Informazioni per l'ospite</label><textarea rows="10" data-b="a:${i}:infoOspiti" data-testid="admin-info-ospiti-${p.id}" placeholder="## Regole della casa&#10;- …">${esc(p.infoOspiti)}</textarea></div>
  <div class="field"><label>Wi-Fi e informazioni riservate</label><textarea rows="4" data-b="a:${i}:infoRiservate" data-testid="admin-info-riservate-${p.id}" placeholder="Rete: …&#10;Password: …">${esc(p.infoRiservate)}</textarea></div>
  <p class="book-note">Le informazioni riservate compaiono solo da ${S().infoGiorni} ${S().infoGiorni===1?'giorno':'giorni'} prima dell'arrivo fino al giorno della partenza (si cambia in <a href="#regole">Sito → Regole di prenotazione</a>). Non scrivere qui i codici della cassetta delle chiavi: per entrare nell'area basta il codice di prenotazione; i codici della cassetta li manda il check-in online, dopo la registrazione degli ospiti.</p>`;
const sFoto=(p,i)=>`<p class="book-note">Trascina le foto per cambiare l'ordine oppure usa le frecce. La <b>prima</b> è la copertina (★ per usarne un'altra). Le foto vengono ridimensionate automaticamente.</p>
  <div class="pm-grid" id="pm-${i}"></div>
  <div class="upload-row"><label class="upload-btn">+ Aggiungi foto<input type="file" accept="image/*" multiple class="up" data-i="${i}"></label><span class="admin-msg" id="om${i}"></span></div>`;
function phRender(i){const p=S().apts[i],el=$('#pm-'+i);if(!el)return;
  el.innerHTML=p.foto.length?p.foto.map((u,j)=>`<div class="pm-item${j===0?' cover':''}" draggable="true" data-i="${i}" data-j="${j}" data-testid="pm-item-${i}-${j}"><img src="${esc(u)}" alt=""><span class="pm-num">${j+1}</span>${j===0?'<span class="pm-cover-badge">Copertina</span>':''}<div class="pm-tools"><button type="button" data-act="phL" data-i="${i}" data-j="${j}" title="Sposta a sinistra">‹</button><button type="button" data-act="phR" data-i="${i}" data-j="${j}" title="Sposta a destra">›</button>${j?`<button type="button" data-act="phC" data-i="${i}" data-j="${j}" title="Usa come copertina">★</button>`:''}<button type="button" data-act="phD" data-i="${i}" data-j="${j}" title="Rimuovi">✕</button></div></div>`).join(''):'<p class="book-note">Nessuna foto: aggiungine qualcuna.</p>'}
const movePh=(i,from,to)=>{const f=S().apts[i].foto;if(to<0||to>=f.length||from===to)return;const[x]=f.splice(from,1);f.splice(to,0,x);A.markDirty();phRender(i)};
const resize=f=>new Promise((res,rej)=>{const im=new Image;im.onload=()=>{const k=Math.min(1,1600/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=im.width*k;cv.height=im.height*k;cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);res(cv.toDataURL('image/jpeg',.82))};im.onerror=()=>rej(Error('Immagine non leggibile'));im.src=URL.createObjectURL(f)});
A.view.appartamenti=vApp;
A.after.appartamenti=r=>{if(r.arg==='foto')phRender(A.idx(V.appApt))};

// ---------- Home ----------
// Tutti i testi e le foto di index.html, sezione per sezione (campi e lunghezze in data/home.json). Il testo e la foto di partenza sono quelli
// scritti nella pagina: la Gestione li legge da index.html, così non esiste una seconda copia da tenere allineata. Nelle impostazioni (S.home)
// vanno solo i campi cambiati; svuotare un campo o riscrivere il testo di partenza lo riporta com'era. Nome, sottotitolo e ospiti degli
// appartamenti restano in Appartamenti → Testi (una sola fonte). Il vecchio testo «Chi siamo» (S.chi) non compariva sul sito: resta salvato com'è.
const HOME={campi:null,def:null,err:'',p:null};
const hid=k=>'hk-'+k.replace(/\W/g,'-');
const HS=()=>{const h=S().home;return h&&typeof h==='object'&&!Array.isArray(h)?h:(S().home={})};
const hv=k=>{const v=HS()[k];return typeof v==='string'&&v.trim()?v:null};      // il valore cambiato, oppure null (= quello di partenza)
// testo di partenza di un elemento della pagina: i segnaposto (data-ph) diventano {nome}, {max}, {email}, {telefono}
const hser=el=>[...el.childNodes].map(n=>n.nodeType===3?n.nodeValue:n.nodeType===1?(n.dataset.ph?'{'+n.dataset.ph+'}':hser(n)):'').join('');
function homeDefaults(sezioni,html){const doc=new DOMParser().parseFromString(html,'text/html'),q=s=>doc.querySelector(s),d={};
  for(const f of sezioni.flatMap(s=>s.campi)){const a='"'+f.k+'"';
    if(f.tipo==='foto'){const im=q('img[data-home-img='+a+']');d[f.k]=im?im.getAttribute('src')||'':'';continue}
    const el=q('[data-home='+a+']'),im=el?null:q('img[data-home-alt='+a+']');
    d[f.k]=(el?hser(el):im?im.getAttribute('alt')||'':'').replace(/[ \t\r\n\f]+/g,' ').trim()}
  return d}
const homeLoad=()=>HOME.p||(HOME.p=Promise.all([fetch('data/home.json').then(r=>{if(!r.ok)throw Error();return r.json()}),fetch('index.html').then(r=>{if(!r.ok)throw Error();return r.text()})])
  .then(([j,html])=>{HOME.campi=j.sezioni;HOME.def=homeDefaults(j.sezioni,html);HOME.err=''})
  .catch(()=>{HOME.err='Non riesco a leggere i testi e le foto della home: controlla la connessione e riprova.';HOME.p=null}));
const homeRender=()=>{const y=window.scrollY;A.body();window.scrollTo(0,y)};
const PH={nome:'{nome} = il nome dell\'appartamento',max:'{max} = gli ospiti massimi dell\'appartamento',email:'{email} = il collegamento a lacolumbera@gmail.com',telefono:'{telefono} = il collegamento al numero di telefono'};
function homeCampo(f,vuoto){const v=hv(f.k),val=v!=null?v:vuoto?'':HOME.def[f.k]||'',id=hid(f.k),max=+f.max||200,on=v!=null;
  const nota=[(f.ph||[]).map(x=>PH[x]).filter(Boolean).join(' · '),f.nota].filter(Boolean).join(' ');
  return `<div class="field home-f${on?' is-custom':''}"><label for="${id}">${esc(f.l)} <small class="home-badge"${on?'':' hidden'}>· cambiato</small></label>
   ${+f.righe?`<textarea id="${id}" rows="${+f.righe}" maxlength="${max}" data-hk="${esc(f.k)}" data-testid="admin-home-${esc(f.k)}">${esc(val)}</textarea>`
     :`<input id="${id}" maxlength="${max}" data-hk="${esc(f.k)}" value="${esc(val)}"${vuoto&&!on?' placeholder="Descrivi la nuova foto"':''} data-testid="admin-home-${esc(f.k)}">`}
   ${nota?`<small class="home-hint">${esc(nota)}</small>`:''}
   <button type="button" class="link-btn home-reset" data-act="homeReset" data-k="${esc(f.k)}"${on?'':' hidden'} data-testid="admin-home-reset-${esc(f.k)}">Ripristina il testo di partenza</button></div>`}
function homeFoto(f,alt){const u=hv(f.k),src=u||HOME.def[f.k]||'',id=hid(f.k),senzaAlt=u&&alt&&hv(alt.k)==null;
  return `<div class="dl-body home-foto" data-testid="admin-home-foto-${esc(f.k)}"><div class="dl-foto">${src?`<img src="${esc(src)}" alt="" data-testid="admin-home-preview-${esc(f.k)}">`:''}<span class="dl-ph">Nessuna foto</span>
    <label class="upload-btn">Sostituisci la foto<input type="file" accept="image/*" class="home-up" data-k="${esc(f.k)}" data-testid="admin-home-up-${esc(f.k)}"></label>
    ${u?`<button type="button" class="stato-select" data-act="homeReset" data-k="${esc(f.k)}" data-testid="admin-home-reset-${esc(f.k)}">Ripristina la foto di partenza</button>`:''}
    <small id="${id}-msg" role="status">${u?'Foto caricata dalla Gestione.':'Foto di partenza del sito.'} Le foto vengono ridimensionate automaticamente.</small></div>
   <div><p class="adm-h4">${esc(f.l)}</p>${alt?homeCampo(alt,u&&senzaAlt):''}${senzaAlt?'<p class="form-err" data-testid="admin-home-alt-warn-'+esc(f.k)+'">Scrivi la descrizione della nuova foto: finché manca, sul sito la foto resta senza descrizione per chi usa un lettore di schermo.</p>':''}</div></div>`}
const homeSez=s=>`<details class="admin-card home-sez" open data-testid="admin-home-sez-${esc(s.id)}"><summary><h3>${esc(s.titolo)}</h3></summary>
  ${s.campi.filter(f=>!f.di).map(f=>f.tipo==='foto'?homeFoto(f,s.campi.find(x=>x.k===f.alt)):homeCampo(f)).join('')}</details>`;
const homeConta=()=>{const n=Object.keys(HS()).filter(k=>hv(k)!=null).length;
  return n?`Campi cambiati: <b>${n}</b>. <button type="button" class="link-btn" data-act="homeResetAll" data-testid="admin-home-reset-all">Ripristina tutta la home</button>`:'Nessun campo cambiato: la home mostra i testi e le foto di partenza.'};
function vHome(){
  if(!HOME.def)return `<div class="admin-card" data-testid="admin-home"><h2>Home</h2><p class="book-note" data-testid="admin-home-wait">${esc(HOME.err||'Carico i testi e le foto della home…')}</p>${HOME.err?'<button type="button" class="btn btn-line" data-act="homeRetry">Riprova</button>':''}</div>`;
  const chi=String(S().chi||'').trim();
  return `<div class="admin-card" data-testid="admin-home"><div class="adm-head"><h2>Home</h2><a class="btn btn-line" href="index.html" target="_blank" rel="noopener">Vedi la home ↗</a></div>
   <p class="book-note">Tutti i testi e le foto della home, sezione per sezione. Ogni campo parte dal testo che si vede adesso sul sito: cambialo e premi «Salva modifiche». «Ripristina» riporta il testo o la foto di partenza. Collegamenti e pulsanti portano sempre dove devono: qui si cambia solo il loro testo. Nome, sottotitolo e numero massimo di ospiti degli appartamenti si cambiano in <a href="#appartamenti">Appartamenti → Testi</a> e valgono anche per la home.</p>
   <p class="book-note" data-testid="admin-home-count">${homeConta()}</p>
   ${chi?`<details class="home-chi" data-testid="admin-home-chi"><summary>Testo «Chi siamo» salvato in passato</summary><p class="book-note">Questo testo non compariva sul sito e resta salvato com'è. Se ti serve, copialo nel campo che preferisci.</p><p>${esc(chi)}</p></details>`:''}</div>
   ${HOME.campi.map(homeSez).join('')}`}
A.view.home=vHome;
A.after.home=()=>{if(!HOME.def&&!HOME.err)homeLoad().then(()=>{if(A.route().s==='home')homeRender()})};
A.onInput.push(el=>{if(!el.dataset.hk)return false;const k=el.dataset.hk,v=el.value,h=HS(),d=String(HOME.def&&HOME.def[k]||'');
  if(!v.trim()||v.trim()===d.trim())delete h[k];else h[k]=v;
  const on=hv(k)!=null,box=el.closest('.home-f');if(box){box.classList.toggle('is-custom',on);box.querySelectorAll('.home-badge,.home-reset').forEach(x=>{x.hidden=!on})}
  const warn=el.closest('.home-foto')&&el.closest('.home-foto').querySelector('[data-testid^="admin-home-alt-warn-"]');if(warn)warn.hidden=on;      // descrizione della foto nuova scritta: l'avviso sparisce
  const cnt=$('[data-testid=admin-home-count]');if(cnt)cnt.innerHTML=homeConta();
  A.markDirty();return true});
// nuova foto: stesso caricamento delle altre foto della Gestione (ridimensionata qui, salvata su Vercel Blob da api/x?a=up); la foto di prima,
// se nessun'altra sezione la usa, il server la cancella solo dopo un salvataggio riuscito. Va registrato prima del gestore «change» qui sotto.
A.onChange.push(el=>{if(!el.classList||!el.classList.contains('home-up'))return false;const f=el.files&&el.files[0];if(!f)return true;
  const k=el.dataset.k,box=el.closest('.dl-foto'),msg=$('#'+hid(k)+'-msg');if(box)box.classList.add('is-loading');if(msg)msg.textContent='Carico la foto…';
  resize(f).then(img=>A.api('up',{id:'home',img})).then(r=>{HS()[k]=r.url;A.markDirty();homeRender();const m=$('#'+hid(k)+'-msg');if(m)m.textContent='Foto caricata: scrivi la descrizione e ricordati di salvare.'})
    .catch(x=>{if(box)box.classList.remove('is-loading');if(msg)msg.textContent=(x&&x.message)||'Foto non caricata: riprova.'});
  el.value='';return true});
Object.assign(A.act,{
  homeReset:a=>{const k=a.dataset.k,f=(HOME.campi||[]).flatMap(s=>s.campi).find(x=>x.k===k);delete HS()[k];if(f&&f.alt)delete HS()[f.alt];A.markDirty();homeRender()},      // con la foto torna anche la sua descrizione
  homeResetAll:()=>{if(!confirm('Riportare tutti i testi e le foto della home a quelli di partenza? Appartamenti, prezzi, calendari e le altre impostazioni non cambiano.'))return;S().home={};A.markDirty();homeRender()},
  homeRetry:()=>{HOME.err='';A.body()}});

// ---------- Eventi (si salvano subito) ----------
A.view.eventi=()=>{const EV=A.EV;return `<div class="admin-card" data-testid="admin-events"><h2>Eventi a Trento</h2><p class="book-note">Gli eventi principali sono estratti automaticamente. Qui puoi aggiungere eventi speciali: compaiono subito nella pagina «Eventi» del sito.</p>
  <form id="evform" class="ev-form"><div class="field" style="margin:0"><label>Titolo</label><input name="title" required data-testid="ev-title"></div><div class="field" style="margin:0"><label>Data</label><input name="date" type="date" required data-testid="ev-date"></div><div class="field" style="margin:0"><label>Ora</label><input name="time" placeholder="21:00" data-testid="ev-time"></div><div class="field" style="margin:0"><label>Luogo</label><input name="location" data-testid="ev-loc"></div><div class="field" style="margin:0"><label>Link (facoltativo)</label><input name="url" placeholder="https://" data-testid="ev-url"></div><button class="btn btn-wine" data-testid="ev-add">+ Aggiungi</button></form>
  <div class="table-wrap tw-stack" style="margin-top:16px"><table class="data stack" data-testid="ev-table"><thead><tr><th>Titolo</th><th>Data</th><th>Ora</th><th>Luogo</th><th></th></tr></thead><tbody>${EV.length?EV.map(x=>`<tr><td data-label="Titolo"><b>${esc(x.title)}</b></td><td data-label="Data">${esc(x.date)}</td><td data-label="Ora">${esc(x.time||'')}</td><td data-label="Luogo">${esc(x.location||'')}</td><td class="td-azioni"><button type="button" class="stato-select" data-act="evDel" data-id="${esc(x.id)}">Elimina</button></td></tr>`).join(''):'<tr><td colspan="5" class="td-empty">Nessun evento manuale.</td></tr>'}</tbody></table></div></div>`};

// ---------- Luoghi e convenzioni ----------
// Finché non li modifichi valgono quelli di js/dintorni.js (window.LCDintorni, caricato anche qui): alla prima modifica la Gestione ne fa una copia
// nelle impostazioni (S.luoghi, S.convenzioni), che si salva con «Salva modifiche». «Ripristina» la toglie e il sito torna a quelli di partenza.
const DEFD=()=>window.LCDintorni||{luoghi:[],convenzioni:[]};
const clone=x=>JSON.parse(JSON.stringify(x||[]));
const elenco=k=>Array.isArray(S()[k])?S()[k]:(DEFD()[k]||[]);
const mio=k=>{if(!Array.isArray(S()[k]))S()[k]=clone(DEFD()[k]);return S()[k]};      // copia alla prima modifica
const RE_LINK=/^(https?:\/\/[^\s"'<>]{3,}|[a-z0-9][\w-]*\.html(#[\w-]+)?)$/i;
const DL={
  luoghi:{tit:'Luoghi di interesse',pag:'dintorni.html',voce:'un luogo',foto:'local',nome:x=>x.t,
    nuovo:()=>({id:'',t:'',meta:['',''],d:'',alt:'',link:'',lt:'',local:''}),
    campi:[['t','Titolo',''],['meta0','Distanza','es. 20 min in auto'],['meta1','In breve','es. sentieri · sci · panorami'],['d','Descrizione','',1],['link','Link','https://… oppure una pagina del sito, es. eventi.html'],['lt','Testo del link','es. Sito ufficiale']]},
  convenzioni:{tit:'Convenzioni',pag:'convenzioni.html',voce:'una convenzione',foto:'foto',nome:x=>x.nome,
    nuovo:()=>({id:'',nome:'',cat:'',zona:'',badge:'',estate:false,sito:'',maps:'',d:'',foto:''}),
    campi:[['nome','Nome',''],['cat','Tipo','es. Pizzeria · Cucina'],['zona','Zona','es. Ravina'],['badge','Etichetta sulla foto','es. Convenzionato (vuoto = nessuna)'],['d','Descrizione','',1],['sito','Sito ufficiale','https://… (vuoto = la scheda apre Google Maps)'],['maps','Ricerca su Google Maps','es. Pizzeria Da Mimmo, Ravina, Trento']]}};
const dlVal=(x,f)=>f==='meta0'?(x.meta||[])[0]:f==='meta1'?(x.meta||[])[1]:x[f];
function dlItem(k,x,j,n){const c=DL[k],foto=x[c.foto]||(k==='convenzioni'&&x.id?'img/convenzioni/'+x.id+'.jpg':'');
  return `<div class="dl-item" data-testid="admin-dl-${k}-${j}"><div class="dl-top"><b>${j+1}. ${esc(c.nome(x)||'(senza nome)')}</b><span class="dl-tools"><button type="button" class="stato-select" data-act="dlMove" data-k="${k}" data-j="${j}" data-d="-1" ${j?'':'disabled'} aria-label="Sposta su">↑</button><button type="button" class="stato-select" data-act="dlMove" data-k="${k}" data-j="${j}" data-d="1" ${j<n-1?'':'disabled'} aria-label="Sposta giù">↓</button><button type="button" class="stato-select btn-del-book" data-act="dlDel" data-k="${k}" data-j="${j}" aria-label="Elimina" data-testid="admin-dl-del-${k}-${j}">✕</button></span></div>
   <div class="dl-body"><div class="dl-foto">${foto?`<img src="${esc(foto)}" alt="" loading="lazy">`:''}<span class="dl-ph">${x.quad&&!x[c.foto]?'4 foto dei locali convenzionati':'Nessuna foto'}</span>
    <label class="upload-btn">Carica foto<input type="file" accept="image/*" class="dl-up" data-k="${k}" data-j="${j}"></label>${x[c.foto]?`<button type="button" class="stato-select" data-act="dlFotoDel" data-k="${k}" data-j="${j}">Togli la foto</button>`:''}
    <small>${k==='luoghi'?'Senza foto la scheda usa quella della pagina ufficiale del link, se il sito è tra quelli ammessi.':'Senza foto la scheda usa quella del sito ufficiale, se ammesso, altrimenti un segnaposto.'}</small></div>
   <div class="dl-fields">${c.campi.map(([f,l,ph,area])=>`<div class="field${area?' dl-wide':''}"><label>${l}</label>${area?`<textarea rows="3" data-dl="${k}:${j}:${f}">${esc(dlVal(x,f)||'')}</textarea>`:`<input data-dl="${k}:${j}:${f}" value="${esc(dlVal(x,f)||'')}" placeholder="${esc(ph)}">`}</div>`).join('')}
    ${k==='convenzioni'?`<label class="closed-toggle dl-wide"><input type="checkbox" data-dl="${k}:${j}:estate" ${x.estate?'checked':''}> Solo d'estate (etichetta dorata)</label>`:''}</div></div></div>`}
function vLuoghi(r){const k=r.sub==='convenzioni'?'convenzioni':'luoghi',c=DL[k],l=elenco(k),mine=Array.isArray(S()[k]);
  return `<div class="adm-tabs"><a href="#luoghi" class="${k==='luoghi'?'on':''}">Luoghi di interesse</a><a href="#luoghi/convenzioni" class="${k==='convenzioni'?'on':''}">Convenzioni</a></div>
  <div class="admin-card" data-testid="admin-${k}"><div class="adm-head"><h2>${c.tit}</h2><a class="btn btn-line" href="${c.pag}" target="_blank" rel="noopener">Vedi la pagina ↗</a></div>
  <p class="book-note">Le schede della pagina «${c.tit}», nell'ordine in cui compaiono. ${mine?'Sono le tue: le hai modificate e salvate dalla Gestione.':'Sono quelle di partenza del sito: alla prima modifica diventano una copia tua.'} Ricordati di salvare.</p>
  <div class="dl-list">${l.map((x,j)=>dlItem(k,x,j,l.length)).join('')||'<p class="book-note">Nessuna scheda.</p>'}</div>
  <div class="adm-quick"><button type="button" class="btn btn-line" data-act="dlAdd" data-k="${k}" data-testid="admin-dl-add-${k}">+ Aggiungi ${c.voce}</button>${mine?`<button type="button" class="btn btn-line" data-act="dlReset" data-k="${k}" data-testid="admin-dl-reset-${k}">Ripristina le schede di partenza</button>`:''}</div></div>`}
A.view.luoghi=vLuoghi;
A.after.luoghi=()=>{$$('.dl-foto img').forEach(im=>im.addEventListener('error',()=>im.remove()))};      // foto di una convenzione nuova non ancora nel sito: resta il riquadro
const dlRender=()=>{const y=window.scrollY;A.body();window.scrollTo(0,y)};      // ridisegna la sezione senza tornare in cima
// prima di salvare: ogni scheda ha un nome e i link sono indirizzi veri
A.checks.push(()=>{for(const k of ['luoghi','convenzioni']){if(!Array.isArray(S()[k]))continue;const c=DL[k];
  for(const x of S()[k]){if(!String(c.nome(x)||'').trim())return 'Ogni scheda di «'+c.tit+'» ha bisogno di un nome (Sito → Luoghi e convenzioni)';
    const l=k==='luoghi'?x.link:x.sito;if(l&&!RE_LINK.test(String(l).trim()))return 'Controlla il link di «'+c.nome(x)+'» (Sito → Luoghi e convenzioni): deve iniziare con https:// oppure essere una pagina del sito (es. eventi.html)'}}
  return ''});

// ---------- Regole di prenotazione (preavviso, orari, area ospiti) ----------
const vNotice=()=>`<div class="admin-card" data-testid="admin-notice"><h2>Preavviso minimo</h2>
  <p class="book-note">Quanti giorni prima del check-in gli ospiti possono ancora prenotare dal sito. Vale per tutti gli appartamenti, nel calendario e al pagamento. Non cambia le prenotazioni già confermate né i calendari di Booking e Airbnb. Ricordati di salvare.</p>
  <div class="fields-grid">
   <div class="field"><label for="pre-g">Preavviso minimo (giorni)</label><input id="pre-g" type="number" min="0" max="365" step="1" inputmode="numeric" data-b="c:preavvisoGiorni" value="${esc(S().preavvisoGiorni)}" data-testid="admin-notice-days"></div>
   <div class="field"><label for="pre-h">Orario di check-in (ora di Roma)</label><input id="pre-h" type="time" data-b="c:checkinOra" value="${esc(S().checkinOra)}" style="-webkit-appearance:none;appearance:none;display:block;min-height:46px" data-testid="admin-checkin-time"></div></div>
  <p class="book-note" id="pre-ex" data-testid="admin-notice-example"></p></div>
  <div class="admin-card" data-testid="admin-area-ospiti"><h2>Area ospiti</h2>
  <p class="book-note">Cosa vede l'ospite nell'area clienti. L'orario di check-in è quello qui sopra. Ricordati di salvare.</p>
  <div class="fields-grid">
   <div class="field"><label for="ga-co">Orario di check-out <small>(vuoto = non mostrato)</small></label><input id="ga-co" type="time" data-b="c:checkoutOra" value="${esc(S().checkoutOra)}" style="-webkit-appearance:none;appearance:none;display:block;min-height:46px" data-testid="admin-checkout-time"></div>
   <div class="field"><label for="ga-ig">Wi-Fi e informazioni riservate: visibili da</label><div class="adm-inp"><input id="ga-ig" type="number" min="0" max="30" step="1" inputmode="numeric" data-b="c:infoGiorni" value="${esc(S().infoGiorni)}" style="max-width:90px" data-testid="admin-info-giorni"><span>giorni prima dell'arrivo</span></div></div>
   <div class="field"><label for="ga-wa">Numero WhatsApp <small>(vuoto = non mostrato)</small></label><input id="ga-wa" type="tel" data-b="c:whatsapp" value="${esc(S().whatsapp)}" data-testid="admin-whatsapp"></div></div>
  <p class="book-note">I testi per gli ospiti (regole della casa, Wi-Fi…) si scrivono in ogni appartamento: <a href="#appartamenti">Sito → Appartamenti → Testi → Area ospiti</a>.</p></div>`;
function preRender(){const el=$('#pre-ex');if(!el)return;
  const g=Number(S().preavvisoGiorni),h=A.RE_HHMM.test(S().checkinOra)?S().checkinOra:'',gOk=Number.isInteger(g)&&g>=0&&g<=365;
  if(!gOk||(g>0&&!h)){el.className='book-note form-err';el.textContent=gOk?'Inserisci un orario di check-in valido.':'Il preavviso deve essere un numero intero di giorni da 0 a 365.';return}
  el.className='book-note';
  if(g===0){el.textContent='Con 0 giorni non c’è preavviso: si può prenotare fino alla fine del giorno di arrivo (prenotazioni last minute).';return}
  const arr=addDays(today,g+10);
  el.textContent='Esempio: per un arrivo '+fmtW(arr)+' l’ultima prenotazione possibile è alle '+h+' di '+fmtW(addDays(arr,-g))+' (ora di Roma).'}
A.view.regole=()=>{const o=A.D.orizzonte||{};return vNotice()+`<div class="admin-card" data-testid="admin-orizzonte"><h2>Fin dove si prenota</h2>
  <p class="book-note">Dal sito si prenota fino a <b>${esc(o.mesi||6)} mesi</b> in anticipo${o.ultimoGiorno?' (oggi: fino '+esc(A.alD(o.ultimoGiorno))+')':''}: più in là il calendario non mostra le date e gli ospiti ti scrivono. È una regola fissa del sistema di disponibilità: non si cambia da qui.</p>
  <p class="book-note">Notti minime: ${S().apts.map(p=>esc(short(p))+' '+esc(p.min)).join(' · ')}. Si cambiano, anche per periodi, in <a href="#calendario">Calendario e prezzi</a>.</p></div>`};
A.after.regole=preRender;
A.afterBind.push((k,a)=>{if(k==='c'&&(a==='preavvisoGiorni'||a==='checkinOra'))preRender()});

// ---------- Sistema: sincronizzazione, pagamenti ed email, calendari iCal ----------
const HB={OK:['ok','Aggiornato'],STALE:['stale','In ritardo'],EXPIRED:['expired','Scaduto'],NEVER:['never','Mai scaricato']};
const hb=h=>{const x=HB[h]||['never',esc(h||'—')];return `<span class="stato hb-${x[0]}">${x[1]}</span>`};
const ago=s=>{if(!s)return '—';const m=Math.max(0,Math.round((Date.now()-Date.parse(s))/60000));return m<1?'adesso':m<60?m+' min fa':m<1440?Math.round(m/60)+' h fa':Math.round(m/1440)+' g fa'};
const SEV={CRITICO:'crit',ALTO:'alto',MEDIO:'medio',BASSO:'basso'};
const aptName=id=>{const p=A.aptById(id);return p?short(p):(id||'—')};
function vSync(){
  const D=A.D,s=D.sync,occ=D.occupancy||{};
  if(!s)return '<div class="admin-card"><h2>Sincronizzazione</h2><p class="book-note">Stato non disponibile: ricarica la pagina.</p></div>';
  const r=s.registry||{},ob=s.outbox||{},th=s.thresholds||{};
  const aptCards=S().apts.map(p=>{const o=occ[p.id]||{},st=o.status||'unverifiable',pr=(o.problems||[]).slice(0,3).map(x=>esc(x.code+(x.feed?' · '+x.feed:''))).join(', ');
    return `<div class="adm-stat" data-testid="admin-sync-apt-${p.id}"><span>${esc(short(p))}</span><b>${st==='ok'?'Verificata':st==='degraded'?'Con avvisi':'Non verificabile'}</b><small>${st==='ok'?'Il sito mostra le date in modo affidabile.':st==='degraded'?'Dati utilizzabili, ma con avvisi: '+pr:'Il sito NON accetta prenotazioni finché non si risolve: '+pr}</small></div>`}).join('');
  const feedRows=(s.feeds||[]).map(f=>{const note=[f.error,f.consecutiveFailures?f.consecutiveFailures+' errori di seguito':'',f.invalid?f.invalid+' eventi non validi':'',f.emptyAfterNonEmpty?'calendario improvvisamente vuoto':'',...(f.warnings||[]).slice(0,2)].filter(Boolean).join(' · ');
    return `<tr><td data-label="App.">${esc(aptName(f.apt))}</td><td data-label="Fonte">${esc(f.source)}</td><td data-label="Stato">${hb(f.health)}</td><td data-label="Ultimo ok">${ago(f.lastSuccess)}</td><td data-label="Eventi">${f.eventCount==null?'—':f.eventCount}</td><td data-label="Note">${esc(note||'—')}</td></tr>`}).join('');
  return `<div class="admin-card" data-testid="admin-sync"><div class="adm-head"><h2>Sincronizzazione</h2><div class="adm-top-actions"><button type="button" class="btn btn-wine" data-act="syncNow" data-testid="admin-sync-now">Sincronizza ora</button><button type="button" class="btn btn-line" data-act="reconNow" data-testid="admin-recon-now">Riconcilia</button></div></div>
  <p class="book-note">Il sito mostra una data come libera solo se tutti i calendari (Booking, Airbnb) e il foglio prenotazioni sono verificati e recenti. Se una fonte non si aggiorna per troppo tempo (calendari oltre ${th.feedMaxStaleMin||120} min, foglio oltre ${th.regMaxStaleMin||180} min) l'appartamento diventa «non verificabile» e le prenotazioni dal sito si fermano. <span class="admin-msg" id="sync-msg" data-testid="admin-sync-msg"></span></p>
  <div class="adm-stats">${aptCards}
   <div class="adm-stat"><span>Foglio prenotazioni</span><b>${hb(r.health)}</b><small>${r.count||0} righe · aggiornato ${ago(r.lastSuccess)}${r.invalid?' · '+r.invalid+' righe non valide':''}${r.error?' · '+esc(r.error):''}</small></div>
   <div class="adm-stat"><span>Coda di ripresa</span><b>${ob.pending||0}</b><small>${ob.pending?'scritture verso il foglio in attesa (la più vecchia: '+ago(ob.oldest)+')':'nessuna scrittura in attesa'}</small></div></div>
  <h3>Calendari collegati</h3>
  <div class="table-wrap tw-stack"><table class="data stack"><thead><tr><th>App.</th><th>Fonte</th><th>Stato</th><th>Ultimo ok</th><th>Eventi</th><th>Note</th></tr></thead><tbody>${feedRows||'<tr><td colspan="6" class="td-empty">Nessun calendario configurato.</td></tr>'}</tbody></table></div>
  <p class="book-note">I link dei calendari si cambiano in <a href="#sistema/ical">Calendari iCal</a>.</p></div>
  <div class="admin-card" data-testid="admin-pay"><div class="adm-head"><h2>Pagamenti ed email</h2><div class="adm-top-actions"><button type="button" class="btn btn-wine" data-act="payCheck" data-testid="admin-pay-check">Verifica ora</button><button type="button" class="btn btn-line" data-act="payMail" data-testid="admin-pay-mail">Invia email di prova</button></div></div>
  <p class="book-note">Controlla che le prenotazioni pagate arrivino davvero: Stripe collegato, webhook registrato, email in partenza e prenotazioni rimaste a metà. <span class="admin-msg" id="pay-msg" data-testid="admin-pay-msg"></span></p>
  <div id="pay-body" data-testid="admin-pay-body"><p class="book-note">Controllo in corso…</p></div></div>
  <div class="admin-card" data-testid="admin-sync-rec"><h2>Riconciliazione</h2><p class="book-note">Confronta foglio, calendari, prenotazioni del sito e blocchi: segnala sovrapposizioni, appartamenti discordanti, righe non valide e fonti ferme.</p><div id="sync-rec">${recHtml(V.rec||null)}</div></div>
  <div class="admin-card"><details><summary class="adm-sum">Registro eventi del sistema</summary><div id="sync-log"><p class="book-note">Carico…</p></div></details></div>`}
function recHtml(rc){
  if(!rc)return '<p class="book-note">Nessuna riconciliazione eseguita in questa sessione: premi «Riconcilia».</p>';
  const sm=rc.summary||{},an=rc.anomalies||[];
  const chips=['CRITICO','ALTO','MEDIO','BASSO'].map(k=>`<span class="stato sev-${SEV[k]}">${k} ${sm[k]||0}</span>`).join(' ');
  const rows=an.map(x=>`<tr><td data-label="Gravità"><span class="stato sev-${SEV[x.sev]||'basso'}">${esc(x.sev)}</span></td><td data-label="Tipo">${esc(x.type)}</td><td data-label="App.">${esc(x.apt?aptName(x.apt):'—')}</td><td data-label="Dettaglio">${esc(x.msg||'')}${x.ref?' <small>('+esc(x.ref)+')</small>':''}</td></tr>`).join('');
  return `<p class="book-note">Eseguita ${ago(rc.generatedAt)}.</p><div class="adm-chips">${chips}</div>`
   +(an.length?`<div class="table-wrap tw-stack"><table class="data stack" data-testid="admin-anomalie"><thead><tr><th>Gravità</th><th>Tipo</th><th>App.</th><th>Dettaglio</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="adm-ok">Nessuna anomalia: foglio, calendari e sito sono coerenti.</div>')
   +matrixHtml(rc)}
// matrice per data (prossimi 45 giorni): per ogni notte, da quali fonti risulta occupata
function matrixHtml(rc){
  const m=rc.matrix||{};if(!S().apts.some(p=>m[p.id]))return '';
  const ds=[];for(let d=today;ds.length<45;d=addDays(d,1))ds.push(d);
  const cell=(p,d)=>{const v=(m[p.id]||{})[d]||[];if(!v.length)return '<td data-label="'+esc(short(p))+'" class="mx-free">libera</td>';
    const two=v.includes('BOOKING_ICAL')&&v.includes('AIRBNB_ICAL');
    return `<td data-label="${esc(short(p))}" class="${two?'mx-multi':'mx-busy'}">${v.map(k=>esc(A.LBL[k]||k)).join(' · ')}</td>`};
  return `<details style="margin-top:14px"><summary class="adm-sum">Matrice per data (prossimi 45 giorni)</summary><div class="table-wrap tw-stack"><table class="data stack mx" data-testid="admin-matrix"><thead><tr><th>Data</th>${S().apts.map(p=>`<th>${esc(short(p))}</th>`).join('')}</tr></thead><tbody>${ds.map(d=>`<tr><td data-label="Data">${fmtD(d)}</td>${S().apts.map(p=>cell(p,d)).join('')}</tr>`).join('')}</tbody></table></div><p class="book-note">«Booking · Airbnb» sulla stessa notte (rosso) è una possibile doppia prenotazione.</p></details>`}
// Semaforo dei pagamenti: verde = a posto, giallo = da guardare, rosso = qualcosa non arriva. Il server non manda mai valori segreti, solo «c'è / non c'è».
// payRows serve anche al semaforo unico di Oggi (js/admin-operativita.js).
const PS={ok:['ok','A posto'],warn:['stale','Attenzione'],err:['expired','Da sistemare'],info:['never','Info']};
const PASSI={sheet:'foglio',mail_titolare:'email a te',mail_ospite:'email all\'ospite'};
function payRows(h){
  const a=h.ambiente||{},st=h.stripe||{},wh=st.webhook,rows=[],R=(lv,t,d)=>rows.push([lv,t,d]);
  R(!a.stripe||st.collegato===false?'err':st.errore&&st.collegato===null?'warn':'ok','Stripe (incassi)',
    !a.stripe?'Manca STRIPE_SECRET_KEY su Vercel: nessun pagamento può partire.':st.collegato===false?'La chiave Stripe non è valida o è stata revocata.':st.errore&&st.collegato===null?'Chiave presente, ma non riesco a leggere lo stato da Stripe ('+st.errore+'). Se la chiave è «limitata», servono i permessi di lettura su Webhook ed Eventi.':'Collegato.');
  const url=location.origin+'/api/stripe-webhook';
  if(!a.webhook)R('err','Webhook di Stripe','Manca STRIPE_WEBHOOK_SECRET su Vercel: Stripe non può confermare i pagamenti al sito. Resta solo il controllo automatico (ogni pochi minuti), da non considerare sufficiente.');
  else if(wh==null)R('warn','Webhook di Stripe','Segreto presente, ma non riesco a controllare su Stripe se il webhook è registrato.');
  else if(!wh.length)R('err','Webhook di Stripe','Su Stripe non risulta nessun webhook che punti a questo sito. Registralo in Stripe → Sviluppatori → Webhook: indirizzo '+url+', eventi «checkout.session.completed» e «checkout.session.expired».');
  else{const w=wh.find(x=>x.stato==='enabled'&&!x.mancanti.length)||wh[0];
    R(w.stato!=='enabled'?'err':w.mancanti.length?'warn':'ok','Webhook di Stripe',w.stato!=='enabled'?'Il webhook è registrato ma risulta «'+w.stato+'»: riattivalo su Stripe.':w.mancanti.length?'Registrato, ma mancano gli eventi: '+w.mancanti.join(', ')+'.':'Registrato e attivo.')}
  R(h.ultimoWebhook?'ok':'info','Ultimo avviso da Stripe',h.ultimoWebhook?ago(h.ultimoWebhook.ts)+' ('+h.ultimoWebhook.tipo+').':'Nessuno ricevuto finora: normale se non ci sono ancora state prenotazioni dal sito. Dopo la prima prenotazione di prova deve comparire qui.');
  if(st.consegneFallite>0)R('warn','Consegne non riuscite',st.consegneFallite+(st.consegneFallite===1?' pagamento non è stato consegnato':' pagamenti non sono stati consegnati')+' a un webhook negli ultimi 7 giorni (di questo sito o dell\'app Check-in). Controlla in Stripe → Sviluppatori → Webhook che il «signing secret» su Vercel sia quello giusto.');
  R(a.email?'ok':'err','Email',a.email?'Account di invio configurato. Gli avvisi di nuova prenotazione arrivano a '+(a.destinatario||'—')+(a.destinatarioImpostato?'':' (indirizzo predefinito: per cambiarlo imposta OWNER_EMAIL su Vercel)')+'. Premi «Invia email di prova» per esserne certo.':'NON configurata (mancano GMAIL_USER / GMAIL_APP_PASSWORD su Vercel): né tu né gli ospiti ricevete email. Le prenotazioni si registrano comunque.');
  R(a.foglio?(h.coda&&h.coda.inAttesa?'warn':'ok'):'err','Foglio prenotazioni',!a.foglio?'Non collegato (mancano SHEET_WEBAPP_URL / SHEET_SECRET su Vercel).':h.coda&&h.coda.inAttesa?h.coda.inAttesa+' scritture in attesa di arrivare sul foglio (la più vecchia: '+ago(h.coda.piuVecchia)+'): si svuota da sola quando il foglio risponde.':'Collegato, nessuna scrittura in attesa.');
  if(!a.sync)R('warn','Sincronizzazione automatica','Manca SYNC_SECRET su Vercel: lo script del foglio non può far aggiornare calendari e controlli.');
  if(h.incompleti&&h.incompleti.length)R('err','Prenotazioni a metà',h.incompleti.map(x=>x.code+' (manca: '+x.mancano.map(m=>PASSI[m]||m).join(', ')+')').join(' · ')+'. La prenotazione è confermata e le date sono chiuse; manca un passo. Riprova da Stripe → Sviluppatori → Webhook → «Reinvia», oppure scrivi tu all\'ospite.');
  if(h.daVerificare)R('warn','Da verificare',h.daVerificare+(h.daVerificare===1?' prenotazione pagata attende':' prenotazioni pagate attendono')+' una tua decisione (date in conflitto o non verificabili): aprila in <a href="#prenotazioni">Prenotazioni</a>.');
  if(h.inAttesaVecchie)R('warn','Pagamenti in sospeso',h.inAttesaVecchie+(h.inAttesaVecchie===1?' prenotazione è':' prenotazioni sono')+' in attesa di pagamento da oltre 40 minuti. Se l\'ospite ha pagato, il controllo automatico la conferma entro pochi minuti.');
  if(h.recuperate&&h.recuperate.n)R('warn','Pagamenti recuperati',h.recuperate.n+(h.recuperate.n===1?' pagamento è stato confermato':' pagamenti sono stati confermati')+' dal controllo automatico perché il webhook non era arrivato'+(h.recuperate.ultima?' (ultimo: '+h.recuperate.ultima.code+', '+ago(h.recuperate.ultima.ts)+')':'')+'. Verifica che il webhook sia registrato come indicato sopra.');
  return rows}
A.payRows=payRows;
function payHtml(h){
  if(!h)return '<p class="book-note">Controllo non disponibile: ricarica la pagina o riprova tra poco.</p>';
  const rows=payRows(h),bad=rows.filter(r=>r[0]==='err').length,wa=rows.filter(r=>r[0]==='warn').length;
  return `<div class="${bad?'adm-warn':wa?'adm-warn':'adm-ok'}" data-testid="admin-pay-summary">${bad?bad+(bad===1?' punto da sistemare':' punti da sistemare'):wa?wa+(wa===1?' punto da guardare':' punti da guardare'):'Tutto a posto: pagamenti, avvisi e email risultano funzionanti.'}</div>`
   +`<div class="pay-rows" data-testid="admin-pay-rows">${rows.map(([lv,t,d])=>`<div class="pay-row" data-lv="${lv}"><span class="stato hb-${PS[lv][0]}">${PS[lv][1]}</span><div><b>${esc(t)}</b><small>${/<a /.test(d)?d:esc(d)}</small></div></div>`).join('')}</div>`}
// il risultato vale anche per il semaforo di Oggi (V.health)
async function payAfter(){const b=$('#pay-body');if(!b)return;let h=null;try{h=await A.api('health',{})}catch{}V.health={ts:Date.now(),data:h};const c=$('#pay-body');if(c)c.innerHTML=payHtml(h)}
// dopo il disegno della vista: ultimo controllo di riconciliazione e registro eventi
async function syncAfter(){
  payAfter();      // non si aspetta: la scheda «Pagamenti ed email» si riempie appena Stripe risponde
  let ss=null;try{ss=await A.api('sync_status',{})}catch{}
  const L=$('#sync-log'),R=$('#sync-rec');
  if(R&&!V.rec&&ss&&ss.lastReconcile){V.rec=ss.lastReconcile;R.innerHTML=recHtml(V.rec)}
  if(L)L.innerHTML=ss&&(ss.log||[]).length?`<div class="table-wrap tw-stack"><table class="data stack"><thead><tr><th>Quando</th><th>Livello</th><th>Messaggio</th></tr></thead><tbody>${ss.log.map(x=>`<tr><td data-label="Quando">${esc(ago(x.ts))}</td><td data-label="Livello">${esc(x.lvl||'')}</td><td data-label="Messaggio">${esc(x.msg||'')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="book-note">Nessun errore registrato.</p>'}
// calendari iCal: i link da importare (Booking, Airbnb) e quello da dare ai portali, per appartamento; il calendario personale
const icalUrl=(p,f)=>`${location.origin}/api/x?a=ical&id=${p.id}${f?'&for='+f:''}`;
const icalOut=(url,lab,tid)=>`<div class="field"><label>${lab}</label><div class="adm-copy"><input readonly onclick="this.select()" value="${url}" data-testid="${tid}"><button type="button" class="btn btn-line" data-act="copy" data-v="${url}">Copia</button></div></div>`;
const vIcal=()=>S().apts.map(p=>`<div class="admin-card" data-testid="admin-ical-card-${p.id}"><h2>Calendari · <span class="n">${esc(short(p))}</span></h2>
  <div class="field"><label>Link iCal Booking / Airbnb (separati da virgola — chiudono automaticamente le date)</label><input data-b="ical:${p.id}" value="${esc(S().ical[p.id]||'')}" placeholder="https://...booking.ics, https://...airbnb.ics" data-testid="admin-ical-${p.id}"></div>
  ${icalOut(icalUrl(p,'site'),'Calendario da inserire su <b>Booking.com</b> e su <b>Airbnb</b> (lo stesso link per entrambi): contiene solo le prenotazioni fatte dal sito','admin-ical-export-site-'+p.id)}</div>`).join('')
  +`<div class="admin-card"><h2>Calendario personale</h2><p class="book-note">Per te, non per Booking e Airbnb.</p>
  ${icalOut(location.origin+'/api/x?a=ical&for=all&id=all&k=LA_TUA_CHIAVE','Tutte le prenotazioni di Torre e Corte (sito, Booking, Airbnb e blocchi), con i nomi degli ospiti: da usare nello script del telefono o in un calendario tuo','admin-ical-personal')}
  <p class="book-note" data-testid="admin-ical-note">Al posto di <b>LA_TUA_CHIAVE</b> metti il valore della variabile <b>ICAL_PERSONAL_KEY</b> su Vercel: senza la chiave il link non funziona. Contiene dati degli ospiti: non darlo a nessuno e non inserirlo su Booking o Airbnb.</p></div>`;
A.view.sistema=r=>`<div class="adm-tabs" data-testid="admin-sistema-tabs"><a href="#sistema" class="${r.sub==='ical'?'':'on'}">Stato</a><a href="#sistema/ical" class="${r.sub==='ical'?'on':''}">Calendari iCal</a></div>`+(r.sub==='ical'?vIcal():vSync());
A.after.sistema=r=>{if(r.sub!=='ical')syncAfter()};

Object.assign(A.act,{
  phL:a=>movePh(+a.dataset.i,+a.dataset.j,+a.dataset.j-1),phR:a=>movePh(+a.dataset.i,+a.dataset.j,+a.dataset.j+1),phC:a=>movePh(+a.dataset.i,+a.dataset.j,0),
  phD:a=>{const i=+a.dataset.i;S().apts[i].foto.splice(+a.dataset.j,1);A.markDirty();phRender(i)},
  evDel:a=>{if(confirm('Eliminare questo evento?'))A.api('event_del',{id:a.dataset.id}).then(async()=>{A.EV=(await A.get('a=events'))||[];A.body()}).catch(x=>alert(x.message))},
  dlAdd:a=>{const k=a.dataset.k;mio(k).push(DL[k].nuovo());A.markDirty('Luoghi e convenzioni');dlRender();const l=$$('[data-dl^="'+k+':"]');const f=$('[data-dl="'+k+':'+(mio(k).length-1)+':'+(k==='luoghi'?'t':'nome')+'"]');if(f)f.focus();void l},
  dlDel:a=>{const k=a.dataset.k,j=+a.dataset.j,x=elenco(k)[j];if(!confirm('Togliere la scheda «'+(DL[k].nome(x)||'senza nome')+'»? Sparirà dalla pagina quando salvi.'))return;mio(k).splice(j,1);A.markDirty('Luoghi e convenzioni');dlRender()},
  dlMove:a=>{const k=a.dataset.k,j=+a.dataset.j,to=j+(+a.dataset.d),l=mio(k);if(to<0||to>=l.length)return;const[x]=l.splice(j,1);l.splice(to,0,x);A.markDirty('Luoghi e convenzioni');dlRender()},
  dlFotoDel:a=>{const k=a.dataset.k,x=mio(k)[+a.dataset.j];x[DL[k].foto]='';A.markDirty('Luoghi e convenzioni');dlRender()},
  dlReset:a=>{const k=a.dataset.k;if(!confirm('Tornare alle schede di partenza di «'+DL[k].tit+'»? Le tue modifiche a queste schede si perdono quando salvi.'))return;S()[k]=null;A.markDirty('Luoghi e convenzioni');dlRender()},
  syncNow:async a=>{const o=$('#sync-msg');a.disabled=true;o.className='admin-msg';o.textContent='Sincronizzo… (può richiedere qualche secondo)';
    try{const r=await A.api('sync',{force:true,drain:true});await A.refreshAdm();A.body();const m=$('#sync-msg'),er=(r.errors||[]);if(m){const pg=r.pagamenti||{},rec=pg.recuperate?' Recuperati '+pg.recuperate+(pg.recuperate===1?' pagamento':' pagamenti')+' non arrivati dal webhook.':'';m.textContent=(er.length?'Completata con errori: '+er.join(' | '):'Sincronizzazione completata.')+rec;m.className='admin-msg '+(er.length?'warn':'ok')}}
    catch(x){o.textContent=x.message;o.className='admin-msg warn';a.disabled=false}},
  payCheck:async a=>{const o=$('#pay-msg');a.disabled=true;o.className='admin-msg';o.textContent='Controllo in corso…';
    try{await payAfter();o.textContent=''}catch(x){o.textContent=x.message;o.className='admin-msg warn'}finally{a.disabled=false}},
  payMail:async a=>{const o=$('#pay-msg');a.disabled=true;o.className='admin-msg';o.textContent='Invio in corso…';
    try{const r=await A.api('test_mail',{}),ok=r.esito==='inviata';
      o.textContent=ok?'Email di prova inviata a '+r.destinatario+': controlla la posta (anche lo spam).':r.esito==='non_configurata'?'Email non configurata: mancano GMAIL_USER / GMAIL_APP_PASSWORD su Vercel.':'Invio non riuscito: controlla l\'account Gmail e la «password per le app».';
      o.className='admin-msg '+(ok?'ok':'warn')}
    catch(x){o.textContent=x.message;o.className='admin-msg warn'}finally{a.disabled=false}},
  reconNow:async a=>{const o=$('#sync-msg');a.disabled=true;o.className='admin-msg';o.textContent='Riconciliazione in corso…';
    try{V.rec=await A.api('reconcile',{days:60});o.textContent='';o.className='admin-msg';const b=$('#sync-rec');if(b)b.innerHTML=recHtml(V.rec)}
    catch(x){o.textContent=x.message;o.className='admin-msg warn'}finally{a.disabled=false}}
});
// campi delle schede di Luoghi e Convenzioni: data-dl="<luoghi|convenzioni>:<n>:<campo>" (meta0/meta1 = le due righe sotto il titolo)
A.onInput.push(el=>{if(!el.dataset.dl)return false;const[k,j,f]=el.dataset.dl.split(':'),x=mio(k)[+j];if(!x)return true;
  const v=el.type==='checkbox'?el.checked:el.value;
  if(f==='meta0'||f==='meta1'){x.meta=Array.isArray(x.meta)?x.meta:[];x.meta[f==='meta0'?0:1]=v}else x[f]=v;
  if(f==='t'||f==='nome'){const h=el.closest('.dl-item').querySelector('.dl-top b');if(h)h.textContent=(+j+1)+'. '+(String(v).trim()||'(senza nome)')}      // il titolo della scheda segue il nome mentre lo scrivi
  A.markDirty('Luoghi e convenzioni');return true});
A.onChange.push(async el=>{
  if(el.dataset.dl&&el.type==='checkbox'){const[k,j]=el.dataset.dl.split(':'),x=mio(k)[+j];if(x){x.estate=el.checked;A.markDirty('Luoghi e convenzioni')}return true}
  if(el.classList.contains('up')){const i=+el.dataset.i,msg=$('#om'+i);msg.textContent='Carico le foto…';
    try{for(const f of el.files)S().apts[i].foto.push((await A.api('up',{id:S().apts[i].id,img:await resize(f)})).url);el.value='';phRender(i);A.markDirty();msg.textContent='Foto caricate. Ricordati di salvare.'}catch(x){msg.textContent=x.message}return true}
  if(el.classList.contains('dl-up')&&el.files[0]){const k=el.dataset.k,j=+el.dataset.j,lab=el.closest('.dl-foto');if(lab)lab.classList.add('is-loading');
    try{const u=(await A.api('up',{id:k,img:await resize(el.files[0])})).url,x=mio(k)[j];x[DL[k].foto]=u;if(k==='luoghi')delete x.quad;A.markDirty('Luoghi e convenzioni');dlRender()}
    catch(x){alert(x.message)}return true}
  return false});
A.onSubmit.push((f,e)=>{if(f.id!=='evform')return false;e.preventDefault();
  A.api('event_add',Object.fromEntries(new FormData(f))).then(async()=>{A.EV=(await A.get('a=events'))||[];A.body()}).catch(x=>alert(x.message));return true});
// foto degli appartamenti: trascina per cambiare l'ordine
let dI=null,dF=null;const M=A.M;
M.addEventListener('dragstart',e=>{const it=e.target.closest('.pm-item');if(!it)return;dI=+it.dataset.i;dF=+it.dataset.j;it.classList.add('dragging')});
M.addEventListener('dragend',e=>{const it=e.target.closest('.pm-item');it&&it.classList.remove('dragging');$$('.pm-item.dragover').forEach(x=>x.classList.remove('dragover'))});
M.addEventListener('dragover',e=>{const it=e.target.closest('.pm-item');if(it&&+it.dataset.i===dI){e.preventDefault();it.classList.add('dragover')}});
M.addEventListener('dragleave',e=>{const it=e.target.closest('.pm-item');it&&it.classList.remove('dragover')});
M.addEventListener('drop',e=>{const it=e.target.closest('.pm-item');if(!it||+it.dataset.i!==dI)return;e.preventDefault();const to=+it.dataset.j;if(dF!=null&&dF!==to)movePh(dI,dF,to);dI=dF=null});
});
