import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../store/useStore';

// Cross-device sync settings (SYNC.md). Holds the server URL + shared token
// (persisted to localStorage) and a "Sync now" action that pushes the current
// project to the server, which merges it with its copy and returns the result.

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SyncSettings({ visible, onClose }: Props) {
  const syncUrl = useStore((s) => s.syncUrl);
  const syncToken = useStore((s) => s.syncToken);
  const syncing = useStore((s) => s.syncing);
  const syncStatus = useStore((s) => s.syncStatus);
  const projectId = useStore((s) => s.project.id);
  const setSyncConfig = useStore((s) => s.setSyncConfig);
  const syncNow = useStore((s) => s.syncNow);

  const [url, setUrl] = useState(syncUrl);
  const [token, setToken] = useState(syncToken);

  const save = () => setSyncConfig(url.trim(), token.trim());
  const saveAndSync = () => {
    save();
    void syncNow();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Sync</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            Push this project to your server and merge it with your other devices.
          </Text>

          <Text style={styles.fieldLabel}>Server URL</Text>
          <TextInput
            style={styles.field}
            value={url}
            onChangeText={setUrl}
            onBlur={save}
            placeholder="https://your-app.up.railway.app"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>Token</Text>
          <TextInput
            style={styles.field}
            value={token}
            onChangeText={setToken}
            onBlur={save}
            placeholder="shared secret"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.meta}>Project id: {projectId}</Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.primary, syncing && styles.disabled]}
              onPress={saveAndSync}
              disabled={syncing}
            >
              <Text style={styles.primaryText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={save}>
              <Text style={styles.btnText}>Save</Text>
            </Pressable>
          </View>

          {syncStatus ? <Text style={styles.status}>{syncStatus}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000055',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: 440,
    maxWidth: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  close: { fontSize: 16, color: '#6b7280' },
  subtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2, marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4, marginTop: 8 },
  field: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 13,
    outlineWidth: 0,
  } as any,
  meta: { fontSize: 11, color: '#9ca3af', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  btnText: { fontSize: 13, color: '#374151' },
  primary: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  primaryText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  status: { fontSize: 12, color: '#374151', marginTop: 12 },
});
