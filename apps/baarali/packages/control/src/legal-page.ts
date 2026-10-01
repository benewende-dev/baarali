import { FAVICON, logoTile, logoWord } from './logo.js';
import { pickLang } from './sign-in-page.js';

// The legal pages of baarali.com (decided 01/10/2026, before the first real
// test): who publishes Baarali, what is done with personal data, and the
// terms of use. Facts only: every host and processor named here is one the
// code calls (main.ts, fly.toml), nothing more. Strings live here until
// @baarali/i18n exists (roadmap phase 1).

type Lang = 'fr' | 'en';
export type LegalDoc = 'mentions' | 'privacy' | 'terms';

/** Where each document lives; the same path in both languages. */
export const LEGAL_PATHS: Record<LegalDoc, string> = {
  mentions: '/mentions-legales',
  privacy: '/confidentialite',
  terms: '/conditions',
};

export const CONTACT = 'contact@baarali.com';

type Section = [heading: string, ...paragraphs: string[]];
interface Doc {
  title: string;
  updated: string;
  sections: Section[];
}

const STRINGS: Record<Lang, { back: string; contact: string; names: Record<LegalDoc, string>; docs: Record<LegalDoc, Doc> }> = {
  fr: {
    back: 'Retour à l’accueil',
    contact: 'Contact',
    names: { mentions: 'Mentions légales', privacy: 'Confidentialité', terms: 'Conditions d’utilisation' },
    docs: {
      mentions: {
        title: 'Mentions légales',
        updated: 'Mis à jour le 1er octobre 2026',
        sections: [
          ['Éditeur', 'Baarali est édité par OpenBaara SAS, société par actions simplifiée de droit burkinabè, Burkina Faso.', `Contact : ${CONTACT}`, 'Directeur de la publication : le président d’OpenBaara SAS.'],
          ['Hébergement', 'Le site, l’application et les espaces de travail sont hébergés par Fly.io, Inc., sur des serveurs situés à Paris (France).', 'Les données de compte sont stockées par Neon, sur des serveurs situés à Francfort (Allemagne).'],
          ['Propriété intellectuelle', 'Le nom Baarali, son logo et son personnage appartiennent à OpenBaara SAS. Toute reproduction sans autorisation est interdite.', 'Certaines parties de l’application reposent sur des logiciels libres, utilisés selon leurs licences respectives. Les polices Inter et Instrument Serif sont distribuées sous licence SIL Open Font License.'],
        ],
      },
      privacy: {
        title: 'Confidentialité',
        updated: 'Mis à jour le 1er octobre 2026',
        sections: [
          ['En bref', 'Nous collectons le minimum pour faire fonctionner Baarali. Nous ne vendons pas vos données, nous ne faisons pas de publicité et nous n’utilisons aucun traceur publicitaire.'],
          ['Ce que nous collectons', 'Votre compte : votre adresse email ou votre numéro de téléphone, et la date de création du compte.', 'Votre travail : vos conversations, vos fichiers et ce que l’assistant retient, dans votre espace de travail.', 'Votre usage : la consommation de votre forfait et de vos crédits médias, pour les décompter.', 'Vos appareils : le nom de chaque appareil connecté et la date de sa dernière connexion, pour que vous puissiez les retirer.'],
          ['Pourquoi', 'Pour vous connecter, faire fonctionner l’assistant, décompter votre utilisation, protéger votre compte et vous répondre quand vous nous écrivez.'],
          ['Où sont vos données', 'Chaque compte a son propre espace de travail, séparé des autres, hébergé à Paris (France). Les données de compte sont stockées à Francfort (Allemagne).'],
          ['Avec qui nous travaillons', 'Fly.io (hébergement), Neon (base de données), Resend (envoi des codes de connexion par email).', 'Quand vous demandez quelque chose à l’assistant, votre demande est transmise à un fournisseur de modèles d’IA par l’intermédiaire d’OpenRouter. Les vidéos, voix et musiques sont générées par Pixazo. Ces prestataires peuvent traiter les données hors de l’Union européenne ; ils ne reçoivent que ce qui est nécessaire à la demande.'],
          ['Cookies et stockage', 'La connexion utilise des cookies indispensables à votre session. Le site retient votre choix de thème, clair ou sombre, dans votre navigateur. Rien d’autre.'],
          ['Combien de temps', 'Vos données sont gardées tant que votre compte existe. Quand vous demandez la suppression de votre compte, votre espace de travail et vos données de compte sont effacés.'],
          ['Vos droits', `Vous pouvez demander l’accès à vos données, leur correction, leur suppression ou leur export, en écrivant à ${CONTACT}. Nous répondons sous 30 jours.`, 'Ces droits vous sont garantis par la loi burkinabè n° 001-2021/AN portant protection des personnes à l’égard du traitement des données à caractère personnel et, si vous êtes dans l’Union européenne, par le RGPD. Vous pouvez aussi saisir la Commission de l’informatique et des libertés (CIL) du Burkina Faso, ou l’autorité de votre pays.'],
          ['Sécurité', 'La connexion se fait sans mot de passe, par un code à usage unique. Les clés de vos appareils ne sont gardées que sous forme d’empreinte. Votre espace de travail n’a pas d’adresse publique : il n’est joignable qu’avec une clé valide.'],
        ],
      },
      terms: {
        title: 'Conditions d’utilisation',
        updated: 'Mis à jour le 1er octobre 2026',
        sections: [
          ['Le service', 'Baarali est un assistant qui cherche, rédige, organise et crée pour vous, et qui vous demande votre accord avant les actions qui engagent. Il est édité par OpenBaara SAS.'],
          ['Accès anticipé', 'Baarali est en accès anticipé : le service évolue, peut changer ou s’interrompre. Nous faisons de notre mieux pour vous prévenir avant tout changement important.'],
          ['Votre compte', 'Vous vous connectez avec votre email ou votre téléphone. Vous êtes responsable de ce qui se fait avec votre compte ; prévenez-nous si vous pensez qu’il est utilisé par quelqu’un d’autre.'],
          ['Ce que vous approuvez', 'Baarali vous montre ce qu’il s’apprête à faire et attend votre accord avant les actions qui engagent. Ce que vous approuvez est fait en votre nom, sous votre responsabilité.'],
          ['Ce qu’il produit', 'Ce que l’assistant produit pour vous vous appartient. Une IA peut se tromper : relisez avant de vous en servir, surtout pour les chiffres, le droit, la santé ou l’argent.'],
          ['Utilisation interdite', 'Pas d’usage illégal, de spam, de fraude, de harcèlement, ni de contenu qui porte atteinte aux droits d’autrui. Nous pouvons suspendre un compte qui ne respecte pas ces règles.'],
          ['Forfaits et crédits', 'Les prix sont affichés hors taxes, en euros et en F CFA. L’utilisation des forfaits se renouvelle toutes les 5 heures et chaque semaine. Les crédits médias n’expirent pas, et une génération qui échoue est remboursée. Vous pouvez changer de forfait quand vous voulez.'],
          ['Fin du service', 'Vous pouvez fermer votre compte à tout moment en écrivant à ' + CONTACT + '. Si nous arrêtions Baarali, nous vous préviendrions à l’avance pour que vous puissiez récupérer votre travail.'],
          ['Responsabilité', 'Dans les limites permises par la loi, OpenBaara SAS n’est pas responsable des dommages indirects liés à l’utilisation du service.'],
          ['Droit applicable', 'Ces conditions sont soumises au droit burkinabè. Écrivez-nous d’abord : la plupart des questions se règlent ainsi.'],
        ],
      },
    },
  },
  en: {
    back: 'Back to home',
    contact: 'Contact',
    names: { mentions: 'Legal notice', privacy: 'Privacy', terms: 'Terms of use' },
    docs: {
      mentions: {
        title: 'Legal notice',
        updated: 'Updated on 1 October 2026',
        sections: [
          ['Publisher', 'Baarali is published by OpenBaara SAS, a simplified joint-stock company under the law of Burkina Faso.', `Contact: ${CONTACT}`, 'Publication director: the president of OpenBaara SAS.'],
          ['Hosting', 'The site, the app and the workspaces are hosted by Fly.io, Inc., on servers in Paris (France).', 'Account data is stored by Neon, on servers in Frankfurt (Germany).'],
          ['Intellectual property', 'The Baarali name, logo and character belong to OpenBaara SAS. Reproduction without permission is forbidden.', 'Parts of the app rely on free software, used under their respective licences. The Inter and Instrument Serif fonts are distributed under the SIL Open Font License.'],
        ],
      },
      privacy: {
        title: 'Privacy',
        updated: 'Updated on 1 October 2026',
        sections: [
          ['In short', 'We collect the minimum Baarali needs to work. We do not sell your data, we do not advertise and we use no advertising trackers.'],
          ['What we collect', 'Your account: your email address or phone number, and the date the account was created.', 'Your work: your conversations, your files and what the assistant remembers, in your workspace.', 'Your usage: how much of your plan and media credits you use, to count it.', 'Your devices: the name of each connected device and when it was last seen, so you can remove them.'],
          ['Why', 'To sign you in, run the assistant, count your usage, protect your account and answer you when you write to us.'],
          ['Where your data is', 'Each account has its own workspace, separate from the others, hosted in Paris (France). Account data is stored in Frankfurt (Germany).'],
          ['Who we work with', 'Fly.io (hosting), Neon (database), Resend (sending sign-in codes by email).', 'When you ask the assistant something, your request goes to an AI model provider through OpenRouter. Videos, voices and music are generated by Pixazo. These providers may process data outside the European Union; they only receive what the request needs.'],
          ['Cookies and storage', 'Signing in uses cookies your session needs. The site remembers your light or dark theme in your browser. Nothing else.'],
          ['How long', 'Your data is kept as long as your account exists. When you ask for your account to be deleted, your workspace and account data are erased.'],
          ['Your rights', `You can ask to access, correct, delete or export your data by writing to ${CONTACT}. We answer within 30 days.`, 'These rights are guaranteed by Burkina Faso law no. 001-2021/AN on the protection of personal data and, if you are in the European Union, by the GDPR. You can also contact the Commission de l’informatique et des libertés (CIL) of Burkina Faso, or the authority of your country.'],
          ['Security', 'Sign-in uses a one-time code, with no password. Your device keys are only kept as a hash. Your workspace has no public address: it can only be reached with a valid key.'],
        ],
      },
      terms: {
        title: 'Terms of use',
        updated: 'Updated on 1 October 2026',
        sections: [
          ['The service', 'Baarali is an assistant that researches, writes, organizes and creates for you, and asks for your approval before binding actions. It is published by OpenBaara SAS.'],
          ['Early access', 'Baarali is in early access: the service evolves, may change or be interrupted. We do our best to warn you before any important change.'],
          ['Your account', 'You sign in with your email or phone. You are responsible for what is done with your account; tell us if you think someone else is using it.'],
          ['What you approve', 'Baarali shows you what it is about to do and waits for your approval before binding actions. What you approve is done in your name, under your responsibility.'],
          ['What it produces', 'What the assistant produces for you is yours. An AI can be wrong: check before you use it, especially for figures, law, health or money.'],
          ['Forbidden use', 'No illegal use, spam, fraud, harassment, or content that infringes the rights of others. We may suspend an account that breaks these rules.'],
          ['Plans and credits', 'Prices are shown excluding taxes, in euros and CFA francs. Plan usage renews every 5 hours and every week. Media credits do not expire, and a failed generation is refunded. You can change plans whenever you want.'],
          ['End of service', 'You can close your account at any time by writing to ' + CONTACT + '. If we ever stopped Baarali, we would tell you in advance so you can take your work with you.'],
          ['Liability', 'To the extent the law allows, OpenBaara SAS is not liable for indirect damage arising from the use of the service.'],
          ['Governing law', 'These terms are governed by the law of Burkina Faso. Write to us first: most questions are settled that way.'],
        ],
      },
    },
  },
};

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The legal links, for the footers of the other pages. */
export function legalLinks(acceptLanguage: string | null): Array<{ href: string; label: string }> {
  const t = STRINGS[pickLang(acceptLanguage)];
  return (Object.keys(LEGAL_PATHS) as LegalDoc[]).map((d) => ({ href: LEGAL_PATHS[d], label: t.names[d] }));
}

export function legalPage(doc: LegalDoc, opts: { lang: string | null; nonce: string }): string {
  const lang = pickLang(opts.lang);
  const t = STRINGS[lang];
  const d = t.docs[doc];
  const others = (Object.keys(LEGAL_PATHS) as LegalDoc[])
    .map((k) => (k === doc ? `<span aria-current="page">${escape(t.names[k])}</span>` : `<a href="${LEGAL_PATHS[k]}">${escape(t.names[k])}</a>`))
    .join('');
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(d.title)} — Baarali</title>
<link rel="icon" href="${FAVICON}">
<script nonce="${opts.nonce}">
try { const v = localStorage.getItem("baarali-theme"); if (v === "light" || v === "dark") document.documentElement.dataset.theme = v; } catch {}
</script>
<style nonce="${opts.nonce}">
@font-face { font-family:"Inter"; src:url(/assets/inter.woff2) format("woff2"); font-weight:400 800; font-display:swap; }
:root { --paper:#ffffff; --line:#e6e8ef; --ink:#0a0a0a; --text:#2a2d36; --muted:#5d6271; --blue:#155eef; color-scheme:light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper:#0b0c0f; --line:#24262e; --ink:#f5f6f8; --text:#d3d5dc; --muted:#9a9fac; --blue:#6f9fff; color-scheme:dark; } }
:root[data-theme="dark"] { --paper:#0b0c0f; --line:#24262e; --ink:#f5f6f8; --text:#d3d5dc; --muted:#9a9fac; --blue:#6f9fff; color-scheme:dark; }
* { box-sizing:border-box; }
body { margin:0; background:var(--paper); color:var(--text); font:16px/1.7 "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
.wrap { max-width:760px; margin:0 auto; padding-inline:20px; }
header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-block:22px; border-bottom:1px solid var(--line); }
.brand { display:flex; align-items:center; gap:10px; color:var(--ink); text-decoration:none; }
.back { color:var(--muted); font-size:14.5px; text-decoration:none; }
.back:hover, a:hover { color:var(--ink); }
nav { display:flex; flex-wrap:wrap; gap:8px; margin:40px 0 28px; }
nav a, nav span { font-size:14px; padding:6px 13px; border-radius:999px; border:1px solid var(--line); color:var(--muted); text-decoration:none; }
nav span { background:var(--ink); border-color:var(--ink); color:var(--paper); }
h1 { margin:0; color:var(--ink); font-size:clamp(32px, 6vw, 44px); letter-spacing:-.035em; line-height:1.1; }
.updated { margin:10px 0 40px; color:var(--muted); font-size:14px; }
h2 { margin:36px 0 10px; color:var(--ink); font-size:19px; letter-spacing:-.02em; }
p { margin:0 0 12px; }
a { color:var(--blue); }
footer { margin-top:64px; padding-block:28px 40px; border-top:1px solid var(--line); color:var(--muted); font-size:14px; }
</style>
</head>
<body>
<div class="wrap">
<header>
  <a class="brand" href="/">${logoTile(30)}${logoWord(23)}</a>
  <a class="back" href="/">${escape(t.back)}</a>
</header>
<main>
  <nav aria-label="${escape(t.names.mentions)}">${others}</nav>
  <h1>${escape(d.title)}</h1>
  <p class="updated">${escape(d.updated)}</p>
  ${d.sections.map(([h, ...ps]) => `<h2>${escape(h)}</h2>${ps.map((p) => `<p>${escape(p)}</p>`).join('')}`).join('\n  ')}
</main>
<footer>© ${new Date().getFullYear()} OpenBaara SAS · ${escape(t.contact)} : <a href="mailto:${CONTACT}">${CONTACT}</a></footer>
</div>
</body>
</html>`;
}
