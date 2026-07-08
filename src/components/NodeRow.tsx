import { Fragment, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import { useDrag } from './DragContext';
import { setRow } from '../rowRegistry';
import { InlineMarkdown } from '../markdown/InlineMarkdown';
import { completion, computeRollup } from '../model/rollups';
import { elapsedSeconds, formatDuration, isRunning } from '../model/time';
import type { StatusDef, TaskNode } from '../model/types';
import { useStore } from '../store/useStore';
import { color } from '../theme';

const INDENT_PX = 22;
// Shared line metrics so the editing TextInput matches the display text exactly
// (no row-height jump when entering edit mode). The field auto-grows from one line.
const LINE_HEIGHT = 20;

function statusFor(node: TaskNode, statuses: StatusDef[]): StatusDef | undefined {
  return node.status ? statuses.find((s) => s.id === node.status) : undefined;
}

interface Props {
  node: TaskNode;
  depth: number;
  statuses: StatusDef[];
  /** Ids of statuses of kind 'done', for completion roll-ups. */
  doneStatusIds: Set<string>;
  /** Wall-clock ms, supplied once from the top so timers tick in sync. */
  nowMs: number;
}

/**
 * One outline row, recursive over its children. The twisty, status dot, content,
 * timer, and points chip are independent click targets (SPEC.md §3–4). Parent
 * rows also show a live roll-up of their subtree (time / points / completion %).
 */
export function NodeRow({ node, depth, statuses, doneStatusIds, nowMs }: Props) {
  const selectedId = useStore((s) => s.selectedId);
  const mode = useStore((s) => s.mode);
  const select = useStore((s) => s.select);
  const editSelected = useStore((s) => s.editSelected);
  const setMode = useStore((s) => s.setMode);
  const setNodeContent = useStore((s) => s.setNodeContent);
  const newSibling = useStore((s) => s.newSibling);
  const backspaceEmpty = useStore((s) => s.backspaceEmpty);
  const indentSelected = useStore((s) => s.indentSelected);
  const outdentSelected = useStore((s) => s.outdentSelected);
  const toggleCollapseFor = useStore((s) => s.toggleCollapseFor);
  const cycleStatusFor = useStore((s) => s.cycleStatusFor);
  const cyclePointsFor = useStore((s) => s.cyclePointsFor);
  const toggleTimerFor = useStore((s) => s.toggleTimerFor);
  const searchTag = useStore((s) => s.searchTag);

  const { register, startDrag, dragId, indicator } = useDrag();

  // The grip starts a drag via a native pointerdown (web). preventDefault stops the
  // browser from beginning a text selection.
  const gripRef = useRef<any>(null);
  useEffect(() => {
    const el = gripRef.current;
    if (!el?.addEventListener) return;
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      startDrag(node.id, e.clientY);
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [node.id, startDrag]);

  const status = statusFor(node, statuses);
  const isSelected = selectedId === node.id;
  const isEditing = isSelected && mode === 'editing';
  const hasChildren = node.children.length > 0;
  const running = isRunning(node);
  const ownSeconds = elapsedSeconds(node, nowMs);
  const isDragging = dragId === node.id;
  const dropHere = indicator?.targetId === node.id ? indicator.where : null;

  const rollup = hasChildren
    ? computeRollup(node, (id) => doneStatusIds.has(id), nowMs)
    : null;
  const pct = rollup ? completion(rollup) : null;

  const inputRef = useRef<TextInputType>(null);
  const [editHeight, setEditHeight] = useState(LINE_HEIGHT);
  useEffect(() => {
    if (!isEditing) return;
    const el = inputRef.current as any;
    el?.focus?.();
    // Place the caret at the end rather than the start (web textarea).
    const len = node.content.length;
    if (typeof el?.setSelectionRange === 'function') el.setSelectionRange(len, len);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } else if (key === 'Tab') {
      // Indent/outdent the node instead of moving focus to the next control.
      e.preventDefault?.();
      if (e.nativeEvent.shiftKey) outdentSelected();
      else indentSelected();
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
      <Pressable
        ref={(el: any) => {
          register(node.id)(el);
          setRow(node.id, el);
        }}
        onPress={() => select(node.id)}
        style={({ hovered }: any) => [
          styles.row,
          status
            ? { borderLeftColor: status.color, backgroundColor: tint(status.color) }
            : styles.noteRow,
          hovered && !status && styles.rowHover,
          isSelected && !isEditing && styles.selected,
          dropHere === 'inside' && styles.dropInside,
          dropHere === 'before' && styles.dropBefore,
          dropHere === 'after' && styles.dropAfter,
          isDragging && styles.dragging,
        ]}
      >
        {({ hovered }: any) => (
          <Fragment>
        {/* Indent guides: one hairline per ancestor level. */}
        {Array.from({ length: depth }).map((_, i) => (
          <View key={i} style={styles.guide} />
        ))}
        <View ref={gripRef} style={[styles.grip, !hovered && !isSelected && styles.gripHidden]}>
          <Text style={styles.gripText}>⠿</Text>
        </View>

        <Pressable onPress={() => hasChildren && toggleCollapseFor(node.id)} hitSlop={4}>
          <Text style={hasChildren ? styles.twisty : styles.leaf}>
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
            style={[styles.input, { height: editHeight }]}
            value={node.content}
            onChangeText={(t) => setNodeContent(node.id, t)}
            onKeyPress={onKeyPress}
            onBlur={() => setMode('selected')}
            onContentSizeChange={(e) =>
              setEditHeight(Math.max(LINE_HEIGHT, e.nativeEvent.contentSize.height))
            }
            multiline
            blurOnSubmit={false}
            placeholder="Type…"
          />
        ) : (
          <Pressable style={styles.contentWrap} onPress={onContentPress}>
            {node.content ? (
              <InlineMarkdown text={node.content} style={styles.content} onTagPress={searchTag} />
            ) : (
              <Text style={[styles.content, styles.placeholder]}>Empty</Text>
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
          </Fragment>
        )}
      </Pressable>

      {!node.collapsed &&
        node.children.map((child) => (
          <NodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            statuses={statuses}
            doneStatusIds={doneStatusIds}
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
    // Top-align so the controls line up with the first line of wrapped content.
    alignItems: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
    paddingLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    gap: 8,
  },
  noteRow: { borderLeftColor: color.border },
  rowHover: { backgroundColor: color.hoverFaint },
  // Indent guide: a hairline per ancestor level, spanning the row's full height
  // (negative vertical margins reach through the row padding).
  guide: {
    width: INDENT_PX - 8, // the row gap contributes the other 8px of each level
    alignSelf: 'stretch',
    marginTop: -6,
    marginBottom: -6,
    borderRightWidth: 1,
    borderRightColor: color.guide,
  },
  selected: {
    boxShadow: `inset 0 0 0 1.5px ${color.selectionRing}`,
    zIndex: 1, // lift above neighbouring rows so the shadow isn't clipped
  } as any,
  dragging: { opacity: 0.4 },
  dropInside: { backgroundColor: color.infoSoft },
  dropBefore: { borderTopWidth: 2, borderTopColor: color.accent },
  dropAfter: { borderBottomWidth: 2, borderBottomColor: color.accent },
  // The controls each occupy one line-height box so they align with the first
  // line of (possibly wrapped) content.
  grip: {
    width: 14,
    height: LINE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
  } as any,
  gripHidden: { opacity: 0 },
  gripText: { fontSize: 12, color: color.inkFaint },
  twisty: { width: 18, lineHeight: LINE_HEIGHT, color: color.inkMid, fontSize: 16, textAlign: 'center' },
  leaf: { width: 18, lineHeight: LINE_HEIGHT, color: color.inkFaint, fontSize: 12, textAlign: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: (LINE_HEIGHT - 10) / 2 },
  statusDotEmpty: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    marginTop: (LINE_HEIGHT - 10) / 2,
  },
  // minWidth keeps the text readable when the window narrows — without it the
  // fixed-width trailing controls squeeze flex:1 to ~0 and the text renders one
  // character per line. Past the minimum, the trailing chips clip instead.
  contentWrap: { flex: 1, minWidth: 150 },
  content: { fontSize: 14, lineHeight: LINE_HEIGHT, color: color.ink },
  placeholder: { color: color.inkSoft, fontStyle: 'italic' },
  input: {
    flex: 1,
    minWidth: 150, // match contentWrap — no per-character wrap while editing
    fontSize: 14,
    lineHeight: LINE_HEIGHT,
    color: color.ink,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    outlineWidth: 0,
    outlineStyle: 'none',
    boxShadow: 'none',
    backgroundColor: 'transparent',
    textAlignVertical: 'top',
  } as any,
  rollup: {
    fontSize: 11,
    lineHeight: LINE_HEIGHT,
    color: color.inkSoft,
    fontVariant: ['tabular-nums'],
    // The most compressible thing in the row: ellipsize before content squeezes.
    flexShrink: 1,
    minWidth: 0,
  },
  timer: {
    width: 66,
    height: LINE_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 5,
  },
  timerRunning: { backgroundColor: color.successSoft },
  timerText: { fontSize: 12, color: color.inkSoft, fontVariant: ['tabular-nums'] },
  timerTextRunning: { color: color.success, fontWeight: '600' },
  points: {
    width: 44,
    lineHeight: LINE_HEIGHT,
    textAlign: 'right',
    fontSize: 12,
    color: color.inkMid,
    fontVariant: ['tabular-nums'],
  },
  pointsEmpty: { color: color.inkFaint },
});
