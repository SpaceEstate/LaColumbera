import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import {
  adminLogin,
  adminSave,
  adminSetStatus,
  adminUpload,
  aptShortName,
  errMsg,
  eur,
  fmtDate,
  getAdminData,
  getConfig,
} from "@/lib/site";
import type { AdminData, Apt, Booking, SiteConfig } from "@/lib/site";

const resizeImage = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1600 / Math.max(im.width, im.height));
      const cv = document.createElement("canvas");
      cv.width = im.width * k;
      cv.height = im.height * k;
      cv.getContext("2d")!.drawImage(im, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(im.src);
      resolve(cv.toDataURL("image/jpeg", 0.82));
    };
    im.onerror = () => reject(new Error("Immagine non leggibile"));
    im.src = URL.createObjectURL(f);
  });

const parsePeriodi = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((x) => x.length === 3)
    .map(([da, a, prezzo]) => ({ da, a, prezzo: +prezzo }));

function AdminLogin({ onLogin }: { onLogin: (t: string) => void }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await adminLogin(u, p);
      sessionStorage.setItem("lc_admin", r.t);
      onLogin(r.t);
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card" data-testid="admin-login-card">
        <span className="section-eyebrow">Area riservata</span>
        <h1>Gestione</h1>
        <p className="sub">Accedi per modificare contenuti, foto, prezzi e prenotazioni.</p>
        <form onSubmit={submit} data-testid="admin-login-form">
          <div className="field">
            <label htmlFor="ad-user">Nome utente</label>
            <input
              id="ad-user"
              autoComplete="username"
              value={u}
              onChange={(e) => setU(e.target.value)}
              data-testid="admin-user"
            />
          </div>
          <div className="field">
            <label htmlFor="ad-pass">Password</label>
            <input
              id="ad-pass"
              type="password"
              autoComplete="current-password"
              value={p}
              onChange={(e) => setP(e.target.value)}
              data-testid="admin-pass"
            />
          </div>
          <button
            className="btn btn-wine"
            style={{ width: "100%", justifyContent: "center" }}
            disabled={busy}
            data-testid="admin-login-submit"
          >
            {busy ? "Accesso in corso…" : "Accedi"}
          </button>
          {err && (
            <p className="form-err" data-testid="admin-login-error">{err}</p>
          )}
        </form>
      </div>
    </div>
  );
}

function AdminPanel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { data: cfgData } = useQuery({ queryKey: ["config"], queryFn: getConfig });
  const { data: adm, error: admError } = useQuery<AdminData>({
    queryKey: ["admin-data", token],
    queryFn: () => getAdminData(token),
    retry: false,
  });

  const [draft, setDraft] = useState<SiteConfig | null>(null);
  const [pTexts, setPTexts] = useState<string[]>([]);
  const [bk, setBk] = useState<Booking[]>([]);
  const [saveMsg, setSaveMsg] = useState("");
  const [uploadMsg, setUploadMsg] = useState("");

  useEffect(() => {
    if (admError) onLogout();
  }, [admError, onLogout]);

  useEffect(() => {
    if (adm) setBk(adm.bk);
  }, [adm]);

  useEffect(() => {
    if (cfgData && !draft) {
      const c = structuredClone(cfgData);
      setDraft(c);
      setPTexts(
        c.apts.map((p) => (p.periodi || []).map((q) => `${q.da} ${q.a} ${q.prezzo}`).join("\n")),
      );
    }
  }, [cfgData, draft]);

  const setApt = (i: number, patch: Partial<Apt>) =>
    setDraft((d) =>
      d ? { ...d, apts: d.apts.map((p, j) => (j === i ? { ...p, ...patch } : p)) } : d,
    );

  const removePhoto = (ai: number, pi: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            apts: d.apts.map((p, j) =>
              j === ai ? { ...p, foto: p.foto.filter((_, k) => k !== pi) } : p,
            ),
          }
        : d,
    );

  const coverPhoto = (ai: number, pi: number) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            apts: d.apts.map((p, j) => {
              if (j !== ai) return p;
              const foto = [...p.foto];
              const [x] = foto.splice(pi, 1);
              foto.unshift(x);
              return { ...p, foto };
            }),
          }
        : d,
    );

  const upload = async (ai: number, e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !draft) return;
    setUploadMsg("Carico le foto…");
    try {
      for (const f of Array.from(files)) {
        const img = await resizeImage(f);
        const r = await adminUpload(token, draft.apts[ai].id, img);
        setDraft((d) =>
          d
            ? {
                ...d,
                apts: d.apts.map((p, j) => (j === ai ? { ...p, foto: [...p.foto, r.url] } : p)),
              }
            : d,
        );
      }
      setUploadMsg("Foto caricate. Salva per pubblicarle.");
    } catch (x) {
      setUploadMsg(errMsg(x));
    } finally {
      e.target.value = "";
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaveMsg("Salvataggio…");
    try {
      const payload: SiteConfig = {
        ...draft,
        apts: draft.apts.map((p, i) => ({ ...p, periodi: parsePeriodi(pTexts[i] || "") })),
      };
      await adminSave(token, payload);
      setSaveMsg("Salvato: le modifiche sono già online.");
    } catch (x) {
      setSaveMsg(errMsg(x));
    }
  };

  const changeStatus = async (code: string, stato: string) => {
    setBk((rows) => rows.map((r) => (r.code === code ? { ...r, stato } : r)));
    try {
      await adminSetStatus(token, code, stato);
    } catch {
      setBk((rows) => [...rows]);
    }
  };

  const nomeApt = (id: string) =>
    draft ? aptShortName(draft.apts.find((p) => p.id === id) ?? ({ nome: id } as Apt)) : id;

  return (
    <main className="admin-main" data-testid="admin-panel">
      <div className="wrap">
        <div className="admin-top">
          <h1>Gestione</h1>
          <button className="btn btn-line" onClick={onLogout} data-testid="admin-logout">
            Esci
          </button>
        </div>

        {draft && (
          <form onSubmit={save} data-testid="admin-save-form">
            <div className="admin-card">
              <h2>Home</h2>
              <div className="field">
                <label htmlFor="ad-chi">Chi siamo</label>
                <textarea
                  id="ad-chi"
                  rows={4}
                  value={draft.chi}
                  onChange={(e) => setDraft({ ...draft, chi: e.target.value })}
                  data-testid="admin-chi"
                />
              </div>
            </div>

            {draft.apts.map((p, i) => (
              <div className="admin-card" key={p.id} data-testid={`admin-apt-${p.id}`}>
                <h2>
                  Appartamento <span className="n">{aptShortName(p)}</span>
                </h2>
                <div className="field">
                  <label>Nome</label>
                  <input
                    value={p.nome}
                    onChange={(e) => setApt(i, { nome: e.target.value })}
                    data-testid={`admin-nome-${p.id}`}
                  />
                </div>
                <div className="field">
                  <label>Sottotitolo</label>
                  <input
                    value={p.sotto}
                    onChange={(e) => setApt(i, { sotto: e.target.value })}
                    data-testid={`admin-sotto-${p.id}`}
                  />
                </div>
                <div className="field">
                  <label>Descrizione</label>
                  <textarea
                    rows={6}
                    value={p.testo}
                    onChange={(e) => setApt(i, { testo: e.target.value })}
                    data-testid={`admin-testo-${p.id}`}
                  />
                </div>
                <div className="fields-grid">
                  <div className="field">
                    <label>Prezzo a notte (€)</label>
                    <input
                      type="number"
                      value={p.base}
                      onChange={(e) => setApt(i, { base: +e.target.value })}
                      data-testid={`admin-base-${p.id}`}
                    />
                  </div>
                  <div className="field">
                    <label>Ospiti inclusi</label>
                    <input
                      type="number"
                      value={p.inclusi}
                      onChange={(e) => setApt(i, { inclusi: +e.target.value })}
                      data-testid={`admin-inclusi-${p.id}`}
                    />
                  </div>
                  <div className="field">
                    <label>Ospite extra (€/notte)</label>
                    <input
                      type="number"
                      value={p.extra}
                      onChange={(e) => setApt(i, { extra: +e.target.value })}
                      data-testid={`admin-extra-${p.id}`}
                    />
                  </div>
                  <div className="field">
                    <label>Ospiti massimi</label>
                    <input
                      type="number"
                      value={p.max}
                      onChange={(e) => setApt(i, { max: +e.target.value })}
                      data-testid={`admin-max-${p.id}`}
                    />
                  </div>
                  <div className="field">
                    <label>Notti minime</label>
                    <input
                      type="number"
                      value={p.min}
                      onChange={(e) => setApt(i, { min: +e.target.value })}
                      data-testid={`admin-min-${p.id}`}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>
                    Prezzi per periodo — una riga per periodo: primo giorno, ultimo giorno,
                    prezzo (es. 2026-12-20 2027-01-06 200)
                  </label>
                  <textarea
                    rows={3}
                    value={pTexts[i] ?? ""}
                    onChange={(e) =>
                      setPTexts((t) => t.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    data-testid={`admin-periodi-${p.id}`}
                  />
                </div>
                <div className="field">
                  <label>Foto (bordata in oro = copertina)</label>
                  <div className="photo-grid" data-testid={`admin-foto-${p.id}`}>
                    {p.foto.map((u, pi) => (
                      <div className={`ph${pi === 0 ? " cover" : ""}`} key={u}>
                        <img src={u} alt="" />
                        <div className="ph-tools">
                          {pi > 0 && (
                            <button
                              type="button"
                              title="Imposta come copertina"
                              onClick={() => coverPhoto(i, pi)}
                              data-testid={`admin-foto-cover-${p.id}-${pi}`}
                            >
                              ★
                            </button>
                          )}
                          <button
                            type="button"
                            title="Rimuovi foto"
                            onClick={() => removePhoto(i, pi)}
                            data-testid={`admin-foto-del-${p.id}-${pi}`}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="upload-row">
                    <label className="upload-btn" data-testid={`admin-upload-btn-${p.id}`}>
                      + Aggiungi foto
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => upload(i, e)}
                        data-testid={`admin-upload-${p.id}`}
                      />
                    </label>
                    <span className="admin-msg" data-testid="admin-upload-msg">{uploadMsg}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="admin-card">
              <button className="btn btn-wine" data-testid="admin-save">
                Salva modifiche
              </button>
              <span className="admin-msg" data-testid="admin-save-msg">{saveMsg}</span>
            </div>
          </form>
        )}

        <div className="admin-card">
          <h2>Prenotazioni dal sito</h2>
          <div className="table-wrap" data-testid="admin-bookings">
            <table className="data">
              <thead>
                <tr>
                  <th>Codice</th>
                  <th>Appartamento</th>
                  <th>Dal</th>
                  <th>Al</th>
                  <th>Ospiti</th>
                  <th>Cliente</th>
                  <th>Totale</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {bk.length === 0 && (
                  <tr>
                    <td colSpan={8}>Nessuna prenotazione per ora.</td>
                  </tr>
                )}
                {bk.map((r) => (
                  <tr key={r.code} data-testid={`admin-booking-${r.code}`}>
                    <td><b>{r.code}</b></td>
                    <td>{nomeApt(r.id)}</td>
                    <td>{fmtDate(r.da)}</td>
                    <td>{fmtDate(r.a)}</td>
                    <td>{r.ospiti}</td>
                    <td>
                      {r.nome}
                      <br />
                      {r.email} {r.tel}
                    </td>
                    <td>{eur(r.totale)}</td>
                    <td>
                      <select
                        className="stato-select"
                        value={r.stato}
                        onChange={(e) => changeStatus(r.code, e.target.value)}
                        data-testid={`admin-status-${r.code}`}
                      >
                        {["richiesta", "confermata", "annullata"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-card">
          <h2>Occupazioni da Booking e Airbnb</h2>
          <div className="table-wrap" data-testid="admin-external">
            <table className="data">
              <thead>
                <tr>
                  <th>Appartamento</th>
                  <th>Dal</th>
                  <th>Al</th>
                  <th>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {!adm || adm.ext.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Nessuna occupazione esterna futura.</td>
                  </tr>
                ) : (
                  adm.ext.map((x, i) => (
                    <tr key={i}>
                      <td>{nomeApt(x.id)}</td>
                      <td>{fmtDate(x.da)}</td>
                      <td>{fmtDate(x.a)}</td>
                      <td>{x.src}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem("lc_admin") || "");

  useEffect(() => {
    document.title = "Gestione · La Columbera";
    window.scrollTo(0, 0);
  }, []);

  const logout = () => {
    sessionStorage.removeItem("lc_admin");
    setToken("");
  };

  return (
    <>
      <SiteHeader solid />
      {token ? (
        <AdminPanel token={token} onLogout={logout} />
      ) : (
        <AdminLogin onLogin={setToken} />
      )}
      <SiteFooter />
    </>
  );
}
