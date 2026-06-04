import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { OutlineView } from './src/components/OutlineView';
import { ProjectSidebar } from './src/components/ProjectSidebar';
import { WorkspaceBar } from './src/components/WorkspaceBar';
import { DragProvider } from './src/components/DragContext';
import { useAutosave } from './src/hooks/useAutosave';
import { useKeyboardNav } from './src/hooks/useKeyboardNav';
import { useStore } from './src/store/useStore';

export default function App() {
  useKeyboardNav();
  useAutosave();

  // Reopen the last workspace folder if it's still permitted.
  useEffect(() => {
    void useStore.getState().restoreWorkspace();
  }, []);

  return (
    <SafeAreaView style={styles.app}>
      <View style={styles.body}>
        <ProjectSidebar />
        <DragProvider>
          <View style={styles.main}>
            <WorkspaceBar />
            <OutlineView />
          </View>
        </DragProvider>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#ffffff' },
  body: { flex: 1, flexDirection: 'row' },
  main: { flex: 1 },
});
