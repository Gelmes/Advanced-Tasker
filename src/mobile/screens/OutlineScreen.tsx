// The outline, touch-first (MOBILE.md v1 screens + Phase 2 interactions).
// Rendered as a FlatList over the flattened *visible* tree — flat virtualized
// rows scale better on phones than the desktop's recursive NodeRow.
//
// Interaction mapping of the desktop's modal model (SPEC.md §3) to touch:
//   tap row            → select (desktop: click / arrows)
//   tap selected row   → edit its text inline (desktop: Enter)
//   tap status dot     → cycle status (desktop: S)
//   tap timer chip / ▶ → start/stop timer (desktop: Space)
//   long-press         → bottom sheet with the remaining verbs (status, points,
//                        timer, bookmark, delete — desktop: keys/context menu)
//   FAB                → quick capture, appends top-level, rapid-fire entry
//
// The inline edit draft lives HERE (not in the row): Android doesn't blur a
// TextInput when another list row is tapped, so the parent must be able to
// commit-and-close an edit whenever focus conceptually moves.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StatusDef, TaskNode } from '../../model/types';
import { findNode } from '../../model/tree';
import { elapsedSeconds, formatDuration, isRunning } from '../../model/time';
import { useNow } from '../../hooks/useNow';
import { useStore } from '../../store/useStore';
import { font, radius } from '../../theme';
import { RowSheet } from '../components/RowSheet';
import { syncAndCache } from '../sync';
import { usePalette } from '../theme';

interface VisibleRow {
  node: TaskNode;
  depth: number;
  hasChildren: boolean;
}

function flattenVisible(nodes: TaskNode[], depth: number, out: VisibleRow[]): VisibleRow[] {
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    out.push({ node, depth, hasChildren });
    if (hasChildren && !node.collapsed) flattenVisible(node.children, depth + 1, out);
  }
  return out;
}

/** Append a captured line as a top-level node (keeps capture rapid-fire safe:
 * each call re-reads the store, so consecutive captures stack in order). */
function captureNode(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const store = useStore.getState();
  store.select(null);
  store.newSibling(); // appends at top level, selects the new node
  const id = useStore.getState().selectedId;
  if (id) useStore.getState().setNodeContent(id, trimmed);
  useStore.getState().setMode('selected');
}

const Row = memo(function Row({
  row,
  status,
  running,
  elapsed,
  selected,
  editing,
  draft,
  inputRef,
  onChangeDraft,
  onEndEdit,
  palette,
}: {
  row: VisibleRow;
  status: StatusDef | null;
  running: boolean;
  elapsed: number;
  selected: boolean;
  editing: boolean;
  draft: string;
  /** Set only on the row being edited, so the screen can restore focus after a
   *  toolbar op (indent/move keep you typing in the same node). */
  inputRef: React.RefObject<TextInput | null> | null;
  onChangeDraft: (text: string) => void;
  onEndEdit: () => void;
  palette: ReturnType<typeof usePalette>;
}) {
  const { node, depth, hasChildren } = row;
  const done = status?.kind === 'done';
  const store = useStore.getState();

  return (
    <View
      style={[
        styles.row,
        {
          paddingLeft: 8 + depth * 18,
          borderBottomColor: palette.border,
          backgroundColor: selected ? palette.accentSoft : 'transparent',
        },
      ]}
    >
      {hasChildren ? (
        <Pressable
          onPress={() => store.toggleCollapseFor(node.id)}
          hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
          style={styles.twisty}
        >
          <Text style={[styles.twistyText, { color: palette.inkSoft }]}>
            {node.collapsed ? '▸' : '▾'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.twisty} />
      )}
      <Pressable
        onPress={() => store.cycleStatusFor(node.id)}
        hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
      >
        <View
          style={[
            styles.dot,
            status
              ? { backgroundColor: status.color }
              : { borderWidth: 1.5, borderColor: palette.inkFaint },
          ]}
        />
      </Pressable>
      {editing ? (
        <TextInput
          ref={inputRef}
          style={[
            styles.content,
            styles.editInput,
            {
              color: palette.ink,
              backgroundColor: palette.surfaceAlt,
              borderColor: palette.accentBorder,
            },
          ]}
          value={draft}
          onChangeText={onChangeDraft}
          autoFocus
          multiline
          onBlur={onEndEdit}
        />
      ) : (
        <Text
          style={[
            styles.content,
            { color: done ? palette.inkSoft : palette.ink },
            done && styles.done,
          ]}
        >
          {node.content || ' '}
        </Text>
      )}
      {!editing && node.storyPoints != null && (
        <View style={[styles.chip, { backgroundColor: palette.accentSoft }]}>
          <Text style={[styles.chipText, { color: palette.accentInk }]}>{node.storyPoints}</Text>
        </View>
      )}
      {!editing &&
        (elapsed > 0 || running ? (
          <Pressable onPress={() => store.toggleTimerFor(node.id)} hitSlop={8}>
            <View
              style={[
                styles.chip,
                { backgroundColor: running ? palette.successSoft : palette.surfaceAlt },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: running ? palette.success : palette.inkMid },
                ]}
              >
                {running ? '⏸ ' : '▶ '}
                {formatDuration(elapsed)}
              </Text>
            </View>
          </Pressable>
        ) : (
          // No time yet: a quiet one-tap way to start the timer (Marco's
          // feedback — without this, untimed tasks only start via long-press).
          <Pressable
            onPress={() => store.toggleTimerFor(node.id)}
            hitSlop={8}
            style={styles.playBtn}
          >
            <Text style={[styles.playText, { color: palette.inkSoft }]}>▶</Text>
          </Pressable>
        ))}
    </View>
  );
});

export function OutlineScreen({
  onBack,
  initialCapture = false,
}: {
  onBack: () => void;
  initialCapture?: boolean;
}) {
  const palette = usePalette();
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedId);
  const syncing = useStore((s) => s.syncing);
  const syncStatus = useStore((s) => s.syncStatus);
  const now = useNow();

  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(initialCapture);
  const [captureText, setCaptureText] = useState('');
  const [keyboardPad, setKeyboardPad] = useState(0);
  const captureRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<VisibleRow>>(null);
  const editInputRef = useRef<TextInput | null>(null);
  // Tapping a toolbar button blurs the editor; without this guard the blur
  // handler would close edit mode before the structural op could run.
  const toolbarActionRef = useRef(false);

  // Lift = the full reported IME height. In theory the SafeAreaView's nav-bar
  // inset should be netted out, but in practice that lands the bar *under* the
  // keyboard's toolbar strip; the inset's worth of slack is what clears it. A
  // small gap is fine — being hidden is not. `insets.bottom` still matters for
  // the resting (keyboard-closed) case, hence the guard.
  const keyboardLift = keyboardPad > 0 ? keyboardPad : 0;

  const rows = useMemo(() => flattenVisible(project.root.children, 0, []), [project]);
  const statusById = useMemo(
    () => new Map(project.statuses.map((s) => [s.id, s])),
    [project.statuses],
  );

  // Keep the docked bar and the row being edited above the soft keyboard
  // (edge-to-edge Android draws the IME over the window instead of resizing it).
  //
  // Android reports the height of the keyboard proper, and many keyboards add a
  // toolbar strip above it (emoji / clipboard / translate) that the report can
  // miss or announce late — that strip was covering the capture box. So: adopt
  // the LARGEST height seen while the keyboard is up, and don't net out the
  // nav-bar inset (that slack is what clears the strip).
  useEffect(() => {
    const bump = (h: number) => setKeyboardPad((cur) => Math.max(cur, h));
    const show = Keyboard.addListener('keyboardDidShow', (e) => bump(e.endCoordinates.height));
    const frame = Keyboard.addListener('keyboardDidChangeFrame', (e) =>
      bump(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardPad(0));
    return () => {
      show.remove();
      frame.remove();
      hide.remove();
    };
  }, []);

  /** Write the in-flight draft to the store, without leaving edit mode. */
  const commitDraft = () => {
    const cur = editing;
    if (!cur) return;
    const store = useStore.getState();
    const node = findNode(store.project.root.children, cur.id);
    if (node && cur.draft !== node.content) store.setNodeContent(cur.id, cur.draft);
  };

  /** Commit the in-flight inline edit (if any) and leave edit mode. */
  const commitEdit = () => {
    if (toolbarActionRef.current) return; // a structural op is mid-flight
    commitDraft();
    setEditing(null);
  };

  /**
   * Run a structural op from the editing toolbar: save what's typed, point the
   * store's selection at the edited node (the ops all act on the selection),
   * apply, then keep editing — the same node for indent/outdent/move, or the
   * newly created one for ⏎. That's the desktop's Tab/Alt+↑↓/Enter flow, made
   * tappable (MOBILE.md Phase 3).
   */
  const runStructural = (op: () => void) => {
    const cur = editing;
    if (!cur) return;
    toolbarActionRef.current = true;
    commitDraft();
    const store = useStore.getState();
    store.select(cur.id);
    op();
    const after = useStore.getState();
    const nextId = after.selectedId ?? cur.id;
    const node = findNode(after.project.root.children, nextId);
    if (node) {
      setEditing({ id: node.id, draft: node.content });
      // Same node → the existing input needs re-focusing (a new node's input
      // mounts with autoFocus and takes focus on its own).
      if (node.id === cur.id) requestAnimationFrame(() => editInputRef.current?.focus());
    } else {
      setEditing(null);
    }
    setTimeout(() => {
      toolbarActionRef.current = false;
    }, 60);
  };

  const startEdit = (node: TaskNode) => {
    setEditing({ id: node.id, draft: node.content });
    const index = rows.findIndex((r) => r.node.id === node.id);
    if (index >= 0) {
      // Bring the row into the visible band above the keyboard.
      try {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.15, animated: true });
      } catch {
        // scrollToIndex can throw for unmeasured rows; the keyboard pad still helps
      }
    }
  };

  const submitCapture = () => {
    captureNode(captureText);
    setCaptureText('');
    captureRef.current?.focus(); // rapid-fire: keep the keyboard up
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.appBg }]}>
      <View style={[styles.header, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
        <Pressable
          onPress={() => {
            commitEdit();
            onBack();
          }}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Text style={[styles.backText, { color: palette.accent }]}>‹</Text>
        </Pressable>
        <View style={styles.headerMain}>
          <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
            {project.name || 'Untitled'}
          </Text>
          {syncStatus ? (
            <Text style={[styles.syncStatus, { color: palette.inkSoft }]} numberOfLines={1}>
              {syncStatus}
            </Text>
          ) : null}
        </View>
        {syncing ? (
          <ActivityIndicator color={palette.accent} />
        ) : (
          <Pressable onPress={() => void syncAndCache()} hitSlop={12} style={styles.syncBtn}>
            <Text style={[styles.syncIcon, { color: palette.inkMid }]}>↻</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.node.id}
        extraData={[selectedId, editing, now, keyboardPad]}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              if (editing?.id === item.node.id) return;
              if (editing) commitEdit(); // switching rows ends the previous edit
              if (selectedId === item.node.id) startEdit(item.node);
              else useStore.getState().select(item.node.id);
            }}
            onLongPress={() => {
              commitEdit();
              setSheetId(item.node.id);
            }}
            delayLongPress={350}
          >
            <Row
              row={item}
              status={item.node.status ? (statusById.get(item.node.status) ?? null) : null}
              running={isRunning(item.node)}
              elapsed={elapsedSeconds(item.node, now)}
              selected={selectedId === item.node.id}
              editing={editing?.id === item.node.id}
              draft={editing?.id === item.node.id ? editing.draft : ''}
              inputRef={editing?.id === item.node.id ? editInputRef : null}
              onChangeDraft={(text) =>
                setEditing((cur) => (cur ? { ...cur, draft: text } : cur))
              }
              onEndEdit={commitEdit}
              palette={palette}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: palette.inkSoft }]}>
            This project is empty — use + to capture your first task.
          </Text>
        }
        contentContainerStyle={[styles.list, { paddingBottom: 96 + keyboardLift }]}
        keyboardShouldPersistTaps="handled"
      />

      {editing ? (
        // The soft keyboard can't express Tab / Alt+↑↓ / Enter, so the desktop's
        // structural keys get a toolbar docked above it (MOBILE.md Phase 3).
        <View
          style={[
            styles.toolbar,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              marginBottom: keyboardLift,
            },
          ]}
        >
          {(
            [
              { key: 'outdent', glyph: '⇤', hint: 'Outdent', op: () => useStore.getState().outdentSelected() },
              { key: 'indent', glyph: '⇥', hint: 'Indent', op: () => useStore.getState().indentSelected() },
              { key: 'up', glyph: '↑', hint: 'Move up', op: () => useStore.getState().moveSelected(-1) },
              { key: 'down', glyph: '↓', hint: 'Move down', op: () => useStore.getState().moveSelected(1) },
              { key: 'new', glyph: '⏎', hint: 'New task', op: () => useStore.getState().newSibling() },
            ] as const
          ).map((btn) => (
            <Pressable
              key={btn.key}
              onPress={() => runStructural(btn.op)}
              style={({ pressed }) => [
                styles.toolBtn,
                { backgroundColor: pressed ? palette.hover : palette.surfaceAlt },
              ]}
              accessibilityLabel={btn.hint}
            >
              <Text style={[styles.toolGlyph, { color: palette.ink }]}>{btn.glyph}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              commitEdit();
            }}
            style={({ pressed }) => [
              styles.toolDone,
              { backgroundColor: palette.accent, opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityLabel="Done editing"
          >
            <Text style={styles.toolDoneText}>Done</Text>
          </Pressable>
        </View>
      ) : captureOpen ? (
        <View
          style={[
            styles.captureBar,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              marginBottom: keyboardLift,
            },
          ]}
        >
          <TextInput
            ref={captureRef}
            style={[
              styles.captureInput,
              {
                backgroundColor: palette.surfaceAlt,
                borderColor: palette.border,
                color: palette.ink,
              },
            ]}
            value={captureText}
            onChangeText={setCaptureText}
            placeholder="Capture a task…"
            placeholderTextColor={palette.inkFaint}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={submitCapture}
            submitBehavior="submit"
          />
          <Pressable
            onPress={submitCapture}
            style={[styles.captureSend, { backgroundColor: palette.accent }]}
          >
            <Text style={styles.captureSendText}>↑</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setCaptureOpen(false);
              setCaptureText('');
            }}
            hitSlop={8}
            style={styles.captureClose}
          >
            <Text style={[styles.captureCloseText, { color: palette.inkSoft }]}>✕</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            commitEdit();
            setCaptureOpen(true);
          }}
          style={[styles.fab, { backgroundColor: palette.accent }]}
        >
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}

      <RowSheet nodeId={sheetId} onClose={() => setSheetId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 26, marginTop: -2 },
  headerMain: { flex: 1, gap: 1 },
  title: { fontSize: font.lg, fontWeight: '600' },
  syncStatus: { fontSize: font.xs },
  syncBtn: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  syncIcon: { fontSize: 20 },
  list: { paddingBottom: 96 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
    paddingVertical: 10,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  twisty: { width: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  twistyText: { fontSize: font.md },
  dot: { width: 14, height: 14, borderRadius: 7 },
  content: { flex: 1, fontSize: font.base, lineHeight: 20 },
  editInput: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  done: { textDecorationLine: 'line-through' },
  chip: {
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: { fontSize: font.sm, fontVariant: ['tabular-nums'] },
  playBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: { fontSize: 17, marginLeft: 2 },
  empty: { padding: 24, fontSize: font.base },
  captureBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toolBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolGlyph: { fontSize: 18 },
  toolDone: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolDoneText: { color: '#ffffff', fontSize: font.base, fontWeight: '600' },
  captureInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: font.base,
  },
  captureSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureSendText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  captureClose: { width: 32, alignItems: 'center' },
  captureCloseText: { fontSize: 18 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabText: { color: '#ffffff', fontSize: 24, fontWeight: '600' },
});
