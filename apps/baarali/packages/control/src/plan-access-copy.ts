import type { PlanOffers } from '@x/shared/dist/billing.js';

// BAARALI(13/10/2026): validated split: Discovery keeps everyday Chat;
// paid plans add Work. Shared by the site and both app builds, even when
// their deployed catalog predates this wording. Prices and quotas stay live.
const COPY = {
  fr: {
    freeFor: 'Pour découvrir Chat au quotidien.',
    free: ['Chat : questions, rédaction et traduction', 'Recherche web avec sources', 'Analyse et résumé de vos fichiers', 'Dictée et conversation vocale dans vos quotas', 'Des modèles rapides et économiques', 'Une utilisation limitée, renouvelée toutes les 5 h et chaque semaine', 'Images, vidéos, voix et musique avec des crédits médias séparés', 'Chat sur ordinateur et mobile'],
    work: ['Work inclus : projets et agents personnalisés', 'Tâches, routines, code et Studio'],
  },
  en: {
    freeFor: 'To discover everyday Chat.',
    free: ['Chat: questions, writing and translation', 'Web research with sources', 'Analysis and summaries of your files', 'Dictation and voice conversations within your quotas', 'Fast, low-cost models', 'Limited usage, renewed every 5 h and every week', 'Images, videos, voices and music with separate media credits', 'Chat on desktop and mobile'],
    work: ['Work included: projects and custom agents', 'Tasks, routines, code and Studio'],
  },
} as const;

type Copy = { for: string; points: string[] };
export function planAccessCopy<T extends Copy>(copy: T, free: boolean, lang: 'fr' | 'en'): T {
  const words = COPY[lang];
  return free ? { ...copy, for: words.freeFor, points: [...words.free] } : { ...copy, points: [...words.work, ...copy.points.filter(point => !words.work.some(word => word === point))] };
}
export function withPlanAccess(offers: PlanOffers): PlanOffers {
  return { ...offers, plans: offers.plans.map(plan => planAccessCopy(plan, plan.free, offers.lang)) };
}
