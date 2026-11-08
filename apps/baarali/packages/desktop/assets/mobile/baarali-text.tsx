import { createContext, useContext } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextInputProps, type TextProps, type TextStyle } from 'react-native';

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

function face(style: TextProps['style'], nested: boolean): TextStyle | null {
  const s = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (s.fontFamily) return null;
  if ((s.fontSize ?? 0) >= TITLE) {
    const light = s.fontWeight === undefined || s.fontWeight === 'normal' || s.fontWeight === '400' || s.fontWeight === 400 || Number(s.fontWeight) < 400;
    return { fontFamily: SERIF, fontWeight: light ? '400' : '500' };
  }
  return nested ? null : { fontFamily: SANS };
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
