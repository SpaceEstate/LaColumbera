// Vercel Blob finto: indirizzi della stessa forma di quelli veri (https://<negozio>.public.blob.vercel-storage.com/<percorso>-<suffisso>.jpg);
// le cancellazioni si annotano in global.__blobDel per le prove.
let n = 0;
module.exports = {
  put: async p => ({ url: 'https://teststore.public.blob.vercel-storage.com/' + String(p).replace(/\.jpg$/, '') + '-' + (++n) + '.jpg' }),
  del: async u => { (global.__blobDel = global.__blobDel || []).push(String(u)); }
};
