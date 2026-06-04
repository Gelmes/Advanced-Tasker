import { StyleSheet, Text, View } from 'react-native';
import { mean, median, percentile, type CycleItem } from '../../model/analytics';

// Cycle-time view: per-task horizontal bars (newest completion first) plus summary
// stats. Bars use plain Views — no SVG needed for horizontal bars.

function fmtSpan(seconds: number | null): string {
  if (seconds == null) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function CycleTimeChart({ items }: { items: CycleItem[] }) {
  if (!items.length) {
    return <Text style={styles.empty}>No completed tasks in this scope yet.</Text>;
  }
  const cycles = items.map((i) => i.cycleSec);
  const leads = items.map((i) => i.leadSec).filter((x): x is number => x != null);
  const max = Math.max(...cycles, 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.stats}>
        <Stat label="completed" value={String(items.length)} />
        <Stat label="cycle median" value={fmtSpan(median(cycles))} />
        <Stat label="cycle p85" value={fmtSpan(percentile(cycles, 0.85))} />
        <Stat label="cycle avg" value={fmtSpan(mean(cycles))} />
        <Stat label="lead median" value={fmtSpan(median(leads))} />
      </View>

      <View style={styles.bars}>
        {items.map((it) => (
          <View key={it.id} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>
              {it.content || 'Untitled'}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(it.cycleSec / max) * 100}%` }]} />
            </View>
            <Text style={styles.value}>{fmtSpan(it.cycleSec)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  empty: { padding: 24, color: '#9ca3af', textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 20, flexWrap: 'wrap' },
  stat: { gap: 1 },
  statValue: { fontSize: 16, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, color: '#9ca3af' },
  bars: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { width: 170, fontSize: 12, color: '#374151' },
  track: { flex: 1, height: 14, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  fill: { height: 14, backgroundColor: '#3b82f6', borderRadius: 3 },
  value: { width: 48, fontSize: 12, color: '#6b7280', textAlign: 'right', fontVariant: ['tabular-nums'] },
});
