import fs from 'node:fs/promises';
import path from 'node:path';
import { KIT_DOC } from './motion-kit.js';

// Prepares an instance workdir before rowboat-server boots (roadmap phase 0,
// 30/09/2026). Only files the upstream already reads are written, in their
// upstream shape, so no upstream file changes (UPSTREAM.md §2). What the
// person changes later in the app is kept: only the control-plane session is
// rewritten on every boot, because the control plane owns it.

export interface SeedOptions {
  workDir: string;
  /** Bearer the control plane issued to this instance (core reads it as the Rowboat session). */
  instanceToken: string;
  /**
   * rowboat-server's bearer key, when the control plane sets it (its
   * gateway relays with it, security §2). Unset: the server keeps the key it
   * minted, as on the owner's instance of phase 0.
   */
  serverKey?: string;
  /** Model used until the person picks one, as an OpenRouter id. */
  assistantModel: string;
  /** How rowboat-server starts the media MCP server (media-mcp-main.ts). */
  mediaServer?: { command: string; args: string[]; env: Record<string, string> };
  /** How it starts the motion design MCP server (motion-mcp-main.ts, 08/10/2026). */
  motionServer?: { command: string; args: string[]; env: Record<string, string> };
}

/** Our entries in the person's MCP config and skills; rewritten on every boot, the rest is theirs. */
export const MEDIA_SERVER_NAME = 'baarali-media';
export const MEDIA_SKILL_DIR = 'baarali-media';
export const IMAGES_SKILL_DIR = 'baarali-images';
export const MOTION_SERVER_NAME = 'baarali-motion';
export const MOTION_SKILL_DIR = 'baarali-motion';
/** core's gateway image default (models/rowboat-selection.ts ROWBOAT_IMAGE_MODEL): cheap, on OpenRouter. */
export const IMAGE_MODEL = 'google/gemini-2.5-flash-image';
/** Their names until the rename to Baarali (01/10/2026): removed from existing workdirs. */
const FORMER_MEDIA_NAME = 'warell-media';

// The skill tells the agent our media server exists and how its two steps
// work. Disk skills may only name existing builtins (disk-loader.ts): the MCP
// bridge ones, which keep their mcp-execute approval.
export const MEDIA_SKILL = `---
name: Video, voice and music
description: Generate a video, a voice-over (text to speech) or a song/music track with an AI model. Load whenever the user asks to create, make or generate a filmed-looking video or clip, a voice, narration, audio reading, song, jingle or music. Not for still images (the Images skill makes those), nor for motion design — animated text, logos, figures, captions, promos built from the brand (the Motion design skill makes those, and calls this one for footage, voice or music).
tools: [listMcpTools, executeMcpTool]
---

# Video, voice and music

Generations run on the \`${MEDIA_SERVER_NAME}\` MCP server, through \`executeMcpTool\`.

1. Call \`list_models\` first: it lists only the models this user's plan may use. Prefer the one marked \`recommended\` for the kind asked. Otherwise: video \`seedance-mini\` (cheapest), \`veo-fast\` when the user wants higher quality, \`veo\` only when they ask for the best; voice \`gemini-voice\`; music \`lyria\` (\`lyria-pro\` for a full, polished song). Use only a listed model; if \`generate\` answers \`not_in_plan\`, pick another listed one.
2. Call \`generate\` with \`model\` and \`prompt\`. For a voice, \`prompt\` is the exact text to read, in the user's language. For a video, write a vivid visual description; pass \`duration\` or \`aspect_ratio: "9:16"\` (phone/story format) only when the user asks.
3. Tell the user it has started and usually takes 1 to 5 minutes, then call \`check\` with the id, again and again while it says it is still running.
4. When ready, show the saved path to the user in a \`\`\`filepath code block.

Each generation is paid from the user's media credits when it starts, and refunded if it fails; \`list_models\` gives each model's price and the balance. Before a video, tell the user its price in credits. Generate once per request; never retry a successful one, and never start several variants unless asked. If \`generate\` reports \`insufficient_media_credits\`, say plainly what it costs and what is left, and offer a cheaper model, a shorter duration, or buying a media credit pack.
`;

// No bundled skill owns core's image tool (05/10/2026): asked for a picture,
// the agent loaded the whole builtin toolset (76 tools), then searched the
// media server, which makes none, and stalled. This one attaches only it.
export const IMAGES_SKILL = `---
name: Images
description: Create, draw or generate a still image, picture, photo, illustration, drawing, logo, icon, poster, banner or wallpaper. Load whenever the user asks for an image.
tools: [generate-image]
---

# Images

Call \`generate-image\` at once: no other tool is needed, and never look for one on the \`${MEDIA_SERVER_NAME}\` server (it makes videos, voices and music, not images).

- \`prompt\`: a vivid, self-contained description (subject, style, setting, light, colours), written from what the user asked.
- \`aspectRatio\` only when the user asks for a shape: \`"16:9"\` wide, \`"9:16"\` phone or story, \`"1:1"\` square.
- Make one image per request unless the user asks for several.

When it succeeds, show the saved path in a \`\`\`filepath code block, with one short sentence. If it fails, say in one plain sentence what went wrong and offer to try again. Mention the user's plan only when the error itself says \`not_in_plan\`.
`;

// Motion design for every chat (decided 08/10/2026, mockup v2): HyperFrames
// compositions made from templates and the brand kit, edited as HTML, footage,
// voice and music from the media server. Rendering comes with the render service.
export const MOTION_SKILL = `---
name: Motion design
description: Make motion design and motion graphics — an animated promo or ad, kinetic typography, an animated logo, animated figures or charts, word-by-word captions, a lower third, a countdown, a social video for TikTok, Reels, WhatsApp Status or YouTube — exact text, prices and logo, in the user's brand. Load whenever the user asks for an animation, a motion design, an animated video or post, an animated text or logo, or captions.
tools: [listMcpTools, executeMcpTool, file-readText, file-editText, file-writeText, file-list, file-copy]
---

# Motion design

The \`${MOTION_SERVER_NAME}\` MCP server, through \`executeMcpTool\`, makes motion projects: HyperFrames compositions, one folder each in \`motion/\`, whose \`index.html\` is the video.

1. **The brand.** Call \`brand_kit\` once. If it is empty, ask in one message for the business name, the logo (a file they send) and their colours, then save them with \`brand_kit\` \`set\`: four roles (background, ink = the text on it, accent, highlight = the key figure) and every other brand colour in \`palette\`. Never invent a logo. If \`brand_kit\` warns that a pair is hard to read, tell the user and suggest a fix; never change their colours silently.
2. **The brief.** From the request, decide: what it is for, the network (9:16 for TikTok, Reels and WhatsApp Status — the default; 1:1 or 4:5 for a feed; 16:9 for YouTube or a screen), the length, the exact words, prices and dates. Ask only for what you cannot know (a price, a date); never invent one.
3. **Start from a template.** \`list_templates\`, then \`new_project\` with the template that fits and every slot filled from the request, in the user's language. Prefer a template, then edit it, over writing a composition from nothing. A product, an app or a service to launch or present: \`presentation-produit\`, with the product photo in its \`image\` slot when the user has one. A product to sell: \`revelation-produit\` (a cut-out photo is best). A customer review: \`temoignage\`. A transformation with two photos: \`avant-apres\`. A flash deal for a WhatsApp Status: \`offre-du-jour\`. Several products, new arrivals or a collection: \`catalogue\` (one \`name | price | photo\` line each). A restaurant's or maquis' menu: \`menu\` (\`# Section\` lines, then \`dish | price\`). A concert, a training, an opening, a match: \`evenement\`. A how-to, a recipe, how to order: \`tutoriel\`. How to pay by mobile money: \`paiement-mobile\` — ask the user for each operator's code and number, never guess one.
4. **Make it theirs.** Edit \`index.html\` with the file tools for what the template does not do. Rules that keep it renderable:
   - The root keeps \`data-composition-id\`, \`data-start="0"\`, \`data-duration\`, \`data-width\`, \`data-height\` and \`data-no-timeline\`.
   - Each scene is a \`<section class="clip">\` with a unique \`id\`, \`data-start\`, \`data-duration\` and \`data-track-index\`.
   - Motion is the Web Animations API only: \`hf(selector, keyframes, {at, d, stagger, ease})\` and \`hfEl(element, …)\`, eases out, in, inout, snap, spring, apple, linear. CSS @keyframes also work. **Never GSAP** — Baarali does not ship it.
   - ${KIT_DOC}
   - Sizes in \`cqw\`/\`cqh\`/\`cqmin\` so the design fits every format; colours and fonts from the variables \`--background\`, \`--ink\`, \`--accent\`, \`--highlight\`, \`--on-accent\` (text on the accent), \`--brand-1\`… (the palette), \`--display\`, \`--text\`.
   - Media (an image, footage, a voice, music) is copied into the project's \`assets/\` and referenced by a relative path; a \`<video>\` says \`muted\` or \`data-has-audio="true"\`; \`<audio>\` and \`<video>\` are clips with timing.
   - Premium motion: something moves in every second, entrances overlap (stagger 0.08–0.2 s), the key figure lands on a beat, text stays on screen long enough to be read (at least 1.5 s per short line), nothing important sits in the bottom 15% or the right 15% of a 9:16 (the network's buttons).
   - Art direction, what makes it look professional: one idea per shot; one hero size and one text size, two weights at most; generous margins (8 % of the frame) and everything on a few shared alignment lines; at most three colours on screen, the highlight for one thing only; one ease family through the video (\`apple\` for a calm premium film, \`out\` or \`snap\` for energy); a slow camera move or float on every held shot; cuts on the voice's beats; the last shot (logo, call to action) held at least 2 s. A product or an app is shown in use — a window, a phone, the pointer clicking, the text being typed — rather than described.
5. **Footage, voice, music.** For a filmed background, a voice-over or a music bed, use the Video, voice and music skill's tools (\`${MEDIA_SERVER_NAME}\`): give the price in credits first, then copy the file into \`assets/\` and add it as a clip. For a still picture, the Images skill.
6. **Captions.** A video with a voice (a voice-over, someone speaking) gets captions unless the user says otherwise: \`captions\` transcribes the voice and syncs each word to it, two lines at a time, the spoken word in the highlight colour. Then read the words in the project's \`captions.json\`: names, places and prices may be misheard; correct a word's \`text\` there and call \`captions\` again (free). \`position\` moves them (bottom, middle, top). Text without a voice: the \`sous-titres\` template instead.
   **Music under a voice:** call \`mix\` once both are clips (after the captions, it reuses their words for free): the music comes down while the voice speaks, back up in its pauses, and fades out at the end. Too loud or too soft for the user: \`level\` and \`under_voice\`. Name the music clip \`musique\`.
7. **Check, then look.** Call \`check\` and fix every error. Then \`preview\`, with \`brief\` = what the user asked for: an art director looks at frames of the video (one per scene) and names what is wrong — text cut off or too small, overlaps, misalignment, a pointer off its target, a crowded or empty frame — with the fix. Fix each defect in \`index.html\` and preview again: two rounds at most, then show it. Never show a video you have not previewed.
8. **Show it.** Give the path to \`index.html\` in a \`\`\`filepath block, with one sentence on what it shows and what can change. Other formats: \`reformat\`.
9. **Export it** when the user wants the file (to post, to send) or asked for a video from the start: \`render\` with \`mp4\`; \`mp4-light\` for WhatsApp; \`gif\` for a message without sound; \`webm\` for an overlay with a transparent background. Several networks: \`reformat\`, then \`render\` each. Exports use the minutes the plan includes; when they are used up, each minute costs a few media credits — say so before exporting (\`export_minutes\` tells where the user stands). Give the exported file in a \`\`\`filepath block. If it is still rendering, call \`render_status\` until it is done.
10. **Posters and still visuals.** A poster, a flyer, a menu to print, a business card, a status or a post that does not move: a poster template — \`affiche-evenement\` (A3), \`affiche-promo\` (status), \`affiche-menu\` (A4), \`flyer-produit\` (A5), \`carte-visite\` (85 × 55 mm, front and back). On paper, the format is A3, A4, A5, A6 or \`carte\`; for the networks, 9:16, 1:1, 4:5 or 16:9. Their \`qr\` slot draws a QR code that opens WhatsApp: ask the user for the number with its country code (+226…), never guess one, or leave it empty. Then \`preview\`, fix, and \`poster\`: a PNG on a screen format; on paper a PDF for the print shop (true size, 3 mm of bleed, crop marks) and a 300 dpi PNG. "Also give me the poster" after a video: \`poster\` on the video project takes its final pose (or \`at\` a better moment). Several formats: \`reformat\`, then \`poster\` each. Give every file in a \`\`\`filepath block and say which one goes to the printer. Posters are free within the plan's usage.
`;

/** Far future: the control plane rotates the token, core must never try to refresh it. */
export const NEVER_EXPIRES = 4_102_444_800; // 2100-01-01

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}

/** rowboat-server's lock in the workdir (apps/server/src/lock.ts LOCK_FILE). */
export const SERVER_LOCK = 'server.lock';

export async function seedWorkdir(opts: SeedOptions): Promise<void> {
  const config = path.join(opts.workDir, 'config');

  // The server's lock (apps/server/src/lock.ts) outlives a machine stopped
  // hard, and its pid can be some other process after the reboot: the
  // server then refuses /data and the machine never comes back. Seeding
  // runs once per boot, before the server, so any lock here is stale.
  await fs.rm(path.join(opts.workDir, SERVER_LOCK), { force: true });

  // Loopback only: the gate is the one door (gate.ts).
  const serverFile = path.join(config, 'server.json');
  const server = (await readJson(serverFile)) ?? {};
  await writeJson(serverFile, { ...server, lanEnabled: false });

  // Where rowboat-server reads its key (apps/server/src/auth.ts,
  // SERVER_KEY_FILE): rewritten on every boot, the control plane owns it.
  if (opts.serverKey) {
    await fs.mkdir(opts.workDir, { recursive: true });
    const keyFile = path.join(opts.workDir, 'server-key');
    await fs.writeFile(keyFile, opts.serverKey + '\n', { mode: 0o600 });
    // `mode` only applies to a new file.
    await fs.chmod(keyFile, 0o600);
  }

  // The `rowboat` session is how core authenticates to API_URL
  // (core auth/tokens.ts getAccessToken): here, the control plane.
  const oauthFile = path.join(config, 'oauth.json');
  const oauth = (await readJson(oauthFile)) ?? {};
  const providers = (oauth.providers && typeof oauth.providers === 'object' ? oauth.providers : {}) as Record<string, unknown>;
  await writeJson(oauthFile, {
    ...oauth,
    version: 2,
    providers: {
      ...providers,
      rowboat: {
        mode: 'rowboat',
        tokens: { access_token: opts.instanceToken, refresh_token: null, expires_at: NEVER_EXPIRES, token_type: 'Bearer' },
      },
    },
  });

  // The upstream onboarding does not fit an instance: models come from the
  // control plane, and its last step demands a team space, which fails
  // while no Spaces server exists (measured 01/10/2026, architecture §6).
  // Marked done; Baarali's own onboarding (phone login) replaces it.
  const noteFile = path.join(config, 'note_creation.json');
  const note = (await readJson(noteFile)) ?? { strictness: 'medium', configured: false };
  if (note.onboardingComplete !== true) {
    await writeJson(noteFile, { ...note, onboardingComplete: true });
  }

  if (opts.mediaServer) {
    const mcpFile = path.join(config, 'mcp.json');
    const mcp = (await readJson(mcpFile)) ?? {};
    const servers = (mcp.mcpServers && typeof mcp.mcpServers === 'object' ? mcp.mcpServers : {}) as Record<string, unknown>;
    // Otherwise the agent would see the same tools twice, under both names.
    delete servers[FORMER_MEDIA_NAME];
    await fs.rm(path.join(opts.workDir, 'skills', FORMER_MEDIA_NAME), { recursive: true, force: true });
    await writeJson(mcpFile, { ...mcp, mcpServers: { ...servers, [MEDIA_SERVER_NAME]: { type: 'stdio', ...opts.mediaServer } } });
    const skillDir = path.join(opts.workDir, 'skills', MEDIA_SKILL_DIR);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), MEDIA_SKILL);
  }

  if (opts.motionServer) {
    const mcpFile = path.join(config, 'mcp.json');
    const mcp = (await readJson(mcpFile)) ?? {};
    const servers = (mcp.mcpServers && typeof mcp.mcpServers === 'object' ? mcp.mcpServers : {}) as Record<string, unknown>;
    await writeJson(mcpFile, { ...mcp, mcpServers: { ...servers, [MOTION_SERVER_NAME]: { type: 'stdio', ...opts.motionServer } } });
    const skillDir = path.join(opts.workDir, 'skills', MOTION_SKILL_DIR);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), MOTION_SKILL);
  }

  // Ours, rewritten on every boot like the media skill.
  const imagesDir = path.join(opts.workDir, 'skills', IMAGES_SKILL_DIR);
  await fs.mkdir(imagesDir, { recursive: true });
  await fs.writeFile(path.join(imagesDir, 'SKILL.md'), IMAGES_SKILL);

  // Initial model choices only; a choice already made is never overwritten.
  // The image model too (05/10/2026): core seeds it when someone signs in
  // to the gateway (models/rowboat-selection.ts), which never happens on an
  // instance, and without it the image tool is never offered to the agent.
  const modelsFile = path.join(config, 'models.json');
  const models = (await readJson(modelsFile)) ?? { version: 2, providers: {} };
  if (!models.assistantModel || !models.imageModel) {
    await writeJson(modelsFile, {
      ...models,
      version: 2,
      providers: models.providers ?? {},
      assistantModel: models.assistantModel ?? { provider: 'rowboat', model: opts.assistantModel },
      imageModel: models.imageModel ?? { provider: 'rowboat', model: IMAGE_MODEL },
    });
  }

  // The Chat codes on this machine, which is the account's alone (03/10/2026):
  // building and checking a project runs these without asking each time.
  // Anything else (rm, an unknown tool) still asks. The person's own
  // additions are kept; ours come back if removed, on every boot.
  const securityFile = path.join(config, 'security.json');
  let security: unknown = null;
  try {
    security = JSON.parse(await fs.readFile(securityFile, 'utf8'));
  } catch {
    // none yet: core's defaults, then ours
  }
  const current: string[] = Array.isArray(security)
    ? security.filter((c): c is string => typeof c === 'string')
    : security && typeof security === 'object' && Array.isArray((security as { allowedCommands?: unknown }).allowedCommands)
      ? ((security as { allowedCommands: unknown[] }).allowedCommands.filter((c): c is string => typeof c === 'string'))
      : CORE_ALLOWED_COMMANDS;
  const allowed = [...new Set([...current, ...BUILD_COMMANDS])];
  if (allowed.length !== current.length || security === null) {
    await writeJson(
      securityFile,
      Array.isArray(security) || security === null ? allowed : { ...(security as Record<string, unknown>), allowedCommands: allowed },
    );
  }

  // HOME lives on the volume (Dockerfile): created on the first boot, with a
  // git identity so the Chat's commits work; one the person set is kept.
  const home = process.env.HOME;
  if (home && home.startsWith(opts.workDir)) {
    await fs.mkdir(home, { recursive: true });
    const gitconfig = path.join(home, '.gitconfig');
    try {
      await fs.access(gitconfig);
    } catch {
      await fs.writeFile(gitconfig, '[user]\n\tname = Baarali\n\temail = baarali@localhost\n[init]\n\tdefaultBranch = main\n');
    }
  }

  // Room for a real project in one message: 150 model calls in a chat turn
  // instead of 50 (the quota still counts every one). Set once; a limit the
  // person chose is theirs.
  const limitsFile = path.join(config, 'turn_limits.json');
  if (!(await readJson(limitsFile))) {
    await writeJson(limitsFile, { maxModelCalls: 50, chatMaxModelCalls: 150 });
  }
}

/** core config/security.ts DEFAULT_ALLOW_LIST, used when the file does not exist yet. */
export const CORE_ALLOWED_COMMANDS = [
  'agent-slack', 'awk', 'basename', 'cat', 'cut', 'date', 'df', 'diff', 'dirname', 'du', 'echo', 'env', 'file',
  'find', 'grep', 'head', 'hostname', 'jq', 'ls', 'printenv', 'printf', 'pwd', 'readlink', 'realpath', 'sort',
  'stat', 'tail', 'tree', 'uname', 'uniq', 'wc', 'which', 'whoami', 'yq',
];

/** What building and checking a project takes (git, node, python and the plain file tools). */
export const BUILD_COMMANDS = [
  'git', 'node', 'npm', 'npx', 'pnpm', 'yarn', 'corepack', 'tsc', 'vite',
  'python', 'python3', 'pip', 'pip3',
  'mkdir', 'touch', 'cp', 'mv', 'ln', 'sed', 'tee', 'xargs', 'tar', 'unzip', 'zip', 'gzip', 'gunzip',
  'cd', 'test', 'true', 'false', 'sleep', 'chmod', 'curl', 'wget', 'base64', 'sha256sum', 'md5sum',
];
