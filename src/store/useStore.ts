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
import { bankTime, setEffort } from '../model/time';
import { scrollRowIntoView } from '../rowRegistry';
import { flattenForIndex, type IndexEntry } from '../model/searchIndex';
import type { StatusDef } from '../model/types';
import {
  openProject as openProjectFile,
  parseProject,
  saveProject as saveProjectToHandle,
  saveProjectAs as saveProjectAsFile,
  type FileRef,
} from '../persistence/file';
import {
  availableFileName,
  createProjectFile,
  deleteProjectFile,
  listProjects,
  pickDirectory,
  readProjectFromRef,
  renameProjectFileOnDisk,
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
import { getStoredToken, storeToken } from '../persistence/secretStore';
import { paneScroll } from '../paneScroll';
import { applyLocalView, fingerprint } from '../sync/project';

// Global app state: the project tree, transient UI state (selection + mode), and
// the bound file. Structural changes go through pure ops in model/tree.ts via the
// private `apply` helper, which clones the project so React sees new references.

/** A copied/cut node subtree held for pasting (SPEC.md §3). */
export interface ClipboardItem {
  node: TaskNode;
  mode: 'copy' | 'cut';
}

/**
 * The parked document of the OTHER split pane (SPEC.md §4 "Split view"). The
 * store's singleton fields always hold the FOCUSED pane; the stash holds the
 * cold pane's full document state, restored wholesale on focus swap. The cold
 * pane renders read-only, so the stash can never drift while parked.
 */
export interface PaneStash {
  project: ProjectFile;
  fileHandle: FileRef | null;
  fileName: string | null;
  selectedId: string | null;
  past: ProjectFile[];
  future: ProjectFile[];
  openTabs: string[];
  /** Scroll offset the pane was at when parked (restored on focus). */
  scrollY: number;
}

export interface SplitState {
  direction: 'row' | 'column';
  /** The FIRST pane's share of the split axis (0.2–0.8); stable across swaps. */
  fraction: number;
  /** Which side the COLD (stashed) pane renders on. */
  stashSide: 'first' | 'second';
  stash: PaneStash;
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
  /** Sync server base URL + shared token (persisted to localStorage). Empty = off. */
  syncUrl: string;
  syncToken: string;
  syncing: boolean;
  /** Last sync result/error message for the Sync panel, or null. */
  syncStatus: string | null;
  /** Monotonic counter bumped on every user edit — drives debounced auto-sync. */
  editRev: number;
  /** UI theme: follow the OS, or force light/dark. Persisted. */
  themeMode: 'system' | 'light' | 'dark';
  setThemeMode: (mode: 'system' | 'light' | 'dark') => void;

  // Split view (two panes; the singleton doc fields are always the focused pane)
  split: SplitState | null;
  /** Open a second pane (moves the nearest other tab there, else starts empty). */
  splitView: (direction: 'row' | 'column') => Promise<void>;
  /** Swap focus to the cold pane (stash <-> singleton). */
  focusOther: () => Promise<void>;
  /** Close the split, folding the cold pane's tabs back into the focused pane. */
  closeSplit: () => void;
  setSplitFraction: (fraction: number) => void;

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
  /** Persist the sync server URL + shared token. */
  setSyncConfig: (url: string, token: string) => void;
  /** Push the current project to the sync server and adopt the merged result. */
  syncNow: () => Promise<void>;
  /** The server's current version (row `updated_at`) for the current project, or null. */
  fetchRemoteVersion: () => Promise<string | null>;
  /** Load the saved sync token from secure storage into state (call on startup). */
  loadSecrets: () => Promise<void>;
  /** List the projects held on the sync server as `{ id, name }`. */
  listServerProjects: () => Promise<Array<{ id: string; name: string }>>;
  /** Pull a server project by id into the current workspace folder and open it. */
  pullProject: (id: string) => Promise<void>;

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
  /** Rename a project: display name AND the .json file on disk (kept in step). */
  renameProjectFile: (fileName: string, newDisplayName: string) => Promise<void>;
  /** Delete a project file from the workspace folder (caller confirms first). */
  deleteProject: (fileName: string) => Promise<void>;
  /** Delete a project row from the sync server. True on success or already-gone. */
  deleteProjectFromServer: (projectId: string) => Promise<boolean>;
  /** Delete a project locally AND from the sync server (caller confirms first). */
  deleteProjectEverywhere: (fileName: string) => Promise<void>;
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

const SYNC_URL_KEY = 'advanced-tasker:syncUrl';
function readLS(key: string): string {
  try {
    return (typeof localStorage !== 'undefined' && localStorage.getItem(key)) || '';
  } catch {
    return '';
  }
}

/** Record deleted node ids on the project so the delete propagates through sync
 *  instead of resurrecting from a device that still has them (SYNC.md "deletes"). */
function recordTombstones(project: ProjectFile, ids: string[]): void {
  if (!ids.length) return;
  const at = nowIso();
  const t = { ...(project.tombstones ?? {}) };
  for (const id of ids) t[id] = at;
  project.tombstones = t;
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
      set({ future: [], editRev: get().editRev + 1 });
      return;
    }
    set({
      past: [...get().past, get().project].slice(-HISTORY_LIMIT),
      future: [],
      editRev: get().editRev + 1,
    });
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

  // --- Server-deleted projects ("delete everywhere" tombstones) ---------------
  // Project ids the server reported deleted (410) this session. Each is prompted
  // about once; afterwards sync for that project stays quiet instead of nagging.
  const serverDeleted = new Set<string>();

  /** React to a 410 from the server: offer local cleanup once, then go quiet. */
  const handleServerDeleted = async (projectId: string) => {
    const alreadyAsked = serverDeleted.has(projectId);
    serverDeleted.add(projectId);
    const { fileName, project } = get();
    if (alreadyAsked || project.id !== projectId || !fileName) {
      set({ syncStatus: 'This project was deleted on the sync server (local-only now).' });
      return;
    }
    const remove =
      typeof window !== 'undefined' &&
      window.confirm(
        `"${project.name}" was deleted from the sync server on another device.\n\nRemove it from this device too? (Cancel keeps it as a local-only copy.)`,
      );
    if (remove) await get().deleteProject(fileName);
    else set({ syncStatus: 'Deleted on server — this copy is now local-only.' });
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
    syncUrl: readLS(SYNC_URL_KEY),
    syncToken: '', // loaded from secure storage via loadSecrets() on startup
    syncing: false,
    syncStatus: null,
    editRev: 0,
    split: null,
    themeMode: (readLS('advanced-tasker:theme') || 'system') as 'system' | 'light' | 'dark',

    setThemeMode: (mode) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('advanced-tasker:theme', mode);
      } catch {
        // ignore storage failures
      }
      set({ themeMode: mode });
    },

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

    setSyncConfig: (url, token) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(SYNC_URL_KEY, url);
      } catch {
        // ignore storage failures
      }
      void storeToken(token); // encrypted via OS keychain (Electron) or localStorage
      set({ syncUrl: url, syncToken: token });
    },

    loadSecrets: async () => {
      const token = await getStoredToken();
      if (token) set({ syncToken: token });
    },

    syncNow: async () => {
      const { syncUrl, syncToken, project: pushed, syncing } = get();
      if (syncing) return; // don't overlap a manual click with an auto-sync
      if (serverDeleted.has(pushed.id)) {
        set({ syncStatus: 'This project was deleted on the sync server (local-only now).' });
        return;
      }
      const base = syncUrl.trim().replace(/\/+$/, '');
      if (!base || !syncToken) {
        set({ syncStatus: 'Set a server URL and token first.' });
        return;
      }
      set({ syncing: true, syncStatus: null });
      try {
        // Push the local project; the server merges it with its copy and returns the
        // result. mergeProjects is symmetric, so this is a full two-way sync.
        const res = await fetch(`${base}/sync/${encodeURIComponent(pushed.id)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${syncToken}` },
          body: JSON.stringify(pushed),
        });
        if (res.status === 410) {
          // "Delete everywhere" on another device tombstoned this project.
          set({ syncing: false });
          await handleServerDeleted(pushed.id);
          return;
        }
        if (!res.ok) {
          const msg =
            res.status === 401 ? 'Unauthorized — check the token.' : `Sync failed (HTTP ${res.status}).`;
          set({ syncing: false, syncStatus: msg });
          return;
        }
        // Normalize through the on-load migration — never adopt a shape the app
        // can't render (e.g. a legacy-format project relayed by the server).
        const merged = parseProject(await res.text());
        const current = get().project;
        // If the user edited locally while the request was in flight, don't clobber
        // those edits — they'll push on the next auto-sync cycle.
        if (current.id !== pushed.id || fingerprint(current) !== fingerprint(pushed)) {
          set({ syncing: false, syncStatus: 'Synced — local edits will sync next.' });
          return;
        }
        // Nothing new came back → leave local state (and undo history) untouched.
        if (fingerprint(merged) === fingerprint(current)) {
          set({ syncing: false, syncStatus: 'Up to date.' });
          return;
        }
        // Remote changes arrived: adopt them, but keep this device's own collapse
        // state (it's device-local, SYNC.md). A remote merge isn't an undoable local
        // step, so reset history rather than record one; keep the bound file and save.
        applyLocalView(merged, current);
        resetHistory();
        const sel = get().selectedId;
        const keepSel = sel && findNode(merged.root.children, sel) ? sel : null;
        set({
          project: merged,
          selectedId: keepSel,
          mode: 'selected',
          dirty: true,
          syncing: false,
          syncStatus: 'Synced — updated from another device.',
        });
        if (get().fileHandle) await get().saveProject();
      } catch (e: any) {
        set({ syncing: false, syncStatus: `Sync error: ${e?.message ?? 'network'}` });
      }
    },

    fetchRemoteVersion: async () => {
      const { syncUrl, syncToken, project } = get();
      const base = syncUrl.trim().replace(/\/+$/, '');
      if (!base || !syncToken) return null;
      try {
        const res = await fetch(`${base}/sync/${encodeURIComponent(project.id)}/version`, {
          headers: { authorization: `Bearer ${syncToken}` },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { version: string | null };
        return typeof data.version === 'string' ? data.version : null;
      } catch {
        return null;
      }
    },

    listServerProjects: async () => {
      const { syncUrl, syncToken } = get();
      const base = syncUrl.trim().replace(/\/+$/, '');
      if (!base || !syncToken) return [];
      const res = await fetch(`${base}/projects`, {
        headers: { authorization: `Bearer ${syncToken}` },
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized' : `HTTP ${res.status}`);
      return (await res.json()) as Array<{ id: string; name: string }>;
    },

    pullProject: async (id) => {
      const { syncUrl, syncToken, workspaceDir, projects } = get();
      const base = syncUrl.trim().replace(/\/+$/, '');
      if (!base || !syncToken) return;
      set({ syncing: true, syncStatus: null });
      try {
        const res = await fetch(`${base}/sync/${encodeURIComponent(id)}`, {
          headers: { authorization: `Bearer ${syncToken}` },
        });
        if (res.status === 410) {
          set({ syncing: false, syncStatus: 'That project was deleted on the server.' });
          return;
        }
        if (!res.ok) {
          set({ syncing: false, syncStatus: `Pull failed (HTTP ${res.status}).` });
          return;
        }
        const project = parseProject(await res.text());
        if (workspaceDir) {
          const fileName = availableFileName(projects, project.name || 'project');
          const ref = await createProjectFile(workspaceDir, fileName, project);
          set({
            projects: [...get().projects, ref].sort((a, b) => a.name.localeCompare(b.name)),
            syncing: false,
            syncStatus: 'Pulled.',
          });
          get().loadProject(project, ref.handle, ref.fileName);
        } else {
          get().loadProject(project, null, null);
          set({ syncing: false, syncStatus: 'Pulled (unsaved — use Save As).' });
        }
      } catch (e: any) {
        set({ syncing: false, syncStatus: `Pull error: ${e?.message ?? 'network'}` });
      }
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
      const { selectedId, project } = get();
      if (!selectedId) return;
      const target = findNode(project.root.children, selectedId);
      const ids: string[] = [];
      if (target) walk([target], (n) => ids.push(n.id));
      let nextSel: string | null = null;
      applyProject((p) => {
        nextSel = deleteNode(p.root.children, selectedId);
        recordTombstones(p, ids);
      });
      set({ selectedId: nextSel, mode: 'selected' });
    },

    backspaceEmpty: () => {
      const { selectedId, project } = get();
      if (!selectedId) return;
      const node = findNode(project.root.children, selectedId);
      if (!node || !isEmpty(node)) return;
      const ids: string[] = [];
      walk([node], (n) => ids.push(n.id));
      let nextSel: string | null = null;
      applyProject((p) => {
        nextSel = deleteNode(p.root.children, selectedId);
        recordTombstones(p, ids);
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
        project.updatedAt = nowIso(); // project-metadata clock for merge (SYNC.md)
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
          const next = dueDate || null;
          if (node.dueDate !== next) node.dueDateUpdatedAt = nowIso(); // per-field clock
          node.dueDate = next;
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
      const ids: string[] = [];
      walk([node], (n) => ids.push(n.id));
      let nextSel: string | null = null;
      applyProject((p) => {
        nextSel = deleteNode(p.root.children, selectedId);
        recordTombstones(p, ids);
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
          n.time = { intervals: [], startedAt: null };
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
        project.updatedAt = new Date(nowMs).toISOString(); // activeTimer is project metadata
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
        // Replaces the interval list with one synthetic run and stamps the
        // effort clock so the correction beats interval-union in merge.
        setEffort(node, seconds, Date.now());
        touch(node);
      }, `effort:${id}`),

    addStatus: () =>
      applyProject((project) => {
        project.statuses.push({
          id: newId(),
          label: 'New status',
          color: '#a855f7',
          kind: DEFAULT_STATUS_KIND,
          updatedAt: nowIso(), // per-status clock for project merge (SYNC.md)
        });
      }),

    updateStatus: (id, patch) =>
      applyProject((project) => {
        const s = project.statuses.find((x) => x.id === id);
        if (s) {
          Object.assign(s, patch);
          s.updatedAt = nowIso(); // bump the per-status merge clock
        }
      }),

    removeStatus: (id) =>
      applyProject((project) => {
        project.statuses = project.statuses.filter((s) => s.id !== id);
        // Record the deletion so it propagates through sync instead of the status
        // reappearing from a device that still has it (SYNC.md "status deletion").
        project.statusTombstones = { ...(project.statusTombstones ?? {}), [id]: nowIso() };
        // Demote any tasks that referenced the removed status back to notes. No
        // per-node stamps here — every peer's merge demotes via the integrity pass,
        // and stamping would let this bulk demotion clobber concurrent node edits.
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
      // Already open in the other split pane? Focus it instead of opening the
      // same file twice (duplicate docs would fight over autosave + row ids).
      if (get().split?.stash.fileName === fileName) {
        await get().focusOther();
        return;
      }
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
        // File name follows the display name (same rule as rename), so the new
        // file is recognizable on disk: Untitled.json, Untitled-2.json, …
        const fileName = availableFileName(projects, 'Untitled');
        const project = createEmptyProject('Untitled');
        const ref = await createProjectFile(workspaceDir, fileName, project);
        set({ projects: [...projects, ref].sort((a, b) => a.name.localeCompare(b.name)) });
        get().loadProject(project, ref.handle, ref.fileName);
        await persistCurrentFolder();
      } catch (e: any) {
        set({ error: e?.message ?? 'Failed to create project.' });
      }
    },

    renameProjectFile: async (fileName, newDisplayName) => {
      const name = newDisplayName.trim();
      if (!name) return;
      const { workspaceDir, projects } = get();
      const ref = projects.find((p) => p.fileName === fileName);
      const isActive = fileName === get().fileName;

      // 1. Display name (the `name` inside the JSON). Active project goes through
      // setProjectName (undoable, bumps the metadata clock, autosaves); another
      // file is read, renamed, stamped, and written back directly.
      if (isActive) {
        get().setProjectName(name);
      } else if (ref) {
        try {
          const proj = await readProjectFromRef(ref);
          proj.name = name;
          proj.updatedAt = nowIso(); // metadata clock so the rename wins in sync
          await saveProjectToHandle(ref.handle, proj);
        } catch (e: any) {
          set({ error: e?.message ?? 'Failed to rename project.' });
          return;
        }
      }

      // 2. The actual file on disk, kept in step with the display name.
      if (!workspaceDir || !ref) {
        // Single-file mode (Open File, no folder): try renaming the bound file
        // in place via handle.move(); harmless no-op where unsupported.
        const handle: any = get().fileHandle;
        if (isActive && handle && typeof handle.move === 'function') {
          const newFileName = availableFileName([], name);
          try {
            await handle.move(newFileName);
            set({
              fileName: newFileName,
              openTabs: get().openTabs.map((t) => (t === fileName ? newFileName : t)),
            });
          } catch {
            // Display name still renamed; the file keeps its old name.
          }
        }
        return;
      }
      const others = projects.filter((p) => p.fileName !== fileName);
      const newFileName = availableFileName(others, name);
      try {
        const newRef = await renameProjectFileOnDisk(
          workspaceDir,
          ref,
          newFileName,
          isActive ? get().project : null,
        );
        set({
          projects: get()
            .projects.map((p) => (p.fileName === fileName ? { ...newRef, name } : p))
            .sort((a, b) => a.name.localeCompare(b.name)),
          openTabs: get().openTabs.map((t) => (t === fileName ? newRef.fileName : t)),
          ...(isActive ? { fileName: newRef.fileName, fileHandle: newRef.handle } : {}),
          folderIndex: get().folderIndex.map((e) =>
            e.fileName === fileName ? { ...e, fileName: newRef.fileName, projectName: name } : e,
          ),
        });
        await persistCurrentFolder();
      } catch (e: any) {
        set({ error: e?.message ?? 'Failed to rename file.' });
      }
    },

    deleteProject: async (fileName) => {
      const { workspaceDir, projects, openTabs, fileName: active } = get();
      if (!workspaceDir) return;
      try {
        await deleteProjectFile(workspaceDir, fileName);
      } catch (e: any) {
        set({ error: e?.message ?? 'Failed to delete project.' });
        return;
      }
      const index = openTabs.indexOf(fileName);
      const remainingTabs = openTabs.filter((t) => t !== fileName);
      set({
        projects: projects.filter((p) => p.fileName !== fileName),
        openTabs: remainingTabs,
        folderIndex: get().folderIndex.filter((e) => e.fileName !== fileName),
      });
      if (fileName === active) {
        // Unbind BEFORE switching so nothing tries to write the deleted file.
        set({ fileHandle: null, fileName: null, dirty: false });
        if (remainingTabs.length) {
          const next = remainingTabs[Math.min(Math.max(index, 0), remainingTabs.length - 1)];
          await get().switchProject(next);
        } else {
          get().newProject();
        }
      }
      await persistCurrentFolder();
    },

    deleteProjectFromServer: async (projectId) => {
      const { syncUrl, syncToken } = get();
      const base = syncUrl.trim().replace(/\/+$/, '');
      if (!base || !syncToken) return false;
      try {
        const res = await fetch(`${base}/sync/${encodeURIComponent(projectId)}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${syncToken}` },
        });
        return res.ok || res.status === 404; // already gone counts as deleted
      } catch {
        return false;
      }
    },

    deleteProjectEverywhere: async (fileName) => {
      // Resolve the project id BEFORE deleting the file (it's the only place the
      // id lives for a non-active project).
      let id: string | null = null;
      if (fileName === get().fileName) {
        id = get().project.id;
      } else {
        const ref = get().projects.find((p) => p.fileName === fileName);
        if (ref) {
          try {
            id = (await readProjectFromRef(ref)).id;
          } catch {
            // unreadable file — still delete locally below; server copy stays
          }
        }
      }
      await get().deleteProject(fileName);
      if (!id) {
        set({ error: 'Deleted locally; could not read the id for the server delete.' });
        return;
      }
      const ok = await get().deleteProjectFromServer(id);
      if (!ok) set({ error: 'Deleted locally; the server delete failed — retry from Sync.' });
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

    // --- Split view (SPEC.md §4): singleton = focused pane, stash = cold pane ---

    splitView: async (direction) => {
      const cur = get().split;
      if (cur) {
        set({ split: { ...cur, direction } }); // already split — just re-orient
        return;
      }
      await saveIfDirty();
      const { openTabs, fileName, projects } = get();
      // Show a DIFFERENT document in the new pane when one is open: move the
      // nearest other tab there; the current doc stays put as the first side.
      const otherFile = openTabs.find((t) => t !== fileName) ?? null;
      const ref = otherFile ? projects.find((p) => p.fileName === otherFile) : undefined;
      const stash: PaneStash = {
        project: get().project,
        fileHandle: get().fileHandle,
        fileName: get().fileName,
        selectedId: get().selectedId,
        past: get().past,
        future: get().future,
        openTabs: openTabs.filter((t) => t !== otherFile),
        scrollY: paneScroll.getLive(),
      };
      let project = createEmptyProject('Untitled');
      let handle: FileRef | null = null;
      if (ref) {
        try {
          project = await readProjectFromRef(ref);
          handle = ref.handle;
        } catch {
          project = createEmptyProject('Untitled'); // unreadable — empty pane
        }
      }
      resetHistory();
      set({
        split: { direction, fraction: 0.5, stashSide: 'first', stash },
        project,
        fileHandle: handle,
        fileName: handle ? otherFile : null,
        selectedId: null,
        mode: 'selected',
        dirty: false,
        openTabs: handle && otherFile ? [otherFile] : [],
      });
      paneScroll.scrollLiveTo(0); // the newly-opened pane starts at the top
    },

    focusOther: async () => {
      const split = get().split;
      if (!split) return;
      await saveIfDirty();
      const stash: PaneStash = {
        project: get().project,
        fileHandle: get().fileHandle,
        fileName: get().fileName,
        selectedId: get().selectedId,
        past: get().past,
        future: get().future,
        openTabs: get().openTabs,
        scrollY: paneScroll.getLive(),
      };
      const s = split.stash;
      // Where the cold pane is CURRENTLY scrolled (the user may have scrolled it
      // while parked) — that's where the swapped-in live pane should land.
      const restoreY = paneScroll.getCold();
      resetHistory(); // clears edit-coalescing trackers; the stacks are restored below
      set({
        project: s.project,
        fileHandle: s.fileHandle,
        fileName: s.fileName,
        selectedId: s.selectedId,
        mode: 'selected',
        dirty: false,
        past: s.past,
        future: s.future,
        openTabs: s.openTabs,
        split: { ...split, stash, stashSide: split.stashSide === 'first' ? 'second' : 'first' },
      });
      paneScroll.scrollLiveTo(restoreY); // after the swapped tree paints
      await persistCurrentFolder();
    },

    closeSplit: () => {
      const split = get().split;
      if (!split) return;
      // Fold the cold pane's tabs back so nothing silently disappears. The stash
      // is save-clean by construction (saved before stashing; cold panes are
      // read-only), so dropping its live state loses nothing.
      const mine = get().openTabs;
      const merged = [...mine, ...split.stash.openTabs.filter((t) => !mine.includes(t))];
      set({ split: null, openTabs: merged });
      void persistCurrentFolder();
    },

    setSplitFraction: (fraction) => {
      const split = get().split;
      if (!split) return;
      set({ split: { ...split, fraction: Math.min(0.8, Math.max(0.2, fraction)) } });
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

// Dev-only escape hatch so browser tooling (and manual debugging) can reach the
// store — e.g. seeding a demo project in a preview. Stripped from prod builds.
if (process.env.NODE_ENV !== 'production' && typeof globalThis !== 'undefined') {
  (globalThis as any).__atStore = useStore;
}
