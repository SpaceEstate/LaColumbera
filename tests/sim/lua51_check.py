# La Columbera · gli script Lua di produzione (hold atomici) eseguiti su Lua 5.1, la versione di Redis/Upstash.
# Il banco di prova principale usa wasmoon (Lua 5.4): questo controllo verifica che gli script non usino nulla di successivo a 5.1 e che
# rispettino le regole di Redis (nessun globale nuovo, ARGV/KEYS di sola lettura).
#   pip install lupa && cd <repo> && node -e "const A=require('./api/_avail.js');require('fs').writeFileSync('/tmp/lua_scripts.json',JSON.stringify({acquire:A.LUA_ACQUIRE,release:A.LUA_RELEASE}))" && python3 tests/sim/lua51_check.py
import json
from lupa import lua51
S = json.load(open('/tmp/lua_scripts.json'))

def run(script, store, keys, argv):
    """Esegue lo script in Lua 5.1 emulando le regole di Redis: ARGV/KEYS globali di sola lettura, nessun nuovo globale, nil bulk = false."""
    L = lua51.LuaRuntime(unpack_returned_tuples=True)
    def call(cmd, key, *a):
        h = store.setdefault(key, {})
        if cmd == 'HGET': return h.get(a[0], False)
        if cmd == 'HSET': h[a[0]] = str(a[1]); return 1
        if cmd == 'HDEL': return 1 if h.pop(a[0], None) is not None else 0
        raise Exception('comando non emulato: ' + cmd)
    g = L.globals()
    redis = L.table(call=call); g.redis = redis
    g.KEYS = L.table_from(list(keys)); g.ARGV = L.table_from([str(x) for x in argv])
    # come Redis: da qui in poi creare o leggere un globale inesistente è un errore
    L.execute("setmetatable(_G, {__newindex=function(_,k) error('Script attempted to create global '..k) end, __index=function(_,k) error('Script attempted to access nonexistent global variable '..k) end})")
    fn = L.eval('function() ' + script + ' end')
    r = fn()
    return [r[i] for i in range(1, len(r) + 1)] if r is not None else None

ok = True
def check(name, cond, extra=''):
    global ok; ok &= bool(cond); print(('OK  ' if cond else 'KO  ') + name + (' → ' + str(extra) if not cond else ''))

NOW = 1790000000000; EXP = str(NOW + 2110000); K = ['holds:torre']; d = ['2026-12-10', '2026-12-11', '2026-12-12']
st = {}
r = run(S['acquire'], st, K, [NOW, 'AAA111', EXP] + d); check('acquisizione di date libere', r == [1] and len(st['holds:torre']) == 3, r)
st2 = {'holds:torre': dict(st['holds:torre'])}
r = run(S['acquire'], st2, K, [NOW, 'BBB222', EXP] + d[1:] + ['2026-12-13']); check('conflitto: nessuna scrittura parziale', r[0] == 0 and r[2] == 'AAA111' and '2026-12-13' not in st2['holds:torre'] and st2['holds:torre']['2026-12-11'].startswith('AAA111|'), (r, st2))
r = run(S['acquire'], st2, K, [NOW + 5000000, 'BBB222', str(NOW + 9000000)] + d); check('hold scaduto di un altro: si può acquisire', r == [1] and all(v.startswith('BBB222|') for v in st2['holds:torre'].values()), (r, st2))
r = run(S['acquire'], st2, K, [NOW + 5000000, 'BBB222', str(NOW + 9500000)] + d); check('lo stesso codice può rinnovare il proprio hold', r == [1], r)
st3 = {'holds:torre': {'2026-12-10': 'AB12|' + EXP, '2026-12-11': 'AB123|' + EXP, '2026-12-12': 'ZZ|' + EXP}}
r = run(S['release'], st3, K, ['AB12'] + d); check('release: solo i propri hold (AB12 non tocca AB123)', r == [1] and set(st3['holds:torre']) == {'2026-12-11', '2026-12-12'}, (r, st3))
st4 = {}; many = ['2027-%02d-%02d' % (m, g) for m in range(1, 3) for g in range(1, 29)][:60]
r = run(S['acquire'], st4, K, [NOW, 'LONG01', EXP] + many); check('60 notti in un colpo', r == [1] and len(st4['holds:torre']) == 56, (r, len(st4.get('holds:torre', {}))))
st5 = {'holds:torre': {'2026-12-10': 'rovinato-senza-pipe'}}
r = run(S['acquire'], st5, K, [NOW, 'CCC333', EXP, '2026-12-10']); check('valore corrotto nell\'hash: non blocca e non va in errore', r == [1], r)
print('\nCOMPATIBILE CON LUA 5.1' if ok else '\nPROBLEMI')
