import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Reference of all key bindings (mirrors SPEC.md §3 + the global save key).

interface Section {
  title: string;
  rows: [string, string][];
}

const SECTIONS: Section[] = [
  {
    title: 'Navigation (row selected)',
    rows: [
      ['↑ / ↓', 'Move selection'],
      ['← / →', 'Collapse / expand subtree'],
      ['Enter', 'New sibling below, start editing'],
      ['Tab / Shift+Tab', 'Indent / outdent'],
      ['Alt+↑ / Alt+↓', 'Move node among siblings'],
      ['Space', 'Start / stop timer'],
      ['S / Shift+S', 'Cycle status fwd / back (promotes note → task)'],
      ['P / Shift+P', 'Cycle story points fwd / back'],
      ['E / F2', 'Edit the selected row'],
      ['Delete / Backspace', 'Delete node'],
    ],
  },
  {
    title: 'Editing (caret in text)',
    rows: [
      ['Enter', 'Commit + new sibling below'],
      ['Shift+Enter', 'Newline within the node'],
      ['Esc', 'Stop editing'],
      ['Backspace (empty)', 'Delete node, select previous'],
    ],
  },
  {
    title: 'Formatting (any mode)',
    rows: [
      ['Ctrl/Cmd+B', 'Toggle **bold** on the node'],
      ['Ctrl/Cmd+I', 'Toggle *italic* on the node'],
      ['Ctrl/Cmd+E', 'Toggle `code` on the node'],
    ],
  },
  {
    title: 'Files & mouse',
    rows: [
      ['Ctrl/Cmd+S', 'Save'],
      ['Click row', 'Select (click again to edit)'],
      ['Click dot / pts / timer', 'Cycle status / points / timer'],
      ['Drag the ⠿ grip', 'Reorder: drop before / inside / after'],
    ],
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Keyboard shortcuts</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body}>
            {SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.rows.map(([keys, desc]) => (
                  <View key={keys} style={styles.row}>
                    <Text style={styles.keys}>{keys}</Text>
                    <Text style={styles.desc}>{desc}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
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
    width: 480,
    maxWidth: '100%',
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '600', color: '#111827' },
  close: { fontSize: 16, color: '#6b7280' },
  body: { flexGrow: 0 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', paddingVertical: 3, gap: 12 },
  keys: {
    width: 170,
    fontSize: 13,
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  desc: { flex: 1, fontSize: 13, color: '#374151' },
});
