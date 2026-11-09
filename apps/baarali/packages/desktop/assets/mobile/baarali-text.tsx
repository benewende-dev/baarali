import { createContext, useContext } from 'react';
import { Platform, StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

// BAARALI(08/11/2026): the phone reads as the desktop's download page (the
// founder's call): Inter for the text, Source Serif 4 for the titles, weight
// 500 as the page's h1-h3. The app's screens import Text and TextInput from
// react-native; the build's Babel step (fonts-babel.cjs) points them here.
// A style that names its own font (mono, Menlo) keeps it; a Text inside
// another Text inherits its parent's face.

export const SANS = 'Inter';
export const SERIF = 'Source Serif 4';
/** From this size on, a line is a title. */
const TITLE = 22;

const Nested = createContext(false);

// BAARALI(08/11/2026): Baarali in the browser. The phone links the fonts into
// the app (expo-font plugin); the web has to load them, one family per weight
// (a browser picks no file by fontWeight in one registered family).
const WEB_FACES: Record<string, Record<string, string>> = {
  [SANS]: { '400': SANS, '500': 'Inter-Medium', '600': 'Inter-SemiBold', '700': 'Inter-Bold' },
  [SERIF]: { '400': SERIF, '500': 'SourceSerif4-Medium', '600': 'SourceSerif4-SemiBold' },
};
if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Font = require('expo-font') as typeof import('expo-font');
  void Font.loadAsync({
    [SANS]: require('../../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
    [SERIF]: require('../../assets/fonts/SourceSerif4-Regular.ttf'),
    'SourceSerif4-Medium': require('../../assets/fonts/SourceSerif4-Medium.ttf'),
    'SourceSerif4-SemiBold': require('../../assets/fonts/SourceSerif4-SemiBold.ttf'),
  }).catch(() => { /* the browser's own face stays */ });
}

/** On the web, the weight's own family (WEB_FACES); elsewhere the family as is. */
function webFace(f: TextStyle, s: TextStyle): TextStyle {
  if (Platform.OS !== 'web' || !f.fontFamily) return f;
  const w = String(f.fontWeight ?? s.fontWeight ?? '400').replace('normal', '400').replace('bold', '700');
  const faces = WEB_FACES[f.fontFamily];
  const family = faces?.[w] ?? faces?.[String(Math.min(Number(w) || 400, 600))];
  return family ? { ...f, fontFamily: family, fontWeight: '400' } : f;
}

function face(style: TextProps['style'], nested: boolean): TextStyle | null {
  const s = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (s.fontFamily) return null;
  if ((s.fontSize ?? 0) >= TITLE) {
    const light = s.fontWeight === undefined || s.fontWeight === 'normal' || s.fontWeight === '400' || s.fontWeight === 400 || Number(s.fontWeight) < 400;
    return webFace({ fontFamily: SERIF, fontWeight: light ? '400' : '500' }, s);
  }
  return nested ? null : webFace({ fontFamily: SANS }, s);
}

export function Text(props: TextProps) {
  const nested = useContext(Nested);
  const f = face(props.style, nested);
  return <Nested.Provider value>
    <NativeText {...props} style={f ? [props.style, f] : props.style} />
  </Nested.Provider>;
}

export function TextInput(props: TextInputProps) {
  const f = face(props.style, false);
  return <NativeTextInput {...props} style={f ? [props.style, f] : props.style} />;
}
