import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, SafeAreaView, StyleSheet, View } from 'react-native';
import { OutlineView } from './src/components/OutlineView';
import { ProjectSidebar } from './src/components/ProjectSidebar';
import { TabBar } from './src/components/TabBar';
import { TaskDetails } from './src/components/TaskDetails';
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

  // The app shows its own selection (the row box-shadow), so suppress the browser's
  // focus outline that otherwise sticks on the last-clicked row as you navigate.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = ':focus, :focus-visible { outline: none !important; }';
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <SafeAreaView style={styles.app}>
      <View style={styles.body}>
        <ProjectSidebar />
        <DragProvider>
          <View style={styles.main}>
            <WorkspaceBar />
            <TabBar />
            <OutlineView />
          </View>
        </DragProvider>
        <TaskDetails />
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
