import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';
import { color, font, radius } from '../theme';
import { ChartsModal } from './charts/ChartsModal';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { ShortcutsHelp } from './ShortcutsHelp';
import { StatusManager } from './StatusManager';
import { SyncSettings } from './SyncSettings';

// Top toolbar: a File dropdown for the rarely-used file actions (autosave makes
// Save/Save As occasional), the frequent tools as ghost buttons grouped by
// separators, and a save/sync status pill on the right.

function Button({
  label,
  onPress,
  disabled,
  emphasis,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Slightly heavier text (the File menu button). */
  emphasis?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }: any) => [
        styles.btn,
        hovered && !disabled && styles.btnHover,
        pressed && !disabled && styles.btnPressed,
        disabled && styles.btnDisabled,
      ]}
    >
      <Text
        style={[styles.btnText, emphasis && styles.btnTextEmphasis, disabled && styles.btnTextDisabled]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Thin vertical rule between toolbar groups. */
function Sep() {
  return <View style={styles.sep} />;
}

/** Save/sync state as a pill with a colored dot — read at a glance. */
function StatusPill({
  tone,
  label,
}: {
  tone: 'ok' | 'warn' | 'error' | 'busy' | 'muted';
  label: string;
}) {
  const dot = {
    ok: color.success,
    warn: color.warn,
    error: color.danger,
    busy: color.info,
    muted: color.inkSoft,
  }[tone];
  return (
    <View style={[styles.pill, tone === 'error' && styles.pillError]}>
      <View style={[styles.pillDot, { backgroundColor: dot }]} />
      <Text
        style={[styles.pillText, tone === 'error' && styles.pillTextError]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
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

  // Theme cycles system → light → dark (icon shows the current mode).
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const cycleTheme = () =>
    setThemeMode(themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system');

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

  // Split menu (same anchoring pattern).
  const split = useStore((s) => s.split);
  const splitView = useStore((s) => s.splitView);
  const closeSplit = useStore((s) => s.closeSplit);
  const [splitMenuAt, setSplitMenuAt] = useState<{ x: number; y: number } | null>(null);
  const splitBtnRef = useRef<View>(null);
  const openSplitMenu = () => {
    const node: any = splitBtnRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, _w: number, h: number) =>
        setSplitMenuAt({ x, y: y + h + 4 }),
      );
    } else {
      setSplitMenuAt({ x: 200, y: 44 });
    }
  };
  const splitMenuItems: MenuEntry[] = [
    { label: 'Split right', onPress: () => void splitView('row') },
    { label: 'Split down', onPress: () => void splitView('column') },
    ...(split
      ? ([
          'divider',
          { label: 'Close split', onPress: () => closeSplit() },
        ] as MenuEntry[])
      : []),
  ];

  const fileMenuItems: MenuEntry[] = [
    { label: 'New project', onPress: () => void newProjectInFolder() },
    'divider',
    { label: 'Open folder…', onPress: () => void openFolder() },
    { label: 'Open file…', onPress: () => void openProject() },
    'divider',
    { label: 'Save', onPress: () => void saveProject() },
    { label: 'Save as…', onPress: () => void saveProjectAs() },
  ];

  // An unbound project exists only in memory — say so loudly (a quiet "No file"
  // read like a fact, not a warning that closing the app loses the project).
  const status: { tone: 'ok' | 'warn' | 'error' | 'busy' | 'muted'; label: string } = syncing
    ? { tone: 'busy', label: 'Syncing…' }
    : saving
      ? { tone: 'busy', label: 'Saving…' }
      : error
        ? { tone: 'error', label: error }
        : !fileName
          ? { tone: 'warn', label: 'In memory only — File ▾ › Save as… to keep' }
          : dirty
            ? { tone: 'warn', label: 'Unsaved' }
            : { tone: 'ok', label: 'Saved' };

  return (
    <View style={styles.bar}>
      <View style={styles.group}>
        <Button label="☰" onPress={toggleSidebar} />
        <View ref={fileBtnRef} collapsable={false}>
          <Button label="File ▾" onPress={openFileMenu} emphasis />
        </View>
        <Sep />
        <Button label="↶ Undo" onPress={undo} disabled={!canUndo} />
        <Button label="↷ Redo" onPress={redo} disabled={!canRedo} />
        <Sep />
        <Button label="Statuses" onPress={() => setStatusManagerOpen(true)} />
        <Button label="📊 Charts" onPress={() => setChartsOpen(true)} />
        <Button label="Details" onPress={toggleDetails} />
        <View ref={splitBtnRef} collapsable={false}>
          <Button label="◫ Split ▾" onPress={openSplitMenu} />
        </View>
        <Sep />
        <Button label="⇅ Sync" onPress={() => setSyncOpen(true)} />
        <Button label="⌨ Shortcuts" onPress={() => setHelpOpen(true)} />
        <Button
          label={themeMode === 'system' ? '◐' : themeMode === 'dark' ? '☾' : '☀'}
          onPress={cycleTheme}
        />
      </View>
      <StatusPill tone={status.tone} label={status.label} />

      <ContextMenu at={fileMenuAt} items={fileMenuItems} onClose={() => setFileMenuAt(null)} />
      <ContextMenu at={splitMenuAt} items={splitMenuItems} onClose={() => setSplitMenuAt(null)} />
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    backgroundColor: color.surface,
    gap: 12,
  },
  group: { flexDirection: 'row', gap: 2, flexWrap: 'wrap', alignItems: 'center' },
  sep: {
    width: 1,
    height: 18,
    backgroundColor: color.border,
    marginHorizontal: 6,
  },
  btn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  btnHover: { backgroundColor: color.hover },
  btnPressed: { backgroundColor: color.accentSoft },
  btnDisabled: { opacity: 0.35 },
  btnText: { fontSize: font.md, color: color.inkMid },
  btnTextEmphasis: { fontWeight: '600', color: color.ink },
  btnTextDisabled: { color: color.inkSoft },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: color.surfaceAlt,
    borderWidth: 1,
    borderColor: color.border,
    flexShrink: 1,
  },
  pillError: { backgroundColor: color.dangerSoft, borderColor: color.border },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: font.sm, color: color.inkMid, flexShrink: 1 },
  pillTextError: { color: color.danger },
});
