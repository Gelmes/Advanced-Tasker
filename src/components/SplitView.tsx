import { Fragment, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { InlineMarkdown } from '../markdown/InlineMarkdown';
import { paneScroll } from '../paneScroll';
import { completion, computeRollup } from '../model/rollups';
import { elapsedSeconds, formatDuration } from '../model/time';
import type { PaneStash } from '../store/useStore';
import type { StatusDef, TaskNode } from '../model/types';
import { useStore } from '../store/useStore';
import { color, font } from '../theme';
import { OutlineView } from './OutlineView';
import { TabBar } from './TabBar';

// Split view (SPEC.md §4). The store's singleton document is always the FOCUSED
// pane (full editing, keyboard, sync); the other pane renders its parked document
// read-only from the stash — a click anywhere in it swaps focus. One document is
// ever "hot", so autosave/undo/sync correctness is untouched by splitting.

const INDENT_PX = 22;
const LINE_HEIGHT = 20;

/** The main editor area: a single pane, or two panes split by a draggable bar. */
export function MainArea() {
  const split = useStore((s) => s.split);
  const setSplitFraction = useStore((s) => s.setSplitFraction);
  const containerRef = useRef<View>(null);

  if (!split) {
    return (
      <View style={styles.fill}>
        <TabBar />
        <OutlineView />
      </View>
    );
  }

  const live = (
    <View style={[styles.fill, { flex: split.stashSide === 'first' ? 1 - split.fraction : split.fraction }]}>
      <TabBar />
      <OutlineView />
    </View>
  );
  const cold = (
    <View style={[styles.fill, { flex: split.stashSide === 'first' ? split.fraction : 1 - split.fraction }]}>
      <ColdPane stash={split.stash} />
    </View>
  );

  const onDividerDown = (e: PointerEvent) => {
    e.preventDefault();
    const el: any = containerRef.current;
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return;
    const move = (ev: PointerEvent) => {
      const frac =
        split.direction === 'row'
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top) / rect.height;
      // fraction is the FIRST pane's share regardless of which pane is focused.
      setSplitFraction(frac);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <View ref={containerRef} style={[styles.fill, { flexDirection: split.direction }]}>
      {split.stashSide === 'first' ? cold : live}
      <Divider direction={split.direction} onPointerDown={onDividerDown} />
      {split.stashSide === 'first' ? live : cold}
    </View>
  );
}

/** The resize bar between panes (native pointer drag, like the row grip). */
function Divider({
  direction,
  onPointerDown,
}: {
  direction: 'row' | 'column';
  onPointerDown: (e: PointerEvent) => void;
}) {
  const ref = useRef<any>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.addEventListener) return;
    el.addEventListener('pointerdown', onPointerDown);
    return () => el.removeEventListener('pointerdown', onPointerDown);
  }, [onPointerDown]);
  return (
    <View
      ref={ref}
      style={[styles.divider, direction === 'row' ? styles.dividerV : styles.dividerH]}
    />
  );
}

/**
 * The unfocused pane: a read-only render of the stashed document. Any click
 * focuses it (the documents swap; selection/undo are restored per pane).
 */
function ColdPane({ stash }: { stash: PaneStash }) {
  const focusOther = useStore((s) => s.focusOther);
  const project = stash.project;
  const doneIds = new Set(project.statuses.filter((s) => s.kind === 'done').map((s) => s.id));
  const nowMs = Date.now(); // cold panes don't tick — refreshed on any re-render

  // Open at the offset the document was parked at, and keep the memory current
  // while the user scrolls the cold pane — a focus swap lands exactly there.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    paneScroll.setCold(stash.scrollY);
    (scrollRef.current as any)?.scrollTo?.({ y: stash.scrollY, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stash.fileName, stash.project.id]);

  return (
    <Pressable style={styles.cold} onPress={() => void focusOther()}>
      {/* Mini tab strip mirroring the pane's parked tabs. */}
      <View style={styles.coldTabs}>
        {(stash.openTabs.length ? stash.openTabs : [null]).map((t, i) => (
          <View key={t ?? i} style={[styles.coldTab, t === stash.fileName && styles.coldTabActive]}>
            <Text
              style={[styles.coldTabText, t === stash.fileName && styles.coldTabTextActive]}
              numberOfLines={1}
            >
              {t === stash.fileName ? project.name || 'Untitled' : (t ?? 'Untitled')}
            </Text>
          </View>
        ))}
        <Text style={styles.coldHint}>click to focus</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={styles.coldContent}
        onScroll={(e) => paneScroll.setCold(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {project.root.children.length === 0 ? (
          <Text style={styles.coldEmpty}>Empty project.</Text>
        ) : (
          project.root.children.map((n) => (
            <ColdRow key={n.id} node={n} depth={0} statuses={project.statuses} doneIds={doneIds} nowMs={nowMs} />
          ))
        )}
      </ScrollView>
    </Pressable>
  );
}

/** A lightweight, non-interactive NodeRow twin (no store hooks, no registry). */
function ColdRow({
  node,
  depth,
  statuses,
  doneIds,
  nowMs,
}: {
  node: TaskNode;
  depth: number;
  statuses: StatusDef[];
  doneIds: Set<string>;
  nowMs: number;
}) {
  const status = node.status ? statuses.find((s) => s.id === node.status) : undefined;
  const hasChildren = node.children.length > 0;
  const rollup = hasChildren ? computeRollup(node, (id) => doneIds.has(id), nowMs) : null;
  const pct = rollup ? completion(rollup) : null;
  const seconds = elapsedSeconds(node, nowMs);

  return (
    <Fragment>
      <View
        style={[
          styles.row,
          status ? { borderLeftColor: status.color, backgroundColor: status.color + '14' } : styles.noteRow,
        ]}
      >
        {Array.from({ length: depth }).map((_, i) => (
          <View key={i} style={styles.guide} />
        ))}
        <Text style={hasChildren ? styles.twisty : styles.leaf}>
          {hasChildren ? (node.collapsed ? '▸' : '▾') : '·'}
        </Text>
        {status ? (
          <View style={[styles.dot, { backgroundColor: status.color }]} />
        ) : (
          <View style={styles.dotEmpty} />
        )}
        <View style={styles.contentWrap}>
          <InlineMarkdown text={node.content || 'Empty'} style={styles.content} />
        </View>
        {node.bookmarked && <Text style={styles.star}>★</Text>}
        {rollup && (
          <Text style={styles.rollup} numberOfLines={1}>
            {`Σ ${formatDuration(rollup.seconds)}`}
            {rollup.points > 0 ? ` · ${rollup.points}pt` : ''}
            {pct != null ? ` · ${Math.round(pct * 100)}%` : ''}
          </Text>
        )}
        {seconds > 0 && <Text style={styles.timer}>{formatDuration(seconds)}</Text>}
        {node.storyPoints != null && <Text style={styles.points}>{node.storyPoints} pt</Text>}
      </View>
      {!node.collapsed &&
        node.children.map((c) => (
          <ColdRow key={c.id} node={c} depth={depth + 1} statuses={statuses} doneIds={doneIds} nowMs={nowMs} />
        ))}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0, minHeight: 0 } as any,
  divider: { backgroundColor: color.border, zIndex: 2 },
  dividerV: { width: 5, cursor: 'col-resize' } as any,
  dividerH: { height: 5, cursor: 'row-resize' } as any,

  cold: { flex: 1, backgroundColor: color.appBg, opacity: 0.88, cursor: 'pointer' } as any,
  coldTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    backgroundColor: color.surfaceAlt,
  },
  coldTab: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, maxWidth: 160 },
  coldTabActive: { backgroundColor: color.hover },
  coldTabText: { fontSize: font.sm, color: color.inkSoft },
  coldTabTextActive: { color: color.inkMid, fontWeight: '600' },
  coldHint: { marginLeft: 'auto', fontSize: font.xs, color: color.inkFaint } as any,
  coldContent: { paddingBottom: 8 },
  coldEmpty: { padding: 16, color: color.inkSoft, fontSize: font.md },

  // Mirrors NodeRow's metrics closely enough that swapping focus doesn't jump.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    paddingRight: 12,
    paddingLeft: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    gap: 8,
  },
  noteRow: { borderLeftColor: color.border },
  guide: {
    width: INDENT_PX - 8,
    alignSelf: 'stretch',
    marginTop: -6,
    marginBottom: -6,
    borderRightWidth: 1,
    borderRightColor: color.guide,
  },
  twisty: { width: 18, lineHeight: LINE_HEIGHT, color: color.inkMid, fontSize: 16, textAlign: 'center' },
  leaf: { width: 18, lineHeight: LINE_HEIGHT, color: color.inkFaint, fontSize: 12, textAlign: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: (LINE_HEIGHT - 10) / 2 },
  dotEmpty: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: color.borderStrong,
    marginTop: (LINE_HEIGHT - 10) / 2,
  },
  contentWrap: { flex: 1, minWidth: 150 },
  content: { fontSize: 14, lineHeight: LINE_HEIGHT, color: color.ink },
  star: { fontSize: 12, lineHeight: LINE_HEIGHT, color: color.warn },
  rollup: {
    fontSize: 11,
    lineHeight: LINE_HEIGHT,
    color: color.inkSoft,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    minWidth: 0,
  },
  timer: { fontSize: 12, lineHeight: LINE_HEIGHT, color: color.inkSoft, fontVariant: ['tabular-nums'] },
  points: { fontSize: 12, lineHeight: LINE_HEIGHT, color: color.inkMid, fontVariant: ['tabular-nums'] },
});
