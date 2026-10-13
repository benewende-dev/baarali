import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useConnection } from '@/lib/connection';
import { speak, spokenPart, stopSpeaking } from '@/lib/voice';
import { useColors } from '@/theme/colors';

// BAARALI(12/10/2026): approved response actions use the real clipboard and
// account voice. A route change stops only the reading this row started.
export function ReplyActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const colors = useColors();
  const { rpc } = useConnection();
  const [copied, setCopied] = useState(false);
  const [reading, setReading] = useState(false);
  const ownsReading = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  useFocusEffect(useCallback(() => () => { if (ownsReading.current) { ownsReading.current = false; stopSpeaking(); } }, []));
  const copy = async () => {
    try {
      const written = await Clipboard.setStringAsync(text);
      if (!written) throw new Error('Could not copy this response.');
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { Alert.alert('Could not copy this response.'); }
  };
  const listen = async () => {
    if (reading) { ownsReading.current = false; stopSpeaking(); setReading(false); return; }
    if (!rpc) return;
    const opening = spokenPart(text);
    if (!opening) return;
    ownsReading.current = true;
    setReading(true);
    try { await speak(rpc, opening); }
    catch { Alert.alert('Could not read this response. Try again.'); }
    finally { ownsReading.current = false; setReading(false); }
  };
  const style = { minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingHorizontal: 7 };
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
    {!!text.trim() && <Pressable accessibilityRole="button" onPress={() => void copy()} style={style}>
      <Image source={copied ? 'sf:checkmark' : 'sf:doc.on.doc'} style={{ width: 15, height: 15 }} tintColor={colors.secondaryLabel} />
      <Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{copied ? 'Copied' : 'Copy'}</Text>
    </Pressable>}
    {onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={style}>
      <Image source="sf:arrow.clockwise" style={{ width: 15, height: 15 }} tintColor={colors.secondaryLabel} /><Text style={{ fontSize: 12, color: colors.secondaryLabel }}>Retry</Text>
    </Pressable>}
    {!!text.trim() && <Pressable accessibilityRole="button" disabled={!rpc} onPress={() => void listen()} style={style}>
      <Image source={reading ? 'sf:stop' : 'sf:speaker.wave.2'} style={{ width: 15, height: 15 }} tintColor={colors.secondaryLabel} /><Text style={{ fontSize: 12, color: colors.secondaryLabel }}>{reading ? 'Stop reading' : 'Listen'}</Text>
    </Pressable>}
  </View>;
}
