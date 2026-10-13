import AsyncStorage from '@react-native-async-storage/async-storage';
import { baarasseurs as shared } from '@x/shared';

// BAARALI(11/10/2026): onboarding chooses a default for the recruiting form,
// without creating an agent before sign-in or replacing existing profiles.
export const AVATAR_PREFERENCE_KEY = 'baarali.agent-avatar.v1';
export async function preferredAgentAvatar(): Promise<shared.AgentAvatarId> {
  const saved = await AsyncStorage.getItem(AVATAR_PREFERENCE_KEY).catch(() => null);
  return shared.AVATAR_IDS.includes(saved as shared.AgentAvatarId) ? saved as shared.AgentAvatarId : 'original';
}
