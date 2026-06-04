import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';

// Reference of all key bindings (mirrors SPEC.md §3 + the global save key).

interface Section {
  title: string;
  rows: [string, string][];
}

const VIM_SECTION: Section = {
  title: 'Vim navigation (when on)',
  rows: [
    ['j / k', 'Down / up'],
    ['Alt+j / Alt+k', 'Move node down / up among siblings'],
    ['h / l', 'Collapse / expand'],
    ['g g / G', 'Jump to top / bottom'],
    ['Ctrl-d / Ctrl-u', 'Half-page down / up'],
    ['i / a', 'Edit the row (insert / append)'],
    ['o', 'New row below'],
    ['Shift+I', 'Toggle details (since i = insert)'],
  ],
};

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
      ['I', 'Toggle the details panel'],
      ['Ctrl/Cmd+C / X', 'Copy / cut node (with its children)'],
      ['Ctrl/Cmd+V', 'Paste as a sibling below (Tab to nest)'],
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
      ['Ctrl/Cmd+Z', 'Undo'],
      ['Ctrl/Cmd+Shift+Z / Ctrl+Y', 'Redo'],
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
  const vimNav = useStore((s) => s.vimNav);
  const setVimNav = useStore((s) => s.setVimNav);
  const sections = vimNav ? [VIM_SECTION, ...SECTIONS] : SECTIONS;

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

          <Pressable style={styles.toggle} onPress={() => setVimNav(!vimNav)}>
            <View style={[styles.checkbox, vimNav && styles.checkboxOn]}>
              {vimNav && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View>
              <Text style={styles.toggleLabel}>Vim navigation</Text>
              <Text style={styles.toggleHint}>hjkl, gg/G, Ctrl-d/u, i/a/o</Text>
            </View>
          </Pressable>

          <ScrollView style={styles.body}>
            {sections.map((section) => (
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
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#f5f7ff',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  checkmark: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: '#111827' },
  toggleHint: { fontSize: 11, color: '#9ca3af' },
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
