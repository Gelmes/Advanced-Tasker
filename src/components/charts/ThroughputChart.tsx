import { StyleSheet, Text, View } from 'react-native';
import type { Forecast, WeekBucket } from '../../model/analytics';

// Throughput view: completed points per week (bars) + a Monte-Carlo finish
// forecast. Bars are plain Views; no SVG needed for a simple bar column.

const DAY = 86_400_000;
const BAR_AREA = 150;

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface Props {
  buckets: WeekBucket[];
  avgWeekly: number;
  remaining: number;
  forecast: Forecast | null;
  nowMs: number;
}

export function ThroughputChart({ buckets, avgWeekly, remaining, forecast, nowMs }: Props) {
  const max = Math.max(1, ...buckets.map((b) => b.points));

  const finishLine =
    remaining <= 0
      ? 'All scoped work is done 🎉'
      : forecast
        ? `≈ ${forecast.p50Days}d (by ${fmtDate(nowMs + forecast.p50Days * DAY)}) · ` +
          `85% by ${fmtDate(nowMs + forecast.p85Days * DAY)}`
        : 'Not enough completed work to forecast yet.';

  return (
    <View style={styles.wrap}>
      <View style={styles.stats}>
        <Stat label="points / week" value={avgWeekly.toFixed(1)} />
        <Stat label="remaining pts" value={String(Math.max(0, remaining))} />
      </View>

      <View style={styles.forecast}>
        <Text style={styles.forecastLabel}>Forecast to finish</Text>
        <Text style={styles.forecastValue}>{finishLine}</Text>
      </View>

      {buckets.length === 0 ? (
        <Text style={styles.empty}>No completed work yet.</Text>
      ) : (
        <View style={styles.chart}>
          {buckets.map((b) => (
            <View key={b.weekStart} style={styles.col}>
              <Text style={styles.barValue}>{b.points || ''}</Text>
              <View
                style={[styles.bar, { height: Math.round((b.points / max) * BAR_AREA) }]}
              />
              <Text style={styles.colLabel}>{fmtDate(b.weekStart)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  stats: { flexDirection: 'row', gap: 24 },
  stat: { gap: 1 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, color: '#9ca3af' },
  forecast: {
    backgroundColor: '#f5f7ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  forecastLabel: { fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: '700' },
  forecastValue: { fontSize: 14, color: '#111827' },
  empty: { padding: 24, color: '#9ca3af', textAlign: 'center' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    minHeight: BAR_AREA + 30,
  },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  barValue: { fontSize: 10, color: '#9ca3af', fontVariant: ['tabular-nums'] },
  bar: { width: '70%', minWidth: 8, backgroundColor: '#22c55e', borderRadius: 3 },
  colLabel: { fontSize: 10, color: '#9ca3af' },
});
