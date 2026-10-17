import { router, useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TopNavigation } from './top-navigation';
import { BaaraliMark } from './baarali-mark';
import { useWorkAccess } from '@/lib/work-access-provider';
import { useColors } from '@/theme/colors';

// BAARALI(13/10/2026): checking the route itself also covers deep links;
// protected children never mount or load workspace data for a free account.
export function WorkGate({ children, enabled = true, chrome = true }: { children: ReactNode; enabled?: boolean; chrome?: boolean }) {
  const colors = useColors();
  const { access, verify } = useWorkAccess();
  useFocusEffect(useCallback(() => { if (enabled) void verify(); }, [enabled, verify]));
  if (!enabled || access === 'paid') return <>{children}</>;
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    {chrome && <TopNavigation mode="work" />}
    <View style={{ flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <BaaraliMark size={48} motion={access === 'checking' ? 'loading' : 'static'} />
      {access === 'checking' ? <Text style={{ fontSize: 15, color: colors.secondaryLabel }}>Checking your plan…</Text> : <>
        <Text style={{ fontSize: 24, fontWeight: '600', textAlign: 'center', color: colors.label }}>{access === 'free' ? 'Work is included in paid plans.' : 'Your plan could not be verified.'}</Text>
        <Text style={{ fontSize: 16, lineHeight: 24, textAlign: 'center', color: colors.secondaryLabel }}>{access === 'free' ? 'Explore the plans to use projects, email, meetings, team spaces and Studio.' : 'Reconnect and try again to access Work.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => access === 'free' ? router.push('/plans') : void verify()} style={{ minHeight: 48, borderRadius: 24, paddingHorizontal: 24, backgroundColor: colors.accent, justifyContent: 'center' }}><Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>{access === 'free' ? 'View plans' : 'Try again'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/(tabs)/home')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 15, color: colors.accent }}>Back to Chat</Text></Pressable>
      </>}
    </View>
  </View>;
}
