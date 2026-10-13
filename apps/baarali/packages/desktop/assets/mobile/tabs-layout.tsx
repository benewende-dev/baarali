import { Tabs } from 'expo-router';
import { TopNavigation } from '@/components/top-navigation';

// BAARALI(12/10/2026): keep the existing tab routes and their state, while
// the top destinations and sidebar replace the visible bottom bar.
export default function TabsLayout() {
  return <Tabs tabBar={() => null} screenOptions={{ headerShown: false }} backBehavior="history">
    <Tabs.Screen name="home" options={{ title: 'Chat' }} />
    <Tabs.Screen name="more" options={{ title: 'Work' }} />
    <Tabs.Screen name="email" options={{ title: 'Email' }} />
    <Tabs.Screen name="meetings" options={{ title: 'Meetings', headerShown: true, header: () => <TopNavigation mode="work" /> }} />
    <Tabs.Screen name="spaces" options={{ title: 'Spaces' }} />
  </Tabs>;
}
