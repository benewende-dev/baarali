import { describe, expect, it } from 'vitest';
import { filterDirectory } from '../assets/mobile/team-directory.js';

const spaces = [
  { id: 'one', name: 'Équipe commerciale', kind: 'shared' },
  { id: 'two', name: 'Préparation', kind: 'shared' },
  { id: 'private', name: 'Équipe privée', kind: 'direct' },
] as never;
const members = [
  { id: 'me', displayName: 'Élodie' },
  { id: 'other', displayName: 'Élodie Durand' },
  { id: 'agent', displayName: 'Mariama' },
] as never;

describe('team directory search', () => {
  it('finds groups with accents from an unaccented query or a channel-style query', () => {
    expect(filterDirectory(spaces, members, ' #equipe ', 'me').spaces.map(item => item.id)).toEqual(['one']);
    expect(filterDirectory(spaces, members, 'PREPARATION', 'me').spaces.map(item => item.id)).toEqual(['two']);
  });
  it('keeps private conversations out of the group list and the current member out of the directory', () => {
    const result = filterDirectory(spaces, members, '', 'me');
    expect(result.spaces.map(item => item.id)).toEqual(['one', 'two']);
    expect(result.members.map(item => item.id)).toEqual(['other', 'agent']);
    expect(filterDirectory(spaces, members, 'elodie', 'me').members.map(item => item.id)).toEqual(['other']);
  });
});
