import fs from 'node:fs/promises';
import path from 'node:path';

// The morning brief (decided 07/11/2026, AGENT_TELEPHONE_SPEC.md §3 B), as
// Claude Duet sends it: each morning the agent sums up the day and tells
// the phone. A routine like any other, so the person can open, change,
// pause or delete it in Routines; seeded once — a deleted brief stays
// deleted (the upstream planner's rule, core todo/planner-task.ts). It runs
// with the apps closed thanks to the scheduled wakes (schedule.ts).
//
// A window, not a cron time: it fires once anywhere in the band, so a wake
// a few minutes late still brings it (core schedule/utils.ts, the cron
// grace is 2 minutes). Local time is the machine's: UTC, Abidjan's hour.

export const BRIEF_NAME = 'Point du matin';
export const BRIEF_WINDOW = { startTime: '07:00', endTime: '09:00' };
const MARKER = path.join('config', '.baarali-morning-brief');

export const BRIEF_INSTRUCTIONS = `Chaque matin, prépare le point du matin de la personne, puis préviens-la sur son téléphone. Lecture seule : tu n'envoies, ne réponds, ne modifies et ne supprimes rien.

1. Rassemble, en lisant des fichiers précis et récents (grep étroit) :
   - l'agenda d'aujourd'hui (calendar_sync/) ;
   - les e-mails importants des dernières 24 heures (gmail_sync/, seulement ceux marqués \`importance: important\`) et ceux qui attendent sa réponse ;
   - sa liste de tâches (todo.md) et les propositions du planificateur du matin ;
   - ce que tes autres routines ont fait depuis hier.
2. Écris le point dans knowledge/Point du matin/AAAA-MM-JJ.md (la date du jour), en cinq lignes au plus, dans sa langue (le français par défaut) :
   - ce qui l'attend aujourd'hui ;
   - ce qui attend sa réponse ;
   - ce que tu as fait pour elle ;
   - ce que tu proposes, s'il y a lieu.
   Rien d'important : une seule ligne, « Rien d'urgent aujourd'hui ».
3. Termine toujours par l'outil notify-user :
   - title : « Votre point du matin » ;
   - message : la ligne la plus utile, en moins de 140 caractères ;
   - link : rowboat://open?type=file&path=<le chemin du fichier écrit>.
4. Ne recopie jamais un e-mail entier ni une donnée sensible (mot de passe, code, numéro de carte) dans le point ou la notification.`;

/** Seeds the brief once the server answers. True when it exists now or was seeded before. */
export async function ensureMorningBrief(workDir: string, rpc: (channel: string, args: unknown) => Promise<unknown>): Promise<boolean> {
  const marker = path.join(workDir, MARKER);
  try {
    await fs.access(marker);
    return true;
  } catch {
    // Not seeded yet.
  }
  const res = (await rpc('bg-task:create', { name: BRIEF_NAME, instructions: BRIEF_INSTRUCTIONS, triggers: { windows: [BRIEF_WINDOW] } })) as {
    success: boolean;
    error?: string;
  };
  if (!res.success) throw new Error(`morning brief: ${res.error ?? 'not created'}`);
  await fs.mkdir(path.dirname(marker), { recursive: true });
  await fs.writeFile(marker, `${new Date().toISOString()}\n`);
  return true;
}
