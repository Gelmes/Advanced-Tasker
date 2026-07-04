import { type CSSProperties } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StatusKind } from '../model/types';
import { useStore } from '../store/useStore';
import { color, font, radius, shadow } from '../theme';

// Configure the project's status set (SPEC.md §2, §6). On web the color is edited
// with a native picker and the kind with a dropdown; rows can be reordered (which
// also sets the S-key cycle order). Each status has a kind (To-do / Active / Done)
// that drives the lifecycle analytics. Deleting a status demotes tasks using it.

const KIND_CYCLE: StatusKind[] = ['todo', 'active', 'done'];
const KIND_LABEL: Record<StatusKind, string> = {
  todo: 'To-do',
  active: 'Active',
  done: 'Done',
};
const nextKind = (k: StatusKind): StatusKind =>
  KIND_CYCLE[(KIND_CYCLE.indexOf(k) + 1) % KIND_CYCLE.length];

const isWeb = Platform.OS === 'web';
const colorInputStyle: CSSProperties = {
  width: 30,
  height: 24,
  border: 'none',
  background: 'none',
  padding: 0,
  cursor: 'pointer',
};
const selectStyle: CSSProperties = {
  fontSize: 13,
  padding: '5px 6px',
  borderRadius: 6,
  border: '1px solid ' + color.borderStrong,
  color: color.inkMid,
  background: color.surface,
  cursor: 'pointer',
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function StatusManager({ visible, onClose }: Props) {
  const statuses = useStore((s) => s.project.statuses);
  const addStatus = useStore((s) => s.addStatus);
  const updateStatus = useStore((s) => s.updateStatus);
  const removeStatus = useStore((s) => s.removeStatus);
  const moveStatus = useStore((s) => s.moveStatus);

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
          <Text style={styles.subtitle}>Order sets the cycle order (S key). Kind drives analytics.</Text>

          <ScrollView style={styles.list}>
            {statuses.map((s, i) => (
              <View key={s.id} style={styles.statusRow}>
                <View style={styles.reorder}>
                  <Pressable onPress={() => moveStatus(s.id, -1)} disabled={i === 0} hitSlop={3}>
                    <Text style={[styles.arrow, i === 0 && styles.arrowOff]}>▲</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => moveStatus(s.id, 1)}
                    disabled={i === statuses.length - 1}
                    hitSlop={3}
                  >
                    <Text style={[styles.arrow, i === statuses.length - 1 && styles.arrowOff]}>▼</Text>
                  </Pressable>
                </View>

                {isWeb ? (
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => updateStatus(s.id, { color: e.target.value })}
                    style={colorInputStyle}
                    title="Pick a color"
                  />
                ) : (
                  <View style={[styles.swatch, { backgroundColor: s.color }]} />
                )}

                <TextInput
                  style={[styles.field, styles.label]}
                  value={s.label}
                  onChangeText={(label) => updateStatus(s.id, { label })}
                  placeholder="Label"
                />

                {isWeb ? (
                  <select
                    value={s.kind}
                    onChange={(e) => updateStatus(s.id, { kind: e.target.value as StatusKind })}
                    style={selectStyle}
                  >
                    <option value="todo">To-do</option>
                    <option value="active">Active</option>
                    <option value="done">Done</option>
                  </select>
                ) : (
                  <Pressable
                    style={[styles.field, styles.kind]}
                    onPress={() => updateStatus(s.id, { kind: nextKind(s.kind) })}
                  >
                    <Text style={styles.kindText}>{KIND_LABEL[s.kind]}</Text>
                  </Pressable>
                )}

                <Pressable onPress={() => removeStatus(s.id)} hitSlop={6}>
                  <Text style={styles.delete}>✕</Text>
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
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: 480,
    maxWidth: '100%',
    maxHeight: '80%',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    boxShadow: shadow.lg,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: font.lg, fontWeight: '600', color: color.ink },
  close: { fontSize: font.lg, color: color.inkSoft },
  subtitle: { fontSize: font.sm, color: color.inkSoft, marginTop: 2, marginBottom: 10 },
  list: { flexGrow: 0 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  reorder: { width: 16, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 9, color: color.inkSoft, lineHeight: 11 },
  arrowOff: { color: color.border },
  swatch: { width: 18, height: 18, borderRadius: 9 },
  field: {
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 13,
    outlineWidth: 0,
  } as any,
  label: { flex: 1 },
  kind: { width: 72, alignItems: 'center', backgroundColor: color.hover },
  kindText: { fontSize: font.sm, color: color.inkMid },
  delete: { fontSize: font.md, color: color.danger, paddingHorizontal: 2 },
  add: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: color.accentSoft,
  },
  addText: { fontSize: font.md, color: color.accentInk },
});
