import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

export function SiteHeader({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <header className={`site-header${scrolled || solid ? " is-scrolled" : ""}`} data-testid="site-header">
      <div className="wrap">
        <Link className="brand" to="/" aria-label="La Columbera, torna alla home" data-testid="brand-link">
          <img src="/img/brand/logo.png" alt="La Columbera · Abitazione in villa storica" className="brand-logo-color" />
          <img src="/img/brand/logo-light.png" alt="" aria-hidden="true" className="brand-logo-light" />
          <span className="brand-word">La Columbera</span>
        </Link>
        <nav
          className={`nav-links${open ? " is-open" : ""}`}
          id="nav-links"
          data-testid="primary-nav"
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName === "A") setOpen(false);
          }}
        >
          <Link to="/#dimora" data-testid="nav-dimora">La dimora</Link>
          <Link to="/#appartamenti" data-testid="nav-appartamenti">Appartamenti</Link>
          <Link to="/#ravina" data-testid="nav-ravina">Ravina</Link>
          <Link to="/#contatti" data-testid="nav-contatti">Contatti</Link>
          <Link to="/torre" className="only-mobile" data-testid="nav-app-torre">App. Torre</Link>
          <Link to="/corte" className="only-mobile" data-testid="nav-app-corte">App. Corte</Link>
          <Link to="/area-clienti" className="only-mobile" data-testid="nav-area-personale">Area personale</Link>
          <Link className="nav-cta" to="/#contatti" data-testid="nav-cta-prenota">Richiedi soggiorno</Link>
        </nav>
        <button
          className="menu-toggle"
          aria-label="Apri il menu"
          aria-expanded={open}
          aria-controls="nav-links"
          data-testid="menu-toggle"
          onClick={() => setOpen(!open)}
        >
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>
  );
}
