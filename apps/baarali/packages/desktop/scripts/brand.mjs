#!/usr/bin/env node
// Applies the Baarali brand to a checkout, just before a build (option A,
// decided 01/10/2026). The repository keeps the upstream files as they are,
// so a weekly sync never conflicts on a brand line (UPSTREAM.md §2); the
// brand is written into the build's own copy, in CI or in a Docker stage.
//
//   node brand.mjs --check          says what it would change, writes nothing
//   node brand.mjs --yes            the desktop app: strings, names, icons, link to the instance
//   node brand.mjs --yes --only core   the instance image: what the agent says of itself
//   node brand.mjs --yes --only mobile the mobile app: name, icons, accent, French
//   node brand.mjs --yes --only harbor the Spaces server image: its pages, in the visitor's language
//
// Every exact edit must find its anchor exactly once: when the upstream
// changes one, the build fails here instead of shipping half a brand. The
// brand test (test/brand.test.ts) runs --check on every pull request.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { desktopLayoutEdits } from './desktop-layout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../../../..');
const PKG = path.resolve(here, '..');

export const BRAND = {
  name: 'Baarali',
  apiUrl: 'https://app.baarali.com',
  site: 'https://baarali.com/',
  repo: 'benewende-dev/baarali',
  contact: 'contact@baarali.com',
  bundleId: 'com.baarali.app',
  description: "L'assistant qui agit pour vous",
  publisher: 'OpenBaara',
};

// "Rowboat" alone, as the product's name. Not "Rowboat Labs" (the company,
// in tests and comments), nor the credit line below, nor identifiers like
// RowboatServer (\b stops at the next letter). Internal ids keep their
// lowercase `rowboat` (UPSTREAM.md §2 « Ce qu'on ne renomme jamais »).
const PRODUCT_NAME = /\bRowboat\b(?! Labs)(?! \(Apache)/g;

/** Where the upstream links its own company; ours instead. */
const LINKS = [
  ['https://github.com/rowboatlabs/rowboat', `https://github.com/${BRAND.repo}`],
  ['"rowboatlabs/rowboat"', `"${BRAND.repo}"`],
  ['https://www.rowboatlabs.com/terms-of-service', BRAND.site],
  ['https://www.rowboatlabs.com/privacy-policy', BRAND.site],
  ['https://www.rowboatlabs.com/', BRAND.site],
  ['contact@rowboatlabs.com', BRAND.contact],
  ['https://api.x.rowboatlabs.com', BRAND.apiUrl],
  ["homepage: 'https://rowboatlabs.com'", `homepage: '${BRAND.site}'`],
  ["maintainer: 'rowboatlabs'", `maintainer: '${BRAND.publisher}'`],
  ["'AI coworker with memory'", JSON.stringify(BRAND.description)],
];

// The handle a person types to call the assistant (decided 02/10/2026):
// `@baarali`, everywhere it is written, shown or recognised. Not a package
// (`@rowboat/spaces-protocol`) nor the protocol's anchor (`#rowboat`), which
// never says `@`. Same length as `@rowboat`, for code that counts it.
const HANDLE = /@rowboat(?![\w/-])/g;

/** The visible text of one source file, branded. */
export function brandText(text) {
  let out = text.replace(HANDLE, '@baarali');
  for (const [from, to] of LINKS) out = out.split(from).join(to);
  // Apache-2.0 §4: say where it comes from; the company is not ours to name as the maker.
  out = out.split('Made by Rowboat Labs · Apache 2.0').join(`Made by ${BRAND.publisher} · Built on Rowboat (Apache 2.0)`);
  return out.replace(PRODUCT_NAME, BRAND.name);
}

// 14/10/2026: the founder removed decorative AI stars throughout the app.
// Keep local bindings so upstream JSX and existing imports still compile.
export function neutralIcons(text, file) {
  const rel = file.replaceAll('\\', '/');
  if (!/^apps\/x\/apps\/(renderer|mobile)\//.test(rel)) return text;
  // BAARALI(15/10/2026): translation keys preserve old and current labels;
  // rewriting them can merge two keys and break the packaged app's TypeScript.
  if (rel.includes('/baarali-i18n/')) return text;
  const name = path.posix.basename(rel);
  const replacement = {
    'prompt-block.tsx': 'NotebookPen',
    'email-rail.tsx': 'MessageCircle',
    'email-view.tsx': 'SquarePen',
    'bg-tasks-view.tsx': 'MessageCircle',
    'live-note-sidebar.tsx': 'FilePenLine',
    'todo-view.tsx': 'ListChecks',
    'credit-celebration.tsx': 'BadgeCheck',
    'meetings-view.tsx': 'FileText',
    'coding-run.tsx': 'Layers',
  }[name] ?? 'SlidersHorizontal';
  return text.replace(/import\s*\{([^}]+)\}\s*from\s*(['"])lucide-react\2/g, (statement, bindings) => {
    const updated = bindings.split(',').map(binding => binding.replace(/\b(Sparkles(?:Icon)?)(?:\s+as\s+([\w$]+))?\b/g, (_, imported, alias) => `${replacement} as ${alias ?? imported}`)).join(',');
    return statement.replace(bindings, () => updated);
  }).replace(/(['"])sf:sparkles\1/g, (_, quote) => `${quote}sf:${name === 'member-face.tsx' ? 'person.crop.square' : 'slider.horizontal.3'}${quote}`)
    .replaceAll('✦ Suggest', 'Suggest');
}

const SOURCE_EXT = /\.(ts|tsx|html)$/;
const isTest = (file) => /\.test\.|\/__tests__\/|\/test\//.test(file);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(full, out);
    } else if (SOURCE_EXT.test(entry.name) && !isTest(full)) out.push(full);
  }
  return out;
}

/** The source trees whose strings are branded. */
export function sourceTrees(only) {
  if (only === 'mobile') return ['apps/x/apps/mobile/src'];
  const core = ['apps/x/packages/core/src'];
  if (only === 'core') return core;
  // forge.config.cjs: the installers' names and the macOS permission prompts.
  return [...core, 'apps/x/apps/main/src', 'apps/x/apps/main/forge.config.cjs', 'apps/x/apps/renderer/src', 'apps/x/apps/renderer/index.html'];
}

/** One exact replacement, which must match exactly once. */
function edit(file, from, to) {
  return { file, from, to };
}

// Without an Apple certificate, macOS reports a downloaded app whose
// signature broke at packaging as damaged, with no way past it; signed ad
// hoc, it is only unverified, and the person can allow it in the settings.
const ADHOC_SIGN = `        // Baarali (brand.mjs): ad hoc signature when there is no certificate.
        postPackage: async (_config, result) => {
            if (result.platform !== 'darwin' || !SKIP_CODE_SIGNING) return;
            const { execFileSync } = require('child_process');
            for (const dir of result.outputPaths) {
                for (const name of require('fs').readdirSync(dir).filter((n) => n.endsWith('.app'))) {
                    execFileSync('codesign', ['--force', '--deep', '--sign', '-', path.join(dir, name)], { stdio: 'inherit' });
                }
            }
        },
`;

// The main process in French (src/i18n/main.ts), installed before any menu is built.
const I18N_MAIN_GLUE = `// Generated by apps/baarali/packages/desktop/scripts/brand.mjs: not in the repository.
import { app, Menu, dialog, Notification } from 'electron';
import { installMainTranslation } from './baarali-i18n/main.js';

installMainTranslation({ app, Menu, dialog, Notification } as unknown as Parameters<typeof installMainTranslation>[0]);
`;

// The cloud link (src/cloud-link.ts) and the few lines that start it.
const CLOUD_GLUE = `// Generated by apps/baarali/packages/desktop/scripts/brand.mjs: not in the repository.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dialog } from 'electron';
import { WorkDir } from '@x/core/dist/config/config.js';
import { API_URL } from '@x/core/dist/config/env.js';
import { connectRemoteServer, disconnectRemoteServer, serverHostMode } from './server-host.js';
import { broadcastReload } from './ipc.js';
import { startCloudLink, type LinkProblem } from './baarali-cloud-link.js';
import { startAppsRelay } from './baarali-apps-relay.js';

// In English, like every dialog of the app: the main process's French layer
// (src/i18n/main.ts, FR_MAIN) translates them, and the release check reads them.
const MESSAGES: Record<LinkProblem, string> = {
  instances_full: 'Early access is full for now. You are signed in: your space opens as soon as a seat frees up.',
  unavailable: 'Your Baarali space is not answering right now. Try again in a few minutes: sign out, then sign in again.',
};

// The instance the app is joined to, as server-host.ts saved it (config/client.json).
function savedRemote(): { url: string; key: string } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(WorkDir, 'config', 'client.json'), 'utf8'));
    const r = raw.remoteServer;
    return r && r.url && r.token ? { url: r.url, key: r.token } : null;
  } catch {
    return null;
  }
}

// The apps of the account open on this computer through the gateway
// (src/apps-relay.ts), from the moment the app is joined to its instance.
let appsRelay: { close: () => void } | null = null;
function ensureAppsRelay(): void {
  if (appsRelay || serverHostMode() !== 'remote') return;
  appsRelay = startAppsRelay({
    target: () => (serverHostMode() === 'remote' ? savedRemote() : null),
    log: (message) => console.log(message),
  });
}

export function startBaaraliCloud(): void {
  const oauthFile = path.join(WorkDir, 'config', 'oauth.json');
  ensureAppsRelay();
  startCloudLink({
    apiUrl: API_URL,
    oauthFile,
    linkFile: path.join(WorkDir, 'config', 'baarali-link.json'),
    mode: serverHostMode,
    connect: async (url, key) => {
      const result = await connectRemoteServer(url, key);
      if (result.success) ensureAppsRelay();
      return result;
    },
    disconnect: disconnectRemoteServer,
    reload: () => setTimeout(() => broadcastReload(), 400),
    notify: (problem) => {
      void dialog.showMessageBox({ type: 'info', message: 'Baarali', detail: MESSAGES[problem] });
    },
    deviceName: () => os.hostname().replace(/\\.local$/, ''),
    readFile: (file) => fsp.readFile(file, 'utf8'),
    writeFile: (file, data) => fsp.writeFile(file, data, { mode: 0o600 }),
    watch: (file, onChange) => {
      // Polling: the upstream rewrites the file whole, which fs.watch loses on some systems.
      fs.watchFile(file, { interval: 1000 }, onChange);
      return () => fs.unwatchFile(file, onChange);
    },
    fetch: globalThis.fetch,
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (message) => console.log(message),
  });
}
`;

// Baarali's sign-in in a window of the app (src/sign-in-window.ts, 05/10/2026).
const SIGN_IN_GLUE = `// Generated by apps/baarali/packages/desktop/scripts/brand.mjs: not in the repository.
import { BrowserWindow, session, shell } from 'electron';
import { API_URL } from '@x/core/dist/config/env.js';
import { findMainAppWindow } from './ipc.js';
import { createUrlOpener } from './baarali-sign-in-window.js';

let made = 0;

/** The app's URL opener: Baarali's sign-in in a window, the rest in the browser. */
export const openBaaraliUrl = createUrlOpener({
  apiUrl: API_URL,
  openExternal: (url) => shell.openExternal(url),
  openWindow: async (url, hooks) => {
    // A partition of its own, kept in memory only: no cookie of a previous
    // sign-in, so signing out then in again asks again.
    const partition = \`baarali-sign-in-\${Date.now()}-\${made++}\`;
    const parent = findMainAppWindow();
    const win = new BrowserWindow({
      width: 460,
      height: 720,
      parent,
      modal: Boolean(parent),
      show: false,
      title: 'Baarali',
      autoHideMenuBar: true,
      minimizable: false,
      fullscreenable: false,
      webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const page = win.webContents;
    // A link meant for a new tab (the terms, a help page): the browser.
    page.setWindowOpenHandler(({ url: next }) => {
      void shell.openExternal(next);
      return { action: 'deny' };
    });
    const guard = (event: { preventDefault: () => void }, next: string) => {
      if (!hooks.onLeave(next)) event.preventDefault();
    };
    page.on('will-navigate', guard);
    page.on('will-redirect', guard);
    page.on('did-navigate', (_event, loaded) => hooks.onLoaded(loaded));
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => {
      hooks.onClosed();
      void session.fromPartition(partition).clearStorageData().catch(() => undefined);
    });
    void win.loadURL(url);
    return { close: () => { if (!win.isDestroyed()) win.close(); } };
  },
  log: (message) => console.log(message),
});
`;

// Files and folders of the computer, copied to the instance when joined to
// it (src/to-instance.ts, 05/10/2026): the computer read here, the instance
// written through its own RPC, like every forwarded call.
const TO_INSTANCE_GLUE = `// Generated by apps/baarali/packages/desktop/scripts/brand.mjs: not in the repository.
import fsp from 'node:fs/promises';
import { serverHostMode } from './server-host.js';
import { forwardRpc } from './rpc-forwarder.js';
import { createToInstance } from './baarali-to-instance-copy.js';

export const sendToInstance = createToInstance({
  remote: () => serverHostMode() === 'remote',
  stat: async (abs) => {
    const s = await fsp.lstat(abs);
    return { kind: s.isFile() ? 'file' : s.isDirectory() ? 'dir' : 'other', size: s.size };
  },
  readdir: async (abs) =>
    (await fsp.readdir(abs, { withFileTypes: true })).map((d) => ({
      name: d.name,
      kind: d.isFile() ? 'file' : d.isDirectory() ? 'dir' : 'other',
    })),
  readFile: async (abs) => (await fsp.readFile(abs)).toString('base64'),
  exists: async (rel) => ((await forwardRpc('workspace:exists', { path: rel })) as { exists: boolean }).exists,
  write: async (rel, data) => {
    await forwardRpc('workspace:writeFile', { path: rel, data, opts: { encoding: 'base64', mkdirp: true } });
  },
  root: async () => ((await forwardRpc('workspace:getRoot', null)) as { root: string }).root,
  now: Date.now,
});
`;

// Files the agent makes on the instance (a generated image), shown here
// (src/from-instance.ts, 05/10/2026): read on the instance through its
// workspace when they are not on this computer.
const FROM_INSTANCE_GLUE = `// Generated by apps/baarali/packages/desktop/scripts/brand.mjs: not in the repository.
import fsp from 'node:fs/promises';
import { serverHostMode } from './server-host.js';
import { forwardRpc } from './rpc-forwarder.js';
import { createFromInstance } from './baarali-from-instance-copy.js';

export const readFromInstance = createFromInstance({
  remote: () => serverHostMode() === 'remote',
  existsHere: (abs) => fsp.access(abs).then(() => true, () => false),
  root: async () => ((await forwardRpc('workspace:getRoot', null)) as { root: string }).root,
  read: async (rel) => {
    const res = (await forwardRpc('workspace:readFile', { path: rel, encoding: 'base64' })) as { data: string; stat: { size: number } };
    return { data: res.data, size: res.stat.size };
  },
});
`;

// What the agent says and seeds, in the core: the desktop app and the
// instance image both run it (decided 02/10/2026).
const LANGUAGE = `# Language
Reply in the language the user writes in, and keep to it until they switch. Write it the way a fluent native speaker would: simple, natural and warm, never a word-for-word translation. Keep names, code, file paths and quoted text as they are. Everything you write for the user follows this rule: notes, to-do items, summaries, titles, drafts; an email reply follows the language of the email it answers. With no message to go by (a background or scheduled task), use the language of the user's recent notes and messages, or French when unclear.

In French, address the user with « vous », never « tu », unless they ask you to.

# When you finish
The app folds your steps away; your last message is what the user reads. When a task took several steps (tools, files, a generation, an export), end with a short summary in this order: the result first (the file, in a filepath block, or the link); what you did, in two to four short bullets; what it used (export minutes, media credits) when it used any; what is left to decide, only if something is. Nothing before the result, no list of your steps. A simple question gets a simple answer.

`;

// The morning planner's doctrine in French (03/10/2026): the upstream's
// rules, kept one for one, worded for a small business here (a quote, an
// invoice, the bank). The English text joins the prior seeds, so a planner
// nobody edited is brought to it at the next start.
const PLANNER_FR = "// Baarali: the doctrine in French (scripts/brand.mjs).\nconst PLANNER_INSTRUCTIONS = `Chaque matin, propose QUELQUES choses à faire vraiment utiles pour la journée de l’utilisateur, ou aucune. Tu es en mode ACTION : ton seul effet est l’outil todo-propose ; note dans le journal une ligne sur ce que tu as proposé (ou que rien n’était nécessaire). Écris dans la langue de l’utilisateur (le français si tu as un doute), avec des mots simples.\n\nÉtapes, dans l’ordre :\n\n1. Lis ${PREFS_REL_PATH}. « Vos règles » passent avant « Appris » ; les deux passent avant les règles ci-dessous.\n2. Lis ${FEEDBACK_REL_PATH} : les résultats récents montrent ce que l’utilisateur aime. Les lignes « dismissed » ou « taught » n’étaient pas voulues (ne propose jamais rien de semblable) ; les lignes « ran » ou « kept » ont plu (propose-en d’autres du même genre).\n3. Lis todo.md et le fichier du mois dans todo/archive. Ne propose jamais le doublon d’une ligne existante ou archivée récemment. Si une ligne couvre déjà un sujet, ne fais rien à son propos.\n4. Cherche des idées UNIQUEMENT dans ces sources, par ordre d’importance, sur les 3 derniers jours de données synchronisées (gmail_sync/, calendar_sync/, granola_sync/, fireflies_sync/ : lis des fichiers récents précis, garde tes recherches grep étroites) :\n   1) Les engagements pris par l’utilisateur (« je vous envoie le devis vendredi » dans un e-mail envoyé ou une transcription de réunion) : c’est la meilleure source.\n   2) Les actions confiées à l’utilisateur dans les notes de réunion récentes (granola_sync/, fireflies_sync/ : transcriptions et listes d’actions).\n   3) Les échéances précises qui approchent : un paiement, un dossier à déposer, une livraison, un rendez-vous administratif.\n   4) Les e-mails importants restés sans réponse de l’utilisateur depuis 2 jours ou plus : un client, un fournisseur, un partenaire, la banque, l’administration.\n   5) Ce que l’utilisateur attend des autres et qui ne bouge plus depuis 3 jours ou plus : propose une relance (un devis pas encore signé, une facture pas encore payée, une réponse promise).\n   6) La préparation qu’une réunion importante d’aujourd’hui ou de demain demande vraiment (dans calendar_sync/ : un ordre du jour à écrire, des participants à connaître, un document à relire). Seulement quand la réunion le justifie ; ne propose jamais simplement d’y assister.\n5. LE FILTRE DES E-MAILS : chaque fichier gmail_sync/*.md porte une ligne \\`importance:\\` dans son en-tête, posée par le classement de l’app (qui apprend des corrections de l’utilisateur). Seuls les fils marqués \\`importance: important\\` peuvent donner des idées : trouve-les avec une recherche grep étroite sur \"importance: important\". Les fils marqués \\`importance: other\\` et les fichiers sans marque sont des lettres d’information, des notifications ou du bruit : ne les lis jamais pour chercher des idées, même si l’objet a l’air urgent.\n6. LE FILTRE DU DÉJÀ FAIT : un fichier de fil liste ses messages du plus ancien au plus récent, en blocs « ### From: ». Avant de proposer quoi que ce soit à partir d’un e-mail, regarde le DERNIER bloc. Si le message le plus récent vient de l’utilisateur, il a déjà répondu : ne propose jamais de répondre, de relancer ni de suivre ce fil. Le même test vaut partout : un engagement que des e-mails ou des notes plus récents montrent tenu, ou une action de réunion déjà faite, c’est terminé.\n7. Ne propose JAMAIS : la réponse à un e-mail courant (la page E-mail prépare déjà ces brouillons), d’assister à une réunion (le calendrier les montre ; la préparer peut se justifier, voir 4.6), ce qu’une routine fait déjà, une lettre d’information ou une notification automatique, ni une information sans action derrière.\n8. Limite : 3 propositions au plus. Une ou deux excellentes valent mieux que trois moyennes. ZÉRO est un bon résultat : si rien ne passe la barre, termine sobrement par « rien de nécessaire aujourd’hui ». La question à poser pour chaque idée : est-ce que l’ajouter à la liste change ce que l’utilisateur fait aujourd’hui ?\n9. Écris chaque ligne comme l’utilisateur l’écrirait : courte, concrète, qui commence par un verbe, avec le nom de la personne et l’échéance quand il y en a une (« Relancer M. Ouédraogo pour le devis promis jeudi »). Ajoute @baarali dans le texte SEULEMENT pour proposer un travail de préparation que tu peux faire toi-même (chercher, faire un plan, rassembler, résumer ; jamais rien qui part vers l’extérieur) ; il attend de toute façon l’accord de l’utilisateur.\n10. Envoie tes propositions avec todo-propose, ton seul stylo. Elles arrivent dans un bac de suggestions sur la page Tâches, où l’utilisateur accepte ou refuse chacune ; rien ne touche la liste et rien ne se lance sans son accord. N’utilise jamais todo-add, ne modifie jamais todo.md directement, ne lance jamais d’exécution.`;\n\n";

// The Chat codes by itself (03/10/2026): no subscription to an outside coding
// agent is needed. Its instructions when none is connected, and « connected »
// now means an engine is really installed, not only a switch turned on.
const CODE_SELF_FROM = "    : `**Code with Agents (disabled):** Code mode is currently OFF in the user's settings. Do NOT load \\`code-with-agents\\` and do NOT call acpx. Handle coding requests yourself with your normal tools if you can. After answering, add a final line letting the user know they can delegate coding to Claude Code or Codex by enabling Code Mode in Settings → Code Mode.`}";
const CODE_SELF_TO = "    : `**Coding (you do it yourself):** No coding agent is connected, and none is needed: you write the code yourself. Do NOT load \\`code-with-agents\\`, do NOT call acpx, and never tell the user to install, subscribe to or enable Claude Code, Codex or Code Mode. This machine is the account's own, isolated: you have the file tools (read, write, edit, glob, grep) and \\`executeCommand\\` with git, Node (node, npm, npx) and Python (python3, pip, venv); building and checking run without asking. Work like a careful developer:\n1. Unless the user names a folder, give each project its own folder under \\`projects/<short-name>/\\` in the workspace, and \\`git init\\` it.\n2. Say the plan in two or three short lines, then build it file by file. Prefer few, well-known dependencies.\n3. Run it, or its tests, with \\`executeCommand\\`, read the errors and fix them before you answer; do not hand over code you have not run. Commit each working step with a short message.\n4. When the user wants something to see and use (a tool, a dashboard, a calculator, a small site), build it as an app with the \\`apps\\` skill instead: an app opens right inside Baarali.\n5. Answer with what you built, where it is, and how to use it, in the user's words, without jargon. Ask before anything that leaves this machine (publishing, sending, paying) or deletes work.`}";

const TODO_SEED_FR = [
  'const SEED = `- [ ] Ajoutez votre première chose à faire : écrivez-la juste en dessous',
  '- [ ] @baarali présente-toi : que peux-tu faire pour moi ?',
  '- [ ] Retirez ce dont vous ne voulez pas : survolez la ligne et cliquez ✕ (elle va dans « Fait et écarté », plus bas, et peut revenir)',
  '`;',
].join('\n');

export function corePlan() {
  const core = 'apps/x/packages/core/src';
  return {
    edits: [
      edit(`${core}/runtime/assembly/compose-instructions.ts`, 'const USER_CONTEXT_SYSTEM_INSTRUCTIONS = `# Hidden User Context', `const USER_CONTEXT_SYSTEM_INSTRUCTIONS = \`${LANGUAGE.replace(/`/g, '\\`')}# Hidden User Context`),
      edit("apps/x/apps/server/src/router.ts", "import { isRpcChannel, type RpcHandlers } from './channels.js';", "import { isRpcChannel, type RpcHandlers } from './channels.js';\nimport { requireWorkChannel, WorkAccessError, WorkCheckError } from '@x/core/dist/baarali/work-runtime.js';"),
      edit("apps/x/apps/server/src/router.ts", "    try {\n      // eslint-disable-next-line @typescript-eslint/no-explicit-any", "    try {\n      await requireWorkChannel(channel, args);\n      // eslint-disable-next-line @typescript-eslint/no-explicit-any"),
      edit("apps/x/apps/server/src/router.ts", "    } catch (err) {\n      const message = err instanceof Error ? err.message : String(err);", "    } catch (err) {\n      if (err instanceof WorkAccessError || err instanceof WorkCheckError) return c.json({ error: { code: err.code, message: err.message } }, err.status);\n      const message = err instanceof Error ? err.message : String(err);"),
      edit(`${core}/runtime/assembly/registry.ts`, "export async function loadAgent(id: string): Promise<z.infer<typeof Agent>> {", "export async function loadAgent(id: string): Promise<z.infer<typeof Agent>> {\n    if (!Object.hasOwn(builtinAgents, id)) {\n        const { requireWork } = await import(\"../../baarali/work-runtime.js\");\n        await requireWork();\n    }"),
      edit(`${core}/runtime/assembly/headless.ts`, "    async start(options: HeadlessAgentOptions): Promise<HeadlessAgentHandle> {", "    async start(options: HeadlessAgentOptions): Promise<HeadlessAgentHandle> {\n        if (options.subUseCase === \"scheduled\" || options.useCase === \"background_task_agent\" || options.useCase === \"live_note_agent\" || options.useCase === \"todo_item_agent\") {\n            const { requireWork } = await import(\"../../baarali/work-runtime.js\");\n            await requireWork();\n        }"),
      edit(`${core}/runtime/tools/catalog.ts`, "// Native ToolDescriptors for a skill's declared tools.", "// BAARALI(13/10/2026): Work tools stay paid even when invoked from Chat,\n// a loaded skill, a legacy run or a resumed task. Preserve catalog order.\nfor (const name of new Set([\n    ...Object.keys(shellTools), ...Object.keys(codeAgentRunTools), ...Object.keys(codeTaskTools),\n    ...Object.keys(backgroundTaskTools), ...Object.keys(todoTools), ...Object.keys(baarasseurTools),\n    ...Object.keys(liveNoteTools), ...Object.keys(appDataTools), \"addMcpServer\", SPAWN_AGENT_TOOL_NAME,\n])) {\n    const tool = BuiltinTools[name];\n    const execute = tool?.execute;\n    if (execute) tool.execute = async (input, ctx) => {\n        const { requireWork } = await import(\"../../baarali/work-runtime.js\");\n        await requireWork();\n        return execute(input, ctx);\n    };\n}\n\n// Native ToolDescriptors for a skill's declared tools."),
      edit(`${core}/runtime/turns/bridges/real-tool-registry.ts`, "                    return runSpawnedAgent(input, {", "                    const { requireWork } = await import(\"../../../baarali/work-runtime.js\");\n                    await requireWork();\n                    return runSpawnedAgent(input, {"),
      edit(`${core}/mcp/mcp.ts`, "export async function executeTool(serverName: string, toolName: string, input: Record<string, unknown>): Promise<unknown> {", "export async function executeTool(serverName: string, toolName: string, input: Record<string, unknown>): Promise<unknown> {\n    const { freeMediaServer, requireWork } = await import(\"../baarali/work-runtime.js\");\n    const { isReaCleanup } = await import(\"../baarali/rea-config.js\");\n    if (!freeMediaServer(serverName) && !isReaCleanup(serverName, toolName, input)) await requireWork();"),
      // BAARALI(15/10/2026): cold native analysis can exceed the SDK's short
      // default. Give only REA its bounded deadline, and discard closed clients.
      edit(`${core}/mcp/mcp.ts`, 'const clients: Record<string, mcpState> = {};', 'import { reaConnection, reaScopeKey } from "../baarali/rea-scope.js";\nconst clients: Record<string, mcpState> = {};'),
      edit(`${core}/mcp/mcp.ts`, 'async function getClient(serverName: string): Promise<Client> {', 'async function getClient(serverName: string): Promise<Client> {\n    return reaConnection(reaScopeKey(serverName), Object.keys(clients).filter(key => clients[key].state === "connected"), () => openMcpClient(serverName));\n}\n\nasync function openMcpClient(serverName: string): Promise<Client> {'),
      edit(`${core}/mcp/mcp.ts`, '    const configKey = JSON.stringify(config);', '    serverName = reaScopeKey(serverName);\n    const configKey = JSON.stringify(config);'),
      edit(`${core}/mcp/mcp.ts`, '        const state = clients[serverName];', '        const state = clients[serverName] ?? (serverName === "baarali-rea" ? Object.entries(clients).find(([key]) => key.startsWith("baarali-rea:"))?.[1] : undefined);'),
      edit(`${core}/mcp/mcp.ts`, '        await client.connect(transport);', '        await client.connect(transport);\n        client.onclose = () => { if (clients[serverName]?.client === client) delete clients[serverName]; };'),
      // BAARALI(15/10/2026): REA's output contracts dominate discovery by
      // megabytes. Keep every callable input, not output validators, in model context.
      edit(`${core}/mcp/mcp.ts`, '        tools,\n        nextCursor,', '        tools: serverName === "baarali-rea" ? tools.map(({ outputSchema: _outputSchema, ...tool }) => tool) : tools,\n        nextCursor,'),
      edit(`${core}/mcp/mcp.ts`, '        arguments: input,\n    });', '        arguments: input,\n    }, undefined, serverName === "baarali-rea" ? { timeout: 600_000, maxTotalTimeout: 600_000 } : undefined);\n    if (serverName === "baarali-rea" && toolName === "close_binary" && !result.isError) await client.close();'),
      edit(`${core}/runtime/tools/exec-tool.ts`, 'export interface ToolContext {', 'import { hasReaScope, withReaScope } from "../../baarali/rea-scope.js";\n\nexport interface ToolContext {'),
      edit(`${core}/runtime/tools/exec-tool.ts`, 'export async function execTool(agentTool: z.infer<typeof ToolAttachment>, input: Record<string, unknown>, ctx?: ToolContext): Promise<unknown> {', 'export async function execTool(agentTool: z.infer<typeof ToolAttachment>, input: Record<string, unknown>, ctx?: ToolContext): Promise<unknown> {\n    if (ctx && !hasReaScope(ctx)) return withReaScope(ctx, () => execTool(agentTool, input, ctx));'),
      edit(`${core}/code-mode/acp/client.ts`, "import { getAgentLaunchSpec } from './agents.js';", "import { getAgentLaunchSpec } from './agents.js';\nimport { codeReaServers } from '../../baarali/rea-runtime.js';"),
      edit(`${core}/code-mode/acp/client.ts`, '    async newSession(): Promise<string> {\n        try {\n            const res = await this.withStartupTimeout(this.conn().newSession({ cwd: this.cwd, mcpServers: [] }));', '    async newSession(): Promise<string> {\n        try {\n            const mcpServers = await codeReaServers();\n            const res = await this.withStartupTimeout(this.conn().newSession({ cwd: this.cwd, mcpServers }));'),
      edit(`${core}/code-mode/acp/client.ts`, '    async loadSession(sessionId: string): Promise<void> {\n        try {\n            await this.withStartupTimeout(this.conn().loadSession({ sessionId, cwd: this.cwd, mcpServers: [] }));', '    async loadSession(sessionId: string): Promise<void> {\n        try {\n            const mcpServers = await codeReaServers();\n            await this.withStartupTimeout(this.conn().loadSession({ sessionId, cwd: this.cwd, mcpServers }));'),
      edit(`${core}/runtime/tools/exec-tool.ts`, "    switch (agentTool.type) {", "    const { reservedWorkPath, requireWork } = await import(\"../../baarali/work-runtime.js\");\n    if (agentTool.type === \"builtin\" && [\"file-writeText\", \"file-editText\", \"file-remove\", \"file-rename\", \"file-copy\", \"file-mkdir\"].includes(agentTool.name) && [input.path, input.from, input.to].some(reservedWorkPath)) await requireWork();\n\n    switch (agentTool.type) {"),

      // The first to-do list a person sees, written into their todo.md once.
      edit(
        `${core}/todo/fileops.ts`,
        "const SEED = `- [ ] Add your first to-do — just type below\n- [ ] @rowboat introduce yourself — what can you do here?\n- [ ] Dismiss anything you don't want — hover a row and hit ✕ (it lands in Done & dismissed below, restorable)\n`;",
        TODO_SEED_FR,
      ),
      // The planner's name; its doctrine stays the upstream's, which upgrades it.
      edit(`${core}/todo/planner-task.ts`, "const PLANNER_NAME = 'Morning planner';", "const PLANNER_NAME = 'Planificateur du matin';"),
      edit(`${core}/todo/planner-task.ts`, 'const PLANNER_INSTRUCTIONS = `Each morning,', 'const PLANNER_INSTRUCTIONS_EN = `Each morning,'),
      edit(`${core}/runtime/assembly/copilot/instructions.ts`, CODE_SELF_FROM, CODE_SELF_TO),
      // The agent's name is Baarali, never « Baarali Copilot » (09/10/2026).
      edit(`${core}/runtime/assembly/copilot/instructions.ts`, 'You are Rowboat Copilot - an AI assistant', 'You are Baarali - an AI assistant'),
      edit(`${core}/runtime/assembly/skills/builtin-tools/skill.ts`, 'The Rowboat copilot has access', 'Baarali, the assistant, has access'),
      edit(
        `${core}/runtime/assembly/connections.ts`,
        '        return (await repo.getConfig()).enabled;',
        "        if (!(await repo.getConfig()).enabled) return false;\n        // Baarali: on only with an engine really installed (brand.mjs).\n        const { isEngineProvisioned } = await import('../../code-mode/acp/engine-provisioner.js');\n        return isEngineProvisioned('claude') || isEngineProvisioned('codex');",
      ),
      // A Code session's own folder and branch carry our name: they show in the
      // terminal and in git. Sessions keep the path they were created with.
      edit(`${core}/code-mode/sessions/service.ts`, "return path.join(projectPath, '.rowboat', 'worktrees', sessionId);", "return path.join(projectPath, '.baarali', 'worktrees', sessionId);"),
      edit(`${core}/code-mode/sessions/service.ts`, 'const branch = `rowboat/${sessionId}`;', 'const branch = `baarali/${sessionId}`;'),
      // Meeting notes go to Meetings/baarali (the recorder, desktopPlan); the
      // old folder stays a source, so the notes already there keep showing.
      edit(
        `${core}/knowledge/sources/repo.ts`,
        "        artifactDir: path.join('knowledge', 'Meetings', 'rowboat'),\n        syncMode: 'file',\n        scopes: [],\n    },\n",
        "        artifactDir: path.join('knowledge', 'Meetings', 'rowboat'),\n        syncMode: 'file',\n        scopes: [],\n    },\n    {\n        id: 'baarali-meetings',\n        provider: 'meeting',\n        enabled: true,\n        artifactDir: path.join('knowledge', 'Meetings', 'baarali'),\n        syncMode: 'file',\n        scopes: [],\n    },\n",
      ),
      edit(`${core}/code-mode/git/service.ts`, "path.join(await fs.realpath(repoPath), '.rowboat', 'worktrees')", "path.join(await fs.realpath(repoPath), '.baarali', 'worktrees')"),
      edit(`${core}/todo/planner-task.ts`, 'const PLANNER_INSTRUCTIONS_PRIOR: string[] = [\n', `${PLANNER_FR}const PLANNER_INSTRUCTIONS_PRIOR: string[] = [\n    PLANNER_INSTRUCTIONS_EN,\n`),
      edit(
        `${core}/todo/planner-task.ts`,
        "items.find(t => t.name.toLowerCase().includes('planner') || t.slug.includes('planner'))",
        "items.find(t => /planner|planificateur/.test(t.name.toLowerCase()) || /planner|planificateur/.test(t.slug))",
      ),
    ],
    copies: [
      ['assets/mobile/work-access.ts', `${core}/baarali/work-access.ts`],
      ['assets/mobile/work-policy.ts', `${core}/baarali/work-policy.ts`],
      ['assets/work-runtime.ts', `${core}/baarali/work-runtime.ts`],
      ['assets/rea-config.ts', `${core}/baarali/rea-config.ts`],
      ['assets/rea-runtime.ts', `${core}/baarali/rea-runtime.ts`],
      ['assets/rea-scope.ts', `${core}/baarali/rea-scope.ts`],
    ],
  };
}


export function desktopPlan() {
  const main = 'apps/x/apps/main';
  const renderer = 'apps/x/apps/renderer/src';
  return {
    edits: [
      ...desktopLayoutEdits(),
      edit("apps/x/apps/main/src/ipc.ts", "import { forwardRpc, shouldForwardChannel } from './rpc-forwarder.js';", "import { forwardRpc, shouldForwardChannel } from './rpc-forwarder.js';\nimport { requireWorkChannel } from '@x/core/dist/baarali/work-runtime.js';"),
      edit(`${renderer}/components/motion-studio.tsx`, "import '@hyperframes/player'", "import '@hyperframes/player'\nimport { isMotionImage, canPreviewMotionExport } from './motion-export-image'\nimport { CadEditor } from './cad-editor'"),
      edit(`${renderer}/components/motion-studio.tsx`, '<button type="button" onClick={onReload}', '<CadEditor onProject={onProject} />\n        <button type="button" onClick={onReload}'),
      edit(`${renderer}/components/motion-studio.tsx`, '<ExportPanel project={project}', '<CadEditor project={project} onProject={onProject} />\n          <ExportPanel project={project}'),
      edit(`${renderer}/components/motion-studio.tsx`, '    if (!holder) return', '    if (!holder || (watching && isMotionImage(watching))) return'),
      edit(`${renderer}/components/motion-studio.tsx`, '<div ref={holderRef} className="absolute inset-0" />', '<div ref={holderRef} className="absolute inset-0">{watching && isMotionImage(watching) ? <img src={url(watching)} alt="Export preview" className="h-full w-full object-contain" /> : null}</div>'),
      edit(`${renderer}/components/motion-studio.tsx`, '<button type="button" aria-label="Play" onClick={() => setWatching(f.path)} className="rounded border border-border p-1 text-muted-foreground hover:text-foreground"><PlayIcon className="size-3" /></button>', '{canPreviewMotionExport(f.path) && <button type="button" aria-label="Play" onClick={() => setWatching(f.path)} className="rounded border border-border p-1 text-muted-foreground hover:text-foreground"><PlayIcon className="size-3" /></button>}'),
      edit("apps/x/apps/main/src/ipc.ts", "      // Call handler (or the migrated channel's HTTP twin)", "      if (!forwarded) await requireWorkChannel(channel, args);\n\n      // Call handler (or the migrated channel's HTTP twin)"),

      edit(`${renderer}/components/plans-dialog.tsx`, "import type { BillingInfo, PlanOffer, PlanOffers } from '@x/shared/src/billing.js'", "import type { BillingInfo, PlanOffer, PlanOffers } from '@x/shared/src/billing.js'\nimport { withPlanAccess } from '@/lib/plan-access-copy'"),
      edit(`${renderer}/components/plans-dialog.tsx`, "                setOffers(result)", "                setOffers(result ? withPlanAccess(result) : null)"),
      edit(`${renderer}/components/settings/account-settings.tsx`, "import { openPlans } from '@/lib/plans-window'", "import { openPlans } from '@/lib/plans-window'\nimport { withPlanAccess } from '@/lib/plan-access-copy'"),
      edit(`${renderer}/components/settings/account-settings.tsx`, "setOffers(result?.plans ?? null)", "setOffers(result ? withPlanAccess(result).plans : null)"),

      edit(`${main}/forge.config.cjs`, "appBundleId: 'com.rowboat.app',", `appBundleId: '${BRAND.bundleId}',`),
      edit(`${main}/forge.config.cjs`, "authors: 'rowboatlabs',", `authors: '${BRAND.publisher}',`),
      edit(
        `${main}/forge.config.cjs`,
        "iconUrl: 'https://raw.githubusercontent.com/rowboatlabs/rowboat/main/apps/x/apps/main/icons/icon.ico',",
        `iconUrl: 'https://raw.githubusercontent.com/${BRAND.repo}/main/apps/baarali/packages/desktop/assets/icon.ico',`,
      ),
      edit(`${main}/forge.config.cjs`, "owner: 'rowboatlabs',\n                    name: 'rowboat'", `owner: '${BRAND.repo.split('/')[0]}',\n                    name: '${BRAND.repo.split('/')[1]}'`),
      edit(`${main}/forge.config.cjs`, '    hooks: {\n', `    hooks: {\n${ADHOC_SIGN}`),
      edit(
        `${main}/src/main.ts`,
        "import { initUpdater } from \"./updater.js\";",
        "import { initUpdater } from \"./updater.js\";\nimport { startBaaraliCloud } from \"./baarali-cloud.js\";",
      ),
      edit(
        `${main}/src/main.ts`,
        "  startServerHost().catch((error) => {\n    console.error('[server-host] failed to start rowboat-server:', error);\n  });",
        "  startServerHost().catch((error) => {\n    console.error('[server-host] failed to start rowboat-server:', error);\n  });\n  startBaaraliCloud();",
      ),
      // Baarali's sign-in stays on the device, never the instance (src/cloud-link.ts staysOnDevice).
      edit(
        `${main}/src/ipc.ts`,
        "import { forwardRpc, shouldForwardChannel } from './rpc-forwarder.js';\n",
        "import { forwardRpc, shouldForwardChannel } from './rpc-forwarder.js';\nimport { staysOnDevice } from './baarali-cloud-link.js';\nimport { serverHostMode } from './server-host.js';\n",
      ),
      edit(
        `${main}/src/ipc.ts`,
        '      const result = forwarded ? await forwardRpc(channel, args) : await handler(event, args);',
        '      const result = forwarded && !staysOnDevice(channel, args, serverHostMode()) ? await forwardRpc(channel, args) : await handler(event, args);',
      ),
      // Baarali's sign-in opens in a window of the app, not the browser
      // (src/sign-in-window.ts): in the app's own core and in its server's.
      edit(
        `${main}/src/main.ts`,
        'import { registerUrlOpener } from "@x/core/dist/auth/url-opener.js";\n',
        'import { registerUrlOpener } from "@x/core/dist/auth/url-opener.js";\nimport { openBaaraliUrl } from "./baarali-sign-in.js";\n',
      ),
      edit(`${main}/src/main.ts`, '    open: (url) => shell.openExternal(url),', '    open: (url) => openBaaraliUrl(url),'),
      edit(
        `${main}/src/server-host.ts`,
        "import { textInsertService } from './text-insert.js';\n",
        "import { textInsertService } from './text-insert.js';\nimport { openBaaraliUrl } from './baarali-sign-in.js';\n",
      ),
      edit(`${main}/src/server-host.ts`, '        await shell.openExternal((payload as { url: string }).url);', '        await openBaaraliUrl((payload as { url: string }).url);'),
      // Files and folders picked on the computer reach the instance (src/to-instance.ts).
      edit(
        `${main}/src/ipc.ts`,
        "import { staysOnDevice } from './baarali-cloud-link.js';\n",
        "import { staysOnDevice } from './baarali-cloud-link.js';\nimport { sendToInstance } from './baarali-to-instance.js';\n",
      ),
      edit(`${main}/src/ipc.ts`, '      return { paths: args.paths, skipped: [] };', '      return sendToInstance(args);'),
      // What the agent makes on the instance shows here (src/from-instance.ts).
      edit(
        `${main}/src/ipc.ts`,
        "import { sendToInstance } from './baarali-to-instance.js';\n",
        "import { sendToInstance } from './baarali-to-instance.js';\nimport { readFromInstance } from './baarali-from-instance.js';\n",
      ),
      edit(
        `${main}/src/ipc.ts`,
        "    'shell:readFileBase64': async (_event, args) => {\n",
        "    'shell:readFileBase64': async (_event, args) => {\n      const fromInstance = await readFromInstance(args.path);\n      if (fromInstance) return fromInstance;\n",
      ),
      // The brand's colours, loaded after App.css (src/baarali-theme.css).
      edit('apps/x/apps/renderer/src/main.tsx', "import App from './App.tsx'\n", "import App from './App.tsx'\nimport './baarali-theme.css'\n"),
      // French (src/i18n/), first of all so dates are French from the start.
      edit('apps/x/apps/renderer/src/main.tsx', "import { StrictMode } from 'react'\n", "import './baarali-i18n/index.ts'\nimport { StrictMode } from 'react'\n"),
      edit(`${main}/src/main.ts`, 'import "./node-guard.js";\n', 'import "./node-guard.js";\nimport "./baarali-i18n-glue.js";\n'),
      // The handle where the UI writes it without its @ (see HANDLE).
      edit(`${renderer}/components/markdown-editor.tsx`, "if (query === 'rowboat') {", "if (query === 'baarali' || query === 'rowboat') {"),
      edit(
        `${renderer}/components/spaces/mention-autocomplete.tsx`,
        "if ('rowboat'.startsWith(q)) people.push({ id: 'rowboat', label: 'rowboat',",
        "if ('baarali'.startsWith(q)) people.push({ id: 'rowboat', label: 'baarali',",
      ),
      // A line about people (« Awa joined »), translated with its names kept (i18n PEOPLE).
      edit(`${renderer}/components/spaces/membership-line.tsx`, '<span className="min-w-0 truncate">{membershipLineText(', '<span className="min-w-0 truncate" data-baarali-people>{membershipLineText('),
      edit(`${renderer}/components/spaces/composer.tsx`, "attrs: { kind: 'rowboat', id: null, label: 'rowboat' }", "attrs: { kind: 'rowboat', id: null, label: 'baarali' }"),
      // The assistant's mark is Baarali's B, eyes cut out so they take the
      // colour behind (the blue tile of « Discuter avec Baarali »).
      // Employés wears the mascot, the B on two feet (decided 09/10/2026).
      edit(`${renderer}/components/sidebar-content.tsx`, '  BriefcaseBusiness,\n', ''),
      edit(`${renderer}/components/sidebar-content.tsx`, '        <BriefcaseBusiness className="size-4 shrink-0" />', '        <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true"><g transform="translate(12 12) scale(0.064) translate(-505 -422)" fill="currentColor" stroke="none"><path fillRule="evenodd" d="M450 250H502C574 250 612 280 612 322C612 345 602 360 590 368Q584 373 590 378C612 388 626 408 626 436C626 476 590 502 512 502H450C413 502 384 473 384 436V316C384 279 413 250 450 250ZM478 330a22 22 0 1 0 44 0a22 22 0 1 0 -44 0ZM534 330a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z" /><path d="M422 556a38 38 0 1 0 76 0a38 38 0 1 0 -76 0ZM514 556a38 38 0 1 0 76 0a38 38 0 1 0 -76 0Z" /></g></svg>'),
      edit(`${renderer}/components/talking-head.tsx`, '      <g transform="translate(12 12) scale(0.0245) translate(-497 -489)" strokeWidth="61">\n        <path d="M 158 487 C 330 330, 620 180, 837 148 C 820 480, 640 720, 498 830 Q 550 720, 569 623 C 560 540, 450 440, 352 413 Q 250 440, 158 487 Z" />\n      </g>', '      <g transform="translate(12 12) scale(0.064) translate(-505 -422)" fill="currentColor" stroke="none">\n        <path fillRule="evenodd" d="M450 250H502C574 250 612 280 612 322C612 345 602 360 590 368Q584 373 590 378C612 388 626 408 626 436C626 476 590 502 512 502H450C413 502 384 473 384 436V316C384 279 413 250 450 250ZM478 330a22 22 0 1 0 44 0a22 22 0 1 0 -44 0ZM534 330a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z" />\n        <path d="M422 556a38 38 0 1 0 76 0a38 38 0 1 0 -76 0ZM514 556a38 38 0 1 0 76 0a38 38 0 1 0 -76 0Z" />\n      </g>'),
      // The handle on a to-do handed to the assistant.
      // The recorder's notes land in Meetings/baarali (corePlan adds the source).
      edit(`${renderer}/hooks/useMeetingTranscription.ts`, 'let notePath = `knowledge/Meetings/rowboat/${dateFolder}/${filename}.md`;', 'let notePath = `knowledge/Meetings/baarali/${dateFolder}/${filename}.md`;'),
      edit(`${renderer}/hooks/useMeetingTranscription.ts`, 'if (exists) notePath = `knowledge/Meetings/rowboat/${dateFolder}/${filename}-${timestamp}.md`;', 'if (exists) notePath = `knowledge/Meetings/baarali/${dateFolder}/${filename}-${timestamp}.md`;'),
      edit(`${renderer}/components/todo-view.tsx`, '<Bot className="size-3" />\n              rowboat\n', '<Bot className="size-3" />\n              baarali\n'),
      edit(`${renderer}/components/spaces/composer-editor.ts`, "getAttrs: () => ({ kind: 'rowboat', id: null, label: 'rowboat' })", "getAttrs: () => ({ kind: 'rowboat', id: null, label: 'baarali' })"),
      // BAARALI(11/10/2026): Chargement keeps the B compact and readable
      // throughout page and chat waits, as requested by the founder.
      edit(`${renderer}/components/work-steps.tsx`, "import * as React from 'react'", "import * as React from 'react'\nimport { BaaraliMark } from '@/components/baarali-mark'"),
      edit(`${renderer}/components/work-steps.tsx`, '<span className="text-foreground">Baarali is working…</span>', '<BaaraliMark motion="loading" size={32} className="text-foreground" />\n            <span className="text-foreground">Baarali is working…</span>'),
      edit(`${renderer}/components/reasoning-row.tsx`, "import { ChevronDownIcon, LoaderIcon } from 'lucide-react'", "import { ChevronDownIcon } from 'lucide-react'\nimport { BaaraliMark } from '@/components/baarali-mark'"),
      edit(`${renderer}/components/reasoning-row.tsx`, '<span className={quietRowGlyphSlotClass}>', '<span className={cn(quietRowGlyphSlotClass, isStreaming && "!h-8 !w-8")}>'),
      edit(`${renderer}/components/reasoning-row.tsx`, '<LoaderIcon className="size-3 animate-spin text-muted-foreground" />', '<BaaraliMark motion="loading" size={32} className="text-foreground" />'),
    ],
    copies: [
      ['assets/desktop/workspace.tsx', `${renderer}/components/desktop-workspace.tsx`],
      ['assets/desktop/workspace.fixture.tsx', `${renderer}/components/desktop-workspace.test.tsx`],
      ['assets/desktop/code-home.fixture.tsx', `${renderer}/components/desktop-code-home.test.tsx`],
      ['assets/desktop/chat-empty-state.tsx', `${renderer}/components/chat-empty-state.tsx`],
      ['assets/desktop/code-home.tsx', `${renderer}/components/desktop-code-home.tsx`],
      ['assets/desktop/studio-library.tsx', `${renderer}/components/desktop-studio-library.tsx`],
      ['assets/mobile/work-access.ts', `${renderer}/lib/work-access.ts`],
      ['../control/src/plan-access-copy.ts', `${renderer}/lib/plan-access-copy.ts`],
      ['../control/src/oval-b.ts', `${renderer}/lib/baarali-oval-motion.ts`],
      ['assets/motion/baarali-mark.tsx', `${renderer}/components/baarali-mark.tsx`],
      ['assets/motion/motion-export-image.ts', `${renderer}/components/motion-export-image.ts`],
      ['assets/motion/cad-editor.tsx', `${renderer}/components/cad-editor.tsx`],
      ['assets/motion/cad-editor-page.ts', `${renderer}/components/cad-editor-page.ts`],
      ['assets/motion/cad-editor-client.ts', `${renderer}/components/cad-editor-client.ts`],
      ['../instance/src/cad-scene.ts', `${renderer}/components/cad-scene.ts`],
      ['assets/motion/baarali-logo.tsx', `${renderer}/components/baarali-logo.tsx`],
      ['assets/motion/turn-activity-indicator.tsx', `${renderer}/components/turn-activity-indicator.tsx`],
      ['assets/motion/onboarding-duo.tsx', `${renderer}/components/baarali-onboarding/duo.tsx`],
      ['assets/icon.icns', `${main}/icons/icon.icns`],
      ['assets/icon.ico', `${main}/icons/icon.ico`],
      ['assets/icon.png', `${main}/icons/icon.png`],
      ['assets/install-loading.gif', `${main}/icons/install-loading.gif`],
      ['assets/logo-only.png', 'apps/x/apps/renderer/public/logo-only.png'],
      ['src/cloud-link.ts', `${main}/src/baarali-cloud-link.ts`],
      ['src/apps-relay.ts', `${main}/src/baarali-apps-relay.ts`],
      ['src/sign-in-window.ts', `${main}/src/baarali-sign-in-window.ts`],
      ['src/to-instance.ts', `${main}/src/baarali-to-instance-copy.ts`],
      ['src/from-instance.ts', `${main}/src/baarali-from-instance-copy.ts`],
      ['src/baarali-theme.css', 'apps/x/apps/renderer/src/baarali-theme.css'],
      // The site's fonts, read by baarali-theme.css (03/10/2026).
      ...['inter.woff2', 'source-serif-4.woff2'].map((f) => [`assets/fonts/${f}`, `apps/x/apps/renderer/src/baarali-fonts/${f}`]),
      ...['index.ts', 'translate.ts', 'fr.ts'].map((f) => [`src/i18n/${f}`, `apps/x/apps/renderer/src/baarali-i18n/${f}`]),
      ...['main.ts', 'translate.ts', 'fr.ts'].map((f) => [`src/i18n/${f}`, `${main}/src/baarali-i18n/${f}`]),
    ],
    writes: [
      [`${main}/src/baarali-cloud.ts`, CLOUD_GLUE],
      [`${main}/src/baarali-i18n-glue.ts`, I18N_MAIN_GLUE],
      [`${main}/src/baarali-sign-in.ts`, SIGN_IN_GLUE],
      [`${main}/src/baarali-to-instance.ts`, TO_INSTANCE_GLUE],
      [`${main}/src/baarali-from-instance.ts`, FROM_INSTANCE_GLUE],
    ],
    packageJson: {
      file: `${main}/package.json`,
      set: { productName: BRAND.name, description: BRAND.description },
    },
  };
}

// The mobile app (decided 02/10/2026): name, icons, the blue accent, its
// screens in the person's language (src/i18n/mobile/), and none of the
// upstream's Expo account, App Store keys or project id.
const MOBILE_BABEL = `// Generated by apps/baarali/packages/desktop/scripts/brand.mjs: not in the repository.
const path = require('path');
const { createRequire } = require('module');
const fromExpo = createRequire(require.resolve('expo/package.json'));

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [fromExpo.resolve('babel-preset-expo')],
    plugins: [[require.resolve('./baarali-i18n/babel-plugin.cjs'), { runtime: path.join(__dirname, 'src/baarali-i18n/mobile/runtime.ts') }]],
  };
};
`;

const MOBILE_PERMISSIONS = {
  en: {
    NSCameraUsageDescription: 'The camera is used to scan the pairing code shown in Baarali on your Mac, and for video calls with your agents.',
    NSMicrophoneUsageDescription: 'The microphone is used to talk to your Baarali agents with voice.',
    NSLocalNetworkUsageDescription: 'Baarali connects to the Baarali app on your Mac over your local network.',
  },
  fr: {
    CFBundleDisplayName: 'Baarali',
    NSCameraUsageDescription: 'L’appareil photo sert à scanner le code d’association affiché par Baarali sur votre Mac, et aux appels vidéo avec vos agents.',
    NSMicrophoneUsageDescription: 'Le micro sert à parler à vos agents Baarali à la voix.',
    NSLocalNetworkUsageDescription: 'Baarali se connecte à l’app Baarali de votre Mac sur votre réseau local.',
  },
};

/** Our Spaces server (apps/baarali/packages/spaces). */
const SPACES_URL = 'https://spaces.baarali.com';

/** The phone app's identifier, on both stores. */
const MOBILE_ID = `${BRAND.bundleId}.mobile`;

export function mobilePlan() {
  const mobile = 'apps/x/apps/mobile';
  return {
    edits: [
      edit(`${mobile}/src/app/_layout.tsx`, "    </GestureHandlerRootView>", "      </AppThemeProvider>\n    </GestureHandlerRootView>"),
      edit(`${mobile}/src/app/_layout.tsx`, "<Stack.Screen name=\"settings\" options={{ title: 'Settings' }} />", "<Stack.Screen name=\"settings\" options={{ title: 'Settings' }} />\n            <Stack.Screen name=\"plans\" options={{ title: 'Plans' }} />"),
      edit(`${mobile}/src/lib/voice.ts`, "import { useCallback, useEffect, useRef, useState } from 'react';", "import { useCallback, useEffect, useRef, useState } from 'react';\nimport { DeviceEventEmitter } from 'react-native';"),
      edit(`${mobile}/src/lib/voice.ts`, "  const set = useCallback((next: boolean) => {", "  useEffect(() => { const sub = DeviceEventEmitter.addListener('baarali:readAloud', setOn); return () => sub.remove(); }, []);\n  const set = useCallback((next: boolean) => {"),
      edit(`${mobile}/src/lib/voice.ts`, "    setOn(next);\n    if (!next)", "    setOn(next);\n    DeviceEventEmitter.emit('baarali:readAloud', next);\n    if (!next)"),
      edit(`${mobile}/src/app/inbox.tsx`, "  // The plan and the week's use live in Settings on the phone.\n  else if (n.target === 'plans' || n.target === 'usage') router.push('/settings');", "  // BAARALI(13/10/2026): mobile notifications open the same quota or offer shown on desktop.\n  else if (n.target === 'plans') router.push('/plans');\n  else if (n.target === 'usage') router.push({ pathname: '/settings', params: { section: 'usage' } });"),
      edit(`${mobile}/src/components/announcement-banner.tsx`, "  // The plan and the week's use live in Settings on the phone.\n  else if (a.target === 'plans' || a.target === 'usage') router.push('/settings');", "  // BAARALI(13/10/2026): mobile notifications open the same quota or offer shown on desktop.\n  else if (a.target === 'plans') router.push('/plans');\n  else if (a.target === 'usage') router.push({ pathname: '/settings', params: { section: 'usage' } });"),
      // The accent: the brand's blue on the system's neutrals, as on the desktop.
      // BAARALI(12/10/2026): normal-size action labels need 4.5:1 contrast;
      // dark mode keeps a brighter blue with dark text, including chat bubbles.
      edit(`${mobile}/src/theme/colors.ts`, "  accent: '#000000',\n  onAccent: '#ffffff',", "  accent: '#196bff',\n  onAccent: '#ffffff',"),
      edit(`${mobile}/src/theme/colors.ts`, "  accent: '#ffffff',\n  onAccent: '#000000',", "  accent: '#4d8dff',\n  onAccent: '#000000',"),
      // BAARALI(12/10/2026): Expo config uses a global status bar, so its
      // declarative component follows appearance changes across all routes.
      edit(`${mobile}/src/app/_layout.tsx`, "import * as SplashScreen from 'expo-splash-screen';", "import * as SplashScreen from 'expo-splash-screen';\nimport { StatusBar } from 'expo-status-bar';\nimport { AppThemeProvider } from '@/lib/app-theme';"),
      edit(`${mobile}/src/app/_layout.tsx`, "    <GestureHandlerRootView style={{ flex: 1 }}>", "    <GestureHandlerRootView style={{ flex: 1 }}>\n      <AppThemeProvider>\n      <StatusBar style=\"auto\" />"),
      // BAARALI(13/10/2026): Work checks paid plan entitlement at its own
      // routes, including deep links, before protected children mount.
      edit(`${mobile}/src/app/_layout.tsx`, "import { SpacesAccountProvider } from '@/lib/spaces/account';", "import { SpacesAccountProvider } from '@/lib/spaces/account';\nimport { WorkAccessProvider } from '@/lib/work-access-provider';"),
      edit(`${mobile}/src/app/_layout.tsx`, '          <PushRegistrar />', '          <WorkAccessProvider>\n          <PushRegistrar />'),
      edit(`${mobile}/src/app/_layout.tsx`, '          </SpacesAccountProvider>', '          </WorkAccessProvider>\n          </SpacesAccountProvider>'),
      ...[['tasks', 'TasksScreen'], ['routines', 'RoutinesScreen'], ['projects', 'ProjectsScreen'], ['apps', 'AppsScreen']].flatMap(([route, name]) => [
        edit(`${mobile}/src/app/${route}.tsx`, "import { useColors } from '@/theme/colors';", "import { useColors } from '@/theme/colors';\nimport { WorkGate } from '@/components/work-gate';"),
        edit(`${mobile}/src/app/${route}.tsx`, `export default function ${name}() {`, `export default function ${name}() { return <WorkGate chrome={false}><${name}Content /></WorkGate>; }\n\nfunction ${name}Content() {`),
      ]),
      ...[['baarasseurs', 'BaarasseursLayout'], ['notes', 'NotesLayout']].flatMap(([route, name]) => [
        edit(`${mobile}/src/app/${route}/_layout.tsx`, "import { BackButton } from '@/components/back-button';", "import { BackButton } from '@/components/back-button';\nimport { WorkGate } from '@/components/work-gate';"),
        edit(`${mobile}/src/app/${route}/_layout.tsx`, `export default function ${name}() {`, `export default function ${name}() { return <WorkGate><${name}Content /></WorkGate>; }\n\nfunction ${name}Content() {`),
      ]),
      edit(`${mobile}/src/app/projects.tsx`, 'params: { id: sessionId }', "params: { id: sessionId, mode: 'work' }"),
      edit(`${mobile}/src/app/projects.tsx`, 'params: { id: c.id }', "params: { id: c.id, mode: 'work' }"),
      edit(`${mobile}/src/app/apps.tsx`, "params: { id: '', draft: text }", "params: { id: '', draft: text, mode: 'work' }"),
      edit(`${mobile}/src/app/routines.tsx`, "params: { id: '' }", "params: { id: '', mode: 'work' }"),
      edit(`${mobile}/src/app/studio.tsx`, "params: { id: params.chat ?? '', draft }", "params: { id: params.chat ?? '', draft, mode: 'work' }"),
      // BAARALI(11/10/2026): the approved furry sign-in guide owns its image;
      // the previous welcome-page sailboat anchor is no longer on this route.
      // Never the upstream's Spaces fleet: ours (decided 02/10/2026,
      // packages/spaces). A build with EXPO_PUBLIC_SPACES_APEX empty opens on
      // « Connect your Mac » and Spaces says it is coming.
      edit(`${mobile}/src/lib/spaces/account.tsx`, "process.env.EXPO_PUBLIC_SPACES_APEX ?? 'https://spaces.x.rowboatlabs.com';", `process.env.EXPO_PUBLIC_SPACES_APEX ?? '${SPACES_URL}';`),
      edit(
        `${mobile}/src/lib/spaces/account.tsx`,
        '    const issuer = await discoverIssuer(APEX_URL);',
        "    if (!APEX_URL) throw new Error('Team spaces are coming to Baarali soon.');\n    const issuer = await discoverIssuer(APEX_URL);",
      ),
      edit(`${mobile}/src/app/index.tsx`, "import { ONBOARDED_KEY } from './onboarding';", "import { ONBOARDED_KEY } from './onboarding';\nimport { APEX_URL } from '@/lib/spaces/account';"),
      edit(`${mobile}/src/app/index.tsx`, "<Redirect href={onboarded ? '/spaces' : '/onboarding'} />", "<Redirect href={onboarded ? (APEX_URL ? '/spaces' : '/pairing') : '/onboarding'} />"),
      edit(`${mobile}/src/components/baarali-onboarding.tsx`, "import { useColors } from '@/theme/colors';", "import { useColors } from '@/theme/colors';\nimport { APEX_URL } from '@/lib/spaces/account';"),
      edit(`${mobile}/src/components/baarali-onboarding.tsx`, "    router.replace('/spaces');", "    router.replace(APEX_URL ? '/spaces' : '/pairing');"),
      // BAARALI(11/10/2026): Chargement accompanies onboarding and chat
      // without unfolding across the page. Avatars keep their own images.
      edit(`${mobile}/src/components/baarali-onboarding.tsx`, "import { BaaraliMascot, BaaraliMascotImage } from '@/components/baarali-mascot';", "import { BaaraliMark } from '@/components/baarali-mark';"),
      edit(`${mobile}/src/components/baarali-onboarding.tsx`, '<BaaraliMascotImage size={32} />', '<BaaraliMark size={32} motion="loading" color="#FFFFFF" />'),
      edit(`${mobile}/src/components/baarali-onboarding.tsx`, '<BaaraliMascot size={70} motion="focus" />', '<BaaraliMark size={48} motion="loading" color="#FFFFFF" />'),
      edit(`${mobile}/src/components/baarali-onboarding.tsx`, '<BaaraliMascot size={mascotSize} motion="welcome" />', '<BaaraliMark size={mascotSize} motion="loading" color="#FFFFFF" />'),
      edit(`${mobile}/src/components/baarali-onboarding.tsx`, '<BaaraliMascot size={62} motion="success" />', '<BaaraliMark size={62} motion="loading" color="#FFFFFF" />'),
      // BAARALI(12/10/2026): the approved B also guides sign-in; keep the form
      // and its live instructions attached to the existing account flow.
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, "import { BaaraliMascot, type MascotMotion } from './baarali-mascot';", "import { BaaraliMark } from './baarali-mark';\nimport { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';"),
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, '{hint}</Text>', '{translate(hint)}</Text>'),
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, "import { useState } from 'react';\n", ''),
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, '  const [focused, setFocused] = useState(false);\n', ''),
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, "  const motion: MascotMotion = error ? 'error' : busy ? 'waiting' : step === 'code' && code.length === 6 ? 'success' : focused ? 'focus' : step === 'code' ? 'idle' : 'welcome';\n", ''),
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, '<BaaraliMascot size={168} motion={motion} />', '<BaaraliMark size={168} motion="loading" />'),
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, 'onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholderTextColor={colors.tertiaryLabel}\n              autoCapitalize=', 'placeholderTextColor={colors.tertiaryLabel}\n              autoCapitalize='),
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, 'onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholderTextColor={colors.tertiaryLabel}\n              keyboardType=', 'placeholderTextColor={colors.tertiaryLabel}\n              keyboardType='),
      edit(`${mobile}/src/components/baarali-sign-in-view.tsx`, 'onPress={() => { setFocused(false); onChange(); }}', 'onPress={onChange}'),
      // BAARALI(13/10/2026): Chat / Work and the sidebar replace
      // bottom navigation. Deeper team and email routes keep native back.
      edit(`${mobile}/src/app/_layout.tsx`, "import { BackButton } from '@/components/back-button';", "import { TopNavigation } from '@/components/top-navigation';"),
      edit(`${mobile}/src/app/_layout.tsx`, '                headerLeft: () => <BackButton />,', "                header: ({ route }) => <TopNavigation mode={(route.params as { mode?: string } | undefined)?.mode === 'work' ? 'work' : 'chat'} />,"),
      edit(`${mobile}/src/app/(tabs)/email/_layout.tsx`, "import { Stack } from 'expo-router';", "import { Stack } from 'expo-router';\nimport { TopNavigation } from '@/components/top-navigation';"),
      edit(`${mobile}/src/app/(tabs)/email/_layout.tsx`, "options={{ title: 'Email', headerLargeTitle: true }}", "options={{ title: 'Email', header: () => <TopNavigation mode=\"work\" /> }}"),
      edit(`${mobile}/src/app/chat.tsx`, "  const top = embedded ? 8 : insets.top + 52;", "  const top = embedded ? 8 : insets.top + (baarasseur && id ? 100 : 60);"),
      edit(`${mobile}/src/app/chat.tsx`, "top: insets.top + 6, left: 64, right: 16", "top: insets.top + 56, left: 20, right: 16"),
      edit(`${mobile}/src/app/studio.tsx`, "import { phoneLang } from '@/lib/baarasseurs';", "import { phoneLang } from '@/lib/baarasseurs';\nimport { StudioLibrary } from '@/components/studio-library';"),
      edit(`${mobile}/src/app/studio.tsx`, "import { StudioLibrary } from '@/components/studio-library';", "import { StudioLibrary } from '@/components/studio-library';\nimport { StudioCadFiles } from '@/components/studio-cad-files';"),
      edit(`${mobile}/src/app/studio.tsx`, '<Button label="Retouch" onPress={() => retouch(fr ? `Dans « ${name} », ` : `In « ${name} », `)} />\n      </View>', '<Button label="Retouch" onPress={() => retouch(fr ? `Dans « ${name} », ` : `In « ${name} », `)} />\n      </View>\n      <StudioCadFiles project={project} onProject={(next) => { setTime(0); setPlaying(false); setProject(next); }} />'),
      edit(`${mobile}/src/app/studio.tsx`, 'export default function StudioScreen() {', 'export default function StudioScreen() {\n  const { project } = useLocalSearchParams<{ project?: string }>();\n  return project ? <StudioProjectScreen /> : <StudioLibrary />;\n}\n\nfunction StudioProjectScreen() {'),
      edit(`${mobile}/src/app/studio.tsx`, "import { StudioLibrary } from '@/components/studio-library';", "import { StudioLibrary } from '@/components/studio-library';\nimport { WorkGate } from '@/components/work-gate';"),
      edit(`${mobile}/src/app/studio.tsx`, '  return project ? <StudioProjectScreen /> : <StudioLibrary />;', '  return <WorkGate>{project ? <StudioProjectScreen /> : <StudioLibrary />}</WorkGate>;'),
      edit(`${mobile}/src/components/turn-view.tsx`, "import { useState } from 'react';", "import { useState } from 'react';\nimport { BaaraliMark } from './baarali-mark';\nimport { useColors } from '@/theme/colors';"),
      edit(`${mobile}/src/components/turn-view.tsx`, "import { ChatMarkdown } from './markdown';", "import { ChatMarkdown } from './markdown';\nimport { ReplyActions } from './reply-actions';"),
      edit(`${mobile}/src/components/turn-view.tsx`, '  onAskHuman?: (toolCallId: string, answer: string) => void;', '  onAskHuman?: (toolCallId: string, answer: string) => void;\n  onRetry?: () => void;'),
      edit(`${mobile}/src/components/turn-view.tsx`, 'export function TurnView({ state, liveText, streaming, onPermission, onAskHuman }: TurnViewProps)', 'export function TurnView({ state, liveText, streaming, onPermission, onAskHuman, onRetry }: TurnViewProps)'),
      edit(`${mobile}/src/components/turn-view.tsx`, '          {answerCall.error && <Text style={styles.error}>{answerCall.error}</Text>}', '          {answerCall.error && <Text style={styles.error}>{answerCall.error}</Text>}\n          {state.terminal && <ReplyActions text={assistantText(answerCall.response!)} onRetry={onRetry} />}'),
      edit(`${mobile}/src/components/turn-view.tsx`, "      {state.terminal?.type === 'turn_cancelled' && <Text style={styles.meta}>Stopped.</Text>}", "      {state.terminal?.type === 'turn_cancelled' && <Text style={styles.meta}>Stopped.</Text>}\n      {state.terminal && !answerCall && onRetry && <ReplyActions text=\"\" onRetry={onRetry} />}"),
      edit(`${mobile}/src/components/turn-view.tsx`, 'function WorkBlock({ steps, active, started, ended }: { steps: PhoneStep[]; active: boolean; started: string; ended?: string }) {', 'function WorkBlock({ steps, active, started, ended, paused }: { steps: PhoneStep[]; active: boolean; started: string; ended?: string; paused: boolean }) {\n  const colors = useColors();'),
      edit(`${mobile}/src/components/turn-view.tsx`, '          active={!state.terminal && !!streaming}', '          active={!state.terminal && !!streaming}\n          paused={!!suspended}'),
      edit(`${mobile}/src/components/turn-view.tsx`, '<Text style={styles.workNow}>Baarali is working…</Text>', '<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><BaaraliMark size={32} motion={paused ? "static" : "loading"} color={colors.label} /><Text style={[styles.workNow, { color: colors.accent }]}>Baarali is working…</Text></View>'),
      edit(`${mobile}/src/components/turn-view.tsx`, 'streaming && !liveText && !state.terminal && !suspended && (', 'streaming && !liveText && !state.terminal && !suspended && steps.length === 0 && ('),
      edit(`${mobile}/src/components/turn-view.tsx`, '<Text style={styles.thinking}>Thinking…</Text>', '<View style={styles.workHead} accessible accessibilityRole="text"><BaaraliMark size={32} motion="loading" /><Text style={styles.thinking}>Thinking…</Text></View>'),
      // BAARALI(12/10/2026): the real chat also waits for its first snapshot
      // and for send acknowledgement. Both use the approved loading mark.
      edit(`${mobile}/src/app/chat.tsx`, "import { TurnView } from '@/components/turn-view';", "import { TurnView } from '@/components/turn-view';\nimport { BaaraliMark } from '@/components/baarali-mark';\nimport type { turns } from '@x/shared';"),
      // Only the home composer's explicit Send starts a turn on opening;
      // suggestion cards fill a draft for review. Wait for the saved model.
      edit(`${mobile}/src/lib/use-models.ts`, 'return { providers, defaultChoice, current, display, pick, refresh, loading };', 'return { providers, defaultChoice, current, display, pick, refresh, loading, ready: picked !== undefined };'),
      edit(`${mobile}/src/app/chat.tsx`, 'id?: string; agent?: string; draft?: string; talk?: string', 'id?: string; agent?: string; draft?: string; talk?: string; submit?: string; mode?: string'),
      edit(`${mobile}/src/app/chat.tsx`, "import { TurnView } from '@/components/turn-view';", "import { TurnView } from '@/components/turn-view';\nimport { WorkGate } from '@/components/work-gate';"),
      edit(`${mobile}/src/app/chat.tsx`, '  return (\n    <ChatView', "  return (\n    <WorkGate enabled={params.mode === 'work' || (!!params.agent && params.agent !== 'copilot')} chrome={false}>\n    <ChatView"),
      edit(`${mobile}/src/app/chat.tsx`, '    />\n  );\n}\n\n/**', '    />\n    </WorkGate>\n  );\n}\n\n/**'),
      edit(`${mobile}/src/app/chat.tsx`, "      talk={params.talk === '1'}", "      talk={params.talk === '1'}\n      submit={params.submit === '1'}"),
      edit(`${mobile}/src/app/chat.tsx`, "initialDraft, talk = false }: {", "initialDraft, talk = false, submit = false }: {"),
      edit(`${mobile}/src/app/chat.tsx`, "  talk?: boolean;\n  /** Text put", "  talk?: boolean;\n  submit?: boolean;\n  /** Text put"),
      edit(`${mobile}/src/app/chat.tsx`, '  // Seed the model pill\'s label once connected.', '  const submitted = useRef(false);\n  useEffect(() => {\n    if (!submit || !initialDraft?.trim() || !sessions || !models.ready || submitted.current) return;\n    submitted.current = true;\n    void send();\n  }, [submit, initialDraft, sessions, models.ready, send]);\n\n  // Seed the model pill\'s label once connected.'),
      // Retry is a new turn in the same chat: preserve the full user input
      // (including attachments) and agent, and honor the current model pick.
      edit(`${mobile}/src/app/chat.tsx`, 'function Turn({ turnId, isLatest, onStreaming, onFinished }: {', 'function Turn({ turnId, isLatest, onStreaming, onFinished, onRetry }: {'),
      edit(`${mobile}/src/app/chat.tsx`, '  onStreaming?: (streaming: boolean) => void;', "  onStreaming?: (streaming: boolean) => void;\n  onRetry?: (definition: turns.TurnState['definition']) => void;"),
      edit(`${mobile}/src/app/chat.tsx`, '      onAskHuman={onAskHuman}', '      onAskHuman={onAskHuman}\n      onRetry={onRetry ? () => onRetry(state.definition) : undefined}'),
      edit(`${mobile}/src/app/chat.tsx`, '  const stop = useCallback(() => {', '  const retrying = useRef(false);\n  const retry = useCallback(async (definition: turns.TurnState["definition"]) => {\n    if (!id || !sessions || sending || latestStreaming || retrying.current) return;\n    retrying.current = true;\n    setSending(true);\n    setError(null);\n    try {\n      const requested = definition.agent.requested;\n      const model = models.current ? { provider: models.current.provider, model: models.current.model } : undefined;\n      const agent = "inline" in requested ? { inline: { ...requested.inline, model } } : { ...requested, overrides: { ...requested.overrides, model } };\n      await sessions.sendMessage(id, definition.input, { agent });\n      await refresh();\n    } catch (err) {\n      setError(err instanceof Error ? err.message : String(err));\n    } finally {\n      setSending(false);\n      retrying.current = false;\n    }\n  }, [id, sessions, sending, latestStreaming, models.current, refresh]);\n\n  const stop = useCallback(() => {'),
      edit(`${mobile}/src/app/chat.tsx`, '                onFinished={onFinished}', '                onFinished={onFinished}\n                onRetry={ref.turnId === latestTurnId && !sending && !latestStreaming ? (definition) => void retry(definition) : undefined}'),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "import { useColors } from '@/theme/colors';", "import { useColors } from '@/theme/colors';\nimport { SpaceTabs } from '@/components/space-tabs';"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, '      {messages === null && !error ? (', '      <SpaceTabs selected="messages" onMessages={() => {}} onFiles={() => router.push({ pathname: "/spaces/files", params: { org, space, title, me } })} />\n      {messages === null && !error ? ('),
      edit(`${mobile}/src/app/(tabs)/spaces/files.tsx`, "import { useColors } from '@/theme/colors';", "import { useColors } from '@/theme/colors';\nimport { SpaceTabs } from '@/components/space-tabs';"),
      edit(`${mobile}/src/app/(tabs)/spaces/files.tsx`, 'org: string; space: string; title: string', 'org: string; space: string; title: string; me?: string'),
      edit(`${mobile}/src/app/(tabs)/spaces/files.tsx`, '  const { org, space, title } = params;', '  const { org, space, title, me } = params;'),
      edit(`${mobile}/src/app/(tabs)/spaces/files.tsx`, "      <Stack.Screen options={{ title: title ? `${title} files` : 'Files' }} />", "      <Stack.Screen options={{ title: title ? `${title} files` : 'Files' }} />\n      <SpaceTabs selected=\"files\" onFiles={() => {}} onMessages={() => { if (router.canGoBack()) router.back(); else router.replace({ pathname: '/spaces/chat', params: { org, space, title, me: me ?? '' } }); }} />"),
      edit(`${mobile}/src/app/chat.tsx`, '  if (!state) return <ActivityIndicator style={{ marginVertical: 12 }} />;', '  if (!state) return <View style={{ marginVertical: 12, alignItems: "center" }} accessible accessibilityRole="progressbar" accessibilityLabel="Loading…"><BaaraliMark size={32} motion="loading" /></View>;'),
      edit(`${mobile}/src/app/chat.tsx`, '            {turnRefs.map((ref) => (', '            {!session && !error && !sending && <View style={{ marginVertical: 12, alignItems: "center" }} accessible accessibilityRole="progressbar" accessibilityLabel="Loading…"><BaaraliMark size={32} motion="loading" /></View>}\n            {turnRefs.map((ref) => ('),
      edit(`${mobile}/src/app/chat.tsx`, '        {/* Composer — Claude-style card: input on top, model pill + send below */}', '        {sending && turnRefs.length === 0 && <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 }} accessible accessibilityRole="text"><BaaraliMark size={32} motion="loading" /><Text style={{ color: colors.secondaryLabel }}>Sending…</Text></View>}\n\n        {/* Composer — Claude-style card: input on top, model pill + send below */}'),
      // BAARALI(12/10/2026): a completed turn stops requesting deltas when a
      // new turn starts. Preserve its snapshot so history does not blink away;
      // changing the turn or account connection still clears the old state.
      edit(`${mobile}/src/lib/use-live-turn.ts`, "  const liveTextRef = useRef('');", "  const liveTextRef = useRef('');\n  const followed = useRef({ turnId, sessions, events });"),
      edit(`${mobile}/src/lib/use-live-turn.ts`, '  useEffect(() => {\n    setState(null);', '  useEffect(() => {\n    const previous = followed.current;\n    if (previous.turnId !== turnId || previous.sessions !== sessions || previous.events !== events) setState(null);\n    followed.current = { turnId, sessions, events };'),
      // Our sign-in server takes a phone app's redirect only in the form of
      // RFC 8252 §7.1, its reverse-domain scheme (control src/auth.ts).
      edit(`${mobile}/src/lib/spaces/oauth.ts`, "export const REDIRECT_URI = 'rowboat://oauth-callback';", `export const REDIRECT_URI = '${MOBILE_ID}:/oauth-callback';`),
      // A sign-in of its own, not Safari's: after « Se déconnecter », the next
      // sign-in asks who you are instead of reopening the last account.
      edit(`${mobile}/src/lib/spaces/oauth.ts`, 'WebBrowser.openAuthSessionAsync(authorize.toString(), REDIRECT_URI);', 'WebBrowser.openAuthSessionAsync(authorize.toString(), REDIRECT_URI, { preferEphemeralSession: true });'),
      // BAARALI(12/10/2026): shared composers, real file transfers and a compact model picker.
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "import { useColors } from '@/theme/colors';", "import { useColors } from '@/theme/colors';\nimport { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';"),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "  const stamp = `${today ? 'Today' : posted.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${posted.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;", "  const stamp = `${today ? translate('Today') : posted.toLocaleDateString([], { month: 'short', day: 'numeric' })} \u00b7 ${posted.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;"),
      edit(`${mobile}/src/app/(tabs)/spaces/_layout.tsx`, "<Stack.Screen name=\"new\" options={{ presentation: 'modal', title: 'New group' }} />", "<Stack.Screen name=\"new\" options={{ presentation: 'modal', title: 'New group', headerShown: false }} />"),
      edit(`${mobile}/src/app/(tabs)/spaces/_layout.tsx`, "<Stack.Screen name=\"index\" options={{ title: 'Spaces' }} />", "<Stack.Screen name=\"index\" options={{ title: 'Spaces', headerShown: false }} />"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "          headerRight: () => (\n            <Pressable\n              hitSlop={10}\n              onPress={() => router.push({ pathname: '/spaces/files', params: { org, space, title } })}\n            >\n              <Image source=\"sf:folder\" style={{ width: 20, height: 20 }} tintColor={colors.label} />\n            </Pressable>\n          ),", "          headerRight: () => (\n            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>\n              <GroupInfoButton client={client} space={space} orgAddress={org} me={me} title={title} onMembers={people => setMembers(new Map(people.map(person => [person.id, person])))} />\n              <Pressable accessibilityRole=\"button\" accessibilityLabel=\"Files\" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }} onPress={() => router.push({ pathname: '/spaces/files', params: { org, space, title, me } })}>\n                <Image source=\"sf:folder\" style={{ width: 20, height: 20 }} tintColor={colors.label} />\n              </Pressable>\n            </View>\n          ),"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "import { SpaceTabs } from '@/components/space-tabs';", "import { SpaceTabs } from '@/components/space-tabs';\nimport { GroupInfoButton } from '@/components/group-info';"),
      edit(`${mobile}/src/app/(tabs)/spaces/index.tsx`, "import { BaaraliSignInView } from '@/components/baarali-sign-in-view';", "import { BaaraliSignInView } from '@/components/baarali-sign-in-view';\nimport { TeamSpacesHome } from '@/components/team-spaces-home';"),
      edit(`${mobile}/src/app/(tabs)/spaces/index.tsx`, "  return <OrgList />;", "  return <TeamSpacesHome />;"),
      edit(`${mobile}/src/components/space-message.tsx`, "{onOpenThread && message.replyCount > 0 ? (", "{onOpenThread ? ("),
      edit(`${mobile}/src/components/space-message.tsx`, "<Text style={{ fontSize: 13, fontWeight: '600', color: '#0a84ff' }}>\n              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'} \u203a\n            </Text>", "<Text style={{ fontSize: 13, fontWeight: '500', color: colors.accent }}>\n              {message.replyCount > 0 ? <>{message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'} \u203a</> : <Text>Reply</Text>}\n            </Text>"),
      edit(`${mobile}/src/components/space-message.tsx`, "<Pressable onPress={() => onOpenThread(message)} hitSlop={6} style={{ marginTop: 4, alignSelf: 'flex-start' }}>", "<Pressable accessibilityRole=\"button\" accessibilityLabel=\"Reply in thread\" onPress={() => onOpenThread(message)} style={{ marginTop: 4, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }}>"),
      edit(`${mobile}/src/app/chat.tsx`, "function RoundButton({ icon, onPress, disabled, label }: { icon: string; onPress: () => void; disabled?: boolean; label?: string }) {\n  const colors = useColors();\n  return (\n    <Pressable\n      accessibilityRole=\"button\"\n      accessibilityLabel={label}\n      onPress={onPress}\n      disabled={disabled}\n      hitSlop={6}\n      style={{\n        width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',\n        backgroundColor: colors.accent, opacity: disabled ? 0.3 : 1, marginBottom: 2,\n      }}\n    >\n      <Image source={icon} style={{ width: 15, height: 15 }} tintColor={colors.onAccent} />\n    </Pressable>\n  );\n}\n", ""),
      edit(`${mobile}/src/app/chat.tsx`, "  TextInput,\n", ""),
      edit(`${mobile}/src/app/chat.tsx`, "import { BaaraliMark } from '@/components/baarali-mark';", "import { BaaraliMark } from '@/components/baarali-mark';\nimport { BaaraliLogo } from '@/components/baarali-logo';"),
      edit(`${mobile}/src/app/chat.tsx`, "<Text style={{ fontSize: 22, fontWeight: '600', color: colors.label }}>Rowboat</Text>", "<BaaraliLogo />"),
      edit(`${mobile}/src/app/chat.tsx`, "import { Redirect, router, useLocalSearchParams } from 'expo-router';", "import { Redirect, router, useLocalSearchParams, useFocusEffect } from 'expo-router';"),
      edit(`${mobile}/src/app/chat.tsx`, "  // Opened by the voice button of the home tab: listening at once, once.", "  useFocusEffect(useCallback(() => () => {\n    if (conversationOn.current) endConversation();\n    void voiceRef.current.cancel();\n  }, [endConversation, rpc]));\n\n  // Opened by the voice button of the home tab: listening at once, once."),
      edit(`${mobile}/src/components/model-picker.tsx`, "        onPress={() => setOpen(true)}", "        accessibilityRole=\"button\"\n        accessibilityLabel={display?.name ?? 'Choose model'}\n        hitSlop={{ top: 7, bottom: 7 }}\n        onPress={() => setOpen(true)}"),
      edit(`${mobile}/src/components/model-picker.tsx`, "borderCurve: 'continuous', paddingHorizontal: 12, height: 30,", "borderCurve: 'continuous', paddingHorizontal: 9, height: 28, maxWidth: 144, alignSelf: 'flex-start', flexShrink: 1,"),
      edit(`${mobile}/src/components/model-picker.tsx`, "fontSize: 13, fontWeight: '500', color: colors.secondaryLabel", "fontSize: 12, fontWeight: '500', color: colors.secondaryLabel, flexShrink: 1"),
      edit(`${mobile}/src/app/chat.tsx`, "import { ModelPill } from '@/components/model-picker';", "import { ModelPill } from '@/components/model-picker';\nimport { ChatComposer, ComposerButton } from '@/components/chat-composer';\nimport { useComposerAttachments } from '@/lib/composer-attachments';\nimport { attachmentContent } from '@/lib/attachment-content';"),
      edit(`${mobile}/src/app/chat.tsx`, "talk?: string; submit?: string", "talk?: string; submit?: string; attachments?: string"),
      edit(`${mobile}/src/app/chat.tsx`, "      submit={params.submit === '1'}", "      submit={params.submit === '1'}\n      attachmentsKey={params.attachments}"),
      edit(`${mobile}/src/app/chat.tsx`, "talk = false, submit = false }: {", "talk = false, submit = false, attachmentsKey }: {"),
      edit(`${mobile}/src/app/chat.tsx`, "  submit?: boolean;", "  submit?: boolean;\n  attachmentsKey?: string;"),
      edit(`${mobile}/src/app/chat.tsx`, "  const [search, setSearch] = useState(false);", "  const [search, setSearch] = useState(false);\n  const [optionsOpen, setOptionsOpen] = useState(false);\n  const [dictating, setDictating] = useState(false);\n  const attachments = useComposerAttachments(attachmentsKey);\n  const sendingRef = useRef(false);\n  const createdSession = useRef<string | null>(null);"),
      edit(`${mobile}/src/app/chat.tsx`, "    if (!content || !sessions) return false;", "    if ((!content && (spoken !== undefined || !attachments.files.length)) || !sessions || sendingRef.current) return false;\n    sendingRef.current = true;"),
      edit(`${mobile}/src/app/chat.tsx`, "      let sessionId = id;", "      const files = spoken === undefined && rpc ? await attachments.toWorkspace(rpc) : [];\n      if (spoken === undefined && attachments.files.length && !rpc) throw new Error(\"The connection is unavailable. Please try again.\");\n      let sessionId = id ?? createdSession.current;"),
      edit(`${mobile}/src/app/chat.tsx`, "        onCreated(sessionId);", "        createdSession.current = sessionId;\n        onCreated(sessionId);"),
      edit(`${mobile}/src/app/chat.tsx`, "await sessions.sendMessage(sessionId, { role: 'user', content }, {", "await sessions.sendMessage(sessionId, { role: 'user', content: attachmentContent(content, files) }, {"),
      edit(`${mobile}/src/app/chat.tsx`, "      analytics.mobileMessageSent();", "      if (spoken === undefined) attachments.clear();\n      analytics.mobileMessageSent();"),
      edit(`${mobile}/src/app/chat.tsx`, "    } finally {\n      setSending(false);\n    }\n  }, [draft, sessions, id, turnRefs, refresh, models.current, params.agent, search, readAloud, onCreated]);", "    } finally {\n      setSending(false);\n      sendingRef.current = false;\n    }\n  }, [draft, sessions, id, turnRefs, refresh, models.current, params.agent, search, readAloud, onCreated, rpc, attachments.files, attachments.toWorkspace, attachments.clear]);"),
      edit(`${mobile}/src/app/chat.tsx`, "!initialDraft?.trim() || !sessions || !models.ready", "(!initialDraft?.trim() && !attachments.files.length) || !sessions || !models.ready"),
      edit(`${mobile}/src/app/chat.tsx`, "[submit, initialDraft, sessions, models.ready, send]", "[submit, initialDraft, sessions, models.ready, send, attachments.files.length]"),
      edit(`${mobile}/src/app/chat.tsx`, "  // Leaving the chat hangs up.", "  const dictate = async () => {\n    if (!rpc || dictating) return;\n    setDictating(true);\n    try {\n      if (voice.state === 'recording') {\n        const text = await voice.finish();\n        if (text) setDraft(previous => `${previous.trim()}${previous.trim() ? ' ' : ''}${text}`);\n      } else if (await voice.start() === 'denied') {\n        Alert.alert('Microphone access', 'Allow microphone access in Settings to dictate a message.');\n      }\n    } catch {\n      await voice.cancel();\n      setError('Your message could not be transcribed. Please try again.');\n    } finally { setDictating(false); }\n  };\n\n  // Leaving the chat hangs up."),
      edit(`${mobile}/src/app/chat.tsx`, "    if (conversationOn.current) endConversation();\n  }, [endConversation]);", "    if (conversationOn.current) endConversation();\n    void voiceRef.current.cancel();\n  }, [endConversation]);"),
      edit(`${mobile}/src/app/chat.tsx`, "          <>\n          <TextInput\n            style={{ fontSize: 16, color: colors.label, maxHeight: 120, paddingHorizontal: 2 }}\n            placeholder={baarasseur ? `Write to ${baarasseur.name}…` : 'Message Rowboat'}\n            placeholderTextColor={colors.tertiaryLabel}\n            value={draft}\n            onChangeText={setDraft}\n            multiline\n          />\n          <View style={{ flexDirection: 'row', alignItems: 'center' }}>\n            <Pressable\n              accessibilityRole=\"switch\"\n              accessibilityState={{ checked: search }}\n              accessibilityLabel=\"Web search\"\n              onPress={() => setSearch((on) => !on)}\n              hitSlop={6}\n              style={{\n                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 6,\n                backgroundColor: search ? colors.accent : 'transparent',\n                borderWidth: search ? 0 : 1, borderColor: colors.separator,\n              }}\n            >\n              <Image source=\"sf:globe\" style={{ width: 16, height: 16 }} tintColor={search ? colors.onAccent : colors.secondaryLabel} />\n            </Pressable>\n            <Pressable\n              accessibilityRole=\"switch\"\n              accessibilityState={{ checked: readAloud }}\n              accessibilityLabel=\"Read replies aloud\"\n              onPress={() => setReadAloud(!readAloud)}\n              hitSlop={6}\n              style={{\n                width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 6,\n                backgroundColor: readAloud ? colors.accent : 'transparent',\n                borderWidth: readAloud ? 0 : 1, borderColor: colors.separator,\n              }}\n            >\n              <Image source=\"sf:speaker.wave.2\" style={{ width: 16, height: 16 }} tintColor={readAloud ? colors.onAccent : colors.secondaryLabel} />\n            </Pressable>\n            <ModelPill models={models} />\n            <View style={{ flex: 1 }} />\n            {sending || latestStreaming ? (\n              <RoundButton icon=\"sf:stop.fill\" onPress={stop} />\n            ) : draft.trim() ? (\n              <RoundButton icon=\"sf:arrow.up\" onPress={() => void send()} />\n            ) : (\n              <RoundButton\n                icon=\"sf:waveform\"\n                onPress={() => void startConversation()}\n                disabled={!rpc}\n                label=\"Talk with Rowboat\"\n              />\n            )}\n          </View>\n          </>", "          <ChatComposer embedded draft={draft} onChange={setDraft}\n            placeholder={baarasseur ? `Write to ${baarasseur.name}…` : 'Message Rowboat'}\n            files={attachments.files} onRemove={attachments.remove} onAttach={() => void attachments.pick()} picking={attachments.picking}\n            busy={sending || latestStreaming || dictating} onSend={() => void send()} onStop={latestStreaming ? stop : undefined}\n            onVoice={rpc ? () => void dictate() : undefined} voiceActive={voice.state === 'recording'} voiceLabel={voice.state === 'recording' ? 'Finish dictation' : 'Dictate a message'}\n            leading={<><ModelPill models={models} /><ComposerButton icon=\"sf:ellipsis\" label=\"Chat options\" active={optionsOpen || search || readAloud} onPress={() => setOptionsOpen(value => !value)} /></>}\n            extra={<>\n              {voice.state !== 'idle' && <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{voice.state === 'recording' ? 'Tap the microphone to finish dictation.' : 'Transcribing…'}</Text>}\n              {optionsOpen && <View style={{ gap: 8, paddingTop: 4 }}>\n                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>\n                  <ComposerButton icon=\"sf:globe\" label=\"Web search\" active={search} onPress={() => setSearch(value => !value)} />\n                  <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>Web search</Text>\n                </View>\n                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>\n                  <ComposerButton icon=\"sf:speaker.wave.2\" label=\"Read replies aloud\" active={readAloud} onPress={() => setReadAloud(!readAloud)} />\n                  <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>Read replies aloud</Text>\n                </View>\n                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>\n                  <ComposerButton icon=\"sf:waveform\" label=\"Talk with Rowboat\" disabled={!rpc || sending || latestStreaming || voice.state !== 'idle'} onPress={() => void startConversation()} />\n                  <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>Talk with Rowboat</Text>\n                </View>\n              </View>}\n            </>} />"),
      edit(`${mobile}/src/app/chat.tsx`, "        {/* Composer — Claude-style card: input on top, model pill + send below */}", "        {!id && error && <Text style={{ color: colors.destructive, paddingHorizontal: 16 }}>{error}</Text>}\n        {/* Composer — Claude-style card: input on top, model pill + send below */}"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "import { useColors } from '@/theme/colors';", "import { useColors } from '@/theme/colors';\nimport { SpaceComposer } from '@/components/space-composer';\nimport { useComposerAttachments } from '@/lib/composer-attachments';"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "  const [draft, setDraft] = useState('');", "  const [draft, setDraft] = useState('');\n  const attachments = useComposerAttachments();\n  const sendingRef = useRef(false);"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "    if (!body || sending) return;", "    if ((!body && !attachments.files.length) || sendingRef.current) return;\n    sendingRef.current = true;"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "      // BAARALI(07/10/2026): « @Name » typed here names the member for real.", "      const links = await attachments.toSpace(client, org, space);\n      const messageBody = [tokenizeMentions(body, members.values()), ...links].filter(Boolean).join('\\n\\n');\n      // BAARALI(07/10/2026): « @Name » typed here names the member for real."),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "body: tokenizeMentions(body, members.values())", "body: messageBody"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "    } catch (err) {\n      setDraft(body);", "      attachments.clear();\n    } catch (err) {\n      setDraft(body);"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "    } finally {\n      setSending(false);\n    }", "    } finally {\n      setSending(false);\n      sendingRef.current = false;\n    }"),
      edit(`${mobile}/src/app/(tabs)/spaces/chat.tsx`, "      {/* Composer */}\n      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 8 }}>\n        <TextInput\n          style={{\n            flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: 14, paddingVertical: 10,\n            fontSize: 16, color: colors.label, backgroundColor: colors.secondaryBackground,\n            borderRadius: 20, borderCurve: 'continuous',\n          }}\n          placeholder={`Message #${title ?? ''}`}\n          placeholderTextColor={colors.tertiaryLabel}\n          value={draft}\n          onChangeText={setDraft}\n          multiline\n        />\n        <Pressable\n          onPress={() => void send()}\n          disabled={!draft.trim() || sending}\n          style={{ opacity: draft.trim() && !sending ? 1 : 0.35, paddingBottom: 4 }}\n        >\n          <Image source=\"sf:arrow.up.circle.fill\" style={{ width: 32, height: 32 }} tintColor={colors.label} />\n        </Pressable>\n      </View>", "      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 8 }}>\n        <SpaceComposer draft={draft} onChange={setDraft} placeholder={`Message #${title ?? \"\"}`} attachments={attachments} sending={sending} onSend={() => void send()} />\n      </View>"),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "import { useColors } from '@/theme/colors';", "import { useColors } from '@/theme/colors';\nimport { SpaceComposer } from '@/components/space-composer';\nimport { useComposerAttachments } from '@/lib/composer-attachments';"),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "  const [draft, setDraft] = useState('');", "  const [draft, setDraft] = useState('');\n  const attachments = useComposerAttachments();\n  const sendingRef = useRef(false);"),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "    if (!body || sending) return;", "    if ((!body && !attachments.files.length) || sendingRef.current) return;\n    sendingRef.current = true;"),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "      // BAARALI(07/10/2026): « @Name » typed here names the member for real.", "      const links = await attachments.toSpace(client, org, space, root);\n      const messageBody = [tokenizeMentions(body, members.values()), ...links].filter(Boolean).join('\\n\\n');\n      // BAARALI(07/10/2026): « @Name » typed here names the member for real."),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "body: tokenizeMentions(body, members.values())", "body: messageBody"),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "    } catch (err) {\n      setDraft(body);", "      attachments.clear();\n    } catch (err) {\n      setDraft(body);"),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "    } finally {\n      setSending(false);\n    }", "    } finally {\n      setSending(false);\n      sendingRef.current = false;\n    }"),
      edit(`${mobile}/src/app/(tabs)/spaces/thread.tsx`, "      {/* Composer — Slack's single rounded field; send arrow appears with a draft */}\n      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 8 }}>\n        <View\n          style={{\n            flexDirection: 'row', alignItems: 'flex-end',\n            backgroundColor: colors.secondaryBackground, borderRadius: 24, borderCurve: 'continuous',\n            paddingLeft: 16, paddingRight: 6, minHeight: 46,\n          }}\n        >\n          <TextInput\n            ref={inputRef}\n            style={{ flex: 1, maxHeight: 120, fontSize: 16, color: colors.label, paddingVertical: 12 }}\n            placeholder=\"Add a reply\"\n            placeholderTextColor={colors.tertiaryLabel}\n            value={draft}\n            onChangeText={setDraft}\n            multiline\n          />\n          {draft.trim() ? (\n            <Pressable onPress={() => void send()} disabled={sending} style={{ padding: 6, opacity: sending ? 0.4 : 1 }}>\n              <Image source=\"sf:arrow.up.circle.fill\" style={{ width: 30, height: 30 }} tintColor={colors.label} />\n            </Pressable>\n          ) : null}\n        </View>\n      </View>", "      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: (keyboardVisible ? 0 : insets.bottom) + 8 }}>\n        <SpaceComposer draft={draft} onChange={setDraft} placeholder={\"Add a reply\"} attachments={attachments} sending={sending} onSend={() => void send()} inputRef={inputRef} />\n      </View>"),
      edit(`${mobile}/src/components/turn-view.tsx`, "        <Text style={styles.userText}>{userText(state.definition.input)}</Text>", "        {!!userText(state.definition.input) && <Text style={styles.userText}>{userText(state.definition.input)}</Text>}\n        {Array.isArray(state.definition.input.content) && state.definition.input.content.map((part, index) => part.type === 'attachment' ? <Text key={index} style={styles.meta}>📎 {part.filename}</Text> : null)}"),
    ],
    copies: [
      ['assets/mobile/settings.tsx', `${mobile}/src/app/settings.tsx`],
      ['../control/src/plan-access-copy.ts', `${mobile}/src/lib/plan-access-copy.ts`],
      ['assets/mobile/plans.tsx', `${mobile}/src/app/plans.tsx`],
      ['assets/mobile/say.ts', `${mobile}/src/lib/say.ts`],
      ['assets/mobile/usage-metrics.ts', `${mobile}/src/lib/usage-metrics.ts`],
      ['assets/mobile/usage-panel.tsx', `${mobile}/src/components/usage-panel.tsx`],
      ['assets/mobile/app-theme.tsx', `${mobile}/src/lib/app-theme.tsx`],
      [path.relative(PKG, path.join(ROOT, 'apps/x/apps/renderer/src/lib/usage-reset.ts')), `${mobile}/src/lib/usage-reset.ts`],
      [path.relative(PKG, path.join(ROOT, 'apps/x/apps/renderer/src/lib/media-credits.ts')), `${mobile}/src/lib/media-credits.ts`],
      ['../control/src/oval-b.ts', `${mobile}/src/lib/baarali-oval-motion.ts`],
      ['assets/motion/baarali-mark.native.tsx', `${mobile}/src/components/baarali-mark.tsx`],
      ['assets/motion/baarali-logo.native.tsx', `${mobile}/src/components/baarali-logo.tsx`],
      ['assets/mobile/home.tsx', `${mobile}/src/app/(tabs)/home.tsx`],
      ['assets/mobile/tabs-layout.tsx', `${mobile}/src/app/(tabs)/_layout.tsx`],
      ['assets/mobile/work-home.tsx', `${mobile}/src/app/(tabs)/more.tsx`],
      ['assets/mobile/top-navigation.tsx', `${mobile}/src/components/top-navigation.tsx`],
      ['assets/mobile/work-access.ts', `${mobile}/src/lib/work-access.ts`],
      ['assets/mobile/work-access-provider.tsx', `${mobile}/src/lib/work-access-provider.tsx`],
      ['assets/mobile/work-gate.tsx', `${mobile}/src/components/work-gate.tsx`],
      ['assets/mobile/recruit.tsx', `${mobile}/src/app/baarasseurs/recruit.tsx`],
      ['assets/mobile/agent-documents.tsx', `${mobile}/src/components/agent-documents.tsx`],
      ['assets/mobile/studio-library.tsx', `${mobile}/src/components/studio-library.tsx`],
      ['assets/mobile/studio-cad-files.tsx', `${mobile}/src/components/studio-cad-files.tsx`],
      ['assets/mobile/studio-cad-editor.tsx', `${mobile}/src/components/studio-cad-editor.tsx`],
      ['assets/motion/cad-editor-page.ts', `${mobile}/src/lib/cad-editor-page.ts`],
      ['../instance/src/cad-scene.ts', `${mobile}/src/lib/cad-scene.ts`],
      ['assets/mobile/reply-actions.tsx', `${mobile}/src/components/reply-actions.tsx`],
      ['assets/mobile/space-tabs.tsx', `${mobile}/src/components/space-tabs.tsx`],
      ['assets/mobile/group-new.tsx', `${mobile}/src/app/(tabs)/spaces/new.tsx`],
      ['assets/mobile/group-info.tsx', `${mobile}/src/components/group-info.tsx`],
      ['assets/mobile/team-spaces-home.tsx', `${mobile}/src/components/team-spaces-home.tsx`],
      ['assets/mobile/team-directory.ts', `${mobile}/src/lib/team-directory.ts`],
      ['assets/mobile/attachment-content.ts', `${mobile}/src/lib/attachment-content.ts`],
      ['assets/mobile/composer-attachments.ts', `${mobile}/src/lib/composer-attachments.ts`],
      ['assets/mobile/chat-composer.tsx', `${mobile}/src/components/chat-composer.tsx`],
      ['assets/mobile/space-composer.tsx', `${mobile}/src/components/space-composer.tsx`],
      ...['icon.png', 'splash-icon.png', 'android-icon-foreground.png', 'android-icon-monochrome.png', 'baarali-mark.png', 'baarali-tile.png'].map((f) => [`assets/mobile/${f}`, `${mobile}/assets/images/${f}`]),
      ['src/i18n/mobile/babel-plugin.cjs', `${mobile}/baarali-i18n/babel-plugin.cjs`],
    ],
    writes: [
      [`${mobile}/src/lib/cad-editor-client.ts`, fs.readFileSync(path.join(PKG, 'assets/motion/cad-editor-client.ts'), 'utf8').replace("'./cad-scene.js'", "'./cad-scene'")],
      // Metro resolves './fr' but not './fr.js' to fr.ts: the imports lose their extension.
      ...[['mobile/runtime.ts', 'mobile/runtime.ts'], ['translate.ts', 'translate.ts'], ['fr.ts', 'fr.ts']].map(([from, to]) => [
        `${mobile}/src/baarali-i18n/${to}`,
        fs.readFileSync(path.join(PKG, 'src/i18n', from), 'utf8').replace(/(from '\.{1,2}\/[\w./-]+)\.js'/g, "$1'"),
      ]),
      [`${mobile}/babel.config.js`, MOBILE_BABEL],
      [`${mobile}/baarali-locales/fr.json`, JSON.stringify(MOBILE_PERMISSIONS.fr, null, 2) + '\n'],
      [`${mobile}/eas.json`, JSON.stringify({ cli: { version: '>= 16.0.0', appVersionSource: 'remote' }, build: { development: { developmentClient: true, distribution: 'internal', ios: { simulator: true } }, preview: { distribution: 'internal' }, production: { autoIncrement: true } } }, null, 2) + '\n'],
    ],
    json: {
      file: `${mobile}/app.json`,
      update(doc) {
        const expo = { ...doc.expo, name: BRAND.name, slug: 'baarali' };
        delete expo.owner;
        expo.extra = { ...expo.extra };
        delete expo.extra.eas;
        // `baarali://` for links, the bundle id for the sign-in's way back (oauth.ts).
        expo.scheme = ['baarali', MOBILE_ID];
        expo.ios = { ...expo.ios, bundleIdentifier: MOBILE_ID, infoPlist: { ...expo.ios.infoPlist, ...MOBILE_PERMISSIONS.en } };
        expo.locales = { fr: './baarali-locales/fr.json' };
        const android = { ...expo.android, package: MOBILE_ID, adaptiveIcon: { ...expo.android.adaptiveIcon, backgroundColor: '#1A6DFF' } };
        delete android.adaptiveIcon.backgroundImage;
        expo.android = android;
        expo.plugins = expo.plugins.map((p) => (Array.isArray(p) && p[0] === 'expo-splash-screen' ? ['expo-splash-screen', { ...p[1], backgroundColor: '#0A0A0A', imageWidth: 140 }] : p));
        return { ...doc, expo };
      },
    },
  };
}

/**
 * Harbor, the Spaces server we host (decided 02/10/2026). Its few pages and
 * a new team's first file come from packages/spaces/src/pages.ts, in the
 * visitor's language; the deep links keep `rowboat://`, the desktop app's
 * own scheme (UPSTREAM.md §2, internal ids are never renamed).
 */
export function harborPlan() {
  const server = 'apps/harbor/packages/server/src';
  return {
    edits: [
      edit(
        `${server}/http.ts`,
        "import { HarborError } from './errors.js';",
        "import { HarborError } from './errors.js';\nimport { invitePage as baaraliInvitePage, landingPage as baaraliLandingPage, withLanguage } from './baarali-pages.js';",
      ),
      edit(
        `${server}/http.ts`,
        '  const app = new Hono<Env>();',
        "  const app = new Hono<Env>();\n  app.use('*', (c, next) => withLanguage(c.req.header('accept-language'), next));",
      ),
      edit(
        `${server}/http.ts`,
        '    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Open in Rowboat</title>` +\n' +
          '      `<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;color:#222;background:#fafafa}` +\n' +
          '      `main{text-align:center;padding:2rem}a.b{display:inline-block;margin-top:1rem;padding:.6rem 1.1rem;border-radius:8px;background:#111;color:#fff;text-decoration:none}</style>` +\n' +
          '      `<main><p>This link opens in Rowboat.</p><a class="b" href="${deep}">Open in Rowboat</a></main>` +\n' +
          '      `<script>location.replace(${JSON.stringify(deep)})</script>`;',
        '    return baaraliLandingPage(deep);',
      ),
      edit(`${server}/http.ts`, 'c.html(invitePage({ state: resolved.state }), 410)', 'c.html(baaraliInvitePage({ state: resolved.state }), 410)'),
      edit(`${server}/http.ts`, "c.html(invitePage({ state: 'ok',", "c.html(baaraliInvitePage({ state: 'ok',"),
      edit(
        `${server}/apex.ts`,
        "import { HarborError } from './errors.js';",
        "import { HarborError } from './errors.js';\nimport { welcomeReadme as baaraliWelcome, withLanguage } from './baarali-pages.js';",
      ),
      edit(`${server}/apex.ts`, '  const app = new Hono();', "  const app = new Hono();\n  app.use('*', (c, next) => withLanguage(c.req.header('accept-language'), next));"),
      edit(`${server}/apex.ts`, 'newContent: welcomeReadme(org.name),', 'newContent: baaraliWelcome(org.name),'),
    ],
    writes: [[`${server}/baarali-pages.ts`, fs.readFileSync(path.join(PKG, '../spaces/src/pages.ts'), 'utf8')]],
  };
}

/**
 * Computes every change; throws on a missing anchor. Writes only with `write`.
 * @param {{ root?: string, only?: string, write?: boolean }} options
 * @returns {string[]}
 */
export function apply({ root = ROOT, only, write = false }) {
  const changes = [];
  // A Windows checkout ends lines with CRLF (git's autocrlf): the anchors
  // are written with LF, so the build copy is read, and written, in LF.
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
  const pending = new Map();
  const current = (rel) => (pending.has(rel) ? pending.get(rel) : read(rel));

  if (only === 'harbor') {
    const plan = harborPlan();
    for (const e of plan.edits) {
      const text = current(e.file);
      const count = text.split(e.from).length - 1;
      if (count !== 1) throw new Error(`brand: ${e.file}: expected the anchor once, found it ${count} times:\n${e.from}`);
      pending.set(e.file, text.replace(e.from, () => e.to));
    }
    for (const [to, text] of plan.writes) {
      changes.push(`write ${to}`);
      if (write) fs.writeFileSync(path.join(root, to), text);
    }
    for (const [rel, text] of pending) {
      changes.push(`edit ${rel}`);
      if (write) fs.writeFileSync(path.join(root, rel), text);
    }
    return changes;
  }

  if (only === 'mobile') {
    const plan = mobilePlan();
    for (const e of plan.edits) {
      const text = current(e.file);
      const count = text.split(e.from).length - 1;
      if (count !== 1) throw new Error(`brand: ${e.file}: expected the anchor once, found it ${count} times:\n${e.from}`);
      pending.set(e.file, text.replace(e.from, () => e.to));
    }
    pending.set(plan.json.file, JSON.stringify(plan.json.update(JSON.parse(current(plan.json.file))), null, 2) + '\n');
    for (const [from, to] of plan.copies) {
      if (!fs.existsSync(path.join(PKG, from))) throw new Error(`brand: missing ${from}`);
      changes.push(`copy ${from} → ${to}`);
      if (write) {
        fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
        fs.copyFileSync(path.join(PKG, from), path.join(root, to));
      }
    }
    for (const [to, text] of plan.writes) {
      changes.push(`write ${to}`);
      if (write) {
        fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
        fs.writeFileSync(path.join(root, to), text);
      }
    }
  }

  // BAARALI(13/10/2026): the instance and desktop build copies need the
  // same entitlement implementation before their runtime imports are built.
  if (only !== 'mobile') for (const [from, to] of corePlan().copies) {
    changes.push(`copy ${from} → ${to}`);
    if (write) {
      fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
      fs.copyFileSync(path.join(PKG, from), path.join(root, to));
    }
  }
  for (const e of only === 'mobile' ? [] : corePlan().edits) {
    const text = current(e.file);
    const count = text.split(e.from).length - 1;
    if (count !== 1) throw new Error(`brand: ${e.file}: expected the anchor once, found it ${count} times:\n${e.from}`);
    pending.set(e.file, text.replace(e.from, () => e.to));
  }

  if (only !== 'core' && only !== 'mobile') {
    const plan = desktopPlan();
    for (const e of plan.edits) {
      const text = current(e.file);
      const count = text.split(e.from).length - 1;
      if (count !== 1) throw new Error(`brand: ${e.file}: expected the anchor once, found it ${count} times:\n${e.from}`);
      pending.set(e.file, text.replace(e.from, () => e.to));
    }
    const pj = JSON.parse(current(plan.packageJson.file));
    pending.set(plan.packageJson.file, JSON.stringify({ ...pj, ...plan.packageJson.set }, null, 4) + '\n');
    for (const [from, to] of plan.copies) {
      if (!fs.existsSync(path.join(PKG, from))) throw new Error(`brand: missing ${from}`);
      changes.push(`copy ${from} → ${to}`);
      if (write) {
        fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
        fs.copyFileSync(path.join(PKG, from), path.join(root, to));
      }
    }
    for (const [to, text] of plan.writes) {
      changes.push(`write ${to}`);
      if (write) fs.writeFileSync(path.join(root, to), text);
    }
  }

  for (const tree of sourceTrees(only)) {
    const abs = path.join(root, tree);
    const files = fs.statSync(abs).isDirectory() ? walk(abs) : [abs];
    for (const file of files) {
      const rel = path.relative(root, file);
      const text = current(rel);
      const branded = neutralIcons(brandText(text), rel);
      if (branded !== text) pending.set(rel, branded);
    }
  }

  for (const [rel, text] of pending) {
    if (text === read(rel)) continue;
    changes.push(`edit ${rel}`);
    if (write) fs.writeFileSync(path.join(root, rel), text);
  }
  return changes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined;
  const check = args.includes('--check');
  // It rewrites tracked files: never by accident in a working copy.
  if (!check && !args.includes('--yes')) {
    console.error('brand.mjs rewrites tracked files. Run it in CI or a build stage with --yes, or use --check.');
    process.exit(2);
  }
  const changes = apply({ only, write: !check });
  console.log(`${check ? 'would apply' : 'applied'} ${changes.length} change(s)`);
}
