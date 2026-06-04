import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNow } from '../hooks/useNow';
import { useStore } from '../store/useStore';
import { NodeRow } from './NodeRow';

/** The main outline: the recursive node tree (title lives in the tab bar). */
export function OutlineView() {
  const project = useStore((s) => s.project);
  const nowMs = useNow();

  return (
    <View style={styles.container}>
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
