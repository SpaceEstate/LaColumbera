import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <div className="footer-brand-mark">
            <img src="/img/brand/logo-light.png" alt="La Columbera" />
          </div>
          <p className="footer-tag">
            Dimora storica del XV secolo a Ravina, alle porte di Trento. Due appartamenti
            indipendenti, Torre e Corte.
          </p>
        </div>
        <div className="footer-col">
          <h4>La dimora</h4>
          <Link to="/#dimora">La Columbera</Link>
          <Link to="/torre">Appartamento Torre</Link>
          <Link to="/corte">Appartamento Corte</Link>
          <Link to="/#ravina">Ravina e dintorni</Link>
        </div>
        <div className="footer-col">
          <h4>Contatti</h4>
          <a href="tel:+393517043594">+39 351 704 3594</a>
          <a href="mailto:info@lacolumbera.it">info@lacolumbera.it</a>
          <Link to="/area-clienti">Area clienti</Link>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>© {new Date().getFullYear()} La Columbera · Ravina, Trento</span>
        <span>Struttura ricettiva extra-alberghiera</span>
      </div>
    </footer>
  );
}
