import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useReveal } from "@/hooks/useReveal";
import {
  FALLBACK_CONFIG,
  aptShortName,
  bookStay,
  errMsg,
  eur,
  getBusy,
  getConfig,
  listDays,
  nightPrice,
  totalPrice,
} from "@/lib/site";
import type { Booking } from "@/lib/site";

const todayIso = () => new Date().toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

export default function ApartmentPage({ aptId }: { aptId: string }) {
  const { data: cfgData } = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 300_000,
    retry: 1,
  });
  const config = cfgData ?? FALLBACK_CONFIG;
  const apt =
    config.apts.find((a) => a.id === aptId) ??
    FALLBACK_CONFIG.apts.find((a) => a.id === aptId)!;
  const other = config.apts.find((a) => a.id !== aptId);

  const { data: busyData, isError: busyError } = useQuery({
    queryKey: ["busy", aptId],
    queryFn: () => getBusy(aptId),
    retry: false,
  });
  const busy = useMemo(() => new Set(busyData ?? []), [busyData]);
  const online = !busyError && busyData !== undefined;

  const [mainImg, setMainImg] = useState(0);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [ospiti, setOspiti] = useState(2);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [tel, setTel] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Booking | null>(null);

  useReveal(cfgData !== undefined);

  useEffect(() => {
    document.title = `${apt.nome} · La Columbera`;
    window.scrollTo(0, 0);
  }, [apt.nome]);

  const year = month.getFullYear();
  const mo = month.getMonth();
  const firstOffset = (new Date(year, mo, 1).getDay() + 6) % 7;
  const numDays = new Date(year, mo + 1, 0).getDate();
  const today = todayIso();

  const pick = (d: string, isBusy: boolean) => {
    const second = da && !a && d > da;
    if (isBusy && !second) return;
    if (!second) {
      setDa(d);
      setA("");
      setErr("");
    } else {
      const span = listDays(da, d);
      if (span.length < apt.min) {
        setErr(`Soggiorno minimo: ${apt.min} notti`);
        return;
      }
      if (span.some((z) => busy.has(z))) {
        setErr("Nel periodo scelto ci sono date occupate");
        return;
      }
      setA(d);
      setErr("");
    }
  };

  const quote = a
    ? `${listDays(da, a).length} notti · totale ${eur(totalPrice(apt, da, a, ospiti))}`
    : "Scegli arrivo e partenza. Sotto ogni giorno trovi il prezzo per notte.";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!a) {
      setErr("Scegli le date sul calendario");
      return;
    }
    setSending(true);
    try {
      const r = await bookStay({ id: apt.id, da, a, ospiti, nome, email, tel });
      setDone(r);
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <SiteHeader />
      <main>
        <section className="page-hero" data-testid="apt-hero">
          <div className="ph-media">
            <img src={apt.foto[0]} alt={`${apt.nome}, La Columbera a Ravina`} />
          </div>
          <div className="wrap">
            <span className="eyebrow" data-reveal>La Columbera · Ravina, Trento</span>
            <h1 data-reveal data-reveal-delay="1">
              Appartamento <em>{aptShortName(apt)}</em>
            </h1>
            <p className="sub" data-reveal data-reveal-delay="2">{apt.sotto}</p>
          </div>
        </section>

        <section className="apt-body" data-testid="apt-body">
          <div className="wrap">
            <div className="apt-layout">
              <div>
                <div className="gallery-main" data-reveal>
                  <img
                    src={apt.foto[mainImg] ?? apt.foto[0]}
                    alt={`${apt.nome} — foto ${mainImg + 1}`}
                    data-testid="gallery-main-img"
                  />
                </div>
                <div className="gallery-thumbs" data-reveal data-reveal-delay="1" data-testid="gallery-thumbs">
                  {apt.foto.map((u, i) => (
                    <button
                      key={u}
                      type="button"
                      className={i === mainImg ? "on" : ""}
                      onClick={() => setMainImg(i)}
                      aria-label={`Mostra foto ${i + 1}`}
                      data-testid={`gallery-thumb-${i}`}
                    >
                      <img src={u} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
                <div className="chips" data-reveal data-reveal-delay="2">
                  <span>fino a {apt.max} ospiti</span>
                  <span>{apt.id === "torre" ? "due livelli" : "piano terra"}</span>
                  <span>{apt.inclusi} ospiti inclusi</span>
                  <span>minimo {apt.min} notti</span>
                  <span>check-in autonomo</span>
                </div>
                <div className="apt-desc" data-reveal data-reveal-delay="3">
                  <p>{apt.testo}</p>
                </div>
              </div>

              <div>
                <div className="book-card" data-reveal data-reveal-delay="1" data-testid="booking-card">
                  <div className="price">
                    da {eur(apt.base)} <small>a notte</small>
                  </div>
                  <p className="book-note">
                    {apt.inclusi} ospiti inclusi nel prezzo · ogni ospite extra +{eur(apt.extra)}{" "}
                    a notte · soggiorno minimo {apt.min} notti
                  </p>

                  {!online && !done && (
                    <div className="offline-note" data-testid="booking-offline">
                      <h3>Disponibilità e prenotazioni</h3>
                      <p>
                        La prenotazione online non è attiva in questo momento. Scrivici per
                        verificare la disponibilità:{" "}
                        <a href="mailto:info@lacolumbera.it">info@lacolumbera.it</a>
                      </p>
                    </div>
                  )}

                  {online && !done && (
                    <>
                      <div className="cal-head">
                        <button
                          type="button"
                          className="cal-nav"
                          onClick={() => setMonth(new Date(year, mo - 1, 1))}
                          aria-label="Mese precedente"
                          data-testid="cal-prev"
                        >
                          ‹
                        </button>
                        <b data-testid="cal-month">
                          {month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}
                        </b>
                        <button
                          type="button"
                          className="cal-nav"
                          onClick={() => setMonth(new Date(year, mo + 1, 1))}
                          aria-label="Mese successivo"
                          data-testid="cal-next"
                        >
                          ›
                        </button>
                      </div>
                      <div className="cal" data-testid="calendar">
                        {"LMMGVSD".split("").map((d, i) => (
                          <b key={i}>{d}</b>
                        ))}
                        {Array.from({ length: firstOffset }).map((_, i) => (
                          <i key={`e${i}`} />
                        ))}
                        {Array.from({ length: numDays }).map((_, i) => {
                          const iso = `${year}-${pad(mo + 1)}-${pad(i + 1)}`;
                          const disabled = iso < today || busy.has(iso);
                          const cls = [
                            "d",
                            disabled ? "x" : "",
                            iso === da || iso === a ? "s" : "",
                            da && a && iso > da && iso < a ? "r" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <div
                              key={iso}
                              className={cls}
                              onClick={() => pick(iso, disabled)}
                              data-testid={`cal-day-${iso}`}
                            >
                              {i + 1}
                              <small>{disabled ? "" : eur(nightPrice(apt, iso))}</small>
                            </div>
                          );
                        })}
                      </div>
                      <p className="quote-line" data-testid="quote">{quote}</p>
                      <form onSubmit={submit} data-testid="booking-form">
                        <div className="field">
                          <label htmlFor="ospiti">
                            Ospiti (max {apt.max})
                          </label>
                          <select
                            id="ospiti"
                            value={ospiti}
                            onChange={(e) => setOspiti(+e.target.value)}
                            data-testid="booking-guests"
                          >
                            {Array.from({ length: apt.max }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                {i + 1}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor="bk-nome">Nome e cognome</label>
                          <input
                            id="bk-nome"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            required
                            data-testid="booking-name"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="bk-email">Email</label>
                          <input
                            id="bk-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            data-testid="booking-email"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="bk-tel">Telefono</label>
                          <input
                            id="bk-tel"
                            value={tel}
                            onChange={(e) => setTel(e.target.value)}
                            data-testid="booking-phone"
                          />
                        </div>
                        <button
                          className="btn btn-wine"
                          style={{ width: "100%", justifyContent: "center" }}
                          disabled={sending}
                          data-testid="booking-submit"
                        >
                          {sending ? "Invio in corso…" : "Richiedi prenotazione"}
                        </button>
                        {err && (
                          <p className="form-err" data-testid="booking-error">{err}</p>
                        )}
                      </form>
                    </>
                  )}

                  {done && (
                    <div className="form-ok" data-testid="booking-success">
                      <h3>Richiesta inviata</h3>
                      <p>
                        Il tuo codice prenotazione è <b>{done.code}</b> (totale{" "}
                        {eur(done.totale)}). Conservalo: insieme alla tua email ti serve per
                        consultare la prenotazione nell'
                        <Link to="/area-clienti">area personale</Link>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {other && (
          <section className="contact" data-testid="apt-cross-cta">
            <div className="wrap">
              <div className="inner">
                <span className="section-eyebrow" data-reveal>La Columbera</span>
                <h2 data-reveal data-reveal-delay="1">
                  C'è anche l'appartamento {aptShortName(other)}
                </h2>
                <p data-reveal data-reveal-delay="2">
                  {other.sotto}. Nella stessa dimora storica a Ravina, con lo stesso carattere e
                  gli stessi comfort.
                </p>
                <div className="cta-row" data-reveal data-reveal-delay="3">
                  <Link className="btn btn-wine" to={`/${other.id}`} data-testid="cta-other-apt">
                    Scopri {aptShortName(other)}
                  </Link>
                  <a
                    className="btn btn-line-light"
                    href="mailto:info@lacolumbera.it"
                    data-testid="cta-email"
                  >
                    Scrivici una mail
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
