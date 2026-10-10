import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { phoneLang } from '@/lib/baarasseurs';
import { useConnection } from '@/lib/connection';
import {
  callMotionTool, formatTime, playerPage, readComposition, saveToPhotos, shareFile, siblingFormats, useWorkspaceFiles,
  type Composition, type MotionAnswer,
} from '@/lib/motion';

// BAARALI(10/10/2026): the Studio Motion on the phone, full screen (mockup
// validated the same day). HyperFrames' player plays the project; under it
// the formats already made, the scenes, play and pause; then Export (the
// video, through the instance's `render`), Poster (`poster`) and Retouch,
// which goes back to the chat with the composer ready: changes are asked of
// the agent, in words, as on the Mac.

const POLL_MS = 3000;
const FORMATS = [
  { id: 'mp4', name: 'MP4, high quality', use: '1080p, for TikTok, Reels, YouTube' },
  { id: 'mp4-light', name: 'Light MP4', use: '720p, for a WhatsApp status' },
  { id: 'gif', name: 'GIF', use: 'No sound, for a message' },
] as const;

type Sheet = null | 'export' | 'poster';
type Done = { files: Array<{ file: string; label: string; kind: 'video' | 'png' | 'pdf' }> };

const REFUSED: Record<string, string> = {
  insufficient_media_credits: 'The export minutes of your plan are used up, and the media credits are not enough.',
  composition_errors: 'The project has errors: ask the agent to fix them.',
  print_format: 'This project is on paper: make the poster instead.',
};

export default function StudioScreen() {
  const params = useLocalSearchParams<{ project?: string; chat?: string; sheet?: string }>();
  const { rpc, pairing } = useConnection();
  const { signed, url, headers } = useWorkspaceFiles();
  const insets = useSafeAreaInsets();
  const fr = phoneLang() === 'fr';
  const [project, setProject] = useState(params.project ?? '');
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<Array<{ label: string; project: string }>>([]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(params.sheet === 'export' ? 'export' : null);
  const web = useRef<WebView>(null);

  useEffect(() => {
    if (!rpc || !project) return;
    let cancelled = false;
    setHtml(null);
    (async () => {
      try {
        const r = (await rpc.call('workspace:readFile', { path: `${project}/index.html`, encoding: 'utf8' } as never)) as { data?: string };
        if (!cancelled) setHtml(r.data ?? '');
        const entries = (await rpc.call('workspace:readdir', { path: 'motion' } as never).catch(() => [])) as Array<{ name: string; kind: string }>;
        if (!cancelled) setSiblings(siblingFormats(project, entries.filter((e) => e.kind === 'dir').map((e) => e.name)));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [rpc, project]);

  const comp = useMemo(() => (html ? readComposition(html) : null), [html]);
  const page = useMemo(() => (html ? playerPage(html, (rel) => signed(`${project}/${rel}`)) : null), [html, project, signed]);
  const send = useCallback((m: Record<string, unknown>) => web.current?.injectJavaScript(`window.studio && window.studio(${JSON.stringify(m)}); true;`), []);
  const seek = (t: number) => {
    const c = Math.max(0, Math.min(comp?.duration ?? 0, t));
    send({ seek: c, play: false });
    setTime(c);
  };
  const retouch = (draft: string) => router.dismissTo({ pathname: '/chat', params: { id: params.chat ?? '', draft } });
  const name = project.replace(/^motion\//, '');

  if (error || (html !== null && !comp)) {
    return (
      <Center>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#ffffff' }}>Could not open the project</Text>
        <Text style={{ fontSize: 13, color: '#8e8e93', textAlign: 'center' }}>{error ?? 'Its page has no composition: ask the agent to check it.'}</Text>
      </Center>
    );
  }
  if (!comp || !page || !pairing) return <Center><ActivityIndicator color="#ffffff" /></Center>;

  const sceneIndex = Math.max(0, comp.scenes.findIndex((s) => time >= s.start && time < s.end));
  const step = (d: number) => {
    const starts = comp.scenes.map((s) => s.start);
    if (!starts.length) return seek(d < 0 ? 0 : comp.duration);
    const i = d < 0 ? [...starts].reverse().find((s) => s < time - 0.3) ?? 0 : starts.find((s) => s > time + 0.05) ?? comp.duration;
    seek(i + (d > 0 && i < comp.duration ? 0.01 : 0));
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000000', paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
        <Round icon="xmark" label="Close" onPress={() => router.back()} />
        <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#ffffff' }}>{comp.title || name}</Text>
        <View style={{ width: 34 }} />
      </View>

      <View style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
        <View style={{ height: '100%', maxWidth: '100%', aspectRatio: comp.width / comp.height, borderRadius: 14, overflow: 'hidden', backgroundColor: '#111111' }}>
          <WebView
            ref={web}
            source={{ html: page, baseUrl: pairing.url }}
            originWhitelist={['*']}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            scrollEnabled={false}
            style={{ flex: 1, backgroundColor: '#000000' }}
            onMessage={(e) => {
              try {
                const m = JSON.parse(e.nativeEvent.data) as { t?: number; playing?: boolean };
                if (typeof m.t === 'number') setTime(m.t);
                if (typeof m.playing === 'boolean') setPlaying(m.playing);
              } catch {
                // not ours
              }
            }}
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingTop: 10, justifyContent: 'center', flexGrow: 1 }} style={{ flexGrow: 0 }}>
        {siblings.map((s) => (
          <Chip key={s.project} label={s.label} on={s.project === project} onPress={() => { setTime(0); setPlaying(false); setProject(s.project); }} />
        ))}
        <Chip label="+ format" onPress={() => retouch(fr ? `Fais aussi « ${name} » en ` : `Also make « ${name} » in `)} />
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Scrubber comp={comp} time={time} onSeek={seek} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 }}>
          <Small>{formatTime(time)}</Small>
          <Small>{comp.scenes.length ? `Scene ${sceneIndex + 1} of ${comp.scenes.length}` : comp.print ? `${comp.print[0]} × ${comp.print[1]} mm` : ''}</Small>
          <Small>{formatTime(comp.duration)}</Small>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, paddingVertical: 8 }}>
        <Round icon="backward.end.fill" label="Previous scene" onPress={() => step(-1)} plain />
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={() => send({ play: !playing })}
          style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' }}>
          <Image source={playing ? 'sf:pause.fill' : 'sf:play.fill'} style={{ width: 22, height: 22, marginLeft: playing ? 0 : 3 }} tintColor="#000000" />
        </Pressable>
        <Round icon="forward.end.fill" label="Next scene" onPress={() => step(1)} plain />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
        {comp.print ? null : <Button main label="Export" onPress={() => setSheet('export')} />}
        <Button main={!!comp.print} label="Poster" onPress={() => setSheet('poster')} />
        <Button label="Retouch" onPress={() => retouch(fr ? `Dans « ${name} », ` : `In « ${name} », `)} />
      </View>

      {sheet === 'export' && rpc ? <ExportSheet project={project} duration={comp.duration} onClose={() => setSheet(null)} call={(tool, input) => callMotionTool(rpc, tool, input)} share={(p) => shareFile(url(p), headers, p.split('/').pop() ?? p)} save={(p) => saveToPhotos(url(p), headers, p.split('/').pop() ?? p)} /> : null}
      {sheet === 'poster' && rpc ? (
        <PosterSheet
          comp={comp}
          time={time}
          project={project}
          onClose={() => setSheet(null)}
          onPrint={() => retouch(fr ? `Fais la version à imprimer de « ${name} » en A4` : `Make the print version of « ${name} » in A4`)}
          call={(tool, input) => callMotionTool(rpc, tool, input)}
          share={(p) => shareFile(url(p), headers, p.split('/').pop() ?? p)}
          save={(p) => saveToPhotos(url(p), headers, p.split('/').pop() ?? p)}
        />
      ) : null}
    </View>
  );
}

type Call = (tool: string, input: Record<string, unknown>) => Promise<{ data: MotionAnswer | null; text: string; failed: boolean }>;

function ExportSheet({ project, duration, onClose, call, share, save }: {
  project: string; duration: number; onClose: () => void; call: Call; share: (p: string) => Promise<void>; save: (p: string) => Promise<boolean>;
}) {
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('mp4');
  const [left, setLeft] = useState<string | null>(null);
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'running'; progress: number } | { kind: 'done'; done: Done } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    call('export_minutes', {}).then(({ data }) => {
      const a = data?.allowance;
      if (a && alive.current) {
        const min = Math.max(0, Math.floor((a.totalSeconds - a.usedSeconds) / 60));
        setLeft(`${Math.round(duration)} s · ${min} min of export left this ${a.period}`);
      }
    }).catch(() => {});
  }, [call, duration]);

  const start = async () => {
    setState({ kind: 'running', progress: 0 });
    try {
      let r = await call('render', { project, format, wait: false });
      for (;;) {
        if (!alive.current) return;
        const e = r.data?.export;
        if (r.data?.refused) return setState({ kind: 'error', message: REFUSED[r.data.refused.code] ?? (r.data.refused.message || 'Export is unavailable right now.') });
        if (!e) return setState({ kind: 'error', message: r.text || 'Export is unavailable right now.' });
        if (e.status === 'done' && e.file) return setState({ kind: 'done', done: { files: [{ file: e.file, label: FORMATS.find((f) => f.id === format)!.name, kind: 'video' }] } });
        if (e.status === 'failed' || e.status === 'lost' || e.status === 'unknown') return setState({ kind: 'error', message: e.status === 'lost' ? 'The file was lost on the way. It was refunded: export again.' : 'The export failed. Its minutes were given back.' });
        setState({ kind: 'running', progress: e.progress ?? 0 });
        await new Promise((res) => setTimeout(res, POLL_MS));
        r = await call('render_status', { id: e.id, project, format, wait: false });
      }
    } catch {
      setState({ kind: 'error', message: 'Your computer’s workspace could not be reached. Try again in a moment.' });
    }
  };

  return (
    <SheetFrame title="Export the video" onClose={state.kind === 'running' ? undefined : onClose}>
      {state.kind === 'done' ? <Results done={state.done} share={share} save={save} /> : (
        <>
          {FORMATS.map((f) => <Option key={f.id} title={f.name} sub={f.use} on={format === f.id} onPress={() => setFormat(f.id)} disabled={state.kind === 'running'} />)}
          {state.kind === 'error' ? <Note error>{state.message}</Note> : <Note>{left ?? ' '}</Note>}
          <Button main label={state.kind === 'running' ? `Exporting… ${Math.round(state.progress * 100)} %` : 'Export'} onPress={start} disabled={state.kind === 'running'} tall />
        </>
      )}
    </SheetFrame>
  );
}

function PosterSheet({ comp, time, project, onClose, onPrint, call, share, save }: {
  comp: Composition; time: number; project: string; onClose: () => void; onPrint: () => void; call: Call; share: (p: string) => Promise<void>; save: (p: string) => Promise<boolean>;
}) {
  const [choice, setChoice] = useState<'final' | 'now' | 'print'>('final');
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'running' } | { kind: 'done'; done: Done } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const size = comp.print ? `${comp.print[0]} × ${comp.print[1]} mm` : `${comp.width} × ${comp.height}`;
  const make = async () => {
    if (choice === 'print') return onPrint();
    setState({ kind: 'running' });
    try {
      const r = await call('poster', { project, ...(choice === 'now' ? { at: [Math.round(time * 100) / 100] } : {}) });
      const files = r.data?.poster?.files;
      if (!files?.length) return setState({ kind: 'error', message: r.text.split('\n')[0] || 'The poster could not be made.' });
      setState({ kind: 'done', done: { files: files.map((f) => ({ file: f.file, label: f.label, kind: f.kind })) } });
    } catch {
      setState({ kind: 'error', message: 'Your computer’s workspace could not be reached. Try again in a moment.' });
    }
  };
  return (
    <SheetFrame title="Make the poster" onClose={state.kind === 'running' ? undefined : onClose}>
      {state.kind === 'done' ? <Results done={state.done} share={share} save={save} /> : (
        <>
          <Option title={comp.print ? 'The poster, for the print shop' : 'The image of this video'} sub={comp.print ? `PDF ${size}, 3 mm bleed, crop marks, and PNG 300 dpi` : `PNG ${size}, its final pose`} on={choice === 'final'} onPress={() => setChoice('final')} />
          <Option title="The image at this moment" sub={`PNG, at ${formatTime(time)}`} on={choice === 'now'} onPress={() => setChoice('now')} />
          {comp.print ? null : <Option title="A version to print" sub="A3, A4 or A5: the agent prepares the PDF" on={choice === 'print'} onPress={() => setChoice('print')} />}
          {state.kind === 'error' ? <Note error>{state.message}</Note> : <Note>Free within your plan</Note>}
          <Button main tall label={state.kind === 'running' ? 'Making the image…' : choice === 'print' ? 'Ask the agent' : 'Make the image'} onPress={make} disabled={state.kind === 'running'} />
        </>
      )}
    </SheetFrame>
  );
}

function Results({ done, share, save }: { done: Done; share: (p: string) => Promise<void>; save: (p: string) => Promise<boolean> }) {
  const act = (fn: () => Promise<unknown>) => () => { fn().catch(() => Alert.alert('Not done', 'The file could not be fetched. Try again in a moment.')); };
  return (
    <View style={{ gap: 8 }}>
      {done.files.map((f) => (
        <View key={f.file} style={{ borderRadius: 12, backgroundColor: '#2c2c2e', padding: 12, gap: 10 }}>
          <View>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: '#ffffff' }}>{f.file.split('/').pop()}</Text>
            <Text style={{ fontSize: 12, color: '#8e8e93' }}>{f.label}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button main label={f.kind === 'pdf' ? 'Send to the print shop' : 'Share'} onPress={act(() => share(f.file))} />
            {f.kind === 'pdf'
              ? <Button label="Open" onPress={() => router.push({ pathname: '/viewer', params: { path: f.file } })} />
              : <Button label="Save to Photos" onPress={act(async () => { if (!(await save(f.file))) Alert.alert('No access to Photos', 'Allow Rowboat to add to Photos in Settings.'); })} />}
          </View>
        </View>
      ))}
    </View>
  );
}

function Scrubber({ comp, time, onSeek }: { comp: Composition; time: number; onSeek: (t: number) => void }) {
  const [width, setWidth] = useState(1);
  const at = (e: GestureResponderEvent) => onSeek((e.nativeEvent.locationX / width) * comp.duration);
  const scenes = comp.scenes.length ? comp.scenes : [{ start: 0, end: comp.duration }];
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onResponderGrant={at}
      onResponderMove={at}
      style={{ height: 30, borderRadius: 8, backgroundColor: '#1c1c1e', padding: 3, flexDirection: 'row', gap: 2 }}
    >
      {scenes.map((s, i) => (
        <View key={i} pointerEvents="none" style={{ flex: Math.max(0.01, s.end - s.start), borderRadius: 5, backgroundColor: time >= s.start ? '#3a3a3c' : '#2c2c2e' }} />
      ))}
      <View pointerEvents="none" style={{ position: 'absolute', top: -4, bottom: -4, width: 2, borderRadius: 1, backgroundColor: '#ffffff', left: Math.min(width - 2, (time / comp.duration) * width) }} />
    </View>
  );
}

function SheetFrame({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <View style={{ backgroundColor: '#1c1c1e', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 14 + insets.bottom, gap: 8 }}>
        <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#48484a', marginBottom: 4 }} />
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#ffffff', textAlign: 'center', marginBottom: 4 }}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

function Option({ title, sub, on, onPress, disabled }: { title: string; sub: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} disabled={disabled}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, backgroundColor: '#2c2c2e', borderWidth: 2, borderColor: on ? '#ffffff' : 'transparent' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: on ? 6 : 2, borderColor: on ? '#ffffff' : '#636366' }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#ffffff' }}>{title}</Text>
        <Text style={{ fontSize: 12, color: '#8e8e93' }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function Button({ label, onPress, main, disabled, tall }: { label: string; onPress: () => void; main?: boolean; disabled?: boolean; tall?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({ flex: tall ? undefined : 1, height: tall ? 46 : 40, borderRadius: 23, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.6 : pressed ? 0.75 : 1, backgroundColor: main ? '#ffffff' : '#2c2c2e' })}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: main ? '#000000' : '#ffffff' }}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ borderRadius: 14, borderWidth: 1, borderColor: on ? '#ffffff' : '#3a3a3c', paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#ffffff' : '#8e8e93' }}>{label}</Text>
    </Pressable>
  );
}

function Round({ icon, label, onPress, plain }: { icon: string; label: string; onPress: () => void; plain?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: plain ? 'transparent' : '#1c1c1e' }}>
      <Image source={`sf:${icon}`} style={{ width: plain ? 20 : 14, height: plain ? 20 : 14 }} tintColor="#ffffff" />
    </Pressable>
  );
}

function Note({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return <Text style={{ fontSize: 12, textAlign: 'center', color: error ? '#ff453a' : '#8e8e93', paddingVertical: 2 }}>{children}</Text>;
}

function Small({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 12, color: '#8e8e93', fontVariant: ['tabular-nums'] }}>{children}</Text>;
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32, backgroundColor: '#000000' }}>
      <Stack.Screen options={{ headerShown: false }} />
      {children}
      <Pressable onPress={() => router.back()} style={{ marginTop: 10, paddingHorizontal: 18, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: '#1c1c1e' }}>
        <Text style={{ color: '#ffffff', fontWeight: '600' }}>Close</Text>
      </Pressable>
    </View>
  );
}
