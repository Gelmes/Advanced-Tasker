import { create } from 'zustand';
import type { Mode, ProjectFile } from '../model/types';
import { createEmptyProject, createSampleProject } from '../model/factory';
import {
  adjacentVisible,
  cloneProject,
  cycleValue,
  deleteNode,
  findNode,
  indent,
  insertSiblingAfter,
  isEmpty,
  moveNodeRelative,
  moveWithinSiblings,
  outdent,
  setCollapsed,
  setContent,
  setStatus,
  setStoryPoints,
  walk,
  type DropWhere,
} from '../model/tree';
import { newId } from '../model/ids';
import { DEFAULT_STATUS_KIND } from '../model/defaults';
import { toggleWrap } from '../markdown/inline';
import { bankTime } from '../model/time';
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

export interface AppState {
  project: ProjectFile;
  selectedId: string | null;
  mode: Mode;

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
  /** File names of projects open as tabs, in tab order. */
  openTabs: string[];
  sidebarOpen: boolean;
  helpOpen: boolean;
  detailsOpen: boolean;

  // Selection / mode
  select: (id: string | null) => void;
  setMode: (mode: Mode) => void;
  moveSelection: (dir: -1 | 1) => void;
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

  // Status configuration (SPEC.md §2 — fully user-configurable)
  addStatus: () => void;
  updateStatus: (id: string, patch: Partial<Omit<StatusDef, 'id'>>) => void;
  removeStatus: (id: string) => void;

  // Files / single project
  newProject: () => void;
  loadProject: (project: ProjectFile, handle: FileRef | null, fileName: string | null) => void;
  openProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;

  setHelpOpen: (open: boolean) => void;
  toggleDetails: () => void;

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
      recordStatusChange(node, before, newStatus);
    });
  };

  /** Update the current folder's entry (last-active project + recency) for reopen. */
  const persistCurrentFolder = async () => {
    const { currentFolderId, workspaceDir, workspaceName, fileName } = get();
    if (!currentFolderId || !workspaceDir) return;
    await putFolder({
      id: currentFolderId,
      name: workspaceName ?? 'Workspace',
      dirHandle: workspaceDir,
      lastActive: fileName,
      lastOpened: Date.now(),
    });
    await get().refreshFolders();
  };

  /** Load a folder's projects and focus its last-active (or first) project. */
  const enterFolder = async (entry: FolderEntry) => {
    const projects = await listProjects(entry.dirHandle);
    set({
      workspaceDir: entry.dirHandle,
      workspaceName: entry.name,
      currentFolderId: entry.id,
      projects,
      sidebarOpen: true,
      error: null,
    });
    const target = projects.find((p) => p.fileName === entry.lastActive) ?? projects[0];
    if (target) await get().switchProject(target.fileName);
    else await persistCurrentFolder();
  };

  /** Save the current project first if it has unsaved changes and a bound file. */
  const saveIfDirty = async () => {
    if (get().dirty && get().fileHandle) await get().saveProject();
  };

  return {
    project: createSampleProject(),
    selectedId: null,
    mode: 'selected',

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
    openTabs: [],
    sidebarOpen: false,
    helpOpen: false,
    detailsOpen: false,

    select: (id) => set({ selectedId: id }),
    setMode: (mode) => set({ mode }),

    moveSelection: (dir) => {
      const { project, selectedId } = get();
      const order = project.root.children;
      if (!selectedId) {
        const first = order[0]?.id ?? null;
        set({ selectedId: first });
        return;
      }
      const next = adjacentVisible(order, selectedId, dir);
      if (next) set({ selectedId: next });
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
        if (node) node.dueDate = dueDate || null;
      }, `due:${id}`),

    moveNode: (dragId, targetId, where) => {
      apply((root) => moveNodeRelative(root, dragId, targetId, where));
      set({ selectedId: dragId });
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
            if (prev) bankTime(prev, nowMs); // only one runs at a time
          }
          target.time.startedAt = new Date(nowMs).toISOString();
          project.activeTimerNodeId = id;
        }
      });
    },

    toggleTimerSelected: () => {
      const { selectedId } = get();
      if (selectedId) get().toggleTimerFor(selectedId);
    },

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
        set({ openTabs: [] }); // tabs are per-folder
        await enterFolder(entry);
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
      if (fileName !== active) return;
      // Closing the active tab: focus a neighbour, or fall back to a blank project.
      if (remaining.length) {
        const next = remaining[Math.min(index, remaining.length - 1)];
        void get().switchProject(next);
      } else {
        get().newProject();
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
      } catch {
        // A failed restore is non-fatal; the user can open a folder manually.
      }
    },
  };
});
