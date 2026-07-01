import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNow } from '../hooks/useNow';
import {
  completedAt,
  cycleTimeSeconds,
  leadTimeSeconds,
  startedAt,
  type KindOf,
} from '../model/lifecycle';
import { completion, computeRollup } from '../model/rollups';
import { elapsedSeconds, formatDuration, parseDuration } from '../model/time';
import { findNode } from '../model/tree';
import type { StatusDef, TaskNode } from '../model/types';
import { useStore } from '../store/useStore';

// Right-side panel showing the selected node's captured lifecycle data — the
// human-readable view of statusHistory + timer + rollups (SPEC.md §6).

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Coarser duration for multi-day spans (e.g. "3d 2h", "5h", "45m"). */
function fmtSpan(seconds: number | null): string {
  if (seconds == null) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 86400) return formatDuration(s);
  const days = Math.floor(s / 86400);
  const hours = Math.round((s % 86400) / 3600);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

/** A small ⓘ that shows `hint` as a native tooltip on hover (web). */
function Info({ hint }: { hint: string }) {
  return (
    <Text
      ref={(el) => {
        if (el) {
          try {
            (el as any).title = hint;
          } catch {
            // non-web targets have no title attribute
          }
        }
      }}
      style={styles.info}
    >
      ⓘ
    </Text>
  );
}

/**
 * Editable "Effort (timer)" field. Shows the live elapsed time, but becomes an
 * editable draft on focus so you can correct a runaway timer (e.g. one left
 * running after you walked away). Commits on Enter/blur; bad input reverts.
 */
function EffortField({ node, nowMs }: { node: TaskNode; nowMs: number }) {
  const setEffortFor = useStore((s) => s.setEffortFor);
  const [draft, setDraft] = useState<string | null>(null);
  const display = formatDuration(elapsedSeconds(node, nowMs));

  const commit = () => {
    if (draft != null) {
      const secs = parseDuration(draft);
      if (secs != null) setEffortFor(node.id, secs);
    }
    setDraft(null);
  };

  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelWrap}>
        <Text style={styles.fieldLabel}>Effort (timer)</Text>
        <Info hint="Total time the start/stop timer ran on this task — not wall-clock. Click to edit and correct a runaway timer (e.g. 1h30m, 90m, 45s)." />
      </View>
      <TextInput
        style={[styles.fieldValue, styles.effortInput]}
        value={draft ?? display}
        onChangeText={setDraft}
        onFocus={() => setDraft(display)}
        onBlur={commit}
        onSubmitEditing={commit}
        selectTextOnFocus
        autoCapitalize="none"
      />
    </View>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Info hint={hint} /> : null}
      </View>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

export function TaskDetails() {
  const open = useStore((s) => s.detailsOpen);
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.selectedId);
  const setDueDateFor = useStore((s) => s.setDueDateFor);
  const nowMs = useNow();

  if (!open) return null;

  const node = selectedId ? findNode(project.root.children, selectedId) : null;
  const statuses = project.statuses;
  const kindOf: KindOf = (id) => statuses.find((s) => s.id === id)?.kind;
  const statusOf = (id: string | null): StatusDef | undefined =>
    id ? statuses.find((s) => s.id === id) : undefined;

  const status = node ? statusOf(node.status) : undefined;
  const doneIds = new Set(statuses.filter((s) => s.kind === 'done').map((s) => s.id));
  const rollup = node && node.children.length
    ? computeRollup(node, (id) => doneIds.has(id), nowMs)
    : null;
  const pct = rollup ? completion(rollup) : null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Details</Text>
      </View>

      {!node ? (
        <Text style={styles.empty}>Select a task to see its details.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.nodeTitle}>{node.content || 'Untitled'}</Text>

          <View style={styles.chips}>
            {status ? (
              <View style={[styles.chip, { backgroundColor: status.color + '22' }]}>
                <View style={[styles.dot, { backgroundColor: status.color }]} />
                <Text style={styles.chipText}>{status.label}</Text>
              </View>
            ) : (
              <View style={styles.chip}>
                <Text style={styles.chipText}>Note</Text>
              </View>
            )}
            {node.storyPoints != null && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{node.storyPoints} pt</Text>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Due date</Text>
            <TextInput
              style={styles.dueInput}
              value={node.dueDate ?? ''}
              onChangeText={(v) => setDueDateFor(node.id, v)}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.section}>
            <EffortField node={node} nowMs={nowMs} />
            <Field label="Created" value={fmtDate(node.createdAt)} />
            <Field
              label="Started"
              value={fmtDate(startedAt(node, kindOf))}
              hint="When work began — the first time this entered an Active status (e.g. Doing)."
            />
            <Field
              label="Done"
              value={fmtDate(completedAt(node, kindOf))}
              hint="When it was completed — the latest time it entered a Done status (cleared if reopened)."
            />
            <Field
              label="Cycle time"
              value={fmtSpan(cycleTimeSeconds(node, kindOf))}
              hint="Active work duration: from Started to Done. How long the task took once work began."
            />
            <Field
              label="Lead time"
              value={fmtSpan(leadTimeSeconds(node, kindOf))}
              hint="From Created to Done — includes time waiting in the backlog before work started."
            />
          </View>

          {rollup && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Subtree</Text>
              <Field label="Σ effort" value={formatDuration(rollup.seconds)} />
              <Field label="Σ points" value={String(rollup.points)} />
              <Field
                label="Completion"
                value={
                  pct == null
                    ? '—'
                    : `${Math.round(pct * 100)}%  (${rollup.doneCount}/${rollup.taskCount})`
                }
              />
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Status history</Text>
            {(node.statusHistory ?? []).length === 0 ? (
              <Text style={styles.empty}>No status changes yet.</Text>
            ) : (
              node.statusHistory.map((e, i) => {
                const s = statusOf(e.status);
                return (
                  <View key={i} style={styles.histRow}>
                    <View style={[styles.dot, { backgroundColor: s?.color ?? '#9ca3af' }]} />
                    <Text style={styles.histStatus}>{s?.label ?? e.status}</Text>
                    <Text style={styles.histAt}>{fmtDate(e.at)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 280,
    backgroundColor: '#fafafa',
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 13, fontWeight: '600', color: '#374151' },
  empty: { padding: 14, fontSize: 12, color: '#9ca3af' },
  body: { padding: 14, gap: 14 },
  nodeTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#eef2f7',
  },
  chipText: { fontSize: 12, color: '#374151' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  section: { gap: 6 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fieldLabel: { fontSize: 13, color: '#6b7280' },
  info: { fontSize: 11, color: '#9ca3af', cursor: 'help' } as any,
  fieldValue: { fontSize: 13, color: '#111827', fontVariant: ['tabular-nums'] },
  effortInput: {
    textAlign: 'right',
    minWidth: 70,
    padding: 0,
    outlineWidth: 0,
  } as any,
  dueInput: {
    fontSize: 13,
    color: '#111827',
    textAlign: 'right',
    minWidth: 110,
    padding: 0,
    outlineWidth: 0,
  } as any,
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  histStatus: { flex: 1, fontSize: 13, color: '#374151' },
  histAt: { fontSize: 12, color: '#9ca3af', fontVariant: ['tabular-nums'] },
});
