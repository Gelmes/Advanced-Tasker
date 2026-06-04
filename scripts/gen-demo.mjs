// Generates examples/sprint-demo.json — a realistic 2-week sprint with status
// history, so the charts work (burnup / cycle-time / burndown) has data to read.
// Deterministic (fixed dates). Run: node scripts/gen-demo.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../examples/sprint-demo.json');

const statuses = [
  { id: 'todo', label: 'To Do', color: '#888888', kind: 'todo' },
  { id: 'doing', label: 'Doing', color: '#3b82f6', kind: 'active' },
  { id: 'blocked', label: 'Blocked', color: '#ef4444', kind: 'active' },
  { id: 'done', label: 'Done', color: '#22c55e', kind: 'done' },
];

let seq = 0;
const id = () => `n${++seq}`;
const iso = (local) => new Date(`${local}Z`).toISOString(); // local: 'YYYY-MM-DDTHH:MM:SS'
const h = (at, status) => ({ at, status });

function task(content, points, createdAt, history, hours, children = []) {
  const status = history.length ? history[history.length - 1].status : null;
  const created = iso(createdAt);
  const updated = history.length ? iso(history[history.length - 1].at) : created;
  return {
    id: id(),
    content,
    status,
    storyPoints: points,
    time: { accumulatedSeconds: Math.round(hours * 3600), startedAt: null },
    statusHistory: history.map((e) => ({ at: iso(e.at), status: e.status })),
    collapsed: false,
    createdAt: created,
    updatedAt: updated,
    children,
  };
}

const tasks = [
  task('Set up CI pipeline', 3, '2026-05-19T09:00:00', [
    h('2026-05-19T09:30:00', 'doing'),
    h('2026-05-20T11:00:00', 'done'),
  ], 3),
  task('Auth API', 5, '2026-05-19T09:05:00', [
    h('2026-05-20T10:00:00', 'doing'),
    h('2026-05-23T16:00:00', 'done'),
  ], 9),
  task('Login UI', 3, '2026-05-19T09:10:00', [
    h('2026-05-23T09:00:00', 'doing'),
    h('2026-05-24T15:00:00', 'done'),
  ], 5),
  task('DB schema', 5, '2026-05-19T09:15:00', [
    h('2026-05-21T09:00:00', 'doing'),
    h('2026-05-22T17:00:00', 'done'),
  ], 6),
  task('Profile page', 8, '2026-05-22T10:00:00', [
    h('2026-05-22T10:00:00', 'todo'),
    h('2026-05-26T09:00:00', 'doing'),
    h('2026-05-29T16:00:00', 'done'),
  ], 14, [
    // a note captured while working (status null, excluded from analytics)
    task('Designs approved by Sam — see Figma frame 12', null, '2026-05-26T09:30:00', [], 0),
  ]),
  task('Settings screen', 3, '2026-05-22T10:05:00', [
    h('2026-05-27T09:00:00', 'doing'),
    h('2026-05-28T13:00:00', 'blocked'),
    h('2026-05-30T09:00:00', 'doing'),
    h('2026-05-31T15:00:00', 'done'),
  ], 7),
  task('Search', 8, '2026-05-25T12:00:00', [
    h('2026-05-30T09:00:00', 'doing'),
    h('2026-06-02T14:00:00', 'done'),
  ], 11),
  task('Notifications', 5, '2026-05-26T12:00:00', [
    h('2026-05-26T12:00:00', 'todo'),
    h('2026-06-01T09:00:00', 'doing'),
  ], 4), // in progress, not done
  task('Billing integration', 13, '2026-05-28T12:00:00', [
    h('2026-05-28T12:00:00', 'todo'),
  ], 0), // not started
  task('Bug: logout crash', 2, '2026-06-01T08:00:00', [
    h('2026-06-01T08:30:00', 'doing'),
    h('2026-06-01T12:00:00', 'done'),
    h('2026-06-02T09:00:00', 'doing'), // reopened
    h('2026-06-03T10:00:00', 'done'),
  ], 2),
];

const epic = task('Sprint 24 — Core App', null, '2026-05-19T08:00:00', [
  h('2026-05-19T08:00:00', 'doing'),
], 0, tasks);

const project = {
  version: 1,
  name: 'Sprint 24 — Demo',
  statuses,
  pointScale: [1, 2, 3, 5, 8, 13],
  activeTimerNodeId: null,
  root: { children: [epic] },
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(project, null, 2) + '\n');
const leaves = tasks.length;
console.log(`Wrote ${out} — 1 epic, ${leaves} tasks (+1 note).`);
