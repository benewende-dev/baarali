import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, senderName, when } from '@/components/baarali-ui';
import { useConnection } from '@/lib/connection';
import { openThread } from '@/lib/email-thread';
import { useColors } from '@/theme/colors';

// BAARALI(06/10/2026): one thread: its messages, then the reply — the one
// Baarali prepared when there is one — to edit and send. Sending is the
// person's own tap, never the agent's.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const address = (from: string | undefined) => /<([^>]+)>/.exec(from ?? '')?.[1] ?? (from ?? '').trim();

export default function ThreadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { rpc } = useConnection();
  const { id } = useLocalSearchParams<{ id: string }>();
  const thread = useMemo(() => openThread(id), [id]);
  const [reply, setReply] = useState(thread?.draft_response ?? '');
  const [busy, setBusy] = useState<'send' | null>(null);

  if (!thread) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  }
  const messages = (thread.messages ?? []).filter((m) => !m.isDraft);
  const last = messages[messages.length - 1];

  const send = async () => {
    const text = reply.trim();
    if (!text || !rpc || !last) return;
    setBusy('send');
    try {
      const subject = thread.subject ?? last.subject ?? '';
      const res = (await rpc.call('gmail:sendReply', {
        threadId: thread.threadId,
        to: address(last.from),
        subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
        bodyText: text,
        bodyHtml: escape(text).replace(/\n/g, '<br>'),
        ...(last.messageIdHeader ? { inReplyTo: last.messageIdHeader, references: last.messageIdHeader } : {}),
      })) as { ok?: boolean; error?: string };
      if (res && res.ok === false) throw new Error(res.error);
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Could not send. Try again.');
      setBusy(null);
    }
  };

  const archive = async () => {
    await rpc?.call('gmail:archiveThread', { threadId: thread.threadId }).catch(() => {});
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: thread.subject ?? '', headerRight: () => <IconButton icon="sf:archivebox" label="Archive" onPress={() => void archive()} /> }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.label }}>{thread.subject}</Text>
        {thread.summary ? (
          <View style={{ borderRadius: 14, backgroundColor: colors.secondaryBackground, padding: 12, gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.secondaryLabel }}>Summary</Text>
            <Text style={{ fontSize: 15, lineHeight: 21, color: colors.label }}>{thread.summary}</Text>
          </View>
        ) : null}
        {messages.map((m, i) => (
          <View key={m.id ?? i} style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.label }}>{senderName(m.from)}</Text>
              <Text style={{ fontSize: 13, color: colors.tertiaryLabel }}>{when(m.date)}</Text>
            </View>
            <Text selectable style={{ fontSize: 15, lineHeight: 22, color: colors.label }}>{(m.body ?? '').trim()}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={{ borderTopWidth: 0.5, borderTopColor: colors.separator, padding: 12, paddingBottom: insets.bottom + 8, gap: 8, backgroundColor: colors.background }}>
        {thread.draft_response ? <Text style={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>Reply prepared by Baarali</Text> : null}
        <TextInput value={reply} onChangeText={setReply} multiline placeholder="Write your reply…" placeholderTextColor={colors.tertiaryLabel}
          style={{ maxHeight: 160, minHeight: 44, fontSize: 16, lineHeight: 22, color: colors.label, backgroundColor: colors.secondaryBackground, borderRadius: 14, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 }} />
        <Pressable onPress={() => void send()} disabled={!reply.trim() || busy === 'send'}
          style={{ height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: reply.trim() ? 1 : 0.4 }}>
          {busy === 'send' ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ color: colors.onAccent, fontWeight: '600', fontSize: 16 }}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
