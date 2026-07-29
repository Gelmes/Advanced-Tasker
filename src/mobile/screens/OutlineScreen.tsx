// Read-only outline (MOBILE.md v1 screens). Touch-first rows over the shared
// store: twisty to expand/collapse (device-local view state, same as desktop),
// status dot, content, points + live timer chips. Rendered as a FlatList over
// the flattened *visible* tree — flat virtualized rows scale better on phones
// than the desktop's recursive NodeRow.

import { memo, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { StatusDef, TaskNode } from '../../model/types';
import { elapsedSeconds, formatDuration, isRunning } from '../../model/time';
import { useNow } from '../../hooks/useNow';
import { useStore } from '../../store/useStore';
import { font, radius } from '../../theme';
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

const Row = memo(function Row({
  row,
  status,
  running,
  elapsed,
  palette,
}: {
  row: VisibleRow;
  status: StatusDef | null;
  running: boolean;
  elapsed: number;
  palette: ReturnType<typeof usePalette>;
}) {
  const { node, depth, hasChildren } = row;
  const done = status?.kind === 'done';
  return (
    <View
      style={[
        styles.row,
        { paddingLeft: 8 + depth * 18, borderBottomColor: palette.border },
      ]}
    >
      {hasChildren ? (
        <Pressable
          onPress={() => useStore.getState().toggleCollapseFor(node.id)}
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
      <View
        style={[
          styles.dot,
          status
            ? { backgroundColor: status.color }
            : { borderWidth: 1.5, borderColor: palette.inkFaint },
        ]}
      />
      <Text
        style={[
          styles.content,
          { color: done ? palette.inkSoft : palette.ink },
          done && styles.done,
        ]}
      >
        {node.content || ' '}
      </Text>
      {node.storyPoints != null && (
        <View style={[styles.chip, { backgroundColor: palette.accentSoft }]}>
          <Text style={[styles.chipText, { color: palette.accentInk }]}>{node.storyPoints}</Text>
        </View>
      )}
      {(elapsed > 0 || running) && (
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
            {running ? '▶ ' : ''}
            {formatDuration(elapsed)}
          </Text>
        </View>
      )}
    </View>
  );
});

export function OutlineScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const project = useStore((s) => s.project);
  const syncing = useStore((s) => s.syncing);
  const syncStatus = useStore((s) => s.syncStatus);
  const now = useNow();

  const rows = useMemo(
    () => flattenVisible(project.root.children, 0, []),
    [project],
  );
  const statusById = useMemo(
    () => new Map(project.statuses.map((s) => [s.id, s])),
    [project.statuses],
  );

  return (
    <View style={[styles.screen, { backgroundColor: palette.appBg }]}>
      <View style={[styles.header, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
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
        data={rows}
        keyExtractor={(r) => r.node.id}
        renderItem={({ item }) => (
          <Row
            row={item}
            status={item.node.status ? (statusById.get(item.node.status) ?? null) : null}
            running={isRunning(item.node)}
            elapsed={elapsedSeconds(item.node, now)}
            palette={palette}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: palette.inkSoft }]}>
            This project is empty.
          </Text>
        }
        contentContainerStyle={styles.list}
      />
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
  list: { paddingBottom: 32 },
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
  dot: { width: 12, height: 12, borderRadius: 6 },
  content: { flex: 1, fontSize: font.base, lineHeight: 20 },
  done: { textDecorationLine: 'line-through' },
  chip: {
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: { fontSize: font.sm, fontVariant: ['tabular-nums'] },
  empty: { padding: 24, fontSize: font.base },
});
