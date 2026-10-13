import { useCallback, useRef, useState, type Ref } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, Text, TextInput, View } from 'react-native';
import { ChatComposer, ComposerButton } from './chat-composer';
import { useConnection } from '@/lib/connection';
import { useVoiceInput } from '@/lib/voice';
import { useColors } from '@/theme/colors';
import type { useComposerAttachments } from '@/lib/composer-attachments';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

export function SpaceComposer({ draft, onChange, placeholder, attachments, sending, onSend, inputRef }: {
  draft: string; onChange: (text: string) => void; placeholder: string; attachments: ReturnType<typeof useComposerAttachments>; sending: boolean; onSend: () => void; inputRef?: Ref<TextInput>;
}) {
  const { rpc } = useConnection();
  const colors = useColors();
  const voice = useVoiceInput(rpc);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const cancelRef = useRef(voice.cancel);
  cancelRef.current = voice.cancel;
  useFocusEffect(useCallback(() => { alive.current = true; return () => { alive.current = false; void cancelRef.current(); }; }, [rpc]));
  const dictate = async () => {
    if (!rpc || busy) return;
    setBusy(true);
    try {
      if (voice.state === 'recording') {
        const text = await voice.finish();
        if (text && alive.current) onChange(`${draft.trim()}${draft.trim() ? ' ' : ''}${text}`);
      } else if (await voice.start() === 'denied') {
        Alert.alert(translate('Microphone access'), translate('Allow microphone access in Settings to dictate a message.'));
      }
    } catch {
      await voice.cancel();
      if (alive.current) Alert.alert(translate('Dictation'), translate('Your message could not be transcribed. Please try again.'));
    } finally { setBusy(false); }
  };
  return <ChatComposer draft={draft} onChange={onChange} placeholder={placeholder} files={attachments.files} onRemove={attachments.remove} onAttach={() => void attachments.pick()} picking={attachments.picking}
    busy={sending || busy} onSend={onSend} inputRef={inputRef} onVoice={rpc ? () => void dictate() : undefined} voiceActive={voice.state === 'recording'} voiceLabel={voice.state === 'recording' ? 'Finish dictation' : 'Dictate a message'}
    leading={<ComposerButton icon="sf:at" label="Mention Baarali" disabled={sending || busy} onPress={() => { onChange(`${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}@baarali `); if (inputRef && 'current' in inputRef) inputRef.current?.focus(); }} />}
    extra={voice.state !== 'idle' ? <View><Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{voice.state === 'recording' ? 'Tap the microphone to finish dictation.' : 'Transcribing…'}</Text></View> : undefined} />;
}
