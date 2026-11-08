import type { PlanOffers } from '@x/shared/dist/billing.js';

// BAARALI(07/11/2026): who gets what, written once for the site, the desktop
// app and the phone (copied into both builds). The split follows the runtime
// guard (canUseWork, work-policy.ts): Découverte keeps the conversations with
// Baarali; every paid plan opens the agents and the workspace. There is no
// "Chat" or "Work" any more in what people read (the founder's call). Prices
// and quotas stay live, from the catalog.

export type Lang = 'fr' | 'en';
export type Tier = 'free' | 'starter' | 'pro';
/** true: included; false: not included; a string: included, as said. */
export type Cell = boolean | string;
// `text` and `name`, not label/title: the app's translation layer leaves
// these alone, they come already in the reader's language.
export interface AccessRow { text: string; cells: Record<Tier, Cell> }
export interface AccessGroup { name: string; rows: AccessRow[] }

const all = { free: true, starter: true, pro: true } as const;
const paid = { free: false, starter: true, pro: true } as const;

const WORDS = {
  fr: {
    freeFor: 'Pour découvrir Baarali au quotidien.',
    free: [
      'Conversations avec Baarali : questions, rédaction, traduction',
      'Recherche web avec ses sources',
      'Analyse et résumé de vos fichiers',
      'Dictée et conversation à la voix',
      'Tâches personnelles et bibliothèque de documents',
      'Des modèles rapides, une utilisation limitée',
      'Images, vidéos, voix et musique avec des crédits médias séparés',
      'Sur ordinateur et sur téléphone',
    ],
    locked: 'Agents, routines et espace de travail : à partir de Semaine.',
    paid: ['Vos agents personnalisés et leurs routines', 'Code, e-mail, réunions, apps, espaces d’équipe et Studio'],
    groups: [
      { name: 'Avec Baarali', rows: [
        { text: 'Questions, rédaction et traduction', cells: all },
        { text: 'Recherche web avec ses sources', cells: all },
        { text: 'Analyse et résumé de vos fichiers', cells: all },
        { text: 'Dictée et conversation à la voix', cells: all },
        { text: 'Tâches personnelles et bibliothèque', cells: all },
      ] },
      { name: 'Vos agents', rows: [
        { text: 'Agents personnalisés : nom, rôle, visage', cells: paid },
        { text: 'Routines : brief du matin, relances, rapports', cells: paid },
        { text: 'Agents sur le téléphone, avec notifications', cells: paid },
        { text: 'Votre accord avant chaque envoi', cells: all },
      ] },
      { name: 'Espace de travail', rows: [
        { text: 'Code et projets', cells: paid },
        { text: 'E-mail : tri et réponses préparées', cells: paid },
        { text: 'Réunions : notes et compte rendu', cells: paid },
        { text: 'Apps connectées à vos agents', cells: paid },
        { text: 'Espaces d’équipe partagés', cells: paid },
        { text: 'Studio : vidéo, animation et 3D', cells: paid },
      ] },
      { name: 'Votre compte', rows: [
        { text: 'Apps Mac et Windows, et téléphone', cells: all },
        { text: 'Espace personnel, hébergé en Europe', cells: all },
        { text: 'Images, vidéos, voix et musique', cells: { free: 'Avec des crédits', starter: 'Avec des crédits', pro: 'Avec des crédits' } },
      ] },
    ] as AccessGroup[],
  },
  en: {
    freeFor: 'To discover Baarali every day.',
    free: [
      'Conversations with Baarali: questions, writing, translation',
      'Web research with its sources',
      'Analysis and summaries of your files',
      'Dictation and voice conversations',
      'Personal tasks and document library',
      'Fast models, limited usage',
      'Images, videos, voices and music with separate media credits',
      'On desktop and on your phone',
    ],
    locked: 'Agents, routines and the workspace: from Semaine on.',
    paid: ['Your own agents and their routines', 'Code, email, meetings, apps, team spaces and Studio'],
    groups: [
      { name: 'With Baarali', rows: [
        { text: 'Questions, writing and translation', cells: all },
        { text: 'Web research with its sources', cells: all },
        { text: 'Analysis and summaries of your files', cells: all },
        { text: 'Dictation and voice conversations', cells: all },
        { text: 'Personal tasks and library', cells: all },
      ] },
      { name: 'Your agents', rows: [
        { text: 'Your own agents: name, role, face', cells: paid },
        { text: 'Routines: morning brief, follow-ups, reports', cells: paid },
        { text: 'Agents on your phone, with notifications', cells: paid },
        { text: 'Your approval before anything is sent', cells: all },
      ] },
      { name: 'Workspace', rows: [
        { text: 'Code and projects', cells: paid },
        { text: 'Email: sorting and drafted replies', cells: paid },
        { text: 'Meetings: notes and minutes', cells: paid },
        { text: 'Apps connected to your agents', cells: paid },
        { text: 'Shared team spaces', cells: paid },
        { text: 'Studio: video, motion and 3D', cells: paid },
      ] },
      { name: 'Your account', rows: [
        { text: 'Mac and Windows apps, and phone', cells: all },
        { text: 'Personal workspace, hosted in Europe', cells: all },
        { text: 'Images, videos, voices and music', cells: { free: 'With credits', starter: 'With credits', pro: 'With credits' } },
      ] },
    ] as AccessGroup[],
  },
} as const;

/** The access table, by group, for the pricing page and the apps' plans windows. */
export function planAccess(lang: Lang): AccessGroup[] {
  return WORDS[lang].groups;
}

/** On Découverte's card: what waits for a paid plan. */
export function lockedNote(lang: Lang): string {
  return WORDS[lang].locked;
}

/**
 * A plan card's words: Découverte says what it gives, a paid plan leads with
 * what it opens. Pro, « everything in Essentiel », does not say it again.
 */
type Copy = { for: string; points: string[] };
export function planAccessCopy<T extends Copy>(copy: T, free: boolean, lang: Lang, opens = true): T {
  const w = WORDS[lang];
  // Older catalogs still send the former Chat / Work lines, and the former
  // list of the workspace (« E-mail, réunions… et Studio »): they make way.
  const stale = (p: string) => /\b(Chat|Work)\b/.test(p) || (/\bStudio\b/.test(p) && /réunions|meetings/i.test(p));
  return free
    ? { ...copy, for: w.freeFor, points: [...w.free] }
    : { ...copy, points: [...(opens ? w.paid : []), ...copy.points.filter((p) => !stale(p) && !w.paid.some((x) => x === p))] };
}

export function withPlanAccess(offers: PlanOffers): PlanOffers {
  return { ...offers, plans: offers.plans.map((plan) => planAccessCopy(plan, plan.free, offers.lang, !plan.id.startsWith('pro'))) };
}
