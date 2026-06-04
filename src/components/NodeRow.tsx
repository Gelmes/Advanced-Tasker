import { Fragment, useEffect, useMemo, useRef } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import { useDrag } from './DragContext';
import { InlineMarkdown } from '../markdown/InlineMarkdown';
import { DONE_STATUS_ID } from '../model/defaults';
import { completion, computeRollup } from '../model/rollups';
import { elapsedSeconds, formatDuration, isRunning } from '../model/time';
import type { StatusDef, TaskNode } from '../model/types';
import { useStore } from '../store/useStore';

const INDENT_PX = 22;

function statusFor(node: TaskNode, statuses: StatusDef[]): StatusDef | undefined {
  return node.status ? statuses.find((s) => s.id === node.status) : undefined;
}

interface Props {
  node: TaskNode;
  depth: number;
  statuses: StatusDef[];
  /** Wall-clock ms, supplied once from the top so timers tick in sync. */
  nowMs: number;
}

/**
 * One outline row, recursive over its children. The twisty, status dot, content,
 * timer, and points chip are independent click targets (SPEC.md §3–4). Parent
 * rows also show a live roll-up of their subtree (time / points / completion %).
 */
export function NodeRow({ node, depth, statuses, nowMs }: Props) {
  const selectedId = useStore((s) => s.selectedId);
  const mode = useStore((s) => s.mode);
  const select = useStore((s) => s.select);
  const editSelected = useStore((s) => s.editSelected);
  const setMode = useStore((s) => s.setMode);
  const setNodeContent = useStore((s) => s.setNodeContent);
  const newSibling = useStore((s) => s.newSibling);
  const backspaceEmpty = useStore((s) => s.backspaceEmpty);
  const toggleCollapseFor = useStore((s) => s.toggleCollapseFor);
  const cycleStatusFor = useStore((s) => s.cycleStatusFor);
  const cyclePointsFor = useStore((s) => s.cyclePointsFor);
  const toggleTimerFor = useStore((s) => s.toggleTimerFor);

  const { register, beginDrag, updateDrag, endDrag, dragId, indicator } = useDrag();
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => beginDrag(node.id),
        onPanResponderMove: (_e, g) => updateDrag(g.moveY),
        onPanResponderRelease: () => endDrag(),
        onPanResponderTerminate: () => endDrag(),
      }),
    [node.id, beginDrag, updateDrag, endDrag],
  );

  const status = statusFor(node, statuses);
  const isSelected = selectedId === node.id;
  const isEditing = isSelected && mode === 'editing';
  const hasChildren = node.children.length > 0;
  const running = isRunning(node);
  const ownSeconds = elapsedSeconds(node, nowMs);
  const isDragging = dragId === node.id;
  const dropHere = indicator?.targetId === node.id ? indicator.where : null;

  const rollup = hasChildren
    ? computeRollup(node, DONE_STATUS_ID, nowMs)
    : null;
  const pct = rollup ? completion(rollup) : null;

  const inputRef = useRef<TextInputType>(null);
  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const onContentPress = () => {
    if (isSelected) editSelected();
    else select(node.id);
  };

  const onKeyPress = (e: any) => {
    const key = e?.nativeEvent?.key;
    if (key === 'Enter' && !e.nativeEvent.shiftKey) {
      e.preventDefault?.();
      newSibling();
    } else if (key === 'Escape') {
      e.preventDefault?.();
      setMode('selected');
      inputRef.current?.blur();
    } else if (key === 'Backspace' && node.content.length === 0) {
      e.preventDefault?.();
      backspaceEmpty();
    }
  };

  return (
    <Fragment>
      <View
        ref={register(node.id)}
        style={[
          styles.row,
          { paddingLeft: 8 + depth * INDENT_PX },
          status
            ? { borderLeftColor: status.color, backgroundColor: tint(status.color) }
            : styles.noteRow,
          isSelected && !isEditing && styles.selected,
          dropHere === 'inside' && styles.dropInside,
          dropHere === 'before' && styles.dropBefore,
          dropHere === 'after' && styles.dropAfter,
          isDragging && styles.dragging,
        ]}
      >
        <View style={styles.grip} {...panResponder.panHandlers}>
          <Text style={styles.gripText}>⠿</Text>
        </View>

        <Pressable onPress={() => hasChildren && toggleCollapseFor(node.id)} hitSlop={4}>
          <Text style={styles.twisty}>
            {hasChildren ? (node.collapsed ? '▸' : '▾') : '·'}
          </Text>
        </Pressable>

        <Pressable onPress={() => cycleStatusFor(node.id)} hitSlop={6}>
          {status ? (
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          ) : (
            <View style={styles.statusDotEmpty} />
          )}
        </Pressable>

        {isEditing ? (
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={node.content}
            onChangeText={(t) => setNodeContent(node.id, t)}
            onKeyPress={onKeyPress}
            onBlur={() => setMode('selected')}
            multiline
            blurOnSubmit={false}
            placeholder="Type…"
          />
        ) : (
          <Pressable style={styles.contentWrap} onPress={onContentPress}>
            {node.content ? (
              <InlineMarkdown text={node.content} style={styles.content} numberOfLines={1} />
            ) : (
              <Text style={[styles.content, styles.placeholder]} numberOfLines={1}>
                Empty
              </Text>
            )}
          </Pressable>
        )}

        {rollup && (
          <Text style={styles.rollup} numberOfLines={1}>
            {`Σ ${formatDuration(rollup.seconds)}`}
            {rollup.points > 0 ? ` · ${rollup.points}pt` : ''}
            {pct != null ? ` · ${Math.round(pct * 100)}%` : ''}
          </Text>
        )}

        <Pressable
          onPress={() => toggleTimerFor(node.id)}
          hitSlop={6}
          style={[styles.timer, running && styles.timerRunning]}
        >
          <Text style={[styles.timerText, running && styles.timerTextRunning]}>
            {running ? '⏸ ' : '▶ '}
            {ownSeconds > 0 ? formatDuration(ownSeconds) : ''}
          </Text>
        </Pressable>

        <Pressable onPress={() => cyclePointsFor(node.id)} hitSlop={6}>
          <Text style={[styles.points, node.storyPoints == null && styles.pointsEmpty]}>
            {node.storyPoints != null ? `${node.storyPoints} pt` : '+pt'}
          </Text>
        </Pressable>
      </View>

      {!node.collapsed &&
        node.children.map((child) => (
          <NodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            statuses={statuses}
            nowMs={nowMs}
          />
        ))}
    </Fragment>
  );
}

/** A faint version of the status color for the row background. */
function tint(hex: string): string {
  return hex + '14'; // ~8% alpha (#RRGGBBAA)
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    gap: 8,
  },
  noteRow: { borderLeftColor: '#e5e7eb' },
  selected: {
    outlineWidth: 2,
    outlineColor: '#2563eb',
    outlineStyle: 'solid',
  } as any,
  dragging: { opacity: 0.4 },
  dropInside: { backgroundColor: '#dbeafe' },
  dropBefore: { borderTopWidth: 2, borderTopColor: '#2563eb' },
  dropAfter: { borderBottomWidth: 2, borderBottomColor: '#2563eb' },
  grip: { width: 14, alignItems: 'center', justifyContent: 'center', cursor: 'grab' } as any,
  gripText: { fontSize: 12, color: '#d1d5db' },
  twisty: { width: 14, color: '#9ca3af', fontSize: 12, textAlign: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusDotEmpty: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  contentWrap: { flex: 1 },
  content: { fontSize: 14, color: '#111827' },
  placeholder: { color: '#9ca3af', fontStyle: 'italic' },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
    outlineWidth: 0,
  } as any,
  rollup: {
    fontSize: 11,
    color: '#9ca3af',
    fontVariant: ['tabular-nums'],
  },
  timer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  timerRunning: { backgroundColor: '#dcfce7' },
  timerText: { fontSize: 12, color: '#9ca3af', fontVariant: ['tabular-nums'] },
  timerTextRunning: { color: '#15803d', fontWeight: '600' },
  points: { fontSize: 12, color: '#6b7280', fontVariant: ['tabular-nums'] },
  pointsEmpty: { color: '#d1d5db' },
});
