import { Image } from 'expo-image';
import { router, useGlobalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { fileKind, motionProject, saveToPhotos, shareFile, useWorkspaceFiles, workspacePath } from '@/lib/motion';
import { useColors } from '@/theme/colors';

// BAARALI(10/10/2026): the files the agent gives in a ```filepath block, as
// cards in the chat (mockup validated the same day) — on the phone they were
// raw paths. A motion project opens the studio; a video plays in place; a
// poster shows itself; a PDF goes to the print shop through the share sheet.

const baseName = (p: string) => p.split('/').pop() ?? p;

export function FileCards({ paths }: { paths: string[] }) {
  return (
    <View style={{ gap: 10, marginBottom: 10 }}>
      {paths.map((p) => <FileCard key={p} path={p} />)}
    </View>
  );
}

function FileCard({ path }: { path: string }) {
  const kind = fileKind(path);
  if (kind === 'motion') return <MotionCard path={path} />;
  if (kind === 'image') return <ImageCard path={path} />;
  if (kind === 'video') return <VideoCard path={path} />;
  return <DocCard path={path} pdf={kind === 'pdf'} />;
}

function Card({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <View style={{ borderRadius: 16, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: colors.secondaryBackground }}>{children}</View>;
}

function Caption({ title, sub, left }: { title: string; sub: string; left?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: colors.label }}>{title}</Text>
        <Text numberOfLines={2} style={{ fontSize: 13, color: colors.tertiaryLabel }}>{sub}</Text>
      </View>
    </View>
  );
}

/** One action of a card; it shows a spinner while its work runs, and says when it fails. */
function Action({ label, main, onPress }: { label: string; main?: boolean; onPress: () => Promise<unknown> | void }) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await onPress();
        } catch {
          Alert.alert('Not done', 'The file could not be fetched from your workspace. Try again in a moment.');
        } finally {
          setBusy(false);
        }
      }}
      style={({ pressed }) => ({
        flex: 1, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
        backgroundColor: main ? colors.accent : colors.background,
      })}
    >
      {busy ? <ActivityIndicator color={main ? colors.onAccent : colors.label} /> : (
        <Text style={{ fontSize: 14, fontWeight: '600', color: main ? colors.onAccent : colors.label }}>{label}</Text>
      )}
    </Pressable>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>{children}</View>;
}

function useSaving() {
  const { url, headers } = useWorkspaceFiles();
  return {
    share: (path: string) => shareFile(url(path), headers, baseName(path)),
    save: async (path: string) => {
      const ok = await saveToPhotos(url(path), headers, baseName(path));
      Alert.alert(ok ? 'Saved to Photos' : 'No access to Photos', ok ? undefined : 'Allow Rowboat to add to Photos in Settings.');
    },
  };
}

function MotionCard({ path }: { path: string }) {
  const project = motionProject(path)!;
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const open = (sheet?: string) => router.push({ pathname: '/studio', params: { project, chat: id ?? '', ...(sheet ? { sheet } : {}) } });
  return (
    <Card>
      <Pressable onPress={() => open()} accessibilityRole="button" accessibilityLabel="Open the studio"
        style={{ height: 150, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a1630' }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' }}>
          <Image source="sf:play.fill" style={{ width: 20, height: 20, marginLeft: 3 }} tintColor="#000000" />
        </View>
      </Pressable>
      <Caption title={project.replace(/^motion\//, '')} sub="Motion project · plays in the studio" />
      <Actions>
        <Action main label="Open the studio" onPress={() => open()} />
        <Action label="Export" onPress={() => open('export')} />
      </Actions>
      <View style={{ position: 'absolute', top: 8, left: 8, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#ffffff' }}>Studio</Text>
      </View>
    </Card>
  );
}

function ImageCard({ path }: { path: string }) {
  const { url, headers } = useWorkspaceFiles();
  const { share, save } = useSaving();
  const [ratio, setRatio] = useState(1);
  return (
    <Card>
      <Pressable onPress={() => router.push({ pathname: '/viewer', params: { path } })} accessibilityRole="imagebutton" accessibilityLabel="Show full screen">
        <Image
          source={{ uri: url(path), headers }}
          onLoad={(e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height)}
          contentFit="contain"
          transition={150}
          style={{ width: '100%', aspectRatio: Math.max(0.5, Math.min(2, ratio)), maxHeight: 420, backgroundColor: '#000000' }}
        />
      </Pressable>
      <Caption title={baseName(path)} sub={/-300dpi\.png$/i.test(path) ? 'PNG 300 dpi, cut to size' : 'Image'} />
      <Actions>
        <Action main label="Share" onPress={() => share(path)} />
        <Action label="Save" onPress={() => save(path)} />
      </Actions>
    </Card>
  );
}

function VideoCard({ path }: { path: string }) {
  const { url, headers } = useWorkspaceFiles();
  const { share, save } = useSaving();
  const player = useVideoPlayer({ uri: url(path), headers });
  return (
    <Card>
      <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', aspectRatio: 9 / 12, maxHeight: 380, backgroundColor: '#000000' }} />
      <Caption title={baseName(path)} sub={/-mp4-light\.mp4$/i.test(path) ? 'Light MP4, for WhatsApp' : /\.gif$/i.test(path) ? 'GIF' : 'Video'} />
      <Actions>
        <Action main label="Share" onPress={() => share(path)} />
        <Action label="Save to Photos" onPress={() => save(path)} />
      </Actions>
    </Card>
  );
}

function DocCard({ path, pdf }: { path: string; pdf: boolean }) {
  const colors = useColors();
  const { share } = useSaving();
  const icon = (
    <View style={{ width: 36, height: 46, borderRadius: 5, backgroundColor: colors.background, justifyContent: 'flex-end', padding: 3 }}>
      <Text style={{ alignSelf: 'flex-start', fontSize: 8, fontWeight: '800', color: '#ffffff', backgroundColor: pdf ? '#e0322b' : '#636366', paddingHorizontal: 3, borderRadius: 2, overflow: 'hidden' }}>
        {pdf ? 'PDF' : (baseName(path).split('.').pop() ?? '').toUpperCase().slice(0, 4)}
      </Text>
    </View>
  );
  const forPrinter = pdf && /(^|\/)motion\//.test(workspacePath(path));
  return (
    <Card>
      <Caption left={icon} title={baseName(path)} sub={forPrinter ? 'PDF for the print shop · true size, 3 mm bleed, crop marks' : pdf ? 'PDF' : 'File'} />
      <Actions>
        <Action main label={forPrinter ? 'Send' : 'Share'} onPress={() => share(path)} />
        {pdf ? <Action label="Open" onPress={() => router.push({ pathname: '/viewer', params: { path } })} /> : null}
      </Actions>
    </Card>
  );
}
