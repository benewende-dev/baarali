import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopNavigation } from '@/components/top-navigation';
import { WorkGate } from '@/components/work-gate';
import { BaaraliLogo } from '@/components/baarali-logo';
import { BaaraliMark } from '@/components/baarali-mark';
import { ChatComposer } from '@/components/chat-composer';
import { ModelPill } from '@/components/model-picker';
import { useComposerAttachments, stageAttachments } from '@/lib/composer-attachments';
import { useConnection } from '@/lib/connection';
import { useModels } from '@/lib/use-models';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

type Project = { id: string; name: string; chats: Array<{ id: string; title?: string; modifiedAt: string }> };

// BAARALI(12/10/2026): Work opens the real projects and app tools.
// Its composer uses the shared agent; writing a request never starts work.
export default function WorkHome() {
  return <WorkGate><WorkHomeContent /></WorkGate>;
}

function WorkHomeContent() {
  const colors = useColors();
  const { rpc, pairing } = useConnection();
  const models = useModels();
  const files = useComposerAttachments();
  const [draft, setDraft] = useState('');
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    if (!rpc) return;
    try { setProjects((await rpc.call('projects:list', null)).projects); setError(false); }
    catch { setError(true); }
  }, [rpc]);
  const refreshModels = models.refresh;
  useFocusEffect(useCallback(() => { void load(); void refreshModels().catch(() => {}); }, [load, refreshModels]));
  const send = () => {
    if (!draft.trim() && !files.files.length) return;
    router.push({ pathname: '/chat', params: { id: '', mode: 'work', draft: draft.trim(), submit: '1', attachments: stageAttachments(files.files) } });
    setDraft(''); files.clear();
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
    <TopNavigation mode="work" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingTop: 36, gap: 24 }}>
        <View style={{ gap: 14 }}><BaaraliLogo /><Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '600', color: colors.label }}>Let's build something.</Text><Text style={{ fontSize: 17, lineHeight: 24, color: colors.secondaryLabel }}>Describe a task, an app or a project.</Text></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[{ label: 'Projects', icon: 'sf:folder', path: '/projects' }, { label: 'Apps', icon: 'sf:chevron.left.forwardslash.chevron.right', path: '/apps' }, { label: 'Your agents', icon: 'sf:person.2', path: '/baarasseurs' }].map(item => <Pressable key={item.path} accessibilityRole="button" onPress={() => router.push(item.path as '/projects' | '/apps' | '/baarasseurs')} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: colors.secondaryBackground, flexDirection: 'row', gap: 8, alignItems: 'center' }}><Image source={item.icon} style={{ width: 16, height: 16 }} tintColor={colors.label} /><Text style={{ fontSize: 14, color: colors.label }}>{translate(item.label)}</Text></Pressable>)}
        </View>
        {!pairing ? <Pressable accessibilityRole="button" onPress={() => router.push('/pairing')} style={{ paddingVertical: 16 }}><Text style={{ color: colors.accent, fontSize: 16 }}>Connect your computer</Text></Pressable> : <>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, fontSize: 14, color: colors.secondaryLabel }}>Your projects</Text><Pressable accessibilityRole="button" onPress={() => router.push('/projects')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ fontSize: 14, color: colors.accent }}>See all</Text></Pressable></View>
          {error ? <Pressable accessibilityRole="button" onPress={() => void load()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accent }}>Reload projects</Text></Pressable>
            : projects === null ? <View style={{ alignItems: 'center' }}><BaaraliMark motion="loading" size={32} /></View>
            : projects.length === 0 ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.secondaryLabel }}>Your projects will appear here.</Text>
            : projects.slice(0, 3).map(project => <Pressable key={project.id} accessibilityRole="button" onPress={() => router.push('/projects')} style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 })}><Image source="sf:folder" style={{ width: 22, height: 22 }} tintColor={colors.label} /><Text style={{ flex: 1, fontSize: 16, color: colors.label }} numberOfLines={1}>{project.name}</Text><Image source="sf:chevron.right" style={{ width: 12, height: 12 }} tintColor={colors.secondaryLabel} /></Pressable>)}
        </>}
      </ScrollView>
      <View style={{ marginHorizontal: 12, marginBottom: 10 }}><ChatComposer draft={draft} onChange={setDraft} placeholder="Describe your task or project" files={files.files} onRemove={files.remove} onAttach={() => void files.pick()} picking={files.picking} onSend={send} leading={<ModelPill models={models} />} onVoice={() => router.push({ pathname: '/chat', params: { id: '', mode: 'work', talk: '1' } })} voiceLabel="Talk with Baarali" /></View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
