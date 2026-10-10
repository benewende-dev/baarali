import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { fileKind, shareFile, useWorkspaceFiles } from '@/lib/motion';

// BAARALI(10/10/2026): a poster or a PDF from the chat, full screen (mockup
// validated the same day). An image zooms with two fingers; a PDF is drawn
// by iOS in a web view, which also prints it. Share sends either one on.

export default function ViewerScreen() {
  const { path = '' } = useLocalSearchParams<{ path?: string }>();
  const { url, headers } = useWorkspaceFiles();
  const name = path.split('/').pop() ?? '';
  const share = () => shareFile(url(path), headers, name).catch(() => Alert.alert('Not shared', 'The file could not be fetched. Try again in a moment.'));
  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <Stack.Screen
        options={{
          title: name,
          headerRight: () => (
            <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share" hitSlop={8}>
              <Image source="sf:square.and.arrow.up" style={{ width: 20, height: 20 }} tintColor="#ffffff" />
            </Pressable>
          ),
        }}
      />
      {fileKind(path) === 'image' ? (
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}>
          <Image source={{ uri: url(path), headers }} contentFit="contain" style={{ flex: 1, minHeight: 300 }} />
        </ScrollView>
      ) : (
        <WebView source={{ uri: url(path), headers }} style={{ flex: 1, backgroundColor: '#000000' }} originWhitelist={['*']} />
      )}
    </View>
  );
}
