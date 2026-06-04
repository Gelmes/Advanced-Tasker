import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from '../store/useStore';

// Tabs for the open projects. Click an inactive tab to switch to it; click the
// active tab to rename it inline; ✕ closes a tab. The active tab's title tracks
// the live project name so edits show immediately.

export function TabBar() {
  const openTabs = useStore((s) => s.openTabs);
  const projects = useStore((s) => s.projects);
  const activeFile = useStore((s) => s.fileName);
  const activeName = useStore((s) => s.project.name);
  const switchProject = useStore((s) => s.switchProject);
  const closeTab = useStore((s) => s.closeTab);
  const setProjectName = useStore((s) => s.setProjectName);

  const [editing, setEditing] = useState(false);
  // Drop out of rename mode whenever the active project changes.
  useEffect(() => setEditing(false), [activeFile]);

  if (openTabs.length === 0) return null;

  const titleFor = (fileName: string) =>
    fileName === activeFile
      ? activeName || 'Untitled'
      : projects.find((p) => p.fileName === fileName)?.name || fileName;

  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {openTabs.map((fileName) => {
          const isActive = fileName === activeFile;
          return (
            <View key={fileName} style={[styles.tab, isActive && styles.tabActive]}>
              {isActive && editing ? (
                <TextInput
                  style={styles.tabInput}
                  value={activeName}
                  onChangeText={setProjectName}
                  onBlur={() => setEditing(false)}
                  onSubmitEditing={() => setEditing(false)}
                  autoFocus
                  selectTextOnFocus
                />
              ) : (
                <Pressable
                  onPress={() => (isActive ? setEditing(true) : void switchProject(fileName))}
                >
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]} numberOfLines={1}>
                    {titleFor(fileName)}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={() => closeTab(fileName)} hitSlop={6} style={styles.close}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
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
