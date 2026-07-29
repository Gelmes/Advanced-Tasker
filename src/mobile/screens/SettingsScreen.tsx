// Sync settings — the mobile first-run experience (MOBILE.md). Server URL +
// token, stored in the Android keystore via expo-secure-store, with a
// connection test against the authenticated /projects route.

import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useStore } from '../../store/useStore';
import { font, radius } from '../../theme';
import { saveSyncConfig } from '../secrets';
import { usePalette } from '../theme';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [url, setUrl] = useState(useStore.getState().syncUrl);
  const [token, setToken] = useState(useStore.getState().syncToken);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      await saveSyncConfig(url, token);
      const projects = await useStore.getState().listServerProjects();
      setResult({ ok: true, text: `Connected — ${projects.length} project(s) on the server.` });
    } catch (e: any) {
      setResult({ ok: false, text: `Saved, but the connection test failed: ${e?.message ?? 'network error'}` });
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      color: palette.ink,
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: palette.appBg }]}>
      <View style={[styles.header, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={[styles.backText, { color: palette.accent }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: palette.ink }]}>Sync settings</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: palette.inkMid }]}>Server URL</Text>
        <TextInput
          style={inputStyle}
          value={url}
          onChangeText={setUrl}
          placeholder="https://your-server.example.app"
          placeholderTextColor={palette.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={[styles.label, { color: palette.inkMid }]}>Sync token</Text>
        <TextInput
          style={inputStyle}
          value={token}
          onChangeText={setToken}
          placeholder="token"
          placeholderTextColor={palette.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Pressable
          onPress={() => void save()}
          disabled={busy}
          style={[styles.saveBtn, { backgroundColor: palette.accent, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveText}>Save & test connection</Text>
          )}
        </Pressable>
        {result && (
          <Text
            style={[
              styles.result,
              { color: result.ok ? palette.success : palette.danger },
            ]}
          >
            {result.text}
          </Text>
        )}
        <Text style={[styles.hint, { color: palette.inkSoft }]}>
          The token is stored in the Android keystore on this device. Both values
          match what the desktop app uses under Sync.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingVertical: 4, paddingRight: 4 },
  backText: { fontSize: font.lg },
  title: { fontSize: font.lg, fontWeight: '600' },
  body: { padding: 16, gap: 8 },
  label: { fontSize: font.sm, fontWeight: '600', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: font.base,
  },
  saveBtn: {
    marginTop: 16,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  saveText: { color: '#ffffff', fontSize: font.base, fontWeight: '600' },
  result: { marginTop: 12, fontSize: font.md },
  hint: { marginTop: 16, fontSize: font.sm, lineHeight: 17 },
});
