import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';

// Left slideout listing the projects (.json files) in the open workspace folder.
// Click to focus a project; create new ones in the folder. Hidden until toggled.

export function ProjectSidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const workspaceName = useStore((s) => s.workspaceName);
  const projects = useStore((s) => s.projects);
  const activeFile = useStore((s) => s.fileName);

  const openFolder = useStore((s) => s.openFolder);
  const switchProject = useStore((s) => s.switchProject);
  const newProjectInFolder = useStore((s) => s.newProjectInFolder);

  if (!open) return null;

  return (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <Text style={styles.workspace} numberOfLines={1}>
          {workspaceName ?? 'No folder'}
        </Text>
      </View>

      <ScrollView style={styles.list}>
        {projects.length === 0 ? (
          <Text style={styles.empty}>
            {workspaceName ? 'No projects yet.' : 'Open a folder to see its projects.'}
          </Text>
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

      <View style={styles.footer}>
        {workspaceName ? (
          <Pressable style={styles.action} onPress={() => void newProjectInFolder()}>
            <Text style={styles.actionText}>+ New project</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.action} onPress={() => void openFolder()}>
            <Text style={styles.actionText}>Open folder…</Text>
          </Pressable>
        )}
      </View>
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
  header: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  workspace: { fontSize: 13, fontWeight: '600', color: '#374151' },
  list: { flex: 1 },
  empty: { padding: 12, fontSize: 12, color: '#9ca3af' },
  item: { paddingHorizontal: 12, paddingVertical: 8 },
  itemActive: { backgroundColor: '#e0e7ff' },
  itemPressed: { backgroundColor: '#e5e7eb' },
  itemText: { fontSize: 13, color: '#374151' },
  itemTextActive: { color: '#3730a3', fontWeight: '600' },
  footer: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
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
