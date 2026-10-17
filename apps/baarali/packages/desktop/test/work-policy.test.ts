import { describe, expect, it, vi } from 'vitest';
import { createWorkGuard, WorkAccessError, WorkCheckError, workChannel, reservedWorkPath, freeMediaServer } from '../assets/mobile/work-policy.js';
const info = (category = 'starter', status = 'active') => ({ subscriptionPlanId: 'plan', subscriptionStatus: status, catalog: { plans: [{ id: 'plan', category }] } });
describe('Work execution entitlement', () => {
  it('accepts paid work and rechecks after a downgrade without caching access', async () => {
    const read = vi.fn().mockResolvedValueOnce(info()).mockResolvedValueOnce(info('free'));
    const check = createWorkGuard(read, async () => 'account');
    await expect(check()).resolves.toBeUndefined();
    await expect(check()).rejects.toBeInstanceOf(WorkAccessError);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('fails closed when billing or authentication cannot be verified', async () => {
    await expect(createWorkGuard(async () => { throw Error('offline'); }, async () => 'a')()).rejects.toBeInstanceOf(WorkCheckError);
    await expect(createWorkGuard(async () => null, async () => 'a')()).rejects.toBeInstanceOf(WorkAccessError);
    await expect(createWorkGuard(async () => info(), async () => { throw Error('signed out'); })()).rejects.toBeInstanceOf(WorkCheckError);
  });
  it('shares concurrent reads for one account but rejects an account changed during the read', async () => {
    let finish!: (value: ReturnType<typeof info>) => void;
    let account = 'a';
    const read = vi.fn(() => new Promise<ReturnType<typeof info>>(resolve => { finish = resolve; }));
    const check = createWorkGuard(read, async () => account);
    const first = check(), second = check();
    await Promise.resolve(); await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    account = 'b'; finish(info());
    await expect(first).rejects.toBeInstanceOf(WorkCheckError);
    await expect(second).rejects.toBeInstanceOf(WorkCheckError);
  });
  it.each(['projects:createChat', 'apps:create', 'codeSession:create', 'terminal:input', 'todo:runItem', 'bg-task:run', 'agent-schedule:updateAgent', 'inline-task:process', 'live-note:run', 'runs:create'])('protects the direct %s channel', channel => expect(workChannel(channel, null)).toBe(true));
  it('leaves ordinary Chat, analysis, voice, media and stopping available', () => {
    for (const channel of ['sessions:list', 'sessions:get', 'voice:transcribe', 'voice:synthesize', 'billing:getMedia', 'workspace:readFile', 'todo:stopRun', 'bg-task:stop', 'runs:stop', 'sessions:stopTurn']) expect(workChannel(channel, { path: 'knowledge/note.md' })).toBe(false);
    expect(workChannel('sessions:sendMessage', { config: { agent: { agentId: 'copilot', overrides: { composition: { searchEnabled: true, voiceInput: true } } } } })).toBe(false);
    expect(freeMediaServer('baarali-media')).toBe(true);
    expect(freeMediaServer('baarali-motion')).toBe(false);
  });
  it('keeps personal task organization in Chat while protecting delegation and schedules', () => {
    for (const channel of ['todo:get', 'todo:save', 'todo:listArchived', 'todo:dismiss', 'todo:restore']) expect(workChannel(channel, null)).toBe(false);
    for (const channel of ['todo:addItem', 'todo:addSubItem']) {
      expect(workChannel(channel, { text: 'Prepare a presentation', run: false })).toBe(false);
      for (const input of [{ text: 'Task', run: true }, { text: '@baarali prepare it', run: false }, { text: '@rowboat prepare it', run: false }, { text: 'Task', run: false, code: { projectId: 'p' } }]) expect(workChannel(channel, input)).toBe(true);
    }
    for (const channel of ['todo:runItem', 'todo:comment', 'todo:setPlanner', 'todo:acceptSuggestion', 'todo:startChat']) expect(workChannel(channel, {})).toBe(true);
  });
  it('protects custom and inline agents, code modes and project composition over Chat RPC', () => {
    for (const agent of [{ agentId: 'baarasseur-mariama' }, { agent: { name: 'custom' } }, { agentId: 'copilot', overrides: { composition: { codeMode: 'claude' } } }, { agentId: 'copilot', overrides: { composition: { workDirId: 'project' } } }]) expect(workChannel('sessions:sendMessage', { config: { agent } })).toBe(true);
  });
  it('requires Work for mail, meetings and spaces while preserving cleanup', () => {
    for (const channel of ['gmail:getImportant', 'gmail:sendReply', 'meeting:summarize', 'meeting-prep:resolve', 'spaces:listOrgs', 'spaces:postMessage']) expect(workChannel(channel, {})).toBe(true);
    for (const channel of ['gmail:getConnectionStatus', 'spaces:accountState', 'spaces:stopRowboat', 'spaces:unsubscribeSpace', 'spaces:removeOrg', 'live-note:stop']) expect(workChannel(channel, {})).toBe(false);
  });
  it('protects Work configuration and directories while keeping attachments and document output writable', () => {
    for (const path of ['config/baarasseurs.json', 'apps/new/index.html', 'foo/../motion/project/index.html', 'agents/custom.yaml', 'bg-tasks/task/task.md']) {
      expect(reservedWorkPath(path)).toBe(true);
      expect(workChannel('workspace:writeFile', { path })).toBe(true);
    }
    for (const path of ['Attachments/mobile/file.pdf', 'knowledge/report.md', 'Documents/analysis.csv', 'Documents/apps/notes.md', 'Attachments/mobile/agents/document.pdf', 'Documents/config/file.json']) expect(workChannel('workspace:writeFile', { path })).toBe(false);
    expect(workChannel('workspace:rename', { from: 'Documents/file', to: 'motion/project/file' })).toBe(true);
  });
  it('resolves absolute reserved paths against the actual workspace root', () => {
    for (const path of ['/home/account/apps/new/index.html', '/home/account/folder/../motion/a/index.html', '/home/account/agents/a.yaml']) expect(reservedWorkPath(path, '/home/account')).toBe(true);
    for (const path of ['/home/account/Documents/apps/notes.md', '/home/account-copy/apps/index.html', '/home/elsewhere/apps/index.html']) expect(reservedWorkPath(path, '/home/account')).toBe(false);
    expect(reservedWorkPath('C:\\Baarali\\motion\\a\\index.html', 'C:\\Baarali')).toBe(true);
    expect(reservedWorkPath('C:\\Baarali\\Documents\\apps\\notes.md', 'C:\\Baarali')).toBe(false);
    expect(workChannel('workspace:writeFile', { path: '/home/account/apps/a/index.html' }, '/home/account')).toBe(true);
  });
});
