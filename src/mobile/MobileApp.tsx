// Phase 0 mobile shell (MOBILE.md). Proves the native entry boots in Expo Go
// with the shared theme tokens and none of the web-only modules. Screens
// (Projects, Outline, capture) replace the placeholder body in Phase 1.

import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { font, radius } from '../theme';
import { MobileThemeProvider, useTheme } from './theme';

function Shell() {
  const { name, palette } = useTheme();
  return (
    <SafeAreaView style={[styles.app, { backgroundColor: palette.appBg }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: palette.surface, borderBottomColor: palette.border },
        ]}
      >
        <Text style={[styles.title, { color: palette.ink }]}>Advanced Tasker</Text>
      </View>
      <View style={styles.body}>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surfaceAlt, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: palette.ink }]}>
            Mobile shell — Phase 0
          </Text>
          <Text style={[styles.cardText, { color: palette.inkMid }]}>
            Native entry is booting with the shared theme ({name} mode, following
            the system setting). Next up: the Projects list, live-synced from the
            server.
          </Text>
        </View>
      </View>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
    </SafeAreaView>
  );
}

export function MobileApp() {
  return (
    <MobileThemeProvider>
      <Shell />
    </MobileThemeProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: font.lg, fontWeight: '600' },
  body: { flex: 1, padding: 16, justifyContent: 'center' },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontSize: font.base, fontWeight: '600' },
  cardText: { fontSize: font.md, lineHeight: 19 },
});
