import { newId } from './ids';
import {
  DEFAULT_POINT_SCALE,
  DEFAULT_STATUSES,
  FILE_VERSION,
} from './defaults';
import { ensureOrderKeys } from './orderKey';
import type { ProjectFile, TaskNode } from './types';

export function nowIso(): string {
  return new Date().toISOString();
}

/** A fresh node — created as a plain note (no status), per SPEC.md §2. */
export function createNode(content = ''): TaskNode {
  const ts = nowIso();
  return {
    id: newId(),
    content,
    status: null,
    storyPoints: null,
    time: { intervals: [], startedAt: null },
    statusHistory: [],
    dueDate: null,
    collapsed: false,
    createdAt: ts,
    updatedAt: ts,
    children: [],
  };
}

export function createEmptyProject(name = 'Untitled'): ProjectFile {
  return {
    version: FILE_VERSION,
    id: newId(),
    name,
    statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
    pointScale: [...DEFAULT_POINT_SCALE],
    activeTimerNodeId: null,
    root: { children: [] },
  };
}

/** A small seeded project so the outline has something to render in dev. */
export function createSampleProject(): ProjectFile {
  const project = createEmptyProject('Advanced Tasker — Demo');

  const make = (
    content: string,
    overrides: Partial<TaskNode> = {},
  ): TaskNode => ({ ...createNode(content), ...overrides });

  const top = make('Build Advanced Tasker', {
    status: 'doing',
    storyPoints: 13,
    children: [
      make('Scaffold Expo web app', { status: 'done', storyPoints: 3 }),
      make('Keyboard core', {
        status: 'doing',
        storyPoints: 5,
        children: [
          make('Modal selected/editing model', { status: 'doing' }),
          make('Indent / outdent with Tab', { status: 'todo' }),
          make('Remember: caret stays after Enter', {}), // a plain note
        ],
      }),
      make('Timer + rollups', { status: 'todo', storyPoints: 5 }),
    ],
  });

  project.root.children.push(top);
  ensureOrderKeys(project.root.children);
  return project;
}
