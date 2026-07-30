// Charts on mobile (MOBILE.md Phase 4). All the maths is the shared, tested
// `model/analytics` — this screen only assembles and presents it, using the
// same scope rule as the desktop ChartsModal (selected subtree if it has
// children, else the whole project).
//
// `LineChart` is reused as-is: it takes its colors as props precisely because
// SVG attributes can't resolve the web build's CSS variables, which makes it
// portable to native unchanged. `ThroughputChart` / `CycleTimeChart` are not
// reusable — they style with `color.*` (CSS variables) — so their presentation
// is re-done here against the runtime palette, sized for a phone.

import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LineChart, type Series } from '../../components/charts/LineChart';
import { useNow } from '../../hooks/useNow';
import {
  averageWeeklyThroughput,
  burndownSeries,
  burnupSeries,
  collectTasks,
  cycleItems,
  dailyThroughput,
  dayRange,
  mean,
  median,
  monteCarloForecast,
  percentile,
  weeklyBuckets,
} from '../../model/analytics';
import type { KindOf } from '../../model/lifecycle';
import { findNode } from '../../model/tree';
import type { TaskNode } from '../../model/types';
import { useStore } from '../../store/useStore';
import { font, radius } from '../../theme';
import { usePalette } from '../theme';

const DAY = 86_400_000;
const CHART_H = 240;
const SCOPE_COLOR = '#9ca3af';
const DONE_COLOR = '#3b82f6';

type Tab = 'burnup' | 'burndown' | 'throughput' | 'cycle';
const TABS: { key: Tab; label: string }[] = [
  { key: 'burnup', label: 'Burnup' },
  { key: 'burndown', label: 'Burndown' },
  { key: 'throughput', label: 'Throughput' },
  { key: 'cycle', label: 'Cycle time' },
];

const fmtMD = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function fmtSpan(seconds: number | null): string {
  if (seconds == null) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

function Stat({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: palette.ink }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.inkSoft }]}>{label}</Text>
    </View>
  );
}

function Legend({
  items,
  palette,
}: {
  items: { color: string; label: string; dashed?: boolean }[];
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          <View
            style={[
              styles.legendSwatch,
              { backgroundColor: it.dashed ? 'transparent' : it.color, borderColor: it.color },
            ]}
          />
          <Text style={[styles.legendText, { color: palette.inkMid }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function ChartsScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedId);
  const nowMs = useNow();
  const [tab, setTab] = useState<Tab>('burnup');

  const chartWidth = Math.max(280, width - 32);

  const data = useMemo(() => {
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

    const kindOf: KindOf = (id) => project.statuses.find((s) => s.id === id)?.kind;
    const tasks = collectTasks(scopeNode);
    const start = tasks.length ? Math.min(...tasks.map((t) => Date.parse(t.createdAt))) : nowMs;
    const days = dayRange(start, nowMs);
    const burnup = burnupSeries(tasks, days, kindOf);
    const dueMs = scopeNode.dueDate ? Date.parse(`${scopeNode.dueDate}T00:00:00.000Z`) : null;
    const daily = dailyThroughput(burnup);
    const last = burnup[burnup.length - 1];
    const remaining = last ? last.scope - last.done : 0;

    return {
      scopeName: useSelected ? selected!.content || 'Untitled' : project.name,
      tasks,
      days,
      burnup,
      burndown: burndownSeries(burnup, dueMs),
      dueMs,
      cycle: cycleItems(tasks, kindOf),
      avgWeekly: averageWeeklyThroughput(daily),
      remaining,
      forecast: monteCarloForecast(remaining, daily, 500),
      buckets: weeklyBuckets(burnup),
    };
  }, [project, selectedId, nowMs]);

  const { days, burnup, burndown } = data;
  const xDomain: [number, number] = [days[0] ?? nowMs, days[days.length - 1] ?? nowMs];
  const step = Math.max(1, Math.ceil(days.length / 4)); // fewer ticks than desktop — narrow screen
  const xTicks = days
    .filter((_, i) => i % step === 0)
    .map((d) => ({ value: d, label: fmtMD(d) }));

  const burnupSeriesData: Series[] = [
    { color: SCOPE_COLOR, points: burnup.map((p) => ({ x: p.day, y: p.scope })) },
    { color: DONE_COLOR, points: burnup.map((p) => ({ x: p.day, y: p.done })), fill: true },
  ];
  const burndownSeriesData: Series[] = [
    { color: SCOPE_COLOR, points: burndown.map((p) => ({ x: p.day, y: p.ideal })), dashed: true },
    { color: DONE_COLOR, points: burndown.map((p) => ({ x: p.day, y: p.remaining })) },
  ];

  const hasData = data.tasks.length > 0 && days.length > 0;
  const cycles = data.cycle.map((i) => i.cycleSec);
  const leads = data.cycle.map((i) => i.leadSec).filter((x): x is number => x != null);
  const cycleMax = Math.max(...cycles, 1);
  const bucketMax = Math.max(1, ...data.buckets.map((b) => b.points));

  const finishLine =
    data.remaining <= 0
      ? 'All scoped work is done 🎉'
      : data.forecast
        ? `≈ ${data.forecast.p50Days}d (by ${fmtDate(nowMs + data.forecast.p50Days * DAY)}) · 85% by ${fmtDate(nowMs + data.forecast.p85Days * DAY)}`
        : 'Not enough completed work to forecast yet.';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: palette.appBg }]}>
        <View
          style={[
            styles.header,
            { backgroundColor: palette.surface, borderBottomColor: palette.border },
          ]}
        >
          <View style={styles.headerMain}>
            <Text style={[styles.title, { color: palette.ink }]}>Charts</Text>
            <Text style={[styles.scope, { color: palette.inkSoft }]} numberOfLines={1}>
              {data.scopeName}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Text style={[styles.close, { color: palette.inkMid }]}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                styles.tab,
                {
                  backgroundColor: tab === t.key ? palette.accentSoft : palette.surfaceAlt,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: tab === t.key ? palette.accentInk : palette.inkMid,
                    fontWeight: tab === t.key ? '600' : '400',
                  },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={styles.body}>
          {!hasData ? (
            <Text style={[styles.empty, { color: palette.inkSoft }]}>
              No tasks in this scope yet.
            </Text>
          ) : tab === 'burnup' ? (
            <>
              <LineChart
                width={chartWidth}
                height={CHART_H}
                series={burnupSeriesData}
                xDomain={xDomain}
                yMax={Math.max(1, ...burnup.map((p) => p.scope))}
                xTicks={xTicks}
                gridColor={palette.hover}
                labelColor={palette.inkSoft}
              />
              <Legend
                palette={palette}
                items={[
                  { color: SCOPE_COLOR, label: 'Scope (points)' },
                  { color: DONE_COLOR, label: 'Done (points)' },
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
                yMax={Math.max(1, ...burndown.map((p) => Math.max(p.remaining, p.ideal)))}
                xTicks={xTicks}
                gridColor={palette.hover}
                labelColor={palette.inkSoft}
              />
              <Legend
                palette={palette}
                items={[
                  { color: DONE_COLOR, label: 'Remaining (points)' },
                  { color: SCOPE_COLOR, label: 'Ideal', dashed: true },
                ]}
              />
              {!data.dueMs && (
                <Text style={[styles.hint, { color: palette.inkSoft }]}>
                  Set a due date on this item to anchor the ideal line.
                </Text>
              )}
            </>
          ) : tab === 'throughput' ? (
            <>
              <View style={styles.stats}>
                <Stat label="points / week" value={data.avgWeekly.toFixed(1)} palette={palette} />
                <Stat
                  label="remaining pts"
                  value={String(Math.max(0, data.remaining))}
                  palette={palette}
                />
              </View>
              <View style={[styles.forecast, { backgroundColor: palette.accentSoft }]}>
                <Text style={[styles.forecastLabel, { color: palette.inkSoft }]}>
                  FORECAST TO FINISH
                </Text>
                <Text style={[styles.forecastValue, { color: palette.ink }]}>{finishLine}</Text>
              </View>
              {data.buckets.length === 0 ? (
                <Text style={[styles.empty, { color: palette.inkSoft }]}>
                  No completed work yet.
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.barChart}>
                    {data.buckets.map((b) => (
                      <View key={b.weekStart} style={styles.col}>
                        <Text style={[styles.barValue, { color: palette.inkSoft }]}>
                          {b.points || ''}
                        </Text>
                        <View
                          style={[
                            styles.bar,
                            {
                              backgroundColor: palette.accent,
                              height: Math.max(2, Math.round((b.points / bucketMax) * 130)),
                            },
                          ]}
                        />
                        <Text style={[styles.colLabel, { color: palette.inkSoft }]}>
                          {fmtDate(b.weekStart)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </>
          ) : data.cycle.length === 0 ? (
            <Text style={[styles.empty, { color: palette.inkSoft }]}>
              No completed tasks in this scope yet.
            </Text>
          ) : (
            <>
              <View style={styles.stats}>
                <Stat label="completed" value={String(data.cycle.length)} palette={palette} />
                <Stat label="median" value={fmtSpan(median(cycles))} palette={palette} />
                <Stat label="p85" value={fmtSpan(percentile(cycles, 0.85))} palette={palette} />
                <Stat label="avg" value={fmtSpan(mean(cycles))} palette={palette} />
                <Stat label="lead med." value={fmtSpan(median(leads))} palette={palette} />
              </View>
              <View style={styles.cycleBars}>
                {data.cycle.map((it) => (
                  <View key={it.id} style={styles.cycleRow}>
                    <Text
                      style={[styles.cycleLabel, { color: palette.inkMid }]}
                      numberOfLines={1}
                    >
                      {it.content || 'Untitled'}
                    </Text>
                    <View style={[styles.track, { backgroundColor: palette.hover }]}>
                      <View
                        style={[
                          styles.fill,
                          {
                            backgroundColor: palette.accent,
                            width: `${(it.cycleSec / cycleMax) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.cycleValue, { color: palette.inkSoft }]}>
                      {fmtSpan(it.cycleSec)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerMain: { flex: 1, gap: 1 },
  title: { fontSize: font.lg, fontWeight: '600' },
  scope: { fontSize: font.sm },
  closeBtn: { minWidth: 40, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' },
  close: { fontSize: 18 },
  tabsScroll: { flexGrow: 0 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  tab: { paddingHorizontal: 14, minHeight: 38, borderRadius: radius.md, justifyContent: 'center' },
  tabText: { fontSize: font.md },
  body: { padding: 16, paddingTop: 0, gap: 14 },
  empty: { padding: 24, textAlign: 'center', fontSize: font.base },
  hint: { fontSize: font.sm, fontStyle: 'italic' },
  legend: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 2 },
  legendText: { fontSize: font.sm },
  stats: { flexDirection: 'row', gap: 20, flexWrap: 'wrap' },
  stat: { gap: 1 },
  statValue: { fontSize: font.lg, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: font.xs },
  forecast: { borderRadius: radius.md, padding: 12, gap: 3 },
  forecastLabel: { fontSize: font.xs, fontWeight: '700' },
  forecastValue: { fontSize: font.md, lineHeight: 18 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingVertical: 4 },
  col: { alignItems: 'center', gap: 4, width: 52 },
  bar: { width: 26, borderRadius: 3 },
  barValue: { fontSize: font.xs, fontVariant: ['tabular-nums'] },
  colLabel: { fontSize: font.xs },
  cycleBars: { gap: 8 },
  cycleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cycleLabel: { flex: 1, fontSize: font.sm },
  track: { width: 110, height: 12, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  cycleValue: { width: 46, fontSize: font.sm, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
