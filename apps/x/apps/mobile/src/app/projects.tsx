import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Empty, Row, Separator, when } from '@/components/baarali-ui';
import { useConnection } from '@/lib/connection';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): the projects on the phone (validated mockup, under the
// Library): each project's chats, a tap to open one, « New chat » to start one
// in that project (projects:createChat).

type Project = { id: string; name: string; path: string; chats: Array<{ id: string; title?: string; modifiedAt: string }> };

export default function ProjectsScreen() {
  const colors = useColors();
  const { rpc } = useConnection();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!rpc) return;
    try {
      setProjects((await rpc.call('projects:list', null)).projects);
    } catch {
      setProjects([]);
    }
  }, [rpc]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const newChat = async (projectId: string) => {
    if (!rpc) return;
    const { sessionId } = await rpc.call('projects:createChat', { projectId });
    router.push({ pathname: '/chat', params: { id: sessionId } });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {projects === null ? <ActivityIndicator style={{ marginTop: 32 }} />
        : projects.length === 0 ? <Empty title="No project yet" text="Create one in Baarali on your computer: its files and chats show up here." />
        : projects.map((p) => (
          <View key={p.id} style={{ marginBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: colors.label }}>{p.name}</Text>
              <Pressable onPress={() => void newChat(p.id)} hitSlop={8}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.accent }}>New chat</Text>
              </Pressable>
            </View>
            {p.chats.length === 0 ? <Text style={{ paddingHorizontal: 16, color: colors.tertiaryLabel }}>No chat yet</Text> : null}
            {p.chats.slice(0, 8).map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <Separator /> : null}
                <Row title={c.title || 'New chat'} right={<Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{when(c.modifiedAt)}</Text>}
                  onPress={() => router.push({ pathname: '/chat', params: { id: c.id } })} />
              </View>
            ))}
          </View>
        ))}
    </ScrollView>
  );
}
