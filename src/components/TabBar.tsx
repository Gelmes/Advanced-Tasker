import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../store/useStore';
import { color, font } from '../theme';
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
  const dirty = useStore((s) => s.dirty);
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
                  <Pressable
                    onPress={() => (isActive ? undefined : void switchProject(fileName))}
                    style={({ hovered }: any) => [
                      styles.tabPress,
                      hovered && !isActive && styles.tabHover,
                    ]}
                  >
                    <Text
                      style={[styles.tabText, isActive && styles.tabTextActive]}
                      numberOfLines={1}
                    >
                      {titleFor(fileName)}
                    </Text>
                  </Pressable>
                </MouseArea>
              )}
              {isActive && dirty ? <View style={styles.dirtyDot} /> : null}
              <Pressable
                onPress={() => closeTab(fileName)}
                hitSlop={6}
                style={({ hovered }: any) => [styles.close, hovered && styles.closeHover]}
              >
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
    borderBottomColor: color.border,
    backgroundColor: color.surfaceAlt,
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRightWidth: 1,
    borderRightColor: color.border,
    // Editor-style active indicator: a 2px accent line along the bottom edge.
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1, // sit on top of the bar's bottom border
    maxWidth: 220,
  },
  tabActive: {
    backgroundColor: color.appBg,
    borderBottomColor: color.accent,
  },
  tabPress: { borderRadius: 4, marginHorizontal: -4, paddingHorizontal: 4 },
  tabHover: { backgroundColor: color.hover },
  tabText: { fontSize: font.md, color: color.inkSoft },
  tabTextActive: { color: color.ink, fontWeight: '600' },
  dirtyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.warn,
  },
  tabInput: {
    fontSize: font.md,
    fontWeight: '600',
    color: color.ink,
    minWidth: 80,
    padding: 0,
    outlineWidth: 0,
  } as any,
  close: { paddingHorizontal: 3, paddingVertical: 1, borderRadius: 4 },
  closeHover: { backgroundColor: color.hover },
  closeText: { fontSize: font.xs, color: color.inkSoft },
});
