// Long-press bottom sheet (MOBILE.md "Task details"): the touch home for the
// keyboard verbs — status, points, timer, bookmark, delete — plus the node's
// due date and effort at a glance. Actions dispatch the same store actions as
// the desktop keymap.
//
// Two ways to change a value (Marco's feedback): tapping the LABEL cycles it
// (fast, like the desktop keys), tapping the VALUE opens a picker list to jump
// straight to a choice.

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { findNode } from '../../model/tree';
import { elapsedSeconds, formatDuration, isRunning } from '../../model/time';
import { useStore } from '../../store/useStore';
import { font, radius } from '../../theme';
import { usePalette } from '../theme';

function ActionRow({
  label,
  value,
  onPress,
  onPressValue,
  color,
  valueColor,
  border,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  /** Separate tap target on the value side — opens a picker instead of cycling. */
  onPressValue?: () => void;
  color: string;
  valueColor: string;
  border: string;
}) {
  return (
    <View style={[styles.actionRow, { borderBottomColor: border }]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.actionLabelArea, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      </Pressable>
      {value != null && (
        <Pressable
          onPress={onPressValue ?? onPress}
          disabled={!onPressValue && !onPress}
          style={({ pressed }) => [styles.actionValueArea, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.actionValue, { color: valueColor }]}>{value}</Text>
        </Pressable>
      )}
    </View>
  );
}

function PickerRow({
  label,
  active,
  onPress,
  color,
  border,
  dotColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  color: string;
  border: string;
  dotColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        { borderBottomColor: border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.pickerLabelArea}>
        {dotColor ? <View style={[styles.pickerDot, { backgroundColor: dotColor }]} /> : null}
        <Text style={[styles.actionLabel, { color }]}>{label}</Text>
      </View>
      {active && <Text style={[styles.actionValue, { color }]}>✓</Text>}
    </Pressable>
  );
}

type Picker = 'status' | 'points' | null;

export function RowSheet({ nodeId, onClose }: { nodeId: string | null; onClose: () => void }) {
  const palette = usePalette();
  const project = useStore((s) => s.project);
  const [armDelete, setArmDelete] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);

  useEffect(() => {
    setArmDelete(false);
    setPicker(null);
  }, [nodeId]);

  const node = nodeId ? findNode(project.root.children, nodeId) : null;
  if (!nodeId) return null;

  const status = node?.status ? project.statuses.find((s) => s.id === node.status) : null;
  const running = node ? isRunning(node) : false;
  const elapsed = node ? elapsedSeconds(node, Date.now()) : 0;
  const store = useStore.getState();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {node && picker === 'status' ? (
          <>
            <Text style={[styles.pickerTitle, { color: palette.inkMid }]}>Set status</Text>
            <ScrollView style={styles.pickerList}>
              <PickerRow
                label="— note (no status)"
                active={!node.status}
                color={palette.ink}
                border={palette.border}
                onPress={() => {
                  store.setStatusFor(nodeId, null);
                  setPicker(null);
                }}
              />
              {project.statuses.map((s) => (
                <PickerRow
                  key={s.id}
                  label={s.label}
                  dotColor={s.color}
                  active={node.status === s.id}
                  color={palette.ink}
                  border={palette.border}
                  onPress={() => {
                    store.setStatusFor(nodeId, s.id);
                    setPicker(null);
                  }}
                />
              ))}
            </ScrollView>
          </>
        ) : node && picker === 'points' ? (
          <>
            <Text style={[styles.pickerTitle, { color: palette.inkMid }]}>Story points</Text>
            <ScrollView style={styles.pickerList}>
              <PickerRow
                label="— none"
                active={node.storyPoints == null}
                color={palette.ink}
                border={palette.border}
                onPress={() => {
                  store.setPointsFor(nodeId, null);
                  setPicker(null);
                }}
              />
              {project.pointScale.map((p) => (
                <PickerRow
                  key={p}
                  label={String(p)}
                  active={node.storyPoints === p}
                  color={palette.ink}
                  border={palette.border}
                  onPress={() => {
                    store.setPointsFor(nodeId, p);
                    setPicker(null);
                  }}
                />
              ))}
            </ScrollView>
          </>
        ) : node ? (
          <>
            <Text style={[styles.preview, { color: palette.inkMid }]} numberOfLines={2}>
              {node.content || '(empty)'}
            </Text>
            <ActionRow
              label="Status"
              value={status ? `● ${status.label}` : 'note — set one'}
              valueColor={status ? status.color : palette.inkSoft}
              color={palette.ink}
              border={palette.border}
              onPress={() => store.cycleStatusFor(nodeId)}
              onPressValue={() => setPicker('status')}
            />
            <ActionRow
              label="Story points"
              value={node.storyPoints != null ? String(node.storyPoints) : '—'}
              valueColor={palette.accentInk}
              color={palette.ink}
              border={palette.border}
              onPress={() => store.cyclePointsFor(nodeId)}
              onPressValue={() => setPicker('points')}
            />
            <ActionRow
              label={running ? 'Stop timer' : 'Start timer'}
              value={elapsed > 0 || running ? formatDuration(elapsed) : undefined}
              valueColor={running ? palette.success : palette.inkMid}
              color={running ? palette.success : palette.ink}
              border={palette.border}
              onPress={() => store.toggleTimerFor(nodeId)}
            />
            <ActionRow
              label={node.bookmarked ? '★ Bookmarked' : '☆ Bookmark'}
              color={node.bookmarked ? palette.warn : palette.ink}
              valueColor={palette.inkMid}
              border={palette.border}
              onPress={() => store.toggleBookmarkFor(nodeId)}
            />
            {node.dueDate ? (
              <ActionRow
                label="Due"
                value={node.dueDate}
                color={palette.ink}
                valueColor={palette.inkMid}
                border={palette.border}
              />
            ) : null}

            {/* Structural ops (MOBILE.md Phase 3) — the sheet stays open so
                repeated taps nudge the node into place. */}
            <Text style={[styles.sectionLabel, { color: palette.inkSoft }]}>Move</Text>
            <View style={styles.moveRow}>
              {(
                [
                  { key: 'outdent', glyph: '⇤', label: 'Outdent', op: () => store.outdentSelected() },
                  { key: 'up', glyph: '↑', label: 'Up', op: () => store.moveSelected(-1) },
                  { key: 'down', glyph: '↓', label: 'Down', op: () => store.moveSelected(1) },
                  { key: 'indent', glyph: '⇥', label: 'Indent', op: () => store.indentSelected() },
                ] as const
              ).map((btn) => (
                <Pressable
                  key={btn.key}
                  onPress={() => {
                    // All these ops act on the store's selection.
                    useStore.getState().select(nodeId);
                    btn.op();
                  }}
                  style={({ pressed }) => [
                    styles.moveBtn,
                    {
                      backgroundColor: pressed ? palette.hover : palette.surfaceAlt,
                      borderColor: palette.border,
                    },
                  ]}
                  accessibilityLabel={btn.label}
                >
                  <Text style={[styles.moveGlyph, { color: palette.ink }]}>{btn.glyph}</Text>
                  <Text style={[styles.moveLabel, { color: palette.inkSoft }]}>{btn.label}</Text>
                </Pressable>
              ))}
            </View>
            <ActionRow
              label="Add sub-task"
              color={palette.ink}
              valueColor={palette.inkMid}
              border={palette.border}
              onPress={() => {
                // New sibling below, then indent it under this node.
                const store2 = useStore.getState();
                store2.select(nodeId);
                store2.newSibling();
                store2.indentSelected();
                store2.setMode('selected');
                onClose();
              }}
            />
            <ActionRow
              label={armDelete ? 'Tap again to delete' : 'Delete'}
              color={palette.danger}
              valueColor={palette.danger}
              border={palette.border}
              onPress={() => {
                if (!armDelete) {
                  setArmDelete(true);
                  return;
                }
                store.select(nodeId);
                useStore.getState().deleteSelected();
                onClose();
              }}
            />
          </>
        ) : (
          <Text style={[styles.preview, { color: palette.inkSoft }]}>
            This item is gone (deleted or merged away).
          </Text>
        )}
        <Pressable
          onPress={() => (picker ? setPicker(null) : onClose())}
          style={[styles.closeBtn, { backgroundColor: palette.surfaceAlt }]}
        >
          <Text style={[styles.closeText, { color: palette.inkMid }]}>
            {picker ? '‹ Back' : 'Close'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  preview: { fontSize: font.md, marginBottom: 8 },
  pickerTitle: { fontSize: font.sm, fontWeight: '600', marginBottom: 4 },
  pickerList: { maxHeight: 320 },
  pickerLabelArea: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  pickerDot: { width: 12, height: 12, borderRadius: 6 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  actionLabelArea: { flex: 1, justifyContent: 'center', minHeight: 48 },
  actionValueArea: { justifyContent: 'center', minHeight: 48, paddingLeft: 12 },
  actionLabel: { fontSize: font.base, fontWeight: '500' },
  actionValue: { fontSize: font.base },
  sectionLabel: { fontSize: font.xs, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  moveRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  moveBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  moveGlyph: { fontSize: 17 },
  moveLabel: { fontSize: font.xs },
  closeBtn: {
    marginTop: 14,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: font.base, fontWeight: '600' },
});
