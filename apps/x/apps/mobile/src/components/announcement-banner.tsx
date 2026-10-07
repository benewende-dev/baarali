import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { Announcement } from '@x/shared/dist/billing.js';

import { useConsoleMessages } from '@/lib/console-messages';
import { useColors } from '@/theme/colors';

// The banner at the top of the home tab (Baarali, 07/10/2026), written in the
// admin console, the same one the Mac shows above its Chat. Closed here, it
// is closed on every device.

/** Where an announcement's button leads on the phone. */
function follow(a: Announcement): void {
  if (a.target === 'voice') router.push({ pathname: '/chat', params: { id: '', talk: '1' } });
  // The plan and the week's use live in Settings on the phone.
  else if (a.target === 'plans' || a.target === 'usage') router.push('/settings');
  else if (a.target === 'link' && a.link?.startsWith('https://')) void Linking.openURL(a.link);
}

export function AnnouncementBanner() {
  const colors = useColors();
  const { announcement, announcementEvent, dismissAnnouncement } = useConsoleMessages();
  const id = announcement?.id;
  useEffect(() => {
    if (id) announcementEvent(id, 'view');
  }, [id, announcementEvent]);
  if (!announcement) return null;

  const important = announcement.tone === 'important';
  return (
    <View
      accessibilityRole="summary"
      style={{
        marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingLeft: 14, paddingRight: 8,
        borderColor: important ? 'rgba(255,149,0,0.6)' : colors.separator,
        backgroundColor: important ? 'rgba(255,149,0,0.12)' : colors.secondaryBackground,
      }}
    >
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, color: colors.label }}>{announcement.text}</Text>
      {announcement.button && announcement.target !== 'none' ? (
        <Pressable
          onPress={() => {
            announcementEvent(announcement.id, 'click');
            follow(announcement);
          }}
          accessibilityRole="button"
          style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', backgroundColor: colors.accent }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onAccent }}>{announcement.button}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => dismissAnnouncement(announcement.id)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={{ padding: 4 }}>
        <Image source="sf:xmark" style={{ width: 12, height: 12 }} contentFit="contain" tintColor={colors.tertiaryLabel} />
      </Pressable>
    </View>
  );
}
