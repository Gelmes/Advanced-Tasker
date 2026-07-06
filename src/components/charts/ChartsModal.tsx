import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNow } from '../../hooks/useNow';
import {
  averageWeeklyThroughput,
  burndownSeries,
  burnupSeries,
  collectTasks,
  cycleItems,
  dailyThroughput,
  dayRange,
  monteCarloForecast,
  weeklyBuckets,
} from '../../model/analytics';
import type { KindOf } from '../../model/lifecycle';
import { findNode } from '../../model/tree';
import type { TaskNode } from '../../model/types';
import { useStore } from '../../store/useStore';
import { CycleTimeChart } from './CycleTimeChart';
import { LineChart, type Series } from './LineChart';
import { ThroughputChart } from './ThroughputChart';
import { color, palettes, resolvedTheme } from '../../theme';

const CHART_W = 660;
const CHART_H = 300;
type Tab = 'burnup' | 'burndown' | 'throughput' | 'cycle';

const fmtMD = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          <View
            style={[
              styles.legendSwatch,
              { backgroundColor: it.dashed ? 'transparent' : it.color, borderColor: it.color },
              it.dashed && styles.legendDashed,
            ]}
          />
          <Text style={styles.legendText}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ChartsModal({ visible, onClose }: Props) {
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedId);
  const nowMs = useNow();
  const [tab, setTab] = useState<Tab>('burnup');
  const [chartWidth, setChartWidth] = useState(CHART_W);

  // Scope = the selected subtree (if it has children), else the whole project.
  const selected = selectedId ? findNode(project.root.children, selectedId) : null;
  const useSelected = !!selected && selected.children.length > 0;
  const scopeNode: TaskNode = useSelected
    ? selected!
    : ({
        id: '__root__',
        content: project.name,
        status: null,
        storyPoints: null,
        time: { intervals: [], startedAt: null },
        statusHistory: [],
        dueDate: null,
        collapsed: false,
        createdAt: '',
        updatedAt: '',
        children: project.root.children,
      } as TaskNode);
  const scopeName = useSelected ? selected!.content || 'Untitled' : project.name;

  const kindOf: KindOf = (id) => project.statuses.find((s) => s.id === id)?.kind;
  const tasks = collectTasks(scopeNode);

  const start = tasks.length
    ? Math.min(...tasks.map((t) => Date.parse(t.createdAt)))
    : nowMs;
  const days = dayRange(start, nowMs);
  const burnup = burnupSeries(tasks, days, kindOf);
  const dueMs = scopeNode.dueDate ? Date.parse(`${scopeNode.dueDate}T00:00:00.000Z`) : null;
  const burndown = burndownSeries(burnup, dueMs);
  const cycle = cycleItems(tasks, kindOf);

  const daily = dailyThroughput(burnup);
  const avgWeekly = averageWeeklyThroughput(daily);
  const last = burnup[burnup.length - 1];
  const remaining = last ? last.scope - last.done : 0;
  const forecast = monteCarloForecast(remaining, daily, 500);
  const buckets = weeklyBuckets(burnup);

  const xDomain: [number, number] = [days[0] ?? nowMs, days[days.length - 1] ?? nowMs];
  const step = Math.max(1, Math.ceil(days.length / 6));
  const xTicks = days
    .filter((_, i) => i % step === 0)
    .map((d) => ({ value: d, label: fmtMD(d) }));

  const burnupYMax = Math.max(1, ...burnup.map((p) => p.scope));
  const burnupSeriesData: Series[] = [
    { color: '#9ca3af', points: burnup.map((p) => ({ x: p.day, y: p.scope })) },
    { color: '#3b82f6', points: burnup.map((p) => ({ x: p.day, y: p.done })), fill: true },
  ];

  const burndownYMax = Math.max(1, ...burndown.map((p) => Math.max(p.remaining, p.ideal)));
  const burndownSeriesData: Series[] = [
    { color: '#9ca3af', points: burndown.map((p) => ({ x: p.day, y: p.ideal })), dashed: true },
    { color: '#3b82f6', points: burndown.map((p) => ({ x: p.day, y: p.remaining })) },
  ];

  const hasData = tasks.length > 0 && days.length > 0;
  const th = palettes[resolvedTheme()];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => {}}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Charts</Text>
              <Text style={styles.scope}>{scopeName}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.tabs}>
            {(['burnup', 'burndown', 'throughput', 'cycle'] as Tab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tab, tab === t && styles.tabActive]}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'burnup'
                    ? 'Burnup'
                    : t === 'burndown'
                      ? 'Burndown'
                      : t === 'throughput'
                        ? 'Throughput'
                        : 'Cycle time'}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            onLayout={(e) =>
              setChartWidth(Math.max(320, Math.floor(e.nativeEvent.layout.width)))
            }
          >
            {!hasData ? (
              <Text style={styles.empty}>No tasks in this scope yet.</Text>
            ) : tab === 'burnup' ? (
              <>
                <LineChart
                  width={chartWidth}
                  height={CHART_H}
                  series={burnupSeriesData}
                  xDomain={xDomain}
                  yMax={burnupYMax}
                  xTicks={xTicks}
                  gridColor={th.hover}
                  labelColor={th.inkSoft}
                />
                <Legend
                  items={[
                    { color: '#9ca3af', label: 'Scope (points)' },
                    { color: '#3b82f6', label: 'Done (points)' },
                  ]}
                />
              </>
            ) : tab === 'burndown' ? (
              <>
                <LineChart
                  width={chartWidth}
                  height={CHART_H}
                  series={burndownSeriesData}
                  xDomain={xDomain}
                  yMax={burndownYMax}
                  xTicks={xTicks}
                  gridColor={th.hover}
                  labelColor={th.inkSoft}
                />
                <Legend
                  items={[
                    { color: '#3b82f6', label: 'Remaining (points)' },
                    { color: '#9ca3af', label: 'Ideal', dashed: true },
                  ]}
                />
                {!dueMs && (
                  <Text style={styles.hint}>
                    Set a due date on this item (details panel) to anchor the ideal line.
                  </Text>
                )}
              </>
            ) : tab === 'throughput' ? (
              <ThroughputChart
                buckets={buckets}
                avgWeekly={avgWeekly}
                remaining={remaining}
                forecast={forecast}
                nowMs={nowMs}
              />
            ) : (
              <CycleTimeChart items={cycle} />
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '92%',
    maxWidth: 960,
    maxHeight: '90%',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '600', color: color.ink },
  scope: { fontSize: 12, color: color.inkSoft, marginTop: 1 },
  close: { fontSize: 16, color: color.inkSoft },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: color.hover,
  },
  tabActive: { backgroundColor: color.accentSoft },
  tabText: { fontSize: 13, color: color.inkMid },
  tabTextActive: { color: color.accentInk, fontWeight: '600' },
  body: { gap: 10 },
  empty: { padding: 24, color: color.inkSoft, textAlign: 'center' },
  hint: { fontSize: 12, color: color.inkSoft, fontStyle: 'italic' },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 2 },
  legendDashed: { borderStyle: 'dashed' },
  legendText: { fontSize: 12, color: color.inkMid },
});
