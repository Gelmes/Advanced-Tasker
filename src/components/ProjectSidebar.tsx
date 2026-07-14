import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  flattenForIndex,
  highlightMatches,
  searchIndex,
  tagCountsFromEntries,
} from '../model/searchIndex';
import { useStore } from '../store/useStore';
import { color, font, radius } from '../theme';
import { ContextMenu, MouseArea, type MenuEntry } from './ContextMenu';

// Left slideout: remembered workspace folders (switch / forget), and a tabbed
// view for the current folder — Projects (.json files) or Search (text + #tags).
// Project rows: click to open, double-click or right-click → Rename (renames the
// file on disk too), right-click → Delete (confirms; removes the .json).

export function ProjectSidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const folders = useStore((s) => s.folders);
  const currentFolderId = useStore((s) => s.currentFolderId);
  const workspaceName = useStore((s) => s.workspaceName);
  const projects = useStore((s) => s.projects);
  const activeFile = useStore((s) => s.fileName);
  const tab = useStore((s) => s.sidebarTab);
  const tagQuery = useStore((s) => s.tagQuery);
  const project = useStore((s) => s.project);
  const folderIndex = useStore((s) => s.folderIndex);
  const indexing = useStore((s) => s.indexing);

  const openFolder = useStore((s) => s.openFolder);
  const switchFolder = useStore((s) => s.switchFolder);
  const forgetFolder = useStore((s) => s.forgetFolder);
  const switchProject = useStore((s) => s.switchProject);
  const newProjectInFolder = useStore((s) => s.newProjectInFolder);
  const renameProjectFile = useStore((s) => s.renameProjectFile);
  const deleteProject = useStore((s) => s.deleteProject);
  const deleteProjectEverywhere = useStore((s) => s.deleteProjectEverywhere);
  const syncConfigured = useStore((s) => !!s.syncUrl && !!s.syncToken);
  const setSidebarTab = useStore((s) => s.setSidebarTab);
  const setTagQuery = useStore((s) => s.setTagQuery);
  const openSearchResult = useStore((s) => s.openSearchResult);

  /** Right-click menu state: a project row's menu, or the panel background's. */
  type MenuState = { x: number; y: number } & (
    | { kind: 'project'; file: string; name: string }
    | { kind: 'panel' }
  );
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<{ file: string; draft: string } | null>(null);

  const commitRename = () => {
    if (renaming && renaming.draft.trim()) {
      void renameProjectFile(renaming.file, renaming.draft);
    }
    setRenaming(null);
  };

  const confirmDeleteLocal = (file: string, name: string) => {
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        `Remove "${name}" from this device?\n\nThis deletes ${file} from the folder. The sync server's copy is kept.`,
      );
    if (ok) void deleteProject(file);
  };

  const confirmDeleteEverywhere = (file: string, name: string) => {
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        `Delete "${name}" everywhere?\n\nThis deletes ${file} from the folder and marks the project deleted on the sync server. Other devices are offered a local cleanup on their next sync.`,
      );
    if (ok) void deleteProjectEverywhere(file);
  };

  const menuItems: MenuEntry[] = !menu
    ? []
    : menu.kind === 'panel'
      ? [{ label: 'New project', onPress: () => void newProjectInFolder() }]
      : [
          { label: 'Rename', onPress: () => setRenaming({ file: menu.file, draft: menu.name }) },
          'divider',
          {
            label: syncConfigured ? 'Remove from this device…' : 'Delete…',
            danger: true,
            onPress: () => confirmDeleteLocal(menu.file, menu.name),
          },
          ...(syncConfigured
            ? [
                {
                  label: 'Delete everywhere…',
                  danger: true,
                  onPress: () => confirmDeleteEverywhere(menu.file, menu.name),
                },
              ]
            : []),
        ];

  // Cross-file: index entries for other files + the current file live from memory.
  const entries = useMemo(
    () => [
      ...folderIndex.filter((e) => e.fileName !== activeFile),
      ...flattenForIndex(project.root.children, activeFile ?? '', project.name),
    ],
    [folderIndex, activeFile, project],
  );
  const tags = tagCountsFromEntries(entries);
  const results = searchIndex(entries, tagQuery);

  if (!open) return null;

  return (
    <View style={styles.sidebar}>
      <MouseArea
        onContextMenu={(x, y) => setMenu({ kind: 'panel', x, y })}
        // alignItems must beat MouseArea's row default ('center'), which in a
        // column layout stops cross-axis stretch and shrinks children to content
        // width — the sidebar's rows would float centered with big side margins.
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', flex: 1, minHeight: 0 }}
      >
      <ScrollView style={styles.scroll}>
        {/* Folders */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Folders</Text>
          <Pressable onPress={() => void openFolder()} hitSlop={6}>
            <Text style={styles.add}>+ Open</Text>
          </Pressable>
        </View>
        {folders.length === 0 ? (
          <Text style={styles.empty}>No folders yet.</Text>
        ) : (
          folders.map((f) => {
            const isCurrent = f.id === currentFolderId;
            return (
              <View key={f.id} style={[styles.folderRow, isCurrent && styles.itemActive]}>
                <Pressable style={styles.folderPress} onPress={() => void switchFolder(f.id)}>
                  <Text style={styles.folderIcon}>{isCurrent ? '📂' : '📁'}</Text>
                  <Text
                    style={[styles.itemText, isCurrent && styles.itemTextActive]}
                    numberOfLines={1}
                  >
                    {f.name}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void forgetFolder(f.id)} hitSlop={6}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
            );
          })
        )}

        <View style={styles.divider} />

        {/* Projects | Search | ★ toggle */}
        <View style={styles.tabs}>
          {(['projects', 'search', 'bookmarks'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setSidebarTab(t)}
              style={[styles.tab, t === 'bookmarks' && styles.tabStar, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'projects' ? 'Projects' : t === 'search' ? 'Search' : '★'}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'projects' ? (
          !workspaceName ? (
            <Text style={styles.empty}>Open a folder to see its projects.</Text>
          ) : projects.length === 0 ? (
            <Text style={styles.empty}>No projects yet.</Text>
          ) : (
            projects.map((p) => {
              const isActive = p.fileName === activeFile;
              if (renaming?.file === p.fileName) {
                return (
                  <View key={p.fileName} style={[styles.item, styles.itemActive]}>
                    <TextInput
                      style={styles.renameInput}
                      value={renaming.draft}
                      onChangeText={(draft) => setRenaming({ file: p.fileName, draft })}
                      onBlur={commitRename}
                      onSubmitEditing={commitRename}
                      autoFocus
                      selectTextOnFocus
                    />
                  </View>
                );
              }
              return (
                <MouseArea
                  key={p.fileName}
                  onDoubleClick={() => setRenaming({ file: p.fileName, draft: p.name })}
                  onContextMenu={(x, y) =>
                    setMenu({ kind: 'project', file: p.fileName, name: p.name, x, y })
                  }
                >
                  <Pressable
                    onPress={() => void switchProject(p.fileName)}
                    style={({ pressed, hovered }: any) => [
                      styles.item,
                      styles.itemGrow,
                      hovered && !isActive && styles.itemHover,
                      isActive && styles.itemActive,
                      pressed && styles.itemPressed,
                    ]}
                  >
                    <Text
                      style={[styles.itemText, isActive && styles.itemTextActive]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                  </Pressable>
                </MouseArea>
              );
            })
          )
        ) : tab === 'bookmarks' ? (
          <View>
            {(() => {
              const marks = entries.filter((e) => e.bookmarked);
              if (!marks.length) {
                return (
                  <Text style={styles.empty}>
                    No bookmarks yet — select a task and press B (or click its ★).
                  </Text>
                );
              }
              return marks.map((m) => {
                const otherFile = !!m.fileName && m.fileName !== activeFile;
                const sub = [otherFile ? `📄 ${m.projectName}` : '', m.breadcrumb]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={`${m.fileName}:${m.id}`}
                    onPress={() => void openSearchResult(m.fileName, m.id)}
                    style={({ pressed, hovered }: any) => [
                      styles.result,
                      hovered && styles.itemHover,
                      pressed && styles.itemPressed,
                    ]}
                  >
                    <Text style={styles.resultText} numberOfLines={1}>
                      <Text style={styles.starMark}>★ </Text>
                      {m.content || 'Untitled'}
                    </Text>
                    {sub ? (
                      <Text style={styles.resultCrumb} numberOfLines={1}>
                        {sub}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              });
            })()}
          </View>
        ) : (
          <View>
            <TextInput
              style={styles.search}
              value={tagQuery}
              onChangeText={setTagQuery}
              placeholder="Search text or #tag"
              autoCapitalize="none"
            />

            {tags.length > 0 && (
              <View style={styles.chips}>
                {tags.map((t) => (
                  <Pressable
                    key={t.tag}
                    onPress={() => setTagQuery(`#${t.tag}`)}
                    style={[styles.chip, tagQuery.toLowerCase() === `#${t.tag}` && styles.chipActive]}
                  >
                    <Text style={styles.chipText}>
                      #{t.tag} <Text style={styles.chipCount}>{t.count}</Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {indexing && <Text style={styles.empty}>Indexing folder…</Text>}

            {tagQuery.trim() === '' ? (
              <Text style={styles.empty}>Search this folder, or pick a tag.</Text>
            ) : results.length === 0 ? (
              <Text style={styles.empty}>No matches.</Text>
            ) : (
              results.map((m) => {
                const otherFile = !!m.fileName && m.fileName !== activeFile;
                const sub = [otherFile ? `📄 ${m.projectName}` : '', m.breadcrumb]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Pressable
                    key={`${m.fileName}:${m.id}`}
                    onPress={() => void openSearchResult(m.fileName, m.id)}
                    style={({ pressed }) => [styles.result, pressed && styles.itemPressed]}
                  >
                    <Text style={styles.resultText} numberOfLines={1}>
                      {highlightMatches(m.content || 'Untitled', tagQuery).map((s, i) =>
                        s.hit ? (
                          <Text key={i} style={styles.hit}>
                            {s.text}
                          </Text>
                        ) : (
                          <Text key={i}>{s.text}</Text>
                        ),
                      )}
                    </Text>
                    {sub ? (
                      <Text style={styles.resultCrumb} numberOfLines={1}>
                        {sub}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
      </MouseArea>

      {tab === 'projects' && workspaceName && (
        <View style={styles.footer}>
          <Pressable style={styles.action} onPress={() => void newProjectInFolder()}>
            <Text style={styles.actionText}>+ New project</Text>
          </Pressable>
        </View>
      )}

      <ContextMenu
        at={menu ? { x: menu.x, y: menu.y } : null}
        items={menuItems}
        onClose={() => setMenu(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 240,
    backgroundColor: color.surfaceAlt,
    borderRightWidth: 1,
    borderRightColor: color.border,
  },
  scroll: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: font.xs,
    fontWeight: '700',
    color: color.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  add: { fontSize: font.sm, color: color.accent, fontWeight: '600' },
  empty: { paddingHorizontal: 12, paddingVertical: 6, fontSize: font.sm, color: color.inkSoft },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 6,
    borderRadius: radius.sm,
  },
  folderPress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderIcon: { fontSize: 13 },
  remove: { fontSize: font.xs, color: color.inkSoft },
  divider: { height: 1, backgroundColor: color.border, marginVertical: 8 },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  tab: { flex: 1, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: color.hover },
  tabStar: { flex: 0, paddingHorizontal: 10 },
  starMark: { color: color.warn },
  tabActive: { backgroundColor: color.accentSoft },
  tabText: { fontSize: font.sm, color: color.inkMid, textAlign: 'center' },
  tabTextActive: { color: color.accentInk, fontWeight: '600' },
  item: {
    marginHorizontal: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: radius.sm,
  },
  itemGrow: { flexGrow: 1, minWidth: 0 },
  renameInput: {
    fontSize: font.md,
    color: color.ink,
    fontWeight: '600',
    padding: 0,
    outlineWidth: 0,
  } as any,
  itemHover: { backgroundColor: color.hover },
  itemActive: { backgroundColor: color.accentSoft },
  itemPressed: { backgroundColor: color.hover },
  itemText: { fontSize: font.md, color: color.inkMid, flexShrink: 1 },
  itemTextActive: { color: color.accentInk, fontWeight: '600' },
  search: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.appBg,
    fontSize: 13,
    color: color.ink,
    outlineWidth: 0,
  } as any,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: color.tagBg,
  },
  chipActive: { backgroundColor: color.tagBgActive, borderWidth: 1, borderColor: color.tagBorder },
  chipText: { fontSize: font.sm, color: color.tagInk },
  chipCount: { color: color.inkSoft, fontVariant: ['tabular-nums'] },
  result: { paddingHorizontal: 12, paddingVertical: 6 },
  resultText: { fontSize: font.md, color: color.inkMid },
  hit: { backgroundColor: color.hit, color: color.hitInk, fontWeight: '600' },
  resultCrumb: { fontSize: font.xs, color: color.inkSoft, marginTop: 1 },
  footer: { padding: 8, borderTopWidth: 1, borderTopColor: color.border },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: color.appBg,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  actionText: { fontSize: font.md, color: color.inkMid, textAlign: 'center', fontWeight: '600' },
});
