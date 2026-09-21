import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import {
  FALLBACK_CONFIG,
  aptShortName,
  errMsg,
  eur,
  fmtDate,
  myBookings,
} from "@/lib/site";
import type { Booking } from "@/lib/site";

export default function AreaClienti() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Area personale · La Columbera";
    window.scrollTo(0, 0);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setRows(null);
    try {
      setRows(await myBookings(email, code));
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  const nomeApt = (id: string) => {
    const p = FALLBACK_CONFIG.apts.find((a) => a.id === id);
    return p ? aptShortName(p) : id;
  };

  return (
    <>
      <SiteHeader solid />
      <main>
        <div className="auth-wrap">
          <div className="auth-col">
            <div className="auth-card" data-testid="area-clienti-card">
              <span className="section-eyebrow">Area personale</span>
              <h1>Le tue prenotazioni</h1>
              <p className="sub">
                Inserisci l'email usata per prenotare e il codice prenotazione che hai ricevuto
                al momento della richiesta.
              </p>
              <form onSubmit={submit} data-testid="area-clienti-form">
                <div className="field">
                  <label htmlFor="ac-email">Email</label>
                  <input
                    id="ac-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="area-clienti-email"
                  />
                </div>
                <div className="field">
                  <label htmlFor="ac-code">Codice prenotazione</label>
                  <input
                    id="ac-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    data-testid="area-clienti-code"
                  />
                </div>
                <button
                  className="btn btn-wine"
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={busy}
                  data-testid="area-clienti-submit"
                >
                  {busy ? "Ricerca in corso…" : "Vedi prenotazioni"}
                </button>
                {err && (
                  <p className="form-err" data-testid="area-clienti-error">{err}</p>
                )}
              </form>
            </div>

            {rows && (
              <div className="table-wrap" style={{ marginTop: 28 }} data-testid="area-clienti-results">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Codice</th>
                      <th>Appartamento</th>
                      <th>Dal</th>
                      <th>Al</th>
                      <th>Ospiti</th>
                      <th>Totale</th>
                      <th>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code} data-testid={`booking-row-${r.code}`}>
                        <td><b>{r.code}</b></td>
                        <td>{nomeApt(r.id)}</td>
                        <td>{fmtDate(r.da)}</td>
                        <td>{fmtDate(r.a)}</td>
                        <td>{r.ospiti}</td>
                        <td>{eur(r.totale)}</td>
                        <td>
                          <span className={`stato ${r.stato}`}>{r.stato}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
