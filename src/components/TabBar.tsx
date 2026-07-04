import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../store/useStore';
import { ContextMenu, MouseArea, type MenuEntry } from './ContextMenu';

// Tabs for the open projects. Click an inactive tab to switch; double-click a tab
// to rename it inline (this renames the display name AND the .json file on disk);
// right-click for Rename / Close; ✕ closes. The active tab's title tracks the live
// project name so edits show immediately.

export function TabBar() {
  const openTabs = useStore((s) => s.openTabs);
  const projects = useStore((s) => s.projects);
  const activeFile = useStore((s) => s.fileName);
  const activeName = useStore((s) => s.project.name);
  const switchProject = useStore((s) => s.switchProject);
  const closeTab = useStore((s) => s.closeTab);
  const renameProjectFile = useStore((s) => s.renameProjectFile);

  /** File name of the tab being renamed inline, plus the draft text. */
  const [renaming, setRenaming] = useState<{ file: string; draft: string } | null>(null);
  const [menu, setMenu] = useState<{ file: string; x: number; y: number } | null>(null);

  // Drop out of rename mode whenever the active project changes underneath us.
  useEffect(() => setRenaming(null), [activeFile]);

  if (openTabs.length === 0) return null;

  const titleFor = (fileName: string) =>
    fileName === activeFile
      ? activeName || 'Untitled'
      : projects.find((p) => p.fileName === fileName)?.name || fileName;

  const startRename = (file: string) => setRenaming({ file, draft: titleFor(file) });
  const commitRename = () => {
    if (renaming && renaming.draft.trim()) {
      void renameProjectFile(renaming.file, renaming.draft);
    }
    setRenaming(null);
  };

  const menuItems: MenuEntry[] = menu
    ? [
        { label: 'Rename', onPress: () => startRename(menu.file) },
        'divider',
        { label: 'Close', onPress: () => closeTab(menu.file) },
      ]
    : [];

  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {openTabs.map((fileName) => {
          const isActive = fileName === activeFile;
          return (
            <View key={fileName} style={[styles.tab, isActive && styles.tabActive]}>
              {renaming?.file === fileName ? (
                <TextInput
                  style={styles.tabInput}
                  value={renaming.draft}
                  onChangeText={(draft) => setRenaming({ file: fileName, draft })}
                  onBlur={commitRename}
                  onSubmitEditing={commitRename}
                  autoFocus
                  selectTextOnFocus
                />
              ) : (
                <MouseArea
                  onDoubleClick={() => startRename(fileName)}
                  onContextMenu={(x, y) => setMenu({ file: fileName, x, y })}
                >
                  <Pressable onPress={() => (isActive ? undefined : void switchProject(fileName))}>
                    <Text
                      style={[styles.tabText, isActive && styles.tabTextActive]}
                      numberOfLines={1}
                    >
                      {titleFor(fileName)}
                    </Text>
                  </Pressable>
                </MouseArea>
              )}
              <Pressable onPress={() => closeTab(fileName)} hitSlop={6} style={styles.close}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <ContextMenu
        at={menu ? { x: menu.x, y: menu.y } : null}
        items={menuItems}
        onClose={() => setMenu(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    maxWidth: 220,
  },
  tabActive: { backgroundColor: '#ffffff' },
  tabText: { fontSize: 13, color: '#6b7280' },
  tabTextActive: { color: '#111827', fontWeight: '600' },
  tabInput: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    minWidth: 80,
    padding: 0,
    outlineWidth: 0,
  } as any,
  close: { paddingHorizontal: 2 },
  closeText: { fontSize: 11, color: '#9ca3af' },
});
