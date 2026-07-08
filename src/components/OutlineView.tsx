import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNow } from '../hooks/useNow';
import { paneScroll } from '../paneScroll';
import { useStore } from '../store/useStore';
import { color, font, radius } from '../theme';
import { NodeRow } from './NodeRow';

/** The main outline: the recursive node tree (title lives in the tab bar). */
export function OutlineView() {
  const project = useStore((s) => s.project);
  const nowMs = useNow();

  // Report scroll offset + accept restores, so split-view focus swaps can put
  // each pane back where it was (paneScroll owns the memory).
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    paneScroll.registerLiveScroller((y) =>
      (scrollRef.current as any)?.scrollTo?.({ y, animated: false }),
    );
    return () => paneScroll.registerLiveScroller(null);
  }, []);

  const doneStatusIds = useMemo(
    () => new Set(project.statuses.filter((s) => s.kind === 'done').map((s) => s.id)),
    [project.statuses],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onScroll={(e) => paneScroll.setLive(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {project.root.children.length === 0 ? (
          <EmptyState />
        ) : (
          project.root.children.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              depth={0}
              statuses={project.statuses}
              doneStatusIds={doneStatusIds}
              nowMs={nowMs}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** A tiny keyboard-key chip for the welcome hints. */
function Kbd({ children }: { children: string }) {
  return (
    <View style={styles.kbd}>
      <Text style={styles.kbdText}>{children}</Text>
    </View>
  );
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <View style={styles.hintRow}>
      <Kbd>{k}</Kbd>
      <Text style={styles.hintText}>{label}</Text>
    </View>
  );
}

/** Welcome card for an empty project — teach the core keys instead of a bare line. */
function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Start capturing</Text>
        <Text style={styles.emptySub}>
          Everything is a note until you give it a status — then it's a task.
        </Text>
        <View style={styles.hints}>
          <Hint k="Enter" label="new item" />
          <Hint k="Tab" label="indent under the item above" />
          <Hint k="S" label="cycle status (makes it a task)" />
          <Hint k="P" label="story points" />
          <Hint k="Space" label="start / stop the timer" />
          <Hint k="?" label="all shortcuts" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.appBg,
  },
  list: {
    flex: 1,
  },
  listContent: {
    // No top padding — keep the first row flush under the tab bar. (Using
    // paddingVertical here would share an atomic class with the toolbar/sidebar.)
    paddingTop: 0,
    paddingBottom: 8,
  },
  emptyWrap: { alignItems: 'flex-start', padding: 24 },
  emptyCard: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    paddingHorizontal: 20,
    paddingVertical: 18,
    maxWidth: 420,
  },
  emptyTitle: { fontSize: font.lg, fontWeight: '600', color: color.ink },
  emptySub: { fontSize: font.md, color: color.inkSoft, marginTop: 4, lineHeight: 19 },
  hints: { marginTop: 14, gap: 8 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hintText: { fontSize: font.md, color: color.inkMid },
  kbd: {
    minWidth: 26,
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.appBg,
    boxShadow: '0 1px 0 ' + color.borderStrong,
  } as any,
  kbdText: { fontSize: font.sm, color: color.inkMid, fontWeight: '600' },
});
