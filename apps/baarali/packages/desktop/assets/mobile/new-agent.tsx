import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { baarasseurs as shared } from '@x/shared';

import { AgentShape, SHAPE_FILL } from '@/components/agent-shape';
import { useBaarasseurs } from '@/lib/baarasseurs';
import { useColors } from '@/theme/colors';
import { __baaraliT as translate } from '@/baarali-i18n/mobile/runtime';

// BAARALI(07/11/2026): making an agent as Grok Bot makes a bot (the
// founder's call): a shape, a colour, a name, « Create », and its
// conversation opens; the mission is said to it there, in words. The full
// form stays in Your agents (baarasseurs/recruit.tsx).
// BAARALI(09/11/2026): its job too, under its name (the founder's call: the
// job stays, « Mariama · Accountant »), as the desktop's recruiting asks it.
export default function NewAgentScreen() {
  const colors = useColors();
  const { team, upsert } = useBaarasseurs();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [shape, setShape] = useState<shared.AgentShapeId>('b');
  const [color, setColor] = useState<string>('violet');
  const [saving, setSaving] = useState(false);
  const ready = name.trim().length > 0 && !saving;
  const pick = (f: () => void) => { if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync(); f(); };

  const create = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      const taken = (team ?? []).map(b => b.id);
      const b: shared.Baarasseur = { ...shared.blankBaarasseur(taken), id: shared.idFor(name.trim(), taken), name: name.trim(), role: role.trim(), shape, color };
      await upsert(b);
      if (process.env.EXPO_OS === 'ios') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/chat', params: { id: '', agent: shared.baarasseurAgentId(b.id) } });
    } catch {
      setSaving(false);
      Alert.alert(translate('The agent could not be created'), translate('Please try again.'));
    }
  };

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={translate('Close')} onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Image source="sf:xmark" style={{ width: 20, height: 20 }} tintColor={colors.label} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '500', color: colors.label }}>Create a new agent</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 26 }}>
        <View style={{ alignItems: 'center', paddingTop: 12 }} accessible accessibilityLabel={name || translate('New agent')}>
          <AgentShape shape={shape} color={color} size={170} />
          {role.trim() ? <Text numberOfLines={1} style={{ marginTop: 10, fontSize: 15, color: colors.secondaryLabel }}>{role.trim()}</Text> : null}
        </View>
        <TextInput value={name} onChangeText={text => setName(text.slice(0, 40))} placeholder={translate('Name your agent')} placeholderTextColor={colors.tertiaryLabel}
          returnKeyType="done" onSubmitEditing={() => void create()} textAlign="center"
          style={{ height: 60, borderRadius: 18, paddingHorizontal: 16, fontSize: 22, fontWeight: '500', color: colors.label, backgroundColor: colors.secondaryBackground }} />
        <TextInput value={role} onChangeText={text => setRole(text.slice(0, 60))} placeholder={translate('Its job, e.g. Accountant')} placeholderTextColor={colors.tertiaryLabel}
          accessibilityLabel={translate('Job')} returnKeyType="done" onSubmitEditing={() => void create()} textAlign="center"
          style={{ height: 50, marginTop: -14, borderRadius: 16, paddingHorizontal: 16, fontSize: 17, color: colors.label, backgroundColor: colors.secondaryBackground }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }} accessibilityRole="radiogroup">
          {shared.SHAPE_IDS.map(id => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: shape === id }} accessibilityLabel={id} onPress={() => pick(() => setShape(id))}
            style={{ width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: shape === id ? colors.secondaryLabel : 'transparent' }}>
            <AgentShape shape={id} color={color} size={42} />
          </Pressable>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 }} accessibilityRole="radiogroup">
          {shared.SHAPE_COLORS.map(c => <Pressable key={c} accessibilityRole="radio" accessibilityState={{ checked: color === c }} accessibilityLabel={c} onPress={() => pick(() => setColor(c))}
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color === c ? colors.secondaryLabel : 'transparent' }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: SHAPE_FILL[c], borderWidth: c === 'white' ? 1 : 0, borderColor: colors.separator }} />
          </Pressable>)}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: 10 }}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => void create()}
          style={{ height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: ready ? colors.label : colors.secondaryBackground }}>
          {saving ? <ActivityIndicator color={colors.background} /> : <Text style={{ fontSize: 18, fontWeight: '600', color: ready ? colors.background : colors.tertiaryLabel }}>Create</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
