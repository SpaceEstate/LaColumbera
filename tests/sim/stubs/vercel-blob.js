// Vercel Blob finto: indirizzi della stessa forma di quelli veri (https://<negozio>.public.blob.vercel-storage.com/<percorso>-<suffisso>.jpg);
// le cancellazioni si annotano in global.__blobDel per le prove. global.__blobFail = errore da lanciare al prossimo put (simula Vercel Blob guasto).
let n = 0;
module.exports = {
  put: async p => { const e = global.__blobFail; if (e) { global.__blobFail = null; throw e; } return ({ url: 'https://teststore.public.blob.vercel-storage.com/' + String(p).replace(/\.jpg$/, '') + '-' + (++n) + '.jpg' }); },
  del: async u => { (global.__blobDel = global.__blobDel || []).push(String(u)); }
};
