import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BaaraliMascot, type MascotMotion } from './baarali-mascot';
import { useColors } from '@/theme/colors';

// BAARALI(11/10/2026): the approved compact login replaces feature paragraphs
// with the furry guide; account/session operations remain in SpacesScreen.
export function BaaraliSignInView({ step, email, code, busy, error, onEmail, onCode, onSend, onConfirm, onChange, onOther, onPair }: {
  step: 'email' | 'code'; email: string; code: string; busy: boolean; error: string | null;
  onEmail: (value: string) => void; onCode: (value: string) => void; onSend: () => void; onConfirm: () => void;
  onChange: () => void; onOther: () => void; onPair: () => void;
}) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const hint = error ? 'Check your entry.' : busy ? (step === 'email' ? 'Sending your code…' : 'Checking your code…') :
    step === 'code' ? (code.length === 6 ? 'You can sign in now.' : 'Enter the six-digit code.') :
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'You can receive your code.' : 'Enter your email address.';
  const motion: MascotMotion = error ? 'error' : busy ? 'waiting' : step === 'code' && code.length === 6 ? 'success' : focused ? 'focus' : step === 'code' ? 'idle' : 'welcome';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
          <Image source={colors.label === '#ffffff' ? require('../../assets/brand/wordmark-light.svg') : require('../../assets/brand/wordmark-dark.svg')} contentFit="contain" style={s.brand} accessibilityLabel="Baarali" />
          <View style={s.guide}>
            <View style={[s.bubble, { backgroundColor: colors.secondaryBackground, borderColor: colors.separator }]}>
              <Text accessibilityLiveRegion="polite" style={[s.hint, { color: error ? colors.destructive : colors.label }]}>{hint}</Text>
            </View>
            <BaaraliMascot size={168} motion={motion} />
          </View>
          <Text accessibilityRole="header" style={[s.heading, { color: colors.label }]}>{step === 'email' ? 'Sign in' : 'Your sign-in code'}</Text>
          {step === 'code' && <Text style={[s.address, { color: colors.secondaryLabel }]}>{email.trim()}</Text>}
          <View style={s.form}>
            <Text style={[s.label, { color: colors.label }]}>{step === 'email' ? 'Email address' : 'Sign-in code'}</Text>
            {step === 'email' ? <TextInput
              key="email" value={email} onChangeText={onEmail} placeholder="you@example.com" accessibilityLabel="Email address"
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholderTextColor={colors.tertiaryLabel}
              autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
              returnKeyType="send" onSubmitEditing={onSend} editable={!busy}
              style={[s.input, { color: colors.label, backgroundColor: colors.secondaryBackground, borderColor: colors.separator }]}
            /> : <TextInput
              key="code" value={code} onChangeText={onCode} placeholder="000000" accessibilityLabel="Six-digit sign-in code"
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholderTextColor={colors.tertiaryLabel}
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" autoFocus maxLength={6} editable={!busy}
              onSubmitEditing={onConfirm} style={[s.input, s.code, { color: colors.label, backgroundColor: colors.secondaryBackground, borderColor: colors.separator }]}
            />}
            <Pressable accessibilityRole="button" disabled={busy || (step === 'code' && code.length !== 6)} onPress={step === 'email' ? onSend : onConfirm}
              style={({ pressed }) => [s.primary, { backgroundColor: colors.accent, opacity: pressed || busy || (step === 'code' && code.length !== 6) ? .65 : 1 }]}>
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <><Text style={[s.primaryText, { color: colors.onAccent }]}>{step === 'email' ? 'Get a sign-in code' : 'Sign in'}</Text><Text accessibilityElementsHidden style={{ color: colors.onAccent, fontSize: 20 }}>→</Text></>}
            </Pressable>
            {step === 'code' ? <View style={s.codeActions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={onSend} style={s.textButton}><Text style={{ color: colors.accent, fontSize: 13 }}>Send a new code</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setFocused(false); onChange(); }} style={s.textButton}><Text style={{ color: colors.accent, fontSize: 13 }}>Change email</Text></Pressable>
            </View> : <>
              <View style={s.divider}><View style={[s.line, { backgroundColor: colors.separator }]} /><Text style={{ color: colors.secondaryLabel, fontSize: 12 }}>or</Text><View style={[s.line, { backgroundColor: colors.separator }]} /></View>
              <Pressable accessibilityRole="button" disabled={busy} onPress={onOther} style={[s.secondary, { borderColor: colors.separator }]}><Text style={{ color: colors.label, fontSize: 13 }}>Other sign-in options</Text><Text accessibilityElementsHidden style={{ color: colors.secondaryLabel }}>›</Text></Pressable>
            </>}
            {error && <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 13, lineHeight: 19 }}>{error}</Text>}
            <Pressable accessibilityRole="button" disabled={busy} onPress={onPair} style={[s.pair, { borderTopColor: colors.separator }]}>
              <Image source="sf:desktopcomputer" style={{ width: 16, height: 16 }} tintColor={colors.secondaryLabel} />
              <Text style={{ color: colors.secondaryLabel, fontSize: 13 }}>Connect your Mac</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, width: '100%', maxWidth: 440, alignSelf: 'center' },
  brand: { width: 124, height: 34, alignSelf: 'center' },
  guide: { alignItems: 'center', gap: 12, paddingTop: 24, paddingBottom: 18 },
  bubble: { maxWidth: '100%', borderWidth: .5, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, borderBottomLeftRadius: 4 },
  hint: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  heading: { fontSize: 26, fontWeight: '600', letterSpacing: -.6, textAlign: 'center', marginTop: 10, marginBottom: 24 },
  address: { fontSize: 13, textAlign: 'center', marginTop: -12, marginBottom: 22 },
  form: { gap: 10 }, label: { fontSize: 13, fontWeight: '500' },
  input: { minHeight: 54, paddingVertical: 15, paddingHorizontal: 16, borderRadius: 16, borderWidth: .5, fontSize: 16 },
  code: { fontSize: 27, letterSpacing: 8, textAlign: 'center' },
  primary: { minHeight: 54, paddingVertical: 14, paddingHorizontal: 17, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryText: { fontSize: 15, fontWeight: '600' },
  codeActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, textButton: { minHeight: 44, justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 10 }, line: { height: .5, flex: 1 },
  secondary: { minHeight: 52, borderWidth: .5, borderRadius: 16, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pair: { minHeight: 58, borderTopWidth: .5, marginTop: 12, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
});
