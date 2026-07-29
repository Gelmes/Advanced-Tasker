// Projects screen (MOBILE.md v1 screens). The phone's replacement for the
// folder explorer: the union of server projects and locally cached ones, with
// per-project state. Cache-first opens make this work offline.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useStore } from '../../store/useStore';
import { font, radius } from '../../theme';
import { readCacheIndex, type CachedProjectMeta } from '../cache';
import { usePalette } from '../theme';

interface Row {
  id: string;
  name: string;
  cached: boolean;
  /** On the server (false = cache-only, e.g. opened before, deleted remotely). */
  remote: boolean;
}

export function ProjectsScreen({
  onOpen,
  onCapture,
  onSettings,
}: {
  onOpen: (id: string) => Promise<void>;
  /** Quick capture into the last-used project (MOBILE.md: pocket → saved in two taps). */
  onCapture: () => void;
  onSettings: () => void;
}) {
  const palette = usePalette();
  const configured = useStore((s) => !!s.syncUrl && !!s.syncToken);
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const cached = readCacheIndex();
    const byId = new Map<string, Row>();
    for (const c of cached) byId.set(c.id, { id: c.id, name: c.name, cached: true, remote: false });
    setRows([...byId.values()].sort((a, b) => a.name.localeCompare(b.name))); // instant, offline-safe
    if (!configured) return;
    try {
      const remote = await useStore.getState().listServerProjects();
      for (const r of remote) {
        const existing = byId.get(r.id);
        byId.set(r.id, {
          id: r.id,
          name: r.name || existing?.name || 'Untitled',
          cached: !!existing,
          remote: true,
        });
      }
      setRows([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
      setError(null);
    } catch (e: any) {
      setError(`Couldn't reach the server (${e?.message ?? 'network'}). Showing cached projects.`);
    }
  }, [configured]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    if (openingId) return;
    setOpeningId(id);
    setError(null);
    try {
      await onOpen(id);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to open the project.');
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.appBg }]}>
      <View style={[styles.header, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
        <Text style={[styles.title, { color: palette.ink }]}>Advanced Tasker</Text>
        <Pressable onPress={onSettings} hitSlop={12} style={styles.gearBtn}>
          <Text style={[styles.gear, { color: palette.inkMid }]}>⚙</Text>
        </Pressable>
      </View>

      {!configured && (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.ink }]}>Connect to your sync server</Text>
          <Text style={[styles.emptyText, { color: palette.inkMid }]}>
            Projects live on your sync server — set the server URL and token to
            get started.
          </Text>
          <Pressable onPress={onSettings} style={[styles.cta, { backgroundColor: palette.accent }]}>
            <Text style={styles.ctaText}>Set up sync</Text>
          </Pressable>
        </View>
      )}

      {configured && (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
              tintColor={palette.inkSoft}
            />
          }
          ListHeaderComponent={
            error ? (
              <Text style={[styles.error, { color: palette.warn }]}>{error}</Text>
            ) : null
          }
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: palette.inkSoft, padding: 24 }]}>
              No projects yet — create one on desktop and it appears here.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void open(item.id)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? palette.hover : palette.appBg,
                  borderBottomColor: palette.border,
                },
              ]}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.rowName, { color: palette.ink }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.rowSub, { color: palette.inkSoft }]}>
                  {item.cached && item.remote
                    ? 'Synced · available offline'
                    : item.cached
                      ? 'Local cache only'
                      : 'On server — opens online'}
                </Text>
              </View>
              {openingId === item.id ? (
                <ActivityIndicator color={palette.accent} />
              ) : (
                <Text style={[styles.chevron, { color: palette.inkFaint }]}>›</Text>
              )}
            </Pressable>
          )}
        />
      )}

      {configured && (
        <Pressable onPress={onCapture} style={[styles.fab, { backgroundColor: palette.accent }]}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: font.lg, fontWeight: '600' },
  gearBtn: { minWidth: 48, minHeight: 32, alignItems: 'flex-end', justifyContent: 'center' },
  gear: { fontSize: 20 },
  empty: { flex: 1, justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { fontSize: font.lg, fontWeight: '600' },
  emptyText: { fontSize: font.base, lineHeight: 20 },
  cta: {
    marginTop: 12,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaText: { color: '#ffffff', fontSize: font.base, fontWeight: '600' },
  error: { padding: 12, fontSize: font.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: { fontSize: font.base, fontWeight: '500' },
  rowSub: { fontSize: font.sm },
  chevron: { fontSize: 22 },
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
