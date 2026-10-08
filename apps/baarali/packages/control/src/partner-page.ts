import { CONTACT } from './legal-page.js';
import { FAVICON, logoTile, logoTileLive, logoWord, LOGO_ALIVE_CSS, LOGO_ALIVE_JS } from './logo.js';
import { PAYOUT_METHODS, PAYOUT_WORDS, type ProgramRules } from './partners.js';
import { pickLang } from './sign-in-page.js';

// The partner programme's pages (mockup validated 07/10/2026): the public
// page that makes a creator want to join and lets them apply, and the
// partner's own space, behind their sign-in, with their link and earnings.

type Lang = 'fr' | 'en';

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pct = (x: number) => `${Math.round(x * 1000) / 10} %`;
const cfa = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n).replace(/ /g, ' ')} F CFA`;

export const PARTNERS_PATH = '/partenaires';
export const PARTNER_SPACE_PATH = '/partenaire';

const SUN = '<svg class="i sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
const MOON = '<svg class="i moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

/** The site's palette and type (home-page.ts), in both themes, and what both pages share. */
const BASE_CSS = `
@font-face { font-family:"Inter"; src:url(/assets/inter.woff2) format("woff2"); font-weight:400 800; font-display:swap; }
@font-face { font-family:"Source Serif 4"; src:url(/assets/source-serif-4.woff2) format("woff2"); font-weight:400 700; font-style:normal; font-display:swap; }
:root { --paper:#ffffff; --mist:#f5f5f5; --surface:#ffffff; --line:#e7e7e7; --ink:#0d0d0d; --on-ink:#ffffff; --text:#2b2b2b; --muted:#5d5d5d; --blue:#1a6dff; --blue-deep:#155eef; --blue-soft:#eef3ff; --blue-line:#d3e0ff; --top-bg:rgb(255 255 255 / .85); --ok:#14804a; --ok-soft:#e8f5ee; --bad:#c62828; --warn:#a15c00; --warn-soft:#fff4e0; color-scheme:light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper:#212121; --mist:#1a1a1a; --surface:#2a2a2a; --line:#333333; --ink:#ececec; --on-ink:#0d0d0d; --text:#d4d4d4; --muted:#a6a6a6; --blue:#4d8dff; --blue-deep:#1a6dff; --blue-soft:#1d2738; --blue-line:#2f4670; --top-bg:rgb(33 33 33 / .85); --ok:#4cc38a; --ok-soft:#173326; --bad:#ff7b7b; --warn:#f0b35a; --warn-soft:#3a2a12; color-scheme:dark; } }
:root[data-theme="dark"] { --paper:#212121; --mist:#1a1a1a; --surface:#2a2a2a; --line:#333333; --ink:#ececec; --on-ink:#0d0d0d; --text:#d4d4d4; --muted:#a6a6a6; --blue:#4d8dff; --blue-deep:#1a6dff; --blue-soft:#1d2738; --blue-line:#2f4670; --top-bg:rgb(33 33 33 / .85); --ok:#4cc38a; --ok-soft:#173326; --bad:#ff7b7b; --warn:#f0b35a; --warn-soft:#3a2a12; color-scheme:dark; }
* { box-sizing:border-box; }
body { margin:0; background:var(--paper); color:var(--text); font:16px/1.65 "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
a { color:inherit; }
.wrap { max-width:1120px; margin:0 auto; padding-inline:20px; }
.i { width:18px; height:18px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.top { position:sticky; top:env(safe-area-inset-top, 0px); z-index:20; background:var(--top-bg); backdrop-filter:saturate(1.6) blur(14px); -webkit-backdrop-filter:saturate(1.6) blur(14px); border-bottom:1px solid var(--line); }
.top .wrap { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:68px; }
.brand { display:flex; align-items:center; gap:10px; color:var(--ink); text-decoration:none; }
.menu { display:flex; align-items:center; gap:10px; font-size:14.5px; }
.menu a { text-decoration:none; color:var(--muted); padding:8px 10px; }
.menu a:hover { color:var(--ink); }
.menu .btn { color:var(--on-ink); background:var(--ink); border-radius:999px; padding:9px 16px; font-weight:650; }
.theme { display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; border-radius:50%; border:1px solid var(--line); background:var(--surface); color:var(--ink); cursor:pointer; padding:0; }
.theme .moon, :root[data-theme="dark"] .theme .sun { display:none; }
:root[data-theme="dark"] .theme .moon { display:block; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .theme .sun { display:none; } :root:not([data-theme="light"]) .theme .moon { display:block; } }
h1, h2 { font-family:"Source Serif 4", Georgia, serif; font-weight:500; color:var(--ink); letter-spacing:-.02em; text-wrap:balance; margin:0; }
h1 em { font-style:normal; color:var(--blue); }
.kicker { display:inline-flex; align-items:center; gap:8px; margin:0 0 14px; font-size:13px; font-weight:650; letter-spacing:.08em; text-transform:uppercase; color:var(--blue-deep); }
.kicker::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--blue); }
.card { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:22px; min-width:0; }
.cta { display:inline-flex; align-items:center; justify-content:center; background:var(--blue-deep); color:#fff; text-decoration:none; font-weight:650; border:0; border-radius:999px; padding:12px 20px; font:inherit; font-weight:650; cursor:pointer; }
.cta.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
.cta:disabled { opacity:.6; cursor:default; }
label.f { display:flex; flex-direction:column; gap:6px; font-size:13px; font-weight:600; color:var(--muted); }
input, select, textarea { font:inherit; font-size:16px; color:var(--ink); background:var(--paper); border:1px solid var(--line); border-radius:10px; padding:10px 12px; width:100%; }
textarea { min-height:90px; resize:vertical; }
.num { font-variant-numeric:tabular-nums; }
footer { background:var(--mist); color:var(--muted); margin-top:88px; padding-block:36px; font-size:14px; border-top:1px solid var(--line); }
footer .wrap { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; }
footer .brand { color:var(--ink); }
:focus-visible { outline:2px solid var(--blue); outline-offset:3px; border-radius:6px; }
@media (max-width: 560px) { .menu a:not(.btn) { display:none; } .menu .btn { padding:8px 13px; font-size:13.5px; } .top .wrap { gap:10px; } }
`;

function shell(opts: { lang: Lang; nonce: string; title: string; description: string; css: string; body: string; js: string; menu: string }): string {
  return `<!doctype html>
<html lang="${opts.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(opts.title)}</title>
<meta name="description" content="${escape(opts.description)}">
<link rel="icon" href="${FAVICON}">
<script nonce="${opts.nonce}">
try { const v = localStorage.getItem("baarali-theme"); if (v === "light" || v === "dark") document.documentElement.dataset.theme = v; } catch {}
</script>
<style nonce="${opts.nonce}">${BASE_CSS}${opts.css}
${LOGO_ALIVE_CSS}
</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="/">${logoTileLive(32)}${logoWord(25)}</a>
    <nav class="menu" aria-label="Baarali">${opts.menu}<button class="theme" type="button" aria-label="Thème" title="Thème">${SUN}${MOON}</button></nav>
  </div>
</header>
<main>
${opts.body}
</main>
<footer>
  <div class="wrap">
    <a class="brand" href="/">${logoTile(28)}${logoWord(22)}</a>
    <span>${CONTACT}</span>
  </div>
</footer>
<script nonce="${opts.nonce}">
"use strict";
const root = document.documentElement;
document.querySelector(".theme").addEventListener("click", () => {
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("baarali-theme", root.dataset.theme); } catch {}
});
${opts.js}
${LOGO_ALIVE_JS}
</script>
</body>
</html>`;
}

const PUBLIC_WORDS = {
  fr: {
    title: 'Programme partenaires — Baarali',
    description: 'Parlez de Baarali à votre communauté et gagnez une part de chaque abonnement, chaque mois, payée par mobile money.',
    home: 'Accueil',
    prices: 'Tarifs',
    space: 'Mon espace',
    kicker: 'Programme partenaires',
    h1: (max: string, months: number) => `Parlez de Baarali. Gagnez <em>jusqu’à ${max}</em> de chaque paiement, pendant ${months} mois.`,
    lead: 'Vous créez du contenu sur la tech, l’entrepreneuriat ou le digital, au Burkina, en Côte d’Ivoire, au Sénégal, au Mali ou ailleurs ? Partagez votre lien. Chaque personne qui s’abonne vous rapporte chaque mois, payé par mobile money.',
    apply: 'Devenir partenaire',
    rulesLink: 'Lire les règles',
    calcTitle: 'Simulez vos gains, par mois',
    calcLabel: 'Abonnés Essentiel amenés',
    calcNote: (tier: string, rate: string, price: string) => `au palier ${tier} (${rate}), soit ${rate} de ${price} par client et par mois`,
    tiersTitle: 'Plus vous amenez de clients, plus votre part monte',
    tiers: (from: number) => `dès ${from} clients payants`,
    first: 'dès le 1er client',
    tierNames: ['Base', 'Argent', 'Or'],
    steps: [
      ['Postulez', 'Quelques lignes sur vous et votre public. Nous répondons sous quelques jours.'],
      ['Partagez', 'Votre lien et votre code. Vos abonnés reçoivent un cadeau à l’inscription.'],
      ['Soyez payé', 'Chaque début de mois, par Orange Money, Wave, Moov ou MTN.'],
    ],
    gift: (plan: string, days: number) => `Vos abonnés reçoivent ${plan} offert ${days} jours à l’inscription.`,
    facts: (hold: number, min: string, cookie: number) =>
      `Une commission devient payable ${hold} jours après le paiement du client, dès ${min}. Votre lien garde le visiteur ${cookie} jours. Comptent les forfaits et les packs de crédits médias, hors taxes ; un client remboursé ne compte pas.`,
    rulesTitle: 'Les règles, en clair',
    expect: 'Ce que nous attendons',
    expectList: [
      'Dire que c’est un partenariat (« lien partenaire », « #partenaire »).',
      'Montrer ce que Baarali fait vraiment, avec vos propres essais.',
      'Parler à votre public, là où il vous suit.',
    ],
    end: 'Ce qui met fin au partenariat',
    endList: [
      'Promettre ce que Baarali ne fait pas, ou des gains d’argent.',
      'Utiliser l’image ou la voix de quelqu’un sans son accord.',
      'Faux comptes, spam, publicité payante sur le nom Baarali, être son propre client.',
    ],
    formTitle: 'Postuler',
    formLead: 'Nous lisons chaque candidature. Si votre public correspond, vous recevez votre lien par email.',
    name: 'Votre nom ou celui de votre chaîne',
    email: 'Email',
    phone: 'Téléphone (facultatif)',
    network: 'Votre réseau principal',
    profile: 'Lien vers votre profil',
    audience: 'Taille de votre public',
    audiences: ['Moins de 5 000', '5 000 à 50 000', '50 000 à 500 000', 'Plus de 500 000'],
    city: 'Ville et pays',
    message: 'Comment parlerez-vous de Baarali ? (facultatif)',
    send: 'Envoyer ma candidature',
    sent: 'Merci ! Votre candidature est arrivée. Nous vous répondons par email.',
    failed: 'L’envoi n’a pas marché. Vérifiez les champs et réessayez.',
  },
  en: {
    title: 'Partner programme — Baarali',
    description: 'Tell your community about Baarali and earn a share of every subscription, every month, paid by mobile money.',
    home: 'Home',
    prices: 'Pricing',
    space: 'My space',
    kicker: 'Partner programme',
    h1: (max: string, months: number) => `Talk about Baarali. Earn <em>up to ${max}</em> of every payment, for ${months} months.`,
    lead: 'You create content about tech, business or digital in Burkina Faso, Côte d’Ivoire, Senegal, Mali or elsewhere? Share your link. Everyone who subscribes earns you money every month, paid by mobile money.',
    apply: 'Become a partner',
    rulesLink: 'Read the rules',
    calcTitle: 'Estimate your monthly earnings',
    calcLabel: 'Essentiel subscribers brought',
    calcNote: (tier: string, rate: string, price: string) => `at the ${tier} tier (${rate}), that is ${rate} of ${price} per client per month`,
    tiersTitle: 'The more clients you bring, the higher your share',
    tiers: (from: number) => `from ${from} paying clients`,
    first: 'from the first client',
    tierNames: ['Base', 'Silver', 'Gold'],
    steps: [
      ['Apply', 'A few lines about you and your audience. We answer within a few days.'],
      ['Share', 'Your link and your code. Your audience gets a gift when they sign up.'],
      ['Get paid', 'At the start of each month, by Orange Money, Wave, Moov or MTN.'],
    ],
    gift: (plan: string, days: number) => `Your audience gets ${plan} free for ${days} days when they sign up.`,
    facts: (hold: number, min: string, cookie: number) =>
      `A commission becomes payable ${hold} days after the client’s payment, from ${min}. Your link remembers the visitor for ${cookie} days. Plans and media credit packs count, excluding taxes; a refunded client does not.`,
    rulesTitle: 'The rules, plainly',
    expect: 'What we expect',
    expectList: [
      'Say it is a partnership (“partner link”, “#partner”).',
      'Show what Baarali really does, with your own tries.',
      'Talk to your audience, where they follow you.',
    ],
    end: 'What ends the partnership',
    endList: [
      'Promising what Baarali does not do, or money gains.',
      'Using someone’s face or voice without their consent.',
      'Fake accounts, spam, paid ads on the Baarali name, being your own client.',
    ],
    formTitle: 'Apply',
    formLead: 'We read every application. If your audience fits, you get your link by email.',
    name: 'Your name or your channel’s',
    email: 'Email',
    phone: 'Phone (optional)',
    network: 'Your main network',
    profile: 'Link to your profile',
    audience: 'Audience size',
    audiences: ['Under 5,000', '5,000 to 50,000', '50,000 to 500,000', 'Over 500,000'],
    city: 'City and country',
    message: 'How will you talk about Baarali? (optional)',
    send: 'Send my application',
    sent: 'Thank you! Your application arrived. We will answer by email.',
    failed: 'Sending failed. Check the fields and try again.',
  },
} as const;

export const AUDIENCE_SIZES = ['xs', 's', 'm', 'l'] as const;
export type AudienceSize = (typeof AUDIENCE_SIZES)[number];
export const NETWORKS = ['TikTok', 'YouTube', 'Instagram', 'Facebook', 'WhatsApp', 'X', 'LinkedIn', 'Autre'] as const;

export interface PublicPartnerData {
  rules: ProgramRules;
  /** Essentiel's monthly price in CFA francs, for the simulator. */
  essentielXof: number;
  /** The offered plan's name, or null when there is no gift. */
  giftPlan: string | null;
}

export function partnersPage(data: PublicPartnerData, opts: { lang: string | null; nonce: string }): string {
  const lang = pickLang(opts.lang);
  const t = PUBLIC_WORDS[lang];
  const r = data.rules;
  const tiers: Array<[string, number, string]> = [
    [t.tierNames[0], r.baseRate, t.first],
    [t.tierNames[1], r.silverRate, t.tiers(r.silverFrom)],
    [t.tierNames[2], r.goldRate, t.tiers(r.goldFrom)],
  ];
  const css = `
.hero { background:var(--mist); border-bottom:1px solid var(--line); padding-block:64px 56px; }
.hero .wrap { display:grid; grid-template-columns:minmax(0, 1.25fr) minmax(0, 1fr); gap:40px; align-items:center; }
.hero h1 { font-size:clamp(34px, 5vw, 54px); line-height:1.06; }
.lead { margin:18px 0 0; color:var(--muted); font-size:18px; max-width:56ch; }
.row { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
.calc output { display:block; font:500 40px/1.1 "Source Serif 4", Georgia, serif; color:var(--ink); margin:14px 0 4px; font-variant-numeric:tabular-nums; }
.calc small { color:var(--muted); font-size:13px; }
.calc input[type=range] { padding:0; border:0; background:none; accent-color:var(--blue); }
.calc .n { color:var(--ink); }
section.block { padding-top:64px; }
section.block > h2 { font-size:clamp(26px, 3.4vw, 36px); margin-bottom:22px; }
.tiers, .steps { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; }
.tiers b { display:block; font:500 40px/1.1 "Source Serif 4", Georgia, serif; color:var(--ink); margin:6px 0; }
.tiers small, .steps p { color:var(--muted); }
.tiers .card:last-child { border-color:var(--blue-line); background:var(--blue-soft); }
.steps em { font:650 13px "Inter", sans-serif; font-style:normal; color:var(--blue-deep); }
.steps b { display:block; color:var(--ink); font-size:17px; margin:4px 0; }
.steps p { margin:0; font-size:15px; }
.facts { margin:16px 0 0; color:var(--muted); font-size:15px; max-width:80ch; }
.gift { display:inline-block; margin-top:16px; background:var(--blue-soft); border:1px solid var(--blue-line); color:var(--ink); border-radius:12px; padding:10px 14px; font-weight:550; }
.rules { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.rules ul { margin:10px 0 0; padding-left:20px; }
.rules li { margin:6px 0; }
.rules h3 { margin:0; font-size:16px; }
.ok-t { color:var(--ok); } .bad-t { color:var(--bad); }
form.apply { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
form.apply .wide { grid-column:1/-1; }
form.apply .hp { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
#a-done { margin:0; font-weight:600; }
#a-done.ok { color:var(--ok); } #a-done.bad { color:var(--bad); }
@media (max-width: 860px) { .hero .wrap, .tiers, .steps, .rules, form.apply { grid-template-columns:minmax(0, 1fr); } }
`;
  const body = `
<div class="hero">
  <div class="wrap">
    <div>
      <p class="kicker">${escape(t.kicker)}</p>
      <h1>${t.h1(escape(pct(r.goldRate)), r.months)}</h1>
      <p class="lead">${escape(t.lead)}</p>
      <div class="row"><a class="cta" href="#postuler">${escape(t.apply)}</a><a class="cta ghost" href="#regles">${escape(t.rulesLink)}</a></div>
    </div>
    <div class="card calc">
      <label class="f" for="calc-n">${escape(t.calcTitle)}</label>
      <small>${escape(t.calcLabel)} : <b class="n" id="calc-out">50</b></small>
      <input type="range" id="calc-n" min="1" max="300" value="50">
      <output id="calc-gain" class="num"></output>
      <small id="calc-note"></small>
    </div>
  </div>
</div>
<div class="wrap">
  <section class="block">
    <h2>${escape(t.tiersTitle)}</h2>
    <div class="tiers">${tiers.map(([name, rate, from]) => `<div class="card"><small>${escape(name)}</small><b>${escape(pct(rate))}</b><small>${escape(from)}</small></div>`).join('')}</div>
    <p class="facts">${escape(t.facts(r.holdDays, cfa(r.payoutMinXof), r.cookieDays))}</p>
    ${data.giftPlan ? `<p class="gift">🎁 ${escape(t.gift(data.giftPlan, r.giftDays))}</p>` : ''}
  </section>
  <section class="block">
    <div class="steps">${t.steps.map(([b, p], i) => `<div class="card"><em>${i + 1}</em><b>${escape(b)}</b><p>${escape(p)}</p></div>`).join('')}</div>
  </section>
  <section class="block" id="regles">
    <h2>${escape(t.rulesTitle)}</h2>
    <div class="rules">
      <div class="card"><h3 class="ok-t">${escape(t.expect)}</h3><ul>${t.expectList.map((x) => `<li>${escape(x)}</li>`).join('')}</ul></div>
      <div class="card"><h3 class="bad-t">${escape(t.end)}</h3><ul>${t.endList.map((x) => `<li>${escape(x)}</li>`).join('')}</ul></div>
    </div>
  </section>
  <section class="block" id="postuler">
    <h2>${escape(t.formTitle)}</h2>
    <div class="card">
      <p class="facts" style="margin:0 0 18px">${escape(t.formLead)}</p>
      <form class="apply" id="apply">
        <label class="f">${escape(t.name)}<input name="name" required maxlength="60" autocomplete="name"></label>
        <label class="f">${escape(t.email)}<input name="email" type="email" required maxlength="200" autocomplete="email"></label>
        <label class="f">${escape(t.network)}<select name="network">${NETWORKS.map((n) => `<option>${n}</option>`).join('')}</select></label>
        <label class="f">${escape(t.profile)}<input name="profile" type="url" required maxlength="300" placeholder="https://"></label>
        <label class="f">${escape(t.audience)}<select name="audience">${AUDIENCE_SIZES.map((a, i) => `<option value="${a}">${escape(t.audiences[i])}</option>`).join('')}</select></label>
        <label class="f">${escape(t.city)}<input name="city" maxlength="60" placeholder="Ouagadougou, Burkina Faso"></label>
        <label class="f">${escape(t.phone)}<input name="phone" type="tel" maxlength="24" autocomplete="tel" placeholder="+226…"></label>
        <label class="hp" aria-hidden="true">Site<input name="website" tabindex="-1" autocomplete="off"></label>
        <label class="f wide">${escape(t.message)}<textarea name="message" maxlength="500"></textarea></label>
        <div class="wide row" style="margin:0;align-items:center"><button class="cta" type="submit">${escape(t.send)}</button><p id="a-done" role="status"></p></div>
      </form>
    </div>
  </section>
</div>`;
  const js = `
const T = ${JSON.stringify({ sent: t.sent, failed: t.failed, tiers: t.tierNames, note: lang })};
const R = ${JSON.stringify({ base: r.baseRate, silver: r.silverRate, gold: r.goldRate, silverFrom: r.silverFrom, goldFrom: r.goldFrom, price: data.essentielXof })};
const nf = new Intl.NumberFormat(${JSON.stringify(lang === 'fr' ? 'fr-FR' : 'en-US')});
const pctText = (x) => nf.format(Math.round(x * 1000) / 10) + " %";
function calc() {
  const k = Number(document.getElementById("calc-n").value);
  const i = k >= R.goldFrom ? 2 : k >= R.silverFrom ? 1 : 0;
  const rate = [R.base, R.silver, R.gold][i];
  document.getElementById("calc-out").textContent = String(k);
  document.getElementById("calc-gain").textContent = nf.format(Math.round(k * R.price * rate)) + " F CFA";
  const rt = pctText(rate), price = nf.format(R.price) + " F";
  document.getElementById("calc-note").textContent = T.note === "fr"
    ? "au palier " + T.tiers[i] + " (" + rt + "), soit " + rt + " de " + price + " par client et par mois"
    : "at the " + T.tiers[i] + " tier (" + rt + "), that is " + rt + " of " + price + " per client per month";
}
document.getElementById("calc-n").addEventListener("input", calc);
calc();
const form = document.getElementById("apply");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const done = document.getElementById("a-done");
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const res = await fetch(${JSON.stringify(`${PARTNERS_PATH}/candidature`)}, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || T.failed);
    form.reset(); done.className = "ok"; done.textContent = T.sent;
  } catch (err) { done.className = "bad"; done.textContent = err.message || T.failed; }
  finally { button.disabled = false; }
});`;
  return shell({
    lang,
    nonce: opts.nonce,
    title: t.title,
    description: t.description,
    css,
    body,
    js,
    menu: `<a href="/">${escape(t.home)}</a><a href="/tarifs">${escape(t.prices)}</a><a class="btn" href="${PARTNER_SPACE_PATH}">${escape(t.space)}</a>`,
  });
}

/** The partner's own space: the page is static, its figures come from /partenaire/api. */
export function partnerSpacePage(opts: { nonce: string; publicSite: string }): string {
  const css = `
.page { padding-block:40px; }
.page h1 { font-size:clamp(30px, 4vw, 42px); }
.sub { margin:8px 0 0; color:var(--muted); max-width:70ch; }
.grid { display:grid; grid-template-columns:minmax(0, 1.3fr) minmax(0, 1fr); gap:16px; margin-top:16px; }
.stack { display:flex; flex-direction:column; gap:16px; min-width:0; }
.kpis { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin-top:16px; }
.kpis div { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:16px; }
.kpis b { display:block; font:500 28px/1.15 "Source Serif 4", Georgia, serif; color:var(--ink); font-variant-numeric:tabular-nums; }
.kpis span { color:var(--muted); font-size:13px; }
.card h2 { font-size:22px; margin-bottom:6px; }
.hint { color:var(--muted); font-size:14px; margin:0 0 14px; }
.link { display:flex; gap:10px; align-items:center; border:1px solid var(--blue-line); background:var(--blue-soft); border-radius:12px; padding:10px 12px; margin-top:24px; }
.link code { flex:1; font:600 15px ui-monospace, Menlo, monospace; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.small { padding:7px 14px; font-size:14px; }
.tiers { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; }
.tiers div { border:1px solid var(--line); border-radius:12px; padding:12px; }
.tiers div.on { border-color:var(--blue); background:var(--blue-soft); }
.tiers b { display:block; font:500 26px/1.15 "Source Serif 4", Georgia, serif; color:var(--ink); }
.tiers small { color:var(--muted); font-size:12.5px; }
.next { margin:12px 0 0; color:var(--muted); font-size:14px; }
.tablewrap { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:14.5px; font-variant-numeric:tabular-nums; }
th, td { text-align:left; padding:10px; border-bottom:1px solid var(--line); white-space:nowrap; }
th { color:var(--muted); font-size:12px; font-weight:650; letter-spacing:.05em; text-transform:uppercase; }
td.r, th.r { text-align:right; }
.pill { display:inline-block; font-size:12.5px; padding:2px 9px; border-radius:99px; background:var(--mist); }
.pill.ready { background:var(--blue-soft); color:var(--blue-deep); }
.pill.paid { background:var(--ok-soft); color:var(--ok); }
.form { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.saved { margin:10px 0 0; font-size:14px; min-height:1.4em; }
.notice { background:var(--warn-soft); color:var(--warn); border-radius:12px; padding:12px 14px; margin-top:16px; font-size:14.5px; }
.empty { color:var(--muted); }
[hidden] { display:none !important; }
@media (max-width: 860px) { .grid, .form { grid-template-columns:minmax(0, 1fr); } .kpis { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .tiers { grid-template-columns:minmax(0, 1fr); } }
`;
  const methods = PAYOUT_METHODS.map((m) => `<option value="${m}">${escape(PAYOUT_WORDS[m])}</option>`).join('');
  const body = `
<div class="wrap page">
  <div id="none" hidden>
    <h1>Vous n’êtes pas encore partenaire</h1>
    <p class="sub">Cet espace s’ouvre aux créateurs du programme partenaires. Postulez : si votre public correspond, votre lien arrive par email.</p>
    <p style="margin-top:22px"><a class="cta" href="${PARTNERS_PATH}#postuler">Devenir partenaire</a></p>
  </div>
  <div id="space" hidden>
    <h1 id="hello"></h1>
    <p class="sub">Partagez votre lien : chaque client qui paie vous rapporte une part de ce qu’il paie, pendant <span id="months"></span> mois.</p>
    <p class="notice" id="paused" hidden>Votre lien est en pause le temps d’une vérification. Il marche encore pour vos visiteurs, mais ne rapporte plus. Écrivez-nous à ${CONTACT}.</p>
    <div class="link"><code id="link"></code><button class="cta small" type="button" id="copy">Copier</button></div>
    <p class="hint" style="margin-top:8px">Ou votre code <b id="code"></b>, à saisir dans l’app dans les 7 jours après l’inscription. <span id="gift"></span></p>
    <div class="kpis">
      <div><b id="k-clicks">0</b><span>clics sur votre lien</span></div>
      <div><b id="k-signups">0</b><span>inscrits</span></div>
      <div><b id="k-paying">0</b><span>clients payants</span></div>
      <div><b id="k-ready">0 F</b><span>prêts à être payés</span></div>
    </div>
    <div class="grid">
      <section class="card">
        <h2>Votre palier</h2>
        <p class="hint">Plus vous amenez de clients payants, plus votre part monte, sur tous les nouveaux paiements.</p>
        <div class="tiers" id="tiers"></div>
        <p class="next" id="next"></p>
        <h2 style="margin-top:26px">Vos gains</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Mois</th><th class="r">Clients</th><th class="r">Gagné</th><th>État</th></tr></thead>
          <tbody id="months-rows"></tbody>
        </table></div>
      </section>
      <div class="stack">
        <section class="card">
          <h2>Être payé</h2>
          <p class="hint" id="pay-hint"></p>
          <form class="form" id="pay">
            <label class="f">Moyen<select id="method"><option value="">Choisir…</option>${methods}</select></label>
            <label class="f">Numéro<input id="number" type="tel" inputmode="tel" placeholder="+226 70 00 00 00" maxlength="24"></label>
            <div style="grid-column:1/-1"><button class="cta small" type="submit">Enregistrer</button><p class="saved" id="saved" role="status"></p></div>
          </form>
        </section>
        <section class="card">
          <h2>Ce qui compte</h2>
          <p class="hint" id="counts" style="margin:0"></p>
          <h2 style="margin-top:18px">Vos clients</h2>
          <p class="hint" style="margin:0">Vous voyez combien ils sont et ce qu’ils rapportent, jamais leur nom ni leur email.</p>
        </section>
      </div>
    </div>
  </div>
</div>`;
  const js = `
const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("fr-FR");
const cfa = (n) => nf.format(n) + " F";
const pctText = (x) => nf.format(Math.round(x * 1000) / 10) + " %";
const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
async function load() {
  const res = await fetch("/partenaire/api", { credentials: "same-origin" });
  if (res.status === 401) { location.assign("/auth/v1/sign-in#partenaire"); return; }
  const d = await res.json();
  if (!d.partner) { $("none").hidden = false; return; }
  $("space").hidden = false;
  const p = d.partner, r = d.rules;
  $("hello").textContent = "Bonjour " + p.name;
  $("months").textContent = r.months;
  $("paused").hidden = p.status !== "paused";
  const link = ${JSON.stringify(opts.publicSite)} + "/?p=" + p.code;
  $("link").textContent = link.replace(/^https?:\\/\\//, "");
  $("code").textContent = p.code;
  $("gift").textContent = d.giftPlan ? "Vos abonnés reçoivent " + d.giftPlan + " offert " + r.giftDays + " jours." : "";
  $("copy").onclick = async () => { try { await navigator.clipboard.writeText(link); $("copy").textContent = "Copié"; } catch { getSelection().selectAllChildren($("link")); } };
  $("k-clicks").textContent = nf.format(d.clicks);
  $("k-signups").textContent = nf.format(d.signups);
  $("k-paying").textContent = nf.format(d.paying);
  $("k-ready").textContent = cfa(d.payableXof);
  const tiers = [["Base", r.baseRate, "dès le 1er client", "base"], ["Argent", r.silverRate, "dès " + r.silverFrom + " clients payants", "silver"], ["Or", r.goldRate, "dès " + r.goldFrom + " clients payants", "gold"]];
  $("tiers").replaceChildren(...tiers.map(([name, rate, from, id]) => {
    const div = document.createElement("div");
    if (id === d.tier) div.className = "on";
    div.innerHTML = "<small></small><b></b><small></small>";
    div.children[0].textContent = name + (id === d.tier ? " · votre palier" : "");
    div.children[1].textContent = pctText(rate);
    div.children[2].textContent = from;
    return div;
  }));
  const toNext = d.tier === "base" ? r.silverFrom - d.paying : d.tier === "silver" ? r.goldFrom - d.paying : 0;
  $("next").textContent = toNext > 0 ? "Encore " + toNext + " client(s) payant(s) pour le palier suivant." : "Vous êtes au palier le plus haut.";
  $("months-rows").replaceChildren(...(d.months.length ? d.months.map((m) => {
    const tr = document.createElement("tr");
    const state = m.state === "paid" ? ["paid", "Payé"] : m.state === "ready" ? ["ready", "Prêt"] : ["", "À partir du " + dayName.format(m.payableAt)];
    tr.innerHTML = "<td></td><td class=r></td><td class=r></td><td><span class=pill></span></td>";
    tr.children[0].textContent = monthName.format(Date.UTC(Number(m.month.slice(0, 4)), Number(m.month.slice(5)) - 1, 1));
    tr.children[1].textContent = nf.format(m.clients);
    tr.children[2].textContent = cfa(m.earnedXof);
    tr.children[3].firstChild.textContent = state[1];
    if (state[0]) tr.children[3].firstChild.classList.add(state[0]);
    return tr;
  }) : [Object.assign(document.createElement("tr"), { innerHTML: "<td colspan=4 class=empty>Vos gains apparaîtront ici dès le premier paiement d’un de vos clients.</td>" })]));
  $("pay-hint").textContent = "Chaque début de mois, dès " + cfa(r.payoutMinXof) + " prêts. Seul vous voyez ce numéro, et nous.";
  $("method").value = p.payoutMethod || "";
  $("number").value = p.payoutNumber || "";
  $("counts").textContent = "Les forfaits et les packs de crédits médias de vos clients, pendant " + r.months + " mois après leur inscription, hors taxes. Une commission devient payable " + r.holdDays + " jours après le paiement. Un client remboursé ne compte pas. Vous ne pouvez pas être votre propre client.";
}
$("pay").addEventListener("submit", async (e) => {
  e.preventDefault();
  const saved = $("saved");
  try {
    const res = await fetch("/partenaire/api/paiement", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", "x-baarali-partner": "1" },
      body: JSON.stringify({ method: $("method").value || null, number: $("number").value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || "Enregistrement impossible.");
    saved.style.color = "var(--ok)"; saved.textContent = "C’est enregistré.";
  } catch (err) { saved.style.color = "var(--bad)"; saved.textContent = err.message; }
});
load().catch(() => { $("none").hidden = false; });`;
  return shell({
    lang: 'fr',
    nonce: opts.nonce,
    title: 'Mon espace partenaire — Baarali',
    description: 'Votre lien partenaire Baarali, vos clients et vos gains.',
    css,
    body,
    js,
    menu: `<a href="${PARTNERS_PATH}">Le programme</a>`,
  });
}

/** To a creator just accepted: their link, their code and the way to their space. */
export function partnerWelcomeMail(p: { name: string; code: string }, to: string, urls: { site: string; app: string }, rules: ProgramRules, giftPlan: string | null) {
  const link = `${urls.site}/?p=${p.code}`;
  const space = `${urls.app}${PARTNER_SPACE_PATH}`;
  const lines = [
    `Bonjour ${p.name},`,
    `Bienvenue dans le programme partenaires de Baarali. Voici votre lien : ${link}`,
    `Votre code, à saisir dans l’app dans les 7 jours après l’inscription : ${p.code}.${giftPlan ? ` Vos abonnés reçoivent ${giftPlan} offert ${rules.giftDays} jours.` : ''}`,
    `Chaque paiement de vos clients vous rapporte ${pct(rules.baseRate)}, puis ${pct(rules.silverRate)} dès ${rules.silverFrom} clients payants et ${pct(rules.goldRate)} dès ${rules.goldFrom}, pendant ${rules.months} mois.`,
    `Suivez vos clics, vos clients et vos gains dans votre espace : ${space}. Connectez-vous avec cet email (${to}), puis indiquez votre numéro de mobile money pour être payé.`,
    'Une règle simple : dites toujours que c’est un partenariat, et montrez ce que Baarali fait vraiment.',
    `À très vite,\nL’équipe Baarali`,
  ];
  const html = [
    '<!doctype html><html lang="fr"><body style="margin:0;background:#f4f6f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb"><tr><td style="padding:26px 28px">',
    '<div style="display:inline-block;width:30px;height:30px;line-height:30px;text-align:center;border-radius:8px;background:#0062C4;color:#fff;font-weight:700;font-size:16px;margin-bottom:16px">B</div>',
    `<h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#111827">Bienvenue dans le programme partenaires</h1>`,
    ...lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${escape(l).replace(/\n/g, '<br>')}</p>`),
    `<p style="margin:20px 0 4px"><a href="${escape(space)}" style="display:inline-block;background:#0062C4;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Ouvrir mon espace partenaire</a></p>`,
    '</td></tr></table></td></tr></table></body></html>',
  ].join('');
  return { to, subject: 'Votre lien partenaire Baarali', text: lines.join('\n\n'), html, headers: {} as Record<string, string> };
}
