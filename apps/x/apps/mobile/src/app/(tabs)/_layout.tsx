import { Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';

// BAARALI(07/10/2026): the five places at the foot, as WhatsApp keeps them:
// Rowboat (its chats and the baarasseurs), Email, Meetings, Spaces, More.
// Each section with pages under it keeps its own stack; the bar hides there.
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }} backBehavior="history">
      <Tabs.Screen name="home" options={{ title: 'Rowboat' }} />
      <Tabs.Screen name="email" options={{ title: 'Email' }} />
      <Tabs.Screen name="meetings" options={{ title: 'Meetings', headerShown: true, headerShadowVisible: false }} />
      <Tabs.Screen name="spaces" options={{ title: 'Spaces' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
