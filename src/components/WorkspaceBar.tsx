import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';
import { ChartsModal } from './charts/ChartsModal';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { ShortcutsHelp } from './ShortcutsHelp';
import { StatusManager } from './StatusManager';
import { SyncSettings } from './SyncSettings';

// Top toolbar: a File dropdown for the rarely-used file actions (autosave makes
// Save/Save As occasional), the frequent tools as buttons, and save status.

function Button({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        pressed && styles.btnPressed,
        disabled && styles.btnDisabled,
      ]}
    >
      <Text style={[styles.btnText, disabled && styles.btnTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function WorkspaceBar() {
  const fileName = useStore((s) => s.fileName);
  const dirty = useStore((s) => s.dirty);
  const saving = useStore((s) => s.saving);
  const error = useStore((s) => s.error);

  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const openFolder = useStore((s) => s.openFolder);
  const newProjectInFolder = useStore((s) => s.newProjectInFolder);
  const openProject = useStore((s) => s.openProject);
  const saveProject = useStore((s) => s.saveProject);
  const saveProjectAs = useStore((s) => s.saveProjectAs);
  const helpOpen = useStore((s) => s.helpOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const toggleDetails = useStore((s) => s.toggleDetails);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const syncing = useStore((s) => s.syncing);

  // File menu: anchored right under the File button via measureInWindow.
  const [fileMenuAt, setFileMenuAt] = useState<{ x: number; y: number } | null>(null);
  const fileBtnRef = useRef<View>(null);
  const openFileMenu = () => {
    const node: any = fileBtnRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, _w: number, h: number) =>
        setFileMenuAt({ x, y: y + h + 4 }),
      );
    } else {
      setFileMenuAt({ x: 48, y: 44 }); // sane fallback under the toolbar
    }
  };

  const fileMenuItems: MenuEntry[] = [
    { label: 'New project', onPress: () => void newProjectInFolder() },
    'divider',
    { label: 'Open folder…', onPress: () => void openFolder() },
    { label: 'Open file…', onPress: () => void openProject() },
    'divider',
    { label: 'Save', onPress: () => void saveProject() },
    { label: 'Save as…', onPress: () => void saveProjectAs() },
  ];

  const status = saving
    ? 'Saving…'
    : error
      ? error
      : dirty
        ? '• Unsaved'
        : fileName
          ? 'Saved'
          : 'No file';

  return (
    <View style={styles.bar}>
      <View style={styles.group}>
        <Button label="☰" onPress={toggleSidebar} />
        <View ref={fileBtnRef} collapsable={false}>
          <Button label="File ▾" onPress={openFileMenu} />
        </View>
        <Button label="↶ Undo" onPress={undo} disabled={!canUndo} />
        <Button label="↷ Redo" onPress={redo} disabled={!canRedo} />
        <Button label="Statuses" onPress={() => setStatusManagerOpen(true)} />
        <Button label="📊 Charts" onPress={() => setChartsOpen(true)} />
        <Button label="Details" onPress={toggleDetails} />
        <Button label={syncing ? '⇅ Syncing…' : '⇅ Sync'} onPress={() => setSyncOpen(true)} />
        <Button label="⌨ Shortcuts" onPress={() => setHelpOpen(true)} />
      </View>
      <Text style={[styles.status, error && styles.statusError]} numberOfLines={1}>
        {status}
      </Text>

      <ContextMenu at={fileMenuAt} items={fileMenuItems} onClose={() => setFileMenuAt(null)} />
      <StatusManager visible={statusManagerOpen} onClose={() => setStatusManagerOpen(false)} />
      <ChartsModal visible={chartsOpen} onClose={() => setChartsOpen(false)} />
      <SyncSettings visible={syncOpen} onClose={() => setSyncOpen(false)} />
      <ShortcutsHelp visible={helpOpen} onClose={() => setHelpOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    gap: 12,
  },
  group: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  btnPressed: { backgroundColor: '#eef2ff' },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 13, color: '#374151' },
  btnTextDisabled: { color: '#9ca3af' },
  status: { fontSize: 12, color: '#6b7280', flexShrink: 1 },
  statusError: { color: '#b91c1c' },
});
