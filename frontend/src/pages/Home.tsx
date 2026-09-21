import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useReveal } from "@/hooks/useReveal";

export default function Home() {
  const location = useLocation();
  useReveal();

  useEffect(() => {
    document.title = "La Columbera · Dimora storica del XV secolo a Ravina, Trento";
  }, []);

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        const t = setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 80);
        return () => clearTimeout(t);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return (
    <>
      <SiteHeader />
      <main>
        {/* HERO */}
        <section className="hero" data-testid="hero">
          <div className="hero-media">
            <img
              src="/img/torre/Copia%20di%20Soggiorno%201.jpg"
              alt="Soggiorno con travi a vista dell'appartamento Torre a La Columbera"
            />
          </div>
          <div className="wrap">
            <div className="hero-copy">
              <span className="eyebrow" data-reveal>Ravina · Trento · dal XV secolo</span>
              <h1 data-reveal data-reveal-delay="1">
                <em>La Columbera</em>
                <br />
                una dimora storica
                <br />
                a due passi da Trento
              </h1>
              <p className="hero-lead" data-reveal data-reveal-delay="2">
                Un'antica villa nel caratteristico borgo di Ravina. Due appartamenti
                indipendenti, Torre e Corte, dove il fascino di cinque secoli di storia
                incontra il comfort di oggi.
              </p>
              <div className="hero-actions" data-reveal data-reveal-delay="3">
                <a className="btn btn-wine" href="#appartamenti" data-testid="hero-cta-appartamenti">
                  Scopri gli appartamenti <span className="arrow">→</span>
                </a>
                <a className="btn btn-line-light" href="#dimora" data-testid="hero-cta-dimora">
                  La dimora
                </a>
              </div>
            </div>
          </div>
          <div className="hero-scroll" aria-hidden="true">Scorri</div>
        </section>

        {/* LA DIMORA */}
        <section className="welcome" id="dimora" data-testid="section-dimora">
          <div className="wrap">
            <div className="grid">
              <div>
                <span className="section-eyebrow" data-reveal>Benvenuti</span>
                <h2 data-reveal data-reveal-delay="1">
                  A <em>La Columbera</em>, dove la storia si fa casa
                </h2>
                <p className="lead" data-reveal data-reveal-delay="2">
                  La Columbera è un'affascinante dimora storica risalente al XV secolo, nel
                  caratteristico borgo di Ravina, a Trento, nel cuore del Trentino-Alto Adige.
                </p>
                <div className="body">
                  <p data-reveal data-reveal-delay="3">
                    Offriamo un soggiorno in un ambiente ricco di storia e carattere, dove il
                    fascino di un'antica dimora si unisce al comfort e alla praticità di
                    appartamenti modernamente arredati. Un luogo ideale per chi desidera
                    scoprire Trento e il territorio trentino soggiornando in un contesto
                    autentico e tranquillo.
                  </p>
                  <p data-reveal data-reveal-delay="4">
                    La struttura dispone di due appartamenti indipendenti, <b>Torre</b> e{" "}
                    <b>Corte</b>, ciascuno con cucina attrezzata, bagno privato, zona living e
                    tutti i principali comfort per soggiorni brevi o più prolungati.
                  </p>
                </div>
              </div>
              <div className="figure-stack" data-reveal data-reveal-delay="2">
                <div className="fs-1">
                  <img
                    src="/img/torre/Copia%20di%20Matrimoniale%201.jpg"
                    alt="Camera matrimoniale nell'appartamento Torre"
                  />
                </div>
                <div className="fs-2">
                  <img
                    src="/img/corte/Copia%20di%20Soggiorno%201.jpg"
                    alt="Soggiorno dell'appartamento Corte"
                  />
                </div>
                <div className="badge">
                  <b>DAL 1400</b>
                  Cinque secoli di storia
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ACCOGLIENZA */}
        <section className="hospitality" data-testid="section-hospitality">
          <div className="wrap">
            <div className="grid">
              <div data-reveal>
                <span className="kicker">L'accoglienza</span>
                <p className="quote">
                  Ci piace accogliere i nostri ospiti in un ambiente autentico e curato,
                  cercando di rendere ogni soggiorno il più piacevole possibile.
                </p>
                <span className="sig">La famiglia de La Columbera</span>
              </div>
              <div data-reveal data-reveal-delay="2">
                <p>
                  Siamo disponibili durante la permanenza per <b>assistenza, informazioni e
                  consigli</b> su Trento e sul territorio: dalle attrazioni da visitare ai
                  luoghi dove mangiare, fino alle esperienze da non perdere.
                </p>
                <p>
                  Gli appartamenti sono pensati per offrire indipendenza e privacy, con accesso
                  esclusivo agli spazi interni del proprio alloggio.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* APPARTAMENTI */}
        <section className="apartments" id="appartamenti" data-testid="section-appartamenti">
          <div className="wrap">
            <div className="head">
              <span className="section-kicker" data-reveal>Gli spazi</span>
              <h2 data-reveal data-reveal-delay="1">
                Due appartamenti, <em>due storie</em>
              </h2>
              <p data-reveal data-reveal-delay="2">
                Ambienti indipendenti pensati per soggiorni brevi o più prolungati, con tutti i
                comfort di casa e il carattere di una dimora del XV secolo.
              </p>
            </div>
            <div className="apt-grid">
              <Link
                to="/torre"
                className="apt-card"
                data-reveal
                data-reveal-delay="1"
                data-testid="card-torre"
                aria-label="Vai alla pagina dell'appartamento Torre"
              >
                <figure>
                  <img
                    src="/img/torre/Copia%20di%20Matrimoniale%202.jpg"
                    alt="Camera matrimoniale dell'appartamento Torre"
                  />
                  <span className="apt-tag">Su due livelli</span>
                </figure>
                <div className="body">
                  <h3>
                    Appartamento <span className="n">Torre</span>
                  </h3>
                  <div className="meta">
                    <span>fino a 5 ospiti</span>
                    <span>2 livelli</span>
                    <span>famiglie &amp; gruppi</span>
                  </div>
                  <p>
                    Sviluppato su due piani, l'appartamento Torre è la scelta ideale per famiglie
                    o piccoli gruppi: ampio soggiorno, camere confortevoli e cucina attrezzata
                    per vivere la dimora in autonomia.
                  </p>
                  <div className="cta">
                    <span className="cta-link">
                      Scopri Torre <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </div>
              </Link>

              <Link
                to="/corte"
                className="apt-card"
                data-reveal
                data-reveal-delay="2"
                data-testid="card-corte"
                aria-label="Vai alla pagina dell'appartamento Corte"
              >
                <figure>
                  <img
                    src="/img/corte/Copia%20di%20Soggiorno%202.jpg"
                    alt="Soggiorno dell'appartamento Corte"
                  />
                  <span className="apt-tag">Piano terra</span>
                </figure>
                <div className="body">
                  <h3>
                    Appartamento <span className="n">Corte</span>
                  </h3>
                  <div className="meta">
                    <span>fino a 4 ospiti</span>
                    <span>piano terra</span>
                    <span>coppie &amp; amici</span>
                  </div>
                  <p>
                    Al piano terra della dimora, l'appartamento Corte accoglie coppie, famiglie e
                    piccoli gruppi di amici in ambienti curati, con accesso indipendente e ogni
                    comfort per sentirsi a casa.
                  </p>
                  <div className="cta">
                    <span className="cta-link">
                      Scopri Corte <span aria-hidden="true">→</span>
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* RAVINA */}
        <section className="ravina" id="ravina" data-testid="section-ravina">
          <div className="wrap">
            <div className="grid">
              <div className="content">
                <span className="section-kicker" data-reveal>La posizione</span>
                <h2 data-reveal data-reveal-delay="1">
                  Ravina, <em>alle porte di Trento</em>
                </h2>
                <p data-reveal data-reveal-delay="2">
                  La Columbera si trova a Ravina, un caratteristico borgo alle porte di Trento:
                  una zona tranquilla e piacevole, ideale per chi desidera soggiornare lontano
                  dal traffico pur rimanendo a breve distanza dal centro storico della città.
                </p>
                <p data-reveal data-reveal-delay="3">
                  Nelle vicinanze si trovano ristoranti, negozi e percorsi immersi nella natura.
                  La posizione è un ottimo punto di partenza per scoprire il territorio
                  trentino, tra montagne, sentieri, cantine e produttori locali dove assaporare
                  i vini e i sapori del Trentino.
                </p>
                <div className="facts" data-reveal data-reveal-delay="4">
                  <div className="fact">
                    <b>~ 5 min</b>
                    <span>in auto dal centro di Trento</span>
                  </div>
                  <div className="fact">
                    <b>50 m</b>
                    <span>dal parcheggio pubblico gratuito</span>
                  </div>
                  <div className="fact">
                    <b>XV sec.</b>
                    <span>anno di costruzione della dimora</span>
                  </div>
                  <div className="fact">
                    <b>2</b>
                    <span>appartamenti indipendenti</span>
                  </div>
                </div>
              </div>
              <figure className="fig" data-reveal data-reveal-delay="2">
                <img
                  src="/img/Trento1.jpg"
                  alt="Piazza Duomo a Trento, con la torre civica e la fontana del Nettuno"
                />
                <figcaption>Piazza Duomo, Trento — a pochi minuti da Ravina</figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* CONTATTI */}
        <section className="contact" id="contatti" data-testid="section-contatti">
          <div className="wrap">
            <div className="inner">
              <span className="section-eyebrow" data-reveal>Restiamo in contatto</span>
              <h2 data-reveal data-reveal-delay="1">Vi aspettiamo a La Columbera</h2>
              <p data-reveal data-reveal-delay="2">
                Per prenotare scegliete il vostro appartamento e inviate la richiesta
                direttamente dal sito: verifichiamo la disponibilità e vi rispondiamo in
                giornata. Per informazioni o un consiglio su Trento e dintorni, scriveteci —
                rispondiamo con piacere.
              </p>
              <div className="cta-row" data-reveal data-reveal-delay="3">
                <a className="btn btn-wine" href="#appartamenti" data-testid="cta-appartamenti">
                  Scopri gli appartamenti
                </a>
                <a className="btn btn-line-light" href="mailto:info@lacolumbera.it" data-testid="cta-email">
                  Scrivici una mail
                </a>
              </div>
              <div className="marks" data-reveal data-reveal-delay="4">
                <span>Ravina, Trento</span>
                <span>Check-in autonomo</span>
                <span>Parcheggio a 50&nbsp;m</span>
                <span>WiFi &amp; comfort</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
