import { canUseWork } from './work-access.js';
export type WorkInfo = Parameters<typeof canUseWork>[0];
export class WorkAccessError extends Error {
  readonly code = 'work_plan_required';
  readonly status = 403;
  constructor() { super('Work est accessible avec un forfait payant actif.'); }
}
export class WorkCheckError extends Error {
  readonly code = 'work_access_unavailable';
  readonly status = 503;
  constructor() { super('Impossible de vérifier votre forfait. Veuillez réessayer.'); }
}
// BAARALI(13/10/2026): paid execution is enforced at transport and runtime,
// not only in navigation. Concurrent checks share a request for one identity;
// no entitlement survives a completed request or an account change.
export function createWorkGuard(read: () => Promise<WorkInfo>, identity: () => Promise<string>, now = Date.now) {
  const pending = new Map<string, Promise<WorkInfo>>();
  return async () => {
    try {
      const key = await identity();
      let request = pending.get(key);
      if (!request) {
        request = read(); pending.set(key, request);
        void request.finally(() => { if (pending.get(key) === request) pending.delete(key); }).catch(() => {});
      }
      const info = await request;
      if (await identity() !== key) throw new WorkCheckError();
      if (!canUseWork(info, now())) throw new WorkAccessError();
    } catch (error) {
      if (error instanceof WorkAccessError || error instanceof WorkCheckError) throw error;
      throw new WorkCheckError();
    }
  };
}
const WORK_PREFIXES = ['projects:', 'apps:', 'codeMode:', 'codeProject:', 'codeSession:', 'terminal:', 'todo:', 'bg-task:', 'agent-schedule:', 'inline-task:', 'live-note:', 'runs:'];
const STOP_CHANNELS = new Set(['todo:stopRun', 'bg-task:stop', 'live-note:stop', 'runs:stop', 'codeSession:stop', 'terminal:dispose', 'codeRun:resolvePermission']);
// BAARALI(15/10/2026): personal tasks belong to Chat. Organizing the list
// stays available; delegating execution and the planner still require Work.
const PERSONAL_TASK_CHANNELS = new Set(['todo:get', 'todo:save', 'todo:getPlanner', 'todo:getConversation', 'todo:getSessionConversation', 'todo:clearCompleted', 'todo:dismiss', 'todo:listArchived', 'todo:deleteArchived', 'todo:restore', 'todo:declineSuggestion']);
export function workChannel(channel: string, input: unknown, workRoot?: string): boolean {
  if (STOP_CHANNELS.has(channel)) return false;
  if (PERSONAL_TASK_CHANNELS.has(channel)) return false;
  if (channel === 'todo:addItem' || channel === 'todo:addSubItem') {
    const args = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    return args.run !== false || Boolean(args.code) || (typeof args.text === 'string' && /@(?:baarali|rowboat)\b/i.test(args.text));
  }
  if (channel === 'sessions:resumeTurn') return true;
  if (WORK_PREFIXES.some(prefix => channel.startsWith(prefix))) return true;
  const args = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (channel === 'sessions:create') return typeof args.agentId === 'string' && args.agentId !== 'copilot' && args.agentId !== 'rowboatx';
  if (channel === 'sessions:sendMessage' || channel === 'sessions:sendOrQueueMessage') {
    const config = args.config as Record<string, unknown> | undefined;
    const agent = config?.agent as Record<string, unknown> | undefined;
    const overrides = agent?.overrides as Record<string, unknown> | undefined;
    const composition = overrides?.composition as Record<string, unknown> | undefined;
    return Boolean(agent && (typeof agent.agentId !== 'string' || !['copilot', 'rowboatx'].includes(agent.agentId))) || Boolean(composition?.codeMode || composition?.codeCwd || composition?.workDirId || composition?.commandCenter);

  }
  if (channel.startsWith('workspace:') && !['workspace:getRoot', 'workspace:exists', 'workspace:stat', 'workspace:readdir', 'workspace:readFile'].includes(channel)) {
    return [args.path, args.from, args.to, args.src, args.dest, args.sourcePath, args.destinationPath].some(value => reservedWorkPath(value, workRoot));
  }
  return false;
}
export function reservedWorkPath(value: unknown, workRoot?: string): boolean {
  if (typeof value !== 'string') return false;
  const normalize = (path: string) => {
    const parts: string[] = [];
    for (const part of path.replace(/\\/g, '/').split('/')) {
      if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part.toLowerCase());
    }
    return parts;
  };
  let parts = normalize(value);
  // BAARALI(13/10/2026): only the instance's reserved roots belong to Work;
  // a user document named Documents/apps/... must stay writable in Chat.
  if (/^(?:[/\\]|[a-z]:[/\\])/i.test(value)) {
    if (!workRoot) return false;
    const root = normalize(workRoot);
    if (!root.length || !root.every((part, index) => parts[index] === part)) return false;
    parts = parts.slice(root.length);
  }
  return ['config', 'agents', 'bg-tasks', 'apps', 'motion'].includes(parts[0] ?? '');
}
export function freeMediaServer(server: string): boolean { return server === 'baarali-media'; }
