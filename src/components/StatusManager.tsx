import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StatusKind } from '../model/types';
import { useStore } from '../store/useStore';

// Configure the project's status set (SPEC.md §2, §6). Colors are edited as hex
// strings with a live swatch; each status has a kind (To-do / Active / Done) that
// drives the lifecycle analytics. Deleting a status demotes any tasks using it.

const KIND_CYCLE: StatusKind[] = ['todo', 'active', 'done'];
const KIND_LABEL: Record<StatusKind, string> = {
  todo: 'To-do',
  active: 'Active',
  done: 'Done',
};
const nextKind = (k: StatusKind): StatusKind =>
  KIND_CYCLE[(KIND_CYCLE.indexOf(k) + 1) % KIND_CYCLE.length];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function StatusManager({ visible, onClose }: Props) {
  const statuses = useStore((s) => s.project.statuses);
  const addStatus = useStore((s) => s.addStatus);
  const updateStatus = useStore((s) => s.updateStatus);
  const removeStatus = useStore((s) => s.removeStatus);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Statuses</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list}>
            {statuses.map((s) => (
              <View key={s.id} style={styles.statusRow}>
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
                <TextInput
                  style={[styles.field, styles.label]}
                  value={s.label}
                  onChangeText={(label) => updateStatus(s.id, { label })}
                  placeholder="Label"
                />
                <TextInput
                  style={[styles.field, styles.color]}
                  value={s.color}
                  onChangeText={(color) => updateStatus(s.id, { color })}
                  placeholder="#rrggbb"
                  autoCapitalize="none"
                />
                <Pressable
                  style={[styles.field, styles.kind]}
                  onPress={() => updateStatus(s.id, { kind: nextKind(s.kind) })}
                >
                  <Text style={styles.kindText}>{KIND_LABEL[s.kind]}</Text>
                </Pressable>
                <Pressable onPress={() => removeStatus(s.id)} hitSlop={6}>
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.add} onPress={addStatus}>
            <Text style={styles.addText}>+ Add status</Text>
          </Pressable>
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
    width: 460,
    maxWidth: '100%',
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  close: { fontSize: 16, color: '#6b7280' },
  list: { flexGrow: 0 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  field: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 13,
    outlineWidth: 0,
  } as any,
  label: { flex: 1 },
  color: { width: 96, fontVariant: ['tabular-nums'] },
  kind: { width: 72, alignItems: 'center', backgroundColor: '#f9fafb' },
  kindText: { fontSize: 12, color: '#374151' },
  delete: { fontSize: 12, color: '#b91c1c' },
  add: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#eef2ff',
  },
  addText: { fontSize: 13, color: '#3730a3' },
});
