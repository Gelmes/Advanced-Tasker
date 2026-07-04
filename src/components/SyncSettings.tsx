import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../store/useStore';
import { tokenIsEncrypted } from '../persistence/secretStore';

// Cross-device sync settings (SYNC.md). Server URL + shared token (token encrypted
// via the OS keychain in Electron, else localStorage), a manual "Sync now", and a
// pull-by-id picker to bootstrap a project onto this device. Background auto-sync
// runs separately (useAutoSync); this panel is the config + manual controls.

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
  const listServerProjects = useStore((s) => s.listServerProjects);
  const pullProject = useStore((s) => s.pullProject);
  const deleteProjectFromServer = useStore((s) => s.deleteProjectFromServer);

  const [url, setUrl] = useState(syncUrl);
  const [token, setToken] = useState(syncToken);
  const [list, setList] = useState<Array<{ id: string; name: string }> | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [listing, setListing] = useState(false);

  // Keep the fields in step with the store (e.g. the token arriving async on startup).
  useEffect(() => setUrl(syncUrl), [syncUrl]);
  useEffect(() => setToken(syncToken), [syncToken]);

  const save = () => setSyncConfig(url.trim(), token.trim());
  const saveAndSync = () => {
    save();
    void syncNow();
  };

  const browse = async () => {
    save();
    setListing(true);
    setListErr(null);
    try {
      setList(await listServerProjects());
    } catch (e: any) {
      setListErr(e?.message ?? 'Failed to list projects.');
      setList(null);
    } finally {
      setListing(false);
    }
  };

  const pull = (id: string) => {
    void pullProject(id);
    onClose();
  };

  const removeFromServer = async (p: { id: string; name: string }) => {
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        `Delete "${p.name}" from the sync server?\n\nLocal files are untouched. Devices that still have it will be told it was deleted and offered a local cleanup on their next sync.`,
      );
    if (!ok) return;
    if (await deleteProjectFromServer(p.id)) {
      setList((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    } else {
      setListErr('Server delete failed.');
    }
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
            Auto-sync runs in the background; use “Sync now” to force it.
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
          <Text style={styles.hint}>
            {tokenIsEncrypted
              ? '🔒 Token encrypted at rest via the OS keychain.'
              : 'Token stored in this browser (localStorage).'}
          </Text>

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

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>Bring a project onto this device</Text>
          <Pressable style={[styles.btn, styles.wide]} onPress={() => void browse()}>
            <Text style={styles.btnText}>{listing ? 'Loading…' : 'Browse server projects'}</Text>
          </Pressable>
          {listErr ? <Text style={styles.err}>{listErr}</Text> : null}
          {list ? (
            list.length ? (
              <ScrollView style={styles.list}>
                {list.map((p) => (
                  <View key={p.id} style={styles.listRow}>
                    <Text style={styles.listName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Pressable onPress={() => pull(p.id)} hitSlop={6}>
                      <Text style={styles.listPull}>Pull →</Text>
                    </Pressable>
                    <Pressable onPress={() => void removeFromServer(p)} hitSlop={6}>
                      <Text style={styles.listDelete}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.hint}>No projects on the server yet.</Text>
            )
          ) : null}
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
    maxHeight: '85%',
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
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
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
  wide: { alignSelf: 'flex-start' },
  btnText: { fontSize: 13, color: '#374151' },
  primary: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  primaryText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  status: { fontSize: 12, color: '#374151', marginTop: 12 },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginTop: 16, marginBottom: 4 },
  err: { fontSize: 12, color: '#b91c1c', marginTop: 6 },
  list: { marginTop: 8, maxHeight: 160 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#eef2ff',
    backgroundColor: '#f9fafb',
    marginBottom: 6,
  },
  listName: { fontSize: 13, color: '#374151', flexShrink: 1, flexGrow: 1 },
  listPull: { fontSize: 12, color: '#4f46e5', marginLeft: 8 },
  listDelete: { fontSize: 12, color: '#b91c1c', marginLeft: 10, paddingHorizontal: 2 },
});
