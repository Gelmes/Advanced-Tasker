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
  getWorkspace,
  hasPermission,
  putWorkspace,
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

  // Workspace: a folder of .json projects (SPEC.md §5)
  workspaceDir: FileRef | null;
  workspaceName: string | null;
  projects: ProjectRef[];
  /** File names of projects open as tabs, in tab order. */
  openTabs: string[];
  sidebarOpen: boolean;
  helpOpen: boolean;

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
  moveNode: (dragId: string, targetId: string, where: DropWhere) => void;

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

  // Workspace (folder) actions
  toggleSidebar: () => void;
  openFolder: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  switchProject: (fileName: string) => Promise<void>;
  newProjectInFolder: () => Promise<void>;
  closeTab: (fileName: string) => void;
  restoreWorkspace: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => {
  /** Clone the project, run a mutation on its root children, commit + mark dirty. */
  const apply = (fn: (root: ProjectFile['root']['children']) => void) => {
    const next = cloneProject(get().project);
    fn(next.root.children);
    set({ project: next, dirty: true });
  };

  /** Like `apply` but for edits that touch the project itself (e.g. statuses). */
  const applyProject = (fn: (project: ProjectFile) => void) => {
    const next = cloneProject(get().project);
    fn(next);
    set({ project: next, dirty: true });
  };

  /** Persist the workspace pointer (folder + last-open project) for reopen. */
  const persistWorkspace = async () => {
    const { workspaceDir, fileName } = get();
    if (workspaceDir) await putWorkspace(workspaceDir, fileName);
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

    workspaceDir: null,
    workspaceName: null,
    projects: [],
    openTabs: [],
    sidebarOpen: false,
    helpOpen: false,

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
      apply((root) => setCollapsed(root, selectedId, collapsed));
    },

    toggleCollapseFor: (id) => {
      const node = findNode(get().project.root.children, id);
      if (!node) return;
      apply((root) => setCollapsed(root, id, !node.collapsed));
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

    setNodeContent: (id, content) => apply((root) => setContent(root, id, content)),

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
      });
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
      apply((root) => setStatus(root, id, next));
    },

    cycleStatusSelected: (dir = 1) => {
      const { selectedId } = get();
      if (selectedId) get().cycleStatusFor(selectedId, dir);
    },

    setStatusFor: (id, status) => apply((root) => setStatus(root, id, status)),

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

    toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

    openFolder: async () => {
      try {
        await saveIfDirty();
        const dir = await pickDirectory();
        const projects = await listProjects(dir);
        set({
          workspaceDir: dir,
          workspaceName: dir.name ?? 'Workspace',
          projects,
          sidebarOpen: true,
          error: null,
        });
        await putWorkspace(dir, null);
        if (projects.length) await get().switchProject(projects[0].fileName);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        set({ error: e?.message ?? 'Failed to open folder.' });
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
        await persistWorkspace();
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
        await persistWorkspace();
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
        const ws = await getWorkspace();
        // Auto-restore silently — never prompt for permission on startup.
        if (!ws?.dirHandle || !(await hasPermission(ws.dirHandle))) return;
        const projects = await listProjects(ws.dirHandle);
        set({
          workspaceDir: ws.dirHandle,
          workspaceName: ws.dirHandle.name ?? 'Workspace',
          projects,
          sidebarOpen: true,
        });
        const target =
          projects.find((p) => p.fileName === ws.lastActive) ?? projects[0];
        if (target) await get().switchProject(target.fileName);
      } catch {
        // A failed restore is non-fatal; the user can open the folder manually.
      }
    },
  };
});
