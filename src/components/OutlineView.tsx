import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNow } from '../hooks/useNow';
import { useStore } from '../store/useStore';
import { NodeRow } from './NodeRow';

/** The main outline: editable project title + the recursive node tree. */
export function OutlineView() {
  const project = useStore((s) => s.project);
  const fileName = useStore((s) => s.fileName);
  const setProjectName = useStore((s) => s.setProjectName);
  const nowMs = useNow();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TextInput
          style={styles.title}
          value={project.name}
          onChangeText={setProjectName}
          placeholder="Untitled project"
          selectTextOnFocus
        />
        {fileName && (
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
        )}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {project.root.children.length === 0 ? (
          <Text style={styles.empty}>No tasks yet.</Text>
        ) : (
          project.root.children.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              depth={0}
              statuses={project.statuses}
              nowMs={nowMs}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    padding: 0,
    outlineWidth: 0,
  } as any,
  fileName: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  empty: {
    padding: 16,
    color: '#9ca3af',
  },
});
