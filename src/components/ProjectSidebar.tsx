import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { collectTags, searchNodes } from '../model/tags';
import { useStore } from '../store/useStore';

// Left slideout: remembered workspace folders (switch / forget), and a tabbed
// view for the current folder — Projects (.json files) or Search (text + #tags).

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

  const openFolder = useStore((s) => s.openFolder);
  const switchFolder = useStore((s) => s.switchFolder);
  const forgetFolder = useStore((s) => s.forgetFolder);
  const switchProject = useStore((s) => s.switchProject);
  const newProjectInFolder = useStore((s) => s.newProjectInFolder);
  const setSidebarTab = useStore((s) => s.setSidebarTab);
  const setTagQuery = useStore((s) => s.setTagQuery);
  const revealNode = useStore((s) => s.revealNode);

  if (!open) return null;

  const tags = collectTags(project.root.children);
  const results = searchNodes(project.root.children, tagQuery);

  return (
    <View style={styles.sidebar}>
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

        {/* Projects | Search toggle */}
        <View style={styles.tabs}>
          {(['projects', 'search'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setSidebarTab(t)}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'projects' ? 'Projects' : 'Search'}
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
                  <Text
                    style={[styles.itemText, isActive && styles.itemTextActive]}
                    numberOfLines={1}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              );
            })
          )
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

            {tagQuery.trim() === '' ? (
              <Text style={styles.empty}>Type to search this project, or pick a tag.</Text>
            ) : results.length === 0 ? (
              <Text style={styles.empty}>No matches.</Text>
            ) : (
              results.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => revealNode(m.id)}
                  style={({ pressed }) => [styles.result, pressed && styles.itemPressed]}
                >
                  <Text style={styles.resultText} numberOfLines={1}>
                    {m.content || 'Untitled'}
                  </Text>
                  {m.breadcrumb ? (
                    <Text style={styles.resultCrumb} numberOfLines={1}>
                      {m.breadcrumb}
                    </Text>
                  ) : null}
                </Pressable>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {tab === 'projects' && workspaceName && (
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
    width: 240,
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
  empty: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 12, color: '#9ca3af' },
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
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  tab: { flex: 1, paddingVertical: 5, borderRadius: 6, backgroundColor: '#e5e7eb' },
  tabActive: { backgroundColor: '#e0e7ff' },
  tabText: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  tabTextActive: { color: '#3730a3', fontWeight: '600' },
  item: { paddingHorizontal: 12, paddingVertical: 8 },
  itemActive: { backgroundColor: '#e0e7ff' },
  itemPressed: { backgroundColor: '#e5e7eb' },
  itemText: { fontSize: 13, color: '#374151', flexShrink: 1 },
  itemTextActive: { color: '#3730a3', fontWeight: '600' },
  search: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    fontSize: 13,
    outlineWidth: 0,
  } as any,
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#ede9fe',
  },
  chipActive: { backgroundColor: '#ddd6fe', borderWidth: 1, borderColor: '#7c3aed' },
  chipText: { fontSize: 12, color: '#6d28d9' },
  chipCount: { color: '#a78bfa', fontVariant: ['tabular-nums'] },
  result: { paddingHorizontal: 12, paddingVertical: 6 },
  resultText: { fontSize: 13, color: '#374151' },
  resultCrumb: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
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
