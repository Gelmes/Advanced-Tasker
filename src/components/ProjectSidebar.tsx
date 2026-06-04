import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';

// Left slideout: remembered workspace folders (switch / forget) and the projects
// (.json files) in the current folder. Hidden until toggled.

export function ProjectSidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const folders = useStore((s) => s.folders);
  const currentFolderId = useStore((s) => s.currentFolderId);
  const workspaceName = useStore((s) => s.workspaceName);
  const projects = useStore((s) => s.projects);
  const activeFile = useStore((s) => s.fileName);

  const openFolder = useStore((s) => s.openFolder);
  const switchFolder = useStore((s) => s.switchFolder);
  const forgetFolder = useStore((s) => s.forgetFolder);
  const switchProject = useStore((s) => s.switchProject);
  const newProjectInFolder = useStore((s) => s.newProjectInFolder);

  if (!open) return null;

  return (
    <View style={styles.sidebar}>
      <ScrollView style={styles.scroll}>
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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {workspaceName ? `Projects · ${workspaceName}` : 'Projects'}
          </Text>
        </View>

        {!workspaceName ? (
          <Text style={styles.empty}>Open a folder to see its projects.</Text>
        ) : projects.length === 0 ? (
          <Text style={styles.empty}>No projects yet.</Text>
        ) : (
          projects.map((p) => {
            const isActive = p.fileName === activeFile;
            return (
              <Pressable
                key={p.fileName}
                onPress={() => void switchProject(p.fileName)}
                style={({ pressed }) => [
                  styles.item,
                  isActive && styles.itemActive,
                  pressed && styles.itemPressed,
                ]}
              >
                <Text style={[styles.itemText, isActive && styles.itemTextActive]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {workspaceName && (
        <View style={styles.footer}>
          <Pressable style={styles.action} onPress={() => void newProjectInFolder()}>
            <Text style={styles.actionText}>+ New project</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 230,
    backgroundColor: '#f3f4f6',
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  scroll: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  add: { fontSize: 12, color: '#3730a3' },
  empty: { paddingHorizontal: 12, paddingVertical: 4, fontSize: 12, color: '#9ca3af' },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  folderPress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  folderIcon: { fontSize: 13 },
  remove: { fontSize: 11, color: '#9ca3af' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 6 },
  item: { paddingHorizontal: 12, paddingVertical: 8 },
  itemActive: { backgroundColor: '#e0e7ff' },
  itemPressed: { backgroundColor: '#e5e7eb' },
  itemText: { fontSize: 13, color: '#374151', flexShrink: 1 },
  itemTextActive: { color: '#3730a3', fontWeight: '600' },
  footer: { padding: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  action: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  actionText: { fontSize: 13, color: '#374151', textAlign: 'center' },
});
