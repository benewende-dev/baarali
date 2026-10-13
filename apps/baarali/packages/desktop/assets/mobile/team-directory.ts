import type { Member, Space } from '@rowboat/spaces-protocol';

export function searchKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

export function filterDirectory(spaces: Space[], members: Member[], query: string, me: string) {
  const needle = searchKey(query).replace(/^#/, '');
  return {
    spaces: spaces.filter(space => space.kind === 'shared' && (!needle || searchKey(space.name).includes(needle))).sort((a, b) => a.name.localeCompare(b.name)),
    members: members.filter(member => member.id !== me && (!needle || searchKey(member.displayName).includes(needle))).sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };
}
