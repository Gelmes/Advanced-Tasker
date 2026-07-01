import { create } from 'zustand';
import type { Mode, ProjectFile, TaskNode } from '../model/types';
import { createEmptyProject, nowIso } from '../model/factory';
import {
  adjacentVisible,
  cloneNode,
  cloneProject,
  cycleValue,
  deleteNode,
  findNode,
  insertSubtreeAfter,
  reassignIds,
  indent,
  insertSiblingAfter,
  isEmpty,
  locate,
  moveNodeRelative,
  moveWithinSiblings,
  outdent,
  visibleNodes,
  setCollapsed,
  setContent,
  setStatus,
  setStoryPoints,
  touch,
  walk,
  type DropWhere,
} from '../model/tree';
import { newId } from '../model/ids';
import { DEFAULT_STATUS_KIND } from '../model/defaults';
import { toggleWrap } from '../markdown/inline';
import { bankTime } from '../model/time';
import { scrollRowIntoView } from '../rowRegistry';
import { flattenForIndex, type IndexEntry } from '../model/searchIndex';
import type { StatusDef } from '../model/types';
import {
  openProject as openProjectFile,
  saveProject as saveProjectToHandle,
  saveProjectAs as saveProjectAsFile,
  type FileRef,
} from '../persistence/file';
import {
  createProjectFile,
  listProjects,
  pickDirectory,
  readProjectFromRef,
  uniqueFileName,
  type ProjectRef,
} from '../persistence/directory';
import {
  ensurePermission,
  findFolderByHandle,
  getFolder,
  hasPermission,
  listFolders,
  putFolder,
  removeFolder,
  type FolderEntry,
} from '../persistence/handleStore';

// Global app state: the project tree, transient UI state (selection + mode), and
// the bound file. Structural changes go through pure ops in model/tree.ts via the
// private `apply` helper, which clones the project so React sees new references.

/** A copied/cut node subtree held for pasting (SPEC.md §3). */
export interface ClipboardItem {
  node: TaskNode;
  mode: 'copy' | 'cut';
}

export interface AppState {
  project: ProjectFile;
  selectedId: string | null;
  mode: Mode;
  /** Node subtree on the internal clipboard, or null. */
  clipboard: ClipboardItem | null;

  // Bound file / save status
  fileHandle: FileRef | null;
  fileName: string | null;
  dirty: boolean;
  saving: boolean;
  error: string | null;

  /** Undo/redo snapshot stacks (most recent at the end of `past`). */
  past: ProjectFile[];
  future: ProjectFile[];

  // Workspace: a folder of .json projects (SPEC.md §5)
  workspaceDir: FileRef | null;
  workspaceName: string | null;
  /** Remembered folders for the sidebar switcher. */
  folders: FolderEntry[];
  currentFolderId: string | null;
  projects: ProjectRef[];
  /** Cross-file search index for the current folder (all files). */
  folderIndex: IndexEntry[];
  indexing: boolean;
  /** File names of projects open as tabs, in tab order. */
  openTabs: string[];
  sidebarOpen: boolean;
  /** Vim-style navigation keys (hjkl, gg/G, Ctrl-d/u, i/a/o). Persisted. */
  vimNav: boolean;
  /** Which sidebar view is showing. */
  sidebarTab: 'projects' | 'search';
  /** Search/tag-filter query for the sidebar search view. */
  tagQuery: string;
  helpOpen: boolean;
  detailsOpen: boolean;

  // Selection / mode
  select: (id: string | null) => void;
  setMode: (mode: Mode) => void;
  setVimNav: (on: boolean) => void;
  moveSelection: (dir: -1 | 1) => void;
  /** Move the selection by N visible rows (vim Ctrl-d/u). */
  moveSelectionBy: (delta: number) => void;
  /** Select the first/last visible node (vim gg / G). */
  selectEdge: (edge: 'first' | 'last') => void;
  collapseSelected: (collapsed: boolean) => void;
  toggleCollapseFor: (id: string) => void;
  editSelected: () => void;

  // Structural edits (operate on the selected node)
  newSibling: () => void;
  indentSelected: () => void;
  outdentSelected: () => void;
  moveSelected: (dir: -1 | 1) => void;
  deleteSelected: () => void;
  backspaceEmpty: () => void;
  setNodeContent: (id: string, content: string) => void;
  /** Toggle wrapping the selected node's content in a markdown marker. */
  toggleEmphasisSelected: (marker: string) => void;
  setProjectName: (name: string) => void;
  setDueDateFor: (id: string, dueDate: string | null) => void;
  moveNode: (dragId: string, targetId: string, where: DropWhere) => void;

  // Clipboard (copy/cut/paste a node subtree)
  copySelected: () => void;
  cutSelected: () => void;
  pasteAfterSelected: () => void;
  undo: () => void;
  redo: () => void;

  // Status & story points (dir +1 forward, -1 backward)
  cycleStatusFor: (id: string, dir?: 1 | -1) => void;
  cycleStatusSelected: (dir?: 1 | -1) => void;
  setStatusFor: (id: string, status: string | null) => void;
  cyclePointsFor: (id: string, dir?: 1 | -1) => void;
  cyclePointsSelected: (dir?: 1 | -1) => void;
  setPointsFor: (id: string, points: number | null) => void;

  // Timer (single active node, SPEC.md §2)
  toggleTimerFor: (id: string) => void;
  toggleTimerSelected: () => void;
  /** Overwrite a node's banked effort (seconds) — e.g. trim a runaway timer. */
  setEffortFor: (id: string, seconds: number) => void;

  // Status configuration (SPEC.md §2 — fully user-configurable)
  addStatus: () => void;
  updateStatus: (id: string, patch: Partial<Omit<StatusDef, 'id'>>) => void;
  removeStatus: (id: string) => void;
  /** Reorder a status up (-1) or down (+1) — also changes the S-key cycle order. */
  moveStatus: (id: string, dir: -1 | 1) => void;

  // Files / single project
  newProject: () => void;
  loadProject: (project: ProjectFile, handle: FileRef | null, fileName: string | null) => void;
  openProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;

  setHelpOpen: (open: boolean) => void;
  toggleDetails: () => void;

  setSidebarTab: (tab: 'projects' | 'search') => void;
  setTagQuery: (q: string) => void;
  /** Open the sidebar search filtered to a tag (clicked from a node). */
  searchTag: (tag: string) => void;
  /** Select a node and expand its ancestors so it's visible. */
  revealNode: (id: string) => void;

  // Workspace (folder) actions
  toggleSidebar: () => void;
  openFolder: () => Promise<void>;
  refreshFolders: () => Promise<void>;
  switchFolder: (id: string) => Promise<void>;
  forgetFolder: (id: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  switchProject: (fileName: string) => Promise<void>;
  newProjectInFolder: () => Promise<void>;
  closeTab: (fileName: string) => void;
  restoreWorkspace: () => Promise<void>;
  rebuildFolderIndex: () => Promise<void>;
  openSearchResult: (fileName: string, id: string) => Promise<void>;
}

const VIM_KEY = 'advanced-tasker:vimNav';
function readVimNav(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(VIM_KEY) === '1';
  } catch {
    return false;
  }
}

export const useStore = create<AppState>((set, get) => {
  // --- Undo/redo history ------------------------------------------------------
  // Each committed mutation pushes the *previous* project onto `past`. Because
  // every mutation produces a brand-new immutable project object, history just
  // holds references (no extra cloning). Rapid same-target edits (typing) are
  // coalesced into a single step via a tag + time window.
  const HISTORY_LIMIT = 100;
  const COALESCE_MS = 600;
  let histTag: string | null = null;
  let histAt = 0;

  const recordHistory = (tag: string | null) => {
    const now = Date.now();
    const coalesce = tag != null && tag === histTag && now - histAt < COALESCE_MS;
    histTag = tag;
    histAt = now;
    if (coalesce) {
      set({ future: [] });
      return;
    }
    set({ past: [...get().past, get().project].slice(-HISTORY_LIMIT), future: [] });
  };

  /** Mutate the tree without recording history (e.g. collapse/expand). */
  const applySilent = (fn: (root: ProjectFile['root']['children']) => void) => {
    const next = cloneProject(get().project);
    fn(next.root.children);
    set({ project: next, dirty: true });
  };

  /** Clone the project, run a mutation on its root children, commit + mark dirty. */
  const apply = (
    fn: (root: ProjectFile['root']['children']) => void,
    tag: string | null = null,
  ) => {
    recordHistory(tag);
    applySilent(fn);
  };

  /** Like `apply` but for edits that touch the project itself (e.g. statuses). */
  const applyProject = (
    fn: (project: ProjectFile) => void,
    tag: string | null = null,
  ) => {
    recordHistory(tag);
    const next = cloneProject(get().project);
    fn(next);
    set({ project: next, dirty: true });
  };

  /** Reset undo history (called when a different document is loaded). */
  const resetHistory = () => {
    histTag = null;
    histAt = 0;
    set({ past: [], future: [] });
  };

  // --- Status-history capture (SPEC.md §6) ------------------------------------
  // Records settled status transitions for analytics. Rapid changes within the
  // settle window coalesce (the in-burst entry is replaced), and a burst that
  // lands back on the pre-burst status leaves nothing behind (no-op collapse).
  const STATUS_SETTLE_MS = 3000;
  let stNode: string | null = null;
  let stAt = 0;
  let stPrev: string | null = null;
  let stPushed = false;

  const recordStatusChange = (
    node: ProjectFile['root']['children'][number],
    before: string | null,
    newStatus: string | null,
  ) => {
    if (!node.statusHistory) node.statusHistory = [];
    const now = Date.now();
    const inBurst = stNode === node.id && now - stAt < STATUS_SETTLE_MS;
    stAt = now;
    stNode = node.id;
    if (!inBurst) {
      stPrev = before; // status before this burst started
      stPushed = false;
    }
    if (stPushed) {
      node.statusHistory.pop(); // drop the previous in-burst entry; re-decide below
      stPushed = false;
    }
    if (newStatus != null && newStatus !== stPrev) {
      node.statusHistory.push({ at: new Date(now).toISOString(), status: newStatus });
      stPushed = true;
    }
  };

  /** Apply a status change to a node and log the (settled) transition. */
  const applyStatusChange = (id: string, newStatus: string | null) => {
    apply((root) => {
      const node = findNode(root, id);
      if (!node) return;
      const before = node.status;
      setStatus(root, id, newStatus);
      // Stamp the status-specific clock so sync merges `status` independently of
      // `updatedAt` (which any edit bumps). See SYNC.md "per-field status".
      if (newStatus !== before) node.statusUpdatedAt = nowIso();
      recordStatusChange(node, before, newStatus);
    });
  };

  /** Update the current folder's entry (open tabs + last-active + recency) for reopen. */
  const persistCurrentFolder = async () => {
    const { currentFolderId, workspaceDir, workspaceName, fileName, openTabs } = get();
    if (!currentFolderId || !workspaceDir) return;
    await putFolder({
      id: currentFolderId,
      name: workspaceName ?? 'Workspace',
      dirHandle: workspaceDir,
      lastActive: fileName,
      openTabs,
      lastOpened: Date.now(),
    });
    await get().refreshFolders();
  };

  /** Load a folder's projects, restore its tabs, and focus the last-active project. */
  const enterFolder = async (entry: FolderEntry) => {
    const projects = await listProjects(entry.dirHandle);
    const available = new Set(projects.map((p) => p.fileName));
    // Restore previously-open tabs that still exist in the folder.
    const tabs = (entry.openTabs ?? []).filter((t) => available.has(t));
    set({
      workspaceDir: entry.dirHandle,
      workspaceName: entry.name,
      currentFolderId: entry.id,
      projects,
      openTabs: tabs,
      sidebarOpen: true,
      error: null,
    });
    const target =
      projects.find((p) => p.fileName === entry.lastActive) ?? projects[0];
    if (target) await get().switchProject(target.fileName);
    else await persistCurrentFolder();
    await get().rebuildFolderIndex();
  };

  /** Save the current project first if it has unsaved changes and a bound file. */
  const saveIfDirty = async () => {
    if (get().dirty && get().fileHandle) await get().saveProject();
  };

  return {
    project: createEmptyProject('Untitled'),
    selectedId: null,
    mode: 'selected',
    clipboard: null,

    fileHandle: null,
    fileName: null,
    dirty: false,
    saving: false,
    error: null,

    past: [],
    future: [],

    workspaceDir: null,
    workspaceName: null,
    folders: [],
    currentFolderId: null,
    projects: [],
    folderIndex: [],
    indexing: false,
    openTabs: [],
    sidebarOpen: false,
    vimNav: readVimNav(),
    sidebarTab: 'projects',
    tagQuery: '',
    helpOpen: false,
    detailsOpen: false,

    select: (id) => set({ selectedId: id }),
    setMode: (mode) => set({ mode }),

    setVimNav: (on) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(VIM_KEY, on ? '1' : '0');
      } catch {
        // ignore storage failures
      }
      set({ vimNav: on });
    },

    moveSelection: (dir) => {
      const { project, selectedId } = get();
      const order = project.root.children;
      if (!selectedId) {
        const first = order[0]?.id ?? null;
        if (first) {
          set({ selectedId: first });
          scrollRowIntoView(first, 'nearest');
        }
        return;
      }
      const next = adjacentVisible(order, selectedId, dir);
      if (next) {
        set({ selectedId: next });
        scrollRowIntoView(next, 'nearest');
      }
    },

    moveSelectionBy: (delta) => {
      const { project, selectedId } = get();
      const order = visibleNodes(project.root.children);
      if (!order.length) return;
      const cur = selectedId ? order.findIndex((n) => n.id === selectedId) : -1;
      const from = cur < 0 ? (delta > 0 ? -1 : order.length) : cur;
      const id = order[Math.min(order.length - 1, Math.max(0, from + delta))].id;
      set({ selectedId: id });
      scrollRowIntoView(id, 'nearest');
    },

    selectEdge: (edge) => {
      const order = visibleNodes(get().project.root.children);
      if (!order.length) return;
      const id = (edge === 'first' ? order[0] : order[order.length - 1]).id;
      set({ selectedId: id });
      scrollRowIntoView(id, 'center');
    },

    collapseSelected: (collapsed) => {
      const { selectedId } = get();
      if (!selectedId) return;
      applySilent((root) => setCollapsed(root, selectedId, collapsed));
    },

    toggleCollapseFor: (id) => {
      const node = findNode(get().project.root.children, id);
      if (!node) return;
      applySilent((root) => setCollapsed(root, id, !node.collapsed));
    },

    editSelected: () => {
      if (get().selectedId) set({ mode: 'editing' });
    },

    newSibling: () => {
      const { selectedId } = get();
      let newId = '';
      apply((root) => {
        newId = insertSiblingAfter(root, selectedId);
      });
      set({ selectedId: newId, mode: 'editing' });
    },

    indentSelected: () => {
      const { selectedId } = get();
      if (selectedId) apply((root) => indent(root, selectedId));
    },

    outdentSelected: () => {
      const { selectedId } = get();
      if (selectedId) apply((root) => outdent(root, selectedId));
    },

    moveSelected: (dir) => {
      const { selectedId } = get();
      if (selectedId) apply((root) => moveWithinSiblings(root, selectedId, dir));
    },

    deleteSelected: () => {
      const { selectedId } = get();
      if (!selectedId) return;
      let nextSel: string | null = null;
      apply((root) => {
        nextSel = deleteNode(root, selectedId);
      });
      set({ selectedId: nextSel, mode: 'selected' });
    },

    backspaceEmpty: () => {
      const { selectedId, project } = get();
      if (!selectedId) return;
      const node = findNode(project.root.children, selectedId);
      if (!node || !isEmpty(node)) return;
      let nextSel: string | null = null;
      apply((root) => {
        nextSel = deleteNode(root, selectedId);
      });
      // Stay in editing so the caret lands in the previous row.
      set({ selectedId: nextSel, mode: nextSel ? 'editing' : 'selected' });
    },

    setNodeContent: (id, content) =>
      apply((root) => setContent(root, id, content), `content:${id}`),

    undo: () => {
      const { past, future, project, selectedId } = get();
      if (!past.length) return;
      const previous = past[past.length - 1];
      const keepSel =
        selectedId && findNode(previous.root.children, selectedId) ? selectedId : null;
      set({
        project: previous,
        past: past.slice(0, -1),
        future: [project, ...future].slice(0, HISTORY_LIMIT),
        selectedId: keepSel,
        mode: 'selected',
        dirty: true,
      });
      histTag = null;
    },

    redo: () => {
      const { past, future, project, selectedId } = get();
      if (!future.length) return;
      const nextProject = future[0];
      const keepSel =
        selectedId && findNode(nextProject.root.children, selectedId) ? selectedId : null;
      set({
        project: nextProject,
        future: future.slice(1),
        past: [...past, project].slice(-HISTORY_LIMIT),
        selectedId: keepSel,
        mode: 'selected',
        dirty: true,
      });
      histTag = null;
    },

    toggleEmphasisSelected: (marker) => {
      const { selectedId, project } = get();
      if (!selectedId) return;
      const node = findNode(project.root.children, selectedId);
      if (!node) return;
      const next = toggleWrap(node.content, marker);
      apply((root) => setContent(root, selectedId, next));
    },

    setProjectName: (name) => {
      applyProject((project) => {
        project.name = name;
      }, 'name');
      // Keep the sidebar label for the active project in sync.
      const { fileName } = get();
      if (fileName) {
        set({
          projects: get().projects.map((p) =>
            p.fileName === fileName ? { ...p, name } : p,
          ),
        });
      }
    },

    setDueDateFor: (id, dueDate) =>
      apply((root) => {
        const node = findNode(root, id);
        if (node) {
          node.dueDate = dueDate || null;
          touch(node);
        }
      }, `due:${id}`),

    moveNode: (dragId, targetId, where) => {
      apply((root) => moveNodeRelative(root, dragId, targetId, where));
      set({ selectedId: dragId });
    },

    copySelected: () => {
      const { selectedId, project } = get();
      if (!selectedId) return;
      const node = findNode(project.root.children, selectedId);
      if (node) set({ clipboard: { node: cloneNode(node), mode: 'copy' } });
    },

    cutSelected: () => {
      const { selectedId, project } = get();
      if (!selectedId) return;
      const node = findNode(project.root.children, selectedId);
      if (!node) return;
      const snapshot = cloneNode(node);
      let nextSel: string | null = null;
      apply((root) => {
        nextSel = deleteNode(root, selectedId);
      });
      set({ clipboard: { node: snapshot, mode: 'cut' }, selectedId: nextSel, mode: 'selected' });
    },

    pasteAfterSelected: () => {
      const clip = get().clipboard;
      if (!clip) return;
      const subtree = cloneNode(clip.node);
      reassignIds(subtree);
      // A copy is a fresh duplicate: drop tracked time + lifecycle history (seed a
      // single status entry at paste-time) so analytics aren't double-counted. A
      // cut keeps everything — it's the same work relocated.
      if (clip.mode === 'copy') {
        const ts = nowIso();
        const reset = (n: TaskNode) => {
          n.time = { accumulatedSeconds: 0, startedAt: null };
          n.statusHistory = n.status ? [{ at: ts, status: n.status }] : [];
          n.statusUpdatedAt = n.status ? ts : null;
          n.createdAt = ts;
          n.updatedAt = ts;
          n.children.forEach(reset);
        };
        reset(subtree);
      }
      const { selectedId } = get();
      apply((root) => insertSubtreeAfter(root, selectedId, subtree));
      set({ selectedId: subtree.id, mode: 'selected' });
    },

    cycleStatusFor: (id, dir = 1) => {
      const { project } = get();
      const node = findNode(project.root.children, id);
      if (!node) return;
      const next = cycleValue(
        node.status,
        project.statuses.map((s) => s.id),
        dir,
      );
      applyStatusChange(id, next);
    },

    cycleStatusSelected: (dir = 1) => {
      const { selectedId } = get();
      if (selectedId) get().cycleStatusFor(selectedId, dir);
    },

    setStatusFor: (id, status) => applyStatusChange(id, status),

    cyclePointsFor: (id, dir = 1) => {
      const { project } = get();
      const node = findNode(project.root.children, id);
      if (!node) return;
      const next = cycleValue(node.storyPoints, project.pointScale, dir);
      apply((root) => setStoryPoints(root, id, next));
    },

    cyclePointsSelected: (dir = 1) => {
      const { selectedId } = get();
      if (selectedId) get().cyclePointsFor(selectedId, dir);
    },

    setPointsFor: (id, points) => apply((root) => setStoryPoints(root, id, points)),

    toggleTimerFor: (id) => {
      const nowMs = Date.now();
      applyProject((project) => {
        const target = findNode(project.root.children, id);
        if (!target) return;
        const active = project.activeTimerNodeId;
        if (active === id) {
          bankTime(target, nowMs); // stop & bank
          project.activeTimerNodeId = null;
        } else {
          if (active) {
            const prev = findNode(project.root.children, active);
            if (prev) {
              bankTime(prev, nowMs); // only one runs at a time
              touch(prev);
            }
          }
          target.time.startedAt = new Date(nowMs).toISOString();
          project.activeTimerNodeId = id;
        }
        touch(target); // bump for per-node LWW sync of the `time` field
      });
    },

    toggleTimerSelected: () => {
      const { selectedId } = get();
      if (selectedId) get().toggleTimerFor(selectedId);
    },

    setEffortFor: (id, seconds) =>
      applyProject((project) => {
        const node = findNode(project.root.children, id);
        if (!node) return;
        node.time.accumulatedSeconds = Math.max(0, Math.round(seconds));
        // If the timer is live, restart its run from now so the edited total is
        // exact at this instant and keeps counting forward from the new value.
        if (node.time.startedAt) node.time.startedAt = new Date(Date.now()).toISOString();
        touch(node);
      }, `effort:${id}`),

    addStatus: () =>
      applyProject((project) => {
        project.statuses.push({
          id: newId(),
          label: 'New status',
          color: '#a855f7',
          kind: DEFAULT_STATUS_KIND,
        });
      }),

    updateStatus: (id, patch) =>
      applyProject((project) => {
        const s = project.statuses.find((x) => x.id === id);
        if (s) Object.assign(s, patch);
      }),

    removeStatus: (id) =>
      applyProject((project) => {
        project.statuses = project.statuses.filter((s) => s.id !== id);
        // Demote any tasks that referenced the removed status back to notes.
        walk(project.root.children, (n) => {
          if (n.status === id) n.status = null;
        });
      }),

    moveStatus: (id, dir) =>
      applyProject((project) => {
        const arr = project.statuses;
        const i = arr.findIndex((s) => s.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= arr.length) return;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }),

    newProject: () => {
      resetHistory();
      set({
        project: createEmptyProject('Untitled'),
        selectedId: null,
        mode: 'selected',
        fileHandle: null,
        fileName: null,
        dirty: false,
        error: null,
      });
    },

    loadProject: (project, handle, fileName) => {
      const openTabs =
        fileName && !get().openTabs.includes(fileName)
          ? [...get().openTabs, fileName]
          : get().openTabs;
      // Snapshot the file we're leaving into the index so cross-file search stays
      // fresh with its in-memory edits.
      const outName = get().fileName;
      const outProject = get().project;
      const folderIndex = outName
        ? [
            ...get().folderIndex.filter((e) => e.fileName !== outName),
            ...flattenForIndex(outProject.root.children, outName, outProject.name),
          ]
        : get().folderIndex;
      resetHistory();
      set({
        project,
        selectedId: null,
        mode: 'selected',
        fileHandle: handle,
        fileName,
        dirty: false,
        error: null,
        openTabs,
        folderIndex,
      });
    },

    openProject: async () => {
      try {
        const result = await openProjectFile();
        if (!result) return;
        get().loadProject(result.project, result.handle, result.fileName);
      } catch (e: any) {
        if (e?.name === 'AbortError') return; // user cancelled the picker
        set({ error: e?.message ?? 'Failed to open file.' });
      }
    },

    saveProject: async () => {
      const { fileHandle, project } = get();
      if (!fileHandle) return get().saveProjectAs();
      set({ saving: true, error: null });
      try {
        await saveProjectToHandle(fileHandle, project);
        set({ dirty: false });
      } catch (e: any) {
        set({ error: e?.message ?? 'Failed to save file.' });
      } finally {
        set({ saving: false });
      }
    },

    saveProjectAs: async () => {
      const { project, fileName } = get();
      set({ saving: true, error: null });
      try {
        const result = await saveProjectAsFile(
          project,
          fileName ?? `${project.name || 'project'}.json`,
        );
        if (result) {
          set({ fileHandle: result.handle, fileName: result.fileName, dirty: false });
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') set({ error: e?.message ?? 'Failed to save file.' });
      } finally {
        set({ saving: false });
      }
    },

    setHelpOpen: (open) => set({ helpOpen: open }),
    toggleDetails: () => set({ detailsOpen: !get().detailsOpen }),

    setSidebarTab: (tab) => set({ sidebarTab: tab }),
    setTagQuery: (q) => set({ tagQuery: q }),
    searchTag: (tag) =>
      set({ sidebarOpen: true, sidebarTab: 'search', tagQuery: `#${tag}` }),

    revealNode: (id) => {
      const path = locate(get().project.root.children, id);
      if (!path) return;
      // Expand every ancestor so the node is visible.
      const collapsedAncestor = path
        .slice(0, -1)
        .some((l) => l.siblings[l.index].collapsed);
      if (collapsedAncestor) {
        applySilent((root) => {
          const p = locate(root, id);
          if (!p) return;
          for (let i = 0; i < p.length - 1; i++) p[i].siblings[p[i].index].collapsed = false;
        });
      }
      set({ selectedId: id, mode: 'selected' });
      // Scroll to the row once it has (re)rendered.
      const raf = (globalThis as any).requestAnimationFrame as
        | ((cb: () => void) => void)
        | undefined;
      if (raf) raf(() => raf(() => scrollRowIntoView(id)));
      else setTimeout(() => scrollRowIntoView(id), 50);
    },

    toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

    openFolder: async () => {
      try {
        await saveIfDirty();
        const dir = await pickDirectory();
        const existing = await findFolderByHandle(dir);
        const entry: FolderEntry = {
          id: existing?.id ?? newId(),
          name: dir.name ?? 'Workspace',
          dirHandle: dir,
          lastActive: existing?.lastActive ?? null,
          openTabs: existing?.openTabs,
          lastOpened: Date.now(),
        };
        await putFolder(entry);
        await get().refreshFolders();
        await enterFolder(entry);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        set({ error: e?.message ?? 'Failed to open folder.' });
      }
    },

    refreshFolders: async () => {
      set({ folders: await listFolders() });
    },

    switchFolder: async (id) => {
      if (id === get().currentFolderId) return;
      try {
        const entry = await getFolder(id);
        if (!entry) return;
        if (!(await ensurePermission(entry.dirHandle))) {
          set({ error: 'Permission to the folder was denied.' });
          return;
        }
        await saveIfDirty();
        await enterFolder(entry); // restores that folder's own tabs
      } catch (e: any) {
        set({ error: e?.message ?? 'Failed to open folder.' });
      }
    },

    forgetFolder: async (id) => {
      await removeFolder(id);
      await get().refreshFolders();
      if (id === get().currentFolderId) {
        set({ workspaceDir: null, workspaceName: null, currentFolderId: null, projects: [] });
      }
    },

    refreshProjects: async () => {
      const { workspaceDir } = get();
      if (workspaceDir) set({ projects: await listProjects(workspaceDir) });
    },

    switchProject: async (fileName) => {
      const ref = get().projects.find((p) => p.fileName === fileName);
      if (!ref) return;
      try {
        await saveIfDirty();
        const project = await readProjectFromRef(ref);
        get().loadProject(project, ref.handle, ref.fileName);
        await persistCurrentFolder();
      } catch (e: any) {
        set({ error: e?.message ?? 'Failed to open project.' });
      }
    },

    newProjectInFolder: async () => {
      const { workspaceDir, projects } = get();
      if (!workspaceDir) {
        get().newProject(); // no folder open — fall back to an in-memory project
        return;
      }
      try {
        await saveIfDirty();
        const fileName = uniqueFileName(projects);
        const project = createEmptyProject('Untitled');
        const ref = await createProjectFile(workspaceDir, fileName, project);
        set({ projects: [...projects, ref].sort((a, b) => a.name.localeCompare(b.name)) });
        get().loadProject(project, ref.handle, ref.fileName);
        await persistCurrentFolder();
      } catch (e: any) {
        set({ error: e?.message ?? 'Failed to create project.' });
      }
    },

    closeTab: (fileName) => {
      const { openTabs, fileName: active } = get();
      const index = openTabs.indexOf(fileName);
      const remaining = openTabs.filter((t) => t !== fileName);
      set({ openTabs: remaining });
      if (fileName !== active) {
        void persistCurrentFolder(); // remember the reduced tab set
        return;
      }
      // Closing the active tab: focus a neighbour, or fall back to a blank project.
      if (remaining.length) {
        const next = remaining[Math.min(index, remaining.length - 1)];
        void get().switchProject(next); // persists
      } else {
        get().newProject();
        void persistCurrentFolder();
      }
    },

    restoreWorkspace: async () => {
      try {
        await get().refreshFolders();
        // Reopen the most-recent folder silently — never prompt on startup.
        for (const entry of get().folders) {
          if (await hasPermission(entry.dirHandle)) {
            await enterFolder(entry);
            return;
          }
        }
        // None auto-restored (e.g. a browser reset folder permission). Show the
        // sidebar so the remembered folder is one click away.
        if (get().folders.length) set({ sidebarOpen: true });
      } catch {
        // A failed restore is non-fatal; the user can open a folder manually.
      }
    },

    rebuildFolderIndex: async () => {
      const { projects } = get();
      if (!projects.length) {
        set({ folderIndex: [] });
        return;
      }
      set({ indexing: true });
      try {
        const all: IndexEntry[] = [];
        for (const ref of projects) {
          try {
            const proj = await readProjectFromRef(ref);
            all.push(...flattenForIndex(proj.root.children, ref.fileName, proj.name || ref.name));
          } catch {
            // skip files we can't read/parse
          }
        }
        set({ folderIndex: all });
      } finally {
        set({ indexing: false });
      }
    },

    openSearchResult: async (fileName, id) => {
      if (fileName && fileName !== get().fileName) {
        await get().switchProject(fileName);
      }
      get().revealNode(id);
    },
  };
});
