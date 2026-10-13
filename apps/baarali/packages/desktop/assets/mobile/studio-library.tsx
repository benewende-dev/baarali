import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BaaraliMark } from './baarali-mark';
import { useConnection } from '@/lib/connection';
import { motionProject } from '@/lib/motion-project';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';
import { StudioCadEditor } from './studio-cad-editor';

// BAARALI(12/10/2026): the new More entry must open a real project chooser,
// while chat file cards keep going straight to the existing Studio player.
export function StudioLibrary() {
  const colors = useColors();
  const { rpc, events } = useConnection();
  const [projects, setProjects] = useState<Array<{ path: string; modified: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!rpc) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    void rpc.call('workspace:exists', { path: 'motion' })
      .then(result => result.exists ? rpc.call('workspace:readdir', { path: 'motion', opts: { recursive: true, includeStats: true } }) : [])
      .then(entries => {
        if (!alive) return;
        setProjects(entries.filter(entry => entry.kind === 'file' && motionProject(entry.path)).map(entry => ({ path: motionProject(entry.path)!, modified: entry.stat?.mtimeMs ?? 0 })).sort((a, b) => b.modified - a.modified));
        setError(false);
      })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [rpc, version]));

  useEffect(() => {
    if (!events) return;
    const off = events.on('workspace:didChange', payload => {
      const event = payload as { path?: string; paths?: string[] };
      if ([event.path, ...(event.paths ?? [])].some(path => path?.startsWith('motion/'))) setVersion(current => current + 1);
    });
    return off;
  }, [events]);

  // BAARALI(12/10/2026): this full-screen modal measures its own safe area;
  // the tab navigator's insets do not describe the modal's status bar.
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
    <View style={{ paddingHorizontal: 20, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondaryBackground }}>
        <Image source="sf:xmark" style={{ width: 17, height: 17 }} tintColor={colors.label} />
      </Pressable>
      <Text style={{ flex: 1, fontSize: 18, fontWeight: '600', color: colors.label }}>Studio</Text>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}
    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setVersion(version + 1)} />}>
    <Text style={{ fontSize: 27, fontWeight: '700', color: colors.label }}>Your motion projects</Text>
    <Text style={{ fontSize: 15, lineHeight: 21, color: colors.secondaryLabel }}>Open a project to preview, adjust its scenes or export it.</Text>
    <StudioCadEditor onProject={project => router.push({ pathname: '/studio', params: { project } })} />
    {error && <View style={{ gap: 8 }}><Text style={{ color: colors.destructive }}>Could not load projects. Try again.</Text>
      <Pressable accessibilityRole="button" onPress={() => setVersion(version + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent }}>Retry</Text></Pressable></View>}
    {loading && projects.length === 0 ? <View style={{ alignItems: 'center', paddingVertical: 24 }} accessible accessibilityLabel="Loading…"><BaaraliMark size={44} motion="loading" /></View> : projects.map(project => <Pressable key={project.path} accessibilityRole="button"
      onPress={() => router.push({ pathname: '/studio', params: { project: project.path } })}
      style={({ pressed }) => ({ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderRadius: 17, backgroundColor: colors.secondaryBackground, opacity: pressed ? 0.7 : 1 })}>
      <Image source="sf:play.rectangle" style={{ width: 26, height: 26 }} tintColor={colors.accent} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: '500', color: colors.label }}>{project.path.slice('motion/'.length).replace(/[-_]/g, ' ')}</Text>
        {project.modified > 0 && <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{new Date(project.modified).toLocaleDateString()}</Text>}
      </View>
      <Image source="sf:chevron.right" style={{ width: 13, height: 13 }} tintColor={colors.secondaryLabel} />
    </Pressable>)}
    {!loading && !error && projects.length === 0 && <Text style={{ fontSize: 15, lineHeight: 21, color: colors.secondaryLabel }}>No motion projects yet. Describe your video in the chat to get started.</Text>}
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/chat', params: { id: '', mode: 'work', draft: translate('Help me prepare a motion video for my project.') } })}
      style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>Prepare a video</Text>
    </Pressable>
    </ScrollView>
  </SafeAreaView></SafeAreaProvider>;
}
