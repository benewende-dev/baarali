import { CONTACT, legalLinks } from './legal-page.js';
import { PARADE, living } from './living-shapes.js';
import { logoTileLive, logoWord } from './logo.js';

// BAARALI(07/11/2026): one footer for the site's pages (the founder found the
// old one thin and still): the B alive, the download, everything the site
// has in four columns, what Baarali is made for, and who makes it. Links
// are written out (not imported from the pages) so no page imports another.

type Lang = 'fr' | 'en';

const WORDS = {
  fr: {
    line: 'Des agents qui travaillent pour vous. Vous gardez la main.',
    download: 'Télécharger Baarali',
    start: 'Créer mon compte gratuit',
    plans: 'Voir les forfaits',
    product: 'Produit',
    productLinks: [['Ce qu’il fait', '/#fonctions'], ['Dans l’app', '/#app'], ['Les modèles', '/#modeles'], ['Vos agents', '/#agents'], ['Vous gardez la main', '/#controle'], ['Télécharger', '/#telecharger']],
    pricing: 'Forfaits',
    pricingLinks: [['Découverte, gratuit', '/tarifs'], ['Semaine, Essentiel, Pro', '/tarifs'], ['Ce que chaque forfait ouvre', '/tarifs#comparer'], ['Crédits médias', '/tarifs#medias'], ['Entreprises et institutions', '/tarifs#entreprises'], ['L’utilisation, toutes les 5 h', '/tarifs#utilisation']],
    company: 'Baarali',
    companyLinks: [['Questions', '/#questions'], ['Devenir partenaire', '/partenaires']],
    legal: 'Légal',
    made: ['Prix en F CFA et en euros', 'Français et anglais', 'Données hébergées en Europe', 'Mac et Windows · téléphone bientôt'],
    by: 'Baarali est un produit d’OpenBaara.',
  },
  en: {
    line: 'Agents that work for you. You stay in control.',
    download: 'Download Baarali',
    start: 'Create my free account',
    plans: 'See the plans',
    product: 'Product',
    productLinks: [['What it does', '/#fonctions'], ['In the app', '/#app'], ['The models', '/#modeles'], ['Your agents', '/#agents'], ['You stay in control', '/#controle'], ['Download', '/#telecharger']],
    pricing: 'Plans',
    pricingLinks: [['Découverte, free', '/tarifs'], ['Semaine, Essentiel, Pro', '/tarifs'], ['What each plan opens', '/tarifs#comparer'], ['Media credits', '/tarifs#medias'], ['Companies and institutions', '/tarifs#entreprises'], ['Usage, every 5 hours', '/tarifs#utilisation']],
    company: 'Baarali',
    companyLinks: [['Questions', '/#questions'], ['Become a partner', '/partenaires']],
    legal: 'Legal',
    made: ['Prices in CFA francs and euros', 'French and English', 'Data hosted in Europe', 'Mac and Windows · phone soon'],
    by: 'Baarali is a product of OpenBaara.',
  },
} as const;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const list = (links: ReadonlyArray<readonly [string, string]>) => links.map(([label, href]) => `<li><a href="${href}">${escape(label)}</a></li>`).join('');

/** `download`: the download section when a release is out; null before, and the button offers the account. */
export function siteFooter(lang: Lang, acceptLanguage: string | null, download: string | null): string {
  const w = WORDS[lang];
  const product = w.productLinks.filter(([, href]) => download || !href.endsWith('#telecharger'));
  const cta = download ? `<a class="sf-btn" href="${download}">${escape(w.download)}</a>` : `<a class="sf-btn" href="/auth/v1/sign-in">${escape(w.start)}</a>`;
  return `<footer class="sf">
  <div class="wrap">
    <div class="sf-top">
      <div class="sf-brand">
        <a class="sf-logo" href="/" aria-label="Baarali">${logoTileLive(52)}${logoWord(30)}</a>
        <p>${escape(w.line)}</p>
        <div class="sf-ctas">${cta}<a class="sf-btn sf-ghost" href="/tarifs">${escape(w.plans)}</a></div>
      </div>
      <div class="sf-parade" aria-hidden="true">${PARADE.map((p) => living(p.shape, p.color, Math.round(p.size * 0.72))).join('')}</div>
    </div>
    <div class="sf-cols">
      <div><h4>${escape(w.product)}</h4><ul>${list(product)}</ul></div>
      <div><h4>${escape(w.pricing)}</h4><ul>${list(w.pricingLinks)}</ul></div>
      <div><h4>${escape(w.company)}</h4><ul>${list(w.companyLinks)}<li><a href="mailto:${CONTACT}">${CONTACT}</a></li></ul></div>
      <div><h4>${escape(w.legal)}</h4><ul>${legalLinks(acceptLanguage).map((l) => `<li><a href="${l.href}">${escape(l.label)}</a></li>`).join('')}</ul></div>
    </div>
    <ul class="sf-made">${w.made.map((m) => `<li>${escape(m)}</li>`).join('')}</ul>
    <div class="sf-legal"><span>© ${new Date().getFullYear()} OpenBaara SAS · Burkina Faso</span><span>${escape(w.by)}</span></div>
  </div>
</footer>`;
}

/** Its style, read from the page's own colours (--ink, --night, --line…), in both themes. */
export const SITE_FOOTER_CSS = `
.sf { background:var(--night); border-top:1px solid var(--night-line); color:var(--night-muted); padding-block:72px 36px; margin-top:104px; font-size:14.5px; }
.sf a { color:inherit; text-decoration:none; }
.sf a:hover { color:var(--ink); }
.sf-top { display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:32px; padding-bottom:44px; border-bottom:1px solid var(--night-line); }
.sf-logo { display:inline-flex; align-items:center; gap:14px; color:var(--ink) !important; }
.sf-brand p { margin:16px 0 0; max-width:40ch; font-size:17px; color:var(--text); }
.sf-ctas { display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }
.sf-btn { display:inline-flex; align-items:center; min-height:44px; padding:10px 18px; border-radius:999px; font-weight:650; background:var(--ink); color:var(--on-ink) !important; }
.sf-btn:hover { opacity:.9; }
.sf-ghost { background:transparent; color:var(--ink) !important; border:1px solid var(--night-line); }
.sf-ghost:hover { border-color:var(--hover-line); }
.sf-parade { display:flex; align-items:flex-end; gap:12px; }
.sf-parade svg { animation:sf-bob 2.8s ease-in-out infinite; }
.sf-parade svg:nth-child(2) { animation-delay:.4s; } .sf-parade svg:nth-child(3) { animation-delay:.8s; }
.sf-parade svg:nth-child(4) { animation-delay:1.2s; } .sf-parade svg:nth-child(5) { animation-delay:1.6s; }
@keyframes sf-bob { 0%, 100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
.sf-cols { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:32px; padding-block:44px; }
.sf h4 { margin:0 0 14px; color:var(--ink); font-size:14px; font-weight:650; }
.sf ul { list-style:none; margin:0; padding:0; }
.sf-cols ul { display:flex; flex-direction:column; gap:10px; }
.sf-made { display:flex; flex-wrap:wrap; gap:8px; padding-bottom:28px; }
.sf-made li { border:1px solid var(--night-line); border-radius:999px; padding:6px 14px; font-size:13.5px; color:var(--text); }
.sf-legal { display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; padding-top:24px; border-top:1px solid var(--night-line); font-size:13.5px; }
@media (max-width: 860px) { .sf-cols { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .sf-cols { grid-template-columns:minmax(0, 1fr); } .sf-parade { display:none; } }
@media (prefers-reduced-motion: reduce) { .sf-parade svg { animation:none; } }
`;
